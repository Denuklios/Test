/* Kamerabild von oben: perspektivisch entzerren (4 Bezugspunkte -> Werkstück-mm), einfache Linsenkorrektur. */
(function (g) {
  const FS = (g.FS = g.FS || {});

  // Homographie, die src[i] -> dst[i] abbildet (je 4 Punkte {x,y})
  function homography(src, dst) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const { x, y } = src[i], { x: u, y: v } = dst[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    // Gauß-Elimination mit Pivotsuche
    const n = 8;
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      if (Math.abs(A[p][c]) < 1e-12) return null;
      [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = A[r][c] / A[c][c];
        if (!f) continue;
        for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
        b[r] -= f * b[c];
      }
    }
    const h = b.map((v, i) => v / A[i][i]);
    return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  }

  function applyH(H, p) {
    const w = H[6] * p.x + H[7] * p.y + H[8];
    return { x: (H[0] * p.x + H[1] * p.y + H[2]) / w, y: (H[3] * p.x + H[4] * p.y + H[5]) / w };
  }

  // Linsenverzeichnung (tonnenförmig > 0): entzerrter Bildpunkt -> Punkt im Rohbild, Koordinaten normiert 0..1
  function distort(u, v, k1, aspect) {
    if (!k1) return { x: u, y: v };
    const dx = (u - 0.5) * aspect, dy = v - 0.5;
    const f = 1 + k1 * (dx * dx + dy * dy);
    return { x: 0.5 + (u - 0.5) * f, y: 0.5 + (v - 0.5) * f };
  }

  /**
   * Kamerabild auf das Werkstück abbilden.
   * src: {data, w, h} (RGBA). pts: 4 Bildpunkte (normiert 0..1, nach Linsenkorrektur) zu den Werkstück-Ecken
   * links unten, rechts unten, rechts oben, links oben. Ergebnis: RGBA-Bild (Zeile 0 = oberer Werkstückrand).
   */
  function warp(src, pts, stock, res, k1 = 0) {
    const W = Math.max(2, Math.round(stock.w * res)), Hh = Math.max(2, Math.round(stock.h * res));
    const H = homography([{ x: 0, y: 0 }, { x: stock.w, y: 0 }, { x: stock.w, y: stock.h }, { x: 0, y: stock.h }], pts);
    const out = new Uint8ClampedArray(W * Hh * 4);
    if (!H) return { data: out, w: W, h: Hh };
    const aspect = src.w / src.h, sw = src.w, sh = src.h, sd = src.data;
    for (let j = 0; j < Hh; j++) {
      const y = stock.h - (j + 0.5) / res;
      for (let i = 0; i < W; i++) {
        const q = applyH(H, { x: (i + 0.5) / res, y });
        const d = distort(q.x, q.y, k1, aspect);
        const fx = d.x * sw - 0.5, fy = d.y * sh - 0.5;
        const o = (j * W + i) * 4;
        if (fx < 0 || fy < 0 || fx >= sw - 1 || fy >= sh - 1) { out[o + 3] = 0; continue; }
        const x0 = fx | 0, y0 = fy | 0, ax = fx - x0, ay = fy - y0;
        const p00 = (y0 * sw + x0) * 4, p10 = p00 + 4, p01 = p00 + sw * 4, p11 = p01 + 4;
        for (let c = 0; c < 3; c++) {
          out[o + c] = (sd[p00 + c] * (1 - ax) + sd[p10 + c] * ax) * (1 - ay) + (sd[p01 + c] * (1 - ax) + sd[p11 + c] * ax) * ay;
        }
        out[o + 3] = 255;
      }
    }
    return { data: out, w: W, h: Hh };
  }

  // Umkehrung von distort (Rohbild -> entzerrt), iterativ
  function undistort(p, k1, aspect) {
    if (!k1) return { x: p.x, y: p.y };
    let u = { x: p.x, y: p.y };
    for (let i = 0; i < 20; i++) {
      const d = distort(u.x, u.y, k1, aspect);
      u = { x: u.x + (p.x - d.x), y: u.y + (p.y - d.y) };
    }
    return u;
  }

  /* ---------- Kamera <-> Maschine und automatische Werkstück-Erkennung ---------- */

  function invert3(M) {
    const [a, b, c, d, e, f, g, h, i] = M;
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const det = a * A + b * B + c * C;
    if (Math.abs(det) < 1e-14) return null;
    return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
  }

  /**
   * Bild -> Maschine. pairs: [{u, v, mx, my}] (u,v = Rohbild 0..1, mx,my = Maschinenposition in mm), mind. 4 Punkte.
   * Gibt {H, Hinv, off} zurück: H bildet das entzerrte Bild auf Maschinen-mm ab, off ist ein Versatz (mm) nach Neustart der Maschine.
   */
  function bedFromPairs(pairs, k1, aspect) {
    if (!pairs || pairs.length < 4) return null;
    const src = pairs.slice(0, 4).map((p) => undistort({ x: p.u, y: p.v }, k1, aspect));
    const dst = pairs.slice(0, 4).map((p) => ({ x: p.mx, y: p.my }));
    const H = homography(src, dst);
    const Hinv = H && invert3(H);
    return H && Hinv ? { H, Hinv, off: { x: 0, y: 0 } } : null;
  }
  const rawToMachine = (bed, p, k1, aspect) => {
    const q = applyH(bed.H, undistort(p, k1, aspect));
    return { x: q.x + bed.off.x, y: q.y + bed.off.y };
  };
  const machineToRaw = (bed, m, k1, aspect) => {
    const q = applyH(bed.Hinv, { x: m.x - bed.off.x, y: m.y - bed.off.y });
    return distort(q.x, q.y, k1, aspect);
  };

  /** Draufsicht der Maschinenfläche (box in Maschinen-mm), res Pixel je mm, Zeile 0 = größtes Y */
  function warpBed(src, bed, box, res, k1 = 0) {
    const W = Math.max(2, Math.round((box.x1 - box.x0) * res)), Hh = Math.max(2, Math.round((box.y1 - box.y0) * res));
    const out = new Uint8ClampedArray(W * Hh * 4);
    const aspect = src.w / src.h, sw = src.w, sh = src.h, sd = src.data;
    for (let j = 0; j < Hh; j++) {
      const y = box.y1 - (j + 0.5) / res;
      for (let i = 0; i < W; i++) {
        const d = machineToRaw(bed, { x: box.x0 + (i + 0.5) / res, y }, k1, aspect);
        const fx = d.x * sw - 0.5, fy = d.y * sh - 0.5, o = (j * W + i) * 4;
        if (!(fx >= 0 && fy >= 0 && fx < sw - 1 && fy < sh - 1)) continue;
        const x0 = fx | 0, y0 = fy | 0, ax = fx - x0, ay = fy - y0;
        const p00 = (y0 * sw + x0) * 4, p10 = p00 + 4, p01 = p00 + sw * 4, p11 = p01 + 4;
        for (let c = 0; c < 3; c++) out[o + c] = (sd[p00 + c] * (1 - ax) + sd[p10 + c] * ax) * (1 - ay) + (sd[p01 + c] * (1 - ax) + sd[p11 + c] * ax) * ay;
        out[o + 3] = 255;
      }
    }
    return { data: out, w: W, h: Hh };
  }

  function convexHull(pts) {
    const P = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    if (P.length < 3) return P;
    const cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lo = [], up = [];
    for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    lo.pop(); up.pop();
    return lo.concat(up);
  }

  /** kleinstes umschließendes Rechteck: {cx, cy, w, h, ang (rad, Richtung der w-Seite), corners[4]} */
  function minAreaRect(hull) {
    let best = null;
    for (let i = 0; i < hull.length; i++) {
      const a = hull[i], b = hull[(i + 1) % hull.length];
      const ang = Math.atan2(b.y - a.y, b.x - a.x), c = Math.cos(ang), s = Math.sin(ang);
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (const p of hull) { const u = p.x * c + p.y * s, v = -p.x * s + p.y * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
      const area = (u1 - u0) * (v1 - v0);
      if (!best || area < best.area) best = { area, ang, c, s, u0, u1, v0, v1 };
    }
    if (!best) return null;
    const P = (u, v) => ({ x: u * best.c - v * best.s, y: u * best.s + v * best.c });
    return { ang: best.ang, w: best.u1 - best.u0, h: best.v1 - best.v0, area: best.area, corners: [P(best.u0, best.v0), P(best.u1, best.v0), P(best.u1, best.v1), P(best.u0, best.v1)] };
  }

  /**
   * Werkstück in einer Draufsicht finden (Hintergrund = Maschinentisch). img: {data, w, h} RGBA.
   * ref (optional): Leerbild gleicher Größe; sonst wird die Farbe des Randbereichs als Tisch angenommen.
   * Ergebnis in Pixeln: {corners, w, h, ang, fill} oder null. fill = Anteil der Fläche, der wirklich Werkstück ist (Rechteckigkeit).
   */
  function detectRect(img, opts = {}) {
    const { w, h, data } = img, ref = opts.ref;
    const N = w * h, diff = new Float32Array(N);
    if (ref) {
      for (let i = 0; i < N; i++) { const o = i * 4; diff[i] = (data[o + 3] && ref.data[o + 3]) ? Math.hypot(data[o] - ref.data[o], data[o + 1] - ref.data[o + 1], data[o + 2] - ref.data[o + 2]) : 0; }
    } else {
      // Tischfarbe aus dem Randstreifen (Median je Kanal)
      const m = Math.max(2, Math.round(Math.min(w, h) * 0.05)), vals = [[], [], []];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (x >= m && x < w - m && y >= m && y < h - m) { x = w - m - 1; continue; }
        const o = (y * w + x) * 4;
        if (data[o + 3]) for (let c = 0; c < 3; c++) vals[c].push(data[o + c]);
      }
      const med = vals.map((a) => (a.sort((p, q) => p - q), a.length ? a[a.length >> 1] : 128));
      for (let i = 0; i < N; i++) { const o = i * 4; diff[i] = data[o + 3] ? Math.hypot(data[o] - med[0], data[o + 1] - med[1], data[o + 2] - med[2]) : 0; }
    }
    // leichtes Glätten (Box 3x3), danach Schwelle nach Otsu
    const sm = new Float32Array(N);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      let a = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) a += diff[(y + dy) * w + x + dx];
      sm[y * w + x] = a / 9;
    }
    const hist = new Float64Array(256);
    for (let i = 0; i < N; i++) hist[Math.min(255, sm[i] | 0)]++;
    let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
    let wB = 0, sB = 0, bestT = 0, bestV = -1;
    for (let t = 0; t < 256; t++) {
      wB += hist[t]; if (!wB) continue;
      const wF = N - wB; if (!wF) break;
      sB += t * hist[t];
      const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
      if (v > bestV) { bestV = v; bestT = t; }
    }
    const thr = Math.max(opts.minDiff || 22, bestT);
    const mask = new Uint8Array(N);
    for (let i = 0; i < N; i++) mask[i] = sm[i] > thr ? 1 : 0;
    // größte zusammenhängende Fläche
    const lab = new Int32Array(N), stack = [];
    let bestL = 0, bestA = 0, L = 0;
    for (let i = 0; i < N; i++) {
      if (!mask[i] || lab[i]) continue;
      L++; let a = 0; stack.push(i); lab[i] = L;
      while (stack.length) {
        const p = stack.pop(); a++;
        const x = p % w, y = (p / w) | 0;
        if (x > 0 && mask[p - 1] && !lab[p - 1]) { lab[p - 1] = L; stack.push(p - 1); }
        if (x < w - 1 && mask[p + 1] && !lab[p + 1]) { lab[p + 1] = L; stack.push(p + 1); }
        if (y > 0 && mask[p - w] && !lab[p - w]) { lab[p - w] = L; stack.push(p - w); }
        if (y < h - 1 && mask[p + w] && !lab[p + w]) { lab[p + w] = L; stack.push(p + w); }
      }
      if (a > bestA) { bestA = a; bestL = L; }
    }
    if (!bestL || bestA < N * (opts.minArea || 0.01)) return null;
    // Rand der Fläche -> Hülle -> Rechteck
    const edge = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (lab[p] !== bestL) continue;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || lab[p - 1] !== bestL || lab[p + 1] !== bestL || lab[p - w] !== bestL || lab[p + w] !== bestL) edge.push({ x: x + 0.5, y: y + 0.5 });
    }
    const hull = convexHull(edge);
    const r = minAreaRect(hull);
    if (!r) return null;
    return { corners: r.corners, w: r.w, h: r.h, ang: r.ang, fill: Math.min(1, bestA / r.area), area: bestA };
  }

  /**
   * Rechteck (Ecken in Maschinen-mm, y nach oben) -> Nullpunkt links unten:
   * {x, y} = linke untere Ecke, ang = Drehung (rad) gegen die X-Achse, in (-45°, 45°], w entlang u, h entlang v.
   */
  function frameFromCorners(c) {
    let best = Math.atan2(c[1].y - c[0].y, c[1].x - c[0].x);
    while (best > Math.PI / 4) best -= Math.PI / 2;
    while (best <= -Math.PI / 4) best += Math.PI / 2;
    const u = { x: Math.cos(best), y: Math.sin(best) }, v = { x: -u.y, y: u.x };
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const p of c) { const pu = p.x * u.x + p.y * u.y, pv = p.x * v.x + p.y * v.y; u0 = Math.min(u0, pu); u1 = Math.max(u1, pu); v0 = Math.min(v0, pv); v1 = Math.max(v1, pv); }
    return { x: u0 * u.x + v0 * v.x, y: u0 * u.y + v0 * v.y, ang: best, w: u1 - u0, h: v1 - v0, u, v };
  }

  FS.camera = { homography, applyH, distort, undistort, warp, invert3, bedFromPairs, rawToMachine, machineToRaw, warpBed, detectRect, frameFromCorners, convexHull, minAreaRect };

})(typeof window !== 'undefined' ? window : globalThis);
