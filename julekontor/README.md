# Julekontor – Website mit Online-Shop

Vollständige Website für das Julekontor (Danmarks Gammeldags Julebutik) in Dänisch, Deutsch und Englisch – mit Online-Shop, Adventskalender, Admin-Bereich, Warenwirtschaft und Kasse. Läuft auf PHP 8.1+ mit SQLite, kein Build-Schritt.

**Vor dem Eröffnungstag zeigt jede Adresse nur die Countdown-Seite.** Shop, Kalender und alle anderen Seiten und auch die Schnittstelle sind bis dahin gesperrt. Im Admin unter „Eröffnung & Startseite“ steht ein geheimer Vorschau-Link, mit dem man schon vorher alles sieht.

| Pfad | Inhalt |
|---|---|
| `index.php` | Einstieg. Jede Seite ist `./?s=<name>`: `butik` (Shop), `vare` (Artikel), `kurv` (Warenkorb und Bestellung), `ordre` (Bestellbestätigung), `julekalender`, `nyheder`, `arrangementer`, `galleri`, `faq`, `om`, `kontakt`, `vilkaar` (Rechtstexte) |
| `site/lib.php`, `site/pages/` | Seitenrahmen und die einzelnen Seiten |
| `site/lang.php` | Alle Texte in drei Sprachen (im Admin unter „Texte & Seiten“ überschreibbar) |
| `api.php` | Schnittstelle: Türchen, Anfragen, Warenkorb, Bestellung, Kartenzahlung |
| `assets/` | Gestaltung, Programm, Schriften, Logo, Truck und die gemalten Bilder (mit Canva erzeugt) |
| `admin/` | Admin-Bereich, siehe unten |
| `data/` | Einstellungen (`site.json`), Datenbank (`private/shop.sqlite`), hochgeladene Fotos (`bilder/`, `produkte/`) |
| `admin/kalkulation/` | **Preiskalkulation**: Materiallager, Projekte, Arbeitszeit mit Stoppuhr, Stundensatz aus Monatsbedarf, großer Preiszettel, Übernahme des Preises in die Kasse |
| `bastelwerkstatt/` | Alte Bastelwerkstatt-App (nur noch, um ihre Sicherung in die Preiskalkulation zu übernehmen) |

## Website pflegen (Admin)

| Bereich | Was er kann |
|---|---|
| **Eröffnung & Startseite** | Eröffnungstag, Countdown, Website sofort öffnen oder gesperrt lassen, Vorschau-Link, Satz unter dem Logo, Hinweisband, Schnee, Glocke |
| **Texte & Seiten** | Alle Texte der Seiten in drei Sprachen: Startseite, Handgemacht, Über uns, Shop, Kontakt und die Rechtstexte |
| **Neuigkeiten, Termine, Galerie, Häufige Fragen** | Beiträge, Veranstaltungen, Fotos und Fragen anlegen, ändern, löschen. Leere Bereiche erscheinen nicht im Menü |
| **Adventskalender** | 24 Türchen mit Text in drei Sprachen, Bild, Gutscheincode, Link. Inhalt wird erst am jeweiligen Tag herausgegeben |
| **Kontakt & Adresse, Öffnungszeiten, Bilder** | Adresse, Telefon, E-Mail, CVR; Zeiten je Wochentag; eigene Fotos statt der gemalten Bilder |
| **Artikel** (unter Laden) | „Im Online-Shop zeigen“, „Kann verschickt werden“, „Bausatz“, Name und Beschreibung in drei Sprachen |
| **Shop-Einstellungen** | Bestellen an/aus, Versandpreise Dänemark/Deutschland, versandkostenfrei ab, Euro-Kurs, Zahlungsarten |
| **Bestellungen** | Liste, Status (bestätigt, versendet, abgeholt, storniert), bezahlt markieren, Notiz, CSV für die Buchhaltung |
| **Anfragen** | Fragen und Reservierungen von der Website |

### So läuft eine Bestellung

1. Der Kunde legt Artikel in den Warenkorb (liegt nur in seinem Browser), wählt Abholung oder Versand und die Zahlungsart und bestellt.
2. Die Ware wird sofort im Lager reserviert (Lagerbewegung „Online-Bestellung“). Kunde und Laden bekommen eine E-Mail, wenn unter „Kontakt & Adresse“ eine E-Mail eingetragen ist und der Hoster das PHP-`mail()` erlaubt.
3. Unter **Bestellungen** setzt du den Status und markierst die Zahlung. Stornieren bucht die Ware zurück ins Lager.

**Zahlungsarten:** Bezahlen bei Abholung, MobilePay (Nummer eintragen), Überweisung (Bankverbindung eintragen), Karte über SumUp. Die Kartenzahlung nutzt den SumUp-Schlüssel aus den Kassen-Einstellungen und die SumUp-Bezahlseite. **Sie ist mit einem echten SumUp-Konto noch nicht getestet** – vor der Eröffnung eine Probebestellung mit kleinem Betrag machen.

