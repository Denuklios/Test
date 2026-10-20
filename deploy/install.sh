#!/bin/bash
# StickStudio (mit FräsStudio unter /fraesstudio/) einrichten oder aktualisieren.
# Läuft auf Ubuntu/Debian, auch auf Raspberry Pi OS (64 Bit empfohlen) und auf einem Homeserver,
# auf dem schon ein Webserver läuft (z. B. für Nextcloud oder Immich).
# Aufruf als root im entpackten Ordner:   sudo bash deploy/install.sh
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Bitte als root ausführen (sudo bash deploy/install.sh)."; exit 1; }
SRC="$(cd "$(dirname "$0")/.." && pwd)"
APP=/opt/stickstudio
DATA=/var/lib/stickstudio
ENVF=/etc/stickstudio.env
CADDY_MARK="# von StickStudio verwaltet"

echo "=== StickStudio / FräsStudio einrichten ==="
# ss (iproute2) wird gebraucht, um belegte Ports zu erkennen
command -v ss >/dev/null || { apt-get update -y >/dev/null && apt-get install -y iproute2 >/dev/null; }

# --- Läuft hier schon ein Webserver auf Port 80/443 (Nextcloud, Immich, Nginx Proxy Manager …)?
busy_web=""
if ss -ltnH '( sport = :443 or sport = :80 )' 2>/dev/null | grep -q .; then busy_web=1; fi
ours=""
[ -f /etc/caddy/Caddyfile ] && grep -q "$CADDY_MARK" /etc/caddy/Caddyfile && ours=1
# ältere Einrichtung (vor der Homeserver-Variante): Caddy gehörte StickStudio
[ -f "$ENVF" ] && [ -f /etc/caddy/Caddyfile ] && grep -q 'reverse_proxy 127.0.0.1:8080' /etc/caddy/Caddyfile && ours=1
OLD_MODE=$( [ -f "$ENVF" ] && grep '^#MODE=' "$ENVF" | cut -d= -f2 || true )

if [ -n "$OLD_MODE" ]; then
  MODE=$OLD_MODE
  echo "Bisherige Einrichtung: $([ "$MODE" = proxy ] && echo 'neben vorhandenem Webserver' || echo 'eigener Webserver (Caddy)')"
elif [ -n "$busy_web" ] && [ -z "$ours" ]; then
  echo
  echo "Auf diesem Rechner benutzt schon ein anderes Programm Port 80/443 (z. B. dein Reverse Proxy für Nextcloud/Immich)."
  echo "StickStudio wird deshalb DANEBEN eingerichtet: Es läuft auf einem freien Port, und du trägst"
  echo "in deinem vorhandenen Webserver eine weitere Subdomain ein. Deine Fotos & Co. bleiben unberührt."
  MODE=proxy
else
  echo
  echo "1) Eigener Webserver: StickStudio bekommt Port 80/443 und holt das HTTPS-Zertifikat selbst (leerer Server/VPS)"
  echo "2) Neben einem vorhandenen Webserver / Reverse Proxy (Homeserver mit Nextcloud, Immich …)"
  read -r -p "Auswahl [1/2]: " m
  [ "$m" = 2 ] && MODE=proxy || MODE=caddy
fi

read -r -p "Adresse (Subdomain, die auf diesen Rechner zeigt, z. B. cnc.deine-domain.de): " DOMAIN
[ -n "$DOMAIN" ] || { echo "Adresse fehlt."; exit 1; }
if [ -f "$ENVF" ] && grep -q '^ADMIN_EMAIL=' "$ENVF"; then
  ADMIN_EMAIL=$(grep '^ADMIN_EMAIL=' "$ENVF" | cut -d= -f2-)
  ADMIN_PASSWORD=$(grep '^ADMIN_PASSWORD=' "$ENVF" | cut -d= -f2- || true)
  echo "Admin-Konto bleibt: $ADMIN_EMAIL"
