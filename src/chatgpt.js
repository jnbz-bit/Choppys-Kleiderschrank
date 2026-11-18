// Kostenloser Umweg zur KI: Foto + fertiger Auftrag an ChatGPT (oder Gemini) weitergeben.
// iOS: Teilen-Menü mit dem Foto (ChatGPT auswählen); der Auftragstext liegt zusätzlich in der Zwischenablage.
import { loadBitmap, canvasFrom, toBlob } from './imaging.js';

// Dativ + Relativpronomen: „nur von der Jacke, die die Person trägt“
const DESC = {
  oberteil: ['dem Oberteil', 'das'], jacke: ['der Jacke', 'die'], kleid: ['dem Kleid', 'das'],
  hose: ['der Hose (bzw. dem Rock)', 'die'], socken: ['dem Paar Socken', 'das'],
  schuhe: ['dem Paar Schuhe', 'das'], schmuck: ['dem Schmuckstück', 'das']
};

export function chatgptPrompt({ cat, colorName, worn }) {
  const [what, rel] = DESC[cat] || ['dem Kleidungsstück', 'das'];
  const col = colorName && colorName !== 'Unbekannt' ? ` (Farbe ungefähr: ${colorName})` : '';
  return [
    `Erstelle aus diesem Foto ein Produktfoto nur von ${what}${col}${worn ? `, ${rel} die Person trägt` : ''}.`,
    'Vorderansicht, das komplette Teil sichtbar und mittig, wie flach hingelegt.',
    'Ergänze alle Stellen, die von Armen, Händen, Haaren, anderen Kleidungsstücken oder dem Bildrand verdeckt sind, so dass sie zu Stoff, Farbe, Muster und Details passen.',
    'Farbe, Material, Muster, Aufdrucke und Schnitt genau beibehalten, nichts Neues hinzufügen.',
    'Keine Person, keine Haut, keine Haare, kein Kleiderbügel, keine Schaufensterpuppe, keine anderen Gegenstände, kein Schatten.',
    'Reinweißer Hintergrund, Hochformat.'
  ].join(' ');
}

/** Foto auf das Teil zuschneiden (mit Rand), damit ChatGPT weiß, worum es geht. */
async function focusedPhoto(file, box) {
  const bmp = await loadBitmap(file);
  const full = canvasFrom(bmp, 2000);
  if (!box) return toBlob(full, 'image/jpeg', 0.9);
  const m = 0.18;
  const x = Math.max(0, (box.x - box.w * m) * full.width), y = Math.max(0, (box.y - box.h * m) * full.height);
  const w = Math.min(full.width - x, box.w * (1 + 2 * m) * full.width), h = Math.min(full.height - y, box.h * (1 + 2 * m) * full.height);
  const c = document.createElement('canvas');
  c.width = Math.round(w); c.height = Math.round(h);
  c.getContext('2d').drawImage(full, x, y, w, h, 0, 0, c.width, c.height);
  return toBlob(c, 'image/jpeg', 0.9);
}

/** Vorbereiten (vor dem Tippen), damit das Teilen direkt im Tipp-Ereignis passieren kann (iOS-Vorgabe). */
export async function prepareChatgpt(file, opts) {
  const blob = await focusedPhoto(file, opts.box);
  const photo = new File([blob], 'kleidungsstueck.jpg', { type: 'image/jpeg' });
  return { photo, prompt: chatgptPrompt(opts) };
}

/**
 * Muss synchron aus einem Tipp heraus aufgerufen werden.
 * @returns {Promise<'shared'|'cancelled'|'fallback'>}
 */
export function sendToChatgpt(prep) {
  // Text in die Zwischenablage – zum Einfügen in ChatGPT („Einfügen“ im Eingabefeld)
  try { navigator.clipboard?.writeText(prep.prompt).catch(() => {}); } catch {}
  const data = { files: [prep.photo], text: prep.prompt };
  if (navigator.canShare?.(data)) {
    return navigator.share(data).then(() => 'shared', (e) => (e?.name === 'AbortError' ? 'cancelled' : fallback(prep)));
  }
  if (navigator.canShare?.({ files: [prep.photo] })) {
    return navigator.share({ files: [prep.photo] }).then(() => 'shared', (e) => (e?.name === 'AbortError' ? 'cancelled' : fallback(prep)));
  }
  return Promise.resolve(fallback(prep));
}

function fallback(prep) {
  // Ohne Teilen-Menü (z. B. am Computer): Foto laden und ChatGPT im Browser mit dem Text öffnen
  const a = document.createElement('a');
  a.href = URL.createObjectURL(prep.photo);
  a.download = prep.photo.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  window.open(`https://chatgpt.com/?q=${encodeURIComponent(prep.prompt)}`, '_blank', 'noopener');
  return 'fallback';
}
