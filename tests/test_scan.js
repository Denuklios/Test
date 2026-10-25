// Präzisions-Scan: Subpixel-Kontur, Ecken, Löcher, Auto-Analyse.
require('../js/geometry.js'); require('../js/stitchgen.js'); require('../js/scan.js'); require('../js/autodigitize.js');
const HW = globalThis.HW, SC = HW.scan;
let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FEHL ') + m); if (!c) fails++; };
const W = 60, H = 60;
// Scheibe r=18 bei (30.3,29.7) als weiches Feld
const f = new Float32Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const d = Math.hypot(x - 30.3, y - 29.7) - 18; f[y * W + x] = Math.max(0, Math.min(1, 0.5 - d)); }
const rings = SC.contours(f, W, H, 0.5);
ok(rings.length === 1, 'Scheibe: eine Kontur');
let dev = 0; for (const p of rings[0]) dev = Math.max(dev, Math.abs(Math.hypot(p.x - 0.5 - 30.3, p.y - 0.5 - 29.7) - 18));
ok(dev < 0.1, `Subpixel-Abweichung ${dev.toFixed(3)} px`);
// Ring mit Loch
const g = new Float32Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const d = Math.hypot(x - 30, y - 30); g[y * W + x] = d < 20 && d > 8 ? 1 : 0; }
ok(SC.contours(g, W, H, 0.5).length === 2, 'Ring mit Loch: zwei Konturen');
// Auto-Analyse: zwei Farben
const w = 80, h = 40, data = new Uint8ClampedArray(w * h * 4);
for (let i = 0; i < w * h; i++) { const x = i % w; const c = x > 30 && x < 50 ? [200, 20, 20] : [255, 255, 255]; data.set([...c, 255], i * 4); }
const a = HW.auto.analyze({ data, width: w, height: h }, 40);
ok(a.colors === 2, `Analyse: ${a.colors} Farben`);
ok(Math.abs(a.strokeMed - 10) < 1.5, `Analyse: Strichbreite ${a.strokeMed.toFixed(1)} mm`);
process.exit(fails ? 1 : 0);
