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
- **Impressum, Datenschutzerklärung und AGB** werden beim ersten Aufruf automatisch neu eingespielt (Datei `legal_texts_2026.php`, jeder Text nur einmal). Danach wie gewohnt unter Admin → Rechtstexte ändern. Die AGB gelten für Privat- und Firmenkunden, mit Widerrufsrecht für Standardware und Ausschluss für Sonderanfertigungen.
- **Telefonnummer nur als Bild** (`kontakt-tel.png`). In Rechtstexten `[TELEFON]` schreiben. WhatsApp läuft über `whatsapp.php`, damit die Nummer nicht im Quelltext steht.
- **Spamschutz im Kontaktformular:** unsichtbare Sicherheitsprüfung (Rechenarbeit im Browser, vom Server geprüft), verstecktes Fallen-Feld, max. 5 Anfragen pro Stunde je Anschluss, max. 2 Links pro Nachricht.
- **Löschfristen** laufen automatisch einmal am Tag: Statistik 14 Monate, Anfragen 12 Monate, IP-Adressen bei Gutscheinen 30 Tage.

## Spiele (Update Oktober 2026)
- Oben auf jeder Spielseite: **„← Wunsch-Fabrik.dk“** (zurück zur Startseite) und **„Alle Spiele“**.
- Alle fünf Spiele und die Spieleübersicht haben einen neuen, hellen und bunten Look: Himmel mit Wolken und Hügeln, plastische Knöpfe, Zähler mit Symbolen, Konfetti bei Gewinnen. Alle Grafiken werden im Browser gezeichnet, es gibt keine zusätzlichen Bilddateien.
- Neue Dateien im Ordner `spiele/`: `wf-game.css`, `wf-gfx.js`, `wf-i18n.js`, `faden.html`, `faden_levels.json` und der Ordner `i18n/` – mit hochladen.
- **Neues Spiel „Fadenlauf“** (`spiele/faden.html`): Knobelspiel mit 24 Fadenbildern im gleichen bunten Look, steht in der Spieleübersicht ganz vorn, mit Gutscheinen.
- **Gutscheine schwerer und sicherer:** Die Schwellen in Nadel & Faden, Auftrags-Chaos und Spuli sind deutlich höher (Übersicht in `spiele/LIESMICH.md`). Der Server gibt Gutscheine nur noch nach einer echten Spielrunde aus (Spielmarke mit Mindest-Spielzeit); bei Fadenlauf rechnet er jede Lösung nach. Die nötige Tabelle `game_plays` legt er selbst an.
- **Spiele in drei Sprachen:** Alle Spiele und die Spieleübersicht gibt es auf Deutsch, Dänisch und Englisch. Die Sprache von der Hauptseite wird übernommen, oben in der Spiele-Leiste kann man per Flagge wechseln. Gutschein-Mails kommen in der gespielten Sprache.

## Versand im Auftragsprogramm (Update November 2026)
- **Produkte → Versand: Gewicht & Maße:** Gewicht in Gramm und Maße in cm je Stück (fertig verpackt). „Faltbar“ für Textilien: zählt nur mit dem Volumen.
- **Auftrag → Paket:** Paketgewicht (Ware + Karton) und der kleinste passende Karton werden automatisch berechnet; ein anderer Karton lässt sich wählen. Passt nichts in einen Karton, wird auf mehrere Pakete verteilt. Fehlen bei einem Produkt Gewicht oder Maße, steht ein Hinweis da.
- **Einstellungen → Kartons:** eigene Kartons mit Innenmaßen, Eigengewicht und Höchstgewicht. Als Start sind fünf übliche Größen angelegt – bitte an die eigenen Kartons anpassen.
- **Einstellungen → Etikettendrucker (dieses Gerät):** Format wählen (100 × 150 mm, 4 × 6 Zoll, Brother 62 mm, DYMO 54 × 101 mm, A6) und ob das Etikett automatisch bei „Bezahlt“, „Fertig“ oder „Versendet“ gedruckt wird. Gilt je Rechner.
- Die Datenbank wird beim ersten Aufruf automatisch ergänzt.
- Mit übernommen: die Handy-App für Werkstatt und Mitarbeiter aus dem Auftrags-App-Chat (Ordner `auftraege/app/`).

