/* Lizenzfenster: Schlüssel eingeben, Status anzeigen, Gerät freigeben, offline freischalten. */
(async function () {
  const $ = (id) => document.getElementById(id);
  const L = window.desktop.license;
  const date = (ms) => new Date(ms).toLocaleDateString('de-DE');
  const msg = (text, ok) => { $('msg').textContent = text || ''; $('msg').className = 'msg ' + (ok ? 'ok' : 'err'); };
  let info = await L.info();

  function render(st) {
    info = { ...info, ...st };
    $('name').textContent = info.name;
    $('ver').textContent = 'Version ' + info.version;
    $('machine').value = info.machine;
    const s = $('state');
    const lines = {
      licensed: [`Lizenz gültig${info.name && st.name ? ' für ' + st.name : ''}.`, 'ok'],
      trial: [`Testversion: noch ${st.daysLeft} ${st.daysLeft === 1 ? 'Tag' : 'Tage'}. Danach brauchst du einen Lizenzschlüssel.`, 'warn'],
      expired: [st.message || 'Die Testzeit ist abgelaufen.', 'bad'],
      offline: [st.message || 'Die Lizenz muss online geprüft werden.', 'warn'],
      revoked: [st.message || 'Diese Lizenz wurde gesperrt.', 'bad'],
      invalid: [st.message || 'Die Freischaltung ist ungültig.', 'bad'],
    }[st.status] || ['', ''];
    s.textContent = lines[0];
    if (st.status === 'licensed' && st.lastCheck) s.textContent += ` Zuletzt geprüft am ${date(st.lastCheck)}.`;
    s.className = 'state ' + lines[1];
    const has = st.status === 'licensed';
    $('have').classList.toggle('hidden', !has && st.status !== 'offline');
    $('open').classList.toggle('hidden', !has);
    $('enter').classList.toggle('hidden', has);
    $('continue').classList.toggle('hidden', st.status !== 'trial');
    $('buy').classList.toggle('hidden', !info.buyUrl || has);
    if (st.key && !$('key').value) $('key').value = st.key;
    $('key').placeholder = `z. B. ${info.code}-7K2QX-M9D4T-HB3WN-R8P6C`;
    if (!info.server) $('activate').title = 'In diesem Programm ist kein Lizenzserver eingestellt – nur „Ohne Internet freischalten“ möglich.';
  }
  render(info);

  const busy = async (btn, fn) => { btn.disabled = true; try { await fn(); } finally { btn.disabled = false; } };
  $('activate').onclick = () => busy($('activate'), async () => {
    msg('Wird geprüft …', true);
    const r = await L.activate($('key').value);
    if (!r.ok) return msg(r.message);
    msg('Freigeschaltet. Vielen Dank!', true);
    render(r.state);
    setTimeout(() => L.continue(), 900);
  });
  $('key').onkeydown = (e) => { if (e.key === 'Enter') $('activate').click(); };
  $('continue').onclick = () => L.continue();
  $('open').onclick = () => L.continue();
  $('buy').onclick = () => L.buy();
  $('check').onclick = () => busy($('check'), async () => { const r = await L.check(); render(r.state); });
  $('release').onclick = () => busy($('release'), async () => { const r = await L.deactivate(); if (r.ok) { render(r.state); msg('Dieses Gerät ist abgemeldet.', true); } else if (!r.cancelled) msg(r.message); });
  $('copy').onclick = () => { navigator.clipboard.writeText($('machine').value).catch(() => {}); $('copy').textContent = 'Kopiert ✓'; };
  $('offline').onclick = async () => {
    const r = await L.offline($('key').value, $('code').value);
    if (!r.ok) return msg(r.message);
    render(r.state);
    msg('Freigeschaltet.', true);
    setTimeout(() => L.continue(), 900);
  };
  $('key').focus();
})();
