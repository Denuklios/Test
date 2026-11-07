// Postfach im Auftragsprogramm: Posteingang, Lesen, Schreiben (mit Bildern, Anhängen, Signatur), Übersetzen.
// Nutzt die Helfer aus app.js (h, api, show, t, toast, route, BASE, W.me, W.lang).
(() => {
'use strict';
const W = window.WFApp;
const { h, api, show, t, toast, route, render, BASE } = W;

const MAIL = { status: null, unread: 0, inqNew: 0, lastSync: 0, customers: null };

// ---------- kleine Helfer ----------
const mailDate = (s) => {
  if (!s) return '';
  const d = new Date(String(s).replace(' ', 'T') + 'Z');
  const now = new Date();
  const loc = W.lang === 'da' ? 'da-DK' : 'de-DE';
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
  if (now - d < 6 * 86400000) return d.toLocaleDateString(loc, { weekday: 'short' }) + ' ' + d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString(loc, { day: '2-digit', month: '2-digit', year: '2-digit' });
};
const mailDateLong = (s) => s ? new Date(String(s).replace(' ', 'T') + 'Z').toLocaleString(W.lang === 'da' ? 'da-DK' : 'de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const fsize = (n) => n > 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const who = (a) => a ? (a.name || a.addr) : '';
const escH = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const addrList = (l) => (l || []).map((a) => a.name ? `"${a.name.replace(/"/g, '')}" <${a.addr}>` : a.addr).join(', ');

async function mailStatus(force) {
  if (!MAIL.status || force) { MAIL.status = await api('mail_status'); MAIL.unread = MAIL.status.unread; MAIL.inqNew = MAIL.status.inq_new || 0; }
  mailBadge();
  return MAIL.status;
}
function mailBadge() {
  const a = document.querySelector('.nav a[data-r="/mail"]');
  if (!a) return;
  let b = a.querySelector('.mbadge');
  if (!b) { b = h('i', { class: 'mbadge' }); a.append(b); }
  const n = (MAIL.unread || 0) + (MAIL.inqNew || 0);
  b.textContent = n > 99 ? '99+' : String(n || '');
  b.classList.toggle('hidden', !n);
  b.title = t('mail_badge_title', MAIL.unread || 0, MAIL.inqNew || 0);
}
// im Hintergrund abrufen (höchstens jede Minute), Zähler aktualisieren
// läuft schon ein Abruf, wird auf ihn gewartet (z. B. direkt nach dem Einrichten)
async function mailSync(force) {
  if (MAIL.syncP) return MAIL.syncP;
  if (!force && Date.now() - MAIL.lastSync < 60000) return null;
  MAIL.lastSync = Date.now();
  MAIL.syncP = (async () => {
    try { const r = await api('mail_sync'); MAIL.unread = r.unread; MAIL.inqNew = r.inq_new || 0; mailBadge(); return r; } catch (e) { if (force) toast(e.message); return null; } finally { MAIL.syncP = null; }
  })();
  return MAIL.syncP;
}
setInterval(() => { if (W.me && !document.hidden && MAIL.status && (MAIL.status.configured || MAIL.status.site_db)) mailSync(); }, 120000);
setTimeout(async () => { if (W.me) { try { const s = await mailStatus(); if (s.configured) mailSync(); } catch (e) { /* kein Postfach */ } } }, 1500);

// HTML einer Mail sicher anzeigen: eigene Seite ohne Skripte, Bilder nur data:/Netz (wenn freigegeben)
function mailFrame(html) {
  const f = h('iframe', { class: 'mailframe', sandbox: 'allow-popups allow-popups-to-escape-sandbox allow-same-origin', referrerpolicy: 'no-referrer', title: 'Mail' });
  const csp = "default-src 'none'; img-src data: https: http:; style-src 'unsafe-inline'; font-src data: https:";
  f.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank">
<style>html,body{margin:0;padding:0;background:#fff;color:#1f1a2b;font:15px/1.5 -apple-system,Segoe UI,Arial,sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%}blockquote{margin:0 0 0 .6em;padding-left:.8em;border-left:3px solid #d8d2e6;color:#5f5872}pre{white-space:pre-wrap}</style></head><body>${html}</body></html>`;
  const fit = () => { try { const d = f.contentDocument; if (d && d.body) f.style.height = Math.min(20000, Math.max(120, d.documentElement.scrollHeight + 8)) + 'px'; } catch (e) { /* fremd */ } };
  f.addEventListener('load', () => { fit(); setTimeout(fit, 400); setTimeout(fit, 1500); try { f.contentDocument.querySelectorAll('img').forEach((i) => i.addEventListener('load', fit)); } catch (e) { /* egal */ } });
  return f;
}

// ---------- Posteingang ----------
let mailFolder = null, mailQ = '', inqStatus = 'open';
const INQ_ST = { new: 'inq_st_new', in_progress: 'inq_st_progress', done: 'inq_st_done', archived: 'inq_st_archived' };
route(/^\/mail$/, async () => {
  const st = await mailStatus(true);
  if (!mailFolder) mailFolder = !st.configured && st.site_db ? 'inq' : 'in';
  const list = h('div', { class: 'mlist' });
  let offset = 0;
  const more = h('button', { class: 'btn hidden', onclick: () => load(true) }, t('mail_more'));
  const syncInfo = h('small', { class: 'muted' });
  const row = (m) => {
    const other = m.folder === 'sent' ? '→ ' + (m.to || []).map(who).join(', ') : (m.from_name || m.from_addr);
    return h('a', { class: 'mrow' + (+m.seen || m.folder === 'sent' ? '' : ' unread'), href: `#/mail/${m.id}` },
      h('span', { class: 'mwho' }, other || '—'),
      h('span', { class: 'mdate' }, (+m.has_att ? '📎 ' : '') + mailDate(m.sent_at)),
      h('span', { class: 'msubj' }, m.subject || t('mail_no_subject')),
      h('span', { class: 'msnip' }, m.snippet || ''),
      m.customer_name || m.order_nr ? h('span', { class: 'mtags' }, m.customer_name ? h('span', { class: 'chip' }, '👤 ' + m.customer_name) : null, m.order_nr ? h('span', { class: 'chip' }, '📋 ' + m.order_nr) : null) : null);
  };
  // Anfragen von der Webseite (Kontaktformular)
  const inqRow = (q) => h('a', { class: 'mrow' + (q.status === 'new' ? ' unread' : ''), href: `#/inquiry/${q.id}` },
    h('span', { class: 'mwho' }, q.name || q.email),
    h('span', { class: 'mdate' }, (q.file_name ? '📎 ' : '') + mailDate(localToUtc(q.created_at))),
    h('span', { class: 'msubj' }, [q.qty, q.product].filter(Boolean).join(' × ') || t('inq_title')),
    h('span', { class: 'msnip' }, q.snippet || ''),
    h('span', { class: 'mtags' }, h('span', { class: 'chip inq-' + q.status }, t(INQ_ST[q.status] || 'inq_st_new')), q.wish_date ? h('span', { class: 'chip' }, '📅 ' + q.wish_date) : null,
      q.customer_id ? h('span', { class: 'chip' }, '👤 ' + t('inq_known')) : null, q.lang && q.lang !== 'de' ? h('span', { class: 'chip' }, q.lang === 'da' ? '🇩🇰' : '🇬🇧') : null));
  const inqChips = h('div', { class: 'row hidden', style: 'gap:6px;flex-wrap:wrap;margin:0 0 8px' });
  const load = async (append) => {
    if (mailFolder === 'inq') {
      if (!st.site_db) { list.replaceChildren(h('div', { class: 'empty' }, t('inq_no_site'))); return; }
      const r = await api('inquiries', { params: { status: inqStatus, q: mailQ } });
      inqChips.classList.remove('hidden');
      inqChips.replaceChildren(...[['open', t('inq_open')], ['new', t('inq_st_new')], ['in_progress', t('inq_st_progress')], ['done', t('inq_st_done')], ['archived', t('inq_st_archived')], ['all', t('inq_all')]].map(([k, l]) =>
        h('button', { class: 'chip' + (inqStatus === k ? ' on' : ''), onclick: () => { inqStatus = k; load(); } }, l,
          k === 'open' ? ' ' + ((r.counts.new || 0) + (r.counts.in_progress || 0)) : r.counts[k] ? ' ' + r.counts[k] : '')));
      list.replaceChildren(...(r.inquiries.length ? r.inquiries.map(inqRow) : [h('div', { class: 'empty' }, t('inq_none'))]));
      more.classList.add('hidden');
      MAIL.inqNew = r.counts.new || 0; mailBadge();
      return;
    }
    inqChips.classList.add('hidden');
    if (!st.configured) {
      list.replaceChildren(h('div', { class: 'card', style: 'margin:0;border:0' }, h('h3', {}, '✉ ' + t('mail_setup_h')), h('p', { class: 'muted' }, t('mail_setup_text')),
        h('a', { class: 'btn primary', href: '#/settings', onclick: () => { try { localStorage.setItem('wf_open_mailcard', '1'); } catch (e) { /* egal */ } } }, '⚙ ' + t('mail_setup_btn'))));
      return;
    }
    if (!append) offset = 0;
    const r = await api('mail_list', { params: { folder: mailFolder, q: mailQ, offset } });
    offset += r.mails.length;
    const rows = r.mails.map(row);
    if (append) list.append(...rows); else list.replaceChildren(...(rows.length ? rows : [h('div', { class: 'empty' }, mailQ ? t('mail_none_found') : t('mail_empty'))]));
    more.classList.toggle('hidden', !r.more);
  };
  const tabs = h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap' }, ...[['inq', '📝 ' + t('inq_tab'), MAIL.inqNew], ['in', '📥 ' + t('mail_inbox'), MAIL.unread], ['sent', '📤 ' + t('mail_sent')], ['archived', '🗄 ' + t('mail_archive')]]
    .filter(([k]) => k !== 'inq' || st.site_db).map(([k, l, n]) =>
      h('button', { class: 'chip' + (mailFolder === k ? ' on' : ''), onclick: () => { mailFolder = k; render(); } }, l, n ? h('b', { class: 'cnt' }, ' ' + n) : null)));
  const search = h('input', { type: 'search', placeholder: mailFolder === 'inq' ? t('inq_search') : t('mail_search'), value: mailQ, oninput: (e) => { mailQ = e.target.value; clearTimeout(search._t); search._t = setTimeout(() => load(), 300); } });
  const syncBtn = h('button', { class: 'btn', onclick: async () => { syncBtn.disabled = true; syncInfo.textContent = t('mail_syncing'); const r = await mailSync(true); syncBtn.disabled = false; syncInfo.textContent = r ? (r.ok && !r.not_configured ? t('mail_synced', r.new || 0) : r.not_configured ? '' : t('mail_sync_err', r.detail || '')) : ''; await load(); } }, '↻ ' + t('mail_fetch'));
  show(h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow' }, t('nav_mail')), h('h1', {}, t('mail_h1_a'), ' ', h('em', {}, t('mail_h1_b')))),
      st.configured || st.smtp || /@/.test(st.from.addr || '') ? h('a', { class: 'btn primary', href: '#/mail/new' }, '✏️ ' + t('mail_new')) : null),
    st.error && mailFolder !== 'inq' ? h('div', { class: 'warnline' }, '⚠ ' + t('mail_last_error', st.error)) : null,
    h('div', { class: 'filters mtools' }, tabs, h('div', { class: 'row', style: 'gap:6px;flex:1;min-width:220px' }, search, syncBtn)), syncInfo, inqChips,
    h('div', { class: 'card', style: 'padding:0;overflow:hidden' }, list), more);
  await load();
  if (!st.configured) return;
  // beim Öffnen gleich nach Neuem sehen (oder auf einen laufenden Abruf warten)
  const empty = !list.querySelector('.mrow');
  const r = await mailSync(empty);
  if (r && (r.new || empty) && location.hash.startsWith('#/mail') && mailFolder !== 'inq') load();
});

// Datum der Webseiten-Datenbank ist Ortszeit (nicht UTC): für die Anzeige umrechnen
function localToUtc(s) { const d = new Date(String(s).replace(' ', 'T')); return isNaN(d) ? s : d.toISOString().slice(0, 19).replace('T', ' '); }

// ---------- eine Anfrage ----------
route(/^\/inquiry\/(\d+)$/, async (id) => {
  const q = (await api('app_inquiry', { params: { id } })).inquiry;
  const tel = (q.phone || '').replace(/[^\d+]/g, '');
  const row = (k, v) => v ? h('div', {}, h('label', {}, t(k)), h('div', { style: 'white-space:pre-wrap' }, v)) : null;
  let known = null;
  try { const c = MAIL.customers || (MAIL.customers = (await api('customers')).customers || []); known = c.find((x) => (x.email || '').toLowerCase().trim() === (q.email || '').toLowerCase().trim()) || null; } catch (e) { known = null; }
  const notify = h('input', { type: 'checkbox', checked: true, style: 'width:20px;height:20px' });
  const sel = h('select', { onchange: async () => {
    try { const r = await api('inquiry_status', { body: { id: q.id, status: sel.value, notify: notify.checked ? 1 : 0 } }); toast(r.mailed ? t('inq_saved_mailed') : t('saved')); q.status = sel.value; mailStatus(true); } catch (e) { toast(e.message); }
  } }, ...Object.entries(INQ_ST).map(([k, l]) => h('option', { value: k, selected: q.status === k }, t(l))));
  const note = [q.name, q.email, q.phone, q.product ? `${q.qty ? parseInt(q.qty, 10) + 'x ' : ''}${q.product}` : (q.qty ? `${t('q_qty')}: ${q.qty}` : ''),
    q.wish_date ? `${t('inq_deadline')} ${new Date(q.wish_date).toLocaleDateString(W.lang === 'da' ? 'da-DK' : 'de-DE')}` : '', q.message].filter(Boolean).join('\n');
  show(h('div', { class: 'row', style: 'margin-bottom:8px' }, h('a', { class: 'btn small', href: '#/mail', onclick: () => { mailFolder = 'inq'; } }, '← ' + t('inq_tab'))),
    h('div', { class: 'card mhead' },
      h('div', { class: 'eyebrow' }, t('inq_title') + ' #' + q.id + ' · ' + mailDateLong(localToUtc(q.created_at))),
      h('h2', { style: 'margin:4px 0 8px' }, q.name),
      h('dl', { class: 'kv' },
        h('dt', {}, t('mail_from')), h('dd', {}, h('a', { href: `#/mail/new?inquiry=${q.id}` }, q.email)),
        q.phone ? h('dt', {}, t('q_phone')) : null, q.phone ? h('dd', {}, q.phone) : null,
        q.product ? h('dt', {}, t('q_product')) : null, q.product ? h('dd', {}, q.product) : null,
        q.qty ? h('dt', {}, t('q_qty')) : null, q.qty ? h('dd', {}, q.qty) : null,
        q.wish_date ? h('dt', {}, t('q_wish')) : null, q.wish_date ? h('dd', {}, q.wish_date) : null,
        q.lang ? h('dt', {}, t('inq_lang')) : null, q.lang ? h('dd', {}, { de: '🇩🇪 Deutsch', da: '🇩🇰 Dansk', en: '🇬🇧 English' }[q.lang] || q.lang) : null),
      h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap;margin-top:10px' },
        h('a', { class: 'btn primary', href: `#/mail/new?inquiry=${q.id}` }, '↩ ' + t('inq_reply')),
        q.order_id ? h('a', { class: 'btn', href: `#/order/${q.order_id}` }, '🧾 ' + t('inq_to_order_open')) : h('a', { class: 'btn', href: '#/new?note=' + encodeURIComponent(note), onclick: () => {
          // Kunde bekommt wie bisher „in Bearbeitung“; danach gilt die Anfrage als erledigt (ohne Mail), weil sie jetzt ein Auftrag ist
          (q.status === 'new' ? api('inquiry_status', { body: { id: q.id, status: 'in_progress', notify: 1 } }) : Promise.resolve())
            .then(() => (['done', 'archived'].includes(q.status) ? null : api('inquiry_status', { body: { id: q.id, status: 'done', notify: 0 } })))
            .then(() => mailStatus(true)).catch(() => {});
        } }, '🧾 ' + t('inq_to_order')),
        known ? h('a', { class: 'btn', href: `#/customer/${known.id}` }, '👤 ' + known.name) : h('a', { class: 'btn', href: '#/customer/new', onclick: () => { try { sessionStorage.setItem('wf_new_customer', JSON.stringify({ name: q.name || '', email: q.email || '' })); } catch (e) { /* egal */ } } }, '👤＋ ' + t('mail_new_customer')),
        tel ? h('a', { class: 'btn', href: 'tel:' + tel }, '📞 ' + t('inq_call')) : null,
        tel ? h('a', { class: 'btn', href: 'https://wa.me/' + tel.replace(/^\+/, '').replace(/^00/, ''), target: '_blank', rel: 'noopener' }, '💬 WhatsApp') : null)),
    window.konfigInquiryCard ? window.konfigInquiryCard(q) : null,
    h('div', { class: 'card' }, row('q_message', q.message)),
    (q.files || []).length || q.file_name ? h('div', { class: 'card' }, h('h3', { style: 'margin:0 0 10px' }, '📎 ' + t('inq_files')),
      (q.files || []).length ? h('div', { class: 'files' }, q.files.map((f) => h('div', { class: 'file' },
        h('a', { href: `${BASE}file.php?id=${f.id}`, target: '_blank', rel: 'noopener' }, (f.mime || '').startsWith('image/') ? h('img', { src: `${BASE}file.php?id=${f.id}&thumb=1`, alt: f.original_name, loading: 'lazy' }) : h('div', { class: 'pdf' }, (f.original_name.split('.').pop() || 'Datei').toUpperCase())),
        h('div', { class: 'n' }, h('span', { style: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, f.original_name)))))
        : h('p', { class: 'muted', style: 'margin:0' }, t('inq_file_missing', q.file_name))) : null,
    h('div', { class: 'card' }, h('div', { class: 'grid', style: 'grid-template-columns:minmax(0,1fr);gap:8px' }, h('div', {}, h('label', {}, t('inq_status')), sel),
      h('label', { class: 'row', style: 'gap:8px;margin:0;text-transform:none;letter-spacing:0;font-size:.9rem;color:var(--text)' }, notify, t('inq_notify')))));
});

// ---------- Lesen ----------
route(/^\/mail\/(\d+)$/, async (id) => {
  let remote = false, translated = null;
  const draw = async () => {
    const r = await api('mail_get', { params: { id, remote: remote ? 1 : 0 } });
    const m = r.mail;
    MAIL.unread = Math.max(0, MAIL.unread - (m.seen ? 0 : 1)); mailBadge();
    const body = h('div', { class: 'mbody' }, mailFrame(translated || m.html));
    const att = r.atts.filter((a) => !+a.inline || !/^image\//.test(a.mime));
    const attUrl = (a, dl) => `${BASE}api.php?a=mail_att&id=${a.id}${dl ? '&dl=1' : ''}`;
    const assign = h('div', { class: 'massign' });
    const drawAssign = async () => {
      const c = MAIL.customers || (MAIL.customers = (await api('customers')).customers || []);
      const sel = h('select', { onchange: async () => { await api('mail_update', { body: { id: m.id, customer_id: +sel.value || 0, order_id: m.order_id || 0 } }); toast(t('saved')); draw(); } },
        h('option', { value: '' }, '— ' + t('mail_no_customer') + ' —'), ...c.map((x) => h('option', { value: x.id, selected: +x.id === +m.customer_id }, x.name + (x.company ? ' · ' + x.company : ''))));
      assign.replaceChildren(h('label', {}, t('mail_customer')), sel);
    };
    const actions = h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap' },
      h('a', { class: 'btn primary', href: `#/mail/new?mode=reply&id=${m.id}` }, '↩ ' + t('mail_reply')),
      (m.to.length + m.cc.length > 1) ? h('a', { class: 'btn', href: `#/mail/new?mode=all&id=${m.id}` }, '↩↩ ' + t('mail_reply_all')) : null,
      h('a', { class: 'btn', href: `#/mail/new?mode=fwd&id=${m.id}` }, '↪ ' + t('mail_forward')),
      h('button', { class: 'btn', onclick: async () => {
        if (translated) { translated = null; draw(); return; }
        try { toast(t('mail_translating')); translated = (await api('mail_translate', { body: { html: m.html, target: W.lang === 'da' ? 'da' : 'de' } })).html; draw(); } catch (e) { toast(e.message); }
      } }, translated ? '↶ ' + t('mail_original') : '🌐 ' + t(W.lang === 'da' ? 'mail_tr_to_da' : 'mail_tr_to_de')),
      h('button', { class: 'btn', onclick: async () => { await api('mail_update', { body: { id: m.id, archived: +m.archived ? 0 : 1 } }); toast(+m.archived ? t('mail_unarchived') : t('mail_archived')); location.hash = '#/mail'; } }, +m.archived ? '📥 ' + t('mail_unarchive') : '🗄 ' + t('mail_do_archive')),
      m.folder === 'in' ? h('button', { class: 'btn', onclick: async () => { await api('mail_update', { body: { id: m.id, seen: 0 } }); MAIL.unread++; mailBadge(); location.hash = '#/mail'; } }, '● ' + t('mail_mark_unread')) : null);
    show(h('div', { class: 'row', style: 'margin-bottom:8px' }, h('a', { class: 'btn small', href: '#/mail' }, '← ' + t('nav_mail'))),
      h('div', { class: 'card mhead' },
        h('h2', { style: 'margin:0 0 8px' }, m.subject || t('mail_no_subject')),
        h('dl', { class: 'kv' },
          h('dt', {}, t('mail_from')), h('dd', {}, h('b', {}, m.from_name || m.from_addr), m.from_name ? h('span', { class: 'muted' }, ' <' + m.from_addr + '>') : null),
          h('dt', {}, t('mail_to')), h('dd', {}, addrList(m.to)),
          m.cc.length ? h('dt', {}, 'Cc') : null, m.cc.length ? h('dd', {}, addrList(m.cc)) : null,
          h('dt', {}, t('mail_date')), h('dd', {}, mailDateLong(m.sent_at))),
        h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap;margin-top:8px' },
          m.customer_id ? h('a', { class: 'chip', href: `#/customer/${m.customer_id}` }, '👤 ' + (m.customer_name || t('mail_customer'))) : null,
          m.order_id ? h('a', { class: 'chip', href: `#/order/${m.order_id}` }, '📋 ' + m.order_nr + (m.order_title ? ' · ' + m.order_title : '')) : null,
          h('button', { class: 'chip', onclick: drawAssign }, m.customer_id ? '✎ ' + t('mail_change_customer') : '＋ ' + t('mail_assign_customer')),
          !m.customer_id && m.folder === 'in' ? h('a', { class: 'chip', href: `#/customer/new`, onclick: () => { try { sessionStorage.setItem('wf_new_customer', JSON.stringify({ name: m.from_name || '', email: m.from_addr })); } catch (e) { /* egal */ } } }, '👤＋ ' + t('mail_new_customer')) : null,
          m.customer_id ? h('a', { class: 'chip', href: `#/new/customer/${m.customer_id}` }, '📋＋ ' + t('mail_new_order')) : null),
        assign, actions),
      +m.too_large ? h('div', { class: 'warnline' }, '⚠ ' + t('mail_too_large')) : null,
      m.blocked && !remote ? h('div', { class: 'warnline' }, '🖼 ' + t('mail_blocked', m.blocked), ' ', h('button', { class: 'btn small', onclick: () => { remote = true; draw(); } }, t('mail_show_images'))) : null,
      h('div', { class: 'card', style: 'padding:10px' }, body),
      att.length ? h('div', { class: 'card' }, h('h3', {}, '📎 ' + t('mail_attachments')),
        h('div', { class: 'matts' }, ...att.map((a) => h('a', { class: 'matt', href: attUrl(a, !/^(image\/(jpeg|png|gif|webp)|application\/pdf)$/.test(a.mime)), target: '_blank', rel: 'noopener' },
          /^image\//.test(a.mime) ? h('img', { src: attUrl(a), alt: '', loading: 'lazy' }) : h('span', { class: 'mico' }, /pdf/.test(a.mime) ? 'PDF' : '📄'),
          h('span', { class: 'mn' }, a.name), h('small', { class: 'muted' }, fsize(+a.size)))))) : null,
      r.thread.length > 1 ? h('div', { class: 'card' }, h('h3', {}, '🧵 ' + t('mail_thread', r.thread.length)),
        h('div', { class: 'mthread' }, ...r.thread.map((x) => h('a', { class: 'mtrow' + (+x.id === +m.id ? ' on' : ''), href: `#/mail/${x.id}` },
          h('span', {}, x.folder === 'sent' ? '📤 ' : '📥 ', h('b', {}, x.folder === 'sent' ? t('mail_me') : (x.from_name || x.from_addr))), h('span', { class: 'muted' }, mailDate(x.sent_at)), h('span', { class: 'msnip' }, x.snippet))))) : null);
  };
  await draw();
});

// ---------- Schreiben ----------
// Bild verkleinern (max. 1600 px), damit Mails nicht riesig werden
function mailImg(file) {
  return new Promise((res) => {
    const rd = new FileReader();
    rd.onload = () => {
      const im = new Image();
      im.onload = () => {
        const k = Math.min(1, 1600 / Math.max(im.width, im.height));
        if (k >= 1 && file.size < 400000) return res(rd.result);
        const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        res(c.toDataURL(file.type === 'image/png' && file.size < 1500000 ? 'image/png' : 'image/jpeg', 0.85));
      };
      im.onerror = () => res(null);
      im.src = rd.result;
    };
    rd.readAsDataURL(file);
  });
}
// kleiner Editor mit Werkzeugleiste (fett, kursiv, Listen, Link, Bild, Farbe)
function mailEditor(html, { placeholder = '', minH = 220 } = {}) {
  const ed = h('div', { class: 'meditor', contenteditable: 'true', 'data-ph': placeholder, style: `min-height:${minH}px` });
  ed.innerHTML = html || '';
  const ex = (c, v = null) => { ed.focus(); document.execCommand(c, false, v); };
  const pickImg = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'hidden', onchange: async () => { for (const f of pickImg.files) { const d = await mailImg(f); if (d) ex('insertHTML', `<img src="${d}" alt="" style="max-width:100%">`); } pickImg.value = ''; } });
  const b = (label, title, fn) => h('button', { type: 'button', class: 'tbtn', title, 'aria-label': title, onmousedown: (e) => e.preventDefault(), onclick: fn }, label);
  const color = h('input', { type: 'color', value: '#7e22ce', class: 'tcolor', title: t('ed_color'), oninput: () => ex('foreColor', color.value) });
  const bar = h('div', { class: 'mtoolbar' },
    b(h('b', {}, 'B'), t('ed_bold'), () => ex('bold')), b(h('i', {}, 'I'), t('ed_italic'), () => ex('italic')), b(h('u', {}, 'U'), t('ed_underline'), () => ex('underline')),
    b('•', t('ed_list'), () => ex('insertUnorderedList')), b('1.', t('ed_olist'), () => ex('insertOrderedList')),
    b('A+', t('ed_bigger'), () => ex('fontSize', '5')), b('A', t('ed_normal'), () => ex('fontSize', '3')), color,
    b('🔗', t('ed_link'), () => { const u = prompt(t('ed_link_q'), 'https://'); if (u && /^(https?:|mailto:)/i.test(u)) ex('createLink', u); }),
    b('🖼', t('ed_image'), () => pickImg.click()), b('⌫', t('ed_clear'), () => ex('removeFormat')), pickImg);
  // eingefügte Bilder (Strg+V / Screenshot) direkt einbetten; eingefügten Text von fremden Stilen befreien
  ed.addEventListener('paste', async (e) => {
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (files.length) { e.preventDefault(); for (const f of files) { const d = await mailImg(f); if (d) ex('insertHTML', `<img src="${d}" alt="" style="max-width:100%">`); } }
  });
  ed.addEventListener('drop', async (e) => {
    const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (files.length) { e.preventDefault(); for (const f of files) { const d = await mailImg(f); if (d) ex('insertHTML', `<img src="${d}" alt="" style="max-width:100%">`); } }
  });
  return { el: h('div', { class: 'meditwrap' }, bar, ed), ed, get: () => ed.innerHTML, set: (x) => { ed.innerHTML = x; } };
}

