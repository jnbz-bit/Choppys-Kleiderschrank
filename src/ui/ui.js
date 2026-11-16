// UI-Bausteine im iOS-Stil: Sheets, Action Sheets, Alerts, Kontextmenü, HUD-Toast,
// Haptik, Druckzustand, Seiten mit großem Titel, Segmented Control, Federn.
// Alle Bausteine räumen sich selbst auf (Listener, DOM). API-Doku: docs/DESIGN.md

import { I } from './icons.js';

// =====================================================================
// Kleine Helfer
// =====================================================================
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (t = '') =>
  String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** HTML-String → Element (erstes Element) */
export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = String(html).trim();
  return t.content.firstElementChild;
}
/** HTML-String → DocumentFragment */
export function frag(html) {
  const t = document.createElement('template');
  t.innerHTML = String(html).trim();
  return t.content;
}
export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const isIOS = () =>
  /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// =====================================================================
// Federn (Web Animations API mit linear()-Federkurven)
// =====================================================================
const supportsLinear = typeof CSS !== 'undefined' && CSS.supports?.('animation-timing-function', 'linear(0, 1)');

/** Feder-Voreinstellungen im iOS-Sinne: response (s) + dampingFraction */
export const SPRINGS = {
  smooth: { response: 0.5, damping: 1 },     // ohne Überschwingen (Sheets, Navigation)
  snappy: { response: 0.36, damping: 0.86 }, // kurz, kaum Überschwingen (Druck, Menüs)
  bouncy: { response: 0.5, damping: 0.72 },  // spürbar federnd (Toast, Pille, Kacheln)
  sheet: { response: 0.48, damping: 1 }
};
const springCache = new Map();
/**
 * Erzeugt {easing, duration} für eine gedämpfte Feder von 0 → 1.
 * velocity: Startgeschwindigkeit relativ zur Strecke pro Sekunde (z. B. px/s ÷ px).
 */
export function springEasing(spring = 'smooth', velocity = 0) {
  const sp = typeof spring === 'string' ? SPRINGS[spring] || SPRINGS.smooth : spring;
  const key = `${sp.response}|${sp.damping}|${Math.round(velocity * 10) / 10}`;
  if (springCache.has(key)) return springCache.get(key);
  const k = (2 * Math.PI / sp.response) ** 2;
  const c = (4 * Math.PI * sp.damping) / sp.response;
  // numerisch integrieren (x = Auslenkung vom Ziel)
  let x = -1, v = velocity, t = 0;
  const dt = 1 / 600, pts = [];
  let settledFor = 0;
  while (t < 3) {
    if (Math.round(t * 600) % 10 === 0) pts.push(1 + x);
    const a = -k * x - c * v;
    v += a * dt;
    x += v * dt;
    t += dt;
    if (Math.abs(x) < 0.0015 && Math.abs(v) < 0.02) { settledFor += dt; if (settledFor > 0.03) break; } else settledFor = 0;
  }
  pts.push(1);
  const duration = Math.round(t * 1000);
  let easing;
  if (supportsLinear) {
    const step = Math.max(1, Math.floor(pts.length / 60));
    const sampled = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
    easing = `linear(${sampled.map((p) => +p.toFixed(4)).join(', ')})`;
  } else {
    easing = sp.damping >= 0.95 ? 'cubic-bezier(.32,.72,0,1)' : 'cubic-bezier(.34,1.45,.64,1)';
  }
  const res = { easing, duration: Math.max(120, duration) };
  springCache.set(key, res);
  return res;
}
/**
 * Animiert mit Federkurve. keyframes wie bei element.animate().
 * opts: { spring:'smooth'|'snappy'|'bouncy'|'sheet'|{response,damping}, velocity, delay, fill, duration }
 * Gibt die Animation zurück (await anim.finished). Bei reduzierter Bewegung kurz und ohne Feder.
 */
export function springAnimate(el, keyframes, opts = {}) {
  if (!el?.animate) return { finished: Promise.resolve(), cancel() {} };
  if (prefersReducedMotion()) {
    return el.animate(keyframes, { duration: 160, easing: 'ease-out', delay: opts.delay || 0, fill: opts.fill || 'none' });
  }
  const { easing, duration } = springEasing(opts.spring || 'smooth', opts.velocity || 0);
  return el.animate(keyframes, { duration: opts.duration || duration, easing, delay: opts.delay || 0, fill: opts.fill || 'none' });
}

/** Kapselt document.startViewTransition mit Fallback. Gibt ein Promise zurück (fertig animiert). */
export function transition(fn) {
  if (!document.startViewTransition || prefersReducedMotion()) {
    return Promise.resolve(fn());
  }
  try {
    const vt = document.startViewTransition(() => fn());
    return vt.finished.catch(() => {});
  } catch {
    return Promise.resolve(fn());
  }
}

// =====================================================================
// Haptik
// =====================================================================
let hapticLabel = null;
/**
 * Kurzes Tick. iOS (Safari ≥ 17.4/18): versteckter <input type="checkbox" switch> wird über sein Label umgeschaltet.
 * Sonst navigator.vibrate. kind: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'selection'
 */
export function haptic(kind = 'light') {
  try {
    if (isIOS()) {
      if (!hapticLabel) {
        hapticLabel = document.createElement('label');
        hapticLabel.className = 'haptic-switch';
        hapticLabel.setAttribute('aria-hidden', 'true');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.setAttribute('switch', '');
        input.tabIndex = -1;
        hapticLabel.appendChild(input);
        document.body.appendChild(hapticLabel);
      }
      hapticLabel.click();
      if (kind === 'success' || kind === 'warning') setTimeout(() => hapticLabel?.click(), 90);
      return;
    }
    if (navigator.vibrate && navigator.userActivation?.hasBeenActive) {
      navigator.vibrate(kind === 'heavy' ? 18 : kind === 'medium' ? 12 : kind === 'success' ? [8, 60, 8] : 8);
    }
  } catch { /* egal */ }
}

