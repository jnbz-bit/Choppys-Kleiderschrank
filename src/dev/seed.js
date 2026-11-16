// Demo-Daten zum Testen: ?demo=1 füllt eine LEERE Datenbank mit gezeichneten, freigestellten Beispielteilen
// und 3 Outfits. ?demo=body legt zusätzlich eine gezeichnete Figur als Ganzkörperfoto an (Warp testbar).
// Nur für Entwicklung/Screenshots – wird im normalen Betrieb nie geladen.

import { loadState, saveItems, saveOutfits, saveBody, saveSettings, saveImage } from '../db.js';
import { trimCanvas, toBlob, estimateGuides } from '../imaging.js';
import { uid } from '../model.js';

// ---------------------------------------------------------------------
// Zeichen-Helfer
// ---------------------------------------------------------------------
function cv(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function shadeHex(hex, amt) { // amt -1..1 (dunkler/heller)
  const [r, g, b] = hex2rgb(hex);
  const f = (v) => Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
const rgba = (hex, a) => { const [r, g, b] = hex2rgb(hex); return `rgba(${r},${g},${b},${a})`; };

/** Pseudo-Zufall (stabil) */
function rng(seed = 1) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/**
 * Füllt einen Pfad mit Stoff-Anmutung: Grundfarbe, Volumen (Seiten dunkler, Mitte heller),
 * Licht von oben, weiche Falten, feines Rauschen, zarte Kontur.
 */
function fabric(ctx, path, base, o = {}) {
  const { x = 0, y = 0, w = ctx.canvas.width, h = ctx.canvas.height } = o.box || {};
  ctx.save();
  ctx.fillStyle = base;
  ctx.fill(path);
  ctx.clip(path);
  // Volumen quer
  const gx = ctx.createLinearGradient(x, 0, x + w, 0);
  gx.addColorStop(0, 'rgba(0,0,0,.22)');
  gx.addColorStop(0.18, 'rgba(0,0,0,.04)');
  gx.addColorStop(0.5, 'rgba(255,255,255,.07)');
  gx.addColorStop(0.82, 'rgba(0,0,0,.05)');
  gx.addColorStop(1, 'rgba(0,0,0,.24)');
  ctx.fillStyle = gx;
  ctx.fillRect(x, y, w, h);
  // Licht von oben
  const gy = ctx.createLinearGradient(0, y, 0, y + h);
  gy.addColorStop(0, 'rgba(255,255,255,.10)');
  gy.addColorStop(0.6, 'rgba(0,0,0,0)');
  gy.addColorStop(1, 'rgba(0,0,0,.12)');
  ctx.fillStyle = gy;
  ctx.fillRect(x, y, w, h);
  if (o.pattern) o.pattern(ctx);
  // Falten
  const r = rng(o.seed || 7);
  ctx.filter = 'blur(14px)';
  for (let i = 0; i < (o.folds ?? 5); i++) {
    const fx = x + w * (0.2 + r() * 0.6), fy = y + h * (0.25 + r() * 0.6);
    ctx.strokeStyle = r() > 0.5 ? 'rgba(0,0,0,.06)' : 'rgba(255,255,255,.10)';
    ctx.lineWidth = 10 + r() * 14;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.quadraticCurveTo(fx + (r() - 0.5) * 80, fy + h * 0.12, fx + (r() - 0.5) * 60, fy + h * 0.25);
    ctx.stroke();
  }
  ctx.filter = 'none';
  // Rauschen
  const n = o.noise ?? 0.05;
  if (n) {
    for (let i = 0; i < (w * h) / 40; i++) {
      ctx.fillStyle = r() > 0.5 ? `rgba(255,255,255,${n})` : `rgba(0,0,0,${n})`;
      ctx.fillRect(x + r() * w, y + r() * h, 1.6, 1.6);
    }
  }
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = shadeHex(o.hex || '#888888', -0.35);
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 2;
  ctx.stroke(path);
  ctx.restore();
}
function stitch(ctx, draw, color = 'rgba(0,0,0,.25)', width = 2, dash = [7, 6]) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.lineCap = 'round';
  ctx.beginPath();
  draw(ctx);
  ctx.stroke();
  ctx.restore();
}
function line(ctx, draw, color, width = 3, blur = 0) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (blur) ctx.filter = `blur(${blur}px)`;
  ctx.beginPath();
  draw(ctx);
  ctx.stroke();
  ctx.restore();
}
const P = (d) => new Path2D(d);

// ---------------------------------------------------------------------
// Grundformen
// ---------------------------------------------------------------------
const TEE = 'M300 90 Q400 150 500 90 L612 122 L762 252 L690 345 L622 304 L628 722 Q400 748 172 722 L178 304 L110 345 L38 252 L188 122 Z';
const LONG = 'M305 80 Q400 138 495 80 L600 106 Q682 132 702 222 L782 690 L690 714 L630 336 L632 772 Q400 794 168 772 L170 336 L110 714 L18 690 L98 222 Q118 132 200 106 Z';

