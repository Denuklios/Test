# Mailwerk – E-Mail-App für Android

Eine eigene Mail-App (wie Outlook), die die besten Ideen aus den bekannten Mail-Apps zusammenführt.
Sie läuft **komplett auf dem Gerät**: keine Cloud, kein Konto beim App-Hersteller, keine Werbung.

**Download:** [`Mailwerk.apk`](Mailwerk.apk) (Android 8.0 oder neuer)

| Posteingang | Unterhaltung | Antworten | Einstellungen |
|---|---|---|---|
| ![](screenshots/1_posteingang_wichtig.png) | ![](screenshots/4_unterhaltung.png) | ![](screenshots/5_antworten.png) | ![](screenshots/7_einstellungen.png) |

## Was aus welcher App übernommen wurde

| Funktion | Vorbild | In Mailwerk |
|---|---|---|
| Smart Inbox: Wichtig / Newsletter / Benachrichtigungen | Spark, Gmail-Tabs, Outlook „Relevant“ | ✅ Automatisch, lokal; pro Absender umstellbar |
| Gemeinsamer Posteingang für alle Konten | Spark, BlueMail, FairEmail | ✅ |
| Zurückstellen („Snooze“) | Gmail, Spark, Outlook | ✅ mit Schnellwahl und Wunschtermin |
| Später senden | Gmail, Outlook, Spark | ✅ |
| Senden rückgängig | Gmail | ✅ 5–30 Sekunden, einstellbar |
| Erinnern, falls keine Antwort | Superhuman, Spark, Gmail „Nudges“ | ✅ beim Senden oder nachträglich |
| Anheften (Pins) | Spark | ✅ angeheftete Mails stehen oben |
| Wischgesten frei belegbar | Outlook, Gmail, Spark | ✅ Archiv, Löschen, Später, Gelesen, Anheften |
| Tracking-Pixel blockieren | HEY, FairEmail, Apple Mail | ✅ immer aktiv, mit Anzeige „x Tracker blockiert“ |
| Externe Bilder erst auf Wunsch laden | FairEmail, Thunderbird | ✅ |
| Newsletter mit einem Tipp abbestellen | Gmail, Spark | ✅ inkl. RFC 8058 One-Click |
| Absender blockieren / einsortieren | HEY Screener | ✅ |
| Benachrichtigung nur bei wichtigen Mails | Spark „Smart Notifications“ | ✅ |
| Unterhaltungsansicht | Gmail, Outlook | ✅ inkl. eigener Antworten aus „Gesendet“ |
| Vorlagen / Schnellantworten | Spark, Outlook | ✅ |
| Kontaktvorschläge beim Schreiben | alle | ✅ nach Häufigkeit sortiert |
| Automatische Servererkennung | Thunderbird | ✅ Anbieter-Liste + Mozilla-ISPDB + autoconfig |
| Material You, Dunkelmodus | Gmail | ✅ |
| Als Standard-Mail-App, Teilen aus anderen Apps | – | ✅ `mailto:`-Links und „Teilen“ mit Anhängen |
| Passwörter im Hardware-Schlüsselspeicher | FairEmail | ✅ Android-Keystore (AES-GCM) |
| JavaScript in Mails | – | ❌ grundsätzlich aus (Sicherheit) |

## Installation

1. `Mailwerk.apk` auf dem Handy herunterladen.
2. Öffnen → Android fragt einmalig, ob Installationen aus dieser Quelle erlaubt sind → erlauben.
3. App starten, Name, E-Mail-Adresse und Passwort eingeben → fertig.

### Hinweise zu Anbietern
- **GMX / WEB.DE:** Im Web-Postfach unter *Einstellungen → POP3/IMAP Abruf* IMAP einschalten.
- **Gmail, iCloud, Yahoo, AOL:** Ein **App-Passwort** erstellen und statt des normalen Passworts verwenden.
- **Telekom (t-online.de):** Im E-Mail-Center ein eigenes E-Mail-Passwort für Mail-Programme anlegen.
- **Outlook.com / Hotmail:** Microsoft erlaubt bei privaten Konten oft nur noch die OAuth-Anmeldung. Dafür muss die App bei Microsoft registriert werden – das ist noch nicht eingebaut (siehe unten).
- Firmen-/eigene Domains funktionieren, sofern IMAP/SMTP angeboten wird.

## Technik

- Kotlin, Jetpack Compose (Material 3), minSdk 26, targetSdk 35
- IMAP/SMTP über Jakarta Mail (Eclipse Angus), HTML-Bereinigung mit jsoup
- Lokale SQLite-Datenbank (offline lesbar), Hintergrundabgleich und zeitversetztes Senden über WorkManager

```
app/src/main/java/app/mailwerk/
  data/   Datenbank, Modelle, Repository (Abgleich, Aktionen, Versand), Verschlüsselung, Einstellungen
  mail/   IMAP/SMTP-Client, Einsortierung, Tracker-Blocker, Server-Erkennung
  sync/   Hintergrund-Worker, Benachrichtigungen
  ui/     Oberfläche (Posteingang, Unterhaltung, Verfassen, Konto, Einstellungen)
```

### Bauen
```bash
./gradlew assembleRelease      # -> app/build/outputs/apk/release/app-release.apk
./gradlew testDebugUnitTest    # Tests
```
Signiert wird mit `app/mailwerk.keystore` (liegt bewusst im Repo, damit neue Versionen sich als Update über die alte
installieren lassen). Für eine Veröffentlichung im Play Store einen eigenen, geheimen Schlüssel verwenden.

### Tests
- `LogicTest` – Einsortierung, Unterhaltungs-Erkennung, Abmelde-Header, Tracker-Entfernung, Server-Erkennung
- `MailClientTest` – echter Durchlauf gegen einen lokalen IMAP/SMTP-Server (GreenMail): Anmelden, Ordner,
  Abgleich, Anhang laden, Gelesen-Status, Verschieben, Senden mit Anhang und Ablage in „Gesendet“
- `ScreenshotTest` – rendert die Oberfläche (Robolectric) und erzeugt die Bilder oben

## Noch nicht enthalten (mögliche nächste Schritte)
- OAuth-Anmeldung für Gmail/Microsoft (braucht registrierte Client-IDs bei Google/Microsoft)
- Push über IMAP IDLE (derzeit Abruf alle 15 Minuten + beim Öffnen + Ziehen zum Aktualisieren)
- Kalender, Exchange/ActiveSync, PGP/S-MIME-Verschlüsselung, Rich-Text-Editor, App-Sperre per Fingerabdruck
