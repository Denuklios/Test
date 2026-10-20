// Prüft Fräsbahnen und G-Code. Aufruf: node tests/test_cam.js
require('../js/core.js'); require('../js/fonts.js'); require('../js/ttf.js'); require('../js/shapes.js');
require('../js/tools.js'); require('../js/importers.js'); require('../js/cam.js'); require('../js/gcode.js'); require('../js/sim.js'); require('../js/camera.js');
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

// Relief mit Trichter und Verlauf (schwarz = tief): kein Eilgang durch stehendes Material
{
  const W = 300, H = 200, f = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 1;
    const d = Math.hypot(x - 90, y - 100);
    if (d < 70) v = d / 70;
    if (x > 180 && x < 280 && y > 40 && y < 160) v = (x - 180) / 100;
    f[y * W + x] = v;
  }
  const o = FS.relief.makeRelief('g', W, H, f, 240, 160, 5);
  o.tf = FS.M.translate(150, 100);
  const st = { ...stock, w: 300, h: 200, t: 18 };
  const c3 = { objects: [o], tools, stock: st, machine };
  const g = FS.gcode.build([FS.cam.compute(FS.cam.makeOp('relief_rough', [o.id], 't1'), c3)], c3);
  const sim = FS.sim.create(st);
  FS.sim.run(sim, g.moves, null, Infinity);
  ok(sim.warnings.size === 0, 'Relief aus Graustufenbild: keine Eilgänge im Material');
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

