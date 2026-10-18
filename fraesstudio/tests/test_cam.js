// Prüft Fräsbahnen und G-Code. Aufruf: node tests/test_cam.js
require('../js/core.js'); require('../js/fonts.js'); require('../js/ttf.js'); require('../js/shapes.js');
require('../js/tools.js'); require('../js/importers.js'); require('../js/cam.js'); require('../js/gcode.js'); require('../js/sim.js');
const FS = globalThis.FS, S = FS.shapes, G = FS.geo;
let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FEHL ') + m); if (!c) fails++; };
const near = (a, b, t = 0.02) => Math.abs(a - b) <= t;

const tools = FS.tools.DEFAULT_TOOLS;
const stock = { w: 200, h: 150, t: 10, material: 'weichholz', zeroXY: 'll', zeroZ: 'top', safeZ: 5 };
const machine = FS.tools.MACHINES.ttc450;
const sq = S.make('rect', { w: 40, h: 40, r: 0 }); sq.tf = FS.M.translate(50, 50);
const circ = S.make('ellipse', { rx: 10, ry: 10 }); circ.tf = FS.M.translate(120, 50);
const objects = [sq, circ];
const ctx = { objects, tools, stock, machine };
const allXY = (res) => res.chains.flatMap((c) => c.pts);

// Kontur außen: Abstand = Werkzeugradius
let op = FS.cam.makeOp('profile', [sq.id], 't1');
op.depth = 3; op.ramp = false;
let r = FS.cam.compute(op, ctx);
let pts = allXY(r);
let b = G.bounds([pts]);
ok(near(b.w, 40 + 3.175, 0.05), `Kontur außen: Bahnbreite ${b.w.toFixed(3)} = 43,175`);
ok(near(Math.min(...pts.map((p) => p.z)), -3), 'Kontur außen: Endtiefe -3');
ok(r.chains.length === 1, 'Kontur: eine Kette (alle Zustellungen am Stück)');
const zs = [...new Set(pts.map((p) => +p.z.toFixed(3)))].sort((a, c) => a - c);
ok(zs.length >= 3, `Kontur: ${zs.length - 1} Zustellungen bei 1 mm`);
// Gleichlauf außen: im Uhrzeigersinn -> negative Fläche
const lvl = pts.filter((p) => near(p.z, -3, 1e-6));
ok(G.signedArea(lvl) < 0, 'Kontur außen im Gleichlauf läuft im Uhrzeigersinn');

// Kontur innen
op = FS.cam.makeOp('profile', [circ.id], 't1'); op.side = 'inside'; op.depth = 2; op.ramp = true;
r = FS.cam.compute(op, ctx);
pts = allXY(r);
const rad = Math.max(...pts.map((p) => Math.hypot(p.x - 120, p.y - 50)));
ok(near(rad, 10 - 1.5875, 0.03), `Kontur innen: Radius ${rad.toFixed(3)} = 8,4125`);
ok(pts.some((p, i) => i > 0 && p.z < 0 && pts[i - 1].z > p.z && G.dist(p, pts[i - 1]) > 0.1), 'Kontur innen: schräg eintauchen (Rampe)');

// Haltestege
op = FS.cam.makeOp('profile', [sq.id], 't1'); op.depth = 6; op.tabs = true; op.tabCount = 4; op.tabHeight = 2; op.ramp = false;
r = FS.cam.compute(op, ctx);
pts = allXY(r);
const atTab = pts.filter((p) => near(p.z, -4, 1e-6)).length;
ok(atTab > 4 && r.tabs.length === 4, `Haltestege: 4 Stege, ${atTab} Punkte auf Steghöhe`);

// Tasche
op = FS.cam.makeOp('pocket', [sq.id], 't1'); op.depth = 2;
r = FS.cam.compute(op, ctx);
pts = allXY(r);
b = G.bounds([pts]);
ok(near(b.w, 40 - 3.175, 0.05), `Tasche: äußerste Bahn ${b.w.toFixed(3)} = 36,825`);
ok(r.chains.length <= 4, `Tasche: wenige Ketten (${r.chains.length}), Bahnen werden verbunden`);
op.strategy = 'raster';
r = FS.cam.compute(op, ctx);
ok(r.chains.length > 0 && r.warnings.length === 0, `Tasche Zeilen: ${r.chains.length} Ketten`);

// Tasche mit Insel (Text "O")
const txt = S.make('text', { text: 'O', font: 'Archivo Black', size: 40, align: 'left', spacing: 0 });
txt.tf = FS.M.translate(20, 20);
ok(S.rings([txt]).length === 2, 'Text "O": zwei Ringe');
ctx.objects = [sq, circ, txt];

