/* Importe: SVG, DXF, STL (-> Relief), Bilder (-> Relief oder Umriss nachzeichnen). */
(function (g) {
  const FS = (g.FS = g.FS || {});
  const { geo, M } = FS;

  // ---------------- Höhenbilder (Relief) ----------------
  const decoded = new WeakMap();
  function encodeHM(nx, ny, f32) {
    const u = new Uint16Array(nx * ny);
    for (let i = 0; i < u.length; i++) u[i] = Math.round(Math.max(0, Math.min(1, f32[i])) * 65535);
    const bytes = new Uint8Array(u.buffer);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return { nx, ny, data: typeof btoa === 'function' ? btoa(s) : Buffer.from(bytes).toString('base64') };
  }
  function decode(o) {
    const hm = o.hm;
    if (decoded.has(hm)) return decoded.get(hm);
    let bytes;
    if (typeof atob === 'function') {
      const bin = atob(hm.data);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else bytes = new Uint8Array(Buffer.from(hm.data, 'base64'));
    const u = new Uint16Array(bytes.buffer, bytes.byteOffset, hm.nx * hm.ny);
    const f = new Float32Array(u.length);
    for (let i = 0; i < u.length; i++) f[i] = u[i] / 65535;
    const res = { nx: hm.nx, ny: hm.ny, data: f };
    decoded.set(hm, res);
    return res;
  }
  function blur(nx, ny, f, passes) {
    let a = f, b = new Float32Array(f.length);
    for (let p = 0; p < passes; p++) {
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        let s = 0, c = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const x = i + di, y = j + dj;
          if (x >= 0 && y >= 0 && x < nx && y < ny) { s += a[y * nx + x]; c++; }
        }
        b[j * nx + i] = s / c;
      }
      [a, b] = [b, a];
    }
    return a;
  }

  /** Bildpixel (RGBA) -> Höhen 0..1 (hell = hoch) */
  function heightsFromRGBA(rgba, nx, ny, smooth = 1) {
    const f = new Float32Array(nx * ny);
    for (let i = 0; i < nx * ny; i++) {
      const r = rgba[i * 4], gg = rgba[i * 4 + 1], b = rgba[i * 4 + 2], a = rgba[i * 4 + 3] / 255;
      // durchsichtige Bereiche zählen als weiß (= flach), wie bei Logos mit freigestelltem Hintergrund
      f[i] = ((0.299 * r + 0.587 * gg + 0.114 * b) / 255) * a + (1 - a);
    }
    return smooth > 0 ? blur(nx, ny, f, smooth) : f;
  }

  function makeRelief(name, nx, ny, f32, w, h, depth) {
    return FS.shapes.make('relief', { name, w, h, depth, invert: false, hm: encodeHM(nx, ny, f32) });
  }

  // ---------------- STL ----------------
  function parseSTL(buf) {
    const dv = new DataView(buf);
    const tris = [];
    const isBin = buf.byteLength >= 84 && 84 + dv.getUint32(80, true) * 50 === buf.byteLength;
    if (isBin) {
      const n = dv.getUint32(80, true);
      for (let i = 0; i < n; i++) {
        const o = 84 + i * 50 + 12, t = [];
        for (let k = 0; k < 9; k++) t.push(dv.getFloat32(o + k * 4, true));
        tris.push(t);
      }
    } else {
      const txt = new TextDecoder().decode(new Uint8Array(buf));
      const re = /vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g;
      let m, cur = [];
      while ((m = re.exec(txt))) { cur.push(+m[1], +m[2], +m[3]); if (cur.length === 9) { tris.push(cur); cur = []; } }
    }
    if (!tris.length) throw new Error('Keine Dreiecke in der STL-Datei gefunden');
    return tris;
  }

  /** Dreiecke von oben gesehen in ein Höhenbild rastern. Liefert {nx, ny, f32, w, h, zr} */
  function rasterSTL(tris, maxPx = 700) {
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (const t of tris) for (let k = 0; k < 9; k += 3) {
      x0 = Math.min(x0, t[k]); x1 = Math.max(x1, t[k]);
      y0 = Math.min(y0, t[k + 1]); y1 = Math.max(y1, t[k + 1]);
      z0 = Math.min(z0, t[k + 2]); z1 = Math.max(z1, t[k + 2]);
    }
    const w = x1 - x0 || 1, h = y1 - y0 || 1, zr = z1 - z0 || 1;
    const cs = Math.max(w, h) / maxPx;
    const nx = Math.max(2, Math.round(w / cs) + 1), ny = Math.max(2, Math.round(h / cs) + 1);
    const zb = new Float32Array(nx * ny).fill(-Infinity);
    for (const t of tris) {
      const ax = (t[0] - x0) / cs, ay = (y1 - t[1]) / cs, bx = (t[3] - x0) / cs, by = (y1 - t[4]) / cs, cx = (t[6] - x0) / cs, cy = (y1 - t[7]) / cs;
      const az = t[2], bz = t[5], cz = t[8];
      const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(den) < 1e-12) continue;
      const i0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), i1 = Math.min(nx - 1, Math.ceil(Math.max(ax, bx, cx)));
      const j0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), j1 = Math.min(ny - 1, Math.ceil(Math.max(ay, by, cy)));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const l1 = ((by - cy) * (i - cx) + (cx - bx) * (j - cy)) / den;
        const l2 = ((cy - ay) * (i - cx) + (ax - cx) * (j - cy)) / den;
        const l3 = 1 - l1 - l2;
        if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
        const z = l1 * az + l2 * bz + l3 * cz;
        if (z > zb[j * nx + i]) zb[j * nx + i] = z;
      }
    }
    const f = new Float32Array(nx * ny);
    for (let i = 0; i < f.length; i++) f[i] = zb[i] === -Infinity ? 0 : (zb[i] - z0) / zr;
    return { nx, ny, f32: f, w, h, zr };
  }

  // ---------------- Bild nachzeichnen (Marching Squares) ----------------
  /** bin: Uint8Array nx*ny (1 = Form). Liefert Ringe in Pixelkoordinaten (y nach unten). */
  function traceBinary(bin, nx, ny) {
    const at = (i, j) => (i >= 0 && j >= 0 && i < nx && j < ny ? bin[j * nx + i] : 0);
    const segs = new Map();
    const key = (x, y) => x * 2 + ',' + y * 2;
    const add = (a, b) => { segs.set(key(a[0], a[1]), { a, b }); };
    // Ränder zwischen Pixeln: Pixel (i,j) belegt [i,i+1]x[j,j+1]. Kanten so orientiert, dass Form links liegt (in y-unten-Koordinaten rechts).
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const tl = at(i - 1, j - 1), tr = at(i, j - 1), bl = at(i - 1, j), br = at(i, j);
      const code = (tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0);
      // Mittelpunkte der Kanten um den Gitterpunkt (i,j)
      const N = [i, j - 0.5], E = [i + 0.5, j], S = [i, j + 0.5], W = [i - 0.5, j];
      switch (code) {
        case 1: add(S, W); break; case 2: add(E, S); break; case 3: add(E, W); break;
        case 4: add(N, E); break; case 5: add(N, W); add(S, E); break; case 6: add(N, S); break;
        case 7: add(N, W); break; case 8: add(W, N); break; case 9: add(S, N); break;
        case 10: add(W, S); add(E, N); break; case 11: add(E, N); break; case 12: add(W, E); break;
        case 13: add(S, E); break; case 14: add(W, S); break;
      }
    }
    const rings = [];
    while (segs.size) {
      const [k0, s0] = segs.entries().next().value;
      segs.delete(k0);
      const ring = [s0.a];
      let cur = s0.b;
      for (let guard = 0; guard < 1e7; guard++) {
        const k = key(cur[0], cur[1]);
        const nx2 = segs.get(k);
        if (!nx2) break;
        ring.push(nx2.a);
        segs.delete(k);
        cur = nx2.b;
      }
      if (ring.length > 3) rings.push(ring.map(([x, y]) => ({ x, y })));
    }
    return rings;
  }

  /** RGBA -> Ringe in mm (Breite w mm). threshold 0..255, dunkel = Form (invert umkehren). */
  function traceImage(rgba, nx, ny, wmm, threshold = 128, invert = false, smoothTol = 0.6) {
    const bin = new Uint8Array(nx * ny);
    for (let i = 0; i < nx * ny; i++) {
      const a = rgba[i * 4 + 3] / 255;
      const l = (0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]) * a + 255 * (1 - a);
      bin[i] = (l < threshold) !== invert ? 1 : 0;
    }
    const sc = wmm / nx;
    return traceBinary(bin, nx, ny)
      .map((r) => geo.simplify(r.concat([r[0]]), smoothTol).slice(0, -1))
      .filter((r) => r.length > 2 && Math.abs(geo.signedArea(r)) > 2)
      .map((r) => r.map((p) => ({ x: p.x * sc, y: (ny - p.y) * sc })));
  }

  // ---------------- SVG ----------------
  function parseTransform(t) {
    let m = M.id();
    if (!t) return m;
    const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
    let r;
    while ((r = re.exec(t))) {
      const a = r[2].split(/[\s,]+/).filter(Boolean).map(Number);
      let n;
      switch (r[1]) {
        case 'matrix': n = a; break;
        case 'translate': n = [1, 0, 0, 1, a[0] || 0, a[1] || 0]; break;
        case 'scale': n = [a[0], 0, 0, a.length > 1 ? a[1] : a[0], 0, 0]; break;
        case 'rotate': {
          const ang = ((a[0] || 0) * Math.PI) / 180, c = Math.cos(ang), s = Math.sin(ang);
          n = [c, s, -s, c, 0, 0];
          if (a.length > 2) n = M.mul(M.mul([1, 0, 0, 1, a[1], a[2]], n), [1, 0, 0, 1, -a[1], -a[2]]);
          break;
        }
        case 'skewX': n = [1, 0, Math.tan((a[0] * Math.PI) / 180), 1, 0, 0]; break;
        case 'skewY': n = [1, Math.tan((a[0] * Math.PI) / 180), 0, 1, 0, 0]; break;
      }
      m = M.mul(m, n);
    }
    return m;
  }

  function arcToPts(out, p0, rx, ry, phi, large, sweep, p1) {
    if (rx === 0 || ry === 0) { out.push(p1); return; }
    rx = Math.abs(rx); ry = Math.abs(ry);
    const c = Math.cos(phi), s = Math.sin(phi);
    const dx = (p0.x - p1.x) / 2, dy = (p0.y - p1.y) / 2;
    const x1 = c * dx + s * dy, y1 = -s * dx + c * dy;
    let lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
    if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
    const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
    const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
    let co = Math.sqrt(Math.max(0, num / den));
    if (large === sweep) co = -co;
    const cxp = (co * rx * y1) / ry, cyp = (-co * ry * x1) / rx;
    const cx = c * cxp - s * cyp + (p0.x + p1.x) / 2, cy = s * cxp + c * cyp + (p0.y + p1.y) / 2;
    const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    const t1 = ang(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
    let dt = ang((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
    if (!sweep && dt > 0) dt -= 2 * Math.PI;
    if (sweep && dt < 0) dt += 2 * Math.PI;
    const n = Math.max(4, Math.ceil((Math.abs(dt) * Math.max(rx, ry)) / 0.3));
    for (let i = 1; i <= n; i++) {
      const t = t1 + (dt * i) / n, ex = rx * Math.cos(t), ey = ry * Math.sin(t);
      out.push({ x: cx + c * ex - s * ey, y: cy + s * ex + c * ey });
    }
  }

  function parsePathD(d) {
    const toks = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [];
    const res = [];
    let i = 0, cmd = '', cur = { x: 0, y: 0 }, start = cur, sub = null, lastC = null, lastQ = null;
    const num = () => +toks[i++];
    const flag = () => {
      // Flags können ohne Trenner stehen ("a1 1 0 01 ...")
      const t = toks[i];
      if (t.length > 1 && (t[0] === '0' || t[0] === '1') && !t.includes('.')) { toks[i] = t.slice(1); return +t[0]; }
      i++; return +t;
    };
    const flush = (closed) => { if (sub && sub.length > 1) res.push({ pts: sub, closed }); sub = null; };
    while (i < toks.length) {
      if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
      const rel = cmd === cmd.toLowerCase();
      const C = cmd.toUpperCase();
      const P = (x, y) => (rel ? { x: cur.x + x, y: cur.y + y } : { x, y });
      if (C === 'Z') { if (sub) { flush(true); } cur = start; lastC = lastQ = null; continue; }
      if (i >= toks.length) break;
      switch (C) {
        case 'M': flush(false); cur = P(num(), num()); start = cur; sub = [cur]; cmd = rel ? 'l' : 'L'; break;
        case 'L': cur = P(num(), num()); (sub = sub || [start]).push(cur); break;
        case 'H': { const x = num(); cur = { x: rel ? cur.x + x : x, y: cur.y }; (sub = sub || [start]).push(cur); break; }
        case 'V': { const y = num(); cur = { x: cur.x, y: rel ? cur.y + y : y }; (sub = sub || [start]).push(cur); break; }
        case 'C': { const c1 = P(num(), num()), c2 = P(num(), num()), e = P(num(), num()); sub = sub || [cur]; geo.flattenCubic(sub, cur, c1, c2, e); lastC = c2; cur = e; break; }
        case 'S': { const c1 = lastC ? { x: 2 * cur.x - lastC.x, y: 2 * cur.y - lastC.y } : cur; const c2 = P(num(), num()), e = P(num(), num()); sub = sub || [cur]; geo.flattenCubic(sub, cur, c1, c2, e); lastC = c2; cur = e; break; }
        case 'Q': { const c1 = P(num(), num()), e = P(num(), num()); sub = sub || [cur]; geo.flattenQuad(sub, cur, c1, e); lastQ = c1; cur = e; break; }
        case 'T': { const c1 = lastQ ? { x: 2 * cur.x - lastQ.x, y: 2 * cur.y - lastQ.y } : cur; const e = P(num(), num()); sub = sub || [cur]; geo.flattenQuad(sub, cur, c1, e); lastQ = c1; cur = e; break; }
        case 'A': { const rx = num(), ry = num(), ph = num(), la = flag(), sw = flag(), e = P(num(), num()); sub = sub || [cur]; arcToPts(sub, cur, rx, ry, (ph * Math.PI) / 180, !!la, !!sw, e); cur = e; break; }
        default: i++;
      }
      if (C !== 'C' && C !== 'S') lastC = null;
      if (C !== 'Q' && C !== 'T') lastQ = null;
    }
    flush(false);
    return res;
  }

  const UNIT = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96, '': 25.4 / 96 };
  const len = (v) => { const m = /^([-+\d.eE]+)\s*([a-z%]*)$/.exec(String(v || '').trim()); return m ? +m[1] * (UNIT[m[2]] || UNIT['']) : null; };

  /** SVG-Text -> Linien in mm (Y nach oben). Benötigt DOMParser (Browser). */
  function parseSVG(text) {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== 'svg') throw new Error('Keine gültige SVG-Datei');
    const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
    const W = len(svg.getAttribute('width')), H = len(svg.getAttribute('height'));
    let root = [25.4 / 96, 0, 0, 25.4 / 96, 0, 0];
    if (vb.length === 4 && vb[2] > 0) {
      const sx = W ? W / vb[2] : 25.4 / 96, sy = H ? H / vb[3] : sx;
      root = [sx, 0, 0, sy, -vb[0] * sx, -vb[1] * sy];
    }
    const out = [];
    const walk = (el, m) => {
      for (const ch of el.children) {
        const tag = ch.nodeName.toLowerCase().replace(/^svg:/, '');
        if (['defs', 'clippath', 'mask', 'symbol', 'style', 'title', 'desc', 'metadata', 'pattern', 'marker', 'lineargradient', 'radialgradient'].includes(tag)) continue;
        if ((ch.getAttribute('display') || '') === 'none') continue;
        const mm = M.mul(m, parseTransform(ch.getAttribute('transform')));
        const A = (n) => parseFloat(ch.getAttribute(n)) || 0;
        let parts = [];
        switch (tag) {
          case 'g': case 'a': case 'svg': walk(ch, mm); continue;
          case 'path': parts = parsePathD(ch.getAttribute('d') || ''); break;
          case 'rect': {
            const x = A('x'), y = A('y'), w = A('width'), h = A('height');
            let rx = A('rx') || A('ry'), ry = A('ry') || rx;
            if (w <= 0 || h <= 0) break;
            rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
            if (rx > 0) {
              const pts = [];
              const q = (cx, cy, a0) => pts.push(...geo.ellipsePts(cx, cy, rx, ry, 0.02, a0, Math.PI / 2));
              q(x + w - rx, y + ry, -Math.PI / 2); q(x + w - rx, y + h - ry, 0); q(x + rx, y + h - ry, Math.PI / 2); q(x + rx, y + ry, Math.PI);
              parts = [{ pts, closed: true }];
            } else parts = [{ pts: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }], closed: true }];
            break;
          }
          case 'circle': parts = [{ pts: geo.ellipsePts(A('cx'), A('cy'), A('r'), A('r'), 0.02), closed: true }]; break;
          case 'ellipse': parts = [{ pts: geo.ellipsePts(A('cx'), A('cy'), A('rx'), A('ry'), 0.02), closed: true }]; break;
          case 'line': parts = [{ pts: [{ x: A('x1'), y: A('y1') }, { x: A('x2'), y: A('y2') }], closed: false }]; break;
          case 'polyline': case 'polygon': {
            const n = (ch.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
            const pts = [];
            for (let k = 0; k + 1 < n.length; k += 2) pts.push({ x: n[k], y: n[k + 1] });
            parts = [{ pts, closed: tag === 'polygon' }];
            break;
          }
          default: continue;
        }
        const T = M.mul(root, mm);
        for (const p of parts) {
          const pts = p.pts.map((q) => M.apply(T, q)).map((q) => ({ x: q.x, y: -q.y }));
          if (p.closed && pts.length > 2 && geo.dist(pts[0], pts[pts.length - 1]) < 1e-6) pts.pop();
          if (pts.length > 1) out.push({ pts, closed: p.closed && pts.length > 2 });
        }
      }
    };
    walk(svg, M.id());
    return joinOpen(out, 0.01);
  }

  // ---------------- DXF ----------------
  function parseDXF(text) {
    const lines = text.split(/\r?\n/);
    const pairs = [];
    for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([parseInt(lines[i].trim(), 10), lines[i + 1].trim()]);
    let units = 1;
    const ui = pairs.findIndex((p) => p[0] === 9 && p[1] === '$INSUNITS');
    if (ui >= 0) { const u = +pairs[ui + 1][1]; units = { 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000 }[u] || 1; }
    let i = pairs.findIndex((p, k) => p[0] === 2 && p[1] === 'ENTITIES' && pairs[k - 1] && pairs[k - 1][1] === 'SECTION');
    if (i < 0) i = 0;
    const out = [];
    const ents = [];
    let cur = null;
    for (i++; i < pairs.length; i++) {
      const [c, v] = pairs[i];
      if (c === 0) {
        if (cur) ents.push(cur);
        if (v === 'ENDSEC') { cur = null; break; }
        cur = { type: v, g: [] };
      } else if (cur) cur.g.push([c, v]);
    }
    if (cur) ents.push(cur);
    const get = (e, c, d = 0) => { const p = e.g.find((q) => q[0] === c); return p ? parseFloat(p[1]) : d; };
    const all = (e, c) => e.g.filter((q) => q[0] === c).map((q) => parseFloat(q[1]));
    // Polylinien-Bogen über "bulge" = tan(Winkel/4), positiv = gegen den Uhrzeigersinn
    const bulgeSeg = (pts, a, b, bulge) => {
      const d = geo.dist(a, b);
      if (!bulge || d < 1e-9) { pts.push({ x: b.x, y: b.y }); return; }
      const nx = -(b.y - a.y) / d, ny = (b.x - a.x) / d;
      const off = ((d / 2) * (1 - bulge * bulge)) / (2 * bulge);
      const c = { x: (a.x + b.x) / 2 + nx * off, y: (a.y + b.y) / 2 + ny * off };
      const th = 4 * Math.atan(bulge), R = geo.dist(a, c), a0 = Math.atan2(a.y - c.y, a.x - c.x);
      const n = Math.max(4, Math.ceil((Math.abs(th) * R) / 0.3));
      for (let k = 1; k < n; k++) { const t = a0 + (th * k) / n; pts.push({ x: c.x + R * Math.cos(t), y: c.y + R * Math.sin(t) }); }
      pts.push({ x: b.x, y: b.y });
    };
    for (let k = 0; k < ents.length; k++) {
      const e = ents[k];
      switch (e.type) {
        case 'LINE': out.push({ pts: [{ x: get(e, 10), y: get(e, 20) }, { x: get(e, 11), y: get(e, 21) }], closed: false }); break;
        case 'CIRCLE': out.push({ pts: geo.ellipsePts(get(e, 10), get(e, 20), get(e, 40), get(e, 40), 0.01), closed: true }); break;
        case 'ARC': {
          const a0 = (get(e, 50) * Math.PI) / 180;
          let a1 = (get(e, 51) * Math.PI) / 180;
          if (a1 <= a0) a1 += Math.PI * 2;
          out.push({ pts: geo.ellipsePts(get(e, 10), get(e, 20), get(e, 40), get(e, 40), 0.01, a0, a1 - a0), closed: false });
          break;
        }
        case 'ELLIPSE': {
          const cx = get(e, 10), cy = get(e, 20), mx = get(e, 11), my = get(e, 21), ratio = get(e, 40, 1);
          let t0 = get(e, 41, 0), t1 = get(e, 42, Math.PI * 2);
          if (t1 <= t0) t1 += Math.PI * 2;
          const a = Math.hypot(mx, my), rot = Math.atan2(my, mx), b = a * ratio;
          const n = Math.max(16, Math.ceil(((t1 - t0) * a) / 0.3)), pts = [];
          for (let s = 0; s <= n; s++) {
            const t = t0 + ((t1 - t0) * s) / n, x = a * Math.cos(t), y = b * Math.sin(t);
            pts.push({ x: cx + x * Math.cos(rot) - y * Math.sin(rot), y: cy + x * Math.sin(rot) + y * Math.cos(rot) });
          }
          const full = Math.abs(t1 - t0 - Math.PI * 2) < 1e-6;
          if (full) pts.pop();
          out.push({ pts, closed: full });
          break;
        }
        case 'LWPOLYLINE': {
          const flags = get(e, 70), pts = [];
          const vs = [];
          for (const [c, v] of e.g) {
            if (c === 10) vs.push({ x: +v, y: 0, b: 0 });
            else if (c === 20 && vs.length) vs[vs.length - 1].y = +v;
            else if (c === 42 && vs.length) vs[vs.length - 1].b = +v;
          }
          if (!vs.length) break;
          const closed = !!(flags & 1);
          pts.push({ x: vs[0].x, y: vs[0].y });
          for (let j = 1; j < vs.length + (closed ? 1 : 0); j++) bulgeSeg(pts, vs[j - 1], { x: vs[j % vs.length].x, y: vs[j % vs.length].y }, vs[j - 1].b);
          if (closed) pts.pop();
          out.push({ pts, closed: closed && pts.length > 2 });
          break;
        }
        case 'POLYLINE': {
          const closed = !!(get(e, 70) & 1), vs = [];
          while (ents[k + 1] && ents[k + 1].type === 'VERTEX') { const v = ents[++k]; vs.push({ x: get(v, 10), y: get(v, 20), b: get(v, 42) }); }
          if (ents[k + 1] && ents[k + 1].type === 'SEQEND') k++;
          if (!vs.length) break;
          const pts = [{ x: vs[0].x, y: vs[0].y }];
          for (let j = 1; j < vs.length + (closed ? 1 : 0); j++) bulgeSeg(pts, vs[j - 1], { x: vs[j % vs.length].x, y: vs[j % vs.length].y }, vs[j - 1].b);
          if (closed) pts.pop();
          out.push({ pts, closed: closed && pts.length > 2 });
          break;
        }
        case 'SPLINE': {
          const deg = get(e, 71, 3), knots = all(e, 40), xs = all(e, 10), ys = all(e, 20);
          const cps = xs.map((x, j) => ({ x, y: ys[j] }));
          if (cps.length < 2) {
            const fx = all(e, 11), fy = all(e, 21);
            if (fx.length > 1) out.push({ pts: fx.map((x, j) => ({ x, y: fy[j] })), closed: false });
            break;
          }
          const pts = [];
          const n = Math.max(20, cps.length * 12);
          const t0 = knots[deg], t1 = knots[knots.length - 1 - deg];
          for (let s = 0; s <= n; s++) pts.push(deBoor(deg, cps, knots, t0 + ((t1 - t0) * s) / n));
          const closed = !!(get(e, 70) & 1) || geo.dist(pts[0], pts[pts.length - 1]) < 1e-6;
          if (closed) pts.pop();
          out.push({ pts, closed });
          break;
        }
      }
    }
    for (const l of out) for (const p of l.pts) { p.x *= units; p.y *= units; }
    return joinOpen(out, 0.02);
  }

  function deBoor(p, cps, U, t) {
    let k = p;
    while (k < U.length - p - 2 && t >= U[k + 1]) k++;
    const d = [];
    for (let j = 0; j <= p; j++) { const c = cps[Math.min(cps.length - 1, Math.max(0, j + k - p))]; d.push({ x: c.x, y: c.y }); }
    for (let r = 1; r <= p; r++) for (let j = p; j >= r; j--) {
      const i = j + k - p, den = U[i + p - r + 1] - U[i];
      const a = den ? (t - U[i]) / den : 0;
      d[j] = { x: (1 - a) * d[j - 1].x + a * d[j].x, y: (1 - a) * d[j - 1].y + a * d[j].y };
    }
    return d[p];
  }

  /** Lose Linienstücke an gemeinsamen Endpunkten zusammenfügen; geschlossene Züge erkennen. */
  function joinOpen(list, tol) {
    const res = list.filter((l) => l.closed);
    const open = list.filter((l) => !l.closed && l.pts.length > 1).map((l) => l.pts);
    const key = (p) => Math.round(p.x / tol) + ',' + Math.round(p.y / tol);
    const ends = new Map();
    const reg = (k, v) => { const a = ends.get(k); if (a) a.push(v); else ends.set(k, [v]); };
    open.forEach((pl, i) => { reg(key(pl[0]), [i, 0]); reg(key(pl[pl.length - 1]), [i, 1]); });
    const used = new Uint8Array(open.length);
    const take = (p) => {
      const a = ends.get(key(p));
      if (!a) return null;
      for (const [i, e] of a) if (!used[i]) { used[i] = 1; return e === 0 ? open[i] : open[i].slice().reverse(); }
      return null;
    };
    for (let i = 0; i < open.length; i++) {
      if (used[i]) continue;
      used[i] = 1;
      let chain = open[i].slice();
      for (let nxt; (nxt = take(chain[chain.length - 1])); ) chain = chain.concat(nxt.slice(1));
      for (let prv; (prv = take(chain[0])); ) chain = prvJoin(prv, chain);
      if (chain.length > 3 && geo.dist(chain[0], chain[chain.length - 1]) < tol * 2) res.push({ pts: chain.slice(0, -1), closed: true });
      else res.push({ pts: chain, closed: false });
    }
    return res;
  }
  // prv beginnt am Kettenanfang und läuft von ihm weg -> umdrehen und vorne anfügen
  function prvJoin(prv, chain) { return prv.slice().reverse().concat(chain.slice(1)); }

  FS.relief = { encodeHM, decode, blur, heightsFromRGBA, makeRelief };
  FS.importers = { parseSTL, rasterSTL, traceBinary, traceImage, parseSVG, parsePathD, parseDXF, joinOpen };
})(typeof window !== 'undefined' ? window : globalThis);
