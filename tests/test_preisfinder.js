// Preisfinder: Grundpreise, Status, Quellen (mit nachgestellten Antworten), Merkliste, Server
const os = require('os');
const fs = require('fs');
const path = require('path');
const O = require('../preisfinder/lib/offers');
const MG = require('../preisfinder/sources/marktguru');
const TJ = require('../preisfinder/sources/tjek');
const { open } = require('../preisfinder/lib/store');
const { createCore } = require('../preisfinder/lib/core');
const { createServer } = require('../preisfinder/server');

let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FEHL ') + m); if (!c) fails++; };
const DAY = 86400e3;
const iso = (d) => new Date(Date.now() + d * DAY).toISOString();

// --- Mengen und Grundpreise
ok(JSON.stringify(O.parseQuantity('Frische Milch 1-l-Packung')) === '{"amount":1,"base":"l"}', 'Menge: 1-l-Packung');
ok(Math.abs(O.parseQuantity('500 g Packung').amount - 0.5) < 1e-9, 'Menge: 500 g');
ok(O.parseQuantity('6 x 1,5 l').amount === 9, 'Menge: 6 x 1,5 l');
ok(O.parseQuantity('Toilettenpapier 10 Rollen').base === 'Stk', 'Menge: 10 Rollen');
ok(O.unitPriceFor({ price: 4.99, text: 'Kaffee 500 g (1 kg = 9,98)' }).unitPrice === 9.98, 'Grundpreis aus Text "1 kg = 9,98"');
ok(O.unitPriceFor({ price: 1.19, text: 'Milch 1 l' }).unitPrice === 1.19, 'Grundpreis aus Menge');
ok(O.unitPriceFor({ price: 2, refPrice: 0.4, refUnit: 'g' }).unitPrice === 400, 'Grundpreis aus Referenzpreis je g → je kg');
ok(O.status(iso(-1), iso(2)) === 'läuft' && O.status(iso(3), iso(8)) === 'kommt' && O.status(iso(-9), iso(-2)) === 'vorbei', 'Status läuft / kommt / vorbei');

// --- Nachgestelltes Internet
const mgOffers = [
  { id: 1, price: 1.19, oldPrice: 1.49, referencePrice: 1.19, unit: { shortName: 'l' }, description: '1-l-Packung, 3,5 % Fett', product: { name: 'Frische Vollmilch' }, brand: { name: 'Weihenstephan' }, advertisers: [{ name: 'REWE' }], validityDates: [{ from: iso(-2), to: iso(3) }] },
  { id: 2, price: 0.99, description: 'je 1-l-Packung', product: { name: 'H-Milch' }, advertisers: [{ name: 'Lidl' }], validityDates: [{ from: iso(4), to: iso(9) }] },
  { id: 3, price: 0.89, description: '1 l', product: { name: 'Alte Milch' }, advertisers: [{ name: 'Aldi Süd' }], validityDates: [{ from: iso(-10), to: iso(-3) }] },
  { id: 4, price: 1.79, description: '1,5-l-Flasche', product: { name: 'Bio-Milch' }, advertisers: [{ name: 'Kaufland' }], requiresLoyalityMembership: true, validityDates: [{ from: iso(-1), to: iso(5) }] },
];
const calls = [];
let homeCalls = 0;
let reject = 0;
async function fakeFetch(url, opt = {}) {
  calls.push({ url, opt });
  const r = (status, body, text) => ({ ok: status < 400, status, json: async () => body, text: async () => text ?? JSON.stringify(body) });
  if (url === 'https://www.marktguru.de/') { homeCalls++; return r(200, null, '<html><script type="application/json">{"config":{"apiKey":"AK","clientKey":"CK"}}</script></html>'); }
  if (url.startsWith('https://api.marktguru.de/')) {
    if (reject > 0) { reject--; return r(401, {}); }
    if (opt.headers['x-apikey'] !== 'AK') return r(401, {});
    return r(200, { results: /q=milch/i.test(url) ? mgOffers : [], totalResults: 4 });
  }
  if (url.startsWith('https://nominatim')) return r(200, [{ lat: '55.4', lon: '10.4' }]);
  if (url.startsWith('https://squid-api.tjek.com/')) return r(200, [{ id: 'x1', heading: 'Arla Letmælk', description: '1 liter', dealer: { name: 'Netto' }, pricing: { price: 9.95, pre_price: 12.95, currency: 'DKK' }, quantity: { unit: { symbol: 'l', si: { symbol: 'l', factor: 1 } }, size: { from: 1, to: 1 }, pieces: { from: 1, to: 1 } }, run_from: iso(-1), run_till: iso(4), images: { view: 'https://img/x.jpg' } }]);
  if (url.startsWith('https://ntfy.sh/')) return r(200, {});
  return r(404, {});
}

