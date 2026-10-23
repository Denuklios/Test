// Integrationstest Ausgaben + Kontoauszug: Købsmoms, Bogføren (Sperre), Storno, Lunar-CSV, automatischer Abgleich.
// Aufruf: node auftraege/tests/expense.test.mjs
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = mkdtempSync(join(tmpdir(), 'wf-exp-'));
const PORT = 8096, B = `http://127.0.0.1:${PORT}`;
// Nachbau der Messages-API: prueft Header/Anfrage und antwortet wie die echte API mit strukturiertem JSON
import { createServer } from 'node:http';
let aiReq = null;
const mock = createServer((req, res) => {
  let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => {
    aiReq = { headers: req.headers, body: JSON.parse(b) };
    if (req.headers['x-api-key'] !== 'sk-ant-test-0123456789abcdefghijkl') { res.writeHead(401); return res.end('{}'); }
    const out = { is_receipt: true, supplier: 'Bauhaus Flensburg', supplier_country: 'DK', supplier_vat: '', doc_no: '4711', date: new Date(Date.now() - 864e5).toISOString().slice(0, 10), currency: 'DKK',
      total: '249.95', vat: '49.99', vat_mode: 'dk', is_paid: true, category: 'tools', description: 'Schraubzwingen', confident: true, notes: '' };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(out) }] }));
  });
}).listen(8095);
const srv = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', root], { env: { ...process.env, WF_TEST_DATA_DIR: data, WF_OFFLINE: '1', WF_AI_URL: 'http://127.0.0.1:8095/v1/messages' }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));

let cookie = '', csrf = '';
async function call(a, { params = {}, body, form } = {}) {
  const h = { cookie };
  const opt = { headers: h };
  if (body) { opt.method = 'POST'; h['content-type'] = 'application/json'; h['x-csrf-token'] = csrf; opt.body = JSON.stringify(body); }
  if (form) { opt.method = 'POST'; h['x-csrf-token'] = csrf; opt.body = form; }
  const r = await fetch(`${B}/api.php?${new URLSearchParams({ a, ...params })}`, opt);
  return { status: r.status, j: await r.json().catch(() => ({})) };
}
let passed = 0;
const ok = (name, fn) => fn().then(() => { passed++; console.log('  ✓', name); }).catch((e) => { console.error('  ✗', name, '\n', e.message); process.exitCode = 1; });
const sql = (q) => execFileSync('php', ['-r', `$p=new PDO('sqlite:${data}/auftraege.sqlite');$p->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);try{$p->exec(${JSON.stringify(q)});echo 'OK';}catch(Throwable $e){echo $e->getMessage();}`]).toString();
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const upload = (extra = {}) => { const f = new FormData(); f.append('file', new Blob([PNG], { type: 'image/png' }), 'bon.png'); for (const [k, v] of Object.entries(extra)) f.append(k, v); return call('expense_upload', { form: f }); };
const iso = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