else
  read -r -p "Deine E-Mail (Admin-Login): " ADMIN_EMAIL
  read -r -s -p "Dein Passwort (mindestens 10 Zeichen): " ADMIN_PASSWORD; echo
  [ ${#ADMIN_PASSWORD} -ge 10 ] || { echo "Passwort zu kurz."; exit 1; }
fi

# --- freien Port finden (8080 ist auf Homeservern oft belegt, z. B. von Nextcloud AIO)
PORT=$( [ -f "$ENVF" ] && grep '^PORT=' "$ENVF" | cut -d= -f2 || true )
port_free() { ! ss -ltnH "( sport = :$1 )" 2>/dev/null | grep -q .; }
if [ -z "$PORT" ]; then
  for p in 8090 8091 8092 8093 8094 8095 8096 8097 8098 8099; do if port_free "$p"; then PORT=$p; break; fi; done
  [ -n "$PORT" ] || { echo "Kein freier Port zwischen 8090 und 8099 gefunden."; exit 1; }
fi

HOST=127.0.0.1
PROXY_KIND=""
if [ "$MODE" = proxy ]; then
  PROXY_KIND=$( [ -f "$ENVF" ] && grep '^#PROXY=' "$ENVF" | cut -d= -f2 || true )
  if [ -z "$PROXY_KIND" ]; then
    echo
    echo "Welcher Reverse Proxy läuft bei dir?"
    echo "  1) Nginx Proxy Manager (Docker, Weboberfläche)"
    echo "  2) Nginx (direkt installiert)"
    echo "  3) Caddy (direkt installiert)"
    echo "  4) Apache (direkt installiert, z. B. für Nextcloud)"
    echo "  5) Weiß ich nicht / etwas anderes"
    read -r -p "Auswahl [1-5]: " k
    case "$k" in 1) PROXY_KIND=npm ;; 2) PROXY_KIND=nginx ;; 3) PROXY_KIND=caddy ;; 4) PROXY_KIND=apache ;; *) PROXY_KIND=other ;; esac
  fi
  # Ein Proxy in Docker erreicht 127.0.0.1 des Rechners nicht -> im Heimnetz lauschen
  [ "$PROXY_KIND" = npm ] || [ "$PROXY_KIND" = other ] && HOST=0.0.0.0
fi

echo "--- Pakete installieren"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates gnupg rsync xz-utils iproute2
node_ok() { command -v node >/dev/null && node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"; }
if ! node_ok; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs || true
fi
if ! node_ok; then
  # Rückfall (z. B. 32-Bit-Raspberry-Pi): offizielles Paket von nodejs.org
  case "$(uname -m)" in x86_64) A=x64 ;; aarch64) A=arm64 ;; armv7l) A=armv7l ;; *) echo "Prozessor $(uname -m) wird nicht unterstützt."; exit 1 ;; esac
  F=$(curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt | grep -o "node-v22[^ ]*-linux-$A.tar.xz" | head -1)
  curl -fsSL "https://nodejs.org/dist/latest-v22.x/$F" | tar -xJ -C /usr/local --strip-components=1
  hash -r
  node_ok || { echo "Node.js 22 konnte nicht installiert werden."; exit 1; }
fi
NODE_BIN=$(command -v node)
if [ "$MODE" = caddy ] && ! command -v caddy >/dev/null; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi

echo "--- Programm installieren und verschleiern (auf dem Raspberry Pi dauert das ein paar Minuten)"
id stickstudio >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin stickstudio
mkdir -p "$APP" "$DATA" /var/backups/stickstudio
rsync -a --delete --exclude node_modules --exclude data --exclude .git --exclude dist --exclude desktop --exclude .github "$SRC/" "$APP/"
cd "$APP"
npm ci --no-audit --no-fund
npm run build
rm -rf node_modules tests tools docs fraesstudio/tests
# KI-Modell für „Foto → 3D-Relief“ (Depth Anything V2 Small, Apache-2.0, ca. 27 MB) – einmalig, bleibt bei Updates erhalten
MODEL_DIR=/var/lib/stickstudio-models
mkdir -p "$MODEL_DIR"
if [ ! -s "$MODEL_DIR/depth-anything-v2-small.onnx" ]; then
  echo "--- KI-Modell herunterladen"
  curl -fL --retry 3 -o "$MODEL_DIR/depth-anything-v2-small.onnx.part" \
    https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model_quantized.onnx \
    && mv "$MODEL_DIR/depth-anything-v2-small.onnx.part" "$MODEL_DIR/depth-anything-v2-small.onnx" \
    || { rm -f "$MODEL_DIR/depth-anything-v2-small.onnx.part"; echo "Hinweis: KI-Modell nicht geladen – FräsStudio lädt es dann beim ersten Gebrauch im Browser."; }
fi
if [ -s "$MODEL_DIR/depth-anything-v2-small.onnx" ]; then
  mkdir -p fraesstudio/models && ln -sf "$MODEL_DIR/depth-anything-v2-small.onnx" fraesstudio/models/depth-anything-v2-small.onnx
