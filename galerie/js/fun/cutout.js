// Ausschneiden: lange auf etwas im Foto drücken → die KI markiert das Objekt → als Sticker speichern
import { db } from '../db.js';
import { el, toast, shareBlob, canvasToBlob, scaledCanvas, uid, blobUrl, modal, confirmDialog } from '../util.js';
import { openLayer } from '../layers.js';
import { pickPhoto, loadOriginal, confetti } from './common.js';
import { prepareImage, segmentAt, samState } from '../segment.js';

export const cutout = {
  name: 'Ausschneiden',
  emoji: '✂️',
  desc: 'Lange auf ein Ding drücken → als Sticker ausschneiden',
  bg: 'linear-gradient(135deg,#00b09b,#96c93d)',
  async run(photo, point) {
    photo = photo || (await pickPhoto('Aus welchem Foto ausschneiden?'));
    if (photo) openCutout(photo, point);
  },
};

export const stickers = {
  name: 'Meine Sticker',
  emoji: '🏷️',
  desc: 'Deine ausgeschnittenen Sticker teilen',
  bg: 'linear-gradient(135deg,#43cea2,#185a9d)',
  run: () => openStickerBook(),
};

export const listStickers = async () => (await db.getAll('stickers')).sort((a, b) => b.created - a.created);

