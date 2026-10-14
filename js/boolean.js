/* Formen verrechnen (Raster-Verfahren, 0,1 mm genau):
   Überlappungen entfernen, Vereinen, Ausschneiden, Schnittmenge, Teilen mit dem Messer. */
(function (g) {
  const HW = (g.HW = g.HW || {});
  const G = HW.geo;
  const RES = 10; // Rasterpunkte pro mm

  // Abdeckfläche eines Objekts als Ringe (Flächen: Umriss + Löcher, Säulen: Kantenpolygon)
  function ringsOf(o) {
    if (o.type === 'fill') return HW.stitch.fillRings(o);
    if (o.type === 'colA' || o.type === 'colB' || o.type === 'colC') {
      const segs = HW.stitch.railsFor(o);
      if (!segs) return null;
      const L = segs.flatMap((s) => s.L), R = segs.flatMap((s) => s.R);
      return [L.concat(R.slice().reverse())];
    }
    return null;
  }

  function grid(bb) {
    const x0 = bb.x0 - 0.3, y0 = bb.y0 - 0.3;
    const w = Math.ceil((bb.x1 - bb.x0 + 0.6) * RES) + 1, h = Math.ceil((bb.y1 - bb.y0 + 0.6) * RES) + 1;
    return { x0, y0, w, h };
  }

  function paint(gr, rings, mask, val = 1) {
    for (let r = 0; r < gr.h; r++) {
      const y = gr.y0 + (r + 0.5) / RES, xs = [];
      for (const ring of rings)
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const p = ring[i], q = ring[j];
          if ((p.y > y) !== (q.y > y)) xs.push(p.x + ((y - p.y) * (q.x - p.x)) / (q.y - p.y));
        }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k] - gr.x0) * RES - 0.5)), c1 = Math.min(gr.w - 1, Math.floor((xs[k + 1] - gr.x0) * RES - 0.5));
        for (let c = c0; c <= c1; c++) mask[r * gr.w + c] = val;
      }
    }
  }

  // Maske um r Rasterpunkte verkleinern (r>0) bzw. vergrößern (r<0)
  function morph(mask, w, h, r) {
    if (!r) return mask;
    const src = r > 0 ? mask : mask.map((v) => 1 - v);
    const dt = HW.satinauto.distanceTransform(src, w, h);
    const out = new Uint8Array(w * h);
    const k = Math.abs(r);
    for (let i = 0; i < w * h; i++) out[i] = r > 0 ? (dt[i] > k ? 1 : 0) : (dt[i] > k ? 0 : 1);
    return out;
  }

  // Maske -> Flächen (je zusammenhängendes Stück: Umriss + Löcher, in mm)
  function maskToShapes(gr, mask, minArea = 0.4) {
    const labels = new Int16Array(gr.w * gr.h);
    for (let i = 0; i < labels.length; i++) labels[i] = mask[i] ? 0 : -1;
    const { list } = HW.auto.components(labels, gr.w, gr.h);
    const out = [];
    for (const c of list) {
      if (c.label !== 0 || c.pixels.length / (RES * RES) < minArea) continue;
      const m = new Uint8Array(gr.w * gr.h);
      for (const p of c.pixels) m[p] = 1;
      const rings = HW.auto.traceMask(m, gr.w, gr.h).map((r) => HW.auto.smoothRing(r, 0.6)).filter((r) => r.length >= 3);
      if (!rings.length) continue;
      rings.sort((a, b) => Math.abs(G.signedArea(b)) - Math.abs(G.signedArea(a)));
      const tr = (p) => ({ x: gr.x0 + p.x / RES, y: gr.y0 + p.y / RES, c: p.c });
      out.push({ outer: rings[0].map(tr), holes: rings.slice(1).filter((r) => Math.abs(G.signedArea(r)) / (RES * RES) >= 0.3).map((r) => r.map(tr)), area: c.pixels.length / (RES * RES) });
    }
    return out;
  }

  const bbOf = (ringsList) => G.bbox(ringsList.flat().flat());
  const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

  /**
   * Zieht von Fläche o die Abdeckung der Objekte cutters ab.
   * keep: Überlappung in mm, die unter dem Rand des oberen Objekts erhalten bleibt (verhindert Lücken).
   * Rückgabe: null (unverändert) oder Liste neuer Formen {outer, holes}
   */
  function subtract(o, cutters, keep = 0.5) {
    const own = ringsOf(o);
    if (!own) return null;
    const ob = bbOf([own]);
    const cs = cutters.map((c) => ringsOf(c)).filter((r) => r && overlaps(bbOf([r]), ob));
    if (!cs.length) return null;
    const gr = grid(ob);
    const mask = new Uint8Array(gr.w * gr.h);
    paint(gr, own, mask);
    const before = mask.reduce((a, b) => a + b, 0);
    const cut = new Uint8Array(gr.w * gr.h);
    cs.forEach((r) => { const m = new Uint8Array(gr.w * gr.h); paint(gr, r, m); for (let i = 0; i < m.length; i++) if (m[i]) cut[i] = 1; });
    const cutE = morph(cut, gr.w, gr.h, Math.round(keep * RES));
    let removed = 0;
    for (let i = 0; i < mask.length; i++) if (mask[i] && cutE[i]) { mask[i] = 0; removed++; }
    if (removed < 0.3 * RES * RES || removed < before * 0.002) return null;
    return maskToShapes(gr, mask);
  }

  /** Vereinen / Ausschneiden / Schnittmenge mehrerer Flächen. op: 'union' | 'diff' | 'intersect' */
  function combine(objs, op) {
    const rl = objs.map(ringsOf).filter(Boolean);
    if (rl.length < 2) return null;
    const gr = grid(bbOf(rl));
    const masks = rl.map((r) => { const m = new Uint8Array(gr.w * gr.h); paint(gr, r, m); return m; });
    const res = new Uint8Array(gr.w * gr.h);
    for (let i = 0; i < res.length; i++) {
      if (op === 'union') res[i] = masks.some((m) => m[i]) ? 1 : 0;
      else if (op === 'intersect') res[i] = masks.every((m) => m[i]) ? 1 : 0;
      else res[i] = masks[0][i] && !masks.slice(1).some((m) => m[i]) ? 1 : 0;
    }
    return maskToShapes(gr, res);
  }

  /** Fläche entlang einer Linie a-b teilen */
  function knife(o, a, b) {
    const own = ringsOf(o);
    if (!own || o.type !== 'fill') return null;
    const gr = grid(bbOf([own]));
    const mask = new Uint8Array(gr.w * gr.h);
    paint(gr, own, mask);
    // Schnittlinie (verlängert über die ganze Fläche) 1 Rasterpunkt breit
    const d = G.dist(a, b) || 1, ux = (b.x - a.x) / d, uy = (b.y - a.y) / d;
    const L = (gr.w + gr.h) / RES;
    const p0 = { x: a.x - ux * L, y: a.y - uy * L };
    const n = Math.ceil(2 * L * RES * 2);
    let hit = 0;
    for (let i = 0; i <= n; i++) {
      const x = p0.x + (ux * 2 * L * i) / n, y = p0.y + (uy * 2 * L * i) / n;
      const c = Math.floor((x - gr.x0) * RES), r = Math.floor((y - gr.y0) * RES);
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) {
        const cc = c + dx, rr = r + dy;
        if (cc >= 0 && rr >= 0 && cc < gr.w && rr < gr.h && mask[rr * gr.w + cc]) { mask[rr * gr.w + cc] = 0; hit++; }
      }
    }
    if (!hit) return null;
    const parts = maskToShapes(gr, mask);
    return parts.length > 1 ? parts : null;
  }

  /** Überdeckungs-Prüfung: Fläche wird von späteren Objekten komplett verdeckt? */
  function coveredFraction(o, cutters) {
    const own = ringsOf(o);
    if (!own) return 0;
    const gr = grid(bbOf([own]));
    const mask = new Uint8Array(gr.w * gr.h), cut = new Uint8Array(gr.w * gr.h);
    paint(gr, own, mask);
    cutters.map(ringsOf).filter(Boolean).forEach((r) => paint(gr, r, cut));
    let a = 0, c = 0;
    for (let i = 0; i < mask.length; i++) if (mask[i]) { a++; if (cut[i]) c++; }
    return a ? c / a : 0;
  }

  HW.boolean = { ringsOf, subtract, combine, knife, coveredFraction, maskToShapes, paint, grid, morph, RES };
})(typeof window !== 'undefined' ? window : globalThis);
