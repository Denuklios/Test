/* Produktimport: Produktseiten eines Shops lesen (Name, Artikelnummer, Marke, Material, Gewicht, Größen, Farben, Bild,
   Einkaufspreis), den Seitentext von der KI auswerten und ins Deutsche, Dänische und Englische übertragen.
   Der Name des Shops wird überall entfernt, damit er nicht auf Kundendokumenten auftaucht.
   Der Preis ist der EINKAUFSPREIS; der Verkaufspreis bleibt leer. */
'use strict';
let Anthropic = null;
try { Anthropic = require('@anthropic-ai/sdk').default; } catch { /* ohne Paket keine Übersetzung */ }

const MAX_IMG = 450000;
// Prüf-/Sperrseiten von Bot-Schutz (Cloudflare & Co.) – das sind keine Produkte
const BOT_RE = /bot-?validierung|just a moment|attention required|access denied|captcha|verifying you are human|are you a robot|pardon our interruption|checking your browser|zugriff verweigert|sicherheitsüberprüfung|security check|nicht als roboter/i;
const BOT_MSG = 'Der Shop hat das Programm als Roboter erkannt und zeigt nur eine Prüfseite (Bot-Schutz). Öffne die Produktseiten im Browser, speichere sie mit Strg + S (als „Webseite, nur HTML“) und lade die Dateien unter „Gespeicherte Seiten“ hoch. Oder nimm den CSV-Weg.';
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

/* Shop-Namen aus Texten entfernen (aus der Adresse abgeleitet, z. B. „l-shop-team“ → „L-SHOP-TEAM“, „L Shop Team“, „LShopTeam“) */
function shopPattern(host) {
  const parts = String(host || '').replace(/^(www|shop|store|webshop)\./i, '').split('.');
  const sld = (parts.length > 1 ? parts.slice(0, -1).join('-') : parts[0]).replace(/[^a-z0-9-]/gi, '');
  if (sld.length < 3) return null;
  return new RegExp(sld.split('-').filter(Boolean).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[-\\s_.]?'), 'ig');
}
function scrub(str, host) {
  let t = String(str || '');
  const re = shopPattern(host);
  if (re) t = t.replace(re, ' ');
  return t.replace(/\s+\|\s+(?:\|\s+)+/g, ' | ').replace(/\s{2,}/g, ' ').replace(/^[\s|–—-]+|[\s|–—-]+$/g, '').trim();
}
/* Seitentitel „BCWG002 Influence Hoodie | B&C BE INSPIRED | L-SHOP-TEAM | Deutschland“ → Name, Artikelnummer, Marke */
function cleanTitle(title, host) {
  const segs = scrub(title, host).split(/\s+[|–—]\s+|\s+-\s+/).map((x) => x.trim()).filter(Boolean);
  const generic = /^(deutschland|germany|österreich|schweiz|online[- ]?shop|shop|startseite|home|kaufen|großhandel|wiederverkäufer)$/i;
  let name = segs[0] || '', sku = '', brand = '';
  const m = name.match(/^([A-Z]{1,6}[A-Z0-9-]*\d[A-Z0-9-]*)\s+(.+)$/);
  if (m) { sku = m[1]; name = m[2]; }
  brand = segs.slice(1).find((x) => !generic.test(x) && x.length < 40) || '';
  return { name, sku, brand };
}
// sichtbarer Text einer Seite (ohne Skripte, Navigation und Fußzeile), für die KI
function pageText(html, max = 20000) {
  let h = html.replace(/<head[\s\S]*?<\/head>/i, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|svg|noscript|nav|footer|header|form|iframe)[\s\S]*?<\/\1>/gi, ' ');
  h = h.replace(/<\/(p|div|li|tr|h[1-6]|br|section|article|table|dd|dt)>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ');
  const t = decode0(h).split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l.length > 1).join('\n');
  return t.slice(0, max);
}
const decode0 = (s) => String(s).replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp|auml|ouml|uuml|szlig|Auml|Ouml|Uuml|euro|sup2);/gi, (m, e) => {
  const t = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', auml: 'ä', ouml: 'ö', uuml: 'ü', szlig: 'ß', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', euro: '€', sup2: '²' };
  if (t[e]) return t[e];
  const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
  return Number.isFinite(n) ? String.fromCodePoint(n) : m;
});
/* Einfache Erkennung ohne KI: Gewicht (g/m²), Material in Prozent, Größen */
function heuristics(txt) {
  const out = {};
  const g = txt.match(/(\d{2,3})\s*(?:g\s*\/\s*m\s*[²2]|gsm|g\s*\/\s*qm)/i);
  if (g) out.gsm = g[1];
  const mat = txt.match(/\b\d{1,3}\s?%\s?[A-Za-zäöüÄÖÜ]{3,}(?:[ ,/&]+(?:und\s+)?\d{1,3}\s?%\s?[A-Za-zäöüÄÖÜ]{3,})*/);
  if (mat) out.material = mat[0].replace(/\s+/g, ' ').trim();
  const order = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', 'XXL', 'XXXL'];
  const found = order.filter((z) => new RegExp(`(?:^|[\\s,;/|·•])${z}(?=$|[\\s,;/|·•])`).test(txt));
  if (found.length >= 3) out.sizes = `${found[0]}–${found[found.length - 1]}`;
  return out;
}

