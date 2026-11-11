// "Smarte Suche": Verbindung zum CLIP-Worker, Kategorien und Übersetzung deutscher Suchbegriffe.
import { store } from './store.js';
import { db } from './db.js';
import { LOCAL } from './config.js';

let worker, seq = 0;
const pending = new Map();
export const clipState = { ready: false, loading: false, progress: 0, error: null };

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./clip-worker.js' + (LOCAL ? '?local=1' : ''), import.meta.url), { type: 'module' });
    const files = {};
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') {
        files[m.file] = [m.loaded, m.total];
        const vals = Object.values(files);
        clipState.progress = vals.reduce((s, v) => s + v[0], 0) / vals.reduce((s, v) => s + v[1], 0);
        store.emit('clip-progress', clipState);
        return;
      }
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      m.type === 'error' ? p.reject(new Error(m.error)) : p.resolve(m);
    };
    worker.onerror = (e) => {
      clipState.error = e.message || 'Worker-Fehler';
      pending.forEach((p) => p.reject(new Error(clipState.error)));
      pending.clear();
    };
  }
  return worker;
}

function call(msg, transfer) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ ...msg, id }, transfer || []);
  });
}

export async function initClip() {
  if (clipState.ready) return;
  clipState.loading = true;
  store.emit('clip-progress', clipState);
  try {
    await call({ type: 'init' });
    clipState.ready = true;
  } catch (e) {
    clipState.error = e.message;
    throw e;
  } finally {
    clipState.loading = false;
    store.emit('clip-progress', clipState);
  }
}

export async function embedImage(blob) {
  const r = await call({ type: 'image', blob });
  return r.vec;
}

const textCache = new Map();
export async function embedTexts(texts) {
  const missing = texts.filter((t) => !textCache.has(t));
  if (missing.length) {
    const r = await call({ type: 'text', texts: missing });
    missing.forEach((t, i) => textCache.set(t, r.vecs[i]));
  }
  return texts.map((t) => textCache.get(t));
}

export function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// ---------- Kategorien ----------
// id, Anzeigename, Emoji, englische Beschreibungen für das Modell
export const CATEGORIES = [
  ['menschen', 'Menschen', '🧑', ['a photo of a person', 'a portrait of a person']],
  ['gruppe', 'Gruppenfotos', '👨‍👩‍👧', ['a group photo of several people']],
  ['selfie', 'Selfies', '🤳', ['a selfie']],
  ['baby', 'Babys & Kinder', '👶', ['a photo of a baby', 'a photo of a small child']],
  ['hund', 'Hunde', '🐕', ['a photo of a dog']],
  ['katze', 'Katzen', '🐈', ['a photo of a cat']],
  ['vogel', 'Vögel', '🐦', ['a photo of a bird']],
  ['pferd', 'Pferde', '🐎', ['a photo of a horse']],
  ['wildtier', 'Wilde Tiere', '🦁', ['a photo of a wild animal', 'a photo of a tiger, lion, elephant or zebra']],
  ['insekt', 'Insekten', '🦋', ['a photo of a butterfly', 'a photo of an insect']],
  ['auto', 'Autos', '🚗', ['a photo of a car']],
  ['motorrad', 'Motorräder', '🏍️', ['a photo of a motorcycle']],
  ['fahrrad', 'Fahrräder', '🚲', ['a photo of a bicycle']],
  ['flugzeug', 'Flugzeuge', '✈️', ['a photo of an airplane', 'a photo of an airport']],
  ['zug', 'Züge', '🚆', ['a photo of a train']],
  ['boot', 'Boote & Schiffe', '⛵', ['a photo of a boat', 'a photo of a ship']],
  ['haus', 'Häuser', '🏠', ['a photo of a house', 'a photo of a home exterior']],
  ['stadt', 'Stadt', '🏙️', ['a photo of a city', 'a photo of a street in a city']],
  ['kirche', 'Kirchen & Burgen', '⛪', ['a photo of a church', 'a photo of a castle']],
  ['innen', 'Räume', '🛋️', ['a photo of a room interior', 'a photo of a living room']],
  ['strand', 'Strand', '🏖️', ['a photo of a beach']],
  ['meer', 'Meer & Seen', '🌊', ['a photo of the sea', 'a photo of a lake']],
  ['berge', 'Berge', '🏔️', ['a photo of mountains']],
  ['wald', 'Wald & Bäume', '🌳', ['a photo of a forest', 'a photo of trees']],
  ['pflanzen', 'Pflanzen', '🪴', ['a photo of plants', 'a photo of a potted plant', 'a photo of green leaves']],
  ['blumen', 'Blumen', '🌸', ['a photo of flowers']],
  ['garten', 'Garten', '🏡', ['a photo of a garden']],
  ['sonnenuntergang', 'Sonnenuntergang', '🌅', ['a photo of a sunset', 'a photo of a sunrise']],
  ['schnee', 'Schnee & Winter', '❄️', ['a photo of snow', 'a snowy winter landscape']],
  ['himmel', 'Himmel & Wolken', '☁️', ['a photo of the sky with clouds']],
  ['nacht', 'Nachts', '🌙', ['a photo taken at night']],
  ['essen', 'Essen', '🍝', ['a photo of food', 'a photo of a meal on a plate']],
  ['kuchen', 'Kuchen & Süßes', '🍰', ['a photo of a cake', 'a photo of dessert']],
  ['getraenke', 'Getränke', '🍹', ['a photo of a drink', 'a photo of a glass of wine or beer']],
  ['feier', 'Feiern & Partys', '🎉', ['a photo of a party', 'a photo of a celebration']],
  ['weihnachten', 'Weihnachten', '🎄', ['a photo of a christmas tree', 'a photo of christmas decorations']],
  ['hochzeit', 'Hochzeit', '💍', ['a photo of a wedding']],
  ['sport', 'Sport', '⚽', ['a photo of people doing sports', 'a photo of a football match']],
  ['dokument', 'Dokumente & Text', '📄', ['a photo of a document with text', 'a photo of a receipt']],
  ['screenshot', 'Screenshots', '📱', ['a screenshot of a phone screen', 'a screenshot of a website']],
  ['kunst', 'Kunst & Zeichnungen', '🎨', ['a painting', 'a drawing', 'a cartoon illustration']],
];

