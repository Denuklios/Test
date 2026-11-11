// Hauptprogramm: Navigation, Ansichten, Import, Auswahl, Einstellungen
import { icon } from './icons.js';
import { store } from './store.js';
import { db } from './db.js';
import { importFiles } from './importer.js';
import { startAnalysis, status, resetAnalysis } from './analyzer.js';
import { clipState, CATEGORIES, categoryById } from './smart.js';
import { runSearch, searchCategory, suggestions } from './search.js';
import { renamePerson, mergePeople, detachFace, regroupFaces } from './faces.js';
import { openViewer } from './viewer.js';
import { FUN } from './fun/index.js';
import { afterAllClosed } from './layers.js';
import { isNative, hasAccess, requestAccess, syncDevice } from './native.js';
import {
  $, $$, el, blobUrl, MONTHS, fmtBytes, toast, modal, confirmDialog, promptDialog, COLOR_NAMES, relTime, shuffle,
} from './util.js';

const view = $('#view');
const sel = { on: false, ids: new Set() };
let currentList = [];

// ---------- Fotoraster ----------
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    const img = e.target;
    const p = store.photos.get(img.dataset.id);
    if (p) {
      img.onload = () => img.classList.add('ok');
      img.src = blobUrl(p.thumb);
    }
    io.unobserve(img);
  }
}, { rootMargin: '600px' });

