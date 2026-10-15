/* Land zu einer IP-Adresse (nur Land, kein Standort). Liest eine CSV-Datei mit Bereichen: Start,Ende,Ländercode
   (IPv4 und IPv6 gemischt, z. B. die kostenlose Länderdatei von DB-IP). Ohne Datei bleibt das Land leer.
   Die Datei lädt der Server selbst herunter (Verwaltung → Einstellungen), kein Dienst bekommt Kundendaten. */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const https = require('https');

let v4 = { s: new Float64Array(0), e: new Float64Array(0), c: [] };
let v6 = { s: [], e: [], c: [] };
let info = { loaded: false, entries: 0, updated: 0, file: '' };

const ip4 = (s) => { const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s); if (!m) return null; const p = m.slice(1).map(Number); return p.some((x) => x > 255) ? null : ((p[0] * 256 + p[1]) * 256 + p[2]) * 256 + p[3]; };
function ip6(s) {
  s = s.toLowerCase().replace(/%.*$/, '');
  const mapped = /^(?:::ffff:|::)(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (mapped) return { v4: ip4(mapped[1]) };
  if (!/^[0-9a-f:]+$/.test(s) || (s.match(/::/g) || []).length > 1) return null;
  let [a, b] = s.split('::');
  const A = a ? a.split(':') : [], B = b !== undefined && b ? b.split(':') : [];
  const fill = b === undefined ? 0 : 8 - A.length - B.length;
  if (fill < 0 || (b === undefined && A.length !== 8)) return null;
  const parts = [...A, ...Array(fill).fill('0'), ...B];
  if (parts.length !== 8 || parts.some((x) => x.length > 4)) return null;
  return { v6: parts.reduce((acc, x) => (acc << 16n) | BigInt(parseInt(x || '0', 16)), 0n) };
}

function parse(text) {
  const s4 = [], e4 = [], c4 = [], s6 = [], e6 = [], c6 = [];
  for (const line of text.split(/\r?\n/)) {
    const f = line.split(',');
    if (f.length < 3) continue;
    const cc = f[2].replace(/"/g, '').trim().toUpperCase();
    const a = f[0].replace(/"/g, '').trim(), b = f[1].replace(/"/g, '').trim();
    if (!/^[A-Z]{2}$/.test(cc)) continue;
    if (a.includes(':')) { const x = ip6(a), y = ip6(b); if (x && y && x.v6 !== undefined && y.v6 !== undefined) { s6.push(x.v6); e6.push(y.v6); c6.push(cc); } }
    else { const x = ip4(a), y = ip4(b); if (x !== null && y !== null) { s4.push(x); e4.push(y); c4.push(cc); } }
  }
  // nach Start sortieren (Datei ist meist schon sortiert)
  const order = (s) => s.map((_, i) => i).sort((i, j) => (s[i] < s[j] ? -1 : s[i] > s[j] ? 1 : 0));
  const o4 = order(s4), o6 = order(s6);
  return {
    v4: { s: Float64Array.from(o4.map((i) => s4[i])), e: Float64Array.from(o4.map((i) => e4[i])), c: o4.map((i) => c4[i]) },
    v6: { s: o6.map((i) => s6[i]), e: o6.map((i) => e6[i]), c: o6.map((i) => c6[i]) },
  };
}
function find(t, x) {
  let lo = 0, hi = t.s.length - 1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (t.s[m] <= x) lo = m + 1; else hi = m - 1; }
  return hi >= 0 && x <= t.e[hi] ? t.c[hi] : '';
}
function lookup(ip) {
  if (!ip || !info.loaded) return '';
  ip = String(ip).trim().replace(/^\[|\]$/g, '');
  const a = ip4(ip);
  if (a !== null) return find(v4, a);
  const b = ip6(ip);
  if (!b) return '';
  return b.v4 !== undefined && b.v4 !== null ? find(v4, b.v4) : b.v6 !== undefined ? find(v6, b.v6) : '';
}
// Private/lokale Adressen haben kein Land
const isLocal = (ip) => /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80)/i.test(String(ip || '').replace(/^::ffff:/i, ''));

function load(file) {
  info = { loaded: false, entries: 0, updated: 0, file };
  try {
    const st = fs.statSync(file);
    const t = parse(fs.readFileSync(file, 'utf8'));
    v4 = t.v4; v6 = t.v6;
    info = { loaded: t.v4.s.length + t.v6.s.length > 0, entries: t.v4.s.length + t.v6.s.length, updated: st.mtimeMs, file };
  } catch (e) { /* keine Datei */ }
  return info;
}

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'StickStudio' } }, (r) => {
      if (r.statusCode !== 200) { r.resume(); return reject(new Error('HTTP ' + r.statusCode)); }
      const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => resolve(Buffer.concat(chunks))); r.on('error', reject);
    }).on('error', reject).setTimeout(60000, function () { this.destroy(new Error('Zeitüberschreitung')); });
  });
}
// Aktuelle Monatsdatei von DB-IP (kostenlos, CC BY 4.0) laden; schlägt der aktuelle Monat fehl, der vorige
async function update(file, fetcher = get) {
  const d = new Date();
  let err;
  for (const back of [0, 1]) {
    const x = new Date(d.getFullYear(), d.getMonth() - back, 1);
    const url = `https://download.db-ip.com/free/dbip-country-lite-${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}.csv.gz`;
    try {
      const text = zlib.gunzipSync(await fetcher(url)).toString('utf8');
      const t = parse(text);
      if (t.v4.s.length < 1000) throw new Error('Datei unvollständig');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file + '.tmp', text); fs.renameSync(file + '.tmp', file);
      return load(file);
    } catch (e) { err = e; }
  }
  throw err;
}
module.exports = { load, lookup, update, parse, isLocal, status: () => ({ ...info }) };
