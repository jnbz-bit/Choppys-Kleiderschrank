// Tab „Schrank“: Raster aller Teile mit Suche, Kategorie-Kapseln, Sortierung, Kontextmenü
// und Teil-Detail-Sheet (Aktion openItem). Vertrag: docs/DESIGN.md › View-Vertrag
import './closet.css';
import {
  S, on, itemById, itemUrl, byNewest, select, updateItem, deleteItem, outfitsWith, persistSettings, CATEGORIES
} from '../app/state.js';
import { register, run, go } from '../app/actions.js';
import {
  pageScaffold, emptyState, sheet, h, esc, bindLongPress, contextMenu, actionSheet, toast, haptic, iconButton,
  springAnimate, prefersReducedMotion, transition, nextFrame
} from '../ui/ui.js';
import { I } from '../ui/icons.js';
import { CAT, METALS } from '../model.js';

// ---------------------------------------------------------------------------
// Helfer
// ---------------------------------------------------------------------------
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const norm = (t = '') => t.toLocaleLowerCase('de').normalize('NFD').replace(/[̀-ͯ]/g, '');
const SORTS = [
  { id: 'neu', label: 'Neueste zuerst' },
  { id: 'farbe', label: 'Nach Farbe' },
  { id: 'fav', label: 'Favoriten zuerst' }
];
const sortMode = () => (SORTS.some((s) => s.id === S.settings.closetSort) ? S.settings.closetSort : 'neu');

/** Farbton-Schlüssel: bunte Farben nach Farbton, unbunte (Schwarz → Weiß) ans Ende. */
function hueKey(item) {
  const hex = item.color?.hex || '#999999';
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (s < 0.18 || d < 0.08) return 1000 + l * 100; // unbunt
  let hh;
  if (max === r) hh = ((g - b) / d) % 6;
  else if (max === g) hh = (b - r) / d + 2;
  else hh = (r - g) / d + 4;
  hh = (hh * 60 + 360) % 360;
  return ((hh + 345) % 360) + l * 0.5; // Rot-Töne (inkl. Pink-Rot) an den Anfang
}
function sorter() {
  const m = sortMode();
  if (m === 'farbe') return (a, b) => hueKey(a) - hueKey(b) || byNewest(a, b);
  if (m === 'fav') return (a, b) => (!!b.fav - !!a.fav) || byNewest(a, b);
  return byNewest;
}
function matches(item, tokens) {
  if (!tokens.length) return true;
  const c = CAT[item.cat];
  const hay = norm([item.name, item.color?.name, c?.label, c?.one, item.metal, item.fav ? 'favorit' : ''].filter(Boolean).join(' '));
  return tokens.every((t) => hay.includes(t));
}

/** Teil anziehen und in die Anprobe wechseln (wie Referenz i-wear). */
function wear(it) {
  S.cat = it.cat;
  S.metal = 'alle';
  select(it.cat, it.id);
  persistSettings();
  go('spiegel');
}
async function toggleFav(it, { quiet = false } = {}) {
  const fav = !it.fav;
  haptic('light');
  await updateItem(it.id, { fav });
  if (!quiet) toast(fav ? 'Zu Favoriten hinzugefügt' : 'Aus Favoriten entfernt', { icon: fav ? I.heartFill : I.heart });
  return fav;
}
/** Löschen mit rotem Action Sheet. true, wenn gelöscht. */
async function confirmDelete(it) {
  const n = outfitsWith(it.id).length;
  const v = await actionSheet({
    title: `„${it.name || CAT[it.cat]?.one || 'Teil'}“ löschen?`,
    message: n ? `Es fehlt danach in ${plural(n, 'Outfit', 'Outfits')}. Das kann nicht rückgängig gemacht werden.` : 'Das Teil wird aus dem Schrank entfernt. Das kann nicht rückgängig gemacht werden.',
    actions: [{ label: 'Teil löschen', destructive: true, value: 'delete' }],
    cancel: 'Abbrechen'
  });
  if (v !== 'delete') return false;
  return true;
}
async function doDelete(it) {
  await deleteItem(it.id);
  haptic('success');
  toast('Gelöscht', { icon: I.trash });
}

