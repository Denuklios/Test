// Integrationstest Archiv bei Dritten (Google Drive über Apps Script, E-Mail), Kunde löschen, Preisliste.
// Aufruf: node auftraege/tests/archive.test.mjs
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = mkdtempSync(join(tmpdir(), 'wf-arc-'));
const mails = join(data, 'mails');
const PORT = 8097, B = `http://127.0.0.1:${PORT}`, DPORT = 8098;

// Nachbau Google Apps Script: POST /exec -> 302 auf /echo, dort JSON-Antwort (wie script.googleusercontent.com)
const drive = [];
let secret = '', last = null;
const mock = createServer((req, res) => {
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', () => {
    if (req.url === '/exec' && req.method === 'POST') {
      const d = JSON.parse(b);
      last = d.secret === secret ? { ok: true, saved: d.files.length } : { ok: false, error: 'secret' };
      if (last.ok) drive.push(d);
      res.writeHead(302, { location: '/echo' }); return res.end();
    }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(last));
  });
}).listen(DPORT);

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
const q = (s) => execFileSync('php', ['-r', `$p=new PDO('sqlite:${data}/auftraege.sqlite');echo json_encode($p->query(${JSON.stringify(s)})->fetchAll(PDO::FETCH_ASSOC));`]).toString();
const today = new Date().toISOString().slice(0, 10);

