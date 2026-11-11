// Hintergrund-Analyse: Gesichter und Bildinhalte werden nach und nach erkannt.
import { store } from './store.js';
import { db } from './db.js';
import { detectFaces, assignFaces, loadFaceModels } from './faces.js';
import { initClip, embedImage, categoryVectors, tagsFor, clipState } from './smart.js';
import { sleep } from './util.js';

export const status = { faces: { todo: 0, done: 0, running: false, error: null, loading: false }, clip: { todo: 0, done: 0, running: false, error: null } };

const emit = () => store.emit('analysis', status);

export function startAnalysis() {
  runFaces();
  runClip();
}

async function runFaces() {
  const st = status.faces;
  if (st.running || !store.settings.faces) return;
  st.running = true;
  st.error = null;
  try {
    let todo = [...store.photos.values()].filter((p) => !p.done.faces);
    if (!todo.length) return;
    st.loading = true; emit();
    await loadFaceModels();
    st.loading = false;
    while (todo.length && store.settings.faces) {
      st.todo = todo.length + st.done;
      emit();
      const photo = todo.shift();
      if (!store.photos.has(photo.id)) continue;
      try {
        const faces = await detectFaces(photo);
        // Abbruch, falls das Foto inzwischen gelöscht wurde
        if (!store.photos.has(photo.id)) continue;
        await assignFaces(faces);
        await db.replaceFaces(photo.id, faces);
        faces.forEach((f) => store.faces.set(f.id, f));
        photo.faceIds = faces.map((f) => f.id);
      } catch (e) {
        console.warn('Gesichter fehlgeschlagen', photo.name, e);
        photo.faceIds = [];
      }
      photo.done.faces = true;
      await store.updatePhoto(photo);
      st.done++;
      store.emit('people');
      if (!todo.length) todo = [...store.photos.values()].filter((p) => !p.done.faces);
      await sleep(10); // Oberfläche nicht blockieren
    }
  } catch (e) {
    console.error(e);
    st.error = 'Gesichtserkennung konnte nicht geladen werden (Internet nötig beim ersten Mal).';
  } finally {
    st.running = false; st.loading = false; st.todo = 0; st.done = 0;
    emit();
  }
}

async function runClip() {
  const st = status.clip;
  if (st.running || !store.settings.smart) return;
  st.running = true;
  st.error = null;
  try {
    await initClip();
    const cv = await categoryVectors();
    store.emit('clip-ready');
    let todo = [...store.photos.values()].filter((p) => !p.done.clip);
    while (todo.length && store.settings.smart) {
      st.todo = todo.length + st.done;
      emit();
      const photo = todo.shift();
      if (!store.photos.has(photo.id)) continue;
      try {
        photo.clip = await embedImage(photo.thumb);
        photo.tags = tagsFor(photo.clip, cv);
      } catch (e) {
        console.warn('Bildanalyse fehlgeschlagen', photo.name, e);
      }
      photo.done.clip = true;
      if (store.photos.has(photo.id)) await store.updatePhoto(photo);
      st.done++;
      if (!todo.length) todo = [...store.photos.values()].filter((p) => !p.done.clip);
    }
  } catch (e) {
    console.error(e);
    st.error = 'Smarte Suche konnte nicht geladen werden (Internet nötig beim ersten Mal).';
    clipState.error = st.error;
  } finally {
    st.running = false; st.todo = 0; st.done = 0;
    emit();
  }
}

/** Analyse komplett neu (z. B. nach Modell-Update) */
export async function resetAnalysis(kind) {
  for (const p of store.photos.values()) {
    if (kind === 'faces') { p.done.faces = false; p.faceIds = []; }
    if (kind === 'clip') { p.done.clip = false; p.clip = null; p.tags = []; }
  }
  if (kind === 'faces') {
    store.faces.clear(); store.people.clear();
    const t = await Promise.all([db.getAll('faces'), db.getAll('people')]);
    for (const f of t[0]) await db.del('faces', f.id);
    for (const p of t[1]) await db.del('people', p.id);
  }
  await db.putMany('photos', [...store.photos.values()]);
  store.emit('library');
  startAnalysis();
}
