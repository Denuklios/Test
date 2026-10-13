/* StickStudio – Bedienoberfläche und Werkzeuge */
(function () {
  'use strict';
  const G = HW.geo, S = HW.stitch, D = HW.dst;
  const $ = (s) => document.querySelector(s);
  const cv = $('#cv'), ctx = cv.getContext('2d');

  /* ======================= Zustand ======================= */
  const HOOPS = {
    '540x350': { w: 540, h: 350, name: 'Texi 540 × 350 mm (max. Feld)' },
    '290x290': { w: 290, h: 290, name: 'Rahmen 290 × 290 mm' },
    R200: { d: 200, name: 'Rund Ø 200 mm' },
    R150: { d: 150, name: 'Rund Ø 150 mm' },
    R120: { d: 120, name: 'Rund Ø 120 mm' },
    R90: { d: 90, name: 'Rund Ø 90 mm' },
    none: { name: 'kein Rahmen' },
  };
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
    fabric: '#f4f1ea',
    bg: null,
    settings: { trimDist: 2.0, lock: true, trimJumps: 3, spm: 800 },
    defaults: {
      run: { ...S.DEFAULTS.run },
      triple: { ...S.DEFAULTS.run, style: 'triple' },
      colA: { ...S.DEFAULTS.satin, underlay: 'edge+zigzag' },
      colB: { ...S.DEFAULTS.satin, underlay: 'edge+zigzag' },
      colC: { ...S.DEFAULTS.satin, underlay: 'center' },
      fill: { ...S.DEFAULTS.fill },
    },
  };
  const view = { scale: 2, ox: 0, oy: 0, trueView: true, jumps: false, grid: true, points: false };
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
    if (o.type === 'fill') return o.params.fillType === 'satin' ? 'Satin-Fläche' : 'Tatami-Fläche';
    return TYPE_NAMES[o.type] || o.type;
  }

  function makeObj(type, data) {
    const base = type === 'triple' ? 'run' : type;
    const dk = type;
    return { id: nextId++, type: base, color: st.curColor, params: { ...(st.defaults[dk] || {}) }, points: [], ...data };
  }

  function invalidate(o) { o._st = null; o._rings = null; o._bb = null; }
  function ensure(o) {
    if (!o._st) {
      try { o._st = S.generate(o); } catch (e) { console.error(e); o._st = []; }
      o._bb = o._st.length ? G.bbox(o._st) : null;
    }
    return o._st;
  }

  function changed(keepPlay) {
    for (const o of st.objects) ensure(o);
    cmds = D.assemble(st.objects, st.palette, st.settings);
    const n = cmds.length;
    const sl = $('#playSlider');
    sl.max = n;
    if (!keepPlay) { playN = Infinity; sl.value = n; }
    renderList();
    renderProps();
    renderStats();
    draw();
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

  function drawHoop() {
    const h = HOOPS[st.hoop];
    ctx.save();
    ctx.fillStyle = st.fabric;
    ctx.strokeStyle = '#7a828c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    const c = toScr({ x: 0, y: 0 });
    if (h.d) ctx.arc(c.x, c.y, (h.d / 2) * view.scale, 0, Math.PI * 2);
    else if (h.w) ctx.rect(c.x - (h.w / 2) * view.scale, c.y - (h.h / 2) * view.scale, h.w * view.scale, h.h * view.scale);
    else { const r = cv.getBoundingClientRect(); ctx.rect(0, 0, r.width, r.height); }
    ctx.fill();
    if (h.w || h.d) ctx.stroke();
    ctx.clip();
    if (view.grid) {
      const r = cv.getBoundingClientRect();
      const a = toMM(0, 0), b = toMM(r.width, r.height);
      const stp = view.scale > 4 ? 5 : 10;
      ctx.lineWidth = 1;
      for (let x = Math.floor(a.x / stp) * stp; x <= b.x; x += stp) {
        ctx.strokeStyle = x === 0 ? 'rgba(0,0,0,.25)' : x % 50 === 0 ? 'rgba(0,0,0,.13)' : 'rgba(0,0,0,.06)';
        const s = toScr({ x, y: 0 }).x;
        ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(s, r.height); ctx.stroke();
      }
      for (let y = Math.floor(a.y / stp) * stp; y <= b.y; y += stp) {
        ctx.strokeStyle = y === 0 ? 'rgba(0,0,0,.25)' : y % 50 === 0 ? 'rgba(0,0,0,.13)' : 'rgba(0,0,0,.06)';
        const s = toScr({ x: 0, y }).y;
        ctx.beginPath(); ctx.moveTo(0, s); ctx.lineTo(r.width, s); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawStitchList(list, colorFn, alpha = 1, limit = Infinity) {
    const lw = view.trueView ? Math.max(1, 0.38 * view.scale) : 1;
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
        if (prev) jumps.push([prev, s]);
      } else { flush(); }
      if (c.cmd !== 'trim' && c.cmd !== 'color') prev = s;
    }
    flush();
    if (view.jumps && jumps.length) {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(200,0,0,.6)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (const [a, b] of jumps) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
      ctx.stroke();
      ctx.setLineDash([]);
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
    if (draft) drawDraft();
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

  function drawCtrlPath(o, pts, closed, color) {
    if (!pts.length) return;
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
    ctx.strokeStyle = kind === 'jump' ? '#d00' : '#1f6feb';
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
      if (o.type === 'colA') {
        ctx.strokeStyle = 'rgba(31,111,235,.35)';
        for (let i = 0; i + 1 < arr.length; i += 2) {
          const a = toScr(arr[i]), b = toScr(arr[i + 1]);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
      arr.forEach((p, i) => {
        if (o.type === 'manual' && view.scale < 3 && arr.length > 400) return;
        drawNode(o.type === 'manual' ? { x: p.x, y: p.y } : p, selNodes.some((n) => n.arr === arr && n.i === i), p.j ? 'jump' : '');
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
      arr.forEach((p) => drawNode(p, false, p.j ? 'jump' : ''));
    });
    if (draft.angleStart && mouse.mm) {
      const a = toScr(draft.angleStart), b = toScr(mouse.mm);
      ctx.strokeStyle = '#e07b00'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.restore();
  }

  /* ======================= UI-Panels ======================= */
  function renderStats() {
    const s = D.stats(cmds);
    const mins = s.stitches / st.settings.spm + s.colors * 0.15 + s.trims * 0.05;
    const h = HOOPS[st.hoop];
    let out = false;
    if (s.stitches) {
      if (h.w) out = s.x0 < -h.w / 2 + 5 || s.x1 > h.w / 2 - 5 || s.y0 < -h.h / 2 + 5 || s.y1 > h.h / 2 - 5;
      else if (h.d) out = cmds.some((c) => c.cmd === 'stitch' && Math.hypot(c.x, c.y) > h.d / 2 - 5);
    }
    $('#stats').innerHTML = `Stiche: <b>${s.stitches.toLocaleString('de-DE')}</b> · Farben: ${s.colors} · Schnitte: ${s.trims} · Größe: ${fmt(s.w)} × ${fmt(s.h)} mm · ca. ${fmt(mins, 0)} min` +
      (out ? ' · <span class="warn">⚠ ragt über den Rahmen</span>' : '');
  }

  function renderPalette() {
    const el = $('#palette');
    el.innerHTML = '';
    st.palette.forEach((c, i) => {
      const d = document.createElement('div');
      d.className = 'sw' + (i === st.curColor ? ' active' : '');
      d.style.background = c.hex;
      d.title = `${i + 1}: ${c.name} – Nadel ${c.needle}`;
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
      ['spacing', 'Dichte / Abstand (mm)', 'num', 0.2, 2, 0.02],
      ['pull', 'Zugkompensation (mm)', 'num', 0, 1.5, 0.05],
      ['underlay', 'Unterlage', 'select', [['none', 'keine'], ['center', 'Mittellauf'], ['edge', 'Kantenlauf'], ['zigzag', 'Zickzack'], ['edge+zigzag', 'Kante + Zickzack'], ['center+zigzag', 'Mitte + Zickzack']]],
      ['split', 'Auto-Split ab (mm, 0=aus)', 'num', 0, 12, 0.5],
    ],
    fill: [
      ['fillType', 'Füllart', 'select', [['tatami', 'Tatami'], ['satin', 'Satin (fester Winkel)']]],
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

  function renderProps() {
    const el = $('#props');
    const objs = selected();
    let target, type, title;
    if (objs.length) {
      type = objs[0].type;
      if (!objs.every((o) => o.type === type)) { el.innerHTML = `<p>${objs.length} Objekte ausgewählt (verschiedene Arten). Farbe per Klick in der Palette zuweisen.</p>`; $('#propTitle').textContent = ''; return; }
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
    $('#propTitle').textContent = '– ' + title;
    const defs = defsFor(type);
    el.innerHTML = '';
    if (type === 'manual') {
      el.innerHTML = `<p>${objs[0].stitches.length} Einzelstiche. Mit <b>Umformen</b> jeden Stich verschieben (Entf = löschen, Doppelklick = einfügen).</p>`;
      return;
    }
    for (const [key, label, kind, a, b, step] of defs) {
      if (type === 'fill' && key === 'len' && target.fillType === 'satin') continue;
      if (type === 'fill' && key === 'split' && target.fillType !== 'satin') continue;
      if (type === 'fill' && key === 'borderWidth' && target.border !== 'satin') continue;
      const f = document.createElement('div');
      f.className = 'field';
      let inp;
      if (kind === 'select') {
        inp = document.createElement('select');
        a.forEach(([v, t]) => { const op = document.createElement('option'); op.value = v; op.textContent = t; inp.appendChild(op); });
        inp.value = target[key];
      } else if (kind === 'bool') {
        inp = document.createElement('input'); inp.type = 'checkbox'; inp.checked = !!target[key];
      } else {
        inp = document.createElement('input'); inp.type = 'number'; inp.min = a; inp.max = b; inp.step = step;
        inp.value = Math.round(target[key] * 1000) / 1000;
      }
      inp.onchange = () => {
        let v = kind === 'bool' ? inp.checked : kind === 'num' ? parseFloat(inp.value) : inp.value;
        if (kind === 'num' && !isFinite(v)) return;
        if (kind === 'num') v = Math.max(a, Math.min(b, v));
        if (objs.length) {
          pushUndo();
          objs.forEach((o) => { o.params[key] = v; invalidate(o); });
          changed();
        } else { target[key] = v; renderProps(); }
      };
      const lb = document.createElement('label'); lb.textContent = label;
      f.append(lb, inp);
      el.appendChild(f);
    }
  }

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
      manual: 'Jeder Linksklick = ein Stich, Rechtsklick = Sprung. Enter = fertig.',
    };
    let h = H[tool] || '';
    if (draft && draft.tool === 'colB' && draft.phase === 1) h = 'Jetzt die ZWEITE Seite digitalisieren, Enter = fertig.';
    if (draft && draft.tool === 'fill' && draft.phase === 1) h = 'Loch digitalisieren (Enter schließt das Loch) – oder sofort Enter: keine (weiteren) Löcher.';
    if (draft && draft.tool === 'fill' && draft.phase === 2) h = 'Stichwinkel: zwei Punkte klicken – oder Enter für Vorgabewinkel.';
    if (curveMode && draft) h += ' [Touch: Kurvenpunkt-Modus aktiv]';
    $('#hint').textContent = h;
  }

  function setTool(t) {
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
        if (drag.shift) { sel.has(o.id) ? sel.delete(o.id) : sel.add(o.id); }
        else if (!sel.has(o.id)) sel = new Set([o.id]);
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
    if (!drag) { if (draft) draw(); return; }
    if (Math.hypot(e.offsetX - drag.sx, e.offsetY - drag.sy) > 4) drag.moved = true;
    drag.cx = e.offsetX; drag.cy = e.offsetY;
    if (drag.kind === 'pan') { view.ox = drag.ox + e.offsetX - drag.sx; view.oy = drag.oy + e.offsetY - drag.sy; draw(); }
    else if (drag.kind === 'move' && drag.moved) {
      if (!drag.undone) { pushUndo(); drag.undone = true; }
      const dx = p.x - drag.last.x, dy = p.y - drag.last.y;
      drag.last = p;
      for (const o of selected()) { forEachPoint(o, (q) => { q.x += dx; q.y += dy; }); invalidate(o); }
      changed();
    } else if (drag.kind === 'node' && drag.moved) {
      if (!drag.undone) { pushUndo(); drag.undone = true; }
      const dx = p.x - drag.last.x, dy = p.y - drag.last.y;
      drag.last = p;
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
    if (['run', 'triple', 'colA', 'colB', 'colC', 'fill', 'manual'].includes(tool)) {
      const right = d.button === 2;
      if (tool === 'manual') addPoint(p, false, right);
      else addPoint(p, right || curveMode);
    }
  });

  cv.addEventListener('dblclick', (e) => {
    if (tool === 'reshape') insertNode(toMM(e.offsetX, e.offsetY));
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
    const h = HOOPS[st.hoop];
    const w = h.w || h.d || 200, hh = h.h || h.d || 200;
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

  function editColor(i) {
    const c = st.palette[i];
    if (!c) return;
    modal(`Farbe ${i + 1} bearbeiten`,
      field('Farbe', `<input type="color" id="cHex" value="${c.hex}">`) +
      field('Name / Garnnummer', `<input id="cName" value="${c.name.replace(/"/g, '&quot;')}">`) +
      field('Nadel (1–15)', `<input id="cNeedle" type="number" min="1" max="15" value="${c.needle}">`),
      [{ label: 'Abbrechen' }, { label: 'Übernehmen', primary: true, action: () => {
        pushUndo();
        c.hex = val('cHex'); c.name = val('cName'); c.needle = Math.max(1, Math.min(15, parseInt(val('cNeedle')) || 1));
        renderPalette(); changed();
      } }]);
  }

  function textDialog(p) {
    const fonts = ['Arial', 'Arial Black', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Georgia', 'Times New Roman', 'Courier New', 'Impact', 'Comic Sans MS', 'Brush Script MT', 'serif', 'sans-serif', 'cursive'];
    modal('Text einfügen',
      field('Text', '<textarea id="tText" rows="2" style="width:100%">Text</textarea>') +
      field('Schriftart', `<select id="tFont">${fonts.map((f) => `<option>${f}</option>`).join('')}</select>`) +
      field('Fett', '<input type="checkbox" id="tBold" checked>') +
      field('Kursiv', '<input type="checkbox" id="tItalic">') +
      field('Höhe Großbuchstaben (mm)', '<input id="tH" type="number" value="20" min="4" max="300">') +
      field('Stichart', '<select id="tType"><option value="auto">Automatisch (schmal = Satin)</option><option value="satin">Satin</option><option value="tatami">Tatami</option></select>') +
      '<p style="color:#6a7480">Tipp: Für sauberen Satin mind. 5 mm Buchstabenhöhe. Die Buchstaben werden als normale Objekte angelegt und lassen sich danach umformen.</p>',
      [{ label: 'Abbrechen' }, { label: 'Einfügen', primary: true, action: () => {
        const text = val('tText').trim();
        if (!text) return;
        const hmm = num('tH') || 20;
        const res = 8;
        const font = `${$('#tItalic').checked ? 'italic ' : ''}${$('#tBold').checked ? 'bold ' : ''}${Math.round(hmm * res * 1.4)}px "${val('tFont')}"`;
        const lines = text.split('\n');
        const c = document.createElement('canvas'), x = c.getContext('2d');
        x.font = font;
        const lh = hmm * res * 1.9;
        const w = Math.ceil(Math.max(...lines.map((l) => x.measureText(l).width))) + 20;
        c.width = Math.min(4000, w); c.height = Math.min(4000, Math.ceil(lh * lines.length + 20));
        x.font = font; x.fillStyle = '#000'; x.textBaseline = 'top';
        lines.forEach((l, i) => x.fillText(l, 10, 10 + i * lh));
        const img = x.getImageData(0, 0, c.width, c.height);
        const type = val('tType');
        const r = HW.auto.autoDigitize(img, {
          colors: 1, widthMM: c.width / res, originX: p.x - c.width / res / 2, originY: p.y - c.height / res / 2,
          minAreaMM2: 0.3, removeBg: false, satinMax: type === 'satin' ? 1e9 : type === 'tatami' ? 0 : 2.6, allowSatinHoles: type === 'satin', simplify: 0.6, angle: 45,
        });
        pushUndo();
        const ids = [];
        r.objects.forEach((o) => { const ob = makeObj('fill', { points: o.points, holes: o.holes }); ob.params = { ...st.defaults.fill, ...o.params, underlay: o.params.fillType === 'satin' ? 'none' : 'edge' }; st.objects.push(ob); ids.push(ob.id); });
        sel = new Set(ids);
        setTool('select');
        changed();
      } }]);
  }

  function machineDialog() {
    modal('Maschine & Rahmen',
      field('Rahmen', `<select id="mHoop">${Object.entries(HOOPS).map(([k, h]) => `<option value="${k}" ${k === st.hoop ? 'selected' : ''}>${h.name}</option>`).join('')}</select>`) +
      field('Stofffarbe', `<input type="color" id="mFabric" value="${st.fabric}">`) +
      field('Fadenschnitt ab Sprung (mm)', `<input id="mTrim" type="number" step="0.5" min="0.5" value="${st.settings.trimDist}">`) +
      field('Vernähen (Anfang/Ende)', `<input type="checkbox" id="mLock" ${st.settings.lock ? 'checked' : ''}>`) +
      field('Schnitt-Codierung (Sprünge)', `<select id="mJumps">${[1, 2, 3, 4, 5].map((n) => `<option ${n === st.settings.trimJumps ? 'selected' : ''}>${n}</option>`).join('')}</select>`) +
      field('Geschwindigkeit (Stiche/min)', `<input id="mSpm" type="number" step="50" value="${st.settings.spm}">`) +
      '<p style="color:#6a7480">Texi 1501: DST-Datei per USB-Stick laden. An der Maschine unter Parametern einstellen, ab wie vielen Sprüngen geschnitten wird (Standard 3 = passend zur Einstellung hier). Die Nadelreihenfolge wird an der Maschine zugeordnet – das Arbeitsblatt listet die Farben mit Nadelnummern.</p>',
      [{ label: 'Abbrechen' }, { label: 'Übernehmen', primary: true, action: () => {
        st.hoop = val('mHoop'); st.fabric = val('mFabric');
        st.settings.trimDist = Math.max(0.5, num('mTrim') || 2);
        st.settings.lock = $('#mLock').checked;
        st.settings.trimJumps = parseInt(val('mJumps')) || 3;
        st.settings.spm = num('mSpm') || 800;
        changed(); zoomHoop();
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
      const width = w || Math.min(100, (HOOPS[st.hoop].w || HOOPS[st.hoop].d || 100) * 0.6);
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
      field('Detailstufe (Pixel pro mm)', '<input id="aR" type="number" min="2" max="12" value="5">') +
      field('Kleinste Fläche (mm²)', '<input id="aMin" type="number" step="0.5" value="3">') +
      field('Satin bis Breite (mm)', '<input id="aSat" type="number" step="0.1" value="2.5">') +
      field('Tatami-Winkel (°)', '<input id="aAng" type="number" value="45">') +
      field('Hintergrund weglassen', '<input type="checkbox" id="aBg" checked>') +
      field('Konturen (Laufstich)', '<input type="checkbox" id="aOut">') +
      field('Vorhandene Objekte ersetzen', '<input type="checkbox" id="aRep">') +
      '<canvas id="aPrev" width="480" height="300"></canvas><p style="color:#6a7480">Vorschau zeigt die erkannten Farbflächen. Danach kann jedes Objekt einzeln umgeformt, umgefärbt und mit anderen Sticheigenschaften versehen werden.</p>',
      [{ label: 'Vorschau', action: () => { preview(); return false; } }, { label: 'Abbrechen' },
        { label: 'Digitalisieren', primary: true, action: () => { doAuto(); } }]);
    const sample = () => {
      const res = num('aR') || 5;
      const w = Math.max(20, Math.min(1000, Math.round(b.w * res)));
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
        minAreaMM2: num('aMin') || 3, removeBg: $('#aBg').checked, satinMax: num('aSat'), outline: $('#aOut').checked, angle: num('aAng') || 45,
      });
      if (wmm !== b.w) { b.h = (b.h / b.w) * wmm; b.w = wmm; }
      pushUndo();
      if ($('#aRep').checked) st.objects = [];
      const ids = [];
      r.objects.forEach((o) => {
        let ci = st.palette.findIndex((c) => c.hex.toLowerCase() === o.colorKey.toLowerCase());
        if (ci < 0) { st.palette.push({ hex: o.colorKey, name: 'Auto ' + o.colorKey, needle: Math.min(15, st.palette.length + 1) }); ci = st.palette.length - 1; }
        const ob = makeObj('fill', { points: o.points, holes: o.holes, color: ci });
        ob.params = { ...st.defaults.fill, ...o.params };
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
    const seq = [byId(cmds.find((q) => q.obj)?.obj)?.color ?? 0];
    for (const q of cmds) {
      const pt = { x: (q.x - s.x0) * sc + 20, y: (q.y - s.y0) * sc + 20 };
      if (q.cmd === 'color') { perColor[ci] = count; ci++; count = 0; curCol = colOf(q.color); seq.push(q.color); prev = pt; continue; }
      if (q.cmd === 'stitch' && prev) { x.strokeStyle = curCol; x.beginPath(); x.moveTo(prev.x, prev.y); x.lineTo(pt.x, pt.y); x.stroke(); count++; }
      if (q.cmd !== 'trim') prev = pt;
    }
    perColor[ci] = count;
    const rows = seq.map((p, i) => { const c2 = st.palette[p] || {}; return `<tr><td>${i + 1}</td><td><span style="display:inline-block;width:30px;height:16px;background:${c2.hex};border:1px solid #999"></span></td><td>${c2.name || ''}</td><td>Nadel ${c2.needle || ''}</td><td>${(perColor[i] || 0).toLocaleString('de-DE')} Stiche</td></tr>`; }).join('');
    const w = window.open('', '_blank');
    if (!w) return modal('Arbeitsblatt', '<p>Popup wurde blockiert – bitte Popups erlauben.</p>');
    w.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Arbeitsblatt ${st.name}</title><style>body{font:13px system-ui;margin:20px}td{padding:3px 10px;border-bottom:1px solid #ddd}img{max-width:100%;border:1px solid #ccc}</style></head><body>
      <h2>${st.name}</h2><p>Stiche: <b>${s.stitches.toLocaleString('de-DE')}</b> · Farbwechsel: ${s.colors - 1} · Schnitte: ${s.trims} · Größe: ${fmt(s.w)} × ${fmt(s.h)} mm · Rahmen: ${HOOPS[st.hoop].name}</p>
      <img src="${c.toDataURL()}"><h3>Farbfolge</h3><table>${rows}</table><script>setTimeout(()=>print(),300)<\/script></body></html>`);
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
      <p><b>Manuell</b>: jeder Klick ein Einstich. Jedes Objekt lässt sich über <i>Bearbeiten → In Einzelstiche umwandeln</i> Stich für Stich bearbeiten.</p>`);
  }

  /* ======================= Befehle ======================= */
  const commands = {
    new: () => modal('Neues Design', '<p>Aktuelles Design verwerfen?</p>', [{ label: 'Abbrechen' }, { label: 'Neu', primary: true, action: () => { pushUndo(); st.objects = []; st.bg = null; sel = new Set(); changed(); } }]),
    save: () => {
      const data = JSON.stringify({ app: 'StickStudio', version: 1, name: st.name, objects: clone(st.objects), palette: st.palette, hoop: st.hoop, fabric: st.fabric, settings: st.settings, defaults: st.defaults, bg: st.bg ? { ...clone(st.bg), src: st.bg.src } : null });
      download(data, (st.name || 'design') + '.stick.json', 'application/json');
    },
    open: () => pickFile('.json,.stick.json', (txt, f) => {
      try {
        const d = JSON.parse(txt);
        pushUndo();
        st.objects = d.objects || []; st.palette = d.palette || st.palette; st.hoop = d.hoop || st.hoop;
        st.fabric = d.fabric || st.fabric; Object.assign(st.settings, d.settings || {});
        if (d.defaults) Object.keys(d.defaults).forEach((k) => Object.assign(st.defaults[k] || (st.defaults[k] = {}), d.defaults[k]));
        st.name = d.name || f.name.replace(/\..*$/, '');
        nextId = Math.max(0, ...st.objects.map((o) => o.id || 0)) + 1;
        st.bg = null;
        if (d.bg && d.bg.src) { const b = d.bg; loadBg(b.src, b.w, () => Object.assign(st.bg, { x: b.x, y: b.y, opacity: b.opacity, visible: b.visible !== false })); }
        sel = new Set(); renderPalette(); changed(); zoomFit();
      } catch (e) { modal('Fehler', '<p>Datei konnte nicht gelesen werden.</p>'); }
    }, 'text'),
    importDst: () => pickFile('.dst,.DST', (buf, f) => {
      const c = D.readDST(new Uint8Array(buf));
      pushUndo();
      let ci = 0, cur = [];
      const flush = () => { if (cur.length > 1) { const o = makeObj('manual', { stitches: cur, color: ci % st.palette.length }); st.objects.push(o); } cur = []; };
      for (const q of c) {
        if (q.cmd === 'color') { flush(); ci++; }
        else if (q.cmd === 'stitch') cur.push({ x: q.x, y: q.y, j: 0 });
        else if (q.cmd === 'jump') cur.push({ x: q.x, y: q.y, j: 1 });
      }
      flush();
      st.name = f.name.replace(/\.dst$/i, '');
      changed(); zoomFit();
    }),
    exportDst: () => {
      if (!cmds.some((c) => c.cmd === 'stitch')) return modal('DST exportieren', '<p>Das Design enthält noch keine Stiche.</p>');
      modal('DST exportieren', field('Dateiname', `<input id="eName" value="${st.name}">`) +
        '<p style="color:#6a7480">Format: Tajima DST (für Texi 1501 und alle Tajima-kompatiblen Maschinen). Ursprung = Designmitte, Schnitt als Sprungfolge, Farbwechsel als Stopp.</p>',
      [{ label: 'Abbrechen' }, { label: 'Speichern', primary: true, action: () => {
        st.name = val('eName').trim() || 'design';
        const buf = D.writeDST(cmds, st.name, st.settings);
        download(buf, st.name.replace(/[^\w\-äöüÄÖÜß ]/g, '_') + '.dst', 'application/octet-stream');
      } }]);
    },
    worksheet,
    undo, redo,
    duplicate: () => {
      const objs = selected();
      if (!objs.length) return;
      pushUndo();
      const ids = [];
      objs.forEach((o) => { const c = clone(o); c.id = nextId++; controlArrays(c).forEach((a) => a.forEach((p) => { p.x += 5; p.y += 5; })); st.objects.push(c); ids.push(c.id); });
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
    togglePoints: () => { view.points = !view.points; draw(); },
    zoomFit, zoomHoop,
    machineSettings: machineDialog,
    help: helpDialog,
    addColor: () => { st.palette.push({ hex: '#888888', name: 'Neue Farbe', needle: Math.min(15, st.palette.length + 1) }); renderPalette(); editColor(st.palette.length - 1); },
    editColor: () => editColor(st.curColor),
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
  window.HWApp = { st, commands, changed, setTool, view, get cmds() { return cmds; } };

  // Start
  resize();
  renderPalette();
  setTool('select');
  changed();
  zoomHoop();
})();
