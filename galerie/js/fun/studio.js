// Spaß-Studio: Sticker auf Gesichter (Wackelaugen, Partyhut, Schnurrbart …) und verrückte Filter
import { store } from '../store.js';
import { db } from '../db.js';
import { el, toast, download, canvasToBlob, scaledCanvas } from '../util.js';
import { openLayer } from '../layers.js';
import { pickPhoto, loadOriginal } from './common.js';
import { detectFaces } from '../faces.js';
import { importFiles } from '../importer.js';
import { listStickers } from './cutout.js';

export const studio = {
  name: 'Sticker-Studio',
  emoji: '🥸',
  desc: 'Wackelaugen, Partyhüte, Schnurrbärte & Filter',
  bg: 'linear-gradient(135deg,#f7971e,#ffd200)',
  async run(photo) {
    photo = photo || (await pickPhoto('Welches Foto verzieren?'));
    if (photo) openStudio(photo);
  },
};

const STICKERS = [
  ['googly', '👀', 'Wackelaugen'],
  ['party', '🥳', 'Partyhut'],
  ['crown', '👑', 'Krone'],
  ['glasses', '😎', 'Sonnenbrille'],
  ['mustache', '🥸', 'Schnurrbart'],
  ['clown', '🔴', 'Clownsnase'],
  ['hearts', '😍', 'Herzaugen'],
  ['bunny', '🐰', 'Hasenohren'],
];

const FILTERS = [
  ['none', 'Original', ''],
  ['bw', 'S/W', 'grayscale(1) contrast(1.15)'],
  ['vintage', 'Vintage', 'sepia(.6) contrast(1.1) brightness(1.05) saturate(.8)'],
  ['pop', 'Pop', 'saturate(2.2) contrast(1.2)'],
  ['cool', 'Kühl', 'hue-rotate(-15deg) saturate(1.2) brightness(1.05)'],
  ['dream', 'Traum', 'blur(1.5px) brightness(1.15) saturate(1.4)'],
  ['invert', 'Negativ', 'invert(1)'],
  ['pixel', 'Pixel', null],
  ['comic', 'Comic', null],
  ['glitch', 'Glitch', null],
  ['mirror', 'Spiegel', null],
  ['kaleido', 'Kaleidoskop', null],
];

