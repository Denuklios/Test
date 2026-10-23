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
- Du tippst je Verfahren an, wie viele **Minuten ein Stück** braucht (5, 10, 15 … bis 60, oder einen eigenen Wert). Die App rechnet **mal Menge**, addiert alle Verfahren und zeigt die Gesamtdauer und den Anteil am Arbeitstag (z. B. 3 Shirts × 30 Min. = 1:30 Std.). Mehr als 60 Minuten pro Stück sind nicht möglich.
- Eine Person arbeitet alles nacheinander: Was ein Auftrag an einem Tag belegt, ist für andere Aufträge derselben Person weg, egal welches Verfahren (5 h Sticken + 1 h DTF + 2 h Gravur = ein voller 8-Stunden-Tag).
- Oben im Auftrag stehen die **nächsten freien Produktionstage** (der erste ist vorgewählt). Die Uhrzeit wird automatisch früh gesetzt und lässt sich über „ändern“ wählen. Dauert ein Auftrag länger als ein Arbeitstag, verteilt er sich auf die nächsten freien Tage.
- Der **Abgabetermin** liegt immer **mindestens einen Tag nach dem Produktionsende** und wird so vorbelegt. Er ist **nie am Wochenende**: Fällt er auf Samstag oder Sonntag, springt er automatisch auf Montag (und weiter, wenn dort nichts mehr frei ist). Am Abgabetag wird **eine Stunde für die Übergabe** reserviert (spätestens möglich am Tag, im Kalender als 🤝 sichtbar), denn dann bist du nicht an der Arbeit. Vergangene, gesperrte und volle Tage werden nicht angeboten.
- **Werkstatt-Anzeige:** Jede Zeile zeigt Foto (falls vorhanden), Uhrzeit von–bis, Verfahren, Gesamtdauer, Person (bei mehr als einer aktiven Person) und Status. Es werden so viele Aufträge angezeigt, wie auf den Bildschirm passen, der Rest steht als „+ n weitere“. Das Foto wird nur über den geheimen Link ausgeliefert.
- **Kalender:** Am Handy als **Liste** (jeder Auftrag mit Uhrzeit, Verfahren, Kunde, Person und kleinem Foto), am PC als **Monat** mit kompakten Balken. Oben umschaltbar. Kleine Vorschaubilder erzeugt der Server beim ersten Aufruf selbst (benötigt die PHP-Erweiterung GD, sonst wird kein Bild gezeigt).

**Fotos vom Handy:** Im Auftrag unter „Vorlagen & Fotos“ auf „📷 Foto aufnehmen“ tippen (Skizze oder Logo abfotografieren) oder „Aus Galerie/Datei“ wählen. Die Fotos werden beim Speichern mit dem Auftrag hochgeladen und vorher automatisch auf höchstens 2000 Pixel verkleinert (Logos mit transparentem Hintergrund bleiben PNG). Die mitgelieferte `.user.ini` erlaubt größere Uploads; falls one.com sie ignoriert, die Grenzen in den PHP-Einstellungen anheben.

## 5. Rechnungen (rechtssicher nach dänischem Recht)
**Vor der ersten Rechnung:** Einstellungen → **Firmendaten für Rechnungen** ausfüllen (Name, Adresse, CVR, Bank/IBAN). Solange etwas fehlt, zeigt die App eine gelbe Warnung und lässt nichts festschreiben. **Erste Rechnungsnummer** festlegen (Standard 1) – sie ist nur bis zur ersten festgeschriebenen Rechnung änderbar.

**Ablauf:**
1. **Kunde** pflegen: Land, Privat/Firma, bei EU-Firmen die USt-IdNr. (wird automatisch im EU-Register VIES geprüft), Belegsprache (sonst automatisch: DK → Dänisch, DE/AT/CH → Deutsch, sonst Englisch).
2. **Neue Rechnung** (unter „Rechnungen“, beim Kunden oder im Auftrag über „🧾 Rechnung erstellen“ – Kunde, Text, Menge und Preis werden übernommen).
3. Die **Moms-Regel** wählt die App selbst und erklärt sie: Dänemark 25 % · EU-Firma mit USt-IdNr. = Reverse Charge 0 % mit Pflichttext · EU-Privatkunde 25 % · außerhalb EU = Export 0 %. Positionen als „Ware“ oder „Leistung“ markieren (bestimmt den Pflichttext bei EU-Firmen).
4. **EUR:** Kurs per „Tageskurs holen“ (Danmarks Nationalbank, sonst EZB) oder von Hand. Die Moms wird zusätzlich in DKK auf die Rechnung gedruckt.
5. **Vorschau** prüfen, dann **Festschreiben**: Die Rechnung bekommt die nächste lückenlose Nummer, Kunden- und Firmendaten werden eingefroren, danach ist sie **nicht mehr änderbar oder löschbar** (auch nicht direkt in der Datenbank). Korrekturen nur per **Kreditnota** (ganz oder teilweise).
6. **PDF / Drucken** → „Als PDF speichern“ und an den Kunden schicken. Sprache lässt sich oben umschalten.
7. **Zahlungen** erfassen (Teilzahlungen möglich). Eine falsche Zahlung wird storniert (Gegenbuchung), nie gelöscht.

