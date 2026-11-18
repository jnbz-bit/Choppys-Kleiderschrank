// Kleidung am Körper erkennen – komplett auf dem Gerät.
// MediaPipe „selfie multiclass“ trennt Hintergrund, Haare, Haut, Gesicht und Kleidung.
// Die Kleidungsfläche wird nach Farbe in einzelne Teile (Oberteil, Hose …) zerlegt,
// damit nur das gewünschte Teil ausgeschnitten wird – ohne Kopf, Arme und Beine.

const SEG_BASE = '/seg';
const MODEL = `${SEG_BASE}/selfie_multiclass_256x256.tflite`;
const C = { bg: 0, hair: 1, skin: 2, face: 3, clothes: 4, other: 5 };
const WORK = 640; // Analyse-Auflösung (längere Seite)

let segPromise = null;
async function segmenter() {
  if (!segPromise) {
    segPromise = (async () => {
      const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks(new URL(SEG_BASE, location.href).href);
      return ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: new URL(MODEL, location.href).href, delegate: 'CPU' },
        runningMode: 'IMAGE',
        outputCategoryMask: true,
        outputConfidenceMasks: true
      });
    })().catch((e) => { segPromise = null; throw e; });
  }
  return segPromise;
}

/** Modell im Hintergrund vorladen (Scan-Sheet geöffnet). */
export function preloadSegmenter() {
  segmenter().catch(() => {});
}

