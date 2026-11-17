// Willkommen / Onboarding (bildschirmfüllend über der App) + dezenter Installations-Hinweis.
import './onboarding.css';
import { S, on, once, setSetting, isStandalone, persistSettings } from '../app/state.js';
import { register, run } from '../app/actions.js';
import { h, haptic, springAnimate, sheet, overlayOpen, prefersReducedMotion, wait } from '../ui/ui.js';
import { I } from '../ui/icons.js';

const ICON_SRC = `${import.meta.env.BASE_URL}icons/apple-touch-icon.png`;
// „Zum Home-Bildschirm“-Symbol (Quadrat mit Plus) im Stil von SF Symbols
const addSquare = '<svg class="ic" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.8" y="3.8" width="16.4" height="16.4" rx="4.2"/><path d="M12 8.2v7.6M8.2 12h7.6"/></svg>';

function stepsHTML() {
  return `<ol class="onb-steps">
    <li><span class="onb-step-num">1</span><span class="onb-step-text">Tippe unten in Safari auf <b>Teilen</b></span><span class="onb-step-icon">${I.share}</span></li>
    <li><span class="onb-step-num">2</span><span class="onb-step-text">Wähle <b>Zum Home‑Bildschirm</b></span><span class="onb-step-icon">${addSquare}</span></li>
    <li><span class="onb-step-num">3</span><span class="onb-step-text">Bestätige oben rechts mit <b>Hinzufügen</b></span><span class="onb-step-icon">${I.check}</span></li>
  </ol>`;
}

// Illustration: Figur auf Studio-Grund mit Hilfslinien
const figureSVG = () => `<svg class="onb-figure" viewBox="0 0 200 260" aria-hidden="true">
  <defs><radialGradient id="onb-floor" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#000" stop-opacity=".22"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>
  <ellipse cx="100" cy="246" rx="44" ry="6" fill="url(#onb-floor)"/>
  <g class="onb-figure-body">
    <ellipse cx="100" cy="30" rx="13" ry="16"/>
    <path d="M95 44h10l1.4 12h-12.8z"/>
    <path d="M78 64c3-6 12-8 22-8s19 2 22 8l4 34c.6 4.4-.6 9.4-1.8 13.6l-2.4 9c-1.2 6-2.4 18-1.8 25.4l.6 15H81.4l.6-15c.6-7.4-.6-19.4-1.8-25.4l-2.4-9C76.6 107.4 75.4 102.4 76 98z"/>
    <path d="M78 64.6c-5.4 1.8-7.8 6.6-8.4 12.6l-2.4 45c-.6 12 0 24 1.8 35.4l2.4 12c.6 3 4.8 3 5.4-.6l-.6-12.6c-.6-9 0-22.2 1.2-33.6l3-36z"/>
    <path d="M122 64.6c5.4 1.8 7.8 6.6 8.4 12.6l2.4 45c.6 12 0 24-1.8 35.4l-2.4 12c-.6 3-4.8 3-5.4-.6l.6-12.6c.6-9 0-22.2-1.2-33.6l-3-36z"/>
    <path d="M82 158h17l-1.6 82c0 2.4-1.8 4-4 4h-5.4c-2.4 0-4-1.6-4-4zM101 158h17l-2 82c0 2.4-1.6 4-4 4h-5.4c-2.2 0-4-1.6-4-4z"/>
  </g>
  <g class="onb-guides">
    <g class="onb-guide" style="--d:0"><line x1="30" x2="170" y1="62" y2="62"/><circle cx="170" cy="62" r="5"/></g>
    <g class="onb-guide" style="--d:1"><line x1="30" x2="170" y1="132" y2="132"/><circle cx="170" cy="132" r="5"/></g>
    <g class="onb-guide" style="--d:2"><line x1="30" x2="170" y1="236" y2="236"/><circle cx="170" cy="236" r="5"/></g>
  </g>
</svg>`;

// =====================================================================
// Onboarding
// =====================================================================
let active = null;

