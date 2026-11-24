/* Schrifterkennung für das Auto-Digitalisieren:
   Buchstaben im Bild mit den eingebauten Stickschriften vergleichen (Formvergleich auf einem Raster)
   und – wenn ein Zeichen sicher erkannt ist – durch den fertig digitalisierten Stickschrift-Buchstaben ersetzen.
   So entstehen saubere Satinsäulen in sinnvoller Reihenfolge statt einer automatischen Zerlegung. */
(function (g) {
  const HW = (g.HW = g.HW || {});
  const G = HW.geo;
  const N = 32; // Rastergröße für den Formvergleich

  // Zeichen, die erkannt werden (Satzzeichen sind zu klein/mehrdeutig)
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789ÄÖÜäöüß&';
  // Schriften für den Vergleich: Block-, Serifen- und Zierschriften (Handschriften passen selten zu Logos)
  const MATCH_FONTS = ['barstitch_bold', 'barstitch_regular', 'excalibur_KOR', 'geneva_rounded', 'caffeine_KOR', 'medium_font', 'caesarus_SC_FI',
    'ambigue', 'dejavufont', 'apex_simple_AGS', 'venezia', 'violin_serif', 'chicken_little', 'bathaus_FI'];

  const flat = (a) => { const o = []; for (let i = 0; i + 1 < a.length; i += 2) o.push({ x: a[i], y: a[i + 1] }); return o; };

  // Umriss-Polygone eines Stickschrift-Zeichens (Säulen als Band aus beiden Kanten, Flächen mit Löchern)
  function glyphPolys(gl) {
    const polys = [];
    for (const e of gl) {
      if (e.t === 'colA') {
        const p = flat(e.p);
        const L = p.filter((_, i) => i % 2 === 0), R = p.filter((_, i) => i % 2 === 1);
        if (L.length >= 2) polys.push([L.concat(R.reverse())]);
      } else if (e.t === 'fill') polys.push(e.r.map(flat));
      else if (e.t === 'colC' && e.pr && e.pr.width) {
        const c = flat(e.p), w = e.pr.width / 2;
        polys.push([G.offsetPolyline(c, -w).concat(G.offsetPolyline(c, w).reverse())]);
      }
    }
    return polys;
  }

  // Polygone (jede Gruppe Gerade-Ungerade) in ein N×N-Raster über dem Rahmen bb zeichnen
  function rasterPolys(polys, bb) {
    const m = new Uint8Array(N * N);
    const sx = N / Math.max(1e-6, bb.x1 - bb.x0), sy = N / Math.max(1e-6, bb.y1 - bb.y0);
    for (const rings of polys) {
      for (let r = 0; r < N; r++) {
        const y = bb.y0 + (r + 0.5) / sy, xs = [];
        for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const a = ring[j], b = ring[i];
          if ((a.y > y) !== (b.y > y)) xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
        }
        xs.sort((u, v) => u - v);
        for (let k = 0; k + 1 < xs.length; k += 2) {
          const c0 = Math.max(0, Math.ceil((xs[k] - bb.x0) * sx - 0.5)), c1 = Math.min(N - 1, Math.floor((xs[k + 1] - bb.x0) * sx - 0.5));
          for (let c = c0; c <= c1; c++) m[r * N + c] = 1;
        }
      }
    }
    return m;
  }

  // Pixelmenge (Indizes im Bild der Breite w) ins N×N-Raster über ihrem Rahmen
  function rasterPixels(pixels, w) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pixels) { const x = p % w, y = (p / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const cnt = new Float32Array(N * N), tot = new Float32Array(N * N);
    // Anteil gefüllter Pixel je Rasterzelle
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) tot[Math.min(N - 1, ((y * N) / bh) | 0) * N + Math.min(N - 1, ((x * N) / bw) | 0)]++;
    for (const p of pixels) { const x = (p % w) - x0, y = ((p / w) | 0) - y0; cnt[Math.min(N - 1, ((y * N) / bh) | 0) * N + Math.min(N - 1, ((x * N) / bw) | 0)]++; }
    const m = new Uint8Array(N * N);
    for (let i = 0; i < m.length; i++) m[i] = tot[i] && cnt[i] / tot[i] >= 0.5 ? 1 : 0;
    return { m, bb: { x0, y0, x1: x1 + 1, y1: y1 + 1 } };
  }

  // um eine Zelle verbreitern (kleine Abweichungen der Strichstärke/Lage verzeihen)
  function dilate(m) {
    const o = new Uint8Array(N * N);
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (!m[r * N + c]) continue;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const rr = r + dr, cc = c + dc; if (rr >= 0 && cc >= 0 && rr < N && cc < N) o[rr * N + cc] = 1; }
    }
    return o;
  }

  // Ähnlichkeit 0..1: Überdeckung mit Toleranz, Abzug für abweichendes Seitenverhältnis
  function similarity(A, Ad, arA, T) {
    let inter = 0, a = 0, b = 0;
    for (let i = 0; i < A.length; i++) {
      if (A[i]) { a++; if (T.md[i]) inter++; }
      if (T.m[i]) { b++; if (Ad[i]) inter++; }
    }
    if (!a || !b) return 0;
    let ex = 0, un = 0;
    for (let i = 0; i < A.length; i++) { if (A[i] && T.m[i]) ex++; if (A[i] || T.m[i]) un++; }
    // beide Richtungen mit Toleranz (Bild in Schrift und Schrift in Bild) plus exakte Deckung als Feinentscheid
    const fit = 0.5 * (inter / (a + b)) + 0.5 * (un ? ex / un : 0) + 0.25;
    const ar = Math.abs(Math.log(arA / T.ar));
    return fit - 0.35 * ar;
  }

  // Anzahl getrennter Teile im Raster (i hat zwei, ä drei …)
  function partsOf(m) {
    const seen = new Uint8Array(N * N);
    let n = 0;
    for (let i = 0; i < m.length; i++) {
      if (!m[i] || seen[i]) continue;
      n++;
      const st = [i]; seen[i] = 1;
      while (st.length) {
        const k = st.pop(), r = (k / N) | 0, c = k % N;
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const rr = r + dr, cc = c + dc, j = rr * N + cc;
          if (rr >= 0 && cc >= 0 && rr < N && cc < N && m[j] && !seen[j]) { seen[j] = 1; st.push(j); }
        }
      }
    }
    return n;
  }

  const cache = {};
  // Vergleichsvorlagen einer Schrift (einmal je Schrift berechnet)
  function templates(font) {
    if (cache[font.id]) return cache[font.id];
    const list = [];
    for (const ch of CHARS) {
      const gl = font.glyphs[ch];
      if (!gl) continue;
      const polys = glyphPolys(gl);
      if (!polys.length) continue;
      const bb = G.bbox(polys.flat(2));
      if (!(bb.x1 > bb.x0) || !(bb.y1 > bb.y0)) continue;
      const m = rasterPolys(polys, bb);
      list.push({ ch, m, md: dilate(m), ar: (bb.x1 - bb.x0) / (bb.y1 - bb.y0), bb, gl, font: font.id, parts: partsOf(m) });
    }
    // Versalhöhe aus „H“ (sonst größtes Zeichen): Höhe und Lage jedes Zeichens relativ dazu
    const H = list.find((t) => t.ch === 'H') || list.reduce((a, b) => (b.bb.y1 - b.bb.y0 > a.bb.y1 - a.bb.y0 ? b : a), list[0]);
    if (H) {
      const capH = H.bb.y1 - H.bb.y0, base = H.bb.y1;
      for (const t of list) { t.relH = (t.bb.y1 - t.bb.y0) / capH; t.relTop = (base - t.bb.y0) / capH; t.relBot = (base - t.bb.y1) / capH; }
    }
    return (cache[font.id] = list);
  }

  /** Stickschriften für die Erkennung laden (Browser: nachladen; Node: aus HW.INKFONTS). */
  async function prepare(ids = MATCH_FONTS) {
    const fonts = [];
    for (const id of ids) {
      try { const f = HW.INKFONTS[id] || (HW.loadInkFont ? await HW.loadInkFont(id) : null); if (f) fonts.push(f); } catch (e) { /* Schrift fehlt: weglassen */ }
    }
    return fonts.map((f) => ({ font: f, tpl: templates(f) }));
  }

  /**
   * Erkennt Buchstaben unter den Bildteilen einer Farbe.
   * comps: [{pixels}] ; w: Bildbreite ; prepared: Ergebnis von prepare()
   * Rückgabe: Map compIndex -> {ch, font, score, tpl, bb (Pixel)}
   */
  function recognize(comps, w, prepared, opts = {}) {
    const thr = opts.threshold ?? 0.8;
    const box = (px) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of px) { const x = p % w, y = (p / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return { x0, y0, x1: x1 + 1, y1: y1 + 1 }; };
    const boxes = comps.map((c) => box(c.pixels));
    // 1) kleine Teile (i-Punkt, Umlautpunkte) dem Zeichen darunter zuordnen
    const hs = boxes.map((b) => b.y1 - b.y0).sort((a, b) => a - b), medH = hs[Math.floor(hs.length / 2)] || 1;
    const owner = comps.map((_, i) => i);
    boxes.forEach((b, i) => {
      if (b.y1 - b.y0 > medH * 0.45) return;
      const cx = (b.x0 + b.x1) / 2;
      let best = -1, bd = Infinity;
      boxes.forEach((o, k) => {
        if (k === i || o.y1 - o.y0 <= medH * 0.45) return;
        if (cx < o.x0 - (o.x1 - o.x0) * 0.15 || cx > o.x1 + (o.x1 - o.x0) * 0.15) return;
        const gap = o.y0 - b.y1;
        if (gap < -medH * 0.1 || gap > medH * 0.6) return;
        if (gap < bd) { bd = gap; best = k; }
      });
      if (best >= 0) owner[i] = best;
    });
    const groups = [];
    comps.forEach((c, i) => { if (owner[i] === i) groups.push({ main: i, parts: [i] }); });
    comps.forEach((c, i) => { if (owner[i] !== i) { const g2 = groups.find((q) => q.main === owner[i]); if (g2) g2.parts.push(i); } });
    // 2) Zeilen: Gruppen mit überlappender Höhe; Versalhöhe je Zeile ≈ obere Höhen der Zeichen
    const gbox = (g2) => { const bs = g2.parts.map((i) => boxes[i]); return { x0: Math.min(...bs.map((b) => b.x0)), y0: Math.min(...bs.map((b) => b.y0)), x1: Math.max(...bs.map((b) => b.x1)), y1: Math.max(...bs.map((b) => b.y1)) }; };
    groups.forEach((g2) => { g2.bb = gbox(g2); g2.mainBB = boxes[g2.main]; });
    const lines = [];
    for (const g2 of groups.slice().sort((a, b) => a.mainBB.y0 - b.mainBB.y0)) {
      const b = g2.mainBB;
      let ln = lines.find((l) => Math.min(l.y1, b.y1) - Math.max(l.y0, b.y0) > 0.4 * Math.min(l.y1 - l.y0, b.y1 - b.y0));
      if (!ln) { ln = { y0: b.y0, y1: b.y1, g: [] }; lines.push(ln); }
      ln.g.push(g2); ln.y0 = Math.min(ln.y0, b.y0); ln.y1 = Math.max(ln.y1, b.y1);
    }
    for (const ln of lines) {
      // Grundlinie: häufigste Unterkante; Versalhöhe: obere Kanten der hohen Zeichen
      const bots = ln.g.map((g2) => g2.mainBB.y1).sort((a, b) => a - b), base = bots[Math.floor(bots.length * 0.6)];
      const tops = ln.g.map((g2) => base - g2.mainBB.y0).sort((a, b) => b - a), cap = tops[Math.min(tops.length - 1, Math.floor(tops.length * 0.2))] || 1;
      ln.g.forEach((g2) => { g2.relH = (g2.bb.y1 - g2.bb.y0) / cap; g2.relTop = (base - g2.bb.y0) / cap; g2.relBot = (base - g2.bb.y1) / cap; });
    }
    const feats = groups.map((g2) => {
      const px = g2.parts.flatMap((i) => comps[i].pixels);
      const r = rasterPixels(px, w);
      return { ...r, md: dilate(r.m), ar: (r.bb.x1 - r.bb.x0) / (r.bb.y1 - r.bb.y0), relH: g2.relH, relTop: g2.relTop, relBot: g2.relBot, parts: g2.parts.length };
    });
    const score = (f, t) => {
      // Zeichen aus mehreren Teilen (i, j, Umlaute) nur mit Vorlagen aus gleich vielen Teilen vergleichen
      if (f.parts > 1 && t.parts !== f.parts) return -1;
      let s0 = similarity(f.m, f.md, f.ar, t);
      if (t.relH && f.relH) s0 -= 0.5 * Math.abs(f.relTop - t.relTop) + 0.5 * Math.abs(f.relBot - t.relBot);
      return s0;
    };
    const perFont = prepared.map(({ font, tpl }) => {
      const best = feats.map((f) => { let b = null; for (const t of tpl) { const s0 = score(f, t); if (!b || s0 > b.score) b = { score: s0, tpl: t }; } return b; });
      const good = best.filter((b) => b && b.score >= thr);
      return { font, best, n: good.length, sum: good.reduce((s1, b) => s1 + b.score, 0) };
    });
    perFont.sort((a, b) => b.n - a.n || b.sum - a.sum);
    const pick = perFont[0];
    const res = new Map();
    if (!pick || !pick.n) return res;
    pick.best.forEach((b, gi) => {
      if (!b || b.score < thr) return;
      const g2 = groups[gi];
      res.set(g2.main, { ch: b.tpl.ch, font: pick.font.id, score: b.score, tpl: b.tpl, bb: feats[gi].bb, parts: g2.parts });
      g2.parts.forEach((k) => { if (k !== g2.main) res.set(k, { skip: true, owner: g2.main }); });
    });
    // nur echte Schrift: in einer Zeile müssen mindestens zwei Zeichen erkannt sein
    // (sonst würden Kreise, Augen oder Punkte als „O“ ersetzt)
    for (const ln of lines) {
      const hits = ln.g.filter((g2) => res.has(g2.main) && !res.get(g2.main).skip);
      if (hits.length >= (opts.minPerLine ?? 2)) continue;
      for (const g2 of hits) for (const k of g2.parts) res.delete(k);
    }
    // Text in Lesereihenfolge (für die Anzeige)
    res.text = lines.sort((a, b) => a.y0 - b.y0).map((ln) => ln.g.sort((a, b) => a.bb.x0 - b.bb.x0).map((g2) => (res.get(g2.main) && res.get(g2.main).ch) || '·').join('')).join(' / ');
    res.font = pick.font;
    return res;
  }

  /**
   * Stickobjekte eines erkannten Zeichens, eingepasst in den Pixelrahmen bb (mm pro Pixel, Ursprung org).
   * Säulen bleiben Säulen (fertig digitalisiert), nur Lage und Größe werden angepasst.
   */
  function glyphToObjects(hit, mm, org) {
    const t = hit.tpl, bb = hit.bb;
    const sx = ((bb.x1 - bb.x0) * mm) / (t.bb.x1 - t.bb.x0), sy = ((bb.y1 - bb.y0) * mm) / (t.bb.y1 - t.bb.y0);
    const map = (p) => ({ x: org.x + bb.x0 * mm + (p.x - t.bb.x0) * sx, y: org.y + bb.y0 * mm + (p.y - t.bb.y0) * sy });
    const out = [];
    const s = Math.sqrt(sx * sy);
    for (const e of t.gl) {
      if (e.t === 'colA') {
        const pts = flat(e.p).map((p, k) => ({ ...map(p), c: (e.c || '')[k >> 1] === '1' }));
        out.push({ type: 'colA', points: pts, params: { ...HW.stitch.DEFAULTS.satin, ...(e.pr || {}) } });
      } else if (e.t === 'fill') {
        const rs = e.r.map((r) => flat(r).map(map));
        out.push({ type: 'fill', points: rs[0], holes: rs.slice(1), params: { ...HW.stitch.DEFAULTS.fill, fillType: 'tatami', ...(e.pr || {}) } });
      } else if (e.t === 'colC') {
        out.push({ type: 'colC', points: flat(e.p).map(map), params: { ...HW.stitch.DEFAULTS.satin, ...(e.pr || {}), width: ((e.pr && e.pr.width) || 2) * s } });
      }
      else if (e.t === 'run') {
        // Laufstiche der Schrift sind geplante Unterwege zwischen den Säulen (liegen später unter dem Satin)
        out.push({ type: 'run', points: flat(e.p).map(map), params: { ...HW.stitch.DEFAULTS.run, ...(e.pr || {}), closed: false } });
      }
    }
    return out;
  }

  HW.glyphmatch = { prepare, recognize, glyphToObjects, templates, MATCH_FONTS, CHARS };
})(typeof window !== 'undefined' ? window : globalThis);
