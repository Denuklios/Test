/* StickStudio – Bedienoberfläche und Werkzeuge */
(function () {
  'use strict';
  const G = HW.geo, S = HW.stitch, D = HW.dst;
  const $ = (s) => document.querySelector(s);
  const cv = $('#cv'), ctx = cv.getContext('2d');

  /* ======================= Zustand ======================= */
  const hoop = () => HW.hoops.get(st.hoop, st.customHoops);
  const DEFAULT_PALETTE = [
    ['#111111', 'Schwarz'], ['#ffffff', 'Weiß'], ['#c8102e', 'Rot'], ['#0033a0', 'Königsblau'],
    ['#ffd100', 'Gelb'], ['#00843d', 'Grün'], ['#ff6a13', 'Orange'], ['#8a8d8f', 'Grau'],
    ['#6b4423', 'Braun'], ['#e10098', 'Pink'], ['#6cace4', 'Hellblau'], ['#c99700', 'Gold'],
  ];
  const TYPE_NAMES = { run: 'Laufstich', colA: 'Satinsäule A', colB: 'Satinsäule B', colC: 'Satinlinie C', fill: 'Fläche', manual: 'Einzelstiche' };

  const st = {
    name: 'Design',
    objects: [],
    palette: DEFAULT_PALETTE.map(([hex, name], i) => ({ hex, name, needle: i + 1 })),
    curColor: 0,
    hoop: '290x290',
    customHoops: HW.hoops.loadCustom(),
    fabric: '#f4f1ea',
    material: 'baumwolle',
    bg: null,
    settings: { trimDist: 2.0, jumpMax: 0, lockJump: true, lock: true, trimJumps: 3, spm: 800, machine: 'industrie', limits: {}, checkPopup: true, autoRoute: true, hideTravel: true },
    defaults: {
      run: { ...S.DEFAULTS.run },
      triple: { ...S.DEFAULTS.run, style: 'triple' },
      colA: { ...S.DEFAULTS.satin, underlay: 'edge+zigzag' },
      colB: { ...S.DEFAULTS.satin, underlay: 'edge+zigzag' },
      colC: { ...S.DEFAULTS.satin, underlay: 'center' },
      fill: { ...S.DEFAULTS.fill },
    },
  };
  const view = { scale: 2, ox: 0, oy: 0, trueView: true, jumps: false, grid: true, points: false, snap: false, gridStep: 5 };
  let tool = 'select';
  let draft = null;
  let sel = new Set();
  let selNodes = [];
  let cmds = [];
  let curveMode = false;
  let mouse = { x: 0, y: 0 };
  let playN = Infinity, playing = false;
  let nextId = 1;
  const undoStack = [], redoStack = [];
  const pendingCheck = new Set();
  let issues = [];
  const machine = () => ({ ...HW.check.MACHINES[st.settings.machine || 'industrie'], ...(st.settings.limits || {}) });

  /* ======================= Hilfen ======================= */
  const clone = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k.startsWith('_') ? undefined : v)));
  const toScr = (p) => ({ x: p.x * view.scale + view.ox, y: p.y * view.scale + view.oy });
  const toMM = (x, y) => ({ x: (x - view.ox) / view.scale, y: (y - view.oy) / view.scale });
  const byId = (id) => st.objects.find((o) => o.id === id);
  const selected = () => st.objects.filter((o) => sel.has(o.id));
  const colOf = (i) => (st.palette[i] || st.palette[0] || { hex: '#000' }).hex;
  const fmt = (v, d = 1) => Number(v).toFixed(d).replace('.', ',');

  function snapshot() { return JSON.stringify({ o: clone(st.objects), p: st.palette }); }
  function pushUndo() {
    undoStack.push(snapshot());
    if (undoStack.length > 100) undoStack.shift();
    redoStack.length = 0;
  }
  function restore(s) {
    const d = JSON.parse(s);
    st.objects = d.o; st.palette = d.p;
    sel = new Set([...sel].filter((id) => byId(id)));
    selNodes = [];
    changed();
  }
  function undo() { if (undoStack.length) { redoStack.push(snapshot()); restore(undoStack.pop()); } }
  function redo() { if (redoStack.length) { undoStack.push(snapshot()); restore(redoStack.pop()); } }

  function objName(o) {
    if (o.type === 'run') return o.params.style === 'triple' ? 'Dreifachstich' : o.params.style === 'bean' ? 'Bohnenstich' : 'Laufstich';
    if (o.applPart) return { place: 'Applikation: Platzierung', tack: 'Applikation: Heften', cover: 'Applikation: Abdeckung' }[o.applPart];
    if (o.type === 'fill') return ({ satin: 'Satin-Fläche', contour: 'Kontur-Fläche', spiral: 'Spiral-Fläche', wave: 'Wellen-Fläche', pattern: 'Muster-Fläche', gradient: 'Verlaufs-Fläche', cross: 'Kreuzstich', knock: 'Knockdown' })[o.params.fillType] || 'Tatami-Fläche';
    if (o.params && o.params.puff) return (TYPE_NAMES[o.type] || o.type) + ' (3D-Puff)';
    return TYPE_NAMES[o.type] || o.type;
  }

  function makeObj(type, data) {
    const base = type === 'triple' ? 'run' : type;
    const dk = type;
    return { id: nextId++, type: base, color: st.curColor, params: { ...(st.defaults[dk] || {}) }, points: [], ...data };
  }

  function invalidate(o) { o._st = null; o._rings = null; o._bb = null; o._cover = undefined; pendingCheck.add(o.id); }
  function ensure(o) {
    if (!o._st) {
      pendingCheck.add(o.id);
      try { o._st = S.generate(o, st.material); } catch (e) { console.error(e); o._st = []; }
      o._bb = o._st.length ? G.bbox(o._st) : null;
    }
    return o._st;
  }

  function changed(keepPlay) {
    cmds = computeCmds(st.objects);
    const n = cmds.length;
    const sl = $('#playSlider');
    sl.max = n;
    if (!keepPlay) { playN = Infinity; sl.value = n; }
    renderList();
    renderProps();
    renderStats();
    renderFabric();
    if (!drag) runChecks();
    draw();
  }

  // Maschinenbefehle für eine Objektliste (Ein-/Ausstiege planen, Stiche berechnen, zusammensetzen)
  function computeCmds(objects, quiet) {
    const keep = quiet ? new Set(pendingCheck) : null;
    // Ein-/Ausstiege der Reihe nach wählen (kürzeste Verbindung); das Ende des vorigen Objekts bestimmt den Einstieg des nächsten
    let prevExit = null;
    const vis = objects.filter((o) => !o.hidden && (o.type === 'manual' ? o.stitches.length : o.points.length));
    const planned = st.settings.autoRoute ? HW.route.plan(vis) : [];
    vis.forEach((o, i) => {
      let routeOnly = false;
      if (st.settings.autoRoute) {
        let r = planned[i];
        // Flächen: Einstieg am tatsächlichen Ende des vorigen Objekts
        if (o.type === 'fill' && prevExit) r = HW.route.choose(o, prevExit, null, false);
        if (JSON.stringify(r) !== JSON.stringify(o._route || null)) { routeOnly = !!o._st; o._route = r; o._st = null; o._bb = null; }
      } else if (o._route) { routeOnly = !!o._st; o._route = null; o._st = null; }
      if (!o._st) {
        // nur Ein-/Ausstieg geändert -> keine Bearbeitung durch den Benutzer (kein Prüf-Pop-up)
        const had = pendingCheck.has(o.id);
        ensure(o);
        if (routeOnly && !had) pendingCheck.delete(o.id);
      }
      const s = o._st;
      if (s && s.length) prevExit = s[s.length - 1];
    });
    for (const o of objects) ensure(o);
    const res = D.assemble(objects, st.palette, { ...st.settings, connect: st.settings.hideTravel ? HW.route.connect : null });
    if (keep) { pendingCheck.clear(); keep.forEach((id) => pendingCheck.add(id)); }
    return res;
  }

  /* ---------- Stickprüfung ---------- */
  function runChecks() {
    issues = HW.check.checkDesign(st.objects, cmds, machine(), st.material);
    const btn = $('#checkInfo');
    const nF = issues.filter((i) => i.sev === 'fehler').length, nW = issues.length - nF;
    btn.className = issues.length ? (nF ? 'chk bad' : 'chk warn') : 'chk ok';
    btn.textContent = issues.length ? `⚠ Prüfung: ${nF ? nF + ' Fehler, ' : ''}${nW} Hinweis${nW === 1 ? '' : 'e'}` : '✓ Prüfung ok';
    // Pop-up nur bei einzelnen, gerade bearbeiteten Objekten (nicht bei Auto-Digitalisieren/Text/Laden)
    const touched = new Set(pendingCheck);
    pendingCheck.clear();
    if (!st.settings.checkPopup || !touched.size || touched.size > 3) return;
    const fresh = issues.filter((i) => touched.has(i.obj) && !((byId(i.obj) || {})._ack || new Set()).has(i.code));
    if (fresh.length && $('#modal').classList.contains('hidden')) issueDialog(fresh, true);
  }

  function issueDialog(list, popup) {
    const name = (id) => { const o = byId(id); return o ? `${st.objects.indexOf(o) + 1}. ${objName(o)}` : ''; };
    const html = list.length ? list.map((it, i) => `<div class="issue ${it.sev}">
        <div><b>${it.sev === 'fehler' ? '⛔' : '⚠'} ${it.msg}</b> <small>– ${name(it.obj)}</small></div>
        <div class="why">${it.why}</div>
        <div class="row">${it.fix ? `<button data-fix="${i}">Korrigieren: ${it.fix.label}</button>` : ''}<button data-show="${i}">Zeigen</button></div>
      </div>`).join('') : '<p>✓ Keine Probleme gefunden. Stichwinkel, Dichte und Stichlängen sind für die Maschine in Ordnung.</p>';
    const btns = popup
      ? [{ label: 'Rückgängig', action: () => { undo(); } },
        ...(list.some((i) => i.fix) ? [{ label: 'Alle korrigieren', action: () => fixAll(list) }] : []),
        { label: 'Trotzdem behalten', primary: true, action: () => { list.forEach((it) => { const o = byId(it.obj); if (o) (o._ack = o._ack || new Set()).add(it.code); }); } }]
      : [{ label: 'OK', primary: true }];
    modal(popup ? 'Stickprüfung – das stickt die Maschine nicht sauber' : 'Stickprüfung',
      html + (popup ? '<label style="display:block;margin-top:8px;color:#6a7480"><input type="checkbox" id="noPop"> Hinweise nicht mehr automatisch anzeigen (Prüfung bleibt unten in der Statusleiste)</label>' : `<p style="color:#6a7480">Maschine: ${machine().name}. Grenzwerte unter Einstellungen → Maschine &amp; Rahmen.</p>`),
      btns);
    const np = $('#noPop');
    if (np) np.onchange = () => { st.settings.checkPopup = !np.checked; };
    $('#modalBody').querySelectorAll('[data-fix]').forEach((b) => (b.onclick = () => { closeModal(); fixAll([list[+b.dataset.fix]]); }));
    $('#modalBody').querySelectorAll('[data-show]').forEach((b) => (b.onclick = () => {
      const it = list[+b.dataset.show];
      closeModal();
      if (byId(it.obj)) sel = new Set([it.obj]);
      if (it.at) { const r = cv.getBoundingClientRect(); view.scale = Math.max(view.scale, 8); view.ox = r.width / 2 - it.at.x * view.scale; view.oy = r.height / 2 - it.at.y * view.scale; }
      flash = it.at;
      renderList(); renderProps(); draw();
    }));
  }
  let flash = null;

  function fixAll(list) {
    pushUndo();
    for (const it of list) { const o = byId(it.obj); if (o && it.fix) { it.fix.apply(o); invalidate(o); } }
    changed();
  }

  /* ======================= Zeichnen ======================= */
  function resize() {
    const r = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(r.width * dpr);
    cv.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function lighten(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * f));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }
  function darken(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * (1 - f)));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  function hoopPath(h, inset = 0) {
    const c = toScr({ x: 0, y: 0 });
    const a = Math.max(0, (h.w / 2 - inset)) * view.scale, b = Math.max(0, (h.h / 2 - inset)) * view.scale;
    ctx.beginPath();
    if (h.shape === 'rect') {
      const r = Math.min(a, b, Math.max(0, inset < 0 ? -inset * view.scale * 0.8 : 3 * view.scale));
      if (ctx.roundRect) ctx.roundRect(c.x - a, c.y - b, 2 * a, 2 * b, r); else ctx.rect(c.x - a, c.y - b, 2 * a, 2 * b);
    } else ctx.ellipse(c.x, c.y, a, b, 0, 0, Math.PI * 2);
  }

  function drawHoop() {
    const h = hoop();
    const r = cv.getBoundingClientRect();
    ctx.save();
    if (h.shape === 'none') {
      ctx.fillStyle = st.fabric; ctx.fillRect(0, 0, r.width, r.height);
    } else {
      // Rahmenkörper (ca. 12 mm breit)
      hoopPath(h, -12);
      ctx.fillStyle = '#9aa2ac'; ctx.fill();
      hoopPath(h, -12); ctx.lineWidth = 1; ctx.strokeStyle = '#6b737d'; ctx.stroke();
      // Stoff im Stickfeld
      hoopPath(h, 0);
      ctx.fillStyle = st.fabric; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#4a525c'; ctx.stroke();
    }
    ctx.save();
    if (h.shape !== 'none') { hoopPath(h, 0); ctx.clip(); }
    if (view.grid) {
      const a = toMM(0, 0), b = toMM(r.width, r.height);
      const stp = view.scale > 4 ? 5 : 10;
      ctx.lineWidth = 1;
      for (let x = Math.floor(a.x / stp) * stp; x <= b.x; x += stp) {
        ctx.strokeStyle = x === 0 ? 'rgba(0,0,0,.25)' : x % 50 === 0 ? 'rgba(0,0,0,.13)' : 'rgba(0,0,0,.06)';
        const sx = toScr({ x, y: 0 }).x;
        ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, r.height); ctx.stroke();
      }
      for (let y = Math.floor(a.y / stp) * stp; y <= b.y; y += stp) {
        ctx.strokeStyle = y === 0 ? 'rgba(0,0,0,.25)' : y % 50 === 0 ? 'rgba(0,0,0,.13)' : 'rgba(0,0,0,.06)';
        const sy = toScr({ x: 0, y }).y;
        ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(r.width, sy); ctx.stroke();
      }
    }
    ctx.restore();
    // Hilfslinien
    for (const gd of st.guides || []) {
      ctx.strokeStyle = 'rgba(0,150,200,.8)'; ctx.lineWidth = 1; ctx.setLineDash([8, 4]);
      ctx.beginPath();
      if (gd.axis === 'v') { const sx = toScr({ x: gd.pos, y: 0 }).x; ctx.moveTo(sx, 0); ctx.lineTo(sx, r.height); }
      else { const sy = toScr({ x: 0, y: gd.pos }).y; ctx.moveTo(0, sy); ctx.lineTo(r.width, sy); }
      ctx.stroke(); ctx.setLineDash([]);
    }
    if (h.shape !== 'none') {
      // Sicherheitsabstand
      if (h.margin) { hoopPath(h, h.margin); ctx.setLineDash([6, 4]); ctx.strokeStyle = 'rgba(200,60,60,.55)'; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]); }
      // Mittelkreuz (Rahmenmitte = Startpunkt der Maschine)
      const c = toScr({ x: 0, y: 0 });
      ctx.strokeStyle = 'rgba(31,111,235,.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(c.x - 10, c.y); ctx.lineTo(c.x + 10, c.y); ctx.moveTo(c.x, c.y - 10); ctx.lineTo(c.x, c.y + 10); ctx.stroke();
      // Beschriftung
      const top = toScr({ x: 0, y: -h.h / 2 - 12 });
      ctx.fillStyle = '#2b323a'; ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(`${h.name} – Stickfeld ${h.shape === 'round' ? 'Ø ' + h.w : h.w + ' × ' + h.h} mm`, top.x, top.y - 4);
    }
    ctx.restore();
  }


  function drawStitchList(list, colorFn, alpha = 1, limit = Infinity) {
    const lw = view.trueView ? Math.max(1, 0.45 * view.scale) : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    let prev = null, col = null, path = [];
    const flush = () => {
      if (path.length < 2) { path = []; return; }
      const hex = col;
      const stroke = (style, w) => {
        ctx.strokeStyle = style; ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
        ctx.stroke();
      };
      if (view.trueView) {
        stroke(darken(hex, 0.25), lw);
        stroke(lighten(hex, 0.35), Math.max(0.6, lw * 0.35));
      } else stroke(hex, lw);
      path = [];
    };
    const jumps = [];
    const n = Math.min(limit, list.length);
    for (let i = 0; i < n; i++) {
      const c = list[i];
      const hex = colorFn(c);
      const s = toScr(c);
      if (c.cmd === 'stitch' || (c.cmd === undefined && !c.j)) {
        if (hex !== col) { flush(); col = hex; if (prev) path.push(prev); }
        if (!path.length && prev) path.push(prev);
        path.push(s);
      } else if (c.cmd === 'jump' || c.j) {
        flush();
        if (prev) jumps.push([prev, s, !!c.float]);
      } else { flush(); }
      if (c.cmd !== 'trim' && c.cmd !== 'color') prev = s;
    }
    flush();
    if (view.jumps) {
      // versteckte Laufwege hervorheben
      ctx.strokeStyle = 'rgba(230,120,0,.9)'; ctx.lineWidth = 2; ctx.setLineDash([2, 2]);
      ctx.beginPath();
      let pv = null;
      for (let i = 0; i < n; i++) { const c = list[i]; const q = toScr(c); if (c.travel && pv) { ctx.moveTo(pv.x, pv.y); ctx.lineTo(q.x, q.y); } if (c.cmd !== 'trim' && c.cmd !== 'color') pv = q; }
      ctx.stroke(); ctx.setLineDash([]);
    }
    if (view.jumps && jumps.length) {
      // rot gestrichelt: Sprung nach Fadenschnitt · violett: Sprung ohne Schnitt (Faden bleibt liegen)
      for (const fl of [false, true]) {
        ctx.setLineDash(fl ? [] : [4, 4]);
        ctx.strokeStyle = fl ? 'rgba(140,40,200,.85)' : 'rgba(200,0,0,.6)'; ctx.lineWidth = fl ? 1.5 : 1;
        ctx.beginPath();
        for (const [a, b, f] of jumps) if (f === fl) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
        ctx.stroke();
      }
      ctx.setLineDash([]);
      // Schnittstellen markieren
      ctx.fillStyle = '#c62828'; ctx.font = '13px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < n; i++) if (list[i].cmd === 'trim') { const q = toScr(list[i]); ctx.fillText('✂', q.x + 8, q.y - 8); }
    }
    if (view.points && view.scale > 3) {
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      for (let i = 0; i < n; i++) { const s = toScr(list[i]); ctx.fillRect(s.x - 1, s.y - 1, 2, 2); }
    }
    ctx.restore();
    return prev;
  }

  function draw() {
    const r = cv.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);
    drawHoop();
    if (st.bg && st.bg.visible && st.bg._img) {
      ctx.save();
      ctx.globalAlpha = st.bg.opacity;
      const a = toScr({ x: st.bg.x, y: st.bg.y });
      ctx.drawImage(st.bg._img, a.x, a.y, st.bg.w * view.scale, st.bg.h * view.scale);
      ctx.restore();
    }
    // Design
    const objMap = new Map(st.objects.map((o) => [o.id, o]));
    let curCol = null;
    const first = cmds.find((c) => c.obj && objMap.get(c.obj));
    if (first) curCol = colOf(objMap.get(first.obj).color);
    const colorFn = (c) => { if (c.cmd === 'color') curCol = colOf(c.color); return curCol; };
    const end = drawStitchList(cmds, colorFn, 1, playN);
    if (playN < cmds.length && end) {
      ctx.strokeStyle = '#d00'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(end.x, end.y, 7, 0, 7); ctx.moveTo(end.x - 11, end.y); ctx.lineTo(end.x + 11, end.y); ctx.moveTo(end.x, end.y - 11); ctx.lineTo(end.x, end.y + 11); ctx.stroke();
    }
    // Auswahl
    for (const o of selected()) {
      if (!o._bb) continue;
      const a = toScr({ x: o._bb.x0, y: o._bb.y0 }), b = toScr({ x: o._bb.x1, y: o._bb.y1 });
      ctx.save();
      ctx.setLineDash([5, 4]); ctx.strokeStyle = '#1f6feb'; ctx.lineWidth = 1;
      ctx.strokeRect(a.x - 4, a.y - 4, b.x - a.x + 8, b.y - a.y + 8);
      ctx.restore();
    }
    if (tool === 'reshape') drawNodes();
    // Problemstellen markieren (ausgewählte Objekte und zuletzt angezeigte Stelle)
    ctx.save();
    ctx.strokeStyle = '#d32f2f'; ctx.lineWidth = 2; ctx.setLineDash([3, 2]);
    for (const it of issues) {
      if (!it.at || !(sel.has(it.obj) || it.at === flash)) continue;
      const q = toScr(it.at);
      ctx.beginPath(); ctx.arc(q.x, q.y, 14, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    if (draft) drawDraft();
    if (tool === 'knife' && knifeStart && mouse.mm) {
      const a = toScr(knifeStart), b = toScr(mouse.mm);
      ctx.save(); ctx.strokeStyle = '#d32f2f'; ctx.lineWidth = 2; ctx.setLineDash([6, 3]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.restore();
    }
    if (drag && drag.kind === 'band') {
      ctx.save(); ctx.setLineDash([4, 3]); ctx.strokeStyle = '#1f6feb';
      ctx.strokeRect(drag.sx, drag.sy, drag.cx - drag.sx, drag.cy - drag.sy); ctx.restore();
    }
  }

  function controlArrays(o) {
    if (o.type === 'manual') return [o.stitches];
    const arr = [o.points];
    if (o.side2) arr.push(o.side2);
    if (o.holes) arr.push(...o.holes);
    return arr;
  }
  function isClosedArr(o, k) { return o.type === 'fill' || (o.type === 'run' && o.params.closed && k === 0); }

  // Säule A: zwei Kanten (blau / orange) und dünne Linien je Punktpaar (= Stichrichtung)
  const SIDE_COL = ['#1f6feb', '#e07b00'];
  function drawColAEdges(pts) {
    for (const side of [0, 1]) {
      const e = pts.filter((_, i) => i % 2 === side);
      if (e.length < 2) continue;
      const path = G.buildPath(e, false).pts;
      ctx.strokeStyle = SIDE_COL[side]; ctx.lineWidth = 1.5;
      ctx.beginPath();
      path.forEach((p, i) => { const q = toScr(p); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); });
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(60,60,60,.45)'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
    for (let i = 0; i + 1 < pts.length; i += 2) {
      const a = toScr(pts[i]), b = toScr(pts[i + 1]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  function drawCtrlPath(o, pts, closed, color) {
    if (!pts.length) return;
    if (o.type === 'colA') { drawColAEdges(pts); return; }
    const path = o.type === 'manual' ? pts : G.buildPath(pts, closed).pts;
    ctx.strokeStyle = color; ctx.lineWidth = 1;
    ctx.beginPath();
    path.forEach((p, i) => { const s = toScr(p); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); });
    if (closed) ctx.closePath();
    ctx.stroke();
  }

  function drawNode(p, active, kind) {
    const s = toScr(p);
    ctx.fillStyle = active ? '#1f6feb' : '#fff';
    ctx.strokeStyle = kind === 'jump' ? '#d00' : kind === 'L' ? SIDE_COL[0] : kind === 'R' ? SIDE_COL[1] : '#1f6feb';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (p.c) ctx.arc(s.x, s.y, 4.5, 0, Math.PI * 2);
    else ctx.rect(s.x - 4, s.y - 4, 8, 8);
    ctx.fill(); ctx.stroke();
  }

  function drawNodes() {
    const objs = selected();
    if (objs.length !== 1) return;
    const o = objs[0];
    ctx.save();
    controlArrays(o).forEach((arr, k) => {
      drawCtrlPath(o, arr, isClosedArr(o, k), 'rgba(31,111,235,.7)');
      arr.forEach((p, i) => {
        if (o.type === 'manual' && view.scale < 3 && arr.length > 400) return;
        drawNode(o.type === 'manual' ? { x: p.x, y: p.y } : p, selNodes.some((n) => n.arr === arr && n.i === i), p.j ? 'jump' : o.type === 'colA' ? (i % 2 ? 'R' : 'L') : '');
      });
    });
    if (o.type === 'fill') {
      const h = angleHandle(o);
      const a = toScr(h.c), b = toScr(h.p);
      ctx.strokeStyle = '#e07b00'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.fillStyle = '#e07b00'; ctx.beginPath(); ctx.arc(b.x, b.y, 6, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  function angleHandle(o) {
    const bb = G.bbox(o.points);
    const c = { x: (bb.x0 + bb.x1) / 2, y: (bb.y0 + bb.y1) / 2 };
    const len = Math.max(8, Math.min(bb.x1 - bb.x0, bb.y1 - bb.y0) * 0.4, 30 / view.scale);
    const a = (o.params.angle * Math.PI) / 180;
    return { c, p: { x: c.x + Math.cos(a) * len, y: c.y + Math.sin(a) * len } };
  }

  function draftObj() {
    if (!draft) return null;
    const m = mouse.mm;
    const withMouse = (arr) => (m && !draft.noRubber ? arr.concat([{ x: m.x, y: m.y, c: draft.nextCurve }]) : arr);
    const t = draft.tool;
    if (t === 'colB') {
      if (draft.phase === 0) return makeTemp('colB', { points: withMouse(draft.pts), side2: [] });
      return makeTemp('colB', { points: draft.side1, side2: withMouse(draft.pts) });
    }
    if (t === 'fill') {
      if (draft.phase === 0) return makeTemp('fill', { points: withMouse(draft.pts), holes: [] });
      if (draft.phase === 1) return makeTemp('fill', { points: draft.outline, holes: draft.holes.concat(draft.pts.length ? [withMouse(draft.pts)] : []) });
      return makeTemp('fill', { points: draft.outline, holes: draft.holes });
    }
    if (t === 'manual') return makeTemp('manual', { stitches: withMouse(draft.pts).map((p) => ({ x: p.x, y: p.y, j: p.j || 0 })) });
    if (t === 'rect' || t === 'ellipse') return draft.shape ? makeTemp('fill', { points: draft.shape }) : null;
    return makeTemp(t, { points: withMouse(draft.pts) });
  }
  function makeTemp(type, data) { const o = makeObj(type, data); nextId--; return o; }

  function drawDraft() {
    const o = draftObj();
    if (!o) return;
    if (draft.tool === 'fill' && draft.phase === 2 && draft.angleStart && mouse.mm) {
      o.params.angle = (Math.atan2(mouse.mm.y - draft.angleStart.y, mouse.mm.x - draft.angleStart.x) * 180) / Math.PI;
    }
    let pts = [];
    try { pts = S.generate(o); } catch (e) { pts = []; }
    drawStitchList(pts, () => colOf(st.curColor), 0.8);
    ctx.save();
    controlArrays(o).forEach((arr, k) => {
      drawCtrlPath(o, arr, isClosedArr(o, k) && draft.phase > 0, 'rgba(31,111,235,.8)');
      arr.forEach((p, i) => drawNode(p, false, p.j ? 'jump' : o.type === 'colA' ? (i % 2 ? 'R' : 'L') : ''));
    });
    if (draft.angleStart && mouse.mm) {
      const a = toScr(draft.angleStart), b = toScr(mouse.mm);
      ctx.strokeStyle = '#e07b00'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.restore();
  }

  /* ======================= UI-Panels ======================= */
  function renderFabric() {
    const sel = $('#material');
    if (!sel.options.length) {
      HW.fabric.FABRICS.forEach((f) => { const o = document.createElement('option'); o.value = f.id; o.textContent = f.name; sel.appendChild(o); });
      sel.onchange = () => {
        st.material = sel.value;
        st.objects.forEach(invalidate);
        changed();
      };
    }
    sel.value = st.material;
    const r = HW.fabric.recommend(st.material, st.objects, D.stats(cmds));
    const el = $('#fabricInfo');
    el.innerHTML = `<div class="fabrec"><b>Vlies:</b> ${r.vlies}<br><b>Topper:</b> ${r.topper}<br><b>Nadel:</b> ${r.needle} · <b>max.</b> ${r.spm} Stiche/min</div>` +
      (r.warn.length ? `<div class="fabwarn">⚠ ${r.warn.join('<br>⚠ ')}</div>` : '') +
      '<div class="row"><button id="fabDetails">Details &amp; Tipps…</button>' +
      (['frottee', 'sweat', 'strick', 'polo'].includes(st.material) && !st.objects.some((o) => o.knockdown) && st.objects.length ? '<button id="fabKnock" title="Flor/Schlaufen flachdrücken, damit feine Details nicht versinken">+ Knockdown-Stich</button>' : '') + '</div>';
    $('#fabDetails').onclick = () => fabricDialog();
    if ($('#fabKnock')) $('#fabKnock').onclick = () => knockdownDialog();
  }

  function fabricDialog() {
    const r = HW.fabric.recommend(st.material, st.objects, D.stats(cmds));
    const f = r.fabric;
    modal('Stoff: ' + f.name,
      `<p><b>Stickvlies:</b> ${r.vlies}${r.why.length ? `<br><small>Mehr Lagen wegen: ${r.why.join(', ')}</small>` : ''}</p>` +
      `<p><b>Topper:</b> ${r.topper}<br><b>Nadel:</b> ${r.needle}<br><b>Geschwindigkeit:</b> höchstens ${r.spm} Stiche/min<br><b>Dichte des Motivs:</b> ${r.density} Stiche/cm²</p>` +
      `<p><b>Automatische Anpassung für diesen Stoff:</b><br>Satin-Abstand × ${f.density} (zusätzlich nach Säulenbreite: schmal lockerer, breit dichter) · Zugausgleich ${f.pull} mm + ${Math.round(f.pullPct * 100)} % der Breite · Satin-Split ab ${f.satinMax} mm · Unterlage ${({ light: 'leicht', normal: 'normal', heavy: 'kräftig' })[f.ul]}<br>Tatami: Abstand ${f.fillSp} mm, Stichlänge ${f.len} mm, Zugausgleich ${f.fillPull} mm, Unterlage ${f.fillUl.replace('edge', 'Kante').replace('tatami', 'Tatami')}</p>` +
      `<p><b>Tipps:</b><br>• ${r.tips.join('<br>• ')}</p>` +
      (r.warn.length ? `<p style="color:#c62828"><b>Hinweise zum Motiv:</b><br>⚠ ${r.warn.join('<br>⚠ ')}</p>` : '') +
      '<p style="color:#6a7480">Die Werte sind bewährte Richtwerte. Vor großen Aufträgen immer einen Probestick auf dem Originalstoff machen. Jeder Wert lässt sich pro Objekt von Hand überschreiben.</p>',
      [{ label: 'Geschwindigkeit übernehmen', action: () => { st.settings.spm = f.spm; renderStats(); } }, { label: 'OK', primary: true }]);
  }

  function jumpLen() {
    let J = 0, last = null;
    for (const q of cmds) { if (q.cmd === 'jump' && last) J += Math.hypot(q.x - last.x, q.y - last.y); if (q.cmd !== 'trim' && q.cmd !== 'color') last = q; }
    return J;
  }

  function renderStats() {
    const s = D.stats(cmds);
    const mins = s.stitches / st.settings.spm + s.colors * 0.15 + s.trims * 0.05;
    const h = hoop();
    const hc = s.stitches ? HW.hoops.check(h, cmds.filter((c) => c.cmd === 'stitch')) : { ok: true };
    const out = !hc.ok;
    $('#stats').innerHTML = `Stiche: <b>${s.stitches.toLocaleString('de-DE')}</b> · Farben: ${s.colors} · Schnitte: ${s.trims}${s.travels ? ` · versteckte Wege: ${s.travels}` : ''} · Größe: ${fmt(s.w)} × ${fmt(s.h)} mm · ca. ${fmt(mins, 0)} min` +
      (s.floats ? ` · Sprünge ohne Schnitt: ${s.floats}` : '') +
      (out ? ` · <span class="warn" id="hoopWarn" title="Klicken für Rahmen-Optionen" style="cursor:pointer">⚠ ${hc.outField ? 'ragt über das Stickfeld' : 'im Sicherheitsabstand'}</span>` : '');
    const hw = $('#hoopWarn');
    if (hw) hw.onclick = () => hoopDialog();
  }

  function renderPalette() {
    const el = $('#palette');
    el.innerHTML = '';
    st.palette.forEach((c, i) => {
      const d = document.createElement('div');
      d.className = 'sw' + (i === st.curColor ? ' active' : '');
      d.style.background = c.hex;
      d.title = `${i + 1}: ${c.name} – Nadel ${c.needle}`;
      if (c.code) d.dataset.code = c.code;
      d.textContent = c.needle;
      d.onclick = () => {
        st.curColor = i;
        if (sel.size) { pushUndo(); selected().forEach((o) => (o.color = i)); changed(); }
        renderPalette();
      };
      d.ondblclick = () => editColor(i);
      el.appendChild(d);
    });
  }

  function renderList() {
    const el = $('#objlist');
    el.innerHTML = '';
    st.objects.forEach((o, i) => {
      const d = document.createElement('div');
      d.className = 'obj' + (sel.has(o.id) ? ' sel' : '');
      d.innerHTML = `<span class="dot" style="background:${colOf(o.color)}"></span><span class="n">${i + 1}. ${objName(o)}</span><span class="c">${(o._st || []).length}</span><button class="eye" title="Ein-/Ausblenden">${o.hidden ? '◌' : '👁'}</button>`;
      d.onclick = (e) => {
        if (e.target.classList.contains('eye')) { o.hidden = !o.hidden; changed(); return; }
        if (e.shiftKey || e.ctrlKey) sel.has(o.id) ? sel.delete(o.id) : sel.add(o.id);
        else sel = new Set([o.id]);
        selNodes = [];
        renderList(); renderProps(); draw();
      };
      el.appendChild(d);
    });
  }

  const PARAM_DEFS = {
    run: [
      ['style', 'Stichart', 'select', [['single', 'Laufstich'], ['triple', 'Dreifachstich'], ['bean', 'Bohnenstich']]],
      ['len', 'Stichlänge (mm)', 'num', 0.5, 12, 0.1],
      ['closed', 'Geschlossen', 'bool'],
    ],
    satin: [
      ['style', 'Stichart', 'select', [['satin', 'Satin'], ['e', 'E-Stich (Applikation)']]],
      ['spacing', 'Dichte / Abstand (mm)', 'num', 0.2, 6, 0.02],
      ['pull', 'Zugkompensation (mm)', 'num', 0, 1.5, 0.05],
      ['underlay', 'Unterlage', 'select', [['none', 'keine'], ['center', 'Mittellauf'], ['edge', 'Kantenlauf'], ['zigzag', 'Zickzack'], ['edge+zigzag', 'Kante + Zickzack'], ['center+zigzag', 'Mitte + Zickzack']]],
      ['split', 'Auto-Split ab (mm, 0=aus)', 'num', 0, 12, 0.5],
      ['shortSt', 'Kurzstiche in Bögen', 'bool'],
      ['puff', '3D-Puff (Schaum)', 'bool'],
    ],
    fill: [
      ['fillType', 'Füllart', 'select', [['tatami', 'Tatami'], ['satin', 'Satin (fester Winkel)'], ['contour', 'Kontur (parallel zum Rand)'], ['spiral', 'Spirale'], ['wave', 'Welle'], ['pattern', 'Muster (Tatami)'], ['gradient', 'Verlauf (dicht → offen)'], ['cross', 'Kreuzstich'], ['knock', 'Knockdown (Gitter)']]],
      ['pattern', 'Muster', 'select', [['diamond', 'Rauten'], ['diagonal', 'Diagonal'], ['brick', 'Ziegel'], ['wave', 'Wellen']]],
      ['waveAmp', 'Wellenhöhe (mm)', 'num', 0.3, 10, 0.1],
      ['waveLen', 'Wellenlänge (mm)', 'num', 3, 60, 0.5],
      ['gradEnd', 'Verlauf bis Abstand (mm)', 'num', 0.4, 6, 0.1],
      ['crossSize', 'Kreuzgröße (mm)', 'num', 1.5, 8, 0.1],
      ['crossDouble', 'Kreuze doppelt', 'bool'],
      ['spacing', 'Dichte / Abstand (mm)', 'num', 0.2, 3, 0.02],
      ['len', 'Stichlänge (mm)', 'num', 1, 7, 0.1],
      ['angle', 'Stichwinkel (°)', 'num', -360, 360, 1],
      ['pull', 'Zugkompensation (mm)', 'num', 0, 1.5, 0.05],
      ['underlay', 'Unterlage', 'select', [['none', 'keine'], ['edge', 'Kantenlauf'], ['tatami', 'Tatami'], ['edge+tatami', 'Kante + Tatami']]],
      ['split', 'Satin-Split ab (mm)', 'num', 0, 12, 0.5],
      ['border', 'Kontur', 'select', [['none', 'keine'], ['run', 'Laufstich'], ['triple', 'Dreifachstich'], ['satin', 'Satin']]],
      ['borderWidth', 'Satin-Konturbreite (mm)', 'num', 0.8, 10, 0.1],
    ],
  };
  function defsFor(type) {
    if (type === 'run' || type === 'triple') return PARAM_DEFS.run;
    if (type === 'colC') return [['width', 'Breite (mm)', 'num', 0.8, 15, 0.1], ...PARAM_DEFS.satin];
    if (type === 'colA' || type === 'colB') return PARAM_DEFS.satin;
    if (type === 'fill' || type === 'rect' || type === 'ellipse' || type === 'text') return PARAM_DEFS.fill;
    return [];
  }

  function connectField(el, objs) {
    if (!objs.length) return;
    const f = document.createElement('div');
    f.className = 'field';
    f.dataset.help = 'p:connect';
    const lb = document.createElement('label'); lb.textContent = 'Verbindung davor';
    lb.title = 'Wie die Maschine vom vorigen Objekt zu diesem kommt';
    const sl = document.createElement('select');
    [['auto', 'Automatisch'], ['trim', 'Immer schneiden'], ['jump', 'Springen ohne Schnitt'], ['stitch', 'Direkt als Stich']].forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; sl.appendChild(o); });
    const vals = new Set(objs.map((o) => o.connect || 'auto'));
    sl.value = vals.size === 1 ? [...vals][0] : 'auto';
    sl.onchange = () => { pushUndo(); objs.forEach((o) => { if (sl.value === 'auto') delete o.connect; else o.connect = sl.value; }); changed(); };
    f.append(lb, sl);
    el.appendChild(f);
    const f2 = document.createElement('div');
    f2.className = 'field';
    f2.dataset.help = 'p:stopBefore';
    const l2 = document.createElement('label'); l2.textContent = 'Maschine stoppt davor';
    l2.title = 'Stopp (z. B. Applikationsstoff oder Puff-Schaum auflegen). In der DST ein Farbwechsel auf dieselbe Nadel.';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = objs.every((o) => o.stopBefore);
    cb.onchange = () => { pushUndo(); objs.forEach((o) => { if (cb.checked) o.stopBefore = true; else delete o.stopBefore; }); changed(); };
    f2.append(l2, cb);
    el.appendChild(f2);
  }

  function renderProps() {
    const el = $('#props');
    const objs = selected();
    let target, type, title;
    const g0 = objs.length && objs[0].grp && objs.every((o) => o.grp === objs[0].grp) && objs[0].textSpec;
    if (g0) {
      el.innerHTML = `<p>Text „${String(objs[0].textSpec.text).replace(/</g, '&lt;')}“ (${String(objs[0].textSpec.font).startsWith('ink:') ? ((HW.INKFONT_INDEX || []).find((f) => 'ink:' + f.id === objs[0].textSpec.font) || {}).name : objs[0].textSpec.font}, ${objs.length} Objekte)</p>`;
      const btn = document.createElement('button');
      btn.textContent = 'Text bearbeiten…'; btn.dataset.help = 'p:textEdit';
      btn.onclick = () => textDialog(null, objs[0].grp);
      const brk = document.createElement('button');
      brk.textContent = 'Gruppierung lösen'; brk.dataset.help = 'p:textBreak';
      brk.title = 'Buchstaben einzeln bearbeiten (Text ist danach nicht mehr änderbar)';
      brk.onclick = () => { pushUndo(); objs.forEach((o) => { delete o.grp; delete o.textSpec; }); changed(); };
      const gb = document.createElement('button');
      gb.textContent = 'Buchstaben anpassen…'; gb.dataset.help = 'p:glyphs';
      gb.title = 'Einzelne Buchstaben verschieben, drehen, vergrößern; Abstände (Kerning)';
      gb.onclick = () => glyphDialog(objs[0].grp);
      const row = document.createElement('div'); row.className = 'row'; row.append(btn, gb, brk);
      el.appendChild(row);
      $('#propTitle').textContent = '– Schrift';
      if (!objs.every((o) => o.type === objs[0].type)) return;
      const h = document.createElement('p'); h.style.margin = '8px 0 2px'; h.textContent = 'Sticheigenschaften aller Buchstaben:'; el.appendChild(h);
    }
    if (objs.length) {
      type = objs[0].type;
      if (!objs.every((o) => o.type === type)) { el.innerHTML = `<p>${objs.length} Objekte ausgewählt (verschiedene Arten). Farbe per Klick in der Palette zuweisen.</p>`; $('#propTitle').textContent = ''; connectField(el, objs); return; }
      target = objs[0].params; title = objs.length > 1 ? `${objs.length} × ${objName(objs[0])}` : objName(objs[0]);
    } else {
      const dk = ['rect', 'ellipse', 'text'].includes(tool) ? 'fill' : tool;
      if (!st.defaults[dk]) {
        el.innerHTML = '<p style="color:#6a7480">Objekt auswählen oder Werkzeug wählen, um die Stich-Eigenschaften einzustellen.</p>';
        $('#propTitle').textContent = '';
        return;
      }
      type = dk; target = st.defaults[dk]; title = 'Vorgabe für neue Objekte';
    }
    $('#propTitle').textContent = g0 ? '– Schrift' : '– ' + title;
    const defs = defsFor(type);
    if (!g0) el.innerHTML = '';
    if (objs.length) connectField(el, objs);
    if (objs.length && objs.every((o) => o.type === 'colC')) {
      const r = document.createElement('div'); r.className = 'row';
      const bt = document.createElement('button'); bt.textContent = 'In Satin A umwandeln (Breite frei formen)'; bt.dataset.help = 'cmd:toColA';
      bt.onclick = () => toColA();
      r.appendChild(bt); el.appendChild(r);
    }
    if (type === 'manual') {
      el.insertAdjacentHTML('beforeend', `<p>${objs[0].stitches.length} Einzelstiche. Mit <b>Umformen</b> jeden Stich verschieben (Entf = löschen, Doppelklick = einfügen).</p>`);
      return;
    }
    // Stoff-Automatik: verwaltete Werte zeigen den wirksamen Wert und sind mit „auto“ markiert
    const fabKind = ['colA', 'colB', 'colC'].includes(type) ? 'satin' : type === 'fill' ? 'fill' : null;
    const managed = fabKind ? HW.fabric.MANAGED[fabKind] : [];
    const o0 = objs[0];
    const autoOn = !!(o0 && fabKind && o0.autoFab !== false);
    if (o0 && fabKind) {
      const f = document.createElement('div');
      f.className = 'field';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = autoOn;
      cb.onchange = () => { pushUndo(); objs.forEach((o) => { o.autoFab = cb.checked; invalidate(o); }); changed(); };
      f.dataset.help = 'p:autoFab';
      const lb = document.createElement('label'); lb.textContent = 'An Stoff anpassen (automatisch)';
      lb.title = 'Dichte, Zugausgleich, Unterlage und Stichlänge werden aus Stoff und Säulenbreite berechnet.';
      f.append(lb, cb);
      el.appendChild(f);
      if (autoOn && objs.some((o) => o.manual && Object.keys(o.manual).length)) {
        const r = document.createElement('div'); r.className = 'row';
        const bt = document.createElement('button'); bt.textContent = 'Von Hand geänderte Werte wieder automatisch'; bt.dataset.help = 'p:resetManual';
        bt.onclick = () => { pushUndo(); objs.forEach((o) => { delete o.manual; invalidate(o); }); changed(); };
        r.appendChild(bt); el.appendChild(r);
      }
    }
    const dflt = S.DEFAULTS[fabKind || (type === 'triple' ? 'run' : type)] || {};
    for (const [key, label, kind, a, b, step] of defs) {
      if (target[key] === undefined && dflt[key] !== undefined) target[key] = dflt[key];
      if (type === 'fill' && key === 'len' && ['satin', 'cross'].includes(target.fillType)) continue;
      if (type === 'fill' && key === 'pattern' && target.fillType !== 'pattern') continue;
      if (type === 'fill' && (key === 'waveAmp' || key === 'waveLen') && target.fillType !== 'wave') continue;
      if (type === 'fill' && key === 'gradEnd' && target.fillType !== 'gradient') continue;
      if (type === 'fill' && (key === 'crossSize' || key === 'crossDouble') && target.fillType !== 'cross') continue;
      if (type === 'fill' && (key === 'angle' || key === 'spacing') && target.fillType === 'cross') continue;
      if (type === 'fill' && key === 'angle' && (target.fillType === 'contour' || target.fillType === 'spiral')) continue;
      if (type === 'fill' && key === 'split' && target.fillType !== 'satin') continue;
      if (type === 'fill' && key === 'borderWidth' && target.border !== 'satin') continue;
      const f = document.createElement('div');
      f.className = 'field';
      f.dataset.help = `p:${fabKind || 'run'}.${key}`;
      let inp;
      if (kind === 'select') {
        inp = document.createElement('select');
        a.forEach(([v, t]) => { const op = document.createElement('option'); op.value = v; op.textContent = t; inp.appendChild(op); });
        inp.value = (isAuto(key) ? o0._eff.params[key] : target[key]) ?? a[0][0];
      } else if (kind === 'bool') {
        inp = document.createElement('input'); inp.type = 'checkbox'; inp.checked = !!target[key];
      } else {
        inp = document.createElement('input'); inp.type = 'number'; inp.min = a; inp.max = b; inp.step = step;
        inp.value = Math.round((isAuto(key) ? o0._eff.params[key] : target[key]) * 1000) / 1000;
      }
      inp.onchange = () => {
        let v = kind === 'bool' ? inp.checked : kind === 'num' ? parseFloat(inp.value) : inp.value;
        if (kind === 'num' && !isFinite(v)) return;
        if (kind === 'num') v = Math.max(a, Math.min(b, v));
        if (objs.length) {
          pushUndo();
          objs.forEach((o) => {
            if (key === 'puff' && v) Object.assign(o.params, { spacing: 0.25, underlay: 'none', shortSt: false, split: 0, pull: 0 }), (o.autoFab = false), (o.stopBefore = true);
            if (key === 'puff' && !v) { delete o.stopBefore; o.autoFab = true; }
            if (key === 'fillType' && v === 'knock') Object.assign(o.params, { spacing: 1.6, len: 4, underlay: 'none', border: 'none' });
            o.params[key] = v;
            if (managed.includes(key)) o.manual = { ...(o.manual || {}), [key]: true };
            invalidate(o);
          });
          changed();
        } else { target[key] = v; renderProps(); }
      };
      const lb = document.createElement('label'); lb.textContent = label;
      if (isAuto(key)) { const t = document.createElement('small'); t.textContent = ' · auto'; t.style.color = '#1f6feb'; lb.appendChild(t); }
      else if (autoOn && managed.includes(key)) { const t = document.createElement('small'); t.textContent = ' · von Hand'; t.style.color = '#b26a00'; lb.appendChild(t); }
      f.append(lb, inp);
      el.appendChild(f);
    }
    function isAuto(key) {
      return autoOn && managed.includes(key) && !(o0.manual && o0.manual[key]) && o0._eff && o0._eff.params && o0._eff.params[key] !== undefined;
    }
  }

  function hintFlash(t) { $('#hint').textContent = t; clearTimeout(hintFlash.t); hintFlash.t = setTimeout(setHint, 2500); }

  function setHint() {
    const H = {
      select: 'Klicken = auswählen, ziehen = verschieben, Rahmen ziehen = mehrere wählen. Mittlere Maustaste/Alt+Ziehen = Ansicht verschieben, Mausrad = Zoom.',
      reshape: 'Punkte ziehen. Leertaste = Ecke ↔ Kurve, Entf = Punkt löschen, Doppelklick auf Linie = Punkt einfügen. Oranger Griff = Stichwinkel.',
      run: 'Linksklick = Eckpunkt, Rechtsklick = Kurvenpunkt. Enter = fertig, Rücktaste = letzten Punkt löschen, Esc = abbrechen.',
      triple: 'Linksklick = Eckpunkt, Rechtsklick = Kurvenpunkt. Enter = fertig.',
      colC: 'Mittellinie digitalisieren: Links = Ecke, Rechts = Kurve. Enter = fertig. Breite rechts bei Eigenschaften.',
      colA: 'Abwechselnd linke und rechte Seite der Säule anklicken (Paare). Links = Ecke, Rechts = Kurve. Enter = fertig.',
      colB: 'Erste Seite digitalisieren → Enter → zweite Seite → Enter. Links = Ecke, Rechts = Kurve.',
      fill: 'Umriss: Links = Ecke, Rechts = Kurve, Enter schließt. Dann Löcher (Enter überspringt), dann Stichwinkel mit 2 Klicks (Enter = Vorgabe).',
      rect: 'Ziehen, um ein Rechteck zu erstellen.',
      ellipse: 'Ziehen, um einen Kreis/eine Ellipse zu erstellen (Shift = Kreis).',
      text: 'Auf die Arbeitsfläche klicken, um Text einzufügen.',
      knife: 'Messer: zwei Punkte klicken – die Linie teilt die ausgewählten Flächen (oder alle Flächen, die sie kreuzt).',
      manual: 'Jeder Linksklick = ein Stich, Rechtsklick = Sprung. Enter = fertig.',
    };
    let h = H[tool] || '';
    if (draft && draft.tool === 'colB' && draft.phase === 1) h = 'Jetzt die ZWEITE Seite digitalisieren, Enter = fertig.';
    if (tool === 'colA') {
      const n = draft ? draft.pts.length : 0;
      h = `Satin A – Punkt ${n + 1}: jetzt auf die ${n % 2 ? 'ORANGE Kante (Seite 2)' : 'BLAUE Kante (Seite 1)'} klicken${n >= 2 ? ` · Paar ${(n >> 1) + 1}` : ''}. ` +
        'Immer abwechselnd Seite 1 / Seite 2, jedes Paar gibt Breite und Stichrichtung vor. Linksklick = Ecke, Rechtsklick = Kurve. ' +
        (n >= 4 ? 'Enter = fertig, ' : '') + 'Rücktaste = letzten Punkt zurück, Esc = abbrechen.';
    }
    if (draft && draft.tool === 'fill' && draft.phase === 1) h = 'Loch digitalisieren (Enter schließt das Loch) – oder sofort Enter: keine (weiteren) Löcher.';
    if (draft && draft.tool === 'fill' && draft.phase === 2) h = 'Stichwinkel: zwei Punkte klicken – oder Enter für Vorgabewinkel.';
    if (curveMode && draft) h += ' [Touch: Kurvenpunkt-Modus aktiv]';
    $('#hint').textContent = h;
  }

  function setTool(t) {
    knifeStart = null;
    if (draft) finishDraft(true);
    tool = t;
    draft = null;
    document.querySelectorAll('#toolbox [data-tool]').forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
    cv.style.cursor = t === 'select' ? 'default' : t === 'reshape' ? 'pointer' : 'crosshair';
    selNodes = [];
    setHint();
    renderProps();
    draw();
  }

  /* ======================= Digitalisieren ======================= */
  function addPoint(p, curve, jump) {
    p = snapPt(p);
    if (!draft) draft = { tool, pts: [], phase: 0, holes: [] };
    if (draft.tool === 'fill' && draft.phase === 2) {
      if (!draft.angleStart) draft.angleStart = p;
      else {
        const ang = (Math.atan2(p.y - draft.angleStart.y, p.x - draft.angleStart.x) * 180) / Math.PI;
        createFill(Math.round(ang));
      }
      draw();
      return;
    }
    const q = { x: p.x, y: p.y, c: !!curve };
    if (jump) q.j = 1;
    draft.pts.push(q);
    setHint();
    draw();
  }

  function createFill(angle) {
    pushUndo();
    const o = makeObj('fill', { points: draft.outline, holes: draft.holes });
    if (angle !== undefined) o.params.angle = angle;
    st.objects.push(o);
    sel = new Set([o.id]);
    draft = null;
    setHint();
    changed();
  }

  function finishDraft(cancelIfIncomplete) {
    if (!draft) return;
    const d = draft, t = d.tool;
    const add = (o) => { pushUndo(); st.objects.push(o); sel = new Set([o.id]); };
    if (t === 'colB' && d.phase === 0) {
      if (d.pts.length >= 2 && !cancelIfIncomplete) { draft = { tool: t, phase: 1, side1: d.pts, pts: [] }; setHint(); draw(); return; }
      draft = null;
    } else if (t === 'colB') {
      if (d.pts.length >= 2) add(makeObj('colB', { points: d.side1, side2: d.pts }));
      draft = null;
    } else if (t === 'fill') {
      if (d.phase === 0) {
        if (d.pts.length >= 3 && !cancelIfIncomplete) { draft = { tool: t, phase: 1, outline: d.pts, holes: [], pts: [] }; setHint(); draw(); return; }
        draft = null;
      } else if (d.phase === 1) {
        if (cancelIfIncomplete) { createFill(); return; }
        if (d.pts.length >= 3) { d.holes.push(d.pts); d.pts = []; draw(); return; }
        d.phase = 2; d.pts = []; setHint(); draw(); return;
      } else { createFill(); return; }
    } else if (t === 'colA') {
      const pts = d.pts.length % 2 ? d.pts.slice(0, -1) : d.pts;
      if (pts.length >= 4) add(makeObj('colA', { points: pts }));
      draft = null;
    } else if (t === 'manual') {
      if (d.pts.length >= 2) add(makeObj('manual', { stitches: d.pts.map((p) => ({ x: p.x, y: p.y, j: p.j || 0 })) }));
      draft = null;
    } else if (['run', 'triple', 'colC'].includes(t)) {
      if (d.pts.length >= 2) add(makeObj(t, { points: d.pts }));
      draft = null;
    } else draft = null;
    setHint();
    changed();
  }

  function shapePoints(a, b, kind, circle) {
    let x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y), x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
    if (circle) { const s = Math.max(x1 - x0, y1 - y0); x1 = x0 + s; y1 = y0 + s; }
    if (kind === 'rect') return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }].map((p) => ({ ...p, c: false }));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2, ry = (y1 - y0) / 2;
    const pts = [];
    for (let i = 0; i < 12; i++) { const t = (i / 12) * Math.PI * 2; pts.push({ x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry, c: true }); }
    return pts;
  }

  /* ======================= Treffer & Umformen ======================= */
  function hitObj(p) {
    const tol = 5 / view.scale;
    for (let k = st.objects.length - 1; k >= 0; k--) {
      const o = st.objects[k];
      if (o.hidden || !o._bb) continue;
      const bb = o._bb;
      if (p.x < bb.x0 - tol || p.x > bb.x1 + tol || p.y < bb.y0 - tol || p.y > bb.y1 + tol) continue;
      if (o.type === 'fill') {
        if (!o._rings) o._rings = S.fillRings(o);
        if (G.pointInRings(p, o._rings)) return o;
      }
      const s = o._st;
      for (let i = 1; i < s.length; i++) if (!s[i].j && G.distToSeg(p, s[i - 1], s[i]).d < tol) return o;
    }
    return null;
  }

  function hitNode(p) {
    const objs = selected();
    if (objs.length !== 1) return null;
    const o = objs[0];
    const tol = 7 / view.scale;
    if (o.type === 'fill') {
      const h = angleHandle(o);
      if (G.dist(h.p, p) < tol) return { angle: true, o };
    }
    let best = null, bd = tol;
    controlArrays(o).forEach((arr) => arr.forEach((q, i) => { const d = G.dist(q, p); if (d < bd) { bd = d; best = { o, arr, i }; } }));
    return best;
  }

  function insertNode(p) {
    const objs = selected();
    if (objs.length !== 1) return;
    const o = objs[0];
    let best = null, bd = 10 / view.scale;
    controlArrays(o).forEach((arr, k) => {
      const closed = isClosedArr(o, k) || o.type === 'fill';
      const n = arr.length;
      for (let i = 0; i < (closed ? n : n - 1); i++) {
        const r = G.distToSeg(p, arr[i], arr[(i + 1) % n]);
        if (r.d < bd) { bd = r.d; best = { arr, i }; }
      }
    });
    if (!best) return;
    pushUndo();
    if (o.type === 'colA') {
      // Paar einfügen: Punkt auf beiden Schienen
      const i = best.i - (best.i % 2);
      const a1 = o.points[i], b1 = o.points[i + 1], a2 = o.points[i + 2], b2 = o.points[i + 3];
      if (a2 && b2) o.points.splice(i + 2, 0, { ...G.lerp(a1, a2, 0.5), c: true }, { ...G.lerp(b1, b2, 0.5), c: true });
    } else if (o.type === 'manual') best.arr.splice(best.i + 1, 0, { x: p.x, y: p.y, j: 0 });
    else best.arr.splice(best.i + 1, 0, { x: p.x, y: p.y, c: true });
    invalidate(o);
    changed();
  }

  // Satinlinie mit fester Breite (C) in Satinsäule A umwandeln: danach jede Kante einzeln formen
  function colCtoA(o) {
    const pts = o.points, n = pts.length, w = (o.params.width || 3) / 2, closed = !!o.params.closed;
    if (n < 2) return false;
    const path = G.buildPath(pts, closed);
    const out = [];
    pts.forEach((p, i) => {
      const k = path.idx ? path.idx[i] : null;
      const pl = path.pts;
      let a, b;
      if (k !== null && k !== undefined) { a = pl[Math.max(0, k - 2)]; b = pl[Math.min(pl.length - 1, k + 2)]; }
      else { a = pts[Math.max(0, i - 1)]; b = pts[Math.min(n - 1, i + 1)]; }
      const L = Math.hypot(b.x - a.x, b.y - a.y) || 1, nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L;
      out.push({ x: p.x - nx * w, y: p.y - ny * w, c: !!p.c }, { x: p.x + nx * w, y: p.y + ny * w, c: !!p.c });
    });
    if (closed) out.push({ ...out[0] }, { ...out[1] });
    o.type = 'colA';
    o.points = out;
    delete o.params.closed;
    invalidate(o);
    return true;
  }
  function toColA() {
    const objs = selected().filter((o) => o.type === 'colC');
    if (!objs.length) return modal('In Satin A umwandeln', '<p>Bitte zuerst eine oder mehrere <b>Satinlinien (Satin C)</b> auswählen.</p>');
    pushUndo();
    objs.forEach(colCtoA);
    setTool('reshape');
    changed();
    hintFlash('Umgewandelt: Jetzt mit Umformen die blauen und orangen Kantenpunkte einzeln ziehen, um die Breite zu verändern. Doppelklick fügt ein Punktpaar ein.');
  }

  /* ---------- Einrasten, Ausrichten, Gruppen, Anordnungen ---------- */
  const guideList = () => (st.guides = st.guides || []);
  // Punkt an Raster oder Hilfslinie einrasten (nur wenn „Einrasten“ an ist)
  function snapPt(p) {
    if (!view.snap) return p;
    const tol = 8 / view.scale;
    const one = (v, axis) => {
      let best = v, bd = tol;
      for (const g of guideList()) if (g.axis === axis && Math.abs(g.pos - v) < bd) { bd = Math.abs(g.pos - v); best = g.pos; }
      if (best === v) { const q = Math.round(v / view.gridStep) * view.gridStep; if (Math.abs(q - v) < Math.max(tol, view.gridStep / 2)) best = q; }
      return best;
    };
    return { ...p, x: one(p.x, 'v'), y: one(p.y, 'h') };
  }
  // Verschiebung so anpassen, dass Kante oder Mitte der Auswahl einrastet
  function snapDelta(bb, dx, dy) {
    if (!view.snap || !bb) return { x: dx, y: dy };
    const tol = 8 / view.scale;
    const axis = (vals, d, ax) => {
      let best = null;
      for (const v of vals) {
        const t = v + d;
        const cands = guideList().filter((g) => g.axis === ax).map((g) => g.pos);
        cands.push(Math.round(t / view.gridStep) * view.gridStep, 0);
        for (const c of cands) { const e = c - t; if (Math.abs(e) < tol && (!best || Math.abs(e) < Math.abs(best))) best = e; }
      }
      return d + (best || 0);
    };
    return { x: axis([bb.x0, (bb.x0 + bb.x1) / 2, bb.x1], dx, 'v'), y: axis([bb.y0, (bb.y0 + bb.y1) / 2, bb.y1], dy, 'h') };
  }
  function bbOfObjs(objs) {
    const pts = [];
    objs.forEach((o) => { ensure(o); if (o._bb) pts.push({ x: o._bb.x0, y: o._bb.y0 }, { x: o._bb.x1, y: o._bb.y1 }); });
    return pts.length ? G.bbox(pts) : null;
  }
  const selBBox = () => bbOfObjs(selected());
  const moveObj = (o, dx, dy) => { forEachPoint(o, (q) => { q.x += dx; q.y += dy; }); invalidate(o); };

  // Kopien mit neuen Nummern; Gruppen bleiben innerhalb der Kopie zusammen
  function copyObjs(objs) {
    const gmap = new Map();
    return objs.map((o) => {
      const c = clone(o);
      c.id = nextId++;
      if (o.grp !== undefined) { if (!gmap.has(o.grp)) gmap.set(o.grp, (typeof o.grp === 'number' ? nextGrp++ : 'g' + nextId + '_' + gmap.size)); c.grp = gmap.get(o.grp); }
      return c;
    });
  }

  // Einheiten der Auswahl (Gruppe = eine Einheit)
  function selUnits() {
    const m = new Map();
    selected().forEach((o) => { const k = o.grp !== undefined ? 'g' + o.grp : 'o' + o.id; if (!m.has(k)) m.set(k, []); m.get(k).push(o); });
    return [...m.values()].map((objs) => ({ objs, bb: bbOfObjs(objs) })).filter((u) => u.bb);
  }

  function align(mode) {
    const units = selUnits();
    if (!units.length) return;
    // eine Einheit: am Rahmen (Mitte) ausrichten, sonst an der gemeinsamen Umrandung
    const B = units.length === 1 ? (() => { const h = hoop(); const a = (h.w || 100) / 2 - (h.margin || 0), b = (h.h || 100) / 2 - (h.margin || 0); return { x0: -a, x1: a, y0: -b, y1: b }; })()
      : units.reduce((a, u) => ({ x0: Math.min(a.x0, u.bb.x0), y0: Math.min(a.y0, u.bb.y0), x1: Math.max(a.x1, u.bb.x1), y1: Math.max(a.y1, u.bb.y1) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
    pushUndo();
    if (mode === 'distH' || mode === 'distV') {
      const hz = mode === 'distH';
      const us = units.slice().sort((a, b) => (hz ? a.bb.x0 - b.bb.x0 : a.bb.y0 - b.bb.y0));
      if (us.length < 3) return;
      const total = us.reduce((a, u) => a + (hz ? u.bb.x1 - u.bb.x0 : u.bb.y1 - u.bb.y0), 0);
      const gap = ((hz ? B.x1 - B.x0 : B.y1 - B.y0) - total) / (us.length - 1);
      let pos = hz ? B.x0 : B.y0;
      for (const u of us) {
        const d = pos - (hz ? u.bb.x0 : u.bb.y0);
        u.objs.forEach((o) => moveObj(o, hz ? d : 0, hz ? 0 : d));
        pos += (hz ? u.bb.x1 - u.bb.x0 : u.bb.y1 - u.bb.y0) + gap;
      }
    } else {
      for (const u of units) {
        const b = u.bb;
        const dx = { left: B.x0 - b.x0, right: B.x1 - b.x1, centerH: (B.x0 + B.x1) / 2 - (b.x0 + b.x1) / 2 }[mode] || 0;
        const dy = { top: B.y0 - b.y0, bottom: B.y1 - b.y1, centerV: (B.y0 + B.y1) / 2 - (b.y0 + b.y1) / 2 }[mode] || 0;
        u.objs.forEach((o) => moveObj(o, dx, dy));
      }
    }
    changed();
  }

  function groupSel(on) {
    const objs = selected();
    if (!objs.length) return;
    pushUndo();
    if (on) { const g = nextGrp++; objs.forEach((o) => { o.grp = g; }); }
    else objs.forEach((o) => { delete o.grp; delete o.textSpec; });
    changed();
  }

  // Objekt drehen/verschieben (Füllwinkel mitdrehen)
  function xform(o, fn, dAngle) {
    forEachPoint(o, (p) => { const q = fn(p); p.x = q.x; p.y = q.y; });
    if (o.type === 'fill' && dAngle) o.params.angle = (o.params.angle || 0) + dAngle;
    invalidate(o);
  }

  function arrayDialog() {
    const objs = selected();
    if (!objs.length) return modal('Anordnen', '<p>Bitte zuerst Objekte auswählen.</p>');
    modal('Kopien anordnen (Kreis / Raster)',
      field('Art', '<select id="arKind"><option value="circle">Kreis</option><option value="grid">Raster (Reihen × Spalten)</option></select>') +
      '<div id="arC">' + field('Anzahl insgesamt', '<input id="arN" type="number" value="6" min="2" max="72">') +
      field('Radius (mm)', '<input id="arR" type="number" value="40" min="0">') +
      field('Mittelpunkt', '<select id="arM"><option value="hoop">Rahmenmitte</option><option value="below">unter der Auswahl (Radius)</option></select>') +
      field('Kopien mitdrehen', '<input type="checkbox" id="arRot" checked>') + '</div>' +
      '<div id="arG" style="display:none">' + field('Spalten', '<input id="arCols" type="number" value="3" min="1" max="30">') + field('Reihen', '<input id="arRows" type="number" value="2" min="1" max="30">') +
      field('Abstand waagrecht (mm)', '<input id="arDx" type="number" value="10">') + field('Abstand senkrecht (mm)', '<input id="arDy" type="number" value="10">') + '</div>',
      [{ label: 'Abbrechen' }, { label: 'Anordnen', primary: true, action: () => {
        const bb = bbOfObjs(objs);
        const c0 = { x: (bb.x0 + bb.x1) / 2, y: (bb.y0 + bb.y1) / 2 };
        pushUndo();
        const made = [];
        if (val('arKind') === 'circle') {
          const n = Math.max(2, Math.min(72, Math.round(num('arN') || 6))), R = Math.max(0, num('arR') || 0), rot = $('#arRot').checked;
          const center = val('arM') === 'hoop' ? { x: 0, y: 0 } : { x: c0.x, y: c0.y + R };
          // Original auf den Kreis setzen (oben), falls Radius angegeben
          if (R > 0) { const tgt = { x: center.x, y: center.y - R }; objs.forEach((o) => moveObj(o, tgt.x - c0.x, tgt.y - c0.y)); }
          const cc = R > 0 ? { x: center.x, y: center.y - R } : c0;
          for (let k = 1; k < n; k++) {
            const a = (2 * Math.PI * k) / n, deg = (360 * k) / n;
            copyObjs(objs).forEach((c) => {
              if (rot) xform(c, (p) => G.rot(p, a, center), deg);
              else { const t = G.rot(cc, a, center); xform(c, (p) => ({ x: p.x + t.x - cc.x, y: p.y + t.y - cc.y })); }
              made.push(c);
            });
          }
        } else {
          const cols = Math.max(1, Math.round(num('arCols') || 1)), rows = Math.max(1, Math.round(num('arRows') || 1));
          const sx = bb.x1 - bb.x0 + (num('arDx') || 0), sy = bb.y1 - bb.y0 + (num('arDy') || 0);
          for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
            if (!i && !j) continue;
            copyObjs(objs).forEach((c) => { xform(c, (p) => ({ x: p.x + i * sx, y: p.y + j * sy })); made.push(c); });
          }
        }
        // Kopien gleicher Farbe direkt hinter das Original (weniger Farbwechsel)
        const last = Math.max(...objs.map((o) => st.objects.indexOf(o)));
        st.objects.splice(last + 1, 0, ...made);
        sel = new Set([...objs, ...made].map((o) => o.id));
        changed();
      } }]);
    $('#arKind').onchange = () => { const c = val('arKind') === 'circle'; $('#arC').style.display = c ? '' : 'none'; $('#arG').style.display = c ? 'none' : ''; };
  }

  function guideDialog() {
    const list = guideList();
    modal('Hilfslinien & Einrasten',
      field('Einrasten an Raster/Hilfslinien', `<input type="checkbox" id="gdSnap" ${view.snap ? 'checked' : ''}>`) +
      field('Rasterweite (mm)', `<input id="gdStep" type="number" value="${view.gridStep}" min="0.5" max="50" step="0.5">`) +
      field('Neue Hilfslinie', '<select id="gdAxis"><option value="v">senkrecht bei X</option><option value="h">waagrecht bei Y</option></select>') +
      field('Position (mm, 0 = Rahmenmitte)', '<input id="gdPos" type="number" value="0" step="0.5">') +
      `<p>${list.length ? 'Vorhandene: ' + list.map((g) => `${g.axis === 'v' ? 'X' : 'Y'} = ${fmt2(g.axis === 'h' ? -g.pos : g.pos)}`).join(', ') : 'Noch keine Hilfslinien.'}</p>`,
      [{ label: 'Alle Hilfslinien löschen', action: () => { st.guides = []; draw(); } }, { label: 'Abbrechen' },
        { label: 'Übernehmen', primary: true, action: () => {
          view.snap = $('#gdSnap').checked; view.gridStep = Math.max(0.5, num('gdStep') || 5);
          const pos = num('gdPos');
          if (isFinite(pos) && $('#gdPos').value !== '') list.push({ axis: val('gdAxis'), pos: val('gdAxis') === 'h' ? -pos : pos });
          draw();
        } }]);
  }

  function forEachPoint(o, f) {
    controlArrays(o).forEach((arr) => arr.forEach(f));
  }
  function transformSel(fn, angleFn) {
    const objs = selected();
    if (!objs.length) return;
    pushUndo();
    for (const o of objs) {
      forEachPoint(o, (p) => { const q = fn(p); p.x = q.x; p.y = q.y; });
      if (o.type === 'fill' && angleFn) o.params.angle = angleFn(o.params.angle);
      invalidate(o);
    }
    changed();
  }
  function selCenter() {
    const pts = [];
    selected().forEach((o) => { ensure(o); if (o._bb) pts.push({ x: o._bb.x0, y: o._bb.y0 }, { x: o._bb.x1, y: o._bb.y1 }); });
    if (!pts.length) return { x: 0, y: 0 };
    const b = G.bbox(pts);
    return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
  }

  /* ======================= Maus / Touch ======================= */
  let drag = null;
  const pointers = new Map();
  let pinch = null;

  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, scale: view.scale, ox: view.ox, oy: view.oy };
      drag = null;
      return;
    }
    const p = toMM(e.offsetX, e.offsetY);
    const pan = e.button === 1 || e.altKey || (e.button === 2 && (tool === 'select' || tool === 'reshape'));
    if (pan) { drag = { kind: 'pan', sx: e.offsetX, sy: e.offsetY, ox: view.ox, oy: view.oy }; return; }
    drag = { kind: 'click', sx: e.offsetX, sy: e.offsetY, cx: e.offsetX, cy: e.offsetY, start: p, button: e.button, moved: false, shift: e.shiftKey || e.ctrlKey };
    if (tool === 'select') {
      const o = hitObj(p);
      if (o) {
        const grp = o.grp ? st.objects.filter((q) => q.grp === o.grp).map((q) => q.id) : [o.id];
        if (drag.shift) { const on = sel.has(o.id); grp.forEach((id) => (on ? sel.delete(id) : sel.add(id))); }
        else if (!sel.has(o.id)) sel = new Set(grp);
        drag.kind = 'move'; drag.last = p; drag.undone = false;
        renderList(); renderProps();
      } else { drag.kind = 'band'; if (!drag.shift) sel = new Set(); }
      draw();
    } else if (tool === 'reshape') {
      const n = hitNode(p);
      if (n && n.angle) { drag.kind = 'angle'; drag.o = n.o; }
      else if (n) {
        const already = selNodes.some((s) => s.arr === n.arr && s.i === n.i);
        if (drag.shift) { if (already) selNodes = selNodes.filter((s) => !(s.arr === n.arr && s.i === n.i)); else selNodes.push(n); }
        else if (!already) selNodes = [n];
        drag.kind = 'node'; drag.last = p; drag.o = n.o;
      } else {
        const o = hitObj(p);
        if (o && !sel.has(o.id)) { sel = new Set([o.id]); selNodes = []; renderList(); renderProps(); }
        else if (!o) { selNodes = []; }
        drag.kind = 'none';
      }
      draw();
    } else if (tool === 'rect' || tool === 'ellipse') {
      drag.kind = 'shape';
      draft = { tool, pts: [], shape: null, noRubber: true };
    }
  });

  cv.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const ns = Math.max(0.2, Math.min(80, (pinch.scale * d) / pinch.d));
      const mmC = { x: (pinch.cx - pinch.ox) / pinch.scale, y: (pinch.cy - pinch.oy) / pinch.scale };
      view.scale = ns; view.ox = cx - mmC.x * ns; view.oy = cy - mmC.y * ns;
      draw();
      return;
    }
    const p = toMM(e.offsetX, e.offsetY);
    mouse = { x: e.offsetX, y: e.offsetY, mm: p };
    $('#coords').textContent = `X ${fmt(p.x)}  Y ${fmt(-p.y)} mm`;
    if (!drag) { if (draft || (tool === 'knife' && knifeStart)) draw(); return; }
    if (Math.hypot(e.offsetX - drag.sx, e.offsetY - drag.sy) > 4) drag.moved = true;
    drag.cx = e.offsetX; drag.cy = e.offsetY;
    if (drag.kind === 'pan') { view.ox = drag.ox + e.offsetX - drag.sx; view.oy = drag.oy + e.offsetY - drag.sy; draw(); }
    else if (drag.kind === 'move' && drag.moved) {
      if (!drag.undone) { pushUndo(); drag.undone = true; drag.bb0 = selBBox(); drag.off = { x: 0, y: 0 }; }
      // Gesamtverschiebung seit Beginn, an Raster/Hilfslinien einrasten
      const tot = snapDelta(drag.bb0, p.x - drag.start.x, p.y - drag.start.y);
      const dx = tot.x - drag.off.x, dy = tot.y - drag.off.y;
      drag.off = tot;
      drag.last = p;
      for (const o of selected()) { forEachPoint(o, (q) => { q.x += dx; q.y += dy; }); invalidate(o); }
      changed();
    } else if (drag.kind === 'node' && drag.moved) {
      if (!drag.undone) { pushUndo(); drag.undone = true; }
      const sp = selNodes.length === 1 ? snapPt(p, selNodes[0].arr[selNodes[0].i]) : p;
      const dx = sp.x - drag.last.x, dy = sp.y - drag.last.y;
      drag.last = sp;
      for (const n of selNodes) { n.arr[n.i].x += dx; n.arr[n.i].y += dy; }
      invalidate(drag.o);
      changed(true);
    } else if (drag.kind === 'angle') {
      if (!drag.undone) { pushUndo(); drag.undone = true; }
      const h = angleHandle(drag.o);
      drag.o.params.angle = Math.round((Math.atan2(p.y - h.c.y, p.x - h.c.x) * 180) / Math.PI);
      invalidate(drag.o);
      changed(true);
    } else if (drag.kind === 'band') draw();
    else if (drag.kind === 'shape') { draft.shape = shapePoints(drag.start, p, tool, e.shiftKey); draw(); }
    else if (draft) draw();
  });

  cv.addEventListener('pointerup', (e) => {
    pointers.delete(e.pointerId);
    if (pinch) { if (pointers.size === 0) pinch = null; return; }
    if (!drag) return;
    const d = drag;
    drag = null;
    const p = toMM(e.offsetX, e.offsetY);
    if (d.kind === 'band' && d.moved) {
      const a = toMM(Math.min(d.sx, d.cx), Math.min(d.sy, d.cy)), b = toMM(Math.max(d.sx, d.cx), Math.max(d.sy, d.cy));
      st.objects.forEach((o) => { if (o._bb && o._bb.x0 >= a.x && o._bb.x1 <= b.x && o._bb.y0 >= a.y && o._bb.y1 <= b.y) sel.add(o.id); });
      renderList(); renderProps(); draw();
      return;
    }
    if (d.kind === 'band') { renderList(); renderProps(); draw(); return; }
    if (d.kind === 'shape') {
      if (d.moved && draft.shape) {
        pushUndo();
        const o = makeObj('fill', { points: draft.shape, holes: [] });
        st.objects.push(o); sel = new Set([o.id]);
      }
      draft = null;
      changed();
      return;
    }
    if (d.kind !== 'click' || d.moved) { if (d.kind === 'node' || d.kind === 'angle') changed(); return; }
    // Klick ohne Ziehen in Digitalisierwerkzeugen
    if (tool === 'text') { textDialog(p); return; }
    if (tool === 'knife') {
      if (!knifeStart) { knifeStart = p; draw(); return; }
      const a = knifeStart; knifeStart = null;
      knifeCut(a, p);
      return;
    }
    if (['run', 'triple', 'colA', 'colB', 'colC', 'fill', 'manual'].includes(tool)) {
      const right = d.button === 2;
      if (tool === 'manual') addPoint(p, false, right);
      else addPoint(p, right || curveMode);
    }
  });

  cv.addEventListener('dblclick', (e) => {
    if (tool === 'reshape') insertNode(toMM(e.offsetX, e.offsetY));
    if (tool === 'select') { const o = hitObj(toMM(e.offsetX, e.offsetY)); if (o && o.grp && o.textSpec) textDialog(null, o.grp); }
  });

  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const f = Math.pow(1.0015, -e.deltaY);
    zoomAt(e.offsetX, e.offsetY, f);
  }, { passive: false });

  function zoomAt(x, y, f) {
    const p = toMM(x, y);
    view.scale = Math.max(0.2, Math.min(80, view.scale * f));
    view.ox = x - p.x * view.scale;
    view.oy = y - p.y * view.scale;
    draw();
  }

  function fitRect(x0, y0, x1, y1) {
    const r = cv.getBoundingClientRect();
    const w = Math.max(10, x1 - x0), h = Math.max(10, y1 - y0);
    view.scale = Math.min((r.width - 60) / w, (r.height - 60) / h);
    view.ox = r.width / 2 - ((x0 + x1) / 2) * view.scale;
    view.oy = r.height / 2 - ((y0 + y1) / 2) * view.scale;
    draw();
  }
  function zoomHoop() {
    const h = hoop();
    const w = h.w ? h.w + 30 : 200, hh = h.h ? h.h + 40 : 200;
    fitRect(-w / 2, -hh / 2, w / 2, hh / 2);
  }
  function zoomFit() {
    const s = D.stats(cmds);
    if (!s.stitches) return zoomHoop();
    fitRect(s.x0, s.y0, s.x1, s.y1);
  }

  /* ======================= Tastatur ======================= */
  window.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea') || !$('#modal').classList.contains('hidden')) {
      if (e.key === 'Escape') closeModal();
      return;
    }
    const k = e.key, ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && k.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if (ctrl && (k.toLowerCase() === 'y' || (e.shiftKey && k.toLowerCase() === 'z'))) { e.preventDefault(); redo(); return; }
    if (ctrl && k.toLowerCase() === 's') { e.preventDefault(); run('save'); return; }
    if (ctrl && k.toLowerCase() === 'o') { e.preventDefault(); run('open'); return; }
    if (ctrl && k.toLowerCase() === 'e') { e.preventDefault(); run('exportDst'); return; }
    if (ctrl && k.toLowerCase() === 'd') { e.preventDefault(); run('duplicate'); return; }
    if (ctrl && k.toLowerCase() === 'a') { e.preventDefault(); run('selectAll'); return; }
    if (ctrl && k.toLowerCase() === 'b') { e.preventDefault(); run('library'); return; }
    if (ctrl && k.toLowerCase() === 'g') { e.preventDefault(); run(e.shiftKey ? 'ungroup' : 'group'); return; }
    if (!ctrl && (k === 'g' || k === 'G') && !draft) { run('toggleSnap'); return; }
    if (k === 'Enter') { e.preventDefault(); if (draft) finishDraft(false); return; }
    if (k === 'Escape') {
      if (draft) { draft = null; setHint(); draw(); }
      else if (tool !== 'select') setTool('select');
      else { sel = new Set(); changed(); }
      return;
    }
    if (k === 'Backspace' && draft) {
      e.preventDefault();
      if (draft.angleStart) draft.angleStart = null;
      else draft.pts.pop();
      setHint();
      draw();
      return;
    }
    if (k === ' ' && tool === 'reshape' && selNodes.length) {
      e.preventDefault();
      pushUndo();
      selNodes.forEach((n) => { const q = n.arr[n.i]; if ('c' in q || n.o.type !== 'manual') q.c = !q.c; else q.j = q.j ? 0 : 1; });
      selNodes.forEach((n) => invalidate(n.o));
      changed(true);
      return;
    }
    if ((k === 'Delete' || k === 'Backspace') && tool === 'reshape' && selNodes.length) {
      const o = selNodes[0].o;
      pushUndo();
      const byArr = new Map();
      selNodes.forEach((n) => { if (!byArr.has(n.arr)) byArr.set(n.arr, []); byArr.get(n.arr).push(n.i); });
      for (const [arr, idx] of byArr) {
        idx.sort((a, b) => b - a);
        for (const i of idx) {
          if (o.type === 'colA') { const j = i - (i % 2); if (arr.length > 4) arr.splice(j, 2); }
          else if (arr.length > (o.type === 'fill' ? 3 : 2)) arr.splice(i, 1);
        }
      }
      if (o.holes) o.holes = o.holes.filter((h) => h.length >= 3);
      selNodes = [];
      invalidate(o);
      changed();
      return;
    }
    if (k === 'Delete') { run('delete'); return; }
    if (k.startsWith('Arrow') && sel.size) {
      e.preventDefault();
      const s = e.shiftKey ? 1 : 0.1;
      const dx = k === 'ArrowLeft' ? -s : k === 'ArrowRight' ? s : 0, dy = k === 'ArrowUp' ? -s : k === 'ArrowDown' ? s : 0;
      if (tool === 'reshape' && selNodes.length) {
        pushUndo();
        selNodes.forEach((n) => { n.arr[n.i].x += dx; n.arr[n.i].y += dy; invalidate(n.o); });
        changed(true);
      } else transformSel((p) => ({ x: p.x + dx, y: p.y + dy }));
      return;
    }
    if (k === '+' || k === '=') zoomAt(mouse.x || 300, mouse.y || 300, 1.25);
    if (k === '-') zoomAt(mouse.x || 300, mouse.y || 300, 0.8);
    if (k === '0') zoomFit();
    if (!ctrl && k.toLowerCase() === 't') { view.trueView = !view.trueView; draw(); }
    if (!ctrl && k.toLowerCase() === 'j') { view.jumps = !view.jumps; draw(); }
    if (!ctrl && k.toLowerCase() === 'r' && !draft) setTool('reshape');
  });

  /* ======================= Dialoge ======================= */
  function modal(title, html, buttons) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = html;
    const bb = $('#modalBtns');
    bb.innerHTML = '';
    (buttons || [{ label: 'OK', primary: true }]).forEach((b) => {
      const el = document.createElement('button');
      el.textContent = b.label;
      if (b.primary) el.className = 'primary';
      el.onclick = () => { if (!b.action || b.action() !== false) closeModal(); };
      bb.appendChild(el);
    });
    $('#modal').classList.remove('hidden');
    const f = $('#modalBody').querySelector('input, select, textarea');
    if (f) f.focus();
  }
  function closeModal() { $('#modal').classList.add('hidden'); }
  const field = (label, inner) => `<div class="field"><label>${label}</label>${inner}</div>`;
  const val = (id) => $('#' + id).value;
  const num = (id) => parseFloat(String(val(id)).replace(',', '.'));

  function pickFile(accept, cb, asText) {
    const fi = $('#fileInput');
    fi.value = '';
    fi.accept = accept;
    fi.onchange = () => {
      const f = fi.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => cb(r.result, f);
      if (asText === 'text') r.readAsText(f);
      else if (asText === 'url') r.readAsDataURL(f);
      else r.readAsArrayBuffer(f);
    };
    fi.click();
  }
  function download(data, name, type) {
    const blob = new Blob([data], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /* ---------- Garnfarben ---------- */
  const brands = () => Object.keys(HW.THREADS || {});
  function lab(hex) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => { v /= 255; return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92; };
    const r = f((n >> 16) & 255), gg = f((n >> 8) & 255), bl = f(n & 255);
    const x = (r * 0.4124 + gg * 0.3576 + bl * 0.1805) / 0.95047, y = r * 0.2126 + gg * 0.7152 + bl * 0.0722, z = (r * 0.0193 + gg * 0.1192 + bl * 0.9505) / 1.08883;
    const t = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
    return [116 * t(y) - 16, 500 * (t(x) - t(y)), 200 * (t(y) - t(z))];
  }
  // nächstes Garn einer Marke (Farbabstand ΔE in Lab)
  function nearestThread(hex, brand) {
    const list = (HW.THREADS || {})[brand];
    if (!list) return null;
    const a = lab(hex);
    let best = null, bd = Infinity;
    for (const t of list) { const b = lab(t[0]); const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); if (d < bd) { bd = d; best = t; } }
    return best ? { hex: best[0], code: best[1], name: best[2], brand, dE: bd } : null;
  }
  function applyThread(c, t) { c.hex = t.hex; c.brand = t.brand; c.code = t.code; c.name = `${t.brand} ${t.code} ${t.name}`; }
  const threadLabel = (c) => (c.brand ? `${c.brand} ${c.code}` : c.name);

  function editColor(i) {
    const c = st.palette[i];
    if (!c) return;
    const br = c.brand || st.threadBrand || brands()[0];
    modal(`Farbe ${i + 1} bearbeiten`,
      field('Farbe', `<input type="color" id="cHex" value="${c.hex}">`) +
      field('Name / Garnnummer', `<input id="cName" value="${String(c.name).replace(/"/g, '&quot;')}">`) +
      field('Nadel (1–15)', `<input id="cNeedle" type="number" min="1" max="15" value="${c.needle}">`) +
      '<h3 style="margin:12px 0 4px;font-size:14px">Garn aus Farbkarte wählen</h3>' +
      field('Garnmarke', `<select id="cBrand">${brands().map((b) => `<option ${b === br ? 'selected' : ''}>${b}</option>`).join('')}</select>`) +
      field('Suchen (Nummer oder Name)', '<input id="cFind" placeholder="z. B. 1800 oder rot">') +
      '<div id="cList" class="threads"></div>' +
      '<p style="color:#6a7480">Bildschirmfarben sind Näherungen – maßgeblich ist die echte Farbkarte des Herstellers.</p>',
      [{ label: 'Abbrechen' }, { label: 'Übernehmen', primary: true, action: () => {
        pushUndo();
        if (c.hex !== val('cHex')) { delete c.brand; delete c.code; }
        c.hex = val('cHex'); c.name = val('cName'); c.needle = Math.max(1, Math.min(15, parseInt(val('cNeedle')) || 1));
        if (picked) { c.brand = picked.brand; c.code = picked.code; }
        renderPalette(); changed();
      } }]);
    let picked = null;
    const list = () => {
      const b = val('cBrand'), q = val('cFind').trim().toLowerCase();
      let rows = (HW.THREADS[b] || []);
      if (q) {
        // deutsche Farbwörter auch finden (Farbkarten sind englisch benannt)
        const DE = { rot: 'red', blau: 'blue', grün: 'green', gruen: 'green', gelb: 'yellow', schwarz: 'black', weiß: 'white', weiss: 'white', grau: 'gr', braun: 'brown', rosa: 'pink', lila: 'purple', violett: 'violet', gold: 'gold', silber: 'silver', orange: 'orange', türkis: 'turquoise', beige: 'beige', creme: 'cream', marine: 'navy', oliv: 'olive' };
        const q2 = DE[q];
        rows = rows.filter((t) => { const n = t[2].toLowerCase(); return t[1].toLowerCase().includes(q) || n.includes(q) || (q2 && n.includes(q2)); });
      }
      else {
        // ohne Suche: die 24 ähnlichsten Garne zur aktuellen Farbe
        const a = lab(val('cHex'));
        rows = rows.map((t) => [t, (() => { const l = lab(t[0]); return Math.hypot(a[0] - l[0], a[1] - l[1], a[2] - l[2]); })()]).sort((x, y) => x[1] - y[1]).slice(0, 24).map((x) => x[0]);
      }
      $('#cList').innerHTML = rows.slice(0, 120).map((t, k) => `<button data-k="${k}" title="${t[2]}"><span style="background:${t[0]}"></span>${t[1]}<small>${t[2]}</small></button>`).join('') || '<p>Kein Garn gefunden.</p>';
      $('#cList').querySelectorAll('button').forEach((bt) => (bt.onclick = () => {
        const t = rows[+bt.dataset.k];
        picked = { brand: b, code: t[1] };
        $('#cHex').value = t[0]; $('#cName').value = `${b} ${t[1]} ${t[2]}`;
        $('#cList').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === bt));
      }));
    };
    $('#cBrand').onchange = list; $('#cFind').oninput = list;
    list();
  }

  // Farbe zur Palette hinzufügen – auf Wunsch gleich mit dem nächsten Garn der gewählten Marke
  function addPaletteColor(hex, label) {
    const ex = st.palette.findIndex((c) => c.srcHex === hex || c.hex.toLowerCase() === hex.toLowerCase());
    if (ex >= 0) return ex;
    const c = { hex, name: label + ' ' + hex, needle: Math.min(15, st.palette.length + 1), srcHex: hex };
    if (st.threadAuto !== false) { const t = nearestThread(hex, st.threadBrand || brands()[0]); if (t) applyThread(c, t); }
    st.palette.push(c);
    return st.palette.length - 1;
  }

  /* ---------- Export in mehreren Formaten, Teamnamen, Mehrfach-Einspannung ---------- */
  const EXPORT_FMTS = () => [['dst', 'DST – Tajima / Texi'], ...(HW.formats ? [['pes', 'PES – Brother'], ['jef', 'JEF – Janome'], ['exp', 'EXP – Melco / Bernina']] : [])];
  const safeName = (n) => String(n).replace(/[^\w\-äöüÄÖÜß ]/g, '_').trim() || 'design';
  function exportBytes(c, name, fmt) {
    if (fmt === 'dst' || !HW.formats) return D.writeDST(c, name, st.settings);
    const fo = c.find((q) => q.obj);
    return HW.formats.write(fmt, c, st.palette, { name, firstColor: fo ? (byId(fo.obj) || {}).color || 0 : 0 });
  }
  const fmtSelect = (id, v = 'dst') => `<select id="${id}">${EXPORT_FMTS().map(([k, t]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
  const cloneObjs = (objs) => objs.map((o) => ({ ...clone(o), _ack: o._ack }));

  // Teamnamen / Seriennamen: ein Textobjekt wird gegen jeden Namen der Liste getauscht, je Name eine Datei
  function teamDialog() {
    const groups = [...new Set(st.objects.filter((o) => o.textSpec).map((o) => o.grp))];
    if (!groups.length) return modal('Teamnamen', '<p>Das Design braucht ein Textobjekt als Platzhalter (z. B. „NAME“). Text einfügen, platzieren, dann hier die Namensliste eingeben.</p>');
    const selGrp = (selected()[0] || {}).grp;
    const opts = groups.map((g) => { const o = st.objects.find((x) => x.grp === g); return `<option value="${g}" ${g === selGrp ? 'selected' : ''}>„${String(o.textSpec.text).replace(/</g, '&lt;')}“</option>`; }).join('');
    modal('Teamnamen / Seriennamen',
      field('Platzhalter-Text', `<select id="tmGrp">${opts}</select>`) +
      '<label>Namen (einer pro Zeile)</label><textarea id="tmList" rows="8" style="width:100%" placeholder="MÜLLER 10\nSCHMIDT 7\nWEBER 23"></textarea>' +
      field('Höchstbreite (mm, 0 = frei)', '<input id="tmMax" type="number" value="0" min="0">') +
      field('Format', fmtSelect('tmFmt')) +
      field('Dateiname: Design + Name', `<input id="tmBase" value="${String(st.name).replace(/"/g, '&quot;')}">`) +
      '<p style="color:#6a7480">Lange Namen werden auf die Höchstbreite verkleinert. Alle Dateien kommen in eine ZIP-Datei (mit Liste).</p><div id="tmInfo"></div>',
      [{ label: 'Abbrechen' }, { label: 'Dateien erzeugen', primary: true, action: () => {
        const names = val('tmList').split('\n').map((x) => x.trim()).filter(Boolean);
        if (!names.length) return false;
        const grp = +val('tmGrp') || val('tmGrp');
        const fmt = val('tmFmt'), maxW = Math.max(0, num('tmMax') || 0), base = safeName(val('tmBase'));
        const old = st.objects.filter((o) => String(o.grp) === String(grp));
        const spec0 = old[0].textSpec;
        $('#tmInfo').textContent = 'Berechne …';
        fontReady(spec0).then(() => {
          const bb = G.bbox(old.flatMap((o) => { ensure(o); return o._bb ? [{ x: o._bb.x0, y: o._bb.y0 }, { x: o._bb.x1, y: o._bb.y1 }] : []; }));
          const center = { x: (bb.x0 + bb.x1) / 2, y: (bb.y0 + bb.y1) / 2 };
          const at = st.objects.indexOf(old[0]);
          const files = [], rows = [];
          names.forEach((nm, i) => {
            let spec = { ...spec0, text: nm };
            let made = buildText(spec, center, old[0].color, grp);
            const w = () => { const b = G.bbox(made.flatMap((o) => o.points)); return b.x1 - b.x0; };
            if (maxW && made.length && w() > maxW) { spec = { ...spec, height: +(spec.height * maxW / w() * 0.98).toFixed(1) }; made = buildText(spec, center, old[0].color, grp); }
            const objs = cloneObjs(st.objects.filter((o) => String(o.grp) !== String(grp)));
            objs.splice(Math.min(at, objs.length), 0, ...made);
            const c = computeCmds(objs, true);
            const s2 = D.stats(c);
            const fn = `${String(i + 1).padStart(2, '0')}_${base}_${safeName(nm)}.${fmt}`;
            files.push({ name: fn, data: exportBytes(c, nm, fmt) });
            rows.push(`${fn}\t${nm}\t${s2.stitches} Stiche\t${fmt2(s2.w)} x ${fmt2(s2.h)} mm\tSchrifthöhe ${spec.height} mm`);
          });
          files.push({ name: 'Namensliste.txt', data: 'Datei\tName\tStiche\tGröße\tHinweis\r\n' + rows.join('\r\n') });
          download(HW.zip.zip(files), base + '_Namen.zip', 'application/zip');
          closeModal();
          const small = rows.filter((r) => +r.split('Schrifthöhe ')[1].split(' ')[0] < 5);
          modal('Teamnamen', `<p>✓ ${names.length} Dateien erzeugt (ZIP).</p>` + (small.length ? `<p style="color:#c62828">⚠ Diese Namen mussten so stark verkleinert werden, dass die Schrift unter 5 mm hoch ist – das stickt nicht mehr sauber. Höchstbreite erhöhen oder kürzere Schreibweise wählen:<br>${small.map((r) => r.split('\t')[1]).join('<br>')}</p>` : ''), [{ label: 'OK', primary: true }]);
        });
        return false;
      } }]);
  }
  const fmt2 = (v) => (Math.round(v * 10) / 10).toString().replace('.', ',');

  // Großes Design auf mehrere Einspannungen verteilen, mit Passmarken zum Ausrichten
  // beide Lagen des Rahmens probieren (hoch/quer) – weniger Einspannungen gewinnt
  function splitPlan(objs, h, ov) {
    const a = splitPlan1(objs, h, ov);
    if (!a || h.w === h.h) return a;
    const b = splitPlan1(objs, { ...h, w: h.h, h: h.w }, ov);
    if (b && (b.bad.length < a.bad.length || (b.bad.length === a.bad.length && b.cells.length < a.cells.length))) { b.rotated = true; return b; }
    return a;
  }
  function splitPlan1(objs, h, ov) {
    objs.forEach(ensure);
    const list = objs.filter((o) => o._bb && !o.hidden);
    if (!list.length) return null;
    const bb = { x0: Math.min(...list.map((o) => o._bb.x0)), y0: Math.min(...list.map((o) => o._bb.y0)), x1: Math.max(...list.map((o) => o._bb.x1)), y1: Math.max(...list.map((o) => o._bb.y1)) };
    const fw = h.w - 2 * (h.margin || 0), fh = h.h - 2 * (h.margin || 0);
    const W = bb.x1 - bb.x0, H = bb.y1 - bb.y0;
    const nx = Math.max(1, Math.ceil((W - ov) / (fw - ov))), ny = Math.max(1, Math.ceil((H - ov) / (fh - ov)));
    // Felder gleichmäßig über das Design verteilen
    const sx = nx > 1 ? (W - fw) / (nx - 1) : 0, sy = ny > 1 ? (H - fh) / (ny - 1) : 0;
    const cells = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x0 = nx > 1 ? bb.x0 + i * sx : (bb.x0 + bb.x1) / 2 - fw / 2, y0 = ny > 1 ? bb.y0 + j * sy : (bb.y0 + bb.y1) / 2 - fh / 2;
      cells.push({ i, j, x0, y0, x1: x0 + fw, y1: y0 + fh, objs: [] });
    }
    const bad = [];
    for (const o of list) {
      const b = o._bb;
      const c = cells.find((c) => b.x0 >= c.x0 - 0.01 && b.x1 <= c.x1 + 0.01 && b.y0 >= c.y0 - 0.01 && b.y1 <= c.y1 + 0.01);
      if (c) c.objs.push(o);
      else {
        // passt in kein Feld: dem Feld mit der Objektmitte zuordnen und melden
        const mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2;
        const c2 = cells.reduce((a, c) => (Math.hypot((c.x0 + c.x1) / 2 - mx, (c.y0 + c.y1) / 2 - my) < Math.hypot((a.x0 + a.x1) / 2 - mx, (a.y0 + a.y1) / 2 - my) ? c : a));
        c2.objs.push(o); bad.push(o);
      }
    }
    return { cells: cells.filter((c) => c.objs.length), bb, nx, ny, bad };
  }

  // Passmarken (Kreuze) im Überlappungsbereich zweier Felder
  function regMarks(a, b) {
    const x0 = Math.max(a.x0, b.x0), x1 = Math.min(a.x1, b.x1), y0 = Math.max(a.y0, b.y0), y1 = Math.min(a.y1, b.y1);
    if (x1 - x0 < 4 || y1 - y0 < 4) return [];
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, horiz = x1 - x0 < y1 - y0; // Überlappung als senkrechter Streifen?
    const L = horiz ? y1 - y0 : x1 - x0;
    const pts = [0.2, 0.8].map((t) => (horiz ? { x: cx, y: y0 + L * t } : { x: x0 + L * t, y: cy }));
    return pts.map((p) => ({ x: p.x, y: p.y }));
  }
  const crossObj = (p, color) => {
    const r = 4, st2 = [];
    const line = (a, b) => { const n = Math.ceil(G.dist(a, b) / 2); for (let k = 0; k <= n; k++) st2.push({ ...G.lerp(a, b, k / n), j: 0 }); };
    line({ x: p.x - r, y: p.y }, { x: p.x + r, y: p.y });
    line({ x: p.x + r, y: p.y }, { x: p.x, y: p.y });
    line({ x: p.x, y: p.y }, { x: p.x, y: p.y - r });
    line({ x: p.x, y: p.y - r }, { x: p.x, y: p.y + r });
    return makeObj('manual', { stitches: st2, color, regMark: true, connect: 'trim' });
  };

  function multiHoopDialog() {
    const hs = HW.hoops.all(st.customHoops).filter((h) => h.shape === 'rect' && h.w > 0);
    const cur = hoop();
    modal('Auf mehrere Einspannungen verteilen',
      '<p>Für Motive, die größer sind als der Rahmen: das Design wird auf mehrere Einspannungen aufgeteilt. Jede Einspannung bekommt eine eigene Datei. <b>Passmarken</b> (Kreuze) im Überlappungsbereich werden am Ende einer Einspannung und am Anfang der nächsten gestickt – so lässt sich der Stoff exakt ausrichten.</p>' +
      field('Rahmen je Einspannung', `<select id="mhHoop">${hs.map((h) => `<option value="${h.id}" ${h.id === cur.id ? 'selected' : ''}>${h.name}</option>`).join('')}</select>`) +
      field('Überlappung (mm)', '<input id="mhOv" type="number" value="20" min="8" max="80">') +
      field('Passmarken', '<input type="checkbox" id="mhReg" checked>') +
      field('Format', fmtSelect('mhFmt')) +
      '<canvas id="mhPrev" width="520" height="300" style="width:100%;background:#fff"></canvas><div id="mhInfo"></div>',
      [{ label: 'Abbrechen' }, { label: 'Dateien erzeugen', primary: true, action: () => {
        const plan = mk();
        if (!plan) return false;
        const fmt = val('mhFmt'), base = safeName(st.name);
        let ci = -1;
        if ($('#mhReg').checked) { ci = st.palette.findIndex((c) => c.name === 'Passmarke'); if (ci < 0) { st.palette.push({ hex: '#9e9e9e', name: 'Passmarke', needle: Math.min(15, st.palette.length + 1) }); ci = st.palette.length - 1; renderPalette(); } }
        const files = [], txt = [];
        plan.cells.forEach((c, k) => {
          let objs = cloneObjs(st.objects.filter((o) => c.objs.includes(o)));
          if (ci >= 0) {
            const prev = plan.cells[k - 1], next = plan.cells[k + 1];
            if (prev) objs = [...regMarks(prev, c).map((p) => crossObj(p, ci)), ...objs];
            if (next) objs = [...objs, ...regMarks(c, next).map((p) => crossObj(p, ci))];
          }
          const cm = computeCmds(objs, true);
          const fn = `${base}_Einspannung_${k + 1}_von_${plan.cells.length}.${fmt}`;
          files.push({ name: fn, data: exportBytes(cm, base + ' ' + (k + 1), fmt) });
          const s2 = D.stats(cm);
          txt.push(`${k + 1}. ${fn}: Feld Spalte ${c.i + 1}, Reihe ${c.j + 1} – Mitte bei x=${fmt2((c.x0 + c.x1) / 2 - plan.bb.x0)} mm, y=${fmt2((c.y0 + c.y1) / 2 - plan.bb.y0)} mm vom linken oberen Motivrand; ${s2.stitches} Stiche`);
        });
        files.push({ name: 'Anleitung.txt', data: ['Mehrfach-Einspannung ' + st.name, plan.rotated ? 'Rahmen quer (um 90° gedreht) verwenden.' : '', ...txt, '', 'Ablauf: Einspannung 1 sticken (am Ende werden die Passmarken gestickt). Stoff neu einspannen, Rahmen so verschieben, dass die Nadel genau über dem Mittelpunkt des ersten Passkreuzes steht (Kreuze der neuen Datei werden zuerst gestickt – vorher mit der Positions-/Trace-Funktion prüfen). Passmarken nach dem Sticken entfernen.'].join('\r\n') });
        download(HW.zip.zip(files), base + '_Einspannungen.zip', 'application/zip');
      } }]);
    const mk = () => {
      const h = HW.hoops.get(val('mhHoop'), st.customHoops);
      const plan = splitPlan(st.objects, h, Math.max(8, num('mhOv') || 20));
      const c = $('#mhPrev'), x = c.getContext('2d');
      x.clearRect(0, 0, c.width, c.height);
      if (!plan) return null;
      const B = plan.cells.reduce((a, q) => ({ x0: Math.min(a.x0, q.x0), y0: Math.min(a.y0, q.y0), x1: Math.max(a.x1, q.x1), y1: Math.max(a.y1, q.y1) }), plan.bb);
      const sc = Math.min((c.width - 20) / (B.x1 - B.x0), (c.height - 20) / (B.y1 - B.y0));
      const T = (p) => [10 + (p.x - B.x0) * sc, 10 + (p.y - B.y0) * sc];
      x.lineWidth = 1;
      let prev = null;
      for (const q of cmds) {
        if (q.cmd === 'stitch' && prev) { x.strokeStyle = colOf((byId(q.obj) || {}).color ?? 0); x.beginPath(); x.moveTo(...T(prev)); x.lineTo(...T(q)); x.stroke(); }
        if (q.cmd !== 'trim' && q.cmd !== 'color') prev = q;
      }
      const cols = ['#1f6feb', '#d81b60', '#2e7d32', '#ef6c00', '#6a1b9a', '#00838f'];
      plan.cells.forEach((q, k) => {
        x.strokeStyle = cols[k % cols.length]; x.setLineDash([6, 4]); x.lineWidth = 2;
        const [a, b] = T({ x: q.x0, y: q.y0 }), [e, f] = T({ x: q.x1, y: q.y1 });
        x.strokeRect(a, b, e - a, f - b);
        x.setLineDash([]); x.fillStyle = cols[k % cols.length]; x.font = 'bold 14px system-ui'; x.fillText(String(k + 1), a + 5, b + 16);
      });
      $('#mhInfo').innerHTML = `<p>${plan.cells.length} Einspannung${plan.cells.length === 1 ? '' : 'en'} (${plan.nx} × ${plan.ny}) für ${fmt2(plan.bb.x1 - plan.bb.x0)} × ${fmt2(plan.bb.y1 - plan.bb.y0)} mm.${plan.rotated ? ' <b>Rahmen quer einspannen</b> (90° gedreht).' : ''}` +
        (plan.bad.length ? ` <span style="color:#c62828">⚠ ${plan.bad.length} Objekt(e) größer als ein Feld – vorher mit dem <b>Messer</b> teilen, sonst ragen sie über den Rahmen.</span>` : '') + '</p>';
      return plan;
    };
    ['mhHoop', 'mhOv'].forEach((id) => ($('#' + id).onchange = mk));
    mk();
  }

  /* ---------- Design zeichnen (Vorschaubilder, Mockup) ---------- */
  // T: mm → Pixel, sc: Pixel je mm
  function paintDesign(x, c, T, sc, opts = {}) {
    let col = colOf((byId((c.find((q) => q.obj) || {}).obj) || {}).color ?? 0), prev = null;
    x.lineCap = 'round';
    const w = Math.max(0.6, 0.42 * sc);
    for (const pass of opts.shadow ? [0, 1] : [1]) {
      prev = null;
      col = colOf((byId((c.find((q) => q.obj) || {}).obj) || {}).color ?? 0);
      for (const q of c) {
        if (q.cmd === 'color') { col = colOf(q.color); continue; }
        if (q.cmd === 'stitch' && prev && !q.travel) {
          const a = T(prev), b = T(q);
          x.strokeStyle = pass ? col : 'rgba(0,0,0,.25)';
          x.lineWidth = pass ? w : w * 1.6;
          x.beginPath();
          if (pass) { x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); } else { x.moveTo(a[0] + w * 0.4, a[1] + w * 0.6); x.lineTo(b[0] + w * 0.4, b[1] + w * 0.6); }
          x.stroke();
        }
        if (q.cmd === 'stitch' || q.cmd === 'jump') prev = q;
      }
    }
  }
  function thumbnail(c, size = 180) {
    const s2 = D.stats(c);
    const cv2 = document.createElement('canvas'); cv2.width = cv2.height = size;
    const x = cv2.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, size, size);
    if (!s2.stitches) return cv2.toDataURL();
    const sc = (size - 12) / Math.max(s2.w, s2.h, 1);
    const ox = size / 2 - ((s2.x0 + s2.x1) / 2) * sc, oy = size / 2 - ((s2.y0 + s2.y1) / 2) * sc;
    paintDesign(x, c, (p) => [ox + p.x * sc, oy + p.y * sc], sc);
    return cv2.toDataURL('image/png');
  }

  /* ---------- Produkt-Vorschau (Mockup) ---------- */
  // Umrisse in mm, (0,0) = Halsausschnitt Mitte oben bzw. Mitte des Produkts
  const PRODUCTS = {
    tshirt: { name: 'T-Shirt', spots: { brustL: ['Brust links', 95, 190], mitte: ['Brust Mitte', 0, 230], ruecken: ['Rücken oben', 0, 170] },
      outline: [[-75, 0], [-200, 35], [-300, 180], [-225, 240], [-185, 200], [-180, 700], [180, 700], [185, 200], [225, 240], [300, 180], [200, 35], [75, 0], [0, 35]], neck: true },
    polo: { name: 'Polo', spots: { brustL: ['Brust links', 95, 190], mitte: ['Brust Mitte', 0, 240], aermel: ['Ärmel links', 250, 150] },
      outline: [[-70, 0], [-200, 35], [-290, 200], [-220, 250], [-185, 205], [-180, 720], [180, 720], [185, 205], [220, 250], [290, 200], [200, 35], [70, 0], [0, 25]], placket: true },
    hoodie: { name: 'Hoodie', spots: { brustL: ['Brust links', 95, 200], mitte: ['Brust Mitte', 0, 230] },
      outline: [[-90, 0], [-230, 40], [-320, 560], [-260, 580], [-210, 250], [-200, 720], [200, 720], [210, 250], [260, 580], [320, 560], [230, 40], [90, 0], [0, 70]], hood: true, pocket: true },
    cap: { name: 'Kappe (Front)', spots: { front: ['Front Mitte', 0, -10], seite: ['Seite', 75, 0] },
      outline: [[-110, 60], [-105, 0], [-80, -55], [-35, -85], [0, -90], [35, -85], [80, -55], [105, 0], [110, 60]], cap: true },
    towel: { name: 'Handtuch', spots: { unten: ['Bordüre unten', 0, 360], mitte: ['Mitte', 0, 0], ecke: ['Ecke unten rechts', 170, 380] },
      outline: [[-250, -500], [250, -500], [250, 500], [-250, 500]], towel: true },
    tasche: { name: 'Tasche', spots: { mitte: ['Mitte', 0, 40] },
      outline: [[-190, -150], [190, -150], [190, 230], [-190, 230]], bag: true },
  };
  function mockupDialog() {
    if (!cmds.some((q) => q.cmd === 'stitch')) return modal('Produkt-Vorschau', '<p>Das Design enthält noch keine Stiche.</p>');
    const ms = (st.settings.mockup = st.settings.mockup || { prod: 'tshirt', spot: 'brustL', color: '#ffffff' });
    const prodOpts = Object.entries(PRODUCTS).map(([k, v]) => `<option value="${k}" ${k === ms.prod ? 'selected' : ''}>${v.name}</option>`).join('');
    modal('Produkt-Vorschau (Mockup)',
      field('Produkt', `<select id="mkP">${prodOpts}</select>`) + field('Platzierung', '<select id="mkS"></select>') +
      field('Stofffarbe', `<input type="color" id="mkC" value="${ms.color}">`) +
      '<canvas id="mkCv" width="640" height="720" style="width:100%;background:#eceff3"></canvas><p id="mkInfo" style="color:#6a7480"></p>',
      [{ label: 'Als Bild speichern', action: () => { $('#mkCv').toBlob((bl) => download(bl, safeName(st.name) + '_Vorschau.png', 'image/png')); return false; } }, { label: 'Schließen', primary: true }]);
    const fillSpots = () => {
      const pr = PRODUCTS[val('mkP')];
      $('#mkS').innerHTML = Object.entries(pr.spots).map(([k, v]) => `<option value="${k}" ${k === ms.spot ? 'selected' : ''}>${v[0]}</option>`).join('');
    };
    const draw2 = () => {
      ms.prod = val('mkP'); ms.spot = val('mkS'); ms.color = val('mkC');
      const pr = PRODUCTS[ms.prod], sp = pr.spots[ms.spot] || Object.values(pr.spots)[0];
      const c = $('#mkCv'), x = c.getContext('2d');
      const ol = pr.outline.map(([a, b]) => ({ x: a, y: b }));
      const bb = G.bbox(pr.cap ? ol.concat([{ x: -160, y: 160 }, { x: 160, y: 160 }]) : pr.bag ? ol.concat([{ x: 0, y: -360 }]) : ol);
      const sc = Math.min((c.width - 40) / (bb.x1 - bb.x0), (c.height - 40) / (bb.y1 - bb.y0));
      const ox = c.width / 2 - ((bb.x0 + bb.x1) / 2) * sc, oy = c.height / 2 - ((bb.y0 + bb.y1) / 2) * sc;
      const T = (p) => [ox + p.x * sc, oy + p.y * sc];
      x.clearRect(0, 0, c.width, c.height);
      x.fillStyle = '#eceff3'; x.fillRect(0, 0, c.width, c.height);
      // Kleidungsstück
      x.save();
      x.beginPath();
      ol.forEach((p, i) => { const [a, b] = T(p); if (!i) x.moveTo(a, b); else x.lineTo(a, b); });
      if (pr.cap) { const [a, b] = T({ x: 160, y: 95 }), [e, f] = T({ x: -160, y: 95 }); x.quadraticCurveTo(...T({ x: 120, y: 120 }), a, b); x.quadraticCurveTo(...T({ x: 0, y: 160 }), e, f); x.quadraticCurveTo(...T({ x: -120, y: 120 }), ...T(ol[0])); }
      x.closePath();
      x.fillStyle = ms.color; x.fill();
      x.lineWidth = 2; x.strokeStyle = 'rgba(0,0,0,.35)'; x.stroke();
      x.clip();
      // Falten/Schatten
      const gr = x.createLinearGradient(T({ x: bb.x0, y: 0 })[0], 0, T({ x: bb.x1, y: 0 })[0], 0);
      gr.addColorStop(0, 'rgba(0,0,0,.10)'); gr.addColorStop(0.5, 'rgba(255,255,255,.06)'); gr.addColorStop(1, 'rgba(0,0,0,.12)');
      x.fillStyle = gr; x.fillRect(0, 0, c.width, c.height);
      x.strokeStyle = 'rgba(0,0,0,.18)'; x.lineWidth = 1.5;
      const line = (pts) => { x.beginPath(); pts.forEach((p, i) => { const [a, b] = T({ x: p[0], y: p[1] }); if (!i) x.moveTo(a, b); else x.lineTo(a, b); }); x.stroke(); };
      if (pr.neck || pr.placket || pr.hood) line([[-75, 0], [-40, 30], [0, 40], [40, 30], [75, 0]]);
      if (pr.placket) { line([[0, 25], [0, 150]]); [60, 105].forEach((y) => { x.beginPath(); x.arc(...T({ x: 0, y }), 3, 0, 7); x.stroke(); }); }
      if (pr.hood) { line([[-90, 0], [-70, 80], [0, 110], [70, 80], [90, 0]]); line([[-25, 100], [-30, 260]]); line([[25, 100], [30, 260]]); }
      if (pr.pocket) line([[-140, 640], [-110, 470], [110, 470], [140, 640]]);
      if (pr.neck || pr.placket || pr.hood) { line([[-180, 690], [180, 690]]); line([[-185, 200], [-200, 40]]); line([[185, 200], [200, 40]]); }
      if (pr.cap) { line([[0, -90], [0, 60]]); line([[-80, -55], [-60, 60]]); line([[80, -55], [60, 60]]); x.beginPath(); x.arc(...T({ x: 0, y: -88 }), 5, 0, 7); x.stroke(); }
      if (pr.towel) { x.fillStyle = 'rgba(0,0,0,.07)'; for (const y of [300, 420]) { const [a, b] = T({ x: -250, y }), [e, f] = T({ x: 250, y: y + 40 }); x.fillRect(a, b, e - a, f - b); } }
      if (pr.bag) { x.restore(); x.save(); x.lineWidth = 10; x.strokeStyle = ms.color; x.beginPath(); x.moveTo(...T({ x: -110, y: -150 })); x.bezierCurveTo(...T({ x: -110, y: -420 }), ...T({ x: 110, y: -420 }), ...T({ x: 110, y: -150 })); x.stroke(); x.lineWidth = 1; x.strokeStyle = 'rgba(0,0,0,.35)'; x.stroke(); }
      x.restore();
      // Design in Originalgröße
      const s2 = D.stats(cmds);
      const cx = (s2.x0 + s2.x1) / 2, cy = (s2.y0 + s2.y1) / 2;
      paintDesign(x, cmds, (p) => T({ x: sp[1] + p.x - cx, y: sp[2] + p.y - cy }), sc, { shadow: true });
      $('#mkInfo').textContent = `${pr.name}, ${sp[0]}: Design ${fmt2(s2.w)} × ${fmt2(s2.h)} mm (maßstabsgetreu, Kleidungsstück ca. Größe L). Übliche Größen: Brust links 70–100 mm breit, Brust Mitte bis 250 mm, Kappe Front bis ca. 110 × 55 mm.`;
    };
    $('#mkP').onchange = () => { fillSpots(); draw2(); };
    $('#mkS').onchange = draw2; $('#mkC').oninput = draw2;
    fillSpots(); draw2();
  }

  /* ---------- Preiskalkulation & Angebot ---------- */
  const PRICE_DEF = { mode: 'stitches', per1000: 0.9, minPiece: 3.5, perColor: 0.1, hourRate: 48, setup: 35, digitize: 0, hoopMin: 1.5, garment: 0, vat: 19, tiers: '1:0, 10:5, 25:10, 50:15, 100:20' };
  function priceDialog() {
    const s2 = D.stats(cmds);
    if (!s2.stitches) return modal('Preiskalkulation', '<p>Das Design enthält noch keine Stiche.</p>');
    const P = (st.settings.price = { ...PRICE_DEF, ...(st.settings.price || {}) });
    const nf = (v) => v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    modal('Preiskalkulation & Angebot',
      `<p>${st.name}: <b>${s2.stitches.toLocaleString('de-DE')}</b> Stiche · ${s2.colors} Farben · ${s2.trims} Schnitte · ${fmt2(s2.w)} × ${fmt2(s2.h)} mm</p>` +
      field('Berechnung', `<select id="pcM"><option value="stitches" ${P.mode === 'stitches' ? 'selected' : ''}>nach Stichzahl (je 1000 Stiche)</option><option value="time" ${P.mode === 'time' ? 'selected' : ''}>nach Maschinenzeit (Stundensatz)</option></select>`) +
      field('Preis je 1000 Stiche (€)', `<input id="pcK" type="number" step="0.05" value="${P.per1000}">`) +
      field('Stundensatz Maschine (€)', `<input id="pcH" type="number" step="1" value="${P.hourRate}">`) +
      field('Aufschlag je Farbe (€)', `<input id="pcC" type="number" step="0.05" value="${P.perColor}">`) +
      field('Mindestpreis je Stück (€)', `<input id="pcMin" type="number" step="0.5" value="${P.minPiece}">`) +
      field('Einspannen je Stück (min)', `<input id="pcHoop" type="number" step="0.5" value="${P.hoopMin}">`) +
      field('Textil je Stück (€, 0 = beigestellt)', `<input id="pcG" type="number" step="0.5" value="${P.garment}">`) +
      field('Einrichtung je Auftrag (€)', `<input id="pcS" type="number" step="1" value="${P.setup}">`) +
      field('Digitalisierung einmalig (€)', `<input id="pcD" type="number" step="1" value="${P.digitize}">`) +
      field('Mengenrabatt (Stück:%)', `<input id="pcT" value="${P.tiers}">`) +
      field('MwSt. (%)', `<input id="pcV" type="number" value="${P.vat}">`) +
      '<div id="pcOut"></div>',
      [{ label: 'Angebot drucken', action: () => { offer(); return false; } }, { label: 'Schließen', primary: true }]);
    let rows = [];
    const calc = () => {
      Object.assign(P, { mode: val('pcM'), per1000: num('pcK') || 0, hourRate: num('pcH') || 0, perColor: num('pcC') || 0, minPiece: num('pcMin') || 0, hoopMin: num('pcHoop') || 0, garment: num('pcG') || 0, setup: num('pcS') || 0, digitize: num('pcD') || 0, tiers: val('pcT'), vat: num('pcV') || 0 });
      const mins = s2.stitches / (st.settings.spm || 800) + s2.colors * 0.15 + s2.trims * 0.05 + P.hoopMin;
      const base = P.mode === 'time' ? (mins / 60) * P.hourRate : (s2.stitches / 1000) * P.per1000 + s2.colors * P.perColor;
      const piece = Math.max(P.minPiece, base);
      const tiers = P.tiers.split(',').map((t) => t.split(':').map(Number)).filter((t) => t[0] > 0).sort((a, b) => a[0] - b[0]);
      rows = tiers.map(([q, d]) => {
        const unit = piece * (1 - (d || 0) / 100) + P.garment;
        const net = unit * q + P.setup + P.digitize;
        return { q, d, unit, net, gross: net * (1 + P.vat / 100), time: (mins * q) / 60 };
      });
      $('#pcOut').innerHTML = `<p>Maschinenzeit je Stück ca. <b>${fmt2(mins)} min</b> (bei ${st.settings.spm || 800} Stichen/min, inkl. Farbwechsel, Schnitte, Einspannen).</p>
        <table class="tbtab" style="width:100%"><tr><th>Menge</th><th>Rabatt</th><th>Stück netto</th><th>Gesamt netto</th><th>Gesamt brutto</th><th>Maschine</th></tr>
        ${rows.map((r) => `<tr><td>${r.q}</td><td>${r.d || 0} %</td><td>${nf(r.unit)} €</td><td>${nf(r.net)} €</td><td><b>${nf(r.gross)} €</b></td><td>${fmt2(r.time)} h</td></tr>`).join('')}</table>
        <p style="color:#6a7480">Gesamt enthält Einrichtung${P.digitize ? ' und Digitalisierung' : ''} einmal je Auftrag. Werte werden im Projekt gespeichert.</p>`;
    };
    const offer = () => {
      const w = window.open('', '_blank');
      if (!w) return;
      const img = thumbnail(cmds, 260);
      w.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Angebot ${st.name}</title><style>body{font:14px system-ui;margin:30px;max-width:760px}td,th{padding:4px 10px;border-bottom:1px solid #ddd;text-align:right}td:first-child,th:first-child{text-align:left}img{float:right;border:1px solid #ccc}</style></head><body>
        <img src="${img}"><h2>Angebot Stickerei</h2><p>Datum: ${new Date().toLocaleDateString('de-DE')}<br>Motiv: <b>${st.name}</b><br>Größe: ${fmt2(s2.w)} × ${fmt2(s2.h)} mm · ${s2.stitches.toLocaleString('de-DE')} Stiche · ${s2.colors} Farben</p>
        <table style="clear:both;width:100%"><tr><th>Menge</th><th>Stückpreis netto</th><th>Gesamt netto</th><th>MwSt. ${P.vat} %</th><th>Gesamt brutto</th></tr>
        ${rows.map((r) => `<tr><td>${r.q} Stück</td><td>${nf(r.unit)} €</td><td>${nf(r.net)} €</td><td>${nf(r.gross - r.net)} €</td><td><b>${nf(r.gross)} €</b></td></tr>`).join('')}</table>
        <p>Im Gesamtpreis enthalten: Einrichtung ${nf(P.setup)} €${P.digitize ? `, Digitalisierung ${nf(P.digitize)} €` : ''}. ${P.garment ? `Textil je Stück ${nf(P.garment)} € enthalten.` : 'Textilien werden beigestellt.'}</p>
        <script>setTimeout(()=>print(),300)<\/script></body></html>`);
      w.document.close();
    };
    $('#modalBody').querySelectorAll('input,select').forEach((e) => (e.oninput = e.onchange = calc));
    calc();
  }

  /* ---------- Design-Bibliothek (im Browser gespeichert, IndexedDB) ---------- */
  const LIB = {
    db: null,
    open() {
      if (this.db) return Promise.resolve(this.db);
      return new Promise((res, rej) => {
        const r = indexedDB.open('stickstudio', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('designs', { keyPath: 'id', autoIncrement: true });
        r.onsuccess = () => { this.db = r.result; res(this.db); };
        r.onerror = () => rej(r.error);
      });
    },
    tx(mode, fn) { return this.open().then((db) => new Promise((res, rej) => { const t = db.transaction('designs', mode); const s2 = t.objectStore('designs'); const r = fn(s2); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); })); },
    all() { return this.tx('readonly', (s2) => s2.getAll()); },
    put(rec) { return this.tx('readwrite', (s2) => s2.put(rec)); },
    del(id) { return this.tx('readwrite', (s2) => s2.delete(id)); },
  };
  function librarySave(after) {
    const s2 = D.stats(cmds);
    modal('In Bibliothek speichern',
      field('Name', `<input id="lbN" value="${String(st.name).replace(/"/g, '&quot;')}">`) +
      field('Stichworte (Komma)', `<input id="lbT" value="${(st.libTags || []).join(', ')}" placeholder="Logo, Verein, Kappe">`) +
      field('Kunde', `<input id="lbK" value="${st.libCustomer || ''}">`),
      [{ label: 'Abbrechen' }, { label: 'Speichern', primary: true, action: () => {
        st.name = val('lbN').trim() || st.name;
        st.libTags = val('lbT').split(',').map((t) => t.trim()).filter(Boolean);
        st.libCustomer = val('lbK').trim();
        const rec = { name: st.name, tags: st.libTags, customer: st.libCustomer, date: Date.now(), stitches: s2.stitches, w: s2.w, h: s2.h, colors: s2.colors, thumb: thumbnail(cmds), data: projectJSON() };
        if (st.libId) rec.id = st.libId;
        LIB.put(rec).then((id) => { st.libId = id ?? st.libId; hintFlash('In der Bibliothek gespeichert.'); if (after) after(); })
          .catch((e) => modal('Bibliothek', `<p>Speichern nicht möglich: ${e}</p>`));
      } }]);
  }
  function libraryDialog() {
    modal('Design-Bibliothek',
      '<div class="row" style="margin:0 0 8px"><input id="lbQ" placeholder="Suchen: Name, Stichwort, Kunde …" style="flex:1;padding:4px 6px"><select id="lbSort"><option value="date">neueste zuerst</option><option value="name">Name</option><option value="stitches">Stichzahl</option></select><button id="lbAdd">+ Aktuelles Design speichern</button></div>' +
      '<div id="lbGrid" class="libgrid">Lade …</div><p style="color:#6a7480">Die Bibliothek liegt im Browser dieses Computers. Zur Sicherung Designs zusätzlich als Projektdatei speichern.</p>',
      [{ label: 'Schließen', primary: true }]);
    let recs = [];
    const esc = (t) => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const show = () => {
      const q = val('lbQ').toLowerCase().trim(), so = val('lbSort');
      const list = recs.filter((r) => !q || [r.name, r.customer, ...(r.tags || [])].join(' ').toLowerCase().includes(q))
        .sort((a, b) => (so === 'name' ? a.name.localeCompare(b.name) : so === 'stitches' ? a.stitches - b.stitches : b.date - a.date));
      $('#lbGrid').innerHTML = list.length ? list.map((r) => `<div class="libcard"><img src="${r.thumb}" alt=""><b>${esc(r.name)}</b>
        <small>${fmt2(r.w)} × ${fmt2(r.h)} mm · ${r.stitches.toLocaleString('de-DE')} St. · ${r.colors} F.<br>${esc(r.customer)}${r.customer && r.tags && r.tags.length ? ' · ' : ''}${esc((r.tags || []).join(', '))}<br>${new Date(r.date).toLocaleDateString('de-DE')}</small>
        <div class="row"><button data-open="${r.id}">Öffnen</button><button data-del="${r.id}" title="Löschen">🗑</button></div></div>`).join('') : '<p>Keine Designs gefunden.</p>';
      $('#lbGrid').querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => {
        const r = recs.find((x) => x.id === +b.dataset.open);
        closeModal();
        loadProject(JSON.parse(r.data), r.name);
        st.libId = r.id; st.libTags = r.tags || []; st.libCustomer = r.customer || '';
      }));
      $('#lbGrid').querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => {
        if (!confirm('Design aus der Bibliothek löschen?')) return;
        LIB.del(+b.dataset.del).then(load);
      }));
    };
    const load = () => LIB.all().then((r) => { recs = r || []; show(); }).catch((e) => { $('#lbGrid').textContent = 'Bibliothek nicht verfügbar: ' + e; });
    $('#lbQ').oninput = show; $('#lbSort').onchange = show;
    $('#lbAdd').onclick = () => { if (!cmds.some((q) => q.cmd === 'stitch')) return; librarySave(() => libraryDialog()); };
    load();
  }

  /* ---------- Projekt als Daten ---------- */
  function projectJSON() {
    const data = JSON.stringify({ app: 'StickStudio', version: 1, name: st.name, objects: clone(st.objects), palette: st.palette, hoop: st.hoop, customHoops: st.customHoops, fabric: st.fabric, material: st.material, settings: st.settings, defaults: st.defaults, threadBrand: st.threadBrand, threadAuto: st.threadAuto, guides: st.guides || [], libTags: st.libTags, libCustomer: st.libCustomer, bg: st.bg ? { ...clone(st.bg), src: st.bg.src } : null });
    return data;
  }
  function loadProject(d, fname = '') {
    pushUndo();
    st.objects = d.objects || []; st.palette = d.palette || st.palette; st.hoop = d.hoop || st.hoop;
    st.fabric = d.fabric || st.fabric;
    if (Array.isArray(d.customHoops)) { const ids = new Set(st.customHoops.map((c) => c.id)); st.customHoops = st.customHoops.concat(d.customHoops.filter((c) => !ids.has(c.id))); saveCustomHoops(); }
    renderHoopSel(); st.material = d.material || st.material; if (d.threadBrand) st.threadBrand = d.threadBrand; st.guides = d.guides || []; if (d.threadAuto === false) st.threadAuto = false; st.objects.forEach(invalidate); Object.assign(st.settings, d.settings || {});
    if (d.defaults) Object.keys(d.defaults).forEach((k) => Object.assign(st.defaults[k] || (st.defaults[k] = {}), d.defaults[k]));
    st.name = d.name || fname.replace(/\..*$/, '');
    nextId = Math.max(0, ...st.objects.map((o) => o.id || 0)) + 1;
    nextGrp = Math.max(0, ...st.objects.map((o) => (typeof o.grp === 'number' ? o.grp : 0))) + 1;
    st.bg = null;
    if (d.bg && d.bg.src) { const b = d.bg; loadBg(b.src, b.w, () => Object.assign(st.bg, { x: b.x, y: b.y, opacity: b.opacity, visible: b.visible !== false })); }
    sel = new Set(); renderPalette(); changed(); zoomFit();
  }

  /* ---------- Applikation, Knockdown, Kappe ---------- */
  function appliqueDialog() {
    const objs = selected().filter((o) => o.type === 'fill' || (o.type === 'run' && o.params.closed));
    if (!objs.length) return modal('Applikation', '<p>Bitte zuerst eine oder mehrere geschlossene Formen auswählen (Fläche, Rechteck, Ellipse, Text-Buchstaben, geschlossener Laufstich).</p>');
    modal('Applikation erstellen',
      '<p>Aus der Form werden drei Schritte: <b>1. Platzierungslinie</b> (zeigt, wo der Stoff hin kommt) → Stopp, Stoff auflegen → <b>2. Heftstich</b> (hält den Stoff) → Stopp, Stoff knapp abschneiden → <b>3. Abdeckung</b> (Satin oder E-Stich über der Schnittkante).</p>' +
      field('Heftstich', '<select id="apTack"><option value="zigzag">Zickzack (offen)</option><option value="run">Doppel-Laufstich</option><option value="e">E-Stich</option></select>') +
      field('Abdeckung', '<select id="apCover"><option value="satin">Satin</option><option value="e">E-Stich (Langette)</option></select>') +
      field('Breite der Abdeckung (mm)', '<input id="apW" type="number" value="3.5" min="1.5" max="8" step="0.1">') +
      field('Löcher ebenfalls einfassen', '<input type="checkbox" id="apHoles" checked>') +
      field('Abdeckung in eigener Farbe', '<input type="checkbox" id="apCol">'),
      [{ label: 'Abbrechen' }, { label: 'Erstellen', primary: true, action: () => {
        pushUndo();
        const tackT = val('apTack'), covT = val('apCover'), w = Math.max(1.5, num('apW') || 3.5);
        const covColor = $('#apCol').checked ? st.curColor : null;
        const gid = 'ap' + Date.now();
        const rings = [];
        objs.forEach((o) => { rings.push(o.points); if ($('#apHoles').checked) (o.holes || []).forEach((h) => rings.push(h)); });
        const color = objs[0].color;
        const sat = { ...S.DEFAULTS.satin, ...st.defaults.colC };
        const parts = [];
        rings.forEach((r) => parts.push(makeObj('run', { points: r.map((p) => ({ ...p })), color, applPart: 'place', grp: gid, params: { ...S.DEFAULTS.run, closed: true, len: 2.5, style: 'single' } })));
        rings.forEach((r, i) => parts.push(makeObj(tackT === 'run' ? 'run' : 'colC', {
          points: r.map((p) => ({ ...p })), color, applPart: 'tack', grp: gid, autoFab: false, stopBefore: i === 0 || undefined,
          params: tackT === 'run' ? { ...S.DEFAULTS.run, closed: true, len: 2.5, style: 'triple' }
            : { ...sat, width: tackT === 'e' ? 2 : 1.6, spacing: 2.2, style: tackT === 'e' ? 'e' : 'satin', underlay: 'none', shortSt: false, split: 0, pull: 0, closed: true },
        })));
        rings.forEach((r, i) => parts.push(makeObj('colC', {
          points: r.map((p) => ({ ...p })), color: covColor ?? color, applPart: 'cover', grp: gid, stopBefore: i === 0 || undefined,
          params: { ...sat, width: w, style: covT === 'e' ? 'e' : 'satin', spacing: covT === 'e' ? 2.5 : sat.spacing, underlay: covT === 'e' ? 'none' : 'center', closed: true },
        })));
        const idx = st.objects.indexOf(objs[0]);
        st.objects = st.objects.filter((o) => !objs.includes(o));
        st.objects.splice(Math.max(0, Math.min(idx, st.objects.length)), 0, ...parts);
        sel = new Set(parts.map((o) => o.id));
        changed();
      } }]);
  }

  function knockdownDialog() {
    const objs = st.objects.filter((o) => !o.hidden && !o.knockdown);
    if (!objs.length) return;
    modal('Knockdown-Stich',
      '<p>Ein lockeres Gitter unter dem ganzen Motiv drückt Flor und Schlaufen (Frottee, Fleece, Strick, Piqué) flach, damit feine Schrift und Details nicht im Stoff versinken. Es wird als Erstes gestickt – am besten in Stofffarbe.</p>' +
      field('Rand um das Motiv (mm)', '<input id="kdM" type="number" value="1.5" min="0" max="10" step="0.1">') +
      field('Gitterabstand (mm)', '<input id="kdS" type="number" value="1.6" min="0.8" max="5" step="0.1">') +
      field('Winkel (°)', '<input id="kdA" type="number" value="45">') +
      field('Farbe', '<select id="kdC"><option value="fabric">Stofffarbe (neue Farbe)</option><option value="cur">aktuelle Farbe</option></select>'),
      [{ label: 'Abbrechen' }, { label: 'Erstellen', primary: true, action: () => {
        const B = HW.boolean;
        const rl = objs.map((o) => (o.type === 'run' && o.params.closed ? [G.buildPath(o.points, true).pts] : B.ringsOf(o))).filter(Boolean);
        if (!rl.length) return;
        const m = Math.max(0, num('kdM') || 0);
        const bb = G.bbox(rl.flat().flat());
        const gr = B.grid({ x0: bb.x0 - m - 1, y0: bb.y0 - m - 1, x1: bb.x1 + m + 1, y1: bb.y1 + m + 1 });
        let mask = new Uint8Array(gr.w * gr.h);
        rl.forEach((r) => B.paint(gr, r, mask));
        mask = B.morph(mask, gr.w, gr.h, -Math.round(m * B.RES));
        const shapes = B.maskToShapes(gr, mask, 2);
        if (!shapes.length) return;
        pushUndo();
        st.objects = st.objects.filter((o) => !o.knockdown);
        const ci = val('kdC') === 'fabric' ? addPaletteColor(st.fabric || '#ffffff', 'Knockdown') : st.curColor;
        const ko = shapes.map((sh) => makeObj('fill', {
          points: sh.outer.map((p) => ({ x: p.x, y: p.y })), holes: sh.holes.map((h) => h.map((p) => ({ x: p.x, y: p.y }))), color: ci, knockdown: true, autoFab: false,
          params: { ...S.DEFAULTS.fill, fillType: 'knock', spacing: Math.max(0.8, num('kdS') || 1.6), len: 4, angle: num('kdA') || 45, underlay: 'none', border: 'none', pull: 0 },
        }));
        st.objects.unshift(...ko);
        renderPalette(); changed();
      } }]);
  }

  // Kappe: von der Mitte nach außen und von unten nach oben sticken (verhindert Verzug und Falten)
  function capDialog() {
    modal('Für Kappe sortieren',
      '<p>Kappen werden <b>von der Mitte nach außen</b> und <b>von unten nach oben</b> gestickt, sonst schiebt sich der Stoff vor der Nadel zusammen. Die Objekte werden entsprechend sortiert, Säulen und Linien von unten nach oben gedreht.</p>' +
      field('Farbreihenfolge beibehalten', '<input type="checkbox" id="cpCol" checked>') +
      field('Kappenrahmen und Stoff „Kappe“ wählen', '<input type="checkbox" id="cpHoop" checked>'),
      [{ label: 'Abbrechen' }, { label: 'Sortieren', primary: true, action: () => { pushUndo(); capSort($('#cpCol').checked); if ($('#cpHoop').checked) { const ch = HW.hoops.all(st.customHoops).find((h) => /kappe|cap/i.test(h.id + h.name)); if (ch) st.hoop = ch.id; st.material = 'kappe'; st.objects.forEach(invalidate); renderHoopSel(); } changed(); } }]);
  }

  function capSort(keepColors) {
    const objs = st.objects;
    objs.forEach(ensure);
    const all = objs.filter((o) => o._bb);
    if (!all.length) return;
    const bb = { x0: Math.min(...all.map((o) => o._bb.x0)), x1: Math.max(...all.map((o) => o._bb.x1)) };
    const cx = (bb.x0 + bb.x1) / 2, W = bb.x1 - bb.x0 || 1;
    const key = (o) => {
      if (!o._bb) return [0, 0];
      const ox = (o._bb.x0 + o._bb.x1) / 2;
      // Bänder von der Mitte nach außen (je 1/6 der Breite), im Band von unten nach oben
      return [Math.floor(Math.abs(ox - cx) / (W / 6)), -o._bb.y1];
    };
    const colOrder = [];
    objs.forEach((o) => { if (!colOrder.includes(o.color)) colOrder.push(o.color); });
    // Applikationen bleiben zusammen und in ihrer Reihenfolge (Platzierung → Heften → Abdeckung)
    const grpKey = {}, grpCol = {};
    objs.forEach((o) => { if (o.applPart && !grpKey[o.grp]) { grpKey[o.grp] = key(o); grpCol[o.grp] = o.color; } });
    const sorted = objs.map((o, i) => ({ o, i, k: o.applPart ? grpKey[o.grp] : key(o), c: keepColors ? colOrder.indexOf(o.applPart ? grpCol[o.grp] : o.color) : 0 }))
      .sort((a, b) => (a.o.knockdown ? -1 : 0) - (b.o.knockdown ? -1 : 0) || a.c - b.c || a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.i - b.i)
      .map((x) => x.o);
    // Säulen und offene Linien von unten nach oben
    sorted.forEach((o) => {
      if (o.applPart || !o.points || o.points.length < 2) return;
      const n = o.points.length;
      if (o.type === 'colA' && n >= 4) {
        const y0 = (o.points[0].y + o.points[1].y) / 2, y1 = (o.points[n - 2].y + o.points[n - 1].y) / 2;
        if (y0 < y1 - 0.5) { o.points = HW.satinauto.reverseColA(o.points); }
        o.fixedDir = true;
      } else if ((o.type === 'run' && !o.params.closed) || (o.type === 'colC' && !o.params.closed)) {
        if (o.points[0].y < o.points[n - 1].y - 0.5) o.points = o.points.slice().reverse();
        o.fixedDir = true;
      } else if (o.type === 'colB' && o.side2) {
        if (o.points[0].y < o.points[n - 1].y - 0.5) { o.points = o.points.slice().reverse(); o.side2 = o.side2.slice().reverse(); }
        o.fixedDir = true;
      }
      invalidate(o);
    });
    st.objects = sorted;
    st.settings.capMode = true;
  }

  function threadBrandDialog() {
    const br = st.threadBrand || brands()[0];
    modal('Garnmarke zuordnen',
      field('Garnmarke', `<select id="tbBrand">${brands().map((b) => `<option ${b === br ? 'selected' : ''}>${b}</option>`).join('')}</select>`) +
      field('Neue Farben (Import, Auto-Digitalisieren) automatisch zuordnen', `<input type="checkbox" id="tbAuto" ${st.threadAuto !== false ? 'checked' : ''}>`) +
      '<div id="tbPrev"></div>',
      [{ label: 'Abbrechen' }, { label: 'Allen Farben zuordnen', primary: true, action: () => {
        pushUndo();
        st.threadBrand = val('tbBrand'); st.threadAuto = $('#tbAuto').checked;
        st.palette.forEach((c) => { const t = nearestThread(c.hex, st.threadBrand); if (t) applyThread(c, t); });
        renderPalette(); changed();
      } }]);
    const prev = () => {
      const b = val('tbBrand');
      $('#tbPrev').innerHTML = '<table class="tbtab">' + st.palette.map((c) => { const t = nearestThread(c.hex, b); return `<tr><td><span class="sw2" style="background:${c.hex}"></span></td><td>${String(c.name).replace(/</g, '&lt;')}</td><td>→</td><td><span class="sw2" style="background:${t.hex}"></span></td><td>${t.code} ${t.name}</td><td style="color:${t.dE < 5 ? '#2e7d32' : t.dE < 12 ? '#b26a00' : '#c62828'}">ΔE ${t.dE.toFixed(1)}</td></tr>`; }).join('') + '</table><p style="color:#6a7480">ΔE = Farbabstand (unter 5 kaum sichtbar, über 12 deutlich).</p>';
    };
    $('#tbBrand').onchange = prev; prev();
  }


  /* ---------- Schrift ---------- */
  const SYS_FONTS = ['Arial', 'Arial Black', 'Verdana', 'Georgia', 'Times New Roman', 'Impact', 'Comic Sans MS', 'Segoe Script', 'Brush Script MT'];
  const fontFamily = (name) => (HW.FONTS || []).some((f) => f.name === name) ? `"SS ${name}"` : `"${name}"`;
  const fontsReady = Promise.all((HW.FONTS || []).map((f) => {
    try {
      const bin = atob(f.data), buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      const ff = new FontFace('SS ' + f.name, buf.buffer);
      document.fonts.add(ff);
      return ff.load().catch(() => null);
    } catch (e) { return null; }
  }));

  // Text in eine Pixelmaske zeichnen. Rückgabe {img, res, wMM, hMM}
  function renderText(spec, forceRes) {
    const c = document.createElement('canvas'), x = c.getContext('2d');
    const fam = fontFamily(spec.font);
    const style = `${spec.italic ? 'italic ' : ''}${spec.bold ? 'bold ' : ''}`;
    x.font = `${style}100px ${fam}`;
    const mH = x.measureText('H');
    const capRatio = (mH.actualBoundingBoxAscent || 70) / 100;
    const lines = spec.text.split('\n');
    const longest = Math.max(...lines.map((l) => l.length), 1);
    // Auflösung: fein genug für saubere Mittellinien, Leinwand begrenzt
    let res = forceRes || Math.max(6, Math.min(16, 2600 / Math.max(1, spec.height * 0.7 * longest + 10)));
    const fontPx = (spec.height * res) / capRatio;
    const font = `${style}${fontPx}px ${fam}`;
    x.font = font;
    const sp = ((spec.spacing || 0) / 100) * fontPx;
    const adv = (ch) => x.measureText(ch).width + sp;
    const glyphs = [];
    const lineH = fontPx * 1.25 * (spec.lineGap || 1);
    if (spec.arc && lines.length === 1) {
      const R = Math.abs(spec.arc) * res, top = spec.arc > 0;
      const chars = [...lines[0]];
      const W = chars.reduce((a, ch) => a + adv(ch), 0) - sp;
      let s = 0;
      for (const ch of chars) {
        const a = adv(ch), th = (s + (a - sp) / 2 - W / 2) / R;
        s += a;
        if (top) glyphs.push({ ch, x: R * Math.sin(th), y: -R * Math.cos(th), rot: th });
        else glyphs.push({ ch, x: -R * Math.sin(th) * -1, y: R * Math.cos(th) + fontPx * capRatio, rot: -th });
      }
      let gi = 0;
      for (const gl of glyphs) gl.gi = gl.ch.trim() ? gi++ : -1;
    } else {
      const kadj = spec.kernAdj || {};
      let gi = 0;
      lines.forEach((l, li) => {
        const chars = [...l];
        // Abstände von Hand (mm) je Zeichen vorab bestimmen, damit die Zeile mittig bleibt
        let g2 = gi, extraW = 0;
        for (const ch of chars) if (ch.trim()) extraW += (kadj[g2++] || 0) * res;
        const W = chars.reduce((a, ch) => a + adv(ch), 0) - sp + extraW;
        let s = -W / 2;
        for (const ch of chars) {
          if (ch.trim()) s += (kadj[gi] || 0) * res;
          const a = adv(ch);
          glyphs.push({ ch, x: s + (a - sp) / 2, y: li * lineH, rot: 0, gi: ch.trim() ? gi++ : -1 });
          s += a;
        }
      });
    }
    // Ausdehnung bestimmen
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const gl of glyphs) {
      const hw = adv(gl.ch) / 2 + fontPx * 0.3, up = fontPx * 1.05, dn = fontPx * 0.4;
      for (const [dx, dy] of [[-hw, -up], [hw, -up], [hw, dn], [-hw, dn]]) {
        const px = gl.x + dx * Math.cos(gl.rot) - dy * Math.sin(gl.rot), py = gl.y + dx * Math.sin(gl.rot) + dy * Math.cos(gl.rot);
        x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
      }
    }
    c.width = Math.min(6000, Math.ceil(x1 - x0 + 8));
    c.height = Math.min(6000, Math.ceil(y1 - y0 + 8));
    x.font = font; x.fillStyle = '#000'; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    for (const gl of glyphs) {
      x.save();
      x.translate(gl.x - x0 + 4, gl.y - y0 + 4);
      x.rotate(gl.rot);
      x.fillText(gl.ch, 0, 0);
      x.restore();
    }
    // zu große Flächen (z. B. Text im Bogen) mit geringerer Auflösung neu zeichnen
    const MAXPX = 1.6e6;
    if (!forceRes && c.width * c.height > MAXPX) return renderText(spec, Math.max(4, res * Math.sqrt(MAXPX / (c.width * c.height))));
    // Zeichenmitten (mm, Bildkoordinaten) – damit digitalisierte Teile ihrem Buchstaben zugeordnet werden können
    const capPx = fontPx * capRatio;
    const centers = glyphs.filter((gl) => gl.gi >= 0).map((gl) => ({ gi: gl.gi, ch: gl.ch, x: (gl.x + (capPx / 2) * Math.sin(gl.rot) - x0 + 4) / res, y: (gl.y - (capPx / 2) * Math.cos(gl.rot) - y0 + 4) / res }));
    return { img: x.getImageData(0, 0, c.width, c.height), res, wMM: c.width / res, hMM: c.height / res, canvas: c, centers };
  }

  function digitizeText(spec, center) {
    const r = renderText(spec);
    const out = HW.auto.autoDigitize(r.img, {
      colors: 1, widthMM: r.wMM, originX: center.x - r.wMM / 2, originY: center.y - r.hMM / 2,
      minAreaMM2: 0.15, removeBg: false, mode: spec.type, satinMax: 8, simplify: 0.45, angle: 45,
    });
    // jedes Teil dem nächstliegenden Buchstaben zuordnen
    const ox = center.x - r.wMM / 2, oy = center.y - r.hMM / 2;
    out.objects.forEach((o) => {
      const b = G.bbox(o.points), mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2;
      let best = null, bd = Infinity;
      for (const c of r.centers) { const d = Math.hypot(ox + c.x - mx, (oy + c.y - my) * 0.5); if (d < bd) { bd = d; best = c; } }
      if (best) { o.gi = best.gi; o.gch = best.ch; }
    });
    return out.objects;
  }

  let nextGrp = 1;
  let fontsLoaded = false;
  fontsReady.then(() => { fontsLoaded = true; });
  const isInk = (f) => String(f).startsWith('ink:');
  const inkIdx = (f) => (HW.INKFONT_INDEX || []).find((x) => 'ink:' + x.id === f);

  // Text mit fertig digitalisierter Schrift setzen (Objekte relativ zu center)
  function inkText(spec, center) {
    const font = HW.INKFONTS[spec.font.slice(4)];
    const r = HW.layoutInkText(font, spec);
    const objs = r.objects;
    if (!objs.length) return r;
    const bb = G.bbox(objs.flatMap((o) => o.points));
    const dx = center.x - (bb.x0 + bb.x1) / 2, dy = center.y - (bb.y0 + bb.y1) / 2;
    objs.forEach((o) => [o.points, ...(o.holes || [])].forEach((arr) => arr.forEach((q) => { q.x += dx; q.y += dy; })));
    return r;
  }

  // digitalisierte Buchstaben → Objekte des Designs
  function textObjects(objs, spec, color, gid) {
    return objs.map((o) => {
      const ob = makeObj(o.type, { points: o.points, holes: o.holes, color });
      if (o.gi !== undefined) { ob.gi = o.gi; ob.gch = o.gch; }
      const base = o.type === 'fill' ? st.defaults.fill : o.type === 'run' ? st.defaults.run : st.defaults.colA;
      ob.params = { ...base, ...o.params };
      if (o.type === 'fill' && !isInk(spec.font)) ob.params.underlay = o.params.fillType === 'satin' ? 'none' : 'edge';
      ob.grp = gid; ob.textSpec = spec;
      if (isInk(spec.font)) ob.fixedDir = true; // fertige Schriften: Stichreihenfolge der Digitalisierer beibehalten
      return ob;
    });
  }

  // Einzelbuchstaben, Hüllform, Text auf Linie – nach dem Setzen, Mitte bleibt erhalten (außer auf Linie)
  function textEffects(objs, spec, center) {
    const T = HW.textfx;
    if (!objs.length) return objs;
    T.glyphAdjust(objs, spec.glyphAdj);
    if (spec.envelope && spec.envelope !== 'none') T.envelope(objs, spec.envelope, spec.envAmount || 5);
    if (spec.path && spec.path.length > 1) T.onPath(objs, spec.path, spec.pathSide || 1, spec.pathAlign || 'center', spec.pathOffset || 0);
    else if (center && (spec.glyphAdj || (spec.envelope && spec.envelope !== 'none'))) {
      const b = T.bbOf(objs), dx = center.x - (b.x0 + b.x1) / 2, dy = center.y - (b.y0 + b.y1) / 2;
      objs.forEach((o) => [o.points, ...(o.holes || [])].forEach((a) => a.forEach((p) => { p.x += dx; p.y += dy; })));
    }
    return objs;
  }

  // Text neu setzen (gleiche Mitte), Schrift muss geladen sein
  function buildText(spec, center, color, gid) {
    const objs = isInk(spec.font) ? inkText(spec, center).objects : digitizeText(spec, center);
    return textObjects(textEffects(objs, spec, center), spec, color, gid);
  }
  function fontReady(spec) {
    if (isInk(spec.font)) return HW.INKFONTS[spec.font.slice(4)] ? Promise.resolve() : HW.loadInkFont(spec.font.slice(4));
    return fontsReady;
  }

  // Textgruppe mit geänderten Einstellungen neu setzen
  function rebuildText(grp, change) {
    const old = st.objects.filter((o) => o.grp === grp);
    if (!old.length || !old[0].textSpec) return Promise.resolve();
    const spec = { ...old[0].textSpec, ...change };
    return fontReady(spec).then(() => {
      const bb = bbOfObjs(old);
      const center = { x: (bb.x0 + bb.x1) / 2, y: (bb.y0 + bb.y1) / 2 };
      const made = buildText(spec, center, old[0].color, grp);
      if (!made.length) return;
      pushUndo();
      const at = st.objects.indexOf(old[0]);
      st.objects = st.objects.filter((o) => o.grp !== grp);
      st.objects.splice(Math.min(at, st.objects.length), 0, ...made);
      sel = new Set(made.map((o) => o.id));
      changed();
    });
  }

  // Einzelne Buchstaben verschieben, drehen, vergrößern; Abstand vor jedem Buchstaben (Kerning)
  function glyphDialog(grp) {
    const objs = st.objects.filter((o) => o.grp === grp);
    const spec = objs[0].textSpec;
    const chars = [...String(spec.text)].filter((c) => c.trim());
    const A = spec.glyphAdj || {}, K = spec.kernAdj || {};
    const inp = (id, v, step) => `<input id="${id}" type="number" step="${step}" value="${v}" style="width:62px">`;
    const rows = chars.map((ch, i) => `<tr><td style="font-size:18px;font-weight:600;text-align:center">${ch.replace(/</g, '&lt;')}</td>
      <td>${inp('gk' + i, K[i] || 0, 0.1)}</td><td>${inp('gx' + i, (A[i] || {}).dx || 0, 0.1)}</td><td>${inp('gy' + i, -((A[i] || {}).dy || 0), 0.1)}</td>
      <td>${inp('gr' + i, (A[i] || {}).rot || 0, 1)}</td><td>${inp('gs' + i, (A[i] || {}).scale || 100, 5)}</td></tr>`).join('');
    modal('Buchstaben einzeln anpassen',
      `<div style="max-height:50vh;overflow:auto"><table class="help"><tr><th></th><th>Abstand davor (mm)</th><th>X (mm)</th><th>Y (mm)</th><th>Drehen (°)</th><th>Größe (%)</th></tr>${rows}</table></div>` +
      '<p style="color:#6a7480">„Abstand davor“ schiebt den Buchstaben und alle folgenden (Kerning). X/Y verschieben nur diesen Buchstaben (Y nach oben positiv).</p>',
      [{ label: 'Alles zurücksetzen', action: () => { rebuildText(grp, { glyphAdj: null, kernAdj: null }); } }, { label: 'Abbrechen' },
        { label: 'Übernehmen', primary: true, action: () => {
          const ga = {}, ka = {};
          chars.forEach((ch, i) => {
            const k = num('gk' + i) || 0, dx = num('gx' + i) || 0, dy = -(num('gy' + i) || 0), rot = num('gr' + i) || 0, sc = num('gs' + i) || 100;
            if (k) ka[i] = k;
            if (dx || dy || rot || sc !== 100) ga[i] = { dx, dy, rot, scale: sc };
          });
          rebuildText(grp, { glyphAdj: Object.keys(ga).length ? ga : null, kernAdj: Object.keys(ka).length ? ka : null });
        } }]);
  }

  // Text an eine Linie (Laufstich oder Satinlinie) legen
  function textOnPathDialog() {
    const objs = selected();
    const txt = objs.find((o) => o.textSpec);
    const line = objs.find((o) => !o.textSpec && (o.type === 'run' || o.type === 'colC') && o.points.length > 1);
    if (!txt || !line) return modal('Text auf Linie', '<p>Bitte einen <b>Text</b> und eine <b>Linie</b> (Laufstich oder Satinlinie, z. B. ein Bogen oder ein Kreis) gemeinsam auswählen (Shift+Klick).</p>');
    modal('Text auf Linie setzen',
      field('Seite', '<select id="opSide"><option value="1">über der Linie</option><option value="-1">unter der Linie</option></select>') +
      field('Ausrichtung', '<select id="opAl"><option value="center">mittig</option><option value="start">am Anfang</option><option value="end">am Ende</option></select>') +
      field('Verschieben entlang der Linie (mm)', '<input id="opOff" type="number" value="0" step="1">') +
      field('Linie danach', '<select id="opLine"><option value="hide">ausblenden (nicht sticken)</option><option value="keep">mitsticken</option><option value="del">löschen</option></select>') +
      '<p style="color:#6a7480">Tipp: Linie mit Rechtsklick-Kurvenpunkten zeichnen. Die Linie wird im Text gespeichert – Text bleibt danach bearbeitbar.</p>',
      [{ label: 'Abbrechen' }, { label: 'Setzen', primary: true, action: () => {
        const closed = line.type === 'run' && line.params.closed;
        let path = G.buildPath(line.points, closed).pts.map((p) => ({ x: p.x, y: p.y }));
        if (closed) path = path.concat([path[0]]);
        const what = val('opLine');
        rebuildText(txt.grp, { path, pathSide: +val('opSide'), pathAlign: val('opAl'), pathOffset: num('opOff') || 0, arc: 0 }).then(() => {
          if (what === 'hide') line.hidden = true;
          if (what === 'del') st.objects = st.objects.filter((o) => o !== line);
          changed();
        });
      } }]);
  }

  // Monogramm-Vorlagen
  function monogramDialog() {
    const inks = HW.INKFONT_INDEX || [];
    const pref = inks.filter((f) => f.keywords.includes('monogram')).concat(inks.filter((f) => !f.keywords.includes('monogram') && f.keywords.includes('serif')));
    modal('Monogramm',
      field('Initialen (2–3 Buchstaben)', '<input id="mnT" value="ABC" maxlength="3">') +
      field('Vorlage', '<select id="mnK"><option value="classic">Klassisch – Mitte groß</option><option value="circle">Im Kreis</option><option value="diamond">In Raute</option><option value="lines">Gleich groß mit Linien</option><option value="plain">Gleich groß</option></select>') +
      field('Schrift', `<select id="mnF">${pref.concat(inks.filter((f) => !pref.includes(f))).map((f) => `<option value="ink:${f.id}">${f.name}</option>`).join('')}</select>`) +
      field('Höhe (mm)', '<input id="mnH" type="number" value="25" min="8" max="150">') +
      field('Rahmen-Breite (mm)', '<input id="mnW" type="number" value="2.5" min="0.8" max="8" step="0.1">'),
      [{ label: 'Abbrechen' }, { label: 'Erstellen', primary: true, action: () => {
        const text = val('mnT').trim().slice(0, 3);
        if (!text) return false;
        const kind = val('mnK'), H = Math.max(8, num('mnH') || 25), fw = Math.max(0.8, num('mnW') || 2.5);
        const n = [...text].length;
        const spec = { text, font: val('mnF'), height: H, spacing: 0, arc: 0, type: 'satin', bold: false, italic: false, envelope: 'none', envAmount: 0 };
        if ((kind === 'classic' || kind === 'circle' || kind === 'diamond') && n === 3) {
          spec.glyphAdj = { 0: { scale: 70 }, 2: { scale: 70 } };
          spec.kernAdj = { 1: H * 0.12, 2: H * 0.12 };
        }
        fontReady(spec).then(() => {
          const gid = nextGrp++;
          const made = buildText(spec, { x: 0, y: 0 }, st.curColor, gid);
          if (!made.length) return;
          pushUndo();
          const b = HW.textfx.bbOf(made), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, w = b.x1 - b.x0, h = b.y1 - b.y0;
          const frame = [];
          const fg = nextGrp++;
          const col = (pts, closed) => makeObj('colC', { points: pts, color: st.curColor, grp: fg, params: { ...S.DEFAULTS.satin, ...st.defaults.colC, width: fw, closed } });
          if (kind === 'circle') {
            const R = Math.hypot(w, h) / 2 + fw + 3;
            frame.push(col(Array.from({ length: 16 }, (_, i) => ({ x: cx + R * Math.cos((i / 16) * 2 * Math.PI), y: cy + R * Math.sin((i / 16) * 2 * Math.PI), c: true })), true));
          } else if (kind === 'diamond') {
            const a = w / 2 + h / 2 + fw + 4;
            frame.push(col([{ x: cx, y: cy - a }, { x: cx + a, y: cy }, { x: cx, y: cy + a }, { x: cx - a, y: cy }], true));
          } else if (kind === 'lines') {
            const L = w / 2 + 6;
            for (const yy of [b.y0 - fw - 2.5, b.y1 + fw + 2.5]) frame.push(col([{ x: cx - L, y: yy }, { x: cx + L, y: yy }], false));
          }
          st.objects.push(...made, ...frame);
          sel = new Set([...made, ...frame].map((o) => o.id));
          changed();
        });
      } }]);
  }

  function textDialog(p, editGrp) {
    const old = editGrp ? st.objects.filter((o) => o.grp === editGrp) : [];
    const firstInk = (HW.INKFONT_INDEX || [])[0];
    const spec0 = (old[0] && old[0].textSpec) || { text: 'Text', font: firstInk ? 'ink:' + firstInk.id : 'Anton', bold: false, italic: false, height: firstInk ? +firstInk.size : 15, spacing: 0, arc: 0, type: 'satin' };
    const kw = { handwriting: 'Schreibschrift', sans_serif: 'serifenlos', serif: 'Serifen', display: 'Deko', satin: 'Satin', tiny: 'klein', italic: 'kursiv', running_stitch: 'Laufstich', monogram: 'Monogramm' };
    const inkOpts = (HW.INKFONT_INDEX || []).map((f) => {
      const tags = f.keywords.filter((k) => kw[k] && k !== 'satin').map((k) => kw[k]).join(', ');
      return `<option value="ink:${f.id}" ${'ink:' + f.id === spec0.font ? 'selected' : ''}>${f.name}${tags ? ' – ' + tags : ''} (${f.size} mm)</option>`;
    }).join('');
    const fonts = (HW.FONTS || []).map((f) => `<option value="${f.name}" ${f.name === spec0.font ? 'selected' : ''}>${f.name} – ${f.cat}</option>`).join('');
    const sys = SYS_FONTS.map((f) => `<option value="${f}" ${f === spec0.font ? 'selected' : ''}>${f}</option>`).join('');
    const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    modal(editGrp ? 'Text bearbeiten' : 'Text einfügen',
      field('Text', `<textarea id="tText" rows="2" style="width:100%">${esc(spec0.text)}</textarea>`) +
      field('Schriftart', `<select id="tFont">${inkOpts ? `<optgroup label="Stickschriften – fertig digitalisiert (Ink/Stitch)">${inkOpts}</optgroup>` : ''}<optgroup label="Schriften – automatisch in Satin umgewandelt">${fonts}</optgroup><optgroup label="Systemschriften">${sys}</optgroup></select>`) +
      '<p id="tInfo" style="color:#6a7480;margin:2px 0 6px"></p>' +
      field('Höhe Großbuchstaben (mm)', `<input id="tH" type="number" step="0.5" min="3" max="300" value="${spec0.height}">`) +
      field('Zeichenabstand (%)', `<input id="tSp" type="number" step="1" min="-30" max="100" value="${spec0.spacing}">`) +
      field('Bogen-Radius (mm, 0 = gerade, negativ = unten)', `<input id="tArc" type="number" step="5" value="${spec0.arc}">`) +
      field('Hüllform', `<select id="tEnv">${HW.textfx.ENVELOPES.map(([k, t]) => `<option value="${k}" ${k === (spec0.envelope || 'none') ? 'selected' : ''}>${t}</option>`).join('')}</select>`) +
      field('Stärke der Hüllform (mm)', `<input id="tEnvA" type="number" step="0.5" value="${spec0.envAmount ?? 5}">`) +
      (spec0.path ? field('Text liegt auf einer Linie', `<select id="tPath"><option value="keep">beibehalten</option><option value="drop">von der Linie lösen</option></select>`) : '') +
      `<div id="tTtf">` +
      field('Stichart', `<select id="tType"><option value="satin">Satin – folgt Kurven und Bögen</option><option value="auto">Automatisch (breite Teile Tatami)</option><option value="tatami">Tatami</option></select>`) +
      field('Fett (künstlich)', `<input type="checkbox" id="tBold" ${spec0.bold ? 'checked' : ''}>`) +
      field('Kursiv (künstlich)', `<input type="checkbox" id="tItalic" ${spec0.italic ? 'checked' : ''}>`) +
      `</div>` +
      '<canvas id="tPrev" width="500" height="120" style="width:100%;background:#fff"></canvas>' +
      '<p style="color:#6a7480">Doppelklick auf den Text öffnet diesen Dialog wieder. Mit <i>In Einzelstiche umwandeln</i> lässt sich jeder Stich anpassen.</p>',
      [{ label: 'Abbrechen' }, { label: editGrp ? 'Übernehmen' : 'Einfügen', primary: true, action: () => {
        const spec = readSpec();
        if (!spec.text.trim()) return false;
        let center = p, color = st.curColor, at = st.objects.length;
        if (editGrp && old.length) {
          const bb = G.bbox(old.flatMap((o) => { ensure(o); return o._bb ? [{ x: o._bb.x0, y: o._bb.y0 }, { x: o._bb.x1, y: o._bb.y1 }] : []; }));
          center = { x: (bb.x0 + bb.x1) / 2, y: (bb.y0 + bb.y1) / 2 };
          color = old[0].color;
          at = st.objects.indexOf(old[0]);
        }
        let objs;
        if (isInk(spec.font)) {
          const id = spec.font.slice(4);
          if (!HW.INKFONTS[id]) { HW.loadInkFont(id).then(() => $('#modalBtns .primary').click()); return false; }
          objs = inkText(spec, center).objects;
        } else {
          if (!fontsLoaded) { fontsReady.then(() => { fontsLoaded = true; $('#modalBtns .primary').click(); }); return false; }
          objs = digitizeText(spec, center);
        }
        textEffects(objs, spec, center);
        if (!objs.length) return false;
        pushUndo();
        if (editGrp) st.objects = st.objects.filter((o) => o.grp !== editGrp);
        const gid = editGrp || nextGrp++;
        const made = textObjects(objs, spec, color, gid);
        st.objects.splice(Math.min(at, st.objects.length), 0, ...made);
        sel = new Set(made.map((o) => o.id));
        setTool('select');
        changed();
      } }]);
    $('#tType').value = spec0.type;
    const readSpec = () => ({
      text: val('tText'), font: val('tFont'), bold: $('#tBold').checked, italic: $('#tItalic').checked,
      height: Math.max(2, num('tH') || 15), spacing: num('tSp') || 0, arc: num('tArc') || 0, type: val('tType'),
      envelope: val('tEnv'), envAmount: num('tEnvA') || 0,
      glyphAdj: spec0.glyphAdj, kernAdj: spec0.kernAdj,
      ...(spec0.path && (!$('#tPath') || val('tPath') === 'keep') ? { path: spec0.path, pathSide: spec0.pathSide, pathAlign: spec0.pathAlign, pathOffset: spec0.pathOffset } : {}),
    });
    let lastFont = val('tFont');
    const prev = () => {
      const c = $('#tPrev');
      if (!c) return;
      const x = c.getContext('2d');
      const spec = readSpec();
      const ink = isInk(spec.font);
      $('#tTtf').style.display = ink ? 'none' : '';
      // bei Schriftwechsel empfohlene Größe übernehmen
      if (ink && spec.font !== lastFont && inkIdx(spec.font)) { $('#tH').value = inkIdx(spec.font).size; spec.height = +inkIdx(spec.font).size; }
      lastFont = spec.font;
      const info = $('#tInfo');
      if (ink) {
        const f = inkIdx(spec.font);
        const miss = [...new Set([...spec.text].filter((ch) => ch.trim() && f && !f.chars.includes(ch) && !f.chars.includes(ch.toUpperCase()) && !f.chars.includes(ch.toLowerCase())))];
        info.innerHTML = f ? `Fertig digitalisiert · Lizenz ${f.license} · empfohlen ca. ${f.size} mm` + (miss.length ? ` · <b style="color:#c62828">fehlt: ${esc(miss.join(' '))}</b>` : '') : '';
      } else info.textContent = 'Wird beim Einfügen automatisch in Satinsäulen umgewandelt.';
      x.clearRect(0, 0, c.width, c.height);
      if (!spec.text.trim()) return;
      if (ink) {
        const id = spec.font.slice(4);
        if (!HW.INKFONTS[id]) { x.fillStyle = '#888'; x.fillText('Schrift wird geladen …', 10, 20); HW.loadInkFont(id).then(prev).catch(() => {}); return; }
        const r = inkText(spec, { x: 0, y: 0 });
        const pts = r.objects.flatMap((o) => o.points);
        if (!pts.length) return;
        const bb = G.bbox(pts);
        const sc = Math.min((c.width - 10) / Math.max(1, bb.x1 - bb.x0), (c.height - 10) / Math.max(1, bb.y1 - bb.y0));
        const tx = (q) => (q.x - (bb.x0 + bb.x1) / 2) * sc + c.width / 2, ty = (q) => (q.y - (bb.y0 + bb.y1) / 2) * sc + c.height / 2;
        x.strokeStyle = '#222'; x.lineWidth = Math.max(0.6, sc * 0.3);
        for (const o of r.objects) {
          let stt = [];
          try { stt = S.generate({ ...o, params: { ...(o.type === 'fill' ? S.DEFAULTS.fill : S.DEFAULTS.satin), ...o.params, underlay: 'none' } }); } catch (e) { stt = []; }
          x.beginPath();
          stt.forEach((q, i) => (i && !q.j ? x.lineTo(tx(q), ty(q)) : x.moveTo(tx(q), ty(q))));
          x.stroke();
        }
        return;
      }
      const r = renderText({ ...spec, height: 10 });
      const sc = Math.min((c.width - 10) / r.canvas.width, (c.height - 10) / r.canvas.height);
      x.drawImage(r.canvas, (c.width - r.canvas.width * sc) / 2, (c.height - r.canvas.height * sc) / 2, r.canvas.width * sc, r.canvas.height * sc);
    };
    ['tText', 'tFont', 'tSp', 'tArc', 'tBold', 'tItalic', 'tH'].forEach((id) => $('#' + id).addEventListener('input', prev));
    fontsReady.then(prev);
  }


  /* ---------- Stickrahmen ---------- */
  function hoopOptions(selId) {
    const groups = {};
    HW.hoops.all(st.customHoops).forEach((h) => { (groups[h.group] = groups[h.group] || []).push(h); });
    return Object.entries(groups).map(([gname, list]) => `<optgroup label="${gname}">${list.map((h) => `<option value="${h.id}" ${h.id === selId ? 'selected' : ''}>${h.name}</option>`).join('')}</optgroup>`).join('');
  }
  function renderHoopSel() {
    const sel = $('#hoopSel');
    sel.innerHTML = hoopOptions(st.hoop);
    sel.value = st.hoop;
  }
  function setHoop(id) { st.hoop = id; renderHoopSel(); changed(true); zoomHoop(); }
  function saveCustomHoops() { HW.hoops.saveCustom(st.customHoops); renderHoopSel(); }

  function hoopDialog() {
    const pts = cmds.filter((c) => c.cmd === 'stitch');
    const h = hoop();
    const chk = pts.length ? HW.hoops.check(h, pts) : { ok: true };
    const s = D.stats(cmds);
    const fits = HW.hoops.fitting(pts, st.customHoops);
    const scale = pts.length ? HW.hoops.fitScale(h, pts) : 1;
    const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const custom = (st.customHoops || []).map((c) => `<div class="row" style="align-items:center"><span style="flex:1">${esc(c.name)} – ${c.shape === 'rect' ? 'eckig' : c.shape === 'round' ? 'rund' : 'oval'} ${c.shape === 'round' ? 'Ø ' + c.w : c.w + ' × ' + c.h} mm</span><button data-use="${c.id}">Wählen</button><button data-del="${c.id}">Löschen</button></div>`).join('') || '<p style="color:#6a7480">Noch keine eigenen Rahmen.</p>';
    modal('Stickrahmen',
      field('Aktiver Rahmen', `<select id="hSel">${hoopOptions(st.hoop)}</select>`) +
      (pts.length ? `<p>Design: <b>${fmt(s.w)} × ${fmt(s.h)} mm</b> · ${chk.ok ? '<span style="color:#2e7d32">✓ passt in diesen Rahmen</span>' : `<span style="color:#c62828">⚠ ${chk.outField ? chk.outField + ' Stiche außerhalb des Stickfelds' : chk.outMargin + ' Stiche im Sicherheitsabstand'}</span>`}</p>` +
        `<p>Passende Rahmen: ${fits.length ? fits.slice(0, 6).map((f) => `<button data-use="${f.id}" style="margin:2px">${esc(f.name)}</button>`).join('') : 'keiner – Design verkleinern'}</p>` +
        `<div class="row"><button id="hCenter">Design in Rahmenmitte setzen</button><button id="hFit" ${h.shape === 'none' ? 'disabled' : ''}>In Rahmen einpassen (${Math.round(scale * 100)} %)</button></div>` : '<p style="color:#6a7480">Noch kein Design vorhanden.</p>') +
      '<h3 style="margin:14px 0 4px;font-size:14px">Eigenen Rahmen anlegen</h3>' +
      field('Name', '<input id="hName" placeholder="z. B. Mein Rundrahmen 20 cm">') +
      field('Form', '<select id="hShape"><option value="round">rund</option><option value="rect">eckig</option><option value="oval">oval</option></select>') +
      field('Breite bzw. Durchmesser (mm)', '<input id="hW" type="number" min="20" max="1500" value="200">') +
      field('Höhe (mm, nur eckig/oval)', '<input id="hH" type="number" min="20" max="1500" value="200">') +
      field('Sicherheitsabstand zum Rand (mm)', '<input id="hM" type="number" min="0" max="50" step="0.5" value="5">') +
      '<div class="row"><button id="hAdd" class="primary">Rahmen anlegen</button></div>' +
      '<h3 style="margin:14px 0 4px;font-size:14px">Eigene Rahmen</h3>' + custom +
      '<p style="color:#6a7480">Maße = nutzbares Stickfeld. Die Werte der Standardrahmen sind Richtwerte – bei abweichendem Rahmen einen eigenen anlegen. Eigene Rahmen werden im Browser und im Projekt gespeichert. Die DST-Datei bezieht sich auf die Designmitte: an der Maschine die Rahmenmitte anfahren.</p>',
      [{ label: 'Schließen', primary: true }]);
    $('#hSel').onchange = () => { setHoop(val('hSel')); closeModal(); hoopDialog(); };
    $('#modalBody').querySelectorAll('[data-use]').forEach((b) => (b.onclick = () => { setHoop(b.dataset.use); closeModal(); hoopDialog(); }));
    $('#modalBody').querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => {
      st.customHoops = st.customHoops.filter((c) => c.id !== b.dataset.del);
      if (st.hoop === b.dataset.del) st.hoop = '290x290';
      saveCustomHoops(); changed(true); closeModal(); hoopDialog();
    }));
    const shp = $('#hShape');
    shp.onchange = () => { $('#hH').disabled = shp.value === 'round'; };
    shp.onchange();
    $('#hAdd').onclick = () => {
      const w = num('hW'), hh = shp.value === 'round' ? w : num('hH');
      if (!(w >= 20) || !(hh >= 20)) return;
      const shapeName = shp.value === 'round' ? `rund Ø ${w} mm` : `${shp.value === 'rect' ? 'eckig' : 'oval'} ${w} × ${hh} mm`;
      const c = { id: 'c_' + Date.now().toString(36), name: val('hName').trim() || 'Eigener Rahmen ' + shapeName, shape: shp.value, w, h: hh, margin: Math.max(0, num('hM') || 0) };
      st.customHoops = (st.customHoops || []).concat([c]);
      saveCustomHoops();
      setHoop(c.id);
      closeModal(); hoopDialog();
    };
    const hc = $('#hCenter');
    if (hc) hc.onclick = () => { closeModal(); const keep = sel; sel = new Set(st.objects.map((o) => o.id)); const c = selCenter(); transformSel((q) => ({ x: q.x - c.x, y: q.y - c.y })); sel = keep; changed(true); hoopDialog(); };
    const hf = $('#hFit');
    if (hf) hf.onclick = () => { closeModal(); fitToHoop(); };
  }

  /* ---------- An Rahmen anpassen ---------- */
  // Skaliert das Design (oder die Auswahl) so, dass es das Stickfeld des Rahmens ausfüllt, und setzt es in die Mitte.
  // Die Stiche werden danach aus den Formen neu berechnet (Dichte, Länge, Zugausgleich, Unterlage passen sich an).
  function fitToHoop() {
    const h = hoop();
    if (h.shape === 'none') return modal('An Rahmen anpassen', '<p>Bitte zuerst einen Rahmen wählen (oben in der Leiste).</p>');
    const targets = (sel.size ? selected() : st.objects).filter((o) => !o.hidden);
    // nur ein Vorlagenbild vorhanden -> Bild einpassen
    if (!targets.length) {
      if (!st.bg) return modal('An Rahmen anpassen', '<p>Es gibt noch nichts zum Anpassen. Bild einfügen, Text schreiben oder Formen zeichnen.</p>');
      const b = st.bg;
      const corners = [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x, y: b.y + b.h }, { x: b.x + b.w, y: b.y + b.h }];
      const f = HW.hoops.fitScale(h, h.shape === 'rect' ? corners : corners) * 0.98;
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      b.w *= f; b.h *= f; b.x = (b.x - cx) * f; b.y = (b.y - cy) * f;
      draw(); zoomHoop();
      return modal('Bild angepasst', `<p>Das Vorlagenbild wurde auf ${fmt(b.w)} × ${fmt(b.h)} mm gebracht und in die Rahmenmitte gesetzt. Jetzt nachzeichnen oder <i>Bild → Auto-Digitalisieren</i> – die Größe wird übernommen.</p>`);
    }
    targets.forEach(ensure);
    const ids = new Set(targets.map((o) => o.id));
    const pts = cmds.filter((c) => c.cmd === 'stitch' && ids.has(c.obj));
    if (!pts.length) return;
    const before = D.stats(cmds), bb = G.bbox(pts);
    const f = HW.hoops.fitScale(h, pts) * 0.995;
    const c = { x: (bb.x0 + bb.x1) / 2, y: (bb.y0 + bb.y1) / 2 };
    pushUndo();
    let manual = 0;
    for (const o of targets) {
      forEachPoint(o, (q) => { q.x = (q.x - c.x) * f; q.y = (q.y - c.y) * f; });
      // maßgebundene Werte mitskalieren
      if (o.type === 'colC' && o.params.width) o.params.width = +(o.params.width * f).toFixed(2);
      if (o.type === 'fill' && o.params.borderWidth) o.params.borderWidth = +(o.params.borderWidth * f).toFixed(2);
      if (o.type === 'manual') manual++;
      if (o.textSpec) o.textSpec = { ...o.textSpec, height: +(o.textSpec.height * f).toFixed(1) };
      invalidate(o);
    }
    // Vorlagenbild mitnehmen, wenn das ganze Design angepasst wird
    if (!sel.size && st.bg) { const b = st.bg; b.x = (b.x - c.x) * f; b.y = (b.y - c.y) * f; b.w *= f; b.h *= f; }
    pendingCheck.clear();
    changed();
    // Feinkorrektur: Zugausgleich/Satin skalieren nicht exakt mit -> bis zu 3x nachregeln
    let fTotal = f;
    for (let k = 0; k < 3; k++) {
      const p2 = cmds.filter((q) => q.cmd === 'stitch' && ids.has(q.obj));
      if (HW.hoops.check(h, p2).ok) break;
      const f2 = HW.hoops.fitScale(h, p2) * 0.99;
      const b2 = G.bbox(p2), c2 = { x: (b2.x0 + b2.x1) / 2, y: (b2.y0 + b2.y1) / 2 };
      for (const o of targets) {
        forEachPoint(o, (q) => { q.x = (q.x - c2.x) * f2; q.y = (q.y - c2.y) * f2; });
        if (o.type === 'colC' && o.params.width) o.params.width = +(o.params.width * f2).toFixed(2);
        invalidate(o);
      }
      fTotal *= f2;
      changed();
    }
    pendingCheck.clear();
    zoomHoop();
    const after = D.stats(cmds);
    const own = issues.filter((i) => ids.has(i.obj));
    const textH = targets.filter((o) => o.textSpec).map((o) => o.textSpec.height);
    const warn = [];
    if (manual) warn.push(`${manual} Objekt(e) aus Einzelstichen wurden nur skaliert – deren Stichabstände ändern sich mit (${Math.round(f * 100)} %).`);
    if (textH.length && Math.min(...textH) < 5) warn.push(`Schrift ist jetzt nur ${fmt(Math.min(...textH))} mm hoch – unter 5 mm wird Satin-Schrift unsauber.`);
    if (f > 1.6 && targets.some((o) => o.grp)) warn.push('Schrift stark vergrößert – breite Satinstriche werden geteilt; bei sehr breiten Strichen ggf. als Fläche sticken.');
    if (own.length) warn.push(`Stickprüfung: ${own.length} Hinweis(e) – unten in der Statusleiste ansehen.`);
    modal('An Rahmen angepasst',
      `<p>${sel.size ? 'Die Auswahl' : 'Das Design'} wurde auf <b>${Math.round(fTotal * 100)} %</b> skaliert und in die Mitte von „${h.name}“ gesetzt.</p>` +
      `<p>Größe: ${fmt(before.w)} × ${fmt(before.h)} mm → <b>${fmt(after.w)} × ${fmt(after.h)} mm</b><br>Stiche: ${before.stitches.toLocaleString('de-DE')} → <b>${after.stitches.toLocaleString('de-DE')}</b></p>` +
      `<p style="color:#4a525c">Die Stiche wurden aus den Formen neu berechnet: Dichte und Stichlängen bleiben gleich fein, Satin-Abstand, Zugausgleich und Unterlage richten sich nach der neuen Breite und dem Stoff (${HW.fabric.byId(st.material).name}), breite Satinstiche werden geteilt.</p>` +
      (warn.length ? `<p style="color:#b26a00">⚠ ${warn.join('<br>⚠ ')}</p>` : '<p style="color:#2e7d32">✓ Keine Probleme gefunden.</p>'),
      [{ label: 'Rückgängig', action: () => { undo(); } }, { label: 'OK', primary: true }]);
  }

  /* ---------- Formen verrechnen ---------- */
  let knifeStart = null;
  // ersetzt Objekt o durch die Formen shapes (gleiche Farbe/Parameter)
  function replaceWithShapes(o, shapes) {
    const idx = st.objects.indexOf(o);
    if (!shapes.length) { st.objects.splice(idx, 1); return []; }
    const made = shapes.map((sh, k) => {
      const ob = k === 0 ? o : { ...clone(o), id: nextId++ };
      ob.type = 'fill'; ob.points = sh.outer; ob.holes = sh.holes;
      delete ob.side2; delete ob.stitches;
      invalidate(ob);
      return ob;
    });
    st.objects.splice(idx, 1, ...made);
    return made;
  }

  function removeOverlaps(silent) {
    const objs = st.objects.filter((o) => !o.hidden);
    const scope = sel.size && !silent ? new Set(selected().map((o) => o.id)) : null;
    pushUndo();
    let cut = 0, gone = 0, split = 0;
    for (const o of objs.slice()) {
      if (o.type !== 'fill' || o.knockdown || o.appliquePart) continue;
      if (scope && !scope.has(o.id)) continue;
      const i = st.objects.indexOf(o);
      const cutters = st.objects.slice(i + 1).filter((q) => !q.hidden && !q.knockdown && ['fill', 'colA', 'colB', 'colC'].includes(q.type));
      const res = HW.boolean.subtract(o, cutters, st.settings.overlapKeep ?? 0.5);
      if (!res) continue;
      if (!res.length) gone++; else { cut++; if (res.length > 1) split += res.length - 1; }
      replaceWithShapes(o, res);
    }
    if (!cut && !gone) { undoStack.pop(); if (!silent) modal('Überlappungen entfernen', '<p>Keine überlappenden Flächen gefunden.</p>'); return; }
    sel = new Set([...sel].filter((id) => byId(id)));
    pendingCheck.clear(); changed(); pendingCheck.clear();
    modal('Überlappungen entfernt', `<p>${cut} Fläche(n) unter anderen Objekten ausgespart${split ? `, dabei ${split} zusätzliche Teilstück(e)` : ''}${gone ? `, ${gone} vollständig verdeckte Fläche(n) entfernt` : ''}.</p><p style="color:#6a7480">Unter den Rändern der oberen Objekte bleiben ${fmt(st.settings.overlapKeep ?? 0.5)} mm Überlappung, damit keine Lücken entstehen. Mit Strg+Z rückgängig.</p>`);
  }

  function combineSel(op) {
    const objs = selected().filter((o) => ['fill', 'colA', 'colB', 'colC'].includes(o.type));
    if (objs.length < 2) return modal('Formen verrechnen', '<p>Bitte mindestens zwei Formen (Flächen oder Säulen) auswählen.</p>');
    objs.sort((a, b) => st.objects.indexOf(a) - st.objects.indexOf(b));
    const res = HW.boolean.combine(objs, op);
    if (!res || !res.length) return modal('Formen verrechnen', '<p>Das Ergebnis ist leer – die Formen überschneiden sich nicht.</p>');
    pushUndo();
    const base = objs[0];
    if (base.type !== 'fill') { base.params = { ...st.defaults.fill }; }
    st.objects = st.objects.filter((o) => o === base || !objs.includes(o));
    const made = replaceWithShapes(base, res);
    sel = new Set(made.map((o) => o.id));
    changed();
  }

  function knifeCut(a, b) {
    let targets = selected().filter((o) => o.type === 'fill');
    if (!targets.length) targets = st.objects.filter((o) => o.type === 'fill' && !o.hidden);
    pushUndo();
    let n = 0;
    const made = [];
    for (const o of targets) {
      const parts = HW.boolean.knife(o, a, b);
      if (parts) { made.push(...replaceWithShapes(o, parts)); n++; }
    }
    if (!n) { undoStack.pop(); draw(); return; }
    sel = new Set(made.map((o) => o.id));
    changed();
  }

  /* ---------- Vektorgrafik importieren (SVG, PDF, AI) ---------- */
  function importVector() {
    pickFile('.svg,.svgz,.pdf,.ai,.eps,image/svg+xml,application/pdf', async (buf, f) => {
      const bytes = new Uint8Array(buf);
      const head = String.fromCharCode(...bytes.slice(0, 8));
      let parsed, page = null;
      try {
        if (head.startsWith('%PDF')) { modal('Import', '<p>PDF wird gelesen …</p>', []); parsed = await HW.vector.parsePDF(buf); page = parsed.page; }
        else if (head.startsWith('%!PS')) { return modal('EPS-Datei', '<p>EPS kann nicht direkt gelesen werden. Bitte im Grafikprogramm als <b>SVG</b> oder <b>PDF</b> speichern (in Illustrator: „Speichern unter → PDF“ bzw. „Exportieren → SVG“) und dann importieren.</p>'); }
        else parsed = HW.vector.parseSVG(new TextDecoder().decode(bytes));
      } catch (e) { return modal('Import fehlgeschlagen', `<p>Die Datei konnte nicht gelesen werden: ${String(e.message || e).replace(/</g, '&lt;')}</p>`); }
      vectorDialog(parsed, page, f.name);
    });
  }

  function vectorDialog(parsed, page, fname) {
    const shapes = parsed.shapes;
    // Größe nach dem eigentlichen Motiv (weiße Hintergrundflächen zählen nicht)
    const motif = shapes.filter((s) => !/^#(f[0-9a-f]){3}$/.test(s.color));
    const bb = HW.vector.bounds(motif.length ? motif : shapes);
    if (!bb) {
      return modal('Keine Vektorformen gefunden', '<p>Die Datei enthält keine Vektorformen (vermutlich ein eingebettetes Pixelbild).</p>' + (page ? '<p>Die Seite kann als Bild eingefügt und anschließend auto-digitalisiert werden.</p>' : ''),
        [{ label: 'Abbrechen' }, ...(page ? [{ label: 'Als Bild einfügen', primary: true, action: () => { HW.vector.renderPDF(page, 1600).then((url) => loadBg(url, null, () => { fitToHoop(); })); } }] : [])]);
    }
    const w0 = bb.x1 - bb.x0, h0 = bb.y1 - bb.y0;
    const h = hoop();
    const fitW = h.shape !== 'none' ? Math.floor(HW.hoops.fitScale(h, [{ x: bb.x0, y: bb.y0 }, { x: bb.x1, y: bb.y1 }, { x: bb.x0, y: bb.y1 }, { x: bb.x1, y: bb.y0 }]) * w0) : w0;
    const colors = [...new Set(shapes.map((s) => s.color))];
    modal('Vektorgrafik importieren',
      `<p><b>${String(fname).replace(/</g, '&lt;')}</b>: ${shapes.filter((s) => s.kind === 'fill').length} Flächen, ${shapes.filter((s) => s.kind === 'stroke').length} Linien, ${colors.length} Farben · Originalgröße ${fmt(w0)} × ${fmt(h0)} mm</p>` +
      field('Breite im Stickmotiv (mm)', `<input id="vW" type="number" step="1" value="${Math.round(Math.min(w0, fitW))}"> <small>Rahmen: max. ${fitW}</small>`) +
      field('Schmale Formen als Satin (bis Strichbreite mm, 0 = nie)', '<input id="vSat" type="number" step="0.5" value="7">') +
      field('Weiße Flächen weglassen (Hintergrund)', '<input type="checkbox" id="vWhite" checked>') +
      field('Linien (Konturen) übernehmen', '<input type="checkbox" id="vStroke" checked>') +
      field('Überlappungen anschließend entfernen', '<input type="checkbox" id="vOver" checked>') +
      '<canvas id="vPrev" width="500" height="260" style="width:100%;background:#fff"></canvas>' +
      '<p style="color:#6a7480">Jede Form wird ein eigenes, bearbeitbares Objekt in ihrer Farbe. Die Reihenfolge entspricht der Zeichenreihenfolge der Datei (unten liegende Formen zuerst).</p>',
      [{ label: 'Abbrechen' }, ...(page ? [{ label: 'Stattdessen als Bild', action: () => { HW.vector.renderPDF(page, 1600).then((url) => loadBg(url, null, () => fitToHoop())); } }] : []),
        { label: 'Importieren', primary: true, action: () => {
          const wmm = Math.max(5, num('vW') || w0), sc = wmm / w0;
          const list = shapes.filter((s) => $('#vStroke').checked || s.kind === 'fill');
          const objs = HW.vector.toObjects(list, { scale: sc, dx: -((bb.x0 + bb.x1) / 2) * sc, dy: -((bb.y0 + bb.y1) / 2) * sc, satinMax: num('vSat') || 0, skipWhite: $('#vWhite').checked });
          if (!objs.length) return false;
          pushUndo();
          const ids = [];
          objs.forEach((o) => {
            let ci = st.palette.findIndex((c) => c.hex.toLowerCase() === o.colorKey.toLowerCase());
            if (ci < 0) ci = addPaletteColor(o.colorKey, 'Import');
            const base = o.type === 'fill' ? st.defaults.fill : o.type === 'run' ? st.defaults.run : st.defaults.colA;
            const ob = makeObj(o.type, { points: o.points, holes: o.holes, color: ci });
            ob.params = { ...base, ...o.params };
            st.objects.push(ob); ids.push(ob.id);
          });
          sel = new Set(ids);
          renderPalette();
          pendingCheck.clear();
          changed();
          pendingCheck.clear();
          zoomHoop();
          if ($('#vOver') && $('#vOver').checked && commands.removeOverlaps) setTimeout(() => commands.removeOverlaps(true), 30);
        } }]);
    // Vorschau
    const c = $('#vPrev'), x = c.getContext('2d');
    const sc = Math.min((c.width - 20) / w0, (c.height - 20) / h0);
    const tx = (p) => ({ x: (p.x - bb.x0) * sc + (c.width - w0 * sc) / 2, y: (p.y - bb.y0) * sc + (c.height - h0 * sc) / 2 });
    for (const s of shapes) {
      x.beginPath();
      s.subs.forEach((sp) => sp.pts.forEach((q, i) => { const t = tx(q); i ? x.lineTo(t.x, t.y) : x.moveTo(t.x, t.y); }));
      if (s.kind === 'fill') { x.fillStyle = s.color; x.fill('evenodd'); } else { x.strokeStyle = s.color; x.lineWidth = Math.max(1, s.width * sc); x.stroke(); }
    }
  }

  function machineDialog() {
    modal('Maschine & Rahmen',
      field('Maschinentyp (für die Stickprüfung)', `<select id="mType">${Object.entries(HW.check.MACHINES).map(([k, m]) => `<option value="${k}" ${k === st.settings.machine ? 'selected' : ''}>${m.name}</option>`).join('')}</select>`) +
      field('Längster erlaubter Stich (mm)', `<input id="mMax" type="number" step="0.1" value="${machine().maxStitch}">`) +
      field('Kürzester sinnvoller Stich (mm)', `<input id="mMin" type="number" step="0.05" value="${machine().minStitch}">`) +
      field('Satin ohne Teilung höchstens (mm)', `<input id="mSat" type="number" step="0.5" value="${machine().maxSatin}">`) +
      field('Satin-Abstand mindestens (mm)', `<input id="mSp" type="number" step="0.01" value="${machine().minSpacingSatin}">`) +
      field('Pop-up bei Problemen', `<input type="checkbox" id="mPop" ${st.settings.checkPopup ? 'checked' : ''}>`) +

      field('Stofffarbe', `<input type="color" id="mFabric" value="${st.fabric}">`) +
      field('Ein-/Ausstieg automatisch (kürzeste Verbindung)', `<input type="checkbox" id="mRoute" ${st.settings.autoRoute ? 'checked' : ''}>`) +
      field('Versteckte Laufwege statt Schnitt', `<input type="checkbox" id="mTravel" ${st.settings.hideTravel ? 'checked' : ''}>`) +
      '<h3 style="margin:12px 0 4px;font-size:14px">Verbindungen: Stich, Sprung oder Schnitt</h3>' +
      field('Bis hier direkt als Stich verbinden (mm)', `<input id="mTrim" type="number" step="0.5" min="0.5" value="${st.settings.trimDist}">`) +
      field('Bis hier springen <b>ohne</b> Schnitt (mm, 0 = immer schneiden)', `<input id="mJumpMax" type="number" step="1" min="0" value="${st.settings.jumpMax || 0}">`) +
      field('Vernähen auch bei Sprüngen ohne Schnitt', `<input type="checkbox" id="mLockJump" ${st.settings.lockJump !== false ? 'checked' : ''}>`) +
      `<p style="color:#6a7480;margin:2px 0 8px">Weiter entfernt wird geschnitten. Ein Sprung ohne Schnitt darf höchstens <b id="mFloatMax">${fmt((st.settings.trimJumps - 1) * 12.1)}</b> mm lang sein: DST-Sprungbefehle reichen 12,1 mm, und ab der unten eingestellten Zahl von Sprüngen in Folge schneidet die Maschine automatisch. Pro Objekt lässt sich die Verbindung rechts bei <i>Eigenschaften → Verbindung davor</i> festlegen.</p>` +
      field('Vernähen (Anfang/Ende)', `<input type="checkbox" id="mLock" ${st.settings.lock ? 'checked' : ''}>`) +
      field('Schnitt ab wie vielen Sprüngen (wie an der Maschine eingestellt)', `<select id="mJumps">${[1, 2, 3, 4, 5].map((n) => `<option ${n === st.settings.trimJumps ? 'selected' : ''}>${n}</option>`).join('')}</select>`) +
      field('Geschwindigkeit (Stiche/min)', `<input id="mSpm" type="number" step="50" value="${st.settings.spm}">`) +
      '<p style="color:#6a7480">Texi 1501: DST-Datei per USB-Stick laden. An der Maschine unter Parametern einstellen, ab wie vielen Sprüngen geschnitten wird (Standard 3 = passend zur Einstellung hier). Die Nadelreihenfolge wird an der Maschine zugeordnet – das Arbeitsblatt listet die Farben mit Nadelnummern.</p>',
      [{ label: 'Abbrechen' }, { label: 'Übernehmen', primary: true, action: () => {
        if (val('mType') !== st.settings.machine) { st.settings.machine = val('mType'); st.settings.limits = {}; }
        else {
          const base = HW.check.MACHINES[st.settings.machine], lim = {};
          [['mMax', 'maxStitch'], ['mMin', 'minStitch'], ['mSat', 'maxSatin'], ['mSp', 'minSpacingSatin']].forEach(([id, k]) => { const v = num(id); if (isFinite(v) && v !== base[k]) lim[k] = v; });
          st.settings.limits = lim;
        }
        st.settings.checkPopup = $('#mPop').checked;
        st.settings.autoRoute = $('#mRoute').checked;
        st.settings.hideTravel = $('#mTravel').checked;
        st.fabric = val('mFabric');
        st.settings.trimDist = Math.max(0.5, num('mTrim') || 2);
        st.settings.lockJump = $('#mLockJump').checked;
        st.settings.lock = $('#mLock').checked;
        st.settings.trimJumps = parseInt(val('mJumps')) || 3;
        const fmax = (st.settings.trimJumps - 1) * 12.1;
        st.settings.jumpMax = Math.max(0, Math.min(fmax, num('mJumpMax') || 0));
        if ((num('mJumpMax') || 0) > fmax) setTimeout(() => modal('Sprunglänge begrenzt', `<p>Bei „Schnitt ab ${st.settings.trimJumps} Sprüngen“ kann ein Sprung ohne Schnitt höchstens ${fmt(fmax)} mm lang sein, sonst schneidet die Maschine trotzdem. Der Wert wurde auf ${fmt(fmax)} mm gesetzt. Für längere Sprünge an der Maschine und hier mehr Sprünge bis zum Schnitt einstellen.</p>`), 50);
        st.settings.spm = num('mSpm') || 800;
        changed();
      } }]);
  }

  function imageSettings() {
    if (!st.bg) return modal('Bild', '<p>Kein Bild eingefügt. Menü <b>Bild → Bild einfügen</b>.</p>');
    const b = st.bg;
    modal('Bild-Einstellungen',
      field('Breite (mm)', `<input id="iW" type="number" step="1" value="${fmt(b.w, 1).replace(',', '.')}">`) +
      field('Deckkraft', `<input id="iO" type="range" min="0.05" max="1" step="0.05" value="${b.opacity}">`) +
      field('X links (mm)', `<input id="iX" type="number" value="${fmt(b.x, 1).replace(',', '.')}">`) +
      field('Y oben (mm)', `<input id="iY" type="number" value="${fmt(b.y, 1).replace(',', '.')}">`),
      [{ label: 'Zentrieren', action: () => { b.x = -b.w / 2; b.y = -b.h / 2; draw(); } },
        { label: 'Übernehmen', primary: true, action: () => {
          const w = num('iW');
          if (w > 0) { b.h = (b.h / b.w) * w; b.w = w; }
          b.opacity = num('iO'); b.x = num('iX'); b.y = num('iY');
          draw();
        } }]);
  }

  function loadBg(src, w, cb) {
    const img = new Image();
    img.onload = () => {
      const width = w || Math.min(100, (hoop().w || 100) * 0.6);
      const h = (img.height / img.width) * width;
      st.bg = { src, x: -width / 2, y: -h / 2, w: width, h, opacity: 0.5, visible: true, _img: img };
      if (cb) cb(); draw();
    };
    img.src = src;
  }

  function autoDialog() {
    if (!st.bg) {
      modal('Auto-Digitalisieren', '<p>Bitte zuerst ein Bild einfügen (PNG/JPG, am besten klare Grafik/Logo mit wenigen Farben).</p>',
        [{ label: 'Abbrechen' }, { label: 'Bild einfügen…', primary: true, action: () => { run('insertImage', () => autoDialog()); } }]);
      return;
    }
    const b = st.bg;
    modal('Auto-Digitalisieren',
      field('Anzahl Farben', '<input id="aK" type="number" min="1" max="15" value="4">') +
      field('Breite Stickmotiv (mm)', `<input id="aW" type="number" value="${Math.round(b.w)}">`) +
      field('Detailstufe (Pixel pro mm)', '<input id="aR" type="number" min="2" max="16" value="8">') +
      field('Kleinste Fläche (mm²)', '<input id="aMin" type="number" step="0.25" value="1">') +
      field('Stichart', '<select id="aMode"><option value="auto">Automatisch: Schrift &amp; schmale Formen = Satin, breite = Tatami</option><option value="tatami">Nur Tatami</option></select>') +
      field('Satin bis Strichbreite (mm)', '<input id="aSat" type="number" step="0.5" value="7">') +
      field('Tatami-Winkel (°)', '<input id="aAng" type="number" value="45">') +
      field('Hintergrund weglassen', '<input type="checkbox" id="aBg" checked>') +
      field('Konturen (Laufstich)', '<input type="checkbox" id="aOut">') +
      field('Vorhandene Objekte ersetzen', '<input type="checkbox" id="aRep">') +
      '<canvas id="aPrev" width="480" height="300"></canvas><p style="color:#6a7480">Vorschau zeigt die erkannten Farbflächen. Danach kann jedes Objekt einzeln umgeformt, umgefärbt und mit anderen Sticheigenschaften versehen werden.</p>',
      [{ label: 'Vorschau', action: () => { preview(); return false; } }, { label: 'Abbrechen' },
        { label: 'Digitalisieren', primary: true, action: () => { doAuto(); } }]);
    const sample = () => {
      const res = num('aR') || 8;
      const w = Math.max(20, Math.min(1800, Math.round(b.w * res)));
      const h = Math.max(20, Math.round((b._img.height / b._img.width) * w));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d'); x.drawImage(b._img, 0, 0, w, h);
      return x.getImageData(0, 0, w, h);
    };
    const preview = () => {
      const img = sample();
      const q = HW.auto.quantize(img.data, img.width, img.height, Math.max(1, Math.min(15, num('aK') || 4)));
      const c = $('#aPrev'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d'); const out = x.createImageData(img.width, img.height);
      for (let i = 0; i < q.labels.length; i++) {
        const l = q.labels[i]; if (l < 0) continue;
        out.data.set([...q.centers[l], 255], i * 4);
      }
      x.putImageData(out, 0, 0);
    };
    const doAuto = () => {
      const img = sample();
      const wmm = num('aW') || b.w;
      const r = HW.auto.autoDigitize(img, {
        colors: Math.max(1, Math.min(15, num('aK') || 4)), widthMM: wmm, originX: b.x, originY: b.y,
        minAreaMM2: num('aMin') || 1, removeBg: $('#aBg').checked, satinMax: num('aSat') || 7, mode: val('aMode'), outline: $('#aOut').checked, angle: num('aAng') || 45,
      });
      if (wmm !== b.w) { b.h = (b.h / b.w) * wmm; b.w = wmm; }
      pushUndo();
      if ($('#aRep').checked) st.objects = [];
      const ids = [];
      r.objects.forEach((o) => {
        let ci = st.palette.findIndex((c) => c.hex.toLowerCase() === o.colorKey.toLowerCase());
        if (ci < 0) ci = addPaletteColor(o.colorKey, 'Auto');
        const ob = makeObj(o.type, { points: o.points, holes: o.holes, color: ci });
        ob.params = { ...(o.type === 'fill' ? st.defaults.fill : st.defaults.colA), ...o.params };
        st.objects.push(ob); ids.push(ob.id);
      });
      sel = new Set(ids);
      b.opacity = 0.25;
      renderPalette();
      changed();
    };
    setTimeout(preview, 30);
  }

  function worksheet() {
    const s = D.stats(cmds);
    if (!s.stitches) return modal('Arbeitsblatt', '<p>Das Design ist leer.</p>');
    const c = document.createElement('canvas');
    const sc = Math.min(900 / Math.max(1, s.w), 700 / Math.max(1, s.h), 12);
    c.width = Math.ceil(s.w * sc + 40); c.height = Math.ceil(s.h * sc + 40);
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    x.lineCap = 'round'; x.lineWidth = Math.max(1, 0.35 * sc);
    let curCol = colOf(byId(cmds.find((q) => q.obj)?.obj)?.color ?? 0), prev = null;
    const perColor = [];
    let ci = 0, count = 0;
    const seq = [byId(cmds.find((q) => q.obj)?.obj)?.color ?? 0], stops = [];
    for (const q of cmds) {
      const pt = { x: (q.x - s.x0) * sc + 20, y: (q.y - s.y0) * sc + 20 };
      if (q.cmd === 'color') { perColor[ci] = count; ci++; count = 0; curCol = colOf(q.color); seq.push(q.color); stops[seq.length - 1] = q.stop ? (byId(q.obj) || {}).applPart || 'stop' : null; prev = pt; continue; }
      if (q.cmd === 'stitch' && prev) { x.strokeStyle = curCol; x.beginPath(); x.moveTo(prev.x, prev.y); x.lineTo(pt.x, pt.y); x.stroke(); count++; }
      if (q.cmd !== 'trim') prev = pt;
    }
    perColor[ci] = count;
    const rows = seq.map((p, i) => { const c2 = st.palette[p] || {}; return `<tr><td>${i + 1}</td><td><span style="display:inline-block;width:30px;height:16px;background:${c2.hex};border:1px solid #999"></span></td><td>${c2.name || ''}${stops[i] ? `<br><b>STOPP</b> – ${({ tack: 'Applikationsstoff auflegen', cover: 'überstehenden Stoff abschneiden', stop: 'z. B. Puff-Schaum auflegen' })[stops[i]] || 'Stopp'} (gleiche Nadel)` : ''}</td><td>Nadel ${c2.needle || ''}</td><td>${(perColor[i] || 0).toLocaleString('de-DE')} Stiche</td></tr>`; }).join('');
    const w = window.open('', '_blank');
    if (!w) return modal('Arbeitsblatt', '<p>Popup wurde blockiert – bitte Popups erlauben.</p>');
    w.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Arbeitsblatt ${st.name}</title><style>body{font:13px system-ui;margin:20px}td{padding:3px 10px;border-bottom:1px solid #ddd}img{max-width:100%;border:1px solid #ccc}</style></head><body>
      <h2>${st.name}</h2><p>Stiche: <b>${s.stitches.toLocaleString('de-DE')}</b> · Farbwechsel: ${s.colors - 1} · Schnitte: ${s.trims} · Größe: ${fmt(s.w)} × ${fmt(s.h)} mm · Rahmen: ${hoop().name}</p>
      <img src="${c.toDataURL()}">${(() => { const r = HW.fabric.recommend(st.material, st.objects, s); return `<h3>Stoff &amp; Vlies</h3><p>Stoff: <b>${r.fabric.name}</b><br>Vlies: ${r.vlies}<br>Topper: ${r.topper}<br>Nadel: ${r.needle} · max. ${r.spm} Stiche/min</p>${r.warn.length ? '<p>⚠ ' + r.warn.join('<br>⚠ ') + '</p>' : ''}`; })()}<h3>Farbfolge</h3><table>${rows}</table><script>setTimeout(()=>print(),300)<\/script></body></html>`);
    w.document.close();
  }

  function helpDialog() {
    modal('Hilfe & Tastatur', `<table class="help">
      <tr><td>Linksklick</td><td>Eckpunkt setzen (gerade Linie)</td></tr>
      <tr><td>Rechtsklick</td><td>Kurvenpunkt setzen (gebogene Linie)</td></tr>
      <tr><td>Enter</td><td>Objekt fertigstellen / nächster Schritt</td></tr>
      <tr><td>Rücktaste</td><td>letzten Punkt entfernen</td></tr>
      <tr><td>Esc</td><td>abbrechen / zurück zum Auswahlwerkzeug</td></tr>
      <tr><td>R</td><td>Umformen (Punkte bearbeiten)</td></tr>
      <tr><td>Leertaste</td><td>(Umformen) Punkt Ecke ↔ Kurve umschalten</td></tr>
      <tr><td>Doppelklick</td><td>(Umformen) Punkt einfügen</td></tr>
      <tr><td>Entf</td><td>Punkt bzw. Objekt löschen</td></tr>
      <tr><td>Pfeiltasten</td><td>0,1 mm verschieben (mit Shift 1 mm)</td></tr>
      <tr><td>Mausrad / + / −</td><td>Zoom, <b>0</b> = alles zeigen</td></tr>
      <tr><td>Mittlere Taste / Alt+Ziehen</td><td>Ansicht verschieben</td></tr>
      <tr><td>T / J</td><td>TrueView / Sprünge anzeigen</td></tr>
      <tr><td>Strg+Z / Strg+Y</td><td>Rückgängig / Wiederholen</td></tr>
      <tr><td>Strg+E</td><td>DST exportieren</td></tr>
      </table>
      <h3>Werkzeuge</h3>
      <p><b>Säule A</b>: Punkte abwechselnd links/rechts der Säule setzen. <b>Säule B</b>: erst eine Kante, Enter, dann die andere Kante. <b>Satin C</b>: Mittellinie mit fester Breite. <b>Fläche</b>: Umriss → Enter → Löcher (Enter überspringt) → Stichwinkel mit 2 Klicks oder Enter.</p>
      <p><b>Text</b>: 10 eingebaute Stickschriften, Bogen-Text, Doppelklick zum Bearbeiten. Satin-Schrift folgt automatisch den Kurven der Buchstaben.</p>
      <p><b>Manuell</b>: jeder Klick ein Einstich. Jedes Objekt lässt sich über <i>Bearbeiten → In Einzelstiche umwandeln</i> Stich für Stich bearbeiten.</p>`);
  }

  /* ======================= Befehle ======================= */
  const commands = {
    new: () => modal('Neues Design', '<p>Aktuelles Design verwerfen?</p>', [{ label: 'Abbrechen' }, { label: 'Neu', primary: true, action: () => { pushUndo(); st.objects = []; st.bg = null; sel = new Set(); changed(); } }]),
    save: () => {
      download(projectJSON(), (st.name || 'design') + '.stick.json', 'application/json');
    },
    open: () => pickFile('.json,.stick.json', (txt, f) => {
      try {
        loadProject(JSON.parse(txt), f.name);
      } catch (e) { modal('Fehler', '<p>Datei konnte nicht gelesen werden.</p>'); }
    }, 'text'),
    importDst: () => pickFile('.dst,.DST,.pes,.PES,.jef,.JEF,.exp,.EXP,.pec,.PEC', (buf, f) => {
      const ext = (f.name.split('.').pop() || 'dst').toLowerCase();
      let c, colors = [];
      try {
        if (ext === 'dst') c = D.readDST(new Uint8Array(buf));
        else { const r = HW.formats.read(ext, new Uint8Array(buf)); c = r.cmds; colors = r.colors || []; }
      } catch (e) { return modal('Import', `<p>Datei konnte nicht gelesen werden: ${String(e.message || e).replace(/</g, '&lt;')}</p>`); }
      pushUndo();
      // Garnfarben aus PES/JEF übernehmen
      const colIdx = colors.map((hx) => addPaletteColor(hx, 'Import'));
      if (colIdx.length) renderPalette();
      let ci = 0, cur = [];
      const flush = () => { if (cur.length > 1) { const o = makeObj('manual', { stitches: cur, color: colIdx.length ? colIdx[Math.min(ci, colIdx.length - 1)] : ci % st.palette.length }); st.objects.push(o); } cur = []; };
      for (const q of c) {
        if (q.cmd === 'color') { flush(); ci++; }
        else if (q.cmd === 'stitch') cur.push({ x: q.x, y: q.y, j: 0 });
        else if (q.cmd === 'jump') cur.push({ x: q.x, y: q.y, j: 1 });
      }
      flush();
      st.name = f.name.replace(/\.(dst|pes|jef|exp|pec)$/i, '');
      changed(); zoomFit();
    }),
    exportDst: () => {
      if (!cmds.some((c) => c.cmd === 'stitch')) return modal('DST exportieren', '<p>Das Design enthält noch keine Stiche.</p>');
      modal('Stickdatei exportieren', field('Dateiname', `<input id="eName" value="${st.name}">`) + field('Format', fmtSelect('eFmt', st.settings.exportFmt || 'dst')) +
        '<p style="color:#6a7480">DST: Tajima-Format für die Texi 1501 und alle Tajima-kompatiblen Maschinen. Ursprung = Designmitte, Schnitt als Sprungfolge, Farbwechsel als Stopp. PES/JEF/EXP für Brother-, Janome- und Melco/Bernina-Maschinen.</p>',
      [{ label: 'Abbrechen' }, { label: 'Speichern', primary: true, action: () => {
        st.name = val('eName').trim() || 'design';
        const fmt = val('eFmt');
        st.settings.exportFmt = fmt;
        download(exportBytes(cmds, st.name, fmt), safeName(st.name) + '.' + fmt, 'application/octet-stream');
      } }]);
    },
    worksheet,
    undo, redo,
    duplicate: () => {
      const objs = selected();
      if (!objs.length) return;
      pushUndo();
      const ids = [];
      const copies = copyObjs(objs);
      copies.forEach((c) => { controlArrays(c).forEach((a) => a.forEach((p) => { p.x += 5; p.y += 5; })); st.objects.push(c); ids.push(c.id); });
      sel = new Set(ids); changed();
    },
    delete: () => { if (!sel.size) return; pushUndo(); st.objects = st.objects.filter((o) => !sel.has(o.id)); sel = new Set(); changed(); },
    selectAll: () => { sel = new Set(st.objects.map((o) => o.id)); changed(true); },
    mirrorH: () => { const c = selCenter(); transformSel((p) => ({ x: 2 * c.x - p.x, y: p.y }), (a) => 180 - a); },
    mirrorV: () => { const c = selCenter(); transformSel((p) => ({ x: p.x, y: 2 * c.y - p.y }), (a) => -a); },
    rotate: () => modal('Drehen', field('Winkel (° im Uhrzeigersinn)', '<input id="rA" type="number" value="90">'), [{ label: 'Abbrechen' }, { label: 'Drehen', primary: true, action: () => { const a = num('rA') || 0, c = selCenter(); transformSel((p) => G.rot(p, (a * Math.PI) / 180, c), (x) => x + a); } }]),
    scale: () => modal('Skalieren', field('Breite %', '<input id="sX" type="number" value="100">') + field('Höhe %', '<input id="sY" type="number" value="100">') + '<p style="color:#6a7480">Stiche werden neu berechnet (Dichte bleibt gleich).</p>', [{ label: 'Abbrechen' }, { label: 'Skalieren', primary: true, action: () => { const fx = (num('sX') || 100) / 100, fy = (num('sY') || 100) / 100, c = selCenter(); transformSel((p) => ({ x: c.x + (p.x - c.x) * fx, y: c.y + (p.y - c.y) * fy })); } }]),
    center: () => { const objs = sel.size ? selected() : st.objects; if (!objs.length) return; const keep = sel; sel = new Set(objs.map((o) => o.id)); const c = selCenter(); transformSel((p) => ({ x: p.x - c.x, y: p.y - c.y })); sel = keep; changed(true); },
    toStitches: () => {
      const objs = selected();
      if (!objs.length) return modal('Einzelstiche', '<p>Bitte zuerst Objekte auswählen.</p>');
      pushUndo();
      objs.forEach((o) => { const s = ensure(o).map((p) => ({ x: p.x, y: p.y, j: p.j || 0 })); o.type = 'manual'; o.stitches = s; o.points = []; delete o.side2; delete o.holes; invalidate(o); });
      setTool('reshape'); changed();
    },
    check: () => issueDialog(issues, false),
    optimizeOrder: () => {
      const before = D.stats(cmds);
      const score = (s) => s.trims * 10 + jumpLen();
      const b0 = score(before);
      const old = st.objects;
      pushUndo();
      st.objects = HW.route.optimizeOrder(st.objects);
      changed();
      let after = D.stats(cmds);
      if (score(after) >= b0) {
        // nicht besser -> alte Reihenfolge behalten
        undoStack.pop();
        st.objects = old;
        changed();
        return modal('Reihenfolge optimieren', '<p>Die aktuelle Reihenfolge ist bereits optimal – es wurde nichts geändert.</p>');
      }
      modal('Reihenfolge optimiert', `<p>Objekte gleicher Farbe wurden nach kürzesten Wegen sortiert. Überlappende Objekte behalten ihre Reihenfolge, Schriften bleiben unverändert.</p><p>Schnitte: ${before.trims} → <b>${after.trims}</b><br>Versteckte Laufwege: ${before.travels} → <b>${after.travels}</b></p>`);
    },
    sortColor: () => {
      pushUndo();
      const firstIdx = {};
      st.objects.forEach((o, i) => { if (!(o.color in firstIdx)) firstIdx[o.color] = i; });
      st.objects.sort((a, b) => firstIdx[a.color] - firstIdx[b.color]);
      changed();
    },
    insertImage: (cb) => pickFile('image/*', (url) => { loadBg(url, null, () => { zoomHoop(); if (typeof cb === 'function') cb(); }); }, 'url'),
    imageSettings,
    toggleImage: () => { if (st.bg) { st.bg.visible = !st.bg.visible; draw(); } },
    removeImage: () => { st.bg = null; draw(); },
    autoDigitize: autoDialog,
    toggleTrue: () => { view.trueView = !view.trueView; draw(); },
    toggleJumps: () => { view.jumps = !view.jumps; draw(); },
    toggleGrid: () => { view.grid = !view.grid; draw(); },
    toggleTips: () => { HW.tips.set(!HW.tips.on); hintFlash(HW.tips.on ? 'Hilfe-Infos sind eingeschaltet – mit der Maus kurz auf einem Knopf verweilen.' : 'Hilfe-Infos sind ausgeschaltet (Einstellungen oder ⓘ unten rechts schaltet sie wieder ein).'); },
    toggleSnap: () => { view.snap = !view.snap; hintFlash(view.snap ? `Einrasten an (Raster ${fmt2(view.gridStep)} mm und Hilfslinien)` : 'Einrasten aus'); },
    guides: () => guideDialog(),
    alignLeft: () => align('left'), alignCenterH: () => align('centerH'), alignRight: () => align('right'),
    alignTop: () => align('top'), alignCenterV: () => align('centerV'), alignBottom: () => align('bottom'),
    distH: () => align('distH'), distV: () => align('distV'),
    group: () => groupSel(true), ungroup: () => groupSel(false),
    array: () => arrayDialog(),
    toColA: () => toColA(),
    textOnPath: () => textOnPathDialog(),
    monogram: () => monogramDialog(),
    togglePoints: () => { view.points = !view.points; draw(); },
    zoomFit, zoomHoop,
    machineSettings: machineDialog,
    importVector: () => importVector(),
    removeOverlaps: (silent) => removeOverlaps(silent === true),
    union: () => combineSel('union'),
    difference: () => combineSel('diff'),
    intersect: () => combineSel('intersect'),
    hoops: () => hoopDialog(),
    fitHoop: () => fitToHoop(),
    help: helpDialog,
    addColor: () => { st.palette.push({ hex: '#888888', name: 'Neue Farbe', needle: Math.min(15, st.palette.length + 1) }); renderPalette(); editColor(st.palette.length - 1); },
    editColor: () => editColor(st.curColor),
    threadBrand: () => threadBrandDialog(),
    applique: () => appliqueDialog(),
    mockup: () => mockupDialog(),
    price: () => priceDialog(),
    library: () => libraryDialog(),
    librarySave: () => librarySave(),
    teamNames: () => teamDialog(),
    multiHoop: () => multiHoopDialog(),
    knockdown: () => knockdownDialog(),
    capSort: () => capDialog(),
    delColor: () => {
      if (st.palette.length <= 1) return;
      const i = st.curColor;
      if (st.objects.some((o) => o.color === i)) return modal('Farbe entfernen', '<p>Diese Farbe wird noch von Objekten verwendet.</p>');
      pushUndo();
      st.palette.splice(i, 1);
      st.objects.forEach((o) => { if (o.color > i) o.color--; });
      st.curColor = Math.max(0, i - 1);
      renderPalette(); changed();
    },
    moveUp: () => moveSel(-1), moveDown: () => moveSel(1),
    moveFirst: () => moveSel(-1e6), moveLast: () => moveSel(1e6),
  };
  function moveSel(d) {
    if (!sel.size) return;
    pushUndo();
    const arr = st.objects;
    const idx = arr.map((o, i) => (sel.has(o.id) ? i : -1)).filter((i) => i >= 0);
    if (Math.abs(d) > 1000) {
      const s = arr.filter((o) => sel.has(o.id)), r = arr.filter((o) => !sel.has(o.id));
      st.objects = d < 0 ? s.concat(r) : r.concat(s);
    } else {
      const order = d < 0 ? idx : idx.reverse();
      for (const i of order) {
        const j = i + d;
        if (j < 0 || j >= arr.length || sel.has(arr[j].id)) continue;
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
    }
    changed();
  }
  function run(name, arg) { if (commands[name]) commands[name](arg); }

  /* ======================= Menü, Werkzeuge, Player ======================= */
  document.querySelectorAll('.menu > button').forEach((b) => {
    b.addEventListener('click', (e) => {
      const m = b.parentElement, open = m.classList.contains('open');
      document.querySelectorAll('.menu').forEach((x) => x.classList.remove('open'));
      if (!open) m.classList.add('open');
      e.stopPropagation();
    });
    b.addEventListener('mouseenter', () => { if (document.querySelector('.menu.open') && !b.parentElement.classList.contains('open')) { document.querySelectorAll('.menu').forEach((x) => x.classList.remove('open')); b.parentElement.classList.add('open'); } });
  });
  document.addEventListener('click', () => document.querySelectorAll('.menu').forEach((x) => x.classList.remove('open')));
  document.querySelectorAll('[data-cmd]').forEach((b) => b.addEventListener('click', () => run(b.dataset.cmd)));
  document.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
  $('#hoopSel').addEventListener('change', () => setHoop($('#hoopSel').value));
  $('#hoopBtn').addEventListener('click', () => hoopDialog());
  $('#checkInfo').addEventListener('click', () => issueDialog(issues, false));
  $('#curveMode').addEventListener('click', () => { curveMode = !curveMode; $('#curveMode').classList.toggle('active', curveMode); setHint(); });
  $('#modal').addEventListener('pointerdown', (e) => { if (e.target.id === 'modal') closeModal(); });

  const slider = $('#playSlider');
  slider.addEventListener('input', () => { playN = +slider.value; playing = false; $('#playBtn').textContent = '▶'; draw(); });
  let lastT = 0;
  function tick(t) {
    if (!playing) return;
    const dt = lastT ? (t - lastT) / 1000 : 0;
    lastT = t;
    playN = Math.min(cmds.length, playN + Math.max(1, dt * +$('#playSpeed').value));
    slider.value = Math.floor(playN);
    draw();
    if (playN >= cmds.length) { playing = false; $('#playBtn').textContent = '▶'; playN = Infinity; return; }
    requestAnimationFrame(tick);
  }
  $('#playBtn').addEventListener('click', () => {
    playing = !playing;
    $('#playBtn').textContent = playing ? '⏸' : '▶';
    if (playing) { if (!isFinite(playN) || playN >= cmds.length) playN = 0; lastT = 0; requestAnimationFrame(tick); }
  });

  window.addEventListener('resize', resize);
  window.HWApp = { st, commands, changed, setTool, view, get cmds() { return cmds; }, select(ids) { sel = new Set(ids); changed(true); } };

  // Start
  resize();
  renderHoopSel();
  renderPalette();
  setTool('select');
  changed();
  zoomHoop();
})();
