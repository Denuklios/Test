/* FräsStudio – Grundfunktionen: Geometrie, Kurven, Matrizen, Polygon-Verrechnung (Clipper).
   Alle Koordinaten in Millimetern. Y zeigt nach oben (wie an der Maschine). */
(function (g) {
  const FS = (g.FS = g.FS || {});
  const CL = g.ClipperLib || (typeof require !== 'undefined' ? require('./lib/clipper.js') : null);
  FS.ClipperLib = CL;

  const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

  function signedArea(pl) {
    let A = 0;
    for (let i = 0, n = pl.length; i < n; i++) {
      const a = pl[i], b = pl[(i + 1) % n];
      A += a.x * b.y - b.x * a.y;
    }
    return A / 2;
  }

  function polyLength(pl, closed) {
    let L = 0;
    for (let i = 1; i < pl.length; i++) L += dist(pl[i - 1], pl[i]);
    if (closed && pl.length > 2) L += dist(pl[pl.length - 1], pl[0]);
    return L;
  }

  function pointInPoly(p, pl) {
    let inside = false;
    for (let i = 0, j = pl.length - 1; i < pl.length; j = i++) {
      const a = pl[i], b = pl[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }

  function bounds(polys) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const pl of polys) for (const p of pl.pts || pl) {
      if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
    }
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
  }

  function segDist(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
    let t = L2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
  }

  // Ramer-Douglas-Peucker (für schlanken G-Code)
  function simplify(pl, tol) {
    if (pl.length < 3) return pl.slice();
    const keep = new Uint8Array(pl.length);
    keep[0] = keep[pl.length - 1] = 1;
    const stack = [[0, pl.length - 1]];
    while (stack.length) {
      const [s, e] = stack.pop();
      let md = 0, mi = -1;
      for (let i = s + 1; i < e; i++) {
        const d = segDist(pl[i], pl[s], pl[e]);
        if (d > md) { md = d; mi = i; }
      }
      if (md > tol && mi > 0) { keep[mi] = 1; stack.push([s, mi], [mi, e]); }
    }
    return pl.filter((_, i) => keep[i]);
  }

  // Hermite-Segment zwischen p1 und p2 mit Tangenten m1, m2
  function hermite(p1, p2, m1, m2, n, out) {
    for (let i = 1; i <= n; i++) {
      const t = i / n, t2 = t * t, t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
      out.push({ x: h00 * p1.x + h10 * m1.x + h01 * p2.x + h11 * m2.x, y: h00 * p1.y + h10 * m1.y + h01 * p2.y + h11 * m2.y });
    }
  }

  /**
   * Kontrollpunkte {x,y,c} (c=true: Kurvenpunkt, sonst Eckpunkt) -> Polylinie.
   * Gleiche Bedienlogik wie in StickStudio: Linksklick Ecke, Rechtsklick Kurve.
   */
  function buildPath(cps, closed, step = 0.25) {
    const n = cps.length;
    if (n === 0) return [];
    if (n === 1) return [{ x: cps[0].x, y: cps[0].y }];
    const get = (i) => (closed ? cps[(i + n) % n] : cps[Math.max(0, Math.min(n - 1, i))]);
    const tangent = (i, dirNext) => {
      const p = get(i);
      if (!p.c || (!closed && (i === 0 || i === n - 1))) {
        const q = dirNext ? get(i + 1) : get(i - 1);
        const v = dirNext ? { x: q.x - p.x, y: q.y - p.y } : { x: p.x - q.x, y: p.y - q.y };
        const l = Math.hypot(v.x, v.y) || 1;
        return { x: v.x / l, y: v.y / l, corner: !p.c };
      }
      const a = get(i - 1), b = get(i + 1);
      const v = { x: b.x - a.x, y: b.y - a.y }, l = Math.hypot(v.x, v.y) || 1;
      return { x: v.x / l, y: v.y / l };
    };
    const pts = [{ x: cps[0].x, y: cps[0].y }];
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const p1 = get(i), p2 = get(i + 1);
      const m1 = tangent(i, true), m2 = tangent(i + 1, false);
      const L = dist(p1, p2);
      if ((m1.corner && m2.corner) || L < 1e-9) pts.push({ x: p2.x, y: p2.y });
      else hermite(p1, p2, { x: m1.x * L, y: m1.y * L }, { x: m2.x * L, y: m2.y * L }, Math.max(6, Math.min(200, Math.ceil(L / step))), pts);
    }
    if (closed) pts.pop();
    return pts;
  }

  function flattenCubic(out, p0, p1, p2, p3, tol = 0.05) {
    const L = dist(p0, p1) + dist(p1, p2) + dist(p2, p3);
    const n = Math.max(2, Math.min(400, Math.ceil(Math.sqrt(L / tol) * 1.2)));
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      out.push({
        x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
        y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
      });
    }
  }
  function flattenQuad(out, p0, p1, p2, tol = 0.05) {
    flattenCubic(out, p0, lerp(p0, p1, 2 / 3), lerp(p2, p1, 2 / 3), p2, tol);
  }

  // Kreis/Ellipse als Polygon (Sehnenfehler <= tol)
  function ellipsePts(cx, cy, rx, ry, tol = 0.02, a0 = 0, sweep = Math.PI * 2) {
    const r = Math.max(rx, ry, 1e-6);
    const da = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - tol / r)));
    const n = Math.max(8, Math.min(2000, Math.ceil(Math.abs(sweep) / Math.max(da, 1e-3))));
    const out = [];
    const full = Math.abs(Math.abs(sweep) - Math.PI * 2) < 1e-9;
    for (let i = 0; i < (full ? n : n + 1); i++) {
      const a = a0 + (sweep * i) / n;
      out.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
    }
    return out;
  }

  // ---------- Affine Matrix [a b c d e f]: x' = a x + c y + e, y' = b x + d y + f ----------
  const M = {
    id: () => [1, 0, 0, 1, 0, 0],
    mul: (m, n) => [
      m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
      m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
    ],
    inv: (m) => {
      const det = m[0] * m[3] - m[1] * m[2] || 1e-12;
      return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det,
        (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
    },
    apply: (m, p) => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] }),
    translate: (x, y) => [1, 0, 0, 1, x, y],
    scale: (sx, sy, cx = 0, cy = 0) => [sx, 0, 0, sy, cx - sx * cx, cy - sy * cy],
    rotate: (a, cx = 0, cy = 0) => {
      const c = Math.cos(a), s = Math.sin(a);
      return [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy];
    },
  };

  // ---------- Polygon-Verrechnung mit Clipper ----------
  const SC = 1000; // 1 µm Auflösung
  const toC = (pl) => pl.map((p) => ({ X: Math.round(p.x * SC), Y: Math.round(p.y * SC) }));
  const fromC = (pl) => pl.map((p) => ({ x: p.X / SC, y: p.Y / SC }));

  /** Versatz geschlossener Polygone (d>0 außen, d<0 innen). Liefert Liste von Ringen. */
  function offset(rings, d, join = 'round', arcTol = 0.01) {
    const co = new CL.ClipperOffset(2, arcTol * SC);
    const jt = join === 'miter' ? CL.JoinType.jtMiter : join === 'square' ? CL.JoinType.jtSquare : CL.JoinType.jtRound;
    co.AddPaths(rings.map(toC), jt, CL.EndType.etClosedPolygon);
    const sol = new CL.Paths();
    co.Execute(sol, d * SC);
    return sol.map(fromC).filter((r) => r.length > 2);
  }

  /** Boolesche Verknüpfung: op = union | difference | intersection | xor. Füllregel: gerade-ungerade für Subjekt. */
  function clip(subject, clipRings, op, fill = 'evenodd') {
    const c = new CL.Clipper();
    c.AddPaths(subject.map(toC), CL.PolyType.ptSubject, true);
    if (clipRings && clipRings.length) c.AddPaths(clipRings.map(toC), CL.PolyType.ptClip, true);
    const ct = { union: CL.ClipType.ctUnion, difference: CL.ClipType.ctDifference, intersection: CL.ClipType.ctIntersection, xor: CL.ClipType.ctXor }[op];
    const ft = fill === 'nonzero' ? CL.PolyFillType.pftNonZero : CL.PolyFillType.pftEvenOdd;
    const sol = new CL.Paths();
    c.Execute(ct, sol, ft, ft);
    return sol.map(fromC).filter((r) => r.length > 2);
  }

  /** Offene Linien an Flächen beschneiden (inside=true: Teile innerhalb behalten). */
  function clipLines(lines, rings, inside = true) {
    const c = new CL.Clipper();
    c.AddPaths(lines.map(toC), CL.PolyType.ptSubject, false);
    c.AddPaths(rings.map(toC), CL.PolyType.ptClip, true);
    const tree = new CL.PolyTree();
    c.Execute(inside ? CL.ClipType.ctIntersection : CL.ClipType.ctDifference, tree, CL.PolyFillType.pftEvenOdd, CL.PolyFillType.pftEvenOdd);
    return CL.Clipper.OpenPathsFromPolyTree(tree).map(fromC).filter((l) => l.length > 1);
  }

  /** Ringe zu Flächen mit Löchern gruppieren (gerade-ungerade Verschachtelung). */
  function nest(rings) {
    const c = new CL.Clipper();
    c.AddPaths(rings.map(toC), CL.PolyType.ptSubject, true);
    const tree = new CL.PolyTree();
    c.Execute(CL.ClipType.ctUnion, tree, CL.PolyFillType.pftEvenOdd, CL.PolyFillType.pftEvenOdd);
    const out = [];
    const walk = (node) => {
      for (const ch of node.Childs()) {
        if (!ch.IsHole()) {
          out.push({ outer: fromC(ch.Contour()), holes: ch.Childs().map((h) => fromC(h.Contour())) });
          for (const h of ch.Childs()) walk(h);
        }
      }
    };
    walk(tree);
    return out.filter((s) => s.outer.length > 2);
  }

  /** Versatz mit Erhalt der Verschachtelung: liefert Liste von {outer, holes}. */
  function offsetShapes(rings, d) {
    return nest(offset(clip(rings, null, 'union'), d));
  }

  // Ringe so drehen, dass Außenkonturen gegen den Uhrzeigersinn laufen und Löcher im Uhrzeigersinn
  function orient(ring, ccw) {
    const a = signedArea(ring);
    return (a > 0) === ccw ? ring : ring.slice().reverse();
  }

  // ---------- kleine Helfer ----------
  const uid = () => Math.random().toString(36).slice(2, 10);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // Zahlen für die Anzeige im Format der gewählten Sprache (12,5 bzw. 12.5)
  const locale = () => (g.HW && g.HW.i18n ? g.HW.i18n.locale() : 'de-DE');
  const fmt = (v, d = 2) => (Math.round(v * 10 ** d) / 10 ** d).toLocaleString(locale(), { maximumFractionDigits: d });
  const deep = (o) => JSON.parse(JSON.stringify(o));

  FS.geo = { dist, lerp, signedArea, polyLength, pointInPoly, bounds, segDist, simplify, buildPath, flattenCubic, flattenQuad, ellipsePts, orient };
  FS.M = M;
  FS.poly = { offset, clip, clipLines, nest, offsetShapes, SC };
  FS.util = { uid, clamp, fmt, deep, locale };
  if (typeof module !== 'undefined') module.exports = FS;
})(typeof window !== 'undefined' ? window : globalThis);
