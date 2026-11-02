#!/bin/sh
# Baut den Inhalt der App-Oberfläche: eigene Dateien + gemeinsame Teile aus der Web-Version (Aussehen, Texte, Beleg-Zuschnitt).
set -e
cd "$(dirname "$0")"
OUT=build/assets/www
rm -rf build/assets && mkdir -p "$OUT"
cp www/index.html www/mobile.js www/mobile.css "$OUT/"
cp ../auftraege/assets/app.css ../auftraege/assets/i18n.js ../auftraege/assets/logo.png "$OUT/"
cp -r ../auftraege/assets/fonts "$OUT/fonts"
node -e '
const s = require("fs").readFileSync("../auftraege/assets/app.js", "utf8");
const cut = (a, b) => { const i = s.indexOf(a), j = s.indexOf(b, i); if (i < 0 || j < 0) throw new Error("Funktion nicht gefunden: " + a); return s.slice(i, j); };
const prep = cut("async function prepImage", "// Belegfoto:");
const crop = cut("async function cropReceipt", "async function uploadFiles");
require("fs").writeFileSync(process.argv[1], "/* aus auftraege/assets/app.js übernommen */\n(() => {\n" + prep + crop + "window.prepImage = prepImage; window.cropReceipt = cropReceipt;\n})();\n");
' "$OUT/crop.js"
echo "www fertig: $(ls $OUT | tr '\n' ' ')"