// =====================================================================
// Druckzustand (global) – iOS feuert :active unzuverlässig
// =====================================================================
const PRESSABLE = 'button, a[href], label.btn, label.cell, [role="button"], .pressable, .tile, .card.is-pressable';
let pressedEl = null, pressStart = null, pressTimer = 0;
function clearPressed(delay = 0) {
  const el = pressedEl;
  pressedEl = null;
  if (!el) return;
  clearTimeout(pressTimer);
  if (delay) pressTimer = setTimeout(() => el.removeAttribute('data-pressed'), delay);
  else el.removeAttribute('data-pressed');
}
function initPressable() {
  const down = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = e.target.closest?.(PRESSABLE);
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true' || el.closest('[inert]')) return;
    clearPressed();
    pressedEl = el;
    pressStart = { x: e.clientX, y: e.clientY, t: performance.now() };
    el.setAttribute('data-pressed', '');
  };
  const move = (e) => {
    if (!pressedEl || !pressStart) return;
    if (Math.hypot(e.clientX - pressStart.x, e.clientY - pressStart.y) > 12) clearPressed();
  };
  const up = () => {
    if (!pressedEl) return;
    // kurzes Antippen trotzdem sichtbar machen
    const held = performance.now() - (pressStart?.t || 0);
    clearPressed(held < 90 ? 90 - held : 0);
  };
  document.addEventListener('pointerdown', down, { passive: true, capture: true });
  document.addEventListener('pointermove', move, { passive: true, capture: true });
  document.addEventListener('pointerup', up, { passive: true, capture: true });
  document.addEventListener('pointercancel', () => clearPressed(), { passive: true, capture: true });
  document.addEventListener('scroll', () => clearPressed(), { passive: true, capture: true });
  // iOS braucht einen touchstart-Listener, damit :active überhaupt greift
  document.addEventListener('touchstart', () => {}, { passive: true });

  // Schalter: Haptik
  document.addEventListener('change', (e) => {
    if (e.target.matches?.('input.switch')) haptic('light');
  });
  // Regler: Fortschritt einfärben
  document.addEventListener('input', (e) => {
    if (e.target.matches?.('input.slider')) syncSlider(e.target);
  });
  new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (n.matches('input.slider')) syncSlider(n);
      n.querySelectorAll?.('input.slider').forEach(syncSlider);
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
}
/** Regler-Füllung aktualisieren (nach programmatischem Setzen von .value aufrufen). */
export function syncSlider(input) {
  const min = +input.min || 0, max = +input.max || 100, v = +input.value;
  input.style.setProperty('--val', ((v - min) / (max - min || 1)) * 100 + '%');
}

// =====================================================================
// Overlay-Stapel (Sheets, Action Sheets, Alerts, Menüs)
// =====================================================================
const stack = []; // {kind, layer, el, large, dismiss(reason), restoreFocus}
const appRoot = () => document.getElementById('app');
let gapTopPx = null;
function sheetGapTop() {
  if (gapTopPx != null) return gapTopPx;
  const p = document.createElement('div');
  p.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:var(--sheet-gap-top);visibility:hidden;pointer-events:none';
  document.body.appendChild(p);
  gapTopPx = p.offsetHeight || 10;
  p.remove();
  return gapTopPx;
}

function makeLayer(z) {
  const layer = document.createElement('div');
  layer.className = 'overlay-layer';
  layer.style.zIndex = String(200 + z * 10);
  document.body.appendChild(layer);
  return layer;
}
function syncStack() {
  const sheets = stack.filter((r) => r.kind === 'sheet' && !r.closing);
  const anyLarge = sheets.some((r) => r.large);
  document.documentElement.classList.toggle('has-page-sheet', anyLarge);
  sheets.forEach((r, i) => {
    const behind = i < sheets.length - 1;
    r.el.classList.toggle('is-behind', behind);
    r.el.inert = behind;
  });
  const app = appRoot();
  if (app) app.inert = stack.length > 0;
  stack.forEach((r, i) => { if (i < stack.length - 1 && r.kind !== 'sheet') r.layer.inert = true; else r.layer.inert = false; });
}
function pushOverlay(rec) {
  rec.restoreFocus = document.activeElement;
  stack.push(rec);
  syncStack();
}
function popOverlay(rec) {
  const i = stack.indexOf(rec);
  if (i >= 0) stack.splice(i, 1);
  syncStack();
  const f = rec.restoreFocus;
  if (f && f.isConnected && !f.closest('[inert]') && typeof f.focus === 'function') {
    try { f.focus({ preventScroll: true }); } catch { /* egal */ }
  }
}
/** Gibt es gerade ein offenes Overlay? */
export const overlayOpen = () => stack.length > 0;
/** Schließt alle offenen Overlays (z. B. vor Tab-Wechsel). */
export async function closeAll() {
  for (const r of [...stack].reverse()) await r.dismiss?.('programmatic');
}

function focusables(root) {
  return $$('button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])', root)
    .filter((n) => n.offsetParent !== null || n === document.activeElement);
}
document.addEventListener('keydown', (e) => {
  const top = stack[stack.length - 1];
  if (!top) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    top.dismiss?.('escape');
  } else if (e.key === 'Tab') {
    const f = focusables(top.layer);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (!top.layer.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  }
});

