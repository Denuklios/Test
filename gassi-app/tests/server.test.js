import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 18000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;
let proc; let dataDir;

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'gassi-'));
  // Beispiel-OSM-Daten: zwei Runden in einer Zelle bei Padborg
  const { mkdir, writeFile } = await import('node:fs/promises');
  const osmDir = path.join(dataDir, 'osm');
  await mkdir(osmDir, { recursive: true });
  const mk = (id, lat) => ({ id, name: id, source: 'osm', kind: 'hundeauslauf', points: [[lat, 9.33], [lat + 0.001, 9.33], [lat, 9.331], [lat, 9.33]], distanceKm: 0.3,
    attrs: { water: null, shade: null, surface: 'natur', crossings: 0, leash: 'frei', bins: null }, busyness: new Array(24).fill(10) });
  await writeFile(path.join(osmDir, '109_18.json'), JSON.stringify([mk('osm-w1', 54.845), mk('osm-w2', 54.99)]));
  await writeFile(path.join(osmDir, 'index.json'), JSON.stringify({ cells: ['109_18'] }));
  proc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, OSM_DIR: osmDir }, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch { /* startet noch */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Server startet nicht');
});
after(async () => { proc?.kill(); await rm(dataDir, { recursive: true, force: true }); });

/** Kleiner Client, der sich das Session-Cookie merkt – wie ein Browser. */
function client() {
  let cookie = '';
  const call = async (method, p, body) => {
    const res = await fetch(BASE + p, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body === undefined ? (method === 'GET' ? undefined : '{}') : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    const data = await res.json().catch(() => null);
    return { status: res.status, data, setCookie: set };
  };
  return {
    get: (p) => call('GET', p), post: (p, b) => call('POST', p, b), patch: (p, b) => call('PATCH', p, b), del: (p, b) => call('DELETE', p, b),
    get cookie() { return cookie; },
  };
}

const anna = client();
const ben = client();
let annaId; let benId; let routeId;

test('liefert App und Demo-Runden auch ohne Anmeldung aus', async () => {
  assert.match(await (await fetch(BASE + '/')).text(), /Gassirunde/);
  const { data } = await client().get('/api/routes');
  assert.ok(data.length >= 6);
  assert.equal((await client().get('/api/auth/me')).data.user, null);
});

test('OSM-Runden nur im gefragten Umkreis, Bewertung möglich', async () => {
  const near = (await client().get('/api/routes?lat=54.845&lng=9.33&r=5')).data;
  assert.ok(near.some((r) => r.id === 'osm-w1'));
  assert.ok(!near.some((r) => r.id === 'osm-w2')); // 16 km entfernt
  assert.ok(!(await client().get('/api/routes')).data.some((r) => r.id === 'osm-w1')); // ohne Ort keine OSM-Runden
  const c = client();
  await c.post('/api/auth/register', { email: 'osm@example.de', password: 'geheim123', name: 'Osmo' });
  const list = (await c.post('/api/routes/osm-w1/ratings', { stars: 4 })).data;
  assert.equal(list[0].name, 'Osmo');
  assert.equal((await c.post('/api/routes/osm-w999/ratings', { stars: 4 })).status, 404);
  await c.del('/api/me', { password: 'geheim123' });
});

test('verweigert Pfade außerhalb von public/', async () => {
  assert.notEqual((await fetch(BASE + '/..%2fserver.js')).status, 200);
});

test('Registrierung prüft Eingaben und setzt ein sicheres Cookie', async () => {
  assert.equal((await client().post('/api/auth/register', { email: 'kaputt', password: 'geheim123', name: 'X' })).status, 400);
  assert.equal((await client().post('/api/auth/register', { email: 'a@b.de', password: 'kurz', name: 'X' })).status, 400);
  assert.equal((await client().post('/api/auth/register', { email: 'a@b.de', password: 'geheim123' })).status, 400); // Name fehlt

  const r = await anna.post('/api/auth/register', { email: 'Anna@Example.de', password: 'geheim123', name: 'Anna', dog: 'Fips', dogAge: 'senior' });
  assert.equal(r.status, 201);
  assert.match(r.setCookie, /HttpOnly/);
  assert.match(r.setCookie, /SameSite=Lax/);
  assert.equal(r.data.user.email, 'anna@example.de');
  assert.equal(r.data.user.hash, undefined); // nie Passwort-Daten herausgeben
  annaId = r.data.user.id;

  assert.equal((await client().post('/api/auth/register', { email: 'anna@example.de', password: 'anderes123', name: 'Fake' })).status, 409);
  const b = await ben.post('/api/auth/register', { email: 'ben@example.de', password: 'passwort1', name: 'Ben', dog: 'Rex' });
  benId = b.data.user.id;
  assert.equal((await anna.get('/api/auth/me')).data.user.name, 'Anna');
});

test('Passwörter werden nur gehasht gespeichert', async () => {
  const raw = await readFile(path.join(dataDir, 'store.json'), 'utf8');
  assert.ok(!raw.includes('geheim123'));
  assert.ok(!raw.includes(anna.cookie.split('=')[1])); // Session-Token nur als Hash
});

test('Anmeldung: falsches Passwort scheitert, richtiges klappt', async () => {
  const c = client();
  assert.equal((await c.post('/api/auth/login', { email: 'anna@example.de', password: 'falsch' })).status, 401);
  const ok = await c.post('/api/auth/login', { email: 'ANNA@example.de', password: 'geheim123' });
  assert.equal(ok.status, 200);
  assert.equal((await c.get('/api/auth/me')).data.user.id, annaId);
  await c.post('/api/auth/logout');
  assert.equal((await c.get('/api/auth/me')).data.user, null);
});

test('Schreiben nur angemeldet und nur als JSON', async () => {
  const pts = [[52.5, 13.4], [52.501, 13.4], [52.501, 13.401]];
  assert.equal((await client().post('/api/routes', { name: 'X', points: pts })).status, 401);
  assert.equal((await client().post('/api/live', { lat: 52.5, lng: 13.4 })).status, 401);
  assert.equal((await client().get('/api/live/stream')).status, 401);
  const form = await fetch(BASE + '/api/routes', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: anna.cookie }, body: 'name=X' });
  assert.equal(form.status, 415);
});

