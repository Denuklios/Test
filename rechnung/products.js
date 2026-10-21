/* Produktimport: Produktseiten eines Shops abrufen (Name, Artikelnummer, Marke, Bild), Namen ins Dänische und
   Englische übersetzen. Preise werden bewusst NICHT übernommen (Einkaufspreis ≠ Verkaufspreis). */
'use strict';
let Anthropic = null;
try { Anthropic = require('@anthropic-ai/sdk').default; } catch { /* ohne Paket keine Übersetzung */ }

const MAX_IMG = 450000;
const decode = (s) => String(s || '').replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp|auml|ouml|uuml|szlig|Auml|Ouml|Uuml);/gi, (m, e) => {
  const t = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', auml: 'ä', ouml: 'ö', uuml: 'ü', szlig: 'ß', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü' };
  if (t[e]) return t[e];
  const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
  return Number.isFinite(n) ? String.fromCodePoint(n) : m;
}).replace(/\s+/g, ' ').trim();
const text = (v) => (Array.isArray(v) ? text(v[0]) : typeof v === 'object' && v ? text(v.name || v['@id'] || '') : decode(v));

// schema.org-Produktdaten (JSON-LD) aus einer Seite holen – das bieten fast alle Shops für Suchmaschinen an
function jsonLdProducts(html) {
  const out = [];
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    const t = [].concat(n['@type'] || []).map(String);
    if (t.includes('Product') || t.includes('ProductGroup')) out.push(n); // Produktgruppe = ein Artikel mit Farben/Größen
    walk(n['@graph']); walk(n.mainEntity); walk(n.itemListElement); walk(n.item);
  };
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(m[1].trim())); } catch { /* kaputtes JSON überspringen */ }
  }
  return out;
}
const meta = (html, prop) => {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, 'i')) || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, 'i'));
  return m ? decode(m[1]) : '';
};

function parsePage(html, url) {
  const p = jsonLdProducts(html)[0];
  let name, sku, brand, image, description;
  if (p) {
    const v = [].concat(p.hasVariant || [])[0] || {};
    name = text(p.name || v.name); sku = text(p.productGroupID || p.sku || p.mpn || p.productID || v.sku || ''); brand = text(p.brand || v.brand); description = text(p.description || v.description);
    image = text([].concat(p.image || v.image || [])[0]);
  } else {
    name = meta(html, 'og:title') || decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
    description = meta(html, 'og:description') || meta(html, 'description');
    image = meta(html, 'og:image');
    sku = meta(html, 'product:retailer_item_id') || '';
  }
  if (!name) return null;
  try { if (image) image = new URL(image, url).href; } catch { image = ''; }
  return { name, sku, brand, description: description.slice(0, 400), image, url, structured: !!p };
}

async function fetchText(url, opts = {}) {
  const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000), ...opts, headers: { 'User-Agent': 'Mozilla/5.0 (RechnungsStudio Produktimport)', 'Accept-Language': 'de', ...(opts.headers || {}) } });
  if (!r.ok) throw new Error(`Seite antwortet mit Fehler ${r.status}`);
  return r;
}

async function fetchImage(url) {
  try {
    const r = await fetchText(url);
    const type = (r.headers.get('content-type') || '').split(';')[0];
    if (!/^image\/(jpeg|png|webp)$/.test(type)) return '';
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.length <= MAX_IMG ? `data:${type};base64,${buf.toString('base64')}` : '';
  } catch { return ''; }
}

// eine Produktseite abrufen
async function fromUrl(url) {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol)) throw new Error('Nur http(s)-Adressen');
  const r = await fetchText(u.href);
  const html = await r.text();
  const prod = parsePage(html, r.url || u.href);
  if (!prod) throw new Error('Keine Produktdaten gefunden – evtl. ist eine Anmeldung nötig');
  if (/anmeld|login|einloggen/i.test(prod.name) && !prod.structured) throw new Error('Das ist die Anmeldeseite – der Shop zeigt Produkte nur nach Login. Bitte den CSV-Import nutzen.');
  prod.image = prod.image ? await fetchImage(prod.image) : '';
  return prod;
}

// aus einer Seite/Sitemap alle Produktseiten-Adressen sammeln (gleicher Shop)
async function collectLinks(url, limit = 60) {
  const u = new URL(url);
  const r = await fetchText(u.href);
  const body = await r.text();
  const found = new Set();
  if (/<urlset|<sitemapindex/i.test(body)) for (const m of body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) found.add(decode(m[1]));
  else for (const m of body.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)) { try { found.add(new URL(decode(m[1]), r.url || u.href).href); } catch { /* ungültig */ } }
  const same = [...found].filter((l) => { try { return new URL(l).host === u.host && !/\.(jpg|png|gif|css|js|pdf|svg|webp)(\?|$)/i.test(l); } catch { return false; } });
  return same.slice(0, limit);
}