function tile(p, list) {
  const img = el('img', { alt: '', 'data-id': p.id, draggable: false });
  io.observe(img);
  const t = el('button', { class: 'tile' + (sel.ids.has(p.id) ? ' sel' : ''), 'data-id': p.id, 'aria-label': p.name },
    img, el('span', { class: 'check' }), p.fav && el('span', { class: 'fav' }, '♥'));
  t.addEventListener('click', () => {
    if (sel.on) return toggleSelect(p.id, t);
    openViewer(list, list.indexOf(p));
  });
  // langes Drücken startet die Auswahl
  let timer;
  t.addEventListener('pointerdown', () => { timer = setTimeout(() => { if (!sel.on) { setSelecting(true); toggleSelect(p.id, t); } }, 550); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => t.addEventListener(ev, () => clearTimeout(timer)));
  t.addEventListener('contextmenu', (e) => e.preventDefault());
  return t;
}

function grid(list, { byMonth = false } = {}) {
  currentList = list;
  const cols = store.settings.cols;
  if (!byMonth) return el('div', { class: 'grid', style: `--cols:${cols}` }, list.map((p) => tile(p, list)));
  const groups = new Map();
  for (const p of list) {
    const d = new Date(p.date);
    const key = d.getFullYear() * 100 + d.getMonth();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  return el('div', {}, [...groups].map(([key, ps]) =>
    el('section', { class: 'month' },
      el('h3', {}, `${MONTHS[key % 100]} ${Math.floor(key / 100)}`, el('small', {}, `${ps.length}`)),
      el('div', { class: 'grid', style: `--cols:${cols}` }, ps.map((p) => tile(p, list))))));
}

// ---------- Auswahl ----------
function setSelecting(on) {
  sel.on = on;
  if (!on) sel.ids.clear();
  document.body.classList.toggle('selecting', on);
  $('#selectbar').classList.toggle('hidden', !on);
  $('#selectBtn').classList.toggle('on', on);
  $$('.tile.sel').forEach((t) => t.classList.remove('sel'));
  updateSelCount();
}
function toggleSelect(id, t) {
  sel.ids.has(id) ? sel.ids.delete(id) : sel.ids.add(id);
  t.classList.toggle('sel', sel.ids.has(id));
  updateSelCount();
}
function updateSelCount() { $('#selCount').textContent = `${sel.ids.size} ausgewählt`; }
const selectedPhotos = () => [...sel.ids].map((id) => store.photos.get(id)).filter(Boolean);

$('#selectBtn').onclick = () => setSelecting(!sel.on);
$('#selCancel').onclick = () => setSelecting(false);
$('#selFav').onclick = async () => {
  const ps = selectedPhotos();
  const val = !ps.every((p) => p.fav);
  for (const p of ps) { p.fav = val; await db.put('photos', p); }
  toast(val ? `${ps.length} Favoriten ♥` : 'Favoriten entfernt');
  setSelecting(false); render();
};
$('#selDelete').onclick = async () => {
  const ps = selectedPhotos();
  if (!ps.length || !(await confirmDialog(deleteQuestion(ps.length), isNative ? 'Ausblenden' : 'Löschen', true))) return;
  await deletePhotos(ps);
  setSelecting(false);
};
$('#selShow').onclick = () => { const ps = selectedPhotos(); if (ps.length) { setSelecting(false); FUN.slideshow.run(ps); } };
$('#selCarousel').onclick = () => { const ps = selectedPhotos(); if (ps.length) { setSelecting(false); FUN.carousel.run(ps); } };

/** Fotos entfernen. Handy-Fotos (Android-App) werden nur aus der Galerie entfernt, nicht vom Handy gelöscht. */
export async function deletePhotos(ps, { silent = false, forget = false } = {}) {
  const ignored = new Set((await db.getMeta('ignored')) || []);
  for (const p of ps) {
    for (const fid of p.faceIds || []) store.faces.delete(fid);
    store.photos.delete(p.id);
    await db.deletePhoto(p.id);
    if (p.src && !forget) ignored.add(p.hash);
  }
  if (!forget) await db.setMeta('ignored', [...ignored]);
  // Personen ohne Gesichter entfernen
  for (const [id] of store.people) if (!store.facesOfPerson(id).length) { store.people.delete(id); await db.del('people', id); }
  if (!silent) toast(`${ps.length} Foto(s) entfernt`);
  store.emit('library');
}

export const deleteQuestion = (n) => (isNative
  ? `${n} Foto(s) aus der Galerie ausblenden? (Auf dem Handy bleiben sie erhalten.)`
  : `${n} Foto(s) löschen?`);

// ---------- Ansichten ----------
function emptyState() {
  return el('div', { class: 'empty' },
    el('div', { class: 'big' }, '📸'),
    el('h2', {}, 'Willkommen in deiner Galerie'),
    el('p', { class: 'muted' }, 'Füge Fotos hinzu. Gesichter und Motive (Autos, Häuser, Pflanzen …) werden automatisch erkannt – alles bleibt privat auf diesem Gerät.'),
    isNative
      ? el('div', { class: 'row', style: 'justify-content:center;margin-top:16px' },
        el('button', { class: 'btn primary', onclick: () => connectDevice() }, icon('phone'), 'Fotos vom Handy anzeigen'),
        el('button', { class: 'btn', onclick: () => $('#fileInput').click() }, icon('add'), 'Einzelne auswählen'))
      : el('div', { class: 'row', style: 'justify-content:center;margin-top:16px' },
        el('button', { class: 'btn primary', onclick: () => $('#fileInput').click() }, icon('add'), 'Fotos auswählen'),
        el('button', { class: 'btn', onclick: () => $('#dirInput').click() }, icon('folder'), 'Ganzen Ordner')),
    !isNative && el('p', { class: 'muted', style: 'font-size:13px;margin-top:14px' }, 'Am Computer kannst du Fotos auch einfach hierher ziehen.'));
}

function memoriesStrip() {
  const now = new Date();
  const all = store.sorted();
  const cards = [];
  // "An diesem Tag" – gleiche Woche in früheren Jahren
  const byYear = new Map();
  for (const p of all) {
    const d = new Date(p.date);
    if (d.getFullYear() >= now.getFullYear()) continue;
    const diff = Math.abs((d.getMonth() * 31 + d.getDate()) - (now.getMonth() * 31 + now.getDate()));
    if (diff <= 4) { if (!byYear.has(d.getFullYear())) byYear.set(d.getFullYear(), []); byYear.get(d.getFullYear()).push(p); }
  }
  for (const [, ps] of byYear) cards.push({ title: relTime(ps[0].date), photos: ps });
  const favs = all.filter((p) => p.fav);
  if (favs.length >= 3) cards.push({ title: '♥ Lieblingsmomente', photos: shuffle(favs) });
  for (const person of store.peopleList().filter((p) => p.name).slice(0, 4)) {
    const ps = store.photosOfPerson(person.id);
    if (ps.length >= 2) cards.push({ title: `Mit ${person.name}`, photos: shuffle(ps) });
  }
  if (all.length >= 8) cards.push({ title: '🎲 Zufallsmix', photos: shuffle(all).slice(0, 30) });
  if (!cards.length) return null;
  return el('div', {},
    el('div', { class: 'section', style: 'padding-bottom:0' }, el('h2', {}, 'Erinnerungen')),
    el('div', { class: 'memories' }, cards.map((c) =>
      el('button', { class: 'memory', onclick: () => FUN.slideshow.run(c.photos, { title: c.title }) },
        el('img', { src: blobUrl(c.photos[0].thumb), alt: '' }), el('span', {}, c.title)))));
}

function viewPhotos() {
  setTitle('Fotos');
  const list = store.sorted();
  if (!list.length) return view.replaceChildren(emptyState());
  view.replaceChildren(
    memoriesStrip() || '',
    el('div', { class: 'section row', style: 'padding-bottom:0' },
      el('span', { class: 'muted' }, `${list.length} Fotos`),
      el('span', { class: 'spacer' }),
      el('button', { class: 'chip round', title: 'Kleinere Vorschau', onclick: () => zoomGrid(1) }, icon('minus')),
      el('button', { class: 'chip round', title: 'Größere Vorschau', onclick: () => zoomGrid(-1) }, icon('add'))),
    grid(list, { byMonth: true }));
}

function zoomGrid(d) {
  store.settings.cols = Math.max(2, Math.min(8, store.settings.cols + d));
  store.saveSettings();
  $$('.grid').forEach((g) => g.style.setProperty('--cols', store.settings.cols));
}

function viewPeople() {
  setTitle('Personen');
  const people = store.peopleList();
  const named = people.filter((p) => p.name || p.count >= 2);
  const single = people.filter((p) => !p.name && p.count < 2);
  const faceImg = (p) => {
    const f = store.faces.get(p.coverFaceId) || store.facesOfPerson(p.id)[0];
    return el('img', { src: f ? blobUrl(f.crop) : '', alt: '', loading: 'lazy' });
  };
  const card = (p) => el('button', { class: 'person', onclick: () => go(`#/person/${p.id}`) },
    faceImg(p), el('b', {}, p.name || 'Name hinzufügen'), el('small', {}, `${p.count} Foto${p.count === 1 ? '' : 's'}`));
  const st = status.faces;
  view.replaceChildren(el('div', { class: 'section' },
    !store.settings.faces && el('p', { class: 'muted' }, 'Die Gesichtserkennung ist ausgeschaltet (Einstellungen ⚙️).'),
    !people.length && store.settings.faces && el('div', { class: 'empty' }, el('div', { class: 'big' }, '🙂'),
      el('h2', {}, st.running ? 'Gesichter werden gesucht …' : 'Noch keine Gesichter'),
      el('p', { class: 'muted' }, 'Sobald Fotos mit Menschen da sind, werden die Gesichter automatisch zu Personen gruppiert. Gib ihnen Namen – dann kannst du z. B. nach „Anna am Strand“ suchen.')),
    named.length > 0 && el('h2', {}, 'Personen', el('span', { class: 'spacer' }),
      el('button', { class: 'btn small', onclick: async () => { await regroupFaces(); toast('Neu gruppiert'); } }, icon('refresh'), 'Neu gruppieren')),
    el('div', { class: 'people' }, named.map(card)),
    single.length > 0 && el('details', { style: 'margin-top:20px' },
      el('summary', { class: 'muted', style: 'cursor:pointer;padding:8px 0' }, `Weitere Gesichter (${single.length})`),
      el('div', { class: 'people', style: 'margin-top:10px' }, single.map(card)))));
}

function viewPerson(id) {
  const person = store.people.get(id);
  if (!person) return go('#/personen');
  setTitle(person.name || 'Unbekannte Person', true);
  const photos = store.photosOfPerson(id);
  const faces = store.facesOfPerson(id);
  const names = store.peopleList().filter((p) => p.name && p.id !== id).map((p) => p.name);
  const rename = async () => {
    const name = await promptDialog(person.name ? 'Name ändern' : 'Wer ist das?', person.name, 'Name', names);
    if (!name) return;
    const newId = await renamePerson(id, name);
    toast(newId !== id ? `Mit „${name}“ zusammengeführt` : `Gespeichert: ${name}`);
    go(`#/person/${newId}`, true);
  };
  const merge = async () => {
    const others = store.peopleList().filter((p) => p.id !== id);
    if (!others.length) return toast('Keine anderen Personen vorhanden');
    const target = await modal({
      title: 'Mit welcher Person zusammenführen?', wide: true,
      body: el('div', { class: 'people' }, others.map((p) => {
        const f = store.faces.get(p.coverFaceId);
        return el('button', { class: 'person', onclick: (e) => e.target.closest('dialog')._close(p.id) },
          el('img', { src: f ? blobUrl(f.crop) : '' }), el('b', {}, p.name || '?'), el('small', {}, `${p.count}`));
      })),
      actions: [{ label: 'Abbrechen', value: () => null }],
    });
    if (target) { await mergePeople(id, target); toast('Zusammengeführt'); go(`#/person/${target}`, true); }
  };
  view.replaceChildren(
    el('div', { class: 'section' },
      el('div', { class: 'row', style: 'gap:16px' },
        el('img', { class: 'face', style: 'width:88px', src: faces[0] ? blobUrl((store.faces.get(person.coverFaceId) || faces[0]).crop) : '' }),
        el('div', { style: 'flex:1;min-width:160px' },
          el('h2', { style: 'margin:0' }, person.name || 'Unbekannt'),
          el('div', { class: 'muted' }, `${photos.length} Fotos`),
          el('div', { class: 'row', style: 'margin-top:8px' },
            el('button', { class: 'btn small primary', onclick: rename }, icon('edit'), person.name ? 'Umbenennen' : 'Name geben'),
            el('button', { class: 'btn small', onclick: merge }, icon('link'), 'Zusammenführen'),
            el('button', { class: 'btn small', onclick: () => FUN.slideshow.run(photos, { title: person.name }) }, icon('play'), 'Diashow'),
            el('button', { class: 'btn small', onclick: async () => { person.hidden = true; await db.put('people', person); go('#/personen'); } }, icon('hide'), 'Ausblenden')))),
      faces.length > 1 && el('details', {},
        el('summary', { class: 'muted', style: 'cursor:pointer;padding:12px 0 6px' }, 'Gesichter prüfen – falsche mit ✕ entfernen'),
        el('div', { class: 'faces' }, faces.map((f) => el('div', { class: 'face-cell' },
          el('img', { class: 'face', src: blobUrl(f.crop), title: 'Foto öffnen', onclick: () => openViewer(photos, photos.findIndex((p) => p.id === f.photoId)) }),
          el('button', { class: 'x', title: 'Nicht diese Person', onclick: async () => { await detachFace(f.id); viewPerson(id); } }, '✕')))))),
    grid(photos));
}

let lastQuery = '';
function viewExplore(query = '') {
  setTitle('Entdecken');
  const input = el('input', { class: 'input', type: 'search', placeholder: 'Suche: Auto, Haus, Pflanzen, Anna am Strand, 2023 …', value: query, enterkeyhint: 'search' });
  const results = el('div', {});
  const box = el('div', { class: 'searchbox' }, el('div', { style: 'position:relative' }, el('span', { class: 'ico' }, icon('search')), input));
  let t;
  const doSearch = async (q) => {
    lastQuery = q;
    history.replaceState(null, '', q ? `#/suche/${encodeURIComponent(q)}` : '#/entdecken');
    if (!q.trim()) { results.replaceChildren(exploreHome()); return; }
    results.replaceChildren(el('div', { class: 'result-info' }, 'Suche …'));
    try {
      const r = await runSearch(q);
      if (q !== lastQuery) return;
      results.replaceChildren(
        el('div', { class: 'result-info row' }, `${r.photos.length} Treffer · ${r.info.join(' · ')}`, el('span', { class: 'spacer' }),
          r.photos.length > 1 && el('button', { class: 'chip', onclick: () => FUN.slideshow.run(r.photos, { title: q }) }, icon('play'), 'Diashow'),
          r.photos.length > 2 && el('button', { class: 'chip', onclick: () => FUN.carousel.run(r.photos) }, icon('carousel'), 'Karussell')),
        r.photos.length ? grid(r.photos) : el('div', { class: 'empty' }, el('div', { class: 'big' }, '🤷'), el('p', {}, 'Nichts gefunden.'),
          !clipState.ready && el('p', { class: 'muted' }, 'Die smarte Suche ist noch nicht fertig geladen.')));
    } catch (e) {
      results.replaceChildren(el('div', { class: 'result-info' }, 'Fehler bei der Suche: ' + e.message));
    }
  };
  input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => doSearch(input.value), 350); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(t); doSearch(input.value); input.blur(); } });
  view.replaceChildren(box,
    el('div', { class: 'section', style: 'padding-top:0' }, el('div', { class: 'chips' }, suggestions().map((s) =>
      el('button', { class: 'chip', onclick: () => { input.value = s; doSearch(s); } }, s)))),
    results);
  doSearch(query);
  if (!query) setTimeout(() => input.focus({ preventScroll: true }), 50);
}