**Wichtig für die Buchhaltung:** Online-Bestellungen laufen nicht über die Kasse. Sie stehen nicht im Tagesabschluss und nicht in den Berichten; dafür gibt es unter Bestellungen die CSV-Liste. Bitte mit Revisor/Buchhalter klären, wie die Online-Umsätze gebucht werden.

**Rechtstexte** (Impressum, AGB, Widerrufsrecht, Datenschutz) sind vollständig in drei Sprachen hinterlegt. Inhaber, Straße, CVR-Nummer, E-Mail und Telefon aus „Kontakt & Adresse“ werden automatisch eingesetzt; fehlt eine Angabe, entfällt die Zeile. Die Texte folgen dänischem Verbraucherrecht, ersetzen aber keine Rechtsberatung – einmal gegenlesen lassen. **Häufige Fragen** sind mit elf Einträgen vorbefüllt und im Admin änderbar.

**Schriften** Berkshire Swash und Alegreya liegen im Ordner `assets/fonts` (SIL Open Font License) – es wird nichts von fremden Servern geladen.

## Lokal ansehen

```bash
cd julekontor && php -S localhost:8000
```

Dann `http://localhost:8000` öffnen, der Admin liegt unter `http://localhost:8000/admin/`.

## Admin-Bereich

Läuft auf jedem Webhosting mit **PHP 8.1 oder neuer** und **SQLite** (bei fast allen Hostern dabei, z. B. One.com). Keine extra Datenbank nötig.

1. Den Ordner `julekontor/` hochladen. Der Ordner `data/` muss für PHP **beschreibbar** sein.
2. `https://deine-domain/admin/` öffnen. Beim ersten Aufruf legst du dein Admin-Konto an (E-Mail + Passwort, mind. 10 Zeichen). Das geht nur einmal.
3. Danach anmelden und die Bereiche bearbeiten.

Enthalten: die Website-Bereiche (siehe oben), **Mein Konto** (Passwort ändern) und die komplette **Warenwirtschaft mit Kasse** (siehe unten).

**Neuen Bereich anlegen:** in `admin/inc/bootstrap.php` unter `JK_MODULES` eintragen und `admin/pages/<name>.php` anlegen (Vorlage: `startseite.php`).

**Sicherheit:** Passwörter nur als Hash. Konto und Sperrliste liegen als PHP-Dateien in `data/private/` (per `.htaccess` gesperrt und werden nie als Text ausgeliefert). Nach 5 falschen Anmeldungen ist die IP 15 Minuten gesperrt. Alle Formulare sind gegen Fremd-Absenden geschützt (CSRF).

**Achtung beim Hochladen:** `data/site.json`, `data/bilder/` und `data/produkte/` nicht überschreiben, sonst sind die im Admin gespeicherten Texte und Fotos weg. `data/private/` nie überschreiben oder löschen, sonst ist das Admin-Konto weg (dann legt man beim nächsten Aufruf einfach ein neues an).

**Passwort vergessen:** `data/private/config.php` per FTP löschen und unter `/admin/` ein neues Konto anlegen.

## Warenwirtschaft & Kasse

Alles liegt im Admin unter **Laden**. Die Kasse läuft im Browser auf dem Tablet (Android oder iPad), am besten quer.

| Bereich | Was er kann |
|---|---|
| **Kasse öffnen** (`/admin/kasse/`) | Artikel als Kacheln nach Kategorie, Suche, Scannen mit Kamera oder Hand-Scanner, Mengen/Preis/Rabatt je Position, Bonrabatt, „Diverse“ mit freiem Betrag. Kacheln mit Produktfoto. Bezahlen bar (Rückgeld, Rundung auf 50 Øre), Karte (beliebiges Kartenterminal, Belegnummer optional), MobilePay, Sonstige. Danach zeigt die Kasse einen **QR-Code für den digitalen Beleg** (spart Papier) – oder auf Wunsch Bon bzw. A4-Rechnung drucken. Ohne Netz werden Verkäufe im Tablet gespeichert und später automatisch gebucht. |
| **Artikel** | Anlegen per Scan (unbekannter Code → neuer Artikel), Foto direkt mit der Tablet-Kamera, Preis inkl. Moms, Einkaufspreis mit Rohertrag, Kategorien mit Farben, freier Preis, eigene EAN-13-Strichcodes (beginnen mit 20) – einzeln oder für alle Artikel ohne Code auf einmal, CSV-Import/-Export (Excel). |
| **Lager** | Wareneingang, Inventur, Bruch/Schwund, Korrektur – per Scan, Menge, Enter. Nachbestell-Liste, Lagerwert, alle Bewegungen. |
| **Belege** | Alle Bons je Tag, nachdrucken als Bon oder A4-Rechnung (mit Logo und Kundenadresse), Rückgabe/Storno (ganz oder teilweise) als eigener Beleg. |
| **Tagesabschluss** | Kasse öffnen mit Wechselgeld, Einlage/Entnahme, Zwischenstand (X), Abschluss (Z) mit Geldzählung und Differenz. |
| **Berichte** | Umsatz, Moms, Rohertrag, Zahlungsarten, Bestseller, Kategorien, Tage, Uhrzeiten. **CSV für die Buchhaltung.** |
| **Etiketten** | Preisetiketten mit Strichcode: A4 3×8, A4 4×10, Etikettendrucker 50×30, Regalschilder. |
| **Kassen-Einstellungen** | Ladendaten und CVR für den Bon, Druck-Standard (Bon 80/58 mm oder A4), Text unter der Rechnung (z. B. Bankverbindung), Währung, Steuersätze, Zahlungsarten, MobilePay-Nummer, Belegprüfung. |
| **Benutzer** | Mitarbeiter mit Rolle **Kasse** sehen nur Kasse, Belege und Tagesabschluss. |

