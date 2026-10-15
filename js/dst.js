/* Design zusammensetzen (Verbindungen, Vernähen, Fadenschnitt, Farbwechsel) und Tajima DST lesen/schreiben. */
(function (g) {
  const HW = (g.HW = g.HW || {});
  const G = HW.geo;

  /**
   * Baut die Maschinenbefehle für das ganze Design.
   * Rückgabe: [{x, y, cmd: 'stitch'|'jump'|'trim'|'color', color, obj}] in mm.
   */
  function assemble(objects, palette, opts = {}) {
    const trimDist = opts.trimDist ?? 2.0;
    const lock = opts.lock ?? true;
    const out = [];
    let cur = null, curColor = null;
    const tieLen = 0.7;
    const tieIn = (pts, i, objId) => {
      if (!lock) return;
      const p = pts[i];
      let q = null;
      for (let k = i + 1; k < pts.length && !pts[k].j; k++) if (G.dist(p, pts[k]) > 0.3) { q = pts[k]; break; }
      if (!q) return;
      const t = G.lerp(p, q, Math.min(1, tieLen / G.dist(p, q)));
      out.push({ x: t.x, y: t.y, cmd: 'stitch', obj: objId }, { x: p.x, y: p.y, cmd: 'stitch', obj: objId });
      out.push({ x: t.x, y: t.y, cmd: 'stitch', obj: objId }, { x: p.x, y: p.y, cmd: 'stitch', obj: objId });
    };
    const tieOff = (objId) => {
      if (!lock || out.length < 2) return;
      const p = out[out.length - 1];
      let q = null;
      for (let k = out.length - 2; k >= 0 && out[k].cmd === 'stitch'; k--) if (G.dist(p, out[k]) > 0.3) { q = out[k]; break; }
      if (!q) return;
      const t = G.lerp(p, q, Math.min(1, tieLen / G.dist(p, q)));
      out.push({ x: t.x, y: t.y, cmd: 'stitch', obj: objId }, { x: p.x, y: p.y, cmd: 'stitch', obj: objId });
      out.push({ x: t.x, y: t.y, cmd: 'stitch', obj: objId }, { x: p.x, y: p.y, cmd: 'stitch', obj: objId });
    };
    let needTie = true, floatJump = false;
    // Sprung ohne Schnitt höchstens so lang, dass die Maschine ihn nicht als Schnitt deutet
    // (DST: ein Sprungbefehl <= 12,1 mm; ab "trimJumps" Sprüngen in Folge schneidet die Maschine)
    const maxFloat = Math.max(0, ((opts.trimJumps ?? 3) - 1) * 12.1);
    const jumpMax = Math.min(opts.jumpMax || 0, maxFloat);
    const lockJump = lock && (opts.lockJump ?? true);
    for (let oi = 0; oi < objects.length; oi++) {
      const obj = objects[oi];
      if (obj.hidden) continue;
      const pts = obj._st || [];
      if (!pts.length) continue;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const first = i === 0;
        if (first && curColor !== null && (obj.color !== curColor || obj.stopBefore)) {
          tieOff(obj.id);
          out.push({ x: cur.x, y: cur.y, cmd: 'trim', obj: obj.id });
          out.push({ x: cur.x, y: cur.y, cmd: 'color', color: obj.color, obj: obj.id, stop: obj.color === curColor ? obj.stopBefore : undefined });
          needTie = true;
        } else if (cur && (first || p.j)) {
          const d = G.dist(cur, p);
          // Art der Verbindung: pro Objekt vorgegeben (connect) oder automatisch nach Abstand
          const mode = first ? obj.connect || 'auto' : 'auto';
          let kind = 'none', path = null;
          if (d > 0.05) {
            if (mode === 'trim') kind = 'trim';
            else if (mode === 'jump') kind = d <= maxFloat ? 'jump' : 'trim';
            else if (mode === 'stitch') kind = 'stitch';
            else if (d < trimDist) kind = 'stitch';
            else {
              // versteckter Laufweg unter später gestickten Objekten statt Schnitt
              path = first && opts.connect ? opts.connect(cur, p, objects, oi) : null;
              kind = path ? 'travel' : d <= jumpMax ? 'jump' : 'trim';
            }
          }
          if (kind === 'travel') {
            if (needTie) { out.push({ x: cur.x, y: cur.y, cmd: 'jump', obj: obj.id }); needTie = false; }
            for (const q of path) out.push({ x: q.x, y: q.y, cmd: 'stitch', obj: obj.id, travel: true });
            cur = p;
            continue;
          }
          if (kind === 'stitch') {
            // direkte Verbindung als Stich (lange Verbindungen in Stiche bis 3 mm teilen)
            const n = Math.max(1, Math.ceil(d / 3));
            for (let k = 1; k <= n; k++) out.push({ ...G.lerp(cur, p, k / n), cmd: 'stitch', obj: obj.id, travel: n > 1 });
            cur = p;
            continue;
          }
          if (kind === 'jump') {
            // Sprung ohne Fadenschnitt (Faden bleibt liegen und wird später von Hand gekürzt)
            if (!needTie && lockJump) tieOff(obj.id);
            needTie = true;
            floatJump = true;
          } else if (kind === 'trim') {
            if (!needTie) tieOff(obj.id);
            out.push({ x: cur.x, y: cur.y, cmd: 'trim', obj: obj.id });
            needTie = true;
          }
        }
        if (curColor === null) curColor = obj.color;
        curColor = obj.color;
        if (needTie) {
          out.push({ x: p.x, y: p.y, cmd: 'jump', obj: obj.id, float: floatJump || undefined });
          if (!floatJump || lockJump) tieIn(pts, i, obj.id);
          needTie = false;
          floatJump = false;
        } else out.push({ x: p.x, y: p.y, cmd: 'stitch', obj: obj.id });
        cur = p;
      }
    }
    tieOff(null);
    void palette;
    return out;
  }

  function stats(cmds) {
    let st = 0, col = 1, tr = 0, tv = 0, inTv = false, fl = 0;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of cmds) {
      if (c.cmd === 'stitch') {
        st++;
        if (c.travel && !inTv) tv++;
        inTv = !!c.travel;
        if (c.x < x0) x0 = c.x; if (c.x > x1) x1 = c.x;
        if (c.y < y0) y0 = c.y; if (c.y > y1) y1 = c.y;
      } else if (c.cmd === 'color') col++;
      else if (c.cmd === 'jump' && c.float) fl++;
      else if (c.cmd === 'trim') tr++;
    }
    if (!st) { x0 = y0 = x1 = y1 = 0; col = 0; }
    return { stitches: st, colors: col, trims: tr, travels: tv, floats: fl, w: x1 - x0, h: y1 - y0, x0, y0, x1, y1 };
  }

  HW.dst = Object.assign(HW.dst || {}, { assemble, stats });
})(typeof window !== 'undefined' ? window : globalThis);
