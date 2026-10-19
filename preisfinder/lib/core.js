'use strict';
// Suchen, Preisverlauf merken, Merkliste prüfen und Preisalarm schicken.
const { sortOffers, dedupe, matchesStores, round } = require('./offers');

const SOURCES = { de: require('../sources/marktguru'), dk: require('../sources/tjek') };
const CACHE_MS = 30 * 60e3;

function createCore(store, { fetchFn = fetch, sources = SOURCES, now = () => Date.now() } = {}) {
  const cache = new Map();
  const S = () => store.data.settings;

  async function rawSearch(q) {
    const s = S();
    const key = `${s.country}|${s.zip}|${s.radius}|${q.toLowerCase()}`;
    const hit = cache.get(key);
    if (hit && now() - hit.at < CACHE_MS) return hit.list;
    const src = sources[s.country] || sources.de;
    const list = dedupe(await src.search(q, { zip: s.zip, radius: (s.radius || 15) * 1000, fetchFn }));
    cache.set(key, { at: now(), list });
    if (cache.size > 300) cache.delete(cache.keys().next().value);
    return list;
  }

  // Bestpreis des Tages je Suchbegriff merken
  function record(q, list) {
    const day = new Date(now()).toISOString().slice(0, 10);
    const live = list.filter((o) => o.status !== 'vorbei' && o.price != null);
    if (!live.length) return;
    const h = (store.data.history[q.toLowerCase()] ||= {});
    const cheapest = live.reduce((a, b) => (b.price < a.price ? b : a));
    const withUnit = live.filter((o) => o.unitPrice != null);
    const base = mostCommon(withUnit.map((o) => o.base));
    const unitList = withUnit.filter((o) => o.base === base);
    const bestUnit = unitList.length ? unitList.reduce((a, b) => (b.unitPrice < a.unitPrice ? b : a)) : null;
    const prev = h[day];
    h[day] = {
      min: prev ? Math.min(prev.min, cheapest.price) : cheapest.price,
      minUnit: bestUnit ? (prev && prev.minUnit != null && prev.base === base ? Math.min(prev.minUnit, bestUnit.unitPrice) : bestUnit.unitPrice) : (prev ? prev.minUnit : null),
      base: base || (prev && prev.base) || null,
      store: cheapest.store,
    };
    // höchstens 400 Tage aufheben
    const days = Object.keys(h).sort();
    while (days.length > 400) delete h[days.shift()];
    store.save();
  }

  function stats(q) {
    const h = store.data.history[q.toLowerCase()] || {};
    const days = Object.keys(h).sort();
    const since = new Date(now() - 90 * 86400e3).toISOString().slice(0, 10);
    const recent = days.filter((d) => d >= since).map((d) => ({ day: d, ...h[d] }));
    if (!recent.length) return { days: 0, series: [] };
    const units = recent.filter((r) => r.minUnit != null);
    return {
      days: recent.length,
      lowest: Math.min(...recent.map((r) => r.min)),
      lowestUnit: units.length ? Math.min(...units.map((r) => r.minUnit)) : null,
      avgUnit: units.length ? round(units.reduce((a, r) => a + r.minUnit, 0) / units.length) : null,
      base: units.length ? units[units.length - 1].base : null,
      series: recent,
    };
  }

  async function search(q, { stores, includeOld = false } = {}) {
    q = String(q || '').trim().slice(0, 80);
    if (!q) return { q, offers: [], stats: { days: 0, series: [] } };
    const s = S();
    let list = await rawSearch(q);
    record(q, list);
    const filter = stores && stores.length ? stores : s.stores;
    list = list.filter((o) => matchesStores(o, filter));
    if (s.hideLoyalty) list = list.filter((o) => !o.loyalty);
    if (!includeOld) list = list.filter((o) => o.status !== 'vorbei');
    const st = stats(q);
    // "Top-Preis": so günstig wie der beste Grundpreis der letzten 90 Tage (mind. 7 Tage Verlauf)
    if (st.days >= 7 && st.lowestUnit != null) {
      for (const o of list) if (o.base === st.base && o.unitPrice != null && o.unitPrice <= st.lowestUnit * 1.02) o.top = true;
    }
    return { q, offers: sortOffers(list), stats: st, source: (sources[s.country] || sources.de).name };
  }

  function matchesWatch(o, w) {
    if (o.status === 'vorbei') return false;
    if (w.maxPrice != null && w.maxPrice !== '' && !(o.price <= +w.maxPrice)) return false;
    if (w.maxUnitPrice != null && w.maxUnitPrice !== '' && !(o.unitPrice != null && o.unitPrice <= +w.maxUnitPrice)) return false;
    return true;
  }

  async function checkWatch(w) {
    const r = await search(w.q, { stores: w.stores });
    const hits = r.offers.filter((o) => matchesWatch(o, w));
    w.hits = hits.slice(0, 20);
    w.lastCheck = new Date(now()).toISOString();
    w.notified ||= [];
    const fresh = hits.filter((o) => !w.notified.includes(o.id));
    for (const o of fresh) {
      w.notified.push(o.id);
      store.data.news.unshift({ at: w.lastCheck, watchId: w.id, q: w.q, offer: o });
    }
    w.notified = w.notified.slice(-500);
    store.data.news = store.data.news.slice(0, 200);
    store.save();
    return fresh;
  }

  async function checkAll() {
    const fresh = [];
    const errors = [];
    for (const w of store.data.watch) {
      try { for (const o of await checkWatch(w)) fresh.push({ w, o }); }
      catch (e) { errors.push(`${w.q}: ${e.message}`); }
    }
    if (fresh.length) await notify(fresh);
    return { fresh: fresh.length, errors };
  }

  // Push aufs Handy über ntfy.sh (kostenlose App, kein Konto nötig)
  async function notify(fresh) {
    const topic = S().ntfyTopic;
    if (!topic) return;
    const lines = fresh.slice(0, 10).map(({ o }) => `${o.title} – ${money(o.price, o.currency)} bei ${o.store}${o.status === 'kommt' ? ` (ab ${fmtDate(o.from)})` : ` (bis ${fmtDate(o.to)})`}`);
    if (fresh.length > 10) lines.push(`… und ${fresh.length - 10} weitere`);
    try {
      await fetchFn(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
        method: 'POST',
        headers: { Title: `Preisalarm: ${fresh.length} neue${fresh.length === 1 ? 's' : ''} Angebot${fresh.length === 1 ? '' : 'e'}`, Tags: 'shopping_cart' },
        body: lines.join('\n'),
      });
    } catch { /* Push ist optional */ }
  }

  return { search, stats, checkWatch, checkAll, matchesWatch, notify, clearCache: () => cache.clear() };
}

function mostCommon(arr) {
  const c = {};
  let best = null;
  for (const x of arr) if (x) { c[x] = (c[x] || 0) + 1; if (!best || c[x] > c[best]) best = x; }
  return best;
}
function money(v, cur = 'EUR') { return v == null ? '?' : `${v.toFixed(2).replace('.', ',')} ${cur === 'EUR' ? '€' : 'kr.'}`; }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '?'; }

module.exports = { createCore, SOURCES };
