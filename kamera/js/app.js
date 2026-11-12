// Kamera Pro – Hauptsteuerung
import { Renderer, renderToCanvas, EFFECTS, DEFAULT_ADJUST } from './gl.js';
import { Camera } from './camera.js';
import { Probe, autoStats, smoothAuto, PointTracker, estimateShift } from './motion.js';
import { LiveRecorder, FrameEncoder, canEncodeFrames, encodeFallback } from './recorder.js';
import { PanoCapture } from './pano.js';
import { planTargets, project, angleBetween, stitchSphere, addPanoXmp, vfovFrom } from './sphere.js';
import { orientation } from './orientation.js';
import { addItem, listItems, saveToPhone, fileName, makeThumb, videoThumb, settings } from './store.js';
import { icon } from './icons.js';
import { openGallery, openViewer } from './gallery.js';
import { QrScanner, showQrResult } from './qr.js';

const $ = (s) => document.querySelector(s);
const video = document.createElement('video');
const viewCanvas = $('#view');
const overlay = $('#overlay');
const octx = overlay.getContext('2d');
let renderer;
try { renderer = new Renderer(viewCanvas); } catch (e) { alert('Grafik (WebGL) nicht verfügbar: ' + e.message); }
const cam = new Camera(video);
const probeSmall = new Probe(160);
const probeTrack = new Probe(320);
const tracker = new PointTracker();

export const MODES = [
  { id: 'timelapse', name: 'Zeitraffer', kind: 'video' },
  { id: 'slowmo', name: 'Zeitlupe', kind: 'video' },
  { id: 'video', name: 'Video', kind: 'video' },
  { id: 'photo', name: 'Foto', kind: 'photo' },
  { id: 'pro', name: 'Profi', kind: 'photo' },
  { id: 'pano', name: 'Panorama', kind: 'pano' },
  { id: 'pano360', name: '360°', kind: 'pano' },
  { id: 'sphere', name: 'Kugel 360°', kind: 'sphere' },
  { id: 'qr', name: 'QR-Code', kind: 'qr' },
];

const PRO_KEYS = ['exposure', 'contrast', 'saturation', 'temp', 'tint', 'highlights', 'shadows', 'clarity', 'sharpen', 'vignette'];
const S = {
  mode: settings.get('mode', 'photo'),
  effect: 0,
  fxParams: settings.get('fxParams', {}),
  beauty: settings.get('beauty', { smooth: 0, skinLight: 0, eyes: 0 }),
  pro: settings.get('pro', Object.fromEntries(PRO_KEYS.map((k) => [k, 0]))),
  autoLook: settings.get('autoLook', true),
  proAuto: false,
  auto: null,
  flash: 'off',
  timer: 0,
  ratio: settings.get('ratio', '4:3'),
  zoom: 1,
  lock: { want: false, active: false, cx: 0.5, cy: 0.5, zoom: settings.get('lockZoom', 1.4) },
  rot: 0,
  rec: null,
  panel: null,
  busy: false,
  peaking: false, zebra: false, histo: false,
  slowFactor: settings.get('slowFactor', 4),
  tlInterval: settings.get('tlInterval', 1),
  sphereQuality: settings.get('sphereQuality', 'normal'),
};
const modeDef = () => MODES.find((m) => m.id === S.mode) || MODES[3];

/* ---------- Hilfen ---------- */
let toastT;
export function toast(msg, ms = 2200) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.hidden = true; }, ms);
}
export function busy(msg, progress) {
  const b = $('#busy');
  if (msg === false) { b.hidden = true; return; }
  b.hidden = false;
  if (msg != null) b.querySelector('p').textContent = msg;
  b.querySelector('.bar').hidden = progress == null;
  if (progress != null) b.querySelector('.bar div').style.width = `${Math.round(progress * 100)}%`;
}
const hint = (msg) => { const h = $('#hint'); h.hidden = !msg; if (msg) h.textContent = msg; };
const vibrate = (ms = 20) => { try { navigator.vibrate?.(ms); } catch { /* egal */ } };
let audioCtx;
function click() {
  if (!settings.get('sound', true)) return;
  try {
    audioCtx = audioCtx || new AudioContext();
    const n = audioCtx.sampleRate * 0.06, b = audioCtx.createBuffer(1, n, audioCtx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3) * 0.5;
    const s = audioCtx.createBufferSource(); s.buffer = b; s.connect(audioCtx.destination); s.start();
  } catch { /* egal */ }
}
function flashFx() {
  const f = $('#flashfx');
  f.classList.add('on');
  requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('on')));
}
const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/* ---------- Kamera öffnen ---------- */
function streamSpec() {
  const res = settings.get('videoRes', '1080');
  switch (S.mode) {
    case 'video': return res === '4k' ? { w: 3840, h: 2160 } : res === '720' ? { w: 1280, h: 720 } : { w: 1920, h: 1080 };
    case 'slowmo': return { w: 1280, h: 720, maxFps: 240 };
    case 'timelapse': return { w: 1920, h: 1080 };
    case 'qr': return { w: 1280, h: 960 };
    case 'photo': case 'pro': return settings.get('photoHi', true) ? { w: 2560, h: 1920 } : { w: 1920, h: 1440 };
    default: return { w: 1920, h: 1440 };
  }
}

let opening = null;
async function openCamera() {
  const spec = streamSpec();
  const forceBack = ['pano', 'pano360', 'sphere'].includes(S.mode);
  const facing = forceBack ? 'environment' : (settings.get('facing', 'environment'));
  const sameDevice = forceBack ? null : (facing === 'environment' ? settings.get('backDevice', null) : null);
  opening = (async () => {
    try {
      await cam.open({ ...spec, facing, deviceId: sameDevice || undefined });
    } catch (e) {
      if (sameDevice) { settings.set('backDevice', null); await cam.open({ ...spec, facing }); } else throw e;
    }
    S.zoom = 1;
    if (cam.has('zoom')) S.zoom = cam.settings.zoom || 1;
    await cam.allAuto();
    if (S.mode === 'pro') applyProHardware();
    buildZoom();
  })();
  try {
    await opening;
  } catch (e) {
    hint(e.name === 'NotAllowedError' ? 'Bitte den Kamera-Zugriff erlauben (Android-Einstellungen → Apps → Kamera Pro → Berechtigungen).' : 'Kamera konnte nicht geöffnet werden: ' + e.message);
  } finally { opening = null; }
}

/* ---------- Ausgabe-Größe & Darstellung ---------- */
function outSize(forCapture = false) {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw) return null;
  let w = vw, h = vh;
  const kind = modeDef().kind;
  if (kind === 'photo' && S.ratio !== '4:3') {
    // Hochformat-Seitenverhältnis (Breite/Höhe)
    const ar = S.ratio === '1:1' ? 1 : 9 / 16;
    const portrait = vh >= vw;
    const want = portrait ? ar : 1 / ar;
    if (w / h > want) w = Math.round(h * want); else h = Math.round(w / want);
  }
  if (!forCapture) {
    const cap = kind === 'video' ? 3840 : 1920;
    const k = Math.min(1, cap / Math.max(w, h));
    w = Math.round(w * k); h = Math.round(h * k);
  }
  if (S.rot % 2) [w, h] = [h, w];
  return { w, h };
}

