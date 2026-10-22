#!/bin/bash
# Julekontor Bastelwerkstatt auf einem Ubuntu-Server (24.04 oder 22.04) einrichten.
# Läuft auch neben StickStudio auf demselben Server (eigener Port, eigener Eintrag in Caddy).
# Aufruf als root im Ordner julekontor-bastel:   bash deploy/install.sh
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Bitte als root ausführen (sudo bash deploy/install.sh)."; exit 1; }
SRC="$(cd "$(dirname "$0")/.." && pwd)"
APP=/opt/julekontor-bastel
DATA=/var/lib/julekontor-bastel
PORT=8090

echo "=== Julekontor Bastelwerkstatt einrichten ==="
read -r -p "Adresse (Subdomain, die schon auf diesen Server zeigt, z. B. bastel.julekontor.dk): " DOMAIN
read -r -p "E-Mail für die Anmeldung: " USER_EMAIL
read -r -s -p "Passwort (mindestens 8 Zeichen): " USER_PASSWORD; echo
[ -n "$DOMAIN" ] || { echo "Adresse fehlt."; exit 1; }
[ ${#USER_PASSWORD} -ge 8 ] || { echo "Passwort zu kurz."; exit 1; }

echo "--- Pakete installieren"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https rsync ufw
if ! command -v node >/dev/null || ! node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi

echo "--- Programm kopieren"
id bastel >/dev/null 2>&1 || useradd --system --home "$DATA" --shell /usr/sbin/nologin bastel
mkdir -p "$APP" "$DATA" /var/backups/julekontor-bastel
rsync -a --delete --exclude data --exclude deploy "$SRC"/ "$APP"/
chown -R bastel:bastel "$DATA" /var/backups/julekontor-bastel

cat > /etc/julekontor-bastel.env <<ENV
PORT=$PORT
DATA_DIR=$DATA
COOKIE_SECURE=1
ENV
chmod 600 /etc/julekontor-bastel.env
sudo -u bastel env DATA_DIR="$DATA" node --no-warnings "$APP/server/server.js" add-user "$USER_EMAIL" "$USER_PASSWORD"

cat > /etc/systemd/system/julekontor-bastel.service <<UNIT
[Unit]
Description=Julekontor Bastelwerkstatt
After=network.target

[Service]
User=bastel
WorkingDirectory=$APP
EnvironmentFile=/etc/julekontor-bastel.env
ExecStart=/usr/bin/node --no-warnings server/server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=full
ReadWritePaths=$DATA /var/backups/julekontor-bastel

[Install]
WantedBy=multi-user.target
UNIT

echo "--- Caddy (HTTPS)"
touch /etc/caddy/Caddyfile
if ! grep -q "^$DOMAIN {" /etc/caddy/Caddyfile; then
  cat >> /etc/caddy/Caddyfile <<CADDY

$DOMAIN {
    encode gzip
    request_body {
        max_size 25MB
    }
    reverse_proxy 127.0.0.1:$PORT
}
CADDY
fi

# tägliche Sicherung von Datenbank und Fotos (14 Tage aufheben)
cat > /usr/local/bin/julekontor-bastel-backup <<'BAK'
#!/bin/bash
set -e
D=/var/backups/julekontor-bastel/$(date +%F)
rm -rf "$D"; mkdir -p "$D"
node --no-warnings -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('/var/lib/julekontor-bastel/bastel.db');d.exec(\"VACUUM INTO '\"+process.argv[1]+\"'\");" "$D/bastel.db"
cp -a /var/lib/julekontor-bastel/img "$D/img"
find /var/backups/julekontor-bastel -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf {} +
BAK
chmod +x /usr/local/bin/julekontor-bastel-backup
echo '40 3 * * * bastel /usr/local/bin/julekontor-bastel-backup' > /etc/cron.d/julekontor-bastel-backup

echo "--- Firewall (SSH, HTTP, HTTPS)"
ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw --force enable >/dev/null

systemctl daemon-reload
systemctl enable --now julekontor-bastel
systemctl restart julekontor-bastel
systemctl reload caddy || systemctl restart caddy
sleep 2
if curl -fsS "http://127.0.0.1:$PORT/api/me" >/dev/null; then
  echo "Fertig! Öffne am Handy und am PC: https://$DOMAIN"
  echo "Anmelden unter Einstellungen mit $USER_EMAIL"
  echo "Weitere Zugänge:  sudo -u bastel env DATA_DIR=$DATA node --no-warnings $APP/server/server.js add-user name@julekontor.dk 'passwort'"
else
  echo "Der Dienst antwortet nicht. Protokoll ansehen mit:  journalctl -u julekontor-bastel -n 50"
fi