// Reihenfolge: Buchstabe für Buchstabe fertig (alle Tiefen), dann der nächste – in Leserichtung
{
  const mkText = (text, extra = {}) => { const o = S.make('text', { text, font: 'Archivo Black', size: 40, align: 'left', spacing: 0, lineHeight: 1.3, ...extra }); o.tf = FS.M.translate(10, 150); return o; };
  const shapesOf = (o) => FS.poly.nest(S.rings([o]));
  // zu welchem Buchstaben gehört ein Punkt? (nächster Umriss)
  const letterOf = (shapes, q) => {
    let best = -1, bd = Infinity;
    shapes.forEach((sh, i) => { for (const r of [sh.outer, ...sh.holes]) for (let k = 0; k < r.length; k++) { const d = G.segDist(q, r[k], r[(k + 1) % r.length]); if (d < bd) { bd = d; best = i; } } });
    return best;
  };
  const runs = (shapes, chains) => {
    const seq = [];
    for (const ch of chains) for (const q of ch.pts) { if (q.rapid) continue; const l = letterOf(shapes, q); if (seq[seq.length - 1] !== l) seq.push(l); }
    return seq;
  };
  const cx = (sh) => G.bounds([sh.outer]).x0 + G.bounds([sh.outer]).w / 2;
  const cy = (sh) => G.bounds([sh.outer]).y0 + G.bounds([sh.outer]).h / 2;
  const t1 = mkText('Hallo');
  const sh1 = shapesOf(t1);
  const readOrder1 = sh1.map((_, i) => i).sort((a2, b2) => cx(sh1[a2]) - cx(sh1[b2]));
  const ctx5 = { objects: [t1], tools, stock: { ...stock, w: 300, h: 200, t: 12 }, machine };
  const check = (name, res, shapes, expected) => {
    const seq = runs(shapes, res.chains);
    ok(seq.length === shapes.length && seq.every((v, i) => v === expected[i]), `${name}: ${seq.length} Buchstaben nacheinander, jeder nur einmal, von links nach rechts (${seq.join(',')})`);
  };
  const levelsIn = (res) => new Set(res.chains.flatMap((c) => c.pts.map((q) => +q.z.toFixed(2)))).size;
  let o5 = FS.cam.makeOp('pocket', [t1.id], 't1'); o5.depth = 6; o5.ramp = true;
  let r5 = FS.cam.compute(o5, ctx5);
  ok(r5.chains.flatMap((c) => c.pts).some((q) => near(q.z, -6, 1e-6)), 'Tasche Text: erreicht die volle Tiefe (6 mm)');
  check('Tasche (Spirale)', r5, sh1, readOrder1);
  o5.strategy = 'raster'; r5 = FS.cam.compute(o5, ctx5);
  check('Tasche (Zeilen)', r5, sh1, readOrder1);
  const o6 = FS.cam.makeOp('engrave', [t1.id], 't6'); o6.depth = 1;
  check('Gravieren', FS.cam.compute(o6, ctx5), sh1, readOrder1);
  // V-Carving mit Ausräumen (Ausräum-Abschnitt Buchstabe für Buchstabe)
  const o7 = FS.cam.makeOp('vcarve', [t1.id], 't6'); o7.maxDepth = 2; o7.clearToolId = 't1';
  const r7 = FS.cam.compute(o7, ctx5);
  check('V-Carving', r7, sh1, readOrder1);
  ok(r7.clear && r7.clear.chains.length > 0, 'V-Carving: Ausräumen vorhanden');
  check('V-Carving Ausräumen', { chains: r7.clear.chains }, sh1.filter((sh) => G.bounds([sh.outer]).w > 12), readOrder1.filter((i) => G.bounds([sh1[i].outer]).w > 12).map((i, k, arr) => i).map((i) => sh1.filter((sh) => G.bounds([sh.outer]).w > 12).indexOf(sh1[i])));
  // Kontur außen: Buchstaben auseinander ziehen, damit jeder seine eigene Bahn hat; Löcher vor der Außenkontur
  const t2 = mkText('Hao', { size: 60, spacing: 12 });
  const sh2 = shapesOf(t2);
  const o8 = FS.cam.makeOp('profile', [t2.id], 't1'); o8.depth = 4; o8.ramp = false; o8.tabs = false;
  const r8 = FS.cam.compute(o8, { ...ctx5, objects: [t2] });
  const lettersOfChains = r8.chains.map((ch) => letterOf(sh2, ch.pts[ch.pts.length - 1]));
  const nondecr = lettersOfChains.every((v, i) => i === 0 || v >= lettersOfChains[i - 1]);
  const holesN = sh2.reduce((n, sh) => n + sh.holes.length, 0);
  ok(nondecr && r8.chains.length >= sh2.length + 1, `Kontur: Teil für Teil in Leserichtung (Bahnen je Buchstabe ${lettersOfChains.join(',')}), ${holesN} Löcher`);
  // Reihenfolge jedes Teils: Loch zuerst, Außenkontur zuletzt (Außenbahn ist die größte)
  const sizeOf = (ch) => G.bounds([ch.pts]).w * G.bounds([ch.pts]).h;
  let holeFirst = true;
  sh2.forEach((sh, li) => { const ch = r8.chains.filter((c, i) => lettersOfChains[i] === li); if (ch.length > 1 && sizeOf(ch[ch.length - 1]) < sizeOf(ch[0])) holeFirst = false; });
  ok(holeFirst, 'Kontur: bei Buchstaben mit Loch zuerst das Loch, zuletzt die Außenkontur');
  // zwei Zeilen: erst die obere, dann die untere (Lesereihenfolge)
  const t3 = mkText('Hi\nWo', { size: 35 });
  const sh3 = shapesOf(t3);
  const o9 = FS.cam.makeOp('pocket', [t3.id], 't1'); o9.depth = 3;
  const r9 = FS.cam.compute(o9, { ...ctx5, objects: [t3] });
  const seq3 = runs(sh3, r9.chains);
  const midY = (Math.max(...sh3.map(cy)) + Math.min(...sh3.map(cy))) / 2;
  const rows = seq3.map((i) => (cy(sh3[i]) > midY ? 0 : 1));
  const sorted = rows.every((v, i) => i === 0 || v >= rows[i - 1]);
  const inRow = [0, 1].every((rw) => { const xs = seq3.filter((i) => rows[seq3.indexOf(i)] === rw).map((i) => cx(sh3[i])); return xs.every((v, i) => i === 0 || v >= xs[i - 1]); });
  ok(sorted && inRow && seq3.length === sh3.length, `Zwei Zeilen: obere Zeile zuerst, jede von links nach rechts (${seq3.length} Teile)`);
  // Bohrungen in Leserichtung
  const hs = [[80, 20], [20, 20], [50, 60], [20, 60], [80, 60]].map(([x, y]) => { const e2 = S.make('ellipse', { rx: 2, ry: 2 }); e2.tf = FS.M.translate(x, y); return e2; });
  const rd = FS.cam.compute(FS.cam.makeOp('drill', hs.map((h) => h.id), 't10'), { ...ctx5, objects: hs });
  const order = rd.chains.map((c) => `${Math.round(c.pts[0].x)},${Math.round(c.pts[0].y)}`).join(' ');
  ok(order === '20,60 50,60 80,60 20,20 80,20', 'Bohren: obere Reihe zuerst, jede von links nach rechts (' + order + ')');
}

