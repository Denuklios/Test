// Nur in der Android-App: Zugriff auf die Fotos des Handys (über das eigene Modul "DeviceGallery").
import { db } from './db.js';
import { store } from './store.js';
import { nativeIO, toast } from './util.js';

const cap = window.capacitorExports;
export const isNative = !!cap?.Capacitor?.isNativePlatform?.();
const Gallery = isNative ? cap.registerPlugin('DeviceGallery') : null;

const toBase64 = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1]);
  r.onerror = rej;
  r.readAsDataURL(blob);
});

if (isNative) {
  nativeIO.save = async (blob, name) => {
    try {
      await Gallery.saveImage({ data: await toBase64(blob), name, mime: blob.type || 'image/jpeg' });
      toast('In der Handy-Galerie gespeichert (Bilder/Fotogalerie)');
      // neues Bild gleich in die App übernehmen
      setTimeout(() => syncDevice().catch(() => {}), 800);
    } catch (e) { toast('Speichern fehlgeschlagen: ' + e.message); }
  };
  nativeIO.share = async (blob, name) => {
    try { await Gallery.shareImage({ data: await toBase64(blob), name, mime: blob.type || 'image/jpeg' }); } catch (e) { toast('Teilen fehlgeschlagen: ' + e.message); }
  };
  // Originalbilder direkt aus dem Fotospeicher lesen (content://… → https://localhost/_capacitor_content_/…)
  db.resolveSrc = async (uri) => {
    const res = await fetch(cap.Capacitor.convertFileSrc(uri));
    if (!res.ok) throw new Error('Foto nicht mehr vorhanden');
    return res.blob();
  };
}

export async function hasAccess() {
  if (!isNative) return false;
  return (await Gallery.checkAccess()).granted;
}

export async function requestAccess() {
  if (!isNative) return false;
  return (await Gallery.requestAccess()).granted;
}

/** Liste aller Fotos auf dem Handy, neueste zuerst */
export async function listDevicePhotos() {
  const { photos } = await Gallery.list();
  return photos.map((p) => ({
    uri: p.uri,
    name: p.name,
    size: p.size,
    date: p.date,
    hash: `dev|${p.id}`,
    blob: () => db.resolveSrc(p.uri),
  }));
}

/** Handy-Fotos abgleichen: neue aufnehmen, auf dem Handy gelöschte entfernen */
export async function syncDevice(onProgress) {
  const items = await listDevicePhotos();
  const present = new Set(items.map((i) => i.uri));
  const gone = [...store.photos.values()].filter((p) => p.src && !present.has(p.src));
  if (gone.length) {
    const { deletePhotos } = await import('./app.js');
    await deletePhotos(gone, { silent: true, forget: true });
  }
  const { importDevice } = await import('./importer.js');
  return importDevice(items, onProgress);
}
