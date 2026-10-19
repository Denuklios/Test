#!/bin/bash
# RechnungsStudio auf einem Server einrichten oder aktualisieren (Ubuntu/Debian, auch Raspberry Pi OS).
# Läuft neben StickStudio/FräsStudio auf demselben Server. Mehrere getrennte Kopien sind möglich
# (z. B. später eine je Kunde) – jede mit eigener Adresse, eigenen Daten und eigenem Passwort.
# Aufruf als root im entpackten Ordner:   sudo bash rechnung/deploy/install.sh
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Bitte als root ausführen (sudo bash rechnung/deploy/install.sh)."; exit 1; }
SRC="$(cd "$(dirname "$0")/.." && pwd)"
STICK_MARK="# von StickStudio verwaltet"
OWN_MARK="# von RechnungsStudio verwaltet"

echo "=== RechnungsStudio einrichten ==="
read -r -p "Name dieser Kopie (Enter = rechnung; für Kunden z. B. rechnung-mueller): " NAME
NAME=${NAME:-rechnung}
NAME=$(echo "$NAME" | tr 'A-Z' 'a-z' | tr -cd 'a-z0-9-')
[ -n "$NAME" ] || { echo "Ungültiger Name."; exit 1; }
SVC="rs-$NAME"
APP=/opt/$SVC
DATA=/var/lib/$SVC
BACK=/var/backups/$SVC
ENVF=/etc/$SVC.env

command -v ss >/dev/null || { apt-get update -y >/dev/null && apt-get install -y iproute2 >/dev/null; }

# --- Welcher Webserver kümmert sich um HTTPS?
#   caddy  = Caddy von StickStudio oder von uns → eigene Datei in /etc/caddy/sites/
#   proxy  = anderer Webserver (Nextcloud, Nginx Proxy Manager …) → Zeilen zum Eintragen anzeigen
OLD_MODE=$( [ -f "$ENVF" ] && grep '^#MODE=' "$ENVF" | cut -d= -f2 || true )
if [ -n "$OLD_MODE" ]; then
  MODE=$OLD_MODE
elif [ -f /etc/caddy/Caddyfile ] && grep -q -e "$STICK_MARK" -e "$OWN_MARK" /etc/caddy/Caddyfile; then
  MODE=caddy
elif ss -ltnH '( sport = :443 or sport = :80 )' 2>/dev/null | grep -q .; then
  echo "Port 80/443 gehört schon einem anderen Webserver. RechnungsStudio wird DANEBEN eingerichtet."
  MODE=proxy
else
  MODE=caddy
fi

if [ -f "$ENVF" ] && grep -q '^#DOMAIN=' "$ENVF"; then
  DOMAIN=$(grep '^#DOMAIN=' "$ENVF" | cut -d= -f2-)
  PASSWORD=$(grep '^PASSWORD=' "$ENVF" | cut -d= -f2-)
  echo "Bisherige Einrichtung: https://$DOMAIN (Passwort bleibt)"