## Artikelnummern & Barcode (Update November 2026)
- **Artikelnummern nach SKU-Schema:** `WF-<Kürzel>-<Nummer>`, z. B. `WF-TS-011` (T-Shirts), `WF-MU-003` (Tassen). Beim Anlegen das Feld „Artikelnr.“ leer lassen, die Nummer wird beim Speichern vergeben (Vorschau steht darunter). Das Kürzel kommt aus der Kategorie (Katalog-Kürzel, sonst aus dem Namen), ohne Kategorie `WF-AR-…`, Leistungen `WF-LS-…`. Jede Nummer gibt es nur einmal.
- **Bisherige Nummern** werden beim ersten Aufruf nach dem Update automatisch umgestellt. Falls später Nummern von Hand abweichen: Produkte → „🔢 Artikelnummern vereinheitlichen“.
- **Barcode (EAN) mit der Kamera:** im Produkt beim Feld „Barcode“ auf 📷 tippen. Auch in der Produktsuche und beim Hinzufügen von Artikeln im Auftrag gibt es 📷 – der gescannte Artikel wird gefunden bzw. gleich übernommen. Handscanner (USB/Bluetooth) gehen im selben Fenster.
- **Daten aus dem Netz (🔎):** sucht Name, Marke, Farbe, Größe, Gewicht und Maße in freien Produktdatenbanken (UPCitemdb, Open Products Facts) und füllt nur leere Felder. Bei Markenware klappt das oft, bei Großhandels-Rohlingen nicht immer. Die freie Stufe erlaubt ca. 100 Abfragen am Tag.
- Kamera braucht `https://` (auf der Webseite gegeben) und beim ersten Mal die Erlaubnis im Browser.

## Werkstatt-App 1.1: Benachrichtigungen (Update November 2026)
- Die Handy-App meldet sich bei **neuen Anfragen von der Webseite**, **unterschriebenen Angeboten** und **Zahlungseingängen** – auch wenn sie geschlossen ist. Antippen öffnet die Anfrage (mit Anrufen/WhatsApp/E-Mail) bzw. den Auftrag.
- Einstellen in der App unter **Mehr → Benachrichtigungen**: welche Meldungen, und wie schnell: **Normal** (etwa alle 15 Minuten, spart Akku) oder **Sofort** (jede Minute, mit kleiner Dauer-Anzeige in der Leiste).
- Läuft über den eigenen Server, ohne Google-Konto oder Fremddienst.
- **Einmalig neu installieren:** Die alte App deinstallieren, dann `https://www.wunsch-fabrik.dk/auftraege/app/wunsch-fabrik-werkstatt.apk` auf dem Handy öffnen und installieren, im Büro unter Einstellungen → Handy-App einen neuen Code erzeugen und verbinden. Beim ersten Start „Benachrichtigungen erlauben“ bestätigen.
- Bei manchen Handys (Samsung, Xiaomi, Huawei) unter Einstellungen → Apps → WF Werkstatt → Akku auf „Nicht eingeschränkt“ stellen, sonst kommen Meldungen verspätet.

