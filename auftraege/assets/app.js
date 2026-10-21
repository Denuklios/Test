/* Wunsch-Fabrik Auftraege – Frontend ohne Build. Alle Texte kommen per textContent (kein innerHTML mit Nutzerdaten). */
(() => {
'use strict';
const BASE = document.documentElement.dataset.base || '';
let me = null;
let lang = (navigator.language || '').startsWith('da') ? 'da' : 'de';
try { lang = localStorage.getItem('wf_lang') || lang; } catch (e) { /* Speicher gesperrt */ }
if (!['de', 'da'].includes(lang)) lang = 'de';

const t = (k, ...a) => {
  const d = (window.WF_I18N[lang] || {})[k] ?? window.WF_I18N.de[k] ?? k;
  return a.length ? d.replace(/\{(\d)\}/g, (_, i) => a[i]) : d;
};

// ---------- DOM-Helfer ----------
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'value') e.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'multiple') e[k] = !!v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
const $ = (s, r = document) => r.querySelector(s);
const view = () => $('#view');
function toast(msg) {
  const el = h('div', { class: 'toast' }, msg);
  document.body.append(el);
  setTimeout(() => el.remove(), 2600);
}
const ICON = {
  list: 'M4 6h16M4 12h16M4 18h10', plus: 'M12 5v14M5 12h14', cal: 'M5 5h14v15H5zM5 10h14M9 3v4M15 3v4',
  users: 'M16 19v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1M10 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M20 19v-1a3 3 0 0 0-2-2.8', cog: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19 12l2-1-2-4-2 1-2-1-1-2h-4l-1 2-2 1-2-1-2 4 2 1v2l-2 1 2 4 2-1 2 1 1 2h4l1-2 2-1 2 1 2-4-2-1z'
};
function icon(n) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', ICON[n]);
  s.append(p);
  return s;
}

// ---------- API ----------
async function api(a, { params = {}, body = null, form = null } = {}) {
  const qs = new URLSearchParams({ a, ...params });
  const opt = { method: 'GET', credentials: 'same-origin', headers: {} };
  if (body || form) {
    opt.method = 'POST';
    opt.headers['X-CSRF-Token'] = me ? me.csrf : '';
    if (body) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    else opt.body = form;
  }
  let r;
  try { r = await fetch(`${BASE}api.php?${qs}`, opt); } catch (e) { throw new Error(t('err_network')); }
  let j = null;
  try { j = await r.json(); } catch (e) { /* leer */ }
  if (r.status === 401) { showLogin(); throw new Error('not_logged_in'); }
  if (!j || !j.ok) throw new Error(t('err_' + (j ? j.error : 'server_error')));
  return j;
}
function showLogin() {
  view().replaceChildren(h('div', { class: 'card' }, h('h2', {}, t('login_title')), h('p', { class: 'muted' }, t('login_text'))));
}

