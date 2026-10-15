/* Verwaltung (nur Admin): Übersicht, Benutzer & Lizenzen, Einstellungen (Firmendaten für Rechtstexte, Testzeitraum, Kauf-Link), Protokoll */
(function () {
  const root = document.getElementById('adminApp');
  const de = root.dataset.lang !== 'en';
  const T = (a, b) => (de ? a : b);
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const api = async (path, opts = {}) => {
    const r = await fetch(path, { method: opts.method || 'GET', headers: { 'X-Requested-With': 'StickStudio', 'Content-Type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || d.message || r.status);
    return d;
  };
  const date = (ms) => (ms ? new Date(ms).toLocaleDateString(de ? 'de-DE' : 'en-GB') : '–');
  const dIn = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : '');
  const status = (u) => (u.role === 'admin' ? `<span class="pill admin">Admin</span>` : u.blocked ? `<span class="pill bad">${T('gesperrt', 'blocked')}</span>`
    : u.license.viewOnly ? `<span class="pill bad">${T('abgelaufen', 'expired')}</span>` : u.license.trial ? `<span class="pill trial">${T('Test', 'trial')} · ${u.license.daysLeft} ${T('T.', 'd')}</span>` : `<span class="pill ok">${T('Lizenz', 'licensed')} · ${u.license.daysLeft} ${T('T.', 'd')}</span>`);

  root.innerHTML = `<h1>${T('Verwaltung', 'Administration')}</h1><div class="tabs">
    <button data-tab="dash" class="on">${T('Übersicht', 'Overview')}</button><button data-tab="users">${T('Benutzer & Lizenzen', 'Users & licenses')}</button>
    <button data-tab="settings">${T('Einstellungen & Firmendaten', 'Settings & company data')}</button><button data-tab="log">${T('Protokoll', 'Log')}</button></div><div id="tab"></div>
    <dialog id="dlg"></dialog>`;
  const tab = document.getElementById('tab'), dlg = document.getElementById('dlg');
  const tabs = { dash, users, settings, log };
  root.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { root.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('on', x === b)); tabs[b.dataset.tab](); }));

  async function dash() {
    const s = await api('/api/admin/stats');
    const set = await api('/api/admin/settings');
    const todo = [];
    if (!set.mail) todo.push(T('E-Mail-Versand (SMTP) ist nicht eingerichtet – „Passwort vergessen“ und E-Mail-Bestätigung funktionieren erst danach.', 'Email (SMTP) is not set up – “forgot password” and email confirmation only work after that.'));
    if (!set.settings.company || !set.settings.street) todo.push(T('Firmendaten für Impressum und Rechtstexte fehlen (Reiter „Einstellungen“).', 'Company data for the legal notice and legal texts is missing (“Settings” tab).'));
    if (!set.settings.buy_url) todo.push(T('Kein Kauf-Link eingetragen – Kunden sehen dann „bitte Support kontaktieren“.', 'No purchase link set – customers will be told to contact support.'));
    if (!set.webhook) todo.push(T('Automatische Lizenzverlängerung nach Zahlung ist nicht eingerichtet (LEMONSQUEEZY_SECRET). Lizenzen dann von Hand verlängern.', 'Automatic license extension after payment is not set up (LEMONSQUEEZY_SECRET). Extend licenses manually.'));
    tab.innerHTML = `<div class="stats"><div><b>${s.users}</b>${T('Konten', 'accounts')}</div><div><b>${s.licensed}</b>${T('mit Lizenz', 'licensed')}</div><div><b>${s.trial}</b>${T('in der Testphase', 'in trial')}</div><div><b>${s.expired}</b>${T('abgelaufen', 'expired')}</div><div><b>${s.projects}</b>${T('Designs', 'designs')}</div></div>
      ${todo.length ? `<h2>${T('Noch zu erledigen', 'To do')}</h2><ul>${todo.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}`;
  }

  async function users(q = '') {
    tab.innerHTML = `<div class="row"><input id="q" placeholder="${T('Suchen: E-Mail oder Name', 'Search: email or name')}" value="${esc(q)}" style="flex:1"><button id="new">+ ${T('Benutzer anlegen', 'Add user')}</button></div><div id="list" class="muted">…</div>`;
    const list = await api('/api/admin/users?q=' + encodeURIComponent(q));
    document.getElementById('list').innerHTML = `<table class="list"><tr><th>${T('E-Mail / Name', 'Email / name')}</th><th>Status</th><th>${T('Lizenz bis', 'License until')}</th><th>${T('Test bis', 'Trial until')}</th><th>${T('Designs', 'Designs')}</th><th>${T('Letzte Anmeldung', 'Last sign-in')}</th><th></th></tr>
      ${list.map((u) => `<tr><td>${esc(u.email)}${u.name ? `<br><span class="muted">${esc(u.name)}</span>` : ''}${u.note ? `<br><span class="muted">📝 ${esc(u.note)}</span>` : ''}</td><td>${status(u)}${u.verified ? '' : `<br><span class="muted">${T('E-Mail unbestätigt', 'email unconfirmed')}</span>`}</td>
      <td>${date(u.license_until)}</td><td>${date(u.trial_until)}</td><td>${u.projects}</td><td>${date(u.last_login)}</td>
      <td><button data-ext="${u.id}">+1 ${T('Jahr', 'year')}</button> <button data-edit="${u.id}">${T('Bearbeiten', 'Edit')}</button></td></tr>`).join('')}</table>
      <p class="muted">${list.length} ${T('Konten', 'accounts')}</p>`;
    let tmr;
    const qi = document.getElementById('q');
    qi.oninput = () => { clearTimeout(tmr); tmr = setTimeout(() => users(qi.value), 300); };
    qi.focus(); qi.setSelectionRange(qi.value.length, qi.value.length);
    document.getElementById('new').onclick = newUser;
    tab.querySelectorAll('[data-ext]').forEach((b) => (b.onclick = async () => {
      const u = list.find((x) => x.id === +b.dataset.ext);
      if (!confirm(T(`Lizenz von ${u.email} um 365 Tage verlängern?`, `Extend the license of ${u.email} by 365 days?`))) return;
      await api(`/api/admin/users/${u.id}/extend`, { method: 'POST', body: { days: 365 } });
      users(qi.value);
    }));
    tab.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => edit(list.find((x) => x.id === +b.dataset.edit), () => users(qi.value))));
  }

  function edit(u, done) {
    dlg.innerHTML = `<h2>${esc(u.email)}</h2>
      <label>${T('Name / Firma', 'Name / company')}<input id="eName" value="${esc(u.name)}"></label>
      <div class="grid2"><label>${T('Lizenz gültig bis', 'License valid until')}<input type="date" id="eLic" value="${dIn(u.license_until)}"></label>
      <label>${T('Testversion bis', 'Trial until')}<input type="date" id="eTrial" value="${dIn(u.trial_until)}"></label></div>
      <div class="grid2"><label>${T('Rolle', 'Role')}<select id="eRole"><option value="user">${T('Kunde', 'Customer')}</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option></select></label>
      <label>${T('E-Mail bestätigt', 'Email confirmed')}<select id="eVer"><option value="1">${T('ja', 'yes')}</option><option value="0" ${u.verified ? '' : 'selected'}>${T('nein', 'no')}</option></select></label></div>
      <label class="check"><input type="checkbox" id="eBlock" ${u.blocked ? 'checked' : ''}> <span>${T('Konto sperren (Anmeldung nicht mehr möglich)', 'Block account (no sign-in possible)')}</span></label>
      <label>${T('Notiz (nur für dich)', 'Note (only for you)')}<textarea id="eNote">${esc(u.note)}</textarea></label>
      <div id="eMsg"></div>
      <div class="row" style="justify-content:space-between;margin-top:10px"><div class="row"><button id="eReset">${T('Link zum Passwort-Setzen', 'Password reset link')}</button><button id="eDel" class="danger">${T('Konto löschen', 'Delete account')}</button></div>
      <div class="row"><button id="eCancel">${T('Abbrechen', 'Cancel')}</button><button id="eSave" style="background:#1f6feb;color:#fff;border-color:#1f6feb">${T('Speichern', 'Save')}</button></div></div>`;
    dlg.showModal();
    const $ = (id) => document.getElementById(id);
    const msg = (ok, text) => { $('eMsg').innerHTML = `<div class="msg ${ok ? 'ok' : 'err'}">${text}</div>`; };
    $('eCancel').onclick = () => dlg.close();
    $('eSave').onclick = async () => {
      try {
        await api('/api/admin/users/' + u.id, { method: 'POST', body: { name: $('eName').value, license_until: $('eLic').value ? $('eLic').value + 'T23:59:59' : '', trial_until: $('eTrial').value ? $('eTrial').value + 'T23:59:59' : '', role: $('eRole').value, verified: $('eVer').value === '1', blocked: $('eBlock').checked, note: $('eNote').value } });
        dlg.close(); done();
      } catch (e) { msg(false, esc(e.message)); }
    };
    $('eReset').onclick = async () => {
      const r = await api(`/api/admin/users/${u.id}/reset`, { method: 'POST', body: {} });
      msg(true, `${T('Diesen Link an den Kunden schicken (3 Tage gültig):', 'Send this link to the customer (valid for 3 days):')}<br><input readonly value="${esc(r.link)}">`);
    };
    $('eDel').onclick = async () => {
      if (!confirm(T(`Konto ${u.email} mit allen Designs endgültig löschen?`, `Permanently delete ${u.email} and all designs?`))) return;
      try { await api('/api/admin/users/' + u.id, { method: 'DELETE' }); dlg.close(); done(); } catch (e) { msg(false, esc(e.message)); }
    };
  }

  function newUser() {
    dlg.innerHTML = `<h2>${T('Benutzer anlegen', 'Add user')}</h2>
      <label>${T('E-Mail', 'Email')}<input type="email" id="nEmail"></label><label>${T('Name / Firma', 'Name / company')}<input id="nName"></label>
      <label>${T('Sprache', 'Language')}<select id="nLang"><option value="de">Deutsch</option><option value="en">English</option></select></label>
      <p class="muted">${T('Das Konto startet mit der normalen Testphase. Danach bekommst du einen Link, mit dem der Kunde sein Passwort festlegt.', 'The account starts with the normal trial. You then get a link the customer uses to set their password.')}</p><div id="nMsg"></div>
      <div class="row" style="justify-content:flex-end"><button id="nCancel">${T('Schließen', 'Close')}</button><button id="nSave" style="background:#1f6feb;color:#fff;border-color:#1f6feb">${T('Anlegen', 'Create')}</button></div>`;
    dlg.showModal();
    const $ = (id) => document.getElementById(id);
    $('nCancel').onclick = () => { dlg.close(); users(); };
    $('nSave').onclick = async () => {
      try {
        const r = await api('/api/admin/users', { method: 'POST', body: { email: $('nEmail').value, name: $('nName').value, lang: $('nLang').value } });
        $('nMsg').innerHTML = `<div class="msg ok">${T('Angelegt. Link zum Passwort-Setzen (3 Tage gültig):', 'Created. Password link (valid for 3 days):')}<br><input readonly value="${esc(r.link)}"></div>`;
      } catch (e) { $('nMsg').innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
    };
  }

  async function settings() {
    const { settings: s, mail, webhook, webhookUrl, baseUrl } = await api('/api/admin/settings');
    const f = (k, label, hint = '', type = 'text') => `<label>${label}<input id="s_${k}" type="${type}" value="${esc(s[k])}">${hint ? `<small>${hint}</small>` : ''}</label>`;
    tab.innerHTML = `<h2>${T('Lizenz & Verkauf', 'License & sales')}</h2><div class="grid2">
      ${f('trial_days', T('Testzeitraum (Tage)', 'Trial period (days)'), T('Für neue Konten. 0 = keine Testversion.', 'For new accounts. 0 = no trial.'), 'number')}
      ${f('license_days', T('Lizenzdauer bei Kauf (Tage)', 'License length on purchase (days)'), T('Wird bei Zahlung bzw. „+1 Jahr“ gutgeschrieben.', 'Added on payment or “+1 year”.'), 'number')}</div>
      ${f('buy_url', T('Kauf-Link (z. B. Lemon Squeezy Checkout)', 'Purchase link (e.g. Lemon Squeezy checkout)'), T('Kunden-E-Mail und Konto-Nummer werden bei Lemon Squeezy automatisch angehängt.', 'Customer email and account id are appended automatically for Lemon Squeezy.'))}
      <div class="grid2">${f('price_text_de', 'Preis (Text, deutsch)', 'z. B. „99 € pro Jahr inkl. MwSt.“')}${f('price_text_en', 'Price (text, English)', 'e.g. “€99 per year incl. VAT”')}
      ${f('license_term_de', 'Laufzeit (deutsch)')}${f('license_term_en', 'Term (English)')}</div>
      <p class="muted">${T('Zahlungs-Webhook', 'Payment webhook')}: ${webhook ? '✓' : '✗'} <code>${esc(webhookUrl)}</code><br>${T('E-Mail-Versand', 'Email sending')}: ${mail ? '✓' : '✗'} ${mail ? `<button id="testMail">${T('Test-E-Mail an mich', 'Send test email to me')}</button>` : ''}<br>${T('Adresse', 'Address')}: <code>${esc(baseUrl)}</code></p>
      <h2>${T('Firmendaten (für Impressum, AGB, Datenschutz)', 'Company data (for legal notice, terms, privacy)')}</h2><div class="grid2">
      ${f('company', T('Firma / Name', 'Business name'))}${f('owner', T('Inhaber / Vertreten durch', 'Owner / represented by'))}
      ${f('street', T('Straße und Hausnummer', 'Street'))}${f('zip_city', T('PLZ und Ort', 'Postcode and city'))}
      ${f('country', T('Land', 'Country'))}${f('email', T('E-Mail (Impressum)', 'Email (legal notice)'))}
      ${f('phone', T('Telefon', 'Phone'))}${f('support_email', T('Support-E-Mail (für Kunden)', 'Support email'))}
      ${f('vat_id', T('USt-IdNr. (falls vorhanden)', 'VAT ID (if any)'))}${f('register', T('Handelsregister (falls vorhanden)', 'Trade register (if any)'))}</div>
      ${f('hosting_provider', T('Hosting-Anbieter (Name, Anschrift)', 'Hosting provider (name, address)'))}
      ${f('payment_provider', T('Zahlungsanbieter (Name, Anschrift)', 'Payment provider (name, address)'))}
      ${f('supervisory_authority', T('Zuständige Datenschutz-Aufsichtsbehörde', 'Data protection supervisory authority'), T('Die Behörde deines Bundeslandes.', 'The authority of your federal state.'))}
      ${f('legal_date', T('Stand der Rechtstexte (Datum)', 'Version date of legal texts'), '', 'date')}
      <div id="sMsg"></div><button id="sSave" style="background:#1f6feb;color:#fff;border-color:#1f6feb">${T('Einstellungen speichern', 'Save settings')}</button>
      <p class="muted">${T('Vorschau der Rechtstexte:', 'Preview legal texts:')} <a href="/legal/impressum" target="_blank">Impressum</a> · <a href="/legal/agb" target="_blank">AGB</a> · <a href="/legal/widerruf" target="_blank">Widerruf</a> · <a href="/legal/datenschutz" target="_blank">Datenschutz</a> · <a href="/legal/lizenzen" target="_blank">Lizenzen</a>. ${T('Rot markierte Felder fehlen noch.', 'Fields marked red are still missing.')}</p>`;
    document.getElementById('sSave').onclick = async () => {
      const out = {};
      tab.querySelectorAll('[id^=s_]').forEach((i) => { out[i.id.slice(2)] = i.value; });
      try { await api('/api/admin/settings', { method: 'POST', body: out }); document.getElementById('sMsg').innerHTML = `<div class="msg ok">${T('Gespeichert.', 'Saved.')}</div>`; } catch (e) { document.getElementById('sMsg').innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
    };
    const tm = document.getElementById('testMail');
    if (tm) tm.onclick = () => api('/api/admin/test-mail', { method: 'POST', body: {} }).then(() => alert('OK')).catch((e) => alert(e.message));
  }

  async function log() {
    const rows = await api('/api/admin/events');
    tab.innerHTML = `<table class="list"><tr><th>${T('Zeit', 'Time')}</th><th>${T('Konto', 'Account')}</th><th>${T('Ereignis', 'Event')}</th><th>Info</th></tr>
      ${rows.map((r) => `<tr><td>${new Date(r.at).toLocaleString(de ? 'de-DE' : 'en-GB')}</td><td>${esc(r.email || '')}</td><td>${esc(r.kind)}</td><td>${esc(r.info)}</td></tr>`).join('')}</table>`;
  }

  dash();
})();