// Bohren
op = FS.cam.makeOp('drill', [circ.id], 't10'); op.depth = 5; op.peck = 2;
r = FS.cam.compute(op, ctx);
pts = allXY(r);
ok(r.chains.length === 1 && pts.every((p) => near(p.x, 120) && near(p.y, 50)) && near(Math.min(...pts.map((p) => p.z)), -5), 'Bohren mit Bohrer: senkrecht, Tiefe 5, Entspänen');
op.toolId = 't1';
r = FS.cam.compute(op, ctx);
pts = allXY(r);
ok(near(Math.max(...pts.map((p) => Math.hypot(p.x - 120, p.y - 50))), 10 - 1.5875, 0.03), 'Bohren 20 mm mit 3,175er: Helix-Fräsen');

// V-Carving: Quadrat mit 90°-V-Fräser -> Mitte tiefste Stelle = halbe Breite / tan(45°)
const small = S.make('rect', { w: 10, h: 10, r: 0 }); small.tf = FS.M.translate(30, 120);
ctx.objects.push(small);
op = FS.cam.makeOp('vcarve', [small.id], 't7');
r = FS.cam.compute(op, ctx);
pts = allXY(r);
const minZ = Math.min(...pts.map((p) => p.z));
ok(near(minZ, -5, 0.15), `V-Carving Quadrat 10 mm, 90°: tiefste Stelle ${minZ.toFixed(2)} ≈ -5`);
ok(pts.every((p) => p.x >= 25 - 1e-6 && p.x <= 35 + 1e-6), 'V-Carving bleibt innerhalb der Form');
op.maxDepth = 2; op.clearToolId = 't1';
r = FS.cam.compute(op, ctx);
ok(near(Math.min(...allXY(r).map((p) => p.z)), -2, 1e-6) && r.clear && r.clear.chains.length > 0, 'V-Carving mit Maximaltiefe 2: flacher Boden wird ausgeräumt');
op = FS.cam.makeOp('vcarve', [txt.id], 't6');
const t0 = Date.now();
r = FS.cam.compute(op, ctx);
ok(r.chains.length === 2 && r.warnings.length === 0, `V-Carving Text "O": 2 Ketten in ${Date.now() - t0} ms`);

// Relief: Halbkugel als Höhenbild
const N = 101, f = new Float32Array(N * N);
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const x = (i - 50) / 50, y = (j - 50) / 50; f[j * N + i] = Math.sqrt(Math.max(0, 1 - x * x - y * y)); }
const rel = FS.relief.makeRelief('Kuppel', N, N, f, 40, 40, 5);
rel.tf = FS.M.translate(150, 100);
ctx.objects.push(rel);
op = FS.cam.makeOp('relief_finish', [rel.id], 't8');
r = FS.cam.compute(op, ctx);
pts = allXY(r);
ok(r.chains.length === 1 && near(Math.max(...pts.map((p) => p.z)), 0, 0.05) && near(Math.min(...pts.map((p) => p.z)), -5, 0.05), 'Relief schlichten: Höhen 0 bis -5');
op = FS.cam.makeOp('relief_rough', [rel.id], 't1');
r = FS.cam.compute(op, ctx);
pts = allXY(r);
ok(r.chains.length > 0 && Math.min(...pts.map((p) => p.z)) >= -5 + 0.5 - 1e-6, `Relief schruppen: Aufmaß bleibt stehen (${r.chains.length} Ketten)`);

// Relief per Simulation prüfen: nichts zu tief, kein Eilgang durchs Material, Schlichten nah an der Sollfläche
{
  const st = { ...stock, w: 200, h: 150 };
  const c2 = { ...ctx, stock: st };
  const rough = FS.cam.compute(FS.cam.makeOp('relief_rough', [rel.id], 't1'), c2);
  const fin = FS.cam.compute(FS.cam.makeOp('relief_finish', [rel.id], 't8'), c2);
  const g = FS.gcode.build([rough, fin], c2);
  const sim = FS.sim.create(st, 0.25);
  const S0 = FS.cam.reliefSampler(rel);
  FS.sim.run(sim, g.moves.filter((m) => m.op === 0), null, Infinity);
  let gouge = 0, maxRest = 0;
  for (let y = 102 - 15; y <= 102 + 15; y += 0.5) for (let x = 150 - 15; x <= 150 + 15; x += 0.5) {
    const want = S0.at(x, y), h = FS.sim.heightAt(sim, x, y);
    if (want === null) continue;
    if (h < want - 0.05) gouge++;
    maxRest = Math.max(maxRest, h - want);
  }
  ok(gouge === 0 && sim.warnings.size === 0, `Relief schruppen: nichts zu tief, keine Eilgänge im Material (${sim.warnings.size})`);
  FS.sim.run(sim, g.moves, null, Infinity);
  const dev = [];
  let gouge2 = 0;
  for (let y = 100 - 12; y <= 100 + 12; y += 0.5) for (let x = 150 - 12; x <= 150 + 12; x += 0.5) {
    const want = S0.at(x, y), h = FS.sim.heightAt(sim, x, y);
    if (want === null) continue;
    if (h < want - 0.08) gouge2++;
    dev.push(h - want);
  }
  dev.sort((a2, b2) => a2 - b2);
  const med = dev[dev.length >> 1];
  ok(gouge2 === 0 && med < 0.08 && sim.warnings.size === 0, `Relief schlichten: Abweichung Median ${med.toFixed(3)} mm, Rest nach Schruppen max ${maxRest.toFixed(2)} mm`);
}

