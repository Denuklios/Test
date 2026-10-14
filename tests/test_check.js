// Prüft die Stickprüfung. Aufruf: node tests/test_check.js
require('../js/geometry.js'); require('../js/stitchgen.js'); require('../js/fabric.js'); require('../js/dst.js'); require('../js/check.js');
const HW = globalThis.HW, S = HW.stitch, C = HW.check;
let fails = 0, id = 1;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FEHL ') + m); if (!c) fails++; };
const P = (x, y) => ({ x, y, c: false });
const M = C.MACHINES.industrie;
const mk = (o) => { o.id = id++; o.color = 0; o._st = S.generate(o, 'baumwolle'); return o; };
const codes = (o) => C.checkObject(o, M, 'baumwolle').map((i) => i.code);
const colA = (pts, extra = {}) => mk({ type: 'colA', params: { ...S.DEFAULTS.satin, ...extra }, points: pts });
const good = colA([P(0, 0), P(0, 4), P(20, 0), P(20, 4), P(40, 0), P(40, 4)]);
ok(codes(good).length === 0, 'saubere Säule: keine Hinweise (' + codes(good).join(',') + ')');
// Paare stark schräg: Stiche fast parallel zur Säule
const slant = colA([P(0, 0), P(12, 3), P(20, 0), P(32, 3), P(40, 0), P(52, 3)]);
ok(codes(slant).includes('winkel'), 'flacher Stichwinkel erkannt: ' + codes(slant).join(','));
// verdreht: zweites Paar vertauscht
const tw = colA([P(0, 0), P(0, 4), P(20, 4), P(20, 0), P(40, 0), P(40, 4)]);
const twi = C.checkObject(tw, M, 'baumwolle');
ok(twi.some((i) => i.code === 'verdreht'), 'verdrehte Säule erkannt');
const fix = twi.find((i) => i.code === 'verdreht').fix;
fix.apply(tw); tw._st = S.generate(tw, 'baumwolle');
ok(tw.type === 'colB' && !codes(tw).includes('verdreht'), 'Korrektur: Säule entdreht (' + codes(tw).join(',') + ')');
// zu dicht (von Hand)
const dense = colA([P(0, 0), P(0, 4), P(30, 0), P(30, 4)], { spacing: 0.15 }); dense.manual = { spacing: true }; dense._st = S.generate(dense, 'baumwolle');
ok(codes(dense).includes('dicht'), 'zu dichter Satin erkannt');
// zu breit ohne Teilung
const wide = colA([P(0, 0), P(0, 13), P(30, 0), P(30, 13)], { split: 0 }); wide.manual = { split: true }; wide._st = S.generate(wide, 'baumwolle');
ok(codes(wide).includes('breit'), 'breiter Satin ohne Teilung erkannt: ' + codes(wide).join(','));
// schmal
const thin = colA([P(0, 0), P(0, 0.4), P(30, 0), P(30, 0.4)]);
ok(codes(thin).includes('schmal'), 'zu schmaler Satin erkannt');
// Fläche zu dicht / Satin-Fläche mit langen Reihen
const f = mk({ type: 'fill', params: { ...S.DEFAULTS.fill, spacing: 0.2 }, manual: { spacing: true }, points: [P(0, 0), P(30, 0), P(30, 20), P(0, 20)], holes: [] });
ok(codes(f).includes('dicht'), 'zu dichte Fläche erkannt');
const sf = mk({ type: 'fill', params: { ...S.DEFAULTS.fill, fillType: 'satin', angle: 0, split: 0 }, points: [P(0, 0), P(30, 0), P(30, 20), P(0, 20)], holes: [] });
ok(codes(sf).includes('breit'), 'Satin-Fläche mit zu langen Stichen erkannt (Winkel)');
// Laufstich zu kurz
const r = mk({ type: 'run', params: { ...S.DEFAULTS.run, len: 0.5 }, points: [P(0, 0), P(20, 0)] });
ok(codes(r).includes('kurz'), 'zu kurzer Laufstich erkannt');
// Drei übereinanderliegende Flächen -> Stichhäufung
const sq = () => mk({ type: 'fill', params: { ...S.DEFAULTS.fill }, points: [P(0, 0), P(20, 0), P(20, 20), P(0, 20)], holes: [] });
const stack = [sq(), sq(), sq()];
const cmds = HW.dst.assemble(stack, null, {});
ok(C.checkDesign(stack, cmds, M, 'baumwolle').some((i) => i.code === 'hotspot'), 'Stichhäufung bei Überlappung erkannt');
const single = [sq()];
ok(!C.checkDesign(single, HW.dst.assemble(single, null, {}), M, 'baumwolle').some((i) => i.code === 'hotspot'), 'einzelne Fläche: keine Stichhäufung');
process.exit(fails ? 1 : 0);
