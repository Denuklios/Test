# Gassirunde – Android-App

Native Android-App (Java, ohne Gradle gebaut). Die Oberfläche steckt in der App (`public/` wird beim Bauen nach `assets/www` kopiert, Leaflet liegt in `vendor/`), die Daten kommen von `api.php` auf dem Server.

- **GPS als Vordergrund-Dienst** (`TrackService`): zeichnet auch bei ausgeschaltetem Bildschirm und in der Hosentasche weiter auf. Eine Benachrichtigung zeigt Kilometer und Zeit.
- **Im Hintergrund** (App nicht sichtbar) teilt der Dienst die Position (wenn eingeschaltet), warnt mit Benachrichtigung und Vibration, wenn jemand mit „Bitte Abstand“ näher als 150 m ist, und meldet, wenn jemand winkt.
- **Fortsetzen:** Wird die App während eines Spaziergangs neu geöffnet, geht die Aufnahme mit allen Punkten weiter.
- **Anmeldung:** Die Oberfläche wird unter der Server-Adresse (`MainActivity.BASE`) angezeigt, dadurch funktioniert das Anmelde-Cookie wie im Browser.
- **Updates:** Die App vergleicht ihre Version mit `app/version.json` auf dem Server und bietet die neue APK zum Download an.

## Bauen

    ./build.sh

Braucht das Android SDK in `/opt/android-sdk` (`platforms;android-34`, `build-tools;35.0.0`) und Java. Ergebnis: `dist/gassirunde.apk` und `dist/version.json`. Beide kommen mit dem nächsten `[hochladen]` nach `…/gassi-ljv0zkx2/app/`.

Neue Version: `VERSION` und `CODE` in `build.sh` erhöhen.

**Signatur:** `keystore/gassirunde.jks` mit dem Passwort in `keystore/password.txt` liegt bewusst nicht im Repository. Ohne denselben Schlüssel lässt sich ein Update nicht über die installierte App installieren. Beide Dateien sicher aufbewahren und zum Bauen eines Updates wieder nach `keystore/` legen.
