// Form-Anpassung: Kleidung folgt Zeile für Zeile der Körperform aus dem freigestellten Foto.
//
// Idee: Für jede Bildzeile kennen wir die Breite des Körpers (aus der Transparenz des Fotos)
// und die Breite des Kleidungsstücks. Jede Zeile des Kleidungsstücks wird so gestreckt
// oder gestaucht und verschoben, dass sie zur Körperbreite an dieser Höhe passt.
// Die Werte werden über mehrere Zeilen geglättet, damit keine Knicke entstehen.

import { placeItem } from './model.js';

const ALPHA = 110;

function readAlpha(img, maxH) {
  const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
  const s = Math.min(1, maxH / h0);
  const w = Math.max(1, Math.round(w0 * s)), h = Math.max(1, Math.round(h0 * s));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  return { w, h, s, d };
}

/** Liste der undurchsichtigen Abschnitte einer Zeile: [[x0, x1], …] */
function rowRuns(d, w, y, minLen = 2) {
  const runs = [];
  let start = -1;
  for (let x = 0; x < w; x++) {
    const on = d[(y * w + x) * 4 + 3] > ALPHA;
    if (on && start < 0) start = x;
    if ((!on || x === w - 1) && start >= 0) {
      const end = on ? x : x - 1;
      if (end - start + 1 >= minLen) runs.push([start, end + 1]);
      start = -1;
    }
  }
  return runs;
}

/**
 * Körperprofil. Pro Zeile (in Fotopixeln):
 *  core: Abschnitt, der die Körpermitte enthält (Rumpf, an den Schultern inkl. Arme)
 *  legs: alle Abschnitte zwischen den Hüftkanten (Beine, ohne seitlich hängende Arme)
 */
export function bodyProfile(img, guides) {
  const { w, h, s, d } = readAlpha(img, 900);
  const coreL = new Float32Array(h).fill(NaN), coreR = new Float32Array(h).fill(NaN);
  const legL = new Float32Array(h).fill(NaN), legR = new Float32Array(h).fill(NaN);
  let cx = guides.cx * w;
  const hipY = Math.round(guides.h * h);
  let hip = null;
  for (let y = 0; y < h; y++) {
    const runs = rowRuns(d, w, y, Math.max(2, w * 0.01));
    if (!runs.length) continue;
    let core = runs.find(([a, b]) => a <= cx && cx <= b);
    if (!core) {
      core = runs.reduce((best, r) => (Math.abs((r[0] + r[1]) / 2 - cx) < Math.abs((best[0] + best[1]) / 2 - cx) ? r : best));
      if (Math.abs((core[0] + core[1]) / 2 - cx) > w * 0.12) core = null;
    }
    if (core) {
      coreL[y] = core[0]; coreR[y] = core[1];
      cx = cx * 0.85 + ((core[0] + core[1]) / 2) * 0.15; // Mitte langsam nachführen
    }
  }
  // Hüftbreite: alle Abschnitte auf Hüfthöhe nahe der Mitte (bei getrennten Beinen beide Beine)
  {
    const c0 = guides.cx * w, half = guides.w * w * 0.36;
    const runs = rowRuns(d, w, Math.min(h - 1, hipY), Math.max(2, w * 0.01)).filter(([a, b]) => b > c0 - half && a < c0 + half);
    hip = runs.length ? [runs[0][0], runs[runs.length - 1][1]] : [c0 - half * 0.8, c0 + half * 0.8];
  }
  const pad = (hip[1] - hip[0]) * 0.06;
  for (let y = hipY; y < h; y++) {
    const runs = rowRuns(d, w, y, Math.max(2, w * 0.008)).filter(([a, b]) => b > hip[0] + pad && a < hip[1] - pad);
    if (!runs.length) continue;
    legL[y] = runs[0][0]; legR[y] = runs[runs.length - 1][1];
  }
  const k = 1 / s; // zurück in Fotopixel
  return { h, k, coreL, coreR, legL, legR };
}

/** Profil eines Kleidungsstücks (in Pixeln des Teils). */
export function garmentProfile(img) {
  const { w, h, s, d } = readAlpha(img, 700);
  // Schwerpunkt-Spalte als Mitte
  let sum = 0, n = 0;
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (d[(y * w + x) * 4 + 3] > ALPHA) { sum += x; n++; }
  const mid = n ? sum / n : w / 2;
  const extL = new Float32Array(h).fill(NaN), extR = new Float32Array(h).fill(NaN);
  const coreL = new Float32Array(h).fill(NaN), coreR = new Float32Array(h).fill(NaN);
  for (let y = 0; y < h; y++) {
    const runs = rowRuns(d, w, y, Math.max(2, w * 0.01));
    if (!runs.length) continue;
    extL[y] = runs[0][0]; extR[y] = runs[runs.length - 1][1];
    const core = runs.find(([a, b]) => a <= mid && mid <= b);
    if (core) { coreL[y] = core[0]; coreR[y] = core[1]; }
  }
  return { h, k: 1 / s, extL, extR, coreL, coreR };
}

