// Rundreise PES/JEF/EXP: schreiben, mit eigenem Leser zurücklesen, Stiche/Farben/Ausdehnung vergleichen.
// Aufruf: node tests/test_formats.js [ausgabeordner]  (schreibt dann test.pes/.jef/.exp + test.json zum Gegenprüfen)
require('../js/geometry.js'); require('../js/stitchgen.js'); require('../js/dst.js'); require('../js/formats.js');
const HW = globalThis.HW, S = HW.stitch, D = HW.dst, F = HW.formats;
const fs = require('fs'), path = require('path');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FEHL ') + m); if (!c) fails++; };
const P = (x, y, c = false) => ({ x, y, c });
const palette = [
  { hex: '#d01020', name: 'Rot', needle: 1 },
  { hex: '#1040c0', name: 'Blau', needle: 2 },
  { hex: '#20a040', name: 'Grün', needle: 3 },
];
const objs = [
  { id: 1, type: 'run', color: 0, params: { ...S.DEFAULTS.run }, points: [P(-40, -30), P(-20, -20, true), P(0, -30)] },
  // Sprung ohne Schnitt über ~30 mm (länger als ein DST/JEF-Sprung)
  { id: 2, type: 'run', color: 0, connect: 'jump', params: { ...S.DEFAULTS.run, style: 'triple' }, points: [P(-10, 5), P(20, 5)] },
  { id: 3, type: 'colA', color: 1, params: { ...S.DEFAULTS.satin }, points: [P(-40, 10), P(-40, 15), P(-20, 5, true), P(-20, 11, true), P(0, 10), P(0, 15)] },
  { id: 4, type: 'fill', color: 1, connect: 'trim', params: { ...S.DEFAULTS.fill }, points: [P(10, 20), P(45, 20), P(45, 45), P(10, 45)], holes: [] },
  // Stopp bei gleicher Farbe muss als Farbwechsel ankommen
  { id: 5, type: 'run', color: 1, stopBefore: true, params: { ...S.DEFAULTS.run }, points: [P(-40, 40), P(0, 50)] },
];
for (const o of objs) o._st = S.generate(o);
const cmds = D.assemble(objs, palette, { trimDist: 2, lock: true, trimJumps: 5 });
const s = D.stats(cmds);
ok(s.colors === 3 && s.trims >= 2 && s.floats >= 1, `Testdesign: ${s.stitches} Stiche, ${s.colors} Farbblöcke, ${s.trims} Schnitte, ${s.floats} Sprünge`);
const longJump = cmds.some((c, i) => c.cmd === 'jump' && i && Math.hypot(c.x - cmds[i - 1].x, c.y - cmds[i - 1].y) > 12.7);
ok(longJump, 'enthält Sprung > 12,7 mm');

// Stiche mit gleicher Position (auf 0,1 mm) zusammenfassen: PEC setzt nach Sprüngen Nullstiche
const uniq = (list, cx = 0, cy = 0) => {
  const r = [];
  for (const c of list) if (c.cmd === 'stitch') {
    const x = Math.round((c.x - cx) * 10), y = Math.round((c.y - cy) * 10);
    const l = r[r.length - 1];
    if (!l || l.x !== x || l.y !== y) r.push({ x, y });
  }
  return r;
};
const ref = uniq(cmds, (s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2);
const out = process.argv[2];
const info = { stitches: ref.length, colors: s.colors, w: s.w, h: s.h, trims: s.trims, formats: {} };
for (const fmt of ['pes', 'jef', 'exp']) {
  const buf = F.write(fmt, cmds, palette, { firstColor: 0, name: 'Test', date: '20260101120000' });
  ok(buf instanceof Uint8Array && buf.length > 20, `${fmt}: ${buf.length} Byte geschrieben`);
  const r = F.read(fmt, buf);
  const s2 = D.stats(r.cmds), back = uniq(r.cmds);
  ok(back.length === ref.length, `${fmt}: Stiche ${back.length} / ${ref.length}`);
  let maxErr = 0;
  for (let i = 0; i < Math.min(back.length, ref.length); i++) maxErr = Math.max(maxErr, Math.hypot(back[i].x - ref[i].x, back[i].y - ref[i].y) / 10);
  ok(maxErr < 0.11, `${fmt}: max. Positionsfehler ${maxErr.toFixed(2)} mm`);
  ok(s2.colors === s.colors, `${fmt}: Farbblöcke ${s2.colors} / ${s.colors}`);
  ok(Math.abs(s2.w - s.w) <= 0.2 && Math.abs(s2.h - s.h) <= 0.2, `${fmt}: Größe ${s2.w.toFixed(1)} x ${s2.h.toFixed(1)} / ${s.w.toFixed(1)} x ${s.h.toFixed(1)} mm`);
  ok(Math.abs((s2.x0 + s2.x1) / 2) <= 0.1 && Math.abs((s2.y0 + s2.y1) / 2) <= 0.1, `${fmt}: Design zentriert`);
  if (fmt !== 'jef') ok(s2.trims >= s.trims, `${fmt}: Schnitte ${s2.trims} (>= ${s.trims})`);
  if (fmt === 'exp') ok(r.colors.length === 0, 'exp: keine Farbliste');
  else {
    ok(r.colors.length === s.colors, `${fmt}: ${r.colors.length} Farben: ${r.colors.join(' ')}`);
    ok(r.colors[0] !== r.colors[1] && r.colors[1] === r.colors[2], `${fmt}: Farbfolge Rot, Blau, Blau (Stopp)`);
  }
  const ys = r.cmds.filter((c) => c.cmd === 'stitch');
  ok(ys[0].y < ys[ys.length - 1].y, `${fmt}: Y-Achse nach unten`);
  info.formats[fmt] = { stitches: back.length, colors: r.colors };
  if (out) fs.writeFileSync(path.join(out, 'test.' + fmt), buf);
}
// PES: Farbzuordnung auf die PEC-Palette, JEF: Rahmenwahl
const pes = F.read('pes', F.write('pes', cmds, palette));
ok(pes.colors[0] === '#ed171f' && pes.colors[1] === '#0a55a3', `pes: nächste PEC-Farben ${pes.colors[0]} ${pes.colors[1]}`);
const jef = F.write('jef', cmds, palette);
ok(new DataView(jef.buffer).getInt32(32, true) === 3, 'jef: Rahmen 126x110 gewählt');
// leeres Design darf nicht abstürzen
for (const fmt of ['pes', 'jef', 'exp']) ok(F.read(fmt, F.write(fmt, [], palette)).cmds.length === 0, `${fmt}: leeres Design`);
if (out) fs.writeFileSync(path.join(out, 'test.json'), JSON.stringify(info));
process.exit(fails ? 1 : 0);
