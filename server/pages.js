/* Seiten außerhalb des Programms: Anmeldung, Registrierung, Passwort, Konto, Admin, Rechtstexte (Deutsch / Englisch / Dänisch). */
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
    cancelLink: 'Verträge hier kündigen', withdrawLink: 'Vertrag widerrufen',
    cancelTitle: 'Abo kündigen',
    cancelInfo: 'Hier kannst du dein StickStudio-Abo kündigen. Du bekommst sofort eine Bestätigung per E-Mail. Dein Zugang bleibt bis zum Ende des bezahlten Zeitraums bestehen.',
    kind: 'Art der Kündigung', ordinary: 'Ordentliche Kündigung', extraordinary: 'Außerordentliche Kündigung (aus wichtigem Grund)', reason: 'Grund (nur bei außerordentlicher Kündigung)',
    when: 'Zeitpunkt', nextPossible: 'Zum nächstmöglichen Zeitpunkt', atDate: 'Zum Datum', contract: 'Vertrag', contractName: 'StickStudio-Abo',
    fullName: 'Name (Vor- und Nachname bzw. Firma)', accountEmail: 'E-Mail-Adresse deines Kontos', ref: 'Kunden- oder Bestellnummer (optional)',
    cancelNow: 'Jetzt kündigen', cancelDoneTitle: 'Kündigung eingegangen',
    cancelDone: 'Deine Kündigung ist am {{at}} bei uns eingegangen.',
    withdrawTitle: 'Vertrag widerrufen',
    withdrawInfo: 'Als Verbraucher kannst du deinen Vertrag innerhalb von 14 Tagen nach Vertragsschluss ohne Angabe von Gründen widerrufen (siehe <a href="/legal/widerruf">Widerrufsbelehrung</a>). Du bekommst sofort eine Eingangsbestätigung per E-Mail.',
    statement: 'Erklärung', withdrawStatement: 'Hiermit widerrufe ich den von mir abgeschlossenen Vertrag über das StickStudio-Abo.',
    orderedOn: 'Bestellt am (optional)', withdrawNow: 'Widerruf bestätigen', withdrawDoneTitle: 'Widerruf eingegangen',
    withdrawDone: 'Dein Widerruf ist am {{at}} bei uns eingegangen.',
    mailSent: 'Eine Bestätigung haben wir an {{email}} geschickt.', mailOff: 'Bitte speichere oder drucke diese Seite als Bestätigung.',
    summary: 'Zusammenfassung', required: 'Bitte Name und E-Mail-Adresse angeben.',
    reasonLabel: 'Grund', nameLabel: 'Name', receivedOn: 'Eingegangen am',
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
    cancelLink: 'Cancel contracts here', withdrawLink: 'Withdraw from contract',
    cancelTitle: 'Cancel subscription',
    cancelInfo: 'Cancel your StickStudio subscription here. You will receive a confirmation by email right away. Your access remains until the end of the paid period.',
    kind: 'Type of cancellation', ordinary: 'Ordinary cancellation', extraordinary: 'Extraordinary cancellation (for good cause)', reason: 'Reason (extraordinary cancellation only)',
    when: 'Effective', nextPossible: 'At the earliest possible date', atDate: 'On date', contract: 'Contract', contractName: 'StickStudio subscription',
    fullName: 'Name (first and last name or company)', accountEmail: 'Email address of your account', ref: 'Customer or order number (optional)',
    cancelNow: 'Cancel now', cancelDoneTitle: 'Cancellation received',
    cancelDone: 'We received your cancellation on {{at}}.',
    withdrawTitle: 'Withdraw from contract',
    withdrawInfo: 'As a consumer you can withdraw from your contract within 14 days of conclusion without giving reasons (see <a href="/legal/widerruf">withdrawal policy</a>). You will receive a confirmation of receipt by email right away.',
    statement: 'Statement', withdrawStatement: 'I hereby withdraw from the contract I concluded for the StickStudio subscription.',
    orderedOn: 'Ordered on (optional)', withdrawNow: 'Confirm withdrawal', withdrawDoneTitle: 'Withdrawal received',
    withdrawDone: 'We received your withdrawal on {{at}}.',
    mailSent: 'We have sent a confirmation to {{email}}.', mailOff: 'Please save or print this page as confirmation.',
    summary: 'Summary', required: 'Please enter your name and email address.',
    reasonLabel: 'Reason', nameLabel: 'Name', receivedOn: 'Received on',
  },
  da: {
    login: 'Log ind', register: 'Opret konto', email: 'E-mail', password: 'Adgangskode', password2: 'Gentag adgangskode',
    name: 'Navn / firma (valgfrit)', forgot: 'Glemt adgangskode?', noAccount: 'Har du ikke en konto endnu?', haveAccount: 'Allerede registreret?',
    trialInfo: 'Prøv gratis: alle funktioner i {{days}} dage, uden betalingsoplysninger.',
    accept: 'Jeg har læst og accepterer <a href="/legal/agb" target="_blank">handelsbetingelserne</a>. Jeg har gjort mig bekendt med <a href="/legal/datenschutz" target="_blank">privatlivspolitikken</a>.',
    createAccount: 'Opret konto og start prøveperioden', forgotTitle: 'Glemt adgangskode', send: 'Send link',
    forgotInfo: 'Indtast din e-mailadresse. Hvis der findes en konto, modtager du et link til at nulstille adgangskoden (gyldigt i 1 time).',
    resetTitle: 'Ny adgangskode', save: 'Gem', back: 'Tilbage til log ind',
    imprint: 'Virksomhedsoplysninger', terms: 'Handelsbetingelser', withdrawal: 'Fortrydelsesret', privacy: 'Privatliv', licenses: 'Licenser',
    account: 'Min konto', admin: 'Administration', logout: 'Log ud', toApp: 'Åbn programmet',
    verifyTitle: 'Bekræft din e-mail', verifySent: 'Vi har sendt dig en e-mail med et bekræftelseslink. Bekræft venligst din adresse – derefter kan du logge ind.',
    verified: 'Tak! Din e-mailadresse er bekræftet. Du kan logge ind nu.', badLink: 'Linket er ugyldigt eller udløbet.',
    resetDone: 'Din adgangskode er ændret. Du kan logge ind nu.', notFound: 'Siden blev ikke fundet',
    pwRules: 'Mindst 10 tegn.',
    cancelLink: 'Opsig aftaler her', withdrawLink: 'Fortryd aftale',
    cancelTitle: 'Opsig abonnement',
    cancelInfo: 'Her kan du opsige dit StickStudio-abonnement. Du får straks en bekræftelse på e-mail. Din adgang gælder til udløbet af den betalte periode.',
    kind: 'Type af opsigelse', ordinary: 'Almindelig opsigelse', extraordinary: 'Ekstraordinær opsigelse (af væsentlig grund)', reason: 'Begrundelse (kun ved ekstraordinær opsigelse)',
    when: 'Tidspunkt', nextPossible: 'Til det tidligst mulige tidspunkt', atDate: 'Pr. dato', contract: 'Aftale', contractName: 'StickStudio-abonnement',
    fullName: 'Navn (for- og efternavn eller firma)', accountEmail: 'E-mailadressen på din konto', ref: 'Kunde- eller ordrenummer (valgfrit)',
    cancelNow: 'Opsig nu', cancelDoneTitle: 'Opsigelse modtaget',
    cancelDone: 'Vi har modtaget din opsigelse den {{at}}.',
    withdrawTitle: 'Fortryd aftale',
    withdrawInfo: 'Som forbruger kan du fortryde din aftale inden for 14 dage efter aftalens indgåelse uden at angive en grund (se <a href="/legal/widerruf">fortrydelsesvejledningen</a>). Du får straks en kvittering for modtagelsen på e-mail.',
    statement: 'Erklæring', withdrawStatement: 'Jeg fortryder hermed den aftale, jeg har indgået om StickStudio-abonnementet.',
    orderedOn: 'Bestilt den (valgfrit)', withdrawNow: 'Bekræft fortrydelse', withdrawDoneTitle: 'Fortrydelse modtaget',
    withdrawDone: 'Vi har modtaget din fortrydelse den {{at}}.',
    mailSent: 'Vi har sendt en bekræftelse til {{email}}.', mailOff: 'Gem eller udskriv venligst denne side som bekræftelse.',
    summary: 'Oversigt', required: 'Angiv venligst navn og e-mailadresse.',
    reasonLabel: 'Begrundelse', nameLabel: 'Navn', receivedOn: 'Modtaget den',
  },
};

