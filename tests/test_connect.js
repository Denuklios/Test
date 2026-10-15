// Prüft Verbindungsarten (Stich / Sprung ohne Schnitt / Schnitt) und Stickrahmen. Aufruf: node tests/test_connect.js [out.dst]
require('../js/geometry.js'); require('../js/stitchgen.js'); require('../js/dst.js'); require('../js/dst_io.js'); require('../js/hoops.js');
const HW = globalThis.HW, S = HW.stitch, D = HW.dst, H = HW.hoops;
let fails = 0, nid = 1;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FEHL ') + m); if (!c) fails++; };
const P = (x, y) => ({ x, y, c: false });
const run = (x, extra = {}) => { const o = { id: nid++, color: 0, type: 'run', params: { ...S.DEFAULTS.run }, points: [P(x, 0), P(x + 10, 0)], ...extra }; o._st = S.generate(o); return o; };
const st = (objs, opts) => D.stats(D.assemble(objs, null, { trimDist: 2, trimJumps: 3, ...opts }));
// Abstand 10 mm
let s = st([run(0), run(20)], { jumpMax: 0 });
ok(s.trims === 1 && s.floats === 0, 'Sprung-Grenze 0: es wird geschnitten');
s = st([run(0), run(20)], { jumpMax: 15 });
ok(s.trims === 0 && s.floats === 1, 'Sprung-Grenze 15 mm: 10 mm Sprung ohne Schnitt');
s = st([run(0), run(40)], { jumpMax: 50 });
ok(s.trims === 1, '30 mm Sprung bei "Schnitt ab 3 Sprüngen": über 24,2 mm wird trotzdem geschnitten');
s = st([run(0), run(40)], { jumpMax: 50, trimJumps: 5 });
ok(s.trims === 0 && s.floats === 1, 'bei "Schnitt ab 5 Sprüngen" sind 30 mm ohne Schnitt möglich');
// pro Objekt
s = st([run(0), run(11, { connect: 'trim' })], { jumpMax: 0 });
ok(s.trims === 1, 'Objekt "immer schneiden": auch bei 1 mm Abstand');
s = st([run(0), run(20, { connect: 'jump' })], { jumpMax: 0 });
ok(s.trims === 0 && s.floats === 1, 'Objekt "springen ohne Schnitt" trotz Grenze 0');
const c = D.assemble([run(0), run(20, { connect: 'stitch' })], null, { trimDist: 2 });
ok(D.stats(c).trims === 0 && c.filter((q) => q.travel).length >= 3, 'Objekt "direkt als Stich": Verbindung in kurzen Stichen');
// DST: Sprung ohne Schnitt darf nicht als Schnitt gelesen werden
const cmds = D.assemble([run(0), run(30)], null, { trimDist: 2, trimJumps: 3, jumpMax: 24 });
const buf = D.writeDST(cmds, 'SPRUNG', { trimJumps: 3 });
let maxRun = 0, cur = 0;
for (let i = 512; i + 2 < buf.length; i += 3) { if ((buf[i + 2] & 0x80) && (buf[i + 2] & 0xc3) !== 0xc3 && buf[i + 2] !== 0xf3) { cur++; maxRun = Math.max(maxRun, cur); } else cur = 0; }
const back = D.readDST(buf).filter((q) => q.cmd === 'trim').length;
ok(maxRun <= 2 && back === 0, `DST: längste Sprungfolge ${maxRun} Befehle (< 3), beim Lesen ${back} Schnitte`);
if (process.argv[2]) require('fs').writeFileSync(process.argv[2], buf);
// Rahmen
const r200 = H.get('R200', []), q = H.get('290x290', []);
ok(H.inside(r200, { x: 99, y: 0 }) && !H.inside(r200, { x: 80, y: 80 }), 'Rundrahmen Ø 200: Randpunkt innen, Ecke außen');
const pts = [P(-60, -40), P(60, 40), P(0, 0)];
const fit = H.fitting(pts, []).map((h) => h.id);
ok(fit.includes('R200') && !fit.includes('R150') && fit.includes('h_130x180'), 'passende Rahmen für 120 × 80 mm (Ecken 72 mm von der Mitte): ' + fit.slice(0, 4).join(', '));
const big = [P(-150, -100), P(150, 100)];
const f = H.fitScale(H.get('R200', []), big);
ok(big.every((p) => H.inside(r200, { x: p.x * f, y: p.y * f }, r200.margin - 0.01)), `Einpassen in Ø 200: Faktor ${(f * 100).toFixed(0)} %`);
const custom = [{ id: 'c1', name: 'Eigener', shape: 'oval', w: 100, h: 160, margin: 3 }];
ok(H.get('c1', custom).shape === 'oval' && H.fitting([P(-30, -50), P(30, 50)], custom).some((h) => h.id === 'c1'), 'eigener ovaler Rahmen wird erkannt und passt');
process.exit(fails ? 1 : 0);
