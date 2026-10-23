// Integrationstest Rechnungen: Moms-Regeln, Nummernfolge, Festschreiben (Sperre per Trigger), Zahlungen, Kreditnota, Journal.
// Aufruf: node auftraege/tests/invoice.test.mjs  (offline: Kurse/VIES werden nicht abgefragt)
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = mkdtempSync(join(tmpdir(), 'wf-inv-'));
const PORT = 8098, B = `http://127.0.0.1:${PORT}`;
const srv = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', root], { env: { ...process.env, WF_TEST_DATA_DIR: data, WF_OFFLINE: '1' }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));

let cookie = '', csrf = '';
async function call(a, { params = {}, body } = {}) {
  const h = { cookie };
  const opt = { headers: h };
  if (body) { opt.method = 'POST'; h['content-type'] = 'application/json'; h['x-csrf-token'] = csrf; opt.body = JSON.stringify(body); }
  const r = await fetch(`${B}/api.php?${new URLSearchParams({ a, ...params })}`, opt);
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  return { status: r.status, j: await r.json().catch(() => ({})) };
}
let passed = 0;
const ok = (name, fn) => fn().then(() => { passed++; console.log('  ✓', name); }).catch((e) => { console.error('  ✗', name, '\n', e.message); process.exitCode = 1; });
const sql = (q) => execFileSync('php', ['-r', `$p=new PDO('sqlite:${data}/auftraege.sqlite');$p->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);try{$p->exec(${JSON.stringify(q)});echo 'OK';}catch(Throwable $e){echo $e->getMessage();}`]).toString();
const today = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const iso = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
// gueltige CVR erzeugen (Modulo 11)
function cvr(seed) { const w = [2, 7, 6, 5, 4, 3, 2]; for (let x = seed; ; x++) { const d = String(x).padStart(7, '0'); const s = [...d].reduce((a, c, i) => a + +c * w[i], 0); const chk = (11 - s % 11) % 11; if (chk < 10) return d + chk; } }

