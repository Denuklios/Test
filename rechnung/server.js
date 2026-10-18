/* RechnungsStudio – Rechnungsprogramm für dänische Firmen (Moms/SKAT, Lunar-Abgleich, Rechnungen auf DE/DA/EN).
   Start:  node rechnung/server.js      (Node.js 22 oder neuer, keine Zusatzpakete)
   Umgebungsvariablen: PORT (8090), HOST (127.0.0.1), DATA_DIR (rechnung/data), PASSWORD (optional, Schutz per Browser-Anmeldung) */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Calc = require('./public/calc');
const Bank = require('./bank');
const Receipts = require('./receipts');
const os = require('os');

const ENV = process.env;
const PORT = +(ENV.PORT || 8090);
const HOST = ENV.HOST || '127.0.0.1';
const DATA_DIR = ENV.DATA_DIR || path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'rechnung.json');
const PUBLIC = path.join(__dirname, 'public');
const RECEIPT_DIR = path.join(DATA_DIR, 'belege');
const today = () => new Date().toISOString().slice(0, 10);
const uid = () => crypto.randomBytes(8).toString('hex');

/* ---------- Datenspeicher (eine JSON-Datei, täglich gesichert) ---------- */
const EMPTY = () => ({
  version: 1,
  settings: {
    company: '', owner: '', street: '', zip: '', city: '', country: 'DK', cvr: '', email: '', phone: '', web: '',
    bankName: 'Lunar', regNo: '', accountNo: '', iban: '', bic: 'LUNADK2B', fikCreditor: '', logo: '',
    nextNumber: 1, nextCustomerNo: 1001, dueDays: 14, vatPeriod: 'quarter', defaultCurrency: 'DKK', footer: '', autoBook: 'yes',
  },
  customers: [], products: [], invoices: [], expenses: [], incomes: [], receipts: [], bank: [], log: [],
  secrets: { anthropicKey: '' },
});

function load() {
  try {
    const s = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    const e = EMPTY();
    return { ...e, ...s, settings: { ...e.settings, ...s.settings }, secrets: { ...e.secrets, ...s.secrets } };
  } catch (err) {
    if (err.code !== 'ENOENT') { console.error('Datei kann nicht gelesen werden:', FILE, err.message); process.exit(1); }
    return EMPTY();
  }
}
let state = load();

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 1));
  fs.renameSync(tmp, FILE);
  // Tagessicherung, die letzten 60 behalten
  const bdir = path.join(DATA_DIR, 'sicherung');
  const bfile = path.join(bdir, `rechnung-${today()}.json`);
  if (!fs.existsSync(bfile)) {
    fs.mkdirSync(bdir, { recursive: true });
    fs.copyFileSync(FILE, bfile);
    const old = fs.readdirSync(bdir).filter((f) => f.endsWith('.json')).sort();
    for (const f of old.slice(0, Math.max(0, old.length - 60))) fs.unlinkSync(path.join(bdir, f));
  }
}
const log = (action, info) => state.log.push({ at: new Date().toISOString(), action, info: String(info || '').slice(0, 300) });

/* ---------- Hilfen ---------- */
class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const fail = (msg, code = 400) => { throw new HttpError(code, msg); };
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));
const str = (v, n = 500) => String(v ?? '').slice(0, n);
const byId = (list, id) => list.find((x) => x.id === id) || fail('Nicht gefunden.', 404);

const CUSTOMER_KEYS = ['name', 'isBusiness', 'contact', 'street', 'zip', 'city', 'country', 'vatId', 'cvr', 'email', 'phone', 'language', 'currency', 'dueDays', 'note', 'ean', 'vatChecked'];
const PRODUCT_KEYS = ['name', 'name_de', 'name_da', 'name_en', 'unit', 'price', 'kind', 'vatFree', 'currency'];
const EXPENSE_KEYS = ['date', 'supplier', 'text', 'category', 'amount', 'vat', 'euPurchase', 'deductible', 'paid', 'paidDate', 'dueDate', 'invoiceNumber', 'currency', 'receiptId'];
const INCOME_KEYS = ['date', 'name', 'text', 'category', 'amount', 'vat', 'paid', 'paidDate', 'documentNumber', 'receiptId'];
const INVOICE_KEYS = ['date', 'dueDays', 'customerId', 'currency', 'exchangeRate', 'lines', 'note', 'language', 'vatScheme'];

