# Regeln für alle Apps in diesem Repository

## Jede App bekommt von Anfang an automatische Updates – IMMER, ohne Nachfrage
Schon in der allerersten Version, nie erst auf Nachfrage nachrüsten.
Muster (wie Familienkalender `kalender-app/` und SchichtWecker `schichtwecker/`):
- Server-Ordner der App mit `version.json` ({versionCode, version, file, notes}) + APK + kleiner Download-Seite
- Upload per GitHub Action über SFTP nach `www.wunsch-fabrik.dk/kalender/<app>/` (Secrets FTP_SERVER,
  FTP_USERNAME, FTP_PASSWORD, optional FTP_DIR; Website-Ordner an `db_config.php` erkennen), ausgelöst
  durch `[hochladen]` in der Commit-Nachricht. Vorlage: `.github/workflows/schichtwecker-hochladen.yml`
- In der App: beim Öffnen (stündlich) und täglich im Hintergrund `version.json` prüfen, APK laden, per
  PackageInstaller installieren (REQUEST_INSTALL_PACKAGES, `setRequireUserAction(NOT_REQUIRED)`), beim
  ersten Mal „Installation erlauben“-Knopf. Vorlage: `schichtwecker/app/src/main/java/de/schichtwecker/Updater.kt`
- Immer mit demselben festen Schlüssel signieren und versionCode bei jeder Ausgabe erhöhen
- `release.sh` im App-Ordner baut APK + version.json; jede neue Version mit `[hochladen]` committen

## Vor Rückfragen
Erst in den anderen Chats/Sitzungen nachsehen, ob die Antwort dort schon steht.

## SchichtWecker / Apps mit Familienkalender-Zugang
- Persönliche Apps (nur für Robert) fest mit dem Familienkalender verbinden – keine Einladung, kein Setup.
- Server: https://www.wunsch-fabrik.dk/kalender/api.php, Person „Robert“. Den Gruppen-Code NIE committen:
  er steht in `schichtwecker/secret.properties` (gitignored: FK_URL, FK_CODE, FK_ME) und in den Notizen der
  Mailwerk-Sitzung. Fehlt die Datei, vor dem Bauen neu anlegen, sonst ist die App nicht verbunden.
