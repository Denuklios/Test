// Galerie der Aufnahmen: Raster, Betrachter (Foto, Video, Panorama, 360°), Teilen, Speichern, Löschen
import { listItems, deleteItem, saveToPhone, share } from './store.js';
import { icon } from './icons.js';
import { Viewer360 } from './viewer360.js';
import { openEditor } from './editor.js';
import { pauseCamera, resumeCamera, toast } from './app.js';

const $ = (s) => document.querySelector(s);
const LABEL = { video: 'Video', slowmo: 'Zeitlupe', timelapse: 'Zeitraffer', pano: 'Panorama', pano360: '360°', sphere: 'Kugel 360°' };
let urls = [];
const freeUrls = () => { urls.forEach((u) => URL.revokeObjectURL(u)); urls = []; };
const url = (b) => { const u = URL.createObjectURL(b); urls.push(u); return u; };

let galleryOpts = {};
export async function openGallery(opts = {}) {
  galleryOpts = opts;
  pauseCamera();
  const g = $('#gallery');
  g.hidden = false;
  g.innerHTML = `<div class="bar-top"><button class="tb" data-a="back">${icon('back')}</button><h2>Aufnahmen</h2></div><div class="ggrid"></div>`;
  g.querySelector('[data-a=back]').onclick = closeGallery;
  await renderGrid();
}
async function renderGrid() {
  freeUrls();
  const grid = $('#gallery .ggrid');
  const items = await listItems();
  if (!items.length) { grid.innerHTML = '<p class="empty">Noch keine Aufnahmen.<br>Alles, was du hier fotografierst oder filmst, erscheint hier – und zusätzlich in deiner Handy-Galerie unter „Kamera Pro“.</p>'; return; }
  grid.innerHTML = items.map((it, i) => `<button class="gcell" data-i="${i}">${it.thumb ? `<img src="${url(it.thumb)}" alt="">` : ''}${LABEL[it.type] ? `<b>${LABEL[it.type]}</b>` : ''}</button>`).join('');
  grid.querySelectorAll('.gcell').forEach((c) => c.onclick = () => openViewer(items[+c.dataset.i], { list: items, index: +c.dataset.i, fromGallery: true }));
}
function closeGallery() {
  freeUrls();
  $('#gallery').hidden = true;
  galleryOpts.onClose?.();
  resumeCamera();
}

let v360 = null;
export async function openViewer(item, opts = {}) {
  if (!opts.fromGallery) pauseCamera();
  const v = $('#viewer');
  v.hidden = false;
  const is360 = item.type === 'sphere' || item.type === 'pano360';
  const isVideo = item.blob.type.startsWith('video');
  const d = new Date(item.date);
  v.innerHTML = `<div class="bar-top"><button class="tb" data-a="back">${icon('back')}</button>
      <h2>${LABEL[item.type] || 'Foto'}<small style="display:block;font-size:12px;color:var(--muted)">${d.toLocaleDateString('de-DE')} ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</small></h2>
      ${is360 ? `<button class="tb" data-a="gyro" title="Mit dem Handy umsehen">${icon('gyro')}</button>` : ''}</div>
    <div class="vstage${item.type === 'pano' ? ' panoscroll' : ''}"></div>
    <div class="bar-bottom">
      ${!isVideo ? `<button data-a="edit">${icon('edit')}Bearbeiten</button>` : ''}
      <button data-a="share">${icon('share')}Teilen</button>
      <button data-a="save">${icon('download')}Speichern</button>
      <button data-a="del">${icon('trash')}Löschen</button>
    </div>`;
  const stage = v.querySelector('.vstage');
  const src = URL.createObjectURL(item.blob);
  if (is360) {
    const c = document.createElement('canvas'); c.className = 'v360'; stage.appendChild(c);
    v360 = new Viewer360(c);
    await v360.load(item.blob, { vfov: item.type === 'pano360' ? Math.min(180, item.meta?.vfov || 70) : 180 });
    stage.insertAdjacentHTML('beforeend', '<div class="vinfo">Wischen zum Umsehen · zwei Finger zum Zoomen</div>');
  } else if (isVideo) {
    const vid = document.createElement('video');
    vid.src = src; vid.controls = true; vid.loop = true; vid.playsInline = true; vid.autoplay = true;
    stage.appendChild(vid);
    if (item.meta?.slowmo) stage.insertAdjacentHTML('beforeend', `<div class="vinfo">Zeitlupe ${item.meta.slowmo}× · aufgenommen mit ${Math.round(item.meta.fps || 30)} Bildern/s</div>`);
    if (item.meta?.timelapse) stage.insertAdjacentHTML('beforeend', `<div class="vinfo">Zeitraffer · alle ${item.meta.timelapse} s ein Bild</div>`);
  } else {
    const img = new Image(); img.src = src; stage.appendChild(img);
    if (item.type !== 'pano') pinchZoom(stage, img);
  }
  const close = () => {
    v360?.stop(); v360 = null;
    URL.revokeObjectURL(src);
    v.hidden = true; v.innerHTML = '';
    if (opts.fromGallery) renderGrid(); else { opts.onClose?.(); resumeCamera(); }
  };
  v.querySelector('[data-a=back]').onclick = close;
  v.querySelectorAll('[data-a]').forEach((b) => {
    const a = b.dataset.a;
    if (a === 'back') return;
    b.onclick = async () => {
      if (a === 'gyro') { v360.setGyro(!v360.useGyro); b.classList.toggle('on', v360.useGyro); toast(v360.useGyro ? 'Handy bewegen zum Umsehen' : 'Gyro aus'); }
      if (a === 'share') share(item.blob, item.name).catch((e) => toast(e.message));
      if (a === 'save') { await saveToPhone(item.blob, item.name).then(() => toast('In der Handy-Galerie gespeichert')).catch((e) => toast(e.message)); }
      if (a === 'del') {
        if (!confirm('Diese Aufnahme aus der App löschen?\n(Die Kopie in der Handy-Galerie bleibt erhalten.)')) return;
        await deleteItem(item.id); close();
      }
      if (a === 'edit') {
        v.hidden = true;
        openEditor(item, { onClose: (saved) => { if (saved) { close(); } else v.hidden = false; } });
      }
    };
  });
}

function pinchZoom(stage, img) {
  let s = 1, x = 0, y = 0;
  const pts = new Map(); let start = null;
  const apply = () => { img.style.transform = `translate(${x}px,${y}px) scale(${s})`; };
  stage.addEventListener('pointerdown', (e) => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); start = { s, x, y, pts: new Map([...pts].map(([k, v]) => [k, { ...v }])) }; });
  stage.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId) || !start) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const a = [...pts.values()], b = [...start.pts.values()];
    if (a.length === 2 && b.length === 2) {
      s = Math.max(1, Math.min(8, start.s * Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) / Math.hypot(b[0].x - b[1].x, b[0].y - b[1].y)));
    } else if (a.length === 1 && b.length >= 1 && s > 1) {
      x = start.x + a[0].x - b[0].x; y = start.y + a[0].y - b[0].y;
    }
    apply();
  });
  const up = (e) => { pts.delete(e.pointerId); start = { s, x, y, pts: new Map([...pts].map(([k, v]) => [k, { ...v }])) }; if (s <= 1.01) { s = 1; x = 0; y = 0; apply(); } };
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
  stage.addEventListener('dblclick', () => { s = s > 1 ? 1 : 2.5; x = 0; y = 0; apply(); });
}
