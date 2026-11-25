# NFC Werkstatt – native Android-App zum Lesen & Schreiben von NFC-Tags

Native Kotlin-App (Jetpack Compose, Material 3). Kein Browser, kein WebView, keine Internetberechtigung –
alles läuft direkt über die NFC-Hardware des Handys.

**Fertige APK:** [`apk/NFC-Werkstatt-1.2.apk`](apk/NFC-Werkstatt-1.2.apk) – aufs Handy kopieren, öffnen,
„Installation aus unbekannten Quellen“ erlauben. Ab Android 8.0, Gerät mit NFC.

## Funktionen

### Lesen
- Tag einfach an die Rückseite halten – die App erkennt ihn sofort (Reader-Modus, exklusiv solange die App offen ist).
- Startet auch automatisch, wenn ein Tag bei geschlossener App gescannt wird (Auswahl im System-Dialog).
- Chip-Erkennung: NTAG210/212/213/215/216, MIFARE Ultralight / Ultralight C / EV1, MIFARE Classic Mini/1K/2K/4K,
  ISO 14443-4 (DESFire, Karten), ISO 15693 (ICODE), FeliCa, NFC Barcode.
- UID, Hersteller, ATQA/SAK, Techniken, Version, Speichergröße, Passwortschutz-Status (NTAG).
- NDEF: Format, belegt/max. Bytes, beschreibbar, sperrbar.
- Datensätze lesbar aufbereitet: Text, Link, Telefon, E-Mail, SMS, Standort, WLAN-Zugang, vCard-Kontakt,
  Smart Poster, App-Start (AAR), Bluetooth-Kopplung, MIME, externe Typen – mit „Öffnen“, „Kopieren“ und Rohdaten (Hex).
- Speicher-Dump: Ultralight/NTAG-Seiten, MIFARE-Classic-Sektoren (mit Standardschlüsseln), ISO-15693-Blöcke.
- Bericht teilen, Inhalt auf anderen Tag kopieren, Inhalt zum Bearbeiten übernehmen.

### Schreiben
- Datensatztypen: Text (mit Sprache), Link, Telefon, E-Mail (Betreff/Text), SMS, **WLAN** (WPA2/WPA/offen –
  Android verbindet sich beim Scannen direkt), **Kontakt** (vCard), Standort, **App starten**
  (mit Auswahl installierter Apps), eigener MIME-Typ, NFC-Forum External Type.
- Beliebig viele Datensätze pro Tag, Reihenfolge änderbar, Größenanzeige in Bytes.
- Nach dem Schreiben wird zurückgelesen und geprüft (✓ geprüft).
- Nicht formatierte Tags werden automatisch NDEF-formatiert.
- **Serienmodus:** viele Tags hintereinander mit demselben Inhalt beschreiben.
- Optional direkt danach dauerhaft schreibschützen (mit Sicherheitsabfrage).

### Aktionen (Smart Home)
- Handy an den Tag halten → Aktion läuft sofort, auch bei geschlossener App (Handy muss entsperrt sein).
- **Philips Hue** (lokale Bridge, Suche + Knopf-Kopplung): alle Lichter, Räume/Zonen mit Helligkeit, Szenen – an/aus/umschalten.
- **Home Assistant** (Adresse + Langzeit-Token): beliebige Dienste wie `light.turn_off` für `all` – damit IKEA, Shelly, Sonos, Rollos …
- **Webhooks** (GET/POST/PUT): Shelly, Tasmota, IFTTT direkt.
- Handy: Taschenlampe, Klingelmodus (lautlos/Vibration), Timer, Link oder App öffnen.
- Mehrere Schritte pro Aktion, Vorlagen („Gute Nacht“, „Licht an/aus“ …), „Testen“ ohne Tag.
- Der Tag speichert nur eine Kennung – Aktion später ändern, ohne den Tag neu zu beschreiben.