const disp = { x: 0, y: 0, w: 0, h: 0, elW: 0, elH: 0, angle: 0 };
function layoutView() {
  const ow = viewCanvas.width, oh = viewCanvas.height;
  if (!ow) return;
  const sw = innerWidth, sh = innerHeight;
  const angle = S.rot === 1 ? 90 : S.rot === 3 ? -90 : S.rot === 2 ? 180 : 0;
  const visW = S.rot % 2 ? oh : ow, visH = S.rot % 2 ? ow : oh;
  // Hochformat: oben bündig unter der Leiste (wie gewohnt), sonst mittig
  const k = Math.min(sw / visW, sh / visH);
  const vw = visW * k, vh = visH * k;
  const top = vh < sh - 120 ? Math.max(0, Math.min((sh - vh) / 2, 56 + (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-t')) || 0))) : (sh - vh) / 2;
  const elW = ow * k, elH = oh * k;
  if (disp.elW !== elW || disp.elH !== elH || disp.angle !== angle || disp.top !== top) {
    viewCanvas.style.width = `${elW}px`;
    viewCanvas.style.height = `${elH}px`;
    viewCanvas.style.top = `${top + vh / 2}px`;
    viewCanvas.style.transform = `translate(-50%,-50%) rotate(${angle}deg)`;
  }
  Object.assign(disp, { x: (sw - vw) / 2, y: top, w: vw, h: vh, elW, elH, angle, top });
  const dpr = Math.min(2, devicePixelRatio || 1);
  if (overlay.width !== Math.round(sw * dpr)) { overlay.width = Math.round(sw * dpr); overlay.height = Math.round(sh * dpr); }
}

/** Bildschirmpunkt → Ausgabe-Koordinaten (0..1) */
function screenToOut(x, y) {
  const cx = disp.x + disp.w / 2, cy = disp.y + disp.h / 2;
  const a = -disp.angle * Math.PI / 180;
  const dx = x - cx, dy = y - cy;
  const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
  return { u: 0.5 + lx / disp.elW, v: 0.5 + ly / disp.elH };
}
function outToScreen(u, v) {
  const a = disp.angle * Math.PI / 180;
  const lx = (u - 0.5) * disp.elW, ly = (v - 0.5) * disp.elH;
  return { x: disp.x + disp.w / 2 + lx * Math.cos(a) - ly * Math.sin(a), y: disp.y + disp.h / 2 + lx * Math.sin(a) + ly * Math.cos(a) };
}
const rotp = (u, v, rot) => rot === 1 ? [1 - v, u] : rot === 2 ? [1 - u, 1 - v] : rot === 3 ? [v, 1 - u] : [u, v];
function outToSrc(u, v) {
  const L = renderer.last; if (!L) return { x: u, y: v };
  const [a, b] = rotp(u, v, L.rot);
  return { x: L.cx + (a - 0.5) * L.sx, y: L.cy + (b - 0.5) * L.sy };
}
function srcToOut(x, y) {
  const L = renderer.last; if (!L) return { u: x, v: y };
  const a = (x - L.cx) / L.sx + 0.5, b = (y - L.cy) / L.sy + 0.5;
  // Umkehrung von rotp
  const r = L.rot;
  return r === 1 ? { u: b, v: 1 - a } : r === 2 ? { u: 1 - a, v: 1 - b } : r === 3 ? { u: 1 - b, v: a } : { u: a, v: b };
}

/* ---------- Bildzustand für den Prozessor ---------- */
function renderState(preview = true) {
  const m = S.mode;
  const adjust = { ...DEFAULT_ADJUST };
  if (m === 'pro') PRO_KEYS.forEach((k) => { adjust[k] = S.pro[k] || 0; });
  if (!['qr', 'sphere'].includes(m)) Object.assign(adjust, { smooth: S.beauty.smooth, skinLight: S.beauty.skinLight, eyes: S.beauty.eyes });
  const useAuto = m === 'pro' ? S.proAuto : (S.autoLook && m !== 'qr');
  const fx = ['qr', 'sphere'].includes(m) ? 0 : S.effect;
  const pr = S.fxParams[fx] || EFFECTS[fx]?.d || [];
  let view = { cx: 0.5, cy: 0.5, zoom: 1 };
  if (!cam.has('zoom') && S.zoom > 1) view.zoom = S.zoom;
  if (S.lock.active) view = { cx: S.lock.cx, cy: S.lock.cy, zoom: S.lock.zoom * (view.zoom || 1) };
  return {
    adjust, effect: fx, p1: pr[0] ?? 0.5, p2: pr[1] ?? 0.5,
    auto: useAuto && S.auto ? S.auto : null,
    view, mirror: cam.isFront && settings.get('mirror', true),
    peaking: preview && m === 'pro' && S.peaking, zebra: preview && m === 'pro' && S.zebra,
    rot: S.rot,
  };
}

/* ---------- Drehung (Handy quer halten) ---------- */
function updateRotation() {
  if (S.rec || !orientation.available || !['photo', 'pro', 'video', 'slowmo', 'timelapse'].includes(S.mode) || !settings.get('autoRotate', true)) {
    if (!S.rec && !['photo', 'pro', 'video', 'slowmo', 'timelapse'].includes(S.mode)) S.rot = 0;
    return;
  }
  const p = orientation.pitch;
  if (Math.abs(p) > 65) return; // flach gehalten: unklar
  const r = orientation.roll;
  let rot = S.rot;
  if (r > -35 && r < 35) rot = 0;
  else if (r > 55 && r < 125) rot = 1;
  else if (r < -55 && r > -125) rot = 3;
  if (rot !== S.rot) {
    S.rot = rot;
    document.body.dataset.rot = rot;
  }
}

/* ---------- Bildschleife ---------- */
let frameNo = 0, lastQr = 0;
const qr = new QrScanner();
function loop() {
  try { tick(); } catch (e) { console.error(e); }
  if (video.requestVideoFrameCallback && !document.hidden) video.requestVideoFrameCallback(loop);
  else requestAnimationFrame(loop);
}
function tick() {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !renderer || S.busy) return;
  frameNo++;
  updateRotation();
  const m = S.mode;
  // Auto-Licht/Farbe & Histogramm
  if (frameNo % 6 === 0 && m !== 'qr') {
    const f = probeSmall.grab(video, vw, vh);
    S.auto = smoothAuto(S.auto, autoStats(f), S.auto ? 0.15 : 1);
    if (S.histo && m === 'pro') drawHisto(S.auto.hist);
  }
  // Punkt fixieren
  if (S.lock.active) {
    const f = probeTrack.grab(video, vw, vh);
    const r = tracker.update(f);
    if (r) {
      const tx = r.x / f.w, ty = r.y / f.h;
      const k = r.lost ? 0 : 0.35;
      S.lock.cx += (tx - S.lock.cx) * k;
      S.lock.cy += (ty - S.lock.cy) * k;
      S.lock.tx = tx; S.lock.ty = ty; S.lock.lost = r.lost;
      // Ausschnitt muss im Bild bleiben
      const half = 0.5 / S.lock.zoom;
      S.lock.ccx = Math.max(half, Math.min(1 - half, S.lock.cx));
      S.lock.ccy = Math.max(half, Math.min(1 - half, S.lock.cy));
    }
  }
  const st = renderState(true);
  if (S.lock.active) st.view = { ...st.view, cx: S.lock.ccx ?? S.lock.cx, cy: S.lock.ccy ?? S.lock.cy };
  const o = outSize();
  renderer.render(video, vw, vh, st, o.w, o.h);
  layoutView();

  const rec = S.rec;
  if (rec?.onFrame) rec.onFrame();
  if (m === 'qr' && performance.now() - lastQr > 220 && !$('#sheet').hidden === false) {
    lastQr = performance.now();
    qr.scan(video).then((res) => { if (res && S.mode === 'qr' && $('#sheet').hidden) onQr(res); });
  }
  if (m === 'sphere') sphereTick();
  if (m === 'pano' || m === 'pano360') panoTick();
  drawOverlay();
}

/* ---------- Überlagerungen (Raster, Wasserwaage, Fokus, Punkt, Kugel-Ziele) ---------- */
let focusMark = null;
function drawOverlay() {
  const dpr = overlay.width / innerWidth;
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  octx.clearRect(0, 0, innerWidth, innerHeight);
  const m = S.mode;
  // Raster
  if (settings.get('grid', false) && m !== 'sphere' && m !== 'qr') {
    octx.strokeStyle = 'rgba(255,255,255,.35)'; octx.lineWidth = 1;
    octx.beginPath();
    for (let i = 1; i < 3; i++) {
      octx.moveTo(disp.x + disp.w * i / 3, disp.y); octx.lineTo(disp.x + disp.w * i / 3, disp.y + disp.h);
      octx.moveTo(disp.x, disp.y + disp.h * i / 3); octx.lineTo(disp.x + disp.w, disp.y + disp.h * i / 3);
    }
    octx.stroke();
  }
  // Wasserwaage
  if (settings.get('level', true) && orientation.available && ['photo', 'pro', 'video', 'pano', 'pano360', 'timelapse'].includes(m) && Math.abs(orientation.pitch) < 60) {
    let r = orientation.roll;
    const snap = Math.round(r / 90) * 90; const dev = r - snap;
    if (Math.abs(dev) < 12) {
      const cx = disp.x + disp.w / 2, cy = disp.y + disp.h / 2;
      const ok = Math.abs(dev) < 0.8;
      octx.save(); octx.translate(cx, cy);
      octx.strokeStyle = ok ? '#f5c542' : 'rgba(255,255,255,.8)'; octx.lineWidth = 2;
      octx.beginPath(); octx.moveTo(-70, 0); octx.lineTo(-25, 0); octx.moveTo(25, 0); octx.lineTo(70, 0); octx.stroke();
      octx.rotate(dev * Math.PI / 180);
      octx.beginPath(); octx.moveTo(-24, 0); octx.lineTo(24, 0); octx.stroke();
      octx.restore();
    }
  }
  // Fokus-Rahmen
  if (focusMark && performance.now() - focusMark.t < 1300) {
    const a = 1 - Math.max(0, (performance.now() - focusMark.t - 900) / 400);
    octx.strokeStyle = `rgba(245,197,66,${a})`; octx.lineWidth = 2;
    const s = 70 - Math.min(1, (performance.now() - focusMark.t) / 200) * 14;
    octx.strokeRect(focusMark.x - s / 2, focusMark.y - s / 2, s, s);
    if (focusMark.lock) { octx.fillStyle = `rgba(245,197,66,${a})`; octx.font = '600 12px system-ui'; octx.fillText('AE/AF gesperrt', focusMark.x - 44, focusMark.y - s / 2 - 8); }
  }
  // fixierter Punkt
  if (S.lock.active && S.lock.tx != null) {
    const o = srcToOut(S.lock.tx, S.lock.ty);
    const p = outToScreen(o.u, o.v);
    octx.strokeStyle = S.lock.lost ? 'rgba(255,80,80,.9)' : 'rgba(245,197,66,.95)';
    octx.lineWidth = 2;
    octx.beginPath(); octx.arc(p.x, p.y, 22, 0, Math.PI * 2); octx.stroke();
    octx.beginPath(); octx.moveTo(p.x - 32, p.y); octx.lineTo(p.x - 14, p.y); octx.moveTo(p.x + 14, p.y); octx.lineTo(p.x + 32, p.y);
    octx.moveTo(p.x, p.y - 32); octx.lineTo(p.x, p.y - 14); octx.moveTo(p.x, p.y + 14); octx.lineTo(p.x, p.y + 32); octx.stroke();
  } else if (S.lock.want && !S.lock.active) {
    octx.fillStyle = 'rgba(0,0,0,.45)';
  }
  if (m === 'sphere') drawSphereOverlay();
  if (m === 'qr') drawQrFrame();
}

function drawHisto(hist) {
  const c = $('#histo canvas'), x = c.getContext('2d');
  x.clearRect(0, 0, c.width, c.height);
  let max = 1; for (let i = 2; i < 254; i++) max = Math.max(max, hist[i]);
  x.fillStyle = 'rgba(255,255,255,.75)';
  for (let i = 0; i < 128; i++) {
    const v = (hist[i * 2] + hist[i * 2 + 1]) / 2;
    const h = Math.min(1, v / max) * c.height;
    x.fillRect(i, c.height - h, 1, h);
  }
}

/* ---------- Bedienung im Sucher: Tippen = Fokus / Punkt fixieren, Halten = Sperre, Zwei Finger = Zoom ---------- */
function bindFinder() {
  const f = $('#finder');
  const pts = new Map();
  let pinch = null, holdT = null, moved = false;
  f.addEventListener('pointerdown', (e) => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
    moved = false;
    if (pts.size === 2) {
      clearTimeout(holdT);
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: S.zoom };
    } else {
      holdT = setTimeout(() => { if (!moved) tapAt(e.clientX, e.clientY, true); }, 600);
    }
    if (S.panel) closePanel();
  });
  f.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId); if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(p.x - p.x0, p.y - p.y0) > 12) { moved = true; clearTimeout(holdT); }
    if (pinch && pts.size === 2) {
      const [a, b] = [...pts.values()];
      setZoom(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d);
    }
  });
  const up = (e) => {
    const p = pts.get(e.pointerId);
    pts.delete(e.pointerId);
    clearTimeout(holdT);
    if (pts.size < 2 && pinch) { pinch = null; moved = true; return; }
    if (p && !moved && !pinch && e.type === 'pointerup' && pts.size === 0 && !p.held) tapAt(e.clientX, e.clientY, false);
  };
  f.addEventListener('pointerup', up);
  f.addEventListener('pointercancel', up);
  let swipeX = null;
  f.addEventListener('touchstart', (e) => { swipeX = e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
  f.addEventListener('touchend', (e) => {
    if (swipeX == null || S.rec || S.lock.want) return;
    const dx = e.changedTouches[0].clientX - swipeX;
    if (Math.abs(dx) > 90) { const i = MODES.findIndex((m) => m.id === S.mode); const n = MODES[Math.max(0, Math.min(MODES.length - 1, i + (dx < 0 ? 1 : -1)))]; if (n.id !== S.mode) setMode(n.id); }
  }, { passive: true });
}

let lastTap = 0;
function tapAt(x, y, long) {
  if (performance.now() - lastTap < 250) return;
  lastTap = performance.now();
  const o = screenToOut(x, y);
  if (o.u < 0 || o.u > 1 || o.v < 0 || o.v > 1) return;
  const src = outToSrc(o.u, o.v);
  if (S.lock.want && ['video', 'slowmo', 'timelapse'].includes(S.mode)) {
    startLock(src.x, src.y);
    return;
  }
  focusMark = { x, y, t: performance.now(), lock: long };
  cam.focusAt(Math.max(0, Math.min(1, src.x)), Math.max(0, Math.min(1, src.y)), long);
  vibrate(10);
}

function startLock(x, y) {
  const f = probeTrack.grab(video, video.videoWidth, video.videoHeight);
  tracker.start(f, x * f.w, y * f.h);
  if (!tracker.active) { toast('Punkt zu nah am Rand – bitte weiter innen antippen'); return; }
  Object.assign(S.lock, { active: true, cx: x, cy: y, tx: x, ty: y, ccx: null, ccy: null });
  cam.focusAt(x, y);
  vibrate(20);
  toast('Punkt fixiert – er bleibt in der Bildmitte');
  buildModeOpts();
}
function stopLock() {
  tracker.stop();
  Object.assign(S.lock, { active: false, tx: null });
}

/* ---------- Zoom ---------- */
function zoomRange() {
  if (cam.has('zoom')) return [cam.caps.zoom.min, cam.caps.zoom.max];
  return [1, 8];
}
function setZoom(z) {
  const [lo, hi] = zoomRange();
  S.zoom = Math.max(lo, Math.min(hi, z));
  if (cam.has('zoom')) cam.zoom(S.zoom);
  $('#zoombar').querySelectorAll('.zb').forEach((b) => b.classList.toggle('on', Math.abs(+b.dataset.z - S.zoom) < 0.05));
  const lbl = $('#zoombar .zcur'); if (lbl) lbl.textContent = `${S.zoom.toFixed(1)}×`;
}
function buildZoom() {
  const zb = $('#zoombar');
  if (['sphere', 'qr', 'pano', 'pano360'].includes(S.mode)) { zb.innerHTML = ''; return; }
  const [lo, hi] = zoomRange();
  const steps = [lo < 0.95 ? lo : null, 1, 2, hi >= 5 ? 5 : null, hi >= 10 ? 10 : null].filter((v) => v != null && v <= hi);
  zb.innerHTML = steps.map((z) => `<button class="zb${Math.abs(z - S.zoom) < 0.05 ? ' on' : ''}" data-z="${z}">${z < 1 ? (Math.round(z * 10) / 10) : z}×</button>`).join('');
  zb.querySelectorAll('.zb').forEach((b) => b.onclick = () => setZoom(+b.dataset.z));
}

/* ---------- Oberleiste / Seitenleiste / Optionen ---------- */
function buildTop() {
  const m = S.mode, kind = modeDef().kind;
  const items = [];
  if (kind === 'photo') items.push(['flash', S.flash === 'off' ? 'flashOff' : S.flash === 'auto' ? 'flashAuto' : S.flash === 'torch' ? 'torch' : 'flash', S.flash !== 'off']);
  if (kind === 'video' || m === 'qr') items.push(['torch', 'torch', S.flash === 'torch']);
  if (kind === 'photo' || m === 'video') items.push(['timer', 'timer', S.timer > 0, S.timer ? S.timer : '']);
  if (kind === 'photo') items.push(['ratio', null, false, S.ratio]);
  if (['photo', 'video', 'pro', 'timelapse'].includes(m)) items.push(['beauty', 'face', S.beauty.smooth > 0 || S.beauty.skinLight > 0 || S.beauty.eyes > 0]);
  if (!['qr', 'sphere'].includes(m)) items.push(['effects', 'palette', S.effect > 0]);
  if (m !== 'qr' && m !== 'pro') items.push(['auto', 'wand', S.autoLook]);
  items.push(['settings', 'gear', false]);
  const top = $('#topbar');
  top.innerHTML = items.map(([id, ic, on, sub]) => `<button class="tb${on ? ' on' : ''}" data-id="${id}" aria-label="${id}">${ic ? icon(ic) : `<b style="font-size:13px">${sub}</b>`}${ic && sub ? `<small>${sub}</small>` : ''}</button>`).join('');
  top.querySelectorAll('.tb').forEach((b) => b.onclick = () => topAction(b.dataset.id));
}

function topAction(id) {
  if (id === 'flash') {
    const order = ['off', 'auto', 'on', 'torch'];
    S.flash = order[(order.indexOf(S.flash) + 1) % order.length];
    cam.torch(S.flash === 'torch');
    toast({ off: 'Blitz aus', auto: 'Blitz automatisch', on: 'Blitz an', torch: 'Dauerlicht' }[S.flash]);
  } else if (id === 'torch') {
    S.flash = S.flash === 'torch' ? 'off' : 'torch';
    cam.torch(S.flash === 'torch').then((ok) => { if (!ok) toast('Licht wird von dieser Kamera nicht unterstützt'); });
  } else if (id === 'timer') {
    S.timer = S.timer === 0 ? 3 : S.timer === 3 ? 10 : 0;
    toast(S.timer ? `Selbstauslöser ${S.timer} s` : 'Selbstauslöser aus');
  } else if (id === 'ratio') {
    S.ratio = S.ratio === '4:3' ? '1:1' : S.ratio === '1:1' ? '16:9' : '4:3';
    settings.set('ratio', S.ratio);
  } else if (id === 'auto') {
    S.autoLook = !S.autoLook; settings.set('autoLook', S.autoLook);
    toast(S.autoLook ? 'Auto-Look an: Licht & Farbe werden live optimiert' : 'Auto-Look aus');
  } else {
    togglePanel(id);
  }
  buildTop();
}

function buildSide() {
  const sb = $('#sidebar');
  const m = S.mode;
  const items = [];
  if (m === 'pro') {
    items.push(['proPanel', 'sliders', S.panel === 'pro']);
    items.push(['peaking', 'target', S.peaking]);
    items.push(['zebra', 'grid', S.zebra]);
    items.push(['histo', 'level', S.histo]);
  }
  sb.innerHTML = items.map(([id, ic, on]) => `<button class="sb${on ? ' on' : ''}" data-id="${id}" title="${id}">${icon(ic, 22)}</button>`).join('');
  sb.querySelectorAll('.sb').forEach((b) => b.onclick = () => {
    const id = b.dataset.id;
    if (id === 'proPanel') togglePanel('pro');
    else if (id === 'peaking') { S.peaking = !S.peaking; toast(S.peaking ? 'Fokus-Peaking: scharfe Kanten rot' : 'Fokus-Peaking aus'); }
    else if (id === 'zebra') { S.zebra = !S.zebra; toast(S.zebra ? 'Zebra: überbelichtete Stellen gestreift' : 'Zebra aus'); }
    else if (id === 'histo') { S.histo = !S.histo; $('#histo').hidden = !S.histo; }
    buildSide();
  });
  $('#histo').hidden = !(m === 'pro' && S.histo);
}

function buildModeOpts() {
  const mo = $('#modeopts');
  const m = S.mode;
  let html = '';
  if (['video', 'slowmo', 'timelapse'].includes(m)) {
    html += `<button class="chip${S.lock.want ? ' on' : ''}" data-a="lock">${icon('target')}${S.lock.active ? 'Punkt fixiert' : 'Punkt fixieren'}</button>`;
    if (S.lock.active) html += `<button class="chip" data-a="lockzoom">Zoom ${S.lock.zoom.toFixed(1)}×</button><button class="chip" data-a="unlock">${icon('close')}Lösen</button>`;
  }
  if (m === 'slowmo') html += [2, 4, 8].map((f) => `<button class="chip${S.slowFactor === f ? ' on' : ''}" data-a="slow" data-v="${f}">${f}× langsamer</button>`).join('');
  if (m === 'timelapse') html += [0.5, 1, 2, 5, 10].map((v) => `<button class="chip${S.tlInterval === v ? ' on' : ''}" data-a="tl" data-v="${v}">${v < 1 ? '½' : v} s</button>`).join('');
  if (m === 'sphere' && !sphere.active) html += ['schnell', 'normal', 'fein'].map((q) => `<button class="chip${S.sphereQuality === q ? ' on' : ''}" data-a="sq" data-v="${q}">${q[0].toUpperCase() + q.slice(1)}</button>`).join('');
  if (m === 'sphere' && sphere.active) html += `<button class="chip" data-a="sundo">${icon('undo')}Zurück</button><button class="chip on" data-a="sdone">${icon('check')}Fertig</button><button class="chip" data-a="scancel">${icon('close')}Abbrechen</button>`;
  if (m === 'pro') html += `<button class="chip${S.proAuto ? ' on' : ''}" data-a="proauto">${icon('wand')}Auto-Ton</button><button class="chip" data-a="proreset">${icon('undo')}Zurücksetzen</button>`;
  mo.innerHTML = html;
  mo.querySelectorAll('.chip').forEach((b) => b.onclick = () => {
    const a = b.dataset.a, v = b.dataset.v;
    if (a === 'lock') {
      if (S.lock.active) stopLock();
      S.lock.want = !S.lock.want;
      if (S.lock.want) toast('Tippe auf den Punkt, der in der Mitte bleiben soll');
    } else if (a === 'unlock') { stopLock(); S.lock.want = false; }
    else if (a === 'lockzoom') { const z = [1.2, 1.4, 1.7, 2, 2.5]; S.lock.zoom = z[(z.indexOf(S.lock.zoom) + 1) % z.length] || 1.4; settings.set('lockZoom', S.lock.zoom); toast('Mehr Zoom = mehr Spielraum beim Wackeln'); }
    else if (a === 'slow') { S.slowFactor = +v; settings.set('slowFactor', S.slowFactor); }
    else if (a === 'tl') { S.tlInterval = +v; settings.set('tlInterval', S.tlInterval); toast(`Alle ${v} s ein Bild → 1 min Aufnahme = ${Math.round(60 / v / 30 * 10) / 10} s Video`); }
    else if (a === 'sq') { S.sphereQuality = v; settings.set('sphereQuality', v); }
    else if (a === 'sundo') sphereUndo();
    else if (a === 'sdone') sphereFinish();
    else if (a === 'scancel') sphereCancel();
    else if (a === 'proauto') S.proAuto = !S.proAuto;
    else if (a === 'proreset') { PRO_KEYS.forEach((k) => { S.pro[k] = 0; }); settings.set('pro', S.pro); cam.allAuto(); proHw.reset = true; if (S.panel === 'pro') openPanel('pro'); }
    buildModeOpts();
  });
}

/* ---------- Panels ---------- */
function togglePanel(id) { if (S.panel === id) closePanel(); else openPanel(id); }
function closePanel() { S.panel = null; $('#panel').hidden = true; buildSide(); }

function slider(label, key, val, min, max, step, fmt = (v) => v.toFixed(2)) {
  return `<label class="slider"><span>${label}</span><input type="range" data-k="${key}" min="${min}" max="${max}" step="${step}" value="${val}"><span>${fmt(+val)}</span></label>`;
}
function bindSliders(root, onInput) {
  root.querySelectorAll('input[type=range]').forEach((r) => {
    r.oninput = () => {
      const fmtEl = r.nextElementSibling;
      onInput(r.dataset.k, +r.value, (txt) => { fmtEl.textContent = txt; });
    };
  });
}

const proHw = { exposure: 'auto', focus: 'auto', wb: 'auto', reset: false };
function applyProHardware() { /* Hardware-Werte bleiben bis zum Zurücksetzen gesetzt */ }

function openPanel(id) {
  S.panel = id;
  const p = $('#panel');
  p.hidden = false;
  let html = '';
  if (id === 'effects') {
    const e = EFFECTS[S.effect];
    const pr = S.fxParams[S.effect] || e.d || [];
    html = `<h3>Effekte (live)<button data-a="fxoff">Aus</button></h3>
      <div class="fxrow">${EFFECTS.map((x) => `<button class="fx${x.id === S.effect ? ' on' : ''}" data-fx="${x.id}">${x.name}</button>`).join('')}</div>
      ${(e.p || []).map((name, i) => slider(name, `p${i}`, pr[i] ?? 0.5, 0, 1, 0.01, (v) => `${Math.round(v * 100)}`)).join('')}
      ${e.p ? '' : '<p class="subtle">Wähle einen Effekt – jeder lässt sich mit eigenen Reglern live einstellen.</p>'}`;
  } else if (id === 'beauty') {
    const b = S.beauty;
    html = `<h3>Live-Retusche<button data-a="bpreset">Natürlich</button></h3>
      ${slider('Haut glätten', 'smooth', b.smooth, 0, 1, 0.01, (v) => `${Math.round(v * 100)}`)}
      ${slider('Haut aufhellen', 'skinLight', b.skinLight, 0, 1, 0.01, (v) => `${Math.round(v * 100)}`)}
      ${slider('Details schärfen', 'eyes', b.eyes, 0, 1, 0.01, (v) => `${Math.round(v * 100)}`)}
      <div class="row"><div>Auto-Look<small>Licht, Kontrast & Weißabgleich laufend optimieren</small></div><button class="switch${S.autoLook ? ' on' : ''}" data-a="autolook"></button></div>
      <div class="btnrow"><button class="btn" data-a="b0">Aus</button><button class="btn" data-a="b1">Leicht</button><button class="btn" data-a="b2">Stark</button></div>`;
  } else if (id === 'pro') {
    html = proPanelHtml();
  } else if (id === 'settings') {
    html = settingsHtml();
  }
  p.innerHTML = html;
  bindPanel(id);
  buildSide();
}

function proPanelHtml() {
  const c = cam.caps || {}, s = cam.settings || {};
  const hw = [];
  if (c.iso) hw.push(slider('ISO', 'hw:iso', s.iso ?? c.iso.min, c.iso.min, c.iso.max, c.iso.step || 1, (v) => `${Math.round(v)}`));
  if (c.exposureTime) hw.push(slider('Verschluss', 'hw:exposureTime', s.exposureTime ?? c.exposureTime.min, c.exposureTime.min, Math.min(c.exposureTime.max, 10000), c.exposureTime.step || 1, (v) => { const sec = v / 10000; return sec >= 0.3 ? `${sec.toFixed(1)}s` : `1/${Math.round(1 / sec)}`; }));
  if (c.exposureCompensation) hw.push(slider('Belichtung ±', 'hw:exposureCompensation', s.exposureCompensation ?? 0, c.exposureCompensation.min, c.exposureCompensation.max, c.exposureCompensation.step || 0.1, (v) => v.toFixed(1)));
  if (c.colorTemperature) hw.push(slider('Weißabgleich', 'hw:colorTemperature', s.colorTemperature ?? 5000, c.colorTemperature.min, c.colorTemperature.max, c.colorTemperature.step || 50, (v) => `${Math.round(v)}K`));
  if (c.focusDistance) hw.push(slider('Fokus', 'hw:focusDistance', s.focusDistance ?? c.focusDistance.min, c.focusDistance.min, c.focusDistance.max, c.focusDistance.step || 0.01, (v) => v.toFixed(2)));
  const sw = [
    ['Belichtung', 'exposure', -2, 2], ['Kontrast', 'contrast', -1, 1], ['Sättigung', 'saturation', -1, 1],
    ['Wärme', 'temp', -1, 1], ['Tönung', 'tint', -1, 1], ['Lichter', 'highlights', -1, 1], ['Schatten', 'shadows', -1, 1],
    ['Klarheit', 'clarity', -1, 1], ['Schärfe', 'sharpen', 0, 1], ['Vignette', 'vignette', -1, 1],
  ].map(([l, k, a, b]) => slider(l, k, S.pro[k] || 0, a, b, 0.01, (v) => (v > 0 ? '+' : '') + v.toFixed(2))).join('');
  return `<h3>Profi-Einstellungen<button data-a="hwauto">Alles Auto</button></h3>
    ${hw.length ? `<p class="subtle">Kamera-Hardware (diese Kamera unterstützt ${hw.length} Regler)</p>${hw.join('')}` : '<p class="subtle">Diese Kamera gibt ISO/Verschluss/Fokus nicht für Apps frei – die Bild-Regler unten wirken trotzdem.</p>'}
    <p class="subtle">Bild</p>${sw}`;
}

function settingsHtml() {
  const sw = (k, d, label, sub = '') => `<div class="row"><div>${label}${sub ? `<small>${sub}</small>` : ''}</div><button class="switch${settings.get(k, d) ? ' on' : ''}" data-set="${k}" data-d="${d}"></button></div>`;
  const seg = (k, d, label, opts) => `<div class="row"><div>${label}</div><div class="seg">${opts.map(([v, t]) => `<button class="${String(settings.get(k, d)) === String(v) ? 'on' : ''}" data-seg="${k}" data-v="${v}">${t}</button>`).join('')}</div></div>`;
  const hfov = settings.get('hfov', 53);
  return `<h3>Einstellungen</h3>
    ${sw('autosave', true, 'In Handy-Galerie speichern', 'Ordner DCIM/Kamera Pro')}
    ${seg('videoRes', '1080', 'Video-Auflösung', [['720', '720p'], ['1080', '1080p'], ['4k', '4K']])}
    ${sw('photoHi', true, 'Hohe Foto-Auflösung', 'schärfer, braucht etwas mehr Leistung')}
    ${sw('sensorPhoto', false, 'Sensor-Fotos (Maximum)', 'nutzt die volle Kamera-Auflösung; nicht jedes Handy unterstützt das')}
    ${sw('autoRotate', true, 'Querformat automatisch', 'Fotos/Videos richtig drehen, wenn das Handy quer gehalten wird')}
    ${sw('grid', false, 'Raster')}
    ${sw('level', true, 'Wasserwaage')}
    ${sw('sound', true, 'Auslöseton')}
    ${sw('mirror', true, 'Frontkamera spiegeln')}
    <p class="subtle">360°-Aufnahmen: Blickwinkel der Kamera ${settings.get('hfovMeasured', false) ? '(automatisch gemessen)' : '(Schätzwert – wird beim Schwenken automatisch gemessen)'}</p>
    ${slider('Blickwinkel', 'hfov', hfov, 35, 100, 0.5, (v) => `${v.toFixed(1)}°`)}
    <div class="row"><div>Objektiv wählen<small>für Weitwinkel/Tele, wenn das Handy es freigibt</small></div><button class="btn" style="flex:none;min-width:auto;padding:0 14px" data-a="lens">Wechseln</button></div>
    <p class="subtle">Tipp: Die Lautstärketasten lösen ebenfalls aus.</p>`;
}

function bindPanel(id) {
  const p = $('#panel');
  p.querySelectorAll('[data-fx]').forEach((b) => b.onclick = () => { S.effect = +b.dataset.fx; openPanel('effects'); buildTop(); });
  p.querySelectorAll('[data-a]').forEach((b) => b.onclick = async () => {
    const a = b.dataset.a;
    if (a === 'fxoff') { S.effect = 0; openPanel('effects'); }
    if (a === 'autolook') { S.autoLook = !S.autoLook; settings.set('autoLook', S.autoLook); b.classList.toggle('on', S.autoLook); }
    if (a === 'b0' || a === 'b1' || a === 'b2' || a === 'bpreset') {
      const pre = { b0: [0, 0, 0], b1: [0.35, 0.15, 0.2], b2: [0.7, 0.35, 0.35], bpreset: [0.35, 0.15, 0.2] }[a];
      S.beauty = { smooth: pre[0], skinLight: pre[1], eyes: pre[2] };
      settings.set('beauty', S.beauty);
      openPanel('beauty');
    }
    if (a === 'hwauto') { await cam.allAuto(); openPanel('pro'); toast('Kamera wieder auf Automatik'); }
    if (a === 'lens') await nextLens();
    buildTop();
  });
  p.querySelectorAll('[data-set]').forEach((b) => b.onclick = () => {
    const k = b.dataset.set, d = b.dataset.d === 'true';
    const v = !settings.get(k, d);
    settings.set(k, v);
    b.classList.toggle('on', v);
    if (k === 'photoHi' && modeDef().kind === 'photo') openCamera();
  });
  p.querySelectorAll('[data-seg]').forEach((b) => b.onclick = () => {
    settings.set(b.dataset.seg, b.dataset.v);
    b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    if (b.dataset.seg === 'videoRes' && S.mode === 'video') openCamera();
  });
  bindSliders(p, (k, v, setTxt) => {
    if (id === 'effects') {
      const i = k === 'p0' ? 0 : 1;
      const cur = [...(S.fxParams[S.effect] || EFFECTS[S.effect].d || [0.5, 0.5])];
      cur[i] = v; S.fxParams[S.effect] = cur; settings.set('fxParams', S.fxParams);
      setTxt(`${Math.round(v * 100)}`);
    } else if (id === 'beauty') {
      S.beauty[k] = v; settings.set('beauty', S.beauty); setTxt(`${Math.round(v * 100)}`);
      buildTop();
    } else if (id === 'pro') {
      if (k.startsWith('hw:')) {
        const name = k.slice(3);
        const c = { [name]: v };
        if (name === 'iso' || name === 'exposureTime') c.exposureMode = 'manual';
        if (name === 'focusDistance') c.focusMode = 'manual';
        if (name === 'colorTemperature') c.whiteBalanceMode = 'manual';
        cam.set(c);
        const fmts = { iso: () => `${Math.round(v)}`, exposureTime: () => { const sec = v / 10000; return sec >= 0.3 ? `${sec.toFixed(1)}s` : `1/${Math.round(1 / sec)}`; }, exposureCompensation: () => v.toFixed(1), colorTemperature: () => `${Math.round(v)}K`, focusDistance: () => v.toFixed(2) };
        setTxt(fmts[name]());
      } else {
        S.pro[k] = v; settings.set('pro', S.pro); setTxt((v > 0 ? '+' : '') + v.toFixed(2));
      }
    } else if (id === 'settings' && k === 'hfov') {
      settings.set('hfov', v); settings.set('hfovMeasured', false); setTxt(`${v.toFixed(1)}°`);
    }
  });
}

async function nextLens() {
  const list = (await cam.listCameras()).filter((d) => !/front|user|vorder/i.test(d.label));
  if (list.length < 2) { toast('Das Handy gibt nur ein Rück-Objektiv frei'); return; }
  const cur = list.findIndex((d) => d.deviceId === cam.deviceId);
  const next = list[(cur + 1) % list.length];
  settings.set('backDevice', next.deviceId);
  settings.set('facing', 'environment');
  await openCamera();
  toast(next.label || `Objektiv ${(cur + 1) % list.length + 1}`);
}

/* ---------- Modus wechseln ---------- */
function buildModes() {
  const nav = $('#modes');
  nav.innerHTML = MODES.map((m) => `<button data-m="${m.id}" class="${m.id === S.mode ? 'on' : ''}">${m.name}</button>`).join('');
  nav.querySelectorAll('button').forEach((b) => b.onclick = () => setMode(b.dataset.m));
  requestAnimationFrame(() => nav.querySelector('.on')?.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' }));
}

async function setMode(id) {
  if (S.rec || opening) return;
  const prevKind = modeDef().kind;
  const prevSpec = JSON.stringify(streamSpec());
  if (S.mode === 'sphere' && sphere.active) sphereCancel();
  stopLock(); S.lock.want = false;
  S.mode = id;
  settings.set('mode', id);
  closePanel();
  buildModes(); buildTop(); buildSide(); buildModeOpts(); buildZoom();
  updateShutter();
  hint('');
  $('#panoPreview').hidden = true; $('#progress').hidden = true;
  const needOrient = ['pano', 'pano360', 'sphere'].includes(id);
  if (needOrient) orientation.start();
  if (id === 'pano') hint('Auslöser drücken und das Handy langsam und gerade zur Seite schwenken');
  if (id === 'pano360') hint('Auslöser drücken und dich einmal langsam im Kreis drehen (Handy vor dir halten)');
  if (id === 'sphere') hint('Kugel-Panorama: Auslöser drücken, dann die Punkte Reihe für Reihe von oben nach unten anvisieren');
  if (id === 'qr') hint('Kamera auf einen QR-Code oder Barcode richten');
  if (id === 'slowmo') hint('Zeitlupe: je höher die Bildrate deines Handys, desto flüssiger');
  if (id === 'timelapse') hint('Zeitraffer: Handy ruhig hinstellen und Intervall wählen');
  if (id === 'video') hint('');
  if (['pano', 'pano360', 'sphere', 'qr', 'slowmo', 'timelapse'].includes(id)) setTimeout(() => { if (S.mode === id && !S.rec && !sphere.active) hint(''); }, 5000);
  const newSpec = JSON.stringify(streamSpec());
  const facingChange = needOrient && cam.isFront;
  if (newSpec !== prevSpec || facingChange || !cam.stream || prevKind !== modeDef().kind) await openCamera();
  if (id === 'video' || id === 'timelapse' || id === 'slowmo') cam.allAuto();
}

function updateShutter() {
  const sh = $('#shutter');
  const kind = modeDef().kind;
  sh.className = '';
  if (kind === 'video') sh.classList.add('video');
  if (['pano', 'pano360', 'sphere'].includes(S.mode)) sh.classList.add('special');
  if (S.rec || sphere.active) sh.classList.add('recording');
  sh.querySelector('span').innerHTML = S.mode === 'qr' ? icon('qr', 30) : '';
  $('#flip').innerHTML = S.rec?.pausable ? icon(S.rec.paused ? 'play' : 'pause', 28) : icon('switch', 28);
}

/* ---------- Auslöser ---------- */
async function shutter() {
  if (S.busy || opening) return;
  const m = S.mode;
  if (m === 'qr') { lastQr = 0; toast('Suche Code …'); return; }
  if (S.rec) return stopRecording();
  if (m === 'sphere') return sphere.active ? sphereFinish() : sphereStart();
  if (S.timer && ['photo', 'pro', 'video'].includes(m)) await countdown(S.timer);
  if (modeDef().kind === 'photo') return takePhoto();
  if (m === 'video') return startVideo();
  if (m === 'slowmo') return startSlowmo();
  if (m === 'timelapse') return startTimelapse();
  if (m === 'pano' || m === 'pano360') return startPano();
}

function countdown(sec) {
  return new Promise((res) => {
    const el = $('#countdown');
    el.hidden = false;
    let n = sec;
    const step = () => {
      if (n <= 0) { el.hidden = true; res(); return; }
      el.textContent = n; n--; click(); setTimeout(step, 1000);
    };
    step();
  });
}

/* ---------- Foto ---------- */
async function takePhoto() {
  S.busy = true;
  try {
    const st = renderState(false);
    const useFlash = S.flash === 'on' || (S.flash === 'auto' && (S.auto?.mean ?? 0.5) < 0.18);
    let src = null, sw = 0, sh = 0;
    if (settings.get('sensorPhoto', false) && !cam.isFront) {
      const bmp = await cam.takePhoto(useFlash ? 'on' : 'off');
      if (bmp) {
        // Ausrichtung angleichen, falls der Sensor quer liefert
        const vPortrait = video.videoHeight >= video.videoWidth, bPortrait = bmp.height >= bmp.width;
        if (vPortrait !== bPortrait) {
          const c = document.createElement('canvas');
          c.width = bmp.height; c.height = bmp.width;
          const x = c.getContext('2d');
          x.translate(c.width / 2, c.height / 2); x.rotate(Math.PI / 2); x.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
          src = c; sw = c.width; sh = c.height;
        } else { src = bmp; sw = bmp.width; sh = bmp.height; }
      }
    }
    if (!src) {
      if (useFlash && cam.has('torch') && S.flash !== 'torch') { await cam.torch(true); await new Promise((r) => setTimeout(r, 450)); }
      const c = document.createElement('canvas');
      c.width = video.videoWidth; c.height = video.videoHeight;
      c.getContext('2d').drawImage(video, 0, 0);
      if (useFlash && cam.has('torch') && S.flash !== 'torch') cam.torch(false);
      src = c; sw = c.width; sh = c.height;
    }
    click(); flashFx(); vibrate(15);
    // Ausgabegröße entsprechend Seitenverhältnis/Drehung in voller Auflösung
    const k = sw / video.videoWidth;
    const o = outSize(true);
    const out = renderToCanvas(src, sw, sh, st, Math.round(o.w * k), Math.round(o.h * k));
    src.close?.();
    const blob = await new Promise((r) => out.toBlob(r, 'image/jpeg', 0.93));
    await storeCapture('photo', blob, out, 'jpg');
  } catch (e) {
    toast('Foto fehlgeschlagen: ' + e.message);
  } finally { S.busy = false; }
}

async function storeCapture(type, blob, thumbSrc, ext, meta = {}) {
  const thumb = thumbSrc ? await makeThumb(thumbSrc) : null;
  const item = await addItem({ type, blob, thumb, mime: blob.type, meta, name: fileName(type, ext) });
  setThumb(thumb);
  if (settings.get('autosave', true)) {
    saveToPhone(blob, item.name).catch((e) => toast('Speichern in die Galerie fehlgeschlagen: ' + e.message, 4000));
  }
  return item;
}
let thumbUrl = null;
function setThumb(blob) {
  if (!blob) return;
  if (thumbUrl) URL.revokeObjectURL(thumbUrl);
  thumbUrl = URL.createObjectURL(blob);
  $('#thumb img').src = thumbUrl;
}

/* ---------- Video ---------- */
let audioStream = null;
async function getAudio() {
  try {
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true } });
  } catch { audioStream = null; toast('Ohne Ton (Mikrofon nicht erlaubt)'); }
  return audioStream;
}