function exploreHome() {
  const all = store.sorted();
  if (!all.length) return emptyState();
  const people = store.peopleList().filter((p) => p.name || p.count >= 2).slice(0, 12);
  const catCounts = new Map();
  for (const p of all) for (const t of p.tags) catCounts.set(t, (catCounts.get(t) || 0) + 1);
  const cats = CATEGORIES.filter((c) => catCounts.get(c[0])).sort((a, b) => catCounts.get(b[0]) - catCounts.get(a[0]));
  const colors = COLOR_NAMES.filter((c) => all.some((p) => p.colorName === c.id));
  const years = [...new Set(all.map((p) => new Date(p.date).getFullYear()))].sort((a, b) => b - a);
  const coverFor = (catId) => all.find((p) => p.tags.includes(catId));
  return el('div', { class: 'section' },
    people.length > 0 && el('h2', {}, 'Personen'),
    people.length > 0 && el('div', { class: 'chips' }, people.map((p) => {
      const f = store.faces.get(p.coverFaceId);
      return el('button', { class: 'chip', onclick: () => go(`#/person/${p.id}`) }, f && el('img', { src: blobUrl(f.crop) }), p.name || `? (${p.count})`);
    })),
    el('h2', {}, 'Motive'),
    cats.length ? el('div', { class: 'cats' }, cats.map((c) => {
      const cover = coverFor(c[0]);
      return el('button', { class: 'cat', onclick: () => go(`#/kategorie/${c[0]}`) },
        cover && el('img', { src: blobUrl(cover.thumb), loading: 'lazy' }), el('em', {}, c[2]), el('span', {}, `${c[1]} · ${catCounts.get(c[0])}`));
    })) : el('p', { class: 'muted' }, clipState.ready ? 'Die Fotos werden gerade analysiert …' : 'Die Bilderkennung lädt noch (einmalig ca. 66 MB) …'),
    el('h2', {}, 'Farben'),
    el('div', { class: 'colors' }, colors.map((c) => el('button', { class: 'color-dot', title: c.label, style: { background: c.css }, onclick: () => go(`#/farbe/${c.id}`) }))),
    el('h2', {}, 'Jahre'),
    el('div', { class: 'chips' }, years.map((y) => el('button', { class: 'chip', onclick: () => go(`#/suche/${y}`) }, String(y)))));
}

