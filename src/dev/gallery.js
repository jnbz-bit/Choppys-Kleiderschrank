// Schaukasten aller Bausteine: ?gallery=1  (Entwicklung). Zeigt Komponenten, Overlays und die Demo-Teile.
import { S, setSetting, TINTS, APPEARANCES } from '../app/state.js';
import * as ui from '../ui/ui.js';
import { I } from '../ui/icons.js';
import { WEEKDAYS, todayIndex } from '../model.js';

export default function gallery() {
  const app = document.getElementById('app');
  document.documentElement.classList.remove('is-booting');
  const page = ui.pageScaffold({
    title: 'Bausteine',
    subtitle: 'Kleiderschrank · Designsystem',
    tabbar: false,
    trailing: [{ icon: I.sparkles, label: 'Toast', onTap: () => ui.toast('Unter Outfits gesichert', { icon: I.checkCircleFill }) }]
  });
  app.appendChild(page.root);
  const c = page.content;
  const sec = (title, html) => {
    const s = ui.h(`<section style="margin-bottom:8px"><h2 class="section-title">${title}</h2><div class="g-body"></div></section>`);
    const body = s.querySelector('.g-body');
    if (typeof html === 'string') body.innerHTML = html; else if (html) body.appendChild(html);
    c.appendChild(s);
    return body;
  };
  const pad = (html) => `<div style="padding:0 16px">${html}</div>`;

  // Darstellung
  const look = sec('Darstellung', pad(`<div class="swatches" style="padding:0 0 14px">${TINTS.map((t) => `<button class="swatch" style="--c:${t.light}" data-tint="${t.id}" aria-label="${t.label}" aria-pressed="${(S.settings.tint || 'rose') === t.id}"></button>`).join('')}</div>`));
  const ap = ui.segmented({ items: APPEARANCES.map((a) => ({ value: a.id, label: a.label })), value: S.settings.appearance || 'auto', onChange: (v) => setSetting('appearance', v) });
  look.firstElementChild.appendChild(ap.el);
  look.addEventListener('click', (e) => {
    const b = e.target.closest('.swatch');
    if (!b) return;
    setSetting('tint', b.dataset.tint);
    look.querySelectorAll('.swatch').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });

  sec('Knöpfe', pad(`<div class="stack">
    <button class="btn btn-filled btn-large btn-block">${I.camera}Foto aufnehmen</button>
    <div class="btn-row"><button class="btn btn-tinted">Getönt</button><button class="btn btn-gray">Grau</button><button class="btn btn-plain">Schlicht</button></div>
    <div class="btn-row"><button class="btn btn-destructive">Löschen</button><button class="btn btn-filled" disabled>Deaktiviert</button></div>
    <div class="hstack"><button class="btn btn-filled btn-small">${I.plus}Klein</button><button class="btn btn-tinted btn-small">Getönt</button><button class="btn btn-gray btn-small">Grau</button><button class="btn btn-glass btn-small">Glas</button></div>
    <div class="hstack studio" style="padding:14px;border-radius:22px">
      <button class="icon-btn" aria-label="Zufall">${I.dice}</button><button class="icon-btn" aria-label="Leeren">${I.reset}</button>
      <button class="icon-btn" aria-label="Anpassen">${I.move}</button><button class="icon-btn is-tint" aria-label="Favorit">${I.heartFill}</button>
      <button class="icon-btn is-small" aria-label="Mehr">${I.ellipsis}</button><button class="icon-btn is-plain is-small" aria-label="Schließen">${I.close}</button>
      <button class="icon-btn is-filled" aria-label="Plus">${I.plus}</button>
    </div></div>`));

  const chips = sec('Chips & Segmented', `<div class="chips" role="group" aria-label="Kategorie">${['Alle', 'Oberteile', 'Jacken', 'Kleider', 'Hosen & Röcke', 'Schuhe', 'Schmuck'].map((l, i) => `<button class="chip" aria-pressed="${i === 1}">${l}${i ? `<span class="chip-count">${i * 2}</span>` : ''}</button>`).join('')}</div>
    <div style="padding:14px 16px 0" class="stack g-seg"></div>`);
  chips.querySelector('.chips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    chips.querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });
  chips.querySelector('.g-seg').append(
    ui.segmented({ items: [{ value: 'alle', label: 'Alles' }, { value: 'gold', label: 'Gold' }, { value: 'silber', label: 'Silber' }], value: 'alle' }).el,
    ui.segmented({ items: [{ value: 'a', label: 'Alle' }, { value: 'w', label: 'Diese Woche' }], value: 'w', small: true }).el
  );

  const t = todayIndex();
  sec('Tage, Punkte, Badges', pad(`<div class="days" role="group" aria-label="Tage">${WEEKDAYS.map((d, i) => `<button class="day${i === t ? ' is-today' : ''}" aria-pressed="${i === 2 || i === 5}">${d}</button>`).join('')}</div>
    <div class="hstack" style="margin-top:16px"><span class="color-dot is-large" style="--c:#C2333D"></span><span class="color-dot" style="--c:#B9D0EA"></span>
    <span class="metal-dot is-gold"></span><span class="metal-dot is-silber"></span><span class="badge">3</span><span class="badge is-tint">12</span><span class="badge is-gray">7</span>${ui.spinnerHTML()}${ui.spinnerHTML(true)}</div>`))
    .addEventListener('click', (e) => { const d = e.target.closest('.day'); if (d) { d.setAttribute('aria-pressed', String(d.getAttribute('aria-pressed') !== 'true')); ui.haptic(); } });

  const sf = ui.searchField({ placeholder: 'Name, Farbe oder Kategorie' });
  sec('Suchfeld & Textfeld', pad('<div class="g-sf"></div><input class="textfield" style="margin-top:12px" placeholder="Name (optional)">')).querySelector('.g-sf').appendChild(sf.el);

  sec('Liste (Inset Grouped)', `<div class="list">
    <div class="list-header">Darstellung</div>
    <div class="list-group">
      <label class="cell has-icon"><span class="cell-icon is-indigo">${I.wand}</span><span class="cell-body"><span class="cell-title">An Körperform anpassen</span></span><input type="checkbox" class="switch" checked></label>
      <button class="cell has-icon"><span class="cell-icon">${I.paintpalette}</span><span class="cell-body"><span class="cell-title">Akzentfarbe</span></span><span class="cell-value">Rosé</span><span class="cell-chevron">${I.chevronRight}</span></button>
      <div class="cell has-icon"><span class="cell-icon is-gray">${I.adjust}</span><span class="cell-body"><span class="cell-title">Größe</span></span></div>
      <div class="cell"><div class="slider-row" style="flex:1">${I.minus}<input type="range" class="slider" min="0.4" max="2.2" step="0.01" value="1.1" aria-label="Größe">${I.plus}</div></div>
      <label class="cell"><input class="cell-input" placeholder="Name" value="Outfit 17. Nov."></label>
      <button class="cell is-button">${I.share}<span>Sicherung erstellen</span></button>
      <button class="cell is-destructive">Alle Daten löschen</button>
    </div>
    <p class="list-footer">Alle Daten bleiben auf diesem iPhone.</p></div>`);

  sec('Fortschritt', pad(`<div class="stack"><div class="progress g-p1"><i></i></div><div class="progress is-indeterminate"><i></i></div>
    <p class="t-footnote c-2">Wird ausgeschnitten … <span class="t-num g-pv">42 %</span></p></div>`));
  let pv = 0.42;
  const p1 = c.querySelector('.g-p1');
  ui.setProgress(p1, pv);
  setInterval(() => { pv = (pv + 0.07) % 1; ui.setProgress(p1, pv); c.querySelector('.g-pv').textContent = Math.round(pv * 100) + ' %'; }, 900);

  const bannerBox = sec('Banner / Glas-Karte', `<div class="studio" style="margin:0 16px;padding:14px;border-radius:26px" class="stack">
    <div class="banner"><span class="banner-icon">${I.calendar}</span><span class="banner-body"><span class="banner-title">Für heute geplant</span><span class="banner-text">Bürotag</span></span><button class="btn btn-filled btn-small">Anziehen</button><button class="banner-close" aria-label="Ausblenden">${I.close}</button></div>
    <div class="banner" style="margin-top:10px"><span class="banner-icon">${I.share}</span><span class="banner-body"><span class="banner-title">Zum Home-Bildschirm</span><span class="banner-text">Dann bleibt alles dauerhaft gespeichert.</span></span></div></div>`);
  void bannerBox;

  // Kacheln mit Demo-Teilen (Kontrollansicht der Zeichnungen)
  const tiles = sec('Kacheln · Demo-Teile <span class="count">lange drücken</span>', '<div class="grid grid-3 g-tiles"></div>');
  const cards = sec('Karten', '<div class="grid grid-2 g-cards"></div>');
  sec('Leerzustand', ui.emptyState({ icon: I.hanger, title: 'Der Schrank ist leer', text: 'Fotografiere ein Kleidungsstück, die App schneidet es aus und legt es hier ab.', action: { label: 'Erstes Teil scannen', icon: I.camera } }));

  const ov = sec('Overlays', pad('<div class="stack g-ov"></div>'));
  const btn = (label, fn, variant = 'gray') => ov.querySelector('.g-ov').appendChild(ui.button({ label, variant, block: true, onTap: fn }));
  btn('Sheet (medium)', () => openSaveDemo());
  btn('Sheet (large)', () => openLargeDemo());
  btn('Action Sheet', async () => {
    const v = await ui.actionSheet({ title: '„Ringelshirt“ löschen?', message: 'Es wird auch aus 2 Outfits entfernt.', actions: [{ label: 'Löschen', destructive: true, value: 'del' }] });
    ui.toast(v ? 'Gelöscht' : 'Abgebrochen');
  });
  btn('Alert', async () => {
    const ok = await ui.confirm({ title: 'Sicherung einlesen?', message: 'Teile und Outfits aus der Datei werden übernommen.', confirmLabel: 'Einlesen' });
    ui.toast(ok ? 'Eingelesen' : 'Abgebrochen');
  });
  btn('Toast mit Aktion', () => ui.toast('Outfit geleert', { icon: I.reset, action: { label: 'Rückgängig', onTap: () => ui.toast('Wiederhergestellt') } }));
  btn('Eingabe (prompt)', async () => { const t = await ui.prompt({ title: 'Umbenennen', value: 'Bürotag' }); if (t != null) ui.toast(t); });

  // Symbole
  sec('Symbole', `<div style="display:grid;grid-template-columns:repeat(8,1fr);gap:14px;padding:0 16px;color:var(--label)">${Object.entries(I).filter(([, v]) => typeof v === 'string').map(([k, v]) => `<span title="${k}" style="display:grid;place-items:center">${v.replace('<svg', '<svg style="width:26px;height:26px"')}</span>`).join('')}</div>`);

  // Demo-Teile zeichnen (lazy, damit die Seite sofort steht)
  import('./seed.js').then(({ DEMO_ITEMS, renderDemo, renderDemoBody }) => {
    const box = c.querySelector('.g-tiles');
    const urlsLocal = [];
    for (const spec of DEMO_ITEMS) {
      const cnv = renderDemo(spec);
      const url = cnv.toDataURL('image/png');
      urlsLocal.push(url);
      box.insertAdjacentHTML('beforeend', `<button class="tile" aria-label="${ui.esc(spec.name)}"><img src="${url}" alt="">${spec.metal ? `<span class="tile-badge"><span class="metal-dot is-${spec.metal}"></span></span>` : ''}</button>`);
    }
    const body = renderDemoBody().toDataURL('image/png');
    box.insertAdjacentHTML('beforeend', `<button class="tile is-studio" aria-label="Figur"><img src="${body}" alt=""></button>`);
    c.querySelector('.g-cards').innerHTML = ['Bürotag|Mo, Mi', 'Wochenende|Sa'].map((s, i) => {
      const [n, d] = s.split('|');
      return `<button class="card"><div class="card-media studio"><img src="${i ? urlsLocal[7] : urlsLocal[2]}" alt="" style="padding:18%"></div><div class="card-body"><div class="card-title">${n}</div><div class="card-subtitle">${d}</div></div></button>`;
    }).join('');
    ui.bindLongPress(box, (tile) => ui.contextMenu(tile, { actions: [
      { label: 'Anprobieren', icon: I.mirror, onTap: () => ui.toast('Anprobieren') },
      { label: 'Favorit', icon: I.heart, onTap: () => ui.toast('Favorit') },
      { label: 'Löschen', icon: I.trash, destructive: true, onTap: () => ui.toast('Löschen') }
    ] }), { selector: '.tile' });
  });

  function openSaveDemo() {
    const date = new Date().toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
    const content = ui.h(`<div>
      <div class="list" style="margin-bottom:22px"><div class="list-group"><label class="cell"><input class="cell-input" value="Outfit ${date}" aria-label="Name"></label></div></div>
      <div class="field-label" style="margin:0 4px 10px">Tragen am</div>
      <div class="days">${WEEKDAYS.map((d, i) => `<button class="day${i === t ? ' is-today' : ''}" aria-pressed="false">${d}</button>`).join('')}</div>
    </div>`);
    content.addEventListener('click', (e) => { const d = e.target.closest('.day'); if (d) { d.setAttribute('aria-pressed', String(d.getAttribute('aria-pressed') !== 'true')); ui.haptic(); } });
    ui.sheet({ title: 'Outfit sichern', detent: 'medium', leading: { label: 'Abbrechen' }, trailing: { label: 'Sichern', bold: true, onTap: (s) => { s.close('done'); ui.toast('Unter Outfits gesichert', { icon: I.checkCircleFill }); } }, content });
  }
  function openLargeDemo() {
    const content = ui.h(`<div>
      <div class="list"><div class="list-header">Mein Foto</div><div class="list-group">
        <button class="cell"><span class="cell-body"><span class="cell-title">Foto ändern</span></span><span class="cell-chevron">${I.chevronRight}</span></button>
        <button class="cell"><span class="cell-body"><span class="cell-title">Hilfslinien anpassen</span></span><span class="cell-chevron">${I.chevronRight}</span></button>
      </div></div>
      <div class="list"><div class="list-header">Speicher</div><div class="list-group">
        <div class="cell"><span class="cell-body"><span class="cell-title">Belegt</span></span><span class="cell-value">21 Teile · 3 Outfits · 4,2 MB</span></div>
        <button class="cell is-button g-stack">Weiteres Sheet öffnen</button>
      </div><p class="list-footer">Nach unten ziehen zum Schließen.</p></div>
      ${Array.from({ length: 8 }, (_, i) => `<div class="list"><div class="list-group"><div class="cell"><span class="cell-body"><span class="cell-title">Zeile ${i + 1}</span><span class="cell-subtitle">Zum Scrollen</span></span></div></div></div>`).join('')}
    </div>`);
    content.querySelector('.g-stack').addEventListener('click', () => openSaveDemo());
    ui.sheet({ title: 'Einstellungen', detent: 'large', trailing: { label: 'Fertig', bold: true, onTap: (s) => s.close('done') }, content });
  }
}
