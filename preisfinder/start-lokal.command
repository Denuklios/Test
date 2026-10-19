#!/bin/bash
# Preisfinder auf dem eigenen Computer starten (Mac/Linux). Braucht Node.js 22 oder neuer.
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Bitte zuerst Node.js installieren: https://nodejs.org"; read -r; exit 1; }
(sleep 2; open http://localhost:8090 2>/dev/null || xdg-open http://localhost:8090 2>/dev/null) &
node --no-warnings server.js
