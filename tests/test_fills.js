// Füllarten, 3D-Puff
global.window = global;
['geometry', 'stitchgen', 'satinauto', 'autodigitize', 'boolean', 'fills', 'dst', 'dst_io'].forEach((m) => require('../js/' + m + '.js'));
const S = HW.stitch, G = HW.geo;
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FEHLER:', m); } else console.log('ok', m); };
const circle = (r, cx = 0, cy = 0, n = 48) => Array.from({ length: n }, (_, i) => ({ x: cx + r * Math.cos((2 * Math.PI * i) / n), y: cy + r * Math.sin((2 * Math.PI * i) / n), c: true }));
const fill = (ft, extra = {}) => ({ id: 1, type: 'fill', points: circle(15), holes: [], params: { ...S.DEFAULTS.fill, underlay: 'none', fillType: ft, ...extra } });
const maxLen = (st) => { let m = 0; for (let i = 1; i < st.length; i++) if (!st[i].j) m = Math.max(m, G.dist(st[i - 1], st[i])); return m; };
const inside = (st, r) => st.every((p) => Math.hypot(p.x, p.y) <= r + 0.3);
for (const ft of ['tatami', 'contour', 'spiral', 'wave', 'pattern', 'gradient', 'cross', 'knock']) {
  const st = S.generate(fill(ft, ft === 'knock' ? { spacing: 1.6 } : {}));
  ok(st.length > 50 && inside(st, ft === 'cross' ? 15 + 2.5 * 0.71 : 15), `${ft}: ${st.length} Stiche, innerhalb`);
  ok(maxLen(st) < 7.5, `${ft}: längster Stich ${maxLen(st).toFixed(1)} mm`);
}
const t = S.generate(fill('tatami')).length, gr = S.generate(fill('gradient', { gradEnd: 2 })).length;
ok(gr < t * 0.6, `Verlauf spart Stiche (${gr} statt ${t})`);
const sp = S.generate(fill('spiral', { spacing: 1 }));
ok(sp.filter((p) => p.j).length === 0, 'Spirale ohne Sprünge');
const cr = S.generate(fill('cross', { crossSize: 3 }));
ok(cr.length > 4 * 50, 'Kreuzstich: viele X');
// Fläche mit Loch: Kontur läuft auch um das Loch
const ring = { ...fill('contour'), holes: [circle(5).map((p) => ({ ...p }))] };
const cst = S.generate(ring);
ok(cst.every((p) => Math.hypot(p.x, p.y) >= 4.7), 'Kontur: Loch bleibt frei');
// Puff: Enden werden mehrfach gestochen
const col = { id: 2, type: 'colC', points: [{ x: 0, y: 0 }, { x: 30, y: 0 }], params: { ...S.DEFAULTS.satin, width: 5, underlay: 'none' } };
const a = S.generate(col).length, b = S.generate({ ...col, params: { ...col.params, puff: true } }).length;
ok(b >= a + 14, `Puff-Enden (${a} → ${b})`);
// geschlossene Satinlinie (Applikation)
const cc = S.generate({ id: 3, type: 'colC', points: circle(10), params: { ...S.DEFAULTS.satin, width: 3, closed: true, underlay: 'none' } });
ok(G.dist(cc[0], cc[cc.length - 1]) < 3.5, 'geschlossene Satinlinie läuft rund');
// Stopp bei gleicher Farbe = Farbwechsel-Befehl in der DST
const r1 = { id: 4, type: 'run', color: 0, points: [{ x: 0, y: 0 }, { x: 20, y: 0 }], params: { ...S.DEFAULTS.run } };
const r2 = { ...r1, id: 5, stopBefore: true };
[r1, r2].forEach((o) => (o._st = S.generate(o)));
const cm = HW.dst.assemble([r1, r2], []);
ok(cm.filter((c) => c.cmd === 'color').length === 1 && cm.find((c) => c.cmd === 'color').stop, 'Stopp vor gleichfarbigem Objekt');
const bytes = HW.dst.writeDST(cm, 'T');
const dec = HW.dst.readDST(bytes);
ok((dec.cmds || dec).filter((c) => c.cmd === 'color').length === 1, 'Stopp steht in der DST');
process.exit(fail ? 1 : 0);