### Tablet einrichten

1. Auf dem Tablet `https://deine-domain/admin/kasse/` öffnen und anmelden (die Anmeldung hält 12 Stunden).
2. Im Browser-Menü **„Zum Startbildschirm hinzufügen“** – dann startet die Kasse wie eine App im Vollbild.
3. Kamera-Scan: beim ersten Mal den Kamera-Zugriff erlauben (geht nur über https).
4. **Hand-Scanner** (USB oder Bluetooth, z. B. Netum, Zebra, Honeywell): einfach koppeln. Er tippt den Code wie eine Tastatur, die Kasse erkennt das automatisch.
5. **Drucken**: Nach jedem Verkauf „Bon drucken“ (Bondrucker 80 oder 58 mm mit AirPrint bzw. Android-Druckdienst, z. B. Epson TM-m30, Star mC-Print3) oder „A4-Rechnung“ (jeder normale Drucker). Was standardmäßig hervorgehoben ist, stellst du in den Kassen-Einstellungen ein.

### Digitaler Beleg (QR-Code)

Nach jedem Verkauf zeigt die Kasse einen QR-Code. Der Kunde scannt ihn mit der Handy-Kamera und sieht seinen Beleg unter `beleg.php` – als Kvittering oder Faktura (A4), zum Speichern als PDF. Keine Anmeldung nötig; jeder Beleg hat einen eigenen, nicht zu erratenden Link. Unter „Letzte Bons“ (📱) und in den Belegen im Admin lässt sich der QR-Code jederzeit wieder zeigen. Abschalten: Kassen-Einstellungen → Drucken.

### Kartenzahlung

**Ohne Einrichtung:** Betrag am Kartenterminal eintippen (SumUp, Nets, Flatpay …), Kunde zahlt, in der Kasse „Karte bezahlt“. Die Belegnummer vom Terminal kann man dazuschreiben.

**Mit SumUp Solo automatisch (Cloud API):** Die Kasse schickt den Betrag direkt an das Solo, der Kunde zahlt, die Kasse bucht von selbst.

1. Auf me.sumup.com → Einstellungen → Für Entwickler → Toolkit:
   - **API Keys** → Erstellen → Schlüssel kopieren (wird nur einmal angezeigt).
   - **Affiliate Keys** → Application identifier z. B. `dk.julekontor.kasse` → Hinzufügen.
2. Admin → Kassen-Einstellungen → **SumUp Solo**: API-Schlüssel, Affiliate-Key und App-ID eintragen, „In der Kasse verwenden“ anhaken, speichern. Die Händlernummer holt die Kasse selbst.
3. Am Solo abmelden → **Verbindungen → API → Verbinden**. Den angezeigten Code (gilt 5 Minuten) im Admin unter „Kopplungs-Code“ eintragen → Koppeln.
4. In der Kasse bei „Karte“ erscheint jetzt **„… an Solo senden“**.

Sicherheit: Der API-Schlüssel bleibt auf dem Server (data/private), das Tablet sieht ihn nie. Ein Kartenverkauf wird nur gebucht, wenn SumUp selbst „bezahlt“ meldet und der Betrag stimmt. Wird das Tablet während der Zahlung neu geladen, holt die Kasse das Ergebnis ab. Ist bezahlt, aber die Buchung scheitert, wird **nie ein zweites Mal** abgebucht – die Kasse bucht mit derselben Vorgangsnummer nach. Die Liste „Letzte Kartenzahlungen“ in den Einstellungen zeigt jede Zahlung mit Bonnummer und warnt bei „bezahlt, aber kein Bon“.

