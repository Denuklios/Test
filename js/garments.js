/* Kleidungsvorlagen: T-Shirt, Polo, Sweatshirt, Hoodie, Kappe – jeweils Vorderseite, Rückseite und Ärmel bzw. Seite.
   Alles wird beim Start in echter Größe (mm) gezeichnet: Stoff mit Webstruktur, Nähte, Falten, Schatten.
   Das Bild liegt später hinter dem Stickrahmen; (0,0) des Bildes ist ein fester Bezugspunkt der Ansicht.
   HW.garments.render(kind, view, { color, size }) → { canvas, ppm, ox, oy, anchors, refs, sizeLabel } */
(function (g) {
  const HW = (g.HW = g.HW || {});
  const PPM = 2; // Pixel je mm im Zwischenbild

  /* ---------------- Farben ---------------- */
  const rgb = (hex) => { const n = parseInt(String(hex).replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const lum = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const dark = (c, t) => mixc(c, [0, 0, 0], t);
  const light = (c, t) => mixc(c, [255, 255, 255], t);

  /* ---------------- Stoffstruktur (Overlay-Muster) ---------------- */
  const texCache = {};
  function seeded(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  function texture(kind) {
    if (texCache[kind]) return texCache[kind];
    const N = kind === 'fleece' ? 64 : 48;
    const c = document.createElement('canvas'); c.width = c.height = N;
    const x = c.getContext('2d');
    const img = x.createImageData(N, N), d = img.data, rnd = seeded(kind.length * 7919);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      let v = 128 + (rnd() - 0.5) * (kind === 'fleece' ? 46 : 22);
      if (kind === 'jersey') v += (i % 3 === 0 ? -10 : i % 3 === 1 ? 6 : 0) + ((i + j) % 6 < 2 ? -4 : 2); // feine Maschenstäbchen
      else if (kind === 'pique') { const a = i % 6, b = j % 6; v += (a < 3 && b < 3) ? 12 : (a === 3 || b === 3) ? -14 : -2; }
      else if (kind === 'twill') v += (((i + j) % 4) < 2 ? 9 : -9);
      else if (kind === 'rib') v += (i % 4 < 2 ? 14 : -16);
      const k = (j * N + i) * 4; d[k] = d[k + 1] = d[k + 2] = Math.max(0, Math.min(255, v)); d[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return (texCache[kind] = c);
  }

  /* ---------------- Zeichenhelfer (Koordinaten in mm) ---------------- */
  // Pfad aus Segmenten: ['M',x,y] ['L',x,y] ['C',x1,y1,x2,y2,x,y] ['Q',x1,y1,x,y] ['Z']
  function mk(segs, mirror) {
    const p = new Path2D();
    const run = (s, m) => {
      const X = (v) => (m ? -v : v);
      for (const q of s) {
        if (q[0] === 'M') p.moveTo(X(q[1]), q[2]);
        else if (q[0] === 'L') p.lineTo(X(q[1]), q[2]);
        else if (q[0] === 'C') p.bezierCurveTo(X(q[1]), q[2], X(q[3]), q[4], X(q[5]), q[6]);
        else if (q[0] === 'Q') p.quadraticCurveTo(X(q[1]), q[2], X(q[3]), q[4]);
        else if (q[0] === 'Z') p.closePath();
      }
    };
    run(segs, false);
    if (mirror) run(segs, true);
    return p;
  }
  const stroke = (x, p, w, col, dash) => { x.save(); x.lineWidth = w; x.strokeStyle = col; x.lineJoin = 'round'; x.lineCap = 'round'; if (dash) x.setLineDash(dash); x.stroke(p); x.restore(); };
  // weicher Strich: mehrere breite, schwache Striche übereinander (ohne Filter, läuft überall)
  function soft(x, p, w, col, a, steps = 6) {
    x.save(); x.lineCap = 'round'; x.lineJoin = 'round';
    for (let k = steps; k >= 1; k--) { x.lineWidth = w * (0.25 + 0.75 * k / steps); x.strokeStyle = css(col, a / steps * 1.25); x.stroke(p); }
    x.restore();
  }
  function line(pts) { const p = new Path2D(); pts.forEach((q, i) => (i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1]))); return p; }
  function curve(a, c1, c2, b) { const p = new Path2D(); p.moveTo(a[0], a[1]); p.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], b[0], b[1]); return p; }

  /* Ein Stoffstück: Grundfarbe, Licht, Struktur, Kantenschatten, Umriss */
  function piece(x, path, o, opt = {}) {
    const base = opt.base || o.rgb;
    x.save();
    x.clip(path);
    const bb = opt.bb || o.bb;
    x.fillStyle = css(base); x.fillRect(bb.x0 - 30, bb.y0 - 30, bb.x1 - bb.x0 + 60, bb.y1 - bb.y0 + 60);
    // Licht von links oben
    const gr = x.createLinearGradient(bb.x0, 0, bb.x1, 0);
    const L = lum(base), dk = L > 0.8 ? 0.16 : L > 0.35 ? 0.2 : 0.3;
    gr.addColorStop(0, css([0, 0, 0], dk * 0.9)); gr.addColorStop(0.22, css([255, 255, 255], L > 0.5 ? 0.0 : 0.07)); gr.addColorStop(0.55, css([255, 255, 255], L > 0.5 ? 0.04 : 0.1)); gr.addColorStop(1, css([0, 0, 0], dk * 1.15));
    x.fillStyle = gr; x.fillRect(bb.x0 - 30, bb.y0 - 30, bb.x1 - bb.x0 + 60, bb.y1 - bb.y0 + 60);
    const gv = x.createLinearGradient(0, bb.y0, 0, bb.y1);
    gv.addColorStop(0, css([255, 255, 255], L > 0.5 ? 0.05 : 0.08)); gv.addColorStop(1, css([0, 0, 0], 0.1));
    x.fillStyle = gv; x.fillRect(bb.x0 - 30, bb.y0 - 30, bb.x1 - bb.x0 + 60, bb.y1 - bb.y0 + 60);
    // Struktur
    const tx = texture(opt.tex || o.tex);
    x.save(); x.globalCompositeOperation = 'overlay'; x.globalAlpha = opt.texAlpha ?? (L > 0.85 ? 0.2 : 0.26);
    x.scale(1 / PPM, 1 / PPM); // Muster in Pixeln
    x.fillStyle = x.createPattern(tx, 'repeat'); x.fillRect((bb.x0 - 30) * PPM, (bb.y0 - 30) * PPM, (bb.x1 - bb.x0 + 60) * PPM, (bb.y1 - bb.y0 + 60) * PPM);
    x.restore();
    // Kanten etwas dunkler (Stoff wölbt sich weg)
    if (opt.edge !== false) soft(x, path, opt.edgeW || 22, [0, 0, 0], opt.edgeA ?? (L > 0.7 ? 0.2 : 0.26), 8);
    if (opt.inner) opt.inner(x);
    x.restore();
    stroke(x, path, 0.9, css(dark(base, 0.55), 0.55));
  }
  // Schatten eines Pfades auf das, was darunter liegt (Pfad in mm)
  function castShadow(x, path, blur, a, dx, dy) {
    x.save();
    x.shadowColor = `rgba(0,0,0,${a})`; x.shadowBlur = blur * PPM; x.shadowOffsetX = dx * PPM; x.shadowOffsetY = dy * PPM;
    x.fillStyle = '#000'; x.fill(path);
    x.restore();
  }
  // Nähte: durchgehende Linie und gesteppte (Doppelnaht)
  const seam = (x, p, o, a = 0.3) => { stroke(x, p, 0.7, css(dark(o.rgb, 0.6), a)); };
  function topstitch(x, p, o, gap = 2.2) {
    const L = lum(o.rgb);
    stroke(x, p, 0.55, css(L > 0.5 ? dark(o.rgb, 0.45) : light(o.rgb, 0.4), 0.55), [2.4, 1.6]);
  }
  // Falten: dunkler Streifen mit hellem Rand
  function fold(x, pts, w, a, o) {
    const p = line(pts);
    soft(x, p, w, [0, 0, 0], a * (lum(o.rgb) > 0.8 ? 0.8 : 1), 6);
    x.save(); x.translate(w * 0.55, -w * 0.15); soft(x, p, w * 0.7, [255, 255, 255], a * (lum(o.rgb) > 0.5 ? 0.9 : 1.1), 5); x.restore();
  }
  function foldC(x, a, c1, c2, b, w, al, o) {
    const p = curve(a, c1, c2, b);
    soft(x, p, w, [0, 0, 0], al * (lum(o.rgb) > 0.8 ? 0.8 : 1), 6);
    x.save(); x.translate(w * 0.5, -w * 0.12); soft(x, p, w * 0.7, [255, 255, 255], al * (lum(o.rgb) > 0.5 ? 0.9 : 1.1), 5); x.restore();
  }
  // Rippen (Bündchen): senkrechte feine Linien innerhalb eines Pfades
  function ribs(x, path, o, x0, x1, y0, y1, step = 2.6, vertical = true) {
    x.save(); x.clip(path);
    for (let v = (vertical ? x0 : y0); v < (vertical ? x1 : y1); v += step) {
      const a = line(vertical ? [[v, y0], [v, y1]] : [[x0, v], [x1, v]]);
      stroke(x, a, step * 0.38, css([0, 0, 0], lum(o.rgb) > 0.6 ? 0.13 : 0.2));
      stroke(x, line(vertical ? [[v + step * 0.5, y0], [v + step * 0.5, y1]] : [[x0, v + step * 0.5], [x1, v + step * 0.5]]), step * 0.3, css([255, 255, 255], lum(o.rgb) > 0.5 ? 0.12 : 0.07));
    }
    x.restore();
  }

  /* ---------------- Größen (Breite- und Längenfaktor gegenüber L) ---------------- */
  const SIZES = { S: [0.91, 0.95], M: [0.955, 0.975], L: [1, 1], XL: [1.05, 1.025], XXL: [1.1, 1.05] };

  /* ================= Hemd-Familie (T-Shirt, Polo, Sweatshirt, Hoodie) ================= */
  // Maße für Größe L in mm. Ursprung: Mitte, höchster Punkt der Schulter am Hals (Halsansatz).
  // S = Schulterspitze, U = Achsel, P1/P2 = äußere/innere Ecke des Ärmelsaums
  const SHIRT = {
    tshirt: { name: 'T-Shirt', tex: 'jersey', half: 280, hemHalf: 274, len: 745, shoulder: 262, drop: 46, neck: 96, front: 95, back: 22, armpit: 268, collar: 24,
      sleeve: { P1: [470, 172], P2: [374, 336] }, hem: 'stitch', hemH: 26, cuff: 'stitch' },
    polo: { name: 'Polo', tex: 'pique', half: 282, hemHalf: 278, len: 760, shoulder: 262, drop: 48, neck: 100, front: 72, back: 24, armpit: 270, collar: 0, polo: true,
      sleeve: { P1: [468, 184], P2: [372, 350] }, hem: 'stitch', hemH: 24, cuff: 'band', cuffH: 34 },
    sweat: { name: 'Sweatshirt', tex: 'fleece', half: 292, hemHalf: 270, len: 745, shoulder: 262, drop: 50, neck: 98, front: 100, back: 24, armpit: 268, collar: 34,
      sleeve: { P1: [478, 650], P2: [384, 688] }, hem: 'band', hemH: 62, cuff: 'band', cuffH: 70, long: true },
    hoodie: { name: 'Hoodie', tex: 'fleece', half: 296, hemHalf: 274, len: 755, shoulder: 262, drop: 52, neck: 108, front: 60, back: 20, armpit: 268, collar: 0, hood: true, pocket: true,
      sleeve: { P1: [484, 660], P2: [390, 698] }, hem: 'band', hemH: 64, cuff: 'band', cuffH: 72, long: true },
  };
  const bow = (a, b, k) => { const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [mx + dy / l * k, my - dx / l * k]; };

  function drawShirt(x, kind, view, o) {
    const s = SHIRT[kind];
    const back = view === 'back';
    const sl = s.sleeve;
    const half = s.half, hh = s.hemHalf, len = s.len, n = s.neck, nb = s.back;
    const S = [s.shoulder, s.drop], U = [half, s.armpit];
    // Körper (rechte Hälfte, oben die hintere Halslinie)
    const bodyR = [
      ['M', 0, nb], ['C', n * 0.5, nb, n, nb * 0.6, n, 0],
      ['Q', (n + S[0]) / 2 + 6, 8, S[0], S[1]],
      ['Q', S[0] - 22, S[1] + 112, U[0], U[1]],
      ['Q', U[0] + 2, (U[1] + len) / 2, hh, len - 6], ['Q', hh - 4, len + 2, hh - 14, len + 2], ['Q', hh / 2, len + 10, 0, len + 8],
    ];
    const bodyPath = mk(bodyR, true);
    // Ärmel rechts
    const c1 = bow(S, sl.P1, long(s) ? 5 : 9), c2 = bow(sl.P2, U, long(s) ? -4 : -6);
    const sleeveSegs = [['M', S[0], S[1]], ['Q', c1[0], c1[1], sl.P1[0], sl.P1[1]], ['L', sl.P2[0], sl.P2[1]], ['Q', c2[0], c2[1], U[0], U[1]], ['Q', S[0] - 22, S[1] + 112, S[0], S[1]], ['Z']];
    const sleeveR = mk(sleeveSegs, false);
    const sleeveBoth = new Path2D(); sleeveBoth.addPath(sleeveR); sleeveBoth.addPath(sleeveR, new DOMMatrix([-1, 0, 0, 1, 0, 0]));

    const sil = new Path2D(); sil.addPath(bodyPath); sil.addPath(sleeveBoth);
    castShadow(x, sil, 14, 0.3, 0, 5);

    // Körper
    piece(x, bodyPath, o, {
      edgeW: 18, edgeA: 0.15,
      inner: (c) => {
        const sideShade = (sx) => { const g2 = c.createLinearGradient(sx * (half - 80), 0, sx * (half + 6), 0); g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(1, css([0, 0, 0], 0.14)); c.fillStyle = g2; c.fillRect(Math.min(sx * (half - 80), sx * (half + 6)), 0, 86, len + 20); };
        sideShade(1); sideShade(-1);
        const k = s.long ? 1 : 0.9;
        foldC(c, [-30, 330], [-16, 410], [-30, 520], [-12, 690], 7, 0.05 * k, o);
        foldC(c, [135, 290], [152, 380], [124, 520], [142, 700], 9, 0.06 * k, o);
        foldC(c, [-148, 300], [-164, 420], [-138, 560], [-150, 700], 9, 0.05 * k, o);
        // Achselfalten
        foldC(c, [half - 8, s.armpit + 4], [half - 60, s.armpit + 20], [half - 96, s.armpit + 78], [half - 122, s.armpit + 150], 6, 0.07, o);
        foldC(c, [-(half - 8), s.armpit + 4], [-(half - 60), s.armpit + 20], [-(half - 96), s.armpit + 78], [-(half - 122), s.armpit + 150], 6, 0.07, o);
      },
    });
    // Schulternaht
    topstitch(x, curve([n + 6, 8], [(n + S[0]) / 2, 18], [S[0] - 40, 30], [S[0] - 10, 50]), o);
    topstitch(x, curve([-n - 6, 8], [-(n + S[0]) / 2, 18], [-S[0] + 40, 30], [-S[0] + 10, 50]), o);

    // Saum unten
    const hemY = len - s.hemH;
    if (s.hem === 'stitch') {
      const hp = curve([-hh + 6, hemY], [-hh / 2, hemY + 5], [hh / 2, hemY + 5], [hh - 6, hemY]);
      topstitch(x, hp, o); soft(x, hp, 3, [0, 0, 0], 0.08, 3);
    } else {
      const band = new Path2D(); band.moveTo(-hh + 3, hemY); band.quadraticCurveTo(0, hemY + 9, hh - 3, hemY); band.lineTo(hh - 12, len + 2); band.quadraticCurveTo(0, len + 10, -hh + 12, len + 2); band.closePath();
      piece(x, band, o, { tex: 'rib', texAlpha: 0.5, edgeW: 10, edgeA: 0.14 });
      ribs(x, band, o, -hh, hh, hemY, len + 10, 3.2, true);
      soft(x, curve([-hh + 3, hemY], [-hh / 2, hemY + 9], [hh / 2, hemY + 9], [hh - 3, hemY]), 5, [0, 0, 0], 0.2, 4);
    }

    // Ärmel (rechts, links gespiegelt)
    const sleeveOne = (sx) => {
      x.save(); if (sx < 0) x.scale(-1, 1);
      castShadow(x, sleeveR, 9, 0.4, -2, 4);
      const bbS = { x0: S[0] - 30, y0: S[1] - 10, x1: sl.P1[0] + 20, y1: sl.P2[1] + 20 };
      piece(x, sleeveR, o, {
        bb: bbS, edgeW: 16, edgeA: 0.13,
        inner: (c) => {
          const mid = [(sl.P1[0] + sl.P2[0]) / 2, (sl.P1[1] + sl.P2[1]) / 2];
          const dx = mid[0] - S[0], dy = mid[1] - S[1];
          foldC(c, [S[0] + dx * 0.18, S[1] + dy * 0.18 + 22], [S[0] + dx * 0.4, S[1] + dy * 0.4 + 10], [S[0] + dx * 0.65, S[1] + dy * 0.65 + 14], [S[0] + dx * 0.9, S[1] + dy * 0.9 + 4], 8, 0.08, o);
          foldC(c, [S[0] + dx * 0.1 - 10, S[1] + dy * 0.1 + 70], [S[0] + dx * 0.4 - 20, S[1] + dy * 0.4 + 52], [S[0] + dx * 0.6 - 24, S[1] + dy * 0.6 + 40], [S[0] + dx * 0.85 - 20, S[1] + dy * 0.85 + 30], 6, 0.06, o);
        },
      });
      // Armlochnaht
      seam(x, curve(S, [S[0] - 22 + 4, S[1] + 60], [S[0] - 20, S[1] + 160], U), o, 0.45);
      // Ärmelabschluss
      const dx = sl.P2[0] - sl.P1[0], dy = sl.P2[1] - sl.P1[1], ln = Math.hypot(dx, dy);
      const ux = dx / ln, uy = dy / ln;
      const mid = [(sl.P1[0] + sl.P2[0]) / 2, (sl.P1[1] + sl.P2[1]) / 2];
      let ix = uy, iy = -ux; if (ix * (S[0] - mid[0]) + iy * (S[1] + 20 - mid[1]) < 0) { ix = -ix; iy = -iy; }
      const cuffH = s.cuff === 'band' ? s.cuffH : 24;
      const A = [sl.P1[0] + ix * cuffH, sl.P1[1] + iy * cuffH], B = [sl.P2[0] + ix * cuffH, sl.P2[1] + iy * cuffH];
      if (s.cuff === 'band') {
        const bandP = new Path2D(); bandP.moveTo(sl.P1[0], sl.P1[1]); bandP.lineTo(sl.P2[0], sl.P2[1]); bandP.lineTo(B[0], B[1]); bandP.lineTo(A[0], A[1]); bandP.closePath();
        piece(x, bandP, o, { tex: 'rib', texAlpha: 0.5, edgeW: 9, edgeA: 0.14, bb: { x0: Math.min(A[0], B[0], sl.P1[0], sl.P2[0]), y0: Math.min(A[1], B[1], sl.P1[1], sl.P2[1]), x1: Math.max(A[0], B[0], sl.P1[0], sl.P2[0]), y1: Math.max(A[1], B[1], sl.P1[1], sl.P2[1]) } });
        x.save(); x.clip(bandP);
        for (let t = 0; t < ln; t += 3.1) {
          const px = sl.P1[0] + ux * t, py = sl.P1[1] + uy * t;
          stroke(x, line([[px, py], [px + ix * cuffH, py + iy * cuffH]]), 1.1, css([0, 0, 0], lum(o.rgb) > 0.6 ? 0.12 : 0.2));
        }
        x.restore();
        seam(x, line([A, B]), o, 0.5);
      } else topstitch(x, line([A, B]), o);
      x.restore();
    };
    sleeveOne(1); sleeveOne(-1);

    drawNeck(x, kind, view, o, s);
    if (kind === 'hoodie' && !back) drawPocket(x, o, s);
  }
  const long = (s) => !!s.long;

  /* Halsausschnitt, Kragen, Kapuze, Knopfleiste */
  function drawNeck(x, kind, view, o, s) {
    const back = view === 'back';
    const inner = dark(o.rgb, lum(o.rgb) > 0.6 ? 0.2 : 0.35);
    if (kind === 'hoodie') return drawHood(x, view, o, s);
    if (kind === 'polo') return drawPolo(x, view, o, s);
    const n = s.neck, f = s.front, b = s.back, cw = s.collar;
    if (!back) {
      // Innenseite des Rückenteils, sichtbar zwischen hinterer und vorderer Halslinie
      const hole = new Path2D(); hole.moveTo(-n, 0); hole.bezierCurveTo(-n, b * 0.6, -n * 0.5, b, 0, b); hole.bezierCurveTo(n * 0.5, b, n, b * 0.6, n, 0);
      hole.bezierCurveTo(n, f * 0.55, n * 0.52, f, 0, f); hole.bezierCurveTo(-n * 0.52, f, -n, f * 0.55, -n, 0); hole.closePath();
      piece(x, hole, o, { base: inner, edgeW: 16, edgeA: 0.3, texAlpha: 0.3 });
      x.save(); x.fillStyle = css(lum(o.rgb) > 0.6 ? [238, 238, 238] : [218, 218, 218], 0.95); x.fillRect(-14, b + 2, 28, 18); x.strokeStyle = 'rgba(0,0,0,.25)'; x.lineWidth = 0.5; x.strokeRect(-14, b + 2, 28, 18);
      x.fillStyle = 'rgba(0,0,0,.25)'; for (let k = 0; k < 3; k++) x.fillRect(-9, b + 7 + k * 4, 18, 1); x.restore();
    }
    // Kragenbündchen
    const cp = new Path2D();
    if (back) {
      cp.moveTo(-n, 0); cp.bezierCurveTo(-n, nbz(b, 0.6), -n * 0.5, b, 0, b); cp.bezierCurveTo(n * 0.5, b, n, nbz(b, 0.6), n, 0);
      cp.lineTo(n + cw * 0.9, -2); cp.bezierCurveTo(n + cw * 0.8, b + cw * 0.4, n * 0.5 + cw * 0.3, b + cw * 1.05, 0, b + cw * 1.05); cp.bezierCurveTo(-n * 0.5 - cw * 0.3, b + cw * 1.05, -n - cw * 0.8, b + cw * 0.4, -n - cw * 0.9, -2);
    } else {
      cp.moveTo(-n, 0); cp.bezierCurveTo(-n, f * 0.55, -n * 0.52, f, 0, f); cp.bezierCurveTo(n * 0.52, f, n, f * 0.55, n, 0);
      cp.lineTo(n + cw * 0.9, -2); cp.bezierCurveTo(n + cw * 0.75, f * 0.62 + 6, n * 0.6 + 14, f + cw, 0, f + cw); cp.bezierCurveTo(-n * 0.6 - 14, f + cw, -n - cw * 0.75, f * 0.62 + 6, -n - cw * 0.9, -2);
    }
    cp.closePath();
    castShadow(x, cp, 5, 0.3, 0, 2);
    piece(x, cp, o, { tex: 'rib', texAlpha: 0.5, edgeW: 7, edgeA: 0.12, bb: { x0: -n - cw, y0: -4, x1: n + cw, y1: (back ? b : f) + cw + 4 } });
    // Rippen entlang des Ausschnitts
    x.save(); x.clip(cp);
    for (let k = 0; k < 9; k++) {
      const t = 1 + (k - 2) * (cw / n) * 0.18, col = css([0, 0, 0], lum(o.rgb) > 0.6 ? 0.07 : 0.13);
      if (back) stroke(x, curve([-n * t, 0], [-n * t, b * 0.6 * t], [-n * 0.5 * t, b * t], [0, b * t]), 0.5, col), stroke(x, curve([0, b * t], [n * 0.5 * t, b * t], [n * t, b * 0.6 * t], [n * t, 0]), 0.5, col);
      else stroke(x, curve([-n * t, 0], [-n * t, f * 0.55 * t], [-n * 0.52 * t, f * t], [0, f * t]), 0.5, col), stroke(x, curve([0, f * t], [n * 0.52 * t, f * t], [n * t, f * 0.55 * t], [n * t, 0]), 0.5, col);
    }
    x.restore();
    if (!back) { topstitch(x, curve([-n - cw * 0.45, 6], [-n - cw * 0.4, f * 0.6 + 6], [-n * 0.55 - 8, f + cw * 0.55], [0, f + cw * 0.6]), o); topstitch(x, curve([0, f + cw * 0.6], [n * 0.55 + 8, f + cw * 0.55], [n + cw * 0.4, f * 0.6 + 6], [n + cw * 0.45, 6]), o); }
    else { topstitch(x, curve([-n - cw * 0.45, 4], [-n * 0.5, b + cw * 0.6], [n * 0.5, b + cw * 0.6], [n + cw * 0.45, 4]), o); }
  }
  const nbz = (b, k) => b * k;

  function drawPolo(x, view, o, s) {
    const back = view === 'back';
    const n = s.neck, L = lum(o.rgb), nb = s.back;
    if (!back) {
      // Innenseite hinten (dunkel) im Halsausschnitt
      const hole = new Path2D(); hole.moveTo(-n + 4, 0); hole.bezierCurveTo(-n + 4, nb * 0.6, -n * 0.5, nb, 0, nb); hole.bezierCurveTo(n * 0.5, nb, n - 4, nb * 0.6, n - 4, 0); hole.lineTo(n - 14, 58); hole.lineTo(-n + 14, 58); hole.closePath();
      piece(x, hole, o, { base: dark(o.rgb, L > 0.6 ? 0.22 : 0.4), edgeW: 14, edgeA: 0.3 });
      // Knopfleiste
      const pl = new Path2D(); pl.rect(-17, 40, 34, 150);
      castShadow(x, pl, 4, 0.22, 0, 1.5);
      piece(x, pl, o, { edgeW: 6, edgeA: 0.1, tex: 'pique', bb: { x0: -20, y0: 34, x1: 20, y1: 200 } });
      seam(x, line([[-10, 42], [-10, 188]]), o, 0.3); seam(x, line([[10, 42], [10, 188]]), o, 0.3);
      const bc = L > 0.7 ? [226, 229, 233] : light(o.rgb, 0.5);
      for (const by of [92, 136, 180]) {
        x.save(); const gx = x.createRadialGradient(-1.5, by - 1.5, 0.5, 0, by, 6.2); gx.addColorStop(0, css(light(bc, 0.5))); gx.addColorStop(1, css(dark(bc, 0.35)));
        x.fillStyle = gx; x.beginPath(); x.arc(0, by, 5.6, 0, 7); x.fill(); x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 0.6; x.stroke();
        x.fillStyle = 'rgba(0,0,0,.4)'; [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]].forEach(([a, b]) => { x.beginPath(); x.arc(a, by + b, 0.7, 0, 7); x.fill(); }); x.restore();
      }
    }
    // Kragensteg (hinten, bei der Rückansicht davor)
    const bandp = new Path2D(); bandp.moveTo(-n - 6, -6); bandp.bezierCurveTo(-n * 0.6, -16, n * 0.6, -16, n + 6, -6); bandp.lineTo(n + 2, 12); bandp.bezierCurveTo(n * 0.5, nb + 12, -n * 0.5, nb + 12, -n - 2, 12); bandp.closePath();
    castShadow(x, bandp, 4, 0.2, 0, 2);
    piece(x, bandp, o, { tex: 'pique', edgeW: 6, edgeA: 0.12, bb: { x0: -n - 10, y0: -18, x1: n + 10, y1: nb + 14 } });
    // Kragenflügel liegen flach auf Schulter und Brust
    for (const sx of [1, -1]) {
      const c = new Path2D();
      if (!back) { c.moveTo(sx * 4, 30); c.bezierCurveTo(sx * 26, 22, sx * (n - 20), -8, sx * (n + 6), -10); c.bezierCurveTo(sx * (n + 20), 14, sx * (n + 30), 50, sx * (n + 34), 88); c.bezierCurveTo(sx * 72, 80, sx * 30, 66, sx * 4, 54); c.closePath(); }
      else { c.moveTo(0, nb + 4); c.bezierCurveTo(sx * 30, nb + 2, sx * (n - 16), 0, sx * (n + 2), -8); c.bezierCurveTo(sx * (n + 22), 10, sx * (n + 36), 24, sx * (n + 42), 40); c.bezierCurveTo(sx * 80, 56, sx * 30, nb + 48, 0, nb + 42); c.closePath(); }
      castShadow(x, c, 6, 0.34, sx * 1, 3);
      piece(x, c, o, { tex: 'pique', edgeW: 9, edgeA: 0.14, bb: { x0: -n - 70, y0: -14, x1: n + 70, y1: 90 } });
      if (!back) topstitch(x, curve([sx * 8, 52], [sx * 30, 62], [sx * (n + 4), 74], [sx * (n + 26), 74]), o); else topstitch(x, curve([sx * 6, nb + 36], [sx * 36, nb + 42], [sx * (n + 20), 34], [sx * (n + 34), 24]), o);
    }
  }

  function drawHood(x, view, o, s) {
    const back = view === 'back';
    const n = s.neck, L = lum(o.rgb);
    if (!back) {
      const hoodOut = new Path2D(); hoodOut.moveTo(-n - 34, 36); hoodOut.bezierCurveTo(-n - 66, -80, -56, -150, 0, -150); hoodOut.bezierCurveTo(56, -150, n + 66, -80, n + 34, 36); hoodOut.bezierCurveTo(n + 20, 130, 60, s.front + 40, 0, s.front + 46); hoodOut.bezierCurveTo(-60, s.front + 40, -n - 20, 130, -n - 34, 36); hoodOut.closePath();
      castShadow(x, hoodOut, 10, 0.33, 0, 4);
      piece(x, hoodOut, o, { edgeW: 18, edgeA: 0.18, bb: { x0: -n - 70, y0: -150, x1: n + 70, y1: s.front + 50 } });
      const op = new Path2D(); op.moveTo(-n + 8, 34); op.bezierCurveTo(-n - 14, -70, -44, -118, 0, -118); op.bezierCurveTo(44, -118, n + 14, -70, n - 8, 34); op.bezierCurveTo(n - 16, 100, 48, s.front + 20, 0, s.front + 26); op.bezierCurveTo(-48, s.front + 20, -n + 16, 100, -n + 8, 34); op.closePath();
      piece(x, op, o, { base: dark(o.rgb, L > 0.6 ? 0.3 : 0.5), edgeW: 26, edgeA: 0.4, texAlpha: 0.3, bb: { x0: -n, y0: -120, x1: n, y1: s.front + 30 } });
      topstitch(x, curve([-n - 22, 36], [-n - 52, -80], [-50, -140], [0, -140]), o); topstitch(x, curve([0, -140], [50, -140], [n + 52, -80], [n + 22, 36]), o);
      const cord = css(L > 0.6 ? [245, 245, 245] : [232, 232, 232]);
      for (const sx of [-1, 1]) {
        const cp = curve([sx * 30, s.front + 14], [sx * 36, s.front + 80], [sx * 26, s.front + 160], [sx * 34, s.front + 250]);
        soft(x, cp, 4, [0, 0, 0], 0.3, 3); stroke(x, cp, 3.6, cord); stroke(x, cp, 1.2, 'rgba(0,0,0,.18)', [1.2, 1.6]);
        x.fillStyle = css([172, 177, 182]); x.fillRect(sx * 34 - 2.2, s.front + 246, 4.4, 14); x.strokeStyle = 'rgba(0,0,0,.4)'; x.lineWidth = 0.5; x.strokeRect(sx * 34 - 2.2, s.front + 246, 4.4, 14);
        x.beginPath(); x.arc(sx * 30, s.front + 14, 3.4, 0, 7); x.fillStyle = css([172, 177, 182]); x.fill(); x.stroke();
      }
    } else {
      const h = new Path2D(); h.moveTo(-n - 30, 6); h.bezierCurveTo(-n - 62, -70, -52, -112, 0, -112); h.bezierCurveTo(52, -112, n + 62, -70, n + 30, 6); h.bezierCurveTo(n + 40, 110, 70, 188, 0, 196); h.bezierCurveTo(-70, 188, -n - 40, 110, -n - 30, 6); h.closePath();
      castShadow(x, h, 10, 0.3, 0, 4);
      piece(x, h, o, { edgeW: 18, edgeA: 0.18, bb: { x0: -n - 70, y0: -120, x1: n + 70, y1: 200 } });
      seam(x, curve([0, -112], [6, -40], [-6, 80], [0, 196]), o, 0.35);
      topstitch(x, curve([-n - 22, 6], [-n - 40, -60], [-44, -100], [0, -100]), o); topstitch(x, curve([0, -100], [44, -100], [n + 40, -60], [n + 22, 6]), o);
      foldC(x, [-60, 90], [-30, 120], [30, 130], [60, 90], 6, 0.08, o);
    }
  }

  function drawPocket(x, o, s) {
    const L = lum(o.rgb);
    const p = new Path2D(); p.moveTo(-150, 470); p.lineTo(-118, 330); p.lineTo(118, 330); p.lineTo(150, 470); p.lineTo(160, 590); p.lineTo(-160, 590); p.closePath();
    castShadow(x, p, 7, 0.32, 0, 3);
    piece(x, p, o, { edgeW: 12, edgeA: 0.2, bb: { x0: -170, y0: 320, x1: 170, y1: 600 } });
    topstitch(x, line([[-142, 470], [-112, 340], [112, 340], [142, 470]]), o);
    foldC(x, [-20, 360], [-30, 420], [-10, 480], [-24, 560], 10, 0.06, o);
    // Eingriffsöffnungen
    for (const sx of [-1, 1]) { const op = line([[sx * 118, 332], [sx * 150, 470]]); soft(x, op, 6, [0, 0, 0], 0.25, 4); stroke(x, op, 0.8, css(dark(o.rgb, 0.6), 0.5)); }
  }

  /* ------------ Ärmelansicht (flach, Saum unten) ------------ */
  function drawSleeve(x, kind, o) {
    const s = SHIRT[kind];
    const long = !!s.long;
    const W1 = long ? 190 : 200, W2 = long ? 108 : 190, H = long ? 600 : 240;
    const cuffH = s.cuff === 'band' ? s.cuffH : 26;
    const p = new Path2D(); p.moveTo(-W1, 0); p.quadraticCurveTo(0, -26, W1, 0); p.lineTo(W2, H); p.lineTo(-W2, H); p.closePath();
    castShadow(x, p, 12, 0.3, 0, 5);
    piece(x, p, o, {
      bb: { x0: -W1, y0: -20, x1: W1, y1: H + 4 },
      inner: (c) => {
        foldC(c, [-W1 * 0.45, 10], [-W1 * 0.3, H * 0.4], [-W2 * 0.7, H * 0.7], [-W2 * 0.6, H - cuffH], 12, 0.1, o);
        foldC(c, [W1 * 0.35, 20], [W1 * 0.25, H * 0.35], [W2 * 0.55, H * 0.6], [W2 * 0.5, H - cuffH], 12, 0.09, o);
      },
    });
    seam(x, line([[-W1 * 0.98, 4], [-W2 * 0.98, H]]), o, 0.3); seam(x, line([[W1 * 0.98, 4], [W2 * 0.98, H]]), o, 0.3);
    if (s.cuff === 'band') {
      const b = new Path2D(); b.rect(-W2, H - cuffH, 2 * W2, cuffH);
      piece(x, b, o, { tex: 'rib', texAlpha: 0.5, edgeW: 8, edgeA: 0.16, bb: { x0: -W2, y0: H - cuffH, x1: W2, y1: H } });
      ribs(x, b, o, -W2, W2, H - cuffH, H, 3.1, true);
      seam(x, line([[-W2, H - cuffH], [W2, H - cuffH]]), o, 0.5);
    } else topstitch(x, line([[-W2 + 4, H - cuffH], [W2 - 4, H - cuffH]]), o);
  }

  /* ================= Kappe (Basecap, 6 Segmente) ================= */
  // Maße wie eine echte Kappe: Krone ca. 190 mm breit und flach gewölbt, Schirm leicht nach unten gebogen
  function capBody(x, o, crown, bb, inner) {
    const L = lum(o.rgb);
    castShadow(x, crown, 9, 0.3, 0, 3);
    piece(x, crown, o, {
      tex: 'twill', edgeW: 22, edgeA: 0.3, bb,
      inner: (c) => {
        const gr = c.createRadialGradient(-14, -34, 6, 0, 0, 120); gr.addColorStop(0, css([255, 255, 255], L > 0.5 ? 0.12 : 0.17)); gr.addColorStop(0.6, 'rgba(255,255,255,0)'); gr.addColorStop(1, css([0, 0, 0], 0.22));
        c.fillStyle = gr; c.fillRect(-130, -80, 260, 180);
        inner(c);
      },
    });
  }
  function capSeam(c, o, pts) {
    soft(c, curve(...pts), 3.5, [0, 0, 0], 0.16, 4); stroke(c, curve(...pts), 0.6, css(dark(o.rgb, 0.55), 0.55));
    const off = pts.map((q) => [q[0] + 2.2, q[1]]); topstitch(c, curve(...off), o, 1.8);
  }
  function capButton(x, o, cx, cy, rx) {
    x.save(); const gx = x.createRadialGradient(cx - 2, cy - 2, 1, cx, cy, rx); gx.addColorStop(0, css(light(o.rgb, 0.4))); gx.addColorStop(1, css(dark(o.rgb, 0.45))); x.fillStyle = gx;
    x.beginPath(); x.ellipse(cx, cy, rx, rx * 0.7, 0, 0, 7); x.fill(); x.strokeStyle = 'rgba(0,0,0,.4)'; x.lineWidth = 0.6; x.stroke(); x.restore();
  }
  function eyelet(x, o, ex, ey) {
    x.save(); x.fillStyle = css(dark(o.rgb, 0.45)); x.beginPath(); x.ellipse(ex, ey, 2.4, 2, 0, 0, 7); x.fill(); x.strokeStyle = css(light(o.rgb, 0.35), 0.8); x.lineWidth = 0.7; x.stroke(); x.restore();
  }
  function capBill(x, o, path, bb, sh) {
    castShadow(x, path, 10, 0.34, 0, 5);
    piece(x, path, o, { base: dark(o.rgb, 0.04), tex: 'twill', edgeW: 10, edgeA: 0.28, bb, inner: sh });
  }
  function drawCap(x, view, o) {
    const body = o.rgb, L = lum(body);
    const rimLine = (c, pts) => { soft(x, c, 2.6, [0, 0, 0], 0.26, 3); stroke(x, c, 0.7, css(dark(body, 0.6), 0.55)); };
    if (view === 'front') {
      // Schirm von vorn: flache, nach unten gebogene Fläche, breiter als die Krone
      const bill = new Path2D(); bill.moveTo(-100, 40); bill.bezierCurveTo(-118, 62, -80, 96, 0, 98); bill.bezierCurveTo(80, 96, 118, 62, 100, 40); bill.lineTo(-100, 40); bill.closePath();
      capBill(x, o, bill, { x0: -120, y0: 38, x1: 120, y1: 100 }, (c) => {
        const g = c.createLinearGradient(0, 44, 0, 98); g.addColorStop(0, 'rgba(0,0,0,.34)'); g.addColorStop(0.35, 'rgba(255,255,255,.04)'); g.addColorStop(1, 'rgba(0,0,0,.16)');
        c.fillStyle = g; c.fillRect(-130, 38, 260, 66);
      });
      // Steppnähte parallel zur Schirmkante
      for (const k of [5, 10]) topstitch(x, curve([-92 + k * 0.5, 50 + k * 0.1], [-102 + k * 0.5, 66], [-70, 92 - k], [0, 93 - k]), o, 1.6), topstitch(x, curve([0, 93 - k], [70, 92 - k], [102 - k * 0.5, 66], [92 - k * 0.5, 50 + k * 0.1]), o, 1.6);
      const crown = new Path2D(); crown.moveTo(-95, 44); crown.bezierCurveTo(-102, -6, -64, -52, 0, -54); crown.bezierCurveTo(64, -52, 102, -6, 95, 44); crown.bezierCurveTo(60, 54, -60, 54, -95, 44); crown.closePath();
      capBody(x, o, crown, { x0: -105, y0: -58, x1: 105, y1: 58 }, (c) => {
        capSeam(c, o, [[0, -54], [0, -10], [0, 28], [0, 52]]);
        capSeam(c, o, [[-6, -53], [-46, -34], [-62, 6], [-58, 46]]); capSeam(c, o, [[6, -53], [46, -34], [62, 6], [58, 46]]);
        const fp = new Path2D(); fp.moveTo(0, -54); fp.bezierCurveTo(-30, -48, -58, -20, -58, 46); fp.bezierCurveTo(-30, 53, 30, 53, 58, 46); fp.bezierCurveTo(58, -20, 30, -48, 0, -54); c.fillStyle = css([255, 255, 255], 0.05); c.fill(fp);
      });
      capButton(x, o, 0, -54, 6.5);
      for (const e of [[-76, -2], [76, -2]]) eyelet(x, o, e[0], e[1]);
      rimLine(curve([-95, 44], [-60, 54], [60, 54], [95, 44]));
    } else if (view === 'back') {
      const crown = new Path2D(); crown.moveTo(-95, 48); crown.bezierCurveTo(-102, -2, -64, -52, 0, -54); crown.bezierCurveTo(64, -52, 102, -2, 95, 48); crown.bezierCurveTo(60, 56, -60, 56, -95, 48); crown.closePath();
      capBody(x, o, crown, { x0: -105, y0: -58, x1: 105, y1: 60 }, (c) => {
        capSeam(c, o, [[0, -54], [0, -10], [0, 30], [0, 54]]);
        capSeam(c, o, [[-6, -53], [-46, -34], [-62, 8], [-60, 50]]); capSeam(c, o, [[6, -53], [46, -34], [62, 8], [60, 50]]);
      });
      capButton(x, o, 0, -54, 6.5);
      for (const e of [[-78, 0], [78, 0]]) eyelet(x, o, e[0], e[1]);
      // Verschlussband mit Schnalle
      const st = new Path2D(); st.moveTo(-62, 34); st.bezierCurveTo(-30, 42, 30, 42, 62, 34); st.lineTo(62, 47); st.bezierCurveTo(30, 55, -30, 55, -62, 47); st.closePath();
      castShadow(x, st, 2.5, 0.25, 0, 1.2);
      piece(x, st, o, { base: dark(body, 0.1), tex: 'rib', texAlpha: 0.3, edgeW: 4, edgeA: 0.2, bb: { x0: -64, y0: 30, x1: 64, y1: 58 } });
      x.save(); x.strokeStyle = css(light(body, 0.55), 0.95); x.lineWidth = 2.4; x.strokeRect(-9, 38, 18, 12); x.restore();
      for (let k = 2; k <= 5; k++) for (const sg of [-1, 1]) { x.fillStyle = 'rgba(0,0,0,.35)'; x.beginPath(); x.arc(sg * k * 9, 42 + k * 0.5, 1.2, 0, 7); x.fill(); }
      rimLine(curve([-95, 48], [-60, 56], [60, 56], [95, 48]));
    } else {
      // Seitenansicht: Schirm zeigt nach links (bei „rechts“ gespiegelt)
      x.save(); if (view === 'right') x.scale(-1, 1);
      const bill = new Path2D(); bill.moveTo(-60, 28); bill.lineTo(-84, 34); bill.bezierCurveTo(-124, 35, -168, 46, -202, 68); bill.bezierCurveTo(-207, 74, -203, 80, -195, 79); bill.bezierCurveTo(-156, 68, -112, 58, -84, 54); bill.lineTo(-60, 52); bill.closePath();
      capBill(x, o, bill, { x0: -210, y0: 30, x1: -70, y1: 84 }, (c) => { const g = c.createLinearGradient(0, 34, 0, 80); g.addColorStop(0, 'rgba(255,255,255,.10)'); g.addColorStop(1, 'rgba(0,0,0,.3)'); c.fillStyle = g; c.fillRect(-220, 30, 160, 60); });
      topstitch(x, curve([-84, 40], [-124, 42], [-160, 52], [-192, 68]), o, 1.6);
      const crown = new Path2D(); crown.moveTo(-86, 46); crown.bezierCurveTo(-92, -4, -60, -48, -6, -56); crown.bezierCurveTo(50, -64, 100, -34, 100, 16); crown.bezierCurveTo(100, 34, 98, 44, 94, 50); crown.bezierCurveTo(30, 60, -40, 58, -86, 46); crown.closePath();
      capBody(x, o, crown, { x0: -96, y0: -64, x1: 106, y1: 62 }, (c) => {
        capSeam(c, o, [[-4, -56], [-34, -36], [-60, 0], [-70, 44]]);
        capSeam(c, o, [[-2, -56], [30, -40], [58, -6], [66, 50]]);
        const fp = new Path2D(); fp.moveTo(-4, -56); fp.bezierCurveTo(-34, -36, -60, 0, -70, 44); fp.lineTo(-90, 46); fp.lineTo(-92, -10); fp.closePath(); c.fillStyle = css([255, 255, 255], 0.05); c.fill(fp);
      });
      capButton(x, o, -3, -57, 6.5);
      eyelet(x, o, -10, -26); eyelet(x, o, 4, -30);
      rimLine(curve([-86, 46], [-40, 58], [30, 60], [94, 50]));
      x.restore();
    }
  }

  /* ================= Ansichten, Maße und Platzierungen ================= */
  // bb: Umriss-Rahmen (Größe L), anchors: [Name, x, y] in mm (Größe L), refs: Bezugslinien
  const VIEWS = {
    tshirt: {
      front: { bb: { x0: -470, y0: -40, x1: 470, y1: 760 }, anchors: { brustL: ['Brust links (am Träger)', 95, 190], brustR: ['Brust rechts', -95, 190], mitte: ['Brust Mitte', 0, 215], bauch: ['Bauch Mitte', 0, 420], aermelL: ['Ärmel links (am Träger)', 350, 190] }, collarY: 95 + 24, refs: { center: true } },
      back: { bb: { x0: -470, y0: -40, x1: 470, y1: 760 }, anchors: { nacken: ['Nacken (unter dem Kragen)', 0, 75], rueckenOben: ['Rücken oben Mitte', 0, 170], rueckenMitte: ['Rücken Mitte', 0, 300], rueckenGross: ['Rücken groß', 0, 360] }, collarY: 22 + 24, refs: { center: true } },
      sleeve: { bb: { x0: -230, y0: -50, x1: 230, y1: 270 }, anchors: { mitte: ['Ärmel Mitte', 0, 100], saum: ['Ärmel nahe Saum', 0, 160] }, collarY: 0, refs: { center: true, sleeve: true } },
    },
    polo: {
      front: { bb: { x0: -470, y0: -50, x1: 470, y1: 780 }, anchors: { brustL: ['Brust links (am Träger)', 100, 195], brustR: ['Brust rechts', -100, 195], mitte: ['Brust Mitte (unter Leiste)', 0, 290], aermelL: ['Ärmel links', 350, 200] }, collarY: 78, refs: { center: true } },
      back: { bb: { x0: -470, y0: -50, x1: 470, y1: 780 }, anchors: { nacken: ['Nacken', 0, 90], rueckenOben: ['Rücken oben Mitte', 0, 170], rueckenMitte: ['Rücken Mitte', 0, 300] }, collarY: 36, refs: { center: true } },
      sleeve: { bb: { x0: -230, y0: -50, x1: 230, y1: 270 }, anchors: { mitte: ['Ärmel Mitte', 0, 100], saum: ['Ärmel nahe Saum', 0, 160] }, collarY: 0, refs: { center: true, sleeve: true } },
    },
    sweat: {
      front: { bb: { x0: -420, y0: -40, x1: 420, y1: 780 }, anchors: { brustL: ['Brust links (am Träger)', 95, 190], brustR: ['Brust rechts', -95, 190], mitte: ['Brust Mitte', 0, 230], gross: ['Brust groß', 0, 290] }, collarY: 100 + 34, refs: { center: true } },
      back: { bb: { x0: -420, y0: -40, x1: 420, y1: 780 }, anchors: { nacken: ['Nacken', 0, 80], rueckenOben: ['Rücken oben Mitte', 0, 170], rueckenMitte: ['Rücken Mitte', 0, 300] }, collarY: 24 + 34, refs: { center: true } },
      sleeve: { bb: { x0: -230, y0: -50, x1: 230, y1: 640 }, anchors: { oben: ['Ärmel oben', 0, 110], mitte: ['Ärmel Mitte', 0, 260], unten: ['Ärmel unten', 0, 420] }, collarY: 0, refs: { center: true, sleeve: true } },
    },
    hoodie: {
      front: { bb: { x0: -420, y0: -170, x1: 420, y1: 780 }, anchors: { brustL: ['Brust links (am Träger)', 100, 200], brustR: ['Brust rechts', -100, 200], mitte: ['Brust Mitte', 0, 250] }, collarY: 60 + 46, refs: { center: true } },
      back: { bb: { x0: -420, y0: -170, x1: 420, y1: 780 }, anchors: { unterKapuze: ['Rücken oben (unter der Kapuze)', 0, 250], rueckenMitte: ['Rücken Mitte', 0, 340] }, collarY: 196, refs: { center: true } },
      sleeve: { bb: { x0: -230, y0: -50, x1: 230, y1: 640 }, anchors: { oben: ['Ärmel oben', 0, 110], mitte: ['Ärmel Mitte', 0, 260], unten: ['Ärmel unten', 0, 420] }, collarY: 0, refs: { center: true, sleeve: true } },
    },
    cap: {
      front: { bb: { x0: -125, y0: -62, x1: 125, y1: 102 }, anchors: { mitte: ['Front Mitte', 0, 0], links: ['Front links', 48, 0], rechts: ['Front rechts', -48, 0], hoch: ['Front hoch', 0, -22] }, collarY: 50, refs: { center: true, cap: true } },
      back: { bb: { x0: -110, y0: -62, x1: 110, y1: 62 }, anchors: { mitte: ['Hinten Mitte (über dem Band)', 0, -12], tief: ['Hinten unten', 0, 10] }, collarY: 50, refs: { center: true, cap: true } },
      left: { bb: { x0: -210, y0: -66, x1: 110, y1: 84 }, anchors: { seite: ['Seite links', 40, 0], vorne: ['Seite vorn', -40, 0] }, collarY: 50, refs: { cap: true } },
      right: { bb: { x0: -110, y0: -66, x1: 210, y1: 84 }, anchors: { seite: ['Seite rechts', -40, 0], vorne: ['Seite vorn', 40, 0] }, collarY: 50, refs: { cap: true } },
    },
  };
  const KIND = { tshirt: 'T-Shirt', polo: 'Polo', sweat: 'Sweatshirt', hoodie: 'Hoodie', cap: 'Kappe' };
  const VIEW_NAMES = { front: 'Vorne', back: 'Hinten', sleeve: 'Ärmel', left: 'Seite links', right: 'Seite rechts' };
  const VIEW_LIST = { tshirt: ['front', 'back', 'sleeve'], polo: ['front', 'back', 'sleeve'], sweat: ['front', 'back', 'sleeve'], hoodie: ['front', 'back', 'sleeve'], cap: ['front', 'back', 'left', 'right'] };
  const FABRIC = { tshirt: 'jersey', polo: 'pique', sweat: 'fleece', hoodie: 'fleece', cap: 'twill' };

  const cache = new Map();
  function render(kind, view, opt = {}) {
    const color = (opt.color || '#ffffff').toLowerCase(), size = opt.size && SIZES[opt.size] ? opt.size : 'L';
    const key = [kind, view, color, size].join('|');
    if (cache.has(key)) return cache.get(key);
    const V = (VIEWS[kind] || {})[view];
    if (!V) return null;
    const [fx, fy] = kind === 'cap' ? [1, 1] : SIZES[size];
    const bb = { x0: V.bb.x0 * fx - 20, y0: V.bb.y0 * fy - 20, x1: V.bb.x1 * fx + 20, y1: V.bb.y1 * fy + 30 };
    const cvs = document.createElement('canvas');
    cvs.width = Math.ceil((bb.x1 - bb.x0) * PPM); cvs.height = Math.ceil((bb.y1 - bb.y0) * PPM);
    const x = cvs.getContext('2d');
    x.scale(PPM, PPM); x.translate(-bb.x0, -bb.y0); // Bildkoordinaten = mm, Ursprung = Bezugspunkt der Ansicht
    x.save(); x.scale(fx, fy);
    const o = { rgb: rgb(color), tex: FABRIC[kind], bb: { x0: V.bb.x0, y0: V.bb.y0, x1: V.bb.x1, y1: V.bb.y1 } };
    if (kind === 'cap') drawCap(x, view, o);
    else if (view === 'sleeve') drawSleeve(x, kind, o);
    else drawShirt(x, kind, view, o);
    x.restore();
    const anchors = {};
    for (const [k, a] of Object.entries(V.anchors)) anchors[k] = [a[0], a[1] * fx, a[2] * fy];
    const res = { canvas: cvs, ppm: PPM, ox: -bb.x0 * PPM, oy: -bb.y0 * PPM, anchors, collarY: V.collarY * fy, refs: V.refs, fx, fy, size, bbMM: { x0: V.bb.x0 * fx, y0: V.bb.y0 * fy, x1: V.bb.x1 * fx, y1: V.bb.y1 * fy } };
    if (cache.size > 12) cache.delete(cache.keys().next().value);
    cache.set(key, res);
    return res;
  }

  HW.garments = { KIND, VIEW_NAMES, VIEW_LIST, VIEWS, SIZES, render, PPM };
})(typeof window !== 'undefined' ? window : globalThis);
