/* Stichgenerierung für alle Objekttypen. Ausgabe: Liste {x, y, j} (j=1: Sprung) in mm. */
(function (g) {
  const HW = (g.HW = g.HW || {});
  const G = HW.geo;

  const DEFAULTS = {
    run: { len: 2.5, style: 'single', closed: false },
    satin: { spacing: 0.4, pull: 0.15, underlay: 'center', split: 7, width: 3, shortSt: true, puff: false },
    fill: {
      fillType: 'tatami', spacing: 0.4, len: 3.5, angle: 45, pull: 0.2, push: 0.2,
      underlay: 'tatami', border: 'none', borderWidth: 2, borderLen: 2.5, split: 7,
      pattern: 'diamond', waveAmp: 1.5, waveLen: 12, gradEnd: 2, crossSize: 2.5, crossDouble: false,
    },
  };

  /* ---------- Hilfen ---------- */
  function push(out, p, j = 0) {
    const last = out[out.length - 1];
    if (!j && last && !last.j && Math.hypot(p.x - last.x, p.y - last.y) < 0.15) return;
    out.push({ x: p.x, y: p.y, j });
  }

  // Stiche entlang einer Linie mit höchstens "len" Länge; in Kurven kürzer, damit die Sehnen nicht
  // als Vieleck über den Rand der Säule hinausragen (Pfeilhöhe höchstens "sag" mm)
  function resampleAdaptive(pl, len, sag = 0.1) {
    if (pl.length < 3 || len <= 0.7) return G.resample(pl, len);
    const d = G.resample(pl, 0.25, 40);
    const n = d.length;
    if (n < 4) return d;
    const ang = (i) => {
      const a = d[Math.max(0, i - 2)], b = d[i], c = d[Math.min(n - 1, i + 2)];
      const v1x = b.x - a.x, v1y = b.y - a.y, v2x = c.x - b.x, v2y = c.y - b.y;
      const l1 = Math.hypot(v1x, v1y), l2 = Math.hypot(v2x, v2y);
      if (l1 < 1e-9 || l2 < 1e-9) return 0;
      return Math.acos(Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (l1 * l2))));
    };
    const out = [d[0]];
    let i = 0;
    while (i < n - 1) {
      const th = ang(i), arc = Math.hypot(d[Math.min(n - 1, i + 2)].x - d[Math.max(0, i - 2)].x, d[Math.min(n - 1, i + 2)].y - d[Math.max(0, i - 2)].y);
      const r = th > 0.02 ? arc / th : 1e9;
      const step = Math.max(0.6, Math.min(len, Math.sqrt(8 * r * sag)));
      let j = i, acc = 0;
      while (j < n - 1 && acc < step) { acc += G.dist(d[j], d[j + 1]); j++; if (ang(j) > 0.6) break; } // an Ecken enden
      out.push(d[j]);
      i = j;
    }
    return out;
  }

  function runAlong(out, pl, len) {
    const r = resampleAdaptive(pl, len, 0.12);
    for (const p of r) push(out, p);
  }

  // Lange Stiche teilen (Auto-Split) mit versetzten Teilungspunkten
  function splitStitch(out, a, b, maxLen, k) {
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (maxLen > 0 && L > maxLen) {
      const m = Math.ceil(L / (maxLen * 0.85));
      const st = (((k * 0.618) % 1) - 0.5) * (0.6 / m);
      for (let i = 1; i < m; i++) push(out, G.lerp(a, b, Math.min(0.97, Math.max(0.03, i / m + st))));
    }
    push(out, b);
  }

  /* ---------- Laufstich ---------- */
  function genRun(obj) {
    const p = obj.params;
    const path = G.buildPath(obj.points, p.closed);
    let pl = path.pts;
    if (p.closed && pl.length > 1) pl = pl.concat([pl[0]]);
    const base = p.style === 'single' && p.len >= 1.5 ? resampleAdaptive(pl, p.len, 0.1) : G.resample(pl, p.len, 25, path.idx);
    const out = [];
    if (p.style === 'single') base.forEach((q) => push(out, q));
    else if (p.style === 'triple') {
      push(out, base[0]);
      for (let i = 1; i < base.length; i++) {
        push(out, base[i]);
        push(out, base[i - 1]);
        push(out, base[i]);
      }
    } else {
      // Bohnenstich (Hin-Zurück-Hin pro Stich)
      push(out, base[0]);
      for (let i = 1; i < base.length; i++) {
        push(out, base[i]); push(out, base[i - 1]); push(out, base[i]);
      }
    }
    return out;
  }

  /* ---------- Satinsäulen ---------- */
  // Liefert Kreuzungen [{a: Punkt Schiene 1, b: Punkt Schiene 2}] im Abstand "spacing"
  function crossings(segPairs, spacing) {
    const res = [];
    segPairs.forEach((sp, si) => {
      const la = G.polyLength(sp.L), lb = G.polyLength(sp.R);
      // Dichte zwischen Mitte und Außenkante messen, damit Bögen außen nicht lückig werden
      // je stärker der Fächer (Ecke/enger Bogen), desto mehr zählt die Außenkante – innen helfen die Kurzstiche
      const q = Math.min(la, lb) / (Math.max(la, lb) || 1);
      const w = Math.max(0.5, Math.min(1, 1.5 - q));
      const n = Math.max(1, Math.round((((la + lb) / 2) * (1 - w) + Math.max(la, lb) * w) / spacing));
      for (let j = si === 0 ? 0 : 1; j <= n; j++) {
        res.push({ a: G.pointAt(sp.L, (la * j) / n), b: G.pointAt(sp.R, (lb * j) / n) });
      }
    });
    return res;
  }

  // Teilstück einer Polylinie zwischen den Bogenlängen s0 und s1
  function sliceArc(pl, s0, s1) {
    const out = [G.pointAt(pl, s0)];
    let acc = 0;
    for (let i = 1; i < pl.length; i++) {
      acc += G.dist(pl[i - 1], pl[i]);
      if (acc > s0 && acc < s1) out.push(pl[i]);
    }
    out.push(G.pointAt(pl, s1));
    return out;
  }

  // Schnitt einer Geraden (p, Richtung d) mit einer Polylinie -> Bogenlänge des nächsten Treffers
  function hitArc(pl, p, d) {
    let best = null, bt = Infinity, acc = 0;
    for (let i = 1; i < pl.length; i++) {
      const a = pl[i - 1], b = pl[i];
      const ex = b.x - a.x, ey = b.y - a.y, sl = Math.hypot(ex, ey);
      const den = d.x * ey - d.y * ex;
      if (Math.abs(den) > 1e-12) {
        const t = ((a.x - p.x) * ey - (a.y - p.y) * ex) / den;
        const u = ((a.x - p.x) * d.y - (a.y - p.y) * d.x) / den;
        if (u >= 0 && u <= 1 && Math.abs(t) < bt) { bt = Math.abs(t); best = acc + u * sl; }
      }
      acc += sl;
    }
    return best;
  }

  // Säule B: Stationen senkrecht zur Mittellinie, damit die Stiche in Bögen mitdrehen
  function turningPairs(L, R) {
    const la = G.polyLength(L), lb = G.polyLength(R);
    if (la < 0.5 || lb < 0.5) return [{ L, R }];
    const M = Math.max(4, Math.ceil(Math.max(la, lb) / 0.5));
    const mid = [];
    for (let i = 0; i <= M; i++) mid.push(G.lerp(G.pointAt(L, (la * i) / M), G.pointAt(R, (lb * i) / M), 0.5));
    const lm = G.polyLength(mid);
    const K = Math.max(1, Math.round(lm / 1.5));
    const sa = [0], sb = [0];
    for (let k = 1; k < K; k++) {
      const s = (lm * k) / K;
      const p = G.pointAt(mid, s), q = G.pointAt(mid, Math.min(lm, s + 0.3)), o = G.pointAt(mid, Math.max(0, s - 0.3));
      const tl = Math.hypot(q.x - o.x, q.y - o.y) || 1;
      const n = { x: -(q.y - o.y) / tl, y: (q.x - o.x) / tl };
      let a = hitArc(L, p, n), b = hitArc(R, p, n);
      const fa = (la * k) / K, fb = (lb * k) / K;
      // Fallback auf anteilige Position, Reihenfolge muss erhalten bleiben
      if (a === null || Math.abs(a - fa) > la * 0.25) a = fa;
      if (b === null || Math.abs(b - fb) > lb * 0.25) b = fb;
      if (a <= sa[sa.length - 1] + 0.05 || b <= sb[sb.length - 1] + 0.05 || a >= la - 0.05 || b >= lb - 0.05) continue;
      sa.push(a); sb.push(b);
    }
    sa.push(la); sb.push(lb);
    const segs = [];
    for (let k = 1; k < sa.length; k++) segs.push({ L: sliceArc(L, sa[k - 1], sa[k]), R: sliceArc(R, sb[k - 1], sb[k]) });
    return segs;
  }

  // Eng gesetzte Kantenpunkte (Schriften, automatisch digitalisierte Säulen) sind oft treppenförmig:
  // leicht glätten und alle nicht scharfen Punkte als Kurvenpunkte behandeln, damit die Satinkanten rund laufen
  function smoothRail(rail) {
    const n = rail.length;
    if (n < 4) return rail;
    for (let i = 1; i < n; i++) if (G.dist(rail[i - 1], rail[i]) > 0.9) return rail;
    const sharp = rail.map((p, i) => {
      if (i === 0 || i === n - 1) return true;
      const a = rail[i - 1], b = rail[i + 1];
      const v1x = p.x - a.x, v1y = p.y - a.y, v2x = b.x - p.x, v2y = b.y - p.y;
      const l1 = Math.hypot(v1x, v1y), l2 = Math.hypot(v2x, v2y);
      return l1 > 1e-9 && l2 > 1e-9 && (v1x * v2x + v1y * v2y) / (l1 * l2) < 0.42; // Knick über ca. 65°
    });
    let cur = rail.map((p) => ({ x: p.x, y: p.y }));
    for (let it = 0; it < 2; it++) {
      const nx = cur.map((p) => ({ x: p.x, y: p.y }));
      for (let i = 1; i < n - 1; i++) {
        if (sharp[i] || sharp[i - 1] && sharp[i + 1]) continue;
        nx[i] = { x: (cur[i - 1].x + 2 * cur[i].x + cur[i + 1].x) / 4, y: (cur[i - 1].y + 2 * cur[i].y + cur[i + 1].y) / 4 };
      }
      cur = nx;
    }
    return cur.map((p, i) => ({ x: p.x, y: p.y, c: !sharp[i] || (i > 0 && i < n - 1 && false) }));
  }

  function railsFor(obj) {
    const pts = obj.points;
    if (obj.type === 'colA') {
      let L = [], R = [];
      for (let i = 0; i + 1 < pts.length; i += 2) { L.push(pts[i]); R.push(pts[i + 1]); }
      if (L.length < 2) return null;
      if (obj.params && obj.params.smooth !== false) { L = smoothRail(L); R = smoothRail(R); }
      const pL = G.buildPath(L, false), pR = G.buildPath(R, false);
      const segs = [];
      for (let k = 0; k + 1 < L.length; k++) {
        segs.push({ L: pL.pts.slice(pL.idx[k], pL.idx[k + 1] + 1), R: pR.pts.slice(pR.idx[k], pR.idx[k + 1] + 1) });
      }
      return segs;
    }
    if (obj.type === 'colB') {
      if (pts.length < 2 || !obj.side2 || obj.side2.length < 2) return null;
      const L = G.buildPath(pts, false).pts;
      let R = G.buildPath(obj.side2, false).pts;
      const same = G.dist(L[0], R[0]) + G.dist(L[L.length - 1], R[R.length - 1]);
      const cross = G.dist(L[0], R[R.length - 1]) + G.dist(L[L.length - 1], R[0]);
      if (cross < same) R = R.slice().reverse();
      return turningPairs(L, R);
    }
    if (obj.type === 'colC' || obj.type === '_border') {
      if (pts.length < 2) return null;
      const closed = obj.type === '_border' || !!obj.params.closed;
      let c = G.buildPath(pts, closed).pts;
      if (closed) c = c.concat([c[0]]);
      c = G.resample(c, 0.25, 180);
      if (closed && c.length > 8) {
        // geschlossene Ringe an der geradesten Stelle beginnen lassen: liegt die Naht in einer Ecke,
        // hält die Schleifenbereinigung sonst den ganzen Ring für eine Schleife
        const ring = c.slice(0, -1), n = ring.length, k = Math.min(6, Math.floor(n / 4));
        let bi = 0, bt = Infinity;
        for (let i = 0; i < n; i++) {
          const a = ring[(i - k + n) % n], m = ring[i], b = ring[(i + k) % n];
          const t = Math.abs(Math.atan2(b.y - m.y, b.x - m.x) - Math.atan2(m.y - a.y, m.x - a.x));
          const turn = Math.min(t, 2 * Math.PI - t);
          if (turn < bt - 1e-9) { bt = turn; bi = i; }
        }
        const rr = ring.slice(bi).concat(ring.slice(0, bi));
        c = rr.concat([rr[0]]);
      }
      const w = obj.params.width / 2;
      // Innenkante enger Kurven/Ecken ohne Schleifen; Stiche drehen sich wie bei Säule B senkrecht mit
      const oL = G.offsetPolyline(c, -w), oR = G.offsetPolyline(c, w);
      let L = G.removeLoops(oL), R = G.removeLoops(oR);
      // Sicherung: hat die Bereinigung zu viel weggenommen, die unbereinigte Kante nehmen
      const lc = G.polyLength(c);
      if (G.polyLength(L) < lc * 0.5) L = oL;
      if (G.polyLength(R) < lc * 0.5) R = oR;
      return turningPairs(L, R);
    }
    return null;
  }

  function genSatin(obj) {
    const p = obj.params;
    const segs = railsFor(obj);
    if (!segs) return [];
    // Abstand: von Einstich zu Einstich auf derselben Seite
    const cs = p.spacing / 2;
    const cr = crossings(segs, cs);
    if (cr.length < 2) return [];
    const out = [];
    const inset = (c, d) => {
      const L = G.dist(c.a, c.b);
      const t = L > 0 ? Math.min(0.45, d / L) : 0;
      return { a: G.lerp(c.a, c.b, t), b: G.lerp(c.b, c.a, t) };
    };
    // Unterlage
    const ul = p.underlay || 'none';
    const step = Math.max(1, Math.round(2 / cs));
    if (obj._back) {
      // Hin und zurück: Unterlage läuft zum anderen Ende, der Deckstich kommt zurück -> Ende = Anfang
      // (spart bei freien Enden wie Beinen oder Fühlern den Schnitt)
      if (ul !== 'none') {
        const ins = cr.map((c) => inset(c, ul.includes('zigzag') ? 0.5 : 0.4));
        if (ul.includes('zigzag')) {
          const zz = (q) => { const last = out[out.length - 1]; if (last) splitStitch(out, last, q, p.split || 7, out.length); else push(out, q); };
          for (let k = 0; k < ins.length; k += step) zz((k / step) % 2 ? ins[k].b : ins[k].a);
          zz(ins[ins.length - 1].a);
        } else if (ul.includes('edge')) {
          runAlong(out, ins.map((c) => c.a), 2.2);
        } else runAlong(out, cr.map((c) => G.lerp(c.a, c.b, 0.5)), 2.2);
      }
      cr.reverse();
    } else if (ul.includes('center')) {
      const mid = cr.map((c) => G.lerp(c.a, c.b, 0.5));
      runAlong(out, mid, 2.2);
      runAlong(out, mid.slice().reverse(), 2.2);
    }
    if (ul.includes('edge') && !obj._back) {
      const ins = cr.map((c) => inset(c, 0.4));
      // eine Kante hin, die andere zurück – Übergänge ebenfalls in kurze Stiche teilen
      runAlong(out, ins.map((c) => c.a).concat(ins.map((c) => c.b).reverse(), [ins[0].a]), 2.2);
    }
    if (ul.includes('zigzag') && !obj._back) {
      const ins = cr.map((c) => inset(c, 0.5));
      // Zickzack-Unterlage – bei breiten Säulen ebenfalls teilen
      const zz = (q) => { const last = out[out.length - 1]; if (last) splitStitch(out, last, q, p.split || 7, out.length); else push(out, q); };
      for (let k = 0; k < ins.length; k += step) zz((k / step) % 2 ? ins[k].b : ins[k].a);
      for (let k = ins.length - 1 - Math.floor(step / 2); k >= 0; k -= step) zz((k / step) % 2 ? ins[k].a : ins[k].b);
      zz(ins[0].a);
    }
    // E-Stich (Applikation/Langette): Lauf entlang einer Kante, Querstich zur anderen und zurück
    if (p.style === 'e') {
      const step = Math.max(1, Math.round(p.spacing / cs));
      for (let k = 0; k < cr.length; k += step) {
        push(out, cr[k].a);
        push(out, cr[k].b);
        push(out, cr[k].a);
      }
      push(out, cr[cr.length - 1].a);
      return out;
    }
    // Deckstich mit Zugkompensation und Kurzstichen
    const pc = p.pull || 0;
    // Einstichabstand je Seite (über ±2 Kreuzungen geglättet) – Innenseite von Bögen/Ecken ist gestaucht
    const sideGap = (k, side) => {
      let sum = 0, n = 0;
      for (let i = Math.max(1, k - 2); i <= Math.min(cr.length - 1, k + 2); i++) { sum += G.dist(cr[i - 1][side], cr[i][side]); n++; }
      return n ? sum / n : cs;
    };
    const pens = cr.map((c, k) => {
      const L = G.dist(c.a, c.b) || 1;
      const ux = (c.b.x - c.a.x) / L, uy = (c.b.y - c.a.y) / L;
      const onA = k % 2 === 0;
      // Kurzstiche: an der gestauchten Innenseite endet jeder zweite Stich früher,
      // damit sich die Einstiche auf mehrere Reihen verteilen statt auf einem Haufen zu liegen
      if (p.shortSt !== false && L > 1.2) {
        const dS = sideGap(k, onA ? 'a' : 'b'), dO = sideGap(k, onA ? 'b' : 'a');
        const r = dO > 1e-6 ? dS / dO : 1;
        if (r < 0.75) {
          const m = k >> 1; // Nummer des Einstichs auf dieser Seite
          let f = Math.min(0.45, (1 - r) * 0.55);
          // sehr enge Ecken: drei Reihen (lang, kurz, mittel, kurz …)
          const lvl = r < 0.3 ? [0, 1, 0.5, 1][m % 4] : m % 2;
          f *= lvl;
          f = Math.min(f, Math.max(0, (L - 0.8) / L)); // Reststich nicht kürzer als 0,8 mm
          if (f > 0.02) return onA ? G.lerp(c.a, c.b, f) : G.lerp(c.b, c.a, f);
        }
      }
      return onA ? { x: c.a.x - ux * pc, y: c.a.y - uy * pc } : { x: c.b.x + ux * pc, y: c.b.y + uy * pc };
    });
    // 3D-Puff: Enden mehrfach dicht überstechen, damit der Schaum sauber abgeschnitten wird
    const cap = (c, inward) => {
      for (let k = 0; k < 4; k++) {
        const n = { x: c.a.x + inward.x * k * 0.2, y: c.a.y + inward.y * k * 0.2 }, m = { x: c.b.x + inward.x * k * 0.2, y: c.b.y + inward.y * k * 0.2 };
        push(out, n);
        push(out, m);
      }
    };
    const dirOf = (c0, c1) => { const mx = (c1.a.x + c1.b.x - c0.a.x - c0.b.x) / 2, my = (c1.a.y + c1.b.y - c0.a.y - c0.b.y) / 2, L = Math.hypot(mx, my) || 1; return { x: mx / L, y: my / L }; };
    const closedCol = segs.length === 1 && G.dist(segs[0].L[0], segs[0].L[segs[0].L.length - 1]) < 0.05;
    const puff = p.puff && !closedCol && cr.length > 4;
    if (puff) cap(cr[0], dirOf(cr[0], cr[2]));
    const satStart = out.length;
    push(out, pens[0]);
    for (let k = 1; k < pens.length; k++) splitStitch(out, pens[k - 1], pens[k], p.split, k);
    if (puff) cap(cr[cr.length - 1], dirOf(cr[cr.length - 1], cr[cr.length - 3]));
    // Eckkappen (beim Auto-Digitalisieren): kleine Ecken, die die Säule nicht erreicht, stickt sie selbst mit –
    // am Anfang vor dem Deckstich, am Ende danach (kein eigenes Objekt, kein Weg dorthin)
    if (obj.caps && obj.caps.length) {
      const c0 = G.lerp(cr[0].a, cr[0].b, 0.5), c1 = G.lerp(cr[cr.length - 1].a, cr[cr.length - 1].b, 0.5);
      const capSt = (ring, c) => {
        const ang = (Math.atan2(c.b.y - c.a.y, c.b.x - c.a.x) * 180) / Math.PI;
        try { return genFill({ type: 'fill', points: ring.map((q) => ({ x: q.x, y: q.y, c: false })), holes: [], params: { ...DEFAULTS.fill, fillType: 'satin', underlay: 'none', border: 'none', spacing: p.spacing || 0.4, pull: 0, push: 0, angle: ang } }).filter((q) => !q.j); } catch (e) { return []; }
      };
      const atStart = [], atEnd = [];
      for (const ring of obj.caps) {
        if (!ring || ring.length < 3) continue;
        const b = G.bbox(ring), m = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
        (G.dist(m, c0) <= G.dist(m, c1) ? atStart : atEnd).push(...capSt(ring, G.dist(m, c0) <= G.dist(m, c1) ? cr[0] : cr[cr.length - 1]));
      }
      if (atStart.length) out.splice(satStart, 0, ...atStart.map((q) => ({ x: q.x, y: q.y, j: 0 })));
      for (const q of atEnd) push(out, q);
    }
    return out;
  }

  /* ---------- Flächenfüllung (Tatami / Satin mit festem Winkel) ---------- */
  // push: Druckausgleich – die Form quer zur Stichrichtung um diesen Wert (je Seite) kürzen,
  // weil die Stiche den Stoff dort auseinanderdrücken (sonst wird aus einem Kreis ein Ei)
  function scanBlocks(rings, spacing, gradEnd, push = 0) {
    const all = rings.flat();
    const bb = G.bbox(all);
    const rows = [];
    let r = 0;
    // Verlauf: Reihenabstand wächst von "spacing" bis "gradEnd" (dicht → offen)
    const stepAt = (y) => (gradEnd ? spacing + (gradEnd - spacing) * Math.max(0, Math.min(1, (y - bb.y0) / (bb.y1 - bb.y0 || 1))) : spacing);
    const spans = (y) => {
      const xs = [];
      for (const ring of rings) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const a = ring[j], b = ring[i];
          if ((a.y > y) !== (b.y > y)) xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
        }
      }
      xs.sort((u, v) => u - v);
      const out = [];
      for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]]);
      return out;
    };
    const inter = (A, B) => {
      const out = [];
      for (const [a0, a1] of A) for (const [b0, b1] of B) { const x0 = Math.max(a0, b0), x1 = Math.min(a1, b1); if (x1 > x0) out.push([x0, x1]); }
      return out.sort((u, v) => u[0] - v[0]);
    };
    for (let y = bb.y0 + spacing / 2; y < bb.y1; y += stepAt(y), r++) {
      let sp = spans(y);
      if (push > 0) sp = inter(inter(sp, spans(y - push)), spans(y + push));
      const segs = [];
      for (const [x0, x1] of sp) if (x1 - x0 > 0.05) segs.push({ r, y, x0, x1 });
      rows.push(segs);
    }
    // Zeilen-Segmente zu zusammenhängenden Blöcken verbinden
    const blocks = [];
    let active = [];
    for (const segs of rows) {
      const next = [];
      const ov = (a, b) => a.x0 < b.x1 && b.x0 < a.x1;
      const used = new Set();
      // Ein Block läuft mit dem Segment weiter, mit dem er sich am stärksten überdeckt; abzweigende
      // oder einmündende Stücke (Fellzacken, kleine Ausläufer) werden eigene Blöcke, ohne den großen
      // Abschnitt zu unterbrechen. So entstehen wenige große Abschnitte statt vieler kleiner.
      const pairs = [];
      for (const b of active) for (const sg of segs) if (ov(b.last, sg)) pairs.push({ b, sg, o: Math.min(b.last.x1, sg.x1) - Math.max(b.last.x0, sg.x0) });
      pairs.sort((p1, p2) => p2.o - p1.o);
      const taken = new Set();
      for (const pr of pairs) {
        if (used.has(pr.b) || taken.has(pr.sg)) continue;
        pr.b.rows.push(pr.sg); pr.b.last = pr.sg; used.add(pr.b); taken.add(pr.sg); next.push(pr.b);
      }
      for (const sg of segs) {
        if (taken.has(sg)) continue;
        const nb = { rows: [sg], last: sg };
        blocks.push(nb);
        next.push(nb);
      }
      active = next;
    }
    return blocks;
  }

  // Nachbarschaft der Blöcke: top[j] = Blöcke an der ersten Reihe von j, bot[j] = an der letzten Reihe;
  // all[j] = alle Nachbarn (auch wenn j mitten an einem anderen Block hängt)
  function blockAdj(list) {
    const n = list.length;
    const byR = list.map((b) => { const m = new Map(); for (const sg of b.rows) m.set(sg.r, sg); return m; });
    const ov = (a, b) => a.x0 < b.x1 && b.x0 < a.x1;
    const top = list.map(() => []), bot = list.map(() => []), all = list.map(() => new Set());
    for (let j = 0; j < n; j++) {
      const f = list[j].rows[0], l = list[j].rows[list[j].rows.length - 1];
      for (let i = 0; i < n; i++) {
        if (i === j) continue;
        const a = byR[i].get(f.r - 1);
        if (a && ov(a, f)) { top[j].push(i); all[j].add(i); all[i].add(j); }
        const c = byR[i].get(l.r + 1);
        if (c && ov(c, l)) { bot[j].push(i); all[j].add(i); all[i].add(j); }
      }
    }
    return { top, bot, all: all.map((x) => [...x]) };
  }

  // Versatz der Einstiche je Reihe (Anteil der Stichlänge) – erzeugt das sichtbare Muster der Fläche
  function patternOffset(pat, r) {
    r = ((r % 1e6) + 1e6) % 1e6;
    if (pat === 'diamond') { const N = 6, m = r % (2 * N); return Math.abs(m - N) / N; }
    if (pat === 'diagonal') return (r % 8) / 8;
    if (pat === 'brick') return (Math.floor(r / 3) % 2) * 0.5;
    if (pat === 'wave') return 0.5 + 0.45 * Math.sin((2 * Math.PI * r) / 16);
    return [0, 0.5, 0.25, 0.75][r % 4];
  }

  // Erzeugt Stiche für eine Füllung im gedrehten Koordinatensystem (Zeilen horizontal)
  function fillRotated(rings, o, startPt) {
    const blocks = scanBlocks(rings, o.spacing, o.gradEnd, o.push || 0);
    let out, cur, remaining, done, tcost;
    const reset = () => { out = []; cur = startPt; remaining = blocks.filter((b) => b.rows.length); done = []; doneIds = new Set(); doneRows = new Map(); tcost = 0; };
    // Blockkarte: welche Teilfläche deckt welche Stelle (für schnelle Abfragen „schon gestickt?“)
    const bbAll = G.bbox(rings.flat()), gc = 0.4;
    const gx0 = bbAll.x0 - 1, gy0 = bbAll.y0 - 1, GW = Math.ceil((bbAll.x1 - gx0 + 1) / gc) + 1, GH = Math.ceil((bbAll.y1 - gy0 + 1) / gc) + 1;
    const bmap = new Int32Array(GW * GH).fill(-1);
    const bIdx = new Map();
    blocks.forEach((b, bi) => {
      bIdx.set(b, bi);
      for (const sg of b.rows) {
        const band = (o.gradEnd || o.spacing) * 0.75;
        const r0 = Math.max(0, Math.ceil((sg.y - band - gy0) / gc - 0.5)), r1 = Math.min(GH - 1, Math.floor((sg.y + band - gy0) / gc - 0.5));
        const c0 = Math.max(0, Math.ceil((sg.x0 + 0.3 - gx0) / gc - 0.5)), c1 = Math.min(GW - 1, Math.floor((sg.x1 - 0.3 - gx0) / gc - 0.5));
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) bmap[r * GW + c] = bi;
      }
    });
    const blockAt = (pt) => {
      const c = Math.floor((pt.x - gx0) / gc), r = Math.floor((pt.y - gy0) / gc);
      return c < 0 || r < 0 || c >= GW || r >= GH ? -1 : bmap[r * GW + c];
    };
    let doneIds = new Set(), doneRows = new Map();
    reset();
    // liegt der Punkt auf bereits gestickter Fläche?
    const covered = (pt) => {
      const id = blockAt(pt);
      if (id < 0) return false;
      if (doneIds.has(id)) return true;
      const ds = doneRows.get(id);
      if (!ds || !ds.size) return false;
      // nächste Reihe dieses Blocks (Reihen liegen nach y sortiert)
      const rows = blocks[id].rows;
      let lo = 0, hi = rows.length - 1;
      while (lo < hi) { const m = (lo + hi) >> 1; if (rows[m].y < pt.y) lo = m + 1; else hi = m; }
      let k = lo;
      if (k > 0 && Math.abs(rows[k - 1].y - pt.y) < Math.abs(rows[k].y - pt.y)) k--;
      return ds.has(k);
    };
    const crossesDone = (a, b) => {
      const L = G.dist(a, b), n = Math.floor(L / 0.8);
      for (let i = 1; i < n; i++) if (covered(G.lerp(a, b, i / n))) return true;
      return false;
    };
    let R = null, pre = null;
    // gerade Fahrt nur, wenn sie nicht dicht am Rand entlang läuft (Kante würde dick)
    const awayFromEdge = (a, b) => {
      const L = G.dist(a, b), n = Math.max(2, Math.ceil(L / 1.5));
      for (let t = 1; t < n; t++) { const q = G.lerp(a, b, t / n); if (Math.min(...rings.map((r) => G.nearestOnRing(q, r).d)) < 1.0) return false; }
      return true;
    };
    const router = () => R || (R = G.insideRouter(rings, { margin: 0.35 }));
    // Fahrtkosten: Laufstiche nur durch noch offene Fläche (werden danach überstickt).
    // Über fertiger Fläche praktisch verboten, Randnähe (unter 1 mm) wird gemieden.
    const travelCost = (q, de) => (covered(q) ? 1000 : 1 + 1.5 * Math.max(0, 2 - de));
    function inBlock(b, pt) {
      const r0 = b.rows[0], r1 = b.rows[b.rows.length - 1];
      if (pt.y < Math.min(r0.y, r1.y) - o.spacing || pt.y > Math.max(r0.y, r1.y) + o.spacing) return false;
      return b.rows.some((s) => Math.abs(s.y - pt.y) <= (o.gradEnd || o.spacing) * 0.75 && pt.x > s.x0 + 0.3 && pt.x < s.x1 - 0.3);
    }
    /**
     * Reihenfolge wie beim Digitalisieren von Hand: Teilstücke bilden einen Baum (Ecken/Ausläufer = Blätter).
     * Immer ein Stück wählen, ohne das die restliche offene Fläche zusammenhängt (bevorzugt eine Ecke).
     * Der Laufstich fährt durch die offene Fläche bis in die Spitze dieses Stücks, die Reihen kommen von dort
     * zurück zur offenen Fläche. So liegt jeder Fahrweg unter später gestickten Reihen – nie über fertiger
     * Fläche, nie am Rand entlang. Zum Schluss bleibt der große Bereich, der von seinem Ende her gestickt wird.
     */
    function planTree(list, start) {
      const adj = blockAdj(list);
      const top = adj.top.map((x) => new Set(x)), bot = adj.bot.map((x) => new Set(x));
      const rem = new Set(list.map((_, i) => i));
      const nbs = (k) => adj.all[k].filter((q) => rem.has(q));
      const connectedWithout = (k) => {
        const left = [...rem].filter((q) => q !== k);
        if (left.length <= 1) return true;
        const seen = new Set([left[0]]), st = [left[0]];
        while (st.length) { const q = st.pop(); for (const r of nbs(q)) if (r !== k && !seen.has(r)) { seen.add(r); st.push(r); } }
        return seen.size === left.length;
      };
      const PR = G.insideRouter(rings, { margin: 0.35, cell: 0.7 });
      const seq = [];
      let cur = start;
      while (rem.size) {
        let cands = [...rem].filter((k) => connectedWithout(k));
        if (!cands.length) cands = [...rem];
        const leaves = cands.filter((k) => nbs(k).length <= 1);
        if (leaves.length) cands = leaves;
        // Möglichkeiten je Kandidat: an der Seite ohne Nachbarn beginnen, zur offenen Fläche hin enden
        const opts = [];
        for (const k of cands) {
          const b = list[k], tn = [...top[k]].filter((q) => rem.has(q)).length, bn = [...bot[k]].filter((q) => rem.has(q)).length;
          const revs = tn && !bn ? [true] : bn && !tn ? [false] : [false, true];
          for (const rv of revs) for (const sd of [0, 1]) {
            const rows = rv ? b.rows.slice().reverse() : b.rows;
            const f = rows[0], l = rows[rows.length - 1], es = rows.length % 2 ? 1 - sd : sd;
            opts.push({ k, b, rev: rv, side: sd, entry: { x: sd ? f.x1 : f.x0, y: f.y }, exit: { x: es ? l.x1 : l.x0, y: l.y } });
          }
        }
        let best = opts[0];
        if (cur && opts.length > 1) {
          const remIds = new Set([...rem].map((q) => bIdx.get(list[q])));
          const cost = (q, de) => { const id = blockAt(q); return id >= 0 && !remIds.has(id) ? 1000 : 1 + 1.5 * Math.max(0, 2 - de); };
          const tg = new Set(opts.map((op) => PR.snap(op.entry)).filter((t) => t >= 0));
          const f = PR.field(cur, cost, -1, tg);
          let bc = Infinity;
          for (const op of opts) { const c = PR.costTo(f, op.entry) + 0.01 * G.dist(cur, op.entry); if (c < bc) { bc = c; best = op; } }
        }
        seq.push({ b: best.b, rev: best.rev, side: best.side });
        cur = best.exit;
        rem.delete(best.k);
      }
      return seq;
    }
    function planBlocks(list, start) {
      const PR = G.insideRouter(rings, { margin: 0.35, cell: 0.7 });
      const optsOf = (b) => {
        const res = [];
        for (const rv of [false, true]) for (const sd of [0, 1]) {
          const rows = rv ? b.rows.slice().reverse() : b.rows;
          const f = rows[0], l = rows[rows.length - 1], n = rows.length;
          const es = n % 2 ? 1 - sd : sd;
          res.push({ b, rev: rv, side: sd, entry: { x: sd ? f.x1 : f.x0, y: f.y }, exit: { x: es ? l.x1 : l.x0, y: l.y } });
        }
        return res;
      };
      const allOpts = list.map(optsOf);
      const width = list.length <= 12 ? 5 : list.length <= 30 ? 3 : 2;
      let beam = [{ cur: start, done: [], cost: 0, seq: [] }];
      for (let step = 0; step < list.length; step++) {
        const kids = [];
        for (const stt of beam) {
          const dset = new Set(stt.done.map((i) => bIdx.get(list[i])));
          const onDone = (q) => { const id = blockAt(q); return id >= 0 && dset.has(id); };
          const cost = (q, de) => (!onDone(q) ? 1 : de < 0.9 ? 1.5 : 40);
          // nur bis alle möglichen Einstiege erreicht sind suchen
          let f = null;
          if (stt.cur) {
            const tg = new Set();
            list.forEach((b, i) => { if (!stt.done.includes(i)) for (const op of allOpts[i]) { const t = PR.snap(op.entry); if (t >= 0) tg.add(t); } });
            f = PR.field(stt.cur, cost, -1, tg);
          }
          list.forEach((b, i) => {
            if (stt.done.includes(i)) return;
            for (const op of allOpts[i]) {
              let c;
              if (!stt.cur) c = (op.rev ? 0.01 : 0) + op.side * 0.01;
              else {
                const e = G.dist(stt.cur, op.entry);
                // wie beim Sticken: gerade Verbindung, wenn sie innen bleibt und nichts Fertiges kreuzt
                let straight = e < 0.8;
                if (!straight && G.segmentInside(stt.cur, op.entry, rings)) {
                  const n = Math.floor(e / 0.8);
                  straight = true;
                  for (let t = 1; t < n && straight; t++) if (onDone(G.lerp(stt.cur, op.entry, t / n))) straight = false;
                }
                c = straight ? e : PR.costTo(f, op.entry);
                if (!isFinite(c)) c = e + 1000;
              }
              kids.push({ cur: op.exit, done: stt.done.concat([i]), cost: stt.cost + c, seq: stt.seq.concat([op]) });
            }
          });
        }
        kids.sort((x, y) => x.cost - y.cost);
        const seen = new Set();
        beam = [];
        for (const k of kids) {
          const key = k.done.slice().sort((x, y) => x - y).join(',') + '|' + k.cur.x.toFixed(1) + ',' + k.cur.y.toFixed(1);
          if (seen.has(key)) continue;
          seen.add(key);
          beam.push(k);
          if (beam.length >= width) break;
        }
      }
      if (o.exitTarget) beam.forEach((k) => { k.cost += 0.6 * G.dist(k.cur, o.exitTarget); });
      beam.sort((x, y) => x.cost - y.cost);
      return beam.length ? beam[0].seq.slice() : null;
    }
    // Fahrwege markieren (tv), damit Prüfung und Messung sie von normalen Stichen unterscheiden können
    const travel = (from, to) => { const n0 = out.length; travel0(from, to); for (let k = n0; k < out.length; k++) out[k].tv = 1; };
    const travel0 = (from, to) => {
      if (!from) { push(out, to); return; }
      const d = G.dist(from, to);
      if (d < 0.5) { push(out, to); return; }
      if (G.segmentInside(from, to, rings) && !crossesDone(from, to)) { tcost += d; runAlong(out, [from, to], 3); return; }
      // Weg im Inneren der Form, bevorzugt über noch nicht gestickte Bereiche (wird dort später überdeckt)
      let ip = pre && pre.a === from ? router().pathTo(pre, to) : router().pathTo(router().field(from, travelCost, router().snap(to)), to);
      if (!ip) ip = G.insidePath(from, to, rings, { margin: 0.2, cost: travelCost });
      if (ip) {
        for (let i = 1; i < ip.length; i++) {
          const L = G.dist(ip[i - 1], ip[i]), n = Math.max(1, Math.ceil(L / 0.8));
          for (let t = 0; t < n; t++) {
            const q = G.lerp(ip[i - 1], ip[i], (t + 0.5) / n);
            // Anfang und Ende einer Fahrt liegen zwangsläufig an Reihen – nur die Strecke dazwischen bewerten
            const near = G.dist(q, from) < 0.8 || G.dist(q, to) < 0.8;
            tcost += (L / n) * (near ? 1 : travelCost(q, 0.9));
          }
        }
        runAlong(out, ip, 2.5); push(out, to); return;
      }
      let best = null;
      for (const ring of rings) {
        const A = G.nearestOnRing(from, ring), B = G.nearestOnRing(to, ring);
        if (A.d < 0.8 && B.d < 0.8) { best = G.ringPath(ring, A, B); break; }
      }
      if (best && G.polyLength(best) < d * 4 + 10) { tcost += G.polyLength(best) * 1.6; runAlong(out, best, 2.5); push(out, to); }
      else { tcost += 1000; push(out, to, 1); }
    };
    // Reihenfolge der Teilflächen vorab planen (Strahlsuche): Fahrten sollen über noch offene Fläche
    // oder am Rand laufen, nicht sichtbar über bereits gestickte Reihen
    const planned = remaining.length > 1 ? planTree(remaining, cur) : null;
    const runOnce = (plan) => {
    reset();
    while (remaining.length) {
      let bi = 0, rev = false, side = 0, bd = Infinity;
      if (plan && plan.length) {
        const nx = plan.shift();
        bi = remaining.indexOf(nx.b); rev = nx.rev; side = nx.side;
        if (bi < 0) { bi = 0; rev = false; side = 0; }
      } else {
        remaining.forEach((b, i) => {
          const f = b.rows[0], l = b.rows[b.rows.length - 1];
          const opts = [[f, false, 0], [f, false, 1], [l, true, 0], [l, true, 1]];
          for (const [s, rv, sd] of opts) {
            const pt = { x: sd ? s.x1 : s.x0, y: s.y };
            const d = cur ? G.dist(cur, pt) : (rv ? 1 : 0) + sd;
            if (d < bd) { bd = d; bi = i; rev = rv; side = sd; }
          }
        });
      }
      pre = null;
      const b = remaining.splice(bi, 1)[0];
      const rows = rev ? b.rows.slice().reverse() : b.rows;
      let dir = side; // 0: links→rechts
      const pc = o.pull || 0, ins = o.inset || 0;
      rows.forEach((s, k) => {
        let x0 = s.x0 - pc + ins, x1 = s.x1 + pc - ins;
        if (x1 - x0 < 0.3) { if (ins) return; const m = (x0 + x1) / 2; x0 = m - 0.15; x1 = m + 0.15; }
        const a = { x: dir ? x1 : x0, y: s.y }, e = { x: dir ? x0 : x1, y: s.y };
        if (k === 0) travel(cur, a);
        if (o.satin) {
          // Satin: nur Randeinstiche, abwechselnd
          if (k === 0) push(out, a);
          else splitStitch(out, out[out.length - 1], a, o.split, k);
          cur = a;
          dir = 1 - dir;
          return;
        } else {
          // Reihenwechsel: bei flachem Rand liegen die Reihenenden weit auseinander -> in kurzen Stichen verbinden
          if (k > 0 && cur && G.dist(cur, a) > Math.max(o.len, 3)) travel(cur, a);
          push(out, a);
          const L = o.len, offs = patternOffset(o.pattern, s.r) * L;
          const minEnd = L * 0.3;
          const xs = [];
          const g0 = Math.ceil((x0 + minEnd - offs) / L);
          for (let m = g0; offs + m * L < x1 - minEnd; m++) xs.push(offs + m * L);
          if (dir) xs.reverse();
          xs.forEach((x) => push(out, { x, y: s.y }));
          push(out, e);
        }
        cur = e;
        dir = 1 - dir;
      });
      done.push(b); doneIds.add(bIdx.get(b));
    }
    return { out, end: cur, cost: tcost };
    };
    /**
     * Ausläufer und Zacken im Durchgang mitsticken statt sie anzufahren:
     * In jedes Teilstück hinein jede zweite Reihe, an der Spitze (bzw. nach den dort hängenden Teilstücken)
     * umkehren und die Reihen dazwischen auf dem Rückweg sticken. Es braucht keine Fahrt in die Ecke und keine
     * zurück; nur zwischen zwei Ausläufern an derselben Kante ein kurzer Weg entlang einer Reihe,
     * die erst auf dem Rückweg gestickt wird (also darunter liegt).
     */
    const runDFS = () => {
      reset();
      const list = remaining.slice(), n = list.length;
      const ov = (a2, b2) => a2.x0 < b2.x1 && b2.x0 < a2.x1;
      const top = list.map(() => []), bot = list.map(() => []);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const a1 = list[i].rows[list[i].rows.length - 1], b0 = list[j].rows[0];
        if (b0.r === a1.r + 1 && ov(a1, b0)) { bot[i].push(j); top[j].push(i); }
      }
      const seen = new Set();
      const pc = o.pull || 0, ins = o.inset || 0;
      const rowPts = (sg) => {
        let x0 = sg.x0 - pc + ins, x1 = sg.x1 + pc - ins;
        if (x1 - x0 < 0.3) { if (ins) return null; const m = (x0 + x1) / 2; x0 = m - 0.15; x1 = m + 0.15; }
        return { x0, x1 };
      };
      const stitchRow = (bi, k) => {
        const b = list[bi], sg = b.rows[k], rp = rowPts(sg);
        const id = bIdx.get(b);
        if (!doneRows.has(id)) doneRows.set(id, new Set());
        doneRows.get(id).add(k);
        if (!rp) return;
        // am näheren Ende beginnen
        const L0 = { x: rp.x0, y: sg.y }, R0 = { x: rp.x1, y: sg.y };
        const dir = cur && G.dist(cur, R0) < G.dist(cur, L0) ? 1 : 0;
        const a2 = dir ? R0 : L0, e = dir ? L0 : R0;
        if (cur && G.dist(cur, a2) > Math.max(o.len, 3)) travel(cur, a2);
        else if (!cur) travel(cur, a2);
        push(out, a2);
        const L = o.len, offs = patternOffset(o.pattern, sg.r) * L, minEnd = L * 0.3;
        const xs = [];
        const g0 = Math.ceil((rp.x0 + minEnd - offs) / L);
        for (let m = g0; offs + m * L < rp.x1 - minEnd; m++) xs.push(offs + m * L);
        if (dir) xs.reverse();
        xs.forEach((x) => push(out, { x, y: sg.y }));
        push(out, e);
        cur = e;
      };
      const nearRowMid = (j, fromTop) => { const r = fromTop ? list[j].rows[0] : list[j].rows[list[j].rows.length - 1]; return { x: (r.x0 + r.x1) / 2, y: r.y }; };
      const visitAll = (cands) => {
        // nächstes noch offenes Teilstück zuerst (vom aktuellen Punkt aus)
        let left = cands.filter((c) => !seen.has(c.j));
        while (left.length) {
          left.sort((p, q) => (cur ? G.dist(cur, nearRowMid(p.j, p.fromTop)) - G.dist(cur, nearRowMid(q.j, q.fromTop)) : 0));
          const c = left.shift();
          if (!seen.has(c.j)) visit(c.j, c.fromTop);
          left = left.filter((q) => !seen.has(q.j));
        }
      };
      const visit = (i, fromTop) => {
        seen.add(i);
        const nR = list[i].rows.length;
        const idx = Array.from({ length: nR }, (_, k) => (fromTop ? k : nR - 1 - k));
        const nearSide = (fromTop ? top[i] : bot[i]).map((j) => ({ j, fromTop: !fromTop }));
        const farSide = (fromTop ? bot[i] : top[i]).map((j) => ({ j, fromTop }));
        // Teilstücke, die an der Einstiegskante hängen, zuerst (die Einstiegsreihe ist noch offen)
        visitAll(nearSide);
        // hin: jede zweite Reihe; die letzte (ferne) Reihe bleibt für den Rückweg offen
        const farPar = (nR - 1) % 2;
        for (let p = 0; p < nR; p++) if (p % 2 !== farPar) stitchRow(i, idx[p]);
        // an der fernen Kante hängende Teilstücke (Wege dazwischen über der noch offenen letzten Reihe)
        visitAll(farSide);
        // zurück: die Reihen dazwischen
        for (let p = nR - 1; p >= 0; p--) if (p % 2 === farPar) stitchRow(i, idx[p]);
        doneIds.add(bIdx.get(list[i]));
      };
      while (seen.size < n) {
        // Einstieg: Teilstück, dessen Randreihe dem aktuellen Punkt am nächsten liegt
        let best = null, bd = Infinity;
        for (let j = 0; j < n; j++) {
          if (seen.has(j)) continue;
          for (const ft of [true, false]) { const d = cur ? G.dist(cur, nearRowMid(j, ft)) : (ft ? 0 : 1) + j * 1e-3; if (d < bd) { bd = d; best = { j, ft }; } }
        }
        visit(best.j, best.ft);
      }
      return { out, end: cur, cost: tcost };
    };
    // geplante Reihenfolge und einfache Nächster-Block-Reihenfolge ausführen, die mit weniger sichtbaren Fahrten nehmen
    if (!o.satin && remaining.length > 1 && o.order !== 'blocks') {
      const D2 = runDFS();
      const A2 = runOnce(planned ? planned.slice() : null);
      return D2.cost <= A2.cost * 1.05 + 5 ? D2 : A2;
    }
    const A = runOnce(planned ? planned.slice() : null);
    const score = (r) => r.cost + (o.exitTarget && r.end ? 0.6 * G.dist(r.end, o.exitTarget) : 0);
    if (!planned) {
      // ein einziger Block: Richtung so wählen, dass das Ende nahe am nächsten Objekt liegt
      if (o.exitTarget && remaining.length === 1 && remaining[0].rows.length > 1) {
        let best = A;
        for (const rv of [false, true]) for (const sd of [0, 1]) {
          const r = runOnce([{ b: blocks.filter((b) => b.rows.length)[0], rev: rv, side: sd }]);
          if (score(r) < score(best) - 1e-6) best = r;
        }
        return best;
      }
      return A;
    }
    const B = runOnce(null);
    return score(B) < score(A) ? B : A;
  }

  function fillRings(obj) {
    const outer = G.buildPath(obj.points, true).pts;
    const rings = [outer];
    for (const h of obj.holes || []) if (h.length >= 3) rings.push(G.buildPath(h, true).pts);
    return rings;
  }

  function genFill(obj) {
    const p = obj.params;
    if (obj.points.length < 3) return [];
    const rings = fillRings(obj);
    const ang = (p.angle * Math.PI) / 180;
    const out = [];
    const ul = p.underlay || 'none';
    let start = obj._entry || null;
    const addRot = (a, opts, warp) => {
      let rr = rings.map((r) => r.map((q) => G.rot(q, -a)));
      let sp = start ? G.rot(start, -a) : null;
      // Wellenfüllung: Reihen folgen einer Sinuswelle (Fläche wird dafür verzerrt und danach zurückgebogen)
      const wy = warp ? (x) => warp.amp * Math.sin((2 * Math.PI * x) / warp.len) : null;
      if (wy) {
        rr = rr.map((r) => G.resample(r.concat([r[0]]), 0.5, 20).slice(0, -1).map((q) => ({ x: q.x, y: q.y - wy(q.x) })));
        if (sp) sp = { x: sp.x, y: sp.y - wy(sp.x) };
      }
      if (opts.exitTarget) opts = { ...opts, exitTarget: G.rot(opts.exitTarget, -a) };
      if (obj._fast) opts = { ...opts, fast: true };
      const res = fillRotated(rr, opts, sp);
      if (wy) res.out.forEach((q) => { q.y += wy(q.x); });
      res.out.forEach((q) => { const n0 = out.length; push(out, G.rot(q, a), q.j); if (q.tv && out.length > n0) out[out.length - 1].tv = 1; });
      if (out.length) start = out[out.length - 1];
    };
    if (ul.includes('edge')) {
      // Kantenlauf leicht nach innen versetzt
      const r0 = rings[0].concat([rings[0][0]]);
      const sgn = G.signedArea(rings[0]) > 0 ? 1 : -1;
      const off = G.offsetPolyline(G.resample(r0, 0.5, 180), 0.35 * sgn);
      const a = Math.abs(G.signedArea(off)), b = Math.abs(G.signedArea(G.offsetPolyline(G.resample(r0, 0.5, 180), -0.35 * sgn)));
      let edge = a < b ? off : G.offsetPolyline(G.resample(r0, 0.5, 180), -0.35 * sgn);
      if (start) {
        // Kantenlauf am Einstiegspunkt beginnen lassen
        let bi = 0;
        edge.forEach((q, i) => { if (G.dist(q, start) < G.dist(edge[bi], start)) bi = i; });
        edge = edge.slice(bi, -1).concat(edge.slice(0, bi + 1));
      }
      runAlong(out, edge, 2.5);
      start = out[out.length - 1];
    }
    if (ul.includes('tatami')) addRot(ang + Math.PI / 2, { spacing: 2.2, len: 3.5, pull: 0, inset: 0.45 });
    const ft = p.fillType || 'tatami';
    const satinFill = ft === 'satin';
    if (HW.fills && (ft === 'contour' || ft === 'spiral' || ft === 'cross')) {
      const res = HW.fills[ft](rings, p, start);
      res.forEach((q, i) => {
        if (i === 0 && out.length && G.dist(out[out.length - 1], q) > 2.5) {
          // von der Unterlage zum Anfang der Füllung im Inneren laufen (kein Sprung)
          const ip = G.insidePath(out[out.length - 1], q, rings, { margin: 0.35, snap: 3 });
          if (ip) { runAlong(out, ip, 2.5); return; }
          push(out, q, 1); return;
        }
        push(out, q, q.j);
      });
    } else if (ft === 'knock') {
      // Knockdown: lockeres Gitter, drückt Flor/Schlaufen flach (zwei Lagen über Kreuz)
      addRot(ang, { spacing: p.spacing, len: p.len, pull: 0 });
      addRot(ang + Math.PI / 2, { spacing: p.spacing, len: p.len, pull: 0 });
    } else {
      const warp = ft === 'wave' ? { amp: p.waveAmp || 1.5, len: p.waveLen || 12 } : null;
      addRot(ang, {
        spacing: satinFill ? p.spacing / 2 : p.spacing,
        len: warp ? Math.min(p.len, warp.len / 6) : p.len,
        pull: p.pull, push: p.push ?? 0, satin: satinFill, split: p.split, exitTarget: p.border && p.border !== 'none' ? null : obj._exit || null,
        pattern: ft === 'pattern' ? p.pattern || 'diamond' : null,
        gradEnd: ft === 'gradient' ? Math.max(p.spacing, p.gradEnd || 2) : 0,
      }, warp);
    }
    if (p.border && p.border !== 'none') {
      // Umrandung für Außenkontur und alle Löcher; jede beginnt dort, wo die Nadel gerade steht
      const todo = [obj.points, ...(obj.holes || []).filter((h) => h.length >= 3)];
      while (todo.length) {
        const lastF = out[out.length - 1];
        let ri = 0;
        if (lastF) {
          let bd = Infinity;
          todo.forEach((r, k) => { for (const q of r) { const d = G.dist(q, lastF); if (d < bd) { bd = d; ri = k; } } });
        }
        let bpts = todo.splice(ri, 1)[0];
        if (lastF && bpts.length > 2) {
          let bi = 0;
          bpts.forEach((q, i) => { if (G.dist(q, lastF) < G.dist(bpts[bi], lastF)) bi = i; });
          bpts = bpts.slice(bi).concat(bpts.slice(0, bi));
        }
        let bs;
        if (p.border === 'satin') {
          const bw = p.borderWidth || 2;
          bs = genSatin({ type: '_border', points: bpts, params: { ...DEFAULTS.satin, width: bw, underlay: bw <= 2.5 ? 'center' : 'edge+zigzag', pull: bw < 1.5 ? 0.1 : 0.2 } });
        } else {
          bs = genRun({ type: 'run', points: bpts, params: { len: p.borderLen || 2.5, style: p.border === 'triple' ? 'triple' : 'single', closed: true } });
        }
        if (!bs.length) continue;
        const last = out[out.length - 1];
        if (last && G.dist(last, bs[0]) > 2) {
          // kurzer Weg zum Anfang der Umrandung, nicht am Rand entlang
          const ip = G.insidePath(last, bs[0], rings, { margin: 0.35, cost: (q, de) => (de < 1.0 ? 3 : 1), snap: 3 });
          if (ip) runAlong(out, ip, 2.5); else push(out, bs[0], 1);
        }
        bs.forEach((q) => push(out, q, q.j));
      }
    }
    return out;
  }

  /* ---------- Manuelle Stiche ---------- */
  function genManual(obj) {
    return (obj.stitches || []).map((s) => ({ x: s.x, y: s.y, j: s.j ? 1 : 0 }));
  }

  // fabId: Stoffprofil – passt Dichte, Länge, Zugausgleich, Unterlage automatisch an (siehe fabric.js)
  function generate(obj, fabId) {
    const orig = obj;
    // gewählter Ein-/Ausstieg (route.js): Richtung umdrehen, Startpunkt, Einstieg bei Flächen
    if (obj._route && HW.route) obj = HW.route.apply(obj);
    if (fabId && HW.fabric && obj.params) {
      const eff = HW.fabric.effective(obj, fabId);
      orig._eff = eff;
      obj = { ...obj, params: eff.params };
    }
    switch (obj.type) {
      case 'run': return genRun(obj);
      case 'colA': case 'colB': case 'colC': return genSatin(obj);
      case 'fill': return genFill(obj);
      case 'manual': return genManual(obj);
      default: return [];
    }
  }

  // Kreuzungen (Stichpositionen) einer Satinsäule mit den wirksamen Parametern – für die Stickprüfung
  function satinCrossings(obj, fabId) {
    const p = fabId && HW.fabric ? HW.fabric.effective(obj, fabId).params : obj.params;
    const segs = railsFor({ ...obj, params: p });
    if (!segs) return [];
    return crossings(segs, (p.spacing || 0.4) / 2);
  }

  HW.stitch = { DEFAULTS, generate, railsFor, fillRings, satinCrossings, patternOffset };
})(typeof window !== 'undefined' ? window : globalThis);
