// Bildverarbeitung: Freistellen (direkt auf dem Gerät), Zuschneiden, Farbe erkennen, Körpermaße schätzen.

let removerPromise = null;
const loadRemover = () => (removerPromise ??= import('@imgly/background-removal'));

/** Lädt das Freisteller-Modell vorab (einmalig ~45 MB, danach aus dem Cache). */
export function preloadRemover() {
  loadRemover().catch(() => {});
}

export async function loadBitmap(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

const dims = (img) => [img.naturalWidth || img.width, img.naturalHeight || img.height];

export function canvasFrom(img, maxSide) {
  const [w, h] = dims(img);
  const s = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * s);
  c.height = Math.round(h * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}

export const toBlob = (canvas, type = 'image/png', q = 0.9) =>
  new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Bild konnte nicht erzeugt werden'))), type, q));

/**
 * Entfernt den Hintergrund. onProgress(text, anteil|null)
 * Gibt ein Canvas mit transparentem Hintergrund zurück.
 */
export async function removeBg(file, { maxSide = 1280, onProgress } = {}) {
  onProgress?.('Foto wird vorbereitet', null);
  const bmp = await loadBitmap(file);
  const input = await toBlob(canvasFrom(bmp, maxSide), 'image/jpeg', 0.92);

  onProgress?.('Freisteller wird geladen', 0);
  const { removeBackground } = await loadRemover();
  let computing = false;
  const out = await removeBackground(input, {
    publicPath: new URL('/bgdata/', location.href).href,
    model: 'small',
    output: { format: 'image/png' },
    progress: (key, cur, total) => {
      if (key.startsWith('fetch:') && total) onProgress?.('Freisteller wird geladen (nur beim ersten Mal)', cur / total);
      else if (!computing && key.startsWith('compute')) {
        computing = true;
        onProgress?.('Kleidungsstück wird ausgeschnitten', null);
      }
    }
  });
  onProgress?.('Kleidungsstück wird ausgeschnitten', null);
  const outBmp = await loadBitmap(out);
  return canvasFrom(outBmp, 4000);
}

/** Bounding-Box der sichtbaren Pixel; einzelne Störpixel am Rand werden ignoriert. */
export function alphaBox(canvas, threshold = 100) {
  const { width: w, height: h } = canvas;
  const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const rows = new Uint32Array(h), cols = new Uint32Array(w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > threshold) { rows[y]++; cols[x]++; }
    }
  }
  const minRow = Math.max(2, w * 0.006), minCol = Math.max(2, h * 0.006);
  let y0 = rows.findIndex((n) => n >= minRow);
  if (y0 < 0) return null;
  let y1 = h - 1; while (y1 > y0 && rows[y1] < minRow) y1--;
  let x0 = cols.findIndex((n) => n >= minCol);
  let x1 = w - 1; while (x1 > x0 && cols[x1] < minCol) x1--;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Halbtransparenten Dunst entfernen, damit Ränder sauber sind. */
function cleanAlpha(canvas, cut = 48) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < cut) d[i] = 0;
  ctx.putImageData(img, 0, 0);
}

/**
 * Behält nur die großen zusammenhängenden Flächen (z. B. das Teil, beide Schuhe)
 * und verwirft losgelöste Reste vom Untergrund.
 */
