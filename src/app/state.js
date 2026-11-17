// Zustand der App, Bild-URLs, Helfer und ein kleines Ereignissystem.
// Einzige Quelle der Wahrheit für items/outfits/body/settings/sel.
// Alle mutierenden Helfer speichern in IndexedDB und lösen passende Ereignisse aus.

import {
  loadState, saveItems, saveOutfits, saveBody, saveSettings, saveImage, loadImage, deleteImage, requestPersistence
} from '../db.js';
import { CATEGORIES, LAYER_ORDER, todayIndex, uid } from '../model.js';
import { SILHOUETTE } from '../silhouette.js';
import { composeOutfit as composeImage, forgetItem } from '../render.js';

// ---------- Zustand ----------
export const S = {
  items: [],        // [{id, cat, name, color:{hex,name}, metal, w, h, created, fit, fav?}]
  outfits: [],      // [{id, name, sel:{[cat]:itemId}, days:number[], created, sig}]
  body: null,       // {w, h, guides, cutout, updated} | null
  settings: {},     // {sel, metal, warp, swiped, hideInstall, todayDismissed, tint, appearance, onboarded, …}
  sel: {},          // aktuell angezogen: {[cat]: itemId|null}
  cat: 'oberteil',  // aktive Kategorie im Spiegel
  metal: 'alle',    // Schmuckfilter: 'alle' | 'gold' | 'silber'
  tab: 'spiegel',   // 'spiegel' | 'schrank' | 'outfits'
  closetFilter: 'alle',
  dayFilter: 'alle',
  adjusting: false, // Sitz-anpassen-Modus im Spiegel
  ready: false
};

// ---------- Ereignisse ----------
const listeners = new Map();
/** Abonniert ein Ereignis. Gibt eine Abmelde-Funktion zurück. */
export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event)?.delete(fn);
}
export function once(event, fn) {
  const off = on(event, (d) => { off(); fn(d); });
  return off;
}
export function emit(event, data) {
  for (const fn of [...(listeners.get(event) || [])]) {
    try { fn(data); } catch (e) { console.error(`[emit ${event}]`, e); }
  }
  for (const fn of [...(listeners.get('*') || [])]) {
    try { fn(event, data); } catch (e) { console.error('[emit *]', e); }
  }
}

// ---------- Bild-URLs (Blob-URLs aus IndexedDB) ----------
// Schlüssel: item.id | 'outfit:'+outfit.id | 'body'
export const urls = new Map();
export async function ensureUrl(id) {
  if (urls.has(id)) return urls.get(id);
  const b = await loadImage(id);
  if (!b) return null;
  const u = URL.createObjectURL(b);
  urls.set(id, u);
  return u;
}
export function setUrl(id, blob) {
  if (urls.has(id)) URL.revokeObjectURL(urls.get(id));
  const u = URL.createObjectURL(blob);
  urls.set(id, u);
  return u;
}
export function dropUrl(id) {
  if (urls.has(id)) URL.revokeObjectURL(urls.get(id));
  urls.delete(id);
}
export const itemUrl = (id) => urls.get(id) || '';
export const outfitUrl = (id) => urls.get('outfit:' + id) || '';

// ---------- Lesende Helfer ----------
export const byNewest = (a, b) => b.created - a.created;
export const itemById = (id) => (id ? S.items.find((i) => i.id === id) : undefined);
export const outfitById = (id) => S.outfits.find((o) => o.id === id);
/** Teile einer Kategorie (neueste zuerst); bei Schmuck nach S.metal gefiltert. */
export const listFor = (cat) =>
  S.items.filter((i) => i.cat === cat && (cat !== 'schmuck' || S.metal === 'alle' || i.metal === S.metal)).sort(byNewest);
export const countFor = (cat) => S.items.reduce((n, i) => n + (i.cat === cat), 0);
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
/** Körper für die Darstellung: eigenes Foto (mit src) oder Platzhalterfigur (placeholder:true). */
export const bodyView = () => (S.body && urls.get('body') ? { ...S.body, src: urls.get('body') } : SILHOUETTE);
export const warpOn = () => S.settings.warp !== false;
export const hasOutfit = () => LAYER_ORDER.some((c) => S.sel[c] && itemById(S.sel[c]));
export const dateKey = () => new Date().toISOString().slice(0, 10);
export const sameSel = (a, b) => LAYER_ORDER.every((c) => (a[c] || null) === (b[c] || null));
export function plannedToday() {
  const t = todayIndex();
  return S.outfits.filter((o) => (o.days || []).includes(t)).sort(byNewest);
}
/** In wie vielen Outfits kommt das Teil vor? */
export const outfitsWith = (itemId) => S.outfits.filter((o) => Object.values(o.sel || {}).includes(itemId));
/** Anzahl fehlender Teile eines Outfits (gelöscht). */
export const missingIn = (o) => Object.values(o.sel || {}).filter((id) => id && !itemById(id)).length;

