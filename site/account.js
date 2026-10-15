/* „Mein Konto“: Lizenz, Name, Passwort, Sprache, Datenauskunft, Konto löschen */
(function () {
  const root = document.getElementById('accountApp');
  const lang = root.dataset.lang === 'en' ? 'en' : 'de';
  const L = {
    de: {
      title: 'Mein Konto', email: 'E-Mail', name: 'Name / Firma', since: 'Konto seit', status: 'Status', until: 'Gültig bis',
      admin: 'Admin', licensed: 'Lizenz aktiv', trial: 'Testversion', expired: 'Abgelaufen – nur ansehen', buy: 'Lizenz kaufen', renew: 'Lizenz verlängern',
      days: 'Tage übrig', saveName: 'Name speichern', pwTitle: 'Passwort ändern', oldPw: 'Bisheriges Passwort', newPw: 'Neues Passwort (mind. 10 Zeichen)',
      newPw2: 'Neues Passwort wiederholen', changePw: 'Passwort ändern', pwMismatch: 'Die neuen Passwörter stimmen nicht überein.', saved: 'Gespeichert.',
      langTitle: 'Sprache', dataTitle: 'Meine Daten', dataInfo: 'Lade alle zu deinem Konto gespeicherten Daten (Konto und Designs) als Datei herunter.', download: 'Daten herunterladen',
      delTitle: 'Konto löschen', delInfo: 'Löscht dein Konto und alle Designs endgültig. Vorher ggf. Daten herunterladen. Eine bezahlte Lizenz verfällt dabei.', delPw: 'Zur Bestätigung dein Passwort', del: 'Konto endgültig löschen',
      delConfirm: 'Konto und alle Designs wirklich endgültig löschen?', toApp: 'Zum Programm', support: 'Fragen? Schreib an',
    },
    en: {
      title: 'My account', email: 'Email', name: 'Name / company', since: 'Account since', status: 'Status', until: 'Valid until',
      admin: 'Admin', licensed: 'License active', trial: 'Trial', expired: 'Expired – view only', buy: 'Buy license', renew: 'Renew license',
      days: 'days left', saveName: 'Save name', pwTitle: 'Change password', oldPw: 'Current password', newPw: 'New password (min. 10 characters)',
      newPw2: 'Repeat new password', changePw: 'Change password', pwMismatch: 'The new passwords do not match.', saved: 'Saved.',
      langTitle: 'Language', dataTitle: 'My data', dataInfo: 'Download all data stored for your account (account and designs) as a file.', download: 'Download data',
      delTitle: 'Delete account', delInfo: 'Permanently deletes your account and all designs. Download your data first if needed. A paid license is forfeited.', delPw: 'Your password to confirm', del: 'Delete account permanently',
      delConfirm: 'Really delete your account and all designs permanently?', toApp: 'Open the program', support: 'Questions? Write to',
    },
  }[lang];
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const api = async (path, opts = {}) => {
    const r = await fetch(path, { method: opts.method || 'GET', headers: { 'X-Requested-With': 'StickStudio', 'Content-Type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || d.message || r.status);
    return d;
  };
  const date = (ms) => (ms ? new Date(ms).toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB') : '–');

  api('/api/me').then(({ user, buyUrl }) => {
    const l = user.license;
    const pill = l.admin ? `<span class="pill admin">${L.admin}</span>` : l.viewOnly ? `<span class="pill bad">${L.expired}</span>` : l.trial ? `<span class="pill trial">${L.trial}</span>` : `<span class="pill ok">${L.licensed}</span>`;
    root.innerHTML = `<h1>${L.title}</h1>
      <div class="kv"><div>${L.email}</div><div>${esc(user.email)}</div><div>${L.since}</div><div>${date(user.created)}</div>
      <div>${L.status}</div><div>${pill}${!l.admin && !l.viewOnly ? ` · ${l.daysLeft} ${L.days}` : ''}</div>
      ${l.admin ? '' : `<div>${L.until}</div><div>${date(l.until)}</div>`}</div>
      ${buyUrl && !l.admin ? `<p><a class="btn primary" style="display:inline-block;width:auto;text-decoration:none" href="${esc(buyUrl)}" target="_blank" rel="noopener">${l.viewOnly || l.trial ? L.buy : L.renew}</a></p>` : ''}
      <p><a href="/">${L.toApp} →</a></p>
      <h2>${L.name}</h2><div class="row"><input id="nm" value="${esc(user.name)}" style="flex:1"><button id="nmSave">${L.saveName}</button></div><div id="nmMsg"></div>
      <h2>${L.pwTitle}</h2>
      <label>${L.oldPw}<input type="password" id="pw0" autocomplete="current-password"></label>
      <div class="grid2"><label>${L.newPw}<input type="password" id="pw1" minlength="10" autocomplete="new-password"></label><label>${L.newPw2}<input type="password" id="pw2" minlength="10" autocomplete="new-password"></label></div>
      <button id="pwSave">${L.changePw}</button><div id="pwMsg"></div>
      <h2>${L.langTitle}</h2><div class="row"><button data-l="de">Deutsch</button><button data-l="en">English</button></div>
      <h2>${L.dataTitle}</h2><p class="muted">${L.dataInfo}</p><a class="btn" href="/api/account/export">${L.download}</a>
      <h2>${L.delTitle}</h2><p class="muted">${L.delInfo}</p>
      <div class="row"><input type="password" id="delPw" placeholder="${L.delPw}" style="flex:1" autocomplete="current-password"><button class="danger" id="delBtn">${L.del}</button></div><div id="delMsg"></div>`;
    const msg = (id, ok, text) => { document.getElementById(id).innerHTML = `<div class="msg ${ok ? 'ok' : 'err'}">${esc(text)}</div>`; };
    document.getElementById('nmSave').onclick = () => api('/api/account/name', { method: 'POST', body: { name: document.getElementById('nm').value } }).then(() => msg('nmMsg', true, L.saved)).catch((e) => msg('nmMsg', false, e.message));
    document.getElementById('pwSave').onclick = () => {
      const a = document.getElementById('pw1').value, b = document.getElementById('pw2').value;
      if (a !== b) return msg('pwMsg', false, L.pwMismatch);
      api('/api/account/password', { method: 'POST', body: { old: document.getElementById('pw0').value, password: a } })
        .then(() => { msg('pwMsg', true, L.saved); ['pw0', 'pw1', 'pw2'].forEach((i) => { document.getElementById(i).value = ''; }); }).catch((e) => msg('pwMsg', false, e.message));
    };
    root.querySelectorAll('[data-l]').forEach((b) => (b.onclick = () => api('/api/account/lang', { method: 'POST', body: { lang: b.dataset.l } }).then(() => { try { localStorage.setItem('stickstudio.lang', b.dataset.l); } catch (e) { /* privat */ } location.href = '/account?lang=' + b.dataset.l; })));
    document.getElementById('delBtn').onclick = () => {
      if (!confirm(L.delConfirm)) return;
      api('/api/account', { method: 'DELETE', body: { password: document.getElementById('delPw').value } }).then(() => { location.href = '/login'; }).catch((e) => msg('delMsg', false, e.message));
    };
  }).catch((e) => { root.textContent = String(e.message || e); });
})();
