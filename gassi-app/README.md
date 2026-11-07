# Gassirunde – Prototyp

Web-App für Spaziergänge mit Hund: Runden aufzeichnen, gute Gassirunden finden und bewerten und live sehen, wer gerade mit Hund unterwegs ist. Zum Ausweichen oder um gemeinsam zu gehen.

## Was der Prototyp kann

| Bereich | Funktion |
|---|---|
| **Konten** | Registrieren mit E-Mail, Passwort (mind. 8 Zeichen), Vorname, Hundename und Alter des Hundes. Anmelden, Abmelden, Profil ändern, Passwort ändern (meldet andere Geräte ab), Konto löschen (löscht auch Spaziergänge, Bewertungen und geteilte Runden). Andere sehen nur Vorname und Hundename, nie die E-Mail-Adresse. Ohne Anmeldung kann man Runden ansehen. Zum Aufzeichnen, Bewerten, Winken und für die Live-Karte meldet man sich an, danach geht es direkt mit der gewünschten Aktion weiter. |
| **Aufzeichnen** | „Spaziergang starten“ zeichnet per GPS den Weg auf, mit Kilometern, Zeit und Tempo. Die Runde beginnt erst dort, wo man auf Start drückt, nicht an der Haustür. Optional werden Anfang und Ende um 100 m gekürzt, falls man direkt vor der Tür startet oder endet. Pause/Weiter ohne geraden Strich über die Pause. Ungenaue GPS-Punkte und Sprünge werden herausgefiltert. Der Bildschirm bleibt an. |
| **Runden teilen** | Nach dem Spaziergang mit Name, Beschreibung, Schatten, Untergrund, Leinenregel, Wasser, Mülleimern und Straßen speichern. Danach sehen alle die Runde. |
| **Vorgefertigte Runden** | 6 Beispielrunden in Berlin, z. B. das Hundeauslaufgebiet am Grunewaldsee. Sie folgen echten Fußwegen aus OpenStreetMap. |
| **Bewerten** | 1–5 Sterne und Kommentar, eine Bewertung pro Person (kann geändert werden). Wer eine Runde nachgelaufen ist, wird danach direkt zum Bewerten geführt. |
| **Hunde-Score** | 0–100 Punkte aus Wasser, Schatten, Untergrund, Straßen, Leinenregel und Mülleimern, mit Aufschlüsselung. Dazu Warnungen je nach Wetter und Hund (heißer Asphalt, kein Wasser, zu lang für Welpen oder Senioren). Die Temperatur kommt live von Open-Meteo. |
| **Runde finden** | Zeit, Wasser, „wenig Begegnungen“ und Freilauf auswählen. Die App schlägt die 3 passendsten Runden mit Begründung vor. |
| **Belebtheit** | Tagesverlauf je Runde mit Hinweis auf die ruhigste Uhrzeit, dazu die Zahl der Hunde, die gerade live auf der Runde sind. |
| **Live-Karte** | Wer beim Spaziergang die Position teilt, erscheint für alle auf der Karte. Drei Status-Arten: **Gern zusammen** (grün), **Unterwegs** (grau), **Bitte Abstand** (gelb, wie die gelbe Schleife an der Leine). |
| **Begegnungen** | Warnung mit Vibration, wenn jemand mit „Bitte Abstand“ näher als 150 m ist. Hinweis mit „Winken“-Knopf, wenn jemand mit „Gern zusammen“ näher als 300 m ist. Das Winken kommt beim anderen als Nachricht an, und man kann zurückwinken. |
| **Meine Spaziergänge** | Verlauf mit Datum, km und Zeit sowie Gesamt-Kilometern, gespeichert im Konto und damit auf jedem Gerät sichtbar (im Profil). |
| **Demo-Modus** | GPS-Simulation im 3-fachen Zeitraffer und 5 Demo-Spaziergänger, damit man alles am Schreibtisch ausprobieren kann. |

## Starten

Es wird nur Node.js ab Version 20 gebraucht, keine weiteren Pakete:

```bash
cd gassi-app
npm start            # → http://localhost:8080
npm test             # Logik- und Server-Tests
```

Zum Ausprobieren am Computer: Oben rechts auf **Anmelden**, ein Konto anlegen, dann im Profil **„Demo-Modus: GPS simulieren“** einschalten und eine Runde starten. Mit einem zweiten Konto in einem privaten Browserfenster sehen sich beide live auf der Karte und können sich zuwinken.

### Testversion auf wunsch-fabrik.dk

Die Testversion liegt in einem versteckten Ordner: **https://www.wunsch-fabrik.dk/gassi-ljv0zkx2/**. Der Ordner ist nirgends verlinkt, Suchmaschinen werden ausgesperrt.