function startRecTimer(label = '') {
  const el = $('#rec'); el.hidden = false; el.classList.remove('paused');
  const t0 = performance.now();
  let paused = 0, pausedAt = 0;
  const upd = () => {
    if (!S.rec) return;
    const r = S.rec;
    if (r.paused) { if (!pausedAt) pausedAt = performance.now(); }
    else if (pausedAt) { paused += performance.now() - pausedAt; pausedAt = 0; }
    const secs = (performance.now() - t0 - paused - (pausedAt ? performance.now() - pausedAt : 0)) / 1000;
    $('#rectime').textContent = (r.label ? r.label(secs) : fmtTime(secs)) + label;
    el.classList.toggle('paused', !!r.paused);
    requestAnimationFrame(upd);
  };
  requestAnimationFrame(upd);
}

async function startVideo() {
  const audio = await getAudio();
  if (S.flash === 'torch') cam.torch(true);
  const lr = new LiveRecorder(viewCanvas, Math.min(60, Math.round(cam.fps)) || 30, audio);
  lr.start();
  S.rec = {
    type: 'video', pausable: true, paused: false,
    stop: async () => {
      const blob = await lr.stop();
      audioStream?.getTracks().forEach((t) => t.stop()); audioStream = null;
      return { blob, ext: blob.type.includes('mp4') ? 'mp4' : 'webm' };
    },
    pause: () => lr.pause(), resume: () => lr.resume(),
  };
  recStarted();
}

