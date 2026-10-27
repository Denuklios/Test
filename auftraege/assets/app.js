/* Wunsch-Fabrik Auftraege – Frontend ohne Build. Alle Texte kommen per textContent (kein innerHTML mit Nutzerdaten). */
(() => {
'use strict';
const BASE = document.documentElement.dataset.base || '';
const APP_VERSION = '2026-10-27 · Verfolgung Sprachwahl';
let me = null;
let lang = (navigator.language || '').startsWith('da') ? 'da' : 'de';
try { lang = localStorage.getItem('wf_lang') || lang; } catch (e) { /* Speicher gesperrt */ }
// Design: hell (Standard) oder dunkel, je Gerät gemerkt
function applyTheme(th) {
  document.documentElement.dataset.theme = th;
  const m = document.querySelector('meta[name=theme-color]');
  if (m) m.content = th === 'dark' ? '#090909' : '#f8f7fb';
}
let theme = 'light';
try { theme = localStorage.getItem('wf_theme') || 'light'; } catch (e) { /* Speicher gesperrt */ }
applyTheme(theme);
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
const show = (...kids) => view().replaceChildren(...kids.flat().filter((k) => k != null && k !== false && k !== ''));
function toast(msg) {
  const el = h('div', { class: 'toast' }, msg);
  document.body.append(el);
  setTimeout(() => el.remove(), 2600);
}
const ICON = {
  tag: 'M3 12V4h8l10 10-8 8zM7.5 7.5h.01',
  list: 'M4 6h16M4 12h16M4 18h10', plus: 'M12 5v14M5 12h14', cal: 'M5 5h14v15H5zM5 10h14M9 3v4M15 3v4',
  doc: 'M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5', users: 'M16 19v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1M10 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M20 19v-1a3 3 0 0 0-2-2.8', cog: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19 12l2-1-2-4-2 1-2-1-1-2h-4l-1 2-2 1-2-1-2 4 2 1v2l-2 1 2 4 2-1 2 1 1 2h4l1-2 2-1 2 1 2-4-2-1z'
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
  if (!j || !j.ok) {
    const code = j ? j.error : 'server_error';
    let detail = j && j.detail ? j.detail : '';
    if (code === 'company_incomplete') detail = detail.split(',').map((k) => t('co_' + (k === 'bank' ? 'iban' : k))).join(', ');
    else if (detail && /^\d{4}-\d{2}-\d{2}$/.test(detail)) detail = dfmt(detail);
    const e = new Error(t('err_' + code, detail)); e.code = code; throw e;
  }
  return j;
}
function showLogin() {
  show(h('div', { class: 'card' }, h('h2', {}, t('login_title')), h('p', { class: 'muted' }, t('login_text'))));
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
const workerById = (id) => (me.workers || []).find((w) => +w.id === +id);
const activeWorkers = () => (me.workers || []).filter((w) => w.active);
const wchip = (w) => w ? h('span', { class: 'wchip', style: `--wc:${w.color}` }, h('i'), w.name) : null;
const hhmmAdd = (hhmm, m) => { const x = (+hhmm.slice(0, 2)) * 60 + (+hhmm.slice(3)) + m; return `${String(Math.floor(x / 60) % 24).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
const hoursToMin = (v) => Math.max(0, Math.round((parseFloat(String(v).replace(',', '.')) || 0) * 60));
const minToHours = (m) => String(Math.round(m / 60 * 100) / 100).replace('.', lang === 'da' ? ',' : ',');

// Foto/Skizze vom Handy: vor dem Hochladen verkleinern (spart Datenvolumen, passt in die Upload-Grenzen des Hostings)
async function prepImage(file) {
  const stamp = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
  let name = file.name || 'foto';
  if (/^(image|foto|img_?\d*)\.[a-z]+$/i.test(name)) name = `Foto-${stamp()}${name.slice(name.lastIndexOf('.'))}`;
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/webp') return name === file.name ? file : new File([file], name, { type: file.type });
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const sc = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    if (sc === 1 && file.size < 1.5e6) { bmp.close && bmp.close(); return name === file.name ? file : new File([file], name, { type: file.type }); }
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bmp.close && bmp.close();
    const png = file.type === 'image/png';                               // Logos mit transparentem Hintergrund bleiben PNG
    const blob = await new Promise((r) => c.toBlob(r, png ? 'image/png' : 'image/jpeg', 0.85));
    if (!blob || (sc === 1 && blob.size >= file.size)) return name === file.name ? file : new File([file], name, { type: file.type });
    return new File([blob], name.replace(/\.[^.]+$/, png ? '.png' : '.jpg'), { type: blob.type });
  } catch (e) { return file; }
}
async function uploadFiles(orderId, files) {
  let i = 0;
  for (const f of files) {
    i++;
    if (files.length > 1) toast(t('uploading', i, files.length));
    try { const fd = new FormData(); fd.append('order_id', orderId); fd.append('file', await prepImage(f)); await api('file_upload', { form: fd }); }
    catch (er) { toast((f.name || t('photo')) + ': ' + er.message); }
  }
}
// Kamera + Galerie-Knopfblock; onFiles(FileList) bekommt die gewaehlten Dateien
function photoButtons(onFiles) {
  const cam = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'hidden', onchange: (e) => { onFiles([...e.target.files]); e.target.value = ''; } });
  const gal = h('input', { type: 'file', accept: 'image/*,application/pdf', multiple: true, class: 'hidden', onchange: (e) => { onFiles([...e.target.files]); e.target.value = ''; } });
  return h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn primary', onclick: () => cam.click() }, '📷 ' + t('take_photo')), h('button', { type: 'button', class: 'btn', onclick: () => gal.click() }, '🖼 ' + t('pick_files')), cam, gal);
}
const thumbUrl = (id) => `${BASE}file.php?id=${id}&thumb=1`;
const procNames = (ids, max = 2) => {
  const n = (ids || '').split(',').filter(Boolean).map((i) => procById(i)).filter(Boolean).map(pname);
  return n.length > max ? n.slice(0, max).join(', ') + ' +' + (n.length - max) : n.join(', ');
};
const procDots = (ids) => (ids || []).map((id) => { const p = procById(id); return p ? h('span', { class: 'chip', style: `--c:${p.color}` }, h('i', { class: 'dot', style: `--c:${p.color}` }), pname(p)) : null; });

// ---------- Router ----------
const routes = [];
const route = (re, fn) => routes.push([re, fn]);
async function render() {
  if (!me) return;
  const hash = location.hash.replace(/^#/, '') || '/';
  const navHash = /^\/(expense|bank|invoice|tax)/.test(hash) ? '/invoices' : hash;
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('on', a.dataset.r && (navHash === a.dataset.r || (a.dataset.r !== '/' && navHash.startsWith(a.dataset.r)))));
  for (const [re, fn] of routes) {
    const m = re.exec(hash);
    if (m) {
      try { await fn(...m.slice(1)); } catch (e) { if (e.message !== 'not_logged_in') show(h('div', { class: 'card err' }, e.message)); }
      window.scrollTo(0, 0);
      return;
    }
  }
  location.hash = '#/';
}
window.addEventListener('hashchange', render);

// ---------- Auftragsliste ----------
const filt = { q: '', status: '', pay: '', process: '', worker: '', overdue: false, show: 'active' };
route(/^\/$/, async () => {
  const list = h('div', { class: 'orders' });
  const load = async () => {
    const params = { show: filt.show, q: filt.q };
    for (const k of ['status', 'pay', 'process', 'worker']) if (filt[k]) params[k] = filt[k];
    if (filt.overdue) params.overdue = 1;
    const { orders } = await api('orders', { params });
    list.replaceChildren(...(orders.length ? orders.map(orderCard) : [h('div', { class: 'empty' }, t('no_orders'))]));
  };
  let timer;
  const sel = (key, opts, ph) => h('select', { onchange: (e) => { filt[key] = e.target.value; load(); } },
    h('option', { value: '' }, ph), opts.map(([v, l]) => h('option', { value: v, selected: String(filt[key]) === String(v) }, l)));
  show(
    h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow' }, t('workshop')), h('h1', {}, t('orders_h1_a'), ' ', h('em', {}, t('orders_h1_b'))))),
    h('div', { class: 'filters' },
      h('input', { type: 'search', placeholder: t('search_ph'), value: filt.q, oninput: (e) => { filt.q = e.target.value; clearTimeout(timer); timer = setTimeout(load, 250); } }),
      sel('status', me.statuses.map((s) => [s, t('st_' + s)]), t('all_status')),
      sel('pay', me.pay.map((s) => [s, t('pay_' + s)]), t('all_pay')),
      sel('process', me.processes.filter((p) => +p.active).map((p) => [p.id, pname(p)]), t('all_process')),
      activeWorkers().length > 1 && sel('worker', activeWorkers().map((w) => [w.id, w.name]), t('all_workers')),
      h('select', { onchange: (e) => { filt.show = e.target.value; load(); } },
        [['active', t('show_active')], ['all', t('show_all')], ['trash', t('show_trash')]].map(([v, l]) => h('option', { value: v, selected: filt.show === v }, l))),
      h('label', { class: 'chip' + (filt.overdue ? ' on' : ''), style: 'margin:0', onclick: (e) => { filt.overdue = !filt.overdue; e.currentTarget.classList.toggle('on', filt.overdue); load(); } }, t('only_overdue'))),
    list);
  await load();
  // Hinweis, wenn in der Buchhaltung etwas Wichtiges offen ist (Frist, Backup, Schwellen)
  api('tax_overview').then((t0) => {
    const n = t0.warnings.filter((w) => w.level !== 'info').length;
    if (n && location.hash.replace(/^#/, '') in { '': 1, '/': 1 }) view().prepend(h('a', { class: 'alertbar', href: '#/tax' }, h('span', {}, t0.warnings.some((w) => w.level === 'bad') ? '⛔' : '⚠'), h('span', {}, t('alert_tax', n)), h('b', { style: 'margin-left:auto' }, '→')));
  }).catch(() => {});
});

function orderCard(o) {
  const late = o.due_date && o.due_date < today() && !['done', 'delivered'].includes(o.status);
  const idx = me.statuses.indexOf(o.status);
  const nextS = me.statuses[idx + 1];
  const card = h('div', { class: 'card order' + (late ? ' overdue' : ''), style: `--sc:${SCOL[o.status]}` },
    h('a', { href: `#/order/${o.id}`, style: 'text-decoration:none;color:inherit;display:block' },
      h('div', { class: 'o-top' }, o.thumb ? h('img', { class: 'o-thumb', src: thumbUrl(o.thumb), alt: '', loading: 'lazy' }) : null, h('div', { style: 'flex:1;min-width:0' }, h('div', { class: 'o-nr' }, o.nr), h('div', { class: 'o-title' }, o.title), h('div', { class: 'o-cust' }, o.customer_name + (o.customer_company ? ' · ' + o.customer_company : ''))),
        h('div', { style: 'text-align:right' }, statusPill(o.status), h('div', { style: 'margin-top:6px' }, payPill(o.pay_status)))),
      h('div', { class: 'o-meta' }, h('span', { class: 'due' + (late ? ' late' : '') }, (late ? '⚠ ' : '') + dfmt(o.due_date)), h('span', {}, `${o.qty} ${t('pcs')}`), h('span', { class: 'muted' }, money(o.price, o.currency)),
        o.total_min ? h('span', { class: 'muted' }, '⏱ ' + hm(o.total_min)) : null,
        activeWorkers().length > 1 ? wchip(workerById(o.worker_id)) : null,
        procDots((o.process_ids || '').split(',').filter(Boolean))),
      o.plan_date ? h('div', { class: 'o-plan' }, `🔧 ${t('production')}: ${dfmt(o.plan_date)}${o.start_time ? ' ' + o.start_time : ''}${o.finish_date && o.finish_date !== o.plan_date ? ' → ' + dfmt(o.finish_date) : ''}`) : null),
    nextS && !o.deleted_at && h('div', { class: 'next' }, h('button', { class: 'btn small', onclick: async (e) => { e.preventDefault(); const r = await setStatus(o, nextS); if (r) { toast(r.invoice_id ? t('inv_draft_auto') : t('saved')); render(); } } }, '→ ' + t('st_' + nextS))));
  return card;
}

// ---------- Auftrag Detail ----------
route(/^\/order\/(\d+)$/, async (id) => {
  const { order: o } = await api('order', { params: { id } });
  const reload = () => render();
  const late = o.due_date && o.due_date < today() && !['done', 'delivered'].includes(o.status);
  const steps = h('div', { class: 'steps' }, me.statuses.map((s, i) => h('button', { class: i < me.statuses.indexOf(o.status) ? 'done' : i === me.statuses.indexOf(o.status) ? 'cur' : '', onclick: async () => { const r = await setStatus(o, s); if (!r) return; if (r.invoice_id) toast(t('inv_draft_auto')); reload(); } }, t('st_' + s))));
  const paySel = h('select', { onchange: async (e) => { await api('order_status', { body: { id: o.id, pay_status: e.target.value } }); reload(); } }, me.pay.map((p) => h('option', { value: p, selected: p === o.pay_status }, t('pay_' + p))));
  const rest = o.price - o.deposit;
  const wk = workerById(o.worker_id);
  const dayMin = wk ? wk.day_min : 480;
  show(
    h('a', { href: '#/', class: 'muted' }, '← ' + t('nav_orders')),
    h('div', { class: 'page-head', style: 'margin-top:8px' }, h('div', {}, h('div', { class: 'eyebrow' }, o.nr), h('h1', {}, o.title), h('div', { class: 'muted' }, h('a', { href: `#/customer/${o.customer_id}` }, o.customer_name + (o.customer_company ? ' · ' + o.customer_company : '')))),
      h('div', { class: 'row' }, o.deleted_at ? h('button', { class: 'btn', onclick: async () => { await api('order_restore', { body: { id: o.id } }); reload(); } }, t('restore')) : [
        h('a', { class: 'btn', href: `#/order/${o.id}/edit` }, t('edit')),
        h('button', { class: 'btn danger', onclick: async () => { if (confirm(t('confirm_delete'))) { await api('order_delete', { body: { id: o.id } }); location.hash = '#/'; } } }, t('delete'))])),
    h('div', { class: 'card' }, steps,
      h('dl', { class: 'kv', style: 'margin-top:14px' },
        h('dt', {}, t('due')), h('dd', { class: late ? 'due late' : '' }, (late ? '⚠ ' : '') + dfmt(o.due_date)),
        h('dt', {}, t('article')), h('dd', {}, `${o.article || '—'} · ${o.qty} ${t('pcs')}`),
        h('dt', {}, t('processes')), h('dd', {}, h('div', { class: 'row' }, o.processes.length ? o.processes.map((p) => { const pr = procById(p.process_id); return h('span', { class: 'chip', style: `--c:${pr.color}` }, h('i', { class: 'dot', style: `--c:${pr.color}` }), `${pname(pr)}${p.per_piece ? ` · ${p.per_piece} ${t('min_short')} × ${o.qty}` : ''}${p.minutes ? ' = ' + hm(p.minutes) : ''}`); }) : '—')),
        h('dt', {}, t('total_time')), h('dd', {}, o.total_min ? `${hm(o.total_min)} · ${Math.round(o.total_min / dayMin * 100)} % ${t('of_a_day')}` : '—'),
        h('dt', {}, t('worker')), h('dd', {}, wchip(wk)),
        h('dt', {}, t('production')), h('dd', {}, o.days.some((d) => d.kind === 'work') ? h('div', {}, o.days.filter((d) => d.kind === 'work').map((d) => h('div', {}, `${dfmt(d.date)} · ${d.start}–${d.end}`)), o.finish_date ? h('small', { class: 'muted' }, `${t('finish')}: ${dfmt(o.finish_date)}`) : null) : '—'),
        o.days.some((d) => d.kind === 'handover') ? [h('dt', {}, t('handover')), h('dd', {}, o.days.filter((d) => d.kind === 'handover').map((d) => h('div', {}, `🤝 ${dfmt(d.date)} · ${d.start}–${d.end}`)))] : null,
        h('dt', {}, t('price')), h('dd', {}, `${money(o.price, o.currency)} · ${t('deposit')} ${money(o.deposit, o.currency)} · ${t('remaining')} ${money(rest, o.currency)}`),
        h('dt', {}, t('payment')), h('dd', {}, paySel))),
    o.items && o.items.length ? h('div', { class: 'card' }, h('h3', { style: 'margin-bottom:8px' }, t('items_label')), h('div', { class: 'tscroll' }, h('table', { class: 't' }, o.items.map((i) => {
      const m = procMin(i.processes, i.qty);
      return h('tr', {}, h('td', {}, `${i.qty} ×`), h('td', {}, h('b', {}, i.name), h('div', { class: 'muted', style: 'font-size:.8rem' }, procLabel(i.processes))),
        h('td', { class: 'num' }, money(i.qty * i.price, o.currency)), h('td', { class: 'num muted' }, m ? hm(m) : ''));
    })))) : null,
    (o.description || o.notes) && h('div', { class: 'card' }, o.description && h('p', { style: 'margin:0 0 8px;white-space:pre-wrap' }, o.description), o.notes && h('p', { class: 'muted', style: 'margin:0;white-space:pre-wrap' }, o.notes)),
    !o.deleted_at && trackCard(o, reload),
    !o.deleted_at && orderMoneyCard(o, reload),
    h('div', { class: 'card' }, h('h3', { style: 'margin-bottom:10px' }, t('files')),
      photoButtons(async (list) => { await uploadFiles(o.id, list); reload(); }),
      h('div', { class: 'files' }, o.files.map((f) => h('div', { class: 'file' },
        h('a', { href: `${BASE}file.php?id=${f.id}`, target: '_blank', rel: 'noopener' }, f.mime.startsWith('image/') ? h('img', { src: thumbUrl(f.id), alt: f.original_name, loading: 'lazy' }) : h('div', { class: 'pdf' }, 'PDF')),
        h('div', { class: 'n' }, h('span', { style: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, f.original_name), h('a', { href: '#', title: t('delete'), onclick: async (e) => { e.preventDefault(); if (confirm(t('confirm_delete_file'))) { await api('file_delete', { body: { id: f.id } }); reload(); } } }, '✕')))))),
    h('div', { class: 'card' }, h('h3', {}, t('history')), h('ul', { class: 'log' }, o.log.map((l) => h('li', {}, `${l.at.slice(0, 16)} · ${l.user_name} · ${logText(l.what)}`)))));
});
// Status setzen; bei „Abgeholt/Versendet“ erst fragen: abgeholt oder verschickt (Dienst + Sendungsnummer)
function setStatus(o, s) {
  if (s !== 'delivered' || o.status === 'delivered') return api('order_status', { body: { id: o.id, status: s } });
  return new Promise((resolve) => {
    const close = (v) => { m.remove(); resolve(v); };
    const form = shipForm(o);
    const go = async (mode) => { try { close(await api('order_status', { body: { id: o.id, status: s, ship_mode: mode, ...(mode === 'ship' ? form.get() : {}) } })); } catch (e) { toast(e.message); } };
    const m = h('div', { class: 'modal', onclick: (e) => { if (e.target === m) close(null); } },
      h('div', { class: 'sheet' },
        h('div', { class: 'row' }, h('h2', { style: 'flex:1' }, t('st_delivered')), h('button', { type: 'button', class: 'btn small', onclick: () => close(null) }, '✕')),
        h('div', { class: 'grid', style: 'margin-top:10px' },
          h('button', { class: 'btn', onclick: () => go('pickup') }, '🤝 ' + t('ship_pickup')),
          h('div', { class: 'card', style: 'margin:0' }, h('h3', { style: 'margin-bottom:8px' }, '📦 ' + t('ship_ship')), form,
            h('button', { class: 'btn primary', style: 'margin-top:10px;width:100%', onclick: () => go('ship') }, t('ship_save'))))));
    document.body.append(m);
  });
}
function shipForm(o) {
  const car = h('select', {}, h('option', { value: '' }, '—'), Object.entries(me.carriers).filter(([k]) => k !== 'other').map(([k, n]) => h('option', { value: k, selected: k === o.carrier }, n)), h('option', { value: 'other', selected: o.carrier === 'other' }, t('ship_other')));
  const no = h('input', { type: 'text', value: o.tracking_no || '', placeholder: t('ship_no_ph'), autocomplete: 'off' });
  const el = h('div', { class: 'grid c2' }, h('div', {}, h('label', {}, t('ship_carrier')), car), h('div', {}, h('label', {}, t('ship_no')), no));
  el.get = () => ({ carrier: car.value, tracking_no: no.value.trim() });
  return el;
}
// Verfolgungslink für den Kunden + Versand (Sendungsnummer erscheint dort)
function trackCard(o, reload) {
  const url = o.track_url;
  const shared = h('div', { class: 'row', style: 'margin-top:8px;flex-wrap:wrap' },
    navigator.share ? h('button', { class: 'btn small primary', onclick: () => navigator.share({ title: t('track_title'), text: t('track_share_text', o.nr), url }).catch(() => {}) }, t('share')) : null,
    h('button', { class: 'btn small', onclick: () => navigator.clipboard.writeText(url).then(() => toast(t('copied'))) }, t('copy')),
    h('a', { class: 'btn small', href: url, target: '_blank', rel: 'noopener' }, t('open')));
  let ship = null;
  if (o.status === 'delivered') {
    const form = shipForm(o);
    ship = h('div', { style: 'margin-top:14px' }, h('div', { class: 'sechead' }, o.ship_mode === 'pickup' ? '🤝 ' + t('ship_pickup') : '📦 ' + t('ship_ship')),
      o.ship_mode !== 'pickup' ? form : null,
      o.ship_mode !== 'pickup' ? h('div', { class: 'row', style: 'margin-top:8px;flex-wrap:wrap' },
        h('button', { class: 'btn small primary', onclick: async () => { try { await api('order_ship', { body: { id: o.id, ship_mode: 'ship', ...form.get() } }); toast(t('saved')); reload(); } catch (e) { toast(e.message); } } }, t('save')),
        o.customer_email ? h('button', { class: 'btn small', onclick: async () => { try { const r = await api('order_ship', { body: { id: o.id, ship_mode: 'ship', mail: 1, ...form.get() } }); toast(r.mailed ? t('mail_ship_sent', o.customer_email) : t('mail_failed_share')); reload(); } catch (e) { toast(e.message); } } }, '✉ ' + t('ship_mail')) : null,
        o.carrier_url ? h('a', { class: 'btn small', href: o.carrier_url, target: '_blank', rel: 'noopener' }, t('ship_follow')) : null) : null,
      h('p', { class: 'muted', style: 'margin:8px 0 0;font-size:.85rem' }, o.followup_at && o.followup_at !== 'skip' ? '✉ ' + t('fu_sent', o.followup_at.slice(0, 16))
        : o.followup_at === 'skip' ? t('fu_skip') : me.company.mail_followup === false ? t('fu_off') : o.shipped_at ? t('fu_planned', dfmt(addDays(o.shipped_at.slice(0, 10), 7))) : ''));
  }
  return h('div', { class: 'card' }, h('h3', { style: 'margin-bottom:6px' }, '📍 ' + t('track_title')), h('p', { class: 'muted', style: 'margin:0' }, t('track_text')), shared, ship);
}

// Rechnungen und Auftragsbestaetigung direkt am Auftrag
function orderMoneyCard(o, reload) {
  const main = o.invoices.filter((i) => i.purpose !== 'deposit' && !i.fully_credited);
  const go = async (purpose, amount) => {
    try { const r = await api('order_invoice', { body: { order_id: o.id, purpose, amount } }); location.hash = `#/invoice/${r.id}`; } catch (e) { toast(e.message); }
  };
  const c = o.confirmation;
  const linkBox = h('div');
  const showLink = (token) => {
    const url = new URL(`${BASE}bestaetigung.php?t=${token}`, location.href).href;
    const text = t('confirm_share_text', o.nr);
    linkBox.replaceChildren(h('p', { class: 'muted', style: 'margin:10px 0 6px' }, t('confirm_link_once')), h('div', { class: 'token-box' }, url),
      h('div', { class: 'row', style: 'margin-top:8px' },
        navigator.share ? h('button', { class: 'btn small primary', onclick: () => navigator.share({ title: t('confirm_title'), text, url }).catch(() => {}) }, t('share')) : null,
        h('button', { class: 'btn small', onclick: () => navigator.clipboard.writeText(url).then(() => toast(t('copied'))) }, t('copy')),
        o.customer_email ? h('a', { class: 'btn small', href: `mailto:${encodeURIComponent(o.customer_email)}?subject=${encodeURIComponent(t('confirm_title') + ' ' + o.nr)}&body=${encodeURIComponent(text + '\n\n' + url)}` }, '✉ E-Mail') : null,
        h('a', { class: 'btn small', href: url, target: '_blank', rel: 'noopener' }, t('open'))));
  };
  const send = async (ev) => {
    const b = ev && ev.currentTarget;
    if (b) b.disabled = true;
    try {
      const r = await api('confirm_create', { body: { order_id: o.id, email: !!o.customer_email && me.company.mail_offer !== false } });
      showLink(r.token);
      if (r.mailed) toast(t('mail_offer_sent', o.customer_email)); else if (o.customer_email && me.company.mail_offer !== false) toast(t('mail_failed_share'));
      else if (!o.customer_email) toast(t('mail_no_address'));
    } catch (e) { toast(e.message); } finally { if (b) b.disabled = false; }
  };
  let conf;
  const viewBtn = c ? h('a', { class: 'btn small', href: `${BASE}bestaetigung.php?id=${c.id}`, target: '_blank', rel: 'noopener' }, '📄 ' + t('confirm_view')) : null;
  if (c && c.signed_at) {
    conf = h('div', { class: 'confok' }, h('b', {}, '✓ ' + t('confirm_signed', c.signer_name, c.signed_at.slice(0, 16))), h('img', { src: `${BASE}api.php?a=confirm_signature&id=${c.id}`, alt: '', class: 'sigimg' }), h('div', {}, viewBtn));
  } else if (c && !c.revoked_at && c.expires_at > new Date().toISOString().slice(0, 19).replace('T', ' ')) {
    conf = h('div', {}, h('p', { class: 'muted', style: 'margin:0 0 8px' }, t('confirm_open', c.created_at.slice(0, 10)) + (c.viewed_at ? ' · ' + t('confirm_viewed', c.viewed_at.slice(0, 16)) : '')),
      h('div', { class: 'row' }, viewBtn, h('button', { class: 'btn small', onclick: send }, t('confirm_new_link')), h('button', { class: 'btn small danger', onclick: async () => { await api('confirm_revoke', { body: { order_id: o.id } }); reload(); } }, t('revoke'))), linkBox);
  } else {
    conf = h('div', {}, h('p', { class: 'muted', style: 'margin:0 0 8px' }, t('confirm_text')), h('button', { class: 'btn', onclick: send }, '✍ ' + t('confirm_send')), linkBox);
  }
  return h('div', { class: 'card' },
    h('h3', { style: 'margin-bottom:10px' }, t('money_card')),
    o.invoices.length ? h('div', { style: 'margin-bottom:10px' }, o.invoices.map((i) => h('a', { class: 'free', href: `#/invoice/${i.id}`, style: 'text-decoration:none;color:inherit' },
      h('span', {}, `${t('purpose_' + (i.purpose || 'none'))} ${i.status === 'final' ? i.number : '· ' + t('draft')}`),
      h('span', { class: 'row', style: 'gap:8px' }, cents(i.total, i.currency), invState(i.status === 'draft' ? 'draft' : i.fully_credited ? 'credit' : i.open > 0 ? (i.due_date < today() ? 'overdue' : 'open') : 'paid'))))) : h('p', { class: 'muted', style: 'margin:0 0 10px' }, t('no_invoices_order')),
    !main.length && h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: () => { const v = prompt(t('deposit_prompt', o.currency), String(Math.round(o.price / 2 * 100) / 100).replace('.', ',')); if (v) go('deposit', v); } }, t('make_deposit')),
      h('button', { class: 'btn primary', onclick: () => go('final') }, '🧾 ' + t(o.invoices.length ? 'make_final' : 'invoice_from_order'))),
    h('div', { class: 'sechead', style: 'margin-top:16px' }, t('confirm_title')), conf);
}

