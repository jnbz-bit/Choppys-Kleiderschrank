// Tab „Outfits“: Wochenleiste, Raster der gesicherten Outfits, Outfit-Detail und „Outfit sichern“.
import './outfits.css';
import {
  S, on, outfitById, outfitUrl, itemById, itemUrl, byNewest, refreshStaleThumbs, addOutfit, updateOutfit,
  deleteOutfit, wearOutfit, hasOutfit, missingIn, composeOutfit, cleanSel, todayIndex, LAYER_ORDER
} from '../app/state.js';
import { register, run, go } from '../app/actions.js';
import {
  pageScaffold, emptyState, sheet, actionSheet, alert, toast, contextMenu, bindLongPress, haptic, segmented,
  springAnimate, transition, h, esc, prefersReducedMotion
} from '../ui/ui.js';
import { I } from '../ui/icons.js';
import { WEEKDAYS, CAT } from '../model.js';

const DAY_NAMES = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const vtName = (id) => 'outfit-' + String(id).replace(/[^a-zA-Z0-9_-]/g, '');

/** Datum (Date) eines Wochentags 0..6 der aktuellen Woche. */
function weekDate(i) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - todayIndex() + i);
  return d;
}
const outfitsOn = (day) => S.outfits.filter((o) => (o.days || []).includes(day)).sort(byNewest);
const pieceCount = (o) => Object.values(o.sel || {}).filter((id) => itemById(id)).length;
const daysLabel = (days) => [...(days || [])].sort().map((d) => WEEKDAYS[d]).join(', ');

function daysHTML(days, cls = '') {
  const t = todayIndex();
  return `<div class="days ${cls}" role="group" aria-label="Tage">${WEEKDAYS.map((d, i) =>
    `<button type="button" class="day${i === t ? ' is-today' : ''}" data-day="${i}" aria-pressed="${days.includes(i)}" aria-label="${DAY_NAMES[i]}">${d}</button>`).join('')}</div>`;
}

