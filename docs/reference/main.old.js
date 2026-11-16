import './style.css';
import { registerSW } from 'virtual:pwa-register';
import {
  loadState, saveItems, saveOutfits, saveBody, saveSettings, saveImage, loadImage, deleteImage,
  requestPersistence, storageInfo, exportBackup, importBackup
} from './db.js';
import {
  removeBg, trimCanvas, coverage, dominantColor, guessMetal, guessCategory, estimateGuides,
  loadBitmap, canvasFrom, toBlob, preloadRemover
} from './imaging.js';
import { CATEGORIES, CAT, LAYER_ORDER, ZONE_DEFAULT, METALS, WEEKDAYS, todayIndex, placeItem, zoneBox, zoneAt, uid } from './model.js';
import { SILHOUETTE } from './silhouette.js';
import { layerFor, composeOutfit as composeImage, forgetItem } from './render.js';
import { I } from './icons.js';

registerSW({ immediate: true });

// ---------- Zustand ----------
const S = {
  items: [], outfits: [], body: null, settings: {},
  sel: {}, cat: 'oberteil', metal: 'alle', tab: 'spiegel',
  closetFilter: 'alle', dayFilter: 'alle', adjusting: false
};
const urls = new Map();
const app = document.getElementById('app');
const $ = (s, r = document) => r.querySelector(s);
const esc = (t = '') => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function ensureUrl(id) {
  if (urls.has(id)) return urls.get(id);
  const b = await loadImage(id);
  if (!b) return null;
  const u = URL.createObjectURL(b);
  urls.set(id, u);
  return u;
}
function setUrl(id, blob) {
  if (urls.has(id)) URL.revokeObjectURL(urls.get(id));
  urls.set(id, URL.createObjectURL(blob));
}

const bodyView = () => (S.body && urls.get('body') ? { ...S.body, src: urls.get('body') } : SILHOUETTE);
const itemById = (id) => S.items.find((i) => i.id === id);
const byNewest = (a, b) => b.created - a.created;
const listFor = (cat) =>
  S.items.filter((i) => i.cat === cat && (cat !== 'schmuck' || S.metal === 'alle' || i.metal === S.metal)).sort(byNewest);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

let settingsTimer;
function persistSettings() {
  clearTimeout(settingsTimer);
  settingsTimer = setTimeout(() => saveSettings({ ...S.settings, sel: S.sel, metal: S.metal }), 250);
}

function toast(text) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

function toastAction(text, label, fn) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.innerHTML = `<span>${esc(text)}</span><button type="button">${esc(label)}</button>`;
  t.querySelector('button').addEventListener('click', () => { t.remove(); fn(); });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4500);
}

// ---------- Rendering ----------
function render() {
  const views = { spiegel: viewMirror, schrank: viewCloset, outfits: viewOutfits };
  app.innerHTML = views[S.tab]() + tabsHtml();
  if (S.tab === 'spiegel') mountStage();
  if (S.tab === 'outfits') refreshStaleThumbs();
}

function tabsHtml() {
  const t = (id, label, icon) =>
    `<button data-act="tab" data-id="${id}" ${S.tab === id ? 'aria-current="page"' : ''}>${icon}<span>${label}</span></button>`;
  return `<nav class="tabs" aria-label="Bereiche">${t('spiegel', 'Spiegel', I.mirror)}${t('schrank', 'Schrank', I.hanger)}${t('outfits', 'Outfits', I.looks)}</nav>`;
}

// ---------- Spiegel ----------
const warpOn = () => S.settings.warp !== false;
const dateKey = () => new Date().toISOString().slice(0, 10);
const sameSel = (a, b) => LAYER_ORDER.every((c) => (a[c] || null) === (b[c] || null));
const hasOutfit = () => LAYER_ORDER.some((c) => S.sel[c] && itemById(S.sel[c]));

function plannedToday() {
  const t = todayIndex();
  return S.outfits.filter((o) => (o.days || []).includes(t)).sort(byNewest);
}

function viewMirror() {
  const d = new Date();
  const weekday = d.toLocaleDateString('de-DE', { weekday: 'long' });
  const date = d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' });
  let banner = '';
  const today = plannedToday();
  if (!S.body) {
    banner = `<div class="banner"><span><b>Dein Foto fehlt noch.</b> Mit einem Ganzkörperfoto siehst du die Outfits an dir statt an der Figur.</span><button data-act="body-setup">Hinzufügen</button></div>`;
  } else if (today.length && !today.some((o) => sameSel(o.sel, S.sel)) && S.settings.todayDismissed !== dateKey()) {
    const o = today[0];
    banner = `<div class="banner"><span><b>Für heute geplant:</b> ${esc(o.name)}</span><button data-act="outfit-wear" data-id="${o.id}">Anziehen</button><button data-act="today-dismiss" aria-label="Hinweis ausblenden">${I.close}</button></div>`;
  } else if (!isStandalone() && !S.settings.hideInstall) {
    banner = `<div class="banner"><span><b>Als App speichern:</b> Teilen-Symbol, dann „Zum Home-Bildschirm“. So bleibt alles dauerhaft auf dem iPhone.</span><button data-act="hide-install">OK</button></div>`;
  }
  const many = S.items.length > 1;
  return `<section class="view">
    <header class="head">
      <h1>${esc(weekday)}<span class="sub">${esc(date)}</span></h1>
      <button class="icon-btn" data-act="settings" aria-label="Einstellungen">${I.gear}</button>
      <button class="btn ink" data-act="save-outfit" ${hasOutfit() ? '' : 'disabled'}>${I.save}Speichern</button>
    </header>
    ${banner}
    <div class="stage-wrap"><div class="stage ${S.adjusting ? 'adjusting' : ''}" id="stage"></div>
      ${S.adjusting ? '' : `<div class="stage-tools">
        <button class="icon-btn" data-act="shuffle" aria-label="Zufälliges Outfit" ${many ? '' : 'disabled'}>${I.shuffle}</button>
        <button class="icon-btn" data-act="clear-outfit" aria-label="Outfit leeren" ${hasOutfit() ? '' : 'disabled'}>${I.reset}</button>
      </div>`}
    </div>
    ${S.adjusting ? adjustBarHtml() : pickerHtml()}
  </section>`;
}

