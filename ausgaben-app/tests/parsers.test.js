const P = require('../app/src/main/assets/www/parsers.js');
const assert = require('assert');
let n = 0; const t = (name, fn) => { fn(); n++; };
// Hilfsfunktion: Text -> simuliertes OCR (Zeilen untereinander, Preis rechts)
function ocr(lines) {
  const out = []; lines.forEach((l, i) => {
    const parts = l.split('|');
    out.push({ t: parts[0], x: 10, y: i * 30, w: 300, h: 22 });
    if (parts[1]) out.push({ t: parts[1], x: 500, y: i * 30 + 2, w: 80, h: 22 });
  });
  return { pages: [{ width: 600, height: lines.length * 30, lines: out }] };
}
t('Beträge', () => {
  assert.strictEqual(P.parseAmount('1.234,56'), 1234.56);
  assert.strictEqual(P.parseAmount('-12,30'), -12.3);
  assert.strictEqual(P.parseAmount('12,30-'), -12.3);
  assert.strictEqual(P.parseAmount('1,234.56'), 1234.56);
  assert.strictEqual(P.parseAmount('€ 9,99'), 9.99);
  assert.strictEqual(P.parseAmount('-1.500'), -1500);
  assert.strictEqual(P.parseAmount('abc'), null);
});
t('Datum', () => {
  assert.strictEqual(P.parseDate('Datum 03.11.2026 14:22'), '2026-11-03');
  assert.strictEqual(P.parseDate('03.11.26'), '2026-11-03');
  assert.strictEqual(P.parseDate('Bestellt am 5. Oktober 2026'), '2026-10-05');
  assert.strictEqual(P.parseDate('2026-01-31'), '2026-01-31');
});
t('Kassenbon REWE', () => {
  const r = P.parseReceipt(ocr(['REWE Markt GmbH', 'Hauptstr. 5', 'BANANEN|1,49 A', 'MILCH 1,5%|0,99 A', 'BUTTER|2,29 A', '2 Stk x 0,89', 'JOGHURT|1,78 A', 'PFAND|0,25 A', 'SUMME|EUR 6,80', 'Geg. EC-Karte|EUR 6,80', '03.11.2026 18:31 Bon-Nr 4711']));
  assert.strictEqual(r.merchant, 'REWE');
  assert.strictEqual(r.total, 6.80);
  assert.strictEqual(r.date, '2026-11-03');
  assert.strictEqual(r.category, 'lebensmittel');
  assert.deepStrictEqual(r.items.map(i => i.name), ['BANANEN', 'MILCH 1,5%', 'BUTTER', 'JOGHURT', 'PFAND']);
  assert.strictEqual(r.itemSum, 6.80);
});
t('Kassenbon Mengenzeile', () => {
  const r = P.parseReceipt(ocr(['LIDL', 'Äpfel Elstar', '1,234 kg x 2,49 EUR/kg|3,07 A', 'Brot|1,99 A', 'zu zahlen|5,06']));
  assert.deepStrictEqual(r.items, [{ name: 'Äpfel Elstar', price: 3.07 }, { name: 'Brot', price: 1.99 }]);
  assert.strictEqual(r.total, 5.06);
});
t('Dänischer Bon', () => {
  const r = P.parseReceipt(ocr(['Føtex', 'Mælk|12,95', 'Rugbrød|22,00', 'I ALT|34,95', 'Dankort|34,95']));
  assert.strictEqual(r.total, 34.95); assert.strictEqual(r.items.length, 2); assert.strictEqual(r.category, 'lebensmittel');
});
t('Online-Bestellung', () => {
  const r = P.parseReceipt(ocr(['Bestelldetails', 'Bestellt am 28. Oktober 2026', 'USB-C Ladekabel 2m', '9,99 €', 'Handyhülle schwarz', '14,49 €', 'Zwischensumme: 24,48 €', 'Versand: 0,00 €', 'Gesamtsumme: 24,48 €']), { online: true });
  assert.strictEqual(r.total, 24.48);
  assert.strictEqual(r.date, '2026-10-28');
  assert.deepStrictEqual(r.items.map(i => [i.name, i.price]), [['USB-C Ladekabel 2m', 9.99], ['Handyhülle schwarz', 14.49], ['Versand', 0]]);
  assert.strictEqual(r.category, 'online');
});
t('CSV Sparkasse', () => {
  const csv = '"Auftragskonto";"Buchungstag";"Valutadatum";"Buchungstext";"Verwendungszweck";"Beguenstigter/Zahlungspflichtiger";"Kontonummer/IBAN";"BIC (SWIFT-Code)";"Betrag";"Waehrung";"Info"\n' +
    '"DE1";"01.10.26";"01.10.26";"FOLGELASTSCHRIFT";"Miete Oktober";"Hausverwaltung Meier";"DE2";"X";"-750,00";"EUR";"Umsatz gebucht"\n' +
    '"DE1";"05.10.26";"05.10.26";"KARTENZAHLUNG";"REWE SAGT DANKE 123";"REWE Markt";"DE3";"X";"-23,45";"EUR";"Umsatz gebucht"\n' +
    '"DE1";"28.10.26";"28.10.26";"GUTSCHR. UEBERWEISUNG";"Gehalt 10/2026";"Firma GmbH";"DE4";"X";"2.450,00";"EUR";"Umsatz gebucht"\n';
  const r = P.parseStatement({ type: 'text', text: csv });
  assert.strictEqual(r.length, 3);
  assert.deepStrictEqual(r[0], { date: '2026-10-01', amount: -750, payee: 'Hausverwaltung Meier', text: 'Hausverwaltung Meier – FOLGELASTSCHRIFT Miete Oktober' });
  assert.strictEqual(r[2].amount, 2450);
});
t('CSV mit Vorspann (DKB/ING)', () => {
  const csv = 'Kontonummer:;DE12 3456\nZeitraum:;01.10.2026 - 31.10.2026\n\nBuchungsdatum;Wertstellung;Status;Zahlungspflichtige*r;Zahlungsempfänger*in;Verwendungszweck;Umsatztyp;IBAN;Betrag (€)\n02.10.26;02.10.26;Gebucht;Max;Netflix International;Netflix Abo;Ausgang;NL1;-13,99\n';
  const r = P.parseStatement({ type: 'text', text: csv });
  assert.strictEqual(r.length, 1); assert.strictEqual(r[0].amount, -13.99); assert.ok(/Netflix/.test(r[0].text));
});
t('CSV Dänisch', () => {
  const r = P.parseStatement({ type: 'text', text: 'Dato;Tekst;Beløb;Saldo\n01-10-2026;Husleje;-6.500,00;10.000,00\n03-10-2026;Netto;-123,50;9.876,50\n' });
  assert.strictEqual(r.length, 2); assert.strictEqual(r[0].amount, -6500);
});
t('Soll/Haben-Spalten', () => {
  const r = P.parseStatement({ type: 'text', text: 'Datum,Beschreibung,Soll,Haben\n2026-10-01,Miete,750.00,\n2026-10-30,Lohn,,2000.00\n' });
  assert.deepStrictEqual(r.map(x => x.amount), [-750, 2000]);
});
t('Fixkosten erkennen', () => {
  const tx = [
    { date: '2026-08-01', amount: -750, text: 'Hausverwaltung Meier – Miete' },
    { date: '2026-09-01', amount: -750, text: 'Hausverwaltung Meier – Miete' },
    { date: '2026-10-01', amount: -750, text: 'Hausverwaltung Meier – Miete' },
    { date: '2026-10-02', amount: -13.99, text: 'Netflix International – Abo' },
    { date: '2026-10-05', amount: -23.45, text: 'REWE Markt – Kartenzahlung' },
    { date: '2026-10-12', amount: -41.10, text: 'REWE Markt – Kartenzahlung' },
  ];
  const r = P.detectRecurring(tx);
  assert.deepStrictEqual(r.map(x => x.name), ['Hausverwaltung Meier', 'Netflix International']);
  assert.strictEqual(r[0].day, 1); assert.strictEqual(r[0].category, 'wohnen'); assert.strictEqual(r[1].category, 'abos');
});
t('PDF-Kontoauszug (OCR)', () => {
  const r = P.parseOcrStatement(ocr(['Kontoauszug Oktober 2026', 'Alter Kontostand|1.000,00', '01.10. Lastschrift Stadtwerke Kiel|-65,00', 'Abschlag Strom', '15.10. Gutschrift Gehalt|2.100,00+', '20.10. Kartenzahlung Aral|-55,30', 'Neuer Kontostand|2.979,70']));
  assert.strictEqual(r.length, 3);
  assert.deepStrictEqual(r.map(x => [x.date, x.amount]), [['2026-10-01', -65], ['2026-10-15', 2100], ['2026-10-20', -55.3]]);
  assert.ok(/Abschlag Strom/.test(r[0].text));
});
t('CAMT', () => {
  const x = '<Document><Ntry><Amt Ccy="EUR">12.50</Amt><CdtDbtInd>DBIT</CdtDbtInd><BookgDt><Dt>2026-10-03</Dt></BookgDt><Cdtr><Nm>Spotify</Nm></Cdtr><Ustrd>Premium</Ustrd></Ntry></Document>';
  assert.deepStrictEqual(P.parseStatement({ type: 'text', text: x }), [{ date: '2026-10-03', amount: -12.5, payee: 'Spotify', text: 'Spotify – Premium' }]);
});
console.log(n + ' Tests ok');
