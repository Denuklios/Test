// Integrationstest: startet php -S mit leerer Test-Datenbank und prueft API, Sicherheit und Werkstatt-Anzeige.
// Aufruf: node auftraege/tests/api.test.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = mkdtempSync(join(tmpdir(), 'wf-test-'));
const PORT = 8099, B = `http://127.0.0.1:${PORT}`;
const srv = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', root], { env: { ...process.env, WF_TEST_DATA_DIR: data }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));

let cookie = '', csrf = '';
async function call(a, { params = {}, body, form, headers = {}, auth = true } = {}) {
  const qs = new URLSearchParams({ a, ...params });
  const h = { ...headers };
  if (auth && cookie) h.cookie = cookie;
  let opt = { headers: h, redirect: 'manual' };
  if (body) { opt.method = 'POST'; h['content-type'] = 'application/json'; h['x-csrf-token'] = csrf; opt.body = JSON.stringify(body); }
  if (form) { opt.method = 'POST'; h['x-csrf-token'] = csrf; opt.body = form; }
  const r = await fetch(`${B}/api.php?${qs}`, opt);
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  const txt = await r.text();
  let j; try { j = JSON.parse(txt); } catch { j = { raw: txt }; }
  return { status: r.status, j, r };
}
let passed = 0;
const ok = (name, fn) => fn().then(() => { passed++; console.log('  ✓', name); }).catch((e) => { console.error('  ✗', name, '\n', e.message); process.exitCode = 1; });

