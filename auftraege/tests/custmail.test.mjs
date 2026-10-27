// Integrationstest Kundenmails + Verfolgungslink: Angebotsmail, Versand mit Sendungsnummer, Nachfrage nach 7 Tagen, Abmeldung.
// Aufruf: node auftraege/tests/custmail.test.mjs
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = mkdtempSync(join(tmpdir(), 'wf-cm-'));
const mails = join(data, 'mails');
const PORT = 8099, B = `http://127.0.0.1:${PORT}`;
const srv = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', root], { env: { ...process.env, WF_TEST_DATA_DIR: data, WF_OFFLINE: '1', WF_MAIL_DIR: mails }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));

let cookie = '', csrf = '';
async function call(a, { params = {}, body } = {}) {
  const h = { cookie };
  const opt = { headers: h };
  if (body) { opt.method = 'POST'; h['content-type'] = 'application/json'; h['x-csrf-token'] = csrf; opt.body = JSON.stringify(body); }
  const r = await fetch(`${B}/api.php?${new URLSearchParams({ a, ...params })}`, opt);
  return { status: r.status, j: await r.json().catch(() => ({})) };
}
let passed = 0;
const ok = (name, fn) => fn().then(() => { passed++; console.log('  ✓', name); }).catch((e) => { console.error('  ✗', name, '\n', e.message); process.exitCode = 1; });
const sql = (q) => execFileSync('php', ['-r', `$p=new PDO('sqlite:${data}/auftraege.sqlite');$p->exec(${JSON.stringify(q)});`]).toString();
const q1 = (q) => JSON.parse(execFileSync('php', ['-r', `$p=new PDO('sqlite:${data}/auftraege.sqlite');echo json_encode($p->query(${JSON.stringify(q)})->fetchAll(PDO::FETCH_ASSOC));`]).toString());
// Mails lesen: Betreff und Text (base64) dekodieren
const readMails = () => (existsSync(mails) ? readdirSync(mails).sort() : []).map((f) => {
  const raw = readFileSync(join(mails, f), 'utf8');
  const subj = Buffer.from((raw.match(/Subject: =\?UTF-8\?B\?([^?]+)\?=/) || [])[1] || '', 'base64').toString();
  const m = raw.match(/Content-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--/);
  return { raw, to: (raw.match(/^To: (.*)$/m) || [])[1], subj, text: m ? Buffer.from(m[1].replace(/\s/g, ''), 'base64').toString() : '' };
});
const tick = async () => { sql("DELETE FROM meta WHERE key = 'archive_tick'"); await call('me'); await new Promise((r) => setTimeout(r, 400)); };

