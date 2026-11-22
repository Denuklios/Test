// Integrationstest der MCP-Schnittstelle (mcp.php): Schlüssel erzeugen, Protokoll, Werkzeuge, Sperren.
// Aufruf: node auftraege/tests/mcp.test.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = mkdtempSync(join(tmpdir(), 'wf-mcp-'));
const PORT = 8098, B = `http://127.0.0.1:${PORT}`;
const srv = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', root], { env: { ...process.env, WF_TEST_DATA_DIR: data }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));

let passed = 0;
const ok = (name, fn) => fn().then(() => { passed++; console.log('  ✓', name); }).catch((e) => { console.error('  ✗', name, '\n', e.stack); process.exitCode = 1; });
let url = '', rid = 0;
async function rpc(method, params, u = url) {
  const r = await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rid, method, params }) });
  return { status: r.status, j: await r.json().catch(() => null), r };
}
async function tool(name, args = {}) {
  const r = await rpc('tools/call', { name, arguments: args });
  assert.equal(r.status, 200);
  const t = r.j.result.content[0].text;
  let d; try { d = JSON.parse(t); } catch { d = t; }
  return { err: r.j.result.isError, d };
}

try {
  let cookie = '';
  await ok('Einrichtungsseite nur angemeldet, Schlüssel erzeugen', async () => {
    assert.equal((await fetch(`${B}/mcp.php`)).status, 401);
    const r0 = await fetch(`${B}/api.php?a=me&dev=7`); cookie = r0.headers.get('set-cookie').split(';')[0];
    const page = await (await fetch(`${B}/mcp.php`, { headers: { cookie } })).text();
    assert.match(page, /kein Schlüssel/);
    const csrf = page.match(/name="csrf" value="([^"]+)"/)[1];
    const p2 = await (await fetch(`${B}/mcp.php`, { method: 'POST', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: `csrf=${csrf}&do=create` })).text();
    url = p2.match(/value="(http[^"]+\?k=[0-9a-f]{64})"/)[1];
    assert.ok(url);
  });
  await ok('Falscher Schlüssel: 401', async () => {
    const r = await rpc('initialize', {}, `${B}/mcp.php?k=${'0'.repeat(64)}`); assert.equal(r.status, 401);
  });
  await ok('initialize + Benachrichtigung', async () => {
    const r = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
    assert.equal(r.j.result.protocolVersion, '2025-06-18'); assert.ok(r.j.result.capabilities.tools);
    assert.equal(r.r.headers.get('set-cookie'), null, 'kein Sitzungs-Cookie');
    const n = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) });
    assert.equal(n.status, 202);
  });
  await ok('Schlüssel auch als Bearer', async () => {
    const [base, k] = url.split('?k=');
    const r = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + k }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }) });
    assert.equal(r.status, 200);
  });
  await ok('tools/list', async () => {
    const r = await rpc('tools/list', {});
    const names = r.j.result.tools.map((t) => t.name);
    for (const n of ['info', 'auftraege_liste', 'auftrag_speichern', 'kunde_speichern', 'rechnung_festschreiben', 'api_aufruf']) assert.ok(names.includes(n), n);
  });
  let cid, oid;
  await ok('info, Kunde und Auftrag anlegen, lesen, Status', async () => {
    const i = await tool('info'); assert.equal(i.err, false); assert.equal(i.d.processes.length, 9); assert.equal(i.d.csrf, undefined);
    const c = await tool('kunde_speichern', { name: 'Testkunde MCP', email: 'mcp@example.com', currency: 'DKK' }); assert.equal(c.err, false); cid = c.d.id; assert.ok(cid);
    const s = await tool('kunden_suchen', { q: 'MCP' }); assert.equal(s.d.customers.length, 1);
    const o = await tool('auftrag_speichern', { customer_id: cid, title: '10 Caps besticken', currency: 'DKK', price: 1200, items: [{ name: 'Cap', qty: 10, price: 120, processes: [{ process_id: 1, per_piece: 6 }] }] });
    assert.equal(o.err, false, JSON.stringify(o.d)); oid = o.d.order.id; assert.equal(o.d.order.total_min, 60);
    const l = await tool('auftraege_liste', { q: 'Caps' }); assert.equal(l.d.orders.length, 1);
    const st = await tool('auftrag_status', { id: oid, status: 'production' }); assert.equal(st.d.order.status, 'production');
    const rd = await tool('auftrag_lesen', { id: oid }); assert.ok(JSON.stringify(rd.d.order).includes('Claude (MCP)'), 'Verlauf nennt Claude');
  });
  await ok('Fehler kommt als isError zurück', async () => {
    const r = await tool('auftrag_speichern', { customer_id: 999, title: 'x', currency: 'DKK' }); assert.equal(r.err, true); assert.equal(r.d.error, 'bad_customer');
  });
  await ok('api_aufruf: erlaubt und gesperrt', async () => {
    const r = await tool('api_aufruf', { action: 'version' }); assert.equal(r.err, false); assert.ok(r.d.version >= 1);
    const b = await tool('api_aufruf', { action: 'purge', method: 'POST', body: {} }); assert.equal(b.err, true);
  });
  await ok('Sperren beendet den Zugang', async () => {
    const page = await (await fetch(`${B}/mcp.php`, { headers: { cookie } })).text();
    assert.match(page, /aktiv/);
    const csrf = page.match(/name="csrf" value="([^"]+)"/)[1];
    await fetch(`${B}/mcp.php`, { method: 'POST', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: `csrf=${csrf}&do=revoke` });
    assert.equal((await rpc('ping', {})).status, 401);
  });
} finally {
  srv.kill();
  rmSync(data, { recursive: true, force: true });
  console.log(`\n${passed} Tests bestanden`);
}