// visualViewport: Overlays bleiben über der iOS-Tastatur
function syncViewport() {
  const vv = window.visualViewport;
  const root = document.documentElement;
  if (!vv) return;
  root.style.setProperty('--vv-top', vv.offsetTop + 'px');
  root.style.setProperty('--vv-h', vv.height + 'px');
  const kb = window.innerHeight - vv.height > 140;
  if (kb !== root.classList.contains('kb-open')) {
    root.classList.toggle('kb-open', kb);
    if (kb) setTimeout(() => {
      const a = document.activeElement;
      if (a && a.closest?.('.overlay-layer')) a.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 60);
  }
}
if (window.visualViewport) {
  visualViewport.addEventListener('resize', syncViewport);
  visualViewport.addEventListener('scroll', syncViewport);
}
document.addEventListener('focusin', (e) => {
  const t = e.target;
  if (!t.matches?.('input, textarea, [contenteditable]') || !t.closest('.overlay-layer')) return;
  setTimeout(() => {
    syncViewport();
    if (document.documentElement.classList.contains('kb-open')) t.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, 320);
});

// =====================================================================
// Sheet
// =====================================================================
function headerButton(spec, sheetApi, side) {
  if (!spec) return null;
  if (spec instanceof HTMLElement) return spec;
  const b = document.createElement('button');
  b.type = 'button';
  if (spec.icon) {
    b.className = 'icon-btn' + (spec.bold ? ' is-filled' : '');
    b.innerHTML = spec.icon;
    b.setAttribute('aria-label', spec.label || '');
  } else {
    b.className = 'btn ' + (spec.bold ? 'btn-filled is-bold' : spec.destructive ? 'btn-glass btn-destructive' : 'btn-glass');
    b.textContent = spec.label || '';
  }
  if (spec.disabled) b.disabled = true;
  b.addEventListener('click', () => {
    if (spec.bold) haptic('light');
    if (spec.onTap) spec.onTap(sheetApi, b);
    else if (side === 'leading') sheetApi.close('cancel');
  });
  return b;
}

/**
 * Öffnet ein Sheet von unten.
 * @param {object} o
 *  title, content (Element|String-HTML), html (String), detent: 'medium'|'large',
 *  leading/trailing: {label, icon?, onTap(sheet, btn)?, bold?, disabled?, destructive?} | HTMLElement,
 *  onClose(reason), dismissible (Standard true), className, plain (weißer Grund statt grau), label (aria)
 * @returns {{el, body, header, close(reason?):Promise, setTitle(t), setTrailingEnabled(b), setLeadingEnabled(b), closed:Promise}}
 */
export function sheet(o = {}) {
  const detent = o.detent === 'medium' ? 'medium' : 'large';
  const large = detent === 'large';
  const dismissible = o.dismissible !== false;
  const layer = makeLayer(stack.length);
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  const el = document.createElement('section');
  el.className = `sheet is-${detent}${o.plain ? ' is-plain' : ''}${o.className ? ' ' + o.className : ''}`;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.tabIndex = -1;
  const titleId = 'st-' + Math.random().toString(36).slice(2, 8);
  el.innerHTML = `<div class="sheet-grabber" aria-hidden="true"></div>
    <header class="sheet-header"><div class="sheet-leading"></div><h2 class="sheet-title" id="${titleId}"></h2><div class="sheet-trailing"></div></header>
    <div class="sheet-body"></div>`;
  const header = el.querySelector('.sheet-header');
  const body = el.querySelector('.sheet-body');
  const titleEl = el.querySelector('.sheet-title');
  if (o.title) el.setAttribute('aria-labelledby', titleId);
  else if (o.label) el.setAttribute('aria-label', o.label);
  layer.append(backdrop, el);

  let resolveClosed;
  const closed = new Promise((r) => (resolveClosed = r));
  let closing = false;
  let anim = null;

  const api = {
    el, body, header, layer, closed,
    close: (reason = 'programmatic') => close(reason),
    setTitle(t) {
      titleEl.textContent = t || '';
      header.classList.toggle('is-empty', !t && !api._lead && !api._trail);
    },
    setTrailingEnabled(on) { if (api._trail) api._trail.disabled = !on; },
    setLeadingEnabled(on) { if (api._lead) api._lead.disabled = !on; },
    setTrailing(spec) {
      const box = header.querySelector('.sheet-trailing');
      box.replaceChildren();
      api._trail = headerButton(spec, api, 'trailing');
      if (api._trail) box.appendChild(api._trail);
    },
    setLeading(spec) {
      const box = header.querySelector('.sheet-leading');
      box.replaceChildren();
      api._lead = headerButton(spec, api, 'leading');
      if (api._lead) box.appendChild(api._lead);
    },
    /** Inhalt ersetzen (Element oder HTML-String). Scrollt nach oben. */
    setContent(c) {
      if (typeof c === 'string') body.innerHTML = c;
      else body.replaceChildren(...(c ? [c] : []));
      body.scrollTop = 0;
    }
  };
  api.setLeading(o.leading);
  api.setTrailing(o.trailing);
  api.setTitle(o.title || '');
  if (o.content instanceof Node) body.appendChild(o.content);
  else if (typeof o.content === 'string') body.innerHTML = o.content;
  else if (o.html) body.innerHTML = o.html;

  const rec = { kind: 'sheet', layer, el, large, dismiss: (reason) => (dismissible || reason === 'programmatic' ? close(reason) : shake()) };
  pushOverlay(rec);

  // --- Darunterliegendes Element (App oder vorheriges Sheet) live mitführen ---
  const behindTarget = () => {
    const sheets = stack.filter((r) => r.kind === 'sheet' && (!r.closing || r === rec));
    const i = sheets.indexOf(rec);
    if (i > 0) return { el: sheets[i - 1].el, kind: 'sheet' };
    if (large && !sheets.some((r, j) => j !== i && r.large)) return { el: appRoot(), kind: 'app' };
    return null;
  };
  const setBehind = (p) => { // p: 1 = Sheet ganz offen, 0 = geschlossen
    const b = behindTarget();
    if (!b?.el) return;
    b.el.classList.add('is-tracking');
    if (b.kind === 'app') {
      b.el.style.translate = `0 ${sheetGapTop() * p}px`;
      b.el.style.scale = String(1 - 0.06 * p);
      b.el.style.borderRadius = `${14 * p}px`;
    } else {
      b.el.style.translate = `0 ${-10 * p}px`;
      b.el.style.scale = String(1 - 0.06 * p);
    }
  };
  const releaseBehind = () => {
    const b = behindTarget();
    if (!b?.el) return;
    b.el.classList.remove('is-tracking');
    b.el.style.translate = '';
    b.el.style.scale = '';
    b.el.style.borderRadius = '';
  };

  const height = () => el.offsetHeight || window.innerHeight;
  const currentY = () => {
    const m = getComputedStyle(el).transform;
    if (!m || m === 'none') return 0;
    const parts = m.match(/matrix(3d)?\(([^)]+)\)/);
    if (!parts) return 0;
    const v = parts[2].split(',').map(Number);
    return parts[1] ? v[13] : v[5];
  };
  const setY = (y) => {
    el.style.transform = `translateY(${y}px)`;
    backdrop.style.opacity = String(clamp(1 - y / height(), 0, 1));
  };
  const animateTo = (toY, velocity = 0) => {
    const fromY = currentY();
    anim?.cancel();
    const dist = toY - fromY;
    const v = dist !== 0 ? velocity / dist : 0; // relativ
    el.style.transform = `translateY(${toY}px)`;
    const a = springAnimate(el, [{ transform: `translateY(${fromY}px)` }, { transform: `translateY(${toY}px)` }], { spring: 'sheet', velocity: clamp(v, -20, 20) });
    const h0 = height();
    const fromO = clamp(1 - fromY / h0, 0, 1), toO = clamp(1 - toY / h0, 0, 1);
    backdrop.style.opacity = String(toO);
    springAnimate(backdrop, [{ opacity: fromO }, { opacity: toO }], { spring: 'sheet' });
    anim = a;
    return a.finished.catch(() => {});
  };

  // --- Öffnen ---
  el.style.transform = 'translateY(105%)';
  requestAnimationFrame(() => {
    const h0 = height();
    el.style.transform = `translateY(${h0 + 20}px)`;
    animateTo(0);
    try { el.focus({ preventScroll: true }); } catch { /* egal */ }
  });

  async function close(reason, velocity = 0) {
    if (closing) return closed;
    closing = true;
    el.inert = true;
    o.onClose?.(reason);
    // App/vorheriges Sheet zurückfedern lassen (CSS-Übergang)
    releaseBehind();
    rec.closing = true;
    syncStack();
    await animateTo(height() + 30, velocity);
    layer.remove();
    popOverlay(rec);
    resolveClosed(reason);
    return closed;
  }
  function shake() {
    const y = currentY();
    springAnimate(el, [{ transform: `translateY(${y}px)` }, { transform: `translateY(${y + 18}px)` }, { transform: `translateY(${y}px)` }], { spring: 'bouncy' });
  }

  backdrop.addEventListener('click', () => rec.dismiss('backdrop'));

  // --- Ziehen zum Schließen ---
  let drag = null;
  const rubber = (d) => -(1 - 1 / ((-d * 0.55) / 120 + 1)) * 120;
  const start = (x, y, target) => {
    if (closing) return;
    const fromHandle = !!target.closest('.sheet-grabber, .sheet-header') && !target.closest('button, input, a, select, textarea');
    if (target.closest('input, textarea, select, [contenteditable], .no-sheet-drag, input.slider')) return;
    drag = { x0: x, y0: y, y: 0, fromHandle, mode: null, samples: [{ y: 0, t: performance.now() }], baseY: currentY() };
  };
  const move = (x, y, ev) => {
    if (!drag) return;
    const dx = x - drag.x0, dy = y - drag.y0;
    if (!drag.mode) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (Math.abs(dx) > Math.abs(dy)) { drag.mode = 'ignore'; return; }
      const scroller = ev?.target?.closest?.('.sheet-body');
      const atTop = !scroller || scroller.scrollTop <= 0;
      if (drag.fromHandle || (atTop && dy > 0)) {
        drag.mode = 'drag';
        anim?.cancel();
        drag.baseY = currentY();
        drag.y0 = y - 0; // ab hier 1:1
        el.classList.add('is-dragging');
      } else { drag.mode = 'ignore'; return; }
    }
    if (drag.mode !== 'drag') return;
    ev?.cancelable && ev.preventDefault();
    let d = y - drag.y0 + drag.baseY;
    if (d < 0) d = rubber(d);
    if (!dismissible && d > 0) d = d * 0.35;
    drag.y = d;
    setY(d);
    setBehind(clamp(1 - d / height(), 0, 1));
    const now = performance.now();
    drag.samples.push({ y: d, t: now });
    while (drag.samples.length > 2 && now - drag.samples[0].t > 90) drag.samples.shift();
  };
  const end = () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    el.classList.remove('is-dragging');
    if (d.mode !== 'drag') return;
    const s0 = d.samples[0], s1 = d.samples[d.samples.length - 1];
    const v = s1.t > s0.t ? ((s1.y - s0.y) / (s1.t - s0.t)) * 1000 : 0; // px/s
    const h0 = height();
    if (dismissible && (d.y > h0 * 0.33 || (v > 700 && d.y > 12))) {
      close('drag', v);
    } else {
      releaseBehind();
      animateTo(0, v);
    }
  };
  // Touch (iOS) – non-passiv, damit wir das Scrollen übernehmen können
  el.addEventListener('touchstart', (e) => { if (e.touches.length === 1) start(e.touches[0].clientX, e.touches[0].clientY, e.target); else drag = null; }, { passive: true });
  el.addEventListener('touchmove', (e) => { if (e.touches.length === 1) move(e.touches[0].clientX, e.touches[0].clientY, e); }, { passive: false });
  el.addEventListener('touchend', end);
  el.addEventListener('touchcancel', end);
  // Maus (Desktop-Test)
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    start(e.clientX, e.clientY, e.target);
    if (!drag) return;
    const mm = (ev) => move(ev.clientX, ev.clientY, ev);
    const mu = () => { window.removeEventListener('pointermove', mm); window.removeEventListener('pointerup', mu); end(); };
    window.addEventListener('pointermove', mm);
    window.addEventListener('pointerup', mu);
  });

  return api;
}

