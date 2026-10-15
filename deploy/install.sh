#!/bin/bash
# StickStudio auf einem frischen Ubuntu-Server (24.04 oder 22.04) einrichten.
# Aufruf als root im entpackten StickStudio-Ordner:   bash deploy/install.sh
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Bitte als root ausführen (sudo bash deploy/install.sh)."; exit 1; }
SRC="$(cd "$(dirname "$0")/.." && pwd)"
APP=/opt/stickstudio
DATA=/var/lib/stickstudio

echo "=== StickStudio einrichten ==="
read -r -p "Adresse (Subdomain, die schon auf diesen Server zeigt, z. B. stick.deine-firma.de): " DOMAIN
read -r -p "Deine E-Mail (Admin-Login): " ADMIN_EMAIL
read -r -s -p "Dein Passwort (mindestens 10 Zeichen): " ADMIN_PASSWORD; echo
[ ${#ADMIN_PASSWORD} -ge 10 ] || { echo "Passwort zu kurz."; exit 1; }
[ -n "$DOMAIN" ] || { echo "Adresse fehlt."; exit 1; }

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

echo "--- Programm installieren und verschleiern"
id stickstudio >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin stickstudio
mkdir -p "$APP" "$DATA" /var/backups/stickstudio
rsync -a --delete --exclude node_modules --exclude data --exclude .git --exclude dist "$SRC/" "$APP/"
cd "$APP"
npm ci --no-audit --no-fund
npm run build
rm -rf node_modules tests tools docs
chown -R stickstudio:stickstudio "$APP" "$DATA" /var/backups/stickstudio

echo "--- Einstellungen"
ENVF=/etc/stickstudio.env
if [ -f "$ENVF" ]; then cp "$ENVF" "$ENVF.bak"; MARK=$(grep '^MARK_SECRET=' "$ENVF" | cut -d= -f2- || true); fi
MARK=${MARK:-$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 32)}
cat > "$ENVF" <<ENV
PORT=8080
BASE_URL=https://$DOMAIN
DATA_DIR=$DATA
NODE_ENV=production
TRUST_PROXY=1
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_PASSWORD=$ADMIN_PASSWORD
MARK_SECRET=$MARK
# E-Mail-Versand (später ausfüllen, dann: systemctl restart stickstudio)
#SMTP_HOST=
#SMTP_PORT=465
#SMTP_USER=
#SMTP_PASS=
#MAIL_FROM=noreply@$DOMAIN
# Bezahlung über Lemon Squeezy (später)
#LEMONSQUEEZY_SECRET=
#LEMONSQUEEZY_API_KEY=
ENV
chmod 600 "$ENVF"

cat > /etc/systemd/system/stickstudio.service <<UNIT
[Unit]
Description=StickStudio
After=network.target

[Service]
User=stickstudio
WorkingDirectory=$APP
EnvironmentFile=$ENVF
ExecStart=/usr/bin/node --no-warnings server/server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=full
ReadWritePaths=$DATA /var/backups/stickstudio

[Install]
WantedBy=multi-user.target
UNIT

cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN {
    encode gzip
    reverse_proxy 127.0.0.1:8080
}
CADDY

# tägliche Sicherung der Datenbank (14 Tage aufheben)
cat > /usr/local/bin/stickstudio-backup <<'BAK'
#!/bin/bash
set -e
F=/var/backups/stickstudio/stick-$(date +%F).db
rm -f "$F"
node --no-warnings -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('/var/lib/stickstudio/stickstudio.db');d.exec(\"VACUUM INTO '\"+process.argv[1]+\"'\");" "$F"
find /var/backups/stickstudio -name 'stick-*.db' -mtime +14 -delete
BAK
chmod +x /usr/local/bin/stickstudio-backup
echo '30 3 * * * stickstudio /usr/local/bin/stickstudio-backup' > /etc/cron.d/stickstudio-backup

echo "--- Firewall (nur SSH, HTTP, HTTPS)"
ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw --force enable >/dev/null

systemctl daemon-reload
systemctl enable --now stickstudio
systemctl restart caddy
sleep 3
if curl -fsS http://127.0.0.1:8080/login >/dev/null; then
  echo
  echo "Fertig! Öffne: https://$DOMAIN"
  echo "Verwaltung: https://$DOMAIN/admin   (Login: $ADMIN_EMAIL)"
  echo "Das Passwort steht nur in $ENVF; nach dem ersten Login kannst du es unter „Mein Konto“ ändern"
  echo "und die Zeile ADMIN_PASSWORD dort danach löschen."
  echo "Sicherungen: täglich in /var/backups/stickstudio (zusätzlich auf einen anderen Rechner kopieren!)."
else
  echo "Der Server antwortet nicht. Meldungen ansehen mit:  journalctl -u stickstudio -n 50 --no-pager"; exit 1
fi
