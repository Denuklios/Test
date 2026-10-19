'use strict';
// Angebote vereinheitlichen: Grundpreis (€/kg, €/l, €/Stück), Status (läuft / kommt / vorbei), Sortierung.

const DAY = 86400000;

// Mengenangaben aus Texten wie "500 g", "1,5-l-Flasche", "6 x 1 l", "10 Stück" lesen.
// Ergebnis: { amount, base } mit base 'kg', 'l' oder 'Stk' (amount in dieser Grundeinheit).
const UNITS = {
  kg: ['kg', 1], g: ['kg', 0.001], mg: ['kg', 0.000001],
  l: ['l', 1], ltr: ['l', 1], liter: ['l', 1], ml: ['l', 0.001], cl: ['l', 0.01],
  stk: ['Stk', 1], stück: ['Stk', 1], st: ['Stk', 1], rollen: ['Stk', 1], tabs: ['Stk', 1], wl: ['Stk', 1],
};

function num(s) { return parseFloat(String(s).replace(/\./g, '').replace(',', '.')); }

function parseQuantity(text) {
  if (!text) return null;
  const t = String(text).toLowerCase().replace(/ /g, ' ');
  // "6 x 1 l", "4 x 125 g"
  let m = t.match(/(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*-?\s*(kg|g|mg|ml|cl|ltr|liter|l)\b/);
  if (m) {
    const [base, f] = UNITS[m[3]];
    return { amount: num(m[1]) * num(m[2]) * f, base };
  }
  m = t.match(/(\d+(?:[.,]\d+)?)\s*-?\s*(kg|g|mg|ml|cl|ltr|liter|l|stück|stk|st|rollen|tabs|wl)\b/);
  if (m) {
    const [base, f] = UNITS[m[2]];
    return { amount: num(m[1]) * f, base };
  }
  return null;
}

// "(1 kg = 3,98)" oder "1 l = 1.19 €" direkt aus dem Text
function parseReference(text) {
  if (!text) return null;
  const m = String(text).toLowerCase().match(/(?:je\s*)?(?:1\s*)?(kg|l|liter|stück|stk)\s*=\s*(?:€\s*)?(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const base = m[1] === 'kg' ? 'kg' : (m[1] === 'l' || m[1] === 'liter') ? 'l' : 'Stk';
  return { unitPrice: num(m[2]), base };
}

function unitPriceFor({ price, refPrice, refUnit, quantity, text }) {
  if (refPrice > 0 && refUnit) {
    const u = UNITS[String(refUnit).toLowerCase()];
    if (u) return { unitPrice: round(refPrice / u[1]), base: u[0] };
  }
  const r = parseReference(text);
  if (r) return r;
  const q = quantity || parseQuantity(text);
  if (q && q.amount > 0 && price > 0) return { unitPrice: round(price / q.amount), base: q.base };
  return { unitPrice: null, base: null };
}

function round(x) { return Math.round(x * 100) / 100; }

function status(from, to, now = Date.now()) {
  const f = from ? Date.parse(from) : NaN;
  const t = to ? Date.parse(to) : NaN;
  if (!isNaN(t) && t < now) return 'vorbei';
  if (!isNaN(f) && f > now) return 'kommt';
  return 'läuft';
}

function daysUntil(date, now = Date.now()) {
  return Math.ceil((Date.parse(date) - now) / DAY);
}

// Günstigste zuerst: laufende und kommende Angebote vor abgelaufenen, dann nach Grundpreis, dann Preis.
function sortOffers(list) {
  const rank = { 'läuft': 0, 'kommt': 0, 'vorbei': 1 };
  return list.slice().sort((a, b) =>
    (rank[a.status] - rank[b.status]) ||
    ((a.base || 'zz').localeCompare(b.base || 'zz')) ||
    ((a.unitPrice ?? 1e9) - (b.unitPrice ?? 1e9)) ||
    ((a.price ?? 1e9) - (b.price ?? 1e9)));
}

// Doppelte (gleicher Markt, gleicher Titel, gleicher Preis, gleicher Zeitraum) zusammenfassen.
function dedupe(list) {
  const seen = new Set();
  return list.filter((o) => {
    const k = [o.store, o.title, o.price, o.from, o.to].join('|').toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function matchesStores(o, stores) {
  if (!stores || !stores.length) return true;
  const s = (o.store || '').toLowerCase();
  return stores.some((x) => s.includes(String(x).toLowerCase()));
}

module.exports = { parseQuantity, parseReference, unitPriceFor, status, daysUntil, sortOffers, dedupe, matchesStores, round };
