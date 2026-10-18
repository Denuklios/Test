/* Kontoauszug-Import (Lunar und andere dänische Banken als CSV) und Abgleich mit offenen Rechnungen. */
'use strict';
const crypto = require('crypto');
const Calc = require('./public/calc');

function splitCsvLine(line, sep) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

// "1.234,56" / "-1234.56" / "1 234,56 kr." → Øre
function parseAmount(s) {
  let t = String(s || '').replace(/[^\d,.\-−]/g, '').replace('−', '-');
  if (!t) return null;
  const lc = t.lastIndexOf(','), ld = t.lastIndexOf('.');
  if (lc > ld) t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(/,/g, '');
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

// "18-10-2026" / "18.10.2026" / "2026-10-18" / "18/10/2026" → ISO
function parseDate(s) {
  const t = String(s || '').trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

function parseCsv(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], error: 'Die Datei enthält keine Buchungen.' };
  const head = lines[0];
  const sep = [';', ',', '\t'].sort((a, b) => head.split(b).length - head.split(a).length)[0];
  const cols = splitCsvLine(head, sep).map((h) => h.toLowerCase());
  const find = (re) => cols.findIndex((h) => re.test(h));
  const iDate = find(/dato|date|bogf|buchung/);
  const iText = find(/tekst|text|beskriv|descr|modtager|afsender|navn|name|verwendung/);
  const iAmount = find(/beløb|belob|amount|betrag|beløb/);
  const iIn = find(/indbetal|ind$|credit|haben/);
  const iOut = find(/udbetal|^ud$|debit|soll/);
  if (iDate < 0 || (iAmount < 0 && iIn < 0)) return { rows: [], error: 'Spalten für Datum und Betrag wurden nicht gefunden. Erwartet z. B. „Dato;Tekst;Beløb“.' };
  const rows = [];
  for (const line of lines.slice(1)) {
    const c = splitCsvLine(line, sep);
    const date = parseDate(c[iDate]);
    let amount = iAmount >= 0 ? parseAmount(c[iAmount]) : null;
    if (amount == null && iIn >= 0) amount = (parseAmount(c[iIn]) || 0) - Math.abs(parseAmount(c[iOut]) || 0);
    if (!date || amount == null) continue;
    const text = iText >= 0 ? c[iText] : c.filter((_, i) => i !== iDate && i !== iAmount).join(' ');
    rows.push({ date, text, amount });
  }
  return { rows };
}

const txId = (r, n) => crypto.createHash('sha1').update(`${r.date}|${r.text}|${r.amount}|${n}`).digest('hex').slice(0, 16);

// Neue Buchungen übernehmen (gleiche Buchung wird nicht doppelt importiert)
function importRows(state, rows) {
  const seen = new Map();
  let added = 0;
  for (const r of rows) {
    const k = `${r.date}|${r.text}|${r.amount}`;
    const n = (seen.get(k) || 0) + 1;
    seen.set(k, n);
    const id = txId(r, n);
    if (state.bank.some((t) => t.id === id)) continue;
    state.bank.push({ id, date: r.date, text: r.text, amount: r.amount, status: 'open', invoiceId: null, expenseId: null });
    added++;
  }
  state.bank.sort((a, b) => b.date.localeCompare(a.date));
  return added;
}

// Vorschlag: offene Rechnung mit gleichem Betrag (DKK) und/oder Rechnungsnummer im Buchungstext
function suggest(state, tx) {
  if (tx.amount <= 0) return null;
  let best = null, bestScore = 0;
  for (const inv of state.invoices) {
    if (inv.status !== 'approved' || inv.type === 'credit') continue;
    const t = Calc.totals(inv);
    const dkk = Calc.toDKK(t.gross, inv) - (inv.paidAmount || 0);
    let score = 0;
    if (Math.abs(dkk - tx.amount) <= 100) score += 2; // ±1 kr. (Rundung/Wechselkurs)
    if (inv.number && new RegExp(`(^|\\D)${inv.number}(\\D|$)`).test(tx.text)) score += 3;
    if (inv.customerName && tx.text.toLowerCase().includes(inv.customerName.toLowerCase().split(' ')[0])) score += 1;
    if (score > bestScore) { best = inv; bestScore = score; }
  }
  return bestScore >= 2 ? { invoiceId: best.id, score: bestScore } : null;
}

module.exports = { parseCsv, parseAmount, parseDate, importRows, suggest };
