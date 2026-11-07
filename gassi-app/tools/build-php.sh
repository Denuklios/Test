#!/bin/bash
# Baut das Upload-Paket für einen PHP-Webspace (z. B. one.com) in den angegebenen Ordner.
# Aufruf: bash tools/build-php.sh <zielordner>
set -euo pipefail
OUT="${1:?Zielordner fehlt}"
mkdir -p "$OUT" && OUT="$(cd "$OUT" && pwd)"   # absolut machen, bevor wir den Ordner wechseln
cd "$(dirname "$0")/.."
rm -rf "$OUT"; mkdir -p "$OUT/daten"
cp -r public/. "$OUT/"
cp php/api.php php/.htaccess php/robots.txt "$OUT/"
printf 'Require all denied\nDeny from all\n' > "$OUT/daten/.htaccess"
# Android-App zum Herunterladen (wird mit android/build.sh gebaut)
if [ -f android/dist/version.json ]; then
  mkdir -p "$OUT/app"
  cp android/dist/gassirunde*.apk android/dist/version.json "$OUT/app/"
fi
# Testversion: nicht in Suchmaschinen aufnehmen
sed -i 's#<meta name="theme-color"#<meta name="robots" content="noindex, nofollow">\n  <meta name="theme-color"#' "$OUT/index.html"
grep -q 'name="robots"' "$OUT/index.html"
test -f "$OUT/api.php" && test -f "$OUT/data/demo-routes.json" && test -f "$OUT/js/app.js"
echo "Paket: $(find "$OUT" -type f | wc -l) Dateien, $(du -sh "$OUT" | cut -f1)"
