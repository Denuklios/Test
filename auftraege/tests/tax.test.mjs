// Integrationstest Moms-Cockpit: Momsangivelse-Felder, EU-Salgsliste, Fristen, Sperre gemeldeter Zeiträume, Revisor-Paket.
// Aufruf: node auftraege/tests/tax.test.mjs
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = mkdtempSync(join(tmpdir(), 'wf-tax-'));
const PORT = 8089, B = `http://127.0.0.1:${PORT}`;
const srv = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', root], { env: { ...process.env, WF_TEST_DATA_DIR: data, WF_OFFLINE: '1' }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));

let cookie = '', csrf = '';
async function call(a, { params = {}, body } = {}) {
  const h = { cookie };
  const opt = { headers: h };
  if (body) { opt.method = 'POST'; h['content-type'] = 'application/json'; h['x-csrf-token'] = csrf; opt.body = JSON.stringify(body); }
  const r = await fetch(`${B}/api.php?${new URLSearchParams({ a, ...params })}`, opt);
  return { status: r.status, j: await r.json().catch(() => ({})), r };
}
let passed = 0;
const ok = (name, fn) => fn().then(() => { passed++; console.log('  ✓', name); }).catch((e) => { console.error('  ✗', name, '\n', e.message); process.exitCode = 1; });
const sql = (q) => execFileSync('php', ['-r', `$p=new PDO('sqlite:${data}/auftraege.sqlite');$p->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);try{$p->exec(${JSON.stringify(q)});echo 'OK';}catch(Throwable $e){echo $e->getMessage();}`]).toString();