fi
# Signaturschlüssel für die Kauf-Lizenzen der Desktop-Programme: liegt deploy/license-signing.pem bei, wird er übernommen
# (passend zum öffentlichen Schlüssel in desktop/license-public.pem). Ohne Datei legt der Server beim ersten Start selbst einen an.
if [ -f "$SRC/deploy/license-signing.pem" ] && [ ! -f "$DATA/license-signing.pem" ]; then
  install -m 600 "$SRC/deploy/license-signing.pem" "$DATA/license-signing.pem"
  echo "Lizenz-Signaturschlüssel übernommen."
fi
rm -f "$APP/deploy/license-signing.pem"
chown -R stickstudio:stickstudio "$APP" "$DATA" /var/backups/stickstudio

echo "--- Einstellungen"
if [ -f "$ENVF" ]; then cp "$ENVF" "$ENVF.bak"; MARK=$(grep '^MARK_SECRET=' "$ENVF" | cut -d= -f2- || true); fi
MARK=${MARK:-$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 32)}
KEEP=""
[ -f "$ENVF.bak" ] && KEEP=$(grep -E '^(SMTP_|MAIL_FROM|LEMONSQUEEZY_|LICENSE_|REGISTRATION|EVENT_DAYS|GEOIP|CNC_)' "$ENVF.bak" || true)
cat > "$ENVF" <<ENV
#MODE=$MODE
#PROXY=$PROXY_KIND
PORT=$PORT
HOST=$HOST
BASE_URL=https://$DOMAIN
DATA_DIR=$DATA
NODE_ENV=production
TRUST_PROXY=1
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_PASSWORD=$ADMIN_PASSWORD
MARK_SECRET=$MARK
# Nur für dich und freigeschaltete Konten? Dann keine neuen Registrierungen zulassen:
#REGISTRATION=closed
# WLAN-Brücke zur Fräse (FräsStudio): Telnet zur Maschine im Heimnetz. Nur diese Maschine erlauben (empfohlen):
#CNC_HOST=192.168.1.50
# Brücke ganz abschalten (dann nur USB / WLAN direkt):
#CNC_BRIDGE=off
# E-Mail-Versand (später ausfüllen, dann: systemctl restart stickstudio)
#SMTP_HOST=
#SMTP_PORT=465
#SMTP_USER=
#SMTP_PASS=
#MAIL_FROM=noreply@$DOMAIN
# Bezahlung über Lemon Squeezy (später)
#LEMONSQUEEZY_SECRET=
#LEMONSQUEEZY_API_KEY=
# Kauf-Lizenzen der Desktop-Programme: Lemon-Squeezy-Varianten (Einmalkauf) den Programmen zuordnen
#LICENSE_VARIANTS=123456:laser,234567:fraes,345678:stick
# Update-Verlängerung (1 Jahr) je Programm und ihre Kauf-Links für die Erinnerungs-Mail
#LICENSE_RENEW_VARIANTS=111111:laser,222222:fraes,333333:stick
#LICENSE_RENEW_URLS="laser=https://… fraes=https://… stick=https://…"
$KEEP
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
ExecStart=$NODE_BIN --no-warnings server/server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=full
ReadWritePaths=$DATA /var/backups/stickstudio

[Install]
WantedBy=multi-user.target
UNIT

if [ "$MODE" = caddy ]; then
  cat > /etc/caddy/Caddyfile <<CADDY
$CADDY_MARK
$DOMAIN {
    encode gzip
    reverse_proxy 127.0.0.1:$PORT {
        flush_interval -1
    }
}
CADDY
fi

