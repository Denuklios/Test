# Wunsch-Fabrik Aufträge – Installation auf one.com

Die App braucht **keine MariaDB**. Sie speichert alles in einer SQLite-Datei (`data/auftraege.sqlite`).

## 1. Hochladen
1. Den kompletten Ordner `auftraege/` per SFTP/FTP oder im one.com-Dateimanager in das Hauptverzeichnis deiner Website hochladen (neben `db.php`). Bestehende Dateien werden nicht angefasst.
2. Ordner `auftraege/data/` muss für PHP beschreibbar sein (Rechte 755/775; bei one.com meist schon der Fall).
3. Die Dateien `inc/.htaccess` und `data/.htaccess` mithochladen (versteckte Dateien aktivieren). Sie sperren den Zugriff von außen.

## 2. Besser: Daten außerhalb des Webroots (empfohlen)
Lege einen Ordner **über** dem öffentlichen Verzeichnis an und trage ihn in `inc/config.local.php` ein:
```php
<?php return ['data_dir' => '/pfad/zu/wf_daten'];
```
(Die Datei `config.local.php` selbst anlegen; sie überschreibt `config.php` und ist per `.htaccess` gesperrt.)

## 3. Login
Die App prüft nur `$_SESSION['wf_admin_id']` (vorhandenes Admin-Login der Hauptseite). Wer dort angemeldet ist, kommt in die App; sonst erscheint ein Hinweis.
Falls dein Login einen anderen Session-Namen nutzt, in `config.local.php` eintragen: `'session_name' => 'DEIN_NAME'`.
Wichtig: Das Cookie der Hauptseite muss auch im Unterordner `/auftraege/` gelten (Standard: ja).

## 4. Erster Start
`https://wunsch-fabrik.dk/auftraege/` im Browser öffnen (als Admin angemeldet). Die Datenbank wird beim ersten Aufruf automatisch angelegt, mit den 7 Veredelungsarten und 5 Benutzerplätzen.
Unter **Einstellungen**:
- **Benutzer:** Namen der 5 Personen eintragen und deren Admin-ID aus dem Login der Hauptseite (damit der Verlauf den Namen zeigt).
- **Kapazität:** Minuten pro Werktag je Maschine/Verfahren. Samstag und Sonntag zählen mit der Stundenzahl darunter (Standard 5 h, 0 = Wochenende zu).
- **Arbeitsbeginn:** Das Tagesfenster eines Verfahrens beginnt dann (Standard 08:00) und dauert so lange wie seine Kapazität (8 h = 08:00–16:00). Darin werden Uhrzeiten vergeben. Teilsperren zählen nur innerhalb dieses Fensters.
- **Gesperrte Tage:** Urlaub, Messe, Arzttermin usw. eintragen. Ohne Uhrzeit ist der ganze Tag gesperrt: Er fällt aus Kalender, Terminvorschlag und Tageswahl heraus und kann nicht als Termin gespeichert werden. Mit Uhrzeit (z. B. 13:00–17:00) wird nur dieser Zeitraum von der Tageskapazität abgezogen, der Rest bleibt buchbar.
- **Werkstatt-Anzeige:** „Neuen Link erzeugen“, den Link kopieren und im Werkstatt-PC-Browser öffnen. Doppelklick oder Symbol unten rechts = Vollbild. Der Link wird nur einmal angezeigt; zum Widerrufen „Sperren“ klicken und einen neuen erzeugen.

**Update einer bestehenden Installation:** neue Dateien einfach drüberkopieren. Die Datenbank wird beim nächsten Aufruf automatisch ergänzt, alle Daten bleiben erhalten (vorher trotzdem Backup ziehen).

**Uhrzeiten:** Im Auftrag unter jedem gewählten Verfahren auf „🕘 Uhrzeit wählen“ tippen (zuerst Produktionstag oder Abgabetermin wählen). Angeboten werden nur freie Zeitfenster. Ohne Uhrzeit zählt der Auftrag nur mit seinen Minuten für den Tag.

## 5. Als App auf dem Handy
Seite im Handy-Browser öffnen → Menü → „Zur Startseite hinzufügen“ (Android/Chrome: „App installieren“).

## 6. Sicherung und Datenschutz
- Einstellungen → **Backup herunterladen** (gültige SQLite-Datei, z. B. wöchentlich).
- Kunden: **Daten exportieren** (Auskunft) und **Anonymisieren** (Löschung). Gelöschte Aufträge liegen 30 Tage im Papierkorb; „Papierkorb leeren“ löscht Abgelaufene endgültig.
- Schriften liegen lokal, es gibt keine externen Dienste und kein Tracking.

## Tests (lokal, optional)
`node auftraege/tests/api.test.mjs` (benötigt PHP 8.x mit pdo_sqlite und Node 18+).