function logText(w) {
  if (w.startsWith('status:')) return t('log_status') + ' ' + t('st_' + w.slice(7));
  if (w.startsWith('pay:')) return t('log_pay') + ' ' + t('pay_' + w.slice(4));
  if (w.startsWith('file:')) return t('log_file') + ' ' + w.slice(5);
  if (w.startsWith('confirmed:')) return t('log_confirmed');
  if (w.startsWith('mail:')) return '✉ ' + t('log_mail_' + w.slice(5));
  return t('log_' + w);
}

// ---------- Tageswahl: zeigt nur Tage, die wirklich moeglich sind ----------
// fetchDays() liefert { dates: ['YYYY-MM-DD', ...] }. Alles andere (vergangen, gesperrt, voll) wird gar nicht angezeigt.
function dayPicker(initial, fetchDays) {
  let value = initial || '';
  const btn = h('button', { type: 'button', class: 'btn pickbtn', onclick: () => open() });
  const clear = h('button', { type: 'button', class: 'btn small', 'aria-label': t('pick_clear'), onclick: () => set('') }, '✕');
  const root = h('div', { class: 'row', style: 'flex-wrap:nowrap' }, btn, clear);
  function set(v) {
    const changed = (v || '') !== value;
    value = v || '';
    if (changed) root.dispatchEvent(new Event('daychange'));
    btn.textContent = value ? '📅 ' + dfmt(value) : '📅 ' + t('pick_day');
    clear.classList.toggle('hidden', !value);
  }
  Object.defineProperty(root, 'value', { get: () => value, set });
  set(value);
  async function open() {
    let r;
    try { r = await fetchDays(); } catch (e) { toast(e.message); return; }
    const avail = new Set(r.dates);
    if (value) avail.add(value); // bereits gespeicherter Tag bleibt sichtbar
    const sorted = [...avail].sort();
    let month = (value || sorted[0] || today()).slice(0, 7);
    const first = today().slice(0, 7);
    const modal = h('div', { class: 'modal', onclick: (e) => { if (e.target === modal) modal.remove(); } });
    const draw = () => {
      const [y, m] = month.split('-').map(Number);
      const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;
      const n = new Date(y, m, 0).getDate();
      const cells = [...Array(lead)].map(() => h('div'));
      let any = false;
      for (let d = 1; d <= n; d++) {
        const iso = `${month}-${String(d).padStart(2, '0')}`;
        if (avail.has(iso)) {
          any = true;
          cells.push(h('button', { type: 'button', class: 'dayb' + (iso === value ? ' sel' : ''), onclick: () => { set(iso); modal.remove(); } }, d));
        } else cells.push(h('div'));
      }
      const label = new Date(y, m - 1, 1).toLocaleDateString(lang === 'da' ? 'da-DK' : 'de-DE', { month: 'long', year: 'numeric' });
      const dows = [...Array(7)].map((_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(lang === 'da' ? 'da-DK' : 'de-DE', { weekday: 'short' }));
      const shift = (k) => { const dt = new Date(y, m - 1 + k, 1); month = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`; draw(); };
      modal.replaceChildren(h('div', { class: 'sheet' },
        h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn small', disabled: month <= first, onclick: () => shift(-1) }, '←'), h('h2', { style: 'flex:1;text-align:center' }, label), h('button', { type: 'button', class: 'btn small', onclick: () => shift(1) }, '→')),
        h('p', { class: 'muted', style: 'font-size:.85rem;margin:6px 0' }, t('pick_hint')),
        h('div', { class: 'mgrid' }, dows.map((x) => h('div', { class: 'dow' }, x)), cells),
        !any && h('p', { class: 'muted' }, t('pick_none')),
        h('div', { class: 'row end', style: 'margin-top:10px' }, h('button', { type: 'button', class: 'btn small', onclick: () => modal.remove() }, t('cancel')))));
    };
    draw();
    document.body.append(modal);
  }
  return root;
}

// ---------- Uhrzeit waehlen: nur wirklich freie Zeitfenster ----------
// r = { starts: [{start, end, finish?}], free: [['08:00','10:00'], ...] }
function slotModal(title, day, r, current, onPick) {
  const close = () => m.remove();
  const pick = (v) => { onPick(v); close(); };
  const m = h('div', { class: 'modal', onclick: (e) => { if (e.target === m) close(); } },
    h('div', { class: 'sheet' },
      h('div', { class: 'row' }, h('h2', { style: 'flex:1' }, title), h('button', { type: 'button', class: 'btn small', onclick: close }, '✕')),
      h('p', { class: 'muted', style: 'margin:4px 0 8px' }, dfmt(day)),
      r.free.length ? h('p', { style: 'margin:0 0 10px;font-size:.9rem' }, h('span', { class: 'muted' }, t('slot_free') + ' '), r.free.map((x) => x.join('–')).join(', ')) : null,
      r.starts.length ? h('div', { class: 'slots' }, r.starts.map((x) => h('button', { type: 'button', class: 'dayb slot' + (x.start === current ? ' sel' : ''), onclick: () => pick(x.start) }, `${x.start}`, h('small', {}, `–${x.end}`))))
        : h('p', { class: 'muted' }, t('slot_none')),
      h('div', { class: 'row end', style: 'margin-top:12px' }, current ? h('button', { type: 'button', class: 'btn small danger', onclick: () => pick('') }, t('slot_clear')) : null, h('button', { type: 'button', class: 'btn small', onclick: close }, t('cancel')))));
  document.body.append(m);
}

// ---------- Auftrag Formular (neu / bearbeiten) ----------
route(/^\/new$/, () => orderForm(null));
// Aus einer Notiz (z. B. WF-Launcher): #/new?note=Text -> erste Zeile = Titel, ganzer Text = Beschreibung
route(/^\/new\?([\s\S]*)$/, (qs) => noteToOrder(new URLSearchParams(qs).get('note') || ''));
route(/^\/note-form\?([\s\S]*)$/, (qs) => orderForm(null, 0, new URLSearchParams(qs).get('note') || ''));

// Notiz -> fertiger Auftrag: Kunde finden oder anlegen, Auftrag speichern, öffnen. Nur ohne erkennbaren Kunden: ausgefülltes Formular.
async function noteToOrder(note) {
  note = note.trim();
  if (!note) { location.hash = '#/new'; return; }
  show(h('div', { class: 'card' }, h('p', { class: 'muted', style: 'margin:0' }, '✨ ' + t('note_working'))));
  // Doppelt getippt? Dann den schon angelegten Auftrag öffnen
  const key = 'wf_note_' + [...note].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  try { const prev = localStorage.getItem(key); if (prev) { location.hash = `#/order/${prev}`; toast(t('note_exists')); return; } } catch (e) { /* kein Speicher */ }
  const toForm = (msg) => { if (msg) toast(msg); history.replaceState(null, '', '#/note-form?note=' + encodeURIComponent(note)); render(); };
  let NP;
  try { NP = (await api('note_parse', { body: { text: note } })).note; } catch (e) { return toForm(e.message); }
  const c = NP.customer || {};
  let cid = c.id, newCust = false;
  if (!cid && (c.name || c.company || c.phone)) {
    try {
      const r = await api('customer_save', { body: { name: c.name || c.company || c.phone, company: c.name ? c.company : '', phone: c.phone, email: c.email, currency: NP.currency || 'DKK' } });
      cid = r.id; newCust = true;
    } catch (e) { return toForm(e.message); }
  }
  if (!cid) return toForm(t('note_no_customer'));
  const body = { id: 0, customer_id: cid, worker_id: 1, title: NP.title || note.split('\n')[0].slice(0, 200), qty: NP.qty || 1, article: NP.article || '',
    price: NP.price || 0, currency: NP.currency || 'DKK', pay_status: 'open', deposit: 0, status: 'inquiry', due_date: NP.due_date || '', plan_date: '', start_time: '',
    description: NP.description || '', notes: note };
  // Passendes Produkt aus der Preisliste (Name kommt in der Notiz vor): liefert Verfahren/Zeiten und ggf. den Preis
  const q = Math.max(1, +NP.qty || 1);
  let prod = null;
  try { const low = note.toLowerCase(); prod = (await api('products')).products.filter((p) => +p.active && low.includes(p.name.toLowerCase())).sort((a, b) => b.name.length - a.name.length)[0] || null; } catch (e) { /* ohne Preisliste weiter */ }
  let procs = (NP.processes || []).map((p) => { const pt = me.processes.find((x) => +x.id === +p.process_id); return { process_id: +p.process_id, per_piece: +p.per_piece || (pt ? +pt.default_pp : 10) || 10 }; });
  if (!procs.length && prod) procs = prod.processes;
  const unit = NP.price ? Math.round(NP.price / q * 100) / 100 : (prod && (NP.currency || 'DKK') === 'DKK' ? +prod.price / 100 : 0);
  body.items = [{ product_id: prod ? prod.id : null, name: prod ? prod.name : (NP.article || body.title), qty: q, price: unit, processes: procs }];
  if (!NP.price && unit) body.price = Math.round(unit * q * 100) / 100;
  let r;
  try { r = await api('order_save', { body }); }
  catch (e) {
    // Termin passt nicht (z. B. vor Produktionsende oder gesperrt): ohne Termin speichern, die App plant selbst
    try { r = await api('order_save', { body: { ...body, due_date: '' } }); toast(t('note_due_dropped')); } catch (e2) { return toForm(e2.message); }
  }
  try { localStorage.setItem(key, String(r.order.id)); } catch (e) { /* egal */ }
  toast(t(newCust ? 'note_done_new' : 'note_done', r.order.nr, c.company || c.name || ''));
  location.hash = `#/order/${r.order.id}`;
}
route(/^\/new\/customer\/(\d+)$/, (cid) => orderForm(null, +cid));
route(/^\/order\/(\d+)\/edit$/, async (id) => orderForm((await api('order', { params: { id } })).order));

// Zeit einer Position: Minuten je Stück × Menge, einmalige Verfahren (Digitalisieren) nur einmal
const isOnce = (pid) => { const pt = me.processes.find((x) => +x.id === +pid); return !!(pt && +pt.per_order); };
const procMin = (procs, qty) => (procs || []).reduce((s_, p) => s_ + p.per_piece * (isOnce(p.process_id) ? 1 : qty), 0);
const procLabel = (procs) => (procs || []).map((p) => { const pt = me.processes.find((x) => +x.id === +p.process_id); return pt ? `${pname(pt)} ${p.per_piece} ${+pt.per_order ? t('min_once_short') : t('min_short')}` : ''; }).filter(Boolean).join(' · ');

// Verfahren antippen: an = Standardminuten des Verfahrens je Stück (änderbar)
function procPicker(initial, onChange) {
  const sel = new Map((initial || []).map((p) => [+p.process_id, +p.per_piece]));
  const wrap = h('div', { class: 'pchips' });
  const draw = () => wrap.replaceChildren(...me.processes.filter((p) => +p.active || sel.has(+p.id)).map((p) => {
    const on = sel.has(+p.id), mx = +p.per_order ? 600 : 60;
    const mi = h('input', { type: 'number', min: 1, max: mx, inputmode: 'numeric', value: sel.get(+p.id) || '', 'aria-label': t(+p.per_order ? 'min_once' : 'min_per_piece'),
      onclick: (e) => e.stopPropagation(), oninput: (e) => { sel.set(+p.id, Math.min(mx, Math.max(1, parseInt(e.target.value, 10) || 1))); onChange(); } });
    return h('div', { class: 'pchip' + (on ? ' on' : ''), style: `--c:${p.color}`, role: 'button', tabindex: 0,
      onclick: () => { if (on) sel.delete(+p.id); else sel.set(+p.id, +p.default_pp || 10); draw(); onChange(); } },
      h('span', {}, pname(p)), on ? h('span', { class: 'pmin' }, mi, +p.per_order ? t('min_once_short') : t('min_short')) : null);
  }));
  draw();
  wrap.get = () => [...sel].map(([process_id, per_piece]) => ({ process_id, per_piece }));
  return wrap;
}

// Notiz aus der Zwischenablage (z. B. vom WF-Launcher kopiert) oder eingefügt übernehmen
function noteCard() {
  const ta = h('textarea', { rows: 3, placeholder: t('note_paste_ph') });
  const box = h('div', { class: 'hidden', style: 'margin-top:8px' }, ta, h('div', { class: 'row end', style: 'margin-top:6px' }, h('button', { type: 'button', class: 'btn primary small', onclick: () => { if (ta.value.trim()) location.hash = '#/new?note=' + encodeURIComponent(ta.value.trim()); } }, t('note_apply'))));
  return h('div', { class: 'card' }, h('button', { type: 'button', class: 'btn', onclick: async () => {
    try { const txt = (await navigator.clipboard.readText()).trim(); if (txt) { location.hash = '#/new?note=' + encodeURIComponent(txt); return; } } catch (e) { /* kein Zugriff: zum Einfügen anbieten */ }
    box.classList.remove('hidden'); ta.focus();
  } }, '📋 ' + t('note_from_clip')), box);
}

async function orderForm(o, presetCustomer, note = '') {
  const isNew = !o;
  note = note.trim();
  // Notiz auswerten (Claude, wenn eingerichtet, sonst feste Regeln) und Felder vorbelegen
  let NP = null;
  if (isNew && note) { try { NP = (await api('note_parse', { body: { text: note } })).note; } catch (e) { toast(e.message); } }
  const D = o || { id: 0, customer_id: presetCustomer || 0, title: '', description: '', article: '', qty: 1, price: 0, deposit: 0, currency: 'DKK', pay_status: 'open', status: 'inquiry', due_date: '', plan_date: '', start_time: '', finish_date: '', worker_id: 1, notes: '', processes: [], files: [] };
  if (isNew && note) {
    D.title = (NP && NP.title) || note.split('\n')[0].slice(0, 200);
    D.notes = note;
    if (NP) {
      if (NP.qty) D.qty = NP.qty;
      if (NP.article) D.article = NP.article;
      if (NP.price) D.price = NP.price;
      if (NP.currency) D.currency = NP.currency;
      if (NP.due_date) D.due_date = NP.due_date;
      D.description = NP.description || '';
      D.processes = (NP.processes || []).map((p) => ({ process_id: p.process_id, per_piece: p.per_piece || 10 }));
      if (NP.customer && NP.customer.id) D.customer_id = NP.customer.id;
    }
  }
  // Positionen: neue Aufträge und alte Aufträge ohne Positionen bekommen eine Position aus Titel/Menge/Preis/Verfahren
  if (!Array.isArray(D.items)) D.items = [];
  const legacyItem = () => {
    const q = Math.max(1, +D.qty || 1);
    return { product_id: null, name: D.article || D.title, qty: q, price: Math.round((+D.price || 0) / q * 100) / 100,
      processes: (D.processes || []).map((p) => ({ process_id: +p.process_id, per_piece: Math.min(60, Math.max(1, p.per_piece ? +p.per_piece : Math.round(+p.minutes / q))) })) };
  };
  if (!D.items.length && (!isNew || note) && (D.title || D.processes.length)) D.items = [legacyItem()];
  let cust = null;
  if (D.customer_id) cust = (await api('customer', { params: { id: D.customer_id } })).customer;
  if (isNew && cust && !(NP && NP.currency)) D.currency = cust.currency;
  const F = {};
  const err = h('div', { class: 'err' });
  const field = (k, label, el) => { F[k] = el; return h('div', {}, h('label', {}, label), el); };
  const inp = (k, type = 'text', extra = {}) => h('input', { type, value: D[k] ?? '', ...extra });

  // --- Kunde: Suche mit Vorschlaegen oder neu anlegen
  const custBox = h('div', { class: 'suggest' });
  const custName = h('input', { type: 'text', placeholder: t('customer_ph'), autocomplete: 'off', value: cust ? cust.name + (cust.company ? ' · ' + cust.company : '') : '' });
  const sug = h('div', { class: 'suggest-list hidden' });
  let ct;
  const pickCust = (c) => { cust = c; D.customer_id = c.id; custName.value = c.name + (c.company ? ' · ' + c.company : ''); sug.classList.add('hidden'); if (isNew) F.currency.value = c.currency; };
  custName.addEventListener('input', () => {
    cust = null; D.customer_id = 0; clearTimeout(ct);
    ct = setTimeout(async () => {
      const q = custName.value.trim();
      const { customers } = await api('customers', { params: { q } });
      sug.replaceChildren(...customers.slice(0, 8).map((c) => h('button', { type: 'button', onclick: () => pickCust(c) }, c.name + (c.company ? ' · ' + c.company : ''))),
        q && h('button', { type: 'button', onclick: async () => {
          const phone = prompt(t('new_customer_phone')) || '';
          const r = await api('customer_save', { body: { name: q, phone, currency: F.currency.value } });
          pickCust({ id: r.id, name: q, company: '', currency: F.currency.value });
        } }, '+ ' + t('create_customer', q)));
      sug.classList.toggle('hidden', !sug.childNodes.length);
    }, 200);
  });
  custBox.append(custName, sug);
  // Kunde aus der Notiz noch nicht vorhanden: mit einem Tipp anlegen (Name, Firma, Telefon, E-Mail)
  const nc = NP && NP.customer;
  if (nc && !nc.id && (nc.name || nc.company)) {
    const label = [nc.company, nc.name].filter(Boolean).join(' · ');
    custName.value = label;
    const addBtn = h('button', { type: 'button', class: 'btn small primary', style: 'margin-top:6px', onclick: async () => {
      try {
        const r = await api('customer_save', { body: { name: nc.name || nc.company, company: nc.name ? nc.company : '', phone: nc.phone, email: nc.email, currency: F.currency.value } });
        pickCust({ id: r.id, name: nc.name || nc.company, company: nc.name ? nc.company : '', currency: F.currency.value }); addBtn.remove(); toast(t('saved'));
      } catch (e) { toast(e.message); }
    } }, '+ ' + t('create_customer', label) + (nc.phone ? ' · ' + nc.phone : ''));
    custBox.append(addBtn);
  }

  // --- Person (nur sichtbar, wenn es Mitarbeiter gibt)
  let wid = workerById(D.worker_id) && workerById(D.worker_id).active ? +D.worker_id : 1;
  const workerRow = h('div', { class: 'row' });
  const drawWorkers = () => workerRow.replaceChildren(...activeWorkers().map((w) => h('button', { type: 'button', class: 'wbtn' + (w.id === wid ? ' on' : ''), style: `--wc:${w.color}`, onclick: () => {
    if (wid === w.id) return;
    wid = w.id; drawWorkers(); S.start = ''; planPicker.value = ''; updateSummary(); refreshPlan(true);
  } }, h('i'), w.name)));

  // --- Positionen: Produkt aussuchen -> Menge, Preis und Zeiten der Verfahren kommen automatisch
  const S = { start: D.start_time || '' };                       // gewaehlte Uhrzeit ('' = automatisch frueheste)
  let rt;
  const procChanged = () => { S.start = ''; updateSummary(); clearTimeout(rt); rt = setTimeout(() => refreshPlan(!planPicker.value), 350); };
  const itemsBox = h('div', { class: 'items' });
  const items = [];
  const totalMin = () => items.reduce((s_, r) => s_ + r.min(), 0);
  const itemsSum = () => Math.round(items.reduce((s_, r) => s_ + r.sum(), 0) * 100) / 100;
  let titleTouched = !isNew || !!note, priceTouched = !isNew && Math.abs((+D.price || 0) - D.items.reduce((s_, i) => s_ + i.qty * i.price, 0)) > 0.005;
  const totLine = h('div', { class: 'itemtot' });
  function itemsChanged(init) {
    const sum = itemsSum();
    if (!titleTouched) F.title.value = items.map((r) => r.get().name).filter(Boolean).join(' + ').slice(0, 200);
    if (!priceTouched) F.price.value = sum ? sum.toFixed(2) : '';
    priceHint.replaceChildren(...(priceTouched && items.length && Math.abs(num(F.price.value) - sum) > 0.005
      ? [t('price_differs', money(sum, F.currency.value)), ' ', h('button', { type: 'button', class: 'btn small', onclick: () => { priceTouched = false; itemsChanged(); } }, '↺ ' + t('price_use_sum'))] : []));
    const q = items.reduce((s_, r) => s_ + r.get().qty, 0);
    totLine.replaceChildren(...(items.length ? [h('span', {}, `${q} ${t('pcs')}`), h('b', {}, money(sum, F.currency.value)), h('span', {}, '⏱ ' + hm(totalMin()))] : [h('span', { class: 'muted' }, t('items_empty'))]));
    if (init === true) updateSummary(); else procChanged();
  }
  function addItem(it, focus) {
    const r = {};
    const nameIn = h('input', { type: 'text', value: it.name || '', placeholder: t('item_name'), maxlength: 200, oninput: itemsChanged });
    const qtyIn = h('input', { type: 'number', min: 1, inputmode: 'numeric', value: it.qty || 1, oninput: itemsChanged });
    const priceIn = h('input', { type: 'text', inputmode: 'decimal', value: it.price ? String(it.price).replace('.', ',') : '', placeholder: '0,00', oninput: itemsChanged });
    const sumEl = h('span', { class: 'isum' });
    const timeEl = h('span', { class: 'itime muted' });
    const pick = procPicker(it.processes || [], itemsChanged);
    r.get = () => ({ product_id: it.product_id || null, name: nameIn.value.trim(), qty: Math.max(1, parseInt(qtyIn.value, 10) || 1), price: num(priceIn.value), processes: pick.get() });
    r.sum = () => { const g = r.get(); return g.qty * g.price; };
    r.min = () => { const g = r.get(); return procMin(g.processes, g.qty); };
    r.upd = () => {
      const g = r.get(), m = procMin(g.processes, g.qty);
      const pp = g.processes.filter((p) => !isOnce(p.process_id)).reduce((s_, p) => s_ + p.per_piece, 0), once = m - pp * g.qty;
      sumEl.textContent = money(r.sum(), F.currency.value);
      timeEl.textContent = m ? '⏱ ' + [pp ? `${pp} ${t('min_short')} × ${g.qty}` : '', once ? `${once} ${t('min_once_short')}` : ''].filter(Boolean).join(' + ') + ` = ${hm(m)}` : t('item_no_proc');
    };
    r.el = h('div', { class: 'item' },
      h('div', { class: 'itop' }, nameIn, h('button', { type: 'button', class: 'btn small danger', 'aria-label': t('delete'), onclick: () => { items.splice(items.indexOf(r), 1); r.el.remove(); itemsChanged(); } }, '✕')),
      h('div', { class: 'irow' }, h('div', {}, h('label', {}, t('qty')), qtyIn), h('div', {}, h('label', {}, t('unit_price')), priceIn), h('div', { class: 'isumbox' }, h('label', {}, t('line_total')), sumEl)),
      pick, timeEl);
    items.push(r); itemsBox.append(r.el);
    if (focus) { qtyIn.focus(); qtyIn.select(); }
    return r;
  }
  // Produktsuche: Liste beim Antippen, Filter beim Tippen, oder freie Position
  const prodList = (await api('products')).products.filter((p) => +p.active);
  const pq = h('input', { type: 'search', placeholder: prodList.length ? t('item_search') : t('item_search_none'), autocomplete: 'off' });
  const psug = h('div', { class: 'suggest-list hidden' });
  const toCur = async (dkkCents) => {
    const cur = F.currency.value;
    if (cur === 'DKK') return dkkCents / 100;
    try { const r = await api('rate', { params: { cur } }); return Math.round(dkkCents / +r.rate) / 100; } catch (e) { return cur === 'EUR' ? Math.round(dkkCents / 7.46038) / 100 : dkkCents / 100; }
  };
  const pickProd = async (p) => {
    psug.classList.add('hidden'); pq.value = '';
    addItem({ product_id: p.id, name: p.name, qty: items.length ? 1 : Math.max(1, +D.qty || 1), price: await toCur(+p.price), processes: p.processes }, true);
    itemsChanged();
  };
  const drawPsug = () => {
    const q = pq.value.trim().toLowerCase();
    const hits = prodList.filter((p) => !q || p.name.toLowerCase().includes(q)).slice(0, 12);
    psug.replaceChildren(...hits.map((p) => h('button', { type: 'button', onmousedown: (e) => e.preventDefault(), onclick: () => pickProd(p) },
      h('b', {}, p.name), h('span', { class: 'muted' }, ` · ${cents(p.price, 'DKK')}` + (p.processes.length ? ' · ' + procLabel(p.processes) : '')))),
      h('button', { type: 'button', onmousedown: (e) => e.preventDefault(), onclick: () => { const nm = pq.value.trim(); psug.classList.add('hidden'); pq.value = ''; addItem({ name: nm, qty: 1, price: 0, processes: [] }, !!nm); if (!nm) items[items.length - 1].el.querySelector('input').focus(); itemsChanged(); } }, '+ ' + (q ? t('item_free_named', pq.value.trim()) : t('item_free'))));
    psug.classList.remove('hidden');
  };
  pq.addEventListener('focus', drawPsug); pq.addEventListener('input', drawPsug);
  pq.addEventListener('blur', () => setTimeout(() => psug.classList.add('hidden'), 150));
  const addBox = h('div', { class: 'suggest additem' }, pq, psug);

  const sumBox = h('div', { class: 'sumbox' });
  function updateSummary() {
    items.forEach((r) => r.upd());
    const tm = totalMin();
    const dm = (workerById(wid) || { day_min: 480 }).day_min || 480;
    if (!tm) { sumBox.replaceChildren(h('span', { class: 'muted' }, t('sum_hint_items'))); return; }
    const pct = Math.round(tm / dm * 100);
    const days = Math.round(tm / dm * 10) / 10;
    sumBox.replaceChildren(
      h('div', { class: 'sumline' }, h('b', {}, hm(tm)), h('span', { class: 'muted' }, ` · ${pct} % ${t('of_a_day')}${tm > dm ? ` (≈ ${String(days).replace('.', ',')} ${t('work_days')})` : ''}`)),
      h('div', { class: 'meter' + (pct > 100 ? ' over' : '') }, h('i', { style: `width:${Math.min(100, pct)}%` })));
  }

  // --- Produktionstag: Vorschlaege oben, danach Tageswahl, Uhrzeit, Abgabetermin
  let finish = D.finish_date || '';
  let dueTouched = !isNew || !!D.due_date;
  let dueAuto = false;
  const planPicker = dayPicker(D.plan_date, async () => {
    const total = totalMin();
    if (!total) throw new Error(t('err_no_duration'));
    const r = await api('plan_options', { params: { worker_id: wid, total, limit: 200, exclude: D.id || 0 } });
    return { dates: r.options.map((x) => x.start_date) };
  });
  let dueMin = '';
  const duePicker = dayPicker(D.due_date, () => api('due_days', { params: { worker_id: wid, from: dueMin || (finish ? addDays(finish, 1) : today()), exclude: D.id || 0 } }));
  duePicker.addEventListener('daychange', () => { if (!dueAuto) dueTouched = true; });
  const optsBox = h('div', { class: 'row', style: 'margin-bottom:8px' });
  const previewBox = h('div', { class: 'plan-preview hidden' });
  const timeBtn = h('button', { type: 'button', class: 'slotbtn', onclick: async () => {
    const d = planPicker.value, total = totalMin();
    if (!d || !total) { toast(t('slot_need_day')); return; }
    try {
      const r = await api('plan_slots', { params: { worker_id: wid, total, date: d, exclude: D.id || 0 } });
      slotModal(t('pick_time'), d, r, S.start, (v) => { S.start = v; refreshPreview(); });
    } catch (e) { toast(e.message); }
  } });
  let seq = 0;
  async function refreshPlan(autoPick) {
    const my = ++seq, total = totalMin();
    if (!total) { optsBox.replaceChildren(h('span', { class: 'muted' }, t('plan_need_duration'))); previewBox.classList.add('hidden'); timeBtn.classList.add('hidden'); finish = ''; return; }
    let r;
    try { r = await api('plan_options', { params: { worker_id: wid, total, limit: 6, exclude: D.id || 0 } }); } catch (e) { optsBox.replaceChildren(h('span', { class: 'err' }, e.message)); return; }
    if (my !== seq) return;
    const op = r.options;
    optsBox.replaceChildren(...(op.length ? op.map((x) => h('button', { type: 'button', class: 'chip opt' + (planPicker.value === x.start_date ? ' on' : ''), 'data-d': x.start_date, onclick: () => { planPicker.value = x.start_date; } },
      h('b', {}, dfmt(x.start_date)), h('small', {}, `${x.start}${x.finish !== x.start_date ? ' → ' + dfmt(x.finish) : ''}`))) : [h('span', { class: 'err' }, t('plan_none'))]));
    if (!planPicker.value && autoPick && op.length) planPicker.value = op[0].start_date; // loest die Vorschau aus
    else await refreshPreview();
  }
  async function refreshPreview() {
    const d = planPicker.value, total = totalMin(), my = ++seq;
    optsBox.querySelectorAll('.opt').forEach((b) => b.classList.toggle('on', b.dataset.d === d));
    if (!d || !total) { previewBox.classList.add('hidden'); timeBtn.classList.add('hidden'); finish = ''; return; }
    let r;
    try { r = await api('plan_preview', { params: { worker_id: wid, total, date: d, start: S.start, exclude: D.id || 0 } }); } catch (e) { return; }
    if (my !== seq) return;
    if (!r.possible) {
      if (S.start) { S.start = ''; return refreshPreview(); }          // gewaehlte Uhrzeit passt nicht mehr -> automatisch
      planPicker.value = ''; finish = ''; previewBox.classList.add('hidden'); timeBtn.classList.add('hidden');
      toast(t('plan_moved')); return refreshPlan(true);
    }
    finish = r.finish; dueMin = r.due_min;
    previewBox.replaceChildren(...r.chunks.map((c) => h('div', {}, `${dfmt(c.date)} · ${c.start}–${c.end}`)), h('small', { class: 'muted' }, `${t('finish')}: ${dfmt(r.finish)} ${r.finish_time}${r.due_min ? ' · ' + t('due_earliest') + ': ' + dfmt(r.due_min) : ''}`), h('small', { class: 'muted' }, '🤝 ' + t('handover_note')));
    previewBox.classList.remove('hidden');
    timeBtn.textContent = `🕘 ${r.start}${S.start ? '' : ' (' + t('automatic') + ')'} · ${t('change')}`;
    timeBtn.classList.remove('hidden'); timeBtn.classList.toggle('set', !!S.start);
    // Abgabetermin mindestens einen Tag nach dem Produktionsende
    if (r.due_min && (!duePicker.value ? !dueTouched : duePicker.value < r.due_min)) {
      const moved = !!duePicker.value;
      dueAuto = true; duePicker.value = r.due_min; dueAuto = false;
      if (moved) toast(t('due_moved', dfmt(r.due_min)));
    }
  }
  planPicker.addEventListener('daychange', () => { S.start = ''; refreshPreview(); });

  // --- Fotos: Kamera oder Galerie, werden nach dem Speichern hochgeladen
  const pending = [];
  const thumbs = h('div', { class: 'files' });
  let urls = [];
  function drawThumbs() {
    urls.forEach((u) => URL.revokeObjectURL(u)); urls = [];
    thumbs.replaceChildren(...pending.map((f, i) => {
      const u = f.type.startsWith('image/') ? URL.createObjectURL(f) : null; if (u) urls.push(u);
      return h('div', { class: 'file' }, u ? h('img', { src: u, alt: f.name }) : h('div', { class: 'pdf' }, 'PDF'),
        h('div', { class: 'n' }, h('span', { style: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, f.name || t('photo')), h('a', { href: '#', title: t('delete'), onclick: (e) => { e.preventDefault(); pending.splice(i, 1); drawThumbs(); } }, '✕')));
    }));
  }

  // --- Preis, Zahlung, Details: direkt sichtbar
  const priceHint = h('div', { class: 'muted', style: 'font-size:.85rem' });
  const priceIn = inp('price', 'number', { step: '0.01', min: 0, inputmode: 'decimal' });
  priceIn.addEventListener('input', () => { priceTouched = true; itemsChanged(); });
  const curSel = h('select', { onchange: () => itemsChanged() }, me.currencies.map((c) => h('option', { value: c, selected: c === D.currency }, c)));
  const payRow = h('div', { class: 'grid c3' },
    field('price', t('price_total'), priceIn),
    field('currency', t('currency'), curSel),
    field('pay_status', t('payment'), h('select', {}, me.pay.map((p) => h('option', { value: p, selected: p === D.pay_status }, t('pay_' + p))))));

  const save = async (btn) => {
    err.textContent = '';
    if (!D.customer_id) { err.textContent = t('err_bad_customer'); return; }
    const its = items.map((r) => r.get()).filter((i) => i.name);
    if (!its.length) { err.textContent = t('err_no_items'); pq.focus(); return; }
    const body = { id: D.id, customer_id: D.customer_id, worker_id: wid, title: F.title.value || its.map((i) => i.name).join(' + ').slice(0, 200), qty: its.reduce((s_, i) => s_ + i.qty, 0),
      due_date: duePicker.value, plan_date: planPicker.value, start_time: S.start, items: its };
    for (const k of ['article', 'price', 'currency', 'pay_status', 'deposit', 'description', 'notes', 'status']) body[k] = F[k] ? F[k].value : (D[k] ?? '');
    if (body.pay_status === 'paid' && !body.deposit) body.deposit = body.price;
    btn.disabled = true;
    try {
      const r = await api('order_save', { body });
      if (pending.length) { toast(t('uploading_files')); await uploadFiles(r.order.id, pending); }
      toast(r.due_adjusted ? t('due_jumped', dfmt(r.due_adjusted.from), dfmt(r.due_adjusted.to)) : t('saved'));
      location.hash = `#/order/${r.order.id}`;
    } catch (e) { err.textContent = e.message; btn.scrollIntoView({ block: 'center' }); } finally { btn.disabled = false; }
  };
  const btn = h('button', { class: 'btn primary', onclick: (e) => save(e.currentTarget) }, t('save'));
  const sec = (title, ...kids) => h('div', { class: 'card grid' }, h('h3', { class: 'sechead' }, title), ...kids);
  show(
    h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow' }, isNew ? t('new_order') : D.nr), h('h1', {}, isNew ? t('capture_a') : t('edit'), ' ', isNew && h('em', {}, t('capture_b'))))),
    isNew && note ? h('div', { class: 'card aibox' }, '✨ ' + t(NP && NP.source === 'ai' ? 'note_used_ai' : 'note_used'),
      h('details', { style: 'margin-top:6px' }, h('summary', { class: 'muted' }, t('note_original')), h('pre', { class: 'notepre' }, note))) : null,
    isNew && !note ? noteCard() : null,
    sec(t('form_order'),
      h('div', {}, h('label', {}, t('customer')), custBox),
      h('div', {}, h('label', {}, t('items_label')), itemsBox, addBox, totLine),
      field('title', t('title'), inp('title', 'text', { placeholder: t('title_ph'), maxlength: 200, oninput: () => { titleTouched = true; } }))),
    sec(t('form_time'), sumBox,
      activeWorkers().length > 1 ? h('div', {}, h('label', {}, t('worker')), workerRow) : null),
    sec(t('form_when'),
      h('div', {}, h('label', {}, t('suggested_days')), optsBox),
      h('div', {}, h('label', {}, t('plan_date')), planPicker),
      previewBox, timeBtn,
      h('div', {}, h('label', {}, t('due')), duePicker)),
    sec(t('files'), photoButtons((list) => { pending.push(...list); drawThumbs(); }), thumbs,
      isNew ? null : h('div', { class: 'files' }, (D.files || []).map((f) => h('div', { class: 'file' }, f.mime.startsWith('image/') ? h('img', { src: thumbUrl(f.id), alt: f.original_name, loading: 'lazy' }) : h('div', { class: 'pdf' }, 'PDF'), h('div', { class: 'n' }, h('span', { style: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, f.original_name)))))),
    sec(t('form_price'), payRow, priceHint, field('deposit', t('deposit'), inp('deposit', 'number', { step: '0.01', min: 0, inputmode: 'decimal' }))),
    // Details: Status und Notizen; Artikel/Beschreibung nur noch bei alten Aufträgen, die sie schon haben
    sec(t('form_details'),
      field('status', t('status'), h('select', {}, me.statuses.map((s_) => h('option', { value: s_, selected: s_ === D.status }, t('st_' + s_))))),
      !isNew && D.article ? field('article', t('article'), inp('article')) : null,
      !isNew && D.description ? field('description', t('description'), h('textarea', {}, D.description)) : null,
      field('notes', t('notes'), h('textarea', {}, D.notes))),
    err,
    h('div', { class: 'formbar' }, h('a', { class: 'btn', href: isNew ? '#/' : `#/order/${D.id}` }, t('cancel')), btn));
  D.items.forEach((it) => addItem(it));
  itemsChanged(true);
  drawWorkers(); updateSummary(); refreshPlan(isNew);
}

// ---------- Kunden ----------

// ---------- Produkte / Preisliste ----------
let prodQ = '', eurCache = null;
function hourCard() {
  const inp = h('input', { type: 'text', inputmode: 'decimal', value: +me.company.hour_rate ? centsIn(me.company.hour_rate) : '', placeholder: '450,00', style: 'max-width:140px' });
  return h('div', { class: 'card' }, h('h3', {}, '⏱ ' + t('hr_title')), h('p', { class: 'muted', style: 'margin:0 0 8px' }, t('hr_text')),
    h('div', { class: 'row', style: 'flex-wrap:wrap;gap:8px;align-items:center' }, inp, h('span', { class: 'muted' }, t('hr_unit')),
      h('button', { class: 'btn small primary', onclick: async () => { try { await api('company_save', { body: { ...me.company, hour_rate: inp.value || '0' } }); await reloadMe(); toast(t('saved')); } catch (e) { toast(e.message); } } }, t('save'))));
}
const num = (v) => { let x = String(v || '').replace(/\s|kr\.?|€|dkk|eur/gi, ''); if (x.includes(',')) x = x.replace(/\./g, '').replace(',', '.'); return parseFloat(x) || 0; };
// EUR-Kurs (DKK je 1 €): Nationalbank/EZB, sonst fester Leitkurs der Krone (ERM II)
async function eurRate() {
  if (eurCache) return eurCache;
  try { const r = await api('rate', { params: { cur: 'EUR' } }); eurCache = { rate: +r.rate, date: r.date }; } catch (e) { eurCache = { rate: 7.46038, date: '' }; }
  return eurCache;
}
route(/^\/products$/, async () => {
  const { products } = await api('products');
  const list = h('div', { class: 'orders' });
  const editRow = (p) => {
    const nm = h('input', { value: p.name || '', placeholder: t('prod_name_ph'), maxlength: 300 });
    const un = h('select', {}, me.units.map((u) => h('option', { value: u, selected: u === (p.unit || 'stk') }, t('u_' + u))));
    // Preis wahlweise in kr oder € eingeben; Umschalten rechnet den Betrag um, gespeichert wird immer in kr
    const pr = h('input', { type: 'text', inputmode: 'decimal', value: p.price != null ? centsIn(p.price) : '', placeholder: '0,00' });
    let prCur = 'DKK', back = null;
    const prLabel = h('label', {}, t('unit_price') + ' DKK');
    const fxNote = h('small', { class: 'muted hint' });
    const fmt2 = (v) => (Math.round(v * 100) / 100).toFixed(2).replace('.', ',');
    const curBtns = ['DKK', 'EUR'].map((c) => h('button', { type: 'button', class: 'curbtn' + (c === 'DKK' ? ' on' : ''), onclick: async () => {
      if (c === prCur) return;
      const r = await eurRate(), v = num(pr.value);
      // unverändert hin und zurück: ursprünglichen Betrag wiederherstellen (keine Rundungsdrift)
      if (back && back.shown === pr.value && back.cur === c) pr.value = back.value;
      else if (v) { const before = pr.value; pr.value = fmt2(c === 'EUR' ? v / r.rate : v * r.rate); back = { cur: prCur, value: before, shown: pr.value }; }
      prCur = c;
      curBtns.forEach((b) => b.classList.toggle('on', b.textContent === (c === 'EUR' ? '€' : 'kr')));
      prLabel.textContent = t('unit_price') + (c === 'EUR' ? ' €' : ' DKK');
      fxNote.textContent = c === 'EUR' ? t('fx_note', String(r.rate.toFixed(4)).replace('.', ','), r.date ? dfmt(r.date) : t('fx_fixed')) + ' · ' + t('fx_saved_dkk') : '';
    } }, c === 'EUR' ? '€' : 'kr'));
    const curSwitch = h('div', { class: 'curswitch' }, ...curBtns);
    // Betrag in Øre (kr) ins Feld setzen, passend zur gewählten Währung
    const setPrice = async (dkkCents) => { if (prCur === 'EUR') { const r = await eurRate(); pr.value = fmt2(dkkCents / 100 / r.rate); } else pr.value = centsIn(dkkCents); };
    const priceDkk = async () => { if (prCur !== 'EUR') return pr.value || '0'; const r = await eurRate(); return fmt2(num(pr.value) * r.rate); };
    const kd = h('select', {}, ['goods', 'services'].map((k) => h('option', { value: k, selected: k === (p.kind || 'goods') }, t(k))));
    const act = h('input', { type: 'checkbox', checked: p.id ? !!+p.active : true, style: 'width:22px;height:22px;min-height:0' });
    const ppTime = h('small', { class: 'muted' });
    const drawPpTime = () => {
      const g = ppick.get(), m = g.filter((x) => !isOnce(x.process_id)).reduce((s_, x) => s_ + x.per_piece, 0), o = g.filter((x) => isOnce(x.process_id)).reduce((s_, x) => s_ + x.per_piece, 0);
      ppTime.textContent = m || o ? [m ? t('prod_time', m) : '', o ? t('prod_time_once', o) : ''].filter(Boolean).join(' · ') : t('prod_time_none');
    };
    const ppick = procPicker(p.processes || [], () => drawPpTime());
    drawPpTime();
    // Preisvorschlag aus Marktpreisen, sobald ein Name getippt ist
    const sug = h('div', { class: 'pricesug hidden' });
    let sugT = 0;
    const askSug = () => { clearTimeout(sugT); sugT = setTimeout(async () => {
      const q = nm.value.trim();
      if (q.length < 3) { sug.classList.add('hidden'); return; }
      const { suggest: g } = await api('price_suggest', { params: { name: q } });
      if (!g) { sug.replaceChildren(h('span', { class: 'muted' }, t('ps_none'))); sug.classList.remove('hidden'); return; }
      const take = (v) => h('button', { type: 'button', class: 'btn small', onclick: () => setPrice(v) }, cents(v, 'DKK'));
      const line = (flag, lbl, txt, est, src) => h('div', { class: 'psline' }, h('span', { class: 'psflag' }, flag), h('div', {}, h('div', {}, h('b', {}, lbl), ' ', txt), h('small', { class: 'muted' }, (est ? t('ps_est') : t('ps_src')) + ' ' + src.replace(/^geschätzt:?\s*/, ''))));
      sug.replaceChildren(
        line('🇩🇰', t('ps_dk'), t('ps_range', cents(g.dk.low, 'DKK'), cents(g.dk.high, 'DKK'), cents(g.dk.typ, 'DKK')), g.dk.estimated, g.dk.source),
        line('🇩🇪', t('ps_de'), t('ps_range_eur', (g.de.low / 100).toFixed(2).replace('.', ',') + ' €', (g.de.high / 100).toFixed(2).replace('.', ',') + ' €', (g.de.typ / 100).toFixed(2).replace('.', ',') + ' €', cents(g.de.typ_dkk, 'DKK')), g.de.estimated, g.de.source),
        h('div', { class: 'psmix' }, '⚖️ ', h('b', {}, t('ps_mix')), ' ', t('ps_mix_txt', cents(g.mix.incl, 'DKK'), cents(g.mix.net, 'DKK'))),
        h('div', { class: 'row', style: 'flex-wrap:wrap;margin-top:6px;gap:6px' }, h('span', { class: 'muted', style: 'font-size:.85rem' }, t('ps_take')),
          take(g.mix.incl), me.company.moms_registered ? h('span', { class: 'muted', style: 'font-size:.85rem' }, t('ps_or_net')) : null, me.company.moms_registered ? take(g.mix.net) : null));
      sug.classList.remove('hidden');
    }, 350); };
    nm.addEventListener('input', askSug);
    // Kalkulation: Material + Arbeitszeit × Stundensatz (netto)
    const mat = h('input', { type: 'text', inputmode: 'decimal', placeholder: '0,00' });
    const mins = h('input', { type: 'text', inputmode: 'numeric', placeholder: t('calc_min_ph') });
    const calcOut = h('div', { class: 'muted', style: 'font-size:.9rem;margin-top:6px' });
    const doCalc = () => {
      const rate = +me.company.hour_rate || 0;
      const mv = mins.value.trim() ? num(mins.value) : ppick.get().filter((x) => !isOnce(x.process_id)).reduce((s_, x) => s_ + x.per_piece, 0);
      const net = Math.round(num(mat.value) * 100 + mv / 60 * rate);
      if (!net) { calcOut.replaceChildren(rate ? '' : t('calc_no_rate')); return; }
      const incl = Math.round(net * 1.25);
      calcOut.replaceChildren(t('calc_res', cents(net, 'DKK'), cents(incl, 'DKK')), ' ',
        h('button', { type: 'button', class: 'btn small', onclick: () => setPrice(me.company.moms_registered ? net : incl) }, t('calc_take')));
    };
    mat.addEventListener('input', doCalc); mins.addEventListener('input', doCalc);
    const calcBox = h('details', { class: 'calcbox' }, h('summary', {}, '🧮 ' + t('calc_h')),
      h('div', { class: 'grid c2', style: 'margin-top:8px' }, h('div', {}, h('label', {}, t('calc_mat')), mat), h('div', {}, h('label', {}, t('calc_min')), mins)), calcOut);
    if (!p.id) setTimeout(askSug, 0);
    return h('div', { class: 'card prodcard' + (p.id && !+p.active ? ' inactive' : '') },
      h('div', {}, h('label', {}, t('prod_name')), nm), sug,
      h('div', { class: 'grid c3' }, h('div', {}, h('label', {}, t('unit')), un), h('div', {}, h('div', { class: 'prhead' }, prLabel, curSwitch), pr), h('div', {}, h('label', {}, t('prod_kind')), kd)), fxNote,
      h('div', { style: 'margin-top:8px' }, h('label', {}, t('prod_procs')), ppick, ppTime),
      calcBox,
      h('div', { class: 'row', style: 'justify-content:space-between;margin-top:8px' },
        h('label', { class: 'row', style: 'margin:0;gap:8px;text-transform:none;letter-spacing:0;font-size:.9rem;color:var(--text)' }, act, t('active')),
        h('div', { class: 'row' },
          p.id ? h('button', { class: 'btn small danger', onclick: async () => { if (confirm(t('prod_delete_confirm', p.name))) { await api('product_delete', { body: { id: p.id } }); render(); } } }, t('delete')) : null,
          h('button', { class: 'btn small primary', onclick: async () => { try { await api('product_save', { body: { id: p.id || 0, name: nm.value, unit: un.value, price: await priceDkk(), kind: kd.value, active: act.checked ? 1 : 0, processes: ppick.get() } }); toast(t('saved')); render(); } catch (e) { toast(e.message); } } }, p.id ? t('save') : '+ ' + t('prod_add')))));
  };
  const draw = () => list.replaceChildren(...products.filter((p) => !prodQ || p.name.toLowerCase().includes(prodQ.toLowerCase())).map(editRow));
  const newBox = h('div', { class: 'hidden' }, editRow({}));
  show(
    h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow' }, t('tab_products')), h('h1', {}, t('prod_h1_a'), ' ', h('em', {}, t('prod_h1_b')))),
      h('button', { class: 'btn primary', onclick: () => { newBox.classList.toggle('hidden'); newBox.querySelector('input').focus(); } }, '+ ' + t('prod_add'))),
    h('p', { class: 'muted', style: 'margin:0 0 12px' }, t('products_text')),
    hourCard(),
    newBox,
    h('div', { class: 'filters' }, h('input', { type: 'search', placeholder: t('prod_search'), value: prodQ, oninput: (e) => { prodQ = e.target.value; draw(); } })),
    products.length ? list : h('div', { class: 'empty' }, t('prod_none')));
  draw();
});

route(/^\/customers$/, async () => {
  const list = h('div', { class: 'orders' });
  const load = async (q = '') => {
    const { customers } = await api('customers', { params: { q } });
    list.replaceChildren(...(customers.length ? customers.map((c) => h('a', { class: 'card order', href: `#/customer/${c.id}`, style: '--sc:var(--p2)' },
      h('div', { class: 'o-title' }, c.name), h('div', { class: 'o-cust' }, [c.company, c.phone, c.email].filter(Boolean).join(' · ')),
      h('div', { class: 'o-meta' }, `${c.order_count} ${t('nav_orders')} · ${c.currency}`))) : [h('div', { class: 'empty' }, t('no_customers'))]));
  };
  let tm;
  show(
    h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow' }, t('nav_customers')), h('h1', {}, t('customers_h1_a'), ' ', h('em', {}, t('customers_h1_b')))), h('a', { class: 'btn primary', href: '#/customer/new' }, '+ ' + t('new_customer'))),
    h('div', { class: 'filters' }, h('input', { type: 'search', placeholder: t('search_ph'), oninput: (e) => { clearTimeout(tm); tm = setTimeout(() => load(e.target.value), 250); } })), list);
  await load();
});

route(/^\/customer\/(new|\d+)$/, async (id) => {
  const isNew = id === 'new';
  const c = isNew ? { id: 0, name: '', company: '', email: '', phone: '', address: '', currency: 'DKK', notes: '', country: 'DK', vat_id: '', is_business: 0, doc_lang: '', orders: [], invoices: [] } : (await api('customer', { params: { id } })).customer;
  const F = {};
  const err = h('div', { class: 'err' });
  const f = (k, label, el) => { F[k] = el; return h('div', {}, h('label', {}, label), el); };
  const mk = (k, type = 'text') => h('input', { type, value: c[k] });
  let biz = +c.is_business;
  const bizRow = h('div', { class: 'row' });
  const nfu = h('input', { type: 'checkbox', checked: !!+c.no_followup, style: 'width:22px;height:22px;min-height:0' });
  const vatWrap = h('div');
  const drawBiz = () => {
    bizRow.replaceChildren(...[[0, t('private')], [1, t('business')]].map(([v, l]) => h('button', { type: 'button', class: 'chip' + (biz === v ? ' on' : ''), onclick: () => { biz = v; drawBiz(); } }, l)));
    vatWrap.classList.toggle('hidden', !biz);
  };
  const vatState = h('div', { class: 'muted', style: 'font-size:.85rem;margin-top:4px' },
    c.vat_id ? (c.vat_valid === null || c.vat_valid === undefined ? t('vat_unchecked') : +c.vat_valid ? t('vat_ok', c.vat_checked_name ? ': ' + c.vat_checked_name : '') : t('vat_bad')) + (c.vat_checked_at ? ' · ' + t('checked_at', c.vat_checked_at.slice(0, 10)) : '') : '');
  show(
    h('a', { href: '#/customers', class: 'muted' }, '← ' + t('nav_customers')),
    h('div', { class: 'page-head', style: 'margin-top:8px' }, h('h1', {}, isNew ? t('new_customer') : c.name),
      !isNew && h('div', { class: 'row' }, h('a', { class: 'btn primary', href: `#/new/customer/${c.id}` }, '+ ' + t('new_order')), h('a', { class: 'btn', href: `#/invoice/new/customer/${c.id}` }, '+ ' + t('invoice')))),
    h('div', { class: 'card grid' },
      h('div', {}, h('label', {}, t('cust_type')), bizRow),
      h('div', { class: 'grid c2' }, f('name', t('name'), mk('name')), f('company', t('company'), mk('company'))),
      h('div', { class: 'grid c2' }, f('phone', t('phone'), mk('phone', 'tel')), f('email', t('email'), mk('email', 'email'))),
      f('address', t('address'), mk('address')),
      h('div', { class: 'grid c3' }, f('country', t('country'), h('select', {}, countryOpts(c.country || 'DK'))),
        f('currency', t('currency'), h('select', {}, me.currencies.map((x) => h('option', { value: x, selected: x === c.currency }, x)))),
        f('doc_lang', t('doc_lang'), h('select', {}, h('option', { value: '' }, t('lang_auto')), ['da', 'de', 'en'].map((l) => h('option', { value: l, selected: c.doc_lang === l }, t('lang_' + l)))))),
      h('div', {}, vatWrap),
      f('notes', t('notes'), h('textarea', {}, c.notes)),
      h('label', { class: 'row', style: 'gap:8px;text-transform:none;letter-spacing:0;font-size:.92rem;color:var(--text)' }, nfu, t('cust_no_followup')), err,
      h('div', { class: 'row end' }, h('button', { class: 'btn primary', onclick: async () => {
        err.textContent = '';
        try { const r = await api('customer_save', { body: { id: c.id, is_business: biz, no_followup: nfu.checked ? 1 : 0, ...Object.fromEntries(Object.entries(F).map(([k, el]) => [k, el.value])) } }); toast(t('saved')); location.hash = `#/customer/${r.id}`; render(); } catch (e) { err.textContent = e.message; }
      } }, t('save')))),
    !isNew && c.invoices && c.invoices.length ? h('div', { class: 'card' }, h('h3', {}, t('nav_invoices')), h('div', { class: 'tscroll' }, h('table', { class: 't' }, c.invoices.map((i) => h('tr', {},
      h('td', {}, h('a', { href: `#/invoice/${i.id}` }, invLabel(i))), h('td', {}, dfmt(i.issue_date)), h('td', { class: 'n' }, (i.type === 'credit' ? '− ' : '') + cents(i.total, i.currency))))))) : null,
    !isNew && h('div', { class: 'card' }, h('h3', {}, t('history')), c.orders.length ? h('div', { class: 'tscroll' }, h('table', { class: 't' }, c.orders.map((o) => h('tr', {}, h('td', {}, h('a', { href: `#/order/${o.id}` }, o.nr)), h('td', {}, o.title), h('td', {}, dfmt(o.due_date)), h('td', {}, statusPill(o.status)), h('td', {}, payPill(o.pay_status)), h('td', {}, money(o.price, o.currency)))))) : h('p', { class: 'muted' }, t('no_orders'))),
    !isNew && h('div', { class: 'card' }, h('h3', {}, t('privacy')), h('p', { class: 'muted' }, t('privacy_text')),
      h('div', { class: 'row' }, h('a', { class: 'btn small', href: `${BASE}api.php?a=customer_export&id=${c.id}` }, t('export_data')),
        h('button', { class: 'btn small danger', onclick: async () => { if (confirm(t('confirm_anonymize'))) { await api('customer_anonymize', { body: { id: c.id } }); location.hash = '#/customers'; } } }, t('anonymize')),
        h('button', { class: 'btn small danger', onclick: async () => {
          // 1. Bestätigung mit Folgen, 2. Bestätigung durch Eintippen des Wortes
          const msg = c.final_invoices ? t('cdel_keep', c.name, c.final_invoices) : t('cdel_all', c.name, c.orders.length);
          if (!confirm(msg)) return;
          const word = t('cdel_word');
          const typed = prompt(t('cdel_type', word));
          if (typed === null) return;
          if (typed.trim().toUpperCase() !== word.toUpperCase()) { toast(t('cdel_wrong')); return; }
          try { const r = await api('customer_delete', { body: { id: c.id, confirm: 'DELETE' } }); toast(r.mode === 'anonymized' ? t('cdel_done_anon') : t('cdel_done', r.orders)); location.hash = '#/customers'; } catch (e) { toast(e.message); }
        } }, '🗑 ' + t('cdel_btn')))));
  vatWrap.append(f('vat_id', t('vat_id'), h('input', { type: 'text', value: c.vat_id, placeholder: t('vat_id_ph'), autocapitalize: 'characters' })), vatState,
    h('button', { type: 'button', class: 'btn small', style: 'margin:6px 8px 0 0', onclick: async () => {
      try {
        const r = await api('company_lookup', { params: { country: F.country.value, number: F.vat_id.value } });
        F.company.value = r.name || F.company.value;
        const addr = r.address || [r.street, [r.zip, r.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
        if (addr) F.address.value = addr;
        toast(t('lookup_ok', r.source));
      } catch (e) { toast(e.message); }
    } }, '🔎 ' + t('lookup')),
    !isNew && c.vat_id && F.country.value !== 'DK' && me.eu.includes(c.country) ? h('button', { type: 'button', class: 'btn small', style: 'margin-top:6px', onclick: async () => {
      try { const r = await api('customer_vat_check', { body: { id: c.id } }); vatState.textContent = r.valid ? t('vat_ok', r.name ? ': ' + r.name : '') : t('vat_bad'); } catch (e) { toast(e.message); }
    } }, t('vat_check')) : null);
  drawBiz();
});

// ---------- Kalender ----------
let calStart = null;
let calView = null;
try { calView = localStorage.getItem('wf_calview'); } catch (e) { /* Speicher gesperrt */ }
// Ein Balken = ein eingeplanter Block: Uhrzeit, Verfahren, Auftrag, Kunde, Person und ein kleines Foto (wenn vorhanden)
function calBar(i, big) {
  const w = workerById(i.worker_id);
  const ho = i.kind === 'handover';
  const more = !ho && i.finish_date && i.finish_date > i.date ? ' →' : '';
  return h('a', { class: 'cbar' + (big ? ' big' : '') + (ho ? ' ho' : ''), href: `#/order/${i.id}`, style: `--wc:${w ? w.color : 'var(--p2)'}`, title: `${i.nr} · ${i.title} · ${i.customer_name}`, onclick: (e) => e.stopPropagation() },
    h('span', { class: 'tx' },
      h('span', { class: 'l1' }, ho ? '🤝 ' : '', h('b', {}, `${i.start_time}–${i.end}`), more, ho ? ' ' + t('handover') : (big ? ' ' + i.title : '')),
      h('span', { class: 'l2' }, ho ? (big ? `${i.title} · ${i.customer_name}` : i.customer_name) : (big ? `${i.customer_name} · ${procNames(i.process_ids, 3)}` : `${procNames(i.process_ids, 2)} · ${i.customer_name}`)),
      big && activeWorkers().length > 1 ? h('span', { class: 'l3' }, wchip(w)) : null),
    i.thumb ? h('img', { src: thumbUrl(i.thumb), alt: '', loading: 'lazy' }) : null);
}
route(/^\/calendar$/, async () => {
  calStart = calStart || mondayOf(today());
  const view_ = calView || (window.innerWidth < 700 ? 'agenda' : 'month');
  const to = addDays(calStart, 27);
  const { days, items, workers } = await api('calendar', { params: { from: calStart, to } });
  const byDay = {};
  items.forEach((i) => (byDay[i.date] ||= []).push(i));
  const dows = [...Array(7)].map((_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(lang === 'da' ? 'da-DK' : 'de-DE', { weekday: 'short' }));
  const loadBars = (d) => workers.filter((w) => d.w[w.id] && d.w[w.id].cap > 0).map((w) => {
    const x = d.w[w.id];
    const pct = x.booked ? Math.min(100, Math.round(x.booked / x.cap * 100)) : 0;
    return h('div', { class: 'bar' + (x.free === 0 ? ' full' : ''), style: `--c:${w.color};--w:${pct}%` }, h('i'));
  });
  const dayCls = (d) => (d.weekend ? ' we' : '') + (d.blocked !== null ? ' blocked' : '') + (d.date === today() ? ' today' : '') + (d.date < today() ? ' past' : '');
  let body;
  if (view_ === 'month') {
    const cells = days.map((d) => {
      const list = byDay[d.date] || [];
      const MAXB = 4;
      return h('div', { class: 'day' + dayCls(d), onclick: () => dayModal(d, list, workers) },
        h('div', { class: 'dn' }, +d.date.slice(8)),
        d.blocked !== null ? h('div', { class: 'blk' }, '🚫 ' + (d.blocked || t('blocked_day')))
          : [d.partial && h('div', { class: 'blk part' }, '⏱ ' + d.partial.times.map((x) => x.replace('-', '–')).join(', ')), h('div', { class: 'bars' }, loadBars(d))],
        list.slice(0, MAXB).map((i) => calBar(i, false)),
        list.length > MAXB ? h('div', { class: 'more' }, `+ ${list.length - MAXB}`) : null);
    });
    body = h('div', { class: 'cal' }, dows.map((d) => h('div', { class: 'dow' }, d)), cells);
  } else {
    const shown = days.filter((d) => (byDay[d.date] || []).length || d.blocked !== null || d.partial || d.date === today());
    body = h('div', { class: 'agenda' }, shown.length ? shown.map((d) => h('section', { class: 'aday' + dayCls(d) },
      h('div', { class: 'ahead', onclick: () => dayModal(d, byDay[d.date] || [], workers) },
        h('b', {}, dfmt(d.date)),
        h('span', { class: 'muted' }, d.blocked !== null ? '🚫 ' + (d.blocked || t('blocked_day')) : workers.map((w) => `${workers.length > 1 ? w.name + ' ' : ''}${t('free_short')} ${hm(d.w[w.id].free)}`).join(' · '))),
      d.partial ? h('div', { class: 'blk part', style: 'margin:0 0 4px' }, '⏱ ' + d.partial.times.map((x) => x.replace('-', '–')).join(', ') + (d.partial.reason ? ' · ' + d.partial.reason : '')) : null,
      (byDay[d.date] || []).map((i) => calBar(i, true)),
      !(byDay[d.date] || []).length && d.blocked === null ? h('div', { class: 'muted', style: 'font-size:.85rem' }, t('no_orders')) : null)) : h('div', { class: 'empty' }, t('no_orders')));
  }
  const tog = (v, label) => h('button', { class: 'btn small' + (view_ === v ? ' primary' : ''), onclick: () => { calView = v; try { localStorage.setItem('wf_calview', v); } catch (e) { /* egal */ } render(); } }, label);
  show(
    h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow' }, t('capacity')), h('h1', {}, t('cal_h1_a'), ' ', h('em', {}, t('cal_h1_b')))),
      h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => { calStart = addDays(calStart, -28); render(); } }, '←'), h('button', { class: 'btn small', onclick: () => { calStart = mondayOf(today()); render(); } }, t('today')), h('button', { class: 'btn small', onclick: () => { calStart = addDays(calStart, 28); render(); } }, '→'))),
    h('div', { class: 'row', style: 'margin-bottom:8px' }, tog('agenda', '☰ ' + t('view_list')), tog('month', '▦ ' + t('view_month'))),
    h('div', { class: 'legend' }, workers.map((w) => wchip(w)), h('span', {}, t('cal_hint'))),
    body);
});
function dayModal(d, items, workers) {
  const close = () => m.remove();
  const m = h('div', { class: 'modal', onclick: (e) => e.target === m && close() },
    h('div', { class: 'sheet' }, h('div', { class: 'row' }, h('h2', {}, dfmt(d.date)), h('span', { class: 'spacer' }), h('button', { class: 'btn small', onclick: close }, '✕')),
      d.blocked !== null && h('p', { class: 'err', style: 'margin:10px 0 0' }, '🚫 ' + t('blocked_day') + (d.blocked ? ': ' + d.blocked : '')),
      d.partial && h('p', { style: 'margin:10px 0 0;color:var(--warn)' }, `⏱ ${t('blocked_part')} ${d.partial.times.map((x) => x.replace('-', '–')).join(', ')}${d.partial.reason ? ' · ' + d.partial.reason : ''}`),
      h('h3', { style: 'margin:14px 0 6px' }, t('free_capacity')),
      workers.map((w) => { const x = d.w[w.id]; return h('div', { class: 'free', style: 'flex-wrap:wrap' }, wchip(w), h('span', {}, x.cap ? `${hm(x.free)} / ${hm(x.cap)}` : '—'),
        x.iv && x.iv.length ? h('small', { class: 'muted', style: 'flex:1 0 100%' }, t('slot_free') + ' ' + x.iv.map((a) => a.join('–')).join(', ')) : null); }),
      h('h3', { style: 'margin:14px 0 6px' }, t('nav_orders')),
      items.length ? items.map((i) => { const bar = calBar(i, true); bar.addEventListener('click', close); return bar; }) : h('p', { class: 'muted' }, t('no_orders'))));
  document.body.append(m);
}

// ---------- Rechnungen ----------
const cents = (c, cur) => money((+c || 0) / 100, cur);
const centsIn = (c) => ((+c || 0) / 100).toFixed(2).replace('.', ',');
const ICOL = { draft: 'var(--muted)', open: 'var(--info)', overdue: 'var(--bad)', paid: 'var(--ok)', credit: 'var(--p3)', refund: 'var(--warn)' };
const invState = (s) => pill(t('ist_' + s), ICOL[s]);
const invLabel = (i) => (i.type === 'credit' ? t('credit_note') : t('invoice')) + ' ' + (i.status === 'final' ? i.number : '· ' + t('draft'));
const countryOpts = (sel) => Object.entries(me.countries).map(([c, n]) => h('option', { value: c, selected: c === sel }, n[lang === 'da' ? 1 : 0]));
const docUrl = (id) => `${BASE}doc.php?id=${id}`;
function companyWarn() {
  if (!me.company_missing || !me.company_missing.length) return null;
  return h('div', { class: 'card warnbox' }, h('b', {}, '⚠ ' + t('company_missing_t')),
    h('p', { style: 'margin:6px 0 10px' }, t('company_missing_x', me.company_missing.map((k) => t('co_' + (k === 'bank' ? 'iban' : k))).join(', '))),
    h('a', { class: 'btn small', href: '#/settings' }, t('to_settings')));
}

const ifilt = { q: '', state: '', year: '' };
route(/^\/invoices$/, async () => {
  const list = h('div', { class: 'orders' });
  const tiles = h('div', { class: 'tiles' });
  const load = async () => {
    const params = { q: ifilt.q };
    if (ifilt.state) params.state = ifilt.state;
    if (ifilt.year) params.year = ifilt.year;
    const { invoices, summary } = await api('invoices', { params });
    tiles.replaceChildren(
      h('div', { class: 'tile' }, h('small', {}, t('sum_open')), h('b', {}, cents(summary.open_dkk, 'DKK'))),
      h('div', { class: 'tile' + (summary.overdue ? ' bad' : '') }, h('small', {}, t('sum_overdue')), h('b', {}, cents(summary.overdue_dkk, 'DKK')), summary.overdue ? h('em', {}, `${summary.overdue}×`) : null),
      h('div', { class: 'tile' }, h('small', {}, t('sum_drafts')), h('b', {}, String(summary.drafts))));
    list.replaceChildren(...(invoices.length ? invoices.map((i) => h('a', { class: 'card order inv', href: `#/invoice/${i.id}`, style: `--sc:${ICOL[i.state]}` },
      h('div', { class: 'o-top' }, h('div', { style: 'flex:1;min-width:0' },
        h('div', { class: 'o-nr' }, invLabel(i) + (i.credit_of_number ? ' → ' + i.credit_of_number : '')),
        h('div', { class: 'o-title' }, i.customer_company || i.customer_name),
        h('div', { class: 'o-cust' }, `${dfmt(i.issue_date)}${i.type === 'invoice' && i.status === 'final' ? ' · ' + t('due_date') + ' ' + dfmt(i.due_date) : ''}`)),
      h('div', { style: 'text-align:right' }, h('div', { class: 'inv-amt' }, (i.type === 'credit' ? '− ' : '') + cents(i.total, i.currency)), h('div', { style: 'margin-top:6px' }, invState(i.state)),
        ['open', 'overdue'].includes(i.state) && i.paid ? h('small', { class: 'muted' }, `${t('open_amount')} ${cents(i.open, i.currency)}`) : null)))) : [h('div', { class: 'empty' }, t('no_invoices'))]));
  };
  let tm;
  const y = new Date().getFullYear();
  show(
    h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow' }, t('money_eyebrow')), h('h1', {}, t('inv_h1_a'), ' ', h('em', {}, t('inv_h1_b')))), h('a', { class: 'btn primary', href: '#/invoice/new' }, '+ ' + t('new_invoice'))),
    moneyTabs('/invoices'), companyWarn(), tiles,
    h('div', { class: 'filters' },
      h('input', { type: 'search', placeholder: t('search_ph'), value: ifilt.q, oninput: (e) => { ifilt.q = e.target.value; clearTimeout(tm); tm = setTimeout(load, 250); } }),
      h('select', { onchange: (e) => { ifilt.state = e.target.value; load(); } }, h('option', { value: '' }, t('all_invoices')),
        ['unpaid', 'overdue', 'draft', 'paid', 'credit', 'refund'].map((s) => h('option', { value: s, selected: ifilt.state === s }, t('ist_' + s)))),
      h('select', { onchange: (e) => { ifilt.year = e.target.value; load(); } }, h('option', { value: '' }, t('all_years')), [y, y - 1, y - 2, y - 3, y - 4, y - 5].map((v) => h('option', { value: v, selected: String(v) === ifilt.year }, v)))),
    list);
  await load();
});

route(/^\/invoice\/new$/, () => invoiceEditor(null));
route(/^\/invoice\/new\/customer\/(\d+)$/, async (cid) => invoiceEditor(null, { customer: (await api('customer', { params: { id: cid } })).customer }));
route(/^\/invoice\/new\/order\/(\d+)$/, async (oid) => {
  const { order: o } = await api('order', { params: { id: oid } });
  const { customer } = await api('customer', { params: { id: o.customer_id } });
  const price = Math.round(o.price * 100);
  const even = o.qty > 0 && price % o.qty === 0;   // Einzelpreis nur, wenn er auf die Øre aufgeht
  const desc = [o.title, o.article].filter(Boolean).join(' · ') + (even ? '' : ` (${o.qty} ${t('pcs')})`);
  invoiceEditor(null, { customer, order_id: o.id, currency: o.currency, lines: [{ description: desc, qty: even ? o.qty : 1, unit: 'stk', unit_price: even ? price / o.qty : price, discount: 0, kind: 'goods' }] });
});
route(/^\/invoice\/(\d+)$/, async (id) => {
  const { invoice } = await api('invoice', { params: { id } });
  return invoice.status === 'draft' ? invoiceEditor(invoice) : invoiceView(invoice);
});

async function invoiceEditor(inv, preset = {}) {
  const isNew = !inv;
  const D = inv ? { ...inv } : { id: 0, type: 'invoice', customer_id: preset.customer ? preset.customer.id : 0, issue_date: today(), delivery_date: '', due_date: '', currency: preset.currency || (preset.customer ? preset.customer.currency : 'DKK'), rate: '', rate_date: '', rate_source: '', vat_scheme: '', scheme_manual: 0, prices_incl: 0, lang: '', note: '', order_id: preset.order_id || 0, lines: preset.lines || [] };
  let cust = inv ? inv.customer : preset.customer || null;
  const isCredit = D.type === 'credit';
  const err = h('div', { class: 'err' });
  const products = (await api('products')).products.filter((p) => +p.active);
  if (!D.lines.length) D.lines.push({ description: '', qty: 1, unit: 'stk', unit_price: 0, discount: 0, kind: 'goods' });
  if (!D.due_date) D.due_date = addDays(D.issue_date, +me.company.pay_days || 0);

  // --- Kunde
  const custName = h('input', { type: 'text', placeholder: t('customer_ph'), autocomplete: 'off', value: cust ? cust.name + (cust.company ? ' · ' + cust.company : '') : '', disabled: isCredit });
  const sug = h('div', { class: 'suggest-list hidden' });
  const custInfo = h('div', { class: 'muted', style: 'font-size:.85rem;margin-top:4px' });
  const drawCustInfo = () => custInfo.replaceChildren(...(cust ? [me.countries[cust.country] ? me.countries[cust.country][lang === 'da' ? 1 : 0] : cust.country, cust.vat_id ? ' · ' + cust.vat_id : '', +cust.is_business ? ' · ' + t('business') : ' · ' + t('private'), ' · ', h('a', { href: `#/customer/${cust.id}` }, t('edit'))] : []));
  let ct;
  const pickCust = async (c) => {
    cust = (await api('customer', { params: { id: c.id } })).customer; D.customer_id = cust.id;
    custName.value = cust.name + (cust.company ? ' · ' + cust.company : ''); sug.classList.add('hidden');
    if (isNew && !preset.currency) { curSel.value = cust.currency; onCur(); }
    drawCustInfo(); drawScheme(); recalc();
  };
  custName.addEventListener('input', () => {
    cust = null; D.customer_id = 0; clearTimeout(ct); drawCustInfo(); drawScheme();
    ct = setTimeout(async () => {
      const q = custName.value.trim();
      const { customers } = await api('customers', { params: { q } });
      sug.replaceChildren(...customers.slice(0, 8).map((c) => h('button', { type: 'button', onclick: () => pickCust(c) }, c.name + (c.company ? ' · ' + c.company : '') + (c.country && c.country !== 'DK' ? ` (${c.country})` : ''))),
        q && h('a', { class: 'sug-new', href: '#/customer/new' }, '+ ' + t('new_customer')));
      sug.classList.toggle('hidden', !sug.childNodes.length);
    }, 200);
  });

  // --- Moms-Regel (automatisch, mit Erklaerung; von Hand nur bewusst)
  const autoScheme = () => {
    if (!cust) return 'dk';
    if (!me.company.moms_registered) return 'novat';
    if (cust.country === 'DK') return 'dk';
    if (me.eu.includes(cust.country)) return +cust.is_business && cust.vat_id ? 'eu_rc' : 'eu_b2c';
    return 'export';
  };
  const schSel = h('select', { disabled: isCredit, onchange: () => { drawScheme(); recalc(); } }, h('option', { value: '' }, t('auto')), ['dk', 'eu_rc', 'eu_b2c', 'export', 'novat'].map((s) => h('option', { value: s, selected: D.scheme_manual && D.vat_scheme === s }, t('sch_' + s))));
  const schInfo = h('div', { class: 'schinfo' });
  const scheme = () => schSel.value || (isCredit ? D.vat_scheme : autoScheme());
  function drawScheme() {
    const s = scheme();
    schInfo.replaceChildren(...[h('b', {}, t('sch_' + s) + (schSel.value ? '' : ` (${t('auto')})`)), t('sch_hint_' + s) !== 'sch_hint_' + s ? h('div', { class: 'muted' }, t('sch_hint_' + s)) : null,
      cust && me.eu.includes(cust.country) && cust.country !== 'DK' && +cust.is_business && !cust.vat_id ? h('div', { class: 'warn-t' }, '⚠ ' + t('vat_needed')) : null].filter(Boolean));
    inclBox.classList.toggle('hidden', !['dk', 'eu_b2c'].includes(s));
  }

  // --- Daten, Waehrung, Kurs, Sprache
  const issue = h('input', { type: 'date', value: D.issue_date, max: today(), onchange: () => { if (!dueTouched) due.value = addDays(issue.value, +me.company.pay_days || 0); } });
  const delivery = h('input', { type: 'date', value: D.delivery_date || '' });
  let dueTouched = !isNew;
  const due = h('input', { type: 'date', value: D.due_date, onchange: () => { dueTouched = true; } });
  const curSel = h('select', { disabled: isCredit, onchange: () => { onCur(); recalc(); } }, me.currencies.map((c) => h('option', { value: c, selected: c === D.currency }, c)));
  const rateIn = h('input', { type: 'text', inputmode: 'decimal', value: D.rate && D.rate !== '0' && D.rate !== '1' ? String(D.rate).replace('.', ',') : '', disabled: isCredit, oninput: () => { rateMeta = { date: issue.value, source: 'manuel' }; rateNote.textContent = ''; recalc(); } });
  let rateMeta = { date: D.rate_date || '', source: D.rate_source || '' };
  const rateNote = h('small', { class: 'muted' }, D.rate_source ? t('rate_from', String(D.rate).replace('.', ','), dfmt(D.rate_date), D.rate_source) : '');
  const fetchRate = async () => {
    try { const r = await api('rate', { params: { cur: curSel.value } }); rateIn.value = r.rate.replace('.', ','); rateMeta = { date: r.date, source: r.source }; rateNote.textContent = t('rate_from', rateIn.value, dfmt(r.date), r.source); recalc(); } catch (e) { toast(e.message); }
  };
  const rateBox = h('div', { class: 'grid c2' }, h('div', {}, h('label', {}, t('rate', curSel.value)), rateIn, rateNote), h('div', { style: 'align-self:end' }, !isCredit && h('button', { type: 'button', class: 'btn', onclick: fetchRate }, '⟳ ' + t('get_rate'))));
  function onCur() { rateBox.classList.toggle('hidden', curSel.value === 'DKK'); rateBox.querySelector('label').textContent = t('rate', curSel.value); if (curSel.value !== 'DKK' && !rateIn.value) fetchRate(); }
  const langSel = h('select', {}, h('option', { value: '' }, t('lang_auto')), ['da', 'de', 'en'].map((l) => h('option', { value: l, selected: inv && inv.lang === l }, t('lang_' + l))));
  const incl = h('input', { type: 'checkbox', checked: +D.prices_incl, disabled: isCredit, onchange: () => recalc(), style: 'width:22px;height:22px;min-height:0' });
  const inclBox = h('label', { class: 'row', style: 'margin:0;gap:8px;text-transform:none;letter-spacing:0;font-size:.95rem;color:var(--text)' }, incl, t('prices_incl'));
  const note = h('textarea', { rows: 2 }, D.note || '');

  // --- Positionen
  const linesBox = h('div', { class: 'ilines' });
  const rows = [];
  function addLine(l) {
    const r = {};
    r.desc = h('textarea', { rows: 1, placeholder: products.length ? t('line_desc_prod') : t('line_desc'), oninput: (e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; suggestProd(); } }, l.description || '');
    // Produktvorschläge beim Tippen: Auswahl übernimmt Text, Einheit, Preis und Art; Menge × Preis rechnet die Summe sofort
    const psug = h('div', { class: 'suggest-list hidden' });
    const suggestProd = () => {
      const q = r.desc.value.trim().toLowerCase();
      const hits = q.length < 2 ? [] : products.filter((p) => p.name.toLowerCase().includes(q) && p.name.toLowerCase() !== q).slice(0, 6);
      psug.replaceChildren(...hits.map((p) => h('button', { type: 'button', onmousedown: (ev) => ev.preventDefault(), onclick: () => {
        r.desc.value = p.name; r.unit.value = p.unit; r.price.value = centsIn(p.price); r.kind = p.kind; kindBtn.textContent = t(r.kind);
        psug.classList.add('hidden'); r.qty.focus(); r.qty.select(); recalc();
      } }, h('b', {}, p.name), h('span', { class: 'muted' }, ` · ${cents(p.price, 'DKK')} / ${t('u_' + p.unit)}`))));
      psug.classList.toggle('hidden', !hits.length);
    };
    r.desc.addEventListener('blur', () => setTimeout(() => psug.classList.add('hidden'), 150));
    r.qty = h('input', { type: 'text', inputmode: 'decimal', value: String(+l.qty || 1).replace('.', ','), oninput: () => recalc() });
    r.unit = h('select', {}, me.units.map((u) => h('option', { value: u, selected: u === (l.unit || 'stk') }, t('u_' + u))));
    r.price = h('input', { type: 'text', inputmode: 'decimal', value: l.unit_price ? centsIn(l.unit_price) : '', placeholder: '0,00', oninput: () => recalc() });
    r.disc = h('input', { type: 'text', inputmode: 'decimal', value: +l.discount ? String(+l.discount).replace('.', ',') : '', placeholder: '0', oninput: () => recalc() });
    r.kind = l.kind || 'goods';
    const kindBtn = h('button', { type: 'button', class: 'chip kindbtn', title: t('vat_rule'), onclick: () => { r.kind = r.kind === 'goods' ? 'services' : 'goods'; kindBtn.textContent = t(r.kind); } }, t(r.kind));
    r.amt = h('b', { class: 'lamt' });
    r.el = h('div', { class: 'iline' }, h('div', { class: 'suggest' }, r.desc, psug),
      h('div', { class: 'ilrow' },
        h('div', {}, h('label', {}, t('qty')), r.qty), h('div', {}, h('label', {}, t('unit')), r.unit), h('div', {}, h('label', {}, t('unit_price')), r.price), h('div', {}, h('label', {}, t('discount')), r.disc),
        h('div', { class: 'ilend' }, kindBtn, r.amt, h('button', { type: 'button', class: 'btn small danger', 'aria-label': t('delete'), onclick: () => { rows.splice(rows.indexOf(r), 1); r.el.remove(); recalc(); } }, '✕'))));
    rows.push(r); linesBox.append(r.el);
    requestAnimationFrame(() => { r.desc.style.height = 'auto'; r.desc.style.height = r.desc.scrollHeight + 'px'; });
  }
  D.lines.forEach(addLine);
  const linesData = () => rows.map((r) => ({ description: r.desc.value, qty: r.qty.value || '1', unit: r.unit.value, unit_price: r.price.value || '0', discount: r.disc.value || '0', kind: r.kind }));

  // --- Summe (vom Server gerechnet: gleiche Regeln wie beim Festschreiben)
  const sumBox = h('div', { class: 'sumbox invsum' });
  let rt, seq = 0;
  function recalc() {
    clearTimeout(rt);
    rt = setTimeout(async () => {
      const my = ++seq;
      try {
        const { calc } = await api('invoice_calc', { body: { lines: linesData(), vat_scheme: scheme(), prices_incl: incl.checked && !incl.closest('.hidden') ? 1 : 0, currency: curSel.value, rate: rateIn.value } });
        if (my !== seq) return;
        const cur = curSel.value;
        calc.amounts.forEach((a, k) => { if (rows[k]) rows[k].amt.textContent = cents(a, cur); });
        sumBox.replaceChildren(...[
          h('div', { class: 'sl' }, h('span', {}, t('net')), h('span', {}, cents(calc.net, cur))),
          h('div', { class: 'sl' }, h('span', {}, `${t('vat')} ${calc.rate_pct} %`), h('span', {}, cents(calc.vat, cur))),
          h('div', { class: 'sl g' }, h('span', {}, t('total')), h('b', {}, (isCredit ? '− ' : '') + cents(calc.total, cur))),
          cur !== 'DKK' && calc.vat ? h('div', { class: 'sl muted' }, h('span', {}, t('vat_dkk')), h('span', {}, cents(calc.vat_dkk, 'DKK'))) : null].filter(Boolean));
      } catch (e) { sumBox.replaceChildren(h('span', { class: 'err' }, e.message)); }
    }, 250);
  }

  async function save(quiet) {
    err.textContent = '';
    if (!D.customer_id) throw new Error(t('err_bad_customer'));
    const body = { id: D.id, customer_id: D.customer_id, issue_date: issue.value, delivery_date: delivery.value, due_date: due.value, currency: curSel.value, rate: rateIn.value, rate_date: rateMeta.date, rate_source: rateMeta.source,
      vat_scheme: schSel.value, prices_incl: incl.checked && !inclBox.classList.contains('hidden') ? 1 : 0, lang: langSel.value, note: note.value, lines: linesData(), order_id: D.order_id || 0 };
    const r = await api('invoice_save', { body });
    D.id = r.id;
    if (r.rate && r.rate !== '0' && r.rate !== '1' && !rateIn.value) rateIn.value = r.rate.replace('.', ',');
    if (!quiet) toast(t('saved'));
    if (isNew) history.replaceState(null, '', `#/invoice/${r.id}`);
    return r;
  }
  const guard = (fn) => async () => { try { await fn(); } catch (e) { err.textContent = e.message; err.scrollIntoView({ block: 'center', behavior: 'smooth' }); } };

  show(
    h('a', { href: '#/invoices', class: 'muted' }, '← ' + t('nav_invoices')),
    h('div', { class: 'page-head', style: 'margin-top:8px' }, h('div', {}, h('div', { class: 'eyebrow' }, (isCredit ? t('credit_note') : t('invoice')) + ' · ' + t('draft')),
      h('h1', {}, isCredit ? t('credit_for', inv.credit_of_number) : isNew ? t('new_invoice') : t('invoice'), ' ', h('em', {}, t('draft'))))),
    companyWarn(),
    h('div', { class: 'card grid' },
      h('div', {}, h('label', {}, t('customer')), h('div', { class: 'suggest' }, custName, sug), custInfo),
      h('div', { class: 'grid c3' }, h('div', {}, h('label', {}, t('issue_date')), issue), h('div', {}, h('label', {}, t('due_date')), due), h('div', {}, h('label', {}, t('delivery_date')), delivery)),
      h('div', { class: 'grid c3' }, h('div', {}, h('label', {}, t('currency')), curSel), h('div', {}, h('label', {}, t('doc_lang')), langSel), h('div', {}, h('label', {}, t('vat_rule')), schSel)),
      rateBox, schInfo, inclBox),
    h('div', { class: 'card' }, h('h3', { style: 'margin-bottom:10px' }, t('lines')), linesBox,
      h('div', { class: 'row', style: 'margin-top:10px' },
        h('button', { type: 'button', class: 'btn', onclick: () => { addLine({}); rows[rows.length - 1].desc.focus(); } }, t('add_line')),
        products.length ? h('select', { class: 'prodsel', onchange: (e) => {
          const p = products.find((x) => +x.id === +e.target.value); e.target.value = '';
          if (!p) return;
          const last = rows[rows.length - 1];
          if (last && !last.desc.value.trim() && !last.price.value.trim()) { last.el.remove(); rows.pop(); }
          addLine({ description: p.name, qty: 1, unit: p.unit, unit_price: p.price, kind: p.kind }); recalc();
        } }, h('option', { value: '' }, '+ ' + t('from_products')), products.map((p) => h('option', { value: p.id }, `${p.name} · ${cents(p.price, 'DKK')}`))) : null),
      h('div', { style: 'margin-top:14px' }, sumBox)),
    h('div', { class: 'card' }, h('label', {}, t('note_on_doc')), note),
    err,
    h('div', { class: 'formbar' },
      D.id ? h('button', { class: 'btn danger', onclick: guard(async () => { if (confirm(t('delete_draft_confirm'))) { await api('invoice_delete', { body: { id: D.id } }); location.hash = '#/invoices'; } }) }, '🗑') : null,
      h('button', { class: 'btn', onclick: guard(async () => { const w = window.open('', '_blank'); try { await save(true); w.location = docUrl(D.id); } catch (e) { w.close(); throw e; } }) }, t('preview')),
      h('button', { class: 'btn', onclick: guard(async () => { await save(); render(); }) }, t('save_draft')),
      h('button', { class: 'btn primary', onclick: guard(async () => {
        const r = await save(true);
        if (!confirm(t('approve_confirm', custName.value, cents(r.calc.total, curSel.value)))) { render(); return; }
        const a = await api('invoice_approve', { body: { id: D.id } });
        toast(t('approved_as', a.number)); await reloadMe(); location.hash = `#/invoice/${D.id}`; render();
      }) }, '🔒 ' + t('approve'))));
  drawCustInfo(); onCur(); drawScheme(); recalc();
}

function invoiceView(i) {
  const cur = i.currency, b = i.balance, isCredit = i.type === 'credit';
  const C = i.customer_snap;
  const amt = h('input', { type: 'text', inputmode: 'decimal', value: !isCredit && b.open > 0 ? centsIn(b.open) : '' });
  const pdate = h('input', { type: 'date', value: today(), max: today() });
  const meth = h('select', {}, ['bank', 'mobilepay', 'cash', 'card', 'other'].map((m) => h('option', { value: m }, t('pm_' + m))));
  const pnote = h('input', { type: 'text', maxlength: 200, placeholder: t('notes') });
  const err = h('div', { class: 'err' });
  const reversed = new Set(i.payments.filter((p) => p.reverses).map((p) => +p.reverses));
  const state = isCredit ? 'credit' : b.open > 0 ? (i.due_date < today() ? 'overdue' : 'open') : b.open < 0 ? 'refund' : 'paid';
  show(
    h('a', { href: '#/invoices', class: 'muted' }, '← ' + t('nav_invoices')),
    h('div', { class: 'page-head', style: 'margin-top:8px' }, h('div', {}, h('div', { class: 'eyebrow' }, invLabel(i)), h('h1', {}, C.company || C.name), h('div', { style: 'margin-top:6px' }, invState(state))),
      h('div', { class: 'row' },
        h('a', { class: 'btn primary', href: docUrl(i.id), target: '_blank', rel: 'noopener', onclick: () => { if (!i.sent_at) api('invoice_sent', { body: { id: i.id } }).catch(() => {}); } }, '🖨 ' + t('print_pdf')),
        !isCredit && h('button', { class: 'btn', onclick: async () => { const r = await api('invoice_copy', { body: { id: i.id } }); location.hash = `#/invoice/${r.id}`; } }, t('copy_inv')),
        !isCredit && b.credited < +i.total && h('button', { class: 'btn', onclick: async () => { if (!confirm(t('credit_confirm'))) return; try { const r = await api('invoice_credit', { body: { id: i.id } }); location.hash = `#/invoice/${r.id}`; } catch (e) { toast(e.message); } } }, t('make_credit')))),
    h('div', { class: 'card' },
      h('dl', { class: 'kv' },
        h('dt', {}, t('customer')), h('dd', {}, h('a', { href: `#/customer/${i.customer_id}` }, [C.company, C.name].filter(Boolean).join(' · ')), C.vat_id ? h('small', { class: 'muted' }, ' · ' + C.vat_id) : null),
        h('dt', {}, t('issue_date')), h('dd', {}, dfmt(i.issue_date) + (i.delivery_date && i.delivery_date !== i.issue_date ? ` · ${t('delivery_date').split(' (')[0]} ${dfmt(i.delivery_date)}` : '')),
        !isCredit && [h('dt', {}, t('due_date')), h('dd', { class: state === 'overdue' ? 'due late' : '' }, dfmt(i.due_date))],
        isCredit && [h('dt', {}, t('invoice')), h('dd', {}, h('a', { href: `#/invoice/${i.credit_of}` }, String(i.credit_of_number)))],
        i.order_id ? [h('dt', {}, t('order_word')), h('dd', {}, h('a', { href: `#/order/${i.order_id}` }, t('purpose_' + (i.purpose || 'none'))))] : null,
        h('dt', {}, t('vat_rule')), h('dd', {}, t('sch_' + i.vat_scheme)),
        h('dt', {}, t('net')), h('dd', {}, cents(i.net, cur)),
        h('dt', {}, t('vat')), h('dd', {}, cents(i.vat, cur) + (cur !== 'DKK' && +i.vat ? ` · ${cents(i.vat_dkk, 'DKK')} (${t('rate_from', String(i.rate).replace('.', ','), dfmt(i.rate_date), i.rate_source)})` : '')),
        h('dt', {}, t('total')), h('dd', {}, h('b', {}, (isCredit ? '− ' : '') + cents(i.total, cur))),
        !isCredit && [h('dt', {}, t('paid')), h('dd', {}, cents(b.paid, cur) + (b.credited ? ` · ${t('credits')} − ${cents(b.credited - b.refunded, cur)}` : ''))],
        !isCredit && [h('dt', {}, t('open_amount')), h('dd', {}, h('b', { style: b.open > 0 ? 'color:var(--warn)' : 'color:var(--ok)' }, cents(b.open, cur)))],
        i.credits.length ? [h('dt', {}, t('credits')), h('dd', {}, i.credits.map((c) => h('div', {}, h('a', { href: `#/invoice/${c.id}` }, c.status === 'final' ? `${t('credit_note')} ${c.number}` : t('draft')), ' · − ' + cents(c.total, cur))))] : null,
        i.sent_at ? [h('dt', {}, '✉'), h('dd', {}, t('sent_at', i.sent_at.slice(0, 16)))] : null)),
    h('div', { class: 'card' }, h('h3', { style: 'margin-bottom:8px' }, t('lines')),
      h('div', { class: 'tscroll' }, h('table', { class: 't' }, h('tr', {}, h('th', {}, t('line_desc')), h('th', { class: 'n' }, t('qty')), h('th', { class: 'n' }, t('unit_price')), h('th', { class: 'n' }, t('amount'))),
        i.lines.map((l) => h('tr', {}, h('td', { style: 'white-space:pre-wrap' }, l.description, +l.discount ? h('small', { class: 'muted' }, ` −${String(+l.discount).replace('.', ',')} %`) : null), h('td', { class: 'n' }, `${String(+l.qty).replace('.', ',')} ${t('u_' + l.unit)}`), h('td', { class: 'n' }, cents(l.unit_price, cur)), h('td', { class: 'n' }, cents(l.amount, cur))))))),
    h('div', { class: 'card' }, h('h3', { style: 'margin-bottom:8px' }, t('payments')),
      i.payments.length ? h('div', {}, i.payments.map((p) => h('div', { class: 'free' + (p.reverses || reversed.has(+p.id) ? ' struck' : '') },
        h('span', {}, `${dfmt(p.date)} · ${t('pm_' + p.method)}${p.note ? ' · ' + p.note : ''}${reversed.has(+p.id) ? ' · ' + t('reversed') : ''}`),
        h('span', { class: 'row', style: 'gap:8px' }, h('b', {}, cents(p.amount, cur)),
          +p.amount > 0 && !reversed.has(+p.id) ? h('button', { class: 'btn small', onclick: async () => { if (confirm(t('reverse_confirm'))) { await api('invoice_pay_reverse', { body: { payment_id: p.id } }); render(); } } }, t('reverse')) : null)))) : h('p', { class: 'muted' }, t('no_payments')),
      h('div', { class: 'grid c3', style: 'margin-top:12px' }, h('div', {}, h('label', {}, t('amount') + ' ' + cur), amt), h('div', {}, h('label', {}, t('date')), pdate), h('div', {}, h('label', {}, t('method')), meth)),
      h('div', { style: 'margin-top:8px' }, pnote), err,
      h('div', { class: 'row end', style: 'margin-top:10px' }, h('button', { class: 'btn primary', onclick: async () => {
        err.textContent = '';
        try { await api('invoice_pay', { body: { id: i.id, amount: amt.value, date: pdate.value, method: meth.value, note: pnote.value } }); toast(t('saved')); render(); } catch (e) { err.textContent = e.message; }
      } }, isCredit ? t('refund') : t('add_payment')))),
    h('p', { class: 'muted lockinfo' }, '🔒 ' + t('locked_info', (i.approved_at || '').slice(0, 16), i.approved_by || '', (i.hash || '').slice(0, 12))));
}

// ---------- Ausgaben & Bank ----------
const moneyTabs = (on) => h('div', { class: 'mtabs' }, [['/invoices', t('tab_invoices')], ['/expenses', t('tab_expenses')], ['/bank', t('tab_bank')], ['/tax', t('tab_tax')]].map(([r, l]) => h('a', { href: '#' + r, class: r === on ? 'on' : '' }, l)));
const catName = (k) => { const c = me.exp_categories[k] || me.exp_categories.misc; return lang === 'da' ? c[1] : c[0]; };
const catInfo = (k) => { const c = me.exp_categories[k] || me.exp_categories.misc; return lang === 'da' ? c[5] : c[4]; };
const catShare = (k) => { const c = me.exp_categories[k] || me.exp_categories.misc; return c[2] === 'phone' ? +(me.company.phone_share ?? 50) : +c[2]; };
const toC = (v) => { let s = String(v || '0').replace(/\s/g, ''); if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); return Math.round((parseFloat(s) || 0) * 100); };

// Beleg aufnehmen: Kamera/Datei -> Entwurf (Claude liest aus, wenn eingerichtet) -> Editor
function receiptButtons(id) {
  const send = async (files) => {
    if (!files.length) return;
    toast(me.ai_enabled && !id ? t('ai_reading') : t('uploading', 1, 1));
    try {
      const fd = new FormData(); if (id) fd.append('id', id); fd.append('scan', id ? '' : '1'); fd.append('file', await prepImage(files[0]));
      const r = await api('expense_upload', { form: fd });
      if (r.ai_error) toast(t('err_' + r.ai_error)); else if (r.ai && !r.ai.is_receipt) toast(t('ai_not_receipt')); else if (r.ai && !r.ai.confident) toast(t('ai_check'));
      if (location.hash === `#/expense/${r.id}`) render(); else location.hash = `#/expense/${r.id}`;
    } catch (e) { toast(e.message); }
  };
  const cam = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'hidden', onchange: (e) => { send([...e.target.files]); e.target.value = ''; } });
  const gal = h('input', { type: 'file', accept: 'image/*,application/pdf', class: 'hidden', onchange: (e) => { send([...e.target.files]); e.target.value = ''; } });
  return h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn primary', onclick: () => cam.click() }, '📷 ' + t(id ? 'receipt_retake' : 'receipt_photo')), h('button', { type: 'button', class: 'btn', onclick: () => gal.click() }, '🖼 ' + t('pick_files')), cam, gal);
}

const efilt = { q: '', state: '', year: '' };
route(/^\/expenses$/, async () => {
  const list = h('div', { class: 'orders' });
  const tiles = h('div', { class: 'tiles' });
  const load = async () => {
    const params = { q: efilt.q };
    if (efilt.state) params.state = efilt.state;
    if (efilt.year) params.year = efilt.year;
    const { expenses, summary } = await api('expenses', { params });
    tiles.replaceChildren(
      h('div', { class: 'tile' }, h('small', {}, t('exp_year', new Date().getFullYear())), h('b', {}, cents(summary.g, 'DKK'))),
      h('div', { class: 'tile' }, h('small', {}, t('exp_deduct')), h('b', {}, cents(summary.d, 'DKK'))),
      h('a', { class: 'tile' + (summary.bank_open ? ' bad' : ''), href: '#/bank', style: 'text-decoration:none;color:inherit' }, h('small', {}, t('bank_open')), h('b', {}, String(summary.bank_open))));
    list.replaceChildren(...(expenses.length ? expenses.map((e) => {
      const st = e.status === 'draft' ? 'draft' : e.reverses ? 'credit' : e.reversed_by ? 'credit' : e.paid_date || e.gross < 0 ? 'paid' : 'open';
      return h('a', { class: 'card order inv', href: `#/expense/${e.id}`, style: `--sc:${ICOL[st]}` },
        h('div', { class: 'o-top' }, h('div', { style: 'flex:1;min-width:0' },
          h('div', { class: 'o-nr' }, (e.status === 'final' ? t('bilag') + ' ' + e.number : t('draft')) + (e.has_file ? ' · 📎' : '')),
          h('div', { class: 'o-title' }, e.supplier || '—'),
          h('div', { class: 'o-cust' }, `${dfmt(e.date)} · ${catName(e.category)}${e.description ? ' · ' + e.description : ''}`)),
        h('div', { style: 'text-align:right' }, h('div', { class: 'inv-amt' }, cents(e.gross, e.currency)),
          h('div', { style: 'margin-top:6px' }, pill(e.reverses ? t('storno') : e.reversed_by ? t('reversed') : t('exp_st_' + st), ICOL[st])),
          +e.deduct_dkk ? h('small', { class: 'muted' }, `${t('vat')} ${cents(e.deduct_dkk, 'DKK')}`) : null)));
    }) : [h('div', { class: 'empty' }, t('no_expenses'))]));
  };
  let tm;
  const y = new Date().getFullYear();
  show(
    h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow' }, t('money_eyebrow')), h('h1', {}, t('exp_h1_a'), ' ', h('em', {}, t('exp_h1_b'))))),
    moneyTabs('/expenses'),
    h('div', { class: 'card receiptcard' }, h('p', { class: 'muted', style: 'margin:0 0 10px' }, me.ai_enabled ? t('receipt_hint_ai') : t('receipt_hint')), receiptButtons(),
      h('a', { href: '#/expense/new', class: 'muted', style: 'display:inline-block;margin-top:10px;font-size:.9rem' }, '+ ' + t('exp_manual'))),
    tiles,
    h('div', { class: 'filters' },
      h('input', { type: 'search', placeholder: t('search_ph'), value: efilt.q, oninput: (e) => { efilt.q = e.target.value; clearTimeout(tm); tm = setTimeout(load, 250); } }),
      h('select', { onchange: (e) => { efilt.state = e.target.value; load(); } }, h('option', { value: '' }, t('all_invoices')), ['draft', 'unpaid', 'final'].map((s) => h('option', { value: s, selected: efilt.state === s }, t('exp_f_' + s)))),
      h('select', { onchange: (e) => { efilt.year = e.target.value; load(); } }, h('option', { value: '' }, t('all_years')), [y, y - 1, y - 2, y - 3, y - 4, y - 5].map((v) => h('option', { value: v, selected: String(v) === efilt.year }, v)))),
    list);
  await load();
});

route(/^\/expense\/(new|\d+)$/, async (id) => {
  const e = id === 'new' ? { id: 0, status: 'draft', date: today(), supplier: '', supplier_country: 'DK', supplier_vat: '', doc_no: '', description: '', category: 'material', currency: 'DKK', rate: '1', gross: 0, vat: 0, vat_mode: 'dk', vat_share: 100, no_receipt: '', note: '', paid_date: null, pay_method: '' } : (await api('expense', { params: { id } })).expense;
  return e.status === 'draft' ? expenseEditor(e) : expenseView(e);
});

function receiptPreview(e) {
  if (!e.file_stored) return null;
  const url = `${BASE}file.php?exp=${e.id}`;
  return h('a', { href: url, target: '_blank', rel: 'noopener', class: 'rprev' }, e.file_mime === 'application/pdf' ? h('div', { class: 'pdf' }, 'PDF') : h('img', { src: url, alt: '' }));
}

function expenseEditor(e) {
  const err = h('div', { class: 'err' });
  const F = {};
  const inp = (k, extra = {}) => (F[k] = h('input', { type: 'text', value: e[k] ?? '', ...extra }));
  const fld = (label, el, hint) => h('div', {}, h('label', {}, label), el, hint || null);
  inp('date', { type: 'date', max: today() }); inp('supplier', { maxlength: 200 }); inp('supplier_vat'); inp('doc_no'); inp('description', { maxlength: 300 });
  F.supplier_country = h('select', {}, countryOpts(e.supplier_country || 'DK'));
  F.category = h('select', { onchange: () => { F.vat_share.value = catShare(F.category.value); if (+catShare(F.category.value) === 0 && F.vat_mode.value === 'dk' && ['insurance', 'bank', 'car', 'gifts'].includes(F.category.value)) F.vat_mode.value = 'none'; drawInfo(); calc(); } },
    Object.keys(me.exp_categories).map((k) => h('option', { value: k, selected: k === e.category }, catName(k))));
  const catHint = h('small', { class: 'muted hint' });
  F.vat_mode = h('select', { onchange: () => { drawInfo(); calc(); } }, ['dk', 'none', 'eu_goods', 'rc_services'].map((m) => h('option', { value: m, selected: m === e.vat_mode }, t('vm_' + m))));
  const modeHint = h('small', { class: 'muted hint' });
  F.gross = h('input', { type: 'text', inputmode: 'decimal', value: e.gross ? centsIn(e.gross) : '', placeholder: '0,00', oninput: () => calc() });
  F.vat = h('input', { type: 'text', inputmode: 'decimal', value: e.vat ? centsIn(e.vat) : '', placeholder: '0,00', oninput: () => calc() });
  const vat20 = h('button', { type: 'button', class: 'btn small', onclick: () => { F.vat.value = centsIn(Math.round(toC(F.gross.value) * 0.2)); calc(); } }, t('vat_from_gross'));
  F.vat_share = h('input', { type: 'number', min: 0, max: 100, value: e.vat_share ?? 100, oninput: () => calc(), style: 'width:90px' });
  F.currency = h('select', { onchange: () => { rateWrap.classList.toggle('hidden', F.currency.value === 'DKK'); calc(); } }, me.currencies.map((c) => h('option', { value: c, selected: c === e.currency }, c)));
  F.rate = h('input', { type: 'text', inputmode: 'decimal', value: e.currency !== 'DKK' && +e.rate ? String(e.rate).replace('.', ',') : '', oninput: () => calc() });
  const rateWrap = h('div', { class: e.currency === 'DKK' ? 'hidden' : '' }, fld(t('rate', 'EUR'), F.rate), h('button', { type: 'button', class: 'btn small', style: 'margin-top:6px', onclick: async () => { try { const r = await api('rate', { params: { cur: F.currency.value } }); F.rate.value = r.rate.replace('.', ','); calc(); } catch (x) { toast(x.message); } } }, '⟳ ' + t('get_rate')));
  const paidChk = h('input', { type: 'checkbox', checked: !!e.paid_date, style: 'width:22px;height:22px;min-height:0', onchange: () => { paidBox.classList.toggle('hidden', !paidChk.checked); if (paidChk.checked && !F.paid_date.value) F.paid_date.value = F.date.value; } });
  F.paid_date = h('input', { type: 'date', value: e.paid_date || '', max: today() });
  F.pay_method = h('select', {}, ['card', 'bank', 'mobilepay', 'cash', 'other'].map((m) => h('option', { value: m, selected: m === (e.pay_method || 'card') }, t('pm_' + m))));
  const paidBox = h('div', { class: 'grid c2' + (e.paid_date ? '' : ' hidden') }, fld(t('paid_on'), F.paid_date), fld(t('method'), F.pay_method));
  F.no_receipt = h('input', { type: 'text', value: e.no_receipt || '', maxlength: 300, placeholder: t('no_receipt_ph') });
  F.note = h('textarea', { rows: 2 }, e.note || '');
  const sumBox = h('div', { class: 'sumbox invsum' });
  function drawInfo() { catHint.textContent = catInfo(F.category.value); modeHint.textContent = t('vm_hint_' + F.vat_mode.value); vatRow.classList.toggle('hidden', F.vat_mode.value !== 'dk'); }
  function calc() {
    const g = toC(F.gross.value), mode = F.vat_mode.value, share = Math.max(0, Math.min(100, +F.vat_share.value || 0));
    const fx = F.currency.value === 'DKK' ? 1 : (parseFloat(F.rate.value.replace(',', '.')) || 0);
    const v = mode === 'dk' ? toC(F.vat.value) : 0;
    const gd = Math.round(g * fx), vd = Math.round(v * fx), nd = gd - vd, rc = ['eu_goods', 'rc_services'].includes(mode) ? Math.round(nd * 0.25) : 0;
    const ded = Math.round((mode === 'dk' ? vd : rc) * share / 100);
    sumBox.replaceChildren(...[
      h('div', { class: 'sl' }, h('span', {}, t('net') + ' DKK'), h('span', {}, cents(nd, 'DKK'))),
      rc ? h('div', { class: 'sl' }, h('span', {}, t('rc_vat')), h('span', {}, cents(rc, 'DKK'))) : null,
      h('div', { class: 'sl g' }, h('span', {}, t('exp_deduct')), h('b', {}, cents(ded, 'DKK'))),
      mode === 'dk' && v > g * 0.2 + 1 ? h('div', { class: 'warn-t' }, '⚠ ' + t('err_vat_too_high')) : null].filter(Boolean));
  }
  const vatRow = h('div', { class: 'grid c2' }, h('div', {}, h('label', {}, t('vat_on_receipt')), F.vat, h('div', { style: 'margin-top:6px' }, vat20)), fld(t('vat_share'), F.vat_share));
  const body = () => ({ id: e.id, ...Object.fromEntries(Object.entries(F).map(([k, el]) => [k, el.value])), paid_date: paidChk.checked ? F.paid_date.value : '' });
  const guard = (fn) => async () => { try { err.textContent = ''; await fn(); } catch (x) { err.textContent = x.message; err.scrollIntoView({ block: 'center', behavior: 'smooth' }); } };
  const save = async () => { const r = await api('expense_save', { body: body() }); e.id = r.id; if (location.hash !== `#/expense/${r.id}`) history.replaceState(null, '', `#/expense/${r.id}`); return r; };
  show(
    h('a', { href: '#/expenses', class: 'muted' }, '← ' + t('tab_expenses')),
    h('div', { class: 'page-head', style: 'margin-top:8px' }, h('div', {}, h('div', { class: 'eyebrow' }, t('draft')), h('h1', {}, e.supplier || t('exp_new')))),
    e.ai_model ? h('div', { class: 'card aibox' }, '✨ ' + t('ai_filled')) : null,
    h('div', { class: 'card' }, h('div', { class: 'rrow' }, receiptPreview(e), h('div', { style: 'flex:1' }, h('h3', { style: 'margin-bottom:8px' }, t('receipt')), e.id ? receiptButtons(e.id) : h('p', { class: 'muted' }, t('receipt_after_save')),
      !e.file_stored ? h('div', { style: 'margin-top:10px' }, fld(t('no_receipt'), F.no_receipt)) : null))),
    h('div', { class: 'card grid' },
      h('div', { class: 'grid c2' }, fld(t('date'), F.date), fld(t('supplier'), F.supplier)),
      fld(t('description'), F.description),
      h('div', { class: 'grid c3' }, fld(t('country'), F.supplier_country), fld(t('vat_id'), F.supplier_vat), fld(t('doc_no'), F.doc_no)),
      fld(t('category'), F.category, catHint),
      h('div', { class: 'grid c3' }, fld(t('amount_total'), F.gross), fld(t('currency'), F.currency), rateWrap),
      fld(t('vat_mode'), F.vat_mode, modeHint),
      vatRow,
      h('label', { class: 'row', style: 'margin:6px 0 0;gap:8px;text-transform:none;letter-spacing:0;font-size:.95rem;color:var(--text)' }, paidChk, t('already_paid')), paidBox,
      fld(t('notes'), F.note), sumBox),
    err,
    h('div', { class: 'formbar' },
      e.id ? h('button', { class: 'btn danger', onclick: guard(async () => { if (confirm(t('delete_draft_confirm'))) { await api('expense_delete', { body: { id: e.id } }); location.hash = '#/expenses'; } }) }, '🗑') : null,
      h('button', { class: 'btn', onclick: guard(async () => { await save(); toast(t('saved')); render(); }) }, t('save_draft')),
      h('button', { class: 'btn primary', onclick: guard(async () => {
        await save();
        if (!confirm(t('exp_approve_confirm', F.supplier.value, F.gross.value + ' ' + F.currency.value))) { render(); return; }
        const r = await api('expense_approve', { body: { id: e.id } }); toast(t('booked_as', r.number)); location.hash = `#/expense/${e.id}`; render();
      }) }, '🔒 ' + t('book'))));
  drawInfo(); calc();
}

function expenseView(e) {
  const pd = h('input', { type: 'date', value: e.paid_date || '', max: today() });
  const pm = h('select', {}, ['bank', 'card', 'mobilepay', 'cash', 'other'].map((m) => h('option', { value: m, selected: m === (e.pay_method || 'bank') }, t('pm_' + m))));
  const modeTxt = t('vm_' + e.vat_mode);
  show(
    h('a', { href: '#/expenses', class: 'muted' }, '← ' + t('tab_expenses')),
    h('div', { class: 'page-head', style: 'margin-top:8px' }, h('div', {}, h('div', { class: 'eyebrow' }, `${t('bilag')} ${e.number}`), h('h1', {}, e.supplier),
      h('div', { style: 'margin-top:6px' }, e.reverses ? pill(t('storno'), ICOL.credit) : e.reversed_by ? pill(t('reversed'), ICOL.credit) : pill(e.paid_date ? t('exp_st_paid') : t('exp_st_open'), e.paid_date ? ICOL.paid : ICOL.open))),
      !e.reverses && !e.reversed_by ? h('button', { class: 'btn danger', onclick: async () => { const why = prompt(t('reverse_reason')); if (why === null) return; try { const r = await api('expense_reverse', { body: { id: e.id, reason: why } }); location.hash = `#/expense/${r.id}`; } catch (x) { toast(x.message); } } }, t('reverse')) : null),
    h('div', { class: 'card' }, h('div', { class: 'rrow' }, receiptPreview(e) || h('div', { class: 'muted' }, '⚠ ' + t('no_receipt') + ': ' + e.no_receipt),
      h('dl', { class: 'kv', style: 'flex:1' },
        h('dt', {}, t('date')), h('dd', {}, dfmt(e.date) + (e.doc_no ? ' · ' + t('doc_no') + ' ' + e.doc_no : '')),
        e.description ? [h('dt', {}, t('description')), h('dd', {}, e.description)] : null,
        h('dt', {}, t('category')), h('dd', {}, catName(e.category)),
        h('dt', {}, t('amount_total')), h('dd', {}, h('b', {}, cents(e.gross, e.currency)), e.currency !== 'DKK' ? ` · ${cents(e.gross_dkk, 'DKK')}` : ''),
        h('dt', {}, t('vat_mode')), h('dd', {}, modeTxt + (e.vat_mode === 'dk' ? ` · ${cents(e.vat_dkk, 'DKK')} · ${e.vat_share} %` : '')),
        +e.rc_vat_dkk ? [h('dt', {}, t('rc_vat')), h('dd', {}, cents(e.rc_vat_dkk, 'DKK'))] : null,
        h('dt', {}, t('exp_deduct')), h('dd', {}, h('b', {}, cents(e.deduct_dkk, 'DKK'))),
        e.reverses ? [h('dt', {}, t('storno')), h('dd', {}, h('a', { href: `#/expense/${e.reverses}` }, t('original')))] : null,
        e.reversed_by ? [h('dt', {}, t('reversed')), h('dd', {}, h('a', { href: `#/expense/${e.reversed_by}` }, t('storno')))] : null,
        e.note ? [h('dt', {}, t('notes')), h('dd', {}, e.note)] : null))),
    !e.reverses && !e.reversed_by && h('div', { class: 'card' }, h('h3', { style: 'margin-bottom:8px' }, t('payment')),
      e.bank ? h('p', { class: 'muted', style: 'margin:0 0 8px' }, `🏦 ${dfmt(e.bank.date)} · ${e.bank.text}`) : null,
      h('div', { class: 'grid c2' }, h('div', {}, h('label', {}, t('paid_on')), pd), h('div', {}, h('label', {}, t('method')), pm)),
      h('div', { class: 'row end', style: 'margin-top:10px' },
        e.paid_date ? h('button', { class: 'btn', onclick: async () => { await api('expense_paid', { body: { id: e.id, paid_date: '' } }); render(); } }, t('mark_unpaid')) : null,
        h('button', { class: 'btn primary', onclick: async () => { await api('expense_paid', { body: { id: e.id, paid_date: pd.value || today(), pay_method: pm.value } }); toast(t('saved')); render(); } }, t('save')))),
    h('p', { class: 'muted lockinfo' }, '🔒 ' + t('exp_locked', (e.approved_at || '').slice(0, 16), e.approved_by || '', (e.hash || '').slice(0, 12))));
}

// ---------- Bank (Kontoauszug) ----------
let bankShow = 'open';
route(/^\/bank$/, async () => {
  const { tx, open } = await api('bank', { params: { show: bankShow } });
  const openInv = (await api('invoices', { params: { state: 'unpaid' } })).invoices;
  const csvIn = h('input', { type: 'file', accept: '.csv,text/csv,text/plain', class: 'hidden', onchange: async (ev) => {
    const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
    try { const fd = new FormData(); fd.append('file', f); const r = await api('bank_import', { form: fd }); toast(t('bank_imported', r.added, r.auto)); render(); } catch (x) { toast(x.message); }
  } });
  const act = async (body) => { try { await api('bank_match', { body }); render(); } catch (x) { toast(x.message); } };
  const txCard = (x) => {
    const inc = x.amount > 0;
    let tools;
    if (x.match_type) {
      tools = h('div', { class: 'row', style: 'gap:8px' }, pill(t('bm_' + x.match_type) + (x.match_label ? ' ' + x.match_label : '') + (x.match_note ? ' · ' + x.match_note : ''), x.match_type === 'private' || x.match_type === 'transfer' ? 'var(--muted)' : 'var(--ok)'),
        x.match_type === 'invoice' ? h('a', { class: 'btn small', href: `#/invoice/${x.match_id}` }, '→') : x.match_type === 'expense' ? h('a', { class: 'btn small', href: `#/expense/${x.match_id}` }, '→') : null,
        h('button', { class: 'btn small', onclick: async () => { if (confirm(t('unmatch_confirm'))) { await api('bank_unmatch', { body: { tx_id: x.id } }); render(); } } }, t('unmatch')));
    } else {
      const sel = inc && openInv.length ? h('select', { class: 'prodsel', onchange: (ev) => { if (ev.target.value) act({ tx_id: x.id, type: 'invoice', id: +ev.target.value }); } },
        h('option', { value: '' }, t('pick_invoice')), openInv.map((i) => h('option', { value: i.id }, `${i.number} · ${i.customer_company || i.customer_name} · ${cents(i.open, i.currency)}`))) : null;
      tools = h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' },
        (x.candidates || []).map((c) => h('button', { class: 'btn small primary', onclick: () => act({ tx_id: x.id, type: c.type, id: c.id }) }, '✓ ' + c.label)),
        !inc ? h('button', { class: 'btn small', onclick: async () => { const r = await api('bank_to_expense', { body: { tx_id: x.id } }); location.hash = `#/expense/${r.id}`; } }, '+ ' + t('exp_new')) : h('a', { class: 'btn small', href: '#/invoice/new' }, '+ ' + t('invoice')),
        sel,
        h('button', { class: 'btn small', onclick: () => act({ tx_id: x.id, type: 'private' }) }, t(inc ? 'bm_private_in' : 'bm_private')),
        h('button', { class: 'btn small', onclick: () => act({ tx_id: x.id, type: 'transfer' }) }, t('bm_transfer')));
    }
    return h('div', { class: 'card btx' + (x.match_type ? ' done' : '') },
      h('div', { class: 'btop' }, h('div', { style: 'min-width:0;flex:1' }, h('div', { class: 'o-nr' }, dfmt(x.date)), h('div', { class: 'btext' }, x.text || '—')),
        h('b', { class: 'bamt ' + (inc ? 'in' : 'out') }, cents(x.amount, 'DKK'))), tools);
  };
  show(
    h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow' }, t('money_eyebrow')), h('h1', {}, t('bank_h1_a'), ' ', h('em', {}, t('bank_h1_b'))))),
    moneyTabs('/bank'),
    h('div', { class: 'card' }, h('p', { class: 'muted', style: 'margin:0 0 10px' }, t('bank_hint')),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => csvIn.click() }, '⬆ ' + t('bank_import')), csvIn,
        h('select', { onchange: (ev) => { bankShow = ev.target.value; render(); } }, [['open', t('bank_show_open', open)], ['all', t('bank_show_all')]].map(([v, l]) => h('option', { value: v, selected: bankShow === v }, l))))),
    tx.length ? h('div', { class: 'btxs' }, tx.map(txCard)) : h('div', { class: 'empty' }, bankShow === 'open' ? t('bank_none_open') : t('bank_none')));
});

