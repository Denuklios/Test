// Verbindung zum Freistell-Worker (SlimSAM)
import { LOCAL } from './config.js';

let worker, seq = 0;
const pending = new Map();
export const samState = { progress: 0, onProgress: null };

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./sam-worker.js' + (LOCAL ? '?local=1' : ''), import.meta.url), { type: 'module' });
    const files = {};
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') {
        files[m.file] = [m.loaded, m.total];
        const v = Object.values(files);
        samState.progress = v.reduce((s, x) => s + x[0], 0) / v.reduce((s, x) => s + x[1], 0);
        samState.onProgress?.(samState.progress);
        return;
      }
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      m.type === 'error' ? p.reject(new Error(m.error)) : p.resolve(m);
    };
  }
  return worker;
}

function call(msg) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ ...msg, id });
  });
}

/** Bild vorbereiten (einmal pro Foto) */
export const prepareImage = (blob, key) => call({ type: 'image', blob, key });
/** Masken für Punkte [[x, y, label]] (relativ 0..1) */
export const segmentAt = (points) => call({ type: 'point', points });
