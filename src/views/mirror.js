// Tab „Anprobe“ (Spiegel) – Bühne mit Körperfoto, Kleidungsebenen, Wischen, Auswahl, Werkzeuge, Sitz anpassen.
// Vertrag: docs/DESIGN.md › View-Vertrag. Logik (Zonen, Kleid-Ausschluss, Anpassen) aus docs/reference/main.old.js.
import './mirror.css';
import {
  S, on, itemById, listFor, countFor, itemUrl, outfitUrl, bodyView, warpOn, hasOutfit, select, setSel, nextId,
  persistSettings, saveItemsSoon, setSetting, updateItem, plannedToday, sameSel, dateKey, wearOutfit
} from '../app/state.js';
import { register, run, go, setTabBarHidden } from '../app/actions.js';
import { toast, haptic, springAnimate, segmented, prefersReducedMotion, esc, h, clamp, syncSlider } from '../ui/ui.js';
import { I } from '../ui/icons.js';
import { CATEGORIES, CAT, LAYER_ORDER, ZONE_DEFAULT, zoneBox, zoneAt, placeItem } from '../model.js';
import { layerFor } from '../render.js';

// ---------------------------------------------------------------------
// Modulzustand
// ---------------------------------------------------------------------
let root, wrap, stage, bodyImg, floor, layersEl, panel, pickerEl, adjustEl, chipsEl, metalRow, stripRow, tools, tag,
  hintEl, bannerSlot, headTitle, headSub, saveBtn, btnShuffle, btnClear, btnAdjust, metalSeg;
let ro = null;
let offs = [];
let mounted = false;
const slots = {};                 // cat → {el, current: canvas|null, tok}
let enterHint = null;             // {cat, dir, velocity} – nächster Einstieg per Wischen
let nextAnim = null;              // 'stagger' | 'fade' | 'none' – Animation für das nächste 'sel'
let stripSig = '';
let bannerKey = '';
let lastSize = { w: 0, h: 0 };
let stageSize = { w: 0, h: 0 };
let bodyKey = '';
let adjusting = false;
let adjustStartFit = null;
let dayShown = '';

const reduce = () => prefersReducedMotion();
const isEmpty = () => S.items.length === 0;
const catLabel = (cat) => CAT[cat]?.label || '';
const visible = () => mounted && S.tab === 'spiegel';

// ---------------------------------------------------------------------
// Aktionen dieses Bereichs
// ---------------------------------------------------------------------
register('startAdjust', (itemId) => {
  const item = itemById(itemId);
  if (!item) return;
  if (S.sel[item.cat] !== item.id) { nextAnim = 'fade'; select(item.cat, item.id); }
  S.cat = item.cat;
  persistSettings();
  go('spiegel');
  refreshPicker();
  // nach dem Tab-Wechsel (Overlays schließen) in den Anpassen-Modus
  requestAnimationFrame(() => enterAdjust());
});

// ---------------------------------------------------------------------
// Aufbau
// ---------------------------------------------------------------------
function build(container) {
  root = h(`<div class="mirror">
    <header class="mirror-head">
      <div class="mirror-head-text">
        <p class="mirror-date"></p>
        <h1 class="mirror-title">Anprobe</h1>
      </div>
      <div class="mirror-head-actions"></div>
    </header>
    <div class="mirror-banner-slot"></div>
    <div class="mirror-wrap">
      <div class="mirror-stage" aria-label="Spiegel">
        <div class="mirror-floor"></div>
        <img class="mirror-body" alt="" draggable="false">
        <div class="mirror-layers">${LAYER_ORDER.map((c) => `<div class="mirror-slot" data-cat="${c}"></div>`).join('')}</div>
        <div class="mirror-hint" hidden aria-hidden="true">
          <div class="mirror-hint-track"><span class="mirror-hint-chev is-l">${I.chevronLeft}</span><span class="mirror-hint-dot"></span><span class="mirror-hint-chev is-r">${I.chevronRight}</span></div>
          <div class="mirror-hint-text">Zum Wechseln wischen</div>
        </div>
      </div>
      <div class="mirror-tag" role="status" aria-live="polite"></div>
      <div class="mirror-tools"></div>
    </div>
    <div class="mirror-panel">
      <div class="mirror-picker">
        <div class="chips mirror-chips" role="group" aria-label="Kategorie"></div>
        <div class="mirror-metal" hidden></div>
        <div class="mirror-strip-row"></div>
      </div>
      <div class="mirror-adjust" hidden>
        <p class="mirror-adjust-hint">Mit einem Finger verschieben, mit zwei Fingern größer oder kleiner ziehen.</p>
        <div class="mirror-size">
          <span class="mirror-size-label">Größe</span>
          <input type="range" class="slider" min="0.4" max="2.2" step="0.01" value="1" aria-label="Größe">
          <span class="mirror-size-value t-num">100 %</span>
        </div>
        <div class="btn-row">
          <button type="button" class="btn btn-gray btn-label" data-act="fit-reset">Zurücksetzen</button>
          <button type="button" class="btn btn-filled" data-act="adjust-done">Fertig</button>
        </div>
      </div>
    </div>
    <div class="mirror-bottom"></div>
  </div>`);
  container.appendChild(root);
  const q = (s) => root.querySelector(s);
  wrap = q('.mirror-wrap');
  stage = q('.mirror-stage');
  bodyImg = q('.mirror-body');
  floor = q('.mirror-floor');
  layersEl = q('.mirror-layers');
  panel = q('.mirror-panel');
  pickerEl = q('.mirror-picker');
  adjustEl = q('.mirror-adjust');
  chipsEl = q('.mirror-chips');
  metalRow = q('.mirror-metal');
  stripRow = q('.mirror-strip-row');
  tools = q('.mirror-tools');
  tag = q('.mirror-tag');
  hintEl = q('.mirror-hint');
  bannerSlot = q('.mirror-banner-slot');
  headTitle = q('.mirror-title');
  headSub = q('.mirror-date');
  root.querySelectorAll('.mirror-slot').forEach((el) => { slots[el.dataset.cat] = { el, current: null, tok: 0 }; });

  // Kopf: Sichern + Einstellungen
  saveBtn = iconBtn(I.bookmark, 'Outfit sichern', () => run('openSaveOutfit'));
  q('.mirror-head-actions').append(saveBtn, iconBtn(I.gear, 'Einstellungen', () => run('openSettings')));

  // Werkzeuge an der Bühne
  btnShuffle = iconBtn(I.dice, 'Zufälliges Outfit', shuffle);
  btnClear = iconBtn(I.reset, 'Outfit leeren', clearOutfit);
  btnAdjust = iconBtn(I.move, 'Sitz anpassen', () => enterAdjust());
  tools.append(btnShuffle, btnClear, btnAdjust);

  // Metall-Filter
  metalSeg = segmented({
    items: [{ value: 'alle', label: 'Alles' }, { value: 'gold', label: 'Gold' }, { value: 'silber', label: 'Silber' }],
    value: S.metal, small: true, label: 'Metall', onChange: onMetal
  });
  metalRow.appendChild(metalSeg.el);

  // Kategorien
  chipsEl.addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (!c || c.dataset.cat === S.cat) return;
    haptic('selection');
    setCat(c.dataset.cat);
    showTag(S.cat);
  });
  // Streifen
  stripRow.addEventListener('click', (e) => {
    const scan = e.target.closest('[data-act="scan"]');
    if (scan) return run('openScan', { cat: S.cat });
    const t = e.target.closest('.mirror-thumb');
    if (!t) return;
    pick(t.dataset.id || null);
  });
  // Anpassen
  const range = adjustEl.querySelector('input');
  let raf = 0;
  range.addEventListener('input', () => {
    const item = adjustItem();
    syncSlider(range);
    updateSizeValue(+range.value);
    if (!item) return;
    item.fit = { dx: 0, dy: 0, ...item.fit, s: +range.value };
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => drawSlot(item.cat, 'none'));
    saveItemsSoon();
  });
  adjustEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'adjust-done') exitAdjust();
    if (b.dataset.act === 'fit-reset') resetFit();
  });

  bindGestures();
  ro = new ResizeObserver(() => fit());
  ro.observe(wrap);
}

