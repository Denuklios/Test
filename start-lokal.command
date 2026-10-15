#!/bin/bash
# StickStudio lokal starten (Online-Version mit Anmeldung und Verwaltung) – für Mac und Linux
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js ist nicht installiert. Bitte von https://nodejs.org die LTS-Version installieren (mindestens 22.13) und dann erneut starten."
  read -r -p "Enter zum Beenden"; exit 1
fi
if ! node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"; then
  echo "Deine Node.js-Version ist zu alt. Bitte die aktuelle LTS-Version installieren (mindestens 22.13)."
  read -r -p "Enter zum Beenden"; exit 1
fi
echo
echo "=== StickStudio lokal starten (Online-Version mit Anmeldung und Verwaltung) ==="
echo
read -r -p "Deine E-Mail (das wird dein Admin-Login): " ADMIN_EMAIL
read -r -s -p "Dein Passwort (mindestens 10 Zeichen): " ADMIN_PASSWORD; echo
export ADMIN_EMAIL ADMIN_PASSWORD PORT=8080 BASE_URL=http://localhost:8080 DATA_DIR="$PWD/data" GEOIP=off
echo
echo "Starte... Zum Beenden dieses Fenster schließen (oder Strg+C)."
echo "Verwaltung: http://localhost:8080/admin"
( sleep 2; (open "http://localhost:8080/login" || xdg-open "http://localhost:8080/login") >/dev/null 2>&1 ) &
exec node --no-warnings server/server.js