async function viewCategory(id) {
  const c = categoryById(id);
  if (!c) return go('#/entdecken');
  setTitle(`${c[2]} ${c[1]}`, true);
  view.replaceChildren(el('div', { class: 'result-info' }, 'Lade …'));
  const list = clipState.ready ? (await searchCategory(id)).map((x) => x.p) : store.sorted().filter((p) => p.tags.includes(id));
  view.replaceChildren(el('div', { class: 'result-info row' }, `${list.length} Fotos`, el('span', { class: 'spacer' }),
    list.length > 1 && el('button', { class: 'chip', onclick: () => FUN.slideshow.run(list, { title: c[1] }) }, icon('play'), 'Diashow')), grid(list));
}

function viewColor(id) {
  const c = COLOR_NAMES.find((x) => x.id === id);
  setTitle(`Farbe: ${c?.label || id}`, true);
  const list = store.sorted().filter((p) => p.colorName === id);
  view.replaceChildren(el('div', { class: 'result-info' }, `${list.length} Fotos`), grid(list));
}

function viewFun() {
  setTitle('Spaß');
  const n = store.photos.size;
  view.replaceChildren(el('div', { class: 'section' },
    n < 2 && el('p', { class: 'muted' }, 'Füge zuerst ein paar Fotos hinzu – je mehr, desto lustiger!'),
    el('div', { class: 'fun' }, Object.values(FUN).map((f) =>
      el('button', { class: 'fun-card', style: `--g:${f.bg}`, onclick: () => (n ? f.run() : toast('Erst Fotos hinzufügen')) },
        el('span', { class: 'e' }, f.emoji), el('b', {}, f.name), el('small', {}, f.desc))))));
}

