/* Tests für LaserStudio: node laserstudio/tests/test_laser.js */
const path = require('path');
const js = (f) => require(path.join(__dirname, '..', 'js', f));
global.ClipperLib = js('lib/clipper.js');
js('fonts.js'); js('core.js'); js('ttf.js'); js('shapes.js'); js('dither.js'); js('laser.js'); js('camera.js');
const FS = global.FS;
const { shapes: SH, laser: L, M, geo } = FS;

let n = 0, bad = 0;
function ok(cond, msg) { n++; if (!cond) { bad++; console.log('FEHLER:', msg); } }
function near(a, b, tol, msg) { ok(Math.abs(a - b) <= tol, `${msg}: ${a} statt ${b}`); }

function doc(objs, layers) { return { objects: objs, layers }; }
function rect(w, h, x, y, layer) { const o = SH.make('rect', { w, h, r: 0, layer }); o.tf = M.translate(x, y); return o; }
const burnLen = (moves) => { let d = 0, a = null; for (const b of moves) { if (b.x === undefined) continue; if (a && !b.rapid && b.s > 0) d += Math.hypot(b.x - a.x, b.y - a.y); a = b; } return d; };

// ---- Linie: Quadrat 20 mm → 80 mm Schnittlänge
{
  const ly = L.makeLayer('#000000', { mode: 'line', speed: 500, power: 80 });
  const p = L.plan(doc([rect(20, 20, 50, 50, ly.id)], [ly]));
  near(burnLen(p.moves), 80, 1e-6, 'Linie: Umfang');
  const gc = L.gcode(p, doc([], [ly]), { start: 'absolute' }, { sMax: 1000, w: 400, h: 400 });
  ok(/M4 S0/.test(gc), 'Linie: dynamischer Lasermodus M4');
  ok(/S800/.test(gc), 'Linie: S800 bei 80 %');
  ok(/F500/.test(gc), 'Linie: Vorschub');
  ok((gc.match(/F500/g) || []).length === 1, 'Linie: F nur einmal (modal)');
  ok(/M8/.test(gc) && /M9/.test(gc), 'Linie: Luftunterstützung an/aus');
}

// ---- Innen vor außen
{
  const ly = L.makeLayer('#000000', { mode: 'line' });
  const outer = rect(40, 40, 50, 50, ly.id), inner = rect(10, 10, 50, 50, ly.id);
  const p = L.plan(doc([outer, inner], [ly]), { start: { x: 0, y: 0 } });
  const firstBurn = p.moves.findIndex((m) => m.s > 0);
  const m = p.moves[firstBurn];
  ok(Math.abs(m.x - 50) <= 5.01 && Math.abs(m.y - 50) <= 5.01, 'Reihenfolge: inneres Loch zuerst');
}

// ---- Haltestege: 4 Stege à 1 mm → 4 mm weniger
{
  const ly = L.makeLayer('#000000', { mode: 'line', tabs: 4, tabSize: 1 });
  const p = L.plan(doc([rect(20, 20, 50, 50, ly.id)], [ly]));
  near(burnLen(p.moves), 76, 1e-3, 'Haltestege: Länge');
}

// ---- Schnittspalt: außen +kerf/2
{
  const ly = L.makeLayer('#000000', { mode: 'line', kerf: 0.2 });
  const p = L.plan(doc([rect(20, 20, 50, 50, ly.id)], [ly]));
  ok(p.bounds.w > 20.19 && p.bounds.w < 20.21, 'Schnittspalt: Kontur 0,1 mm größer je Seite');
}

