/* Fertig digitalisierte Stickschriften (siehe fonts/stickfonts).
   Laden bei Bedarf und Setzen von Text -> Stickobjekte (Satinsäulen, Füllungen, Laufstiche). */
(function (g) {
  const HW = (g.HW = g.HW || {});
  HW.INKFONTS = HW.INKFONTS || {};
  const waiting = {};

  HW.registerInkFont = (f) => {
    HW.INKFONTS[f.id] = f;
    (waiting[f.id] || []).forEach((cb) => cb(f));
    delete waiting[f.id];
  };

  // Schrift per <script> nachladen (funktioniert auch bei file://)
  HW.loadInkFont = (id) => new Promise((resolve, reject) => {
    if (HW.INKFONTS[id]) return resolve(HW.INKFONTS[id]);
    if (typeof document === 'undefined') return reject(new Error('kein Browser'));
    (waiting[id] = waiting[id] || []).push(resolve);
    if (waiting[id].length > 1) return;
    const s = document.createElement('script');
    s.src = 'js/stickfonts/' + id + '.js';
    s.onerror = () => { delete waiting[id]; reject(new Error('Schrift nicht gefunden: ' + id)); };
    document.head.appendChild(s);
  });

  const flat2pts = (a, c) => {
    const out = [];
    for (let i = 0; i + 1 < a.length; i += 2) out.push({ x: a[i], y: a[i + 1], c: !!c });
    return out;
  };

  function glyphObjects(gl) {
    const res = [];
    for (const e of gl) {
      if (e.t === 'colA') {
        const pts = flat2pts(e.p);
        for (let k = 0; k < pts.length; k++) pts[k].c = e.c[k >> 1] === '1';
        res.push({ type: 'colA', points: pts, params: e.pr });
      } else if (e.t === 'fill') {
        res.push({ type: 'fill', points: flat2pts(e.r[0]), holes: e.r.slice(1).map((r) => flat2pts(r)), params: { fillType: 'tatami', ...e.pr } });
      } else if (e.t === 'run') {
        res.push({ type: 'run', points: flat2pts(e.p), params: { closed: false, ...e.pr } });
      } else if (e.t === 'colC') {
        res.push({ type: 'colC', points: flat2pts(e.p), params: e.pr });
      }
    }
    return res;
  }

  function mapObj(o, f, dAng) {
    const m = (arr) => arr.forEach((p) => { const q = f(p); p.x = q.x; p.y = q.y; });
    m(o.points);
    (o.holes || []).forEach(m);
    if (o.type === 'fill' && dAng) o.params.angle = (o.params.angle || 0) + dAng;
  }

  /**
   * Setzt Text. spec: {text, height (mm), spacing (% der Höhe), arc (mm, 0 = gerade), lineGap}
   * Rückgabe: {objects, missing: [Zeichen], width, height} – Koordinaten mm, Mitte der ersten Zeile bei (0,0)
   */
  HW.layoutInkText = (font, spec) => {
    const sc = spec.height / (font.size || 20);
    const extra = ((spec.spacing || 0) / 100) * spec.height / sc;
    const lines = String(spec.text).split('\n');
    const missing = new Set();
    const all = [];
    const lead = font.leading * (spec.lineGap || 1);
    let gi = 0; // laufende Zeichennummer (für Einzelanpassungen)
    const kernAdj = spec.kernAdj || {};
    lines.forEach((line, li) => {
      let x = 0, prev = null;
      const placed = [];
      for (const ch of line) {
        if (ch === ' ') { x += font.space + extra; prev = ' '; continue; }
        let gl = font.glyphs[ch];
        if (!gl && font.glyphs[ch.toUpperCase()]) gl = font.glyphs[ch.toUpperCase()];
        if (!gl && font.glyphs[ch.toLowerCase()]) gl = font.glyphs[ch.toLowerCase()];
        if (!gl) { missing.add(ch); continue; }
        if (prev && prev !== ' ') {
          const k = font.kern[prev + ch] ?? 0;
          x -= k;
          x += extra;
        }
        if (kernAdj[gi]) x += kernAdj[gi] / sc; // Abstand von Hand (mm)
        const objs = glyphObjects(gl);
        objs.forEach((o) => { o.gi = gi; o.gch = ch; });
        gi++;
        const ox = x, oy = li * lead;
        objs.forEach((o) => mapObj(o, (p) => ({ x: p.x + ox, y: p.y + oy })));
        const adv = font.adv[ch] ?? font.advDefault;
        placed.push({ objs, cx: x + adv / 2 });
        x += adv;
        prev = ch;
      }
      const w = x;
      placed.forEach((pl) => { pl.objs.forEach((o) => mapObj(o, (p) => ({ x: p.x - w / 2, y: p.y }))); pl.cx -= w / 2; });
      all.push(...placed);
    });
    // skalieren
    all.forEach((pl) => { pl.objs.forEach((o) => mapObj(o, (p) => ({ x: p.x * sc, y: p.y * sc }))); pl.cx *= sc; });
    // Bogen: jedes Zeichen starr auf den Kreis setzen
    if (spec.arc && lines.length === 1) {
      const R = Math.abs(spec.arc), top = spec.arc > 0;
      for (const pl of all) {
        const th = pl.cx / R;
        const cx = pl.cx;
        const c = top ? { x: 0, y: R } : { x: 0, y: -R };
        const ang = top ? th : -th;
        const co = Math.cos(ang), si = Math.sin(ang);
        pl.objs.forEach((o) => mapObj(o, (p) => {
          const qx = p.x - cx, qy = (top ? p.y : p.y + spec.height) - c.y;
          return { x: c.x + qx * co - qy * si, y: c.y + qx * si + qy * co };
        }, (ang * 180) / Math.PI));
      }
    }
    return { objects: all.flatMap((pl) => pl.objs), missing: [...missing] };
  };
})(typeof window !== 'undefined' ? window : globalThis);
