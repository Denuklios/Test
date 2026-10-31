# AusgabenKompass (Android)

Haushaltsbuch-App, die die Stärken der drei Testsieger 2026 (finanzwissen.de) vereint:
- **Finanzguru**: wiederkehrende Zahlungen/Verträge automatisch erkennen
- **Finanzblick**: Budgets/Limits pro Kategorie
- **Mein Haushaltsbuch Pro**: Kontoauszug-Import (CSV), Daueraufträge, Belegfotos
- plus Bon-Texterkennung wie MrReceipt/epap – offline mit Google ML Kit

## Funktionen
- Startbetrag pro Monat, „frei verfügbar“ nach Ausgaben **und** noch offenen Fixkosten, Betrag pro Tag
- Monatsbeginn frei wählbar (z. B. Gehaltstag)
- Kontoauszug: CSV (Sparkasse, Volksbank, DKB, ING, Comdirect, dänische Banken …), PDF, CAMT-XML, MT940, Foto
- Fixkosten-Erkennung, danach automatische monatliche (oder viertel-/halb-/jährliche) Buchung
- Doppelte Buchungen (Bon + Kartenzahlung) werden erkannt und können zusammengeführt werden
- Bon fotografieren → Händler, Datum, Artikel, Summe
- Screenshots von Online-Bestellungen hochladen oder aus anderen Apps teilen
- Statistik, Limits pro Kategorie, Sicherung (JSON), Export (CSV)
- Handyzahlungen (Google Wallet, Samsung Wallet, Banking-Apps) automatisch aus Benachrichtigungen erfassen
- Händler-Vorschläge beim Tippen, Kategorie wird automatisch gewählt und gelernt
- Homescreen-Widget: freies Geld + pro Tag, Knöpfe Betrag / Foto / Hochladen
- Alle Daten bleiben lokal auf dem Handy

## Bauen
```
echo "sdk.dir=/pfad/zum/android-sdk" > local.properties
gradle assembleRelease      # -> app/build/outputs/apk/release/app-release.apk
node tests/parsers.test.js  # Tests der Erkennungslogik
```
Die Oberfläche liegt in `app/src/main/assets/www/`, die native Hülle (Kamera, OCR, Dateien) in `MainActivity.java`.
Signatur: `signing/keystore.properties` (storeFile, storePassword, keyAlias, keyPassword) anlegen – nicht einchecken. Für Updates immer denselben Schlüssel verwenden.