// ---- Füllen: Quadrat 10×10, Abstand 0,5 → 20 Zeilen à 10 mm
{
  const ly = L.makeLayer('#000000', { mode: 'fill', interval: 0.5, overscan: 2, speed: 3000, power: 50 });
  const p = L.plan(doc([rect(10, 10, 20, 20, ly.id)], [ly]));
  near(burnLen(p.moves), 200, 1e-3, 'Füllen: Brennlänge');
  ok(p.bounds.x0 < 15 - 1.9 && p.bounds.x1 > 25 + 1.9, 'Füllen: Überfahrt links und rechts');
  const ys = new Set(p.moves.filter((m) => m.s > 0).map((m) => m.y.toFixed(3)));
  ok(ys.size === 20, 'Füllen: 20 Zeilen, ' + ys.size);
  // Kreuzschraffur verdoppelt
  ly.cross = true;
  near(burnLen(L.plan(doc([rect(10, 10, 20, 20, ly.id)], [ly])).moves), 400, 1e-3, 'Kreuzschraffur');
  ly.cross = false;
  ly.angle = 45;
  const p45 = L.plan(doc([rect(10, 10, 20, 20, ly.id)], [ly]));
  near(burnLen(p45.moves), 200, 3, 'Füllen 45°: Fläche / Abstand');
}

// ---- Füllen mit Loch (Ring): Fläche 100 - 16 = 84 mm² → 84/0,5 = 168 mm
{
  const ly = L.makeLayer('#000000', { mode: 'fill', interval: 0.5 });
  const o = SH.make('poly', { layer: ly.id, lines: [
    { pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], closed: true },
    { pts: [{ x: 3, y: 3 }, { x: 7, y: 3 }, { x: 7, y: 7 }, { x: 3, y: 7 }], closed: true },
  ] });
  near(burnLen(L.plan(doc([o], [ly])).moves), 168, 1e-3, 'Füllen mit Loch');
}

// ---- Versatzfüllung
{
  const ly = L.makeLayer('#000000', { mode: 'offset', interval: 1 });
  const p = L.plan(doc([rect(10, 10, 20, 20, ly.id)], [ly]));
  near(burnLen(p.moves), 36 + 28 + 20 + 12 + 4, 0.05, 'Versatzfüllung: 5 Umläufe');
}

// ---- Durchgänge mit Z-Absenkung
{
  const ly = L.makeLayer('#000000', { mode: 'line', passes: 3, zStep: 0.5 });
  const d = doc([rect(10, 10, 20, 20, ly.id)], [ly]);
  const p = L.plan(d);
  near(burnLen(p.moves), 120, 1e-6, 'Durchgänge: 3 × 40 mm');
  const gc = L.gcode(p, d, {}, { sMax: 1000, w: 400, h: 400 });
  ok((gc.match(/G91 G0 Z-0.5/g) || []).length === 2, 'Durchgänge: 2 × Z-Absenkung');
  ok(/G91 G0 Z1 /.test(gc), 'Durchgänge: Fokus zurück');
}

// ---- Bild: Schwarz-Weiß-Streifen, Schwelle
{
  const w = 20, h = 10, g8 = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) g8[j * w + i] = i < 10 ? 0 : 255; // linke Hälfte schwarz
  const ly = L.makeLayer('#000000', { mode: 'image', interval: 0.5, speed: 2000, power: 60, overscan: 1 });
  const img = SH.make('image', { w: 20, h: 10, px: L.encodePx(w, h, g8), img: { mode: 'threshold' }, layer: ly.id });
  img.tf = M.translate(50, 50);
  const p = L.plan(doc([img], [ly]));
  near(burnLen(p.moves), 20 * 10, 1e-3, 'Bild: linke Hälfte (10 mm) × 20 Zeilen');
  ok(p.moves.every((m) => m.x === undefined || m.s === 0 || m.x <= 50 + 1e-6), 'Bild: nur links gebrannt');
  // Graustufen: mittleres Grau → Leistung zwischen min und max
  const g2 = new Uint8Array(w * h).fill(128);
  const im2 = SH.make('image', { w: 20, h: 10, px: L.encodePx(w, h, g2), img: { mode: 'grayscale' }, layer: ly.id });
  im2.tf = M.translate(50, 50);
  ly.minPower = 10;
  const p2 = L.plan(doc([im2], [ly]));
  const ss = p2.moves.filter((m) => m.s > 0).map((m) => m.s);
  ok(ss.length && ss.every((s) => s > 0.1 && s < 0.6), 'Graustufen: Leistung zwischen Min und Max');
  // Jarvis-Raster von 50-%-Grau: etwa die Hälfte der Pixel
  const d = FS.dither.apply(new Float32Array(400).fill(0.5), 20, 20, 'jarvis');
  const on = d.reduce((a, v) => a + v, 0);
  ok(on > 160 && on < 240, 'Jarvis: ca. 50 % Punkte bei Grau, ' + on);
  for (const mode of Object.keys(FS.dither.MODES)) {
    const r = FS.dither.apply(new Float32Array(400).fill(0.3), 20, 20, mode);
    ok(r.length === 400 && r.every((v) => v >= 0 && v <= 1), 'Rastermodus ' + mode);
  }
  // gedrehtes Bild (90°): Ausdehnung vertauscht
  const im3 = SH.make('image', { w: 20, h: 10, px: L.encodePx(w, h, g8), img: { mode: 'threshold' }, layer: ly.id });
  im3.tf = M.mul(M.translate(50, 50), M.rotate(Math.PI / 2));
  ly.minPower = 0;
  const p3 = L.plan(doc([im3], [ly]));
  const burn = p3.moves.filter((m) => m.s > 0);
  const by = geo.bounds([burn]);
  ok(by.h > 8 && by.h < 11 && by.w < 11, 'Bild gedreht: schwarzer Teil liegt quer');
}

