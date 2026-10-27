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
  await ok('Dev-Login + me liefert 9 Verfahren, 5 Benutzer, CSRF', async () => {
    cookie = '';
    const r0 = await fetch(`${B}/api.php?a=me&dev=7`); cookie = r0.headers.get('set-cookie').split(';')[0];
    const r = await call('me'); assert.equal(r.status, 200);
    csrf = r.j.csrf; assert.equal(r.j.processes.length, 9); assert.equal(r.j.users.length, 5); assert.deepEqual(r.j.currencies, ['DKK', 'EUR']);
  });
  await ok('POST ohne CSRF: 403', async () => {
    const r = await fetch(`${B}/api.php?a=customer_save`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{"name":"x"}' }); assert.equal(r.status, 403);
  });
  let cid, oid;
  await ok('Kunde anlegen (Validierung E-Mail)', async () => {
    assert.equal((await call('customer_save', { body: { name: 'A', email: 'kaputt' } })).j.error, 'bad_email');
    const r = await call('customer_save', { body: { name: 'Sønderjysk Idrætsforening', company: 'SIF', email: 'a@b.dk', currency: 'DKK' } }); cid = r.j.id; assert.ok(cid);
  });
  const iso = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  const dow = (d) => new Date(d + 'T00:00:00').getDay();
  // erster Tag ab Offset n, dessen Wochentag in `days` liegt (0=So … 6=Sa)
  const pick = (n, days) => { let d = iso(n); while (!days.includes(dow(d))) d = new Date(new Date(d + 'T00:00:00').getTime() + 864e5).toISOString().slice(0, 10); return d; };
  const WEEKDAY = [1, 2, 3, 4, 5];
  await ok('Auftrag anlegen: Nummer, Verfahren, Gesamtdauer, automatische Planung ohne Produktionstag', async () => {
    const r = await call('order_save', { body: { customer_id: cid, title: '40 Poloshirts', qty: 40, price: '1999,50', deposit: 500, currency: 'DKK', pay_status: 'deposit', due_date: iso(3), processes: [{ process_id: 1, minutes: 240 }, { process_id: 3, minutes: 60 }] } });
    assert.equal(r.status, 200); oid = r.j.order.id; assert.match(r.j.order.nr, /^\d{4}-0001$/); assert.equal(r.j.order.price, 1999.5); assert.equal(r.j.order.processes.length, 2);
    assert.equal(r.j.order.total_min, 300, 'Gesamtdauer = Summe der Verfahren'); assert.equal(r.j.order.worker_id, 1);
    assert.equal(r.j.order.plan_date, iso(0), 'frühestmöglicher Tag'); assert.equal(r.j.order.finish_date, iso(0));
    const work = r.j.order.days.filter((d) => d.kind === 'work'), ho = r.j.order.days.filter((d) => d.kind === 'handover');
    assert.equal(work.length, 1); assert.equal(work[0].minutes, 300);
    assert.equal(ho.length, 1, 'Übergabe-Block am Abgabetag'); assert.equal(ho[0].minutes, 60); assert.equal(ho[0].date, r.j.order.due_date); assert.ok(![0, 6].includes(dow(ho[0].date)), 'Abgabe nie am Wochenende'); assert.ok(r.j.order.due_date >= iso(3));
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
    assert.equal((await fetch(`${B}/file.php?id=${fid}&thumb=1`)).status, 401, 'Vorschaubild nur mit Login');
    const th = await fetch(`${B}/file.php?id=${fid}&thumb=1`, { headers: { cookie } }); assert.equal(th.status, 200); assert.equal(th.headers.get('content-type'), 'image/png'); assert.ok(Number(th.headers.get('content-length')) > 0);
  });
  await ok('Kalender: gebuchte Zeit der Person, freie Zeitfenster, Einträge', async () => {
    await call('order_status', { body: { id: oid, status: 'production' } });   // erledigte Aufträge zählen nicht als belegt
    const r = (await call('calendar', { params: { from: iso(0), to: iso(10) } })).j;
    assert.equal(r.days.length, 11); assert.equal(r.workers.length, 1);
    const wk = r.items.filter((i) => i.kind === 'work'), hv = r.items.filter((i) => i.kind === 'handover');
    assert.equal(r.days.reduce((s_, d) => s_ + d.w[1].booked, 0), 360, '5 h Arbeit + 1 h Übergabe'); assert.equal(wk.length, 1); assert.equal(hv.length, 1); assert.equal(wk[0].worker_id, 1);
    assert.deepEqual(wk[0].process_ids.split(',').sort(), ['1', '3']); assert.ok(wk[0].thumb > 0, 'Vorschaubild-ID für Aufträge mit Foto'); assert.equal(wk[0].total_min, 300);
    const today = r.days[0].w[1]; assert.equal(today.booked, 300); assert.equal(today.free, today.cap - 300);
    assert.ok(r.days.filter((d) => d.weekend).every((d) => d.w[1].cap === 300)); assert.ok(r.days.filter((d) => !d.weekend).every((d) => d.w[1].cap === 480));
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
    assert.equal(o.worker_id, 1); assert.equal(o.total_min, 300); assert.equal(o.start, '08:00'); assert.equal(o.end, '13:00'); assert.ok(o.thumb > 0, 'Foto-ID für den Monitor'); assert.equal(full.workers.length, 1);
    const tr = await fetch(`${B}/display_api.php?t=${token}&file=${o.thumb}`); assert.equal(tr.status, 200); assert.equal(tr.headers.get('content-type'), 'image/png');
    assert.equal((await fetch(`${B}/display_api.php?t=${token}&file=99999`)).status, 404);
    assert.equal((await fetch(`${B}/display_api.php?t=${'c'.repeat(64)}&file=${o.thumb}`)).status, 403, 'ohne gültigen Token kein Foto')
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
  const mkOrder = (extra) => call('order_save', { body: { customer_id: cid2, title: 'T', qty: 1, price: 10, currency: 'DKK', ...extra } });
  const opts = async (total, extra = {}) => (await call('plan_options', { params: { worker_id: 1, total, ...extra } })).j;
  const cal1 = async (d, wid = 1) => (await call('calendar', { params: { from: d, to: d } })).j.days[0].w[wid];
  let cid2;
  await ok('Eine Person: 5 h Sticken + 1 h DTF + 2 h Gravur teilen sich EINEN Tag von 8 h', async () => {
    cid2 = (await call('customer_save', { body: { name: 'Plan-Kunde' } })).j.id;
    const w = pick(20, WEEKDAY);
    const A = await mkOrder({ title: 'A Sticken 5h', plan_date: w, processes: [{ process_id: 1, minutes: 300 }] });
    assert.equal(A.status, 200); assert.equal(A.j.order.days[0].start, '08:00'); assert.equal(A.j.order.days[0].end, '13:00');
    let x = await cal1(w); assert.equal(x.booked, 300); assert.equal(x.free, 180); assert.deepEqual(x.iv, [['13:00', '16:00']]);
    // 4 h passen nicht mehr an diesen Tag (nur 3 h frei), 3 h schon
    assert.ok((await opts(240, { from: w })).options[0].start_date > w, '4 h: nächster Tag');
    const three = (await opts(180, { from: w })).options[0]; assert.equal(three.start_date, w); assert.equal(three.start, '13:00');
    const B = await mkOrder({ title: 'B DTF 1h', plan_date: w, processes: [{ process_id: 3, minutes: 60 }] });
    assert.equal(B.j.order.days[0].start, '13:00', 'direkt hinter A'); assert.equal(B.j.order.days[0].end, '14:00');
    const C0 = await mkOrder({ title: 'C Gravur 3h', plan_date: w, processes: [{ process_id: 6, minutes: 180 }] });
    assert.equal(C0.j.error, 'no_capacity', 'nur noch 2 h frei');
    const C = await mkOrder({ title: 'C Gravur 2h', plan_date: w, processes: [{ process_id: 6, minutes: 120 }] });
    assert.equal(C.status, 200); assert.equal(C.j.order.days[0].start, '14:00'); assert.equal(C.j.order.days[0].end, '16:00');
    x = await cal1(w); assert.equal(x.booked, 480); assert.equal(x.free, 0); assert.deepEqual(x.iv, []);
    assert.ok(!(await opts(30, { from: w })).options.some((o) => o.start_date === w), 'voller Tag wird nicht mehr angeboten');
  });
  await ok('Automatische Planung ohne Produktionstag: frühester freier Platz, keine vergangenen Tage', async () => {
    const full = pick(20, WEEKDAY);
    const r = await mkOrder({ title: 'Auto', processes: [{ process_id: 4, minutes: 120 }] }); assert.equal(r.status, 200);
    assert.ok(r.j.order.plan_date >= iso(0)); assert.notEqual(r.j.order.plan_date, full, 'der volle Tag wird übersprungen');
    const past = (await call('plan_options', { params: { worker_id: 1, total: 60, from: '2020-01-01' } })).j.options;
    assert.ok(past.length > 0 && past.every((o) => o.start_date >= iso(0)));
    assert.equal((await call('plan_options', { params: { worker_id: 1, total: 0 } })).j.error, 'no_duration');
  });
  await ok('Auftrag länger als ein Arbeitstag verteilt sich auf mehrere Tage; Abgabe nicht vor Produktionsende', async () => {
    const mon = pick(40, [1]);                                               // Montag: 8 h + 4 h am Dienstag
    const o = (await opts(720, { from: mon })).options[0];
    assert.equal(o.start_date, mon); assert.equal(o.chunks.length, 2); assert.equal(o.chunks[0].minutes, 480); assert.equal(o.chunks[1].minutes, 240);
    const tue = new Date(new Date(mon + 'T00:00:00').getTime() + 864e5).toISOString().slice(0, 10);
    assert.equal(o.finish, tue); assert.equal(o.finish_time, '12:00');
    const wed = new Date(new Date(mon + 'T00:00:00').getTime() + 2 * 864e5).toISOString().slice(0, 10);
    assert.equal((await mkOrder({ plan_date: mon, due_date: mon, processes: [{ process_id: 1, minutes: 720 }] })).j.error, 'due_before_finish');
    assert.equal((await mkOrder({ plan_date: mon, due_date: tue, processes: [{ process_id: 1, minutes: 720 }] })).j.error, 'due_before_finish', 'am Produktionstag selbst nicht');
    const pv = (await call('plan_preview', { params: { worker_id: 1, total: 720, date: mon } })).j; assert.equal(pv.due_min, wed, 'frühester Abgabetag = Tag nach Produktionsende');
    const ok1 = await mkOrder({ plan_date: mon, due_date: wed, processes: [{ process_id: 1, minutes: 720 }] });
    assert.equal(ok1.status, 200); assert.equal(ok1.j.order.days.filter((d) => d.kind === 'work').length, 2); assert.equal(ok1.j.order.finish_date, tue);
    // unveränderter Abgabetermin bleibt beim Bearbeiten stehen
    assert.equal((await call('order_save', { body: { ...ok1.j.order, processes: ok1.j.order.processes, notes: 'n' } })).status, 200);
    assert.equal((await cal1(mon)).free, 0); assert.equal((await cal1(tue)).booked, 240);
    // über das Wochenende: Freitag 8 h, Samstag nur 5 h Wochenend-Kapazität
    const fri = pick(60, [5]); const sat = new Date(new Date(fri + 'T00:00:00').getTime() + 864e5).toISOString().slice(0, 10);
    const f = (await opts(720, { from: fri })).options[0]; assert.equal(f.chunks[1].date, sat); assert.equal(f.chunks[1].minutes, 240);
  });
  await ok('Plan bleibt stabil: unveränderter Auftrag behält seine Zeit, neue Dauer wird neu eingeplant', async () => {
    const w = pick(80, WEEKDAY);
    const A = (await mkOrder({ title: 'Stabil', plan_date: w, processes: [{ process_id: 1, minutes: 180 }] })).j.order;
    await mkOrder({ title: 'Davor', plan_date: w, start_time: '08:00', processes: [{ process_id: 3, minutes: 60 }] });
    const keep = await call('order_save', { body: { ...A, processes: A.processes, notes: 'x' } }); assert.equal(keep.status, 200); assert.deepEqual(keep.j.order.days, A.days);
    const sh = await call('order_save', { body: { ...A, processes: [{ process_id: 1, minutes: 60 }] } }); assert.equal(sh.status, 200);
    assert.equal(sh.j.order.total_min, 60); assert.equal(sh.j.order.days[0].minutes, 60);
    assert.equal(sh.j.order.days[0].start, A.days[0].start, 'eigener alter Block zählt nicht doppelt');
  });
  await ok('Uhrzeit wählen: Zeitfenster, belegte Zeit abgelehnt, Vorschau', async () => {
    const w = pick(100, WEEKDAY);
    const F = await mkOrder({ title: 'Fix', plan_date: w, start_time: '09:00', processes: [{ process_id: 1, minutes: 120 }] });
    assert.equal(F.status, 200); assert.equal(F.j.order.days[0].start, '09:00');
    const sl = (await call('plan_slots', { params: { worker_id: 1, total: 60, date: w } })).j;
    assert.deepEqual(sl.free, [['08:00', '09:00'], ['11:00', '16:00']]); assert.equal(sl.starts[0].start, '08:00'); assert.ok(!sl.starts.some((x) => x.start === '09:15'));
    assert.equal((await call('plan_slots', { params: { worker_id: 1, total: 120, date: w } })).j.starts[0].start, '11:00');
    assert.equal((await mkOrder({ plan_date: w, start_time: '10:00', processes: [{ process_id: 3, minutes: 60 }] })).j.error, 'slot_taken');
    assert.equal((await mkOrder({ plan_date: w, start_time: '8:00', processes: [{ process_id: 3, minutes: 60 }] })).j.error, 'bad_start_time');
    const pv = (await call('plan_preview', { params: { worker_id: 1, total: 60, date: w, start: '11:30' } })).j; assert.equal(pv.possible, true); assert.equal(pv.chunks[0].end, '12:30');
    assert.equal((await call('plan_preview', { params: { worker_id: 1, total: 60, date: w, start: '10:00' } })).j.possible, false);
    assert.equal((await call('plan_slots', { params: { worker_id: 1, total: 60, date: iso(-1) } })).j.starts.length, 0);
  });
  await ok('Mitarbeiter: erst aktiv mit Namen, eigener Tag, Farbe, nicht entfernbar solange Aufträge offen sind', async () => {
    const me0 = (await call('me')).j; assert.equal(me0.workers.length, 4); assert.deepEqual(me0.workers.map((w) => w.active), [true, false, false, false]);
    assert.equal((await mkOrder({ worker_id: 2, processes: [{ process_id: 1, minutes: 60 }] })).j.error, 'bad_worker', 'inaktiv');
    assert.equal((await call('plan_options', { params: { worker_id: 2, total: 60 } })).j.error, 'bad_worker');
    const ws = me0.workers.map((w) => ({ id: w.id, name: w.name, color: w.color, day_min: w.day_min }));
    assert.equal((await call('workers_save', { body: { workers: [{ ...ws[0], name: '' }] } })).j.error, 'name_required');
    assert.equal((await call('workers_save', { body: { workers: [{ ...ws[1], name: 'Anna', color: 'rot' }] } })).j.error, 'bad_worker');
    assert.equal((await call('workers_save', { body: { workers: [{ ...ws[1], name: 'Anna', color: '#38BDF8', day_min: 360 }] } })).status, 200);
    const me1 = (await call('me')).j; assert.equal(me1.workers[1].active, true); assert.equal(me1.workers[1].color, '#38bdf8');
    const w = pick(20, WEEKDAY);                                           // Tag ist für den Inhaber voll, Anna ist frei (6 h)
    assert.equal((await cal1(w, 1)).free, 0); assert.equal((await cal1(w, 2)).free, 360);
    const E = await mkOrder({ worker_id: 2, title: 'Für Anna', plan_date: w, processes: [{ process_id: 5, minutes: 240 }] });
    assert.equal(E.status, 200); assert.equal(E.j.order.worker_id, 2); assert.equal(E.j.order.days[0].start, '08:00');
    assert.equal((await cal1(w, 2)).free, 120, 'Annas Tag: 6 h − 4 h'); assert.equal((await cal1(w, 1)).booked, 480, 'Inhaber unberührt');
    assert.equal((await mkOrder({ worker_id: 2, plan_date: w, processes: [{ process_id: 5, minutes: 180 }] })).j.error, 'no_capacity', 'Annas Tag hat nur noch 2 h');
    assert.equal((await call('workers_save', { body: { workers: [{ ...ws[1], name: '' }] } })).j.error, 'worker_in_use');
    assert.equal((await call('orders', { params: { worker: 2, show: 'all' } })).j.orders.length, 1);
    const cal = (await call('calendar', { params: { from: w, to: w } })).j; assert.equal(cal.workers.length, 2); assert.ok(cal.items.some((i) => i.worker_id === 2));
    await call('order_status', { body: { id: E.j.order.id, status: 'delivered' } });
    assert.equal((await call('workers_save', { body: { workers: [{ ...ws[1], name: '' }] } })).status, 200, 'ohne offene Aufträge entfernbar');
    assert.equal((await call('me')).j.workers[1].active, false);
  });
  await ok('Sperrtage: ganze Tage fallen aus Vorschlag, Tageswahl, Kalender und werden abgelehnt', async () => {
    const d1 = pick(120, WEEKDAY), d2 = new Date(new Date(d1 + 'T00:00:00').getTime() + 864e5).toISOString().slice(0, 10);
    assert.equal((await call('blocked_save', { body: { date_from: iso(-3), date_to: iso(-2), reason: 'alt' } })).j.error, 'date_past');
    assert.equal((await call('blocked_save', { body: { date_from: d2, date_to: d1 } })).j.error, 'bad_date_to');
    assert.equal((await call('blocked_save', { body: { date_from: d1, date_to: d2, reason: 'Urlaub' } })).status, 200);
    const me = (await call('me')).j; assert.equal(me.blocked.length, 1); const bid = me.blocked[0].id;
    const dates = (await opts(60, { from: d1, limit: 40 })).options.map((o) => o.start_date); assert.ok(!dates.includes(d1) && !dates.includes(d2));
    assert.ok(!(await call('due_days', { params: { from: d1 } })).j.dates.some((d) => d === d1 || d === d2));
    const day = (await call('calendar', { params: { from: d1, to: d1 } })).j.days[0]; assert.equal(day.blocked, 'Urlaub'); assert.equal(day.w[1].cap, 0);
    assert.equal((await mkOrder({ plan_date: d1, processes: [{ process_id: 1, minutes: 60 }] })).j.error, 'date_blocked');
    assert.equal((await mkOrder({ due_date: d2, processes: [{ process_id: 1, minutes: 60 }] })).j.error, 'date_blocked');
    assert.equal((await mkOrder({ due_date: iso(-1), processes: [{ process_id: 1, minutes: 60 }] })).j.error, 'date_past');
    // Mehrtagesauftrag überspringt die gesperrten Tage
    const long = (await opts(1200, { from: d1 })).options[0]; assert.ok(long.chunks.every((c) => c.date !== d1 && c.date !== d2));
    const v1 = (await call('version')).j.version; await call('blocked_delete', { body: { id: bid } }); assert.ok((await call('version')).j.version > v1);
    assert.ok((await opts(60, { from: d1, limit: 40 })).options.some((o) => o.start_date === d1), 'wieder frei');
  });
  await ok('Teilsperre mit Uhrzeit: nimmt nur ihr Zeitfenster heraus, überlappende Zeiten nicht doppelt', async () => {
    const d = pick(140, WEEKDAY);
    assert.equal((await call('blocked_save', { body: { date_from: d, time_from: '12:00' } })).j.error, 'bad_time');
    assert.equal((await call('blocked_save', { body: { date_from: d, time_from: '16:00', time_to: '12:00' } })).j.error, 'bad_time');
    assert.equal((await call('blocked_save', { body: { date_from: d, time_from: '25:00', time_to: '26:00' } })).j.error, 'bad_time');
    await call('blocked_save', { body: { date_from: d, time_from: '12:00', time_to: '16:00', reason: 'Arzt' } });
    let day = (await call('calendar', { params: { from: d, to: d } })).j.days[0];
    assert.equal(day.blocked, null); assert.deepEqual(day.partial.times, ['12:00-16:00']); assert.equal(day.w[1].cap, 240); assert.deepEqual(day.w[1].iv, [['08:00', '12:00']]);
    await call('blocked_save', { body: { date_from: d, time_from: '14:00', time_to: '18:00' } });       // überlappt, außerhalb 16 Uhr zählt nichts
    day = (await call('calendar', { params: { from: d, to: d } })).j.days[0]; assert.equal(day.w[1].cap, 240);
    assert.equal((await opts(300, { from: d })).options[0].start_date > d || (await opts(300, { from: d })).options[0].start_date === d, true);
    assert.notEqual((await opts(300, { from: d })).options[0].start_date, d, '5 h passen nicht in die 4 h vor der Sperre');
    assert.equal((await opts(240, { from: d })).options[0].start_date, d);
    assert.equal((await mkOrder({ plan_date: d, start_time: '12:00', processes: [{ process_id: 1, minutes: 60 }] })).j.error, 'slot_taken');
    assert.equal((await mkOrder({ plan_date: d, start_time: '09:00', processes: [{ process_id: 1, minutes: 60 }] })).status, 200, 'Teilsperre-Tag bleibt buchbar');
    for (const b of (await call('me')).j.blocked) await call('blocked_delete', { body: { id: b.id } });
  });
  await ok('Wochenend-Stunden und Arbeitsbeginn einstellbar', async () => {
    assert.equal((await call('settings_save', { body: { weekend_min: 5000 } })).j.error, 'bad_weekend_min');
    assert.equal((await call('settings_save', { body: { weekend_min: 300, day_start: '7:00' } })).j.error, 'bad_day_start');
    await call('settings_save', { body: { weekend_min: 0 } });
    assert.ok((await opts(30, { from: pick(160, [6]), limit: 20 })).options.every((o) => ![0, 6].includes(dow(o.start_date))), 'Wochenende zu');
    await call('settings_save', { body: { weekend_min: 300, day_start: '07:00' } });
    assert.equal((await call('me')).j.settings.day_start, '07:00');
    assert.equal((await opts(60, { from: pick(170, WEEKDAY) })).options[0].start, '07:00');
    const sat = pick(170, [6]); assert.ok((await opts(300, { from: sat, limit: 20 })).options.some((o) => o.start_date === sat), '5 h am Samstag');
    assert.ok(!(await opts(301, { from: sat, limit: 20 })).options.some((o) => o.start_date === sat), '301 min passen nicht an einen Samstag');
    await call('settings_save', { body: { weekend_min: 300, day_start: '08:00' } });
  });

  await ok('Dauer je Stück: Gesamtzeit = je Stück × Menge, höchstens 60 Min. je Stück, Menge ändern plant neu', async () => {
    const base = { title: 'Je Stück', qty: 3, plan_date: pick(180, WEEKDAY) };
    assert.equal((await mkOrder({ ...base, processes: [{ process_id: 1, per_piece: 61 }] })).j.error, 'bad_per_piece');
    const r = await mkOrder({ ...base, processes: [{ process_id: 1, per_piece: 30 }, { process_id: 2, per_piece: 10 }] });
    assert.equal(r.status, 200); assert.equal(r.j.order.total_min, 120, '(30 + 10) × 3 Stück');
    const p1 = r.j.order.processes.find((p) => p.process_id === 1); assert.equal(p1.minutes, 90); assert.equal(p1.per_piece, 30);
    assert.equal(r.j.order.days.filter((d) => d.kind === 'work')[0].minutes, 120);
    const more = await call('order_save', { body: { ...r.j.order, qty: 5, processes: [{ process_id: 1, per_piece: 30 }, { process_id: 2, per_piece: 10 }] } });
    assert.equal(more.j.order.total_min, 200, 'Menge 5 → (30 + 10) × 5'); assert.equal(more.j.order.days.filter((d) => d.kind === 'work')[0].minutes, 200);
    const keep = await call('order_save', { body: { ...more.j.order, processes: [{ process_id: 1, per_piece: 30 }, { process_id: 2, per_piece: 10 }], notes: 'x' } });
    assert.deepEqual(keep.j.order.days, more.j.order.days, 'unverändert bleibt der Plan');
  });
  await ok('Abgabe nie am Wochenende: springt auf Montag; eine Stunde am Abgabetag ist weg', async () => {
    const sat = pick(200, [6]), sun = new Date(new Date(sat + 'T00:00:00').getTime() + 864e5).toISOString().slice(0, 10), mon = new Date(new Date(sat + 'T00:00:00').getTime() + 2 * 864e5).toISOString().slice(0, 10);
    const before = await cal1(mon);
    const a = await mkOrder({ title: 'Samstag-Abgabe', due_date: sat, processes: [{ process_id: 1, per_piece: 20 }] });
    assert.equal(a.status, 200); assert.equal(a.j.order.due_date, mon, 'Samstag → Montag'); assert.deepEqual(a.j.due_adjusted, { from: sat, to: mon });
    const h = a.j.order.days.find((d) => d.kind === 'handover'); assert.equal(h.date, mon); assert.equal(h.minutes, 60); assert.equal(h.start, '15:00', 'späteste freie Stunde');
    const after = await cal1(mon); assert.equal(after.booked, before.booked + 60, 'eine Stunde fällt am Abgabetag weg'); assert.equal(after.free, before.free - 60);
    const b = await mkOrder({ title: 'Sonntag-Abgabe', due_date: sun, processes: [{ process_id: 1, per_piece: 20 }] });
    assert.equal(b.j.order.due_date, mon, 'Sonntag → Montag'); assert.equal(b.j.order.days.find((d) => d.kind === 'handover').start, '14:00', 'zweite Übergabe davor');
    const c = await mkOrder({ title: 'Werktag-Abgabe', due_date: pick(210, [3]), processes: [{ process_id: 1, per_piece: 20 }] }); assert.equal(c.j.due_adjusted, null);
    // kalendereintrag der Übergabe
    const ci = (await call('calendar', { params: { from: mon, to: mon } })).j.items.filter((i) => i.kind === 'handover'); assert.ok(ci.length >= 2);
    assert.equal((await mkOrder({ title: 'Nur Termin', due_date: pick(210, [3]) })).j.order.days.filter((d) => d.kind === 'handover').length, 1, 'auch ohne Verfahren reserviert');
  });
  await ok('Abgabetage: nur Werktage mit freier Stunde; voller Tag wird übersprungen; unveränderter Abgabetermin behält seinen Block', async () => {
    const mon = pick(230, [1]), tue = new Date(new Date(mon + 'T00:00:00').getTime() + 864e5).toISOString().slice(0, 10);
    const full = await mkOrder({ title: 'Voller Montag', plan_date: mon, processes: [{ process_id: 1, per_piece: 60 }], qty: 8 });
    assert.equal(full.status, 200); assert.equal((await cal1(mon)).free, 0);
    const dd = (await call('due_days', { params: { worker_id: 1, from: mon } })).j.dates;
    assert.ok(dd.length > 20 && dd.every((d) => ![0, 6].includes(dow(d))), 'keine Wochenenden'); assert.ok(!dd.includes(mon), 'voller Tag nicht'); assert.equal(dd[0], tue);
    const x = await mkOrder({ title: 'Abgabe am vollen Tag', due_date: mon, processes: [{ process_id: 3, per_piece: 10 }] });
    assert.equal(x.j.order.due_date, tue, 'voller Tag → nächster Tag'); assert.deepEqual(x.j.due_adjusted, { from: mon, to: tue });
    const keep = await call('order_save', { body: { ...x.j.order, processes: [{ process_id: 3, per_piece: 10 }], notes: 'nur Notiz' } });
    assert.equal(keep.status, 200); assert.deepEqual(keep.j.order.days, x.j.order.days); assert.equal(keep.j.due_adjusted, null);
    const pv = (await call('plan_preview', { params: { worker_id: 1, total: 60, date: pick(250, WEEKDAY) } })).j; assert.ok(pv.due_min > pv.finish); assert.ok(![0, 6].includes(dow(pv.due_min)));
    // erledigt: Block zählt nicht mehr als belegt
    const before = await cal1(tue); await call('order_status', { body: { id: x.j.order.id, status: 'done' } }); assert.equal((await cal1(tue)).booked, before.booked - 60, 'die Übergabe-Stunde fällt weg (Arbeit lag an einem anderen Tag)');
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
  await ok('Datenbank-Update v4 → v14 übernimmt bestehende Aufträge als Block des Inhabers', async () => {
    const { execFileSync } = await import('node:child_process');
    const code = `require '${root}/inc/schema.php';
      $db = new PDO('sqlite::memory:'); $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION); $db->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
      $db->exec('CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
      wf_migrate_v1($db); wf_migrate_v2($db); wf_migrate_v3($db); wf_migrate_v4($db);
      $db->exec("INSERT INTO customers (name) VALUES ('Alt')");
      $db->exec("INSERT INTO orders (nr, customer_id, title, due_date) VALUES ('2026-0001', 1, 'Alt', '2030-05-06'), ('2026-0002', 1, 'Ohne Datum', NULL), ('2026-0003', 1, 'Zweiter', '2030-05-06')");
      $db->exec("INSERT INTO order_processes (order_id, process_id, minutes) VALUES (1, 1, 120), (1, 3, 60), (2, 1, 60), (3, 4, 90)");
      echo $db->query("SELECT value FROM meta WHERE key='schema_version'")->fetchColumn(), ',';
      wf_migrate($db); wf_migrate($db);
      echo $db->query("SELECT value FROM meta WHERE key='schema_version'")->fetchColumn(), ',', $db->query('SELECT COUNT(*) FROM workers')->fetchColumn(), ',';
      foreach ($db->query('SELECT order_id, date, start_time, minutes FROM order_days ORDER BY id') as $r) echo $r['order_id'] . '@' . $r['date'] . ' ' . $r['start_time'] . '+' . $r['minutes'] . ';';
      $o = $db->query('SELECT total_min, worker_id, plan_date FROM orders WHERE id = 1')->fetch(); echo ',', $o['total_min'], '/', $o['worker_id'], '/', $o['plan_date'];
      echo ',', $db->query('SELECT COUNT(*) FROM order_days WHERE order_id = 2')->fetchColumn(), ',', $db->query('SELECT COUNT(*) FROM customers')->fetchColumn();`;
    assert.equal(execFileSync('php', ['-r', code]).toString(), '4,14,4,1@2030-05-06 08:00+180;3@2030-05-06 11:00+90;,180/1/2030-05-06,0,1');
  });

} finally {
  srv.kill(); rmSync(data, { recursive: true, force: true });
  console.log(`${passed} Tests bestanden`);
}
