/* Text-Effekte: einzelne Buchstaben verschieben/drehen/skalieren, Hüllformen (Welle, Bogen, Wimpel, Raute …)
   und Text entlang einer Linie. Arbeitet auf fertigen Stickobjekten (Satinsäulen, Flächen, Laufstiche). */
(function (g) {
  const HW = (g.HW = g.HW || {});
  const G = HW.geo;

  const arraysOf = (o) => [o.points, ...(o.holes || [])].filter(Boolean);
  function bbOf(objs) { return G.bbox(objs.flatMap((o) => arraysOf(o).flat())); }

  // Kontrollpunkte verdichten, damit gerade Kanten bei Verformung mitbiegen
  function densify(o, step = 0.8) {
    if (o.type === 'colA') {
      const L = [], R = [];
      for (let i = 0; i + 1 < o.points.length; i += 2) { L.push(o.points[i]); R.push(o.points[i + 1]); }
      if (L.length < 2) return;
      const pL = G.buildPath(L, false), pR = G.buildPath(R, false);
      const out = [];
      for (let k = 0; k + 1 < L.length; k++) {
        const a = pL.pts.slice(pL.idx[k], pL.idx[k + 1] + 1), b = pR.pts.slice(pR.idx[k], pR.idx[k + 1] + 1);
        const n = Math.max(1, Math.ceil(Math.max(G.polyLength(a), G.polyLength(b)) / step));
        const la = G.polyLength(a), lb = G.polyLength(b);
        for (let j = 0; j < n; j++) out.push({ ...G.pointAt(a, (la * j) / n), c: false }, { ...G.pointAt(b, (lb * j) / n), c: false });
      }
      out.push({ ...L[L.length - 1], c: false }, { ...R[R.length - 1], c: false });
      o.points = out;
      return;
    }
    const closed = o.type === 'fill' || (o.params && o.params.closed);
    const dens = (arr) => {
      const pts = G.buildPath(arr, closed).pts;
      const q = closed ? pts.concat([pts[0]]) : pts;
      const r = G.resample(q, step, 20);
      if (closed) r.pop();
      return r.map((p) => ({ x: p.x, y: p.y, c: false }));
    };
    o.points = dens(o.points);
    if (o.holes) o.holes = o.holes.map(dens);
  }

  function mapAll(objs, f) {
    for (const o of objs) for (const arr of arraysOf(o)) arr.forEach((p) => { const q = f(p); p.x = q.x; p.y = q.y; });
  }

  /** Einzelne Zeichen anpassen. adj: { [gi]: {dx, dy, rot (°), scale (%)} } – o.gi = Zeichennummer */
  function glyphAdjust(objs, adj) {
    if (!adj) return;
    for (const gi of Object.keys(adj)) {
      const a = adj[gi];
      if (!a) continue;
      const mine = objs.filter((o) => String(o.gi) === String(gi));
      if (!mine.length) continue;
      const b = bbOf(mine), c = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
      const s = (a.scale || 100) / 100, r = ((a.rot || 0) * Math.PI) / 180, co = Math.cos(r), si = Math.sin(r);
      mapAll(mine, (p) => {
        const x = (p.x - c.x) * s, y = (p.y - c.y) * s;
        return { x: c.x + x * co - y * si + (a.dx || 0), y: c.y + x * si + y * co + (a.dy || 0) };
      });
      if (a.rot) mine.forEach((o) => { if (o.type === 'fill') o.params.angle = (o.params.angle || 0) + a.rot; });
    }
  }

  const ENVELOPES = [
    ['none', 'keine'], ['arch', 'Bogen (ganz)'], ['bridge', 'Brücke (oben gewölbt)'], ['valley', 'Tal (unten gewölbt)'],
    ['wave', 'Welle'], ['pennant', 'Wimpel'], ['rhombus', 'Raute'], ['bulge', 'Wölbung'], ['pinch', 'Taille'],
  ];

  /** Hüllform. A = Stärke in mm */
  function envelope(objs, type, A) {
    if (!type || type === 'none' || !A || !objs.length) return;
    objs.forEach((o) => densify(o));
    const b = bbOf(objs), W = b.x1 - b.x0 || 1, H = b.y1 - b.y0 || 1, cy = (b.y0 + b.y1) / 2;
    const k = A / H;
    const f = {
      arch: (u) => ({ dy: -A * Math.sin(Math.PI * u), s: 1 }),
      wave: (u) => ({ dy: A * Math.sin(2 * Math.PI * u), s: 1 }),
      pennant: (u) => ({ dy: 0, s: Math.max(0.1, 1 - k * u) }),
      rhombus: (u) => ({ dy: 0, s: Math.max(0.1, 1 - k * Math.abs(2 * u - 1)) }),
      bulge: (u) => ({ dy: 0, s: Math.max(0.1, 1 - k * (1 - Math.sin(Math.PI * u))) }),
      pinch: (u) => ({ dy: 0, s: Math.max(0.1, 1 - k * Math.sin(Math.PI * u)) }),
    }[type];
    mapAll(objs, (p) => {
      const u = (p.x - b.x0) / W, v = (p.y - b.y0) / H;
      if (type === 'bridge') return { x: p.x, y: p.y - A * Math.sin(Math.PI * u) * (1 - v) };
      if (type === 'valley') return { x: p.x, y: p.y + A * Math.sin(Math.PI * u) * v };
      const r = f(u);
      return { x: p.x, y: cy + (p.y - cy) * r.s + r.dy };
    });
  }

  /**
   * Text entlang einer Linie: x → Weg entlang der Linie, Höhe über der Grundlinie → Abstand senkrecht zur Linie.
   * path: Punkte (mm), side: 1 = Text über der Linie, -1 = darunter; align: 'center' | 'start' | 'end'
   */
  function onPath(objs, path, side = 1, align = 'center', offset = 0) {
    if (!path || path.length < 2 || !objs.length) return;
    objs.forEach((o) => densify(o));
    const pl = G.resample(path, 0.3, 10);
    const cum = [0];
    for (let i = 1; i < pl.length; i++) cum.push(cum[i - 1] + G.dist(pl[i - 1], pl[i]));
    const L = cum[cum.length - 1];
    const b = bbOf(objs), W = b.x1 - b.x0;
    const base = side > 0 ? b.y1 : b.y0; // Grundlinie: Unterkante (über der Linie) bzw. Oberkante (darunter)
    const s0 = align === 'start' ? 0 : align === 'end' ? L - W : (L - W) / 2;
    const at = (s) => {
      // Punkt + Tangente bei Weglänge s (außerhalb: geradlinig verlängert)
      let i = 1;
      if (s <= 0) i = 1; else if (s >= L) i = pl.length - 1; else while (i < pl.length - 1 && cum[i] < s) i++;
      const a = pl[i - 1], c = pl[i], d = cum[i] - cum[i - 1] || 1;
      const t = (s - cum[i - 1]) / d;
      return { p: { x: a.x + (c.x - a.x) * t, y: a.y + (c.y - a.y) * t }, tx: (c.x - a.x) / d, ty: (c.y - a.y) / d };
    };
    // Füllwinkel mitdrehen (Richtung der Linie an der Stelle der Fläche, vor dem Verformen bestimmt)
    const dAng = new Map();
    objs.forEach((o) => {
      if (o.type !== 'fill') return;
      const ob = bbOf([o]);
      const r = at(s0 + offset + ((ob.x0 + ob.x1) / 2 - b.x0));
      dAng.set(o, (Math.atan2(r.ty, r.tx) * 180) / Math.PI);
    });
    mapAll(objs, (p) => {
      const r = at(s0 + offset + (p.x - b.x0));
      const h = side > 0 ? base - p.y : p.y - base; // Abstand von der Grundlinie (nach außen positiv)
      const nx = r.ty * side, ny = -r.tx * side; // Normale auf der gewählten Seite
      return { x: r.p.x + nx * h, y: r.p.y + ny * h };
    });
    dAng.forEach((d, o) => { o.params.angle = (o.params.angle || 0) + d; });
  }

  HW.textfx = { densify, glyphAdjust, envelope, onPath, ENVELOPES, bbOf };
})(typeof window !== 'undefined' ? window : globalThis);
