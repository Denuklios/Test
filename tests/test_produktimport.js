// Produktimport aus einem Shop: Produktseiten, Sitemap, CSV, Übersetzung, Übernahme ohne Preise
const path = require('path'), os = require('os'), fs = require('fs');
const dir = path.join(__dirname, '..', 'rechnung');
let sdkPath;
try { sdkPath = require.resolve('@anthropic-ai/sdk', { paths: [dir] }); } catch { console.log('übersprungen: rechnung/node_modules fehlt'); process.exit(0); }
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-imp-'));
process.env.ANTHROPIC_API_KEY = 'k';
let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FEHL ') + m); if (!c) fails++; };
const eq = (a, b, m) => ok(a === b, `${m}: ${a}${a === b ? '' : ' ≠ ' + b}`);
// nachgestellte Übersetzung
const tr = { 'Polo Classic': ['Polo Classic', 'Polo Classic', 'Polo Classic'] };
class Fake { constructor() { this.beta = { messages: { create: async (req) => {
  const lines = req.messages[0].content.split('\n\n').pop().split('\n');
  const items = lines.map((l) => { const i = parseInt(l, 10); const n = l.replace(/^\d+: /, '').split(' (Marke')[0].split(' – ')[0]; return { i, de: n.replace('Herren ', ''), da: n.replace('Herren ', 'Herre '), en: n.replace('Herren ', "Men's "), unit: 'stk', kind: 'goods' }; });
  return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ items }) }] }; } } }; } }
Object.assign(Fake, { APIError: class extends Error {}, AuthenticationError: class extends Error {}, RateLimitError: class extends Error {}, BadRequestError: class extends Error {} });
require.cache[sdkPath] = { id: sdkPath, filename: sdkPath, loaded: true, exports: { default: Fake } };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const pages = {
  'https://shop.test/de/polo': `<html><head><title>Polo | Shop</title><script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Herren Polo Classic &amp; Co","sku":"L-1001","brand":{"@type":"Brand","name":"Mantis"},"description":"Pique-Polo","image":["/img/polo.png"],"offers":{"@type":"Offer","price":"9.90"}}</script></head></html>`,
  'https://shop.test/de/kappe': `<html><head><meta property="og:title" content="Herren Kappe 6-Panel"><meta property="og:image" content="https://shop.test/img/kappe.png"><title>x</title></head></html>`,
  'https://shop.test/de/login': `<html><head><title>Anmelden – Shop</title></head></html>`,
  'https://shop.test/sitemap.xml': `<urlset><url><loc>https://shop.test/de/polo</loc></url><url><loc>https://shop.test/de/kappe</loc></url><url><loc>https://shop.test/img/a.jpg</loc></url><url><loc>https://other.test/x</loc></url></urlset>`,
};
global.fetch = async (url) => {
  const u = String(url);
  if (u.endsWith('.png')) return new Response(png, { status: 200, headers: { 'content-type': 'image/png' } });
  if (pages[u]) return Object.defineProperty(new Response(pages[u], { status: 200, headers: { 'content-type': 'text/html' } }), 'url', { value: u });
  return new Response('nope', { status: 404 });
};
const P = require(path.join(dir, 'products.js'));
const RS = require(path.join(dir, 'server.js'));
const A = (m, p, b = {}) => RS.api(m, p.split('/'), b, new URL('http://x/?'));
(async () => {
  const p1 = await P.fromUrl('https://shop.test/de/polo');
  eq(p1.name, 'Herren Polo Classic & Co', 'Name aus Suchmaschinen-Daten (Sonderzeichen entschlüsselt)');
  eq(p1.sku, 'L-1001', 'Artikelnummer'); eq(p1.brand, 'Mantis', 'Marke');
  ok(p1.image.startsWith('data:image/png;base64,'), 'Bild geladen (relative Adresse aufgelöst)');
  ok(!('price' in p1), 'kein Preis übernommen');
  const p2 = await P.fromUrl('https://shop.test/de/kappe');
  eq(p2.name, 'Herren Kappe 6-Panel', 'Name aus og:title bei Seiten ohne Suchmaschinen-Daten');
  try { await P.fromUrl('https://shop.test/de/login'); ok(false, 'Login'); } catch (e) { ok(/Anmeldeseite|Login/.test(e.message), 'Anmeldeseite erkannt: ' + e.message.slice(0, 50)); }
  try { await P.fromUrl('https://shop.test/de/404'); ok(false, '404'); } catch (e) { ok(/Fehler 404/.test(e.message), 'Fehlerseite gemeldet'); }
  const links = await P.collectLinks('https://shop.test/sitemap.xml');
  eq(links.length, 2, 'Sitemap: nur Seiten des Shops, keine Bilder/fremden Seiten');
  const csv = P.fromCsv('Artikelnummer;Bezeichnung;Marke;EK-Preis\nA1;"Herren T-Shirt, weiß";Mantis;3,50\nA2;Sweatshirt;Mantis;7,00\n');
  eq(csv.rows.length, 2, 'CSV: Zeilen'); eq(csv.rows[0].name, 'Herren T-Shirt, weiß', 'CSV: Name mit Komma'); ok(!('price' in csv.rows[0]), 'CSV: Einkaufspreis nicht übernommen');
  ok(!!P.fromCsv('Foo;Bar\n1;2').error, 'CSV ohne Namensspalte → verständlicher Fehler');
  // über die Programmschnittstelle
  const r = await A('POST', 'products/import/preview', { urls: 'https://shop.test/de/polo\nhttps://shop.test/de/kappe\nhttps://shop.test/de/login' });
  eq(r.items.length, 2, 'Vorschau: 2 Produkte'); eq(r.errors.length, 1, 'Vorschau: 1 Adresse nicht lesbar');
  eq(r.items[0].da, 'Herre Polo Classic & Co', 'Übersetzung Dänisch'); eq(r.items[0].en, "Men's Polo Classic & Co", 'Übersetzung Englisch');
  const sm = await A('POST', 'products/import/preview', { urls: 'https://shop.test/sitemap.xml', expand: true });
  eq(sm.items.length, 2, 'Sitemap-Adresse wird zu Produkten');
  const s1 = await A('POST', 'products/import/save', { items: r.items });
  eq(s1.added, 2, 'übernommen');
  const prod = RS.getState().products[0];
  eq(prod.price, '', 'Preis bleibt leer'); eq(prod.name_da, 'Herre Polo Classic & Co', 'dänischer Name gespeichert'); eq(prod.sku, 'L-1001', 'Artikelnummer gespeichert'); ok(prod.image.startsWith('data:image/png'), 'Bild gespeichert');
  const s2 = await A('POST', 'products/import/save', { items: r.items });
  eq(s2.added, 0, 'zweiter Import: keine Doppelten'); eq(s2.skipped, 2, 'als „schon vorhanden“ übersprungen');
  const again = await A('POST', 'products/import/preview', { urls: 'https://shop.test/de/polo' });
  ok(again.items[0].exists, 'Vorschau markiert vorhandene Produkte');
  const bad = await A('POST', 'products/import/save', { items: [{ de: 'X', image: 'javascript:alert(1)', unit: 'xx', kind: 'services' }] });
  eq(RS.getState().products.at(-1).image, '', 'ungültiges Bild verworfen'); eq(RS.getState().products.at(-1).unit, 'stk', 'ungültige Einheit ersetzt');
  console.log(fails ? `\n${fails} Fehler` : '\nAlle Tests bestanden'); process.exit(fails ? 1 : 0);
})();
