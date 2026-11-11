// Diashow mit Ken-Burns-Effekt (langsames Zoomen und Schwenken) und sanften Überblendungen
import { icon } from '../icons.js';
import { el, blobUrl, fmtDate } from '../util.js';
import { openLayer } from '../layers.js';
import { pickSource } from './common.js';
import { db } from '../db.js';
import { store } from '../store.js';

export const slideshow = {
  name: 'Kino-Diashow',
  emoji: '🎬',
  desc: 'Ken-Burns-Effekt, Überblendungen, Vollbild',
  bg: 'linear-gradient(135deg,#232526,#5b6d84)',
  async run(photos, { title } = {}) {
    photos = photos || (await pickSource('Welche Fotos zeigen?'));
    if (!photos?.length) return;
    openShow(photos, title);
  },
};

function openShow(photos, title) {
  let i = -1, paused = false, timer, secs = 5, fill = true;
  const imgs = [el('img'), el('img')];
  const caption = el('div', { class: 'caption' });
  const stage = el('div', { class: 'stage show' }, ...imgs, caption);
  const pauseBtn = el('button', { class: 'icon-btn', title: 'Pause (Leertaste)', onclick: () => togglePause() }, icon('pause'));
  const speedBtn = el('button', { class: 'icon-btn', title: 'Tempo', onclick: () => { secs = secs === 5 ? 3 : secs === 3 ? 8 : 5; speedBtn.textContent = secs + 's'; } }, '5s');
  const fillBtn = el('button', { class: 'icon-btn', title: 'Bildschirm füllen', onclick: () => { fill = !fill; imgs.forEach((im) => im.classList.toggle('cover', fill)); } }, icon('fit'));
  const urls = [];
  const L = openLayer({
    title: title || 'Diashow',
    buttons: [speedBtn, fillBtn, pauseBtn, el('button', { class: 'icon-btn', title: 'Vollbild', onclick: () => document.fullscreenElement ? document.exitFullscreen() : L.layer.requestFullscreen?.() }, icon('fullscreen'))],
    onClose: () => { clearTimeout(timer); urls.forEach((u) => URL.revokeObjectURL(u)); if (document.fullscreenElement) document.exitFullscreen(); },
    onKey: (e) => { if (e.key === ' ') { e.preventDefault(); togglePause(); } else if (e.key === 'ArrowRight') next(1); else if (e.key === 'ArrowLeft') next(-1); },
  });
  L.layer.append(stage);
  imgs.forEach((im) => im.classList.add('cover'));
  stage.addEventListener('click', (e) => { (e.clientX > innerWidth / 2 ? next(1) : next(-1)); });
  // Kopfleiste nach kurzer Zeit ausblenden
  let hideT;
  const showTop = () => { L.top.style.opacity = ''; clearTimeout(hideT); hideT = setTimeout(() => { L.top.style.opacity = '0'; }, 2500); };
  L.layer.addEventListener('pointermove', showTop);
  L.top.style.transition = 'opacity .5s';
  showTop();

  function togglePause() {
    paused = !paused;
    pauseBtn.replaceChildren(icon(paused ? 'play' : 'pause'));
    if (!paused) next(1);
    else clearTimeout(timer);
  }

  async function load(p) {
    const blob = await db.getBlob(p.id);
    const url = blob ? URL.createObjectURL(blob) : blobUrl(p.thumb);
    if (blob) urls.push(url);
    if (urls.length > 4) URL.revokeObjectURL(urls.shift());
    return url;
  }

  async function next(d) {
    clearTimeout(timer);
    i = (i + d + photos.length) % photos.length;
    const p = photos[i];
    const front = imgs[i % 2], back = imgs[(i + 1) % 2];
    front.src = await load(p);
    try { await front.decode(); } catch { /* weiter */ }
    // zufälliger Zoom/Schwenk
    const dir = Math.random() < 0.5 ? 1 : -1;
    const from = `scale(1.0) translate(${dir * 2}%, ${-dir * 1}%)`;
    const to = `scale(1.15) translate(${-dir * 2}%, ${dir * 2}%)`;
    front.animate([{ transform: from }, { transform: to }], { duration: (secs + 1.5) * 1000, easing: 'ease-in-out', fill: 'forwards' });
    front.classList.add('on');
    back.classList.remove('on');
    const names = [...new Set(store.facesOf(p.id).map((f) => store.personName(f.personId)).filter(Boolean))];
    caption.textContent = [fmtDate(p.date), names.join(', ')].filter(Boolean).join(' · ');
    caption.classList.remove('on');
    setTimeout(() => caption.classList.add('on'), 600);
    setTimeout(() => caption.classList.remove('on'), secs * 1000 - 600);
    if (!paused) timer = setTimeout(() => next(1), secs * 1000);
  }
  next(1);
}
