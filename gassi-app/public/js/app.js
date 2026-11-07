import {
  distance, pathLength, pointAlong, trimEnds, distanceToPath, acceptFix,
  estimateMinutes, dogScore, busyLevel, quietestHour, averageRating, matchRoute,
  formatKm, formatDuration, formatDistanceShort, STATUS, LABELS, DOG_BREEDS, ageGroup, dogInfo, composeBreed, splitBreed,
} from './core.js';
import { createBackend, LS } from './backend.js';

/* global L */
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const initial = (name) => (name || '?').trim().charAt(0).toUpperCase() || '?';

const WARN_RADIUS = 150; // m – „Bitte Abstand“
const MEET_RADIUS = 300; // m – „Gern zusammen“
const ON_ROUTE = 60; // m – zählt als „auf dieser Runde“

// ---------- Profil ----------
// Name, Hund und ID kommen aus dem Konto; Status, Teilen und Demo-Modus sind Geräte-Einstellungen.
const savedPrefs = LS.get('gassi.me', {});
const me = {
  id: null, name: '', dog: '', dogAge: 'erwachsen', email: '', dogBreed: '', dogYears: null, showDog: true,
  status: savedPrefs.status || 'neutral', shareLive: savedPrefs.shareLive ?? true, simulate: !!savedPrefs.simulate,
};
const saveMe = () => LS.set('gassi.me', { status: me.status, shareLive: me.shareLive, simulate: me.simulate });

const state = {
  user: null,
  routes: [], selected: null, view: 'list', tab: 'runden',
  tempC: null, people: [], myPos: null, listSig: '',
  dismissed: new Map(), // Banner, die man weggeklickt hat: id -> Zeitpunkt
  warned: new Set(),
};

// In der Android-App gibt es window.GassiNative: GPS kommt dann aus einem nativen Dienst,
// der auch bei ausgeschaltetem Bildschirm weiter aufzeichnet.
const NATIVE = window.GassiNative || null;

// ---------- Auswahllisten Rasse und Alter ----------
function fillDogSelects() {
  const breeds = ['<option value="">Keine Angabe</option>', '<option>Mischling</option>',
    ...DOG_BREEDS.map((b) => `<option>${esc(b)}</option>`), '<option>Andere Rasse</option>'].join('');
  const years = ['<option value="">Keine Angabe</option>', '<option value="0">unter 1 Jahr</option>',
    ...Array.from({ length: 20 }, (_, i) => `<option value="${i + 1}">${i + 1} ${i ? 'Jahre' : 'Jahr'}</option>`)].join('');
  const mix = ['<option value="">Unbekannt</option>', ...DOG_BREEDS.map((b) => `<option>${esc(b)}</option>`)].join('');
  for (const s of $$('.breed-select')) s.innerHTML = breeds;
  for (const s of $$('.years-select')) s.innerHTML = years;
  for (const s of $$('.mix-select')) s.innerHTML = mix;
  // Bei „Mischling“ die zwei Rassen der Mischung anbieten
  for (const p of ['reg', 'me']) $(`#${p}-breed`).addEventListener('change', () => { $(`#${p}-mix`).hidden = $(`#${p}-breed`).value !== 'Mischling'; });
}
const readBreed = (p) => composeBreed($(`#${p}-breed`).value, $(`#${p}-mix1`).value, $(`#${p}-mix2`).value);
function showBreed(p, breed) {
  const b = splitBreed(breed || '');
  const known = [...$(`#${p}-breed`).options].some((o) => o.value === b.main || o.text === b.main);
  $(`#${p}-breed`).value = known ? b.main : (b.main ? 'Andere Rasse' : '');
  $(`#${p}-mix1`).value = b.mix1; $(`#${p}-mix2`).value = b.mix2;
  $(`#${p}-mix`).hidden = b.main !== 'Mischling';
}
fillDogSelects();
const readYears = (sel) => ($(sel).value === '' ? null : Number($(sel).value));

// ---------- Karte ----------
const map = L.map('map', { zoomControl: false, preferCanvas: true }).setView([54.85, 9.36], 11);
L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
  maxZoom: 19,
  subdomains: 'abc',
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende, Kartenstil <a href="https://www.hotosm.org/">HOT</a>',
}).addTo(map);

const routeLines = new Map();
const peopleMarkers = new Map();
let meMarker = null;
let recLine = null;
let guideLine = null;

function mapPadding() {
  if (innerWidth >= 900) return { paddingTopLeft: [440, 80], paddingBottomRight: [40, 40] };
  return { paddingTopLeft: [20, 70], paddingBottomRight: [20, $('#sheet').offsetHeight + 70] };
}

function drawRoutes() {
  for (const l of routeLines.values()) l.remove();
  routeLines.clear();
  const shown = new Set(filteredRoutes().map((r) => r.id));
  if (state.selected) shown.add(state.selected);
  for (const r of state.routes) {
    if (!shown.has(r.id)) continue;
    const area = r.kind === 'hundeauslauf';
    const line = area
      ? L.polygon(r.points, { color: css('--ok'), weight: 3, fillColor: css('--ok'), fillOpacity: 0.18 })
      : L.polyline(r.points, { color: css('--accent'), weight: 5, opacity: 0.6 });
    line.addTo(map);
    line.bindTooltip(r.name, { sticky: true });
    line.on('click', () => openRoute(r.id));
    routeLines.set(r.id, line);
  }
  styleRouteLines();
}

function styleRouteLines() {
  for (const [id, line] of routeLines) {
    const sel = id === state.selected;
    line.setStyle({ weight: sel ? 8 : (line instanceof L.Polygon ? 3 : 5), opacity: state.selected && !sel ? 0.3 : sel ? 0.95 : 0.6 });
    if (sel) line.bringToFront();
  }
}

// ---------- Runden passend zum Kartenausschnitt nachladen ----------
let lastQuery = null;
let loadTimer = null;
async function loadNearby(force = false) {
  const c = map.getCenter();
  const corner = map.getBounds().getNorthEast();
  const r = Math.min(60, Math.max(4, distance([c.lat, c.lng], [corner.lat, corner.lng]) / 1000 * 1.2));
  if (!force && lastQuery) {
    const moved = distance([c.lat, c.lng], [lastQuery.lat, lastQuery.lng]) / 1000;
    if (moved < lastQuery.r * 0.35 && r <= lastQuery.r * 1.25) return;
  }
  const q = { lat: c.lat, lng: c.lng, r };
  lastQuery = q;
  try {
    const list = await backend.getRoutes(q);
    if (lastQuery !== q) return; // inzwischen weitergeschoben
    const sel = state.selected && routeById(state.selected);
    state.routes = sel && !list.some((x) => x.id === sel.id) ? [...list, sel] : list;
    drawRoutes();
    if (state.view === 'list' && state.tab === 'runden') renderList();
  } catch { /* offline: bisherige Runden behalten */ }
}
map.on('moveend', () => { clearTimeout(loadTimer); loadTimer = setTimeout(() => loadNearby(), 500); });

// ---------- Filter ----------
const FILTERS = [
  { key: 'schatten', label: 'Schattig', test: (r) => (r.attrs.shade ?? 0) >= 60 },
  { key: 'wasser', label: 'Mit Wasser', test: (r) => r.attrs.water === true },
  { key: 'freilauf', label: 'Freilauf', test: (r) => r.attrs.leash === 'frei' },
  { key: 'auslauf', label: 'Hundeauslauf', test: (r) => r.kind === 'hundeauslauf' },
  { key: 'kurz', label: 'bis 3 km', group: 'len', test: (r) => r.distanceKm <= 3 },
  { key: 'mittel', label: '3–6 km', group: 'len', test: (r) => r.distanceKm > 3 && r.distanceKm <= 6 },
  { key: 'lang', label: 'über 6 km', group: 'len', test: (r) => r.distanceKm > 6 },
];
state.filters = new Set(LS.get('gassi.filters', []));

function filteredRoutes() {
  const on = FILTERS.filter((f) => state.filters.has(f.key));
  const plain = on.filter((f) => !f.group);
  const len = on.filter((f) => f.group === 'len');
  return state.routes.filter((r) => plain.every((f) => f.test(r)) && (!len.length || len.some((f) => f.test(r))));
}

function toggleFilter(key) {
  state.filters.has(key) ? state.filters.delete(key) : state.filters.add(key);
  LS.set('gassi.filters', [...state.filters]);
  drawRoutes();
  renderList();
}

function fitAll() {
  const pts = state.routes.flatMap((r) => r.points);
  if (pts.length) map.fitBounds(L.latLngBounds(pts), mapPadding());
}

function setMyPos(lat, lng) {
  state.myPos = [lat, lng];
  if (!meMarker) {
    meMarker = L.marker(state.myPos, { icon: L.divIcon({ className: '', html: '<div class="me-marker"></div>', iconSize: [20, 20] }), zIndexOffset: 1000, keyboard: false }).addTo(map);
    meMarker.bindTooltip('Du');
  } else meMarker.setLatLng(state.myPos);
  checkProximity();
}

// ---------- Hilfsfunktionen für Runden ----------
const routeById = (id) => state.routes.find((r) => r.id === id);
const hourNow = () => new Date().getHours();
const others = () => state.people.filter((p) => p.id !== me.id);
const liveOnRoute = (r) => others().filter((p) => distanceToPath([p.lat, p.lng], r.points) < ON_ROUTE);
const scoreOf = (r) => dogScore(r.attrs, { tempC: state.tempC, dogAge: me.dogAge, km: r.distanceKm, breed: me.dogBreed });

function starsText(avg) {
  if (avg == null) return '';
  return `<span class="stars" aria-label="${avg.toFixed(1)} von 5 Sternen">★</span> ${avg.toFixed(1).replace('.', ',')}`;
}

// ---------- Runden-Liste ----------
const KIND = {
  hundeauslauf: 'Hundeauslauf',
  wanderweg: 'Wanderweg',
  vorgefertigt: 'Gassirunde-Tipp',
  nutzer: 'Von der Community',
};
const kindOf = (r) => r.kind || (r.source === 'vorgefertigt' ? 'vorgefertigt' : 'nutzer');
state.listLimit = 30;

function renderList() {
  const el = $('#panel-runden');
  const ref = state.myPos || [map.getCenter().lat, map.getCenter().lng];
  const list = filteredRoutes()
    .map((r) => ({ r, d: distance(ref, r.points[0]) }))
    .sort((x, y) => x.d - y.d);
  const card = ({ r, d }) => {
    const { score } = scoreOf(r);
    const busy = busyLevel(r.busyness?.[hourNow()] ?? 20);
    const liveN = liveOnRoute(r).length;
    const avg = averageRating(r.ratings);
    const k = kindOf(r);
    return `<li><button class="route-card${r.id === state.selected ? ' active' : ''}" data-id="${esc(r.id)}">
      <span class="score" style="--s:${score}"><b>${score}<small>Hund</small></b></span>
      <span>
        <span class="kind kind-${k}">${esc(KIND[k])}</span>
        <h3>${esc(r.name)}</h3>
        <span class="meta"><span>${formatDistanceShort(d)} entfernt</span><span>${formatKm(r.distanceKm * 1000)} km</span><span>ca. ${estimateMinutes(r.distanceKm, me.dogAge)} Min.</span>${avg != null ? `<span>${starsText(avg)} (${r.ratings.length})</span>` : ''}</span>
        <span class="meta">${r.attrs.shade >= 60 ? '<span class="pill">schattig</span>' : ''}${r.attrs.water ? '<span class="pill">Wasser</span>' : ''}${r.attrs.leash === 'frei' ? '<span class="pill ruhig">Freilauf</span>' : ''}${liveN ? `<span class="pill live">${liveN} ${liveN === 1 ? 'Hund' : 'Hunde'} gerade dort</span>` : `<span class="pill ${busy.key}">jetzt ${busy.label}</span>`}</span>
      </span>
    </button></li>`;
  };
  const chips = FILTERS.map((f) => `<button class="chip-filter${state.filters.has(f.key) ? ' on' : ''}" data-filter="${f.key}" aria-pressed="${state.filters.has(f.key)}">${esc(f.label)}</button>`).join('');
  el.innerHTML = `
    <div class="filters-wrap">
      <button class="filter-arrow left" data-scroll="-1" aria-label="Filter nach links schieben">‹</button>
      <div class="filters" role="group" aria-label="Runden filtern">${chips}</div>
      <button class="filter-arrow right" data-scroll="1" aria-label="Weitere Filter">›</button>
    </div>
    <p class="section-note">${list.length} ${list.length === 1 ? 'Runde' : 'Runden'} ${state.myPos ? 'in deiner Nähe' : 'rund um die Kartenmitte'}${state.filters.size ? ' (gefiltert)' : ''}</p>
    ${list.length ? `<ul class="route-list">${list.slice(0, state.listLimit).map(card).join('')}</ul>` : `<p class="empty">Keine Runde passt zu den Filtern. Nimm einen Filter heraus oder verschiebe die Karte.</p>`}
    ${list.length > state.listLimit ? `<button class="btn secondary small more-btn" data-more>Weitere ${Math.min(30, list.length - state.listLimit)} anzeigen</button>` : ''}
    <p class="hint">Der Hunde-Score (0–100) bewertet Wasser, Schatten, Untergrund, Straßen, Leinenregel und Mülleimer. Hundeausläufe und Wanderwege stammen aus OpenStreetMap (© OpenStreetMap-Mitwirkende, ODbL). Verschiebe die Karte, um Runden in anderen Gegenden zu sehen.</p>`;
  state.listSig = listSignature();
  const f = $('.filters');
  if (f) { f.scrollLeft = state.filterScroll || 0; f.onscroll = () => { state.filterScroll = f.scrollLeft; updateFilterArrows(); }; requestAnimationFrame(updateFilterArrows); }
}

