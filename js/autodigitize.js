/* Automatisches Digitalisieren: Bild -> Farbreduktion -> Regionen -> Konturen -> Stickobjekte. */
(function (g) {
  const HW = (g.HW = g.HW || {});
  const G = HW.geo;

  // k-Means Farbreduktion (deterministisch, k-means++ ähnliche Startwerte)
  function quantize(data, w, h, k) {
    const px = [];
    for (let i = 0; i < w * h; i++) if (data[i * 4 + 3] >= 128) px.push(i);
    if (!px.length) return { labels: new Int16Array(w * h).fill(-1), centers: [] };
    const sample = px.filter((_, i) => i % Math.max(1, Math.floor(px.length / 6000)) === 0);
    const col = (i) => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
    const d2 = (a, b) => (a[0] - b[0]) ** 2 * 0.9 + (a[1] - b[1]) ** 2 * 1.2 + (a[2] - b[2]) ** 2 * 0.8;
    const centers = [col(sample[0])];
    while (centers.length < k) {
      let best = -1, bi = 0;
      for (const s of sample) {
        const c = col(s);
        const m = Math.min(...centers.map((ct) => d2(c, ct)));
        if (m > best) { best = m; bi = s; }
      }
      if (best < 30) break;
      centers.push(col(bi));
    }
    for (let it = 0; it < 12; it++) {
      const acc = centers.map(() => [0, 0, 0, 0]);
      for (const s of sample) {
        const c = col(s);
        let bi = 0, bd = Infinity;
        centers.forEach((ct, ci) => { const d = d2(c, ct); if (d < bd) { bd = d; bi = ci; } });
        acc[bi][0] += c[0]; acc[bi][1] += c[1]; acc[bi][2] += c[2]; acc[bi][3]++;
      }
      acc.forEach((a, ci) => { if (a[3]) centers[ci] = [a[0] / a[3], a[1] / a[3], a[2] / a[3]]; });
    }
    const labels = new Int16Array(w * h).fill(-1);
    for (const i of px) {
      const c = col(i);
      let bi = 0, bd = Infinity;
      centers.forEach((ct, ci) => { const d = d2(c, ct); if (d < bd) { bd = d; bi = ci; } });
      labels[i] = bi;
    }
    return { labels, centers: centers.map((c) => c.map(Math.round)) };
  }

  // Mehrheitsfilter glättet Pixelrauschen
  function majority(labels, w, h, passes) {
    for (let p = 0; p < passes; p++) {
      const src = labels.slice();
      for (let y = 1; y < h - 1; y++)
        for (let x = 1; x < w - 1; x++) {
          const cnt = {};
          let best = src[y * w + x], bc = 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const l = src[(y + dy) * w + x + dx];
              cnt[l] = (cnt[l] || 0) + 1;
              if (cnt[l] > bc) { bc = cnt[l]; best = l; }
            }
          if (bc >= 5) labels[y * w + x] = best;
        }
    }
  }

  function components(labels, w, h) {
    const comp = new Int32Array(w * h).fill(-1);
    const list = [];
    const stack = [];
    for (let i = 0; i < w * h; i++) {
      if (comp[i] !== -1 || labels[i] < 0) continue;
      const id = list.length, lab = labels[i];
      const c = { id, label: lab, pixels: [] };
      comp[i] = id;
      stack.push(i);
      while (stack.length) {
        const q = stack.pop();
        c.pixels.push(q);
        const x = q % w, y = (q / w) | 0;
        const nb = [x > 0 ? q - 1 : -1, x < w - 1 ? q + 1 : -1, y > 0 ? q - w : -1, y < h - 1 ? q + w : -1];
        for (const n of nb) if (n >= 0 && comp[n] === -1 && labels[n] === lab) { comp[n] = id; stack.push(n); }
      }
      list.push(c);
    }
    return { comp, list };
  }

  // Dünne Streifen (≤ 2 Pixel breit, typisch für Kantenglättung) erkennen
  function isThin(c, comp, w, h) {
    if (c.pixels.length > 4000) return false;
    let inner = 0;
    for (const q of c.pixels) {
      const x = q % w, y = (q / w) | 0;
      if (x > 0 && x < w - 1 && y > 0 && y < h - 1 && comp[q - 1] === c.id && comp[q + 1] === c.id && comp[q - w] === c.id && comp[q + w] === c.id) inner++;
    }
    return inner < c.pixels.length * 0.12;
  }

  // Kleine und dünne Regionen dem häufigsten Nachbarn zuschlagen
  function removeSmall(labels, w, h, minPx) {
    for (let iter = 0; iter < 4; iter++) {
      const { comp, list } = components(labels, w, h);
      let changed = false;
      for (const c of list) {
        if (c.pixels.length >= minPx && !isThin(c, comp, w, h)) continue;
        const cnt = {};
        for (const q of c.pixels) {
          const x = q % w, y = (q / w) | 0;
          for (const n of [x > 0 ? q - 1 : -1, x < w - 1 ? q + 1 : -1, y > 0 ? q - w : -1, y < h - 1 ? q + w : -1])
            if (n >= 0 && comp[n] !== c.id) cnt[labels[n]] = (cnt[labels[n]] || 0) + 1;
        }
        let best = null, bc = 0;
        for (const k in cnt) if (cnt[k] > bc) { bc = cnt[k]; best = +k; }
        if (best !== null) { for (const q of c.pixels) labels[q] = best; changed = true; }
      }
      if (!changed) break;
    }
  }

  // Konturverfolgung über Pixelkanten. Ergebnis: geschlossene Ringe (Außen + Löcher)
  function traceMask(mask, w, h) {
    const W = w + 1;
    const edges = new Map(); // startVertex -> [endVertex,...]
    const add = (a, b) => { if (!edges.has(a)) edges.set(a, []); edges.get(a).push(b); };
    const m = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (!mask[y * w + x]) continue;
        // Innenseite links (im Uhrzeigersinn in Bildkoordinaten)
        if (!m(x, y - 1)) add(y * W + x, y * W + x + 1);
        if (!m(x + 1, y)) add(y * W + x + 1, (y + 1) * W + x + 1);
        if (!m(x, y + 1)) add((y + 1) * W + x + 1, (y + 1) * W + x);
        if (!m(x - 1, y)) add((y + 1) * W + x, y * W + x);
      }
    const rings = [];
    const vx = (v) => v % W, vy = (v) => (v / W) | 0;
    for (const [start] of edges) {
      while (edges.has(start) && edges.get(start).length) {
        const ring = [];
        let prev = start, cur = edges.get(start).pop();
        ring.push(start);
        let guard = 0;
        while (cur !== start && guard++ < 1e6) {
          ring.push(cur);
          const outs = edges.get(cur);
          if (!outs || !outs.length) break;
          let pick = 0;
          if (outs.length > 1) {
            // an Sattelpunkten rechts abbiegen -> 4er-Nachbarschaft getrennt halten
            const dx = vx(cur) - vx(prev), dy = vy(cur) - vy(prev);
            let best = -Infinity;
            outs.forEach((o, i) => {
              const ex = vx(o) - vx(cur), ey = vy(o) - vy(cur);
              const cross = dx * ey - dy * ex;
              if (cross > best) { best = cross; pick = i; }
            });
          }
          prev = cur;
          cur = outs.splice(pick, 1)[0];
        }
        if (edges.get(start) && !edges.get(start).length) edges.delete(start);
        if (ring.length >= 4) rings.push(ring.map((v) => ({ x: vx(v), y: vy(v) })));
      }
    }
    return rings;
  }

  // Treppenstufen glätten und vereinfachen; Kurvenpunkte markieren
  function smoothRing(r, eps) {
    let pts = r.map((p, i) => {
      const q = r[(i + 1) % r.length];
      return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    });
    for (let pass = 0; pass < 2; pass++)
      pts = pts.map((p, i) => {
        const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length];
        return { x: (a.x + 2 * p.x + b.x) / 4, y: (a.y + 2 * p.y + b.y) / 4 };
      });
    // RDP auf geschlossenen Ring: an entferntestem Punkt teilen
    let far = 0, fd = 0;
    pts.forEach((p, i) => { const d = G.dist(p, pts[0]); if (d > fd) { fd = d; far = i; } });
    const a = G.rdp(pts.slice(0, far + 1), eps), b = G.rdp(pts.slice(far).concat([pts[0]]), eps);
    const res = a.concat(b.slice(1, -1));
    return res.map((p, i) => {
      const pr = res[(i - 1 + res.length) % res.length], nx = res[(i + 1) % res.length];
      const v1 = { x: p.x - pr.x, y: p.y - pr.y }, v2 = { x: nx.x - p.x, y: nx.y - p.y };
      const c = (v1.x * v2.x + v1.y * v2.y) / ((Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y)) || 1);
      return { x: p.x, y: p.y, c: c > Math.cos((40 * Math.PI) / 180) };
    });
  }

  function principalAngle(pixels, w) {
    let mx = 0, my = 0;
    for (const q of pixels) { mx += q % w; my += (q / w) | 0; }
    mx /= pixels.length; my /= pixels.length;
    let sxx = 0, syy = 0, sxy = 0;
    for (const q of pixels) {
      const dx = (q % w) - mx, dy = ((q / w) | 0) - my;
      sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
    }
    return 0.5 * Math.atan2(2 * sxy, sxx - syy);
  }

  /**
   * imageData: ImageData-ähnlich {data,width,height}
   * opts: {colors, widthMM, originX, originY, minAreaMM2, removeBg, satinMax, outline}
   * Rückgabe: {objects:[...], palette:[hex]}
   */
  function autoDigitize(img, opts) {
    const { width: w, height: h, data } = img;
    const mm = opts.widthMM / w;
    const q = quantize(data, w, h, opts.colors);
    majority(q.labels, w, h, 2);
    removeSmall(q.labels, w, h, Math.max(4, Math.round((opts.minAreaMM2 || 2) / (mm * mm))));
    // Hintergrund = häufigste Randfarbe
    let bg = -2;
    if (opts.removeBg) {
      const cnt = {};
      for (let x = 0; x < w; x++) for (const y of [0, h - 1]) { const l = q.labels[y * w + x]; cnt[l] = (cnt[l] || 0) + 1; }
      for (let y = 0; y < h; y++) for (const x of [0, w - 1]) { const l = q.labels[y * w + x]; cnt[l] = (cnt[l] || 0) + 1; }
      let bc = 0;
      for (const k in cnt) if (cnt[k] > bc) { bc = cnt[k]; bg = +k; }
    }
    const { list } = components(q.labels, w, h);
    const used = [...new Set(list.filter((c) => c.label >= 0 && c.label !== bg).map((c) => c.label))];
    const palette = used.map((l) => '#' + q.centers[l].map((v) => v.toString(16).padStart(2, '0')).join(''));
    // Farben nach Gesamtfläche sortieren (große zuerst = unten)
    const areaOf = {};
    list.forEach((c) => (areaOf[c.label] = (areaOf[c.label] || 0) + c.pixels.length));
    const order = used.slice().sort((a, b) => areaOf[b] - areaOf[a]);
    const toMM = (p) => ({ x: opts.originX + p.x * mm, y: opts.originY + p.y * mm, c: p.c });
    const objects = [];
    for (const lab of order) {
      const comps = list.filter((c) => c.label === lab).sort((a, b) => b.pixels.length - a.pixels.length);
      for (const c of comps) {
        const mask = new Uint8Array(w * h);
        for (const p of c.pixels) mask[p] = 1;
        const rings = traceMask(mask, w, h)
          .map((r) => smoothRing(r, opts.simplify ?? 0.7))
          .filter((r) => r.length >= 3);
        if (!rings.length) continue;
        rings.sort((a, b) => Math.abs(G.signedArea(b)) - Math.abs(G.signedArea(a)));
        const outer = rings[0].map(toMM);
        const holes = rings.slice(1).filter((r) => Math.abs(G.signedArea(r)) * mm * mm >= (opts.minAreaMM2 || 2)).map((r) => r.map(toMM));
        const area = c.pixels.length * mm * mm;
        let per = 0;
        for (let i = 0; i < outer.length; i++) per += G.dist(outer[i], outer[(i + 1) % outer.length]);
        const width = (2 * area) / (per || 1);
        const satin = width <= (opts.satinMax ?? 2.5) && (!holes.length || opts.allowSatinHoles);
        const ang = (principalAngle(c.pixels, w) * 180) / Math.PI + 90;
        objects.push({
          type: 'fill',
          colorKey: palette[used.indexOf(lab)],
          points: outer,
          holes,
          params: {
            ...HW.stitch.DEFAULTS.fill,
            fillType: satin ? 'satin' : 'tatami',
            angle: satin ? Math.round(ang) : opts.angle ?? 45,
            underlay: satin ? 'none' : area > 40 ? 'edge+tatami' : 'edge',
            border: opts.outline ? 'run' : 'none',
          },
        });
      }
    }
    return { objects, palette };
  }

  HW.auto = { autoDigitize, quantize, traceMask };
})(typeof window !== 'undefined' ? window : globalThis);