function openOnboarding(opts = {}) {
  if (active) return active.api;
  const withInstall = !isStandalone();
  const pages = ['welcome', 'photo', ...(withInstall ? ['home'] : [])];
  const root = h(`<div class="onb" role="dialog" aria-modal="true" aria-label="Willkommen">
    <div class="onb-track">
      <section class="onb-page" data-page="welcome">
        <div class="onb-scroll">
          <img class="onb-appicon onb-in" src="${ICON_SRC}" alt="" style="--i:0">
          <h1 class="onb-title onb-in" style="--i:1">Willkommen bei<br><span class="onb-title-accent">Kleiderschrank</span></h1>
          <div class="onb-features">
            <div class="feature-row onb-in" style="--i:2"><span class="feature-icon">${I.camera}</span><div><div class="feature-title">Kleidung scannen</div><div class="feature-text">Fotografier ein Teil – die App schneidet es direkt auf dem iPhone aus.</div></div></div>
            <div class="feature-row onb-in" style="--i:3"><span class="feature-icon">${I.mirror}</span><div><div class="feature-title">Anprobieren</div><div class="feature-text">Wisch durch deine Teile und sieh sie an deinem eigenen Foto.</div></div></div>
            <div class="feature-row onb-in" style="--i:4"><span class="feature-icon">${I.calendar}</span><div><div class="feature-title">Outfits planen</div><div class="feature-text">Sichere Lieblings-Kombis und leg fest, wann du sie tragen willst.</div></div></div>
          </div>
        </div>
        <div class="onb-foot">
          <p class="onb-privacy onb-in" style="--i:5"><span class="onb-privacy-icon">${I.lockIphone || I.lock}</span><span>Alles bleibt auf deinem iPhone. Kein Konto, keine Cloud.</span></p>
          <button type="button" class="btn btn-filled btn-large btn-block onb-in" style="--i:6" data-act="next">Weiter</button>
        </div>
      </section>

      <section class="onb-page" data-page="photo">
        <div class="onb-scroll">
          <div class="onb-illu">${figureSVG()}</div>
          <h1 class="onb-title is-small">Dein Foto</h1>
          <p class="onb-lead">Mit einem Ganzkörperfoto siehst du jedes Outfit direkt an dir. Stell dich vor eine ruhige Wand – ganz im Bild, Arme leicht vom Körper.</p>
        </div>
        <div class="onb-foot">
          <button type="button" class="btn btn-filled btn-large btn-block" data-act="photo">${I.camera}<span>Foto hinzufügen</span></button>
          <button type="button" class="btn btn-plain btn-block onb-later" data-act="later">Später</button>
        </div>
      </section>

      ${withInstall ? `<section class="onb-page" data-page="home">
        <div class="onb-scroll">
          <div class="onb-symbol">${I.iphone}<span class="onb-symbol-badge">${addSquare}</span></div>
          <h1 class="onb-title is-small">Zum Home‑Bildschirm</h1>
          <p class="onb-lead">Leg Kleiderschrank als App auf deinen Home-Bildschirm. So bleiben deine Daten dauerhaft erhalten.</p>
          ${stepsHTML()}
        </div>
        <div class="onb-foot">
          <button type="button" class="btn btn-filled btn-large btn-block" data-act="done">Fertig</button>
        </div>
      </section>` : ''}
    </div>
    <div class="onb-dots" aria-hidden="true">${pages.map((_, i) => `<i class="${i === 0 ? 'is-on' : ''}"></i>`).join('')}</div>
    <button type="button" class="onb-back" data-act="back" aria-label="Zurück" hidden>${I.chevronLeft}</button>
  </div>`);

  document.body.appendChild(root);
  const app = document.getElementById('app');
  if (app) app.inert = true;
  document.documentElement.classList.add('onb-open');
  let index = 0;
  const track = root.querySelector('.onb-track');
  const dots = [...root.querySelectorAll('.onb-dots i')];
  const back = root.querySelector('.onb-back');

  // Einblenden
  springAnimate(root, [{ opacity: 0 }, { opacity: 1 }], { spring: 'smooth' });
  if (!prefersReducedMotion()) {
    root.querySelectorAll('[data-page="welcome"] .onb-in').forEach((el) => {
      const i = +el.style.getPropertyValue('--i');
      springAnimate(el, [{ opacity: 0, transform: 'translateY(26px) scale(.96)' }, { opacity: 1, transform: 'none' }],
        { spring: 'bouncy', delay: 180 + i * 90, fill: 'backwards' });
    });
  }

  function goTo(i) {
    const from = index;
    index = Math.max(0, Math.min(pages.length - 1, i));
    if (from === index) return;
    const x0 = `translateX(${-from * 100}%)`, x1 = `translateX(${-index * 100}%)`;
    track.style.transform = x1;
    springAnimate(track, [{ transform: x0 }, { transform: x1 }], { spring: 'smooth' });
    dots.forEach((d, j) => d.classList.toggle('is-on', j === index));
    back.hidden = index === 0;
    root.querySelectorAll('.onb-page').forEach((p, j) => { p.inert = j !== index; });
    const page = root.querySelectorAll('.onb-page')[index];
    if (!prefersReducedMotion()) {
      [...page.querySelectorAll('.onb-scroll > *')].forEach((el, k) =>
        springAnimate(el, [{ opacity: 0, transform: `translateX(${index > from ? 40 : -40}px)` }, { opacity: 1, transform: 'none' }],
          { spring: 'smooth', delay: 60 + k * 50, fill: 'backwards' }));
    }
    if (pages[index] === 'photo') root.querySelector('.onb-illu')?.classList.add('is-live');
  }
  root.querySelectorAll('.onb-page').forEach((p, j) => { p.inert = j !== 0; });

  async function finish() {
    if (!active) return;
    setSetting('onboarded', true);
    S.settings.installHintAt = Date.now(); // Installations-Hinweis heute nicht zusätzlich zeigen
    persistSettings();
    haptic('success');
    const a = root.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.04)' }],
      { duration: prefersReducedMotion() ? 160 : 380, easing: 'cubic-bezier(.32,.72,0,1)', fill: 'forwards' });
    if (app) app.inert = false;
    document.documentElement.classList.remove('onb-open');
    const done = active;
    active = null;
    await a.finished.catch(() => {});
    root.remove();
    done.resolve();
  }
  const next = () => { if (index < pages.length - 1) goTo(index + 1); else finish(); };

  root.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'next') next();
    else if (act === 'back') goTo(index - 1);
    else if (act === 'later') next();
    else if (act === 'done') finish();
    else if (act === 'photo') {
      // Nach erfolgreichem Foto weiter (bzw. abschließen); Abbrechen lässt die Seite stehen.
      let got = false;
      const off = once('body', () => { got = true; setTimeout(() => active && next(), 450); });
      const r = await run('openBodySetup');
      r?.closed?.then(() => setTimeout(() => { if (!got) off(); }, 1500));
    }
  });
  // Wischen zwischen den Seiten
  let sx = null, sy = 0;
  root.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  root.addEventListener('touchend', (e) => {
    if (sx == null || overlayOpen()) return;
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    sx = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0 && pages[index] === 'welcome') next();
    else if (dx > 0) goTo(index - 1);
  }, { passive: true });

  let resolve;
  const closed = new Promise((r) => (resolve = r));
  const api = { el: root, closed, finish, goTo };
  active = { api, resolve, replay: !!opts.replay };
  return api;
}
register('openOnboarding', openOnboarding);