function listSignature() {
  if (!state.people.length) return 'leer';
  return state.routes.map((r) => `${r.id}:${liveOnRoute(r).length}`).join('|');
}

// ---------- Detail einer Runde ----------
function openRoute(id, { fly = true } = {}) {
  const r = routeById(id);
  if (!r) return;
  if (state.selected !== id) clearNav();
  state.selected = id;
  state.view = 'detail';
  switchTab('runden');
  renderDetail();
  styleRouteLines();
  if (fly) map.fitBounds(L.latLngBounds(r.points), mapPadding());
}

function closeDetail() {
  clearNav();
  state.selected = null;
  state.view = 'list';
  styleRouteLines();
  renderList();
}

function renderDetail() {
  const r = routeById(state.selected);
  if (!r) return closeDetail();
  const el = $('#panel-runden');
  const sc = scoreOf(r);
  const minutes = estimateMinutes(r.distanceKm, me.dogAge);
  const h = hourNow();
  const busy = busyLevel(r.busyness?.[h] ?? 20);
  const quiet = quietestHour(r.busyness || new Array(24).fill(20));
  const liveN = liveOnRoute(r).length;
  const avg = averageRating(r.ratings);
  const mine = r.ratings.find((x) => x.userId === me.id);
  const bars = [];
  for (let i = 6; i < 24; i++) {
    const v = r.busyness?.[i] ?? 0;
    bars.push(`<i class="${i === h ? 'now' : ''}" style="height:${Math.max(4, v)}%" title="${i} Uhr: ${busyLevel(v).label}"></i>`);
  }
  const by = r.source === 'vorgefertigt' ? 'Gassirunde-Tipp' : r.source === 'osm' ? `${esc(KIND[kindOf(r)])} · Daten: © OpenStreetMap-Mitwirkende` : `Hinzugefügt von ${esc(r.author || 'Anonym')}`;
  el.innerHTML = `<article class="detail">
    <div class="detail-head"><button class="back" id="back-btn">← Alle Runden</button></div>
    <h2>${esc(r.name)}</h2>
    <p class="sub">${esc(r.area || '')}${r.area ? ' · ' : ''}${by}</p>
    ${r.description ? `<p>${esc(r.description)}</p>` : ''}
    <div class="figures">
      <div><b>${formatKm(r.distanceKm * 1000)}</b><span>Kilometer</span></div>
      <div><b>ca. ${minutes}</b><span>Minuten (${me.dogAge === 'welpe' ? 'Welpe' : me.dogAge === 'senior' ? 'Senior' : 'erwachsener Hund'})</span></div>
      <div><b>${sc.score}</b><span>Hunde-Score</span></div>
    </div>
    <div class="nav-box" id="nav-box">
      <div class="nav-head"><span>Startpunkt von dir aus</span><b id="nav-dist">–</b></div>
      <div class="nav-mode" role="group" aria-label="Verkehrsmittel">
        <button type="button" data-navmode="car">Auto</button>
        <button type="button" data-navmode="foot">Zu Fuß</button>
      </div>
      <p class="nav-result" id="nav-result" hidden></p>
      <div class="nav-actions">
        <button type="button" class="btn secondary small" id="nav-show">Weg dorthin</button>
        <button type="button" class="btn primary small" id="nav-go">Navigation starten</button>
      </div>
    </div>
    ${sc.warnings.length ? `<ul class="warnings">${sc.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}

    <h3 class="list-title">So setzt sich der Score zusammen</h3>
    <ul class="breakdown">${sc.parts.map((p) => `<li${p.unknown ? ' class="unknown"' : ''}><span>${esc(p.label)}</span><span class="bar"><i style="width:${(p.pts / p.max) * 100}%"></i></span><span class="pts">${p.pts}/${p.max}</span></li>`).join('')}</ul>

    <h3 class="list-title">Wie voll ist es?</h3>
    <p style="margin:0">Jetzt ${busy.label}${liveN ? `, <b>${liveN} ${liveN === 1 ? 'Hund' : 'Hunde'} gerade auf der Runde</b>` : ', gerade niemand live auf der Runde'}. Am ruhigsten gegen ${quiet} Uhr.</p>
    <div class="busy-chart" role="img" aria-label="Belebtheit über den Tag, 6 bis 23 Uhr">${bars.join('')}</div>
    <div class="busy-axis"><span>6</span><span>9</span><span>12</span><span>15</span><span>18</span><span>21</span><span>23 Uhr</span></div>
    <p class="hint">Typischer Tagesverlauf. Mit echten Nutzern lernt die App ihn aus den aufgezeichneten Spaziergängen.</p>

    <h3 class="list-title">Gemeinsam gehen</h3>
    <div id="route-meets"><p class="hint">Lade Treffen …</p></div>
    <button type="button" class="btn secondary small" id="meet-propose" style="margin-top:6px">Treffen vorschlagen</button>

    <h3 class="list-title">Bewertungen ${avg != null ? `· ${starsText(avg)} aus ${r.ratings.length}` : ''}</h3>
    ${r.ratings.length ? `<ul class="ratings">${[...r.ratings].sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((x) => `<li><span class="stars">${'★'.repeat(x.stars)}${'☆'.repeat(5 - x.stars)}</span> ${x.text ? esc(x.text) : ''}<div class="who">${esc(x.name)}${x.dog ? ` mit ${esc(x.dog)}` : ''}${x.date ? ` · ${new Date(x.date).toLocaleDateString('de-DE')}` : ''}</div></li>`).join('')}</ul>` : '<p class="hint">Noch keine Bewertungen. Sei die erste Person!</p>'}
    <form class="rate-form" id="rate-form">
      <span class="label">${mine ? 'Deine Bewertung ändern' : 'Runde bewerten'}</span>
      <div class="star-input">
        ${[5, 4, 3, 2, 1].map((n) => `<input type="radio" name="stars" id="rs-${n}" value="${n}"${mine?.stars === n ? ' checked' : ''}><label for="rs-${n}" title="${n} Sterne">★</label>`).join('')}
      </div>
      <textarea id="rate-text" maxlength="500" rows="2" placeholder="Was sollten andere Hundehalter wissen? (optional)" >${esc(mine?.text || '')}</textarea>
      <p class="form-error" id="rate-error" hidden></p>
      <button class="btn primary small" type="submit">Bewertung speichern</button>
    </form>

    ${r.source !== 'vorgefertigt' && me.id && r.authorId === me.id ? `<div class="route-owner"><button class="btn small secondary" id="delete-route-btn">Meine Runde löschen</button></div>` : ''}

    <div class="detail-actions"><button class="btn danger" id="walk-route-btn">Diese Runde laufen</button></div>
  </article>`;
  $('#back-btn').onclick = closeDetail;
  $('#walk-route-btn').onclick = () => requireLogin('Melde dich an, um die Runde zu laufen und aufzuzeichnen.', () => startWalk(r));
  setupNav(r);
  $('#meet-propose').onclick = () => requireLogin('Melde dich an, um ein Treffen vorzuschlagen.', () => openNewMeetup(r));
  loadRouteMeetups(r);
  const del = $('#delete-route-btn');
  if (del) del.onclick = async () => {
    if (!del.dataset.armed) { del.dataset.armed = '1'; del.textContent = 'Wirklich löschen?'; return; }
    try {
      await backend.deleteRoute(r.id);
      state.routes = state.routes.filter((x) => x.id !== r.id);
      drawRoutes(); closeDetail(); toast('Deine Runde wurde gelöscht.');
    } catch (ex) { handleApiError(ex); }
  };
  $('#rate-form').onsubmit = (e) => {
    e.preventDefault();
    const stars = Number($('input[name="stars"]:checked', e.target)?.value);
    const err = $('#rate-error');
    if (!stars) { err.textContent = 'Bitte wähle 1 bis 5 Sterne.'; err.hidden = false; return; }
    const text = $('#rate-text').value.trim();
    requireLogin('Melde dich an, um Runden zu bewerten.', async () => {
      try {
        r.ratings = await backend.rate(r.id, { stars, text });
        toast('Danke! Deine Bewertung ist gespeichert.');
        renderDetail();
      } catch (ex) { if (!handleApiError(ex)) { err.textContent = ex.message; err.hidden = false; } }
    });
  };
  state.listSig = listSignature();
}

// ---------- Navigation zum Startpunkt einer Runde ----------
let navLine = null;
function clearNav() { navLine?.remove(); navLine = null; state.navText = ''; }

/** Eigener Standort: schon bekannt oder einmal abfragen. */
function ensureMyPos() {
  if (state.myPos) return Promise.resolve(state.myPos);
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Dieses Gerät liefert keinen Standort.'));
    navigator.geolocation.getCurrentPosition(
      (p) => { setMyPos(p.coords.latitude, p.coords.longitude); resolve(state.myPos); },
      () => reject(new Error('Standort nicht verfügbar. Bitte den Standortzugriff erlauben.')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
}

const fmtMin = (min) => (min < 60 ? `${Math.round(min)} Min.` : `${Math.floor(min / 60)} Std. ${Math.round(min % 60)} Min.`);

function setupNav(r) {
  const start = r.points[0];
  const showDist = () => {
    const d = distance(state.myPos, start);
    $('#nav-dist').textContent = `${formatDistanceShort(d)} Luftlinie`;
    if (!state.navMode) state.navMode = d > 3000 ? 'car' : 'foot';
    for (const b of $$('[data-navmode]')) b.setAttribute('aria-pressed', String(b.dataset.navmode === state.navMode));
  };
  if (state.myPos) showDist();
  else {
    $('#nav-dist').innerHTML = '<button type="button" class="btn small secondary" id="nav-locate">Entfernung zeigen</button>';
    $('#nav-locate').onclick = () => ensureMyPos().then(showDist).catch((e) => toast(e.message));
    for (const b of $$('[data-navmode]')) b.setAttribute('aria-pressed', String(b.dataset.navmode === (state.navMode || 'car')));
  }
  for (const b of $$('[data-navmode]')) b.onclick = () => {
    state.navMode = b.dataset.navmode;
    for (const x of $$('[data-navmode]')) x.setAttribute('aria-pressed', String(x === b));
    if (navLine) showWay(r);
  };
  $('#nav-show').onclick = () => showWay(r);
  if (navLine && state.navText) { $('#nav-result').hidden = false; $('#nav-result').textContent = state.navText; }
  $('#nav-go').onclick = () => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${start[0]},${start[1]}&travelmode=${(state.navMode || 'car') === 'car' ? 'driving' : 'walking'}`;
    if (NATIVE) NATIVE.openExternal(url); else window.open(url, '_blank', 'noopener');
  };
}

