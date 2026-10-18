#!/bin/bash
# RechnungsStudio starten – für Mac und Linux (Doppelklick)
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js ist nicht installiert. Bitte von https://nodejs.org die LTS-Version installieren und dann erneut starten."
  read -r -p "Enter zum Beenden"; exit 1
fi
echo "=== RechnungsStudio ==="
echo "Läuft unter http://localhost:8090 – zum Beenden dieses Fenster schließen (oder Strg+C)."
( sleep 2; (open "http://localhost:8090" || xdg-open "http://localhost:8090") >/dev/null 2>&1 ) &
exec node --no-warnings server.js
