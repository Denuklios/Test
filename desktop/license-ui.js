/* Lizenzfenster: Schlüssel eingeben, Status anzeigen, Gerät freigeben, offline freischalten. Deutsch / Englisch / Dänisch. */
(async function () {
  const $ = (id) => document.getElementById(id);
  const L = window.desktop.license;
  const T = {
    de: {
      title: 'Lizenz', keyLabel: 'Lizenzschlüssel', activate: 'Freischalten', buy: 'Lizenz kaufen', continue: 'Weiter testen',
      onlineInfo: 'Zum Freischalten wird einmal das Internet gebraucht. Danach prüft das Programm die Lizenz gelegentlich im Hintergrund und läuft auch ohne Internet bis zu 30 Tage weiter.',
      offlineTitle: 'Ohne Internet freischalten', offlineStep1: '1. Schlüssel oben eintragen. 2. Diesen <b>Gerätecode</b> an den Verkäufer schicken:',
      copy: 'Kopieren', copied: 'Kopiert ✓', offlineStep3: '3. Den Freischaltcode, den du zurückbekommst, hier einfügen:', useCode: 'Code übernehmen',
      open: 'Programm öffnen', renew: 'Updates verlängern', check: 'Jetzt prüfen', release: 'Dieses Gerät freigeben',
      releaseInfo: '„Dieses Gerät freigeben“ meldet diesen Computer ab, z. B. vor dem Umzug auf einen neuen Rechner.',
      foot: 'Eine Lizenz ist ein Kauf, kein Abo: einmal bezahlen, dauerhaft nutzen. Updates sind 1 Jahr inklusive und lassen sich verlängern.',
      version: 'Version', licensed: (n) => `Lizenz gültig${n ? ' für ' + n : ''}.`, trial: (d) => `Testversion: noch ${d} ${d === 1 ? 'Tag' : 'Tage'}. Danach brauchst du einen Lizenzschlüssel.`,
      expired: 'Die Testzeit ist abgelaufen.', offline: 'Die Lizenz muss online geprüft werden.', revoked: 'Diese Lizenz wurde gesperrt.', invalid: 'Die Freischaltung ist ungültig.',
      updates: 'Diese Version ist neuer als deine Updates.', lastCheck: (d) => ` Zuletzt geprüft am ${d}.`,
      updInfo: (d, past) => `Updates inklusive bis ${d}${past ? ' (abgelaufen – diese und ältere Versionen laufen weiter)' : ''}.`,
      example: (c) => `z. B. ${c}-7K2QX-M9D4T-HB3WN-R8P6C`, noServer: 'In diesem Programm ist kein Lizenzserver eingestellt – nur „Ohne Internet freischalten“ möglich.',
      checking: 'Wird geprüft …', thanks: 'Freigeschaltet. Vielen Dank!', done: 'Freigeschaltet.', released: 'Dieses Gerät ist abgemeldet.',
    },
    en: {
      title: 'License', keyLabel: 'License key', activate: 'Activate', buy: 'Buy license', continue: 'Continue trial',
      onlineInfo: 'Activation needs an internet connection once. After that, the program checks the license occasionally in the background and keeps running without internet for up to 30 days.',
      offlineTitle: 'Activate without internet', offlineStep1: '1. Enter the key above. 2. Send this <b>device code</b> to the seller:',
      copy: 'Copy', copied: 'Copied ✓', offlineStep3: '3. Paste the activation code you receive here:', useCode: 'Apply code',
      open: 'Open program', renew: 'Extend updates', check: 'Check now', release: 'Release this device',
      releaseInfo: '“Release this device” signs this computer out, e.g. before moving to a new computer.',
      foot: 'A license is a purchase, not a subscription: pay once, use it permanently. Updates are included for 1 year and can be extended.',
      version: 'Version', licensed: (n) => `License valid${n ? ' for ' + n : ''}.`, trial: (d) => `Trial: ${d} ${d === 1 ? 'day' : 'days'} left. After that you need a license key.`,
      expired: 'The trial period has ended.', offline: 'The license needs to be checked online.', revoked: 'This license has been revoked.', invalid: 'The activation is invalid.',
      updates: 'This version is newer than your updates.', lastCheck: (d) => ` Last checked on ${d}.`,
      updInfo: (d, past) => `Updates included until ${d}${past ? ' (expired – this and older versions keep running)' : ''}.`,
      example: (c) => `e.g. ${c}-7K2QX-M9D4T-HB3WN-R8P6C`, noServer: 'No license server is configured in this program – only “Activate without internet” is possible.',
      checking: 'Checking …', thanks: 'Activated. Thank you!', done: 'Activated.', released: 'This device has been signed out.',
    },
    da: {
      title: 'Licens', keyLabel: 'Licensnøgle', activate: 'Aktivér', buy: 'Køb licens', continue: 'Fortsæt prøveperioden',
      onlineInfo: 'Aktiveringen kræver internet én gang. Derefter kontrollerer programmet licensen en gang imellem i baggrunden og kører videre uden internet i op til 30 dage.',
      offlineTitle: 'Aktivér uden internet', offlineStep1: '1. Indtast nøglen ovenfor. 2. Send denne <b>enhedskode</b> til sælgeren:',
      copy: 'Kopiér', copied: 'Kopieret ✓', offlineStep3: '3. Indsæt den aktiveringskode, du får tilbage, her:', useCode: 'Brug koden',
      open: 'Åbn programmet', renew: 'Forlæng opdateringer', check: 'Kontrollér nu', release: 'Frigiv denne enhed',
      releaseInfo: '„Frigiv denne enhed“ logger denne computer af, f.eks. før du flytter til en ny computer.',
      foot: 'En licens er et køb, ikke et abonnement: betal én gang, brug den permanent. Opdateringer er inkluderet i 1 år og kan forlænges.',
      version: 'Version', licensed: (n) => `Licensen er gyldig${n ? ' for ' + n : ''}.`, trial: (d) => `Prøveversion: ${d} ${d === 1 ? 'dag' : 'dage'} tilbage. Derefter skal du bruge en licensnøgle.`,
      expired: 'Prøveperioden er udløbet.', offline: 'Licensen skal kontrolleres online.', revoked: 'Denne licens er blevet spærret.', invalid: 'Aktiveringen er ugyldig.',
      updates: 'Denne version er nyere end dine opdateringer.', lastCheck: (d) => ` Sidst kontrolleret den ${d}.`,
      updInfo: (d, past) => `Opdateringer inkluderet til og med ${d}${past ? ' (udløbet – denne og ældre versioner kører videre)' : ''}.`,
      example: (c) => `f.eks. ${c}-7K2QX-M9D4T-HB3WN-R8P6C`, noServer: 'Der er ikke angivet nogen licensserver i dette program – kun „Aktivér uden internet“ er mulig.',
      checking: 'Kontrollerer …', thanks: 'Aktiveret. Mange tak!', done: 'Aktiveret.', released: 'Denne enhed er logget af.',
    },
  };
  const LOCALE = { de: 'de-DE', en: 'en-GB', da: 'da-DK' };
  let info = await L.info();
  const product = info.name; // Programmname (st.name ist der Lizenznehmer)
  let lang = T[info.lang] ? info.lang : 'de';
  let last = info;
  const t = () => T[lang];
  const date = (ms) => new Date(ms).toLocaleDateString(LOCALE[lang]);
  const msg = (text, ok) => { $('msg').textContent = text || ''; $('msg').className = 'msg ' + (ok ? 'ok' : 'err'); };

  // feste Texte im Fenster
  function texts() {
    document.documentElement.lang = lang;
    document.title = t().title;
    document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t()[el.dataset.t]; });
    document.querySelectorAll('[data-t-html]').forEach((el) => { el.innerHTML = t()[el.dataset.tHtml]; });
    document.querySelectorAll('[data-lang]').forEach((b) => { b.classList.toggle('primary', b.dataset.lang === lang); });
  }

  function render(st) {
    last = st;
    info = { ...info, ...st };
    $('name').textContent = product;
    const holder = st.holder !== undefined ? st.holder : st.name;
    $('ver').textContent = t().version + ' ' + info.version;
    $('machine').value = info.machine;
    const s = $('state');
    const lines = {
      licensed: [t().licensed(holder || ''), 'ok'],
      trial: [t().trial(st.daysLeft), 'warn'],
      expired: [st.message || t().expired, 'bad'],
      offline: [st.message || t().offline, 'warn'],
      revoked: [st.message || t().revoked, 'bad'],
      invalid: [st.message || t().invalid, 'bad'],
      updates: [st.message || t().updates, 'warn'],
    }[st.status] || ['', ''];
    s.textContent = lines[0];
    if (st.status === 'licensed' && st.lastCheck) s.textContent += t().lastCheck(date(st.lastCheck));
    s.className = 'state ' + lines[1];
    const has = st.status === 'licensed';
    $('have').classList.toggle('hidden', !has && st.status !== 'offline' && st.status !== 'updates');
    $('renew').classList.toggle('hidden', !info.renewUrl || !st.updatesUntil || (st.status === 'licensed' && st.updatesUntil - Date.now() > 60 * 864e5));
    if (st.status === 'updates') $('renew').classList.add('primary');
    $('updInfo').textContent = st.updatesUntil ? t().updInfo(date(st.updatesUntil), st.updatesUntil < Date.now()) : '';
    $('open').classList.toggle('hidden', !has);
    $('enter').classList.toggle('hidden', has || st.status === 'updates');
    $('continue').classList.toggle('hidden', st.status !== 'trial');
    $('buy').classList.toggle('hidden', !info.buyUrl || has);
    if (st.key && !$('key').value) $('key').value = st.key;
    $('key').placeholder = t().example(info.code);
    $('activate').title = info.server ? '' : t().noServer;
  }
  texts();
  render(info);

  // Sprache wechseln: Hauptprozess stellt Menü, Meldungen und das Programm mit um
  async function applyLang(l) {
    if (!T[l]) return;
    lang = l;
    texts();
    const st = await L.info(); // Meldungen (z. B. „Testzeit abgelaufen“) kommen in der neuen Sprache
    render({ ...st, key: last.key });
    msg('');
  }
  document.querySelectorAll('[data-lang]').forEach((b) => { b.onclick = () => window.desktop.setLang(b.dataset.lang).then(applyLang); });
  if (window.desktop.onLang) window.desktop.onLang((l) => { if (l !== lang) applyLang(l); });

  const busy = async (btn, fn) => { btn.disabled = true; try { await fn(); } finally { btn.disabled = false; } };
  $('activate').onclick = () => busy($('activate'), async () => {
    msg(t().checking, true);
    const r = await L.activate($('key').value);
    if (!r.ok) return msg(r.message);
    msg(t().thanks, true);
    render(r.state);
    setTimeout(() => L.continue(), 900);
  });
  $('key').onkeydown = (e) => { if (e.key === 'Enter') $('activate').click(); };
  $('continue').onclick = () => L.continue();
  $('open').onclick = () => L.continue();
  $('buy').onclick = () => L.buy();
  $('renew').onclick = () => L.renew();
  $('check').onclick = () => busy($('check'), async () => { const r = await L.check(); render(r.state); if (r.state.status === 'licensed' && info.status !== 'licensed') setTimeout(() => L.continue(), 900); });
  $('release').onclick = () => busy($('release'), async () => { const r = await L.deactivate(); if (r.ok) { render(r.state); msg(t().released, true); } else if (!r.cancelled) msg(r.message); });
  $('copy').onclick = () => { navigator.clipboard.writeText($('machine').value).catch(() => {}); $('copy').textContent = t().copied; };
  $('offline').onclick = async () => {
    const r = await L.offline($('key').value, $('code').value);
    if (!r.ok) return msg(r.message);
    render(r.state);
    msg(t().done, true);
    setTimeout(() => L.continue(), 900);
  };
  $('key').focus();
})();
