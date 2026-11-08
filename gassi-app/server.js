// Gassirunde – kleiner Server ohne Abhängigkeiten.
// Liefert die App aus, verwaltet Konten (E-Mail + Passwort, Session-Cookie),
// speichert Runden, Bewertungen und Spaziergänge in data/store.json und
// verteilt Live-Positionen per Server-Sent Events an angemeldete Nutzer.
//
// Start: node server.js
//   PORT=8080  DATA_DIR=./data  DEMO_WALKERS=0 (Demo-Spaziergänger aus)
//   COOKIE_SECURE=1 erzwingt das Secure-Flag (sonst automatisch hinter https-Proxy)

import http from 'node:http';
import { readFile, writeFile, mkdir, rename, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { DEMO_WALKERS, demoWalkerPosition, pathLength, distance } from './public/js/core.js';

const scrypt = promisify(crypto.scrypt);
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const STORE = path.join(DATA_DIR, 'store.json');
const PORT = Number(process.env.PORT || 8080);
const DEMO = process.env.DEMO_WALKERS !== '0';
const LIVE_TTL_MS = 2 * 60 * 1000; // ohne neues Signal verschwindet man nach 2 Minuten
const SESSION_DAYS = 60;
const COOKIE = 'gassi_session';

const demoRoutes = JSON.parse(await readFile(path.join(PUBLIC, 'data', 'demo-routes.json'), 'utf8'));

// users: [{id, email, name, dog, dogAge, salt, hash, createdAt}]
// sessions: { sha256(token): {userId, expires} }
// ratings: { routeId: [{userId, stars, text, date}] }
// walks: { userId: [{date, meters, ms, name}] }
let store = { users: [], sessions: {}, routes: [], ratings: {}, walks: {}, meetups: [], messages: [] };
if (existsSync(STORE)) store = { ...store, ...JSON.parse(await readFile(STORE, 'utf8')) };

let saving = Promise.resolve();
function save() {
  saving = saving.then(async () => {
    await mkdir(DATA_DIR, { recursive: true });
    const tmp = STORE + '.tmp';
    await writeFile(tmp, JSON.stringify(store));
    await rename(tmp, STORE);
  }).catch((e) => console.error('Speichern fehlgeschlagen:', e));
  return saving;
}

const userById = (id) => store.users.find((u) => u.id === id);
const publicUser = (u) => u && {
  id: u.id, email: u.email, name: u.name, dog: u.dog, dogAge: u.dogAge,
  dogBreed: u.dogBreed || '', dogYears: u.dogYears ?? null, showDog: u.showDog !== false, languages: u.languages || [], createdAt: u.createdAt,
};
/** Was andere über den Hund sehen: Rasse und Alter nur, wenn freigegeben. */
const dogPublic = (u) => ({ ...(u.showDog !== false ? { dogBreed: u.dogBreed || '', dogYears: u.dogYears ?? null } : { dogBreed: '', dogYears: null }), languages: u.languages || [] });

// Runden aus OpenStreetMap (tools/import-osm.py): in Zellen von 0,5° gespeichert, geladen nach Bedarf
const OSM_DIR = process.env.OSM_DIR || path.join(PUBLIC, 'data', 'osm');
const osmCells = new Map();
async function osmCell(key) {
  if (!osmCells.has(key)) {
    let list = [];
    try { list = JSON.parse(await readFile(path.join(OSM_DIR, key + '.json'), 'utf8')); } catch { /* keine Runden in dieser Zelle */ }
    osmCells.set(key, list);
  }
  return osmCells.get(key);
}

/** OSM-Runden im Umkreis von rKm um lat/lng, die nächsten zuerst (höchstens `limit`). */
async function osmNear(lat, lng, rKm, limit = 250) {
  const dLat = rKm / 111, dLng = rKm / (111 * Math.cos((lat * Math.PI) / 180));
  const found = [];
  for (let a = Math.floor((lat - dLat) * 2); a <= Math.floor((lat + dLat) * 2); a++) {
    for (let b = Math.floor((lng - dLng) * 2); b <= Math.floor((lng + dLng) * 2); b++) {
      for (const r of await osmCell(`${a}_${b}`)) {
        const d = distance([lat, lng], r.points[0]) / 1000;
        if (d <= rKm) found.push([d, r]);
      }
    }
  }
  return found.sort((x, y) => x[0] - y[0]).slice(0, limit).map(([, r]) => r);
}

/** Übersicht für die herausgezoomte Karte: je Zelle Anzahl der Runden und ihre Mitte. */
let osmOverviewCache = null;
async function osmOverview() {
  let st;
  try { st = await stat(path.join(OSM_DIR, 'index.json')); } catch { return []; }
  if (osmOverviewCache?.mtime === st.mtimeMs) return osmOverviewCache.list;
  const list = [];
  try {
    const idx = JSON.parse(await readFile(path.join(OSM_DIR, 'index.json'), 'utf8'));
    for (const key of idx.cells || []) {
      let rs;
      try { rs = JSON.parse(await readFile(path.join(OSM_DIR, key + '.json'), 'utf8')); } catch { continue; }
      if (!rs.length) continue;
      let la = 0, ln = 0;
      for (const r of rs) { la += r.points[0][0]; ln += r.points[0][1]; }
      list.push({ lat: +(la / rs.length).toFixed(4), lng: +(ln / rs.length).toFixed(4), n: rs.length });
    }
  } catch { /* Index kaputt: leere Übersicht */ }
  osmOverviewCache = { mtime: st.mtimeMs, list };
  return list;
}

async function findOsmRoute(id) {
  // ID allein verrät die Zelle nicht: in allen bereits geladenen und notfalls allen Zellen suchen
  for (const list of osmCells.values()) { const r = list.find((x) => x.id === id); if (r) return r; }
  try {
    const idx = JSON.parse(await readFile(path.join(OSM_DIR, 'index.json'), 'utf8'));
    for (const key of idx.cells) { const r = (await osmCell(key)).find((x) => x.id === id); if (r) return r; }
  } catch { /* kein Import vorhanden */ }
  return null;
}

function withRatings(r) {
  return {
    ...r,
    ratings: (store.ratings[r.id] || []).map((x) => {
      const u = userById(x.userId);
      return { ...x, name: u?.name || 'Anonym', dog: u?.dog || '' };
    }),
  };
}

function allRoutes() {
  return [...demoRoutes, ...store.routes].map((r) => {
    const author = r.authorId ? userById(r.authorId) : null;
    return {
      ...r,
      author: r.source === 'vorgefertigt' ? r.author : author?.name || 'Anonym',
      ratings: (store.ratings[r.id] || []).map((x) => {
        const u = userById(x.userId);
        return { ...x, name: u?.name || 'Anonym', dog: u?.dog || '' };
      }),
    };
  });
}

// ---------- Passwörter & Sessions ----------

async function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = (await scrypt(password, salt, 64)).toString('hex');
  return { salt, hash };
}