// ---------------------------------------------------------------------------
// Teil-Detail (Aktion openItem)
// ---------------------------------------------------------------------------
let detail = null; // {s, id, refresh()}

function openItem(id) {
  const it = itemById(id);
  if (!it) return;
  detail?.s.close('programmatic');
  const created = new Date(it.created || Date.now()).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
  const root = h(`<div class="closet-detail-body">
    <div class="closet-hero studio">
      <img class="closet-hero-img" src="${itemUrl(id)}" alt="" decoding="async">
      <div class="studio-floor closet-hero-floor"></div>
    </div>
    <div class="closet-detail-head">
      <input class="inline-edit closet-name" value="${esc(it.name)}" placeholder="${esc(CAT[it.cat]?.one || 'Name')}" aria-label="Name" enterkeyhint="done" autocomplete="off" autocorrect="off" spellcheck="false" maxlength="60">
      <p class="closet-meta"></p>
    </div>
    <div class="closet-actions">
      <button type="button" class="closet-action is-primary" data-a="wear">${I.mirror}<span>Anprobieren</span></button>
      <button type="button" class="closet-action" data-a="fit">${I.adjust}<span>Sitz anpassen</span></button>
      <button type="button" class="closet-action" data-a="fav"><span class="closet-fav-ic"></span><span class="closet-fav-label"></span></button>
    </div>
    <div class="closet-field">
      <div class="list-header">Kategorie</div>
      <div class="chips is-wrap closet-cats" role="group" aria-label="Kategorie">
        ${CATEGORIES.map((c) => `<button type="button" class="chip" data-cat="${c.id}" aria-pressed="false">${esc(c.one)}</button>`).join('')}
      </div>
    </div>
    <div class="closet-field closet-metal-field" hidden>
      <div class="list-header">Metall</div>
      <div class="chips is-wrap closet-metals" role="group" aria-label="Metall">
        ${METALS.map((m) => `<button type="button" class="chip" data-metal="${m.id}" aria-pressed="false"><span class="metal-dot is-${m.id}"></span>${esc(m.label)}</button>`).join('')}
      </div>
    </div>
    <div class="list closet-info">
      <div class="list-group">
        <div class="cell"><span class="cell-body"><span class="cell-title">Farbe</span></span>
          <span class="cell-value closet-color"></span></div>
        <div class="cell"><span class="cell-body"><span class="cell-title">Verwendet in</span></span>
          <span class="cell-value closet-used"></span></div>
      </div>
      <p class="list-footer">Die Farbe wurde beim Scannen erkannt.</p>
    </div>
    <div class="list">
      <div class="list-group"><button type="button" class="cell is-destructive is-center" data-a="delete">Aus dem Schrank löschen</button></div>
    </div>
  </div>`);

  const $ = (s) => root.querySelector(s);
  const nameIn = $('.closet-name');

  const s = sheet({
    title: CAT[it.cat]?.one || 'Teil',
    detent: 'large',
    className: 'closet-detail',
    trailing: { label: 'Fertig', bold: true, onTap: (sh) => { commitName(); sh.close('done'); } },
    content: root,
    onClose: () => { commitName(); if (detail?.s === s) detail = null; }
  });

  function commitName() {
    const cur = itemById(id);
    if (!cur) return;
    const v = nameIn.value.trim();
    if (!v) { nameIn.value = cur.name; return; }
    if (v !== cur.name) updateItem(id, { name: v });
  }
  nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameIn.blur(); });
  nameIn.addEventListener('change', commitName);
  nameIn.addEventListener('blur', commitName);

  function refresh() {
    const cur = itemById(id);
    if (!cur) return;
    s.setTitle(CAT[cur.cat]?.one || 'Teil');
    if (document.activeElement !== nameIn) nameIn.value = cur.name;
    nameIn.placeholder = CAT[cur.cat]?.one || 'Name';
    $('.closet-meta').textContent = `${CAT[cur.cat]?.one || ''} · Hinzugefügt am ${created}`;
    root.querySelectorAll('.closet-cats .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === cur.cat)));
    const mf = $('.closet-metal-field');
    const showMetal = cur.cat === 'schmuck';
    if (mf.hidden === showMetal) {
      mf.hidden = !showMetal;
      if (showMetal) springAnimate(mf, [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { spring: 'smooth' });
    }
    root.querySelectorAll('.closet-metals .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.metal === cur.metal)));
    $('.closet-fav-ic').innerHTML = cur.fav ? I.heartFill : I.heart;
    $('.closet-fav-label').textContent = 'Favorit';
    $('[data-a="fav"]').classList.toggle('is-on', !!cur.fav);
    $('[data-a="fav"]').setAttribute('aria-pressed', String(!!cur.fav));
    $('.closet-color').innerHTML = cur.color
      ? `<span class="color-dot" style="--c:${esc(cur.color.hex)}"></span>${esc(cur.color.name)}`
      : 'Unbekannt';
    const n = outfitsWith(id).length;
    $('.closet-used').textContent = n ? plural(n, 'Outfit', 'Outfits') : 'Noch keinem Outfit';
    const img = $('.closet-hero-img');
    if (img.getAttribute('src') !== itemUrl(id)) img.src = itemUrl(id);
  }
  refresh();

  root.addEventListener('click', async (e) => {
    const cur = itemById(id);
    if (!cur) return;
    const cat = e.target.closest('[data-cat]');
    if (cat) {
      if (cat.dataset.cat === cur.cat) return;
      haptic('selection');
      await updateItem(id, { cat: cat.dataset.cat }); // räumt die Auswahl auf (state.js)
      return;
    }
    const metal = e.target.closest('[data-metal]');
    if (metal) {
      if (metal.dataset.metal === cur.metal) return;
      haptic('selection');
      await updateItem(id, { metal: metal.dataset.metal });
      return;
    }
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a) return;
    if (a === 'wear') { commitName(); wear(cur); }
    else if (a === 'fit') { commitName(); await s.close('done'); run('startAdjust', id); }
    else if (a === 'fav') {
      const fav = await toggleFav(cur, { quiet: true });
      const ic = $('.closet-fav-ic svg');
      if (fav && ic) springAnimate(ic, [{ transform: 'scale(.55)' }, { transform: 'scale(1)' }], { spring: 'bouncy' });
    } else if (a === 'delete') {
      if (!(await confirmDelete(cur))) return;
      await s.close('done');
      await doDelete(cur);
    }
  });

  // Sanftes Einblenden des Bildes
  const img = $('.closet-hero-img');
  springAnimate(img, [{ opacity: 0, transform: 'scale(.9) translateY(8px)' }, { opacity: 1, transform: 'none' }], { spring: 'bouncy', delay: 120, fill: 'backwards' });

  detail = { s, id, refresh };
  return s;
}
register('openItem', openItem);

// ---------------------------------------------------------------------------
// Tab-View
// ---------------------------------------------------------------------------
let ctx, page, sortBtn, bar, chipsEl, list, offs = [];
let query = '';
const tiles = new Map();    // id → button.tile
const sections = new Map(); // cat → {el, grid, count}
let shownOnce = false;
let renderQueued = false;

function tileFor(it) {
  let t = tiles.get(it.id);
  if (!t) {
    t = document.createElement('button');
    t.type = 'button';
    t.className = 'tile closet-tile';
    t.dataset.id = it.id;
    t.innerHTML = `<img alt="" loading="lazy" decoding="async" draggable="false"><span class="tile-badge"></span>`;
    tiles.set(it.id, t);
  }
  const img = t.firstElementChild;
  const src = itemUrl(it.id);
  if (img.getAttribute('src') !== src) img.src = src;
  t.setAttribute('aria-label', `${it.name || CAT[it.cat]?.one}${it.fav ? ', Favorit' : ''}`);
  const badge = `${it.cat === 'schmuck' && it.metal ? `<span class="metal-dot is-${it.metal}"></span>` : ''}${it.fav ? I.heartFill : ''}`;
  const b = t.lastElementChild;
  if (b.dataset.k !== badge) { b.innerHTML = badge; b.dataset.k = badge; }
  return t;
}
function sectionFor(c) {
  let sec = sections.get(c.id);
  if (!sec) {
    const el = h(`<section class="closet-section" data-cat="${c.id}">
      <h2 class="section-title closet-section-title"><span>${esc(c.label)}</span><span class="count"></span></h2>
      <div class="grid grid-3 closet-grid"></div></section>`);
    sec = { el, title: el.firstElementChild, grid: el.lastElementChild, count: el.querySelector('.count') };
    sections.set(c.id, sec);
  }
  return sec;
}

function buildChips() {
  chipsEl.innerHTML = [{ id: 'alle', label: 'Alle' }, ...CATEGORIES]
    .map((c) => `<button type="button" class="chip" data-filter="${c.id}" aria-pressed="false">${esc(c.label)}<span class="chip-count"></span></button>`)
    .join('');
}
function syncChips() {
  const counts = { alle: S.items.length };
  for (const it of S.items) counts[it.cat] = (counts[it.cat] || 0) + 1;
  chipsEl.querySelectorAll('.chip').forEach((b) => {
    const f = b.dataset.filter;
    b.setAttribute('aria-pressed', String(f === S.closetFilter));
    const n = counts[f] || 0;
    const cnt = b.querySelector('.chip-count');
    if (cnt.textContent !== String(n)) cnt.textContent = String(n);
    b.classList.toggle('closet-chip-empty', f !== 'alle' && !n);
  });
}

function render() {
  const total = S.items.length;
  page.setSubtitle(total ? plural(total, 'Teil', 'Teile') : '');
  const empty = !total;
  page.root.classList.toggle('closet-is-empty', empty);
  page.root.querySelector('.page-search').hidden = empty;
  bar.hidden = empty;
  if (sortBtn) sortBtn.hidden = empty;
  if (!CATEGORIES.some((c) => c.id === S.closetFilter)) S.closetFilter = 'alle';

  // nicht mehr vorhandene Kacheln vergessen
  for (const id of [...tiles.keys()]) if (!itemById(id)) tiles.delete(id);

  if (empty) {
    list.replaceChildren(emptyState({
      icon: I.hanger, title: 'Dein Schrank ist leer',
      text: 'Fotografiere ein Kleidungsstück – die App schneidet es aus und legt es hier ab.',
      action: { label: 'Erstes Teil scannen', icon: I.camera, onTap: () => run('openScan', {}) }, fill: true
    }));
    return;
  }
  syncChips();

  const tokens = norm(query).split(/\s+/).filter(Boolean);
  const sort = sorter();
  const filter = S.closetFilter;
  const cats = filter === 'alle' ? CATEGORIES : [CAT[filter]];
  const out = [];
  let shown = 0;
  for (const c of cats) {
    const items = S.items.filter((i) => i.cat === c.id && matches(i, tokens)).sort(sort);
    if (!items.length) continue;
    shown += items.length;
    const sec = sectionFor(c);
    sec.title.hidden = filter !== 'alle';
    sec.count.textContent = String(items.length);
    const want = items.map(tileFor);
    // nur umsortieren, wenn nötig (kein Flackern, Bilder bleiben geladen)
    const cur = [...sec.grid.children];
    if (cur.length !== want.length || want.some((t, i) => cur[i] !== t)) sec.grid.replaceChildren(...want);
    out.push(sec.el);
  }
  list.classList.toggle('is-filtered', filter !== 'alle');
  if (!shown) {
    if (tokens.length) {
      out.push(emptyState({ icon: I.search, title: 'Keine Treffer', text: `Für „${query.trim()}“ wurde nichts gefunden. Suche nach Name, Farbe oder Kategorie.` }));
    } else {
      const c = CAT[filter];
      out.push(emptyState({
        icon: I.tshirt, title: `Noch keine ${c.label}`,
        text: 'Scanne ein Teil, um es hier abzulegen.',
        action: { label: 'Teil scannen', icon: I.camera, onTap: () => run('openScan', { cat: c.id }) }
      }));
    }
  }
  const cur = [...list.children];
  if (cur.length !== out.length || out.some((n, i) => cur[i] !== n)) list.replaceChildren(...out);
}

/** Rendern mit View-Transition (sichtbare Kacheln gleiten an ihren neuen Platz). */
function renderAnimated() {
  if (!ctx?.isActive() || prefersReducedMotion() || !document.startViewTransition || document.hidden) return render();
  const named = new Set();
  const top = Math.max(page.navBar.getBoundingClientRect().bottom, bar.hidden ? 0 : bar.getBoundingClientRect().bottom) - 4;
  const tb = document.querySelector('.tabbar-tabs');
  const bottom = (tb ? tb.getBoundingClientRect().top : innerHeight) + 4;
  const nameVisible = () => {
    for (const [id, el] of tiles) {
      if (!el.isConnected || named.has(el)) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || r.top < top || r.bottom > bottom) continue;
      el.style.viewTransitionName = 'closet-t-' + id;
      named.add(el);
    }
    for (const [cat, sec] of sections) {
      if (!sec.el.isConnected || sec.title.hidden || named.has(sec.title)) continue;
      const r = sec.title.getBoundingClientRect();
      if (!r.height || r.top < top || r.bottom > bottom) continue;
      sec.title.style.viewTransitionName = 'closet-s-' + cat;
      named.add(sec.title);
    }
  };
  nameVisible();
  return transition(() => { render(); nameVisible(); }).finally(() => named.forEach((el) => (el.style.viewTransitionName = '')));
}
function scheduleRender(animated = true) {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    animated ? renderAnimated() : render();
  });
}