// ---------- Moms-Cockpit ----------
const kr = (c) => Math.round((+c || 0) / 100);
const krFmt = (c) => new Intl.NumberFormat(lang === 'da' ? 'da-DK' : 'de-DE').format(kr(c)) + ' kr.';
function periodLabel(p) {
  if (p.kind === 'month') return `${String(p.idx).padStart(2, '0')}/${p.year}`;
  return t(p.kind === 'quarter' ? 'per_q' : 'per_h', p.idx, p.year);
}
function warnText(w) {
  const per = w.quarter ? t('per_q', ...w.quarter.split('/')) : w.from ? periodLabel(taxPeriodOf(w.from)) : '';
  return t('w_' + w.code, w.n ?? per, w.date ? dfmt(w.date) : '', w.days ?? '', w.amount != null ? (w.code.startsWith('oss') ? new Intl.NumberFormat(lang === 'da' ? 'da-DK' : 'de-DE').format(Math.round(w.amount / 100)) + ' €' : krFmt(w.amount)) : '', w.problems || '');
}
let taxPeriods = [];
const taxPeriodOf = (from) => taxPeriods.find((p) => p.from === from) || { kind: 'half', idx: 1, year: from.slice(0, 4) };
const W_LINK = { company_missing: '#/settings', bank_open: '#/bank', expense_drafts: '#/expenses', invoices_overdue: '#/invoices', no_receipt: '#/expenses' };
let taxYear = new Date().getFullYear();
let taxSel = null;