test('Runde anlegen: Autor kommt aus dem Konto, nicht aus der Anfrage', async () => {
  const pts = [[52.5, 13.4], [52.501, 13.4], [52.501, 13.401]];
  const r = await anna.post('/api/routes', { name: 'Feldrunde', authorId: benId, author: 'Ben', points: pts, attrs: { water: true, leash: 'quatsch' } });
  assert.equal(r.status, 201);
  assert.equal(r.data.authorId, annaId);
  assert.equal(r.data.author, 'Anna');
  assert.equal(r.data.attrs.leash, 'teilweise');
  routeId = r.data.id;
});

test('Bewerten: eine pro Konto, Name aus dem Konto', async () => {
  assert.equal((await ben.post(`/api/routes/${routeId}/ratings`, { stars: 9 })).status, 400);
  await ben.post(`/api/routes/${routeId}/ratings`, { stars: 3, userId: annaId, name: 'Anna' });
  const list = (await ben.post(`/api/routes/${routeId}/ratings`, { stars: 5, text: 'Super' })).data;
  assert.equal(list.length, 1);
  assert.equal(list[0].userId, benId);
  assert.equal(list[0].name, 'Ben');
  assert.equal(list[0].dog, 'Rex');
});

test('Nur der Autor darf seine Runde löschen', async () => {
  assert.equal((await ben.del(`/api/routes/${routeId}`)).status, 403);
  assert.equal((await anna.del(`/api/routes/${routeId}`)).status, 200);
  assert.ok(!(await anna.get('/api/routes')).data.some((r) => r.id === routeId));
});

test('Profil ändern und Spaziergänge speichern', async () => {
  const r = await anna.patch('/api/me', { name: 'Anna B.', dogAge: 'unsinn' });
  assert.equal(r.data.user.name, 'Anna B.');
  assert.equal(r.data.user.dogAge, 'erwachsen');
  assert.equal((await anna.patch('/api/me', { name: '' })).status, 400);
  await anna.post('/api/me/walks', { date: new Date().toISOString(), meters: 3200, ms: 2_400_000, name: 'Morgenrunde' });
  const walks = (await anna.get('/api/me/walks')).data;
  assert.equal(walks.length, 1);
  assert.equal((await ben.get('/api/me/walks')).data.length, 0); // fremde Spaziergänge sind privat
});