const reSubj = (s, p) => (new RegExp('^\\s*(' + p + '|re|aw|sv|fw|fwd|wg|vs)\\s*:', 'i').test(s || '') ? s : `${p}: ${s || ''}`);

route(/^\/mail\/new(?:\?([\s\S]*))?$/, async (qs) => {
  const P = new URLSearchParams(qs || '');
  const st = await mailStatus();
  if (!st.configured && !st.smtp && !/@/.test(st.from.addr || '')) { toast(t('mail_setup_text')); location.hash = '#/settings'; return; }
  const mode = P.get('mode') || '';
  let orig = null, origAtts = [];
  if (P.get('id')) { const r = await api('mail_get', { params: { id: P.get('id') } }); orig = r.mail; origAtts = r.atts; }
  const myAddr = (st.from.addr || '').toLowerCase();
  let to = P.get('to') || '', cc = '', subject = P.get('subject') || '';
  let customerId = +P.get('customer') || 0, orderId = +P.get('order') || 0;
  if (orig) {
    customerId = customerId || +orig.customer_id || 0; orderId = orderId || +orig.order_id || 0;
    if (mode === 'fwd') subject = reSubj(orig.subject, 'WG');
    else {
      subject = reSubj(orig.subject, 'AW');
      const back = orig.folder === 'sent' ? orig.to : [{ addr: orig.from_addr, name: orig.from_name }];
      to = addrList(back);
      if (mode === 'all') cc = addrList([...orig.to, ...orig.cc].filter((a) => a.addr !== myAddr && !back.some((b) => b.addr === a.addr)));
    }
  }
  // Antwort auf eine Website-Anfrage: Adresse, Betreff in der Sprache des Kunden, Anfrage als Zitat
  let inq = null;
  if (P.get('inquiry')) {
    try { inq = (await api('app_inquiry', { params: { id: P.get('inquiry') } })).inquiry; } catch (e) { inq = null; }
    if (inq) {
      to = inq.name ? `"${inq.name.replace(/"/g, '')}" <${inq.email}>` : inq.email;
      const subj = { de: 'Deine Anfrage bei Wunsch-Fabrik', da: 'Din forespørgsel hos Wunsch-Fabrik', en: 'Your enquiry at Wunsch-Fabrik' }[inq.lang] || 'Deine Anfrage bei Wunsch-Fabrik';
      subject = subj + (inq.product ? ' – ' + inq.product : '');
      try { const c = MAIL.customers || (MAIL.customers = (await api('customers')).customers || []); const k = c.find((x) => (x.email || '').toLowerCase().trim() === (inq.email || '').toLowerCase().trim()); if (k) customerId = +k.id; } catch (e) { /* egal */ }
    }
  }
  // Auftrag/Kunde als Bezug: Adresse und Betreff vorschlagen
  let order = null;
  if (orderId && !orig) {
    try { order = (await api('order', { params: { id: orderId } })).order; } catch (e) { order = null; }
    if (order) { customerId = customerId || +order.customer_id; if (!to && order.customer_email) to = order.customer_name ? `"${order.customer_name}" <${order.customer_email}>` : order.customer_email; if (!subject) subject = `${order.nr} · ${order.title}`; }
  }
  if (customerId && !to) { try { const c = (await api('customer', { params: { id: customerId } })).customer; if (c.email) to = c.name ? `"${c.name}" <${c.email}>` : c.email; } catch (e) { /* egal */ } }

  const draftKey = 'wf_mail_draft_' + (orig ? mode + orig.id : inq ? 'i' + inq.id : orderId ? 'o' + orderId : customerId ? 'c' + customerId : 'new');
  let draft = null; try { draft = JSON.parse(localStorage.getItem(draftKey) || 'null'); } catch (e) { draft = null; }
  const F = {
    to: h('input', { type: 'text', value: draft ? draft.to : to, placeholder: t('mail_to_ph'), autocomplete: 'off', list: 'mailAddrs' }),
    cc: h('input', { type: 'text', value: draft ? draft.cc : cc, autocomplete: 'off', list: 'mailAddrs' }),
    bcc: h('input', { type: 'text', value: draft ? draft.bcc : '', autocomplete: 'off', list: 'mailAddrs' }),
    subject: h('input', { type: 'text', value: draft ? draft.subject : subject, maxlength: 300 }),
  };
  const ed = mailEditor(draft ? draft.html : '<p><br></p>', { placeholder: t('mail_body_ph') });
  const ccRow = h('div', { class: 'grid c2' + (F.cc.value || F.bcc.value ? '' : ' hidden') }, h('div', {}, h('label', {}, 'Cc'), F.cc), h('div', {}, h('label', {}, 'Bcc'), F.bcc));
  // Adressvorschläge aus den Kunden
  const dl = h('datalist', { id: 'mailAddrs' });
  (async () => { const c = MAIL.customers || (MAIL.customers = (await api('customers')).customers || []); dl.replaceChildren(...c.filter((x) => x.email).map((x) => h('option', { value: `"${x.name}" <${x.email}>` }))); })().catch(() => {});
  // Signatur und Zitat
  const sigOn = h('input', { type: 'checkbox', checked: true, style: 'width:20px;height:20px' });
  const sigBox = h('div', { class: 'msig' }); sigBox.innerHTML = st.signature.html || '';
  const quoteOn = h('input', { type: 'checkbox', checked: !!(orig || inq), style: 'width:20px;height:20px' });
  const quoteHead = orig ? (mode === 'fwd'
    ? `<p>-------- ${escH(t('mail_fwd_head'))} --------<br>${escH(t('mail_from'))}: ${escH(orig.from_name ? orig.from_name + ' <' + orig.from_addr + '>' : orig.from_addr)}<br>${escH(t('mail_date'))}: ${escH(mailDateLong(orig.sent_at))}<br>${escH(t('mail_subject'))}: ${escH(orig.subject)}<br>${escH(t('mail_to'))}: ${escH(addrList(orig.to))}</p>`
    : `<p>${escH(t('mail_quote_head', mailDateLong(orig.sent_at), orig.from_name || orig.from_addr))}</p>`) : '';
  const quoteHtml = orig ? quoteHead + (mode === 'fwd' ? orig.html : `<blockquote style="margin:0 0 0 .8ex;border-left:2px solid #ccc;padding-left:1ex">${orig.html}</blockquote>`)
    : inq ? `<p>${escH(t('mail_quote_head', mailDateLong(localToUtc(inq.created_at)), inq.name || inq.email))}</p><blockquote style="margin:0 0 0 .8ex;border-left:2px solid #ccc;padding-left:1ex"><div style="white-space:pre-wrap">${escH([inq.product ? (inq.qty ? inq.qty + ' × ' : '') + inq.product : '', inq.wish_date ? t('q_wish') + ': ' + inq.wish_date : '', inq.message].filter(Boolean).join('\n\n'))}</div></blockquote>` : '';
  // Anhänge: neue Dateien, beim Weiterleiten die der Originalmail, aus dem Auftrag die Auftragsdateien
  const files = [];
  const fwd = new Set(mode === 'fwd' ? origAtts.filter((a) => !+a.inline).map((a) => +a.id) : []);
  const ofiles = new Set();
  const attList = h('div', { class: 'matts' });
  const drawAtts = () => attList.replaceChildren(
    ...files.map((f, i) => h('span', { class: 'matt edit' }, h('span', { class: 'mico' }, '📎'), h('span', { class: 'mn' }, f.name), h('small', { class: 'muted' }, fsize(f.size)), h('button', { type: 'button', class: 'btn small', onclick: () => { files.splice(i, 1); drawAtts(); } }, '✕'))),
    ...origAtts.filter((a) => fwd.has(+a.id)).map((a) => h('span', { class: 'matt edit' }, h('span', { class: 'mico' }, '↪'), h('span', { class: 'mn' }, a.name), h('small', { class: 'muted' }, fsize(+a.size)), h('button', { type: 'button', class: 'btn small', onclick: () => { fwd.delete(+a.id); drawAtts(); } }, '✕'))),
    ...((order && order.files) || []).filter((f) => ofiles.has(+f.id)).map((f) => h('span', { class: 'matt edit' }, h('span', { class: 'mico' }, '📋'), h('span', { class: 'mn' }, f.original_name), h('small', { class: 'muted' }, fsize(+f.size)), h('button', { type: 'button', class: 'btn small', onclick: () => { ofiles.delete(+f.id); drawAtts(); } }, '✕'))));
  const pick = h('input', { type: 'file', multiple: true, class: 'hidden', onchange: () => { files.push(...pick.files); pick.value = ''; drawAtts(); } });
  if (orderId && !order) { try { order = (await api('order', { params: { id: orderId } })).order; } catch (e) { order = null; } }
  const ofPick = order && order.files && order.files.length ? h('select', { onchange: (e) => { if (e.target.value) { ofiles.add(+e.target.value); e.target.value = ''; drawAtts(); } } },
    h('option', { value: '' }, '📋 ' + t('mail_add_order_file')), ...order.files.map((f) => h('option', { value: f.id }, f.original_name))) : null;
  drawAtts();
  // Übersetzen mit einem Knopf; „Rückgängig“ holt den vorigen Text zurück
  let undo = null;
  const undoBtn = h('button', { type: 'button', class: 'btn small hidden', onclick: () => { if (undo !== null) { ed.set(undo); undo = null; undoBtn.classList.add('hidden'); } } }, '↶ ' + t('mail_undo'));
  const tr = (target, label) => h('button', { type: 'button', class: 'btn small', disabled: !st.deepl, title: st.deepl ? '' : t('mail_deepl_missing'), onclick: async (e) => {
    const b = e.currentTarget; b.disabled = true;
    try {
      const before = ed.get();
      const r = await api('mail_translate', { body: { html: before, target } });
      undo = before; ed.set(r.html); undoBtn.classList.remove('hidden');
      // bei Antworten bleibt der Betreff (AW: …) wie er ist
      if (!orig && F.subject.value.trim()) { try { const s = await api('mail_translate', { body: { html: escH(F.subject.value), target } }); const tmp = document.createElement('div'); tmp.innerHTML = s.html; F.subject.value = tmp.textContent; } catch (x) { /* Betreff bleibt */ } }
      toast(t('mail_translated'));
    } catch (x) { toast(x.message); } finally { b.disabled = false; }
  } }, label);
  // Entwurf merken (nur dieses Gerät)
  const saveDraft = () => { try { localStorage.setItem(draftKey, JSON.stringify({ to: F.to.value, cc: F.cc.value, bcc: F.bcc.value, subject: F.subject.value, html: ed.get() })); } catch (e) { /* voll */ } };
  [F.to, F.cc, F.bcc, F.subject].forEach((x) => x.addEventListener('input', saveDraft)); ed.ed.addEventListener('input', saveDraft);
  const sendBtn = h('button', { class: 'btn primary', onclick: async () => {
    if (!F.to.value.trim()) { toast(t('err_mail_no_to')); F.to.focus(); return; }
    if (!F.subject.value.trim() && !confirm(t('mail_no_subject_q'))) return;
    sendBtn.disabled = true; sendBtn.textContent = t('mail_sending');
    try {
      const html = ed.get() + (sigOn.checked && sigBox.innerHTML.trim() ? `<br><div class="wf-sig">${sigBox.innerHTML}</div>` : '') + (quoteOn.checked && quoteHtml ? `<br>${quoteHtml}` : '');
      const fd = new FormData();
      fd.append('data', JSON.stringify({ to: F.to.value, cc: F.cc.value, bcc: F.bcc.value, subject: F.subject.value, html, reply_id: orig && mode !== 'fwd' ? orig.id : 0,
        fwd_atts: [...fwd], order_files: [...ofiles], customer_id: customerId, order_id: orderId, inquiry_id: inq ? inq.id : 0 }));
      files.forEach((f) => fd.append('files[]', f, f.name));
      const r = await api('mail_send', { form: fd });
      try { localStorage.removeItem(draftKey); } catch (e) { /* egal */ }
      toast(r.copied || !st.configured ? t('mail_sent_ok') : t('mail_sent_nocopy'));
      location.hash = r.id ? `#/mail/${r.id}` : '#/mail';
    } catch (e) { toast(e.message); sendBtn.disabled = false; sendBtn.textContent = '➤ ' + t('mail_send'); }
  } }, '➤ ' + t('mail_send'));
  const qPrev = h('details', { class: 'calcbox' }, h('summary', {}, mode === 'fwd' ? t('mail_fwd_content') : t('mail_quote')));
  if (orig || inq) { const box = h('div', { class: 'mquote' }); qPrev.append(box); box.append(mailFrame(quoteHtml)); }
  show(h('div', { class: 'row', style: 'margin-bottom:8px' }, h('a', { class: 'btn small', href: orig ? `#/mail/${orig.id}` : inq ? `#/inquiry/${inq.id}` : '#/mail' }, '← ' + t('mail_back'))),
    h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow' }, t('nav_mail')), h('h1', {}, mode === 'fwd' ? t('mail_forward') : orig || inq ? t('mail_reply') : t('mail_new')))),
    h('div', { class: 'card grid mcompose' },
      h('div', { class: 'muted', style: 'font-size:.85rem' }, t('mail_from') + ': ' + (st.from.name ? st.from.name + ' <' + st.from.addr + '>' : st.from.addr)),
      h('div', {}, h('div', { class: 'row', style: 'justify-content:space-between' }, h('label', {}, t('mail_to')), h('button', { type: 'button', class: 'btn small', onclick: () => ccRow.classList.toggle('hidden') }, 'Cc/Bcc')), F.to),
      ccRow, dl,
      h('div', {}, h('label', {}, t('mail_subject')), F.subject),
      h('div', { class: 'row mtr', style: 'gap:6px;flex-wrap:wrap;align-items:center' }, h('span', { class: 'muted', style: 'font-size:.85rem' }, '🌐 ' + t('mail_translate_to')),
        tr('da', '🇩🇰 Dansk'), tr('en', '🇬🇧 English'), tr('de', '🇩🇪 Deutsch'), undoBtn,
        inq && inq.lang && inq.lang !== W.lang ? h('small', { class: 'muted', style: 'flex-basis:100%' }, t('inq_lang_hint', { de: 'Deutsch', da: 'Dansk', en: 'English' }[inq.lang] || inq.lang)) : null),
      ed.el,
      h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap' }, h('button', { type: 'button', class: 'btn', onclick: () => pick.click() }, '📎 ' + t('mail_attach')), ofPick, pick), attList,
      h('label', { class: 'row', style: 'gap:8px;margin:0;text-transform:none;letter-spacing:0;font-size:.9rem;color:var(--text)' }, sigOn, t('mail_with_sig'), h('a', { href: '#/settings', style: 'margin-left:auto;font-size:.8rem', onclick: () => { try { localStorage.setItem('wf_open_mailcard', '1'); } catch (e) { /* egal */ } } }, t('mail_edit_sig'))),
      sigBox,
      orig || inq ? h('label', { class: 'row', style: 'gap:8px;margin:0;text-transform:none;letter-spacing:0;font-size:.9rem;color:var(--text)' }, quoteOn, mode === 'fwd' ? t('mail_with_fwd') : inq ? t('inq_with_quote') : t('mail_with_quote')) : null,
      orig || inq ? qPrev : null,
      h('div', { class: 'row end', style: 'gap:8px' }, draft ? h('button', { type: 'button', class: 'btn', onclick: () => { try { localStorage.removeItem(draftKey); } catch (e) { /* egal */ } render(); } }, t('mail_discard')) : null, sendBtn)));
  setTimeout(() => (F.to.value ? ed.ed : F.to).focus(), 50);
});