function iconBtn(icon, label, onTap) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'icon-btn mirror-icon-btn';
  b.innerHTML = icon;
  b.setAttribute('aria-label', label);
  b.title = label;
  b.addEventListener('click', onTap);
  return b;
}

// ---------------------------------------------------------------------
// Bühne: Größe, Körper, Ebenen
// ---------------------------------------------------------------------
function fit() {
  if (!wrap) return false;
  const body = bodyView();
  const cs = getComputedStyle(wrap);
  const aw = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const ah = wrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  if (aw <= 0 || ah <= 0) return false;
  const r = body.w / body.h;
  let w = aw, hh = w / r;
  if (hh > ah) { hh = ah; w = hh * r; }
  w = Math.max(40, Math.round(w)); hh = Math.max(40, Math.round(hh));
  if (w === stageSize.w && hh === stageSize.h) return false;
  stageSize = { w, h: hh };
  stage.style.width = w + 'px';
  stage.style.height = hh + 'px';
  placeHint();
  return true;
}

/** Layout-Änderung mit weichem Übergang der Bühne (FLIP) und des Panels. */
function flip(change) {
  if (!visible() || reduce()) { change(); fit(); return; }
  const a = stage.getBoundingClientRect();
  const pa = panel.getBoundingClientRect();
  change();
  fit();
  const b = stage.getBoundingClientRect();
  const pb = panel.getBoundingClientRect();
  if (a.width && b.width && (Math.abs(a.top - b.top) > 0.5 || Math.abs(a.width - b.width) > 0.5 || Math.abs(a.left - b.left) > 0.5)) {
    const s = a.width / b.width;
    stage.style.transformOrigin = '0 0';
    springAnimate(stage, [{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${s})` }, { transform: 'none' }], { spring: 'smooth' });
  }
  if (pa.height && pb.height && Math.abs(pa.bottom - pb.bottom) > 0.5) {
    springAnimate(panel, [{ transform: `translateY(${pa.bottom - pb.bottom}px)` }, { transform: 'none' }], { spring: 'smooth' });
  }
}

function syncBody(force = false) {
  const body = bodyView();
  const key = body.placeholder ? 'placeholder' : `${body.updated}|${body.src}|${JSON.stringify(body.guides)}`;
  if (!force && key === bodyKey) return false;
  bodyKey = key;
  bodyImg.src = body.src;
  stage.classList.toggle('is-placeholder', !!body.placeholder);
  const fl = body.guides.floor ?? 0.98;
  floor.style.top = (fl * 100 - 2.2) + '%';
  stageSize = { w: 0, h: 0 };
  fit();
  return true;
}

/** Zeichnet eine Kategorie. anim: 'slide' | 'fade' | 'stagger' | 'none' */
async function drawSlot(cat, anim = 'fade', delay = 0) {
  const s = slots[cat];
  if (!s) return;
  const tok = ++s.tok;
  s.el.classList.toggle('is-target', adjusting && cat === S.cat);
  const item = itemById(S.sel[cat]);
  const url = item && itemUrl(item.id);
  if (!url) {
    if (s.current) leave(s.current, anim === 'slide' ? 'fade' : anim);
    s.current = null;
    return;
  }
  const body = bodyView();
  let l;
  try { l = await layerFor(item, url, body, warpOn()); } catch (e) { console.warn(e); return; }
  if (tok !== s.tok || !mounted || S.sel[cat] !== item.id) return;
  const c = l.canvas;
  c.classList.add('mirror-layer');
  Object.assign(c.style, {
    left: (l.x / body.w) * 100 + '%',
    top: (l.y / body.h) * 100 + '%',
    width: (l.w / body.w) * 100 + '%',
    height: (l.h / body.h) * 100 + '%'
  });
  if (c === s.current && c.parentNode === s.el) {
    if (adjusting && cat === S.cat) clearAdjustTransform();
    return;
  }
  // wiederverwendete (zwischengespeicherte) Leinwand, die gerade noch hinausgleitet
  c.getAnimations?.().forEach((a) => a.cancel());
  c.classList.remove('is-leaving');
  c.style.transform = '';
  c.style.opacity = '';
  if (s.current && s.current !== c) leave(s.current, anim === 'slide' || anim === 'none' ? 'cut' : 'fade');
  s.el.appendChild(c);
  c.getAnimations?.().forEach((a) => a.cancel());
  s.current = c;
  if (adjusting && cat === S.cat) clearAdjustTransform();
  enter(c, cat, anim, delay);
}

function enter(c, cat, anim, delay) {
  if (reduce() || anim === 'none') {
    if (anim !== 'none') c.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
    return;
  }
  if (anim === 'slide' && enterHint && enterHint.cat === cat) {
    const w = stage.clientWidth || 300;
    const from = enterHint.dir * w * 0.42;
    enterHint = null;
    springAnimate(c, [{ transform: `translateX(${from}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
      { spring: { response: 0.42, damping: 0.82 } });
    return;
  }
  if (anim === 'stagger') {
    springAnimate(c, [{ transform: 'translateY(14px) scale(.96)', opacity: 0 }, { transform: 'none', opacity: 1 }],
      { spring: { response: 0.44, damping: 0.74 }, delay, fill: 'backwards' });
    return;
  }
  springAnimate(c, [{ transform: 'scale(.97)', opacity: 0 }, { transform: 'none', opacity: 1 }], { spring: 'snappy' });
}

/** Leinwand ausblenden und entfernen. kind: 'fade' | 'cut' | {dir, from, velocity} */
function leave(c, kind = 'fade') {
  if (!c || c.classList.contains('is-leaving')) return;
  c.classList.add('is-leaving');
  const done = () => {
    if (!c.classList.contains('is-leaving')) return;
    c.remove();
    c.classList.remove('is-leaving');
    c.style.transform = ''; c.style.opacity = '';
    c.getAnimations?.().forEach((a) => a.cancel()); // gefüllte Animationen nicht an der (zwischengespeicherten) Leinwand lassen
  };
  if (kind === 'cut' || kind === 'none' || reduce()) {
    if (kind !== 'cut' && kind !== 'none' && c.animate) {
      c.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: 'forwards' }).finished.then(done, done);
    } else done();
    return;
  }
  if (typeof kind === 'object') {
    const w = stage.clientWidth || 300;
    const to = -kind.dir * w * 0.75;
    const dist = Math.abs(to - kind.from) || 1;
    const v = clamp(Math.abs(kind.velocity || 0) * 1000 / dist, 0, 8);
    springAnimate(c, [
      { transform: `translateX(${kind.from}px)`, opacity: c.style.opacity || 1 },
      { transform: `translateX(${to}px)`, opacity: 0 }
    ], { spring: { response: 0.34, damping: 1 }, velocity: v, fill: 'forwards' }).finished.then(done, done);
    return;
  }
  c.animate([{ opacity: 1, transform: c.style.transform || 'none' }, { opacity: 0, transform: 'scale(.98)' }],
    { duration: 180, easing: 'ease-in', fill: 'forwards' }).finished.then(done, done);
}

