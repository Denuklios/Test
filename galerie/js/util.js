// Kleine Hilfsfunktionen für DOM, Datum, Bilder und Dialoge
import { icon } from './icons.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** el('div', {class: 'x', onclick: fn}, 'Text', otherNode) */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'class') node.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'html') node.innerHTML = v;
    else if (k in node && typeof v !== 'string') node[k] = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

export function fmtDate(ms, withTime = false) {
  const d = new Date(ms);
  const s = d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
  return withTime ? s + ', ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : s;
}

export function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 ** 2) return (n / 1024).toFixed(0) + ' KB';
  if (n < 1024 ** 3) return (n / 1024 ** 2).toFixed(1) + ' MB';
  return (n / 1024 ** 3).toFixed(2) + ' GB';
}

// Objekt-URLs für Blobs zwischenspeichern (Vorschaubilder werden oft gebraucht)
const urlCache = new WeakMap();
export function blobUrl(blob) {
  if (!blob) return '';
  let u = urlCache.get(blob);
  if (!u) { u = URL.createObjectURL(blob); urlCache.set(blob, u); }
  return u;
}

/** Bild aus einem Blob dekodieren (EXIF-Drehung wird berücksichtigt). Fallback über <img>, z. B. für HEIC in Safari. */
export async function decodeImage(blob) {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      return await createImageBitmap(img);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** Zeichnet ein Bild verkleinert in ein Canvas (längste Kante = max). */
export function scaledCanvas(src, max) {
  const w = src.width, h = src.height;
  const s = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * s));
  c.height = Math.max(1, Math.round(h * s));
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

export const canvasToBlob = (c, type = 'image/jpeg', q = 0.85) => new Promise((r) => c.toBlob(r, type, q));

// In der Android-App werden Speichern/Teilen nativ erledigt (siehe native.js)
export const nativeIO = { save: null, share: null };

/** Teilen (Android-Teilen-Menü / Web Share), sonst herunterladen */
export async function shareBlob(blob, name) {
  if (nativeIO.share) return nativeIO.share(blob, name);
  const file = new File([blob], name, { type: blob.type || 'image/jpeg' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  download(blob, name);
}

export function download(blobOrUrl, name) {
  if (nativeIO.save && typeof blobOrUrl !== 'string') { nativeIO.save(blobOrUrl, name); return; }
  const url = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  if (typeof blobOrUrl !== 'string') setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ---------- Toast ----------
let toastTimer;
export function toast(msg, ms = 2600) {
  let t = $('#toast');
  if (!t) { t = el('div', { id: 'toast', role: 'status' }); document.body.append(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

// ---------- Modale Dialoge ----------
export function modal({ title, body, actions = [], wide = false, onClose }) {
  return new Promise((resolve) => {
    const close = (v) => { dlg.close(); dlg.remove(); onClose?.(); resolve(v); };
    const dlg = el('dialog', { class: 'modal' + (wide ? ' wide' : '') },
      title && el('h2', {}, title),
      el('div', { class: 'modal-body' }, body),
      el('div', { class: 'modal-actions' }, actions.map((a) =>
        el('button', { class: 'btn ' + (a.primary ? 'primary' : a.danger ? 'danger' : ''), onclick: () => close(typeof a.value === 'function' ? a.value() : a.value !== undefined ? a.value : a.label) }, a.icon && icon(a.icon), a.label))),
    );
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(null); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) close(null); });
    document.body.append(dlg);
    dlg.showModal();
    dlg._close = close;
  });
}

export function confirmDialog(text, okLabel = 'OK', danger = false) {
  return modal({
    title: text,
    actions: [{ label: 'Abbrechen', value: () => false }, { label: okLabel, value: () => true, primary: !danger, danger }],
  });
}

export function promptDialog(title, value = '', placeholder = '', suggestions = []) {
  const input = el('input', { type: 'text', value, placeholder, class: 'input', autocomplete: 'off' });
  const listId = 'dl' + uid();
  if (suggestions.length) {
    input.setAttribute('list', listId);
  }
  const body = el('div', {}, input, suggestions.length && el('datalist', { id: listId }, suggestions.map((s) => el('option', { value: s }))));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.closest('dialog')._close(input.value.trim()); }
  });
  setTimeout(() => { input.focus(); input.select(); }, 30);
  return modal({
    title, body,
    actions: [{ label: 'Abbrechen', value: () => null }, { label: 'OK', primary: true, value: () => input.value.trim() }],
  });
}

