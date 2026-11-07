// Datenquelle der App. Mit Server: Konten, gemeinsame Runden, Bewertungen und
// Live-Positionen aller angemeldeten Nutzer. Ohne Server (statisches Hosting):
// alles lokal im Browser, ein lokales Profil statt Konto, Live nur zwischen
// Tabs + Demo-Spaziergänger.

import { DEMO_WALKERS, demoWalkerPosition } from './core.js';

export async function createBackend() {
  // 1. Node-Server (server.js): /api/…   2. PHP-Webspace (php/api.php): api.php?p=…
  for (const [url, toUrl] of [
    ['api/health', (p) => `api/${p}`],
    ['api.php?p=health', (p) => `api.php?p=${p.replace('?', '&')}`],
  ]) {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      const info = r.ok ? await r.json().catch(() => null) : null;
      if (info?.ok) return new ServerBackend(toUrl, info.live === 'poll');
    } catch { /* nächste Möglichkeit */ }
  }
  return new LocalBackend();
}

let toUrl = (p) => `api/${p}`;

async function api(path, opts = {}) {
  const res = await fetch(toUrl(path.replace(/^api\//, '')), {
    ...opts,
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...(opts.headers || {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : (opts.method && opts.method !== 'GET' ? '{}' : undefined),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Fehler ${res.status}`), { status: res.status });
  return data;
}

class ServerBackend {
  constructor(urlFn, poll) {
    toUrl = urlFn;
    this.mode = 'server'; this.accounts = true; this.poll = poll;
    this.liveFns = []; this.waveFns = []; this.es = null; this.timer = null;
  }

  // Konto
  async me() { return (await api('api/auth/me')).user; }
  async register(data) { return (await api('api/auth/register', { method: 'POST', body: data })).user; }
  async login(email, password) { return (await api('api/auth/login', { method: 'POST', body: { email, password } })).user; }
  async logout() { this.disconnect(); await api('api/auth/logout', { method: 'POST' }); }
  async updateProfile(p) { return (await api('api/me', { method: 'PATCH', body: p })).user; }
  changePassword(current, next) { return api('api/me/password', { method: 'POST', body: { current, next } }); }
  async deleteAccount(password) { this.disconnect(); await api('api/me', { method: 'DELETE', body: { password } }); }
  getWalks() { return api('api/me/walks'); }
  addWalk(w) { return api('api/me/walks', { method: 'POST', body: w }); }

  // Live (nur angemeldet)
  connect() {
    if (this.poll) {
      // PHP-Webspace: alle 3 Sekunden abfragen (im Hintergrund-Tab seltener)
      if (this.timer) return;
      const tick = async () => {
        try {
          const d = await api('live/poll');
          this.liveFns.forEach((f) => f(d.people));
          d.waves.forEach((w) => this.waveFns.forEach((f) => f(w)));
        } catch (e) { if (e.status === 401) { this.disconnect(); return; } }
        this.timer = setTimeout(tick, document.hidden ? 15000 : 3000);
      };
      this.timer = setTimeout(tick, 0);
      return;
    }
    if (this.es) return;
    this.es = new EventSource(toUrl('live/stream'));
    this.es.addEventListener('live', (e) => { const d = JSON.parse(e.data); this.liveFns.forEach((f) => f(d)); });
    this.es.addEventListener('wave', (e) => { const d = JSON.parse(e.data); this.waveFns.forEach((f) => f(d)); });
  }
  disconnect() {
    this.es?.close(); this.es = null;
    clearTimeout(this.timer); this.timer = null;
    this.liveFns.forEach((f) => f([]));
  }

  // Runden
  /** Runden: eigene + vorgefertigte, dazu OpenStreetMap-Runden im Umkreis von r km um near. */
  getRoutes(near) {
    return api(near ? `routes?lat=${near.lat.toFixed(4)}&lng=${near.lng.toFixed(4)}&r=${Math.round(near.r)}` : 'routes');
  }
  addRoute(route) { return api('api/routes', { method: 'POST', body: route }); }
  deleteRoute(id) { return api(`api/routes/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
  rate(routeId, rating) { return api(`api/routes/${encodeURIComponent(routeId)}/ratings`, { method: 'POST', body: rating }); }
  sendPosition(p) { return api('api/live', { method: 'POST', body: p }).catch(() => {}); }
  stopSharing() { return api('api/live', { method: 'DELETE' }).catch(() => {}); }
  wave(to) { return api('api/live/wave', { method: 'POST', body: { to } }); }

  // Treffen und Chat
  meetups(q = {}) { return api('meetups?' + new URLSearchParams(q).toString()); }
  meetup(id) { return api(`meetups/${encodeURIComponent(id)}`); }
  createMeetup(b) { return api('meetups', { method: 'POST', body: b }); }
  joinMeetup(id) { return api(`meetups/${encodeURIComponent(id)}/join`, { method: 'POST' }); }
  leaveMeetup(id) { return api(`meetups/${encodeURIComponent(id)}/join`, { method: 'DELETE' }); }
  cancelMeetup(id) { return api(`meetups/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
  messages(id, after = 0) { return api(`meetups/${encodeURIComponent(id)}/messages?after=${after}`); }
  sendMessage(id, text) { return api(`meetups/${encodeURIComponent(id)}/messages`, { method: 'POST', body: { text } }); }
  onLive(fn) { this.liveFns.push(fn); }
  onWave(fn) { this.waveFns.push(fn); }
}

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* Speicher voll oder gesperrt */ } },
};

class LocalBackend {
  constructor() {
    this.mode = 'local'; this.accounts = false;
    this.liveFns = []; this.waveFns = [];
    this.mine = null; // eigene geteilte Position
    this.others = new Map(); // aus anderen Tabs
    try {
      this.bc = new BroadcastChannel('gassi-live');
      this.bc.onmessage = ({ data }) => {
        if (data.type === 'pos') this.others.set(data.p.id, { ...data.p, at: Date.now() });
        if (data.type === 'stop') this.others.delete(data.id);
        if (data.type === 'wave') this.waveFns.forEach((f) => f(data.msg));
      };
    } catch { this.bc = null; }
    setInterval(() => this.emit(), 3000);
  }

  // Lokales Profil statt Konto
  async me() {
    let p = LS.get('gassi.localUser', null);
    if (!p) { p = { id: 'u-' + Math.random().toString(36).slice(2, 12), name: '', dog: '', dogAge: 'erwachsen', email: '' }; LS.set('gassi.localUser', p); }
    return p;
  }
  async updateProfile(patch) { const p = { ...(await this.me()), ...patch }; LS.set('gassi.localUser', p); return p; }
  async getWalks() { return LS.get('gassi.history', []); }
  async addWalk(w) { const h = LS.get('gassi.history', []); h.unshift(w); LS.set('gassi.history', h.slice(0, 1000)); return w; }
  connect() {}
  disconnect() {}

  async getRoutes() {
    if (!this.demo) this.demo = await (await fetch('data/demo-routes.json')).json();
    const ratings = LS.get('gassi.ratings', {});
    return [...this.demo, ...LS.get('gassi.routes', [])].map((r) => ({ ...r, ratings: ratings[r.id] || [] }));
  }

  async addRoute(route) {
    const me = await this.me();
    const list = LS.get('gassi.routes', []);
    const saved = { ...route, id: 'r-' + Math.random().toString(36).slice(2, 10), source: 'nutzer', authorId: me.id, author: me.name || 'Ich', createdAt: new Date().toISOString(), busyness: new Array(24).fill(15) };
    list.push(saved);
    LS.set('gassi.routes', list);
    return { ...saved, ratings: [] };
  }

  async deleteRoute(id) { LS.set('gassi.routes', LS.get('gassi.routes', []).filter((r) => r.id !== id)); }

  async rate(routeId, rating) {
    const me = await this.me();
    const all = LS.get('gassi.ratings', {});
    const list = (all[routeId] || []).filter((r) => r.userId !== me.id);
    list.push({ ...rating, userId: me.id, name: me.name || 'Ich', dog: me.dog, date: new Date().toISOString() });
    all[routeId] = list;
    LS.set('gassi.ratings', all);
    return list;
  }

  async sendPosition(p) {
    const me = await this.me();
    const full = { ...p, id: me.id, name: me.name || 'Jemand', dog: me.dog };
    this.mine = { ...full, at: Date.now() };
    this.bc?.postMessage({ type: 'pos', p: full });
  }
  async stopSharing() { const me = await this.me(); this.mine = null; this.bc?.postMessage({ type: 'stop', id: me.id }); }
  async meetups() { return []; }
  async createMeetup() { throw new Error('Treffen gibt es nur mit Server.'); }
  async wave(to) { const me = await this.me(); this.bc?.postMessage({ type: 'wave', msg: { to, from: me.id, fromName: me.name || 'Jemand', fromDog: me.dog, text: 'Lust auf eine gemeinsame Runde?', at: Date.now() } }); }
  onLive(fn) { this.liveFns.push(fn); this.emit(); }
  onWave(fn) { this.waveFns.push(fn); }

  async emit() {
    if (!this.demo) await this.getRoutes();
    const now = Date.now();
    for (const [id, p] of this.others) if (now - p.at > 120000) this.others.delete(id);
    const people = [...this.others.values()];
    if (this.mine) people.push(this.mine);
    for (const w of DEMO_WALKERS) {
      const route = this.demo.find((r) => r.id === w.route);
      if (!route) continue;
      const [lat, lng] = demoWalkerPosition(w, route, now);
      people.push({ id: w.id, name: w.name, dog: w.dog, dogBreed: w.dogBreed, dogYears: w.dogYears, languages: w.languages, status: w.status, lat, lng, at: now, demo: true });
    }
    this.liveFns.forEach((f) => f(people));
  }
}

export { LS };
