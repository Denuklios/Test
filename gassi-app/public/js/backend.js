// Datenquelle der App. Mit Server: echte gemeinsame Runden, Bewertungen und
// Live-Positionen aller Nutzer. Ohne Server (z. B. reine Datei oder statisches
// Hosting): alles lokal im Browser, Live nur zwischen Tabs + Demo-Spaziergänger.

import { DEMO_WALKERS, demoWalkerPosition } from './core.js';

export async function createBackend() {
  try {
    const r = await fetch('api/health', { cache: 'no-store' });
    if (r.ok) return new ServerBackend();
  } catch { /* kein Server erreichbar */ }
  return new LocalBackend();
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'content-type': 'application/json', ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Fehler ${res.status}`);
  return data;
}

class ServerBackend {
  constructor() { this.mode = 'server'; this.liveFns = []; this.waveFns = []; this.connect(); }

  connect() {
    this.es = new EventSource('api/live/stream');
    this.es.addEventListener('live', (e) => { const d = JSON.parse(e.data); this.liveFns.forEach((f) => f(d)); });
    this.es.addEventListener('wave', (e) => { const d = JSON.parse(e.data); this.waveFns.forEach((f) => f(d)); });
    this.es.onopen = () => this.onStatus?.(true);
    this.es.onerror = () => this.onStatus?.(false); // EventSource verbindet sich selbst neu
  }

  getRoutes() { return api('api/routes'); }
  addRoute(route) { return api('api/routes', { method: 'POST', body: route }); }
  rate(routeId, rating) { return api(`api/routes/${encodeURIComponent(routeId)}/ratings`, { method: 'POST', body: rating }); }
  sendPosition(p) { return api('api/live', { method: 'POST', body: p }).catch(() => {}); }
  stopSharing(id) { return api(`api/live/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {}); }
  wave(msg) { return api('api/live/wave', { method: 'POST', body: msg }); }
  onLive(fn) { this.liveFns.push(fn); }
  onWave(fn) { this.waveFns.push(fn); }
}

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* Speicher voll oder gesperrt */ } },
};

class LocalBackend {
  constructor() {
    this.mode = 'local';
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

  async getRoutes() {
    if (!this.demo) this.demo = await (await fetch('data/demo-routes.json')).json();
    const ratings = LS.get('gassi.ratings', {});
    return [...this.demo, ...LS.get('gassi.routes', [])].map((r) => ({ ...r, ratings: ratings[r.id] || [] }));
  }

  async addRoute(route) {
    const list = LS.get('gassi.routes', []);
    const saved = { ...route, id: 'r-' + Math.random().toString(36).slice(2, 10), source: 'nutzer', createdAt: new Date().toISOString(), busyness: new Array(24).fill(15) };
    list.push(saved);
    LS.set('gassi.routes', list);
    return { ...saved, ratings: [] };
  }

  async rate(routeId, rating) {
    const all = LS.get('gassi.ratings', {});
    const list = (all[routeId] || []).filter((r) => r.userId !== rating.userId);
    list.push({ ...rating, date: new Date().toISOString() });
    all[routeId] = list;
    LS.set('gassi.ratings', all);
    return list;
  }

  async sendPosition(p) { this.mine = { ...p, at: Date.now() }; this.bc?.postMessage({ type: 'pos', p }); }
  async stopSharing(id) { this.mine = null; this.bc?.postMessage({ type: 'stop', id }); }
  async wave(msg) { this.bc?.postMessage({ type: 'wave', msg: { ...msg, at: Date.now() } }); }
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
      people.push({ id: w.id, name: w.name, dog: w.dog, status: w.status, lat, lng, at: now, demo: true });
    }
    this.liveFns.forEach((f) => f(people));
  }
}

export { LS };