async function startSlowmo() {
  if (!canEncodeFrames()) { toast('Zeitlupe braucht ein neueres Android-System-WebView'); return; }
  const factor = S.slowFactor;
  const outFps = 30;
  let enc;
  try { enc = await FrameEncoder.create(viewCanvas.width, viewCanvas.height, outFps); } catch (e) { toast(e.message); return; }
  const prev = document.createElement('canvas');
  prev.width = enc.w; prev.height = enc.h;
  const pctx = prev.getContext('2d');
  let t0 = null, lastT = 0, slot = 0, frames = 0, havePrev = false;
  const fps = cam.fps;
  S.rec = {
    type: 'slowmo',
    label: (s) => `${fmtTime(s)} → ${fmtTime(s * factor)} · ${Math.round(fps)} B/s`,
    onFrame: () => {
      const now = performance.now();
      if (t0 == null) t0 = now;
      const t = (now - t0) / 1000 * factor; // Zeit in der fertigen Datei (s)
      // fehlende Zwischenbilder als Überblendung zwischen letztem und aktuellem Bild
      while (havePrev && (slot + 1) / outFps <= t) {
        slot++;
        const a = Math.max(0, Math.min(1, ((slot / outFps) - lastT) / Math.max(1e-6, t - lastT)));
        if (!enc.busy) {
          enc.ctx.globalAlpha = 1; enc.ctx.drawImage(prev, 0, 0);
          enc.add(viewCanvas, slot * 1e6 / outFps, a);
        }
      }
      if (!havePrev) { enc.add(viewCanvas, 0); slot = 0; }
      pctx.drawImage(viewCanvas, 0, 0, prev.width, prev.height);
      havePrev = true; lastT = t; frames++;
    },
    stop: async () => ({ blob: await enc.finish(), ext: 'mp4', meta: { slowmo: factor, fps } }),
  };
  recStarted();
  if (fps < 50) toast(`Dein Handy liefert hier ${Math.round(fps)} Bilder/s – Zwischenbilder werden berechnet`, 3500);
}