// ---------- Formatierung ----------
const money = (v, cur) => new Intl.NumberFormat(lang === 'da' ? 'da-DK' : 'de-DE', { style: 'currency', currency: cur || 'DKK' }).format(+v || 0);
const dfmt = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString(lang === 'da' ? 'da-DK' : 'de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';
const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const mondayOf = (s) => { const d = new Date(s + 'T00:00:00'); return addDays(s, -((d.getDay() + 6) % 7)); };
const pname = (p) => lang === 'da' ? p.name_da : p.name_de;
const procById = (id) => me.processes.find((p) => +p.id === +id);
const hm = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} h`;
const SCOL = { inquiry: 'var(--s-inquiry)', approval: 'var(--s-approval)', material: 'var(--s-material)', production: 'var(--s-production)', done: 'var(--s-done)', delivered: 'var(--s-delivered)' };
const PCOL = { open: 'var(--bad)', deposit: 'var(--warn)', paid: 'var(--ok)' };
const pill = (txt, col) => h('span', { class: 'pill', style: `--c:${col}` }, txt);
const statusPill = (s) => pill(t('st_' + s), SCOL[s]);
const payPill = (s) => pill(t('pay_' + s), PCOL[s]);
const procDots = (ids) => (ids || []).map((id) => { const p = procById(id); return p ? h('span', { class: 'chip', style: `--c:${p.color}` }, h('i', { class: 'dot', style: `--c:${p.color}` }), pname(p)) : null; });

// ---------- Router ----------
const routes = [];
const route = (re, fn) => routes.push([re, fn]);
async function render() {
  if (!me) return;
  const hash = location.hash.replace(/^#/, '') || '/';
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('on', a.dataset.r && (hash === a.dataset.r || (a.dataset.r !== '/' && hash.startsWith(a.dataset.r)))));
  for (const [re, fn] of routes) {
    const m = re.exec(hash);
    if (m) {
      try { await fn(...m.slice(1)); } catch (e) { if (e.message !== 'not_logged_in') view().replaceChildren(h('div', { class: 'card err' }, e.message)); }
      window.scrollTo(0, 0);
      return;
    }
  }
  location.hash = '#/';
}
window.addEventListener('hashchange', render);

// ---------- Auftragsliste ----------
const filt = { q: '', status: '', pay: '', process: '', overdue: false, show: 'active' };
route(/^\/$/, async () => {
  const list = h('div', { class: 'orders' });
  const load = async () => {
    const params = { show: filt.show, q: filt.q };
    for (const k of ['status', 'pay', 'process']) if (filt[k]) params[k] = filt[k];
    if (filt.overdue) params.overdue = 1;
    const { orders } = await api('orders', { params });
    list.replaceChildren(...(orders.length ? orders.map(orderCard) : [h('div', { class: 'empty' }, t('no_orders'))]));
  };
  let timer;
  const sel = (key, opts, ph) => h('select', { onchange: (e) => { filt[key] = e.target.value; load(); } },
    h('option', { value: '' }, ph), opts.map(([v, l]) => h('option', { value: v, selected: String(filt[key]) === String(v) }, l)));
  view().replaceChildren(
    h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow' }, t('workshop')), h('h1', {}, t('orders_h1_a'), ' ', h('em', {}, t('orders_h1_b'))))),
    h('div', { class: 'filters' },
      h('input', { type: 'search', placeholder: t('search_ph'), value: filt.q, oninput: (e) => { filt.q = e.target.value; clearTimeout(timer); timer = setTimeout(load, 250); } }),
      sel('status', me.statuses.map((s) => [s, t('st_' + s)]), t('all_status')),
      sel('pay', me.pay.map((s) => [s, t('pay_' + s)]), t('all_pay')),
      sel('process', me.processes.filter((p) => +p.active).map((p) => [p.id, pname(p)]), t('all_process')),
      h('select', { onchange: (e) => { filt.show = e.target.value; load(); } },
        [['active', t('show_active')], ['all', t('show_all')], ['trash', t('show_trash')]].map(([v, l]) => h('option', { value: v, selected: filt.show === v }, l))),
      h('label', { class: 'chip' + (filt.overdue ? ' on' : ''), style: 'margin:0', onclick: (e) => { filt.overdue = !filt.overdue; e.currentTarget.classList.toggle('on', filt.overdue); load(); } }, t('only_overdue'))),
    list);
  await load();
});

function orderCard(o) {
  const late = o.due_date && o.due_date < today() && !['done', 'delivered'].includes(o.status);
  const idx = me.statuses.indexOf(o.status);
  const nextS = me.statuses[idx + 1];
  const card = h('div', { class: 'card order' + (late ? ' overdue' : ''), style: `--sc:${SCOL[o.status]}` },
    h('a', { href: `#/order/${o.id}`, style: 'text-decoration:none;color:inherit;display:block' },
      h('div', { class: 'o-top' }, h('div', {}, h('div', { class: 'o-nr' }, o.nr), h('div', { class: 'o-title' }, o.title), h('div', { class: 'o-cust' }, o.customer_name + (o.customer_company ? ' · ' + o.customer_company : ''))),
        h('div', { style: 'text-align:right' }, statusPill(o.status), h('div', { style: 'margin-top:6px' }, payPill(o.pay_status)))),
      h('div', { class: 'o-meta' }, h('span', { class: 'due' + (late ? ' late' : '') }, (late ? '⚠ ' : '') + dfmt(o.due_date)), h('span', {}, `${o.qty} ${t('pcs')}`), h('span', { class: 'muted' }, money(o.price, o.currency)),
        procDots((o.process_ids || '').split(',').filter(Boolean)))),
    nextS && !o.deleted_at && h('div', { class: 'next' }, h('button', { class: 'btn small', onclick: async (e) => { e.preventDefault(); await api('order_status', { body: { id: o.id, status: nextS } }); toast(t('saved')); render(); } }, '→ ' + t('st_' + nextS))));
  return card;
}

