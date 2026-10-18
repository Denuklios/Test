# StickStudio online betreiben

Die Online-Version läuft auf einem eigenen Server. Kunden melden sich im Browser an, eine Installation ist nicht nötig.
Die Stickdateien (DST/PES/JEF/EXP) erzeugt nur der Server. Der Formatcode wird nie an den Browser ausgeliefert.

- **Konten:** Registrierung mit Zustimmung zu AGB und Datenschutz, Anmeldung, Abmeldung, „Passwort vergessen“, Passwort ändern, Konto löschen und Datenauskunft (DSGVO).
- **Testversion:** gilt nach der Registrierung sofort, Standard 14 Tage, in der Verwaltung einstellbar.
- **Nach Ablauf:** Kunden können ihre Designs nur noch ansehen. Speichern, Export, Teamnamen und Mehrfach-Rahmen sind gesperrt, auch auf dem Server (HTTP 402).
- **Abo:** Kunden schließen ein Abo über Lemon Squeezy ab. Die Lizenz folgt automatisch dem Abo: aktiv, gekündigt (Zugang bis zum Ende des bezahlten Zeitraums) oder beendet. Lizenzen lassen sich zusätzlich von Hand in der Verwaltung setzen.
- **„Verträge hier kündigen“ (§ 312k BGB) und „Vertrag widerrufen“:** Beide sind auf jeder Seite verlinkt und ohne Anmeldung nutzbar, mit Bestätigungsseite und Eingangsbestätigung per E-Mail. Mit `LEMONSQUEEZY_API_KEY` wird eine Kündigung direkt bei Lemon Squeezy ausgeführt, sonst erscheint sie als offener Fall in der Verwaltung.
- **Verlängerungshinweis:** Der Server schickt etwa zwei Wochen vor jeder Verlängerung automatisch eine E-Mail (AGB § 5 Abs. 5).
- **Code-Schutz:** Der Browser bekommt nur eine verschleierte Programmdatei, nie die lesbaren Quelltexte. Jede ausgelieferte Kopie trägt eine Kennung des Kontos (siehe unten).
- **Verwaltung (`/admin`):** Benutzer suchen, sperren und verlängern, Reset-Link erzeugen, Firmendaten für die Rechtstexte pflegen, Protokoll einsehen.
- **Rechtstexte:** Impressum, AGB, Widerruf, Datenschutz und Lizenzen auf Deutsch und Englisch, ausgeliefert unter `/legal/…`. Die Platzhalter werden aus den Firmendaten gefüllt (siehe `legal/README.md`).
- **Sprache:** Deutsch und Englisch, umschaltbar oben rechts. Die Wahl wird am Konto gespeichert.

## FräsStudio (geschützt)

Das Fräsprogramm aus dem Ordner `fraesstudio/` läuft auf demselben Server unter **`https://deine-subdomain/fraesstudio/`**.
Es ist **nur nach Anmeldung** erreichbar und nur für Konten, die in der Verwaltung freigeschaltet sind:

- **Admin** (du) hat immer Zugang.
- Für andere Konten in **Verwaltung → Benutzer → Bearbeiten** das Häkchen **„Zugang zu FräsStudio“** setzen. Ein normales StickStudio-Konto oder eine Testversion reicht nicht.
- Ohne Anmeldung leitet der Server zur Anmeldeseite und danach zurück zu FräsStudio. Ohne Freischaltung erscheint „nicht freigeschaltet“, auch für die einzelnen Programmdateien.
- Nur auf diesen Seiten erlaubt der Server Kamera (Bild von oben) und USB (Steuerung der Fräse).
- Willst du die Registrierung ganz schließen, `REGISTRATION=closed` setzen (siehe unten).



- **Node.js 22.13 oder neuer.** Zusatzpakete sind nicht nötig, die Datenbank ist das eingebaute SQLite.
- **Ein Server mit Domain und HTTPS**, z. B. Hetzner, IONOS oder netcup, Standort in der EU.
- **Optional E-Mail-Versand per SMTP**, für Bestätigungen und „Passwort vergessen“.

## Einrichten auf einem eigenen Server (ca. 15 Minuten)

Voraussetzung: ein gemieteter Server (z. B. Hetzner Cloud, kleinstes Modell, Ubuntu 24.04) und deine Domain. Für einen **Homeserver** siehe den Abschnitt unten. Dein bisheriger Webspace bleibt wie er ist, nur eine **Subdomain** zeigt auf den neuen Server.

