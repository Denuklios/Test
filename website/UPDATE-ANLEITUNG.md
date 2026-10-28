# Wunsch-Fabrik.dk – Update: Mitarbeiter & neues Auftragsprogramm

## Hochladen (one.com)
1. Vorher ein Backup der Webseite und der Datenbank ziehen.
2. Den Inhalt des ZIP-Pakets per Dateimanager/SFTP ins Hauptverzeichnis der Webseite kopieren (Dateien überschreiben).
   - Neu: `db_config.php` (enthält jetzt die Zugangsdaten), Ordner `auftraege/` (Auftrags- und Rechnungsprogramm), `wf-logo-160.png`, `wf-logo-728.png`, `wf-logo-728.webp`.
   - Versteckte Dateien (`.htaccess`) mit hochladen.
3. Auf dem Server löschen (nicht mehr nötig bzw. ein Risiko):
   - `auftrag_api.php .txt` (zeigt sonst den Quelltext öffentlich)
   - `fpdf-fonts.zip`
4. `https://www.wunsch-fabrik.dk/admin.html` öffnen und anmelden. Die Datenbank wird beim ersten Aufruf automatisch ergänzt.
5. Falls nach dem Hochladen „500 Internal Server Error“ erscheint: in `.htaccess` die drei Blöcke unter „Sicherheits-Header“ löschen.

## Mitarbeiter
- Admin → **Mitarbeiter** → „＋ Mitarbeiter anlegen“: Name, Benutzername, Farbe, Rolle und Bereiche wählen. Startpasswort wird vorgeschlagen und nach dem Speichern zum Kopieren angezeigt.
- **Inhaber** darf alles (inkl. Mitarbeiter und Einstellungen). **Mitarbeiter** sehen nur die angehakten Bereiche – das prüft auch der Server.
- **Sperren** statt löschen: Login geht nicht mehr, die Person wird auch im Auftragsprogramm abgemeldet, der Name bleibt in der Historie.
- **Aktivitäten** zeigt, wer sich wann angemeldet und was im Admin-Bereich geändert hat.
- Zuerst den eigenen Namen eintragen (Mitarbeiter → eigene Karte → Bearbeiten), sonst steht bei Aufträgen „admin“.
- Nach 8 falschen Passwörtern innerhalb von 15 Minuten wird die IP-Adresse 15 Minuten gesperrt.

## Aufträge & Rechnungen
- Der Reiter „Aufträge“ ist durch das neue Programm ersetzt (Aufträge, Kalender, Kunden, Produkte, Rechnungen, Buchhaltung). Es kann auch allein unter `/auftraege/` geöffnet und als App aufs Handy gelegt werden.
- Wer angemeldet ist, steht automatisch bei jedem Auftrag, jeder Statusänderung, Rechnung, Zahlung und jedem Beleg.
- **Anfragen → „Als Auftrag übernehmen“** füllt einen neuen Auftrag mit Kunde, Artikel, Menge und Wunschtermin vor.
- Alte Auftragsbestätigungen (vorheriges System) sind unten im Reiter weiter einsehbar, Kundenlinks funktionieren weiter.
- Einrichtung des Programms (Firmendaten, Rechnungsnummern, Mail, Archiv): siehe `auftraege/INSTALL.md`.

## Was sonst verbessert wurde
- Sicherheit: Zugangsdaten in eigener, gesperrter Datei `db_config.php`; alte Auftrags-Schnittstelle war ohne Login nutzbar (Aufträge lesen/löschen) – jetzt nur noch für angemeldete Mitarbeiter; Diagnose-Funktionen nur für den Inhaber; Kontaktformular mit Spam-Falle, Mengenbegrenzung (5 pro Stunde je IP) und Schutz gegen Mail-Header-Manipulation.
- Ladezeit: Logo auf der Startseite 718 KB → 17 KB (Menü/Fußzeile) bzw. 59 KB (groß, WebP); Jingle lädt erst beim Abspielen; Bilder laden erst beim Scrollen; Komprimierung und Browser-Cache per `.htaccess`.
- Barrierefreiheit: Zoomen auf dem Handy ist wieder erlaubt.
- Admin-Bereich neu gestaltet: Seitenleiste mit Gruppen, Begrüßung mit animierter Faden-Grafik, Besucher-Diagramm, Zähler für neue Anfragen/Bewertungen, Login mit animiertem Stich-Hintergrund, auf dem Handy mit ausklappbarem Menü.

## Datenschutz & Recht (Update Oktober 2026)
- **Keine Cookies mehr für Besucher:** Die Besucherzählung arbeitet mit einer täglich wechselnden, nicht zurückverfolgbaren Prüfsumme. PHP-Sitzungen starten nur noch für angemeldete Mitarbeiter.
- **Keine Fremdserver:** Schriften (Ordner `fonts/`) und Flaggen (`flags/`) liegen auf dem eigenen Server; das Land der Besucher kommt aus der Browser-Zeitzone statt von ip-api.com.
- **Impressum und Datenschutzerklärung** werden beim ersten Aufruf automatisch neu eingespielt (Datei `legal_texts_2026.php`, nur einmal). Danach wie gewohnt unter Admin → Rechtstexte ändern.
- **Telefonnummer nur als Bild** (`kontakt-tel.png`). In Rechtstexten `[TELEFON]` schreiben. WhatsApp läuft über `whatsapp.php`, damit die Nummer nicht im Quelltext steht.
- **Spamschutz im Kontaktformular:** unsichtbare Sicherheitsprüfung (Rechenarbeit im Browser, vom Server geprüft), verstecktes Fallen-Feld, max. 5 Anfragen pro Stunde je Anschluss, max. 2 Links pro Nachricht.
- **Löschfristen** laufen automatisch einmal am Tag: Statistik 14 Monate, Anfragen 12 Monate, IP-Adressen bei Gutscheinen 30 Tage.
