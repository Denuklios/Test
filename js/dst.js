/* Design zusammensetzen (Verbindungen, Vernähen, Fadenschnitt, Farbwechsel) und Tajima DST lesen/schreiben. */
(function (g) {
  const HW = (g.HW = g.HW || {});
  const G = HW.geo;

  /**
   * Baut die Maschinenbefehle für das ganze Design.
   * Rückgabe: [{x, y, cmd: 'stitch'|'jump'|'trim'|'color', color, obj}] in mm.
   */
  function assemble(objects, palette, opts = {}) {
    const trimDist = opts.trimDist ?? 2.0;
    const lock = opts.lock ?? true;
    const out = [];
    let cur = null, curColor = null;
    const tieLen = 0.7;
    const tieIn = (pts, i, objId) => {
      if (!lock) return;
      const p = pts[i];
      let q = null;
      for (let k = i + 1; k < pts.length && !pts[k].j; k++) if (G.dist(p, pts[k]) > 0.3) { q = pts[k]; break; }
      if (!q) return;
      const t = G.lerp(p, q, Math.min(1, tieLen / G.dist(p, q)));
      out.push({ x: t.x, y: t.y, cmd: 'stitch', obj: objId }, { x: p.x, y: p.y, cmd: 'stitch', obj: objId });
      out.push({ x: t.x, y: t.y, cmd: 'stitch', obj: objId }, { x: p.x, y: p.y, cmd: 'stitch', obj: objId });
    };
    const tieOff = (objId) => {
      if (!lock || out.length < 2) return;
      const p = out[out.length - 1];
      let q = null;
      for (let k = out.length - 2; k >= 0 && out[k].cmd === 'stitch'; k--) if (G.dist(p, out[k]) > 0.3) { q = out[k]; break; }
      if (!q) return;
      const t = G.lerp(p, q, Math.min(1, tieLen / G.dist(p, q)));
      out.push({ x: t.x, y: t.y, cmd: 'stitch', obj: objId }, { x: p.x, y: p.y, cmd: 'stitch', obj: objId });
      out.push({ x: t.x, y: t.y, cmd: 'stitch', obj: objId }, { x: p.x, y: p.y, cmd: 'stitch', obj: objId });
    };
    let needTie = true, floatJump = false;
    // Sprung ohne Schnitt höchstens so lang, dass die Maschine ihn nicht als Schnitt deutet
    // (DST: ein Sprungbefehl <= 12,1 mm; ab "trimJumps" Sprüngen in Folge schneidet die Maschine)
    const maxFloat = Math.max(0, ((opts.trimJumps ?? 3) - 1) * 12.1);
    const jumpMax = Math.min(opts.jumpMax || 0, maxFloat);
    const lockJump = lock && (opts.lockJump ?? true);
    for (let oi = 0; oi < objects.length; oi++) {
      const obj = objects[oi];
      if (obj.hidden) continue;
      const pts = obj._st || [];
      if (!pts.length) continue;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const first = i === 0;
        if (first && curColor !== null && (obj.color !== curColor || obj.stopBefore)) {
          tieOff(obj.id);
          out.push({ x: cur.x, y: cur.y, cmd: 'trim', obj: obj.id });
          out.push({ x: cur.x, y: cur.y, cmd: 'color', color: obj.color, obj: obj.id, stop: obj.color === curColor ? obj.stopBefore : undefined });
          needTie = true;
        } else if (cur && (first || p.j)) {
          const d = G.dist(cur, p);
          // Art der Verbindung: pro Objekt vorgegeben (connect) oder automatisch nach Abstand
          const mode = first ? obj.connect || 'auto' : 'auto';
          let kind = 'none', path = null;
          if (d > 0.05) {
            if (mode === 'trim') kind = 'trim';
            else if (mode === 'jump') kind = d <= maxFloat ? 'jump' : 'trim';
            else if (mode === 'stitch') kind = 'stitch';
            else if (d < trimDist) kind = 'stitch';
            else {
              // versteckter Laufweg unter später gestickten Objekten statt Schnitt
              path = first && opts.connect ? opts.connect(cur, p, objects, oi) : null;
              kind = path ? 'travel' : d <= jumpMax ? 'jump' : 'trim';
            }
          }
          if (kind === 'travel') {
            if (needTie) { out.push({ x: cur.x, y: cur.y, cmd: 'jump', obj: obj.id }); needTie = false; }
            for (const q of path) out.push({ x: q.x, y: q.y, cmd: 'stitch', obj: obj.id, travel: true });
            cur = p;
            continue;
          }
          if (kind === 'stitch') {
            // direkte Verbindung als Stich (lange Verbindungen in Stiche bis 3 mm teilen)
            const n = Math.max(1, Math.ceil(d / 3));
            for (let k = 1; k <= n; k++) out.push({ ...G.lerp(cur, p, k / n), cmd: 'stitch', obj: obj.id, travel: n > 1 });
            cur = p;
            continue;
          }
          if (kind === 'jump') {
            // Sprung ohne Fadenschnitt (Faden bleibt liegen und wird später von Hand gekürzt)
            if (!needTie && lockJump) tieOff(obj.id);
            needTie = true;
            floatJump = true;
          } else if (kind === 'trim') {
            if (!needTie) tieOff(obj.id);
            out.push({ x: cur.x, y: cur.y, cmd: 'trim', obj: obj.id });
            needTie = true;
          }
        }
        if (curColor === null) curColor = obj.color;
        curColor = obj.color;
        if (needTie) {
          out.push({ x: p.x, y: p.y, cmd: 'jump', obj: obj.id, float: floatJump || undefined });
          if (!floatJump || lockJump) tieIn(pts, i, obj.id);
          needTie = false;
          floatJump = false;
        } else out.push({ x: p.x, y: p.y, cmd: 'stitch', obj: obj.id });
        cur = p;
      }
    }
    tieOff(null);
    void palette;
    return out;
  }

  function stats(cmds) {
    let st = 0, col = 1, tr = 0, tv = 0, inTv = false, fl = 0;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of cmds) {
      if (c.cmd === 'stitch') {
        st++;
        if (c.travel && !inTv) tv++;
        inTv = !!c.travel;
        if (c.x < x0) x0 = c.x; if (c.x > x1) x1 = c.x;
        if (c.y < y0) y0 = c.y; if (c.y > y1) y1 = c.y;
      } else if (c.cmd === 'color') col++;
      else if (c.cmd === 'jump' && c.float) fl++;
      else if (c.cmd === 'trim') tr++;
    }
    if (!st) { x0 = y0 = x1 = y1 = 0; col = 0; }
    return { stitches: st, colors: col, trims: tr, travels: tv, floats: fl, w: x1 - x0, h: y1 - y0, x0, y0, x1, y1 };
  }

  /* ---------------- DST schreiben ---------------- */
  function encode(dx, dy, kind) {
    // dx, dy in 0,1 mm; DST: Y nach oben positiv
    let x = dx, y = -dy;
    let b0 = 0, b1 = 0, b2 = 0x03;
    if (kind === 'jump') b2 |= 0x80;
    if (kind === 'color') b2 |= 0xc0;
    if (x > 40) { b2 |= 0x04; x -= 81; }
    if (x < -40) { b2 |= 0x08; x += 81; }
    if (x > 13) { b1 |= 0x04; x -= 27; }
    if (x < -13) { b1 |= 0x08; x += 27; }
    if (x > 4) { b0 |= 0x04; x -= 9; }
    if (x < -4) { b0 |= 0x08; x += 9; }
    if (x > 1) { b1 |= 0x01; x -= 3; }
    if (x < -1) { b1 |= 0x02; x += 3; }
    if (x > 0) { b0 |= 0x01; x -= 1; }
    if (x < 0) { b0 |= 0x02; x += 1; }
    if (y > 40) { b2 |= 0x20; y -= 81; }
    if (y < -40) { b2 |= 0x10; y += 81; }
    if (y > 13) { b1 |= 0x20; y -= 27; }
    if (y < -13) { b1 |= 0x10; y += 27; }
    if (y > 4) { b0 |= 0x20; y -= 9; }
    if (y < -4) { b0 |= 0x10; y += 9; }
    if (y > 1) { b1 |= 0x80; y -= 3; }
    if (y < -1) { b1 |= 0x40; y += 3; }
    if (y > 0) { b0 |= 0x80; y -= 1; }
    if (y < 0) { b0 |= 0x40; y += 1; }
    return [b0, b1, b2];
  }

  /**
   * Schreibt DST. Ursprung (0,0) = Designmitte (Nadel steht beim Start in der Rahmenmitte).
   * Fadenschnitt wird wie üblich als 3 kurze Sprünge kodiert (Texi/Tajima: "Sprünge bis Schnitt" = 3).
   */
  function writeDST(cmds, name = 'DESIGN', opts = {}) {
    const trimJumps = opts.trimJumps ?? 3;
    const s = stats(cmds);
    const cx = (s.x0 + s.x1) / 2, cy = (s.y0 + s.y1) / 2;
    const recs = [];
    let px = 0, py = 0; // aktuelle Position in 0,1 mm
    let colors = 0;
    const moveTo = (tx, ty, kind) => {
      let dx = tx - px, dy = ty - py;
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 121));
      let sx = px, sy = py;
      for (let i = 1; i <= n; i++) {
        const nx = Math.round(px + (dx * i) / n), ny = Math.round(py + (dy * i) / n);
        recs.push(encode(nx - sx, ny - sy, kind));
        sx = nx; sy = ny;
      }
      px = sx; py = sy;
    };
    let mx = { minx: 0, maxx: 0, miny: 0, maxy: 0 };
    for (const c of cmds) {
      const tx = Math.round((c.x - cx) * 10), ty = Math.round((c.y - cy) * 10);
      if (c.cmd === 'stitch') {
        if (tx === px && ty === py) continue;
        moveTo(tx, ty, 'stitch');
      } else if (c.cmd === 'jump') moveTo(tx, ty, 'jump');
      else if (c.cmd === 'trim') {
        const seq = [[2, 2], [-4, -4], [2, 2], [0, 0], [0, 0]].slice(0, trimJumps);
        let sum = [0, 0];
        for (const [a, b] of seq) { recs.push(encode(a, b, 'jump')); sum = [sum[0] + a, sum[1] + b]; }
        if (sum[0] || sum[1]) recs.push(encode(-sum[0], -sum[1], 'jump'));
      } else if (c.cmd === 'color') {
        recs.push(encode(0, 0, 'color'));
        colors++;
      }
      mx.minx = Math.min(mx.minx, px); mx.maxx = Math.max(mx.maxx, px);
      mx.miny = Math.min(mx.miny, py); mx.maxy = Math.max(mx.maxy, py);
    }
    recs.push([0, 0, 0xf3]);
    const pad = (v, n) => String(v).padStart(n, ' ');
    const sign = (v) => (v < 0 ? '-' : '+') + pad(Math.abs(v), 5);
    let hdr = '';
    hdr += 'LA:' + String(name).toUpperCase().replace(/[^A-Z0-9 _-]/g, '').slice(0, 16).padEnd(16, ' ') + '\r';
    hdr += 'ST:' + pad(recs.length, 7) + '\r';
    hdr += 'CO:' + pad(colors, 3) + '\r';
    // Ausdehnung (DST: +Y nach oben, daher Y vertauscht)
    hdr += '+X:' + pad(Math.max(0, mx.maxx), 5) + '\r';
    hdr += '-X:' + pad(Math.max(0, -mx.minx), 5) + '\r';
    hdr += '+Y:' + pad(Math.max(0, -mx.miny), 5) + '\r';
    hdr += '-Y:' + pad(Math.max(0, mx.maxy), 5) + '\r';
    hdr += 'AX:' + sign(px) + '\r';
    hdr += 'AY:' + sign(-py) + '\r';
    hdr += 'MX:+    0\r';
    hdr += 'MY:+    0\r';
    hdr += 'PD:******\r';
    const buf = new Uint8Array(512 + recs.length * 3);
    buf.fill(0x20, 0, 512);
    for (let i = 0; i < hdr.length; i++) buf[i] = hdr.charCodeAt(i);
    buf[hdr.length] = 0x1a;
    recs.forEach((r, i) => buf.set(r, 512 + i * 3));
    return buf;
  }

  /* ---------------- DST lesen ---------------- */
  function decode(b0, b1, b2) {
    let x = 0, y = 0;
    if (b0 & 0x01) x += 1; if (b0 & 0x02) x -= 1;
    if (b0 & 0x04) x += 9; if (b0 & 0x08) x -= 9;
    if (b1 & 0x01) x += 3; if (b1 & 0x02) x -= 3;
    if (b1 & 0x04) x += 27; if (b1 & 0x08) x -= 27;
    if (b2 & 0x04) x += 81; if (b2 & 0x08) x -= 81;
    if (b0 & 0x80) y += 1; if (b0 & 0x40) y -= 1;
    if (b0 & 0x20) y += 9; if (b0 & 0x10) y -= 9;
    if (b1 & 0x80) y += 3; if (b1 & 0x40) y -= 3;
    if (b1 & 0x20) y += 27; if (b1 & 0x10) y -= 27;
    if (b2 & 0x20) y += 81; if (b2 & 0x10) y -= 81;
    return { x, y: -y };
  }

  // Liefert Befehle in mm (wie assemble), Sprungfolgen >= 3 werden als Schnitt erkannt
  function readDST(bytes) {
    const out = [];
    let x = 0, y = 0;
    let jumpRun = [];
    const flushJumps = () => {
      if (jumpRun.length >= 3) out.push({ x: jumpRun[0].x0, y: jumpRun[0].y0, cmd: 'trim' });
      if (jumpRun.length) out.push({ x: x / 10, y: y / 10, cmd: 'jump' });
      jumpRun = [];
    };
    for (let i = 512; i + 2 < bytes.length; i += 3) {
      const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
      if (b2 === 0xf3 && b0 === 0 && b1 === 0) break;
      const d = decode(b0, b1, b2);
      if ((b2 & 0xc3) === 0xc3) { flushJumps(); out.push({ x: x / 10, y: y / 10, cmd: 'color' }); continue; }
      const x0 = x / 10, y0 = y / 10;
      x += d.x; y += d.y;
      if (b2 & 0x80) jumpRun.push({ x0, y0 });
      else { flushJumps(); out.push({ x: x / 10, y: y / 10, cmd: 'stitch' }); }
    }
    flushJumps();
    return out;
  }

  HW.dst = { assemble, stats, writeDST, readDST, encode, decode };
})(typeof window !== 'undefined' ? window : globalThis);