/** Weg vom Standort zum Startpunkt berechnen (OpenStreetMap-Routing) und auf der Karte zeigen. */
async function showWay(r) {
  const out = $('#nav-result');
  out.hidden = false;
  out.textContent = 'Weg wird berechnet …';
  try {
    const me0 = await ensureMyPos();
    const mode = state.navMode || 'car';
    const start = r.points[0];
    const url = `https://routing.openstreetmap.de/routed-${mode}/route/v1/driving/${me0[1]},${me0[0]};${start[1]},${start[0]}?overview=full&geometries=geojson`;
    const d = await (await fetch(url)).json();
    const way = d.routes?.[0];
    if (!way) throw new Error('Kein Weg gefunden.');
    clearNav();
    navLine = L.polyline(way.geometry.coordinates.map(([lo, la]) => [la, lo]), { color: css('--ink'), weight: 5, opacity: 0.75, dashArray: '8 8' }).addTo(map);
    map.fitBounds(navLine.getBounds().extend(L.latLngBounds(r.points)), mapPadding());
    out.textContent = state.navText = `${mode === 'car' ? 'Mit dem Auto' : 'Zu Fuß'}: ${formatDistanceShort(way.distance)} · ca. ${fmtMin(way.duration / 60)}`;
    $('#nav-dist').textContent = `${formatDistanceShort(distance(me0, start))} Luftlinie`;
  } catch (e) {
    if (!state.myPos) { out.textContent = e.message || 'Standort nicht verfügbar.'; return; }
    // Routenplaner nicht erreichbar: wenigstens die Luftlinie zeigen
    clearNav();
    navLine = L.polyline([state.myPos, r.points[0]], { color: css('--ink'), weight: 4, opacity: 0.6, dashArray: '2 10' }).addTo(map);
    map.fitBounds(navLine.getBounds().extend(L.latLngBounds(r.points)), mapPadding());
    out.textContent = state.navText = `Routenplaner gerade nicht erreichbar, Luftlinie ${formatDistanceShort(distance(state.myPos, r.points[0]))}. „Navigation starten“ öffnet Google Maps.`;
  }
}

