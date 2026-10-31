/* Wunsch-Fabrik Werkstatt – Handy-App (läuft in der Android-App, spricht mit api.php über den App-Schlüssel). */
(() => {
'use strict';
const APP_VERSION = '1.0.0';

// ---------- Speicher & Sprache ----------
const store = {
  get: (k, d = null) => { try { const v = localStorage.getItem('wf_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set: (k, v) => { try { localStorage.setItem('wf_' + k, JSON.stringify(v)); } catch (e) { /* voll */ } },
  del: (k) => { try { localStorage.removeItem('wf_' + k); } catch (e) { /* egal */ } },
};
let lang = store.get('lang') || ((navigator.language || 'de').startsWith('da') ? 'da' : 'de');
const XT = {
  de: {
    a_pair_h: 'Handy-App verbinden', a_pair_text: 'Im Büro: Einstellungen → „Handy-App“ → Person anlegen. Dort steht ein Code (15 Minuten gültig). Den hier eintragen.',
    a_server: 'Adresse der Auftrags-App', a_code: 'Code', a_connect: 'Verbinden', a_connected: 'Verbunden als {0}', a_pair_bad: 'Code falsch oder abgelaufen – im Büro einen neuen erzeugen.',
    a_orders: 'Aufträge', a_new: 'Neu', a_receipt: 'Beleg', a_more: 'Mehr', a_offline: 'Offline – zuletzt geladener Stand von {0}', a_reload: 'Neu laden',
    a_photo: 'Foto aufnehmen', a_gallery: 'Aus Galerie', a_photos: 'Fotos & Vorlagen', a_call: 'Anrufen', a_mail: 'E-Mail', a_items: 'Produkte', a_history: 'Verlauf',
    a_receipt_h: 'Beleg fotografieren', a_receipt_text: 'Kassenbon oder Rechnung fotografieren. Der Beleg wird gerade gezogen, zugeschnitten und als Entwurf gespeichert – gebucht wird im Büro.',
    a_receipt_done: 'Beleg gespeichert (Entwurf).', a_logout: 'App abmelden', a_logout_q: 'Diese App abmelden? Danach brauchst du einen neuen Code aus dem Büro.',
    a_account: 'Konto', a_language: 'Sprache', a_version: 'App-Version {0} · Server {1}', a_customer_new: '+ Neuer Kunde', a_customer_pick: 'Kunde suchen …',
    a_free_item: '+ Freie Position', a_catalog: 'Aus Katalog', a_save_order: 'Auftrag anlegen', a_created: 'Auftrag {0} angelegt', a_due: 'Abgabetermin', a_notes: 'Notizen',
    a_title: 'Titel', a_sum: 'Summe', a_no_items: 'Noch kein Produkt – aus dem Katalog wählen oder freie Position.', a_sizes: 'Menge je Größe', a_uploading: 'Wird hochgeladen …',
    a_forbidden: 'Dafür hat die App keine Berechtigung – bitte im Büro erledigen.', a_logged_out: 'Die App wurde im Büro abgemeldet. Bitte neu verbinden.', a_status: 'Status',
    a_pickup: 'Abgeholt', a_ship: 'Verschickt', a_carrier: 'Versanddienst', a_trackno: 'Sendungsnummer', a_save: 'Speichern', a_search: 'Suchen …', a_all: 'Alle',
    a_open_web: 'Im Browser öffnen', a_phone: 'Telefon', a_email: 'E-Mail', a_name: 'Name', a_company: 'Firma (optional)', a_business: 'Firma', a_country: 'Land',
    a_too_many: 'Zu viele Versuche – bitte 10 Minuten warten.', a_update: 'Neue App-Version {0} verfügbar', a_update_btn: 'Herunterladen',
  },
  da: {
    a_pair_h: 'Forbind mobil-appen', a_pair_text: 'På kontoret: Indstillinger → „Mobil-app“ → opret person. Der står en kode (gyldig i 15 minutter). Indtast den her.',
    a_server: 'Adresse til ordre-appen', a_code: 'Kode', a_connect: 'Forbind', a_connected: 'Forbundet som {0}', a_pair_bad: 'Forkert eller udløbet kode – lav en ny på kontoret.',
    a_orders: 'Ordrer', a_new: 'Ny', a_receipt: 'Bilag', a_more: 'Mere', a_offline: 'Offline – senest hentet {0}', a_reload: 'Genindlæs',
    a_photo: 'Tag foto', a_gallery: 'Fra galleri', a_photos: 'Fotos & skabeloner', a_call: 'Ring op', a_mail: 'E-mail', a_items: 'Produkter', a_history: 'Historik',
    a_receipt_h: 'Fotografér bilag', a_receipt_text: 'Fotografér kvittering eller faktura. Bilaget rettes op, beskæres og gemmes som kladde – bogføres på kontoret.',
    a_receipt_done: 'Bilag gemt (kladde).', a_logout: 'Log appen ud', a_logout_q: 'Log denne app ud? Derefter skal du have en ny kode fra kontoret.',
    a_account: 'Konto', a_language: 'Sprog', a_version: 'App-version {0} · server {1}', a_customer_new: '+ Ny kunde', a_customer_pick: 'Søg kunde …',
    a_free_item: '+ Fri linje', a_catalog: 'Fra katalog', a_save_order: 'Opret ordre', a_created: 'Ordre {0} oprettet', a_due: 'Afleveringsdato', a_notes: 'Noter',
    a_title: 'Titel', a_sum: 'Sum', a_no_items: 'Intet produkt endnu – vælg fra katalog eller fri linje.', a_sizes: 'Antal pr. størrelse', a_uploading: 'Uploader …',
    a_forbidden: 'Det har appen ikke adgang til – klar det på kontoret.', a_logged_out: 'Appen er logget ud fra kontoret. Forbind igen.', a_status: 'Status',
    a_pickup: 'Afhentet', a_ship: 'Sendt', a_carrier: 'Fragtfirma', a_trackno: 'Trackingnummer', a_save: 'Gem', a_search: 'Søg …', a_all: 'Alle',
    a_open_web: 'Åbn i browser', a_phone: 'Telefon', a_email: 'E-mail', a_name: 'Navn', a_company: 'Firma (valgfrit)', a_business: 'Firma', a_country: 'Land',
    a_too_many: 'For mange forsøg – vent 10 minutter.', a_update: 'Ny app-version {0} tilgængelig', a_update_btn: 'Hent',
  },
};
const t = (k, ...a) => {
  const d = (XT[lang] || {})[k] ?? XT.de[k] ?? (window.WF_I18N[lang] || {})[k] ?? window.WF_I18N.de[k] ?? k;
  return a.length ? String(d).replace(/\{(\d)\}/g, (_, i) => a[i]) : d;
};

// ---------- DOM ----------
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'value') e.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'readonly') e[k === 'readonly' ? 'readOnly' : k] = !!v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
const view = () => document.getElementById('view');
const show = (...kids) => { view().replaceChildren(...kids.flat().filter((k) => k != null && k !== false && k !== '')); window.scrollTo(0, 0); };
function toast(msg) { const el = h('div', { class: 'toast' }, msg); document.body.append(el); setTimeout(() => el.remove(), 2800); }
const ICON = {
  list: 'M4 6h16M4 12h16M4 18h10', plus: 'M12 5v14M5 12h14', cam: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  more: 'M5 12h.01M12 12h.01M19 12h.01', back: 'M15 5l-7 7 7 7', reload: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
};
function icon(n) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', ICON[n]); s.append(p); return s;
}

// ---------- Format ----------
const money = (v, cur) => new Intl.NumberFormat(lang === 'da' ? 'da-DK' : 'de-DE', { style: 'currency', currency: cur || 'DKK' }).format(+v || 0);
const cents = (c, cur) => money((+c || 0) / 100, cur);
const dfmt = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString(lang === 'da' ? 'da-DK' : 'de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';
const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const num = (v) => { let x = String(v || '').replace(/\s|kr\.?|€/gi, ''); if (x.includes(',')) x = x.replace(/\./g, '').replace(',', '.'); return parseFloat(x) || 0; };
const SCOL = { inquiry: 'var(--s-inquiry)', approval: 'var(--s-approval)', material: 'var(--s-material)', production: 'var(--s-production)', done: 'var(--s-done)', delivered: 'var(--s-delivered)' };
const PCOL = { open: 'var(--bad)', deposit: 'var(--warn)', paid: 'var(--ok)' };
const pill = (txt, col) => h('span', { class: 'pill', style: `--c:${col}` }, txt);

// ---------- Verbindung ----------
let cfg = store.get('cfg');   // { server, token, name }
let me = store.get('me');
const base = () => cfg.server.replace(/\/?$/, '/');
const fileUrl = (q) => `${base()}file.php?${q}&at=${cfg.token}`;
async function api(a, { params = {}, body = null, form = null } = {}) {
  const opt = { method: 'GET', headers: { 'X-App-Token': cfg.token } };
  if (body || form) { opt.method = 'POST'; if (body) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); } else opt.body = form; }
  let r;
  try { r = await fetch(`${base()}api.php?${new URLSearchParams({ a, ...params })}`, opt); } catch (e) { setNet(false); throw new Error(t('err_network')); }
  setNet(true);
  let j = null; try { j = await r.json(); } catch (e) { /* leer */ }
  if (r.status === 401) { store.del('cfg'); cfg = null; toast(t('a_logged_out')); pairView(); throw new Error('not_logged_in'); }
  if (r.status === 403 && j && j.error === 'app_forbidden') throw new Error(t('a_forbidden'));
  if (!j || !j.ok) { const code = j ? j.error : 'server_error'; const m = t('err_' + code); throw new Error(m === 'err_' + code ? code : m); }
  return j;
}
function setNet(ok) { const n = document.getElementById('net'); n.classList.toggle('off', !ok); n.title = ok ? 'online' : 'offline'; }

// ---------- Kopplung ----------
function pairView() {
  document.getElementById('nav').classList.add('hidden');
  document.getElementById('who').textContent = '';
  const srv = h('input', { type: 'url', value: (store.get('lastServer') || 'https://wunsch-fabrik.dk/auftraege/'), autocapitalize: 'off', autocorrect: 'off' });
  const code = h('input', { type: 'text', placeholder: 'ABCD-EFGH', autocapitalize: 'characters', autocomplete: 'off', style: 'font-size:1.4rem;letter-spacing:.15em;text-align:center' });
  const err = h('p', { class: 'err' });
  const go = async () => {
    err.textContent = '';
    let s = srv.value.trim(); if (!/^https?:\/\//i.test(s)) s = 'https://' + s; s = s.replace(/(index\.php|api\.php)?\/?$/i, '') + '/';
    try {
      const r = await fetch(`${s}api.php?a=app_pair`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code.value, device: (window.WFNative && WFNative.device && WFNative.device()) || navigator.userAgent.slice(0, 60) }) });
      const j = await r.json().catch(() => null);
      if (!j || !j.ok) { err.textContent = j && j.error === 'too_many' ? t('a_too_many') : t('a_pair_bad'); return; }
      cfg = { server: s, token: j.token, name: j.name }; store.set('cfg', cfg); store.set('lastServer', s);
      toast(t('a_connected', j.name)); await start();
    } catch (e) { err.textContent = t('err_network'); }
  };
  show(h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow' }, 'WERKSTATT'), h('h1', {}, t('a_pair_h')))),
    h('div', { class: 'card grid' }, h('p', { class: 'muted', style: 'margin:0' }, t('a_pair_text')),
      h('div', {}, h('label', {}, t('a_server')), srv), h('div', {}, h('label', {}, t('a_code')), code), err,
      h('button', { class: 'btn primary', onclick: go }, t('a_connect'))),
    langRow());
}
const langRow = () => h('div', { class: 'row', style: 'justify-content:center;gap:8px;margin-top:12px' },
  ...[['de', '🇩🇪 Deutsch'], ['da', '🇩🇰 Dansk']].map(([l, n]) => h('button', { class: 'chip' + (lang === l ? ' on' : ''), onclick: () => { lang = l; store.set('lang', l); route(); } }, n)));

