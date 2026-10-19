'use strict';
// Dänemark: Tilbudsaviser über Tjek / eTilbudsavis (Netto, Føtex, Bilka, Rema 1000, Lidl, Coop 365, Meny …).
const { unitPriceFor, status, round } = require('../lib/offers');

const API = 'https://squid-api.tjek.com/v2';
const UA = 'Mozilla/5.0 (Preisfinder; privat)';
const geoCache = new Map();

// Postleitzahl → Koordinaten (OpenStreetMap), wird gemerkt
async function locate(zip, country, fetchFn) {
  const key = `${country}-${zip}`;
  if (geoCache.has(key)) return geoCache.get(key);
  const res = await fetchFn(`https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(zip)}&country=${country}&format=json&limit=1`, { headers: { 'user-agent': UA } });
  const data = res.ok ? await res.json() : [];
  const pos = data[0] ? { lat: +data[0].lat, lng: +data[0].lon } : { lat: 55.6761, lng: 12.5683 }; // sonst København
  geoCache.set(key, pos);
  return pos;
}

function quantityOf(q) {
  if (!q || !q.unit || !q.unit.si || !q.size) return null;
  const size = q.size.from || q.size.to;
  if (!size) return null;
  const pieces = (q.pieces && q.pieces.from) || 1;
  const sym = q.unit.si.symbol;
  const base = sym === 'kg' ? 'kg' : sym === 'l' ? 'l' : sym === 'pcs' ? 'Stk' : null;
  if (!base) return null;
  return { amount: size * (q.unit.si.factor || 1) * pieces, base };
}

function normalize(o) {
  const p = o.pricing || {};
  const quantity = quantityOf(o.quantity);
  const up = unitPriceFor({ price: p.price, quantity, text: `${o.heading || ''} ${o.description || ''}` });
  return {
    id: `tj-${o.id}`,
    source: 'tjek',
    store: (o.dealer && o.dealer.name) || (o.branding && o.branding.name) || '',
    title: (o.heading || '').trim(),
    description: (o.description || '').trim(),
    price: p.price ?? null,
    oldPrice: p.pre_price ?? null,
    currency: p.currency || 'DKK',
    unitPrice: up.unitPrice != null ? round(up.unitPrice) : null,
    base: up.base,
    from: o.run_from || null,
    to: o.run_till || null,
    status: status(o.run_from, o.run_till),
    loyalty: false,
    image: (o.images && (o.images.view || o.images.thumb)) || null,
    url: o.id ? `https://etilbudsavis.dk/` : null,
  };
}

async function search(q, { zip = '1000', radius = 15000, limit = 100, fetchFn = fetch } = {}) {
  const pos = await locate(zip, 'dk', fetchFn);
  const url = `${API}/offers/search?query=${encodeURIComponent(q)}&r_lat=${pos.lat}&r_lng=${pos.lng}&r_radius=${radius}&limit=${limit}&offset=0`;
  const res = await fetchFn(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
  if (!res.ok) throw new Error(`Tjek-Suche antwortet mit ${res.status}`);
  const data = await res.json();
  return (Array.isArray(data) ? data : []).map(normalize);
}

module.exports = { search, normalize, name: 'etilbudsavis.dk', country: 'dk' };