function pickerHtml() {
  const chips = CATEGORIES.map((c) => {
    const n = S.items.filter((i) => i.cat === c.id).length;
    return `<button class="chip" data-act="cat" data-id="${c.id}" aria-pressed="${S.cat === c.id}">${c.label}${n ? `<span class="n">${n}</span>` : ''}</button>`;
  }).join('');
  let metal = '';
  if (S.cat === 'schmuck') {
    metal = `<div class="chips" role="group" aria-label="Metall">${[{ id: 'alle', label: 'Alles' }, ...METALS]
      .map((m) => `<button class="chip" data-act="metal" data-id="${m.id}" aria-pressed="${S.metal === m.id}">${m.id !== 'alle' ? `<span class="dot metal-${m.id}"></span>` : ''}${m.label}</button>`)
      .join('')}</div>`;
  }
  const list = listFor(S.cat);
  const cur = S.sel[S.cat] || null;
  let strip;
  if (!list.length) {
    const what = S.cat === 'schmuck' && S.metal !== 'alle' ? `${S.metal === 'gold' ? 'goldenen' : 'silbernen'} Schmuck` : CAT[S.cat].label;
    strip = `<div class="strip-empty"><span>Noch kein${S.cat === 'schmuck' ? '' : 'e'} ${esc(what)} im Schrank.</span><button class="btn primary" data-act="scan" data-cat="${S.cat}">${I.camera}Scannen</button></div>`;
  } else {
    strip = `<div class="strip" id="strip">
      <button class="thumb none" data-act="pick" data-id="" aria-pressed="${!cur}">Ohne</button>
      ${list.map((i) => `<button class="thumb" data-act="pick" data-id="${i.id}" aria-pressed="${cur === i.id}" aria-label="${esc(i.name)}">
        <img src="${urls.get(i.id) || ''}" alt="" loading="lazy">${i.cat === 'schmuck' && i.metal ? `<span class="metal metal-${i.metal}"></span>` : ''}</button>`).join('')}
    </div>
    ${cur ? `<button class="icon-btn" data-act="adjust" aria-label="Sitz anpassen">${I.move}</button>` : ''}`;
  }
  const hint = !S.settings.swiped && S.items.length > 1 ? '<p class="hint">Tipp: Auf Oberkörper, Beinen oder Füßen nach links oder rechts wischen.</p>' : '';
  return `<div class="picker">
    ${hint}
    <div class="chips" role="group" aria-label="Kategorie">${chips}</div>
    ${metal}
    <div class="strip-row">${strip}</div>
  </div>`;
}

function adjustBarHtml() {
  const item = itemById(S.sel[S.cat]);
  const s = item?.fit?.s ?? 1;
  return `<div class="picker">
    <p class="hint">${esc(item?.name || CAT[S.cat].one)}: mit einem Finger verschieben, mit zwei Fingern größer oder kleiner ziehen.</p>
    <div class="adjust-bar">
      <label for="fit-size">Größe</label>
      <input id="fit-size" type="range" min="0.4" max="2.2" step="0.01" value="${s}">
    </div>
    <div class="row" style="padding:0 16px 12px">
      <button class="btn" data-act="fit-reset">Zurücksetzen</button>
      <button class="btn ink" data-act="adjust-done">Fertig</button>
    </div>
  </div>`;
}