// ---------- Navigation ----------
let tab = 'orders';
const routes = { orders: ordersView, new: () => orderForm(), receipt: receiptView, more: moreView };
function nav() {
  const n = document.getElementById('nav');
  const item = (k, ic, label, add) => h('a', { href: '#', class: (tab === k ? 'on ' : '') + (add ? 'add' : ''), onclick: (e) => { e.preventDefault(); go(k); } },
    add ? h('span', { class: 'fab' }, icon(ic)) : icon(ic), h('small', {}, label));
  n.replaceChildren(item('orders', 'list', t('a_orders')), item('new', 'plus', t('a_new'), true), item('receipt', 'cam', t('a_receipt')), item('more', 'more', t('a_more')));
  n.classList.remove('hidden');
}
let stack = [];
function go(k, ...args) { tab = k; stack = []; nav(); routes[k](...args); }
function push(fn) { stack.push(fn); fn(); }
function back() { stack.pop(); const f = stack[stack.length - 1]; if (f) f(); else routes[tab](); }
window.WFBack = () => { if (document.querySelector('.modal')) { document.querySelector('.modal').remove(); return true; } if (stack.length) { back(); return true; } if (tab !== 'orders') { go('orders'); return true; } return false; };
function route() { if (!cfg) pairView(); else { nav(); (stack[stack.length - 1] || routes[tab])(); } }
const backBtn = () => h('button', { class: 'btn small', onclick: back }, icon('back'), ' ', t('close'));

