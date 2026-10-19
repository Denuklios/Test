/* RechnungsStudio – Rechenkern (Browser und Server).
   Alle Beträge intern in Øre/Cent (ganze Zahlen), damit nichts durch Rundung verloren geht. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Calc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // EU-Länder außer Dänemark (Stand 2026)
  const EU = ['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK'];
  const DK_RATE = 25;

  const round = (x) => Math.round(x + (x >= 0 ? 1e-9 : -1e-9));
  const toCents = (v) => round(Number(String(v ?? '').replace(',', '.')) * 100) || 0;

  /* Momsart aus dem Kunden ableiten:
     dk      – Kunde in Dänemark: 25 % dänische Moms
     eu_rc   – Firma in anderem EU-Land mit USt-IdNr.: 0 %, Reverse Charge / EU-Lieferung (Rubrik B)
     eu_b2c  – Privatperson/Firma ohne USt-IdNr. in der EU: 25 % dänische Moms (unterhalb der OSS-Schwelle)
     export  – außerhalb der EU: 0 % (Rubrik C) */
  function vatScheme(customer) {
    const c = String(customer?.country || 'DK').toUpperCase();
    if (c === 'DK') return 'dk';
    if (EU.includes(c)) return customer.isBusiness !== false && String(customer.vatId || '').trim() ? 'eu_rc' : 'eu_b2c';
    return 'export';
  }
  const schemeRate = (scheme) => (scheme === 'dk' || scheme === 'eu_b2c' ? DK_RATE : 0);

  // Zeilenbetrag netto in Cent: Menge × Preis − Rabatt
  function lineNet(line) {
    const qty = Number(String(line.qty ?? 0).replace(',', '.')) || 0;
    const price = toCents(line.price);
    const disc = Number(String(line.discount ?? 0).replace(',', '.')) || 0;
    return round(qty * price * (1 - disc / 100));
  }
  // Steuersatz einer Zeile: momsfrei-Zeilen 0 %, sonst Satz der Momsart
  const lineRate = (line, scheme) => (line.vatFree ? 0 : schemeRate(scheme));

  function totals(inv) {
    const scheme = inv.vatScheme || 'dk';
    const byRate = {};
    let net = 0, goods = 0, services = 0, zeroNet = 0;
    for (const l of inv.lines || []) {
      const n = lineNet(l);
      const r = lineRate(l, scheme);
      net += n;
      byRate[r] = (byRate[r] || 0) + n;
      if (l.kind === 'goods') goods += n; else services += n;
      if (r === 0) zeroNet += n;
    }
    let vat = 0;
    const vatLines = [];
    for (const [r, base] of Object.entries(byRate)) {
      const v = round((base * Number(r)) / 100);
      vat += v;
      if (Number(r) > 0) vatLines.push({ rate: Number(r), base, vat: v });
    }
    return { net, vat, gross: net + vat, vatLines, goods, services, zeroNet };
  }

  // Betrag in Fremdwährung (Cent) → DKK-Øre mit Kurs „DKK je 1 Einheit“
  const toDKK = (cents, inv) => round(cents * (inv.currency && inv.currency !== 'DKK' ? Number(inv.exchangeRate) || 0 : 1));
  const sign = (inv) => (inv.type === 'credit' ? -1 : 1);

  const inPeriod = (d, from, to) => d && d >= from && d <= to;

  /* Momsangivelse für TastSelv Erhverv. Fakturierungsprinzip: es zählt das Rechnungsdatum.
     Ausgaben: amount = Brutto, vat = enthaltene (abziehbare) Moms, euPurchase = 'goods'|'services'|'' */
  // abziehbarer Moms-Anteil einer Ausgabe in Prozent (ältere Einträge ohne Angabe: 100 %)
  const share = (ex) => (ex.vatShare === undefined || ex.vatShare === null || ex.vatShare === '' ? 100 : Math.max(0, Math.min(100, Number(ex.vatShare) || 0)));

  function vatReport(invoices, expenses, from, to, incomes) {
    const r = {
      salgsmoms: 0, momsVarekoebUdland: 0, momsYdelseskoebUdland: 0, koebsmoms: 0,
      rubrikAVarer: 0, rubrikAYdelser: 0, rubrikBVarer: 0, rubrikBVarerIkkeEU: 0, rubrikBYdelser: 0, rubrikC: 0,
      momstilsvar: 0, invoiceCount: 0, expenseCount: 0, incomeCount: 0, euSales: [],
    };
    const eu = {};
    for (const inv of invoices || []) {
      if (!inv.number || inv.status === 'draft' || !inPeriod(inv.date, from, to)) continue;
      r.invoiceCount++;
      const t = totals(inv), s = sign(inv);
      const scheme = inv.vatScheme;
      r.salgsmoms += s * toDKK(t.vat, inv);
      if (scheme === 'eu_rc') {
        const g = s * toDKK(t.goods, inv), sv = s * toDKK(t.services, inv);
        r.rubrikBVarer += g; r.rubrikBYdelser += sv;
        const key = inv.customerVatId || inv.customerName;
        const e = eu[key] || (eu[key] = { vatId: inv.customerVatId, country: inv.customerCountry, name: inv.customerName, goods: 0, services: 0 });
        e.goods += g; e.services += sv;
      } else if (scheme === 'export') {
        r.rubrikC += s * toDKK(t.net, inv);
      } else {
        r.rubrikC += s * toDKK(t.zeroNet, inv); // momsfreie Zeilen auf dänischen Rechnungen
      }
    }
    for (const ex of expenses || []) {
      if (!inPeriod(ex.date, from, to)) continue;
      r.expenseCount++;
      const vat = toCents(ex.vat), amount = toCents(ex.amount);
      if (ex.euPurchase === 'goods' || ex.euPurchase === 'services') {
        // EU-Einkauf ohne Moms: Erwerbsmoms selbst berechnen und gleich wieder abziehen
        const net = amount;
        const self = round((net * DK_RATE) / 100);
        if (ex.euPurchase === 'goods') { r.rubrikAVarer += net; r.momsVarekoebUdland += self; }
        else { r.rubrikAYdelser += net; r.momsYdelseskoebUdland += self; }
        if (ex.deductible !== false) r.koebsmoms += round((self * share(ex)) / 100);
      } else if (ex.deductible !== false) {
        r.koebsmoms += round((vat * share(ex)) / 100);
      }
    }
    // Sonstige Einnahmen (z. B. aus fotografierten Belegen): enthaltene Moms ist Salgsmoms
    for (const inc of incomes || []) {
      if (!inPeriod(inc.date, from, to)) continue;
      r.incomeCount = (r.incomeCount || 0) + 1;
      r.salgsmoms += toCents(inc.vat);
    }
    r.euSales = Object.values(eu).filter((e) => e.goods || e.services);
    r.momstilsvar = r.salgsmoms + r.momsVarekoebUdland + r.momsYdelseskoebUdland - r.koebsmoms;
    return r;
  }

  /* Momsperioden und Fristen (Skattestyrelsen):
     Halbjahr/Quartal: Frist am 1. des 3. Monats nach Periodenende (Q1 → 1. Juni, H2 → 1. März)
     Monat: 25. des Folgemonats (Juni: 17. August) */
  const pad = (n) => String(n).padStart(2, '0');
  const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  function periods(year, kind) {
    const out = [];
    const len = kind === 'month' ? 1 : kind === 'quarter' ? 3 : 6;
    for (let m = 1; m <= 12; m += len) {
      const e = m + len - 1;
      let dy = year, dm, dd;
      if (kind === 'month') { dm = e + 1; dd = e === 6 ? 17 : 25; if (e === 6) dm = 8; }
      else { dm = e + 3; dd = 1; }
      if (dm > 12) { dm -= 12; dy++; }
      const label = kind === 'month' ? `${pad(m)}/${year}` : kind === 'quarter' ? `${(m + 2) / 3}. Quartal ${year}` : `${m === 1 ? '1.' : '2.'} Halbjahr ${year}`;
      out.push({ label, from: `${year}-${pad(m)}-01`, to: `${year}-${pad(e)}-${pad(lastDay(year, e))}`, deadline: `${dy}-${pad(dm)}-${pad(dd)}` });
    }
    return out;
  }

  /* FI-Zahlungslinie +71 (Betalingsid 15 Stellen inkl. Prüfziffer, Modulus 10) */
  function fikCheckDigit(digits) {
    let sum = 0;
    const s = String(digits);
    for (let i = 0; i < s.length; i++) {
      let d = Number(s[s.length - 1 - i]) * (i % 2 === 0 ? 2 : 1);
      if (d > 9) d -= 9;
      sum += d;
    }
    return (10 - (sum % 10)) % 10;
  }
  function fikLine(invoiceNumber, creditor) {
    if (!creditor) return '';
    const base = String(invoiceNumber).replace(/\D/g, '').padStart(14, '0').slice(-14);
    return `+71< ${base}${fikCheckDigit(base)} +${String(creditor).replace(/\D/g, '')}<`;
  }

  function dueDate(date, days) {
    const d = new Date(date + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + (Number(days) || 0));
    return d.toISOString().slice(0, 10);
  }

  return { vatShare: share, EU, DK_RATE, round, toCents, vatScheme, schemeRate, lineNet, lineRate, totals, toDKK, sign, vatReport, periods, fikLine, fikCheckDigit, dueDate };
});