/** Gestaffeltes Einblenden der sichtbaren Kacheln (erstes Anzeigen). */
function staggerIn() {
  if (prefersReducedMotion()) return;
  const vh = innerHeight;
  let i = 0;
  const els = [...list.querySelectorAll('.closet-section-title:not([hidden]), .closet-tile, .empty')];
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.top > vh) break;
    springAnimate(el, [{ opacity: 0, transform: 'translateY(14px) scale(.96)' }, { opacity: 1, transform: 'none' }],
      { spring: 'smooth', delay: Math.min(i++ * 22, 420), fill: 'backwards' });
  }
}

function setFilter(f) {
  if (f === S.closetFilter) return;
  S.closetFilter = f;
  haptic('selection');
  const chip = chipsEl.querySelector(`[data-filter="${f}"]`);
  chip?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
  // ist die Leiste schon angeheftet, bleibt sie oben und der Inhalt beginnt von vorn
  const stuck = page.root.classList.contains('closet-is-stuck');
  syncChips();
  renderAnimated();
  if (stuck) {
    const target = page.content.offsetTop - (page.navBar.getBoundingClientRect().bottom - page.scroller.getBoundingClientRect().top);
    if (page.scroller.scrollTop > target) page.scroller.scrollTop = target;
  }
}

function openSortMenu(btn) {
  const m = sortMode();
  contextMenu(btn, {
    preview: false,
    actions: SORTS.map((s) => ({
      label: s.label,
      icon: s.id === m ? I.check : '',
      onTap: () => {
        if (s.id === sortMode()) return;
        S.settings.closetSort = s.id;
        persistSettings();
        renderAnimated();
      }
    }))
  });
}