// ---------- Treffen und Chat ----------
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
function fmtWhen(iso) {
  const d = new Date(iso);
  const today = new Date(); const tomorrow = new Date(Date.now() + 864e5);
  const same = (a, b) => a.toDateString() === b.toDateString();
  const day = same(d, today) ? 'Heute' : same(d, tomorrow) ? 'Morgen' : `${WD[d.getDay()]} ${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}`;
  return `${day}, ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;
}
const meetMembers = (m) => `${m.members.length} ${m.members.length === 1 ? 'Person' : 'Personen'} dabei`;

function meetCard(m) {
  const ref = state.myPos || [map.getCenter().lat, map.getCenter().lng];
  return `<li><button class="meet-card${m.joined ? ' joined' : ''}" data-meet="${esc(m.id)}">
    <span class="meet-when">${esc(fmtWhen(m.startsAt))}</span>
    <b>${esc(m.routeName)}</b>
    <span class="meta"><span>von ${esc(m.creatorName)}${m.creatorDog ? ` & ${esc(m.creatorDog)}` : ''}</span><span>${meetMembers(m)}</span><span>${formatDistanceShort(distance(ref, [m.lat, m.lng]))}</span></span>
    ${m.unread ? `<span class="pill unread-pill">${m.unread} neue ${m.unread === 1 ? 'Nachricht' : 'Nachrichten'}</span>` : m.joined ? '<span class="pill ruhig">Du bist dabei</span>' : ''}
  </button></li>`;
}

async function loadMeetups() {
  const el = $('#panel-treffen');
  if (backend.accounts && !state.user) {
    el.innerHTML = '<div class="login-cta"><p>Melde dich an, um Treffen zu sehen, mitzumachen und im Chat zu schreiben.</p><button class="btn small primary" data-login>Anmelden</button></div>';
    return;
  }
  if (!el.innerHTML) el.innerHTML = '<p class="hint">Lade Treffen …</p>';
  try {
    const c = state.myPos || [map.getCenter().lat, map.getCenter().lng];
    const list = await backend.meetups({ lat: c[0].toFixed(4), lng: c[1].toFixed(4), r: 50 });
    state.meetups = list;
    updateMeetBadge();
    const mine = list.filter((m) => m.joined);
    const near = list.filter((m) => !m.joined);
    el.innerHTML = `
      ${mine.length ? `<h3 class="list-title" style="margin-top:4px">Meine Treffen</h3><ul class="meet-list">${mine.map(meetCard).join('')}</ul>` : ''}
      <h3 class="list-title"${mine.length ? '' : ' style="margin-top:4px"'}>In der Nähe</h3>
      ${near.length ? `<ul class="meet-list">${near.map(meetCard).join('')}</ul>` : '<p class="empty">Gerade ist hier kein Treffen geplant. Öffne eine Runde und tippe auf „Treffen vorschlagen“.</p>'}
      <p class="hint">Treffen sehen nur angemeldete Nutzer. Den Chat eines Treffens lesen und schreiben nur, wer mitmacht.</p>`;
  } catch (ex) { if (!handleApiError(ex)) el.innerHTML = `<p class="empty">${esc(ex.message)}</p>`; }
}

function updateMeetBadge() {
  const n = (state.meetups || []).reduce((s, m) => s + (m.unread || 0), 0);
  $('#meet-count').hidden = !n;
  $('#meet-count').textContent = n;
}

async function loadRouteMeetups(r) {
  const box = $('#route-meets');
  if (!box) return;
  if (backend.accounts && !state.user) { box.innerHTML = '<p class="hint">Melde dich an, um geplante Treffen auf dieser Runde zu sehen.</p>'; return; }
  try {
    const list = await backend.meetups({ route: r.id });
    if (state.selected !== r.id || !$('#route-meets')) return;
    $('#route-meets').innerHTML = list.length
      ? `<ul class="meet-list">${list.map(meetCard).join('')}</ul>`
      : '<p class="hint">Noch kein Treffen auf dieser Runde geplant.</p>';
  } catch { box.innerHTML = '<p class="hint">Treffen konnten nicht geladen werden.</p>'; }
}

function openNewMeetup(r) {
  state.newMeetRoute = r;
  const d = new Date(Date.now() + 3600e3); d.setMinutes(0, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  $('#mn-date').value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  $('#mn-time').value = `${pad(d.getHours())}:00`;
  $('#mn-note').value = '';
  $('#mn-error').hidden = true;
  $('#meet-new-route').textContent = `Runde: ${r.name}`;
  showFromTop($('#meet-new-dialog'), '#meet-new-title');
}

async function submitNewMeetup(e) {
  e.preventDefault();
  const r = state.newMeetRoute;
  const err = $('#mn-error');
  const when = new Date(`${$('#mn-date').value}T${$('#mn-time').value}`);
  if (!$('#mn-date').value || !$('#mn-time').value || Number.isNaN(when.getTime())) { err.textContent = 'Bitte Tag und Uhrzeit wählen.'; err.hidden = false; return; }
  try {
    const m = await backend.createMeetup({ routeId: r.id, routeName: r.name, lat: r.points[0][0], lng: r.points[0][1], startsAt: when.toISOString(), note: $('#mn-note').value.trim() });
    $('#meet-new-dialog').close();
    toast('Dein Treffen ist eingetragen. Andere in der Nähe sehen es jetzt.');
    loadRouteMeetups(r);
    openMeetup(m.id, m);
  } catch (ex) { if (!handleApiError(ex)) { err.textContent = ex.message; err.hidden = false; } }
}

// Treffen-Fenster mit Chat
let chatTimer = null;
async function openMeetup(id, preset = null) {
  state.meetId = id; state.chatAfter = 0; state.chatMsgs = [];
  const dlg = $('#meet-dialog');
  try {
    const m = preset || await backend.meetup(id);
    renderMeetup(m);
    if (!dlg.open) showFromTop(dlg, '#meet-title');
    if (m.joined) pollChat(true);
  } catch (ex) { if (!handleApiError(ex)) toast(ex.message); }
}

function renderMeetup(m) {
  state.meet = m;
  const dist = state.myPos ? `${formatDistanceShort(distance(state.myPos, [m.lat, m.lng]))} von dir` : '';
  const mine = m.creatorId === me.id;
  $('#meet-body').innerHTML = `
    <p class="meet-when big">${esc(fmtWhen(m.startsAt))}</p>
    <h2 id="meet-title" tabindex="-1">${esc(m.routeName)}</h2>
    <p class="hint" style="margin-top:0">Treffpunkt: Start der Runde${dist ? ` · ${dist}` : ''} · vorgeschlagen von ${esc(m.creatorName)}${m.creatorDog ? ` & ${esc(m.creatorDog)}` : ''}</p>
    ${m.note ? `<p class="meet-note">„${esc(m.note)}“</p>` : ''}
    <p class="label" style="margin:10px 0 6px">${meetMembers(m)}</p>
    <div class="member-chips">${m.members.map((x) => `<span class="member-chip">${esc(x.name)}${x.dog ? ` & ${esc(x.dog)}` : ''}</span>`).join('')}</div>
    <div class="meet-actions">
      ${m.joined ? (mine ? '<button class="btn danger small" data-meet-cancel>Treffen absagen</button>' : '<button class="btn secondary small" data-meet-leave>Doch nicht dabei</button>') : '<button class="btn primary small" data-meet-join>Ich bin dabei</button>'}
      <button class="btn secondary small" data-meet-route>Zur Runde & Weg dorthin</button>
    </div>
    <h3 class="list-title">Chat</h3>
    ${m.joined ? '<ul class="chat" id="chat-list"><li class="hint">Noch keine Nachrichten. Schreib zum Beispiel, wann du ankommst.</li></ul>' : '<p class="hint">Mach mit, um den Chat zu lesen und zu schreiben.</p>'}`;
  $('#chat-bar').hidden = !m.joined;
  if (m.joined && state.chatMsgs.length) renderChat();
}

function renderChat() {
  const list = $('#chat-list');
  if (!list) return;
  const atBottom = $('#meet-body').scrollHeight - $('#meet-body').scrollTop - $('#meet-body').clientHeight < 60;
  list.innerHTML = state.chatMsgs.map((x) => `<li class="msg${x.userId === me.id ? ' mine' : ''}">
    ${x.userId === me.id ? '' : `<span class="msg-who">${esc(x.name)}${x.dog ? ` & ${esc(x.dog)}` : ''}</span>`}
    <span class="msg-text">${esc(x.text)}</span>
    <span class="msg-time">${new Date(x.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>
  </li>`).join('') || '<li class="hint">Noch keine Nachrichten. Schreib zum Beispiel, wann du ankommst.</li>';
  if (atBottom || state.chatScroll) { $('#meet-body').scrollTop = $('#meet-body').scrollHeight; state.chatScroll = false; }
}

async function pollChat(first = false) {
  clearTimeout(chatTimer);
  if (!$('#meet-dialog').open || !state.meet?.joined) return;
  try {
    const list = await backend.messages(state.meetId, state.chatAfter);
    // Teilnehmerliste gelegentlich auffrischen (wer ist neu dabei?)
    state.chatTick = (state.chatTick || 0) + 1;
    if (list.length || state.chatTick % 5 === 0) {
      const fresh = await backend.meetup(state.meetId).catch(() => null);
      if (fresh && fresh.members.length !== state.meet.members.length) renderMeetup(fresh);
    }
    if (list.length) {
      state.chatMsgs.push(...list);
      state.chatAfter = list[list.length - 1].id;
      if (first) state.chatScroll = true;
      renderChat();
      const m = (state.meetups || []).find((x) => x.id === state.meetId);
      if (m) { m.unread = 0; updateMeetBadge(); }
    }
  } catch { /* nächster Versuch */ }
  chatTimer = setTimeout(pollChat, document.hidden ? 15000 : 4000);
}

async function meetAction(fn, msg) {
  try {
    const m = await fn();
    if (m && m.id) { renderMeetup(m); if (m.joined) pollChat(true); }
    if (msg) toast(msg);
    loadMeetups();
    const r = state.selected && routeById(state.selected);
    if (r) loadRouteMeetups(r);
  } catch (ex) { if (!handleApiError(ex)) toast(ex.message); }
}

$('#chat-form').onsubmit = async (e) => {
  e.preventDefault();
  const input = $('#chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  try { await backend.sendMessage(state.meetId, text); state.chatScroll = true; pollChat(); } catch (ex) { input.value = text; if (!handleApiError(ex)) toast(ex.message); }
};
$('#meet-new-form').onsubmit = submitNewMeetup;
$('#meet-dialog').addEventListener('close', () => clearTimeout(chatTimer));
document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-meet]'); if (c) openMeetup(c.dataset.meet);
  if (e.target.closest('[data-close-meet]')) $('#meet-dialog').close();
  if (e.target.closest('[data-close-meetnew]')) $('#meet-new-dialog').close();
  if (e.target.closest('[data-meet-join]')) meetAction(() => backend.joinMeetup(state.meetId), 'Du bist dabei! Im Chat kannst du dich mit den anderen abstimmen.');
  if (e.target.closest('[data-meet-leave]')) meetAction(() => backend.leaveMeetup(state.meetId), 'Du bist beim Treffen nicht mehr dabei.');
  if (e.target.closest('[data-meet-cancel]')) {
    const b = e.target.closest('[data-meet-cancel]');
    if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Wirklich absagen?'; return; }
    meetAction(async () => { await backend.cancelMeetup(state.meetId); $('#meet-dialog').close(); return null; }, 'Das Treffen ist abgesagt.');
  }
  if (e.target.closest('[data-meet-route]')) {
    const m = state.meet;
    $('#meet-dialog').close();
    if (routeById(m.routeId)) openRoute(m.routeId);
    else { map.setView([m.lat, m.lng], 14); toast('Die Runde wird geladen …'); setTimeout(() => routeById(m.routeId) && openRoute(m.routeId), 1500); }
  }
});
// Ungelesene Nachrichten im Hintergrund prüfen (Zahl am Reiter)
setInterval(() => { if (state.user && backend.accounts && !document.hidden) (state.tab === 'treffen' ? loadMeetups() : refreshMeetBadge()); }, 30000);
async function refreshMeetBadge() {
  try {
    const c = state.myPos || [map.getCenter().lat, map.getCenter().lng];
    state.meetups = await backend.meetups({ lat: c[0].toFixed(4), lng: c[1].toFixed(4), r: 50 });
    updateMeetBadge();
  } catch { /* egal */ }
}

// ---------- Runde finden ----------
function findPrefs() {
  const f = $('#find-form');
  return {
    minutes: Number($('input[name="minutes"]:checked', f).value),
    needWater: $('#f-water').checked, quiet: $('#f-quiet').checked, offLeash: $('#f-offleash').checked,
    dogAge: me.dogAge, tempC: state.tempC, hour: hourNow(),
  };
}

function renderFind() {
  const prefs = findPrefs();
  const ageText = { welpe: 'Welpe', erwachsen: 'erwachsener Hund', senior: 'älterer Hund' }[me.dogAge];
  $('#find-context').textContent = `Berücksichtigt: ${state.tempC != null ? `${Math.round(state.tempC)} °C, ` : ''}${ageText}${me.dog ? ` (${me.dog})` : ''}, ${hourNow()} Uhr, wer gerade live unterwegs ist und die Bewertungen anderer.`;
  const ranked = state.routes
    .map((r) => ({ r, m: matchRoute(r, { ...prefs, liveCount: liveOnRoute(r).length }) }))
    .sort((a, b) => b.m.fit - a.m.fit)
    .slice(0, 3);
  $('#find-results').innerHTML = ranked.map(({ r, m }, i) => `<li data-id="${esc(r.id)}" tabindex="0" role="button">
      <h3><span>${i === 0 ? 'Beste Wahl: ' : ''}${esc(r.name)}</span><span class="fit">${m.fit} %</span></h3>
      <p class="why">${formatKm(r.distanceKm * 1000)} km · ca. ${m.minutes} Min.${m.reasons.length ? ' · ' + esc(m.reasons.join(', ')) : ''}</p>
    </li>`).join('');
}

// ---------- Live ----------
function renderPeople() {
  if (backend.accounts && !state.user) {
    $('#live-count').textContent = '0';
    $('#people-list').innerHTML = `<li class="login-cta"><p>Melde dich an, um zu sehen, wer gerade mit Hund unterwegs ist, und um selbst auf der Karte zu erscheinen.</p><button class="btn small primary" data-login>Anmelden</button></li>`;
    return;
  }
  const ref = state.myPos || [map.getCenter().lat, map.getCenter().lng];
  const list = others().map((p) => ({ p, d: distance(ref, [p.lat, p.lng]) })).sort((a, b) => a.d - b.d);
  $('#live-count').textContent = list.length;
  $('#people-list').innerHTML = list.length ? list.map(({ p, d }) => `<li>
      <button class="person-row" data-person="${esc(p.id)}" aria-label="${esc(p.name)}: ${esc(STATUS[p.status]?.label || '')}, Details anzeigen">
        <span class="avatar ${esc(p.status)}" aria-hidden="true">${esc(initial(p.name))}</span>
        <span>
          <span class="who">${esc(p.name)}${p.dog ? ` & ${esc(p.dog)}` : ''}${p.demo ? ' · Demo' : ''}</span>
          <span class="where"><span class="status-chip"><i class="sdot ${esc(p.status)}"></i>${esc(STATUS[p.status]?.short || '')}</span> · ${formatDistanceShort(d)}</span>
        </span>
        <span class="chev" aria-hidden="true">›</span>
      </button>
    </li>`).join('') : '<li class="empty">Gerade ist niemand live unterwegs. Starte einen Spaziergang und teile deine Position, dann sehen dich andere hier.</li>';
}

function personIcon(p) {
  return L.divIcon({
    className: 'person-marker',
    html: `<div class="pin ${esc(p.status)}">${esc(initial(p.name))}</div><div class="name">${esc(p.name)}${p.dog ? ` & ${esc(p.dog)}` : ''}</div>`,
    iconSize: [120, 56], iconAnchor: [60, 18],
  });
}

function updatePeopleMarkers() {
  const seen = new Set();
  for (const p of others()) {
    seen.add(p.id);
    let m = peopleMarkers.get(p.id);
    const key = `${p.status}|${p.name}|${p.dog}`;
    if (!m) {
      m = L.marker([p.lat, p.lng], { icon: personIcon(p), keyboard: false }).addTo(map);
      m.on('click', () => openPerson(p.id));
      m._key = key;
      peopleMarkers.set(p.id, m);
    } else {
      m.setLatLng([p.lat, p.lng]);
      if (m._key !== key) { m.setIcon(personIcon(p)); m._key = key; }
    }
  }
  for (const [id, m] of peopleMarkers) if (!seen.has(id)) { m.remove(); peopleMarkers.delete(id); }
}

const STATUS_TEXT = {
  offen: 'Freut sich über Gesellschaft. Wink ihr oder ihm zu, dann könnt ihr ein Stück zusammen gehen.',
  neutral: 'Ist einfach unterwegs, ohne besonderen Wunsch. Ein freundlicher Gruß ist in Ordnung.',
  abstand: 'Wie die gelbe Schleife an der Leine: Bitte mindestens 150 m Abstand halten oder einen anderen Weg nehmen.',
};

/** Karte einer Person: Status mit Erklärung, Entfernung, Runde, Aktionen. */
function openPerson(id) {
  const p = state.people.find((x) => x.id === id);
  if (!p) return;
  state.personId = id;
  renderPerson(p);
  const dlg = $('#person-dialog');
  if (!dlg.open) showFromTop(dlg, '#person-name');
}

function renderPerson(p) {
  const d = state.myPos ? distance(state.myPos, [p.lat, p.lng]) : null;
  const route = state.routes.find((r) => distanceToPath([p.lat, p.lng], r.points) < ON_ROUTE);
  const ago = Math.max(0, Math.round((Date.now() - (p.at || Date.now())) / 1000));
  $('#person-body').innerHTML = `
    <div class="person-head">
      <span class="avatar ${esc(p.status)}" aria-hidden="true">${esc(initial(p.name))}</span>
      <div><h2 id="person-name" tabindex="-1">${esc(p.name)}</h2><p class="sub">${p.dog ? `mit ${esc(p.dog)}` : 'ohne Hundenamen'}${p.demo ? ' · Demo' : ''}</p>${dogInfo(p.dogBreed, p.dogYears) ? `<p class="dog-info">${esc(dogInfo(p.dogBreed, p.dogYears))}</p>` : ''}</div>
    </div>
    <div class="status-box ${esc(p.status)}"><b>${esc(STATUS[p.status]?.label || '')}</b><p>${esc(STATUS_TEXT[p.status] || '')}</p></div>
    <ul class="person-facts">
      <li><span>Entfernung</span><span>${d != null ? formatDistanceShort(d) : 'erst beim Spaziergang'}</span></li>
      <li><span>Zuletzt gesehen</span><span>${ago < 15 ? 'gerade eben' : ago < 120 ? `vor ${ago} Sek.` : `vor ${Math.round(ago / 60)} Min.`}</span></li>
      <li class="wide"><span>Gerade auf</span><span>${route ? esc(route.name) : 'keiner bekannten Runde'}</span></li>
    </ul>
    <div class="person-actions">
      <button class="btn secondary" data-show="${esc(p.id)}">Auf Karte zeigen</button>
      ${p.status !== 'abstand' ? `<button class="btn primary" data-wave="${esc(p.id)}">Winken</button>` : ''}
      <button class="btn secondary" data-close-person>Schließen</button>
    </div>`;
}

function onLive(people) {
  state.people = people;
  updatePeopleMarkers();
  renderPeople();
  const dlg = $('#person-dialog');
  if (dlg.open) {
    const p = people.find((x) => x.id === state.personId);
    if (p) renderPerson(p);
    else $('#person-body').querySelector('.person-facts li:nth-child(2) span:last-child').textContent = 'nicht mehr unterwegs';
  }
  if (state.view === 'list' && state.tab === 'runden' && listSignature() !== state.listSig) renderList();
  checkProximity();
}

async function wave(p) {
  if (backend.accounts && !state.user) return requireLogin('Melde dich an, um anderen zu winken.', () => wave(p));
  try {
    if (p.demo) {
      // Demo-Spaziergänger antworten automatisch
      setTimeout(() => showWave({ from: p.id, fromName: p.name, fromDog: p.dog, text: 'Gerne! Ich gehe langsam weiter, komm einfach nach.' }, false), 3500);
    } else {
      await backend.wave(p.id);
    }
    toast(`Du hast ${p.name} gewunken.`);
  } catch (e) { if (!handleApiError(e)) toast(e.message); }
}

function showWave(msg, offerReply = true) {
  const from = state.people.find((p) => p.id === msg.from);
  const btn = offerReply && from && from.status !== 'abstand' ? { label: 'Zurückwinken', fn: () => wave(from) } : null;
  toast(`${msg.fromName}${msg.fromDog ? ` mit ${msg.fromDog}` : ''} winkt dir: „${msg.text}“`, btn, 9000);
  navigator.vibrate?.([80, 60, 80]);
}

// Hinweis, wenn jemand mit „Bitte Abstand“ oder „Gern zusammen“ in der Nähe ist
function checkProximity() {
  const banner = $('#banner');
  if (!state.myPos) { banner.hidden = true; return; }
  const now = Date.now();
  let warn = null; let friend = null;
  for (const p of others()) {
    const d = distance(state.myPos, [p.lat, p.lng]);
    const dismissedAt = state.dismissed.get(p.id);
    if (dismissedAt && now - dismissedAt < 3 * 60 * 1000) continue;
    if (p.status === 'abstand' && d < WARN_RADIUS && (!warn || d < warn.d)) warn = { p, d };
    if (p.status === 'offen' && me.status !== 'abstand' && d < MEET_RADIUS && (!friend || d < friend.d)) friend = { p, d };
  }
  const hit = warn || friend;
  if (!hit) { banner.hidden = true; return; }
  const { p, d } = hit;
  const who = `<b>${esc(p.name)}${p.dog ? ` mit ${esc(p.dog)}` : ''}</b>`;
  banner.className = 'banner ' + (warn ? 'warn' : 'ok');
  banner.innerHTML = warn
    ? `<span class="sdot abstand" aria-hidden="true"></span><p>${who} bittet um Abstand und ist ${formatDistanceShort(d)} entfernt. Am besten Abstand halten oder einen anderen Weg nehmen.</p><button class="btn small secondary" data-dismiss="${esc(p.id)}">OK</button>`
    : `<span class="sdot offen" aria-hidden="true"></span><p>${who} ist ${formatDistanceShort(d)} entfernt und freut sich über Gesellschaft.</p><button class="btn small primary" data-wave="${esc(p.id)}">Winken</button><button class="btn small secondary" data-dismiss="${esc(p.id)}" aria-label="Hinweis schließen">✕</button>`;
  banner.hidden = false;
  if (warn && !state.warned.has(p.id)) { state.warned.add(p.id); navigator.vibrate?.(250); }
}

// ---------- Aufnahme ----------
const rec = { active: false, paused: false, segments: [], startedAt: 0, pausedTotal: 0, pauseStart: 0, last: null, guide: null, watchId: null, sim: null, timer: null, wakeLock: null, lastSent: 0, timeScale: 1, accuracy: null, result: null };

const recPoints = () => rec.segments.flat();
const recDistance = () => rec.segments.reduce((s, seg) => s + pathLength(seg), 0);
function recElapsed() {
  const now = Date.now();
  return (now - rec.startedAt - rec.pausedTotal - (rec.paused ? now - rec.pauseStart : 0)) * rec.timeScale;
}

function nearestRoute() {
  const c = state.myPos || [map.getCenter().lat, map.getCenter().lng];
  return [...state.routes].sort((a, b) => distance(c, a.points[0]) - distance(c, b.points[0]))[0];
}

async function startWalk(guide = null, resume = false) {
  if (rec.active) return;
  if (!me.simulate && !NATIVE) {
    if (!('geolocation' in navigator)) return toast('Dieses Gerät liefert keinen Standort. Zum Ausprobieren im Profil den Demo-Modus einschalten.', { label: 'Profil', fn: openProfile });
    if (!window.isSecureContext) return toast('GPS funktioniert nur über eine sichere Verbindung (https). Zum Ausprobieren im Profil den Demo-Modus einschalten.', { label: 'Profil', fn: openProfile });
  }
  Object.assign(rec, {
    active: true, paused: false, segments: [[]], startedAt: resume ? NATIVE.startedAt() : Date.now(), pausedTotal: 0, last: null,
    guide, lastSent: 0, timeScale: me.simulate ? 3 : 1, accuracy: null, result: null, native: !me.simulate && !!NATIVE, nativeIdx: 0,
  });
  recLine = L.polyline([], { color: css('--rec'), weight: 6, opacity: 0.9 }).addTo(map);
  if (guide) guideLine = L.polyline(guide.points, { color: css('--accent'), weight: 6, opacity: 0.85, dashArray: '1 12', lineCap: 'round' }).addTo(map);

  $('#browse').hidden = true; $('#save-form').hidden = true; $('#recording').hidden = false;
  $('#sheet').classList.remove('expanded', 'collapsed'); $('#sheet').classList.add('fit');
  setFab('recording');
  $('#rec-guide').textContent = guide ? `Du läufst: ${guide.name}` : 'Eigene Runde';
  syncStatusInputs();
  setPauseUi();

  if (me.simulate) startSim(guide || nearestRoute());
  else if (rec.native) {
    NATIVE.setLive(me.shareLive, me.status);
    if (!resume && !NATIVE.start()) $('#rec-info').textContent = 'Bitte erlaube den Standortzugriff, damit die Runde aufgezeichnet wird.';
    rec.pull = setInterval(pullNative, 1000);
  } else rec.watchId = navigator.geolocation.watchPosition(onFix, onGeoError, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
  rec.timer = setInterval(updateRecStats, 1000);
  updateRecStats();
  try { rec.wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* Bildschirm darf ausgehen */ }
}

// Neue GPS-Punkte vom nativen Dienst abholen (auch alle, die bei ausgeschaltetem Bildschirm entstanden sind)
function pullNative() {
  if (!rec.active || !rec.native) return;
  let list = [];
  try { list = JSON.parse(NATIVE.fixesSince(rec.nativeIdx)); } catch { return; }
  rec.nativeIdx += list.length;
  for (const [lat, lng, accuracy, time] of list) onFix({ coords: { latitude: lat, longitude: lng, accuracy }, timestamp: time });
}

window.__gassiNativeStart = (granted) => {
  if (granted) { $('#rec-info').textContent = 'Warte auf GPS-Signal …'; return; }
  stopWalk(true);
  toast('Ohne Standortzugriff kann die App die Runde nicht aufzeichnen. Du kannst ihn in den Android-Einstellungen unter Apps → Gassirunde erlauben.');
};
window.__gassiResume = () => { pullNative(); };
window.__gassiBack = () => {
  for (const d of $$('dialog[open]')) { d.close(); return true; }
  if (state.view === 'detail' && !rec.active) { closeDetail(); return true; }
  if (state.tab !== 'runden' && !rec.active) { switchTab('runden'); return true; }
  return false;
};

function startSim(route) {
  const len = pathLength(route.points);
  let d = 0;
  const step = 1.4 * rec.timeScale; // m pro Sekunde, im Zeitraffer
  rec.sim = setInterval(() => {
    if (!rec.paused) d = Math.min(len, d + step);
    const [lat, lng] = pointAlong(route.points, d);
    const j = () => (Math.random() - 0.5) * 0.00002;
    onFix({ coords: { latitude: lat + j(), longitude: lng + j(), accuracy: 5 }, timestamp: Date.now() });
  }, 1000);
}

function onFix(pos) {
  const fix = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, time: pos.timestamp || Date.now() };
  rec.accuracy = fix.accuracy;
  const first = !state.myPos || recPoints().length === 0;
  setMyPos(fix.lat, fix.lng);
  if (first) map.setView([fix.lat, fix.lng], 16);
  else if (!map.getBounds().pad(-0.2).contains([fix.lat, fix.lng])) map.panTo([fix.lat, fix.lng]);

  if (!rec.active || rec.paused) return;
  const opts = me.simulate ? { maxAccuracy: 999, maxSpeed: 99 } : undefined;
  if (!acceptFix(rec.last, fix, opts)) return;
  rec.last = fix;
  rec.segments[rec.segments.length - 1].push([fix.lat, fix.lng]);
  recLine.setLatLngs(rec.segments);
  shareMyPosition();
}

function shareMyPosition(force = false) {
  if (!rec.active || !me.shareLive || !state.myPos) return;
  const now = Date.now();
  if (!force && now - rec.lastSent < 4000) return;
  rec.lastSent = now;
  backend.sendPosition({ status: me.status, lat: state.myPos[0], lng: state.myPos[1] });
}

function onGeoError(err) {
  const msg = err.code === 1
    ? 'Standortzugriff wurde abgelehnt. Erlaube ihn in den Browser-Einstellungen, oder nutze im Profil den Demo-Modus.'
    : 'Kein GPS-Signal. Geh ein paar Schritte ins Freie, die Aufnahme läuft weiter.';
  $('#rec-info').textContent = msg;
  if (err.code === 1) { stopWalk(true); toast(msg, { label: 'Profil', fn: openProfile }); }
}

function updateRecStats() {
  if (!rec.active) return;
  const m = recDistance();
  const ms = recElapsed();
  $('#rec-dist').textContent = formatKm(m);
  $('#rec-time').textContent = formatDuration(ms);
  const pace = m > 50 ? ms / 60000 / (m / 1000) : null;
  $('#rec-pace').textContent = pace ? `${Math.floor(pace)}:${String(Math.round((pace % 1) * 60)).padStart(2, '0')}` : '–';
  const parts = [];
  parts.push(rec.accuracy == null ? 'Warte auf GPS-Signal …' : `GPS-Genauigkeit ±${Math.round(rec.accuracy)} m`);
  if (me.simulate) parts.push('Demo-Modus mit simuliertem GPS (3-fach Zeitraffer)');
  parts.push(me.shareLive ? 'Deine Position ist für andere sichtbar' : 'Position wird nicht geteilt');
  $('#rec-info').textContent = parts.join(' · ');
}

function setPauseUi() {
  $('#pause-btn').textContent = rec.paused ? 'Weiter' : 'Pause';
  const b = $('#rec-badge');
  b.classList.toggle('paused', rec.paused);
  b.lastChild.textContent = rec.paused ? 'Pausiert' : 'Aufnahme läuft';
}

function togglePause() {
  if (!rec.active) return;
  if (rec.paused) {
    rec.pausedTotal += Date.now() - rec.pauseStart;
    rec.paused = false;
    rec.last = null;
    rec.segments.push([]); // neuer Abschnitt, damit kein gerader Strich über die Pause entsteht
  } else {
    rec.paused = true;
    rec.pauseStart = Date.now();
  }
  setPauseUi();
  updateRecStats();
}

function stopWalk(silent = false) {
  if (!rec.active) return;
  if (rec.native) { pullNative(); NATIVE.stop(); clearInterval(rec.pull); rec.pull = null; }
  if (rec.paused) { rec.pausedTotal += Date.now() - rec.pauseStart; rec.paused = false; }
  const ms = recElapsed();
  const meters = recDistance();
  rec.active = false;
  if (rec.watchId != null) navigator.geolocation.clearWatch(rec.watchId);
  clearInterval(rec.sim); clearInterval(rec.timer);
  rec.watchId = null; rec.sim = null;
  rec.wakeLock?.release?.().catch(() => {});
  backend.stopSharing();
  $('#recording').hidden = true;
  rec.result = { ms, meters, segments: rec.segments.filter((s) => s.length > 1), guide: rec.guide, date: new Date().toISOString() };
  if (silent || meters < 30) {
    if (!silent) toast('Der Spaziergang war zu kurz zum Speichern (unter 30 m).');
    resetAfterWalk();
    return;
  }
  showSaveForm();
}

/** Ortsname zu einer Position (OpenStreetMap-Adressdienst), z. B. „Duberg, Kollund-Osterholz“. */
async function placeName(lat, lng) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat.toFixed(5)}&lon=${lng.toFixed(5)}&zoom=14&accept-language=de`);
    const a = (await r.json()).address || {};
    const small = a.hamlet || a.suburb || a.neighbourhood || '';
    const big = a.village || a.town || a.city || a.municipality || '';
    return [...new Set([small, big].filter(Boolean))].join(', ').slice(0, 60);
  } catch { return ''; }
}