async function startTimelapse() {
  const interval = S.tlInterval * 1000;
  const outFps = 30;
  let enc = null, jpgs = null;
  if (canEncodeFrames()) {
    try { enc = await FrameEncoder.create(viewCanvas.width, viewCanvas.height, outFps); } catch { enc = null; }
  }
  if (!enc) jpgs = [];
  let n = 0, last = -Infinity;
  const w = viewCanvas.width, h = viewCanvas.height;
  S.rec = {
    type: 'timelapse', pausable: true, paused: false,
    label: (s) => `${fmtTime(s)} · ${n} Bilder → ${(n / outFps).toFixed(1)} s`,
    onFrame: () => {
      if (S.rec.paused) return;
      const now = performance.now();
      if (now - last < interval) return;
      last = now;
      if (enc) { if (!enc.busy) { enc.add(viewCanvas, n * 1e6 / outFps); n++; } }
      else { viewCanvas.toBlob((b) => b && jpgs.push(b), 'image/jpeg', 0.9); n++; }
    },
    pause: () => {}, resume: () => {},
    stop: async () => {
      if (n < 2) { enc?.close(); throw new Error('Zu kurz – mindestens 2 Bilder nötig'); }
      if (enc) return { blob: await enc.finish(), ext: 'mp4', meta: { timelapse: S.tlInterval } };
      busy('Zeitraffer wird erstellt …', 0);
      const blob = await encodeFallback(jpgs, w, h, outFps, (p) => busy(null, p));
      return { blob, ext: blob.type.includes('mp4') ? 'mp4' : 'webm', meta: { timelapse: S.tlInterval } };
    },
  };
  recStarted();
}