// ---------- Hilfen ----------
function fillGaps(arr, fallback) {
  const n = arr.length;
  let last = NaN;
  const out = Float32Array.from(arr);
  for (let i = 0; i < n; i++) { if (!isNaN(out[i])) last = out[i]; else if (!isNaN(last)) out[i] = last; }
  last = NaN;
  for (let i = n - 1; i >= 0; i--) { if (!isNaN(arr[i])) last = arr[i]; else if (isNaN(out[i])) out[i] = isNaN(last) ? fallback : last; }
  return out;
}
function smooth(arr, r) {
  if (r < 1) return arr;
  const n = arr.length, out = new Float32Array(n);
  let acc = 0;
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { acc += arr[i]; pre[i + 1] = acc; }
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - r), b = Math.min(n - 1, i + r);
    out[i] = (pre[b + 1] - pre[a]) / (b - a + 1);
  }
  return out;
}
const lerp = (a, b, t) => a + (b - a) * t;
const median = (arr) => { const a = [...arr].sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sample = (arr, k, ybody) => arr[clamp(Math.round(ybody / k), 0, arr.length - 1)];

// Wie stark sich welche Kategorie anpasst
const MODES = {
  oberteil: { mode: 'core', ease: 1.1, st: 0.85 },
  jacke: { mode: 'core', ease: 1.2, st: 0.8 },
  kleid: { mode: 'core', ease: 1.1, st: 0.85, fadeBelowHip: true },
  hose: { mode: 'legs', ease: 1.06, st: 0.8 }
};

/**
 * Zeichnet ein Kleidungsstück in ein Canvas, das den Fotobereich ab (ox, oy) mit Faktor k zeigt.
 * warp=false oder fehlendes Profil: einfach in den Rahmen gelegt.
 */
export function renderGarment(canvas, item, img, gProf, body, bProf, k, ox, oy, warp) {
  const ctx = canvas.getContext('2d');
  const p = placeItem(item, body.guides, body.w, body.h);
  const cfg = MODES[item.cat];
  if (!warp || !cfg || !bProf || !gProf) {
    ctx.save();
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (p.x - ox) * k, (p.y - oy) * k, p.w * k, p.h * k);
    ctx.restore();
    return;
  }
  const W = canvas.width, Hc = canvas.height;
  const iw0 = img.naturalWidth || img.width;
  // Quelle auf ungefähr die Zielgröße verkleinern (verhindert Flimmern/Moiré)
  const ss = Math.min(1, (p.w * k * 1.4) / iw0);
  const iw = Math.max(1, Math.round(iw0 * ss)), ih = Math.max(1, Math.round((img.naturalHeight || img.height) * ss));
  const sc0 = document.createElement('canvas');
  sc0.width = iw; sc0.height = ih;
  const sctx = sc0.getContext('2d', { willReadFrequently: true });
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(img, 0, 0, iw, ih);
  const src = sctx.getImageData(0, 0, iw, ih).data;
  const gk = gProf.k * ss; // Profil-px -> Quell-px

  const sb = p.w / iw; // Foto-px pro Quell-px
  const g = body.guides;
  const fitS = item.fit?.s ?? 1;
  const shift = (item.fit?.dx ?? 0) * p.box.w;
  const yMin = cfg.mode === 'core' ? g.s * body.h + (g.h - g.s) * body.h * 0.04 : g.h * body.h;
  const yMax = g.a * body.h;
  const gL = cfg.mode === 'core' ? gProf.coreL : gProf.extL, gR = cfg.mode === 'core' ? gProf.coreR : gProf.extR;
  const bL = cfg.mode === 'core' ? bProf.coreL : bProf.legL, bR = cfg.mode === 'core' ? bProf.coreR : bProf.legR;
  const hipY = g.h * body.h, legLen = (g.a - g.h) * body.h;

  // Ärmel und angelegte Arme nicht als Rumpfbreite werten:
  // Zeilen, die deutlich breiter als der typische Rumpf sind, bekommen ihren Wert von den Nachbarn.
  let gMax = Infinity, bMax = Infinity;
  if (cfg.mode === 'core') {
    const gw = [];
    for (let i = Math.floor(gProf.h * 0.45); i < gProf.h; i++) if (!isNaN(gL[i])) gw.push(gR[i] - gL[i]);
    if (gw.length > 5) gMax = median(gw) * 1.3 * gk;
    const bw = [];
    const r0 = Math.round((g.s + (g.h - g.s) * 0.35) * body.h / bProf.k), r1 = Math.round(hipY / bProf.k);
    for (let i = r0; i <= r1; i++) if (!isNaN(bL[i])) bw.push(bR[i] - bL[i]);
    if (bw.length > 5) bMax = median(bw) * 1.35 * bProf.k;
  }

  // Zielzeilen im Canvas, die das Teil abdeckt
  const j0 = Math.max(0, Math.floor((p.y - oy) * k)), j1 = Math.min(Hc, Math.ceil((p.y + p.h - oy) * k));
  const n = Math.max(1, j1 - j0);
  const scale = new Float32Array(n).fill(NaN), offs = new Float32Array(n).fill(NaN), mid = new Float32Array(n).fill(NaN);
  const srow = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const yb = (j0 + i + 0.5) / k + oy;
    const sr = clamp(((yb - p.y) / p.h) * ih - 0.5, 0, ih - 1);
    srow[i] = sr;
    const gi = clamp(Math.round(sr / gk), 0, gProf.h - 1);
    const ga = gL[gi] * gk, gb = gR[gi] * gk;
    const ea = gProf.extL[gi] * gk, eb = gProf.extR[gi] * gk;
    mid[i] = !isNaN(ga) ? (ga + gb) / 2 : !isNaN(ea) ? (ea + eb) / 2 : NaN;
    if (isNaN(ga) || gb - ga > gMax) continue;
    const yq = clamp(yb, yMin, yMax);
    const L = sample(bL, bProf.k, yq) * bProf.k, R = sample(bR, bProf.k, yq) * bProf.k;
    if (isNaN(L) || R - L > bMax) continue;
    let st = cfg.st;
    if (cfg.fadeBelowHip && yb > hipY) st *= clamp(1 - (yb - hipY) / (legLen * 0.35), 0, 1);
    const baseW = Math.max(1, (gb - ga) * sb);
    scale[i] = clamp(lerp(1, ((R - L) * cfg.ease * fitS) / baseW, st), 0.6, 1.7);
    const baseC = p.x + ((ga + gb) / 2) * sb;
    offs[i] = lerp(baseC, (L + R) / 2 + shift, st) - baseC;
  }
  const midF = smooth(fillGaps(mid, iw / 2), Math.round(n * 0.01));
  const scS = smooth(fillGaps(scale, 1), Math.max(2, Math.round(n * 0.03)));
  const ofS = smooth(fillGaps(offs, 0), Math.max(2, Math.round(n * 0.03)));

  // Pixelgenau neu abtasten (bilinear, mit vormultipliziertem Alpha)
  const out = ctx.getImageData(0, 0, W, Hc);
  const o = out.data;
  for (let i = 0; i < n; i++) {
    const j = j0 + i;
    const sr = srow[i];
    const r0 = Math.floor(sr), r1 = Math.min(ih - 1, r0 + 1), fy = sr - r0;
    const s = scS[i] * sb; // Foto-px pro Quell-px in dieser Zeile
    const c = p.x + midF[i] * sb + ofS[i]; // Fotokoordinate der Teil-Mitte
    // Quell-x -> Foto-x: xb = c + (xs - midF) * s
    const xbA = c - midF[i] * s, xbB = c + (iw - midF[i]) * s;
    const xa = Math.max(0, Math.floor((xbA - ox) * k)), xe = Math.min(W - 1, Math.ceil((xbB - ox) * k));
    for (let x = xa; x <= xe; x++) {
      const xb = (x + 0.5) / k + ox;
      const xs = midF[i] + (xb - c) / s - 0.5;
      if (xs < -0.5 || xs > iw - 0.5) continue;
      const c0 = Math.max(0, Math.floor(xs)), c1 = Math.min(iw - 1, c0 + 1), fx = Math.min(1, Math.max(0, xs - c0));
      let R = 0, G = 0, B = 0, A = 0;
      const acc = (idx, wgt) => {
        const a = src[idx + 3] * wgt;
        R += src[idx] * a; G += src[idx + 1] * a; B += src[idx + 2] * a; A += a;
      };
      acc((r0 * iw + c0) * 4, (1 - fx) * (1 - fy));
      acc((r0 * iw + c1) * 4, fx * (1 - fy));
      acc((r1 * iw + c0) * 4, (1 - fx) * fy);
      acc((r1 * iw + c1) * 4, fx * fy);
      if (A < 1) continue;
      const q = (j * W + x) * 4;
      o[q] = R / A; o[q + 1] = G / A; o[q + 2] = B / A; o[q + 3] = A;
    }
  }
  ctx.putImageData(out, 0, 0);

  // Leichte Schattierung zu den Körperkanten hin, damit es weniger flach wirkt
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  const band = 6;
  for (let i = 0; i < n; i += band) {
    const yb = (j0 + i) / k + oy;
    const yq = clamp(yb, yMin, yMax);
    const L = sample(bL, bProf.k, yq) * bProf.k, R = sample(bR, bProf.k, yq) * bProf.k;
    if (isNaN(L)) continue;
    const cx = ((L + R) / 2 + shift - ox) * k, half = (Math.min(R - L, bMax) / 2) * cfg.ease * fitS * k;
    const grd = ctx.createLinearGradient(cx - half * 1.1, 0, cx + half * 1.1, 0);
    grd.addColorStop(0, 'rgba(25,22,30,0.24)');
    grd.addColorStop(0.2, 'rgba(25,22,30,0.03)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.04)');
    grd.addColorStop(0.8, 'rgba(25,22,30,0.03)');
    grd.addColorStop(1, 'rgba(25,22,30,0.24)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, j0 + i, W, Math.min(band, n - i));
  }
  ctx.restore();
}
