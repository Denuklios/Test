/* Präzisions-Scan: Kanten aus dem Bild auf Bruchteile eines Pixels genau bestimmen.
   Statt der Pixelstufen einer Maske wird aus den Farbabständen ein weiches Feld gebildet
   (0,5 = genau auf der Kante) und dort die Linie nachgezogen (Marching Squares). Danach wird die Linie
   nur entlang ihrer Länge geglättet; echte Ecken bleiben stehen. Alles in Millimetern. */
(function (g) {
  const HW = (g.HW = g.HW || {});
  const G = HW.geo;

  /* ---------- Weiches Zugehörigkeitsfeld ---------- */
  // Pro Pixel: Verhältnis aus Abstand zur nächsten fremden Farbe und Gesamtabstand.
  // >0,5: gehört zur Farbe, <0,5: gehört nicht dazu; genau 0,5 auf der Kante (auch bei weichen Kanten im Bild)
  function membership(data, w, h, centers, label, alphaMin = 128) {
    const f = new Float32Array(w * h);
    const c = centers[label];
    for (let i = 0; i < w * h; i++) {
      const r = data[i * 4], gg = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3];
      if (a < alphaMin * 0.5) { f[i] = 0; continue; }
      const ds = Math.sqrt((r - c[0]) ** 2 * 0.9 + (gg - c[1]) ** 2 * 1.2 + (b - c[2]) ** 2 * 0.8);
      let dm = Infinity;
      for (let k = 0; k < centers.length; k++) {
        if (k === label) continue;
        const o = centers[k];
        const d = Math.sqrt((r - o[0]) ** 2 * 0.9 + (gg - o[1]) ** 2 * 1.2 + (b - o[2]) ** 2 * 0.8);
        if (d < dm) dm = d;
      }
      if (!isFinite(dm)) dm = 255;
      f[i] = ds + dm < 1e-6 ? 0.5 : dm / (ds + dm);
    }
    return f;
  }

  // Gauß-Weichzeichner (getrennt), sigma in Pixeln
  function blur(src, w, h, sigma) {
    if (sigma < 0.3) return src;
    const r = Math.max(1, Math.ceil(sigma * 2.5));
    const k = new Float32Array(2 * r + 1);
    let s = 0;
    for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); s += k[i + r]; }
    for (let i = 0; i < k.length; i++) k[i] /= s;
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let a = 0;
        for (let i = -r; i <= r; i++) a += src[y * w + Math.min(w - 1, Math.max(0, x + i))] * k[i + r];
        tmp[y * w + x] = a;
      }
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let a = 0;
        for (let i = -r; i <= r; i++) a += tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x] * k[i + r];
        out[y * w + x] = a;
      }
    return out;
  }

  /* ---------- Marching Squares ---------- */
  // Liefert geschlossene Ringe [{x,y}] in Pixelkoordinaten (Pixelmitte = +0,5) auf der Höhenlinie "level"
  function contours(f, w, h, level = 0.5) {
    // Kantenschlüssel: horizontale Kante (x,y)-(x+1,y) = (y*w+x)*2, senkrechte (x,y)-(x,y+1) = (y*w+x)*2+1
    const at = (x, y) => f[y * w + x];
    const ptH = (x, y) => { const a = at(x, y), b = at(x + 1, y), t = (level - a) / (b - a); return { x: x + t + 0.5, y: y + 0.5 }; };
    const ptV = (x, y) => { const a = at(x, y), b = at(x, y + 1), t = (level - a) / (b - a); return { x: x + 0.5, y: y + t + 0.5 }; };
    const next = new Map();
    const link = (ka, kb) => { if (!next.has(ka)) next.set(ka, []); next.get(ka).push(kb); };
    const keyH = (x, y) => (y * w + x) * 2, keyV = (x, y) => (y * w + x) * 2 + 1;
    const pt = (k) => { const o = k & 1, i = k >> 1, x = i % w, y = (i / w) | 0; return o ? ptV(x, y) : ptH(x, y); };
    const mid = { T: [0.5, 0], R: [1, 0.5], B: [0.5, 1], L: [0, 0.5] };
    const cornerPos = { a: [0, 0], b: [1, 0], c: [1, 1], d: [0, 1] };
    // Richtung so wählen, dass das Innere (>= level) immer auf derselben Seite der Laufrichtung liegt
    const seg = (e1, e2, ref, refInside, K) => {
      const p = mid[e1], q = mid[e2], c = cornerPos[ref];
      const cr = (q[0] - p[0]) * (c[1] - p[1]) - (q[1] - p[1]) * (c[0] - p[0]);
      const forward = refInside ? cr > 0 : cr < 0;
      if (forward) link(K[e1], K[e2]); else link(K[e2], K[e1]);
    };
    for (let y = 0; y < h - 1; y++)
      for (let x = 0; x < w - 1; x++) {
        const va = at(x, y), vb = at(x + 1, y), vc = at(x + 1, y + 1), vd = at(x, y + 1);
        const a = va >= level, b = vb >= level, c = vc >= level, d = vd >= level;
        if (a === b && b === c && c === d) continue;
        const K = { T: keyH(x, y), R: keyV(x + 1, y), B: keyH(x, y + 1), L: keyV(x, y) };
        const inside = { a, b, c, d };
        const crossT = a !== b, crossR = b !== c, crossB = c !== d, crossL = d !== a;
        const n = (crossT ? 1 : 0) + (crossR ? 1 : 0) + (crossB ? 1 : 0) + (crossL ? 1 : 0);
        if (n === 2) {
          const es = [];
          if (crossT) es.push('T'); if (crossR) es.push('R'); if (crossB) es.push('B'); if (crossL) es.push('L');
          const [e1, e2] = es;
          let ref;
          if (e1 === 'T' && e2 === 'L') ref = 'a'; else if (e1 === 'T' && e2 === 'R') ref = 'b';
          else if (e1 === 'R' && e2 === 'B') ref = 'c'; else if (e1 === 'B' && e2 === 'L') ref = 'd';
          else ref = 'a'; // T-B oder R-L: gegenüberliegende Seiten
          seg(e1, e2, ref, inside[ref], K);
        } else if (n === 4) {
          const m = (va + vb + vc + vd) / 4 >= level;
          // Sattel: Mitte innen -> Außenecken werden abgeschnitten, sonst die Innenecken
          const isolate = (ref) => {
            const pairs = { a: ['T', 'L'], b: ['T', 'R'], c: ['R', 'B'], d: ['B', 'L'] }[ref];
            seg(pairs[0], pairs[1], ref, inside[ref], K);
          };
          for (const ref of ['a', 'b', 'c', 'd']) if (inside[ref] !== m) isolate(ref);
        }
      }
    const rings = [];
    for (const [start] of next) {
      while (next.has(start) && next.get(start).length) {
        const ring = [];
        let cur = start, guard = 0;
        for (;;) {
          const outs = next.get(cur);
          if (!outs || !outs.length) break;
          ring.push(pt(cur));
          cur = outs.pop();
          if (cur === start || guard++ > 4e6) break;
        }
        if (next.get(start) && !next.get(start).length) next.delete(start);
        if (ring.length >= 4) rings.push(ring);
      }
    }
    return rings;
  }

  /* ---------- Linie nachbearbeiten ---------- */
  function ringLength(r) {
    let L = 0;
    for (let i = 0; i < r.length; i++) L += G.dist(r[i], r[(i + 1) % r.length]);
    return L;
  }

  // gleichmäßig unterteilen (geschlossen)
  function resampleClosed(r, step) {
    const L = ringLength(r);
    const n = Math.max(8, Math.round(L / step));
    const out = [];
    let seg = 0, acc = 0;
    const dist = (i) => G.dist(r[i], r[(i + 1) % r.length]);
    let sl = dist(0);
    for (let k = 0; k < n; k++) {
      const s = (L * k) / n;
      while (acc + sl < s && seg < r.length - 1) { acc += sl; seg++; sl = dist(seg); }
      const t = sl > 0 ? (s - acc) / sl : 0;
      out.push(G.lerp(r[seg], r[(seg + 1) % r.length], Math.max(0, Math.min(1, t))));
    }
    return out;
  }

  // Eckenindizes: Richtungsänderung über +-win mm Bogenlänge größer als cornerDeg
  function findCorners(r, step, win, cornerDeg) {
    const n = r.length, k = Math.max(2, Math.round(win / step));
    const ang = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = r[(i - k + n) % n], b = r[i], c = r[(i + k) % n];
      const v1x = b.x - a.x, v1y = b.y - a.y, v2x = c.x - b.x, v2y = c.y - b.y;
      const l1 = Math.hypot(v1x, v1y), l2 = Math.hypot(v2x, v2y);
      ang[i] = l1 > 1e-9 && l2 > 1e-9 ? Math.acos(Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (l1 * l2)))) : 0;
    }
    const lim = (cornerDeg * Math.PI) / 180, res = [];
    for (let i = 0; i < n; i++) {
      if (ang[i] < lim) continue;
      let peak = true;
      for (let j = -k; j <= k; j++) if (j && ang[(i + j + n) % n] > ang[i] || j && ang[(i + j + n) % n] === ang[i] && j < 0) { peak = false; break; }
      if (peak) res.push(i);
    }
    return res;
  }

  // Glätten entlang der Linie (mehrfach [1 2 1]/4 ≈ Gauß), Ecken bleiben fest
  function smoothRing(r, step, sigma, corners) {
    const n = r.length;
    const passes = Math.max(0, Math.round(2 * (sigma / step) ** 2));
    if (!passes) return r.map((p) => ({ x: p.x, y: p.y }));
    const fixed = new Uint8Array(n);
    corners.forEach((i) => (fixed[i] = 1));
    let cur = r.map((p) => ({ x: p.x, y: p.y }));
    const maxPass = Math.min(passes, 400);
    for (let it = 0; it < maxPass; it++) {
      const nx = new Array(n);
      for (let i = 0; i < n; i++) {
        if (fixed[i]) { nx[i] = cur[i]; continue; }
        const a = cur[(i - 1 + n) % n], b = cur[(i + 1) % n];
        nx[i] = { x: (a.x + 2 * cur[i].x + b.x) / 4, y: (a.y + 2 * cur[i].y + b.y) / 4 };
      }
      cur = nx;
    }
    return cur;
  }

  /**
   * Linie (Pixel) -> glatte Linie (mm).
   * o: {mm, ox, oy, sigma (mm), corner (Grad), step (mm)}
   * Rückgabe: {dense: [{x,y}], corners: [Index]}
   */
  function cleanRing(ringPx, o) {
    const mm = o.mm;
    const raw = ringPx.map((p) => ({ x: o.ox + p.x * mm, y: o.oy + p.y * mm }));
    const step = o.step || 0.1;
    const rs = resampleClosed(raw, step);
    if (rs.length < 8) return { dense: rs, corners: [] };
    const corners = (o.corner || 0) < 170 ? findCorners(rs, step, Math.max(0.3, (o.sigma || 0.2) * 1.6), o.corner || 55) : [];
    const dense = smoothRing(rs, step, o.sigma ?? 0.2, corners);
    return { dense, corners };
  }

  // Dichte Linie -> wenige Kontrollpunkte mit Kurvenmarkierung (für Flächen); tol = größte Abweichung in mm
  function toControlPoints(cl, tol) {
    const { dense, corners } = cl;
    const n = dense.length;
    if (n < 4) return dense.map((p) => ({ x: p.x, y: p.y, c: false }));
    const cornerSet = new Set(corners);
    // Anker: Ecken (oder weitester Punkt)
    let anchors = corners.slice().sort((a, b) => a - b);
    if (!anchors.length) {
      let far = 0, fd = 0;
      dense.forEach((p, i) => { const d = G.dist(p, dense[0]); if (d > fd) { fd = d; far = i; } });
      anchors = [0, far];
    }
    const out = [];
    for (let a = 0; a < anchors.length; a++) {
      const i0 = anchors[a], i1 = anchors[(a + 1) % anchors.length];
      const part = [];
      for (let i = i0; ; i = (i + 1) % n) { part.push(dense[i]); if (i === i1 && part.length > 1) break; if (part.length > n + 1) break; }
      const s = G.rdp(part, tol);
      for (let k = 0; k < s.length - 1; k++) out.push({ x: s[k].x, y: s[k].y, c: !(k === 0 && cornerSet.has(i0)) });
    }
    return out;
  }

  HW.scan = { membership, blur, contours, cleanRing, toControlPoints, resampleClosed, findCorners, smoothRing };
})(typeof window !== 'undefined' ? window : globalThis);