function scaled(src, maxSide) {
  const s = Math.min(1, maxSide / Math.max(src.width, src.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(src.width * s));
  c.height = Math.max(1, Math.round(src.height * s));
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.fillStyle = '#fff';
  cx.fillRect(0, 0, c.width, c.height);
  cx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

// --- Farbe -------------------------------------------------------------------
function srgb2lin(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }
const LIN = new Float32Array(256).map((_, i) => srgb2lin(i));
function lab(r, g, b) {
  const R = LIN[r], G = LIN[g], B = LIN[b];
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const X = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047);
  const Y = f(R * 0.2126 + G * 0.7152 + B * 0.0722);
  const Z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}

/** k-means auf Lab-Werten (Helligkeit schwächer gewichtet, damit Schatten kein eigenes Teil werden). */
function kmeans(pts, k, iters = 12) {
  const n = pts.length / 3;
  const cent = new Float32Array(k * 3);
  // deterministisches k-means++: erster Punkt = Median-Index, dann jeweils der fernste
  let first = Math.floor(n / 2);
  cent.set(pts.subarray(first * 3, first * 3 + 3), 0);
  const d = new Float32Array(n).fill(Infinity);
  for (let c = 1; c < k; c++) {
    let best = 0, bi = 0;
    for (let i = 0; i < n; i++) {
      const o = (c - 1) * 3;
      const dl = pts[i * 3] - cent[o], da = pts[i * 3 + 1] - cent[o + 1], db = pts[i * 3 + 2] - cent[o + 2];
      d[i] = Math.min(d[i], dl * dl + da * da + db * db);
      if (d[i] > best) { best = d[i]; bi = i; }
    }
    cent.set(pts.subarray(bi * 3, bi * 3 + 3), c * 3);
  }
  const lab_ = new Uint8Array(n);
  let sse = 0;
  for (let it = 0; it < iters; it++) {
    const sum = new Float64Array(k * 3), cnt = new Uint32Array(k);
    sse = 0;
    for (let i = 0; i < n; i++) {
      let bd = Infinity, bc = 0;
      for (let c = 0; c < k; c++) {
        const dl = pts[i * 3] - cent[c * 3], da = pts[i * 3 + 1] - cent[c * 3 + 1], db = pts[i * 3 + 2] - cent[c * 3 + 2];
        const dd = dl * dl + da * da + db * db;
        if (dd < bd) { bd = dd; bc = c; }
      }
      lab_[i] = bc; sse += bd; cnt[bc]++;
      sum[bc * 3] += pts[i * 3]; sum[bc * 3 + 1] += pts[i * 3 + 1]; sum[bc * 3 + 2] += pts[i * 3 + 2];
    }
    for (let c = 0; c < k; c++) if (cnt[c]) for (let j = 0; j < 3; j++) cent[c * 3 + j] = sum[c * 3 + j] / cnt[c];
  }
  return { cent, sse };
}

/**
 * Foto analysieren. Liefert null, wenn keine Person zu sehen ist (z. B. flach fotografiertes Teil).
 * @param {HTMLCanvasElement} photo  Foto (RGB), gleiche Größe wie der Freisteller-Ausschnitt
 */
export async function analyzeWorn(photo) {
  const seg = await segmenter();
  const work = scaled(photo, WORK);
  const W = work.width, H = work.height, N = W * H;
  const res = seg.segment(work);
  const cat = res.categoryMask.getAsUint8Array().slice();
  const conf = res.confidenceMasks?.[C.clothes]?.getAsFloat32Array().slice() || null;
  res.close();

  const count = new Uint32Array(6);
  for (let i = 0; i < N; i++) count[cat[i]]++;
  const share = (c) => count[c] / N;
  const personish = share(C.face) > 0.002 || share(C.hair) + share(C.skin) + share(C.face) > 0.025;
  if (!personish || share(C.clothes) < 0.02) return null;

  // Personen-Ausdehnung (alles außer Hintergrund) für die Lage der Teile
  let top = H, bottom = 0, faceN = 0, fy0 = H, fy1 = -1;
  const faceRows = new Uint32Array(H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = cat[y * W + x];
    if (c !== C.bg) { if (y < top) top = y; if (y > bottom) bottom = y; }
    if (c === C.face) { faceN++; faceRows[y]++; }
  }
  // Gesichtshöhe (Zeilen mit nennenswert Gesicht) als Maßstab für Körperproportionen
  const faceMin = Math.max(2, Math.sqrt(faceN) * 0.15);
  for (let y = 0; y < H; y++) if (faceRows[y] >= faceMin) { if (y < fy0) fy0 = y; fy1 = y; }
  const face = fy1 > fy0 + 3 ? { y0: fy0, y1: fy1, h: fy1 - fy0 } : null;
  const personH = Math.max(1, bottom - top);

  // Kleidungspixel sammeln (Lab, Helligkeit halb gewichtet)
  const px = work.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const idx = [];
  for (let i = 0; i < N; i++) if (cat[i] === C.clothes) idx.push(i);
  const step = Math.max(1, Math.floor(idx.length / 6000));
  const sample = [];
  for (let j = 0; j < idx.length; j += step) {
    const i = idx[j];
    const [L, a, b] = lab(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
    sample.push(L * 0.5, a, b);
  }
  const pts = Float32Array.from(sample);

  // Anzahl Farbgruppen wählen: nur teilen, wenn es die Streuung deutlich senkt
  let best = kmeans(pts, 1), k = 1;
  for (let kk = 2; kk <= 4; kk++) {
    const r = kmeans(pts, kk);
    if (r.sse < best.sse * 0.55 && minCentDist(r.cent, kk) > 14) { best = r; k = kk; } else break;
  }

  // Jedes Kleidungspixel der nächsten Gruppe zuordnen
  const label = new Int8Array(N).fill(-1);
  for (const i of idx) {
    const [L, a, b] = lab(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
    let bd = Infinity, bc = 0;
    for (let c = 0; c < k; c++) {
      const dl = L * 0.5 - best.cent[c * 3], da = a - best.cent[c * 3 + 1], db = b - best.cent[c * 3 + 2];
      const dd = dl * dl + da * da + db * db;
      if (dd < bd) { bd = dd; bc = c; }
    }
    label[i] = bc;
  }
  smoothLabels(label, W, H, k);

  // Zusammenhängende Flächen je Gruppe
  const comp = new Int32Array(N).fill(-1);
  const regions = [];
  const stack = new Int32Array(N);
  const minArea = idx.length * 0.03;
  for (let s = 0; s < N; s++) {
    if (label[s] < 0 || comp[s] >= 0) continue;
    const L = label[s], id = regions.length;
    let sp = 0, area = 0, x0 = W, y0 = H, x1 = 0, y1 = 0, sy = 0, sr = 0, sg = 0, sb = 0;
    stack[sp++] = s; comp[s] = id;
    while (sp) {
      const i = stack[--sp];
      const x = i % W, y = (i / W) | 0;
      area++; sy += y; sr += px[i * 4]; sg += px[i * 4 + 1]; sb += px[i * 4 + 2];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && label[i - 1] === L && comp[i - 1] < 0) { comp[i - 1] = id; stack[sp++] = i - 1; }
      if (x < W - 1 && label[i + 1] === L && comp[i + 1] < 0) { comp[i + 1] = id; stack[sp++] = i + 1; }
      if (y > 0 && label[i - W] === L && comp[i - W] < 0) { comp[i - W] = id; stack[sp++] = i - W; }
      if (y < H - 1 && label[i + W] === L && comp[i + W] < 0) { comp[i + W] = id; stack[sp++] = i + W; }
    }
    regions.push({ id, group: L, area, box: { x0, y0, x1, y1 }, cy: sy / area, rgb: [sr / area, sg / area, sb / area] });
  }
  // kleine Krümel: der angrenzenden größten Fläche zuschlagen
  const bigAll = regions.filter((r) => r.area >= minArea);
  if (!bigAll.length) return null;
  // Gleiche Farbe + überlappende Höhe = dasselbe Teil (z. B. beide Hälften einer offenen Jacke)
  const parent = new Map(bigAll.map((r) => [r.id, r.id]));
  const find = (a) => { while (parent.get(a) !== a) a = parent.get(a); return a; };
  for (let a = 0; a < bigAll.length; a++) for (let b = a + 1; b < bigAll.length; b++) {
    const A = bigAll[a].box, B = bigAll[b].box;
    if (bigAll[a].group !== bigAll[b].group) continue;
    const overlap = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0);
    if (overlap > 0.35 * Math.min(A.y1 - A.y0, B.y1 - B.y0)) parent.set(find(bigAll[b].id), find(bigAll[a].id));
  }
  const merged = new Map();
  for (const r of bigAll) {
    const root = find(r.id);
    const m = merged.get(root);
    if (!m) { merged.set(root, { ids: [r.id], area: r.area, box: { ...r.box }, sy: r.cy * r.area, rgb: r.rgb.map((v) => v * r.area) }); continue; }
    m.ids.push(r.id); m.area += r.area; m.sy += r.cy * r.area;
    m.box.x0 = Math.min(m.box.x0, r.box.x0); m.box.y0 = Math.min(m.box.y0, r.box.y0);
    m.box.x1 = Math.max(m.box.x1, r.box.x1); m.box.y1 = Math.max(m.box.y1, r.box.y1);
    r.rgb.forEach((v, j) => { m.rgb[j] += v * r.area; });
  }
  const big = [...merged.values()].map((m) => ({ ...m, cy: m.sy / m.area, rgb: m.rgb.map((v) => v / m.area) }));
  const keep = new Map();
  big.forEach((m, i) => m.ids.forEach((id) => keep.set(id, i)));
  for (let i = 0; i < N; i++) {
    if (comp[i] < 0 || keep.has(comp[i])) continue;
    comp[i] = -2; // später per Nachbarschaft
  }
  fillCrumbs(comp, W, H, keep);

  const out = big.map((r, i) => {
    const rel = (v) => (v - top) / personH;
    return {
      index: i,
      area: r.area / idx.length,
      top: rel(r.box.y0), bottom: rel(r.box.y1), cy: rel(r.cy),
      cutOff: r.box.y1 >= H - 3, // reicht bis an den unteren Bildrand → Länge unbekannt
      // Beginn unterhalb des Kinns in Gesichtshöhen (Schultern ≈ 0–1,5; Hüfte ≈ 3–4)
      headUnits: face ? (r.box.y0 - face.y1) / face.h : null,
      box: { x: r.box.x0 / W, y: r.box.y0 / H, w: (r.box.x1 - r.box.x0 + 1) / W, h: (r.box.y1 - r.box.y0 + 1) / H },
      hex: '#' + r.rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
    };
  });
  const regionMap = new Int8Array(N).fill(-1);
  for (let i = 0; i < N; i++) if (comp[i] >= 0 && keep.has(comp[i])) regionMap[i] = keep.get(comp[i]);

  return { W, H, regions: out, regionMap, conf, cat, hasFace: !!face };
}

function minCentDist(cent, k) {
  let m = Infinity;
  for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) {
    const d = Math.hypot(cent[a * 3] - cent[b * 3], cent[a * 3 + 1] - cent[b * 3 + 1], cent[a * 3 + 2] - cent[b * 3 + 2]);
    m = Math.min(m, d);
  }
  return m;
}