// Kamera: Entzerrung
{
  const C = FS.camera;
  const pts = [{ x: 0.2, y: 0.8 }, { x: 0.85, y: 0.75 }, { x: 0.8, y: 0.2 }, { x: 0.15, y: 0.25 }];
  const H = C.homography([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }], pts);
  const q = C.applyH(H, { x: 100, y: 50 });
  ok(near(q.x, 0.8, 1e-9) && near(q.y, 0.2, 1e-9), 'Kamera: Homographie trifft die Bezugspunkte');
  // Kamerabild: linke Hälfte des Werkstücks schwarz, rechte weiß -> nach dem Entzerren wieder links/rechts
  const sw = 200, sh = 200, data = new Uint8ClampedArray(sw * sh * 4);
  const Hi = C.homography(pts, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }]);
  for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) {
    const m = C.applyH(Hi, { x: (i + 0.5) / sw, y: (j + 0.5) / sh });
    const v = m.x < 50 ? 0 : 255;
    data.set([v, v, v, 255], (j * sw + i) * 4);
  }
  const w = C.warp({ data, w: sw, h: sh }, pts, { w: 100, h: 50 }, 1);
  const px = (x, y) => w.data[((50 - 1 - y) * w.w + x) * 4];
  ok(w.w === 100 && px(10, 25) < 30 && px(90, 25) > 225 && px(30, 5) < 30 && px(70, 45) > 225, 'Kamera: Bild wird aufs Werkstück entzerrt');
}

// Konischer Kugelfräser: Profil (Kugel geht tangential in den Kegel über)
{
  const tb = tools.find((t) => t.id === 't11');
  const pr = FS.tools.profile(tb);
  const rb = 0.25, a = (15 * Math.PI) / 180, r0 = rb * Math.cos(a);
  ok(pr(0) === 0 && near(pr(r0), rb * (1 - Math.sin(a)), 1e-9) && near(pr(r0 + 0.001) - pr(r0), 0.001 / Math.tan(a), 1e-4) && pr(2) === Infinity, 'Konischer Kugelfräser: Profil stetig, Kegel 15° je Seite, Schaft 3,175');
  ok(FS.tools.effD(tb) === 0.5 && FS.tools.cutParams(tb, 'weichholz', machine).rpm <= machine.maxRpm, 'Konischer Kugelfräser: Überlappung nach Spitze');
}