function recStarted() {
  startRecTimer();
  updateShutter();
  $('#modes').style.visibility = 'hidden';
  $('#thumb').style.visibility = 'hidden';
  vibrate(30);
}

async function stopRecording() {
  const r = S.rec;
  if (!r || r.stopping) return;
  r.stopping = true;
  vibrate(30);
  try {
    busy('Wird gespeichert …');
    const res = await r.stop();
    S.rec = null;
    const th = await videoThumb(res.blob);
    await storeCapture(r.type === 'video' ? 'video' : r.type, res.blob, null, res.ext, res.meta || {});
    if (th) setThumb(th);
    const items = await listItems();
    if (th && items[0]) { items[0].thumb = th; (await import('./store.js')).updateItem(items[0]); }
    toast(r.type === 'slowmo' ? 'Zeitlupe gespeichert' : r.type === 'timelapse' ? 'Zeitraffer gespeichert' : 'Video gespeichert');
  } catch (e) {
    toast('Aufnahme fehlgeschlagen: ' + e.message, 4000);
  } finally {
    S.rec = null;
    busy(false);
    if (S.flash === 'torch' && modeDef().kind !== 'video') cam.torch(false);
    $('#rec').hidden = true;
    $('#modes').style.visibility = '';
    $('#thumb').style.visibility = '';
    updateShutter();
  }
}

