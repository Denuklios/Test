# Julekontor – Website

Nachbau der Website aus `www_2.zip` (ursprünglich mit Gemini gebaut). Reine statische Dateien, kein Build-Schritt.

| Pfad | Inhalt |
|---|---|
| `index.html` | Startseite „Vi åbner snart“ mit Countdown, Schneefall und Glocke (`glocke.mp3`) |
| `admin/` | Admin-Bereich (PHP), siehe unten |
| `data/site.json` | Texte und Einstellungen der Startseite – wird im Admin bearbeitet |
| `bastelwerkstatt/` | Bastelwerkstatt: Materialkosten, Arbeitszeit und Verkaufspreis je Projekt |
| `.htaccess` | Leitet auf HTTPS um |

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

Schon fertig: **Startseite** (Überschrift, Countdown, Fußzeile, Schnee, Glocke), **Mein Konto** (Passwort ändern) und die komplette **Warenwirtschaft mit Kasse** (siehe unten).
Noch leer: Kontakt & Adresse, Öffnungszeiten, Bilder.

**Neuen Bereich anlegen:** in `admin/inc/bootstrap.php` unter `JK_MODULES` eintragen und `admin/pages/<name>.php` anlegen (Vorlage: `startseite.php`).

**Sicherheit:** Passwörter nur als Hash. Konto und Sperrliste liegen als PHP-Dateien in `data/private/` (per `.htaccess` gesperrt und werden nie als Text ausgeliefert). Nach 5 falschen Anmeldungen ist die IP 15 Minuten gesperrt. Alle Formulare sind gegen Fremd-Absenden geschützt (CSRF).

**Achtung beim Hochladen:** `data/site.json` nicht überschreiben, sonst sind die im Admin gespeicherten Texte weg. `data/private/` nie überschreiben oder löschen, sonst ist das Admin-Konto weg (dann legt man beim nächsten Aufruf einfach ein neues an).

**Passwort vergessen:** `data/private/config.php` per FTP löschen und unter `/admin/` ein neues Konto anlegen.

## Warenwirtschaft & Kasse

Alles liegt im Admin unter **Laden**. Die Kasse läuft im Browser auf dem Tablet (Android oder iPad), am besten quer.

| Bereich | Was er kann |
|---|---|
| **Kasse öffnen** (`/admin/kasse/`) | Artikel als Kacheln nach Kategorie, Suche, Scannen mit Kamera oder Hand-Scanner, Mengen/Preis/Rabatt je Position, Bonrabatt, „Diverse“ mit freiem Betrag. Bezahlen bar (Rückgeld, Rundung auf 50 Øre), Karte (SumUp), MobilePay, Sonstige. Bon drucken. Ohne Netz werden Verkäufe im Tablet gespeichert und später automatisch gebucht. |
| **Artikel** | Anlegen per Scan (unbekannter Code → neuer Artikel), Preis inkl. Moms, Einkaufspreis mit Rohertrag, Kategorien mit Farben, freier Preis, eigene Strichcodes (20…), CSV-Import/-Export (Excel). |
| **Lager** | Wareneingang, Inventur, Bruch/Schwund, Korrektur – per Scan, Menge, Enter. Nachbestell-Liste, Lagerwert, alle Bewegungen. |
| **Belege** | Alle Bons je Tag, Bon nachdrucken, Rückgabe/Storno (ganz oder teilweise) als eigener Beleg. |
| **Tagesabschluss** | Kasse öffnen mit Wechselgeld, Einlage/Entnahme, Zwischenstand (X), Abschluss (Z) mit Geldzählung und Differenz. |
| **Berichte** | Umsatz, Moms, Rohertrag, Zahlungsarten, Bestseller, Kategorien, Tage, Uhrzeiten. **CSV für die Buchhaltung.** |
| **Etiketten** | Preisetiketten mit Strichcode: A4 3×8, A4 4×10, Etikettendrucker 50×30, Regalschilder. |
| **Kassen-Einstellungen** | Ladendaten und CVR für den Bon, Währung, Steuersätze, Zahlungsarten, MobilePay-Nummer, SumUp, Belegprüfung. |
| **Benutzer** | Mitarbeiter mit Rolle **Kasse** sehen nur Kasse, Belege und Tagesabschluss. |