// =====================================================================
// Action Sheet
// =====================================================================
/**
 * actionSheet({title, message, actions:[{label, value, destructive, icon}], cancel:'Abbrechen'}) → Promise<value|null>
 */
export function actionSheet({ title = '', message = '', actions = [], cancel = 'Abbrechen' } = {}) {
  return new Promise((resolve) => {
    const layer = makeLayer(stack.length);
    const backdrop = document.createElement('div');
    backdrop.className = 'sheet-backdrop';
    const box = document.createElement('div');
    box.className = 'action-sheet';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    if (title) box.setAttribute('aria-label', title);
    const head = title || message
      ? `<div class="as-header">${title ? `<div class="as-title">${esc(title)}</div>` : ''}${message ? `<div class="as-message">${esc(message)}</div>` : ''}</div>`
      : '';
    box.innerHTML = `<div class="as-group">${head}${actions
      .map((a, i) => `<button type="button" class="as-btn${a.destructive ? ' is-destructive' : ''}" data-i="${i}">${a.icon || ''}<span>${esc(a.label)}</span></button>`)
      .join('')}</div>${cancel ? `<div class="as-group"><button type="button" class="as-btn is-cancel" data-cancel>${esc(cancel)}</button></div>` : ''}`;
    layer.append(backdrop, box);
    let done = false;
    const rec = { kind: 'action', layer, el: box, dismiss: () => finish(null) };
    pushOverlay(rec);
    springAnimate(backdrop, [{ opacity: 0 }, { opacity: 1 }], { spring: 'smooth', fill: 'forwards' });
    springAnimate(box, [{ transform: 'translateY(110%)' }, { transform: 'none' }], { spring: 'sheet', fill: 'forwards' });
    requestAnimationFrame(() => box.querySelector('.as-btn')?.focus({ preventScroll: true }));
    async function finish(value) {
      if (done) return;
      done = true;
      box.inert = true;
      resolve(value);
      await Promise.all([
        springAnimate(box, [{ transform: 'none' }, { transform: 'translateY(115%)' }], { spring: 'sheet', fill: 'forwards' }).finished,
        springAnimate(backdrop, [{ opacity: 1 }, { opacity: 0 }], { spring: 'smooth', fill: 'forwards' }).finished
      ]).catch(() => {});
      layer.remove();
      popOverlay(rec);
    }
    backdrop.addEventListener('click', () => finish(null));
    box.addEventListener('click', (e) => {
      const b = e.target.closest('.as-btn');
      if (!b) return;
      if (b.hasAttribute('data-cancel')) return finish(null);
      const a = actions[+b.dataset.i];
      if (a.destructive) haptic('medium');
      finish(a.value !== undefined ? a.value : a.label);
    });
  });
}

