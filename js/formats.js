/* Stickformate PES (Brother), EXP (Melco), JEF (Janome) lesen und schreiben.
 * Formatlogik portiert aus pyembroidery (MIT-Lizenz, © Tatarize/EmbroidePy), siehe js/vendor/PYEMBROIDERY-LICENSE.txt.
 * Intern wie pyembroidery: Einheiten 0,1 mm, Y nach unten, Befehlsliste [x, y, Befehl] mit absoluten Koordinaten. */
(function (g) {
  const HW = (g.HW = g.HW || {});
  const ST = 0, JU = 1, TR = 2, END = 4, CC = 5;

  // Python-round (halbe Werte zur geraden Zahl) und int() (abschneiden)
  const pyRound = (v) => { const r = Math.round(v); return Math.abs(v % 1) === 0.5 && r % 2 ? r - 1 : r; };
  const hexInt = (h) => parseInt(String(h || '#000000').replace('#', '').slice(0, 6), 16) || 0;
  const intHex = (c) => '#' + (c & 0xffffff).toString(16).padStart(6, '0');

  /* ---------------- Garnpaletten ---------------- */
  const PEC = [null, 0x0e1f7c, 0x0a55a3, 0x008777, 0x4b6baf, 0xed171f, 0xd15c00, 0x913697, 0xe49acb, 0x915fac, 0x9ed67d,
    0xe8a900, 0xfeba35, 0xffff00, 0x70bc1f, 0xba9800, 0xa8a8a8, 0x7d6f00, 0xffffb3, 0x4f5556, 0x000000, 0x0b3d91, 0x770176,
    0x293133, 0x2a1301, 0xf64a8a, 0xb27624, 0xfcbbc5, 0xfe370f, 0xf0f0f0, 0x6a1c8a, 0xa8ddc4, 0x2584bb, 0xfeb343, 0xfff36b,
    0xd0a660, 0xd15400, 0x66ba49, 0x134a46, 0x878787, 0xd8ccc6, 0x435607, 0xfdd9de, 0xf993bc, 0x003822, 0xb2afd4, 0x686ab0,
    0xefe3b9, 0xf73866, 0xb54b64, 0x132b1a, 0xc70156, 0xfe9e32, 0xa8deeb, 0x00673e, 0x4e2990, 0x2f7e20, 0xffcccc, 0xffd911,
    0x095ba6, 0xf0f970, 0xe3f35b, 0xff9900, 0xfff08d, 0xffc8c8];
  const JEF = [null, 0x000000, 0xffffff, 0xffff17, 0xff6600, 0x2f5933, 0x237336, 0x65c2c8, 0xab5a96, 0xf669a0, 0xff0000,
    0xb1704e, 0x0b2f84, 0xe4c35d, 0x481a05, 0xac9cc7, 0xfcf294, 0xf999b7, 0xfab381, 0xc9a480, 0x970533, 0xa0b8cc, 0x7fc21c,
    0xe5e5e5, 0x889b9b, 0x98d6bd, 0xb2e1e3, 0x368ba0, 0x4f83ab, 0x386a91, 0x071650, 0xf999a2, 0xf9676b, 0xe3311f, 0xe2a188,
    0xb59474, 0xe4cf99, 0xffcb00, 0xe1add4, 0xc3007e, 0x80004b, 0x540571, 0xb10525, 0xcae0c0, 0x899856, 0x5c941a, 0x003114,
    0x5dae94, 0x4cbf8f, 0x007772, 0x595b61, 0xfffff2, 0xb15818, 0xcb8a07, 0x986c80, 0x98692d, 0x4d3419, 0x4c330b, 0x33200a,
    0x523a97, 0x0d217e, 0x1e77ac, 0xb2dd53, 0xf33689, 0xde649e, 0x984161, 0x4c5612, 0x4c881f, 0xe4de79, 0xcb8a1a, 0xcba21c,
    0xff9805, 0xfcb257, 0xffe505, 0xf0331f, 0x1a842d, 0x386cae, 0xe3c4b4, 0xe3ac81];

  // Farbabstand "red mean" (compuphase.com/cmetric.htm), bei Gleichstand gewinnt der spätere Eintrag
  function nearest(color, values) {
    const r1 = (color >> 16) & 255, g1 = (color >> 8) & 255, b1 = color & 255;
    let best = null, bd = Infinity;
    values.forEach((t, i) => {
      if (t == null) return;
      const r2 = (t >> 16) & 255, g2 = (t >> 8) & 255, b2 = t & 255;
      const rm = pyRound((r1 + r2) / 2), r = r1 - r2, gg = g1 - g2, b = b1 - b2;
      const d = (((512 + rm) * r * r) >> 8) + 4 * gg * gg + (((767 - rm) * b * b) >> 8);
      if (d <= bd) { bd = d; best = i; }
    });
    return best;
  }
  // Jede verschiedene Farbe bekommt einen eigenen PEC-Eintrag (build_unique_palette)
  function uniquePalette(set, threads) {
    set = set.slice();
    const chart = new Array(set.length).fill(null);
    for (const t of [...new Set(threads)]) {
      const i = nearest(t, set);
      if (i == null) break;
      set[i] = null; chart[i] = t;
    }
    return threads.map((t) => nearest(t, chart));
  }

  /* ---------------- Byte-Puffer ---------------- */
  class Buf {
    constructor() { this.a = []; }
    get len() { return this.a.length; }
    u8(v) { this.a.push(v & 255); }
    u16(v) { this.a.push(v & 255, (v >> 8) & 255); }
    u24(v) { this.a.push(v & 255, (v >> 8) & 255, (v >> 16) & 255); }
    u32(v) { this.a.push(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255); }
    f32(v) { const d = new DataView(new ArrayBuffer(4)); d.setFloat32(0, v, true); for (let i = 0; i < 4; i++) this.a.push(d.getUint8(i)); }
    str(s) { for (const ch of s) this.a.push(ch.charCodeAt(0) & 255); }
    bytes(arr) { for (const v of arr) this.a.push(v & 255); }
    put(pos, n, v) { for (let i = 0; i < n; i++) this.a[pos + i] = (v >> (8 * i)) & 255; }
    out() { return Uint8Array.from(this.a); }
  }
  const ascii = (s) => String(s ?? '').replace(/[^\x20-\x7e]/g, '_');

  /* ---------------- Aufbereitung (wie pyembroidery Transcoder) ---------------- */
  // Befehle in mm -> [x, y, Befehl] in 0,1 mm, zentriert auf die Stichmitte; zu lange Sprünge/Stiche werden geteilt.
  function prepare(cmds, palette, opts, maxLen) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, lastSt = -1;
    cmds.forEach((c, i) => {
      if (c.cmd !== 'stitch') return;
      lastSt = i;
      x0 = Math.min(x0, c.x); x1 = Math.max(x1, c.x); y0 = Math.min(y0, c.y); y1 = Math.max(y1, c.y);
    });
    const cx = lastSt < 0 ? 0 : (x0 + x1) / 2, cy = lastSt < 0 ? 0 : (y0 + y1) / 2;
    const col = (i) => hexInt((palette && palette[i] && palette[i].hex) || '#000000');
    let cur = col(opts.firstColor ?? 0);
    const st = [], threads = [];
    let nx = 0, ny = 0, trimmed = true, started = false;
    const add = (x, y, c) => st.push([x, y, c]);
    // Zwischenschritte bis in Reichweite (interpolate_gap_stitches)
    const gap = (x, y, data) => {
      const dx = x - nx, dy = y - ny;
      if (Math.abs(dx) <= maxLen && Math.abs(dy) <= maxLen) return;
      const n = Math.max(Math.ceil(Math.abs(dx / maxLen)), Math.ceil(Math.abs(dy / maxLen)));
      let qx = nx, qy = ny;
      for (let k = 1; k < n; k++) { qx += dx / n; qy += dy / n; add(qx, qy, data); }
      nx = qx; ny = qy;
    };
    for (let i = 0; i < cmds.length; i++) {
      const c = cmds[i];
      const x = pyRound((c.x - cx) * 10), y = pyRound((c.y - cy) * 10);
      if (c.cmd === 'stitch') {
        if (!started) { started = true; threads.push(cur); }
        gap(x, y, JU);
        if (trimmed && (nx !== x || ny !== y)) add(x, y, JU);
        trimmed = false;
        add(x, y, ST); nx = x; ny = y;
      } else if (c.cmd === 'jump') {
        if (x === nx && y === ny) continue;
        gap(x, y, JU); add(x, y, JU); nx = x; ny = y;
      } else if (c.cmd === 'trim') {
        if (!trimmed) { add(nx, ny, TR); trimmed = true; }
      } else if (c.cmd === 'color') {
        if (i > lastSt) continue; // kein Stich mehr danach
        const t = palette && palette[c.color] ? col(c.color) : cur;
        if (!started) cur = t;
        else { add(nx, ny, CC); threads.push(t); }
        trimmed = true;
      }
    }
    add(nx, ny, END);
    return { st, threads };
  }
  function bounds(st) {
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const s of st) { a = Math.min(a, s[0]); b = Math.min(b, s[1]); c = Math.max(c, s[0]); d = Math.max(d, s[1]); }
    return st.length ? [a, b, c, d] : [0, 0, 0, 0];
  }

  /* ---------------- PEC ---------------- */
  // Leeres PEC-Symbol 48x38 mit abgerundetem Rahmen (PecGraphics.blank)
  function blank() {
    const r = [];
    const row = (a, b) => r.push(a, 0, 0, 0, 0, b);
    r.push(0, 0, 0, 0, 0, 0, 0xf0, 0xff, 0xff, 0xff, 0xff, 0x0f);
    row(0x08, 0x10); row(0x04, 0x20);
    for (let i = 0; i < 30; i++) row(0x02, 0x40);
    row(0x04, 0x20); row(0x08, 0x10);
    r.push(0xf0, 0xff, 0xff, 0xff, 0xff, 0x0f, 0, 0, 0, 0, 0, 0);
    return r;
  }
  function drawScaled(ext, pts, gr, stride, buffer = 5) {
    const [l, t, r, b] = ext;
    const gw = stride * 8, gh = gr.length / stride;
    const s = Math.min((gw - buffer) / (r - l || 1), (gh - buffer) / (b - t || 1));
    const tx = (-(r + l) / 2) * s + gw / 2, ty = (-(b + t) / 2) * s + gh / 2;
    for (const p of pts) {
      const x = Math.floor(p[0] * s + tx), y = Math.floor(p[1] * s + ty);
      const i = y * stride + Math.floor(x / 8);
      if (x >= 0 && i >= 0 && i < gr.length) gr[i] |= 1 << (x % 8);
    }
  }
  function pecValue(f, v, long, flag = 0) {
    if (!long && v > -64 && v < 63) f.u8(v & 0x7f);
    else { v = (v & 0x0fff) | 0x8000 | (flag << 8); f.u8(v >> 8); f.u8(v); }
  }
  function pecEncode(st, f) {
    let colorTwo = true, jumping = true, init = true, xx = 0, yy = 0;
    const stitch = (dx, dy) => { pecValue(f, dx); pecValue(f, dy); };
    for (const [x, y, c] of st) {
      const dx = pyRound(x - xx), dy = pyRound(y - yy);
      xx += dx; yy += dy;
      if (c === ST) {
        if (jumping) { if (dx !== 0 && dy !== 0) stitch(0, 0); jumping = false; }
        stitch(dx, dy);
      } else if (c === JU) {
        jumping = true;
        const flag = init ? 0x10 : 0x20; // erster Sprung: Sprung, danach Sprung mit Schnitt
        pecValue(f, dx, true, flag); pecValue(f, dy, true, flag);
      } else if (c === CC) {
        if (jumping) { stitch(0, 0); jumping = false; }
        f.u8(0xfe); f.u8(0xb0); f.u8(colorTwo ? 2 : 1);
        colorTwo = !colorTwo;
      } else if (c === END) { f.u8(0xff); break; }
      init = false;
    }
  }
  function writePEC(P, f, name) {
    const ext = bounds(P.st);
    f.str('LA:' + ascii(name || 'Untitled').slice(0, 8).padEnd(16, ' ') + '\r');
    f.bytes([0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0xff, 0x00]);
    f.u8(6); f.u8(38); // Bytebreite und Höhe des Symbols
    const idx = uniquePalette(PEC, P.threads);
    if (idx.length) {
      f.bytes(new Array(12).fill(0x20));
      if (idx.length > 255) throw new Error('PES: zu viele Farbwechsel');
      f.u8(idx.length - 1); f.bytes(idx);
    } else f.bytes([0x20, 0x20, 0x20, 0x20, 0x64, 0x20, 0x00, 0x20, 0x00, 0x20, 0x20, 0x20, 0xff]);
    for (let i = idx.length; i < 463; i++) f.u8(0x20);
    // Stichblock
    const start = f.len;
    f.u8(0); f.u8(0); f.u24(0);
    f.bytes([0x31, 0xff, 0xf0]);
    f.u16(pyRound(ext[2] - ext[0])); f.u16(pyRound(ext[3] - ext[1]));
    f.u16(0x1e0); f.u16(0x1b0);
    pecEncode(P.st, f);
    f.put(start + 2, 3, f.len - start);
    // Symbole: Gesamtbild, dann je Farbblock
    const all = blank();
    drawScaled(ext, P.st.filter((s) => s[2] === ST), all, 6, 4);
    f.bytes(all);
    let blk = [];
    const flush = () => { const gr = blank(); drawScaled(ext, blk, gr, 6); f.bytes(gr); blk = []; };
    P.st.forEach((s, i) => {
      if (s[2] === ST) blk.push(s);
      if (s[2] === CC) flush();
      else if (i === P.st.length - 1) flush();
    });
  }

  /* ---------------- PES (Version 1) ---------------- */
  function writePES(P, opts) {
    const f = new Buf();
    f.str('#PES0001');
    const ext = bounds(P.st);
    const cx = (ext[2] + ext[0]) / 2, cy = (ext[3] + ext[1]) / 2;
    const left = ext[0] - cx, top = ext[1] - cy, right = ext[2] - cx, bottom = ext[3] - cy;
    const pecPtr = f.len;
    f.u32(0);
    if (!P.st.length) { f.u16(1); f.u16(1); f.u16(0); f.u16(0); f.u16(0); }
    else {
      f.u16(1); f.u16(1); f.u16(1); // skalieren, Rahmen 130x180, 1 Blockobjekt
      f.u16(0xffff); f.u16(0);
      pesBlocks(f, P, left, top, right, bottom, cx, cy);
    }
    f.put(pecPtr, 4, f.len);
    writePEC(P, f, opts.name);
    return f.out();
  }
  function pesStr16(f, s) { f.u16(s.length); f.str(s); }
  function pesBlocks(f, P, left, top, right, bottom, cx, cy) {
    pesStr16(f, 'CEmbOne');
    const width = right - left, height = bottom - top;
    for (let i = 0; i < 8; i++) f.u16(0);
    const tx = 350 + 1300 / 2 - width / 2, ty = 100 + height + 1800 / 2 - height / 2;
    [1, 0, 0, 1, tx, ty].forEach((v) => f.f32(v));
    f.u16(1); f.u16(0); f.u16(0); f.u16(Math.trunc(width)); f.u16(Math.trunc(height));
    f.bytes([0, 0, 0, 0, 0, 0, 0, 0]);
    const secPos = f.len;
    f.u16(0);
    f.u16(0xffff); f.u16(0); // weitere Blöcke folgen
    pesStr16(f, 'CSewSeg');
    // Segmente aus Befehlsblöcken (get_as_segments_blocks)
    const ax = left + cx, ay = bottom + cy;
    let ci = 0, code = nearest(P.threads[ci++] ?? 0, PEC), sx = 0, sy = 0;
    const blocks = [];
    let lastPos = 0, last = null;
    P.st.forEach((s, pos) => {
      if (last === null || s[2] === last) { last = s[2]; return; }
      last = s[2]; blocks.push(P.st.slice(lastPos, pos)); lastPos = pos;
    });
    blocks.push(P.st.slice(lastPos));
    let section = 0, prev = -1, flag = -1;
    const log = [];
    for (const blk of blocks) {
      const c = blk[0][2];
      let seg, fl;
      if (c === JU) { const e = blk[blk.length - 1]; seg = [[sx - ax, sy - ay], [e[0] - ax, e[1] - ay]]; fl = 1; }
      else if (c === CC) { code = nearest(P.threads[ci++] ?? 0, PEC); continue; }
      else if (c === ST) { seg = blk.map((s) => { sx = s[0]; sy = s[1]; return [sx - ax, sy - ay]; }); fl = 0; }
      else continue;
      if (flag !== -1) f.u16(0x8003); // Segmentende
      flag = fl;
      if (prev !== code) { log.push([section, code]); prev = code; }
      f.u16(flag); f.u16(code); f.u16(seg.length);
      for (const p of seg) { f.u16(Math.trunc(p[0])); f.u16(Math.trunc(p[1])); }
      section++;
    }
    f.u16(log.length);
    for (const [s, c] of log) { f.u16(s); f.u16(c); }
    f.put(secPos, 2, section);
    f.u16(0); f.u16(0); // keine weiteren Blöcke
  }

  /* ---------------- JEF ---------------- */
  function jefHoop(w, h) {
    if (w < 500 && h < 500) return 1; // 50x50
    if (w < 1260 && h < 1100) return 3; // 126x110
    if (w < 1400 && h < 2000) return 2; // 140x200
    if (w < 2000 && h < 2000) return 4; // 200x200
    return 0; // 110x110
  }
  const JEF_HOOPS = ['110x110', '50x50', '140x200', '126x110', '200x200'];
  function dateStr() {
    const d = new Date(), p = (v) => String(v).padStart(2, '0');
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }
  function writeJEF(P, opts) {
    const trims = !!opts.jefTrims, trimAt = opts.trimAt ?? 3;
    const f = new Buf();
    // Palette: aufeinanderfolgende verschiedene Garne nicht auf dieselbe JEF-Farbe legen
    const set = JEF.slice(), pal = [];
    let lastI = null, lastT = null, ti = 0;
    for (const s of P.st) {
      if (s[2] !== CC && ti !== 0) continue;
      const t = P.threads[ti++] ?? 0;
      let i = nearest(t, set);
      if (lastI === i && lastT !== t) { const keep = set[i]; set[i] = null; i = nearest(t, set); set[lastI] = keep; }
      pal.push(i); lastI = i; lastT = t;
    }
    const nCol = pal.length;
    f.u32(0x74 + nCol * 8); f.u32(0x14);
    f.str(String(opts.date || dateStr()).slice(0, 14).padEnd(14, '0'));
    f.u8(0); f.u8(0);
    f.u32(nCol);
    let n = 1;
    for (const s of P.st) {
      const c = s[2];
      if (c === ST) n++;
      else if (c === JU || c === CC) n += 2;
      else if (c === TR && trims) n += 2 * trimAt;
      else if (c === END) break;
    }
    f.u32(n);
    const ext = bounds(P.st);
    const w = pyRound(ext[2] - ext[0]), h = pyRound(ext[3] - ext[1]);
    f.u32(jefHoop(w, h));
    const hw = pyRound(w / 2), hh = pyRound(h / 2);
    f.u32(hw); f.u32(hh); f.u32(hw); f.u32(hh);
    for (const [ex, ey] of [[550, 550], [250, 250], [700, 1000], [700, 1000]]) {
      const x = ex - hw, y = ey - hh;
      if (Math.min(x, y) >= 0) { f.u32(x); f.u32(y); f.u32(x); f.u32(y); }
      else for (let i = 0; i < 4; i++) f.u32(-1);
    }
    pal.forEach((p) => f.u32(p));
    for (let i = 0; i < nCol; i++) f.u32(0x0d);
    let xx = 0, yy = 0;
    for (const [x, y, c] of P.st) {
      const dx = pyRound(x - xx), dy = pyRound(y - yy);
      xx += dx; yy += dy;
      if (c === ST) { f.u8(dx); f.u8(-dy); }
      else if (c === CC) { f.u8(0x80); f.u8(0x01); f.u8(dx); f.u8(-dy); }
      else if (c === TR) { if (trims) for (let i = 0; i < trimAt; i++) f.bytes([0x80, 0x02, 0, 0]); }
      else if (c === JU) { f.u8(0x80); f.u8(0x02); f.u8(dx); f.u8(-dy); }
      else if (c === END) break;
    }
    f.u8(0x80); f.u8(0x10);
    return f.out();
  }

  /* ---------------- EXP ---------------- */
  function writeEXP(P) {
    const f = new Buf();
    let xx = 0, yy = 0;
    for (const [x, y, c] of P.st) {
      const dx = pyRound(x - xx), dy = pyRound(y - yy);
      xx += dx; yy += dy;
      if (c === ST) { f.u8(dx); f.u8(-dy); }
      else if (c === JU) { f.bytes([0x80, 0x04]); f.u8(dx); f.u8(-dy); }
      else if (c === TR) f.bytes([0x80, 0x80, 0x07, 0x00]);
      else if (c === CC) f.bytes([0x80, 0x01, 0x00, 0x00]);
    }
    return f.out();
  }

  /* ---------------- Lesen ---------------- */
  const s8 = (b) => (b > 127 ? b - 256 : b);
  const s12 = (b) => { b &= 0xfff; return b > 0x7ff ? b - 0x1000 : b; };
  const s7 = (b) => (b > 63 ? b - 128 : b);
  const rd16 = (B, p) => B[p] | (B[p + 1] << 8);
  const rd24 = (B, p) => B[p] | (B[p + 1] << 8) | (B[p + 2] << 16);
  const rd32 = (B, p) => (B[p] | (B[p + 1] << 8) | (B[p + 2] << 16) | (B[p + 3] << 24)) | 0;

  // Ereignisliste (0,1 mm absolut) -> Befehle in mm wie readDST: Sprungfolgen zu einem Sprung zusammengefasst,
  // Schnitt vor dem Sprung. autoTrim(dx, dy, n) entscheidet bei Formaten ohne Schnittbefehl.
  function finish(ev, autoTrim) {
    const out = [];
    let run = null, x = 0, y = 0, trimmed = true;
    const flush = () => {
      if (!run) return;
      const dx = x - run.x, dy = y - run.y;
      if (!run.trim && !trimmed && autoTrim && autoTrim(dx, dy, run.n)) run.trim = true;
      if (run.trim) out.push({ x: run.x / 10, y: run.y / 10, cmd: 'trim' });
      if (dx || dy) out.push({ x: x / 10, y: y / 10, cmd: 'jump' });
      if (run.trim) trimmed = true;
      run = null;
    };
    for (const e of ev) {
      if (e.cmd === 'jump' || e.cmd === 'trim') {
        if (!run) run = { x, y, n: 0, trim: false };
        if (e.cmd === 'trim') run.trim = true; else run.n++;
        x = e.x; y = e.y;
        continue;
      }
      flush();
      x = e.x; y = e.y;
      out.push({ x: x / 10, y: y / 10, cmd: e.cmd });
      trimmed = e.cmd === 'color';
    }
    flush();
    return out;
  }

  function readPECStitches(B, p, ev) {
    let x = 0, y = 0;
    while (p + 1 < B.length) {
      let v1 = B[p++], v2 = B[p++];
      if (v1 === 0xff && v2 === 0x00) break;
      if (v1 === 0xfe && v2 === 0xb0) { p++; ev.push({ x, y, cmd: 'color' }); continue; }
      let jump = false, trim = false, dx, dy;
      if (v1 & 0x80) {
        if (v1 & 0x20) trim = true;
        if (v1 & 0x10) jump = true;
        dx = s12((v1 << 8) | v2);
        if (p >= B.length) break;
        v2 = B[p++];
      } else dx = s7(v1);
      if (v2 & 0x80) {
        if (v2 & 0x20) trim = true;
        if (v2 & 0x10) jump = true;
        if (p >= B.length) break;
        dy = s12((v2 << 8) | B[p++]);
      } else dy = s7(v2);
      x += dx; y += dy;
      if (jump) ev.push({ x, y, cmd: 'jump' });
      else if (trim) { ev.push({ x: x - dx, y: y - dy, cmd: 'trim' }); ev.push({ x, y, cmd: 'jump' }); }
      else ev.push({ x, y, cmd: 'stitch' });
    }
  }
  function readPEC(B, p, chart) {
    p += 3 + 16 + 15 + 2 + 12;
    const cc = B[p++], n = cc + 1;
    const bytes = Array.from(B.subarray(p, p + n));
    p += n + 0x1d0 - cc;
    p += 3 + 11; // Länge des Stichblocks, dann Kopf des Stichblocks
    const ev = [];
    readPECStitches(B, p, ev);
    // Farben je Block: PES-Garnliste (1:1 oder tabellarisch wie map_pec_colors), sonst PEC-Palette
    const pec = (b) => PEC[b % PEC.length] ?? 0;
    let cols;
    if (!chart || !chart.length) cols = bytes.map(pec);
    else if (chart.length >= bytes.length) cols = bytes.map((b, i) => chart[i]);
    else {
      const map = {}, ch = chart.slice();
      cols = bytes.map((b) => { const k = b % PEC.length; if (!(k in map)) map[k] = ch.length ? ch.shift() : pec(b); return map[k]; });
    }
    return { cmds: finish(ev), colors: cols.map(intHex) };
  }
  // Garnliste aus dem PES-Kopf (ab Version 5)
  const PES_HDR = { '#PES0050': [24, 's', 24], '#PES0055': [24, 's', 24], '#PES0056': [24, 's', 24], '#PES0060': [36, 's', 24],
    '#PES0070': [36, 's', 24], '#PES0080': [38, 's', 26], '#PES0090': [14, 's', 30, 's', 34], '#PES0100': [14, 's', 38, 's', 34] };
  function pesThreads(B, sig) {
    const steps = PES_HDR[sig];
    if (!steps) return [];
    let p = 12 + 4;
    const str = () => { const l = B[p++]; p += l; };
    for (let i = 0; i < 5; i++) str(); // Name, Kategorie, Autor, Stichwörter, Kommentar
    for (const s of steps) { if (s === 's') str(); else p += s; }
    for (let i = 0; i < 3; i++) { if (rd16(B, p)) return []; p += 2; }
    const n = rd16(B, p); p += 2;
    const out = [];
    for (let i = 0; i < n && p < B.length; i++) {
      str();
      out.push((B[p] << 16) | (B[p + 1] << 8) | B[p + 2]);
      p += 3 + 5;
      str(); str(); str();
    }
    return out;
  }
  function readPES(B) {
    const sig = String.fromCharCode(...B.subarray(0, 8));
    if (sig === '#PEC0001') return readPEC(B, 8, null);
    if (!sig.startsWith('#PES')) throw new Error('Keine PES-Datei');
    let chart = [];
    try { chart = pesThreads(B, sig); } catch (e) { chart = []; }
    return readPEC(B, rd32(B, 8), chart);
  }

  function readJEF(B) {
    const off = rd32(B, 0), n = rd32(B, 24);
    const cols = [];
    for (let i = 0; i < n; i++) {
      const k = Math.abs(rd32(B, 116 + i * 4));
      // Index 0 = Stopp: gleiche Farbe wie zuvor
      cols.push(k === 0 ? cols[cols.length - 1] ?? 0 : JEF[k % JEF.length]);
    }
    const ev = [];
    let x = 0, y = 0;
    for (let p = off; p + 1 < B.length; ) {
      const b0 = B[p], b1 = B[p + 1];
      p += 2;
      if (b0 !== 0x80) { x += s8(b0); y -= s8(b1); ev.push({ x, y, cmd: 'stitch' }); continue; }
      if (p + 1 >= B.length) break;
      const dx = s8(B[p]), dy = -s8(B[p + 1]);
      p += 2;
      if (b1 === 0x02) { x += dx; y += dy; ev.push({ x, y, cmd: 'jump' }); }
      else if (b1 === 0x01) ev.push({ x, y, cmd: 'color' });
      else break; // 0x10 = Ende
    }
    // kein Schnittbefehl im Format: Sprung > 3 mm oder Folge von >= 3 Sprüngen gilt als Schnitt
    const cmds = finish(ev, (dx, dy, k) => Math.abs(dx) > 30 || Math.abs(dy) > 30 || k >= 3);
    return { cmds, colors: cols.map(intHex) };
  }

  function readEXP(B) {
    const ev = [];
    let x = 0, y = 0;
    for (let p = 0; p + 1 < B.length; ) {
      const b0 = B[p], b1 = B[p + 1];
      p += 2;
      if (b0 !== 0x80) { x += s8(b0); y -= s8(b1); ev.push({ x, y, cmd: 'stitch' }); continue; }
      if (p + 1 >= B.length) break;
      const dx = s8(B[p]), dy = -s8(B[p + 1]);
      p += 2;
      if (b1 === 0x80) ev.push({ x, y, cmd: 'trim' });
      else if (b1 === 0x02) { x += dx; y += dy; ev.push({ x, y, cmd: 'stitch' }); }
      else if (b1 === 0x04) { x += dx; y += dy; ev.push({ x, y, cmd: 'jump' }); }
      else if (b1 === 0x01) { ev.push({ x, y, cmd: 'color' }); if (dx || dy) { x += dx; y += dy; ev.push({ x, y, cmd: 'jump' }); } }
      else break;
    }
    return { cmds: finish(ev), colors: [] };
  }

  /* ---------------- Schnittstelle ---------------- */
  const FORMATS = [
    { id: 'pes', ext: 'pes', name: 'Brother PES', desc: 'PES Version 1 mit PEC-Block (Brother, Babylock, Bernette)' },
    { id: 'jef', ext: 'jef', name: 'Janome JEF', desc: 'Janome/Elna/Kenmore, Rahmen wird automatisch gewählt' },
    { id: 'exp', ext: 'exp', name: 'Melco EXP', desc: 'Melco/Bernina Expanded, ohne Farbinformation' },
  ];
  const MAX = { pes: 2047, jef: 127, exp: 127 };

  /**
   * Schreibt ein Design. cmds wie HW.dst.assemble (mm, Y nach unten), palette [{hex, ...}].
   * opts: firstColor (Paletten-Index der Startfarbe), name (PES), date (JEF, 'YYYYMMDDHHMMSS'), jefTrims (JEF-Schnittbefehle).
   */
  function write(fmt, cmds, palette, opts = {}) {
    fmt = String(fmt).toLowerCase();
    if (!MAX[fmt]) throw new Error('Unbekanntes Format: ' + fmt);
    const P = prepare(cmds, palette, opts, MAX[fmt]);
    if (fmt === 'pes') return writePES(P, opts);
    if (fmt === 'jef') return writeJEF(P, opts);
    return writeEXP(P);
  }
  /** Liest eine Datei: { cmds: [{x, y, cmd}] in mm (Y nach unten), colors: ['#rrggbb' je Farbblock] }. */
  function read(fmt, bytes) {
    fmt = String(fmt).toLowerCase();
    const B = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (fmt === 'pes' || fmt === 'pec') return readPES(B);
    if (fmt === 'jef') return readJEF(B);
    if (fmt === 'exp') return readEXP(B);
    throw new Error('Unbekanntes Format: ' + fmt);
  }

  HW.formats = { write, read, FORMATS, PEC_COLORS: PEC.map((c) => (c == null ? null : intHex(c))),
    JEF_COLORS: JEF.map((c) => (c == null ? null : intHex(c))), JEF_HOOPS, _prepare: prepare, _blank: blank };
})(typeof window !== 'undefined' ? window : globalThis);