// ---- Materialtest
{
  const t = L.materialTest({ cols: 5, rows: 4, pMin: 20, pMax: 100, vMin: 500, vMax: 3000, cell: 8, gap: 2, font: 'Anton' });
  const boxes = t.objects.filter((o) => o.ovr);
  ok(boxes.length === 20, 'Materialtest: 20 Felder');
  ok(boxes.some((o) => o.ovr.power === 100 && o.ovr.speed === 500), 'Materialtest: Ecke 100 % / 500');
  const p = L.plan({ objects: t.objects, layers: t.layers });
  const sset = new Set(p.moves.filter((m) => m.s > 0).map((m) => Math.round(m.s * 100)));
  ok([20, 40, 60, 80, 100].every((v) => sset.has(v)), 'Materialtest: alle Leistungen im Plan');
}

// ---- Ursprung / Startposition
{
  const mp = L.mapper({ start: 'absolute' }, { w: 400, h: 300, origin: 'ul' });
  const q = mp({ x: 10, y: 20 });
  ok(q.x === 10 && q.y === 280, 'Ursprung links oben: Y gespiegelt');
  const mc = L.mapper({ start: 'current', anchor: 'c', box: { x0: 10, y0: 10, x1: 30, y1: 50 } }, { w: 400, h: 300 });
  const c = mc({ x: 20, y: 30 });
  ok(c.x === 0 && c.y === 0, 'Aktuelle Position: Mitte des Auftrags = 0,0');
  const ly = L.makeLayer('#000000', { mode: 'line' });
  const d = doc([rect(20, 20, 50, 50, ly.id)], [ly]);
  const gc = L.gcode(L.plan(d), d, { start: 'current', anchor: 'll', box: { x0: 40, y0: 40, x1: 60, y1: 60 } }, { sMax: 1000, w: 400, h: 400 });
  ok(/G92 X0 Y0/.test(gc) && /G92\.1/.test(gc), 'Aktuelle Position: G92 und Rücksetzen');
  const mv = L.parseGcode(gc);
  const b = geo.bounds([mv.filter((m) => m.s > 0)]);
  ok(Math.abs(b.x0) < 1e-6 && Math.abs(b.y0) < 1e-6 && Math.abs(b.x1 - 20) < 1e-6, 'Aktuelle Position: Koordinaten ab Bezugspunkt');
}

// ---- G-Code lesen
{
  const mv = L.parseGcode('G0 X10 Y10\nM4 S500\nG1 X20 F1000\nG1 Y20 S0\nM5\n');
  ok(mv.length === 3 && mv[1].s === 0.5 && mv[2].s === 0 && mv[0].rapid, 'G-Code lesen');
}