try {
  const r0 = await fetch(`${B}/api.php?a=me&dev=7`); cookie = r0.headers.get('set-cookie').split(';')[0];
  csrf = (await call('me')).j.csrf;
  await call('company_save', { body: { name: 'Wunsch-Fabrik', owner: 'Robert', street: 'Vej 1', zip: '6330', city: 'Padborg', cvr: '12345674', iban: 'DK5000400440116243', email: 'info@wunsch-fabrik.dk', moms_registered: true } });
  const cid = (await call('customer_save', { body: { name: 'Erika Muster', email: 'erika@example.de', address: 'Weg 2, Flensburg', country: 'DE' } })).j.id;
  const pr = (await call('me')).j.processes;
  const mkOrder = async (title, c = cid) => (await call('order_save', { body: { customer_id: c, title, qty: 3, price: 300, currency: 'DKK', pay_status: 'open',
    items: [{ name: title, qty: 3, price: 100, processes: [{ process_id: pr[0].id, per_piece: 10 }] }] } })).j.order;
  const o = await mkOrder('Hoodies mit Namen');

  await ok('Verfolgungslink: Seite zeigt Auftrag und Stand, fremder Link ungültig', async () => {
    assert.match(o.track_url, /^http:\/\/127\.0\.0\.1:8099\/verfolgen\.php\?t=[0-9a-f]{48}$/);
    assert.equal(o.track_token, undefined, 'Token nur als Link');
    const html = await (await fetch(o.track_url)).text();
    assert.ok(html.includes(o.nr) && html.includes('Hoodies mit Namen') && html.includes('Angefragt'), 'deutsch für DE-Kunden');
    assert.ok(!html.includes('erika@example.de') && !html.includes('Flensburg'), 'keine Kundendaten');
    assert.ok((await (await fetch(`${B}/verfolgen.php?t=${'0'.repeat(48)}`)).text()).includes('ugyldigt'));
  });

  await ok('Angebot zum Unterschreiben: E-Mail mit Unterschrift-Link, Verfolgungslink und Hinweis auf Nachfrage', async () => {
    const r = (await call('confirm_create', { body: { order_id: o.id, email: true } })).j;
    assert.equal(r.mailed, true);
    const m = readMails().at(-1);
    assert.equal(m.to, 'erika@example.de');
    assert.match(m.subj, /Ihr Angebot 2026-|Ihr Angebot \d{4}-/);
    assert.ok(m.text.startsWith('Hallo Erika,'));
    assert.ok(m.text.includes(`bestaetigung.php?t=${r.token}`));
    assert.ok(m.text.includes(o.track_url) && m.text.includes('&abmelden=1'));
    assert.ok(m.text.includes('Robert') && m.raw.includes('<info@wunsch-fabrik.dk>'));
    // HTML-Teil: Unterschrift-Link als klickbarer Knopf
    const hm = m.raw.match(/Content-Type: text\/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--/);
    const html = Buffer.from(hm[1].replace(/\s/g, ''), 'base64').toString();
    assert.ok(html.includes(`href="http://127.0.0.1:8099/bestaetigung.php?t=${r.token}"`) && html.includes('Angebot ansehen &amp; unterschreiben'));
    assert.ok(html.includes('Auftrag verfolgen'));
    assert.ok((await call('order', { params: { id: o.id } })).j.order.log.some((l) => l.what === 'mail:offer'));
  });

  await ok('Unterschrift: Danke-Mail mit Verfolgungslink und Link zur unterschriebenen Bestätigung, Status Freigabe', async () => {
    const r = (await call('confirm_create', { body: { order_id: o.id } })).j;
    const n = readMails().length;
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const res = await fetch(`${B}/bestaetigung.php?t=${r.token}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Erika Muster', accept: true, signature: png }) });
    assert.equal(res.status, 200, await res.text());
    const all = readMails();
    assert.equal(all.length, n + 1);
    const m = all.at(-1);
    assert.match(m.subj, /Danke für Ihre Freigabe/);
    assert.ok(m.text.includes(o.track_url) && m.text.includes(`bestaetigung.php?t=${r.token}&signed=1`));
    assert.ok(m.raw.length > 0);
    const hm = m.raw.match(/Content-Type: text\/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--/);
    const html = Buffer.from(hm[1].replace(/\s/g, ''), 'base64').toString();
    assert.ok(html.includes('Auftrag verfolgen') && html.includes('Auftragsbestätigung ansehen'));
    assert.equal((await call('order', { params: { id: o.id } })).j.order.status, 'approval');
    assert.ok((await (await fetch(`${B}/bestaetigung.php?t=${r.token}&signed=1`)).text()).includes('Erika Muster'));
  });

  await ok('Ohne Häkchen keine Angebotsmail', async () => {
    const n = readMails().length;
    assert.equal((await call('confirm_create', { body: { order_id: o.id } })).j.mailed, false);
    assert.equal(readMails().length, n);
  });

  await ok('Versendet mit GLS + Sendungsnummer: im Verfolgungslink sichtbar, Versandmail standardmäßig aus', async () => {
    const n = readMails().length;
    const r = (await call('order_status', { body: { id: o.id, status: 'delivered', ship_mode: 'ship', carrier: 'gls', tracking_no: 'ZX 123<b>456' } })).j;
    assert.equal(r.order.tracking_no, 'ZX 123b456', 'Sonderzeichen entfernt');
    assert.match(r.order.carrier_url, /gls-group\.com.*ZX%20123b456/);
    assert.ok(r.order.shipped_at);
    assert.equal(readMails().length, n);
    const html = await (await fetch(o.track_url)).text();
    assert.ok(html.includes('ZX 123b456') && html.includes('GLS') && html.includes('Sendung verfolgen'));
  });

  await ok('Versandmail auf Knopfdruck mit Sendungsnummer', async () => {
    const r = (await call('order_ship', { body: { id: o.id, ship_mode: 'ship', carrier: 'postnord', tracking_no: '00370712345', mail: 1 } })).j;
    assert.equal(r.mailed, true);
    const m = readMails().at(-1);
    assert.match(m.subj, /unterwegs/);
    assert.ok(m.text.includes('PostNord') && m.text.includes('00370712345') && m.text.includes('tracking.postnord.com'));
  });

  await ok('Nachfrage-Mail erst nach 7 Tagen, mit Bewertungs- und Abmeldelink, nur einmal', async () => {
    await call('company_save', { body: { ...(await call('me')).j.company, review_url: 'https://g.page/r/wunschfabrik/review' } });
    assert.equal((await call('company_save', { body: { ...(await call('me')).j.company, review_url: 'http://unsicher.example' } })).j.error, 'bad_url');
    const n = readMails().length;
    await tick();
    assert.equal(readMails().length, n, 'noch nicht fällig');
    sql(`UPDATE orders SET shipped_at = datetime('now', '-8 days') WHERE id = ${o.id}`);
    await tick();
    const all = readMails();
    assert.equal(all.length, n + 1);
    const m = all.at(-1);
    assert.ok(m.text.startsWith('Hallo Erika,'));
    assert.ok(m.text.includes('https://g.page/r/wunschfabrik/review'));
    assert.ok(m.text.includes(o.track_url + '&abmelden=1'));
    await tick();
    assert.equal(readMails().length, n + 1, 'kein zweites Mal');
    assert.ok(q1(`SELECT followup_at FROM orders WHERE id = ${o.id}`)[0].followup_at.startsWith('20'));
  });

  await ok('Abmelden per Knopf: Kunde bekommt keine Nachfrage mehr, Bearbeiten des Kunden ändert das nicht', async () => {
    const page = await (await fetch(o.track_url + '&abmelden=1')).text();
    assert.ok(page.includes('keine solchen E-Mails mehr'));
    assert.equal(q1(`SELECT no_followup FROM customers WHERE id = ${cid}`)[0].no_followup, 0, 'GET allein meldet nicht ab');
    const t = o.track_url.split('t=')[1];
    const res = await (await fetch(`${B}/verfolgen.php?t=${t}`, { method: 'POST', body: new URLSearchParams({ t, a: 'unsub' }) })).text();
    assert.ok(res.includes('keine Nachfrage-E-Mails mehr'));
    await call('customer_save', { body: { id: cid, name: 'Erika Muster', email: 'erika@example.de', country: 'DE', currency: 'DKK' } });
    assert.equal(q1(`SELECT no_followup FROM customers WHERE id = ${cid}`)[0].no_followup, 1);
    const o2 = await mkOrder('Tassen');
    await call('order_status', { body: { id: o2.id, status: 'delivered', ship_mode: 'pickup' } });
    sql(`UPDATE orders SET shipped_at = datetime('now', '-8 days') WHERE id = ${o2.id}`);
    const n = readMails().length;
    await tick();
    assert.equal(readMails().length, n);
    assert.equal(q1(`SELECT followup_at FROM orders WHERE id = ${o2.id}`)[0].followup_at, 'skip');
    const html = await (await fetch((await call('order', { params: { id: o2.id } })).j.order.track_url)).text();
    assert.ok(html.includes('Abgeholt'));
  });

  await ok('Zeitplan (cron.php): falscher Schlüssel 403, richtiger verschickt fällige Nachfrage ohne App', async () => {
    assert.equal((await fetch(`${B}/cron.php?key=falsch`)).status, 403);
    const ci = (await call('cron_info')).j;
    assert.match(ci.url, /cron\.php\?key=[0-9a-f]{40}$/); assert.equal(ci.last, '');
    assert.ok(ci.script.includes(ci.url) && ci.script.includes('everyHours(1)'));
    const c3 = (await call('customer_save', { body: { name: 'Karl Kunde', email: 'karl@example.de', country: 'DE' } })).j.id;
    const o4 = await mkOrder('Caps', c3);
    await call('order_status', { body: { id: o4.id, status: 'delivered', ship_mode: 'pickup' } });
    sql(`UPDATE orders SET shipped_at = datetime('now', '-8 days') WHERE id = ${o4.id}`);
    sql("INSERT OR REPLACE INTO meta (key, value) VALUES ('archive_tick', '9999999999')");   // App-eigener Lauf aus
    const n = readMails().length;
    const res = await fetch(ci.url);
    assert.equal(res.status, 200); assert.match(await res.text(), /followup=1/);
    assert.equal(readMails().length, n + 1); assert.equal(readMails().at(-1).to, 'karl@example.de');
    const info = (await call('cron_info')).j;
    assert.ok(info.last && info.result.includes('followup=1')); assert.ok(info.denied.includes('falscher Schlüssel'));
    const pm = (await call('mail_test', { body: { to: 'robert@example.dk' } })).j;
    assert.equal(pm.to, 'robert@example.dk'); assert.equal(readMails().at(-1).to, 'robert@example.dk');
    const ren = (await call('cron_info', { body: { renew: 1 } })).j;
    assert.notEqual(ren.url, ci.url); assert.equal((await fetch(ci.url)).status, 403);
  });

  await ok('Dänischer Kunde bekommt dänische Mails', async () => {
    const c2 = (await call('customer_save', { body: { name: 'Jens Hansen', email: 'jens@example.dk', country: 'DK' } })).j.id;
    const o3 = await mkOrder('Krus', c2);
    await call('confirm_create', { body: { order_id: o3.id, email: true } });
    const m = readMails().at(-1);
    assert.ok(m.text.startsWith('Hej Jens,') && m.subj.includes('Dit tilbud'));
  });
} finally {
  srv.kill();
  rmSync(data, { recursive: true, force: true });
  console.log(`\n${passed} Tests bestanden${process.exitCode ? ', FEHLER siehe oben' : ''}`);
}