async function checkPassword(user, password) {
  const { hash } = await hashPassword(password, user.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.hash, 'hex'));
}

const tokenKey = (token) => crypto.createHash('sha256').update(token).digest('hex');

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function isSecure(req) {
  return process.env.COOKIE_SECURE === '1' || req.headers['x-forwarded-proto'] === 'https';
}

function setSessionCookie(req, res, token, maxAge) {
  const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (isSecure(req)) parts.push('Secure');
  res.setHeader('set-cookie', parts.join('; '));
}

async function createSession(req, res, user) {
  const token = crypto.randomBytes(32).toString('base64url');
  store.sessions[tokenKey(token)] = { userId: user.id, expires: Date.now() + SESSION_DAYS * 864e5 };
  await save();
  setSessionCookie(req, res, token, SESSION_DAYS * 86400);
}

function currentUser(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token) return null;
  const s = store.sessions[tokenKey(token)];
  if (!s || s.expires < Date.now()) return null;
  return userById(s.userId) || null;
}

function dropSessionsOf(userId) {
  for (const [k, s] of Object.entries(store.sessions)) if (s.userId === userId) delete store.sessions[k];
}

// Abgelaufene Sessions gelegentlich aufräumen
setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const [k, s] of Object.entries(store.sessions)) if (s.expires < now) { delete store.sessions[k]; changed = true; }
  if (changed) save();
}, 6 * 3600 * 1000).unref();

