// Gesichtserkennung (face-api / TensorFlow.js, läuft lokal im Browser) und Gruppierung zu Personen.
import { store } from './store.js';
import { db } from './db.js';
import { decodeImage, scaledCanvas, canvasToBlob, uid } from './util.js';

import { LOCAL } from './config.js';

// In der Android-App liegen Bibliothek und Modelle in der App selbst, sonst kommen sie einmalig vom CDN
const CDN = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/';
const LIB = LOCAL ? new URL('../vendor/face-api/face-api.esm.js', import.meta.url).href : CDN + 'dist/face-api.esm.js';
const MODELS = LOCAL ? new URL('../vendor/face-api/model/', import.meta.url).href : CDN + 'model/';

// Abstand der Gesichts-Merkmalsvektoren: < 0.45 ist sehr wahrscheinlich dieselbe Person
export const SAME_PERSON = 0.45;
const MIN_FACE_PX = 36;

let api;
let loading;

export function loadFaceModels() {
  if (!loading) {
    loading = (async () => {
      const faceapi = await import(LIB);
      try { await faceapi.tf.setBackend('webgl'); } catch { await faceapi.tf.setBackend('cpu'); }
      await faceapi.tf.ready();
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODELS),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODELS),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODELS),
        faceapi.nets.faceExpressionNet.loadFromUri(MODELS),
      ]);
      api = faceapi;
      return faceapi;
    })();
    loading.catch(() => { loading = null; });
  }
  return loading;
}

export function distance(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
}

const center = (pts) => {
  const x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  return [x, y];
};

/** Gesichter in einem Foto finden; gibt Face-Objekte (noch ohne Person) zurück. */
export async function detectFaces(photo) {
  const faceapi = await loadFaceModels();
  const blob = await db.getBlob(photo.id);
  const bmp = await decodeImage(blob);
  const canvas = scaledCanvas(bmp, 1280);
  bmp.close?.();
  const W = canvas.width, H = canvas.height;
  const results = await faceapi
    .detectAllFaces(canvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5, maxResults: 40 }))
    .withFaceLandmarks()
    .withFaceExpressions()
    .withFaceDescriptors();

  const faces = [];
  for (const r of results) {
    const b = r.detection.box;
    if (b.width < MIN_FACE_PX) continue;
    // quadratischer Ausschnitt mit etwas Rand für die Personen-Übersicht
    const side = Math.max(b.width, b.height) * 1.6;
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    const crop = document.createElement('canvas');
    crop.width = crop.height = 160;
    crop.getContext('2d').drawImage(canvas, cx - side / 2, cy - side / 2, side, side, 0, 0, 160, 160);
    const expr = Object.entries(r.expressions).sort((a, b) => b[1] - a[1]);
    const lm = r.landmarks;
    const rel = ([x, y]) => [x / W, y / H];
    faces.push({
      id: uid(),
      photoId: photo.id,
      box: [b.x / W, b.y / H, b.width / W, b.height / H],
      score: r.detection.score,
      descriptor: new Float32Array(r.descriptor),
      crop: await canvasToBlob(crop, 'image/jpeg', 0.85),
      expr: expr[0][0],
      exprScore: expr[0][1],
      happy: r.expressions.happy || 0,
      surprised: r.expressions.surprised || 0,
      // Punkte für Sticker (Wackelaugen, Schnurrbart, Hut …)
      lm: {
        le: rel(center(lm.getLeftEye())),
        re: rel(center(lm.getRightEye())),
        nose: rel([lm.positions[33].x, lm.positions[33].y]),
        mouth: rel(center(lm.getMouth())),
        chin: rel([lm.positions[8].x, lm.positions[8].y]),
        brow: rel(center([...lm.getLeftEyeBrow(), ...lm.getRightEyeBrow()])),
      },
      personId: null,
      confirmed: false,
    });
  }
  return faces;
}

// ---------- Personen ----------

function centroid(faces) {
  const c = new Float32Array(128);
  faces.forEach((f) => f.descriptor.forEach((v, i) => { c[i] += v; }));
  for (let i = 0; i < 128; i++) c[i] /= faces.length || 1;
  return c;
}

/** Ordnet neue Gesichter vorhandenen Personen zu oder legt neue Personen an. */
export async function assignFaces(newFaces) {
  const changedPeople = new Set();
  const all = [...store.faces.values()].filter((f) => f.personId);
  for (const face of newFaces) {
    // Gesichter im selben Foto sind nie dieselbe Person
    const blocked = new Set(newFaces.filter((f) => f !== face && f.personId).map((f) => f.personId));
    let best = null, bestD = Infinity;
    for (const other of all) {
      if (blocked.has(other.personId) || other.photoId === face.photoId) continue;
      const d = distance(face.descriptor, other.descriptor);
      if (d < bestD) { bestD = d; best = other; }
    }
    if (best && bestD < SAME_PERSON) {
      face.personId = best.personId;
    } else {
      const person = { id: uid(), name: '', created: Date.now(), hidden: false };
      store.people.set(person.id, person);
      face.personId = person.id;
    }
    all.push(face);
    changedPeople.add(face.personId);
  }
  for (const pid of changedPeople) await refreshPerson(pid, newFaces);
}

