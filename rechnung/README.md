# RechnungsStudio – Rechnungsprogramm für dänische Firmen

Ein Rechnungsprogramm wie Billy: Die Oberfläche ist auf **Deutsch**. Jede Rechnung wird automatisch in der **Sprache des Kunden** ausgegeben (Deutsch, Dänisch oder Englisch). Moms und die Felder für SKAT werden automatisch berechnet.

## Starten

1. Einmalig [Node.js](https://nodejs.org) installieren (LTS-Version).
2. Doppelklick auf **`start-rechnung.bat`** (Windows) oder **`start-rechnung.command`** (Mac/Linux).
3. Der Browser öffnet sich mit `http://localhost:8090`.

Beim ersten Start wird einmalig das Paket für die Belegerkennung installiert (`npm install`, braucht Internet).

Oder im Terminal: `cd rechnung && npm install && npm start`

Deine Daten liegen in `rechnung/data/rechnung.json`. Jeden Tag wird automatisch eine Sicherung in `rechnung/data/sicherung/` angelegt (die letzten 60 Tage).

## Was das Programm kann

| Bereich | Funktion |
|---|---|
| **Kunden** | Land, Sprache (DE/DA/EN), Währung, CVR-Nr. bzw. USt-IdNr. Dänische Firmen: Daten per Klick aus dem **CVR-Register** holen. EU-Firmen: USt-IdNr. per Klick bei der EU (**VIES**) prüfen. |
| **Momsart automatisch** | Dänemark → 25 % Moms · EU-Firma mit USt-IdNr. → 0 %, Reverse Charge · EU-Privatkunde → 25 % · außerhalb der EU → 0 % (Export) |
| **Produkte ⬇** | Produkte aus einem Shop übernehmen („Aus Shop übernehmen“): Adressen von Produktseiten, eine Kategorie-/Sitemap-Adresse, im Browser gespeicherte Seiten (bei Bot-Schutz/Anmeldung: Strg + S, auch damit die Preise sichtbar sind) oder eine CSV-Preisliste. Übernommen werden sauberer Produktname (ohne Händlername und Artikelnummer), Artikelnummer, Marke, Bild, Material, Gewicht (g/m²), Größen, Farben, ein kurzer Kundentext in Deutsch/Dänisch/Englisch und – falls auf der Seite sichtbar – der Einkaufspreis. Der Verkaufspreis kann direkt als Aufschlag in % gesetzt werden. Das Lesen der Seite braucht den API-Schlüssel (ca. 0,1 Cent pro Produkt). Der Händlername wird nicht in Produktnamen und Texte übernommen. |
| **Produkte** | Name und Kundentext in drei Sprachen, Farben, Größen, Material, Gewicht, Einkaufs- und Verkaufspreis. In Auftrag und Rechnung erscheinen Name, Kundentext und die gewählte Farbe/Größe automatisch in der Kundensprache. |
| **Aufträge ✍️** | Auftragsbestätigung mit Produktbildern in der Kundensprache, Kunde unterschreibt online per Link, Unterschrift kommt automatisch zurück, danach mit einem Klick die Rechnung. |
| **Rechnungen** | Entwurf → genehmigen (fortlaufende Nummer, danach gesperrt) → bezahlt. Gutschriften (Kreditnota), Kopieren, Zahlungserinnerung, Rabatt, momsfreie Zeilen, Fremdwährung mit Kurs von Nationalbanken/EZB. Drucken bzw. **als PDF speichern**, E-Mail-Text in der Kundensprache. |
| **Pflichtangaben** | Alle Angaben nach dänischem Recht: CVR-Nr., fortlaufende Nummer, Datum, Moms je Satz, bei Fremdwährung die Moms in DKK, Reverse-Charge-Hinweis mit USt-IdNr. des Kunden, Bankverbindung (Reg./Konto, IBAN/BIC), optional FI-Zahlungslinie (+71). |
| **Belege 📷** | Beleg mit dem Handy fotografieren (oder Foto/PDF hochladen). Die Erkennung liest Ausgabe oder Einnahme, Lieferant, Datum, Betrag, Moms, bezahlt oder offen, Fälligkeit, EU-Einkauf und Fremdwährung (mit Kurs in DKK umgerechnet). Eindeutige Belege werden sofort gebucht, unklare kommen zur Prüfung. Der Beleg wird automatisch mit der passenden Lunar-Abbuchung verknüpft. Gibt es die Ausgabe schon (z. B. aus dem Kontoauszug), wird der Beleg angehängt statt doppelt gebucht. |
| **Abzüge 💡** | Übersicht, was die Firma absetzen kann: jede Ausgabe bekommt automatisch den richtigen Moms- und Steueranteil (z. B. Bewirtung 25 %, Pkw 0 % Moms), Summen je Kategorie, geschätzte Steuerersparnis, Fahrtenbuch mit Kilometergeld (2026: 3,94 kr./km bis 20.000 km, dann 2,28 kr.) und eine Checkliste aller Abzugsmöglichkeiten mit Quellen. |
| **Ausgaben** | Belege mit Købsmoms. EU-Einkäufe ohne Moms werden richtig in Rubrik A mit Erwerbsmoms berechnet. |
| **Bank (Lunar)** | Kontoauszug aus Lunar als CSV importieren. Zahlungseingänge werden automatisch passenden Rechnungen vorgeschlagen (Betrag, Rechnungsnummer im Text). Abbuchungen mit einem Klick als Ausgabe buchen. |
| **Moms / SKAT** | Fertige **Momsangivelse** genau mit den Feldern aus TastSelv Erhverv (Salgsmoms, Købsmoms, Rubrik A, B, C, Momstilsvar), Frist je Periode (Halbjahr/Quartal/Monat), Liste für **EU-salg uden moms**, CSV für den Steuerberater. |
| **Übersicht** | Offene und überfällige Rechnungen, Umsatz je Monat, Moms der laufenden Periode, Erinnerung an die nächste Frist. |

## Aufträge mit Unterschrift des Kunden

1. **Produkte mit Bild:** Unter „Produkte“ kannst du jedem Produkt ein Foto geben. Das erscheint automatisch auf der Auftragsbestätigung. In jeder Auftragszeile kannst du auch ein eigenes Bild wählen (z. B. das Logo-Muster des Kunden).
2. **Auftrag anlegen:** Unter „Aufträge“ oder in der Kundenliste auf „+ Auftrag“. Dazu kannst du Liefertermin und „gültig bis“ eintragen. Die Auftragsbestätigung erscheint in der Sprache des Kunden (Ordrebekræftelse / Auftragsbestätigung / Order confirmation).
3. **Freigeben:** „Zum Unterschreiben freigeben“ erzeugt einen geheimen Link. Mit „Link per E-Mail senden“ öffnet sich eine fertige E-Mail in der Kundensprache.
4. **Der Kunde** öffnet den Link (Handy oder PC, ohne Passwort), prüft alles, gibt seinen Namen ein, unterschreibt mit Finger oder Maus und bestätigt. Er kann die unterschriebene Bestätigung als PDF speichern.
5. **Automatisch zurück:** Der Status springt auf „Unterschrieben ✔“, auf der Übersicht steht ein Hinweis. Gespeichert werden Unterschrift, Name, Zeitpunkt, IP-Adresse und eine Prüfsumme des Dokuments als Nachweis.
6. **Rechnung erstellen:** Ein Klick macht aus dem Auftrag einen Rechnungsentwurf (ohne Bilder, mit Auftragsnummer).

**Wichtig:** Damit Kunden den Link öffnen können, muss RechnungsStudio **im Internet erreichbar** sein (eigener Server mit HTTPS, Passwort mit `PASSWORD=` setzen). Dann unter Einstellungen die „Öffentliche Adresse“ eintragen. Die Unterschriftsseite braucht kein Passwort, alles andere bleibt geschützt. Läuft das Programm nur auf deinem Computer, kannst du die Auftragsbestätigung als PDF drucken und unterschreiben lassen.

## Belege mit dem Handy fotografieren

1. **Erkennung einschalten:** Unter Einstellungen → Belegerkennung einen API-Schlüssel von [platform.claude.com](https://platform.claude.com) eintragen (Konto anlegen, Guthaben aufladen, „API Keys“ → „Create Key“). Je nach eingestellter Genauigkeit kostet ein Beleg ca. 0,1 bis 6 Cent (Standard „Automatisch“: meist ca. 0,1 Cent, nur unklare Belege werden genau gelesen). Ohne Schlüssel werden die Fotos trotzdem gespeichert, und du tippst die Werte selbst ein.
2. **Handy verbinden:** Das Startskript fragt „Handy-Zugang einschalten?“ → `j` und ein Passwort vergeben. Unter Einstellungen erscheint ein QR-Code. Mit dem Handy (im selben WLAN) scannen, Passwort eingeben (Benutzername egal), dann im Browser „Zum Startbildschirm hinzufügen“. Jetzt hast du die Belege-Kamera wie eine App.
3. **Fotografieren:** „📷 Beleg fotografieren“ → Foto → fertig. Der Rest passiert im Programm.

Die Fotos liegen in `rechnung/data/belege/`. Bitte den ganzen Ordner `rechnung/data` regelmäßig sichern (5 Jahre Aufbewahrungspflicht).

Unterwegs ohne WLAN geht das nur, wenn das Programm auf einem Server im Internet läuft (siehe unten, mit HTTPS und Passwort).

## Anbindung an SKAT

Das Programm berechnet alle Werte der Momsangivelse. Du überträgst sie in **TastSelv Erhverv** ([skat.dk/indberetmoms](https://skat.dk/indberetmoms), Login mit MitID bzw. MitID Erhverv → Moms → Momsindberetning → Indberet moms) mit den Kopieren-Knöpfen.

Eine **direkte Übertragung** per Schnittstelle (Skattestyrelsens „API-løsning til momsindberetning“ / NemVirksomhed) ist nur für Software-Anbieter möglich, die bei Skattestyrelsen registriert sind. Billy, Dinero, e-conomic usw. sind solche Anbieter. Für ein eigenes Programm müsstest du dich dort als Anbieter registrieren.

## Anbindung an Lunar

Lunar hat eine Open-Banking-Schnittstelle (PSD2). Die dürfen aber nur **von der Finanzaufsicht zugelassene Kontoinformationsdienste** (AISP) direkt nutzen, nicht jedes Programm. Deshalb läuft es hier über den **CSV-Export** aus Lunar: exportieren, hochladen, fertig. Der Abgleich danach läuft automatisch.

Eine automatische Verbindung ohne CSV ginge über einen zugelassenen Vermittler (z. B. Aiia/Mastercard Open Banking, Tink, Enable Banking). Das kostet in der Regel Geld und braucht einen Vertrag mit dem Anbieter. Der Import ist so gebaut, dass so ein Zugang später ergänzt werden kann.

## Wichtig – Bogføringsloven

Seit 2025/2026 müssen Firmen in Dänemark ab einer bestimmten Umsatzgrenze ein **digitales Buchführungssystem** nutzen. Ein selbst gebautes System ist erlaubt, muss aber die Anforderungen der Bekendtgørelse erfüllen: Belege speichern, Sicherung bei einem Anbieter in der EU, 5 Jahre Aufbewahrung und Abgleich mit der Bank. RechnungsStudio ist ein **Rechnungs- und Moms-Programm**, aber keine komplette doppelte Buchführung (kein Hauptbuch, keine Bilanz, kein SAF-T-Export). Bitte mit deinem Steuerberater (revisor) abklären, ob das für deine Firma reicht oder ob es zusätzlich zu einem registrierten System wie Billy genutzt werden soll.

## Auf dem eigenen Server

Schritt für Schritt in **docs/Server-Anleitung.pdf** (im Komplettpaket). Kurz: Im entpackten Komplettpaket auf dem Server `bash rechnung/deploy/install.sh` ausführen. Das Skript fragt nach Name, Adresse (Subdomain) und Passwort und richtet Programm, HTTPS (über Caddy, zusammen mit StickStudio), automatischen Start und tägliche Sicherung ein. Mehrfach ausführbar für weitere, getrennte Kopien (z. B. für Kunden).

## Schutz mit Passwort / auf einem Server

Standardmäßig ist das Programm nur auf dem eigenen Computer erreichbar (`127.0.0.1`). Für den Betrieb auf einem Server:

```bash
HOST=0.0.0.0 PORT=8090 PASSWORD='ein-langes-passwort' DATA_DIR=/pfad/zu/daten node rechnung/server.js
```

Dann unbedingt HTTPS davorschalten (z. B. mit Caddy oder nginx, wie beim StickStudio-Server in `deploy/`).