// Produktbild suchen, wenn die Seite weder Suchmaschinen-Daten noch og:image hat:
// bevorzugt Bilder, deren Adresse/Beschreibung zu Artikelnummer oder Name passt, sonst das erste „echte“ Bild
function pickImage(html, sku, name) {
  const body = html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, '');
  const found = [];
  for (const m of body.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src = (tag.match(/\b(?:data-zoom-image|data-large|data-src|data-original|src)=["']([^"']+)["']/i) || [])[1];
    if (!src || /^data:/.test(src) || !/\.(jpe?g|png|webp)(\?|$)/i.test(src)) continue;
    if (/logo|icon|sprite|banner|flag|payment|badge|placeholder|loader|pixel|favicon|social/i.test(src + ' ' + (tag.match(/\balt=["']([^"']*)/i) || [])[1])) continue;
    const w = parseInt((tag.match(/\bwidth=["']?(\d+)/i) || [])[1], 10);
    if (w && w < 80) continue;
    found.push({ src: decode(src), tag });
  }
  const words = [sku, ...String(name || '').split(/\s+/).filter((w) => w.length > 3)].filter(Boolean).map((w) => w.toLowerCase());
  const hit = found.find((f) => words.some((w) => f.tag.toLowerCase().includes(w)));
  return (hit || found[0] || {}).src || '';
}

function parsePage(html, url) {
  let host = '';
  try { host = new URL(url).host; } catch { /* ohne Adresse kein Shop-Name */ }
  const p = jsonLdProducts(html)[0];
  let name, sku, brand, image, description;
  if (p) {
    const v = [].concat(p.hasVariant || [])[0] || {};
    name = text(p.name || v.name); sku = text(p.productGroupID || p.sku || p.mpn || p.productID || v.sku || ''); brand = text(p.brand || v.brand); description = text(p.description || v.description);
    image = text([].concat(p.image || v.image || [])[0]);
  } else {
    const raw = meta(html, 'og:title') || decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
    description = meta(html, 'og:description') || meta(html, 'description');
    image = meta(html, 'og:image');
    sku = meta(html, 'product:retailer_item_id') || '';
    const ct = host ? cleanTitle(raw, host) : { name: raw, sku: '', brand: '' };
    name = BOT_RE.test(raw) ? raw : ct.name; sku = sku || ct.sku; brand = ct.brand;
  }
  if (!name) return null;
  name = scrub(name, host); brand = scrub(brand, host); description = scrub(description, host);
  if (!image) image = pickImage(html, sku, name);
  try { if (image) image = new URL(image, url).href; } catch { image = ''; }
  const txt = pageText(html);
  return { name, sku, brand, description: description.slice(0, 400), image, url, structured: !!p, host, text: txt, ...heuristics(txt) };
}

async function fetchText(url, opts = {}) {
  const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000), ...opts, headers: { 'User-Agent': 'Mozilla/5.0 (RechnungsStudio Produktimport)', 'Accept-Language': 'de', ...(opts.headers || {}) } });
  if (!r.ok) throw new Error(`Seite antwortet mit Fehler ${r.status}`);
  return r;
}

async function fetchImage(url, referer) {
  try {
    const r = await fetchText(url, { headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,*/*', ...(referer ? { Referer: referer } : {}) } });
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
  if (!prod || (!prod.structured && BOT_RE.test(prod.name + ' ' + (html.length < 6000 ? html.replace(/<[^>]+>/g, ' ') : '')))) {
    if (BOT_RE.test(html.slice(0, 20000))) throw new Error(BOT_MSG);
    if (!prod) throw new Error('Keine Produktdaten gefunden – evtl. ist eine Anmeldung nötig');
  }
  if (/anmeld|login|einloggen/i.test(prod.name) && !prod.structured) throw new Error('Das ist die Anmeldeseite – der Shop zeigt Produkte nur nach Login. Bitte den CSV-Import nutzen.');
  prod.image = prod.image ? await fetchImage(prod.image, u.origin + '/') : '';
  return prod;
}

// eine im Browser gespeicherte Produktseite (HTML-Datei) auslesen – umgeht Bot-Schutz und Anmeldung, weil der Browser sie schon geholt hat
async function fromHtml(html, fileName = '') {
  const canon = (html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i) || html.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']canonical["']/i) || [])[1] || meta(html, 'og:url') || '';
  const prod = parsePage(html, canon || 'https://invalid.invalid/');
  if (!prod || (!prod.structured && BOT_RE.test(prod.name))) throw new Error(`${fileName ? fileName + ': ' : ''}${prod && BOT_RE.test(prod.name) ? 'Das ist die Prüfseite des Bot-Schutzes, nicht das Produkt – bitte die Seite erst fertig laden lassen und dann speichern.' : 'Keine Produktdaten in dieser Datei gefunden.'}`);
  prod.url = canon;
  prod.image = prod.image && canon ? await fetchImage(prod.image, new URL(canon).origin + '/') : '';
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
// verständliche Meldung statt der Rohmeldung des Dienstes
function friendly(err) {
  if (Anthropic && err instanceof Anthropic.AuthenticationError) return 'Der API-Schlüssel wurde von Anthropic abgelehnt (ungültig oder gelöscht). Bitte unter Einstellungen → Belegerkennung neu eintragen und mit „Schlüssel prüfen“ testen.';
  if (Anthropic && err instanceof Anthropic.RateLimitError) return 'Zu viele Anfragen – bitte in einer Minute noch einmal versuchen.';
  if (Anthropic && err instanceof Anthropic.PermissionDeniedError) return 'Der Schlüssel hat keine Berechtigung – bitte in der Anthropic-Konsole prüfen.';
  if (/credit|billing|balance/i.test(String(err.message))) return 'Das Guthaben bei Anthropic ist aufgebraucht – bitte unter platform.claude.com aufladen.';
  return 'Übersetzung nicht möglich: ' + String(err.message).slice(0, 120);
}
// Kundentext ohne KI aus den erkannten Angaben
const fallbackSpec = (p) => [p.material && `Material: ${p.material}`, p.gsm && `Gewicht: ${p.gsm} g/m²`].filter(Boolean).join(' · ');
const num = (v) => { const t = String(v ?? '').replace(/[^\d.,]/g, ''); if (!t) return ''; const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t); return Number.isFinite(n) && n > 0 ? n.toFixed(2) : ''; };

const PAGE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['de', 'da', 'en', 'brand', 'sku', 'material', 'gsm', 'sizes', 'colors', 'spec_de', 'spec_da', 'spec_en', 'price', 'currency', 'unit', 'kind'],
  properties: {
    de: { type: 'string' }, da: { type: 'string' }, en: { type: 'string' }, brand: { type: 'string' }, sku: { type: 'string' },
    material: { type: 'string' }, gsm: { type: 'string' }, sizes: { type: 'string' }, colors: { type: 'string' },
    spec_de: { type: 'string' }, spec_da: { type: 'string' }, spec_en: { type: 'string' },
    price: { type: 'string' }, currency: { type: 'string' },
    unit: { type: 'string', enum: ['stk', 'pakke', 'm', 'm2', 'kg', 'timer', ''] }, kind: { type: 'string', enum: ['goods', 'services'] },
  },
};
async function readPage(client, p) {
  const host = p.host || '';
  const prompt = `Du liest die Produktseite eines Großhändlers für Textilien, Stickerei-Rohlinge und Zubehör. Ein Stickerei-/Textilveredler legt daraus ein Produkt für seine eigenen Rechnungen und Auftragsbestätigungen an.

Gib zurück:
- de: sauberer deutscher Produktname, z. B. „Influence Hoodie“. OHNE Artikelnummer, OHNE Händlername, OHNE Länder- oder Werbezusätze, Marke nicht im Namen wiederholen.
- da, en: derselbe Name auf Dänisch und Englisch (Modellnamen und Marken nie übersetzen)
- brand: Hersteller/Marke (z. B. „B&C“), niemals den Händler/Shop
- sku: Artikelnummer des Herstellers, falls erkennbar
- material: Zusammensetzung, z. B. „80 % Baumwolle, 20 % Polyester“
- gsm: Flächengewicht als Zahl in g/m², z. B. „280“ (leer, wenn nicht angegeben)
- sizes: verfügbare Größen, z. B. „S–3XL“ oder „XS, S, M“
- colors: verfügbare Farben, kommagetrennt
- spec_de / spec_da / spec_en: kurzer Kundentext für die Auftragsbestätigung (Stichpunkte durch „ · “ getrennt): Passform, Besonderheiten, Ausstattung. Material und Gewicht gehören mit hinein. KEINE Farben und Größen (stehen separat), KEINE Preise, KEIN Händlername, keine Artikelnummern, keine Werbefloskeln. Höchstens 200 Zeichen.
- price: Einkaufspreis NETTO für die kleinste Abnahmemenge als Zahl mit Punkt (z. B. „12.50“). Nur wenn ein Preis auf der Seite steht, sonst leer. Staffelpreise: den für die kleinste Menge.
- currency: Währung des Preises (EUR, DKK …)
- unit: stk (Stück), pakke (Paket), m, m2, kg, timer oder leer; kind: goods
Erfinde nichts. Fehlende Angaben leer lassen.

Titel der Seite: ${p.name}${p.sku ? ` (Artikelnummer ${p.sku})` : ''}
Seitentext:
${scrub(p.text || '', host)}`;
  const res = await client.beta.messages.create({
    model: 'claude-haiku-5-5', max_tokens: 4000, output_config: { effort: 'low', format: { type: 'json_schema', schema: PAGE_SCHEMA } },
    messages: [{ role: 'user', content: prompt }],
  });
  const t = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return JSON.parse(t);
}

async function translate(products, apiKey) {
  const base = (p) => ({ ...p, de: p.name, da: '', en: '', unit: 'stk', kind: 'goods', translated: false, spec_de: fallbackSpec(p), spec_da: '', spec_en: '', cost: '', costCurrency: '' });
  if (!Anthropic || !apiKey) return products.map(base);
  const client = new Anthropic({ apiKey });
  const out = new Array(products.length);
  // Produkte mit Seitentext: Seite von der KI auswerten (je Produkt ein Aufruf)
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    if (!p.text) continue;
    try {
      const r = await readPage(client, p);
      const clean = (v) => scrub(v, p.host);
      out[i] = { ...p, de: clean(r.de) || p.name, da: clean(r.da), en: clean(r.en), brand: clean(r.brand) || p.brand, sku: r.sku || p.sku, material: r.material || p.material || '', gsm: r.gsm || p.gsm || '',
        sizes: r.sizes || p.sizes || '', colors: clean(r.colors), spec_de: clean(r.spec_de) || fallbackSpec(p), spec_da: clean(r.spec_da), spec_en: clean(r.spec_en),
        cost: num(r.price), costCurrency: num(r.price) ? (r.currency || 'EUR').toUpperCase() : '', unit: r.unit || 'stk', kind: r.kind || 'goods', translated: true };
    } catch (err) { throw new Error(friendly(err)); }
  }
  // Rest (z. B. aus CSV): nur Namen übersetzen, in Gruppen
  const rest = products.map((p, i) => ({ p, i })).filter((x) => !out[x.i]);
  for (let s = 0; s < rest.length; s += 25) {
    const part = rest.slice(s, s + 25);
    const list = part.map((x, i) => `${i}: ${x.p.name}${x.p.brand ? ` (Marke ${x.p.brand})` : ''}${x.p.description ? ` – ${x.p.description.slice(0, 120)}` : ''}`).join('\n');
    let res;
    try {
      res = await client.beta.messages.create({
        model: 'claude-haiku-5-5', max_tokens: 8000, output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
        messages: [{ role: 'user', content: `Das sind Artikel eines deutschen Großhändlers für Textilien/Stickerei-Rohlinge/Zubehör. Für jede Zeile (Nummer: Name) gib an:
- de: kurzer, sauberer deutscher Produktname für eine Rechnung (ohne Werbetext, ohne Artikelnummer, ohne Händlername; Marke und Typ behalten, Farbe/Größe nur wenn im Namen)
- da: derselbe Name auf Dänisch, en: auf Englisch (übliche Fachbegriffe verwenden, Markennamen nie übersetzen)
- unit: Verkaufseinheit (stk = Stück, pakke = Paket, m, m2, kg, timer, sonst leer) – bei Textilien meist stk
- kind: goods (Ware) oder services (Dienstleistung)
Erfinde nichts dazu. Gib die Nummer i unverändert zurück.\n\n${list}` }],
      });
    } catch (err) { throw new Error(friendly(err)); }
    const t = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    let items = [];
    try { items = JSON.parse(t).items || []; } catch { /* ohne Übersetzung weiter */ }
    part.forEach((x, i) => { const it = items.find((q) => q.i === i); out[x.i] = it ? { ...base(x.p), de: it.de || x.p.name, da: it.da, en: it.en, unit: it.unit || 'stk', kind: it.kind, translated: true } : base(x.p); });
  }
  return out;
}

module.exports = { scrub, cleanTitle, pageText, heuristics, fallbackSpec, friendly, parsePage, jsonLdProducts, fromUrl, fromHtml, collectLinks, fromCsv, translate, BOT_RE };
