// Dauerhafte Speicherung auf dem Gerät (IndexedDB). Kein Server, keine Cloud.
import { createStore, get, set, del, keys } from 'idb-keyval';

const store = createStore('kleiderschrank', 'daten');

export const db = {
  get: (k) => get(k, store),
  set: (k, v) => set(k, v, store),
  del: (k) => del(k, store),
  keys: () => keys(store)
};

export const imgKey = (id) => `img:${id}`;

export async function loadState() {
  const [items, outfits, body, settings] = await Promise.all([
    db.get('items'),
    db.get('outfits'),
    db.get('body'),
    db.get('settings')
  ]);
  return {
    items: items || [],
    outfits: outfits || [],
    body: body || null,
    settings: settings || {}
  };
}

export const saveItems = (items) => db.set('items', items);
export const saveOutfits = (outfits) => db.set('outfits', outfits);
export const saveBody = (body) => db.set('body', body);
export const saveSettings = (s) => db.set('settings', s);
export const saveImage = (id, blob) => db.set(imgKey(id), blob);
export const loadImage = (id) => db.get(imgKey(id));
export const deleteImage = (id) => db.del(imgKey(id));

// Browser bitten, die Daten nicht automatisch zu löschen
export async function requestPersistence() {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export async function storageInfo() {
  try {
    const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null;
    const est = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
    return { persisted, usage: est?.usage ?? null };
  } catch {
    return { persisted: null, usage: null };
  }
}

// ---------- Sicherung (Export / Import) ----------
const blobToDataURL = (b) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(b);
  });

const dataURLToBlob = async (u) => (await fetch(u)).blob();

export async function exportBackup() {
  const state = await loadState();
  const images = {};
  const ids = [
    ...state.items.map((i) => i.id),
    ...state.outfits.map((o) => `outfit:${o.id}`),
    ...(state.body ? ['body'] : [])
  ];
  for (const id of ids) {
    const b = await loadImage(id);
    if (b) images[id] = await blobToDataURL(b);
  }
  const data = { app: 'kleiderschrank', version: 1, exportedAt: new Date().toISOString(), ...state, images };
  return new Blob([JSON.stringify(data)], { type: 'application/json' });
}

export async function importBackup(file) {
  const data = JSON.parse(await file.text());
  if (data.app !== 'kleiderschrank') throw new Error('Diese Datei ist keine Kleiderschrank-Sicherung.');
  for (const [id, url] of Object.entries(data.images || {})) {
    await saveImage(id, await dataURLToBlob(url));
  }
  await saveItems(data.items || []);
  await saveOutfits(data.outfits || []);
  if (data.body) await saveBody(data.body);
  if (data.settings) await saveSettings(data.settings);
}