// ---------- Farben ----------
export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

export const COLOR_NAMES = [
  { id: 'rot', label: 'Rot', css: '#e53935' },
  { id: 'orange', label: 'Orange', css: '#fb8c00' },
  { id: 'gelb', label: 'Gelb', css: '#fdd835' },
  { id: 'gruen', label: 'Grün', css: '#43a047' },
  { id: 'tuerkis', label: 'Türkis', css: '#00acc1' },
  { id: 'blau', label: 'Blau', css: '#1e88e5' },
  { id: 'lila', label: 'Lila', css: '#8e24aa' },
  { id: 'pink', label: 'Pink', css: '#ec407a' },
  { id: 'braun', label: 'Braun', css: '#795548' },
  { id: 'schwarz', label: 'Dunkel', css: '#222' },
  { id: 'weiss', label: 'Hell', css: '#f5f5f5' },
  { id: 'grau', label: 'Grau', css: '#9e9e9e' },
];

export function colorNameOf(h, s, l) {
  if (l < 0.16) return 'schwarz';
  if (l > 0.86) return 'weiss';
  if (s < 0.18) return 'grau';
  if (h >= 10 && h < 45 && l < 0.42 && s < 0.65) return 'braun';
  if (h < 15 || h >= 345) return 'rot';
  if (h < 42) return 'orange';
  if (h < 70) return 'gelb';
  if (h < 160) return 'gruen';
  if (h < 200) return 'tuerkis';
  if (h < 255) return 'blau';
  if (h < 290) return 'lila';
  return 'pink';
}

/** Ermittelt Durchschnittsfarbe, 3x3-Farbraster (für das Mosaik) und dominante Farbe eines Bildes. */
export function analyzeColors(src) {
  const N = 24;
  const c = document.createElement('canvas');
  c.width = N; c.height = N;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  // quadratischer Ausschnitt aus der Mitte – so wie die Mosaik-Kacheln später aussehen
  const side = Math.min(src.width, src.height);
  ctx.drawImage(src, (src.width - side) / 2, (src.height - side) / 2, side, side, 0, 0, N, N);
  const d = ctx.getImageData(0, 0, N, N).data;
  const grid = new Array(27).fill(0);
  let R = 0, G = 0, B = 0;
  const buckets = {};
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    R += r; G += g; B += b;
    const gi = (Math.floor(y / 8) * 3 + Math.floor(x / 8)) * 3;
    grid[gi] += r; grid[gi + 1] += g; grid[gi + 2] += b;
    const [h, s, l] = rgbToHsl(r, g, b);
    const name = colorNameOf(h, s, l);
    // farbige Pixel zählen stärker als graue, damit "rotes Auto" eher rot wird als grau
    buckets[name] = (buckets[name] || 0) + 0.3 + s * (1 - Math.abs(l - 0.5));
  }
  const n = N * N;
  for (let i = 0; i < 27; i++) grid[i] = Math.round(grid[i] / 64);
  const avg = [Math.round(R / n), Math.round(G / n), Math.round(B / n)];
  const dominant = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0][0];
  const [hue, sat, lig] = rgbToHsl(...avg);
  return { avg, grid, dominant, hue, sat, lig };
}

export function relTime(ms) {
  const years = new Date().getFullYear() - new Date(ms).getFullYear();
  if (years <= 0) return 'Dieses Jahr';
  return years === 1 ? 'Vor 1 Jahr' : `Vor ${years} Jahren`;
}