/* ---------- Panorama & 360° ---------- */
let pano = null;
const panoProbe = new Probe(160);
function startPano() {
  if (pano) return finishPano();
  const full = S.mode === 'pano360';
  pano = new PanoCapture({ full360: full });
  pano.start(viewCanvas.width, viewCanvas.height);
  S.rec = { type: S.mode, stop: async () => null };
  S.rec.stop = null;
  S.rec.onFrame = null;
  $('#panoPreview').hidden = false;
  const pc = $('#panoPreview');
  pc.width = Math.round(pc.clientWidth * 1.5); pc.height = Math.round(pc.clientHeight * 1.5);
  $('#progress').hidden = false;
  hint(full ? 'Langsam im Kreis drehen …' : 'Langsam schwenken … zum Beenden erneut drücken');
  updateShutter();
  $('#modes').style.visibility = 'hidden';
}
function panoTick() {
  if (!pano) return;
  const f = panoProbe.grab(viewCanvas, viewCanvas.width, viewCanvas.height);
  pano.feed(viewCanvas, f, orientation.available ? orientation.yaw : null);
  if (frameNo % 3 === 0) pano.preview($('#panoPreview'));
  $('#progress div').style.width = `${Math.round(pano.progress * 100)}%`;
  if (pano.lastShake > viewCanvas.height * 0.01) hint('Etwas gerader halten');
  else if (pano.started) hint(S.mode === 'pano360' ? `Weiter drehen … ${Math.round(Math.abs(pano.yawTotal))}°` : 'Gut so – weiter schwenken');
  if (pano.done) finishPano();
}
async function finishPano() {
  const p = pano; pano = null;
  S.rec = null;
  $('#panoPreview').hidden = true; $('#progress').hidden = true;
  $('#modes').style.visibility = '';
  updateShutter();
  hint('');
  const res = p.finish(viewCanvas);
  if (!res || res.canvas.width < viewCanvas.width * 1.15) { toast('Zu kurz geschwenkt – bitte nochmal'); return; }
  S.busy = true;
  busy('Panorama wird gespeichert …');
  try {
    let blob = await new Promise((r) => res.canvas.toBlob(r, 'image/jpeg', 0.92));
    const meta = {};
    if (p.full360) {
      const W = res.canvas.width, H = res.canvas.height;
      const fullH = Math.round(W / 2);
      meta.vfov = res.meta.vfov;
      blob = await addPanoXmp(blob, { fullW: W, fullH, cropW: W, cropH: H, cropL: 0, cropT: Math.max(0, Math.round((fullH - H) / 2)) });
      // Blickwinkel der Kamera aus dem Rundum-Schwenk ableiten
      const ppd = res.meta.ppd;
      const est = 2 * Math.atan(viewCanvas.width * Math.PI / (360 * ppd)) * 180 / Math.PI;
      if (est > 35 && est < 100) { settings.set('hfov', Math.round(est * 2) / 2); settings.set('hfovMeasured', true); }
    }
    await storeCapture(p.full360 ? 'pano360' : 'pano', blob, res.canvas, 'jpg', meta);
    toast(p.full360 ? '360°-Panorama gespeichert' : 'Panorama gespeichert');
  } finally { S.busy = false; busy(false); }
}

