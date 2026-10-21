/* Werkstatt-Anzeige: fragt alle paar Sekunden nur die Aenderungsnummer ab und laedt bei Aenderung neu. */
(() => {
'use strict';
const qs = new URLSearchParams(location.search);
const TOKEN = (qs.get('t') || '').replace(/[^0-9a-fA-F]/g, '').toLowerCase(); // Leerzeichen/Zeilenumbrueche vom Kopieren entfernen
const RAW_LEN = (qs.get('t') || '').trim().length;
let lang = qs.get('l') === 'da' ? 'da' : 'de';
const POLL_MS = 4000;
const T = {
  de: { overdue: 'Überfällig', today: 'Heute', tomorrow: 'Morgen', later: 'Später', nodate: 'Ohne Termin', unpaid: 'UNBEZAHLT', pcs: 'Stk.', cap: 'Freie Kapazität', status: 'Status', none: 'Keine offenen Aufträge', more: 'weitere Aufträge …', bad: 'Link ungültig', revoked: 'Link gesperrt – bitte in den Einstellungen einen neuen erzeugen', short: 'Link unvollständig ({0} von 64 Zeichen) – bitte den ganzen Link kopieren', server: 'Server antwortet nicht richtig (Code {0})', free: 'frei', full: 'voll', many: 'viel frei', some: 'halb', few: 'wenig', capSub: 'Freie Stunden je Tag',
    st: { inquiry: 'Angefragt', approval: 'Freigabe', material: 'Material bestellt', production: 'In Produktion', done: 'Fertig', delivered: 'Abgeholt' } },
  da: { overdue: 'Forfaldne', today: 'I dag', tomorrow: 'I morgen', later: 'Senere', nodate: 'Uden dato', unpaid: 'UBETALT', pcs: 'stk.', cap: 'Ledig kapacitet', status: 'Status', none: 'Ingen åbne ordrer', more: 'flere ordrer …', bad: 'Linket er ugyldigt', revoked: 'Linket er spærret – opret et nyt under Indstillinger', short: 'Linket er ufuldstændigt ({0} af 64 tegn) – kopiér hele linket', server: 'Serveren svarer ikke korrekt (kode {0})', free: 'ledig', full: 'fuld', many: 'meget ledigt', some: 'halvt', few: 'lidt', capSub: 'Ledige timer pr. dag',
    st: { inquiry: 'Forespurgt', approval: 'Godkendelse', material: 'Materiale bestilt', production: 'I produktion', done: 'Færdig', delivered: 'Afhentet' } }
};
const SCOL = { inquiry: '#9d94ad', approval: '#38bdf8', material: '#f59e0b', production: '#A855F7', done: '#34d399', delivered: '#6b6479' };
const t = () => T[lang];
const $ = (id) => document.getElementById(id);
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k === 'class') e.className = v; else if (k === 'style') e.style.cssText = v; else e.setAttribute(k, v); }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
const loc = () => lang === 'da' ? 'da-DK' : 'de-DE';

let version = -1, lastJson = '', data = null;

async function get(params) {
  const r = await fetch('../display_api.php?' + new URLSearchParams({ t: TOKEN, ...params }), { cache: 'no-store' });
  let j = null;
  try { j = await r.json(); } catch (e) { /* keine JSON-Antwort */ }
  if (r.status === 403) throw Object.assign(new Error('invalid'), { invalid: true, reason: j && j.error });
  if (!j || !j.ok) throw Object.assign(new Error('http'), { http: r.status });
  return j;
}
const conn = (ok, msg) => { $('conn').classList.toggle('off', !ok); $('conn').title = msg || ''; };

async function tick() {
  try {
    const v = await get({});
    conn(true);
    if (v.version !== version) {
      data = await get({ full: 1 });
      version = data.version;
      draw();
    }
  } catch (e) {
    if (e.invalid) { $('main').replaceChildren(h('div', { class: 'empty-big' }, e.reason === 'revoked' ? t().revoked : t().bad)); $('side').replaceChildren(); conn(false, 'invalid'); return; }
    if (e.http && version < 0) { $('main').replaceChildren(h('div', { class: 'empty-big' }, t().server.replace('{0}', e.http))); }
    conn(false, e.message);
  }
}

function dateLabel(d, today) {
  if (!d) return t().nodate;
  const diff = Math.round((new Date(d + 'T00:00:00') - new Date(today + 'T00:00:00')) / 864e5);
  if (diff < 0) return t().overdue;
  if (diff === 0) return t().today;
  if (diff === 1) return t().tomorrow;
  return new Date(d + 'T00:00:00').toLocaleDateString(loc(), { weekday: 'long', day: '2-digit', month: '2-digit' });
}

