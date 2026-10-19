// RechnungsStudio: Rechenkern, Momsangivelse, Bankimport, Rechnungsablauf. Aufruf: node tests/test_rechnung.js
const path = require('path');
const os = require('os');
const fs = require('fs');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-'));
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-key';
const Calc = require('../rechnung/public/calc.js');
const DocLang = require('../rechnung/public/doclang.js');
const Bank = require('../rechnung/bank.js');
const Receipts = require('../rechnung/receipts.js');
const RS = require('../rechnung/server.js');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FEHL ') + m); if (!c) fails++; };
const eq = (a, b, m) => ok(a === b, `${m}: ${a}${a === b ? '' : ' ≠ ' + b}`);

// Momsart je Kunde
eq(Calc.vatScheme({ country: 'DK' }), 'dk', 'Kunde DK');
eq(Calc.vatScheme({ country: 'DE', isBusiness: true, vatId: 'DE123456789' }), 'eu_rc', 'Firma DE mit USt-IdNr.');
eq(Calc.vatScheme({ country: 'DE', isBusiness: false }), 'eu_b2c', 'Privat DE');
eq(Calc.vatScheme({ country: 'NO', isBusiness: true }), 'export', 'Norwegen');

// Summen
const inv = { vatScheme: 'dk', lines: [{ qty: '3', price: '199.95', discount: '0' }, { qty: '1,5', price: '800', discount: '10' }, { qty: 1, price: 100, vatFree: true }] };
const t = Calc.totals(inv);
eq(t.net, 59985 + 108000 + 10000, 'Netto');
eq(t.vat, Math.round((59985 + 108000) * 0.25), 'Moms nur auf steuerpflichtige Zeilen');
eq(t.gross, t.net + t.vat, 'Brutto');

// Fristen
const q = Calc.periods(2026, 'quarter');
eq(q[0].deadline, '2026-06-01', 'Frist Q1');
eq(q[3].deadline, '2027-03-01', 'Frist Q4');
eq(Calc.periods(2026, 'halfyear')[0].deadline, '2026-09-01', 'Frist 1. Halbjahr');
eq(Calc.periods(2026, 'month')[5].deadline, '2026-08-17', 'Frist Juni (monatlich)');
eq(Calc.periods(2026, 'month')[11].deadline, '2027-01-25', 'Frist Dezember');
eq(Calc.periods(2028, 'month')[1].to, '2028-02-29', 'Schaltjahr');

// FI-Prüfziffer (Luhn)
eq(Calc.fikCheckDigit('7992739871'), 3, 'Modulus-10-Prüfziffer');
ok(/^\+71< \d{15} \+12345678<$/.test(Calc.fikLine(17, '12345678')), 'FI-Zeile ' + Calc.fikLine(17, '12345678'));

// Bank-CSV (Lunar-Format mit Semikolon und Komma)
eq(Bank.parseAmount('-1.234,56'), -123456, 'Betrag dänisch');
eq(Bank.parseAmount('2,500.00'), 250000, 'Betrag englisch');
eq(Bank.parseDate('05-03-2026'), '2026-03-05', 'Datum dd-mm-yyyy');
const csv = 'Dato;Tekst;Beløb;Saldo\n10-06-2026;"Overførsel Müller GmbH Faktura 1";"1.250,00";"5.000,00"\n11-06-2026;Netto;-125,00;4.875,00\n';
const p = Bank.parseCsv(csv);
eq(p.rows.length, 2, 'CSV-Zeilen');
eq(p.rows[0].amount, 125000, 'CSV-Eingang');

