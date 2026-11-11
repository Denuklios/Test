// 3D-Foto-Karussell: Ring, Helix oder Kugel – mit Finger/Maus drehen
import { icon } from '../icons.js';
import { el, blobUrl } from '../util.js';
import { openLayer } from '../layers.js';
import { pickSource } from './common.js';
import { openViewer } from '../viewer.js';

export const carousel = {
  name: '3D-Karussell',
  emoji: '🎠',
  desc: 'Fotos als drehbarer Ring, Spirale oder Kugel',
  bg: 'linear-gradient(135deg,#7f5af0,#2cb1bc)',
  async run(photos) {
    photos = photos || (await pickSource('Welche Fotos ins Karussell?'));
    if (!photos?.length) return;
    openCarousel(photos);
  },
};

function openCarousel(all) {
  const MAX = { ring: 18, helix: 40, kugel: 60 };
  let mode = 'ring';
  let rotY = 0, rotX = -8, vel = 0.15, auto = true;
  const ring = el('div', { class: 'ring' });
  const stage = el('div', { class: 'stage carousel-stage' }, ring);
  const modeBtns = {};
  const L = openLayer({ title: `${all.length} Fotos`, onClose: () => cancelAnimationFrame(raf) });
  const bottom = el('div', { class: 'layer-bottom' },
    ...['ring', 'helix', 'kugel'].map((m) => (modeBtns[m] = el('button', { class: 'btn', onclick: () => setMode(m) },
      icon({ ring: 'ring', helix: 'spiral', kugel: 'globe' }[m]), { ring: 'Ring', helix: 'Spirale', kugel: 'Kugel' }[m]))),
    el('button', { class: 'btn', onclick: (e) => { auto = !auto; e.currentTarget.classList.toggle('on', !auto); } }, icon('pause'), 'Anhalten'));
  L.layer.append(stage, bottom);

  let cards = [];
  function setMode(m) {
    mode = m;
    Object.entries(modeBtns).forEach(([k, b]) => b.classList.toggle('on', k === m));
    const photos = all.slice(0, MAX[m]);
    if (cards.length !== photos.length) {
      ring.replaceChildren(...photos.map((p, i) => el('div', { class: 'card', 'data-i': i }, el('img', { src: blobUrl(p.thumb), alt: '', draggable: false }))));
      cards = [...ring.children];
    }
    const n = cards.length;
    const w = ring.offsetWidth || 200;
    cards.forEach((c, i) => {
      let t;
      if (m === 'ring') {
        const r = Math.max(w * 0.9, (w * 1.15 * n) / (2 * Math.PI));
        t = `rotateY(${(i * 360) / n}deg) translateZ(${r}px)`;
      } else if (m === 'helix') {
        const per = 12;
        const r = (w * 1.15 * per) / (2 * Math.PI);
        t = `translateY(${(i - n / 2) * w * 0.14}px) rotateY(${(i * 360) / per}deg) translateZ(${r}px)`;
      } else {
        // Fibonacci-Kugel: gleichmäßig verteilte Punkte
        const y = 1 - (i / (n - 1 || 1)) * 2;
        const lat = Math.asin(y) * 180 / Math.PI;
        const lon = (i * 137.508) % 360;
        const r = w * Math.max(1.2, Math.sqrt(n) * 0.38);
        t = `rotateY(${lon}deg) rotateX(${lat}deg) translateZ(${r}px) scale(.55)`;
      }
      c.style.transform = t;
    });
    ring.dataset.mode = m;
  }

  // Drehen mit Finger/Maus inkl. Schwung
  let drag = null;
  stage.addEventListener('pointerdown', (e) => {
    stage.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, rotY, rotX, lx: e.clientX, t: performance.now(), moved: false, target: e.target.closest('.card') };
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
    rotY = drag.rotY + dx * 0.3;
    rotX = Math.max(-60, Math.min(60, drag.rotX - dy * 0.2));
    const now = performance.now();
    vel = (e.clientX - drag.lx) * 0.3 / Math.max(1, (now - drag.t) / 16);
    drag.lx = e.clientX; drag.t = now;
  });
  stage.addEventListener('pointerup', (e) => {
    // Durch die 3D-Ebene liefert target oft die Bühne – daher Element unter dem Finger bestimmen
    if (drag && !drag.moved) {
      const card = document.elementFromPoint(e.clientX, e.clientY)?.closest('.card');
      if (card) openViewer(all, +card.dataset.i);
    }
    drag = null;
  });
  stage.addEventListener('wheel', (e) => { e.preventDefault(); vel += e.deltaY * 0.02; }, { passive: false });

  let raf;
  const tick = () => {
    if (!drag) {
      rotY += vel;
      vel *= 0.95;
      if (auto && Math.abs(vel) < 0.15) vel = 0.15 * Math.sign(vel || 1);
    }
    ring.style.transform = `translateZ(-${mode === 'kugel' ? 450 : 520}px) rotateX(${rotX}deg) rotateY(${rotY}deg)`;
    raf = requestAnimationFrame(tick);
  };
  requestAnimationFrame(() => { setMode('ring'); tick(); });
}
