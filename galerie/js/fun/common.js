// Gemeinsame Bausteine für die Spaß-Funktionen
import { store } from '../store.js';
import { el, blobUrl, modal, shuffle, decodeImage } from '../util.js';
import { db } from '../db.js';

/** Dialog: ein Foto auswählen (oder Zufall) */
export function pickPhoto(title = 'Foto auswählen', filter = () => true) {
  const list = store.sorted().filter(filter);
  const favs = list.filter((p) => p.fav);
  const shown = [...favs, ...list.filter((p) => !p.fav)].slice(0, 300);
  return modal({
    title, wide: true,
    body: el('div', { class: 'pick-grid' }, shown.map((p) => el('img', {
      src: blobUrl(p.thumb), loading: 'lazy', title: p.name, onclick: (e) => e.target.closest('dialog')._close(p),
    }))),
    actions: [
      { label: 'Abbrechen', value: () => null },
      { label: '🎲 Zufall', primary: true, value: () => shuffle(list)[0] || null },
    ],
  });
}

/** Dialog: welche Fotos? (Alle, Favoriten, Person …) */
export async function pickSource(title = 'Welche Fotos?') {
  const all = store.sorted();
  const options = [{ label: `🎲 Zufällig aus allen (${all.length})`, photos: () => shuffle(all) }];
  const favs = all.filter((p) => p.fav);
  if (favs.length) options.push({ label: `♥ Favoriten (${favs.length})`, photos: () => shuffle(favs) });
  for (const p of store.peopleList().filter((x) => x.name).slice(0, 10)) {
    const ps = store.photosOfPerson(p.id);
    options.push({ label: `🙂 ${p.name} (${ps.length})`, photos: () => shuffle(ps) });
  }
  const years = [...new Set(all.map((p) => new Date(p.date).getFullYear()))].sort((a, b) => b - a).slice(0, 6);
  if (years.length > 1) for (const y of years) {
    const ps = all.filter((p) => new Date(p.date).getFullYear() === y);
    options.push({ label: `📅 ${y} (${ps.length})`, photos: () => ps.slice().reverse() });
  }
  if (options.length === 1) return options[0].photos();
  const pick = await modal({
    title,
    body: el('div', { style: 'display:flex;flex-direction:column;gap:8px' }, options.map((o) =>
      el('button', { class: 'btn', style: 'justify-content:flex-start', onclick: (e) => e.target.closest('dialog')._close(o) }, o.label))),
    actions: [{ label: 'Abbrechen', value: () => null }],
  });
  return pick ? pick.photos() : null;
}

/** Originalbild laden (für Mosaik, Puzzle, Studio) */
export async function loadOriginal(photo) {
  const blob = await db.getBlob(photo.id);
  return decodeImage(blob || photo.thumb);
}

/** Konfetti-Regen 🎉 */
export function confetti(ms = 2500) {
  const c = el('canvas', { class: 'confetti' });
  document.body.append(c);
  const W = (c.width = innerWidth), H = (c.height = innerHeight);
  const ctx = c.getContext('2d');
  const colors = ['#ff7a59', '#ffc24b', '#43a047', '#1e88e5', '#ec407a', '#8e24aa'];
  const parts = Array.from({ length: 160 }, () => ({
    x: Math.random() * W, y: -20 - Math.random() * H * 0.5, vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 4,
    r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3, s: 6 + Math.random() * 6, c: colors[(Math.random() * colors.length) | 0],
  }));
  const t0 = performance.now();
  (function frame(t) {
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
    }
    if (t - t0 < ms) requestAnimationFrame(frame); else c.remove();
  })(t0);
}
