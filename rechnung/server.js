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

const ENV = process.env;
const PORT = +(ENV.PORT || 8090);
const HOST = ENV.HOST || '127.0.0.1';
const DATA_DIR = ENV.DATA_DIR || path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'rechnung.json');
const PUBLIC = path.join(__dirname, 'public');
const today = () => new Date().toISOString().slice(0, 10);
const uid = () => crypto.randomBytes(8).toString('hex');

/* ---------- Datenspeicher (eine JSON-Datei, täglich gesichert) ---------- */
const EMPTY = () => ({
  version: 1,
  settings: {
    company: '', owner: '', street: '', zip: '', city: '', country: 'DK', cvr: '', email: '', phone: '', web: '',
    bankName: 'Lunar', regNo: '', accountNo: '', iban: '', bic: 'LUNADK2B', fikCreditor: '', logo: '',
    nextNumber: 1, nextCustomerNo: 1001, dueDays: 14, vatPeriod: 'quarter', defaultCurrency: 'DKK', footer: '',
  },
  customers: [], products: [], invoices: [], expenses: [], bank: [], log: [],
});

function load() {
  try {
    const s = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    const e = EMPTY();
    return { ...e, ...s, settings: { ...e.settings, ...s.settings } };
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
const EXPENSE_KEYS = ['date', 'supplier', 'text', 'category', 'amount', 'vat', 'euPurchase', 'deductible', 'paid', 'currency'];
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

/* ---------- API ---------- */
async function api(method, parts, body, url) {
  const [res, id, action] = parts;
  const S = state.settings;

  if (res === 'state' && method === 'GET') return state;

  if (res === 'settings' && method === 'PUT') {
    for (const k of Object.keys(EMPTY().settings)) if (k in body) S[k] = k === 'logo' ? str(body[k], 400000) : typeof S[k] === 'number' ? Number(body[k]) || S[k] : str(body[k]);
    log('Einstellungen geändert');
    return S;
  }

  // Kunden, Produkte, Ausgaben: einfache Listen
  const simple = { customers: CUSTOMER_KEYS, products: PRODUCT_KEYS, expenses: EXPENSE_KEYS };
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
      if (res === 'expenses') for (const t of state.bank) if (t.expenseId === id) { t.expenseId = null; t.status = 'open'; }
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
    return Calc.vatReport(state.invoices, state.expenses, q.get('from'), q.get('to'));
  }

  if (res === 'backup' && method === 'GET') return state;
  if (res === 'backup' && method === 'POST') {
    if (!body || !Array.isArray(body.invoices) || !body.settings) fail('Das ist keine RechnungsStudio-Sicherung.');
    const e = EMPTY();
    state = { ...e, ...body, settings: { ...e.settings, ...body.settings } };
    log('Sicherung eingespielt');
    return { ok: true };
  }

  fail('Unbekannte Anfrage.', 404);
}

/* ---------- HTTP ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

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
  server.listen(PORT, HOST, () => console.log(`RechnungsStudio läuft: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}  (Daten: ${FILE})`));
}
module.exports = { server, api, reset: () => { state = EMPTY(); }, getState: () => state };
