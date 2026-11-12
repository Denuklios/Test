// Ablage der Aufnahmen (IndexedDB, für Galerie & Bearbeiten) und Speichern/Teilen auf dem Handy.

const cap = window.capacitorExports;
export const isNative = !!cap?.Capacitor?.isNativePlatform?.();
const Media = isNative ? cap.registerPlugin('Media') : null;

let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open('kamera', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('items', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
const tx = async (mode, fn) => {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction('items', mode);
    const out = fn(t.objectStore('items'));
    t.oncomplete = () => res(out?.result ?? out);
    t.onerror = () => rej(t.error);
  });
};

export async function addItem(item) {
  item.id = item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  item.date = item.date || Date.now();
  await tx('readwrite', (s) => s.put(item));
  return item;
}
export async function updateItem(item) { await tx('readwrite', (s) => s.put(item)); }
export async function deleteItem(id) { await tx('readwrite', (s) => s.delete(id)); }
export async function listItems() {
  const all = await tx('readonly', (s) => s.getAll());
  return (all || []).sort((a, b) => b.date - a.date);
}

export function fileName(type, ext) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const pre = { photo: 'IMG', video: 'VID', slowmo: 'ZEITLUPE', timelapse: 'ZEITRAFFER', pano: 'PANO', pano360: 'PANO360', sphere: 'KUGEL360', edit: 'IMG' }[type] || 'IMG';
  return `${pre}_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${ext}`;
}

const toBase64 = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1]);
  r.onerror = () => rej(r.error);
  r.readAsDataURL(blob);
});

async function upload(blob) {
  const id = `f${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const CH = 768 * 1024;
  for (let o = 0; o < blob.size || o === 0; o += CH) {
    await Media.append({ id, data: await toBase64(blob.slice(o, o + CH)), first: o === 0 });
    if (blob.size === 0) break;
  }
  return id;
}

/** In die Handy-Galerie (DCIM/Kamera Pro) speichern; im Browser: herunterladen */
export async function saveToPhone(blob, name) {
  const mime = blob.type || 'application/octet-stream';
  if (Media) {
    const id = await upload(blob);
    return Media.commit({ id, name, mime });
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export async function share(blob, name) {
  const mime = blob.type || 'application/octet-stream';
  if (Media) {
    const id = await upload(blob);
    return Media.share({ id, name, mime });
  }
  const file = new File([blob], name, { type: mime });
  if (navigator.canShare?.({ files: [file] })) return navigator.share({ files: [file] });
  return saveToPhone(blob, name);
}

export async function openUrl(url) {
  if (Media) return Media.openUrl({ url });
  window.open(url, '_blank');
}

/** Kleines Vorschaubild (JPEG-Blob) */
export async function makeThumb(source, size = 240) {
  const w = source.videoWidth || source.width, h = source.videoHeight || source.height;
  const k = size / Math.min(w, h);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
  c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob(r, 'image/jpeg', 0.8));
}

export async function videoThumb(blob) {
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true;
  v.src = URL.createObjectURL(blob);
  try {
    await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = rej; setTimeout(res, 3000); });
    v.currentTime = Math.min(0.2, (v.duration || 1) / 2);
    await new Promise((res) => { v.onseeked = res; setTimeout(res, 1500); });
    return v.videoWidth ? await makeThumb(v) : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(v.src);
  }
}

export const settings = {
  data: (() => {
    try { return JSON.parse(localStorage.getItem('kamera-settings') || '{}'); } catch { return {}; }
  })(),
  get(k, d) { return k in this.data ? this.data[k] : d; },
  set(k, v) { this.data[k] = v; try { localStorage.setItem('kamera-settings', JSON.stringify(this.data)); } catch { /* egal */ } },
};
