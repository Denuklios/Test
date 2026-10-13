// Kerntests: Stichgenerierung + DST-Rundreise. Aufruf: node tests/test_core.js [out.dst]
require('../js/geometry.js'); require('../js/stitchgen.js'); require('../js/dst.js'); require('../js/autodigitize.js');
const HW = globalThis.HW, S = HW.stitch, D = HW.dst;
const fs = require('fs');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FEHL ') + m); if (!c) fails++; };
const P = (x, y, c = false) => ({ x, y, c });
const objs = [
  { id: 1, type: 'run', color: 0, params: { ...S.DEFAULTS.run }, points: [P(-40, -40), P(-20, -30, true), P(0, -40)] },
  { id: 2, type: 'run', color: 0, params: { ...S.DEFAULTS.run, style: 'triple' }, points: [P(-40, -35), P(0, -35)] },
  { id: 3, type: 'colA', color: 1, params: { ...S.DEFAULTS.satin, underlay: 'edge+zigzag' }, points: [P(-40, -20), P(-40, -15), P(-20, -25, true), P(-20, -19, true), P(0, -20), P(0, -15)] },
  { id: 4, type: 'colB', color: 1, params: { ...S.DEFAULTS.satin }, points: [P(10, -40), P(30, -40)], side2: [P(30, -30), P(10, -32)] },
  { id: 5, type: 'colC', color: 2, params: { ...S.DEFAULTS.satin, width: 4 }, points: [P(10, -20), P(25, -10, true), P(40, -20)] },
  { id: 6, type: 'fill', color: 2, params: { ...S.DEFAULTS.fill, border: 'satin' }, points: [P(-40, 0), P(0, 0), P(0, 40), P(-40, 40)], holes: [[P(-30, 10), P(-10, 10), P(-10, 30), P(-30, 30)]] },
  { id: 7, type: 'fill', color: 3, params: { ...S.DEFAULTS.fill, fillType: 'satin', angle: 90 }, points: [P(10, 0), P(40, 0), P(40, 8), P(10, 8)], holes: [] },
  { id: 8, type: 'fill', color: 3, params: { ...S.DEFAULTS.fill, angle: 0 }, points: [P(10, 15), P(40, 15), P(40, 40), P(25, 20), P(10, 40)], holes: [] }, // U-Form -> mehrere Blöcke
];
for (const o of objs) {
  o._st = S.generate(o);
  ok(o._st.length > 5, `${o.type} #${o.id}: ${o._st.length} Stiche`);
  let maxL = 0;
  for (let i = 1; i < o._st.length; i++) if (!o._st[i].j) maxL = Math.max(maxL, Math.hypot(o._st[i].x - o._st[i - 1].x, o._st[i].y - o._st[i - 1].y));
  ok(maxL < 12.1, `  längster Stich ${maxL.toFixed(2)} mm`);
}
// Füllung darf nicht im Loch stechen
const hole = objs[5]._st.filter((p) => p.x > -29.5 && p.x < -10.5 && p.y > 10.5 && p.y < 29.5);
ok(hole.length === 0, `keine Einstiche im Loch (${hole.length})`);
const cmds = D.assemble(objs, null, { trimDist: 2, lock: true });
const s = D.stats(cmds);
ok(s.colors === 4, `Farben: ${s.colors}`);
const buf = D.writeDST(cmds, 'TEST', { trimJumps: 3 });
ok(buf.length > 512 && (buf.length - 512) % 3 === 0, `DST Größe ${buf.length} Byte`);
const back = D.readDST(buf);
const st1 = cmds.filter((c) => c.cmd === 'stitch'), st2 = back.filter((c) => c.cmd === 'stitch');
ok(Math.abs(st1.length - st2.length) <= 0.01 * st1.length + 5, `Stiche zurückgelesen ${st2.length} / ${st1.length}`);
ok(back.filter((c) => c.cmd === 'color').length === 3, 'Farbwechsel zurückgelesen');
// Positionsgenauigkeit (Design zentriert)
const cx = (s.x0 + s.x1) / 2, cy = (s.y0 + s.y1) / 2;
let maxErr = 0;
const a = st1.filter((c, i) => i === 0 || Math.round(c.x * 10) !== Math.round(st1[i - 1].x * 10) || Math.round(c.y * 10) !== Math.round(st1[i - 1].y * 10));
for (let i = 0; i < Math.min(a.length, st2.length); i++) maxErr = Math.max(maxErr, Math.hypot(a[i].x - cx - st2[i].x, a[i].y - cy - st2[i].y));
ok(maxErr < 0.15, `max. Positionsfehler ${maxErr.toFixed(3)} mm`);
// Encoder-Vollständigkeit
let encErr = 0;
for (let x = -121; x <= 121; x++) for (let y = -121; y <= 121; y += 11) { const e = D.encode(x, y, 'stitch'); const d = D.decode(...e); if (d.x !== x || d.y !== y) encErr++; }
ok(encErr === 0, 'Kodierung ±121 verlustfrei');
// Auto-Digitalisieren: synthetisches Bild
const w = 120, h = 80, data = new Uint8ClampedArray(w * h * 4);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const i = (y * w + x) * 4; let c = [255, 255, 255];
  if ((x - 40) ** 2 + (y - 40) ** 2 < 900) c = [220, 20, 30];
  if ((x - 40) ** 2 + (y - 40) ** 2 < 100) c = [255, 255, 255];
  if (x > 80 && x < 110 && y > 10 && y < 70) c = [10, 40, 200];
  data.set([...c, 255], i);
}
const r = HW.auto.autoDigitize({ width: w, height: h, data }, { colors: 3, widthMM: 60, originX: 0, originY: 0, minAreaMM2: 1, removeBg: true });
ok(r.objects.length === 2, `Auto: ${r.objects.length} Objekte, Farben ${r.palette.join(',')}`);
ok(r.objects.some((o) => o.holes.length === 1), 'Auto: Ring hat Loch');
if (process.argv[2]) fs.writeFileSync(process.argv[2], buf);
process.exit(fails ? 1 : 0);
