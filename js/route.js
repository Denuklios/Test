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
      return [{ route: { rev: false }, entry: s, exit: e }, { route: { rev: true }, entry: e, exit: s }];
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
  function plan(objs) {
    const n = objs.length;
    if (!n) return [];
    const opts = objs.map((o) => options(o, null));
    // Kosten/Herkunft je Zustand; dyn = dynamischer Einstieg (Flächen, geschlossene Läufe)
    const cost = [], back = [], st = [];
    const dyn = (o) => o.type === 'fill' || (o.type === 'run' && o.params && o.params.closed && !o.fixedDir);
    for (let i = 0; i < n; i++) {
      const o = objs[i];
      cost.push([]); back.push([]); st.push([]);
      const w = i > 0 && objs[i - 1].color === o.color ? 1 : 0.15;
      const nopt = dyn(o) && i > 0 ? st[i - 1].length : opts[i].length;
      for (let k = 0; k < nopt; k++) {
        let best = Infinity, bj = -1, state = null;
        if (i === 0) { best = 0; state = opts[0][k]; }
        else if (dyn(o)) {
          // Einstieg hängt vom Vorgänger-Zustand k ab
          const pe = st[i - 1][k].exit;
          const v = options(o, pe)[0];
          best = cost[i - 1][k] + w * G.dist(pe, v.entry); bj = k; state = v;
        } else {
          const v = opts[i][k];
          for (let j = 0; j < st[i - 1].length; j++) {
            const c = cost[i - 1][j] + w * G.dist(st[i - 1][j].exit, v.entry);
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

  HW.route = { options, choose, plan, apply, connect, hiddenPath, coverOf, optimizeOrder };
})(typeof window !== 'undefined' ? window : globalThis);
