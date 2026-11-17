// Einstellungen (Sheet large): Mein Foto, Darstellung, Speicher, Info.
import './settings.css';
import { S, on, setSetting, TINTS, APPEARANCES, warpOn, isStandalone, isDark, urls, boot } from '../app/state.js';
import { register, run } from '../app/actions.js';
import { sheet, h, esc, segmented, haptic, toast, confirm, alert, springAnimate, shareFiles } from '../ui/ui.js';
import { I } from '../ui/icons.js';
import { storageInfo, exportBackup, importBackup, requestPersistence } from '../db.js';
import { SILHOUETTE } from '../silhouette.js';
import pkg from '../../package.json';

export const APP_VERSION = (pkg.version || '1.0').split('.').slice(0, 2).join('.');
const ICON_SRC = `${import.meta.env.BASE_URL}icons/apple-touch-icon.png`;
const plural = (n, one, many) => `${n.toLocaleString('de-DE')} ${n === 1 ? one : many}`;

// ---------- Sicherung ----------
export async function doExport() {
  const t = toast('Sicherung wird erstellt …', { icon: I.doc, duration: 30000 });
  try {
    const blob = await exportBackup();
    const name = `kleiderschrank-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([blob], name, { type: 'application/json' });
    t.close(true);
    const r = await shareFiles([file], { title: 'Kleiderschrank-Sicherung', readyTitle: 'Sicherung ist bereit' });
    if (r !== 'unsupported') return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Sicherung erstellt', { icon: I.checkCircleFill });
  } catch (e) {
    t.close(true);
    console.error(e);
    alert({ title: 'Sicherung fehlgeschlagen', message: 'Die Sicherung konnte nicht erstellt werden.', buttons: [{ label: 'OK', value: true, bold: true }] });
  }
}

async function doImport(file, sh) {
  const ok = await confirm({
    title: 'Sicherung einlesen?',
    message: 'Teile, Outfits und Foto aus der Datei ersetzen die Daten auf diesem iPhone.',
    confirmLabel: 'Einlesen'
  });
  if (!ok) return;
  try {
    await importBackup(file);
    await boot();
    requestPersistence();
    haptic('success');
    await sh?.close('done');
    toast('Sicherung eingelesen', { icon: I.checkCircleFill });
  } catch (err) {
    console.warn('[Import]', err?.message || err);
    alert({
      title: 'Einlesen nicht möglich',
      message: err?.message && !/JSON|Unexpected/i.test(err.message) ? err.message : 'Die Datei konnte nicht gelesen werden. Wähl eine Kleiderschrank-Sicherung (.json).',
      buttons: [{ label: 'OK', value: true, bold: true }]
    });
  }
}

// ---------- Bausteine ----------
function photoHTML() {
  const has = !!(S.body && urls.get('body'));
  const src = has ? urls.get('body') : SILHOUETTE.src;
  const when = has && S.body.updated ? new Date(S.body.updated).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  return `<div class="list-header">Mein Foto</div>
    <div class="list-group">
      <div class="cell settings-photo">
        <span class="settings-photo-thumb${has ? '' : ' is-placeholder'}"><img src="${src}" alt=""><span class="settings-photo-floor"></span></span>
        <span class="cell-body"><span class="settings-photo-title">${has ? 'Dein Ganzkörperfoto' : 'Noch kein Foto'}</span>
          <span class="cell-subtitle">${has ? `Aufgenommen am ${esc(when)}` : 'Die Anprobe zeigt eine Platzhalterfigur.'}</span></span>
      </div>
      <button type="button" class="cell has-icon" data-act="photo"><span class="cell-icon">${I.camera}</span>
        <span class="cell-body"><span class="cell-title">${has ? 'Foto ändern' : 'Foto hinzufügen'}</span></span><span class="cell-chevron">${I.chevronRight}</span></button>
      ${has ? `<button type="button" class="cell has-icon" data-act="guides"><span class="cell-icon is-indigo">${I.sliders}</span>
        <span class="cell-body"><span class="cell-title">Hilfslinien anpassen</span></span><span class="cell-chevron">${I.chevronRight}</span></button>` : ''}
    </div>
    <p class="list-footer">Schultern, Hüfte und Knöchel helfen, die Kleidung richtig zu platzieren.</p>`;
}

function warpFoot() {
  return S.body && S.body.cutout !== false
    ? 'Oberteile, Jacken, Kleider und Hosen folgen der Silhouette auf deinem Foto.'
    : 'Wirkt, sobald ein freigestelltes Ganzkörperfoto hinterlegt ist.';
}

function statusHTML(persisted) {
  if (isStandalone() || persisted) {
    return `<div class="cell has-icon settings-status"><span class="cell-icon is-green">${I.lock}</span>
      <span class="cell-body"><span class="cell-title">Dauerhaft gespeichert</span>
      <span class="cell-subtitle">${isStandalone() ? 'Die App läuft vom Home-Bildschirm.' : 'Safari hält deine Daten fest.'}</span></span></div>`;
  }
  return `<button type="button" class="cell has-icon settings-status" data-act="install"><span class="cell-icon is-orange">${I.iphone}</span>
    <span class="cell-body"><span class="cell-title">Als App sichern</span>
    <span class="cell-subtitle">Im Safari-Tab kann iOS Daten nach längerer Pause löschen. Leg die App auf den Home-Bildschirm.</span></span><span class="cell-chevron">${I.chevronRight}</span></button>`;
}

// ---------- Sheet ----------
let open = null;
function openSettings() {
  if (open) return open;
  const tint = TINTS.find((t) => t.id === S.settings.tint) || TINTS[0];
  const content = h(`<div class="settings">
    <div class="list settings-photo-list">${photoHTML()}</div>

    <div class="list">
      <div class="list-header">Darstellung</div>
      <div class="list-group">
        <div class="cell settings-tint-head"><span class="cell-body"><span class="cell-title">Akzentfarbe</span></span><span class="cell-value" data-tint-name>${esc(tint.label)}</span></div>
        <div class="swatches settings-swatches" role="radiogroup" aria-label="Akzentfarbe">${TINTS.map((t) =>
          `<button type="button" class="swatch" role="radio" data-tint="${t.id}" style="--c:${isDark() ? t.dark : t.light}" aria-label="${esc(t.label)}" aria-pressed="${t.id === tint.id}" aria-checked="${t.id === tint.id}"></button>`).join('')}</div>
        <div class="cell settings-seg-cell"><span class="cell-title">Erscheinungsbild</span></div>
        <label class="cell"><span class="cell-body"><span class="cell-title">Kleidung an Körperform anpassen</span></span>
          <input type="checkbox" class="switch" data-act="warp" ${warpOn() ? 'checked' : ''}></label>
      </div>
      <p class="list-footer" data-warp-foot>${warpFoot()}</p>
    </div>

    <div class="list">
      <div class="list-header">Speicher</div>
      <div class="list-group">
        <div class="cell"><span class="cell-body"><span class="cell-title t-num" data-counts>${plural(S.items.length, 'Teil', 'Teile')} · ${plural(S.outfits.length, 'Outfit', 'Outfits')}</span></span><span class="cell-value t-num" data-usage></span></div>
        ${statusHTML(false)}
        <button type="button" class="cell has-icon" data-act="export"><span class="cell-icon is-blue">${I.share}</span>
          <span class="cell-body"><span class="cell-title">Sicherung erstellen</span></span></button>
        <label class="cell has-icon"><span class="cell-icon is-gray">${I.download}</span>
          <span class="cell-body"><span class="cell-title">Sicherung einlesen</span></span>
          <input type="file" class="sr-only" accept="application/json,.json" data-act="import"></label>
      </div>
      <p class="list-footer">Eine Sicherung legt alles in eine Datei, die du z. B. in iCloud Drive ablegen und auf einem neuen iPhone wieder einlesen kannst.</p>
    </div>

    <div class="list">
      <div class="list-header">Info</div>
      <div class="list-group">
        <div class="cell settings-about">
          <img class="settings-appicon" src="${ICON_SRC}" alt="">
          <span class="cell-body"><span class="settings-about-name">Kleiderschrank</span><span class="cell-subtitle">Version ${esc(APP_VERSION)}</span></span>
        </div>
        <button type="button" class="cell has-icon" data-act="intro"><span class="cell-icon is-plain">${I.sparkles}</span>
          <span class="cell-body"><span class="cell-title">Einführung erneut ansehen</span></span><span class="cell-chevron">${I.chevronRight}</span></button>
      </div>
      <p class="list-footer settings-privacy">${I.lock}<span>Alle Daten bleiben auf diesem iPhone.</span></p>
    </div>
  </div>`);

  const seg = segmented({
    items: APPEARANCES.map((a) => ({ value: a.id, label: a.label })),
    value: S.settings.appearance || 'auto',
    small: true,
    label: 'Erscheinungsbild',
    onChange: (v) => setSetting('appearance', v)
  });
  seg.el.classList.add('settings-seg');
  content.querySelector('.settings-seg-cell').appendChild(seg.el);

  const sh = sheet({
    title: 'Einstellungen',
    detent: 'large',
    className: 'settings-sheet',
    trailing: { label: 'Fertig', bold: true, onTap: (s) => s.close('done') },
    content,
    onClose: () => { offs.forEach((f) => f()); open = null; }
  });
  open = sh;

  // Speicher-Infos nachladen
  const refreshStorage = async () => {
    const info = await storageInfo();
    content.querySelector('[data-counts]').textContent = `${plural(S.items.length, 'Teil', 'Teile')} · ${plural(S.outfits.length, 'Outfit', 'Outfits')}`;
    content.querySelector('[data-usage]').textContent = info.usage != null ? `${(info.usage / 1e6).toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} MB` : '';
    content.querySelector('.settings-status').outerHTML = statusHTML(info.persisted);
  };
  refreshStorage();

  const syncSwatches = () => {
    const cur = TINTS.find((t) => t.id === S.settings.tint) || TINTS[0];
    content.querySelector('[data-tint-name]').textContent = cur.label;
    content.querySelectorAll('.swatch').forEach((b) => {
      const t = TINTS.find((x) => x.id === b.dataset.tint);
      b.style.setProperty('--c', isDark() ? t.dark : t.light);
      b.setAttribute('aria-pressed', String(b.dataset.tint === cur.id));
      b.setAttribute('aria-checked', String(b.dataset.tint === cur.id));
    });
  };
  const offs = [
    on('settings', ({ key }) => {
      if (key === 'tint' || key === 'appearance' || key === 'systemAppearance') syncSwatches();
      if (key === 'appearance') seg.set(S.settings.appearance || 'auto', { silent: true });
      if (key === 'warp') content.querySelector('[data-act="warp"]').checked = warpOn();
    }),
    on('body', () => {
      content.querySelector('.settings-photo-list').innerHTML = photoHTML();
      content.querySelector('[data-warp-foot]').textContent = warpFoot();
    }),
    on('items', refreshStorage),
    on('outfits', refreshStorage)
  ];

  content.addEventListener('click', (e) => {
    const sw = e.target.closest('.swatch');
    if (sw) {
      if (S.settings.tint === sw.dataset.tint || (!S.settings.tint && sw.dataset.tint === 'rose')) return;
      haptic('selection');
      setSetting('tint', sw.dataset.tint);
      springAnimate(sw, [{ transform: 'scale(.8)' }, { transform: 'scale(1)' }], { spring: 'bouncy' });
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'photo') run('openBodySetup');
    else if (act === 'guides') run('openGuides');
    else if (act === 'export') doExport();
    else if (act === 'install') run('showInstallHelp');
    else if (act === 'intro') { sh.close('done').then(() => run('openOnboarding', { replay: true })); }
  });
  content.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.act === 'warp') setSetting('warp', t.checked);
    else if (t.dataset.act === 'import') {
      const f = t.files?.[0];
      t.value = '';
      if (f) doImport(f, sh);
    }
  });
  return sh;
}

register('openSettings', openSettings);

export default { id: 'settings' };
