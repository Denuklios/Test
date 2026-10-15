/* Seiten außerhalb des Programms: Anmeldung, Registrierung, Passwort, Konto, Admin, Rechtstexte (Deutsch / Englisch). */
'use strict';
const fs = require('fs');
const path = require('path');

const T = {
  de: {
    login: 'Anmelden', register: 'Registrieren', email: 'E-Mail', password: 'Passwort', password2: 'Passwort wiederholen',
    name: 'Name / Firma (optional)', forgot: 'Passwort vergessen?', noAccount: 'Noch kein Konto?', haveAccount: 'Schon registriert?',
    trialInfo: 'Kostenlos testen: {{days}} Tage alle Funktionen, ohne Zahlungsdaten.',
    accept: 'Ich habe die <a href="/legal/agb" target="_blank">AGB</a> gelesen und akzeptiere sie. Die <a href="/legal/datenschutz" target="_blank">Datenschutzerklärung</a> habe ich zur Kenntnis genommen.',
    createAccount: 'Konto anlegen und Testversion starten', forgotTitle: 'Passwort vergessen', send: 'Link senden',
    forgotInfo: 'Gib deine E-Mail-Adresse ein. Wenn ein Konto existiert, bekommst du einen Link zum Zurücksetzen (1 Stunde gültig).',
    resetTitle: 'Neues Passwort', save: 'Speichern', back: 'Zurück zur Anmeldung',
    imprint: 'Impressum', terms: 'AGB', withdrawal: 'Widerruf', privacy: 'Datenschutz', licenses: 'Lizenzen',
    account: 'Mein Konto', admin: 'Verwaltung', logout: 'Abmelden', toApp: 'Zum Programm',
    verifyTitle: 'E-Mail bestätigen', verifySent: 'Wir haben dir eine E-Mail mit einem Bestätigungslink geschickt. Bitte bestätige deine Adresse, danach kannst du dich anmelden.',
    verified: 'Danke! Deine E-Mail-Adresse ist bestätigt. Du kannst dich jetzt anmelden.', badLink: 'Der Link ist ungültig oder abgelaufen.',
    resetDone: 'Dein Passwort wurde geändert. Du kannst dich jetzt anmelden.', notFound: 'Seite nicht gefunden',
    pwRules: 'Mindestens 10 Zeichen.',
  },
  en: {
    login: 'Sign in', register: 'Create account', email: 'Email', password: 'Password', password2: 'Repeat password',
    name: 'Name / company (optional)', forgot: 'Forgot password?', noAccount: 'No account yet?', haveAccount: 'Already registered?',
    trialInfo: 'Try it free: all features for {{days}} days, no payment details needed.',
    accept: 'I have read and accept the <a href="/legal/agb" target="_blank">terms and conditions</a>. I have taken note of the <a href="/legal/datenschutz" target="_blank">privacy policy</a>.',
    createAccount: 'Create account and start trial', forgotTitle: 'Forgot password', send: 'Send link',
    forgotInfo: 'Enter your email address. If an account exists, you will receive a reset link (valid for 1 hour).',
    resetTitle: 'New password', save: 'Save', back: 'Back to sign in',
    imprint: 'Legal notice', terms: 'Terms', withdrawal: 'Withdrawal', privacy: 'Privacy', licenses: 'Licenses',
    account: 'My account', admin: 'Administration', logout: 'Sign out', toApp: 'Open the program',
    verifyTitle: 'Confirm your email', verifySent: 'We have sent you an email with a confirmation link. Please confirm your address, then you can sign in.',
    verified: 'Thank you! Your email address is confirmed. You can sign in now.', badLink: 'The link is invalid or has expired.',
    resetDone: 'Your password has been changed. You can sign in now.', notFound: 'Page not found',
    pwRules: 'At least 10 characters.',
  },
};

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function layout(lang, title, body, opts = {}) {
  const t = T[lang];
  const other = lang === 'de' ? 'en' : 'de';
  const u = opts.user;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} – StickStudio</title><link rel="stylesheet" href="/site/site.css">${opts.head || ''}</head>
<body class="${opts.wide ? 'wide' : ''}"><header class="top"><a class="logo" href="/">StickStudio</a><nav>
${u ? `<a href="/">${t.toApp}</a><a href="/account">${t.account}</a>${u.role === 'admin' ? `<a href="/admin">${t.admin}</a>` : ''}<form method="post" action="/logout" class="inline"><button>${t.logout}</button></form>` : ''}
<a class="lang" href="?lang=${other}">${other.toUpperCase()}</a></nav></header>
<main>${body}</main>
<footer><a href="/legal/impressum">${t.imprint}</a><a href="/legal/agb">${t.terms}</a><a href="/legal/widerruf">${t.withdrawal}</a><a href="/legal/datenschutz">${t.privacy}</a><a href="/legal/lizenzen">${t.licenses}</a></footer>
${opts.scripts || ''}</body></html>`;
}

const msgBox = (m) => (m ? `<div class="msg ${m.ok ? 'ok' : 'err'}">${esc(m.text)}</div>` : '');

function login(lang, m, email = '') {
  const t = T[lang];
  return layout(lang, t.login, `<section class="card"><h1>${t.login}</h1>${msgBox(m)}