// ---------- Speichern ----------
let settingsTimer;
/** Speichert S.settings (+ S.sel, S.metal) verzögert. Löst KEIN Ereignis aus. */
export function persistSettings() {
  clearTimeout(settingsTimer);
  settingsTimer = setTimeout(() => saveSettings({ ...S.settings, sel: S.sel, metal: S.metal }), 250);
}
/** Einstellung setzen, speichern, Ereignis 'settings' ({key, value}). */
export function setSetting(key, value) {
  S.settings[key] = value;
  persistSettings();
  if (key === 'tint' || key === 'appearance') applyAppearance();
  emit('settings', { key, value });
}

let itemsTimer;
/** Speichert S.items verzögert (z. B. beim Ziehen). Löst KEIN Ereignis aus. */
export function saveItemsSoon() {
  clearTimeout(itemsTimer);
  itemsTimer = setTimeout(() => saveItems(S.items), 300);
}

// ---------- Auswahl (Spiegel) ----------
/** Setzt ein Teil; Kleid schließt Oberteil+Hose aus und umgekehrt. Gibt geänderte Kategorien zurück. Ereignis 'sel'. */
export function select(cat, id) {
  const changed = [cat];
  S.sel[cat] = id || null;
  if (id && cat === 'kleid') {
    if (S.sel.oberteil) changed.push('oberteil');
    if (S.sel.hose) changed.push('hose');
    S.sel.oberteil = null; S.sel.hose = null;
  }
  if (id && (cat === 'oberteil' || cat === 'hose') && S.sel.kleid) { S.sel.kleid = null; changed.push('kleid'); }
  persistSettings();
  emit('sel', { changed, sel: S.sel });
  return changed;
}
/** Ganze Auswahl ersetzen (Zufall, Leeren, Rückgängig, Outfit anziehen). Ereignis 'sel'. */
export function setSel(sel) {
  S.sel = {};
  for (const c of LAYER_ORDER) if (sel?.[c] && itemById(sel[c])) S.sel[c] = sel[c];
  persistSettings();
  emit('sel', { changed: [...LAYER_ORDER], sel: S.sel });
}
/** Nächstes/vorheriges Teil einer Kategorie (inkl. „Ohne“ = null). */
export function nextId(cat, dir) {
  const ids = [null, ...listFor(cat).map((i) => i.id)];
  const i = Math.max(0, ids.indexOf(S.sel[cat] || null));
  return ids[(i + dir + ids.length) % ids.length];
}

// ---------- Teile ----------
/** Neues Teil speichern (Bild + Daten). Ereignis 'items' ({added:item}). */
export async function addItem(data, blob) {
  const item = {
    id: data.id || uid(), cat: data.cat, name: data.name || '', color: data.color || null,
    metal: data.cat === 'schmuck' ? (data.metal || 'gold') : null,
    w: data.w, h: data.h, created: data.created || Date.now(), fit: data.fit || null, fav: !!data.fav
  };
  await saveImage(item.id, blob);
  setUrl(item.id, blob);
  S.items.push(item);
  await saveItems(S.items);
  requestPersistence();
  emit('items', { added: item });
  return item;
}
/** Teil ändern. Ereignis 'items' ({updated:item, patch}). Bild ersetzen optional. */
export async function updateItem(id, patch = {}, blob = null) {
  const it = itemById(id);
  if (!it) return null;
  Object.assign(it, patch);
  if (it.cat === 'schmuck' && !it.metal) it.metal = 'gold';
  if (it.cat !== 'schmuck') it.metal = null;
  if ('cat' in patch) {
    let selChanged = false;
    for (const c of Object.keys(S.sel)) if (S.sel[c] === id && c !== it.cat) { S.sel[c] = null; selChanged = true; }
    if (selChanged) { persistSettings(); emit('sel', { changed: [...LAYER_ORDER], sel: S.sel }); }
  }
  if (blob) {
    await saveImage(id, blob);
    setUrl(id, blob);
    forgetItem(id);
  } else if ('fit' in patch || 'cat' in patch) {
    forgetItem(id);
  }
  await saveItems(S.items);
  emit('items', { updated: it, patch });
  return it;
}
/** Teil löschen (Bild, Auswahl). Ereignis 'items' ({removed:item}). */
export async function deleteItem(id) {
  const it = itemById(id);
  if (!it) return;
  S.items = S.items.filter((x) => x.id !== id);
  let selChanged = false;
  for (const c of Object.keys(S.sel)) if (S.sel[c] === id) { S.sel[c] = null; selChanged = true; }
  await saveItems(S.items);
  await deleteImage(id);
  dropUrl(id);
  forgetItem(id);
  persistSettings();
  emit('items', { removed: it });
  if (selChanged) emit('sel', { changed: [...LAYER_ORDER], sel: S.sel });
}

