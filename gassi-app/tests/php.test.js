// Testet den PHP-Server (php/api.php) so, wie er auf dem Webspace liegt:
// Paket mit tools/build-php.sh bauen, mit `php -S` starten, API durchspielen.
// Wird übersprungen, wenn kein PHP installiert ist.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const hasPhp = spawnSync('php', ['-v']).status === 0;
const PORT = 19000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;
let proc; let dir;

before(async () => {
  if (!hasPhp) return;
  dir = await mkdtemp(path.join(tmpdir(), 'gassi-php-'));
  const out = path.join(dir, 'gassi');
  const b = spawnSync('bash', ['tools/build-php.sh', out], { cwd: ROOT });
  if (b.status !== 0) throw new Error(b.stderr.toString());
  proc = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', out], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${BASE}/api.php?p=health`)).ok) return; } catch { /* startet noch */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('PHP-Server startet nicht');
});
after(async () => { proc?.kill(); if (dir) await rm(dir, { recursive: true, force: true }); });

function client() {
  let cookie = '';
  const call = async (method, p, body) => {
    const res = await fetch(`${BASE}/api.php?p=${p}`, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body === undefined ? (method === 'GET' ? undefined : '{}') : JSON.stringify(body),
    });
    for (const c of res.headers.getSetCookie()) {
      const kv = c.split(';')[0];
      cookie = kv.endsWith('=') || /=deleted$/.test(kv) || /expires=Thu, 01 Jan 1970/i.test(c) ? '' : kv;
    }
    return { status: res.status, data: await res.json().catch(() => null), headers: res.headers };
  };
  return { get: (p) => call('GET', p), post: (p, b) => call('POST', p, b), patch: (p, b) => call('PATCH', p, b), del: (p, b) => call('DELETE', p, b), get cookie() { return cookie; } };
}

const opts = { skip: !hasPhp && 'PHP nicht installiert' };
const anna = client(); const ben = client();
let annaId; let benId; let routeId;

