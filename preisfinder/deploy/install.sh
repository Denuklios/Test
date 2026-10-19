#!/bin/bash
# Preisfinder auf dem eigenen Ubuntu-Server (24.04 oder 22.04) einrichten – auch neben StickStudio.
# Aufruf als root im entpackten Ordner:   bash preisfinder/deploy/install.sh
# Erneut ausführen = Update (Merkliste, Einkaufsliste und Preisverlauf bleiben erhalten).
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Bitte als root ausführen (sudo bash preisfinder/deploy/install.sh)."; exit 1; }
SRC="$(cd "$(dirname "$0")/.." && pwd)"
APP=/opt/preisfinder
DATA=/var/lib/preisfinder
ENVF=/etc/preisfinder.env
PORT=8090

echo "=== Preisfinder einrichten ==="
if [ -f "$ENVF" ]; then
  # Update: bisherige Einstellungen übernehmen
  DOMAIN=$(grep '^DOMAIN=' "$ENVF" | cut -d= -f2-)
  PASSWORD=$(grep '^PASSWORD=' "$ENVF" | cut -d= -f2-)
  echo "Update für https://$DOMAIN"
else
  read -r -p "Adresse (Subdomain, die schon auf diesen Server zeigt, z. B. preise.deine-domain.de): " DOMAIN
  read -r -s -p "Passwort für den Preisfinder (mindestens 8 Zeichen): " PASSWORD; echo
  [ -n "$DOMAIN" ] || { echo "Adresse fehlt."; exit 1; }
  [ ${#PASSWORD} -ge 8 ] || { echo "Passwort zu kurz."; exit 1; }
fi

echo "--- Pakete"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https rsync ufw
if ! command -v node >/dev/null || ! node -e "process.exit(+process.versions.node.split('.')[0]>=22?0:1)"; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi

echo "--- Programm"
id preisfinder >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin preisfinder
mkdir -p "$APP" "$DATA" /var/backups/preisfinder
rsync -a --delete --exclude data --exclude deploy "$SRC/" "$APP/"
chown -R preisfinder:preisfinder "$APP" "$DATA" /var/backups/preisfinder

cat > "$ENVF" <<ENV
DOMAIN=$DOMAIN
PORT=$PORT
DATA_DIR=$DATA
PASSWORD=$PASSWORD
ENV
chmod 600 "$ENVF"

cat > /etc/systemd/system/preisfinder.service <<UNIT
[Unit]
Description=Preisfinder
After=network-online.target

[Service]
User=preisfinder
WorkingDirectory=$APP
EnvironmentFile=$ENVF
ExecStart=/usr/bin/node --no-warnings server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=full
ReadWritePaths=$DATA

[Install]
WantedBy=multi-user.target
UNIT

echo "--- HTTPS (Caddy)"
# Eigene Datei, damit andere Programme auf dem Server (z. B. StickStudio) unberührt bleiben
mkdir -p /etc/caddy/conf.d
cat > /etc/caddy/conf.d/preisfinder.caddy <<CADDY
$DOMAIN {
    encode gzip
    reverse_proxy 127.0.0.1:$PORT
}
CADDY
touch /etc/caddy/Caddyfile
grep -q 'import /etc/caddy/conf.d/\*.caddy' /etc/caddy/Caddyfile || echo 'import /etc/caddy/conf.d/*.caddy' >> /etc/caddy/Caddyfile
# Leere Standardseite von Caddy (":80 {…}") würde nicht stören, aber ein Fehler im Caddyfile schon:
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null

# tägliche Sicherung (30 Tage)
cat > /etc/cron.d/preisfinder-backup <<'BAK'
15 3 * * * preisfinder cp /var/lib/preisfinder/preisfinder.json /var/backups/preisfinder/preisfinder-$(date +\%F).json 2>/dev/null; find /var/backups/preisfinder -name 'preisfinder-*.json' -mtime +30 -delete
BAK

ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw --force enable >/dev/null

systemctl daemon-reload
systemctl enable preisfinder >/dev/null
systemctl restart preisfinder
systemctl reload caddy 2>/dev/null || systemctl restart caddy
sleep 3
if curl -fsS "http://127.0.0.1:$PORT/" >/dev/null; then
  echo
  echo "Fertig! Öffne: https://$DOMAIN   (Passwort steht in $ENVF)"
  echo "Auf dem Handy: Seite öffnen → Menü → „Zum Startbildschirm hinzufügen“."
else
  echo "Der Preisfinder antwortet nicht. Meldungen:  journalctl -u preisfinder -n 50 --no-pager"; exit 1
fi
