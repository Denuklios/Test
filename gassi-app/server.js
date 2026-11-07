// Gassirunde – kleiner Server ohne Abhängigkeiten.
// Liefert die App aus, speichert Runden und Bewertungen in data/store.json
// und verteilt Live-Positionen per Server-Sent Events an alle offenen Apps.
//
// Start: node server.js   (Port über PORT, Demo-Spaziergänger aus mit DEMO_WALKERS=0)

import http from 'node:http';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { DEMO_WALKERS, demoWalkerPosition, pathLength } from './public/js/core.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const STORE = path.join(DATA_DIR, 'store.json');
const PORT = Number(process.env.PORT || 8080);
const DEMO = process.env.DEMO_WALKERS !== '0';
const LIVE_TTL_MS = 2 * 60 * 1000; // ohne neues Signal verschwindet man nach 2 Minuten

const demoRoutes = JSON.parse(await readFile(path.join(PUBLIC, 'data', 'demo-routes.json'), 'utf8'));
let store = { routes: [], ratings: {} }; // ratings: { routeId: [{userId, name, stars, text, date}] }
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

function allRoutes() {
  return [...demoRoutes, ...store.routes].map((r) => ({ ...r, ratings: store.ratings[r.id] || [] }));
}

// ---------- Live ----------

const live = new Map(); // userId -> {id, name, dog, status, lat, lng, at}
const clients = new Set(); // SSE-Antworten

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
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
      people.push({ id: w.id, name: w.name, dog: w.dog, status: w.status, lat, lng, at: now, demo: true });
    }
  }
  return people;
}

setInterval(() => broadcast('live', liveSnapshot()), 3000);
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 25000);

// ---------- Helfer ----------

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v, min, max) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);
const ONE_OF = (v, list, dflt) => (list.includes(v) ? v : dflt);

function sendJson(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readBody(req, limit = 1_000_000) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw Object.assign(new Error('Anfrage zu groß'), { status: 413 });
    chunks.push(c);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw Object.assign(new Error('Ungültiges JSON'), { status: 400 }); }
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

// ---------- Routen der API ----------

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]

  if (req.method === 'GET' && parts[1] === 'health') return sendJson(res, 200, { ok: true });

  if (req.method === 'GET' && parts[1] === 'routes' && parts.length === 2) return sendJson(res, 200, allRoutes());

  if (req.method === 'POST' && parts[1] === 'routes' && parts.length === 2) {
    const b = await readBody(req);
    const points = Array.isArray(b.points) ? b.points.filter((p) => Array.isArray(p) && num(p[0], -90, 90) != null && num(p[1], -180, 180) != null).slice(0, 10000).map(([a, c]) => [+a.toFixed(6), +c.toFixed(6)]) : [];
    if (points.length < 2) return sendJson(res, 400, { error: 'Die Runde braucht mindestens zwei GPS-Punkte.' });
    const name = str(b.name, 60);
    if (!name) return sendJson(res, 400, { error: 'Bitte gib der Runde einen Namen.' });
    const a = b.attrs || {};
    const route = {
      id: 'r-' + crypto.randomUUID().slice(0, 8),
      name, area: str(b.area, 60), description: str(b.description, 400),
      source: 'nutzer', author: str(b.author, 40) || 'Anonym', authorId: str(b.authorId, 64),
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
    return sendJson(res, 201, { ...route, ratings: [] });
  }

  if (req.method === 'POST' && parts[1] === 'routes' && parts[3] === 'ratings') {
    const id = parts[2];
    if (!allRoutes().some((r) => r.id === id)) return sendJson(res, 404, { error: 'Runde nicht gefunden.' });
    const b = await readBody(req, 10_000);
    const stars = num(b.stars, 1, 5);
    const userId = str(b.userId, 64);
    if (!stars || !Number.isInteger(stars)) return sendJson(res, 400, { error: 'Bitte 1 bis 5 Sterne vergeben.' });
    if (!userId) return sendJson(res, 400, { error: 'Nutzer fehlt.' });
    const list = (store.ratings[id] ||= []).filter((r) => r.userId !== userId); // eine Bewertung pro Person
    list.push({ userId, name: str(b.name, 40) || 'Anonym', dog: str(b.dog, 40), stars, text: str(b.text, 500), date: new Date().toISOString() });
    store.ratings[id] = list;
    await save();
    return sendJson(res, 200, list);
  }

  if (req.method === 'GET' && parts[1] === 'live' && parts[2] === 'stream') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    res.write(`event: live\ndata: ${JSON.stringify(liveSnapshot())}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  if (req.method === 'POST' && parts[1] === 'live' && parts.length === 2) {
    const b = await readBody(req, 10_000);
    const id = str(b.id, 64);
    const lat = num(b.lat, -90, 90);
    const lng = num(b.lng, -180, 180);
    if (!id || lat == null || lng == null) return sendJson(res, 400, { error: 'Position unvollständig.' });
    live.set(id, { id, name: str(b.name, 40) || 'Jemand', dog: str(b.dog, 40), status: ONE_OF(b.status, ['offen', 'neutral', 'abstand'], 'neutral'), lat, lng, at: Date.now() });
    broadcast('live', liveSnapshot());
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'DELETE' && parts[1] === 'live' && parts[2]) {
    live.delete(parts[2]);
    broadcast('live', liveSnapshot());
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'POST' && parts[1] === 'live' && parts[2] === 'wave') {
    const b = await readBody(req, 10_000);
    const to = str(b.to, 64);
    const from = str(b.from, 64);
    if (!to || !from) return sendJson(res, 400, { error: 'Empfänger fehlt.' });
    broadcast('wave', { to, from, fromName: str(b.fromName, 40) || 'Jemand', fromDog: str(b.fromDog, 40), text: str(b.text, 140), at: Date.now() });
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 404, { error: 'Unbekannte Anfrage.' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Nicht erlaubt' });
    return await serveStatic(req, res, url.pathname);
  } catch (e) {
    if (!res.headersSent) sendJson(res, e.status || 500, { error: e.status ? e.message : 'Serverfehler' });
    if (!e.status) console.error(e);
  }
});

server.listen(PORT, () => console.log(`Gassirunde läuft auf http://localhost:${PORT}`));
