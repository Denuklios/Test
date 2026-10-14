// Prüft Formen-Verrechnung (Überlappungen, Vereinen, Messer). Aufruf: node tests/test_boolean.js
require('../js/geometry.js'); require('../js/stitchgen.js'); require('../js/satinauto.js'); require('../js/autodigitize.js'); require('../js/boolean.js');
const HW = globalThis.HW, B = HW.boolean, G = HW.geo, S = HW.stitch;
let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FEHL ') + m); if (!c) fails++; };
const P = (x, y) => ({ x, y, c: false });
const sq = (x, y, w, h) => ({ type: 'fill', params: { ...S.DEFAULTS.fill }, points: [P(x, y), P(x + w, y), P(x + w, y + h), P(x, y + h)], holes: [] });
const circ = (cx, cy, r) => ({ type: 'fill', params: { ...S.DEFAULTS.fill }, points: Array.from({ length: 24 }, (_, i) => ({ x: cx + r * Math.cos((i / 24) * 6.283), y: cy + r * Math.sin((i / 24) * 6.283), c: true })), holes: [] });
const areaOf = (sh) => Math.abs(G.signedArea(sh.outer)) - sh.holes.reduce((a, h) => a + Math.abs(G.signedArea(h)), 0);
// Kreis mitten auf Quadrat: Quadrat bekommt ein Loch (mit 0,5 mm Überlappung)
const res = B.subtract(sq(0, 0, 40, 40), [circ(20, 20, 10)], 0.5);
ok(res && res.length === 1 && res[0].holes.length === 1, 'Kreis auf Quadrat -> Quadrat mit Loch');
const holeR = Math.sqrt(Math.abs(G.signedArea(res[0].holes[0])) / Math.PI);
ok(Math.abs(holeR - 9.5) < 0.3, `Loch-Radius ${holeR.toFixed(2)} mm (10 mm − 0,5 mm Überlappung)`);
// Streifen quer über Quadrat: Quadrat zerfällt in zwei Teile
const r2 = B.subtract(sq(0, 0, 40, 40), [sq(-5, 15, 50, 10)], 0.5);
ok(r2 && r2.length === 2, 'Streifen teilt Quadrat in 2 Flächen');
// vollständig verdeckt
const r3 = B.subtract(sq(10, 10, 5, 5), [sq(0, 0, 40, 40)], 0.5);
ok(r3 && r3.length === 0, 'vollständig verdeckte Fläche verschwindet');
// keine Überlappung -> unverändert
ok(B.subtract(sq(0, 0, 10, 10), [sq(50, 50, 5, 5)], 0.5) === null, 'ohne Überlappung unverändert');
// Satinsäule als oberes Objekt
const col = { type: 'colC', params: { ...S.DEFAULTS.satin, width: 4 }, points: [P(-5, 20), P(45, 20)] };
const r4 = B.subtract(sq(0, 0, 40, 40), [col], 0.5);
ok(r4 && r4.length === 2, 'Satinlinie quer -> Fläche wird darunter ausgespart');
// Vereinen / Schnittmenge / Ausschneiden
const u = B.combine([sq(0, 0, 20, 20), sq(10, 10, 20, 20)], 'union');
ok(u.length === 1 && Math.abs(areaOf(u[0]) - 700) < 15, `Vereinen: Fläche ${areaOf(u[0]).toFixed(0)} mm² (700)`);
const it = B.combine([sq(0, 0, 20, 20), sq(10, 10, 20, 20)], 'intersect');
ok(it.length === 1 && Math.abs(areaOf(it[0]) - 100) < 8, `Schnittmenge: ${areaOf(it[0]).toFixed(0)} mm² (100)`);
const df = B.combine([sq(0, 0, 20, 20), sq(10, 10, 20, 20)], 'diff');
ok(df.length === 1 && Math.abs(areaOf(df[0]) - 300) < 10, `Ausschneiden: ${areaOf(df[0]).toFixed(0)} mm² (300)`);
// Messer
const k = B.knife(sq(0, 0, 40, 20), P(20, -5), P(20, 30));
ok(k && k.length === 2 && Math.abs(areaOf(k[0]) - areaOf(k[1])) < 10, 'Messer teilt Rechteck in zwei gleiche Hälften');
process.exit(fails ? 1 : 0);
