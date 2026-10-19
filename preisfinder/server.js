'use strict';
// Preisfinder – sucht in den aktuellen und kommenden Prospekten nach günstigen Preisen.
// Start:  PASSWORD='geheim' node preisfinder/server.js   →  http://localhost:8090
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { open } = require('./lib/store');
const { createCore } = require('./lib/core');

const PORT = +process.env.PORT || 8090;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PASSWORD = process.env.PASSWORD || '';
const PUBLIC = path.join(__dirname, 'public');
const VERSION = '1.0';

function createServer({ store, core, password = PASSWORD, secret } = {}) {
  secret ||= loadSecret();
  const attempts = new Map();

  function sign(exp) { return crypto.createHmac('sha256', secret).update(String(exp)).digest('hex'); }
  function authed(req) {
    if (!password) return true;
    const m = /(?:^|;\s*)pf=(\d+)\.([a-f0-9]{64})/.exec(req.headers.cookie || '');
    if (!m || +m[1] < Date.now()) return false;
    return crypto.timingSafeEqual(Buffer.from(m[2]), Buffer.from(sign(m[1])));
  }

  const D = store.data;
  const uid = () => crypto.randomBytes(6).toString('hex');
  const num = (v) => (v === '' || v == null || isNaN(+v) ? null : +v);
  const str = (v, n = 120) => String(v ?? '').trim().slice(0, n);

  const routes = {
    'GET /api/state': () => ({ version: VERSION, settings: D.settings, watch: D.watch, shopping: D.shopping, news: D.news.slice(0, 60) }),
    'GET /api/search': async (req, url) => core.search(url.searchParams.get('q'), {
      stores: (url.searchParams.get('stores') || '').split(',').map((s) => s.trim()).filter(Boolean),
      includeOld: url.searchParams.get('old') === '1',
    }),
    'PUT /api/settings': (req, url, b) => {
      const s = D.settings;
      if (b.country === 'de' || b.country === 'dk') s.country = b.country;
      if (b.zip != null) s.zip = str(b.zip, 10).replace(/[^0-9A-Za-z]/g, '');
      if (b.radius != null) s.radius = Math.min(50, Math.max(1, +b.radius || 15));
      if (Array.isArray(b.stores)) s.stores = b.stores.map((x) => str(x, 40)).filter(Boolean).slice(0, 30);
      if (b.ntfyTopic != null) s.ntfyTopic = str(b.ntfyTopic, 64).replace(/[^A-Za-z0-9_-]/g, '');
      if (b.watchHours != null) s.watchHours = Math.min(48, Math.max(1, +b.watchHours || 6));
      if (b.hideLoyalty != null) s.hideLoyalty = !!b.hideLoyalty;
      core.clearCache();
      store.save();
      return s;
    },
    'POST /api/watch': (req, url, b) => {
      const q = str(b.q, 80);
      if (!q) throw Object.assign(new Error('Bitte einen Suchbegriff eingeben.'), { status: 400 });
      const w = { id: uid(), q, maxPrice: num(b.maxPrice), maxUnitPrice: num(b.maxUnitPrice), stores: Array.isArray(b.stores) ? b.stores.map((x) => str(x, 40)).filter(Boolean) : [], notified: [], hits: [], lastCheck: null };
      D.watch.push(w);
      store.save();
      return w;
    },
    'POST /api/watch/check': async () => core.checkAll(),
    'POST /api/test-push': async () => {
      if (!D.settings.ntfyTopic) throw Object.assign(new Error('Erst ein ntfy-Thema eintragen und speichern.'), { status: 400 });
      await core.notify([{ w: { q: 'Test' }, o: { title: 'Testnachricht vom Preisfinder', price: 0.99, currency: 'EUR', store: 'deinem Markt', status: 'läuft', to: new Date().toISOString() } }]);
      return { ok: true };
    },
    'POST /api/shopping': (req, url, b) => {
      const text = str(b.text, 160);
      if (!text) throw Object.assign(new Error('Leerer Eintrag.'), { status: 400 });
      const dup = D.shopping.find((x) => !x.done && x.text.toLowerCase() === text.toLowerCase() && x.store === str(b.store, 40));
      if (dup) return { ...dup, duplicate: true };
      const it = { id: uid(), text, store: str(b.store, 40), price: num(b.price), currency: str(b.currency, 3) || 'EUR', until: str(b.until, 30) || null, done: false };
      D.shopping.push(it);
      store.save();
      return it;
    },
    'DELETE /api/shopping': () => { D.shopping = D.shopping.filter((x) => !x.done); store.save(); return { ok: true }; },
    'DELETE /api/news': () => { D.news = []; store.save(); return { ok: true }; },
  };

  // Routen mit ID
  const idRoutes = [
    [/^PATCH \/api\/watch\/(\w+)$/, (id, b) => {
      const w = D.watch.find((x) => x.id === id); if (!w) return null;
      if (b.maxPrice !== undefined) w.maxPrice = num(b.maxPrice);
      if (b.maxUnitPrice !== undefined) w.maxUnitPrice = num(b.maxUnitPrice);
      if (Array.isArray(b.stores)) w.stores = b.stores.map((x) => str(x, 40)).filter(Boolean);
      w.notified = []; store.save(); return w;
    }],
    [/^DELETE \/api\/watch\/(\w+)$/, (id) => { const n = D.watch.length; D.watch = D.watch.filter((x) => x.id !== id); store.save(); return n !== D.watch.length ? { ok: true } : null; }],
    [/^POST \/api\/watch\/(\w+)\/check$/, async (id) => { const w = D.watch.find((x) => x.id === id); if (!w) return null; const fresh = await core.checkWatch(w); if (fresh.length) await core.notify(fresh.map((o) => ({ w, o }))); return w; }],
    [/^PATCH \/api\/shopping\/(\w+)$/, (id, b) => {
      const it = D.shopping.find((x) => x.id === id); if (!it) return null;
      if (b.done !== undefined) it.done = !!b.done;
      if (b.text !== undefined) it.text = str(b.text, 160) || it.text;
      store.save(); return it;
    }],
    [/^DELETE \/api\/shopping\/(\w+)$/, (id) => { const n = D.shopping.length; D.shopping = D.shopping.filter((x) => x.id !== id); store.save(); return n !== D.shopping.length ? { ok: true } : null; }],
  ];

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');

    if (p === '/login' && req.method === 'POST') {
      const ip = req.socket.remoteAddress;
      const a = attempts.get(ip) || { n: 0, t: Date.now() };
      if (Date.now() - a.t > 15 * 60e3) { a.n = 0; a.t = Date.now(); }
      if (a.n >= 10) return send(res, 429, page('Zu viele Versuche – bitte 15 Minuten warten.'));
      const body = new URLSearchParams(await readBody(req));
      const given = Buffer.from(String(body.get('password') || ''));
      const want = Buffer.from(password);
      if (password && given.length === want.length && crypto.timingSafeEqual(given, want)) {
        const exp = Date.now() + 90 * 86400e3;
        res.setHeader('Set-Cookie', `pf=${exp}.${sign(exp)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${90 * 86400}${req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`);
        attempts.delete(ip);
        res.writeHead(303, { Location: '/' }); return res.end();
      }
      a.n++; attempts.set(ip, a);
      return send(res, 401, page('Falsches Passwort.'));
    }
    if (p === '/logout') {
      res.writeHead(303, { Location: '/', 'Set-Cookie': 'pf=; Path=/; Max-Age=0' }); return res.end();
    }
    if (p === '/manifest.webmanifest' || p === '/icon.svg') return serveStatic(res, p);

    if (!authed(req)) {
      if (p.startsWith('/api/')) return json(res, 401, { error: 'Bitte anmelden.' });
      return send(res, 200, page());
    }

    if (p.startsWith('/api/')) {
      try {
        const key = `${req.method} ${p}`;
        const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? parseJson(await readBody(req)) : {};
        if (routes[key]) return json(res, 200, await routes[key](req, url, body));
        for (const [re, fn] of idRoutes) {
          const m = re.exec(key);
          if (m) { const r = await fn(m[1], body); return r ? json(res, 200, r) : json(res, 404, { error: 'Nicht gefunden.' }); }
        }
        return json(res, 404, { error: 'Unbekannt.' });
      } catch (e) {
        return json(res, e.status || 502, { error: e.message || 'Fehler' });
      }
    }
    return serveStatic(res, p === '/' ? '/index.html' : p);
  }

  return http.createServer((req, res) => handle(req, res).catch((e) => { try { json(res, 500, { error: e.message }); } catch { /* schon gesendet */ } }));
}