// ---------- Aufträge ----------
const filt = { q: '', status: '' };
async function ordersView() {
  const list = h('div', { class: 'orders' });
  const offline = h('div');
  let timer;
  const draw = (orders) => {
    const q = filt.q.toLowerCase();
    const os = orders.filter((o) => (!filt.status || o.status === filt.status) && (!q || [o.nr, o.title, o.customer_name, o.customer_company, o.article].join(' ').toLowerCase().includes(q)));
    if (!os.length) { list.replaceChildren(h('div', { class: 'empty' }, t('no_orders'))); return; }
    const td = today(), wd = (new Date(td + 'T12:00:00').getDay() + 6) % 7;
    const addD = (n) => { const x = new Date(td + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
    const endW = addD(6 - wd), endNW = addD(13 - wd);
    const fin = (o) => ['done', 'delivered'].includes(o.status);
    const bucket = (o) => fin(o) ? 'b_done' : !o.due_date ? 'b_none' : o.due_date < td ? 'b_late' : o.due_date <= endW ? 'b_week' : o.due_date <= endNW ? 'b_next' : 'b_later';
    const order = ['b_late', 'b_week', 'b_next', 'b_later', 'b_none', 'b_done'];
    const sorted = [...os].sort((x, y) => order.indexOf(bucket(x)) - order.indexOf(bucket(y)) || (x.due_date || '9999').localeCompare(y.due_date || '9999'));
    const out = []; let last = null;
    for (const o of sorted) {
      const bk = bucket(o);
      if (bk !== last) { out.push(h('div', { class: 'ogroup' + (bk === 'b_late' ? ' late' : '') }, t(bk), h('small', {}, String(sorted.filter((x) => bucket(x) === bk).length)))); last = bk; }
      out.push(orderRow(o));
    }
    list.replaceChildren(...out);
  };
  const load = async () => {
    try {
      const { orders } = await api('orders', { params: { show: 'active' } });
      store.set('orders', { at: new Date().toISOString(), orders }); offline.replaceChildren(); draw(orders);
    } catch (e) {
      const c = store.get('orders');
      if (c) { offline.replaceChildren(h('div', { class: 'alertbar' }, '📴 ', t('a_offline', new Date(c.at).toLocaleString(lang === 'da' ? 'da-DK' : 'de-DE')))); draw(c.orders); } else list.replaceChildren(h('div', { class: 'empty' }, e.message));
    }
  };
  const statusSel = h('select', { onchange: (e) => { filt.status = e.target.value; const c = store.get('orders'); if (c) draw(c.orders); } },
    h('option', { value: '' }, t('all_status')), ...(me ? me.statuses : []).filter((s) => s !== 'delivered').map((s) => h('option', { value: s, selected: filt.status === s }, t('st_' + s))));
  show(h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow' }, t('workshop')), h('h1', {}, t('orders_h1_a'), ' ', h('em', {}, t('orders_h1_b')))),
      h('button', { class: 'btn small', 'aria-label': t('a_reload'), onclick: load }, icon('reload'))),
    h('div', { class: 'filters' }, h('input', { type: 'search', placeholder: t('search_ph'), value: filt.q, oninput: (e) => { filt.q = e.target.value; clearTimeout(timer); timer = setTimeout(() => { const c = store.get('orders'); if (c) draw(c.orders); }, 150); } }), statusSel),
    offline, list);
  const c = store.get('orders'); if (c) draw(c.orders);
  await load();
}
function orderRow(o) {
  const late = o.due_date && o.due_date < today() && !['done', 'delivered'].includes(o.status);
  const p = (me.processes || []).find((x) => +x.id === +String(o.process_ids || '').split(',')[0]);
  return h('a', { href: '#', class: 'orow' + (late ? ' late' : ''), style: `--sc:${SCOL[o.status]}`, onclick: (e) => { e.preventDefault(); push(() => orderView(o.id)); } },
    o.thumb ? h('img', { class: 'or-th', src: fileUrl(`id=${o.thumb}&thumb=1`), alt: '', loading: 'lazy' }) : h('span', { class: 'or-th none', style: p ? `--sc:${p.color}` : '' }, p ? (lang === 'da' ? p.name_da : p.name_de).slice(0, 2) : '·'),
    h('span', { class: 'or-main' }, h('b', {}, o.title), h('small', {}, [o.nr, o.customer_company || o.customer_name].filter(Boolean).join(' · '))),
    h('span', { class: 'or-due' + (late ? ' late' : '') }, o.due_date ? (late ? '⚠ ' : '') + dfmt(o.due_date) : '—'),
    h('span', { class: 'or-qty muted' }, `${o.qty} ${t('pcs')}`),
    h('span', { class: 'or-st' }, pill(t('st_' + o.status), SCOL[o.status])), h('span', { class: 'or-next' }));
}

async function orderView(id) {
  show(h('div', { class: 'empty' }, '…'));
  let o;
  try { o = (await api('order', { params: { id } })).order; store.set('order_' + id, o); } catch (e) { o = store.get('order_' + id); if (!o) { show(backBtn(), h('div', { class: 'empty' }, e.message)); return; } toast(e.message); }
  const reload = () => orderView(id);
  const idx = me.statuses.indexOf(o.status);
  const setSt = async (s) => {
    try {
      if (s === 'delivered' && o.status !== 'delivered') { const r = await shipDialog(o); if (!r) return; } else await api('order_status', { body: { id: o.id, status: s } });
      toast(t('saved')); reload();
    } catch (e) { toast(e.message); }
  };
  const steps = h('div', { class: 'steps' }, me.statuses.map((s, i) => h('button', { class: i < idx ? 'done' : i === idx ? 'cur' : '', onclick: () => setSt(s) }, t('st_' + s))));
  const nextS = me.statuses[idx + 1];
  const cust = h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;margin-top:6px' });
  api('customer', { params: { id: o.customer_id } }).then(({ customer: c }) => {
    cust.replaceChildren(...[c.phone ? h('a', { class: 'btn small', href: 'tel:' + c.phone.replace(/[^+\d]/g, '') }, '📞 ' + t('a_call')) : null,
      c.email ? h('a', { class: 'btn small', href: 'mailto:' + c.email }, '✉ ' + t('a_mail')) : null].filter(Boolean));
  }).catch(() => {});
  const items = (o.items || []).map((i) => {
    const ov = Object.values(i.opts || {}).filter(Boolean), sz = Object.entries(i.sizes || {}).filter(([, q]) => +q > 0);
    return h('div', { class: 'free', style: 'align-items:flex-start;flex-wrap:wrap' },
      h('div', { style: 'flex:1;min-width:0' }, h('b', {}, `${i.qty} × ${i.name}`), ov.length ? h('div', {}, ov.join(' · ')) : null,
        sz.length ? h('div', { class: 'muted', style: 'font-size:.9rem' }, sz.map(([k, q]) => `${k} × ${q}`).join(', ')) : null,
        i.sku ? h('div', { class: 'muted', style: 'font-size:.8rem' }, i.sku) : null,
        (i.src_name || i.src_sku || i.src_url) ? h('div', { class: 'srcline' }, '🛒 ', [i.src_name, i.src_sku].filter(Boolean).join(' · '), i.src_url ? [' · ', h('a', { href: i.src_url, target: '_blank', rel: 'noopener' }, t('src_link') + ' ↗')] : null) : null));
  });
  const photoIn = (cap) => h('input', { type: 'file', accept: 'image/*', capture: cap ? 'environment' : null, multiple: !cap, class: 'hidden', onchange: async (e) => {
    const files = [...e.target.files]; e.target.value = ''; if (!files.length) return;
    toast(t('a_uploading'));
    for (const f of files) { try { const fd = new FormData(); fd.append('order_id', o.id); fd.append('file', await window.prepImage(f)); await api('file_upload', { form: fd }); } catch (er) { toast(er.message); } }
    reload();
  } });
  const cam = photoIn(true), gal = photoIn(false);
  show(
    h('div', { class: 'row', style: 'margin-bottom:8px' }, backBtn()),
    h('div', { class: 'eyebrow' }, o.nr), h('h1', { style: 'margin:2px 0 4px' }, o.title),
    h('div', { class: 'muted' }, [o.customer_name, o.customer_company].filter(Boolean).join(' · ')), cust,
    h('div', { class: 'card' }, steps,
      nextS ? h('button', { class: 'btn primary', style: 'width:100%;margin-top:8px', onclick: () => setSt(nextS) }, '→ ' + t('st_' + nextS)) : null,
      h('dl', { class: 'kv', style: 'margin-top:12px' },
        h('dt', {}, t('a_due')), h('dd', {}, dfmt(o.due_date)),
        h('dt', {}, t('qty')), h('dd', {}, `${o.qty} ${t('pcs')}${o.article ? ' · ' + o.article : ''}`),
        h('dt', {}, t('production')), h('dd', {}, (o.days || []).filter((d) => d.kind === 'work').map((d) => h('div', {}, `${dfmt(d.date)} · ${d.start}–${d.end}`))),
        h('dt', {}, t('payment')), h('dd', {}, pill(t('pay_' + o.pay_status), PCOL[o.pay_status])))),
    items.length ? h('div', { class: 'card' }, h('h3', { style: 'margin-bottom:8px' }, t('a_items')), ...items) : null,
    (o.description || o.notes) ? h('div', { class: 'card' }, o.description ? h('p', { style: 'margin:0 0 8px;white-space:pre-wrap' }, o.description) : null, o.notes ? h('p', { class: 'muted', style: 'margin:0;white-space:pre-wrap' }, o.notes) : null) : null,
    h('div', { class: 'card' }, h('h3', { style: 'margin-bottom:10px' }, t('a_photos')),
      h('div', { class: 'row', style: 'gap:8px' }, h('button', { class: 'btn primary', onclick: () => cam.click() }, '📷 ' + t('a_photo')), h('button', { class: 'btn', onclick: () => gal.click() }, '🖼 ' + t('a_gallery')), cam, gal),
      h('div', { class: 'files', style: 'margin-top:10px' }, (o.files || []).map((f) => f.mime && f.mime.startsWith('image/')
        ? h('a', { class: 'file', href: '#', onclick: (e) => { e.preventDefault(); viewer(fileUrl(`id=${f.id}`)); } }, h('img', { src: fileUrl(`id=${f.id}&thumb=1`), alt: '', loading: 'lazy' }))
        : h('span', { class: 'file muted' }, '📄 ' + f.original_name)))),
    (o.log || []).length ? h('div', { class: 'card' }, h('h3', { style: 'margin-bottom:6px' }, t('a_history')),
      ...(o.log || []).slice(0, 12).map((l) => h('div', { class: 'muted', style: 'font-size:.85rem;padding:4px 0;border-bottom:1px dashed var(--line)' }, `${String(l.at).slice(0, 16)} · ${l.user_name} · ${logText(l.what)}`))) : null);
}
// Foto groß in der App zeigen (nicht im Browser, damit der App-Schlüssel nicht im Verlauf landet)
function viewer(src) {
  const m = h('div', { class: 'modal viewer', onclick: () => m.remove() }, h('img', { src, alt: '' }), h('button', { class: 'btn small', style: 'position:fixed;top:calc(12px + env(safe-area-inset-top));right:12px' }, '✕'));
  document.body.append(m);
}
function logText(w) {
  if (w.startsWith('status:')) return t('log_status') + ' ' + t('st_' + w.slice(7));
  if (w.startsWith('pay:')) return t('log_pay') + ' ' + t('pay_' + w.slice(4));
  if (w.startsWith('file:')) return t('log_file') + ' ' + w.slice(5);
  if (w.startsWith('confirmed:')) return t('log_confirmed');
  if (w.startsWith('mail:')) { const [k, to] = w.slice(5).split('|'); return '✉ ' + t('log_mail_' + k) + (to ? ' → ' + to : ''); }
  if (w.startsWith('mailfail:')) return '⚠ ' + w.slice(9).split('|')[0];
  return t('log_' + w);
}
function shipDialog(o) {
  return new Promise((resolve) => {
    const close = (v) => { m.remove(); resolve(v); };
    const car = h('select', {}, h('option', { value: '' }, '—'), ...Object.entries(me.carriers || {}).map(([k, n]) => h('option', { value: k }, n)));
    const no = h('input', { type: 'text', placeholder: t('a_trackno'), autocomplete: 'off' });
    const send = async (mode) => { try { close(await api('order_status', { body: { id: o.id, status: 'delivered', ship_mode: mode, ...(mode === 'ship' ? { carrier: car.value, tracking_no: no.value.trim() } : {}) } })); } catch (e) { toast(e.message); } };
    const m = h('div', { class: 'modal', onclick: (e) => { if (e.target === m) close(null); } }, h('div', { class: 'sheet grid' },
      h('div', { class: 'row' }, h('h2', { style: 'flex:1;margin:0' }, t('st_delivered')), h('button', { class: 'btn small', onclick: () => close(null) }, '✕')),
      h('button', { class: 'btn', onclick: () => send('pickup') }, '🤝 ' + t('a_pickup')),
      h('div', { class: 'card', style: 'margin:0' }, h('h3', { style: 'margin-bottom:8px' }, '📦 ' + t('a_ship')), h('label', {}, t('a_carrier')), car, h('label', { style: 'margin-top:8px' }, t('a_trackno')), no,
        h('button', { class: 'btn primary', style: 'width:100%;margin-top:10px', onclick: () => send('ship') }, t('a_save')))));
    document.body.append(m);
  });
}

// ---------- Neuer Auftrag ----------
let catCache = null;
async function catalog() {
  if (catCache) return catCache;
  try { const [{ products }, { categories }] = await Promise.all([api('products'), api('categories')]); catCache = { products: products.filter((p) => +p.active), cats: categories }; store.set('catalog', catCache); }
  catch (e) { catCache = store.get('catalog') || { products: [], cats: [] }; }
  return catCache;
}
const catPath = (cats, id) => { const c = cats.find((x) => +x.id === +id); if (!c) return ''; const p = c.parent_id ? cats.find((x) => +x.id === +c.parent_id) : null; return p ? `${p.name} › ${c.name}` : c.name; };
let cpOpen = {};
function catalogPicker({ products, cats }, onPick) {
  const close = () => m.remove();
  const q = h('input', { type: 'search', placeholder: t('cp_search'), autocomplete: 'off' });
  const tree = h('div', { class: 'cptree' });
  const prodBtn = (p) => h('button', { type: 'button', class: 'cpprod', onclick: () => { close(); onPick(p); } },
    p.images && p.images.length ? h('img', { src: fileUrl(`pimg=${p.images[0]}&thumb=1`), alt: '', loading: 'lazy' }) : h('span', { class: 'cpnoimg' }, '🏷'),
    h('span', { class: 'cpn' }, h('b', {}, p.name), h('small', { class: 'muted' }, [p.sku, (p.options || []).map((g) => g.name).join(', ')].filter(Boolean).join(' · '))),
    h('span', { class: 'cpp' + (+p.price ? '' : ' nopr') }, +p.price ? cents(p.price, 'DKK') : t('price_missing')));
  const node = (key, label, count, kids, level) => { const d = h('details', { class: 'cpnode l' + level, open: !!cpOpen[key] }, h('summary', {}, h('span', {}, label), h('small', {}, String(count))), h('div', { class: 'cpkids' }, ...kids)); d.addEventListener('toggle', () => { cpOpen[key] = d.open; }); return d; };
  const draw = () => {
    const s = q.value.trim().toLowerCase();
    const list = products.filter((p) => !s || (p.name + ' ' + (p.sku || '') + ' ' + catPath(cats, p.category_id)).toLowerCase().includes(s));
    const out = [];
    for (const mc of cats.filter((c) => !c.parent_id)) {
      const direct = list.filter((p) => +p.category_id === +mc.id);
      const subs = cats.filter((c) => +c.parent_id === +mc.id).map((sc) => { const ps = list.filter((p) => +p.category_id === +sc.id); return ps.length ? [sc, ps] : null; }).filter(Boolean);
      const n = direct.length + subs.reduce((a, [, ps]) => a + ps.length, 0); if (!n) continue;
      const nd = node('m' + mc.id, mc.name, n, [...direct.map(prodBtn), ...subs.map(([sc, ps]) => node('s' + sc.id, sc.name, ps.length, ps.map(prodBtn), 2))], 1);
      if (s) { nd.open = true; nd.querySelectorAll('details').forEach((x) => { x.open = true; }); }
      out.push(nd);
    }
    const none = list.filter((p) => !p.category_id || !cats.some((c) => +c.id === +p.category_id));
    if (none.length) out.push(node('none', t('cat_none'), none.length, none.map(prodBtn), 1));
    tree.replaceChildren(...(out.length ? out : [h('p', { class: 'muted' }, t('cp_nothing'))]));
  };
  q.addEventListener('input', draw);
  const m = h('div', { class: 'modal', onclick: (e) => e.target === m && close() }, h('div', { class: 'sheet cpsheet' },
    h('div', { class: 'cphead' }, h('h2', {}, '📂 ' + t('cp_title')), h('button', { class: 'btn small', onclick: close }, '✕')), q, tree));
  draw(); document.body.append(m);
}

async function orderForm() {
  const cat = await catalog();
  let customer = null;
  const items = [];
  const itemsBox = h('div', { class: 'items' });
  const custBox = h('div');
  const title = h('input', { type: 'text', placeholder: t('a_title') });
  let titleTouched = false; title.addEventListener('input', () => { titleTouched = true; });
  const due = h('input', { type: 'date', min: today() });
  const notes = h('textarea', { rows: 3, placeholder: t('a_notes') });
  const sumEl = h('b');
  const err = h('p', { class: 'err' });
  const changed = () => {
    const tot = items.reduce((a, r) => a + r.sum(), 0);
    sumEl.textContent = money(tot, 'DKK');
    if (!titleTouched) title.value = items.map((r) => r.get().name).filter(Boolean).join(' + ').slice(0, 200);
  };
  const addItem = (it) => {
    const r = {};
    const nameIn = h('input', { type: 'text', value: it.name || '', placeholder: t('item_name'), oninput: changed });
    const qtyIn = h('input', { type: 'number', min: 1, inputmode: 'numeric', value: it.qty || 1, oninput: changed });
    const priceIn = h('input', { type: 'text', inputmode: 'decimal', value: it.price ? String(it.price).replace('.', ',') : '', placeholder: '0,00', oninput: changed });
    const opts = {}, sizes = {};
    const defs = it.options || [];
    const split = defs.find((g) => g.split);
    const sync = () => { const n = Object.values(sizes).reduce((a, b) => a + (+b || 0), 0); qtyIn.readOnly = n > 0; if (n > 0) qtyIn.value = n; };
    const sels = defs.filter((g) => !g.split).map((g) => {
      if (g.values.length === 1) opts[g.name] = g.values[0];
      const s = h('select', { onchange: () => { opts[g.name] = s.value; } }, h('option', { value: '' }, `– ${g.name} –`), ...g.values.map((v) => h('option', { value: v, selected: opts[g.name] === v }, v)));
      return h('div', {}, h('label', {}, g.name), s);
    });
    const sizeBox = split ? h('div', { class: 'sizebox' }, h('label', {}, split.name + ' · ' + t('a_sizes')), h('div', { class: 'sizes' }, split.values.map((v) => {
      const inp = h('input', { type: 'number', min: 0, inputmode: 'numeric', placeholder: '0', oninput: () => { sizes[v] = Math.max(0, parseInt(inp.value, 10) || 0); sync(); changed(); } });
      return h('label', { class: 'szc' }, h('span', {}, v), inp);
    }))) : null;
    r.get = () => ({ product_id: it.id || null, name: nameIn.value.trim(), sku: it.sku || '', qty: Math.max(1, parseInt(qtyIn.value, 10) || 1), price: num(priceIn.value), processes: it.processes || [],
      opts: Object.fromEntries(Object.entries(opts).filter(([, v]) => v)), sizes: Object.fromEntries(Object.entries(sizes).filter(([, q]) => q > 0)),
      ...(it.id ? { src_name: it.supplier || '', src_url: it.supplier_url || '', src_sku: it.supplier_sku || '' } : {}) });
    r.sum = () => { const g = r.get(); return g.qty * g.price; };
    r.el = h('div', { class: 'item' },
      h('div', { class: 'itop' }, nameIn, h('button', { type: 'button', class: 'btn small danger', onclick: () => { items.splice(items.indexOf(r), 1); r.el.remove(); changed(); } }, '✕')),
      h('div', { class: 'grid c2', style: 'margin-top:8px' }, h('div', {}, h('label', {}, t('qty')), qtyIn), h('div', {}, h('label', {}, t('unit_price')), priceIn)),
      sels.length ? h('div', { class: 'iopts' }, ...sels) : null, sizeBox);
    items.push(r); itemsBox.append(r.el); changed();
  };
  // Kunde: suchen oder neu
  const drawCust = () => {
    if (customer) { custBox.replaceChildren(h('div', { class: 'free' }, h('b', {}, [customer.name, customer.company].filter(Boolean).join(' · ')), h('button', { class: 'btn small', onclick: () => { customer = null; drawCust(); } }, '✕'))); return; }
    const q = h('input', { type: 'search', placeholder: t('a_customer_pick'), autocomplete: 'off' });
    const res = h('div', { class: 'suggest-list' });
    let tm;
    q.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(async () => {
      if (q.value.trim().length < 2) { res.replaceChildren(); return; }
      try { const { customers } = await api('customers', { params: { q: q.value.trim() } });
        res.replaceChildren(...customers.slice(0, 12).map((c) => h('button', { type: 'button', class: 'psugitem', onclick: () => { customer = c; drawCust(); } }, h('b', {}, c.name), h('span', { class: 'muted' }, ' ' + [c.company, c.phone].filter(Boolean).join(' · '))))); } catch (e) { toast(e.message); }
    }, 250); });
    custBox.replaceChildren(h('div', { class: 'suggest' }, q, res), h('button', { class: 'btn small', style: 'margin-top:6px', onclick: newCustomer }, t('a_customer_new')));
  };
  const newCustomer = () => {
    const nm = h('input', { type: 'text' }), co = h('input', { type: 'text' }), ph = h('input', { type: 'tel' }), em = h('input', { type: 'email' });
    const cc = h('select', {}, ...Object.entries(me.countries || { DK: 'Danmark', DE: 'Deutschland' }).map(([k, v]) => h('option', { value: k, selected: k === 'DK' }, v)));
    const biz = h('input', { type: 'checkbox', style: 'width:22px;height:22px;min-height:0' });
    const close = () => m.remove();
    const save = async () => { try { const r = await api('customer_save', { body: { name: nm.value, company: co.value, phone: ph.value, email: em.value, country: cc.value, is_business: biz.checked ? 1 : 0 } }); customer = { id: r.id, name: nm.value, company: co.value }; close(); drawCust(); } catch (e) { toast(e.message); } };
    const m = h('div', { class: 'modal', onclick: (e) => e.target === m && close() }, h('div', { class: 'sheet grid' },
      h('div', { class: 'row' }, h('h2', { style: 'flex:1;margin:0' }, t('a_customer_new').replace('+ ', '')), h('button', { class: 'btn small', onclick: close }, '✕')),
      h('div', {}, h('label', {}, t('a_name')), nm), h('div', {}, h('label', {}, t('a_company')), co),
      h('div', { class: 'grid c2' }, h('div', {}, h('label', {}, t('a_phone')), ph), h('div', {}, h('label', {}, t('a_email')), em)),
      h('div', { class: 'grid c2' }, h('div', {}, h('label', {}, t('a_country')), cc), h('label', { class: 'row', style: 'gap:8px;text-transform:none;letter-spacing:0;color:var(--text);align-self:end' }, biz, t('a_business'))),
      h('button', { class: 'btn primary', onclick: save }, t('a_save'))));
    document.body.append(m); nm.focus();
  };
  drawCust();
  const submit = async () => {
    err.textContent = '';
    const its = items.map((r) => r.get()).filter((i) => i.name);
    if (!customer) { err.textContent = t('err_bad_customer'); return; }
    if (!its.length) { err.textContent = t('a_no_items'); return; }
    const price = Math.round(its.reduce((a, i) => a + i.qty * i.price, 0) * 100) / 100;
    try {
      const r = await api('order_save', { body: { customer_id: customer.id, title: title.value || its[0].name, qty: its.reduce((a, i) => a + i.qty, 0), price: String(price), deposit: '0', currency: 'DKK',
        pay_status: 'open', status: 'inquiry', due_date: due.value || null, notes: notes.value, worker_id: (me.user && me.user.worker_id) || 1, items: its } });
      toast(t('a_created', r.order.nr)); catCache = null; tab = 'orders'; nav(); stack = []; push(() => orderView(r.order.id));
    } catch (e) { err.textContent = e.message; }
  };
  show(h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow' }, t('new_order')), h('h1', {}, t('capture_a'), ' ', h('em', {}, t('capture_b'))))),
    h('div', { class: 'card grid' }, h('div', {}, h('label', {}, t('customer')), custBox),
      h('div', {}, h('label', {}, t('a_items')), itemsBox, h('p', { class: 'muted', style: 'margin:6px 0' }, ''),
        h('div', { class: 'row', style: 'gap:8px' }, h('button', { class: 'btn', onclick: () => catalogPicker(cat, (p) => addItem({ ...p, price: (+p.price || 0) / 100, qty: 1 })) }, '📂 ' + t('a_catalog')),
          h('button', { class: 'btn', onclick: () => addItem({ name: '', qty: 1 }) }, t('a_free_item')))),
      h('div', { class: 'free' }, h('span', {}, t('a_sum')), sumEl),
      h('div', {}, h('label', {}, t('a_title')), title),
      h('div', {}, h('label', {}, t('a_due')), due),
      h('div', {}, h('label', {}, t('a_notes')), notes), err,
      h('button', { class: 'btn primary', onclick: submit }, t('a_save_order'))));
  changed();
}

