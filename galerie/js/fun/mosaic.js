// Foto-Mosaik: ein Bild wird aus vielen kleinen eigenen Fotos zusammengesetzt.
import { store } from '../store.js';
import { el, toast, download, canvasToBlob, shuffle, nextFrame } from '../util.js';
import { openLayer } from '../layers.js';
import { pickPhoto, loadOriginal } from './common.js';

export const mosaic = {
  name: 'Foto-Mosaik',
  emoji: '🧩',
  desc: 'Ein Bild aus hunderten deiner Fotos',
  bg: 'linear-gradient(135deg,#ff7a59,#ff3d7f)',
  async run(photo) {
    photo = photo || (await pickPhoto('Welches Foto soll zum Mosaik werden?'));
    if (!photo) return;
    if (store.photos.size < 2) return toast('Für ein Mosaik braucht es mehrere Fotos');
    openMosaic(photo);
  },
};

let tileCache = null; // { key, tiles: [{bmp, grid}] }

async function getTiles(onProgress) {
  const photos = shuffle([...store.photos.values()]).slice(0, 1500);
  const key = photos.length + ':' + store.photos.size;
  if (tileCache?.key === key) return tileCache.tiles;
  const tiles = [];
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    try {
      const bmp = await createImageBitmap(p.thumb);
      const side = Math.min(bmp.width, bmp.height);
      const sq = await createImageBitmap(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, { resizeWidth: 64, resizeHeight: 64, resizeQuality: 'medium' });
      bmp.close();
      tiles.push({ bmp: sq, grid: p.grid, uses: 0 });
    } catch { /* übersprungen */ }
    if (i % 20 === 0) { onProgress?.(i / photos.length); await nextFrame(); }
  }
  tileCache = { key, tiles };
  return tiles;
}

function openMosaic(photo) {
  const canvas = el('canvas');
  const wrapEl = el('div', { class: 'mosaic-wrap' }, canvas);
  const cols = el('input', { type: 'range', min: 20, max: 140, value: 60 });
  const blend = el('input', { type: 'range', min: 0, max: 70, value: 25 });
  const info = el('div', { class: 'muted', style: 'color:#ccc;font-size:13px;width:100%;text-align:center' }, '');
  const L = openLayer({
    title: 'Foto-Mosaik',
    buttons: [
      el('button', { class: 'icon-btn', title: 'Zoom', onclick: () => wrapEl.classList.toggle('zoom') }, '🔍'),
      el('button', { class: 'icon-btn', title: 'Anderes Foto', onclick: async () => { const p = await pickPhoto(); if (p) { photo = p; build(); } } }, '🖼️'),
    ],
  });
  L.layer.append(wrapEl, el('div', { class: 'layer-bottom' },
    info,
    el('label', { class: 'range', style: 'color:#ddd' }, 'Kacheln', cols),
    el('label', { class: 'range', style: 'color:#ddd' }, 'Original durchscheinen', blend),
    el('button', { class: 'btn primary', onclick: save }, '💾 Speichern')));

  let running = 0;
  async function build() {
    const job = ++running;
    info.textContent = 'Kacheln vorbereiten …';
    const [target, tiles] = await Promise.all([loadOriginal(photo), getTiles((f) => { info.textContent = `Kacheln vorbereiten … ${Math.round(f * 100)} %`; })]);
    if (job !== running) return;
    tiles.forEach((t) => { t.uses = 0; });
    const nx = +cols.value;
    const ny = Math.max(1, Math.round(nx * target.height / target.width));
    // Zielbild in 3x3 Farbfelder pro Kachel zerlegen
    const sample = el('canvas', { width: nx * 3, height: ny * 3 });
    const sctx = sample.getContext('2d', { willReadFrequently: true });
    sctx.drawImage(target, 0, 0, nx * 3, ny * 3);
    const px = sctx.getImageData(0, 0, nx * 3, ny * 3).data;
    const T = Math.max(12, Math.min(40, Math.floor(4200 / nx))); // Kachelgröße im Ergebnis
    canvas.width = nx * T; canvas.height = ny * T;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const cell = new Array(27);
    const penalty = 2000 * Math.max(1, (nx * ny) / tiles.length) ** -0.5;
    // Zufällige Reihenfolge, damit Wiederholungen gleichmäßig verteilt sind
    const order = shuffle([...Array(nx * ny).keys()]);
    let done = 0;
    for (const idx of order) {
      const cx = idx % nx, cy = (idx / nx) | 0;
      for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
        const o = (((cy * 3 + sy) * nx * 3) + cx * 3 + sx) * 4;
        const k = (sy * 3 + sx) * 3;
        cell[k] = px[o]; cell[k + 1] = px[o + 1]; cell[k + 2] = px[o + 2];
      }
      let best = null, bestD = Infinity;
      for (const t of tiles) {
        let d = t.uses * penalty;
        const g = t.grid;
        for (let k = 0; k < 27 && d < bestD; k++) { const v = g[k] - cell[k]; d += v * v; }
        if (d < bestD) { bestD = d; best = t; }
      }
      best.uses++;
      ctx.drawImage(best.bmp, cx * T, cy * T, T, T);
      if (++done % 400 === 0) { info.textContent = `Lege Kacheln … ${Math.round(done / order.length * 100)} %`; await nextFrame(); if (job !== running) return; }
    }
    // Original leicht darüberlegen, damit das Motiv gut erkennbar bleibt
    ctx.globalAlpha = +blend.value / 100;
    ctx.drawImage(target, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
    info.textContent = `${nx * ny} Kacheln aus ${tiles.length} Fotos · 🔍 zum Hineinzoomen`;
  }

  async function save() {
    const blob = await canvasToBlob(canvas, 'image/jpeg', 0.9);
    download(blob, `Mosaik-${photo.name.replace(/\.\w+$/, '')}.jpg`);
  }

  let t;
  [cols, blend].forEach((i) => i.addEventListener('input', () => { clearTimeout(t); t = setTimeout(build, 300); }));
  build();
}
