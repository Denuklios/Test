'use strict';
// Preisfinder – Oberfläche
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const QUICK = ['Milch', 'Kaffee', 'Butter', 'Eier', 'Käse', 'Joghurt', 'Brot', 'Hackfleisch', 'Hähnchen', 'Bananen', 'Tomaten', 'Nudeln', 'Bier', 'Cola', 'Mineralwasser', 'Waschmittel', 'Toilettenpapier', 'Zahnpasta', 'Windeln'];
const QUICK_DK = ['Mælk', 'Kaffe', 'Smør', 'Æg', 'Ost', 'Yoghurt', 'Rugbrød', 'Hakket oksekød', 'Kylling', 'Bananer', 'Pasta', 'Øl', 'Cola', 'Vaskemiddel', 'Toiletpapir'];

let S = { settings: {}, watch: [], shopping: [], news: [] };
let last = null; // letzte Suche
const view = { status: 'all', sort: 'unit', store: '' };

async function api(method, url, body) {
  const res = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401) { location.reload(); throw new Error('Bitte anmelden'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Fehler ${res.status}`);
  return data;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2600);
}

const cur = (c) => (c === 'DKK' ? 'kr.' : '€');
const money = (v, c = 'EUR') => (v == null ? '–' : `${Number(v).toFixed(2).replace('.', ',')} ${cur(c)}`);
const dDate = (d) => new Date(d).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
const days = (d) => Math.ceil((new Date(d) - Date.now()) / 86400000);

function stateText(o) {
  if (o.status === 'kommt') { const n = days(o.from); return `Kommt ab ${dDate(o.from)}${n > 0 ? ` (in ${n} Tag${n === 1 ? '' : 'en'})` : ''}`; }
  if (o.status === 'vorbei') return `Abgelaufen ${o.to ? dDate(o.to) : ''}`;
  if (!o.to) return 'Im Angebot';
  const n = days(o.to);
  return n <= 1 ? `Im Angebot – endet ${n <= 0 ? 'heute' : 'morgen'}!` : `Im Angebot bis ${dDate(o.to)}`;
}

// ---------- Reiter ----------
function showTab(name) {
  $$('nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  $$('main > section').forEach((s) => { s.hidden = s.id !== `tab-${name}`; });
  if (name === 'watch') renderWatch();
  if (name === 'shop') renderShop();
  if (name === 'settings') renderSettings();
  try { localStorage.setItem('pf-tab', name); } catch { /* egal */ }
}
$$('nav button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

// ---------- Suchen ----------
function renderChips() {
  const list = S.settings.country === 'dk' ? QUICK_DK : QUICK;
  let recent = [];
  try { recent = JSON.parse(localStorage.getItem('pf-recent') || '[]'); } catch { /* egal */ }
  const all = [...new Set([...recent, ...list])].slice(0, 24);
  $('#chips').innerHTML = all.map((q) => `<button type="button">${esc(q)}</button>`).join('');
  $$('#chips button').forEach((b) => b.addEventListener('click', () => { $('#q').value = b.textContent; search(b.textContent); }));
}

async function search(q) {
  q = q.trim();
  if (!q) return;
  try {
    const r = JSON.parse(localStorage.getItem('pf-recent') || '[]').filter((x) => x.toLowerCase() !== q.toLowerCase());
    localStorage.setItem('pf-recent', JSON.stringify([q, ...r].slice(0, 6)));
  } catch { /* egal */ }
  $('#results').innerHTML = '<div class="spinner"></div>';
  $('#stats').innerHTML = '';
  $('#filters').hidden = true;
  try {
    last = await api('GET', `/api/search?q=${encodeURIComponent(q)}`);
    view.store = '';
    renderResults();
    renderChips();
  } catch (e) {
    $('#results').innerHTML = `<div class="empty err">${esc(e.message)}</div>`;
  }
}

function sortList(list) {
  const by = {
    unit: (a, b) => (a.unitPrice ?? 1e9) - (b.unitPrice ?? 1e9) || (a.price ?? 1e9) - (b.price ?? 1e9),
    price: (a, b) => (a.price ?? 1e9) - (b.price ?? 1e9),
    save: (a, b) => saving(b) - saving(a),
    end: (a, b) => new Date(a.to || 8.64e15) - new Date(b.to || 8.64e15),
  }[view.sort];
  if (view.sort !== 'unit') return list.slice().sort(by);
  // Grundpreise nur innerhalb derselben Einheit vergleichen; häufigste Einheit zuerst
  const count = {};
  list.forEach((o) => { count[o.base || '-'] = (count[o.base || '-'] || 0) + 1; });
  return list.slice().sort((a, b) => {
    const ka = a.base || '-', kb = b.base || '-';
    if (ka !== kb) return (ka === '-') - (kb === '-') || count[kb] - count[ka];
    return by(a, b);
  });
}
const saving = (o) => (o.oldPrice && o.price ? (o.oldPrice - o.price) / o.oldPrice : 0);

function renderResults() {
  if (!last) return;
  const all = last.offers;
  $('#filters').hidden = !all.length;
  const stores = [...new Set(all.map((o) => o.store).filter(Boolean))].sort();
  $('#storeChips').innerHTML = stores.length > 1
    ? [`<button type="button" data-s="" class="${view.store ? '' : 'on'}">Alle Märkte</button>`, ...stores.map((s) => `<button type="button" data-s="${esc(s)}" class="${view.store === s ? 'on' : ''}">${esc(s)}</button>`)].join('')
    : '';
  $$('#storeChips button').forEach((b) => b.addEventListener('click', () => { view.store = b.dataset.s; renderResults(); }));

  let list = all.filter((o) => (view.status === 'all' || o.status === view.status) && (!view.store || o.store === view.store));
  list = sortList(list);
  renderStats(last);
  if (!list.length) {
    $('#results').innerHTML = `<div class="empty">${all.length ? 'Mit diesen Filtern nichts gefunden.' : `Zu „${esc(last.q)}“ gibt es gerade kein Angebot in deiner Gegend.<br><br><button class="ghost" id="alarmEmpty">🔔 Preisalarm anlegen – ich melde mich, sobald es im Angebot ist</button>`}</div>`;
    const b = $('#alarmEmpty'); if (b) b.addEventListener('click', () => addWatch(last.q));
    return;
  }
  $('#results').innerHTML = list.map(card).join('');
  $$('#results .offer').forEach((el) => {
    const o = list[+el.dataset.i];
    $('.add', el).addEventListener('click', () => addShop(o));
    $('.alarm', el).addEventListener('click', () => addWatch(last.q, o));
  });
}

function card(o, i) {
  const pct = saving(o);
  return `<article class="offer ${o.top ? 'top' : ''}" data-i="${i}">
    ${o.image ? `<img src="${esc(o.image)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
    <div class="store">${esc(o.store || 'Markt unbekannt')}</div>
    <div class="title">${esc(o.title)}</div>
    ${o.description ? `<div class="desc">${esc(o.description)}</div>` : ''}
    <div><span class="price">${money(o.price, o.currency)}</span>${o.oldPrice ? `<span class="old">${money(o.oldPrice, o.currency)}</span>` : ''}${pct >= 0.05 ? `<span class="save">−${Math.round(pct * 100)} %</span>` : ''}</div>
    ${o.unitPrice != null ? `<div class="unit">${money(o.unitPrice, o.currency)} / ${esc(o.base)}</div>` : ''}
    ${o.top ? '<div class="topflag">⭐ Top-Preis (bester seit 90 Tagen)</div>' : ''}
    ${o.loyalty ? '<div class="unit">nur mit Kundenkarte/App</div>' : ''}
    <div class="state ${esc(o.status)}">${esc(stateText(o))}</div>
    <div class="acts"><button class="ghost add">+ Einkaufsliste</button><button class="ghost alarm">🔔 Alarm</button></div>
  </article>`;
}

function renderStats(r) {
  const st = r.stats || {};
  const live = r.offers.filter((o) => o.status === 'läuft').length;
  const soon = r.offers.filter((o) => o.status === 'kommt').length;
  let html = `<div><b>${live}</b> jetzt im Angebot · <b>${soon}</b> kommen bald</div>`;
  if (st.days >= 2 && st.lowestUnit != null) {
    html += `<div>Bester Grundpreis (90 Tage): <b>${money(st.lowestUnit, r.offers[0] && r.offers[0].currency)} / ${esc(st.base)}</b> · Ø ${money(st.avgUnit, r.offers[0] && r.offers[0].currency)}</div>`;
    html += spark(st.series.map((s) => s.minUnit).filter((x) => x != null));
  } else {
    html += '<div class="muted">Preisverlauf wird ab heute für diese Suche gesammelt.</div>';
  }
  html += `<div class="muted small">Quelle: ${esc(r.source || '')}</div>`;
  $('#stats').innerHTML = `<div class="stats">${html}</div>`;
}

function spark(v) {
  if (v.length < 2) return '';
  const min = Math.min(...v), max = Math.max(...v), w = 160, h = 36;
  const pts = v.map((x, i) => `${(i / (v.length - 1)) * w},${h - 3 - ((x - min) / (max - min || 1)) * (h - 6)}`);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-label="Preisverlauf"><path d="M${pts.join('L')}"/></svg>`;
}

$('#searchForm').addEventListener('submit', (e) => { e.preventDefault(); search($('#q').value); });
$$('#statusSeg button').forEach((b) => b.addEventListener('click', () => {
  view.status = b.dataset.v; $$('#statusSeg button').forEach((x) => x.classList.toggle('on', x === b)); renderResults();
}));
$('#sort').addEventListener('change', (e) => { view.sort = e.target.value; renderResults(); });

// ---------- Einkaufsliste ----------
async function addShop(o) {
  const it = await api('POST', '/api/shopping', { text: o.title, store: o.store, price: o.price, currency: o.currency, until: o.status === 'kommt' ? `ab ${o.from}` : o.to });
  if (it.duplicate) return toast(`„${o.title}“ steht schon auf der Einkaufsliste`);
  S.shopping.push(it); updateBadges(); toast(`„${o.title}“ steht auf der Einkaufsliste`);
}

function renderShop() {
  const groups = {};
  for (const it of S.shopping) (groups[it.store || 'Ohne Markt'] ||= []).push(it);
  const names = Object.keys(groups).sort((a, b) => (a === 'Ohne Markt') - (b === 'Ohne Markt') || a.localeCompare(b));
  if (!names.length) { $('#shopList').innerHTML = '<div class="empty">Die Einkaufsliste ist leer. Füge Angebote mit „+ Einkaufsliste“ hinzu oder schreib oben etwas auf.</div>'; return; }
  let total = 0; let currency = 'EUR';
  $('#shopList').innerHTML = names.map((n) => {
    const items = groups[n];
    const sum = items.filter((i) => !i.done && i.price).reduce((a, i) => a + i.price, 0);
    total += sum; if (items[0].currency) currency = items[0].currency;
    return `<div class="card shopgroup"><h3><span>${esc(n)}</span><span class="muted">${sum ? money(sum, items[0].currency) : ''}</span></h3>${items.map((i) => `
      <div class="item ${i.done ? 'done' : ''}" data-id="${i.id}">
        <input type="checkbox" ${i.done ? 'checked' : ''} aria-label="erledigt">
        <span class="t">${esc(i.text)}${i.until ? `<br><small class="muted">${esc(untilText(i.until))}</small>` : ''}</span>
        <span>${i.price ? money(i.price, i.currency) : ''}</span>
        <button class="x" aria-label="löschen">✕</button>
      </div>`).join('')}</div>`;
  }).join('') + (total ? `<div class="total">Summe offen: ${money(total, currency)}</div>` : '');
  $$('#shopList .item').forEach((el) => {
    const id = el.dataset.id;
    $('input', el).addEventListener('change', async (e) => { const it = await api('PATCH', `/api/shopping/${id}`, { done: e.target.checked }); Object.assign(S.shopping.find((x) => x.id === id), it); renderShop(); updateBadges(); });
    $('.x', el).addEventListener('click', async () => { await api('DELETE', `/api/shopping/${id}`); S.shopping = S.shopping.filter((x) => x.id !== id); renderShop(); updateBadges(); });
  });
}
function untilText(u) { return u.startsWith('ab ') ? `Angebot ab ${dDate(u.slice(3))}` : `Angebot bis ${dDate(u)}`; }

$('#shopForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = e.target.text.value.trim(); if (!text) return;
  const it = await api('POST', '/api/shopping', { text });
  if (it.duplicate) toast('Steht schon auf der Liste'); else S.shopping.push(it);
  e.target.text.value = ''; renderShop(); updateBadges();
});
$('#clearDone').addEventListener('click', async () => { await api('DELETE', '/api/shopping'); S.shopping = S.shopping.filter((x) => !x.done); renderShop(); updateBadges(); });
$('#shareShop').addEventListener('click', async () => {
  const groups = {};
  for (const it of S.shopping.filter((x) => !x.done)) (groups[it.store || 'Sonstiges'] ||= []).push(it);
  const text = Object.entries(groups).map(([s, items]) => `${s}:\n${items.map((i) => `☐ ${i.text}${i.price ? ` (${money(i.price, i.currency)})` : ''}`).join('\n')}`).join('\n\n');
  if (!text) return toast('Nichts zu teilen.');
  if (navigator.share) { try { await navigator.share({ title: 'Einkaufsliste', text }); return; } catch { /* abgebrochen */ } }
  try { await navigator.clipboard.writeText(text); toast('Einkaufsliste kopiert'); } catch { prompt('Einkaufsliste:', text); }
});

// ---------- Preisalarm ----------
async function addWatch(q, o) {
  const w = await api('POST', '/api/watch', { q, maxUnitPrice: o && o.unitPrice != null ? o.unitPrice : null, maxPrice: o && o.unitPrice == null ? o.price : null });
  S.watch.push(w); toast(`Preisalarm für „${q}“ angelegt`);
  api('POST', `/api/watch/${w.id}/check`).then((x) => { Object.assign(w, x); if (!$('#tab-watch').hidden) renderWatch(); }).catch(() => {});
}

function renderWatch() {
  const news = S.news.slice(0, 15);
  $('#news').innerHTML = news.length ? `<div class="card news"><div class="watch head"><h2>Neu gefunden</h2><button class="ghost" id="clearNews">Gelesen</button></div><div class="watch hits">${news.map((n) => hitRow(n.offer, n.q)).join('')}</div></div>` : '';
  const cn = $('#clearNews'); if (cn) cn.addEventListener('click', async () => { await api('DELETE', '/api/news'); S.news = []; renderWatch(); updateBadges(); });
  try { localStorage.setItem('pf-seen', String(S.news[0] ? S.news[0].at : '')); } catch { /* egal */ }
  updateBadges();

  if (!S.watch.length) { $('#watchList').innerHTML = '<div class="empty">Noch keine Preisalarme. Leg oben einen an – oder tippe bei einem Angebot auf „🔔 Alarm“.</div>'; return; }
  $('#watchList').innerHTML = S.watch.map((w) => `
    <div class="card watch" data-id="${w.id}">
      <div class="head"><h2>${esc(w.q)}</h2>
        <span class="muted small">${[w.maxPrice != null ? `bis ${money(w.maxPrice)}` : '', w.maxUnitPrice != null ? `bis ${money(w.maxUnitPrice)} je kg/l` : '', w.stores && w.stores.length ? w.stores.join(', ') : ''].filter(Boolean).join(' · ') || 'jedes Angebot'}</span></div>
      <div class="muted small">${w.lastCheck ? `Zuletzt geprüft ${new Date(w.lastCheck).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })} · ${w.hits.length} Treffer` : 'Noch nicht geprüft'}</div>
      <div class="hits">${(w.hits || []).slice(0, 6).map((o) => hitRow(o)).join('')}</div>
      <div class="toolbar"><button class="ghost chk">🔄 Prüfen</button><button class="ghost edit">✎ Grenze</button><button class="ghost show">🔍 Alle anzeigen</button><button class="ghost del">🗑</button></div>
    </div>`).join('');
  $$('#watchList .watch').forEach((el) => {
    const w = S.watch.find((x) => x.id === el.dataset.id);
    $('.chk', el).addEventListener('click', async (e) => { e.target.disabled = true; try { Object.assign(w, await api('POST', `/api/watch/${w.id}/check`)); await refresh(); } catch (er) { toast(er.message); } renderWatch(); });
    $('.del', el).addEventListener('click', async () => { if (!confirm(`Preisalarm „${w.q}“ löschen?`)) return; await api('DELETE', `/api/watch/${w.id}`); S.watch = S.watch.filter((x) => x !== w); renderWatch(); });
    $('.show', el).addEventListener('click', () => { showTab('search'); $('#q').value = w.q; search(w.q); });
    $('.edit', el).addEventListener('click', async () => {
      const p = prompt('Höchstpreis pro Packung (leer = egal):', w.maxPrice ?? ''); if (p === null) return;
      const u = prompt('Höchster Grundpreis je kg/l (leer = egal):', w.maxUnitPrice ?? ''); if (u === null) return;
      Object.assign(w, await api('PATCH', `/api/watch/${w.id}`, { maxPrice: p.replace(',', '.'), maxUnitPrice: u.replace(',', '.') })); renderWatch();
    });
  });
}
function hitRow(o, q) {
  return `<div class="hit"><span>${q ? `<b>${esc(q)}:</b> ` : ''}${esc(o.title)} <span class="muted">· ${esc(o.store)}</span><br><small class="state ${esc(o.status)}">${esc(stateText(o))}</small></span><span class="r"><b>${money(o.price, o.currency)}</b>${o.unitPrice != null ? `<br><small class="muted">${money(o.unitPrice, o.currency)}/${esc(o.base)}</small>` : ''}</span></div>`;
}

$('#watchForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    const w = await api('POST', '/api/watch', { q: f.q.value, maxPrice: f.maxPrice.value, maxUnitPrice: f.maxUnitPrice.value });
    S.watch.push(w); f.reset(); renderWatch();
    Object.assign(w, await api('POST', `/api/watch/${w.id}/check`)); await refresh(); renderWatch();
  } catch (er) { toast(er.message); }
});
$('#checkAll').addEventListener('click', async (e) => {
  e.target.disabled = true; $('#checkInfo').textContent = 'Prüfe …';
  try { const r = await api('POST', '/api/watch/check'); await refresh(); $('#checkInfo').textContent = `${r.fresh} neue Treffer${r.errors.length ? ` · Fehler: ${r.errors.join('; ')}` : ''}`; }
  catch (er) { $('#checkInfo').textContent = er.message; }
  e.target.disabled = false; renderWatch();
});

// ---------- Einstellungen ----------
function renderSettings() {
  const f = $('#settingsForm'); const s = S.settings;
  f.country.value = s.country; f.zip.value = s.zip; f.radius.value = s.radius; f.stores.value = (s.stores || []).join(', ');
  f.hideLoyalty.checked = !!s.hideLoyalty; f.ntfyTopic.value = s.ntfyTopic || ''; f.watchHours.value = s.watchHours;
  $$('[data-only=dk]').forEach((el) => { el.hidden = f.country.value !== 'dk'; });
  $('#topicIdea').textContent = `preise-${Math.random().toString(36).slice(2, 8)}${Math.random().toString(36).slice(2, 8)}`;
  $('#version').textContent = `Version ${S.version}`;
}
$('#settingsForm').country.addEventListener('change', (e) => { $$('[data-only=dk]').forEach((el) => { el.hidden = e.target.value !== 'dk'; }); });
$('#settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault(); const f = e.target;
  S.settings = await api('PUT', '/api/settings', { country: f.country.value, zip: f.zip.value, radius: f.radius.value, stores: f.stores.value.split(',').map((x) => x.trim()).filter(Boolean), hideLoyalty: f.hideLoyalty.checked, ntfyTopic: f.ntfyTopic.value, watchHours: f.watchHours.value });
  $('#settingsMsg').textContent = 'Gespeichert ✔'; renderChips(); last = null; $('#results').innerHTML = ''; $('#stats').innerHTML = ''; $('#filters').hidden = true;
});
$('#testPush').addEventListener('click', async () => { try { await api('POST', '/api/test-push'); toast('Test-Nachricht gesendet'); } catch (e) { toast(e.message); } });

// ---------- Start ----------
function updateBadges() {
  let seen = ''; try { seen = localStorage.getItem('pf-seen') || ''; } catch { /* egal */ }
  const n = S.news.filter((x) => x.at > seen).length;
  $('#newBadge').hidden = !n; $('#newBadge').textContent = n;
  const open = S.shopping.filter((x) => !x.done).length;
  $('#shopBadge').hidden = !open; $('#shopBadge').textContent = open;
}
async function refresh() { S = await api('GET', '/api/state'); updateBadges(); }

(async () => {
  await refresh();
  renderChips();
  let tab = 'search'; try { tab = localStorage.getItem('pf-tab') || 'search'; } catch { /* egal */ }
  showTab(tab);
  const q = new URLSearchParams(location.search).get('q');
  if (q) { showTab('search'); $('#q').value = q; search(q); }
  setInterval(() => refresh().then(() => { if (!$('#tab-watch').hidden) renderWatch(); }).catch(() => {}), 5 * 60e3);
})();
