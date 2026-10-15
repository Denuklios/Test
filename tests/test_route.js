// Prüft Ein-/Ausstieg, versteckte Laufwege und Reihenfolge. Aufruf: node tests/test_route.js
require('../js/geometry.js'); require('../js/stitchgen.js'); require('../js/satinauto.js'); require('../js/fabric.js'); require('../js/dst.js'); require('../js/dst_io.js'); require('../js/route.js');
const HW = globalThis.HW, S = HW.stitch, R = HW.route, D = HW.dst, G = HW.geo;
let fails = 0, nid = 1;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FEHL ') + m); if (!c) fails++; };
const P = (x, y, c = false) => ({ x, y, c });
const mk = (o) => ({ id: nid++, color: 0, ...o });
// wie im Programm: der Reihe nach Ein-/Ausstieg wählen, dann zusammensetzen
function build(objs, hide = true) {
  let prev = null;
  const planned = R.plan(objs);
  objs.forEach((o, i) => {
    o._route = o.type === 'fill' && prev ? R.choose(o, prev, null, false) : planned[i];
    o._st = S.generate(o, 'baumwolle');
    prev = o._st[o._st.length - 1];
  });
  return D.assemble(objs, null, { trimDist: 2, connect: hide ? R.connect : null });
}
// 1) "C" vor "A": C wurde von unten nach oben digitalisiert; A beginnt unten links
const arc = [];
for (let k = 0; k <= 8; k++) {
  const t = (60 + (240 * k) / 8) * Math.PI / 180; // von unten rechts über links nach oben rechts
  arc.push(P(10 + Math.cos(t) * 7, 10 + Math.sin(t) * 7, true), P(10 + Math.cos(t) * 9.5, 10 + Math.sin(t) * 9.5, true));
}
const C = mk({ type: 'colA', params: { ...S.DEFAULTS.satin }, points: arc });
const A = mk({ type: 'colA', params: { ...S.DEFAULTS.satin }, points: [P(24, 19.5), P(26.5, 19.5), P(29, 1), P(31, 1)] });
const cmdsCA = build([C, A]);
const cEnd = C._st[C._st.length - 1];
ok(C._route && C._route.rev === true, 'C wird umgedreht (Start oben, Ende unten)');
ok(cEnd.y > 13, `C endet unten (y=${cEnd.y.toFixed(1)}) – nahe am Fuß des A`);
const jumpCA = G.dist(cEnd, A._st[0]);
const noOpt = G.dist(S.generate({ ...C, _route: null }, 'baumwolle').slice(-1)[0], A._st[0]);
ok(jumpCA < noOpt * 0.75, `Sprung C→A ${jumpCA.toFixed(1)} mm statt ${noOpt.toFixed(1)} mm ohne Optimierung`);
void cmdsCA;
// 2) Versteckter Laufweg unter einer später gestickten Fläche
const run = () => mk({ type: 'run', params: { ...S.DEFAULTS.run }, points: [P(2, 8), P(8, 8)] });
const col = () => mk({ type: 'colC', params: { ...S.DEFAULTS.satin, width: 3 }, points: [P(31, 6), P(31, 14)] });
const big = () => mk({ type: 'fill', params: { ...S.DEFAULTS.fill }, points: [P(0, 3), P(40, 3), P(40, 17), P(0, 17)], holes: [] });
let c1 = build([run(), col(), big()]);
let s1 = D.stats(c1);
ok(s1.trims === 0 && s1.travels >= 1, `mit später gestickter Fläche: ${s1.trims} Schnitte, ${s1.travels} versteckte Wege`);
const tv = c1.filter((c) => c.travel);
ok(tv.every((c) => c.x > 0.3 && c.x < 39.7 && c.y > 3.3 && c.y < 16.7), 'Laufweg liegt vollständig unter der Fläche');
let c2 = build([run(), col()]);
ok(D.stats(c2).trims === 1 && D.stats(c2).travels === 0, 'ohne verdeckende Fläche: Fadenschnitt');
let c3 = build([run(), col(), big()], false);
ok(D.stats(c3).trims >= 1, 'versteckte Wege abschaltbar');
// 3) Reihenfolge optimieren: Objekte im Zickzack werden nach kürzestem Weg sortiert
const sq = (x) => mk({ type: 'fill', params: { ...S.DEFAULTS.fill }, points: [P(x, 0), P(x + 5, 0), P(x + 5, 5), P(x, 5)], holes: [] });
const zz = [sq(0), sq(60), sq(10), sq(50), sq(20)];
const len = (objs) => { const c = build(objs, false); let L = 0, last = null; for (const q of c) { if (q.cmd === 'jump' && last) L += G.dist(last, q); if (q.cmd !== 'trim' && q.cmd !== 'color') last = q; } return L; };
const before = len(zz.map((o) => ({ ...o })));
const opt = R.optimizeOrder(zz);
const after = len(opt);
ok(after < before * 0.7, `Sprungwege ${before.toFixed(0)} mm → ${after.toFixed(0)} mm`);
// Überlappende Objekte behalten ihre Reihenfolge
const lo = mk({ type: 'fill', params: { ...S.DEFAULTS.fill }, points: [P(0, 0), P(20, 0), P(20, 20), P(0, 20)], holes: [] });
const far = sq(80);
const hi = mk({ type: 'fill', params: { ...S.DEFAULTS.fill }, points: [P(5, 5), P(15, 5), P(15, 15), P(5, 15)], holes: [] });
const o2 = R.optimizeOrder([far, hi, lo]);
ok(o2.indexOf(hi) < o2.indexOf(lo), 'überlappende Objekte: Reihenfolge (oben/unten) bleibt erhalten');
process.exit(fails ? 1 : 0);