// ---------- Auftrag Detail ----------
route(/^\/order\/(\d+)$/, async (id) => {
  const { order: o } = await api('order', { params: { id } });
  const reload = () => render();
  const late = o.due_date && o.due_date < today() && !['done', 'delivered'].includes(o.status);
  const steps = h('div', { class: 'steps' }, me.statuses.map((s, i) => h('button', { class: i < me.statuses.indexOf(o.status) ? 'done' : i === me.statuses.indexOf(o.status) ? 'cur' : '', onclick: async () => { await api('order_status', { body: { id: o.id, status: s } }); reload(); } }, t('st_' + s))));
  const paySel = h('select', { onchange: async (e) => { await api('order_status', { body: { id: o.id, pay_status: e.target.value } }); reload(); } }, me.pay.map((p) => h('option', { value: p, selected: p === o.pay_status }, t('pay_' + p))));
  const fileIn = h('input', { type: 'file', accept: 'image/*,application/pdf', multiple: true, class: 'hidden', onchange: async (e) => {
    for (const f of e.target.files) {
      const fd = new FormData(); fd.append('order_id', o.id); fd.append('file', f);
      try { await api('file_upload', { form: fd }); } catch (er) { toast(f.name + ': ' + er.message); }
    }
    reload();
  } });
  const rest = o.price - o.deposit;
  view().replaceChildren(
    h('a', { href: '#/', class: 'muted' }, '← ' + t('nav_orders')),
    h('div', { class: 'page-head', style: 'margin-top:8px' }, h('div', {}, h('div', { class: 'eyebrow' }, o.nr), h('h1', {}, o.title), h('div', { class: 'muted' }, h('a', { href: `#/customer/${o.customer_id}` }, o.customer_name + (o.customer_company ? ' · ' + o.customer_company : '')))),
      h('div', { class: 'row' }, o.deleted_at ? h('button', { class: 'btn', onclick: async () => { await api('order_restore', { body: { id: o.id } }); reload(); } }, t('restore')) : [
        h('a', { class: 'btn', href: `#/order/${o.id}/edit` }, t('edit')),
        h('button', { class: 'btn danger', onclick: async () => { if (confirm(t('confirm_delete'))) { await api('order_delete', { body: { id: o.id } }); location.hash = '#/'; } } }, t('delete'))])),
    h('div', { class: 'card' }, steps,
      h('dl', { class: 'kv', style: 'margin-top:14px' },
        h('dt', {}, t('due')), h('dd', { class: late ? 'due late' : '' }, (late ? '⚠ ' : '') + dfmt(o.due_date)),
        h('dt', {}, t('plan_date')), h('dd', {}, dfmt(o.plan_date)),
        h('dt', {}, t('article')), h('dd', {}, `${o.article || '—'} · ${o.qty} ${t('pcs')}`),
        h('dt', {}, t('processes')), h('dd', {}, h('div', { class: 'row' }, o.processes.length ? o.processes.map((p) => { const pr = procById(p.process_id); return h('span', { class: 'chip', style: `--c:${pr.color}` }, h('i', { class: 'dot', style: `--c:${pr.color}` }), `${pname(pr)}${p.minutes ? ' · ' + hm(p.minutes) : ''}`); }) : '—')),
        h('dt', {}, t('price')), h('dd', {}, `${money(o.price, o.currency)} · ${t('deposit')} ${money(o.deposit, o.currency)} · ${t('remaining')} ${money(rest, o.currency)}`),
        h('dt', {}, t('payment')), h('dd', {}, paySel))),
    (o.description || o.notes) && h('div', { class: 'card' }, o.description && h('p', { style: 'margin:0 0 8px;white-space:pre-wrap' }, o.description), o.notes && h('p', { class: 'muted', style: 'margin:0;white-space:pre-wrap' }, o.notes)),
    h('div', { class: 'card' }, h('div', { class: 'row' }, h('h3', {}, t('files')), h('span', { class: 'spacer' }), h('button', { class: 'btn small', onclick: () => fileIn.click() }, '+ ' + t('add_file')), fileIn),
      h('div', { class: 'files' }, o.files.map((f) => h('div', { class: 'file' },
        h('a', { href: `${BASE}file.php?id=${f.id}`, target: '_blank', rel: 'noopener' }, f.mime.startsWith('image/') ? h('img', { src: `${BASE}file.php?id=${f.id}`, alt: f.original_name, loading: 'lazy' }) : h('div', { class: 'pdf' }, 'PDF')),
        h('div', { class: 'n' }, h('span', { style: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, f.original_name), h('a', { href: '#', title: t('delete'), onclick: async (e) => { e.preventDefault(); if (confirm(t('confirm_delete_file'))) { await api('file_delete', { body: { id: f.id } }); reload(); } } }, '✕')))))),
    h('div', { class: 'card' }, h('h3', {}, t('history')), h('ul', { class: 'log' }, o.log.map((l) => h('li', {}, `${l.at.slice(0, 16)} · ${l.user_name} · ${logText(l.what)}`)))));
});
function logText(w) {
  if (w.startsWith('status:')) return t('log_status') + ' ' + t('st_' + w.slice(7));
  if (w.startsWith('pay:')) return t('log_pay') + ' ' + t('pay_' + w.slice(4));
  if (w.startsWith('file:')) return t('log_file') + ' ' + w.slice(5);
  return t('log_' + w);
}

// ---------- Auftrag Formular (neu / bearbeiten) ----------
route(/^\/new$/, () => orderForm(null));
route(/^\/new\/customer\/(\d+)$/, (cid) => orderForm(null, +cid));
route(/^\/order\/(\d+)\/edit$/, async (id) => orderForm((await api('order', { params: { id } })).order));

async function orderForm(o, presetCustomer) {
  const isNew = !o;
  const D = o || { id: 0, customer_id: presetCustomer || 0, title: '', description: '', article: '', qty: 1, price: 0, deposit: 0, currency: 'DKK', pay_status: 'open', status: 'inquiry', due_date: '', plan_date: '', notes: '', processes: [] };
  let cust = null;
  if (D.customer_id) cust = (await api('customer', { params: { id: D.customer_id } })).customer;
  if (isNew && cust) D.currency = cust.currency;
  const F = {};
  const err = h('div', { class: 'err' });
  const field = (k, label, el) => { F[k] = el; return h('div', {}, h('label', {}, label), el); };
  const inp = (k, type = 'text', extra = {}) => h('input', { type, value: D[k] ?? '', ...extra });

  // Kunde: Suche mit Vorschlaegen oder neu anlegen
  const custBox = h('div', { class: 'suggest' });
  const custName = h('input', { type: 'text', placeholder: t('customer_ph'), autocomplete: 'off', value: cust ? cust.name + (cust.company ? ' · ' + cust.company : '') : '' });
  const sug = h('div', { class: 'suggest-list hidden' });
  let ct;
  const pick = (c) => { cust = c; D.customer_id = c.id; custName.value = c.name + (c.company ? ' · ' + c.company : ''); sug.classList.add('hidden'); if (isNew) F.currency.value = c.currency; };
  custName.addEventListener('input', () => {
    cust = null; D.customer_id = 0; clearTimeout(ct);
    ct = setTimeout(async () => {
      const q = custName.value.trim();
      const { customers } = await api('customers', { params: { q } });
      sug.replaceChildren(...customers.slice(0, 8).map((c) => h('button', { type: 'button', onclick: () => pick(c) }, c.name + (c.company ? ' · ' + c.company : ''))),
        q && h('button', { type: 'button', onclick: async () => {
          const phone = prompt(t('new_customer_phone')) || '';
          const r = await api('customer_save', { body: { name: q, phone, currency: F.currency.value } });
          pick({ id: r.id, name: q, company: '', currency: F.currency.value });
        } }, '+ ' + t('create_customer', q)));
      sug.classList.toggle('hidden', !sug.childNodes.length);
    }, 200);
  });
  custBox.append(custName, sug);

  // Verfahren
  const sel = new Map(D.processes.map((p) => [+p.process_id, +p.minutes]));
  const procBox = h('div', { class: 'procs' }, me.processes.filter((p) => +p.active).map((p) => {
    const cb = h('input', { type: 'checkbox', checked: sel.has(+p.id) });
    const mins = h('input', { type: 'number', min: 0, step: 15, value: sel.get(+p.id) ?? 60, 'aria-label': t('minutes') });
    const row = h('label', { class: 'proc' + (cb.checked ? ' on' : ''), style: `--c:${p.color};text-transform:none;letter-spacing:0;font-size:1rem;color:inherit;margin:0` }, cb, h('span', {}, pname(p)), mins, h('small', { class: 'muted' }, 'min'));
    cb.addEventListener('change', () => row.classList.toggle('on', cb.checked));
    row._get = () => cb.checked ? { process_id: +p.id, minutes: +mins.value || 0 } : null;
    return row;
  }));

  const more = h('div', { class: 'grid' });
  const payRow = h('div', { class: 'grid c3' },
    field('price', t('price'), inp('price', 'number', { step: '0.01', min: 0, inputmode: 'decimal' })),
    field('currency', t('currency'), h('select', {}, me.currencies.map((c) => h('option', { value: c, selected: c === D.currency }, c)))),
    field('pay_status', t('payment'), h('select', {}, me.pay.map((p) => h('option', { value: p, selected: p === D.pay_status }, t('pay_' + p))))));
  const depRow = field('deposit', t('deposit'), inp('deposit', 'number', { step: '0.01', min: 0, inputmode: 'decimal' }));
  more.append(
    field('article', t('article'), inp('article')),
    h('div', { class: 'grid c2' }, field('plan_date', t('plan_date'), inp('plan_date', 'date')), field('status', t('status'), h('select', {}, me.statuses.map((s) => h('option', { value: s, selected: s === D.status }, t('st_' + s)))))),
    payRow, depRow,
    field('description', t('description'), h('textarea', {}, D.description)),
    field('notes', t('notes'), h('textarea', {}, D.notes)));
  const moreWrap = h('div', { class: isNew ? 'hidden' : '' }, more);

  const save = async (btn) => {
    err.textContent = '';
    if (!D.customer_id) { err.textContent = t('err_bad_customer'); return; }
    const body = { id: D.id, customer_id: D.customer_id,
      title: F.title.value, qty: F.qty.value, due_date: F.due_date.value, processes: [...procBox.children].map((r) => r._get()).filter(Boolean) };
    for (const k of ['article', 'plan_date', 'price', 'currency', 'pay_status', 'deposit', 'description', 'notes', 'status']) body[k] = F[k].value;
    if (body.pay_status === 'paid' && !body.deposit) body.deposit = body.price;
    btn.disabled = true;
    try {
      const r = await api('order_save', { body });
      toast(t('saved'));
      location.hash = `#/order/${r.order.id}`;
    } catch (e) { err.textContent = e.message; } finally { btn.disabled = false; }
  };
  const btn = h('button', { class: 'btn primary', onclick: (e) => save(e.currentTarget) }, t('save'));
  view().replaceChildren(
    h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow' }, isNew ? t('new_order') : D.nr), h('h1', {}, isNew ? t('capture_a') : t('edit'), ' ', isNew && h('em', {}, t('capture_b'))))),
    h('div', { class: 'card grid' },
      h('div', {}, h('label', {}, t('customer')), custBox),
      field('title', t('title'), inp('title', 'text', { placeholder: t('title_ph'), maxlength: 200 })),
      h('div', { class: 'grid c2' }, field('qty', t('qty'), inp('qty', 'number', { min: 1, inputmode: 'numeric' })), field('due_date', t('due'), inp('due_date', 'date'))),
      h('div', {}, h('label', {}, t('processes')), procBox),
      isNew && h('button', { class: 'btn small', type: 'button', onclick: (e) => { moreWrap.classList.toggle('hidden'); e.currentTarget.textContent = moreWrap.classList.contains('hidden') ? t('more_details') : t('less_details'); } }, t('more_details')),
      moreWrap, err,
      h('div', { class: 'row end' }, h('a', { class: 'btn', href: isNew ? '#/' : `#/order/${D.id}` }, t('cancel')), btn)));
}

// ---------- Kunden ----------
route(/^\/customers$/, async () => {
  const list = h('div', { class: 'orders' });
  const load = async (q = '') => {
    const { customers } = await api('customers', { params: { q } });
    list.replaceChildren(...(customers.length ? customers.map((c) => h('a', { class: 'card order', href: `#/customer/${c.id}`, style: '--sc:var(--p2)' },
      h('div', { class: 'o-title' }, c.name), h('div', { class: 'o-cust' }, [c.company, c.phone, c.email].filter(Boolean).join(' · ')),
      h('div', { class: 'o-meta' }, `${c.order_count} ${t('nav_orders')} · ${c.currency}`))) : [h('div', { class: 'empty' }, t('no_customers'))]));
  };
  let tm;
  view().replaceChildren(
    h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow' }, t('nav_customers')), h('h1', {}, t('customers_h1_a'), ' ', h('em', {}, t('customers_h1_b')))), h('a', { class: 'btn primary', href: '#/customer/new' }, '+ ' + t('new_customer'))),
    h('div', { class: 'filters' }, h('input', { type: 'search', placeholder: t('search_ph'), oninput: (e) => { clearTimeout(tm); tm = setTimeout(() => load(e.target.value), 250); } })), list);
  await load();
});

route(/^\/customer\/(new|\d+)$/, async (id) => {
  const isNew = id === 'new';
  const c = isNew ? { id: 0, name: '', company: '', email: '', phone: '', address: '', currency: 'DKK', notes: '', orders: [] } : (await api('customer', { params: { id } })).customer;
  const F = {};
  const err = h('div', { class: 'err' });
  const f = (k, label, el) => { F[k] = el; return h('div', {}, h('label', {}, label), el); };
  const mk = (k, type = 'text') => h('input', { type, value: c[k] });
  view().replaceChildren(
    h('a', { href: '#/customers', class: 'muted' }, '← ' + t('nav_customers')),
    h('div', { class: 'page-head', style: 'margin-top:8px' }, h('h1', {}, isNew ? t('new_customer') : c.name),
      !isNew && h('a', { class: 'btn primary', href: `#/new/customer/${c.id}` }, '+ ' + t('new_order'))),
    h('div', { class: 'card grid' },
      h('div', { class: 'grid c2' }, f('name', t('name'), mk('name')), f('company', t('company'), mk('company'))),
      h('div', { class: 'grid c2' }, f('phone', t('phone'), mk('phone', 'tel')), f('email', t('email'), mk('email', 'email'))),
      f('address', t('address'), mk('address')),
      f('currency', t('currency'), h('select', {}, me.currencies.map((x) => h('option', { value: x, selected: x === c.currency }, x)))),
      f('notes', t('notes'), h('textarea', {}, c.notes)), err,
      h('div', { class: 'row end' }, h('button', { class: 'btn primary', onclick: async () => {
        err.textContent = '';
        try { const r = await api('customer_save', { body: { id: c.id, ...Object.fromEntries(Object.entries(F).map(([k, el]) => [k, el.value])) } }); toast(t('saved')); location.hash = `#/customer/${r.id}`; render(); } catch (e) { err.textContent = e.message; }
      } }, t('save')))),
    !isNew && h('div', { class: 'card' }, h('h3', {}, t('history')), c.orders.length ? h('table', { class: 't' }, c.orders.map((o) => h('tr', {}, h('td', {}, h('a', { href: `#/order/${o.id}` }, o.nr)), h('td', {}, o.title), h('td', {}, dfmt(o.due_date)), h('td', {}, statusPill(o.status)), h('td', {}, payPill(o.pay_status)), h('td', {}, money(o.price, o.currency))))) : h('p', { class: 'muted' }, t('no_orders'))),
    !isNew && h('div', { class: 'card' }, h('h3', {}, t('privacy')), h('p', { class: 'muted' }, t('privacy_text')),
      h('div', { class: 'row' }, h('a', { class: 'btn small', href: `${BASE}api.php?a=customer_export&id=${c.id}` }, t('export_data')),
        h('button', { class: 'btn small danger', onclick: async () => { if (confirm(t('confirm_anonymize'))) { await api('customer_anonymize', { body: { id: c.id } }); location.hash = '#/customers'; } } }, t('anonymize')))));
});

// ---------- Kalender ----------
let calStart = null;
route(/^\/calendar$/, async () => {
  calStart = calStart || mondayOf(today());
  const to = addDays(calStart, 27);
  const { days, orders } = await api('calendar', { params: { from: calStart, to } });
  const byDay = {};
  orders.forEach((o) => (byDay[o.d] ||= []).push(o));
  const act = me.processes.filter((p) => +p.active);
  const dows = [...Array(7)].map((_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(lang === 'da' ? 'da-DK' : 'de-DE', { weekday: 'short' }));
  const cells = days.map((d) => {
    const n = (byDay[d.date] || []).length;
    const bars = act.filter((p) => d.p[p.key] && d.p[p.key].cap > 0).map((p) => {
      const x = d.p[p.key];
      const pct = x.booked ? Math.min(100, Math.round(x.booked / x.cap * 100)) : 0;
      return h('div', { class: 'bar' + (x.booked >= x.cap ? ' full' : ''), style: `--c:${p.color};--w:${pct}%` }, h('i'));
    });
    return h('div', { class: 'day' + (d.weekend ? ' we' : '') + (d.date === today() ? ' today' : ''), onclick: () => dayModal(d, byDay[d.date] || [], act) },
      h('div', { class: 'dn' }, +d.date.slice(8)), n > 0 && h('div', { class: 'cnt' }, `${n}×`), h('div', { class: 'bars' }, bars));
  });
  view().replaceChildren(
    h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow' }, t('capacity')), h('h1', {}, t('cal_h1_a'), ' ', h('em', {}, t('cal_h1_b')))),
      h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => { calStart = addDays(calStart, -28); render(); } }, '←'), h('button', { class: 'btn small', onclick: () => { calStart = mondayOf(today()); render(); } }, t('today')), h('button', { class: 'btn small', onclick: () => { calStart = addDays(calStart, 28); render(); } }, '→'))),
    h('div', { class: 'legend' }, act.map((p) => h('span', {}, h('i', { class: 'dot', style: `--c:${p.color}` }), ' ' + pname(p))), h('span', {}, t('cal_hint'))),
    h('div', { class: 'cal' }, dows.map((d) => h('div', { class: 'dow' }, d)), cells));
});
function dayModal(d, orders, act) {
  const close = () => m.remove();
  const m = h('div', { class: 'modal', onclick: (e) => e.target === m && close() },
    h('div', { class: 'sheet' }, h('div', { class: 'row' }, h('h2', {}, dfmt(d.date)), h('span', { class: 'spacer' }), h('button', { class: 'btn small', onclick: close }, '✕')),
      h('h3', { style: 'margin:14px 0 6px' }, t('free_capacity')),
      act.map((p) => { const x = d.p[p.key]; return h('div', { class: 'free' }, h('span', {}, h('i', { class: 'dot', style: `--c:${p.color}` }), ' ' + pname(p)), h('span', {}, x.cap ? `${hm(x.free)} / ${hm(x.cap)}` : '—')); }),
      h('h3', { style: 'margin:14px 0 6px' }, t('nav_orders')),
      orders.length ? orders.map((o) => h('a', { class: 'free', href: `#/order/${o.id}`, onclick: close, style: 'text-decoration:none;color:inherit' }, h('span', {}, `${o.nr} · ${o.title}`), statusPill(o.status))) : h('p', { class: 'muted' }, t('no_orders'))));
  document.body.append(m);
}

