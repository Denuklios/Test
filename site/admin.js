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
  const dt = (ms) => (ms ? new Date(ms).toLocaleString(de ? 'de-DE' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '–');
  const ago = (ms) => { if (!ms) return T('nie', 'never'); const m = Math.round((Date.now() - ms) / 60000); if (m < 2) return T('gerade eben', 'just now'); if (m < 90) return T(`vor ${m} Min.`, `${m} min ago`); const h = Math.round(m / 60); if (h < 36) return T(`vor ${h} Std.`, `${h} h ago`); const d = Math.round(h / 24); return T(`vor ${d} Tagen`, `${d} days ago`); };
  let names; try { names = new Intl.DisplayNames([de ? 'de' : 'en'], { type: 'region' }); } catch (e) { names = null; }
  const flag = (c) => (c && /^[A-Z]{2}$/.test(c) ? String.fromCodePoint(...[...c].map((x) => 0x1f1e6 + x.charCodeAt(0) - 65)) : '');
  const country = (c) => (c ? `${flag(c)} ${esc((names && (() => { try { return names.of(c); } catch (e) { return c; } })()) || c)}` : '–');
  // Gruppe eines Kontos für den Filter
  const group = (u) => (u.role === 'admin' ? 'admin' : u.blocked ? 'blocked' : u.license.viewOnly ? 'expired' : u.license.trial ? 'trial' : u.sub_status && ['active', 'on_trial', 'past_due'].includes(u.sub_status) ? 'sub' : u.sub_status === 'cancelled' ? 'cancelled' : 'license');
  const status = (u) => (u.role === 'admin' ? `<span class="pill admin">Admin</span>` : u.blocked ? `<span class="pill bad">${T('gesperrt', 'blocked')}</span>`
    : u.license.viewOnly ? `<span class="pill bad">${T('abgelaufen', 'expired')}</span>` : u.license.trial ? `<span class="pill trial">${T('Test', 'trial')} · ${u.license.daysLeft} ${T('T.', 'd')}</span>` : `<span class="pill ok">${u.sub_id ? 'Abo' : T('Lizenz', 'licensed')} · ${u.license.daysLeft} ${T('T.', 'd')}</span>`)
    + (u.sub_status && u.role !== 'admin' ? `<br><span class="muted">Abo: ${esc(SUB[u.sub_status] || u.sub_status)}</span>` : '');
  const SUB = { active: T('aktiv', 'active'), on_trial: T('Probezeit', 'on trial'), past_due: T('Zahlung offen', 'payment due'), cancelled: T('gekündigt', 'cancelled'), expired: T('beendet', 'expired'), unpaid: T('unbezahlt', 'unpaid'), paused: T('pausiert', 'paused') };

  root.innerHTML = `<h1>${T('Verwaltung', 'Administration')}</h1><div class="tabs">
    <button data-tab="dash" class="on">${T('Übersicht', 'Overview')}</button><button data-tab="users">${T('Benutzer & Lizenzen', 'Users & licenses')}</button>
    <button data-tab="settings">${T('Einstellungen & Firmendaten', 'Settings & company data')}</button><button data-tab="requests">${T('Kündigungen & Widerrufe', 'Cancellations & withdrawals')}</button><button data-tab="log">${T('Protokoll', 'Log')}</button></div><div id="tab"></div>
    <dialog id="dlg"></dialog>`;
  const tab = document.getElementById('tab'), dlg = document.getElementById('dlg');
  const tabs = { dash, users, settings, log, requests };
  root.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { root.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('on', x === b)); tabs[b.dataset.tab](); }));

  async function requests() {
    const list = await api('/api/admin/requests');
    tab.innerHTML = list.length ? `<table class="list"><tr><th>${T('Eingang', 'Received')}</th><th>${T('Art', 'Type')}</th><th>${T('Kunde', 'Customer')}</th><th>${T('Angaben', 'Details')}</th><th>Status</th></tr>
      ${list.map((r) => `<tr><td>${new Date(r.at).toLocaleString(de ? 'de-DE' : 'en-GB')}</td><td>${r.kind === 'cancel' ? T('Kündigung', 'Cancellation') : T('Widerruf', 'Withdrawal')}</td>
      <td>${esc(r.name)}<br><span class="muted">${esc(r.email)}${r.account ? '' : ` – ${T('kein Konto gefunden', 'no account found')}`}</span></td>
      <td class="muted">${r.info.filter(([k]) => !/^(Name|E-Mail|Email|Eingegangen|Received)/.test(k)).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join('<br>')}</td>
      <td>${r.status === 'done' ? `<span class="pill ok">${T('erledigt', 'done')}</span><br><span class="muted">${esc(r.result)}</span>` : `<span class="pill bad">${T('offen', 'open')}</span><br><button data-done="${r.id}">${T('Als erledigt markieren', 'Mark as done')}</button>`}</td></tr>`).join('')}</table>
      <p class="muted">${T('Kündigung: Abo bei Lemon Squeezy zum Laufzeitende beenden (passiert automatisch, wenn LEMONSQUEEZY_API_KEY gesetzt ist). Widerruf: Abo beenden und Betrag (ggf. anteilig) erstatten.', 'Cancellation: end the subscription at Lemon Squeezy at the end of the term (automatic if LEMONSQUEEZY_API_KEY is set). Withdrawal: end the subscription and refund (pro rata if applicable).')}</p>`
      : `<p class="muted">${T('Keine Kündigungen oder Widerrufe.', 'No cancellations or withdrawals.')}</p>`;
    tab.querySelectorAll('[data-done]').forEach((b) => (b.onclick = async () => { await api('/api/admin/requests/' + b.dataset.done, { method: 'POST', body: { done: true } }); requests(); }));
  }

  // kleines Säulendiagramm ohne Bibliothek: Anmeldungen (Säule) und Registrierungen (Zahl) je Tag
  function chart(daily) {
    const days = [];
    for (let i = 13; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); const r = daily.find((x) => x.day === d) || { logins: 0, regs: 0 }; days.push({ d, logins: r.logins || 0, regs: r.regs || 0 }); }
    const max = Math.max(1, ...days.map((x) => x.logins));
    return `<div class="chart">${days.map((x) => `<div class="col" title="${x.d}: ${x.logins} ${T('Anmeldungen', 'sign-ins')}, ${x.regs} ${T('Registrierungen', 'sign-ups')}"><span class="n">${x.logins || ''}</span><i style="height:${Math.round(100 * x.logins / max)}%"></i><em>${x.d.slice(8)}</em>${x.regs ? `<b>+${x.regs}</b>` : ''}</div>`).join('')}</div><p class="muted">${T('Säule = Anmeldungen, „+n“ = neue Konten', 'Bar = sign-ins, “+n” = new accounts')}</p>`;
  }
  async function dash() {
    const s = await api('/api/admin/stats');
    const set = await api('/api/admin/settings');
    const todo = [];
    if (!set.mail) todo.push(T('E-Mail-Versand (SMTP) ist nicht eingerichtet – „Passwort vergessen“ und E-Mail-Bestätigung funktionieren erst danach.', 'Email (SMTP) is not set up – “forgot password” and email confirmation only work after that.'));
    if (!set.settings.company || !set.settings.street) todo.push(T('Firmendaten für Impressum und Rechtstexte fehlen (Reiter „Einstellungen“).', 'Company data for the legal notice and legal texts is missing (“Settings” tab).'));
    if (s.openRequests) todo.unshift(T(`${s.openRequests} offene Kündigung(en)/Widerruf(e) – bitte im Reiter „Kündigungen & Widerrufe“ bearbeiten (ggf. Abo bei Lemon Squeezy beenden bzw. erstatten).`, `${s.openRequests} open cancellation(s)/withdrawal(s) – please handle them in the “Cancellations & withdrawals” tab.`));
    if (!set.settings.buy_url) todo.push(T('Kein Abo-Link eingetragen – Kunden sehen dann „bitte Support kontaktieren“.', 'No subscription link set – customers will be told to contact support.'));
    if (!set.webhook) todo.push(T('Abo-Anbindung ist nicht eingerichtet (LEMONSQUEEZY_SECRET). Lizenzen dann von Hand verlängern.', 'Subscription webhook is not set up (LEMONSQUEEZY_SECRET). Extend licenses manually.'));
    if (set.webhook && !set.lsApi) todo.push(T('Optional: LEMONSQUEEZY_API_KEY setzen – dann werden Kündigungen über „Verträge hier kündigen“ automatisch bei Lemon Squeezy ausgeführt.', 'Optional: set LEMONSQUEEZY_API_KEY so cancellations are carried out at Lemon Squeezy automatically.'));
    tab.innerHTML = `<div class="stats"><div><b>${s.users}</b>${T('Konten', 'accounts')}</div><div><b>${s.subs}</b>${T('Abos aktiv', 'active subscriptions')}</div><div><b>${s.licensed}</b>${T('mit Lizenz', 'licensed')}</div><div><b>${s.trial}</b>${T('in der Testphase', 'in trial')}</div><div><b>${s.expired}</b>${T('abgelaufen', 'expired')}</div><div><b>${s.projects}</b>${T('Designs', 'designs')}</div></div>
      
      <div class="stats" style="margin-top:10px"><div><b>${s.newUsers7}</b>${T('neue Konten (7 Tage)', 'new accounts (7 days)')}</div><div><b>${s.newUsers30}</b>${T('neue Konten (30 Tage)', 'new accounts (30 days)')}</div><div><b>${s.active24h}</b>${T('aktiv in 24 Std.', 'active in 24 h')}</div><div><b>${s.active7}</b>${T('aktiv in 7 Tagen', 'active in 7 days')}</div><div><b>${s.expiring30}</b>${T('laufen in 30 Tagen ab', 'expire in 30 days')}</div><div><b>${s.neverLoggedIn}</b>${T('nie angemeldet', 'never signed in')}</div></div>
      <div class="two" style="margin-top:18px"><div><h2>${T('Anmeldungen und Registrierungen (14 Tage)', 'Sign-ins and sign-ups (14 days)')}</h2>${chart(s.daily)}</div>
      <div><h2>${T('Woher kommen die Kunden?', 'Where do customers come from?')}</h2>${s.byCountry.length ? `<table class="list">${s.byCountry.map((r) => `<tr><td>${country(r.c)}</td><td style="width:60%"><div class="bar" style="width:${Math.max(4, Math.round(100 * r.n / s.byCountry[0].n))}%"></div></td><td>${r.n}</td></tr>`).join('')}</table>${s.unknownCountry ? `<p class="muted">${s.unknownCountry} ${T('ohne Land', 'without country')}</p>` : ''}` : `<p class="muted">${s.geo.loaded ? T('Noch keine Anmeldungen.', 'No sign-ins yet.') : T('Länderdaten sind nicht geladen – siehe Reiter „Einstellungen“.', 'Country data is not loaded – see “Settings” tab.')}</p>`}</div></div>
      ${todo.length ? `<h2>${T('Noch zu erledigen', 'To do')}</h2><ul>${todo.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}`;
  }

  let ufilter = 'all', usort = 'created';
  async function users(q = '') {
    if (!document.getElementById('list')) {
      tab.innerHTML = `<div class="row"><input id="q" placeholder="${T('Suchen: E-Mail, Name oder Kennung aus einer Programmdatei', 'Search: email, name or id from a program file')}" value="${esc(q)}" style="flex:1"><button id="new">+ ${T('Benutzer anlegen', 'Add user')}</button></div><div id="list" class="muted">…</div>`;
    }
    let list = await api('/api/admin/users?q=' + encodeURIComponent(q));
    const all = list;
    const count = (g) => all.filter((u) => group(u) === g).length;
    if (ufilter === 'soon') list = list.filter((u) => u.role !== 'admin' && u.license.daysLeft !== null && !u.license.viewOnly && u.license.daysLeft <= 30);
    else if (ufilter === 'never') list = list.filter((u) => u.role !== 'admin' && !u.last_login);
    else if (ufilter !== 'all') list = list.filter((u) => group(u) === ufilter);
    const key = { created: (u) => -u.created, login: (u) => -(u.last_seen || u.last_login || 0), end: (u) => (u.license.viewOnly ? 9e15 : (Math.max(u.license_until, u.trial_until) || 9e15)), email: (u) => u.email.toLowerCase() }[usort];
    list = [...list].sort((x, y) => (key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : 0));
    const opt = (v, t) => `<option value="${v}" ${ufilter === v ? 'selected' : ''}>${t}</option>`;
    document.getElementById('list').innerHTML = `<div class="row" style="margin-bottom:8px;flex-wrap:wrap">
      <label style="margin:0">${T('Anzeigen', 'Show')} <select id="fSel">${opt('all', `${T('Alle', 'All')} (${all.length})`)}${opt('trial', `${T('Testphase', 'Trial')} (${count('trial')})`)}${opt('sub', `${T('Abo aktiv', 'Subscription active')} (${count('sub')})`)}${opt('license', `${T('Lizenz von Hand', 'Manual license')} (${count('license')})`)}${opt('cancelled', `${T('Abo gekündigt', 'Subscription cancelled')} (${count('cancelled')})`)}${opt('expired', `${T('Abgelaufen', 'Expired')} (${count('expired')})`)}${opt('soon', T('Läuft in 30 Tagen ab', 'Expires within 30 days'))}${opt('never', T('Noch nie angemeldet', 'Never signed in'))}${opt('blocked', `${T('Gesperrt', 'Blocked')} (${count('blocked')})`)}${opt('admin', 'Admin')}</select></label>
      <label style="margin:0">${T('Sortieren', 'Sort')} <select id="sSel"><option value="created" ${usort === 'created' ? 'selected' : ''}>${T('Neueste zuerst', 'Newest first')}</option><option value="login" ${usort === 'login' ? 'selected' : ''}>${T('Zuletzt aktiv', 'Last active')}</option><option value="end" ${usort === 'end' ? 'selected' : ''}>${T('Läuft zuerst ab', 'Expires first')}</option><option value="email" ${usort === 'email' ? 'selected' : ''}>${T('E-Mail A–Z', 'Email A–Z')}</option></select></label>
      <span style="flex:1"></span><a class="btn" href="/api/admin/users.csv" style="text-decoration:none">⤓ ${T('Als CSV (Excel)', 'As CSV (Excel)')}</a></div>
      <table class="list"><tr><th>${T('E-Mail / Name', 'Email / name')}</th><th>Status</th><th>${T('Läuft bis', 'Ends')}</th><th>${T('Registriert', 'Registered')}</th><th>${T('Letzte Anmeldung / aktiv', 'Last sign-in / active')}</th><th>${T('Von wo (letzte IP)', 'From where (last IP)')}</th><th>${T('Designs', 'Designs')}</th><th></th></tr>
      ${list.map((u) => `<tr><td>${esc(u.email)}${u.name ? `<br><span class="muted">${esc(u.name)}</span>` : ''}${u.note ? `<br><span class="muted">📝 ${esc(u.note)}</span>` : ''}</td><td>${status(u)}${u.verified ? '' : `<br><span class="muted">${T('E-Mail unbestätigt', 'email unconfirmed')}</span>`}</td>
      <td>${u.role === 'admin' ? '–' : date(Math.max(u.license_until, u.trial_until))}${u.license_until > u.trial_until ? '' : u.trial_until ? `<br><span class="muted">${T('Testversion', 'trial')}</span>` : ''}</td>
      <td>${date(u.created)}${u.reg_country ? `<br><span class="muted">${country(u.reg_country)}</span>` : ''}</td>
      <td>${u.last_login ? dt(u.last_login) : T('nie', 'never')}<br><span class="muted">${T('aktiv', 'active')}: ${ago(u.last_seen)}</span></td>
      <td>${country(u.last_country)}<br><span class="muted">${esc(u.last_ip || '')}</span></td><td>${u.projects}</td>
      <td><button data-ext="${u.id}">+1 ${T('Jahr', 'year')}</button> <button data-edit="${u.id}">${T('Bearbeiten', 'Edit')}</button></td></tr>`).join('')}</table>
      <p class="muted">${list.length} ${T('von', 'of')} ${all.length} ${T('Konten', 'accounts')}</p>`;
    document.getElementById('fSel').onchange = (e) => { ufilter = e.target.value; users(document.getElementById('q').value); };
    document.getElementById('sSel').onchange = (e) => { usort = e.target.value; users(document.getElementById('q').value); };
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
      <p class="muted">${T('Kennung', 'Id')}: <code>${esc(u.mark)}</code>${u.sub_id ? ` · Abo ${esc(u.sub_id)}: ${esc(SUB[u.sub_status] || u.sub_status)}${u.sub_renews ? ` · ${T('verlängert sich am', 'renews on')} ${date(u.sub_renews)}` : ''}${u.sub_ends ? ` · ${T('endet am', 'ends on')} ${date(u.sub_ends)}` : ''}` : ''}</p>
      <label>${T('Name / Firma', 'Name / company')}<input id="eName" value="${esc(u.name)}"></label>
      <div class="grid2"><label>${T('Lizenz gültig bis', 'License valid until')}<input type="date" id="eLic" value="${dIn(u.license_until)}"></label>
      <label>${T('Testversion bis', 'Trial until')}<input type="date" id="eTrial" value="${dIn(u.trial_until)}"></label></div>
      <div class="grid2"><label>${T('Rolle', 'Role')}<select id="eRole"><option value="user">${T('Kunde', 'Customer')}</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option></select></label>
      <label>${T('E-Mail bestätigt', 'Email confirmed')}<select id="eVer"><option value="1">${T('ja', 'yes')}</option><option value="0" ${u.verified ? '' : 'selected'}>${T('nein', 'no')}</option></select></label></div>
      <label class="check"><input type="checkbox" id="eBlock" ${u.blocked ? 'checked' : ''}> <span>${T('Konto sperren (Anmeldung nicht mehr möglich)', 'Block account (no sign-in possible)')}</span></label>
      <label>${T('Notiz (nur für dich)', 'Note (only for you)')}<textarea id="eNote">${esc(u.note)}</textarea></label>
      <div id="eMsg"></div>
      <div class="row" style="justify-content:space-between;margin-top:10px"><div class="row"><button id="eReset">${T('Link zum Passwort-Setzen', 'Password reset link')}</button><button id="eDel" class="danger">${T('Konto löschen', 'Delete account')}</button></div>
      <div class="row"><button id="eCancel">${T('Abbrechen', 'Cancel')}</button><button id="eSave" style="background:var(--accent);color:#fff;border-color:var(--accent)">${T('Speichern', 'Save')}</button></div></div>`;
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
      <div class="row" style="justify-content:flex-end"><button id="nCancel">${T('Schließen', 'Close')}</button><button id="nSave" style="background:var(--accent);color:#fff;border-color:var(--accent)">${T('Anlegen', 'Create')}</button></div>`;
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
    const { settings: s, mail, webhook, webhookUrl, baseUrl, geo, keepDays } = await api('/api/admin/settings');
    const f = (k, label, hint = '', type = 'text') => `<label>${label}<input id="s_${k}" type="${type}" value="${esc(s[k])}">${hint ? `<small>${hint}</small>` : ''}</label>`;
    tab.innerHTML = `<h2>${T('Lizenz & Verkauf', 'License & sales')}</h2><div class="grid2">
      ${f('trial_days', T('Testzeitraum (Tage)', 'Trial period (days)'), T('Für neue Konten. 0 = keine Testversion.', 'For new accounts. 0 = no trial.'), 'number')}
      ${f('license_days', T('Lizenzdauer bei Kauf (Tage)', 'License length on purchase (days)'), T('Wird bei Zahlung bzw. „+1 Jahr“ gutgeschrieben.', 'Added on payment or “+1 year”.'), 'number')}</div>
      ${f('buy_url', T('Abo-Link (Lemon Squeezy Checkout des Abo-Produkts)', 'Subscription link (Lemon Squeezy checkout of the subscription product)'), T('Kunden-E-Mail und Konto-Nummer werden bei Lemon Squeezy automatisch angehängt.', 'Customer email and account id are appended automatically for Lemon Squeezy.'))}
      <div class="grid2">${f('price_text_de', 'Preis (Text, deutsch)', 'z. B. „99 € pro Jahr inkl. MwSt.“')}${f('price_text_en', 'Price (text, English)', 'e.g. “€99 per year incl. VAT”')}
      ${f('license_term_de', 'Laufzeit (deutsch)')}${f('license_term_en', 'Term (English)')}</div>
      <p class="muted">${T('Zahlungs-Webhook', 'Payment webhook')}: ${webhook ? '✓' : '✗'} <code>${esc(webhookUrl)}</code><br>${T('E-Mail-Versand', 'Email sending')}: ${mail ? '✓' : '✗'} ${mail ? `<button id="testMail">${T('Test-E-Mail an mich', 'Send test email to me')}</button>` : ''}<br>${T('Adresse', 'Address')}: <code>${esc(baseUrl)}</code></p>
      <h2>${T('Länderdaten (woher kommen die Kunden?)', 'Country data (where do customers come from?)')}</h2>
      <p class="muted">${T('Aus der IP-Adresse wird nur das <b>Land</b> bestimmt, nicht der Ort. Die Daten liegen auf deinem Server; beim Abruf der Datei werden keine Kundendaten übertragen.', 'Only the <b>country</b> is derived from the IP address, not the place. The data lives on your server; no customer data is sent when the file is downloaded.')}<br>
      ${T('Stand', 'Status')}: ${geo.loaded ? `✓ ${geo.entries.toLocaleString(de ? 'de-DE' : 'en-GB')} ${T('Bereiche, geladen am', 'ranges, loaded on')} ${new Date(geo.updated).toLocaleDateString(de ? 'de-DE' : 'en-GB')}` : `✗ ${T('nicht geladen', 'not loaded')}`}
      <button id="geoUp">${T('Jetzt herunterladen / aktualisieren', 'Download / update now')}</button> <span id="geoMsg"></span><br>
      <small>${T('Die Datei wird monatlich automatisch erneuert. Quelle: <a href="https://db-ip.com" target="_blank" rel="noopener">IP Geolocation by DB-IP</a> (CC BY 4.0). Ausschalten mit der Umgebungsvariable GEOIP=off.', 'The file is renewed monthly. Source: <a href="https://db-ip.com" target="_blank" rel="noopener">IP Geolocation by DB-IP</a> (CC BY 4.0). Disable with the environment variable GEOIP=off.')}</small></p>
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
      <div id="sMsg"></div><button id="sSave" style="background:var(--accent);color:#fff;border-color:var(--accent)">${T('Einstellungen speichern', 'Save settings')}</button>
      <p class="muted">${T('Vorschau der Rechtstexte:', 'Preview legal texts:')} <a href="/legal/impressum" target="_blank">Impressum</a> · <a href="/legal/agb" target="_blank">AGB</a> · <a href="/legal/widerruf" target="_blank">Widerruf</a> · <a href="/legal/datenschutz" target="_blank">Datenschutz</a> · <a href="/legal/lizenzen" target="_blank">Lizenzen</a>. ${T('Rot markierte Felder fehlen noch.', 'Fields marked red are still missing.')}</p>`;
    document.getElementById('geoUp').onclick = async (e) => {
      e.target.disabled = true; const m = document.getElementById('geoMsg'); m.textContent = '…';
      try { const g = await api('/api/admin/geoip', { method: 'POST', body: {} }); m.innerHTML = `<span class="pill ok">✓ ${g.entries.toLocaleString(de ? 'de-DE' : 'en-GB')}</span>`; } catch (err) { m.innerHTML = `<span class="pill bad">${esc(err.message)}</span>`; }
      e.target.disabled = false;
    };
    document.getElementById('sSave').onclick = async () => {
      const out = {};
      tab.querySelectorAll('[id^=s_]').forEach((i) => { out[i.id.slice(2)] = i.value; });
      try { await api('/api/admin/settings', { method: 'POST', body: out }); document.getElementById('sMsg').innerHTML = `<div class="msg ok">${T('Gespeichert.', 'Saved.')}</div>`; } catch (e) { document.getElementById('sMsg').innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
    };
    const tm = document.getElementById('testMail');
    if (tm) tm.onclick = () => api('/api/admin/test-mail', { method: 'POST', body: {} }).then(() => alert('OK')).catch((e) => alert(e.message));
  }

  let lkind = '', lq = '';
  async function log() {
    const { rows, kinds, keepDays } = await api('/api/admin/events?kind=' + encodeURIComponent(lkind) + '&q=' + encodeURIComponent(lq));
    const KIND = { login: T('Anmeldung', 'Sign-in'), register: T('Registrierung', 'Sign-up'), 'password-change': T('Passwort geändert', 'Password changed'), 'password-reset': T('Passwort zurückgesetzt', 'Password reset'), abo: 'Abo', license: T('Lizenz', 'License'), kuendigung: T('Kündigung', 'Cancellation'), widerruf: T('Widerruf', 'Withdrawal'), zahlung: T('Zahlung', 'Payment'), refund: T('Erstattung', 'Refund'), 'admin-edit': T('Admin-Änderung', 'Admin change'), 'admin-export': 'Export', geoip: T('Länderdaten', 'Country data') };
    tab.innerHTML = `<div class="row" style="margin-bottom:8px;flex-wrap:wrap"><select id="lk"><option value="">${T('Alle Ereignisse', 'All events')}</option>${kinds.map((k) => `<option value="${esc(k.kind)}" ${lkind === k.kind ? 'selected' : ''}>${esc(KIND[k.kind] || k.kind)} (${k.n})</option>`).join('')}</select>
      <input id="lq" placeholder="${T('Suchen: E-Mail oder IP', 'Search: email or IP')}" value="${esc(lq)}" style="flex:1"></div>
      <table class="list"><tr><th>${T('Zeit', 'Time')}</th><th>${T('Konto', 'Account')}</th><th>${T('Ereignis', 'Event')}</th><th>Info</th></tr>
      ${rows.map((r) => `<tr><td>${dt(r.at)}</td><td>${esc(r.email || '')}</td><td>${esc(KIND[r.kind] || r.kind)}</td><td>${esc(r.info)}</td></tr>`).join('')}</table>
      <p class="muted">${T(`Das Protokoll wird nach ${keepDays} Tagen automatisch gelöscht.`, `The log is deleted automatically after ${keepDays} days.`)}</p>`;
    document.getElementById('lk').onchange = (e) => { lkind = e.target.value; log(); };
    let t2; const li = document.getElementById('lq'); li.oninput = () => { clearTimeout(t2); t2 = setTimeout(() => { lq = li.value; log().then(() => { const x = document.getElementById('lq'); x.focus(); x.setSelectionRange(x.value.length, x.value.length); }); }, 300); };
  }

  dash();
})();
