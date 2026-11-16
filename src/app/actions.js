// Kleine Registry, damit sich Bereiche gegenseitig aufrufen können, ohne sich zu importieren.
//   register('openItem', (id) => …)   – in der zuständigen View (beim Import)
//   run('openItem', id)               – von überall
// Ist eine Aktion (noch) nicht registriert, wartet run() bis alle Module geladen sind und
// versucht es dann erneut; fehlt sie danach immer noch, gibt es eine Warnung (kein Absturz).

import { emit } from './state.js';

const registry = new Map();
let markLoaded;
const loaded = new Promise((r) => (markLoaded = r));
let isLoaded = false;

/** Aktion eintragen. Gibt eine Abmelde-Funktion zurück. Späteres register() mit gleichem Namen ersetzt. */
export function register(name, fn) {
  registry.set(name, fn);
  return () => { if (registry.get(name) === fn) registry.delete(name); };
}
export const has = (name) => registry.has(name);
export const names = () => [...registry.keys()];

/** Aktion ausführen. Gibt das Ergebnis der Aktion zurück (oder ein Promise darauf, falls noch geladen wird). */
export function run(name, ...args) {
  const fn = registry.get(name);
  if (fn) {
    try {
      return fn(...args);
    } catch (e) {
      console.error(`[run ${name}]`, e);
      return undefined;
    }
  }
  if (!isLoaded) return loaded.then(() => (registry.has(name) ? run(name, ...args) : warn(name)));
  return warn(name);
}
function warn(name) {
  console.warn(`Aktion „${name}“ ist nicht registriert.`);
  emit('missing-action', { name });
  return undefined;
}

/** Von main.js aufgerufen, sobald alle Views/Module geladen sind. */
export function modulesLoaded() {
  isLoaded = true;
  markLoaded();
}
export const whenLoaded = () => loaded;

// ---------- Bequeme Kurzformen (alle über die Registry) ----------
// Eigentümer: main.js → go, setTabBarHidden · scan.js → openScan, openBodySetup, openGuides
// closet.js → openItem · outfits.js → openOutfit, openSaveOutfit · mirror.js → startAdjust
// settings.js → openSettings · onboarding.js → openOnboarding
export const go = (tab, opts) => run('go', tab, opts);
export const openScan = (opts) => run('openScan', opts);
export const openBodySetup = () => run('openBodySetup');
export const openGuides = () => run('openGuides');
export const openSettings = () => run('openSettings');
export const openItem = (id) => run('openItem', id);
export const openOutfit = (id) => run('openOutfit', id);
export const openSaveOutfit = () => run('openSaveOutfit');
export const startAdjust = (itemId) => run('startAdjust', itemId);
export const openOnboarding = (opts) => run('openOnboarding', opts);
export const setTabBarHidden = (hidden) => run('setTabBarHidden', hidden);