### Tablet einrichten

1. Auf dem Tablet `https://deine-domain/admin/kasse/` öffnen und anmelden (die Anmeldung hält 12 Stunden).
2. Im Browser-Menü **„Zum Startbildschirm hinzufügen“** – dann startet die Kasse wie eine App im Vollbild.
3. Kamera-Scan: beim ersten Mal den Kamera-Zugriff erlauben (geht nur über https).
4. **Hand-Scanner** (USB oder Bluetooth, z. B. Netum, Zebra, Honeywell): einfach koppeln. Er tippt den Code wie eine Tastatur, die Kasse erkennt das automatisch.
5. **Bondrucker**: Bon über das Druckmenü des Tablets drucken (80-mm-Drucker mit AirPrint bzw. Android-Druckdienst, z. B. Epson TM-m30, Star mC-Print3). Geht auch auf jedem normalen Drucker.

### Kartenzahlung mit SumUp

- **Ohne Einrichtung:** Betrag am SumUp-Gerät eintippen, zahlen lassen, in der Kasse „Karte bezahlt“ tippen.
- **Mit SumUp-App auf demselben Tablet:** In den Kassen-Einstellungen Affiliate-Key und App-ID eintragen (gibt es kostenlos im SumUp-Konto unter Entwickler). Dann öffnet die Kasse die SumUp-App mit dem fertigen Betrag und bucht automatisch, sobald SumUp „bezahlt“ meldet. Dieser Weg ist noch **nicht mit einem echten SumUp-Konto getestet** – bitte zuerst mit einem kleinen Betrag ausprobieren.

### Daten und Sicherheit

- Alles liegt in `data/private/shop.sqlite`. **Diese Datei regelmäßig sichern** (per FTP herunterladen). Der Ordner ist per `.htaccess` gesperrt – das funktioniert auf Apache-Hostern (One.com, Strato, IONOS …). Bei einem nginx-Server muss der Ordner dort extra gesperrt werden.
- Belege werden nie geändert oder gelöscht. Jeder Bon trägt eine Prüfsumme über den vorherigen; „Belege prüfen“ in den Einstellungen zeigt, ob jemand in der Datenbank etwas verändert hat.
- **Rechtliches (Dänemark):** Für Kassensysteme gelten die Regeln der Bogføringsloven bzw. von Skattestyrelsen. Bitte mit Revisor/Buchhalter klären, ob dieses selbst gebaute System für euren Laden so ausreicht, bevor es im echten Betrieb läuft.

## Was ein Server liefern muss (nicht im Zip enthalten)

- `bastelwerkstatt/api/me`, `api/img/<id>` und weitere `api/…` – Anmeldung und Sync. Ohne Server speichert die Bastelwerkstatt nur lokal im Browser.
- `bastelwerkstatt/sw.js` – Service Worker (offline), wird nur unter HTTPS geladen.

## Änderungen gegenüber dem Zip

- `bastelwerkstatt/index.html` war in ein zweites HTML-Gerüst eingepackt (doppeltes `<!doctype>`). Das äußere Gerüst ist entfernt, der Inhalt ist unverändert.
- Die Testseite `TEST/` ist wieder entfernt.
- Die Startseite liest Überschrift, Countdown, Fußzeile, Schnee und Glocke aus `data/site.json`. Fehlt die Datei, gelten die alten Werte.
- `bastelwerkstatt/manifest.webmanifest` ergänzt (war verlinkt, fehlte aber).
- Nicht übernommen, weil nirgends verwendet: `style.css`, `script.js`, `onewebmedia/`.
