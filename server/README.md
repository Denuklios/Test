# StickStudio online betreiben

Die Online-Version läuft auf einem eigenen Server. Kunden melden sich im Browser an, eine Installation ist nicht nötig.
Die Stickdateien (DST/PES/JEF/EXP) erzeugt nur der Server. Der Formatcode wird nie an den Browser ausgeliefert.

- **Konten:** Registrierung mit Zustimmung zu AGB und Datenschutz, Anmeldung, Abmeldung, „Passwort vergessen“, Passwort ändern, Konto löschen und Datenauskunft (DSGVO).
- **Testversion:** gilt nach der Registrierung sofort, Standard 14 Tage, in der Verwaltung einstellbar.
- **Nach Ablauf:** Kunden können ihre Designs nur noch ansehen. Speichern, Export, Teamnamen und Mehrfach-Rahmen sind gesperrt, auch auf dem Server (HTTP 402).
- **Lizenz:** wird automatisch über Lemon Squeezy verlängert (Webhook) oder von Hand in der Verwaltung („+1 Jahr“, Datum frei setzen).
- **Verwaltung (`/admin`):** Benutzer suchen, sperren und verlängern, Reset-Link erzeugen, Firmendaten für die Rechtstexte pflegen, Protokoll einsehen.
- **Rechtstexte:** Impressum, AGB, Widerruf, Datenschutz und Lizenzen auf Deutsch und Englisch, ausgeliefert unter `/legal/…`. Die Platzhalter werden aus den Firmendaten gefüllt (siehe `legal/README.md`).
- **Sprache:** Deutsch und Englisch, umschaltbar oben rechts. Die Wahl wird am Konto gespeichert.

## Voraussetzungen

- **Node.js 22.13 oder neuer.** Zusatzpakete sind nicht nötig, die Datenbank ist das eingebaute SQLite.
- **Ein Server mit Domain und HTTPS**, z. B. Hetzner, IONOS oder netcup, Standort in der EU.
- **Optional E-Mail-Versand per SMTP**, für Bestätigungen und „Passwort vergessen“.

## Starten

```bash
ADMIN_EMAIL=du@deine-firma.de ADMIN_PASSWORD='ein-langes-passwort' \
BASE_URL=https://stick.deine-firma.de \
node --no-warnings server/server.js
```

Beim ersten Start legt der Server das **Admin-Konto** mit `ADMIN_EMAIL` und `ADMIN_PASSWORD` an.
Ohne `ADMIN_PASSWORD` erzeugt er ein Zufallspasswort und zeigt es **einmal** im Log an.
Das Admin-Konto läuft nie ab. Das Passwort danach unter „Mein Konto“ ändern.

## Einstellungen (Umgebungsvariablen)

| Variable | Bedeutung | Standard |
|---|---|---|
| `PORT` | Port des Servers | `8080` |
| `BASE_URL` | öffentliche Adresse, z. B. `https://stick.deine-firma.de`, für Links in E-Mails | `http://localhost:PORT` |
| `DATA_DIR` | Ordner für die Datenbank `stickstudio.db` | `./data` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Admin-Konto beim ersten Start | – |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | E-Mail-Versand (Port 465 = TLS, 587 = STARTTLS). Ohne `SMTP_HOST` erscheinen die Mails nur im Log. | – |
| `LEMONSQUEEZY_SECRET` | Signatur-Geheimnis des Lemon-Squeezy-Webhooks | – |
| `COOKIE_SECURE` | `1` = Cookie nur über HTTPS | automatisch, wenn `BASE_URL` mit `https://` beginnt |
| `TRUST_PROXY` | `1`, wenn der Server hinter einem Reverse-Proxy läuft (echte IP für die Anmeldesperre) | – |
| `REGISTRATION` | `closed` = keine neuen Registrierungen, Konten nur über die Verwaltung | offen |
| `MAX_PROJECTS` | maximale Zahl Designs pro Konto | `2000` |
| `NODE_ENV` | `production` = Programmseite zwischenspeichern | – |

Testtage, Lizenzdauer, Kauf-Link, Preis und Firmendaten werden in der **Verwaltung → Einstellungen & Firmendaten** gepflegt, nicht über Umgebungsvariablen.

