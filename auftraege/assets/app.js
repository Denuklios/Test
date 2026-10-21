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
  view().replaceChildren(
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
  const rest = o.price - o.deposit;
  const wk = workerById(o.worker_id);
  const dayMin = wk ? wk.day_min : 480;
  view().replaceChildren(
    h('a', { href: '#/', class: 'muted' }, '← ' + t('nav_orders')),
    h('div', { class: 'page-head', style: 'margin-top:8px' }, h('div', {}, h('div', { class: 'eyebrow' }, o.nr), h('h1', {}, o.title), h('div', { class: 'muted' }, h('a', { href: `#/customer/${o.customer_id}` }, o.customer_name + (o.customer_company ? ' · ' + o.customer_company : '')))),
      h('div', { class: 'row' }, o.deleted_at ? h('button', { class: 'btn', onclick: async () => { await api('order_restore', { body: { id: o.id } }); reload(); } }, t('restore')) : [
        h('a', { class: 'btn', href: `#/order/${o.id}/edit` }, t('edit')),
        h('button', { class: 'btn danger', onclick: async () => { if (confirm(t('confirm_delete'))) { await api('order_delete', { body: { id: o.id } }); location.hash = '#/'; } } }, t('delete'))])),
    h('div', { class: 'card' }, steps,
      h('dl', { class: 'kv', style: 'margin-top:14px' },
        h('dt', {}, t('due')), h('dd', { class: late ? 'due late' : '' }, (late ? '⚠ ' : '') + dfmt(o.due_date)),
        h('dt', {}, t('article')), h('dd', {}, `${o.article || '—'} · ${o.qty} ${t('pcs')}`),
        h('dt', {}, t('processes')), h('dd', {}, h('div', { class: 'row' }, o.processes.length ? o.processes.map((p) => { const pr = procById(p.process_id); return h('span', { class: 'chip', style: `--c:${pr.color}` }, h('i', { class: 'dot', style: `--c:${pr.color}` }), `${pname(pr)}${p.minutes ? ' · ' + hm(p.minutes) : ''}`); }) : '—')),
        h('dt', {}, t('total_time')), h('dd', {}, o.total_min ? `${hm(o.total_min)} · ${Math.round(o.total_min / dayMin * 100)} % ${t('of_a_day')}` : '—'),
        h('dt', {}, t('worker')), h('dd', {}, wchip(wk)),
        h('dt', {}, t('production')), h('dd', {}, o.days.length ? h('div', {}, o.days.map((d) => h('div', {}, `${dfmt(d.date)} · ${d.start}–${d.end}`)), o.finish_date ? h('small', { class: 'muted' }, `${t('finish')}: ${dfmt(o.finish_date)}`) : null) : '—'),
        h('dt', {}, t('price')), h('dd', {}, `${money(o.price, o.currency)} · ${t('deposit')} ${money(o.deposit, o.currency)} · ${t('remaining')} ${money(rest, o.currency)}`),
        h('dt', {}, t('payment')), h('dd', {}, paySel))),
    (o.description || o.notes) && h('div', { class: 'card' }, o.description && h('p', { style: 'margin:0 0 8px;white-space:pre-wrap' }, o.description), o.notes && h('p', { class: 'muted', style: 'margin:0;white-space:pre-wrap' }, o.notes)),
    h('div', { class: 'card' }, h('h3', { style: 'margin-bottom:10px' }, t('files')),
      photoButtons(async (list) => { await uploadFiles(o.id, list); reload(); }),
      h('div', { class: 'files' }, o.files.map((f) => h('div', { class: 'file' },
        h('a', { href: `${BASE}file.php?id=${f.id}`, target: '_blank', rel: 'noopener' }, f.mime.startsWith('image/') ? h('img', { src: thumbUrl(f.id), alt: f.original_name, loading: 'lazy' }) : h('div', { class: 'pdf' }, 'PDF')),
        h('div', { class: 'n' }, h('span', { style: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, f.original_name), h('a', { href: '#', title: t('delete'), onclick: async (e) => { e.preventDefault(); if (confirm(t('confirm_delete_file'))) { await api('file_delete', { body: { id: f.id } }); reload(); } } }, '✕')))))),
    h('div', { class: 'card' }, h('h3', {}, t('history')), h('ul', { class: 'log' }, o.log.map((l) => h('li', {}, `${l.at.slice(0, 16)} · ${l.user_name} · ${logText(l.what)}`)))));
});
function logText(w) {
  if (w.startsWith('status:')) return t('log_status') + ' ' + t('st_' + w.slice(7));
  if (w.startsWith('pay:')) return t('log_pay') + ' ' + t('pay_' + w.slice(4));
  if (w.startsWith('file:')) return t('log_file') + ' ' + w.slice(5);
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
route(/^\/new\/customer\/(\d+)$/, (cid) => orderForm(null, +cid));
route(/^\/order\/(\d+)\/edit$/, async (id) => orderForm((await api('order', { params: { id } })).order));

async function orderForm(o, presetCustomer) {
  const isNew = !o;
  const D = o || { id: 0, customer_id: presetCustomer || 0, title: '', description: '', article: '', qty: 1, price: 0, deposit: 0, currency: 'DKK', pay_status: 'open', status: 'inquiry', due_date: '', plan_date: '', start_time: '', finish_date: '', worker_id: 1, notes: '', processes: [], files: [] };
  let cust = null;
  if (D.customer_id) cust = (await api('customer', { params: { id: D.customer_id } })).customer;
  if (isNew && cust) D.currency = cust.currency;
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

  // --- Person (nur sichtbar, wenn es Mitarbeiter gibt)
  let wid = workerById(D.worker_id) && workerById(D.worker_id).active ? +D.worker_id : 1;
  const workerRow = h('div', { class: 'row' });
  const drawWorkers = () => workerRow.replaceChildren(...activeWorkers().map((w) => h('button', { type: 'button', class: 'wbtn' + (w.id === wid ? ' on' : ''), style: `--wc:${w.color}`, onclick: () => {
    if (wid === w.id) return;
    wid = w.id; drawWorkers(); S.start = ''; planPicker.value = ''; updateSummary(); refreshPlan(true);
  } }, h('i'), w.name)));

  // --- Verfahren mit geschaetzter Dauer (Stunden); die Gesamtdauer rechnet die App selbst
  const S = { start: D.start_time || '' };                       // gewaehlte Uhrzeit ('' = automatisch frueheste)
  const sel = new Map(D.processes.map((p) => [+p.process_id, +p.minutes]));
  const procBox = h('div', { class: 'procs' }, me.processes.filter((p) => +p.active).map((p) => {
    const cb = h('input', { type: 'checkbox', checked: sel.has(+p.id) });
    const hrs = h('input', { type: 'text', inputmode: 'decimal', value: minToHours(sel.get(+p.id) ?? 60), 'aria-label': t('hours') });
    const row = h('label', { class: 'proc' + (cb.checked ? ' on' : ''), style: `--c:${p.color};text-transform:none;letter-spacing:0;font-size:1rem;color:inherit;margin:0` }, cb, h('span', {}, pname(p)), hrs, h('small', { class: 'muted' }, t('hours_unit')));
    const changed = () => { S.start = ''; updateSummary(); clearTimeout(rt); rt = setTimeout(() => refreshPlan(!planPicker.value), 350); };
    cb.addEventListener('change', () => { row.classList.toggle('on', cb.checked); changed(); });
    hrs.addEventListener('input', changed);
    row._min = () => (cb.checked ? hoursToMin(hrs.value) : 0);
    row._get = () => (cb.checked ? { process_id: +p.id, minutes: hoursToMin(hrs.value) } : null);
    return row;
  }));
  let rt;
  const totalMin = () => [...procBox.children].reduce((s_, r) => s_ + r._min(), 0);
  const sumBox = h('div', { class: 'sumbox' });
  function updateSummary() {
    const tm = totalMin();
    const dm = (workerById(wid) || { day_min: 480 }).day_min || 480;
    if (!tm) { sumBox.replaceChildren(h('span', { class: 'muted' }, t('sum_hint'))); return; }
    const pct = Math.round(tm / dm * 100);
    const days = Math.round(tm / dm * 10) / 10;
    sumBox.replaceChildren(
      h('div', { class: 'sumline' }, h('b', {}, hm(tm)), h('span', { class: 'muted' }, ` · ${pct} % ${t('of_a_day')}${tm > dm ? ` (≈ ${String(days).replace('.', ',')} ${t('work_days')})` : ''}`)),
      h('div', { class: 'meter' + (pct > 100 ? ' over' : '') }, h('i', { style: `width:${Math.min(100, pct)}%` })));
  }

  // --- Produktionstag: Vorschlaege oben, danach Tageswahl, Uhrzeit, Abgabetermin
  let finish = D.finish_date || '';
  let dueTouched = !isNew;
  let dueAuto = false;
  const planPicker = dayPicker(D.plan_date, async () => {
    const total = totalMin();
    if (!total) throw new Error(t('err_no_duration'));
    const r = await api('plan_options', { params: { worker_id: wid, total, limit: 200, exclude: D.id || 0 } });
    return { dates: r.options.map((x) => x.start_date) };
  });
  let dueMin = '';
  const duePicker = dayPicker(D.due_date, () => api('due_days', { params: { from: dueMin || (finish ? addDays(finish, 1) : today()) } }));
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
    previewBox.replaceChildren(...r.chunks.map((c) => h('div', {}, `${dfmt(c.date)} · ${c.start}–${c.end}`)), h('small', { class: 'muted' }, `${t('finish')}: ${dfmt(r.finish)} ${r.finish_time} · ${t('due_earliest')}: ${dfmt(r.due_min)}`));
    previewBox.classList.remove('hidden');
    timeBtn.textContent = `🕘 ${r.start}${S.start ? '' : ' (' + t('automatic') + ')'} · ${t('change')}`;
    timeBtn.classList.remove('hidden'); timeBtn.classList.toggle('set', !!S.start);
    // Abgabetermin mindestens einen Tag nach dem Produktionsende
    if (!duePicker.value ? !dueTouched : duePicker.value < r.due_min) {
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

  // --- Weitere Angaben
  const more = h('div', { class: 'grid' });
  const payRow = h('div', { class: 'grid c3' },
    field('price', t('price'), inp('price', 'number', { step: '0.01', min: 0, inputmode: 'decimal' })),
    field('currency', t('currency'), h('select', {}, me.currencies.map((c) => h('option', { value: c, selected: c === D.currency }, c)))),
    field('pay_status', t('payment'), h('select', {}, me.pay.map((p) => h('option', { value: p, selected: p === D.pay_status }, t('pay_' + p))))));
  more.append(
    field('article', t('article'), inp('article')),
    field('status', t('status'), h('select', {}, me.statuses.map((s_) => h('option', { value: s_, selected: s_ === D.status }, t('st_' + s_))))),
    payRow, field('deposit', t('deposit'), inp('deposit', 'number', { step: '0.01', min: 0, inputmode: 'decimal' })),
    field('description', t('description'), h('textarea', {}, D.description)),
    field('notes', t('notes'), h('textarea', {}, D.notes)));
  const moreCard = h('div', { class: 'card hidden' }, more);
  const moreBtn = h('button', { class: 'btn', type: 'button', onclick: () => { moreCard.classList.toggle('hidden'); moreBtn.textContent = moreCard.classList.contains('hidden') ? t('more_details') : t('less_details'); } }, t('more_details'));

  const save = async (btn) => {
    err.textContent = '';
    if (!D.customer_id) { err.textContent = t('err_bad_customer'); return; }
    const body = { id: D.id, customer_id: D.customer_id, worker_id: wid, title: F.title.value, qty: F.qty.value,
      due_date: duePicker.value, plan_date: planPicker.value, start_time: S.start, processes: [...procBox.children].map((r) => r._get()).filter(Boolean) };
    for (const k of ['article', 'price', 'currency', 'pay_status', 'deposit', 'description', 'notes', 'status']) body[k] = F[k].value;
    if (body.pay_status === 'paid' && !body.deposit) body.deposit = body.price;
    btn.disabled = true;
    try {
      const r = await api('order_save', { body });
      if (pending.length) { toast(t('uploading_files')); await uploadFiles(r.order.id, pending); }
      toast(t('saved'));
      location.hash = `#/order/${r.order.id}`;
    } catch (e) { err.textContent = e.message; btn.scrollIntoView({ block: 'center' }); } finally { btn.disabled = false; }
  };
  const btn = h('button', { class: 'btn primary', onclick: (e) => save(e.currentTarget) }, t('save'));
  const sec = (title, ...kids) => h('div', { class: 'card grid' }, h('h3', { class: 'sechead' }, title), ...kids);
  view().replaceChildren(
    h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow' }, isNew ? t('new_order') : D.nr), h('h1', {}, isNew ? t('capture_a') : t('edit'), ' ', isNew && h('em', {}, t('capture_b'))))),
    sec(t('form_order'),
      h('div', {}, h('label', {}, t('customer')), custBox),
      field('title', t('title'), inp('title', 'text', { placeholder: t('title_ph'), maxlength: 200 })),
      field('qty', t('qty'), inp('qty', 'number', { min: 1, inputmode: 'numeric' }))),
    sec(t('form_what'),
      h('p', { class: 'muted', style: 'margin:0;font-size:.9rem' }, t('what_hint')),
      procBox, sumBox,
      activeWorkers().length > 1 ? h('div', {}, h('label', {}, t('worker')), workerRow) : null),
    sec(t('form_when'),
      h('div', {}, h('label', {}, t('suggested_days')), optsBox),
      h('div', {}, h('label', {}, t('plan_date')), planPicker),
      previewBox, timeBtn,
      h('div', {}, h('label', {}, t('due')), duePicker)),
    sec(t('files'), photoButtons((list) => { pending.push(...list); drawThumbs(); }), thumbs,
      isNew ? null : h('div', { class: 'files' }, (D.files || []).map((f) => h('div', { class: 'file' }, f.mime.startsWith('image/') ? h('img', { src: thumbUrl(f.id), alt: f.original_name, loading: 'lazy' }) : h('div', { class: 'pdf' }, 'PDF'), h('div', { class: 'n' }, h('span', { style: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, f.original_name)))))),
    moreBtn, moreCard,
    err,
    h('div', { class: 'formbar' }, h('a', { class: 'btn', href: isNew ? '#/' : `#/order/${D.id}` }, t('cancel')), btn));
  drawWorkers(); updateSummary(); refreshPlan(isNew);
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
    !isNew && h('div', { class: 'card' }, h('h3', {}, t('history')), c.orders.length ? h('div', { class: 'tscroll' }, h('table', { class: 't' }, c.orders.map((o) => h('tr', {}, h('td', {}, h('a', { href: `#/order/${o.id}` }, o.nr)), h('td', {}, o.title), h('td', {}, dfmt(o.due_date)), h('td', {}, statusPill(o.status)), h('td', {}, payPill(o.pay_status)), h('td', {}, money(o.price, o.currency)))))) : h('p', { class: 'muted' }, t('no_orders'))),
    !isNew && h('div', { class: 'card' }, h('h3', {}, t('privacy')), h('p', { class: 'muted' }, t('privacy_text')),
      h('div', { class: 'row' }, h('a', { class: 'btn small', href: `${BASE}api.php?a=customer_export&id=${c.id}` }, t('export_data')),
        h('button', { class: 'btn small danger', onclick: async () => { if (confirm(t('confirm_anonymize'))) { await api('customer_anonymize', { body: { id: c.id } }); location.hash = '#/customers'; } } }, t('anonymize')))));
});

// ---------- Kalender ----------
let calStart = null;
let calView = null;
try { calView = localStorage.getItem('wf_calview'); } catch (e) { /* Speicher gesperrt */ }
// Ein Balken = ein eingeplanter Block: Uhrzeit, Verfahren, Auftrag, Kunde, Person und ein kleines Foto (wenn vorhanden)
function calBar(i, big) {
  const w = workerById(i.worker_id);
  const more = i.finish_date && i.finish_date > i.date ? ' →' : '';
  return h('a', { class: 'cbar' + (big ? ' big' : ''), href: `#/order/${i.id}`, style: `--wc:${w ? w.color : 'var(--p2)'}`, title: `${i.nr} · ${i.title} · ${i.customer_name}`, onclick: (e) => e.stopPropagation() },
    h('span', { class: 'tx' },
      h('span', { class: 'l1' }, h('b', {}, `${i.start_time}–${i.end}`), more, big ? ' ' + i.title : ''),
      h('span', { class: 'l2' }, big ? `${i.customer_name} · ${procNames(i.process_ids, 3)}` : `${procNames(i.process_ids, 2)} · ${i.customer_name}`),
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
  view().replaceChildren(
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

// ---------- Einstellungen ----------
route(/^\/settings$/, async () => {
  const procRows = me.processes.map((p) => {
    const act = h('input', { type: 'checkbox', checked: +p.active, style: 'width:22px;min-height:0;height:22px' });
    return { p, act, row: h('tr', {}, h('td', {}, h('i', { class: 'dot', style: `--c:${p.color}` }), ' ' + pname(p)), h('td', {}, act)) };
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
      h('div', { class: 'tscroll' }, h('table', { class: 't' }, h('tr', {}, h('th', {}, t('process')), h('th', {}, t('active'))), procRows.map((r) => r.row))),
      h('div', { class: 'row end', style: 'margin-top:10px' }, h('button', { class: 'btn primary', onclick: async () => { await api('processes_save', { body: { processes: procRows.map((r) => ({ id: r.p.id, capacity_min: r.p.capacity_min, active: r.act.checked })) } }); await api('settings_save', { body: { weekend_min: Math.round((parseFloat(wk.value) || 0) * 60), day_start: ds.value || '08:00' } }); await reloadMe(); toast(t('saved')); } }, t('save')))),
    h('div', { class: 'card' }, h('h3', {}, t('users')), h('p', { class: 'muted' }, t('users_text', me.user.name)),
      h('div', { class: 'tscroll' }, h('table', { class: 't' }, h('tr', {}, h('th', {}, t('name')), h('th', {}, 'Admin-ID'), h('th', {}, t('active'))), userRows.map((r) => r.row))),
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
