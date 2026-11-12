// Nachträgliche Bearbeitung: Gegenstände entfernen, Retusche, Regler, Effekte, Auto, Drehen/Spiegeln
import { Renderer, renderToCanvas, EFFECTS, DEFAULT_ADJUST } from './gl.js';
import { Probe, autoStats } from './motion.js';
import { addItem, saveToPhone, fileName, makeThumb, settings } from './store.js';
import { icon } from './icons.js';
import { toast, busy } from './app.js';
import { Remover } from './remover.js';
import { warmup } from './ai.js';

const $ = (s) => document.querySelector(s);
const TABS = [
  ['auto', 'wand', 'Auto'],
  ['erase', 'eraser', 'Entfernen'],
  ['retouch', 'face', 'Retusche'],
  ['adjust', 'sliders', 'Anpassen'],
  ['fx', 'palette', 'Effekte'],
  ['rotate', 'rotate', 'Drehen'],
];
const ADJ = [['Belichtung', 'exposure', -2, 2], ['Kontrast', 'contrast', -1, 1], ['Sättigung', 'saturation', -1, 1], ['Wärme', 'temp', -1, 1],
  ['Tönung', 'tint', -1, 1], ['Lichter', 'highlights', -1, 1], ['Schatten', 'shadows', -1, 1], ['Klarheit', 'clarity', -1, 1], ['Schärfe', 'sharpen', 0, 1], ['Vignette', 'vignette', -1, 1]];

