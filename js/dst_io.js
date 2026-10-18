/* Tajima DST lesen und schreiben. In der Online-Version liegt diese Datei nur auf dem Server
   (Stickdateien werden dort erzeugt und gelesen, nicht im Browser). */
(function (g) {
  const HW = (g.HW = g.HW || {});
  HW.dst = HW.dst || {};
  const stats = (c) => HW.dst.stats(c);

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
        // etwas mehr Sprünge als eingestellt schreiben: so schneidet die Maschine auch dann, wenn ihre Schwelle
        // höher liegt als angenommen (zusätzliche Sprünge schaden nicht); gleichbleibend winzige Bewegungen
        const nj = Math.max(trimJumps + 2, 5), seq = [];
        for (let k = 0; k < nj; k++) seq.push(k % 2 ? [-2, -2] : [2, 2]);
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

  Object.assign(HW.dst, { writeDST, readDST, encode, decode });
})(typeof window !== 'undefined' ? window : globalThis);