<form method="post" action="/login"><label>${t.email}<input type="email" name="email" required autocomplete="username" value="${esc(email)}"></label>
<label>${t.password}<input type="password" name="password" required autocomplete="current-password"></label>
<button class="primary">${t.login}</button></form>
<p><a href="/forgot">${t.forgot}</a></p><p>${t.noAccount} <a href="/register">${t.register}</a></p></section>`);
}

function register(lang, m, v = {}, trialDays = 14) {
  const t = T[lang];
  return layout(lang, t.register, `<section class="card"><h1>${t.register}</h1><p class="lead">${t.trialInfo.replace('{{days}}', trialDays)}</p>${msgBox(m)}
<form method="post" action="/register"><label>${t.email}<input type="email" name="email" required autocomplete="username" value="${esc(v.email)}"></label>
<label>${t.name}<input name="name" maxlength="120" autocomplete="organization" value="${esc(v.name)}"></label>
<label>${t.password}<input type="password" name="password" required minlength="10" autocomplete="new-password"><small>${t.pwRules}</small></label>
<label>${t.password2}<input type="password" name="password2" required minlength="10" autocomplete="new-password"></label>
<label class="check"><input type="checkbox" name="accept" value="1" required> <span>${t.accept}</span></label>
<input type="hidden" name="lang" value="${lang}">
<button class="primary">${t.createAccount}</button></form>
<p>${t.haveAccount} <a href="/login">${t.login}</a></p></section>`);
}

function forgot(lang, m) {
  const t = T[lang];
  return layout(lang, t.forgotTitle, `<section class="card"><h1>${t.forgotTitle}</h1><p>${t.forgotInfo}</p>${msgBox(m)}
<form method="post" action="/forgot"><label>${t.email}<input type="email" name="email" required></label><button class="primary">${t.send}</button></form>
<p><a href="/login">${t.back}</a></p></section>`);
}

function reset(lang, token, m) {
  const t = T[lang];
  return layout(lang, t.resetTitle, `<section class="card"><h1>${t.resetTitle}</h1>${msgBox(m)}
<form method="post" action="/reset"><input type="hidden" name="token" value="${esc(token)}">
<label>${t.password}<input type="password" name="password" required minlength="10" autocomplete="new-password"><small>${t.pwRules}</small></label>
<label>${t.password2}<input type="password" name="password2" required minlength="10" autocomplete="new-password"></label>
<button class="primary">${t.save}</button></form><p><a href="/login">${t.back}</a></p></section>`);
}

function info(lang, title, text, ok = true) {
  const t = T[lang];
  return layout(lang, title, `<section class="card"><h1>${esc(title)}</h1>${msgBox({ ok, text })}<p><a href="/login">${t.back}</a></p></section>`);
}

// Konto- und Admin-Seite: Inhalt baut das jeweilige Skript (Daten über die API)
function account(lang, user) {
  return layout(lang, T[lang].account, `<section class="card wide" id="accountApp" data-lang="${lang}"></section>`, { user, scripts: '<script src="/site/account.js"></script>' });
}
function admin(lang, user) {
  return layout(lang, T[lang].admin, `<section class="card wide" id="adminApp" data-lang="${lang}"></section>`, { user, wide: true, scripts: '<script src="/site/admin.js"></script>' });
}

/* ---------- Rechtstexte ---------- */
const LEGAL = ['impressum', 'agb', 'widerruf', 'datenschutz', 'lizenzen'];
function legal(root, lang, page, settings, user) {
  if (!LEGAL.includes(page)) return null;
  const file = path.join(root, 'legal', `${page}.${lang}.html`);
  const alt = path.join(root, 'legal', `${page}.de.html`);
  let html;
  try { html = fs.readFileSync(fs.existsSync(file) ? file : alt, 'utf8'); } catch (e) { return null; }
  // Platzhalter aus den Admin-Einstellungen; leere optionale Abschnitte entfallen
  const val = (k) => {
    if (k === 'date') return settings.legal_date || new Date().toISOString().slice(0, 10);
    if (k === 'license_term') return (lang === 'de' ? settings.license_term_de : settings.license_term_en) || (lang === 'de' ? '12 Monate' : '12 months');
    if (k === 'price_text') return (lang === 'de' ? settings.price_text_de : settings.price_text_en) || '';
    return settings[k] ?? '';
  };
  html = html.replace(/<(\w+)([^>]*?)\sdata-optional="(\w+)"([^>]*)>([\s\S]*?)<\/\1>/g, (m, tag, a, key, b, inner) => (String(val(key)).trim() ? `<${tag}${a}${b}>${inner}</${tag}>` : ''));
  // in Attributen (z. B. mailto:) nur den reinen Wert einsetzen
  html = html.replace(/(="[^"<>]*?)\{\{(\w+)\}\}/g, (m, pre, k) => pre + esc(val(k)).replace(/"/g, '&quot;'));
  html = html.replace(/\{\{(\w+)\}\}/g, (m, k) => esc(val(k)) || `<span class="todo">[${k}]</span>`);
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html);
  const title = h1 ? h1[1].replace(/<[^>]+>/g, '').trim() : page;
  return layout(lang, title, `<article class="legal">${html}</article>`, { user });
}

module.exports = { T, layout, login, register, forgot, reset, info, account, admin, legal, LEGAL, esc };