## Mit Docker

```bash
docker build -t stickstudio .
docker run -d --name stickstudio -p 8080:8080 -v stickdata:/data \
  -e ADMIN_EMAIL=du@deine-firma.de -e ADMIN_PASSWORD='ein-langes-passwort' \
  -e BASE_URL=https://stick.deine-firma.de -e TRUST_PROXY=1 \
  stickstudio
```

## HTTPS mit Caddy (Reverse-Proxy)

Caddy holt die HTTPS-Zertifikate automatisch. Inhalt der Datei `/etc/caddy/Caddyfile`:

```
stick.deine-firma.de {
    encode gzip
    reverse_proxy 127.0.0.1:8080
}
```

Den Server dann mit `TRUST_PROXY=1` starten.

## Als Dienst (systemd)

Inhalt der Datei `/etc/systemd/system/stickstudio.service`:

```ini
[Unit]
Description=StickStudio
After=network.target

[Service]
WorkingDirectory=/opt/stickstudio
ExecStart=/usr/bin/node --no-warnings server/server.js
Environment=PORT=8080 BASE_URL=https://stick.deine-firma.de DATA_DIR=/var/lib/stickstudio TRUST_PROXY=1 NODE_ENV=production
EnvironmentFile=-/etc/stickstudio.env
Restart=always
User=stickstudio

[Install]
WantedBy=multi-user.target
```

Geheimnisse wie `ADMIN_PASSWORD`, `SMTP_PASS` und `LEMONSQUEEZY_SECRET` gehören in `/etc/stickstudio.env`. Die Datei darf nur für root lesbar sein (`chmod 600`).

## Bezahlung mit Lemon Squeezy

Lemon Squeezy tritt als Verkäufer auf (Merchant of Record) und kümmert sich um Rechnungen und die Umsatzsteuer in der EU.

1. Bei Lemon Squeezy ein Produkt anlegen, z. B. „StickStudio 1 Jahr“, und den **Checkout-Link** in der Verwaltung als Kauf-Link eintragen.
   Der Server hängt die E-Mail und die Konto-Nummer des Kunden automatisch an.
2. Unter *Settings → Webhooks* einen Webhook anlegen:
   - **URL:** `https://stick.deine-firma.de/api/webhook/lemonsqueezy`
   - **Ereignisse:** `order_created`, `subscription_payment_success`, `order_refunded`
   - **Signing secret:** selbst wählen und als `LEMONSQUEEZY_SECRET` setzen
3. Nach jeder Zahlung verlängert sich die Lizenz automatisch um die eingestellte Dauer (Standard 365 Tage).
   Erstattungen erscheinen im Protokoll. Die Lizenz dann bei Bedarf von Hand anpassen.

Ohne Zahlungsanbieter verlängerst du die Lizenzen einfach selbst in der Verwaltung.

## Sicherung

Alle Daten liegen in **einer** Datei: `DATA_DIR/stickstudio.db`, dazu `-wal` und `-shm`. Eine tägliche Sicherung im laufenden Betrieb geht so:

```bash
sqlite3 /var/lib/stickstudio/stickstudio.db ".backup '/backup/stick-$(date +%F).db'"
```

Die Sicherungen außerhalb des Servers aufbewahren und alte nach 30 Tagen löschen, wie es in der Datenschutzerklärung steht.

## Sicherheit

- Passwörter werden mit scrypt gehasht, Sitzungen in der Datenbank nur als Hash gespeichert.
- Das Sitzungs-Cookie ist `HttpOnly`, `SameSite=Lax` und bei HTTPS `Secure`.
- Die Anmeldung wird nach mehreren Fehlversuchen gebremst.
- Schutz vor fremden Seiten: Die API verlangt eine eigene Kopfzeile, und der Server prüft die Herkunft (Origin).
- Strenge Content-Security-Policy, keine externen Skripte oder Schriften.
- **Grenze:** Das Zeichenprogramm selbst läuft im Browser, sein JavaScript ist also für angemeldete Nutzer einsehbar.
  Ohne gültige Lizenz entstehen aber keine Stickdateien, weil Export und Speichern nur auf dem Server laufen.

## Test

```bash
node tests/test_server.js
```
