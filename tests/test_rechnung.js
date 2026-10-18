// RechnungsStudio: Rechenkern, Momsangivelse, Bankimport, Rechnungsablauf. Aufruf: node tests/test_rechnung.js
const path = require('path');
const os = require('os');
const fs = require('fs');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-'));
const Calc = require('../rechnung/public/calc.js');
const DocLang = require('../rechnung/public/doclang.js');
const Bank = require('../rechnung/bank.js');
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

  // Texte in allen Sprachen vollständig
  const keys = Object.keys(DocLang.T.de);
  for (const l of ['da', 'en']) ok(keys.every((k) => k in DocLang.T[l]), `Texte ${l} vollständig`);
  eq(DocLang.money(123456, 'DKK', 'da').replace(/\s/g, ' '), '1.234,56 kr.', 'Betrag dänisch');

  console.log(fails ? `\n${fails} Fehler` : '\nAlle Tests bestanden');
  process.exit(fails ? 1 : 0);
})();
