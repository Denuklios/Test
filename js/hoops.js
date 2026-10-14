/* Stickrahmen: Bibliothek mit Standardrahmen und eigenen Rahmen (eckig, rund, oval).
   Maße = nutzbares Stickfeld in mm. */
(function (g) {
  const HW = (g.HW = g.HW || {});

  const B = (id, group, name, shape, w, h, margin = 5) => ({ id, group, name, shape, w, h: h ?? w, margin });
  const BUILTIN = [
    B('540x350', 'Texi 1501', 'Texi Großrahmen 540 × 350 mm (max. Feld)', 'rect', 540, 350),
    B('290x290', 'Texi 1501', 'Texi Rahmen 290 × 290 mm', 'rect', 290, 290),
    B('R200', 'Texi 1501', 'Texi rund Ø 200 mm', 'round', 200),
    B('R150', 'Texi 1501', 'Texi rund Ø 150 mm', 'round', 150),
    B('R120', 'Texi 1501', 'Texi rund Ø 120 mm', 'round', 120),
    B('R90', 'Texi 1501', 'Texi rund Ø 90 mm', 'round', 90),
    B('cap270', 'Texi 1501', 'Kappe 270° (ca. 360 × 75 mm)', 'rect', 360, 75, 3),
    B('ind_r90', 'Industrie (Tajima-kompatibel, Richtwerte)', 'Schlauchrahmen rund 9 cm', 'round', 90),
    B('ind_r120', 'Industrie (Tajima-kompatibel, Richtwerte)', 'Schlauchrahmen rund 12 cm', 'round', 120),
    B('ind_r150', 'Industrie (Tajima-kompatibel, Richtwerte)', 'Schlauchrahmen rund 15 cm', 'round', 150),
    B('ind_r180', 'Industrie (Tajima-kompatibel, Richtwerte)', 'Schlauchrahmen rund 18 cm', 'round', 180),
    B('ind_r210', 'Industrie (Tajima-kompatibel, Richtwerte)', 'Schlauchrahmen rund 21 cm', 'round', 210),
    B('ind_q240', 'Industrie (Tajima-kompatibel, Richtwerte)', 'Vierkant 24 × 24 cm', 'rect', 240, 240),
    B('ind_q300', 'Industrie (Tajima-kompatibel, Richtwerte)', 'Vierkant 30 × 30 cm', 'rect', 300, 300),
    B('ind_r360x360', 'Industrie (Tajima-kompatibel, Richtwerte)', 'Vierkant 36 × 36 cm', 'rect', 360, 360),
    B('ind_o210x300', 'Industrie (Tajima-kompatibel, Richtwerte)', 'Oval 21 × 30 cm', 'oval', 210, 300),
    B('ind_pocket', 'Industrie (Tajima-kompatibel, Richtwerte)', 'Brusttasche / Clip 10 × 7 cm', 'rect', 100, 70, 3),
    B('h_100', 'Haushaltsmaschinen (Richtwerte)', '10 × 10 cm', 'rect', 100, 100, 3),
    B('h_130x180', 'Haushaltsmaschinen (Richtwerte)', '13 × 18 cm', 'rect', 130, 180, 3),
    B('h_150x240', 'Haushaltsmaschinen (Richtwerte)', '15 × 24 cm', 'rect', 150, 240, 3),
    B('h_160x260', 'Haushaltsmaschinen (Richtwerte)', '16 × 26 cm', 'rect', 160, 260, 3),
    B('h_200x300', 'Haushaltsmaschinen (Richtwerte)', '20 × 30 cm', 'rect', 200, 300, 3),
    B('h_240x360', 'Haushaltsmaschinen (Richtwerte)', '24 × 36 cm', 'rect', 240, 360, 3),
    { id: 'none', group: 'Sonstiges', name: 'kein Rahmen', shape: 'none', w: 0, h: 0, margin: 0 },
  ];

  const KEY = 'stickstudio.hoops';
  function loadCustom() {
    try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function saveCustom(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* privater Modus o. Ä. */ }
  }

  function all(custom) { return BUILTIN.concat((custom || []).map((h) => ({ ...h, group: 'Eigene Rahmen' }))); }
  function get(id, custom) { return all(custom).find((h) => h.id === id) || BUILTIN[1]; }

  // Liegt Punkt p (Rahmenmitte = 0,0) im Stickfeld (abzüglich Sicherheitsabstand m)?
  function inside(h, p, m = 0) {
    if (h.shape === 'none') return true;
    const a = h.w / 2 - m, b = h.h / 2 - m;
    if (a <= 0 || b <= 0) return false;
    if (h.shape === 'rect') return Math.abs(p.x) <= a && Math.abs(p.y) <= b;
    return (p.x / a) ** 2 + (p.y / b) ** 2 <= 1;
  }

  /** Prüft Stichpunkte: {ok, outField, outMargin} */
  function check(h, pts) {
    let outField = 0, outMargin = 0;
    for (const p of pts) {
      if (!inside(h, p, 0)) outField++;
      else if (!inside(h, p, h.margin || 0)) outMargin++;
    }
    return { ok: !outField && !outMargin, outField, outMargin };
  }

  /** Größter Faktor, mit dem die Punkte (um ihre Mitte, mittig im Rahmen) ins Feld passen */
  function fitScale(h, pts) {
    if (h.shape === 'none' || !pts.length) return 1;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, m = h.margin || 0;
    const a = h.w / 2 - m, b = h.h / 2 - m;
    if (h.shape === 'rect') return Math.min(a / Math.max(1e-6, (x1 - x0) / 2), b / Math.max(1e-6, (y1 - y0) / 2));
    let r = 0;
    for (const p of pts) r = Math.max(r, Math.hypot((p.x - cx) / a, (p.y - cy) / b));
    return r > 0 ? 1 / r : 1;
  }

  /** Alle Rahmen, in die das Design (mittig gesetzt) passt – kleinster zuerst */
  function fitting(pts, custom) {
    if (!pts.length) return [];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const c = pts.map((p) => ({ x: p.x - cx, y: p.y - cy }));
    return all(custom).filter((h) => h.shape !== 'none' && check(h, c).ok).sort((u, v) => u.w * u.h - v.w * v.h);
  }

  HW.hoops = { BUILTIN, all, get, inside, check, fitScale, fitting, loadCustom, saveCustom };
})(typeof window !== 'undefined' ? window : globalThis);