// =====================================================================
// Installations-Hinweis (Safari-Tab, nicht standalone)
// =====================================================================
function showInstallHelp() {
  const content = h(`<div class="onb-help">
    <div class="onb-symbol is-small">${I.iphone}<span class="onb-symbol-badge">${addSquare}</span></div>
    <p class="onb-lead">Als App auf dem Home-Bildschirm bleiben deine Teile und Outfits dauerhaft erhalten – im normalen Safari-Tab kann iOS Daten nach längerer Pause löschen.</p>
    ${stepsHTML()}
    <button type="button" class="btn btn-plain btn-block onb-help-hide" data-act="hide">Nicht mehr erinnern</button>
  </div>`);
  const s = sheet({
    title: 'Als App sichern',
    detent: 'medium',
    className: 'onb-help-sheet',
    trailing: { label: 'Fertig', bold: true, onTap: (sh) => sh.close('done') },
    content
  });
  content.querySelector('[data-act="hide"]').addEventListener('click', () => {
    S.settings.hideInstall = true;
    persistSettings();
    hideCard();
    s.close('done');
  });
  return s;
}
register('showInstallHelp', showInstallHelp);

let card = null;
function hideCard() {
  if (!card) return;
  const c = card;
  card = null;
  c.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(16px) scale(.96)' }], { duration: 220, easing: 'ease-in', fill: 'forwards' })
    .finished.catch(() => {}).then(() => c.remove());
}
function showInstallCard({ force = false } = {}) {
  if (card || active) return;
  if (!force && (isStandalone() || S.settings.hideInstall || !S.settings.onboarded)) return;
  // In der Anprobe läge die Karte über der Auswahlleiste: erst beim nächsten Wechsel in Schrank/Outfits zeigen
  if (!force && S.tab === 'spiegel') {
    const off = on('tab', ({ tab }) => { if (tab !== 'spiegel') { off(); setTimeout(() => { if (!overlayOpen()) showInstallCard(); }, 600); } });
    return;
  }
  card = h(`<div class="onb-card glass" role="status">
    <button type="button" class="onb-card-main" data-act="how">
      <span class="onb-card-icon">${I.share}</span>
      <span class="onb-card-body"><span class="onb-card-title">Als App sichern</span><span class="onb-card-text">Teilen › Zum Home-Bildschirm</span></span>
      <span class="onb-card-chevron">${I.chevronRight}</span>
    </button>
    <button type="button" class="onb-card-close" data-act="close" aria-label="Ausblenden">${I.close}</button>
  </div>`);
  document.body.appendChild(card);
  springAnimate(card, [{ opacity: 0, transform: 'translateY(24px) scale(.94)' }, { opacity: 1, transform: 'none' }], { spring: 'bouncy', fill: 'backwards' });
  card.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'how') { hideCard(); showInstallHelp(); }
    else if (act === 'close') { hideCard(); }
  });
  S.settings.installHintAt = Date.now();
  persistSettings();
  setTimeout(hideCard, 9000);
}
register('showInstallHint', (o) => showInstallCard({ force: true, ...o }));

export default {
  id: 'onboarding',
  init() {
    on('tab', ({ tab }) => { if (tab === 'spiegel') hideCard(); });
    // Einmal beim Start, frühestens nach dem Onboarding, höchstens alle 3 Tage, nicht über offenen Sheets.
    (async () => {
      await wait(2600);
      if (active || overlayOpen() || !S.settings.onboarded || new URLSearchParams(location.search).has('onboarding')) return;
      const last = +S.settings.installHintAt || 0;
      if (Date.now() - last < 3 * 864e5) return;
      showInstallCard();
    })();
  }
};