let stageRO;
function mountStage() {
  const stage = $('#stage');
  const wrap = stage.parentElement;
  const body = bodyView();
  stage.style.setProperty('--floor', body.guides.floor ?? 0.98);
  stage.innerHTML = `<img class="body" src="${body.src}" alt="">
    <div id="layers">${LAYER_ORDER.map((c) => `<div class="slot" data-cat="${c}"></div>`).join('')}</div>
    <div class="zone-tag" id="zone-tag"></div>`;
  const fit = () => {
    const cs = getComputedStyle(wrap);
    const aw = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const ah = wrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const r = body.w / body.h;
    let w = aw, h = w / r;
    if (h > ah) { h = ah; w = h * r; }
    stage.style.width = Math.max(40, w) + 'px';
    stage.style.height = Math.max(40, h) + 'px';
  };
  stageRO?.disconnect();
  stageRO = new ResizeObserver(fit);
  stageRO.observe(wrap);
  fit();
  drawLayers();
  bindStageGestures(stage);
  if (S.adjusting) {
    let raf = 0;
    $('#fit-size')?.addEventListener('input', (e) => {
      const item = itemById(S.sel[S.cat]);
      if (!item) return;
      item.fit = { dx: 0, dy: 0, ...item.fit, s: +e.target.value };
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => drawLayers([S.cat]));
      saveItemsSoon();
    });
  }
  $('#strip [aria-pressed="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

const slotOf = (cat) => document.querySelector(`#layers .slot[data-cat="${cat}"]`);

/** Zeichnet die Ebenen (alle oder nur die genannten Kategorien). */
async function drawLayers(cats = LAYER_ORDER) {
  if (!$('#layers')) return;
  const body = bodyView();
  await Promise.all(cats.map(async (cat) => {
    const slot = slotOf(cat);
    if (!slot) return;
    slot.classList.toggle('target', S.adjusting && cat === S.cat);
    const item = itemById(S.sel[cat]);
    const url = item && urls.get(item.id);
    if (!url) { slot.replaceChildren(); return; }
    let l;
    try { l = await layerFor(item, url, body, warpOn()); } catch (e) { console.warn(e); return; }
    if (S.sel[cat] !== item.id || !slot.isConnected) return; // inzwischen gewechselt
    Object.assign(l.canvas.style, {
      left: (l.x / body.w) * 100 + '%',
      top: (l.y / body.h) * 100 + '%',
      width: (l.w / body.w) * 100 + '%',
      height: (l.h / body.h) * 100 + '%'
    });
    if (slot.firstChild !== l.canvas) slot.replaceChildren(l.canvas);
  }));
}

function showZoneTag(cat) {
  const tag = $('#zone-tag');
  if (!tag) return;
  const body = bodyView();
  const b = zoneBox(cat, body.guides, body.w, body.h);
  const list = listFor(cat);
  const cur = S.sel[cat];
  const idx = cur ? list.findIndex((i) => i.id === cur) + 1 : 0;
  tag.textContent = cur ? `${CAT[cat].one} ${idx}/${list.length}` : `Ohne ${CAT[cat].one}`;
  tag.style.top = ((b.y + b.h / 2) / body.h) * 100 + '%';
  tag.classList.add('show');
  clearTimeout(showZoneTag.t);
  showZoneTag.t = setTimeout(() => tag.classList.remove('show'), 1100);
}

/** Setzt ein Teil und gibt die Kategorien zurück, die sich geändert haben. */
function select(cat, id) {
  const changed = [cat];
  S.sel[cat] = id || null;
  if (id && cat === 'kleid') {
    if (S.sel.oberteil) changed.push('oberteil');
    if (S.sel.hose) changed.push('hose');
    S.sel.oberteil = null; S.sel.hose = null;
  }
  if (id && (cat === 'oberteil' || cat === 'hose') && S.sel.kleid) { S.sel.kleid = null; changed.push('kleid'); }
  persistSettings();
  return changed;
}

function nextId(cat, dir) {
  const ids = [null, ...listFor(cat).map((i) => i.id)];
  const i = Math.max(0, ids.indexOf(S.sel[cat] || null));
  return ids[(i + dir + ids.length) % ids.length];
}

let swapping = false;
/** Wechselt ein Teil mit Animation (rausgleiten, neues reingleiten). */
async function swapTo(cat, id, dir, fromDx = 0) {
  if (swapping) return;
  swapping = true;
  const slot = slotOf(cat);
  const w = $('#stage')?.clientWidth || 300;
  try {
    if (slot?.firstChild && slot.animate && !reduceMotion()) {
      await slot.animate(
        [{ transform: `translateX(${fromDx}px)`, opacity: Math.max(0.2, 1 - Math.abs(fromDx) / w) }, { transform: `translateX(${-dir * w * 0.45}px)`, opacity: 0 }],
        { duration: 130, easing: 'ease-in' }
      ).finished;
    }
    if (slot) { slot.style.transform = ''; slot.style.opacity = ''; slot.style.visibility = 'hidden'; }
    const changed = select(cat, id);
    await drawLayers(changed);
    if (slot) {
      slot.style.visibility = '';
      if (slot.firstChild && slot.animate && !reduceMotion()) {
        slot.animate([{ transform: `translateX(${dir * w * 0.3}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 200, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
    }
    showZoneTag(cat);
    refreshStripSelection();
  } finally {
    swapping = false;
  }
}
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function bindStageGestures(stage) {
  const pts = new Map();
  let g = null; // laufende Geste

  const zoneCat = (clientY) => {
    const rect = stage.getBoundingClientRect();
    const zone = zoneAt((clientY - rect.top) / rect.height, bodyView().guides);
    const zoneCats = CATEGORIES.filter((c) => c.zone === zone).map((c) => c.id);
    return zoneCats.includes(S.cat) ? S.cat : ZONE_DEFAULT[zone];
  };

  stage.addEventListener('pointerdown', (e) => {
    stage.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (S.adjusting) {
      const item = itemById(S.sel[S.cat]);
      if (!item) return;
      const fit = { dx: 0, dy: 0, s: 1, ...item.fit };
      const [a, b] = [...pts.values()];
      if (pts.size === 1) g = { kind: 'move', x: a.x, y: a.y, fit, tx: 0, ty: 0, sc: 1 };
      else if (pts.size === 2 && g) {
        g.kind = 'pinch';
        g.d0 = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        g.mx0 = (a.x + b.x) / 2 - g.tx; g.my0 = (a.y + b.y) / 2 - g.ty;
        g.sc0 = g.sc;
      }
      return;
    }
    if (pts.size === 1) g = { kind: 'swipe', x: e.clientX, y: e.clientY, cat: zoneCat(e.clientY), dragging: false };
  });

  stage.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId) || !g) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.kind === 'swipe') {
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (!g.dragging && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) g.dragging = true;
      if (g.dragging && !swapping) {
        const slot = slotOf(g.cat);
        if (slot) {
          slot.style.transform = `translateX(${dx}px)`;
          slot.style.opacity = String(Math.max(0.25, 1 - Math.abs(dx) / (stage.clientWidth * 0.9)));
        }
      }
      return;
    }
    // Anpassen
    const slot = slotOf(S.cat);
    const [a, b] = [...pts.values()];
    if (g.kind === 'move' && pts.size === 1) {
      g.tx = a.x - g.x; g.ty = a.y - g.y;
    } else if (g.kind === 'pinch' && pts.size >= 2) {
      g.sc = Math.min(3, Math.max(0.3, g.sc0 * (Math.hypot(a.x - b.x, a.y - b.y) / g.d0)));
      g.tx = (a.x + b.x) / 2 - g.mx0; g.ty = (a.y + b.y) / 2 - g.my0;
    }
    if (slot) {
      const item = itemById(S.sel[S.cat]);
      const body = bodyView();
      const p = placeItem(item, body.guides, body.w, body.h);
      const ox = ((p.x + p.w / 2) / body.w) * stage.clientWidth, oy = ((p.y + p.h / 2) / body.h) * stage.clientHeight;
      slot.style.transformOrigin = `${ox}px ${oy}px`;
      slot.style.transform = `translate(${g.tx}px, ${g.ty}px) scale(${g.sc})`;
    }
  });

  const end = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (!g) return;
    if (g.kind === 'swipe') {
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      const cur = g;
      g = null;
      const slot = slotOf(cur.cat);
      if (e.type !== 'pointercancel' && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
        const dir = dx < 0 ? 1 : -1;
        if (!S.settings.swiped) { S.settings.swiped = true; persistSettings(); document.querySelector('.picker .hint')?.remove(); }
        const changedCat = cur.cat !== S.cat;
        S.cat = cur.cat;
        if (changedCat) refreshPicker();
        if (listFor(cur.cat).length === 0) {
          if (slot) { slot.style.transform = ''; slot.style.opacity = ''; }
          toast(`Noch keine ${CAT[cur.cat].label} im Schrank`);
          return;
        }
        swapTo(cur.cat, nextId(cur.cat, dir), dir, dx);
      } else {
        if (slot && cur.dragging && slot.animate) {
          slot.animate([{ transform: slot.style.transform, opacity: slot.style.opacity || 1 }, { transform: 'none', opacity: 1 }], { duration: 160, easing: 'ease-out' });
        }
        if (slot) { slot.style.transform = ''; slot.style.opacity = ''; }
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) {
          if (cur.cat !== S.cat) { S.cat = cur.cat; refreshPicker(); }
          showZoneTag(cur.cat);
        }
      }
      return;
    }
    // Anpassen abschließen, sobald kein Finger mehr liegt
    if (pts.size > 0) {
      if (g.kind === 'pinch') { const [a] = [...pts.values()]; g.kind = 'move'; g.x = a.x - g.tx; g.y = a.y - g.ty; }
      return;
    }
    const item = itemById(S.sel[S.cat]);
    const done = g;
    g = null;
    if (!item) return;
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
      s: Math.min(2.2, Math.max(0.4, done.fit.s * done.sc))
    };
    const slot = slotOf(S.cat);
    drawLayers([S.cat]).then(() => { if (slot) { slot.style.transform = ''; slot.style.transformOrigin = ''; } });
    const range = $('#fit-size');
    if (range) range.value = item.fit.s;
    saveItemsSoon();
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
}

function refreshPicker() {
  const p = document.querySelector('.picker');
  if (!p) return;
  p.outerHTML = S.adjusting ? adjustBarHtml() : pickerHtml();
  $('#strip [aria-pressed="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}
function refreshStripSelection() {
  const cur = S.sel[S.cat] || '';
  document.querySelectorAll('#strip .thumb').forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.id === cur)));
  $('#strip [aria-pressed="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  const has = hasOutfit();
  const save = document.querySelector('.head [data-act="save-outfit"]');
  if (save) save.disabled = !has;
  const clear = document.querySelector('[data-act="clear-outfit"]');
  if (clear) clear.disabled = !has;
  // Anpassen-Knopf nur, wenn etwas gewählt ist
  const row = document.querySelector('.strip-row');
  const adj = row?.querySelector('[data-act="adjust"]');
  if (row && !adj && S.sel[S.cat]) row.insertAdjacentHTML('beforeend', `<button class="icon-btn" data-act="adjust" aria-label="Sitz anpassen">${I.move}</button>`);
  if (adj && !S.sel[S.cat]) adj.remove();
}

function shuffle() {
  const pick = (cat) => { const l = listFor(cat); return l.length ? l[Math.floor(Math.random() * l.length)].id : null; };
  const nTops = S.items.filter((i) => i.cat === 'oberteil').length;
  const nDress = S.items.filter((i) => i.cat === 'kleid').length;
  const sel = { ...S.sel };
  if (nDress && Math.random() < nDress / (nDress + nTops + 0.001)) {
    sel.kleid = pick('kleid'); sel.oberteil = null; sel.hose = null;
  } else {
    sel.kleid = null; sel.oberteil = pick('oberteil'); sel.hose = pick('hose');
  }
  sel.schuhe = pick('schuhe');
  sel.jacke = Math.random() < 0.35 ? pick('jacke') : null;
  sel.schmuck = Math.random() < 0.5 ? pick('schmuck') : null;
  S.sel = sel;
  persistSettings();
  const slots = document.querySelectorAll('#layers .slot');
  drawLayers().then(() => {
    if (reduceMotion()) return;
    slots.forEach((s, i) => s.firstChild && s.animate?.([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 220, delay: i * 35, easing: 'ease-out', fill: 'backwards' }));
  });
  refreshStripSelection();
}

let itemsTimer;
function saveItemsSoon() {
  clearTimeout(itemsTimer);
  itemsTimer = setTimeout(() => saveItems(S.items), 300);
}

// ---------- Schrank ----------
function viewCloset() {
  const filters = [{ id: 'alle', label: 'Alle' }, ...CATEGORIES];
  const chips = filters.map((c) => `<button class="chip" data-act="closet-filter" data-id="${c.id}" aria-pressed="${S.closetFilter === c.id}">${c.label}</button>`).join('');
  let content;
  if (!S.items.length) {
    content = `<div class="empty"><h2>Der Schrank ist leer</h2><p>Fotografiere ein Kleidungsstück, die App schneidet es automatisch aus und legt es hier ab.</p><button class="btn primary" data-act="scan">${I.camera}Erstes Teil scannen</button></div>`;
  } else {
    const cats = S.closetFilter === 'alle' ? CATEGORIES : [CAT[S.closetFilter]];
    content = cats.map((c) => {
      const list = S.items.filter((i) => i.cat === c.id).sort(byNewest);
      if (!list.length) return S.closetFilter === 'alle' ? '' : `<p class="note">Noch keine ${c.label}.</p>`;
      return `<h2 class="section-title">${c.label}<span class="n">${list.length}</span></h2>
        <div class="grid">${list.map((i) => `<button class="tile" data-act="item" data-id="${i.id}" aria-label="${esc(i.name)}"><img src="${urls.get(i.id) || ''}" alt="">${i.metal && i.cat === 'schmuck' ? `<span class="metal metal-${i.metal}"></span>` : ''}</button>`).join('')}</div>`;
    }).join('');
  }
  return `<section class="view">
    <header class="head"><h1>Schrank<span class="sub">${S.items.length} ${S.items.length === 1 ? 'Teil' : 'Teile'}</span></h1>
      <button class="btn primary" data-act="scan">${I.camera}Teil scannen</button></header>
    <div class="chips">${chips}</div>
    <div class="scroll">${content}</div>
  </section>`;
}

// ---------- Outfits ----------
function viewOutfits() {
  const t = todayIndex();
  const chips = [`<button class="chip" data-act="day-filter" data-id="alle" aria-pressed="${S.dayFilter === 'alle'}">Alle</button>`,
    ...WEEKDAYS.map((d, i) => `<button class="chip ${i === t ? 'today' : ''}" data-act="day-filter" data-id="${i}" aria-pressed="${String(S.dayFilter) === String(i)}">${d}</button>`)].join('');
  const list = S.outfits
    .filter((o) => S.dayFilter === 'alle' || (o.days || []).includes(+S.dayFilter))
    .sort(byNewest);
  let content;
  if (!S.outfits.length) {
    content = `<div class="empty"><h2>Noch keine Outfits</h2><p>Stell im Spiegel ein Outfit zusammen und tippe auf „Speichern“. Hier kannst du es dann Wochentagen zuordnen.</p><button class="btn ink" data-act="tab" data-id="spiegel">Zum Spiegel</button></div>`;
  } else if (!list.length) {
    content = `<p class="note" style="margin-top:12px">Für ${WEEKDAYS[+S.dayFilter]} ist noch kein Outfit geplant. Öffne ein Outfit und wähle den Tag aus.</p>`;
  } else {
    content = `<div class="grid two" style="margin-top:8px">${list.map((o) => `<button class="look" data-act="outfit" data-id="${o.id}">
      <div class="pic"><img src="${urls.get('outfit:' + o.id) || ''}" alt=""></div>
      <div class="name">${esc(o.name)}</div>
      <div class="days">${(o.days || []).length ? (o.days || []).slice().sort().map((d) => WEEKDAYS[d]).join(', ') : 'Kein Tag geplant'}</div>
    </button>`).join('')}</div>`;
  }
  return `<section class="view">
    <header class="head"><h1>Outfits<span class="sub">${S.outfits.length} gespeichert</span></h1></header>
    <div class="chips">${chips}</div>
    <div class="scroll">${content}</div>
  </section>`;
}

// ---------- Sheets ----------
function openSheet(html, { full = false } = {}) {
  closeSheet();
  const back = document.createElement('div');
  back.className = 'sheet-back';
  back.innerHTML = `<div class="sheet ${full ? 'full' : ''}" role="dialog" aria-modal="true">${full ? '' : '<div class="grab"></div>'}${html}</div>`;
  back.addEventListener('click', (e) => { if (e.target === back) closeSheet(); });
  document.body.appendChild(back);
  return back.firstElementChild;
}
function closeSheet() {
  document.querySelector('.sheet-back')?.remove();
}

// ---------- Scannen ----------
let scanCtx = null;

function openScan(presetCat) {
  preloadRemover();
  scanCtx = { presetCat, queue: [], saved: 0 };
  const sheet = openSheet('<div id="scan" style="display:flex;flex-direction:column;flex:1;min-height:0"></div>', { full: true });
  sheet.addEventListener('change', onScanFile);
  scanStart();
}

function scanHeader(title) {
  return `<header class="head" style="padding:6px 0 4px"><h1 style="font-size:24px">${title}</h1>
    <button class="icon-btn" data-act="close-sheet" aria-label="Schließen">${I.close}</button></header>`;
}

function fileButtons(prefix = 'scan') {
  return `<label class="btn primary block">${I.camera}Foto aufnehmen<input class="sr" type="file" accept="image/*" capture="environment" data-in="${prefix}"></label>
    <label class="btn block">${I.image}Aus Fotos wählen<input class="sr" type="file" accept="image/*" ${prefix === 'scan' ? 'multiple' : ''} data-in="${prefix}"></label>`;
}

function scanStart() {
  const el = $('#scan');
  const saved = scanCtx.saved ? `<p class="note" style="color:var(--accent);font-weight:600">${scanCtx.saved} ${scanCtx.saved === 1 ? 'Teil' : 'Teile'} gespeichert.</p>` : '';
  el.innerHTML = `${scanHeader('Teil scannen')}
    ${saved}
    <p class="lead">Die App erkennt das Kleidungsstück auf dem Foto und schneidet es aus.</p>
    <ul class="tips">
      <li>Teil flach auf einen ruhigen, einfarbigen Untergrund legen (Bett, Boden, Tisch).</li>
      <li>Von oben fotografieren, ganzes Teil im Bild, gutes Licht.</li>
      <li>Schuhe von der Seite, Schmuck auf hellem Stoff.</li>
      <li>Aus der Fotomediathek kannst du mehrere auf einmal wählen.</li>
    </ul>
    <div class="stack" style="margin-top:auto">${fileButtons('scan')}</div>`;
}

async function onScanFile(e) {
  const input = e.target;
  if (!input.files?.length) return;
  const files = [...input.files];
  input.value = '';
  if (input.dataset.in === 'body') return processBody(files[0]);
  scanCtx.queue.push(...files);
  if (!scanCtx.busy) nextInQueue();
}

function nextInQueue() {
  const file = scanCtx.queue.shift();
  if (!file) return scanStart();
  processGarment(file);
}

function busyHtml(title, text) {
  return `${scanHeader(title)}<div class="busy"><strong id="busy-text">${esc(text)}</strong>
    <div class="progress indef" id="busy-bar"><i></i></div>
    <p id="busy-note">Das passiert direkt auf dem iPhone, kein Foto verlässt das Gerät.</p></div>`;
}
function onProgress(text, frac) {
  const t = $('#busy-text'), bar = $('#busy-bar');
  if (!t || !bar) return;
  t.textContent = text + (frac != null ? ` ${Math.round(frac * 100)} %` : '');
  bar.classList.toggle('indef', frac == null);
  if (frac != null) bar.firstElementChild.style.width = Math.round(frac * 100) + '%';
}

async function processGarment(file) {
  const el = $('#scan');
  if (!el) return;
  scanCtx.busy = true;
  const left = scanCtx.queue.length;
  el.innerHTML = busyHtml(left ? `Teil scannen (noch ${left})` : 'Teil scannen', 'Foto wird vorbereitet');
  let canvas = null, failed = null;
  try {
    const cut = await removeBg(file, { onProgress });
    canvas = trimCanvas(cut);
    if (!canvas || coverage(canvas) < 0.04) failed = 'Auf dem Foto wurde kein Kleidungsstück erkannt.';
  } catch (err) {
    console.error(err);
    failed = 'Das Ausschneiden hat nicht geklappt.';
  }
  scanCtx.busy = false;
  if (!$('#scan')) return;
  if (failed) {
    scanCtx.file = file;
    $('#scan').innerHTML = `${scanHeader('Teil scannen')}
      <div class="busy"><p class="err">${failed}</p><p>Probier es mit ruhigerem Untergrund und mehr Licht noch einmal, oder übernimm das Foto ohne Ausschneiden.</p></div>
      <div class="stack">${fileButtons('scan')}<button class="btn" data-act="scan-raw">Foto ohne Ausschneiden übernehmen</button>
      ${scanCtx.queue.length ? '<button class="btn" data-act="scan-skip">Überspringen</button>' : ''}</div>`;
    return;
  }
  showScanResult(canvas);
}

async function scanRaw() {
  const bmp = await loadBitmap(scanCtx.file);
  showScanResult(canvasFrom(bmp, 900));
}

function showScanResult(canvas) {
  const cat = scanCtx.presetCat || guessCategory(canvas);
  const color = dominantColor(canvas);
  scanCtx.result = { canvas, cat, color, metal: guessMetal(canvas), name: '', catTouched: !!scanCtx.presetCat };
  const src = canvas.toDataURL('image/png');
  const el = $('#scan');
  el.innerHTML = `${scanHeader('Passt das so?')}
    <div class="preview"><img id="res-img" src="${src}" alt="Ausgeschnittenes Teil"></div>
    <div class="row" style="margin-top:8px"><button class="btn" data-act="scan-rotate">${I.rotate}Drehen</button></div>
    <div class="field"><span>Was ist es?</span><div class="wrap-chips" id="res-cat">${CATEGORIES.map((c) => `<button class="chip" data-act="res-cat" data-id="${c.id}" aria-pressed="${c.id === cat}">${c.one}</button>`).join('')}</div></div>
    <div class="field" id="res-metal" ${cat === 'schmuck' ? '' : 'hidden'}><span>Metall</span><div class="wrap-chips">${METALS.map((m) => `<button class="chip" data-act="res-metal" data-id="${m.id}" aria-pressed="${m.id === scanCtx.result.metal}"><span class="dot metal-${m.id}"></span>${m.label}</button>`).join('')}</div></div>
    <div class="field"><span>Name (optional)</span><input type="text" id="res-name" placeholder="${esc(color.name)} ${esc(CAT[cat].noun)}" autocomplete="off"></div>
    <div class="color-line"><span class="sw" style="background:${color.hex}"></span>Farbe erkannt: ${esc(color.name)}</div>
    <div class="row" style="margin-top:16px">
      <button class="btn" data-act="scan-again">Verwerfen</button>
      <button class="btn primary" data-act="scan-save">Speichern</button>
    </div>`;
}

function scanRotate() {
  const r = scanCtx.result;
  const src = r.canvas;
  const c = document.createElement('canvas');
  c.width = src.height;
  c.height = src.width;
  const ctx = c.getContext('2d');
  ctx.translate(c.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(src, 0, 0);
  r.canvas = c;
  $('#res-img').src = c.toDataURL('image/png');
  if (!r.catTouched) {
    const el = document.querySelector(`#res-cat [data-id="${guessCategory(c)}"]`);
    if (el) { actions['res-cat'](el); r.catTouched = false; }
  }
}

async function scanSave() {
  const r = scanCtx.result;
  if (r.saving) return;
  r.saving = true;
  const name = $('#res-name').value.trim() || `${r.color.name} ${CAT[r.cat].noun}`;
  const blob = await toBlob(r.canvas, 'image/png');
  const id = uid();
  await saveImage(id, blob);
  setUrl(id, blob);
  const item = { id, cat: r.cat, name, color: r.color, metal: r.cat === 'schmuck' ? r.metal : null, w: r.canvas.width, h: r.canvas.height, created: Date.now(), fit: null };
  S.items.push(item);
  await saveItems(S.items);
  requestPersistence();
  scanCtx.saved++;
  // direkt im Spiegel anziehen
  select(item.cat, item.id);
  S.cat = item.cat;
  toast('Im Schrank gespeichert');
  nextInQueue();
}

// ---------- Ganzkörperfoto ----------
function openBodySetup() {
  preloadRemover();
  scanCtx = { queue: [] };
  const sheet = openSheet('<div id="scan" style="display:flex;flex-direction:column;flex:1;min-height:0"></div>', { full: true });
  sheet.addEventListener('change', onScanFile);
  $('#scan').innerHTML = `${scanHeader('Dein Foto')}
    <p class="lead">Ein Ganzkörperfoto von dir, auf das die Kleidung gelegt wird. Es bleibt nur auf diesem iPhone.</p>
    <ul class="tips">
      <li>Gerade von vorne, ganzer Körper von Kopf bis Fuß im Bild.</li>
      <li>Arme leicht vom Körper weg, eng anliegende Kleidung.</li>
      <li>Am besten vor einer ruhigen Wand, Handy auf Hüfthöhe.</li>
    </ul>
    <div class="stack" style="margin-top:auto">${fileButtons('body')}
    ${S.body ? '<button class="btn" data-act="guides">Nur Hilfslinien anpassen</button>' : ''}</div>`;
}

async function processBody(file) {
  const el = $('#scan');
  el.innerHTML = busyHtml('Dein Foto', 'Foto wird vorbereitet');
  let canvas, cutout = true;
  try {
    const cut = await removeBg(file, { maxSide: 1600, onProgress });
    canvas = trimCanvas(cut, 1600, 0.03);
    if (!canvas || coverage(canvas) < 0.05) throw new Error('leer');
  } catch (err) {
    console.error(err);
    const bmp = await loadBitmap(file);
    canvas = canvasFrom(bmp, 1600);
    cutout = false;
    toast('Hintergrund nicht entfernt, Foto wird so verwendet');
  }
  const guides = estimateGuides(canvas);
  const blob = await toBlob(canvas, 'image/png');
  scanCtx.bodyDraft = { blob, w: canvas.width, h: canvas.height, guides, cutout, src: URL.createObjectURL(blob) };
  openGuides(scanCtx.bodyDraft);
}

function openGuides(draft) {
  const el = $('#scan') || openSheet('<div id="scan" style="display:flex;flex-direction:column;flex:1;min-height:0"></div>', { full: true }).firstElementChild;
  const g = { ...draft.guides };
  el.innerHTML = `${scanHeader('Hilfslinien')}
    <p class="lead" style="margin:0">Zieh die Linien auf Schultern, Hüfte und Knöchel. Danach richtet sich, wo die Kleidung sitzt.</p>
    <div class="guide-wrap" id="gwrap"><div class="guide-stage" id="gstage">
      <img src="${draft.src}" alt="Dein Foto">
      <div id="gbox" style="position:absolute;border:1.5px solid var(--accent);background:rgba(51,67,196,.08);border-radius:8px;pointer-events:none"></div>
      ${[['s', 'Schultern'], ['h', 'Hüfte'], ['a', 'Knöchel']].map(([k, l]) => `<div class="guide" data-k="${k}"><b>${l}</b></div>`).join('')}
    </div></div>
    <div class="adjust-bar" style="padding:0 0 10px"><label for="gw">Körperbreite</label><input id="gw" type="range" min="0.15" max="0.95" step="0.005" value="${g.w}"></div>
    <button class="btn primary block" data-act="guides-save">Fertig</button>`;
  const stage = $('#gstage'), wrap = $('#gwrap');
  const r = draft.w / draft.h;
  const fit = () => {
    let h = wrap.clientHeight, w = h * r;
    if (w > wrap.clientWidth - 24) { w = wrap.clientWidth - 24; h = w / r; }
    stage.style.width = w + 'px';
    stage.style.height = h + 'px';
  };
  const place = () => {
    stage.querySelectorAll('.guide').forEach((n) => (n.style.top = g[n.dataset.k] * 100 + '%'));
    const box = $('#gbox');
    box.style.top = g.s * 100 + '%';
    box.style.height = (g.h - g.s) * 100 + '%';
    box.style.left = (g.cx - g.w / 2) * 100 + '%';
    box.style.width = g.w * 100 + '%';
  };
  fit();
  place();
  new ResizeObserver(fit).observe(wrap);
  $('#gw').addEventListener('input', (e) => { g.w = +e.target.value; place(); });
  stage.querySelectorAll('.guide').forEach((n) => {
    n.addEventListener('pointerdown', (e) => {
      n.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const rect = stage.getBoundingClientRect();
        let y = (ev.clientY - rect.top) / rect.height;
        const k = n.dataset.k;
        const lo = k === 's' ? 0.02 : k === 'h' ? g.s + 0.05 : g.h + 0.05;
        const hi = k === 's' ? g.h - 0.05 : k === 'h' ? g.a - 0.05 : 0.995;
        g[k] = Math.min(hi, Math.max(lo, y));
        place();
      };
      const up = () => { n.removeEventListener('pointermove', move); n.removeEventListener('pointerup', up); };
      n.addEventListener('pointermove', move);
      n.addEventListener('pointerup', up);
    });
  });
  scanCtx.guidesDraft = { draft, g };
}

async function guidesSave() {
  const { draft, g } = scanCtx.guidesDraft;
  if (g.floor < g.a) g.floor = Math.min(1, g.a + 0.04);
  if (draft.blob) {
    await saveImage('body', draft.blob);
    setUrl('body', draft.blob);
  }
  S.body = { w: draft.w, h: draft.h, guides: g, cutout: draft.cutout !== false, updated: Date.now() };
  await saveBody(S.body);
  requestPersistence();
  closeSheet();
  S.tab = 'spiegel';
  render();
  toast('Foto gespeichert');
}

// ---------- Outfits speichern ----------
const outfitSig = (sel) =>
  JSON.stringify([
    LAYER_ORDER.map((c) => { const it = itemById(sel[c]); return it ? [it.id, it.cat, it.fit || null] : null; }),
    S.body?.updated || 0, warpOn()
  ]);

async function composeOutfit(sel) {
  const urlOf = (id) => urls.get(id);
  try {
    return await composeImage(sel, bodyView(), itemById, urlOf, LAYER_ORDER, warpOn());
  } catch (e) {
    // Fallback ohne Figur (manche Browser sperren SVG-Bilder im Canvas)
    console.warn(e);
    return composeImage(sel, { ...bodyView(), src: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==' }, itemById, urlOf, LAYER_ORDER, warpOn());
  }
}

/** Outfit-Vorschauen neu zeichnen, wenn sich Teile, Sitz oder Foto geändert haben. */
let refreshingThumbs = false;
async function refreshStaleThumbs() {
  if (refreshingThumbs) return;
  refreshingThumbs = true;
  try {
    for (const o of S.outfits) {
      const sig = outfitSig(o.sel);
      if (o.sig === sig) continue;
      if (!Object.values(o.sel).some((id) => itemById(id))) continue;
      const blob = await composeOutfit(o.sel);
      await saveImage('outfit:' + o.id, blob);
      setUrl('outfit:' + o.id, blob);
      o.sig = sig;
      const img = document.querySelector(`[data-act="outfit"][data-id="${o.id}"] img`);
      if (img) img.src = urls.get('outfit:' + o.id);
    }
    await saveOutfits(S.outfits);
  } finally {
    refreshingThumbs = false;
  }
}

function dayChips(days, act) {
  const t = todayIndex();
  return WEEKDAYS.map((d, i) => `<button class="chip ${i === t ? 'today' : ''}" data-act="${act}" data-id="${i}" aria-pressed="${days.includes(i)}">${d}</button>`).join('');
}

function openSaveOutfit() {
  const date = new Date().toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  S._draftDays = [];
  openSheet(`<h2>Outfit speichern</h2>
    <div class="field"><span>Name</span><input type="text" id="o-name" value="Outfit ${esc(date)}" autocomplete="off"></div>
    <div class="field"><span>An welchen Tagen tragen? (optional)</span><div class="wrap-chips" id="o-days">${dayChips([], 'o-day')}</div></div>
    <button class="btn ink block" data-act="outfit-save">Speichern</button>`);
}

async function outfitSave() {
  const name = $('#o-name').value.trim() || 'Outfit';
  const sel = {};
  for (const c of LAYER_ORDER) if (S.sel[c] && itemById(S.sel[c])) sel[c] = S.sel[c];
  const id = uid();
  const blob = await composeOutfit(sel);
  await saveImage('outfit:' + id, blob);
  setUrl('outfit:' + id, blob);
  S.outfits.push({ id, name, sel, days: S._draftDays.slice(), created: Date.now(), sig: outfitSig(sel) });
  await saveOutfits(S.outfits);
  requestPersistence();
  closeSheet();
  toast('Unter Outfits gespeichert');
}

function openOutfit(id) {
  const o = S.outfits.find((x) => x.id === id);
  if (!o) return;
  const missing = Object.values(o.sel).filter((iid) => !itemById(iid)).length;
  openSheet(`<div class="look" style="max-width:260px;margin:0 auto"><div class="pic"><img src="${urls.get('outfit:' + o.id) || ''}" alt=""></div></div>
    <div class="field"><span>Name</span><input type="text" id="o-rename" value="${esc(o.name)}" data-id="${o.id}" autocomplete="off"></div>
    <div class="field"><span>Tage</span><div class="wrap-chips">${dayChips(o.days || [], 'o-toggle-day')}</div></div>
    ${missing ? `<p class="note">${missing} Teil${missing > 1 ? 'e' : ''} davon ${missing > 1 ? 'sind' : 'ist'} nicht mehr im Schrank.</p>` : ''}
    <div class="row" style="margin-top:8px">
      <button class="btn danger" data-act="outfit-delete" data-id="${o.id}">Löschen</button>
      <button class="btn ink" data-act="outfit-wear" data-id="${o.id}">Anziehen</button>
    </div>`);
  S._openOutfit = o.id;
  $('#o-rename').addEventListener('change', (e) => {
    o.name = e.target.value.trim() || o.name;
    saveOutfits(S.outfits);
    if (S.tab === 'outfits') render();
  });
}

// ---------- Teil bearbeiten ----------
function openItem(id) {
  const it = itemById(id);
  if (!it) return;
  S._openItem = id;
  openSheet(`<div class="preview" style="height:28dvh"><img src="${urls.get(id) || ''}" alt=""></div>
    <div class="field"><span>Name</span><input type="text" id="i-name" value="${esc(it.name)}" autocomplete="off"></div>
    <div class="field"><span>Kategorie</span><div class="wrap-chips">${CATEGORIES.map((c) => `<button class="chip" data-act="i-cat" data-id="${c.id}" aria-pressed="${c.id === it.cat}">${c.one}</button>`).join('')}</div></div>
    ${it.cat === 'schmuck' ? `<div class="field"><span>Metall</span><div class="wrap-chips">${METALS.map((m) => `<button class="chip" data-act="i-metal" data-id="${m.id}" aria-pressed="${m.id === it.metal}"><span class="dot metal-${m.id}"></span>${m.label}</button>`).join('')}</div></div>` : ''}
    ${it.color ? `<div class="color-line"><span class="sw" style="background:${it.color.hex}"></span>${esc(it.color.name)}</div>` : ''}
    <div class="stack">
      <div class="row"><button class="btn" data-act="i-fit">Sitz anpassen</button><button class="btn ink" data-act="i-wear">Anprobieren</button></div>
      <button class="btn danger" data-act="i-delete">Aus dem Schrank löschen</button>
    </div>`);
  $('#i-name').addEventListener('change', (e) => {
    it.name = e.target.value.trim() || it.name;
    saveItems(S.items);
  });
}

// ---------- Einstellungen ----------
async function openSettings() {
  const info = await storageInfo();
  const mb = info.usage != null ? (info.usage / 1e6).toFixed(1).replace('.', ',') + ' MB' : null;
  const status = isStandalone()
    ? 'Die App läuft vom Home-Bildschirm. Deine Daten bleiben auf diesem iPhone gespeichert.'
    : 'Tipp: Über Teilen und „Zum Home-Bildschirm“ als App speichern. Im normalen Safari-Tab kann iOS Daten nach längerer Nichtnutzung löschen.';
  openSheet(`<h2>Einstellungen</h2>
    <p class="lead">${S.items.length} Teile, ${S.outfits.length} Outfits${mb ? `, ${mb} belegt` : ''}.</p>
    <div class="stack" style="margin-top:0">
      <button class="btn" data-act="body-setup">${S.body ? 'Ganzkörperfoto ändern' : 'Ganzkörperfoto hinzufügen'}</button>
      ${S.body ? '<button class="btn" data-act="guides">Hilfslinien anpassen</button>' : ''}
    </div>
    <button class="switch-row" role="switch" aria-checked="${warpOn()}" data-act="toggle-warp">
      <span><b>Kleidung an Körperform anpassen</b><br><span class="note">${S.body && S.body.cutout !== false ? 'Oberteile, Jacken, Kleider und Hosen folgen der Silhouette auf deinem Foto.' : 'Wirkt, sobald ein freigestelltes Ganzkörperfoto hinterlegt ist.'}</span></span>
      <i aria-hidden="true"></i>
    </button>
    <h3 class="section-title">Speicherung</h3>
    <p class="note" style="margin-top:0">${status}</p>
    <p class="note">Eine Sicherung legt alles in eine Datei, die du z. B. in iCloud Drive ablegen und auf einem neuen iPhone wieder einlesen kannst.</p>
    <div class="row"><button class="btn" data-act="export">Sicherung erstellen</button>
      <label class="btn">Sicherung einlesen<input class="sr" type="file" accept="application/json,.json" id="import-in"></label></div>`);
  $('#import-in').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!confirm('Sicherung einlesen? Teile und Outfits aus der Datei werden übernommen.')) return;
    try {
      await importBackup(f);
      await boot();
      closeSheet();
      toast('Sicherung eingelesen');
    } catch (err) {
      alert(err.message || 'Die Datei konnte nicht gelesen werden.');
    }
  });
}

async function doExport() {
  toast('Sicherung wird erstellt …');
  const blob = await exportBackup();
  const name = `kleiderschrank-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Kleiderschrank-Sicherung' }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ---------- Aktionen ----------
const actions = {
  tab: (el) => { S.tab = el.dataset.id; S.adjusting = false; render(); },
  cat: (el) => { S.cat = el.dataset.id; refreshPicker(); showZoneTag(S.cat); },
  metal: (el) => {
    S.metal = el.dataset.id;
    const cur = itemById(S.sel.schmuck);
    if (S.metal !== 'alle' && (!cur || cur.metal !== S.metal)) {
      const first = listFor('schmuck')[0];
      swapTo('schmuck', first ? first.id : null, 1);
    }
    persistSettings();
    refreshPicker();
    refreshStripSelection();
  },
  pick: (el) => {
    const id = el.dataset.id || null;
    if ((S.sel[S.cat] || null) === id) return;
    const prev = listFor(S.cat).findIndex((i) => i.id === S.sel[S.cat]);
    const next = listFor(S.cat).findIndex((i) => i.id === id);
    document.querySelectorAll('#strip .thumb').forEach((t) => t.setAttribute('aria-pressed', String(t === el)));
    swapTo(S.cat, id, next >= prev ? 1 : -1);
  },
  shuffle,
  'today-dismiss': () => { S.settings.todayDismissed = dateKey(); persistSettings(); render(); },
  'toggle-warp': (el) => {
    S.settings.warp = !warpOn();
    el.setAttribute('aria-checked', String(warpOn()));
    persistSettings();
    drawLayers();
  },
  adjust: () => { S.adjusting = true; render(); },
  'adjust-done': () => { S.adjusting = false; saveItems(S.items); render(); },
  'fit-reset': () => { const it = itemById(S.sel[S.cat]); if (it) { it.fit = null; saveItems(S.items); render(); } },
  'clear-outfit': () => {
    const prev = { ...S.sel };
    S.sel = {};
    persistSettings();
    drawLayers();
    refreshStripSelection();
    toastAction('Outfit geleert', 'Rückgängig', () => { S.sel = prev; persistSettings(); drawLayers(); refreshStripSelection(); });
  },
  'save-outfit': openSaveOutfit,
  'outfit-save': outfitSave,
  'o-day': (el) => {
    const d = +el.dataset.id;
    S._draftDays = S._draftDays.includes(d) ? S._draftDays.filter((x) => x !== d) : [...S._draftDays, d];
    el.setAttribute('aria-pressed', String(S._draftDays.includes(d)));
  },
  outfit: (el) => openOutfit(el.dataset.id),
  'o-toggle-day': (el) => {
    const o = S.outfits.find((x) => x.id === S._openOutfit);
    const d = +el.dataset.id;
    o.days = (o.days || []).includes(d) ? o.days.filter((x) => x !== d) : [...(o.days || []), d];
    el.setAttribute('aria-pressed', String(o.days.includes(d)));
    saveOutfits(S.outfits);
    render();
  },
  'outfit-wear': (el) => {
    const o = S.outfits.find((x) => x.id === el.dataset.id);
    S.sel = {};
    for (const [c, iid] of Object.entries(o.sel)) if (itemById(iid)) S.sel[c] = iid;
    persistSettings();
    closeSheet();
    S.tab = 'spiegel';
    render();
  },
  'outfit-delete': async (el) => {
    if (!confirm('Dieses Outfit löschen?')) return;
    const id = el.dataset.id;
    S.outfits = S.outfits.filter((x) => x.id !== id);
    await saveOutfits(S.outfits);
    await deleteImage('outfit:' + id);
    closeSheet();
    render();
  },
  'closet-filter': (el) => { S.closetFilter = el.dataset.id; render(); },
  'day-filter': (el) => { S.dayFilter = el.dataset.id; render(); },
  item: (el) => openItem(el.dataset.id),
  'i-cat': (el) => {
    const it = itemById(S._openItem);
    it.cat = el.dataset.id;
    if (it.cat === 'schmuck' && !it.metal) it.metal = 'gold';
    for (const c of Object.keys(S.sel)) if (S.sel[c] === it.id && c !== it.cat) S.sel[c] = null;
    saveItems(S.items);
    render();
    openItem(it.id);
  },
  'i-metal': (el) => { const it = itemById(S._openItem); it.metal = el.dataset.id; saveItems(S.items); render(); openItem(it.id); },
  'i-wear': () => { const it = itemById(S._openItem); S.cat = it.cat; S.metal = 'alle'; select(it.cat, it.id); closeSheet(); S.tab = 'spiegel'; render(); },
  'i-fit': () => { const it = itemById(S._openItem); S.cat = it.cat; S.metal = 'alle'; select(it.cat, it.id); closeSheet(); S.tab = 'spiegel'; S.adjusting = true; render(); },
  'i-delete': async () => {
    const it = itemById(S._openItem);
    if (!confirm(`„${it.name}“ aus dem Schrank löschen?`)) return;
    S.items = S.items.filter((x) => x.id !== it.id);
    for (const c of Object.keys(S.sel)) if (S.sel[c] === it.id) S.sel[c] = null;
    await saveItems(S.items);
    await deleteImage(it.id);
    forgetItem(it.id);
    persistSettings();
    closeSheet();
    render();
  },
  scan: (el) => openScan(el.dataset.cat || (S.tab === 'schrank' && S.closetFilter !== 'alle' ? S.closetFilter : null)),
  'scan-save': scanSave,
  'scan-again': () => nextInQueue(),
  'scan-skip': () => nextInQueue(),
  'scan-raw': scanRaw,
  'scan-rotate': scanRotate,
  'res-cat': (el) => {
    scanCtx.result.cat = el.dataset.id;
    scanCtx.result.catTouched = true;
    document.querySelectorAll('#res-cat .chip').forEach((c) => c.setAttribute('aria-pressed', String(c === el)));
    $('#res-metal').hidden = el.dataset.id !== 'schmuck';
    $('#res-name').placeholder = `${scanCtx.result.color.name} ${CAT[el.dataset.id].noun}`;
  },
  'res-metal': (el) => {
    scanCtx.result.metal = el.dataset.id;
    el.parentElement.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === el)));
  },
  'close-sheet': () => { closeSheet(); render(); },
  'body-setup': openBodySetup,
  guides: () => {
    if (!S.body) return;
    closeSheet();
    scanCtx = { queue: [] };
    openGuides({ w: S.body.w, h: S.body.h, guides: S.body.guides, cutout: S.body.cutout, src: urls.get('body') });
  },
  'guides-save': guidesSave,
  settings: openSettings,
  export: doExport,
  'hide-install': () => { S.settings.hideInstall = true; persistSettings(); render(); }
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el, e); }
});

// ---------- Start ----------
async function boot() {
  const st = await loadState();
  Object.assign(S, { items: st.items, outfits: st.outfits, body: st.body, settings: st.settings });
  S.sel = st.settings.sel || {};
  S.metal = st.settings.metal || 'alle';
  await Promise.all([
    ...S.items.map((i) => ensureUrl(i.id)),
    ...S.outfits.map((o) => ensureUrl('outfit:' + o.id)),
    S.body ? ensureUrl('body') : null
  ]);
  render();
}

boot();