// ---------- Mails zu Kunde / Auftrag (Karte für die Detailseiten) ----------
function mailCard({ customer_id = 0, order_id = 0 }) {
  const box = h('div', { class: 'mthread' }, h('span', { class: 'muted' }, '…'));
  const card = h('div', { class: 'card' }, h('div', { class: 'row', style: 'justify-content:space-between;align-items:center' }, h('h3', { style: 'margin:0' }, '✉ ' + (customer_id ? t('mail_card_h_c') : t('mail_card_h'))),
    h('a', { class: 'btn small primary', href: `#/mail/new?${order_id ? 'order=' + order_id : 'customer=' + customer_id}` }, '✏️ ' + t('mail_write'))), box);
  (async () => {
    try {
      // Mails (Postfach) und – beim Kunden – seine Anfragen von der Webseite, zusammen nach Datum
      const [r, iq] = await Promise.all([
        api('mail_list', { params: { folder: 'all', ...(order_id ? { order_id } : { customer_id }) } }).catch(() => ({ mails: [] })),
        customer_id ? api('inquiries', { params: { customer_id } }).catch(() => ({ inquiries: [] })) : Promise.resolve({ inquiries: [] })]);
      const items = [
        ...r.mails.map((x) => ({ at: x.sent_at, el: h('a', { class: 'mtrow' + (+x.seen || x.folder === 'sent' ? '' : ' unread'), href: `#/mail/${x.id}` },
          h('span', {}, x.folder === 'sent' ? '📤 ' : '📥 ', h('b', {}, x.subject || t('mail_no_subject'))), h('span', { class: 'muted' }, mailDate(x.sent_at)), h('span', { class: 'msnip' }, x.snippet)) })),
        ...iq.inquiries.map((q) => ({ at: localToUtc(q.created_at), el: h('a', { class: 'mtrow' + (q.status === 'new' ? ' unread' : ''), href: `#/inquiry/${q.id}` },
          h('span', {}, '📝 ', h('b', {}, t('inq_title') + ': ' + ([q.qty, q.product].filter(Boolean).join(' × ') || '—')), ' ', h('span', { class: 'chip inq-' + q.status, style: 'font-size:.7rem;padding:1px 7px;min-height:0' }, t(INQ_ST[q.status] || 'inq_st_new'))),
          h('span', { class: 'muted' }, mailDate(localToUtc(q.created_at))), h('span', { class: 'msnip' }, q.snippet || '')) }))]
        .sort((a, b) => String(b.at).localeCompare(String(a.at)));
      box.replaceChildren(...(items.length ? items.slice(0, 30).map((x) => x.el) : [h('span', { class: 'muted' }, customer_id ? t('mail_card_none_c') : t('mail_card_none'))]));
    } catch (e) { box.replaceChildren(h('span', { class: 'muted' }, e.message)); }
  })();
  return card;
}