function keepMainShapes(canvas, minShare = 0.15) {
  const W = canvas.width, H = canvas.height;
  const sc = Math.min(1, 256 / Math.max(W, H));
  const w = Math.max(1, Math.round(W * sc)), h = Math.max(1, Math.round(H * sc));
  const small = document.createElement('canvas');
  small.width = w; small.height = h;
  small.getContext('2d').drawImage(canvas, 0, 0, w, h);
  const a = small.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const on = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) on[i] = a[i * 4 + 3] > 128 ? 1 : 0;
  const label = new Int32Array(w * h);
  const sizes = [0];
  const stack = [];
  for (let i = 0; i < w * h; i++) {
    if (!on[i] || label[i]) continue;
    const id = sizes.length;
    let n = 0;
    label[i] = id;
    stack.push(i);
    while (stack.length) {
      const p = stack.pop();
      n++;
      const x = p % w, y = (p - x) / w;
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const q of nb) if (q >= 0 && on[q] && !label[q]) { label[q] = id; stack.push(q); }
    }
    sizes.push(n);
  }
  if (sizes.length < 3) return; // nur eine Fläche, nichts zu tun
  const max = Math.max(...sizes);
  const keepId = sizes.map((n) => n >= max * minShare);
  // Maske um 2 px erweitern, damit weiche Kanten erhalten bleiben
  const keep = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!keepId[label[y * w + x]] || !label[y * w + x]) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < w && yy < h) keep[yy * w + xx] = 1;
    }
  }
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    const ys = Math.min(h - 1, Math.floor(y * sc)) * w;
    for (let x = 0; x < W; x++) {
      if (!keep[ys + Math.min(w - 1, Math.floor(x * sc))]) d[(y * W + x) * 4 + 3] = 0;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Schneidet auf den Inhalt zu, mit etwas Rand, und begrenzt die Größe. */
export function trimCanvas(canvas, maxSide = 900, padRatio = 0.02) {
  cleanAlpha(canvas);
  keepMainShapes(canvas);
  const box = alphaBox(canvas);
  if (!box) return null;
  const pad = Math.round(Math.max(box.w, box.h) * padRatio);
  const sx = Math.max(0, box.x - pad), sy = Math.max(0, box.y - pad);
  const sw = Math.min(canvas.width - sx, box.w + pad * 2), sh = Math.min(canvas.height - sy, box.h + pad * 2);
  const s = Math.min(1, maxSide / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.round(sw * s);
  c.height = Math.round(sh * s);
  c.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}

/** Anteil sichtbarer Pixel — sehr klein heißt: Freistellen hat vermutlich nichts gefunden. */
export function coverage(canvas) {
  const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 16) if (d[i] > 24) n++;
  return n / (d.length / 16);
}

// ---------- Farbe ----------
const NAMED = [
  ['Schwarz', [28, 28, 30]], ['Anthrazit', [70, 72, 76]], ['Grau', [140, 140, 140]], ['Hellgrau', [200, 200, 198]],
  ['Weiß', [242, 242, 238]], ['Creme', [236, 226, 204]], ['Beige', [205, 185, 150]], ['Camel', [176, 132, 82]],
  ['Braun', [110, 74, 48]], ['Bordeaux', [110, 30, 45]], ['Rot', [200, 40, 45]], ['Rosa', [235, 160, 180]],
  ['Pink', [225, 70, 140]], ['Orange', [235, 125, 45]], ['Gelb', [240, 205, 60]], ['Oliv', [110, 115, 60]],
  ['Grün', [60, 140, 80]], ['Mint', [165, 220, 195]], ['Türkis', [50, 170, 170]], ['Hellblau', [150, 190, 230]],
  ['Jeansblau', [80, 110, 150]], ['Blau', [45, 85, 190]], ['Navy', [30, 40, 75]], ['Lila', [125, 80, 160]],
  ['Flieder', [190, 170, 220]], ['Gold', [200, 165, 80]], ['Silber', [185, 190, 196]]
];

export function dominantColor(canvas) {
  const c = canvasFrom(canvas, 80);
  const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
  const buckets = new Map();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 200) continue;
    const key = ((d[i] >> 5) << 6) | ((d[i + 1] >> 5) << 3) | (d[i + 2] >> 5);
    const b = buckets.get(key) || [0, 0, 0, 0];
    b[0] += d[i]; b[1] += d[i + 1]; b[2] += d[i + 2]; b[3]++;
    buckets.set(key, b);
  }
  let best = null;
  for (const b of buckets.values()) if (!best || b[3] > best[3]) best = b;
  if (!best) return { name: 'Unbekannt', hex: '#999999' };
  const rgb = best.slice(0, 3).map((v) => Math.round(v / best[3]));
  let name = 'Unbekannt', min = Infinity;
  for (const [n, ref] of NAMED) {
    if (n === 'Gold' || n === 'Silber') continue;
    const dist = (rgb[0] - ref[0]) ** 2 * 0.3 + (rgb[1] - ref[1]) ** 2 * 0.59 + (rgb[2] - ref[2]) ** 2 * 0.11;
    if (dist < min) { min = dist; name = n; }
  }
  return { name, hex: '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('') };
}

/** Gold oder Silber anhand der Farbe vorschlagen. */
export function guessMetal(canvas) {
  const c = canvasFrom(canvas, 80);
  const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
  let warm = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 200) continue;
    warm += d[i] - d[i + 2];
    n++;
  }
  return n && warm / n > 22 ? 'gold' : 'silber';
}

