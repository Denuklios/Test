/* Unterschriftsseite für Kunden: Auftragsbestätigung ansehen und mit Finger/Maus unterschreiben. */
'use strict';
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = DocRender.esc;
  const token = location.pathname.split('/').pop();
  const browserLang = (navigator.language || 'da').slice(0, 2);
  let L = DocLang.get(['de', 'da', 'en'].includes(browserLang) ? browserLang : 'en');

  function toast(msg, err) {
    const t = $('#toast');
    t.textContent = msg; t.className = 'toast' + (err ? ' err' : '');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 6000);
  }
  async function call(method, body) {
    const r = await fetch(`/api/public/order/${token}${body ? '/sign' : ''}`, {
      method, headers: { 'X-RS': '1', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error === 'notFound' ? L.notFound : data.error || L.notFound);
    return data;
  }

  function show(data, justSigned) {
    const o = data.order;
    L = DocLang.get(o.language);
    document.documentElement.lang = o.language;
    document.title = `${L.order} ${o.number} – ${o.seller?.company || ''}`;
    const expired = o.validUntil && o.validUntil < new Date().toISOString().slice(0, 10);
    $('#main').innerHTML = `
      ${justSigned ? `<div class="note no-print" style="max-width:210mm;margin:0 auto 14px">✔ ${esc(L.signDone)}</div>` : ''}
      <div class="doc-actions no-print"><button id="print">${esc(L.print)}</button></div>
      <div class="doc-wrap">${DocRender.render(o, { logo: data.logo, seller: o.seller })}</div>
      ${o.signedAt ? '' : expired ? `<div class="card no-print sign-box"><b>${esc(L.signExpired)}</b></div>` : `
      <div class="card no-print sign-box">
        <h2>${esc(L.signTitle)}</h2>
        <label>${esc(L.signName)}<input id="name" autocomplete="name"></label>
        <div class="small muted" style="margin:12px 0 4px">${esc(L.signHere)}</div>
        <canvas id="pad"></canvas>
        <div style="text-align:right"><button type="button" id="clear" class="small">${esc(L.signClear)}</button></div>
        <label>${esc(L.signComment)}<textarea id="comment" rows="2"></textarea></label>
        <label style="margin:12px 0;display:flex;gap:8px;align-items:flex-start;color:var(--text);font-size:14px"><input type="checkbox" id="accept" style="margin-top:3px"> ${esc(L.signAccept)}</label>
        <button class="primary" id="sign" style="width:100%;justify-content:center;font-size:16px;padding:12px">${esc(L.signButton)}</button>
      </div>`}`;
    DocRender.fit();
    $('#print').onclick = () => window.print();
    if (!o.signedAt && !expired) pad();
  }

  // Unterschriftsfeld: Finger, Stift oder Maus
  function pad() {
    const c = $('#pad'), ctx = c.getContext('2d');
    let drawn = false, last = null;
    const size = () => {
      const r = c.getBoundingClientRect(), k = window.devicePixelRatio || 1;
      c.width = r.width * k; c.height = r.height * k;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#10204a';
      drawn = false;
    };
    size();
    const pos = (e) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); last = pos(e); e.preventDefault(); });
    c.addEventListener('pointermove', (e) => {
      if (!last) return;
      const p = pos(e);
      ctx.beginPath(); ctx.moveTo(...last); ctx.lineTo(...p); ctx.stroke();
      last = p; drawn = true; e.preventDefault();
    });
    const end = () => (last = null);
    c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
    $('#clear').onclick = () => size();
    $('#sign').onclick = async () => {
      const name = $('#name').value.trim();
      if (!name || !drawn || !$('#accept').checked) return toast(L.signMissing, true);
      // auf weißem Hintergrund als PNG
      const out = document.createElement('canvas');
      out.width = c.width; out.height = c.height;
      const o2 = out.getContext('2d');
      o2.fillStyle = '#fff'; o2.fillRect(0, 0, out.width, out.height); o2.drawImage(c, 0, 0);
      $('#sign').disabled = true;
      try {
        const data = await call('POST', { name, signature: out.toDataURL('image/png'), comment: $('#comment').value, accept: true });
        show(data, true);
        window.scrollTo(0, 0);
      } catch (e) { toast(e.message, true); $('#sign').disabled = false; }
    };
  }

  call('GET').then((d) => show(d)).catch((e) => { $('#main').innerHTML = `<div class="card" style="max-width:520px;margin:40px auto">${esc(e.message)}</div>`; });
})();
