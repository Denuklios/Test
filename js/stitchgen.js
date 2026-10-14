/* Stichgenerierung für alle Objekttypen. Ausgabe: Liste {x, y, j} (j=1: Sprung) in mm. */
(function (g) {
  const HW = (g.HW = g.HW || {});
  const G = HW.geo;

  const DEFAULTS = {
    run: { len: 2.5, style: 'single', closed: false },
    satin: { spacing: 0.4, pull: 0.15, underlay: 'center', split: 7, width: 3, shortSt: true },
    fill: {
      fillType: 'tatami', spacing: 0.4, len: 3.5, angle: 45, pull: 0.2,
      underlay: 'edge+tatami', border: 'none', borderWidth: 2, borderLen: 2.5, split: 7,
    },
  };

  /* ---------- Hilfen ---------- */
  function push(out, p, j = 0) {
    const last = out[out.length - 1];
    if (!j && last && !last.j && Math.hypot(p.x - last.x, p.y - last.y) < 0.15) return;
    out.push({ x: p.x, y: p.y, j });
  }

  function runAlong(out, pl, len) {
    const r = G.resample(pl, len);
    for (const p of r) push(out, p);
  }

  // Lange Stiche teilen (Auto-Split) mit versetzten Teilungspunkten
  function splitStitch(out, a, b, maxLen, k) {
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (maxLen > 0 && L > maxLen) {
      const m = Math.ceil(L / (maxLen * 0.85));
      const st = (((k * 0.618) % 1) - 0.5) * (0.6 / m);
      for (let i = 1; i < m; i++) push(out, G.lerp(a, b, Math.min(0.97, Math.max(0.03, i / m + st))));
    }
    push(out, b);
  }

  /* ---------- Laufstich ---------- */
  function genRun(obj) {
    const p = obj.params;
    const path = G.buildPath(obj.points, p.closed);
    let pl = path.pts;
    if (p.closed && pl.length > 1) pl = pl.concat([pl[0]]);
    const base = G.resample(pl, p.len, 25, path.idx);
    const out = [];
    if (p.style === 'single') base.forEach((q) => push(out, q));
    else if (p.style === 'triple') {
      push(out, base[0]);
      for (let i = 1; i < base.length; i++) {
        push(out, base[i]);
        push(out, base[i - 1]);
        push(out, base[i]);
      }
    } else {
      // Bohnenstich (Hin-Zurück-Hin pro Stich, wie Hatch "Bean")
      push(out, base[0]);
      for (let i = 1; i < base.length; i++) {
        push(out, base[i]); push(out, base[i - 1]); push(out, base[i]);
      }
    }
    return out;
  }

  /* ---------- Satinsäulen ---------- */
  // Liefert Kreuzungen [{a: Punkt Schiene 1, b: Punkt Schiene 2}] im Abstand "spacing"
  function crossings(segPairs, spacing) {
    const res = [];
    segPairs.forEach((sp, si) => {
      const la = G.polyLength(sp.L), lb = G.polyLength(sp.R);
      // Dichte zwischen Mitte und Außenkante messen, damit Bögen außen nicht lückig werden
      const n = Math.max(1, Math.round(((la + lb) / 2 + Math.max(la, lb)) / 2 / spacing));
      for (let j = si === 0 ? 0 : 1; j <= n; j++) {
        res.push({ a: G.pointAt(sp.L, (la * j) / n), b: G.pointAt(sp.R, (lb * j) / n) });
      }
    });
    return res;
  }

  // Teilstück einer Polylinie zwischen den Bogenlängen s0 und s1
  function sliceArc(pl, s0, s1) {
    const out = [G.pointAt(pl, s0)];
    let acc = 0;
    for (let i = 1; i < pl.length; i++) {
      acc += G.dist(pl[i - 1], pl[i]);
      if (acc > s0 && acc < s1) out.push(pl[i]);
    }
    out.push(G.pointAt(pl, s1));
    return out;
  }

  // Schnitt einer Geraden (p, Richtung d) mit einer Polylinie -> Bogenlänge des nächsten Treffers
  function hitArc(pl, p, d) {
    let best = null, bt = Infinity, acc = 0;
    for (let i = 1; i < pl.length; i++) {
      const a = pl[i - 1], b = pl[i];
      const ex = b.x - a.x, ey = b.y - a.y, sl = Math.hypot(ex, ey);
      const den = d.x * ey - d.y * ex;
      if (Math.abs(den) > 1e-12) {
        const t = ((a.x - p.x) * ey - (a.y - p.y) * ex) / den;
        const u = ((a.x - p.x) * d.y - (a.y - p.y) * d.x) / den;
        if (u >= 0 && u <= 1 && Math.abs(t) < bt) { bt = Math.abs(t); best = acc + u * sl; }
      }
      acc += sl;
    }
    return best;
  }

  // Säule B: Stationen senkrecht zur Mittellinie, damit die Stiche in Bögen mitdrehen
  function turningPairs(L, R) {
    const la = G.polyLength(L), lb = G.polyLength(R);
    if (la < 0.5 || lb < 0.5) return [{ L, R }];
    const M = Math.max(4, Math.ceil(Math.max(la, lb) / 0.5));
    const mid = [];
    for (let i = 0; i <= M; i++) mid.push(G.lerp(G.pointAt(L, (la * i) / M), G.pointAt(R, (lb * i) / M), 0.5));
    const lm = G.polyLength(mid);
    const K = Math.max(1, Math.round(lm / 1.5));
    const sa = [0], sb = [0];
    for (let k = 1; k < K; k++) {
      const s = (lm * k) / K;
      const p = G.pointAt(mid, s), q = G.pointAt(mid, Math.min(lm, s + 0.3)), o = G.pointAt(mid, Math.max(0, s - 0.3));
      const tl = Math.hypot(q.x - o.x, q.y - o.y) || 1;
      const n = { x: -(q.y - o.y) / tl, y: (q.x - o.x) / tl };
      let a = hitArc(L, p, n), b = hitArc(R, p, n);
      const fa = (la * k) / K, fb = (lb * k) / K;
      // Fallback auf anteilige Position, Reihenfolge muss erhalten bleiben
      if (a === null || Math.abs(a - fa) > la * 0.25) a = fa;
      if (b === null || Math.abs(b - fb) > lb * 0.25) b = fb;
      if (a <= sa[sa.length - 1] + 0.05 || b <= sb[sb.length - 1] + 0.05 || a >= la - 0.05 || b >= lb - 0.05) continue;
      sa.push(a); sb.push(b);
    }
    sa.push(la); sb.push(lb);
    const segs = [];
    for (let k = 1; k < sa.length; k++) segs.push({ L: sliceArc(L, sa[k - 1], sa[k]), R: sliceArc(R, sb[k - 1], sb[k]) });
    return segs;
  }

  function railsFor(obj) {
    const pts = obj.points;
    if (obj.type === 'colA') {
      const L = [], R = [];
      for (let i = 0; i + 1 < pts.length; i += 2) { L.push(pts[i]); R.push(pts[i + 1]); }
      if (L.length < 2) return null;
      const pL = G.buildPath(L, false), pR = G.buildPath(R, false);
      const segs = [];
      for (let k = 0; k + 1 < L.length; k++) {
        segs.push({ L: pL.pts.slice(pL.idx[k], pL.idx[k + 1] + 1), R: pR.pts.slice(pR.idx[k], pR.idx[k + 1] + 1) });
      }
      return segs;
    }
    if (obj.type === 'colB') {
      if (pts.length < 2 || !obj.side2 || obj.side2.length < 2) return null;
      const L = G.buildPath(pts, false).pts;
      let R = G.buildPath(obj.side2, false).pts;
      const same = G.dist(L[0], R[0]) + G.dist(L[L.length - 1], R[R.length - 1]);
      const cross = G.dist(L[0], R[R.length - 1]) + G.dist(L[L.length - 1], R[0]);
      if (cross < same) R = R.slice().reverse();
      return turningPairs(L, R);
    }
    if (obj.type === 'colC' || obj.type === '_border') {
      if (pts.length < 2) return null;
      const closed = obj.type === '_border';
      let c = G.buildPath(pts, closed).pts;
      if (closed) c = c.concat([c[0]]);
      c = G.resample(c, 0.25, 180);
      const w = obj.params.width / 2;
      return [{ L: G.offsetPolyline(c, -w), R: G.offsetPolyline(c, w) }];
    }
    return null;
  }

  function genSatin(obj) {
    const p = obj.params;
    const segs = railsFor(obj);
    if (!segs) return [];
    // Abstand wie bei Hatch/Wilcom: von Einstich zu Einstich auf derselben Seite
    const cs = p.spacing / 2;
    const cr = crossings(segs, cs);
    if (cr.length < 2) return [];
    const out = [];
    const inset = (c, d) => {
      const L = G.dist(c.a, c.b);
      const t = L > 0 ? Math.min(0.45, d / L) : 0;
      return { a: G.lerp(c.a, c.b, t), b: G.lerp(c.b, c.a, t) };
    };
    // Unterlage
    const ul = p.underlay || 'none';
    const step = Math.max(1, Math.round(2 / cs));
    if (ul.includes('center')) {
      const mid = cr.map((c) => G.lerp(c.a, c.b, 0.5));
      runAlong(out, mid, 2.2);
      runAlong(out, mid.slice().reverse(), 2.2);
    }
    if (ul.includes('edge')) {
      const ins = cr.map((c) => inset(c, 0.4));
      runAlong(out, ins.map((c) => c.a), 2.2);
      runAlong(out, ins.map((c) => c.b).reverse(), 2.2);
      push(out, ins[0].a);
    }
    if (ul.includes('zigzag')) {
      const ins = cr.map((c) => inset(c, 0.5));
      for (let k = 0; k < ins.length; k += step) push(out, (k / step) % 2 ? ins[k].b : ins[k].a);
      for (let k = ins.length - 1 - Math.floor(step / 2); k >= 0; k -= step) push(out, (k / step) % 2 ? ins[k].a : ins[k].b);
      push(out, ins[0].a);
    }
    // Deckstich mit Zugkompensation
    const pc = p.pull || 0;
    const pens = cr.map((c, k) => {
      const L = G.dist(c.a, c.b) || 1;
      const ux = (c.b.x - c.a.x) / L, uy = (c.b.y - c.a.y) / L;
      const onA = k % 2 === 0;
      // Kurzstiche: an der Innenseite enger Bögen jeden zweiten Einstich nach innen versetzen
      if (p.shortSt !== false && k >= 2 && (k >> 1) % 2 === 1) {
        const side = onA ? G.dist(c.a, cr[k - 2].a) : G.dist(c.b, cr[k - 2].b);
        const lim = 0.6 * p.spacing;
        if (side < lim && L > 1.2) {
          const f = Math.min(0.4, ((lim - side) / lim) * 0.45);
          return onA ? G.lerp(c.a, c.b, f) : G.lerp(c.b, c.a, f);
        }
      }
      return onA ? { x: c.a.x - ux * pc, y: c.a.y - uy * pc } : { x: c.b.x + ux * pc, y: c.b.y + uy * pc };
    });
    push(out, pens[0]);
    for (let k = 1; k < pens.length; k++) splitStitch(out, pens[k - 1], pens[k], p.split, k);
    return out;
  }

  /* ---------- Flächenfüllung (Tatami / Satin mit festem Winkel) ---------- */
  function scanBlocks(rings, spacing) {
    const all = rings.flat();
    const bb = G.bbox(all);
    const rows = [];
    let r = 0;
    for (let y = bb.y0 + spacing / 2; y < bb.y1; y += spacing, r++) {
      const xs = [];
      for (const ring of rings) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const a = ring[j], b = ring[i];
          if ((a.y > y) !== (b.y > y)) xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
        }
      }
      xs.sort((u, v) => u - v);
      const segs = [];
      for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > 0.05) segs.push({ r, y, x0: xs[i], x1: xs[i + 1] });
      rows.push(segs);
    }
    // Zeilen-Segmente zu zusammenhängenden Blöcken verbinden
    const blocks = [];
    let active = [];
    for (const segs of rows) {
      const next = [];
      const ov = (a, b) => a.x0 < b.x1 && b.x0 < a.x1;
      const used = new Set();
      for (const s of segs) {
        const cand = active.filter((b) => ov(b.last, s));
        if (cand.length === 1) {
          const b = cand[0];
          const back = segs.filter((t) => ov(b.last, t));
          if (back.length === 1 && !used.has(b)) {
            b.rows.push(s); b.last = s; used.add(b); next.push(b);
            continue;
          }
        }
        const nb = { rows: [s], last: s };
        blocks.push(nb);
        next.push(nb);
      }
      active = next;
    }
    return blocks;
  }

  // Erzeugt Stiche für eine Füllung im gedrehten Koordinatensystem (Zeilen horizontal)
  function fillRotated(rings, o, startPt) {
    const blocks = scanBlocks(rings, o.spacing);
    const out = [];
    let cur = startPt;
    const remaining = blocks.filter((b) => b.rows.length);
    const done = [];
    // liegt der Punkt auf bereits gestickter Fläche?
    const covered = (pt) => done.some((b) => {
      const r0 = b.rows[0], r1 = b.rows[b.rows.length - 1];
      if (pt.y < Math.min(r0.y, r1.y) - o.spacing || pt.y > Math.max(r0.y, r1.y) + o.spacing) return false;
      return b.rows.some((s) => Math.abs(s.y - pt.y) <= o.spacing * 0.75 && pt.x > s.x0 + 0.3 && pt.x < s.x1 - 0.3);
    });
    const crossesDone = (a, b) => {
      const L = G.dist(a, b), n = Math.floor(L / 0.8);
      for (let i = 1; i < n; i++) if (covered(G.lerp(a, b, i / n))) return true;
      return false;
    };
    const travel = (from, to) => {
      if (!from) { push(out, to); return; }
      const d = G.dist(from, to);
      if (d < 0.5) { push(out, to); return; }
      if (G.segmentInside(from, to, rings) && !crossesDone(from, to)) { runAlong(out, [from, to], 3); return; }
      let best = null;
      for (const ring of rings) {
        const A = G.nearestOnRing(from, ring), B = G.nearestOnRing(to, ring);
        if (A.d < 0.3 && B.d < 0.3) { best = G.ringPath(ring, A, B); break; }
      }
      if (best && G.polyLength(best) < d * 4 + 10) { runAlong(out, best, 2.5); push(out, to); }
      else push(out, to, 1);
    };
    while (remaining.length) {
      let bi = 0, rev = false, side = 0, bd = Infinity;
      remaining.forEach((b, i) => {
        const f = b.rows[0], l = b.rows[b.rows.length - 1];
        const opts = [[f, false, 0], [f, false, 1], [l, true, 0], [l, true, 1]];
        for (const [s, rv, sd] of opts) {
          const pt = { x: sd ? s.x1 : s.x0, y: s.y };
          const d = cur ? G.dist(cur, pt) : (rv ? 1 : 0) + sd;
          if (d < bd) { bd = d; bi = i; rev = rv; side = sd; }
        }
      });
      const b = remaining.splice(bi, 1)[0];
      const rows = rev ? b.rows.slice().reverse() : b.rows;
      let dir = side; // 0: links→rechts
      const pc = o.pull || 0, ins = o.inset || 0;
      rows.forEach((s, k) => {
        let x0 = s.x0 - pc + ins, x1 = s.x1 + pc - ins;
        if (x1 - x0 < 0.3) { if (ins) return; const m = (x0 + x1) / 2; x0 = m - 0.15; x1 = m + 0.15; }
        const a = { x: dir ? x1 : x0, y: s.y }, e = { x: dir ? x0 : x1, y: s.y };
        if (k === 0) travel(cur, a);
        if (o.satin) {
          // Satin: nur Randeinstiche, abwechselnd
          if (k === 0) push(out, a);
          else splitStitch(out, out[out.length - 1], a, o.split, k);
          cur = a;
          dir = 1 - dir;
          return;
        } else {
          push(out, a);
          const L = o.len, offs = [0, 0.5, 0.25, 0.75][((s.r % 4) + 4) % 4] * L;
          const minEnd = L * 0.3;
          const xs = [];
          const g0 = Math.ceil((x0 + minEnd - offs) / L);
          for (let m = g0; offs + m * L < x1 - minEnd; m++) xs.push(offs + m * L);
          if (dir) xs.reverse();
          xs.forEach((x) => push(out, { x, y: s.y }));
          push(out, e);
        }
        cur = e;
        dir = 1 - dir;
      });
      done.push(b);
    }
    return { out, end: cur };
  }

  function fillRings(obj) {
    const outer = G.buildPath(obj.points, true).pts;
    const rings = [outer];
    for (const h of obj.holes || []) if (h.length >= 3) rings.push(G.buildPath(h, true).pts);
    return rings;
  }

  function genFill(obj) {
    const p = obj.params;
    if (obj.points.length < 3) return [];
    const rings = fillRings(obj);
    const ang = (p.angle * Math.PI) / 180;
    const out = [];
    const ul = p.underlay || 'none';
    let start = null;
    const addRot = (a, opts) => {
      const rr = rings.map((r) => r.map((q) => G.rot(q, -a)));
      const sp = start ? G.rot(start, -a) : null;
      const res = fillRotated(rr, opts, sp);
      res.out.forEach((q) => push(out, G.rot(q, a), q.j));
      if (out.length) start = out[out.length - 1];
    };
    if (ul.includes('edge')) {
      // Kantenlauf leicht nach innen versetzt
      const r0 = rings[0].concat([rings[0][0]]);
      const sgn = G.signedArea(rings[0]) > 0 ? 1 : -1;
      const off = G.offsetPolyline(G.resample(r0, 0.5, 180), 0.35 * sgn);
      const a = Math.abs(G.signedArea(off)), b = Math.abs(G.signedArea(G.offsetPolyline(G.resample(r0, 0.5, 180), -0.35 * sgn)));
      runAlong(out, a < b ? off : G.offsetPolyline(G.resample(r0, 0.5, 180), -0.35 * sgn), 2.5);
      start = out[out.length - 1];
    }
    if (ul.includes('tatami')) addRot(ang + Math.PI / 2, { spacing: 2.2, len: 3.5, pull: 0, inset: 0.45 });
    const satinFill = p.fillType === 'satin';
    addRot(ang, { spacing: satinFill ? p.spacing / 2 : p.spacing, len: p.len, pull: p.pull, satin: satinFill, split: p.split });
    if (p.border && p.border !== 'none') {
      const bo = { points: obj.points, params: {} };
      let bs;
      if (p.border === 'satin') {
        bs = genSatin({ type: '_border', points: obj.points, params: { ...DEFAULTS.satin, width: p.borderWidth, underlay: 'center' } });
      } else {
        bo.type = 'run';
        bo.params = { len: p.borderLen || 2.5, style: p.border === 'triple' ? 'triple' : 'single', closed: true };
        bs = genRun(bo);
      }
      if (bs.length) {
        const last = out[out.length - 1];
        if (last && G.dist(last, bs[0]) > 2) push(out, bs[0], 1);
        bs.forEach((q) => push(out, q, q.j));
      }
    }
    return out;
  }

  /* ---------- Manuelle Stiche ---------- */
  function genManual(obj) {
    return (obj.stitches || []).map((s) => ({ x: s.x, y: s.y, j: s.j ? 1 : 0 }));
  }

  function generate(obj) {
    switch (obj.type) {
      case 'run': return genRun(obj);
      case 'colA': case 'colB': case 'colC': return genSatin(obj);
      case 'fill': return genFill(obj);
      case 'manual': return genManual(obj);
      default: return [];
    }
  }

  HW.stitch = { DEFAULTS, generate, railsFor, fillRings };
})(typeof window !== 'undefined' ? window : globalThis);