async function openStream(c) {
  const ctrl = new AbortController();
  const res = await fetch(BASE + '/api/live/stream', { headers: { cookie: c.cookie }, signal: ctrl.signal });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const events = [];
  (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n'); buf = parts.pop();
        for (const ev of parts) {
          const type = ev.match(/^event: (\w+)/m)?.[1];
          const data = ev.match(/^data: (.*)$/m)?.[1];
          if (type && data) events.push({ type, data: JSON.parse(data) });
        }
      }
    } catch { /* abgebrochen */ }
  })();
  const waitFor = async (pred, ms = 5000) => {
    const t = Date.now();
    while (Date.now() - t < ms) {
      const hit = events.find(pred);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('Ereignis kam nicht');
  };
  return { waitFor, events, close: () => ctrl.abort() };
}

test('Live: Name aus dem Konto, Winken nur an die gemeinte Person', async () => {
  const sa = await openStream(anna);
  const sb = await openStream(ben);
  const third = client();
  await third.post('/api/auth/register', { email: 'carla@example.de', password: 'passwort3', name: 'Carla' });
  const sc = await openStream(third);

  await sa.waitFor((e) => e.type === 'live' && e.data.some((p) => p.demo));
  await ben.post('/api/live', { name: 'Gefälscht', status: 'offen', lat: 52.47, lng: 13.26 });
  const ev = await sa.waitFor((e) => e.type === 'live' && e.data.some((p) => p.id === benId));
  assert.equal(ev.data.find((p) => p.id === benId).name, 'Ben');

  assert.equal((await anna.post('/api/live/wave', { to: benId })).status, 200);
  const w = await sb.waitFor((e) => e.type === 'wave');
  assert.equal(w.data.from, annaId);
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(!sc.events.some((e) => e.type === 'wave')); // Carla bekommt nichts

  await ben.post('/api/live', { status: 'abstand', lat: 52.47, lng: 13.26 });
  assert.equal((await anna.post('/api/live/wave', { to: benId })).status, 403); // Abstand respektieren

  await ben.del('/api/live');
  await sa.waitFor((e) => e.type === 'live' && !e.data.some((p) => p.id === benId) && e.data.length > 0);
  sa.close(); sb.close(); sc.close();
});

test('Rasse und Alter: gespeichert, nur sichtbar wenn freigegeben', async () => {
  const c = client();
  const u = (await c.post('/api/auth/register', { email: 'rasse@example.de', password: 'geheim123', name: 'Rita', dog: 'Bello', dogBreed: 'Labrador Retriever', dogYears: 4, showDog: true })).data.user;
  assert.equal(u.dogBreed, 'Labrador Retriever');
  assert.equal(u.dogYears, 4);
  assert.equal((await c.patch('/api/me', { dogYears: 99 })).data.user.dogYears, null); // ungültig → keine Angabe
  await c.patch('/api/me', { dogYears: 4 });
  const s1 = await openStream(anna);
  await c.post('/api/live', { status: 'offen', lat: 54.8, lng: 9.3 });
  let ev = await s1.waitFor((e) => e.type === 'live' && e.data.some((p) => p.id === u.id));
  assert.equal(ev.data.find((p) => p.id === u.id).dogBreed, 'Labrador Retriever');
  await c.patch('/api/me', { showDog: false });
  await c.post('/api/live', { status: 'offen', lat: 54.8, lng: 9.3 });
  ev = await s1.waitFor((e) => e.type === 'live' && e.data.some((p) => p.id === u.id && p.dogBreed === ''));
  assert.equal(ev.data.find((p) => p.id === u.id).dogYears, null);
  s1.close();
  await c.del('/api/me', { password: 'geheim123' });
});