// letztes abgeschlossenes Halbjahr relativ zu heute
const now = new Date(), Y = now.getFullYear();
const [PF, PT] = now.getMonth() >= 6 ? [`${Y}-01-01`, `${Y}-06-30`] : [`${Y - 1}-07-01`, `${Y - 1}-12-31`];
const D = (m, d) => `${PF.slice(0, 4)}-${String(+PF.slice(5, 7) + m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const NEXT = new Date(new Date(PT + 'T00:00:00Z').getTime() + 864e5).toISOString().slice(0, 10);

try {
  const r0 = await fetch(`${B}/api.php?a=me&dev=7`); cookie = r0.headers.get('set-cookie').split(';')[0];
  csrf = (await call('me')).j.csrf;
  await call('company_save', { body: { name: 'Wunsch-Fabrik', street: 'Vej 1', zip: '6330', city: 'Padborg', cvr: '12345674', iban: 'DK5000400440116243', moms_registered: true, moms_period: 'half', pay_days: 8 } });
  const dk = (await call('customer_save', { body: { name: 'Jens', address: 'Gade 1', country: 'DK' } })).j.id;
  const de = (await call('customer_save', { body: { name: 'Max', company: 'Muster GmbH', address: 'Str. 1, Flensburg', country: 'DE', vat_id: 'DE123456789', is_business: 1 } })).j.id;
  const no = (await call('customer_save', { body: { name: 'Ola', address: 'Gate 1, Oslo', country: 'NO' } })).j.id;
  const inv = async (cid, date, lines, extra = {}) => { const r = await call('invoice_save', { body: { customer_id: cid, issue_date: date, lines, ...extra } }); const a = await call('invoice_approve', { body: { id: r.j.id } }); assert.ok(a.j.number, JSON.stringify(a.j)); return r.j.id; };
  const exp = async (b) => { const r = await call('expense_save', { body: { no_receipt: 'Test', ...b } }); const a = await call('expense_approve', { body: { id: r.j.id } }); assert.ok(a.j.number, JSON.stringify(a.j)); return r.j.id; };

  await ok('Beispielhalbjahr buchen (DK, EU-Firma Ware+Leistung, Export, Kreditnota, 4 Arten Ausgaben)', async () => {
    const i1 = await inv(dk, D(2, 10), [{ description: 'Shirts', qty: 10, unit_price: '100' }]);
    await inv(de, D(3, 5), [{ description: 'Ware', qty: 1, unit_price: '2000', kind: 'goods' }, { description: 'Stick', qty: 1, unit_price: '500', kind: 'services' }]);
    await inv(no, D(4, 1), [{ description: 'Export', qty: 1, unit_price: '300' }]);
    const c = await call('invoice_credit', { body: { id: i1 } });
    await call('invoice_save', { body: { id: c.j.id, issue_date: D(4, 2), lines: [{ description: 'Gutschrift', qty: 2, unit_price: '100' }] } });
    assert.ok((await call('invoice_approve', { body: { id: c.j.id } })).j.number);
    await exp({ date: D(2, 15), supplier: 'Garn', category: 'material', gross: '125', vat: '25', vat_mode: 'dk' });
    await exp({ date: D(2, 16), supplier: 'Stoff GmbH', supplier_country: 'DE', category: 'material', gross: '400', vat_mode: 'eu_goods' });
    await exp({ date: D(2, 17), supplier: 'Adobe US', supplier_country: 'US', category: 'software', gross: '100', vat_mode: 'rc_services' });
    await exp({ date: D(2, 18), supplier: 'Canva IE', supplier_country: 'IE', category: 'software', gross: '80', vat_mode: 'rc_services' });
  });
  await ok('Momsangivelse: alle TastSelv-Felder und Momstilsvar exakt', async () => {
    const r = (await call('tax_report', { params: { from: PF, to: PT } })).j.report;
    assert.equal(r.salgsmoms, 20000); assert.equal(r.moms_varekoeb_udland, 10000); assert.equal(r.moms_ydelseskoeb_udland, 4500); assert.equal(r.koebsmoms, 17000);
    assert.equal(r.rubrik_a_varer, 40000); assert.equal(r.rubrik_a_ydelser, 8000, 'nur EU-Dienstleistungen');
    assert.equal(r.rubrik_b_varer, 200000); assert.equal(r.rubrik_b_ydelser, 50000); assert.equal(r.rubrik_c, 30000); assert.equal(r.momstilsvar, 17500);
    assert.deepEqual(r.eu_sales.map((x) => [x.vat_id, x.goods, x.services]), [['DE123456789', 200000, 50000]]);
  });
  await ok('Cockpit: Zeiträume mit Frist (1. des 3. Monats, Wochenende verschoben), Warnungen', async () => {
    const o = (await call('tax_overview', { params: { year: PT.slice(0, 4) } })).j;
    const p = o.periods.find((x) => x.from === PF);
    const raw = PT.slice(5, 7) === '06' ? `${PT.slice(0, 4)}-09-01` : `${+PT.slice(0, 4) + 1}-03-01`;
    assert.ok(p.deadline >= raw && p.deadline <= raw.slice(0, 8) + '03'); assert.ok(['due', 'overdue'].includes(p.state));
    const codes = o.warnings.map((w) => w.code);
    assert.ok(codes.includes('backup')); assert.ok(codes.includes('eu_sales_due')); assert.ok(codes.includes(p.state === 'due' ? 'vat_due' : 'vat_overdue'));
    const before = o.periods.filter((x) => x.to < PF); assert.ok(before.length && before.every((x) => x.state === 'none'), 'vor der ersten Buchung keine Mahnung');
    assert.equal(o.warnings.filter((w) => w.code.startsWith('vat_')).length, 1);
    const q = o.eu_quarters[0]; assert.equal(q.sales[0].goods, 200000); assert.match(q.eu_deadline, /-2[5-7]$/);
    await call('eu_sales_mark', { body: { from: q.from } });
    assert.ok(!(await call('tax_overview', { params: { year: PT.slice(0, 4) } })).j.warnings.some((w) => w.code === 'eu_sales_due'));
  });
  await ok('Als gemeldet markieren: Entwürfe im Zeitraum werden gemeldet, danach Zahlen eingefroren und Zeitraum gesperrt', async () => {
    const d = await call('expense_save', { body: { date: D(5, 1), supplier: 'Entwurf', gross: '50', vat: '10', vat_mode: 'dk' } });
    const m = await call('vat_return_mark', { body: { from: PF, to: PT } }); assert.equal(m.j.error, 'period_drafts'); assert.equal(m.j.detail, '1');
    assert.equal((await call('vat_return_mark', { body: { from: PF, to: PT, ignore_drafts: 1 } })).status, 200);
    assert.equal((await call('vat_return_mark', { body: { from: PF, to: PT, ignore_drafts: 1 } })).j.error, 'period_locked');
    assert.match(sql('DELETE FROM vat_returns'), /period_locked/);
    // Ausgabe mit altem Datum zaehlt im naechsten Zeitraum
    await call('expense_save', { body: { id: d.j.id, date: D(5, 1), supplier: 'Nachzügler', gross: '50', vat: '10', vat_mode: 'dk', no_receipt: 'x' } });
    await call('expense_approve', { body: { id: d.j.id } });
    assert.equal((await call('expense', { params: { id: d.j.id } })).j.expense.vat_date, NEXT);
    const r = await call('tax_report', { params: { from: PF, to: PT } }); assert.equal(r.j.report.koebsmoms, 17000); assert.equal(r.j.reported.momstilsvar, 17500);
    // Rechnung mit Datum im gemeldeten Zeitraum geht nicht mehr
    const x = await call('invoice_save', { body: { customer_id: dk, issue_date: D(5, 20), lines: [{ description: 'x', qty: 1, unit_price: '10' }] } });
    assert.equal((await call('invoice_approve', { body: { id: x.j.id } })).j.error, 'period_reported');
    assert.equal((await call('vat_return_mark', { body: { from: PF, to: '2099-12-31' } })).j.error, 'bad_period');
  });
  await ok('Revisor-Paket: ZIP mit CSVs, Rechnungen als HTML, Journal und Kontrolle', async () => {
    const r = await fetch(`${B}/api.php?a=revisor_zip&year=${PF.slice(0, 4)}`, { headers: { cookie } });
    assert.equal(r.headers.get('content-type'), 'application/zip');
    const f = join(data, 'rev.zip'); writeFileSync(f, Buffer.from(await r.arrayBuffer()));
    const list = execFileSync('unzip', ['-l', f]).toString();
    for (const n of ['fakturaer.csv', 'fakturalinjer.csv', 'betalinger.csv', 'udgifter.csv', 'bank.csv', 'momsangivelser.csv', 'journal.csv', 'LÆS MIG.txt', 'fakturaer/Faktura-1.html', 'fakturaer/Kreditnota-4.html']) assert.ok(list.includes(n), n);
    const readme = execFileSync('unzip', ['-p', f, 'LÆS MIG.txt']).toString(); assert.match(readme, /Kontrol af kæde: OK/);
    const html = execFileSync('unzip', ['-p', f, 'fakturaer/Faktura-1.html']).toString(); assert.match(html, /data:image\/png;base64/); assert.doesNotMatch(html, /class="bar"/);
    const csv = execFileSync('unzip', ['-p', f, 'momsangivelser.csv']).toString(); assert.match(csv, /"175,00"/);
  });
  await ok('Backup ziehen → Backup-Erinnerung verschwindet', async () => {
    await fetch(`${B}/api.php?a=backup`, { headers: { cookie } });
    const o = (await call('tax_overview', { params: { year: PT.slice(0, 4) } })).j;
    assert.ok(!o.warnings.some((w) => w.code === 'backup'));
  });
} finally {
  srv.kill();
  await new Promise((r) => setTimeout(r, 200));
  rmSync(data, { recursive: true, force: true });
  console.log(`\n${passed} Tests bestanden${process.exitCode ? ', FEHLER siehe oben' : ''}`);
}
