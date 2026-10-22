/* Julekontor Bastelwerkstatt – Server für den Abgleich zwischen Handy und PC.
   Start:  node --no-warnings server/server.js      (Node.js 22.13 oder neuer, keine Zusatzpakete)
   Benutzer:  node --no-warnings server/server.js add-user name@julekontor.dk 'passwort'
   Einstellungen über Umgebungsvariablen: PORT, DATA_DIR, COOKIE_SECURE, BASTEL_USER + BASTEL_PASSWORD */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const APP_DIR = path.join(__dirname, '..');
const ENV = process.env;
const PORT = +(ENV.PORT || 8090);
const DATA_DIR = ENV.DATA_DIR || path.join(APP_DIR, 'data');
const IMG_DIR = path.join(DATA_DIR, 'img');
const SECURE_COOKIE = ENV.COOKIE_SECURE === '1';
const SESSION_DAYS = 120;
const DAY = 864e5;
const COOKIE = 'bastel_sid';

/* ---------- Datenbank ---------- */
fs.mkdirSync(IMG_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'bastel.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    pass TEXT NOT NULL,
    created INTEGER NOT NULL,
    last_login INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS sessions (
    hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires INTEGER NOT NULL
  );
  -- Ein Eintrag je Kategorie, Material, Projekt und den Einstellungen. Alle Benutzer teilen dieselben Daten.
  CREATE TABLE IF NOT EXISTS items (
    key TEXT PRIMARY KEY,              -- z. B. 'proj:abc123'
    upd INTEGER NOT NULL,              -- Änderungszeit vom Gerät (ms)
    deleted INTEGER NOT NULL DEFAULT 0,
    data TEXT,
    seq INTEGER NOT NULL               -- laufende Nummer, damit Geräte nur Neues abholen
  );
  CREATE INDEX IF NOT EXISTS items_seq ON items(seq);
  CREATE TABLE IF NOT EXISTS images (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    size INTEGER NOT NULL,
    created INTEGER NOT NULL
  );
`);

/* ---------- Passwörter und Sitzungen ---------- */
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
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
function setUser(email, pw) {
  email = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw new Error('Ungültige E-Mail-Adresse');
  if (String(pw || '').length < 8) throw new Error('Das Passwort braucht mindestens 8 Zeichen');
  const row = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (row) db.prepare('UPDATE users SET pass = ? WHERE id = ?').run(hashPass(pw), row.id);
  else db.prepare('INSERT INTO users(email, pass, created) VALUES(?, ?, ?)').run(email, hashPass(pw), Date.now());
  return row ? 'geändert' : 'angelegt';
}

/* ---------- Befehle auf der Kommandozeile ---------- */
const [cmd, a1, a2] = process.argv.slice(2);
if (cmd) {
  try {
    if (cmd === 'add-user' || cmd === 'passwd') console.log(`Benutzer ${a1} ${setUser(a1, a2)}.`);
    else if (cmd === 'del-user') { db.prepare('DELETE FROM users WHERE email = ?').run(String(a1).toLowerCase()); console.log(`Benutzer ${a1} gelöscht.`); }
    else if (cmd === 'list-users') for (const u of db.prepare('SELECT email, created, last_login FROM users ORDER BY email').all())
      console.log(u.email, ' angelegt', new Date(u.created).toLocaleDateString('de-DE'), ' zuletzt', u.last_login ? new Date(u.last_login).toLocaleString('de-DE') : '–');
    else console.log('Befehle: add-user <email> <passwort> | passwd <email> <passwort> | del-user <email> | list-users');
  } catch (e) { console.error(e.message); process.exitCode = 1; }
  return;
}
if (ENV.BASTEL_USER && ENV.BASTEL_PASSWORD && !db.prepare('SELECT 1 FROM users WHERE email = ?').get(ENV.BASTEL_USER.toLowerCase())) {
  console.log(`Benutzer ${ENV.BASTEL_USER} ${setUser(ENV.BASTEL_USER, ENV.BASTEL_PASSWORD)}.`);
}

/* ---------- HTTP-Hilfen ---------- */
function send(res, code, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  const data = isBuf || typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(code, {
    'content-type': isBuf ? 'application/octet-stream' : typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(data);
}
function readBody(req, max) {
  return new Promise((res, rej) => {
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > max) { rej(Object.assign(new Error('zu groß'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => res(Buffer.concat(chunks)));
    req.on('error', rej);
  });
}
async function readJson(req, max = 20e6) {
  try { return JSON.parse((await readBody(req, max)).toString('utf8') || '{}'); }
  catch (e) { if (e.code) throw e; throw Object.assign(new Error('Ungültige Daten'), { code: 400 }); }
}
function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  return out;
}
function sessionUser(req) {
  const t = cookies(req)[COOKIE];
  if (!t) return null;
  return db.prepare('SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.hash = ? AND s.expires > ?').get(sha(t), Date.now()) || null;
}
function sessionCookie(token, maxAge) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${SECURE_COOKIE ? '; Secure' : ''}`;
}
const ipOf = req => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
const attempts = new Map(); // IP → [Zeitpunkte fehlgeschlagener Anmeldungen]
function tooMany(ip) {
  const t = Date.now(), list = (attempts.get(ip) || []).filter(x => t - x < 15 * 60e3);
  attempts.set(ip, list);
  return list.length >= 10;
}