async function openCutout(photo, firstPoint) {
  const MAX = 1024;
  const src = scaledCanvas(await loadOriginal(photo), MAX);
  const W = src.width, H = src.height;
  const view = el('canvas', { width: W, height: H, style: 'max-width:100%;max-height:100%;display:block;touch-action:none' });
  const stage = el('div', { class: 'stage', style: 'display:grid;place-items:center;padding:64px 8px 170px' }, view);
  const msg = el('div', { style: 'width:100%;text-align:center;font-size:14px;color:#eee' });
  let points = []; // [x, y, label]
  let masks = null, choice = 0, mode = 1, busy = false, raf;
  const minus = el('button', { class: 'btn small', onclick: () => { mode = mode === 1 ? 0 : 1; minus.classList.toggle('on', mode === 0); plus.classList.toggle('on', mode === 1); } }, '➖ Wegnehmen');
  const plus = el('button', { class: 'btn small on', onclick: () => { mode = 1; plus.classList.add('on'); minus.classList.remove('on'); } }, '➕ Dazunehmen');
  const sizeBtns = el('div', { class: 'row', style: 'justify-content:center' },
    el('button', { class: 'btn small', onclick: () => pick(-1) }, '◀ Kleiner'),
    el('button', { class: 'btn small', onclick: () => pick(1) }, 'Größer ▶'),
    el('button', { class: 'btn small', onclick: () => { points.pop(); points.length ? update() : (masks = null, draw()); } }, '↶ Zurück'));
  const saveBtn = el('button', { class: 'btn primary', disabled: true, onclick: () => save() }, '✂️ Als Sticker speichern');
  const L = openLayer({ title: '✂️ Ausschneiden', onClose: () => cancelAnimationFrame(raf) });
  L.layer.append(stage, el('div', { class: 'layer-bottom', style: 'flex-direction:column;align-items:stretch;gap:8px' },
    msg, el('div', { class: 'row', style: 'justify-content:center' }, plus, minus), sizeBtns, el('div', { class: 'row', style: 'justify-content:center' }, saveBtn)));

  const ctx = view.getContext('2d');
  const maskCanvas = el('canvas', { width: W, height: H });
  const t0 = performance.now();
  let outline = null;

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(src, 0, 0);
    if (masks) {
      // Hintergrund abdunkeln, Objekt leuchten lassen
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.drawImage(maskCanvas, 0, 0);
      ctx.restore();
      ctx.save();
      ctx.globalCompositeOperation = 'destination-over';
      ctx.drawImage(src, 0, 0);
      ctx.restore();
      // pulsierender Rand
      const k = (Math.sin((performance.now() - t0) / 250) + 1) / 2;
      ctx.save();
      ctx.shadowColor = `rgba(255,${150 + k * 100},80,1)`;
      ctx.shadowBlur = 8 + k * 10;
      ctx.globalAlpha = 0.9;
      if (outline) ctx.drawImage(outline, 0, 0);
      ctx.restore();
    }
    for (const [x, y, l] of points) {
      ctx.beginPath(); ctx.arc(x * W, y * H, 7, 0, 7);
      ctx.fillStyle = l ? '#43a047' : '#e53935'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
    }
    raf = requestAnimationFrame(draw);
  }

  function setMask() {
    const m = masks[choice];
    const id = new ImageData(W, H);
    for (let i = 0; i < m.mask.length; i++) { id.data[i * 4 + 3] = m.mask[i]; id.data[i * 4] = 255; }
    maskCanvas.getContext('2d').putImageData(id, 0, 0);
    outline = outlineOf(maskCanvas, 2, '#ffd36b');
    saveBtn.disabled = !m.area;
  }

  function pick(d) {
    if (!masks) return;
    choice = Math.max(0, Math.min(masks.length - 1, choice + d));
    setMask();
    msg.textContent = `Auswahl ${choice + 1} von ${masks.length}`;
  }

  async function update() {
    if (busy) return;
    busy = true;
    msg.textContent = 'Markiere …';
    try {
      const r = await segmentAt(points);
      if (r.w !== W || r.h !== H) throw new Error('Größe passt nicht');
      masks = r.masks;
      // Standard: der größte Vorschlag mit guter Bewertung (meist das ganze Objekt)
      const best = Math.max(...masks.map((m) => m.score));
      choice = masks.length - 1;
      while (choice > 0 && masks[choice].score < best - 0.12) choice--;
      setMask();
      msg.textContent = 'Passt? Sonst Größer/Kleiner oder weitere Stellen antippen.';
    } catch (e) {
      msg.textContent = 'Fehler: ' + e.message;
    }
    busy = false;
  }

  view.addEventListener('pointerup', (e) => {
    if (!ready || busy) return;
    const r = view.getBoundingClientRect();
    points.push([(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, mode]);
    update();
  });

  async function save() {
    const sticker = makeSticker(src, maskCanvas);
    if (!sticker) return toast('Nichts markiert');
    const blob = await canvasToBlob(sticker, 'image/png');
    const rec = { id: uid(), blob, created: Date.now(), w: sticker.width, h: sticker.height, from: photo.id };
    await db.put('stickers', rec);
    confetti(1200);
    const choiceAfter = await modal({
      title: 'Sticker gespeichert! 🎉',
      body: el('div', { style: 'display:grid;place-items:center;padding:10px;background:repeating-conic-gradient(#8883 0 25%,transparent 0 50%) 50%/20px 20px;border-radius:12px' },
        el('img', { src: blobUrl(blob), style: 'max-width:100%;max-height:40vh' })),
      actions: [
        { label: 'Teilen', value: 'share' },
        { label: 'Weiter ausschneiden', value: 'again' },
        { label: 'Fertig', primary: true, value: 'done' },
      ],
    });
    if (choiceAfter === 'share') shareSticker(rec);
    if (choiceAfter === 'done') L.close();
    if (choiceAfter === 'again') { points = []; masks = null; saveBtn.disabled = true; msg.textContent = 'Tippe auf das nächste Ding.'; }
  }

  // Start: Bild für die KI vorbereiten
  let ready = false;
  draw();
  samState.onProgress = (p) => { msg.textContent = `Lade Ausschneide-KI (einmalig) … ${Math.round(p * 100)} %`; };
  msg.textContent = 'Analysiere das Bild …';
  try {
    await prepareImage(await canvasToBlob(src, 'image/jpeg', 0.92), photo.id);
  } catch (e) {
    msg.textContent = 'Die Ausschneide-KI konnte nicht geladen werden: ' + e.message;
    return;
  }
  samState.onProgress = null;
  ready = true;
  if (firstPoint) { points.push([firstPoint[0], firstPoint[1], 1]); update(); } else msg.textContent = 'Tippe auf das Ding, das du ausschneiden willst.';
}