/** Kategorie grob anhand der Form vorschlagen (Seitenverhältnis + wo das Teil breiter ist). */
export function guessCategory(canvas) {
  const r = canvas.width / canvas.height;
  if (r < 0.62) return 'hose';
  const c = canvasFrom(canvas, 120);
  const { width: w, height: h } = c;
  const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const band = (f0, f1) => {
    let sum = 0, n = 0;
    for (let y = Math.floor(h * f0); y < Math.floor(h * f1); y++) {
      let a = -1, b = -1;
      for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 100) { if (a < 0) a = x; b = x; }
      if (a >= 0) { sum += b - a + 1; n++; }
    }
    return n ? sum / n : 0;
  };
  const topW = band(0.1, 0.3), botW = band(0.7, 0.9);
  if (r > 1.2 && botW > topW * 1.15) return 'schuhe'; // Sohle unten breiter
  if (topW > botW * 1.1) return 'oberteil'; // Schultern/Ärmel oben breiter
  if (botW > topW * 1.25) return 'hose'; // z. B. ausgestellter Rock
  if (r > 1.6) return 'schuhe';
  return 'oberteil';
}

// ---------- Körper ----------
/** Schätzt Schulter-, Hüft- und Knöchelhöhe sowie Körpermitte aus dem freigestellten Ganzkörperfoto. */
export function estimateGuides(canvas) {
  const { width: w, height: h } = canvas;
  const box = alphaBox(canvas, 100);
  if (!box) return defaultGuides();
  const top = box.y / h, bottom = (box.y + box.h) / h, H = bottom - top;
  const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const rowSpan = (yr) => {
    const y = Math.min(h - 1, Math.max(0, Math.round(yr * h)));
    let a = -1, b = -1;
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 100) {
        if (a < 0) a = x;
        b = x;
      }
    }
    return a < 0 ? null : [a / w, b / w];
  };
  // Breite des mittleren Abschnitts je Zeile (Hals schmal, Schultern breit, Knöchel schmal)
  const centerRun = (yr, cx) => {
    const y = Math.min(h - 1, Math.max(0, Math.round(yr * h)));
    const X = Math.round(cx * w);
    const on = (x) => d[(y * w + x) * 4 + 3] > 100;
    if (!on(X)) return 0;
    let a = X, b = X;
    while (a > 0 && on(a - 1)) a--;
    while (b < w - 1 && on(b + 1)) b++;
    return (b - a + 1) / w;
  };
  const cx0 = box.x / w + box.w / w / 2;
  // Hals: schmalste Stelle zwischen 9 % und 22 % der Körperhöhe
  let neckY = top + H * 0.15, neckW = Infinity;
  for (let t = 0.09; t <= 0.22; t += 0.005) {
    const wr = centerRun(top + H * t, cx0);
    if (wr > 0 && wr < neckW) { neckW = wr; neckY = top + H * t; }
  }
  // Schultern: erste Zeile unter dem Hals, die deutlich breiter ist
  let s = top + H * 0.185;
  const chestW = centerRun(top + H * 0.32, cx0);
  // Kopf nicht im Bild (z. B. abgeschnitten): oberste Zeilen sind schon breit
  const headless = chestW > 0 && centerRun(top + H * 0.015, cx0) > chestW * 0.6;
  if (headless) s = top + H * 0.012;
  // Nur wenn wirklich ein schmaler Hals gefunden wurde (Kopf ist mit im Bild)
  if (!headless && isFinite(neckW) && chestW > 0 && neckW < chestW * 0.55) {
    for (let y = neckY; y < top + H * 0.3; y += H * 0.004) {
      if (centerRun(y, cx0) > neckW * 2.6) { s = y + H * 0.01; break; }
    }
  }
  // Hüfte: übliche Körperproportion zwischen Schultern und Boden
  const hip = s + (bottom - s) * 0.386;
  // Knöchel: schmalste Beinbreite zwischen 86 % und 97 %
  let a = top + H * 0.94, best = Infinity;
  for (let t = 0.86; t <= 0.97; t += 0.005) {
    const span = rowSpan(top + H * t);
    if (!span) continue;
    const wd = span[1] - span[0];
    if (wd < best) { best = wd; a = top + H * t; }
  }
  const chest = rowSpan(s + (hip - s) * 0.35) || [0.3, 0.7];
  const hipSpan = rowSpan(hip) || chest;
  return {
    s, h: hip, a, floor: bottom,
    cx: (hipSpan[0] + hipSpan[1]) / 2,
    w: Math.min(0.9, Math.max(0.18, (chest[1] - chest[0]) * 0.92))
  };
}

export const defaultGuides = () => ({ s: 0.2, h: 0.5, a: 0.93, floor: 0.98, cx: 0.5, w: 0.42 });
