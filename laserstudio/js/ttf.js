/* TrueType-Schriften lesen und Text in Umrisse (Polygone in mm) umwandeln.
   Die eingebetteten Schriften kommen aus js/fonts.js (SIL OFL, siehe js/lib/LIZENZEN.txt). */
(function (g) {
  const FS = (g.FS = g.FS || {});
  const cache = {};

  function b64(s) {
    if (typeof atob === 'function') {
      const bin = atob(s), u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return u.buffer;
    }
    const b = Buffer.from(s, 'base64');
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  }

  function parse(buf) {
    const v = new DataView(buf);
    const n = v.getUint16(4);
    const T = {};
    for (let i = 0; i < n; i++) {
      const o = 12 + i * 16;
      const tag = String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
      T[tag] = v.getUint32(o + 8);
    }
    if (!T.glyf) throw new Error('Nur TrueType-Schriften (glyf) werden unterstützt');
    const upm = v.getUint16(T.head + 18);
    const locFmt = v.getInt16(T.head + 50);
    const numGlyphs = v.getUint16(T.maxp + 4);
    const ascent = v.getInt16(T.hhea + 4), descent = v.getInt16(T.hhea + 6);
    const numHM = v.getUint16(T.hhea + 34);
    const loca = [];
    for (let i = 0; i <= numGlyphs; i++) loca.push(locFmt ? v.getUint32(T.loca + i * 4) : v.getUint16(T.loca + i * 2) * 2);
    const adv = (gi) => v.getUint16(T.hmtx + Math.min(gi, numHM - 1) * 4);

    // cmap: Format 4 und 12
    const cmap = new Map();
    const nt = v.getUint16(T.cmap + 2);
    let best = null;
    for (let i = 0; i < nt; i++) {
      const pid = v.getUint16(T.cmap + 4 + i * 8), eid = v.getUint16(T.cmap + 6 + i * 8), off = v.getUint32(T.cmap + 8 + i * 8);
      const fmt = v.getUint16(T.cmap + off);
      if ((pid === 3 && (eid === 1 || eid === 10)) || pid === 0) if (!best || fmt === 12) best = { off: T.cmap + off, fmt };
    }
    if (best && best.fmt === 4) {
      const o = best.off, segX2 = v.getUint16(o + 6);
      const ends = o + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
      for (let s = 0; s < segX2 / 2; s++) {
        const end = v.getUint16(ends + s * 2), start = v.getUint16(starts + s * 2);
        const delta = v.getInt16(deltas + s * 2), ro = v.getUint16(ranges + s * 2);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          let gi;
          if (ro === 0) gi = (c + delta) & 0xffff;
          else {
            gi = v.getUint16(ranges + s * 2 + ro + (c - start) * 2);
            if (gi) gi = (gi + delta) & 0xffff;
          }
          if (gi) cmap.set(c, gi);
        }
      }
    } else if (best && best.fmt === 12) {
      const o = best.off, ng = v.getUint32(o + 12);
      for (let i = 0; i < ng; i++) {
        const s = v.getUint32(o + 16 + i * 12), e = v.getUint32(o + 20 + i * 12), sg = v.getUint32(o + 24 + i * 12);
        for (let c = s; c <= e && c - s < 65536; c++) cmap.set(c, sg + c - s);
      }
    }

    // kern-Tabelle (Format 0)
    const kern = new Map();
    if (T.kern) {
      const nk = v.getUint16(T.kern + 2);
      let o = T.kern + 4;
      for (let t = 0; t < nk; t++) {
        const len = v.getUint16(o + 2), cov = v.getUint16(o + 4);
        if ((cov >> 8) === 0) {
          const np = v.getUint16(o + 6);
          for (let i = 0; i < np; i++) {
            const p = o + 14 + i * 6;
            kern.set(v.getUint16(p) * 65536 + v.getUint16(p + 2), v.getInt16(p + 4));
          }
        }
        o += len;
      }
    }

    // Glyphe -> Konturen [{x,y,on}]
    function glyph(gi, depth = 0) {
      const start = T.glyf + loca[gi], end = T.glyf + loca[gi + 1];
      if (end <= start || depth > 8) return [];
      const nc = v.getInt16(start);
      if (nc >= 0) {
        const endPts = [];
        for (let i = 0; i < nc; i++) endPts.push(v.getUint16(start + 10 + i * 2));
        const np = nc ? endPts[nc - 1] + 1 : 0;
        let p = start + 10 + nc * 2;
        p += 2 + v.getUint16(p);
        const flags = [];
        while (flags.length < np) {
          const f = v.getUint8(p++);
          flags.push(f);
          if (f & 8) { let r = v.getUint8(p++); while (r-- > 0) flags.push(f); }
        }
        const xs = [], ys = [];
        let x = 0;
        for (const f of flags) {
          if (f & 2) { const d = v.getUint8(p++); x += f & 16 ? d : -d; }
          else if (!(f & 16)) { x += v.getInt16(p); p += 2; }
          xs.push(x);
        }
        let y = 0;
        for (const f of flags) {
          if (f & 4) { const d = v.getUint8(p++); y += f & 32 ? d : -d; }
          else if (!(f & 32)) { y += v.getInt16(p); p += 2; }
          ys.push(y);
        }
        const out = [];
        let s = 0;
        for (const e of endPts) {
          const c = [];
          for (let i = s; i <= e; i++) c.push({ x: xs[i], y: ys[i], on: !!(flags[i] & 1) });
          out.push(c);
          s = e + 1;
        }
        return out;
      }
      // zusammengesetzte Glyphe
      let p = start + 10;
      const out = [];
      for (;;) {
        const fl = v.getUint16(p), gidx = v.getUint16(p + 2);
        p += 4;
        let dx, dy;
        if (fl & 1) { dx = v.getInt16(p); dy = v.getInt16(p + 2); p += 4; }
        else { dx = v.getInt8(p); dy = v.getInt8(p + 1); p += 2; }
        let a = 1, b = 0, c = 0, d = 1;
        const f2 = (q) => v.getInt16(q) / 16384;
        if (fl & 8) { a = d = f2(p); p += 2; }
        else if (fl & 64) { a = f2(p); d = f2(p + 2); p += 4; }
        else if (fl & 128) { a = f2(p); b = f2(p + 2); c = f2(p + 4); d = f2(p + 6); p += 8; }
        for (const cont of glyph(gidx, depth + 1)) out.push(cont.map((q) => ({ x: a * q.x + c * q.y + dx, y: b * q.x + d * q.y + dy, on: q.on })));
        if (!(fl & 32)) break;
      }
      return out;
    }

    // Kontur mit quadratischen Kurven -> Polygon
    function toPoly(cont, sc, ox, oy, tol) {
      const n = cont.length;
      if (n < 2) return null;
      const P = (q) => ({ x: ox + q.x * sc, y: oy + q.y * sc });
      let si = cont.findIndex((q) => q.on);
      let startPt;
      if (si < 0) { startPt = { x: (cont[0].x + cont[1].x) / 2, y: (cont[0].y + cont[1].y) / 2, on: true }; si = 0; }
      else startPt = cont[si];
      const out = [P(startPt)];
      let prev = startPt, ctrl = null;
      for (let k = 1; k <= n; k++) {
        const q = cont[(si + k) % n];
        if (q.on) {
          if (ctrl) FS.geo.flattenQuad(out, P(prev), P(ctrl), P(q), tol);
          else out.push(P(q));
          prev = q; ctrl = null;
        } else if (ctrl) {
          const mid = { x: (ctrl.x + q.x) / 2, y: (ctrl.y + q.y) / 2 };
          FS.geo.flattenQuad(out, P(prev), P(ctrl), P(mid), tol);
          prev = mid; ctrl = q;
        } else ctrl = q;
      }
      if (ctrl) FS.geo.flattenQuad(out, P(prev), P(ctrl), P(startPt), tol);
      if (out.length > 1 && FS.geo.dist(out[0], out[out.length - 1]) < 1e-9) out.pop();
      return out.length > 2 ? out : null;
    }

    return { upm, ascent, descent, cmap, kern, adv, glyph, toPoly, gid: (ch) => cmap.get(ch) || 0 };
  }

  function font(name) {
    if (cache[name]) return cache[name];
    const list = (g.HW && g.HW.FONTS) || [];
    const f = list.find((x) => x.name === name) || list[0];
    if (!f) throw new Error('Keine Schrift vorhanden');
    return (cache[name] = parse(b64(f.data)));
  }

  /**
   * Text -> geschlossene Ringe in mm. size = Versalhöhe-ähnliche Schriftgröße (Em-Höhe) in mm.
   * align: left | center | right. Mehrzeilig über \n. Ursprung (0,0) = Grundlinie der ersten Zeile, links.
   */
  function textRings(text, opts = {}) {
    const F = font(opts.font);
    const size = opts.size || 20, sc = size / F.upm, tol = opts.tol || 0.03;
    const spacing = opts.spacing || 0, lineH = (opts.lineHeight || 1.2) * size;
    const lines = String(text || '').split('\n');
    const widths = lines.map((ln) => {
      let w = 0, pg = 0;
      for (const ch of ln) {
        const gi = F.gid(ch.codePointAt(0));
        w += (F.kern.get(pg * 65536 + gi) || 0) * sc + F.adv(gi) * sc + spacing;
        pg = gi;
      }
      return Math.max(0, w - spacing);
    });
    const maxW = Math.max(0, ...widths);
    const rings = [];
    lines.forEach((ln, li) => {
      let x = opts.align === 'center' ? (maxW - widths[li]) / 2 : opts.align === 'right' ? maxW - widths[li] : 0;
      const y = -li * lineH;
      let pg = 0;
      for (const ch of ln) {
        const gi = F.gid(ch.codePointAt(0));
        x += (F.kern.get(pg * 65536 + gi) || 0) * sc;
        for (const c of F.glyph(gi)) {
          const r = F.toPoly(c, sc, x, y, tol);
          if (r) rings.push(r);
        }
        x += F.adv(gi) * sc + spacing;
        pg = gi;
      }
    });
    return rings;
  }

  FS.ttf = { parse, font, textRings, names: () => ((g.HW && g.HW.FONTS) || []).map((f) => f.name) };
})(typeof window !== 'undefined' ? window : globalThis);