function cleanLines(lines) {
  return (Array.isArray(lines) ? lines : []).slice(0, 200).map((l) => ({
    productId: str(l.productId, 40), text: str(l.text, 2000), qty: str(l.qty, 20) || '1', unit: str(l.unit, 20),
    price: str(l.price, 20) || '0', discount: str(l.discount, 10) || '0', kind: l.kind === 'goods' ? 'goods' : 'services', vatFree: !!l.vatFree,
  }));
}

function customerSnapshot(inv) {
  const c = state.customers.find((x) => x.id === inv.customerId);
  if (!c) return;
  inv.customerName = c.name;
  inv.customerAddress = [c.contact ? (c.isBusiness !== false ? `Att.: ${c.contact}` : '') : '', c.street, [c.zip, c.city].filter(Boolean).join(' ')].filter(Boolean).join('\n');
  inv.customerCountry = c.country || 'DK';
  inv.customerVatId = c.vatId || (c.country === 'DK' && c.cvr ? `DK${c.cvr}` : '');
  inv.customerNo = c.customerNo;
  inv.customerEmail = c.email;
  if (!inv.language) inv.language = c.language || 'da';
}

function applyInvoice(inv, body) {
  Object.assign(inv, pick(body, INVOICE_KEYS));
  inv.lines = cleanLines(inv.lines);
  inv.currency = str(inv.currency || 'DKK', 3).toUpperCase();
  inv.exchangeRate = inv.currency === 'DKK' ? 1 : Number(String(inv.exchangeRate || 0).replace(',', '.')) || 0;
  inv.dueDays = Math.max(0, Math.min(365, Number(inv.dueDays) || 0));
  inv.date = /^\d{4}-\d{2}-\d{2}$/.test(inv.date) ? inv.date : today();
  const cust = state.customers.find((x) => x.id === inv.customerId);
  if (body.customerId && cust) { inv.language = body.language || cust.language || 'da'; }
  inv.vatScheme = ['dk', 'eu_rc', 'eu_b2c', 'export'].includes(body.vatScheme) ? body.vatScheme : Calc.vatScheme(cust || {});
  customerSnapshot(inv);
  inv.dueDate = Calc.dueDate(inv.date, inv.dueDays);
}

/* ---------- Abfragen bei Behörden/Diensten ---------- */
async function fetchJson(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { 'User-Agent': 'RechnungsStudio/1.0', Accept: 'application/json', ...(opts.headers || {}) }, signal: AbortSignal.timeout(10000) });
  const text = await r.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* kein JSON */ }
  return { ok: r.ok, status: r.status, data, text };
}

// CVR-Register (Dänemark) über cvrapi.dk – kostenlose, begrenzte Abfrage
async function cvrLookup(q) {
  const r = await fetchJson(`https://cvrapi.dk/api?search=${encodeURIComponent(q)}&country=dk`);
  if (!r.ok || !r.data || r.data.error) fail(r.data?.message || r.data?.error || 'Keine Firma gefunden.', 404);
  const d = r.data;
  return { name: d.name, cvr: String(d.vat || ''), street: d.address, zip: d.zipcode, city: d.city, email: d.email || '', phone: d.phone || '', country: 'DK' };
}

// EU-USt-IdNr. prüfen (VIES der EU-Kommission)
async function viesCheck(vatId) {
  const v = String(vatId).replace(/[\s.\-]/g, '').toUpperCase();
  const m = v.match(/^([A-Z]{2})(.+)$/);
  if (!m) fail('Bitte die USt-IdNr. mit Ländercode eingeben, z. B. DE123456789.');
  const country = m[1] === 'GR' ? 'EL' : m[1];
  const r = await fetchJson('https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ countryCode: country, vatNumber: m[2] }),
  });
  if (!r.ok || !r.data) fail('Die EU-Prüfung (VIES) ist gerade nicht erreichbar. Bitte später erneut versuchen.', 502);
  return { valid: !!r.data.valid, name: r.data.name && r.data.name !== '---' ? r.data.name : '', address: r.data.address && r.data.address !== '---' ? r.data.address : '', checkedAt: today() };
}