export async function openEditor(item, { onClose } = {}) {
  const ed = $('#editor');
  ed.hidden = false;
  ed.innerHTML = `<div class="bar-top"><button class="tb" data-a="cancel">${icon('close')}</button><h2>Bearbeiten</h2>
      <button class="tb" data-a="undo">${icon('undo')}</button><button class="tb" data-a="redo">${icon('redo')}</button>
      <button class="tb" data-a="save" style="color:var(--accent)">${icon('check')}</button></div>
    <div class="estage"><canvas class="ev"></canvas><canvas class="em"></canvas><button class="chip compare">Vorher</button></div>
    <div class="etools"></div>
    <div class="etabs">${TABS.map(([id, ic, n]) => `<button data-t="${id}">${icon(ic, 22)}${n}</button>`).join('')}</div>`;
  const stage = ed.querySelector('.estage');
  const view = ed.querySelector('.ev');
  const maskC = ed.querySelector('.em');
  maskC.style.opacity = '0.5';
  const tools = ed.querySelector('.etools');
  const R = new Renderer(view);

  const bmp = await createImageBitmap(item.blob);
  let base = document.createElement('canvas');
  base.width = bmp.width; base.height = bmp.height;
  base.getContext('2d').drawImage(bmp, 0, 0);
  bmp.close();

  // Bearbeitungszustand
  const st = { adjust: { ...DEFAULT_ADJUST }, effect: 0, p1: 0.5, p2: 0.5, auto: null };
  let autoOn = false;
  const history = [], future = [];
  const snapshot = () => ({ base, st: JSON.parse(JSON.stringify(st)), autoOn });
  const push = () => { history.push(snapshot()); if (history.length > 12) history.shift(); future.length = 0; };
  const restore = (s) => { base = s.base; Object.assign(st, JSON.parse(JSON.stringify(s.st))); autoOn = s.autoOn; makePreview(); showTab(curTab); };

  // Vorschau in reduzierter Größe (flüssig)
  let prev = null;
  function makePreview() {
    const k = Math.min(1, 1600 / Math.max(base.width, base.height));
    prev = document.createElement('canvas');
    prev.width = Math.round(base.width * k); prev.height = Math.round(base.height * k);
    prev.getContext('2d').drawImage(base, 0, 0, prev.width, prev.height);
    if (autoOn) computeAuto();
    layout(); draw();
  }
  function computeAuto() {
    const f = new Probe(200).grab(prev, prev.width, prev.height);
    st.auto = autoStats(f);
  }
  let comparing = false;
  function draw() {
    const s = comparing ? { adjust: DEFAULT_ADJUST, effect: 0 } : { ...st, auto: autoOn ? st.auto : null };
    R.render(prev, prev.width, prev.height, s);
  }
  function layout() {
    const sw = stage.clientWidth, sh = stage.clientHeight;
    const k = Math.min(sw / prev.width, sh / prev.height);
    for (const c of [view, maskC]) { c.style.width = `${prev.width * k}px`; c.style.height = `${prev.height * k}px`; }
    remover.setSize(prev.width, prev.height);
  }
  window.addEventListener('resize', layout);

  // Vorher/Nachher
  const cmp = ed.querySelector('.compare');
  cmp.onpointerdown = () => { comparing = true; draw(); };
  cmp.onpointerup = cmp.onpointerleave = () => { comparing = false; draw(); };

  // Gegenstände entfernen (KI)
  const remover = new Remover({
    maskC,
    getBase: () => base,
    getPreview: () => prev,
    commit: (nb) => { push(); base = nb; makePreview(); toast('Entfernt – mit „Vorher" vergleichen'); },
    toast, busy,
    onChange: () => { if (curTab === 'erase') updateEraseInfo(); },
  });
  maskC.style.pointerEvents = 'none';
  function updateEraseInfo() {
    const el = tools.querySelector('.einfo');
    if (el) el.textContent = remover.objects.length ? `${remover.objects.length} Gegenstand${remover.objects.length > 1 ? 'e' : ''} ausgewählt` : '';
  }

  // Werkzeug-Leisten
  let curTab = 'auto';
  const sl = (label, key, val, min, max, fmt) => `<label class="slider"><span>${label}</span><input type="range" data-k="${key}" min="${min}" max="${max}" step="0.01" value="${val}"><span>${fmt(+val)}</span></label>`;
  const pm = (v) => (v > 0 ? '+' : '') + Math.round(v * 100);
  function showTab(id) {
    curTab = id;
    ed.querySelectorAll('.etabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === id));
    maskC.style.pointerEvents = id === 'erase' ? 'auto' : 'none';
    maskC.style.display = id === 'erase' ? '' : 'none';
    if (id === 'erase') { warmup('sam'); warmup('lama'); }
    let h = '';
    if (id === 'auto') {
      h = `<div class="row"><div>Auto-Verbessern<small>Belichtung, Kontrast und Weißabgleich automatisch</small></div><button class="switch${autoOn ? ' on' : ''}" data-a="auto"></button></div>
        <div class="btnrow"><button class="btn" data-a="oneTap">${icon('wand', 20)}Alles automatisch (inkl. Retusche)</button></div>`;
    } else if (id === 'erase') {
      const m = remover.mode;
      h = `<p class="subtle">${m === 'tap' ? '<b>Antippen:</b> Gegenstand oder Person antippen – die KI erkennt den Umriss. Mehrere nacheinander möglich. Lange drücken nimmt eine Stelle wieder heraus.' : m === 'pen' ? '<b>Malen:</b> mit dem Finger über das, was weg soll.' : '<b>Radieren:</b> zu viel Markiertes wegwischen.'}</p>
        <div class="seg" style="display:flex;margin-bottom:6px"><button class="${m === 'tap' ? 'on' : ''}" data-a="mtap" style="flex:1">Antippen (KI)</button><button class="${m === 'pen' ? 'on' : ''}" data-a="mpen" style="flex:1">Malen</button><button class="${m === 'rub' ? 'on' : ''}" data-a="mrub" style="flex:1">Radieren</button></div>
        ${m === 'tap' ? `<div class="btnrow" style="margin-top:4px"><button class="btn" data-a="smaller">Auswahl kleiner</button><button class="btn" data-a="bigger">Auswahl größer</button></div>`
          : `<label class="slider"><span>Pinselgröße</span><input type="range" data-k="brush" min="6" max="120" step="1" value="${remover.brush}"><span>${remover.brush}</span></label>`}
        <label class="slider"><span>Rand / Schatten</span><input type="range" data-k="grow" min="0" max="40" step="1" value="${remover.grow}"><span>${remover.grow}</span></label>
        <p class="subtle einfo"></p>
        <div class="btnrow"><button class="btn" data-a="selundo">${icon('undo', 20)}Auswahl zurück</button><button class="btn" data-a="clear">Leeren</button></div>
        <div class="btnrow"><button class="btn primary" data-a="remove">${icon('eraser', 20)}Entfernen</button></div>`;
    } else if (id === 'retouch') {
      h = sl('Haut glätten', 'smooth', st.adjust.smooth, 0, 1, (v) => Math.round(v * 100))
        + sl('Haut aufhellen', 'skinLight', st.adjust.skinLight, 0, 1, (v) => Math.round(v * 100))
        + sl('Details schärfen', 'eyes', st.adjust.eyes, 0, 1, (v) => Math.round(v * 100))
        + '<p class="subtle">Für kleine Pickel/Flecken: Reiter „Entfernen“ und nur den Fleck antippen.</p>';
    } else if (id === 'adjust') {
      h = ADJ.map(([l, k, a, b]) => sl(l, k, st.adjust[k], a, b, pm)).join('');
    } else if (id === 'fx') {
      const e = EFFECTS[st.effect];
      h = `<div class="fxrow">${EFFECTS.map((x) => `<button class="fx${x.id === st.effect ? ' on' : ''}" data-fx="${x.id}">${x.name}</button>`).join('')}</div>`
        + (e.p || []).map((n, i) => sl(n, `p${i}`, i ? st.p2 : st.p1, 0, 1, (v) => Math.round(v * 100))).join('');
    } else if (id === 'rotate') {
      h = `<div class="btnrow"><button class="btn" data-a="rotL">${icon('undo', 20)}Links</button><button class="btn" data-a="rotR">${icon('redo', 20)}Rechts</button><button class="btn" data-a="flipH">${icon('flip', 20)}Spiegeln</button></div>
        <label class="slider"><span>Begradigen</span><input type="range" data-k="straight" min="-15" max="15" step="0.1" value="0"><span>0°</span></label>
        <div class="btnrow"><button class="btn" data-a="applyStraight">Begradigung übernehmen</button></div>`;
    }
    tools.innerHTML = h;
    if (id === 'erase') updateEraseInfo();
    tools.querySelectorAll('[data-fx]').forEach((b) => b.onclick = () => {
      push(); st.effect = +b.dataset.fx;
      const d = EFFECTS[st.effect].d || [0.5, 0.5]; st.p1 = d[0] ?? 0.5; st.p2 = d[1] ?? 0.5;
      draw(); showTab('fx');
    });
    let straight = 0;
    tools.querySelectorAll('input[type=range]').forEach((r) => {
      r.onpointerdown = () => { if (!['brush', 'grow', 'straight'].includes(r.dataset.k)) push(); };
      r.oninput = () => {
        const k = r.dataset.k, v = +r.value, out = r.nextElementSibling;
        if (k === 'brush') { remover.brush = v; out.textContent = v; return; }
        if (k === 'grow') { remover.grow = v; out.textContent = v; return; }
        if (k === 'straight') { straight = v; out.textContent = `${v.toFixed(1)}°`; view.style.transform = `translate(-50%,-50%) rotate(${v}deg) scale(${1 + Math.abs(v) / 40})`; return; }
        if (k === 'p0') st.p1 = v; else if (k === 'p1') st.p2 = v; else st.adjust[k] = v;
        out.textContent = ['exposure', 'contrast', 'saturation', 'temp', 'tint', 'highlights', 'shadows', 'clarity', 'sharpen', 'vignette'].includes(k) ? pm(v) : Math.round(v * 100);
        draw();
      };
    });
    tools.querySelectorAll('[data-a]').forEach((b) => b.onclick = () => {
      const a = b.dataset.a;
      if (a === 'auto') { push(); autoOn = !autoOn; if (autoOn) computeAuto(); draw(); showTab('auto'); }
      if (a === 'oneTap') {
        push(); autoOn = true; computeAuto();
        Object.assign(st.adjust, { clarity: 0.2, sharpen: 0.15, smooth: 0.3, skinLight: 0.1, eyes: 0.2, shadows: 0.15, highlights: 0.15, saturation: 0.08 });
        draw(); toast('Automatisch verbessert – mit „Vorher“ vergleichen');
      }
      if (a === 'mtap') { remover.mode = 'tap'; showTab('erase'); }
      if (a === 'mpen') { remover.mode = 'pen'; showTab('erase'); }
      if (a === 'mrub') { remover.mode = 'rub'; showTab('erase'); }
      if (a === 'bigger') remover.resize(1);
      if (a === 'smaller') remover.resize(-1);
      if (a === 'selundo') remover.undoSelection();
      if (a === 'clear') remover.invalidate();
      if (a === 'remove') remover.remove().catch((e) => toast('Entfernen fehlgeschlagen: ' + e.message));
      if (a === 'rotL' || a === 'rotR' || a === 'flipH') {
        push();
        const c = document.createElement('canvas');
        const turn = a !== 'flipH';
        c.width = turn ? base.height : base.width; c.height = turn ? base.width : base.height;
        const x = c.getContext('2d');
        x.translate(c.width / 2, c.height / 2);
        if (a === 'rotL') x.rotate(-Math.PI / 2); else if (a === 'rotR') x.rotate(Math.PI / 2); else x.scale(-1, 1);
        x.drawImage(base, -base.width / 2, -base.height / 2);
        base = c; makePreview();
      }
      if (a === 'applyStraight' && straight) {
        push();
        const c = document.createElement('canvas'); c.width = base.width; c.height = base.height;
        const x = c.getContext('2d');
        const rad = straight * Math.PI / 180;
        // so weit vergrößern, dass keine leeren Ecken entstehen
        const s = Math.abs(Math.cos(rad)) + Math.abs(Math.sin(rad)) * Math.max(base.width / base.height, base.height / base.width);
        x.translate(c.width / 2, c.height / 2); x.rotate(rad); x.scale(s, s);
        x.drawImage(base, -base.width / 2, -base.height / 2);
        base = c; view.style.transform = ''; makePreview(); showTab('rotate');
      }
    });
  }
  ed.querySelectorAll('.etabs button').forEach((b) => b.onclick = () => { view.style.transform = ''; showTab(b.dataset.t); });

  const close = (saved) => {
    window.removeEventListener('resize', layout);
    R.gl.getExtension('WEBGL_lose_context')?.loseContext();
    ed.hidden = true; ed.innerHTML = '';
    onClose?.(saved);
  };
  ed.querySelector('[data-a=cancel]').onclick = () => { if (!history.length || confirm('Änderungen verwerfen?')) close(false); };
  ed.querySelector('[data-a=undo]').onclick = () => { if (history.length) { future.push(snapshot()); restore(history.pop()); } };
  ed.querySelector('[data-a=redo]').onclick = () => { if (future.length) { history.push(snapshot()); restore(future.pop()); } };
  ed.querySelector('[data-a=save]').onclick = async () => {
    busy('Wird gespeichert …');
    try {
      const out = renderToCanvas(base, base.width, base.height, { ...st, auto: autoOn ? st.auto : null });
      const blob = await new Promise((r) => out.toBlob(r, 'image/jpeg', 0.93));
      const name = fileName('edit', 'jpg').replace('IMG_', 'IMG_BEARB_');
      await addItem({ type: 'photo', blob, thumb: await makeThumb(out), mime: 'image/jpeg', name, meta: { editedFrom: item.id } });
      if (settings.get('autosave', true)) await saveToPhone(blob, name);
      toast('Als neues Foto gespeichert (Original bleibt erhalten)');
      close(true);
    } catch (e) { toast('Speichern fehlgeschlagen: ' + e.message); } finally { busy(false); }
  };

  await new Promise((r) => requestAnimationFrame(r));
  makePreview();
  showTab('auto');
}