/* ---------- Statische Dateien der App ---------- */
const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/logo.jpg': ['logo.jpg', 'image/jpeg'],
  '/icon-192.png': ['icon-192.png', 'image/png'],
  '/icon-512.png': ['icon-512.png', 'image/png'],
  '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json'],
  '/sw.js': ['sw.js', 'text/javascript; charset=utf-8'],
};
const SECURITY = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
  'x-frame-options': 'DENY',
};

/* ---------- Routen ---------- */
const IMG_ID = /^[a-z0-9]{6,40}$/;
const KEY = /^(cat|mat|proj|set):[A-Za-z0-9_-]{1,60}$/;

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  for (const [k, v] of Object.entries(SECURITY)) res.setHeader(k, v);

  if (req.method === 'GET' && STATIC[p]) {
    const [file, type] = STATIC[p];
    return fs.readFile(path.join(APP_DIR, file), (err, buf) => err ? send(res, 404, 'Nicht gefunden') : send(res, 200, buf, { 'content-type': type, 'cache-control': 'no-cache' }));
  }
  if (!p.startsWith('/api/')) return send(res, 404, 'Nicht gefunden');

  if (p === '/api/me' && req.method === 'GET') {
    const u = sessionUser(req);
    return send(res, 200, { app: 'julekontor-bastel', user: u ? u.email : null });
  }
  if (p === '/api/login' && req.method === 'POST') {
    const ip = ipOf(req);
    if (tooMany(ip)) return send(res, 429, { error: 'Zu viele Versuche. Bitte in 15 Minuten erneut versuchen.' });
    const { email, password } = await readJson(req, 10e3);
    const u = db.prepare('SELECT id, email, pass FROM users WHERE email = ?').get(String(email || '').trim().toLowerCase());
    if (!u || !checkPass(String(password || ''), u.pass)) {
      attempts.get(ip).push(Date.now());
      return send(res, 401, { error: 'E-Mail oder Passwort stimmt nicht.' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions(hash, user_id, expires) VALUES(?, ?, ?)').run(sha(token), u.id, Date.now() + SESSION_DAYS * DAY);
    db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(Date.now(), u.id);
    db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
    return send(res, 200, { user: u.email }, { 'set-cookie': sessionCookie(token, SESSION_DAYS * 86400) });
  }
  if (p === '/api/logout' && req.method === 'POST') {
    const t = cookies(req)[COOKIE];
    if (t) db.prepare('DELETE FROM sessions WHERE hash = ?').run(sha(t));
    return send(res, 200, { ok: true }, { 'set-cookie': sessionCookie('', 0) });
  }

  const user = sessionUser(req);
  if (!user) return send(res, 401, { error: 'Bitte anmelden.' });

  if (p === '/api/sync' && req.method === 'GET') {
    const since = Math.max(0, parseInt(url.searchParams.get('since'), 10) || 0);
    const rows = db.prepare('SELECT key, upd, deleted, data, seq FROM items WHERE seq > ? ORDER BY seq').all(since);
    const seq = db.prepare('SELECT COALESCE(MAX(seq), 0) AS s FROM items').get().s;
    return send(res, 200, { seq, items: rows.map(r => ({ key: r.key, upd: r.upd, deleted: !!r.deleted, data: r.data ? JSON.parse(r.data) : null })) });
  }
  if (p === '/api/sync' && req.method === 'POST') {
    const { items } = await readJson(req);
    if (!Array.isArray(items)) return send(res, 400, { error: 'Ungültige Daten' });
    const get = db.prepare('SELECT upd FROM items WHERE key = ?');
    const put = db.prepare('INSERT INTO items(key, upd, deleted, data, seq) VALUES(?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET upd = excluded.upd, deleted = excluded.deleted, data = excluded.data, seq = excluded.seq');
    let seq = db.prepare('SELECT COALESCE(MAX(seq), 0) AS s FROM items').get().s;
    let taken = 0;
    db.exec('BEGIN');
    try {
      for (const it of items) {
        if (!it || !KEY.test(String(it.key)) || !Number.isFinite(it.upd)) continue;
        const row = get.get(it.key);
        if (row && row.upd >= it.upd) continue; // auf dem Server liegt schon etwas Neueres
        put.run(it.key, Math.round(it.upd), it.deleted ? 1 : 0, it.deleted ? null : JSON.stringify(it.data ?? null), ++seq);
        taken++;
      }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    return send(res, 200, { taken, seq });
  }
  const im = p.match(/^\/api\/img\/([^/]+)$/);
  if (im) {
    const id = im[1];
    if (!IMG_ID.test(id)) return send(res, 400, { error: 'Ungültige Bild-ID' });
    const file = path.join(IMG_DIR, id);
    if (req.method === 'PUT') {
      if (db.prepare('SELECT 1 FROM images WHERE id = ?').get(id)) { req.resume(); return send(res, 200, { ok: true }); }
      const type = String(req.headers['content-type'] || '');
      if (!/^image\/(jpeg|png|webp|gif|heic|heif)$/.test(type)) return send(res, 415, { error: 'Nur Bilder erlaubt' });
      const buf = await readBody(req, 15e6);
      fs.writeFileSync(file, buf);
      db.prepare('INSERT OR REPLACE INTO images(id, type, size, created) VALUES(?, ?, ?, ?)').run(id, type, buf.length, Date.now());
      return send(res, 200, { ok: true });
    }
    if (req.method === 'GET') {
      const row = db.prepare('SELECT type FROM images WHERE id = ?').get(id);
      if (!row) return send(res, 404, { error: 'Bild nicht gefunden' });
      return fs.readFile(file, (err, buf) => err ? send(res, 404, { error: 'Bild nicht gefunden' }) : send(res, 200, buf, { 'content-type': row.type, 'cache-control': 'private, max-age=31536000, immutable' }));
    }
  }
  return send(res, 404, { error: 'Unbekannte Adresse' });
}

http.createServer((req, res) => {
  handle(req, res).catch(e => {
    if (!res.headersSent) send(res, e.code >= 400 && e.code < 600 ? e.code : 500, { error: e.code ? e.message : 'Serverfehler' });
    if (!e.code) console.error(e);
  });
}).listen(PORT, () => {
  const n = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  console.log(`Bastelwerkstatt läuft auf http://localhost:${PORT}  (${n} Benutzer)`);
  if (!n) console.log('Noch kein Benutzer. Anlegen mit:  node --no-warnings server/server.js add-user name@beispiel.dk "passwort"');
});