// Einfache Bremse gegen Passwort-Raten: max. 10 Fehlversuche pro 15 Minuten je IP
const failures = new Map();
function tooManyFailures(ip) {
  const f = failures.get(ip);
  return f && f.count >= 10 && Date.now() - f.since < 15 * 60 * 1000;
}
function noteFailure(ip) {
  const f = failures.get(ip);
  if (!f || Date.now() - f.since > 15 * 60 * 1000) failures.set(ip, { count: 1, since: Date.now() });
  else f.count++;
}

// ---------- Live ----------

const live = new Map(); // userId -> {id, name, dog, status, lat, lng, at}
const clients = new Map(); // SSE-Antwort -> userId

function send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function broadcastLive() {
  const people = liveSnapshot();
  for (const res of clients.keys()) send(res, 'live', people);
}

function liveSnapshot() {
  const now = Date.now();
  for (const [id, p] of live) if (now - p.at > LIVE_TTL_MS) live.delete(id);
  const people = [...live.values()];
  if (DEMO) {
    for (const w of DEMO_WALKERS) {
      const route = demoRoutes.find((r) => r.id === w.route);
      if (!route) continue;
      const [lat, lng] = demoWalkerPosition(w, route, now);
      people.push({ id: w.id, name: w.name, dog: w.dog, dogBreed: w.dogBreed, dogYears: w.dogYears, languages: w.languages, status: w.status, lat, lng, at: now, demo: true });
    }
  }
  return people;
}

setInterval(broadcastLive, 3000).unref();
setInterval(() => { for (const res of clients.keys()) res.write(': ping\n\n'); }, 25000).unref();

// ---------- Helfer ----------

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v, min, max) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);
const ONE_OF = (v, list, dflt) => (list.includes(v) ? v : dflt);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DOG_AGES = ['welpe', 'erwachsen', 'senior'];

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function sendJson(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readBody(req, limit = 1_000_000) {
  // Nur JSON annehmen: schützt zusammen mit SameSite-Cookies gegen Formular-Angriffe von fremden Seiten
  if (!(req.headers['content-type'] || '').startsWith('application/json')) throw new HttpError(415, 'Bitte JSON senden.');
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new HttpError(413, 'Anfrage zu groß.');
    chunks.push(c);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw new HttpError(400, 'Ungültiges JSON.'); }
}

function requireUser(req) {
  const u = currentUser(req);
  if (!u) throw new HttpError(401, 'Bitte melde dich an.');
  return u;
}

function requireJsonForDelete(req) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) throw new HttpError(415, 'Bitte JSON senden.');
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json',
};

async function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) return sendJson(res, 403, { error: 'Verboten' });
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(body);
  } catch {
    sendJson(res, 404, { error: 'Nicht gefunden' });
  }
}

function validateProfile(b, { partial = false } = {}) {
  const out = {};
  if (!partial || 'name' in b) {
    out.name = str(b.name, 40);
    if (!out.name) throw new HttpError(400, 'Bitte gib deinen Vornamen an.');
  }
  if (!partial || 'dog' in b) out.dog = str(b.dog, 40);
  if (!partial || 'dogAge' in b) out.dogAge = ONE_OF(b.dogAge, DOG_AGES, 'erwachsen');
  if (!partial || 'dogBreed' in b) out.dogBreed = str(b.dogBreed, 120);
  if (!partial || 'dogYears' in b) out.dogYears = Number.isInteger(b.dogYears) && b.dogYears >= 0 && b.dogYears <= 25 ? b.dogYears : null;
  if (!partial || 'showDog' in b) out.showDog = b.showDog !== false;
  if (!partial || 'languages' in b) out.languages = Array.isArray(b.languages) ? [...new Set(b.languages.filter((x) => ['de', 'da', 'en'].includes(x)))] : [];
  return out;
}

function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) throw new HttpError(400, 'Das Passwort braucht mindestens 8 Zeichen.');
  if (pw.length > 200) throw new HttpError(400, 'Das Passwort ist zu lang.');
}

// ---------- Konten ----------