test('Treffen: vorschlagen, mitmachen, Chat nur für Teilnehmer, absagen', async () => {
  const org = client(); const gast = client(); const fremd = client();
  await org.post('/api/auth/register', { email: 'org@example.de', password: 'geheim123', name: 'Olga', dog: 'Fiete' });
  const g = (await gast.post('/api/auth/register', { email: 'gast@example.de', password: 'geheim123', name: 'Gerd' })).data.user;
  await fremd.post('/api/auth/register', { email: 'fremd@example.de', password: 'geheim123', name: 'Frida' });
  assert.equal((await client().get('/api/meetups')).status, 401);
  const when = new Date(Date.now() + 86400e3).toISOString();
  assert.equal((await org.post('/api/meetups', { routeId: 'lyreskoven', routeName: 'Lyreskoven', lat: 54.85, lng: 9.37, startsAt: '2000-01-01T10:00:00Z' })).status, 400);
  const m = (await org.post('/api/meetups', { routeId: 'lyreskoven', routeName: 'Lyreskoven', lat: 54.85, lng: 9.37, startsAt: when, note: 'Langsames Tempo' })).data;
  assert.equal(m.creatorName, 'Olga');
  assert.equal(m.members.length, 1);
  assert.ok((await gast.get('/api/meetups?lat=54.85&lng=9.37&r=10')).data.some((x) => x.id === m.id));
  assert.ok(!(await gast.get('/api/meetups?lat=52.5&lng=13.4&r=10')).data.some((x) => x.id === m.id)); // Berlin: zu weit
  assert.equal((await gast.get(`/api/meetups?route=lyreskoven`)).data[0].id, m.id);
  assert.equal((await gast.get(`/api/meetups/${m.id}/messages`)).status, 403);
  const joined = (await gast.post(`/api/meetups/${m.id}/join`)).data;
  assert.equal(joined.joined, true);
  assert.equal(joined.members.length, 2);
  assert.equal((await org.post(`/api/meetups/${m.id}/messages`, { text: 'Treffpunkt Parkplatz' })).status, 201);
  assert.equal((await gast.get(`/api/meetups/${m.id}`)).data.unread, 1);
  const msgs = (await gast.get(`/api/meetups/${m.id}/messages`)).data;
  assert.equal(msgs[0].text, 'Treffpunkt Parkplatz');
  assert.equal(msgs[0].name, 'Olga');
  assert.equal((await gast.get(`/api/meetups/${m.id}`)).data.unread, 0); // gelesen
  assert.equal((await gast.get(`/api/meetups/${m.id}/messages?after=${msgs[0].id}`)).data.length, 0);
  assert.equal((await fremd.post(`/api/meetups/${m.id}/messages`, { text: 'Hallo' })).status, 403);
  assert.equal((await gast.del(`/api/meetups/${m.id}`)).status, 403); // nur Organisatorin
  assert.equal((await gast.del(`/api/meetups/${m.id}/join`)).data.joined, false);
  assert.equal((await org.del(`/api/meetups/${m.id}/join`)).status, 400);
  assert.equal((await org.del(`/api/meetups/${m.id}`)).status, 200);
  assert.equal((await gast.get(`/api/meetups/${m.id}`)).status, 404);
  for (const c of [org, gast, fremd]) await c.del('/api/me', { password: 'geheim123' });
  assert.ok(g.id);
});

test('Passwort ändern meldet andere Geräte ab', async () => {
  const other = client();
  await other.post('/api/auth/login', { email: 'ben@example.de', password: 'passwort1' });
  assert.equal((await ben.post('/api/me/password', { current: 'falsch', next: 'neuespasswort' })).status, 403);
  assert.equal((await ben.post('/api/me/password', { current: 'passwort1', next: 'neuespasswort' })).status, 200);
  assert.equal((await other.get('/api/auth/me')).data.user, null);
  assert.equal((await ben.get('/api/auth/me')).data.user.id, benId); // dieses Gerät bleibt angemeldet
});

test('Konto löschen entfernt alle Daten', async () => {
  const pts = [[52.5, 13.4], [52.501, 13.4]];
  const r = (await ben.post('/api/routes', { name: 'Bens Runde', points: pts })).data;
  await ben.post('/api/routes/froeslev-hundeskov/ratings', { stars: 4 });
  assert.equal((await ben.del('/api/me', { password: 'falsch' })).status, 403);
  assert.equal((await ben.del('/api/me', { password: 'neuespasswort' })).status, 200);
  assert.equal((await ben.get('/api/auth/me')).data.user, null);
  const routes = (await client().get('/api/routes')).data;
  assert.ok(!routes.some((x) => x.id === r.id));
  assert.ok(!routes.find((x) => x.id === 'froeslev-hundeskov').ratings.some((x) => x.userId === benId));
  assert.equal((await client().post('/api/auth/login', { email: 'ben@example.de', password: 'neuespasswort' })).status, 401);
});

test('Bremse gegen Passwort-Raten', async () => {
  const c = client();
  let last;
  for (let i = 0; i < 11; i++) last = await c.post('/api/auth/login', { email: 'anna@example.de', password: 'falsch' + i });
  assert.equal(last.status, 429);
});
