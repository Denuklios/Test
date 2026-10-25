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
    const cnt = new Int32Array(64);
    for (let p = 0; p < passes; p++) {
      const src = labels.slice();
      for (let y = 1; y < h - 1; y++)
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x, c0 = src[i];
          // schneller Weg: alle Nachbarn gleich
          if (src[i - 1] === c0 && src[i + 1] === c0 && src[i - w] === c0 && src[i + w] === c0 &&
              src[i - w - 1] === c0 && src[i - w + 1] === c0 && src[i + w - 1] === c0 && src[i + w + 1] === c0) continue;
          let best = c0, bc = 0;
          for (let dy = -w; dy <= w; dy += w)
            for (let dx = -1; dx <= 1; dx++) {
              const l = src[i + dy + dx] + 1;
              const n = ++cnt[l];
              if (n > bc) { bc = n; best = l - 1; }
            }
          for (let dy = -w; dy <= w; dy += w) for (let dx = -1; dx <= 1; dx++) cnt[src[i + dy + dx] + 1] = 0;
          if (bc >= 5) labels[i] = best;
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
    const objects = [];
    const SA = HW.satinauto;
    const mode = opts.mode || 'auto';
    const satinMax = opts.satinMax ?? 7;
    let cursor = null;
    const SC = HW.scan;
    const precise = opts.precise !== false && !!SC;
    for (const lab of order) {
      const colorKey = palette[used.indexOf(lab)];
      const items = [];
      const comps = list.filter((c) => c.label === lab);
      // Präzisions-Scan: weiches Feld dieser Farbe (0,5 = genau auf der Kante)
      const field = precise ? SC.blur(SC.membership(data, w, h, q.centers, lab), w, h, opts.edgeBlur ?? 0.7) : null;
      for (const c of comps) {
        // auf die Region zuschneiden (schneller)
        let x0 = w, y0 = h, x1 = 0, y1 = 0;
        for (const p of c.pixels) { const x = p % w, y = (p / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        x0 = Math.max(0, x0 - 2); y0 = Math.max(0, y0 - 2);
        const cw = Math.min(w, x1 + 3) - x0, ch = Math.min(h, y1 + 3) - y0;
        const mask = new Uint8Array(cw * ch);
        for (const p of c.pixels) mask[(((p / w) | 0) - y0) * cw + (p % w) - x0] = 1;
        const toMMc = (p) => ({ x: opts.originX + (p.x + x0) * mm, y: opts.originY + (p.y + y0) * mm, c: p.c });
        let rings, outer, allRings, holes;
        if (precise) {
          // Feld auf die Region begrenzen (Nachbarn gleicher Farbe nicht mitnehmen) und mit der bereinigten Maske mischen
          const m = new Float32Array(cw * ch), dil = new Uint8Array(cw * ch);
          for (let i = 0; i < cw * ch; i++) m[i] = mask[i];
          for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
            if (!mask[y * cw + x]) continue;
            for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < cw && yy < ch) dil[yy * cw + xx] = 1; }
          }
          const mb = SC.blur(m, cw, ch, 1.0);
          const fc = new Float32Array(cw * ch);
          for (let y = 1; y < ch - 1; y++) for (let x = 1; x < cw - 1; x++) {
            const i = y * cw + x;
            fc[i] = dil[i] ? 0.6 * field[(y + y0) * w + (x + x0)] + 0.4 * mb[i] : 0;
          }
          const cr = SC.contours(fc, cw, ch, 0.5);
          const co = { mm, ox: opts.originX + x0 * mm, oy: opts.originY + y0 * mm, sigma: opts.smooth ?? 0.18, corner: opts.corner ?? 55, step: 0.1 };
          const cleaned = cr.map((r) => SC.cleanRing(r, co)).filter((c) => c.dense.length >= 8);
          if (!cleaned.length) continue;
          cleaned.sort((a, b) => Math.abs(G.signedArea(b.dense)) - Math.abs(G.signedArea(a.dense)));
          const sgn = Math.sign(G.signedArea(cleaned[0].dense));
          const keep = cleaned.filter((c, i) => i === 0 || Math.sign(G.signedArea(c.dense)) !== sgn);
          const tol = opts.tol ?? 0.04;
          outer = SC.toControlPoints(keep[0], tol);
          allRings = keep.map((c) => c.dense);
          holes = keep.slice(1).filter((c) => Math.abs(G.signedArea(c.dense)) >= (opts.minAreaMM2 || 2)).map((c) => SC.toControlPoints(c, tol));
        } else {
          rings = traceMask(mask, cw, ch)
            .map((r) => smoothRing(r, opts.simplify ?? 0.7))
            .filter((r) => r.length >= 3);
          if (!rings.length) continue;
          rings.sort((a, b) => Math.abs(G.signedArea(b)) - Math.abs(G.signedArea(a)));
          outer = rings[0].map(toMMc);
          allRings = rings.map((r) => r.map(toMMc));
          holes = rings.slice(1).filter((r) => Math.abs(G.signedArea(r)) * mm * mm >= (opts.minAreaMM2 || 2)).map((r) => r.map(toMMc));
        }
        const area = c.pixels.length * mm * mm;
        // Schmale Formen (Schrift, Linien, Bögen) -> drehende Satinsäulen
        let cols = null;
        if (mode !== 'tatami') {
          const res = SA.shapeToColumns(mask, cw, ch, mm, { x: opts.originX + x0 * mm, y: opts.originY + y0 * mm }, allRings, { station: opts.station, turnDeg: opts.turnDeg });
          if (res) {
            const ws = res.widths.slice().sort((a, b) => a - b);
            const p90 = ws[Math.floor(ws.length * 0.9)] || 0;
            let cover = 0;
            for (const col of res.columns) {
              const L = col.filter((_, i) => i % 2 === 0), R = col.filter((_, i) => i % 2 === 1).reverse();
              cover += Math.abs(G.signedArea(L.concat(R)));
            }
            const junction = (res.columns.length > 1 || holes.length) && !opts.junctionSatin;
            // Kreuzungen/Verzweigungen (A, N, R, Ringe mit Bögen) liefern überlappende Säulen mit Fächern -> exakte Fläche stickt sauberer
            if (mode === 'satin' || (p90 <= satinMax && cover / area > 0.75 && !junction)) cols = res;
          }
        }
        if (cols) {
          const med = cols.widths.slice().sort((a, b) => a - b)[Math.floor(cols.widths.length / 2)];
          const ul = med < 1.4 ? 'none' : med < 3 ? 'center' : 'edge+zigzag';
          for (const col of cols.columns) {
            const ws = [];
            for (let k = 0; k + 1 < col.length; k += 2) ws.push(G.dist(col[k], col[k + 1]));
            ws.sort((x, y) => x - y);
            const cw0 = ws[Math.floor(ws.length / 2)] || 0;
            const sP = G.lerp(col[0], col[1], 0.5), eP = G.lerp(col[col.length - 2], col[col.length - 1], 0.5);
            if (opts.lineMax && cw0 < opts.lineMax) {
              // sehr dünne Striche: Laufstich entlang der Mittellinie statt schmalem Satin
              const mid = [];
              for (let k = 0; k + 1 < col.length; k += 2) mid.push({ x: (col[k].x + col[k + 1].x) / 2, y: (col[k].y + col[k + 1].y) / 2, c: k > 0 && k + 2 < col.length });
              items.push({ type: 'run', colorKey, points: mid, params: { ...HW.stitch.DEFAULTS.run, len: 2.0, style: cw0 < 0.6 ? 'triple' : 'single' }, s: sP, e: eP });
              continue;
            }
            items.push({
              type: 'colA', colorKey, points: col,
              params: { ...HW.stitch.DEFAULTS.satin, underlay: ul, pull: med < 1.5 ? 0.1 : 0.2, ...(opts.satinSpacing ? { spacing: opts.satinSpacing } : {}) },
              s: sP, e: eP,
            });
          }
          continue;
        }
        let per = 0;
        for (let i = 0; i < outer.length; i++) per += G.dist(outer[i], outer[(i + 1) % outer.length]);
        const width = (2 * area) / (per || 1);
        const satin = mode !== 'tatami' && width <= 2.2 && !holes.length;
        const ang = (principalAngle(c.pixels, w) * 180) / Math.PI + 90;
        const bb = G.bbox(outer);
        const ctr = { x: (bb.x0 + bb.x1) / 2, y: (bb.y0 + bb.y1) / 2 };
        items.push({
          type: 'fill', colorKey, points: outer, holes,
          params: {
            ...HW.stitch.DEFAULTS.fill,
            ...(opts.fillSpacing ? { spacing: opts.fillSpacing } : {}),
            fillType: satin ? 'satin' : 'tatami',
            angle: satin ? Math.round(ang) : opts.angle ?? 45,
            underlay: satin ? 'none' : area > 40 ? 'edge+tatami' : 'edge',
            border: opts.outline ? 'run' : 'none',
          },
          s: ctr, e: ctr,
        });
      }
      // Reihenfolge innerhalb einer Farbe: nächster Nachbar (bei Schrift = Lesereihenfolge)
      const rest = items.slice();
      while (rest.length) {
        let bi = 0, rev = false, bd = Infinity;
        rest.forEach((it, i) => {
          const ds = cursor ? G.dist(cursor, it.s) : it.s.x + it.s.y * 0.2;
          const de = cursor ? G.dist(cursor, it.e) : Infinity;
          if (ds < bd) { bd = ds; bi = i; rev = false; }
          if (it.type === 'colA' && de < bd) { bd = de; bi = i; rev = true; }
        });
        const it = rest.splice(bi, 1)[0];
        if (rev) { it.points = SA.reverseColA(it.points); [it.s, it.e] = [it.e, it.s]; }
        cursor = it.e;
        delete it.s; delete it.e;
        objects.push(it);
      }
    }
    let res = objects;
    if (opts.overlap !== false && HW.boolean) { try { res = trimOverlaps(objects, opts.keepMM ?? 0.4); } catch (e) { res = objects; } }
    return { objects: res, palette };
  }

  // Verdeckte Teile entfernen: spätere Objekte liegen oben; frühere Säulen/Flächen werden darunter gekürzt
  function trimOverlaps(objs, keep) {
    const B = HW.boolean;
    const isShape = (o) => o.type === 'fill' || o.type === 'colA';
    const bb = objs.map((o) => { try { const r = isShape(o) ? B.ringsOf(o) : null; return r ? G.bbox(r.flat()) : null; } catch (e) { return null; } });
    const hit = (a, b) => a && b && a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
    const out = [];
    objs.forEach((o, i) => {
      if (!isShape(o) || !bb[i]) { out.push(o); return; }
      const cutters = [];
      for (let j = i + 1; j < objs.length; j++) if (isShape(objs[j]) && hit(bb[i], bb[j])) cutters.push(objs[j]);
      if (!cutters.length) { out.push(o); return; }
      if (o.type === 'fill') {
        const r = B.subtract(o, cutters, keep);
        if (!r) { out.push(o); return; }
        r.forEach((sh) => out.push({ ...o, points: sh.outer, holes: sh.holes }));
      } else {
        const r = B.trimColumn(o, cutters, keep);
        if (!r) { out.push(o); return; }
        r.forEach((pts) => out.push({ ...o, points: pts }));
      }
    });
    return out;
  }


  // Automatische Einstellung: Farbanzahl (Ellbogen der Quantisierungsfehler), typische Strichbreite, Rauschen.
  function analyze(img, widthMM) {
    const { data, width: w, height: h } = img;
    const mm = widthMM / w;
    const err = (q) => {
      let e = 0, n = 0;
      for (let i = 0; i < q.labels.length; i += 3) {
        const l = q.labels[i]; if (l < 0) continue;
        const c = q.centers[l];
        e += (data[i * 4] - c[0]) ** 2 + (data[i * 4 + 1] - c[1]) ** 2 + (data[i * 4 + 2] - c[2]) ** 2; n++;
      }
      return n ? e / n : 0;
    };
    const errs = [];
    for (let k = 1; k <= 8; k++) errs[k] = err(quantize(data, w, h, k));
    let k = 1;
    for (let i = 2; i <= 8; i++) { if (errs[i - 1] > 150 && errs[i] < errs[i - 1] * 0.55) k = i; else if (errs[i - 1] <= 150) break; }
    const q = quantize(data, w, h, k);
    // Hintergrund = häufigste Farbe am Bildrand
    const edge = new Map();
    for (let x = 0; x < w; x++) for (const y of [0, h - 1]) { const l = q.labels[y * w + x]; edge.set(l, (edge.get(l) || 0) + 1); }
    let bg = -1, bn = 0; edge.forEach((n, l) => { if (n > bn) { bn = n; bg = l; } });
    // Laufbreiten der Vordergrundpixel (horizontal + vertikal)
    const runs = [];
    for (let y = 0; y < h; y += 2) { let r = 0; for (let x = 0; x <= w; x++) { const fg = x < w && q.labels[y * w + x] >= 0 && q.labels[y * w + x] !== bg; if (fg) r++; else { if (r > 1) runs.push(r); r = 0; } } }
    for (let x = 0; x < w; x += 2) { let r = 0; for (let y = 0; y <= h; y++) { const fg = y < h && q.labels[y * w + x] >= 0 && q.labels[y * w + x] !== bg; if (fg) r++; else { if (r > 1) runs.push(r); r = 0; } } }
    runs.sort((a, b) => a - b);
    const med = (runs[Math.floor(runs.length * 0.5)] || 4) * mm;
    const p90 = (runs[Math.floor(runs.length * 0.9)] || 6) * mm;
    return { colors: Math.max(1, Math.min(8, k - (bg >= 0 ? 0 : 0))), strokeMed: med, strokeP90: p90, satinMax: Math.max(3, Math.min(12, Math.round(p90 * 0.8))), minArea: Math.max(0.25, +(med * med * 0.15).toFixed(2)), lineMax: med < 0.9 ? 0.8 : 0 };
  }

  HW.auto = { autoDigitize, analyze, quantize, traceMask, smoothRing, components };
})(typeof window !== 'undefined' ? window : globalThis);