async function handleAuth(req, res, parts, ip) {
  const action = parts[2];

  if (req.method === 'GET' && action === 'me') return sendJson(res, 200, { user: publicUser(currentUser(req)) });

  if (req.method === 'POST' && action === 'register') {
    const b = await readBody(req, 10_000);
    const email = str(b.email, 200).toLowerCase();
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Bitte gib eine gültige E-Mail-Adresse an.');
    validatePassword(b.password);
    const profile = validateProfile(b);
    if (store.users.some((u) => u.email === email)) throw new HttpError(409, 'Für diese E-Mail-Adresse gibt es schon ein Konto. Melde dich stattdessen an.');
    const { salt, hash } = await hashPassword(b.password);
    const user = { id: 'u-' + crypto.randomUUID(), email, ...profile, salt, hash, createdAt: new Date().toISOString() };
    store.users.push(user);
    await createSession(req, res, user);
    return sendJson(res, 201, { user: publicUser(user) });
  }

  if (req.method === 'POST' && action === 'login') {
    if (tooManyFailures(ip)) throw new HttpError(429, 'Zu viele Fehlversuche. Bitte warte 15 Minuten.');
    const b = await readBody(req, 10_000);
    const email = str(b.email, 200).toLowerCase();
    const user = store.users.find((u) => u.email === email);
    const ok = user && typeof b.password === 'string' && await checkPassword(user, b.password);
    if (!ok) { noteFailure(ip); throw new HttpError(401, 'E-Mail-Adresse oder Passwort stimmt nicht.'); }
    await createSession(req, res, user);
    return sendJson(res, 200, { user: publicUser(user) });
  }

  if (req.method === 'POST' && action === 'logout') {
    await readBody(req, 1000);
    const token = parseCookies(req)[COOKIE];
    if (token) { delete store.sessions[tokenKey(token)]; await save(); }
    setSessionCookie(req, res, '', 0);
    return sendJson(res, 200, { ok: true });
  }

  throw new HttpError(404, 'Unbekannte Anfrage.');
}

async function handleMe(req, res, parts) {
  const user = requireUser(req);
  const sub = parts[2];

  if (req.method === 'PATCH' && !sub) {
    Object.assign(user, validateProfile(await readBody(req, 10_000), { partial: true }));
    await save();
    const p = live.get(user.id);
    if (p) Object.assign(p, { name: user.name, dog: user.dog, ...dogPublic(user) });
    return sendJson(res, 200, { user: publicUser(user) });
  }

  if (req.method === 'POST' && sub === 'password') {
    const b = await readBody(req, 10_000);
    if (!(typeof b.current === 'string' && await checkPassword(user, b.current))) throw new HttpError(403, 'Das aktuelle Passwort stimmt nicht.');
    validatePassword(b.next);
    Object.assign(user, await hashPassword(b.next));
    dropSessionsOf(user.id); // überall abmelden …
    await createSession(req, res, user); // … außer hier
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'DELETE' && !sub) {
    const b = await readBody(req, 10_000);
    if (!(typeof b.password === 'string' && await checkPassword(user, b.password))) throw new HttpError(403, 'Das Passwort stimmt nicht.');
    // Konto und alle zugehörigen Daten löschen
    store.users = store.users.filter((u) => u.id !== user.id);
    const ownRoutes = new Set(store.routes.filter((r) => r.authorId === user.id).map((r) => r.id));
    store.routes = store.routes.filter((r) => !ownRoutes.has(r.id));
    for (const id of Object.keys(store.ratings)) {
      if (ownRoutes.has(id)) delete store.ratings[id];
      else store.ratings[id] = store.ratings[id].filter((x) => x.userId !== user.id);
    }
    delete store.walks[user.id];
    const ownMeetups = new Set(store.meetups.filter((m) => m.creatorId === user.id).map((m) => m.id));
    store.meetups = store.meetups.filter((m) => !ownMeetups.has(m.id));
    for (const m of store.meetups) m.members = m.members.filter((x) => x.userId !== user.id);
    store.messages = store.messages.filter((x) => x.userId !== user.id && !ownMeetups.has(x.meetupId));
    dropSessionsOf(user.id);
    live.delete(user.id);
    await save();
    setSessionCookie(req, res, '', 0);
    return sendJson(res, 200, { ok: true });
  }

  if (sub === 'walks' && req.method === 'GET') return sendJson(res, 200, store.walks[user.id] || []);

  if (sub === 'walks' && req.method === 'POST') {
    const b = await readBody(req, 10_000);
    const walk = {
      date: new Date(Date.parse(b.date) || Date.now()).toISOString(),
      meters: num(b.meters, 0, 200_000) ?? 0, ms: num(b.ms, 0, 86_400_000) ?? 0, name: str(b.name, 60) || 'Spaziergang',
    };
    const list = (store.walks[user.id] ||= []);
    list.unshift(walk);
    store.walks[user.id] = list.slice(0, 1000);
    await save();
    return sendJson(res, 201, walk);
  }

  throw new HttpError(404, 'Unbekannte Anfrage.');
}

