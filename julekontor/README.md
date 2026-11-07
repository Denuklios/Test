# Julekontor – Website

Nachbau der Website aus `www_2.zip` (ursprünglich mit Gemini gebaut). Reine statische Dateien, kein Build-Schritt.

| Pfad | Inhalt |
|---|---|
| `index.html` | Startseite „Vi åbner snart“ mit Countdown, Schneefall und Glocke (`glocke.mp3`) |
| `TEST/` | Neue, volle Seite (DA/DE/EN): Adventskalender, Baum schmücken, Wunschzettel, Chat mit dem Weihnachtsmann, Laden/Besuch |
| `TEST/shop.json` | Kontaktdaten, Öffnungszeiten usw. – leere Felder werden ausgeblendet |
| `bastelwerkstatt/` | Bastelwerkstatt: Materialkosten, Arbeitszeit und Verkaufspreis je Projekt |
| `.htaccess` | Leitet auf HTTPS um |

## Lokal ansehen

```bash
cd julekontor && python3 -m http.server 8000
```

Dann `http://localhost:8000` öffnen.

## Was ein Server liefern muss (nicht im Zip enthalten)

- `TEST/api/santa` (POST) – Antworten des Weihnachtsmanns im Chat. Fehlt der Endpunkt, zeigt der Chat einen Offline-Hinweis.
- `bastelwerkstatt/api/me`, `api/img/<id>` und weitere `api/…` – Anmeldung und Sync. Ohne Server speichert die Bastelwerkstatt nur lokal im Browser.
- `bastelwerkstatt/sw.js` – Service Worker (offline), wird nur unter HTTPS geladen.

## Änderungen gegenüber dem Zip

- `TEST/index.html` und `bastelwerkstatt/index.html` waren in ein zweites HTML-Gerüst eingepackt (doppeltes `<!doctype>`). Das äußere Gerüst ist entfernt, der Inhalt ist unverändert.
- `bastelwerkstatt/manifest.webmanifest` ergänzt (war verlinkt, fehlte aber).
- Nicht übernommen, weil nirgends verwendet: `style.css`, `script.js`, `onewebmedia/`.