function showSaveForm() {
  setFab('hidden');
  // Ort aus dem Startpunkt der Runde ermitteln (bleibt änderbar)
  const area = $('#sv-area');
  area.value = '';
  const start = rec.result.segments.flat()[0];
  if (start) {
    area.placeholder = 'Ort wird ermittelt …';
    placeName(start[0], start[1]).then((name) => {
      area.placeholder = 'z. B. Musterstadt-Nord';
      if (name && !area.value) area.value = name;
    });
  }
  const { ms, meters, guide } = rec.result;
  $('#save-summary').innerHTML = `<b>${formatKm(meters)} km</b> in <b>${formatDuration(ms)}</b>${guide ? ` auf „${esc(guide.name)}“` : ''}.`;
  $('#sv-share').checked = !guide; // nachgelaufene Runden nicht doppelt anlegen
  $('#sv-name').value = '';
  $('#sv-trim').checked = false;
  $('#save-error').hidden = true;
  $('#discard-btn').textContent = 'Verwerfen';
  $('#discard-btn').dataset.armed = '';
  toggleShareFields();
  $('#save-btn').textContent = guide ? 'Speichern & bewerten' : 'Speichern';
  $('#save-form').hidden = false;
}

function toggleShareFields() {
  $('#share-fields').hidden = !$('#sv-share').checked;
  $('#sv-name').required = $('#sv-share').checked;
}

