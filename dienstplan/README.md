# Dienstplan – App für Sonderpreis Baumarkt

Native App (Flutter) für Android und iPhone. Sie nutzt das bestehende PHP-Backend (`index.php`).
Die Weboberfläche funktioniert unverändert weiter.

```
dienstplan/
├── backend/index.php      erweitertes Backend (ersetzt die alte index.php auf dem Server)
├── app/                   Flutter-Projekt (Android + iOS)
│   ├── lib/core/          Datenmodell, Datums- und Stundenlogik, API, Speicher
│   ├── lib/services/      Erinnerungen, Widget, Hintergrundabgleich
│   ├── lib/ui/            Bildschirme (Mitarbeiter, Admin, Konto)
│   ├── test/              Unit-Tests (Datum, Stunden, Plan-Änderungen)
│   ├── android/           Android-Projekt inkl. Widget (Kotlin)
│   └── ios/               iOS-Projekt inkl. Widget-Code (Swift)
├── build-apk.sh           baut die signierte Release-APK nach build-output/
└── build-output/          fertige APK
```

## 1. Backend aktualisieren

1. Sicherheitskopie der alten `index.php` und des Ordners `dienstplan-data` auf dem Server anlegen.
2. `backend/index.php` hochladen und die alte Datei ersetzen. Der Ordner `dienstplan-data` bleibt, alle Daten bleiben erhalten.
3. Die Seite muss über **HTTPS** erreichbar sein, sonst lehnt der Server die App-Anmeldung ab.
4. Falls die App nach dem Login sofort „Bitte anmelden“ meldet, verwirft dein Hoster den `Authorization`-Header.
   Die App sendet das Token deshalb zusätzlich im Header `X-Dienstplan-Token`. Hilft das nicht, in die `.htaccess` neben der `index.php` schreiben:
   ```
   CGIPassAuth On
   ```

Neu im Backend (alles abwärtskompatibel):

| Endpunkt | Zweck |
|---|---|
| `POST ?api=apilogin` `{user, pw, device, label}` | App-Login. Liefert `{token, expires, state}`. Ein Token pro Gerät, 90 Tage gültig. Auf dem Server liegt nur der SHA-256-Hash. |
| `Authorization: Bearer <token>` | Funktioniert bei allen bisherigen Endpunkten statt des Cookies. |
| `POST ?api=logout` mit Token | Macht das Token ungültig. |
| `GET ?api=hours&month=YYYY-MM` | Stundensumme pro Mitarbeiter (Admin: alle, Mitarbeiter: nur sich selbst). |
| Plan-Eintrag `{t, s?, e?, n?}` | `n` = optionale Notiz (max. 80 Zeichen), z. B. „Inventur“. Auch in der Weboberfläche eingebbar. |

Token werden ungültig, wenn ein Mitarbeiter abgemeldet, entfernt oder umbenannt wird und wenn der Admin ein neues Start-Passwort vergibt.
Ändert jemand sein Passwort selbst, werden seine anderen Geräte abgemeldet. Das aktuelle Gerät bleibt angemeldet.

## 2. APK auf dem Handy installieren

1. Die Datei `build-output/dienstplan.apk` aufs Handy laden, z. B. per Mail, Messenger, Google Drive oder USB-Kabel.
2. Die Datei antippen. Android fragt beim ersten Mal: **„Aus dieser Quelle installieren?“** → **Einstellungen** → „Dieser Quelle vertrauen“ (bzw. „Unbekannte Apps installieren“) für die App einschalten, mit der du die Datei öffnest (Chrome, Dateien, Gmail …).
3. Zurück → **Installieren**. Falls Google Play Protect warnt („Unbekannte App“): **Trotzdem installieren**.
4. App öffnen. Beim ersten Start steht oben die **Server-Adresse**, z. B. `https://deine-domain.de/dienstplan/`. Anpassen, mit Vorname und Passwort anmelden.
5. Benachrichtigungen erlauben, damit Erinnerungen ankommen.
6. Widget: Startbildschirm lange drücken → **Widgets** → **Dienstplan – Nächster Dienst** auf den Startbildschirm ziehen.

Updates: Die neue APK einfach drüber installieren. Sie muss mit demselben Keystore signiert sein (siehe 4), sonst lehnt Android das Update ab.

Tipp für zuverlässige Erinnerungen: Auf manchen Handys (Samsung, Xiaomi, Huawei) unter *Einstellungen → Apps → Dienstplan → Akku* „Nicht optimieren / Unbeschränkt“ wählen.

## 3. Was die App kann

**Mitarbeiter:** „Heute“-Karte, nächster Dienst mit Countdown, die kommenden 14 Tage (erweiterbar) · Monatskalender mit farbigen Diensten (Wischen = Monat wechseln, Tippen = Tagesdetails mit Notiz und Team) · Team-Ansicht pro Tag nach Dienst gruppiert, eigener Name hervorgehoben, plus Wochenmatrix ohne Seitwärts-Scrollen · Stundenübersicht pro Monat mit einstellbarem Pausenabzug · Erinnerungen am Vorabend und vor Dienstbeginn · Hinweis bei Planänderungen („Dein Dienst am Montag hat sich geändert“) beim Öffnen und per Hintergrundabgleich etwa alle 2 Stunden · Widget „Nächster Dienst“ · Offline lesbar mit Zeitstempel, Pull-to-Refresh · Passwort ändern, Abmelden, erzwungenes neues Passwort beim ersten Login.