1. **Server mieten** und die **IP-Adresse** notieren.
2. **Subdomain anlegen:** Beim Domain-Anbieter (DNS-Einstellungen) einen **A-Eintrag** anlegen: Name `stick` (oder wie du sie nennen willst), Ziel = IP-Adresse des Servers. Es dauert einige Minuten, bis das gilt.
3. **ZIP auf den Server kopieren** und entpacken, z. B. vom eigenen Computer aus:
   ```bash
   scp StickStudio.zip root@DEINE-IP:/root/
   ssh root@DEINE-IP
   apt-get update && apt-get install -y unzip
   unzip StickStudio.zip && cd StickStudio
   ```
4. **Einrichten:** `bash deploy/install.sh`. Das Skript fragt nach Subdomain, E-Mail und Passwort (dein Admin-Login) und erledigt den Rest: Node.js, Programm verschleiern, HTTPS-Zertifikat, Start beim Hochfahren, Firewall, tägliche Datensicherung.
5. **Öffnen:** `https://stick.deine-firma.de`. Die Verwaltung unter `/admin`.

**Aktualisieren** (neue ZIP): hochladen, entpacken und `bash deploy/install.sh` noch einmal ausführen. Die Kundendaten bleiben erhalten (liegen in `/var/lib/stickstudio`).

**Hilfe:** `systemctl status stickstudio`, Meldungen mit `journalctl -u stickstudio -n 50`. Einstellungen (E-Mail, Bezahlung) stehen in `/etc/stickstudio.env`; nach Änderungen `systemctl restart stickstudio`.

## Auf dem eigenen Homeserver (Raspberry Pi / Linux, neben Nextcloud oder Immich)

Ein gemieteter Server ist nicht nötig. Läuft zu Hause schon ein Rechner, der z. B. Nextcloud oder Immich über deine Domain erreichbar macht, kommt StickStudio/FräsStudio einfach **daneben**:

1. **Subdomain anlegen:** Beim Domain-Anbieter einen Eintrag `cnc` (oder ähnlich) anlegen. Am einfachsten als **CNAME** auf die Adresse, unter der deine Fotos schon erreichbar sind (z. B. `fotos.deine-domain.de` oder deine DynDNS-Adresse). Im Router ist **nichts** Neues nötig: Die Portfreigabe für 443 gibt es schon.
2. **ZIP auf den Homeserver kopieren**, entpacken und `sudo bash deploy/install.sh` ausführen.
3. Das Skript **erkennt den vorhandenen Webserver** (Port 80/443 belegt) und rührt ihn nicht an:
   - Es installiert keinen eigenen Webserver und schaltet keine Firewall ein, damit Fotos, Samba usw. weiterlaufen.
   - StickStudio lauscht auf einem freien Port (ab 8090; 8080 ist oft von Nextcloud AIO belegt), nur lokal.
   - Es fragt, welcher Reverse Proxy läuft (**Nginx Proxy Manager, Nginx, Caddy, Apache**), und zeigt dir die passenden Zeilen zum Eintragen. Sie stehen danach auch in `/root/stickstudio-proxy.txt`.
4. Die Zeilen im Proxy eintragen und das HTTPS-Zertifikat für die neue Subdomain holen (Nginx Proxy Manager: Häkchen „Request a new SSL Certificate“; Caddy macht es selbst; Nginx/Apache: `certbot`).
5. Öffnen: `https://cnc.deine-domain.de/fraesstudio/`.

Hinweise für den Raspberry Pi: am besten **64-Bit Raspberry Pi OS** (32 Bit geht auch, das Skript installiert Node.js dann direkt von nodejs.org). Der erste Durchlauf dauert einige Minuten.
Willst du nur selbst zugreifen, `REGISTRATION=closed` in `/etc/stickstudio.env` aktivieren (`#` entfernen) und `systemctl restart stickstudio`.
**Sicherungen** (`/var/backups/stickstudio`) am besten mit in die Nextcloud/NAS-Sicherung aufnehmen.

## WLAN-Brücke zur Fräse (FräsStudio)

FräsStudio kann die Fräse (z. B. TTC450 mit MKS-DLC32-Platine) **über den Server per Telnet (Port 23)** steuern. Voraussetzung: Server und Maschine sind im selben Heimnetz, in der Maschine ist WLAN und Telnet aktiv (siehe `fraesstudio/README.md`).

