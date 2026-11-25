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

  // Maske -> bereinigte Ringe (mm), größter zuerst
  function maskRings(m, cw, ch, mm, org, opts) {
    const SC = HW.scan;
    const f = new Float32Array(cw * ch);
    for (let i = 0; i < f.length; i++) f[i] = m[i];
    const fb = SC.blur(f, cw, ch, 0.7);
    const co = { mm, ox: org.x, oy: org.y, sigma: opts.smooth ?? 0.18, corner: opts.corner ?? 55, step: 0.1 };
    const rs = SC.contours(fb, cw, ch, 0.5).map((r) => SC.cleanRing(r, co)).filter((q) => q.dense.length >= 8);
    rs.sort((a, b) => Math.abs(G.signedArea(b.dense)) - Math.abs(G.signedArea(a.dense)));
    if (!rs.length) return rs;
    const sg = Math.sign(G.signedArea(rs[0].dense));
    return rs.filter((q, i) => i === 0 || Math.sign(G.signedArea(q.dense)) !== sg);
  }

  // Zusammenhängende Teile einer Maske (8er-Nachbarschaft)
  function maskParts(m, cw, ch) {
    const lab = new Int32Array(cw * ch).fill(-1), parts = [];
    for (let i = 0; i < m.length; i++) {
      if (!m[i] || lab[i] >= 0) continue;
      const px = [i], id = parts.length;
      lab[i] = id;
      for (let k = 0; k < px.length; k++) {
        const x = px[k] % cw, y = (px[k] / cw) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= cw || yy >= ch) continue;
          const j = yy * cw + xx;
          if (m[j] && lab[j] < 0) { lab[j] = id; px.push(j); }
        }
      }
      parts.push(px);
    }
    return parts;
  }

  /**
   * Breite und schmale Teile trennen (morphologisches Öffnen mit halber Satin-Grenze):
   * core = breite Bereiche (werden Fläche, mit Überstand "keep" unter die Säulen), narrow = schmale Arme/Beine.
   */
  function hybrid(mask, cw, ch, mm, satinMax, keep) {
    const SA = HW.satinauto;
    const r = satinMax / 2 / mm;
    const dt = SA.distanceTransform(mask, cw, ch);
    const er = new Uint8Array(cw * ch);
    let any = false;
    for (let i = 0; i < er.length; i++) if (dt[i] > r) { er[i] = 1; any = true; }
    if (!any) return null;
    const inv = new Uint8Array(cw * ch);
    for (let i = 0; i < inv.length; i++) inv[i] = er[i] ? 0 : 1;
    const de = SA.distanceTransform(inv, cw, ch); // Abstand zum erodierten Kern
    const core = new Uint8Array(cw * ch);
    for (let i = 0; i < core.length; i++) if (mask[i] && de[i] <= r + 0.5) core[i] = 1;
    // schmale Reste; winzige Säume am Kern gehören zum Kern
    const nar = new Uint8Array(cw * ch);
    for (let i = 0; i < nar.length; i++) nar[i] = mask[i] && !core[i] ? 1 : 0;
    const narrow = [];
    const ic = new Uint8Array(cw * ch);
    for (let i = 0; i < ic.length; i++) ic[i] = core[i] ? 0 : 1;
    const dCore = SA.distanceTransform(ic, cw, ch);
    for (const px of maskParts(nar, cw, ch)) {
      let maxD = 0;
      for (const i of px) maxD = Math.max(maxD, dt[i]);
      if (px.length < r * r * 1.2 || maxD < 1.2) { for (const i of px) core[i] = 1; continue; }
      // nur Teile mit freiem Ende (weit weg vom Kern) werden Säule; Stege zwischen Löchern und Säume bleiben Fläche
      let far = 0;
      for (const i of px) far = Math.max(far, dCore[i]);
      if (far < 1.6 * r) { for (const i of px) core[i] = 1; continue; }
      const m = new Uint8Array(cw * ch);
      for (const i of px) m[i] = 1;
      narrow.push(m);
    }
    // Kern mit Überstand unter die Säulen (gegen Lücken am Übergang)
    const ci = new Uint8Array(cw * ch);
    for (let i = 0; i < ci.length; i++) ci[i] = core[i] ? 0 : 1;
    const dc = SA.distanceTransform(ci, cw, ch), kp = keep / mm;
    const coreK = new Uint8Array(cw * ch);
    for (let i = 0; i < coreK.length; i++) if (mask[i] && dc[i] <= kp + 0.01) coreK[i] = 1;
    const cores = maskParts(coreK, cw, ch).filter((px) => px.length > 4).map((px) => { const m = new Uint8Array(cw * ch); for (const i of px) m[i] = 1; return m; });
    return { core: cores, narrow };
  }

  // Ringe (mm, Even-Odd) in eine Pixelmaske zeichnen -> glatte Maske ohne Rasterrauschen
  function fillRings(rings, cw, ch, mm, ox, oy) {
    const m = new Uint8Array(cw * ch);
    for (let y = 0; y < ch; y++) {
      const py = oy + (y + 0.5) * mm, xs = [];
      for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const a = r[j], b = r[i];
        if ((a.y > py) !== (b.y > py)) xs.push(a.x + ((py - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(0, Math.ceil((xs[k] - ox) / mm - 0.5)), xb = Math.min(cw - 1, Math.floor((xs[k + 1] - ox) / mm - 0.5));
        for (let x = xa; x <= xb; x++) m[y * cw + x] = 1;
      }
    }
    return m;
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
    const recognized = [];
    const borderItems = [];
    const lumOf = (hex) => { const h = hex.replace('#', ''); return parseInt(h.slice(0, 2), 16) * 0.3 + parseInt(h.slice(2, 4), 16) * 0.59 + parseInt(h.slice(4, 6), 16) * 0.11; };
    const darkKey = palette.slice().sort((a, b) => lumOf(a) - lumOf(b))[0];
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
      // Unterlappung: diese Farbe läuft etwas unter die später gestickten Nachbarfarben,
      // damit nach dem Einziehen der Fläche keine Lücke an der Farbgrenze bleibt
      // Schrifterkennung: sicher erkannte Buchstaben werden durch fertig digitalisierte Stickschrift-Zeichen ersetzt
      let glyphHits = null;
      if (opts.glyphs && opts.glyphs.length && HW.glyphmatch) {
        try { glyphHits = HW.glyphmatch.recognize(comps, w, opts.glyphs); } catch (e) { glyphHits = null; }
        if (glyphHits && glyphHits.size && glyphHits.text) recognized.push({ color: colorKey, text: glyphHits.text, font: glyphHits.font && glyphHits.font.name });
      }
      const glyphRuns = [];
      const later = new Set(order.slice(order.indexOf(lab) + 1));
      const U = later.size ? (opts.underlap ?? 0.6) / mm : 0, pad = 2 + Math.ceil(U);
      // Satinrand (Option): um den Umriss der ganzen Form (mit Armen/Beinen), wenn sie eine Fläche enthält
      let compHasFill = false, curFills = [], curInside = null;
      const colorBorders = [];
      const flushBorder = () => {
        if (opts.border && curFills.length && curInside) {
          const bw = Math.max(0.8, Math.min(10, opts.border.width || 2));
          const key = opts.border.color === 'dark' ? darkKey : colorKey;
          const params = (closed) => ({ ...HW.stitch.DEFAULTS.satin, width: bw, closed, underlay: bw <= 2.5 ? 'center' : 'edge+zigzag', pull: bw < 1.5 ? 0.1 : 0.2 });
          const target = opts.border.color === 'dark' ? borderItems : colorBorders;
          for (const f of curFills) {
            const fr = [f.outer, ...f.holes].map((r) => G.buildPath(r, true).pts);
            for (let ri = 0; ri < fr.length; ri++) {
              const ring = fr[ri];
              if (ring.length < 3) continue;
              const dense = G.resample(ring.concat([ring[0]]), 0.3, 180).slice(0, -1);
              // Kante liegt außen, wenn knapp jenseits der Fläche kein Teil der Form mehr ist
              // (an Ansätzen von Beinen/Armen setzt der Rand aus; die Satinteile bekommen keinen)
              const ext = dense.map((p, k) => {
                const a = dense[(k - 1 + dense.length) % dense.length], b = dense[(k + 1) % dense.length];
                const L = Math.hypot(b.x - a.x, b.y - a.y) || 1, n = { x: -(b.y - a.y) / L, y: (b.x - a.x) / L };
                const p1 = { x: p.x + n.x * 0.7, y: p.y + n.y * 0.7 }, p2 = { x: p.x - n.x * 0.7, y: p.y - n.y * 0.7 };
                const out = G.pointInRings(p1, fr) ? p2 : p1;
                return !curInside(out);
              });
              if (ext.every(Boolean)) {
                const src = ri === 0 ? f.outer : f.holes[ri - 1];
                target.push({ type: 'colC', colorKey: key, points: src.map((q) => ({ x: q.x, y: q.y, c: !!q.c })), params: params(true) });
                continue;
              }
              // offene Stücke entlang der Außenkante
              const k0 = ext.findIndex((e) => !e);
              let piece = [];
              const flushPiece = () => { if (piece.length * 0.3 >= 3) target.push({ type: 'colC', colorKey: key, points: G.rdp(piece, 0.03).map((q) => ({ x: q.x, y: q.y, c: true })), params: params(false) }); piece = []; };
              for (let t = 1; t <= dense.length; t++) {
                const k = (k0 + t) % dense.length;
                if (ext[k]) piece.push(dense[k]); else flushPiece();
              }
              flushPiece();
            }
          }
        }
        curFills = []; curInside = null;
      };
      for (let ci = 0; ci < comps.length; ci++) {
        flushBorder();
        const c = comps[ci];
        const gh = glyphHits && glyphHits.get(ci);
        if (gh) {
          if (!gh.skip) {
            // Reihenfolge und Richtung des Zeichens bleiben wie in der Schrift geplant (durchgehend ohne Schnitt)
            // innerhalb des Zeichens direkt weiterstechen, wo die Verbindung in der Buchstabenform liegt
            // (die Schrift ist so geplant); getrennte Teile wie i-Punkt oder Umlautpunkte nicht über den Stoff verbinden
            const objs = HW.glyphmatch.glyphToObjects(gh, mm, { x: opts.originX, y: opts.originY }).map((ob) => ({ ...ob, colorKey, glyph: gh.ch, fixedDir: true }));
            const polys = [];
            for (const ob of objs) {
              if (ob.type === 'colA') { const L = ob.points.filter((_, i) => i % 2 === 0), R = ob.points.filter((_, i) => i % 2 === 1); polys.push([L.concat(R.slice().reverse())]); }
              else if (ob.type === 'fill') polys.push([ob.points, ...(ob.holes || [])]);
            }
            const inGlyph = (q) => polys.some((rs) => G.pointInRings(q, rs));
            const endOf = (ob) => (ob.type === 'colA' ? G.lerp(ob.points[ob.points.length - 2], ob.points[ob.points.length - 1], 0.5) : ob.points[ob.points.length - 1]);
            const startOf = (ob) => (ob.type === 'colA' ? G.lerp(ob.points[0], ob.points[1], 0.5) : ob.points[0]);
            for (let k = 1; k < objs.length; k++) {
              const a = endOf(objs[k - 1]), b2 = startOf(objs[k]), d = G.dist(a, b2), n = Math.max(2, Math.ceil(d / 0.5));
              let ok2 = true;
              for (let t = 1; t < n && ok2; t++) if (!inGlyph(G.lerp(a, b2, t / n))) ok2 = false;
              if (ok2) objs[k].connect = 'stitch';
            }
            if (objs.length) glyphRuns.push({ x: gh.bb.x0, y: gh.bb.y0, h: gh.bb.y1 - gh.bb.y0, objs });
          }
          continue;
        }
        // auf die Region zuschneiden (schneller)
        let x0 = w, y0 = h, x1 = 0, y1 = 0;
        for (const p of c.pixels) { const x = p % w, y = (p / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
        const cw = Math.min(w, x1 + pad + 1) - x0, ch = Math.min(h, y1 + pad + 1) - y0;
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
          if (U > 0) {
            const inv = new Uint8Array(cw * ch);
            for (let i = 0; i < inv.length; i++) inv[i] = mask[i] ? 0 : 1;
            const dd = SA.distanceTransform(inv, cw, ch);
            const m2 = new Float32Array(cw * ch);
            let ext = 0;
            for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
              const i = y * cw + x;
              if (mask[i]) m2[i] = 1;
              else if (dd[i] <= U && later.has(q.labels[(y + y0) * w + (x + x0)])) { m2[i] = 1; ext++; }
            }
            if (ext) {
              const mb2 = SC.blur(m2, cw, ch, 0.8);
              for (let y = 1; y < ch - 1; y++) for (let x = 1; x < cw - 1; x++) { const i = y * cw + x; if (mb2[i] > fc[i]) fc[i] = mb2[i]; }
            }
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
        if (opts.border) {
          const fm = precise ? fillRings(allRings, cw, ch, mm, opts.originX + x0 * mm, opts.originY + y0 * mm) : mask;
          const ox = opts.originX + x0 * mm, oy = opts.originY + y0 * mm;
          curInside = (p) => { const x = Math.floor((p.x - ox) / mm), y = Math.floor((p.y - oy) / mm); return x >= 0 && y >= 0 && x < cw && y < ch && !!fm[y * cw + x]; };
        }
        // Schmale Formen (Schrift, Linien, Bögen) -> drehende Satinsäulen
        let cols = null;
        if (mode !== 'tatami') {
          const cmask = precise ? fillRings(allRings, cw, ch, mm, opts.originX + x0 * mm, opts.originY + y0 * mm) : mask;
          const res = SA.shapeToColumns(cmask, cw, ch, mm, { x: opts.originX + x0 * mm, y: opts.originY + y0 * mm }, allRings, { station: opts.station, turnDeg: opts.turnDeg });
          if (res) {
            const ws = res.widths.slice().sort((a, b) => a - b);
            const p90 = ws[Math.floor(ws.length * 0.9)] || 0;
            let cover = 0;
            for (const col of res.columns) {
              const L = col.filter((_, i) => i % 2 === 0), R = col.filter((_, i) => i % 2 === 1).reverse();
              cover += Math.abs(G.signedArea(L.concat(R)));
            }
            // Anteil der Fläche, der breiter als die Satin-Grenze ist (Körper, Kopf …)
            let wide = 0;
            for (const col of res.columns)
              for (let k = 2; k + 1 < col.length; k += 2) {
                const w0 = G.dist(col[k - 2], col[k - 1]), w1 = G.dist(col[k], col[k + 1]);
                if ((w0 + w1) / 2 > satinMax) wide += ((w0 + w1) / 2) * G.dist(G.lerp(col[k - 2], col[k - 1], 0.5), G.lerp(col[k], col[k + 1], 0.5));
              }
            if (mode === 'satin' || (p90 <= satinMax && wide / area < 0.08 && cover / area > 0.75)) cols = res;
            else if (mode === 'auto' && precise && wide / area >= 0.08) {
              // gemischt: breite Teile als Fläche, schmale Arme/Beine/Striche als Satin
              const hy = hybrid(cmask, cw, ch, mm, satinMax, opts.keepMM ?? 0.4);
              if (hy) {
                const org = { x: opts.originX + x0 * mm, y: opts.originY + y0 * mm };
                for (const nm of hy.narrow) {
                  const rr = maskRings(nm, cw, ch, mm, org, opts);
                  if (!rr.length) continue;
                  const r2 = SA.shapeToColumns(nm, cw, ch, mm, org, rr.map((c) => c.dense), { station: opts.station, turnDeg: opts.turnDeg });
                  if (r2) { patchGaps(r2, nm, cw, ch, org, c.pixels); emitCols(r2); }
                }
                for (const cm of hy.core) {
                  const rr = maskRings(cm, cw, ch, mm, org, opts);
                  if (!rr.length) continue;
                  const tol = opts.tol ?? 0.04;
                  const o2 = SC.toControlPoints(rr[0], tol), h2 = rr.slice(1).filter((q) => Math.abs(G.signedArea(q.dense)) >= (opts.minAreaMM2 || 2)).map((q) => SC.toControlPoints(q, tol));
                  emitFill(o2, h2, cm.reduce((s2, v) => s2 + v, 0) * mm * mm, c.pixels);
                }
                continue;
              }
            }
          }
        }
        if (cols) { if (precise) patchGaps(cols, fillRings(allRings, cw, ch, mm, opts.originX + x0 * mm, opts.originY + y0 * mm), cw, ch, { x: opts.originX + x0 * mm, y: opts.originY + y0 * mm }, c.pixels); emitCols(cols); continue; }
        emitFill(outer, holes, area, c.pixels);
      }
      // Ecken, die keine Säule erreicht (spitze Winkel, Stoßstellen): kleine Unterfüllung, die unter den Säulen liegt
      function patchGaps(cols, cm, cw, ch, org, pixels) {
        if (opts.patchGaps === false) return;
        const cov = new Uint8Array(cw * ch);
        for (const col of cols.columns) {
          const L = col.filter((_, i) => i % 2 === 0), R = col.filter((_, i) => i % 2 === 1).reverse();
          const m = fillRings([L.concat(R)], cw, ch, mm, org.x, org.y);
          for (let i = 0; i < m.length; i++) if (m[i]) cov[i] = 1;
        }
        const left = new Uint8Array(cw * ch);
        for (let y = 1; y < ch - 1; y++) for (let x = 1; x < cw - 1; x++) {
          const i = y * cw + x;
          // nur echte Lücken: auch die Nachbarn sind unbedeckt (Randrauschen ignorieren)
          if (cm[i] && !cov[i] && cm[i - 1] && !cov[i - 1] && cm[i + 1] && !cov[i + 1] && cm[i - cw] && !cov[i - cw] && cm[i + cw] && !cov[i + cw]) left[i] = 1;
        }
        const minPx = (opts.patchMin ?? 0.3) / (mm * mm);
        const toMM = (i) => ({ x: org.x + ((i % cw) + 0.5) * mm, y: org.y + (((i / cw) | 0) + 0.5) * mm });
        for (const px of maskParts(left, cw, ch)) {
          if (px.length < minPx) continue;
          const bigGap = px.length * mm * mm > (opts.capMax ?? 6);
          // 1) bevorzugt: nächstes Säulenende bis in die Ecke verlängern (fächert in den Winkel, kein Zusatzobjekt)
          let cx = 0, cy = 0;
          for (const i of px) { const q = toMM(i); cx += q.x; cy += q.y; }
          const cen = { x: cx / px.length, y: cy / px.length };
          let best = null;
          for (const col of cols.columns) {
            const n = col.length;
            if (n < 6) continue;
            for (const atEnd of [false, true]) {
              const e0 = atEnd ? n - 2 : 0, p0 = atEnd ? n - 4 : 2;
              const mid = G.lerp(col[e0], col[e0 + 1], 0.5), inner = G.lerp(col[p0], col[p0 + 1], 0.5);
              const d = G.dist(cen, mid);
              if (!best || d < best.d) best = { d, col, e0, inner };
            }
          }
          if (opts.capExtend && best && best.d < 2.5) {
            let tip = null, td = -1;
            for (const i of px) { const q = toMM(i); const d = G.dist(q, best.inner); if (d > td) { td = d; tip = q; } }
            const { col, e0 } = best;
            const side = G.dist(col[e0], tip) <= G.dist(col[e0 + 1], tip) ? e0 : e0 + 1;
            if (tip && td > G.dist(col[side], best.inner)) { col[side] = { x: tip.x, y: tip.y, c: false }; continue; }
          }
          // 2) sonst: als „Kappe“ an die nächste Säule hängen – die Säule stickt die Ecke selbst mit
          //    (kein eigenes Objekt, also kein zusätzlicher Weg und kein Schnitt)
          // um 2 Pixel vergrößert (unter die Säulen), aber innerhalb der Form
          const m = new Uint8Array(cw * ch);
          for (const i of px) {
            const x = i % cw, y = (i / cw) | 0;
            for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < cw && yy < ch && cm[yy * cw + xx]) m[yy * cw + xx] = 1; }
          }
          const rr = maskRings(m, cw, ch, mm, org, { ...opts, smooth: 0.05 });
          if (!rr.length) continue;
          if (bigGap) {
            // größere Lücke: eigene kleine Fläche (unter den Säulen)
            const n0 = items.length, had = compHasFill, nf = curFills.length;
            emitFill(SC.toControlPoints(rr[0], opts.tol ?? 0.04), [], px.length * mm * mm, pixels);
            compHasFill = had; curFills.length = nf; // Lückenfüllung bekommt keinen eigenen Rand
            for (let k = n0; k < items.length; k++) { items[k].patch = true; items[k].params.underlay = 'none'; }
            continue;
          }
          const ring = SC.toControlPoints(rr[0], opts.tol ?? 0.04).map((q) => ({ x: q.x, y: q.y }));
          let owner = null, od = Infinity;
          for (const col of cols.columns) for (const q of col) { const d = G.dist(q, cen); if (d < od) { od = d; owner = col; } }
          if (!owner) continue;
          if (!cols.caps) cols.caps = new Map();
          if (!cols.caps.has(owner)) cols.caps.set(owner, []);
          cols.caps.get(owner).push(ring);
        }
      }
      function emitCols(cols) {
        {
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
              ...(cols.caps && cols.caps.get(col) ? { caps: cols.caps.get(col) } : {}),
              type: 'colA', colorKey, points: col,
              params: { ...HW.stitch.DEFAULTS.satin, underlay: ul, pull: med < 1.5 ? 0.1 : 0.2, ...(opts.satinSpacing ? { spacing: opts.satinSpacing } : {}) },
              s: sP, e: eP,
            });
          }
        }
      }
      function emitFill(outer, holes, area, pixels) {
        compHasFill = true;
        curFills.push({ outer, holes: holes || [] });
        let per = 0;
        for (let i = 0; i < outer.length; i++) per += G.dist(outer[i], outer[(i + 1) % outer.length]);
        const width = (2 * area) / (per || 1);
        const satin = mode !== 'tatami' && width <= 2.2 && !holes.length;
        const ang = (principalAngle(pixels, w) * 180) / Math.PI + 90;
        const bb = G.bbox(outer);
        const ctr = { x: (bb.x0 + bb.x1) / 2, y: (bb.y0 + bb.y1) / 2 };
        items.push({
          type: 'fill', colorKey, points: outer, holes,
          params: {
            ...HW.stitch.DEFAULTS.fill,
            spacing: opts.fillSpacing || 0.38,
            fillType: satin ? 'satin' : 'tatami',
            angle: satin ? Math.round(ang) : opts.angle ?? 45,
            underlay: satin ? 'none' : area > 15 ? 'tatami' : 'none',
            border: opts.outline ? 'run' : 'none',
          },
          s: ctr, e: ctr,
        });
      }
      flushBorder();
      // erkannte Schrift zuerst, in Lesereihenfolge (Zeile für Zeile, links nach rechts)
      if (glyphRuns.length) {
        const hMed = glyphRuns.map((g2) => g2.h).sort((a2, b2) => a2 - b2)[glyphRuns.length >> 1];
        glyphRuns.sort((a2, b2) => (Math.abs(a2.y - b2.y) > hMed * 0.6 ? a2.y - b2.y : a2.x - b2.x));
        for (const g2 of glyphRuns) for (const ob of g2.objs) objects.push(ob);
        const lo = glyphRuns[glyphRuns.length - 1].objs, lp = lo[lo.length - 1].points;
        cursor = lp[lp.length - 1];
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
      // Rand in Flächenfarbe direkt nach dem Farbblock (kein zusätzlicher Farbwechsel)
      objects.push(...colorBorders);
    }
    // Ränder in eigener (dunkler) Farbe zuletzt: sie liegen über allen Kanten
    if (borderItems.length) objects.push(...borderItems);
    let res = objects;
    if (opts.overlap !== false && HW.boolean) { try { res = trimOverlaps(objects, opts.keepMM ?? 0.4); } catch (e) { res = objects; } }
    // Fahrplan: Reihenfolge und Richtungen so wählen, dass möglichst wenig geschnitten wird
    // (Überlappungen sind entfernt, innerhalb einer Farbe ist die Reihenfolge also frei)
    if (opts.sequence !== false && HW.route && HW.route.sequence) {
      try {
        res.forEach((o) => { o.color = o.colorKey; });
        res = HW.route.sequence(res, { trimDist: opts.trimDist ?? 2, keepOverlapOrder: false });
      } catch (e) { /* Reihenfolge bleibt */ }
      res.forEach((o) => { delete o.color; delete o._cover; });
    }
    return { objects: res, palette, recognized };
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
      for (let j = i + 1; j < objs.length; j++) {
        // Stickschrift-Zeichen überlappen sich innerhalb der Farbe absichtlich (Säulen greifen ineinander)
        if (objs[j].colorKey === o.colorKey && (o.glyph || objs[j].glyph)) continue;
        if (isShape(objs[j]) && hit(bb[i], bb[j])) cutters.push(objs[j]);
      }
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