// ---------- Einstellungen ----------
route(/^\/settings$/, async () => {
  const procRows = me.processes.map((p) => {
    const cap = h('input', { type: 'number', min: 0, max: 1440, step: 30, value: p.capacity_min, style: 'width:100px' });
    const act = h('input', { type: 'checkbox', checked: +p.active, style: 'width:22px;min-height:0;height:22px' });
    return { p, cap, act, row: h('tr', {}, h('td', {}, h('i', { class: 'dot', style: `--c:${p.color}` }), ' ' + pname(p)), h('td', {}, cap), h('td', {}, act)) };
  });
  const userRows = me.users.map((u) => {
    const name = h('input', { value: u.name }); const wid = h('input', { value: u.wf_admin_id || '', placeholder: 'wf_admin_id', style: 'width:110px' });
    const act = h('input', { type: 'checkbox', checked: +u.active, style: 'width:22px;min-height:0;height:22px' });
    return { u, name, wid, act, row: h('tr', {}, h('td', {}, name), h('td', {}, wid), h('td', {}, act)) };
  });
  const tokOut = h('div');
  const tokList = h('div', {}, me.tokens.map((k) => h('div', { class: 'free' }, h('span', {}, `${k.label} · ${k.created_at.slice(0, 10)}${k.last_used_at ? ' · ' + t('last_seen') + ' ' + k.last_used_at.slice(0, 16) : ''}`),
    k.revoked_at ? h('span', { class: 'muted' }, t('revoked')) : h('button', { class: 'btn small danger', onclick: async () => { if (confirm(t('confirm_revoke'))) { await api('token_revoke', { body: { id: k.id } }); await reloadMe(); render(); } } }, t('revoke')))));
  view().replaceChildren(
    h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow' }, t('nav_settings')), h('h1', {}, t('settings_h1_a'), ' ', h('em', {}, t('settings_h1_b'))))),
    h('div', { class: 'card' }, h('h3', {}, t('display_title')), h('p', { class: 'muted' }, t('display_text')),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: async () => {
        const r = await api('token_create', { body: { label: t('display_label') } });
        const url = new URL(`${BASE}werkstatt/?t=${r.token}`, location.href).href;
        tokOut.replaceChildren(h('p', { class: 'muted' }, t('display_once')), h('div', { class: 'token-box' }, url), h('div', { class: 'row', style: 'margin-top:8px' }, h('button', { class: 'btn small', onclick: () => navigator.clipboard.writeText(url).then(() => toast(t('copied'))) }, t('copy')), h('a', { class: 'btn small', href: url, target: '_blank', rel: 'noopener' }, t('open'))));
        await reloadMe();
      } }, t('create_link'))), tokOut, h('div', { style: 'margin-top:12px' }, tokList)),
    h('div', { class: 'card' }, h('h3', {}, t('capacity')), h('p', { class: 'muted' }, t('capacity_text')),
      h('table', { class: 't' }, h('tr', {}, h('th', {}, t('process')), h('th', {}, t('min_per_day')), h('th', {}, t('active'))), procRows.map((r) => r.row)),
      h('div', { class: 'row end', style: 'margin-top:10px' }, h('button', { class: 'btn primary', onclick: async () => { await api('processes_save', { body: { processes: procRows.map((r) => ({ id: r.p.id, capacity_min: r.cap.value, active: r.act.checked })) } }); await reloadMe(); toast(t('saved')); } }, t('save')))),
    h('div', { class: 'card' }, h('h3', {}, t('users')), h('p', { class: 'muted' }, t('users_text', me.user.name)),
      h('table', { class: 't' }, h('tr', {}, h('th', {}, t('name')), h('th', {}, 'Admin-ID'), h('th', {}, t('active'))), userRows.map((r) => r.row)),
      h('div', { class: 'row end', style: 'margin-top:10px' }, h('button', { class: 'btn primary', onclick: async () => { try { await api('users_save', { body: { users: userRows.map((r) => ({ id: r.u.id, name: r.name.value, wf_admin_id: r.wid.value, active: r.act.checked })) } }); await reloadMe(); toast(t('saved')); } catch (e) { toast(e.message); } } }, t('save')))),
    h('div', { class: 'card' }, h('h3', {}, t('data')), h('div', { class: 'row' },
      h('a', { class: 'btn', href: `${BASE}api.php?a=backup` }, t('backup')),
      h('button', { class: 'btn', onclick: async () => { const r = await api('purge', { body: {} }); toast(t('purged', r.purged)); } }, t('purge')))));
});

