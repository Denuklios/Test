/* Vektor-Import: SVG (und Pfade aus PDF/AI über pdf.js) -> Formen -> Stickobjekte.
   Gefüllte Formen werden Flächen (oder Satinsäulen, wenn schmal), Linien werden Lauf- oder Satinlinien. */
(function (g) {
  const HW = (g.HW = g.HW || {});
  const G = HW.geo;

  /* ---------- Matrizen [a b c d e f] ---------- */
  const I = [1, 0, 0, 1, 0, 0];
  const mul = (m, n) => [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
  const ap = (m, x, y) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
  const mscale = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));

  function parseTransform(t) {
    let m = I.slice();
    if (!t) return m;
    const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
    let r;
    while ((r = re.exec(t))) {
      const v = r[2].split(/[\s,]+/).filter(Boolean).map(Number);
      let n = I;
      if (r[1] === 'matrix') n = v.slice(0, 6);
      else if (r[1] === 'translate') n = [1, 0, 0, 1, v[0] || 0, v[1] || 0];
      else if (r[1] === 'scale') n = [v[0], 0, 0, v[1] ?? v[0], 0, 0];
      else if (r[1] === 'rotate') {
        const a = ((v[0] || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
        n = [c, s, -s, c, 0, 0];
        if (v.length >= 3) n = mul(mul([1, 0, 0, 1, v[1], v[2]], n), [1, 0, 0, 1, -v[1], -v[2]]);
      } else if (r[1] === 'skewX') n = [1, 0, Math.tan((v[0] * Math.PI) / 180), 1, 0, 0];
      else if (r[1] === 'skewY') n = [1, Math.tan((v[0] * Math.PI) / 180), 0, 1, 0, 0];
      m = mul(m, n);
    }
    return m;
  }

  /* ---------- Pfad-Daten (d) -> Unterpfade als Polylinien ---------- */
  function flattenCubic(out, p0, p1, p2, p3, tol) {
    const L = G.dist(p0, p1) + G.dist(p1, p2) + G.dist(p2, p3);
    const n = Math.max(2, Math.min(200, Math.ceil(L / tol)));
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      out.push({ x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x, y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y });
    }
  }
  function flattenArc(out, p0, rx, ry, phi, large, sweep, p1, tol) {
    // SVG-Bogen (Endpunkt-Form) -> Mittelpunkt-Form
    if (!rx || !ry) { out.push(p1); return; }
    rx = Math.abs(rx); ry = Math.abs(ry);
    const c = Math.cos(phi), s = Math.sin(phi);
    const dx = (p0.x - p1.x) / 2, dy = (p0.y - p1.y) / 2;
    const x1 = c * dx + s * dy, y1 = -s * dx + c * dy;
    let lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
    if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
    const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1, den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
    let k = Math.sqrt(Math.max(0, num / den));
    if (large === sweep) k = -k;
    const cx1 = (k * rx * y1) / ry, cy1 = (-k * ry * x1) / rx;
    const cx = c * cx1 - s * cy1 + (p0.x + p1.x) / 2, cy = s * cx1 + c * cy1 + (p0.y + p1.y) / 2;
    const ang = (ux, uy, vx, vy) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
    const t1 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
    let dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
    if (!sweep && dt > 0) dt -= 2 * Math.PI;
    if (sweep && dt < 0) dt += 2 * Math.PI;
    const n = Math.max(4, Math.min(200, Math.ceil((Math.abs(dt) * Math.max(rx, ry)) / tol)));
    for (let i = 1; i <= n; i++) {
      const t = t1 + (dt * i) / n;
      const ex = rx * Math.cos(t), ey = ry * Math.sin(t);
      out.push({ x: c * ex - s * ey + cx, y: s * ex + c * ey + cy });
    }
  }

  function parsePath(d, tol = 0.5) {
    const tok = String(d).match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [];
    const subs = [];
    let cur = null, p = { x: 0, y: 0 }, start = p, lastC = null, lastQ = null, cmd = '', i = 0;
    const num = () => parseFloat(tok[i++]);
    const isNum = () => i < tok.length && !/[A-Za-z]/.test(tok[i]);
    while (i < tok.length) {
      if (/[A-Za-z]/.test(tok[i])) cmd = tok[i++];
      const rel = cmd === cmd.toLowerCase();
      const C = cmd.toUpperCase();
      const P = (x, y) => (rel ? { x: p.x + x, y: p.y + y } : { x, y });
      if (C === 'Z') {
        if (cur) { cur.closed = true; if (cur.pts.length && G.dist(cur.pts[cur.pts.length - 1], start) > 1e-9) cur.pts.push({ ...start }); }
        p = start; lastC = lastQ = null; cur = null;
        if (!isNum()) continue;
      }
      if (C === 'M') {
        p = P(num(), num()); start = p;
        cur = { pts: [p], closed: false }; subs.push(cur);
        cmd = rel ? 'l' : 'L'; lastC = lastQ = null;
        continue;
      }
      if (!cur) { cur = { pts: [p], closed: false }; subs.push(cur); }
      if (C === 'L') { p = P(num(), num()); cur.pts.push(p); lastC = lastQ = null; }
      else if (C === 'H') { const x = num(); p = { x: rel ? p.x + x : x, y: p.y }; cur.pts.push(p); lastC = lastQ = null; }
      else if (C === 'V') { const y = num(); p = { x: p.x, y: rel ? p.y + y : y }; cur.pts.push(p); lastC = lastQ = null; }
      else if (C === 'C') { const a = P(num(), num()), b = P(num(), num()), e = P(num(), num()); flattenCubic(cur.pts, p, a, b, e, tol); lastC = b; lastQ = null; p = e; }
      else if (C === 'S') { const a = lastC ? { x: 2 * p.x - lastC.x, y: 2 * p.y - lastC.y } : p; const b = P(num(), num()), e = P(num(), num()); flattenCubic(cur.pts, p, a, b, e, tol); lastC = b; lastQ = null; p = e; }
      else if (C === 'Q' || C === 'T') {
        const q = C === 'Q' ? P(num(), num()) : lastQ ? { x: 2 * p.x - lastQ.x, y: 2 * p.y - lastQ.y } : p;
        const e = P(num(), num());
        flattenCubic(cur.pts, p, { x: p.x + (2 / 3) * (q.x - p.x), y: p.y + (2 / 3) * (q.y - p.y) }, { x: e.x + (2 / 3) * (q.x - e.x), y: e.y + (2 / 3) * (q.y - e.y) }, e, tol);
        lastQ = q; lastC = null; p = e;
      } else if (C === 'A') {
        const rx = num(), ry = num(), rot = (num() * Math.PI) / 180, la = num(), sw = num(), e = P(num(), num());
        flattenArc(cur.pts, p, rx, ry, rot, la ? 1 : 0, sw ? 1 : 0, e, tol); p = e; lastC = lastQ = null;
      } else { i++; }
    }
    return subs.filter((s) => s.pts.length >= 2);
  }

  /* ---------- Farben & Stile ---------- */
  const NAMED = { black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00', orange: '#ffa500', gray: '#808080', grey: '#808080', navy: '#000080', purple: '#800080', maroon: '#800000', silver: '#c0c0c0', lime: '#00ff00', teal: '#008080', aqua: '#00ffff', fuchsia: '#ff00ff', olive: '#808000', gold: '#ffd700', pink: '#ffc0cb', brown: '#a52a2a' };
  function color(v) {
    if (!v) return null;
    v = String(v).trim().toLowerCase();
    if (v === 'none' || v === 'transparent' || v.startsWith('url(')) return v.startsWith('url(') ? '#808080' : null;
    if (NAMED[v]) return NAMED[v];
    let m = v.match(/^#([0-9a-f]{3})$/);
    if (m) return '#' + m[1].split('').map((c) => c + c).join('');
    if (/^#[0-9a-f]{6}$/.test(v)) return v;
    m = v.match(/^rgba?\(([^)]*)\)/);
    if (m) {
      const p = m[1].split(',').map((x) => x.trim());
      const c = p.slice(0, 3).map((x) => (x.endsWith('%') ? Math.round(parseFloat(x) * 2.55) : Math.round(parseFloat(x))));
      return '#' + c.map((x) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0')).join('');
    }
    return '#000000';
  }

  function cssRules(doc) {
    const rules = {};
    doc.querySelectorAll('style').forEach((st) => {
      const txt = st.textContent.replace(/\/\*[\s\S]*?\*\//g, '');
      const re = /([^{}]+)\{([^}]*)\}/g;
      let r;
      while ((r = re.exec(txt))) {
        const decl = {};
        r[2].split(';').forEach((d) => { const k = d.split(':'); if (k.length >= 2) decl[k[0].trim()] = k.slice(1).join(':').trim(); });
        r[1].split(',').map((s) => s.trim()).forEach((sel) => { if (sel.startsWith('.')) rules[sel.slice(1)] = { ...(rules[sel.slice(1)] || {}), ...decl }; });
      }
    });
    return rules;
  }

  function styleOf(el, inh, rules) {
    const st = { ...inh };
    for (const k of ['fill', 'stroke', 'stroke-width', 'display', 'visibility', 'fill-opacity', 'opacity', 'fill-rule']) {
      if (el.getAttribute && el.getAttribute(k) != null) st[k] = el.getAttribute(k);
    }
    const cls = (el.getAttribute && el.getAttribute('class')) || '';
    cls.split(/\s+/).forEach((c) => { if (rules[c]) Object.assign(st, rules[c]); });
    const s = el.getAttribute && el.getAttribute('style');
    if (s) s.split(';').forEach((d) => { const k = d.split(':'); if (k.length >= 2) st[k[0].trim()] = k.slice(1).join(':').trim(); });
    return st;
  }

  const unitMM = (v) => {
    const m = String(v || '').match(/^\s*([-\d.eE+]+)\s*([a-z%]*)/);
    if (!m) return null;
    const n = parseFloat(m[1]);
    return n * ({ '': 25.4 / 96, px: 25.4 / 96, mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6 }[m[2]] ?? 25.4 / 96);
  };

  /**
   * SVG-Text -> {shapes:[{kind:'fill'|'stroke', color, subs:[{pts,closed}], width}], w, h} in mm (y nach unten)
   */
  function parseSVG(text) {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== 'svg') throw new Error('Keine gültige SVG-Datei');
    const rules = cssRules(doc);
    const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
    let wmm = unitMM(svg.getAttribute('width')), hmm = unitMM(svg.getAttribute('height'));
    let base = I.slice();
    if (vb.length === 4 && vb[2] > 0) {
      if (!wmm) wmm = vb[2] * (25.4 / 96);
      if (!hmm) hmm = vb[3] * (25.4 / 96);
      base = [wmm / vb[2], 0, 0, hmm / vb[3], (-vb[0] * wmm) / vb[2], (-vb[1] * hmm) / vb[3]];
    } else base = [25.4 / 96, 0, 0, 25.4 / 96, 0, 0];
    const shapes = [];
    const ids = {};
    doc.querySelectorAll('[id]').forEach((e) => (ids[e.getAttribute('id')] = e));
    const emit = (subs, st, m) => {
      if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return;
      const tsubs = subs.map((s) => ({ closed: s.closed, pts: s.pts.map((q) => ap(m, q.x, q.y)) }));
      const fill = st['fill-opacity'] === '0' ? null : color(st.fill ?? '#000000');
      const stroke = color(st.stroke);
      if (fill) shapes.push({ kind: 'fill', color: fill, subs: tsubs, rule: st['fill-rule'] || 'nonzero' });
      if (stroke) {
        const sw = (parseFloat(st['stroke-width'] ?? '1') || 1) * mscale(m);
        shapes.push({ kind: 'stroke', color: stroke, subs: tsubs, width: sw });
      }
    };
    const walk = (el, m, st, depth) => {
      if (depth > 40) return;
      const tag = (el.localName || el.nodeName || '').toLowerCase();
      if (['defs', 'clippath', 'mask', 'symbol', 'title', 'desc', 'metadata', 'style', 'pattern', 'lineargradient', 'radialgradient', 'filter', 'marker', 'text'].includes(tag)) return;
      const tm = mul(m, parseTransform(el.getAttribute && el.getAttribute('transform')));
      const s2 = styleOf(el, st, rules);
      if (s2.display === 'none') return;
      const n = (a) => parseFloat(el.getAttribute(a) || 0);
      let subs = null;
      if (tag === 'path') subs = parsePath(el.getAttribute('d') || '');
      else if (tag === 'rect') {
        const x = n('x'), y = n('y'), w = n('width'), h = n('height');
        let rx = parseFloat(el.getAttribute('rx') || el.getAttribute('ry') || 0), ry = parseFloat(el.getAttribute('ry') || el.getAttribute('rx') || 0);
        rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
        if (rx > 0 && ry > 0) subs = parsePath(`M${x + rx},${y}H${x + w - rx}A${rx},${ry} 0 0 1 ${x + w},${y + ry}V${y + h - ry}A${rx},${ry} 0 0 1 ${x + w - rx},${y + h}H${x + rx}A${rx},${ry} 0 0 1 ${x},${y + h - ry}V${y + ry}A${rx},${ry} 0 0 1 ${x + rx},${y}Z`);
        else subs = parsePath(`M${x},${y}H${x + w}V${y + h}H${x}Z`);
      } else if (tag === 'circle' || tag === 'ellipse') {
        const cx = n('cx'), cy = n('cy'), rx = tag === 'circle' ? n('r') : n('rx'), ry = tag === 'circle' ? n('r') : n('ry');
        subs = parsePath(`M${cx - rx},${cy}A${rx},${ry} 0 1 0 ${cx + rx},${cy}A${rx},${ry} 0 1 0 ${cx - rx},${cy}Z`);
      } else if (tag === 'line') subs = parsePath(`M${n('x1')},${n('y1')}L${n('x2')},${n('y2')}`);
      else if (tag === 'polyline' || tag === 'polygon') {
        const v = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
        if (v.length >= 4) subs = parsePath('M' + v.join(' ') + (tag === 'polygon' ? 'Z' : ''));
      } else if (tag === 'use') {
        const href = el.getAttribute('href') || el.getAttribute('xlink:href') || el.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
        const ref = href && ids[href.replace('#', '')];
        if (ref) walk(ref, mul(tm, [1, 0, 0, 1, n('x'), n('y')]), s2, depth + 1);
        return;
      }
      if (subs) { emit(subs, s2, tm); return; }
      for (const c of el.children || []) walk(c, tm, s2, depth + 1);
    };
    walk(svg, base, { fill: '#000000' }, 0);
    return { shapes, w: wmm, h: hmm };
  }

  /* ---------- PDF / AI über pdf.js ---------- */
  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Laden fehlgeschlagen: ' + src)); document.head.appendChild(s); });
  }
  async function pdfjs() {
    if (!g.pdfjsLib) {
      await loadScript('js/vendor/pdf.worker.min.js'); // als „Fake-Worker“ – funktioniert auch bei file://
      await loadScript('js/vendor/pdf.min.js');
    }
    g.pdfjsLib.GlobalWorkerOptions.workerSrc = 'js/vendor/pdf.worker.min.js';
    return g.pdfjsLib;
  }

  /** PDF/AI (ArrayBuffer) -> {shapes, w, h, page} – Vektorpfade der ersten Seite */
  async function parsePDF(buf) {
    const lib = await pdfjs();
    const pdf = await lib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
    const page = await pdf.getPage(1);
    const vp = page.getViewport({ scale: 1 });
    const ops = await page.getOperatorList();
    const O = lib.OPS;
    const k = 25.4 / 72;
    let m = [k, 0, 0, -k, 0, vp.height * k];
    // Ansichtsfenster (Seitenursprung) berücksichtigen
    m = mul(m, [1, 0, 0, 1, -vp.viewBox[0], -vp.viewBox[1]]);
    const stack = [];
    let fill = '#000000', stroke = '#000000', lw = 1, path = [];
    const shapes = [];
    const hex = (a) => {
      if (typeof a[0] === 'string') return color(a[0]);
      const v = Array.from(a).slice(0, 3); // pdf.js liefert ein typisiertes Feld (0–255)
      const big = v.some((x) => x > 1);
      return '#' + v.map((x) => Math.max(0, Math.min(255, Math.round(big ? x : x * 255))).toString(16).padStart(2, '0')).join('');
    };
    const finish = (doFill, doStroke) => {
      if (path.length) {
        const subs = path.map((s) => ({ closed: s.closed, pts: s.pts.map((q) => ap(m, q.x, q.y)) }));
        if (doFill) shapes.push({ kind: 'fill', color: fill, subs });
        if (doStroke) shapes.push({ kind: 'stroke', color: stroke, subs, width: lw * mscale(m) });
      }
      path = [];
    };
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i], a = ops.argsArray[i];
      if (fn === O.save) stack.push({ m, fill, stroke, lw });
      else if (fn === O.restore) { const s = stack.pop(); if (s) ({ m, fill, stroke, lw } = s); }
      else if (fn === O.transform) m = mul(m, a);
      else if (fn === O.setLineWidth) lw = a[0];
      else if (fn === O.setFillRGBColor || fn === O.setFillColor) fill = hex(a);
      else if (fn === O.setStrokeRGBColor || fn === O.setStrokeColor) stroke = hex(a);
      else if (fn === O.setFillGray) fill = hex([a[0], a[0], a[0]]);
      else if (fn === O.setStrokeGray) stroke = hex([a[0], a[0], a[0]]);
      else if (fn === O.constructPath) {
        const [opsList, coords] = a;
        let j = 0, cur = null, p = { x: 0, y: 0 }, st = p;
        for (const op of opsList) {
          if (op === O.moveTo) { p = { x: coords[j++], y: coords[j++] }; st = p; cur = { pts: [p], closed: false }; path.push(cur); }
          else if (op === O.lineTo) { p = { x: coords[j++], y: coords[j++] }; (cur || (cur = { pts: [p], closed: false }, path.push(cur), cur)).pts.push(p); }
          else if (op === O.curveTo) { const c1 = { x: coords[j++], y: coords[j++] }, c2 = { x: coords[j++], y: coords[j++] }, e = { x: coords[j++], y: coords[j++] }; flattenCubic(cur.pts, p, c1, c2, e, 0.5); p = e; }
          else if (op === O.curveTo2) { const c2 = { x: coords[j++], y: coords[j++] }, e = { x: coords[j++], y: coords[j++] }; flattenCubic(cur.pts, p, p, c2, e, 0.5); p = e; }
          else if (op === O.curveTo3) { const c1 = { x: coords[j++], y: coords[j++] }, e = { x: coords[j++], y: coords[j++] }; flattenCubic(cur.pts, p, c1, e, e, 0.5); p = e; }
          else if (op === O.closePath) { if (cur) { cur.closed = true; cur.pts.push({ ...st }); } }
          else if (op === O.rectangle) {
            const x = coords[j++], y = coords[j++], w = coords[j++], h = coords[j++];
            path.push({ closed: true, pts: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }, { x, y }] });
          }
        }
      } else if (fn === O.fill || fn === O.eoFill) finish(true, false);
      else if (fn === O.stroke || fn === O.closeStroke) finish(false, true);
      else if (fn === O.fillStroke || fn === O.eoFillStroke || fn === O.closeFillStroke || fn === O.closeEOFillStroke) finish(true, true);
      else if (fn === O.endPath) path = [];
    }
    return { shapes, w: vp.width * k, h: vp.height * k, page };
  }

  /** PDF-Seite als Bild (für Auto-Digitalisieren), Breite in px */
  async function renderPDF(page, px) {
    const vp1 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: px / vp1.width });
    const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: x, viewport: vp }).promise;
    return c.toDataURL('image/png');
  }

  /* ---------- Formen -> Stickobjekte ---------- */
  function area(r) { return Math.abs(G.signedArea(r)); }

  // Ringe einer Form in Außen-Ringe mit ihren Löchern aufteilen (Verschachtelungstiefe)
  function groupRings(rings) {
    const R = rings.filter((r) => r.length >= 3 && area(r) > 0.05).sort((a, b) => area(b) - area(a));
    const depth = R.map(() => 0), parent = R.map(() => -1);
    for (let i = 0; i < R.length; i++)
      for (let j = i - 1; j >= 0; j--) {
        if (G.pointInRings(R[i][0], [R[j]]) && G.pointInRings(G.lerp(R[i][0], R[i][Math.floor(R[i].length / 2)], 0.5), [R[j]])) { parent[i] = j; depth[i] = depth[j] + 1; break; }
      }
    const groups = [];
    R.forEach((r, i) => { if (depth[i] % 2 === 0) groups.push({ outer: r, holes: [], idx: i }); });
    R.forEach((r, i) => { if (depth[i] % 2 === 1) { const gidx = groups.find((gg) => gg.idx === parent[i]); if (gidx) gidx.holes.push(r); } });
    return groups;
  }

  // Polygon (Ringe, mm) auf ein Raster legen (Gerade-Ungerade-Regel)
  function rasterize(rings, res, pad = 2) {
    const bb = G.bbox(rings.flat());
    const x0 = bb.x0 - pad / res, y0 = bb.y0 - pad / res;
    const w = Math.ceil((bb.x1 - bb.x0) * res) + 2 * pad + 1, h = Math.ceil((bb.y1 - bb.y0) * res) + 2 * pad + 1;
    const mask = new Uint8Array(w * h);
    for (let r = 0; r < h; r++) {
      const y = y0 + (r + 0.5) / res, xs = [];
      for (const ring of rings)
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const p = ring[i], q = ring[j];
          if ((p.y > y) !== (q.y > y)) xs.push(p.x + ((y - p.y) * (q.x - p.x)) / (q.y - p.y));
        }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k] - x0) * res - 0.5)), c1 = Math.min(w - 1, Math.floor((xs[k + 1] - x0) * res - 0.5));
        for (let c = c0; c <= c1; c++) mask[r * w + c] = 1;
      }
    }
    return { mask, w, h, x0, y0, res };
  }

  /**
   * Formen -> Objekte für StickStudio.
   * opts: {scale, dx, dy, satinMax, skipWhite, minArea}
   * Rückgabe: [{type, colorKey, points, holes, params}]
   */
  const isWhite = (c) => /^#(f[0-9a-f]){3}$/.test(c);

  function toObjects(shapes, opts) {
    const out = [];
    // Weiße Flächen (Hintergrundfarbe) stanzen die darunterliegenden Formen aus, statt gestickt zu werden
    if (opts.skipWhite && HW.boolean) {
      const kept = [];
      for (const sh of shapes) {
        if (sh.kind === 'fill' && isWhite(sh.color)) {
          const cutRings = sh.subs.filter((x) => x.pts.length >= 3).map((x) => x.pts);
          if (!cutRings.length) continue;
          const cutter = { type: 'fill', points: cutRings[0].map((p) => ({ ...p, c: false })), holes: cutRings.slice(1).map((r) => r.map((p) => ({ ...p, c: false }))) };
          for (let k = 0; k < kept.length; k++) {
            const u = kept[k];
            if (u.kind !== 'fill') continue;
            const rs = u.subs.filter((x) => x.pts.length >= 3).map((x) => x.pts);
            if (!rs.length) continue;
            const obj = { type: 'fill', points: rs[0].map((p) => ({ ...p, c: false })), holes: rs.slice(1).map((r) => r.map((p) => ({ ...p, c: false }))) };
            const res = HW.boolean.subtract(obj, [cutter], 0);
            if (!res) continue;
            u.subs = res.flatMap((r) => [{ closed: true, pts: r.outer }, ...r.holes.map((h) => ({ closed: true, pts: h }))]);
          }
          continue;
        }
        kept.push({ ...sh, subs: sh.subs.map((x) => ({ ...x })) });
      }
      shapes = kept;
    }
    const S = HW.stitch.DEFAULTS;
    const tr = (p) => ({ x: p.x * opts.scale + opts.dx, y: p.y * opts.scale + opts.dy });
    for (const sh of shapes) {
      if (opts.skipWhite && isWhite(sh.color)) continue;
      if (sh.kind === 'fill') {
        const rings = sh.subs.filter((s) => s.pts.length >= 3).map((s) => G.rdp(s.pts.map(tr), 0.03));
        for (const gr of groupRings(rings)) {
          const a = area(gr.outer) - gr.holes.reduce((s, h) => s + area(h), 0);
          if (a < (opts.minArea ?? 0.3)) continue;
          // schmale Formen -> drehende Satinsäulen (wie beim Auto-Digitalisieren)
          let cols = null;
          if (opts.satinMax > 0 && HW.satinauto) {
            const all = [gr.outer, ...gr.holes];
            const rs = rasterize(all, 10);
            try {
              const res = HW.satinauto.shapeToColumns(rs.mask, rs.w, rs.h, 1 / rs.res, { x: rs.x0, y: rs.y0 }, all);
              if (res) {
                const ws = res.widths.slice().sort((p, q) => p - q);
                const p90 = ws[Math.floor(ws.length * 0.9)] || 0;
                let cover = 0;
                for (const col of res.columns) { const L = col.filter((_, i) => i % 2 === 0), R = col.filter((_, i) => i % 2 === 1).reverse(); cover += area(L.concat(R)); }
                if (p90 <= opts.satinMax && cover / a > 0.75) cols = res;
              }
            } catch (e) { cols = null; }
          }
          if (cols) {
            const med = cols.widths.slice().sort((p, q) => p - q)[Math.floor(cols.widths.length / 2)];
            for (const col of HW.satinauto.orderColumns(cols.columns, null))
              out.push({ type: 'colA', colorKey: sh.color, points: col, params: { ...S.satin, underlay: med < 1.4 ? 'none' : med < 3 ? 'center' : 'edge+zigzag' } });
          } else {
            const mark = (r) => r.map((p) => ({ x: p.x, y: p.y, c: false }));
            out.push({ type: 'fill', colorKey: sh.color, points: mark(gr.outer), holes: gr.holes.map(mark), params: { ...S.fill, underlay: a > 40 ? 'edge+tatami' : 'edge' } });
          }
        }
      } else {
        const wmm = sh.width * opts.scale;
        for (const s of sh.subs) {
          const pts = G.rdp(s.pts.map(tr), 0.03).map((p) => ({ x: p.x, y: p.y, c: false }));
          if (pts.length < 2) continue;
          if (wmm >= 0.9) out.push({ type: 'colC', colorKey: sh.color, points: s.closed ? pts.slice(0, -1).concat([pts[0]]) : pts, params: { ...S.satin, width: +wmm.toFixed(2), underlay: wmm < 2 ? 'none' : 'center' } });
          else out.push({ type: 'run', colorKey: sh.color, points: pts, params: { ...S.run, closed: false, style: wmm >= 0.5 ? 'triple' : 'single' } });
        }
      }
    }
    return out;
  }

  function bounds(shapes) {
    const pts = shapes.flatMap((s) => s.subs.flatMap((x) => x.pts));
    return pts.length ? G.bbox(pts) : null;
  }

  HW.vector = { parseSVG, parsePDF, renderPDF, parsePath, parseTransform, toObjects, bounds, rasterize, groupRings };
})(typeof window !== 'undefined' ? window : globalThis);
