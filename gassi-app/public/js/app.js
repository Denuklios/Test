import {
  distance, pathLength, pointAlong, trimEnds, distanceToPath, acceptFix,
  estimateMinutes, dogScore, busyLevel, quietestHour, averageRating, matchRoute,
  formatKm, formatDuration, formatDistanceShort, STATUS, LABELS,
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
  id: null, name: '', dog: '', dogAge: 'erwachsen', email: '',
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

// ---------- Karte ----------
const map = L.map('map', { zoomControl: false, preferCanvas: true }).setView([54.85, 9.36], 11);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
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
const scoreOf = (r) => dogScore(r.attrs, { tempC: state.tempC, dogAge: me.dogAge, km: r.distanceKm });

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
    <div class="filters" role="group" aria-label="Runden filtern">${chips}</div>
    <p class="section-note">${list.length} ${list.length === 1 ? 'Runde' : 'Runden'} ${state.myPos ? 'in deiner Nähe' : 'rund um die Kartenmitte'}${state.filters.size ? ' (gefiltert)' : ''}</p>
    ${list.length ? `<ul class="route-list">${list.slice(0, state.listLimit).map(card).join('')}</ul>` : `<p class="empty">Keine Runde passt zu den Filtern. Nimm einen Filter heraus oder verschiebe die Karte.</p>`}
    ${list.length > state.listLimit ? `<button class="btn secondary small more-btn" data-more>Weitere ${Math.min(30, list.length - state.listLimit)} anzeigen</button>` : ''}
    <p class="hint">Der Hunde-Score (0–100) bewertet Wasser, Schatten, Untergrund, Straßen, Leinenregel und Mülleimer. Hundeausläufe und Wanderwege stammen aus OpenStreetMap (© OpenStreetMap-Mitwirkende, ODbL). Verschiebe die Karte, um Runden in anderen Gegenden zu sehen.</p>`;
  state.listSig = listSignature();
}

function listSignature() {
  if (!state.people.length) return 'leer';
  return state.routes.map((r) => `${r.id}:${liveOnRoute(r).length}`).join('|');
}

// ---------- Detail einer Runde ----------
function openRoute(id, { fly = true } = {}) {
  const r = routeById(id);
  if (!r) return;
  state.selected = id;
  state.view = 'detail';
  switchTab('runden');
  renderDetail();
  styleRouteLines();
  if (fly) map.fitBounds(L.latLngBounds(r.points), mapPadding());
}

function closeDetail() {
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
    ${sc.warnings.length ? `<ul class="warnings">${sc.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}

    <h3 class="list-title">So setzt sich der Score zusammen</h3>
    <ul class="breakdown">${sc.parts.map((p) => `<li${p.unknown ? ' class="unknown"' : ''}><span>${esc(p.label)}</span><span class="bar"><i style="width:${(p.pts / p.max) * 100}%"></i></span><span class="pts">${p.pts}/${p.max}</span></li>`).join('')}</ul>

    <h3 class="list-title">Wie voll ist es?</h3>
    <p style="margin:0">Jetzt ${busy.label}${liveN ? `, <b>${liveN} ${liveN === 1 ? 'Hund' : 'Hunde'} gerade auf der Runde</b>` : ', gerade niemand live auf der Runde'}. Am ruhigsten gegen ${quiet} Uhr.</p>
    <div class="busy-chart" role="img" aria-label="Belebtheit über den Tag, 6 bis 23 Uhr">${bars.join('')}</div>
    <div class="busy-axis"><span>6</span><span>9</span><span>12</span><span>15</span><span>18</span><span>21</span><span>23 Uhr</span></div>
    <p class="hint">Typischer Tagesverlauf. Mit echten Nutzern lernt die App ihn aus den aufgezeichneten Spaziergängen.</p>

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
  if (!dlg.open) dlg.showModal();
}