let catVecs = null; // Float32Array[] je Kategorie (Mittelwert der Beschreibungen)

export async function categoryVectors() {
  if (catVecs) return catVecs;
  const key = 'catvec:' + CATEGORIES.map((c) => c[0] + c[3].join()).join('|').length;
  const cached = await db.getMeta(key);
  if (cached) return (catVecs = cached);
  const texts = CATEGORIES.flatMap((c) => c[3]);
  const vecs = await embedTexts(texts);
  let k = 0;
  catVecs = CATEGORIES.map((c) => {
    const v = new Float32Array(vecs[0].length);
    for (let i = 0; i < c[3].length; i++, k++) vecs[k].forEach((x, j) => { v[j] += x; });
    const n = Math.hypot(...v);
    return v.map((x) => x / n);
  });
  await db.setMeta(key, catVecs);
  return catVecs;
}

/** Schlagwörter für ein Bild aus seinem CLIP-Vektor */
export function tagsFor(vec, cv) {
  const scores = cv.map((c, i) => [CATEGORIES[i][0], dot(vec, c)]);
  // Softmax über alle Kategorien – gewinnt eine deutlich, wird sie vergeben
  const max = Math.max(...scores.map((s) => s[1]));
  const exps = scores.map(([id, s]) => [id, Math.exp((s - max) * 100), s]);
  const sum = exps.reduce((a, e) => a + e[1], 0);
  return exps.filter(([, e, s]) => e / sum > 0.12 && s > 0.12).map(([id]) => id);
}

export const categoryById = (id) => CATEGORIES.find((c) => c[0] === id);

// ---------- Suche ----------

/** Fotos nach Ähnlichkeit zum Text sortieren; gibt nur passende Treffer zurück */
export async function searchByText(englishText, photos) {
  const [q] = await embedTexts([`a photo of ${englishText}`]);
  return rankByVector(q, photos);
}

export function rankByVector(q, photos, { min = 0.145, rel = 0.72 } = {}) {
  const scored = photos.filter((p) => p.clip).map((p) => ({ p, s: dot(q, p.clip) })).sort((a, b) => b.s - a.s);
  if (!scored.length) return [];
  const cut = Math.max(min, scored[0].s * rel);
  return scored.filter((x) => x.s >= cut);
}

/** Ähnliche Fotos zu einem Foto */
export function similarPhotos(photo, limit = 24) {
  if (!photo.clip) return [];
  return [...store.photos.values()]
    .filter((p) => p.clip && p.id !== photo.id)
    .map((p) => ({ p, s: dot(photo.clip, p.clip) }))
    .filter((x) => x.s > 0.6)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.p);
}