const LANGS = ['de', 'en', 'da'];
const LOCALE = { de: 'de-DE', en: 'en-GB', da: 'da-DK' };

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function layout(lang, title, body, opts = {}) {
  const t = T[lang] || T.de;
  const u = opts.user;
  const switcher = LANGS.map((l) => (l === lang ? `<a class="lang" href="?lang=${l}" aria-current="true" style="font-weight:700">${l.toUpperCase()}</a>` : `<a class="lang" href="?lang=${l}" style="opacity:.75">${l.toUpperCase()}</a>`)).join('');
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} – StickStudio</title><link rel="stylesheet" href="/site/site.css">${opts.head || ''}</head>
<body class="${opts.wide ? 'wide' : ''}"><header class="top"><a class="logo" href="/">StickStudio</a><nav>
${u ? `<a href="/">${t.toApp}</a><a href="/account">${t.account}</a>${u.role === 'admin' ? `<a href="/admin">${t.admin}</a>` : ''}<form method="post" action="/logout" class="inline"><button>${t.logout}</button></form>` : ''}
${switcher}</nav></header>
<main>${body}</main>
<footer><a href="/legal/impressum">${t.imprint}</a><a href="/legal/agb">${t.terms}</a><a href="/legal/widerruf">${t.withdrawal}</a><a href="/legal/datenschutz">${t.privacy}</a><a href="/legal/lizenzen">${t.licenses}</a><a href="/kuendigen">${t.cancelLink}</a><a href="/widerrufen">${t.withdrawLink}</a></footer>
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

