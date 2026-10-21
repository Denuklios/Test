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
  const iso = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  const dow = (d) => new Date(d + 'T00:00:00').getDay();
  await ok('Terminvorschlag: Wochenende zählt mit 5 h, volle Tage fehlen, eigener Auftrag zählt nicht doppelt', async () => {
    const r = await call('suggest', { params: { p: '1:60' } });
    assert.ok(r.j.dates.length >= 3);
    const due = iso(3);
    const big = await call('suggest', { params: { p: '1:300' } }); assert.equal(big.j.dates.includes(due), dow(due) % 6 === 0 && false);
    const own = await call('suggest', { params: { p: '1:300', exclude: oid } }); assert.equal(own.j.dates.includes(due), true);
    assert.equal((await call('suggest', { params: { p: '' } })).j.error, 'no_processes');
    // Wochenende: 300 min passen (5 h), 301 min nicht
    const all = (await call('available', { params: { p: '3:300' } })).j.dates;
    assert.ok(all.some((d) => dow(d) === 6) && all.some((d) => dow(d) === 0), 'Samstag und Sonntag sind buchbar');
    const over = (await call('available', { params: { p: '3:301' } })).j; assert.ok(over.dates.every((d) => ![0, 6].includes(dow(d))) && over.split === false);
    const multi = (await call('available', { params: { p: '3:900' } })).j; assert.equal(multi.split, true); assert.ok(multi.dates.some((d) => dow(d) === 6));
    // Kalender: Wochenende hat 300 min Kapazität
    const cal = (await call('calendar', { params: { from: iso(0), to: iso(10) } })).j.days;
    assert.ok(cal.filter((d) => d.weekend).every((d) => d.p.stick.cap === 300)); assert.ok(cal.filter((d) => !d.weekend).every((d) => d.p.stick.cap === 480));
  });
  await ok('Verfügbarkeit: keine vergangenen Tage, heute möglich', async () => {
    const r = (await call('available', { params: { p: '3:60', from: '2020-01-01' } })).j.dates;
    assert.ok(r.length > 0 && r.every((d) => d >= iso(0))); assert.equal(r[0], iso(0));
  });
  let blockId;
  await ok('Sperrtage: anlegen, fallen aus Verfügbarkeit/Vorschlag/Kalender, Auftrag darauf abgelehnt', async () => {
    const d1 = iso(5), d2 = iso(7);
    assert.equal((await call('blocked_save', { body: { date_from: iso(-3), date_to: iso(-2), reason: 'alt' } })).j.error, 'date_past');
    assert.equal((await call('blocked_save', { body: { date_from: d2, date_to: d1 } })).j.error, 'bad_date_to');
    assert.equal((await call('blocked_save', { body: { date_from: d1, date_to: d2, reason: 'Urlaub' } })).status, 200);
    const me = (await call('me')).j; assert.equal(me.blocked.length, 1); blockId = me.blocked[0].id;
    for (const a of ['available', 'suggest']) {
      const dates = (await call(a, { params: { p: '3:30' } })).j.dates; assert.ok(![iso(5), iso(6), iso(7)].some((d) => dates.includes(d)), a);
    }
    assert.equal((await call('available', { params: { mode: 'open' } })).j.dates.includes(iso(6)), false);
    const day = (await call('calendar', { params: { from: iso(5), to: iso(5) } })).j.days[0]; assert.equal(day.blocked, 'Urlaub'); assert.equal(day.p.stick.cap, 0);
    const base = { customer_id: cid, title: 'x', qty: 1, price: 1, currency: 'DKK' };
    assert.equal((await call('order_save', { body: { ...base, due_date: iso(6) } })).j.error, 'date_blocked');
    assert.equal((await call('order_save', { body: { ...base, due_date: iso(-1) } })).j.error, 'date_past');
    assert.equal((await call('order_save', { body: { ...base, plan_date: iso(9), due_date: iso(8) } })).j.error, 'due_before_plan');
  });
  await ok('Sperrtag löschen gibt die Tage wieder frei; Änderungsnummer steigt', async () => {
    const v1 = (await call('version')).j.version;
    await call('blocked_delete', { body: { id: blockId } });
    assert.ok((await call('version')).j.version > v1);
    assert.ok((await call('available', { params: { p: '3:30' } })).j.dates.includes(iso(6)));
  });
  await ok('Teilsperre mit Uhrzeit: kürzt Kapazität, überlappende Zeiten nicht doppelt, Tag bleibt buchbar', async () => {
    const d = iso(10);
    assert.equal((await call('blocked_save', { body: { date_from: d, time_from: '12:00' } })).j.error, 'bad_time');
    assert.equal((await call('blocked_save', { body: { date_from: d, time_from: '16:00', time_to: '12:00' } })).j.error, 'bad_time');
    assert.equal((await call('blocked_save', { body: { date_from: d, time_from: '25:00', time_to: '26:00' } })).j.error, 'bad_time');
    assert.equal((await call('blocked_save', { body: { date_from: d, time_from: '12:00', time_to: '16:00', reason: 'Arzt' } })).status, 200);
    const cap = async () => (await call('calendar', { params: { from: d, to: d } })).j.days[0];
    let day = await cap(); assert.equal(day.blocked, null); assert.deepEqual(day.partial.times, ['12:00-16:00']); assert.equal(day.partial.lost, 240);
    const full = dow(d) % 6 === 0 ? 300 : 480; assert.equal(day.p.stick.cap, full - 240);
    // überlappend 14-18: zusammen 12-18 = 360 min
    await call('blocked_save', { body: { date_from: d, time_from: '14:00', time_to: '18:00' } });
    day = await cap(); assert.equal(day.partial.lost, 360); assert.equal(day.p.stick.cap, Math.max(0, full - 360));
    // Tag bleibt im Datumsangebot, wenn die Arbeit in die Restkapazität passt, sonst nicht
    const fitMin = Math.max(0, full - 360);
    if (fitMin >= 30) assert.ok((await call('available', { params: { p: `1:${fitMin}` } })).j.dates.includes(d));
    assert.equal((await call('available', { params: { p: `1:${fitMin + 1}` } })).j.dates.includes(d), false);
    // Auftrag auf Teilsperr-Tag darf gespeichert werden
    const o = (await call('order', { params: { id: oid } })).j.order;
    const moved = await call('order_save', { body: { ...o, processes: o.processes, due_date: d, plan_date: '' } });
    assert.equal(moved.status, 200); assert.equal(moved.j.order.due_date, d);
    for (const b of (await call('me')).j.blocked) await call('blocked_delete', { body: { id: b.id } });
  });
  await ok('Wochenend-Stunden einstellbar (0 = Wochenende zu)', async () => {
    assert.equal((await call('settings_save', { body: { weekend_min: 5000 } })).j.error, 'bad_weekend_min');
    await call('settings_save', { body: { weekend_min: 0 } });
    assert.ok((await call('available', { params: { p: '3:30' } })).j.dates.every((d) => ![0, 6].includes(dow(d))));
    await call('settings_save', { body: { weekend_min: 300 } });
    assert.equal((await call('me')).j.settings.weekend_min, 300);
  });
  await ok('Bestehender Auftrag mit altem Datum bleibt bearbeitbar (Datum unverändert)', async () => {
    const o = (await call('order', { params: { id: oid } })).j.order;
    const r = await call('order_save', { body: { ...o, processes: o.processes, notes: 'geändert' } }); assert.equal(r.status, 200);
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
  await ok('Datenbank-Update v1 → v3 behält Daten, ergänzt Sperrtage, Uhrzeiten und Wochenende', async () => {
    const { execFileSync } = await import('node:child_process');
    const code = `<?php require '${root}/inc/schema.php';
      $db = new PDO('sqlite::memory:'); $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
      $db->exec('CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)'); wf_migrate_v1($db);
      $db->exec("INSERT INTO customers (name) VALUES ('Alt')");
      echo $db->query("SELECT value FROM meta WHERE key='schema_version'")->fetchColumn(), ',';
      wf_migrate($db); wf_migrate($db);
      echo $db->query("SELECT value FROM meta WHERE key='schema_version'")->fetchColumn(), ',', $db->query("SELECT value FROM meta WHERE key='weekend_min'")->fetchColumn(), ',', $db->query('SELECT COUNT(*) FROM customers')->fetchColumn(), ',', $db->query('SELECT COUNT(*) FROM blocked_days')->fetchColumn();`;
    assert.equal(execFileSync('php', ['-r', code.replace('<?php', '')]).toString(), '1,3,300,1,0');
  });
} finally {
  srv.kill(); rmSync(data, { recursive: true, force: true });
  console.log(`${passed} Tests bestanden`);
}