try {
  const r0 = await fetch(`${B}/api.php?a=me&dev=7`); cookie = r0.headers.get('set-cookie').split(';')[0];
  const me = await call('me'); csrf = me.j.csrf;
  assert.ok(me.j.exp_categories.material); assert.equal(me.j.ai_enabled, false);
  let e1, e2, inv;

  await ok('Beleg-Foto → Entwurf; Bogføren: Bilag 1, abziehbare Moms 25,00', async () => {
    const u = await upload(); e1 = u.j.id; assert.ok(e1); assert.equal(u.j.ai, null);
    const s = await call('expense_save', { body: { id: e1, date: iso(-2), supplier: 'Garnhuset ApS', category: 'material', gross: '125,00', vat: '25,00', vat_mode: 'dk', currency: 'DKK' } });
    assert.equal(s.j.calc.deduct_dkk, 2500); assert.equal(s.j.calc.net_dkk, 10000);
    assert.equal((await call('expense_approve', { body: { id: e1 } })).j.number, 1);
    const e = (await call('expense', { params: { id: e1 } })).j.expense; assert.equal(e.status, 'final'); assert.match(e.hash, /^[0-9a-f]{64}$/);
    const f = await fetch(`${B}/file.php?exp=${e1}`, { headers: { cookie } }); assert.equal(f.headers.get('content-type'), 'image/png');
  });
  await ok('Gebucht = gesperrt (App + Datenbank); nur Zahlungsdatum änderbar', async () => {
    assert.equal((await call('expense_save', { body: { id: e1, supplier: 'X', gross: '1' } })).j.error, 'expense_locked');
    assert.equal((await call('expense_delete', { body: { id: e1 } })).j.error, 'expense_locked');
    assert.match(sql(`UPDATE expenses SET gross = 1 WHERE id = ${e1}`), /expense_locked/);
    assert.match(sql(`DELETE FROM expenses WHERE id = ${e1}`), /expense_locked/);
    assert.equal(sql(`UPDATE expenses SET paid_date = '${iso(-1)}' WHERE id = ${e1}`), 'OK');
    await call('expense_paid', { body: { id: e1, paid_date: '' } });
  });
  await ok('Ohne Beleg nur mit Begründung; Moms über 20 % des Betrags abgelehnt', async () => {
    const s = await call('expense_save', { body: { date: iso(-1), supplier: 'Parkautomat', category: 'parking', gross: '30', vat: '6', vat_mode: 'dk' } });
    assert.equal((await call('expense_approve', { body: { id: s.j.id } })).j.error, 'receipt_missing');
    await call('expense_save', { body: { id: s.j.id, date: iso(-1), supplier: 'Parkautomat', category: 'parking', gross: '30', vat: '6', vat_mode: 'dk', no_receipt: 'Automat ohne Quittung' } });
    assert.equal((await call('expense_approve', { body: { id: s.j.id } })).j.number, 2);
    const t = await call('expense_save', { body: { date: iso(-1), supplier: 'Falsch', gross: '100', vat: '25', vat_mode: 'dk', no_receipt: 'x' } });
    assert.equal((await call('expense_approve', { body: { id: t.j.id } })).j.error, 'vat_too_high');
    await call('expense_delete', { body: { id: t.j.id } });
  });
  await ok('EU-Wareneinkauf in EUR: Erwerbsmoms 25 % in DKK, voll abziehbar', async () => {
    const s = await call('expense_save', { body: { date: iso(-1), supplier: 'Stoff GmbH', supplier_country: 'DE', category: 'material', gross: '100', vat: '0', vat_mode: 'eu_goods', currency: 'EUR', rate: '7,46', no_receipt: 'Test' } });
    assert.equal(s.j.calc.gross_dkk, 74600); assert.equal(s.j.calc.rc_vat_dkk, 18650); assert.equal(s.j.calc.deduct_dkk, 18650);
    await call('expense_delete', { body: { id: s.j.id } });
  });
  await ok('Bewirtung 25 %, Telefon gemischt nach Firmenanteil, Versicherung ohne Moms', async () => {
    const a = await call('expense_save', { body: { date: iso(-1), supplier: 'Restaurant', category: 'meals', gross: '500', vat: '100', vat_mode: 'dk' } }); assert.equal(a.j.calc.deduct_dkk, 2500);
    await call('company_save', { body: { ...me.j.company, phone_share: 40 } });
    const b = await call('expense_save', { body: { date: iso(-1), supplier: 'Telmore', category: 'phone_mixed', gross: '250', vat: '50', vat_mode: 'dk' } }); assert.equal(b.j.calc.vat_share, 40); assert.equal(b.j.calc.deduct_dkk, 2000);
    const c = await call('expense_save', { body: { date: iso(-1), supplier: 'Tryg', category: 'insurance', gross: '1200', vat: '0', vat_mode: 'none' } }); assert.equal(c.j.calc.deduct_dkk, 0);
    for (const x of [a, b, c]) await call('expense_delete', { body: { id: x.j.id } });
  });
  await ok('Storno: Gegenbuchung mit eigener Bilagsnummer, nur einmal möglich', async () => {
    const r = await call('expense_reverse', { body: { id: e1, reason: 'doppelt erfasst' } }); assert.equal(r.status, 200);
    const x = (await call('expense', { params: { id: r.j.id } })).j.expense;
    assert.equal(x.gross, -12500); assert.equal(x.deduct_dkk, -2500); assert.equal(x.number, 3); assert.equal(x.reverses, e1);
    assert.equal((await call('expense_reverse', { body: { id: e1 } })).j.error, 'already_reversed');
  });
  await ok('Lunar-CSV: Import, doppelte Zeilen ignoriert, Eingang mit Rechnungsnr. und Ausgabe automatisch zugeordnet', async () => {
    await call('company_save', { body: { name: 'WF', street: 'Vej 1', zip: '6330', city: 'Padborg', cvr: '12345674', iban: 'DK5000400440116243', moms_registered: true, pay_days: 8 } });
    const c = (await call('customer_save', { body: { name: 'Jens', address: 'Gade 1', country: 'DK' } })).j.id;
    inv = (await call('invoice_save', { body: { customer_id: c, issue_date: iso(-3), lines: [{ description: 'Shirts', qty: 10, unit_price: '100' }] } })).j.id;
    const num = (await call('invoice_approve', { body: { id: inv } })).j.number;
    const s = await call('expense_save', { body: { date: iso(-2), supplier: 'Folie Shop', category: 'material', gross: '437,50', vat: '87,50', vat_mode: 'dk', no_receipt: 'per Mail' } });
    e2 = s.j.id; await call('expense_approve', { body: { id: e2 } });
    const d = (x) => x.split('-').reverse().join('-');
    const csv = `"Dato";"Tekst";"Beløb";"Saldo"\n"${d(iso(-1))}";"Indbetaling Jens faktura ${num}";"1.250,00";"5.000,00"\n"${d(iso(-1))}";"Folie Shop";"-437,50";"4.562,50"\n"${d(iso(0))}";"Overførsel til privat";"-2.000,00";"2.562,50"\n"${d(iso(0))}";"Netto";"-89,95";"2.472,55"\n`;
    const f = new FormData(); f.append('file', new Blob([csv], { type: 'text/csv' }), 'lunar.csv');
    const r = await call('bank_import', { form: f }); assert.equal(r.j.rows, 4); assert.equal(r.j.added, 4); assert.equal(r.j.auto, 2);
    const f2 = new FormData(); f2.append('file', new Blob([csv], { type: 'text/csv' }), 'lunar.csv');
    assert.equal((await call('bank_import', { form: f2 })).j.added, 0);
    assert.equal((await call('invoice', { params: { id: inv } })).j.invoice.balance.open, 0);
    assert.equal((await call('expense', { params: { id: e2 } })).j.expense.paid_date, iso(-1));
    const b = (await call('bank')).j; assert.equal(b.open, 2);
  });
  await ok('Offene Bewegungen: Privatentnahme markieren, Ausgabe aus Bewegung anlegen', async () => {
    const open = (await call('bank')).j.tx;
    const priv = open.find((t) => t.amount === -200000), netto = open.find((t) => t.amount === -8995);
    assert.equal((await call('bank_match', { body: { tx_id: priv.id, type: 'private' } })).status, 200);
    const x = await call('bank_to_expense', { body: { tx_id: netto.id } });
    const e = (await call('expense', { params: { id: x.j.id } })).j.expense; assert.equal(e.gross, 8995); assert.equal(e.paid_date, iso(0)); assert.equal(e.status, 'draft');
    assert.equal((await call('bank')).j.open, 0);
    await call('expense_delete', { body: { id: x.j.id } });
    assert.equal((await call('bank')).j.open, 1, 'Entwurf gelöscht → Bewegung wieder offen');
  });
  await ok('Zuordnung lösen: Zahlung der Rechnung wird per Gegenbuchung storniert', async () => {
    const all = (await call('bank', { params: { show: 'all' } })).j.tx; const t = all.find((x) => x.match_type === 'invoice');
    assert.equal((await call('bank_unmatch', { body: { tx_id: t.id } })).status, 200);
    assert.equal((await call('invoice', { params: { id: inv } })).j.invoice.balance.open, 125000);
    const cand = (await call('bank')).j.tx.find((x) => x.id === t.id).candidates; assert.equal(cand[0].id, inv);
  });
  await ok('Belegerkennung: Schlüssel prüfen, Anfrage an Claude, Felder automatisch ausgefüllt', async () => {
    assert.equal((await call('ai_key_save', { body: { key: 'falsch' } })).j.error, 'ai_bad_key');
    await call('ai_key_save', { body: { key: 'sk-ant-test-0123456789abcdefghijkl' } });
    assert.equal((await call('me')).j.ai_enabled, true);
    const u = await upload({ scan: '1' }); assert.equal(u.j.ai_error, null); assert.equal(u.j.ai.confident, true);
    assert.equal(aiReq.headers['anthropic-version'], '2026-10-21'); assert.equal(aiReq.body.model, 'claude-opus-5-5');
    assert.equal(aiReq.body.output_config.format.type, 'json_schema'); assert.equal(aiReq.body.messages[0].content[0].type, 'image');
    assert.equal(aiReq.headers['anthropic-beta'], 'server-side-fallback-2026-07-01'); assert.equal(aiReq.body.fallbacks, 'default');
    const e = (await call('expense', { params: { id: u.j.id } })).j.expense;
    assert.equal(e.supplier, 'Bauhaus Flensburg'); assert.equal(e.gross, 24995); assert.equal(e.vat, 4999); assert.equal(e.category, 'tools'); assert.equal(e.paid_date, e.date); assert.equal(e.ai_model, 'claude-opus-5-5');
    await call('ai_key_save', { body: { key: 'sk-ant-wrong-0123456789abcdefghijkl' } });
    assert.equal((await upload({ scan: '1' })).j.ai_error, 'ai_bad_key');
  });
  await ok('Prüfkette umfasst Ausgaben inkl. Beleg-Datei', async () => {
    const r = await call('journal_verify'); assert.equal(r.j.ok, true, JSON.stringify(r.j.problems)); assert.equal(r.j.expenses, 4);
  });
} finally {
  srv.kill(); mock.close();
  await new Promise((r) => setTimeout(r, 200));
  rmSync(data, { recursive: true, force: true });
  console.log(`\n${passed} Tests bestanden${process.exitCode ? ', FEHLER siehe oben' : ''}`);
}