function drawLayers(cats = LAYER_ORDER, anim = 'fade') {
  let i = 0;
  return Promise.all(cats.map((c) => {
    const has = !!S.sel[c];
    const p = drawSlot(c, anim, anim === 'stagger' && has ? (i++) * 45 : 0);
    return p;
  }));
}

function redrawAll() {
  for (const c of LAYER_ORDER) {
    const s = slots[c];
    if (s.current) { s.current.remove(); s.current = null; }
  }
  return drawLayers(LAYER_ORDER, 'none');
}

// ---------------------------------------------------------------------
// Auswahl-Panel
// ---------------------------------------------------------------------
function renderChips() {
  const html = CATEGORIES.map((c) => {
    const n = countFor(c.id);
    return `<button type="button" class="chip mirror-chip" data-cat="${c.id}" aria-pressed="${S.cat === c.id}">${esc(c.label)}${n ? `<span class="chip-count">${n}</span>` : ''}</button>`;
  }).join('');
  if (chipsEl.innerHTML !== html) chipsEl.innerHTML = html;
}
function syncChipSelection(scroll = true) {
  chipsEl.querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === S.cat)));
  const act = chipsEl.querySelector('[aria-pressed="true"]');
  if (scroll && act) centerIn(chipsEl, act, true);
}