/* ---------- Kugel 360° ---------- */
const sphere = { active: false, shots: [], plan: null, row: 0, hold: 0, calib: { dx: 0, dyaw: 0, prev: null, prevYaw: null } };
const sphereProbe = new Probe(160);
function camFov() {
  const w = video.videoWidth, h = video.videoHeight;
  const hfov = settings.get('hfov', 53);
  return { hfov, vfov: vfovFrom(hfov, w, h) };
}
function sphereStart() {
  if (!orientation.available) { toast('Lagesensor nicht verfügbar – Kugel-Aufnahme nicht möglich'); return; }
  const { hfov, vfov } = camFov();
  sphere.plan = planTargets(hfov, vfov, orientation.yaw, S.sphereQuality);
  sphere.shots = []; sphere.row = 0; sphere.active = true; sphere.hold = 0;
  sphere.fov = { hfov, vfov };
  buildModeOpts(); updateShutter();
  $('#modes').style.visibility = 'hidden';
  vibrate(30);
}
function sphereRowTargets() { return sphere.plan.targets.filter((t) => t.row === sphere.row); }
function sphereTick() {
  const R = orientation.R;
  // Blickwinkel laufend messen (Bildverschiebung ↔ Drehung)
  if (R && Math.abs(orientation.pitch) < 25 && frameNo % 2 === 0) {
    const f = sphereProbe.grab(video, video.videoWidth, video.videoHeight);
    const yaw = orientation.yaw, cal = sphere.calib;
    if (cal.prev && cal.prevYaw != null) {
      let dy = yaw - cal.prevYaw; if (dy > 180) dy -= 360; if (dy < -180) dy += 360;
      if (Math.abs(dy) > 0.25 && Math.abs(dy) < 5) {
        const s = estimateShift(cal.prev.gray, f.gray, f.w, f.h, 20, 6);
        if (Math.sign(s.dx) === -Math.sign(dy) && Math.abs(s.dx) > 0.5) { cal.dx += Math.abs(s.dx); cal.dyaw += Math.abs(dy); }
      }
      if (cal.dyaw > 45) {
        const ppd = cal.dx / cal.dyaw;
        const est = 2 * Math.atan(f.w * Math.PI / (360 * ppd)) * 180 / Math.PI;
        if (est > 35 && est < 100) {
          const old = settings.get('hfov', 53);
          settings.set('hfov', Math.round((settings.get('hfovMeasured', false) ? old * 0.5 + est * 0.5 : est) * 2) / 2);
          settings.set('hfovMeasured', true);
          if (!sphere.active) toast(`Kamera vermessen: Blickwinkel ${settings.get('hfov')}°`);
        }
        cal.dx = 0; cal.dyaw = 0;
      }
    }
    cal.prev = f; cal.prevYaw = yaw;
  }
  if (!sphere.active || !R) return;
  const fwd = orientation.forward;
  const row = sphereRowTargets();
  const open = row.filter((t) => !t.done);
  if (!open.length) {
    sphere.row++;
    if (sphere.row >= sphere.plan.rows.length) { sphereFinish(); return; }
    vibrate([20, 40, 20]);
    return;
  }
  let best = null, bestA = 999;
  for (const t of open) { const a = angleBetween(fwd, t.dir); if (a < bestA) { bestA = a; best = t; } }
  sphere.next = best; sphere.nextA = bestA;
  const rowInfo = sphere.plan.rows[sphere.row];
  const pitchTxt = rowInfo.pitch > 89 ? 'ganz oben (Himmel/Decke)' : rowInfo.pitch < -89 ? 'ganz unten (Boden)' : rowInfo.pitch > 0 ? `oben (${Math.round(rowInfo.pitch)}°)` : rowInfo.pitch < 0 ? `unten (${Math.round(rowInfo.pitch)}°)` : 'Horizont';
  hint(`Reihe ${sphere.row + 1}/${sphere.plan.rows.length} · ${pitchTxt} · ${row.length - open.length}/${row.length} – Punkt in den Kreis bringen und ruhig halten`);
  if (bestA < 2.6 && orientation.speed < 6) {
    sphere.hold++;
    if (sphere.hold >= 6) {
      sphere.hold = 0;
      const c = document.createElement('canvas');
      const k = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
      c.width = Math.round(video.videoWidth * k); c.height = Math.round(video.videoHeight * k);
      c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
      sphere.shots.push({ img: c, R: orientation.R.slice(), target: best });
      best.done = true;
      click(); vibrate(15);
    }
  } else sphere.hold = 0;
}
function drawSphereOverlay() {
  const cx = disp.x + disp.w / 2, cy = disp.y + disp.h / 2;
  if (!sphere.active) return;
  const R = orientation.R; if (!R) return;
  const { hfov, vfov } = sphere.fov;
  const rect = { x: disp.x, y: disp.y, w: disp.w, h: disp.h };
  for (const t of sphere.plan.targets) {
    const p = project(R, t.dir, rect, hfov, vfov);
    if (!p) continue;
    const isNext = t === sphere.next, inRow = t.row === sphere.row;
    octx.beginPath();
    octx.arc(p.x, p.y, isNext ? 16 : t.done ? 7 : 9, 0, Math.PI * 2);
    if (t.done) { octx.fillStyle = 'rgba(80,220,120,.75)'; octx.fill(); }
    else { octx.fillStyle = isNext ? '#f5c542' : inRow ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.25)'; octx.fill(); }
  }
  // Zielkreis in der Mitte
  octx.lineWidth = 3;
  octx.strokeStyle = sphere.nextA < 2.6 ? '#f5c542' : 'rgba(255,255,255,.9)';
  octx.beginPath(); octx.arc(cx, cy, 26, 0, Math.PI * 2); octx.stroke();
  if (sphere.hold > 0) { octx.strokeStyle = '#f5c542'; octx.beginPath(); octx.arc(cx, cy, 32, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * sphere.hold / 6); octx.stroke(); }
  // Pfeil zum nächsten Punkt, wenn er außerhalb liegt
  if (sphere.next) {
    const p = project(R, sphere.next.dir, rect, hfov, vfov);
    const off = !p || p.x < rect.x || p.x > rect.x + rect.w || p.y < rect.y || p.y > rect.y + rect.h;
    if (off) {
      let ang;
      if (p) ang = Math.atan2(p.y - cy, p.x - cx);
      else {
        const c = [0, 0, 0];
        const d = sphere.next.dir;
        c[0] = R[0] * d[0] + R[3] * d[1] + R[6] * d[2]; c[1] = R[1] * d[0] + R[4] * d[1] + R[7] * d[2];
        ang = Math.atan2(-c[1], c[0]);
      }
      octx.save(); octx.translate(cx + Math.cos(ang) * 90, cy + Math.sin(ang) * 90); octx.rotate(ang);
      octx.fillStyle = '#f5c542'; octx.beginPath(); octx.moveTo(22, 0); octx.lineTo(-10, -14); octx.lineTo(-10, 14); octx.closePath(); octx.fill();
      octx.restore();
    }
  }
  octx.fillStyle = 'rgba(0,0,0,.5)'; octx.fillRect(disp.x + 10, disp.y + disp.h - 34, 150, 24);
  octx.fillStyle = '#fff'; octx.font = '600 13px system-ui';
  octx.fillText(`${sphere.shots.length}/${sphere.plan.targets.length} Fotos`, disp.x + 18, disp.y + disp.h - 17);
}
function sphereUndo() {
  const s = sphere.shots.pop();
  if (s) { s.target.done = false; sphere.row = Math.min(sphere.row, s.target.row); }
}
function sphereCancel() {
  sphere.active = false; sphere.shots = []; sphere.plan = null;
  $('#modes').style.visibility = '';
  hint(''); buildModeOpts(); updateShutter();
}
async function sphereFinish() {
  if (!sphere.active) return;
  const shots = sphere.shots;
  const fov = sphere.fov;
  sphere.active = false;
  $('#modes').style.visibility = '';
  hint(''); buildModeOpts(); updateShutter();
  if (shots.length < 3) { toast('Zu wenige Fotos für eine Kugel'); sphere.shots = []; return; }
  S.busy = true;
  busy('360°-Kugel wird zusammengesetzt …', 0);
  try {
    const eq = await stitchSphere(shots, fov.hfov, fov.vfov, 4096, (p) => busy(null, p * 0.9));
    let blob = await new Promise((r) => eq.toBlob(r, 'image/jpeg', 0.92));
    blob = await addPanoXmp(blob, { fullW: eq.width, fullH: eq.height, cropW: eq.width, cropH: eq.height });
    const item = await storeCapture('sphere', blob, eq, 'jpg', { shots: shots.length });
    busy(false); S.busy = false;
    openViewer(item, { onClose: refreshThumb });
  } catch (e) {
    toast('Zusammensetzen fehlgeschlagen: ' + e.message, 4000);
  } finally { S.busy = false; busy(false); sphere.shots = []; }
}

/* ---------- QR ---------- */
let qrBox = null;
function drawQrFrame() {
  const s = Math.min(disp.w, disp.h) * 0.62;
  const x = disp.x + (disp.w - s) / 2, y = disp.y + (disp.h - s) / 2;
  octx.strokeStyle = '#f5c542'; octx.lineWidth = 4;
  const L = 28;
  for (const [ax, ay, dx, dy] of [[x, y, 1, 1], [x + s, y, -1, 1], [x, y + s, 1, -1], [x + s, y + s, -1, -1]]) {
    octx.beginPath(); octx.moveTo(ax + dx * L, ay); octx.lineTo(ax, ay); octx.lineTo(ax, ay + dy * L); octx.stroke();
  }
  if (qrBox && performance.now() - qrBox.t < 1500) {
    octx.strokeStyle = '#4cd964'; octx.lineWidth = 3; octx.beginPath();
    qrBox.pts.forEach((p, i) => { const o = srcToOut(p.x, p.y); const sp = outToScreen(o.u, o.v); i ? octx.lineTo(sp.x, sp.y) : octx.moveTo(sp.x, sp.y); });
    octx.closePath(); octx.stroke();
  }
}
function onQr(res) {
  qrBox = { pts: res.points || [], t: performance.now() };
  vibrate(40);
  showQrResult(res.text, res.format);
}

/* ---------- Galerie ---------- */
async function refreshThumb() {
  const items = await listItems();
  if (items[0]?.thumb) setThumb(items[0].thumb);
  else $('#thumb img').removeAttribute('src');
}

/* ---------- Start ---------- */
function init() {
  bindFinder();
  $('#shutter').onclick = shutter;
  $('#flip').onclick = async () => {
    if (S.rec?.pausable) {
      S.rec.paused = !S.rec.paused;
      S.rec.paused ? S.rec.pause() : S.rec.resume();
      updateShutter();
      return;
    }
    if (['pano', 'pano360', 'sphere'].includes(S.mode)) { toast('Für Panoramen wird die Rückkamera benutzt'); return; }
    const f = cam.isFront ? 'environment' : 'user';
    settings.set('facing', f);
    stopLock();
    await openCamera();
  };
  $('#thumb').onclick = () => { if (!S.rec) openGallery({ onClose: refreshThumb }); };
  window.addEventListener('hardwareShutter', () => { if ($('#gallery').hidden && $('#viewer').hidden && $('#editor').hidden) shutter(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'AudioVolumeDown' || e.key === 'AudioVolumeUp') { e.preventDefault(); shutter(); } });
  window.addEventListener('resize', () => { disp.elW = 0; layoutView(); });
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) {
      if (S.rec && !pano) await stopRecording();
      cam.stop();
    } else if (!cam.stream && $('#gallery').hidden && $('#viewer').hidden && $('#editor').hidden) {
      await openCamera();
      loop();
    }
  });
  orientation.start(); // für Wasserwaage & Querformat
  buildModes(); buildTop(); buildSide(); buildModeOpts(); updateShutter();
  refreshThumb();
  openCamera().then(() => loop());
}

export function pauseCamera() { cam.stop(); }
export async function resumeCamera() { if (!cam.stream) { await openCamera(); loop(); } }

init();
