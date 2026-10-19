'use strict';
// Deutschland: Prospekt-Angebote über marktguru.de (Aldi, Lidl, Rewe, Edeka, Kaufland, Penny, Netto, dm, Rossmann …).
// Die Zugangsschlüssel stehen öffentlich in der Startseite von marktguru.de und werden von dort gelesen.
const { unitPriceFor, status } = require('../lib/offers');

const HOME = 'https://www.marktguru.de/';
const API = 'https://api.marktguru.de/api/v1';
const UA = 'Mozilla/5.0 (Preisfinder; privat)';
let keys = null;
let keysAt = 0;

async function getKeys(fetchFn, force) {
  if (keys && !force && Date.now() - keysAt < 6 * 3600e3) return keys;
  const res = await fetchFn(HOME, { headers: { 'user-agent': UA, accept: 'text/html' } });
  if (!res.ok) throw new Error(`marktguru.de antwortet mit ${res.status}`);
  keys = extractKeys(await res.text());
  keysAt = Date.now();
  return keys;
}

function extractKeys(html) {
  const blocks = [...html.matchAll(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  for (const b of [...blocks, html]) {
    const a = b.match(/"apiKey"\s*:\s*"([^"]+)"/);
    const c = b.match(/"clientKey"\s*:\s*"([^"]+)"/);
    if (a && c) return { apiKey: a[1], clientKey: c[1] };
  }
  throw new Error('Zugangsschlüssel auf marktguru.de nicht gefunden (Seite wurde vermutlich umgebaut).');
}

function normalize(o) {
  const v = (o.validityDates && o.validityDates[0]) || {};
  const store = (o.advertisers && o.advertisers[0] && o.advertisers[0].name) || '';
  const title = [o.brand && o.brand.name, o.product && o.product.name].filter(Boolean).join(' ') || o.description || '';
  const text = [o.description, o.product && o.product.description].filter(Boolean).join(' ');
  const price = typeof o.price === 'number' ? o.price : parseFloat(o.price);
  const up = unitPriceFor({ price, refPrice: o.referencePrice, refUnit: o.unit && o.unit.shortName, text: `${title} ${text}` });
  return {
    id: `mg-${o.id}`,
    source: 'marktguru',
    store,
    title: title.trim(),
    description: (text || '').trim(),
    price: isNaN(price) ? null : price,
    oldPrice: o.oldPrice || null,
    currency: 'EUR',
    unitPrice: up.unitPrice,
    base: up.base,
    from: v.from || null,
    to: v.to || null,
    status: status(v.from, v.to),
    loyalty: !!o.requiresLoyalityMembership,
    image: o.id ? `https://mg2de.b-cdn.net/api/v1/offers/${o.id}/images/default/0/medium.jpg` : null,
    url: o.id ? `https://www.marktguru.de/offers/${o.id}` : null,
  };
}

async function search(q, { zip = '10115', limit = 200, fetchFn = fetch } = {}) {
  const url = `${API}/offers/search?as=web&limit=${limit}&offset=0&q=${encodeURIComponent(q)}&zipCode=${encodeURIComponent(zip)}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const k = await getKeys(fetchFn, attempt > 0);
    const res = await fetchFn(url, { headers: { 'user-agent': UA, accept: 'application/json', 'x-apikey': k.apiKey, 'x-clientkey': k.clientKey } });
    if ((res.status === 401 || res.status === 403) && attempt === 0) continue; // Schlüssel erneuern
    if (!res.ok) throw new Error(`marktguru-Suche antwortet mit ${res.status}`);
    const data = await res.json();
    return (data.results || []).map(normalize);
  }
  return [];
}

function reset() { keys = null; keysAt = 0; }

module.exports = { search, normalize, extractKeys, reset, name: 'marktguru.de', country: 'de' };
