/* Stickprüfung: erkennt Stichwinkel, Dichte und Stichlängen, die eine Stickmaschine nicht sauber stickt.
   Die Regeln gelten allgemein für Stickmaschinen; die Grenzwerte kommen aus dem Maschinenprofil. */
(function (g) {
  const HW = (g.HW = g.HW || {});
  const G = HW.geo;

  const MACHINES = {
    industrie: {
      name: 'Industriemaschine (Tajima-kompatibel: Texi, Ricoma, Tajima, Barudan, ZSK …)',
      maxStitch: 12.1, minStitch: 0.3, maxSatin: 10, minSatin: 0.6, minSpacingSatin: 0.28, minSpacingFill: 0.3, maxSpacingSatin: 1.0, maxFillLen: 7, hotspot: 26,
    },
    haushalt: {
      name: 'Haushaltsmaschine (Brother, Bernina, Janome, Pfaff, Husqvarna …)',
      maxStitch: 12.0, minStitch: 0.4, maxSatin: 8, minSatin: 0.8, minSpacingSatin: 0.32, minSpacingFill: 0.35, maxSpacingSatin: 1.0, maxFillLen: 6, hotspot: 22,
    },
  };

  const NAMES = { colA: 'Satinsäule', colB: 'Satinsäule', colC: 'Satinlinie', fill: 'Fläche', run: 'Laufstich', manual: 'Einzelstiche' };

  /**
   * Prüft ein Objekt. Rückgabe: [{code, sev:'fehler'|'warnung', msg, why, at:{x,y}, fix?:{label, apply(o)}}]
   */
  function checkObject(o, m, fabId) {
    const res = [];
    if (o.hidden) return res;
    const eff = (o._eff && o._eff.params) || o.params || {};
    const add = (code, sev, msg, why, at, fix) => res.push({ code, sev, msg, why, at, fix, obj: o.id });
    if (o.type === 'colA' || o.type === 'colB' || o.type === 'colC') {
      const cr = HW.stitch.satinCrossings(o, fabId);
      if (cr.length > 2) {
        // Stichwinkel: Stich fast parallel zur Säule
        let bad = 0, badAt = null, maxW = 0, maxAt = null, n = 0;
        const widths = [];
        for (let k = 1; k < cr.length - 1; k++) {
          const c = cr[k];
          const tx = (cr[k + 1].a.x + cr[k + 1].b.x - cr[k - 1].a.x - cr[k - 1].b.x) / 2;
          const ty = (cr[k + 1].a.y + cr[k + 1].b.y - cr[k - 1].a.y - cr[k - 1].b.y) / 2;
          const vx = c.b.x - c.a.x, vy = c.b.y - c.a.y;
          const lt = Math.hypot(tx, ty), lv = Math.hypot(vx, vy);
          widths.push({ w: lv, at: G.lerp(c.a, c.b, 0.5) });
          // Stichwinkel nur bei ausreichend breiten Stichen bewerten (spitze Enden sind gewollt)
          if (lt > 1e-6 && lv > 1.0) {
            n++;
            const sin = Math.abs(tx * vy - ty * vx) / (lt * lv);
            if (sin < Math.sin((18 * Math.PI) / 180)) { bad++; if (!badAt) badAt = G.lerp(c.a, c.b, 0.5); }
          }
          if (lv > maxW) { maxW = lv; maxAt = G.lerp(c.a, c.b, 0.5); }
        }
        // Verdreht: die beiden Kanten der Säule kreuzen sich (Enden ausgenommen)
        let twist = 0, twistAt = null;
        {
          // a) Einschnürung auf Breite 0 mit Seitenwechsel davor/danach
          const sideOf = (k) => {
            const c = cr[k], p0 = cr[k - 1], p1 = cr[k + 1];
            const tx = p1.a.x + p1.b.x - p0.a.x - p0.b.x, ty = p1.a.y + p1.b.y - p0.a.y - p0.b.y;
            const vx = c.b.x - c.a.x, vy = c.b.y - c.a.y, lt = Math.hypot(tx, ty), lv = Math.hypot(vx, vy);
            if (lv < 0.5 || lt < 1e-6) return 0;
            const sn = (tx * vy - ty * vx) / (lt * lv);
            return Math.abs(sn) > 0.4 ? Math.sign(sn) : 0;
          };
          const lo = Math.max(1, Math.floor(cr.length * 0.08)), hi = Math.min(cr.length - 2, Math.ceil(cr.length * 0.92));
          for (let k = lo; k <= hi && !twist; k++) {
            if (G.dist(cr[k].a, cr[k].b) > 0.3) continue;
            let sb = 0, sa = 0;
            for (let j = k - 1; j >= 1 && !sb && k - j < 40; j--) sb = sideOf(j);
            for (let j = k + 1; j < cr.length - 1 && !sa && j - k < 40; j++) sa = sideOf(j);
            if (sb && sa && sb !== sa) { twist = 2; twistAt = cr[k].a; }
          }
        }
        if (!twist) {
          const stp = Math.max(1, Math.floor(cr.length / 150));
          const A = [], B = [];
          for (let k = 0; k < cr.length; k += stp) { A.push(cr[k].a); B.push(cr[k].b); }
          const skip = Math.max(2, Math.ceil(A.length * 0.04));
          for (let i = skip; i < A.length - 1 - skip && twist < 3; i++)
            for (let j = skip; j < B.length - 1 - skip; j++)
              if (segX(A[i], A[i + 1], B[j], B[j + 1])) { twist++; if (!twistAt) twistAt = A[i]; break; }
        }
        // Breite: nur der mittlere Teil zählt, spitz zulaufende Enden sind normal
        const mid = widths.slice(Math.floor(widths.length * 0.15), Math.ceil(widths.length * 0.85));
        const narrow = mid.filter((x) => x.w < m.minSatin);
        const minW = narrow.length ? Math.min(...narrow.map((x) => x.w)) : Infinity;
        const minAt = narrow.length ? narrow[0].at : null;
        const toB = o.type === 'colA' ? { label: 'Stiche quer zur Säule ausrichten', apply: (ob) => colAtoColB(ob) } : null;
        if (n > 5 && bad > n * 0.2) add('winkel', 'warnung', `Stichwinkel fast parallel zur Säule (${Math.round((bad / n) * 100)} % der Stiche)`,
          'Satinstiche sollten quer zur Säule liegen. Fast parallele Stiche decken nicht, liegen lose auf und reißen leicht aus. Die Maschine sticht dabei viele Einstiche fast an dieselbe Stelle.', badAt, toB);
        if (twist >= 2) add('verdreht', 'fehler', `Säule verdreht – ${twist} Stiche überkreuzen sich`,
          'Die Punktpaare liegen über Kreuz (linke und rechte Seite vertauscht). Die Maschine stickt dort Knoten, der Faden kann reißen.', twistAt, toB);
        const split = eff.split || 0;
        if (maxW > m.maxSatin && !(split > 0 && split < maxW)) add('breit', 'warnung', `Satin ${maxW.toFixed(1).replace('.', ',')} mm breit, ohne Teilung`,
          `Satinstiche über ${fmt(m.maxSatin)} mm hängen lose durch, bleiben hängen und verziehen den Stoff. Teilung (Auto-Split) einschalten oder als Fläche sticken.`, maxAt,
          { label: 'Auto-Split ab 7 mm einschalten', apply: (ob) => setManual(ob, 'split', 7) });
        if (maxW > m.maxStitch * 1.6 && !(split > 0)) add('sehrbreit', 'fehler', 'Satinsäule viel zu breit',
          'So breite Säulen lassen sich nicht sauber als Satin sticken – besser als Tatami-Fläche anlegen.', maxAt, null);
        if (narrow.length > mid.length * 0.3 && minW > 0) add('schmal', 'warnung', `Satin stellenweise nur ${minW.toFixed(1).replace('.', ',')} mm breit`,
          `Unter ${fmt(m.minSatin)} mm stechen die Nadeln fast in dasselbe Loch: Fadenbruch und Löcher im Stoff. Säule verbreitern oder als Laufstich sticken.`, minAt, null);
      }
      checkSpacingSatin(o, eff, m, add, cr);
    }
    if (o.type === 'fill') {
      const sat = eff.fillType === 'satin';
      const sp = sat ? eff.spacing : eff.spacing;
      const ctr = centerOf(o);
      if (!sat && sp < m.minSpacingFill) add('dicht', 'warnung', `Fläche zu dicht (Abstand ${fmt(sp)} mm)`,
        `Unter ${fmt(m.minSpacingFill)} mm Reihenabstand wird die Fläche hart wie ein Brett, Nadel und Faden brechen leichter, der Stoff zieht sich zusammen.`, ctr,
        { label: `Abstand auf ${fmt(m.minSpacingFill + 0.1)} mm setzen`, apply: (ob) => setManual(ob, 'spacing', +(m.minSpacingFill + 0.1).toFixed(2)) });
      if (!sat && eff.len > m.maxFillLen) add('lang', 'warnung', `Tatami-Stiche ${fmt(eff.len)} mm lang`,
        `Lange Flächenstiche über ${fmt(m.maxFillLen)} mm liegen lose und bleiben hängen.`, ctr,
        { label: 'Stichlänge 3,5 mm', apply: (ob) => setManual(ob, 'len', 3.5) });
      if (sat) {
        // Reihenlänge bei Satin-Flächen = Breite quer zum Winkel
        const a = ((eff.angle || 0) * Math.PI) / 180;
        const r = o.points.map((q) => G.rot(q, -a));
        const bb = G.bbox(r);
        const w = bb.x1 - bb.x0;
        if (w > m.maxSatin && !(eff.split > 0)) add('breit', 'warnung', `Satin-Fläche mit bis zu ${fmt(w)} mm langen Stichen`,
          'Der Stichwinkel ergibt sehr lange Satinstiche. Winkel quer zur schmalen Seite drehen, Teilung einschalten oder Tatami verwenden.', ctr,
          { label: 'Auf Tatami umstellen', apply: (ob) => { ob.params.fillType = 'tatami'; } });
        if (eff.spacing < m.minSpacingSatin) add('dicht', 'warnung', `Satin-Fläche zu dicht (${fmt(eff.spacing)} mm)`, 'Zu viele Einstiche dicht nebeneinander.', ctr,
          { label: 'Abstand 0,4 mm', apply: (ob) => setManual(ob, 'spacing', 0.4) });
      }
    }
    if (o.type === 'run') {
      const p = o.params;
      if (p.len < 1) add('kurz', 'warnung', `Laufstich nur ${fmt(p.len)} mm lang`, 'Sehr kurze Stiche erzeugen Fadenbruch und Knötchen. 2–3 mm sind üblich, in engen Kurven 1,5 mm.', o.points[0],
        { label: 'Stichlänge 2 mm', apply: (ob) => { ob.params.len = 2; } });
      if (p.len > 6) add('lang', 'warnung', `Laufstich ${fmt(p.len)} mm lang`, 'Lange Laufstiche liegen lose und bleiben hängen.', o.points[0],
        { label: 'Stichlänge 3 mm', apply: (ob) => { ob.params.len = 3; } });
    }
    // Stichlängen der fertigen Stiche
    const s = o._st || [];
    let tooLong = 0, longAt = null, short = 0;
    for (let i = 1; i < s.length; i++) {
      if (s[i].j || s[i - 1].j) continue;
      const d = G.dist(s[i - 1], s[i]);
      if (d > m.maxStitch) { tooLong++; if (!longAt) longAt = G.lerp(s[i - 1], s[i], 0.5); }
      if (d < m.minStitch) short++;
    }
    if (tooLong) add('maxstich', 'fehler', `${tooLong} Stich(e) länger als ${fmt(m.maxStitch)} mm`, 'Die Maschine kann diese Stiche nicht in einem Schritt sticken; sie werden geteilt oder als Sprung ausgeführt. Satin teilen oder Objekt umbauen.', longAt, null);
    if (short > Math.max(8, s.length * 0.08)) add('kurzstiche', 'warnung', `${short} sehr kurze Stiche (< ${fmt(m.minStitch)} mm)`, 'Viele Einstiche an fast derselben Stelle: Fadenbruch, Vogelnester, Löcher im Stoff.', s[1], null);
    return res;
  }

  function checkSpacingSatin(o, eff, m, add, cr) {
    const at = cr && cr.length ? G.lerp(cr[Math.floor(cr.length / 2)].a, cr[Math.floor(cr.length / 2)].b, 0.5) : centerOf(o);
    if (eff.style !== 'e' && eff.spacing < m.minSpacingSatin) add('dicht', 'warnung', `Satin zu dicht (Abstand ${fmt(eff.spacing)} mm)`,
      `Unter ${fmt(m.minSpacingSatin)} mm stapeln sich die Fäden: harte Stickerei, Fadenbruch, Nadelbruch, gewellter Stoff.`, at,
      { label: 'Abstand 0,4 mm', apply: (ob) => setManual(ob, 'spacing', 0.4) });
    if (eff.style !== 'e' && eff.spacing > m.maxSpacingSatin) add('offen', 'warnung', `Satin sehr offen (Abstand ${fmt(eff.spacing)} mm)`,
      'Der Stoff scheint durch, Satin deckt nicht.', at, { label: 'Abstand 0,4 mm', apply: (ob) => setManual(ob, 'spacing', 0.4) });
  }

  /** Stellen, an denen sich durch übereinanderliegende Objekte zu viele Einstiche häufen */
  function hotspots(cmds, m) {
    const cell = 2; // mm
    const grid = new Map();
    for (const c of cmds) {
      if (c.cmd !== 'stitch') continue;
      const k = Math.floor(c.x / cell) + ',' + Math.floor(c.y / cell);
      const e = grid.get(k);
      if (e) { e.n++; e.objs.add(c.obj); } else grid.set(k, { n: 1, x: c.x, y: c.y, objs: new Set([c.obj]) });
    }
    const res = [];
    // zwei sich kreuzende Säulen sind normal – erst ab drei Lagen oder sehr vielen Einstichen
    for (const e of grid.values()) if ((e.n > m.hotspot && e.objs.size > 2) || e.n > m.hotspot * 1.8) res.push(e);
    res.sort((a, b) => b.n - a.n);
    return res;
  }

  function checkDesign(objects, cmds, m, fabId) {
    const issues = [];
    for (const o of objects) issues.push(...checkObject(o, m, fabId));
    const hs = hotspots(cmds, m);
    if (hs.length) {
      const h = hs[0];
      issues.push({ code: 'hotspot', sev: 'warnung', msg: `${hs.length} Stelle(n) mit zu vielen Stichlagen übereinander (bis ${h.n} Einstiche auf 4 mm²)`,
        why: 'Hier überlappen mehrere Objekte. Die Nadel sticht immer wieder in dieselbe Stelle – Nadelbruch, Fadenbruch und harte Knubbel. Überlappung verkleinern oder unten liegende Bereiche aussparen.',
        at: { x: h.x, y: h.y }, obj: [...h.objs][0] });
    }
    return issues;
  }

  // ---- Hilfen ----
  function segX(a, b, c, d) {
    const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
    return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
  }
  function centerOf(o) {
    const b = G.bbox(o.points && o.points.length ? o.points : [{ x: 0, y: 0 }]);
    return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
  }
  function fmt(v) { return (+v).toFixed(2).replace(/0$/, '').replace('.', ','); }
  function setManual(o, key, v) { o.params[key] = v; o.manual = { ...(o.manual || {}), [key]: true }; }
  // Säule A -> Säule B: Kanten bleiben, Stiche werden senkrecht zur Mittellinie ausgerichtet
  function colAtoColB(o) {
    const L = [], R = [];
    for (let i = 0; i + 1 < o.points.length; i += 2) {
      let a = o.points[i], b = o.points[i + 1];
      // vertauschte Paare (verdrehte Säule) wieder der richtigen Kante zuordnen
      if (L.length && G.dist(a, L[L.length - 1]) + G.dist(b, R[R.length - 1]) > G.dist(a, R[R.length - 1]) + G.dist(b, L[L.length - 1])) [a, b] = [b, a];
      L.push(a); R.push(b);
    }
    o.type = 'colB';
    o.points = L;
    o.side2 = R;
  }

  HW.check = { MACHINES, NAMES, checkObject, checkDesign, hotspots };
})(typeof window !== 'undefined' ? window : globalThis);
