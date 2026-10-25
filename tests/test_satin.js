// Prüft die Erkennung drehender Satinsäulen. Aufruf: node tests/test_satin.js
require('../js/geometry.js'); require('../js/stitchgen.js'); require('../js/dst.js'); require('../js/dst_io.js'); require('../js/satinauto.js'); require('../js/autodigitize.js');
const HW = globalThis.HW, G = HW.geo;
let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FEHL ') + m); if (!c) fails++; };
const res = 10; // Pixel pro mm
function run(name, w, h, inside, expect) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(inside(x / res, y / res) ? [0, 0, 0, 255] : [0, 0, 0, 0], (y * w + x) * 4);
  const r = HW.auto.autoDigitize({ width: w, height: h, data }, { colors: 1, widthMM: w / res, originX: 0, originY: 0, minAreaMM2: 0.5, removeBg: false });
  const types = r.objects.map((o) => o.type);
  const cols = r.objects.filter((o) => o.type === 'colA');
  ok(expect(types, cols), `${name}: ${types.join(',')}`);
  // Stiche müssen quer zur Strichrichtung liegen: Satinstich-Länge ~ Strichbreite
  for (const o of cols) {
    const st = HW.stitch.generate({ type: 'colA', points: o.points, params: o.params });
    const lens = [];
    for (let i = 1; i < st.length; i++) lens.push(G.dist(st[i - 1], st[i]));
    lens.sort((a, b) => a - b);
    o._med = lens[Math.floor(lens.length * 0.75)];
    // kein Einstich außerhalb der Form (Toleranz für Zugkompensation)
    const out = st.filter((p) => !inside(p.x, p.y) && !inside(p.x + 0.45, p.y) && !inside(p.x - 0.45, p.y) && !inside(p.x, p.y + 0.45) && !inside(p.x, p.y - 0.45)).length;
    ok(out <= st.length * 0.02, `  ${name}: ${st.length} Stiche, ${out} außerhalb, typ. Stichlänge ${o._med.toFixed(2)} mm`);
  }
  return cols;
}
// Ring Ø 20 mm, Strichbreite 2 mm
let c = run('Ring', 260, 260, (x, y) => { const d = Math.hypot(x - 13, y - 13); return d < 11 && d > 9; }, (t, cols) => cols.length === 1);
ok(c[0] && Math.abs(c[0]._med - 2.1) < 0.6, '  Ring: Stiche quer (≈ Breite)');
// Bogen (Halbkreis), Breite 3 mm
c = run('Bogen', 300, 200, (x, y) => { const d = Math.hypot(x - 15, y - 17); return y < 17 && d < 13.5 && d > 10.5; }, (t, cols) => cols.length === 1);
ok(c[0] && Math.abs(c[0]._med - 3.1) < 0.8, '  Bogen: Stiche quer (≈ Breite)');
// L
run('L', 200, 260, (x, y) => (x > 3 && x < 6 && y > 3 && y < 23) || (x > 3 && x < 17 && y > 20 && y < 23), (t, cols) => cols.length >= 1 && cols.length <= 2);
// T
run('T', 220, 240, (x, y) => (x > 2 && x < 20 && y > 2 && y < 5) || (x > 9.5 && x < 12.5 && y > 2 && y < 22), (t, cols) => cols.length === 2);
// breite Fläche bleibt Tatami
run('Fläche', 200, 200, (x, y) => x > 2 && x < 18 && y > 2 && y < 18, (t) => t.length === 1 && t[0] === 'fill');
// Verzweigte Buchstaben (E-Form) bleiben Satin; Säulen überlappen sich nicht (jeder Strich hat seinen Bereich)
{
  const w = 240, h = 260, data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { const x = (i % w) / 10, y = Math.floor(i / w) / 10; const on = (x > 2 && x < 5 && y > 2 && y < 24) || (x > 2 && x < 20 && y > 2 && y < 5) || (x > 2 && x < 18 && y > 11 && y < 14) || (x > 2 && x < 20 && y > 21 && y < 24); data.set(on ? [0, 0, 0, 255] : [255, 255, 255, 255], i * 4); }
  const r = HW.auto.autoDigitize({ width: w, height: h, data }, { colors: 2, widthMM: 24, originX: 0, originY: 0, minAreaMM2: 0.5, removeBg: true });
  ok(r.objects.length >= 1 && r.objects.every((o) => o.type === 'colA'), 'E-Form: nur Satinsäulen (' + r.objects.map((o) => o.type).join(',') + ')');
  let sum = 0;
  for (const o of r.objects) { const L = o.points.filter((_, i) => i % 2 === 0), R = o.points.filter((_, i) => i % 2 === 1).reverse(); sum += Math.abs(HW.geo.signedArea(L.concat(R))); }
  const area = 66 + 45 + 39 + 45; // Stamm + drei Balken
  ok(sum > 0.9 * area && sum < 1.12 * area, `E-Form: Säulenfläche ${sum.toFixed(0)} mm² ≈ Form ${area} mm² (keine Überlappung)`);
}
process.exit(fails ? 1 : 0);