// Wechselkurs DKK je 1 Einheit: Nationalbanken (heute), sonst EZB über frankfurter.app (auch für ältere Tage)
async function exchangeRate(cur, date) {
  cur = String(cur).toUpperCase();
  if (cur === 'DKK') return { rate: 1, source: '' };
  if (!date || date >= today()) {
    try {
      const r = await fetch('https://www.nationalbanken.dk/api/currencyratesxml?lang=da', { signal: AbortSignal.timeout(8000) });
      const xml = await r.text();
      const m = xml.match(new RegExp(`code="${cur}"[^>]*rate="([\\d.,]+)"`));
      if (m) return { rate: Number(m[1].replace('.', '').replace(',', '.')) / 100, source: 'Danmarks Nationalbank' };
    } catch { /* weiter mit EZB */ }
  }
  const r = await fetchJson(`https://api.frankfurter.app/${date || 'latest'}?from=${cur}&to=DKK`);
  if (r.ok && r.data?.rates?.DKK) return { rate: r.data.rates.DKK, source: `EZB (${r.data.date})` };
  fail('Kein Wechselkurs gefunden – bitte von Hand eintragen.', 502);
}

/* ---------- Belege (Foto/PDF → automatisch erkannt und gebucht) ---------- */
const apiKey = () => ENV.ANTHROPIC_API_KEY || state.secrets.anthropicKey || '';
const n2 = (v) => Number(String(v ?? '').replace(',', '.')) || 0;
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
const MIME_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'application/pdf': '.pdf' };

// Erkennung läuft nacheinander im Hintergrund, damit viele Fotos auf einmal kein Problem sind
let queue = Promise.resolve();
const enqueue = (id) => (queue = queue.then(() => recognize(id)).catch((e) => console.error('Belegerkennung:', e)));

async function recognize(id) {
  const r = state.receipts.find((x) => x.id === id);
  if (!r || r.status !== 'processing') return;
  try {
    const ex = await Receipts.extract({ buffer: fs.readFileSync(path.join(RECEIPT_DIR, r.file)), mime: r.mime, company: { name: state.settings.company, cvr: state.settings.cvr }, apiKey: apiKey() });
    r.extracted = ex;
    r.rate = 1;
    if (ex.currency && ex.currency.toUpperCase() !== 'DKK' && ex.docType !== 'other') {
      try { r.rate = (await exchangeRate(ex.currency, isDate(ex.date) ? ex.date : '')).rate; } catch { r.rate = 0; }
    }
    r.draft = draftFromReceipt(r);
    r.status = 'review';
    r.error = '';
    const sure = ex.confident && ex.docType !== 'other' && r.rate > 0 && isDate(ex.date) && n2(ex.total) > 0;
    if (sure && state.settings.autoBook === 'yes') bookReceipt(r, r.draft, true);
  } catch (err) {
    r.status = 'error';
    r.error = err.message;
    r.draft = r.draft || emptyDraft();
  }
  save();
}

const emptyDraft = () => ({ kind: 'expense', date: today(), name: '', text: '', category: 'Diverse', amount: '', vat: '', euPurchase: '', paid: true, dueDate: '', documentNumber: '' });

// Erkannte Werte → Buchungsvorschlag in DKK
function draftFromReceipt(r) {
  const ex = r.extracted || {};
  const rate = r.rate ?? 1;
  // ohne Wechselkurs bleibt der DKK-Betrag leer, damit nichts Falsches gebucht wird
  const dkk = (v) => (rate > 0 ? (Math.round(n2(v) * rate * 100) / 100).toFixed(2) : '');
  const foreign = rate !== 1 && ex.currency ? ` (${ex.total} ${ex.currency.toUpperCase()})` : '';
  return {
    kind: ex.docType === 'income' ? 'income' : 'expense',
    date: isDate(ex.date) ? ex.date : today(), name: ex.counterparty || '', text: (ex.description || '') + foreign,
    category: ex.category || 'Diverse', euPurchase: ex.euPurchase || '',
    amount: ex.euPurchase ? dkk(n2(ex.total) - n2(ex.vat)) : dkk(ex.total), vat: ex.euPurchase ? '0.00' : dkk(ex.vat), original: rate !== 1 ? `${ex.total} ${String(ex.currency).toUpperCase()}` : '',
    paid: !!ex.isPaid, dueDate: ex.isPaid ? '' : (isDate(ex.dueDate) ? ex.dueDate : ''), documentNumber: ex.documentNumber || '',
  };
}

