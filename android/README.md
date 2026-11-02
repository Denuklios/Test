# WF Werkstatt – Android-App

Schlanke Handy-App für Werkstatt und Mitarbeiter. Sie bringt ihre Oberfläche selbst mit (`www/`) und spricht über `api.php` mit der Auftrags-App auf dem Server.

- Anmeldung: In der Web-App unter Einstellungen → „Handy-App“ eine Person anlegen. Der Code (15 Min. gültig) wird in der App eingetragen und gegen einen dauerhaften Schlüssel getauscht. Abmelden sperrt sofort.
- Die App darf nur Werkstatt-Aktionen (`WF_APP_ACTIONS` in `auftraege/api.php`), keine Buchhaltung und keine Einstellungen.
- Gemeinsame Teile (Aussehen `app.css`, Texte `i18n.js`, Schriften, Beleg-Zuschnitt aus `app.js`) kopiert `prepare-www.sh` beim Bauen aus `../auftraege/assets`.

## Bauen

    ./build.sh

Braucht Android SDK (`/opt/android-sdk` mit platforms;android-34 und build-tools;35.0.0) und Java. Ergebnis: `../auftraege/app/wunsch-fabrik-werkstatt.apk` und `version.json`; beide kommen mit dem normalen Upload auf den Server.

Neue Version: `VERSION`/`CODE` in `build.sh` und `APP_VERSION` in `www/mobile.js` erhöhen. Die App zeigt dann „Neue App-Version verfügbar“.

Signatur: `keystore/werkstatt.jks` (Passwort in `keystore/password.txt`) liegt bewusst nicht im Repository. Sicher aufbewahren und zum Bauen eines Updates wieder nach `keystore/` legen – mit einem anderen Schlüssel lässt sich ein Update nicht über die installierte App installieren.

## Benachrichtigungen (ab 1.1.0)

Ohne Firebase: `Notifier.java` fragt `api.php?a=app_events&cursor=…` ab (Stand je Art: Anfragen, Unterschriften, Zahlungen; Server in `auftraege/inc/events.php`).
- Normal: `NotifyJob` (JobScheduler, alle 15 Min., übersteht Neustart). Sofort: `NotifyService` (Vordergrund-Dienst, jede Minute).
- Solange die App offen ist, prüft sie zusätzlich alle 2 Minuten und beim Zurückkehren.
- Antippen übergibt `order:<id>` bzw. `inquiry:<id>` an `window.WFOpen` in `www/mobile.js`.
- Anfragen liest der Server aus der MariaDB der Webseite (`../db_config.php`, nur lesend).
