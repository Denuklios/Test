/* LaserStudio – Laserbahnen: Ebenen (Linie, Füllen, Versatzfüllung, Bild) → Bewegungen → GRBL-G-Code.
   Alle Maße in mm, Y nach oben. Bewegung: {x, y, s, f, rapid} mit s = Leistung 0..1 (Anteil von S-Max), f = mm/min. */
(function (g) {
  const FS = (g.FS = g.FS || {});
  const { geo, poly, M, util } = FS;
  const SH = () => FS.shapes;

  // Ebenenfarben wie in LightBurn: Farbe = Ebene
  const COLORS = ['#000000', '#1c7ed6', '#e03131', '#2f9e44', '#f08c00', '#ae3ec9', '#0c8599', '#e64980', '#5c940d', '#364fc7', '#d9480f', '#868e96', '#a61e4d', '#087f5b', '#e8590c', '#7048e8'];
  const MODES = { line: 'Linie', fill: 'Füllen', offset: 'Versatzfüllung', image: 'Bild' };
  const MODE_HELP = {
    line: 'Fährt genau auf der Linie: schneiden oder ritzen.',
    fill: 'Füllt geschlossene Formen Zeile für Zeile: Flächen gravieren.',
    offset: 'Füllt mit Umrisslinien von außen nach innen: schneller bei schmalen Formen, ohne Zeilenmuster.',
    image: 'Bilder Pixel für Pixel gravieren (Rastermodus beim Bild einstellen).',
  };

  function makeLayer(color, props) {
    const mode = (props && props.mode) || 'line';
    return Object.assign({
      id: util.uid(), color, name: '', mode,
      speed: mode === 'line' ? 300 : 3000, power: mode === 'line' ? 90 : 40, minPower: 0,
      passes: 1, interval: mode === 'image' ? 0.1 : 0.1, angle: 0, cross: false, bidir: true,
      overscan: 2.5, air: mode === 'line', zStep: 0, kerf: 0, tabs: 0, tabSize: 0.6,
      constant: false, output: true, show: true, shapeByShape: false,
    }, props || {});
  }

  // ------------------------------------------------------------ Hilfen
  const rot = (p, c, s) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c });
  const regionOf = (o) => poly.clip(SH().rings([o]), null, 'union', 'evenodd');

  /** Fläche aller geschlossenen Formen der Objekte (je Objekt gerade-ungerade, untereinander vereint) */
  function region(objs) {
    const parts = objs.flatMap(regionOf);
    return parts.length ? poly.clip(parts, null, 'union', 'nonzero') : [];
  }

  /** Flächen in Inseln aufteilen; nahe Inseln (Abstand < join) zusammen füllen */
  function islands(rings, join) {
    const shapes = poly.nest(rings).map((s) => ({ rings: [s.outer, ...s.holes], b: geo.bounds([s.outer]) }));
    const groups = [];
    for (const s of shapes) {
      let gr = groups.find((q) => s.b.x0 < q.b.x1 + join && s.b.x1 > q.b.x0 - join && s.b.y0 < q.b.y1 + join && s.b.y1 > q.b.y0 - join);
      if (!gr) { groups.push({ rings: s.rings.slice(), b: { ...s.b } }); continue; }
      gr.rings.push(...s.rings);
      gr.b = { x0: Math.min(gr.b.x0, s.b.x0), y0: Math.min(gr.b.y0, s.b.y0), x1: Math.max(gr.b.x1, s.b.x1), y1: Math.max(gr.b.y1, s.b.y1) };
    }
    // Gruppen können durch Zusammenwachsen nun überlappen: so lange vereinen, bis stabil
    for (let changed = true; changed; ) {
      changed = false;
      for (let i = 0; i < groups.length && !changed; i++) for (let j = i + 1; j < groups.length; j++) {
        const a = groups[i].b, b = groups[j].b;
        if (b.x0 < a.x1 + join && b.x1 > a.x0 - join && b.y0 < a.y1 + join && b.y1 > a.y0 - join) {
          groups[i].rings.push(...groups[j].rings);
          groups[i].b = { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
          groups.splice(j, 1);
          changed = true;
          break;
        }
      }
    }
    return groups.map((q) => q.rings);
  }

  /** Haltestege: geschlossenen Ring in Stücke mit n Lücken der Breite w zerlegen */
  function withTabs(pts, n, w) {
    const ring = pts.concat([pts[0]]);
    const L = geo.polyLength(ring, false);
    if (n < 1 || L < n * w * 3) return [{ pts: ring, closed: false }];
    const step = L / n, gaps = [];
    for (let i = 0; i < n; i++) { const c = step * (i + 0.5); gaps.push([c - w / 2, c + w / 2]); }
    const out = [];
    let cur = [], acc = 0;
    const inGap = (d) => gaps.some(([a, b]) => d > a && d < b);
    const push = (p, d) => { if (inGap(d)) { if (cur.length > 1) out.push({ pts: cur, closed: false }); cur = []; } else cur.push(p); };
    push(ring[0], 0);
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1], b = ring[i], l = geo.dist(a, b);
      // Lückengrenzen innerhalb des Segments genau einfügen
      const cuts = [];
      for (const [ga, gb] of gaps) for (const d of [ga, gb]) if (d > acc && d < acc + l) cuts.push(d);
      cuts.sort((x, y) => x - y);
      for (const d of cuts) {
        const p = geo.lerp(a, b, (d - acc) / l);
        if (inGap(d + 1e-6)) { cur.push(p); if (cur.length > 1) out.push({ pts: cur, closed: false }); cur = []; }
        else cur = [p];
      }
      acc += l;
      push(b, acc);
    }
    if (cur.length > 1) out.push({ pts: cur, closed: false });
    return out;
  }

  // ------------------------------------------------------------ Reihenfolge (innen vor außen, kurze Wege)
  function orderPaths(paths, start) {
    const items = paths.map((p, i) => ({ ...p, i, area: p.closed ? Math.abs(geo.signedArea(p.pts)) : 0, b: geo.bounds([p.pts]), done: false }));
    // innere Formen zuerst: Ring A liegt in Ring B → A vor B
    const insideOf = items.map(() => []);
    const closed = items.filter((q) => q.closed);
    if (closed.length < 1500) {
      for (const a of items) for (const b of closed) {
        if (a === b || b.area <= a.area) continue;
        if (a.b.x0 < b.b.x0 || a.b.x1 > b.b.x1 || a.b.y0 < b.b.y0 || a.b.y1 > b.b.y1) continue;
        if (geo.pointInPoly(a.pts[0], b.pts)) insideOf[b.i].push(a);
      }
    }
    const out = [];
    let pos = start || { x: 0, y: 0 };
    for (let left = items.length; left > 0; left--) {
      let best = null, bd = Infinity, bk = 0, brev = false;
      for (const it of items) {
        if (it.done || insideOf[it.i].some((q) => !q.done)) continue;
        if (it.closed) {
          for (let k = 0; k < it.pts.length; k += Math.max(1, (it.pts.length / 64) | 0)) {
            const d = Math.abs(it.pts[k].x - pos.x) + Math.abs(it.pts[k].y - pos.y);
            if (d < bd) { bd = d; best = it; bk = k; }
          }
        } else {
          const a = it.pts[0], z = it.pts[it.pts.length - 1];
          const da = Math.abs(a.x - pos.x) + Math.abs(a.y - pos.y), dz = Math.abs(z.x - pos.x) + Math.abs(z.y - pos.y);
          if (da < bd) { bd = da; best = it; brev = false; }
          if (dz < bd) { bd = dz; best = it; brev = true; }
        }
      }
      if (!best) best = items.find((q) => !q.done); // Sicherheitsnetz bei Zirkelbezug
      best.done = true;
      let pts = best.pts;
      if (best.closed) pts = pts.slice(bk).concat(pts.slice(0, bk + 1));
      else if (brev) pts = pts.slice().reverse();
      out.push({ ...best, pts, closed: false });
      pos = pts[pts.length - 1];
    }
    return out;
  }

  // ------------------------------------------------------------ Bewegungen erzeugen
  class Moves {
    constructor() { this.list = []; this.pos = { x: 0, y: 0 }; }
    rapid(p) { if (Math.abs(p.x - this.pos.x) > 1e-4 || Math.abs(p.y - this.pos.y) > 1e-4) this.list.push({ x: p.x, y: p.y, s: 0, f: 0, rapid: true }); this.pos = p; }
    line(p, s, f) {
      const last = this.list[this.list.length - 1];
      // gleiche Leistung in gleicher Richtung zusammenfassen
      if (last && !last.rapid && last.s === s && last.f === f && this.list.length > 1) {
        const prev = this.list.length > 1 ? this.list[this.list.length - 2] : null;
        if (prev) {
          const ax = last.x - prev.x, ay = last.y - prev.y, bx = p.x - last.x, by = p.y - last.y;
          if (Math.abs(ax * by - ay * bx) < 1e-9 && ax * bx + ay * by > 0) { last.x = p.x; last.y = p.y; this.pos = p; return; }
        }
      }
      this.list.push({ x: p.x, y: p.y, s, f });
      this.pos = p;
    }
    mark(m) { this.list.push(m); }
  }

  const powerOf = (layer, o) => ((o && o.ovr && o.ovr.power != null ? o.ovr.power : layer.power) / 100);
  const speedOf = (layer, o) => (o && o.ovr && o.ovr.speed != null ? o.ovr.speed : layer.speed);

  /** Vektorpfade einer Linien-Ebene (mit Schnittspalt-Ausgleich und Haltestegen) */
  function linePaths(layer, objs) {
    const out = [];
    for (const o of objs) {
      const ls = SH().lines(o);
      const closedR = ls.filter((l) => l.closed && l.pts.length > 2).map((l) => l.pts);
      const open = ls.filter((l) => !l.closed && l.pts.length > 1);
      let rings = closedR;
      if (layer.kerf > 0 && closedR.length) {
        rings = [];
        for (const s of poly.offsetShapes(closedR, layer.kerf / 2)) rings.push(s.outer, ...s.holes);
      }
      for (const r of rings) {
        if (layer.tabs > 0) for (const t of withTabs(r, layer.tabs, layer.tabSize)) out.push({ ...t, o });
        else out.push({ pts: r, closed: true, o });
      }
      for (const l of open) out.push({ pts: l.pts, closed: false, o });
    }
    return out;
  }

  /** Füll-Zeilen einer Fläche: Liste von Zeilen, jede Zeile Liste von Strecken [a, b] (in Welt-mm) */
  function hatchRows(rings, interval, angleDeg) {
    const a = (angleDeg * Math.PI) / 180, c = Math.cos(-a), s = Math.sin(-a);
    const rr = rings.map((r) => r.map((p) => rot(p, c, s)));
    const b = geo.bounds(rr);
    if (!isFinite(b.x0)) return [];
    const lines = [];
    const n = Math.floor(b.h / interval) + 1;
    for (let i = 0; i < n; i++) {
      const y = b.y0 + interval * (i + 0.5);
      if (y > b.y1) break;
      lines.push([{ x: b.x0 - 1, y }, { x: b.x1 + 1, y }]);
    }
    if (!lines.length) return [];
    const segs = poly.clipLines(lines, rr, true);
    const rows = new Map();
    for (const sg of segs) {
      const y = sg[0].y, k = Math.round((y - b.y0) / interval - 0.5);
      let p0 = sg[0], p1 = sg[sg.length - 1];
      if (p0.x > p1.x) [p0, p1] = [p1, p0];
      if (p1.x - p0.x < 1e-3) continue;
      if (!rows.has(k)) rows.set(k, []);
      rows.get(k).push([p0.x, p1.x, y]);
    }
    const ci = Math.cos(a), si = Math.sin(a);
    return [...rows.keys()].sort((x, y) => x - y).map((k) => rows.get(k).sort((x, y) => x[0] - y[0]).map(([x0, x1, y]) => [rot({ x: x0, y }, ci, si), rot({ x: x1, y }, ci, si)]));
  }

  /** Zeilen (Strecken gleicher Richtung) mit Überfahrt als Bewegungen ausgeben */
  function emitRows(mv, rows, dir, opt) {
    const { s, f, overscan, bidir } = opt;
    const ux = Math.cos(dir), uy = Math.sin(dir);
    let fwd = true;
    // in die Nähe der aktuellen Position starten: Reihenfolge der Zeilen ggf. umdrehen
    if (rows.length > 1) {
      const p = mv.pos, f0 = rows[0][0][0], fl = rows[rows.length - 1][0][0];
      if (Math.hypot(fl.x - p.x, fl.y - p.y) < Math.hypot(f0.x - p.x, f0.y - p.y)) rows = rows.slice().reverse();
    }
    for (const row of rows) {
      const segs = fwd ? row : row.slice().reverse().map(([a, b]) => [b, a]);
      const sx = fwd ? 1 : -1;
      const first = segs[0][0];
      const pre = { x: first.x - ux * overscan * sx, y: first.y - uy * overscan * sx };
      mv.rapid(pre);
      mv.line(first, 0, f);
      for (let i = 0; i < segs.length; i++) {
        const [a, b] = segs[i];
        if (i) {
          const gap = Math.hypot(a.x - mv.pos.x, a.y - mv.pos.y);
          if (gap > 2 * overscan + 3) {
            // große Lücke: Laser aus, Eilgang, neu anlaufen
            mv.line({ x: mv.pos.x + ux * overscan * sx, y: mv.pos.y + uy * overscan * sx }, 0, f);
            mv.rapid({ x: a.x - ux * overscan * sx, y: a.y - uy * overscan * sx });
          }
          mv.line(a, 0, f);
        }
        mv.line(b, s, f);
      }
      const last = segs[segs.length - 1][1];
      mv.line({ x: last.x + ux * overscan * sx, y: last.y + uy * overscan * sx }, 0, f);
      if (bidir) fwd = !fwd;
    }
  }

  // ------------------------------------------------------------ Bilder
  const pixCache = new WeakMap();
  function decodePx(px) {
    let u = pixCache.get(px);
    if (u) return u;
    if (typeof atob === 'function') {
      const bin = atob(px.data);
      u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    } else u = new Uint8Array(Buffer.from(px.data, 'base64'));
    pixCache.set(px, u);
    return u;
  }
  function encodePx(w, h, gray8) {
    let s = '';
    for (let i = 0; i < gray8.length; i += 0x8000) s += String.fromCharCode.apply(null, gray8.subarray(i, i + 0x8000));
    return { id: util.uid(), w, h, data: typeof btoa === 'function' ? btoa(s) : Buffer.from(gray8).toString('base64') };
  }

  /** Bild als Raster in Maschinenrichtung abtasten: liefert {nx, ny, x0, y1, step, f (0 schwarz..1 weiß, -1 außerhalb)} */
  function sampleImage(o, step) {
    const SHp = SH();
    const ls = SHp.lines(o)[0].pts, b = geo.bounds([ls]);
    const nx = Math.max(1, Math.ceil(b.w / step)), ny = Math.max(1, Math.ceil(b.h / step));
    const inv = M.inv(o.tf), px = o.px, data = decodePx(px), pw = px.w, ph = px.h;
    const f = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) {
      const y = b.y1 - (j + 0.5) * step;
      for (let i = 0; i < nx; i++) {
        const q = M.apply(inv, { x: b.x0 + (i + 0.5) * step, y });
        const u = (q.x / o.w + 0.5) * pw - 0.5, v = (0.5 - q.y / o.h) * ph - 0.5;
        if (u < -0.5 || v < -0.5 || u > pw - 0.5 || v > ph - 0.5) { f[j * nx + i] = -1; continue; }
        const x0 = Math.max(0, Math.min(pw - 1, Math.floor(u))), y0 = Math.max(0, Math.min(ph - 1, Math.floor(v)));
        const x1 = Math.min(pw - 1, x0 + 1), y1 = Math.min(ph - 1, y0 + 1), ax = Math.max(0, Math.min(1, u - x0)), ay = Math.max(0, Math.min(1, v - y0));
        const val = (data[y0 * pw + x0] * (1 - ax) + data[y0 * pw + x1] * ax) * (1 - ay) + (data[y1 * pw + x0] * (1 - ax) + data[y1 * pw + x1] * ax) * ay;
        f[j * nx + i] = val / 255;
      }
    }
    return { nx, ny, x0: b.x0, y1: b.y1, step, f };
  }

  /** Bild → Schwärzung je Pixel (0..1) nach Bildeinstellungen */
  function processImage(o, step) {
    const r = sampleImage(o, step);
    const im = o.img || {};
    FS.dither.adjust(r.f, r.nx, r.ny, im);
    r.dark = FS.dither.apply(r.f, r.nx, r.ny, im.mode || 'jarvis', { threshold: im.threshold == null ? 0.5 : im.threshold, cell: im.cell || 6 });
    r.gray = (im.mode || 'jarvis') === 'grayscale';
    return r;
  }

  function emitImage(mv, layer, o, opt) {
    const r = processImage(o, layer.interval);
    const pMax = powerOf(layer, o), pMin = (layer.minPower || 0) / 100, f = speedOf(layer, o), os = layer.overscan;
    const levels = 255;
    const sOf = (d) => (d <= 0 ? 0 : r.gray ? Math.round((pMin + (pMax - pMin) * d) * 1000) / 1000 : pMax);
    let fwd = true;
    // Zeilen von oben nach unten (Bild-Zeile 0 = oben)
    for (let j = 0; j < r.ny; j++) {
      const y = r.y1 - (j + 0.5) * r.step;
      const row = r.dark.subarray(j * r.nx, (j + 1) * r.nx);
      let first = -1, last = -1;
      for (let i = 0; i < r.nx; i++) if (row[i] > 1 / levels) { if (first < 0) first = i; last = i; }
      if (first < 0) continue; // leere Zeile überspringen
      // Läufe gleicher Leistung bilden
      const runs = [];
      let i = first;
      while (i <= last) {
        const s = sOf(Math.round(row[i] * levels) / levels);
        let k = i + 1;
        while (k <= last && sOf(Math.round(row[k] * levels) / levels) === s) k++;
        runs.push({ a: i, b: k, s });
        i = k;
      }
      const X = (idx) => r.x0 + idx * r.step;
      const seq = fwd ? runs : runs.slice().reverse();
      const sx = fwd ? 1 : -1;
      const startX = fwd ? X(seq[0].a) : X(seq[0].b);
      mv.rapid({ x: startX - sx * os, y });
      mv.line({ x: startX, y }, 0, f);
      for (const run of seq) {
        const ex = fwd ? X(run.b) : X(run.a);
        if (run.s === 0 && Math.abs(ex - mv.pos.x) > 2 * os + 3) {
          // lange weiße Strecke: auslaufen, Eilgang, neu anlaufen
          mv.line({ x: mv.pos.x + sx * os, y }, 0, f);
          mv.rapid({ x: ex - sx * os, y });
          mv.line({ x: ex, y }, 0, f);
        } else mv.line({ x: ex, y }, run.s, f);
      }
      mv.line({ x: mv.pos.x + sx * os, y }, 0, f);
      if (layer.bidir) fwd = !fwd;
    }
    return r;
  }

  // ------------------------------------------------------------ Auftrag planen
  /**
   * doc: {objects, layers}. opt: {start:{x,y}}. Liefert {blocks:[{layer, moves, time, passes}], moves, bounds, time, warnings}
   * Die Reihenfolge der Ebenen ist die der Liste (oben zuerst). Bilder werden immer als Raster graviert.
   */
  function plan(doc, opt = {}) {
    const warnings = [];
    const mv = new Moves();
    mv.pos = opt.start || { x: 0, y: 0 };
    const blocks = [];
    for (const layer of doc.layers) {
      if (!layer.output) continue;
      const objs = doc.objects.filter((o) => o.layer === layer.id && !o.hidden);
      if (!objs.length) continue;
      const imgs = objs.filter((o) => o.kind === 'image' && o.px);
      const vecs = objs.filter((o) => o.kind !== 'image');
      const from = mv.list.length;
      mv.mark({ layer: layer.id, begin: true });
      const passes = Math.max(1, layer.passes | 0);
      for (let pass = 0; pass < passes; pass++) {
        if (pass > 0) mv.mark({ pass, zStep: layer.zStep || 0 });
        if (vecs.length) {
          const mode = layer.mode === 'image' ? 'fill' : layer.mode;
          if (mode === 'line') {
            const paths = orderPaths(linePaths(layer, vecs), mv.pos);
            for (const p of paths) {
              mv.rapid(p.pts[0]);
              const s = powerOf(layer, p.o), f = speedOf(layer, p.o);
              for (let i = 1; i < p.pts.length; i++) mv.line(p.pts[i], s, f);
            }
          } else {
            // Füllen: je Objekt mit eigenen Werten (Materialtest) oder gemeinsam
            const groups = new Map();
            for (const o of vecs) {
              const key = o.ovr ? o.id : '_';
              if (!groups.has(key)) groups.set(key, []);
              groups.get(key).push(o);
            }
            const order = [...groups.values()];
            for (const grp of order) {
              const rings = region(grp);
              if (!rings.length) { warnings.push(`Ebene ${layer.name || layer.color}: offene Linien lassen sich nicht füllen.`); continue; }
              const s = powerOf(layer, grp[0]), f = speedOf(layer, grp[0]);
              const angles = [layer.angle || 0].concat(layer.cross ? [(layer.angle || 0) + 90] : []);
              for (const isl of islands(rings, 5)) {
                if (mode === 'offset') {
                  const loops = [];
                  let cur = poly.offset(isl, -layer.interval / 2);
                  for (let k = 0; cur.length && k < 5000; k++) { loops.push(...cur); cur = poly.offset(cur, -layer.interval); }
                  for (const p of orderPaths(loops.map((pts) => ({ pts, closed: true })), mv.pos)) {
                    mv.rapid(p.pts[0]);
                    for (let i = 1; i < p.pts.length; i++) mv.line(p.pts[i], s, f);
                  }
                } else {
                  for (const ang of angles) {
                    const rows = hatchRows(isl, layer.interval, ang);
                    emitRows(mv, rows, (ang * Math.PI) / 180, { s, f, overscan: layer.overscan, bidir: layer.bidir });
                  }
                }
              }
            }
          }
        }
        for (const o of imgs) emitImage(mv, layer, o);
      }
      mv.mark({ layer: layer.id, end: true });
      blocks.push({ layer, from, to: mv.list.length });
    }
    const res = { blocks, moves: mv.list, warnings };
    res.bounds = movesBounds(mv.list);
    res.time = estimate(mv.list, opt.machine);
    return res;
  }

  function movesBounds(list) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const m of list) if (m.x !== undefined) { if (m.x < x0) x0 = m.x; if (m.x > x1) x1 = m.x; if (m.y < y0) y0 = m.y; if (m.y > y1) y1 = m.y; }
    return isFinite(x0) ? { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 } : null;
  }

  /**
   * Laufzeit bis zu jeder Bewegung (Sekunden). Anfahren/Abbremsen nur dort, wo die Richtung wechselt
   * oder die Geschwindigkeit sich ändert – gerade weiterlaufende Stücke (z. B. Bildzeilen) fährt GRBL ohne Halt.
   */
  function cumTimes(list, mach) {
    const rapid = (mach && mach.rapid) || 6000, acc = (mach && mach.accel) || 1500; // mm/s²
    const t = new Float64Array(list.length);
    let p = null, dir = null, vPrev = 0, s = 0;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (m.x !== undefined) {
        if (p) {
          const dx = m.x - p.x, dy = m.y - p.y, d = Math.hypot(dx, dy);
          if (d > 1e-9) {
            const v = (m.rapid ? rapid : m.f || 1000) / 60, u = { x: dx / d, y: dy / d };
            const smooth = dir && vPrev === v && u.x * dir.x + u.y * dir.y > 0.996;
            if (smooth) s += d / v;
            else {
              // Trapez-Profil: aus dem Stand anfahren und am Ende abbremsen (beim Weiterlaufen grob halbiert)
              const da = (v * v) / acc;
              s += d >= da ? d / v + v / acc : 2 * Math.sqrt(d / acc);
            }
            dir = u; vPrev = v;
          }
        }
        p = m;
      }
      t[i] = s;
    }
    return t;
  }
  function estimate(list, mach) {
    const t = cumTimes(list, mach);
    let burn = 0, p = null;
    for (const m of list) { if (m.x === undefined) continue; if (p && !m.rapid && m.s > 0) burn += Math.hypot(m.x - p.x, m.y - p.y); p = m; }
    return { sec: t.length ? t[t.length - 1] : 0, burn };
  }

  // ------------------------------------------------------------ Ursprung / Koordinaten
  const ANCHORS = { ul: [0, 1], uc: [0.5, 1], ur: [1, 1], cl: [0, 0.5], c: [0.5, 0.5], cr: [1, 0.5], ll: [0, 0], lc: [0.5, 0], lr: [1, 0] };
  /**
   * Koordinaten-Abbildung Zeichnung → Maschine.
   * start: 'absolute' (Arbeitsbereich = Maschinenkoordinaten), 'current' (ab aktueller Laserposition), 'origin' (ab Nullpunkt G54).
   * anchor: Bezugspunkt des Auftrags bei 'current'/'origin'. mach.origin: Ecke, an der die Maschine ihren Nullpunkt hat.
   */
  function mapper(job, mach) {
    const st = job.start || 'absolute';
    if (st !== 'absolute') {
      const b = job.box || { x0: 0, y0: 0, x1: 0, y1: 0 }, [ax, ay] = ANCHORS[job.anchor || 'll'];
      const ox = b.x0 + (b.x1 - b.x0) * ax, oy = b.y0 + (b.y1 - b.y0) * ay;
      return (p) => ({ x: p.x - ox, y: p.y - oy });
    }
    const W = mach.w, H = mach.h, o = mach.origin || 'll';
    return (p) => ({ x: o === 'ur' || o === 'lr' ? W - p.x : p.x, y: o === 'ul' || o === 'ur' ? H - p.y : p.y });
  }

  const num = (v) => { const r = Math.round(v * 1000) / 1000; return (Object.is(r, -0) ? 0 : r).toString(); };

  /** G-Code aus einem Plan. job: {start, anchor, box, name, returnHome}. mach: {sMax, origin, w, h, rapid} */
  function gcode(pl, doc, job, mach) {
    const map = mapper(job, mach);
    const sMax = mach.sMax || 1000;
    const L = [];
    L.push('; LaserStudio – ' + (job.name || 'Auftrag'));
    L.push(`; Laufzeit ca. ${fmtTime(pl.time.sec)} · Start: ${{ absolute: 'Arbeitsbereich (absolut)', current: 'aktuelle Position', origin: 'Nullpunkt' }[job.start || 'absolute']}`);
    L.push('G21 G90 G17');
    if ((job.start || 'absolute') === 'current') L.push('G92 X0 Y0 ; aktuelle Position = Bezugspunkt');
    L.push('M5 S0');
    let curF = null, curS = null, layer = null, air = false;
    for (const m of pl.moves) {
      if (m.begin) {
        layer = doc.layers.find((q) => q.id === m.layer);
        L.push(`; Ebene ${layer.name || layer.color} – ${MODES[layer.mode]} · ${layer.speed} mm/min · ${layer.power} %${layer.passes > 1 ? ' · ' + layer.passes + ' Durchgänge' : ''}`);
        const want = layer.constant ? 'M3' : 'M4';
        L.push(want + ' S0');
        curS = 0;
        if (layer.air && !air) { L.push('M8 ; Luftunterstützung an'); air = true; }
        if (!layer.air && air) { L.push('M9'); air = false; }
        continue;
      }
      if (m.end) { continue; }
      if (m.pass !== undefined) {
        L.push(`; Durchgang ${m.pass + 1}`);
        if (m.zStep) L.push(`G91 G0 Z${num(-m.zStep)}`, 'G90');
        continue;
      }
      const p = map(m);
      if (m.rapid) { L.push(`G0 X${num(p.x)} Y${num(p.y)}`); continue; }
      let s = `G1 X${num(p.x)} Y${num(p.y)}`;
      const S = Math.round(m.s * sMax);
      if (S !== curS) { s += ` S${S}`; curS = S; }
      if (m.f !== curF) { s += ` F${Math.round(m.f)}`; curF = m.f; }
      L.push(s);
    }
    // Z-Absenkungen zurücknehmen
    for (const layerB of pl.blocks) {
      const z = (layerB.layer.zStep || 0) * Math.max(0, (layerB.layer.passes | 0) - 1);
      if (z > 0) L.push(`G91 G0 Z${num(z)} ; Fokus zurück`, 'G90');
    }
    L.push('M5 S0');
    if (air) L.push('M9');
    if (job.returnHome !== false) L.push('G0 X0 Y0 ; zurück zum Start');
    if ((job.start || 'absolute') === 'current') L.push('G92.1 ; Bezugspunkt zurücksetzen');
    L.push('; Ende');
    return L.join('\n') + '\n';
  }

  /** Rahmen (Rechteck oder Umriss) mit ausgeschaltetem oder schwachem Laser */
  function frameGcode(pts, job, mach, opt = {}) {
    const map = mapper(job, mach);
    const f = opt.speed || 3000;
    const L = ['G21 G90'];
    if (job.start === 'current') L.push('G92 X0 Y0');
    const q = pts.map(map);
    L.push(`G0 X${num(q[0].x)} Y${num(q[0].y)}`);
    if (opt.power > 0) L.push(`M3 S${Math.round((opt.power / 100) * (mach.sMax || 1000))}`);
    for (const p of q.slice(1).concat([q[0]])) L.push(`G1 X${num(p.x)} Y${num(p.y)} F${f}`);
    L.push('M5 S0');
    if (job.start === 'current') { L.push(`G0 X0 Y0`, 'G92.1'); }
    return L.join('\n') + '\n';
  }

  function hull(points) {
    const p = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    if (p.length < 3) return p;
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lo = [], up = [];
    for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    up.pop(); lo.pop();
    return lo.concat(up);
  }

  function fmtTime(sec) {
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? `${h} h ${String(m).padStart(2, '0')} min` : m ? `${m} min ${String(s).padStart(2, '0')} s` : `${s} s`;
  }

  /** G-Code lesen (für Vorschau geladener Dateien) */
  function parseGcode(text, sMax = 1000) {
    const out = [];
    let x = 0, y = 0, rel = false, mode = 0, s = 0, f = 1000, on = false, laserMode = 'M4';
    for (const raw of text.split(/\r?\n/)) {
      const l = raw.replace(/\(.*?\)/g, '').replace(/;.*/, '').trim().toUpperCase();
      if (!l) continue;
      const words = l.match(/[A-Z][-+]?\d*\.?\d*/g) || [];
      let nx = null, ny = null, motion = null;
      for (const w of words) {
        const c = w[0], v = parseFloat(w.slice(1));
        if (c === 'G') { if (v === 0 || v === 1 || v === 2 || v === 3) motion = v; if (v === 90) rel = false; if (v === 91) rel = true; }
        if (c === 'M') { if (v === 3 || v === 4) { on = true; laserMode = 'M' + v; } if (v === 5) on = false; }
        if (c === 'X') nx = v; if (c === 'Y') ny = v; if (c === 'S') s = v; if (c === 'F') f = v;
      }
      if (motion !== null) mode = motion;
      if (nx === null && ny === null) continue;
      x = nx === null ? x : rel ? x + nx : nx;
      y = ny === null ? y : rel ? y + ny : ny;
      out.push({ x, y, rapid: mode === 0, s: mode === 0 || !on ? 0 : Math.min(1, s / sMax), f });
    }
    return out;
  }

  // ------------------------------------------------------------ Materialtest
  /**
   * Raster aus Feldern mit unterschiedlicher Leistung (Spalten) und Geschwindigkeit (Zeilen), beschriftet.
   * Liefert {objects, layers}. o: {cols, rows, pMin, pMax, vMin, vMax, cell, gap, mode, interval, x, y, labels, powerText (Achsenbeschriftung)}
   */
  function materialTest(o) {
    const cols = Math.max(1, o.cols | 0), rows = Math.max(1, o.rows | 0);
    const cell = o.cell || 8, gap = o.gap || 2, lab = o.labels !== false ? Math.max(3, cell * 0.45) : 0;
    const lin = (a, b, i, n) => (n > 1 ? a + ((b - a) * i) / (n - 1) : a);
    const test = makeLayer(COLORS[14], { name: 'Materialtest', mode: o.mode || 'fill', interval: o.interval || 0.1, speed: o.vMin, power: o.pMax, air: o.air !== false });
    const text = makeLayer(COLORS[15], { name: 'Beschriftung', mode: 'fill', interval: 0.12, speed: o.labelSpeed || Math.max(o.vMax, 2000), power: o.labelPower || Math.max(10, o.pMin), air: false });
    const objs = [];
    const X0 = (o.x || 0) + (lab ? lab * 3.2 : 0), Y0 = (o.y || 0);
    const H = rows * (cell + gap) - gap;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const pw = Math.round(lin(o.pMin, o.pMax, c, cols));
      const sp = Math.round(lin(o.vMax, o.vMin, r, rows));
      const box = SH().make('rect', { name: `Test ${pw} % · ${sp} mm/min`, w: cell, h: cell, r: 0, layer: test.id, ovr: { power: pw, speed: sp } });
      box.tf = M.translate(X0 + c * (cell + gap) + cell / 2, Y0 + H - r * (cell + gap) - cell / 2);
      objs.push(box);
    }
    if (lab) {
      const sz = lab;
      for (let c = 0; c < cols; c++) {
        const t = SH().make('text', { name: 'Leistung', text: String(Math.round(lin(o.pMin, o.pMax, c, cols))), font: o.font, size: sz, align: 'center', spacing: 0, lineHeight: 1.2, layer: text.id });
        t.tf = M.translate(X0 + c * (cell + gap) + cell / 2, Y0 + H + gap + sz * 0.15);
        objs.push(t);
      }
      for (let r = 0; r < rows; r++) {
        const t = SH().make('text', { name: 'Geschwindigkeit', text: String(Math.round(lin(o.vMax, o.vMin, r, rows))), font: o.font, size: sz * 0.8, align: 'right', spacing: 0, lineHeight: 1.2, layer: text.id });
        t.tf = M.translate(X0 - gap, Y0 + H - r * (cell + gap) - cell / 2 - sz * 0.28);
        objs.push(t);
      }
      const t1 = SH().make('text', { name: 'Achse Leistung', text: o.powerText || 'Leistung %', font: o.font, size: sz * 0.8, align: 'left', spacing: 0, lineHeight: 1.2, layer: text.id });
      t1.tf = M.translate(X0, Y0 + H + gap + sz * 1.45);
      const t2 = SH().make('text', { name: 'Achse Geschwindigkeit', text: 'mm/min', font: o.font, size: sz * 0.7, align: 'right', spacing: 0, lineHeight: 1.2, layer: text.id });
      t2.tf = M.translate(X0 - gap, Y0 - sz * 1.1);
      objs.push(t1, t2);
    }
    return { objects: objs, layers: lab ? [text, test] : [test] };
  }

  /** Markierungen zum Kamera-Ausrichten: Kreuze an 4 Punkten (Welt-mm), als Objekte einer Linien-Ebene */
  function alignMarks(points, size = 10) {
    const layer = makeLayer(COLORS[2], { name: 'Kamera-Marken', mode: 'line', speed: 1000, power: 30, air: false });
    const objs = points.map((p, i) => {
      const o = SH().make('poly', { name: 'Marke ' + (i + 1), layer: layer.id, lines: [
        { pts: [{ x: p.x - size / 2, y: p.y }, { x: p.x + size / 2, y: p.y }], closed: false },
        { pts: [{ x: p.x, y: p.y - size / 2 }, { x: p.x, y: p.y + size / 2 }], closed: false },
      ] });
      return o;
    });
    return { objects: objs, layers: [layer] };
  }

  FS.laser = {
    COLORS, MODES, MODE_HELP, ANCHORS, makeLayer, plan, gcode, frameGcode, hull, estimate, cumTimes, fmtTime, parseGcode, mapper,
    hatchRows, withTabs, orderPaths, region, islands, processImage, sampleImage, encodePx, decodePx, materialTest, alignMarks,
  };
  if (typeof module !== 'undefined') module.exports = FS;
})(typeof window !== 'undefined' ? window : globalThis);
