#!/usr/bin/env bash
# FotoBox auf Ubuntu installieren/aktualisieren:  sudo bash install.sh
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Bitte mit sudo starten: sudo bash install.sh"; exit 1; }
cd "$(dirname "$0")"

PORT="${FOTOBOX_PORT:-8090}"
HOME_DIR="${FOTOBOX_HOME:-/srv/fotobox}"

command -v python3 >/dev/null || apt-get install -y python3

id fotobox >/dev/null 2>&1 || useradd --system --home "$HOME_DIR" --shell /usr/sbin/nologin fotobox
install -d -o fotobox -g fotobox -m 750 "$HOME_DIR" "$HOME_DIR/data"
install -d /opt/fotobox
install -m 755 fotobox.py /opt/fotobox/fotobox.py
install -m 644 web.html /opt/fotobox/web.html
install -d /opt/fotobox/assets
install -m 644 assets/* /opt/fotobox/assets/

cat > /etc/systemd/system/fotobox.service <<UNIT
[Unit]
Description=FotoBox Foto- und Datei-Server
After=network-online.target
Wants=network-online.target

[Service]
User=fotobox
Group=fotobox
Environment=FOTOBOX_HOME=$HOME_DIR
Environment=FOTOBOX_PORT=$PORT
ExecStart=/usr/bin/python3 /opt/fotobox/fotobox.py serve
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=$HOME_DIR
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT

# Kurzbefehl zum Verwalten der Benutzer
cat > /usr/local/bin/fotobox <<CLI
#!/bin/sh
exec sudo -u fotobox FOTOBOX_HOME=$HOME_DIR /usr/bin/python3 /opt/fotobox/fotobox.py "\$@"
CLI
chmod 755 /usr/local/bin/fotobox

systemctl daemon-reload
systemctl enable --now fotobox
systemctl restart fotobox

if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow from 192.168.0.0/16 to any port "$PORT" proto tcp comment FotoBox >/dev/null
  ufw allow from 10.0.0.0/8 to any port "$PORT" proto tcp comment FotoBox >/dev/null
  echo "Firewall: Port $PORT fürs Heimnetz freigegeben."
fi

IP=$(hostname -I | awk '{print $1}')
echo
echo "FotoBox läuft:  http://$IP:$PORT"
echo "Diese Adresse in der App eintragen."
echo
if [ ! -s "$HOME_DIR/users.json" ]; then
  echo "Jetzt den ersten Benutzer anlegen."
  read -rp "Benutzername: " NAME
  fotobox adduser "$NAME"
fi
echo
echo "Weitere Benutzer:  sudo fotobox adduser NAME"
