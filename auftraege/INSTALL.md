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
- **Personen & Farben:** Du bist immer aktiv. Drei Mitarbeiterplätze werden aktiv, sobald du einen Namen einträgst (Namen leeren = wieder aus, solange die Person keine offenen Aufträge hat). Jede Person hat Farbe und Tagesstunden (Standard 8 h).
- **Wochenende:** Samstag und Sonntag zählen je Person mit der Stundenzahl darunter (Standard 5 h, 0 = Wochenende zu).
- **Arbeitsbeginn:** Das Tagesfenster eines Verfahrens beginnt dann (Standard 08:00) und dauert so lange wie seine Kapazität (8 h = 08:00–16:00). Darin werden Uhrzeiten vergeben. Teilsperren zählen nur innerhalb dieses Fensters.
- **Gesperrte Tage:** Urlaub, Messe, Arzttermin usw. eintragen. Ohne Uhrzeit ist der ganze Tag gesperrt: Er fällt aus Kalender, Terminvorschlag und Tageswahl heraus und kann nicht als Termin gespeichert werden. Mit Uhrzeit (z. B. 13:00–17:00) wird nur dieser Zeitraum von der Tageskapazität abgezogen, der Rest bleibt buchbar.
- **Werkstatt-Anzeige:** „Neuen Link erzeugen“, den Link kopieren und im Werkstatt-PC-Browser öffnen. Doppelklick oder Symbol unten rechts = Vollbild. Der Link wird nur einmal angezeigt; zum Widerrufen „Sperren“ klicken und einen neuen erzeugen.

**Update einer bestehenden Installation:** neue Dateien einfach drüberkopieren. Die Datenbank wird beim nächsten Aufruf automatisch ergänzt, alle Daten bleiben erhalten (vorher trotzdem Backup ziehen).

**So plant die App:**
- Du gibst je Verfahren die ungefähre Dauer in **Stunden** ein. Die App rechnet die Gesamtdauer und den Anteil am Arbeitstag aus.
- Eine Person arbeitet alles nacheinander: Was ein Auftrag an einem Tag belegt, ist für andere Aufträge derselben Person weg, egal welches Verfahren (5 h Sticken + 1 h DTF + 2 h Gravur = ein voller 8-Stunden-Tag).
- Oben im Auftrag stehen die **nächsten freien Produktionstage** (der erste ist vorgewählt). Die Uhrzeit wird automatisch früh gesetzt und lässt sich über „ändern“ wählen. Dauert ein Auftrag länger als ein Arbeitstag, verteilt er sich auf die nächsten freien Tage.
- Der **Abgabetermin** liegt immer **mindestens einen Tag nach dem Produktionsende** (gesperrte Tage werden übersprungen) und wird so vorbelegt. Vergangene, gesperrte und volle Tage werden nicht angeboten.
- **Werkstatt-Anzeige:** Jede Zeile zeigt Foto (falls vorhanden), Uhrzeit von–bis, Verfahren, Gesamtdauer, Person (bei mehr als einer aktiven Person) und Status. Es werden so viele Aufträge angezeigt, wie auf den Bildschirm passen, der Rest steht als „+ n weitere“. Das Foto wird nur über den geheimen Link ausgeliefert.
- **Kalender:** Am Handy als **Liste** (jeder Auftrag mit Uhrzeit, Verfahren, Kunde, Person und kleinem Foto), am PC als **Monat** mit kompakten Balken. Oben umschaltbar. Kleine Vorschaubilder erzeugt der Server beim ersten Aufruf selbst (benötigt die PHP-Erweiterung GD, sonst wird kein Bild gezeigt).

**Fotos vom Handy:** Im Auftrag unter „Vorlagen & Fotos“ auf „📷 Foto aufnehmen“ tippen (Skizze oder Logo abfotografieren) oder „Aus Galerie/Datei“ wählen. Die Fotos werden beim Speichern mit dem Auftrag hochgeladen und vorher automatisch auf höchstens 2000 Pixel verkleinert (Logos mit transparentem Hintergrund bleiben PNG). Die mitgelieferte `.user.ini` erlaubt größere Uploads; falls one.com sie ignoriert, die Grenzen in den PHP-Einstellungen anheben.

## 5. Als App auf dem Handy
Seite im Handy-Browser öffnen → Menü → „Zur Startseite hinzufügen“ (Android/Chrome: „App installieren“).

## 6. Sicherung und Datenschutz
- Einstellungen → **Backup herunterladen** (gültige SQLite-Datei, z. B. wöchentlich).
- Kunden: **Daten exportieren** (Auskunft) und **Anonymisieren** (Löschung). Gelöschte Aufträge liegen 30 Tage im Papierkorb; „Papierkorb leeren“ löscht Abgelaufene endgültig.
- Schriften liegen lokal, es gibt keine externen Dienste und kein Tracking.

## Tests (lokal, optional)
`node auftraege/tests/api.test.mjs` (benötigt PHP 8.x mit pdo_sqlite und Node 18+).