/** Mehrheitsfilter 5×5 gegen ausgefranste Farbgrenzen (Falten, Muster). */
function smoothLabels(label, W, H, k) {
  if (k < 2) return;
  const src = label.slice();
  const cnt = new Uint16Array(k);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (src[i] < 0) continue;
    cnt.fill(0);
    for (let dy = -2; dy <= 2; dy++) {
      const yy = y + dy; if (yy < 0 || yy >= H) continue;
      for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx; if (xx < 0 || xx >= W) continue;
        const l = src[yy * W + xx]; if (l >= 0) cnt[l]++;
      }
    }
    let bl = src[i], bc = 0;
    for (let c = 0; c < k; c++) if (cnt[c] > bc) { bc = cnt[c]; bl = c; }
    label[i] = bl;
  }
}

function fillCrumbs(comp, W, H, keep) {
  // einige Durchgänge: Krümel übernehmen die Fläche eines behaltenen Nachbarn
  for (let pass = 0; pass < 40; pass++) {
    let changed = 0;
    for (let i = 0; i < comp.length; i++) {
      if (comp[i] !== -2) continue;
      const x = i % W;
      const n = [x > 0 ? comp[i - 1] : -1, x < W - 1 ? comp[i + 1] : -1, i >= W ? comp[i - W] : -1, i + W < comp.length ? comp[i + W] : -1];
      const hit = n.find((v) => v >= 0 && keep.has(v));
      if (hit !== undefined) { comp[i] = hit; changed++; }
    }
    if (!changed) break;
  }
  for (let i = 0; i < comp.length; i++) if (comp[i] === -2) comp[i] = -1;
}

