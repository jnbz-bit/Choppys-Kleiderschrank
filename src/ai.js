// Client für die KI-Aufbereitung (/api/aufbereiten, Vercel-Funktion mit Gemini).
import { loadBitmap, canvasFrom, toBlob, removeBg, trimCanvas } from './imaging.js';

const ENDPOINT = '/api/aufbereiten';
let availability = null;

/** Ist die KI eingerichtet? (einmal pro App-Start gefragt) */
export function aiAvailable() {
  if (!availability) {
    availability = fetch(ENDPOINT, { method: 'GET', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((j) => !!j.enabled)
      .catch(() => false);
    availability.then((ok) => { if (!ok) setTimeout(() => { availability = null; }, 60000); });
  }
  return availability;
}

async function toBase64Jpeg(canvas, maxSide, quality = 0.85) {
  const s = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
  const c = document.createElement('canvas');
  c.width = Math.round(canvas.width * s);
  c.height = Math.round(canvas.height * s);
  const cx = c.getContext('2d');
  cx.fillStyle = '#fff';
  cx.fillRect(0, 0, c.width, c.height);
  cx.drawImage(canvas, 0, 0, c.width, c.height);
  const blob = await toBlob(c, 'image/jpeg', quality);
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

/**
 * Teil per KI zu einem sauberen Produktfoto aufbereiten und anschließend auf dem Gerät freistellen.
 * @param {File|Blob} file Originalfoto
 * @param {HTMLCanvasElement} cutout grober Ausschnitt des gewählten Teils (zeigt der KI, welches Teil gemeint ist)
 * @returns {Promise<HTMLCanvasElement>} freigestelltes, zugeschnittenes Teil
 */
export async function enhanceWithAI(file, cutout, { cat, colorName, worn, signal, onPhase } = {}) {
  onPhase?.('upload');
  const photoCanvas = canvasFrom(await loadBitmap(file), 1280);
  const body = {
    photo: await toBase64Jpeg(photoCanvas, 1280),
    cutout: cutout ? await toBase64Jpeg(cutout, 768) : undefined,
    cat, color: colorName, worn: !!worn
  };
  onPhase?.('ai');
  const r = await fetch(ENDPOINT, {
    method: 'POST', signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok || !json.image) throw new Error(json.error || 'Die KI hat gerade nicht geantwortet.');
  const bytes = Uint8Array.from(atob(json.image), (ch) => ch.charCodeAt(0));
  const blob = new Blob([bytes], { type: json.mime || 'image/png' });

  onPhase?.('cut');
  const cut = await removeBg(blob, { maxSide: 1280 });
  const trimmed = trimCanvas(cut);
  if (!trimmed) throw new Error('Im KI-Bild war kein Teil zu erkennen.');
  return trimmed;
}