/** Weißer Umriss einer Maske (für Leuchtrand und Sticker-Rand) */
function outlineOf(mask, r, color) {
  const c = el('canvas', { width: mask.width, height: mask.height });
  const x = c.getContext('2d');
  for (let a = 0; a < 16; a++) x.drawImage(mask, Math.cos(a / 16 * Math.PI * 2) * r, Math.sin(a / 16 * Math.PI * 2) * r);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  x.globalCompositeOperation = 'destination-out';
  x.drawImage(mask, 0, 0);
  return c;
}

/** Ausschnitt + weißer Sticker-Rand + Schatten, zugeschnitten auf das Objekt */
function makeSticker(src, maskCanvas) {
  const W = src.width, H = src.height;
  const md = maskCanvas.getContext('2d').getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (md[(y * W + x) * 4 + 3] > 127) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return null;
  const border = Math.max(4, Math.round(Math.max(x1 - x0, y1 - y0) * 0.025));
  const pad = border * 3;
  const cw = x1 - x0 + 1 + pad * 2, ch = y1 - y0 + 1 + pad * 2;
  // weiche Kanten
  const soft = el('canvas', { width: W, height: H });
  const sx = soft.getContext('2d');
  sx.filter = 'blur(1px)';
  sx.drawImage(maskCanvas, 0, 0);
  // Objekt
  const obj = el('canvas', { width: W, height: H });
  const ox = obj.getContext('2d');
  ox.drawImage(soft, 0, 0);
  ox.globalCompositeOperation = 'source-in';
  ox.drawImage(src, 0, 0);
  const out = el('canvas', { width: cw, height: ch });
  const c = out.getContext('2d');
  c.translate(pad - x0, pad - y0);
  c.save();
  c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = border * 2; c.shadowOffsetY = border * 0.6;
  // Rand: Maske in alle Richtungen verschoben, weiß eingefärbt
  const rim = el('canvas', { width: W, height: H });
  const rx = rim.getContext('2d');
  for (let a = 0; a < 24; a++) rx.drawImage(soft, Math.cos(a / 24 * Math.PI * 2) * border, Math.sin(a / 24 * Math.PI * 2) * border);
  rx.drawImage(soft, 0, 0);
  rx.globalCompositeOperation = 'source-in';
  rx.fillStyle = '#fff';
  rx.fillRect(0, 0, W, H);
  c.drawImage(rim, 0, 0);
  c.restore();
  c.drawImage(obj, 0, 0);
  return out;
}

function shareSticker(rec) {
  return shareBlob(rec.blob, `sticker-${rec.id}.png`);
}

async function openStickerBook() {
  const list = await listStickers();
  const L = openLayer({ title: '🏷️ Meine Sticker' });
  const grid = el('div', { class: 'laugh', style: 'grid-template-columns:repeat(auto-fill,minmax(120px,1fr))' });
  const game = el('div', { class: 'game', style: 'justify-content:flex-start' },
    el('p', { style: 'color:#ccc;text-align:center;max-width:460px' }, 'Tipp: Im Foto-Betrachter lange auf etwas drücken, um neue Sticker auszuschneiden. Im Sticker-Studio kannst du sie auf andere Fotos kleben.'),
    grid);
  L.layer.append(game);
  const render = (items) => grid.replaceChildren(...(items.length ? items.map((s) => el('figure', {
    style: 'background:repeating-conic-gradient(#fff1 0 25%,transparent 0 50%) 50%/16px 16px;border-radius:12px;padding:8px',
    onclick: async () => {
      const a = await modal({
        body: el('img', { src: blobUrl(s.blob), style: 'max-width:100%;max-height:50vh;display:block;margin:auto' }),
        actions: [{ label: '🗑 Löschen', danger: true, value: 'del' }, { label: 'Teilen', primary: true, value: 'share' }, { label: 'Schließen', value: null }],
      });
      if (a === 'share') shareSticker(s);
      if (a === 'del' && await confirmDialog('Sticker löschen?', 'Löschen', true)) { await db.del('stickers', s.id); render(await listStickers()); }
    },
  }, el('img', { src: blobUrl(s.blob), style: 'border-radius:0;object-fit:contain;aspect-ratio:1' }))) : [el('p', {}, 'Noch keine Sticker. Öffne ein Foto und drücke lange auf ein Ding!')]));
  render(list);
}