// =====================================================================
// Teilen / Anziehen / Löschen (gemeinsam für Detail, Kontextmenü)
// =====================================================================
async function shareOutfit(id) {
  const o = outfitById(id);
  const url = outfitUrl(id);
  if (!o || !url) return;
  try {
    const blob = await (await fetch(url)).blob();
    const fname = `${(o.name || 'Outfit').replace(/[\\/:*?"<>|]+/g, '').trim() || 'Outfit'}.jpg`;
    const file = new File([blob], fname, { type: blob.type || 'image/jpeg' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: o.name }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Bild gesichert', { icon: I.download });
  } catch (e) {
    console.warn(e);
    toast('Teilen nicht möglich', { icon: I.warning });
  }
}

function wear(id) {
  const o = outfitById(id);
  if (!o) return;
  wearOutfit(id);
  haptic('medium');
  go('spiegel');
}

async function askDelete(id) {
  const o = outfitById(id);
  if (!o) return false;
  const v = await actionSheet({
    title: `„${o.name}“ löschen?`,
    message: 'Die Teile bleiben im Schrank.',
    actions: [{ label: 'Outfit löschen', destructive: true, value: 'delete' }]
  });
  if (v !== 'delete') return false;
  await deleteOutfit(id);
  toast('Outfit gelöscht', { icon: I.trash });
  return true;
}

// =====================================================================
// Outfit-Detail
// =====================================================================
let detail = null; // {id, sheet}
function openOutfit(id) {
  const o = outfitById(id);
  if (!o) return;
  const missing = missingIn(o);
  const pieces = LAYER_ORDER.map((c) => itemById(o.sel?.[c])).filter(Boolean);
  const created = new Date(o.created || Date.now()).toLocaleDateString('de-DE', { day: 'numeric', month: 'long' });
  const content = h(`<div class="outfits-detail">
    <div class="outfits-hero"><img src="${outfitUrl(id)}" alt=""></div>
    <div class="outfits-detail-head">
      <input class="inline-edit outfits-name" value="${esc(o.name)}" aria-label="Name" enterkeyhint="done" autocomplete="off" spellcheck="false">
      <p class="outfits-meta">${plural(pieces.length, 'Teil', 'Teile')} · gesichert am ${esc(created)}</p>
    </div>
    <div class="btn-row outfits-actions">
      <button type="button" class="btn btn-filled btn-large" data-act="wear">${I.mirror}<span>Anziehen</span></button>
      <button type="button" class="btn btn-gray btn-large" data-act="share">${I.share}<span>Teilen</span></button>
    </div>
    ${missing ? `<div class="banner is-solid outfits-missing"><span class="banner-icon">${I.warning}</span><span class="banner-body"><span class="banner-title">${missing === 1 ? 'Ein Teil fehlt' : `${missing} Teile fehlen`}</span><span class="banner-text">${missing === 1 ? 'Es ist' : 'Sie sind'} nicht mehr im Schrank und ${missing === 1 ? 'wird' : 'werden'} beim Anziehen weggelassen.</span></span></div>` : ''}
    <div class="list">
      <div class="list-header">Tragen am</div>
      <div class="list-group outfits-days-group">${daysHTML(o.days || [])}</div>
      <p class="list-footer outfits-days-foot"></p>
    </div>
    ${pieces.length ? `<div class="list">
      <div class="list-header">Enthaltene Teile</div>
      <div class="outfits-pieces">${pieces.map((it) => `<button type="button" class="outfits-piece" data-item="${it.id}" aria-label="${esc(it.name || CAT[it.cat]?.one || '')}">
        <span class="tile is-studio"><img src="${itemUrl(it.id)}" alt=""></span>
        <span class="outfits-piece-label">${esc(it.name || CAT[it.cat]?.one || '')}</span></button>`).join('')}</div>
    </div>` : ''}
    <div class="list"><div class="list-group"><button type="button" class="cell is-destructive is-center" data-act="delete">Outfit löschen</button></div></div>
  </div>`);

  const foot = content.querySelector('.outfits-days-foot');
  const syncFoot = () => {
    const d = outfitById(id)?.days || [];
    foot.textContent = d.length ? `Erscheint in der Wochenleiste und in der Anprobe als „Für heute geplant“.` : 'Wähl Tage, an denen du das Outfit tragen willst.';
  };
  syncFoot();

  const s = sheet({
    detent: 'large',
    label: o.name,
    className: 'outfits-detail-sheet',
    trailing: { label: 'Fertig', bold: true, onTap: (sh) => sh.close('done') },
    content,
    onClose: () => { commitName(); if (detail?.sheet === s) detail = null; }
  });
  detail = { id, sheet: s };

  const nameIn = content.querySelector('.outfits-name');
  function commitName() {
    const cur = outfitById(id);
    if (!cur) return;
    const v = nameIn.value.trim();
    if (!v) { nameIn.value = cur.name; return; }
    if (v !== cur.name) updateOutfit(id, { name: v });
  }
  nameIn.addEventListener('change', commitName);
  nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameIn.blur(); });
  nameIn.addEventListener('focus', () => nameIn.select());

  content.addEventListener('click', async (e) => {
    const day = e.target.closest('.day');
    if (day) {
      const d = +day.dataset.day;
      const cur = outfitById(id);
      if (!cur) return;
      const days = (cur.days || []).includes(d) ? cur.days.filter((x) => x !== d) : [...(cur.days || []), d];
      day.setAttribute('aria-pressed', String(days.includes(d)));
      haptic('selection');
      await updateOutfit(id, { days });
      syncFoot();
      return;
    }
    const piece = e.target.closest('.outfits-piece');
    if (piece) return run('openItem', piece.dataset.item);
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'wear') { commitName(); wear(id); }
    else if (act === 'share') shareOutfit(id);
    else if (act === 'delete') { if (await askDelete(id)) s.close('deleted'); }
  });
  return s;
}

