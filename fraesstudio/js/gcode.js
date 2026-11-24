/* G-Code für GRBL erzeugen und lesen. */
(function (g) {
  const FS = (g.FS = g.FS || {});

  const ZERO_POS = {
    ll: [0, 0], lc: [0.5, 0], lr: [1, 0],
    cl: [0, 0.5], c: [0.5, 0.5], cr: [1, 0.5],
    ul: [0, 1], uc: [0.5, 1], ur: [1, 1],
  };

  function origin(stock) {
    const z = ZERO_POS[stock.zeroXY || 'll'] || ZERO_POS.ll;
    return { x: z[0] * stock.w, y: z[1] * stock.h, z: stock.zeroZ === 'bottom' ? -stock.t : 0 };
  }

  const num = (v, d = 3) => {
    let s = v.toFixed(d);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s === '-0' ? '0' : s;
  };

  // Kommentare nur in ASCII (manche GRBL-Versionen melden sonst Fehler)
  const clean = (s) => String(s)
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss')
    .replace(/[–—]/g, '-').replace(/°/g, ' Grad').replace(/(\d),(\d)/g, '$1.$2').replace(/,/g, ' /').replace(/[()]/g, '').replace(/[^\x20-\x7e]/g, '');

  /**
   * results: Liste von compute()-Ergebnissen (in Reihenfolge). Liefert {text, moves, time, toolChanges}.
   * moves: {x,y,z, rapid, f, op} in Entwurfskoordinaten (z=0 Oberfläche) – für Simulation und Vorschau.
   */
  function build(results, ctx) {
    const stock = ctx.stock, mach = ctx.machine;
    const O = origin(stock);
    const safeZ = stock.safeZ || 5;
    const L = [];
    const moves = [];
    // Startposition der Maschine ist unbekannt: X und Y beim ersten Verfahren immer ausgeben
    let pos = { x: Infinity, y: Infinity, z: safeZ }, lastF = null, lastTool = null, lastS = null, lastDial = null, time = 0, toolChanges = 0;
    const date = new Date().toISOString().slice(0, 16).replace('T', ' ');
    L.push(`(FraesStudio - ${clean(ctx.name || 'Projekt')})`);
    L.push(`(Erstellt ${date} - Maschine: ${clean(mach.name)})`);
    if (ctx.rot) L.push(`(Gedreht um ${num((ctx.rot * 180) / Math.PI, 2)} Grad - Werkstueck liegt schief)`);
    L.push(`(Werkstueck ${num(stock.w, 1)} x ${num(stock.h, 1)} x ${num(stock.t, 1)} mm - Nullpunkt ${stock.zeroXY || 'll'} / ${stock.zeroZ === 'bottom' ? 'Tisch' : 'Oberflaeche'})`);
    L.push('G21 G90 G94 G17');
    L.push('M5');
    L.push(`G0 Z${num(safeZ - O.z)}`);

    // schief aufgelegtes Werkstück: Bahnen um den Nullpunkt in die Lage des Werkstücks drehen
    const rc = Math.cos(ctx.rot || 0), rs = Math.sin(ctx.rot || 0);
    const out = (cmd, p, f) => {
      let s = cmd;
      if (ctx.rot) {
        if (Math.abs(p.x - pos.x) > 1e-6 || Math.abs(p.y - pos.y) > 1e-6) {
          const dx = p.x - O.x, dy = p.y - O.y;
          s += ' X' + num(dx * rc - dy * rs) + ' Y' + num(dx * rs + dy * rc);
        }
      } else {
        if (Math.abs(p.x - pos.x) > 1e-6) s += ' X' + num(p.x - O.x);
        if (Math.abs(p.y - pos.y) > 1e-6) s += ' Y' + num(p.y - O.y);
      }
      if (Math.abs(p.z - pos.z) > 1e-6) s += ' Z' + num(p.z - O.z);
      if (s === cmd) return;
      if (cmd === 'G1' && f !== lastF) { s += ' F' + Math.round(f); lastF = f; }
      L.push(s);
      let d = Math.hypot(p.x - pos.x, p.y - pos.y), dz = Math.abs(p.z - pos.z);
      if (!isFinite(d)) d = 0;
      if (cmd === 'G0') time += Math.max(d / mach.rapid, dz / mach.maxZFeed);
      else time += Math.hypot(d, dz) / f;
      moves.push({ x: p.x, y: p.y, z: p.z, rapid: cmd === 'G0', f, op: curOp, tool: curTool });
      pos = { x: p.x, y: p.y, z: p.z };
    };
    let curOp = -1, curTool = null;
    const useArcs = ctx.arcs !== false;
    // Kreisbogen durch pts[i..j] (alle auf gleicher Höhe, keine Eilgänge)? Liefert das größte passende j oder -1.
    const ARC_TOL = 0.01;
    function circle3(a, b, c) {
      const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
      if (Math.abs(d) < 1e-9) return null;
      const a2 = a.x * a.x + a.y * a.y, b2 = b.x * b.x + b.y * b.y, c2 = c.x * c.x + c.y * c.y;
      const x = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
      const y = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
      return { x, y, r: Math.hypot(a.x - x, a.y - y) };
    }
    function arcOk(pts, i, j) {
      const a = pts[i], e = pts[j], m = pts[(i + j) >> 1];
      const c = circle3(a, m, e);
      if (!c || c.r > 500 || c.r < 0.2) return null;
      let sweep = 0, dir = 0, prevA = Math.atan2(a.y - c.y, a.x - c.x);
      for (let k = i + 1; k <= j; k++) {
        const p = pts[k];
        if (p.rapid || Math.abs(p.z - a.z) > 1e-9) return null;
        if (Math.abs(Math.hypot(p.x - c.x, p.y - c.y) - c.r) > ARC_TOL) return null;
        // Sehnenmitte darf nicht zu weit vom Bogen liegen
        const q = pts[k - 1], mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
        if (c.r - Math.hypot(mx - c.x, my - c.y) > ARC_TOL) return null;
        const ang = Math.atan2(p.y - c.y, p.x - c.x);
        let da = ang - prevA;
        while (da > Math.PI) da -= 2 * Math.PI;
        while (da < -Math.PI) da += 2 * Math.PI;
        if (Math.abs(da) > Math.PI / 4 || Math.abs(da) < 1e-6) return null;
        const sg = Math.sign(da);
        if (dir && sg !== dir) return null;
        dir = sg; sweep += da; prevA = ang;
      }
      if (Math.abs(sweep) > 1.9 * Math.PI) return null;
      return { c, ccw: dir > 0 };
    }
    function fitArc(pts, i) {
      if (i + 3 >= pts.length || pts[i].z !== pts[i + 1].z) return -1;
      let best = -1, j = i + 3;
      while (j < pts.length && j - i <= 400 && arcOk(pts, i, j)) { best = j; j++; }
      return best;
    }
    function outArc(pts, i, j, f) {
      const r = arcOk(pts, i, j);
      const a = pts[i], e = pts[j];
      const tf = (p) => { const dx = p.x - O.x, dy = p.y - O.y; return ctx.rot ? { x: dx * rc - dy * rs, y: dx * rs + dy * rc } : { x: dx, y: dy }; };
      const A = tf(a), E = tf(e), Cc = tf(r.c);
      let line = (r.ccw ? 'G3' : 'G2') + ' X' + num(E.x) + ' Y' + num(E.y) + ' I' + num(Cc.x - A.x) + ' J' + num(Cc.y - A.y);
      if (f !== lastF) { line += ' F' + Math.round(f); lastF = f; }
      L.push(line);
      for (let k = i + 1; k <= j; k++) {
        const p = pts[k];
        time += Math.hypot(p.x - pos.x, p.y - pos.y) / f;
        moves.push({ x: p.x, y: p.y, z: p.z, rapid: false, f, op: curOp, tool: curTool });
        pos = { x: p.x, y: p.y, z: p.z };
      }
    }

    const sections = [];
    results.forEach((r, i) => {
      if (!r || !r.chains) return;
      sections.push({ r, i, chains: r.chains, tool: r.tool, cut: r.cut, name: r.op.name });
      if (r.clear && r.clear.chains.length) sections.push({ r, i, chains: r.clear.chains, tool: r.clear.tool, cut: r.clear.cut, name: r.op.name + ' – Ausräumen' });
    });

    for (const sec of sections) {
      if (!sec.chains.length) continue;
      const { tool, cut } = sec;
      // vor dem Wechsel mit dem alten Werkzeug hochfahren
      out('G0', { x: pos.x, y: pos.y, z: safeZ });
      curOp = sec.i;
      curTool = sec.tool;
      L.push('');
      L.push(`(${clean(sec.name)} - ${clean(tool.name)})`);
      // Motor mit Drehregler: per Programm nur ein/aus (volles S), Drehzahl stellt man am Regler ein
      const dial = mach.spindle === 'manual' ? FS.tools.dialFor(cut.rpm, mach) : null;
      const s = dial ? mach.sMax : Math.round(Math.min(1, cut.rpm / mach.maxRpm) * mach.sMax);
      const dialTxt = dial ? ` - DREHREGLER Stufe ${dial.step} = ca. ${dial.rpm} U/min` : '';
      if (lastTool && lastTool.id !== tool.id) {
        toolChanges++;
        L.push('M5');
        L.push(`(WERKZEUGWECHSEL: ${clean(tool.name)} einsetzen${dialTxt} - Z neu nullen und fortsetzen)`);
        L.push('M0');
        // Nach dem Wechsel kann die Maschine irgendwo stehen: erst Z hoch, dann alle Achsen neu ausgeben
        L.push(`G0 Z${num(safeZ - O.z)}`);
        pos = { x: Infinity, y: Infinity, z: safeZ };
      }
      if (!lastTool || lastTool.id !== tool.id) {
        if (dial) L.push(`(DREHREGLER Stufe ${dial.step} = ca. ${dial.rpm} U/min)`);
        L.push(`M3 S${s}`);
        L.push(dial ? 'G4 P5' : 'G4 P3');
      } else if (dial && lastDial && dial.step !== lastDial.step) {
        // gleiches Werkzeug, andere Drehzahl am Handregler: anhalten und umstellen lassen
        L.push(`(PAUSE: DREHREGLER auf Stufe ${dial.step} stellen = ca. ${dial.rpm} U/min - dann fortsetzen)`);
        L.push('M0');
        L.push(`G0 Z${num(safeZ - O.z)}`);
        L.push(`M3 S${s}`, 'G4 P3');
      } else if (!dial && s !== lastS) {
        // gleiches Werkzeug, andere Drehzahl: per S-Wert umstellen
        L.push(`M3 S${s}`, 'G4 P2');
      }
      lastS = s; lastDial = dial;
      lastTool = tool;
      for (const ch of sec.chains) {
        const pts = ch.pts;
        if (!pts.length) continue;
        const p0 = pts[0];
        out('G0', { x: pos.x, y: pos.y, z: safeZ });
        out('G0', { x: p0.x, y: p0.y, z: safeZ });
        const cz = Math.min(safeZ, Math.max(ch.clearZ != null ? ch.clearZ : 0, p0.z) + 1);
        out('G0', { x: p0.x, y: p0.y, z: cz });
        out('G1', p0, cut.plunge);
        for (let k = 1; k < pts.length; k++) {
          const p = pts[k];
          if (p.rapid) { out('G0', p); continue; }
          // mehrere Punkte auf einem Kreisbogen gleicher Höhe -> ein G2/G3 (kleinere Datei, flüssigere Bewegung)
          if (useArcs) {
            const j = fitArc(pts, k - 1);
            if (j > 0) { outArc(pts, k - 1, j, Math.max(10, Math.round(cut.feed))); k = j; continue; }
          }
          const d = Math.hypot(p.x - pos.x, p.y - pos.y), dz = pos.z - p.z;
          let f = cut.feed;
          // steiles Eintauchen (> 60°) mit Eintauchvorschub, flachere Rampen mit Arbeitsvorschub
          if (dz > 1e-6 && d < dz * 0.58) f = d < 1e-6 ? cut.plunge : Math.min(cut.feed, (cut.plunge * Math.hypot(d, dz)) / dz);
          out('G1', p, Math.max(10, Math.round(f)));
        }
      }
    }
    out('G0', { x: pos.x, y: pos.y, z: safeZ });
    L.push('M5');
    out('G0', { x: O.x, y: O.y, z: safeZ });
    L.push('M2');
    return { text: L.join('\n') + '\n', moves, time: time * 60, toolChanges, origin: O };
  }

  /** G-Code (fremde Datei) -> Bewegungen in Maschinen-/Werkstückkoordinaten. */
  function parse(text) {
    const moves = [];
    let abs = true, unit = 1, mode = 0, f = 500;
    let p = { x: 0, y: 0, z: 0 };
    const lines = text.split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.replace(/\(.*?\)/g, '').replace(/;.*/, '').toUpperCase().trim();
      if (!line) continue;
      const words = {};
      const gs = [];
      for (const m of line.matchAll(/([A-Z])\s*([-+]?\d*\.?\d+)/g)) {
        if (m[1] === 'G') gs.push(+m[2]); else words[m[1]] = +m[2];
      }
      for (const gg of gs) {
        if (gg === 90) abs = true; else if (gg === 91) abs = false;
        else if (gg === 20) unit = 25.4; else if (gg === 21) unit = 1;
        else if (gg <= 3 && Number.isInteger(gg)) mode = gg;
      }
      if (words.F) f = words.F * unit;
      if (!('X' in words || 'Y' in words || 'Z' in words)) continue;
      if (gs.some((x) => x === 28 || x === 30 || x === 92 || x === 10 || x === 53 || x === 38.2)) continue;
      const np = {
        x: 'X' in words ? (abs ? 0 : p.x) + words.X * unit : p.x,
        y: 'Y' in words ? (abs ? 0 : p.y) + words.Y * unit : p.y,
        z: 'Z' in words ? (abs ? 0 : p.z) + words.Z * unit : p.z,
      };
      if (mode === 2 || mode === 3) {
        let cx, cy;
        if ('R' in words) {
          const r = words.R * unit, dx = np.x - p.x, dy = np.y - p.y, d = Math.hypot(dx, dy);
          const h = Math.sqrt(Math.max(0, r * r - (d * d) / 4)) * ((mode === 2) !== r < 0 ? -1 : 1);
          cx = p.x + dx / 2 - (h * dy) / d; cy = p.y + dy / 2 + (h * dx) / d;
        } else { cx = p.x + (words.I || 0) * unit; cy = p.y + (words.J || 0) * unit; }
        const r = Math.hypot(p.x - cx, p.y - cy);
        let a0 = Math.atan2(p.y - cy, p.x - cx), a1 = Math.atan2(np.y - cy, np.x - cx);
        if (mode === 2) { if (a1 >= a0 - 1e-9) a1 -= Math.PI * 2; } else if (a1 <= a0 + 1e-9) a1 += Math.PI * 2;
        const n = Math.max(4, Math.ceil((Math.abs(a1 - a0) * r) / 0.3));
        for (let k = 1; k <= n; k++) {
          const a = a0 + ((a1 - a0) * k) / n;
          moves.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), z: p.z + ((np.z - p.z) * k) / n, rapid: false, f });
        }
      } else moves.push({ ...np, rapid: mode === 0, f });
      p = np;
    }
    return moves;
  }

  function lineCount(text) { return text.split('\n').filter((l) => l.trim()).length; }
  function fmtTime(sec) {
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? `${h} h ${m} min` : m ? `${m} min ${s} s` : `${s} s`;
  }


  /**
   * Höhenkarte anwenden (Auto-Leveling): zu jeder Z-Position wird die gemessene Oberflächenhöhe an dieser Stelle addiert.
   * map: { x0, y0, dx, dy, nx, ny, z: [ny][nx] } in Werkstückkoordinaten. Lange Geraden werden unterteilt, Bögen in Geraden zerlegt.
   * Nur absolute Koordinaten in mm (G90/G21) – sonst Fehler.
   */
  function heightAt(map, x, y) {
    const fx = Math.max(0, Math.min(map.nx - 1, (x - map.x0) / (map.dx || 1)));
    const fy = Math.max(0, Math.min(map.ny - 1, (y - map.y0) / (map.dy || 1)));
    const i = Math.min(map.nx - 2, Math.floor(fx)), j = Math.min(map.ny - 2, Math.floor(fy));
    if (map.nx < 2 || map.ny < 2) return map.z[0][0];
    const tx = fx - i, ty = fy - j, Z = map.z;
    return (Z[j][i] * (1 - tx) + Z[j][i + 1] * tx) * (1 - ty) + (Z[j + 1][i] * (1 - tx) + Z[j + 1][i + 1] * tx) * ty;
  }
  function level(text, map, seg = 2) {
    const out = [];
    let mode = 0, p = null;
    const fmtL = (cmd, q, f) => `${cmd} X${num(q.x)} Y${num(q.y)} Z${num(q.z + heightAt(map, q.x, q.y))}${f ? ' F' + Math.round(f) : ''}`;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.replace(/\(.*?\)/g, '').replace(/;.*/, '').toUpperCase().trim();
      if (!line) { out.push(raw); continue; }
      const words = {}, gs = [];
      for (const m of line.matchAll(/([A-Z])\s*([-+]?\d*\.?\d+)/g)) { if (m[1] === 'G') gs.push(+m[2]); else words[m[1]] = +m[2]; }
      if (gs.includes(91)) throw new Error('Relative Koordinaten (G91) im Programm – Höhenkarte nicht möglich.');
      if (gs.includes(20)) throw new Error('Zoll (G20) im Programm – Höhenkarte nicht möglich.');
      if (gs.some((g2) => [10, 28, 30, 38.2, 53, 92].includes(g2))) { out.push(raw); continue; }
      for (const g2 of gs) if (g2 <= 3 && Number.isInteger(g2)) mode = g2;
      const hasXYZ = 'X' in words || 'Y' in words || 'Z' in words;
      if (!hasXYZ) { out.push(raw); continue; }
      if (!p) {
        // Startpunkt unbekannt: erste Bewegung nur übernehmen, wenn sie X, Y und Z enthält; sonst Z unverändert
        if (!('X' in words && 'Y' in words && 'Z' in words)) {
          if ('Z' in words && !('X' in words) && !('Y' in words)) { out.push(raw); continue; }
          p = { x: words.X || 0, y: words.Y || 0, z: words.Z || 0 };
          out.push(raw); continue;
        }
      }
      const prev = p || { x: words.X, y: words.Y, z: words.Z };
      const np = { x: 'X' in words ? words.X : prev.x, y: 'Y' in words ? words.Y : prev.y, z: 'Z' in words ? words.Z : prev.z };
      const f = words.F;
      if (!('X' in words) && !('Y' in words)) {
        // reine Z-Bewegung an der aktuellen Stelle
        out.push(`${mode === 0 ? 'G0' : 'G1'} Z${num(np.z + heightAt(map, prev.x, prev.y))}${f ? ' F' + Math.round(f) : ''}`);
      } else if (mode === 0) {
        out.push(fmtL('G0', np));
      } else if (mode === 1) {
        const d = Math.hypot(np.x - prev.x, np.y - prev.y), n = Math.max(1, Math.ceil(d / seg));
        for (let k = 1; k <= n; k++) {
          const q = { x: prev.x + ((np.x - prev.x) * k) / n, y: prev.y + ((np.y - prev.y) * k) / n, z: prev.z + ((np.z - prev.z) * k) / n };
          out.push(fmtL('G1', q, k === 1 ? f : 0));
        }
      } else {
        let cx, cy;
        if ('R' in words) {
          const r = words.R, dx = np.x - prev.x, dy = np.y - prev.y, d = Math.hypot(dx, dy);
          const h = Math.sqrt(Math.max(0, r * r - (d * d) / 4)) * ((mode === 2) !== r < 0 ? -1 : 1);
          cx = prev.x + dx / 2 - (h * dy) / d; cy = prev.y + dy / 2 + (h * dx) / d;
        } else { cx = prev.x + (words.I || 0); cy = prev.y + (words.J || 0); }
        const r = Math.hypot(prev.x - cx, prev.y - cy);
        let a0 = Math.atan2(prev.y - cy, prev.x - cx), a1 = Math.atan2(np.y - cy, np.x - cx);
        if (mode === 2) { if (a1 >= a0 - 1e-9) a1 -= Math.PI * 2; } else if (a1 <= a0 + 1e-9) a1 += Math.PI * 2;
        const n = Math.max(4, Math.ceil((Math.abs(a1 - a0) * r) / Math.min(seg, 0.5)));
        for (let k = 1; k <= n; k++) {
          const a = a0 + ((a1 - a0) * k) / n;
          out.push(fmtL('G1', { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), z: prev.z + ((np.z - prev.z) * k) / n }, k === 1 ? f : 0));
        }
      }
      p = np;
    }
    return out.join('\n') + '\n';
  }

  FS.gcode = { build, parse, origin, ZERO_POS, fmtTime, lineCount, num, level, heightAt };
})(typeof window !== 'undefined' ? window : globalThis);
