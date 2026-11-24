/* Verbindungen zwischen Objekten:
   - Ein-/Ausstiegspunkte so wählen, dass die Wege zum nächsten Objekt am kürzesten sind ("kürzeste Verbindung")
   - versteckte Laufstiche (Unterwege) unter später gestickten Flächen/Säulen statt Fadenschnitt
   - Reihenfolge innerhalb einer Farbe optimieren */
(function (g) {
  const HW = (g.HW = g.HW || {});
  const G = HW.geo;

  const isCol = (o) => o.type === 'colA' || o.type === 'colB' || o.type === 'colC';
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  // Nächster Punkt auf dem Umriss einer Fläche
  function nearestOnOutline(o, p) {
    const ring = HW.stitch.fillRings(o)[0];
    const r = G.nearestOnRing(p, ring);
    return G.lerp(ring[r.seg], ring[(r.seg + 1) % ring.length], r.t);
  }

  function isRingColA(o) {
    const n = o.points.length;
    return n >= 6 && G.dist(o.points[0], o.points[n - 2]) < 0.2 && G.dist(o.points[1], o.points[n - 1]) < 0.2;
  }

  /** Mögliche Varianten (Ein-/Ausstieg) eines Objekts. prev = Ausstieg des vorigen Objekts */
  function options(o, prev) {
    if (o.type === 'manual' || o.fixedDir || !o.points || o.points.length < 2) return [{ route: null, entry: firstPt(o), exit: lastPt(o) }];
    if (o.type === 'colA') {
      const n = o.points.length;
      const s = mid(o.points[0], o.points[1]), e = mid(o.points[n - 2], o.points[n - 1]);
      if (isRingColA(o)) return [{ route: null, entry: s, exit: e }];
      // zusätzlich hin und zurück (Unterlage hin, Deckstich zurück): Aus- = Einstieg
      return [{ route: { rev: false }, entry: s, exit: e }, { route: { rev: true }, entry: e, exit: s },
        { route: { rev: false, back: true }, entry: s, exit: s, back: true }, { route: { rev: true, back: true }, entry: e, exit: e, back: true }];
    }
    if (o.type === 'colB' && o.side2 && o.side2.length) {
      const L = o.points, R = o.side2;
      const sameDir = G.dist(L[0], R[0]) + G.dist(L[L.length - 1], R[R.length - 1]) <= G.dist(L[0], R[R.length - 1]) + G.dist(L[L.length - 1], R[0]);
      const s = mid(L[0], sameDir ? R[0] : R[R.length - 1]), e = mid(L[L.length - 1], sameDir ? R[R.length - 1] : R[0]);
      return [{ route: { rev: false }, entry: s, exit: e }, { route: { rev: true }, entry: e, exit: s }];
    }
    if (o.type === 'run' && o.params.closed) {
      let bi = 0;
      if (prev) o.points.forEach((q, i) => { if (G.dist(q, prev) < G.dist(o.points[bi], prev)) bi = i; });
      return [{ route: { rot: bi }, entry: o.points[bi], exit: o.points[bi] }];
    }
    if (o.type === 'run' || o.type === 'colC') {
      const s = o.points[0], e = o.points[o.points.length - 1];
      return [{ route: { rev: false }, entry: s, exit: e }, { route: { rev: true }, entry: e, exit: s }];
    }
    if (o.type === 'fill') {
      const en = prev ? nearestOnOutline(o, prev) : o.points[0];
      return [{ route: { entry: { x: +en.x.toFixed(2), y: +en.y.toFixed(2) } }, entry: en, exit: en, fill: true }];
    }
    return [{ route: null, entry: firstPt(o), exit: lastPt(o) }];
  }
  const firstPt = (o) => (o.type === 'manual' ? o.stitches[0] : o.points[0]);
  const lastPt = (o) => (o.type === 'manual' ? o.stitches[o.stitches.length - 1] : o.points[o.points.length - 1]);

  // Abstand vom Punkt zum günstigsten Einstieg des nächsten Objekts
  function nextCost(next, p) {
    if (!next) return 0;
    if (next.type === 'fill') return G.dist(p, nearestOnOutline(next, p));
    return Math.min(...options(next, p).map((v) => G.dist(p, v.entry)));
  }

  /** Wählt Ein-/Ausstieg für o. Rückgabe: route-Objekt (oder null) */
  function choose(o, prevExit, next, nextSameColor) {
    const opts = options(o, prevExit);
    if (opts.length === 1) return opts[0].route;
    const w = nextSameColor ? 0.8 : 0.2;
    let best = opts[0], bc = Infinity;
    for (const v of opts) {
      const c = (prevExit ? G.dist(prevExit, v.entry) : 0) + w * nextCost(next, v.exit);
      if (c < bc - 1e-6) { bc = c; best = v; }
    }
    return best.route;
  }

  /**
   * Plant Ein-/Ausstiege für die ganze Kette auf einmal (Viterbi): minimiert die Summe aller Verbindungswege.
   * Verbindungen zu einer anderen Farbe zählen weniger (dort wird ohnehin geschnitten).
   * Rückgabe: route je Objekt (gleiche Reihenfolge wie objs)
   */
  function plan(objs, settings = {}) {
    const n = objs.length;
    if (!n) return [];
    const opts = objs.map((o) => options(o, null));
    // Abdeckflächen ab Objekt i bis zum Ende seines Farbblocks: dort darf ein Laufweg versteckt liegen
    const lk = { trimDist: settings.trimDist ?? 2, trimCost: settings.trimCost ?? 25 };
    const coversFrom = new Array(n);
    for (let i = n - 1; i >= 0; i--) {
      const sameNext = i + 1 < n && objs[i + 1].color === objs[i].color;
      const c = objs[i].hidden ? null : coverOf(objs[i]);
      coversFrom[i] = (c ? [c] : []).concat(sameNext ? coversFrom[i + 1] : []);
    }
    const link = (i, a, b) => (objs[i - 1].color === objs[i].color ? linkCost(a, b, coversFrom[i], lk) : 0.15 * G.dist(a, b));
    // Kosten/Herkunft je Zustand; dyn = dynamischer Einstieg (Flächen, geschlossene Läufe)
    const cost = [], back = [], st = [];
    const dyn = (o) => o.type === 'fill' || (o.type === 'run' && o.params && o.params.closed && !o.fixedDir);
    for (let i = 0; i < n; i++) {
      const o = objs[i];
      cost.push([]); back.push([]); st.push([]);
      const nopt = dyn(o) && i > 0 ? st[i - 1].length : opts[i].length;
      for (let k = 0; k < nopt; k++) {
        let best = Infinity, bj = -1, state = null;
        if (i === 0) { best = 0; state = opts[0][k]; }
        else if (dyn(o)) {
          // Einstieg hängt vom Vorgänger-Zustand k ab
          const pe = st[i - 1][k].exit;
          const v = options(o, pe)[0];
          best = cost[i - 1][k] + link(i, pe, v.entry); bj = k; state = v;
        } else {
          const v = opts[i][k];
          for (let j = 0; j < st[i - 1].length; j++) {
            const c = cost[i - 1][j] + link(i, st[i - 1][j].exit, v.entry);
            if (c < best) { best = c; bj = j; }
          }
          state = v;
        }
        cost[i].push(best); back[i].push(bj); st[i].push(state);
      }
    }
    let k = 0;
    cost[n - 1].forEach((c, j) => { if (c < cost[n - 1][k]) k = j; });
    const res = new Array(n);
    for (let i = n - 1; i >= 0; i--) { res[i] = st[i][k].route; k = back[i][k]; }
    return res;
  }

  /** Wendet die gewählte Variante auf eine Objektkopie an (für die Stichberechnung) */
  function apply(o) {
    const r = o._route;
    if (!r) return o;
    const c = { ...o };
    if (r.rev) {
      if (o.type === 'colA') c.points = HW.satinauto ? HW.satinauto.reverseColA(o.points) : o.points;
      else if (o.type === 'colB') { c.points = o.points.slice().reverse(); c.side2 = o.side2.slice().reverse(); }
      else c.points = o.points.slice().reverse();
    }
    if (r.rot) c.points = o.points.slice(r.rot).concat(o.points.slice(0, r.rot));
    if (r.entry) c._entry = r.entry;
    if (r.exit) c._exit = r.exit;
    if (r.back) c._back = true;
    return c;
  }

  /* ---------- Versteckte Laufwege ---------- */
  // Abdeckfläche eines Objekts (Polygone) – unter diesen Flächen sind Laufstiche später unsichtbar
  function coverOf(o) {
    if (o._cover !== undefined) return o._cover;
    let rings = null;
    try {
      if (o.type === 'fill') rings = HW.stitch.fillRings(o);
      else if (isCol(o)) {
        const segs = HW.stitch.railsFor(o);
        if (segs) {
          const L = segs.flatMap((s) => s.L), R = segs.flatMap((s) => s.R);
          rings = [L.concat(R.slice().reverse())];
        }
      }
    } catch (e) { rings = null; }
    o._cover = rings ? { rings, bb: G.bbox(rings.flat()) } : null;
    if (o._cover && o.type === 'fill') {
      const cv = o._cover;
      let R = null;
      Object.defineProperty(cv, 'router', { get: () => R || (R = G.insideRouter(cv.rings, { margin: 0.5, cell: 0.7 })), enumerable: false });
      cv.near = (p) => p.x > cv.bb.x0 - 2 && p.x < cv.bb.x1 + 2 && p.y > cv.bb.y0 - 2 && p.y < cv.bb.y1 + 2 && (G.pointInRings(p, cv.rings) || cv.rings.some((r) => G.nearestOnRing(p, r).d < 1.6));
    }
    return o._cover;
  }

  // Binärer Heap für die Wegsuche
  function Heap() { this.a = []; }
  Heap.prototype.push = function (k, v) {
    const a = this.a; a.push([k, v]);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  };
  Heap.prototype.pop = function () {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  };

  /**
   * Sucht einen Laufweg von a nach b, der unter den Abdeckflächen covers liegt.
   * Rückgabe: Punktliste oder null.
   */
  function hiddenPath(a, b, covers) {
    const d = G.dist(a, b);
    const cell = 0.5, pad = Math.min(15, 5 + d * 0.5);
    let x0 = Math.min(a.x, b.x) - pad, y0 = Math.min(a.y, b.y) - pad, x1 = Math.max(a.x, b.x) + pad, y1 = Math.max(a.y, b.y) + pad;
    const W = Math.ceil((x1 - x0) / cell), H = Math.ceil((y1 - y0) / cell);
    if (W * H > 250000) return null;
    const cov = new Uint8Array(W * H);
    // Abdeckflächen rastern (Gerade-Ungerade-Regel pro Objekt)
    for (const c of covers) {
      if (c.bb.x1 < x0 || c.bb.x0 > x1 || c.bb.y1 < y0 || c.bb.y0 > y1) continue;
      for (let r = 0; r < H; r++) {
        const y = y0 + (r + 0.5) * cell;
        const xs = [];
        for (const ring of c.rings)
          for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const p = ring[i], q = ring[j];
            if ((p.y > y) !== (q.y > y)) xs.push(p.x + ((y - p.y) * (q.x - p.x)) / (q.y - p.y));
          }
        xs.sort((u, v) => u - v);
        for (let k = 0; k + 1 < xs.length; k += 2) {
          const c0 = Math.max(0, Math.ceil((xs[k] - x0) / cell - 0.5)), c1 = Math.min(W - 1, Math.floor((xs[k + 1] - x0) / cell - 0.5));
          for (let cc = c0; cc <= c1; cc++) cov[r * W + cc] = 1;
        }
      }
    }
    // Rand abziehen (ca. 0,5 mm), damit der Laufstich sicher verdeckt ist
    const free = new Uint8Array(W * H);
    for (let r = 1; r < H - 1; r++)
      for (let cc = 1; cc < W - 1; cc++) {
        const i = r * W + cc;
        if (cov[i] && cov[i - 1] && cov[i + 1] && cov[i - W] && cov[i + W]) free[i] = 1;
      }
    const toCell = (p) => ({ c: Math.max(0, Math.min(W - 1, Math.floor((p.x - x0) / cell))), r: Math.max(0, Math.min(H - 1, Math.floor((p.y - y0) / cell))) });
    const A = toCell(a), B = toCell(b);
    const near = (cc, r, P, rad) => Math.hypot(x0 + (cc + 0.5) * cell - P.x, y0 + (r + 0.5) * cell - P.y) <= rad;
    const cost = (cc, r) => {
      const i = r * W + cc;
      if (free[i]) return 1;
      if (near(cc, r, a, 1.6) || near(cc, r, b, 1.2)) return 4; // kurzes Stück am Rand von Start/Ziel ist erlaubt
      return Infinity;
    };
    const dist = new Float32Array(W * H).fill(Infinity), from = new Int32Array(W * H).fill(-1);
    const si = A.r * W + A.c, ti = B.r * W + B.c;
    dist[si] = 0;
    const h = new Heap();
    h.push(0, si);
    const hx = (i) => Math.hypot((i % W) - B.c, ((i / W) | 0) - B.r);
    const maxLen = Math.min(80, Math.max(d * 2.5, d + 15)) / cell;
    let found = false;
    while (h.a.length) {
      const [, i] = h.pop();
      if (i === ti) { found = true; break; }
      const cc = i % W, r = (i / W) | 0;
      if (dist[i] > maxLen) continue;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nc = cc + dx, nr = r + dy;
          if (nc < 0 || nr < 0 || nc >= W || nr >= H) continue;
          const k = cost(nc, nr);
          if (k === Infinity) continue;
          const ni = nr * W + nc, nd = dist[i] + k * (dx && dy ? 1.4142 : 1);
          if (nd < dist[ni]) { dist[ni] = nd; from[ni] = i; h.push(nd + hx(ni), ni); }
        }
    }
    if (!found) return null;
    const path = [];
    for (let i = ti; i !== -1; i = from[i]) path.push({ x: x0 + ((i % W) + 0.5) * cell, y: y0 + (((i / W) | 0) + 0.5) * cell });
    path.reverse();
    path[0] = { x: a.x, y: a.y };
    path[path.length - 1] = { x: b.x, y: b.y };
    const simp = G.rdp(path, 0.3);
    if (G.polyLength(simp) > maxLen * cell) return null;
    return simp;
  }

  /**
   * Verbindung von Punkt a (Ende Objekt i-1) zu b (Anfang Objekt objs[i]).
   * Rückgabe: Liste der Laufstich-Punkte (ohne a, mit b) oder null (= schneiden).
   */
  function connect(a, b, objs, i) {
    const o = objs[i];
    const covers = [];
    for (let k = i; k < objs.length; k++) {
      const q = objs[k];
      if (q.color !== o.color) break; // nur unter Objekte derselben Farbe verstecken
      if (q.hidden) continue;
      const c = coverOf(q);
      if (c) covers.push(c);
    }
    if (!covers.length) return null;
    const path = hiddenPath(a, b, covers);
    if (!path) return null;
    const pts = G.resample(path, 2.2, 30);
    return pts.slice(1);
  }

  /* ---------- Reihenfolge optimieren ---------- */
  function overlap(a, b) {
    const A = coverOf(a), B = coverOf(b);
    const ba = A ? A.bb : a._bb, bb = B ? B.bb : b._bb;
    if (!ba || !bb) return false;
    return ba.x0 < bb.x1 && bb.x0 < ba.x1 && ba.y0 < bb.y1 && bb.y0 < ba.y1;
  }

  /** Innerhalb zusammenhängender Blöcke gleicher Farbe nach kürzesten Wegen sortieren.
      Überlappende Objekte behalten ihre Reihenfolge (Überdeckung bleibt erhalten). */
  function optimizeOrder(objects) {
    const out = [];
    let i = 0, cur = null;
    while (i < objects.length) {
      let j = i;
      while (j < objects.length && objects[j].color === objects[i].color) j++;
      const block = objects.slice(i, j);
      if (block.some((o) => o.fixedDir || o.grp)) { out.push(...block); }
      else {
        const rest = block.slice();
        while (rest.length) {
          let bi = -1, bc = Infinity;
          rest.forEach((o, k) => {
            // darf erst, wenn alle früheren überlappenden Objekte gesetzt sind
            const blocked = rest.some((q, m) => m < k && block.indexOf(q) < block.indexOf(o) && overlap(q, o));
            if (blocked) return;
            const c = cur ? Math.min(...options(o, cur).map((v) => G.dist(cur, v.entry))) : k;
            if (c < bc) { bc = c; bi = k; }
          });
          if (bi < 0) bi = 0;
          const o = rest.splice(bi, 1)[0];
          out.push(o);
          const v = options(o, cur);
          cur = v.reduce((b, x) => (!cur || G.dist(cur, x.entry) < G.dist(cur, b.entry) ? x : b), v[0]).exit;
        }
      }
      i = j;
    }
    return out;
  }

  /* ---------- Fahrplan: Reihenfolge so wählen, dass möglichst wenig geschnitten wird ---------- */
  // Punkt liegt unter einer der Abdeckflächen (Gerade-Ungerade-Regel je Objekt, mit kleinem Randabstand)
  function underCovers(p, covers) {
    for (const c of covers) {
      if (p.x < c.bb.x0 || p.x > c.bb.x1 || p.y < c.bb.y0 || p.y > c.bb.y1) continue;
      if (G.pointInRings(p, c.rings)) return true;
    }
    return false;
  }
  // Verbindung a -> b: kurz genug zum direkten Stich, unter späteren Objekten versteckbar, oder Schnitt
  function linkCost(a, b, covers, opt) {
    const d = G.dist(a, b);
    if (d < opt.trimDist) return d;
    if (covers.length) {
      const n = Math.max(2, Math.ceil(d / 1.0));
      let un = 0;
      for (let t = 1; t < n; t++) if (underCovers(G.lerp(a, b, t / n), covers)) un++;
      // überwiegend verdeckt: die Wegsuche beim Zusammensetzen führt um Löcher herum
      if (un >= 0.8 * (n - 1) && underCovers(G.lerp(a, b, 1 / n), covers) && underCovers(G.lerp(a, b, (n - 1) / n), covers)) return 1 + d * 0.25; // versteckter Laufweg: ein paar Stiche, kein Schnitt
      // um Löcher herum: Wegsuche innerhalb einer noch folgenden Fläche, an der beide Punkte liegen
      for (const c of covers) {
        if (!c.router || !c.near(a) || !c.near(b)) continue;
        const t = c.router.snap(b);
        if (t < 0) continue;
        const L = c.router.costTo(c.router.field(a, null, t), b);
        if (L < 3 * d + 10) return 1 + L * 0.25;
      }
    }
    return d * 0.3 + opt.trimCost; // Schnitt: Sprunglänge zählt wenig, der Schnitt selbst viel
  }
  // Ein-/Ausstiegsvarianten für die Planung; Flächen: Ein- und Ausstieg irgendwo auf dem Umriss
  function seqOptions(o, from) {
    if (o.type === 'fill') {
      const ring = HW.stitch.fillRings(o)[0];
      const en = from ? (() => { const r = G.nearestOnRing(from, ring); return G.lerp(ring[r.seg], ring[(r.seg + 1) % ring.length], r.t); })() : ring[0];
      return [{ entry: en, exit: null, ring }];
    }
    return options(o, from).map((v) => ({ entry: v.entry, exit: v.exit }));
  }
  // Abstand vom Ausstieg (Punkt oder flexibler Umriss einer Fläche) zum Punkt p
  function fromPoint(cur, p) {
    if (!cur) return null;
    if (cur.ring) { const r = G.nearestOnRing(p, cur.ring); return G.lerp(cur.ring[r.seg], cur.ring[(r.seg + 1) % cur.ring.length], r.t); }
    return cur.pt;
  }

  // Flächen überlappen sich wirklich (nicht nur die Rahmen): Stichprobe auf einem Raster der Schnittmenge
  function realOverlap(A, B) {
    if (!A || !B) return true;
    const x0 = Math.max(A.bb.x0, B.bb.x0), x1 = Math.min(A.bb.x1, B.bb.x1), y0 = Math.max(A.bb.y0, B.bb.y0), y1 = Math.min(A.bb.y1, B.bb.y1);
    if (x0 >= x1 || y0 >= y1) return false;
    const st = Math.max(0.3, Math.min(x1 - x0, y1 - y0) / 12);
    for (let y = y0 + st / 2; y < y1; y += st) for (let x = x0 + st / 2; x < x1; x += st) { const p = { x, y }; if (G.pointInRings(p, A.rings) && G.pointInRings(p, B.rings)) return true; }
    return false;
  }

  /**
   * Reihenfolge je Farbblock planen (Strahlsuche). Schnitte zählen teuer; Verbindungen, die unter noch
   * folgenden Objekten derselben Farbe versteckt laufen können, zählen fast nichts.
   * Überlappende Objekte behalten ihre Reihenfolge (oben bleibt oben).
   */
  function beamSequence(objects, settings = {}) {
    const opt = { trimDist: settings.trimDist ?? 2, trimCost: settings.trimCost ?? 25, keepOverlapOrder: settings.keepOverlapOrder !== false, fillsLast: !!settings.fillsLast };
    const out = [];
    let i = 0, cur = null;
    while (i < objects.length) {
      let j = i;
      while (j < objects.length && objects[j].color === objects[i].color) j++;
      const block = objects.slice(i, j);
      if (block.length < 2 || block.some((o) => o.fixedDir || o.grp || o.hidden)) { out.push(...block); cur = null; i = j; continue; }
      const n = block.length;
      const covers = block.map((o) => coverOf(o));
      // Vorgänger-Bedingung: überlappende Objekte in alter Reihenfolge
      const before = block.map(() => []);
      if (opt.keepOverlapOrder) for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (overlap(block[a], block[b]) && realOverlap(covers[a], covers[b])) before[b].push(a);
      if (opt.fillsLast) for (let b = 0; b < n; b++) if (block[b].type === 'fill') for (let a = 0; a < n; a++) if (block[a].type !== 'fill' && !before[a].includes(b)) before[b].push(a);
      const width = +(globalThis.process && process.env.BW) || (n <= 20 ? 4 : n <= 60 ? 3 : 2), K = n <= 30 ? n : 10;
      let beam = [{ cur, done: new Set(), seq: [], cost: 0 }];
      for (let step = 0; step < n; step++) {
        const kids = [];
        for (const st of beam) {
          const free = [];
          for (let k = 0; k < n; k++) if (!st.done.has(k) && before[k].every((q) => st.done.has(q))) free.push(k);
          // Kandidaten: die nächsten K freien Objekte
          const near = free.map((k) => {
            const v = seqOptions(block[k], fromPoint(st.cur, block[k].points ? block[k].points[0] : { x: 0, y: 0 }));
            const fp = fromPoint(st.cur, v[0].entry);
            return { k, d: fp ? Math.min(...v.map((x) => G.dist(fromPoint(st.cur, x.entry), x.entry))) : 0 };
          }).sort((x, y) => x.d - y.d).slice(0, K);
          // versteckte Wege nur unter Objekten, die nach diesem Schritt noch kommen
          for (const { k } of near) {
            const rest = [];
            for (let q = 0; q < n; q++) if (q !== k && !st.done.has(q) && covers[q]) rest.push(covers[q]);
            if (covers[k]) rest.push(covers[k]);
            const vs = seqOptions(block[k], st.cur && st.cur.pt ? st.cur.pt : null);
            for (const v of vs) {
              const a = fromPoint(st.cur, v.entry);
              const c = a ? linkCost(a, v.entry, rest, opt) : 0;
              const next = v.exit ? { pt: v.exit } : { ring: v.ring };
              const done = new Set(st.done); done.add(k);
              kids.push({ cur: next, done, seq: st.seq.concat([k]), cost: st.cost + c });
            }
          }
        }
        kids.sort((x, y) => x.cost - y.cost);
        const seen = new Set();
        beam = [];
        for (const kd of kids) {
          const key = [...kd.done].sort((x, y) => x - y).join(',') + '|' + kd.seq[kd.seq.length - 1] + '|' + (kd.cur.pt ? kd.cur.pt.x.toFixed(1) : 'r');
          if (seen.has(key)) continue;
          seen.add(key);
          beam.push(kd);
          if (beam.length >= width) break;
        }
        if (!beam.length) break;
      }
      const best = beam[0];
      if (!best || best.seq.length !== n) { out.push(...block); cur = null; }
      else { best.seq.forEach((k) => out.push(block[k])); cur = best.cur; }
      i = j;
    }
    return out;
  }

  /**
   * Ergebnis einer Reihenfolge wirklich durchrechnen: Ein-/Ausstiege planen, Stiche erzeugen,
   * Verbindungen wie beim Zusammensetzen prüfen. Rückgabe: {trims, jump, travel, cost}
   */
  function simulate(order, settings = {}) {
    const trimDist = settings.trimDist ?? 2, trimCost = settings.trimCost ?? 25;
    const pl = plan(order, settings);
    const objs = order.map((o, i) => {
      const r = { ...(pl[i] || {}) };
      if (o.type === 'fill' && order[i + 1] && order[i + 1].color === o.color) { const ex = exitTarget(o, order[i + 1]); if (ex) r.exit = ex; }
      // schnelle Näherung der Flächen (ohne Vorausplanung der Teilblöcke) – reicht für Ein-/Ausstieg
      return { ...o, _route: Object.keys(r).length ? r : null, _st: null, _cover: undefined, _fast: true };
    });
    let prevExit = null;
    for (const o of objs) {
      if (o.type === 'fill' && prevExit && o._route !== undefined) {
        const en = nearestOnOutline(o, prevExit);
        o._route = { ...(o._route || {}), entry: { x: +en.x.toFixed(2), y: +en.y.toFixed(2) } };
      }
      try { o._st = HW.stitch.generate(o, settings.material); } catch (e) { o._st = []; }
      if (o._st.length) prevExit = o._st[o._st.length - 1];
    }
    let trims = 0, jump = 0, travel = 0;
    for (let i = 1; i < objs.length; i++) {
      const a = objs[i - 1]._st[objs[i - 1]._st.length - 1], b = objs[i]._st[0];
      if (!a || !b) continue;
      if (objs[i].color !== objs[i - 1].color) { jump += G.dist(a, b) * 0.1; continue; }
      const d = G.dist(a, b);
      if (d < trimDist) continue;
      const p = connect(a, b, objs, i);
      if (p) travel += G.polyLength([a, ...p]);
      else { trims++; jump += d; }
    }
    return { trims, jump, travel, cost: trims * trimCost + jump * 0.3 + travel * 0.25, routes: objs.map((o) => o._route) };
  }

  /** Reihenfolge planen: mehrere Kandidaten erzeugen, jeden durchrechnen, den besten nehmen. */
  function sequence(objects, settings = {}) {
    const cands = [objects.slice()];
    try { cands.push(beamSequence(objects, settings)); } catch (e) { /* weiter mit den anderen */ }
    try { cands.push(beamSequence(objects, { ...settings, fillsLast: true })); } catch (e) { /* */ }
    if (settings.simulate === false) return cands[1] || cands[0];
    let best = cands[0], bc = Infinity;
    for (const c of cands) {
      if (!c || c.length !== objects.length) continue;
      const r = simulate(c, settings);
      if (r.cost < bc - 1e-6) { bc = r.cost; best = c; }
    }
    return best;
  }

  // Ausstiegsziel für Flächen: Punkt des Umrisses, der dem Einstieg des nächsten Objekts am nächsten liegt
  function exitTarget(o, next) {
    if (!next || o.type !== 'fill') return null;
    const ring = HW.stitch.fillRings(o)[0];
    let pts;
    if (next.type === 'fill') {
      // nächster Umrisspunkt der folgenden Fläche zum Umriss dieser Fläche
      const nr = HW.stitch.fillRings(next)[0];
      let best = null, bd = Infinity;
      for (let k = 0; k < nr.length; k += Math.max(1, Math.floor(nr.length / 60))) { const r = G.nearestOnRing(nr[k], ring); if (r.d < bd) { bd = r.d; best = nr[k]; } }
      pts = best ? [best] : [];
    } else pts = options(next, null).map((v) => v.entry);
    let best = null, bd = Infinity;
    for (const p of pts) { const r = G.nearestOnRing(p, ring); if (r.d < bd) { bd = r.d; best = G.lerp(ring[r.seg], ring[(r.seg + 1) % ring.length], r.t); } }
    return best ? { x: +best.x.toFixed(2), y: +best.y.toFixed(2) } : null;
  }

  HW.route = { options, choose, plan, apply, connect, hiddenPath, coverOf, optimizeOrder, sequence, beamSequence, simulate, exitTarget };
})(typeof window !== 'undefined' ? window : globalThis);