route(/^\/tax$/, async () => {
  const o = await api('tax_overview', { params: { year: taxYear } });
  taxPeriods = o.periods;
  const today0 = today();
  if (!taxSel || !o.periods.some((p) => p.from === taxSel)) {
    const pick = o.periods.find((p) => ['overdue', 'due'].includes(p.state)) || o.periods.find((p) => p.state === 'running') || o.periods[o.periods.length - 1];
    taxSel = pick.from;
  }
  const sel = o.periods.find((p) => p.from === taxSel);
  const SCOLT = { reported: 'var(--ok)', running: 'var(--info)', due: 'var(--warn)', overdue: 'var(--bad)', future: 'var(--muted)', none: 'var(--faint)' };
  const stTxt = (p) => p.state === 'due' ? t('ps_due', Math.max(0, Math.round((new Date(p.deadline) - new Date(today0)) / 864e5))) : t('ps_' + p.state);
  const repBox = h('div', { class: 'card' }, h('p', { class: 'muted' }, '…'));
  const th = o.thresholds;
  const bar = (label, val, max, fmt, note) => h('div', { class: 'thr' }, h('div', { class: 'thr-h' }, h('span', {}, label), h('b', {}, fmt(val) + ' / ' + fmt(max))),
    h('div', { class: 'thr-bar' }, h('i', { style: `width:${Math.min(100, Math.max(0, val / max * 100))}%;background:${val >= max ? 'var(--bad)' : val >= max * 0.8 ? 'var(--warn)' : 'var(--ok)'}` })), note ? h('small', { class: 'muted' }, note) : null);
  const eurFmt = (c) => new Intl.NumberFormat(lang === 'da' ? 'da-DK' : 'de-DE').format(Math.round(c / 100)) + ' €';
  const yearSel = h('select', { onchange: (e) => { taxYear = +e.target.value; taxSel = null; render(); } }, [0, 1, 2, 3, 4, 5].map((k) => { const y = new Date().getFullYear() - k; return h('option', { value: y, selected: y === taxYear }, y); }));
  const revYear = h('select', {}, [1, 0, 2, 3, 4, 5].map((k) => { const y = new Date().getFullYear() - k; return h('option', { value: y }, y); }));
  show(
    h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow' }, t('money_eyebrow')), h('h1', {}, t('tax_h1_a'), ' ', h('em', {}, t('tax_h1_b'))))),
    moneyTabs('/tax'),
    h('div', { class: 'card' }, h('h3', { style: 'margin-bottom:8px' }, t('todo_title')),
      o.warnings.length ? h('div', { class: 'warns' }, o.warnings.map((w) => {
        const inner = [h('span', { class: 'wi' }, w.level === 'bad' ? '⛔' : w.level === 'warn' ? '⚠' : 'ℹ'), h('span', {}, warnText(w))];
        if (w.code === 'backup') return h('a', { class: 'warn ' + w.level, href: `${BASE}api.php?a=backup` }, inner);
        if (w.from) return h('a', { class: 'warn ' + w.level, href: '#/tax', onclick: (e) => { e.preventDefault(); taxSel = w.from; render(); } }, inner);
        return W_LINK[w.code] ? h('a', { class: 'warn ' + w.level, href: W_LINK[w.code] }, inner) : h('div', { class: 'warn ' + w.level }, inner);
      })) : h('p', { class: 'ok-t' }, '✓ ' + t('todo_none'))),
    h('div', { class: 'card' }, h('div', { class: 'row', style: 'justify-content:space-between;margin-bottom:10px' }, h('h3', {}, t('periods_title', t('per_' + o.moms_period))), yearSel),
      h('div', { class: 'pers' }, o.periods.map((p) => h('button', { class: 'per' + (p.from === taxSel ? ' on' : ''), style: `--pc:${SCOLT[p.state]}`, onclick: () => { taxSel = p.from; render(); } },
        h('b', {}, periodLabel(p)), h('small', {}, `${t('deadline')} ${dfmt(p.deadline)}`), h('span', { class: 'pst' }, stTxt(p)))))),
    repBox,
    o.eu_quarters.length ? h('div', { class: 'card' }, h('h3', { style: 'margin-bottom:6px' }, t('eu_title')), h('p', { class: 'muted', style: 'margin:0 0 10px' }, t('eu_text')),
      o.eu_quarters.map((q) => h('div', { class: 'euq' },
        h('div', { class: 'row', style: 'justify-content:space-between' }, h('b', {}, t('per_q', q.idx, q.year)),
          q.reported_at ? pill('✓ ' + t('ps_reported'), 'var(--ok)') : h('button', { class: 'btn small primary', onclick: async () => { if (confirm(t('eu_mark_confirm'))) { await api('eu_sales_mark', { body: { from: q.from } }); render(); } } }, t('mark_reported'))),
        h('small', { class: 'muted' }, `${t('deadline')} ${dfmt(q.eu_deadline)}`),
        h('div', { class: 'tscroll' }, h('table', { class: 't' }, h('tr', {}, h('th', {}, t('vat_id')), h('th', {}, t('company')), h('th', { class: 'n' }, t('goods')), h('th', { class: 'n' }, t('services'))),
          q.sales.map((x) => h('tr', {}, h('td', {}, x.vat_id), h('td', {}, x.name), h('td', { class: 'n' }, krFmt(x.goods)), h('td', { class: 'n' }, krFmt(x.services))))))))) : null,
    h('div', { class: 'card' }, h('h3', { style: 'margin-bottom:10px' }, t('thr_title')),
      bar(t('thr_rev', taxYear), th.revenue_this, 30000000, krFmt, t('thr_rev_note')),
      bar(t('thr_rev', taxYear - 1), th.revenue_last, 30000000, krFmt),
      !me.company.moms_registered ? bar(t('thr_moms'), th.revenue_12m, 5000000, krFmt, t('thr_moms_note')) : null,
      bar(t('thr_oss'), th.oss_eur, 1000000, eurFmt, t('thr_oss_note'))),
    h('div', { class: 'card' }, h('h3', {}, t('rev_title')), h('p', { class: 'muted' }, t('rev_text')),
      h('div', { class: 'row' }, revYear, h('button', { class: 'btn primary', onclick: () => { location.href = `${BASE}api.php?a=revisor_zip&year=${revYear.value}`; } }, '⬇ ' + t('rev_download')))));

  // Momsangivelse des gewaehlten Zeitraums
  const { report: r, reported } = await api('tax_report', { params: { from: sel.from, to: sel.to } });
  const shown = reported ? reported.data : r;
  const F = [
    ['salgsmoms', 'f_salgsmoms'], ['moms_varekoeb_udland', 'f_varekoeb'], ['moms_ydelseskoeb_udland', 'f_ydelseskoeb'], ['koebsmoms', 'f_koebsmoms'],
    ['rubrik_a_varer', 'f_a_varer'], ['rubrik_a_ydelser', 'f_a_ydelser'], ['rubrik_b_varer', 'f_b_varer'], ['rubrik_b_ydelser', 'f_b_ydelser'], ['rubrik_c', 'f_c']];
  const copyBtn = (c) => h('button', { class: 'btn small', onclick: () => navigator.clipboard.writeText(String(kr(c))).then(() => toast(t('copied') + ': ' + kr(c))) }, '⧉');
  const fieldRow = ([k, label]) => h('div', { class: 'vrow' + (shown[k] ? '' : ' zero') }, h('div', {}, h('div', {}, t(label)), lang !== 'da' ? h('small', { class: 'muted' }, t(label + '_x')) : null), h('b', {}, krFmt(shown[k])), copyBtn(shown[k]));
  const changed = reported && (r.momstilsvar !== reported.momstilsvar);
  repBox.replaceChildren(...[
    h('div', { class: 'row', style: 'justify-content:space-between' }, h('h3', {}, t('report_title', periodLabel(sel))), pill(stTxt(sel), SCOLT[sel.state])),
    h('p', { class: 'muted', style: 'margin:4px 0 12px' }, `${dfmt(sel.from)} – ${dfmt(sel.to)} · ${t('deadline')} ${dfmt(sel.deadline)} · ${t('report_counts', r.invoices, r.expenses)}`),
    sel.state === 'running' ? h('p', { class: 'warn-t' }, t('report_running')) : null,
    r.drafts && !reported ? h('p', { class: 'warn-t' }, '⚠ ' + t('report_drafts', r.drafts)) : null,
    h('div', { class: 'vrows' }, F.slice(0, 4).map(fieldRow),
      h('div', { class: 'vrow total' }, h('div', {}, t(shown.momstilsvar < 0 ? 'f_tilsvar_neg' : 'f_tilsvar')), h('b', {}, krFmt(Math.abs(shown.momstilsvar))), copyBtn(shown.momstilsvar)),
      h('div', { class: 'sechead', style: 'margin-top:12px' }, t('rubrikker')), F.slice(4).map(fieldRow)),
    h('p', { class: 'muted', style: 'font-size:.82rem;margin:10px 0 0' }, t('report_hint')),
    shown.eu_sales && shown.eu_sales.length ? h('div', { style: 'margin-top:14px' }, h('div', { class: 'sechead' }, t('eu_sales_title')),
      h('div', { class: 'tscroll' }, h('table', { class: 't' }, h('tr', {}, h('th', {}, t('vat_id')), h('th', {}, t('company')), h('th', { class: 'n' }, t('goods')), h('th', { class: 'n' }, t('services'))),
        shown.eu_sales.map((x) => h('tr', {}, h('td', {}, x.vat_id), h('td', {}, x.name), h('td', { class: 'n' }, krFmt(x.goods)), h('td', { class: 'n' }, krFmt(x.services))))))) : null,
    reported ? h('div', { class: 'confok', style: 'margin-top:14px' }, h('b', {}, '✓ ' + t('reported_at', reported.reported_at.slice(0, 16), reported.reported_by)),
      changed ? h('span', { class: 'warn-t' }, t('reported_changed')) : null)
      : ['due', 'overdue'].includes(sel.state) ? h('div', { class: 'row end', style: 'margin-top:14px' }, h('button', { class: 'btn primary', onclick: async () => {
        if (!confirm(t('mark_confirm', periodLabel(sel), krFmt(r.momstilsvar)))) return;
        try { await api('vat_return_mark', { body: { from: sel.from, to: sel.to } }); }
        catch (e) {
          if (e.code !== 'period_drafts' || !confirm(t('mark_drafts_confirm'))) { toast(e.message); return; }
          await api('vat_return_mark', { body: { from: sel.from, to: sel.to, ignore_drafts: 1 } });
        }
        toast(t('saved')); render();
      } }, '✓ ' + t('mark_reported'))) : null].filter(Boolean));
});