try {
  const r0 = await fetch(`${B}/api.php?a=me&dev=7`); cookie = r0.headers.get('set-cookie').split(';')[0];
  const me = await call('me'); csrf = me.j.csrf;
  let dk, de, deP, no, inv1, inv2;
  const L = [{ description: 'Poloshirt bestickt', qty: 3, unit: 'stk', unit_price: '100,00', discount: 0 }, { description: 'Logo-Digitalisierung', qty: 1, unit: 'stk', unit_price: '50,50', discount: 10, kind: 'services' }];

  await ok('Firmendaten: unvollständig gemeldet, CVR/IBAN geprüft', async () => {
    assert.deepEqual(me.j.company_missing, ['name', 'street', 'zip', 'city', 'cvr', 'bank']);
    assert.equal((await call('company_save', { body: { cvr: '12345678' } })).j.error, 'bad_cvr');
    assert.equal((await call('company_save', { body: { cvr: cvr(1234567), iban: 'DK5000400440116244' } })).j.error, 'bad_iban');
    const r = await call('company_save', { body: { name: 'Wunsch-Fabrik', street: 'Testvej 1', zip: '6330', city: 'Padborg', cvr: cvr(1234567), iban: 'DK50 0040 0440 1162 43', bic: 'nykbdkkk', moms_registered: true, pay_days: 8, invoice_start: 1000 } });
    assert.equal(r.status, 200); assert.deepEqual(r.j.missing, []); assert.equal(r.j.company.iban, 'DK5000400440116243'); assert.equal(r.j.company.bic, 'NYKBDKKK');
  });
  await ok('Kunden mit Land/USt-ID: DK-CVR geprüft, EU-Nummer normalisiert', async () => {
    assert.equal((await call('customer_save', { body: { name: 'X', country: 'DK', vat_id: '12345678', is_business: 1 } })).j.error, 'bad_cvr');
    dk = (await call('customer_save', { body: { name: 'Hans Hansen', address: 'Storegade 1, 6200 Aabenraa', country: 'DK' } })).j.id;
    de = (await call('customer_save', { body: { name: 'Max Muster', company: 'Muster GmbH', address: 'Hauptstr. 5, 24937 Flensburg', country: 'DE', vat_id: 'de 123 456 789', is_business: 1 } })).j.id;
    deP = (await call('customer_save', { body: { name: 'Erika Privat', address: 'Weg 2, 24939 Flensburg', country: 'DE' } })).j.id;
    no = (await call('customer_save', { body: { name: 'Ola Nordmann', address: 'Gate 3, 0150 Oslo', country: 'NO', currency: 'EUR' } })).j.id;
    const c = (await call('customer', { params: { id: de } })).j.customer;
    assert.equal(c.vat_id, 'DE123456789'); assert.equal(c.country, 'DE'); assert.equal(+c.is_business, 1);
  });
  await ok('Entwurf DK: Beträge in Øre exakt (Rabatt, 25 % Moms), Sprache Dänisch', async () => {
    const r = await call('invoice_save', { body: { customer_id: dk, lines: L } });
    inv1 = r.j.id; const c = r.j.calc;
    assert.equal(r.j.vat_scheme, 'dk'); assert.deepEqual(c.amounts, [30000, 4545]); assert.equal(c.net, 34545); assert.equal(c.vat, 8636); assert.equal(c.total, 43181);
    const i = (await call('invoice', { params: { id: inv1 } })).j.invoice;
    assert.equal(i.lang, 'da'); assert.equal(i.due_date, iso(8)); assert.equal(i.status, 'draft'); assert.equal(i.number, null);
  });
  await ok('Preise inkl. Moms: 125,00 → 100,00 netto + 25,00 Moms', async () => {
    const r = await call('invoice_calc', { body: { vat_scheme: 'dk', prices_incl: 1, lines: [{ description: 'x', qty: 1, unit_price: '125' }] } });
    assert.equal(r.j.calc.net, 10000); assert.equal(r.j.calc.vat, 2500); assert.equal(r.j.calc.total, 12500);
  });
  await ok('Moms-Regel automatisch: EU-Firma mit USt-ID = Reverse Charge, EU-privat = 25 %, Norwegen = Export', async () => {
    const a = await call('invoice_save', { body: { customer_id: de, lines: L } }); assert.equal(a.j.vat_scheme, 'eu_rc'); assert.equal(a.j.calc.vat, 0);
    const b = await call('invoice_save', { body: { customer_id: deP, lines: L } }); assert.equal(b.j.vat_scheme, 'eu_b2c'); assert.equal(b.j.calc.vat, 8636);
    const c = await call('invoice_save', { body: { customer_id: no, currency: 'EUR', rate: '7,46', lines: L } }); assert.equal(c.j.vat_scheme, 'export'); assert.equal(c.j.calc.net_dkk, Math.round(34545 * 7.46));
    assert.equal((await call('invoice', { params: { id: a.j.id } })).j.invoice.lang, 'de');
    assert.equal((await call('invoice', { params: { id: c.j.id } })).j.invoice.lang, 'en');
    for (const id of [a.j.id, b.j.id, c.j.id]) assert.equal((await call('invoice_delete', { body: { id } })).status, 200);
  });
  await ok('Reverse Charge von Hand ohne USt-ID wird beim Festschreiben abgelehnt', async () => {
    const r = await call('invoice_save', { body: { customer_id: deP, vat_scheme: 'eu_rc', lines: L } });
    assert.equal((await call('invoice_approve', { body: { id: r.j.id } })).j.error, 'vat_id_required');
    await call('invoice_delete', { body: { id: r.j.id } });
  });
  await ok('Datum in der Zukunft darf nicht festgeschrieben werden', async () => {
    const r = await call('invoice_save', { body: { customer_id: dk, issue_date: iso(2), lines: L } });
    assert.equal((await call('invoice_approve', { body: { id: r.j.id } })).j.error, 'issue_in_future');
    await call('invoice_delete', { body: { id: r.j.id } });
  });
  await ok('Festschreiben: Startnummer 1000, dann 1001 lückenlos; Startnummer danach gesperrt', async () => {
    const a = await call('invoice_approve', { body: { id: inv1 } }); assert.equal(a.j.number, 1000);
    inv2 = (await call('invoice_save', { body: { customer_id: de, lines: L } })).j.id;
    assert.equal((await call('invoice_approve', { body: { id: inv2 } })).j.number, 1001);
    const c = await call('company_save', { body: { ...(await call('me')).j.company, invoice_start: 5 } });
    assert.equal(c.j.company.invoice_start, 1000);
  });
  await ok('Festgeschrieben = unveränderbar (App und direkt in der Datenbank)', async () => {
    assert.equal((await call('invoice_save', { body: { id: inv1, customer_id: dk, lines: L } })).j.error, 'invoice_locked');
    assert.equal((await call('invoice_delete', { body: { id: inv1 } })).j.error, 'invoice_locked');
    assert.match(sql(`UPDATE invoices SET total = 1 WHERE id = ${inv1}`), /invoice_locked/);
    assert.match(sql(`DELETE FROM invoices WHERE id = ${inv1}`), /invoice_locked/);
    assert.match(sql(`UPDATE invoice_lines SET unit_price = 1 WHERE invoice_id = ${inv1}`), /invoice_locked/);
    assert.match(sql(`INSERT INTO invoice_lines (invoice_id,pos,description) VALUES (${inv1},9,'x')`), /invoice_locked/);
    assert.match(sql(`DELETE FROM journal`), /journal_locked/);
    assert.equal(sql(`UPDATE invoices SET sent_at = datetime('now') WHERE id = ${inv1}`), 'OK', 'nur "versendet" darf gesetzt werden');
  });
  await ok('Kunden- und Firmendaten sind auf der Rechnung eingefroren', async () => {
    await call('customer_save', { body: { id: dk, name: 'Hans Neu', address: 'Ny vej 9', country: 'DK' } });
    const i = (await call('invoice', { params: { id: inv1 } })).j.invoice;
    assert.equal(i.customer_snap.name, 'Hans Hansen'); assert.equal(i.seller_snap.city, 'Padborg'); assert.match(i.hash, /^[0-9a-f]{64}$/);
  });
  await ok('Rechnungsdatum vor der letzten Rechnung wird abgelehnt', async () => {
    const r = await call('invoice_save', { body: { customer_id: dk, issue_date: iso(-3), lines: L } });
    assert.equal((await call('invoice_approve', { body: { id: r.j.id } })).j.error, 'issue_before_last');
    await call('invoice_delete', { body: { id: r.j.id } });
  });
  await ok('Zahlungen: Teil → offen, Rest → bezahlt, Storno per Gegenbuchung, nichts löschbar', async () => {
    let r = await call('invoice_pay', { body: { id: inv1, amount: '200,00', method: 'mobilepay' } }); assert.equal(r.j.balance.open, 23181);
    let l = (await call('invoices', { params: { state: 'open' } })).j.invoices; assert.ok(l.some((x) => x.id === inv1));
    r = await call('invoice_pay', { body: { id: inv1, amount: '231,81' } }); assert.equal(r.j.balance.open, 0);
    l = (await call('invoices')).j.invoices; assert.equal(l.find((x) => x.id === inv1).state, 'paid');
    const pays = (await call('invoice', { params: { id: inv1 } })).j.invoice.payments;
    assert.equal((await call('invoice_pay_reverse', { body: { payment_id: pays[1].id } })).status, 200);
    assert.equal((await call('invoice_pay_reverse', { body: { payment_id: pays[1].id } })).status, 404, 'doppelt stornieren geht nicht');
    assert.equal((await call('invoice', { params: { id: inv1 } })).j.invoice.balance.open, 23181);
    assert.match(sql(`DELETE FROM invoice_payments`), /payment_locked/);
  });
  await ok('Kreditnota: übernimmt Rechnung, eigene Nummer, mindert offenen Betrag, nicht mehr als Rechnungsbetrag', async () => {
    const c = await call('invoice_credit', { body: { id: inv1 } }); assert.equal(c.status, 200);
    assert.equal((await call('invoice_credit', { body: { id: inv1 } })).j.error, 'credit_draft_exists');
    const cr = (await call('invoice', { params: { id: c.j.id } })).j.invoice;
    assert.equal(cr.type, 'credit'); assert.equal(cr.credit_of_number, 1000); assert.equal(cr.vat_scheme, 'dk'); assert.equal(cr.lines.length, 2);
    // nur 1 Shirt gutschreiben: 100 + 25 Moms
    await call('invoice_save', { body: { id: c.j.id, lines: [{ description: 'Poloshirt bestickt (Reklamation)', qty: 1, unit_price: '100' }] } });
    assert.equal((await call('invoice_approve', { body: { id: c.j.id } })).j.number, 1002);
    assert.equal((await call('invoice', { params: { id: inv1 } })).j.invoice.balance.open, 23181 - 12500);
    const c2 = await call('invoice_credit', { body: { id: inv1 } });
    await call('invoice_save', { body: { id: c2.j.id, lines: [{ description: 'zu viel', qty: 10, unit_price: '100' }] } });
    assert.equal((await call('invoice_approve', { body: { id: c2.j.id } })).j.error, 'credit_too_high');
    await call('invoice_delete', { body: { id: c2.j.id } });
  });
  await ok('Fremdwährung ohne Kurs (offline) kann nicht festgeschrieben werden; mit Kurs: Moms auch in DKK', async () => {
    const r = await call('invoice_save', { body: { customer_id: deP, currency: 'EUR', lines: L } });
    assert.equal((await call('invoice_approve', { body: { id: r.j.id } })).j.error, 'rate_missing');
    await call('invoice_save', { body: { id: r.j.id, customer_id: deP, currency: 'EUR', rate: '7,4604', lines: L } });
    assert.equal((await call('invoice_approve', { body: { id: r.j.id } })).j.number, 1003);
    const i = (await call('invoice', { params: { id: r.j.id } })).j.invoice;
    assert.equal(i.vat, 8636); assert.equal(i.vat_dkk, Math.round(8636 * 7.4604)); assert.equal(i.rate_source, 'manuel');
  });
  await ok('Druckansicht: Nummer, CVR, Pflichttext Reverse Charge auf Deutsch', async () => {
    const t = await (await fetch(`${B}/doc.php?id=${inv2}`, { headers: { cookie } })).text();
    assert.match(t, /Rechnungsnr\./); assert.match(t, />1001</); assert.match(t, /Steuerschuldnerschaft des Leistungsempfängers/); assert.match(t, /Steuerfreie innergemeinschaftliche Lieferung/);
    assert.match(t, /USt-IdNr\.: DE123456789/); assert.doesNotMatch(t, /ENTWURF/);
    const d = await (await fetch(`${B}/doc.php?id=${inv1}&lang=da`, { headers: { cookie } })).text();
    assert.match(d, /Faktura/); assert.match(d, /Moms 25 %/); assert.match(d, /431,81 DKK/);
    assert.equal((await fetch(`${B}/doc.php?id=${inv1}`)).status, 401, 'ohne Login kein Beleg');
  });
  await ok('Nicht momsregistriert → keine Moms, Hinweis auf Beleg', async () => {
    const co = (await call('me')).j.company;
    await call('company_save', { body: { ...co, moms_registered: false } });
    const r = await call('invoice_save', { body: { customer_id: dk, lines: L } }); assert.equal(r.j.vat_scheme, 'novat'); assert.equal(r.j.calc.vat, 0);
    const t = await (await fetch(`${B}/doc.php?id=${r.j.id}`, { headers: { cookie } })).text(); assert.match(t, /ikke momsregistreret/); assert.match(t, /KLADDE/);
    await call('invoice_delete', { body: { id: r.j.id } });
    await call('company_save', { body: { ...co, moms_registered: true } });
  });
  await ok('Journal: Hash-Kette und alle Rechnungen geprüft, keine Lücke', async () => {
    const r = await call('journal_verify'); assert.equal(r.j.ok, true, JSON.stringify(r.j.problems)); assert.equal(r.j.invoices, 4); assert.ok(r.j.entries >= 8);
  });
} finally {
  srv.kill();
  await new Promise((r) => setTimeout(r, 200));
  rmSync(data, { recursive: true, force: true });
  console.log(`\n${passed} Tests bestanden${process.exitCode ? ', FEHLER siehe oben' : ''}`);
}