// ---------- Outfits ----------
export const outfitSig = (sel) =>
  JSON.stringify([
    LAYER_ORDER.map((c) => { const it = itemById(sel[c]); return it ? [it.id, it.cat, it.fit || null] : null; }),
    S.body?.updated || 0, warpOn(), 'studio2' // Versionsmarke: Bildstil geändert → alte Vorschauen einmal neu zeichnen
  ]);

const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
/** Gesamtbild (JPEG-Blob) eines Outfits; Fallback ohne Figur, falls SVG im Canvas gesperrt ist. */
export async function composeOutfit(sel) {
  const urlOf = (id) => urls.get(id);
  try {
    return await composeImage(sel, bodyView(), itemById, urlOf, LAYER_ORDER, warpOn());
  } catch (e) {
    console.warn(e);
    return composeImage(sel, { ...bodyView(), src: BLANK }, itemById, urlOf, LAYER_ORDER, warpOn());
  }
}
/** Auswahl ohne gelöschte Teile. */
export function cleanSel(sel = S.sel) {
  const out = {};
  for (const c of LAYER_ORDER) if (sel[c] && itemById(sel[c])) out[c] = sel[c];
  return out;
}
/** Outfit aus aktueller (oder übergebener) Auswahl sichern. Ereignis 'outfits' ({added}). */
export async function addOutfit({ name, days = [], sel = S.sel } = {}) {
  const s = cleanSel(sel);
  const id = uid();
  const blob = await composeOutfit(s);
  await saveImage('outfit:' + id, blob);
  setUrl('outfit:' + id, blob);
  const o = { id, name: (name || '').trim() || 'Outfit', sel: s, days: [...days].sort(), created: Date.now(), sig: outfitSig(s) };
  S.outfits.push(o);
  await saveOutfits(S.outfits);
  requestPersistence();
  emit('outfits', { added: o });
  return o;
}
/** Outfit ändern (name, days …). Ereignis 'outfits' ({updated, patch}). */
export async function updateOutfit(id, patch = {}) {
  const o = outfitById(id);
  if (!o) return null;
  Object.assign(o, patch);
  if (patch.days) o.days = [...patch.days].sort();
  await saveOutfits(S.outfits);
  emit('outfits', { updated: o, patch });
  return o;
}
/** Outfit löschen. Ereignis 'outfits' ({removed}). */
export async function deleteOutfit(id) {
  const o = outfitById(id);
  if (!o) return;
  S.outfits = S.outfits.filter((x) => x.id !== id);
  await saveOutfits(S.outfits);
  await deleteImage('outfit:' + id);
  dropUrl('outfit:' + id);
  emit('outfits', { removed: o });
}
/** Outfit anziehen (setzt Auswahl). Navigation macht der Aufrufer: go('spiegel'). */
export function wearOutfit(id) {
  const o = outfitById(id);
  if (!o) return;
  setSel(o.sel);
}

/** Outfit-Vorschauen neu zeichnen, wenn sich Teile, Sitz oder Foto geändert haben. Ereignis 'thumb' ({id, url}) je Bild. */
let refreshingThumbs = null;
export function refreshStaleThumbs() {
  if (refreshingThumbs) return refreshingThumbs;
  refreshingThumbs = (async () => {
    let changed = false;
    try {
      for (const o of [...S.outfits]) {
        const sig = outfitSig(o.sel);
        if (o.sig === sig && urls.has('outfit:' + o.id)) continue;
        if (!Object.values(o.sel).some((id) => itemById(id))) continue;
        const blob = await composeOutfit(o.sel);
        await saveImage('outfit:' + o.id, blob);
        const url = setUrl('outfit:' + o.id, blob);
        o.sig = sig;
        changed = true;
        emit('thumb', { id: o.id, url });
      }
      if (changed) await saveOutfits(S.outfits);
    } catch (e) {
      console.warn('Vorschau', e);
    } finally {
      refreshingThumbs = null;
    }
  })();
  return refreshingThumbs;
}

