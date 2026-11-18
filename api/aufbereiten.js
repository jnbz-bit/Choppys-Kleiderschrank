// Vercel-Funktion: KI-Aufbereitung eines Kleidungsstücks mit Google Gemini (Bildbearbeitung).
// Der API-Schlüssel liegt nur als Umgebungsvariable GEMINI_API_KEY bei Vercel – nie in der App.
//
// GET  /api/aufbereiten  → { enabled }            (ob ein Schlüssel hinterlegt ist)
// POST /api/aufbereiten  { photo, cutout, cat, color, worn }  (Bilder als Base64-JPEG)
//                        → { image, mime }        Produktfoto auf weißem Grund

const MODELS = () => [process.env.GEMINI_IMAGE_MODEL, 'gemini-3.1-flash-image', 'gemini-2.5-flash-image'].filter(Boolean);
const API = 'https://generativelanguage.googleapis.com/v1beta/models';

const WHAT = {
  oberteil: 'top (shirt, T-shirt, blouse or sweater)',
  jacke: 'jacket',
  kleid: 'dress',
  hose: 'trousers, jeans, shorts or skirt',
  socken: 'pair of socks',
  schuhe: 'pair of shoes',
  schmuck: 'piece of jewelry'
};

function prompt({ cat, color, worn }) {
  const what = WHAT[cat] || 'garment';
  const col = color ? ` The main color is roughly ${String(color).slice(0, 30)}.` : '';
  const shoe = cat === 'schuhe' ? ' Show the pair side by side in a three-quarter side view.' : '';
  return [
    `Image 1 is a photo${worn ? ' of a person wearing clothes' : ' of a clothing item'}.`,
    `Image 2 is a rough cut-out from that photo that marks which item is meant: the ${what}.${col}`,
    `Create a clean e-commerce product photo of exactly this one item, front view, the complete item visible and centered, as if laid flat or on an invisible ghost mannequin.${shoe}`,
    'Reconstruct every part that is hidden or cut off – by arms, hands, hair, other clothes, folds or the image border – so it looks natural and matches the visible fabric, color, pattern, print, stitching and details exactly.',
    'Keep the real color, material, pattern, logos and proportions. Do not add new design elements, text or accessories.',
    'No person, no skin, no hair, no mannequin, no hanger, no other objects, no drop shadow.',
    'Plain pure white background (#FFFFFF). Portrait orientation.'
  ].join(' ');
}

function sameOrigin(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const from = req.headers.origin || req.headers.referer || '';
  if (!from) return false;
  try { return new URL(from).host === host; } catch { return false; }
}

async function callGemini(model, key, body) {
  const r = await fetch(`${API}/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body)
  });
  const json = await r.json().catch(() => ({}));
  return { status: r.status, json };
}

function pickImage(json) {
  for (const cand of json?.candidates || []) {
    for (const p of cand?.content?.parts || []) {
      const d = p.inlineData || p.inline_data;
      if (d?.data) return { image: d.data, mime: d.mimeType || d.mime_type || 'image/png' };
    }
  }
  return null;
}

const b64ok = (s, max) => typeof s === 'string' && s.length > 100 && s.length < max && /^[A-Za-z0-9+/=]+$/.test(s.slice(0, 200));

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  const key = process.env.GEMINI_API_KEY;

  if (req.method === 'GET') return res.status(200).json({ enabled: !!key });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Nicht erlaubt' });
  if (!key) return res.status(503).json({ error: 'KI ist noch nicht eingerichtet.' });
  if (!sameOrigin(req)) return res.status(403).json({ error: 'Nicht erlaubt' });

  const { photo, cutout, cat, color, worn } = req.body || {};
  if (!b64ok(photo, 3_000_000) || (cutout && !b64ok(cutout, 1_500_000))) {
    return res.status(400).json({ error: 'Bild fehlt oder ist zu groß.' });
  }

  const parts = [{ text: prompt({ cat, color, worn: !!worn }) }, { inline_data: { mime_type: 'image/jpeg', data: photo } }];
  if (cutout) parts.push({ inline_data: { mime_type: 'image/jpeg', data: cutout } });
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '3:4' } }
  };

  let last = null;
  for (const model of MODELS()) {
    try {
      const { status, json } = await callGemini(model, key, body);
      if (status === 404) { last = { status, json }; continue; } // Modell nicht verfügbar → nächstes probieren
      if (status === 429) return res.status(429).json({ error: 'Das KI-Kontingent ist gerade aufgebraucht. Versuch es später noch einmal.' });
      if (status === 400 && /aspect|imageConfig/i.test(JSON.stringify(json))) {
        // ältere Modelle kennen imageConfig nicht
        const retry = await callGemini(model, key, { ...body, generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } });
        const img = pickImage(retry.json);
        if (img) return res.status(200).json({ ...img, model });
        last = retry; continue;
      }
      if (status === 401 || status === 403) return res.status(502).json({ error: 'Der KI-Schlüssel wird nicht akzeptiert.' });
      const img = pickImage(json);
      if (img) return res.status(200).json({ ...img, model });
      last = { status, json };
      if (status >= 200 && status < 300) break; // Antwort ohne Bild (z. B. Sicherheitsfilter) – kein weiteres Modell
    } catch (e) {
      last = { status: 0, json: { error: String(e) } };
    }
  }
  console.error('KI-Aufbereitung fehlgeschlagen', last?.status, JSON.stringify(last?.json)?.slice(0, 500));
  return res.status(502).json({ error: 'Die KI hat kein Bild geliefert. Versuch es noch einmal.' });
};

export { prompt };
