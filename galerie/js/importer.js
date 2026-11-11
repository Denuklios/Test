// Fotos importieren: Vorschaubild, Farben und Aufnahmedatum ermitteln und speichern.
import { db } from './db.js';
import { store } from './store.js';
import { readExif } from './exif.js';
import { decodeImage, scaledCanvas, canvasToBlob, analyzeColors, uid, toast } from './util.js';

const IMAGE_RE = /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i;

export async function importFiles(fileList, onProgress) {
  const files = [...fileList].filter((f) => f.type.startsWith('image/') || IMAGE_RE.test(f.name));
  let added = 0, skipped = 0, failed = 0;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    onProgress?.(i, files.length, f.name);
    const hash = `${f.name}|${f.size}|${f.lastModified}`;
    if (await db.hasHash(hash)) { skipped++; continue; }
    try {
      const photo = await makePhoto(f, hash);
      await db.addPhoto(photo, f);
      store.photos.set(photo.id, photo);
      added++;
      store.emit('added', photo);
    } catch (e) {
      console.warn('Import fehlgeschlagen', f.name, e);
      failed++;
    }
  }
  onProgress?.(files.length, files.length, '');
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  const parts = [`${added} Foto${added === 1 ? '' : 's'} hinzugefügt`];
  if (skipped) parts.push(`${skipped} schon vorhanden`);
  if (failed) parts.push(`${failed} nicht lesbar`);
  toast(parts.join(' · '));
  store.emit('library');
  return added;
}

/** Fotos direkt vom Handy (Android-App): werden nur verknüpft, nicht kopiert. items: [{uri, name, size, date, blob()}] */
export async function importDevice(items, onProgress) {
  const ignored = new Set((await db.getMeta('ignored')) || []);
  const known = new Set([...store.photos.values()].map((p) => p.hash));
  let added = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (i % 5 === 0) onProgress?.(i, items.length);
    if (ignored.has(it.hash) || known.has(it.hash)) continue;
    try {
      const blob = await it.blob();
      const photo = await makePhoto(new File([blob], it.name, { type: blob.type, lastModified: it.date }), it.hash, it.date);
      photo.src = it.uri;
      await db.put('photos', photo);
      store.photos.set(photo.id, photo);
      added++;
      if (added % 12 === 1) store.emit('library');
    } catch (e) {
      console.warn('Handy-Foto nicht lesbar', it.name, e);
    }
  }
  onProgress?.(items.length, items.length);
  store.emit('library');
  return added;
}

async function makePhoto(file, hash, knownDate) {
  const [bmp, exif] = await Promise.all([decodeImage(file), readExif(file)]);
  const thumbCanvas = scaledCanvas(bmp, 480);
  const thumb = await canvasToBlob(thumbCanvas, 'image/jpeg', 0.82);
  const colors = analyzeColors(thumbCanvas);
  const photo = {
    id: uid(),
    hash,
    name: file.name,
    size: file.size,
    type: file.type,
    w: bmp.width,
    h: bmp.height,
    date: exif.date || knownDate || file.lastModified || Date.now(),
    added: Date.now(),
    camera: [exif.make, exif.model].filter(Boolean).join(' ') || null,
    gps: exif.gps || null,
    thumb,
    color: colors.avg,
    grid: colors.grid,
    colorName: colors.dominant,
    hue: colors.hue,
    sat: colors.sat,
    lig: colors.lig,
    fav: false,
    faceIds: [],
    clip: null,
    tags: [],
    done: { faces: false, clip: false },
  };
  bmp.close?.();
  return photo;
}