function draw() {
  if (!data) return;
  const json = JSON.stringify(data) + lang;
  if (json === lastJson) return; // nichts geaendert: kein Neuzeichnen
  lastJson = json;
  const pm = Object.fromEntries(data.processes.map((p) => [p.key, p]));
  const groups = [];
  const LIMIT = 9;
  let shown = 0, hidden = 0;
  const main = [];
  for (const o of data.orders) {
    const late = o.overdue;
    const key = late ? 'late' : (o.due_date || 'none');
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) { g = { key, late, label: late ? t().overdue : dateLabel(o.due_date, data.today), items: [] }; groups.push(g); }
    g.items.push(o);
  }
  for (const g of groups) {
    const rows = [];
    for (const o of g.items) {
      if (shown >= LIMIT) { hidden++; continue; }
      shown++;
      rows.push(h('div', { class: 'ord' + (g.late ? ' late' : ''), style: `--sc:${SCOL[o.status]}` },
        h('div', { class: 'sc' }),
        h('div', { style: 'min-width:0' }, h('div', { class: 't' }, o.title), h('div', { class: 'c' }, `${o.customer} · ${o.qty} ${t().pcs}`, h('span', { class: 'dots' }, o.processes.map((k) => h('i', { style: `--c:${pm[k] ? pm[k].color : '#A855F7'}`, title: pm[k] ? (lang === 'da' ? pm[k].name_da : pm[k].name_de) : k }))))),
        h('div', { class: 'r' }, h('span', { class: 'pill', style: `--c:${SCOL[o.status]}` }, t().st[o.status]), o.unpaid && h('span', { class: 'unpaid' }, t().unpaid))));
    }
    if (rows.length) main.push(h('div', { class: 'grp' + (g.late ? ' late' : '') }, g.label), ...rows);
  }
  if (hidden) main.push(h('div', { class: 'more' }, `+ ${hidden} ${t().more}`));
  $('main').replaceChildren(...(main.length ? main : [h('div', { class: 'empty-big' }, t().none)]));

  // Kapazitaet: EIN Raster fuer Kopfzeile und Zeilen, damit Tage und Stunden immer exakt untereinander stehen
  const days = data.capacity;
  const nf = new Intl.NumberFormat(loc(), { maximumFractionDigits: 1 });
  const grid = h('div', { class: 'cgrid' }, h('div', { class: 'ch' }));
  for (const d of days) {
    const dt = new Date(d.date + 'T00:00:00');
    grid.append(h('div', { class: 'ch' + (d.date === data.today ? ' today' : '') + (d.weekend ? ' we' : '') },
      h('b', {}, dt.toLocaleDateString(loc(), { weekday: 'short' }).replace('.', '').slice(0, 2)), h('small', {}, dt.getDate())));
  }
  for (const p of data.processes) {
    grid.append(h('div', { class: 'cn' }, h('i', { class: 'cdot', style: `--c:${p.color}` }), lang === 'da' ? p.name_da : p.name_de));
    for (const d of days) {
      const x = d.p[p.key];
      if (d.blocked !== null) { grid.append(h('div', { class: 'cc blk', title: d.blocked || '' }, '🚫')); continue; }
      if (!x || x.cap === 0) { grid.append(h('div', { class: 'cc off' }, '–')); continue; }
      const fr = x.free / x.cap;
      const cls = x.free === 0 ? 'full' : fr < 0.3 ? 'low' : fr < 0.65 ? 'mid' : 'ok';
      grid.append(h('div', { class: `cc ${cls}${d.partial ? ' part' : ''}`, style: `--u:${Math.min(100, Math.round(x.booked / x.cap * 100))}%` },
        x.free === 0 ? t().full : nf.format(x.free / 60), h('i')));
    }
  }
  const capLegend = h('div', { class: 'clegend' }, h('span', { class: 'ok' }, t().many), h('span', { class: 'mid' }, t().some), h('span', { class: 'low' }, t().few), h('span', { class: 'full' }, t().full));
  const legend = h('div', { class: 'legend' }, Object.entries(SCOL).slice(0, 5).map(([k, c]) => h('span', { style: `--c:${c}` }, h('i'), t().st[k])));
  $('side').replaceChildren(
    h('div', { class: 'panel' }, h('h3', {}, t().cap), h('div', { class: 'csub' }, t().capSub), grid, capLegend),
    h('div', { class: 'panel' }, h('h3', {}, t().status), legend));
}

function clock() {
  $('clock').textContent = new Date().toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' });
  // Datumswechsel: neu laden, damit "ueberfaellig" stimmt
  if (data && new Date().toLocaleDateString('sv') !== data.today) { version = -1; }
}

// Vollbild per Klick; Mauszeiger nach Ruhe ausblenden
function fs() { const d = document.documentElement; if (!document.fullscreenElement && d.requestFullscreen) d.requestFullscreen().catch(() => {}); }
$('hint').addEventListener('click', fs);
document.addEventListener('dblclick', fs);
let idle;
const wake = () => { document.body.classList.remove('idle'); clearTimeout(idle); idle = setTimeout(() => document.body.classList.add('idle'), 4000); };
document.addEventListener('mousemove', wake); wake();

// Bildschirm wach halten, wenn der Browser es kann
try { if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {}); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {}); }); } catch (e) { /* optional */ }

if (!/^[0-9a-f]{64}$/.test(TOKEN)) { $('main').replaceChildren(h('div', { class: 'empty-big' }, RAW_LEN ? t().short.replace('{0}', RAW_LEN) : t().bad)); conn(false, 'invalid'); }
else { tick(); setInterval(tick, POLL_MS); }
clock(); setInterval(clock, 5000);
})();
