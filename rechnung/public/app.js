/* RechnungsStudio – Oberfläche (Deutsch). Rechnungen werden in der Sprache des Kunden ausgegeben. */
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const kr = (cents, cur = 'DKK') => DocLang.money(cents, cur, 'de');
const dmy = (iso) => DocLang.date(iso, 'de');
const num = (v) => String(v ?? '').replace('.', ',');

let S = null; // gesamter Datenstand vom Server

async function api(path, method = 'GET', body) {
  const opt = { method, headers: { 'X-RS': '1' } };
  if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  const r = await fetch('/api/' + path, opt);
  const data = await r.json().catch(() => ({ error: 'Keine Antwort vom Server.' }));
  if (!r.ok) throw new Error(data.error || 'Fehler');
  return data;
}
async function reload() { S = await api('state'); }
// Änderung ausführen, danach Datenstand neu laden
async function act(fn, okMsg) {
  try { const r = await fn(); await reload(); if (okMsg) toast(okMsg); return r; }
  catch (e) { toast(e.message, true); throw e; }
}

function toast(msg, err) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast' + (err ? ' err' : '');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), err ? 6000 : 2500);
}
function modal(html, onMount) {
  $('.modal-box').classList.remove('wide');
  $('#modal-body').innerHTML = html;
  $('#modal').classList.remove('hidden');
  onMount && onMount($('#modal-body'));
  const f = $('#modal-body input, #modal-body select'); f && f.focus();
}
const closeModal = () => $('#modal').classList.add('hidden');
$('#modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
const formData = (el) => Object.fromEntries($$('[name]', el).map((i) => [i.name, i.type === 'checkbox' ? i.checked : i.value]));

/* ---------- Bezeichnungen ---------- */
const LANGS = { de: 'Deutsch', da: 'Dänisch', en: 'Englisch' };
const UNITS = { stk: 'Stück', timer: 'Stunden', dage: 'Tage', md: 'Monat', m: 'Meter', m2: 'm²', kg: 'kg', pakke: 'Paket', '': '–' };
const CURRENCIES = ['DKK', 'EUR', 'SEK', 'NOK', 'GBP', 'USD', 'CHF', 'PLN'];
const SCHEMES = {
  dk: 'Dänemark – 25 % Moms', eu_rc: 'EU-Firma – Reverse Charge, 0 %', eu_b2c: 'EU-Privatkunde – 25 % dänische Moms', export: 'Außerhalb der EU – 0 %',
};
const COUNTRY_LIST = ['DK', 'DE', 'SE', 'NO', 'NL', 'AT', 'CH', 'PL', 'FR', 'BE', 'FI', 'IT', 'ES', 'GB', 'US', ...Calc.EU.filter((c) => !['DE', 'SE', 'NL', 'AT', 'PL', 'FR', 'BE', 'FI', 'IT', 'ES'].includes(c))];
const countryName = (c) => DocLang.country(c, 'de');
const countryOpts = (sel) => COUNTRY_LIST.map((c) => `<option value="${c}" ${c === sel ? 'selected' : ''}>${esc(countryName(c))} (${c})</option>`).join('');
const opts = (obj, sel) => Object.entries(obj).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');

function invStatus(inv) {
  if (inv.status === 'draft') return ['Entwurf', 'b-draft'];
  if (inv.type === 'credit') return ['Gutschrift', 'b-credit'];
  if (inv.status === 'paid') return ['Bezahlt', 'b-paid'];
  if (inv.status === 'credited') return ['Gutgeschrieben', 'b-credit'];
  if (inv.dueDate < today()) return ['Überfällig', 'b-over'];
  return ['Offen', 'b-open'];
}
const badge = (inv) => { const [t, c] = invStatus(inv); return `<span class="badge ${c}">${t}</span>`; };
const isOpen = (inv) => inv.status === 'approved' && inv.type !== 'credit';
const gross = (inv) => Calc.totals(inv).gross * Calc.sign(inv);
const grossDKK = (inv) => Calc.toDKK(Calc.totals(inv).gross, inv) * Calc.sign(inv);
const invTitle = (inv) => (inv.type === 'credit' ? 'Gutschrift' : 'Rechnung') + (inv.number ? ' ' + inv.number : ' (Entwurf)');

/* ---------- Router ---------- */
const routes = {};
async function route() {
  const [r, id] = location.hash.replace(/^#\/?/, '').split('/');
  $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.r === ({ rechnung: 'rechnungen', druck: 'rechnungen', auftrag: 'auftraege', auftragansicht: 'auftraege' }[r] || r || '')));
  try { await reload(); } catch (e) { $('#main').innerHTML = `<div class="card">Server nicht erreichbar: ${esc(e.message)}</div>`; return; }
  await (routes[r || ''] || routes[''])(id);
  DocRender.fit();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
// zurück ins Fenster → neuen Stand holen (z. B. Unterschrift vom Kunden), außer beim Bearbeiten
window.addEventListener('focus', () => { if ($('#modal').classList.contains('hidden') && !/^#\/(rechnung|auftrag)\//.test(location.hash)) route(); });
const go = (h) => { if (location.hash === h) route(); else location.hash = h; };

/* ---------- Übersicht ---------- */
routes[''] = () => {
  const inv = S.invoices.filter((i) => i.status !== 'draft');
  const open = inv.filter(isOpen);
  const over = open.filter((i) => i.dueDate < today());
  const openAmt = open.reduce((s, i) => s + grossDKK(i) - (i.paidAmount || 0), 0);
  const overAmt = over.reduce((s, i) => s + grossDKK(i) - (i.paidAmount || 0), 0);
  const y = new Date().getFullYear();
  const yearNet = inv.filter((i) => i.date.startsWith(y)).reduce((s, i) => s + Calc.sign(i) * Calc.toDKK(Calc.totals(i).net, i), 0);
  const per = Calc.periods(y, S.settings.vatPeriod).concat(Calc.periods(y - 1, S.settings.vatPeriod));
  const cur = per.find((p) => p.from <= today() && p.to >= today()) || per[0];
  const prev = per.filter((p) => p.to < today() && p.deadline >= today()).sort((a, b) => a.deadline.localeCompare(b.deadline))[0];
  const vr = Calc.vatReport(S.invoices, S.expenses, cur.from, cur.to, S.incomes);
  const months = Array.from({ length: 12 }, (_, m) => inv.filter((i) => i.date.startsWith(`${y}-${String(m + 1).padStart(2, '0')}`))
    .reduce((s, i) => s + Calc.sign(i) * Calc.toDKK(Calc.totals(i).net, i), 0));
  const mx = Math.max(1, ...months);
  const setup = !S.settings.company || !S.settings.cvr;
  $('#main').innerHTML = `
    <h1>Übersicht <span class="spacer"></span><a class="btn" href="#/belege">📷 Beleg fotografieren</a><button class="primary" id="new-inv">+ Neue Rechnung</button></h1>
    ${setup ? `<div class="note warn">Willkommen! Bitte zuerst unter <a href="#/einstellungen">Einstellungen</a> deine Firmendaten (Name, CVR-Nr., Lunar-Konto) eintragen.</div>` : ''}
    <div class="cards">
      <div class="card stat"><div class="k">Offene Rechnungen</div><div class="v">${kr(openAmt)}</div><div class="s">${open.length} Rechnung(en)</div></div>
      <div class="card stat"><div class="k">Davon überfällig</div><div class="v" style="color:${over.length ? 'var(--bad)' : 'inherit'}">${kr(overAmt)}</div><div class="s">${over.length} Rechnung(en)</div></div>
      <div class="card stat"><div class="k">Umsatz ${y} (netto)</div><div class="v">${kr(yearNet)}</div><div class="s">ohne Moms</div></div>
      <div class="card stat"><div class="k">Moms ${esc(cur.label)}</div><div class="v">${kr(vr.momstilsvar)}</div><div class="s">bisher · Frist ${dmy(cur.deadline)}</div></div>
    </div>
    ${S.orders.filter((o) => o.status === 'signed').map((o) => `<div class="note">✍️ Auftrag <b>${o.number}</b> von <b>${esc(o.customerName)}</b> wurde am ${dmy(o.signedAt.slice(0, 10))} unterschrieben. <a href="#/auftragansicht/${o.id}">Ansehen &amp; Rechnung erstellen →</a></div>`).join('')}
    ${S.receipts.some((r) => r.status === 'review' || r.status === 'error') ? `<div class="note warn">📷 ${S.receipts.filter((r) => r.status === 'review' || r.status === 'error').length} Beleg(e) warten auf deine Prüfung. <a href="#/belege">Zu den Belegen →</a></div>` : ''}
    ${S.expenses.some((e) => e.paid === false) ? `<div class="note">Offene Lieferantenrechnungen: <b>${kr(S.expenses.filter((e) => e.paid === false).reduce((s, e) => s + Calc.toCents(e.amount), 0))}</b>${S.expenses.some((e) => e.paid === false && e.dueDate && e.dueDate < today()) ? ' – <span style="color:var(--bad)">davon welche überfällig</span>' : ''}. <a href="#/ausgaben">Ansehen →</a></div>` : ''}
    ${prev ? `<div class="note warn">Die Momsangivelse für <b>${esc(prev.label)}</b> muss bis <b>${dmy(prev.deadline)}</b> bei SKAT eingereicht werden. <a href="#/moms">Zur Momsabrechnung →</a></div>` : ''}
    <div class="card"><b>Umsatz ${y} je Monat (netto, DKK)</b>
      <div class="bars" style="margin-bottom:22px">${months.map((v, i) => `<div style="height:${(v / mx) * 100}%" title="${kr(v)}"><span>${'JFMAMJJASOND'[i]}</span></div>`).join('')}</div></div>
    <h2>Zuletzt</h2>${invoiceTable(S.invoices.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 8))}`;
  $('#new-inv').onclick = newInvoice;
  bindInvoiceRows();
};

/* ---------- Rechnungsliste ---------- */
let invFilter = 'alle';
function invoiceTable(list) {
  if (!list.length) return '<div class="card empty">Noch keine Rechnungen.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Nr.</th><th>Datum</th><th>Kunde</th><th>Fällig</th><th class="r">Betrag</th><th>Status</th></tr></thead><tbody>
    ${list.map((i) => `<tr class="click" data-inv="${i.id}"><td>${i.number ? (i.type === 'credit' ? 'G ' : '') + i.number : '–'}</td><td>${dmy(i.date)}</td>
      <td>${esc(i.customerName || '–')} <span class="muted small">${(i.language || '').toUpperCase()}</span></td><td>${i.type === 'credit' ? '' : dmy(i.dueDate)}</td>
      <td class="r">${kr(gross(i), i.currency)}${i.currency !== 'DKK' && i.exchangeRate ? `<div class="muted small">${kr(grossDKK(i))}</div>` : ''}</td><td>${badge(i)}</td></tr>`).join('')}
  </tbody></table></div>`;
}
function bindInvoiceRows() {
  $$('[data-inv]').forEach((tr) => (tr.onclick = () => {
    const inv = S.invoices.find((i) => i.id === tr.dataset.inv);
    go(inv.status === 'draft' ? `#/rechnung/${inv.id}` : `#/druck/${inv.id}`);
  }));
}
routes.rechnungen = () => {
  const F = {
    alle: () => true, entwurf: (i) => i.status === 'draft', offen: isOpen,
    ueberfaellig: (i) => isOpen(i) && i.dueDate < today(), bezahlt: (i) => i.status === 'paid' && i.type !== 'credit', gutschrift: (i) => i.type === 'credit',
  };
  const L = { alle: 'Alle', entwurf: 'Entwürfe', offen: 'Offen', ueberfaellig: 'Überfällig', bezahlt: 'Bezahlt', gutschrift: 'Gutschriften' };
  const list = S.invoices.filter(F[invFilter]).sort((a, b) => (b.number || 1e9) - (a.number || 1e9) || b.date.localeCompare(a.date));
  $('#main').innerHTML = `<h1>Rechnungen <span class="spacer"></span><button class="primary" id="new-inv">+ Neue Rechnung</button></h1>
    <div class="tabs">${Object.entries(L).map(([k, v]) => `<button data-f="${k}" class="${k === invFilter ? 'on' : ''}">${v} (${S.invoices.filter(F[k]).length})</button>`).join('')}</div>
    ${invoiceTable(list)}`;
  $$('[data-f]').forEach((b) => (b.onclick = () => { invFilter = b.dataset.f; routes.rechnungen(); }));
  $('#new-inv').onclick = newInvoice;
  bindInvoiceRows();
};
async function newInvoice(customerId) {
  const c = S.customers.find((x) => x.id === customerId);
  const inv = await act(() => api('invoices', 'POST', {
    customerId: c?.id || '', currency: c?.currency || S.settings.defaultCurrency || 'DKK', language: c?.language || 'da', dueDays: c?.dueDays || S.settings.dueDays,
    lines: [{ text: '', qty: '1', unit: 'stk', price: '0', discount: '0', kind: 'services' }],
  }));
  go(`#/rechnung/${inv.id}`);
}

/* ---------- Rechnung bzw. Auftragsbestätigung bearbeiten ---------- */
routes.rechnung = (id) => docEditor(id, 'invoice');
routes.auftrag = (id) => docEditor(id, 'order');
function docEditor(id, kind) {
  const isOrder = kind === 'order';
  const base = isOrder ? 'orders' : 'invoices';
  const view = isOrder ? `#/auftragansicht/${id}` : `#/druck/${id}`;
  const inv = (isOrder ? S.orders : S.invoices).find((i) => i.id === id);
  if (!inv) return go(isOrder ? '#/auftraege' : '#/rechnungen');
  if (isOrder ? inv.signedAt : inv.status !== 'draft') return go(view);
  const d = JSON.parse(JSON.stringify(inv));
  const custOpts = `<option value="">– Kunde wählen –</option>` + S.customers.slice().sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => `<option value="${c.id}" ${c.id === d.customerId ? 'selected' : ''}>${esc(c.name)} (${c.country}, ${LANGS[c.language] || ''})</option>`).join('');
  const prodOpts = `<option value="">Produkt…</option>` + S.products.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  $('#main').innerHTML = `
    <h1>${isOrder ? `Auftragsbestätigung${d.number ? ' ' + d.number : ''}` : d.type === 'credit' ? `Gutschrift zu Rechnung ${d.refNumber}` : 'Rechnung'} ${isOrder ? orderBadge(d) : '<span class="badge b-draft">Entwurf</span>'}<span class="spacer"></span>
      <button id="del" class="danger">${isOrder ? 'Löschen' : 'Entwurf löschen'}</button><button id="preview">Vorschau</button><button id="save">Speichern</button><button class="primary" id="approve">${isOrder ? 'Zum Unterschreiben freigeben' : 'Genehmigen &amp; Nummer vergeben'}</button></h1>
    ${isOrder && d.status === 'sent' ? '<div class="note warn">Der Kunde hat den Link schon. Änderungen sieht er sofort, sobald du speicherst.</div>' : ''}
    <div class="card"><div class="grid">
      <label class="wide">Kunde<div class="inline"><select name="customerId">${custOpts}</select><button id="new-cust" type="button">+ Neuer Kunde</button></div></label>
      <label>${isOrder ? 'Datum' : 'Rechnungsdatum'}<input type="date" name="date" value="${d.date}"></label>
      ${isOrder ? `<label>Liefertermin (optional)<input type="date" name="deliveryDate" value="${esc(d.deliveryDate || '')}"></label>
      <label>Gültig bis (optional)<input type="date" name="validUntil" value="${esc(d.validUntil || '')}"></label>` : ''}
      <label>Zahlungsziel (Tage${isOrder ? ', für die spätere Rechnung' : ''})<input type="number" min="0" name="dueDays" value="${d.dueDays}"></label>
      <label>Sprache ${isOrder ? 'für den Kunden' : 'der Rechnung'}<select name="language">${opts(LANGS, d.language)}</select></label>
      <label>Währung<select name="currency">${CURRENCIES.map((c) => `<option ${c === d.currency ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="rate">Kurs (DKK je 1 ${esc(d.currency)})<div class="inline"><input name="exchangeRate" value="${d.currency === 'DKK' ? '1' : num(d.exchangeRate || '')}"><button id="get-rate" type="button" title="Kurs von Nationalbanken/EZB holen">Holen</button></div></label>
      <label>Momsart<select name="vatScheme">${opts(SCHEMES, d.vatScheme)}</select></label>
    </div><div id="scheme-note" class="small muted" style="margin-top:8px"></div></div>
    <div class="table-wrap"><table class="lines"><thead><tr>${isOrder ? '<th>Bild</th>' : ''}<th style="width:150px">Produkt</th><th>Beschreibung</th><th class="r">Menge</th><th>Einheit</th><th class="r">Preis</th><th class="r">Rabatt %</th><th>Art</th><th title="Zeile ohne Moms">0 %</th><th class="r">Betrag</th><th></th></tr></thead>
      <tbody id="lines"></tbody></table>
      <div style="padding:10px"><button id="add-line">+ Zeile</button></div></div>
    <div class="row" style="align-items:flex-start;margin-top:14px">
      <label style="flex:1;min-width:260px">Notiz auf ${isOrder ? 'der Auftragsbestätigung' : 'der Rechnung'} (optional)<textarea name="note" rows="3">${esc(d.note || '')}</textarea></label>
      <div class="totals card" id="totals"></div>
    </div>`;
  const tb = $('#lines');
  const lineRow = (l, i) => `<tr data-i="${i}">
      ${isOrder ? `<td class="img-cell"><label title="Bild wählen">${l.image ? `<img class="thumb-sm" src="${DocRender.safeImg(l.image)}" alt="">` : '<span class="ph">📷</span>'}<input type="file" accept="image/*" hidden data-img></label>${l.image ? '<div><button class="small" data-noimg title="Bild entfernen">✕</button></div>' : ''}</td>` : ''}
      <td><select data-k="productId">${prodOpts}</select></td>
      <td><textarea data-k="text" rows="1">${esc(l.text)}</textarea></td>
      <td><input class="num" data-k="qty" value="${esc(num(l.qty))}"></td>
      <td><select data-k="unit">${opts(UNITS, l.unit)}</select></td>
      <td><input class="num" data-k="price" value="${esc(num(l.price))}"></td>
      <td><input class="num" data-k="discount" value="${esc(num(l.discount))}" style="width:60px"></td>
      <td><select data-k="kind"><option value="services" ${l.kind !== 'goods' ? 'selected' : ''}>Leistung</option><option value="goods" ${l.kind === 'goods' ? 'selected' : ''}>Ware</option></select></td>
      <td><input type="checkbox" data-k="vatFree" ${l.vatFree ? 'checked' : ''}></td>
      <td class="r lt"></td><td><button class="small danger" data-del>✕</button></td></tr>`;
  const drawLines = () => { tb.innerHTML = d.lines.map(lineRow).join(''); bindLines(); calc(); };
  const read = () => {
    Object.assign(d, formData($('#main .card')), { note: $('[name=note]').value });
    d.exchangeRate = String(d.exchangeRate).replace(',', '.');
    $$('#lines tr').forEach((tr) => {
      const l = d.lines[tr.dataset.i];
      $$('[data-k]', tr).forEach((el) => { if (el.dataset.k !== 'productId') l[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value.replace(',', '.'); });
    });
  };
  const calc = () => {
    read();
    const t = Calc.totals(d);
    $$('#lines tr').forEach((tr) => ($('.lt', tr).textContent = kr(Calc.lineNet(d.lines[tr.dataset.i]), d.currency)));
    const foreign = d.currency !== 'DKK';
    $('#totals').innerHTML = `<div><span>Netto</span><span>${kr(t.net, d.currency)}</span></div>
      ${t.vatLines.map((v) => `<div><span>Moms ${v.rate} %</span><span>${kr(v.vat, d.currency)}</span></div>`).join('') || '<div><span>Moms</span><span>' + kr(0, d.currency) + '</span></div>'}
      <div class="grand"><span>Gesamt</span><span>${kr(t.gross, d.currency)}</span></div>
      ${foreign && d.exchangeRate > 0 ? `<div class="muted small"><span>= in DKK</span><span>${kr(Calc.toDKK(t.gross, d))}</span></div>` : ''}`;
    $('.rate').style.display = foreign ? '' : 'none';
    $('label.rate').firstChild.textContent = `Kurs (DKK je 1 ${d.currency})`;
    const c = S.customers.find((x) => x.id === d.customerId);
    const auto = c ? Calc.vatScheme(c) : null;
    $('#scheme-note').innerHTML = (auto && auto !== d.vatScheme ? `<span style="color:var(--warn)">Achtung: Für diesen Kunden wäre automatisch „${SCHEMES[auto]}“ richtig.</span> ` : '')
      + (d.vatScheme === 'eu_rc' ? `Auf der Rechnung steht der Reverse-Charge-Hinweis in der Kundensprache, die USt-IdNr. des Kunden (${esc(c?.vatId || 'fehlt!')}) wird gedruckt. Der Betrag geht bei SKAT in Rubrik B.` : '')
      + (d.vatScheme === 'export' ? 'Keine dänische Moms – der Betrag geht bei SKAT in Rubrik C.' : '');
  };
  function bindLines() {
    $$('#lines tr').forEach((tr) => {
      const l = d.lines[tr.dataset.i];
      $$('input,textarea,select', tr).forEach((el) => (el.oninput = calc));
      $('[data-del]', tr).onclick = () => { read(); d.lines.splice(tr.dataset.i, 1); drawLines(); };
      const imgIn = $('[data-img]', tr);
      if (imgIn) imgIn.onchange = async () => { read(); try { l.image = await imageToDataUrl(imgIn.files[0]); } catch (e) { toast(e.message, true); } drawLines(); };
      $('[data-noimg]', tr) && ($('[data-noimg]', tr).onclick = () => { read(); delete l.image; drawLines(); });
      $('[data-k=productId]', tr).onchange = (e) => {
        read();
        const p = S.products.find((x) => x.id === e.target.value);
        if (!p) return;
        let price = Calc.toCents(p.price);
        const pc = p.currency || 'DKK';
        if (pc !== d.currency) {
          const rate = Number(d.exchangeRate) || 0;
          if (pc === 'DKK' && rate > 0) price = Math.round(price / rate);
          else if (pc !== 'DKK') toast('Produktpreis ist in ' + pc + ' – bitte Preis prüfen.', true);
        }
        Object.assign(l, { productId: p.id, text: p['name_' + d.language] || p.name, unit: p.unit || 'stk', price: (price / 100).toFixed(2), kind: p.kind || 'services', vatFree: !!p.vatFree });
        if (isOrder && p.image) l.image = p.image;
        drawLines();
      };
      const ta = $('textarea', tr);
      const fit = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 2 + 'px'; };
      ta.addEventListener('input', fit); fit();
    });
  }
  const save = () => { read(); return act(() => api(`${base}/${id}`, 'PUT', d)); };
  $$('#main .card [name], [name=note]').forEach((el) => (el.oninput = calc));
  $('[name=customerId]').onchange = (e) => {
    const c = S.customers.find((x) => x.id === e.target.value);
    if (c) {
      $('[name=language]').value = c.language || 'da';
      $('[name=currency]').value = c.currency || 'DKK';
      $('[name=vatScheme]').value = Calc.vatScheme(c);
      if (c.dueDays) $('[name=dueDays]').value = c.dueDays;
      if ((c.currency || 'DKK') !== 'DKK') getRate();
    }
    calc();
  };
  $('[name=currency]').onchange = () => { calc(); if (d.currency !== 'DKK') getRate(); };
  $('[name=language]').onchange = () => {
    read();
    for (const l of d.lines) { const p = S.products.find((x) => x.id === l.productId); if (p) l.text = p['name_' + d.language] || p.name; }
    drawLines();
  };
  async function getRate() {
    read();
    try {
      const r = await api(`lookup/rate?currency=${d.currency}&date=${d.date}`);
      $('[name=exchangeRate]').value = num(r.rate.toFixed(4)); calc(); toast(`Kurs ${num(r.rate.toFixed(4))} (${r.source})`);
    } catch (e) { toast(e.message, true); }
  }
  $('#get-rate').onclick = getRate;
  $('#add-line').onclick = () => { read(); d.lines.push({ text: '', qty: '1', unit: 'stk', price: '0', discount: '0', kind: d.lines.at(-1)?.kind || 'services' }); drawLines(); };
  $('#save').onclick = async () => { await save(); toast('Gespeichert'); };
  $('#preview').onclick = async () => { await save(); go(view); };
  $('#del').onclick = async () => { if (confirm(isOrder ? 'Auftrag wirklich löschen?' : 'Entwurf wirklich löschen?')) { await act(() => api(`${base}/${id}`, 'DELETE')); go(isOrder ? '#/auftraege' : '#/rechnungen'); } };
  $('#approve').onclick = async () => {
    await save();
    if (isOrder) { await act(() => api(`orders/${id}/send`, 'POST', {}), 'Freigegeben – jetzt den Link an den Kunden schicken'); return go(view); }
    if (!confirm('Rechnung genehmigen? Sie bekommt dann die nächste fortlaufende Nummer und kann nicht mehr geändert werden (nur noch per Gutschrift).')) return;
    await act(() => api(`invoices/${id}/approve`, 'POST', {}), 'Rechnung genehmigt');
    go(`#/druck/${id}`);
  };
  $('#new-cust').onclick = () => customerForm(null, async (c) => { await save(); await act(() => api(`${base}/${id}`, 'PUT', { ...d, customerId: c.id, language: c.language, currency: c.currency || 'DKK', vatScheme: Calc.vatScheme(c) })); docEditor(id, kind); });
  drawLines();
}

