#!/bin/bash
# RechnungsStudio starten – für Mac und Linux (Doppelklick)
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js ist nicht installiert. Bitte von https://nodejs.org die LTS-Version installieren und dann erneut starten."
  read -r -p "Enter zum Beenden"; exit 1
fi
if [ ! -d node_modules/@anthropic-ai/sdk ]; then
  echo "Einmalige Einrichtung (Belegerkennung) ..."
  npm install --omit=dev --no-audit --no-fund || echo "Hinweis: Installation fehlgeschlagen – das Programm läuft trotzdem, nur ohne automatische Belegerkennung."
fi
echo "=== RechnungsStudio ==="
read -r -p "Handy-Zugang einschalten (Belege mit dem Handy im selben WLAN fotografieren)? [j/N] " HANDY
if [ "$HANDY" = "j" ] || [ "$HANDY" = "J" ]; then
  while [ ${#PASSWORD} -lt 6 ]; do read -r -s -p "Passwort für den Zugang (mind. 6 Zeichen, Benutzername beliebig): " PASSWORD; echo; done
  export HOST=0.0.0.0 PASSWORD
  echo "Die Adresse fürs Handy steht im Programm unter Einstellungen (mit QR-Code)."
fi
echo "Läuft unter http://localhost:8090 – zum Beenden dieses Fenster schließen (oder Strg+C)."
( sleep 2; (open "http://localhost:8090" || xdg-open "http://localhost:8090") >/dev/null 2>&1 ) &
exec node --no-warnings server.js
