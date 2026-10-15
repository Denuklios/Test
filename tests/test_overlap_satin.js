// Überlappungen entfernen auch bei Satinsäulen: verdeckte Stiche fallen weg
global.window = global;
['geometry', 'stitchgen', 'satinauto', 'autodigitize', 'boolean'].forEach((m) => require('../js/' + m + '.js'));
const S = HW.stitch, B = HW.boolean;
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FEHLER:', m); } else console.log('ok', m); };
const line = { id: 1, type: 'colC', points: [{ x: -50, y: 0 }, { x: 50, y: 0 }], params: { ...S.DEFAULTS.satin, width: 8 } };
const disc = { id: 2, type: 'fill', points: Array.from({ length: 24 }, (_, i) => ({ x: 15 * Math.cos(i / 24 * 6.283), y: 15 * Math.sin(i / 24 * 6.283), c: true })), holes: [], params: { ...S.DEFAULTS.fill } };
const res = B.trimColumn(line, [disc], 0.5);
ok(res && res.length === 2, `Satinlinie unter Kreis in 2 Stücke geteilt (${res && res.length})`);
const xs = res.map((pts) => [Math.min(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.x))]);
ok(xs[0][1] > -15.5 && xs[0][1] < -12.5 && xs[1][0] < 15.5 && xs[1][0] > 12.5, `Schnittkanten unter dem Kreisrand (${xs.map((r) => r.map((v) => v.toFixed(1)).join('..')).join(' | ')})`);
ok(B.trimColumn(line, [{ ...disc, points: disc.points.map((p) => ({ ...p, y: p.y + 100 })) }], 0.5) === null, 'ohne Überdeckung unverändert');
const big = { ...disc, points: disc.points.map((p) => ({ x: p.x * 5, y: p.y * 5, c: true })) };
ok(B.trimColumn(line, [big], 0.5).length === 0, 'ganz verdeckt → entfällt');
// schmale Säule quer über die Mitte einer breiten Satinlinie (in Längsrichtung): breite Säule wird der Länge nach geteilt
const wide = { id: 5, type: 'colC', points: [{ x: -40, y: 0 }, { x: 40, y: 0 }], params: { ...S.DEFAULTS.satin, width: 10 } };
const stripe = { id: 6, type: 'colC', points: [{ x: -20, y: 0 }, { x: 20, y: 0 }], params: { ...S.DEFAULTS.satin, width: 2 } };
const r2 = B.trimColumn(wide, [stripe], 0.3);
const ys = r2.map((pts) => [Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.y))]);
ok(r2.length === 4 || r2.length === 3, `Längsteilung: ${r2.length} Stücke (vorne ganz, zwei schmale daneben, hinten ganz)`);
ok(ys.some(([a, b]) => b < 0 && a < -4) && ys.some(([a, b]) => a > 0 && b > 4), 'schmale Stücke links und rechts des Streifens');
process.exit(fail ? 1 : 0);