### Bezahlen & mehr
- PayPal.Me (mit Betrag und Währung), Revolut, MobilePay (Link aus der MobilePay-App einfügen).
- Bluetooth-Kopplung: Handy an Tag → Lautsprecher/Kopfhörer koppeln.

### Werkzeuge
- Tag kopieren (1 Quelle → beliebig viele Ziele).
- Tag löschen / formatieren.
- Dauerhafter Schreibschutz.
- **Passwortschutz für NTAG21x / Ultralight EV1** setzen und wieder entfernen (nur Schreiben oder Lesen+Schreiben).
  Genau 8 Hex-Ziffern (z. B. `1A2B3C4D`) werden 1:1 als Tag-Passwort genutzt (kompatibel mit anderen Apps),
  jeder andere Text wird per SHA-256 zu einem 4-Byte-Passwort abgeleitet.
- Einstellungen: Speicher-Dump an/aus, Vibration, Verlauf speichern.

### Verlauf
- Alle gelesenen Tags lokal gespeichert (max. 300), antippen zum erneuten Anzeigen, einzeln/alle löschen,
  Export als JSON über das Teilen-Menü.

## Selbst bauen

Voraussetzung: JDK 17+ und Android SDK (Platform 35).

```bash
cd nfc-app
echo "sdk.dir=/pfad/zum/android-sdk" > local.properties   # oder ANDROID_HOME setzen
./gradlew testDebugUnitTest      # Unit-Tests
./gradlew assembleRelease        # -> app/build/outputs/apk/release/app-release.apk
```

Oder in Android Studio den Ordner `nfc-app` öffnen und auf „Run“ drücken.
Bei jedem Push baut GitHub Actions (`.github/workflows/nfc-app.yml`) die APK automatisch und hängt sie als Artefakt an.

**Signatur:** Die APK ist mit `keystore/nfc-werkstatt.jks` signiert (Alias und Passwort `nfcwerkstatt`).
Nur mit genau diesem Schlüssel lässt sich eine neue Version als Update über die installierte App installieren
(Verlauf und Einstellungen bleiben erhalten). Die Datei liegt nicht im Repository: sicher aufbewahren und
zum Bauen eines Updates wieder nach `nfc-app/keystore/` legen. Fehlt sie, signiert der Build mit dem
Debug-Schlüssel, und so eine APK lässt sich nicht über die installierte Version installieren.

**Screenshots ohne Gerät:** `./gradlew recordPaparazziDebug` rendert alle Bildschirme (mit 130 % Schriftgröße)
nach `app/src/test/snapshots/images/`.

## Aufbau

| Datei | Inhalt |
|---|---|
| `nfc/TagReader.kt` | Tag auslesen, Chip-Erkennung, Speicher-Dump |
| `nfc/TagWriter.kt` | Schreiben, Prüfen, Löschen, Sperren, NTAG-Passwort |
| `nfc/NdefParser.kt` / `NdefFactory.kt` | NDEF-Datensätze lesen / erzeugen |
| `nfc/WifiPayload.kt`, `VCard.kt`, `Ntag.kt` | WLAN (WSC), vCard, NTAG-Konfiguration (getestet) |
| `MainViewModel.kt` | Zustand, ausstehende Aktion, Verlauf |
| `MainActivity.kt` | Reader-Modus, Intents, NFC-Status |
| `ui/*` | Oberfläche: Lesen, Schreiben, Werkzeuge, Verlauf |

## Grenzen

- iPhones: Die App ist Android-nativ. (iOS erlaubt NFC-Schreiben nur über eine Apple-Entwickler-App mit Mac/Xcode.)
- MIFARE Classic wird nur von Handys mit NXP-Chip unterstützt; geschützte Sektoren ohne Standardschlüssel bleiben unlesbar.
- Bank-, Ausweis- und andere verschlüsselte Karten: nur technische Basisdaten, keine geschützten Inhalte.