function stripSignature() {
  const list = listFor(S.cat);
  return `${S.cat}|${S.metal}|${list.map((i) => i.id + ':' + (itemUrl(i.id) ? 1 : 0)).join(',')}`;
}
function renderStrip(force = false) {
  const sig = stripSignature();
  if (!force && sig === stripSig) return false;
  stripSig = sig;
  const list = listFor(S.cat);
  if (!list.length) {
    const what = S.cat === 'schmuck' && S.metal !== 'alle'
      ? `${S.metal === 'gold' ? 'goldenen' : 'silbernen'} Schmuck`
      : catLabel(S.cat);
    stripRow.innerHTML = `<div class="mirror-strip-empty">
      <span class="mirror-strip-empty-text">Noch kein${S.cat === 'schmuck' ? '' : 'e'} ${esc(what)} im Schrank</span>
      <button type="button" class="btn btn-tinted btn-small" data-act="scan">${I.camera}<span>Scannen</span></button></div>`;
    return true;
  }
  stripRow.innerHTML = `<div class="mirror-strip" role="listbox" aria-label="${esc(catLabel(S.cat))}">
    <button type="button" class="mirror-thumb is-none" data-id="" role="option" aria-label="Ohne"><span>Ohne</span></button>
    ${list.map((i) => `<button type="button" class="mirror-thumb" data-id="${i.id}" role="option" aria-label="${esc(i.name || CAT[i.cat].one)}">
      <img src="${itemUrl(i.id)}" alt="" draggable="false" decoding="async">${i.cat === 'schmuck' && i.metal ? `<span class="metal-dot is-${i.metal}"></span>` : ''}</button>`).join('')}
  </div>`;
  return true;
}
function syncStripSelection(smooth = true) {
  const cur = S.sel[S.cat] || '';
  let act = null;
  stripRow.querySelectorAll('.mirror-thumb').forEach((t) => {
    const on = t.dataset.id === cur;
    t.setAttribute('aria-selected', String(on));
    if (on) act = t;
  });
  const strip = stripRow.querySelector('.mirror-strip');
  if (strip && act) centerIn(strip, act, smooth);
}
function centerIn(scroller, el, smooth) {
  const left = el.offsetLeft - (scroller.clientWidth - el.offsetWidth) / 2;
  const max = scroller.scrollWidth - scroller.clientWidth;
  scroller.scrollTo({ left: clamp(left, 0, Math.max(0, max)), behavior: smooth && !reduce() ? 'smooth' : 'auto' });
}

function syncMetal() {
  const show = S.cat === 'schmuck' && !isEmpty();
  if (metalRow.hidden === !show) { metalSeg.set(S.metal, { silent: true }); return false; }
  metalRow.hidden = !show;
  metalSeg.set(S.metal, { silent: true });
  if (show && visible() && !reduce()) springAnimate(metalRow, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { spring: 'snappy' });
  return true;
}

function renderEmpty() {
  const empty = isEmpty();
  root.classList.toggle('is-empty', empty);
  let box = panel.querySelector('.mirror-empty');
  if (!empty) { box?.remove(); return; }
  if (box) return;
  box = h(`<div class="mirror-empty">
    <div class="mirror-empty-symbol">${I.hanger}</div>
    <div class="mirror-empty-title">Dein Schrank ist leer</div>
    <p class="mirror-empty-text">Fotografiere ein Kleidungsstück – es wird automatisch ausgeschnitten und hier anprobiert.</p>
    <button type="button" class="btn btn-filled">${I.camera}<span>Erstes Teil scannen</span></button>
  </div>`);
  box.querySelector('button').addEventListener('click', () => run('openScan', {}));
  panel.prepend(box);
}

/** Panel komplett gegen den Zustand abgleichen (ohne unnötigen Neuaufbau). */
function refreshPicker({ smooth = true } = {}) {
  flip(() => {
    renderEmpty();
    renderChips();
    syncChipSelection(smooth);
    syncMetal();
    renderStrip();
  });
  syncStripSelection(smooth);
  syncTools();
}

function setCat(cat) {
  if (S.cat === cat) return;
  S.cat = cat;
  persistSettings();
  flip(() => {
    syncChipSelection(true);
    syncMetal();
    renderStrip();
  });
  syncStripSelection(false);
  syncTools();
  if (!reduce()) {
    const strip = stripRow.firstElementChild;
    strip && springAnimate(strip, [{ opacity: 0, transform: 'translateX(10px)' }, { opacity: 1, transform: 'none' }], { spring: 'snappy' });
  }
}

function onMetal(v) {
  S.metal = v;
  const cur = itemById(S.sel.schmuck);
  persistSettings();
  renderStrip();
  if (S.metal !== 'alle' && cur && cur.metal !== S.metal) {
    const first = listFor('schmuck')[0];
    nextAnim = 'fade';
    select('schmuck', first ? first.id : null);
  }
  syncStripSelection(false);
  syncTools();
}

function pick(id) {
  if ((S.sel[S.cat] || null) === id) { showTag(S.cat); return; }
  const list = listFor(S.cat);
  const prev = list.findIndex((i) => i.id === S.sel[S.cat]);
  const next = list.findIndex((i) => i.id === id);
  haptic('selection');
  swapTo(S.cat, id, next >= prev ? 1 : -1);
}

function syncTools() {
  const has = hasOutfit();
  saveBtn.disabled = !has;
  btnClear.disabled = !has;
  btnShuffle.disabled = S.items.length < 2;
  const showAdj = !!itemById(S.sel[S.cat]);
  if (btnAdjust.hidden === showAdj) {
    btnAdjust.hidden = !showAdj;
    if (showAdj && visible() && !reduce()) springAnimate(btnAdjust, [{ transform: 'scale(.4)', opacity: 0 }, { transform: 'none', opacity: 1 }], { spring: 'bouncy' });
  }
  tools.hidden = isEmpty() || adjusting;
}