Hinweise: Das Solo braucht WLAN (oder Mobilfunk). Rückerstattungen auf die Karte macht man in der SumUp-App bzw. auf me.sumup.com; in der Kasse wird die Rückgabe wie gewohnt unter „Belege“ gebucht. Reine Dankort-Karten (ohne Visa) nimmt SumUp nicht an. **Mit einem echten SumUp-Konto ist die Anbindung noch nicht getestet** (nur mit einem Simulator nach der SumUp-Dokumentation) – bitte zuerst mit einem kleinen Betrag ausprobieren.

### Daten und Sicherheit

- Alles liegt in `data/private/shop.sqlite`, die Produktfotos in `data/produkte/`. Beide beim Hochladen von Updates **nicht überschreiben**.
- `data/private/shop.sqlite` **Diese Datei regelmäßig sichern** (per FTP herunterladen). Der Ordner ist per `.htaccess` gesperrt – das funktioniert auf Apache-Hostern (One.com, Strato, IONOS …). Bei einem nginx-Server muss der Ordner dort extra gesperrt werden.
- Belege werden nie geändert oder gelöscht. Jeder Bon trägt eine Prüfsumme über den vorherigen; „Belege prüfen“ in den Einstellungen zeigt, ob jemand in der Datenbank etwas verändert hat.
- **Rechtliches (Dänemark):** Für Kassensysteme gelten die Regeln der Bogføringsloven bzw. von Skattestyrelsen. Bitte mit Revisor/Buchhalter klären, ob dieses selbst gebaute System für euren Laden so ausreicht, bevor es im echten Betrieb läuft.

## Was ein Server liefern muss (nicht im Zip enthalten)

- `bastelwerkstatt/api/me`, `api/img/<id>` und weitere `api/…` – Anmeldung und Sync. Ohne Server speichert die Bastelwerkstatt nur lokal im Browser.
- `bastelwerkstatt/sw.js` – Service Worker (offline), wird nur unter HTTPS geladen.

## Preiskalkulation (Admin → Laden → Preiskalkulation)

Großzügige Arbeitsfläche unter `/admin/kalkulation/`, Daten in der gemeinsamen Datenbank (auf jedem Gerät gleich).

- **Materiallager:** jede Rolle, Packung oder Flasche einmal mit Preis in kr. oder € (Umrechnung mit dem Euro-Kurs aus den Shop-Einstellungen). Arten: Fläche, Länge, Stück, Gewicht, Gießpulver mit Mischverhältnis, Form & Werkzeug (Verschleiß), Flüssig. Über 70 Vorlagen.
- **Projekt:** Verbrauch je Material, Stückzahl pro Durchgang, Arbeitszeit (Stoppuhr), Verpackung pro Stück, Sonstiges, Foto.
- **Preiszettel:** Material + Arbeitszeit + Verpackung + Sonstiges = Selbstkosten → + Gewinnaufschlag (Schieberegler) → + 25 % Moms → + Kartengebühr → auf volle Krone, 5 oder 10 kr. gerundet. Dazu Gewinn pro Stück, Marge, Verdienst pro Stunde, „Was wäre wenn“-Tabelle, eigener Preis, Euro-Hinweis und wie viele Stück für den Monatsbedarf nötig sind.
- **Stundensatz:** Standard 150 kr. (grob Einzelhandelsniveau in Dänemark) oder aus dem Monatsbedarf: (Netto ÷ (1 − Steuern) + feste Kosten) ÷ Bastelstunden.
- **In die Kasse:** legt einen Artikel mit dem Preis an oder aktualisiert den verknüpften. Einkaufspreis = Material + Verpackung + Sonstiges pro Stück.
- **Nachbauen:** Bereitlege-Liste für N Stück mit Mengen, Packungen, Kosten, Zeit und Verkaufswert.
- **Alte Daten:** Sicherung der alten Bastelwerkstatt unter „Stundensatz & Einstellungen“ übernehmen.

## Updates direkt auf den Server (One.com)

Im Website-Ordner auf dem Server liegt `deploy.php` (Quelle: `julekontor-deploy/deploy.php` im Repository, nicht im Upload-Paket).
Sie nimmt ein ZIP der Website nur mit dem richtigen Schlüssel im Kopf `X-Deploy-Token` an und entpackt es an Ort und Stelle.
Nie überschrieben werden `data/private` (Datenbank, Konto, Schlüssel), `data/bilder`, `data/produkte` und `data/site.json`.
Nach 5 falschen Schlüsseln ist eine Stunde Pause. Neuer Schlüssel: auf dem Server `data/private/deploy-key.php` löschen,
`deploy.php` neu hochladen und innerhalb von 2 Stunden `POST deploy.php?a=setup` mit dem neuen Schlüssel aufrufen.
