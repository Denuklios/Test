// Prüft die Stoff-Automatik. Aufruf: node tests/test_fabric.js
require('../js/geometry.js'); require('../js/stitchgen.js'); require('../js/fabric.js'); require('../js/dst.js'); require('../js/dst_io.js');
const HW = globalThis.HW, S = HW.stitch, F = HW.fabric;
let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FEHL ') + m); if (!c) fails++; };
const P = (x, y) => ({ x, y, c: false });
const col = (w) => ({ type: 'colA', params: { ...S.DEFAULTS.satin }, points: [P(0, 0), P(0, w), P(30, 0), P(30, w)] });
const fill = () => ({ type: 'fill', params: { ...S.DEFAULTS.fill }, points: [P(0, 0), P(40, 0), P(40, 30), P(0, 30)], holes: [] });
const count = (o, fab) => S.generate(o, fab).length;
// Satin: schmal lockerer als breit (Abstand), Unterlage nach Breite
const e1 = F.effective(col(1), 'baumwolle').params, e5 = F.effective(col(5), 'baumwolle').params;
ok(e1.spacing > e5.spacing, `Abstand schmal ${e1.spacing} > breit ${e5.spacing}`);
ok(e1.underlay === 'none' && e5.underlay === 'edge+zigzag', `Unterlage schmal "${e1.underlay}", breit "${e5.underlay}"`);
ok(e5.pull > e1.pull, `Zugausgleich wächst mit Breite (${e1.pull} → ${e5.pull})`);
// Stoffe unterscheiden sich
const leder = count(col(4), 'leder'), frottee = count(col(4), 'frottee'), tshirt = F.effective(col(4), 'tshirt').params;
ok(leder < frottee, `Leder weniger Stiche (${leder}) als Frottee (${frottee})`);
ok(tshirt.pull > F.effective(col(4), 'jeans').params.pull, `T-Shirt mehr Zugausgleich (${tshirt.pull}) als Jeans`);
ok(count(fill(), 'leder') < count(fill(), 'baumwolle'), 'Tatami auf Leder lockerer');
// Handwerte bleiben
const m = col(4); m.params.spacing = 0.33; m.manual = { spacing: true };
ok(F.effective(m, 'leder').params.spacing === 0.33, 'von Hand gesetzter Abstand bleibt');
const off = col(4); off.autoFab = false;
ok(F.effective(off, 'leder').params.spacing === 0.4, 'Automatik abschaltbar');
// Vlies-Empfehlung
const small = F.recommend('tshirt', [], { stitches: 1800, w: 60, h: 40 });
const big = F.recommend('tshirt', [fill()], { stitches: 30000, w: 200, h: 200 });
ok(small.lagen === 1 && big.lagen >= 2, `Vlieslagen T-Shirt: klein ${small.lagen}, groß ${big.lagen} (${big.why.join(', ')})`);
ok(F.recommend('frottee', [], { stitches: 3000, w: 60, h: 40 }).topper.startsWith('Ja'), 'Frottee: Topper empfohlen');
process.exit(fails ? 1 : 0);