test('PHP: App, Demo-Runden und Health', opts, async () => {
  assert.match(await (await fetch(BASE + '/')).text(), /name="robots" content="noindex/);
  const h = await client().get('health');
  assert.equal(h.data.live, 'poll');
  assert.equal(h.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.ok((await client().get('routes')).data.length >= 6);
});

test('PHP: Registrieren, Anmelden, Cookie', opts, async () => {
  assert.equal((await client().post('auth/register', { email: 'x', password: 'geheim123', name: 'X' })).status, 400);
  assert.equal((await client().post('auth/register', { email: 'a@b.de', password: 'kurz', name: 'X' })).status, 400);
  const r = await anna.post('auth/register', { email: 'Anna@Example.de', password: 'geheim123', name: 'Anna', dog: 'Fips' });
  assert.equal(r.status, 201);
  assert.match(r.headers.get('set-cookie'), /HttpOnly/i);
  assert.match(r.headers.get('set-cookie'), /SameSite=Lax/i);
  annaId = r.data.user.id;
  assert.equal((await client().post('auth/register', { email: 'anna@example.de', password: 'anders123', name: 'F' })).status, 409);
  benId = (await ben.post('auth/register', { email: 'ben@example.de', password: 'passwort1', name: 'Ben', dog: 'Rex' })).data.user.id;
  const c = client();
  assert.equal((await c.post('auth/login', { email: 'anna@example.de', password: 'falsch' })).status, 401);
  assert.equal((await c.post('auth/login', { email: 'ANNA@example.de', password: 'geheim123' })).status, 200);
  assert.equal((await c.get('auth/me')).data.user.id, annaId);
  await c.post('auth/logout');
  assert.equal((await c.get('auth/me')).data.user, null);
});

test('PHP: Daten-Ordner ist nicht abrufbar und Schreiben braucht Anmeldung + JSON', opts, async () => {
  // php -S kennt kein .htaccess – wir prüfen, dass die Sperrdatei im Paket liegt (Apache wertet sie aus)
  const { readFile } = await import('node:fs/promises');
  assert.match(await readFile(path.join(dir, 'gassi/daten/.htaccess'), 'utf8'), /Require all denied/);
  assert.equal((await client().post('routes', { name: 'X', points: [[1, 1], [1, 2]] })).status, 401);
  assert.equal((await client().get('live/poll')).status, 401);
  const form = await fetch(`${BASE}/api.php?p=routes`, { method: 'POST', headers: { 'content-type': 'text/plain', cookie: anna.cookie }, body: '{}' });
  assert.equal(form.status, 415);
});

test('PHP: Runden, Bewertungen, Löschen nur durch Autor', opts, async () => {
  const pts = [[52.5, 13.4], [52.501, 13.4], [52.501, 13.401]];
  const r = await anna.post('routes', { name: 'Feldrunde', authorId: benId, points: pts, attrs: { water: true, leash: 'quatsch' } });
  assert.equal(r.status, 201);
  assert.equal(r.data.authorId, annaId);
  assert.equal(r.data.attrs.leash, 'teilweise');
  routeId = r.data.id;
  await ben.post(`routes/${routeId}/ratings`, { stars: 3 });
  const list = (await ben.post(`routes/${routeId}/ratings`, { stars: 5, text: 'Super' })).data;
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'Ben');
  assert.equal((await ben.post(`routes/${routeId}/ratings`, { stars: 6 })).status, 400);
  const all = (await client().get('routes')).data;
  assert.equal(all.find((x) => x.id === routeId).author, 'Anna');
  assert.equal((await ben.del(`routes/${routeId}`)).status, 403);
  assert.equal((await anna.del(`routes/${routeId}`)).status, 200);
});

test('PHP: Profil und Spaziergänge', opts, async () => {
  assert.equal((await anna.patch('me', { name: 'Anna B.' })).data.user.name, 'Anna B.');
  assert.equal((await anna.patch('me', { name: '' })).status, 400);
  await anna.post('me/walks', { date: new Date().toISOString(), meters: 3200, ms: 2400000, name: 'Morgenrunde' });
  assert.equal((await anna.get('me/walks')).data[0].meters, 3200);
  assert.equal((await ben.get('me/walks')).data.length, 0);
});

test('PHP: Live per Abfrage, Winken nur an die gemeinte Person', opts, async () => {
  const first = (await anna.get('live/poll')).data;
  assert.ok(first.people.some((p) => p.demo));
  await ben.post('live', { status: 'offen', lat: 52.47, lng: 13.26, name: 'Gefälscht' });
  const seen = (await anna.get('live/poll')).data.people.find((p) => p.id === benId);
  assert.equal(seen.name, 'Ben');
  assert.equal((await anna.post('live/wave', { to: benId })).status, 200);
  const w = (await ben.get('live/poll')).data.waves;
  assert.equal(w.length, 1);
  assert.equal(w[0].fromName, 'Anna B.');
  assert.equal((await ben.get('live/poll')).data.waves.length, 0); // nur einmal zugestellt
  assert.equal((await anna.get('live/poll')).data.waves.length, 0);
  await ben.post('live', { status: 'abstand', lat: 52.47, lng: 13.26 });
  assert.equal((await anna.post('live/wave', { to: benId })).status, 403);
  await ben.del('live');
  assert.ok(!(await anna.get('live/poll')).data.people.some((p) => p.id === benId));
});

test('PHP: Rasse und Alter nur sichtbar wenn freigegeben', opts, async () => {
  const c = client();
  const u = (await c.post('auth/register', { email: 'rasse@example.de', password: 'geheim123', name: 'Rita', dogBreed: 'Mops', dogYears: 3 })).data.user;
  assert.equal(u.dogBreed, 'Mops');
  assert.equal(u.showDog, true);
  await c.post('live', { status: 'offen', lat: 54.8, lng: 9.3 });
  assert.equal((await anna.get('live/poll')).data.people.find((p) => p.id === u.id).dogYears, 3);
  assert.equal((await c.patch('me', { showDog: false })).data.user.showDog, false);
  assert.equal((await anna.get('live/poll')).data.people.find((p) => p.id === u.id).dogBreed, '');
  await c.del('me', { password: 'geheim123' });
});

test('PHP: Treffen und Chat', opts, async () => {
  const org = client(); const gast = client(); const fremd = client();
  await org.post('auth/register', { email: 'org@example.de', password: 'geheim123', name: 'Olga' });
  await gast.post('auth/register', { email: 'gast@example.de', password: 'geheim123', name: 'Gerd' });
  await fremd.post('auth/register', { email: 'fremd@example.de', password: 'geheim123', name: 'Frida' });
  const when = new Date(Date.now() + 86400e3).toISOString();
  const m = (await org.post('meetups', { routeId: 'osm-w1', routeName: 'Hundeauslauf', lat: 54.85, lng: 9.37, startsAt: when })).data;
  assert.equal(m.joined, true);
  assert.ok((await gast.get('meetups&lat=54.85&lng=9.37&r=10')).data.some((x) => x.id === m.id));
  assert.equal((await gast.get(`meetups/${m.id}/messages`)).status, 403);
  await gast.post(`meetups/${m.id}/join`);
  await org.post(`meetups/${m.id}/messages`, { text: 'Bin am Parkplatz' });
  assert.equal((await gast.get(`meetups/${m.id}`)).data.unread, 1);
  assert.equal((await gast.get(`meetups/${m.id}/messages`)).data[0].text, 'Bin am Parkplatz');
  assert.equal((await gast.get(`meetups/${m.id}`)).data.unread, 0);
  assert.equal((await fremd.post(`meetups/${m.id}/messages`, { text: 'x' })).status, 403);
  assert.equal((await gast.del(`meetups/${m.id}`)).status, 403);
  assert.equal((await org.del(`meetups/${m.id}`)).status, 200);
  assert.equal((await gast.get(`meetups/${m.id}`)).status, 404);
  for (const c of [org, gast, fremd]) await c.del('me', { password: 'geheim123' });
});

test('PHP: Passwort ändern und Konto löschen', opts, async () => {
  assert.equal((await ben.post('me/password', { current: 'falsch', next: 'neuespasswort' })).status, 403);
  assert.equal((await ben.post('me/password', { current: 'passwort1', next: 'neuespasswort' })).status, 200);
  assert.equal((await ben.get('auth/me')).data.user.id, benId);
  await ben.post('routes/froeslev-hundeskov/ratings', { stars: 4 });
  assert.equal((await ben.del('me', { password: 'falsch' })).status, 403);
  assert.equal((await ben.del('me', { password: 'neuespasswort' })).status, 200);
  const g = (await client().get('routes')).data.find((x) => x.id === 'froeslev-hundeskov');
  assert.ok(!g.ratings.some((x) => x.userId === benId));
  assert.equal((await client().post('auth/login', { email: 'ben@example.de', password: 'neuespasswort' })).status, 401);
});
