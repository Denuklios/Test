// Text-Effekte: Hüllform, Text auf Linie, Einzelbuchstaben
global.window = global;
['geometry', 'stitchgen', 'textfx'].forEach((m) => require('../js/' + m + '.js'));
const T = HW.textfx, G = HW.geo;
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FEHLER:', m); } else console.log('ok', m); };
const bar = (x, gi) => ({ type: 'fill', gi, points: [{ x, y: -10 }, { x: x + 8, y: -10 }, { x: x + 8, y: 0 }, { x, y: 0 }], holes: [], params: { angle: 0 } });
const mk = () => [bar(0, 0), bar(10, 1), bar(20, 2)];
let o = mk(); T.envelope(o, 'arch', 5);
const top = (ob) => Math.min(...ob.points.map((p) => p.y));
ok(top(o[1]) < top(o[0]) - 0.8, 'Bogen: Mitte höher als Rand');
o = mk(); T.envelope(o, 'pennant', 4);
const hgt = (ob) => { const b = G.bbox(ob.points); return b.y1 - b.y0; };
ok(hgt(o[2]) < hgt(o[0]) - 2, 'Wimpel: rechts niedriger');
o = mk(); T.glyphAdjust(o, { 1: { dx: 3, rot: 90 } });
const b1 = G.bbox(o[1].points);
ok(Math.abs((b1.x0 + b1.x1) / 2 - 17) < 0.2 && b1.x1 - b1.x0 > 9, 'Einzelbuchstabe verschoben und gedreht');
ok(o[1].params.angle === 90, 'Füllwinkel mitgedreht');
// Kreisbogen-Linie: alle Punkte außerhalb des Radius (Text über der Linie)
const path = Array.from({ length: 50 }, (_, i) => ({ x: 40 * Math.cos(Math.PI + (i / 49) * Math.PI), y: 40 * Math.sin(Math.PI + (i / 49) * Math.PI) }));
o = mk(); T.onPath(o, path, 1);
const rs = o.flatMap((ob) => ob.points.map((p) => Math.hypot(p.x, p.y)));
ok(Math.min(...rs) > 39.5 && Math.max(...rs) < 51, `Text auf Bogen über der Linie (r ${Math.min(...rs).toFixed(1)}–${Math.max(...rs).toFixed(1)})`);
o = mk(); T.onPath(o, path, -1);
const rs2 = o.flatMap((ob) => ob.points.map((p) => Math.hypot(p.x, p.y)));
ok(Math.max(...rs2) < 40.5, 'Text unter der Linie');
process.exit(fail ? 1 : 0);