// ---------------------------------------------------------------------
// Wechseln (Wischen / Streifen)
// ---------------------------------------------------------------------
/** Wechselt ein Teil mit Animation. drag: {from, velocity} wenn per Wischen. */
function swapTo(cat, id, dir, drag = null) {
  const s = slots[cat];
  if (s.current) {
    leave(s.current, drag ? { dir, from: drag.from, velocity: drag.velocity } : { dir, from: 0, velocity: 0 });
    s.current = null;
  }
  enterHint = { cat, dir };
  nextAnim = 'slide';
  select(cat, id);
  haptic('light');
  showTag(cat);
}

function showTag(cat) {
  const list = listFor(cat);
  const cur = S.sel[cat];
  const idx = cur ? list.findIndex((i) => i.id === cur) + 1 : 0;
  const text = cur ? `${CAT[cat].one} ${idx}/${list.length}` : `Ohne ${CAT[cat].one}`;
  const dots = list.length && list.length <= 12
    ? `<span class="mirror-tag-dots">${[null, ...list].map((it, i) => `<i class="${i === idx ? 'is-on' : ''}${i === 0 ? ' is-none' : ''}"></i>`).join('')}</span>`
    : '';
  tag.innerHTML = `<span class="mirror-tag-text">${esc(text)}</span>${dots}`;
  const was = tag.classList.contains('is-shown');
  tag.classList.add('is-shown');
  if (!was && !reduce()) springAnimate(tag, [{ opacity: 0, transform: 'translate(-50%, -6px) scale(.9)' }, { opacity: 1, transform: 'translate(-50%, 0) scale(1)' }], { spring: 'bouncy' });
  clearTimeout(showTag.t);
  showTag.t = setTimeout(() => {
    tag.classList.remove('is-shown');
    tag.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease-out' });
  }, 1200);
}

// ---------------------------------------------------------------------
// Gesten auf der Bühne
// ---------------------------------------------------------------------
function zoneCat(clientY) {
  const rect = stage.getBoundingClientRect();
  const zone = zoneAt((clientY - rect.top) / rect.height, bodyView().guides);
  const zoneCats = CATEGORIES.filter((c) => c.zone === zone).map((c) => c.id);
  return zoneCats.includes(S.cat) ? S.cat : ZONE_DEFAULT[zone];
}

function bindGestures() {
  const pts = new Map();
  let g = null;

  stage.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || isEmpty()) return;
    try { stage.setPointerCapture(e.pointerId); } catch { /* egal */ }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (adjusting) {
      const item = adjustItem();
      if (!item) return;
      const [a, b] = [...pts.values()];
      if (pts.size === 1) {
        g = { kind: 'move', x: a.x, y: a.y, fit: { dx: 0, dy: 0, s: 1, ...item.fit }, tx: 0, ty: 0, sc: 1 };
      } else if (pts.size === 2 && g) {
        g.kind = 'pinch';
        g.d0 = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        g.mx0 = (a.x + b.x) / 2 - g.tx; g.my0 = (a.y + b.y) / 2 - g.ty;
        g.sc0 = g.sc;
      }
      return;
    }
    if (pts.size === 1) {
      g = { kind: 'swipe', x: e.clientX, y: e.clientY, cat: zoneCat(e.clientY), state: 'idle', samples: [{ t: e.timeStamp, x: e.clientX }], t0: e.timeStamp };
    } else {
      // zweiter Finger: Wischen abbrechen
      if (g?.kind === 'swipe') cancelSwipe(g);
      g = null;
    }
  });

  stage.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId) || !g) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.kind === 'swipe') {
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      g.samples.push({ t: e.timeStamp, x: e.clientX });
      while (g.samples.length > 2 && e.timeStamp - g.samples[0].t > 90) g.samples.shift();
      if (g.state === 'idle') {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { g.state = 'vertical'; return; }
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.15) {
          g.state = 'drag';
          g.x = e.clientX - Math.sign(dx) * 2; // kein Sprung
          g.empty = listFor(g.cat).length === 0;
        }
      }
      if (g.state === 'drag') {
        const raw = e.clientX - g.x;
        const s = slots[g.cat];
        const d = g.empty ? rubber(raw) : raw;
        g.dx = d;
        if (s.current) {
          s.current.style.transform = `translateX(${d}px)`;
          s.current.style.opacity = String(Math.max(0.35, 1 - Math.abs(d) / (stage.clientWidth * 1.1)));
        }
      }
      return;
    }
    moveAdjust();
  });

  const rubber = (x) => Math.sign(x) * Math.min(Math.abs(x), 60 * (1 - Math.exp(-Math.abs(x) / 80)));

  const moveAdjust = () => {
    const s = slots[S.cat];
    const [a, b] = [...pts.values()];
    if (g.kind === 'move' && pts.size === 1) {
      g.tx = a.x - g.x; g.ty = a.y - g.y;
    } else if (g.kind === 'pinch' && pts.size >= 2) {
      g.sc = clamp(g.sc0 * (Math.hypot(a.x - b.x, a.y - b.y) / g.d0), 0.3, 3);
      g.tx = (a.x + b.x) / 2 - g.mx0; g.ty = (a.y + b.y) / 2 - g.my0;
      const range = adjustEl.querySelector('input');
      const v = clamp(g.fit.s * g.sc, 0.4, 2.2);
      range.value = v; syncSlider(range); updateSizeValue(v);
    }
    const item = adjustItem();
    if (!item) return;
    const body = bodyView();
    const p = placeItem(item, body.guides, body.w, body.h);
    const ox = ((p.x + p.w / 2) / body.w) * stage.clientWidth, oy = ((p.y + p.h / 2) / body.h) * stage.clientHeight;
    s.el.style.transformOrigin = `${ox}px ${oy}px`;
    s.el.style.transform = `translate(${g.tx}px, ${g.ty}px) scale(${g.sc})`;
  };

  const velocityOf = (gg, x, t) => {
    const first = gg.samples[0];
    const dt = t - first.t;
    return dt > 0 ? (x - first.x) / dt : 0; // px/ms
  };

  const end = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (!g) return;
    if (g.kind === 'swipe') {
      const cur = g;
      g = null;
      if (cur.state !== 'drag') {
        // Tippen auf eine Zone → Kategorie wählen
        const dx = e.clientX - cur.x, dy = e.clientY - cur.y;
        if (e.type !== 'pointercancel' && cur.state === 'idle' && Math.abs(dx) < 8 && Math.abs(dy) < 8 && e.timeStamp - cur.t0 < 500) {
          if (cur.cat !== S.cat) { haptic('selection'); setCat(cur.cat); }
          showTag(cur.cat);
        }
        return;
      }
      const v = velocityOf(cur, e.clientX, e.timeStamp);
      const dx = cur.dx || 0;
      const w = stage.clientWidth || 300;
      const fast = Math.abs(v) > 0.35 && Math.sign(v) === Math.sign(dx) && Math.abs(dx) > 10;
      const commit = e.type !== 'pointercancel' && !cur.empty && (Math.abs(dx) > w * 0.22 || fast);
      if (cur.empty && e.type !== 'pointercancel' && (Math.abs(dx) > 24 || fast)) {
        cancelSwipe(cur, v);
        if (cur.cat !== S.cat) setCat(cur.cat);
        toast(`Noch keine ${catLabel(cur.cat)} im Schrank`, { icon: I.hanger });
        return;
      }
      if (!commit) { cancelSwipe(cur, v); return; }
      const dir = dx < 0 ? 1 : -1;
      markSwiped();
      if (cur.cat !== S.cat) setCat(cur.cat);
      swapTo(cur.cat, nextId(cur.cat, dir), dir, { from: dx, velocity: v });
      return;
    }
    // Anpassen abschließen, sobald kein Finger mehr liegt
    if (pts.size > 0) {
      if (g.kind === 'pinch') { const [a] = [...pts.values()]; g.kind = 'move'; g.x = a.x - g.tx; g.y = a.y - g.ty; }
      return;
    }
    const done = g;
    g = null;
    commitAdjust(done);
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
  stage.addEventListener('lostpointercapture', (e) => { if (pts.has(e.pointerId)) end(e); });
}