/* ---------- Kündigungsbutton (§ 312k BGB) und Widerrufsfunktion ---------- */
// Erreichbar ohne Anmeldung; bei angemeldeten Kunden sind Name und E-Mail vorausgefüllt.
function cancelForm(lang, v = {}, m) {
  const t = T[lang];
  return layout(lang, t.cancelTitle, `<section class="card"><h1>${t.cancelTitle}</h1><p>${t.cancelInfo}</p>${msgBox(m)}
<form method="post" action="/kuendigen">
<label>${t.contract}<input value="${t.contractName}" disabled></label>
<fieldset class="radio"><legend>${t.kind}</legend>
<label class="check"><input type="radio" name="kind" value="ordinary" ${v.kind !== 'extraordinary' ? 'checked' : ''}> <span>${t.ordinary}</span></label>
<label class="check"><input type="radio" name="kind" value="extraordinary" ${v.kind === 'extraordinary' ? 'checked' : ''}> <span>${t.extraordinary}</span></label></fieldset>
<label>${t.reason}<textarea name="reason" maxlength="2000">${esc(v.reason)}</textarea></label>
<fieldset class="radio"><legend>${t.when}</legend>
<label class="check"><input type="radio" name="when" value="next" ${v.when !== 'date' ? 'checked' : ''}> <span>${t.nextPossible}</span></label>
<label class="check"><input type="radio" name="when" value="date" ${v.when === 'date' ? 'checked' : ''}> <span>${t.atDate}</span> <input type="date" name="date" value="${esc(v.date)}" style="width:auto"></label></fieldset>
<label>${t.fullName}<input name="name" required maxlength="200" value="${esc(v.name)}"></label>
<label>${t.accountEmail}<input type="email" name="email" required maxlength="200" value="${esc(v.email)}"></label>
<label>${t.ref}<input name="ref" maxlength="100" value="${esc(v.ref)}"></label>
<button class="primary">${t.cancelNow}</button></form></section>`, { user: v.user });
}
function withdrawForm(lang, v = {}, m) {
  const t = T[lang];
  return layout(lang, t.withdrawTitle, `<section class="card"><h1>${t.withdrawTitle}</h1><p>${t.withdrawInfo}</p>${msgBox(m)}
<form method="post" action="/widerrufen">
<label>${t.statement}<textarea disabled>${t.withdrawStatement}</textarea></label>
<label>${t.fullName}<input name="name" required maxlength="200" value="${esc(v.name)}"></label>
<label>${t.accountEmail}<input type="email" name="email" required maxlength="200" value="${esc(v.email)}"></label>
<label>${t.orderedOn}<input type="date" name="ordered" value="${esc(v.ordered)}"></label>
<label>${t.ref}<input name="ref" maxlength="100" value="${esc(v.ref)}"></label>
<button class="primary">${t.withdrawNow}</button></form></section>`, { user: v.user });
}
// Bestätigungsseite mit Inhalt und Zeitpunkt der Erklärung
function receipt(lang, title, text, lines, mailInfo, user) {
  return layout(lang, title, `<section class="card"><h1>${esc(title)}</h1>${msgBox({ ok: true, text })}
<h2>${T[lang].summary}</h2><div class="kv">${lines.map(([k, v]) => `<div>${esc(k)}</div><div>${esc(v)}</div>`).join('')}</div>
<p class="muted">${esc(mailInfo)}</p></section>`, { user });
}