// ---------- Einstellungen ----------
route(/^\/settings$/, async () => {
  const procRows = me.processes.map((p) => {
    const act = h('input', { type: 'checkbox', checked: +p.active, style: 'width:22px;min-height:0;height:22px' });
    const dpp = h('input', { type: 'number', min: 1, max: +p.per_order ? 600 : 60, inputmode: 'numeric', value: +p.default_pp || 10, style: 'width:76px', title: +p.per_order ? t('min_once') : t('min_per_piece') });
    return { p, act, dpp, row: h('tr', {}, h('td', {}, h('i', { class: 'dot', style: `--c:${p.color}` }), ' ' + pname(p)), h('td', {}, dpp, +p.per_order ? h('small', { class: 'muted' }, ' ' + t('min_once_short')) : null), h('td', {}, act)) };
  });
  const workerRows = me.workers.map((w) => {
    const color = h('input', { type: 'color', value: w.color, 'aria-label': t('color'), class: 'colorin' });
    const name = h('input', { value: w.name, maxlength: 40, placeholder: w.id === 1 ? t('owner_name') : t('worker_ph', w.id - 1) });
    const hrs = h('input', { type: 'text', inputmode: 'decimal', value: minToHours(w.day_min), style: 'width:70px', 'aria-label': t('hours_per_day') });
    return { w, color, name, hrs, row: h('div', { class: 'wrow' }, color, name, hrs, h('small', { class: 'muted' }, t('hours_unit') + '/' + t('day_short'))) };
  });
  const userRows = me.users.map((u) => {
    const name = h('input', { value: u.name }); const wid = h('input', { value: u.wf_admin_id || '', placeholder: 'wf_admin_id', style: 'width:110px' });
    const act = h('input', { type: 'checkbox', checked: +u.active, style: 'width:22px;min-height:0;height:22px' });
    return { u, name, wid, act, row: h('tr', {}, h('td', {}, name), h('td', {}, wid), h('td', {}, act)) };
  });
  const wk = h('input', { type: 'number', min: 0, max: 24, step: 0.5, value: me.settings.weekend_min / 60, style: 'width:100px' });
  const ds = h('input', { type: 'time', value: me.settings.day_start, style: 'width:130px' });
  const bf = h('input', { type: 'date', min: today() }); const bt = h('input', { type: 'date', min: today() }); const br = h('input', { type: 'text', maxlength: 100, placeholder: t('blocked_reason_ph') });
  const btf = h('input', { type: 'time', step: 900 }); const btt = h('input', { type: 'time', step: 900 });
  const blockedList = h('div', {}, me.blocked.length ? me.blocked.map((b) => h('div', { class: 'free' },
    h('span', {}, `${dfmt(b.date_from)}${b.date_to !== b.date_from ? ' – ' + dfmt(b.date_to) : ''}${b.time_from ? ' · ' + b.time_from + '–' + b.time_to : ' · ' + t('whole_day')}${b.reason ? ' · ' + b.reason : ''}`),
    h('button', { class: 'btn small danger', onclick: async () => { await api('blocked_delete', { body: { id: b.id } }); await reloadMe(); render(); } }, t('delete')))) : h('p', { class: 'muted' }, t('blocked_none')));
  // Firmendaten fuer Rechnungen
  const co = me.company;
  const CO = {};
  const coIn = (k, extra = {}) => { CO[k] = h('input', { type: 'text', value: co[k] ?? '', ...extra }); return h('div', {}, h('label', {}, t('co_' + k)), CO[k]); };
  CO.moms_registered = h('input', { type: 'checkbox', checked: !!co.moms_registered, style: 'width:22px;height:22px;min-height:0' });
  CO.moms_period = h('select', {}, ['half', 'quarter', 'month'].map((p) => h('option', { value: p, selected: co.moms_period === p }, t('per_' + p))));
  const coErr = h('div', { class: 'err' });
  const verifyOut = h('p', { class: 'muted', style: 'margin:8px 0 0' });
  const companyCard = h('div', { class: 'card' + (me.company_missing.length ? ' warnbox' : ''), id: 'company' }, h('h3', {}, t('company_title')), h('p', { class: 'muted' }, t('company_text')),
    h('div', { class: 'grid c2' }, coIn('name'), coIn('owner')),
    h('div', { class: 'grid c3' }, coIn('street'), coIn('zip', { inputmode: 'numeric' }), coIn('city')),
    h('div', { class: 'grid c3' }, coIn('cvr', { inputmode: 'numeric', maxlength: 8 }), coIn('phone', { type: 'tel' }), coIn('email', { type: 'email' })),
    coIn('web'),
    h('div', { class: 'grid c3', style: 'margin-top:10px' }, coIn('bank'), coIn('reg_no', { inputmode: 'numeric', maxlength: 4 }), coIn('account_no', { inputmode: 'numeric' })),
    h('div', { class: 'grid c2' }, coIn('iban'), coIn('bic')),
    h('label', { class: 'row', style: 'margin:12px 0 0;gap:8px;text-transform:none;letter-spacing:0;font-size:.95rem;color:var(--text)' }, CO.moms_registered, t('co_moms')),
    h('div', { class: 'grid c3', style: 'margin-top:10px' }, h('div', {}, h('label', {}, t('co_period')), CO.moms_period), coIn('pay_days', { inputmode: 'numeric' }), coIn('phone_share', { inputmode: 'numeric' })),
    h('div', { class: 'grid c3' },
      h('div', {}, coIn('invoice_start', { inputmode: 'numeric', disabled: me.invoices_final > 0 }), me.invoices_final > 0 ? h('small', { class: 'muted' }, t('co_start_locked')) : null)),
    coErr,
    h('div', { class: 'row end', style: 'margin-top:10px' },
      h('button', { class: 'btn', onclick: async () => { const r = await api('journal_verify'); verifyOut.textContent = r.ok ? t('verify_ok', r.invoices, r.entries) : t('verify_bad', r.problems.join(', ')); verifyOut.style.color = r.ok ? 'var(--ok)' : 'var(--bad)'; } }, t('verify')),
      h('button', { class: 'btn primary', onclick: async () => {
        coErr.textContent = '';
        try {
          const body = Object.fromEntries(Object.entries(CO).map(([k, el]) => [k, el.type === 'checkbox' ? el.checked : el.value]));
          await api('company_save', { body }); await reloadMe(); toast(t('saved')); render();
        } catch (e) { coErr.textContent = e.message; }
      } }, t('save'))), verifyOut);
  // Bedingungen fürs Angebot (je Sprache); leer = Standardtext
  const TA = {};
  const termsCard = h('div', { class: 'card' }, h('h3', {}, t('terms_title')), h('p', { class: 'muted' }, t('terms_text')),
    ['de', 'da', 'en'].map((l) => {
      TA[l] = h('textarea', { rows: 9, style: 'font-size:.85rem' }, me.company['terms_' + l] || me.terms_default[l]);
      return h('div', { style: 'margin-bottom:10px' }, h('div', { class: 'row', style: 'justify-content:space-between' }, h('label', {}, t('lang_' + l)),
        h('button', { type: 'button', class: 'btn small', onclick: () => { TA[l].value = me.terms_default[l]; } }, t('terms_reset'))), TA[l]);
    }),
    h('div', { class: 'row end' }, h('button', { class: 'btn primary', onclick: async () => {
      try {
        const body = { ...me.company };
        for (const l of ['de', 'da', 'en']) body['terms_' + l] = TA[l].value.trim() === me.terms_default[l].trim() ? '' : TA[l].value;
        await api('company_save', { body }); await reloadMe(); toast(t('saved'));
      } catch (e) { toast(e.message); }
    } }, t('save'))));
  // Archiv bei Dritten: Google Drive (Apps Script) oder E-Mail-Postfach
  const arDrive = h('input', { type: 'url', value: me.company.drive_url || '', placeholder: 'https://script.google.com/macros/s/…/exec' });
  const arTo = h('input', { type: 'email', value: me.company.archive_email || '', placeholder: 'wunschfabrik.archiv@gmail.com' });
  const arFrom = h('input', { type: 'email', value: me.company.archive_from || '', placeholder: me.company.email || 'info@wunsch-fabrik.dk' });
  const arState = h('div', { class: 'muted', style: 'font-size:.88rem;margin-top:8px' }, '…');
  const drawAr = (st) => arState.replaceChildren(...[
    st.mode ? h('div', {}, (st.open ? '⏳ ' : '✓ ') + t('ar_state_' + st.mode, st.sent, st.open, st.last_sent ? st.last_sent.slice(0, 16) : '—', st.last_backup ? dfmt(st.last_backup) : '—')) : h('div', { class: 'warn-t' }, '⚠ ' + t('ar_off')),
    st.failing ? h('div', { class: 'warn-t' }, '⚠ ' + t('ar_failing', st.failing, st.last_error)) : null].filter(Boolean));
  api('archive_status').then(drawAr).catch(() => {});
  const arRun = (body) => async () => { try { const r = await api('archive_run', { body }); drawAr(r.status); toast(t('ar_sent', r.sent)); } catch (e) { toast(e.message); } };
  const scriptBox = h('div', { class: 'hidden' });
  const showScript = async () => {
    if (!scriptBox.classList.contains('hidden')) { scriptBox.classList.add('hidden'); return; }
    const { script } = await api('drive_script');
    const ta = h('textarea', { readonly: true, rows: 10, style: 'font-family:monospace;font-size:.78rem' }, script);
    scriptBox.replaceChildren(ta, h('button', { class: 'btn small', style: 'margin-top:6px', onclick: async () => { try { await navigator.clipboard.writeText(script); } catch (e) { ta.select(); document.execCommand('copy'); } toast(t('copied')); } }, '📋 ' + t('ar_copy')));
    scriptBox.classList.remove('hidden');
  };
  const archiveCard = h('div', { class: 'card' + (me.company.drive_url || me.company.archive_email ? '' : ' warnbox') }, h('h3', {}, '🗄 ' + t('ar_title')), h('p', { class: 'muted' }, t('ar_text')),
    h('h4', { class: 'subh' }, t('ar_drive_h')),
    h('ol', { class: 'arsteps muted' }, ...[1, 2, 3, 4].map((n) => h('li', {}, t('ar_drive_s' + n)))),
    h('button', { class: 'btn small', onclick: showScript }, '</> ' + t('ar_script')), scriptBox,
    h('div', { style: 'margin-top:8px' }, h('label', {}, t('ar_drive_url')), arDrive),
    h('details', { style: 'margin-top:12px', open: !!(me.company.archive_email && !me.company.drive_url) }, h('summary', {}, t('ar_mail_h')),
      h('div', { class: 'grid c2', style: 'margin-top:8px' }, h('div', {}, h('label', {}, t('ar_to')), arTo), h('div', {}, h('label', {}, t('ar_from')), arFrom)),
      h('small', { class: 'muted hint' }, t('ar_from_hint'))),
    h('div', { class: 'row', style: 'margin-top:10px;flex-wrap:wrap' },
      h('button', { class: 'btn primary', onclick: async () => { try { await api('company_save', { body: { ...me.company, drive_url: arDrive.value.trim(), archive_email: arTo.value.trim(), archive_from: arFrom.value.trim() } }); await reloadMe(); toast(t('saved')); api('archive_status').then(drawAr); } catch (e) { toast(e.message); } } }, t('save')),
      h('button', { class: 'btn', onclick: async () => { try { const r = await api('archive_test', { body: {} }); toast(t('ar_test_ok_' + r.mode)); } catch (e) { toast(e.message); } } }, '✓ ' + t('ar_test')),
      h('button', { class: 'btn', onclick: arRun({ all: 1 }) }, '⟳ ' + t('ar_all')),
      h('button', { class: 'btn', onclick: arRun({ backup: 1 }) }, '💾 ' + t('ar_backup'))),
    arState);
  const themeCard = h('div', { class: 'card' }, h('h3', {}, '🎨 ' + t('theme_title')),
    h('div', { class: 'row', style: 'flex-wrap:wrap;gap:8px' }, ...[['light', '☀️ ' + t('theme_light')], ['dark', '🌙 ' + t('theme_dark')]].map(([k, l]) =>
      h('button', { class: 'btn' + (theme === k ? ' primary' : ''), onclick: () => { theme = k; try { localStorage.setItem('wf_theme', k); } catch (e) {} applyTheme(k); render(); } }, l))));
 // Automatisch versenden, auch wenn die App geschlossen ist (Zeitplan ruft cron.php auf)
  const cronBox = h('div', { style: 'margin-top:16px' });
  const drawCron = (c) => {
    const copy = (txt) => navigator.clipboard.writeText(txt).then(() => toast(t('copied')));
    const scr = h('textarea', { readonly: true, rows: 9, class: 'hidden', style: 'font-family:monospace;font-size:.75rem;margin-top:6px' }, c.script);
    cronBox.replaceChildren(h('div', { class: 'sechead' }, '⏰ ' + t('cron_title')),
      h('p', { class: 'muted', style: 'margin:4px 0 8px' }, t('cron_text')),
      h('p', { style: 'margin:0 0 8px;font-size:.9rem' }, c.last ? '✓ ' + t('cron_last', c.last.slice(0, 16)) : '⚠ ' + t('cron_never')),
      h('b', {}, t('cron_a')), h('ol', { class: 'arsteps muted' }, h('li', {}, t('cron_a1')), h('li', {}, t('cron_a2')), h('li', {}, t('cron_a3'))),
      h('div', { class: 'token-box' }, c.url),
      h('div', { class: 'row', style: 'margin:6px 0 12px;flex-wrap:wrap' }, h('button', { class: 'btn small', onclick: () => copy(c.url) }, '📋 ' + t('cron_copy_url')),
        h('button', { class: 'btn small danger', onclick: async () => { if (confirm(t('cron_renew_q'))) drawCron(await api('cron_info', { body: { renew: 1 } })); } }, t('cron_renew'))),
      h('b', {}, t('cron_b')), h('p', { class: 'muted', style: 'margin:4px 0 6px;font-size:.9rem' }, t('cron_b_text')),
      h('div', { class: 'row', style: 'flex-wrap:wrap' }, h('button', { class: 'btn small', onclick: () => scr.classList.toggle('hidden') }, '</> ' + t('ar_script')), h('button', { class: 'btn small', onclick: () => copy(c.script) }, '📋 ' + t('ar_copy'))), scr);
  };
  api('cron_info').then(drawCron).catch(() => {});
  // E-Mails an Kunden
  const mk = (k, def) => h('input', { type: 'checkbox', checked: me.company[k] === undefined ? def : !!me.company[k], style: 'width:22px;height:22px;min-height:0' });
  const mOffer = mk('mail_offer', true), mShip = mk('mail_shipped', false), mFu = mk('mail_followup', true);
  const revIn = h('input', { type: 'url', value: me.company.review_url || '', placeholder: 'https://g.page/r/…/review' });
  const ckRow = (cb, label, hint) => h('label', { class: 'row', style: 'gap:10px;align-items:flex-start;text-transform:none;letter-spacing:0;font-size:.95rem;color:var(--text);margin:8px 0' }, cb, h('span', {}, label, h('small', { class: 'muted', style: 'display:block' }, hint)));
  const mailCard = h('div', { class: 'card' }, h('h3', {}, '✉ ' + t('cm_title')), h('p', { class: 'muted', style: 'margin:0 0 6px' }, t('cm_text', me.company.email || '—')),
    ckRow(mOffer, t('cm_offer'), t('cm_offer_h')), ckRow(mShip, t('cm_ship'), t('cm_ship_h')), ckRow(mFu, t('cm_fu'), t('cm_fu_h')),
    h('div', {}, h('label', {}, t('cm_review')), revIn, h('small', { class: 'muted hint' }, t('cm_review_h'))),
    h('div', { class: 'row end', style: 'margin-top:10px' }, h('button', { class: 'btn primary', onclick: async () => { try { await api('company_save', { body: { ...me.company, mail_offer: mOffer.checked, mail_shipped: mShip.checked, mail_followup: mFu.checked, review_url: revIn.value.trim() } }); await reloadMe(); toast(t('saved')); } catch (e) { toast(e.message); } } }, t('save'))),
    cronBox);
  // Testphase: Rechnungen/Belege löschen und Nummern zurücksetzen, bis „Echtbetrieb starten“
  const twice = (msg, word) => { if (!confirm(msg)) return false; const v = prompt(t('cdel_type', word)); if (v === null) return false; if (v.trim().toUpperCase() !== word.toUpperCase()) { toast(t('cdel_wrong')); return false; } return true; };
  const testCard = me.live ? null : h('div', { class: 'card warnbox' }, h('h3', {}, '🧪 ' + t('test_title')), h('p', { class: 'muted' }, t('test_text')),
    h('div', { class: 'row', style: 'flex-wrap:wrap' },
      h('button', { class: 'btn danger', onclick: async () => {
        if (!twice(t('reset_confirm'), t('cdel_word'))) return;
        try { const r = await api('accounting_reset', { body: { confirm: 'RESET' } }); toast(t('reset_done', r.invoices, r.expenses)); await reloadMe(); render(); } catch (e) { toast(e.message); }
      } }, '↺ ' + t('reset_btn')),
      h('button', { class: 'btn primary', onclick: async () => {
        if (!twice(t('live_confirm'), t('live_word'))) return;
        try { await api('go_live', { body: { confirm: 'LIVE' } }); toast(t('live_done')); await reloadMe(); render(); } catch (e) { toast(e.message); }
      } }, '🚀 ' + t('live_btn'))));
  const aiIn = h('input', { type: 'password', autocomplete: 'off', placeholder: me.ai_enabled ? '••••••••••••' : 'sk-ant-…' });
  const aiCard = h('div', { class: 'card' }, h('h3', {}, '✨ ' + t('ai_title')), h('p', { class: 'muted' }, t('ai_text')),
    h('p', { style: 'margin:0 0 8px' }, me.ai_enabled ? '✓ ' + t('ai_on') : t('ai_off')),
    h('div', { class: 'row' }, aiIn, h('button', { class: 'btn primary', onclick: async () => { try { await api('ai_key_save', { body: { key: aiIn.value } }); await reloadMe(); toast(t('saved')); render(); } catch (x) { toast(x.message); } } }, t('save')),
      me.ai_enabled ? h('button', { class: 'btn danger', onclick: async () => { await api('ai_key_save', { body: { key: '' } }); await reloadMe(); render(); } }, t('delete')) : null));
  const tokOut = h('div');
  const tokList = h('div', {}, me.tokens.map((k) => h('div', { class: 'free' }, h('span', {}, `${k.label} · ${k.created_at.slice(0, 10)}${k.last_used_at ? ' · ' + t('last_seen') + ' ' + k.last_used_at.slice(0, 16) : ''}`),
    k.revoked_at ? h('span', { class: 'muted' }, t('revoked')) : h('button', { class: 'btn small danger', onclick: async () => { if (confirm(t('confirm_revoke'))) { await api('token_revoke', { body: { id: k.id } }); await reloadMe(); render(); } } }, t('revoke')))));
  show(
    h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow' }, t('nav_settings')), h('h1', {}, t('settings_h1_a'), ' ', h('em', {}, t('settings_h1_b'))))),
    testCard,
    themeCard,
    companyCard,
    mailCard,
    archiveCard,
    termsCard,
    aiCard,
    h('div', { class: 'card' }, h('h3', {}, t('display_title')), h('p', { class: 'muted' }, t('display_text')),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: async () => {
        const r = await api('token_create', { body: { label: t('display_label') } });
        const url = new URL(`${BASE}werkstatt/?t=${r.token}`, location.href).href;
        tokOut.replaceChildren(h('p', { class: 'muted' }, t('display_once')), h('div', { class: 'token-box' }, url), h('div', { class: 'row', style: 'margin-top:8px' }, h('button', { class: 'btn small', onclick: () => navigator.clipboard.writeText(url).then(() => toast(t('copied'))) }, t('copy')), h('a', { class: 'btn small', href: url, target: '_blank', rel: 'noopener' }, t('open'))));
        await reloadMe();
      } }, t('create_link'))), tokOut, h('div', { style: 'margin-top:12px' }, tokList)),
    h('div', { class: 'card' }, h('h3', {}, t('workers_title')), h('p', { class: 'muted' }, t('workers_text')),
      workerRows.map((r) => r.row),
      h('div', { class: 'row end', style: 'margin-top:10px' }, h('button', { class: 'btn primary', onclick: async () => {
        try { await api('workers_save', { body: { workers: workerRows.map((r) => ({ id: r.w.id, name: r.name.value, color: r.color.value, day_min: hoursToMin(r.hrs.value) })) } }); await reloadMe(); render(); toast(t('saved')); } catch (e) { toast(e.message); }
      } }, t('save')))),
    h('div', { class: 'card' }, h('h3', {}, t('blocked_title')), h('p', { class: 'muted' }, t('blocked_text')),
      h('div', { class: 'grid c3' }, h('div', {}, h('label', {}, t('blocked_from')), bf), h('div', {}, h('label', {}, t('blocked_to')), bt), h('div', {}, h('label', {}, t('blocked_reason')), br)),
      h('div', { class: 'grid c2', style: 'margin-top:10px' }, h('div', {}, h('label', {}, t('time_from')), btf), h('div', {}, h('label', {}, t('time_to')), btt)),
      h('p', { class: 'muted', style: 'font-size:.85rem;margin:6px 0 0' }, t('time_hint')),
      h('div', { class: 'row end', style: 'margin:10px 0' }, h('button', { class: 'btn primary', onclick: async () => {
        try { await api('blocked_save', { body: { date_from: bf.value, date_to: bt.value || bf.value, reason: br.value, time_from: btf.value, time_to: btt.value } }); await reloadMe(); render(); } catch (e) { toast(e.message); }
      } }, '+ ' + t('blocked_add'))), blockedList),
    h('div', { class: 'card' }, h('h3', {}, t('capacity')), h('p', { class: 'muted' }, t('capacity_text')),
      h('div', { class: 'row', style: 'margin-bottom:12px' }, h('label', { style: 'margin:0' }, t('weekend_hours')), wk, h('span', { class: 'muted' }, 'h')),
      h('div', { class: 'row', style: 'margin-bottom:12px' }, h('label', { style: 'margin:0' }, t('day_start')), ds, h('span', { class: 'muted', style: 'font-size:.85rem' }, t('day_start_hint'))),
      h('div', { class: 'tscroll' }, h('table', { class: 't' }, h('tr', {}, h('th', {}, t('process')), h('th', {}, t('default_pp')), h('th', {}, t('active'))), procRows.map((r) => r.row))),
      h('div', { class: 'row end', style: 'margin-top:10px' }, h('button', { class: 'btn primary', onclick: async () => { await api('processes_save', { body: { processes: procRows.map((r) => ({ id: r.p.id, capacity_min: r.p.capacity_min, active: r.act.checked, default_pp: r.dpp.value })) } }); await api('settings_save', { body: { weekend_min: Math.round((parseFloat(wk.value) || 0) * 60), day_start: ds.value || '08:00' } }); await reloadMe(); toast(t('saved')); } }, t('save')))),
    h('div', { class: 'card' }, h('h3', {}, t('users')), h('p', { class: 'muted' }, t('users_text', me.user.name)),
      h('div', { class: 'tscroll' }, h('table', { class: 't' }, h('tr', {}, h('th', {}, t('name')), h('th', {}, 'Admin-ID'), h('th', {}, t('active'))), userRows.map((r) => r.row))),
      h('div', { class: 'row end', style: 'margin-top:10px' }, h('button', { class: 'btn primary', onclick: async () => { try { await api('users_save', { body: { users: userRows.map((r) => ({ id: r.u.id, name: r.name.value, wf_admin_id: r.wid.value, active: r.act.checked })) } }); await reloadMe(); toast(t('saved')); } catch (e) { toast(e.message); } } }, t('save')))),
    h('p', { class: 'muted', style: 'text-align:center;font-size:.8rem' }, 'Version ' + APP_VERSION),
    h('div', { class: 'card' }, h('h3', {}, t('data')), h('div', { class: 'row' },
      h('a', { class: 'btn', href: `${BASE}api.php?a=backup` }, t('backup')),
      h('button', { class: 'btn', onclick: async () => { const r = await api('purge', { body: {} }); toast(t('purged', r.purged)); } }, t('purge')))));
});