// Bild verkleinern (Produktfotos, Bilder im Auftrag) und als eingebettete JPG-Datei zurückgeben
async function imageToDataUrl(file, max = 900) {
  if (!file) throw new Error('Kein Bild gewählt.');
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { throw new Error('Dieses Bild kann nicht gelesen werden (bitte JPG oder PNG).'); }
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}

/* ---------- Rechnungsdokument (Druck/PDF) in Kundensprache – Darstellung in docrender.js ---------- */
const renderDoc = (inv, reminder) => DocRender.render(inv, { logo: S.settings.logo, reminder, seller: inv.seller || S.settings });

routes.druck = (id) => {
  const inv = S.invoices.find((i) => i.id === id);
  if (!inv) return go('#/rechnungen');
  const reminder = location.hash.includes('?mahnung');
  const L = DocLang.get(inv.language);
  const draft = inv.status === 'draft';
  const open = isOpen(inv);
  const rest = grossDKK(inv) - (inv.paidAmount || 0);
  $('#main').innerHTML = `
    <h1 class="no-print"><a class="btn" href="#/rechnungen">← Zurück</a> ${esc(invTitle(inv))} ${badge(inv)} <span class="muted small">Ausgabe auf ${LANGS[inv.language]}</span></h1>
    ${draft ? '<div class="note warn no-print">Vorschau eines Entwurfs – noch ohne Rechnungsnummer.</div>' : ''}
    <div class="doc-actions no-print">
      ${draft ? `<a class="btn" href="#/rechnung/${id}">Bearbeiten</a>` : ''}
      <button class="primary" id="print">Drucken / Als PDF speichern</button>
      ${!draft ? `<button id="mail">Per E-Mail senden</button>` : ''}
      ${open ? `<button id="pay">Als bezahlt markieren</button>` : ''}
      ${open && inv.dueDate < today() ? `<a class="btn" href="#/druck/${id}?mahnung">Zahlungserinnerung</a>` : ''}
      ${inv.payments?.length ? `<button id="unpay">Zahlung zurücknehmen</button>` : ''}
      ${!draft && inv.type !== 'credit' && inv.status !== 'credited' ? `<button id="credit">Gutschrift erstellen</button>` : ''}
      ${!draft && inv.type !== 'credit' ? `<button id="copy">Kopieren</button>` : ''}
    </div>
    ${inv.payments?.length ? `<div class="note no-print">Zahlungen: ${inv.payments.map((p) => `${dmy(p.date)} ${kr(p.amount)}`).join(', ')}${open ? ` · offen noch ${kr(rest)}` : ''}</div>` : ''}
    <div class="doc-wrap">${renderDoc(inv, reminder)}</div>`;
  $('#print').onclick = () => { const t = document.title; document.title = `${inv.type === 'credit' ? L.credit : L.invoice}-${inv.number || 'Entwurf'}`; window.print(); document.title = t; };
  $('#mail') && ($('#mail').onclick = async () => {
    const t = Calc.totals(inv);
    const vals = { doc: inv.type === 'credit' ? L.credit : L.invoice, number: inv.number, total: DocLang.money(Calc.sign(inv) * t.gross, inv.currency, inv.language), due: DocLang.date(inv.dueDate, inv.language), company: S.settings.company };
    const c = S.customers.find((x) => x.id === inv.customerId);
    alert('Tipp: Speichere die Rechnung zuerst mit „Drucken / Als PDF speichern“ und hänge die PDF-Datei an die E-Mail an.');
    location.href = `mailto:${encodeURIComponent(c?.email || '')}?subject=${encodeURIComponent(DocLang.fill(L.mailSubject, vals))}&body=${encodeURIComponent(DocLang.fill(L.mailBody, vals))}`;
    await api(`invoices/${id}/sent`, 'POST', {}).catch(() => {});
  });
  $('#pay') && ($('#pay').onclick = () => modal(`<h2>Zahlung erfassen</h2><div class="grid">
      <label>Datum<input type="date" name="date" value="${today()}"></label>
      <label>Betrag in DKK<input name="amount" value="${num((rest / 100).toFixed(2))}"></label>
      <label class="wide"><input type="checkbox" name="full" checked> Rechnung ist damit vollständig bezahlt (Kursdifferenz/Gebühren ausgleichen)</label></div>
      <div class="modal-actions"><button onclick="closeModal()">Abbrechen</button><button class="primary" id="ok">Speichern</button></div>`, (el) => {
    $('#ok', el).onclick = async () => { const f = formData(el); await act(() => api(`invoices/${id}/pay`, 'POST', { ...f, amount: f.amount.replace(/\./g, '').replace(',', '.') }), 'Zahlung gespeichert'); closeModal(); route(); };
  }));
  $('#unpay') && ($('#unpay').onclick = async () => { if (confirm('Zahlungen zu dieser Rechnung zurücknehmen?')) { await act(() => api(`invoices/${id}/unpay`, 'POST', {})); route(); } });
  $('#credit') && ($('#credit').onclick = async () => { const c = await act(() => api(`invoices/${id}/credit`, 'POST', {})); go(`#/rechnung/${c.id}`); });
  $('#copy') && ($('#copy').onclick = async () => { const c = await act(() => api(`invoices/${id}/copy`, 'POST', {})); go(`#/rechnung/${c.id}`); });
};