// Passende Lunar-Buchung suchen (gleicher Betrag ±1 kr., bis 3 Wochen Abstand) und verknüpfen
function matchBank(kind, item) {
  const cents = Math.round(n2(item.amount) * 100) * (kind === 'income' ? 1 : -1);
  const d0 = Date.parse(item.date);
  const tx = state.bank.find((t) => t.status === 'open' && Math.abs(t.amount - cents) <= 100 && Math.abs(Date.parse(t.date) - d0) <= 21 * 864e5);
  if (!tx) return null;
  tx.status = 'matched';
  if (kind === 'income') tx.incomeId = item.id; else tx.expenseId = item.id;
  Object.assign(item, { paid: true, paidDate: tx.date, bankId: tx.id });
  return tx;
}

function bookReceipt(r, d, auto = false) {
  if (r.booked) fail('Dieser Beleg ist schon gebucht.');
  const amount = n2(d.amount);
  if (!(amount > 0)) fail('Bitte den Betrag eintragen.');
  if (!isDate(d.date)) fail('Bitte das Datum eintragen.');
  const paid = d.paid === true || d.paid === 'true';
  const base = { id: uid(), createdAt: new Date().toISOString(), date: d.date, text: str(d.text), category: str(d.category || 'Diverse', 80), amount: amount.toFixed(2), paid, paidDate: paid ? d.date : '', receiptId: r.id };
  let item;
  const kind = d.kind === 'income' ? 'income' : 'expense';
  if (kind === 'income') {
    item = { ...base, name: str(d.name || 'Einnahme', 200), vat: n2(d.vat).toFixed(2), documentNumber: str(d.documentNumber, 60) };
    state.incomes.push(item);
  } else {
    // Gibt es die Ausgabe schon ohne Beleg (z. B. aus der Lunar-Buchung)? Dann Beleg anhängen statt doppelt buchen.
    const d0 = Date.parse(d.date);
    const dup = state.expenses.find((e) => !e.receiptId && Math.abs(n2(e.amount) - amount) <= 1 && Math.abs(Date.parse(e.date) - d0) <= 21 * 864e5);
    if (dup) {
      Object.assign(dup, { supplier: str(d.name || dup.supplier, 200), text: str(d.text || dup.text), category: base.category, vat: d.euPurchase ? '0.00' : n2(d.vat).toFixed(2),
        euPurchase: ['goods', 'services'].includes(d.euPurchase) ? d.euPurchase : '', invoiceNumber: str(d.documentNumber, 60), receiptId: r.id });
      r.booked = { kind, id: dup.id, auto, merged: true };
      r.status = 'booked';
      log('Beleg an vorhandene Ausgabe angehängt', `${dup.supplier} ${dup.amount} DKK`);
      return dup;
    }
    item = { ...base, supplier: str(d.name || 'Unbekannt', 200), vat: d.euPurchase ? '0.00' : n2(d.vat).toFixed(2), euPurchase: ['goods', 'services'].includes(d.euPurchase) ? d.euPurchase : '',
      deductible: d.deductible !== false, dueDate: paid ? '' : (isDate(d.dueDate) ? d.dueDate : ''), invoiceNumber: str(d.documentNumber, 60), currency: 'DKK' };
    state.expenses.push(item);
  }
  matchBank(kind, item);
  r.booked = { kind, id: item.id, auto };
  r.status = 'booked';
  log(`Beleg ${auto ? 'automatisch ' : ''}gebucht`, `${kind === 'income' ? 'Einnahme' : 'Ausgabe'} ${item.name || item.supplier} ${item.amount} DKK`);
  return item;
}

function unlinkReceipt(item) {
  const r = item.receiptId && state.receipts.find((x) => x.id === item.receiptId);
  if (r && r.booked?.id === item.id) { r.booked = null; r.status = 'review'; }
  for (const t of state.bank) if (t.expenseId === item.id || t.incomeId === item.id) { t.expenseId = t.incomeId = null; t.status = 'open'; }
}