## Postfach im Auftragsprogramm (Update November 2026)
- Neuer Menüpunkt **Mail**: Posteingang, Gesendet, Archiv, Suche. Ungelesene Mails stehen als rote Zahl am Menüpunkt.
- **Einrichten (einmal):** Einstellungen → „Postfach (Mails im Programm)“: Server `imap.one.com`, Port 993, Benutzer = deine Mailadresse (z. B. hej@wunsch-fabrik.dk), Passwort des Postfachs (oder „Gleiches Passwort wie beim Versand“, wenn der Versandweg send.one.com eingerichtet ist). „Speichern & testen“.
- **Lesen:** Bilder in der Mail und Anhänge (PDF, Fotos …) werden angezeigt. Bilder aus dem Netz werden zum Schutz vor Lesebestätigungen erst auf Knopfdruck geladen. Alles, was zusammengehört, steht als Verlauf darunter.
- **Schreiben, Antworten, Allen antworten, Weiterleiten:** mit Fett/Kursiv/Listen/Farbe/Link, Bilder einfügen (auch per Strg+V oder Bildschirmfoto), Dateien anhängen, Dateien aus dem Auftrag anhängen. Entwürfe werden auf dem Gerät gemerkt.
- **Signatur** je Person: Einstellungen → Postfach → „Signatur von …“ (auch mit Logo). Wird automatisch unter jede Mail gesetzt.
- **Übersetzen:** beim Schreiben „🇩🇰 Dansk“, „🇬🇧 English“ oder „🇩🇪 Deutsch“ – der Text wird übersetzt, „Rückgängig“ holt das Original zurück. Empfangene Mails mit „Auf Deutsch übersetzen“. Nutzt den DeepL-Schlüssel der Webseite (db_config.php) – oder einen eigenen in den Einstellungen.
- **Kunden & Aufträge:** Mails werden über die Adresse dem Kunden zugeordnet, über eine Auftragsnummer im Betreff (z. B. 2026-0012) dem Auftrag. Beim Kunden und beim Auftrag gibt es die Karte „Mails“ mit „Mail schreiben“.
- Gesendete Mails landen zusätzlich im Ordner „Gesendet“ am Server – so siehst du sie auch am Handy oder im Webmail. Die Mails bleiben im Postfach, es wird nichts gelöscht.
- Abgerufen wird beim Öffnen und alle 2 Minuten, solange das Programm offen ist – und mit dem Zeitplan (cron.php) auch ohne geöffnetes Programm.
- **Anfragen von der Webseite im Postfach:** Reiter „📝 Anfragen“ unter Mail (Offen / Neu / In Bearbeitung / Erledigt / Archiviert, Suche). Je Anfrage: per Mail antworten (Betreff in der Sprache des Kunden, Anfrage als Zitat, Übersetzen-Knöpfe), „Als Auftrag übernehmen“, als Kunde anlegen, anrufen, WhatsApp, Status setzen – mit derselben automatischen Kundenmail wie im Admin-Bereich (abschaltbar). Nach einer Antwort steht die Anfrage auf „In Bearbeitung“. Die rote Zahl an „Mail“ zählt ungelesene Mails und neue Anfragen zusammen.
- Neue Datei `customer_mail.php` im Hauptverzeichnis (die Kundenmails zu Anfragen, von Admin und Auftragsprogramm gemeinsam genutzt) – mit hochladen.

## Produkt-Konfigurator (Update November 2026)
- **Kontaktformular:** Oben wählt der Kunde „Normale Anfrage“ oder „Mit Vorschau-Tool“. Im Tool: Produkt (8 Kleidungsstücke und die Tasse, nur weiß), Farbe aus festen Farbfeldern, Logo (PNG/JPG/SVG, weißer Hintergrund wird entfernt), Position (Brust links/rechts, Rücken, Ärmel, beim Polo Kragen, bei der Kappe vorne/Seiten/hinten), Größe per Regler in cm und Veredelung (Stick, DTF, Plott, Siebdruck). Vorschaubild, Logo und Auswahl gehen mit der Anfrage mit (Mail-Anhang und Datenbank).
- **Neue Ordner:** `konfigurator/` (Tool und Produktfotos) und `anfrage-vorschau/` (Vorschaubilder und Logos der Anfragen, von außen gesperrt). Beide mit hochladen. Die Dateien werden wie die Anfragen nach 12 Monaten gelöscht.
- **Auftragsprogramm:** Unter **Produkte → 🎨 Konfigurator** schnell planen, mit eigener Farbe, Logo per Maus/Finger verschieben und Bild herunterladen. Bei einer Anfrage aus dem Tool erscheinen Vorschaubild, Auswahl und die Knöpfe „Im Konfigurator öffnen“, „Vorschau herunterladen“ und „Logo herunterladen“. „Neuer Auftrag damit“ übernimmt die Auswahl als Notiz in einen neuen Auftrag.
- **Noch Standardwerte:** Farben je Produkt und Höchstgrößen je Position. Sie stehen oben in `konfigurator/konfig.js` und werden ersetzt, sobald die echten Werte da sind.
- **Produktfotos:** liegen als weiße Fotos mit Freistell-Maske in `konfigurator/img/` (`<name>.jpg`, `<name>-m.png`, Auswahlbild `<name>-t.jpg`). Neue Fotos auf hellgrauem oder weißem Grund lassen sich mit `tools/konfigurator/freistellen.py` und `vorschaubild.py` vorbereiten.
