// Scannen (Teil fotografieren → freistellen → sichern), Ganzkörperfoto und Hilfslinien.
// Nebenmodul: registriert openScan, openBodySetup, openGuides beim Import. Vertrag: docs/DESIGN.md
import './scan.css';
import { S, addItem, select, setBody, persistSettings, urls, itemUrl } from '../app/state.js';
import { register, go } from '../app/actions.js';
import { sheet, h, esc, toast, haptic, springAnimate, prefersReducedMotion, setProgress, clamp, wait, segmented } from '../ui/ui.js';
import { I } from '../ui/icons.js';
import { CATEGORIES, CAT, METALS } from '../model.js';
import {
  removeBg, trimCanvas, coverage, dominantColor, guessMetal, guessCategory, estimateGuides, loadBitmap, canvasFrom,
  toBlob, preloadRemover
} from '../imaging.js';
import { analyzeWorn, defaultSelection, categoryFromSelection, regionAt, cutSelection, renderSelection, preloadSegmenter, occlusion } from '../garment.js';
import { prepareChatgpt, sendToChatgpt, chatgptPrompt } from '../chatgpt.js';
import { aiAvailable, enhanceWithAI } from '../ai.js';

// ---------------------------------------------------------------------------
// Namensvorschlag („Blaues Oberteil“, „Oberteil in Pink“)
// ---------------------------------------------------------------------------
const DECLINABLE = new Set(['Schwarz', 'Grau', 'Hellgrau', 'Weiß', 'Braun', 'Rot', 'Gelb', 'Grün', 'Hellblau', 'Blau', 'Jeansblau']);
const ENDING = { oberteil: 'es', jacke: 'e', kleid: 'es', hose: 'e', socken: 'e', schuhe: 'e', schmuck: 'er' };
export function suggestName(colorName, cat) {
  const noun = CAT[cat]?.noun || 'Teil';
  if (!colorName || colorName === 'Unbekannt') return noun;
  if (DECLINABLE.has(colorName)) return `${colorName}${ENDING[cat] || 'es'} ${noun}`;
  return `${noun} in ${colorName}`;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const reduced = () => prefersReducedMotion();

// ---------------------------------------------------------------------------
// Gemeinsamer Ablauf-Rahmen: ein Sheet, dessen Inhalt zwischen Schritten weich überblendet
// ---------------------------------------------------------------------------
let active = null; // laufender Ablauf (Scan oder Körper)

function createFlow({ title, kind }) {
  active?.sheet.close('programmatic');
  const flowEl = h('<div class="scan-flow"></div>');
  const f = {
    kind, closed: false, token: 0, objectUrls: [],
    flowEl,
    sheet: null,
    url(blob) { const u = URL.createObjectURL(blob); f.objectUrls.push(u); return u; },
    /** Schritt anzeigen: Inhalt gleitet/blendet über, Sheet bleibt offen. */
    show(el, { title: t, leading, trailing, back = false } = {}) {
      if (f.closed) return el;
      el.classList.add('scan-step');
      flowEl.querySelectorAll('.scan-step.is-leaving').forEach((n) => n.remove());
      const old = flowEl.querySelector('.scan-step');
      flowEl.appendChild(el);
      f.sheet.setTitle(t ?? '');
      f.sheet.setLeading(leading === undefined ? { label: 'Abbrechen' } : leading);
      f.sheet.setTrailing(trailing || null);
      f.sheet.body.scrollTop = 0;
      if (old && !reduced()) {
        old.classList.add('is-leaving');
        old.inert = true;
        old.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${back ? 24 : -24}px) scale(.985)` }],
          { duration: 200, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' }).finished.then(() => old.remove(), () => old.remove());
        springAnimate(el, [{ opacity: 0, transform: `translateX(${back ? -28 : 28}px)` }, { opacity: 1, transform: 'none' }],
          { spring: 'smooth', delay: 70, fill: 'backwards' });
      } else old?.remove();
      return el;
    }
  };
  f.sheet = sheet({
    title, detent: 'large', className: 'scan-sheet', leading: { label: 'Abbrechen' },
    content: flowEl,
    onClose: () => {
      f.closed = true;
      f.token++;
      f.stopFake?.();
      f.result?.abort?.abort();
      setTimeout(() => f.objectUrls.forEach((u) => URL.revokeObjectURL(u)), 800);
      if (active === f) active = null;
    }
  });
  // Datei-Auswahl (alle Inputs im Sheet)
  f.sheet.el.addEventListener('change', (e) => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'file' || !input.files?.length) return;
    const files = [...input.files];
    input.value = '';
    f.onFiles?.(files, input.dataset.in);
  });
  active = f;
  return f;
}

function fileButtons({ multiple = true, primary = 'Foto aufnehmen', secondary = 'Aus Fotos wählen', tag = 'scan' } = {}) {
  return `<div class="btn-stack scan-buttons">
    <label class="btn btn-filled btn-large btn-block">${I.camera}<span>${esc(primary)}</span><input class="sr-only" type="file" accept="image/*" capture="environment" data-in="${tag}" tabindex="-1"></label>
    <label class="btn btn-gray btn-large btn-block">${I.photo}<span>${esc(secondary)}</span><input class="sr-only" type="file" accept="image/*" ${multiple ? 'multiple' : ''} data-in="${tag}" tabindex="-1"></label>
  </div>`;
}
const privacyNote = (t = 'Passiert direkt auf deinem iPhone. Kein Foto verlässt das Gerät.') =>
  `<p class="scan-privacy">${I.lock}<span>${esc(t)}</span></p>`;

// ---------------------------------------------------------------------------
// Verarbeitungs-Schritt mit Fortschritt
// ---------------------------------------------------------------------------
function busyStep(f, { file, title, label }) {
  const src = f.url(file);
  const el = h(`<div class="scan-busy">
    <div class="scan-busy-media studio">
      <img class="scan-busy-photo" src="${src}" alt="" decoding="async">
      <div class="scan-shimmer" aria-hidden="true"></div>
    </div>
    <div class="scan-busy-info">
      <p class="scan-busy-text t-num" aria-live="polite"></p>
      <div class="progress scan-progress"><i></i></div>
      <p class="scan-busy-sub"></p>
    </div>
    ${privacyNote('Passiert direkt auf deinem iPhone.')}
  </div>`);
  f.show(el, { title, trailing: null });
  const textEl = el.querySelector('.scan-busy-text'), bar = el.querySelector('.scan-progress'), sub = el.querySelector('.scan-busy-sub');
  setProgress(bar, null);

  // Ein Balken für den ganzen Vorgang: Modell laden (falls nötig) 0–45 %, Ausschneiden danach bis max. 98 %.
  // Der angezeigte Wert läuft nie rückwärts; dauert es lange, zeigt ein Lichtschimmer weiter Aktivität.
  let phase = 'prep', fakeRaf = 0, fakeStart = 0, shown = 0, cutBase = 0.04, slowTimer = 0;
  const setText = (t, frac, note = '') => {
    if (frac != null) { frac = Math.max(shown, Math.min(frac, 1)); shown = frac; }
    textEl.textContent = frac != null ? `${t} ${Math.round(frac * 100)}\u00a0%` : t;
    setProgress(bar, frac);
    if (sub.textContent !== note) sub.textContent = note;
  };
  const stopFake = () => { cancelAnimationFrame(fakeRaf); fakeRaf = 0; clearTimeout(slowTimer); bar.classList.remove('is-working'); };
  f.stopFake = stopFake;
  const startFake = () => {
    if (fakeRaf) return;
    fakeStart = performance.now();
    cutBase = Math.max(cutBase, shown);
    let note = '';
    slowTimer = setTimeout(() => { note = 'Dauert etwas länger – gleich fertig.'; bar.classList.add('is-working'); }, 20000);
    const tick = () => {
      if (f.closed || !el.isConnected) return stopFake();
      const t = (performance.now() - fakeStart) / 1000;
      const v = cutBase + (0.98 - cutBase) * (1 - Math.exp(-t / 9)); // ruhig, nähert sich 98 %
      setText(label, v, note);
      fakeRaf = requestAnimationFrame(tick);
    };
    tick();
  };
  setText('Foto wird vorbereitet …', null);
  const onProgress = (text, frac) => {
    if (f.closed || !el.isConnected) return;
    if (/geladen/i.test(text)) {
      if (frac == null || frac === 0) { if (phase !== 'load') setText('Erkennung wird vorbereitet …', null); return; }
      phase = 'load';
      el.classList.add('is-loading-model');
      setText('Erkennung wird geladen …', 0.45 * frac, 'Nur beim ersten Mal (etwa 45 MB) – danach geht es schneller.');
    } else if (/ausgeschnitten/i.test(text)) {
      if (phase !== 'cut') { phase = 'cut'; el.classList.remove('is-loading-model'); startFake(); }
    } else if (phase === 'prep') setText('Foto wird vorbereitet …', null);
  };
  const done = async () => {
    stopFake();
    if (!el.isConnected) return;
    setText(label, 1);
    await wait(reduced() ? 0 : 220);
  };
  return { onProgress, done };
}

// ---------------------------------------------------------------------------
// Scannen
// ---------------------------------------------------------------------------
function openScan(opts = {}) {
  preloadRemover();
  preloadSegmenter();
  aiAvailable();
  const f = createFlow({ title: 'Teil scannen', kind: 'scan' });
  Object.assign(f, { presetCat: CAT[opts?.cat] ? opts.cat : null, queue: [], batch: 0, pos: 0, busy: false, saved: [], result: null });
  f.onFiles = (files, tag) => {
    if (tag === 'retry') { if (!f.busy) processGarment(f, files[0]); return; }
    if (tag === 'gpt') { importGpt(f, files[0]); return; }
    if (!f.busy && !f.result) { f.batch = 0; f.pos = 0; }
    f.queue.push(...files);
    f.batch += files.length;
    if (!f.busy) next(f);
  };
  startStep(f);
  return f.sheet;
}

function startStep(f, { back = false } = {}) {
  f.result = null;
  const n = f.saved.length;
  const recent = f.saved.slice(-5);
  const el = h(`<div class="scan-start">
    ${n ? `<div class="scan-saved">
        <div class="scan-saved-check">${I.checkCircleFill}</div>
        <div class="scan-saved-title">${plural(n, 'Teil', 'Teile')} gesichert</div>
        <div class="scan-saved-thumbs">${recent.map((id) => `<span class="scan-saved-thumb"><img src="${itemUrl(id)}" alt=""></span>`).join('')}</div>
        <p class="scan-saved-text">Fotografiere das nächste Teil oder tippe auf „Fertig“.</p>
      </div>`
      : `<div class="scan-hero"><div class="scan-hero-icon">${I.tshirt}</div>
        <h2 class="scan-hero-title">Teil scannen</h2>
        <p class="scan-hero-text">Die App erkennt das Kleidungsstück auf dem Foto und schneidet es aus – auch wenn du es anhast.</p></div>
      <div class="scan-features">
        <div class="feature-row">${I.photo}<div><div class="feature-title">Hingelegt oder angezogen</div><div class="feature-text">Flach auf ruhigem Untergrund von oben – oder im Spiegel an dir. Dann tippst du einfach auf das Teil.</div></div></div>
        <div class="feature-row">${I.crop}<div><div class="feature-title">Ganzes Teil im Bild</div><div class="feature-text">Mit etwas Rand. Schuhe von der Seite, Schmuck auf hellem Stoff.</div></div></div>
        <div class="feature-row">${I.sun}<div><div class="feature-title">Gutes Licht</div><div class="feature-text">Tageslicht ohne harte Schatten wirkt am besten.</div></div></div>
      </div>`}
    <div class="scan-bottom">
      ${fileButtons({ primary: n ? 'Nächstes Teil fotografieren' : 'Foto aufnehmen', secondary: 'Aus Fotos wählen' })}
      ${n ? '' : `<p class="scan-footnote">Aus deinen Fotos kannst du mehrere auf einmal wählen.</p>`}
    </div>
  </div>`);
  f.show(el, {
    title: n ? '' : 'Teil scannen', back,
    leading: n ? null : { label: 'Abbrechen' },
    trailing: n ? { label: 'Fertig', bold: true, onTap: (s) => s.close('done') } : null
  });
  if (n && !reduced()) {
    const chk = el.querySelector('.scan-saved-check');
    springAnimate(chk, [{ transform: 'scale(.3)', opacity: 0 }, { transform: 'none', opacity: 1 }], { spring: 'bouncy', delay: 120, fill: 'backwards' });
    el.querySelectorAll('.scan-saved-thumb').forEach((t, i) =>
      springAnimate(t, [{ transform: 'translateY(10px) scale(.8)', opacity: 0 }, { transform: 'none', opacity: 1 }], { spring: 'bouncy', delay: 200 + i * 50, fill: 'backwards' }));
  }
}

function queueTitle(f) {
  return f.batch > 1 ? `${Math.min(f.pos, f.batch)} von ${f.batch}` : 'Teil scannen';
}

function next(f) {
  const file = f.queue.shift();
  if (!file) { f.batch = 0; f.pos = 0; return startStep(f, { back: true }); }
  f.pos++;
  processGarment(f, file);
}

async function processGarment(f, file) {
  const my = ++f.token;
  f.busy = true;
  f.result = null;
  f.file = file;
  f.worn = null;
  const ui = busyStep(f, { file, title: queueTitle(f), label: 'Wird ausgeschnitten …' });
  let canvas = null, failed = null, worn = null;
  try {
    const cut = await removeBg(file, { onProgress: ui.onProgress });
    // Trägt jemand das Teil? Dann nur die Kleidung nehmen – ohne Kopf, Arme, Beine.
    try {
      const photo = canvasFrom(await loadBitmap(file), 1280);
      if (photo.width === cut.width && photo.height === cut.height) {
        const an = await analyzeWorn(photo);
        if (an) worn = { an, photo, cut, sel: defaultSelection(an, f.presetCat) };
      }
    } catch (err) { console.warn('Kleidungserkennung nicht verfügbar', err); }
    if (worn) {
      canvas = trimCanvas(cutSelection(worn.cut, worn.an, worn.sel));
      if (!canvas || coverage(canvas) < 0.04) failed = worn.an.regions.length > 1 ? null : 'none';
    } else {
      canvas = trimCanvas(cut);
      if (!canvas || coverage(canvas) < 0.04) failed = 'none';
    }
  } catch (err) {
    console.error(err);
    failed = 'error';
  }
  if (f.closed || my !== f.token) return; // Sheet zu oder überholt: Ergebnis ignorieren
  f.busy = false;
  if (failed) return errorStep(f, failed);
  await ui.done();
  if (f.closed || my !== f.token) return;
  if (worn) {
    f.worn = worn;
    if (worn.an.regions.length > 1) return pickStep(f);
    return resultStep(f, canvas, { suggestCat: categoryFromSelection(worn.an, worn.sel), occ: occlusion(worn.an, worn.sel) });
  }
  resultStep(f, canvas);
}

// ---------------------------------------------------------------------------
// Teil wählen (Foto mit Person: mehrere Kleidungsstücke erkannt)
// ---------------------------------------------------------------------------
function pickStep(f, { back = false } = {}) {
  const w = f.worn;
  const tint = getComputedStyle(document.documentElement).getPropertyValue('--tint').trim() || '#FF2D55';
  const el = h(`<div class="scan-pick">
    <p class="scan-pick-text">Tippe auf das Teil, das du sichern willst. Du kannst auch mehrere zusammen wählen.</p>
    <div class="scan-pick-media"></div>
    <div class="scan-bottom">
      <button type="button" class="btn btn-filled btn-large btn-block" data-a="go"><span>Weiter</span></button>
    </div>
  </div>`);
  const media = el.querySelector('.scan-pick-media');
  let view = null;
  const draw = () => {
    const c = renderSelection(w.photo, w.an, w.sel, tint);
    c.className = 'scan-pick-canvas';
    if (view) view.replaceWith(c); else media.appendChild(c);
    view = c;
    const btn = el.querySelector('[data-a="go"]');
    btn.disabled = !w.sel.size;
    f.sheet.setTrailingEnabled?.(!!w.sel.size);
  };
  const go = () => {
    if (!w.sel.size) return;
    const canvas = trimCanvas(cutSelection(w.cut, w.an, w.sel));
    if (!canvas) { toast('Dieses Teil ließ sich nicht ausschneiden', { icon: I.warning }); return; }
    haptic('light');
    resultStep(f, canvas, { suggestCat: categoryFromSelection(w.an, w.sel), occ: occlusion(w.an, w.sel) });
  };
  f.show(el, { title: 'Welches Teil?', back, trailing: { label: 'Weiter', bold: true, onTap: go } });
  draw();
  media.addEventListener('click', (e) => {
    const rect = view.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width, fy = (e.clientY - rect.top) / rect.height;
    if (fx < 0 || fy < 0 || fx > 1 || fy > 1) return;
    const r = regionAt(w.an, fx, fy);
    if (r < 0) { haptic('warning'); return; }
    if (w.sel.has(r)) w.sel.delete(r); else w.sel.add(r);
    haptic('selection');
    draw();
  });
  el.querySelector('[data-a="go"]').addEventListener('click', go);
}

function errorStep(f, kind) {
  haptic('warning');
  const src = f.url(f.file);
  const none = kind === 'none';
  const el = h(`<div class="scan-error">
    <div class="scan-error-media"><img src="${src}" alt=""><span class="scan-error-badge">${I.warning}</span></div>
    <h2 class="scan-error-title">${none ? 'Kein Kleidungsstück erkannt' : 'Das hat nicht geklappt'}</h2>
    <p class="scan-error-text">${none
      ? 'Probier es auf einem ruhigeren Untergrund und mit mehr Licht noch einmal – oder übernimm das Foto so, wie es ist.'
      : 'Beim Ausschneiden ist ein Fehler passiert. Versuch es noch einmal oder übernimm das Foto so, wie es ist.'}</p>
    <div class="scan-bottom">
      <div class="btn-stack scan-buttons">
        ${none
          ? `<label class="btn btn-filled btn-large btn-block">${I.camera}<span>Neues Foto aufnehmen</span><input class="sr-only" type="file" accept="image/*" capture="environment" data-in="retry" tabindex="-1"></label>`
          : `<button type="button" class="btn btn-filled btn-large btn-block" data-a="retry">${I.rotate}<span>Erneut versuchen</span></button>`}
        <button type="button" class="btn btn-gray btn-large btn-block" data-a="raw">${I.image}<span>Ohne Ausschneiden übernehmen</span></button>
        ${f.queue.length ? `<button type="button" class="btn btn-plain btn-block" data-a="skip">Überspringen</button>` : ''}
      </div>
    </div>
  </div>`);
  f.show(el, { title: queueTitle(f) });
  el.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (!a) return;
    if (a === 'retry') processGarment(f, f.file);
    else if (a === 'skip') next(f);
    else if (a === 'raw') {
      const my = ++f.token;
      const bmp = await loadBitmap(f.file);
      if (f.closed || my !== f.token) return;
      resultStep(f, canvasFrom(bmp, 900), { raw: true });
    }
  });
}

function resultStep(f, canvas, { raw = false, suggestCat = null, occ = null } = {}) {
  const guessed = suggestCat || guessCategory(canvas);
  const cat = f.presetCat || guessed;
  const color = dominantColor(canvas);
  const r = f.result = { canvas, cat, color, metal: guessMetal(canvas), catTouched: !!f.presetCat, saving: false, saved: false, raw, original: canvas, ai: null, mode: 'original' };
  const canPick = !!f.worn && f.worn.an.regions.length > 1;
  const covered = !!occ && (occ.score > 0.12 || occ.cutOff);
  const gpt = !!f.worn || raw;
  const el = h(`<div class="scan-result">
    <div class="scan-result-stage studio${raw ? ' is-raw' : ''}">
      <div class="scan-result-art"></div>
      <div class="studio-floor scan-result-floor"></div>
      <button type="button" class="icon-btn is-small scan-rotate" aria-label="Drehen">${I.rotate}</button>
      <div class="scan-ai-busy" aria-live="polite" hidden><div class="scan-shimmer"></div><span class="scan-ai-busy-label">${I.sparkles}<span>KI bereitet auf …</span></span></div>
    </div>
    <div class="scan-ai-switch" hidden></div>
    ${canPick ? `<button type="button" class="btn btn-plain btn-block scan-repick" data-a="repick">Anderes Teil wählen</button>` : ''}
    ${gpt ? `<div class="scan-gpt${covered ? ' is-covered' : ''}">
      <div class="scan-gpt-head"><span class="scan-gpt-icon">${I.sparkles}</span><div>
        <div class="scan-gpt-title">${covered ? 'Teile sind verdeckt' : 'Noch schöner mit ChatGPT'}</div>
        <div class="scan-gpt-text">${covered ? 'ChatGPT kann die fehlenden Stellen kostenlos ergänzen und ein sauberes Produktfoto machen.' : 'ChatGPT macht daraus kostenlos ein sauberes Produktfoto.'}</div>
      </div></div>
      <button type="button" class="btn btn-tinted btn-large btn-block" data-a="gpt">${I.share}<span>An ChatGPT senden</span></button>
      <ol class="scan-gpt-steps" hidden>
        <li>Im Teilen-Menü <b>ChatGPT</b> wählen.</li>
        <li>Der Auftrag ist kopiert: ins Textfeld tippen, <b>Einfügen</b>, senden.</li>
        <li>Fertiges Bild lange drücken → <b>Zu Fotos hinzufügen</b>.</li>
        <li>Zurück hierher und das Bild einlesen.</li>
      </ol>
      <label class="btn btn-gray btn-large btn-block scan-gpt-import" hidden>${I.photo}<span>Bild von ChatGPT einlesen</span><input class="sr-only" type="file" accept="image/*" data-in="gpt" tabindex="-1"></label>
    </div>` : ''}
    <div class="scan-ai" hidden>
      <button type="button" class="btn btn-tinted btn-large btn-block" data-a="ai">${I.sparkles}<span>Mit KI verbessern</span></button>
      <p class="scan-ai-note">Füllt verdeckte Stellen auf und macht daraus ein sauberes Produktfoto. Dafür wird das Foto an Google gesendet.</p>
    </div>
    <div class="scan-field">
      <div class="list-header">Was ist es?</div>
      <div class="chips is-wrap scan-cats" role="group" aria-label="Kategorie">
        ${CATEGORIES.map((c) => `<button type="button" class="chip" data-cat="${c.id}" aria-pressed="false">${esc(c.one)}</button>`).join('')}
      </div>
    </div>
    <div class="scan-field scan-metal-field" hidden>
      <div class="list-header">Metall</div>
      <div class="chips is-wrap scan-metals" role="group" aria-label="Metall">
        ${METALS.map((m) => `<button type="button" class="chip" data-metal="${m.id}" aria-pressed="false"><span class="metal-dot is-${m.id}"></span>${esc(m.label)}</button>`).join('')}
      </div>
    </div>
    <div class="list scan-meta">
      <div class="list-group">
        <label class="cell"><span class="scan-cell-label">Name</span><input class="cell-input scan-name" type="text" autocomplete="off" autocorrect="off" enterkeyhint="done" maxlength="60"></label>
        <div class="cell"><span class="scan-cell-label">Farbe</span><span class="cell-value scan-color"><span class="color-dot" style="--c:${esc(color.hex)}"></span>${esc(color.name)}</span></div>
      </div>
      <p class="list-footer">Ohne Namen wird der Vorschlag verwendet.</p>
    </div>
    <div class="scan-bottom">
      <div class="btn-row">
        <button type="button" class="btn btn-gray btn-large" data-a="discard">Verwerfen</button>
        <button type="button" class="btn btn-filled btn-large" data-a="save">${I.check}<span>Sichern</span></button>
      </div>
    </div>
  </div>`);
  const art = el.querySelector('.scan-result-art');
  canvas.classList.add('scan-result-canvas');
  art.appendChild(canvas);
  const nameIn = el.querySelector('.scan-name');

  const sync = () => {
    el.querySelectorAll('.scan-cats .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === r.cat)));
    el.querySelectorAll('.scan-metals .chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.metal === r.metal)));
    const mf = el.querySelector('.scan-metal-field');
    const show = r.cat === 'schmuck';
    if (mf.hidden === show) {
      mf.hidden = !show;
      if (show && !reduced()) springAnimate(mf, [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { spring: 'smooth' });
    }
    nameIn.placeholder = suggestName(r.color.name, r.cat);
  };
  sync();

  const save = () => saveResult(f);
  r.el = el; r.art = art;
  if (gpt) {
    r.gptPrep = prepareChatgpt(f.file, { cat: r.cat, colorName: r.color?.name, worn: !!f.worn, box: occ?.box || null }).catch((e) => { console.warn(e); return null; });
    r.gptPrep.then((p) => { r.gptReady = p; });
  }
  f.show(el, { title: f.batch > 1 ? queueTitle(f) : 'Passt das so?', trailing: { label: 'Sichern', bold: true, onTap: save } });
  if (!reduced()) {
    springAnimate(art, [{ opacity: 0, transform: 'scale(.82) translateY(14px)' }, { opacity: 1, transform: 'none' }], { spring: 'bouncy', delay: 120, fill: 'backwards' });
  }

  nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameIn.blur(); });
  el.addEventListener('click', (e) => {
    const c = e.target.closest('[data-cat]');
    if (c) { if (r.cat !== c.dataset.cat) { r.cat = c.dataset.cat; r.catTouched = true; haptic('selection'); sync(); } return; }
    const m = e.target.closest('[data-metal]');
    if (m) { if (r.metal !== m.dataset.metal) { r.metal = m.dataset.metal; haptic('selection'); sync(); } return; }
    if (e.target.closest('.scan-rotate')) return rotate(f, art, sync);
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'save') save();
    else if (a === 'discard') { haptic('light'); next(f); }
    else if (a === 'repick') { r.abort?.abort(); pickStep(f, { back: true }); }
    else if (a === 'ai') runAI(f, el, art);
    else if (a === 'gpt') openChatgpt(f);
  });

  aiAvailable().then((ok) => {
    if (!ok || gpt || f.result !== r || !el.isConnected) return;
    const box = el.querySelector('.scan-ai');
    box.hidden = false;
    if (!reduced()) springAnimate(box, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { spring: 'smooth' });
  });
}

function showCanvas(art, c) {
  const old = art.querySelector('canvas');
  c.classList.add('scan-result-canvas');
  if (old) old.replaceWith(c); else art.appendChild(c);
}

async function runAI(f, el, art) {
  const r = f.result;
  if (!r || r.aiBusy || r.saving) return;
  r.aiBusy = true;
  const my = f.token;
  const btn = el.querySelector('[data-a="ai"]');
  const busy = el.querySelector('.scan-ai-busy');
  const label = busy.querySelector('.scan-ai-busy-label span');
  btn.disabled = true;
  busy.hidden = false;
  f.sheet.setTrailingEnabled(false);
  haptic('light');
  r.abort = new AbortController();
  const phases = { upload: 'Foto wird gesendet …', ai: 'KI bereitet auf …', cut: 'Wird ausgeschnitten …' };
  try {
    const out = await enhanceWithAI(f.file, r.raw ? null : r.original, {
      cat: r.cat, colorName: r.color?.name, worn: !!f.worn, signal: r.abort.signal,
      onPhase: (p) => { if (label) label.textContent = phases[p] || ''; }
    });
    if (f.closed || my !== f.token || f.result !== r) return;
    r.ai = out;
    setMode(f, el, art, 'ai');
    haptic('success');
    ensureSwitch(f, 'Mit KI');
    el.querySelector('[data-a="ai"] span').textContent = 'Noch einmal mit KI';
  } catch (err) {
    if (err?.name === 'AbortError' || f.closed) return;
    console.error(err);
    haptic('warning');
    toast(err?.message || 'Die KI-Aufbereitung hat nicht geklappt', { icon: I.warning });
  } finally {
    r.aiBusy = false;
    if (!f.closed && f.result === r) {
      busy.hidden = true;
      btn.disabled = false;
      f.sheet.setTrailingEnabled(true);
    }
  }
}

function ensureSwitch(f, aiLabel) {
  const r = f.result, el = r.el, art = r.art;
  const sw = el.querySelector('.scan-ai-switch');
  sw.replaceChildren();
  r.seg = segmented({ items: [{ value: 'original', label: 'Original' }, { value: 'ai', label: aiLabel }], value: 'ai', small: true, label: 'Version', onChange: (v) => setMode(f, el, art, v) });
  sw.appendChild(r.seg.el);
  if (sw.hidden) {
    sw.hidden = false;
    if (!reduced()) springAnimate(sw, [{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { spring: 'smooth' });
  }
}

/** Foto + Auftrag an ChatGPT übergeben (Teilen-Menü). Muss direkt im Tipp passieren. */
function openChatgpt(f) {
  const r = f.result;
  if (!r) return;
  const prep = r.gptReady;
  if (!prep) { toast('Einen Moment, das Foto wird vorbereitet …'); r.gptPrep?.then(() => {}); return; }
  // Kategorie kann sich seit dem Vorbereiten geändert haben
  prep.prompt = chatgptPrompt({ cat: r.cat, colorName: r.color?.name, worn: !!f.worn });
  haptic('light');
  const box = r.el.querySelector('.scan-gpt');
  box.querySelector('.scan-gpt-steps').hidden = false;
  const imp = box.querySelector('.scan-gpt-import');
  if (imp.hidden) {
    imp.hidden = false;
    if (!reduced()) springAnimate(imp, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { spring: 'smooth', delay: 150, fill: 'backwards' });
  }
  sendToChatgpt(prep).then((how) => {
    if (how === 'fallback') toast('Foto gespeichert und Auftrag kopiert', { icon: I.checkCircleFill });
  });
}

/** Ergebnisbild von ChatGPT einlesen: freistellen und als zweite Version anbieten. */
async function importGpt(f, file) {
  const r = f.result;
  if (!r || !file || r.aiBusy) return;
  r.aiBusy = true;
  const my = f.token;
  const busy = r.el.querySelector('.scan-ai-busy');
  const label = busy.querySelector('.scan-ai-busy-label span');
  label.textContent = 'Wird ausgeschnitten …';
  busy.hidden = false;
  f.sheet.setTrailingEnabled(false);
  try {
    const cut = await removeBg(file, { maxSide: 1280 });
    const c = trimCanvas(cut);
    if (!c || coverage(c) < 0.04) throw new Error('Auf dem Bild war kein Teil zu erkennen.');
    if (f.closed || my !== f.token || f.result !== r) return;
    r.ai = c;
    setMode(f, r.el, r.art, 'ai');
    ensureSwitch(f, 'ChatGPT');
    haptic('success');
    const box = r.el.querySelector('.scan-gpt');
    box.querySelector('.scan-gpt-steps').hidden = true;
    box.querySelector('.scan-gpt-import span').textContent = 'Anderes Bild einlesen';
  } catch (err) {
    if (f.closed) return;
    console.error(err);
    haptic('warning');
    toast(err?.message || 'Das Bild ließ sich nicht einlesen', { icon: I.warning });
  } finally {
    r.aiBusy = false;
    if (!f.closed && f.result === r) { busy.hidden = true; f.sheet.setTrailingEnabled(true); }
  }
}

function setMode(f, el, art, mode) {
  const r = f.result;
  const c = mode === 'ai' ? r.ai : r.original;
  if (!c || r.mode === mode && r.canvas === c) return;
  r.mode = mode;
  r.canvas = c;
  showCanvas(art, c);
  el.querySelector('.scan-result-stage').classList.toggle('is-raw', mode === 'original' && r.raw);
  if (!reduced()) springAnimate(c, [{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'none' }], { spring: 'smooth' });
}

async function rotate(f, art, sync) {
  const r = f.result;
  if (!r || r.rotating) return;
  r.rotating = true;
  const src = r.canvas;
  const c = document.createElement('canvas');
  c.width = src.height;
  c.height = src.width;
  const cx = c.getContext('2d');
  cx.translate(c.width, 0);
  cx.rotate(Math.PI / 2);
  cx.drawImage(src, 0, 0);
  c.className = src.className;
  haptic('light');
  if (!reduced()) {
    // sichtbare Drehung, dann das gedrehte Bild einsetzen
    const scale = Math.min(src.width, src.height) / Math.max(src.width, src.height);
    await springAnimate(src, [{ transform: 'none' }, { transform: `rotate(90deg) scale(${Math.max(scale, .7)})` }], { spring: 'snappy', fill: 'forwards' }).finished.catch(() => {});
  }
  src.replaceWith(c);
  r.canvas = c;
  if (r.mode === 'ai') r.ai = c; else r.original = c;
  if (!r.catTouched) r.cat = f.presetCat || guessCategory(c);
  sync();
  r.rotating = false;
}

async function saveResult(f) {
  const r = f.result;
  if (!r || r.saving || r.saved || r.aiBusy || f.closed) return;
  r.saving = true;
  const my = f.token;
  f.sheet.setTrailingEnabled(false);
  const btn = f.flowEl.querySelector('.scan-result [data-a="save"]');
  if (btn) btn.disabled = true;
  try {
    const nameIn = f.flowEl.querySelector('.scan-result .scan-name');
    const name = nameIn?.value.trim() || suggestName(r.color.name, r.cat);
    const blob = await toBlob(r.canvas, 'image/png');
    const item = await addItem({
      cat: r.cat, name, color: r.color, metal: r.cat === 'schmuck' ? r.metal : null, w: r.canvas.width, h: r.canvas.height
    }, blob); // addItem: speichert Bild + Daten, requestPersistence, Ereignis 'items'
    r.saved = true;
    // direkt in der Anprobe anziehen
    S.cat = item.cat;
    if (item.cat === 'schmuck') S.metal = 'alle';
    select(item.cat, item.id);
    persistSettings();
    f.saved.push(item.id);
    haptic('success');
    toast('Im Schrank gesichert', { icon: I.checkCircleFill });
  } catch (err) {
    console.error(err);
    r.saving = false;
    f.sheet.setTrailingEnabled(true);
    if (btn) btn.disabled = false;
    toast('Sichern hat nicht geklappt', { icon: I.warning });
    return;
  }
  if (f.closed || my !== f.token) return;
  next(f);
}

// ---------------------------------------------------------------------------
// Ganzkörperfoto
// ---------------------------------------------------------------------------
function openBodySetup() {
  preloadRemover();
  const f = createFlow({ title: 'Dein Foto', kind: 'body' });
  f.onFiles = (files) => { if (!f.busy) processBody(f, files[0]); };
  bodyIntro(f);
  return f.sheet;
}

function bodyIntro(f, { back = false } = {}) {
  const el = h(`<div class="scan-start">
    <div class="scan-hero"><div class="scan-hero-icon">${I.figure}</div>
      <h2 class="scan-hero-title">Ganzkörperfoto</h2>
      <p class="scan-hero-text">Auf dieses Foto wird deine Kleidung gelegt. Es bleibt nur auf diesem iPhone.</p></div>
    <div class="scan-features">
      <div class="feature-row">${I.person}<div><div class="feature-title">Von Kopf bis Fuß</div><div class="feature-text">Gerade von vorne, der ganze Körper im Bild.</div></div></div>
      <div class="feature-row">${I.hand}<div><div class="feature-title">Arme leicht vom Körper</div><div class="feature-text">Eng anliegende Kleidung macht die Anprobe genauer.</div></div></div>
      <div class="feature-row">${I.iphone}<div><div class="feature-title">Ruhige Wand, Hüfthöhe</div><div class="feature-text">Am besten fotografiert dich jemand mit dem iPhone auf Hüfthöhe.</div></div></div>
    </div>
    <div class="scan-bottom">
      ${fileButtons({ multiple: false, tag: 'body' })}
      ${S.body && urls.get('body') ? `<button type="button" class="btn btn-plain btn-block scan-guides-link" data-a="guides">Nur Hilfslinien anpassen</button>` : ''}
    </div>
  </div>`);
  el.querySelector('[data-a="guides"]')?.addEventListener('click', () => guidesStep(f, currentBodyDraft()));
  f.show(el, { title: 'Dein Foto', back });
}

async function processBody(f, file) {
  const my = ++f.token;
  f.busy = true;
  const ui = busyStep(f, { file, title: 'Dein Foto', label: 'Wird freigestellt …' });
  let canvas, cutout = true;
  try {
    const cut = await removeBg(file, { maxSide: 1600, onProgress: ui.onProgress });
    canvas = trimCanvas(cut, 1600, 0.03);
    if (!canvas || coverage(canvas) < 0.05) throw new Error('leer');
  } catch (err) {
    console.error(err);
    if (f.closed || my !== f.token) return;
    try {
      const bmp = await loadBitmap(file);
      canvas = canvasFrom(bmp, 1600);
      cutout = false;
      toast('Hintergrund nicht entfernt – Foto wird so verwendet', { icon: I.info });
    } catch (e2) {
      console.error(e2);
      f.busy = false;
      toast('Das Foto konnte nicht geladen werden', { icon: I.warning });
      return bodyIntro(f, { back: true });
    }
  }
  if (f.closed || my !== f.token) return;
  const guides = estimateGuides(canvas);
  const blob = await toBlob(canvas, 'image/png');
  if (f.closed || my !== f.token) return;
  await ui.done();
  f.busy = false;
  if (f.closed || my !== f.token) return;
  guidesStep(f, { blob, w: canvas.width, h: canvas.height, guides, cutout, src: f.url(blob), fresh: true });
}

function currentBodyDraft() {
  return { blob: null, w: S.body.w, h: S.body.h, guides: { ...S.body.guides }, cutout: S.body.cutout !== false, src: urls.get('body') };
}

// ---------------------------------------------------------------------------
// Hilfslinien
// ---------------------------------------------------------------------------
function openGuides() {
  if (!S.body || !urls.get('body')) return openBodySetup();
  const f = createFlow({ title: 'Hilfslinien', kind: 'guides' });
  guidesStep(f, currentBodyDraft());
  return f.sheet;
}

const GUIDES = [['s', 'Schultern'], ['h', 'Hüfte'], ['a', 'Knöchel']];

function guidesStep(f, draft) {
  const g = { s: 0.2, h: 0.5, a: 0.93, floor: 0.98, cx: 0.5, w: 0.42, ...draft.guides };
  const el = h(`<div class="scan-guides">
    <p class="scan-guides-hint">Zieh die Linien auf Schultern, Hüfte und Knöchel. Danach richtet sich, wo die Kleidung sitzt.</p>
    <div class="scan-guides-wrap studio no-sheet-drag">
      <div class="scan-guides-stage">
        <img class="scan-guides-img" src="${draft.src}" alt="Dein Foto" draggable="false">
        <div class="scan-guides-box" aria-hidden="true"></div>
        ${GUIDES.map(([k, l]) => `<div class="scan-guide" data-k="${k}" role="slider" aria-label="${l}" tabindex="0" aria-valuemin="0" aria-valuemax="100">
          <span class="scan-guide-line"></span><span class="scan-guide-label">${l}</span><span class="scan-guide-knob"></span></div>`).join('')}
        <div class="scan-loupe" aria-hidden="true"><i></i></div>
      </div>
    </div>
    <div class="scan-width">
      <div class="scan-width-head"><span>Körperbreite</span><span class="scan-width-hint">Rahmen um Schultern und Arme</span></div>
      <div class="slider-row">${I.minus}<input type="range" class="slider scan-width-slider" min="0.15" max="0.95" step="0.005" value="${g.w}" aria-label="Körperbreite">${I.plus}</div>
    </div>
  </div>`);
  const save = async (s) => {
    if (f.savingGuides) return;
    f.savingGuides = true;
    s.setTrailingEnabled(false);
    try {
      if (g.floor < g.a) g.floor = Math.min(1, g.a + 0.04);
      await setBody({ w: draft.w, h: draft.h, guides: g, cutout: draft.cutout !== false }, draft.blob || null); // Ereignis 'body'
      haptic('success');
      await s.close('done');
      go('spiegel');
      toast(draft.blob ? 'Foto gesichert' : 'Hilfslinien gesichert', { icon: I.checkCircleFill });
    } catch (err) {
      console.error(err);
      f.savingGuides = false;
      s.setTrailingEnabled(true);
      toast('Sichern hat nicht geklappt', { icon: I.warning });
    }
  };
  f.show(el, {
    title: 'Hilfslinien',
    leading: draft.fresh ? { label: 'Zurück', onTap: () => bodyIntro(f, { back: true }) } : { label: 'Abbrechen' },
    trailing: { label: 'Fertig', bold: true, onTap: save }
  });

  const wrap = el.querySelector('.scan-guides-wrap');
  const stage = el.querySelector('.scan-guides-stage');
  const box = el.querySelector('.scan-guides-box');
  const loupe = el.querySelector('.scan-loupe');
  const slider = el.querySelector('.scan-width-slider');
  const ratio = draft.w / draft.h;

  const fit = () => {
    const pad = 14;
    let H = wrap.clientHeight - pad * 2, W = H * ratio;
    const maxW = wrap.clientWidth - 92; // Platz für Etiketten und Griffe
    if (W > maxW) { W = maxW; H = W / ratio; }
    stage.style.width = Math.max(0, W) + 'px';
    stage.style.height = Math.max(0, H) + 'px';
  };
  const place = () => {
    for (const n of stage.querySelectorAll('.scan-guide')) {
      n.style.top = g[n.dataset.k] * 100 + '%';
      n.setAttribute('aria-valuenow', String(Math.round(g[n.dataset.k] * 100)));
    }
    box.style.top = g.s * 100 + '%';
    box.style.height = (g.h - g.s) * 100 + '%';
    box.style.left = (g.cx - g.w / 2) * 100 + '%';
    box.style.width = g.w * 100 + '%';
  };
  fit();
  place();
  const ro = new ResizeObserver(fit);
  ro.observe(wrap);
  f.sheet.closed.then(() => ro.disconnect());

  slider.addEventListener('input', () => { g.w = +slider.value; place(); });

  const bounds = (k) => (k === 's' ? [0.02, g.h - 0.05] : k === 'h' ? [g.s + 0.05, g.a - 0.05] : [g.h + 0.05, 0.995]);
  const LOUPE = 84, ZOOM = 2.4;
  const showLoupe = (k) => {
    const W = stage.clientWidth, H = stage.clientHeight;
    const y = g[k] * H, x = g.cx * W;
    const lx = clamp(x - LOUPE / 2, -8, W - LOUPE + 8);
    const ly = y - LOUPE - 26 < -10 ? y + 30 : y - LOUPE - 26;
    loupe.style.transform = `translate(${lx}px, ${ly}px)`;
    loupe.style.backgroundImage = `url("${draft.src}")`;
    loupe.style.backgroundSize = `${W * ZOOM}px ${H * ZOOM}px`;
    loupe.style.backgroundPosition = `${LOUPE / 2 - x * ZOOM}px ${LOUPE / 2 - y * ZOOM}px`;
  };

  stage.querySelectorAll('.scan-guide').forEach((n) => {
    const k = n.dataset.k;
    n.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      try { n.setPointerCapture(e.pointerId); } catch { /* egal */ }
      const rect = stage.getBoundingClientRect();
      const offset = e.clientY - (rect.top + g[k] * rect.height); // kein Springen beim Greifen
      haptic('selection');
      n.classList.add('is-dragging');
      stage.classList.add('is-dragging');
      showLoupe(k);
      loupe.classList.add('is-visible');
      let edge = false;
      const move = (ev) => {
        const r = stage.getBoundingClientRect();
        const [lo, hi] = bounds(k);
        const y = (ev.clientY - offset - r.top) / r.height;
        const v = clamp(y, lo, hi);
        const atEdge = v !== y;
        if (atEdge && !edge) haptic('light');
        edge = atEdge;
        g[k] = v;
        place();
        showLoupe(k);
      };
      const up = () => {
        n.removeEventListener('pointermove', move);
        n.removeEventListener('pointerup', up);
        n.removeEventListener('pointercancel', up);
        n.classList.remove('is-dragging');
        stage.classList.remove('is-dragging');
        loupe.classList.remove('is-visible');
      };
      n.addEventListener('pointermove', move);
      n.addEventListener('pointerup', up);
      n.addEventListener('pointercancel', up);
    });
    n.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowUp' ? -0.005 : e.key === 'ArrowDown' ? 0.005 : 0;
      if (!d) return;
      e.preventDefault();
      const [lo, hi] = bounds(k);
      g[k] = clamp(g[k] + d, lo, hi);
      place();
    });
  });
  if (!reduced()) {
    stage.querySelectorAll('.scan-guide').forEach((n, i) =>
      springAnimate(n, [{ opacity: 0, transform: 'translateY(-50%) scaleX(.6)' }, { opacity: 1, transform: 'translateY(-50%)' }], { spring: 'smooth', delay: 180 + i * 70, fill: 'backwards' }));
  }
}

register('openScan', openScan);
register('openBodySetup', openBodySetup);
register('openGuides', openGuides);

export default { id: 'scan' };