// ---------- Treffen und Chat ----------

let msgSeq = Math.max(0, ...store.messages.map((x) => x.id));

function meetupJson(m, user) {
  const mine = m.members.find((x) => x.userId === user.id);
  const creator = userById(m.creatorId);
  return {
    id: m.id, routeId: m.routeId, routeName: m.routeName, lat: m.lat, lng: m.lng, startsAt: m.startsAt, note: m.note,
    creatorId: m.creatorId, creatorName: creator?.name || 'Anonym', creatorDog: creator?.dog || '',
    members: m.members.map((x) => { const u = userById(x.userId); return { id: x.userId, name: u?.name || 'Anonym', dog: u?.dog || '', languages: u?.languages || [] }; }),
    joined: !!mine,
    unread: mine ? store.messages.filter((x) => x.meetupId === m.id && x.id > mine.lastRead && x.userId !== user.id).length : 0,
  };
}

async function handleMeetups(req, res, parts, url) {
  const user = requireUser(req);
  const id = parts[2];
  const find = () => {
    const m = store.meetups.find((x) => x.id === id);
    if (!m) throw new HttpError(404, 'Dieses Treffen gibt es nicht mehr.');
    return m;
  };
  if (req.method === 'GET' && !id) {
    const since = Date.now() - 3 * 3600 * 1000;
    const route = url.searchParams.get('route');
    const lat = Number(url.searchParams.get('lat')), lng = Number(url.searchParams.get('lng'));
    const r = Math.min(200, Math.max(1, Number(url.searchParams.get('r')) || 50));
    const list = store.meetups
      .filter((m) => Date.parse(m.startsAt) > since)
      .filter((m) => (route ? m.routeId === route : true))
      .filter((m) => route || !url.searchParams.has('lat') || m.members.some((x) => x.userId === user.id) || distance([lat, lng], [m.lat, m.lng]) / 1000 <= r)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .slice(0, 100);
    return sendJson(res, 200, list.map((m) => meetupJson(m, user)));
  }
  if (req.method === 'POST' && !id) {
    const b = await readBody(req, 10_000);
    const lat = num(b.lat, -90, 90), lng = num(b.lng, -180, 180);
    const routeId = str(b.routeId, 64), routeName = str(b.routeName, 80);
    if (lat == null || lng == null || !routeId || !routeName) throw new HttpError(400, 'Runde für das Treffen fehlt.');
    const ts = Date.parse(b.startsAt);
    if (!ts || ts < Date.now() - 3600e3 || ts > Date.now() + 60 * 864e5) throw new HttpError(400, 'Bitte wähle einen Termin in den nächsten 60 Tagen.');
    if (store.meetups.filter((m) => m.creatorId === user.id && Date.parse(m.startsAt) > Date.now()).length >= 20) throw new HttpError(429, 'Du hast schon 20 offene Treffen.');
    const m = { id: 'm-' + crypto.randomUUID().slice(0, 12), routeId, routeName, lat, lng, creatorId: user.id, startsAt: new Date(ts).toISOString(), note: str(b.note, 300), createdAt: new Date().toISOString(), members: [{ userId: user.id, lastRead: 0 }] };
    store.meetups.push(m);
    await save();
    return sendJson(res, 201, meetupJson(m, user));
  }
  if (id && !parts[3] && req.method === 'GET') return sendJson(res, 200, meetupJson(find(), user));
  if (id && !parts[3] && req.method === 'DELETE') {
    requireJsonForDelete(req);
    const m = find();
    if (m.creatorId !== user.id) throw new HttpError(403, 'Nur wer das Treffen vorgeschlagen hat, kann es absagen.');
    store.meetups = store.meetups.filter((x) => x.id !== m.id);
    store.messages = store.messages.filter((x) => x.meetupId !== m.id);
    await save();
    return sendJson(res, 200, { ok: true });
  }
  if (id && parts[3] === 'join') {
    const m = find();
    if (req.method === 'POST') {
      await readBody(req, 1000);
      if (!m.members.some((x) => x.userId === user.id)) m.members.push({ userId: user.id, lastRead: 0 });
      await save();
      return sendJson(res, 200, meetupJson(m, user));
    }
    if (req.method === 'DELETE') {
      requireJsonForDelete(req);
      if (m.creatorId === user.id) throw new HttpError(400, 'Du hast das Treffen vorgeschlagen. Sag es ab, statt auszutreten.');
      m.members = m.members.filter((x) => x.userId !== user.id);
      await save();
      return sendJson(res, 200, meetupJson(m, user));
    }
  }
  if (id && parts[3] === 'messages') {
    const m = find();
    const mine = m.members.find((x) => x.userId === user.id);
    if (!mine) throw new HttpError(403, 'Den Chat sehen nur Teilnehmer. Mach mit, um mitzuschreiben.');
    if (req.method === 'GET') {
      const after = Number(url.searchParams.get('after')) || 0;
      const list = store.messages.filter((x) => x.meetupId === m.id && x.id > after).slice(0, 300);
      if (list.length) { mine.lastRead = Math.max(mine.lastRead, list.at(-1).id); await save(); }
      return sendJson(res, 200, list.map((x) => { const u = userById(x.userId); return { id: x.id, userId: x.userId, name: u?.name || 'Anonym', dog: u?.dog || '', text: x.text, at: x.at }; }));
    }
    if (req.method === 'POST') {
      const b = await readBody(req, 10_000);
      const text = str(b.text, 500);
      if (!text) throw new HttpError(400, 'Die Nachricht ist leer.');
      const msg = { id: ++msgSeq, meetupId: m.id, userId: user.id, text, at: new Date().toISOString() };
      store.messages.push(msg);
      await save();
      return sendJson(res, 201, { ok: true, id: msg.id });
    }
  }
  throw new HttpError(404, 'Unbekannte Anfrage.');
}