async function saveWalk(e) {
  e.preventDefault();
  const res = rec.result;
  const err = $('#save-error');
  err.hidden = true;
  let created = null;
  if ($('#sv-share').checked) {
    const name = $('#sv-name').value.trim();
    if (!name) { err.textContent = 'Bitte gib der Runde einen Namen.'; err.hidden = false; return; }
    let points = res.segments.flat();
    if ($('#sv-trim').checked) points = trimEnds(points, 100);
    if (points.length < 2) { err.textContent = 'Nach dem Kürzen bleibt von der Runde nichts übrig. Lass „kürzen“ aus oder geh eine längere Runde.'; err.hidden = false; return; }
    try {
      created = await backend.addRoute({
        name, area: $('#sv-area').value.trim(), description: $('#sv-desc').value.trim(),
        points,
        distanceKm: +(pathLength(points) / 1000).toFixed(2), durationMin: Math.round(res.ms / 60000),
        attrs: {
          water: $('#sv-water').checked, shade: Number($('#sv-shade').value), surface: $('#sv-surface').value,
          crossings: Number($('#sv-crossings').value) || 0, leash: $('#sv-leash').value, bins: $('#sv-bins').checked,
        },
      });
    } catch (ex) { if (!handleApiError(ex)) { err.textContent = ex.message; err.hidden = false; } return; }
    state.routes.push(created);
    drawRoutes();
  }
  try {
    await backend.addWalk({ date: res.date, meters: Math.round(res.meters), ms: Math.round(res.ms), name: created?.name || res.guide?.name || 'Eigene Runde' });
  } catch (ex) { if (!handleApiError(ex)) { err.textContent = ex.message; err.hidden = false; return; } }
  resetAfterWalk();
  if (created) { toast('Deine Runde ist gespeichert und für andere sichtbar.'); openRoute(created.id); }
  else if (res.guide) { openRoute(res.guide.id); setTimeout(() => $('#rate-form')?.scrollIntoView({ behavior: 'smooth' }), 200); toast('Gespeichert. Wie war die Runde? Gib ihr ein paar Sterne.'); }
  else toast('Spaziergang gespeichert. Du findest ihn in deinem Profil.');
}

function discardWalk() {
  const b = $('#discard-btn');
  if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Wirklich verwerfen?'; return; }
  resetAfterWalk();
  toast('Spaziergang verworfen.');
}

function resetAfterWalk() {
  recLine?.remove(); guideLine?.remove();
  recLine = null; guideLine = null;
  $('#save-form').hidden = true; $('#recording').hidden = true;
  $('#browse').hidden = false; setFab('idle');
  $('#sheet').classList.remove('fit', 'collapsed');
  if (me.simulate) { state.myPos = null; meMarker?.remove(); meMarker = null; $('#banner').hidden = true; }
  state.view === 'detail' ? renderDetail() : renderList();
}

// ---------- Status, Profil, Tabs ----------
function setStatus(s) {
  me.status = s; saveMe(); syncStatusInputs();
  NATIVE?.setLive(me.shareLive, me.status);
  shareMyPosition(true);
  checkProximity();
}

function syncStatusInputs() {
  for (const p of $$('.status-picker')) {
    p.querySelector('.status-btn .sdot').className = `sdot ${me.status}`;
    p.querySelector('.status-text').textContent = STATUS[me.status]?.short || '';
    for (const o of p.querySelectorAll('[data-status]')) o.setAttribute('aria-selected', String(o.dataset.status === me.status));
  }
  $('#share-live').checked = me.shareLive;
}

async function openProfile() {
  if (backend.accounts && !state.user) return openAuth();
  $('#me-name').value = me.name; $('#me-dog').value = me.dog; $('#me-simulate').checked = me.simulate;
  showBreed('me', me.dogBreed); $('#me-years').value = me.dogYears ?? ''; $('#me-show').checked = me.showDog !== false;
  $('#me-simulate').disabled = rec.active;
  $('#me-email').textContent = me.email ? `Angemeldet als ${me.email}` : '';
  $('#me-email').hidden = !me.email;
  $('#account-section').hidden = !backend.accounts;
  $('#logout-btn').hidden = !backend.accounts;
  for (const id of ['pw-current', 'pw-next', 'del-password']) $('#' + id).value = '';
  for (const d of $$('#me-dialog details')) d.open = false;
  $('#me-error').hidden = true;
  $('#mode-hint').textContent = backend.mode === 'server'
    ? 'Andere sehen nur deinen Vornamen und den Namen deines Hundes.'
    : 'Ohne Server: Profil, Runden und Bewertungen bleiben in diesem Browser. Live siehst du die Demo-Spaziergänger und andere Tabs auf diesem Gerät.';
  $('#history').innerHTML = '<li class="hint">Lade …</li>';
  $('#me-dialog').showModal();
  try {
    const h = await backend.getWalks();
    const total = h.reduce((sum, x) => sum + x.meters, 0);
    $('#history').innerHTML = h.length
      ? `<li><b>Gesamt</b><b>${formatKm(total)} km · ${h.length} ${h.length === 1 ? "Spaziergang" : "Spaziergänge"}</b></li>` + h.slice(0, 50).map((x) => `<li><span>${new Date(x.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })} · ${esc(x.name)}</span><span>${formatKm(x.meters)} km · ${formatDuration(x.ms)}</span></li>`).join('')
      : '<li class="hint">Noch keine Spaziergänge aufgezeichnet.</li>';
  } catch (ex) { handleApiError(ex); $('#history').innerHTML = '<li class="hint">Spaziergänge konnten nicht geladen werden.</li>'; }
}

function meError(text) { const e = $('#me-error'); e.textContent = text; e.hidden = !text; }

async function saveProfile(e) {
  e.preventDefault();
  const name = $('#me-name').value.trim();
  if (backend.accounts && !name) return meError('Bitte gib deinen Vornamen an.');
  try {
    const dogYears = readYears('#me-years');
    const user = await backend.updateProfile({
      name, dog: $('#me-dog').value.trim(), dogBreed: readBreed('me'), dogYears, dogAge: ageGroup(dogYears), showDog: $('#me-show').checked,
    });
    if (!rec.active) me.simulate = $('#me-simulate').checked;
    saveMe();
    setUser(user);
    $('#me-dialog').close();
    toast('Profil gespeichert.');
  } catch (ex) { if (!handleApiError(ex)) meError(ex.message); }
}

async function changePassword() {
  try {
    await backend.changePassword($('#pw-current').value, $('#pw-next').value);
    $('#pw-current').value = ''; $('#pw-next').value = '';
    $('#pw-btn').closest('details').open = false;
    meError('');
    toast('Passwort geändert. Auf anderen Geräten musst du dich neu anmelden.');
  } catch (ex) { if (!handleApiError(ex)) meError(ex.message); }
}

async function deleteAccount() {
  if (rec.active) return meError('Beende zuerst deinen Spaziergang.');
  try {
    await backend.deleteAccount($('#del-password').value);
    $('#me-dialog').close();
    state.routes = await backend.getRoutes();
    drawRoutes();
    setUser(null);
    toast('Dein Konto und deine Daten wurden gelöscht.');
  } catch (ex) { if (!handleApiError(ex)) meError(ex.message); }
}

async function logout() {
  if (rec.active) return meError('Beende zuerst deinen Spaziergang.');
  await backend.logout().catch(() => {});
  $('#me-dialog').close();
  setUser(null);
  toast('Du bist abgemeldet.');
}

// ---------- Anmeldung ----------
let afterLogin = null;

/** Führt `action` aus, wenn angemeldet – sonst erst das Anmelde-Fenster zeigen. */
function requireLogin(reason, action) {
  if (!backend.accounts || state.user) return action();
  afterLogin = action;
  openAuth(reason);
}

/** Sitzung abgelaufen o. ä.: zurück zur Anmeldung. Gibt true zurück, wenn behandelt. */
function handleApiError(ex) {
  if (ex?.status !== 401 || !backend.accounts) return false;
  setUser(null);
  openAuth('Deine Anmeldung ist abgelaufen. Bitte melde dich neu an.');
  return true;
}

function setAuthMode(mode) {
  const reg = mode === 'register';
  $('#am-login').checked = !reg; $('#am-register').checked = reg;
  $('#register-fields').hidden = !reg;
  $('#auth-title').textContent = reg ? 'Konto anlegen' : 'Anmelden';
  $('#auth-submit').textContent = reg ? 'Konto anlegen' : 'Anmelden';
  $('#auth-password').autocomplete = reg ? 'new-password' : 'current-password';
  $('#auth-error').hidden = true;
}

function openAuth(reason = '') {
  $('#auth-reason').textContent = reason;
  $('#auth-reason').hidden = !reason;
  setAuthMode('login');
  $('#auth-password').value = '';
  if (!$('#auth-dialog').open) $('#auth-dialog').showModal();
  $('#auth-email').focus();
}

async function submitAuth(e) {
  e.preventDefault();
  const err = $('#auth-error');
  const show = (t) => { err.textContent = t; err.hidden = false; };
  const email = $('#auth-email').value.trim();
  const password = $('#auth-password').value;
  const reg = $('#am-register').checked;
  if (!email) return show('Bitte gib deine E-Mail-Adresse ein.');
  if (password.length < (reg ? 8 : 1)) return show(reg ? 'Das Passwort braucht mindestens 8 Zeichen.' : 'Bitte gib dein Passwort ein.');
  if (reg && !$('#reg-name').value.trim()) return show('Bitte gib deinen Vornamen an.');
  $('#auth-submit').disabled = true;
  try {
    const user = reg
      ? await backend.register({
        email, password, name: $('#reg-name').value.trim(), dog: $('#reg-dog').value.trim(),
        dogBreed: readBreed('reg'), dogYears: readYears('#reg-years'), dogAge: ageGroup(readYears('#reg-years')), showDog: $('#reg-show').checked,
      })
      : await backend.login(email, password);
    $('#auth-dialog').close();
    setUser(user);
    toast(reg ? `Willkommen, ${user.name}! Dein Konto ist angelegt.` : `Hallo ${user.name}, schön, dass du da bist.`);
    const next = afterLogin; afterLogin = null;
    next?.();
  } catch (ex) { show(ex.message); }
  finally { $('#auth-submit').disabled = false; }
}

function setUser(user) {
  state.user = user || null;
  Object.assign(me, {
    id: user?.id ?? null, name: user?.name ?? '', dog: user?.dog ?? '', email: user?.email ?? '',
    dogBreed: user?.dogBreed ?? '', dogYears: user?.dogYears ?? null, showDog: user?.showDog !== false,
  });
  me.dogAge = user?.dogYears != null ? ageGroup(user.dogYears) : (user?.dogAge ?? 'erwachsen');
  const btn = $('#me-btn');
  const out = backend.accounts && !user;
  btn.classList.toggle('logged-out', out);
  $('#me-initial').textContent = out ? 'Anmelden' : initial(me.name || me.dog);
  btn.setAttribute('aria-label', out ? 'Anmelden' : 'Mein Profil');
  if (user) { backend.connect(); setTimeout(refreshMeetBadge, 500); } else { backend.disconnect(); state.people = []; state.meetups = []; $('#panel-treffen').innerHTML = ''; updateMeetBadge(); }
  state.view === 'detail' ? renderDetail() : renderList();
  renderFind();
  renderPeople();
}