- Dort läuft der PHP-Server `php/api.php` (PHP 7.4+ mit SQLite), weil der one.com-Webspace kein Node.js kann. Er hat dieselben Funktionen wie `server.js`. Live-Positionen und Winken holt die App alle 3 Sekunden ab, statt über eine Dauerverbindung.
- Hochladen: einen Commit mit `[hochladen]` in der Beschreibung auf den Zweig `claude/dog-walking-routes-ounny2` pushen, oder in GitHub unter Actions → „Gassirunde hochladen“ → Run workflow. Die Automatik nutzt dieselben Zugangsdaten wie der Website-Upload.
- Konten und Runden liegen auf dem Server in `daten/gassi.sqlite`. Ein neuer Upload überschreibt sie nicht, und der Ordner ist von außen gesperrt.
- Das Paket baut `bash tools/build-php.sh <ordner>`. Getestet wird es mit `npm test` (startet `php -S`, wenn PHP installiert ist).

### Auf dem Handy testen

Browser geben GPS nur über **https** frei. Die App muss dafür auf einem Server mit https laufen, zum Beispiel bei Render, Railway, Fly.io oder auf einem eigenen Server hinter einem Reverse-Proxy. Einstellungen über Umgebungsvariablen:

| Variable | Bedeutung | Standard |
|---|---|---|
| `PORT` | Port des Servers | `8080` |
| `DATA_DIR` | Ordner für `store.json` (Runden, Bewertungen) | `./data` |
| `DEMO_WALKERS` | `0` schaltet die Demo-Spaziergänger ab | an |

Ohne Server (z. B. reines statisches Hosting) läuft die App trotzdem. Runden und Bewertungen bleiben dann nur im eigenen Browser, und live sieht man nur die Demo-Spaziergänger.

## Aufbau

```
gassi-app/
  server.js                 Node-Server ohne Abhängigkeiten: App, REST-API, Live per Server-Sent Events
  public/index.html         Oberfläche
  public/style.css          Gestaltung (hell/dunkel, Handy und Desktop)
  public/js/core.js         Gemeinsame Logik: Distanz, Kürzen, GPS-Filter, Hunde-Score, Empfehlungen
  public/js/backend.js      Datenquelle: Server oder lokal im Browser
  public/js/app.js          Karte (Leaflet + OpenStreetMap), Aufnahme, Bewertungen, Live, Warnungen
  public/data/demo-routes.json   Vorgefertigte Runden
  tools/build-demo-routes.mjs    Erzeugt die Demo-Runden über echtes Fußgänger-Routing
  tests/                    node:test
```

API:
- Konto: `POST /api/auth/register` · `POST /api/auth/login` · `POST /api/auth/logout` · `GET /api/auth/me` · `PATCH /api/me` · `POST /api/me/password` · `DELETE /api/me` · `GET/POST /api/me/walks`
- Runden: `GET /api/routes` (öffentlich) · `POST /api/routes` · `DELETE /api/routes/:id` (nur Autor) · `POST /api/routes/:id/ratings`
- Live (nur angemeldet): `GET /api/live/stream` (SSE) · `POST /api/live` · `DELETE /api/live` · `POST /api/live/wave` (geht nur an die gemeinte Person, nicht an Personen mit „Bitte Abstand“)

Sicherheit: Passwörter werden mit scrypt und eigenem Salt gespeichert. Die Session steckt in einem HttpOnly-Cookie mit SameSite=Lax (hinter https automatisch Secure), auf dem Server liegt nur ein Hash des Tokens. Schreibende Anfragen werden nur als JSON angenommen (Schutz gegen Formular-Angriffe von fremden Seiten). Nach 10 falschen Passwörtern ist für 15 Minuten Schluss. Name und ID kommen immer aus dem Konto, nie aus der Anfrage.

## Grenzen des Prototyps

- **Noch kein E-Mail-Versand:** Es gibt keine Bestätigung der E-Mail-Adresse und kein „Passwort vergessen“. Dafür braucht es einen Mail-Dienst. Bis dahin: Passwort gut merken.
- **Moderation fehlt:** Unpassende Runden oder Bewertungen kann man noch nicht melden, Nutzer kann man noch nicht sperren.
- **Speicher:** Alles liegt in einer JSON-Datei. Für einige hundert Nutzer reicht das, danach sollte eine Datenbank her (z. B. SQLite oder PostgreSQL).
- **GPS bei gesperrtem Bildschirm:** Web-Apps zeichnen auf dem iPhone nicht weiter auf, wenn der Bildschirm aus ist. Deshalb hält die App den Bildschirm an. Für den echten Einsatz sollte die App als native App ausgeliefert werden (z. B. mit Capacitor oder React Native, mit demselben Code für die Logik).
- **Belebtheit** ist ein typischer Tagesverlauf. Mit echten Nutzern sollte sie aus den aufgezeichneten Spaziergängen gelernt werden.
- **Hunde-Score** wird bei eigenen Runden aus den Angaben der Person berechnet. Nächster Schritt: Wasser, Wald und Straßen automatisch aus OpenStreetMap ermitteln, damit die App auch Runden vorschlagen kann, die noch niemand eingetragen hat.
- **Kartenkacheln** kommen direkt von openstreetmap.org. Das ist für Tests in Ordnung. Für viele Nutzer braucht man einen eigenen oder bezahlten Kachel-Dienst (z. B. MapTiler oder Stadia).
- **Datenschutz:** Live-Positionen werden nur während eines Spaziergangs und nur mit eingeschaltetem Schalter geteilt. Nach 2 Minuten ohne Signal verschwinden sie, auf dem Server wird nichts davon gespeichert.