// ---------- Runden, Bewertungen, Live ----------

async function handleApi(req, res, url, ip) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]

  if (req.method === 'GET' && parts[1] === 'health') return sendJson(res, 200, { ok: true, accounts: true });
  if (parts[1] === 'auth') return handleAuth(req, res, parts, ip);
  if (parts[1] === 'me') return handleMe(req, res, parts);

  // Runden lesen darf jeder – so kann man sich die App vor der Anmeldung ansehen
  if (req.method === 'GET' && parts[1] === 'routes' && parts[2] === 'overview' && parts.length === 3) {
    return sendJson(res, 200, await osmOverview());
  }
  if (req.method === 'GET' && parts[1] === 'routes' && parts.length === 2) {
    const lat = Number(url.searchParams.get('lat')), lng = Number(url.searchParams.get('lng'));
    const r = Math.min(80, Math.max(1, Number(url.searchParams.get('r')) || 25));
    const near = Number.isFinite(lat) && Number.isFinite(lng) && url.searchParams.has('lat') ? (await osmNear(lat, lng, r)).map(withRatings) : [];
    return sendJson(res, 200, [...allRoutes(), ...near]);
  }

  if (req.method === 'POST' && parts[1] === 'routes' && parts.length === 2) {
    const user = requireUser(req);
    const b = await readBody(req);
    const points = Array.isArray(b.points) ? b.points.filter((p) => Array.isArray(p) && num(p[0], -90, 90) != null && num(p[1], -180, 180) != null).slice(0, 10000).map(([a, c]) => [+a.toFixed(6), +c.toFixed(6)]) : [];
    if (points.length < 2) throw new HttpError(400, 'Die Runde braucht mindestens zwei GPS-Punkte.');
    const name = str(b.name, 60);
    if (!name) throw new HttpError(400, 'Bitte gib der Runde einen Namen.');
    const a = b.attrs || {};
    const route = {
      id: 'r-' + crypto.randomUUID().slice(0, 8),
      name, area: str(b.area, 60), description: str(b.description, 400),
      source: 'nutzer', authorId: user.id,
      createdAt: new Date().toISOString(),
      points, distanceKm: +(pathLength(points) / 1000).toFixed(2),
      durationMin: num(b.durationMin, 0, 1440),
      attrs: {
        water: !!a.water, shade: num(a.shade, 0, 100) ?? 50,
        surface: ONE_OF(a.surface, ['natur', 'gemischt', 'asphalt'], 'gemischt'),
        crossings: num(a.crossings, 0, 20) ?? 0,
        leash: ONE_OF(a.leash, ['frei', 'teilweise', 'pflicht'], 'teilweise'),
        bins: !!a.bins,
      },
      busyness: new Array(24).fill(15),
    };
    store.routes.push(route);
    await save();
    return sendJson(res, 201, allRoutes().find((r) => r.id === route.id));
  }

  if (req.method === 'DELETE' && parts[1] === 'routes' && parts.length === 3) {
    const user = requireUser(req);
    requireJsonForDelete(req);
    const route = store.routes.find((r) => r.id === parts[2]);
    if (!route) throw new HttpError(404, 'Runde nicht gefunden.');
    if (route.authorId !== user.id) throw new HttpError(403, 'Nur wer die Runde angelegt hat, kann sie löschen.');
    store.routes = store.routes.filter((r) => r.id !== route.id);
    delete store.ratings[route.id];
    await save();
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'POST' && parts[1] === 'routes' && parts[3] === 'ratings') {
    const user = requireUser(req);
    const id = parts[2];
    const osm = id.startsWith('osm-') ? await findOsmRoute(id) : null;
    if (!osm && !allRoutes().some((r) => r.id === id)) throw new HttpError(404, 'Runde nicht gefunden.');
    const b = await readBody(req, 10_000);
    const stars = num(b.stars, 1, 5);
    if (!stars || !Number.isInteger(stars)) throw new HttpError(400, 'Bitte 1 bis 5 Sterne vergeben.');
    const list = (store.ratings[id] || []).filter((r) => r.userId !== user.id); // eine Bewertung pro Person
    list.push({ userId: user.id, stars, text: str(b.text, 500), date: new Date().toISOString() });
    store.ratings[id] = list;
    await save();
    return sendJson(res, 200, withRatings(osm || allRoutes().find((r) => r.id === id)).ratings);
  }

  // Treffen und Chat (nur angemeldet)
  if (parts[1] === 'meetups') return handleMeetups(req, res, parts, url);

  // Live-Positionen sehen nur angemeldete Nutzer
  if (req.method === 'GET' && parts[1] === 'live' && parts[2] === 'stream') {
    const user = requireUser(req);
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    send(res, 'live', liveSnapshot());
    clients.set(res, user.id);
    req.on('close', () => clients.delete(res));
    return;
  }

  if (req.method === 'POST' && parts[1] === 'live' && parts.length === 2) {
    const user = requireUser(req);
    const b = await readBody(req, 10_000);
    const lat = num(b.lat, -90, 90);
    const lng = num(b.lng, -180, 180);
    if (lat == null || lng == null) throw new HttpError(400, 'Position unvollständig.');
    live.set(user.id, { id: user.id, name: user.name, dog: user.dog, ...dogPublic(user), status: ONE_OF(b.status, ['offen', 'neutral', 'abstand'], 'neutral'), lat, lng, at: Date.now() });
    broadcastLive();
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'DELETE' && parts[1] === 'live' && parts.length === 2) {
    const user = requireUser(req);
    requireJsonForDelete(req);
    live.delete(user.id);
    broadcastLive();
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'POST' && parts[1] === 'live' && parts[2] === 'wave') {
    const user = requireUser(req);
    const b = await readBody(req, 10_000);
    const to = str(b.to, 64);
    const target = live.get(to);
    if (!target) throw new HttpError(404, 'Die Person ist gerade nicht mehr unterwegs.');
    if (target.status === 'abstand') throw new HttpError(403, 'Die Person bittet um Abstand.');
    const msg = { to, from: user.id, fromName: user.name, fromDog: user.dog, text: 'Lust auf eine gemeinsame Runde?', at: Date.now() };
    for (const [res2, uid] of clients) if (uid === to) send(res2, 'wave', msg); // nur an die gemeinte Person
    return sendJson(res, 200, { ok: true });
  }

  throw new HttpError(404, 'Unbekannte Anfrage.');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url, ip);
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Nicht erlaubt' });
    return await serveStatic(req, res, url.pathname);
  } catch (e) {
    if (!res.headersSent) sendJson(res, e.status || 500, { error: e.status ? e.message : 'Serverfehler' });
    if (!e.status) console.error(e);
  }
});

server.listen(PORT, () => console.log(`Gassirunde läuft auf http://localhost:${PORT}`));