/* ---------- Rechtstexte ---------- */
const LEGAL = ['impressum', 'agb', 'widerruf', 'datenschutz', 'lizenzen', 'kaufbedingungen', 'widerruf-kauf'];
function legal(root, lang, page, settings, user) {
  if (!LEGAL.includes(page)) return null;
  // gewünschte Sprache, sonst Englisch, sonst Deutsch (z. B. dänische Fassung noch nicht vorhanden)
  const order = [lang, 'en', 'de'].filter((l, i, a) => a.indexOf(l) === i);
  const fileLang = order.find((l) => fs.existsSync(path.join(root, 'legal', `${page}.${l}.html`)));
  if (!fileLang) return null;
  let html;
  try { html = fs.readFileSync(path.join(root, 'legal', `${page}.${fileLang}.html`), 'utf8'); } catch (e) { return null; }
  // Platzhalter aus den Admin-Einstellungen (in der Sprache des Textes); leere optionale Abschnitte entfallen
  const val = (k) => {
    if (k === 'date') return settings.legal_date || new Date().toISOString().slice(0, 10);
    if (k === 'license_term') return termFor(settings, fileLang);
    if (k === 'price_text') return settingFor(settings, 'price_text', fileLang);
    return settings[k] ?? '';
  };
  html = html.replace(/<(\w+)([^>]*?)\sdata-optional="(\w+)"([^>]*)>([\s\S]*?)<\/\1>/g, (m, tag, a, key, b, inner) => (String(val(key)).trim() ? `<${tag}${a}${b}>${inner}</${tag}>` : ''));
  // in Attributen (z. B. mailto:) nur den reinen Wert einsetzen
  html = html.replace(/(="[^"<>]*?)\{\{(\w+)\}\}/g, (m, pre, k) => pre + esc(val(k)).replace(/"/g, '&quot;'));
  html = html.replace(/\{\{(\w+)\}\}/g, (m, k) => esc(val(k)) || `<span class="todo">[${k}]</span>`);
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html);
  const title = h1 ? h1[1].replace(/<[^>]+>/g, '').trim() : page;
  return layout(lang, title, `<article class="legal" lang="${fileLang}">${html}</article>`, { user });
}
/** Laufzeit: eigene Angabe der Sprache; für Dänisch sonst aus der englischen abgeleitet („12 months“ → „12 måneder“) */
function termFor(settings, lang) {
  const own = settings['license_term_' + lang];
  if (own && String(own).trim()) return own;
  if (lang === 'da') {
    const m = /^\s*(\d+)\s*(month|months|year|years)\s*$/i.exec(settings.license_term_en || '12 months');
    if (m) return `${m[1]} ${/^month/i.test(m[2]) ? (+m[1] === 1 ? 'måned' : 'måneder') : 'år'}`;
  }
  return settingFor(settings, 'license_term', lang) || { de: '12 Monate', da: '12 måneder' }[lang] || '12 months';
}
/** Sprachabhängige Einstellung (z. B. price_text_da), sonst Englisch, sonst Deutsch */
function settingFor(settings, base, lang) {
  for (const l of [lang, 'en', 'de']) { const v = settings[`${base}_${l}`]; if (v && String(v).trim()) return v; }
  return '';
}

module.exports = { T, LANGS, LOCALE, settingFor, termFor, layout, login, register, forgot, reset, info, account, admin, legal, LEGAL, esc, cancelForm, withdrawForm, receipt };