// G-Code
const res = [FS.cam.compute(FS.cam.makeOp('profile', [sq.id], 't1'), ctx), FS.cam.compute(FS.cam.makeOp('vcarve', [small.id], 't7'), ctx)];
const gc = FS.gcode.build(res, { ...ctx, name: 'Test' });
ok(/^G21 G90 G94 G17$/m.test(gc.text) && /M3 S\d+/.test(gc.text) && /M0/.test(gc.text) && /M2\s*$/.test(gc.text), 'G-Code: Kopf, Spindel, Werkzeugwechsel (M0), Ende');
ok(!/[^\x00-\x7f]/.test(gc.text), 'G-Code enthält nur ASCII');
ok(gc.time > 10, `Laufzeit geschätzt: ${FS.gcode.fmtTime(gc.time)}`);
const back = FS.gcode.parse(gc.text);
const cutBack = back.filter((m) => !m.rapid);
ok(cutBack.some((m) => near(m.x, 50 - 20 - 1.5875, 0.002) && near(m.z, -3, 0.002)), 'G-Code einlesen: Koordinaten stimmen');
const st2 = { ...stock, zeroXY: 'c', zeroZ: 'bottom' };
const gc2 = FS.gcode.build(res, { ...ctx, stock: st2 });
const back2 = FS.gcode.parse(gc2.text).filter((m) => !m.rapid);
ok(back2.some((m) => near(m.x, 50 - 20 - 1.5875 - 100, 0.002) && near(m.z, 10 - 3, 0.002)), 'Nullpunkt Mitte / Tisch wird eingerechnet');
ok(FS.gcode.parse('G0 X0 Y0\nG2 X10 Y0 I5 J0\n').length > 4, 'G2-Bögen werden aufgelöst');

// Simulation
const sim = FS.sim.create(stock, 0.5);
FS.sim.run(sim, gc.moves, null, Infinity);
const hz = FS.sim.heightAt(sim, 50, 50 + 20 + 1.5875);
ok(near(hz, -3, 0.3), `Simulation: Material an der Konturbahn auf ${hz.toFixed(2)} abgetragen`);
ok(near(FS.sim.heightAt(sim, 50, 50), 0, 1e-6), 'Simulation: Teil bleibt stehen');

// Importe
const dxf = ['0', 'SECTION', '2', 'ENTITIES', '0', 'LINE', '10', '0', '20', '0', '11', '10', '21', '0', '0', 'LINE', '10', '10', '20', '0', '11', '10', '21', '10', '0', 'LINE', '10', '10', '20', '10', '11', '0', '21', '0', '0', 'CIRCLE', '10', '5', '20', '5', '40', '2', '0', 'LWPOLYLINE', '90', '2', '70', '1', '10', '20', '20', '0', '42', '1', '10', '30', '20', '0', '42', '1', '0', 'ENDSEC', '0', 'EOF'].join('\n');
const dl = FS.importers.parseDXF(dxf);
ok(dl.filter((l) => l.closed).length === 3, `DXF: Dreieck aus Linien geschlossen, Kreis, Polylinie mit Bögen (${dl.length} Züge)`);
const pl = dl.find((l) => l.closed && l.pts.some((p) => p.x > 19));
ok(pl && near(Math.abs(G.signedArea(pl.pts)), Math.PI * 25, 0.3), 'DXF: Bögen (bulge) ergeben Kreis mit r = 5');
const pd = FS.importers.parsePathD('M0 0 L10 0 L10 10 Z M20 0 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0z');
ok(pd.length === 2 && pd.every((p) => p.closed) && near(Math.abs(G.signedArea(pd[1].pts)), Math.PI * 25, 0.3), 'SVG-Pfad: Linien und Bögen');
const bin = new Uint8Array(20 * 20); for (let j = 5; j < 15; j++) for (let i = 5; i < 15; i++) bin[j * 20 + i] = 1;
const tr = FS.importers.traceBinary(bin, 20, 20);
ok(tr.length === 1 && near(Math.abs(G.signedArea(tr[0])), 100, 15), 'Nachzeichnen: Quadrat erkannt');
const stl = new ArrayBuffer(84 + 50); const dv = new DataView(stl); dv.setUint32(80, 1, true);
[0, 0, 0, 10, 0, 0, 0, 10, 5].forEach((v, k) => dv.setFloat32(84 + 12 + k * 4, v, true));
const ras = FS.importers.rasterSTL(FS.importers.parseSTL(stl), 50);
ok(ras.nx > 40 && near(ras.zr, 5), 'STL: Dreieck gerastert');

if (fails) { console.log(`\n${fails} Fehler`); process.exit(1); }
console.log('\nAlle Prüfungen bestanden.');