// ---- Laufzeit
{
  const t = L.estimate([{ x: 0, y: 0, s: 0 }, { x: 100, y: 0, s: 1, f: 600 }], { rapid: 6000, accel: 1000 });
  near(t.sec, 10 + 0.01, 0.05, 'Laufzeit 100 mm bei 600 mm/min');
}

// ---- Text im Bogen
{
  const t = SH.make('text', { text: 'BOGEN', font: 'Anton', size: 10, align: 'left', arc: 30 });
  const ls = SH.lines(t);
  ok(ls.length > 0, 'Bogentext: Umrisse');
  const flat = SH.make('text', { text: 'BOGEN', font: 'Anton', size: 10, align: 'left' });
  const bf = geo.bounds(SH.lines(flat).map((l) => l.pts)), bb = geo.bounds(ls.map((l) => l.pts));
  ok(bb.h > bf.h + 0.5, 'Bogentext: höher als gerade');
}

// ---- Rahmen / Hülle
{
  const h = L.hull([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 10 }, { x: 0, y: 10 }]);
  ok(h.length === 4, 'Konvexe Hülle');
  const fg = L.frameGcode(h, { start: 'absolute' }, { w: 400, h: 400, sMax: 1000 }, { power: 1 });
  ok(/M3 S10/.test(fg) && /M5/.test(fg), 'Rahmen mit schwachem Laser');
}

// ---- Kamera: Homographie mit Höhenausgleich
{
  const H = FS.camera.homography([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], [{ x: 0.1, y: 0.9 }, { x: 0.9, y: 0.9 }, { x: 0.9, y: 0.1 }, { x: 0.1, y: 0.1 }]);
  const q = FS.camera.applyH(H, { x: 50, y: 50 });
  near(q.x, 0.5, 1e-9, 'Homographie Mitte x'); near(q.y, 0.5, 1e-9, 'Homographie Mitte y');
  const p = FS.camera.liftPoint({ x: 100, y: 50 }, { x: 50, y: 50 }, 500, 10);
  near(p.x, 50 + 50 * 500 / 490, 1e-9, 'Materialhöhe: Punkt wandert nach außen');
}

// ---- Laser-Auftrag an simulierte GRBL-Maschine streamen: alles gesendet, kein falscher Halt bei M3/M4/M5/M8/M9
(async () => {
  js('machine.js');
  const ly = L.makeLayer('#000000', { mode: 'fill', interval: 0.5, air: true });
  const ly2 = L.makeLayer('#ff0000', { mode: 'line', passes: 2, air: false });
  const d = doc([rect(10, 10, 20, 20, ly.id), rect(20, 20, 40, 40, ly2.id)], [ly, ly2]);
  const gc = L.gcode(L.plan(d), d, {}, { sMax: 1000, w: 400, h: 400 });
  const g = new FS.Grbl();
  const t = { lines: [], buf: '' };
  t.write = async (bytes) => { for (const b of bytes) { if (b === 10) { t.lines.push(t.buf); t.buf = ''; setTimeout(() => t.ondata('ok\r\n'), 0); } else if (b === 0x3f) t.ondata('<Idle|MPos:0,0,0|FS:0,0>\r\n'); else if (b >= 32 && b < 127) t.buf += String.fromCharCode(b); } };
  t.close = async () => {};
  g.attach(t); g.finishConnect('usb', 20);
  const done = new Promise((r) => g.on('jobdone', r));
  g.startJob(gc, 'Test');
  const j = await Promise.race([done, new Promise((r) => setTimeout(() => r(null), 5000))]);
  clearInterval(g.poll);
  const want = gc.split('\n').map((l) => l.replace(/;.*/, '').trim()).filter(Boolean).length;
  ok(j && !j.aborted, 'Streamen: Auftrag fertig');
  ok(t.lines.length === want, `Streamen: alle ${want} Zeilen gesendet (${t.lines.length})`);
  ok(t.lines.includes('M8') && t.lines.includes('M9'), 'Streamen: Luft an/aus gesendet');
  console.log(`${n - bad} von ${n} Tests bestanden.`);
  process.exit(bad ? 1 : 0);
})();
