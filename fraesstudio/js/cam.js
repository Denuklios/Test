/* Fräsbahnen berechnen.
   Ergebnis einer Bearbeitung: { chains: [{pts:[{x,y,z,rapid?}], clearZ}], tool, cut:{feed,plunge,rpm,stepdown}, warnings, tabs }
   Z=0 ist die Werkstückoberfläche, Tiefen sind negativ. Zwischen Ketten wird auf Sicherheitshöhe angehoben. */
(function (g) {
  const FS = (g.FS = g.FS || {});
  const { geo, poly } = FS;

  const OP_TYPES = {
    profile: 'Kontur',
    pocket: 'Tasche',
    drill: 'Bohren',
    vcarve: 'V-Carving',
    engrave: 'Gravieren (auf Linie)',
    relief_rough: '3D-Relief schruppen',
    relief_finish: '3D-Relief schlichten',
    relief_rest: '3D-Restmaterial',
    face: 'Planfräsen',
  };

  const OP_DEFAULTS = {
    profile: { depth: 3, side: 'outside', direction: 'climb', tabs: false, tabCount: 4, tabWidth: 6, tabHeight: 1.5, ramp: true, rampLen: 10, allowance: 0, finishPass: false },
    pocket: { depth: 2, strategy: 'offset', angle: 0, direction: 'climb', allowance: 0, ramp: true, rampLen: 10 },
    drill: { depth: 5, peck: 2, ramp: true },
    vcarve: { maxDepth: 0, clearToolId: '', step: 0.2 },
    engrave: { depth: 0.5 },
    relief_rough: { allowance: 0.5, angle: 0 },
    relief_finish: { angle: 0, both: false },
    relief_rest: { refToolId: '', angle: 0, minRest: 0.05 },
    face: { depth: 0.5, angle: 0, margin: 2 },
  };

  function makeOp(type, objIds, toolId) {
    return { id: FS.util.uid(), type, name: OP_TYPES[type], objIds: objIds.slice(), toolId, enabled: true, startDepth: 0, stepdown: 0, feed: 0, plunge: 0, rpm: 0, ...FS.util.deep(OP_DEFAULTS[type]) };
  }

  // ---- Reihenfolge: jedes Teil (z. B. jeder Buchstabe) komplett fertig, dann das nächste – in Leserichtung ----
  // Lesereihenfolge: Zeilen von oben nach unten, innerhalb der Zeile von links nach rechts
  function readingOrder(items, boxOf) {
    const arr = items.map((it) => ({ it, b: boxOf(it) }));
    const n = arr.length;
    // Zeilen = zusammenhängende Gruppen, deren Höhen sich genug überlappen (unabhängig von der Reihenfolge: i-Punkte, Unterlängen …)
    const par = arr.map((_, i) => i);
    const find = (i) => (par[i] === i ? i : (par[i] = find(par[i])));
    if (n <= 600) {
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const A = arr[i].b, B = arr[j].b;
        const ov = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0);
        if (ov >= 0.3 * Math.max(1e-6, Math.min(A.y1 - A.y0, B.y1 - B.y0))) par[find(i)] = find(j);
      }
    } else {
      arr.sort((a, c) => c.b.y0 + c.b.y1 - (a.b.y0 + a.b.y1));
      let ry = 0, prev = 0;
      arr.forEach((e, i) => { const yc = (e.b.y0 + e.b.y1) / 2; if (i && Math.abs(yc - ry) > (e.b.y1 - e.b.y0) * 0.6) prev = i; else if (!i) ry = yc; par[i] = prev; });
    }
    const rows = new Map();
    arr.forEach((e, i) => {
      const k = find(i);
      let r = rows.get(k);
      if (!r) rows.set(k, (r = { list: [], y0: Infinity, y1: -Infinity }));
      r.list.push(e); r.y0 = Math.min(r.y0, e.b.y0); r.y1 = Math.max(r.y1, e.b.y1);
    });
    return [...rows.values()].sort((a, c) => c.y0 + c.y1 - (a.y0 + a.y1))
      .flatMap((r) => r.list.sort((a, c) => a.b.x0 + a.b.x1 - (c.b.x0 + c.b.x1)).map((e) => e.it));
  }
  const ringBox = (r) => geo.bounds([r]);
  // Ringe zu Teilen (Außenring + Löcher) gruppieren, ohne überlappende Formen zu verschmelzen
  function groupRings(rings) {
    if (rings.length > 400) return rings.map((r) => ({ outer: r, holes: [] }));
    const info = rings.map((r) => ({ r, a: Math.abs(geo.signedArea(r)), p: r[0] }));
    for (const e of info) {
      let best = null;
      for (const o of info) if (o !== e && o.a > e.a && geo.pointInPoly(e.p, o.r) && (!best || o.a < best.a)) best = o;
      e.parent = best;
    }
    const depth = (e) => (e.parent ? 1 + depth(e.parent) : 0);
    const root = new Map(), groups = [];
    for (const e of info) { e.d = depth(e); if (e.d % 2 === 0) { const g = { outer: e.r, holes: [] }; root.set(e, g); groups.push(g); } }
    for (const e of info) if (e.d % 2 === 1) { const g = root.get(e.parent); if (g) g.holes.push(e.r); }
    return groups;
  }
  const orderGroups = (groups) => readingOrder(groups, (g) => ringBox(g.outer));

  // gleichmäßige Zustellungen von start bis depth (positiv) -> negative z-Werte
  function levels(start, depth, step) {
    const total = depth - start;
    if (total <= 1e-9) return [];
    const n = Math.max(1, Math.ceil(total / Math.max(0.01, step) - 1e-6));
    const out = [];
    for (let i = 1; i <= n; i++) out.push(-(start + (total * i) / n));
    return out;
  }

  // Ring so drehen, dass er beim Punkt nahe p beginnt
  function rotateTo(ring, p) {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < ring.length; i++) { const d = (ring[i].x - p.x) ** 2 + (ring[i].y - p.y) ** 2; if (d < bd) { bd = d; bi = i; } }
    return ring.slice(bi).concat(ring.slice(0, bi));
  }

  // Haltestege: Ring an Stegkanten unterteilen und Punkte markieren
  function insertTabs(ring, count, width) {
    const n = ring.length, L = geo.polyLength(ring, true);
    if (count < 1 || L < count * width * 2) return ring.map((p) => ({ ...p }));
    const iv = [];
    for (let k = 0; k < count; k++) { const c = (L * (k + 0.5)) / count; iv.push([c - width / 2, c + width / 2]); }
    const out = [];
    let s = 0;
    const inTab = (x) => iv.some(([a, b]) => x > a + 1e-9 && x < b - 1e-9);
    for (let i = 0; i < n; i++) {
      const a = ring[i], b = ring[(i + 1) % n], e = geo.dist(a, b);
      out.push({ x: a.x, y: a.y, inTab: inTab(s) });
      const cuts = [];
      for (const [t0, t1] of iv) {
        if (t0 > s && t0 < s + e) cuts.push({ t: t0, start: true });
        if (t1 > s && t1 < s + e) cuts.push({ t: t1, end: true });
      }
      cuts.sort((p, q) => p.t - q.t);
      for (const c of cuts) {
        const pt = geo.lerp(a, b, (c.t - s) / e);
        out.push({ x: pt.x, y: pt.y, tabStart: !!c.start, tabEnd: !!c.end });
      }
      s += e;
    }
    return out;
  }

  /**
   * Geschlossener Ring auf Höhe z1, Einstieg von z0 aus mit Rampe der Länge rampLen.
   * tabTop: Höhe der Stegoberkante (nur wirksam, wenn z1 < tabTop).
   */
  function loopChain(ring, z0, z1, rampLen, tabTop) {
    const n = ring.length;
    const L = geo.polyLength(ring, true);
    const out = [];
    const useTabs = tabTop != null && z1 < tabTop - 1e-9;
    const emit = (v, z) => {
      if (useTabs && v.tabStart) { out.push({ x: v.x, y: v.y, z }, { x: v.x, y: v.y, z: tabTop }); return; }
      if (useTabs && v.tabEnd) { out.push({ x: v.x, y: v.y, z: tabTop }, { x: v.x, y: v.y, z }); return; }
      out.push({ x: v.x, y: v.y, z: useTabs && v.inTab ? Math.max(z, tabTop) : z });
    };
    let ramp = Math.min(rampLen || 0, L * 0.95);
    if (tabTop != null) {
      // Rampe vor dem ersten Steg beenden
      const firstTab = ring.findIndex((v) => v.tabStart);
      if (firstTab > 0) ramp = Math.min(ramp, geo.polyLength(ring.slice(0, firstTab + 1)) - 0.5);
    }
    if (!(ramp > 0.5) || z0 <= z1 + 1e-9) {
      out.push({ x: ring[0].x, y: ring[0].y, z: Math.max(z0, z1) });
      for (let i = 0; i <= n; i++) emit(ring[i % n], z1);
      return out;
    }
    out.push({ x: ring[0].x, y: ring[0].y, z: z0 });
    let s = 0, i = 0, endPt = null;
    while (i < n) {
      const a = ring[i], b = ring[(i + 1) % n], e = geo.dist(a, b);
      if (s + e >= ramp) {
        const t = e > 0 ? (ramp - s) / e : 0;
        endPt = geo.lerp(a, b, t);
        out.push({ x: endPt.x, y: endPt.y, z: z1 });
        break;
      }
      s += e;
      out.push({ x: b.x, y: b.y, z: z0 + ((z1 - z0) * s) / ramp });
      i++;
    }
    for (let k = 1; k <= n; k++) emit(ring[(i + k) % n], z1);
    out.push({ x: endPt.x, y: endPt.y, z: z1 });
    return out;
  }

  // Liegt die Verbindungsstrecke a-b vollständig in der Fläche?
  function insideRegion(a, b, regionRings) {
    if (geo.dist(a, b) < 1e-6) return true;
    const outside = poly.clipLines([[a, b]], regionRings, false);
    let L = 0;
    for (const l of outside) L += geo.polyLength(l);
    return L < 0.005;
  }

  // ---------------- Kontur ----------------
  function profile(op, objs, tool, cut) {
    const r = tool.d / 2, warnings = [], chains = [], tabsShown = [];
    const rings = FS.shapes.rings(objs);
    const open = FS.shapes.openLines(objs);
    const zs = levels(op.startDepth || 0, op.depth, cut.stepdown);
    if (!rings.length && !open.length) warnings.push('Keine Linien ausgewählt.');
    const allow = Math.max(0, op.allowance || 0);
    let paths = [];
    const climb = op.direction !== 'conventional';
    const passes = [];
    if (rings.length) {
      const region = poly.clip(rings, null, 'union');
      const off = op.side === 'outside' ? r + allow : op.side === 'inside' ? -(r + allow) : 0;
      passes.push({ rings: off ? poly.offset(region, off) : region, rough: true });
      if (allow > 0 && op.finishPass && op.side !== 'on') passes.push({ rings: poly.offset(region, op.side === 'outside' ? r : -r), rough: false });
      if (!passes[0].rings.length) warnings.push('Form ist zu klein für dieses Werkzeug.');
    }
    for (const pass of passes) {
      // Teil für Teil in Leserichtung; bei jedem Teil zuerst die Innenkonturen (Löcher), zuletzt die Außenkontur,
      // damit sich das Teil nicht vorzeitig löst
      const orient = (ring) => {
        const isOuter = geo.signedArea(ring) > 0; // Clipper: außen gegen den Uhrzeigersinn
        // Gleichlauf: außen im Uhrzeigersinn, innen dagegen
        let ccw;
        if (op.side === 'inside') ccw = climb ? isOuter : !isOuter;
        else ccw = climb ? !isOuter : isOuter;
        return geo.orient(ring, ccw);
      };
      paths = [];
      for (const g of orderGroups(groupRings(pass.rings))) {
        for (const h of g.holes.slice().sort((x, y) => Math.abs(geo.signedArea(x)) - Math.abs(geo.signedArea(y)))) paths.push({ ring: orient(h) });
        paths.push({ ring: orient(g.outer) });
      }
      for (const { ring } of paths) {
        const useTabs = !!op.tabs && ring.length > 2;
        const tabTop = useTabs ? -(op.depth - op.tabHeight) : null;
        const tr = useTabs ? insertTabs(ring, op.tabCount, op.tabWidth + tool.d) : ring;
        if (useTabs) tr.forEach((v, i) => { if (v.tabStart) { const e = tr.slice(i).find((w) => w.tabEnd); if (e) tabsShown.push([{ x: v.x, y: v.y }, { x: e.x, y: e.y }]); } });
        const zl = pass.rough ? zs : [-op.depth];
        let prev = -(op.startDepth || 0);
        let pts = [];
        for (const z of zl) {
          const lc = loopChain(tr, pass.rough ? prev : -(op.startDepth || 0), z, op.ramp ? op.rampLen : 0, tabTop);
          if (!pass.rough) { pts = lc; prev = z; continue; }
          pts = pts.concat(lc);
          prev = z;
        }
        chains.push({ pts, clearZ: -(op.startDepth || 0) });
      }
    }
    // offene Linien: auf der Linie fräsen, hin und zurück
    if (open.length) for (const ch of engraveOpen(open, zs, -(op.startDepth || 0))) chains.push(ch);
    return { chains, warnings, tabs: tabsShown };
  }

  function engraveOpen(lines, zs, z0) {
    const chains = [];
    for (const l of lines) {
      let pts = [], fwd = true;
      pts.push({ x: l[0].x, y: l[0].y, z: z0 });
      for (const z of zs) {
        const seq = fwd ? l : l.slice().reverse();
        pts.push({ x: seq[0].x, y: seq[0].y, z });
        for (let i = 1; i < seq.length; i++) pts.push({ x: seq[i].x, y: seq[i].y, z });
        fwd = !fwd;
      }
      chains.push({ pts, clearZ: z0 });
    }
    return chains;
  }

  // ---------------- Gravieren ----------------
  function engrave(op, objs, tool, cut) {
    const zs = levels(op.startDepth || 0, op.depth, cut.stepdown);
    const chains = [];
    const rings = [];
    for (const g of orderGroups(groupRings(FS.shapes.rings(objs)))) rings.push(g.outer, ...g.holes); // Buchstabe für Buchstabe
    for (const ring of rings) {
      let pts = [], prev = -(op.startDepth || 0);
      for (const z of zs) { pts = pts.concat(loopChain(ring, prev, z, 0)); prev = z; }
      chains.push({ pts, clearZ: -(op.startDepth || 0) });
    }
    for (const ch of engraveOpen(FS.shapes.openLines(objs), zs, -(op.startDepth || 0))) chains.push(ch);
    return { chains, warnings: chains.length ? [] : ['Keine Linien ausgewählt.'] };
  }

  // ---------------- Tasche ----------------
  function pocketRegion(regionRings, tool, op, cut, zs, z0) {
    const r = tool.d / 2, allow = Math.max(0, op.allowance || 0);
    const step = Math.max(0.05, (tool.d * (op.stepover || tool.stepover || 40)) / 100);
    const region = poly.clip(regionRings, null, 'union');
    const first = poly.offset(region, -(r + allow));
    const chains = [], warnings = [];
    if (!first.length) { warnings.push('Tasche ist zu klein für dieses Werkzeug.'); return { chains, warnings }; }
    const climb = op.direction !== 'conventional';
    // Bahnen einer Ebene (unabhängig von z) erzeugen
    let loops = [];
    if (op.strategy === 'raster') {
      const ang = ((op.angle || 0) * Math.PI) / 180, c = Math.cos(ang), s = Math.sin(ang);
      const rot = (p, k) => ({ x: p.x * c + k * p.y * s, y: -k * p.x * s + p.y * c });
      const rr = first.map((ring) => ring.map((p) => rot(p, 1)));
      const b = geo.bounds(rr);
      const lines = [];
      for (let y = b.y0 + step / 2; y < b.y1; y += step) lines.push([{ x: b.x0 - 1, y }, { x: b.x1 + 1, y }].map((p) => rot(p, -1)));
      const segs = poly.clipLines(lines, first, true);
      // nach Zeile sortieren, Zickzack
      const keyed = segs.map((sg) => {
        const a = rot(sg[0], 1), e = rot(sg[sg.length - 1], 1);
        return { sg: a.x <= e.x ? sg : sg.slice().reverse(), y: a.y, x: Math.min(a.x, e.x) };
      }).sort((p, q) => p.y - q.y || p.x - q.x);
      let flip = false, lastY = null;
      for (const k of keyed) {
        if (lastY !== null && Math.abs(k.y - lastY) > 1e-6) flip = !flip;
        lastY = k.y;
        loops.push({ pts: flip ? k.sg.slice().reverse() : k.sg, closed: false });
      }
      // Randbahn zum Schluss
      for (const ring of first) loops.push({ pts: geo.orient(ring, climb ? geo.signedArea(ring) > 0 : geo.signedArea(ring) < 0), closed: true, final: true });
    } else {
      // konturparallel: von innen nach außen
      const rounds = [];
      let cur = first;
      for (let k = 0; cur.length && k < 2000; k++) { rounds.push(cur); cur = poly.offset(cur, -step); }
      for (let k = rounds.length - 1; k >= 0; k--) for (const ring of rounds[k]) {
        // Tasche im Gleichlauf: Außenrand gegen den Uhrzeigersinn
        const outer = geo.signedArea(ring) > 0;
        loops.push({ pts: geo.orient(ring, climb ? outer : !outer), closed: true });
      }
    }
    let prev = z0;
    for (const z of zs) {
      let chain = null, pos = null;
      const pend = loops.slice();
      while (pend.length) {
        // nächste Bahn suchen (bei konturparallel Reihenfolge beibehalten, nur Startpunkt wählen)
        const L = pend.shift();
        const pts = L.closed && pos ? rotateTo(L.pts, pos) : L.pts;
        const start = pts[0];
        if (chain && pos && insideRegion(pos, start, first)) {
          if (L.closed) chain.pts.push(...loopChain(pts, z, z, 0).slice(0));
          else for (const p of pts) chain.pts.push({ x: p.x, y: p.y, z });
        } else {
          if (chain) chains.push(chain);
          chain = { pts: [], clearZ: prev };
          if (L.closed) chain.pts.push(...loopChain(pts, prev, z, op.ramp ? op.rampLen : 0));
          else {
            // Rampe entlang der ersten Zeile
            chain.pts.push({ x: start.x, y: start.y, z: prev });
            const rampLen = op.ramp ? Math.min(op.rampLen, geo.polyLength(pts) * 0.9) : 0;
            if (rampLen > 0.5) {
              const end = FS.cam.pointAtLen(pts, rampLen);
              chain.pts.push({ x: end.x, y: end.y, z }, { x: start.x, y: start.y, z });
            } else chain.pts.push({ x: start.x, y: start.y, z });
            for (let i = 1; i < pts.length; i++) chain.pts.push({ x: pts[i].x, y: pts[i].y, z });
          }
        }
        const last = chain.pts[chain.pts.length - 1];
        pos = { x: last.x, y: last.y };
      }
      if (chain) chains.push(chain);
      prev = z;
    }
    return { chains, warnings };
  }

  function pointAtLen(pl, s) {
    let acc = 0;
    for (let i = 1; i < pl.length; i++) {
      const d = geo.dist(pl[i - 1], pl[i]);
      if (acc + d >= s) return geo.lerp(pl[i - 1], pl[i], d > 0 ? (s - acc) / d : 0);
      acc += d;
    }
    return pl[pl.length - 1];
  }

  function pocket(op, objs, tool, cut) {
    const rings = FS.shapes.rings(objs);
    if (!rings.length) return { chains: [], warnings: ['Für eine Tasche braucht es geschlossene Formen.'] };
    const zs = levels(op.startDepth || 0, op.depth, cut.stepdown);
    // Jedes Teil (Buchstabe, Insel-Gruppe) für sich über ALLE Tiefen, dann das nächste – nicht Ebene für Ebene über alles
    const shapes = orderGroups(poly.nest(poly.clip(rings, null, 'union')));
    const chains = [], warnings = new Set();
    let tooSmall = 0;
    for (const sh of shapes) {
      const res = pocketRegion([sh.outer, ...sh.holes], tool, op, cut, zs, -(op.startDepth || 0));
      chains.push(...res.chains);
      if (res.warnings.length && !res.chains.length) tooSmall++; else res.warnings.forEach((w) => warnings.add(w));
    }
    if (tooSmall) warnings.add(tooSmall === shapes.length ? 'Tasche ist zu klein für dieses Werkzeug.' : `${tooSmall} kleine Teil(e) sind zu klein für dieses Werkzeug und werden nicht ausgeräumt.`);
    return { chains, warnings: [...warnings] };
  }

  // ---------------- Planfräsen ----------------
  function face(op, stock, tool, cut) {
    const m = (op.margin != null ? op.margin : 2) + tool.d / 2;
    const rect = [{ x: -m, y: -m }, { x: stock.w + m, y: -m }, { x: stock.w + m, y: stock.h + m }, { x: -m, y: stock.h + m }];
    const zs = levels(op.startDepth || 0, op.depth, cut.stepdown);
    const fake = { ...op, strategy: 'raster', allowance: 0, ramp: true, rampLen: 20 };
    // Werkzeug darf über den Rand hinaus: Fläche um den Radius vergrößern, damit die Mitte den Rand erreicht
    const big = poly.offset([rect], tool.d / 2, 'miter');
    return pocketRegion(big, tool, fake, cut, zs, -(op.startDepth || 0));
  }

  // ---------------- Bohren ----------------
  function drill(op, objs, tool, cut) {
    const chains = [], warnings = [];
    const z0 = -(op.startDepth || 0);
    const holes = objs.map((o) => FS.shapes.circleOf(o)).filter(Boolean);
    for (const c of readingOrder(holes, (q) => ({ x0: q.x - q.d / 2, x1: q.x + q.d / 2, y0: q.y - q.d / 2, y1: q.y + q.d / 2 }))) {
      const helix = tool.type !== 'drill' && c.d > tool.d + 0.05;
      if (!helix) {
        if (c.d < tool.d - 0.05) warnings.push(`Bohrung ${FS.util.fmt(c.d)} mm ist kleiner als das Werkzeug (${FS.util.fmt(tool.d)} mm).`);
        const pts = [{ x: c.x, y: c.y, z: z0 }];
        const peck = op.peck > 0 ? op.peck : op.depth;
        for (let d = (op.startDepth || 0) + peck; ; d += peck) {
          const z = -Math.min(d, op.depth);
          pts.push({ x: c.x, y: c.y, z });
          if (z <= -op.depth + 1e-9) break;
          pts.push({ x: c.x, y: c.y, z: z0 + 1, rapid: true }, { x: c.x, y: c.y, z: z + 0.3, rapid: true });
        }
        chains.push({ pts, clearZ: z0 });
      } else {
        // Helix-Bohren (Zirkularfräsen) im Gleichlauf
        const rh = (c.d - tool.d) / 2, pitch = Math.max(0.1, cut.stepdown);
        const seg = Math.max(16, Math.ceil((2 * Math.PI * rh) / 0.3));
        const pts = [{ x: c.x + rh, y: c.y, z: z0 }];
        const total = op.depth - (op.startDepth || 0);
        const turns = Math.max(1, Math.ceil(total / pitch));
        for (let k = 1; k <= turns * seg; k++) {
          const a = (2 * Math.PI * k) / seg;
          pts.push({ x: c.x + rh * Math.cos(a), y: c.y + rh * Math.sin(a), z: z0 - (total * k) / (turns * seg) });
        }
        for (let k = 1; k <= seg; k++) {
          const a = (2 * Math.PI * k) / seg;
          pts.push({ x: c.x + rh * Math.cos(a), y: c.y + rh * Math.sin(a), z: -op.depth });
        }
        pts.push({ x: c.x, y: c.y, z: -op.depth });
        chains.push({ pts, clearZ: z0 });
      }
    }
    if (!chains.length) warnings.push('Keine Bohrungen ausgewählt (Kreise wählen).');
    return { chains, warnings };
  }

  // ---------------- V-Carving ----------------
  function resampleClosed(ring, step) {
    const out = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length], e = geo.dist(a, b);
      const n = Math.max(1, Math.ceil(e / step));
      for (let k = 0; k < n; k++) out.push(geo.lerp(a, b, k / n));
    }
    return out;
  }

  function vcarve(op, objs, tool, cut, tools) {
    const warnings = [], chains = [];
    if (tool.type !== 'vbit') warnings.push('V-Carving braucht einen V-Fräser.');
    const half = ((tool.angle || 60) * Math.PI) / 360, tn = Math.tan(half);
    const tip = (tool.tip || 0) / 2, R = tool.d / 2;
    const toolMax = (R - tip) / tn;
    const maxD = op.maxDepth > 0 ? Math.min(op.maxDepth, toolMax) : toolMax;
    const rCap = tip + maxD * tn;
    const step = Math.max(0.05, op.step || 0.2);
    const shapes = orderGroups(poly.nest(FS.shapes.rings(objs)));
    if (!shapes.length) return { chains, warnings: warnings.concat('Für V-Carving braucht es geschlossene Formen.') };
    const ct = op.clearToolId && tools.find((t) => t.id === op.clearToolId);
    const ccut = ct ? FS.tools.cutParams(ct, cut.material, cut.machine) : null;
    const clearChains = [];
    let tipHint = false;
    for (const sh of shapes) {
      let shCapped = false;
      const rings = [geo.orient(sh.outer, true), ...sh.holes.map((h) => geo.orient(h, false))].map((r) => resampleClosed(r, step));
      let nq = 0;
      for (const r of rings) nq += r.length;
      const qx = new Float64Array(nq), qy = new Float64Array(nq);
      let k = 0;
      for (const r of rings) for (const p of r) { qx[k] = p.x; qy[k] = p.y; k++; }
      const inscribed = (px, py, nx, ny) => {
        let best = rCap;
        for (let i = 0; i < nq; i++) {
          const dx = qx[i] - px, dy = qy[i] - py, d2 = dx * dx + dy * dy;
          if (d2 < 1e-12 || d2 >= 4 * best * best) continue;
          const dot = nx * dx + ny * dy;
          if (dot <= 1e-9) continue;
          const f = d2 / (2 * dot);
          if (f < best) best = f;
        }
        return best;
      };
      for (const P of rings) {
        const n = P.length, pts = [];
        const pushC = (p, nx, ny) => {
          const r = inscribed(p.x, p.y, nx, ny);
          if (r >= rCap - 1e-6) shCapped = true;
          const z = -Math.min(maxD, Math.max(0, r - tip) / tn);
          pts.push({ x: p.x + nx * r, y: p.y + ny * r, z });
        };
        for (let i = 0; i < n; i++) {
          const a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n];
          let e1x = b.x - a.x, e1y = b.y - a.y, e2x = c.x - b.x, e2y = c.y - b.y;
          const l1 = Math.hypot(e1x, e1y) || 1, l2 = Math.hypot(e2x, e2y) || 1;
          e1x /= l1; e1y /= l1; e2x /= l2; e2y /= l2;
          const cross = e1x * e2y - e1y * e2x, dot = e1x * e2x + e1y * e2y;
          const ang = Math.atan2(cross, dot);
          const n1x = -e1y, n1y = e1x, n2x = -e2y, n2y = e2x;
          if (Math.abs(ang) < (25 * Math.PI) / 180) {
            let nx = n1x + n2x, ny = n1y + n2y;
            const l = Math.hypot(nx, ny) || 1;
            pushC(b, nx / l, ny / l);
          } else if (ang > 0) {
            pts.push({ x: b.x, y: b.y, z: 0 });
          } else {
            const steps = Math.max(2, Math.ceil(Math.abs(ang) / ((8 * Math.PI) / 180)));
            for (let s = 0; s <= steps; s++) {
              const t = (ang * s) / steps, cs = Math.cos(t), sn = Math.sin(t);
              pushC(b, n1x * cs - n1y * sn, n1x * sn + n1y * cs);
            }
          }
        }
        if (pts.length) pts.push({ ...pts[0] });
        // Mehrere Durchgänge, falls tiefer als die Zustellung: Zwischendurchgänge nur, wo noch Material ist
        if (!pts.length) continue;
        const deepest = Math.min(...pts.map((p) => p.z));
        const zs = levels(0, -deepest, cut.stepdown);
        const out = [];
        let prevL = 0;
        const addRun = (from, to, L) => {
          const s0 = pts[from], zs0 = Math.max(s0.z, L);
          if (out.length) {
            const last = out[out.length - 1];
            if (geo.dist(last, s0) > 1e-6 || Math.abs(last.z - zs0) > 1e-6) {
              out.push({ x: last.x, y: last.y, z: 1, rapid: true }, { x: s0.x, y: s0.y, z: 1, rapid: true });
              const down = Math.max(s0.z, prevL) + 0.3;
              if (down < 1) out.push({ x: s0.x, y: s0.y, z: down, rapid: true });
            }
          }
          for (let i = from; i <= to; i++) out.push({ x: pts[i].x, y: pts[i].y, z: Math.max(pts[i].z, L) });
        };
        zs.forEach((L, li) => {
          if (li === zs.length - 1) { addRun(0, pts.length - 1, L); return; }
          let st = -1;
          for (let i = 0; i <= pts.length; i++) {
            const need = i < pts.length && pts[i].z < prevL - 1e-6;
            if (need && st < 0) st = Math.max(0, i - 1);
            if (!need && st >= 0) { addRun(st, Math.min(pts.length - 1, i), L); st = -1; }
          }
          prevL = L;
        });
        if (out.length) chains.push({ pts: simplify3(out, 0.005), clearZ: 0 });
      }
      // flache Böden dieses Buchstabens ausräumen – gleich nach ihm (mit Ausräumwerkzeug: im eigenen Abschnitt, aber Buchstabe für Buchstabe)
      if (shCapped && maxD < toolMax - 1e-6) {
        const inner = poly.offset(poly.clip([sh.outer, ...sh.holes], null, 'union'), -rCap);
        if (inner.length) {
          if (ct) {
            const res = pocketRegion(inner, ct, { strategy: 'offset', direction: 'climb', ramp: true, rampLen: 8, stepover: ct.stepover }, ccut, levels(0, maxD, ccut.stepdown), 0);
            clearChains.push(...res.chains);
            warnings.push(...res.warnings.filter((w) => !warnings.includes(w)));
          } else {
            const fakeTool = { ...tool, d: Math.max(0.2, tip * 2 + 0.2) };
            const res = pocketRegion(inner, fakeTool, { strategy: 'offset', direction: 'climb', ramp: false, stepover: Math.min(90, (Math.max(0.3, rCap * 0.6) / fakeTool.d) * 100) }, cut, [-maxD], 0);
            chains.push(...res.chains);
            tipHint = true;
          }
        }
      }
    }
    if (tipHint) warnings.push('Tipp: Für flache Böden ein Ausräumwerkzeug (Schaftfräser) wählen – das geht schneller und sauberer.');
    const clear = ct && clearChains.length ? { chains: clearChains, tool: ct, cut: ccut } : null;
    return { chains, warnings, clear };
  }

  // 3D-Vereinfachung (Ramer-Douglas-Peucker mit z). Eilgang-Punkte bleiben erhalten; jeder Abschnitt dazwischen
  // wird für sich vereinfacht (sonst würde bei vielen Eilgängen die ganze Bahn immer wieder durchsucht).
  function simplify3(pl, tol) {
    if (pl.length < 3) return pl;
    const keep = new Uint8Array(pl.length);
    keep[0] = keep[pl.length - 1] = 1;
    const stack = [];
    let s0 = 0;
    for (let i = 1; i < pl.length; i++) if (pl[i].rapid || i === pl.length - 1) { keep[i] = 1; if (i - s0 > 1) stack.push([s0, i]); s0 = i; }
    while (stack.length) {
      const [s, e] = stack.pop();
      const a = pl[s], b = pl[e];
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L2 = dx * dx + dy * dy + dz * dz;
      let md = 0, mi = -1;
      for (let i = s + 1; i < e; i++) {
        const p = pl[i];
        let t = L2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy + (p.z - a.z) * dz) / L2 : 0;
        t = Math.max(0, Math.min(1, t));
        const ex = p.x - a.x - t * dx, ey = p.y - a.y - t * dy, ez = p.z - a.z - t * dz;
        const d = ex * ex + ey * ey + ez * ez;
        if (d > md) { md = d; mi = i; }
      }
      if (md > tol * tol && mi > 0) { keep[mi] = 1; stack.push([s, mi], [mi, e]); }
    }
    return pl.filter((_, i) => keep[i]);
  }

  // ---------------- 3D-Relief ----------------
  // Höhe eines Reliefs (0..1) an einer Weltposition, bilinear; null außerhalb
  function reliefSampler(o) {
    const b = FS.shapes.bbox([o]);
    const hm = FS.relief.decode(o);
    const { nx, ny, data } = hm;
    return {
      b,
      at(x, y) {
        const u = ((x - b.x0) / b.w) * (nx - 1), v = ((b.y1 - y) / b.h) * (ny - 1);
        if (u < 0 || v < 0 || u > nx - 1 || v > ny - 1) return null;
        const i = Math.min(nx - 2, Math.floor(u)), j = Math.min(ny - 2, Math.floor(v));
        const fu = u - i, fv = v - j;
        const h00 = data[j * nx + i], h10 = data[j * nx + i + 1], h01 = data[(j + 1) * nx + i], h11 = data[(j + 1) * nx + i + 1];
        let h = h00 * (1 - fu) * (1 - fv) + h10 * fu * (1 - fv) + h01 * (1 - fu) * fv + h11 * fu * fv;
        if (o.invert) h = 1 - h;
        return -(o.depth || 5) * (1 - h);
      },
    };
  }

  // Werkzeugkompensierte Höhenkarte (Drop-Cutter): niedrigste Z, ohne die Oberfläche zu verletzen
  function dropCutterGrid(o, tool, cs) {
    const S = reliefSampler(o);
    const R = tool.d / 2, prof = FS.tools.profile(tool);
    const b = S.b, nx = Math.max(2, Math.round(b.w / cs) + 1), ny = Math.max(2, Math.round(b.h / cs) + 1);
    const pad = Math.ceil(R / cs) + 1;
    const W = nx + 2 * pad, H = ny + 2 * pad;
    const surf = new Float32Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const x = b.x0 + (i - pad) * cs, y = b.y0 + (j - pad) * cs;
      const h = S.at(x, y);
      surf[j * W + i] = h === null ? 0 : h; // außerhalb: Oberfläche (Wand bleibt stehen)
    }
    // Profilteile höher als die ganze Relieftiefe können nie die Höhe bestimmen (spart beim Kegel viel Rechenzeit)
    const maxP = (o.depth || 5) + 0.01;
    const fp = [];
    for (let dj = -pad; dj <= pad; dj++) for (let di = -pad; di <= pad; di++) {
      const p = prof(Math.hypot(di * cs, dj * cs));
      if (p <= maxP) fp.push(dj * W + di, p);
    }
    const comp = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const c = (j + pad) * W + (i + pad);
      let m = -Infinity;
      for (let k = 0; k < fp.length; k += 2) { const v = surf[c + fp[k]] - fp[k + 1]; if (v > m) m = v; }
      comp[j * nx + i] = m;
    }
    return { comp, nx, ny, x0: b.x0, y0: b.y0, cs };
  }

  function gridCell(o) {
    const b = FS.shapes.bbox([o]);
    return Math.max(0.1, Math.sqrt((b.w * b.h) / 1.2e6));
  }

  function reliefFinish(op, objs, tool, cut) {
    const chains = [], warnings = [];
    if (tool.type === 'flat') warnings.push('Zum Schlichten eignet sich ein Kugelfräser besser.');
    const reliefs = objs.filter((o) => o.kind === 'relief');
    if (!reliefs.length) return { chains, warnings: ['Bitte ein 3D-Relief auswählen.'] };
    for (const o of reliefs) {
      const cs = gridCell(o);
      const G = dropCutterGrid(o, tool, cs);
      const so = Math.max(cs, (FS.tools.effD(tool) * (op.stepover || tool.stepover || 12)) / 100);
      const rowStep = Math.max(1, Math.round(so / cs));
      const dirs = op.both ? ['x', 'y'] : [op.angle === 90 ? 'y' : 'x'];
      for (const dir of dirs) {
        const pts = [];
        const nA = dir === 'x' ? G.ny : G.nx, nB = dir === 'x' ? G.nx : G.ny;
        let flip = false;
        for (let a = 0; a < nA; a += rowStep) {
          const row = [];
          for (let bI = 0; bI < nB; bI++) {
            const i = dir === 'x' ? bI : a, j = dir === 'x' ? a : bI;
            row.push({ x: G.x0 + i * G.cs, y: G.y0 + j * G.cs, z: Math.min(0, G.comp[j * G.nx + i]) });
          }
          if (flip) row.reverse();
          pts.push(...row);
          flip = !flip;
        }
        chains.push({ pts: simplify3(pts, 0.01), clearZ: 0 });
      }
    }
    return { chains, warnings };
  }

  function reliefRough(op, objs, tool, cut) {
    const chains = [], warnings = [];
    const reliefs = objs.filter((o) => o.kind === 'relief');
    if (!reliefs.length) return { chains, warnings: ['Bitte ein 3D-Relief auswählen.'] };
    const allow = Math.max(0, op.allowance || 0);
    for (const o of reliefs) {
      const cs = Math.max(gridCell(o), 0.2);
      const G = dropCutterGrid(o, tool, cs);
      let minZ = 0;
      for (const v of G.comp) if (v < minZ) minZ = v;
      const zs = levels(op.startDepth || 0, -minZ - allow, cut.stepdown);
      const so = Math.max(cs, (tool.d * (op.stepover || tool.stepover || 40)) / 100);
      const rowStep = Math.max(1, Math.round(so / cs));
      const maxGap = Math.max(2, Math.round((tool.d * 3) / cs));
      let prevL = -(op.startDepth || 0);
      let chain = null, last = null;
      const X = (i) => G.x0 + i * G.cs, Y = (j) => G.y0 + j * G.cs;
      // Obergrenze des stehenden Materials: Maximum der Bahnhöhen im Umkreis von 2 Werkzeugradien (getrennter Max-Filter)
      const D = maxFilter(G.comp, G.nx, G.ny, Math.ceil(tool.d / G.cs) + 1);
      // sichere Verbindungshöhe: knapp über dem Material, das nach der vorigen Ebene noch steht
      const linkZ = (i0, j0, i1, j1) => {
        const n = Math.max(Math.abs(i1 - i0), Math.abs(j1 - j0), 1);
        let h = prevL;
        for (let k = 0; k <= n; k++) {
          const ii = Math.round(i0 + ((i1 - i0) * k) / n), jj = Math.round(j0 + ((j1 - j0) * k) / n);
          h = Math.max(h, Math.min(0, D[jj * G.nx + ii] + allow));
        }
        return Math.min(h, 0) + 0.5;
      };
      for (const L of zs) {
        const zAt = (i, j) => Math.max(L, Math.min(0, G.comp[j * G.nx + i] + allow));
        const need = (i, j) => G.comp[j * G.nx + i] + allow < prevL - 1e-4;
        let flip = false;
        for (let j = 0; j < G.ny; j += rowStep) {
          // Abschnitte mit Material in dieser Zeile
          const runs = [];
          let s = -1;
          for (let i = 0; i <= G.nx; i++) {
            const w = i < G.nx && need(i, j);
            if (w && s < 0) s = i;
            if (!w && s >= 0) { runs.push([Math.max(0, s - 1), Math.min(G.nx - 1, i)]); s = -1; }
          }
          if (!runs.length) continue;
          const ordered = flip ? runs.slice().reverse().map(([a, b]) => [b, a]) : runs;
          flip = !flip;
          for (const [a, b] of ordered) {
            const stepI = a <= b ? 1 : -1;
            if (!chain) chain = { pts: [], clearZ: Math.max(prevL, zAt(a, j)) };
            else if (last.L === L && Math.abs(last.j - j) <= rowStep && Math.abs(last.i - a) <= maxGap) {
              // kurzer Weg: an der Oberfläche entlang weiterfräsen
              const n = Math.max(Math.abs(last.i - a), Math.abs(last.j - j), 1);
              for (let k = 1; k < n; k++) {
                const ii = Math.round(last.i + ((a - last.i) * k) / n), jj = Math.round(last.j + ((j - last.j) * k) / n);
                chain.pts.push({ x: X(ii), y: Y(jj), z: Math.max(zAt(ii, jj), zAt(ii, j), zAt(ii, last.j)) });
              }
            } else {
              // weiter Weg: knapp über dem Material im Eilgang
              const hz = linkZ(last.i, last.j, a, j);
              chain.pts.push({ x: X(last.i), y: Y(last.j), z: hz, rapid: true }, { x: X(a), y: Y(j), z: hz, rapid: true });
            }
            for (let i = a; stepI > 0 ? i <= b : i >= b; i += stepI) chain.pts.push({ x: X(i), y: Y(j), z: zAt(i, j) });
            last = { i: b, j, L };
          }
        }
        prevL = L;
      }
      if (chain) chains.push({ pts: simplify3(chain.pts, 0.01), clearZ: chain.clearZ });
    }
    return { chains, warnings };
  }

  // Maximum im Quadrat (2k+1)² – getrennt in Zeilen und Spalten
  function maxFilter(src, nx, ny, k) {
    const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      let m = -Infinity;
      for (let d = Math.max(0, i - k); d <= Math.min(nx - 1, i + k); d++) m = Math.max(m, src[j * nx + d]);
      tmp[j * nx + i] = m;
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      let m = -Infinity;
      for (let d = Math.max(0, j - k); d <= Math.min(ny - 1, j + k); d++) m = Math.max(m, tmp[d * nx + i]);
      out[j * nx + i] = m;
    }
    return out;
  }

  // ---------------- 3D-Restmaterial ----------------
  // Ein feiner Fräser arbeitet nur dort nach, wo er tiefer kommt als das vorherige (größere) Werkzeug.
  function reliefRest(op, objs, tool, cut, tools) {
    const chains = [], warnings = [];
    const reliefs = objs.filter((o) => o.kind === 'relief');
    if (!reliefs.length) return { chains, warnings: ['Bitte ein 3D-Relief auswählen.'] };
    const ref = tools.find((t) => t.id === op.refToolId);
    if (!ref) return { chains, warnings: ['Bitte das vorherige Werkzeug angeben (das, mit dem geschlichtet wurde).'] };
    if (FS.tools.effD(ref) <= FS.tools.effD(tool) + 1e-6) warnings.push('Das Werkzeug für das Restmaterial sollte feiner sein als das vorherige.');
    const minRest = Math.max(0.01, op.minRest || 0.05);
    let restCells = 0;
    for (const o of reliefs) {
      const cs = gridCell(o);
      const A = dropCutterGrid(o, tool, cs), B = dropCutterGrid(o, ref, cs);
      const { nx, ny } = A;
      // Restbereiche: feiner Fräser kommt deutlich tiefer; etwas aufweiten, damit Übergänge sauber werden
      let mask = new Float32Array(nx * ny);
      for (let i = 0; i < mask.length; i++) mask[i] = Math.min(0, A.comp[i]) < Math.min(0, B.comp[i]) - minRest ? 1 : 0;
      mask = maxFilter(mask, nx, ny, Math.max(1, Math.round(FS.tools.effD(tool) / cs / 2)));
      for (const v of mask) restCells += v;
      // Obergrenze des stehenden Materials (nach dem Schlichten mit dem großen Werkzeug) für Verbindungsfahrten
      const D = maxFilter(B.comp, nx, ny, Math.ceil(ref.d / cs) + 1);
      const so = Math.max(cs, (FS.tools.effD(tool) * (op.stepover || tool.stepover || 15)) / 100);
      const rowStep = Math.max(1, Math.round(so / cs)), maxGap = Math.max(2, Math.round((FS.tools.effD(tool) * 4) / cs));
      const alongY = op.angle === 90;
      const nA = alongY ? nx : ny, nB = alongY ? ny : nx;
      const idx = (a, b) => (alongY ? b * nx + a : a * nx + b);
      const XY = (a, b) => (alongY ? { x: A.x0 + a * cs, y: A.y0 + b * cs } : { x: A.x0 + b * cs, y: A.y0 + a * cs });
      const zAt = (a, b) => Math.min(0, A.comp[idx(a, b)]);
      let chain = null, last = null, flip = false;
      for (let a = 0; a < nA; a += rowStep) {
        const runs = [];
        let st = -1;
        for (let b = 0; b <= nB; b++) {
          const w = b < nB && mask[idx(a, b)] > 0;
          if (w && st < 0) st = b;
          if (!w && st >= 0) { runs.push([st, b - 1]); st = -1; }
        }
        if (!runs.length) continue;
        const ordered = flip ? runs.slice().reverse().map(([p, q]) => [q, p]) : runs;
        flip = !flip;
        for (const [b0, b1] of ordered) {
          if (!chain) chain = { pts: [], clearZ: 0 };
          else if (Math.abs(last.a - a) <= rowStep && Math.abs(last.b - b0) <= maxGap) {
            // kurz: auf der Endkontur entlang
            const n = Math.max(Math.abs(last.b - b0), Math.abs(last.a - a), 1);
            for (let k = 1; k < n; k++) {
              const aa = Math.round(last.a + ((a - last.a) * k) / n), bb = Math.round(last.b + ((b0 - last.b) * k) / n);
              chain.pts.push({ ...XY(aa, bb), z: Math.max(zAt(aa, bb), zAt(last.a, bb), zAt(a, bb)) });
            }
          } else {
            // weit: knapp über dem stehenden Material im Eilgang
            const n = Math.max(Math.abs(last.b - b0), Math.abs(last.a - a), 1);
            let h = -Infinity;
            for (let k = 0; k <= n; k++) {
              const aa = Math.round(last.a + ((a - last.a) * k) / n), bb = Math.round(last.b + ((b0 - last.b) * k) / n);
              h = Math.max(h, Math.min(0, D[idx(aa, bb)]));
            }
            chain.pts.push({ ...XY(last.a, last.b), z: h + 0.5, rapid: true }, { ...XY(a, b0), z: h + 0.5, rapid: true });
          }
          const sb = b0 <= b1 ? 1 : -1;
          for (let b = b0; sb > 0 ? b <= b1 : b >= b1; b += sb) chain.pts.push({ ...XY(a, b), z: zAt(a, b) });
          last = { a, b: b1 };
        }
      }
      if (chain) chains.push({ pts: simplify3(chain.pts, 0.005), clearZ: 0 });
    }
    if (!restCells) warnings.push('Kein Restmaterial gefunden – das vorherige Werkzeug erreicht schon alles.');
    return { chains, warnings };
  }

  // ---------------- Auswertung ----------------
  /** Eine Bearbeitung berechnen. ctx: {objects, tools, stock, machine} */
  function compute(op, ctx) {
    const tool = ctx.tools.find((t) => t.id === op.toolId) || ctx.tools[0];
    const base = FS.tools.cutParams(tool, ctx.stock.material, ctx.machine);
    const cut = {
      feed: op.feed > 0 ? op.feed : base.feed,
      plunge: op.plunge > 0 ? op.plunge : base.plunge,
      stepdown: op.stepdown > 0 ? op.stepdown : base.stepdown,
      rpm: op.rpm > 0 ? op.rpm : base.rpm,
      material: ctx.stock.material, machine: ctx.machine,
    };
    const objs = ctx.objects.filter((o) => op.objIds.includes(o.id) && !o.hidden);
    let res;
    try {
      switch (op.type) {
        case 'profile': res = profile(op, objs, tool, cut); break;
        case 'pocket': res = pocket(op, objs, tool, cut); break;
        case 'drill': res = drill(op, objs, tool, cut); break;
        case 'vcarve': res = vcarve(op, objs, tool, cut, ctx.tools); break;
        case 'engrave': res = engrave(op, objs, tool, cut); break;
        case 'relief_rough': res = reliefRough(op, objs, tool, cut); break;
        case 'relief_finish': res = reliefFinish(op, objs, tool, cut); break;
        case 'relief_rest': res = reliefRest(op, objs, tool, cut, ctx.tools); break;
        case 'face': res = face(op, ctx.stock, tool, cut); break;
        default: res = { chains: [], warnings: ['Unbekannte Bearbeitung'] };
      }
    } catch (e) {
      res = { chains: [], warnings: ['Fehler bei der Berechnung: ' + e.message] };
    }
    res.tool = tool;
    res.cut = cut;
    res.op = op;
    const deep = op.depth || op.maxDepth || 0;
    if (deep > ctx.stock.t + 0.5 && op.type !== 'face') res.warnings.push(`Tiefe ${FS.util.fmt(deep)} mm ist mehr als die Materialstärke (${FS.util.fmt(ctx.stock.t)} mm) – Opferplatte verwenden!`);
    if (tool.len && deep > tool.len + 0.01 && op.type !== 'vcarve') res.warnings.push(`Tiefe ist größer als die Schneidenlänge des Werkzeugs (${FS.util.fmt(tool.len)} mm).`);
    return res;
  }

  FS.cam = { OP_TYPES, OP_DEFAULTS, makeOp, compute, levels, insertTabs, loopChain, pointAtLen, simplify3, dropCutterGrid, reliefSampler, resampleClosed };
})(typeof window !== 'undefined' ? window : globalThis);