async function reloadMe() { me = await api('me'); }

// ---------- Start ----------
function buildChrome() {
  const nav = $('#nav');
  const item = (r, ic, label, cls, short) => h('a', { href: '#' + r, 'data-r': r, class: cls || '' }, cls === 'add' ? h('span', { class: 'fab' }, icon(ic)) : icon(ic), cls === 'add' ? h('small', {}, label) : h('span', { 'data-s': short || label }, label));
  nav.replaceChildren(item('/', 'list', t('nav_orders')), item('/calendar', 'cal', t('nav_calendar')), item('/new', 'plus', t('new_order'), 'add'), item('/customers', 'users', t('nav_customers')), item('/products', 'tag', t('tab_products'), '', t('nav_products_s')), item('/invoices', 'doc', t('nav_invoices'), '', t('nav_invoices_s')), item('/settings', 'cog', t('nav_settings'), '', t('nav_settings_s')));
  const l = $('#lang');
  l.replaceChildren(...[['de', '🇩🇪'], ['da', '🇩🇰']].map(([c, f]) => h('button', { class: lang === c ? 'on' : '', 'aria-label': c, onclick: () => { lang = c; try { localStorage.setItem('wf_lang', c); } catch (e) {} document.documentElement.lang = c; buildChrome(); render(); } }, f)));
  $('#who').textContent = me ? me.user.name : '';
}

(async () => {
  document.documentElement.lang = lang;
  try { me = await api('me'); } catch (e) { return; }
  const qNote = new URLSearchParams(location.search).get('note');
  if (qNote) history.replaceState(null, '', location.pathname + '#/new?note=' + encodeURIComponent(qNote));
  buildChrome();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register(`${BASE}sw.js`).catch(() => {});
  render();
})();
})();