// =====================================================================
// Outfit sichern (aus der aktuellen Auswahl)
// =====================================================================
let saving = false;
let saveSheet = null;
async function openSaveOutfit() {
  if (saveSheet) return saveSheet;
  if (!hasOutfit()) {
    const v = await alert({
      title: 'Noch nichts angezogen',
      message: 'Wähl in der Anprobe ein paar Teile aus – dann kannst du das Outfit hier sichern.',
      buttons: S.tab === 'spiegel'
        ? [{ label: 'OK', value: false, bold: true }]
        : [{ label: 'Abbrechen', value: false }, { label: 'Zur Anprobe', value: true, bold: true }]
    });
    if (v === true) go('spiegel');
    return null;
  }
  const sel = cleanSel(S.sel);
  const n = Object.keys(sel).length;
  const date = new Date().toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  const days = [];
  const content = h(`<div class="outfits-save">
    <div class="outfits-save-top">
      <div class="outfits-save-thumb is-loading"><img alt=""></div>
      <div class="outfits-save-fields">
        <label class="outfits-save-label" for="outfits-save-name">Name</label>
        <input id="outfits-save-name" class="textfield" value="Outfit ${esc(date)}" autocomplete="off" spellcheck="false" enterkeyhint="done">
        <p class="outfits-save-count">${plural(n, 'Teil', 'Teile')}</p>
      </div>
    </div>
    <div class="list">
      <div class="list-header">Tragen am <span class="outfits-optional">optional</span></div>
      <div class="list-group outfits-days-group">${daysHTML([])}</div>
    </div>
  </div>`);
  const nameIn = content.querySelector('input');
  let previewUrl = null;
  composeOutfit(sel).then((blob) => {
    previewUrl = URL.createObjectURL(blob); // nur Vorschau (nicht gespeichert)
    const img = content.querySelector('.outfits-save-thumb img');
    img.onload = () => content.querySelector('.outfits-save-thumb').classList.remove('is-loading');
    img.src = previewUrl;
  }).catch((e) => console.warn(e));

  const doSave = async (sh) => {
    if (saving) return;
    saving = true;
    sh.setTrailingEnabled(false);
    sh.setLeadingEnabled(false);
    try {
      const o = await addOutfit({ name: nameIn.value.trim() || `Outfit ${date}`, days, sel });
      haptic('success');
      await sh.close('done');
      toast('Unter Outfits gesichert', {
        icon: I.checkCircleFill,
        action: { label: 'Ansehen', onTap: () => { go('outfits'); highlight(o.id); } },
        duration: 4000
      });
    } catch (e) {
      console.error(e);
      sh.setTrailingEnabled(true);
      sh.setLeadingEnabled(true);
      alert({ title: 'Sichern fehlgeschlagen', message: 'Das Outfit konnte nicht gesichert werden. Versuch es bitte noch einmal.', buttons: [{ label: 'OK', value: true, bold: true }] });
    } finally {
      saving = false;
    }
  };
  const s = sheet({
    title: 'Outfit sichern',
    detent: 'medium',
    className: 'outfits-save-sheet',
    leading: { label: 'Abbrechen' },
    trailing: { label: 'Sichern', bold: true, onTap: doSave },
    content,
    onClose: () => { saveSheet = null; setTimeout(() => previewUrl && URL.revokeObjectURL(previewUrl), 1000); }
  });
  saveSheet = s;
  content.addEventListener('click', (e) => {
    const day = e.target.closest('.day');
    if (!day) return;
    const d = +day.dataset.day;
    const i = days.indexOf(d);
    if (i >= 0) days.splice(i, 1); else days.push(d);
    day.setAttribute('aria-pressed', String(days.includes(d)));
    haptic('selection');
  });
  nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); nameIn.blur(); } });
  setTimeout(() => { try { nameIn.focus({ preventScroll: true }); nameIn.select(); } catch { /* egal */ } }, 420);
  return s;
}