// ---------- Körper ----------
/** Ganzkörperfoto setzen (blob optional, wenn nur Hilfslinien geändert). Ereignis 'body'. */
export async function setBody(body, blob = null) {
  if (blob) {
    await saveImage('body', blob);
    setUrl('body', blob);
  }
  S.body = { w: body.w, h: body.h, guides: { ...body.guides }, cutout: body.cutout !== false, updated: Date.now() };
  await saveBody(S.body);
  requestPersistence();
  emit('body', S.body);
  return S.body;
}

// ---------- Erscheinungsbild ----------
export const TINTS = [
  { id: 'rose', label: 'Rosé', light: '#FF2D55', dark: '#FF375F' },
  { id: 'indigo', label: 'Indigo', light: '#5856D6', dark: '#5E5CE6' },
  { id: 'blue', label: 'Blau', light: '#007AFF', dark: '#0A84FF' },
  { id: 'mint', label: 'Mint', light: '#00C7BE', dark: '#63E6E2' },
  { id: 'orange', label: 'Orange', light: '#FF9500', dark: '#FF9F0A' },
  { id: 'graphite', label: 'Graphit', light: '#8E8E93', dark: '#98989D' }
];
export const APPEARANCES = [
  { id: 'auto', label: 'Automatisch' },
  { id: 'light', label: 'Hell' },
  { id: 'dark', label: 'Dunkel' }
];
const darkMQ = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
export const isDark = () => {
  const a = document.documentElement.dataset.appearance;
  return a === 'dark' || (a !== 'light' && !!darkMQ?.matches);
};
/** Tint + Hell/Dunkel aus S.settings auf <html> setzen, theme-color mitziehen. */
export function applyAppearance() {
  const root = document.documentElement;
  const tint = TINTS.some((t) => t.id === S.settings.tint) ? S.settings.tint : 'rose';
  root.dataset.tint = tint;
  const ap = S.settings.appearance;
  if (ap === 'light' || ap === 'dark') root.dataset.appearance = ap;
  else delete root.dataset.appearance;
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  metas.forEach((m) => {
    const media = m.getAttribute('data-media') || m.getAttribute('media') || '';
    if (!m.hasAttribute('data-media')) m.setAttribute('data-media', media);
    if (ap === 'light' || ap === 'dark') {
      m.setAttribute('content', ap === 'dark' ? '#000000' : '#F2F2F7');
      m.removeAttribute('media');
    } else {
      m.setAttribute('content', media.includes('dark') ? '#000000' : '#F2F2F7');
      if (media) m.setAttribute('media', media);
    }
  });
}
darkMQ?.addEventListener?.('change', () => emit('settings', { key: 'systemAppearance', value: darkMQ.matches ? 'dark' : 'light' }));

// ---------- Start ----------
/** Lädt alles aus IndexedDB, erzeugt Bild-URLs. Ereignis 'ready'; bei erneutem Aufruf (z. B. nach Import) zusätzlich alle Daten-Ereignisse. */
export async function boot() {
  const again = S.ready;
  const st = await loadState();
  Object.assign(S, { items: st.items, outfits: st.outfits, body: st.body, settings: st.settings });
  S.sel = { ...(st.settings.sel || {}) };
  S.metal = st.settings.metal || 'alle';
  for (const c of Object.keys(S.sel)) if (S.sel[c] && !itemById(S.sel[c])) S.sel[c] = null;
  if (again) { for (const u of urls.values()) URL.revokeObjectURL(u); urls.clear(); }
  await Promise.all([
    ...S.items.map((i) => ensureUrl(i.id)),
    ...S.outfits.map((o) => ensureUrl('outfit:' + o.id)),
    S.body ? ensureUrl('body') : null
  ]);
  applyAppearance();
  S.ready = true;
  if (again) {
    for (const ev of ['items', 'outfits', 'body', 'settings']) emit(ev, { reloaded: true });
    emit('sel', { changed: [...LAYER_ORDER], sel: S.sel });
  }
  emit('ready', S);
  return S;
}

export { CATEGORIES, LAYER_ORDER, todayIndex };
