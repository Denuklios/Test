# RechnungsStudio – Rechnungsprogramm für dänische Firmen

Ein Rechnungsprogramm wie Billy: Die Oberfläche ist auf **Deutsch**. Jede Rechnung wird automatisch in der **Sprache des Kunden** ausgegeben (Deutsch, Dänisch oder Englisch). Moms und die Felder für SKAT werden automatisch berechnet.

## Starten

1. Einmalig [Node.js](https://nodejs.org) installieren (LTS-Version).
2. Doppelklick auf **`start-rechnung.bat`** (Windows) oder **`start-rechnung.command`** (Mac/Linux).
3. Der Browser öffnet sich mit `http://localhost:8090`.

Oder im Terminal: `npm run rechnung`

Deine Daten liegen in `rechnung/data/rechnung.json`. Jeden Tag wird automatisch eine Sicherung in `rechnung/data/sicherung/` angelegt (die letzten 60 Tage).

## Was das Programm kann

| Bereich | Funktion |
|---|---|
| **Kunden** | Land, Sprache (DE/DA/EN), Währung, CVR-Nr. bzw. USt-IdNr. Dänische Firmen: Daten per Klick aus dem **CVR-Register** holen. EU-Firmen: USt-IdNr. per Klick bei der EU (**VIES**) prüfen. |
| **Momsart automatisch** | Dänemark → 25 % Moms · EU-Firma mit USt-IdNr. → 0 %, Reverse Charge · EU-Privatkunde → 25 % · außerhalb der EU → 0 % (Export) |
| **Produkte** | Name in drei Sprachen. Auf der Rechnung erscheint automatisch der Name in der Kundensprache. |
| **Rechnungen** | Entwurf → genehmigen (fortlaufende Nummer, danach gesperrt) → bezahlt. Gutschriften (Kreditnota), Kopieren, Zahlungserinnerung, Rabatt, momsfreie Zeilen, Fremdwährung mit Kurs von Nationalbanken/EZB. Drucken bzw. **als PDF speichern**, E-Mail-Text in der Kundensprache. |
| **Pflichtangaben** | Alle Angaben nach dänischem Recht: CVR-Nr., fortlaufende Nummer, Datum, Moms je Satz, bei Fremdwährung die Moms in DKK, Reverse-Charge-Hinweis mit USt-IdNr. des Kunden, Bankverbindung (Reg./Konto, IBAN/BIC), optional FI-Zahlungslinie (+71). |
| **Ausgaben** | Belege mit Købsmoms. EU-Einkäufe ohne Moms werden richtig in Rubrik A mit Erwerbsmoms berechnet. |
| **Bank (Lunar)** | Kontoauszug aus Lunar als CSV importieren. Zahlungseingänge werden automatisch passenden Rechnungen vorgeschlagen (Betrag, Rechnungsnummer im Text). Abbuchungen mit einem Klick als Ausgabe buchen. |
| **Moms / SKAT** | Fertige **Momsangivelse** genau mit den Feldern aus TastSelv Erhverv (Salgsmoms, Købsmoms, Rubrik A, B, C, Momstilsvar), Frist je Periode (Halbjahr/Quartal/Monat), Liste für **EU-salg uden moms**, CSV für den Steuerberater. |
| **Übersicht** | Offene und überfällige Rechnungen, Umsatz je Monat, Moms der laufenden Periode, Erinnerung an die nächste Frist. |

## Anbindung an SKAT

Das Programm berechnet alle Werte der Momsangivelse. Du überträgst sie in **TastSelv Erhverv** (MitID Erhverv → Moms → Indberet moms) mit den Kopieren-Knöpfen.

Eine **direkte Übertragung** per Schnittstelle (Skattestyrelsens „API-løsning til momsindberetning“ / NemVirksomhed) ist nur für Software-Anbieter möglich, die bei Skattestyrelsen registriert sind. Billy, Dinero, e-conomic usw. sind solche Anbieter. Für ein eigenes Programm müsstest du dich dort als Anbieter registrieren.

## Anbindung an Lunar

Lunar hat eine Open-Banking-Schnittstelle (PSD2). Die dürfen aber nur **von der Finanzaufsicht zugelassene Kontoinformationsdienste** (AISP) direkt nutzen, nicht jedes Programm. Deshalb läuft es hier über den **CSV-Export** aus Lunar: exportieren, hochladen, fertig. Der Abgleich danach läuft automatisch.

Eine automatische Verbindung ohne CSV ginge über einen zugelassenen Vermittler (z. B. Aiia/Mastercard Open Banking, Tink, Enable Banking). Das kostet in der Regel Geld und braucht einen Vertrag mit dem Anbieter. Der Import ist so gebaut, dass so ein Zugang später ergänzt werden kann.

## Wichtig – Bogføringsloven

Seit 2025/2026 müssen Firmen in Dänemark ab einer bestimmten Umsatzgrenze ein **digitales Buchführungssystem** nutzen. Ein selbst gebautes System ist erlaubt, muss aber die Anforderungen der Bekendtgørelse erfüllen: Belege speichern, Sicherung bei einem Anbieter in der EU, 5 Jahre Aufbewahrung und Abgleich mit der Bank. RechnungsStudio ist ein **Rechnungs- und Moms-Programm**, aber keine komplette doppelte Buchführung (kein Hauptbuch, keine Bilanz, kein SAF-T-Export). Bitte mit deinem Steuerberater (revisor) abklären, ob das für deine Firma reicht oder ob es zusätzlich zu einem registrierten System wie Billy genutzt werden soll.

## Schutz mit Passwort / auf einem Server

Standardmäßig ist das Programm nur auf dem eigenen Computer erreichbar (`127.0.0.1`). Für den Betrieb auf einem Server:

```bash
HOST=0.0.0.0 PORT=8090 PASSWORD='ein-langes-passwort' DATA_DIR=/pfad/zu/daten node rechnung/server.js
```

Dann unbedingt HTTPS davorschalten (z. B. mit Caddy oder nginx, wie beim StickStudio-Server in `deploy/`).