**Admin** (Login `admin`): Planen in Wochen- und Tagesansicht, Dienst per Tap, abweichende Zeit und Notiz · Mehrfachauswahl (Felder, ganze Tage oder ganze Zeilen markieren und einen Dienst setzen) · „Vorwoche übernehmen“ mit Sicherheitsabfrage · Team: Namen ändern, hinzufügen, entfernen, Start-Passwort anzeigen, kopieren und neu vergeben · Dienste: Vorlagen mit Name, Farbe und Zeiten · Stundenübersicht aller Mitarbeiter (unter Konto).
Planänderungen werden sofort gesendet. Ohne Netz bleiben sie auf dem Gerät gespeichert („1 Änderung noch nicht gesendet“) und werden beim nächsten Abgleich automatisch nachgesendet. Lehnt der Server eine Änderung ab, zeigt die App den Grund an.

**Sicherheit:** nur HTTPS (Klartext-HTTP ist im Android-Manifest gesperrt) · Passwörter werden nie gespeichert · Token im Android-Keystore bzw. iOS-Schlüsselbund (`flutter_secure_storage`) · Start-Passwörter landen nicht im Offline-Cache · Android-Backup der App-Daten ist abgeschaltet.

## 4. Keystore (Signier-Schlüssel) – unbedingt sichern

- Datei: `app/android/dienstplan-release.jks`, Zugangsdaten in `app/android/key.properties`.
- Beide Dateien sind absichtlich **nicht im Git** (`.gitignore`).
- Sichern: beide Dateien an mindestens zwei Orten ablegen, z. B. USB-Stick und Passwort-Manager oder verschlüsselter Cloud-Ordner. Das Passwort steht in `key.properties`.
- **Geht der Keystore verloren, kannst du keine Updates mehr installieren.** Dann müssen alle die App deinstallieren und neu installieren.
- Neu erstellen nur, wenn noch niemand die App installiert hat:
  ```
  keytool -genkeypair -v -keystore app/android/dienstplan-release.jks -storetype PKCS12 \
    -alias dienstplan -keyalg RSA -keysize 4096 -validity 10000
  ```
  und `key.properties` anlegen:
  ```
  storeFile=dienstplan-release.jks
  storePassword=…
  keyAlias=dienstplan
  keyPassword=…
  ```

## 5. Selbst bauen

Voraussetzungen: Flutter 3.41 oder neuer (`flutter doctor`), Java 17 bis 21, Android SDK mit Platform 36 (am einfachsten über Android Studio).

```
cd dienstplan/app
flutter pub get
flutter analyze
flutter test
cd ..
./build-apk.sh https://deine-domain.de/dienstplan/
```

Der optionale Parameter ist die Server-Adresse, die beim ersten Start vorgegeben ist (`--dart-define=DEFAULT_SERVER=…`).
Die fertige APK liegt danach in `build-output/dienstplan.apk`.

## 6. iPhone

Der App-Code ist derselbe, das iOS-Projekt liegt in `app/ios`. Eine iPhone-App kann Apple-bedingt nur auf einem **Mac mit Xcode** gebaut werden.
Zum Verteilen an Mitarbeiter brauchst du außerdem ein **Apple-Developer-Konto** (99 €/Jahr) und dann **TestFlight** (am einfachsten, bis 10.000 Tester per Einladungslink) oder Ad-hoc-Verteilung. Ein Direkt-Download wie bei der APK ist beim iPhone nicht möglich.

Schritte auf dem Mac:
1. `cd dienstplan/app && flutter pub get && cd ios && pod install`
2. `open Runner.xcworkspace`. Bei *Runner → Signing & Capabilities* dein Team wählen, die Bundle-ID ggf. anpassen (z. B. `de.sonderpreis.dienstplan`).
3. Capabilities hinzufügen: **Background Modes** (Background fetch, Background processing) und **App Groups** mit `group.de.sonderpreis.dienstplan`.
4. Widget: *File → New → Target → Widget Extension*, Name `NextShiftWidget`, ohne „Live Activity“ und ohne „Configuration Intent“. Den erzeugten Swift-Code durch `ios/NextShiftWidget/NextShiftWidget.swift` ersetzen. Beim Widget-Target ebenfalls die App Group `group.de.sonderpreis.dienstplan` aktivieren. Deployment Target des Widgets: iOS 17.
5. `flutter build ipa --dart-define=DEFAULT_SERVER=https://deine-domain.de/dienstplan/`. Dann in Xcode über *Product → Archive* zu App Store Connect hochladen und per TestFlight freigeben.

Der Hintergrundabgleich läuft auf dem iPhone nur, wenn iOS es zulässt (meist bei Nutzung und WLAN). Beim Öffnen der App wird immer abgeglichen.

## 7. Optional (noch nicht umgesetzt, nach Rückfrage)

- Push-Benachrichtigungen über Firebase (FCM) statt nur lokaler Erinnerungen und Abgleich alle 2 Stunden.
- Diensttausch-Anfragen zwischen Mitarbeitern.
