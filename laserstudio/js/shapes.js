/* Zeichenobjekte. Jedes Objekt hat eigene Parameter (lokal) und eine Matrix tf (lokal -> Werkstück-mm).
   Arten: path, rect, ellipse, polygon, star, text (auch im Bogen), poly (importierte Linien), image (Graustufenbild für die Gravur). */
(function (g) {
  const FS = (g.FS = g.FS || {});
  const { M, geo, poly, util } = FS;

  const KIND_NAMES = {
    path: 'Linienzug', rect: 'Rechteck', ellipse: 'Ellipse', polygon: 'Vieleck', star: 'Stern',
    text: 'Text', poly: 'Import', image: 'Bild',
  };

  function make(kind, props) {
    const o = { id: util.uid(), kind, tf: M.id(), ...props };
    if (!o.name) o.name = KIND_NAMES[kind] || kind;
    return o;
  }

  // lokale Geometrie: Liste {pts, closed}
  function localLines(o) {
    switch (o.kind) {
      case 'path':
        return o.nodes.length > 1 ? [{ pts: geo.buildPath(o.nodes, !!o.closed), closed: !!o.closed && o.nodes.length > 2 }] : [];
      case 'rect': {
        const w = o.w / 2, h = o.h / 2, r = Math.min(o.r || 0, w, h);
        if (r <= 1e-6) return [{ pts: [{ x: -w, y: -h }, { x: w, y: -h }, { x: w, y: h }, { x: -w, y: h }], closed: true }];
        const pts = [];
        const corner = (cx, cy, a0) => pts.push(...geo.ellipsePts(cx, cy, r, r, 0.01, a0, Math.PI / 2));
        corner(w - r, -h + r, -Math.PI / 2); corner(w - r, h - r, 0); corner(-w + r, h - r, Math.PI / 2); corner(-w + r, -h + r, Math.PI);
        return [{ pts, closed: true }];
      }
      case 'ellipse':
        return [{ pts: geo.ellipsePts(0, 0, o.rx, o.ry, 0.01), closed: true }];
      case 'polygon':
      case 'star': {
        const n = Math.max(3, o.n | 0), pts = [];
        const steps = o.kind === 'star' ? n * 2 : n;
        for (let i = 0; i < steps; i++) {
          const a = Math.PI / 2 + (i * 2 * Math.PI) / steps;
          const r = o.kind === 'star' && i % 2 ? o.r * (o.inner || 0.5) : o.r;
          pts.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
        }
        return [{ pts, closed: true }];
      }
      case 'text': {
        if (!o._cache || o._cache.key !== textKey(o)) {
          let rings = [];
          try { rings = FS.ttf.textRings(o.text, o); } catch (e) { rings = []; }
          // Schrift-Konturen nach Nicht-Null-Regel vereinen (überlappende Schreibschrift)
          if (o.arc) rings = bendRings(rings, o.arc);
          rings = rings.length ? poly.clip(rings, null, 'union', 'nonzero') : [];
          Object.defineProperty(o, '_cache', { value: { key: textKey(o), lines: rings.map((pts) => ({ pts, closed: true })) }, writable: true, configurable: true, enumerable: false });
        }
        return o._cache.lines;
      }
      case 'poly':
        return o.lines;
      case 'image': {
        const w = o.w / 2, h = o.h / 2;
        return [{ pts: [{ x: -w, y: -h }, { x: w, y: -h }, { x: w, y: h }, { x: -w, y: h }], closed: true }];
      }
    }
    return [];
  }
  const textKey = (o) => [o.text, o.font, o.size, o.align, o.spacing, o.lineHeight, o.arc || 0].join('|');

  // Text im Bogen: Mitte der ersten Zeile liegt oben auf einem Kreis mit Radius |R| (R < 0: nach unten gebogen)
  function bendRings(rings, R) {
    const all = rings.flat();
    if (!all.length || !R) return rings;
    const b = geo.bounds([all]), cx = (b.x0 + b.x1) / 2;
    const map = (p) => {
      const t = (p.x - cx) / R, r = R + p.y;
      return { x: r * Math.sin(t), y: r * Math.cos(t) - R };
    };
    return rings.map((ring) => {
      const out = [];
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], c = ring[(i + 1) % ring.length], n = Math.max(1, Math.ceil(geo.dist(a, c) / 0.5));
        for (let k = 0; k < n; k++) out.push(map(geo.lerp(a, c, k / n)));
      }
      return out;
    });
  }

  function lines(o) {
    const m = o.tf;
    const flip = m[0] * m[3] - m[1] * m[2] < 0;
    return localLines(o).map((l) => {
      const pts = l.pts.map((p) => M.apply(m, p));
      return { pts: flip && l.closed ? pts.reverse() : pts, closed: l.closed };
    });
  }

  // geschlossene Ringe mehrerer Objekte (Bilder ausgenommen)
  function rings(objs) {
    const out = [];
    for (const o of objs) if (o.kind !== 'image') for (const l of lines(o)) if (l.closed && l.pts.length > 2) out.push(l.pts);
    return out;
  }
  function openLines(objs) {
    const out = [];
    for (const o of objs) if (o.kind !== 'image') for (const l of lines(o)) if (!l.closed && l.pts.length > 1) out.push(l.pts);
    return out;
  }

  function bbox(objs) {
    const all = [];
    for (const o of objs) for (const l of lines(o)) all.push(l.pts);
    return all.length ? geo.bounds(all) : null;
  }

  function hit(o, p, tol) {
    const ls = lines(o);
    for (const l of ls) {
      const pts = l.pts;
      for (let i = 1; i < pts.length; i++) if (geo.segDist(p, pts[i - 1], pts[i]) < tol) return true;
      if (l.closed && pts.length > 2 && geo.segDist(p, pts[pts.length - 1], pts[0]) < tol) return true;
    }
    if (o.kind === 'image') return geo.pointInPoly(p, ls[0].pts);
    // Innenfläche geschlossener Formen ist ebenfalls anklickbar (gerade-ungerade)
    let inside = false;
    for (const l of ls) if (l.closed && geo.pointInPoly(p, l.pts)) inside = !inside;
    return inside;
  }

  function transform(o, m) { o.tf = M.mul(m, o.tf); }

  // Objekt in einen bearbeitbaren Linienzug / Import umwandeln (Matrix wird eingerechnet)
  function toPoly(o) {
    return make('poly', { name: o.name, lines: lines(o).map((l) => ({ pts: l.pts.map((p) => ({ x: p.x, y: p.y })), closed: l.closed })) });
  }

  FS.shapes = { make, localLines, lines, rings, openLines, bbox, hit, transform, toPoly, bendRings, KIND_NAMES };
})(typeof window !== 'undefined' ? window : globalThis);
