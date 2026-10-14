/* Weitere Füllarten: Kontur, Spirale, Kreuzstich (Raster-/Abstandsverfahren).
   Welle, Muster und Verlauf laufen über die Tatami-Zeilen in stitchgen.js. */
(function (g) {
  const HW = (g.HW = g.HW || {});
  const G = HW.geo;
  const RES = 10; // Rasterpunkte pro mm

  // Höhenlinien des Abstands zum Rand: Ebene k liegt (k + 0,5) × Abstand innen
  function levels(rings, spacing) {
    const B = HW.boolean;
    const gr = B.grid(G.bbox(rings.flat()));
    const mask = new Uint8Array(gr.w * gr.h);
    B.paint(gr, rings, mask);
    const dt = HW.satinauto.distanceTransform(mask, gr.w, gr.h);
    const out = [];
    const tr = (p) => ({ x: gr.x0 + p.x / RES, y: gr.y0 + p.y / RES });
    for (let k = 0; k < 400; k++) {
      const d = (k + 0.5) * spacing * RES;
      const m = new Uint8Array(gr.w * gr.h);
      let any = 0;
      for (let i = 0; i < m.length; i++) if (dt[i] > d) { m[i] = 1; any++; }
      if (!any) break;
      const rs = HW.auto.traceMask(m, gr.w, gr.h)
        .map((r) => HW.auto.smoothRing(r, 0.5))
        .filter((r) => r.length >= 3 && Math.abs(G.signedArea(r)) > 4)
        .map((r) => {
          let q = r.map(tr);
          // einheitliche Laufrichtung (Außen- und Innenringe gleich herum)
          if (G.signedArea(q) < 0) q = q.reverse();
          return q;
        });
      if (rs.length) out.push(rs);
    }
    return out;
  }

  const startAt = (ring, p) => {
    if (!p) return ring;
    let bi = 0, bd = Infinity;
    ring.forEach((q, i) => { const d = G.dist(q, p); if (d < bd) { bd = d; bi = i; } });
    return ring.slice(bi).concat(ring.slice(0, bi));
  };

  // Verbindung innerhalb der Fläche: kurzer Stich, Lauf oder Sprung
  function link(out, rings, to) {
    const last = out[out.length - 1];
    if (!last) { out.push({ x: to.x, y: to.y, j: 0 }); return; }
    const d = G.dist(last, to);
    if (d < 0.15) return;
    if (d <= 2.5) { out.push({ x: to.x, y: to.y, j: 0 }); return; }
    if (G.segmentInside(last, to, rings)) {
      const n = Math.ceil(d / 2.5);
      for (let i = 1; i <= n; i++) out.push({ ...G.lerp(last, to, i / n), j: 0 });
    } else out.push({ x: to.x, y: to.y, j: 1 });
  }

  function runRing(out, rings, ring, len) {
    const r = G.resample(ring.concat([ring[0]]), len, 30);
    link(out, rings, r[0]);
    for (let i = 1; i < r.length; i++) out.push({ x: r[i].x, y: r[i].y, j: 0 });
  }

  // Ring-Liste so ordnen, dass jeweils der nächstliegende Ring folgt
  function orderRings(rs, cur) {
    const left = rs.slice(), res = [];
    while (left.length) {
      let bi = 0, bd = Infinity;
      left.forEach((r, i) => { const d = cur ? G.nearestOnRing(cur, r).d : i; if (d < bd) { bd = d; bi = i; } });
      const r = startAt(left.splice(bi, 1)[0], cur);
      res.push(r);
      cur = r[0];
    }
    return res;
  }

  /** Konturfüllung: Laufstich-Reihen parallel zum Rand, von außen nach innen */
  function contour(rings, p, start) {
    const out = [];
    let cur = start;
    for (const lv of levels(rings, p.spacing)) {
      for (const r of orderRings(lv, cur)) {
        runRing(out, rings, r, p.len);
        cur = out[out.length - 1];
      }
    }
    return out;
  }

  /** Spiralfüllung: wie Kontur, die Ringe gehen aber fließend ineinander über (keine Stufen) */
  function spiral(rings, p, start) {
    const out = [];
    const lv = levels(rings, p.spacing);
    let cur = start;
    for (let k = 0; k < lv.length; k++) {
      const next = lv[k + 1];
      if (lv[k].length !== 1 || !next || next.length !== 1) {
        // Ebene mit mehreren Teilen (Löcher, Einschnürungen): wie Kontur
        for (const r of orderRings(lv[k], cur)) { runRing(out, rings, r, p.len); cur = out[out.length - 1]; }
        continue;
      }
      const r = G.resample(startAt(lv[k][0], cur).concat([startAt(lv[k][0], cur)[0]]), Math.min(p.len, 2), 30);
      link(out, rings, r[0]);
      const nx = next[0];
      for (let i = 1; i < r.length; i++) {
        const t = i / (r.length - 1);
        const nr = G.nearestOnRing(r[i], nx);
        const q = G.lerp(nx[nr.seg], nx[(nr.seg + 1) % nx.length], nr.t);
        const pt = G.lerp(r[i], q, t);
        out.push({ x: pt.x, y: pt.y, j: 0 });
      }
      cur = out[out.length - 1];
    }
    return out;
  }

  /** Kreuzstich: Raster aus Kästchen, jedes Kästchen ein X (Reihe für Reihe, im Wechsel) */
  function cross(rings, p, start) {
    const c = p.crossSize || 2.5;
    const bb = G.bbox(rings.flat());
    const out = [];
    const nx = Math.ceil((bb.x1 - bb.x0) / c), ny = Math.ceil((bb.y1 - bb.y0) / c);
    const x0 = (bb.x0 + bb.x1) / 2 - (nx * c) / 2, y0 = (bb.y0 + bb.y1) / 2 - (ny * c) / 2;
    const inside = (i, j) => G.pointInRings({ x: x0 + (i + 0.5) * c, y: y0 + (j + 0.5) * c }, rings);
    const P = (i, j) => ({ x: x0 + i * c, y: y0 + j * c });
    const passes = p.crossDouble ? 2 : 1;
    let first = true;
    for (let j = 0; j < ny; j++) {
      const rtl = j % 2 === 1;
      // zusammenhängende Kästchen-Läufe dieser Reihe
      const runs = [];
      let s = -1;
      for (let i = 0; i <= nx; i++) {
        const inn = i < nx && inside(i, j);
        if (inn && s < 0) s = i;
        if (!inn && s >= 0) { runs.push([s, i - 1]); s = -1; }
      }
      if (rtl) runs.reverse();
      for (const [a, b] of runs) {
        const idx = [];
        for (let i = a; i <= b; i++) idx.push(i);
        if (rtl) idx.reverse();
        const go = (pt) => { if (first) { link(out, rings, pt); first = false; } else link(out, rings, pt); };
        for (const i of idx) {
          // links→rechts: unten-links → oben-rechts → oben-links → unten-rechts (= unten-links des nächsten)
          const BL = P(i, j + 1), TR = P(i + 1, j), TL = P(i, j), BR = P(i + 1, j + 1);
          const seq = rtl ? [BR, TL, TR, BL] : [BL, TR, TL, BR];
          go(seq[0]);
          for (let k = 0; k < passes; k++) {
            out.push({ ...seq[1], j: 0 });
            if (k + 1 < passes) out.push({ ...seq[0], j: 0 });
          }
          out.push({ ...seq[2], j: 0 });
          for (let k = 0; k < passes; k++) {
            out.push({ ...seq[3], j: 0 });
            if (k + 1 < passes) out.push({ ...seq[2], j: 0 });
          }
        }
      }
    }
    if (start && out.length) out[0].j = G.dist(start, out[0]) > 2.5 ? 1 : 0;
    return out;
  }

  HW.fills = { contour, spiral, cross, levels };
})(typeof window !== 'undefined' ? window : globalThis);