/* CSV aus einer Shop-Preisliste/Exportdatei: Spalten für Artikelnummer, Name, Marke (Namen werden erkannt) */
function fromCsv(textIn) {
  const lines = String(textIn).replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], error: 'Die Datei enthält keine Zeilen.' };
  const sep = [';', ',', '\t'].sort((a, b) => lines[0].split(b).length - lines[0].split(a).length)[0];
  const split = (line) => { const o = []; let c = '', q = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (q) { if (ch === '"' && line[i + 1] === '"') { c += '"'; i++; } else if (ch === '"') q = false; else c += ch; } else if (ch === '"') q = true; else if (ch === sep) { o.push(c.trim()); c = ''; } else c += ch; } o.push(c.trim()); return o; };
  const head = split(lines[0]).map((h) => h.toLowerCase());
  const col = (re) => head.findIndex((h) => re.test(h));
  const iName = col(/^(name|artikelname|bezeichnung|produkt|titel|title|artikelbezeichnung|beschreibung)/);
  const iSku = col(/artikel.?(nr|nummer)|sku|art\.?-?nr|item|bestell/);
  const iBrand = col(/marke|brand|hersteller/);
  if (iName < 0) return { rows: [], error: 'Keine Spalte mit dem Produktnamen gefunden (erwartet z. B. „Name“, „Bezeichnung“, „Artikelname“).' };
  const rows = lines.slice(1).map((l) => { const c = split(l); return { name: decode(c[iName]), sku: iSku >= 0 ? decode(c[iSku]) : '', brand: iBrand >= 0 ? decode(c[iBrand]) : '', description: '', image: '', url: '' }; }).filter((r) => r.name);
  return { rows };
}

/* Namen übersetzen: Deutsch, Dänisch, Englisch + Einheit/Art. Günstiges Modell (Bruchteile eines Cents je Produkt). */
const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['items'],
  properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['i', 'de', 'da', 'en', 'unit', 'kind'], properties: {
    i: { type: 'integer' }, de: { type: 'string' }, da: { type: 'string' }, en: { type: 'string' },
    unit: { type: 'string', enum: ['stk', 'pakke', 'm', 'm2', 'kg', 'timer', ''] }, kind: { type: 'string', enum: ['goods', 'services'] } } } } },
};
async function translate(products, apiKey) {
  if (!Anthropic || !apiKey) return products.map((p) => ({ ...p, de: p.name, da: '', en: '', unit: 'stk', kind: 'goods', translated: false }));
  const client = new Anthropic({ apiKey });
  const out = [];
  for (let s = 0; s < products.length; s += 25) {
    const part = products.slice(s, s + 25);
    const list = part.map((p, i) => `${i}: ${p.name}${p.brand ? ` (Marke ${p.brand})` : ''}${p.description ? ` – ${p.description.slice(0, 120)}` : ''}`).join('\n');
    const res = await client.beta.messages.create({
      model: 'claude-haiku-5-5', max_tokens: 8000, output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: `Das sind Artikel eines deutschen Großhändlers für Textilien/Stickerei-Rohlinge/Zubehör. Für jede Zeile (Nummer: Name) gib an:
- de: kurzer, sauberer deutscher Produktname für eine Rechnung (ohne Werbetext, ohne Artikelnummer; Marke und Typ behalten, Farbe/Größe nur wenn im Namen)
- da: derselbe Name auf Dänisch, en: auf Englisch (übliche Fachbegriffe verwenden, Markennamen nie übersetzen)
- unit: Verkaufseinheit (stk = Stück, pakke = Paket, m, m2, kg, timer, sonst leer) – bei Textilien meist stk
- kind: goods (Ware) oder services (Dienstleistung)
Erfinde nichts dazu. Gib die Nummer i unverändert zurück.\n\n${list}` }],
    });
    const t = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    let items = [];
    try { items = JSON.parse(t).items || []; } catch { /* ohne Übersetzung weiter */ }
    part.forEach((p, i) => { const x = items.find((it) => it.i === i); out.push(x ? { ...p, de: x.de || p.name, da: x.da, en: x.en, unit: x.unit || 'stk', kind: x.kind, translated: true } : { ...p, de: p.name, da: '', en: '', unit: 'stk', kind: 'goods', translated: false }); });
  }
  return out;
}

module.exports = { parsePage, jsonLdProducts, fromUrl, collectLinks, fromCsv, translate };
