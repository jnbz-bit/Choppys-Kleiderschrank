// App-Gerüst: Start, Tab-Leiste, Views laden und ein-/ausblenden, Nebenmodule laden.
import './ui/tokens.css';
import './ui/base.css';
import './ui/components.css';
import { registerSW } from 'virtual:pwa-register';
import { S, boot, on, emit, applyAppearance, refreshStaleThumbs } from './app/state.js';
import { register, run, modulesLoaded } from './app/actions.js';
import * as ui from './ui/ui.js';
import { I } from './ui/icons.js';

const params = new URLSearchParams(location.search);

// Service Worker: leise Updates
try { registerSW({ immediate: true }); } catch (e) { console.warn(e); }

ui.initUI();

// ---------- Tabs ----------
const TABS = [
  { id: 'spiegel', label: 'Anprobe', icon: I.mirror, iconFill: I.mirrorFill, load: () => import('./views/mirror.js') },
  { id: 'schrank', label: 'Schrank', icon: I.hanger, iconFill: I.hangerFill, load: () => import('./views/closet.js') },
  { id: 'outfits', label: 'Outfits', icon: I.looks, iconFill: I.looksFill, load: () => import('./views/outfits.js') }
];
// Nebenmodule registrieren ihre Aktionen beim Import selbst (register(...) in app/actions.js)
const SIDE_MODULES = [
  { id: 'scan', load: () => import('./views/scan.js') },
  { id: 'settings', load: () => import('./views/settings.js') },
  { id: 'onboarding', load: () => import('./views/onboarding.js') }
];

const views = new Map(); // id → {view, container, mounted}
let tabbar, pill;

function buildShell() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <main class="tabviews">${TABS.map((t) => `<section class="tabview" id="tab-${t.id}" data-tab="${t.id}" role="tabpanel" aria-label="${t.label}" aria-hidden="true"></section>`).join('')}</main>
    <nav class="tabbar" aria-label="Bereiche">
      <div class="tabbar-tabs glass" role="tablist" style="--n:${TABS.length}">
        <span class="tabbar-pill" aria-hidden="true"></span>
        ${TABS.map((t) => `<button type="button" class="tabbar-tab" role="tab" data-tab="${t.id}" aria-controls="tab-${t.id}" aria-selected="false">
          <span class="ic-line">${t.icon}</span><span class="ic-fill">${t.iconFill}</span><span class="tabbar-label">${t.label}</span></button>`).join('')}
      </div>
      <button type="button" class="tabbar-add glass" aria-label="Teil scannen">${I.plus}</button>
    </nav>`;
  tabbar = app.querySelector('.tabbar');
  pill = app.querySelector('.tabbar-tabs');
  tabbar.addEventListener('click', (e) => {
    const t = e.target.closest('.tabbar-tab');
    if (t) return go(t.dataset.tab);
    if (e.target.closest('.tabbar-add')) { ui.haptic('light'); run('openScan', {}); }
  });
}

function makeCtx(id, container) {
  return {
    id, container, S, ui, I, on, emit, run, register, go,
    isActive: () => S.tab === id,
    setTabBarHidden
  };
}

async function loadTab(t) {
  const container = document.getElementById('tab-' + t.id);
  try {
    const mod = await t.load();
    const view = mod.default;
    if (!view || typeof view.mount !== 'function') throw new Error(`View ${t.id} hat kein mount()`);
    views.set(t.id, { view, container, mounted: false });
  } catch (e) {
    console.error(`[View ${t.id}]`, e);
    container.innerHTML = `<div class="view-error"><strong>${t.label}</strong>Dieser Bereich konnte nicht geladen werden.</div>`;
  }
}
async function mountTab(id) {
  const v = views.get(id);
  if (!v || v.mounted) return;
  try {
    await v.view.mount(v.container, makeCtx(id, v.container));
    v.mounted = true;
  } catch (e) {
    console.error(`[View ${id} mount]`, e);
    v.container.innerHTML = `<div class="view-error"><strong>${TABS.find((t) => t.id === id)?.label || id}</strong>Dieser Bereich konnte nicht geladen werden.</div>`;
  }
}

/** Zu einem Tab wechseln. opts: {keepOverlays} – sonst werden offene Sheets vorher geschlossen. */
export function go(id, opts = {}) {
  if (!TABS.some((t) => t.id === id)) return;
  if (!opts.keepOverlays && ui.overlayOpen()) ui.closeAll();
  const prev = S.tab;
  const v = views.get(id);
  if (prev === id && document.getElementById('tab-' + id).getAttribute('aria-hidden') === 'false') {
    // Erneut auf aktiven Tab tippen: nach oben
    if (v?.view.onReselect) v.view.onReselect();
    else v?.container.querySelector('.page-scroller')?.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  S.tab = id;
  S.adjusting = id === 'spiegel' ? S.adjusting : false;
  TABS.forEach((t, i) => {
    const on = t.id === id;
    document.getElementById('tab-' + t.id).setAttribute('aria-hidden', String(!on));
    document.getElementById('tab-' + t.id).inert = !on;
    tabbar.querySelector(`.tabbar-tab[data-tab="${t.id}"]`).setAttribute('aria-selected', String(on));
    if (on) pill.style.setProperty('--i', String(i));
  });
  if (prev !== id) ui.haptic('selection');
  try { views.get(prev)?.view.onHide?.(); } catch (e) { console.error(e); }
  try { v?.view.onShow?.(); } catch (e) { console.error(e); }
  emit('tab', { tab: id, prev });
}

export function setTabBarHidden(hidden) {
  tabbar?.classList.toggle('is-hidden', !!hidden);
  tabbar && (tabbar.inert = !!hidden);
}

register('go', go);
register('setTabBarHidden', setTabBarHidden);

async function start() {
  if (params.get('demo')) {
    try {
      const m = await import('./dev/seed.js');
      await m.seedIfEmpty({ body: params.get('demo') === 'body' });
    } catch (e) { console.error('[Demo-Daten]', e); }
  }
  buildShell();
  await boot();
  await Promise.all([
    ...TABS.map(loadTab),
    ...SIDE_MODULES.map((m) => m.load().then((mod) => mod.default?.init?.({ S, ui, I, on, emit, run, register, go })).catch((e) => console.error(`[Modul ${m.id}]`, e)))
  ]);
  for (const t of TABS) await mountTab(t.id);
  modulesLoaded();
  const first = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'spiegel';
  S.tab = null;
  go(first);
  document.documentElement.classList.remove('is-booting');
  if (!S.settings.onboarded || params.has('onboarding')) run('openOnboarding');
  // Outfit-Vorschauen im Leerlauf aktualisieren
  (window.requestIdleCallback || ((f) => setTimeout(f, 800)))(() => refreshStaleThumbs());
}

if (params.has('gallery')) {
  applyAppearance();
  import('./dev/gallery.js').then((m) => m.default()).catch((e) => console.error(e));
} else {
  start().catch((e) => {
    console.error(e);
    document.getElementById('app').innerHTML = '<div class="view-error"><strong>Kleiderschrank</strong>Die App konnte nicht starten. Bitte neu laden.</div>';
  });
}
