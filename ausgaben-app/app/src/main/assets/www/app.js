/* AusgabenKompass – Oberfläche und Datenhaltung (alles lokal auf dem Handy). */
(function () {
  'use strict';
  const CATS = P.CATEGORIES;
  const CAT = Object.fromEntries(CATS.map(c => [c.id, c]));
  const KEY = 'ausgabenkompass.v1';
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const h = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const r2 = v => Math.round(v * 100) / 100;

  // ---------- Daten ----------
  const DEFAULT = {
    v: 1, onboarded: false,
    settings: { currency: 'EUR', startDay: 1, defaultBudget: 0 },
    budgets: {}, catLimits: {}, tx: [], recurring: []
  };
  let S;
  try { S = Object.assign({}, DEFAULT, JSON.parse(localStorage.getItem(KEY) || 'null') || {}); }
  catch (e) { S = Object.assign({}, DEFAULT); }
  S.settings = Object.assign({}, DEFAULT.settings, S.settings);
  function save() { localStorage.setItem(KEY, JSON.stringify(S)); pushWidget(); }
  /** Stand fürs Homescreen-Widget an Android übergeben */
  function pushWidget() {
    if (!window.AndroidBridge || !window.AndroidBridge.updateWidget || typeof summary !== 'function') return;
    try {
      const k = periodOf(today()), s = summary(k);
      window.AndroidBridge.updateWidget(JSON.stringify({ free: s.free, available: s.available, spent: s.spent, end: s.end, label: MONTHN[+k.slice(5) - 1], currency: S.settings.currency }));
    } catch (e) { }
  }

  // ---------- Datum & Zeitraum ----------
  const today = () => { const d = new Date(); return P.iso(d.getFullYear(), d.getMonth() + 1, d.getDate()); };
  const toDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const fmtIso = d => P.iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
  const daysIn = (y, m) => new Date(y, m, 0).getDate();
  const MONTHN = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

  function periodOf(dateStr) {
    const sd = S.settings.startDay;
    let [y, m, d] = dateStr.split('-').map(Number);
    if (d < Math.min(sd, daysIn(y, m))) { m--; if (m < 1) { m = 12; y--; } }
    return y + '-' + String(m).padStart(2, '0');
  }
  function periodRange(key) {
    const [y, m] = key.split('-').map(Number);
    const sd = S.settings.startDay;
    const start = new Date(y, m - 1, Math.min(sd, daysIn(y, m)));
    const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
    const next = new Date(ny, nm - 1, Math.min(sd, daysIn(ny, nm)));
    const end = new Date(next.getTime() - 86400000);
    return { start: fmtIso(start), end: fmtIso(end) };
  }
  function shiftPeriod(key, n) {
    let [y, m] = key.split('-').map(Number);
    m += n; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; }
    return y + '-' + String(m).padStart(2, '0');
  }
  const monthsBetween = (a, b) => { const [y1, m1] = a.split('-').map(Number), [y2, m2] = b.split('-').map(Number); return (y2 - y1) * 12 + (m2 - m1); };
  function periodLabel(key) {
    const [y, m] = key.split('-').map(Number);
    return MONTHN[m - 1] + ' ' + y;
  }
  function fmtDay(s) { const d = toDate(s); return WD[d.getDay()] + ', ' + d.getDate() + '. ' + MONTHN[d.getMonth()].slice(0, 3) + '.'; }
  function fmtShort(s) { const d = toDate(s); return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getFullYear()).slice(2); }

  /** Fälligkeitsdatum einer Fixkosten-Buchung im Zeitraum (oder null, falls in diesem Zeitraum nicht fällig) */
  function dueDate(rec, key) {
    const iv = rec.interval || 1;
    const anchor = rec.anchor || rec.startPeriod || key;
    const diff = monthsBetween(anchor, key);
    if (diff < 0 || diff % iv !== 0) return null;
    if (rec.endPeriod && monthsBetween(key, rec.endPeriod) < 0) return null;
    const { start, end } = periodRange(key);
    const s = toDate(start);
    for (let k = 0; k < 2; k++) {
      const y = s.getFullYear(), m = s.getMonth() + 1 + k;
      const yy = m > 12 ? y + 1 : y, mm = m > 12 ? m - 12 : m;
      const d = P.iso(yy, mm, Math.min(rec.day || 1, daysIn(yy, mm)));
      if (d >= start && d <= end) return d;
    }
    return start;
  }

  /** Fällige Fixkosten automatisch buchen. */
  function applyRecurring() {
    const t = today(), cur = periodOf(t);
    let added = 0;
    for (const rec of S.recurring) {
      if (!rec.active) continue;
      const first = rec.startPeriod || cur;
      for (let k = first; monthsBetween(k, cur) >= 0; k = shiftPeriod(k, 1)) {
        const d = dueDate(rec, k);
        if (!d || d > t) continue;
        if ((rec.skipped || []).includes(k)) continue;
        if (S.tx.some(x => x.recId === rec.id && periodOf(x.date) === k)) continue;
        S.tx.push({ id: uid(), date: d, amount: rec.amount, type: rec.type, merchant: rec.name, category: rec.category, source: 'fix', recId: rec.id, items: [], note: '' });
        added++;
      }
    }
    if (added) save();
    return added;
  }

  // ---------- Berechnungen ----------
  function txIn(key) { const { start, end } = periodRange(key); return S.tx.filter(x => x.date >= start && x.date <= end); }
  function budgetOf(key) { return S.budgets[key] != null ? S.budgets[key] : (S.settings.defaultBudget || 0); }
  function plannedIn(key) {
    const t = today();
    const out = [];
    for (const rec of S.recurring) {
      if (!rec.active) continue;
      if (rec.startPeriod && monthsBetween(rec.startPeriod, key) < 0) continue;
      const d = dueDate(rec, key);
      if (!d) continue;
      if ((rec.skipped || []).includes(key)) continue;
      if (S.tx.some(x => x.recId === rec.id && periodOf(x.date) === key)) continue;
      if (d <= t && key === periodOf(t)) continue; // wird gleich gebucht
      out.push({ rec, date: d });
    }
    return out.sort((a, b) => a.date < b.date ? -1 : 1);
  }
  function summary(key) {
    const list = txIn(key);
    const budget = budgetOf(key);
    const spent = r2(list.filter(x => x.type === 'expense').reduce((s, x) => s + x.amount, 0));
    const income = r2(list.filter(x => x.type === 'income' && !x.excluded).reduce((s, x) => s + x.amount, 0));
    const planned = plannedIn(key);
    const plannedExp = r2(planned.filter(p => p.rec.type === 'expense').reduce((s, p) => s + p.rec.amount, 0));
    const plannedInc = r2(planned.filter(p => p.rec.type === 'income').reduce((s, p) => s + p.rec.amount, 0));
    const available = r2(budget + income + plannedInc);
    const free = r2(available - spent - plannedExp);
    const { start, end } = periodRange(key);
    const t = today();
    let daysLeft = null;
    if (t >= start && t <= end) daysLeft = Math.round((toDate(end) - toDate(t)) / 86400000) + 1;
    return { list, budget, spent, income, planned, plannedExp, plannedInc, available, free, daysLeft, start, end };
  }
  function byCategory(list) {
    const m = {};
    list.filter(x => x.type === 'expense').forEach(x => { m[x.category] = r2((m[x.category] || 0) + x.amount); });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }

  // ---------- Formatierung ----------
  let NF;
  function money(v, sign) {
    if (!NF || NF.cur !== S.settings.currency) {
      NF = new Intl.NumberFormat('de-DE', { style: 'currency', currency: S.settings.currency });
      NF.cur = S.settings.currency;
    }
    const s = NF.format(Math.abs(v));
    if (sign === 'out') return '−' + s;
    if (sign === 'in') return '+' + s;
    return (v < 0 ? '−' : '') + s;
  }
  const num = v => (v == null || v === '') ? '' : String(r2(v)).replace('.', ',');
  const readNum = s => { const v = P.parseAmount(String(s).replace(/[^\d,.\-]/g, '')); return v == null ? 0 : v; };
  const catIco = id => { const c = CAT[id] || CAT.sonstiges; return `<div class="ico cat" style="background:${c.color}1f;color:${c.color}">${svg('c_' + (CAT[id] ? id : 'sonstiges'))}</div>`; };
  /** Eigene Symbole (tools/icons.py): Linien + halbtransparente Akzentflächen */
  const svg = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${(window.ICONS[k] || []).map(([d, t]) =>
    (t !== 'l' ? `<path d="${d}" fill="currentColor" fill-opacity=".3" stroke="none"/>` : '') + (t !== 'd' ? `<path d="${d}"/>` : '')).join('')}</svg>`;
  const rbtn = (k, alt) => `<div class="rbtn${alt ? ' alt' : ''}">${svg(k)}</div>`;
  /** Ring wie im Widget: Anteil des noch freien Geldes */
  function ringSvg(ratio, size, neg) {
    const sw = 9, r = (size - sw * 2.2) / 2, c = size / 2, C = 2 * Math.PI * r;
    const p = Math.max(0, Math.min(1, ratio));
    const warn = !neg && p < 0.15;
    const a = neg ? '#F87171' : warn ? '#FBBF24' : '#5EEAD4', b = neg ? '#DC2626' : warn ? '#F97316' : '#34D399';
    const id = 'g' + Math.random().toString(36).slice(2, 7);
    const arc = neg ? `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${b}" stroke-width="${sw}"/>`
      : `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="url(#${id})" stroke-width="${sw * 1.9}" stroke-opacity=".22" stroke-linecap="round" stroke-dasharray="${C * p} ${C}" transform="rotate(-90 ${c} ${c})"/>
         <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="url(#${id})" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${C * p} ${C}" transform="rotate(-90 ${c} ${c})"/>`;
    return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
      <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="${sw}"/>${p > 0 || neg ? arc : ''}
      <text x="${c}" y="${c + (neg ? 9 : 3)}" text-anchor="middle" font-size="${neg ? 26 : 21}" font-weight="800" fill="#fff" font-family="Roboto Condensed, system-ui, sans-serif">${neg ? '!' : Math.round(p * 100) + '%'}</text>
      ${neg ? '' : `<text x="${c}" y="${c + 17}" text-anchor="middle" font-size="9.5" font-weight="700" fill="rgba(230,255,250,.7)" letter-spacing=".6">ÜBRIG</text>`}</svg>`;
  }
  const ic = (k, cls) => `<span class="ic ${cls || ''}">${svg(k)}</span>`;
  const catBtn = (v, small) => { const c = CAT[v] || CAT.sonstiges; return `<button type="button" class="cat-btn${small ? ' sm' : ''}" data-action="pickCat" data-v="${c.id}"><span class="cb-ico" style="color:${c.color};background:${c.color}1f">${svg('c_' + c.id)}</span><span class="cb-name">${h(c.name)}</span><span class="cb-arr">›</span></button>`; };
  function setCatBtn(btn, v) { const t = document.createElement('div'); t.innerHTML = catBtn(v, btn.classList.contains('sm')); const n = t.firstChild; if (btn.dataset.manual) n.dataset.manual = '1'; if (btn.id) n.id = btn.id; if (btn.dataset.c) n.dataset.c = btn.dataset.c; btn.replaceWith(n); return n; }
  function catPicker(current, cb) {
    const m = modal(`${head('Kategorie wählen')}<div class="cat-grid">${CATS.map(c => `<button class="cat-tile ${c.id === current ? 'active' : ''}" data-pick="${c.id}"><span class="ct-ico" style="color:${c.color};background:${c.color}1f">${svg('c_' + c.id)}</span><span>${h(c.name)}</span></button>`).join('')}</div>`);
    m.addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (b) { closeModal(); cb(b.dataset.pick); } });
  }
  /** Gelernte Kategorie (was du früher für diesen Händler gewählt hast), sonst Erkennung über Stichwörter */
  const learnKey = t => P.normalizePayee(t) || String(t || '').toLowerCase().trim();
  function guessCat(text, income) {
    if (income) return 'einnahme';
    const k = learnKey(text);
    if (k && S.learn && S.learn[k]) return S.learn[k];
    return P.guessCategory(text);
  }
  function learn(merchant, cat) { const k = learnKey(merchant); if (!k || !cat) return; S.learn = S.learn || {}; S.learn[k] = cat; }
  const KNOWN_SHOPS = ['REWE', 'EDEKA', 'Lidl', 'ALDI', 'Netto', 'Penny', 'Kaufland', 'Norma', 'Globus', 'dm', 'Rossmann', 'Müller', 'Amazon', 'Zalando', 'Otto', 'eBay', 'IKEA', 'OBI', 'Bauhaus', 'Hornbach', 'Action', 'Aral', 'Shell', 'Esso', 'JET', 'TotalEnergies', 'McDonald\'s', 'Burger King', 'Starbucks', 'Bäckerei', 'Apotheke', 'Deutsche Bahn', 'MediaMarkt', 'Saturn', 'H&M', 'C&A', 'Primark', 'Deichmann', 'Decathlon', 'Fressnapf', 'Føtex', 'Bilka', 'Rema 1000', 'Coop', 'Matas', 'Netflix', 'Spotify', 'Lieferando'];
  function shopSuggestions(q) {
    q = q.trim().toLowerCase(); if (!q) return [];
    const freq = {};
    S.tx.forEach(x => { if (x.merchant) freq[x.merchant] = (freq[x.merchant] || 0) + 1; });
    const all = Object.keys(freq).sort((a, b) => freq[b] - freq[a]).concat(KNOWN_SHOPS);
    const seen = new Set(), out = [];
    for (const n of all) { const l = n.toLowerCase(); if (seen.has(l) || l === q) continue; if (l.startsWith(q) || (q.length >= 3 && l.includes(q))) { seen.add(l); out.push(n); } if (out.length >= 6) break; }
    return out;
  }
  const SRC = { bank: ['Bank', 'b-bank'], bon: ['Bon', 'b-bon'], online: ['Online', 'b-online'], fix: ['Fix', 'b-fix'], nfc: ['Handy', 'b-nfc'] };
  const srcBadge = s => SRC[s] ? `<span class="badge ${SRC[s][1]}">${SRC[s][0]}</span>` : '';

  // ---------- Native Brücke ----------
  const hasNative = typeof window.AndroidBridge !== 'undefined';
  const Native = window.Native = {
    calls: {}, n: 0,
    call(method, ...args) {
      return new Promise((res, rej) => {
        if (!hasNative) return rej(new Error('Nur in der Android-App verfügbar'));
        const id = 'r' + (++this.n);
        this.calls[id] = { res, rej };
        window.AndroidBridge[method](id, ...args);
      });
    },
    resolve(id, json) { const c = this.calls[id]; if (!c) return; delete this.calls[id]; c.res(JSON.parse(json)); },
    reject(id, msg) {
      const c = this.calls[id] || (!id && Object.values(this.calls).pop());
      if (!c) return;
      Object.keys(this.calls).forEach(k => { if (this.calls[k] === c) delete this.calls[k]; });
      c.rej(new Error(msg));
    },
    onWidgetAction(a) {
      closeAll(); busy(false);
      if (a === 'photo') scan('photo');
      else if (a === 'upload') scan('images');
      else if (a === 'amount') addManual('expense');
    },
    onShared(json) {
      const data = JSON.parse(json);
      busy(false);
      if (data.kind === 'receipt') reviewReceipt(P.parseReceipt(data, { online: true }), 'online');
      else reviewImport(P.parseStatement(data), data);
    }
  };

  function busy(on, text) { $('#busy').classList.toggle('hidden', !on); if (text) $('#busyText').textContent = text; }
  let toastT;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 2600); }

  // ---------- Navigation ----------
  let tab = 'home';
  let period = periodOf(today());
  let txFilter = { q: '', cat: '' };

  function render() {
    const cur = periodOf(today());
    $('#monthTitle').innerHTML = h(periodLabel(period)) + (S.settings.startDay > 1 ? `<small>${fmtShort(periodRange(period).start)} – ${fmtShort(periodRange(period).end)}</small>` : (period !== cur ? '<small>zum aktuellen Monat tippen</small>' : ''));
    $$('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    $('.fab').classList.toggle('hidden', tab === 'more');
    const v = $('#view');
    v.innerHTML = ({ home: viewHome, tx: viewTx, fix: viewFix, stats: viewStats, more: viewMore })[tab]();
    if (tab === 'tx') { const q = $('#q'); if (q && txFilter.focus) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }
  }

  // ---------- Übersicht ----------
  function viewHome() {
    const s = summary(period);
    const isCur = period === periodOf(today());
    let html = '';
    if (!S.onboarded) setTimeout(onboarding, 50);
    const pct = v => s.available > 0 ? Math.max(0, Math.min(100, v / s.available * 100)) : 0;
    const ratio = s.available > 0 ? s.free / s.available : 0;
    const chip = s.free < 0 ? ['Über Budget', 'bad'] : (s.available > 0 && ratio < 0.15 ? ['Knapp', 'warn'] : ['Im Plan', 'ok']);
    const perDay = s.daysLeft ? Math.max(0, s.free) / s.daysLeft : null;
    html += `<div class="card hero">
      <div class="hero-top">${ringSvg(ratio, 92, s.free < 0)}
        <div class="hero-info">
          <div class="hero-head"><span class="label">${isCur ? 'Zur Verfügung' : (period < periodOf(today()) ? 'Übrig geblieben' : 'Voraussichtlich zur Verfügung')}</span>${s.available > 0 ? `<span class="chip-st ${chip[1]}">${chip[0]}</span>` : ''}</div>
          <div class="big ${s.free < 0 ? 'neg' : ''}">${money(s.free)}</div>
          <div class="sub">${s.free < 0 ? money(-s.free) + ' über Budget' : `${Math.round(Math.max(0, ratio) * 100)} % von ${money(s.available)} übrig`}</div>
        </div></div>
      <div class="bar" style="margin-top:14px"><i style="width:${pct(s.spent)}%;background:linear-gradient(90deg,#F87171,#FB923C)"></i><i style="width:${pct(s.plannedExp)}%;background:#FBBF24;opacity:.75"></i></div>
      <div class="row">
        <div class="pill"><small>Ausgegeben</small><b>${money(s.spent)}</b></div>
        <div class="pill"><small>Fixkosten offen</small><b>${money(s.plannedExp)}</b></div>
        ${perDay != null ? `<div class="pill"><small>${s.daysLeft === 1 ? 'heute noch' : `pro Tag · ${s.daysLeft} T.`}</small><b>${money(perDay)}</b></div>` : ''}
      </div>
      <div class="hero-actions"><button data-action="editBudget">Startbetrag ${s.budget ? 'ändern' : 'eingeben'}</button></div>
    </div>`;
    if (!s.budget && !s.income) html += `<div class="warn">Gib zuerst ein, wie viel Geld du in diesem Monat zur Verfügung hast – dann rechnet die App aus, was noch übrig ist.</div>`;
    else if (s.free < 0) html += `<div class="warn danger">Achtung: Du liegst ${money(-s.free)} über deinem Budget.</div>`;
    else if (s.available > 0 && s.free / s.available < 0.15 && isCur) html += `<div class="warn">Nur noch ${Math.round(s.free / s.available * 100)} % deines Geldes stehen dir zur Verfügung.</div>`;

    const pend = (S.pending || []);
    if (pend.length && isCur) {
      html += `<div class="card nfc-card"><h3><span>${ic('u_nfc', 'inl')} Neue Handyzahlungen</span>${pend.length > 1 ? '<button class="link" data-action="payAll">Alle übernehmen</button>' : ''}</h3><ul class="list">${pend.map(p => `<li class="item">${catIco(p.category)}<div class="main" data-action="payEdit" data-id="${p.id}"><div class="title">${h(p.merchant)}</div><div class="sub">${h(p.note || 'Handy')} · ${fmtShort(p.date)}</div></div><div class="amt out">${money(p.amount, 'out')}</div><button class="mini ok" data-action="payOk" data-id="${p.id}" aria-label="Übernehmen">${svg('u_check')}</button><button class="mini no" data-action="payNo" data-id="${p.id}" aria-label="Verwerfen">${svg('u_close')}</button></li>`).join('')}</ul></div>`;
    }
    html += `<div class="quick">
      <button data-action="addManual">${rbtn('amount')}Betrag</button>
      <button data-action="scanPhoto">${rbtn('photo')}Foto</button>
      <button data-action="scanImages">${rbtn('upload')}Hochladen</button>
      <button data-action="importStatement">${rbtn('bank')}Auszug</button>
    </div>`;

    // Kategorien mit Limit / Top-Ausgaben
    const cats = byCategory(s.list);
    const limited = Object.keys(S.catLimits).filter(k => S.catLimits[k] > 0);
    const showCats = Array.from(new Set([...limited, ...cats.slice(0, 5).map(c => c[0])]));
    if (showCats.length) {
      html += `<div class="card"><h3>Wofür geht das Geld? <button class="link" data-action="go" data-tab="stats">Details</button></h3>`;
      for (const id of showCats) {
        const val = (cats.find(c => c[0] === id) || [0, 0])[1];
        const lim = S.catLimits[id];
        const c = CAT[id] || CAT.sonstiges;
        const p = lim ? Math.min(100, val / lim * 100) : (cats[0] ? val / cats[0][1] * 100 : 0);
        const col = lim && val > lim ? 'var(--red)' : (lim && val > lim * 0.85 ? 'var(--amber)' : c.color);
        html += `<div class="cat-row" data-action="filterCat" data-cat="${id}">${catIco(id)}<div class="main"><div class="sumline" style="padding:0"><b>${h(c.name)}</b><span>${money(val)}${lim ? ` <span class="muted">/ ${money(lim)}</span>` : ''}</span></div><div class="bar"><i style="width:${p}%;background:${col}"></i></div></div></div>`;
      }
      html += `</div>`;
    }

    if (s.planned.length) {
      html += `<div class="card"><h3>Kommt noch diesen Monat <button class="link" data-action="go" data-tab="fix">Fixkosten</button></h3><ul class="list">`;
      for (const p of s.planned.slice(0, 6)) html += `<li class="item">${catIco(p.rec.category)}<div class="main"><div class="title">${h(p.rec.name)}</div><div class="sub">fällig ${fmtDay(p.date)}</div></div><div class="amt ${p.rec.type === 'income' ? 'in' : 'out'}">${money(p.rec.amount, p.rec.type === 'income' ? 'in' : 'out')}</div></li>`;
      html += `</ul></div>`;
    }

    const recent = s.list.slice().sort(sortTx).slice(0, 6);
    html += `<div class="card"><h3>Letzte Buchungen <button class="link" data-action="go" data-tab="tx">Alle</button></h3>`;
    html += recent.length ? `<ul class="list">${recent.map(txItem).join('')}</ul>` : `<div class="empty">${ic('tx', 'e-ico')}Noch nichts erfasst.<br>Fotografiere deinen ersten Bon oder importiere einen Kontoauszug.</div>`;
    html += `</div>`;
    return html;
  }
  const sortTx = (a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : (b.created || 0) - (a.created || 0);
  function txItem(x) {
    const c = CAT[x.category] || CAT.sonstiges;
    const sub = [c.name, x.items && x.items.length ? x.items.length + ' Pos.' : '', x.note].filter(Boolean).join(' · ');
    return `<li class="item" data-action="editTx" data-id="${x.id}">${catIco(x.category)}<div class="main"><div class="title">${h(x.merchant || c.name)}${srcBadge(x.source)}</div><div class="sub">${h(sub)}</div></div><div class="amt ${x.type === 'income' ? 'in' : 'out'}">${money(x.amount, x.type === 'income' ? 'in' : 'out')}</div></li>`;
  }

  // ---------- Buchungen ----------
  function viewTx() {
    const s = summary(period);
    let list = s.list.slice().sort(sortTx);
    const q = txFilter.q.trim().toLowerCase();
    if (txFilter.cat) list = list.filter(x => x.category === txFilter.cat);
    if (q) list = list.filter(x => [x.merchant, x.note, ...(x.items || []).map(i => i.name)].join(' ').toLowerCase().includes(q) || String(x.amount).includes(q.replace(',', '.')));
    const used = Array.from(new Set(s.list.map(x => x.category)));
    let html = `<div class="search-wrap">${ic('u_search')}<input id="q" class="search" placeholder="Suchen (Händler, Artikel, Betrag)" value="${h(txFilter.q)}"></div>
      <div class="chips"><button class="chip ${!txFilter.cat ? 'active' : ''}" data-action="filterCat" data-cat="">Alle</button>${used.map(id => `<button class="chip ${txFilter.cat === id ? 'active' : ''}" data-action="filterCat" data-cat="${id}">${CAT[id] ? `<span class="chip-ico" style="color:${CAT[id].color}">${svg('c_' + id)}</span>` + h(CAT[id].name) : id}</button>`).join('')}</div>`;
    if (!list.length) return html + `<div class="card empty">${ic('u_search', 'e-ico')}Keine Buchungen ${q || txFilter.cat ? 'gefunden' : 'in diesem Monat'}.</div>`;
    const sum = r2(list.reduce((t, x) => t + (x.type === 'expense' ? -x.amount : x.amount), 0));
    html += `<div class="muted small" style="margin:0 4px">${list.length} Buchungen · Saldo ${money(sum)}</div>`;
    let day = '';
    let open = false;
    for (const x of list) {
      if (x.date !== day) {
        if (open) html += '</ul></div>';
        day = x.date;
        const daySum = r2(list.filter(y => y.date === day && y.type === 'expense').reduce((t, y) => t + y.amount, 0));
        html += `<div class="day-head"><span>${fmtDay(day)}</span><span>${daySum ? money(daySum, 'out') : ''}</span></div><div class="card" style="padding:4px 12px"><ul class="list">`;
        open = true;
      }
      html += txItem(x);
    }
    if (open) html += '</ul></div>';
    return html;
  }

  // ---------- Fixkosten ----------
  function monthly(rec) { return rec.amount / (rec.interval || 1); }
  function viewFix() {
    const exp = S.recurring.filter(r => r.type === 'expense');
    const inc = S.recurring.filter(r => r.type === 'income');
    const total = r2(exp.filter(r => r.active).reduce((s, r) => s + monthly(r), 0));
    let html = `<div class="card hero"><div class="label">Fixkosten pro Monat</div><div class="big">${money(total)}</div>
      <div class="label">${exp.filter(r => r.active).length} aktive Verträge, Abos & Daueraufträge – werden jeden Monat automatisch gebucht.</div>
      <div class="hero-actions"><button data-action="addRec">${ic('u_plus')} Fixkosten anlegen</button><button data-action="importStatement">${ic('bank')} Aus Auszug erkennen</button></div></div>`;
    const block = (title, list) => {
      if (!list.length) return '';
      let b = `<div class="card"><h3>${title}</h3><ul class="list">`;
      for (const r of list.slice().sort((a, b) => (a.day || 1) - (b.day || 1))) {
        const iv = { 1: 'monatlich', 3: 'vierteljährlich', 6: 'halbjährlich', 12: 'jährlich' }[r.interval || 1];
        b += `<li class="item ${r.active ? '' : 'muted'}" data-action="editRec" data-id="${r.id}">${catIco(r.category)}<div class="main"><div class="title">${h(r.name)}</div><div class="sub">${iv}, am ${r.day}. · ${h((CAT[r.category] || CAT.sonstiges).name)}${r.active ? '' : ' · pausiert'}</div></div><div class="amt ${r.type === 'income' ? 'in' : 'out'}">${money(r.amount, r.type === 'income' ? 'in' : 'out')}</div></li>`;
      }
      return b + '</ul></div>';
    };
    html += block('Ausgaben', exp) + block('Regelmäßige Einnahmen', inc);
    if (!S.recurring.length) html += `<div class="card empty">${ic('fix', 'e-ico')}Noch keine Fixkosten.<br>Importiere einen Kontoauszug – Miete, Versicherungen, Abos & Co. werden automatisch erkannt.</div>`;
    return html;
  }

  // ---------- Statistik ----------
  function donut(entries, total) {
    const R = 52, C = 2 * Math.PI * R;
    let off = 0, segs = '';
    for (const [id, v] of entries) {
      const len = total ? v / total * C : 0;
      segs += `<circle r="${R}" cx="70" cy="70" fill="none" stroke="${(CAT[id] || CAT.sonstiges).color}" stroke-width="22" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"/>`;
      off += len;
    }
    return `<svg width="140" height="140" viewBox="0 0 140 140"><circle r="${R}" cx="70" cy="70" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="22"/>${segs}<text x="70" y="67" text-anchor="middle" font-size="11" fill="#8FB3AE">Ausgaben</text><text x="70" y="84" text-anchor="middle" font-size="14" font-weight="700" fill="#ECFEFA">${h(money(total).replace(/,\d\d/, ''))}</text></svg>`;
  }
  function viewStats() {
    const s = summary(period);
    const cats = byCategory(s.list);
    let html = '';
    if (cats.length) {
      html += `<div class="card"><h3>Ausgaben nach Kategorie</h3><div class="donut-wrap">${donut(cats, s.spent)}<div class="legend">${cats.slice(0, 8).map(([id, v]) => `<div><i style="background:${(CAT[id] || CAT.sonstiges).color}"></i><span>${h((CAT[id] || CAT.sonstiges).name)}</span><b>${Math.round(v / s.spent * 100)}%</b></div>`).join('')}</div></div>
      <ul class="list" style="margin-top:8px">${cats.map(([id, v]) => `<li class="item" data-action="filterCat" data-cat="${id}">${catIco(id)}<div class="main"><div class="title">${h((CAT[id] || CAT.sonstiges).name)}</div><div class="sub">${s.list.filter(x => x.category === id && x.type === 'expense').length} Buchungen${S.catLimits[id] ? ' · Limit ' + money(S.catLimits[id]) : ''}</div></div><div class="amt">${money(v)}</div></li>`).join('')}</ul></div>`;
    } else html += `<div class="card empty">${ic('stats', 'e-ico')}Für ${h(periodLabel(period))} gibt es noch keine Ausgaben.</div>`;

    // Verlauf 6 Monate
    const months = Array.from({ length: 6 }, (_, i) => shiftPeriod(period, i - 5));
    const vals = months.map(k => summary(k).spent);
    const max = Math.max(1, ...vals);
    html += `<div class="card"><h3>Verlauf (6 Monate)</h3><div class="chart-bars">${months.map((k, i) => `<div class="col ${k === period ? 'cur' : ''}" data-action="setPeriod" data-p="${k}"><b>${vals[i] ? Math.round(vals[i]) : ''}</b><i style="height:${vals[i] / max * 110}px"></i>${MONTHN[+k.slice(5) - 1].slice(0, 3)}</div>`).join('')}</div>
      <div class="sumline muted"><span>Durchschnitt</span><b>${money(vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.filter(Boolean).length))}</b></div></div>`;

    // Top-Händler
    const mer = {};
    s.list.filter(x => x.type === 'expense').forEach(x => { const k = (x.merchant || '–').trim(); mer[k] = mer[k] || { v: 0, n: 0 }; mer[k].v += x.amount; mer[k].n++; });
    const top = Object.entries(mer).sort((a, b) => b[1].v - a[1].v).slice(0, 8);
    if (top.length) html += `<div class="card"><h3>Wo du am meisten ausgibst</h3>${top.map(([k, o]) => `<div class="sumline"><span>${h(k)} <span class="muted">(${o.n}×)</span></span><b>${money(o.v)}</b></div>`).join('')}</div>`;

    // Artikel (aus Bons)
    const art = {};
    s.list.forEach(x => (x.items || []).forEach(i => { const k = i.name.toLowerCase(); art[k] = art[k] || { name: i.name, v: 0, n: 0 }; art[k].v += i.price; art[k].n++; }));
    const topA = Object.values(art).sort((a, b) => b.v - a.v).slice(0, 8);
    if (topA.length) html += `<div class="card"><h3>Teuerste Artikel (aus Bons)</h3>${topA.map(o => `<div class="sumline"><span>${h(o.name)} <span class="muted">(${o.n}×)</span></span><b>${money(o.v)}</b></div>`).join('')}</div>`;
    return html;
  }

  // ---------- Mehr ----------
  function viewMore() {
    const st = S.settings;
    return `<div class="card"><h3>Einstellungen</h3>
      <button class="set-row" data-action="setDefaultBudget"><span>Standard-Startbetrag pro Monat</span><span class="v">${st.defaultBudget ? money(st.defaultBudget) : 'nicht gesetzt'} ›</span></button>
      <button class="set-row" data-action="setStartDay"><span>Monat beginnt am (z. B. Gehaltstag)</span><span class="v">${st.startDay}. ›</span></button>
      <button class="set-row" data-action="setCurrency"><span>Währung</span><span class="v">${st.currency} ›</span></button>
      <button class="set-row" data-action="nfcSetup"><span class="sr">${ic('u_nfc')}Handyzahlungen automatisch erfassen</span><span class="v">${helperInstalled() && nfcActive() ? (S.settings.autoPay ? 'automatisch' : 'mit Nachfrage') : 'einrichten'} ›</span></button>
      <button class="set-row" data-action="setLimits"><span>Limits pro Kategorie</span><span class="v">${Object.values(S.catLimits).filter(Boolean).length} gesetzt ›</span></button>
    </div>
    <div class="card"><h3>Daten</h3>
      <button class="set-row" data-action="backup"><span class="sr">${ic('u_save')}Sicherung speichern</span><span class="v">›</span></button>
      <button class="set-row" data-action="restore"><span class="sr">${ic('u_open')}Sicherung laden</span><span class="v">›</span></button>
      <button class="set-row" data-action="exportCsv"><span class="sr">${ic('u_table')}Buchungen als CSV (Excel)</span><span class="v">›</span></button>
      <button class="set-row red" data-action="wipe"><span class="sr">${ic('u_trash')}Alle Daten löschen</span><span class="v">›</span></button>
    </div>
    <div class="card"><h3>So funktioniert's</h3>
      <div class="small" style="color:#334155">
      <p><b>1. Startbetrag:</b> Gib am Monatsanfang ein, was du zur Verfügung hast. Die App zeigt dir, was dir nach Ausgaben <i>und</i> noch offenen Fixkosten wirklich zur Verfügung steht – und wie viel du pro Tag ausgeben kannst.</p>
      <p><b>2. Kontoauszug:</b> Lade die CSV-Datei (Online-Banking → Umsätze → Export) oder das PDF hoch. Miete, Versicherungen, Abos & Co. werden erkannt und ab dann jeden Monat automatisch eingeplant. Doppelte Buchungen (z. B. Bon + Kartenzahlung) werden erkannt.</p>
      <p><b>3. Bons:</b> Fotografiere den Kassenbon – Händler, Datum, Artikel und Summe werden ausgelesen und abgezogen.</p>
      <p><b>4. Online-Bestellungen:</b> Mach einen Screenshot der Bestellbestätigung und lade ihn hoch – oder teile ihn direkt aus der Galerie/Mail mit „AusgabenKompass“.</p>
      <p class="muted">Alle Daten bleiben auf deinem Handy. Die Texterkennung funktioniert offline.</p></div>
    </div>
    <div class="muted small" style="text-align:center">AusgabenKompass 1.6</div>`;
  }

  // ---------- Dialoge ----------
  const modals = [];
  function modal(html, onMount) {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal">${html}</div>`;
    bg.addEventListener('click', e => { if (e.target === bg) closeModal(); });
    $('#modalRoot').appendChild(bg);
    modals.push(bg);
    if (onMount) onMount(bg.firstChild);
    return bg.firstChild;
  }
  function closeModal() { const m = modals.pop(); if (m) m.remove(); }
  function closeAll() { while (modals.length) closeModal(); }
  const head = t => `<h2>${t}<button data-action="close" aria-label="Schließen">${svg('u_close')}</button></h2>`;

  window.handleBack = function () {
    if (!$('#busy').classList.contains('hidden')) return true;
    if (modals.length) { closeModal(); return true; }
    if (tab !== 'home') { tab = 'home'; render(); return true; }
    return false;
  };

  function askNumber(title, value, hint, cb) {
    const m = modal(`${head(h(title))}${hint ? `<p class="muted small">${hint}</p>` : ''}<div class="field"><input id="num" class="amount-input" inputmode="decimal" value="${value ? num(value) : ''}" placeholder="0,00"></div><div class="btns"><button class="btn sec" data-action="close">Abbrechen</button><button class="btn" id="ok">Speichern</button></div>`);
    const i = $('#num', m); setTimeout(() => i.focus(), 100);
    const ok = () => { cb(readNum(i.value)); closeModal(); render(); };
    $('#ok', m).onclick = ok; i.onkeydown = e => { if (e.key === 'Enter') ok(); };
  }

  function onboarding() {
    if (modals.length || S.onboarded) return;
    const m = modal(`<div class="onb"><div class="logo">${ringSvg(0.72, 96, false).replace('72%', '€')}</div><h1>Willkommen beim AusgabenKompass</h1>
      <p class="muted">Behalte dein Geld im Blick – ohne Bankzugang, alles bleibt auf deinem Handy.</p>
      <div class="onb-list"><div>${ic('amount')}Startbetrag am Monatsanfang eingeben</div><div>${ic('bank')}Kontoauszug hochladen – Fixkosten werden erkannt & monatlich automatisch gebucht</div><div>${ic('photo')}Bon fotografieren – Artikel & Preise werden ausgelesen</div><div>${ic('upload')}Screenshots von Online-Bestellungen hochladen</div><div>${ic('u_nfc')}Handyzahlungen automatisch erfassen</div></div></div>
      <div class="field"><label>Wie viel Geld hast du diesen Monat zur Verfügung?</label><input id="ob" class="amount-input" inputmode="decimal" placeholder="z. B. 1.800,00"></div>
      <div class="field"><label>Dein Monat beginnt am … (Tag, an dem das Geld kommt)</label><select id="sd">${Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}">${i + 1}.${i === 0 ? ' (Monatsanfang)' : ''}</option>`).join('')}</select></div>
      <div class="field"><label>Währung</label><select id="cur"><option>EUR</option><option>DKK</option><option>CHF</option><option>SEK</option><option>NOK</option><option>GBP</option><option>USD</option><option>PLN</option></select></div>
      <button class="btn block" id="go">Los geht's</button>`);
    $('#go', m).onclick = () => {
      const v = readNum($('#ob', m).value);
      S.settings.startDay = +$('#sd', m).value;
      S.settings.currency = $('#cur', m).value;
      period = periodOf(today());
      if (v) { S.settings.defaultBudget = v; }
      S.onboarded = true; save(); closeModal(); render();
    };
  }

  // ----- Hinzufügen -----
  function openAdd() {
    modal(`${head('Hinzufügen')}<div class="sheet-actions">
      <button data-action="scanPhoto">${rbtn('photo')}<div><b>Kassenbon fotografieren</b><small>Artikel & Preise werden automatisch ausgelesen</small></div></button>
      <button data-action="scanImages">${rbtn('upload')}<div><b>Bild / Screenshot hochladen</b><small>Online-Bestellung, Rechnung, Bon aus der Galerie</small></div></button>
      <button data-action="importStatement">${rbtn('bank')}<div><b>Kontoauszug importieren</b><small>CSV, PDF, CAMT oder Foto – erkennt Fixkosten</small></div></button>
      <button data-action="addManual">${rbtn('amount', true)}<div><b>Ausgabe eingeben</b><small>z. B. Bargeld</small></div></button>
      <button data-action="addIncome">${rbtn('income', true)}<div><b>Einnahme eingeben</b><small>erhöht dein verfügbares Geld</small></div></button>
    </div>`);
  }

  async function scan(kind) {
    closeAll();
    try {
      const promise = Native.call(kind === 'photo' ? 'takePhoto' : 'pickImages');
      busy(true, 'Texterkennung läuft …');
      const res = await promise;
      busy(false);
      const r = P.parseReceipt(res, { online: kind !== 'photo' });
      if (!r.rawText.trim()) { toast('Kein Text erkannt – bitte noch einmal, gerade und gut beleuchtet.'); return; }
      reviewReceipt(r, kind === 'photo' ? 'bon' : 'online');
    } catch (e) { busy(false); if (e.message !== 'abgebrochen') toast(e.message); }
  }


  function reviewReceipt(r, source) {
    const tx = { id: uid(), date: r.date || today(), amount: r.total || 0, type: 'expense', merchant: r.merchant, category: (S.learn && S.learn[learnKey(r.merchant)]) || r.category, source, items: r.items.slice(), note: '', created: Date.now() };
    if (tx.date > today()) tx.date = today();
    txEditor(tx, true, r);
  }

  function addManual(type) {
    closeAll();
    txEditor({ id: uid(), date: today(), amount: 0, type, merchant: '', category: type === 'income' ? 'einnahme' : 'sonstiges', source: 'manual', items: [], note: '', created: Date.now() }, true);
  }

  // ----- Buchung bearbeiten -----
  function txEditor(tx, isNew, scan) {
    const items = (tx.items || []).map(i => Object.assign({}, i));
    const isInc = tx.type === 'income';
    const m = modal(`${head(isNew ? (scan ? (tx.source === 'bon' ? 'Bon prüfen' : 'Bestellung prüfen') : (isInc ? 'Neue Einnahme' : 'Neue Ausgabe')) : 'Buchung')}
      ${scan && !scan.totalFound ? `<div class="warn">Keine Gesamtsumme gefunden – bitte Betrag prüfen.</div>` : ''}
      <div class="seg"><button data-t="expense" class="${!isInc ? 'active' : ''}">Ausgabe</button><button data-t="income" class="${isInc ? 'active' : ''}">Einnahme</button></div>
      <div class="field"><input id="amt" class="amount-input" inputmode="decimal" value="${tx.amount ? num(tx.amount) : ''}" placeholder="0,00"></div>
      <div class="field"><label>Händler / Beschreibung</label><input id="mer" value="${h(tx.merchant)}" placeholder="z. B. REWE" autocomplete="off"><div class="sugg-chips" id="msug"></div></div>
      <div class="grid2"><div class="field"><label>Datum</label><input id="dt" type="date" value="${tx.date}"></div>
      <div class="field"><label>Kategorie</label>${catBtn(tx.category).replace('<button ', '<button id="cat" ')}</div></div>
      <div class="field"><label>Positionen <span class="muted">(optional)</span></label><table class="items-table" id="items"></table>
        <div class="sumline"><button class="btn ghost sm" id="addItem">＋ Position</button><span id="isum" class="muted"></span></div></div>
      <div class="field"><label>Notiz</label><input id="note" value="${h(tx.note)}" placeholder="optional"></div>
      ${tx.type === 'income' && !isNew ? `<label class="set-row"><span>Zum verfügbaren Geld zählen</span><span class="switch"><input type="checkbox" id="cnt" ${tx.excluded ? '' : 'checked'}><span></span></span></label>` : ''}
      ${tx.recId ? `<p class="muted small">${ic('fix', 'inl')} Automatisch gebucht aus Fixkosten.</p>` : ''}
      ${scan ? `<details class="small muted"><summary>Erkannter Text</summary><pre style="white-space:pre-wrap;font-size:11px">${h(scan.rawText)}</pre></details>` : ''}
      <div class="btns">${!isNew ? '<button class="btn red" id="del">Löschen</button>' : '<button class="btn sec" data-action="close">Abbrechen</button>'}<button class="btn" id="sv">Speichern</button></div>`);
    let type = tx.type;
    const getCat = () => $('#cat', m).dataset.v, setCat = v => setCatBtn($('#cat', m), v);
    if (!isNew) $('#cat', m).dataset.manual = '1';
    $$('.seg button', m).forEach(b => b.onclick = () => {
      type = b.dataset.t; $$('.seg button', m).forEach(x => x.classList.toggle('active', x === b));
      if (type === 'income' && getCat() !== 'einnahme') setCat('einnahme');
      if (type === 'expense' && getCat() === 'einnahme') setCat(guessCat($('#mer', m).value));
    });
    const drawItems = () => {
      $('#items', m).innerHTML = items.map((it, i) => `<tr><td><input data-i="${i}" data-k="name" value="${h(it.name)}"></td><td class="p"><input data-i="${i}" data-k="price" inputmode="decimal" value="${num(it.price)}"></td><td class="x"><button data-del="${i}" aria-label="Entfernen">${svg('u_close')}</button></td></tr>`).join('');
      updSum();
    };
    const updSum = () => {
      const s = r2(items.reduce((t, it) => t + (+it.price || 0), 0));
      const total = readNum($('#amt', m).value);
      $('#isum', m).innerHTML = items.length ? `Summe Positionen: <b>${money(s)}</b>${Math.abs(s - total) > 0.01 ? ` <button class="btn ghost sm" id="useSum">übernehmen</button>` : ` <span class="ok-ic">${svg('u_check')}</span>`}` : '';
      const u = $('#useSum', m); if (u) u.onclick = () => { $('#amt', m).value = num(s); updSum(); };
    };
    drawItems();
    $('#items', m).addEventListener('input', e => {
      const i = e.target.dataset.i; if (i == null) return;
      items[i][e.target.dataset.k] = e.target.dataset.k === 'price' ? readNum(e.target.value) : e.target.value;
      updSum();
    });
    $('#items', m).addEventListener('click', e => { const d = e.target.dataset.del; if (d != null) { items.splice(+d, 1); drawItems(); } });
    $('#addItem', m).onclick = () => { items.push({ name: '', price: 0 }); drawItems(); const ins = $$('#items input[data-k=name]', m); ins[ins.length - 1].focus(); };
    $('#amt', m).oninput = updSum;
    const autoCat = () => { if (type !== 'expense' || $('#cat', m).dataset.manual) return; const v = $('#mer', m).value; if (!v.trim()) return; const g = guessCat(v); if (g !== 'sonstiges' || getCat() === 'sonstiges') setCat(g); };
    const drawSugg = () => {
      const list = shopSuggestions($('#mer', m).value);
      $('#msug', m).innerHTML = list.map(n => { const c = CAT[guessCat(n)] || CAT.sonstiges; return `<button type="button" data-shop="${h(n)}"><span style="color:${c.color}">${svg('c_' + c.id)}</span>${h(n)}</button>`; }).join('');
    };
    $('#mer', m).addEventListener('input', () => { autoCat(); drawSugg(); });
    $('#mer', m).addEventListener('blur', () => setTimeout(() => { if ($('#msug', m)) $('#msug', m).innerHTML = ''; }, 200));
    $('#msug', m).addEventListener('click', e => { const b = e.target.closest('[data-shop]'); if (!b) return; $('#mer', m).value = b.dataset.shop; $('#msug', m).innerHTML = ''; autoCat(); });
    if (isNew && !scan) setTimeout(() => $('#amt', m).focus(), 120);
    if (!isNew) $('#del', m).onclick = () => {
      if (!confirm('Buchung löschen?')) return;
      S.tx = S.tx.filter(x => x.id !== tx.id);
      if (tx.recId) { const rec = S.recurring.find(r => r.id === tx.recId); if (rec) { rec.skipped = rec.skipped || []; rec.skipped.push(periodOf(tx.date)); } }
      save(); closeModal(); render(); toast('Gelöscht');
    };
    $('#sv', m).onclick = () => {
      const amount = Math.abs(readNum($('#amt', m).value));
      if (!amount) { toast('Bitte einen Betrag eingeben'); $('#amt', m).focus(); return; }
      const upd = Object.assign(tx, {
        amount, type, merchant: $('#mer', m).value.trim(), date: $('#dt', m).value || today(), category: getCat(),
        note: $('#note', m).value.trim(), items: items.filter(i => i.name || i.price)
      });
      if ($('#cnt', m)) upd.excluded = !$('#cnt', m).checked;
      if (upd.merchant && type === 'expense') learn(upd.merchant, upd.category);
      if (isNew) {
        S.pending = (S.pending || []).filter(x => x.id !== upd.id);
        // Doppelt? (z. B. Bon bereits über Kontoauszug erfasst)
        const dup = findDuplicate(upd);
        if (dup) {
          const m2 = modal(`${head('Schon erfasst?')}<p>Es gibt bereits eine Buchung über <b>${money(dup.amount)}</b> am ${fmtDay(dup.date)}: <b>${h(dup.merchant)}</b> ${srcBadge(dup.source)}.</p>
            <div class="btns" style="flex-direction:column"><button class="btn" id="merge">Zusammenführen (Positionen übernehmen)</button><button class="btn sec" id="both">Trotzdem neu speichern</button><button class="btn ghost" data-action="close">Zurück</button></div>`);
          $('#merge', m2).onclick = () => {
            if (upd.items.length) dup.items = upd.items;
            if (!dup.merchant || dup.source === 'bank') dup.merchant = upd.merchant || dup.merchant;
            dup.category = upd.category; if (upd.note) dup.note = upd.note;
            save(); closeAll(); render(); toast('Zusammengeführt');
          };
          $('#both', m2).onclick = () => { S.tx.push(upd); save(); closeAll(); render(); toast('Gespeichert: ' + money(upd.amount)); };
          return;
        }
        S.tx.push(upd);
      }
      save(); closeAll(); render();
      toast(isNew ? (type === 'expense' ? 'Abgezogen: ' : 'Hinzugefügt: ') + money(amount) : 'Gespeichert');
    };
  }

  function findDuplicate(t, pool) {
    pool = pool || S.tx;
    const d = toDate(t.date);
    return pool.find(x => x !== t && x.type === t.type && Math.abs(x.amount - Math.abs(t.amount)) < 0.011 && Math.abs((toDate(x.date) - d) / 86400000) <= 4);
  }

  // ----- Kontoauszug -----
  async function importStatement() {
    closeAll();
    try {
      const p = Native.call('pickStatement');
      busy(true, 'Kontoauszug wird gelesen …');
      const res = await p;
      const rows = P.parseStatement(res);
      busy(false);
      reviewImport(rows, res);
    } catch (e) {
      busy(false);
      if (e.message === 'abgebrochen') return;
      if (!hasNative) return browserImport();
      toast(e.message);
    }
  }
  function browserImport() { // nur zum Ausprobieren im Browser
    const i = document.createElement('input'); i.type = 'file'; i.accept = '.csv,.txt,.xml,.sta';
    i.onchange = async () => { const t = await i.files[0].text(); reviewImport(P.parseStatement({ type: 'text', text: t }), {}); };
    i.click();
  }

  function matchRecurring(row) {
    const key = P.normalizePayee(row.payee || row.text);
    if (!key) return null;
    return S.recurring.find(r => r.key && (key === r.key || key.startsWith(r.key) || r.key.startsWith(key)) &&
      (r.type === 'income') === (row.amount > 0) && Math.abs(Math.abs(row.amount) - r.amount) <= Math.max(3, r.amount * 0.3));
  }

  function reviewImport(rows, raw) {
    if (!rows.length) {
      modal(`${head('Nichts gefunden')}<p>In der Datei wurden keine Buchungen erkannt.</p><p class="muted small">Tipp: Im Online-Banking unter „Umsätze“ → „Export“ → <b>CSV</b> wählen. PDFs und Fotos gehen auch, CSV ist aber am genauesten.</p>${raw && raw.text ? `<details class="small muted"><summary>Dateiinhalt</summary><pre style="white-space:pre-wrap;font-size:11px">${h(raw.text.slice(0, 1500))}</pre></details>` : ''}<button class="btn block" data-action="close">OK</button>`);
      return;
    }
    rows.sort((a, b) => a.date < b.date ? -1 : 1);
    const prepared = rows.map(r => {
      const type = r.amount > 0 ? 'income' : 'expense';
      const amount = Math.abs(r.amount);
      const t = { date: r.date, amount, type, text: r.text, payee: r.payee };
      const already = S.tx.find(x => x.source === 'bank' && x.date === r.date && Math.abs(x.amount - amount) < 0.011 && x.raw === r.text);
      const rec = matchRecurring(r);
      const dup = !already && !rec && findDuplicate({ date: r.date, amount, type }, S.tx.filter(x => x.source !== 'bank' && x.source !== 'fix'));
      let status = 'new', on = type === 'expense';
      if (already) { status = 'already'; on = false; }
      else if (dup) { status = 'dup'; on = false; t.dupId = dup.id; }
      else if (rec) { status = 'rec'; on = true; t.recId = rec.id; }
      if (type === 'income') on = false;
      t.status = status; t.on = on;
      t.category = rec ? rec.category : (type === 'income' ? 'einnahme' : (S.learn && S.learn[learnKey(r.payee || P.prettyName(r.text))]) || P.guessCategory(r.text));
      t.merchant = P.prettyName(r.payee || r.text);
      return t;
    });
    const sugg = P.detectRecurring(rows, S.recurring.map(r => r.key)).map(s => Object.assign(s, { on: s.confidence >= 2 && s.type === 'expense' }));
    const expCount = prepared.filter(p => p.type === 'expense').length;
    const sum = r2(prepared.filter(p => p.type === 'expense').reduce((s, p) => s + p.amount, 0));
    const m = modal(`${head('Kontoauszug importieren')}
      <p class="muted small">${rows.length} Buchungen vom ${fmtShort(rows[0].date)} bis ${fmtShort(rows[rows.length - 1].date)} · ${expCount} Ausgaben (${money(sum)}).<br>Einnahmen sind abgewählt, weil dein Startbetrag sie schon enthält – bei Bedarf anhaken.</p>
      ${sugg.length ? `<div class="card sugg-box"><h3>${ic('fix', 'inl')} Erkannte Fixkosten</h3><p class="muted small" style="margin-top:-6px">Angehakte werden ab jetzt jeden Monat automatisch eingeplant und gebucht.</p><div id="sugg"></div></div>` : ''}
      <h3 style="font-size:15px;margin:8px 0 2px">Buchungen</h3><div class="chips"><button class="chip" data-sel="all">Alle wählen</button><button class="chip" data-sel="none">Keine</button><button class="chip" data-sel="exp">Nur Ausgaben</button></div>
      <div id="rows"></div>
      <div class="btns sticky-btns"><button class="btn sec" data-action="close">Abbrechen</button><button class="btn" id="imp">Importieren</button></div>`);
    const SL = { new: ['neu', 'b-new'], already: ['schon importiert', 'b-dup'], dup: ['doppelt (Bon)', 'b-dup'], rec: ['Fixkosten', 'b-fix'] };
    const drawRows = () => {
      $('#rows', m).innerHTML = prepared.map((p, i) => `<div class="imp-row ${p.on ? '' : 'off'}"><input type="checkbox" data-i="${i}" ${p.on ? 'checked' : ''}><div class="main"><div class="title">${h(p.merchant)} <span class="badge ${SL[p.status][1]}">${SL[p.status][0]}</span></div><div class="sub small muted">${fmtShort(p.date)} · ${h(p.text.slice(0, 70))}</div>${catBtn(p.category, true).replace('data-action="pickCat"', `data-c="${i}"`)}</div><div class="amt ${p.type === 'income' ? 'in' : 'out'}">${money(p.amount, p.type === 'income' ? 'in' : 'out')}</div></div>`).join('');
      const btn = $('#imp', m); const n = prepared.filter(p => p.on).length; btn.textContent = n ? `${n} importieren` : 'Nur Fixkosten übernehmen';
    };
    const drawSugg = () => {
      if (!sugg.length) return;
      $('#sugg', m).innerHTML = sugg.map((s, i) => `<div class="imp-row ${s.on ? '' : 'off'}"><input type="checkbox" data-s="${i}" ${s.on ? 'checked' : ''}><div class="main"><div class="title">${h(s.name)}</div><div class="sub small muted">${s.count}× gefunden · am ${s.day}. · ${h((CAT[s.category] || CAT.sonstiges).name)}${s.confidence < 2 ? ' · nur 1× gesehen' : ''}${s.type === 'income' ? ' · nur anhaken, wenn nicht im Startbetrag enthalten' : ''}</div></div><div class="amt ${s.type === 'income' ? 'in' : 'out'}">${money(s.amount, s.type === 'income' ? 'in' : 'out')}</div></div>`).join('');
    };
    drawRows(); drawSugg();
    m.addEventListener('click', e => { const b = e.target.closest('.cat-btn[data-c]'); if (!b) return; const i = +b.dataset.c; catPicker(prepared[i].category, v => { prepared[i].category = v; drawRows(); }); });
    m.addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.i != null) { prepared[+t.dataset.i].on = t.checked; t.closest('.imp-row').classList.toggle('off', !t.checked); drawRows(); }
      if (t.dataset.c != null) prepared[+t.dataset.c].category = t.value;
      if (t.dataset.s != null) { sugg[+t.dataset.s].on = t.checked; t.closest('.imp-row').classList.toggle('off', !t.checked); }
    });
    $$('[data-sel]', m).forEach(b => b.onclick = () => {
      prepared.forEach(p => { p.on = b.dataset.sel === 'all' ? p.status !== 'already' : b.dataset.sel === 'exp' ? (p.type === 'expense' && p.status === 'new' || p.status === 'rec') : false; });
      drawRows();
    });
    $('#imp', m).onclick = () => {
      // 1) neue Fixkosten anlegen
      const newRecs = [];
      for (const s of sugg.filter(s => s.on)) {
        const rec = { id: uid(), name: s.name, amount: s.amount, type: s.type, category: s.category, day: s.day, interval: 1, active: true, key: s.key, startPeriod: periodOf(today()), created: Date.now() };
        S.recurring.push(rec); newRecs.push(rec);
      }
      // 2) Buchungen übernehmen
      let n = 0;
      for (const p of prepared) {
        if (!p.on) continue;
        let recId = p.recId;
        if (!recId) { const nr = newRecs.find(r => r.key === P.normalizePayee(p.payee || p.text)); if (nr) recId = nr.id; }
        const per = periodOf(p.date);
        if (recId) {
          const rec = S.recurring.find(r => r.id === recId);
          if (rec && monthsBetween(per, rec.startPeriod) > 0 && monthsBetween(per, periodOf(today())) <= 0) rec.startPeriod = per;
          const auto = S.tx.find(x => x.recId === recId && x.source === 'fix' && periodOf(x.date) === per);
          if (auto) { Object.assign(auto, { date: p.date, amount: p.amount, source: 'bank', raw: p.text }); n++; continue; }
          if (rec && rec.amount !== p.amount && per === periodOf(today())) rec.amount = p.amount;
        }
        if (p.type === 'expense') learn(p.payee || p.merchant, p.category);
        S.tx.push({ id: uid(), date: p.date, amount: p.amount, type: p.type, merchant: p.merchant, category: p.category, source: 'bank', raw: p.text, recId: recId || undefined, items: [], note: '', created: Date.now() });
        n++;
      }
      save(); applyRecurring(); closeAll();
      period = periodOf(prepared.filter(p => p.on).map(p => p.date).pop() || today());
      if (monthsBetween(period, periodOf(today())) < 0) period = periodOf(today());
      render();
      toast(`${n} Buchungen importiert${newRecs.length ? `, ${newRecs.length} Fixkosten angelegt` : ''}`);
    };
  }

  // ----- Fixkosten bearbeiten -----
  function recEditor(rec) {
    const isNew = !rec;
    rec = rec || { id: uid(), name: '', amount: 0, type: 'expense', category: 'sonstiges', day: 1, interval: 1, active: true, key: '', startPeriod: periodOf(today()) };
    const m = modal(`${head(isNew ? 'Neue Fixkosten' : 'Fixkosten')}
      <div class="seg"><button data-t="expense" class="${rec.type === 'expense' ? 'active' : ''}">Ausgabe</button><button data-t="income" class="${rec.type === 'income' ? 'active' : ''}">Einnahme</button></div>
      <div class="field"><input id="amt" class="amount-input" inputmode="decimal" value="${rec.amount ? num(rec.amount) : ''}" placeholder="0,00"></div>
      <div class="field"><label>Name</label><input id="nm" value="${h(rec.name)}" placeholder="z. B. Miete, Netflix, Handyvertrag"></div>
      <div class="grid2"><div class="field"><label>Fällig am</label><select id="day">${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}" ${rec.day === i + 1 ? 'selected' : ''}>${i + 1}. des Monats</option>`).join('')}</select></div>
      <div class="field"><label>Rhythmus</label><select id="iv">${[[1, 'monatlich'], [3, 'vierteljährlich'], [6, 'halbjährlich'], [12, 'jährlich']].map(([v, t]) => `<option value="${v}" ${(rec.interval || 1) === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div>
      <div class="field"><label>Kategorie</label>${catBtn(rec.category).replace('<button ', '<button id="cat" ')}</div><div class="grid2">
      <div class="field"><label>Erste Buchung im</label><select id="sp">${Array.from({ length: 15 }, (_, i) => shiftPeriod(periodOf(today()), i - 12)).map(k => `<option value="${k}" ${k === (rec.anchor || rec.startPeriod) ? 'selected' : ''}>${periodLabel(k)}</option>`).join('')}</select></div></div>
      <div class="field"><label>Erkennungswort im Kontoauszug <span class="muted">(optional)</span></label><input id="key" value="${h(rec.key)}" placeholder="wird automatisch gesetzt"></div>
      <label class="set-row"><span>Aktiv (wird automatisch gebucht)</span><span class="switch"><input type="checkbox" id="act" ${rec.active ? 'checked' : ''}><span></span></span></label>
      <div class="btns">${isNew ? '<button class="btn sec" data-action="close">Abbrechen</button>' : '<button class="btn red" id="del">Löschen</button>'}<button class="btn" id="sv">Speichern</button></div>`);
    let type = rec.type;
    $$('.seg button', m).forEach(b => b.onclick = () => { type = b.dataset.t; $$('.seg button', m).forEach(x => x.classList.toggle('active', x === b)); if (type === 'income') setCatBtn($('#cat', m), 'einnahme'); });
    $('#nm', m).addEventListener('input', () => { if ($('#cat', m).dataset.manual) return; const g = guessCat($('#nm', m).value, type === 'income'); if (g !== 'sonstiges') setCatBtn($('#cat', m), g); });
    if (!isNew) $('#cat', m).dataset.manual = '1';
    if (isNew) setTimeout(() => $('#amt', m).focus(), 120);
    if (!isNew) $('#del', m).onclick = () => {
      const m2 = modal(`${head('Fixkosten löschen')}<p>„${h(rec.name)}“ wird nicht mehr automatisch gebucht.</p><div class="btns" style="flex-direction:column"><button class="btn red" id="d1">Löschen, bisherige Buchungen behalten</button><button class="btn sec" id="d2">Auch alle bisherigen Buchungen löschen</button></div>`);
      const go = all => { S.recurring = S.recurring.filter(r => r.id !== rec.id); S.tx = all ? S.tx.filter(x => x.recId !== rec.id) : S.tx.map(x => x.recId === rec.id ? Object.assign(x, { recId: undefined }) : x); save(); closeAll(); render(); };
      $('#d1', m2).onclick = () => go(false); $('#d2', m2).onclick = () => go(true);
    };
    $('#sv', m).onclick = () => {
      const amount = Math.abs(readNum($('#amt', m).value));
      const name = $('#nm', m).value.trim();
      if (!amount || !name) { toast('Bitte Name und Betrag eingeben'); return; }
      Object.assign(rec, { amount, name, type, day: +$('#day', m).value, interval: +$('#iv', m).value, category: $('#cat', m).dataset.v, active: $('#act', m).checked, startPeriod: $('#sp', m).value, anchor: $('#sp', m).value, key: $('#key', m).value.trim() || P.normalizePayee(name) });
      if (isNew) S.recurring.push(rec);
      // offene automatische Buchungen des laufenden Monats aktualisieren
      S.tx.forEach(x => { if (x.recId === rec.id && x.source === 'fix' && periodOf(x.date) === periodOf(today())) Object.assign(x, { amount, merchant: name, category: rec.category, type }); });
      const n = applyRecurring(); save(); closeModal(); render();
      toast(n ? `Gespeichert – ${n} fällige Buchung${n > 1 ? 'en' : ''} automatisch erstellt` : 'Gespeichert');
    };
  }

  // ----- Handyzahlungen (Benachrichtigungen von Google Wallet & Banking-Apps) -----
  const nfcActive = () => { try { return !!(window.AndroidBridge && AndroidBridge.hasNotificationAccess && AndroidBridge.hasNotificationAccess()); } catch (e) { return false; } };
  function pullPayments() {
    if (!window.AndroidBridge || !AndroidBridge.takePayments) return 0;
    let arr = [];
    try { arr = JSON.parse(AndroidBridge.takePayments() || '[]'); } catch (e) { return 0; }
    if (!arr.length) return 0;
    S.pending = S.pending || [];
    for (const p of arr) {
      const merchant = p.merchant ? P.prettyName(p.merchant) : 'Kartenzahlung';
      const t = { id: uid(), date: p.date || today(), amount: p.amount, type: 'expense', merchant, category: guessCat(merchant), source: 'nfc', items: [], note: p.app || '', created: p.time || Date.now() };
      if (S.settings.autoPay) { S.tx.push(t); learn(merchant, t.category); } else S.pending.push(t);
    }
    save();
    toast(arr.length === 1 ? `Handyzahlung erkannt: ${money(arr[0].amount)}` : `${arr.length} Handyzahlungen erkannt`);
    return arr.length;
  }
  const helperInstalled = () => { try { return !!(window.AndroidBridge && AndroidBridge.helperInstalled && AndroidBridge.helperInstalled()); } catch (e) { return false; } };
  function nfcSetup() {
    const inst = helperInstalled(), on = inst && nfcActive();
    const m = modal(`${head('Handyzahlungen erfassen')}
      <div class="nfc-hero">${ic('u_nfc', 'big')}<div><b>${on ? 'Aktiv' : inst ? 'Helfer installiert – noch nicht freigeschaltet' : 'Helfer-App fehlt noch'}</b><div class="muted small">${on ? 'Zahlungen werden automatisch erkannt.' : 'Einmal einrichten – dann geht alles von selbst.'}</div></div></div>
      <p class="small">Wenn du mit dem Handy bezahlst (Google Wallet, Samsung Wallet) oder deine Banking-App eine Zahlung meldet, werden <b>Händler und Betrag</b> automatisch erfasst – auch das Widget aktualisiert sich sofort.</p>
      ${inst ? '' : `<p class="small">Dafür gibt es die kleine Helfer-App <b>„AusgabenKompass Zahlungen“</b>. Sie liest nur die Zahlungs-Benachrichtigungen und gibt sie an diese App weiter. Google blockiert solche Apps beim Installieren außerhalb des Play Stores zum Schutz vor Betrugs-Apps – deshalb ist sie getrennt, und nur sie braucht einen der beiden Wege:</p>
      <div class="steps"><b>Weg A – am Handy (ca. 1 Minute)</b><ol><li>Play Store öffnen → Profilbild → <b>Play Protect</b> → Zahnrad → <b>„Apps mit Play Protect scannen“ aus</b></li><li>Helfer-APK antippen und installieren</li><li>Play Protect <b>wieder einschalten</b></li></ol>
      <b>Weg B – am PC</b><ol><li>Am Handy USB-Debugging einschalten, per Kabel verbinden</li><li>Am PC: <code>adb install AusgabenKompass-Zahlungen.apk</code></li></ol></div>`}
      ${inst && !on ? `<button class="btn block" id="helper">${ic('u_nfc')} Helfer öffnen und Zugriff erlauben</button>
      <p class="muted small">Geht der Schalter nicht an („Eingeschränkte Einstellung“)? Im Helfer steht, wie du ihn entsperrst.</p>` : ''}
      <p class="muted small">Gelesen werden nur Benachrichtigungen von Wallet- und Banking-Apps (z. B. Google Wallet, Samsung Wallet, PayPal, N26, DKB, ING, Sparkasse, Comdirect, C24, Revolut, Lunar, MobilePay). Nichts verlässt dein Handy. Doppelte Meldungen (Wallet + Bank) werden zusammengefasst.</p>
      <label class="set-row" style="margin-top:6px"><span>Ohne Nachfrage übernehmen<div class="muted small">Sonst erscheinen neue Zahlungen zum Bestätigen auf der Übersicht.</div></span><span class="switch"><input type="checkbox" id="auto" ${S.settings.autoPay ? 'checked' : ''}><span></span></span></label>
      <button class="btn block" data-action="close" style="margin-top:12px">Fertig</button>`);
    const hb = $('#helper', m); if (hb) hb.onclick = () => { closeModal(); AndroidBridge.openHelper(); };
    $('#auto', m).onchange = e => { S.settings.autoPay = e.target.checked; save(); render(); };
  }

  // ----- Einstellungen -----
  function setLimits() {
    const m = modal(`${head('Limits pro Kategorie')}<p class="muted small">Lege fest, wie viel du pro Monat höchstens ausgeben willst. Leer = kein Limit.</p>
      ${CATS.filter(c => c.id !== 'einnahme').map(c => `<div class="cat-row">${catIco(c.id)}<div class="main">${h(c.name)}</div><input data-l="${c.id}" inputmode="decimal" style="width:100px;padding:8px;border:1px solid var(--line);border-radius:10px;text-align:right" value="${S.catLimits[c.id] ? num(S.catLimits[c.id]) : ''}" placeholder="–"></div>`).join('')}
      <button class="btn block" id="sv" style="margin-top:12px">Speichern</button>`);
    $('#sv', m).onclick = () => { $$('[data-l]', m).forEach(i => { const v = readNum(i.value); if (v) S.catLimits[i.dataset.l] = v; else delete S.catLimits[i.dataset.l]; }); save(); closeModal(); render(); };
  }
  function exportCsv() {
    const rows = [['Datum', 'Typ', 'Betrag', 'Händler', 'Kategorie', 'Quelle', 'Positionen', 'Notiz']];
    S.tx.slice().sort((a, b) => a.date < b.date ? -1 : 1).forEach(x => rows.push([fmtShort(x.date), x.type === 'income' ? 'Einnahme' : 'Ausgabe', num(x.type === 'income' ? x.amount : -x.amount), x.merchant, (CAT[x.category] || CAT.sonstiges).name, x.source, (x.items || []).map(i => i.name + ' ' + num(i.price)).join(' | '), x.note]));
    const csv = rows.map(r => r.map(c => /[;"\n]/.test(String(c)) ? '"' + String(c).replace(/"/g, '""') + '"' : c).join(';')).join('\r\n');
    saveFile('Ausgaben_' + today() + '.csv', csv);
  }
  async function saveFile(name, content) {
    if (!hasNative) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content])); a.download = name; a.click(); return; }
    try { await Native.call('saveFile', name, content); toast('Gespeichert'); } catch (e) { if (e.message !== 'abgebrochen') toast(e.message); }
  }
  async function restore() {
    try {
      const r = await Native.call('pickBackup');
      const d = JSON.parse(r.text);
      if (!d || !Array.isArray(d.tx)) throw new Error('Keine gültige Sicherung');
      if (!confirm(`Sicherung mit ${d.tx.length} Buchungen und ${(d.recurring || []).length} Fixkosten laden? Aktuelle Daten werden ersetzt.`)) return;
      S = Object.assign({}, DEFAULT, d); S.settings = Object.assign({}, DEFAULT.settings, d.settings); save(); render(); toast('Sicherung geladen');
    } catch (e) { if (e.message !== 'abgebrochen') toast(e.message); }
  }

  // ---------- Ereignisse ----------
  const actions = {
    close: closeModal,
    prevMonth: () => { period = shiftPeriod(period, -1); render(); },
    nextMonth: () => { period = shiftPeriod(period, 1); render(); },
    thisMonth: () => { period = periodOf(today()); render(); },
    setPeriod: el => { period = el.dataset.p; render(); },
    go: el => { tab = el.dataset.tab; render(); window.scrollTo(0, 0); },
    openAdd, addManual: () => addManual('expense'), addIncome: () => addManual('income'),
    scanPhoto: () => scan('photo'), scanImages: () => scan('images'), importStatement,
    editBudget: () => askNumber('Startbetrag ' + periodLabel(period), budgetOf(period), 'Wie viel Geld hast du in diesem Monat zur Verfügung? (z. B. Gehalt abzüglich Sparen)', v => {
      S.budgets[period] = v;
      if (!S.settings.defaultBudget) S.settings.defaultBudget = v;
      save();
    }),
    editTx: el => { const x = S.tx.find(t => t.id === el.dataset.id); if (x) txEditor(x, false); },
    filterCat: el => { txFilter.cat = el.dataset.cat; txFilter.focus = false; tab = 'tx'; render(); },
    addRec: () => recEditor(null),
    pickCat: el => catPicker(el.dataset.v, v => { const n = setCatBtn(el, v); n.dataset.manual = '1'; }),
    payOk: el => { const p = (S.pending || []).find(x => x.id === el.dataset.id); if (!p) return; S.pending = S.pending.filter(x => x !== p); S.tx.push(p); learn(p.merchant, p.category); save(); render(); toast('Übernommen: ' + money(p.amount)); },
    payNo: el => { S.pending = (S.pending || []).filter(x => x.id !== el.dataset.id); save(); render(); },
    payEdit: el => { const p = (S.pending || []).find(x => x.id === el.dataset.id); if (p) txEditor(p, true); },
    payAll: () => { const n = (S.pending || []).length; (S.pending || []).forEach(p => { S.tx.push(p); learn(p.merchant, p.category); }); S.pending = []; save(); render(); toast(n + ' Zahlungen übernommen'); },
    nfcSetup,
    editRec: el => recEditor(S.recurring.find(r => r.id === el.dataset.id)),
    setDefaultBudget: () => askNumber('Standard-Startbetrag', S.settings.defaultBudget, 'Gilt für jeden Monat, für den du keinen eigenen Betrag eingibst.', v => { S.settings.defaultBudget = v; save(); }),
    setStartDay: () => {
      const m = modal(`${head('Monatsbeginn')}<p class="muted small">Wenn dein Gehalt z. B. am 28. kommt, läuft dein Monat vom 28. bis 27.</p><div class="field"><select id="sd">${Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}" ${S.settings.startDay === i + 1 ? 'selected' : ''}>${i + 1}.</option>`).join('')}</select></div><button class="btn block" id="ok">Speichern</button>`);
      $('#ok', m).onclick = () => { S.settings.startDay = +$('#sd', m).value; period = periodOf(today()); save(); closeModal(); render(); };
    },
    setCurrency: () => {
      const m = modal(`${head('Währung')}<div class="field"><select id="cur">${['EUR', 'DKK', 'CHF', 'SEK', 'NOK', 'GBP', 'USD', 'PLN'].map(c => `<option ${c === S.settings.currency ? 'selected' : ''}>${c}</option>`).join('')}</select></div><button class="btn block" id="ok">Speichern</button>`);
      $('#ok', m).onclick = () => { S.settings.currency = $('#cur', m).value; save(); closeModal(); render(); };
    },
    setLimits, exportCsv,
    backup: () => saveFile('AusgabenKompass_Sicherung_' + today() + '.json', JSON.stringify(S)),
    restore,
    wipe: () => { if (confirm('Wirklich ALLE Daten löschen?') && confirm('Sicher? Das kann nicht rückgängig gemacht werden.')) { localStorage.removeItem(KEY); location.reload(); } }
  };
  document.addEventListener('click', e => {
    const tb = e.target.closest('.tabs button');
    if (tb) { tab = tb.dataset.tab; if (tab !== 'tx') txFilter = { q: '', cat: '' }; render(); window.scrollTo(0, 0); return; }
    const el = e.target.closest('[data-action]');
    if (el && actions[el.dataset.action]) { e.preventDefault(); actions[el.dataset.action](el); }
  });
  document.addEventListener('input', e => {
    if (e.target.id === 'q') { txFilter.q = e.target.value; txFilter.focus = true; render(); }
  });

  // Start
  $$('.tabs button').forEach(b => b.insertAdjacentHTML('afterbegin', svg(b.dataset.tab)));
  applyRecurring();
  pullPayments();
  render();
  pushWidget();
  // Neuer Monat seit letztem Öffnen? -> Fixkosten buchen
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { applyRecurring(); pullPayments(); render(); pushWidget(); } });
  window.__app = { S: () => S, periodOf, periodRange, summary, applyRecurring, reviewImport, reviewReceipt };
})();
