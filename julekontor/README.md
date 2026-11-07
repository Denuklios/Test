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

Läuft auf jedem Webhosting mit **PHP 8.1 oder neuer**, ohne Datenbank.

1. Den Ordner `julekontor/` hochladen. Der Ordner `data/` muss für PHP **beschreibbar** sein.
2. `https://deine-domain/admin/` öffnen. Beim ersten Aufruf legst du dein Admin-Konto an (E-Mail + Passwort, mind. 10 Zeichen). Das geht nur einmal.
3. Danach anmelden und die Bereiche bearbeiten.

Schon fertig: **Startseite** (Überschrift, Countdown, Fußzeile, Schnee, Glocke) und **Mein Konto** (Passwort ändern).
Noch leer: Kontakt & Adresse, Öffnungszeiten, Bilder.

**Neuen Bereich anlegen:** in `admin/inc/bootstrap.php` unter `JK_MODULES` eintragen und `admin/pages/<name>.php` anlegen (Vorlage: `startseite.php`).

**Sicherheit:** Passwörter nur als Hash. Konto und Sperrliste liegen als PHP-Dateien in `data/private/` (per `.htaccess` gesperrt und werden nie als Text ausgeliefert). Nach 5 falschen Anmeldungen ist die IP 15 Minuten gesperrt. Alle Formulare sind gegen Fremd-Absenden geschützt (CSRF).

**Achtung beim Hochladen:** `data/site.json` nicht überschreiben, sonst sind die im Admin gespeicherten Texte weg. `data/private/` nie überschreiben oder löschen, sonst ist das Admin-Konto weg (dann legt man beim nächsten Aufruf einfach ein neues an).

**Passwort vergessen:** `data/private/config.php` per FTP löschen und unter `/admin/` ein neues Konto anlegen.

## Was ein Server liefern muss (nicht im Zip enthalten)

- `bastelwerkstatt/api/me`, `api/img/<id>` und weitere `api/…` – Anmeldung und Sync. Ohne Server speichert die Bastelwerkstatt nur lokal im Browser.
- `bastelwerkstatt/sw.js` – Service Worker (offline), wird nur unter HTTPS geladen.

## Änderungen gegenüber dem Zip

- `bastelwerkstatt/index.html` war in ein zweites HTML-Gerüst eingepackt (doppeltes `<!doctype>`). Das äußere Gerüst ist entfernt, der Inhalt ist unverändert.
- Die Testseite `TEST/` ist wieder entfernt.
- Die Startseite liest Überschrift, Countdown, Fußzeile, Schnee und Glocke aus `data/site.json`. Fehlt die Datei, gelten die alten Werte.
- `bastelwerkstatt/manifest.webmanifest` ergänzt (war verlinkt, fehlte aber).
- Nicht übernommen, weil nirgends verwendet: `style.css`, `script.js`, `onewebmedia/`.