try {
  await ok('ohne Login: 401', async () => { const r = await call('me', { auth: false }); assert.equal(r.status, 401); });
  await ok('Login-Shell ohne Admin zeigt Hinweis', async () => { const t = await (await fetch(`${B}/index.php`)).text(); assert.match(t, /Bitte anmelden/); });
  await ok('Dev-Login + me liefert 7 Verfahren, 5 Benutzer, CSRF', async () => {
    cookie = '';
    const r0 = await fetch(`${B}/api.php?a=me&dev=7`); cookie = r0.headers.get('set-cookie').split(';')[0];
    const r = await call('me'); assert.equal(r.status, 200);
    csrf = r.j.csrf; assert.equal(r.j.processes.length, 7); assert.equal(r.j.users.length, 5); assert.deepEqual(r.j.currencies, ['DKK', 'EUR']);
  });
  await ok('POST ohne CSRF: 403', async () => {
    const r = await fetch(`${B}/api.php?a=customer_save`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{"name":"x"}' }); assert.equal(r.status, 403);
  });
  let cid, oid;
  await ok('Kunde anlegen (Validierung E-Mail)', async () => {
    assert.equal((await call('customer_save', { body: { name: 'A', email: 'kaputt' } })).j.error, 'bad_email');
    const r = await call('customer_save', { body: { name: 'Sønderjysk Idrætsforening', company: 'SIF', email: 'a@b.dk', currency: 'DKK' } }); cid = r.j.id; assert.ok(cid);
  });
  await ok('Auftrag anlegen: Nummer, Verfahren, Zahlung', async () => {
    const r = await call('order_save', { body: { customer_id: cid, title: '40 Poloshirts', qty: 40, price: '1999,50', deposit: 500, currency: 'DKK', pay_status: 'deposit', due_date: new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10), processes: [{ process_id: 1, minutes: 240 }, { process_id: 3, minutes: 60 }] } });
    assert.equal(r.status, 200); oid = r.j.order.id; assert.match(r.j.order.nr, /^\d{4}-0001$/); assert.equal(r.j.order.price, 1999.5); assert.equal(r.j.order.processes.length, 2);
  });
  await ok('Validierung: Datum, Währung, Anzahlung, Kunde', async () => {
    const base = { customer_id: cid, title: 'x', qty: 1, price: 1, currency: 'DKK' };
    assert.equal((await call('order_save', { body: { ...base, due_date: '2026-13-45' } })).j.error, 'bad_due_date');
    assert.equal((await call('order_save', { body: { ...base, currency: 'USD' } })).j.error, 'bad_currency');
    assert.equal((await call('order_save', { body: { ...base, pay_status: 'deposit', deposit: 0 } })).j.error, 'deposit_required');
    assert.equal((await call('order_save', { body: { ...base, customer_id: 9999 } })).j.error, 'bad_customer');
    assert.equal((await call('order_save', { body: { ...base, price: -5 } })).j.error, 'bad_price');
  });
  await ok('Suche, Filter, SQL-Injection-Versuch', async () => {
    assert.equal((await call('orders', { params: { q: 'polo' } })).j.orders.length, 1);
    assert.equal((await call('orders', { params: { q: "' OR 1=1 --" } })).j.orders.length, 0);
    assert.equal((await call('orders', { params: { pay: 'paid' } })).j.orders.length, 0);
    assert.equal((await call('orders', { params: { process: 3 } })).j.orders.length, 1);
    assert.equal((await call('orders', { params: { q: '%' } })).j.orders.length, 0);
  });
  await ok('Status und Zahlung ändern, bezahlt setzt Anzahlung = Preis', async () => {
    let r = await call('order_status', { body: { id: oid, status: 'production' } }); assert.equal(r.j.order.status, 'production');
    r = await call('order_status', { body: { id: oid, pay_status: 'paid' } }); assert.equal(r.j.order.deposit, r.j.order.price);
    assert.equal((await call('order_status', { body: { id: oid, status: 'bogus' } })).j.error, 'bad_status');
  });
  await ok('Änderungsnummer steigt bei Änderung', async () => {
    const v1 = (await call('version')).j.version; await call('order_status', { body: { id: oid, status: 'done' } }); const v2 = (await call('version')).j.version; assert.ok(v2 > v1);
  });
  await ok('Upload: PNG ok, PHP-Datei und falscher MIME abgelehnt, Auslieferung geschützt', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    let fd = new FormData(); fd.append('order_id', oid); fd.append('file', new Blob([png], { type: 'image/png' }), 'vorlage.png');
    let r = await call('file_upload', { form: fd }); assert.equal(r.status, 200); const fid = r.j.order.files[0].id;
    fd = new FormData(); fd.append('order_id', oid); fd.append('file', new Blob(['<?php echo 1;'], { type: 'image/png' }), 'shell.php');
    assert.equal((await call('file_upload', { form: fd })).j.error, 'bad_type');
    fd = new FormData(); fd.append('order_id', oid); fd.append('file', new Blob(['<?php echo 1;'], { type: 'image/png' }), 'shell.png');
    assert.equal((await call('file_upload', { form: fd })).j.error, 'bad_type');
    assert.equal((await fetch(`${B}/file.php?id=${fid}`)).status, 401);
    const dl = await fetch(`${B}/file.php?id=${fid}`, { headers: { cookie } }); assert.equal(dl.status, 200); assert.equal(dl.headers.get('content-type'), 'image/png');
  });
  await ok('Kalender: Kapazität wird gebucht', async () => {
    await call('order_status', { body: { id: oid, status: 'production' } });
    const from = new Date().toISOString().slice(0, 10), to = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);
    const r = await call('calendar', { params: { from, to } });
    const booked = r.j.days.reduce((s, d) => s + d.p.stick.booked, 0); assert.equal(booked, 240);
    assert.equal(r.j.orders.length, 1);
  });
  await ok('Terminvorschlag: Wochenenden übersprungen, volle Tage ausgelassen, eigener Auftrag zählt nicht doppelt', async () => {
    const r = await call('suggest', { params: { p: '1:60' } });
    assert.ok(r.j.dates.length >= 3); assert.ok(r.j.dates.every((d) => ![0, 6].includes(new Date(d + 'T00:00:00').getDay())));
    // Sticken ist am Abgabetag mit 240 min belegt; 300 min passen dort nicht (480-240=240), also darf der Tag fehlen.
    const due = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
    const big = await call('suggest', { params: { p: '1:300' } }); assert.equal(big.j.dates.includes(due), false);
    const own = await call('suggest', { params: { p: '1:300', exclude: oid } });
    if (new Date(due + 'T00:00:00').getDay() % 6 !== 0) assert.equal(own.j.dates.includes(due), true);
    assert.equal((await call('suggest', { params: { p: '' } })).j.error, 'no_processes');
    const long = await call('suggest', { params: { p: '1:900' } }); assert.equal(long.j.split, true); assert.equal(long.j.dates.includes(due), false);
  });
  await ok('Kunde: Historie, Export, Anonymisierung', async () => {
    assert.equal((await call('customer', { params: { id: cid } })).j.customer.orders.length, 1);
    assert.equal((await call('customer_export', { params: { id: cid } })).j.customer.email, 'a@b.dk');
    await call('customer_anonymize', { body: { id: cid } });
    const c = (await call('customer', { params: { id: cid } })).j.customer; assert.equal(c.email, ''); assert.match(c.name, /^Gelöscht/); assert.equal(c.orders.length, 1);
    assert.equal((await call('customers', { params: { q: 'Gelöscht' } })).j.customers.length, 0);
  });
  let token;
  await ok('Werkstatt-Token: erzeugen, nutzen, ungültig/gesperrt', async () => {
    token = (await call('token_create', { body: { label: 'Test' } })).j.token; assert.match(token, /^[0-9a-f]{64}$/);
    const v = await (await fetch(`${B}/display_api.php?t=${token}`)).json(); assert.ok(v.version > 0);
    const full = await (await fetch(`${B}/display_api.php?t=${token}&full=1`)).json();
    assert.equal(full.orders.length, 1); assert.equal(full.capacity.length, 7);
    const o = full.orders[0]; assert.equal('price' in o, false); assert.equal('email' in o, false); assert.equal(o.unpaid, false);
    assert.equal((await fetch(`${B}/display_api.php?t=${'a'.repeat(64)}`)).status, 403);
    const list = (await call('me')).j.tokens; assert.equal(list.length, 1); assert.equal(JSON.stringify(list).includes(token), false);
    await call('token_revoke', { body: { id: list[0].id } });
    const rv = await fetch(`${B}/display_api.php?t=${token}`); assert.equal(rv.status, 403); assert.equal((await rv.json()).error, 'revoked');
  });
  await ok('Werkstatt-Token: Ratenbegrenzung nach 30 Fehlversuchen', async () => {
    let last = 0; for (let i = 0; i < 35; i++) last = (await fetch(`${B}/display_api.php?t=${'b'.repeat(64)}`)).status;
    assert.equal(last, 429);
  });
  await ok('Papierkorb: löschen, in Liste, wiederherstellen', async () => {
    await call('order_delete', { body: { id: oid } });
    assert.equal((await call('orders', { params: { show: 'all' } })).j.orders.length, 0);
    assert.equal((await call('orders', { params: { show: 'trash' } })).j.orders.length, 1);
    await call('order_restore', { body: { id: oid } });
    assert.equal((await call('orders', { params: { show: 'all' } })).j.orders.length, 1);
  });
  await ok('Benutzer: 5 Plätze speichern, doppelte Admin-ID abgelehnt', async () => {
    const me = (await call('me')).j;
    const mk = (ids) => ({ users: me.users.map((u, i) => ({ ...u, wf_admin_id: ids[i] || '' })) });
    assert.equal((await call('users_save', { body: mk(['1', '1']) })).j.error, 'duplicate_admin_id');
    assert.equal((await call('users_save', { body: mk(['7', '8']) })).status, 200);
    const u = (await call('me')).j.user; assert.equal(u.name, 'Benutzer 1');
  });
  await ok('Backup lädt gültige SQLite-Datei', async () => {
    const r = await fetch(`${B}/api.php?a=backup`, { headers: { cookie } }); const b = Buffer.from(await r.arrayBuffer());
    assert.equal(b.subarray(0, 15).toString(), 'SQLite format 3');
  });
} finally {
  srv.kill(); rmSync(data, { recursive: true, force: true });
  console.log(`${passed} Tests bestanden`);
}