/* ---------- API ---------- */
async function api(method, parts, body, url) {
  const [res, id, action] = parts;
  const S = state.settings;

  if (res === 'state' && method === 'GET') {
    return { ...state, secrets: undefined, ai: { installed: Receipts.available(), enabled: Receipts.enabled(apiKey()), fromEnv: !!ENV.ANTHROPIC_API_KEY, hasKey: !!state.secrets.anthropicKey } };
  }

  // Adressen im Heimnetz, damit das Handy das Programm findet
  if (res === 'lan' && method === 'GET') {
    const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
    return { open: HOST !== '127.0.0.1' && HOST !== 'localhost', urls: ips.map((ip) => `http://${ip}:${PORT}/#/belege`), password: !!ENV.PASSWORD };
  }

  if (res === 'settings' && method === 'PUT') {
    for (const k of Object.keys(EMPTY().settings)) if (k in body) S[k] = k === 'logo' ? str(body[k], 400000) : typeof S[k] === 'number' ? Number(body[k]) || S[k] : str(body[k]);
    if (typeof body.aiKey === 'string' && body.aiKey.trim()) state.secrets.anthropicKey = body.aiKey.trim().slice(0, 300);
    if (body.aiKeyDelete) state.secrets.anthropicKey = '';
    log('Einstellungen geändert');
    return S;
  }

  // Kunden, Produkte, Ausgaben: einfache Listen
  const simple = { customers: CUSTOMER_KEYS, products: PRODUCT_KEYS, expenses: EXPENSE_KEYS, incomes: INCOME_KEYS };
  if (simple[res]) {
    const list = state[res];
    if (method === 'POST' && !id) {
      const item = { id: uid(), createdAt: new Date().toISOString(), ...pick(body, simple[res]) };
      if (res === 'customers') { item.customerNo = S.nextCustomerNo++; item.country = str(item.country || 'DK', 2).toUpperCase(); }
      if (!str(item.name || item.supplier || item.text).trim()) fail('Bitte einen Namen eingeben.');
      list.push(item);
      log(`${res} angelegt`, item.name || item.supplier);
      return item;
    }
    const item = byId(list, id);
    if (method === 'PUT') {
      Object.assign(item, pick(body, simple[res]));
      if (res === 'customers') item.country = str(item.country || 'DK', 2).toUpperCase();
      return item;
    }
    if (method === 'DELETE') {
      if (res === 'customers' && state.invoices.some((i) => i.customerId === id && i.number)) fail('Für diesen Kunden gibt es bereits Rechnungen. Er kann nicht gelöscht werden.');
      if (res === 'expenses' || res === 'incomes') unlinkReceipt(item);
      list.splice(list.indexOf(item), 1);
      log(`${res} gelöscht`, item.name || item.supplier);
      return { ok: true };
    }
  }

  if (res === 'invoices') {
    if (method === 'POST' && !id) {
      const inv = { id: uid(), type: 'invoice', status: 'draft', number: null, createdAt: new Date().toISOString(), paidAmount: 0, payments: [] };
      applyInvoice(inv, { dueDays: S.dueDays, ...body });
      state.invoices.push(inv);
      return inv;
    }
    const inv = byId(state.invoices, id);
    const t = Calc.totals(inv);
    const grossDKK = Calc.toDKK(t.gross, inv);
    if (method === 'PUT' && !action) {
      if (inv.status !== 'draft') fail('Genehmigte Rechnungen können nicht mehr geändert werden. Bitte eine Gutschrift erstellen.');
      applyInvoice(inv, body);
      return inv;
    }
    if (method === 'DELETE') {
      if (inv.status !== 'draft') fail('Genehmigte Rechnungen dürfen nicht gelöscht werden (Bogføringsloven). Bitte eine Gutschrift erstellen.');
      state.invoices.splice(state.invoices.indexOf(inv), 1);
      return { ok: true };
    }
    if (method === 'POST' && action === 'approve') {
      if (inv.status !== 'draft') fail('Die Rechnung ist bereits genehmigt.');
      if (!inv.customerId || !state.customers.some((c) => c.id === inv.customerId)) fail('Bitte einen Kunden wählen.');
      if (!inv.lines.length || !inv.lines.some((l) => l.text.trim())) fail('Die Rechnung hat keine Zeilen.');
      if (inv.currency !== 'DKK' && !(inv.exchangeRate > 0)) fail('Bitte den Wechselkurs eintragen.');
      if (!S.company || !S.cvr) fail('Bitte zuerst in den Einstellungen Firmenname und CVR-Nr. eintragen.');
      if (inv.vatScheme === 'eu_rc' && !inv.customerVatId) fail('Für Reverse Charge braucht der Kunde eine USt-IdNr.');
      customerSnapshot(inv);
      inv.number = S.nextNumber++;
      inv.status = 'approved';
      inv.approvedAt = new Date().toISOString();
      inv.seller = pick(S, ['company', 'owner', 'street', 'zip', 'city', 'country', 'cvr', 'email', 'phone', 'web', 'bankName', 'regNo', 'accountNo', 'iban', 'bic', 'fikCreditor', 'footer']);
      inv.totalsDKK = { net: Calc.toDKK(t.net, inv), vat: Calc.toDKK(t.vat, inv), gross: grossDKK };
      if (inv.type === 'credit' && inv.refInvoiceId) {
        const orig = state.invoices.find((x) => x.id === inv.refInvoiceId);
        if (orig) {
          orig.credits = [...(orig.credits || []), inv.id];
          const credited = (orig.credits || []).map((cid) => state.invoices.find((x) => x.id === cid)).filter(Boolean)
            .reduce((s, c) => s + Calc.toDKK(Calc.totals(c).gross, c), 0);
          const og = Calc.toDKK(Calc.totals(orig).gross, orig);
          if (orig.status === 'approved' && credited + (orig.paidAmount || 0) >= og - 100) orig.status = 'credited';
        }
        inv.status = 'paid'; // Gutschrift ist mit der Rechnung verrechnet
      }
      log(`${inv.type === 'credit' ? 'Gutschrift' : 'Rechnung'} ${inv.number} genehmigt`, `${inv.customerName}, ${(grossDKK / 100).toFixed(2)} DKK`);
      return inv;
    }
    if (method === 'POST' && action === 'pay') {
      if (inv.status === 'draft') fail('Die Rechnung ist noch nicht genehmigt.');
      const amount = body.amount != null && body.amount !== '' ? Calc.toCents(body.amount) : grossDKK - (inv.paidAmount || 0);
      const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : today();
      inv.payments = [...(inv.payments || []), { date, amount, bankId: body.bankId || null }];
      inv.paidAmount = (inv.paidAmount || 0) + amount;
      if (inv.paidAmount >= grossDKK - 100 || body.full) { inv.status = 'paid'; inv.paidDate = date; }
      if (body.bankId) { const tx = state.bank.find((b) => b.id === body.bankId); if (tx) { tx.status = 'matched'; tx.invoiceId = inv.id; } }
      log(`Zahlung zu Rechnung ${inv.number}`, `${(amount / 100).toFixed(2)} DKK am ${date}`);
      return inv;
    }
    if (method === 'POST' && action === 'unpay') {
      for (const p of inv.payments || []) if (p.bankId) { const tx = state.bank.find((b) => b.id === p.bankId); if (tx) { tx.status = 'open'; tx.invoiceId = null; } }
      inv.payments = []; inv.paidAmount = 0; inv.paidDate = null;
      if (inv.status === 'paid' && inv.type !== 'credit') inv.status = 'approved';
      log(`Zahlung zu Rechnung ${inv.number} zurückgenommen`);
      return inv;
    }
    if (method === 'POST' && action === 'credit') {
      if (inv.status === 'draft' || inv.type === 'credit') fail('Nur genehmigte Rechnungen können gutgeschrieben werden.');
      const cr = { id: uid(), type: 'credit', status: 'draft', number: null, createdAt: new Date().toISOString(), refInvoiceId: inv.id, refNumber: inv.number, paidAmount: 0, payments: [] };
      applyInvoice(cr, { ...pick(inv, INVOICE_KEYS), date: today(), dueDays: 0 });
      state.invoices.push(cr);
      return cr;
    }
    if (method === 'POST' && action === 'copy') {
      const cp = { id: uid(), type: 'invoice', status: 'draft', number: null, createdAt: new Date().toISOString(), paidAmount: 0, payments: [] };
      applyInvoice(cp, { ...pick(inv, INVOICE_KEYS), date: today(), dueDays: inv.dueDays, exchangeRate: '' });
      state.invoices.push(cp);
      return cp;
    }
    if (method === 'POST' && action === 'sent') {
      inv.sentAt = new Date().toISOString();
      return inv;
    }
  }

  if (res === 'receipts') {
    if (method === 'POST' && !id) {
      const mime = str(body.mime, 60);
      if (!MIME_EXT[mime]) fail('Dateiformat wird nicht unterstützt (bitte JPG, PNG oder PDF).');
      const buf = Buffer.from(String(body.data || ''), 'base64');
      if (buf.length < 100) fail('Die Datei ist leer.');
      const r = { id: uid(), uploadedAt: new Date().toISOString(), name: str(body.name, 200), mime, size: buf.length, status: 'review', booked: null, extracted: null, draft: emptyDraft(), error: '' };
      r.file = r.id + MIME_EXT[mime];
      fs.mkdirSync(RECEIPT_DIR, { recursive: true });
      fs.writeFileSync(path.join(RECEIPT_DIR, r.file), buf);
      state.receipts.push(r);
      // Beleg an eine bestehende Ausgabe/Einnahme anhängen
      const target = body.attachTo && (state[body.attachTo.kind === 'income' ? 'incomes' : 'expenses'] || []).find((x) => x.id === body.attachTo.id);
      if (target) {
        target.receiptId = r.id;
        r.booked = { kind: body.attachTo.kind === 'income' ? 'income' : 'expense', id: target.id, auto: false };
        r.status = 'booked';
      } else if (Receipts.enabled(apiKey())) {
        r.status = 'processing';
        setImmediate(() => enqueue(r.id));
      }
      return r;
    }
    const r = byId(state.receipts, id);
    if (method === 'POST' && action === 'book') return bookReceipt(r, body);
    if (method === 'POST' && action === 'retry') {
      if (r.booked) fail('Der Beleg ist schon gebucht.');
      if (!Receipts.enabled(apiKey())) fail('Die automatische Erkennung ist nicht eingerichtet (Einstellungen → Belegerkennung).');
      r.status = 'processing'; r.error = '';
      setImmediate(() => enqueue(r.id));
      return r;
    }
    if (method === 'DELETE') {
      if (r.booked) fail('Der Beleg ist gebucht. Bitte zuerst die Buchung löschen.');
      try { fs.unlinkSync(path.join(RECEIPT_DIR, r.file)); } catch { /* schon weg */ }
      state.receipts.splice(state.receipts.indexOf(r), 1);
      return { ok: true };
    }
  }

  if (res === 'bank') {
    if (method === 'POST' && id === 'import') {
      const { rows, error } = Bank.parseCsv(body.csv || '');
      if (error) fail(error);
      const added = Bank.importRows(state, rows);
      log('Kontoauszug importiert', `${added} neue Buchungen`);
      return { added, total: rows.length };
    }
    if (method === 'GET' && id === 'suggest') {
      return Object.fromEntries(state.bank.filter((t) => t.status === 'open').map((t) => [t.id, Bank.suggest(state, t)]).filter(([, s]) => s));
    }
    const tx = byId(state.bank, id);
    if (method === 'POST' && action === 'ignore') { tx.status = tx.status === 'ignored' ? 'open' : 'ignored'; return tx; }
    if (method === 'POST' && action === 'link') {
      // Abbuchung/Eingang mit vorhandener (unbezahlter) Ausgabe bzw. Einnahme verbinden
      const kind = body.kind === 'income' ? 'income' : 'expense';
      const item = byId(state[kind === 'income' ? 'incomes' : 'expenses'], body.id);
      Object.assign(item, { paid: true, paidDate: tx.date, bankId: tx.id });
      tx.status = 'matched';
      if (kind === 'income') tx.incomeId = item.id; else tx.expenseId = item.id;
      return item;
    }
    if (method === 'POST' && action === 'expense') {
      if (tx.amount >= 0) fail('Nur Abbuchungen können als Ausgabe gebucht werden.');
      const gross = -tx.amount;
      const withVat = body.withVat !== false;
      const ex = {
        id: uid(), createdAt: new Date().toISOString(), date: tx.date, supplier: str(body.supplier || tx.text, 200), text: str(body.text || tx.text, 500),
        category: str(body.category || 'Diverse'), amount: (gross / 100).toFixed(2), vat: withVat ? (Calc.round(gross * 0.2) / 100).toFixed(2) : '0.00',
        euPurchase: '', deductible: true, paid: true, currency: 'DKK', bankId: tx.id,
      };
      state.expenses.push(ex);
      tx.status = 'matched'; tx.expenseId = ex.id;
      log('Ausgabe aus Bankbuchung', ex.supplier);
      return ex;
    }
  }

  if (res === 'lookup') {
    const q = url.searchParams;
    if (id === 'cvr') return cvrLookup(q.get('q') || '');
    if (id === 'vies') return viesCheck(q.get('vat') || '');
    if (id === 'rate') return exchangeRate(q.get('currency') || 'EUR', q.get('date') || '');
  }

  if (res === 'vat' && method === 'GET') {
    const q = url.searchParams;
    return Calc.vatReport(state.invoices, state.expenses, q.get('from'), q.get('to'), state.incomes);
  }

  if (res === 'backup' && method === 'GET') return { ...state, secrets: undefined };
  if (res === 'backup' && method === 'POST') {
    if (!body || !Array.isArray(body.invoices) || !body.settings) fail('Das ist keine RechnungsStudio-Sicherung.');
    const e = EMPTY();
    state = { ...e, ...body, settings: { ...e.settings, ...body.settings }, secrets: state.secrets };
    log('Sicherung eingespielt');
    return { ok: true };
  }

  fail('Unbekannte Anfrage.', 404);
}

