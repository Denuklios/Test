/* StickStudio-Server: Anmeldung, Lizenzen, Projekte, Stickdatei-Export, Verwaltung, Rechtstexte.
   Start:  node server/server.js        (Node.js 22.13 oder neuer, keine Zusatzpakete)
   Einstellungen über Umgebungsvariablen – siehe server/README.md */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
const DB = require('./db');
const pages = require('./pages');
const mail = require('./mail');
const fileio = require('./fileio');
const geo = require('./geoip');
const licenses = require('./licenses');

const ROOT = path.join(__dirname, '..');
const ENV = process.env;
const PORT = +(ENV.PORT || 8080);
const DATA_DIR = ENV.DATA_DIR || path.join(ROOT, 'data');
const BASE_URL = (ENV.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const SECURE_COOKIE = ENV.COOKIE_SECURE ? ENV.COOKIE_SECURE === '1' : BASE_URL.startsWith('https://');
const SESSION_DAYS = 30;
const DAY = 864e5;

const db = DB.open(DATA_DIR);
const GEO_FILE = ENV.GEOIP_FILE || path.join(DATA_DIR, 'geoip-country.csv');
geo.load(GEO_FILE);
const EVENT_DAYS = +(ENV.EVENT_DAYS || 90); // so lange bleibt das Protokoll (mit IP-Adressen)
const countryOf = (ip) => (geo.isLocal(ip) ? '' : geo.lookup(ip));
const now = () => Date.now();
// Kauf-Lizenzen der Desktop-Programme (Aktivierung, regelmäßige Prüfung, Verwaltung)
const LIC = licenses.init({ db, dataDir: DATA_DIR, env: ENV, now, log: (kind, info) => logEvent(null, kind, info) });

/* ---------- Einstellungen (in der Verwaltung änderbar) ---------- */
const SETTING_DEFAULTS = {
  trial_days: '14', license_days: '365', buy_url: '', support_email: '',
  company: 'Wunsch-Fabrik', owner: '', street: '', zip_city: '', country: 'Danmark', email: '', phone: '', vat_id: '', register: 'CVR-nr. 46733428',
  hosting_provider: '', payment_provider: 'Lemon Squeezy, LLC', supervisory_authority: 'Datatilsynet, Carl Jacobsens Vej 35, 2500 Valby, Danmark, www.datatilsynet.dk',
  price_text_de: '', price_text_en: '', license_term_de: '12 Monate', license_term_en: '12 months', legal_date: '',
};
function settings() {
  const s = { ...SETTING_DEFAULTS };
  for (const r of db.prepare('SELECT key, value FROM settings').all()) s[r.key] = r.value;
  return s;
}
function setSettings(obj) {
  const st = db.prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [k, v] of Object.entries(obj)) if (k in SETTING_DEFAULTS) st.run(k, String(v ?? '').slice(0, 2000));
}
const logEvent = (userId, kind, info = '') => db.prepare('INSERT INTO events(user_id, kind, info, at) VALUES(?, ?, ?, ?)').run(userId ?? null, kind, String(info).slice(0, 500), now());