- Nur für **angemeldete Konten mit FräsStudio-Zugang**. Ziele nur im eigenen Netz (192.168.x.x, 10.x.x.x, 172.16–31.x.x), nur Port 23.
- `CNC_HOST=192.168.1.50`: erlaubt **nur diese Maschine** (empfohlen) und trägt sie im Dialog vor.
- `CNC_PORTS=2323,…`: zusätzliche erlaubte Telnet-Ports.
- `CNC_BRIDGE=off`: Brücke abgeschaltet.
- **Not-Aus:** Bricht die Verbindung des Browsers ab, sendet der Server nach 3 Sekunden einen Soft-Reset (0x18) an die Maschine (Spindel aus, Bewegung gestoppt).
- Der Reverse Proxy darf den Datenstrom nicht puffern (`proxy_buffering off` bzw. `flush_interval -1`); `deploy/install.sh` setzt das in seinen Vorlagen.
- **Achtung Fernsteuerung:** Wer Zugang hat, kann aus der Ferne fräsen. Nur vertrauenswürdigen Konten den FräsStudio-Zugang geben.

## Starten

Einmalig die verschleierte Programmdatei bauen (braucht Internet für `npm install`):

```bash
npm install
npm run build        # erzeugt dist/app.<…>.js – nach jeder Programmänderung neu bauen
```

Ohne Build läuft der Server auch, liefert dann aber die lesbaren Quelltexte aus. Das ist nur für die Entwicklung gedacht.

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
| `CNC_HOST`, `CNC_PORTS`, `CNC_BRIDGE` | WLAN-Brücke zur Fräse (siehe Abschnitt oben) | alle Adressen im Heimnetz, Port 23 |
| `HOST` | Adresse, auf der der Server lauscht, z. B. `127.0.0.1` = nur für einen Reverse Proxy auf demselben Rechner | alle |
| `BASE_URL` | öffentliche Adresse, z. B. `https://stick.deine-firma.de`, für Links in E-Mails | `http://localhost:PORT` |
| `DATA_DIR` | Ordner für die Datenbank `stickstudio.db` | `./data` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Admin-Konto beim ersten Start | – |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | E-Mail-Versand (Port 465 = TLS, 587 = STARTTLS). Ohne `SMTP_HOST` erscheinen die Mails nur im Log. | – |
| `LEMONSQUEEZY_SECRET` | Signatur-Geheimnis des Lemon-Squeezy-Webhooks | – |
| `LEMONSQUEEZY_API_KEY` | API-Schlüssel von Lemon Squeezy. Damit werden Kündigungen über „Verträge hier kündigen“ und beim Löschen eines Kontos automatisch ausgeführt. | – |
| `MARK_SECRET` | Geheimnis für die Konto-Kennung in der Programmdatei. Setzen und nie ändern, sonst passen alte Kennungen nicht mehr. | aus `DATA_DIR` abgeleitet |
| `COOKIE_SECURE` | `1` = Cookie nur über HTTPS | automatisch, wenn `BASE_URL` mit `https://` beginnt |
| `TRUST_PROXY` | `1`, wenn der Server hinter einem Reverse-Proxy läuft (echte IP für die Anmeldesperre) | – |
| `REGISTRATION` | `closed` = keine neuen Registrierungen, Konten nur über die Verwaltung | offen |
| `EVENT_DAYS` | So viele Tage bleibt das Protokoll (Anmeldungen mit IP-Adresse usw.) erhalten, danach wird es automatisch gelöscht | `90` |
| `GEOIP` | `off` = keine Länderdaten laden. Sonst lädt der Server monatlich die kostenlose Länderdatei von DB-IP (CC BY 4.0) selbst herunter und speichert sie in `DATA_DIR/geoip-country.csv`. | an |
| `GEOIP_FILE` | Eigener Pfad zur Länderdatei (CSV: Start,Ende,Land) | `DATA_DIR/geoip-country.csv` |
| `MAX_PROJECTS` | maximale Zahl Designs pro Konto | `2000` |
| `NODE_ENV` | `production` = Programmseite zwischenspeichern | – |

Testtage, Abo-Link, Preis und Firmendaten werden in der **Verwaltung → Einstellungen & Firmendaten** gepflegt, nicht über Umgebungsvariablen.

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

## Verwaltung (`/admin`)

Nur Admin-Konten kommen hinein. Der Bereich hat diese Reiter:

