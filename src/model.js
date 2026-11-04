// Kategorien, Zonen am Körper und Platzierung der Kleidungsstücke auf dem Foto.

export const CATEGORIES = [
  { id: 'oberteil', label: 'Oberteile', one: 'Oberteil', noun: 'Oberteil', zone: 'oben' },
  { id: 'jacke', label: 'Jacken', one: 'Jacke', noun: 'Jacke', zone: 'oben' },
  { id: 'kleid', label: 'Kleider', one: 'Kleid', noun: 'Kleid', zone: 'oben' },
  { id: 'hose', label: 'Hosen & Röcke', one: 'Hose / Rock', noun: 'Hose', zone: 'mitte' },
  { id: 'socken', label: 'Socken', one: 'Socken', noun: 'Socken', zone: 'unten' },
  { id: 'schuhe', label: 'Schuhe', one: 'Schuhe', noun: 'Schuhe', zone: 'unten' },
  { id: 'schmuck', label: 'Schmuck', one: 'Schmuck', noun: 'Schmuck', zone: 'oben' }
];
export const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

// Reihenfolge der Ebenen von hinten nach vorne
export const LAYER_ORDER = ['socken', 'hose', 'schuhe', 'oberteil', 'kleid', 'jacke', 'schmuck'];

export const ZONE_DEFAULT = { oben: 'oberteil', mitte: 'hose', unten: 'schuhe' };

export const METALS = [
  { id: 'gold', label: 'Gold' },
  { id: 'silber', label: 'Silber' }
];

export const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export const todayIndex = () => (new Date().getDay() + 6) % 7;

/**
 * Rahmen für eine Kategorie in Foto-Pixeln.
 * g: normierte Hilfslinien {s, h, a, floor, cx, w}, W/H: Fotogröße.
 * anchor: an welcher Kante das Teil ausgerichtet wird.
 */
export function zoneBox(cat, g, W, H) {
  const t = (g.h - g.s) * H; // Oberkörperlänge in px
  const l = (g.a - g.h) * H; // Beinlänge in px
  const S = g.s * H, Hp = g.h * H, A = g.a * H;
  const F = Math.max(A + l * 0.07, g.floor * H);
  const bw = g.w * W; // Körperbreite inkl. Arme
  const cx = g.cx * W;
  const box = {
    oberteil: { top: S - t * 0.1, bottom: Hp + t * 0.22, width: bw * 1.0, anchor: 'top' },
    jacke: { top: S - t * 0.12, bottom: Hp + t * 0.4, width: bw * 1.12, anchor: 'top' },
    kleid: { top: S - t * 0.08, bottom: Hp + l * 0.8, width: bw * 1.02, anchor: 'top' },
    hose: { top: Hp - t * 0.1, bottom: A + l * 0.04, width: bw * 0.78, anchor: 'top' },
    socken: { top: A - l * 0.24, bottom: F, width: bw * 0.5, anchor: 'bottom' },
    schuhe: { top: A - l * 0.08, bottom: F + l * 0.01, width: bw * 0.72, anchor: 'bottom' },
    schmuck: { top: S - t * 0.16, bottom: S + t * 0.42, width: bw * 0.42, anchor: 'top' }
  }[cat];
  return { x: cx - box.width / 2, y: box.top, w: box.width, h: box.bottom - box.top, anchor: box.anchor };
}

/** Endgültige Position eines Teils (contain im Rahmen + persönliche Anpassung). */
export function placeItem(item, g, W, H) {
  const b = zoneBox(item.cat, g, W, H);
  const ar = item.w / item.h;
  let w = b.w, h = w / ar;
  if (h > b.h) {
    h = b.h;
    w = h * ar;
  }
  const fit = item.fit || { dx: 0, dy: 0, s: 1 };
  w *= fit.s;
  h *= fit.s;
  const x = b.x + (b.w - w) / 2 + fit.dx * b.w;
  const y = (b.anchor === 'bottom' ? b.y + b.h - h : b.y) + fit.dy * b.h;
  return { x, y, w, h, box: b };
}

/** Welche Zone wurde auf dem Foto berührt? (yN = 0..1) */
export function zoneAt(yN, g) {
  if (yN < g.h - (g.h - g.s) * 0.05) return 'oben';
  if (yN < g.a - (g.a - g.h) * 0.12) return 'mitte';
  return 'unten';
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