function tileMenu(tile) {
  const it = itemById(tile.dataset.id);
  if (!it) return;
  contextMenu(tile, {
    actions: [
      { label: 'Anprobieren', icon: I.mirror, onTap: () => wear(it) },
      { label: it.fav ? 'Kein Favorit mehr' : 'Favorit', icon: it.fav ? I.heartFill : I.heart, onTap: () => toggleFav(it) },
      { label: 'Löschen', icon: I.trash, destructive: true, onTap: async () => { if (await confirmDelete(it)) await doDelete(it); } }
    ]
  });
}

let stickyTop = 0;
function updateStuck() {
  if (bar.hidden) { page.root.classList.remove('closet-is-stuck'); return; }
  const navB = page.navBar.getBoundingClientRect().bottom;
  const sr = page.scroller.getBoundingClientRect();
  const natural = sr.top + page.content.offsetTop - page.scroller.scrollTop; // Lage ohne Anheften
  const stuck = natural < navB - 0.5;
  if (stuck) {
    // Eichen: die angeheftete Leiste soll genau unter der Navigationsleiste liegen
    const delta = bar.getBoundingClientRect().top - navB;
    if (Math.abs(delta) > 0.5 && natural < navB - Math.abs(delta) - 1) {
      stickyTop -= delta;
      bar.style.setProperty('--closet-sticky', stickyTop + 'px');
    }
  }
  page.root.classList.toggle('closet-is-stuck', stuck);
}