/* ---------- Aufträge (Auftragsbestätigung zum Unterschreiben) ---------- */
const ORDER_STATUS = { draft: ['Entwurf', 'b-draft'], sent: ['Wartet auf Unterschrift', 'b-open'], signed: ['Unterschrieben ✔', 'b-paid'], invoiced: ['Rechnung erstellt', 'b-credit'] };
const orderBadge = (o) => { const [t, c] = ORDER_STATUS[o.status] || ['', '']; return `<span class="badge ${c}">${t}</span>`; };
const orderLink = (o) => `${(S.settings.publicUrl || location.origin).replace(/\/$/, '')}/a/${o.token}`;
let orderFilter = 'alle';
routes.auftraege = () => {
  const F = { alle: () => true, offen: (o) => o.status === 'draft' || o.status === 'sent', unterschrieben: (o) => o.status === 'signed', abgerechnet: (o) => o.status === 'invoiced' };
  const L = { alle: 'Alle', offen: 'Offen', unterschrieben: 'Unterschrieben', abgerechnet: 'Abgerechnet' };
  const list = S.orders.filter(F[orderFilter]).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  $('#main').innerHTML = `<h1>Aufträge <span class="spacer"></span><button class="primary" id="new-order">+ Neue Auftragsbestätigung</button></h1>
    <div class="note">Auftragsbestätigung mit Bildern erstellen → freigeben → der Kunde bekommt einen Link (in seiner Sprache), prüft alles und unterschreibt mit Finger oder Maus. Die Unterschrift kommt automatisch hierher zurück. Danach mit einem Klick die Rechnung erstellen.</div>
    <div class="tabs">${Object.entries(L).map(([k, v]) => `<button data-of="${k}" class="${k === orderFilter ? 'on' : ''}">${v} (${S.orders.filter(F[k]).length})</button>`).join('')}</div>
    ${list.length ? `<div class="table-wrap"><table><thead><tr><th>Nr.</th><th>Datum</th><th>Kunde</th><th>Liefertermin</th><th class="r">Betrag</th><th>Status</th></tr></thead><tbody>
    ${list.map((o) => `<tr class="click" data-o="${o.id}"><td>${o.number || '–'}</td><td>${dmy(o.date)}</td><td>${esc(o.customerName || '–')} <span class="muted small">${(o.language || '').toUpperCase()}</span></td>
      <td>${dmy(o.deliveryDate)}</td><td class="r">${kr(Calc.totals(o).gross, o.currency)}</td><td>${orderBadge(o)}${o.signedAt ? `<div class="muted small">${esc(o.signerName)}, ${dmy(o.signedAt.slice(0, 10))}</div>` : ''}</td></tr>`).join('')}
    </tbody></table></div>` : '<div class="card empty">Noch keine Aufträge.</div>'}`;
  $$('[data-of]').forEach((b) => (b.onclick = () => { orderFilter = b.dataset.of; routes.auftraege(); }));
  $('#new-order').onclick = () => newOrder();
  $$('[data-o]').forEach((tr) => (tr.onclick = () => { const o = S.orders.find((x) => x.id === tr.dataset.o); go(o.status === 'draft' ? `#/auftrag/${o.id}` : `#/auftragansicht/${o.id}`); }));
};
async function newOrder(customerId) {
  const c = S.customers.find((x) => x.id === customerId);
  const o = await act(() => api('orders', 'POST', {
    customerId: c?.id || '', currency: c?.currency || S.settings.defaultCurrency || 'DKK', language: c?.language || 'da', dueDays: c?.dueDays || S.settings.dueDays,
    lines: [{ text: '', qty: '1', unit: 'stk', price: '0', discount: '0', kind: 'goods' }],
  }));
  go(`#/auftrag/${o.id}`);
}
routes.auftragansicht = (id) => {
  const o = S.orders.find((x) => x.id === id);
  if (!o) return go('#/auftraege');
  const L = DocLang.get(o.language);
  const inv = o.invoiceId && S.invoices.find((i) => i.id === o.invoiceId);
  const link = o.token ? orderLink(o) : '';
  const local = !S.settings.publicUrl && /^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname);
  $('#main').innerHTML = `
    <h1 class="no-print"><a class="btn" href="#/auftraege">← Zurück</a> Auftragsbestätigung ${o.number || ''} ${orderBadge(o)} <span class="muted small">für den Kunden auf ${LANGS[o.language]}</span></h1>
    ${o.status === 'draft' ? '<div class="note warn no-print">Vorschau – noch nicht freigegeben.</div>' : ''}
    ${o.status === 'sent' ? `<div class="card no-print"><b>Link für den Kunden</b>
      <div class="inline" style="margin-top:6px"><input id="link" readonly value="${esc(link)}"><button id="copylink">Kopieren</button></div>
      ${local ? '<div class="note warn small">Achtung: Das Programm läuft nur auf deinem Computer bzw. in deinem WLAN – Kunden können diesen Link von außen nicht öffnen. Dafür muss RechnungsStudio auf einem Server im Internet laufen und die Adresse unter Einstellungen → „Öffentliche Adresse“ eingetragen sein. Solange kannst du die Bestätigung als PDF drucken und unterschreiben lassen.</div>' : ''}
      <div class="small muted" style="margin-top:6px">Sobald der Kunde unterschreibt, ändert sich hier der Status auf „Unterschrieben“.</div></div>` : ''}
    ${o.signedAt ? `<div class="note no-print">✔ Unterschrieben von <b>${esc(o.signerName)}</b> am ${dmy(o.signedAt.slice(0, 10))} um ${o.signedAt.slice(11, 16)} UTC${o.signerIp ? ` · IP ${esc(o.signerIp)}` : ''}${o.customerComment ? `<br>Anmerkung des Kunden: <b>${esc(o.customerComment)}</b>` : ''}</div>` : ''}
    <div class="doc-actions no-print">
      ${!o.signedAt ? `<a class="btn" href="#/auftrag/${id}">Bearbeiten</a>` : ''}
      ${o.status === 'draft' ? '<button class="primary" id="send">Zum Unterschreiben freigeben</button>' : ''}
      ${o.status === 'sent' ? '<button class="primary" id="mail">Link per E-Mail senden</button>' : ''}
      <button id="print">Drucken / Als PDF speichern</button>
      ${inv ? `<a class="btn" href="#/${inv.status === 'draft' ? 'rechnung' : 'druck'}/${inv.id}">Zur Rechnung${inv.number ? ' ' + inv.number : ''}</a>` : o.status !== 'draft' ? `<button id="toinv" class="${o.signedAt ? 'primary' : ''}">Rechnung erstellen</button>` : ''}
      <button id="copy">Kopieren</button>
    </div>
    <div class="doc-wrap">${renderDoc(o)}</div>`;
  $('#print').onclick = () => { const t = document.title; document.title = `${L.order}-${o.number || 'Entwurf'}`; window.print(); document.title = t; };
  // auf die Unterschrift warten
  if (o.status === 'sent') {
    clearTimeout(routes.auftragansicht.t);
    routes.auftragansicht.t = setTimeout(async function check() {
      if (location.hash !== `#/auftragansicht/${id}`) return;
      await reload().catch(() => {});
      if (S.orders.find((x) => x.id === id)?.signedAt) { toast('✍️ Der Kunde hat unterschrieben!'); route(); }
      else routes.auftragansicht.t = setTimeout(check, 8000);
    }, 8000);
  }
  $('#send') && ($('#send').onclick = async () => { await act(() => api(`orders/${id}/send`, 'POST', {}), 'Freigegeben'); route(); });
  $('#copylink') && ($('#copylink').onclick = () => { navigator.clipboard?.writeText(link); $('#link').select(); toast('Link kopiert'); });
  $('#mail') && ($('#mail').onclick = () => {
    const c = S.customers.find((x) => x.id === o.customerId);
    const vals = { number: o.number, total: DocLang.money(Calc.totals(o).gross, o.currency, o.language), company: S.settings.company, link };
    location.href = `mailto:${encodeURIComponent(c?.email || '')}?subject=${encodeURIComponent(DocLang.fill(L.orderMailSubject, vals))}&body=${encodeURIComponent(DocLang.fill(L.orderMailBody, vals))}`;
  });
  $('#toinv') && ($('#toinv').onclick = async () => {
    if (!o.signedAt && !confirm('Der Kunde hat noch nicht unterschrieben. Trotzdem eine Rechnung erstellen?')) return;
    const r = await act(() => api(`orders/${id}/invoice`, 'POST', {}), 'Rechnungsentwurf erstellt');
    go(`#/rechnung/${r.id}`);
  });
  $('#copy').onclick = async () => { const c = await act(() => api(`orders/${id}/copy`, 'POST', {})); go(`#/auftrag/${c.id}`); };
};