(async () => {
  ok(MG.extractKeys('<script type="application/json">{"apiKey":"a1","clientKey":"c1"}</script>').clientKey === 'c1', 'marktguru: Schlüssel aus Startseite lesen');
  MG.reset();
  const mg = await MG.search('Milch', { zip: '80331', fetchFn: fakeFetch });
  ok(mg.length === 4 && mg[0].store === 'REWE' && mg[0].title === 'Weihenstephan Frische Vollmilch' && mg[0].unitPrice === 1.19 && mg[0].base === 'l', 'marktguru: Angebot vereinheitlicht');
  ok(mg[1].status === 'kommt' && mg[2].status === 'vorbei' && mg[3].loyalty, 'marktguru: kommt / vorbei / Kundenkarte erkannt');
  ok(Math.abs(mg[3].unitPrice - 1.19) < 0.01, 'marktguru: Grundpreis 1,5-l-Flasche');
  ok(calls.some((c) => /zipCode=80331/.test(c.url)), 'marktguru: Postleitzahl wird mitgeschickt');
  reject = 1; const before = homeCalls;
  await MG.search('Milch', { fetchFn: fakeFetch });
  ok(homeCalls === before + 1, 'marktguru: abgelehnter Schlüssel wird einmal erneuert');

  const tj = await TJ.search('mælk', { zip: '5000', fetchFn: fakeFetch });
  ok(tj.length === 1 && tj[0].store === 'Netto' && tj[0].currency === 'DKK' && tj[0].unitPrice === 9.95 && tj[0].base === 'l' && tj[0].status === 'läuft', 'Tjek (Dänemark): Angebot vereinheitlicht');

  // --- Kern: Suche, Verlauf, Merkliste, Push
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-'));
  const store = open(dir);
  store.data.settings.zip = '80331';
  const core = createCore(store, { fetchFn: fakeFetch });
  let r = await core.search('Milch');
  ok(r.offers.length === 3 && !r.offers.some((o) => o.status === 'vorbei'), 'Suche: abgelaufene Angebote ausgeblendet');
  ok(r.offers[0].price === 0.99, 'Suche: günstigster Grundpreis zuerst');
  ok(store.data.history.milch && Object.values(store.data.history.milch)[0].minUnit === 0.99, 'Preisverlauf: Bestpreis des Tages gemerkt');
  store.data.settings.hideLoyalty = true; core.clearCache();
  r = await core.search('Milch');
  ok(r.offers.length === 2, 'Suche: Kundenkarten-Angebote ausblendbar');
  r = await core.search('Milch', { stores: ['rewe'] });
  ok(r.offers.length === 1 && r.offers[0].store === 'REWE', 'Suche: Filter nach Markt');

  // 10 Tage Verlauf → Top-Preis
  for (let i = 1; i <= 10; i++) store.data.history.milch[new Date(Date.now() - i * DAY).toISOString().slice(0, 10)] = { min: 1.09, minUnit: 1.09, base: 'l', store: 'X' };
  r = await core.search('Milch');
  ok(r.offers.find((o) => o.price === 0.99).top && !r.offers.find((o) => o.price === 1.19).top, 'Top-Preis: günstiger als alles in 90 Tagen');
  ok(r.stats.lowestUnit === 0.99 && r.stats.days >= 10, 'Statistik über 90 Tage');

  store.data.watch.push({ id: 'w1', q: 'Milch', maxPrice: 1.0, maxUnitPrice: null, stores: [], notified: [], hits: [] });
  let c = await core.checkAll();
  ok(c.fresh === 1 && store.data.news.length === 1 && store.data.news[0].offer.status === 'kommt', 'Preisalarm: kommendes Angebot unter Höchstpreis gemeldet');
  ok(!calls.some((x) => x.url.startsWith('https://ntfy.sh/')), 'Preisalarm: ohne ntfy-Thema kein Push');
  store.data.settings.ntfyTopic = 'test-abc';
  c = await core.checkAll();
  ok(c.fresh === 0, 'Preisalarm: dasselbe Angebot wird nicht doppelt gemeldet');
  store.data.watch[0].notified = []; store.data.news = [];
  await core.checkAll();
  const push = calls.filter((x) => x.url === 'https://ntfy.sh/test-abc');
  ok(push.length === 1 && /H-Milch/.test(push[0].opt.body) && /ab /.test(push[0].opt.body), 'Push über ntfy mit „ab Datum“');
  store.flush();
  ok(JSON.parse(fs.readFileSync(store.file, 'utf8')).watch.length === 1, 'Daten werden gespeichert');

  // --- Server mit Passwort
  const srv = createServer({ store, core, password: 'geheim123', secret: 's' }).listen(0);
  await new Promise((res) => srv.once('listening', res));
  const base = `http://127.0.0.1:${srv.address().port}`;
  let res = await fetch(`${base}/api/state`);
  ok(res.status === 401, 'Server: ohne Anmeldung kein Zugriff');
  res = await fetch(`${base}/login`, { method: 'POST', body: 'password=falsch', headers: { 'content-type': 'application/x-www-form-urlencoded' }, redirect: 'manual' });
  ok(res.status === 401, 'Server: falsches Passwort abgelehnt');
  res = await fetch(`${base}/login`, { method: 'POST', body: 'password=geheim123', headers: { 'content-type': 'application/x-www-form-urlencoded' }, redirect: 'manual' });
  const cookie = (res.headers.get('set-cookie') || '').split(';')[0];
  ok(res.status === 303 && cookie.startsWith('pf='), 'Server: Anmeldung setzt Cookie');
  const H = { cookie, 'content-type': 'application/json' };
  res = await fetch(`${base}/api/search?q=Milch`, { headers: H });
  const sr = await res.json();
  ok(res.ok && sr.offers.length >= 1, 'Server: Suche');
  res = await fetch(`${base}/api/shopping`, { method: 'POST', headers: H, body: JSON.stringify({ text: 'H-Milch', store: 'Lidl', price: 0.99 }) });
  const it = await res.json();
  res = await fetch(`${base}/api/shopping/${it.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ done: true }) });
  ok((await res.json()).done === true, 'Server: Einkaufsliste abhaken');
  await fetch(`${base}/api/shopping`, { method: 'DELETE', headers: H });
  ok(store.data.shopping.length === 0, 'Server: erledigte Einträge entfernen');
  res = await fetch(`${base}/api/settings`, { method: 'PUT', headers: H, body: JSON.stringify({ country: 'xx', zip: '12<b>34', ntfyTopic: 'a b/c' }) });
  const s = await res.json();
  ok(s.country === 'de' && s.zip === '12b34' && s.ntfyTopic === 'abc', 'Server: Einstellungen werden geprüft');
  res = await fetch(`${base}/../server.js`, { headers: H });
  ok(res.status === 404 || !(await res.text()).includes('createServer'), 'Server: kein Zugriff außerhalb von public');
  res = await fetch(`${base}/`, { headers: H });
  ok((await res.text()).includes('id="tab-search"'), 'Server: Oberfläche wird ausgeliefert');
  srv.close();
  fs.rmSync(dir, { recursive: true, force: true });

  console.log(fails ? `\n${fails} Fehler` : '\nAlle Tests bestanden');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
