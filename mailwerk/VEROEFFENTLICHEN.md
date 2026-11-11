# Mailwerk veröffentlichen – Schritt für Schritt

Mailwerk enthält **keine persönlichen Daten** des Entwicklers. Jeder Nutzer meldet sich mit seinem eigenen Konto an.
Es gibt zwei Ausgaben:

| Ausgabe | Wofür | Bauen | Updates |
|---|---|---|---|
| **play** | Google Play Store | `./gradlew bundlePlayRelease` → `app/build/outputs/bundle/playRelease/*.aab` | über den Play Store |
| **direct** | APK zum Weitergeben (Familie, Freunde) | `./gradlew assembleDirectRelease` | App aktualisiert sich selbst über `update.json` |

> ⚠️ Die Direkt-Version ist mit dem öffentlichen Schlüssel `app/mailwerk.keystore` signiert (damit Updates im
> Familienkreis ohne Neuinstallation klappen). Für die **Öffentlichkeit nur die Play-Version** verwenden –
> sie wird mit einem geheimen Schlüssel signiert, den niemand sonst hat.

## 1. Einmalig: Einstellungen
`mailwerk.properties.example` als `mailwerk.properties` kopieren und ausfüllen (Datei bleibt lokal, kommt nicht ins Repo):
- `applicationId` – eigene, weltweit eindeutige Kennung, z. B. `de.deinname.mailwerk` (später **nicht mehr änderbar**)
- `support.email` – Kontaktadresse (Fehlerberichte, Store-Eintrag)
- `privacy.url` – Link zur Datenschutzerklärung (`DATENSCHUTZ.md` online stellen, z. B. GitHub-Link)
- `google.clientId`, `microsoft.clientId` – siehe Schritt 3 und 4 (ohne diese bleibt die Anmeldung per Passwort/App-Passwort)

## 2. Einmalig: geheimer Upload-Schlüssel
```bash
keytool -genkeypair -keystore upload-key.jks -alias upload -keyalg RSA -keysize 4096 -validity 10000
```
Dann `keystore.properties` anlegen (nicht ins Repo!):
```
storeFile=upload-key.jks
storePassword=…
keyAlias=upload
keyPassword=…
```
Schlüssel + Passwort sicher aufbewahren (Passwort-Manager). Bei Verlust kann Google den Upload-Schlüssel zurücksetzen.

## 3. „Mit Microsoft anmelden“ (Outlook, Hotmail, Live, Microsoft 365) – kostenlos
1. https://entra.microsoft.com → **App-Registrierungen** → **Neue Registrierung**
2. Name „Mailwerk“, Kontotypen: **Konten in einem beliebigen Organisationsverzeichnis und persönliche Microsoft-Konten**
3. Umleitungs-URI: Plattform **Öffentlicher Client/nativ (mobil & Desktop)** → `DEINE_APP_ID://oauth2redirect`
   (bei Standard-ID: `app.mailwerk://oauth2redirect`)
4. **API-Berechtigungen** → Berechtigung hinzufügen → *Office 365 Exchange Online* (bzw. „Von meiner Organisation verwendete APIs“ → „Office 365 Exchange Online“)
   → Delegiert: `IMAP.AccessAsUser.All`, `SMTP.Send`; dazu Microsoft Graph: `offline_access`, `openid`, `email`, `profile`
5. **Anwendungs-ID (Client-ID)** kopieren → `microsoft.clientId` in `mailwerk.properties`

## 4. „Mit Google anmelden“ (Gmail, Google Workspace)
1. https://console.cloud.google.com → neues Projekt „Mailwerk“
2. **OAuth-Zustimmungsbildschirm**: Typ *Extern*, App-Name, Support-Mail, Link zur Datenschutzerklärung;
   Bereich (Scope) `https://mail.google.com/` hinzufügen
3. **Anmeldedaten** → OAuth-Client-ID → Typ **Android**: Paketname = `applicationId`,
   SHA-1 = Fingerabdruck des **App-Signaturschlüssels** aus der Play Console (*Testen und veröffentlichen → App-Integrität*)
   und zusätzlich ein Client mit dem SHA-1 des Upload-Schlüssels / der Direkt-Version zum Testen.
   Unter *Erweiterte Einstellungen* **„Benutzerdefiniertes URI-Schema aktivieren“** einschalten.
4. Client-ID → `google.clientId` in `mailwerk.properties`

> ⚠️ **Wichtig zu Gmail:** `https://mail.google.com/` ist bei Google ein „eingeschränkter“ Bereich.
> - Im Modus **„Test“** funktioniert es sofort für bis zu **100 Testnutzer**, die du mit ihrer Gmail-Adresse einträgst –
>   allerdings muss man sich dann **alle 7 Tage neu anmelden**.
> - Für **alle** Nutzer verlangt Google eine **Prüfung der App** inkl. jährlichem Sicherheitsgutachten (CASA, kostenpflichtig).
> - Bis dahin können Gmail-Nutzer Mailwerk ganz normal mit einem **App-Passwort** verwenden (die App erklärt das beim Einrichten).
> Microsoft verlangt keine solche Prüfung.

## 5. Google Play
1. Entwicklerkonto: https://play.google.com/console (einmalig 25 US-$, Identitätsprüfung)
2. App erstellen → **Standardsprache: Englisch (USA) – en-US**, App, kostenlos
3. Store-Eintrag Englisch: Texte aus `store/listing-en.md`, Screenshots aus `screenshots/en/`.
   Unter *Store-Eintrag → Übersetzungen verwalten* **Deutsch (de-DE)** hinzufügen: Texte aus `store/eintrag-de.md`, Screenshots aus `screenshots/`.
   Symbol 512×512 und Vorstellungsgrafik 1024×500.
   Die App selbst zeigt sich automatisch in der Sprache des Handys: Deutsch auf deutschsprachigen Geräten, sonst Englisch.
4. **App-Inhalte**: Datenschutzerklärung (Link), Datensicherheit, Vordergrunddienst-Erklärung (Texte in `store/eintrag-de.md`),
   Inhaltseinstufung, Zielgruppe (ab 18 bzw. „nicht für Kinder“), keine Werbung
5. `./gradlew bundlePlayRelease` → `.aab` unter *Testen → Geschlossener Test* hochladen
6. **Neue private Entwicklerkonten** müssen zuerst einen **geschlossenen Test mit mindestens 12 Testern über 14 Tage**
   durchführen, bevor die App für alle veröffentlicht werden darf (Regel von Google).
7. Danach *Produktion* → Release erstellen → zur Prüfung senden (meist wenige Tage)

## 6. Neue Version
`versionCode` (+1) und `versionName` in `app/build.gradle.kts` erhöhen, bauen, hochladen.
Direkt-Version zusätzlich: `Mailwerk.apk` ersetzen und `update.json` anpassen.

## Apple App Store (iPhone)
Mailwerk ist eine Android-App. Für iPhones wäre eine eigene iOS-App nötig (Swift), plus Apple-Entwicklerkonto (99 $/Jahr).