const startsAtShoulders = (r) => (r.headUnits != null ? r.headUnits < 1.6 : r.top < 0.32);

/** Vorschlag, welche Flächen zum gewünschten Teil gehören. */
export function defaultSelection(an, presetCat) {
  const R = an.regions;
  const largest = (list) => list.reduce((a, b) => (b.area > a.area ? b : a), list[0]);
  const upper = R.filter((r) => startsAtShoulders(r) || r.cy < 0.45);
  const lower = R.filter((r) => !upper.includes(r) && r.cy < 0.9), feet = R.filter((r) => r.cy >= 0.85 && !upper.includes(r));
  let pick;
  if (presetCat === 'kleid') pick = R.filter((r) => r.cy < 0.8);
  else if (presetCat === 'oberteil' || presetCat === 'jacke') pick = upper.length ? [largest(upper)] : null;
  else if (presetCat === 'hose') pick = lower.length ? [largest(lower)] : null;
  else if (presetCat === 'schuhe' || presetCat === 'socken') pick = feet.length ? [largest(feet)] : null;
  if (!pick?.length) pick = [largest(R)];
  return new Set(pick.map((r) => r.index));
}

/** Kategorie aus der Lage der gewählten Flächen am Körper ableiten. */
export function categoryFromSelection(an, sel) {
  const rs = an.regions.filter((r) => sel.has(r.index));
  if (!rs.length) return null;
  const top = Math.min(...rs.map((r) => r.top)), bottom = Math.max(...rs.map((r) => r.bottom));
  const cy = rs.reduce((s, r) => s + r.cy * r.area, 0) / rs.reduce((s, r) => s + r.area, 0);
  const cutOff = rs.some((r) => r.cutOff);
  if (top > 0.82) return 'schuhe';
  // Offene Jacke: ein anderes Teil liegt mittig zwischen den Hälften
  const others = an.regions.filter((r) => !sel.has(r.index));
  const isOpen = rs.some((r) => others.some((o) => {
    const ocx = o.box.x + o.box.w / 2, ocy = o.box.y + o.box.h / 2;
    return ocx > r.box.x + r.box.w * 0.25 && ocx < r.box.x + r.box.w * 0.75 && ocy > r.box.y && ocy < r.box.y + r.box.h && o.box.w < r.box.w * 0.6;
  }));
  if (isOpen && cy < 0.7) return 'jacke';
  const lowerBelow = others.some((o) => o.top > bottom - 0.08 && o.top < 0.85);
  const upper = rs.some(startsAtShoulders);
  if (upper && !cutOff && !lowerBelow && bottom > 0.62 && bottom - top > 0.38) return 'kleid';
  if (upper || cy < 0.45) return 'oberteil';
  return 'hose';
}

/** Fläche unter einem Punkt (0..1-Koordinaten des Fotos); sucht im Umkreis, falls daneben getippt. */
export function regionAt(an, fx, fy) {
  const { W, H, regionMap } = an;
  const x = Math.round(fx * (W - 1)), y = Math.round(fy * (H - 1));
  for (let r = 0; r <= 14; r += 2) {
    for (let dy = -r; dy <= r; dy += Math.max(1, r)) for (let dx = -r; dx <= r; dx += Math.max(1, r)) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const v = regionMap[yy * W + xx];
      if (v >= 0) return v;
    }
  }
  return -1;
}

/** Weiche Maske (Alpha) der gewählten Flächen in Analyse-Auflösung. */
function selectionMask(an, sel) {
  const { W, H, regionMap, conf } = an;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const cx = c.getContext('2d');
  const img = cx.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    const on = regionMap[i] >= 0 && sel.has(regionMap[i]);
    // an den Rändern die Konfidenz des Modells nutzen → weichere Kanten
    const a = on ? 255 : 0;
    img.data[i * 4 + 3] = conf && on ? Math.round(255 * Math.min(1, conf[i] * 1.6)) : a;
  }
  cx.putImageData(img, 0, 0);
  return c;
}