// ---------- Beleg ----------
function receiptView() {
  const run = async (files) => {
    if (!files.length) return;
    toast(t('a_uploading'));
    try {
      const fd = new FormData(); fd.append('scan', '1'); fd.append('file', await window.prepImage(await window.cropReceipt(files[0])));
      await api('expense_upload', { form: fd }); toast(t('a_receipt_done'));
    } catch (e) { toast(e.message); }
  };
  const cam = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'hidden', onchange: (e) => { run([...e.target.files]); e.target.value = ''; } });
  const gal = h('input', { type: 'file', accept: 'image/*', class: 'hidden', onchange: (e) => { run([...e.target.files]); e.target.value = ''; } });
  show(h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow' }, t('a_receipt')), h('h1', {}, t('a_receipt_h')))),
    h('div', { class: 'card grid' }, h('p', { class: 'muted', style: 'margin:0' }, t('a_receipt_text')),
      h('button', { class: 'btn primary', style: 'padding:22px;font-size:1.1rem', onclick: () => cam.click() }, '📷 ' + t('a_photo')),
      h('button', { class: 'btn', onclick: () => gal.click() }, '🖼 ' + t('a_gallery')), cam, gal));
}

// ---------- Mehr ----------
function moreView() {
  show(h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow' }, t('a_more')), h('h1', {}, t('a_account')))),
    h('div', { class: 'card grid' }, h('div', {}, h('b', {}, cfg.name)), h('div', { class: 'muted', style: 'word-break:break-all' }, cfg.server),
      h('a', { class: 'btn', href: cfg.server, target: '_blank' }, '🌐 ' + t('a_open_web')),
      h('div', {}, h('label', {}, t('a_language')), langRow()),
      h('p', { class: 'muted', style: 'margin:0;font-size:.85rem' }, t('a_version', APP_VERSION, (me && me.version) || '—')),
      h('button', { class: 'btn danger', onclick: () => { if (confirm(t('a_logout_q'))) { store.del('cfg'); store.del('orders'); cfg = null; pairView(); } } }, t('a_logout'))));
}

// ---------- Start ----------
async function start() {
  try { me = await api('me'); store.set('me', me); } catch (e) { if (!me) { if (cfg) show(h('div', { class: 'empty' }, e.message, h('br'), h('button', { class: 'btn', onclick: start }, t('a_reload')))); return; } }
  document.getElementById('who').textContent = cfg.name;
  go('orders');
  // Hinweis auf neue App-Version (Datei app/version.json auf dem Server)
  api('app_latest').then((v) => {
    const newer = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
    if (v && v.version && newer(v.version, APP_VERSION)) view().prepend(h('a', { class: 'alertbar', href: base() + 'app/' + (v.file || 'wunsch-fabrik-werkstatt.apk'), target: '_blank' }, '⬆ ', t('a_update', v.version), h('b', { style: 'margin-left:auto' }, t('a_update_btn'))));
  }).catch(() => {});
}
document.documentElement.lang = lang;
if (cfg) start(); else pairView();
})();
