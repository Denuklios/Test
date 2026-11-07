import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 18000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;
let proc; let dataDir;

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'gassi-'));
  proc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir }, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch { /* startet noch */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Server startet nicht');
});
after(async () => { proc?.kill(); await rm(dataDir, { recursive: true, force: true }); });

const post = (p, body) => fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('liefert App und Demo-Runden aus', async () => {
  assert.match(await (await fetch(BASE + '/')).text(), /Gassirunde/);
  const routes = await (await fetch(BASE + '/api/routes')).json();
  assert.ok(routes.length >= 6);
  assert.ok(routes.every((r) => r.points.length > 10 && Array.isArray(r.ratings)));
});

test('verweigert Pfade außerhalb von public/', async () => {
  const r = await fetch(BASE + '/..%2fserver.js');
  assert.notEqual(r.status, 200);
});

test('neue Runde speichern, Bewertung abgeben und ändern', async () => {
  const bad = await post('/api/routes', { name: 'x', points: [[52.5, 13.4]] });
  assert.equal(bad.status, 400);
  const res = await post('/api/routes', { name: 'Feldrunde', author: 'Robert', points: [[52.5, 13.4], [52.501, 13.4], [52.501, 13.401]], attrs: { water: true, surface: 'natur', leash: 'quatsch' } });
  assert.equal(res.status, 201);
  const route = await res.json();
  assert.equal(route.attrs.leash, 'teilweise'); // ungültiger Wert wird ersetzt
  assert.ok(route.distanceKm > 0.15);

  assert.equal((await post(`/api/routes/${route.id}/ratings`, { userId: 'u1', stars: 9 })).status, 400);
  await post(`/api/routes/${route.id}/ratings`, { userId: 'u1', name: 'A', stars: 4 });
  const list = await (await post(`/api/routes/${route.id}/ratings`, { userId: 'u1', name: 'A', stars: 5, text: 'Super' })).json();
  assert.equal(list.length, 1); // eine Bewertung pro Person
  assert.equal(list[0].stars, 5);
  const all = await (await fetch(BASE + '/api/routes')).json();
  assert.equal(all.find((r) => r.id === route.id).ratings[0].text, 'Super');
});

test('Live: Position erscheint im Stream, Abmelden entfernt sie', async () => {
  const ctrl = new AbortController();
  const stream = await fetch(BASE + '/api/live/stream', { signal: ctrl.signal });
  const reader = stream.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const waitFor = async (pred) => {
    for (;;) {
      const { value } = await reader.read();
      buf += dec.decode(value, { stream: true });
      const events = buf.split('\n\n'); buf = events.pop();
      for (const ev of events) {
        const data = ev.split('\n').find((l) => l.startsWith('data: '));
        if (ev.includes('event: live') && data && pred(JSON.parse(data.slice(6)))) return true;
      }
    }
  };
  await waitFor((people) => people.some((p) => p.demo)); // Demo-Spaziergänger sind da
  await post('/api/live', { id: 'u-test', name: 'Robert', dog: 'Bello', status: 'abstand', lat: 52.47, lng: 13.26 });
  await waitFor((people) => people.some((p) => p.id === 'u-test' && p.status === 'abstand'));
  await fetch(BASE + '/api/live/u-test', { method: 'DELETE' });
  await waitFor((people) => !people.some((p) => p.id === 'u-test'));
  ctrl.abort();
});