// Ablauf über die API
(async () => {
  const A = (m, p, b = {}) => RS.api(m, p.split('/'), b, new URL('http://x/?'));
  try { await A('POST', 'customers', { name: '' }); ok(false, 'leerer Name abgelehnt'); } catch { ok(true, 'leerer Name abgelehnt'); }
  await A('PUT', 'settings', { company: 'Testfirma ApS', cvr: '12345678', vatPeriod: 'quarter' });
  const dk = await A('POST', 'customers', { name: 'Hansen ApS', country: 'DK', language: 'da', cvr: '87654321' });
  const de = await A('POST', 'customers', { name: 'Müller GmbH', country: 'DE', language: 'de', isBusiness: true, vatId: 'DE123456789', currency: 'EUR' });
  const i1 = await A('POST', 'invoices', { customerId: dk.id, date: '2026-05-10', lines: [{ text: 'Stickerei', qty: '10', price: '100', kind: 'services' }] });
  eq(i1.vatScheme, 'dk', 'Rechnung DK Momsart');
  eq(i1.language, 'da', 'Rechnung DK Sprache dänisch');
  await A('POST', `invoices/${i1.id}/approve`);
  eq(i1.number, 1, 'Erste Rechnungsnummer');
  try { await A('PUT', `invoices/${i1.id}`, {}); ok(false, 'genehmigte Rechnung gesperrt'); } catch { ok(true, 'genehmigte Rechnung gesperrt'); }
  try { await A('DELETE', `invoices/${i1.id}`); ok(false, 'Löschen gesperrt'); } catch { ok(true, 'Löschen gesperrt'); }
  const i2 = await A('POST', 'invoices', { customerId: de.id, date: '2026-05-20', currency: 'EUR', exchangeRate: '7.46', lines: [{ text: 'Logo-Digitalisierung', qty: '1', price: '200', kind: 'services' }, { text: 'Kappen', qty: '50', price: '8', kind: 'goods' }] });
  eq(i2.vatScheme, 'eu_rc', 'Rechnung DE Reverse Charge');
  eq(i2.language, 'de', 'Rechnung DE Sprache deutsch');
  await A('POST', `invoices/${i2.id}/approve`);
  eq(i2.number, 2, 'Fortlaufende Nummer');
  await A('POST', 'expenses', { date: '2026-04-02', supplier: 'Bauhaus', amount: '1250.00', vat: '250.00', category: 'Material/Waren' });
  await A('POST', 'expenses', { date: '2026-04-15', supplier: 'Madeira DE', amount: '800.00', vat: '0', euPurchase: 'goods' });
  const r = Calc.vatReport(RS.getState().invoices, RS.getState().expenses, '2026-04-01', '2026-06-30');
  eq(r.salgsmoms, 25000, 'Salgsmoms 250 kr');
  eq(r.rubrikBYdelser, 149200, 'Rubrik B ydelser 200 EUR × 7,46');
  eq(r.rubrikBVarer, 298400, 'Rubrik B varer 400 EUR × 7,46');
  eq(r.rubrikAVarer, 80000, 'Rubrik A varer');
  eq(r.momsVarekoebUdland, 20000, 'Erwerbsmoms');
  eq(r.koebsmoms, 25000 + 20000, 'Købsmoms');
  eq(r.momstilsvar, 25000 + 20000 - 45000, 'Momstilsvar');
  eq(r.euSales.length, 1, 'EU-salg uden moms Liste');

  // Bankabgleich: 1.250 kr. = Rechnung 1 (1.000 + 25 %)
  await A('POST', 'bank/import', { csv });
  const again = await A('POST', 'bank/import', { csv });
  eq(again.added, 0, 'Doppelimport erkannt');
  const sug = await A('GET', 'bank/suggest');
  const tx = RS.getState().bank.find((b) => b.amount === 125000);
  eq(sug[tx.id]?.invoiceId, i1.id, 'Vorschlag passende Rechnung');
  await A('POST', `invoices/${i1.id}/pay`, { date: tx.date, amount: '1250.00', bankId: tx.id });
  eq(i1.status, 'paid', 'Rechnung bezahlt');
  const out = RS.getState().bank.find((b) => b.amount < 0);
  const ex = await A('POST', `bank/${out.id}/expense`, { category: 'Diverse' });
  eq(ex.vat, '25.00', 'Ausgabe aus Bank: Moms 20 % von 125');

  // Gutschrift
  const cr = await A('POST', `invoices/${i2.id}/credit`);
  await A('POST', `invoices/${cr.id}/approve`);
  eq(cr.number, 3, 'Gutschrift bekommt nächste Nummer');
  eq(i2.status, 'credited', 'Rechnung gutgeschrieben');
  const r2 = Calc.vatReport(RS.getState().invoices, [], '2026-01-01', '2026-12-31');
  eq(r2.rubrikBYdelser, 0, 'Gutschrift hebt Rubrik B auf');

  // Belege: Foto hochladen → erkennen → automatisch buchen → mit Lunar-Abbuchung verknüpfen
  if (Receipts.available()) {
    const fake = { docType: 'expense', counterparty: 'Bauhaus Sønderborg', counterpartyVatId: '', counterpartyCountry: 'DK', documentNumber: 'K-4711', date: '2026-06-11',
      dueDate: '', currency: 'DKK', total: '125.00', vat: '25.00', isPaid: true, paymentMethod: 'card', category: 'Material/Waren', euPurchase: '', description: 'Schrauben', confident: true, notes: '' };
    let next = fake;
    Receipts.extract = async () => next;
    const img = { mime: 'image/jpeg', data: Buffer.alloc(500, 1).toString('base64'), name: 'bon.jpg' };
    // die Abbuchung von 125 kr. wurde oben schon als Ausgabe gebucht → wieder lösen, damit der Beleg sie findet
    const ex0 = RS.getState().expenses.find((e) => e.amount === '125.00');
    await A('DELETE', `expenses/${ex0.id}`);
    const r1 = await A('POST', 'receipts', img);
    eq(r1.status, 'processing', 'Beleg wird erkannt');
    await new Promise((res) => setTimeout(res, 20)); await RS.idle();
    eq(r1.status, 'booked', 'eindeutiger Beleg automatisch gebucht');
    const e1 = RS.getState().expenses.find((e) => e.id === r1.booked.id);
    eq(e1.vat, '25.00', 'Købsmoms aus Beleg');
    eq(e1.bankId && RS.getState().bank.find((t) => t.id === e1.bankId).amount, -12500, 'mit Lunar-Abbuchung verknüpft');
    // unsicher erkannte Lieferantenrechnung in EUR → bleibt zur Prüfung
    next = { ...fake, counterparty: 'Madeira GmbH', counterpartyCountry: 'DE', currency: 'EUR', total: '100.00', vat: '0', isPaid: false, paymentMethod: 'unpaid', dueDate: '2026-07-01', euPurchase: 'goods', confident: false, notes: 'Datum schlecht lesbar' };
    const r2 = await A('POST', 'receipts', img);
    await new Promise((res) => setTimeout(res, 20)); await RS.idle();
    eq(r2.status, 'review', 'unsicherer Beleg wartet auf Prüfung');
    eq(r2.draft.euPurchase, 'goods', 'EU-Einkauf erkannt');
    ok(r2.rate > 0 ? Number(r2.draft.amount) > 700 : r2.draft.amount === '' , `EUR umgerechnet oder Betrag offen gelassen (Kurs ${r2.rate}, Betrag „${r2.draft.amount}“)`);
    const e2 = await A('POST', `receipts/${r2.id}/book`, { ...r2.draft, amount: '746.00' });
    eq(e2.paid, false, 'Lieferantenrechnung offen');
    eq(e2.dueDate, '2026-07-01', 'Fälligkeit übernommen');
    // Einnahme-Beleg
    next = { ...fake, docType: 'income', counterparty: 'Etsy', total: '500.00', vat: '100.00', confident: true, date: '2026-06-20' };
    const r3 = await A('POST', 'receipts', img);
    await new Promise((res) => setTimeout(res, 20)); await RS.idle();
    eq(r3.booked?.kind, 'income', 'Einnahme erkannt und gebucht');
    const r4 = Calc.vatReport(RS.getState().invoices, RS.getState().expenses, '2026-06-01', '2026-06-30', RS.getState().incomes);
    eq(r4.salgsmoms, 10000, 'Salgsmoms aus sonstiger Einnahme');
    // Buchung löschen → Beleg wieder zu prüfen, Bank wieder offen
    await A('DELETE', `expenses/${e1.id}`);
    eq(r1.status, 'review', 'Beleg nach Löschen wieder zu prüfen');
    try { await A('DELETE', `receipts/${r3.id}`); ok(false, 'gebuchten Beleg nicht löschbar'); } catch { ok(true, 'gebuchten Beleg nicht löschbar'); }
    // Abbuchung zuerst als Ausgabe gebucht, Beleg danach → Beleg wird angehängt, keine Doppelbuchung
    const txS = RS.getState().bank.find((t) => t.amount === -12500);
    eq(txS.status, 'open', 'Abbuchung nach Löschen wieder offen');
    const exB = await A('POST', `bank/${txS.id}/expense`, { category: 'Diverse' });
    const n0 = RS.getState().expenses.length;
    const merged = await A('POST', `receipts/${r1.id}/book`, r1.draft);
    eq(RS.getState().expenses.length, n0, 'keine Doppelbuchung');
    eq(merged.id, exB.id, 'Beleg an vorhandene Ausgabe angehängt');
    eq(merged.supplier, 'Bauhaus Sønderborg', 'Lieferant vom Beleg übernommen');
    // Fehler der Erkennung
    Receipts.extract = async () => { throw new Error('Der API-Schlüssel ist ungültig.'); };
    const r5 = await A('POST', 'receipts', img);
    await new Promise((res) => setTimeout(res, 20)); await RS.idle();
    eq(r5.status, 'error', 'Fehler wird angezeigt');
    ok(!JSON.stringify(await A('GET', 'state')).includes(process.env.ANTHROPIC_API_KEY), 'Schlüssel wird nicht an den Browser geschickt');
  } else console.log('(Belegerkennung übersprungen: rechnung/node_modules fehlt – npm install im Ordner rechnung)');

  // CVR-Abfrage: cvrapi.dk-Limit erreicht → Ausweg über die EU-Datenbank VIES
  const realFetch = global.fetch;
  global.fetch = async (url) => {
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
    if (String(url).includes('cvrapi.dk')) return json({ error: 'QUOTA_EXCEEDED', message: 'Your quota has been exceeded.' }, 402);
    if (String(url).includes('vies')) return json({ valid: true, name: 'NORDSTICK APS', address: 'Storegade 1\n6400 Sønderborg' });
    throw new Error('unerwartet: ' + url);
  };
  const L = (q) => RS.api('GET', ['lookup', 'cvr'], {}, new URL('http://x/?q=' + encodeURIComponent(q)));
  const c1 = await L('46733428');
  eq(c1.name, 'NORDSTICK APS', 'Firma über VIES trotz CVR-Limit');
  eq(c1.zip + ' ' + c1.city, '6400 Sønderborg', 'Adresse aus VIES zerlegt');
  try { await L('Nordstick'); ok(false, 'Namenssuche bei Limit'); } catch (e) { ok(/aufgebraucht/.test(e.message), 'verständliche Meldung bei Limit: ' + e.message.slice(0, 60)); }
  // nicht momsregistriert + Limit → genaue Erklärung
  global.fetch = async (url) => {
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
    if (String(url).includes('cvrapi.dk')) return json({ error: 'QUOTA_EXCEEDED', message: 'Your quota has been exceeded.' }, 402);
    return json({ valid: false, name: '---', address: '---' });
  };
  try { await L('46733428'); ok(false, 'neue Firma'); } catch (e) { ok(/momsregistriert/.test(e.message) && /aufgebraucht/.test(e.message), 'Erklärung: ' + e.message.slice(0, 70)); }
  try { await L('46733429'); ok(false, 'Prüfziffer'); } catch (e) { ok(/Prüfziffer/.test(e.message), 'falsche Prüfziffer erkannt'); }
  global.fetch = realFetch;

  // Auftragsbestätigung mit Bild → Link → Kunde unterschreibt → Rechnung
  const png = 'data:image/png;base64,' + Buffer.alloc(300, 7).toString('base64');
  const prod = await A('POST', 'products', { name_de: 'Bestickte Kappe', name_da: 'Broderet kasket', price: '120', unit: 'stk', kind: 'goods', image: png });
  eq(prod.image, png, 'Produktbild gespeichert');
  const bad = await A('POST', 'products', { name_de: 'X', image: 'javascript:alert(1)' });
  eq(bad.image, '', 'ungültiges Bild verworfen');
  const ord = await A('POST', 'orders', { customerId: dk.id, deliveryDate: '2026-11-15', lines: [{ text: 'Broderet kasket', qty: '20', price: '120', kind: 'goods', image: png }] });
  eq(ord.language, 'da', 'Auftrag in Kundensprache');
  eq(ord.lines[0].image, png, 'Bild in der Auftragszeile');
  await A('POST', `orders/${ord.id}/send`);
  eq(ord.number, 1001, 'Auftragsnummer');
  ok(/^[a-f0-9]{36}$/.test(ord.token), 'geheimer Link erzeugt');
  const P = async (m, path, body) => RS.publicApi(m, path.split('/'), body || {}, req);
  const req = { headers: { 'user-agent': 'Test' }, socket: { remoteAddress: '203.0.113.5' } };
  // öffentliche Schnittstelle direkt über das HTTP-Modul
  const http = require('http');
  process.env.PASSWORD = 'geheim';
  await new Promise((r) => RS.server.listen(0, '127.0.0.1', r));
  const port = RS.server.address().port;
  const H = (method, path, body, auth) => new Promise((res, rej) => {
    const data = body ? JSON.stringify(body) : null;
    const rq = http.request({ host: '127.0.0.1', port, path, method, headers: { 'X-RS': '1', 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Basic ' + Buffer.from('x:geheim').toString('base64') } : {}) } }, (r) => {
      let t = ''; r.on('data', (c) => (t += c)); r.on('end', () => res({ status: r.statusCode, body: t }));
    });
    rq.on('error', rej); if (data) rq.write(data); rq.end();
  });
  eq((await H('GET', '/api/state')).status, 401, 'Programmdaten brauchen Passwort');
  eq((await H('GET', `/a/${ord.token}`)).status, 200, 'Unterschriftsseite ohne Passwort');
  const pub = await H('GET', `/api/public/order/${ord.token}`);
  eq(pub.status, 200, 'Auftrag für Kunden abrufbar');
  const pj = JSON.parse(pub.body);
  ok(!('customerId' in pj.order) && !('token' in pj.order) && !pub.body.includes('signerIp'), 'keine internen Daten im Kunden-Link');
  eq((await H('GET', '/api/public/order/' + 'a'.repeat(36))).status, 404, 'falscher Link → nicht gefunden');
  const s1 = await H('POST', `/api/public/order/${ord.token}/sign`, { name: 'Jens Hansen', signature: png, accept: false });
  eq(s1.status, 400, 'ohne Bestätigung keine Unterschrift');
  ok(/Udfyld/.test(s1.body), 'Fehlermeldung auf Dänisch');
  const s2 = await H('POST', `/api/public/order/${ord.token}/sign`, { name: 'Jens Hansen', signature: png, accept: true, comment: 'Levering om formiddagen' });
  eq(s2.status, 200, 'Kunde unterschreibt');
  eq(ord.status, 'signed', 'Status unterschrieben');
  eq(ord.signerIp, '127.0.0.1', 'IP gespeichert');
  ok(/^[a-f0-9]{64}$/.test(ord.docHash), 'Prüfsumme des Dokuments gespeichert');
  eq((await H('POST', `/api/public/order/${ord.token}/sign`, { name: 'X', signature: png, accept: true })).status, 409, 'zweites Unterschreiben abgelehnt');
  RS.server.close(); delete process.env.PASSWORD;
  try { await A('PUT', `orders/${ord.id}`, {}); ok(false, 'unterschriebener Auftrag gesperrt'); } catch { ok(true, 'unterschriebener Auftrag gesperrt'); }
  const fromOrd = await A('POST', `orders/${ord.id}/invoice`);
  eq(fromOrd.status, 'draft', 'Rechnungsentwurf aus Auftrag');
  eq(fromOrd.lines[0].image, undefined, 'Rechnung ohne Bilder');
  ok(fromOrd.note.includes('Ordrenr. 1001'), 'Auftragsnummer auf der Rechnung: ' + fromOrd.note);
  eq(ord.status, 'invoiced', 'Auftrag abgerechnet');
  // abgelaufenes Angebot
  const old = await A('POST', 'orders', { customerId: dk.id, validUntil: '2020-01-01', lines: [{ text: 'X', qty: '1', price: '1' }] });
  await A('POST', `orders/${old.id}/send`);
  try { await P('POST', `order/${old.token}/sign`, { name: 'A', signature: png, accept: true }); ok(false, 'abgelaufen'); } catch (e) { ok(/udløbet/.test(e.message), 'abgelaufenes Angebot: ' + e.message); }

  // Texte in allen Sprachen vollständig
  const keys = Object.keys(DocLang.T.de);
  for (const l of ['da', 'en']) ok(keys.every((k) => k in DocLang.T[l]), `Texte ${l} vollständig`);
  eq(DocLang.money(123456, 'DKK', 'da').replace(/\s/g, ' '), '1.234,56 kr.', 'Betrag dänisch');

  console.log(fails ? `\n${fails} Fehler` : '\nAlle Tests bestanden');
  process.exit(fails ? 1 : 0);
})();
