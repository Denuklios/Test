// Vollbild-Betrachter: wischen, zoomen, Infos, Gesichter benennen, ähnliche Fotos, Teilen
import { store } from './store.js';
import { db } from './db.js';
import { el, blobUrl, fmtDate, fmtBytes, toast, confirmDialog, promptDialog, shareBlob, clamp } from './util.js';
import { moveFace, renamePerson } from './faces.js';
import { categoryById, similarPhotos } from './smart.js';
import { FUN } from './fun/index.js';
import { openLayer } from './layers.js';

export function openViewer(list, index) {
  if (!list.length || index < 0) return;
  let i = index;
  let showInfo = false;
  let showFaces = false;
  let origUrl = null;
  let zoom = 1, panX = 0, panY = 0;

  const img = el('img', { class: 'main', alt: '', draggable: false });
  const wrap = el('div', { class: 'wrap' }, img);
  const slide = el('div', { class: 'slide' }, wrap);
  const stage = el('div', { class: 'stage' }, slide);
  const favBtn = el('button', { class: 'icon-btn', title: 'Favorit (F)', onclick: () => toggleFav() });
  const facesBtn = el('button', { class: 'icon-btn', title: 'Gesichter zeigen', onclick: () => { showFaces = !showFaces; drawFaces(); } }, '🙂');
  const infoBtn = el('button', { class: 'icon-btn', title: 'Infos (I)', onclick: () => { showInfo = !showInfo; drawInfo(); } }, 'ⓘ');
  const L = openLayer({
    className: 'viewer',
    buttons: [favBtn, facesBtn,
      el('button', { class: 'icon-btn', title: 'Sticker & Filter', onclick: () => FUN.studio.run(cur()) }, '🥸'),
      el('button', { class: 'icon-btn', title: 'Ausschneiden (oder lange aufs Bild drücken)', onclick: () => FUN.cutout.run(cur()) }, '✂️'),
      el('button', { class: 'icon-btn', title: 'Mosaik daraus machen', onclick: () => FUN.mosaic.run(cur()) }, '🧩'),
      el('button', { class: 'icon-btn', title: 'Teilen / Herunterladen', onclick: () => share() }, '⤴'),
      el('button', { class: 'icon-btn', title: 'Löschen', onclick: () => remove() }, '🗑'),
      infoBtn],
    onKey: (e) => {
      if (e.key === 'ArrowRight') nav(1);
      else if (e.key === 'ArrowLeft') nav(-1);
      else if (e.key === 'f') toggleFav();
      else if (e.key === 'i') { showInfo = !showInfo; drawInfo(); }
    },
    onClose: () => { if (origUrl) URL.revokeObjectURL(origUrl); },
  });
  const { layer, top, titleEl } = L;
  layer.append(stage);
  const close = () => L.close();
  const closeAndGo = (hash) => L.close(false, hash);

  const cur = () => list[i];

  async function show() {
    const p = cur();
    if (!p) return close();
    zoom = 1; panX = panY = 0; applyZoom();
    titleEl.textContent = fmtDate(p.date, true);
    favBtn.textContent = p.fav ? '♥' : '♡';
    favBtn.style.color = p.fav ? '#ff4d6d' : '';
    img.src = blobUrl(p.thumb);
    if (origUrl) URL.revokeObjectURL(origUrl);
    origUrl = null;
    const blob = await db.getBlob(p.id);
    if (cur() !== p || !blob) return;
    origUrl = URL.createObjectURL(blob);
    const hi = new Image();
    hi.src = origUrl;
    hi.decode().then(() => { if (cur() === p) img.src = origUrl; }).catch(() => {});
    drawFaces();
    if (showInfo) drawInfo();
    facesBtn.style.display = store.facesOf(p.id).length ? '' : 'none';
  }

  function drawFaces() {
    wrap.querySelectorAll('.facebox').forEach((n) => n.remove());
    facesBtn.classList.toggle('on', showFaces);
    if (!showFaces) return;
    for (const f of store.facesOf(cur().id)) {
      const [x, y, w, h] = f.box;
      const name = store.personName(f.personId);
      wrap.append(el('div', { class: 'facebox', style: `left:${x * 100}%;top:${y * 100}%;width:${w * 100}%;height:${h * 100}%` },
        el('span', { onclick: () => nameFace(f) }, name || '+ Name')));
    }
  }

  async function nameFace(f) {
    const names = store.peopleList().filter((p) => p.name).map((p) => p.name);
    const current = store.personName(f.personId);
    const name = await promptDialog('Wer ist das?', current, 'Name', names);
    if (!name || name === current) return;
    const person = store.people.get(f.personId);
    // Hat die Person noch keinen Namen, bekommt die ganze Gruppe den Namen – sonst nur dieses Gesicht
    if (person && !person.name) await renamePerson(person.id, name);
    else await moveFace(f.id, name);
    toast(`Gespeichert: ${name}`);
    drawFaces();
    if (showInfo) drawInfo();
  }

  let panel;
  function drawInfo() {
    panel?.remove();
    infoBtn.classList.toggle('on', showInfo);
    if (!showInfo) return;
    const p = cur();
    const faces = store.facesOf(p.id);
    const people = [...new Set(faces.map((f) => f.personId))].map((id) => store.people.get(id)).filter(Boolean);
    const similar = similarPhotos(p, 12);
    panel = el('div', { class: 'info-panel' },
      el('h3', {}, 'Details'),
      el('div', {}, fmtDate(p.date, true)),
      el('div', { class: 'muted', style: 'font-size:13px' }, `${p.name} · ${p.w}×${p.h} · ${fmtBytes(p.size)}`),
      p.camera && el('div', { class: 'muted', style: 'font-size:13px' }, '📷 ' + p.camera),
      p.gps && el('a', { href: `https://www.openstreetmap.org/?mlat=${p.gps[0]}&mlon=${p.gps[1]}#map=14/${p.gps[0]}/${p.gps[1]}`, target: '_blank', rel: 'noopener', style: 'font-size:13px' }, '📍 Auf der Karte zeigen'),
      el('h3', {}, 'Personen'),
      faces.length ? el('div', { class: 'chips', style: 'flex-wrap:wrap' }, people.map((pe) => {
        const f = faces.find((x) => x.personId === pe.id);
        return el('button', { class: 'chip', onclick: () => (pe.name ? closeAndGo(`#/person/${pe.id}`) : nameFace(f)) },
          el('img', { src: blobUrl(f.crop) }), pe.name || '+ Name');
      })) : el('div', { class: 'muted', style: 'font-size:13px' }, p.done.faces ? 'Keine Gesichter gefunden' : 'Wird noch analysiert …'),
      el('h3', {}, 'Erkannt'),
      p.tags.length ? el('div', { class: 'chips', style: 'flex-wrap:wrap' }, p.tags.map((t) => {
        const c = categoryById(t);
        return c && el('button', { class: 'chip', onclick: () => closeAndGo(`#/kategorie/${t}`) }, `${c[2]} ${c[1]}`);
      })) : el('div', { class: 'muted', style: 'font-size:13px' }, p.done.clip ? 'Keine eindeutige Kategorie' : 'Wird noch analysiert …'),
      similar.length > 0 && el('h3', {}, 'Ähnliche Fotos'),
      similar.length > 0 && el('div', { class: 'mini-grid' }, similar.map((s) => el('img', {
        src: blobUrl(s.thumb), onclick: () => { list = [p, ...similar]; i = list.indexOf(s); show(); },
      }))));
    layer.append(panel);
  }

  async function toggleFav() {
    const p = cur();
    p.fav = !p.fav;
    await store.updatePhoto(p);
    favBtn.textContent = p.fav ? '♥' : '♡';
    favBtn.style.color = p.fav ? '#ff4d6d' : '';
    if (p.fav) { favBtn.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.8)' }, { transform: 'scale(1)' }], 400); }
  }

  async function share() {
    const p = cur();
    const blob = await db.getBlob(p.id);
    shareBlob(blob, p.name);
  }

  async function remove() {
    const { deletePhotos, deleteQuestion } = await import('./app.js');
    if (!(await confirmDialog(deleteQuestion(1), 'Entfernen', true))) return;
    const p = cur();
    await deletePhotos([p]);
    list = list.filter((x) => x !== p);
    if (!list.length) return close();
    i = Math.min(i, list.length - 1);
    show();
  }

  function nav(d) {
    const n = i + d;
    if (n < 0 || n >= list.length) {
      slide.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${-d * 30}px)` }, { transform: 'translateX(0)' }], 250);
      return;
    }
    slide.animate([{ transform: `translateX(${d * 60}px)`, opacity: 0.3 }, { transform: 'translateX(0)', opacity: 1 }], { duration: 220, easing: 'ease-out' });
    i = n;
    show();
  }

  function applyZoom() {
    wrap.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  }

  // ---- Gesten: wischen, Doppeltipp-Zoom, Pinch, Mausrad ----
  const pts = new Map();
  let start = null, pinch = null, lastTap = 0, pressTimer;
  stage.addEventListener('pointerdown', (e) => {
    stage.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 1) {
      start = { x: e.clientX, y: e.clientY, panX, panY, t: Date.now() };
      // langes Drücken auf ein Ding → Ausschneiden
      clearTimeout(pressTimer);
      pressTimer = setTimeout(() => {
        const r = img.getBoundingClientRect();
        const x = (start?.x - r.left) / r.width, y = (start?.y - r.top) / r.height;
        if (!start || pts.size !== 1 || !(x >= 0 && x <= 1 && y >= 0 && y <= 1)) return;
        start = null;
        navigator.vibrate?.(30);
        slide.style.transform = '';
        FUN.cutout.run(cur(), [x, y]);
      }, 550);
    } else clearTimeout(pressTimer);
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), zoom };
    }
  });
  stage.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) clearTimeout(pressTimer);
    if (pinch && pts.size === 2) {
      const [a, b] = [...pts.values()];
      zoom = clamp(pinch.zoom * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d, 1, 6);
      applyZoom();
    } else if (start && zoom > 1) {
      panX = start.panX + e.clientX - start.x; panY = start.panY + e.clientY - start.y; applyZoom();
    } else if (start) {
      slide.style.transition = 'none';
      slide.style.transform = `translateX(${e.clientX - start.x}px)`;
    }
  });
  const end = (e) => {
    clearTimeout(pressTimer);
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (!start || pts.size) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    slide.style.transition = '';
    slide.style.transform = '';
    if (zoom === 1 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) nav(dx < 0 ? 1 : -1);
    else if (zoom === 1 && dy > 120 && Math.abs(dy) > Math.abs(dx)) close();
    else if (Math.abs(dx) < 8 && Math.abs(dy) < 8 && Date.now() - start.t < 300) {
      if (Date.now() - lastTap < 300) { zoom = zoom > 1 ? 1 : 2.5; panX = panY = 0; applyZoom(); lastTap = 0; } else {
        lastTap = Date.now();
        setTimeout(() => { if (lastTap && Date.now() - lastTap >= 290) { top.style.opacity = top.style.opacity === '0' ? '' : '0'; lastTap = 0; } }, 300);
      }
    }
    start = null;
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoom = clamp(zoom * (e.deltaY < 0 ? 1.15 : 0.87), 1, 6);
    if (zoom === 1) panX = panY = 0;
    applyZoom();
  }, { passive: false });

  show();
}