// 3D-Restmaterial: feine Rillen, die der 3,175er Kugelfräser nicht erreicht
{
  const N = 240, f = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = i / (N - 1), y = j / (N - 1);
    let v = 0.4 + 0.6 * Math.exp(-((x - 0.5) ** 2 + (y - 0.5) ** 2) * 6);
    if (Math.abs(Math.sin(x * Math.PI * 12)) < 0.35) v -= 0.25; // schmale Rillen (ca. 0,75 mm breit, 1 mm tief)
    f[j * N + i] = Math.max(0, v);
  }
  const rel2 = FS.relief.makeRelief('Rillen', N, N, f, 40, 40, 4);
  rel2.tf = FS.M.translate(60, 60);
  const st = { ...stock, w: 120, h: 120 };
  const c4 = { objects: [rel2], tools, stock: st, machine };
  const fin = FS.cam.compute(FS.cam.makeOp('relief_finish', [rel2.id], 't8'), c4);
  const restOp = FS.cam.makeOp('relief_rest', [rel2.id], 't11'); restOp.refToolId = 't8';
  const t0 = Date.now();
  const rest = FS.cam.compute(restOp, c4);
  ok(rest.chains.length > 0 && rest.warnings.length === 0, `Restmaterial: Bahnen nur in den Rillen (${Date.now() - t0} ms)`);
  const g = FS.gcode.build([fin, rest], c4);
  const sim = FS.sim.create(st, 0.1);
  const S0 = FS.cam.reliefSampler(rel2);
  const err = () => {
    let sum = 0, n = 0, gouge = 0;
    for (let y = 45; y <= 75; y += 0.1) for (let x = 45; x <= 75; x += 0.1) {
      const w = S0.at(x, y), h = FS.sim.heightAt(sim, x, y);
      if (w === null) continue;
      if (h < w - 0.08) gouge++;
      if (Math.abs(Math.sin(((x - 40) / 40) * Math.PI * 12)) < 0.3) { sum += h - w; n++; } // nur in den Rillen
    }
    return { mean: sum / n, gouge };
  };
  FS.sim.run(sim, g.moves.filter((m) => m.op === 0), null, Infinity);
  const e1 = err();
  FS.sim.run(sim, g.moves, null, Infinity);
  const e2 = err();
  // Werkzeugpositionen direkt prüfen (seitliche Toleranz = Rasterweite 0,1 mm, wie bei Höhenkarten-CAM üblich)
  const tool = tools.find((t) => t.id === 't11'), pr = FS.tools.profile(tool), R = tool.d / 2;
  let worst = 0;
  const pts = rest.chains.flatMap((c) => c.pts).filter((q) => !q.rapid);
  for (let k = 0; k < pts.length; k += Math.max(1, Math.floor(pts.length / 800))) {
    const q = pts[k];
    let need = -Infinity;
    for (let dy = -R; dy <= R; dy += 0.025) for (let dx = -R; dx <= R; dx += 0.025) {
      const rr = Math.hypot(dx, dy);
      if (rr + 0.1 > R) continue;
      const h = S0.at(q.x + dx, q.y + dy);
      need = Math.max(need, (h === null ? 0 : h) - pr(rr + 0.1));
    }
    worst = Math.max(worst, need - q.z);
  }
  ok(e2.mean < e1.mean * 0.6 && worst < 0.03 && sim.warnings.size === 0, `Restmaterial: Rest in den Rillen ${e1.mean.toFixed(2)} → ${e2.mean.toFixed(2)} mm, nicht zu tief (${worst.toFixed(3)}), keine Eilgänge im Material`);
}

// 800-W-Fräsmotor mit Drehregler
{
  const m8 = FS.tools.MACHINES.ttc450_800, m80 = FS.tools.MACHINES.ttc450;
  const t1 = tools.find((t) => t.id === 't1');
  const a = FS.tools.cutParams(t1, 'weichholz', m80), b = FS.tools.cutParams(t1, 'weichholz', m8);
  ok(b.stepdown > a.stepdown * 2 && b.stepdown <= t1.d && b.feed > a.feed && b.feed <= m8.maxFeed, `800 W: Zustellung ${a.stepdown} → ${b.stepdown} mm, Vorschub ${a.feed} → ${b.feed} mm/min`);
  ok(b.rpm >= 10000 && b.rpm <= 30000 && FS.tools.cutParams(tools.find((t) => t.id === 't3'), 'weichholz', m8).rpm > b.rpm, `800 W: Drehzahl 3,175 mm = ${b.rpm}, kleine Fräser schneller`);
  ok(FS.tools.dialFor(10000, m8).step === 1 && FS.tools.dialFor(30000, m8).step === 6 && FS.tools.dialFor(18000, m8).step === 3, 'Drehregler: Stufen 1–6 von 10.000 bis 30.000 U/min');
  const c8 = { ...ctx, machine: m8 };
  const g8 = FS.gcode.build([FS.cam.compute(FS.cam.makeOp('profile', [sq.id], 't1'), c8), FS.cam.compute(FS.cam.makeOp('vcarve', [small.id], 't7'), c8)], c8);
  ok(/\(DREHREGLER Stufe \d/.test(g8.text) && /^M3 S1000$/m.test(g8.text) && /WERKZEUGWECHSEL:.*DREHREGLER Stufe/.test(g8.text), 'G-Code 800 W: Motor ein/aus, Reglerstufe als Hinweis und beim Werkzeugwechsel');
}

if (fails) { console.log(`\n${fails} Fehler`); process.exit(1); }
console.log('\nAlle Prüfungen bestanden.');