// =====================================================================
// Alert / Bestätigung / Eingabe
// =====================================================================
/**
 * alert({title, message, buttons:[{label, value, bold, destructive}], input:{placeholder,value}}) → Promise<value>
 * Ohne buttons: ein „OK“. Mit input: Promise<{value, text}>.
 */
export function alert({ title = '', message = '', buttons, input = null, dismissValue } = {}) {
  const btns = buttons?.length ? buttons : [{ label: 'OK', value: true, bold: true }];
  return new Promise((resolve) => {
    const layer = makeLayer(stack.length);
    const backdrop = document.createElement('div');
    backdrop.className = 'sheet-backdrop';
    const wrap = document.createElement('div');
    wrap.className = 'alert-wrap';
    const box = document.createElement('div');
    box.className = 'alert';
    box.setAttribute('role', 'alertdialog');
    box.setAttribute('aria-modal', 'true');
    const tid = 'al-' + Math.random().toString(36).slice(2, 7);
    box.setAttribute('aria-labelledby', tid);
    box.innerHTML = `${title ? `<div class="alert-title" id="${tid}">${esc(title)}</div>` : ''}
      ${message ? `<div class="alert-message">${esc(message)}</div>` : ''}
      ${input ? `<input class="textfield" type="text" autocomplete="off" placeholder="${esc(input.placeholder || '')}" value="${esc(input.value || '')}">` : ''}
      <div class="alert-actions${btns.length > 2 ? ' is-vertical' : ''}">${btns
        .map((b, i) => `<button type="button" class="btn${b.bold ? ' is-bold' : ''}${b.destructive ? ' is-destructive' : ''}" data-i="${i}">${esc(b.label)}</button>`)
        .join('')}</div>`;
    wrap.appendChild(box);
    layer.append(backdrop, wrap);
    let done = false;
    const field = box.querySelector('input');
    const rec = { kind: 'alert', layer, el: box, dismiss: (r) => { if (r === 'escape' || r === 'programmatic') finish(dismissValue ?? cancelValue()); } };
    const cancelValue = () => {
      const c = btns.find((b) => !b.bold && !b.destructive) || null;
      return c ? (c.value !== undefined ? c.value : c.label) : null;
    };
    pushOverlay(rec);
    springAnimate(backdrop, [{ opacity: 0 }, { opacity: 1 }], { spring: 'smooth', fill: 'forwards' });
    springAnimate(box, [{ opacity: 0, transform: 'scale(1.16)' }, { opacity: 1, transform: 'scale(1)' }], { spring: 'snappy', fill: 'forwards' });
    haptic('light');
    requestAnimationFrame(() => (field || box.querySelector('.btn.is-bold') || box.querySelector('.btn'))?.focus({ preventScroll: true }));
    async function finish(value) {
      if (done) return;
      done = true;
      box.inert = true;
      resolve(input ? { value, text: field.value } : value);
      await Promise.all([
        box.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.96)' }], { duration: 180, easing: 'ease-out', fill: 'forwards' }).finished,
        backdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-out', fill: 'forwards' }).finished
      ]).catch(() => {});
      layer.remove();
      popOverlay(rec);
    }
    box.addEventListener('click', (e) => {
      const b = e.target.closest('.btn[data-i]');
      if (!b) return;
      const spec = btns[+b.dataset.i];
      finish(spec.value !== undefined ? spec.value : spec.label);
    });
    field?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const bold = btns.find((b) => b.bold) || btns[btns.length - 1];
        finish(bold.value !== undefined ? bold.value : bold.label);
      }
    });
  });
}
/** confirm({title, message, confirmLabel='OK', cancelLabel='Abbrechen', destructive}) → Promise<boolean> */
export function confirm({ title = '', message = '', confirmLabel = 'OK', cancelLabel = 'Abbrechen', destructive = false } = {}) {
  return alert({
    title, message,
    buttons: [
      { label: cancelLabel, value: false },
      { label: confirmLabel, value: true, bold: true, destructive }
    ],
    dismissValue: false
  }).then((v) => v === true);
}
/** prompt({title, message, value, placeholder, confirmLabel='Sichern'}) → Promise<string|null> */
export async function prompt({ title = '', message = '', value = '', placeholder = '', confirmLabel = 'Sichern', cancelLabel = 'Abbrechen' } = {}) {
  const r = await alert({
    title, message, input: { value, placeholder },
    buttons: [{ label: cancelLabel, value: false }, { label: confirmLabel, value: true, bold: true }],
    dismissValue: false
  });
  return r.value ? r.text : null;
}

// =====================================================================
// HUD-Toast
// =====================================================================
let currentToast = null;
/**
 * toast(text, {icon, action:{label, onTap}, duration, position:'auto'|'top'|'bottom', haptic}) → {close()}
 * Nur ein Toast gleichzeitig; ein neuer ersetzt den alten.
 */
export function toast(text, opts = {}) {
  currentToast?.close(true);
  const pos = opts.position && opts.position !== 'auto'
    ? opts.position
    : stack.length || document.querySelector('.tabbar.is-hidden') ? 'top' : 'bottom';
  const t = document.createElement('div');
  t.className = `toast is-${pos}${opts.icon ? ' has-icon' : ''}`;
  t.setAttribute('role', 'status');
  t.setAttribute('aria-live', 'polite');
  t.innerHTML = `${opts.icon ? `<span class="toast-icon">${opts.icon}</span>` : ''}<span class="toast-text">${esc(text)}</span>${opts.action ? `<button type="button" class="toast-action">${esc(opts.action.label)}</button>` : ''}`;
  document.body.appendChild(t);
  const dy = pos === 'top' ? -24 : 24;
  springAnimate(t, [{ opacity: 0, transform: `translate(-50%, ${dy}px) scale(.86)` }, { opacity: 1, transform: 'translate(-50%, 0) scale(1)' }], { spring: 'bouncy', fill: 'forwards' });
  if (opts.haptic) haptic(opts.haptic === true ? 'light' : opts.haptic);
  let closed = false;
  const api = {
    el: t,
    close(fast = false) {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      if (currentToast === api) currentToast = null;
      const a = t.animate([{ opacity: 1, transform: 'translate(-50%, 0) scale(1)' }, { opacity: 0, transform: `translate(-50%, ${dy * 0.5}px) scale(.92)` }], { duration: fast ? 120 : 220, easing: 'ease-in', fill: 'forwards' });
      a.finished.then(() => t.remove(), () => t.remove());
    }
  };
  const timer = setTimeout(() => api.close(), opts.duration ?? (opts.action ? 4500 : 2200));
  t.querySelector('.toast-action')?.addEventListener('click', () => { api.close(); opts.action.onTap?.(); });
  currentToast = api;
  return api;
}