async function reloadMe() { me = await api('me'); }

// ---------- Start ----------
function buildChrome() {
  const nav = $('#nav');
  const item = (r, ic, label, cls) => h('a', { href: '#' + r, 'data-r': r, class: cls || '' }, cls === 'add' ? h('span', { class: 'fab' }, icon(ic)) : icon(ic), cls === 'add' ? h('small', {}, label) : h('span', {}, label));
  nav.replaceChildren(item('/', 'list', t('nav_orders')), item('/calendar', 'cal', t('nav_calendar')), item('/new', 'plus', t('new_order'), 'add'), item('/customers', 'users', t('nav_customers')), item('/settings', 'cog', t('nav_settings')));
  const l = $('#lang');
  l.replaceChildren(...[['de', '🇩🇪'], ['da', '🇩🇰']].map(([c, f]) => h('button', { class: lang === c ? 'on' : '', 'aria-label': c, onclick: () => { lang = c; try { localStorage.setItem('wf_lang', c); } catch (e) {} document.documentElement.lang = c; buildChrome(); render(); } }, f)));
  $('#who').textContent = me ? me.user.name : '';
}

(async () => {
  document.documentElement.lang = lang;
  try { me = await api('me'); } catch (e) { return; }
  buildChrome();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register(`${BASE}sw.js`).catch(() => {});
  render();
})();
})();