// ---------- Navigation ----------
function setTitle(t, back = false) {
  $('#title').textContent = t;
  $('#backBtn').classList.toggle('hidden', !back);
}
$('#backBtn').onclick = () => history.back();

export function go(hash, replace = false) {
  if (replace) { history.replaceState(null, '', hash); render(); } else location.hash = hash;
}

function render() {
  const [, route, arg] = (location.hash || '#/fotos').split('/');
  const tab = { person: 'personen', suche: 'entdecken', kategorie: 'entdecken', farbe: 'entdecken' }[route] || route || 'fotos';
  $$('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
  $('#selectBtn').classList.toggle('hidden', !['fotos', 'person', 'suche', 'kategorie', 'farbe'].includes(route || 'fotos'));
  const scroll = window.scrollY;
  switch (route) {
    case 'personen': viewPeople(); break;
    case 'person': viewPerson(arg); break;
    case 'entdecken': viewExplore(); break;
    case 'suche': viewExplore(decodeURIComponent(arg || '')); break;
    case 'kategorie': viewCategory(arg); break;
    case 'farbe': viewColor(arg); break;
    case 'spass': viewFun(); break;
    default: viewPhotos();
  }
  return scroll;
}

let lastRoute = '';
window.addEventListener('hashchange', () => {
  if (sel.on) setSelecting(false);
  render();
  if (location.hash !== lastRoute) window.scrollTo(0, 0);
  lastRoute = location.hash;
});
$('#searchBtn').onclick = () => go('#/entdecken');

// Neu zeichnen, wenn sich Daten ändern (gebündelt, Scrollposition bleibt)
let rerenderTimer;
let pendingRender = false;
afterAllClosed.add(() => { if (pendingRender) { pendingRender = false; const y = window.scrollY; render(); window.scrollTo(0, y); } });
function softRerender(routes) {
  const [, route] = (location.hash || '#/fotos').split('/');
  if (!routes.includes(route || 'fotos') || sel.on) return;
  if (document.querySelector('.layer, dialog[open]')) { pendingRender = true; return; }
  if ($('.searchbox input') === document.activeElement) return;
  clearTimeout(rerenderTimer);
  rerenderTimer = setTimeout(() => { const y = window.scrollY; render(); window.scrollTo(0, y); }, 700);
}
store.on('library', () => softRerender(['fotos', 'entdecken', 'personen', 'spass']));
store.on('added', () => softRerender(['fotos']));
store.on('people', () => softRerender(['personen', 'person']));
store.on('clip-ready', () => softRerender(['entdecken']));

// ---------- Statusleiste (Import / Analyse / Modelle) ----------
let importing = null;
function updateStatus() {
  const bar = $('#statusbar');
  const rows = [];
  if (importing) rows.push([`${importing.label || 'Importiere'} ${importing.i} von ${importing.n} …`, importing.i / importing.n]);
  if (clipState.loading) rows.push([`Lade Bilderkennung (einmalig) … ${Math.round(clipState.progress * 100)} %`, clipState.progress]);
  if (status.faces.loading) rows.push(['Lade Gesichtserkennung (einmalig) …', 0.05]);
  const f = status.faces, c = status.clip;
  if (f.running && f.todo && !f.loading) rows.push([`Suche Gesichter: ${f.done} von ${f.todo}`, f.done / f.todo]);
  if (c.running && c.todo && !clipState.loading) rows.push([`Erkenne Motive: ${c.done} von ${c.todo}`, c.done / c.todo]);
  if (f.error) rows.push(['⚠️ ' + f.error, 0]);
  if (c.error) rows.push(['⚠️ ' + c.error, 0]);
  bar.classList.toggle('hidden', !rows.length);
  bar.replaceChildren(...rows.map(([t, v]) => el('div', {}, t, v > 0 && el('div', { class: 'bar' }, el('i', { style: `width:${Math.round(v * 100)}%` })))));
}
store.on('analysis', updateStatus);
store.on('clip-progress', updateStatus);

// ---------- Import ----------
async function handleFiles(files) {
  if (!files?.length) return;
  importing = { i: 0, n: files.length };
  updateStatus();
  await importFiles(files, (i, n) => { importing = { i, n }; updateStatus(); });
  importing = null;
  updateStatus();
  if (!location.hash || location.hash === '#/fotos') render();
  startAnalysis();
}

$('#addBtn').onclick = () => modal({
  title: 'Fotos hinzufügen',
  body: el('p', { class: 'muted' }, isNative ? 'Die Galerie zeigt automatisch alle Fotos deines Handys. Hier kannst du zusätzlich einzelne Bilder (z. B. aus Downloads) hinzufügen.' : 'Die Fotos werden in den Speicher dieses Browsers kopiert. Nichts wird hochgeladen.'),
  actions: [
    { label: 'Abbrechen', value: () => null },
    isNative ? { label: 'Handy-Fotos', icon: 'phone', value: () => connectDevice() } : { label: 'Ordner', icon: 'folder', value: () => $('#dirInput').click() },
    { label: 'Fotos', icon: 'image', primary: true, value: () => $('#fileInput').click() },
  ],
});
$('#fileInput').onchange = (e) => { handleFiles([...e.target.files]); e.target.value = ''; };
$('#dirInput').onchange = (e) => { handleFiles([...e.target.files]); e.target.value = ''; };

let dragDepth = 0;
window.addEventListener('dragenter', (e) => { if (e.dataTransfer?.types.includes('Files')) { dragDepth++; $('#dropzone').classList.remove('hidden'); } });
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#dropzone').classList.add('hidden'); } });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  $('#dropzone').classList.add('hidden');
  handleFiles([...(e.dataTransfer?.files || [])]);
});
// Bilder aus der Zwischenablage einfügen
window.addEventListener('paste', (e) => {
  const files = [...(e.clipboardData?.files || [])].map((f) => (f.name === 'image.png' ? new File([f], `Eingefügt ${new Date().toLocaleString('de-DE')}.png`, { type: f.type, lastModified: Date.now() }) : f));
  if (files.length) handleFiles(files);
});

