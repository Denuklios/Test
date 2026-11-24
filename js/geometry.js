/* Geometrie-Hilfsfunktionen. Alle Koordinaten in Millimetern. */
(function (g) {
  const HW = (g.HW = g.HW || {});

  const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const rot = (p, ang, c = { x: 0, y: 0 }) => {
    const s = Math.sin(ang), co = Math.cos(ang);
    const dx = p.x - c.x, dy = p.y - c.y;
    return { x: c.x + dx * co - dy * s, y: c.y + dx * s + dy * co };
  };

  function polyLength(pl) {
    let L = 0;
    for (let i = 1; i < pl.length; i++) L += dist(pl[i - 1], pl[i]);
    return L;
  }

  // Hermite-Segment zwischen p1 und p2 mit Tangenten m1, m2
  function hermite(p1, p2, m1, m2, n, out) {
    for (let i = 1; i <= n; i++) {
      const t = i / n, t2 = t * t, t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
      out.push({
        x: h00 * p1.x + h10 * m1.x + h01 * p2.x + h11 * m2.x,
        y: h00 * p1.y + h10 * m1.y + h01 * p2.y + h11 * m2.y,
      });
    }
  }

  /**
   * Baut aus Kontrollpunkten {x,y,c} (c=true: Kurvenpunkt, sonst Eckpunkt)
   * eine Polylinie. Liefert {pts, idx} – idx[i] ist der Index des i-ten Kontrollpunkts in pts.
   * Eckpunkte erzeugen Knicke, Kurvenpunkte glatte Übergänge.
   */
  function buildPath(cps, closed) {
    const n = cps.length;
    if (n === 0) return { pts: [], idx: [] };
    if (n === 1) return { pts: [{ x: cps[0].x, y: cps[0].y }], idx: [0] };
    const get = (i) => (closed ? cps[(i + n) % n] : cps[Math.max(0, Math.min(n - 1, i))]);
    // Einheitstangente; Länge wird pro Segment angepasst (verhindert Überschwingen)
    const tangent = (i, dirNext) => {
      const p = get(i);
      let v;
      if (!p.c || (!closed && (i === 0 || i === n - 1))) {
        const q = dirNext ? get(i + 1) : get(i - 1);
        v = dirNext ? { x: q.x - p.x, y: q.y - p.y } : { x: p.x - q.x, y: p.y - q.y };
        const l = Math.hypot(v.x, v.y) || 1;
        return { x: v.x / l, y: v.y / l, corner: true };
      }
      const a = get(i - 1), b = get(i + 1);
      // Richtung nach Segmentlänge gewichtet: lange Kanten bleiben gerade
      v = { x: b.x - a.x, y: b.y - a.y };
      const l = Math.hypot(v.x, v.y) || 1;
      return { x: v.x / l, y: v.y / l };
    };
    const pts = [{ x: cps[0].x, y: cps[0].y }];
    const idx = [0];
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const p1 = get(i), p2 = get(i + 1);
      const m1 = tangent(i, true), m2 = tangent(i + 1, false);
      const straight = m1.corner && m2.corner;
      const L = dist(p1, p2);
      if (straight || L < 1e-9) pts.push({ x: p2.x, y: p2.y });
      else hermite(p1, p2, { x: m1.x * L, y: m1.y * L }, { x: m2.x * L, y: m2.y * L }, Math.max(4, Math.min(64, Math.ceil(L / 0.5))), pts);
      if (i + 1 < n) idx.push(pts.length - 1);
    }
    return { pts, idx };
  }

  // Polylinie in gleichmäßige Abstände unterteilen, Ecken (> cornerDeg) bleiben erhalten
  function resample(pl, step, cornerDeg = 25, keepIdx) {
    if (pl.length < 2) return pl.slice();
    const keep = new Set(keepIdx || []);
    const cosLim = Math.cos((cornerDeg * Math.PI) / 180);
    for (let i = 1; i < pl.length - 1; i++) {
      const a = pl[i - 1], b = pl[i], c = pl[i + 1];
      const v1x = b.x - a.x, v1y = b.y - a.y, v2x = c.x - b.x, v2y = c.y - b.y;
      const l1 = Math.hypot(v1x, v1y), l2 = Math.hypot(v2x, v2y);
      if (l1 > 1e-9 && l2 > 1e-9 && (v1x * v2x + v1y * v2y) / (l1 * l2) < cosLim) keep.add(i);
    }
    keep.add(0);
    keep.add(pl.length - 1);
    const anchors = [...keep].sort((a, b) => a - b);
    const out = [{ x: pl[0].x, y: pl[0].y }];
    for (let k = 1; k < anchors.length; k++) {
      const part = pl.slice(anchors[k - 1], anchors[k] + 1);
      const L = polyLength(part);
      if (L < 1e-6) continue;
      const cnt = Math.max(1, Math.round(L / step));
      for (let j = 1; j <= cnt; j++) out.push(pointAt(part, (L * j) / cnt));
    }
    return out;
  }

  // Punkt bei Bogenlänge s
  function pointAt(pl, s) {
    if (s <= 0) return { x: pl[0].x, y: pl[0].y };
    let acc = 0;
    for (let i = 1; i < pl.length; i++) {
      const d = dist(pl[i - 1], pl[i]);
      if (acc + d >= s) return lerp(pl[i - 1], pl[i], d > 0 ? (s - acc) / d : 0);
      acc += d;
    }
    const l = pl[pl.length - 1];
    return { x: l.x, y: l.y };
  }

  // Normalen-Versatz einer Polylinie (für Säule C / Rand-Unterlage)
  function offsetPolyline(pl, d) {
    const out = [];
    for (let i = 0; i < pl.length; i++) {
      const a = pl[Math.max(0, i - 1)], b = pl[Math.min(pl.length - 1, i + 1)];
      let tx = b.x - a.x, ty = b.y - a.y;
      const l = Math.hypot(tx, ty) || 1;
      tx /= l; ty /= l;
      out.push({ x: pl[i].x - ty * d, y: pl[i].y + tx * d });
    }
    return out;
  }

  function signedArea(r) {
    let a = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j].x * r[i].y - r[i].x * r[j].y);
    return a / 2;
  }

  function pointInRings(p, rings) {
    let inside = false;
    for (const r of rings) {
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const a = r[i], b = r[j];
        if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
      }
    }
    return inside;
  }

  // Schleifen entfernen, die beim Versetzen einer Linie an der Innenseite enger Kurven/Ecken entstehen
  function removeLoops(pl, window = 600) {
    const out = pl.slice();
    for (let i = 0; i + 1 < out.length; i++) {
      const a = out[i], b = out[i + 1];
      for (let j = Math.min(out.length - 2, i + window); j >= i + 2; j--) {
        const c = out[j], d = out[j + 1];
        const den = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
        if (Math.abs(den) < 1e-12) continue;
        const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / den;
        const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / den;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
          // Schleife zwischen i+1 und j durch den Schnittpunkt ersetzen (weitester Treffer zuerst)
          out.splice(i + 1, j - i, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
          break;
        }
      }
    }
    return out;
  }

  function segIntersect(p1, p2, p3, p4) {
    const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
    if (Math.abs(d) < 1e-12) return false;
    const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
    const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
    return t > 1e-6 && t < 1 - 1e-6 && u >= 0 && u <= 1;
  }

  function segmentInside(a, b, rings) {
    for (const r of rings)
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) if (segIntersect(a, b, r[j], r[i])) return false;
    return pointInRings(lerp(a, b, 0.5), rings);
  }

  function distToSeg(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return { d: Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)), t };
  }

  // Nächste Position auf einem Ring: {seg, t, d}
  function nearestOnRing(p, ring) {
    let best = { d: Infinity, seg: 0, t: 0 };
    for (let i = 0; i < ring.length; i++) {
      const r = distToSeg(p, ring[i], ring[(i + 1) % ring.length]);
      if (r.d < best.d) best = { d: r.d, seg: i, t: r.t };
    }
    return best;
  }

  // Weg entlang eines Rings von Position A nach B (kürzere Richtung)
  function ringPath(ring, A, B) {
    const n = ring.length;
    const pa = lerp(ring[A.seg], ring[(A.seg + 1) % n], A.t);
    const pb = lerp(ring[B.seg], ring[(B.seg + 1) % n], B.t);
    const fwd = [pa];
    let i = A.seg;
    if (!(A.seg === B.seg && B.t >= A.t)) {
      i = (A.seg + 1) % n;
      let guard = 0;
      while (guard++ <= n) {
        fwd.push(ring[i]);
        if (i === B.seg) break;
        i = (i + 1) % n;
      }
    }
    fwd.push(pb);
    const bwd = [pa];
    if (!(A.seg === B.seg && B.t <= A.t)) {
      i = A.seg;
      bwd.push(ring[i]);
      const stop = (B.seg + 1) % n;
      let guard = 0;
      while (i !== stop && guard++ <= n) {
        i = (i - 1 + n) % n;
        bwd.push(ring[i]);
      }
    }
    bwd.push(pb);
    return polyLength(fwd) <= polyLength(bwd) ? fwd : bwd;
  }

  /**
   * Wegnetz im Inneren einer Fläche (rings, Gerade-Ungerade-Regel) mit Abstand "margin" zum Rand.
   * field(a, cost) berechnet von a aus die Wegkosten zu allen Stellen (Dijkstra);
   * cost(p, randAbstand) liefert einen Kostenfaktor >= 1 je Stelle.
   * pathTo(f, b) liefert den geglätteten Weg [a, …, b], cost(f, b) die Kosten bis b.
   */
  function insideRouter(rings, opts = {}) {
    const margin = opts.margin ?? 0.3;
    const bb = bbox(rings.flat());
    let cell = opts.cell || 0.4;
    while (((bb.x1 - bb.x0) / cell + 3) * ((bb.y1 - bb.y0) / cell + 3) > 160000) cell *= 1.4;
    const x0 = bb.x0 - cell, y0 = bb.y0 - cell;
    const W = Math.ceil((bb.x1 - x0) / cell) + 2, H = Math.ceil((bb.y1 - y0) / cell) + 2;
    const ins = new Uint8Array(W * H);
    for (let r = 0; r < H; r++) {
      const y = y0 + (r + 0.5) * cell, xs = [];
      for (const ring of rings)
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const p = ring[i], q = ring[j];
          if ((p.y > y) !== (q.y > y)) xs.push(p.x + ((y - p.y) * (q.x - p.x)) / (q.y - p.y));
        }
      xs.sort((u, v) => u - v);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k] + margin - x0) / cell - 0.5)), c1 = Math.min(W - 1, Math.floor((xs[k + 1] - margin - x0) / cell - 0.5));
        for (let c = c0; c <= c1; c++) ins[r * W + c] = 1;
      }
    }
    // auch senkrecht Abstand zum Rand halten
    const mr = Math.max(0, Math.round(margin / cell));
    const ok = new Uint8Array(W * H);
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const i = r * W + c;
      if (!ins[i]) continue;
      let good = 1;
      for (let k = 1; k <= mr && good; k++) if (r - k < 0 || r + k >= H || !ins[i - k * W] || !ins[i + k * W]) good = 0;
      ok[i] = good;
    }
    // Randabstand je Zelle (Chamfer 3-4)
    const edge = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) edge[i] = ins[i] ? 1e9 : 0;
    for (let r = 1; r < H - 1; r++) for (let c = 1; c < W - 1; c++) { const i = r * W + c; if (!edge[i]) continue; edge[i] = Math.min(edge[i], edge[i - 1] + 3, edge[i - W] + 3, edge[i - W - 1] + 4, edge[i - W + 1] + 4); }
    for (let r = H - 2; r > 0; r--) for (let c = W - 2; c > 0; c--) { const i = r * W + c; if (!edge[i]) continue; edge[i] = Math.min(edge[i], edge[i + 1] + 3, edge[i + W] + 3, edge[i + W + 1] + 4, edge[i + W - 1] + 4); }
    for (let i = 0; i < W * H; i++) edge[i] = (edge[i] / 3) * cell + margin;
    const cellOf = (p) => ({ c: Math.max(0, Math.min(W - 1, Math.floor((p.x - x0) / cell))), r: Math.max(0, Math.min(H - 1, Math.floor((p.y - y0) / cell))) });
    const ctr = (i) => ({ x: x0 + ((i % W) + 0.5) * cell, y: y0 + (((i / W) | 0) + 0.5) * cell });
    // nächste freie Zelle (Start/Ziel liegen oft genau auf dem Rand)
    const snap = (p) => {
      const C = cellOf(p), i0 = C.r * W + C.c;
      if (ok[i0]) return i0;
      const R = Math.ceil((opts.snap ?? margin + 0.8) / cell);
      let best = -1, bd = Infinity;
      for (let dr = -R; dr <= R; dr++) for (let dc = -R; dc <= R; dc++) {
        const r = C.r + dr, c = C.c + dc;
        if (r < 0 || c < 0 || r >= H || c >= W || !ok[r * W + c]) continue;
        const q = ctr(r * W + c), d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d < bd) { bd = d; best = r * W + c; }
      }
      return best;
    };
    // targets: Menge von Zellen – Suche endet, sobald alle erreicht sind; maxLen begrenzt die Suche (mm)
    function field(a, cost, target, targets, maxLen) {
      const s = snap(a);
      if (s < 0) return null;
      const cf = new Float32Array(W * H).fill(-1);
      const cAt = (i) => { if (cf[i] < 0) cf[i] = cost ? Math.max(1, cost(ctr(i), edge[i])) : 1; return cf[i]; };
      const dist = new Float64Array(W * H).fill(Infinity), from = new Int32Array(W * H).fill(-1);
      const hk = [], hv = [];
      const push = (k, v) => { let i = hk.length; hk.push(k); hv.push(v); while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= k) break; hk[i] = hk[p]; hv[i] = hv[p]; i = p; } hk[i] = k; hv[i] = v; };
      const pop = () => { const rv = hv[0], k = hk.pop(), v = hv.pop(); const n = hk.length; if (n) { let i = 0; for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && hk[c + 1] < hk[c]) c++; if (hk[c] >= k) break; hk[i] = hk[c]; hv[i] = hv[c]; i = c; } hk[i] = k; hv[i] = v; } return rv; };
      // mit Ziel: A*-Schätzung; ohne Ziel: volles Dijkstra
      const tc = target ? ctr(target) : null;
      const hx = (i) => { if (!tc) return 0; const p = ctr(i); return Math.hypot(p.x - tc.x, p.y - tc.y) / cell; };
      const closed = new Uint8Array(W * H);
      dist[s] = 0; push(hx(s), s);
      let left = targets ? targets.size : 0;
      const lim = maxLen ? maxLen / cell : Infinity;
      while (hk.length) {
        const i = pop();
        if (closed[i]) continue;
        closed[i] = 1;
        if (i === target) break;
        if (dist[i] > lim) break;
        if (targets && targets.has(i) && --left <= 0) break;
        const c = i % W, r = (i / W) | 0, ci = cAt(i);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nc = c + dx, nr = r + dy;
          if (nc < 0 || nr < 0 || nc >= W || nr >= H) continue;
          const j = nr * W + nc;
          if (!ok[j] || closed[j]) continue;
          if (dx && dy && (!ok[r * W + nc] || !ok[nr * W + c])) continue;
          const nd = dist[i] + (dx && dy ? Math.SQRT2 : 1) * (ci + cAt(j)) / 2;
          if (nd < dist[j]) { dist[j] = nd; from[j] = i; push(nd + hx(j), j); }
        }
      }
      return { a, dist, from, cAt };
    }
    const costTo = (f, b) => { const t = snap(b); return t < 0 || !f ? Infinity : f.dist[t] * cell; };
    const cellIndex = (p) => snap(p);
    function pathTo(f, b) {
      const t = snap(b);
      if (t < 0 || !f || !isFinite(f.dist[t])) return null;
      const cells = [];
      for (let i = t; i !== -1; i = f.from[i]) cells.push(i);
      cells.reverse();
      const path = [f.a, ...cells.map(ctr), b];
      const cOf = (q) => { const C = cellOf(q); return f.cAt(C.r * W + C.c); };
      // Sehnen glätten, solange die Gerade innen bleibt und keine teureren Stellen kreuzt
      const simp = [path[0]];
      let k = 0;
      while (k < path.length - 1) {
        let m = path.length - 1;
        for (; m > k + 1; m--) {
          if (!segmentInside(path[k], path[m], rings)) continue;
          let maxVia = 1;
          for (let q = k + 1; q < m; q++) maxVia = Math.max(maxVia, cOf(path[q]));
          const L = dist2(path[k], path[m]), n = Math.max(1, Math.ceil(L / cell));
          let bad = false;
          for (let t2 = 1; t2 < n && !bad; t2++) if (cOf(lerp(path[k], path[m], t2 / n)) > maxVia + 0.01) bad = true;
          if (!bad) break;
        }
        simp.push(path[m]);
        k = m;
      }
      return simp;
    }
    return { field, pathTo, costTo, snap, cellIndex, cell };
  }

  // Kürzester Weg von a nach b im Inneren der Fläche (siehe insideRouter); null, wenn keiner existiert.
  // Gelingt es mit dem gewünschten Randabstand nicht (schmale Spitzen), wird mit kleinerem Abstand erneut gesucht.
  function insidePath(a, b, rings, opts = {}) {
    const margins = [opts.margin ?? 0.3, 0.15, 0.05].filter((m, i, arr) => i === 0 || m < arr[0]);
    for (const m of margins) {
      const R = insideRouter(rings, { ...opts, margin: m, snap: Math.max(opts.snap ?? 0, m + 0.8, 3) });
      const t = R.snap(b);
      if (t < 0) continue;
      const p = R.pathTo(R.field(a, opts.cost, t), b);
      if (p) return p;
    }
    return null;
  }
  function dist2(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  // Ramer-Douglas-Peucker
  function rdp(pts, eps) {
    if (pts.length < 3) return pts.slice();
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [s, e] = stack.pop();
      let md = 0, mi = -1;
      for (let i = s + 1; i < e; i++) {
        const d = distToSeg(pts[i], pts[s], pts[e]).d;
        if (d > md) { md = d; mi = i; }
      }
      if (md > eps && mi > 0) {
        keep[mi] = 1;
        stack.push([s, mi], [mi, e]);
      }
    }
    return pts.filter((_, i) => keep[i]);
  }

  function bbox(pts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) {
      if (p.x < x0) x0 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.x > x1) x1 = p.x;
      if (p.y > y1) y1 = p.y;
    }
    return { x0, y0, x1, y1 };
  }

  HW.geo = { removeLoops, dist, lerp, rot, polyLength, buildPath, resample, pointAt, offsetPolyline, signedArea, pointInRings, segmentInside, distToSeg, nearestOnRing, ringPath, insidePath, insideRouter, rdp, bbox };
})(typeof window !== 'undefined' ? window : globalThis);