/* ---------- Passwörter, Sitzungen, Tokens ---------- */
function hashPass(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${h.toString('hex')}`;
}
function checkPass(pw, stored) {
  const [alg, salt, hex] = String(stored).split('$');
  if (alg !== 'scrypt' || !salt || !hex) return false;
  const h = crypto.scryptSync(pw, Buffer.from(salt, 'hex'), 32, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(h, Buffer.from(hex, 'hex'));
}
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const validPw = (pw) => typeof pw === 'string' && pw.length >= 10 && pw.length <= 200;
const validEmail = (e) => typeof e === 'string' && e.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

function newSession(userId) {
  const tok = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions(hash, user_id, expires, created) VALUES(?, ?, ?, ?)').run(sha(tok), userId, now() + SESSION_DAYS * DAY, now());
  db.prepare('DELETE FROM sessions WHERE expires < ?').run(now());
  return tok;
}
function newToken(userId, kind, hours) {
  const tok = crypto.randomBytes(32).toString('base64url');
  db.prepare('DELETE FROM tokens WHERE user_id = ? AND kind = ?').run(userId, kind);
  db.prepare('INSERT INTO tokens(hash, user_id, kind, expires) VALUES(?, ?, ?, ?)').run(sha(tok), userId, kind, now() + hours * 36e5);
  return tok;
}
function useToken(tok, kind) {
  const r = db.prepare('SELECT * FROM tokens WHERE hash = ? AND kind = ?').get(sha(String(tok || '')), kind);
  if (!r || r.expires < now()) return null;
  db.prepare('DELETE FROM tokens WHERE hash = ?').run(r.hash);
  return r.user_id;
}

function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function sessionUser(req) {
  const tok = cookies(req).sid;
  if (!tok) return null;
  const r = db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.hash = ? AND s.expires > ?').get(sha(tok), now());
  if (!r || r.blocked) return null;
  return r;
}
const sidCookie = (tok, maxAge) => `sid=${tok}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${SECURE_COOKIE ? '; Secure' : ''}`;

/* ---------- Lizenz ---------- */
function license(u) {
  const t = now();
  const admin = u.role === 'admin';
  const until = Math.max(u.license_until, u.trial_until);
  const active = admin || until > t;
  const trial = !admin && u.license_until <= t && u.trial_until > t;
  return {
    active, trial, admin,
    until: admin ? null : until || null,
    licenseUntil: u.license_until || null, trialUntil: u.trial_until || null,
    daysLeft: admin ? null : Math.max(0, Math.ceil((until - t) / DAY)),
    viewOnly: !active,
  };
}
const subInfo = (u) => (u.sub_id ? { status: u.sub_status, renews: u.sub_renews || null, ends: u.sub_ends || null, portal: u.sub_portal || '' } : null);
const fraesAccess = (u) => !!u && (u.role === 'admin' || !!u.fraes);
const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, lang: u.lang, verified: !!u.verified, created: u.created, license: license(u), sub: subInfo(u), fraes: fraesAccess(u) });

/* ---------- Schutz vor zu vielen Versuchen ---------- */
const hits = new Map();
function limited(key, max, windowMs) {
  const t = now();
  const arr = (hits.get(key) || []).filter((x) => x > t - windowMs);
  arr.push(t);
  hits.set(key, arr);
  if (hits.size > 50000) hits.clear();
  return arr.length > max;
}
const ipOf = (req) => (ENV.TRUST_PROXY === '1' ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '') || req.socket.remoteAddress || '';

/* ---------- Antworten ---------- */
const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; worker-src 'self' blob:; connect-src 'self'; font-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};
function send(res, code, body, type = 'text/html; charset=utf-8', extra = {}) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', ...SEC_HEADERS, ...extra });
  res.end(body);
}
const json = (res, code, obj, extra) => send(res, code, JSON.stringify(obj), 'application/json; charset=utf-8', extra);
const redirect = (res, to, extra = {}) => { res.writeHead(303, { Location: to, ...SEC_HEADERS, ...extra }); res.end(); };

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on('data', (c) => {
      n += c.length;
      if (n > limit) { reject(Object.assign(new Error('Zu groß'), { code: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readForm(req) {
  const b = await readBody(req, 64 * 1024);
  return Object.fromEntries(new URLSearchParams(b.toString('utf8')));
}
async function readJson(req, limit = 1 << 20) {
  const b = await readBody(req, limit);
  try { return JSON.parse(b.toString('utf8') || '{}'); } catch (e) { throw Object.assign(new Error('Ungültige Daten'), { code: 400 }); }
}

/* ---------- Sprache ---------- */
function langOf(req, u) {
  const q = new URL(req.url, 'http://x').searchParams.get('lang');
  if (q === 'de' || q === 'en') return q;
  const c = cookies(req).lang;
  if (c === 'de' || c === 'en') return c;
  if (u && (u.lang === 'de' || u.lang === 'en')) return u.lang;
  return /^de\b/i.test(String(req.headers['accept-language'] || 'de')) ? 'de' : 'en';
}
const langCookie = (l) => `lang=${l}; Path=/; SameSite=Lax; Max-Age=31536000${SECURE_COOKIE ? '; Secure' : ''}`;

/* ---------- Statische Dateien (nur angemeldet; Formatcode bleibt auf dem Server) ---------- */
const MIME = { '.onnx': 'application/octet-stream', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8' };
const SERVER_ONLY = new Set(['js/dst_io.js', 'js/formats.js']);
const APP_DIRS = ['js/', 'css/', 'fonts/'];
function staticFile(res, rel, cacheable) {
  const norm = path.posix.normalize(rel).replace(/^\/+/, '');
  if (norm.includes('..') || SERVER_ONLY.has(norm) || sourceBlocked(norm)) return false;
  const file = path.join(ROOT, norm);
  if (!file.startsWith(ROOT + path.sep)) return false;
  let st;
  try { st = fs.statSync(file); } catch (e) { return false; }
  if (!st.isFile()) return false;
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cacheable ? 'private, max-age=3600' : 'no-cache', ...SEC_HEADERS });
  fs.createReadStream(file).pipe(res);
  return true;
}

/* ---------- FräsStudio (Ordner fraesstudio/, nur angemeldet und freigeschaltet) ---------- */
const FRAES_PATH = '/fraesstudio/';
const FRAES_ROOT = path.join(ROOT, 'fraesstudio');
const nextCookie = (v, maxAge) => `next=${v}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${SECURE_COOKIE ? '; Secure' : ''}`;
// FräsStudio braucht Kamera (Bild von oben) und USB (Web Serial zur Fräse) – nur für diese Seiten erlaubt
// KI-Tiefenschätzung: WebAssembly ausführen und (falls das Modell nicht auf dem Server liegt) von HuggingFace laden
const FRAES_HEADERS = {
  ...SEC_HEADERS,
  'Permissions-Policy': 'camera=(self), serial=(self), microphone=(), geolocation=()',
  'Content-Security-Policy': SEC_HEADERS['Content-Security-Policy']
    .replace("script-src 'self'", "script-src 'self' 'wasm-unsafe-eval'")
    .replace("connect-src 'self'", "connect-src 'self' https://huggingface.co https://*.huggingface.co https://*.hf.co"),
};
function fraesFile(res, rel) {
  let dec;
  try { dec = decodeURIComponent(rel); } catch (e) { return false; }
  const norm = path.posix.normalize(dec).replace(/^\/+/, '');
  if (norm.includes('..') || norm.startsWith('tests/') || norm.endsWith('.md')) return false;
  const file = path.join(FRAES_ROOT, norm);
  if (!file.startsWith(FRAES_ROOT + path.sep)) return false;
  let st;
  try { st = fs.statSync(file); } catch (e) { return false; }
  if (!st.isFile()) return false;
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'private, no-cache', ...FRAES_HEADERS });
  fs.createReadStream(file).pipe(res);
  return true;
}

// Programmseite: index.html ohne den Formatcode, dafür mit Online-Anbindung.
// Gibt es einen Build (npm run build → dist/), wird statt der lesbaren Quelltexte nur EINE verschleierte Datei geladen.
let indexCache = null;
let bundle = null; // { name, code, data: [...] }
setImmediate(() => loadBundle());
function loadBundle() {
  try {
    const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'manifest.json'), 'utf8'));
    bundle = { name: man.bundle, code: fs.readFileSync(path.join(ROOT, 'dist', man.bundle), 'utf8'), data: man.data || [] };
  } catch (e) { bundle = null; }
  return bundle;
}
function appHtml() {
  if (!indexCache || ENV.NODE_ENV !== 'production') {
    let h = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    if (ENV.NODE_ENV !== 'production' || !bundle) loadBundle();
    if (bundle) {
      // alle Programm-Skripte durch die eine Datei ersetzen; Schriftdaten bleiben eigene Dateien
      h = h.replace(/\s*<script src="js\/[^"]+"><\/script>/g, '');
      h = h.replace('</body>', ['/config.js', ...bundle.data, '/app/' + bundle.name].map((src) => `<script src="${src}"></script>\n`).join('') + '</body>');
    } else {
      h = h.replace(/\s*<script src="js\/(dst_io|formats)\.js"><\/script>/g, '');
      // Konfiguration vor der Sprachumschaltung (Kontosprache), Online-Anbindung vor dem Programm
      h = h.replace('<script src="js/i18n.js"></script>', '<script src="/config.js"></script>\n<script src="js/i18n.js"></script>');
      h = h.replace('<script src="js/app.js"></script>', '<script src="js/online.js"></script>\n<script src="js/app.js"></script>');
    }
    indexCache = h;
  }
  return indexCache;
}
// Mit Build: lesbare Programmdateien werden nicht mehr ausgeliefert, nur Daten (Schriften, pdf.js)
const sourceBlocked = (rel) => !!bundle && /^js\/[^/]+\.js$/.test(rel) && !bundle.data.includes(rel);
// Jede ausgelieferte Kopie trägt eine Kennung des Kontos (Weitergabe nachvollziehbar)
const mark = (u) => crypto.createHmac('sha256', SECRET_MARK).update(String(u.id)).digest('hex').slice(0, 16);
const SECRET_MARK = ENV.MARK_SECRET || crypto.createHash('sha256').update(DATA_DIR + 'stickstudio').digest('hex');

/* ---------- Konten ---------- */
function createUser({ email, password, name = '', lang = 'de', role = 'user', verified = 0, accepted = 0 }) {
  const s = settings();
  const t = now();
  const trialUntil = role === 'admin' ? 0 : t + Math.max(0, +s.trial_days || 0) * DAY;
  const r = db.prepare('INSERT INTO users(email, name, pass, role, lang, verified, trial_until, accepted_terms, created) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(email.trim().toLowerCase(), String(name).slice(0, 120), hashPass(password), role, lang, verified ? 1 : 0, trialUntil, accepted ? t : 0, t);
  return Number(r.lastInsertRowid);
}

// Erster Start: Admin-Konto aus ADMIN_EMAIL / ADMIN_PASSWORD (oder mit zufälligem Passwort, das einmal angezeigt wird)
function ensureAdmin() {
  const has = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get().n;
  const email = (ENV.ADMIN_EMAIL || '').trim().toLowerCase();
  if (email && ENV.ADMIN_PASSWORD) {
    const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!u) { createUser({ email, password: ENV.ADMIN_PASSWORD, role: 'admin', verified: 1, accepted: 1 }); console.log(`Admin-Konto angelegt: ${email}`); }
    else if (u.role !== 'admin') db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(u.id);
    return;
  }
  if (!has) {
    const pw = crypto.randomBytes(9).toString('base64url');
    const em = email || 'admin@localhost';
    createUser({ email: em, password: pw, role: 'admin', verified: 1, accepted: 1 });
    console.log(`\n*** Admin-Konto angelegt: ${em}  Passwort: ${pw}\n*** Bitte nach der ersten Anmeldung unter „Mein Konto“ ändern.\n`);
  }
}

async function sendVerify(u, lang) {
  const tok = newToken(u.id, 'verify', 72);
  const link = `${BASE_URL}/verify?token=${tok}`;
  await mail.send(u.email, lang === 'de' ? 'StickStudio – E-Mail bestätigen' : 'StickStudio – confirm your email',
    lang === 'de' ? `Hallo,\n\nbitte bestätige deine E-Mail-Adresse für StickStudio:\n${link}\n\nDer Link ist 3 Tage gültig.\n` : `Hello,\n\nplease confirm your email address for StickStudio:\n${link}\n\nThe link is valid for 3 days.\n`);
}

/* ---------- Abo über Lemon Squeezy ---------- */
const GRACE = 3 * DAY; // Puffer, falls die Verlängerungszahlung etwas später eingeht
// Abo-Stand von Lemon Squeezy übernehmen; die Lizenz folgt dem Abo
function applySubscription(u, id, a) {
  const ts = (v) => (v ? +new Date(v) || 0 : 0);
  const status = String(a.status || '');
  const renews = ts(a.renews_at), ends = ts(a.ends_at);
  let until = u.license_until;
  if (['active', 'on_trial', 'past_due'].includes(status)) until = Math.max(renews ? renews + GRACE : 0, status === 'past_due' ? u.license_until : 0, now() + DAY);
  else if (status === 'cancelled') until = ends || renews || u.license_until;
  else if (['expired', 'unpaid', 'paused'].includes(status)) until = Math.min(u.license_until, now());
  const portal = (a.urls && a.urls.customer_portal) || u.sub_portal || '';
  db.prepare('UPDATE users SET sub_id=?, sub_status=?, sub_renews=?, sub_ends=?, sub_portal=?, license_until=? WHERE id=?').run(String(id), status, renews, ends, portal, until, u.id);
  logEvent(u.id, 'abo', `${status} · Lizenz bis ${new Date(until).toISOString().slice(0, 10)}`);
}

// Kündigung direkt bei Lemon Squeezy (wenn LEMONSQUEEZY_API_KEY gesetzt): endet zum Ende des bezahlten Zeitraums
async function lsCancel(subId) {
  if (!ENV.LEMONSQUEEZY_API_KEY || !subId) return null;
  try {
    const r = await fetch('https://api.lemonsqueezy.com/v1/subscriptions/' + encodeURIComponent(subId), {
      method: 'DELETE', headers: { Accept: 'application/vnd.api+json', Authorization: 'Bearer ' + ENV.LEMONSQUEEZY_API_KEY },
    });
    if (!r.ok) return null;
    return ((await r.json()).data || {}).attributes || null;
  } catch (e) { return null; }
}

// Hinweis vor der Verlängerung (AGB § 5 Abs. 5: mindestens zwei Wochen vorher)
async function renewalReminders() {
  if (!mail.enabled()) return;
  const t = now();
  const s = settings();
  const rows = db.prepare("SELECT * FROM users WHERE sub_status = 'active' AND sub_renews > ? AND sub_renews < ? AND sub_reminded != sub_renews").all(t, t + 15 * DAY);
  for (const u of rows) {
    const de = u.lang !== 'en';
    const d = new Date(u.sub_renews).toLocaleDateString(de ? 'de-DE' : 'en-GB');
    const price = (de ? s.price_text_de : s.price_text_en) || '';
    const ok = await mail.send(u.email, de ? 'StickStudio – dein Abo verlängert sich bald' : 'StickStudio – your subscription renews soon',
      de ? `Hallo,\n\ndein StickStudio-Abo verlängert sich am ${d}${price ? ` (${price})` : ''}.\nWenn du nicht verlängern möchtest, kannst du jederzeit kündigen: ${BASE_URL}/kuendigen\n${u.sub_portal ? `Abo verwalten: ${u.sub_portal}\n` : ''}\nViele Grüße\n${s.company || 'StickStudio'}\n`
        : `Hello,\n\nyour StickStudio subscription renews on ${d}${price ? ` (${price})` : ''}.\nIf you do not want to renew, you can cancel at any time: ${BASE_URL}/kuendigen\n${u.sub_portal ? `Manage subscription: ${u.sub_portal}\n` : ''}\nBest regards\n${s.company || 'StickStudio'}\n`);
    if (ok) db.prepare('UPDATE users SET sub_reminded = ? WHERE id = ?').run(u.sub_renews, u.id);
  }
}

// Kündigung/Widerruf: Bestätigung an den Kunden, Info an dich
async function confirmRequest(kind, to, lang, lines) {
  const s = settings();
  const de = lang === 'de';
  const title = kind === 'cancel' ? (de ? 'Eingangsbestätigung deiner Kündigung' : 'Confirmation of your cancellation') : (de ? 'Eingangsbestätigung deines Widerrufs' : 'Confirmation of your withdrawal');
  const body = lines.map(([k, v]) => `${k}: ${v}`).join('\n');
  const sent = await mail.send(to, 'StickStudio – ' + title, `${de ? 'Hallo' : 'Hello'},\n\n${title}:\n\n${body}\n\n${de ? 'Viele Grüße' : 'Best regards'}\n${s.company || 'StickStudio'}\n`);
  const owner = s.support_email || s.email;
  if (owner) await mail.send(owner, `StickStudio – ${kind === 'cancel' ? 'Kündigung' : 'Widerruf'} von ${to}`, body + `\n\nVerwaltung: ${BASE_URL}/admin`);
  return sent && mail.enabled();
}

/* ---------- Lizenz von Hand verlängern (Verwaltung) ---------- */
function extendLicense(userId, days, reason) {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!u) return false;
  const from = Math.max(now(), u.license_until);
  db.prepare('UPDATE users SET license_until = ? WHERE id = ?').run(from + days * DAY, userId);
  logEvent(userId, 'license', `${reason}: +${days} Tage`);
  return true;
}

/* ---------- Brücke zur Fräse per WLAN (Telnet, Port 23) ----------
   Der Browser kann kein TCP sprechen. Der Server (im selben Heimnetz wie die Fräse) verbindet sich per Telnet
   und reicht die Daten über HTTP (Server-Sent Events + POST) an FräsStudio weiter – funktioniert hinter HTTPS und Reverse Proxy.
   Nur für Konten mit FräsStudio-Zugang. Ziel nur im eigenen Netz (oder CNC_HOST). Bei Verbindungsverlust: Not-Aus (Soft-Reset). */
const net = require('net');
const dns = require('dns').promises;
const cnc = new Map(); // id -> Sitzung
const CNC_MAX = 4;
function privateIp(ip) {
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip);
  if (!m) return false;
  const [a, b] = [+m[1], +m[2]];
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}
async function cncTarget(host, port) {
  host = String(host || '').trim();
  port = +port || 23;
  const ports = new Set([23, ...String(ENV.CNC_PORTS || '').split(',').map((x) => +x).filter(Boolean)]);
  if (!ports.has(port)) throw Object.assign(new Error('Port nicht erlaubt (nur Telnet 23).'), { code: 400 });
  if (!/^[A-Za-z0-9.-]{1,100}$/.test(host)) throw Object.assign(new Error('Adresse ungültig.'), { code: 400 });
  if (ENV.CNC_HOST && host.toLowerCase() !== String(ENV.CNC_HOST).toLowerCase()) throw Object.assign(new Error('Nur die am Server eingestellte Maschine ist erlaubt.'), { code: 400 });
  let ip = host;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    try { ip = (await dns.lookup(host, { family: 4 })).address; } catch (e) { throw Object.assign(new Error('Name „' + host + '“ wurde nicht gefunden.'), { code: 400 }); }
  }
  if (!ENV.CNC_HOST && !privateIp(ip)) throw Object.assign(new Error('Nur Adressen im eigenen Netz sind erlaubt (192.168.x.x, 10.x.x.x, 172.16–31.x.x).'), { code: 400 });
  return { ip, port };
}
function cncClose(sess, reason, estop) {
  if (!sess || sess.closed) return;
  sess.closed = true;
  clearTimeout(sess.grace); clearInterval(sess.beat);
  try { if (estop && sess.sock.writable) sess.sock.write(Buffer.from([0x18])); } catch (e) { /* weg */ }
  for (const r of sess.clients) { try { r.write(`data: ${JSON.stringify({ c: 1, m: reason || '' })}\n\n`); r.end(); } catch (e) { /* weg */ } }
  setTimeout(() => { try { sess.sock.destroy(); } catch (e) { /* weg */ } }, estop ? 150 : 0);
  cnc.delete(sess.id);
  logEvent(sess.userId, 'cnc-close', (reason || '') + (estop ? ' (Not-Aus)' : ''));
}
function cncOpen(userId, host, port) {
  return new Promise((resolve, reject) => {
    for (const sess of cnc.values()) if (sess.userId === userId) cncClose(sess, 'neue Verbindung');
    if (cnc.size >= CNC_MAX) return reject(Object.assign(new Error('Zu viele Verbindungen.'), { code: 429 }));
    const sock = net.connect({ host, port });
    sock.setNoDelay(true);
    sock.setKeepAlive(true, 10000);
    const sess = { id: crypto.randomBytes(12).toString('hex'), userId, sock, clients: new Set(), pending: [], closed: false, lastSend: 0, host: `${host}:${port}` };
    const timer = setTimeout(() => { sock.destroy(); reject(Object.assign(new Error('Die Maschine antwortet nicht (Zeitüberschreitung). Ist sie an, im WLAN und Telnet aktiv?'), { code: 502 })); }, 6000);
    sock.once('connect', () => {
      clearTimeout(timer);
      cnc.set(sess.id, sess);
      sess.beat = setInterval(() => { for (const r of sess.clients) r.write(': ping\n\n'); }, 15000);
      sess.grace = setTimeout(() => { if (!sess.clients.size) cncClose(sess, 'kein Browser verbunden'); }, 15000);
      logEvent(userId, 'cnc-open', sess.host);
      resolve(sess);
    });
    sock.on('data', (buf) => {
      const msg = `data: ${JSON.stringify({ d: buf.toString('latin1') })}\n\n`;
      if (sess.clients.size) for (const r of sess.clients) r.write(msg); else if (sess.pending.length < 200) sess.pending.push(msg);
    });
    sock.on('error', (e) => { clearTimeout(timer); if (!sess.closed && cnc.has(sess.id)) cncClose(sess, 'Fehler: ' + e.code); else reject(Object.assign(new Error({ ECONNREFUSED: 'Verbindung abgelehnt – ist Telnet an der Maschine aktiv (Port 23)?', EHOSTUNREACH: 'Maschine nicht erreichbar.', ENETUNREACH: 'Netz nicht erreichbar.', ETIMEDOUT: 'Zeitüberschreitung.' }[e.code] || 'Verbindungsfehler: ' + e.code), { code: 502 })); });
    sock.on('close', () => cncClose(sess, 'Maschine hat die Verbindung beendet'));
  });
}

/* ---------- Routen ---------- */
async function route(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  const m = req.method;
  const user = sessionUser(req);
  const lang = langOf(req, user);
  const setLang = url.searchParams.get('lang') ? { 'Set-Cookie': langCookie(lang) } : {};
  const page = (html, code = 200) => send(res, code, html, 'text/html; charset=utf-8', setLang);
  const s = settings();

  // API: nur gleiche Herkunft (Schutz vor fremden Seiten)
  // Ausnahmen: Zahlungsanbieter und die Desktop-Programme (die melden sich mit dem Lizenzschlüssel, nicht mit einer Sitzung)
  if (p.startsWith('/api/') && m !== 'GET' && p !== '/api/webhook/lemonsqueezy' && !p.startsWith('/api/license/')) {
    const origin = req.headers.origin;
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    if ((origin && new URL(origin).host !== host) || req.headers['x-requested-with'] !== 'StickStudio') return json(res, 403, { error: 'forbidden' });
  }

  /* --- öffentlich --- */
  if (p.startsWith('/site/')) return staticFile(res, p, true) || send(res, 404, 'Not found', 'text/plain');
  if (p === '/favicon.ico') return send(res, 204, '');
  if (p.startsWith('/legal/')) {
    const html = pages.legal(ROOT, lang, p.slice(7), s, user);
    return html ? page(html) : page(pages.info(lang, pages.T[lang].notFound, pages.T[lang].notFound, false), 404);
  }
  if (p === '/login' && m === 'GET') return user ? redirect(res, '/') : page(pages.login(lang));
  if (p === '/login' && m === 'POST') {
    const f = await readForm(req);
    const email = String(f.email || '').trim().toLowerCase();
    if (limited('login:' + ipOf(req), 20, 15 * 60e3) || limited('login:' + email, 8, 15 * 60e3)) return page(pages.login(lang, { text: lang === 'de' ? 'Zu viele Versuche. Bitte in 15 Minuten erneut versuchen.' : 'Too many attempts. Please try again in 15 minutes.' }, email), 429);
    const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!u || !checkPass(String(f.password || ''), u.pass)) return page(pages.login(lang, { text: lang === 'de' ? 'E-Mail oder Passwort falsch.' : 'Wrong email or password.' }, email), 401);
    if (u.blocked) return page(pages.login(lang, { text: lang === 'de' ? 'Dieses Konto ist gesperrt. Bitte wende dich an den Support.' : 'This account is blocked. Please contact support.' }, email), 403);
    if (!u.verified && mail.enabled()) { await sendVerify(u, lang); return page(pages.info(lang, pages.T[lang].verifyTitle, pages.T[lang].verifySent)); }
    { const ip = ipOf(req), cc = countryOf(ip);
      db.prepare('UPDATE users SET last_login = ?, last_seen = ?, last_ip = ?, last_country = ? WHERE id = ?').run(now(), now(), ip, cc, u.id);
      logEvent(u.id, 'login', `${ip}${cc ? ' · ' + cc : ''}`); }
    const back = cookies(req).next === FRAES_PATH ? FRAES_PATH : '/';
    return redirect(res, back, { 'Set-Cookie': [sidCookie(newSession(u.id), SESSION_DAYS * 86400), langCookie(u.lang || lang), nextCookie('', 0)] });
  }
  if (p === '/register' && m === 'GET') return user ? redirect(res, '/') : page(pages.register(lang, null, {}, +s.trial_days || 0));
  if (p === '/register' && m === 'POST') {
    const f = await readForm(req);
    const v = { email: String(f.email || '').trim().toLowerCase(), name: String(f.name || '').trim() };
    const L = f.lang === 'en' ? 'en' : f.lang === 'de' ? 'de' : lang;
    const err = (text, code = 400) => page(pages.register(L, { text }, v, +s.trial_days || 0), code);
    if (ENV.REGISTRATION === 'closed') return err(L === 'de' ? 'Die Registrierung ist zurzeit geschlossen.' : 'Registration is currently closed.', 403);
    if (limited('reg:' + ipOf(req), 5, 60 * 60e3)) return err(L === 'de' ? 'Zu viele Registrierungen. Bitte später erneut versuchen.' : 'Too many sign-ups. Please try again later.', 429);
    if (!validEmail(v.email)) return err(L === 'de' ? 'Bitte eine gültige E-Mail-Adresse eingeben.' : 'Please enter a valid email address.');
    if (!validPw(f.password)) return err(L === 'de' ? 'Das Passwort muss mindestens 10 Zeichen lang sein.' : 'The password must be at least 10 characters long.');
    if (f.password !== f.password2) return err(L === 'de' ? 'Die Passwörter stimmen nicht überein.' : 'The passwords do not match.');
    if (f.accept !== '1') return err(L === 'de' ? 'Bitte AGB und Datenschutzerklärung bestätigen.' : 'Please accept the terms and the privacy policy.');
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(v.email)) return err(L === 'de' ? 'Für diese E-Mail-Adresse gibt es schon ein Konto. Bitte anmelden oder „Passwort vergessen“ nutzen.' : 'An account with this email already exists. Please sign in or use “Forgot password”.', 409);
    const id = createUser({ email: v.email, password: f.password, name: v.name, lang: L, verified: mail.enabled() ? 0 : 1, accepted: 1 });
    { const ip = ipOf(req), cc = countryOf(ip);
      db.prepare('UPDATE users SET last_ip = ?, last_country = ?, reg_country = ?, last_seen = ?, last_login = ? WHERE id = ?').run(ip, cc, cc, now(), now(), id);
      logEvent(id, 'register', `${ip}${cc ? ' · ' + cc : ''}`); }
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (mail.enabled()) { await sendVerify(u, L); return page(pages.info(L, pages.T[L].verifyTitle, pages.T[L].verifySent)); }
    return redirect(res, '/', { 'Set-Cookie': [sidCookie(newSession(id), SESSION_DAYS * 86400), langCookie(L)] });
  }
  if (p === '/verify' && m === 'GET') {
    const id = useToken(url.searchParams.get('token'), 'verify');
    if (!id) return page(pages.info(lang, pages.T[lang].verifyTitle, pages.T[lang].badLink, false), 400);
    db.prepare('UPDATE users SET verified = 1 WHERE id = ?').run(id);
    return page(pages.info(lang, pages.T[lang].verifyTitle, pages.T[lang].verified));
  }
  if (p === '/forgot' && m === 'GET') return page(pages.forgot(lang));
  if (p === '/forgot' && m === 'POST') {
    const f = await readForm(req);
    const email = String(f.email || '').trim().toLowerCase();
    const okMsg = { ok: true, text: mail.enabled() ? (lang === 'de' ? 'Wenn ein Konto existiert, haben wir eine E-Mail geschickt.' : 'If an account exists, we have sent an email.') : (lang === 'de' ? `E-Mail-Versand ist noch nicht eingerichtet. Bitte wende dich an ${s.support_email || s.email || 'den Support'}.` : `Email sending is not set up yet. Please contact ${s.support_email || s.email || 'support'}.`) };
    if (limited('forgot:' + ipOf(req), 5, 60 * 60e3)) return page(pages.forgot(lang, okMsg));
    const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (u && !u.blocked && mail.enabled()) {
      const tok = newToken(u.id, 'reset', 1);
      const link = `${BASE_URL}/reset?token=${tok}`;
      const L = u.lang || lang;
      await mail.send(u.email, L === 'de' ? 'StickStudio – Passwort zurücksetzen' : 'StickStudio – reset your password',
        L === 'de' ? `Hallo,\n\nüber diesen Link kannst du ein neues Passwort festlegen (1 Stunde gültig):\n${link}\n\nWenn du das nicht angefordert hast, ignoriere diese E-Mail.\n` : `Hello,\n\nuse this link to set a new password (valid for 1 hour):\n${link}\n\nIf you did not request this, just ignore this email.\n`);
    }
    return page(pages.forgot(lang, okMsg));
  }
  if (p === '/reset' && m === 'GET') return page(pages.reset(lang, url.searchParams.get('token') || ''));
  if (p === '/reset' && m === 'POST') {
    const f = await readForm(req);
    if (!validPw(f.password)) return page(pages.reset(lang, f.token, { text: lang === 'de' ? 'Das Passwort muss mindestens 10 Zeichen lang sein.' : 'The password must be at least 10 characters long.' }), 400);
    if (f.password !== f.password2) return page(pages.reset(lang, f.token, { text: lang === 'de' ? 'Die Passwörter stimmen nicht überein.' : 'The passwords do not match.' }), 400);
    const id = useToken(f.token, 'reset');
    if (!id) return page(pages.info(lang, pages.T[lang].resetTitle, pages.T[lang].badLink, false), 400);
    db.prepare('UPDATE users SET pass = ?, verified = 1 WHERE id = ?').run(hashPass(f.password), id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    logEvent(id, 'password-reset');
    return page(pages.info(lang, pages.T[lang].resetTitle, pages.T[lang].resetDone));
  }
  if ((p === '/kuendigen' || p === '/widerrufen') && m === 'GET') {
    const v = { user, name: user ? user.name : '', email: user ? user.email : '' };
    return page(p === '/kuendigen' ? pages.cancelForm(lang, v) : pages.withdrawForm(lang, v));
  }
  if ((p === '/kuendigen' || p === '/widerrufen') && m === 'POST') {
    const f = await readForm(req);
    const kind = p === '/kuendigen' ? 'cancel' : 'withdraw';
    const t = pages.T[lang];
    const v = { user, name: String(f.name || '').trim().slice(0, 200), email: String(f.email || '').trim().toLowerCase().slice(0, 200), ref: String(f.ref || '').slice(0, 100),
      kind: f.kind === 'extraordinary' ? 'extraordinary' : 'ordinary', reason: String(f.reason || '').slice(0, 2000), when: f.when === 'date' ? 'date' : 'next', date: String(f.date || '').slice(0, 10), ordered: String(f.ordered || '').slice(0, 10) };
    const form = (m2, code) => page(kind === 'cancel' ? pages.cancelForm(lang, v, m2) : pages.withdrawForm(lang, v, m2), code);
    if (!v.name || !validEmail(v.email)) return form({ text: t.required }, 400);
    if (limited(kind + ':' + ipOf(req), 10, 60 * 60e3)) return form({ text: lang === 'de' ? 'Zu viele Anfragen. Bitte später erneut versuchen.' : 'Too many requests. Please try again later.' }, 429);
    const at = new Date();
    const atText = at.toLocaleString(lang === 'de' ? 'de-DE' : 'en-GB', { timeZone: 'Europe/Berlin' }) + (lang === 'de' ? ' Uhr' : ' (Berlin time)');
    const lines = kind === 'cancel'
      ? [[t.contract, t.contractName], [t.kind, v.kind === 'extraordinary' ? t.extraordinary : t.ordinary], ...(v.reason ? [[lang === 'de' ? 'Grund' : 'Reason', v.reason]] : []),
        [t.when, v.when === 'date' && v.date ? v.date : t.nextPossible], [lang === 'de' ? 'Name' : 'Name', v.name], [t.email, v.email], ...(v.ref ? [[t.ref, v.ref]] : []), [lang === 'de' ? 'Eingegangen am' : 'Received on', atText]]
      : [[t.statement, t.withdrawStatement], [lang === 'de' ? 'Name' : 'Name', v.name], [t.email, v.email], ...(v.ordered ? [[t.orderedOn, v.ordered]] : []), ...(v.ref ? [[t.ref, v.ref]] : []), [lang === 'de' ? 'Eingegangen am' : 'Received on', atText]];
    const acc = (user && user.email === v.email ? user : null) || db.prepare('SELECT * FROM users WHERE email = ?').get(v.email);
    let result = '';
    // ordentliche Kündigung: direkt bei Lemon Squeezy beenden, wenn möglich
    if (kind === 'cancel' && v.kind === 'ordinary' && v.when === 'next' && acc && acc.sub_id) {
      const a = await lsCancel(acc.sub_id);
      if (a) { applySubscription(acc, acc.sub_id, a); result = 'automatisch bei Lemon Squeezy gekündigt'; }
    }
    db.prepare('INSERT INTO requests(kind, user_id, name, email, info, status, result, at) VALUES(?,?,?,?,?,?,?,?)')
      .run(kind, acc ? acc.id : null, v.name, v.email, JSON.stringify(lines), result ? 'done' : 'open', result, at.getTime());
    logEvent(acc ? acc.id : null, kind === 'cancel' ? 'kuendigung' : 'widerruf', `${v.email}${result ? ' – ' + result : ' – bitte bearbeiten'}`);
    const mailed = await confirmRequest(kind, v.email, lang, lines);
    return page(pages.receipt(lang, kind === 'cancel' ? t.cancelDoneTitle : t.withdrawDoneTitle, (kind === 'cancel' ? t.cancelDone : t.withdrawDone).replace('{{at}}', atText), lines,
      mailed ? t.mailSent.replace('{{email}}', v.email) : t.mailOff, user));
  }
  if (p === '/logout' && m === 'POST') {
    const tok = cookies(req).sid;
    if (tok) db.prepare('DELETE FROM sessions WHERE hash = ?').run(sha(tok));
    return redirect(res, '/login', { 'Set-Cookie': sidCookie('', 0) });
  }

  // Desktop-Programme: Lizenz aktivieren, regelmäßig prüfen, Gerät freigeben
  if (p.startsWith('/api/license/') && m === 'POST') {
    const ip = ipOf(req);
    if (limited('lic:' + ip, 60, 60 * 60e3)) return json(res, 429, { error: 'rate', message: 'Zu viele Versuche – bitte in einer Stunde erneut.' });
    const b = await readJson(req, 16 * 1024);
    if (p === '/api/license/activate' || p === '/api/license/check') {
      const r = LIC.activate(b, ip);
      return json(res, r.ok ? 200 : r.code, r);
    }
    if (p === '/api/license/deactivate') return json(res, 200, LIC.deactivate(b));
    return json(res, 404, { error: 'not found' });
  }

  // Zahlungsanbieter meldet Kauf/Verlängerung (Lemon Squeezy, Signatur mit LEMONSQUEEZY_SECRET)
  if (p === '/api/webhook/lemonsqueezy' && m === 'POST') {
    const secret = ENV.LEMONSQUEEZY_SECRET;
    const raw = await readBody(req, 1 << 20);
    if (!secret) return json(res, 503, { error: 'not configured' });
    const sig = String(req.headers['x-signature'] || '');
    const calc = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    if (sig.length !== calc.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(calc))) return json(res, 401, { error: 'bad signature' });
    let ev;
    try { ev = JSON.parse(raw.toString('utf8')); } catch (e) { return json(res, 400, { error: 'bad json' }); }
    const name = String((ev.meta && ev.meta.event_name) || '');
    const data = ev.data || {};
    const attrs = data.attributes || {};
    const custom = (ev.meta && ev.meta.custom_data) || {};
    const email = String(attrs.user_email || attrs.customer_email || '').toLowerCase();
    // Einmalkauf eines Desktop-Programms: Lizenzschlüssel anlegen und per E-Mail schicken (ohne Konto)
    if (name === 'order_created' && data.type === 'orders') {
      const made = LIC.fromOrder(attrs, data.id);
      if (made.length) {
        await sendLicenseMail(made, email, attrs.user_name || '').catch((e) => logEvent(null, 'mail-fehler', e.message));
        return json(res, 200, { ok: true, licenses: made.length });
      }
      // Update-Verlängerung einer Kauf-Lizenz
      const ren = LIC.renewFromOrder(attrs, data.id, custom);
      if (ren && ren.key) {
        await sendRenewMail(ren).catch((e) => logEvent(null, 'mail-fehler', e.message));
        return json(res, 200, { ok: true, renewed: ren.key });
      }
      if (ren) return json(res, 200, { ok: true, renewed: false });
    }
    if (name === 'order_refunded' && data.type === 'orders' && LIC.revokeOrder(data.id)) logEvent(null, 'lizenz-gesperrt', `Erstattung Bestellung ${data.id}`);
    let u = custom.user_id ? db.prepare('SELECT * FROM users WHERE id = ?').get(+custom.user_id) : null;
    if (!u && data.type === 'subscriptions' && data.id) u = db.prepare('SELECT * FROM users WHERE sub_id = ?').get(String(data.id));
    if (!u && attrs.subscription_id) u = db.prepare('SELECT * FROM users WHERE sub_id = ?').get(String(attrs.subscription_id));
    if (!u && email) u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!u) logEvent(null, 'webhook', `${name} (kein Konto gefunden: ${email})`);
    else if (data.type === 'subscriptions' && name.startsWith('subscription_')) applySubscription(u, data.id, attrs);
    else if (name === 'subscription_payment_success') {
      // Zahlung eingegangen – Laufzeit folgt mit subscription_updated; bis dahin mindestens bis zur nächsten Verlängerung freischalten
      const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(u.id);
      if (fresh.sub_renews && fresh.license_until < fresh.sub_renews + GRACE) db.prepare('UPDATE users SET license_until = ? WHERE id = ?').run(fresh.sub_renews + GRACE, u.id);
      logEvent(u.id, 'zahlung', name);
    } else if (name === 'order_refunded') {
      logEvent(u.id, 'refund', 'Erstattung gemeldet – Lizenz bitte prüfen');
    } else logEvent(u.id, 'webhook', name);
    return json(res, 200, { ok: true });
  }

  /* --- ab hier nur angemeldet --- */
  if (!user) {
    if (p.startsWith('/api/')) return json(res, 401, { error: 'login' });
    // nach der Anmeldung zurück zu FräsStudio
    const extra = p === '/fraesstudio' || p.startsWith(FRAES_PATH) ? { 'Set-Cookie': nextCookie(FRAES_PATH, 1800) } : {};
    return redirect(res, '/login' + (url.searchParams.get('lang') ? '?lang=' + lang : ''), extra);
  }
  const lic = license(user);
  if (now() - (user.last_seen || 0) > 5 * 60e3) {
    const ip = ipOf(req), cc = countryOf(ip);
    db.prepare('UPDATE users SET last_seen = ?, last_ip = ?, last_country = ? WHERE id = ?').run(now(), ip, cc || user.last_country, user.id);
  }

  /* --- FräsStudio: nur für freigeschaltete Konten --- */
  if (p === '/fraesstudio') return redirect(res, FRAES_PATH);
  if (p.startsWith(FRAES_PATH)) {
    if (!fraesAccess(user)) {
      logEvent(user.id, 'fraes-verweigert', p.slice(0, 100));
      return page(pages.info(lang, 'FräsStudio', lang === 'de' ? 'Für dieses Konto ist FräsStudio nicht freigeschaltet. Bitte wende dich an den Betreiber.' : 'FräsStudio is not enabled for this account. Please contact the operator.', false), 403);
    }
    if (m !== 'GET' && m !== 'HEAD') return send(res, 405, 'Method not allowed', 'text/plain');
    return fraesFile(res, p.slice(FRAES_PATH.length) || 'index.html') || send(res, 404, 'Not found', 'text/plain');
  }

  /* --- Brücke zur Fräse (nur mit FräsStudio-Zugang) --- */
  if (p.startsWith('/api/cnc/')) {
    if (!fraesAccess(user)) return json(res, 403, { error: 'FräsStudio ist für dieses Konto nicht freigeschaltet.' });
    if (p === '/api/cnc/config' && m === 'GET') return json(res, 200, { enabled: ENV.CNC_BRIDGE !== 'off', host: ENV.CNC_HOST || '', port: 23 });
    if (ENV.CNC_BRIDGE === 'off') return json(res, 403, { error: 'Die WLAN-Brücke ist am Server abgeschaltet (CNC_BRIDGE=off).' });
    if (p === '/api/cnc/open' && m === 'POST') {
      const b = await readJson(req, 4096);
      if (limited('cnc:' + user.id, 20, 60e3)) return json(res, 429, { error: 'Zu viele Versuche.' });
      try {
        const t = await cncTarget(b.host, b.port);
        const sess = await cncOpen(user.id, t.ip, t.port);
        return json(res, 200, { id: sess.id });
      } catch (e) { return json(res, e.code >= 400 && e.code < 600 ? e.code : 502, { error: e.message }); }
    }
    const sess = cnc.get(String(url.searchParams.get('id') || ''));
    if (!sess || sess.userId !== user.id) return json(res, 404, { error: 'Keine Verbindung (mehr).' });
    if (p === '/api/cnc/stream' && m === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no', ...SEC_HEADERS });
      res.write(`data: ${JSON.stringify({ o: 1 })}\n\n`);
      for (const msg of sess.pending.splice(0)) res.write(msg);
      sess.clients.add(res);
      clearTimeout(sess.grace);
      res.on('close', () => {
        sess.clients.delete(res);
        // Browser weg (Tab zu, Absturz, Netz weg): nach kurzer Gnadenfrist Not-Aus, damit die Fräse nicht weiterläuft
        if (!sess.clients.size && !sess.closed) sess.grace = setTimeout(() => { if (!sess.clients.size) cncClose(sess, 'Browser getrennt', true); }, 3000);
      });
      return;
    }
    if (p === '/api/cnc/send' && m === 'POST') {
      const body = await readBody(req, 8192);
      if (sess.closed || !sess.sock.writable) return json(res, 410, { error: 'Verbindung beendet.' });
      sess.sock.write(body);
      sess.lastSend = now();
      return send(res, 204, '');
    }
    if (p === '/api/cnc/close' && m === 'POST') { cncClose(sess, 'Trennen'); return json(res, 200, { ok: true }); }
    return json(res, 404, { error: 'not found' });
  }

  if (p === '/' || p === '/index.html') return page(appHtml());
  if (p === '/config.js') {
    const cfg = { online: true, user: publicUser(user), lang: user.lang || lang, buyUrl: buyUrl(s, user), support: s.support_email || s.email || '' };
    return send(res, 200, `window.STICK_CONFIG = ${JSON.stringify(cfg).replace(/</g, '\\u003c')};`, 'text/javascript; charset=utf-8');
  }
  if (p.startsWith('/app/') && m === 'GET') {
    if (!bundle || p !== '/app/' + bundle.name) return send(res, 404, 'Not found', 'text/plain');
    const head = `/*! StickStudio – lizenziert für Konto ${mark(user)}. Weitergabe und Bearbeitung untersagt. */\nwindow.__ssk=${JSON.stringify(mark(user))};\n`;
    return send(res, 200, head + bundle.code, 'text/javascript; charset=utf-8', { 'Cache-Control': 'private, no-store' });
  }
  if (p === '/account' && m === 'GET') return page(pages.account(lang, user));
  if (p === '/admin' && m === 'GET') return user.role === 'admin' ? page(pages.admin(lang, user)) : redirect(res, '/');
  if (APP_DIRS.some((d) => p.startsWith('/' + d))) return staticFile(res, p, true) || send(res, 404, 'Not found', 'text/plain');

  /* --- API --- */
  if (p === '/api/me') {
    if (m === 'GET') return json(res, 200, { user: publicUser(user), buyUrl: buyUrl(s, user), trialDays: +s.trial_days });
  }
  if (p === '/api/account/lang' && m === 'POST') {
    const b = await readJson(req);
    const l = b.lang === 'en' ? 'en' : 'de';
    db.prepare('UPDATE users SET lang = ? WHERE id = ?').run(l, user.id);
    return json(res, 200, { ok: true }, { 'Set-Cookie': langCookie(l) });
  }
  if (p === '/api/account/password' && m === 'POST') {
    const b = await readJson(req);
    if (!checkPass(String(b.old || ''), user.pass)) return json(res, 400, { error: lang === 'de' ? 'Das bisherige Passwort ist falsch.' : 'The current password is wrong.' });
    if (!validPw(b.password)) return json(res, 400, { error: lang === 'de' ? 'Das neue Passwort muss mindestens 10 Zeichen lang sein.' : 'The new password must be at least 10 characters long.' });
    db.prepare('UPDATE users SET pass = ? WHERE id = ?').run(hashPass(b.password), user.id);
    // andere Sitzungen beenden, aktuelle behalten
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND hash != ?').run(user.id, sha(cookies(req).sid));
    logEvent(user.id, 'password-change');
    return json(res, 200, { ok: true });
  }
  if (p === '/api/account/name' && m === 'POST') {
    const b = await readJson(req);
    db.prepare('UPDATE users SET name = ? WHERE id = ?').run(String(b.name || '').slice(0, 120), user.id);
    return json(res, 200, { ok: true });
  }
  if (p === '/api/account/export' && m === 'GET') {
    // Datenauskunft / Datenübertragbarkeit (DSGVO Art. 15, 20)
    const projects = db.prepare('SELECT id, name, tags, customer, stitches, w, h, colors, data, created, updated FROM projects WHERE user_id = ?').all(user.id);
    const out = { user: publicUser(user), acceptedTerms: user.accepted_terms ? new Date(user.accepted_terms).toISOString() : null, projects: projects.map((r) => ({ ...r, tags: JSON.parse(r.tags), data: JSON.parse(r.data) })) };
    return send(res, 200, JSON.stringify(out, null, 1), 'application/json; charset=utf-8', { 'Content-Disposition': 'attachment; filename="stickstudio-daten.json"' });
  }
  if (p === '/api/account' && m === 'DELETE') {
    const b = await readJson(req);
    if (!checkPass(String(b.password || ''), user.pass)) return json(res, 400, { error: lang === 'de' ? 'Passwort falsch.' : 'Wrong password.' });
    if (user.role === 'admin' && db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get().n <= 1) return json(res, 400, { error: lang === 'de' ? 'Das letzte Admin-Konto kann nicht gelöscht werden.' : 'The last admin account cannot be deleted.' });
    // laufendes Abo mit beenden (sonst liefe die Zahlung weiter)
    if (user.sub_id && ['active', 'on_trial', 'past_due', 'paused'].includes(user.sub_status)) {
      const a = await lsCancel(user.sub_id);
      db.prepare('INSERT INTO requests(kind, user_id, name, email, info, status, result, at) VALUES(?,?,?,?,?,?,?,?)')
        .run('cancel', null, user.name || user.email, user.email, JSON.stringify([['Anlass', 'Konto gelöscht'], ['Abo', user.sub_id]]), a ? 'done' : 'open', a ? 'automatisch bei Lemon Squeezy gekündigt' : '', now());
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    logEvent(null, 'account-deleted', `Konto ${user.id} gelöscht`);
    return json(res, 200, { ok: true }, { 'Set-Cookie': sidCookie('', 0) });
  }

  // Projekte („Meine Designs“)
  if (p === '/api/projects' && m === 'GET') {
    const rows = db.prepare('SELECT id, name, tags, customer, stitches, w, h, colors, thumb, created, updated FROM projects WHERE user_id = ? ORDER BY updated DESC').all(user.id);
    return json(res, 200, rows.map((r) => ({ ...r, tags: JSON.parse(r.tags), date: r.updated })));
  }
  const pm = /^\/api\/projects\/(\d+)$/.exec(p);
  if (pm && m === 'GET') {
    const r = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(+pm[1], user.id);
    if (!r) return json(res, 404, { error: 'not found' });
    return json(res, 200, { ...r, tags: JSON.parse(r.tags), date: r.updated });
  }
  if ((p === '/api/projects' && m === 'POST') || (pm && m === 'PUT')) {
    if (!lic.active) return json(res, 402, { error: 'license', message: lang === 'de' ? 'Deine Lizenz ist abgelaufen – Speichern ist nur mit gültiger Lizenz möglich.' : 'Your license has expired – saving requires a valid license.' });
    const b = await readJson(req, 25 << 20);
    if (typeof b.data !== 'string' || !b.data.startsWith('{')) return json(res, 400, { error: 'data' });
    const row = [String(b.name || 'Design').slice(0, 120), JSON.stringify((Array.isArray(b.tags) ? b.tags : []).slice(0, 30).map((x) => String(x).slice(0, 40))), String(b.customer || '').slice(0, 120),
      b.stitches | 0, +b.w || 0, +b.h || 0, b.colors | 0, String(b.thumb || '').startsWith('data:image/') ? String(b.thumb).slice(0, 400000) : '', b.data];
    const count = db.prepare('SELECT COUNT(*) AS n FROM projects WHERE user_id = ?').get(user.id).n;
    if (pm) {
      const r = db.prepare('UPDATE projects SET name=?, tags=?, customer=?, stitches=?, w=?, h=?, colors=?, thumb=?, data=?, updated=? WHERE id=? AND user_id=?').run(...row, now(), +pm[1], user.id);
      if (!r.changes) return json(res, 404, { error: 'not found' });
      return json(res, 200, { id: +pm[1] });
    }
    if (count >= +(ENV.MAX_PROJECTS || 2000)) return json(res, 400, { error: lang === 'de' ? 'Maximale Anzahl Designs erreicht.' : 'Maximum number of designs reached.' });
    const r = db.prepare('INSERT INTO projects(user_id, name, tags, customer, stitches, w, h, colors, thumb, data, created, updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(user.id, ...row, now(), now());
    return json(res, 200, { id: Number(r.lastInsertRowid) });
  }
  if (pm && m === 'DELETE') {
    db.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').run(+pm[1], user.id);
    return json(res, 200, { ok: true });
  }

  // Stickdatei erzeugen – nur mit gültiger Lizenz (Testversion zählt)
  if (p === '/api/export' && m === 'POST') {
    if (!lic.active) return json(res, 402, { error: 'license', message: lang === 'de' ? 'Deine Lizenz ist abgelaufen – Stickdateien können nur mit gültiger Lizenz erzeugt werden.' : 'Your license has expired – embroidery files can only be created with a valid license.' });
    if (limited('export:' + user.id, 600, 60 * 60e3)) return json(res, 429, { error: 'zu viele Exporte' });
    const b = await readJson(req, 80 << 20);
    try {
      const bytes = fileio.write(String(b.fmt || 'dst'), b.cmds, b.palette, { name: b.name, firstColor: b.firstColor, settings: b.settings });
      return send(res, 200, Buffer.from(bytes), 'application/octet-stream');
    } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (p === '/api/import' && m === 'POST') {
    const fmt = String(url.searchParams.get('fmt') || '').toLowerCase();
    const raw = await readBody(req, 20 << 20);
    try { return json(res, 200, fileio.read(fmt, new Uint8Array(raw))); } catch (e) { return json(res, 400, { error: e.message }); }
  }

  /* --- Verwaltung --- */
  if (p.startsWith('/api/admin/')) {
    if (user.role !== 'admin') return json(res, 403, { error: 'forbidden' });
    // Kauf-Lizenzen der Desktop-Programme
    if (p === '/api/admin/licenses' && m === 'GET') return json(res, 200, { list: LIC.list(url.searchParams.get('q') || ''), publicKey: LIC.publicPem, products: LIC.PRODUCTS, variants: !!ENV.LICENSE_VARIANTS });
    if (p === '/api/admin/licenses' && m === 'POST') {
      const b = await readJson(req);
      const n = Math.max(1, Math.min(50, b.count | 0 || 1));
      const made = [];
      for (let i = 0; i < n; i++) made.push(LIC.create({ product: b.product, name: b.name, email: b.email, max: b.max, note: b.note }));
      if (b.mail && validEmail(String(b.email || ''))) await sendLicenseMail(made, b.email, b.name).catch((e) => logEvent(null, 'mail-fehler', e.message));
      logEvent(user.id, 'lizenz-neu', `${made.length} × ${b.product} für ${b.email || b.name || '–'}`);
      return json(res, 200, { list: made });
    }
    const lm = /^\/api\/admin\/licenses\/(\d+)(\/offline)?$/.exec(p);
    if (lm) {
      const id = +lm[1];
      if (lm[2] && m === 'POST') { const b = await readJson(req); return json(res, 200, { token: LIC.offlineGrant(id, b.machine, b.days) }); }
      if (m === 'GET') { const l = LIC.list().find((x) => x.id === id); return l ? json(res, 200, { ...l, devices: LIC.devices(id) }) : json(res, 404, { error: 'not found' }); }
      if (m === 'POST') { const l = LIC.update(id, await readJson(req)); return l ? json(res, 200, l) : json(res, 404, { error: 'not found' }); }
    }
    if (p === '/api/admin/users' && m === 'GET') {
      const q = '%' + (url.searchParams.get('q') || '') + '%';
      const rows = db.prepare(`SELECT u.id, u.email, u.name, u.role, u.lang, u.verified, u.blocked, u.trial_until, u.license_until, u.note, u.created, u.last_login, u.sub_id, u.sub_status, u.sub_renews, u.sub_ends, u.sub_portal, u.last_ip, u.last_country, u.reg_country, u.last_seen, u.fraes,
        (SELECT COUNT(*) FROM projects p WHERE p.user_id = u.id) AS projects FROM users u WHERE u.email LIKE ? OR u.name LIKE ? ORDER BY u.created DESC LIMIT 500`).all(q, q);
      let list = rows;
      // Suche nach der Kennung aus einer weitergegebenen Programmdatei
      const qq = (url.searchParams.get('q') || '').trim().toLowerCase();
      if (!list.length && /^[0-9a-f]{16}$/.test(qq)) {
        const hit = db.prepare('SELECT id FROM users').all().find((r) => mark(r) === qq);
        if (hit) list = db.prepare(`SELECT u.id, u.email, u.name, u.role, u.lang, u.verified, u.blocked, u.trial_until, u.license_until, u.note, u.created, u.last_login, u.sub_id, u.sub_status, u.sub_renews, u.sub_ends, u.sub_portal, u.last_ip, u.last_country, u.reg_country, u.last_seen, u.fraes,
          (SELECT COUNT(*) FROM projects p WHERE p.user_id = u.id) AS projects FROM users u WHERE u.id = ?`).all(hit.id);
      }
      return json(res, 200, list.map((r) => ({ ...r, license: license(r), mark: mark(r) })));
    }
    const um = /^\/api\/admin\/users\/(\d+)(\/reset|\/extend)?$/.exec(p);
    if (um) {
      const id = +um[1];
      const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
      if (!u) return json(res, 404, { error: 'not found' });
      if (um[2] === '/extend' && m === 'POST') {
        const b = await readJson(req);
        extendLicense(id, Math.max(1, Math.min(3650, b.days | 0 || +s.license_days || 365)), 'Admin ' + user.email);
        return json(res, 200, { ok: true });
      }
      if (um[2] === '/reset' && m === 'POST') {
        const tok = newToken(id, 'reset', 72);
        logEvent(id, 'admin-reset-link', user.email);
        return json(res, 200, { link: `${BASE_URL}/reset?token=${tok}` });
      }
      if (!um[2] && m === 'POST') {
        const b = await readJson(req);
        const toTs = (v) => (v === null || v === '' ? 0 : Math.max(0, +new Date(v) || 0));
        if (id === user.id && (b.blocked || (b.role && b.role !== 'admin'))) return json(res, 400, { error: 'Das eigene Admin-Konto kann nicht gesperrt oder herabgestuft werden.' });
        const upd = {
          license_until: b.license_until !== undefined ? toTs(b.license_until) : u.license_until,
          trial_until: b.trial_until !== undefined ? toTs(b.trial_until) : u.trial_until,
          blocked: b.blocked !== undefined ? (b.blocked ? 1 : 0) : u.blocked,
          role: b.role === 'admin' || b.role === 'user' ? b.role : u.role,
          verified: b.verified !== undefined ? (b.verified ? 1 : 0) : u.verified,
          note: b.note !== undefined ? String(b.note).slice(0, 2000) : u.note,
          name: b.name !== undefined ? String(b.name).slice(0, 120) : u.name,
          fraes: b.fraes !== undefined ? (b.fraes ? 1 : 0) : u.fraes,
        };
        db.prepare('UPDATE users SET license_until=?, trial_until=?, blocked=?, role=?, verified=?, note=?, name=?, fraes=? WHERE id=?').run(upd.license_until, upd.trial_until, upd.blocked, upd.role, upd.verified, upd.note, upd.name, upd.fraes, id);
        if (upd.blocked) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
        logEvent(id, 'admin-edit', `${user.email}: ${JSON.stringify(b).slice(0, 300)}`);
        return json(res, 200, { ok: true });
      }
      if (!um[2] && m === 'DELETE') {
        if (id === user.id) return json(res, 400, { error: 'Das eigene Konto bitte unter „Mein Konto“ löschen.' });
        db.prepare('DELETE FROM users WHERE id = ?').run(id);
        logEvent(null, 'admin-delete', `${user.email} löscht Konto ${u.email}`);
        return json(res, 200, { ok: true });
      }
    }
    if (p === '/api/admin/users' && m === 'POST') {
      const b = await readJson(req);
      const email = String(b.email || '').trim().toLowerCase();
      if (!validEmail(email)) return json(res, 400, { error: 'E-Mail ungültig' });
      if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) return json(res, 409, { error: 'E-Mail existiert schon' });
      const pw = crypto.randomBytes(9).toString('base64url');
      const id = createUser({ email, password: pw, name: b.name || '', lang: b.lang === 'en' ? 'en' : 'de', verified: 1, accepted: 0 });
      const tok = newToken(id, 'reset', 72);
      logEvent(id, 'admin-create', user.email);
      return json(res, 200, { id, link: `${BASE_URL}/reset?token=${tok}` });
    }
    if (p === '/api/admin/settings') {
      if (m === 'GET') return json(res, 200, { settings: s, mail: mail.enabled(), webhook: !!ENV.LEMONSQUEEZY_SECRET, lsApi: !!ENV.LEMONSQUEEZY_API_KEY, geo: geo.status(), keepDays: EVENT_DAYS, webhookUrl: `${BASE_URL}/api/webhook/lemonsqueezy`, baseUrl: BASE_URL });
      if (m === 'POST') { setSettings(await readJson(req)); return json(res, 200, { ok: true }); }
    }
    if (p === '/api/admin/events' && m === 'GET') {
      const kind = url.searchParams.get('kind') || '', qq = '%' + (url.searchParams.get('q') || '') + '%';
      const rows = db.prepare('SELECT e.*, u.email FROM events e LEFT JOIN users u ON u.id = e.user_id WHERE (? = \'\' OR e.kind = ?) AND (u.email LIKE ? OR e.info LIKE ? OR ? = \'%%\') ORDER BY e.id DESC LIMIT 500').all(kind, kind, qq, qq, qq);
      const kinds = db.prepare('SELECT kind, COUNT(*) AS n FROM events GROUP BY kind ORDER BY n DESC').all();
      return json(res, 200, { rows, kinds, keepDays: EVENT_DAYS });
    }
    if (p === '/api/admin/stats' && m === 'GET') {
      const t = now();
      const q = (sql, ...a) => db.prepare(sql).get(...a).n;
      return json(res, 200, {
        users: q('SELECT COUNT(*) AS n FROM users'),
        licensed: q('SELECT COUNT(*) AS n FROM users WHERE license_until > ?', t),
        trial: q('SELECT COUNT(*) AS n FROM users WHERE license_until <= ? AND trial_until > ?', t, t),
        expired: q("SELECT COUNT(*) AS n FROM users WHERE role != 'admin' AND license_until <= ? AND trial_until <= ?", t, t),
        projects: q('SELECT COUNT(*) AS n FROM projects'),
        subs: q("SELECT COUNT(*) AS n FROM users WHERE sub_status IN ('active','on_trial','past_due')"),
        openRequests: q("SELECT COUNT(*) AS n FROM requests WHERE status = 'open'"),
        newUsers7: q("SELECT COUNT(*) AS n FROM users WHERE role != 'admin' AND created > ?", t - 7 * DAY),
        newUsers30: q("SELECT COUNT(*) AS n FROM users WHERE role != 'admin' AND created > ?", t - 30 * DAY),
        active24h: q("SELECT COUNT(*) AS n FROM users WHERE last_seen > ?", t - DAY),
        active7: q("SELECT COUNT(*) AS n FROM users WHERE last_seen > ?", t - 7 * DAY),
        neverLoggedIn: q("SELECT COUNT(*) AS n FROM users WHERE role != 'admin' AND last_login = 0"),
        expiring30: q("SELECT COUNT(*) AS n FROM users WHERE role != 'admin' AND MAX(license_until, trial_until) > ? AND MAX(license_until, trial_until) < ?", t, t + 30 * DAY),
        byCountry: db.prepare("SELECT last_country AS c, COUNT(*) AS n FROM users WHERE role != 'admin' AND last_country != '' GROUP BY last_country ORDER BY n DESC LIMIT 15").all(),
        unknownCountry: q("SELECT COUNT(*) AS n FROM users WHERE role != 'admin' AND last_country = ''"),
        daily: db.prepare("SELECT strftime('%Y-%m-%d', at / 1000, 'unixepoch') AS day, SUM(kind = 'login') AS logins, SUM(kind = 'register') AS regs FROM events WHERE kind IN ('login','register') AND at > ? GROUP BY day ORDER BY day").all(t - 14 * DAY),
        geo: geo.status(),
      });
    }
    if (p === '/api/admin/users.csv' && m === 'GET') {
      const rows = db.prepare('SELECT * FROM users ORDER BY created DESC').all();
      const d = (ms) => (ms ? new Date(ms).toISOString() : '');
      const cell = (v) => { v = String(v ?? ''); if (/^[=+\-@]/.test(v)) v = "'" + v; return /[",;\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      const head = ['E-Mail', 'Name', 'Rolle', 'Sprache', 'Status', 'Registriert', 'Land Registrierung', 'Test bis', 'Lizenz bis', 'Abo', 'Abo verlängert sich', 'Letzte Anmeldung', 'Zuletzt aktiv', 'Letzte IP', 'Land', 'Gesperrt', 'Notiz'];
      const lines = [head.join(';')];
      for (const r of rows) {
        const l = license(r);
        lines.push([r.email, r.name, r.role, r.lang, r.role === 'admin' ? 'Admin' : r.blocked ? 'gesperrt' : l.viewOnly ? 'abgelaufen' : l.trial ? 'Testphase' : r.sub_id ? 'Abo' : 'Lizenz', d(r.created), r.reg_country, d(r.trial_until), d(r.license_until), r.sub_status, d(r.sub_renews), d(r.last_login), d(r.last_seen), r.last_ip, r.last_country, r.blocked ? 'ja' : '', r.note].map(cell).join(';'));
      }
      logEvent(user.id, 'admin-export', 'Benutzerliste als CSV');
      return send(res, 200, '\ufeff' + lines.join('\r\n'), 'text/csv; charset=utf-8', { 'Content-Disposition': 'attachment; filename="stickstudio-benutzer.csv"' });
    }
    if (p === '/api/admin/geoip' && m === 'POST') {
      try { const i = await geo.update(GEO_FILE); logEvent(user.id, 'geoip', `Länderdaten aktualisiert (${i.entries} Bereiche)`); return json(res, 200, geo.status()); }
      catch (e) { return json(res, 502, { error: (user.lang === 'en' ? 'Download failed: ' : 'Download fehlgeschlagen: ') + e.message }); }
    }
    if (p === '/api/admin/requests' && m === 'GET') {
      return json(res, 200, db.prepare('SELECT r.*, u.email AS account FROM requests r LEFT JOIN users u ON u.id = r.user_id ORDER BY r.id DESC LIMIT 300').all().map((r) => ({ ...r, info: JSON.parse(r.info || '[]') })));
    }
    const rq = /^\/api\/admin\/requests\/(\d+)$/.exec(p);
    if (rq && m === 'POST') {
      const b = await readJson(req);
      db.prepare('UPDATE requests SET status = ?, result = ? WHERE id = ?').run(b.done ? 'done' : 'open', String(b.result || (b.done ? 'erledigt von ' + user.email : '')).slice(0, 500), +rq[1]);
      return json(res, 200, { ok: true });
    }
    if (p === '/api/admin/test-mail' && m === 'POST') {
      const ok = await mail.send(user.email, 'StickStudio – Test', 'Diese Test-E-Mail zeigt, dass der E-Mail-Versand funktioniert.');
      return json(res, ok ? 200 : 500, { ok });
    }
  }
  return p.startsWith('/api/') ? json(res, 404, { error: 'not found' }) : page(pages.info(lang, pages.T[lang].notFound, pages.T[lang].notFound, false), 404);
}

// Kauf-Link für die Update-Verlängerung je Programm: LICENSE_RENEW_URLS="laser=https://… fraes=https://… stick=https://…"
function renewUrl(product, key) {
  const m = {};
  for (const part of String(ENV.LICENSE_RENEW_URLS || '').split(/\s+/)) { const i = part.indexOf('='); if (i > 0) m[part.slice(0, i)] = part.slice(i + 1); }
  if (!m[product]) return '';
  try { const u = new URL(m[product]); u.searchParams.set('checkout[custom][license_key]', key); return u.toString(); } catch (e) { return m[product]; }
}
const dDE = (ms) => new Date(ms).toLocaleDateString('de-DE');
async function sendRenewMail(lic) {
  if (!lic.email) return false;
  const name = (licenses.PRODUCTS[lic.product] || {}).name || lic.product;
  return mail.send(lic.email, `${name}: Updates verlängert`, `Hallo${lic.name ? ' ' + lic.name : ''},

vielen Dank! Die Updates für ${name} (${lic.key}) sind jetzt bis zum ${dDE(lic.updates_until)} freigeschaltet.
Das Programm übernimmt das bei der nächsten Prüfung automatisch (oder sofort über „Programm → Lizenz jetzt prüfen“).
${settings().company ? '\n' + settings().company : ''}`);
}
// Erinnerung etwa 2 Wochen bevor die inklusiven Updates enden
async function updateReminders() {
  for (const lic of LIC.dueReminders(14)) {
    const name = (licenses.PRODUCTS[lic.product] || {}).name || lic.product, url = renewUrl(lic.product, lic.key);
    await mail.send(lic.email, `${name}: Updates enden am ${dDE(lic.updates_until)}`, `Hallo${lic.name ? ' ' + lic.name : ''},

die Updates für ${name} (${lic.key}) sind noch bis zum ${dDE(lic.updates_until)} inklusive.
Dein Programm läuft danach ganz normal weiter – du bekommst nur keine neuen Versionen mehr.
${url ? `\nWenn du weiter neue Funktionen und Verbesserungen bekommen möchtest, kannst du die Updates hier um ein Jahr verlängern:\n${url}\n` : ''}${settings().company ? '\n' + settings().company : ''}`).catch((e) => logEvent(null, 'mail-fehler', e.message));
    LIC.markReminded(lic.id);
  }
}

// Lizenzschlüssel per E-Mail an den Käufer
async function sendLicenseMail(list, to, name) {
  if (!to) return false;
  const s = settings();
  const names = list.map((l) => `${(licenses.PRODUCTS[l.product] || {}).name || l.product}: ${l.key}`).join('\n');
  const text = `Hallo${name ? ' ' + name : ''},

vielen Dank für deinen Kauf! Hier ${list.length > 1 ? 'sind deine Lizenzschlüssel' : 'ist dein Lizenzschlüssel'}:

${names}

So geht es:
1. Programm installieren und starten.
2. Den Schlüssel im Fenster „Lizenz“ eingeben und auf „Freischalten“ klicken (einmal Internet nötig).
3. Das Programm prüft die Lizenz danach gelegentlich im Hintergrund. Ohne Internet läuft es bis zu ${licenses.OFFLINE_DAYS} Tage weiter.

Die Lizenz ist ein Kauf und gilt dauerhaft. Updates (neue Versionen) sind bis zum ${dDE(list[0].updates_until)} inklusive.
Danach läuft dein Programm einfach weiter. Neue Versionen gibt es dann mit einer Update-Verlängerung.

Eine Lizenz gilt für ${list[0].max_devices} Geräte. Beim Wechsel auf einen neuen Rechner im alten Programm unter „Lizenz“ → „Dieses Gerät freigeben“ abmelden.

Bitte bewahre diese E-Mail gut auf.
${s.company ? '\n' + s.company : ''}${s.support_email ? '\nHilfe: ' + s.support_email : ''}`;
  return mail.send(to, list.length > 1 ? 'Deine Lizenzschlüssel' : 'Dein Lizenzschlüssel', text);
}

// Kauf-Link mit Kundendaten (Lemon Squeezy: checkout[email] und checkout[custom][user_id])
function buyUrl(s, u) {
  if (!s.buy_url) return '';
  try {
    const x = new URL(s.buy_url);
    if (/lemonsqueezy\.com$/.test(x.hostname)) {
      x.searchParams.set('checkout[email]', u.email);
      x.searchParams.set('checkout[custom][user_id]', String(u.id));
    }
    return x.toString();
  } catch (e) { return s.buy_url; }
}

const server = http.createServer((req, res) => {
  route(req, res).catch((e) => {
    if (!res.headersSent) {
      if (e.code === 413) return json(res, 413, { error: 'Datei zu groß' });
      if (e.code === 400) return json(res, 400, { error: e.message });
      console.error(e);
      send(res, 500, 'Interner Fehler', 'text/plain; charset=utf-8');
    }
  });
});

if (require.main === module) {
  ensureAdmin();
  // HOST=127.0.0.1: nur über den Reverse Proxy auf demselben Rechner erreichbar (z. B. neben Nextcloud/Immich)
  server.listen(PORT, ENV.HOST || undefined, () => console.log(`StickStudio läuft auf ${BASE_URL} (Port ${PORT}${ENV.HOST ? ', nur ' + ENV.HOST : ''}, Daten in ${DATA_DIR})`));
  // Protokoll aufräumen (Datenschutz) und Länderdaten aktuell halten
  const housekeeping = () => {
    try { db.prepare('DELETE FROM events WHERE at < ?').run(now() - EVENT_DAYS * DAY); db.prepare('DELETE FROM sessions WHERE expires < ?').run(now()); db.prepare('DELETE FROM tokens WHERE expires < ?').run(now()); } catch (e) { console.error(e); }
    const g = geo.status();
    if (ENV.GEOIP !== 'off' && (!g.loaded || now() - g.updated > 35 * DAY)) geo.update(GEO_FILE).then((i) => console.log(`Länderdaten geladen (${i.entries} Bereiche)`)).catch((e) => console.log('Länderdaten nicht geladen: ' + e.message));
  };
  setTimeout(housekeeping, 20e3).unref();
  setInterval(housekeeping, 24 * 60 * 60e3).unref();
  // stündlich: Verlängerungshinweise per E-Mail
  setInterval(() => renewalReminders().catch((e) => console.error(e)), 60 * 60e3).unref();
  setTimeout(() => renewalReminders().catch((e) => console.error(e)), 30e3).unref();
  // Kauf-Lizenzen: Erinnerung vor dem Ende der inklusiven Updates
  setInterval(() => updateReminders().catch((e) => console.error(e)), 6 * 60 * 60e3).unref();
  setTimeout(() => updateReminders().catch((e) => console.error(e)), 60e3).unref();
}
module.exports = { server, db, ensureAdmin, createUser, license, renewalReminders, updateReminders, geo, LIC };