// =====================================================================
// Kontextmenü + langes Drücken
// =====================================================================
/**
 * contextMenu(targetEl, {actions:[{label, icon, destructive, onTap}], preview:true}) → Promise<void>
 * Hebt eine Kopie des Elements an, Hintergrund unscharf, Glas-Menü darunter (oder darüber).
 */
export function contextMenu(target, { actions = [], preview = true } = {}) {
  return new Promise((resolve) => {
    haptic('medium');
    const rect = target.getBoundingClientRect();
    const layer = makeLayer(stack.length);
    const back = document.createElement('div');
    back.className = 'cm-backdrop';
    layer.appendChild(back);
    let pv = null;
    if (preview) {
      pv = document.createElement('div');
      pv.className = 'cm-preview';
      const clone = target.cloneNode(true);
      clone.removeAttribute('data-pressed');
      clone.removeAttribute('id');
      // Canvas-Inhalte mitkopieren
      const srcC = target.querySelectorAll('canvas'), dstC = clone.querySelectorAll('canvas');
      srcC.forEach((c, i) => { try { dstC[i].getContext('2d').drawImage(c, 0, 0); } catch { /* egal */ } });
      pv.appendChild(clone);
      Object.assign(pv.style, { left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px', borderRadius: getComputedStyle(target).borderRadius });
      layer.appendChild(pv);
    }
    const menu = document.createElement('div');
    menu.className = 'cm-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = actions.map((a, i) => `<button type="button" role="menuitem" class="cm-item${a.destructive ? ' is-destructive' : ''}" data-i="${i}"><span>${esc(a.label)}</span>${a.icon || ''}</button>`).join('');
    layer.appendChild(menu);

    // Platz berechnen
    const vw = window.innerWidth, vh = layer.clientHeight || window.innerHeight;
    const safeTop = sheetGapTop() + 6, safeBottom = 16;
    const lift = preview ? 1.04 : 1;
    const mh = menu.offsetHeight, mw = menu.offsetWidth;
    const ph = rect.height * lift;
    let shift = 0;
    let below = true;
    const pvTop = rect.top - (ph - rect.height) / 2;
    if (pvTop + ph + 12 + mh > vh - safeBottom) {
      if (pvTop - 12 - mh >= safeTop) below = false;
      else shift = (vh - safeBottom) - (pvTop + ph + 12 + mh); // Vorschau nach oben schieben
    }
    if (pvTop + shift < safeTop && below) shift = Math.max(shift, safeTop - pvTop);
    const cx = rect.left + rect.width / 2;
    let left = cx > vw / 2 ? rect.right - mw : rect.left;
    left = clamp(left, 12, vw - mw - 12);
    const top = below ? pvTop + ph + shift + 12 : pvTop - 12 - mh;
    Object.assign(menu.style, { left: left + 'px', top: top + 'px', transformOrigin: `${clamp(cx - left, 20, mw - 20)}px ${below ? 0 : mh}px` });

    target.style.visibility = 'hidden';
    const rec = { kind: 'menu', layer, el: menu, dismiss: () => finish(null) };
    pushOverlay(rec);
    springAnimate(back, [{ opacity: 0 }, { opacity: 1 }], { spring: 'smooth', fill: 'forwards' });
    if (pv) springAnimate(pv, [{ transform: 'translateY(0) scale(1)' }, { transform: `translateY(${shift}px) scale(${lift})` }], { spring: 'bouncy', fill: 'forwards' });
    springAnimate(menu, [{ opacity: 0, transform: 'scale(.5)' }, { opacity: 1, transform: 'scale(1)' }], { spring: 'bouncy', fill: 'forwards' });
    requestAnimationFrame(() => menu.querySelector('.cm-item')?.focus({ preventScroll: true }));

    let done = false;
    async function finish(action) {
      if (done) return;
      done = true;
      layer.inert = true;
      const anims = [
        menu.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.7)' }], { duration: 200, easing: 'ease-in', fill: 'forwards' }).finished,
        back.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease-out', fill: 'forwards' }).finished
      ];
      if (pv) anims.push(springAnimate(pv, [{ transform: `translateY(${shift}px) scale(${lift})` }, { transform: 'translateY(0) scale(1)' }], { spring: 'snappy', fill: 'forwards' }).finished);
      if (action?.onTap) setTimeout(() => action.onTap(), 40);
      await Promise.all(anims).catch(() => {});
      target.style.visibility = '';
      layer.remove();
      popOverlay(rec);
      resolve(action ? (action.value ?? action.label) : null);
    }
    back.addEventListener('click', () => finish(null));
    back.addEventListener('touchstart', (e) => { e.preventDefault(); finish(null); }, { passive: false });
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('.cm-item');
      if (b) finish(actions[+b.dataset.i]);
    });
  });
}

/**
 * Langes Drücken (500 ms). Bricht bei Bewegung/Scroll ab, unterdrückt den folgenden Klick und das iOS-Callout.
 * bindLongPress(el, fn(targetEl, event), {delay=500, selector}) → unbind()
 * Mit selector: Delegation – fn bekommt das passende Kind-Element.
 */
