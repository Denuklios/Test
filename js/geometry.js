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
   * Wie in Hatch: Eckpunkte erzeugen Knicke, Kurvenpunkte glatte Übergänge.
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

  HW.geo = { removeLoops, dist, lerp, rot, polyLength, buildPath, resample, pointAt, offsetPolyline, signedArea, pointInRings, segmentInside, distToSeg, nearestOnRing, ringPath, rdp, bbox };
})(typeof window !== 'undefined' ? window : globalThis);
