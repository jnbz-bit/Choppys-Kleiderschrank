// Zeichnet die Kleidungsebenen (mit Form-Anpassung) und hält einen kleinen Zwischenspeicher.
import { bodyProfile, garmentProfile, renderGarment } from './fit.js';
import { placeItem } from './model.js';

const loadImg = (src) =>
  new Promise((res, rej) => {
    const i = new Image();
    i.decoding = 'async';
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('Bild konnte nicht geladen werden'));
    i.src = src;
  });

// ---- Teile: Bild + Profil (begrenzt, damit das iPhone nicht zu viel Speicher braucht) ----
const items = new Map();
const MAX_ITEMS = 24;
async function itemAsset(item, url) {
  let a = items.get(item.id);
  if (a && a.url === url) {
    items.delete(item.id);
    items.set(item.id, a); // als zuletzt benutzt markieren
    return a;
  }
  const img = await loadImg(url);
  a = { url, img, prof: null };
  items.set(item.id, a);
  while (items.size > MAX_ITEMS) items.delete(items.keys().next().value);
  return a;
}

// ---- Körper ----
let bodyCache = { key: null, img: null, prof: null };
export async function bodyAsset(body) {
  const key = body.placeholder ? 'silhouette' : `${body.updated}|${JSON.stringify(body.guides)}|${body.cutout !== false}`;
  if (bodyCache.key === key) return bodyCache;
  const img = await loadImg(body.src);
  let prof = null;
  if (!body.placeholder && body.cutout !== false) {
    try { prof = bodyProfile(img, body.guides); } catch (e) { console.warn(e); }
  }
  bodyCache = { key, img, prof };
  return bodyCache;
}
export const hasBodyProfile = () => !!bodyCache.prof;

// ---- fertige Ebenen ----
const layers = new Map();
const MAX_LAYERS = 16;
export function layerKey(item, body, warp) {
  return `${item.id}|${JSON.stringify(item.fit || null)}|${item.cat}|${body.placeholder ? 's' : body.updated}|${JSON.stringify(body.guides)}|${warp ? 1 : 0}`;
}

/** Liefert {canvas, x, y, w, h} in Fotopixeln. */
export async function layerFor(item, url, body, warp) {
  const key = layerKey(item, body, warp);
  if (layers.has(key)) {
    const l = layers.get(key);
    layers.delete(key);
    layers.set(key, l);
    return l;
  }
  const [asset, b] = await Promise.all([itemAsset(item, url), bodyAsset(body)]);
  const useWarp = warp && !!b.prof && ['oberteil', 'jacke', 'kleid', 'hose'].includes(item.cat);
  if (useWarp && !asset.prof) asset.prof = garmentProfile(asset.img);
  const k = Math.min(1, 1500 / body.h);
  const p = placeItem(item, body.guides, body.w, body.h);
  const pad = p.h * 0.02;
  const oy = Math.max(0, p.y - pad);
  const oh = Math.min(body.h, p.y + p.h + pad) - oy;
  const ox = useWarp ? 0 : Math.max(0, p.x - 2);
  const ow = useWarp ? body.w : Math.min(body.w, p.x + p.w + 2) - ox;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(ow * k));
  canvas.height = Math.max(1, Math.round(oh * k));
  canvas.className = 'layer';
  renderGarment(canvas, item, asset.img, asset.prof, body, b.prof, k, ox, oy, useWarp);
  const l = { canvas, x: ox, y: oy, w: ow, h: oh, key };
  layers.set(key, l);
  while (layers.size > MAX_LAYERS) layers.delete(layers.keys().next().value);
  return l;
}

export function forgetItem(id) {
  items.delete(id);
  for (const k of [...layers.keys()]) if (k.startsWith(id + '|')) layers.delete(k);
}

/**
 * Gesamtbild eines Outfits als JPEG-Blob.
 * opts (optional): { studio = true } – heller Studio-Verlauf (#FAFAFC → #E9E9EF) mit weichem Bodenschatten,
 * Bild mindestens 3:4 (Figur mittig). { studio: false } bzw. { background: '#E1E4DD' } = alter flacher Grund.
 */
export async function composeOutfit(sel, body, itemById, urlOf, order, warp, opts = {}) {
  const H = 1000, W = Math.round((H * body.w) / body.h);
  const studio = opts.studio !== false && !opts.background;
  const c = document.createElement('canvas');
  c.height = H + 80;
  c.width = studio ? Math.max(W + 120, Math.round(c.height * 0.75)) : W + 120;
  const ctx = c.getContext('2d');
  const ox = Math.round((c.width - W) / 2);
  if (studio) {
    const g = ctx.createLinearGradient(0, 0, 0, c.height);
    g.addColorStop(0, '#FAFAFC');
    g.addColorStop(1, '#E9E9EF');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c.width, c.height);
    // weiches Licht oben
    const r = ctx.createRadialGradient(c.width / 2, c.height * 0.2, 0, c.width / 2, c.height * 0.2, c.width * 0.75);
    r.addColorStop(0, 'rgba(255,255,255,.75)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, c.width, c.height);
    // Bodenschatten unter den Füßen
    const fy = 40 + (body.guides?.floor ?? 0.98) * H;
    const fx = ox + (body.guides?.cx ?? 0.5) * W;
    const rw = Math.max(W * 0.42, 120), rh = 26;
    ctx.save();
    ctx.translate(fx, fy);
    ctx.scale(1, rh / rw);
    const s = ctx.createRadialGradient(0, 0, 0, 0, 0, rw);
    s.addColorStop(0, 'rgba(0,0,0,.20)');
    s.addColorStop(0.45, 'rgba(0,0,0,.08)');
    s.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = s;
    ctx.beginPath();
    ctx.arc(0, 0, rw, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else {
    ctx.fillStyle = opts.background || '#E1E4DD';
    ctx.fillRect(0, 0, c.width, c.height);
  }
  ctx.translate(ox, 40);
  const k = H / body.h;
  const b = await bodyAsset(body);
  ctx.drawImage(b.img, 0, 0, W, H);
  for (const cat of order) {
    const item = itemById(sel[cat]);
    const url = item && urlOf(item.id);
    if (!url) continue;
    const l = await layerFor(item, url, body, warp);
    ctx.drawImage(l.canvas, l.x * k, l.y * k, l.w * k, l.h * k);
  }
  return new Promise((res, rej) => c.toBlob((bl) => (bl ? res(bl) : rej(new Error('Vorschau fehlgeschlagen'))), 'image/jpeg', 0.85));
}