function cancelSwipe(cur, v = 0) {
  const c = slots[cur.cat]?.current;
  if (!c) return;
  const from = cur.dx || 0;
  const op = c.style.opacity || 1;
  c.style.transform = '';
  c.style.opacity = '';
  if (from && !reduce()) {
    const vel = clamp(Math.abs(v * 1000 / (Math.abs(from) || 1)), 0, 6);
    springAnimate(c, [{ transform: `translateX(${from}px)`, opacity: op }, { transform: 'none', opacity: 1 }], { spring: { response: 0.38, damping: 0.78 }, velocity: vel });
  }
}

function markSwiped() {
  if (S.settings.swiped) return;
  setSetting('swiped', true);
}

// ---------------------------------------------------------------------
// Wisch-Hinweis
// ---------------------------------------------------------------------
function placeHint() {
  if (hintEl.hidden) return;
  const body = bodyView();
  const b = zoneBox('oberteil', body.guides, body.w, body.h);
  hintEl.style.top = ((b.y + b.h * 0.42) / body.h) * 100 + '%';
}
function syncHint() {
  const show = !S.settings.swiped && S.items.length > 1 && !adjusting;
  if (show === !hintEl.hidden) return;
  if (show) {
    hintEl.hidden = false;
    placeHint();
    if (!reduce()) springAnimate(hintEl, [{ opacity: 0, transform: 'translate(-50%, -50%) scale(.9)' }, { opacity: 1, transform: 'translate(-50%, -50%)' }], { spring: 'smooth', delay: 400, fill: 'backwards' });
  } else {
    const a = hintEl.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease-out' });
    if (a && !reduce()) a.finished.then(() => { hintEl.hidden = true; }, () => { hintEl.hidden = true; });
    else hintEl.hidden = true;
  }
}

// ---------------------------------------------------------------------
// Werkzeuge
// ---------------------------------------------------------------------
function shuffle() {
  if (S.items.length < 2) return;
  const pick1 = (cat) => { const l = listFor(cat); return l.length ? l[Math.floor(Math.random() * l.length)].id : null; };
  const nTops = countFor('oberteil');
  const nDress = countFor('kleid');
  const sel = { ...S.sel };
  if (nDress && Math.random() < nDress / (nDress + nTops + 0.001)) {
    sel.kleid = pick1('kleid'); sel.oberteil = null; sel.hose = null;
  } else {
    sel.kleid = null; sel.oberteil = pick1('oberteil'); sel.hose = pick1('hose');
  }
  sel.schuhe = pick1('schuhe');
  sel.socken = Math.random() < 0.3 ? pick1('socken') : null;
  sel.jacke = Math.random() < 0.35 ? pick1('jacke') : null;
  sel.schmuck = Math.random() < 0.5 ? pick1('schmuck') : null;
  haptic('medium');
  const svg = btnShuffle.querySelector('svg');
  if (svg && !reduce()) springAnimate(svg, [{ transform: 'rotate(0deg) scale(1)' }, { transform: 'rotate(360deg) scale(1)' }], { spring: { response: 0.6, damping: 0.7 } });
  // alle bisherigen Ebenen weich ausblenden, neue gestaffelt einblenden
  for (const c of LAYER_ORDER) {
    const s = slots[c];
    if (s.current && sel[c] !== S.sel[c]) { leave(s.current, 'fade'); s.current = null; }
  }
  nextAnim = 'stagger';
  setSel(sel);
}