- **Übersicht:** Konten, aktive Abos, Testphase, abgelaufen; neue Konten (7/30 Tage), Aktivität (24 Std./7 Tage), bald ablaufende Lizenzen; Diagramm der Anmeldungen der letzten 14 Tage; Kunden nach Land; „Noch zu erledigen“.
- **Benutzer & Lizenzen:** Suche, Filter (Testphase, Abo, abgelaufen, läuft bald ab, nie angemeldet, gesperrt), Sortierung, Spalten für Registrierung, letzte Anmeldung, Aktivität, letzte IP-Adresse und Land, „+1 Jahr“, Bearbeiten, CSV-Export für Excel.
- **Einstellungen & Firmendaten:** Testtage, Abo-Link, Preis, Firmendaten und die Länderdaten (Download per Knopf).
- **Kündigungen & Widerrufe** und **Protokoll** (mit Filter nach Ereignis, E-Mail oder IP).

**Woher kommt das Land?** Aus der IP-Adresse wird nur das **Land** bestimmt, nie der Ort. Die Zuordnung läuft auf deinem Server mit einer lokalen Datei. Beim Herunterladen der Datei werden keine Kundendaten übertragen. Hinter einem Reverse-Proxy muss `TRUST_PROXY=1` gesetzt sein, sonst steht überall die Adresse des Proxys da.

**Datenschutz:** Das Protokoll mit IP-Adressen wird nach `EVENT_DAYS` (Standard 90) Tagen automatisch gelöscht. Die zuletzt verwendete IP-Adresse im Konto bleibt bis zur Löschung des Kontos. Beides steht in der Datenschutzerklärung.

## Abo mit Lemon Squeezy

Lemon Squeezy tritt als Verkäufer auf (Merchant of Record) und kümmert sich um Rechnungen und die Umsatzsteuer in der EU.

1. Bei Lemon Squeezy ein **Abo-Produkt** anlegen (*Subscription*, z. B. monatlich oder jährlich) und den **Checkout-Link** in der Verwaltung als Abo-Link eintragen.
   Der Server hängt die E-Mail und die Konto-Nummer des Kunden automatisch an, damit das Abo dem richtigen Konto zugeordnet wird.
2. Unter *Settings → Webhooks* einen Webhook anlegen:
   - **URL:** `https://stick.deine-firma.de/api/webhook/lemonsqueezy`
   - **Ereignisse:** alle `subscription_*`-Ereignisse (created, updated, cancelled, resumed, expired, paused, unpaused, payment_success, payment_failed, payment_recovered) sowie `order_refunded`
   - **Signing secret:** selbst wählen und als `LEMONSQUEEZY_SECRET` setzen
3. Unter *Settings → API* einen Schlüssel anlegen und als `LEMONSQUEEZY_API_KEY` setzen. Das ist optional, aber empfohlen: Dann wird eine Kündigung über „Verträge hier kündigen“ sofort bei Lemon Squeezy ausgeführt.
4. **Was dann automatisch passiert:**
   - **Abo aktiv:** Die Lizenz gilt bis zur nächsten Verlängerung plus 3 Tage Puffer.
   - **Gekündigt:** Der Zugang bleibt bis zum Ende des bezahlten Zeitraums, danach gilt „nur ansehen“.
   - **Zahlung fehlgeschlagen:** Der Zugang bleibt, solange Lemon Squeezy die Zahlung erneut versucht.
   - **Abo beendet oder pausiert:** Es gilt sofort „nur ansehen“.
   - **Konto gelöscht:** Das Abo wird gekündigt.
   - **Abo verwalten:** Kunden ändern Zahlungsart und sehen Rechnungen im Kundenportal von Lemon Squeezy. Der Knopf „Abo verwalten“ führt direkt dorthin.
5. **Widerruf und Erstattung** bearbeitest du von Hand. Ein Widerruf erscheint in der Verwaltung unter „Kündigungen & Widerrufe“. Dort das Abo bei Lemon Squeezy beenden und den Betrag (ggf. anteilig) erstatten, dann als erledigt markieren.

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
- **Programmcode:** Der Browser bekommt nur eine zusammengefasste, verschleierte Datei. Namen sind unkenntlich und Texte verschlüsselt abgelegt.
  Die lesbaren Quelltexte und der Code für die Stickformate verlassen den Server nie. Die Datei gibt es nur nach Anmeldung.
- **Konto-Kennung:** Jede ausgelieferte Programmdatei beginnt mit einer Kennung des Kontos, z. B. `lizenziert für Konto 3f9a…`.
  Taucht eine Kopie irgendwo auf, gibst du die Kennung in der Verwaltung ins Suchfeld ein und siehst, von welchem Konto sie stammt.
- **Grenze:** Was im Browser läuft, kann man grundsätzlich mitschneiden. Eine abgespeicherte Kopie ist aber wertlos:
  Ohne Server und gültiges Abo gibt es keinen Export, kein Speichern und keine Stickdatei.

## Test

```bash
node tests/test_server.js
```