// ---------- Handy-Fotos (nur Android-App) ----------
let syncing = false;
async function connectDevice() {
  if (!(await requestAccess())) {
    toast('Ohne Erlaubnis kann die App deine Fotos nicht anzeigen. Du kannst sie in den Android-Einstellungen erteilen.', 5000);
    return;
  }
  await runDeviceSync();
}

async function runDeviceSync() {
  if (syncing) return;
  syncing = true;
  try {
    importing = { i: 0, n: 1, label: 'Lese Handy-Fotos' };
    updateStatus();
    let started = false;
    const added = await syncDevice((i, n) => {
      importing = { i, n, label: 'Lese Handy-Fotos' };
      updateStatus();
      if (!started && i > 0) { started = true; startAnalysis(); }
    });
    if (added) toast(`${added} neue Fotos`);
  } catch (e) {
    toast('Fotos konnten nicht gelesen werden: ' + e.message, 5000);
  } finally {
    importing = null;
    syncing = false;
    updateStatus();
    startAnalysis();
  }
}

// ---------- Einstellungen ----------
$('#settingsBtn').onclick = async () => {
  const est = await navigator.storage?.estimate?.().catch(() => null);
  const sw = (key, label, sub) => {
    const input = el('input', { type: 'checkbox', class: 'switch', checked: store.settings[key] });
    input.onchange = () => { store.settings[key] = input.checked; store.saveSettings(); if (input.checked) startAnalysis(); };
    return el('label', { class: 'setting' }, el('div', {}, label, el('small', {}, sub)), input);
  };
  const action = (label, sub, btn, fn, danger) => el('div', { class: 'setting' }, el('div', {}, label, el('small', {}, sub)),
    el('button', { class: 'btn small' + (danger ? ' danger' : ''), onclick: fn }, btn));
  modal({
    title: 'Einstellungen', wide: true,
    body: el('div', {},
      sw('faces', '🙂 Gesichtserkennung', 'Findet Gesichter und gruppiert sie zu Personen (Modelle ca. 13 MB, einmalig).'),
      sw('smart', '🔍 Smarte Suche', 'Erkennt Motive wie Auto, Haus, Pflanzen (Modell ca. 66 MB, einmalig).'),
      isNative && action('📱 Handy-Fotos neu einlesen', 'Sucht neue Fotos und zeigt ausgeblendete wieder an.', 'Einlesen', async () => {
        await db.setMeta('ignored', []);
        connectDevice();
      }),
      action('Gesichter neu analysieren', 'Alle Personen und Namen werden zurückgesetzt.', 'Neu starten', async () => {
        if (await confirmDialog('Alle Gesichter und Namen zurücksetzen?', 'Zurücksetzen', true)) resetAnalysis('faces');
      }),
      action('Motive neu erkennen', 'Bildinhalte erneut analysieren.', 'Neu starten', () => resetAnalysis('clip')),
      action('Alles löschen', isNative ? 'Setzt die App zurück (deine Fotos auf dem Handy bleiben).' : 'Entfernt alle Fotos und Daten aus diesem Browser.', 'Löschen', async () => {
        if (!(await confirmDialog('Wirklich ALLE Fotos und Daten löschen?', 'Alles löschen', true))) return;
        await db.clearAll();
        location.reload();
      }, true),
      el('p', { class: 'muted', style: 'font-size:13px;margin-top:14px' },
        `${store.photos.size} Fotos · ${store.peopleList().length} Personen`,
        est ? ` · Speicher: ${fmtBytes(est.usage || 0)} belegt` : '',
        el('br'), isNative ? 'Alle Fotos und Analysen bleiben auf diesem Handy. Die App braucht kein Internet.' : 'Alle Fotos und Analysen bleiben auf diesem Gerät. Aus dem Internet werden nur einmalig die KI-Modelle geladen.')),
    actions: [{ label: 'Fertig', primary: true }],
  });
};

// ---------- Start ----------
async function main() {
  await store.load();
  render();
  lastRoute = location.hash;
  if (store.photos.size) startAnalysis();
  if (isNative) {
    // Beim Start und beim Zurückkehren in die App neue Handy-Fotos aufnehmen
    if (await hasAccess()) runDeviceSync();
    document.addEventListener('visibilitychange', async () => { if (!document.hidden && await hasAccess()) runDeviceSync(); });
  } else if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  // für Tests und die Konsole
  window.galerie = { store, handleFiles, status, clipState };
}
store.on('library', () => { if (status.faces.running === false || status.clip.running === false) startAnalysis(); });
main();