export default {
  id: 'schrank',
  title: 'Schrank',
  mount(container, c) {
    ctx = c;
    sortBtn = iconButton({ icon: I.sort, label: 'Sortieren', onTap: (e, b) => openSortMenu(b) });
    page = pageScaffold({
      title: 'Schrank',
      subtitle: '',
      trailing: [sortBtn, { icon: I.gear, label: 'Einstellungen', onTap: () => run('openSettings') }],
      search: {
        placeholder: 'Name, Farbe oder Kategorie',
        onInput: (t) => { query = t; render(); },
        onCancel: () => { query = ''; render(); }
      }
    });
    page.root.classList.add('closet-page');
    bar = h(`<div class="closet-bar"><div class="chips closet-chips" role="group" aria-label="Kategorie"></div></div>`);
    chipsEl = bar.firstElementChild;
    list = h(`<div class="closet-list"></div>`);
    page.content.append(bar, list);
    container.appendChild(page.root);
    buildChips();

    chipsEl.addEventListener('click', (e) => { const b = e.target.closest('[data-filter]'); if (b) setFilter(b.dataset.filter); });
    list.addEventListener('click', (e) => { const t = e.target.closest('.closet-tile'); if (t) run('openItem', t.dataset.id); });
    offs.push(bindLongPress(list, tileMenu, { selector: '.closet-tile' }));

    let raf = 0;
    page.scroller.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; updateStuck(); }); }, { passive: true });

    render();

    offs.push(on('items', (d = {}) => {
      if (d.reloaded) { tiles.clear(); sections.forEach((s) => s.grid.replaceChildren()); scheduleRender(false); }
      else scheduleRender(!(d.updated && d.patch && !('cat' in d.patch) && !('fav' in d.patch && sortMode() === 'fav')));
      if (detail && (d.updated?.id === detail.id || d.reloaded)) detail.refresh();
      if (detail && d.removed?.id === detail.id) detail.s.close('programmatic');
      // neues Teil kurz hervorheben, wenn sichtbar
      if (d.added && ctx.isActive()) {
        nextFrame().then(() => nextFrame()).then(() => {
          const t = tiles.get(d.added.id);
          if (t?.isConnected) springAnimate(t, [{ transform: 'scale(.6)', opacity: 0 }, { transform: 'none', opacity: 1 }], { spring: 'bouncy' });
        });
      }
    }));
    offs.push(on('outfits', () => detail?.refresh()));
  },
  onShow() {
    if (!shownOnce) {
      shownOnce = true;
      requestAnimationFrame(staggerIn);
    }
    updateStuck();
  },
  onHide() {
    page.search?.blur();
  },
  unmount() { offs.forEach((f) => f()); offs = []; }
};