function clearOutfit() {
  if (!hasOutfit()) return;
  const prev = { ...S.sel };
  haptic('light');
  nextAnim = 'fade';
  setSel({});
  toast('Outfit geleert', {
    icon: I.reset,
    action: { label: 'Rückgängig', onTap: () => { nextAnim = 'stagger'; setSel(prev); haptic('light'); } },
    duration: 4500
  });
}

// ---------------------------------------------------------------------
// Sitz anpassen
// ---------------------------------------------------------------------
const adjustItem = () => itemById(S.sel[S.cat]);
function updateSizeValue(v) {
  const el = adjustEl.querySelector('.mirror-size-value');
  if (el) el.textContent = `${Math.round(v * 100)} %`;
}
function clearAdjustTransform() {
  const s = slots[S.cat];
  if (s) { s.el.style.transform = ''; s.el.style.transformOrigin = ''; }
}

function enterAdjust() {
  const item = adjustItem();
  if (!item || adjusting) return;
  adjusting = true;
  S.adjusting = true;
  adjustStartFit = JSON.stringify(item.fit || null);
  haptic('light');
  const range = adjustEl.querySelector('input');
  range.value = item.fit?.s ?? 1;
  syncSlider(range);
  updateSizeValue(+range.value);
  headTitle.textContent = 'Sitz anpassen';
  headSub.textContent = item.name || CAT[item.cat].one;
  setTabBarHidden(true);
  flip(() => {
    root.classList.add('is-adjusting');
    stage.classList.add('is-adjusting');
    pickerEl.hidden = true;
    adjustEl.hidden = false;
    syncTools();
    syncHint();
  });
  LAYER_ORDER.forEach((c) => slots[c].el.classList.toggle('is-target', c === item.cat));
  if (!reduce()) springAnimate(adjustEl, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { spring: 'snappy' });
}

async function exitAdjust({ silent = false } = {}) {
  if (!adjusting) return;
  adjusting = false;
  S.adjusting = false;
  clearAdjustTransform();
  setTabBarHidden(false);
  headTitle.textContent = 'Anprobe';
  syncDate(true);
  const apply = () => {
    root.classList.remove('is-adjusting');
    stage.classList.remove('is-adjusting');
    pickerEl.hidden = false;
    adjustEl.hidden = true;
    syncTools();
    syncHint();
  };
  if (silent) { apply(); fit(); } else flip(apply);
  LAYER_ORDER.forEach((c) => slots[c].el.classList.remove('is-target'));
  if (!silent && !reduce()) springAnimate(pickerEl, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { spring: 'snappy' });
  syncChipSelection(true);
  syncStripSelection(false);
  const item = adjustItem();
  if (item && JSON.stringify(item.fit || null) !== adjustStartFit) {
    if (!silent) haptic('success');
    await updateItem(item.id, { fit: item.fit || null });
  }
}

async function resetFit() {
  const item = adjustItem();
  if (!item) return;
  haptic('light');
  item.fit = null;
  const range = adjustEl.querySelector('input');
  range.value = 1; syncSlider(range); updateSizeValue(1);
  await drawSlot(item.cat, 'none');
  saveItemsSoon();
}

function commitAdjust(done) {
  const item = adjustItem();
  if (!item) return;
  if (!done.tx && !done.ty && done.sc === 1) return;
  const stageR = stage.getBoundingClientRect();
  const body = bodyView();
  const box = zoneBox(item.cat, body.guides, body.w, body.h);
  const pxX = (box.w / body.w) * stageR.width, pxY = (box.h / body.h) * stageR.height;
  // Skalierung um die Teil-Mitte verschiebt die Oberkante bei top-verankerten Teilen
  const p = placeItem(item, body.guides, body.w, body.h);
  const hPx = (p.h / body.h) * stageR.height;
  const anchorShift = box.anchor === 'bottom' ? (hPx * (done.sc - 1)) / 2 : (-hPx * (done.sc - 1)) / 2;
  item.fit = {
    dx: done.fit.dx + done.tx / pxX,
    dy: done.fit.dy + (done.ty + anchorShift) / pxY,
    s: clamp(done.fit.s * done.sc, 0.4, 2.2)
  };
  const range = adjustEl.querySelector('input');
  range.value = item.fit.s; syncSlider(range); updateSizeValue(item.fit.s);
  drawSlot(item.cat, 'none');
  saveItemsSoon();
}

