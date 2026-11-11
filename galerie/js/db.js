// IndexedDB-Speicher: alles bleibt auf dem Gerät.
//  photos  – Metadaten, Vorschaubild, Farben, KI-Ergebnisse (ohne Original)
//  blobs   – Originaldateien (getrennt, damit die Liste schnell lädt)
//  faces   – erkannte Gesichter (Box, Merkmalsvektor, Ausschnitt, Person)
//  people  – Personen (Name, Mittelwert-Vektor)
//  meta    – Einstellungen und Zwischenspeicher
//  stickers – ausgeschnittene Sticker (PNG mit Transparenz)

const DB_NAME = 'galerie';
const VERSION = 2;
let dbPromise;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('photos')) {
        const s = db.createObjectStore('photos', { keyPath: 'id' });
        s.createIndex('hash', 'hash', { unique: false });
      }
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
      if (!db.objectStoreNames.contains('faces')) {
        const f = db.createObjectStore('faces', { keyPath: 'id' });
        f.createIndex('photoId', 'photoId', { unique: false });
      }
      if (!db.objectStoreNames.contains('people')) db.createObjectStore('people', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      if (!db.objectStoreNames.contains('stickers')) db.createObjectStore('stickers', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

async function tx(stores, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let result;
    Promise.resolve(fn(t)).then((r) => { result = r; }, reject);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const db = {
  getAll: (store) => tx(store, 'readonly', (t) => reqP(t.objectStore(store).getAll())),
  get: (store, key) => tx(store, 'readonly', (t) => reqP(t.objectStore(store).get(key))),
  put: (store, value, key) => tx(store, 'readwrite', (t) => { t.objectStore(store).put(value, key); }),
  putMany: (store, values) => tx(store, 'readwrite', (t) => { const s = t.objectStore(store); values.forEach((v) => s.put(v)); }),
  del: (store, key) => tx(store, 'readwrite', (t) => { t.objectStore(store).delete(key); }),

  async addPhoto(photo, blob) {
    return tx(['photos', 'blobs'], 'readwrite', (t) => {
      t.objectStore('photos').put(photo);
      t.objectStore('blobs').put(blob, photo.id);
    });
  },

  async hasHash(hash) {
    return tx('photos', 'readonly', (t) => reqP(t.objectStore('photos').index('hash').count(hash))).then((n) => n > 0);
  },

  /** Original holen – bei Handy-Fotos (Android-App) direkt aus dem Fotospeicher des Handys */
  async getBlob(id) {
    const p = await db.get('photos', id);
    if (p?.src && db.resolveSrc) return db.resolveSrc(p.src);
    return db.get('blobs', id);
  },
  resolveSrc: null,

  async deletePhoto(id) {
    return tx(['photos', 'blobs', 'faces'], 'readwrite', async (t) => {
      t.objectStore('photos').delete(id);
      t.objectStore('blobs').delete(id);
      const keys = await reqP(t.objectStore('faces').index('photoId').getAllKeys(id));
      keys.forEach((k) => t.objectStore('faces').delete(k));
    });
  },

  async replaceFaces(photoId, faces) {
    return tx(['faces'], 'readwrite', async (t) => {
      const s = t.objectStore('faces');
      const keys = await reqP(s.index('photoId').getAllKeys(photoId));
      keys.forEach((k) => s.delete(k));
      faces.forEach((f) => s.put(f));
    });
  },

  getMeta: (key) => db.get('meta', key),
  setMeta: (key, value) => db.put('meta', value, key),

  async clearAll() {
    const stores = ['photos', 'blobs', 'faces', 'people', 'meta', 'stickers'];
    return tx(stores, 'readwrite', (t) => {
      stores.forEach((s) => t.objectStore(s).clear());
    });
  },
};