/* ---------- HTTP ---------- */
const MIME = { '.webmanifest': 'application/manifest+json', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function authorized(req) {
  if (!ENV.PASSWORD) return true;
  const h = req.headers.authorization || '';
  const [, b64] = h.split(' ');
  const pw = Buffer.from(b64 || '', 'base64').toString().split(':').slice(1).join(':');
  const a = crypto.createHash('sha256').update(pw).digest(), b = crypto.createHash('sha256').update(ENV.PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const send = (code, data, type = 'application/json; charset=utf-8') => {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(type.startsWith('application/json') ? JSON.stringify(data) : data);
  };
  if (!authorized(req)) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="RechnungsStudio", charset="UTF-8"' });
    return res.end('Anmeldung erforderlich');
  }
  try {
    if (url.pathname.startsWith('/api/')) {
      let body = {};
      if (req.method !== 'GET') {
        const chunks = [];
        let size = 0;
        for await (const c of req) { size += c.length; if (size > 30e6) fail('Datei zu groß.', 413); chunks.push(c); }
        const raw = Buffer.concat(chunks).toString();
        body = raw ? JSON.parse(raw) : {};
        // Schutz gegen Anfragen fremder Webseiten
        if (req.headers['x-rs'] !== '1') fail('Ungültige Anfrage.', 403);
      }
      const parts = url.pathname.slice(5).split('/').filter(Boolean).map(decodeURIComponent);
      const out = await api(req.method, parts, body, url);
      if (req.method !== 'GET') save();
      return send(200, out);
    }
    // Belegfoto/PDF anzeigen
    const bm = url.pathname.match(/^\/beleg\/([a-f0-9]{16})$/);
    if (bm) {
      const r = state.receipts.find((x) => x.id === bm[1]);
      if (!r) fail('Beleg nicht gefunden.', 404);
      return send(200, fs.readFileSync(path.join(RECEIPT_DIR, r.file)), r.mime);
    }
    let file = url.pathname === '/' ? '/index.html' : url.pathname;
    file = path.normalize(path.join(PUBLIC, file));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC, 'index.html');
    send(200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream');
  } catch (err) {
    if (!(err instanceof HttpError)) console.error(err);
    send(err.code && Number.isInteger(err.code) ? err.code : 500, { error: err instanceof HttpError ? err.message : 'Interner Fehler: ' + err.message });
  }
});

if (require.main === module) {
  // nach einem Neustart unterbrochene Erkennungen fortsetzen
  for (const r of state.receipts) if (r.status === 'processing') enqueue(r.id);
  server.listen(PORT, HOST, () => console.log(`RechnungsStudio läuft: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}  (Daten: ${FILE})`));
}
module.exports = { server, api, reset: () => { state = EMPTY(); }, getState: () => state, draftFromReceipt, bookReceipt, idle: () => queue };