function switchTab(tab) {
  state.tab = tab;
  for (const t of $$('.tab')) t.setAttribute('aria-selected', String(t.dataset.tab === tab));
  for (const p of $$('.panel')) p.hidden = p.dataset.panel !== tab;
  if (tab === 'finden') renderFind();
  if (tab === 'live') renderPeople();
  if (tab === 'treffen') loadMeetups();
  if (tab === 'runden' && state.view === 'list') renderList();
}

// ---------- Wetter ----------
// Wettercodes (WMO) → Symbol und Wort
const WMO = {
  0: ['☀️', 'klar'], 1: ['🌤️', 'überwiegend klar'], 2: ['⛅', 'teils bewölkt'], 3: ['☁️', 'bedeckt'],
  45: ['🌫️', 'Nebel'], 48: ['🌫️', 'Nebel mit Reif'],
  51: ['🌦️', 'leichter Niesel'], 53: ['🌦️', 'Niesel'], 55: ['🌧️', 'starker Niesel'], 56: ['🌧️', 'gefrierender Niesel'], 57: ['🌧️', 'gefrierender Niesel'],
  61: ['🌦️', 'leichter Regen'], 63: ['🌧️', 'Regen'], 65: ['🌧️', 'starker Regen'], 66: ['🌧️', 'gefrierender Regen'], 67: ['🌧️', 'gefrierender Regen'],
  71: ['🌨️', 'leichter Schnee'], 73: ['🌨️', 'Schnee'], 75: ['❄️', 'starker Schnee'], 77: ['🌨️', 'Schneegriesel'],
  80: ['🌦️', 'Regenschauer'], 81: ['🌧️', 'kräftige Schauer'], 82: ['⛈️', 'heftige Schauer'], 85: ['🌨️', 'Schneeschauer'], 86: ['🌨️', 'Schneeschauer'],
  95: ['⛈️', 'Gewitter'], 96: ['⛈️', 'Gewitter mit Hagel'], 99: ['⛈️', 'Gewitter mit Hagel'],
};
const NIGHT = { 0: '🌙', 1: '🌙', 2: '☁️', 51: '🌧️', 53: '🌧️', 61: '🌧️', 80: '🌧️' };
/** Symbol und Wort; nachts ohne Sonne. */
const wmo = (c, night = false) => { const [i, w] = WMO[c] || ['🌡️', '']; return [night && NIGHT[c] ? NIGHT[c] : i, w]; };
/** Ist es zu dieser Ortszeit (ISO ohne Zone) dunkel? Sonnenauf-/untergang gelten für heute, daher grob nach Uhrzeit. */
const isNight = (iso) => { const w = state.weather; if (!w?.sunrise || !w?.sunset || !iso) return false; const t = iso.slice(11, 16); return t < w.sunrise.slice(11, 16) || t >= w.sunset.slice(11, 16); };

