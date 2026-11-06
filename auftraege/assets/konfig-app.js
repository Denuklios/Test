// Produkt-Konfigurator in der Auftrags-App: schnell planen (Produkt, Farbe, Logo, Position, Größe) und
// Anfragen aus dem Vorschau-Tool der Webseite weiterbearbeiten. Der Konfigurator selbst liegt auf der Webseite
// unter /konfigurator/ und wird hier im Werkstatt-Modus geladen (eigene Farbe, Logo verschieben, Bild speichern).
(() => {
'use strict';
const W = window.WFApp;
const { h, api, show, t, toast, route, BASE } = W;

// Ordner des Konfigurators: neben dem Auftragsprogramm (…/auftraege/ → …/konfigurator/)
const KBASE = document.documentElement.dataset.konfig || new URL('../konfigurator/', location.href).pathname;
let loading = null;
function loadKonfig() {
  if (window.WFKonfig) return Promise.resolve();
  if (loading) return loading;
  if (!document.getElementById('wfkCss')) document.head.append(h('link', { id: 'wfkCss', rel: 'stylesheet', href: KBASE + 'konfig.css?v=7' }));
  loading = new Promise((ok, bad) => { const s = document.createElement('script'); s.src = KBASE + 'konfig.js?v=7'; s.onload = ok; s.onerror = () => { loading = null; bad(new Error(t('konfig_err'))); }; document.head.append(s); });
  return loading;
}

async function page(qs) {
  const P = new URLSearchParams(qs || '');
  const inqId = +P.get('inquiry') || 0;
  const box = h('div', { class: 'wfk-app' });
  const toOrder = h('button', { class: 'btn primary', disabled: true }, '🧾 ' + t('konfig_to_order'));
  show(h('div', { class: 'row', style: 'justify-content:space-between;align-items:flex-end;gap:10px;flex-wrap:wrap;margin-bottom:12px' },
    h('div', {}, h('div', { class: 'eyebrow' }, inqId ? t('inq_title') + ' #' + inqId : t('tab_products')), h('h1', { style: 'margin:2px 0 4px' }, t('konfig_title')), h('p', { class: 'muted', style: 'margin:0;max-width:640px' }, t('konfig_sub'))),
    h('div', { class: 'row', style: 'gap:8px' }, inqId ? h('a', { class: 'btn', href: '#/inquiry/' + inqId }, '← ' + t('inq_title')) : null, toOrder)),
    h('div', { class: 'card' }, box));
  let preset = null, note = '';
  try {
    await loadKonfig();
    if (inqId) {
      const q = (await api('app_inquiry', { params: { id: inqId } })).inquiry;
      preset = { ...(q.konfig || {}) };
      note = [q.name, q.email, q.phone].filter(Boolean).join('\n');
      if (q.has_logo) {
        try {
          const r = await fetch(`${BASE}api.php?a=inquiry_file&id=${inqId}&f=logo&dl=1`, { credentials: 'same-origin' });
          if (r.ok) { const b = await r.blob(); preset.logoFile = new File([b], q.logo_name || 'logo.' + (q.logo_ext || 'png'), { type: { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg' }[q.logo_ext] || b.type }); }
        } catch (e) { /* ohne Logo weiter */ }
      }
    }
    const k = await WFKonfig.mount(box, { mode: 'werkstatt', lang: W.lang === 'da' ? 'da' : 'de', base: KBASE, preset });
    toOrder.disabled = false;
    toOrder.onclick = () => { location.hash = '#/new?note=' + encodeURIComponent([note, k.summary(W.lang === 'da' ? 'da' : 'de')].filter(Boolean).join('\n')); };
  } catch (e) {
    box.replaceChildren(h('p', { class: 'muted' }, e.message || t('konfig_err')));
  }
}
route(/^\/konfig$/, () => page(''));
route(/^\/konfig\?([\s\S]*)$/, (qs) => page(qs));

// Für die Anfrage-Ansicht (mail.js): Vorschau aus dem Vorschau-Tool anzeigen
window.konfigInquiryCard = (q) => {
  if (!q || (!q.konfig && !q.has_preview)) return null;
  const k = q.konfig || {};
  const pos = (k.places || []).map((p) => `${p.name} (${String(p.cm).replace('.', ',')} cm)`).join(', ');
  const url = (f, dl) => `${BASE}api.php?a=inquiry_file&id=${q.id}&f=${f}${dl ? '&dl=1' : ''}`;
  return h('div', { class: 'card' },
    h('h3', { style: 'margin:0 0 8px' }, '🎨 ' + t('inq_konfig')),
    q.has_preview ? h('a', { href: url('preview'), target: '_blank', rel: 'noopener' }, h('img', { src: url('preview'), alt: '', style: 'width:100%;max-width:900px;border-radius:12px;border:1px solid var(--line);background:#fff;display:block' })) : null,
    h('dl', { class: 'kv', style: 'margin-top:10px' },
      k.product_name ? [h('dt', {}, t('q_product')), h('dd', {}, k.product_name)] : null,
      k.color_name ? [h('dt', {}, t('kc_color')), h('dd', {}, h('span', { style: `display:inline-block;width:12px;height:12px;border-radius:50%;border:1px solid #0003;vertical-align:-1px;margin-right:6px;background:${/^#[0-9a-f]{6}$/i.test(k.color_hex || '') ? k.color_hex : '#fff'}` }), k.color_name)] : null,
      k.tech_name ? [h('dt', {}, t('kc_tech')), h('dd', {}, k.tech_name)] : null,
      pos ? [h('dt', {}, t('kc_pos')), h('dd', {}, pos)] : null,
      k.logo ? [h('dt', {}, 'Logo'), h('dd', {}, k.logo + (k.rights ? ' ✓' : ''))] : null),
    h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap;margin-top:10px' },
      q.konfig ? h('a', { class: 'btn primary', href: '#/konfig?inquiry=' + q.id }, '🎨 ' + t('konfig_open_inq')) : null,
      q.has_preview ? h('a', { class: 'btn', href: url('preview', 1) }, '⬇ ' + t('inq_preview_dl')) : null,
      q.has_logo ? h('a', { class: 'btn', href: url('logo', 1) }, '⬇ ' + t('inq_logo_dl')) : null));
};
})();