/**
 * Gewähltes Teil ausschneiden: Freisteller-Ausschnitt (feine Kanten zum Hintergrund)
 * × Kleidungsmaske (trennt Haut, Haare, andere Teile).
 */
export function cutSelection(cut, an, sel) {
  const mask = selectionMask(an, sel);
  const out = document.createElement('canvas');
  out.width = cut.width; out.height = cut.height;
  const ox = out.getContext('2d');
  ox.drawImage(cut, 0, 0);
  ox.globalCompositeOperation = 'destination-in';
  ox.imageSmoothingEnabled = true;
  ox.imageSmoothingQuality = 'high';
  ox.filter = `blur(${Math.max(0.6, cut.width / an.W * 0.7)}px)`;
  ox.drawImage(mask, 0, 0, out.width, out.height);
  ox.filter = 'none';
  ox.globalCompositeOperation = 'source-over';
  return out;
}

/** Vorschaubild für die Auswahl: Foto abgedunkelt, gewählte Flächen hell mit Kontur. */
export function renderSelection(photo, an, sel, tint = '#FF2D55') {
  const c = document.createElement('canvas');
  c.width = photo.width; c.height = photo.height;
  const cx = c.getContext('2d');
  cx.drawImage(photo, 0, 0);
  cx.fillStyle = 'rgba(0,0,0,.55)';
  cx.fillRect(0, 0, c.width, c.height);
  if (sel.size) {
    const mask = selectionMask(an, sel);
    const lit = document.createElement('canvas');
    lit.width = c.width; lit.height = c.height;
    const lx = lit.getContext('2d');
    lx.drawImage(photo, 0, 0);
    lx.globalCompositeOperation = 'destination-in';
    lx.drawImage(mask, 0, 0, c.width, c.height);
    // Kontur: Maske leicht vergrößert in Akzentfarbe darunter
    const ring = document.createElement('canvas');
    ring.width = c.width; ring.height = c.height;
    const rx = ring.getContext('2d');
    const r = Math.max(2, c.width / 220);
    for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) rx.drawImage(mask, dx, dy, c.width, c.height);
    rx.globalCompositeOperation = 'source-in';
    rx.fillStyle = tint;
    rx.fillRect(0, 0, c.width, c.height);
    cx.drawImage(ring, 0, 0);
    cx.drawImage(lit, 0, 0);
  }
  return c;
}

/**
 * Wie stark ist das gewählte Teil verdeckt? Zählt Haut, Haare und andere Teile innerhalb
 * seines Umrisses (Bounding-Box) im Verhältnis zur sichtbaren Fläche; abgeschnittene Teile zählen extra.
 */
export function occlusion(an, sel) {
  const { W, H, regionMap, cat } = an;
  let x0 = W, y0 = H, x1 = -1, y1 = -1, area = 0;
  for (let i = 0; i < W * H; i++) {
    if (regionMap[i] < 0 || !sel.has(regionMap[i])) continue;
    const x = i % W, y = (i / W) | 0;
    area++;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (!area) return { score: 0, cutOff: false };
  // innerer Bereich (Ränder der Box ausgenommen, dort liegt oft nur Hintergrund/Arm daneben)
  const mx = Math.round((x1 - x0) * 0.08), my = Math.round((y1 - y0) * 0.04);
  let cover = 0;
  for (let y = y0 + my; y <= y1 - my; y++) {
    // nur zwischen linkstem und rechtestem Pixel des Teils in dieser Zeile
    let l = -1, r = -1;
    for (let x = x0; x <= x1; x++) { const v = regionMap[y * W + x]; if (v >= 0 && sel.has(v)) { if (l < 0) l = x; r = x; } }
    if (l < 0) continue;
    for (let x = l + 1; x < r; x++) {
      const i = y * W + x, v = regionMap[i];
      if (v >= 0 && sel.has(v)) continue;
      const c = cat[i];
      if (c === C.hair || c === C.skin || c === C.face || c === C.other || (v >= 0 && !sel.has(v))) cover++;
    }
  }
  const touches = x0 <= 1 || y0 <= 1 || x1 >= W - 2 || y1 >= H - 2;
  return { score: cover / area, cutOff: touches, box: { x: x0 / W, y: y0 / H, w: (x1 - x0 + 1) / W, h: (y1 - y0 + 1) / H } };
}