else
  read -r -p "Adresse (Subdomain, die schon auf diesen Server zeigt, z. B. rechnung.deine-firma.dk): " DOMAIN
  [ -n "$DOMAIN" ] || { echo "Adresse fehlt."; exit 1; }
  read -r -s -p "Passwort für RechnungsStudio (mindestens 10 Zeichen): " PASSWORD; echo
  [ ${#PASSWORD} -ge 10 ] || { echo "Passwort zu kurz."; exit 1; }
fi

# --- freien Port finden (StickStudio nimmt 8090–8099)
PORT=$( [ -f "$ENVF" ] && grep '^PORT=' "$ENVF" | cut -d= -f2 || true )
port_free() { ! ss -ltnH "( sport = :$1 )" 2>/dev/null | grep -q .; }
if [ -z "$PORT" ]; then
  for p in $(seq 8100 8199); do
    if port_free "$p" && ! grep -qs "^PORT=$p$" /etc/rs-*.env; then PORT=$p; break; fi
  done
  [ -n "$PORT" ] || { echo "Kein freier Port zwischen 8100 und 8199 gefunden."; exit 1; }
fi

echo "--- Pakete installieren"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates gnupg rsync xz-utils
node_ok() { command -v node >/dev/null && node -e "process.exit(+process.versions.node.split('.')[0]>=22?0:1)"; }
if ! node_ok; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs || true
fi
node_ok || { echo "Node.js 22 konnte nicht installiert werden."; exit 1; }
NODE_BIN=$(command -v node)
if [ "$MODE" = caddy ] && ! command -v caddy >/dev/null; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi

echo "--- Programm installieren"
id rechnungsstudio >/dev/null 2>&1 || useradd --system --home /opt --shell /usr/sbin/nologin rechnungsstudio
mkdir -p "$APP" "$DATA" "$BACK"
rsync -a --delete --exclude node_modules --exclude data --exclude deploy "$SRC/" "$APP/"
cd "$APP"
npm ci --omit=dev --no-audit --no-fund || echo "Hinweis: Paket für die Belegerkennung nicht installiert – Programm läuft trotzdem."
chown -R rechnungsstudio:rechnungsstudio "$APP" "$DATA" "$BACK"

echo "--- Einstellungen"
KEEP=""
[ -f "$ENVF" ] && KEEP=$(grep -E '^(ANTHROPIC_API_KEY)=' "$ENVF" || true)
cat > "$ENVF" <<ENV
#MODE=$MODE
#DOMAIN=$DOMAIN
PORT=$PORT
HOST=127.0.0.1
DATA_DIR=$DATA
PASSWORD=$PASSWORD
PUBLIC_URL=https://$DOMAIN
# Belegerkennung: Schlüssel hier eintragen statt in den Einstellungen (dann: systemctl restart $SVC)
#ANTHROPIC_API_KEY=
$KEEP
ENV
chmod 600 "$ENVF"

cat > /etc/systemd/system/$SVC.service <<UNIT
[Unit]
Description=RechnungsStudio ($NAME)
After=network.target

[Service]
User=rechnungsstudio
WorkingDirectory=$APP
EnvironmentFile=$ENVF
ExecStart=$NODE_BIN --no-warnings server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=full
ReadWritePaths=$DATA $BACK

[Install]
WantedBy=multi-user.target
UNIT

# tägliche Sicherung aller Daten inkl. Belegfotos (60 Tage aufheben)
cat > /usr/local/bin/$SVC-backup <<BAK
#!/bin/bash
set -e
tar -czf $BACK/$NAME-\$(date +%F).tar.gz -C $DATA .
find $BACK -name '$NAME-*.tar.gz' -mtime +60 -delete
BAK
chmod +x /usr/local/bin/$SVC-backup
echo "45 3 * * * rechnungsstudio /usr/local/bin/$SVC-backup" > /etc/cron.d/$SVC-backup

if [ "$MODE" = caddy ]; then
  mkdir -p /etc/caddy/sites
  cat > /etc/caddy/sites/$SVC.caddy <<CADDY
$DOMAIN {
    encode gzip
    request_body {
        max_size 30MB
    }
    reverse_proxy 127.0.0.1:$PORT
}
CADDY
  # Caddyfile anlegen bzw. um den Verweis auf /etc/caddy/sites ergänzen (Einträge von StickStudio bleiben stehen)
  if [ ! -f /etc/caddy/Caddyfile ] || ! grep -q -e "$STICK_MARK" -e "$OWN_MARK" /etc/caddy/Caddyfile; then
    printf '%s\nimport /etc/caddy/sites/*.caddy\n' "$OWN_MARK" > /etc/caddy/Caddyfile
  elif ! grep -q 'import /etc/caddy/sites/' /etc/caddy/Caddyfile; then
    echo 'import /etc/caddy/sites/*.caddy' >> /etc/caddy/Caddyfile
  fi
  if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; fi
fi

systemctl daemon-reload
systemctl enable --now $SVC
systemctl restart $SVC
if [ "$MODE" = caddy ]; then caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1 && systemctl reload caddy || systemctl restart caddy; fi
sleep 2
code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/" || true)
[ "$code" = 401 ] || [ "$code" = 200 ] || { echo "Der Server antwortet nicht. Meldungen:  journalctl -u $SVC -n 50 --no-pager"; exit 1; }

if [ "$MODE" = proxy ]; then
  echo
  echo "RechnungsStudio läuft auf Port $PORT. Im vorhandenen Webserver/Reverse Proxy eintragen:"
  echo "  Adresse $DOMAIN  →  http://127.0.0.1:$PORT   (Uploads bis 30 MB erlauben, HTTPS-Zertifikat holen)"
  echo "  Nginx Proxy Manager: Proxy Host, Forward http / $(hostname -I | awk '{print $1}') / $PORT, SSL-Zertifikat anfordern,"
  echo "  Reiter Advanced: client_max_body_size 30m;   (dann HOST=0.0.0.0 in $ENVF und systemctl restart $SVC)"
fi

echo
echo "Fertig! Öffne: https://$DOMAIN   (Benutzername beliebig, Passwort wie eingegeben)"
echo "Daten:        $DATA   Sicherungen: $BACK (täglich, 60 Tage) – zusätzlich auf einen anderen Rechner kopieren!"
echo "Einstellungen: $ENVF   Neu starten: systemctl restart $SVC   Meldungen: journalctl -u $SVC -n 50"