async function loadWeather(lat, lng) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}`
      + '&current=temperature_2m,weather_code,wind_speed_10m,wind_gusts_10m,precipitation'
      + '&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m'
      + '&past_hours=6&forecast_hours=4&daily=sunrise,sunset&forecast_days=1&timezone=auto';
    const d = await (await fetch(url)).json();
    const t = d.current?.temperature_2m;
    if (typeof t !== 'number') return;
    const nowHour = d.current.time.slice(0, 13);
    const idx = Math.max(0, d.hourly.time.findIndex((x) => x.startsWith(nowHour)));
    const h = d.hourly;
    const hour = (i) => ({ time: h.time[i], temp: h.temperature_2m[i], prob: h.precipitation_probability[i] ?? 0, rain: h.precipitation[i] ?? 0, code: h.weather_code[i], wind: h.wind_speed_10m[i], gust: h.wind_gusts_10m[i] });
    state.weather = {
      at: Date.now(), lat, lng, here: !!state.myPos,
      now: { time: d.current.time, temp: t, code: d.current.weather_code, wind: d.current.wind_speed_10m, gust: d.current.wind_gusts_10m, rain: d.current.precipitation ?? 0, prob: h.precipitation_probability[idx] ?? 0 },
      next: [1, 2, 3].map((k) => idx + k).filter((i) => i < h.time.length).map(hour),
      pastRain: h.precipitation.slice(Math.max(0, idx - 6), idx).reduce((s, x) => s + (x || 0), 0),
      sunrise: d.daily?.sunrise?.[0], sunset: d.daily?.sunset?.[0], localNow: d.current.time,
    };
    state.tempC = t;
    const chip = $('#weather');
    chip.textContent = `${wmo(state.weather.now.code, isNight(state.weather.now.time))[0]} ${Math.round(t)} °C`;
    chip.hidden = false;
    chip.classList.toggle('hot', t >= 25);
    if ($('#weather-dialog').open) renderWeather();
    state.view === 'detail' ? renderDetail() : renderList();
  } catch { /* ohne Wetter geht es auch */ }
}

/** Tipps für die Runde – ehrlich, aber mit Augenzwinkern. */
function weatherTips(w) {
  const tips = [];
  const all = [w.now, ...w.next];
  const maxProb = Math.max(...all.map((x) => x.prob || 0));
  const sumRain = w.next.reduce((s, x) => s + (x.rain || 0), 0) + (w.now.rain || 0);
  const maxGust = Math.max(...all.map((x) => x.gust || 0));
  const codes = all.map((x) => x.code);
  const minT = Math.min(...all.map((x) => x.temp)); const maxT = Math.max(...all.map((x) => x.temp));
  const thunder = codes.some((c) => c >= 95);
  const snow = codes.some((c) => (c >= 71 && c <= 77) || c === 85 || c === 86);
  const fog = codes.some((c) => c === 45 || c === 48);
  const hm = (iso) => (iso ? iso.slice(11, 16) : '');
  if (thunder) tips.push(['⚡', 'Gewitter möglich. Lieber eine kurze Runde in Hausnähe, und nicht unter einzelnen Bäumen unterstellen.']);
  if (maxProb >= 60 || sumRain >= 1) tips.push(['☔', 'Regen im Anmarsch: Regenjacke an, Schirm einpacken und das Hundehandtuch schon mal an die Haustür legen.']);
  else if (maxProb >= 30) tips.push(['🌂', `Vielleicht ein paar Tropfen (bis ${maxProb} %). Der kleine Schirm passt in die Jackentasche.`]);
  const wetNow = (c) => (c >= 51 && c <= 67) || (c >= 80 && c <= 82);
  if (wetNow(w.now.code) && !(maxProb >= 60 || sumRain >= 1)) tips.push(['🧥', `Gerade ${wmo(w.now.code)[1]}. Kapuze auf, dem Hund ist das sowieso egal.`]);
  if (w.pastRain >= 0.5 && !(maxProb >= 60)) tips.push(['🥾', 'Es hat vorhin geregnet: Auf Wald- und Feldwegen wird es matschig. Gummistiefel an, und danach ab mit dem Hund unter die Pfotendusche.']);
  if (maxGust >= 60) tips.push(['🌪️', `Sturmböen bis ${Math.round(maxGust)} km/h: Heute bitte nicht in den Wald, da können Äste brechen. Besser offenes Feld oder Strand.`]);
  else if (maxGust >= 40) tips.push(['💨', `Ganz schön windig, Böen bis ${Math.round(maxGust)} km/h. Hundeohren flattern lassen und im Wald auf herabfallende Äste achten.`]);
  if (snow) tips.push(['❄️', 'Schnee! Für die meisten Hunde das Größte. Danach Eisklumpen aus dem Pfotenfell holen und die Pfoten abspülen.']);
  if (minT <= 0) tips.push(['🧊', 'Frost: Wege können glatt sein, und Streusalz brennt an den Pfoten. Vorher Pfotenbalsam, hinterher lauwarm abspülen.']);
  else if (minT <= 6) tips.push(['🧣', 'Frisch draußen. Mütze auf, und kurzhaarige oder ältere Hunde freuen sich über einen Mantel.']);
  if (maxT >= 28) tips.push(['🔥', 'Hitze! Nur früh morgens oder spät abends raus, Asphalt meiden (Handrücken 7 Sekunden auf den Boden) und reichlich Wasser mitnehmen.']);
  else if (maxT >= 23) tips.push(['🥤', 'Warm heute: Wasser für den Hund mitnehmen und eine schattige Runde wählen. Der Filter „Schattig“ hilft dabei.']);
  if (maxT >= 21 && /Mops|Bulldogge|Shih Tzu|Boxer|Cavalier/.test(me.dogBreed || '')) tips.push(['🐶', 'Kurznasige Hunde überhitzen schnell. Heute lieber eine kurze Runde im Schatten.']);
  if (fog) tips.push(['🌫️', 'Nebel: Mit Leuchthalsband sehen euch Radfahrer und Autos rechtzeitig.']);
  const now = w.localNow; const rise = w.sunrise; const set = w.sunset;
  if (set && rise && now) {
    const minsToSet = (Date.parse(set) - Date.parse(now)) / 60000;
    if (now > set || now < rise) tips.push(['🔦', 'Draußen ist es dunkel. Leuchthalsband oder Blinklicht an, und die Taschenlampe nicht vergessen.']);
    else if (minsToSet <= 90) tips.push(['🌇', `Um ${hm(set)} geht die Sonne unter. Leuchthalsband einpacken, falls die Runde länger wird.`]);
  }
  const nice = maxProb < 30 && maxGust < 40 && minT >= 8 && maxT <= 22 && !thunder && !snow;
  if (nice) tips.unshift(['🐕', 'Perfektes Gassiwetter! Heute darf es ruhig die große Runde sein.']);
  if (!tips.length) tips.push(['👍', 'Nichts Besonderes in Sicht. Leine schnappen und los!']);
  return tips;
}

function renderWeather() {
  const w = state.weather;
  if (!w) return;
  const col = (x, label) => {
    const [ico, word] = wmo(x.code, isNight(x.time));
    return `<div class="wx-col">
      <span class="wx-time">${label}</span>
      <span class="wx-ico" title="${esc(word)}">${ico}</span>
      <b class="wx-temp">${Math.round(x.temp)}°</b>
      <span class="wx-row" title="Regenwahrscheinlichkeit und Menge">💧 ${x.prob ?? 0} %${x.rain >= 0.1 ? `<small>${x.rain.toFixed(1).replace('.', ',')} mm</small>` : ''}</span>
      <span class="wx-row" title="Wind (Böen)">💨 ${Math.round(x.wind)}<small>Böen ${Math.round(x.gust)}</small></span>
    </div>`;
  };
  $('#weather-body').innerHTML = `
    <h2 id="weather-title" tabindex="-1">Wetter für die Runde</h2>
    <p class="hint" style="margin-top:-4px">${w.here ? 'An deinem Standort' : 'Rund um die Kartenmitte'} · ${esc(wmo(w.now.code)[1])} · Stand ${w.localNow.slice(11, 16)} Uhr</p>
    <div class="wx-hours">${col(w.now, 'Jetzt')}${w.next.map((x) => col(x, `${x.time.slice(11, 13)} Uhr`)).join('')}</div>
    <h3 class="list-title">Tipps für unterwegs</h3>
    <ul class="wx-tips">${weatherTips(w).map(([i, t]) => `<li><span class="tip-ico" aria-hidden="true">${i}</span><p>${esc(t)}</p></li>`).join('')}</ul>
    <p class="hint">Wetterdaten: Open-Meteo. Wind in km/h.</p>
    <div class="rec-actions"><button class="btn primary" data-close-weather>Alles klar</button></div>`;
}

function openWeather() {
  if (!state.weather) return;
  renderWeather();
  showFromTop($('#weather-dialog'), '#weather-title');
  // älter als 20 Minuten oder inzwischen eigener Standort bekannt: neu laden
  const w = state.weather;
  if (Date.now() - w.at > 20 * 60000 || (state.myPos && !w.here)) {
    const [la, lo] = state.myPos || [map.getCenter().lat, map.getCenter().lng];
    loadWeather(la, lo);
  }
}

/** Fenster öffnen und oben bei der Überschrift beginnen (nicht beim ersten Knopf unten). */
function showFromTop(dlg, headingSel) {
  dlg.showModal();
  $(headingSel)?.focus({ preventScroll: true });
  dlg.scrollTop = 0;
}

// ---------- Kleine Meldungen ----------
let toastTimer = null;
function toast(text, action = null, ms = 5000) {
  const el = $('#toast');
  el.innerHTML = `<p>${esc(text)}</p>${action ? `<button class="btn small" id="toast-action">${esc(action.label)}</button>` : ''}`;
  if (action) $('#toast-action').onclick = () => { el.hidden = true; action.fn(); };
  // Über dem unteren Fenster anzeigen (auf dem Handy), damit nichts verdeckt wird
  el.style.bottom = innerWidth < 900 ? `${$('#sheet').getBoundingClientRect().height + 88}px` : '';
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

// ---------- Ereignisse ----------
// Start/Stopp-Knopf: erster Tipp fährt ihn aus, zweiter startet bzw. beendet
let fabTimer = null;
function setFab(mode) {
  const b = $('#start-btn');
  clearTimeout(fabTimer);
  b.classList.remove('open');
  b.hidden = mode === 'hidden';
  b.classList.toggle('recording', mode === 'recording');
  const label = mode === 'recording' ? 'Spaziergang beenden' : 'Spaziergang starten';
  b.querySelector('.fab-label').textContent = label;
  b.setAttribute('aria-label', label);
}
$('#start-btn').onclick = () => {
  const b = $('#start-btn');
  if (!b.classList.contains('open')) {
    b.classList.add('open');
    clearTimeout(fabTimer);
    fabTimer = setTimeout(() => b.classList.remove('open'), 4000);
    return;
  }
  clearTimeout(fabTimer);
  b.classList.remove('open');
  if (rec.active) stopWalk();
  else requireLogin('Melde dich an, um Spaziergänge aufzuzeichnen und Runden zu teilen.', () => startWalk(null));
};
// Knopf sitzt immer knapp über dem unteren Fenster
function placeFab() {
  document.documentElement.style.setProperty('--fab-bottom', innerWidth < 900 ? `${Math.round($('#sheet').getBoundingClientRect().height) + 14}px` : '28px');
}
new ResizeObserver(placeFab).observe($('#sheet'));
addEventListener('resize', placeFab);
placeFab();
$('#pause-btn').onclick = togglePause;
$('#stop-btn').onclick = () => stopWalk();
$('#save-form').onsubmit = saveWalk;
$('#discard-btn').onclick = discardWalk;
$('#sv-share').onchange = toggleShareFields;
$('#me-btn').onclick = openProfile;
$('#weather').onclick = openWeather;
$('#info-btn').onclick = () => {
  $('#info-version').textContent = NATIVE ? `App-Version ${NATIVE.version()}.` : 'Web-Version.';
  $('#info-dialog').showModal();
  $('#info-dialog .info-scroll').scrollTop = 0;
};
$('#me-form').onsubmit = saveProfile;
$('#pw-btn').onclick = changePassword;
$('#del-btn').onclick = deleteAccount;
$('#logout-btn').onclick = logout;
$('#auth-form').onsubmit = submitAuth;
$('#auth-cancel').onclick = () => { afterLogin = null; $('#auth-dialog').close(); };
$('#auth-dialog').addEventListener('cancel', () => { afterLogin = null; });
for (const i of $$('input[name="authmode"]')) i.onchange = () => setAuthMode(i.value);
for (const t of $$('.tab')) t.onclick = () => switchTab(t.dataset.tab);
$('#find-form').addEventListener('change', renderFind);
$('#find-results').addEventListener('click', (e) => { const li = e.target.closest('li[data-id]'); if (li) openRoute(li.dataset.id); });
$('#find-results').addEventListener('keydown', (e) => { const li = e.target.closest('li[data-id]'); if (li && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openRoute(li.dataset.id); } });
$('#panel-runden').addEventListener('click', (e) => {
  const b = e.target.closest('.route-card'); if (b) return openRoute(b.dataset.id);
  const f = e.target.closest('[data-filter]'); if (f) return toggleFilter(f.dataset.filter);
  const sc = e.target.closest('[data-scroll]');
  if (sc) { $('.filters').scrollBy({ left: Number(sc.dataset.scroll) * 160, behavior: 'smooth' }); return; }
  if (e.target.closest('[data-more]')) { state.listLimit += 30; renderList(); }
});
// Status-Auswahl (Dropdown)
function closePickers(except) {
  for (const p of $$('.status-picker')) if (p !== except) { p.querySelector('.status-menu').hidden = true; p.querySelector('.status-btn').setAttribute('aria-expanded', 'false'); }
}
for (const p of $$('.status-picker')) {
  const btn = p.querySelector('.status-btn');
  const menu = p.querySelector('.status-menu');
  btn.onclick = (e) => {
    e.stopPropagation(); closePickers(p);
    menu.hidden = !menu.hidden;
    btn.setAttribute('aria-expanded', String(!menu.hidden));
    if (!menu.hidden) {
      // Über dem Knopf einblenden, über allem anderen (wird so nicht vom Fenster abgeschnitten)
      const r = btn.getBoundingClientRect();
      Object.assign(menu.style, { left: `${r.left}px`, width: `${r.width}px`, bottom: `${innerHeight - r.top + 6}px` });
    }
  };
  menu.onclick = (e) => { const o = e.target.closest('[data-status]'); if (!o) return; setStatus(o.dataset.status); closePickers(); };
}
document.addEventListener('click', (e) => { if (!e.target.closest('.status-picker')) closePickers(); });

// Filter-Leiste: Pfeile zeigen, dass man wischen kann
function updateFilterArrows() {
  const f = $('.filters');
  if (!f) return;
  const wrap = f.parentElement;
  wrap.classList.toggle('more-right', f.scrollLeft + f.clientWidth < f.scrollWidth - 4);
  wrap.classList.toggle('more-left', f.scrollLeft > 4);
}
$('#share-live').onchange = (e) => {
  me.shareLive = e.target.checked; saveMe();
  NATIVE?.setLive(me.shareLive, me.status);
  if (!me.shareLive) backend.stopSharing(); else shareMyPosition(true);
  updateRecStats();
};
document.addEventListener('click', (e) => {
  const w = e.target.closest('[data-wave]');
  if (w) { const p = state.people.find((x) => x.id === w.dataset.wave); if (p) wave(p); }
  const s = e.target.closest('[data-show]');
  if (s) {
    const p = state.people.find((x) => x.id === s.dataset.show);
    if (p) { $('#person-dialog').close(); $('#sheet').classList.remove('expanded'); map.flyTo([p.lat, p.lng], 16); }
  }
  const pr = e.target.closest('[data-person]');
  if (pr) openPerson(pr.dataset.person);
  if (e.target.closest('[data-close-person]')) $('#person-dialog').close();
  if (e.target.closest('[data-close-weather]')) $('#weather-dialog').close();
  if (e.target.closest('[data-close-info]')) $('#info-dialog').close();
  if (e.target.closest('[data-open-info]')) $('#info-btn').click();
  if (e.target.closest('[data-wave]') && $('#person-dialog').open) $('#person-dialog').close();
  if (e.target.closest('[data-login]')) openAuth();
  const d = e.target.closest('[data-dismiss]');
  if (d) { state.dismissed.set(d.dataset.dismiss, Date.now()); checkProximity(); }
});
$('#locate-btn').onclick = () => {
  if (state.myPos) return map.flyTo(state.myPos, 16);
  if (!navigator.geolocation || !window.isSecureContext) return toast('Standort ist hier nicht verfügbar (braucht https).');
  navigator.geolocation.getCurrentPosition(
    (p) => { setMyPos(p.coords.latitude, p.coords.longitude); map.flyTo(state.myPos, 15); loadWeather(...state.myPos); },
    () => toast('Standort konnte nicht ermittelt werden.'),
    { enableHighAccuracy: true, timeout: 15000 },
  );
};
/**
 * Unteres Fenster größer/kleiner machen. dir: 'up', 'down' oder leer (Antippen).
 * Während Aufnahme und Speichern gibt es zwei Größen: ganz oder nur eine schmale Leiste.
 */
function moveSheet(dir) {
  const s = $('#sheet');
  if (s.classList.contains('fit')) {
    if (dir === 'up') s.classList.remove('collapsed');
    else if (dir === 'down') s.classList.add('collapsed');
    else s.classList.toggle('collapsed');
    return;
  }
  const sizes = ['collapsed', '', 'expanded'];
  let i = s.classList.contains('collapsed') ? 0 : s.classList.contains('expanded') ? 2 : 1;
  if (dir === 'up') i = Math.min(2, i + 1);
  else if (dir === 'down') i = Math.max(0, i - 1);
  else i = i === 1 ? 2 : i === 2 ? 0 : 1; // Antippen: normal → groß → klein → normal
  s.classList.remove('collapsed', 'expanded');
  if (sizes[i]) s.classList.add(sizes[i]);
}
$('#sheet-handle').onclick = () => moveSheet();
// Wischen am Griff oder an der Kopfzeile des Fensters
{
  let y0 = null;
  const start = (e) => { y0 = e.touches[0].clientY; };
  const end = (e) => {
    if (y0 == null) return;
    const dy = e.changedTouches[0].clientY - y0;
    y0 = null;
    if (Math.abs(dy) > 30) { e.preventDefault(); moveSheet(dy > 0 ? 'down' : 'up'); }
  };
  for (const el of [$('#sheet-handle'), $('.rec-head'), $('.tabs'), $('.stats')]) {
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchend', end);
  }
}
// In der schmalen Leiste: Antippen der Zahlen holt alles zurück
$('.stats').addEventListener('click', () => { if ($('#sheet').classList.contains('collapsed')) moveSheet('up'); });
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && rec.active && (!rec.wakeLock || rec.wakeLock.released)) {
    try { rec.wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* egal */ }
  }
});

// ---------- Start ----------
const backend = await createBackend();
syncStatusInputs();
try {
  state.routes = await backend.getRoutes();
} catch {
  toast('Runden konnten nicht geladen werden. Prüfe die Internetverbindung.');
}
drawRoutes();
fitAll();
renderList();
loadNearby(true);
renderFind();
backend.onLive(onLive);
backend.onWave((msg) => { if (msg.to === me.id) showWave(msg); });
{
  // Wer sich anmeldet, während diese Abfrage noch läuft, soll nicht wieder abgemeldet werden.
  let startUser = null;
  try { startUser = await backend.me(); } catch { /* offline */ }
  if (!state.user) setUser(startUser);
  if (backend.accounts && !state.user) openAuth('Willkommen bei Gassirunde! Melde dich an oder lege ein Konto an.');
}

if (NATIVE) {
  // Läuft im Hintergrund noch eine Aufnahme (App wurde neu geöffnet)? Dann dort weitermachen.
  if (NATIVE.isRecording() && state.user) startWalk(null, true);
  checkAppUpdate();
}

/** Neue App-Version auf dem Server? Dann Hinweis mit Download. */
async function checkAppUpdate() {
  try {
    const v = await (await fetch('app/version.json', { cache: 'no-store' })).json();
    const newer = (a, b) => {
      const x = a.split('.').map(Number); const y = b.split('.').map(Number);
      for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
      return false;
    };
    if (v?.version && newer(v.version, NATIVE.version())) {
      toast(`Neue App-Version ${v.version} ist da.`, { label: 'Laden', fn: () => NATIVE.openExternal(new URL('app/' + v.file, location.href).href) }, 15000);
    }
  } catch { /* offline oder keine Versionsdatei */ }
}
const c = map.getCenter();
loadWeather(c.lat, c.lng);