function renderPerson(p) {
  const d = state.myPos ? distance(state.myPos, [p.lat, p.lng]) : null;
  const route = state.routes.find((r) => distanceToPath([p.lat, p.lng], r.points) < ON_ROUTE);
  const ago = Math.max(0, Math.round((Date.now() - (p.at || Date.now())) / 1000));
  $('#person-body').innerHTML = `
    <div class="person-head">
      <span class="avatar ${esc(p.status)}" aria-hidden="true">${esc(initial(p.name))}</span>
      <div><h2 id="person-name">${esc(p.name)}</h2><p class="sub">${p.dog ? `mit ${esc(p.dog)}` : 'ohne Hundenamen'}${p.demo ? ' · Demo' : ''}</p></div>
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
  $('#start-btn').hidden = true;
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

function showSaveForm() {
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
  $('#browse').hidden = false; $('#start-btn').hidden = false;
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
  for (const i of $$('input[name="status"], input[name="rstatus"]')) i.checked = i.value === me.status;
  $('#share-live').checked = me.shareLive;
}

async function openProfile() {
  if (backend.accounts && !state.user) return openAuth();
  $('#me-name').value = me.name; $('#me-dog').value = me.dog; $('#me-age').value = me.dogAge; $('#me-simulate').checked = me.simulate;
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
    const user = await backend.updateProfile({ name, dog: $('#me-dog').value.trim(), dogAge: $('#me-age').value });
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
      ? await backend.register({ email, password, name: $('#reg-name').value.trim(), dog: $('#reg-dog').value.trim(), dogAge: $('#reg-age').value })
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
  Object.assign(me, { id: user?.id ?? null, name: user?.name ?? '', dog: user?.dog ?? '', dogAge: user?.dogAge ?? 'erwachsen', email: user?.email ?? '' });
  const btn = $('#me-btn');
  const out = backend.accounts && !user;
  btn.classList.toggle('logged-out', out);
  $('#me-initial').textContent = out ? 'Anmelden' : initial(me.name || me.dog);
  btn.setAttribute('aria-label', out ? 'Anmelden' : 'Mein Profil');
  if (user) backend.connect(); else { backend.disconnect(); state.people = []; }
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
  if (tab === 'runden' && state.view === 'list') renderList();
}

// ---------- Wetter ----------
async function loadWeather(lat, lng) {
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}&current=temperature_2m`);
    const t = (await r.json()).current?.temperature_2m;
    if (typeof t !== 'number') return;
    state.tempC = t;
    const chip = $('#weather');
    chip.textContent = `${Math.round(t)} °C`;
    chip.hidden = false;
    chip.classList.toggle('hot', t >= 25);
    chip.title = t >= 25 ? 'Heiß: Achte auf Schatten, Wasser und heißen Asphalt' : 'Temperatur am Kartenmittelpunkt';
    state.view === 'detail' ? renderDetail() : renderList();
  } catch { /* ohne Wetter geht es auch */ }
}

// ---------- Kleine Meldungen ----------
let toastTimer = null;
function toast(text, action = null, ms = 5000) {
  const el = $('#toast');
  el.innerHTML = `<p>${esc(text)}</p>${action ? `<button class="btn small" id="toast-action">${esc(action.label)}</button>` : ''}`;
  if (action) $('#toast-action').onclick = () => { el.hidden = true; action.fn(); };
  // Über dem unteren Fenster anzeigen (auf dem Handy), damit nichts verdeckt wird
  el.style.bottom = innerWidth < 900 ? `${$('#sheet').getBoundingClientRect().height + 12}px` : '';
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

// ---------- Ereignisse ----------
$('#start-btn').onclick = () => requireLogin('Melde dich an, um Spaziergänge aufzuzeichnen und Runden zu teilen.', () => startWalk(null));
$('#pause-btn').onclick = togglePause;
$('#stop-btn').onclick = () => stopWalk();
$('#save-form').onsubmit = saveWalk;
$('#discard-btn').onclick = discardWalk;
$('#sv-share').onchange = toggleShareFields;
$('#me-btn').onclick = openProfile;
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
  if (e.target.closest('[data-more]')) { state.listLimit += 30; renderList(); }
});
for (const i of $$('input[name="status"], input[name="rstatus"]')) i.onchange = () => setStatus(i.value);
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