/* ---------- Kunden ---------- */
routes.kunden = () => {
  const list = S.customers.slice().sort((a, b) => a.name.localeCompare(b.name));
  $('#main').innerHTML = `<h1>Kunden <span class="spacer"></span><input id="q" placeholder="Suchen…" style="width:200px"><button class="primary" id="add">+ Neuer Kunde</button></h1>
    ${list.length ? `<div class="table-wrap"><table><thead><tr><th>Nr.</th><th>Name</th><th>Land</th><th>Sprache</th><th>USt-IdNr./CVR</th><th>Momsart</th><th class="r">Offen</th><th></th></tr></thead><tbody>
    ${list.map((c) => {
      const open = S.invoices.filter((i) => i.customerId === c.id && isOpen(i)).reduce((s, i) => s + grossDKK(i) - (i.paidAmount || 0), 0);
      return `<tr class="click" data-c="${c.id}" data-q="${esc((c.name + ' ' + (c.email || '') + ' ' + (c.cvr || '') + ' ' + (c.vatId || '')).toLowerCase())}"><td>${c.customerNo}</td><td><b>${esc(c.name)}</b><div class="muted small">${esc([c.city, c.email].filter(Boolean).join(' · '))}</div></td>
      <td>${esc(countryName(c.country))}</td><td>${LANGS[c.language] || ''}</td><td>${esc(c.vatId || c.cvr || '')}${c.vatChecked ? ' <span title="per VIES geprüft">✔</span>' : ''}</td><td class="small">${SCHEMES[Calc.vatScheme(c)]}</td>
      <td class="r">${open ? kr(open) : ''}</td><td><button class="small" data-ord-for="${c.id}">+ Auftrag</button> <button class="small" data-inv-for="${c.id}">+ Rechnung</button></td></tr>`;
    }).join('')}</tbody></table></div>` : '<div class="card empty">Noch keine Kunden. Lege den ersten Kunden an – die Sprache, die du wählst, wird für seine Rechnungen verwendet.</div>'}`;
  $('#add').onclick = () => customerForm(null, () => routes.kunden());
  $('#q').oninput = (e) => $$('[data-q]').forEach((tr) => (tr.style.display = tr.dataset.q.includes(e.target.value.toLowerCase()) ? '' : 'none'));
  $$('[data-ord-for]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); newOrder(b.dataset.ordFor); }));
  $$('[data-c]').forEach((tr) => (tr.onclick = (e) => { if (!e.target.dataset.invFor && !e.target.dataset.ordFor) customerForm(S.customers.find((c) => c.id === tr.dataset.c), () => routes.kunden()); }));
  $$('[data-inv-for]').forEach((b) => (b.onclick = () => newInvoice(b.dataset.invFor)));
};

function customerForm(c, done) {
  const d = c || { country: 'DK', language: 'da', currency: 'DKK', isBusiness: true, dueDays: '' };
  modal(`<h2>${c ? 'Kunde bearbeiten' : 'Neuer Kunde'}</h2>
    <div class="grid">
      <label>Land<select name="country">${countryOpts(d.country)}</select></label>
      <label>Kundentyp<select name="isBusiness"><option value="1" ${d.isBusiness !== false ? 'selected' : ''}>Firma</option><option value="0" ${d.isBusiness === false ? 'selected' : ''}>Privatperson</option></select></label>
      <label>Sprache der Rechnungen<select name="language">${opts(LANGS, d.language)}</select></label>
      <label class="dk-only">CVR-Nr. (Dänemark)<div class="inline"><input name="cvr" value="${esc(d.cvr || '')}"><button type="button" id="cvr-look" title="Daten aus dem CVR-Register holen">Suchen</button></div></label>
      <label class="eu-only">USt-IdNr. / VAT-Nr.<div class="inline"><input name="vatId" value="${esc(d.vatId || '')}" placeholder="z. B. DE123456789"><button type="button" id="vies">Prüfen</button></div></label>
      <label class="wide">Name / Firma<input name="name" value="${esc(d.name || '')}"></label>
      <label>Ansprechpartner<input name="contact" value="${esc(d.contact || '')}"></label>
      <label>Straße<input name="street" value="${esc(d.street || '')}"></label>
      <label>PLZ<input name="zip" value="${esc(d.zip || '')}"></label>
      <label>Ort<input name="city" value="${esc(d.city || '')}"></label>
      <label>E-Mail<input name="email" type="email" value="${esc(d.email || '')}"></label>
      <label>Telefon<input name="phone" value="${esc(d.phone || '')}"></label>
      <label>Währung<select name="currency">${CURRENCIES.map((x) => `<option ${x === d.currency ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      <label>Zahlungsziel (Tage, leer = Standard)<input name="dueDays" type="number" min="0" value="${esc(d.dueDays || '')}"></label>
      <label class="dk-only">EAN-Nr. (öffentliche Kunden)<input name="ean" value="${esc(d.ean || '')}"></label>
      <label class="wide">Interne Notiz<textarea name="note" rows="2">${esc(d.note || '')}</textarea></label>
    </div>
    <div class="note" id="sch"></div>
    <div class="modal-actions">${c ? '<button class="danger" id="del" style="margin-right:auto">Löschen</button>' : ''}<button onclick="closeModal()">Abbrechen</button><button class="primary" id="ok">Speichern</button></div>`, (el) => {
    let vatChecked = d.vatChecked || '';
    const upd = () => {
      const f = formData(el);
      const dk = f.country === 'DK';
      $$('.dk-only', el).forEach((x) => (x.style.display = dk ? '' : 'none'));
      $$('.eu-only', el).forEach((x) => (x.style.display = !dk && f.isBusiness === '1' ? '' : 'none'));
      $('#sch', el).textContent = 'Momsart auf Rechnungen: ' + SCHEMES[Calc.vatScheme({ country: f.country, isBusiness: f.isBusiness === '1', vatId: f.vatId })]
        + (f.country !== 'DK' && Calc.EU.includes(f.country) && f.isBusiness === '1' && !f.vatId ? ' – mit USt-IdNr. wäre es Reverse Charge (0 %).' : '');
    };
    $$('[name]', el).forEach((i) => (i.oninput = i.onchange = upd));
    $('[name=country]', el).addEventListener('change', (e) => {
      const lang = { DK: 'da', DE: 'de', AT: 'de', CH: 'de' }[e.target.value] || 'en';
      $('[name=language]', el).value = lang;
      $('[name=currency]', el).value = e.target.value === 'DK' ? 'DKK' : Calc.EU.includes(e.target.value) ? 'EUR' : $('[name=currency]', el).value;
      upd();
    });
    upd();
    $('#cvr-look', el).onclick = async () => {
      try {
        const r = await api('lookup/cvr?q=' + encodeURIComponent($('[name=cvr]', el).value || $('[name=name]', el).value));
        for (const k of ['name', 'cvr', 'street', 'zip', 'city', 'email', 'phone']) if (r[k]) $(`[name=${k}]`, el).value = r[k];
        toast('Daten aus dem CVR-Register übernommen');
      } catch (e) { toast(e.message, true); }
    };
    $('#vies', el).onclick = async () => {
      try {
        const r = await api('lookup/vies?vat=' + encodeURIComponent($('[name=vatId]', el).value));
        if (r.valid) {
          vatChecked = r.checkedAt;
          if (r.name && !$('[name=name]', el).value) $('[name=name]', el).value = r.name;
          if (r.address && !$('[name=street]', el).value) { const [st, ...rest] = r.address.split('\n'); $('[name=street]', el).value = st; const zc = rest.join(' ').trim().match(/^(\S+)\s+(.+)$/); if (zc) { $('[name=zip]', el).value = zc[1]; $('[name=city]', el).value = zc[2]; } }
          toast('USt-IdNr. ist gültig ✔ ' + (r.name || ''));
        } else { vatChecked = ''; toast('USt-IdNr. ist laut EU (VIES) NICHT gültig – dann keine Reverse-Charge-Rechnung!', true); }
      } catch (e) { toast(e.message, true); }
    };
    $('#ok', el).onclick = async () => {
      const f = formData(el);
      f.isBusiness = f.isBusiness === '1';
      if (!f.isBusiness || f.country === 'DK') f.vatId = f.country === 'DK' ? '' : f.vatId;
      f.vatId = (f.vatId || '').replace(/[\s.\-]/g, '').toUpperCase();
      f.vatChecked = vatChecked;
      const r = await act(() => (c ? api('customers/' + c.id, 'PUT', f) : api('customers', 'POST', f)), 'Kunde gespeichert');
      closeModal(); done && done(r);
    };
    c && ($('#del', el).onclick = async () => { if (confirm('Kunden löschen?')) { await act(() => api('customers/' + c.id, 'DELETE')); closeModal(); done && done(); } });
  });
}

/* ---------- Produkte ---------- */
routes.produkte = () => {
  $('#main').innerHTML = `<h1>Produkte &amp; Leistungen <span class="spacer"></span><button id="import">⬇ Aus Shop übernehmen</button><button class="primary" id="add">+ Neues Produkt</button></h1>
    ${S.products.length ? `<div class="table-wrap"><table><thead><tr><th></th><th>Name</th><th>Dänisch</th><th>Englisch</th><th>Einheit</th><th>Art</th><th class="r">Preis netto</th></tr></thead><tbody>
    ${S.products.map((p) => `<tr class="click" data-p="${p.id}"><td style="width:54px">${p.image ? `<img class="thumb-sm" src="${DocRender.safeImg(p.image)}" alt="">` : ''}</td><td><b>${esc(p.name_de || p.name)}</b></td><td>${esc(p.name_da || '')}</td><td>${esc(p.name_en || '')}</td><td>${UNITS[p.unit] || ''}</td>
      <td>${p.kind === 'goods' ? 'Ware' : 'Leistung'}${p.vatFree ? ' · momsfrei' : ''}</td><td class="r">${p.price === '' || p.price === undefined ? '<span class="muted">Preis offen</span>' : kr(Calc.toCents(p.price), p.currency || 'DKK')}${p.sku ? `<div class="muted small">${esc(p.brand ? p.brand + ' · ' : '')}${esc(p.sku)}</div>` : ''}</td></tr>`).join('')}</tbody></table></div>`
    : '<div class="card empty">Noch keine Produkte. Trage den Namen in allen drei Sprachen ein – auf der Rechnung erscheint automatisch die Sprache des Kunden.</div>'}`;
  const form = (p) => {
    const d = p || { unit: 'stk', kind: 'services', currency: 'DKK' };
    modal(`<h2>${p ? 'Produkt bearbeiten' : 'Neues Produkt'}</h2><div class="grid">
      <label class="wide">Name Deutsch<input name="name_de" value="${esc(d.name_de || d.name || '')}"></label>
      <label class="wide">Name Dänisch<input name="name_da" value="${esc(d.name_da || '')}"></label>
      <label class="wide">Name Englisch<input name="name_en" value="${esc(d.name_en || '')}"></label>
      <label>Preis netto (ohne Moms)<input name="price" value="${esc(num(d.price || ''))}"></label>
      <label>Währung<select name="currency">${CURRENCIES.map((x) => `<option ${x === (d.currency || 'DKK') ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      <label>Einheit<select name="unit">${opts(UNITS, d.unit)}</select></label>
      <label>Art<select name="kind"><option value="services">Dienstleistung</option><option value="goods" ${d.kind === 'goods' ? 'selected' : ''}>Ware</option></select></label>
      <label class="wide"><input type="checkbox" name="vatFree" ${d.vatFree ? 'checked' : ''}> Momsfrei (z. B. nach ML § 13 – nur wenn du sicher bist)</label>
      <div class="wide"><label>Produktbild (erscheint auf Auftragsbestätigungen)</label>
        <div class="row" style="margin-top:4px"><span id="pimg">${d.image ? `<img class="thumb-sm" style="width:80px;height:80px" src="${DocRender.safeImg(d.image)}" alt="">` : ''}</span>
        <label class="btn">📷 Bild wählen<input type="file" accept="image/*" hidden id="pimgin"></label>${d.image ? '<button type="button" id="pimgdel">Bild entfernen</button>' : ''}</div></div></div>
      <div class="modal-actions">${p ? '<button class="danger" id="del" style="margin-right:auto">Löschen</button>' : ''}<button onclick="closeModal()">Abbrechen</button><button class="primary" id="ok">Speichern</button></div>`, (el) => {
      let image = d.image || '';
      $('#pimgin', el).onchange = async (e) => {
        try { image = await imageToDataUrl(e.target.files[0], 1000); $('#pimg', el).innerHTML = `<img class="thumb-sm" style="width:80px;height:80px" src="${image}" alt="">`; } catch (err) { toast(err.message, true); }
      };
      $('#pimgdel', el) && ($('#pimgdel', el).onclick = () => { image = ''; $('#pimg', el).innerHTML = ''; });
      $('#ok', el).onclick = async () => {
        const f = formData(el);
        f.image = image;
        f.name = f.name_de || f.name_da || f.name_en;
        f.price = f.price.replace(/\./g, '').replace(',', '.');
        await act(() => (p ? api('products/' + p.id, 'PUT', f) : api('products', 'POST', f)), 'Gespeichert');
        closeModal(); routes.produkte();
      };
      p && ($('#del', el).onclick = async () => { await act(() => api('products/' + p.id, 'DELETE')); closeModal(); routes.produkte(); });
    });
  };
  $('#add').onclick = () => form();
  $('#import').onclick = productImport;
  $$('[data-p]').forEach((tr) => (tr.onclick = () => form(S.products.find((p) => p.id === tr.dataset.p))));
};

/* Produkte aus einem Shop übernehmen: Adressen von Produktseiten (oder eine Kategorie-/Sitemap-Adresse) oder eine CSV-Datei */
function productImport() {
  modal(`<h2>Produkte aus Shop übernehmen</h2>
    <p class="small muted">Es werden Name, Artikelnummer, Marke und Bild übernommen und der Name ins Deutsche, Dänische und Englische übersetzt. <b>Preise bleiben leer</b>, die setzt du erst beim Verkauf.</p>
    <div class="tabs"><button class="on" data-tab="urls">Shop-Adressen</button><button data-tab="pages">Gespeicherte Seiten</button><button data-tab="csv">CSV-Datei</button></div>
    <div id="tab-urls"><label>Adressen von Produktseiten (eine pro Zeile) oder die Adresse einer Kategorie bzw. der Sitemap<textarea id="urls" rows="5" placeholder="https://shop.l-shop-team.de/de/…"></textarea></label>
      <label style="margin-top:8px"><input type="checkbox" id="expand"> Das ist eine Kategorie-/Sitemap-Adresse: alle Produktseiten darauf suchen (bis 60)</label></div>
    <div id="tab-pages" class="hidden"><div class="note small">Für Shops mit <b>Bot-Schutz oder Anmeldung</b>: Produktseite im Browser öffnen (angemeldet), <b>Strg + S</b> drücken, Typ „Webseite, nur HTML“ wählen und speichern. Das für jedes Produkt wiederholen, dann hier alle Dateien auf einmal auswählen.</div>
      <label>Gespeicherte Produktseiten (HTML, mehrere möglich)<input type="file" id="pagefiles" accept=".html,.htm" multiple></label></div>
    <div id="tab-csv" class="hidden"><label>Exportdatei oder Preisliste aus dem Shop (CSV) – Spalten wie „Artikelnummer“, „Name/Bezeichnung“, „Marke“<input type="file" id="csvfile" accept=".csv,.txt"></label></div>
    <div id="imp-out" style="margin-top:12px"></div>
    <div class="modal-actions"><button onclick="closeModal()">Schließen</button><button class="primary" id="imp-go">Vorschau laden</button><button class="primary hidden" id="imp-save">Ausgewählte übernehmen</button></div>`, (el) => {
    $('.modal-box').classList.add('wide');
    let mode = 'urls', items = [];
    $$('[data-tab]', el).forEach((b) => (b.onclick = () => { mode = b.dataset.tab; $$('[data-tab]', el).forEach((x) => x.classList.toggle('on', x === b)); $('#tab-urls', el).classList.toggle('hidden', mode !== 'urls'); $('#tab-csv', el).classList.toggle('hidden', mode !== 'csv'); $('#tab-pages', el).classList.toggle('hidden', mode !== 'pages'); }));
    $('#imp-go', el).onclick = async () => {
      const out = $('#imp-out', el);
      let body;
      if (mode === 'pages') {
        const fs = [...$('#pagefiles', el).files]; if (!fs.length) return toast('Bitte Dateien wählen.', true);
        body = { pages: await Promise.all(fs.map(async (f) => ({ name: f.name, html: await f.text() }))) };
      } else if (mode === 'csv') {
        const f = $('#csvfile', el).files[0]; if (!f) return toast('Bitte eine Datei wählen.', true);
        const buf = await f.arrayBuffer(); let t = new TextDecoder('utf-8').decode(buf); if (t.includes('\uFFFD')) t = new TextDecoder('windows-1252').decode(buf);
        body = { csv: t };
      } else body = { urls: $('#urls', el).value, expand: $('#expand', el).checked };
      out.innerHTML = '<span class="spin"></span> Lade Produkte und übersetze… (das kann eine Minute dauern)';
      $('#imp-go', el).disabled = true;
      try {
        const r = await api('products/import/preview', 'POST', body);
        items = r.items;
        out.innerHTML = `${!r.translated ? `<div class="note warn small">${esc(r.translateError || (r.canTranslate ? 'Übersetzung nicht möglich.' : 'Übersetzung nicht möglich – dafür braucht es den API-Schlüssel (Einstellungen → Belegerkennung).'))} Die Namen kommen nur auf Deutsch, Dänisch und Englisch kannst du später nachtragen.</div>` : ''}
          ${r.errors.length ? `<div class="note warn small">${r.errors.length} Adresse(n) nicht lesbar: ${esc(r.errors.slice(0, 3).map((e) => (e.url ? e.url + ' – ' : '') + e.error).join(' · '))}</div>` : ''}
          <div class="table-wrap" style="max-height:42vh;overflow:auto"><table><thead><tr><th></th><th></th><th>Deutsch</th><th>Dänisch</th><th>Englisch</th><th>Art-Nr.</th><th>Einheit</th></tr></thead><tbody>
          ${items.map((p, i) => `<tr><td><input type="checkbox" data-sel="${i}" ${p.exists ? '' : 'checked'}></td><td>${p.image ? `<img class="thumb-sm" src="${DocRender.safeImg(p.image)}" alt="">` : ''}</td>
            <td><input data-f="de" data-i="${i}" value="${esc(p.de)}"></td><td><input data-f="da" data-i="${i}" value="${esc(p.da)}"></td><td><input data-f="en" data-i="${i}" value="${esc(p.en)}"></td>
            <td class="small">${esc(p.sku)}${p.exists ? '<div class="badge b-open">schon da</div>' : ''}</td><td><select data-f="unit" data-i="${i}">${opts(UNITS, p.unit)}</select></td></tr>`).join('')}</tbody></table></div>`;
        $$('[data-f]', out).forEach((inp) => (inp.oninput = inp.onchange = () => { items[inp.dataset.i][inp.dataset.f] = inp.value; }));
        $('#imp-save', el).classList.remove('hidden'); $('#imp-go', el).classList.add('hidden');
      } catch (e) { out.innerHTML = `<div class="note warn">${esc(e.message)}</div>`; }
      $('#imp-go', el).disabled = false;
    };
    $('#imp-save', el).onclick = async () => {
      const sel = $$('[data-sel]', el).filter((c) => c.checked).map((c) => items[c.dataset.sel]);
      if (!sel.length) return toast('Nichts ausgewählt.', true);
      const r = await act(() => api('products/import/save', 'POST', { items: sel }), 'Produkte übernommen');
      toast(`${r.added} Produkte übernommen${r.skipped ? `, ${r.skipped} schon vorhanden` : ''}. Preise setzt du beim Verkauf.`);
      closeModal(); routes.produkte();
    };
  });
}

/* ---------- Ausgaben (Købsmoms) und sonstige Einnahmen ---------- */
const CATS = Fradrag.names;
const catOpts = (sel) => { const cur = Fradrag.byName(sel || 'Diverse').name; return CATS.map((c) => `<option ${c === cur ? 'selected' : ''}>${esc(c)}</option>`).join(''); };
// Abziehbarer Anteil (Moms/Steuer) – wird beim Wechsel der Kategorie vorgeschlagen und kann angepasst werden
const sharesHtml = (d) => `<label>Moms abziehbar (%)<input name="vatShare" type="number" min="0" max="100" value="${esc(d.vatShare ?? '')}"></label>
    <label>Steuerlich absetzbar (%)<input name="taxShare" type="number" min="0" max="100" value="${esc(d.taxShare ?? '')}"></label>
    <div class="wide small muted cat-info"></div>`;
function bindShares(el, fresh) {
  const cat = $('[name=category]', el);
  const info = () => {
    const c = Fradrag.byName(cat.value);
    const net = numIn($('[name=amount]', el)?.value || 0) - numIn($('[name=vat]', el)?.value || 0);
    const limit = Fradrag.rates(Number(($('[name=date]', el)?.value || today()).slice(0, 4))).smallAsset;
    $('.cat-info', el).innerHTML = (c.info ? '💡 ' + esc(c.info) : '')
      + (/Werkzeug|Computer/.test(c.name) && net > limit ? `<div style="color:var(--warn)">Über ${kr(limit * 100)} netto: nicht sofort absetzbar, sondern über Abschreibung (der revisor trägt es ins Anlageverzeichnis ein).</div>` : '');
  };
  const fill = () => { const sh = Fradrag.shares(cat.value, S.settings); $('[name=vatShare]', el).value = sh.vat; $('[name=taxShare]', el).value = sh.tax; info(); };
  cat.addEventListener('change', fill);
  $('[name=amount]', el)?.addEventListener('input', info);
  if (fresh || $('[name=vatShare]', el).value === '') fill(); else info();
}
const INCOME_CATS = ['Verkauf/Leistung', 'Barverkauf', 'Plattform-Auszahlung', 'Sonstige Einnahme'];
const isPaid = (x) => x.paid !== false; // ältere Einträge ohne Angabe gelten als bezahlt
const clip = (x) => (x.receiptId ? ` <a href="/beleg/${x.receiptId}" target="_blank" title="Beleg ansehen" onclick="event.stopPropagation()">📎</a>` : '');
const openBadge = (x) => (isPaid(x) ? '' : ` <span class="badge ${x.dueDate && x.dueDate < today() ? 'b-over' : 'b-open'}">offen${x.dueDate ? ' bis ' + dmy(x.dueDate) : ''}</span>`);
let moneyTab = 'expenses';
routes.ausgaben = () => {
  const exp = S.expenses.slice().sort((a, b) => b.date.localeCompare(a.date));
  const inc = S.incomes.slice().sort((a, b) => b.date.localeCompare(a.date));
  const unpaid = S.expenses.filter((e) => !isPaid(e));
  $('#main').innerHTML = `<h1>Ausgaben &amp; Einnahmen <span class="spacer"></span><a class="btn" href="#/belege">📷 Beleg fotografieren</a><button class="primary" id="add">+ ${moneyTab === 'expenses' ? 'Neue Ausgabe' : 'Neue Einnahme'}</button></h1>
    <div class="tabs"><button data-t="expenses" class="${moneyTab === 'expenses' ? 'on' : ''}">Ausgaben (${exp.length})</button><button data-t="incomes" class="${moneyTab === 'incomes' ? 'on' : ''}">Sonstige Einnahmen (${inc.length})</button></div>
    ${moneyTab === 'expenses' ? `
    <div class="note">Die Moms in deinen Ausgaben wird automatisch als <b>Købsmoms</b> von der Zahllast abgezogen. Einkäufe ohne Moms aus anderen EU-Ländern als „EU-Einkauf“ markieren, dann wird die Erwerbsmoms in Rubrik A richtig berechnet.
      ${unpaid.length ? `<br><b>Offene Lieferantenrechnungen: ${kr(unpaid.reduce((s, e) => s + Calc.toCents(e.amount), 0))}</b> (${unpaid.length})` : ''}</div>
    ${exp.length ? `<div class="table-wrap"><table><thead><tr><th>Datum</th><th>Lieferant</th><th>Text</th><th>Kategorie</th><th class="r">Betrag</th><th class="r">Moms</th></tr></thead><tbody>
    ${exp.map((e) => `<tr class="click" data-e="${e.id}"><td>${dmy(e.date)}</td><td>${esc(e.supplier)}${clip(e)}</td><td>${esc(e.text)}${openBadge(e)}</td><td>${esc(e.category)}${e.euPurchase ? ' <span class="badge b-open">EU-Einkauf</span>' : ''}</td>
      <td class="r">${kr(Calc.toCents(e.amount))}</td><td class="r">${e.euPurchase ? '<span class="muted">Rubrik A</span>' : kr(Calc.toCents(e.vat))}${Calc.vatShare(e) < 100 && !e.euPurchase ? `<div class="muted small">davon ${Calc.vatShare(e)} % abziehbar</div>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="card empty">Noch keine Ausgaben. Am einfachsten: Beleg fotografieren.</div>'}`
    : `<div class="note">Einnahmen ohne eigene Rechnung, z. B. Barverkäufe oder Auszahlungen von Plattformen. Die enthaltene Moms zählt als Salgsmoms. Für Kunden schreibst du besser eine richtige Rechnung.</div>
    ${inc.length ? `<div class="table-wrap"><table><thead><tr><th>Datum</th><th>Von</th><th>Text</th><th>Kategorie</th><th class="r">Betrag</th><th class="r">Moms</th></tr></thead><tbody>
    ${inc.map((e) => `<tr class="click" data-i="${e.id}"><td>${dmy(e.date)}</td><td>${esc(e.name)}${clip(e)}</td><td>${esc(e.text)}${openBadge(e)}</td><td>${esc(e.category)}</td>
      <td class="r">${kr(Calc.toCents(e.amount))}</td><td class="r">${kr(Calc.toCents(e.vat))}</td></tr>`).join('')}</tbody></table></div>` : '<div class="card empty">Noch keine sonstigen Einnahmen.</div>'}`}`;
  $$('[data-t]').forEach((b) => (b.onclick = () => { moneyTab = b.dataset.t; routes.ausgaben(); }));
  $('#add').onclick = () => (moneyTab === 'expenses' ? expenseForm() : incomeForm());
  $$('[data-e]').forEach((tr) => (tr.onclick = () => expenseForm(S.expenses.find((e) => e.id === tr.dataset.e))));
  $$('[data-i]').forEach((tr) => (tr.onclick = () => incomeForm(S.incomes.find((e) => e.id === tr.dataset.i))));
};
const numIn = (v) => Number(String(v).replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')) || 0;
// Beleg ansehen bzw. nachträglich anhängen (Bogføringsloven: zu jeder Buchung gehört ein Beleg)
function receiptRow(item, kind) {
  if (!item) return '';
  return `<div class="wide row small">${item.receiptId ? `<a class="btn" href="/beleg/${item.receiptId}" target="_blank">📎 Beleg ansehen</a>`
    : `<label class="btn">📎 Beleg anhängen<input type="file" accept="image/*,application/pdf" hidden data-attach="${kind}"></label><span class="muted">Zu jeder Buchung gehört ein Beleg.</span>`}
    ${item.bankId ? '<span class="muted">✔ mit Lunar-Buchung verknüpft</span>' : ''}</div>`;
}
function bindAttach(el, item, done) {
  const inp = $('[data-attach]', el);
  if (!inp) return;
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    try { const up = await fileToUpload(f); await act(() => api('receipts', 'POST', { ...up, attachTo: { kind: inp.dataset.attach, id: item.id } }), 'Beleg angehängt'); closeModal(); done(); }
    catch (e) { toast(e.message, true); }
  };
}
function expenseForm(e) {
  const d = e || { date: today(), category: 'Diverse', euPurchase: '', deductible: true, paid: true };
  modal(`<h2>${e ? 'Ausgabe bearbeiten' : 'Neue Ausgabe'}</h2><div class="grid">
    <label>Datum<input type="date" name="date" value="${d.date}"></label>
    <label>Lieferant<input name="supplier" value="${esc(d.supplier || '')}"></label>
    <label class="wide">Text<input name="text" value="${esc(d.text || '')}"></label>
    <label>Kategorie<select name="category">${catOpts(d.category)}</select></label>
    <label>Art<select name="euPurchase"><option value="">Normal (Dänemark, mit Moms)</option><option value="goods" ${d.euPurchase === 'goods' ? 'selected' : ''}>EU-Einkauf Waren ohne Moms</option><option value="services" ${d.euPurchase === 'services' ? 'selected' : ''}>EU-/Ausland-Einkauf Dienstleistung ohne Moms</option></select></label>
    <label><span id="amt-l">Betrag inkl. Moms (DKK)</span><input name="amount" inputmode="decimal" value="${esc(num(d.amount || ''))}"></label>
    <label class="vat-l">Darin enthaltene Moms (DKK)<div class="inline"><input name="vat" inputmode="decimal" value="${esc(num(d.vat || ''))}"><button type="button" id="v25" title="20 % vom Bruttobetrag = 25 % Moms">25 %</button></div></label>
    <label>Rechnungs-/Belegnummer<input name="invoiceNumber" value="${esc(d.invoiceNumber || '')}"></label>
    <label><input type="checkbox" name="paid" ${isPaid(d) ? 'checked' : ''}> Bezahlt</label>
    <label class="due-l">Fällig am<input type="date" name="dueDate" value="${esc(d.dueDate || '')}"></label>
    ${sharesHtml(d)}
    ${receiptRow(e, 'expense')}</div>
    <div class="modal-actions">${e ? '<button class="danger" id="del" style="margin-right:auto">Löschen</button>' : ''}<button onclick="closeModal()">Abbrechen</button><button class="primary" id="ok">Speichern</button></div>`, (el) => {
    const upd = () => {
      const eu = $('[name=euPurchase]', el).value;
      $('#amt-l', el).textContent = eu ? 'Betrag ohne Moms (DKK)' : 'Betrag inkl. Moms (DKK)';
      $('.vat-l', el).style.display = eu ? 'none' : '';
      $('.due-l', el).style.display = $('[name=paid]', el).checked ? 'none' : '';
    };
    $('[name=euPurchase]', el).onchange = upd; $('[name=paid]', el).onchange = upd; upd();
    $('#v25', el).onclick = () => ($('[name=vat]', el).value = num((Math.round(numIn($('[name=amount]', el).value) * 20) / 100).toFixed(2)));
    $('[name=amount]', el).addEventListener('change', () => { if (!$('[name=vat]', el).value) $('#v25', el).click(); });
    bindAttach(el, e, () => routes.ausgaben());
    bindShares(el, !e);
    $('#ok', el).onclick = async () => {
      const f = formData(el);
      f.deductible = true;
      f.amount = numIn(f.amount).toFixed(2); f.vat = f.euPurchase ? '0.00' : numIn(f.vat).toFixed(2);
      if (f.paid && !isPaid(d)) f.paidDate = today();
      if (f.paid) f.dueDate = '';
      await act(() => (e ? api('expenses/' + e.id, 'PUT', f) : api('expenses', 'POST', f)), 'Gespeichert');
      closeModal(); route();
    };
    e && ($('#del', el).onclick = async () => { if (confirm('Ausgabe löschen?' + (e.receiptId ? ' Der Beleg bleibt unter „Belege“ erhalten.' : ''))) { await act(() => api('expenses/' + e.id, 'DELETE')); closeModal(); route(); } });
  });
}
function incomeForm(e) {
  const d = e || { date: today(), category: 'Verkauf/Leistung', paid: true };
  modal(`<h2>${e ? 'Einnahme bearbeiten' : 'Neue Einnahme'}</h2><div class="grid">
    <label>Datum<input type="date" name="date" value="${d.date}"></label>
    <label>Von (Kunde/Plattform)<input name="name" value="${esc(d.name || '')}"></label>
    <label class="wide">Text<input name="text" value="${esc(d.text || '')}"></label>
    <label>Kategorie<select name="category">${INCOME_CATS.map((c) => `<option ${c === d.category ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    <label>Belegnummer<input name="documentNumber" value="${esc(d.documentNumber || '')}"></label>
    <label>Betrag inkl. Moms (DKK)<input name="amount" inputmode="decimal" value="${esc(num(d.amount || ''))}"></label>
    <label>Darin enthaltene Moms (DKK)<div class="inline"><input name="vat" inputmode="decimal" value="${esc(num(d.vat || ''))}"><button type="button" id="v25">25 %</button></div></label>
    <label class="wide"><input type="checkbox" name="paid" ${isPaid(d) ? 'checked' : ''}> Geld ist eingegangen</label>
    ${receiptRow(e, 'income')}</div>
    <div class="modal-actions">${e ? '<button class="danger" id="del" style="margin-right:auto">Löschen</button>' : ''}<button onclick="closeModal()">Abbrechen</button><button class="primary" id="ok">Speichern</button></div>`, (el) => {
    $('#v25', el).onclick = () => ($('[name=vat]', el).value = num((Math.round(numIn($('[name=amount]', el).value) * 20) / 100).toFixed(2)));
    bindAttach(el, e, () => routes.ausgaben());
    $('#ok', el).onclick = async () => {
      const f = formData(el);
      f.amount = numIn(f.amount).toFixed(2); f.vat = numIn(f.vat).toFixed(2);
      await act(() => (e ? api('incomes/' + e.id, 'PUT', f) : api('incomes', 'POST', f)), 'Gespeichert');
      closeModal(); route();
    };
    e && ($('#del', el).onclick = async () => { if (confirm('Einnahme löschen?')) { await act(() => api('incomes/' + e.id, 'DELETE')); closeModal(); route(); } });
  });
}

/* ---------- Abzüge (Fradrag): was die Firma absetzen kann ---------- */
let fradragYear = new Date().getFullYear();
// steuerlich absetzbarer Betrag einer Ausgabe in Øre: Netto × Steueranteil + nicht abziehbare Moms (wird zu Kosten) × Steueranteil
function expenseDeduction(e) {
  const gross = Calc.toCents(e.amount), vat = e.euPurchase ? 0 : Calc.toCents(e.vat);
  const net = gross - vat;
  const vatShare = Calc.vatShare(e), taxShare = e.taxShare === undefined || e.taxShare === '' ? 100 : Number(e.taxShare);
  const vatBack = Math.round((vat * vatShare) / 100);
  let tax = Math.round(((net + vat - vatBack) * taxShare) / 100);
  // Maschinen/IT über der Grenze für Sofortabschreibung: im ersten Jahr höchstens 25 % (Saldo-Abschreibung)
  const big = /Werkzeug|Computer/.test(Fradrag.byName(e.category).name) && net > Fradrag.rates(Number(String(e.date).slice(0, 4))).smallAsset * 100;
  if (big) tax = Math.round(tax * 0.25);
  return { net, vatBack, tax, big };
}
routes.abzuege = () => {
  const y = fradragYear, s = S.settings, R = Fradrag.rates(y);
  const exp = S.expenses.filter((e) => String(e.date).startsWith(y));
  const trips = S.trips.filter((t) => String(t.date).startsWith(y)).sort((a, b) => b.date.localeCompare(a.date));
  const km = trips.reduce((a, t) => a + (Number(t.km) || 0), 0);
  const kmOpen = trips.filter((t) => !t.expenseId).reduce((a, t) => a + (Number(t.km) || 0), 0);
  const mileage = Fradrag.mileage(km, y);
  // je Kategorie
  const per = {};
  let tNet = 0, tVat = 0, tTax = 0;
  for (const e of exp) {
    const c = Fradrag.byName(e.category).name, d = expenseDeduction(e);
    const p = per[c] || (per[c] = { n: 0, net: 0, vat: 0, tax: 0, big: 0 });
    p.n++; p.net += d.net; p.vat += d.vatBack; p.tax += d.tax; if (d.big) p.big++;
    tNet += d.net; tVat += d.vatBack; tTax += d.tax;
  }
  // Kilometergeld der noch nicht abgerechneten Fahrten (abgerechnete stecken schon in den Ausgaben)
  const extra = Fradrag.mileage(km, y) - Fradrag.mileage(km - kmOpen, y);
  const rate = Number(s.taxRate) || 0;
  const form = s.legalForm || 'aps';
  const years = [new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2];
  const catalog = Fradrag.CATALOG.filter((c) => !c.forms || c.forms.includes(form));
  const groups = [...new Set(catalog.map((c) => c.group))];
  const status = (c) => {
    if (c.id === 'mileage') return trips.length ? `<span class="badge b-paid">✔ ${trips.length} Fahrten, ${km.toLocaleString('de-DE')} km</span>` : '<span class="badge b-draft">noch keine Fahrten</span>';
    if (c.private) return '<span class="badge b-credit">privat · Steuererklärung</span>';
    const n = exp.filter((e) => c.cats.includes(Fradrag.byName(e.category).name));
    return n.length ? `<span class="badge b-paid">✔ ${n.length} Buchung(en), ${kr(n.reduce((a, e) => a + expenseDeduction(e).tax, 0))} absetzbar</span>` : '<span class="badge b-draft">noch nichts gebucht – prüfen</span>';
  };
  $('#main').innerHTML = `<h1>Abzüge ${y} <span class="spacer"></span><select id="fy" style="width:auto">${years.map((x) => `<option ${x === y ? 'selected' : ''}>${x}</option>`).join('')}</select></h1>
    <div class="note">Hier siehst du, was deine Firma ${y} absetzen kann – bei der <b>Moms</b> (Købsmoms, sofort bei jeder Moms-Abrechnung) und bei der <b>Steuer</b> (Jahresabschluss). Jede Ausgabe bekommt automatisch den richtigen Anteil nach ihrer Kategorie; du kannst ihn bei jeder Ausgabe ändern.
      <br><span class="small">Stand der Recherche: Oktober 2026, Sätze für ${y}. Keine Steuerberatung – bitte einmal im Jahr mit deinem revisor abgleichen.</span></div>
    <div class="cards">
      <div class="card stat"><div class="k">Ausgaben ${y} (netto)</div><div class="v">${kr(tNet)}</div><div class="s">${exp.length} Buchungen</div></div>
      <div class="card stat"><div class="k">Moms zurück (Købsmoms)</div><div class="v">${kr(tVat)}</div><div class="s">schon in der Moms-Abrechnung</div></div>
      <div class="card stat"><div class="k">Steuerlich absetzbar</div><div class="v">${kr(tTax + (extra || 0))}</div><div class="s">inkl. ${kr(extra || 0)} offenes Kilometergeld</div></div>
      <div class="card stat"><div class="k">Geschätzte Steuerersparnis</div><div class="v">${kr(Math.round(((tTax + (extra || 0)) * rate) / 100))}</div><div class="s">bei ${rate} % Steuersatz (Angabe unten)</div></div>
    </div>

    <h2>Nach Kategorie</h2>
    ${Object.keys(per).length ? `<div class="table-wrap"><table><thead><tr><th>Kategorie</th><th class="r">Buchungen</th><th class="r">Netto</th><th class="r">Moms zurück</th><th class="r">Steuerlich absetzbar</th></tr></thead><tbody>
      ${Object.entries(per).sort((a, b) => b[1].tax - a[1].tax).map(([c, p]) => `<tr><td>${esc(c)}</td><td class="r">${p.n}</td><td class="r">${kr(p.net)}</td><td class="r">${kr(p.vat)}</td><td class="r"><b>${kr(p.tax)}</b>${p.big ? `<div class="muted small">davon ${p.big}× Abschreibung 25 % (über ${kr(R.smallAsset * 100)})</div>` : ''}</td></tr>`).join('')}
      <tr><td><b>Summe</b></td><td class="r">${exp.length}</td><td class="r"><b>${kr(tNet)}</b></td><td class="r"><b>${kr(tVat)}</b></td><td class="r"><b>${kr(tTax)}</b></td></tr>
    </tbody></table></div>` : '<div class="card empty">Für dieses Jahr noch keine Ausgaben gebucht.</div>'}

    <h2>Fahrtenbuch (Kilometergeld)</h2>
    <div class="card">
      <div class="small muted" style="margin-bottom:8px">Firmenfahrten mit dem <b>privaten Auto</b>: ${y} gibt es ${String(R.kmLow).replace('.', ',')} kr./km für die ersten ${R.kmLimit.toLocaleString('de-DE')} km, danach ${String(R.kmHigh).replace('.', ',')} kr./km. Pflicht im Fahrtenbuch: Datum, Ziel mit Adresse, Zweck, km. ${form === 'aps' ? 'Bei der ApS zahlt dir die Firma das Kilometergeld steuerfrei aus – mit „Als Ausgabe buchen“ entsteht die Buchung, dann den Betrag von Lunar an dich überweisen.' : 'Im Einzelunternehmen ist das Kilometergeld eine Betriebsausgabe – mit „Als Ausgabe buchen“ entsteht die Buchung.'} Tankbelege vom Privatauto dann nicht zusätzlich buchen.</div>
      <div class="grid" id="tripform">
        <label>Datum<input type="date" name="date" value="${today()}"></label>
        <label>Von<input name="from" value="${esc([s.street, s.city].filter(Boolean).join(', '))}"></label>
        <label>Nach (Adresse)<input name="to" placeholder="z. B. Kunde, Straße, Ort"></label>
        <label>Zweck<input name="purpose" placeholder="z. B. Lieferung Auftrag 1004"></label>
        <label>Kilometer<input name="km" inputmode="decimal"></label>
        <label style="align-self:end"><input type="checkbox" name="round" checked> Hin und zurück (km × 2)</label>
        <div style="align-self:end"><button class="primary" id="addtrip">Fahrt eintragen</button></div>
      </div>
      ${trips.length ? `<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Datum</th><th>Von → Nach</th><th>Zweck</th><th class="r">km</th><th></th></tr></thead><tbody>
        ${trips.map((t) => `<tr><td>${dmy(t.date)}</td><td>${esc(t.from)} → ${esc(t.to)}</td><td>${esc(t.purpose)}</td><td class="r">${Number(t.km).toLocaleString('de-DE')}</td>
          <td>${t.expenseId ? '<span class="badge b-paid">abgerechnet</span>' : `<button class="small danger" data-deltrip="${t.id}">✕</button>`}</td></tr>`).join('')}
        <tr><td colspan="3"><b>Summe ${y}</b> · Kilometergeld ${kr(mileage)}</td><td class="r"><b>${km.toLocaleString('de-DE')}</b></td><td></td></tr></tbody></table></div>` : ''}
      <div class="row" style="margin-top:10px">${kmOpen ? `<button id="booktrips" class="primary">Kilometergeld für ${kmOpen.toLocaleString('de-DE')} km als Ausgabe buchen</button>` : ''}${trips.length ? '<button id="tripcsv">Fahrtenbuch als CSV (für den revisor)</button>' : ''}</div>
    </div>

    <h2>Deine Angaben</h2>
    <div class="card" id="fsettings"><div class="grid">
      <label>Rechtsform<select name="legalForm">${opts(Fradrag.LEGAL_FORMS, form)}</select></label>
      <label>Fahrzeug der Firma<select name="vehicle">${opts({ none: 'Kein Firmenfahrzeug (Privatauto → Kilometergeld)', van: 'Transporter mit gelben Kennzeichen', car: 'Pkw mit weißen Kennzeichen' }, s.vehicle || 'none')}</select></label>
      <label>Firmenanteil Pkw laut Fahrtenbuch (%)<input type="number" min="0" max="100" name="carShare" value="${esc(s.carShare ?? 0)}"></label>
      <label>Firmenanteil Telefon/Internet (privat mitgenutzt, %)<input type="number" min="0" max="100" name="phoneShare" value="${esc(s.phoneShare ?? 50)}"></label>
      <label>Anteil Arbeitszimmer an der Wohnung (%)<input type="number" min="0" max="100" name="homeOfficeShare" value="${esc(s.homeOfficeShare ?? 0)}"></label>
      <label>Steuersatz für die Schätzung (%)<input type="number" min="0" max="70" name="taxRate" value="${esc(s.taxRate ?? 22)}"></label>
    </div>
    <div class="small muted" style="margin-top:6px">ApS: 22 % Selskabsskat. Einzelunternehmen: dein persönlicher Grenzsteuersatz (oft 37–52 %). Arbeitszimmer nur, wenn der Raum ausschließlich für die Firma genutzt wird (siehe unten). Die Anteile gelten für neue Buchungen; bestehende Ausgaben behalten ihren Wert.</div>
    <div class="row" style="margin-top:10px"><button class="primary" id="savefs">Angaben speichern</button></div></div>

    <h2>Was du absetzen kannst – Checkliste</h2>
    <div class="small muted" style="margin-bottom:8px">„noch nichts gebucht“ heißt: Prüfe, ob du hier Ausgaben hast, die noch fehlen. Grüne Punkte sind schon erfasst.</div>
    ${groups.map((g) => `<h3 style="margin:18px 0 8px">${esc(g)}</h3>
      ${catalog.filter((c) => c.group === g).map((c) => `<div class="card fr-card">
        <div class="row" style="justify-content:space-between;align-items:flex-start"><div><b>${esc(c.title)}</b> <span class="muted small">(dänisch: ${esc(c.dk)})</span></div>${status(c)}</div>
        <div class="fr-badges"><span>Steuer: <b>${esc(c.tax)}</b></span><span>Moms: <b>${esc(c.vat)}</b></span></div>
        <div>${esc(c.how)}</div>
        ${c.warn ? `<div class="note warn small" style="margin:8px 0 0">${esc(c.warn)}</div>` : ''}
        ${c.sources?.length ? `<div class="small" style="margin-top:6px">Quellen: ${c.sources.map((q) => `<a href="${esc(q.url)}" target="_blank" rel="noopener">${esc(q.label)}</a>`).join(' · ')}</div>` : ''}
      </div>`).join('')}`).join('')}
    <div class="note small">Alle Angaben beruhen auf einer Recherche im Oktober 2026 (u. a. skat.dk, Skattestyrelsens Juridisk vejledning, Skatteministeriet) und sind keine Steuerberatung. Regeln und Sätze ändern sich jedes Jahr – im Zweifel den revisor fragen.</div>`;

  $('#fy').onchange = (e) => { fradragYear = Number(e.target.value); routes.abzuege(); };
  $('#savefs').onclick = async () => { await act(() => api('settings', 'PUT', formData($('#fsettings'))), 'Angaben gespeichert'); routes.abzuege(); };
  $('#addtrip').onclick = async () => {
    const f = formData($('#tripform'));
    const k = numIn(f.km);
    if (!f.to.trim() || !(k > 0)) return toast('Bitte Ziel und Kilometer eintragen.', true);
    await act(() => api('trips', 'POST', { date: f.date, from: f.from, to: f.to, purpose: f.purpose, km: f.round ? k * 2 : k }), 'Fahrt eingetragen');
    routes.abzuege();
  };
  $$('[data-deltrip]').forEach((b) => (b.onclick = async () => { if (confirm('Fahrt löschen?')) { await act(() => api('trips/' + b.dataset.deltrip, 'DELETE')); routes.abzuege(); } }));
  $('#booktrips') && ($('#booktrips').onclick = async () => {
    const ex = await act(() => api('trips/book', 'POST', { year: y }), 'Kilometergeld als Ausgabe gebucht');
    toast(`Gebucht: ${kr(Calc.toCents(ex.amount))} – unter „Ausgaben“ als offen markiert, bis du es dir überwiesen hast.`);
    routes.abzuege();
  });
  $('#tripcsv') && ($('#tripcsv').onclick = () => {
    const rows = [['Datum', 'Von', 'Nach', 'Zweck', 'km'], ...trips.slice().reverse().map((t) => [t.date, t.from, t.to, t.purpose, String(t.km).replace('.', ',')])];
    download(`fahrtenbuch-${y}.csv`, '﻿' + rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n'), 'text/csv');
  });
};

/* ---------- Belege fotografieren ---------- */
const b64 = (blob) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(blob); });
// Foto verkleinern (schneller hochladen, reicht zum Lesen) und richtig drehen
async function fileToUpload(file) {
  if (file.type === 'application/pdf') return { mime: file.type, data: await b64(file), name: file.name };
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
    return { mime: 'image/jpeg', data: await b64(blob), name: file.name };
  } catch {
    if (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) return { mime: file.type, data: await b64(file), name: file.name };
    throw new Error(`${file.name}: Dieses Bildformat kann nicht gelesen werden – bitte als JPG fotografieren.`);
  }
}
const RSTATUS = {
  processing: ['<span class="spin"></span> wird erkannt…', 'b-open'], review: ['zu prüfen', 'b-credit'], error: ['Fehler', 'b-over'], booked: ['gebucht', 'b-paid'],
};
let receiptTab = 'todo', pollTimer = null;
routes.belege = () => {
  clearTimeout(pollTimer);
  const todo = (r) => r.status !== 'booked';
  const list = S.receipts.filter(receiptTab === 'todo' ? todo : receiptTab === 'booked' ? (r) => !todo(r) : () => true)
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  const ai = S.ai;
  $('#main').innerHTML = `<h1>Belege</h1>
    <div class="card capture">
      <label class="btn primary big">📷 Beleg fotografieren<input type="file" accept="image/*" capture="environment" hidden id="cam"></label>
      <label class="btn big">📁 Fotos / PDF auswählen<input type="file" accept="image/*,application/pdf" multiple hidden id="pick"></label>
      <div class="small muted" style="flex-basis:100%">${ai.enabled
        ? `Automatische Erkennung ist an: Ausgabe oder Einnahme, Betrag, Moms, bezahlt oder offen. ${S.settings.autoBook === 'yes' ? 'Eindeutige Belege werden sofort gebucht, unklare landen bei „Zu prüfen“.' : 'Jeder Beleg wartet auf deine Prüfung.'}`
        : `Automatische Erkennung ist aus – Belege werden gespeichert und du trägst die Werte selbst ein. <a href="#/einstellungen">Einschalten →</a>`}</div>
    </div>
    <div class="tabs">${Object.entries({ todo: 'Zu prüfen', booked: 'Gebucht', all: 'Alle' }).map(([k, v]) => `<button data-rt="${k}" class="${k === receiptTab ? 'on' : ''}">${v} (${S.receipts.filter(k === 'todo' ? todo : k === 'booked' ? (r) => !todo(r) : () => true).length})</button>`).join('')}</div>
    ${list.length ? `<div class="receipts">${list.map((r) => {
      const d = r.draft || {};
      const [st, cls] = RSTATUS[r.status] || ['', ''];
      const kind = r.booked?.kind || d.kind;
      return `<div class="rcard" data-r="${r.id}">
        <div class="thumb" style="${r.mime.startsWith('image/') ? `background-image:url('/beleg/${r.id}')` : ''}">${r.mime === 'application/pdf' ? 'PDF' : ''}</div>
        <div class="body"><span class="badge ${cls}">${st}</span>${r.booked?.auto ? ' <span class="muted small">automatisch</span>' : ''}
          ${r.status === 'processing' ? `<div class="muted" style="margin-top:6px">${esc(r.name || 'Beleg')}</div>` : r.status === 'error' ? `<div style="color:var(--bad);margin-top:6px">${esc(r.error)}</div>` : `
          <div style="margin-top:6px"><b>${esc(d.name || '–')}</b> · ${kind === 'income' ? 'Einnahme' : 'Ausgabe'}</div>
          <div class="row" style="justify-content:space-between"><span class="muted">${dmy(d.date)}</span><span class="amt">${d.amount ? kr(Calc.toCents(d.amount)) : ''}</span></div>
          <div class="muted">${d.paid ? 'bezahlt' : 'offen' + (d.dueDate ? ' bis ' + dmy(d.dueDate) : '')}${r.extracted && !r.extracted.confident && r.status !== 'booked' ? ' · <span style="color:var(--warn)">bitte prüfen</span>' : ''}</div>`}
        </div></div>`;
    }).join('')}</div>` : `<div class="card empty">${receiptTab === 'todo' ? 'Nichts zu prüfen. 👍' : 'Noch keine Belege.'}</div>`}`;
  const upload = async (files) => {
    let ok = 0;
    for (const f of files) {
      try { toast(`Lade hoch… (${ok + 1}/${files.length})`); await api('receipts', 'POST', await fileToUpload(f)); ok++; }
      catch (e) { toast(e.message, true); }
    }
    await reload(); receiptTab = 'todo';
    if (ok) toast(`${ok} Beleg${ok > 1 ? 'e' : ''} hochgeladen${S.ai.enabled ? ' – wird erkannt…' : ''}`);
    routes.belege();
  };
  $('#cam').onchange = (e) => upload([...e.target.files]);
  $('#pick').onchange = (e) => upload([...e.target.files]);
  $$('[data-rt]').forEach((b) => (b.onclick = () => { receiptTab = b.dataset.rt; routes.belege(); }));
  $$('[data-r]').forEach((c) => (c.onclick = () => receiptReview(S.receipts.find((r) => r.id === c.dataset.r))));
  // solange noch erkannt wird, regelmäßig nachsehen
  if (S.receipts.some((r) => r.status === 'processing')) pollTimer = setTimeout(pollReceipts, 3000);
};
async function pollReceipts() {
  if (!location.hash.startsWith('#/belege')) return;
  if (!$('#modal').classList.contains('hidden')) { pollTimer = setTimeout(pollReceipts, 3000); return; }
  await reload().catch(() => {});
  routes.belege();
};
function receiptReview(r) {
  if (r.status === 'processing') return toast('Der Beleg wird gerade erkannt – einen Moment.');
  const d = { ...(r.draft || {}) };
  const ex = r.extracted;
  const booked = r.booked && (r.booked.kind === 'income' ? S.incomes : S.expenses).find((x) => x.id === r.booked.id);
  modal(`<h2>Beleg ${r.status === 'booked' ? '<span class="badge b-paid">gebucht</span>' : 'prüfen'}</h2>
    <div class="review">
      <div class="pic">${r.mime.startsWith('image/') ? `<a href="/beleg/${r.id}" target="_blank"><img src="/beleg/${r.id}" alt="Beleg"></a>` : `<p style="padding:30px"><a class="btn" href="/beleg/${r.id}" target="_blank">PDF öffnen</a></p>`}</div>
      <div>
        ${r.status === 'error' ? `<div class="note warn">${esc(r.error)}</div>` : ''}
        ${ex?.notes ? `<div class="note warn">Hinweis der Erkennung: ${esc(ex.notes)}</div>` : ''}
        ${d.original && !booked ? `<div class="note ${r.rate > 0 ? '' : 'warn'}">Beleg in Fremdwährung: <b>${esc(d.original)}</b>. ${r.rate > 0 ? `Umgerechnet mit Kurs ${num(Number(r.rate).toFixed(4))}.` : 'Der Wechselkurs konnte nicht geholt werden – bitte den Betrag in DKK eintragen (steht auf dem Kontoauszug).'}</div>` : ''}
        ${booked ? `<div class="note">Gebucht als <b>${r.booked.kind === 'income' ? 'Einnahme' : 'Ausgabe'}</b>${r.booked.auto ? ' (automatisch)' : ''}: ${esc(booked.supplier || booked.name)} · ${kr(Calc.toCents(booked.amount))} · ${dmy(booked.date)}${booked.bankId ? ' · mit Lunar-Buchung verknüpft' : ''}</div>
          <div class="modal-actions"><button onclick="closeModal()">Schließen</button><button id="open">Buchung öffnen</button><button class="danger" id="undo">Buchung rückgängig</button></div>` : `
        <div class="grid">
          <label>Art<select name="kind"><option value="expense">Ausgabe (Einkauf)</option><option value="income" ${d.kind === 'income' ? 'selected' : ''}>Einnahme</option></select></label>
          <label>Datum<input type="date" name="date" value="${esc(d.date || today())}"></label>
          <label class="wide"><span class="nm-l">Lieferant / Geschäft</span><input name="name" value="${esc(d.name || '')}"></label>
          <label class="wide">Text<input name="text" value="${esc(d.text || '')}"></label>
          <label>Kategorie<select name="category"></select></label>
          <label class="eu-l">Art des Einkaufs<select name="euPurchase"><option value="">Normal (mit Moms)</option><option value="goods" ${d.euPurchase === 'goods' ? 'selected' : ''}>EU-Einkauf Waren ohne Moms</option><option value="services" ${d.euPurchase === 'services' ? 'selected' : ''}>EU-/Ausland Dienstleistung ohne Moms</option></select></label>
          <label><span class="amt-l">Betrag inkl. Moms (DKK)</span><input name="amount" inputmode="decimal" value="${esc(num(d.amount || ''))}"></label>
          <label class="vat-l">Moms (DKK)<div class="inline"><input name="vat" inputmode="decimal" value="${esc(num(d.vat || ''))}"><button type="button" id="v25">25 %</button></div></label>
          <label>Beleg-/Rechnungsnr.<input name="documentNumber" value="${esc(d.documentNumber || '')}"></label>
          <label><input type="checkbox" name="paid" ${d.paid ? 'checked' : ''}> Bezahlt</label>
          <label class="due-l">Fällig am<input type="date" name="dueDate" value="${esc(d.dueDate || '')}"></label>
          <div class="wide grid sh-wrap" style="padding:0">${sharesHtml(d)}</div>
        </div>
        <div class="modal-actions"><button class="danger" id="del" style="margin-right:auto">Löschen</button>${S.ai.enabled ? '<button id="retry">Neu erkennen</button>' : ''}<button onclick="closeModal()">Später</button><button class="primary" id="book">Buchen</button></div>`}
      </div></div>`, (el) => {
    $('.modal-box').classList.add('wide');
    if (booked) {
      $('#open', el).onclick = () => (r.booked.kind === 'income' ? incomeForm(booked) : expenseForm(booked));
      $('#undo', el).onclick = async () => {
        if (!confirm('Buchung löschen? Der Beleg bleibt erhalten und kann neu gebucht werden.')) return;
        await act(() => api(`${r.booked.kind === 'income' ? 'incomes' : 'expenses'}/${booked.id}`, 'DELETE'), 'Buchung gelöscht');
        receiptReview(S.receipts.find((x) => x.id === r.id));
      };
      return;
    }
    const upd = () => {
      const k = $('[name=kind]', el).value, eu = k === 'expense' && $('[name=euPurchase]', el).value;
      const cat = $('[name=category]', el), cur = cat.value || d.category;
      cat.innerHTML = k === 'income' ? INCOME_CATS.map((c) => `<option ${c === cur ? 'selected' : ''}>${c}</option>`).join('') : catOpts(cur);
      $('.sh-wrap', el).style.display = k === 'income' ? 'none' : '';
      $('.nm-l', el).textContent = k === 'income' ? 'Von (Kunde / Plattform)' : 'Lieferant / Geschäft';
      $('.eu-l', el).style.display = k === 'income' ? 'none' : '';
      $('.amt-l', el).textContent = eu ? 'Betrag ohne Moms (DKK)' : 'Betrag inkl. Moms (DKK)';
      $('.vat-l', el).style.display = eu ? 'none' : '';
      $('.due-l', el).style.display = $('[name=paid]', el).checked ? 'none' : '';
    };
    $$('select,[name=paid]', el).forEach((x) => x.addEventListener('change', upd)); upd();
    bindShares(el, false);
    $('#v25', el).onclick = () => ($('[name=vat]', el).value = num((Math.round(numIn($('[name=amount]', el).value) * 20) / 100).toFixed(2)));
    $('#book', el).onclick = async () => {
      const f = formData(el);
      f.amount = numIn(f.amount).toFixed(2); f.vat = f.euPurchase && f.kind === 'expense' ? '0.00' : numIn(f.vat).toFixed(2);
      const item = await act(() => api(`receipts/${r.id}/book`, 'POST', f), 'Gebucht');
      if (item.bankId) toast('Gebucht und mit der Lunar-Buchung verknüpft ✔');
      closeModal(); routes.belege();
    };
    $('#del', el).onclick = async () => { if (confirm('Beleg löschen?')) { await act(() => api('receipts/' + r.id, 'DELETE'), 'Beleg gelöscht'); closeModal(); routes.belege(); } };
    $('#retry', el) && ($('#retry', el).onclick = async () => { await act(() => api(`receipts/${r.id}/retry`, 'POST', {})); closeModal(); routes.belege(); });
  });
}

/* ---------- Bank (Lunar) ---------- */
let bankFilter = 'open';
routes.bank = async () => {
  const sug = await api('bank/suggest').catch(() => ({}));
  const list = S.bank.filter((t) => bankFilter === 'all' || t.status === bankFilter);
  const openInv = S.invoices.filter(isOpen);
  const invOpts = `<option value="">Rechnung zuordnen…</option>` + openInv.map((i) => `<option value="${i.id}">Nr. ${i.number} · ${esc(i.customerName)} · ${kr(grossDKK(i) - (i.paidAmount || 0))}</option>`).join('');
  $('#main').innerHTML = `<h1>Bank – Lunar <span class="spacer"></span><label class="btn primary" style="color:#fff">Kontoauszug (CSV) importieren<input type="file" id="csv" accept=".csv,.txt" hidden></label></h1>
    <div class="note">So geht's: In <b>Lunar Business</b> (App oder Browser) die Kontobewegungen als <b>CSV-Datei</b> exportieren und hier hochladen. Doppelte Buchungen werden erkannt.
      Eingänge werden automatisch passenden Rechnungen vorgeschlagen (gleicher Betrag oder Rechnungsnummer im Text) – ein Klick und die Rechnung ist bezahlt. Abbuchungen kannst du direkt als Ausgabe mit Købsmoms buchen. Fotografierte Belege werden automatisch mit der passenden Abbuchung verknüpft.</div>
    <div class="tabs">${Object.entries({ open: 'Offen', matched: 'Zugeordnet', ignored: 'Ignoriert', all: 'Alle' }).map(([k, v]) => `<button data-bf="${k}" class="${k === bankFilter ? 'on' : ''}">${v} (${k === 'all' ? S.bank.length : S.bank.filter((t) => t.status === k).length})</button>`).join('')}</div>
    ${list.length ? `<div class="table-wrap"><table><thead><tr><th>Datum</th><th>Text</th><th class="r">Betrag</th><th>Zuordnung</th></tr></thead><tbody>
    ${list.map((t) => {
      const s = sug[t.id] && S.invoices.find((i) => i.id === sug[t.id].invoiceId);
      let cell = '';
      if (t.status === 'matched') {
        const inv = S.invoices.find((i) => i.id === t.invoiceId), ex = S.expenses.find((e) => e.id === t.expenseId), inc = S.incomes.find((e) => e.id === t.incomeId);
        cell = inv ? `<a href="#/druck/${inv.id}">Rechnung ${inv.number}</a>` : ex ? `Ausgabe: ${esc(ex.supplier)} (${esc(ex.category)})${clip(ex)}` : inc ? `Einnahme: ${esc(inc.name)}${clip(inc)}` : 'zugeordnet';
      } else if (t.status === 'ignored') cell = `<button class="small" data-ign="${t.id}">Wieder öffnen</button>`;
      else if (t.amount > 0) cell = `${s ? `<button class="small primary" data-match="${t.id}" data-inv-id="${s.id}">✔ Rechnung ${s.number} (${esc(s.customerName)})</button> ` : ''}
          <select class="small" data-sel="${t.id}" style="width:auto;max-width:260px">${invOpts}</select> <button class="small" data-ign="${t.id}">Ignorieren</button>`;
      else {
        const se = sug[t.id]?.expenseId && S.expenses.find((e) => e.id === sug[t.id].expenseId);
        cell = `${se ? `<button class="small primary" data-link="${t.id}" data-exp-id="${se.id}">✔ Rechnung von ${esc(se.supplier)} bezahlt</button> ` : ''}<button class="small" data-exp="${t.id}">Als Ausgabe buchen</button> <button class="small" data-ign="${t.id}">Ignorieren</button>`;
      }
      return `<tr><td>${dmy(t.date)}</td><td>${esc(t.text)}</td><td class="r" style="color:${t.amount < 0 ? 'var(--bad)' : 'var(--ok)'}">${kr(t.amount)}</td><td>${cell}</td></tr>`;
    }).join('')}</tbody></table></div>` : '<div class="card empty">Keine Buchungen in dieser Ansicht.</div>'}`;
  $$('[data-bf]').forEach((b) => (b.onclick = () => { bankFilter = b.dataset.bf; routes.bank(); }));
  $('#csv').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const buf = await f.arrayBuffer();
    let text = new TextDecoder('utf-8').decode(buf);
    if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf);
    const r = await act(() => api('bank/import', 'POST', { csv: text }));
    toast(`${r.added} neue Buchungen importiert (${r.total - r.added} schon vorhanden)`);
    routes.bank();
  };
  const tx = (id) => S.bank.find((t) => t.id === id);
  $$('[data-match]').forEach((b) => (b.onclick = async () => { const t = tx(b.dataset.match); await act(() => api(`invoices/${b.dataset.invId}/pay`, 'POST', { date: t.date, amount: (t.amount / 100).toFixed(2), bankId: t.id, full: true }), 'Rechnung als bezahlt markiert'); routes.bank(); }));
  $$('[data-sel]').forEach((s) => (s.onchange = async () => { if (!s.value) return; const t = tx(s.dataset.sel); await act(() => api(`invoices/${s.value}/pay`, 'POST', { date: t.date, amount: (t.amount / 100).toFixed(2), bankId: t.id, full: confirm('Ist die Rechnung damit vollständig bezahlt?') }), 'Zahlung zugeordnet'); routes.bank(); }));
  $$('[data-link]').forEach((b) => (b.onclick = async () => { await act(() => api(`bank/${b.dataset.link}/link`, 'POST', { kind: 'expense', id: b.dataset.expId }), 'Ausgabe als bezahlt markiert'); routes.bank(); }));
  $$('[data-ign]').forEach((b) => (b.onclick = async () => { await act(() => api(`bank/${b.dataset.ign}/ignore`, 'POST', {})); routes.bank(); }));
  $$('[data-exp]').forEach((b) => (b.onclick = () => {
    const t = tx(b.dataset.exp);
    modal(`<h2>Abbuchung als Ausgabe buchen</h2><p>${dmy(t.date)} · ${esc(t.text)} · <b>${kr(t.amount)}</b></p><div class="grid">
      <label>Lieferant<input name="supplier" value="${esc(t.text)}"></label>
      <label>Kategorie<select name="category">${catOpts('Diverse')}</select></label>
      <label class="wide"><input type="checkbox" name="withVat" checked> Betrag enthält 25 % dänische Moms (Købsmoms abziehen)</label></div>
      <div class="note small">Für EU-Einkäufe ohne Moms die Ausgabe danach unter „Ausgaben“ öffnen und als EU-Einkauf markieren.</div>
      <div class="modal-actions"><button onclick="closeModal()">Abbrechen</button><button class="primary" id="ok">Buchen</button></div>`, (el) => {
      $('#ok', el).onclick = async () => { await act(() => api(`bank/${t.id}/expense`, 'POST', formData(el)), 'Ausgabe gebucht'); closeModal(); routes.bank(); };
    });
  }));
};

/* ---------- Moms / SKAT ---------- */
let vatSel = null;
routes.moms = () => {
  const y = new Date().getFullYear();
  const kind = S.settings.vatPeriod;
  const all = [y + 1, y, y - 1, y - 2].flatMap((yy) => Calc.periods(yy, kind)).filter((p) => p.from <= today());
  const p = all.find((x) => x.from === vatSel) || all.filter((x) => x.to < today()).sort((a, b) => b.from.localeCompare(a.from))[0] || all[0];
  const r = Calc.vatReport(S.invoices, S.expenses, p.from, p.to, S.incomes);
  const row = (code, da, de, v, hint = '') => `<tr><td><b>${da}</b><div class="muted small">${de}${hint ? ' – ' + hint : ''}</div></td>
    <td class="r code">${(v / 100).toLocaleString('da-DK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td><td><button class="small" data-copy="${Math.round(v / 100)}">Kopieren</button></td></tr>`;
  $('#main').innerHTML = `<h1>Moms / SKAT <span class="spacer"></span><select id="per" style="width:auto">${all.sort((a, b) => b.from.localeCompare(a.from)).map((x) => `<option value="${x.from}" ${x.from === p.from ? 'selected' : ''}>${x.label}</option>`).join('')}</select></h1>
    <div class="cards">
      <div class="card stat"><div class="k">Zeitraum</div><div class="v" style="font-size:17px">${dmy(p.from)} – ${dmy(p.to)}</div><div class="s">${r.invoiceCount} Rechnungen, ${r.expenseCount} Ausgaben${r.incomeCount ? `, ${r.incomeCount} sonstige Einnahmen` : ''}</div></div>
      <div class="card stat"><div class="k">Frist für Angabe und Zahlung</div><div class="v" style="color:${p.deadline < today() ? 'var(--muted)' : 'var(--warn)'}">${dmy(p.deadline)}</div><div class="s">${p.deadline < today() ? 'abgelaufen' : 'noch ' + Math.ceil((new Date(p.deadline) - new Date(today())) / 864e5) + ' Tage'}</div></div>
      <div class="card stat"><div class="k">${r.momstilsvar >= 0 ? 'Zu zahlen an SKAT' : 'Erstattung von SKAT'}</div><div class="v">${kr(Math.abs(r.momstilsvar))}</div><div class="s">Momstilsvar</div></div>
    </div>
    <div class="card"><b>Momsangivelse – so wie in TastSelv Erhverv</b> <span class="muted small">(Beträge in ganzen Kronen)</span>
    <table class="vatbox" style="margin-top:8px"><tbody>
      ${row('', 'Salgsmoms', 'Moms auf deine Verkäufe (25 %)', r.salgsmoms)}
      ${row('', 'Moms af varekøb i udlandet (både EU og lande uden for EU)', 'Erwerbsmoms auf Wareneinkäufe aus dem Ausland', r.momsVarekoebUdland)}
      ${row('', 'Moms af ydelseskøb i udlandet med omvendt betalingspligt', 'Moms auf Dienstleistungen aus dem Ausland (Reverse Charge)', r.momsYdelseskoebUdland)}
      ${row('', 'Købsmoms', 'Vorsteuer – Moms auf deine Einkäufe', r.koebsmoms)}
      ${row('', 'Rubrik A – varer', 'Wert der Wareneinkäufe aus anderen EU-Ländern (ohne Moms)', r.rubrikAVarer)}
      ${row('', 'Rubrik A – ydelser', 'Wert der Dienstleistungseinkäufe aus anderen EU-Ländern', r.rubrikAYdelser)}
      ${row('', 'Rubrik B – varer (indberettes til EU-salg uden moms)', 'Warenverkäufe an EU-Firmen mit USt-IdNr.', r.rubrikBVarer)}
      ${row('', 'Rubrik B – varer (indberettes ikke til EU-salg uden moms)', 'z. B. Montage/Installation in anderen EU-Ländern', r.rubrikBVarerIkkeEU)}
      ${row('', 'Rubrik B – ydelser', 'Dienstleistungen an EU-Firmen (Reverse Charge)', r.rubrikBYdelser)}
      ${row('', 'Rubrik C', 'Sonstige Lieferungen ohne dänische Moms (z. B. Export außerhalb der EU)', r.rubrikC)}
      <tr><td><b>Momstilsvar</b><div class="muted small">= Salgsmoms + Moms Ausland − Købsmoms</div></td><td class="r code"><b>${(r.momstilsvar / 100).toLocaleString('da-DK', { maximumFractionDigits: 0 })}</b></td><td></td></tr>
    </tbody></table></div>
    ${r.euSales.length ? `<div class="card"><b>EU-salg uden moms (Listesystemet)</b><div class="muted small">Diese Verkäufe an EU-Firmen müssen zusätzlich unter „EU-salg uden moms“ in TastSelv gemeldet werden (Waren monatlich bzw. Dienstleistungen je nach Periode).</div>
      <table style="margin-top:8px"><thead><tr><th>Land</th><th>USt-IdNr.</th><th>Kunde</th><th class="r">Waren</th><th class="r">Dienstleistungen</th></tr></thead><tbody>
      ${r.euSales.map((e) => `<tr><td>${esc(e.country)}</td><td>${esc(e.vatId)}</td><td>${esc(e.name)}</td><td class="r">${Math.round(e.goods / 100).toLocaleString('da-DK')}</td><td class="r">${Math.round(e.services / 100).toLocaleString('da-DK')}</td></tr>`).join('')}
      </tbody></table></div>` : ''}
    <div class="row"><button id="csv">Als CSV für den Steuerberater</button><a class="btn" href="https://skat.dk/indberetmoms" target="_blank" rel="noopener">Moms bei SKAT indberetten ↗</a></div>
    <div class="note" style="margin-top:16px"><b>So reichst du ein:</b> Auf skat.dk/indberetmoms bei TastSelv Erhverv mit MitID bzw. MitID Erhverv anmelden (nicht mit TastSelv-Kode, damit geht die Indberetning nicht) → Moms → Momsindberetning → Indberet moms → Periode wählen → die Werte von oben eintragen (Kopieren-Knopf) → Godkend. Gab es keine Umsätze, gibt es dort „Nulindberet“. Danach den Momstilsvar bis zur Frist auf das Skattekonto zahlen.
      <br><br>Die direkte Übertragung an SKAT per Schnittstelle (NemVirksomhed-API) ist nur für bei Skattestyrelsen registrierte Software-Anbieter freigegeben – deshalb hier zum Übernehmen mit einem Klick.</div>`;
  $('#per').onchange = (e) => { vatSel = e.target.value; routes.moms(); };
  $$('[data-copy]').forEach((b) => (b.onclick = () => { navigator.clipboard?.writeText(b.dataset.copy); toast('Kopiert: ' + b.dataset.copy); }));
  $('#csv').onclick = () => {
    const lines = [['Feld', 'Betrag DKK'], ['Salgsmoms', r.salgsmoms], ['Moms af varekøb i udlandet', r.momsVarekoebUdland], ['Moms af ydelseskøb i udlandet', r.momsYdelseskoebUdland], ['Købsmoms', r.koebsmoms],
      ['Rubrik A varer', r.rubrikAVarer], ['Rubrik A ydelser', r.rubrikAYdelser], ['Rubrik B varer', r.rubrikBVarer], ['Rubrik B ydelser', r.rubrikBYdelser], ['Rubrik C', r.rubrikC], ['Momstilsvar', r.momstilsvar]]
      .map(([a, b]) => `${a};${typeof b === 'number' ? (b / 100).toFixed(2).replace('.', ',') : b}`);
    download(`moms-${p.from}-${p.to}.csv`, '﻿' + lines.join('\r\n'), 'text/csv');
  };
};
// QR-Code-Bibliothek erst bei Bedarf laden
function loadQr() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  return new Promise((res, rej) => {
    const sc = document.createElement('script');
    sc.src = 'vendor/qrcode.js'; // qrcode-generator 1.4.4 (MIT)
    sc.onload = () => res(window.qrcode); sc.onerror = rej;
    document.head.appendChild(sc);
  });
}
function download(name, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- Einstellungen ---------- */
routes.einstellungen = () => {
  const s = S.settings;
  const f = (k, label, extra = '') => `<label ${extra}>${label}<input name="${k}" value="${esc(s[k] ?? '')}"></label>`;
  $('#main').innerHTML = `<h1>Einstellungen <span class="muted small" style="font-weight:400">Version ${esc(S.version || '?')}</span></h1>
    <div class="card"><b>Deine Firma</b><div class="grid" style="margin-top:10px">
      <label>CVR-Nr.<div class="inline"><input name="cvr" value="${esc(s.cvr)}"><button type="button" id="cvr-look">Aus CVR holen</button></div></label>
      ${f('company', 'Firmenname')}${f('owner', 'Inhaber')}${f('street', 'Straße')}${f('zip', 'PLZ')}${f('city', 'Ort')}
      <label>Land<select name="country">${countryOpts(s.country)}</select></label>
      ${f('email', 'E-Mail')}${f('phone', 'Telefon')}${f('web', 'Webseite')}
      <label class="wide">Logo (PNG/JPG)<div class="row">${s.logo ? `<img src="${s.logo}" style="max-height:50px">` : ''}<input type="file" id="logo" accept="image/*" style="width:auto"> ${s.logo ? '<button type="button" id="nologo">Logo entfernen</button>' : ''}</div></label>
    </div></div>
    <div class="card"><b>Bankverbindung (wird auf der Rechnung gedruckt)</b><div class="grid" style="margin-top:10px">
      ${f('bankName', 'Bank')}${f('regNo', 'Reg.-Nr.')}${f('accountNo', 'Kontonummer')}${f('iban', 'IBAN (für Kunden im Ausland)')}${f('bic', 'BIC/SWIFT')}
      ${f('fikCreditor', 'FI-Kreditornummer (optional, +71-Zahlung)')}</div>
      <div class="muted small" style="margin-top:6px">Lunar Business: Reg.-Nr., Kontonummer und IBAN findest du in der Lunar-App unter Konto → Kontodetails.</div></div>
    <div class="card"><b>Rechnungen &amp; Moms</b><div class="grid" style="margin-top:10px">
      <label>Nächste Rechnungsnummer<input type="number" name="nextNumber" value="${s.nextNumber}"></label>
      <label>Nächste Auftragsnummer<input type="number" name="nextOrderNumber" value="${s.nextOrderNumber}"></label>
      <label class="wide">Öffentliche Adresse für Kunden-Links (nur wenn das Programm auf einem Server im Internet läuft, z. B. https://rechnung.meinefirma.dk)<input name="publicUrl" value="${esc(s.publicUrl || '')}" placeholder="leer = Adresse dieses Computers"></label>
      <label>Standard-Zahlungsziel (Tage)<input type="number" name="dueDays" value="${s.dueDays}"></label>
      <label>Standardwährung<select name="defaultCurrency">${CURRENCIES.map((c) => `<option ${c === s.defaultCurrency ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label>Momsperiode bei SKAT<select name="vatPeriod">${opts({ halfyear: 'Halbjährlich (Umsatz unter 5 Mio. DKK)', quarter: 'Vierteljährlich', month: 'Monatlich (über 50 Mio. DKK)' }, s.vatPeriod)}</select></label>
      ${f('footer', 'Zusatzzeile in der Fußzeile', 'class="wide"')}
    </div></div>
    <div class="card"><b>Belegerkennung (Fotos automatisch auslesen)</b>
      <p class="small muted">Fotografierte Belege werden von Claude (Anthropic) gelesen: Ausgabe oder Einnahme, Lieferant, Datum, Betrag, Moms, bezahlt oder offen. Dafür brauchst du einen eigenen API-Schlüssel von <a href="https://platform.claude.com" target="_blank" rel="noopener">platform.claude.com</a> (Konto anlegen → Guthaben aufladen → „API Keys“ → „Create Key“). Kosten je nach Genauigkeit ca. 0,1 bis 6 Cent pro Beleg (Abrechnung in Dollar über dein Guthaben bei Anthropic, dort kannst du ein Monatslimit setzen). Das Foto wird dafür an Anthropic geschickt.</p>
      <div class="grid">
        <label>API-Schlüssel<input name="aiKey" type="password" autocomplete="off" placeholder="${S.ai.fromEnv ? 'über ANTHROPIC_API_KEY gesetzt' : S.ai.hasKey ? '•••••••• gespeichert' : 'sk-ant-…'}"></label>
        <label>Genauigkeit<select name="aiMode">${opts({ auto: 'Automatisch – erst günstig, bei Unklarheit genau (empfohlen)', cheap: 'Günstig – ca. 0,1 Cent pro Beleg', precise: 'Genau – ca. 3–6 Cent pro Beleg' }, s.aiMode || 'auto')}</select></label>
        <label>Nach dem Erkennen<select name="autoBook">${opts({ yes: 'Eindeutige Belege sofort automatisch buchen', no: 'Jeden Beleg erst zur Prüfung vorlegen' }, s.autoBook)}</select></label>
      </div>
      <div class="row" style="margin-top:8px"><button type="button" id="testkey">Schlüssel prüfen</button><span class="small" id="keyres"></span></div>
      <div class="small" style="margin-top:8px">${!S.ai.installed ? '<span style="color:var(--bad)">Das Erkennungs-Paket fehlt – bitte das Programm über das Startskript starten (es installiert alles automatisch).</span>' : S.ai.enabled ? '<span style="color:var(--ok)">✔ Erkennung ist eingeschaltet.</span>' : 'Erkennung ist aus.'}
        ${S.ai.hasKey ? ' <button type="button" class="small" id="delkey">Schlüssel löschen</button>' : ''}</div></div>
    <div class="card"><b>CVR-Register (Firmendaten automatisch holen)</b>
      <p class="small muted">„Aus CVR holen“ fragt mit der 8-stelligen CVR-Nummer die EU-Datenbank VIES (ohne Tageslimit, liefert Name und Adresse). Die Suche nach einem Firmennamen geht über den kostenlosen Dienst cvrapi.dk (nur wenige Abfragen pro Tag). Unbegrenzt und offiziell geht es mit einem kostenlosen Zugang zum CVR-Register der Erhvervsstyrelsen: per E-Mail an <b>cvrselvbetjening@erst.dk</b> „System-til-system adgang til CVR-data“ beantragen und die Zugangsdaten hier eintragen.</p>
      <div class="grid"><label>Benutzername<input name="cvrUser" autocomplete="off" value="${esc(S.cvr?.user || '')}"></label>
        <label>Passwort<input name="cvrPass" type="password" autocomplete="off" placeholder="${S.cvr?.hasPass ? '•••••••• gespeichert' : ''}"></label></div></div>
    <div class="card"><b>Mit dem Handy fotografieren</b><div id="lan" class="small" style="margin-top:8px">…</div></div>
    <div class="row"><button class="primary" id="save">Speichern</button></div>
    <div class="card" style="margin-top:18px"><b>Datensicherung</b><p class="muted small">Das Programm legt jeden Tag automatisch eine Sicherung im Ordner <code>rechnung/data/sicherung</code> an. Nach dem dänischen Buchführungsgesetz müssen Rechnungen und Belege 5 Jahre aufbewahrt werden. Die Belegfotos liegen als Dateien in <code>rechnung/data/belege</code> – sichere deshalb regelmäßig den <b>ganzen Ordner <code>rechnung/data</code></b> extern (USB-Stick, Cloud in der EU). Der Knopf unten sichert nur die Buchungsdaten ohne Fotos.</p>
      <div class="row"><button id="bk">Sicherung herunterladen</button><label class="btn">Sicherung einspielen<input type="file" id="restore" accept=".json" hidden></label></div></div>`;
  $('#save').onclick = async () => { await act(() => api('settings', 'PUT', formData($('#main'))), 'Einstellungen gespeichert'); routes.einstellungen(); };
  $('#testkey').onclick = async () => {
    const out = $('#keyres'); out.textContent = 'prüfe…'; out.style.color = '';
    try { await api('ai/check', 'POST', { key: $('[name=aiKey]').value }); out.textContent = '✔ Der Schlüssel funktioniert.'; out.style.color = 'var(--ok)'; }
    catch (e) { out.textContent = '✖ ' + e.message; out.style.color = 'var(--bad)'; }
  };
  $('#delkey') && ($('#delkey').onclick = async () => { await act(() => api('settings', 'PUT', { aiKeyDelete: true }), 'Schlüssel gelöscht'); routes.einstellungen(); });
  api('lan').then((l) => {
    const el = $('#lan'); if (!el) return;
    if (!l.open) {
      el.innerHTML = `Das Programm ist gerade nur auf diesem Computer erreichbar. Damit dein Handy (im selben WLAN) Belege hochladen kann, starte das Programm mit <b>start-rechnung</b> und beantworte die Frage „Handy-Zugang einschalten?“ mit <b>j</b>. Dann erscheint hier ein QR-Code zum Abscannen.`;
      return;
    }
    el.innerHTML = `${l.password ? '' : '<div class="note warn">Achtung: kein Passwort gesetzt – jeder im WLAN kann zugreifen.</div>'}
      Mit der Handy-Kamera den QR-Code scannen (Handy im selben WLAN). Danach im Browser „Zum Startbildschirm hinzufügen“ – dann hast du die Belege-Kamera wie eine App.
      <div class="row" style="margin-top:10px">${l.urls.map((u, i) => `<div><div class="qr" id="qr${i}"></div><div><code>${esc(u)}</code></div></div>`).join('') || 'Keine Netzwerkverbindung gefunden.'}</div>`;
    loadQr().then((qrcode) => l.urls.forEach((u, i) => { const q = qrcode(0, 'M'); q.addData(u); q.make(); $('#qr' + i).innerHTML = q.createSvgTag({ cellSize: 4, margin: 2 }); })).catch(() => {});
  }).catch(() => {});
  $('#cvr-look').onclick = async () => {
    try { const r = await api('lookup/cvr?q=' + encodeURIComponent($('[name=cvr]').value)); for (const k of ['company:name', 'street', 'zip', 'city', 'email', 'phone']) { const [a, b = a] = k.split(':'); if (r[b]) $(`[name=${a}]`).value = r[b]; } toast('Übernommen – bitte speichern'); }
    catch (e) { toast(e.message, true); }
  };
  $('#logo').onchange = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const img = new Image();
    img.onload = async () => {
      const k = Math.min(1, 600 / img.width, 240 / img.height);
      const c = document.createElement('canvas'); c.width = img.width * k; c.height = img.height * k;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      await act(() => api('settings', 'PUT', { logo: c.toDataURL('image/png') }), 'Logo gespeichert'); routes.einstellungen();
    };
    img.src = URL.createObjectURL(file);
  };
  $('#nologo') && ($('#nologo').onclick = async () => { await act(() => api('settings', 'PUT', { logo: '' })); routes.einstellungen(); });
  $('#bk').onclick = async () => download(`rechnungsstudio-sicherung-${today()}.json`, JSON.stringify(await api('backup')), 'application/json');
  $('#restore').onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    if (!confirm('Achtung: Alle aktuellen Daten werden durch die Sicherung ersetzt. Fortfahren?')) return;
    const data = JSON.parse(await file.text());
    await act(() => api('backup', 'POST', data), 'Sicherung eingespielt'); route();
  };
};

route();