async function refreshPerson(pid, extra = []) {
  const p = store.people.get(pid);
  if (!p) return;
  const faces = [...store.faces.values(), ...extra].filter((f) => f.personId === pid);
  const unique = [...new Map(faces.map((f) => [f.id, f])).values()];
  p.centroid = centroid(unique);
  // bestes (größtes, frontales) Gesicht als Titelbild
  if (!p.coverFaceId || !unique.some((f) => f.id === p.coverFaceId)) {
    p.coverFaceId = unique.sort((a, b) => b.box[2] * b.score - a.box[2] * a.score)[0]?.id;
  }
  await db.put('people', p);
}

/** Person umbenennen; gibt es den Namen schon, werden beide zusammengeführt. */
export async function renamePerson(pid, name) {
  const existing = [...store.people.values()].find((p) => p.id !== pid && p.name && p.name.toLowerCase() === name.toLowerCase());
  if (existing) { await mergePeople(pid, existing.id); return existing.id; }
  const p = store.people.get(pid);
  p.name = name;
  await db.put('people', p);
  // benannte Gesichter gelten als bestätigt
  const faces = store.facesOfPerson(pid);
  faces.forEach((f) => { f.confirmed = true; });
  await db.putMany('faces', faces);
  store.emit('people');
  return pid;
}

export async function mergePeople(fromId, intoId) {
  if (fromId === intoId) return;
  const faces = store.facesOfPerson(fromId);
  faces.forEach((f) => { f.personId = intoId; });
  await db.putMany('faces', faces);
  store.people.delete(fromId);
  await db.del('people', fromId);
  await refreshPerson(intoId);
  store.emit('people');
}

/** Ein Gesicht einer anderen (oder neuen) Person zuordnen */
export async function moveFace(faceId, targetName) {
  const face = store.faces.get(faceId);
  const oldPid = face.personId;
  let target = [...store.people.values()].find((p) => p.name && p.name.toLowerCase() === targetName.toLowerCase());
  if (!target) {
    target = { id: uid(), name: targetName, created: Date.now(), hidden: false };
    store.people.set(target.id, target);
  }
  face.personId = target.id;
  face.confirmed = true;
  await db.put('faces', face);
  await refreshPerson(target.id);
  await cleanupPerson(oldPid);
  store.emit('people');
}

/** Gesicht von seiner Person lösen (z. B. falsch erkannt) */
export async function detachFace(faceId) {
  const face = store.faces.get(faceId);
  const oldPid = face.personId;
  const person = { id: uid(), name: '', created: Date.now(), hidden: false };
  store.people.set(person.id, person);
  face.personId = person.id;
  face.confirmed = false;
  await db.put('faces', face);
  await refreshPerson(person.id);
  await cleanupPerson(oldPid);
  store.emit('people');
}

async function cleanupPerson(pid) {
  if (!pid) return;
  if (store.facesOfPerson(pid).length === 0) {
    store.people.delete(pid);
    await db.del('people', pid);
  } else await refreshPerson(pid);
}

/** Unbenannte Gesichter neu gruppieren (benannte bleiben unverändert). */
export async function regroupFaces() {
  const named = new Set([...store.people.values()].filter((p) => p.name).map((p) => p.id));
  const loose = [...store.faces.values()].filter((f) => !named.has(f.personId));
  for (const [id, p] of store.people) if (!named.has(id)) { store.people.delete(id); await db.del('people', id); }
  loose.forEach((f) => { f.personId = null; });
  // Gesichter fotoweise einsortieren, damit die "nicht im selben Foto"-Regel greift
  const byPhoto = new Map();
  loose.forEach((f) => { if (!byPhoto.has(f.photoId)) byPhoto.set(f.photoId, []); byPhoto.get(f.photoId).push(f); });
  for (const faces of byPhoto.values()) await assignFaces(faces);
  await db.putMany('faces', loose);
  store.emit('people');
}

/** Paare ähnlich aussehender, aber verschiedener Personen (für den Doppelgänger-Spaß) */
export function lookalikes(limit = 12) {
  const people = store.peopleList().filter((p) => p.centroid);
  const pairs = [];
  for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) {
    pairs.push({ a: people[i], b: people[j], d: distance(people[i].centroid, people[j].centroid) });
  }
  return pairs.sort((x, y) => x.d - y.d).slice(0, limit);
}
