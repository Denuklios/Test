// Zug-/Druckausgleich: ein Kreis wird in Stichrichtung länger und quer dazu kürzer gestickt,
// damit er nach dem Einziehen/Auseinanderdrücken am Stoff wirklich rund ist.
require('../js/geometry.js'); require('../js/stitchgen.js');
const HW = globalThis.HW, S = HW.stitch;
let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FEHL ') + m); if (!c) fails++; };
const circle = Array.from({ length: 72 }, (_, i) => ({ x: 10 * Math.cos((i / 72) * 2 * Math.PI), y: 10 * Math.sin((i / 72) * 2 * Math.PI) }));
const ext = (st) => { const b = HW.geo.bbox(st); return { w: b.x1 - b.x0, h: b.y1 - b.y0 }; };
for (const ang of [0, 90]) {
  const st = S.generate({ type: 'fill', points: circle, holes: [], params: { ...S.DEFAULTS.fill, angle: ang, underlay: 'none', pull: 0.3, push: 0.3 } });
  const e = ext(st);
  const along = ang === 0 ? e.w : e.h, across = ang === 0 ? e.h : e.w;
  ok(along > 20.4, `Winkel ${ang}°: in Stichrichtung ${along.toFixed(2)} mm (> 20,4 – Zugausgleich)`);
  ok(across < 19.7, `Winkel ${ang}°: quer ${across.toFixed(2)} mm (< 19,7 – Druckausgleich)`);
}
const st0 = S.generate({ type: 'fill', points: circle, holes: [], params: { ...S.DEFAULTS.fill, angle: 0, underlay: 'none', pull: 0, push: 0 } });
const e0 = ext(st0);
ok(Math.abs(e0.w - 20) < 0.3 && Math.abs(e0.h - 20) < 0.8, `ohne Ausgleich: ${e0.w.toFixed(2)} × ${e0.h.toFixed(2)} mm`);
process.exit(fails ? 1 : 0);
