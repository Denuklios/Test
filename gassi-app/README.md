# Gassirunde – Prototyp

Web-App für Spaziergänge mit Hund: Runden aufzeichnen, gute Gassirunden finden und bewerten und live sehen, wer gerade mit Hund unterwegs ist. Zum Ausweichen oder um gemeinsam zu gehen.

## Was der Prototyp kann

| Bereich | Funktion |
|---|---|
| **Aufzeichnen** | „Spaziergang starten“ zeichnet per GPS den Weg auf, mit Kilometern, Zeit und Tempo. Die Runde beginnt erst dort, wo man auf Start drückt, nicht an der Haustür. Optional werden Anfang und Ende um 100 m gekürzt, falls man direkt vor der Tür startet oder endet. Pause/Weiter ohne geraden Strich über die Pause. Ungenaue GPS-Punkte und Sprünge werden herausgefiltert. Der Bildschirm bleibt an. |
| **Runden teilen** | Nach dem Spaziergang mit Name, Beschreibung, Schatten, Untergrund, Leinenregel, Wasser, Mülleimern und Straßen speichern. Danach sehen alle die Runde. |
| **Vorgefertigte Runden** | 6 Beispielrunden in Berlin, z. B. das Hundeauslaufgebiet am Grunewaldsee. Sie folgen echten Fußwegen aus OpenStreetMap. |
| **Bewerten** | 1–5 Sterne und Kommentar, eine Bewertung pro Person (kann geändert werden). Wer eine Runde nachgelaufen ist, wird danach direkt zum Bewerten geführt. |
| **Hunde-Score** | 0–100 Punkte aus Wasser, Schatten, Untergrund, Straßen, Leinenregel und Mülleimern, mit Aufschlüsselung. Dazu Warnungen je nach Wetter und Hund (heißer Asphalt, kein Wasser, zu lang für Welpen oder Senioren). Die Temperatur kommt live von Open-Meteo. |
| **Runde finden** | Zeit, Wasser, „wenig Begegnungen“ und Freilauf auswählen. Die App schlägt die 3 passendsten Runden mit Begründung vor. |
| **Belebtheit** | Tagesverlauf je Runde mit Hinweis auf die ruhigste Uhrzeit, dazu die Zahl der Hunde, die gerade live auf der Runde sind. |
| **Live-Karte** | Wer beim Spaziergang die Position teilt, erscheint für alle auf der Karte. Drei Status-Arten: **Gern zusammen** (grün), **Unterwegs** (grau), **Bitte Abstand** (gelb, wie die gelbe Schleife an der Leine). |
| **Begegnungen** | Warnung mit Vibration, wenn jemand mit „Bitte Abstand“ näher als 150 m ist. Hinweis mit „Winken“-Knopf, wenn jemand mit „Gern zusammen“ näher als 300 m ist. Das Winken kommt beim anderen als Nachricht an, und man kann zurückwinken. |
| **Meine Spaziergänge** | Verlauf mit Datum, km und Zeit sowie Gesamt-Kilometern (im Profil). |
| **Demo-Modus** | GPS-Simulation im 3-fachen Zeitraffer und 5 Demo-Spaziergänger, damit man alles am Schreibtisch ausprobieren kann. |

## Starten

Es wird nur Node.js ab Version 20 gebraucht, keine weiteren Pakete:

```bash
cd gassi-app
npm start            # → http://localhost:8080
npm test             # Logik- und Server-Tests
```

Zum Ausprobieren am Computer: Oben rechts das Profil öffnen, **„Demo-Modus: GPS simulieren“** einschalten und eine Runde starten. Öffnet man die App in zwei Browserfenstern mit zwei verschiedenen Profilen, sehen sich beide live auf der Karte.

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

API: `GET /api/routes` · `POST /api/routes` · `POST /api/routes/:id/ratings` · `GET /api/live/stream` (SSE) · `POST /api/live` · `DELETE /api/live/:id` · `POST /api/live/wave`

## Grenzen des Prototyps

- **Keine Anmeldung.** Jede Person bekommt eine zufällige ID im Browser. Bewertungen und Live-Positionen lassen sich deshalb noch fälschen. Vor einem echten Start braucht es Konten, Moderation (melden, löschen) und Missbrauchsschutz.
- **GPS bei gesperrtem Bildschirm:** Web-Apps zeichnen auf dem iPhone nicht weiter auf, wenn der Bildschirm aus ist. Deshalb hält die App den Bildschirm an. Für den echten Einsatz sollte die App als native App ausgeliefert werden (z. B. mit Capacitor oder React Native, mit demselben Code für die Logik).
- **Belebtheit** ist ein typischer Tagesverlauf. Mit echten Nutzern sollte sie aus den aufgezeichneten Spaziergängen gelernt werden.
- **Hunde-Score** wird bei eigenen Runden aus den Angaben der Person berechnet. Nächster Schritt: Wasser, Wald und Straßen automatisch aus OpenStreetMap ermitteln, damit die App auch Runden vorschlagen kann, die noch niemand eingetragen hat.
- **Kartenkacheln** kommen direkt von openstreetmap.org. Das ist für Tests in Ordnung. Für viele Nutzer braucht man einen eigenen oder bezahlten Kachel-Dienst (z. B. MapTiler oder Stadia).
- **Datenschutz:** Live-Positionen werden nur während eines Spaziergangs und nur mit eingeschaltetem Schalter geteilt. Nach 2 Minuten ohne Signal verschwinden sie, auf dem Server wird nichts davon gespeichert.
