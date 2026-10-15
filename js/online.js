/* Online-Version: Anbindung an den StickStudio-Server.
   Wird nur geladen, wenn das Programm vom Server kommt (window.STICK_CONFIG.online).
   - Konto-Menü, Lizenz-Hinweis, „Nur ansehen“ nach Ablauf
   - Stickdateien (DST/PES/JEF/EXP) werden auf dem Server erzeugt bzw. gelesen
   - „Meine Designs“ liegen auf dem Server */
(function (g) {
  const HW = (g.HW = g.HW || {});
  const CFG = g.STICK_CONFIG || {};
  if (!CFG.online) return;
  const t = (s) => (HW.i18n ? HW.i18n.t(s) : s);

  async function api(path, opts = {}) {
    const r = await fetch(path, {
      method: opts.method || 'GET',
      credentials: 'same-origin',
      headers: { 'X-Requested-With': 'StickStudio', ...(opts.body !== undefined && !(opts.body instanceof Uint8Array) ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) },
      body: opts.body === undefined ? undefined : opts.body instanceof Uint8Array ? opts.body : JSON.stringify(opts.body),
    });
    if (r.status === 401) { location.href = '/login'; throw new Error('login'); }
    if (opts.raw && r.ok) return new Uint8Array(await r.arrayBuffer());
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error(data.message || data.error || 'Fehler ' + r.status);
      e.status = r.status;
      e.license = data.error === 'license';
      throw e;
    }
    return data;
  }

  const user = CFG.user;
  const lic = () => user.license;

  // Befehle, die nach Ablauf der Lizenz gesperrt sind (nur noch ansehen)
  const BLOCKED = new Set(['save', 'librarySave', 'exportDst', 'teamNames', 'multiHoop']);

  HW.online = {
    user, api, buyUrl: CFG.buyUrl || '',
    get viewOnly() { return lic().viewOnly; },
    blocked: (cmd) => lic().viewOnly && BLOCKED.has(cmd),
    async exportFile(fmt, cmds, palette, opts) {
      // nur die nötigen Felder schicken
      const slim = cmds.map((c) => {
        const o = { x: +c.x.toFixed(3), y: +c.y.toFixed(3), cmd: c.cmd };
        if (c.color !== undefined) o.color = c.color;
        if (c.float) o.float = 1;
        if (c.stop) o.stop = 1;
        return o;
      });
      return api('/api/export', { method: 'POST', body: { fmt, cmds: slim, palette, name: opts.name, firstColor: opts.firstColor, settings: opts.settings }, raw: true });
    },
    importFile: (ext, bytes) => api('/api/import?fmt=' + encodeURIComponent(ext), { method: 'POST', body: bytes, headers: { 'Content-Type': 'application/octet-stream' } }),
    // Bibliothek („Meine Designs“) auf dem Server – gleiche Schnittstelle wie die Browser-Bibliothek
    lib: {
      all: () => api('/api/projects'),
      get: (id) => api('/api/projects/' + id),
      put: async (rec) => {
        const body = { name: rec.name, tags: rec.tags, customer: rec.customer, stitches: rec.stitches, w: rec.w, h: rec.h, colors: rec.colors, thumb: rec.thumb, data: rec.data };
        const r = rec.id ? await api('/api/projects/' + rec.id, { method: 'PUT', body }).catch((e) => { if (e.status === 404) return api('/api/projects', { method: 'POST', body }); throw e; })
          : await api('/api/projects', { method: 'POST', body });
        return r.id;
      },
      del: (id) => api('/api/projects/' + id, { method: 'DELETE' }),
    },
    licenseDialog() {
      const L = lic();
      const de = !HW.i18n || HW.i18n.lang === 'de';
      const until = L.until ? new Date(L.until).toLocaleDateString(de ? 'de-DE' : 'en-GB') : '';
      const state = L.admin ? t('Admin-Konto – ohne Ablauf.') : L.viewOnly ? t('Deine Lizenz ist abgelaufen. Du kannst deine Designs weiter ansehen, aber nicht mehr speichern oder als Stickdatei exportieren.')
        : L.trial ? `${t('Testversion')}: ${t('noch')} ${L.daysLeft} ${t(L.daysLeft === 1 ? 'Tag' : 'Tage')} (${t('bis')} ${until}).` : `${t('Lizenz gültig bis')} ${until}.`;
      const box = document.getElementById('modal');
      if (!box) return alert(state);
      document.getElementById('modalTitle').textContent = t('Lizenz');
      document.getElementById('modalBody').innerHTML = `<p>${state}</p>` +
        (HW.online.buyUrl && !L.admin ? `<p><a class="buy" href="${HW.online.buyUrl}" target="_blank" rel="noopener">${t(L.viewOnly || L.trial ? 'Lizenz kaufen' : 'Lizenz verlängern')}</a></p>` : '') +
        (!HW.online.buyUrl && !L.admin ? `<p>${t('Zum Kauf oder zur Verlängerung wende dich bitte an')} ${CFG.support || t('den Support')}.</p>` : '') +
        `<p style="color:#6a7480">${t('Nach dem Kauf bitte die Seite neu laden.')}</p>`;
      const btns = document.getElementById('modalBtns');
      btns.innerHTML = '';
      const ok = document.createElement('button'); ok.className = 'primary'; ok.textContent = 'OK';
      ok.onclick = () => box.classList.add('hidden');
      btns.appendChild(ok);
      box.classList.remove('hidden');
    },
  };

  /* ---------- Oberfläche: Konto-Menü und Lizenz-Hinweis ---------- */
  function ui() {
    const bar = document.getElementById('menubar');
    if (!bar) return;
    const spacer = bar.querySelector('.spacer');
    const menu = document.createElement('div');
    menu.className = 'menu';
    // Texte auf Deutsch einsetzen – die Sprachumschaltung übersetzt sie (auch beim Wechsel im laufenden Programm)
    menu.innerHTML = `<button data-help="id:accountMenu">Konto</button><div class="dd">
      <div class="ddinfo" data-noi18n>${user.email.replace(/</g, '&lt;')}</div>
      <button data-act="license">Lizenz…</button>
      <a href="/account">Mein Konto</a>
      ${user.role === 'admin' ? '<a href="/admin">Verwaltung</a>' : ''}
      <hr><a href="/legal/agb" target="_blank">AGB</a><a href="/legal/datenschutz" target="_blank">Datenschutz</a><a href="/legal/impressum" target="_blank">Impressum</a><a href="/legal/lizenzen" target="_blank">Lizenzen</a>
      <hr><form method="post" action="/logout"><button>Abmelden</button></form></div>`;
    bar.insertBefore(menu, spacer ? spacer.nextSibling : null);
    menu.querySelector('[data-act=license]').onclick = () => HW.online.licenseDialog();
    // Öffnen/Schließen übernimmt app.js wie bei den anderen Menüs

    const L = lic();
    if (!L.admin && (L.viewOnly || L.trial || (L.daysLeft !== null && L.daysLeft <= 30))) {
      const b = document.createElement('div');
      b.id = 'licBanner';
      b.className = L.viewOnly ? 'expired' : 'trial';
      b.innerHTML = L.viewOnly
        ? '<b>Nur ansehen</b> – Deine Lizenz ist abgelaufen. Speichern und Export sind gesperrt. '
        : L.trial ? `Testversion: noch <b>${L.daysLeft}</b> ${L.daysLeft === 1 ? 'Tag' : 'Tage'}. `
          : `Deine Lizenz läuft in <b>${L.daysLeft}</b> ${L.daysLeft === 1 ? 'Tag' : 'Tagen'} ab. `;
      const a = document.createElement('button');
      a.textContent = L.viewOnly || L.trial ? 'Lizenz kaufen' : 'Lizenz verlängern';
      a.onclick = () => (HW.online.buyUrl ? window.open(HW.online.buyUrl, '_blank', 'noopener') : HW.online.licenseDialog());
      b.appendChild(a);
      bar.insertAdjacentElement('afterend', b);
      document.body.classList.add('hasBanner');
    }
    // Sprache am Konto speichern
    if (HW.i18n) HW.i18n.listeners.push((l) => api('/api/account/lang', { method: 'POST', body: { lang: l } }).catch(() => {}));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ui); else ui();
})(typeof window !== 'undefined' ? window : globalThis);
