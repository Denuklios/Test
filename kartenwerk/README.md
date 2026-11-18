# Kartenwerk – alle Karten und Punkte an einem Ort

Android-App (Flutter) für Kundenkarten, Bonuspunkte, Gutscheine, Tickets, Boardingpässe,
Mitgliedsausweise und alles andere mit Nummer oder Barcode.

- `app/` – Flutter-Quellcode (`lib/`), Tests (`test/`, Bildschirmfotos in `test/shots/`)
- `server/` – Download-Seite und Auto-Update-Dateien für www.wunsch-fabrik.dk/kartenwerk
- `art/` – Original-Grafiken aus Canva (Icon, Startbild, Punkte-Grafik, Leere Wallet)

## Funktionen
- Barcode/QR scannen (auch aus Screenshots), Karte fotografieren (Code + Name werden erkannt)
- Apple-Wallet-Pässe (.pkpass) importieren – inkl. Farben, Logo, Feldern und Punktestand
- Vorlagen (PAYBACK, DeutschlandCard, Coop, Salling, Matas, Miles & More, EuroBonus, …)
- Punktestand mit Verlauf, Ziel, Geldwert; Aktualisieren per Screenshot (Texterkennung offline)
- Gesamtwert aller Punkte und Guthaben, Hinweise auf ablaufende Gutscheine
- Vorzeigen mit voller Helligkeit, Karte umdrehen (Rückseite), Nummer kopieren
- Fingerabdruck-Sperre, Sicherung/Wiederherstellung als ZIP, automatische Updates

## Bauen
```
cd kartenwerk/app
flutter build apk --release --target-platform android-arm64
```
Signiert wird mit `android/kartenwerk.jks` + `android/key.properties` (nicht im Repo!).
Updates lassen sich nur mit demselben Schlüssel installieren.

## Veröffentlichen
APK nach `server/app/kartenwerk.apk` kopieren, Version in `server/app/version.json` und
`pubspec.yaml` erhöhen, mit „[hochladen]“ in der Commit-Nachricht auf den Zweig pushen –
die GitHub-Action lädt alles per SFTP hoch.