// =====================================================================
// Tag planen (Auswahl-Sheet)
// =====================================================================
function openAssign(day) {
  const list = [...S.outfits].sort(byNewest);
  const content = h(`<div class="outfits-assign">
    <p class="outfits-assign-lead">Wähl, was du am ${DAY_NAMES[day]} tragen willst.</p>
    <div class="list"><div class="list-group">${list.map((o) => `<button type="button" class="cell outfits-assign-row" data-id="${o.id}" aria-pressed="${(o.days || []).includes(day)}">
      <span class="outfits-assign-thumb"><img src="${outfitUrl(o.id)}" alt=""></span>
      <span class="cell-body"><span class="cell-title">${esc(o.name)}</span><span class="cell-subtitle">${(o.days || []).length ? esc(daysLabel(o.days)) : 'Kein Tag geplant'}</span></span>
      <span class="outfits-check">${I.checkCircleFill}</span></button>`).join('')}</div></div>
  </div>`);
  const s = sheet({
    title: `${DAY_NAMES[day]} planen`,
    detent: 'medium',
    className: 'outfits-assign-sheet',
    trailing: { label: 'Fertig', bold: true, onTap: (sh) => sh.close('done') },
    content
  });
  content.addEventListener('click', async (e) => {
    const row = e.target.closest('.outfits-assign-row');
    if (!row) return;
    const o = outfitById(row.dataset.id);
    if (!o) return;
    const has = (o.days || []).includes(day);
    const days = has ? o.days.filter((x) => x !== day) : [...(o.days || []), day];
    row.setAttribute('aria-pressed', String(!has));
    haptic('selection');
    await updateOutfit(o.id, { days });
    row.querySelector('.cell-subtitle').textContent = days.length ? daysLabel(days) : 'Kein Tag geplant';
  });
  return s;
}

register('openOutfit', openOutfit);
register('openSaveOutfit', openSaveOutfit);

// =====================================================================
// Tab
// =====================================================================
let page, weekEl, headEl, gridEl, seg, offs = [], weekKey = '';

function renderWeek() {
  const t = todayIndex();
  weekKey = new Date().toDateString();
  weekEl.innerHTML = WEEKDAYS.map((d, i) => {
    const list = outfitsOn(i);
    const date = weekDate(i).getDate();
    const sel = String(S.dayFilter) === String(i);
    let pv;
    if (!list.length) pv = `<span class="outfits-wd-empty">${I.plus}</span>`;
    else {
      pv = `<span class="outfits-wd-stack${list.length > 1 ? ' is-multi' : ''}">${list.length > 1 ? `<img class="is-back" src="${outfitUrl(list[1].id)}" alt="">` : ''}<img src="${outfitUrl(list[0].id)}" alt=""></span>${list.length > 1 ? `<span class="outfits-wd-count">${list.length}</span>` : ''}`;
    }
    return `<button type="button" class="outfits-wd${i === t ? ' is-today' : ''}" data-day="${i}" aria-pressed="${sel}" aria-label="${DAY_NAMES[i]}, ${date}.${list.length ? ` ${plural(list.length, 'Outfit', 'Outfits')}` : ''}">
      <span class="outfits-wd-name">${d}</span><span class="outfits-wd-date">${date}</span><span class="outfits-wd-pv">${pv}</span></button>`;
  }).join('');
}

function filtered() {
  const all = [...S.outfits].sort(byNewest);
  if (S.dayFilter === 'woche') return all.filter((o) => (o.days || []).length);
  if (S.dayFilter !== 'alle' && S.dayFilter != null && S.dayFilter !== '') return all.filter((o) => (o.days || []).includes(+S.dayFilter));
  return all;
}
const isDayFilter = () => /^\d$/.test(String(S.dayFilter));

function renderHead() {
  if (isDayFilter()) {
    const d = +S.dayFilter;
    const n = outfitsOn(d).length;
    const date = weekDate(d).toLocaleDateString('de-DE', { day: 'numeric', month: 'long' });
    headEl.innerHTML = `<div class="outfits-dayhead">
      <div class="outfits-dayhead-text"><span class="outfits-dayhead-title">${DAY_NAMES[d]}${d === todayIndex() ? ' · Heute' : ''}</span><span class="outfits-dayhead-sub">${esc(date)} · ${n ? plural(n, 'Outfit', 'Outfits') : 'nichts geplant'}</span></div>
      ${n ? `<button type="button" class="btn btn-tinted btn-small" data-act="assign">${I.calendar}<span>Planen</span></button>` : ''}
      <button type="button" class="icon-btn is-small is-plain" data-act="clear-day" aria-label="Filter aufheben">${I.close}</button></div>`;
  } else {
    headEl.replaceChildren(seg.el);
    seg.set(S.dayFilter === 'woche' ? 'woche' : 'alle', { silent: true });
  }
}