async function openStudio(photo) {
  const canvas = el('canvas', { style: 'max-width:100%;max-height:100%;display:block;margin:auto' });
  const stage = el('div', { class: 'stage', style: 'display:grid;place-items:center;padding:60px 0 150px' }, canvas);
  const active = new Set();
  let filter = 'none';
  let pointer = [0.5, 0.5];
  let raf;
  const L = openLayer({ title: 'Sticker-Studio', onClose: () => cancelAnimationFrame(raf) });
  const msg = el('div', { style: 'width:100%;text-align:center;font-size:13px;color:#ddd' }, 'Lade …');
  const stickerRow = el('div', { class: 'filters' }, STICKERS.map(([id, emo, label]) =>
    el('button', { class: 'btn small', title: label, onclick: (e) => { active.has(id) ? active.delete(id) : active.add(id); e.currentTarget.classList.toggle('on', active.has(id)); } }, `${emo} ${label}`)));
  const filterRow = el('div', { class: 'filters' });
  const myRow = el('div', { class: 'filters' });
  const placed = []; // eigene Sticker: { bmp, x, y, s } (Mitte relativ 0..1, s = Breite relativ)
  let selected = null;
  L.layer.append(stage, el('div', { class: 'layer-bottom', style: 'flex-direction:column;align-items:stretch' },
    msg, stickerRow, myRow, filterRow,
    el('div', { class: 'row', style: 'justify-content:center' },
      el('button', { class: 'btn', onclick: async () => download(await canvasToBlob(render(false), 'image/jpeg', 0.92), `Spass-${photo.name.replace(/\.\w+$/, '')}.jpg`) }, '💾 Herunterladen'),
      el('button', { class: 'btn primary', onclick: saveToGallery }, '➕ In Galerie speichern'))));

  const src = scaledCanvas(await loadOriginal(photo), 1600);
  canvas.width = src.width; canvas.height = src.height;
  let faces = store.facesOf(photo.id);
  if (!photo.done.faces || !faces.length) {
    msg.textContent = 'Suche Gesichter …';
    try { faces = await detectFaces(photo); } catch { faces = []; }
  }
  msg.textContent = faces.length ? `${faces.length} Gesicht${faces.length > 1 ? 'er' : ''} gefunden – Sticker antippen!` : 'Keine Gesichter gefunden – probier Filter und eigene Sticker!';
  if (!faces.length) stickerRow.style.display = 'none';
  else { active.add('googly'); stickerRow.firstChild.classList.add('on'); }

  // Filter-Vorschaubilder
  const preview = scaledCanvas(src, 120);
  for (const [id, label] of FILTERS) {
    const c = el('canvas', { width: preview.width, height: preview.height });
    applyFilter(c.getContext('2d'), preview, id);
    const b = el('button', { class: id === 'none' ? 'on' : '', onclick: () => { filter = id; [...filterRow.children].forEach((x) => x.classList.toggle('on', x === b)); } },
      el('img', { src: c.toDataURL('image/jpeg', 0.7) }), label);
    filterRow.append(b);
  }

  // Wackelaugen folgen dem Finger / der Maus und dem Neigen des Handys
  // eigene Sticker (aus „Ausschneiden“): antippen = aufkleben, auf dem Bild ziehen = verschieben
  const mine = await listStickers();
  if (mine.length) {
    myRow.append(el('span', { style: 'align-self:center;font-size:12px;white-space:nowrap' }, 'Meine:'),
      ...mine.slice(0, 40).map((st) => el('button', {
        onclick: async () => {
          const bmp = await createImageBitmap(st.blob);
          selected = { bmp, x: 0.5, y: 0.5, s: 0.35 };
          placed.push(selected);
        },
      }, el('img', { src: URL.createObjectURL(st.blob), style: 'object-fit:contain;background:#fff2' }))),
      el('button', { class: 'btn small', onclick: () => { if (selected) selected.s *= 1.2; } }, '＋'),
      el('button', { class: 'btn small', onclick: () => { if (selected) selected.s /= 1.2; } }, '－'),
      el('button', { class: 'btn small', onclick: () => { const i = placed.indexOf(selected); if (i >= 0) placed.splice(i, 1); selected = placed[placed.length - 1] || null; } }, '🗑'));
  } else myRow.style.display = 'none';
  let dragSt = null;
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    const hit = [...placed].reverse().find((p) => {
      const w = p.s, h = p.s * (p.bmp.height / p.bmp.width) * (canvas.width / canvas.height);
      return Math.abs(px - p.x) < w / 2 && Math.abs(py - p.y) < h / 2;
    });
    if (hit) { selected = hit; dragSt = { p: hit, dx: px - hit.x, dy: py - hit.y }; canvas.setPointerCapture(e.pointerId); }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragSt) return;
    const r = canvas.getBoundingClientRect();
    dragSt.p.x = (e.clientX - r.left) / r.width - dragSt.dx;
    dragSt.p.y = (e.clientY - r.top) / r.height - dragSt.dy;
  });
  canvas.addEventListener('pointerup', () => { dragSt = null; });
  canvas.addEventListener('wheel', (e) => { if (selected) { e.preventDefault(); selected.s *= e.deltaY < 0 ? 1.1 : 0.9; } }, { passive: false });

  const onMove = (e) => { const r = canvas.getBoundingClientRect(); pointer = [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
  L.layer.addEventListener('pointermove', onMove);
  const onTilt = (e) => { if (e.gamma != null) pointer = [0.5 + e.gamma / 60, 0.5 + (e.beta - 40) / 60]; };
  window.addEventListener('deviceorientation', onTilt);
  const oldClose = L.close;
  L.close = (...a) => { window.removeEventListener('deviceorientation', onTilt); oldClose(...a); };

  const pupils = faces.map(() => [[0, 0, 0, 0], [0, 0, 0, 0]]); // x, y, vx, vy je Auge

  // gefiltertes Grundbild nur bei Filterwechsel neu berechnen
  const base = el('canvas', { width: src.width, height: src.height });
  let baseFilter = null;
  function render(live = true) {
    const ctx = canvas.getContext('2d');
    if (baseFilter !== filter) { applyFilter(base.getContext('2d'), src, filter); baseFilter = filter; }
    ctx.drawImage(base, 0, 0);
    const W = canvas.width, H = canvas.height;
    faces.forEach((f, fi) => {
      const P = (pt) => [pt[0] * W, pt[1] * H];
      const le = P(f.lm.le), re = P(f.lm.re), nose = P(f.lm.nose), mouth = P(f.lm.mouth), brow = P(f.lm.brow);
      const eyeD = Math.hypot(re[0] - le[0], re[1] - le[1]);
      const ang = Math.atan2(re[1] - le[1], re[0] - le[0]);
      const mid = [(le[0] + re[0]) / 2, (le[1] + re[1]) / 2];
      const emoji = (ch, x, y, size, rot = ang) => {
        ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ch, 0, 0); ctx.restore();
      };
      // Richtung "nach oben" senkrecht zur Augenlinie
      const up = [Math.sin(ang), -Math.cos(ang)];
      if (active.has('googly')) {
        [le, re].forEach((e, k) => {
          const r = eyeD * 0.36;
          ctx.save();
          ctx.beginPath(); ctx.arc(e[0], e[1], r, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
          ctx.lineWidth = Math.max(1.5, r * 0.08); ctx.strokeStyle = '#222'; ctx.stroke();
          // Pupille mit Feder-Physik: zieht zum Zeiger, schwingt nach
          const pu = pupils[fi][k];
          const tx = (pointer[0] * W - e[0]), ty = (pointer[1] * H - e[1]);
          const tl = Math.hypot(tx, ty) || 1;
          const goal = [tx / tl * r * 0.45, ty / tl * r * 0.45 + r * 0.1];
          pu[2] = (pu[2] + (goal[0] - pu[0]) * 0.15) * 0.82; pu[3] = (pu[3] + (goal[1] - pu[1]) * 0.15 + r * 0.01) * 0.82;
          pu[0] += pu[2]; pu[1] += pu[3];
          const len = Math.hypot(pu[0], pu[1]), maxL = r * 0.5;
          if (len > maxL) { pu[0] *= maxL / len; pu[1] *= maxL / len; }
          ctx.beginPath(); ctx.arc(e[0] + pu[0], e[1] + pu[1], r * 0.48, 0, Math.PI * 2); ctx.fillStyle = '#111'; ctx.fill();
          ctx.beginPath(); ctx.arc(e[0] + pu[0] - r * 0.15, e[1] + pu[1] - r * 0.15, r * 0.12, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
          ctx.restore();
        });
      }
      if (active.has('hearts')) [le, re].forEach((e) => emoji('❤️', e[0], e[1], eyeD * 0.75));
      if (active.has('glasses')) emoji('🕶️', mid[0], mid[1] + eyeD * 0.05, eyeD * 2.1);
      if (active.has('mustache')) {
        const mx = (nose[0] + mouth[0]) / 2, my = (nose[1] * 0.45 + mouth[1] * 0.55);
        ctx.save(); ctx.translate(mx, my); ctx.rotate(ang); ctx.scale(eyeD / 100, eyeD / 100);
        ctx.fillStyle = '#2b1a10';
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.bezierCurveTo(20, -22, 55, -12, 72, 4); ctx.bezierCurveTo(60, 0, 52, 14, 30, 10); ctx.bezierCurveTo(15, 8, 6, 4, 0, 4);
        ctx.bezierCurveTo(-6, 4, -15, 8, -30, 10); ctx.bezierCurveTo(-52, 14, -60, 0, -72, 4); ctx.bezierCurveTo(-55, -12, -20, -22, 0, -6);
        ctx.fill(); ctx.restore();
      }
      if (active.has('clown')) {
        ctx.beginPath(); ctx.arc(nose[0], nose[1] - eyeD * 0.05, eyeD * 0.28, 0, Math.PI * 2);
        const g = ctx.createRadialGradient(nose[0] - eyeD * 0.08, nose[1] - eyeD * 0.14, 1, nose[0], nose[1], eyeD * 0.28);
        g.addColorStop(0, '#ff8a80'); g.addColorStop(1, '#d50000'); ctx.fillStyle = g; ctx.fill();
      }
      const headTop = [brow[0] + up[0] * eyeD * 0.9, brow[1] + up[1] * eyeD * 0.9];
      if (active.has('party')) drawPartyHat(ctx, headTop, up, eyeD, ang);
      if (active.has('crown')) emoji('👑', headTop[0], headTop[1], eyeD * 1.9);
      if (active.has('bunny')) drawBunnyEars(ctx, headTop, up, eyeD, ang);
    });
    for (const p of placed) {
      const w = p.s * W, h = w * p.bmp.height / p.bmp.width;
      ctx.drawImage(p.bmp, p.x * W - w / 2, p.y * H - h / 2, w, h);
      if (live && p === selected && placed.length > 1) { ctx.strokeStyle = '#ffd36b'; ctx.setLineDash([8, 6]); ctx.lineWidth = 2; ctx.strokeRect(p.x * W - w / 2, p.y * H - h / 2, w, h); ctx.setLineDash([]); }
    }
    if (live) raf = requestAnimationFrame(() => render(true));
    return canvas;
  }

  async function saveToGallery() {
    const blob = await canvasToBlob(render(false), 'image/jpeg', 0.92);
    const name = `Spass-${photo.name.replace(/\.\w+$/, '')}-${Date.now() % 100000}.jpg`;
    await importFiles([new File([blob], name, { type: 'image/jpeg', lastModified: photo.date })]);
    const { startAnalysis } = await import('../analyzer.js');
    startAnalysis();
  }

  render(true);
}

function drawPartyHat(ctx, top, up, eyeD, ang) {
  const h = eyeD * 1.9, w = eyeD * 1.15;
  ctx.save(); ctx.translate(top[0], top[1]); ctx.rotate(ang - 0.25);
  const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  g.addColorStop(0, '#ff3d7f'); g.addColorStop(0.5, '#ffc24b'); g.addColorStop(1, '#7f5af0');
  ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(0, -h); ctx.lineTo(w / 2, 0); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
  // Punkte
  ctx.fillStyle = '#fff';
  for (const [x, y] of [[-0.15, -0.3], [0.12, -0.5], [-0.03, -0.72], [0.2, -0.18]]) { ctx.beginPath(); ctx.arc(x * w, y * h, eyeD * 0.06, 0, 7); ctx.fill(); }
  ctx.beginPath(); ctx.arc(0, -h, eyeD * 0.16, 0, 7); ctx.fillStyle = '#ffd200'; ctx.fill();
  ctx.restore();
}

function drawBunnyEars(ctx, top, up, eyeD, ang) {
  ctx.save(); ctx.translate(top[0], top[1]); ctx.rotate(ang);
  for (const s of [-1, 1]) {
    ctx.save(); ctx.translate(s * eyeD * 0.45, 0); ctx.rotate(s * 0.18);
    ctx.beginPath(); ctx.ellipse(0, -eyeD * 0.9, eyeD * 0.28, eyeD * 0.95, 0, 0, 7); ctx.fillStyle = '#f5f5f5'; ctx.fill();
    ctx.lineWidth = eyeD * 0.04; ctx.strokeStyle = '#bbb'; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -eyeD * 0.9, eyeD * 0.14, eyeD * 0.7, 0, 0, 7); ctx.fillStyle = '#f8bbd0'; ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/** Zeichnet src mit Filter in ctx (Canvas hat die Größe von src) */
function applyFilter(ctx, src, id) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const f = FILTERS.find((x) => x[0] === id);
  ctx.save();
  ctx.filter = 'none';
  if (f && f[2] != null) {
    ctx.filter = f[2] || 'none';
    ctx.drawImage(src, 0, 0, W, H);
    ctx.restore();
    return;
  }
  if (id === 'pixel') {
    const s = Math.max(8, Math.round(W / 48));
    const small = scaledCanvas(src, Math.max(src.width, src.height) / s);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, W, H);
  } else if (id === 'mirror') {
    ctx.drawImage(src, 0, 0, W / 2, H, 0, 0, W / 2, H);
    ctx.translate(W, 0); ctx.scale(-1, 1);
    ctx.drawImage(src, 0, 0, W / 2, H, 0, 0, W / 2, H);
  } else if (id === 'kaleido') {
    const half = el('canvas', { width: W / 2, height: H / 2 });
    half.getContext('2d').drawImage(src, W / 4, H / 4, W / 2, H / 2, 0, 0, W / 2, H / 2);
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(sx, sy); ctx.drawImage(half, 0, 0, W / 2, H / 2, -W / 2, -H / 2, W / 2, H / 2); ctx.restore();
    }
  } else if (id === 'comic' || id === 'glitch') {
    ctx.drawImage(src, 0, 0, W, H);
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    if (id === 'comic') {
      // Farben reduzieren + dunkle Kanten
      const out = new Uint8ClampedArray(d);
      const lum = (i) => d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const i = (y * W + x) * 4;
        const gx = lum(i + 4) - lum(i - 4), gy = lum(i + W * 4) - lum(i - W * 4);
        const edge = Math.hypot(gx, gy) > 38;
        for (let k = 0; k < 3; k++) out[i + k] = edge ? 20 : Math.min(255, Math.round(d[i + k] / 64) * 64 + 24);
      }
      img.data.set(out);
    } else {
      // RGB-Verschiebung + zufällige Streifen
      const out = new Uint8ClampedArray(d);
      const shift = Math.round(W / 80);
      for (let y = 0; y < H; y++) {
        const band = Math.sin(y / 9) > 0.97 ? Math.round((Math.random() - 0.5) * W / 10) : 0;
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 4;
          const xr = Math.min(W - 1, Math.max(0, x + shift + band)), xb = Math.min(W - 1, Math.max(0, x - shift + band));
          out[i] = d[(y * W + xr) * 4];
          out[i + 2] = d[(y * W + xb) * 4 + 2];
          out[i + 1] = d[(y * W + Math.min(W - 1, Math.max(0, x + band))) * 4 + 1];
        }
      }
      img.data.set(out);
    }
    ctx.putImageData(img, 0, 0);
  } else {
    ctx.drawImage(src, 0, 0, W, H);
  }
  ctx.restore();
}