# tägliche Sicherung der Datenbank (14 Tage aufheben)
cat > /usr/local/bin/stickstudio-backup <<BAK
#!/bin/bash
set -e
F=/var/backups/stickstudio/stick-\$(date +%F).db
rm -f "\$F"
$NODE_BIN --no-warnings -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('$DATA/stickstudio.db');d.exec(\"VACUUM INTO '\"+process.argv[1]+\"'\");" "\$F"
find /var/backups/stickstudio -name 'stick-*.db' -mtime +14 -delete
BAK
chmod +x /usr/local/bin/stickstudio-backup
echo '30 3 * * * stickstudio /usr/local/bin/stickstudio-backup' > /etc/cron.d/stickstudio-backup

if [ "$MODE" = caddy ]; then
  # Firewall nur auf einem Rechner, der sonst nichts anbietet – auf einem Homeserver würde sie andere Dienste sperren
  if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
    ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
  else
    read -r -p "Firewall einschalten (nur SSH, HTTP, HTTPS erlauben)? Nur auf einem Server, der sonst nichts anbietet! [j/N]: " fw
    if [ "$fw" = j ] || [ "$fw" = J ]; then
      apt-get install -y ufw; ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw --force enable >/dev/null
    fi
  fi
fi

systemctl daemon-reload
systemctl enable --now stickstudio
systemctl restart stickstudio
[ "$MODE" = caddy ] && systemctl restart caddy
sleep 3
curl -fsS "http://127.0.0.1:$PORT/login" >/dev/null || { echo "Der Server antwortet nicht. Meldungen:  journalctl -u stickstudio -n 50 --no-pager"; exit 1; }

IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [ "$MODE" = proxy ]; then
  T=/root/stickstudio-proxy.txt
  {
    echo "StickStudio läuft auf Port $PORT. Jetzt im vorhandenen Reverse Proxy die Adresse $DOMAIN eintragen:"
    echo
    case "$PROXY_KIND" in
      npm|other)
        echo "Nginx Proxy Manager: Hosts → Proxy Hosts → Add Proxy Host"
        echo "  Domain Names:       $DOMAIN"
        echo "  Scheme/Forward:     http   $IP   Port $PORT"
        echo "  [x] Websockets Support   [x] Block Common Exploits"
        echo "  Reiter SSL:         Request a new SSL Certificate, [x] Force SSL, [x] HTTP/2"
        echo "  Reiter Advanced:    client_max_body_size 30m;"
        echo "                      proxy_buffering off;   (damit die WLAN-Brücke zur Fräse in Echtzeit läuft)"
        echo "                      proxy_read_timeout 3600s;"
        echo
        echo "Anderer Proxy: Ziel ist http://$IP:$PORT – Kopfzeilen Host und X-Forwarded-For weitergeben." ;;
      nginx)
        echo "Datei /etc/nginx/sites-available/stickstudio anlegen:"
        echo
        echo "server {"
        echo "    server_name $DOMAIN;"
        echo "    client_max_body_size 30m;"
        echo "    location / {"
        echo "        proxy_pass http://127.0.0.1:$PORT;"
        echo "        proxy_set_header Host \$host;"
        echo "        proxy_set_header X-Forwarded-For \$remote_addr;"
        echo "        proxy_set_header X-Forwarded-Host \$host;"
        echo "        proxy_set_header X-Forwarded-Proto \$scheme;"
        echo "        proxy_buffering off;          # WLAN-Brücke zur Fräse (Echtzeit-Datenstrom)"
        echo "        proxy_read_timeout 3600s;"
        echo "    }"
        echo "    listen 80;"
        echo "}"
        echo
        echo "Dann:  ln -s /etc/nginx/sites-available/stickstudio /etc/nginx/sites-enabled/ && nginx -t && systemctl reload nginx"
        echo "HTTPS: certbot --nginx -d $DOMAIN" ;;
      caddy)
        echo "In /etc/caddy/Caddyfile UNTEN anfügen (die Einträge für Nextcloud/Immich bleiben stehen):"
        echo
        echo "$DOMAIN {"
        echo "    encode gzip"
        echo "    reverse_proxy 127.0.0.1:$PORT {"
        echo "        flush_interval -1"
        echo "    }"
        echo "}"
        echo
        echo "Dann:  systemctl reload caddy   (HTTPS holt Caddy selbst)" ;;
      apache)
        echo "a2enmod proxy proxy_http headers"
        echo "Datei /etc/apache2/sites-available/stickstudio.conf anlegen:"
        echo
        echo "<VirtualHost *:80>"
        echo "    ServerName $DOMAIN"
        echo "    ProxyPreserveHost On"
        echo "    ProxyPass / http://127.0.0.1:$PORT/ flushpackets=on"
        echo "    ProxyPassReverse / http://127.0.0.1:$PORT/"
        echo "</VirtualHost>"
        echo
        echo "Dann:  a2ensite stickstudio && systemctl reload apache2"
        echo "HTTPS: certbot --apache -d $DOMAIN" ;;
    esac
    echo
    echo "DNS: $DOMAIN muss auf deinen Anschluss zeigen – am einfachsten als CNAME auf die Adresse,"
    echo "unter der Nextcloud/Immich schon erreichbar ist. Im Router ist nichts Neues nötig."
  } | tee "$T"
  echo
  echo "(Diese Anleitung steht auch in $T)"
fi

echo
echo "Fertig! Öffne: https://$DOMAIN"
echo "Verwaltung:   https://$DOMAIN/admin   (Login: $ADMIN_EMAIL)"
echo "FräsStudio:   https://$DOMAIN/fraesstudio/   (nur Admin und freigeschaltete Konten)"
echo "Das Passwort steht in $ENVF; nach dem ersten Login unter „Mein Konto“ ändern und die Zeile ADMIN_PASSWORD dort löschen."
echo "Sicherungen: täglich in /var/backups/stickstudio – zusätzlich auf einen anderen Rechner kopieren!"