function serveStatic(res, p) {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
  const f = path.normalize(path.join(PUBLIC, p));
  if (!f.startsWith(PUBLIC) || !fs.existsSync(f) || !fs.statSync(f).isFile()) return send(res, 404, 'Nicht gefunden');
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(f).pipe(res);
}

function page(msg = '') {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Preisfinder – Anmelden</title><link rel="manifest" href="/manifest.webmanifest"><link rel="icon" href="/icon.svg">
<style>body{font-family:system-ui,sans-serif;background:#f6f4ef;display:grid;place-items:center;min-height:100vh;margin:0;color:#23302a}
form{background:#fff;padding:28px;border-radius:14px;box-shadow:0 4px 20px #0001;width:min(320px,90vw)}h1{margin:0 0 16px;font-size:22px}
input,button{width:100%;box-sizing:border-box;padding:12px;font-size:16px;border-radius:8px;border:1px solid #ccc;margin-top:8px}
button{background:#2f7a55;color:#fff;border:0;font-weight:600;cursor:pointer}.e{color:#b3261e;margin:8px 0 0}</style></head>
<body><form method="post" action="/login"><h1>🛒 Preisfinder</h1><input type="password" name="password" placeholder="Passwort" autofocus autocomplete="current-password">
<button>Anmelden</button>${msg ? `<p class="e">${msg}</p>` : ''}</form></body></html>`;
}

function send(res, code, body) { res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(body); }
function json(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); }
function parseJson(s) { try { return s ? JSON.parse(s) : {}; } catch { return {}; } }
function readBody(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', (c) => { s += c; if (s.length > 1e6) { reject(new Error('Zu groß')); req.destroy(); } });
    req.on('end', () => resolve(s));
    req.on('error', reject);
  });
}
function loadSecret() {
  if (process.env.SECRET) return process.env.SECRET;
  const f = path.join(DATA_DIR, '.secret');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  return fs.readFileSync(f, 'utf8').trim();
}

// Merkliste regelmäßig im Hintergrund prüfen
function startScheduler(store, core) {
  let last = 0;
  const tick = async () => {
    const hours = store.data.settings.watchHours || 6;
    if (!store.data.watch.length || Date.now() - last < hours * 3600e3) return;
    last = Date.now();
    const r = await core.checkAll().catch((e) => ({ errors: [e.message] }));
    if (r.errors && r.errors.length) console.error('Preisalarm:', r.errors.join('; '));
  };
  setTimeout(tick, 60e3);
  return setInterval(tick, 10 * 60e3);
}

if (require.main === module) {
  const store = open(DATA_DIR);
  const core = createCore(store);
  createServer({ store, core }).listen(PORT, () => {
    console.log(`Preisfinder ${VERSION} läuft: http://localhost:${PORT}${PASSWORD ? '' : '   (ACHTUNG: kein PASSWORD gesetzt – jeder kann zugreifen)'}`);
  });
  startScheduler(store, core);
  const bye = () => { store.flush(); process.exit(0); };
  process.on('SIGTERM', bye);
  process.on('SIGINT', bye);
}

module.exports = { createServer, startScheduler };