function cardHTML(o) {
  const t = todayIndex();
  const days = [...(o.days || [])].sort();
  return `<button type="button" class="card outfits-card" data-id="${o.id}" style="view-transition-name:${vtName(o.id)}" aria-label="${esc(o.name)}">
    <div class="card-media outfits-media"><img src="${outfitUrl(o.id)}" alt="" draggable="false"></div>
    <div class="card-body"><div class="card-title">${esc(o.name)}</div>
      <div class="outfits-tags">${days.length ? days.map((d) => `<span class="outfits-tag${d === t ? ' is-today' : ''}">${WEEKDAYS[d]}</span>`).join('') : '<span class="outfits-none">Kein Tag geplant</span>'}</div>
    </div></button>`;
}

function renderGrid({ animate = false } = {}) {
  page.setSubtitle(S.outfits.length ? `${S.outfits.length} gesichert` : '');
  page.root.classList.toggle('outfits-is-empty', !S.outfits.length);
  if (!S.outfits.length) {
    gridEl.replaceChildren(emptyState({
      icon: I.looks, title: 'Noch keine Outfits',
      text: 'Stell in der Anprobe ein Outfit zusammen und tippe auf „Sichern“. Hier planst du es dann für die Woche.',
      action: { label: 'Zur Anprobe', icon: I.mirror, onTap: () => go('spiegel') }
    }));
    return;
  }
  const list = filtered();
  if (!list.length) {
    if (isDayFilter()) {
      const d = +S.dayFilter;
      gridEl.innerHTML = `<div class="outfits-dayempty">
        <div class="outfits-dayempty-icon">${I.calendar}</div>
        <div class="outfits-dayempty-title">Für ${DAY_NAMES[d]} ist nichts geplant</div>
        <p class="outfits-dayempty-text">Ordne ein gesichertes Outfit zu – es erscheint dann hier und in der Wochenleiste.</p>
        <button type="button" class="btn btn-filled" data-act="assign">${I.plus}<span>Outfit zuordnen</span></button></div>`;
    } else {
      gridEl.innerHTML = `<div class="outfits-dayempty">
        <div class="outfits-dayempty-icon">${I.calendar}</div>
        <div class="outfits-dayempty-title">Diese Woche ist nichts geplant</div>
        <p class="outfits-dayempty-text">Tippe oben auf einen Tag, um ihm ein Outfit zuzuordnen.</p></div>`;
    }
    if (animate) appear([...gridEl.children]);
    return;
  }
  gridEl.innerHTML = `<div class="grid grid-2 outfits-grid">${list.map(cardHTML).join('')}</div>`;
  if (animate) appear([...gridEl.querySelectorAll('.outfits-card')]);
}

function appear(els) {
  if (prefersReducedMotion()) return;
  els.forEach((el, i) => springAnimate(el, [{ opacity: 0, transform: 'translateY(18px) scale(.97)' }, { opacity: 1, transform: 'none' }],
    { spring: 'smooth', delay: Math.min(i, 8) * 45, fill: 'backwards' }));
}

/** Ganze Ansicht mit View-Transition aktualisieren (Karten gleiten an ihre neue Stelle). */
let vtBusy = false, pending = false;
function update({ animate = true } = {}) {
  const doIt = () => { renderWeek(); renderHead(); renderGrid(); };
  // Nur eine View-Transition gleichzeitig; schnelle Folge-Änderungen (z. B. nach Import) direkt zeichnen.
  if (!animate || vtBusy || S.tab !== 'outfits' || document.hidden) {
    if (vtBusy) pending = true; else doIt();
    return Promise.resolve();
  }
  vtBusy = true;
  return transition(doIt).finally(() => {
    vtBusy = false;
    if (pending) { pending = false; doIt(); }
  });
}

function setDayFilter(v) {
  S.dayFilter = v;
  haptic('selection');
  update();
}

function highlight(id) {
  setTimeout(() => {
    const card = gridEl.querySelector(`.outfits-card[data-id="${id}"]`);
    if (!card) return;
    card.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    springAnimate(card, [{ transform: 'scale(1)' }, { transform: 'scale(1.05)' }, { transform: 'scale(1)' }], { spring: 'bouncy', delay: 250 });
  }, 120);
}