function drawTee(hex, { stripes = null, seed = 3 } = {}) {
  const [c, ctx] = cv(800, 780);
  const p = P(TEE);
  fabric(ctx, p, hex, { hex, seed, pattern: stripes });
  // Halsbündchen
  line(ctx, (g) => { g.moveTo(302, 94); g.quadraticCurveTo(400, 156, 498, 94); }, shadeHex(hex, -0.12), 14);
  line(ctx, (g) => { g.moveTo(302, 94); g.quadraticCurveTo(400, 156, 498, 94); }, 'rgba(255,255,255,.25)', 3);
  stitch(ctx, (g) => { g.moveTo(178, 700); g.quadraticCurveTo(400, 726, 624, 700); });
  stitch(ctx, (g) => { g.moveTo(52, 268); g.lineTo(118, 326); g.moveTo(748, 268); g.lineTo(684, 326); });
  return c;
}
function drawLong(hex, { stripes = null, collar = false, cuffs = true, knit = false, buttons = false, seed = 4 } = {}) {
  const [c, ctx] = cv(800, 820);
  const p = P(LONG);
  fabric(ctx, p, hex, { hex, seed, pattern: stripes || (knit ? (g) => {
    g.strokeStyle = 'rgba(0,0,0,.06)'; g.lineWidth = 2;
    for (let x = 0; x < 800; x += 9) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 820); g.stroke(); }
  } : null), noise: knit ? 0.07 : 0.04 });
  if (cuffs || knit) {
    const rib = (x0, y0, x1, y1, x2, y2, x3, y3) => {
      const q = new Path2D(`M${x0} ${y0} L${x1} ${y1} L${x2} ${y2} L${x3} ${y3} Z`);
      ctx.save(); ctx.fillStyle = shadeHex(hex, -0.1); ctx.fill(q); ctx.clip(q);
      ctx.strokeStyle = 'rgba(0,0,0,.14)'; ctx.lineWidth = 3;
      for (let x = 0; x < 800; x += 8) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 6, 820); ctx.stroke(); }
      ctx.restore();
    };
    rib(26, 650, 120, 676, 110, 714, 18, 690);
    rib(680, 676, 774, 650, 782, 690, 690, 714);
    if (knit) rib(170, 726, 630, 726, 632, 772, 168, 772);
  }
  line(ctx, (g) => { g.moveTo(306, 84); g.quadraticCurveTo(400, 144, 494, 84); }, shadeHex(hex, -0.14), knit ? 20 : 12);
  if (collar) {
    const L = P('M300 78 L404 168 L300 200 L248 112 Z'), R = P('M500 78 L396 168 L500 200 L552 112 Z');
    for (const q of [L, R]) fabric(ctx, q, shadeHex(hex, 0.12).replace('rgb', 'rgb'), { hex, folds: 0, noise: 0.03, box: { x: 240, y: 70, w: 320, h: 140 } });
  }
  if (buttons) {
    line(ctx, (g) => { g.moveTo(400, 166); g.lineTo(400, 770); }, 'rgba(0,0,0,.12)', 2);
    for (let y = 230; y < 760; y += 95) {
      ctx.save(); ctx.fillStyle = '#F7F7F2'; ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1;
      ctx.beginPath(); ctx.arc(412, y, 8, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }
  return c;
}
function drawCami(hex) {
  const [c, ctx] = cv(700, 760);
  line(ctx, (g) => { g.moveTo(262, 40); g.lineTo(250, 230); g.moveTo(438, 40); g.lineTo(450, 230); }, shadeHex(hex, -0.15), 9);
  const p = P('M232 210 Q300 250 350 236 Q400 250 468 210 L520 690 Q350 726 180 690 Z');
  fabric(ctx, p, hex, { hex, seed: 11, folds: 6 });
  // Satinglanz
  ctx.save(); ctx.clip(p); ctx.filter = 'blur(18px)';
  ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.beginPath(); ctx.ellipse(300, 420, 40, 210, 0.08, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  stitch(ctx, (g) => { g.moveTo(186, 670); g.quadraticCurveTo(350, 704, 514, 670); }, 'rgba(0,0,0,.18)');
  return c;
}
function drawJacket(hex, { denim = true } = {}) {
  const [c, ctx] = cv(820, 860);
  const body = P('M300 70 Q410 110 520 70 L628 100 Q712 128 730 220 L806 700 L712 726 L652 340 L652 800 L405 814 L168 800 L168 340 L108 726 L14 700 L90 220 Q108 128 192 100 Z');
  const thread = denim ? 'rgba(214,160,64,.85)' : 'rgba(0,0,0,.3)';
  fabric(ctx, body, hex, { hex, seed: 21, folds: 6, pattern: denim ? (g) => {
    g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 2;
    for (let i = -900; i < 900; i += 7) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 860, 860); g.stroke(); }
  } : null });
  // Knopfleiste und Bund
  stitch(ctx, (g) => { g.moveTo(388, 170); g.lineTo(388, 800); g.moveTo(422, 170); g.lineTo(422, 800); }, thread, 2.5);
  const band = P('M168 744 L390 752 L390 812 L168 800 Z M420 752 L652 744 L652 800 L420 812 Z');
  ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.10)'; ctx.fill(band); ctx.restore();
  stitch(ctx, (g) => { g.moveTo(170, 750); g.lineTo(388, 758); g.moveTo(424, 758); g.lineTo(650, 750); }, thread, 2.5);
  // Brusttaschen
  for (const [x0, dir] of [[220, 1], [460, 1]]) {
    const flap = P(`M${x0} 300 L${x0 + 130} 300 L${x0 + 130} 340 L${x0 + 65} 360 L${x0} 340 Z`);
    ctx.save(); ctx.fillStyle = shadeHex(hex, -0.08); ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3; ctx.fill(flap); ctx.restore();
    stitch(ctx, (g) => { g.moveTo(x0 + 8, 306); g.lineTo(x0 + 122, 306); g.lineTo(x0 + 122, 336); g.lineTo(x0 + 65, 352); g.lineTo(x0 + 8, 336); g.closePath(); }, thread, 2);
    stitch(ctx, (g) => { g.rect(x0 + 6, 300, 118, 130); }, thread, 2);
    void dir;
  }
  // Kragen
  const cl = P('M300 66 L400 150 L322 230 L230 104 Z'), cr = P('M520 66 L420 150 L498 230 L590 104 Z');
  for (const q of [cl, cr]) {
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4; ctx.fillStyle = shadeHex(hex, 0.04); ctx.fill(q); ctx.restore();
    fabric(ctx, q, shadeHex(hex, 0.04).startsWith('rgb') ? hex : hex, { hex, folds: 0, noise: 0.03, box: { x: 220, y: 60, w: 380, h: 180 } });
  }
  // Knöpfe
  const btn = denim ? ['#C9A04A', '#7A5A1F'] : ['#3A2A1E', '#1A120C'];
  for (const y of [260, 400, 540, 680]) {
    const g = ctx.createRadialGradient(400, y - 3, 1, 405, y, 13);
    g.addColorStop(0, btn[0]); g.addColorStop(1, btn[1]);
    ctx.save(); ctx.fillStyle = g; ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
    ctx.beginPath(); ctx.arc(405, y, 12, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  return c;
}
function drawCoat(hex) {
  const [c, ctx] = cv(820, 1080);
  const body = P('M300 70 Q410 104 520 70 L630 100 Q714 128 732 220 L806 860 L714 884 L656 340 L690 1040 Q410 1066 130 1040 L164 340 L106 884 L14 860 L88 220 Q106 128 190 100 Z');
  fabric(ctx, body, hex, { hex, seed: 31, folds: 7, noise: 0.05 });
  // Revers
  const rl = P('M300 70 L400 420 L300 300 L236 120 Z'), rr = P('M520 70 L400 420 L520 300 L584 120 Z');
  for (const q of [rl, rr]) {
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3; ctx.fillStyle = shadeHex(hex, -0.05); ctx.fill(q); ctx.restore();
  }
  line(ctx, (g) => { g.moveTo(400, 420); g.lineTo(420, 1050); }, 'rgba(0,0,0,.18)', 3);
  // Gürtel
  const belt = P('M160 560 Q410 584 660 560 L664 612 Q410 636 156 612 Z');
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3; ctx.fillStyle = shadeHex(hex, -0.06); ctx.fill(belt); ctx.restore();
  stitch(ctx, (g) => { g.moveTo(162, 568); g.quadraticCurveTo(410, 592, 660, 568); g.moveTo(160, 604); g.quadraticCurveTo(410, 628, 662, 604); }, 'rgba(0,0,0,.22)', 2);
  for (const [x, y] of [[350, 460], [470, 460], [350, 700], [470, 700], [350, 840], [470, 840]]) {
    ctx.save(); ctx.fillStyle = '#3B2A1C'; ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
    ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  return c;
}
function drawDress(hex, { dots = false, sleeveless = false } = {}) {
  const [c, ctx] = cv(760, 1100);
  const d = sleeveless
    ? 'M276 60 Q380 130 484 60 L520 70 Q512 180 540 260 Q520 380 494 440 Q600 760 700 1040 Q380 1090 60 1040 Q160 760 266 440 Q240 380 220 260 Q248 180 240 70 Z'
    : 'M290 60 Q380 120 470 60 L560 84 L660 190 L600 262 L548 222 Q530 340 498 440 Q600 760 700 1040 Q380 1090 60 1040 Q160 760 262 440 Q230 340 212 222 L160 262 L100 190 L200 84 Z';
  const p = P(d);
  fabric(ctx, p, hex, { hex, seed: dots ? 41 : 43, folds: 9, noise: dots ? 0.03 : 0.04, pattern: dots ? (g) => {
    const r = rng(5);
    g.fillStyle = 'rgba(255,250,240,.92)';
    for (let y = 30; y < 1100; y += 54) for (let x = (y / 54) % 2 ? 20 : 47; x < 760; x += 54) {
      g.beginPath(); g.arc(x + (r() - 0.5) * 6, y + (r() - 0.5) * 6, 7, 0, Math.PI * 2); g.fill();
    }
  } : null });
  // Rockfalten
  ctx.save(); ctx.clip(p); ctx.filter = 'blur(10px)';
  for (let i = 0; i < 7; i++) {
    const x = 210 + i * 56;
    ctx.strokeStyle = i % 2 ? 'rgba(0,0,0,.16)' : 'rgba(255,255,255,.12)';
    ctx.lineWidth = 18;
    ctx.beginPath(); ctx.moveTo(380 + (x - 380) * 0.4, 470); ctx.lineTo(380 + (x - 380) * 1.6, 1060); ctx.stroke();
  }
  ctx.restore();
  // Taillennaht
  stitch(ctx, (g) => { g.moveTo(266, 440); g.quadraticCurveTo(380, 458, 494, 440); }, 'rgba(0,0,0,.25)', 2);
  if (!sleeveless) line(ctx, (g) => { g.moveTo(292, 64); g.quadraticCurveTo(380, 126, 468, 64); }, shadeHex(hex, -0.15), 8);
  return c;
}
const JEANS = 'M130 40 L470 40 Q490 120 494 230 Q502 600 454 1060 L324 1060 Q314 700 300 400 Q286 700 276 1060 L146 1060 Q98 600 106 230 Q110 120 130 40 Z';
function drawPants(hex, { denim = true, shorts = false, seed = 51 } = {}) {
  const H = shorts ? 470 : 1100;
  const [c, ctx] = cv(600, H);
  const d = shorts
    ? 'M130 40 L470 40 Q490 120 500 230 L522 410 L332 430 Q318 350 300 300 Q282 350 268 430 L78 410 L100 230 Q110 120 130 40 Z'
    : denim ? JEANS : 'M126 40 L474 40 Q492 120 498 230 Q510 600 484 1060 L326 1060 Q314 700 300 400 Q286 700 274 1060 L116 1060 Q90 600 102 230 Q108 120 126 40 Z';
  const p = P(d);
  const thread = denim ? 'rgba(214,160,64,.9)' : 'rgba(255,255,255,.08)';
  fabric(ctx, p, hex, { hex, seed, folds: shorts ? 3 : 7, box: { x: 80, y: 40, w: 440, h: H - 40 }, pattern: denim ? (g) => {
    // Waschung: hellere Oberschenkel
    g.filter = 'blur(30px)'; g.fillStyle = 'rgba(255,255,255,.16)';
    g.beginPath(); g.ellipse(205, shorts ? 250 : 420, 50, shorts ? 80 : 190, 0, 0, Math.PI * 2); g.ellipse(395, shorts ? 250 : 420, 50, shorts ? 80 : 190, 0, 0, Math.PI * 2); g.fill();
    g.filter = 'none';
    g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 2;
    for (let i = -1100; i < 700; i += 7) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 1100, 1100); g.stroke(); }
  } : null });
  // Bund
  const band = P('M130 40 L470 40 L476 92 L124 92 Z');
  ctx.save(); ctx.clip(p); ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fill(band); ctx.restore();
  stitch(ctx, (g) => { g.moveTo(130, 86); g.lineTo(472, 86); }, thread, 2.4);
  if (denim) {
    stitch(ctx, (g) => { g.moveTo(312, 92); g.lineTo(312, 300); g.quadraticCurveTo(312, 330, 290, 344); }, thread, 2.4);
    stitch(ctx, (g) => { g.moveTo(140, 110); g.quadraticCurveTo(200, 130, 220, 92); g.moveTo(460, 110); g.quadraticCurveTo(400, 130, 380, 92); }, thread, 2.4);
    for (const x of [160, 300, 440]) { ctx.save(); ctx.fillStyle = shadeHex(hex, -0.12); ctx.fillRect(x - 7, 36, 14, 60); ctx.restore(); }
    ctx.save(); const g = ctx.createRadialGradient(298, 62, 1, 300, 64, 12); g.addColorStop(0, '#E8C878'); g.addColorStop(1, '#8C6A22');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(300, 64, 11, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    if (shorts) { // ausgefranster Saum
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2; const r = rng(9);
      for (let x = 84; x < 516; x += 4) { const y = x < 300 ? 410 + (x - 80) * 0.1 : 430 - (x - 330) * 0.11; if (x > 270 && x < 330) continue; ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + (r() - 0.5) * 4, y + 6 + r() * 8); ctx.stroke(); }
      ctx.restore();
    }
  } else {
    // Bügelfalte
    line(ctx, (g) => { g.moveTo(200, 110); g.lineTo(196, 1056); g.moveTo(400, 110); g.lineTo(404, 1056); }, 'rgba(255,255,255,.09)', 4, 1);
    line(ctx, (g) => { g.moveTo(300, 92); g.lineTo(300, 330); }, 'rgba(0,0,0,.35)', 2);
  }
  return c;
}
function drawSkirt(hex) {
  const [c, ctx] = cv(760, 820);
  const p = P('M220 40 L540 40 L548 100 Q640 420 720 780 Q380 820 40 780 Q120 420 212 100 Z');
  fabric(ctx, p, hex, { hex, seed: 61, folds: 0, box: { x: 40, y: 40, w: 680, h: 780 } });
  ctx.save(); ctx.clip(p);
  for (let i = 0; i <= 16; i++) {
    const xt = 212 + i * 21, xb = 40 + i * 42.5;
    const g = ctx.createLinearGradient(xb - 20, 0, xb + 20, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,.16)'); g.addColorStop(1, 'rgba(255,255,255,.08)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(xt - 6, 100); ctx.lineTo(xt + 6, 100); ctx.lineTo(xb + 20, 820); ctx.lineTo(xb - 20, 820); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = shadeHex(hex, -0.1); ctx.fillRect(200, 40, 360, 60);
  ctx.restore();
  stitch(ctx, (g) => { g.moveTo(216, 96); g.lineTo(546, 96); }, 'rgba(0,0,0,.2)', 2);
  return c;
}
function drawSocks(hex, { stripe = null } = {}) {
  const [c, ctx] = cv(640, 700);
  const sock = 'M120 40 L300 40 L300 420 Q300 470 350 480 L520 500 Q580 510 575 570 Q570 630 510 630 L250 630 Q130 630 120 520 Z';
  const one = (dx, dy, dark) => {
    ctx.save(); ctx.translate(dx, dy);
    const p = P(sock);
    fabric(ctx, p, dark ? shadeHex(hex, -0.08).replace(/rgb\((\d+),(\d+),(\d+)\)/, (_, r, g, b) => '#' + [r, g, b].map((v) => (+v).toString(16).padStart(2, '0')).join('')) : hex, { hex, seed: dark ? 71 : 72, folds: 2, noise: 0.06, pattern: (g) => {
      if (stripe) { g.fillStyle = stripe; for (let y = 120; y < 420; y += 56) g.fillRect(0, y, 640, 22); }
      g.fillStyle = 'rgba(0,0,0,.07)';
      g.beginPath(); g.ellipse(200, 560, 90, 70, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(540, 565, 50, 66, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.09)'; g.lineWidth = 3;
      for (let x = 126; x < 300; x += 9) { g.beginPath(); g.moveTo(x, 40); g.lineTo(x, 110); g.stroke(); }
    } });
    ctx.restore();
  };
  one(70, 30, true);
  one(0, 0, false);
  return c;
}
function drawShoes(kind) {
  const [c, ctx] = cv(980, 560);
  const one = (dx, dy, back) => {
    ctx.save(); ctx.translate(dx, dy);
    if (back) ctx.filter = 'brightness(.88)';
    if (kind === 'sneaker') {
      const up = P('M90 330 L92 210 Q100 156 152 150 L330 166 Q380 124 432 166 L560 236 Q700 262 784 304 Q834 332 824 364 L90 364 Z');
      fabric(ctx, up, '#F5F4EF', { hex: '#F5F4EF', seed: 81, folds: 2, noise: 0.03, box: { x: 80, y: 120, w: 760, h: 250 } });
      const panel = P('M250 360 Q330 250 520 250 Q640 260 700 300 Q600 300 520 320 Q420 340 360 362 Z');
      ctx.save(); ctx.fillStyle = 'rgba(30,40,60,.10)'; ctx.fill(panel); ctx.restore();
      for (let i = 0; i < 5; i++) line(ctx, (g) => { g.moveTo(352 + i * 38, 178 + i * 14); g.lineTo(392 + i * 38, 168 + i * 14); }, '#D9D6CC', 6);
      const sole = P('M78 352 L834 352 Q850 352 846 380 Q840 412 800 414 L104 414 Q74 414 72 384 Z');
      ctx.save(); ctx.fillStyle = '#C9A57A'; ctx.fill(sole); ctx.clip(sole); ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(60, 350, 800, 20);
      ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(60, 404, 800, 12); ctx.restore();
    } else if (kind === 'boot') {
      const up = P('M120 410 L132 86 Q140 52 182 52 L392 52 Q424 52 426 86 L434 262 Q452 302 560 320 L760 352 Q832 366 832 412 L832 420 L116 420 Z');
      fabric(ctx, up, '#26221F', { hex: '#26221F', seed: 82, folds: 3, noise: 0.02, box: { x: 110, y: 50, w: 730, h: 380 } });
      ctx.save(); ctx.clip(up); ctx.filter = 'blur(14px)'; ctx.fillStyle = 'rgba(255,255,255,.18)';
      ctx.beginPath(); ctx.ellipse(650, 350, 120, 18, -0.1, 0, Math.PI * 2); ctx.ellipse(250, 160, 18, 90, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      const gus = P('M300 54 L380 54 L366 250 Q340 270 314 250 Z');
      ctx.save(); ctx.fillStyle = '#121010'; ctx.fill(gus); ctx.clip(gus); ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 2;
      for (let y = 54; y < 260; y += 6) { ctx.beginPath(); ctx.moveTo(290, y); ctx.lineTo(390, y); ctx.stroke(); } ctx.restore();
      ctx.save(); ctx.fillStyle = '#5A4632'; ctx.fillRect(136, 20, 34, 60); ctx.restore();
      const sole = P('M112 414 L836 414 Q846 440 820 452 L300 452 L300 470 L118 470 Z');
      ctx.save(); ctx.fillStyle = '#141212'; ctx.fill(sole); ctx.restore();
      stitch(ctx, (g) => { g.moveTo(320, 410); g.lineTo(820, 410); }, 'rgba(255,255,255,.18)', 2);
    } else {
      const up = P('M104 380 Q92 300 152 290 L300 300 Q430 336 566 300 L722 318 Q836 338 846 400 L104 400 Z');
      fabric(ctx, up, '#D9B79A', { hex: '#D9B79A', seed: 83, folds: 1, noise: 0.03, box: { x: 90, y: 280, w: 760, h: 130 } });
      ctx.save(); ctx.clip(up); ctx.fillStyle = 'rgba(80,50,30,.35)';
      ctx.beginPath(); ctx.ellipse(430, 302, 140, 18, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      // Schleife
      ctx.save(); ctx.fillStyle = '#B98F6E'; ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
      ctx.beginPath(); ctx.ellipse(612, 316, 30, 14, -0.3, 0, Math.PI * 2); ctx.ellipse(660, 326, 30, 14, 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#A57C5C'; ctx.beginPath(); ctx.arc(636, 320, 9, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      const sole = P('M98 396 L850 396 Q856 420 830 428 L116 428 Q94 422 98 396 Z');
      ctx.save(); ctx.fillStyle = '#7A5A44'; ctx.fill(sole); ctx.restore();
    }
    ctx.restore();
  };
  one(90, -40, true);
  one(0, 60, false);
  return c;
}
function metalGrad(ctx, x0, y0, x1, y1, metal) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  const stops = metal === 'gold'
    ? ['#8C6A1C', '#F5DC8A', '#C9A23F', '#FFF1BB', '#A57B20']
    : ['#7E7E86', '#F4F4F8', '#A7A7B0', '#FFFFFF', '#8A8A93'];
  stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
  return g;
}
function drawNecklace(metal) {
  const [c, ctx] = cv(640, 700);
  const pt = (t) => { // U-Kurve
    const x = 320 + Math.sin((t - 0.5) * Math.PI * 0.98) * 230;
    const y = 40 + Math.cos((t - 0.5) * Math.PI * 0.98) * 470;
    return [x, y];
  };
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
  const N = metal === 'gold' ? 110 : 160;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const [x, y] = pt(t), [x2, y2] = pt(Math.min(1, t + 0.002));
    const a = Math.atan2(y2 - y, x2 - x);
    ctx.save(); ctx.translate(x, y); ctx.rotate(a + (i % 2 ? Math.PI / 2 : 0) * (metal === 'gold' ? 0.4 : 0));
    ctx.strokeStyle = metalGrad(ctx, -8, -8, 8, 8, metal);
    ctx.lineWidth = metal === 'gold' ? 4 : 3;
    ctx.beginPath(); ctx.ellipse(0, 0, metal === 'gold' ? 9 : 6, metal === 'gold' ? 5 : 3.2, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  const [px, py] = pt(0.5);
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
  if (metal === 'gold') {
    ctx.fillStyle = metalGrad(ctx, px - 40, py, px + 40, py + 90, 'gold');
    ctx.beginPath(); ctx.arc(px, py + 48, 38, 0, Math.PI * 2); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(120,85,20,.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py + 48, 30, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.ellipse(px - 12, py + 34, 10, 5, -0.6, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = metalGrad(ctx, px - 20, py, px + 20, py + 70, 'silber');
    ctx.beginPath(); ctx.moveTo(px, py + 8); ctx.quadraticCurveTo(px + 26, py + 50, px, py + 76); ctx.quadraticCurveTo(px - 26, py + 50, px, py + 8); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.beginPath(); ctx.ellipse(px - 6, py + 40, 4, 10, 0.2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  return c;
}
function drawHoops() {
  const [c, ctx] = cv(640, 380);
  for (const cx of [170, 470]) {
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.28)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;
    ctx.strokeStyle = metalGrad(ctx, cx - 120, 60, cx + 120, 320, 'gold');
    ctx.lineWidth = 20;
    ctx.beginPath(); ctx.arc(cx, 200, 120, -Math.PI * 0.42, Math.PI * 1.42); ctx.stroke();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(cx, 200, 124, Math.PI * 0.95, Math.PI * 1.25); ctx.stroke();
    ctx.restore();
  }
  return c;
}

// Figur für ?demo=body
function drawBody() {
  const [c, ctx] = cv(620, 1520);
  const skin = '#E3B497';
  const shadeSkin = (p, box) => fabric(ctx, p, skin, { hex: skin, folds: 0, noise: 0.015, box });
  // Haare hinten
  ctx.save(); ctx.fillStyle = '#3B2A22';
  ctx.beginPath(); ctx.ellipse(310, 150, 92, 112, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(220, 150); ctx.quadraticCurveTo(210, 330, 250, 380); ctx.lineTo(370, 380); ctx.quadraticCurveTo(410, 330, 400, 150); ctx.fill();
  ctx.restore();
  // Arme
  const armL = P('M178 318 Q140 330 132 400 L104 640 Q96 720 92 800 Q90 836 108 838 Q124 836 126 800 L150 640 L182 430 Z');
  const armR = P('M442 318 Q480 330 488 400 L516 640 Q524 720 528 800 Q530 836 512 838 Q496 836 494 800 L470 640 L438 430 Z');
  shadeSkin(armL, { x: 88, y: 310, w: 100, h: 530 });
  shadeSkin(armR, { x: 432, y: 310, w: 100, h: 530 });
  // Beine
  const legs = P('M196 760 Q186 900 206 1080 Q214 1240 222 1400 L282 1400 Q290 1200 300 1000 L310 900 L320 1000 Q330 1200 338 1400 L398 1400 Q406 1240 414 1080 Q434 900 424 760 Z');
  shadeSkin(legs, { x: 186, y: 760, w: 248, h: 640 });
  // Füße
  ctx.save(); ctx.fillStyle = shadeHex(skin, -0.06);
  ctx.beginPath(); ctx.ellipse(246, 1430, 36, 48, 0.25, 0, Math.PI * 2); ctx.ellipse(374, 1430, 36, 48, -0.25, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  // Rumpf
  const torso = P('M178 312 Q310 286 442 312 Q456 360 446 440 Q420 560 412 610 Q430 700 426 780 L194 780 Q190 700 208 610 Q200 560 174 440 Q164 360 178 312 Z');
  shadeSkin(torso, { x: 164, y: 290, w: 292, h: 490 });
  // Hals + Kopf
  shadeSkin(P('M282 210 L338 210 L344 312 L276 312 Z'), { x: 276, y: 210, w: 68, h: 102 });
  shadeSkin(P('M310 52 C370 52 392 100 390 160 C388 220 352 262 310 262 C268 262 232 220 230 160 C228 100 250 52 310 52 Z'), { x: 228, y: 52, w: 164, h: 210 });
  // Haare vorne
  ctx.save(); ctx.fillStyle = '#4A352B';
  ctx.beginPath(); ctx.moveTo(228, 160); ctx.quadraticCurveTo(230, 40, 320, 44); ctx.quadraticCurveTo(398, 50, 394, 160); ctx.quadraticCurveTo(360, 90, 300, 96); ctx.quadraticCurveTo(250, 104, 228, 160); ctx.fill(); ctx.restore();
  // Basics (anthrazit)
  const top = P('M180 318 Q310 300 440 318 Q450 380 440 470 Q310 490 180 470 Q170 380 180 318 Z');
  fabric(ctx, top, '#4A4A50', { hex: '#4A4A50', folds: 1, box: { x: 170, y: 300, w: 280, h: 190 } });
  const bottom = P('M206 640 Q310 628 414 640 L426 780 Q430 860 420 900 L322 900 L310 860 L298 900 L200 900 Q190 860 194 780 Z');
  fabric(ctx, bottom, '#4A4A50', { hex: '#4A4A50', folds: 1, box: { x: 190, y: 628, w: 240, h: 272 } });
  // Schuhe
  ctx.save(); ctx.fillStyle = '#EDEDED';
  ctx.beginPath(); ctx.ellipse(244, 1460, 40, 30, 0.2, 0, Math.PI * 2); ctx.ellipse(376, 1460, 40, 30, -0.2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  return c;
}

// ---------------------------------------------------------------------
// Katalog
// ---------------------------------------------------------------------
const stripes = (color, step = 46, h = 16) => (g) => { g.fillStyle = color; for (let y = 140; y < 820; y += step) g.fillRect(0, y, 820, h); };

export const DEMO_ITEMS = [
  { key: 'tee', cat: 'oberteil', name: 'Weißes T-Shirt', color: { hex: '#F2EFE8', name: 'Weiß' }, draw: () => drawTee('#F2EFE8') },
  { key: 'breton', cat: 'oberteil', name: 'Ringelshirt', color: { hex: '#F4F1EA', name: 'Weiß' }, draw: () => drawLong('#F4F1EA', { stripes: stripes('#1F2A4A') }) },
  { key: 'blouse', cat: 'oberteil', name: 'Hellblaue Bluse', color: { hex: '#B9D0EA', name: 'Hellblau' }, draw: () => drawLong('#B9D0EA', { collar: true, buttons: true, seed: 6 }) },
  { key: 'cami', cat: 'oberteil', name: 'Rosé Top', color: { hex: '#E8A6B6', name: 'Rosa' }, draw: () => drawCami('#E8A6B6') },
  { key: 'sweater', cat: 'oberteil', name: 'Beiger Pullover', color: { hex: '#D6C1A2', name: 'Beige' }, draw: () => drawLong('#D6C1A2', { knit: true, seed: 8 }) },
  { key: 'denimjacket', cat: 'jacke', name: 'Jeansjacke', color: { hex: '#5B7FA6', name: 'Jeansblau' }, draw: () => drawJacket('#5B7FA6') },
  { key: 'coat', cat: 'jacke', name: 'Camel Mantel', color: { hex: '#B98B5A', name: 'Camel' }, draw: () => drawCoat('#B98B5A') },
  { key: 'dotdress', cat: 'kleid', name: 'Rotes Sommerkleid', color: { hex: '#C2333D', name: 'Rot' }, draw: () => drawDress('#C2333D', { dots: true }) },
  { key: 'blackdress', cat: 'kleid', name: 'Schwarzes Kleid', color: { hex: '#232226', name: 'Schwarz' }, draw: () => drawDress('#232226', { sleeveless: true }) },
  { key: 'jeans', cat: 'hose', name: 'Blaue Jeans', color: { hex: '#46658E', name: 'Jeansblau' }, draw: () => drawPants('#46658E') },
  { key: 'trousers', cat: 'hose', name: 'Schwarze Hose', color: { hex: '#26262A', name: 'Schwarz' }, draw: () => drawPants('#26262A', { denim: false, seed: 52 }) },
  { key: 'skirt', cat: 'hose', name: 'Plisseerock', color: { hex: '#9DB29A', name: 'Mint' }, draw: () => drawSkirt('#9DB29A') },
  { key: 'shorts', cat: 'hose', name: 'Jeansshorts', color: { hex: '#8DADD0', name: 'Hellblau' }, draw: () => drawPants('#8DADD0', { shorts: true, seed: 53 }) },
  { key: 'socks', cat: 'socken', name: 'Weiße Socken', color: { hex: '#F1F1EE', name: 'Weiß' }, draw: () => drawSocks('#F1F1EE') },
  { key: 'stripesocks', cat: 'socken', name: 'Ringelsocken', color: { hex: '#E9D6A8', name: 'Creme' }, draw: () => drawSocks('#E9D6A8', { stripe: '#C2333D' }) },
  { key: 'sneaker', cat: 'schuhe', name: 'Weiße Sneaker', color: { hex: '#F5F4EF', name: 'Weiß' }, draw: () => drawShoes('sneaker') },
  { key: 'boots', cat: 'schuhe', name: 'Chelsea Boots', color: { hex: '#26221F', name: 'Schwarz' }, draw: () => drawShoes('boot') },
  { key: 'flats', cat: 'schuhe', name: 'Ballerinas', color: { hex: '#D9B79A', name: 'Beige' }, draw: () => drawShoes('flat') },
  { key: 'goldchain', cat: 'schmuck', metal: 'gold', name: 'Goldkette', color: { hex: '#D4AF37', name: 'Gold' }, draw: () => drawNecklace('gold') },
  { key: 'silverchain', cat: 'schmuck', metal: 'silber', name: 'Silberkette', color: { hex: '#C0C0C8', name: 'Silber' }, draw: () => drawNecklace('silber') },
  { key: 'hoops', cat: 'schmuck', metal: 'gold', name: 'Goldene Creolen', color: { hex: '#D4AF37', name: 'Gold' }, draw: () => drawHoops() }
];

/** Zeichnet ein Demo-Teil (getrimmt, transparent) – auch für die Galerie-Kontrollansicht. */
export function renderDemo(spec) {
  return trimCanvas(spec.draw(), 900, 0.02) || spec.draw();
}
export const renderDemoBody = () => trimCanvas(drawBody(), 1600, 0.03);

/** Füllt eine LEERE Datenbank. Gibt true zurück, wenn Daten angelegt wurden. */
export async function seedIfEmpty({ body = false } = {}) {
  const st = await loadState();
  if (st.items.length) {
    if (body && !st.body) await seedBody();
    return false;
  }
  const now = Date.now();
  const ids = {};
  const items = [];
  for (let i = 0; i < DEMO_ITEMS.length; i++) {
    const spec = DEMO_ITEMS[i];
    const canvas = renderDemo(spec);
    const blob = await toBlob(canvas, 'image/png');
    const id = uid();
    ids[spec.key] = id;
    await saveImage(id, blob);
    items.push({
      id, cat: spec.cat, name: spec.name, color: spec.color, metal: spec.cat === 'schmuck' ? spec.metal : null,
      w: canvas.width, h: canvas.height, created: now - (DEMO_ITEMS.length - i) * 3600e3, fit: null,
      fav: ['breton', 'dotdress', 'sneaker'].includes(spec.key)
    });
  }
  await saveItems(items);
  const outfits = [
    { name: 'Bürotag', sel: { oberteil: ids.blouse, hose: ids.trousers, schuhe: ids.flats, schmuck: ids.silverchain }, days: [0, 2] },
    { name: 'Wochenende', sel: { oberteil: ids.breton, hose: ids.jeans, schuhe: ids.sneaker, jacke: ids.denimjacket }, days: [5] },
    { name: 'Sommerabend', sel: { kleid: ids.dotdress, schuhe: ids.flats, schmuck: ids.hoops }, days: [] }
  ].map((o, i) => ({ id: uid(), ...o, created: now - (3 - i) * 600e3, sig: null }));
  await saveOutfits(outfits);
  const settings = (await loadState()).settings || {};
  await saveSettings({ ...settings, onboarded: true, sel: { oberteil: ids.tee, hose: ids.jeans, schuhe: ids.sneaker } });
  if (body) await seedBody();
  return true;
}

async function seedBody() {
  const canvas = renderDemoBody();
  const guides = estimateGuides(canvas);
  await saveImage('body', await toBlob(canvas, 'image/png'));
  await saveBody({ w: canvas.width, h: canvas.height, guides, cutout: true, updated: Date.now() });
}
