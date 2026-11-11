// Zustand der App im Speicher + einfache Ereignisse, damit Ansichten sich aktualisieren.
import { db } from './db.js';

class Store extends EventTarget {
  photos = new Map(); // id -> photo
  faces = new Map(); // id -> face
  people = new Map(); // id -> person
  settings = { faces: true, smart: true, cols: 4 };

  async load() {
    const [photos, faces, people, settings] = await Promise.all([
      db.getAll('photos'), db.getAll('faces'), db.getAll('people'), db.getMeta('settings'),
    ]);
    photos.forEach((p) => this.photos.set(p.id, p));
    faces.forEach((f) => this.faces.set(f.id, f));
    people.forEach((p) => this.people.set(p.id, p));
    if (settings) Object.assign(this.settings, settings);
  }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  on(type, fn) { this.addEventListener(type, (e) => fn(e.detail)); }

  saveSettings() { db.setMeta('settings', this.settings); this.emit('settings'); }

  /** Fotos nach Datum sortiert (neueste zuerst) */
  sorted() {
    return [...this.photos.values()].sort((a, b) => b.date - a.date);
  }

  facesOf(photoId) {
    const p = this.photos.get(photoId);
    return (p?.faceIds || []).map((id) => this.faces.get(id)).filter(Boolean);
  }

  facesOfPerson(personId) {
    return [...this.faces.values()].filter((f) => f.personId === personId);
  }

  photosOfPerson(personId) {
    const ids = new Set(this.facesOfPerson(personId).map((f) => f.photoId));
    return this.sorted().filter((p) => ids.has(p.id));
  }

  personName(id) {
    return this.people.get(id)?.name || '';
  }

  /** Personen mit Namen oder mehreren Fotos zuerst */
  peopleList() {
    const counts = new Map();
    for (const f of this.faces.values()) if (f.personId) counts.set(f.personId, (counts.get(f.personId) || 0) + 1);
    return [...this.people.values()]
      .map((p) => ({ ...p, count: counts.get(p.id) || 0 }))
      .filter((p) => p.count > 0 && !p.hidden)
      .sort((a, b) => (!!b.name - !!a.name) || b.count - a.count);
  }

  async updatePhoto(p) {
    this.photos.set(p.id, p);
    await db.put('photos', p);
    this.emit('photo', p);
  }
}

export const store = new Store();
