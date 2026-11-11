# FotoBox – eigene Foto-Sicherung fürs Heimnetz

Einfacher Ersatz für Nextcloud-Auto-Upload: Die Handy-App schickt Fotos und Videos
automatisch auf deinen Ubuntu-Server, sobald du zu Hause im WLAN bist.
Mehrere Benutzer, jeder hat seinen eigenen Bereich.

## 1. Server (Ubuntu)

Braucht nur Python 3 (ist bei Ubuntu dabei), keine Datenbank, kein Webserver.

```bash
# Ordner fotobox/server auf den Server kopieren, z. B.:
scp -r fotobox/server benutzer@SERVER:~/fotobox-server
ssh benutzer@SERVER
cd ~/fotobox-server
sudo bash install.sh          # installiert, startet, fragt nach erstem Benutzer
```

Danach läuft der Dienst dauerhaft (auch nach Neustart) auf **Port 8090**.

| Aufgabe | Befehl |
|---|---|
| Benutzer anlegen | `sudo fotobox adduser anna` |
| Passwort ändern | `sudo fotobox passwd anna` |
| Benutzer löschen (Dateien bleiben) | `sudo fotobox deluser anna` |
| Benutzer anzeigen | `sudo fotobox users` |
| Alle Handys eines Benutzers abmelden | `sudo fotobox logout anna` |
| Status / Log | `systemctl status fotobox` / `journalctl -u fotobox -f` |
| Update | neue Dateien kopieren, `sudo bash install.sh` erneut |

Dateien liegen unter `/srv/fotobox/data/<benutzer>/`:

```
/srv/fotobox/data/anna/Fotos/2026/11/IMG_20261111_0930.jpg   ← automatisch
/srv/fotobox/data/anna/Dateien/Rechnung.pdf                  ← selbst hochgeladen
```

Im Browser: `http://SERVER-IP:8090` – anmelden, Fotos ansehen, herunterladen,
Dateien hochladen, Ordner anlegen, löschen.

Anderer Port oder Datenordner: `sudo FOTOBOX_PORT=9000 FOTOBOX_HOME=/mnt/platte/fotobox bash install.sh`

## 2. App (Android 8 und neuer)

`FotoBox.apk` installieren, öffnen, eintragen:

- Server-Adresse: `192.168.x.x` (zeigt `install.sh` am Ende an; Port 8090 wird automatisch ergänzt)
- Benutzer + Passwort
- „Auch alle vorhandenen Fotos sichern“ an oder aus

Zugriff auf Fotos **„Alle erlauben“** wählen (nicht „Auswahl“), sonst sieht die App neue Fotos nicht.

**Wann wird gesichert?**

- Sobald ein neues Foto/Video entsteht und du im WLAN bist
- Wenn du nach Hause kommst (spätestens nach ca. 15 Minuten im WLAN)
- Per Knopf „Jetzt Fotos sichern“

„Zu Hause“ erkennt die App daran, dass sie im WLAN ist **und** der Server antwortet.
Unterwegs passiert nichts und es wird kein mobiles Datenvolumen verbraucht.

**Eigene Dateien:** Knopf „Dateien auswählen und hochladen“ oder in jeder App
*Teilen → Zur FotoBox*. Die Dateien landen in `Dateien/`. Bist du gerade nicht zu
Hause, warten sie und gehen raus, sobald der Server erreichbar ist.

Optionen: Videos ja/nein, nur Kamera-Fotos (ohne WhatsApp/Screenshots), nur beim Laden.
Fotos werden im Original mit GPS-Daten gesichert. Auf dem Server wird nichts doppelt
abgelegt; auf dem Handy wird nichts gelöscht.

## Sicherheit

- Gedacht fürs Heimnetz (HTTP). Port 8090 **nicht** im Router freigeben.
- Passwörter werden gehasht gespeichert (PBKDF2), das Handy speichert nur einen Geräte-Schlüssel.
- Optional HTTPS: `FOTOBOX_CERT` und `FOTOBOX_KEY` in `/etc/systemd/system/fotobox.service` als
  `Environment=` eintragen, dann in der App `https://…` verwenden.

## App selbst bauen

```bash
cd fotobox/android
./gradlew assembleRelease     # braucht Android-SDK; ohne keystore.properties wird mit Debug-Schlüssel signiert
```
