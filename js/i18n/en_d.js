/* Englische Übersetzungen (Teil D: Online-Version – Konto-Menü, Lizenz-Hinweise) */
(function (g) {
  const HW = (g.HW = g.HW || {});
  HW.I18N = HW.I18N || { en: { exact: {}, rx: [] } };
  const E = HW.I18N.en;
  Object.assign(E.exact, {
    'Konto': 'Account', 'Lizenz': 'License', 'Lizenz…': 'License…', 'Mein Konto': 'My account', 'Verwaltung': 'Administration',
    'AGB': 'Terms', 'Datenschutz': 'Privacy', 'Impressum': 'Legal notice', 'Lizenzen': 'Licenses', 'Abmelden': 'Sign out',
    'Nur ansehen': 'View only', 'Testversion': 'Trial', 'noch': '', 'Tag': 'day left', 'Tage': 'days left', 'Tagen': 'days',
    'bis': 'until', 'Lizenz gültig bis': 'License valid until', 'Lizenz kaufen': 'Buy license', 'Lizenz verlängern': 'Renew license',
    'Admin-Konto – ohne Ablauf.': 'Admin account – no expiry.',
    'Deine Lizenz ist abgelaufen. Du kannst deine Designs weiter ansehen, aber nicht mehr speichern oder als Stickdatei exportieren.': 'Your license has expired. You can still view your designs, but you can no longer save them or export embroidery files.',
    'Deine Lizenz ist abgelaufen. Speichern und Export sind gesperrt.': 'Your license has expired. Saving and export are locked.',
    'Deine Lizenz läuft in': 'Your license expires in', 'ab.': '.',
    'Zum Kauf oder zur Verlängerung wende dich bitte an': 'To buy or renew, please contact', 'den Support': 'support',
    'Nach dem Kauf bitte die Seite neu laden.': 'After purchasing, please reload the page.',
    'Export': 'Export', 'Die Stickdatei konnte nicht erzeugt werden:': 'The embroidery file could not be created:',
    'In „Meine Designs“ gespeichert.': 'Saved to “My designs”.',
    'Dein Konto: Lizenz und Laufzeit, Passwort ändern, Rechtstexte und Abmelden.': 'Your account: license and term, change password, legal texts and sign out.',
    'Deutsch': 'German', 'English': 'English', 'Neue Farbe': 'New color',
    // Lizenz-Hinweis beim Umschalten im laufenden Programm (Textstücke um <b>…</b>)
    'Testversion: noch': 'Trial:', 'Tage.': 'days left.', 'Tag.': 'day left.', 'Tagen ab.': 'days.', 'Tag ab.': 'day.',
    '– Deine Lizenz ist abgelaufen. Speichern und Export sind gesperrt.': '– Your license has expired. Saving and export are locked.', 'Stiche quer zur Säule ausrichten': 'Align stitches across the column',
  });
  E.rx.push(
    [/^(\d+): Neue Farbe – (.+)$/, '$1: New color – $2'],
    [/^Testversion: noch (\d+) (Tag|Tage) \(bis (.+)\)\.$/, (m, n, x, d) => `Trial: ${n} day${n === '1' ? '' : 's'} left (until ${d}).`],
  );
})(typeof window !== 'undefined' ? window : globalThis);