function swapThumb(id, url) {
  renderWeek(); // klein, kennt die Zuordnung Tag → Outfit
  const img = gridEl.querySelector(`.outfits-card[data-id="${id}"] img`);
  if (!img) return;
  img.src = url;
  if (prefersReducedMotion()) return;
  (img.decode ? img.decode() : Promise.resolve()).catch(() => {}).then(() =>
    img.animate([{ opacity: 0.35, filter: 'blur(6px)' }, { opacity: 1, filter: 'blur(0)' }], { duration: 420, easing: 'ease-out' }));
}

export default {
  id: 'outfits',
  title: 'Outfits',
  mount(container) {
    if (!['alle', 'woche'].includes(S.dayFilter) && !/^\d$/.test(String(S.dayFilter))) S.dayFilter = 'alle';
    page = pageScaffold({ title: 'Outfits', trailing: [{ icon: I.gear, label: 'Einstellungen', onTap: () => run('openSettings') }] });
    page.root.classList.add('outfits-page');
    const wrap = h(`<div class="outfits-wrap">
      <div class="outfits-week" role="group" aria-label="Diese Woche"></div>
      <div class="outfits-head"></div>
      <div class="outfits-list"></div></div>`);
    weekEl = wrap.querySelector('.outfits-week');
    headEl = wrap.querySelector('.outfits-head');
    gridEl = wrap.querySelector('.outfits-list');
    seg = segmented({
      items: [{ value: 'alle', label: 'Alle' }, { value: 'woche', label: 'Diese Woche' }],
      value: S.dayFilter === 'woche' ? 'woche' : 'alle',
      label: 'Filter',
      onChange: (v) => { S.dayFilter = v; update(); }
    });
    seg.el.classList.add('outfits-seg');
    page.content.appendChild(wrap);
    container.appendChild(page.root);

    weekEl.addEventListener('click', (e) => {
      const b = e.target.closest('.outfits-wd');
      if (!b) return;
      const d = b.dataset.day;
      if (!S.outfits.length) { springAnimate(b, [{ transform: 'scale(.9)' }, { transform: 'none' }], { spring: 'bouncy' }); return; }
      setDayFilter(String(S.dayFilter) === d ? 'alle' : d);
    });
    headEl.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'clear-day') setDayFilter('alle');
      else if (act === 'assign') openAssign(+S.dayFilter);
    });
    gridEl.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="assign"]')) return openAssign(+S.dayFilter);
      const c = e.target.closest('.outfits-card');
      if (c) openOutfit(c.dataset.id);
    });
    bindLongPress(gridEl, (card) => {
      const id = card.dataset.id;
      contextMenu(card, { actions: [
        { label: 'Anziehen', icon: I.mirror, onTap: () => wear(id) },
        { label: 'Teilen', icon: I.share, onTap: () => shareOutfit(id) },
        { label: 'Löschen', icon: I.trash, destructive: true, onTap: () => askDelete(id) }
      ] });
    }, { selector: '.outfits-card' });

    renderWeek();
    renderHead();
    renderGrid({ animate: true });

    const refresh = () => { if (S.tab === 'outfits') refreshStaleThumbs(); };
    offs.push(
      on('outfits', (ev) => {
        if (ev?.updated && ev.patch && Object.keys(ev.patch).every((k) => k === 'name')) {
          const card = gridEl.querySelector(`.outfits-card[data-id="${ev.updated.id}"] .card-title`);
          if (card) card.textContent = ev.updated.name;
          card?.closest('.outfits-card')?.setAttribute('aria-label', ev.updated.name);
          return;
        }
        update({ animate: !ev?.reloaded });
      }),
      on('thumb', ({ id, url }) => swapThumb(id, url)),
      on('items', (ev) => { if (ev?.reloaded) update({ animate: false }); refresh(); }),
      on('body', refresh),
      on('settings', ({ key }) => { if (key === 'warp' || key === 'reloaded') refresh(); })
    );
  },
  onShow() {
    if (weekKey !== new Date().toDateString()) { renderWeek(); renderHead(); }
    refreshStaleThumbs();
  },
  unmount() { offs.forEach((f) => f()); offs = []; }
};