export function bindLongPress(el, fn, { delay = 500, selector = null } = {}) {
  let timer = 0, start = null, fired = false, targetEl = null;
  el.style.webkitTouchCallout = 'none';
  const cancel = () => { clearTimeout(timer); timer = 0; start = null; };
  const suppressClick = () => {
    const stop = (e) => { e.stopPropagation(); e.preventDefault(); };
    window.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 700);
  };
  const down = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    targetEl = selector ? e.target.closest(selector) : el;
    if (!targetEl || !el.contains(targetEl)) return;
    fired = false;
    start = { x: e.clientX, y: e.clientY };
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = 0;
      fired = true;
      targetEl.removeAttribute('data-pressed');
      suppressClick();
      try { window.getSelection()?.removeAllRanges(); } catch { /* egal */ }
      fn(targetEl, e);
    }, delay);
  };
  const move = (e) => {
    if (!start) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel();
  };
  const ctx = (e) => {
    const t = selector ? e.target.closest(selector) : el;
    if (!t || !el.contains(t)) return;
    e.preventDefault();
    if (!fired && e.pointerType !== 'touch' && !timer) { fired = true; fn(t, e); }
  };
  const sel = (e) => { if (timer || fired) e.preventDefault(); };
  el.addEventListener('pointerdown', down, { passive: true });
  el.addEventListener('pointermove', move, { passive: true });
  el.addEventListener('pointerup', cancel, { passive: true });
  el.addEventListener('pointercancel', cancel, { passive: true });
  el.addEventListener('contextmenu', ctx);
  el.addEventListener('selectstart', sel);
  window.addEventListener('scroll', cancel, { passive: true, capture: true });
  return () => {
    cancel();
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', cancel);
    el.removeEventListener('pointercancel', cancel);
    el.removeEventListener('contextmenu', ctx);
    el.removeEventListener('selectstart', sel);
    window.removeEventListener('scroll', cancel, { capture: true });
  };
}

// =====================================================================
// Bausteine (DOM)
// =====================================================================
/** Kapsel-Knopf. variant: filled|tinted|gray|plain|glass|destructive · size: small|large · block */
export function button({ label = '', icon = '', variant = 'gray', size = '', block = false, onTap, disabled = false, className = '', type = 'button' } = {}) {
  const b = document.createElement('button');
  b.type = type;
  b.className = ['btn', variant && `btn-${variant}`, size && `btn-${size}`, block && 'btn-block', className].filter(Boolean).join(' ');
  b.innerHTML = `${icon}${label ? `<span>${esc(label)}</span>` : ''}`;
  b.disabled = !!disabled;
  if (onTap) b.addEventListener('click', (e) => onTap(e, b));
  return b;
}
/** Runder Glas-Icon-Knopf. variant: ''|plain|tint|filled · size: small|large · label = aria-label */
export function iconButton({ icon, label = '', variant = '', size = '', onTap, disabled = false, className = '' } = {}) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = ['icon-btn', variant && `is-${variant}`, size && `is-${size}`, className].filter(Boolean).join(' ');
  b.innerHTML = icon || '';
  if (label) { b.setAttribute('aria-label', label); b.title = label; }
  b.disabled = !!disabled;
  if (onTap) b.addEventListener('click', (e) => onTap(e, b));
  return b;
}
/** Leerzustand (ContentUnavailableView). action: {label, icon, onTap, variant} */
export function emptyState({ icon = '', title = '', text = '', action = null, fill = false } = {}) {
  const el = h(`<div class="empty${fill ? ' is-fill' : ''}">
    ${icon ? `<div class="empty-symbol">${icon}</div>` : ''}
    <div class="empty-title">${esc(title)}</div>
    ${text ? `<p class="empty-text">${esc(text)}</p>` : ''}
  </div>`);
  if (action) el.appendChild(button({ variant: 'filled', ...action }));
  return el;
}
/** Fortschritt setzen: value 0..1 oder null (unbestimmt). */
export function setProgress(el, value) {
  el.classList.toggle('is-indeterminate', value == null);
  if (!el.firstElementChild) el.appendChild(document.createElement('i'));
  if (value != null) el.style.setProperty('--value', String(clamp(value, 0, 1)));
  el.setAttribute('role', 'progressbar');
  if (value != null) el.setAttribute('aria-valuenow', String(Math.round(value * 100)));
  else el.removeAttribute('aria-valuenow');
}
/** iOS-Spinner-Markup */
export const spinnerHTML = (large = false) =>
  `<span class="spinner${large ? ' is-large' : ''}" role="progressbar" aria-label="Lädt">${Array.from({ length: 8 }, (_, i) => `<i style="transform:rotate(${i * 45}deg);animation-delay:${(i - 8) / 8}s"></i>`).join('')}</span>`;

/**
 * Segmented Control.
 * segmented({items:[{value,label,icon}], value, onChange(value), small}) → {el, value, set(v,{silent})}
 * segmented(el) – vorhandenes Markup (.segmented > button[data-value]) aufwerten.
 */
export function segmented(arg = {}) {
  let el, items, onChange;
  if (arg instanceof HTMLElement) {
    el = arg;
    items = $$('button', el).map((b) => ({ value: b.dataset.value, label: b.textContent }));
    onChange = null;
  } else {
    items = arg.items || [];
    onChange = arg.onChange;
    el = document.createElement('div');
    el.className = 'segmented' + (arg.small ? ' is-small' : '') + (arg.className ? ' ' + arg.className : '');
    el.setAttribute('role', 'group');
    if (arg.label) el.setAttribute('aria-label', arg.label);
    el.innerHTML = items.map((it) => `<button type="button" data-value="${esc(it.value)}" aria-pressed="false">${it.icon || ''}${esc(it.label)}</button>`).join('');
  }
  if (!el.querySelector('.segmented-thumb')) el.insertAdjacentHTML('afterbegin', '<span class="segmented-thumb" aria-hidden="true"></span>');
  el.style.setProperty('--n', String(items.length));
  const btns = $$('button', el);
  let value = arg.value ?? btns.find((b) => b.getAttribute('aria-pressed') === 'true')?.dataset.value ?? items[0]?.value;
  const api = {
    el,
    get value() { return value; },
    set(v, { silent = false } = {}) {
      const i = Math.max(0, btns.findIndex((b) => b.dataset.value === String(v)));
      const changed = String(value) !== String(v);
      value = items[i]?.value;
      el.style.setProperty('--i', String(i));
      btns.forEach((b, j) => b.setAttribute('aria-pressed', String(i === j)));
      if (changed && !silent) {
        haptic('selection');
        onChange?.(value);
        el.dispatchEvent(new CustomEvent('change', { detail: { value }, bubbles: true }));
      }
    },
    onChange(fn) { onChange = fn; }
  };
  api.set(value, { silent: true });
  // Tippen + Daumen ziehen
  let dragging = false;
  const idxAt = (x) => {
    const r = el.getBoundingClientRect();
    return clamp(Math.floor(((x - r.left) / r.width) * items.length), 0, items.length - 1);
  };
  el.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    dragging = b.getAttribute('aria-pressed') === 'true';
    if (dragging) { el.style.setProperty('--thumb-scale', '.95'); try { el.setPointerCapture(e.pointerId); } catch { /* egal */ } }
  });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    el.style.setProperty('--i', String(idxAt(e.clientX)));
  });
  const up = (e) => {
    if (!dragging) return;
    dragging = false;
    el.style.removeProperty('--thumb-scale');
    api.set(items[idxAt(e.clientX)].value);
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', () => { dragging = false; el.style.removeProperty('--thumb-scale'); api.set(value, { silent: true }); });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) api.set(items[btns.indexOf(b)].value);
  });
  return api;
}