**Auftrag → Rechnung (nichts doppelt eingeben):** Im Auftrag gibt es die Karte „Rechnung & Bestätigung“:
- **Anzahlungsrechnung:** Betrag eingeben (Vorschlag 50 %), festschreiben, Zahlung erfassen → der Auftrag steht automatisch auf „Anzahlung“.
- **Schlussrechnung:** übernimmt Auftrag, Menge und Preis und zieht festgeschriebene Anzahlungen automatisch ab (gleiche Moms-Regel). Wird ein Auftrag auf **„Abgeholt/Versendet“** gesetzt, legt die App die Schlussrechnung selbst als Entwurf an.
- Ist die Schlussrechnung bezahlt, steht der Auftrag automatisch auf **„Bezahlt“** (Storno setzt ihn zurück).
- **Auftragsbestätigung:** „Bestätigung zum Unterschreiben senden“ erzeugt einen geheimen Link (30 Tage gültig) zum Teilen per WhatsApp/SMS/E-Mail. Der Kunde sieht Motiv-Fotos, Menge, Preis und Termin, unterschreibt mit dem Finger und hakt die Bestätigung an. Unterschrift, Name, Zeitpunkt und der bestätigte Stand werden unveränderbar gespeichert und im Auftrag angezeigt.
- **Preisliste:** Einstellungen → „Preisliste“; im Rechnungseditor „Aus Preisliste“.
- **Kunde:** „Daten holen (CVR/EU)“ füllt Firmenname und Adresse aus dem CVR-Register bzw. EU-Register (braucht Internet-Zugriff vom Server).

**Prüfkette:** Jede Festschreibung, Zahlung und Stornierung steht in einem Journal mit Hash-Kette. „Prüfkette kontrollieren“ (Einstellungen) zeigt, ob alles unverändert und lückenlos ist.

**Internet-Zugriff vom Server:** Tageskurs, CVR-Abruf (cvrapi.dk) und VIES-Prüfung brauchen ausgehende Verbindungen von one.com (Nationalbank, EU-Kommission). Klappt das nicht, Kurs von Hand eintragen; die USt-IdNr. kann man dann unter ec.europa.eu/taxation_customs/vies prüfen.

**Aufbewahrung:** Bogføringsloven verlangt 5 Jahre Aufbewahrung. Backup (unten) regelmäßig ziehen und außerhalb des Servers speichern. Vor der ersten echten Rechnung einmal vom Revisor/Buchhalter anschauen lassen.

## 6. Als App auf dem Handy
Seite im Handy-Browser öffnen → Menü → „Zur Startseite hinzufügen“ (Android/Chrome: „App installieren“).

## 7. Sicherung und Datenschutz
- Einstellungen → **Backup herunterladen** (gültige SQLite-Datei, z. B. wöchentlich).
- Kunden: **Daten exportieren** (Auskunft) und **Anonymisieren** (Löschung). Festgeschriebene Rechnungen behalten ihre eingefrorenen Kundendaten (gesetzliche Aufbewahrungspflicht, DSGVO Art. 17 Abs. 3). Gelöschte Aufträge liegen 30 Tage im Papierkorb; „Papierkorb leeren“ löscht Abgelaufene endgültig.
- Schriften liegen lokal, kein Tracking. Externe Abfragen nur für Tageskurs (Nationalbank/EZB) und USt-IdNr.-Prüfung (EU-VIES).

## Tests (lokal, optional)
`node auftraege/tests/api.test.mjs` und `node auftraege/tests/invoice.test.mjs` (benötigt PHP 8.x mit pdo_sqlite und Node 18+).