// ---------- Einstellungen: Postfach & Signatur ----------
function mailSettingsCard() {
  const card = h('div', { class: 'card', id: 'mailCard' }, h('h3', {}, '✉ ' + t('mail_set_h')), h('p', { class: 'muted' }, t('mail_set_text')));
  (async () => {
    const st = await mailStatus(true);
    const host = h('input', { value: st.imap.host || 'imap.one.com', placeholder: 'imap.one.com' });
    const port = h('input', { type: 'number', value: st.imap.port || 993, style: 'width:90px' });
    const user = h('input', { value: st.imap.user || '', placeholder: t('mail_set_user_ph'), autocomplete: 'off' });
    const same = h('input', { type: 'checkbox', checked: !st.imap.own_pass && st.smtp, style: 'width:20px;height:20px' });
    const pass = h('input', { type: 'password', placeholder: st.imap.own_pass ? '••••••••' : '', autocomplete: 'new-password' });
    const passRow = h('div', { class: same.checked ? 'hidden' : '' }, h('label', {}, t('mail_set_pass')), pass);
    same.addEventListener('change', () => passRow.classList.toggle('hidden', same.checked));
    const deepl = h('input', { type: 'password', placeholder: st.deepl_own ? '••••••••' : (st.deepl ? t('mail_set_deepl_site') : 'xxxxxxxx-xxxx-…:fx'), autocomplete: 'off' });
    const out = h('p', { class: 'muted', style: 'margin:0' }, st.last_sync ? t('mail_set_last', st.last_sync) + (st.sent_box ? ' · ' + t('mail_set_sentbox', st.sent_box) : '') : '', st.error ? h('span', { class: 'err' }, ' ' + st.error) : null);
    const save = h('button', { class: 'btn primary', onclick: async () => {
      save.disabled = true;
      try {
        const r = await api('mail_settings_save', { body: { host: host.value.trim(), port: +port.value, user: user.value.trim(), pass: pass.value, same_pass: same.checked ? 1 : 0, deepl_key: deepl.value.trim() } });
        out.textContent = r.tested ? '✓ ' + t('mail_set_ok') : '⚠ ' + (r.detail || t('mail_set_fail'));
        if (r.tested) { MAIL.status = null; mailSync(true); }
      } catch (e) { out.textContent = e.message; } finally { save.disabled = false; }
    } }, t('mail_set_save'));
    const sig = mailEditor(st.signature.html, { minH: 90 });
    const sigSave = h('button', { class: 'btn', onclick: async () => { try { await api('mail_sig_save', { body: { html: sig.get() } }); MAIL.status = null; toast(t('saved')); } catch (e) { toast(e.message); } } }, t('mail_sig_save'));
    card.append(
      h('div', { class: 'grid', style: 'grid-template-columns:minmax(0,1fr) auto;gap:8px' }, h('div', {}, h('label', {}, t('mail_set_host')), host), h('div', {}, h('label', {}, 'Port'), port)),
      h('div', {}, h('label', {}, t('mail_set_user')), user),
      h('label', { class: 'row', style: 'gap:8px;margin:8px 0;text-transform:none;letter-spacing:0;font-size:.9rem;color:var(--text)' }, same, t('mail_set_same')),
      passRow,
      h('div', { style: 'margin-top:8px' }, h('label', {}, t('mail_set_deepl')), deepl, h('small', { class: 'muted hint' }, st.deepl ? t('mail_set_deepl_ok') : t('mail_set_deepl_none'))),
      h('div', { class: 'row', style: 'gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap' }, save, out),
      h('h3', { style: 'margin:18px 0 6px' }, '✍️ ' + t('mail_sig_h', W.me.user.name)), h('p', { class: 'muted', style: 'margin:0 0 6px' }, t('mail_sig_text')),
      sig.el, h('div', { class: 'row end', style: 'margin-top:8px' }, sigSave));
    try { if (localStorage.getItem('wf_open_mailcard')) { localStorage.removeItem('wf_open_mailcard'); card.classList.remove('closed'); card.scrollIntoView({ behavior: 'smooth' }); } } catch (e) { /* egal */ }
  })().catch((e) => card.append(h('p', { class: 'err' }, e.message)));
  return card;
}

window.mailCard = mailCard;
window.mailSettingsCard = mailSettingsCard;
window.mailBadge = mailBadge;
})();