/**
 * Suchfeld mit Lupe, Löschen-Knopf und „Abbrechen“.
 * searchField({placeholder, value, onInput(text), onCancel(), onSubmit(text)}) → {el, input, get value(), setValue(t), clear(), blur()}
 */
export function searchField({ placeholder = 'Suchen', value = '', onInput, onCancel, onSubmit } = {}) {
  const el = h(`<div class="search" role="search">
    <label class="search-field">${I.search}<input type="search" enterkeyhint="search" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}">
    <button type="button" class="search-clear" aria-label="Text löschen" tabindex="-1">${I.close}</button></label>
    <button type="button" class="search-cancel">Abbrechen</button></div>`);
  const input = el.querySelector('input');
  input.value = value;
  const sync = () => el.classList.toggle('has-value', !!input.value);
  input.addEventListener('input', () => { sync(); onInput?.(input.value); });
  input.addEventListener('focus', () => el.classList.add('is-active'));
  input.addEventListener('blur', () => { if (!input.value) el.classList.remove('is-active'); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { input.blur(); onSubmit?.(input.value); } });
  el.querySelector('.search-clear').addEventListener('pointerdown', (e) => e.preventDefault());
  el.querySelector('.search-clear').addEventListener('click', () => { input.value = ''; sync(); onInput?.(''); input.focus(); });
  el.querySelector('.search-cancel').addEventListener('click', () => {
    input.value = ''; sync(); el.classList.remove('is-active'); input.blur(); onInput?.(''); onCancel?.();
  });
  sync();
  return {
    el, input,
    get value() { return input.value; },
    setValue(t) { input.value = t; sync(); },
    clear() { input.value = ''; sync(); el.classList.remove('is-active'); },
    blur() { input.blur(); }
  };
}

/**
 * Seite mit großem Titel, der beim Scrollen in eine Glasleiste mit kleinem Titel übergeht.
 * pageScaffold({title, subtitle, trailing:[Element|{icon,label,onTap,variant}], leading:[…], search:{placeholder,onInput,onCancel}, largeTitle=true, tabbar=true})
 * → {root, scroller, content, navBar, search, setTitle(t), setSubtitle(t), setTrailing([…]), setLeading([…]), scrollToTop()}
 */
export function pageScaffold(o = {}) {
  const root = h(`<div class="page${o.largeTitle === false ? ' is-inline-title' : ''}${o.tabbar === false ? ' no-tabbar' : ''}">
    <header class="nav-bar"><div class="nav-bar-inner">
      <div class="nav-leading"></div><div class="nav-title" aria-hidden="true"></div><div class="nav-trailing"></div>
    </div></header>
    <div class="page-scroller">
      ${o.largeTitle === false ? '' : '<div class="large-title-wrap"><h1 class="large-title"></h1><p class="page-subtitle" hidden></p></div>'}
      <div class="page-search" hidden></div>
      <div class="page-content"></div>
    </div>
  </div>`);
  const navBar = root.querySelector('.nav-bar');
  const scroller = root.querySelector('.page-scroller');
  const content = root.querySelector('.page-content');
  const navTitle = root.querySelector('.nav-title');
  const big = root.querySelector('.large-title');
  const sub = root.querySelector('.page-subtitle');
  const toEl = (spec) => (spec instanceof HTMLElement ? spec : spec.label && !spec.icon ? button({ variant: 'glass', size: 'small', ...spec }) : iconButton(spec));
  const api = {
    root, scroller, content, navBar, search: null,
    setTitle(t) { navTitle.textContent = t || ''; if (big) big.textContent = t || ''; },
    setSubtitle(t) { if (!sub) return; sub.textContent = t || ''; sub.hidden = !t; },
    setTrailing(list = []) { root.querySelector('.nav-trailing').replaceChildren(...list.filter(Boolean).map(toEl)); },
    setLeading(list = []) { root.querySelector('.nav-leading').replaceChildren(...list.filter(Boolean).map(toEl)); },
    scrollToTop() { scroller.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' }); }
  };
  api.setTitle(o.title || '');
  api.setSubtitle(o.subtitle || '');
  api.setTrailing(o.trailing || []);
  api.setLeading(o.leading || []);
  if (o.search) {
    const box = root.querySelector('.page-search');
    api.search = searchField(o.search === true ? {} : o.search);
    box.hidden = false;
    box.appendChild(api.search.el);
  }
  // Scroll-gesteuerter Übergang
  let raf = 0, lastP = -1, lastPull = -1, lastBg = -1;
  const update = () => {
    raf = 0;
    const st = scroller.scrollTop;
    const th = big ? big.parentElement.offsetHeight : 0;
    const p = big ? clamp((st - (th - 22)) / 16, 0, 1) : 1;
    const bg = big ? clamp((st - (th - 30)) / 20, 0, 1) : clamp(st / 12, 0, 1);
    const pull = Math.max(0, -st);
    if (p !== lastP) { root.style.setProperty('--p', p.toFixed(3)); lastP = p; }
    if (bg !== lastBg) { root.style.setProperty('--nav-bg', bg.toFixed(3)); lastBg = bg; }
    if (pull !== lastPull) { root.style.setProperty('--pull', pull.toFixed(1)); lastPull = pull; }
  };
  scroller.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
  new ResizeObserver(() => update()).observe(scroller);
  navBar.addEventListener('click', (e) => { if (!e.target.closest('button, a, input')) api.scrollToTop(); });
  return api;
}

// =====================================================================
// Start
// =====================================================================
let inited = false;
/** Einmal beim Start (main.js) aufrufen: Druckzustand, Regler, Viewport. */
export function initUI() {
  if (inited) return;
  inited = true;
  initPressable();
  syncViewport();
}

export { I };