// ---------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------
function bannerState() {
  if (!S.body) return { key: 'body' };
  const today = plannedToday();
  if (today.length && !today.some((o) => sameSel(o.sel, S.sel)) && S.settings.todayDismissed !== dateKey()) {
    return { key: 'today:' + today[0].id + ':' + today[0].name + ':' + (outfitUrl(today[0].id) ? 1 : 0), outfit: today[0] };
  }
  return { key: '' };
}
function syncBanner() {
  const st = bannerState();
  if (st.key === bannerKey) return;
  bannerKey = st.key;
  const old = bannerSlot.firstElementChild;
  let el = null;
  if (st.key === 'body') {
    el = h(`<div class="banner mirror-banner">
      <span class="banner-icon">${I.personCircle}</span>
      <span class="banner-body"><span class="banner-title">Dein Foto fehlt noch</span><span class="banner-text">Sieh die Outfits an dir statt an der Figur.</span></span>
      <button type="button" class="btn btn-filled btn-small">Hinzufügen</button></div>`);
    el.querySelector('.btn').addEventListener('click', () => run('openBodySetup'));
  } else if (st.outfit) {
    const o = st.outfit;
    const url = outfitUrl(o.id);
    el = h(`<div class="banner mirror-banner">
      <span class="banner-icon${url ? ' has-image' : ''}">${url ? `<img src="${url}" alt="">` : I.calendar}</span>
      <span class="banner-body"><span class="banner-title">Für heute geplant</span><span class="banner-text mirror-banner-name">${esc(o.name)}</span></span>
      <button type="button" class="btn btn-filled btn-small">Anziehen</button>
      <button type="button" class="banner-close" aria-label="Hinweis ausblenden">${I.close}</button></div>`);
    el.querySelector('.btn').addEventListener('click', () => {
      haptic('light');
      nextAnim = 'stagger';
      for (const c of LAYER_ORDER) { const s = slots[c]; if (s.current && (o.sel[c] || null) !== (S.sel[c] || null)) { leave(s.current, 'fade'); s.current = null; } }
      wearOutfit(o.id);
    });
    el.querySelector('.banner-close').addEventListener('click', () => setSetting('todayDismissed', dateKey()));
  }
  const animate = visible() && !reduce();
  if (old && animate) {
    // altes Banner blendet aus, Bühne gleitet nach
    old.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.96)' }], { duration: 160, easing: 'ease-in' })
      .finished.then(() => flip(() => { old.remove(); if (el) bannerSlot.appendChild(el); }), () => {})
      .then(() => { if (el) springAnimate(el, [{ opacity: 0, transform: 'translateY(-8px) scale(.97)' }, { opacity: 1, transform: 'none' }], { spring: 'bouncy' }); });
    return;
  }
  flip(() => { bannerSlot.replaceChildren(...(el ? [el] : [])); });
  if (el && animate) springAnimate(el, [{ opacity: 0, transform: 'translateY(-8px) scale(.97)' }, { opacity: 1, transform: 'none' }], { spring: 'bouncy', delay: 120, fill: 'backwards' });
}

// ---------------------------------------------------------------------
// Kopf
// ---------------------------------------------------------------------
function syncDate(force = false) {
  const d = new Date();
  const key = d.toDateString();
  if (!force && key === dayShown) return;
  dayShown = key;
  if (!adjusting) headSub.textContent = d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
}

// ---------------------------------------------------------------------
// Ereignisse
// ---------------------------------------------------------------------
function onSel({ changed = LAYER_ORDER } = {}) {
  const anim = nextAnim || 'fade';
  nextAnim = null;
  if (adjusting && !adjustItem()) exitAdjust({ silent: true });
  drawLayers(changed, anim);
  syncStripSelection(true);
  syncTools();
  syncBanner();
}

function onItems(d = {}) {
  if (d.updated && d.patch && Object.keys(d.patch).every((k) => k === 'fit' || k === 'name' || k === 'fav')) {
    // nur Sitz/Name: gezielt nachzeichnen
    const it = d.updated;
    if ('fit' in d.patch && S.sel[it.cat] === it.id && !(adjusting && S.cat === it.cat)) drawSlot(it.cat, 'none');
    if ('name' in d.patch) { stripSig = ''; renderStrip(); syncStripSelection(false); }
    return;
  }
  if (d.reloaded) { stageSize = { w: 0, h: 0 }; syncBody(true); redrawAll(); }
  else if (d.updated) {
    // Bild oder Kategorie geändert
    const it = d.updated;
    for (const c of LAYER_ORDER) if (S.sel[c] === it.id) drawSlot(c, 'fade');
  }
  if (adjusting && !adjustItem()) exitAdjust({ silent: true });
  refreshPicker({ smooth: false });
  syncHint();
}

function onBody() {
  if (syncBody()) redrawAll();
  syncBanner();
}

function onSettings({ key } = {}) {
  if (key === 'warp' || key === 'reloaded' || key === undefined) redrawAll();
  if (key === 'swiped' || key === undefined) syncHint();
  if (key === 'todayDismissed' || key === undefined) syncBanner();
  if (key === 'reloaded' || key === undefined) { metalSeg.set(S.metal, { silent: true }); refreshPicker({ smooth: false }); }
}

// ---------------------------------------------------------------------
// View
// ---------------------------------------------------------------------
export default {
  id: 'spiegel',
  title: 'Anprobe',
  mount(container) {
    build(container);
    mounted = true;
    syncDate(true);
    syncBody(true);
    renderEmpty();
    renderChips();
    syncChipSelection(false);
    syncMetal();
    renderStrip(true);
    syncTools();
    syncBanner();
    syncHint();
    drawLayers(LAYER_ORDER, 'none');
    offs.push(
      on('sel', onSel),
      on('items', onItems),
      on('body', onBody),
      on('settings', (d) => onSettings(d && d.reloaded ? { key: 'reloaded' } : d)),
      on('outfits', () => syncBanner()),
      on('thumb', () => syncBanner())
    );
    const onResize = () => {
      const s = { w: innerWidth, h: innerHeight };
      if (s.w !== lastSize.w || s.h !== lastSize.h) { lastSize = s; fit(); }
    };
    addEventListener('resize', onResize);
    offs.push(() => removeEventListener('resize', onResize));
  },
  onShow() {
    syncDate();
    fit();
    syncStripSelection(false);
    syncBanner();
    syncHint();
    if (S.adjusting && !adjusting) enterAdjust();
  },
  onHide() {
    if (adjusting) exitAdjust({ silent: true });
    clearTimeout(showTag.t);
    tag?.classList.remove('is-shown');
  },
  unmount() {
    offs.forEach((f) => f());
    offs = [];
    ro?.disconnect();
    ro = null;
    mounted = false;
    if (adjusting) { adjusting = false; S.adjusting = false; setTabBarHidden(false); }
    root?.remove();
  }
};
