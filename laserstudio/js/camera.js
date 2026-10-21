/* Kamerabild von oben: perspektivisch entzerren (4 Bezugspunkte -> Arbeitsbereich-mm), Linsenkorrektur,
   Ausgleich der Materialhöhe (das Material liegt näher an der Kamera als die Ebene, auf der ausgerichtet wurde). */
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

  /** Punkt auf der Materialoberfläche (Höhe t über der Ausrichtungsebene) → Punkt der Ausrichtungsebene, der im Bild an derselben Stelle liegt.
      c = Punkt senkrecht unter der Kamera, camH = Kamerahöhe über der Ausrichtungsebene. */
  function liftPoint(p, c, camH, t) {
    if (!t || !camH || camH <= t) return p;
    const k = camH / (camH - t);
    return { x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k };
  }

  /**
   * Kamerabild auf einen Bereich des Arbeitsbereichs abbilden.
   * world: 4 Punkte in mm, img: dieselben 4 Punkte im Bild (normiert 0..1, nach Linsenkorrektur),
   * area: {x0, y0, w, h} in mm, res: Pixel je mm, lift: {c, camH, t} optional. Zeile 0 = oberer Rand.
   */
  function warpArea(src, world, img, area, res, k1 = 0, lift = null) {
    const W = Math.max(2, Math.round(area.w * res)), Hh = Math.max(2, Math.round(area.h * res));
    const H = homography(world, img);
    const out = new Uint8ClampedArray(W * Hh * 4);
    if (!H) return { data: out, w: W, h: Hh };
    const aspect = src.w / src.h, sw = src.w, sh = src.h, sd = src.data;
    for (let j = 0; j < Hh; j++) {
      const y = area.y0 + area.h - (j + 0.5) / res;
      for (let i = 0; i < W; i++) {
        let p = { x: area.x0 + (i + 0.5) / res, y };
        if (lift) p = liftPoint(p, lift.c, lift.camH, lift.t);
        const q = applyH(H, p);
        const d = distort(q.x, q.y, k1, aspect);
        const fx = d.x * sw - 0.5, fy = d.y * sh - 0.5;
        const o = (j * W + i) * 4;
        if (fx < 0 || fy < 0 || fx >= sw - 1 || fy >= sh - 1) { out[o + 3] = 0; continue; }
        const x0 = fx | 0, y0 = fy | 0, ax = fx - x0, ay = fy - y0;
        const p00 = (y0 * sw + x0) * 4, p10 = p00 + 4, p01 = p00 + sw * 4, p11 = p01 + 4;
        for (let c = 0; c < 3; c++) out[o + c] = (sd[p00 + c] * (1 - ax) + sd[p10 + c] * ax) * (1 - ay) + (sd[p01 + c] * (1 - ax) + sd[p11 + c] * ax) * ay;
        out[o + 3] = 255;
      }
    }
    return { data: out, w: W, h: Hh };
  }

  FS.camera = { homography, applyH, distort, undistort, warp, warpArea, liftPoint };
})(typeof window !== 'undefined' ? window : globalThis);