try {
  const r0 = await fetch(`${B}/api.php?a=me&dev=7`); cookie = r0.headers.get('set-cookie').split(';')[0];
  csrf = (await call('me')).j.csrf;
  const co = { name: 'Wunsch-Fabrik', street: 'Vej 1', zip: '6330', city: 'Padborg', cvr: '12345674', iban: 'DK5000400440116243', email: 'info@wunsch-fabrik.dk', moms_registered: true };
  await call('company_save', { body: co });
  const cid = (await call('customer_save', { body: { name: 'Jens Jensen', address: 'Gade 1', phone: '12345678', country: 'DK' } })).j.id;

  await ok('Preisliste: anlegen, ändern, deaktivieren, löschen', async () => {
    const p = (await call('product_save', { body: { name: 'T-Shirt bedruckt', unit: 'stk', price: '149,00', kind: 'goods', active: 1 } })).j;
    assert.ok(p.ok);
    const id = (await call('products')).j.products[0].id;
    await call('product_save', { body: { id, name: 'T-Shirt bedruckt', unit: 'stk', price: '159', kind: 'goods', active: 0 } });
    const l = (await call('products')).j.products;
    assert.equal(l[0].price, 15900); assert.equal(+l[0].active, 0);
    await call('product_delete', { body: { id } });
    assert.equal((await call('products')).j.products.length, 0);
  });

  await ok('Preisvorschlag aus Marktpreisen (DE/DA, Verfahren erkannt)', async () => {
    const g = async (name) => (await call('price_suggest', { params: { name } })).j.suggest;
    assert.equal((await g('Hættetrøje med broderi')).key, 'hoodie_stick');
    const ts = await g('T-Shirt bedruckt');
    assert.equal(ts.dk.typ, 15000); assert.equal(ts.de.typ, 2000);
    // Mittelweg: Netto DK (120 kr) und Netto DE (20 € × 7,46038 / 1,19 = 125,38 kr) mitteln, + 25 % Moms, volle Krone
    assert.equal(ts.mix.incl, 15300); assert.equal(ts.mix.net, 12240);
    assert.equal((await g('Zaubertasse mit Foto')).key, 'zaubertasse');
    assert.equal(await g('Fahrrad'), null);
  });

  await ok('Stundensatz: Standard 450 kr, änderbar', async () => {
    assert.equal((await call('me')).j.company.hour_rate, 45000);
    assert.ok((await call('company_save', { body: { ...co, hour_rate: '480' } })).j.ok);
    assert.equal((await call('me')).j.company.hour_rate, 48000);
  });

  await ok('Auftrag mit mehreren Produkten: Menge, Zeiten je Verfahren und Rechnungszeilen kommen aus den Positionen', async () => {
    const me = (await call('me')).j;
    const stick = me.processes.find((p) => p.key === 'stick'), flex = me.processes.find((p) => p.key === 'flex');
    assert.equal(+stick.default_pp, 15); assert.equal(+flex.default_pp, 5);
    const pr = (await call('product_save', { body: { name: 'Hoodie bestickt', unit: 'stk', price: '399', kind: 'goods', processes: [{ process_id: stick.id, per_piece: 20 }, { process_id: 999, per_piece: 5 }] } })).j.id;
    const pl = (await call('products')).j.products.find((p) => p.id === pr);
    assert.deepEqual(pl.processes, [{ process_id: +stick.id, per_piece: 20 }], 'unbekanntes Verfahren verworfen');
    const dig = me.processes.find((p) => p.key === 'digitalisieren'), cnc = me.processes.find((p) => p.key === 'cnc');
    assert.equal(+dig.per_order, 1); assert.equal(+dig.default_pp, 60); assert.equal(+cnc.per_order, 0);
    const items = [{ product_id: pr, name: 'Hoodie bestickt', qty: 4, price: 399, processes: [{ process_id: stick.id, per_piece: 20 }, { process_id: dig.id, per_piece: 90 }] },
      { name: 'T-Shirt Flex', qty: 10, price: '149,5', processes: [{ process_id: flex.id, per_piece: 5 }, { process_id: stick.id, per_piece: 3 }] }];
    const o = (await call('order_save', { body: { customer_id: cid, title: 'Vereinskleidung', qty: 1, price: 3091, currency: 'DKK', pay_status: 'open', items } })).j;
    assert.ok(o.ok, JSON.stringify(o));
    assert.equal(o.order.qty, 14);
    const mins = Object.fromEntries(o.order.processes.map((p) => [p.process_id, +p.minutes]));
    assert.equal(mins[stick.id], 4 * 20 + 10 * 3); assert.equal(mins[flex.id], 50);
    assert.equal(mins[dig.id], 90, 'Digitalisieren einmalig, nicht × Menge');
    assert.equal(o.order.items.length, 2); assert.equal(o.order.items[1].price, 149.5);
    const inv = (await call('order_invoice', { body: { order_id: o.order.id, purpose: 'final' } })).j;
    const lines = (await call('invoice', { params: { id: inv.id } })).j.invoice.lines;
    assert.deepEqual(lines.map((l) => [l.description, +l.qty, +l.unit_price]), [['Hoodie bestickt', 4, 39900], ['T-Shirt Flex', 10, 14950]]);
  });

  await ok('Ohne Archiv-Einstellung: nichts wird vorgemerkt', async () => {
    assert.equal((await call('archive_status')).j.mode, '');
    assert.equal((await call('archive_test', { body: {} })).j.error, 'archive_not_set');
    const id = (await call('invoice_save', { body: { customer_id: cid, issue_date: today, lines: [{ description: 'Vorher', qty: 1, unit_price: '100' }] } })).j.id;
    assert.ok((await call('invoice_approve', { body: { id } })).j.number);
    assert.equal(JSON.parse(q('SELECT * FROM archive_queue')).length, 0);
  });

  await ok('Drive: nur echte Apps-Script-URL; Script enthält Geheimwort, Status verrät es nicht', async () => {
    assert.equal((await call('company_save', { body: { ...co, drive_url: 'https://evil.example/exec' } })).j.error, 'bad_drive_url');
    const s = (await call('drive_script')).j.script;
    secret = s.match(/const SECRET = '([0-9a-f]{32})'/)[1];
    assert.equal((await call('drive_script')).j.script.includes(secret), true, 'gleiches Geheimwort beim zweiten Aufruf');
    assert.ok((await call('company_save', { body: { ...co, drive_url: `http://127.0.0.1:${DPORT}/exec` } })).j.ok);
    const st = (await call('archive_status')).j;
    assert.equal(st.mode, 'drive'); assert.equal(JSON.stringify(st).includes(secret), false);
  });

  await ok('Archiv speichern unabhängig von Firmendaten; ø-Domain erlaubt; /dev-URL erklärt; Workspace-URL ok', async () => {
    assert.ok((await call('company_save', { body: { ...co, email: 'info@ønske-fabrik.dk' } })).j.ok, 'ø-Domain');
    assert.equal((await call('company_save', { body: { ...co, email: 'kaputt@' } })).j.detail, 'kaputt@');
    assert.equal((await call('archive_save', { body: { drive_url: 'https://script.google.com/macros/s/AKfy_x-1/dev' } })).j.error, 'drive_dev_url');
    assert.ok((await call('archive_save', { body: { drive_url: 'https://script.google.com/a/macros/wunsch-fabrik.dk/s/AKfy_x-1/exec' } })).j.ok);
    const r = (await call('archive_save', { body: { drive_url: `http://127.0.0.1:${DPORT}/exec`, archive_email: '', archive_from: '' } })).j;
    assert.equal(r.mode, 'drive'); assert.equal(r.company.email, 'info@ønske-fabrik.dk', 'Firmendaten unverändert');
    await call('company_save', { body: co });
  });

  await ok('Drive: Test-Upload folgt der Google-Umleitung', async () => {
    const r = (await call('archive_test', { body: {} })).j;
    assert.equal(r.mode, 'drive', JSON.stringify(r));
    assert.equal(drive.at(-1).text.includes('erreichbar'), true);
  });

  await ok('Drive: Rechnung festschreiben + Beleg buchen -> Ordner Fakturaer/Jahr und Bilag/Jahr, plus Wochensicherung', async () => {
    const id = (await call('invoice_save', { body: { customer_id: cid, issue_date: today, lines: [{ description: 'Shirts', qty: 3, unit_price: '100' }] } })).j.id;
    const n = (await call('invoice_approve', { body: { id } })).j.number;
    const e = (await call('expense_save', { body: { no_receipt: 'Kassenzettel verloren', date: today, supplier: 'Garn', category: 'material', gross: '125', vat: '25', vat_mode: 'dk' } })).j.id;
    assert.ok((await call('expense_approve', { body: { id: e } })).j.number);
    const r = (await call('archive_run', { body: {} })).j;
    assert.ok(r.ok, JSON.stringify(r));
    const inv = drive.find((d) => d.folder === `Fakturaer/${today.slice(0, 4)}` && d.subject.includes(`Faktura ${n}`));
    assert.ok(inv, JSON.stringify(drive.map((d) => d.folder + ' ' + d.subject)));
    assert.deepEqual(inv.files.map((f) => f.name), [`Faktura-${n}.html`, `Faktura-${n}.csv`]);
    assert.ok(Buffer.from(inv.files[0].data, 'base64').toString().includes('Shirts'));
    assert.ok(drive.find((d) => d.folder === `Bilag/${today.slice(0, 4)}` && d.text.includes('Kassenzettel verloren')));
    const bk = drive.find((d) => d.folder === 'Sikkerhedskopi');
    assert.ok(bk && bk.files[0].name.endsWith('.sqlite.gz'));
    const st = (await call('archive_status')).j;
    assert.equal(st.open, 0); assert.equal(st.last_backup, today);
  });

  await ok('Alles bisherige nachsenden: auch die Rechnung von vor der Einrichtung', async () => {
    const before = drive.length;
    await call('archive_run', { body: { all: 1 } });
    assert.ok(drive.slice(before).some((d) => d.subject.includes('Faktura 1 ')), 'Rechnung 1');
    assert.equal(drive.filter((d) => d.subject.includes('Faktura 2 ')).length, 1, 'keine Doppelten');
  });

  await ok('Falsches Geheimwort: bleibt offen mit Fehler, kein Datenverlust', async () => {
    secret = 'anders';
    const id = (await call('invoice_save', { body: { customer_id: cid, issue_date: today, lines: [{ description: 'X', qty: 1, unit_price: '10' }] } })).j.id;
    await call('invoice_approve', { body: { id } });
    const r = (await call('archive_run', { body: {} })).j;
    assert.equal(r.failed, 1); assert.equal(r.status.open, 1); assert.match(r.status.last_error, /Drive/);
  });

  await ok('E-Mail statt Drive: Mail mit Anhängen an das Archiv-Postfach', async () => {
    assert.ok((await call('company_save', { body: { ...co, drive_url: '', archive_email: 'archiv@gmail.com', archive_from: 'info@wunsch-fabrik.dk' } })).j.ok);
    assert.equal((await call('archive_test', { body: {} })).j.mode, 'mail');
    await call('archive_run', { body: { all: 1 } });
    const f = readdirSync(mails);
    assert.ok(f.length >= 2, f.join());
    const eml = f.map((x) => readFileSync(join(mails, x), 'utf8')).find((x) => x.includes('Faktura-3.html'));
    assert.ok(eml && eml.includes('To: archiv@gmail.com') && eml.includes('<info@wunsch-fabrik.dk>'));
  });

  await ok('Kunde löschen ohne Bestätigung abgelehnt', async () => {
    assert.equal((await call('customer_delete', { body: { id: cid } })).j.error, 'confirm_required');
  });

  await ok('Kunde mit festgeschriebenen Rechnungen: nur anonymisiert, Rechnungen bleiben', async () => {
    assert.equal((await call('customer', { params: { id: cid } })).j.customer.final_invoices, 3);
    const r = (await call('customer_delete', { body: { id: cid, confirm: 'DELETE' } })).j;
    assert.equal(r.mode, 'anonymized');
    const c = JSON.parse(q(`SELECT * FROM customers WHERE id = ${cid}`))[0];
    assert.equal(c.phone, ''); assert.match(c.name, /^Gelöscht/);
    assert.equal(JSON.parse(q(`SELECT COUNT(*) n FROM invoices WHERE customer_id = ${cid} AND status = 'final'`))[0].n, 3);
    assert.equal((await call('journal_verify')).j.ok, true);
  });

  await ok('Kunde ohne Rechnungen: Kunde, Aufträge und Entwürfe ganz gelöscht', async () => {
    const c2 = (await call('customer_save', { body: { name: 'Weg Damit', country: 'DK' } })).j.id;
    const o = await call('order_save', { body: { customer_id: c2, title: 'Tassen', qty: 5, price: '50', currency: 'DKK', pay_status: 'open', processes: [{ process_id: 1, minutes: 30 }] } });
    assert.ok(o.j.ok, JSON.stringify(o.j));
    await call('invoice_save', { body: { customer_id: c2, issue_date: today, lines: [{ description: 'Entwurf', qty: 1, unit_price: '1' }] } });
    const r = (await call('customer_delete', { body: { id: c2, confirm: 'DELETE' } })).j;
    assert.equal(r.mode, 'deleted', JSON.stringify(r)); assert.equal(r.orders, 1);
    assert.equal(JSON.parse(q(`SELECT COUNT(*) n FROM customers WHERE id = ${c2}`))[0].n, 0);
    assert.equal(JSON.parse(q(`SELECT COUNT(*) n FROM orders WHERE customer_id = ${c2}`))[0].n, 0);
    assert.equal(JSON.parse(q(`SELECT COUNT(*) n FROM invoices WHERE customer_id = ${c2}`))[0].n, 0);
  });
  await ok('Testphase: Zurücksetzen löscht Rechnungen/Belege, Nummer startet neu, Sperren bleiben', async () => {
    assert.equal((await call('accounting_reset', { body: {} })).j.error, 'confirm_required');
    const r = (await call('accounting_reset', { body: { confirm: 'RESET' } })).j;
    assert.ok(r.invoices >= 3 && r.expenses >= 1, JSON.stringify(r));
    assert.equal(JSON.parse(q('SELECT COUNT(*) n FROM invoices'))[0].n, 0);
    assert.equal(JSON.parse(q('SELECT COUNT(*) n FROM journal'))[0].n, 0);
    const c3 = (await call('customer_save', { body: { name: 'Neu', address: 'Gade 2', country: 'DK' } })).j.id;
    const id = (await call('invoice_save', { body: { customer_id: c3, issue_date: today, lines: [{ description: 'Echt', qty: 1, unit_price: '100' }] } })).j.id;
    assert.equal((await call('invoice_approve', { body: { id } })).j.number, 1);
    const upd = execFileSync('php', ['-r', `$p=new PDO('sqlite:${data}/auftraege.sqlite');$p->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);try{$p->exec('UPDATE invoices SET total = 1 WHERE id = ${id}');echo 'OK';}catch(Throwable $e){echo $e->getMessage();}`]).toString();
    assert.match(upd, /locked/, 'Sperr-Trigger wieder aktiv');
    assert.equal((await call('journal_verify')).j.ok, true);
  });

  await ok('Echtbetrieb starten sperrt Zurücksetzen für immer', async () => {
    assert.equal((await call('me')).j.live, false);
    assert.ok((await call('go_live', { body: { confirm: 'LIVE' } })).j.ok);
    assert.equal((await call('me')).j.live, true);
    assert.equal((await call('accounting_reset', { body: { confirm: 'RESET' } })).j.error, 'live_locked');
  });
} finally {
  srv.kill(); mock.close();
  rmSync(data, { recursive: true, force: true });
  console.log(`\n${passed} Tests bestanden${process.exitCode ? ', FEHLER siehe oben' : ''}`);
}
