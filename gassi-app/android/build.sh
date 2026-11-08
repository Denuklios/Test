#!/bin/sh
# Baut die Gassirunde-App (APK) ohne Gradle: aapt2 → javac → d8 → zipalign → apksigner.
# Ergebnis: dist/gassirunde.apk und dist/version.json (werden mit der Testversion auf den Server geladen).
# Neue Version: VERSION und CODE erhöhen.
set -e
VERSION=1.4.0
CODE=17
cd "$(dirname "$0")"
SDK=${ANDROID_SDK:-/opt/android-sdk}
BT=$SDK/build-tools/35.0.0
JAR=$SDK/platforms/android-34/android.jar
B=build
[ -f "$JAR" ] || { echo "Android SDK fehlt ($JAR). Siehe README."; exit 1; }

rm -rf $B && mkdir -p $B/res $B/gen $B/classes $B/assets/www $B/res/mipmap-xxhdpi $B/res/mipmap-xxxhdpi
cp -r res/* $B/res/

# Oberfläche aus ../public, Leaflet lokal statt aus dem Internet
cp -r ../public/. $B/assets/www/
mkdir -p $B/assets/www/vendor && cp vendor/leaflet/leaflet.js vendor/leaflet/leaflet.css $B/assets/www/vendor/
sed -i \
  -e 's#<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"[^>]*>#<link rel="stylesheet" href="vendor/leaflet.css">#' \
  -e 's#<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"[^>]*></script>#<script src="vendor/leaflet.js"></script>#' \
  -e 's#<link rel="manifest" href="manifest.webmanifest">##' \
  $B/assets/www/index.html
grep -q 'src="vendor/leaflet.js"' $B/assets/www/index.html || { echo "Leaflet-Einbindung in index.html nicht gefunden"; exit 1; }
grep -q 'href="vendor/leaflet.css"' $B/assets/www/index.html || { echo "Leaflet-CSS in index.html nicht gefunden"; exit 1; }

# App-Symbol (PNG aus public/icon.svg)
cp icons/ic_launcher_144.png $B/res/mipmap-xxhdpi/ic_launcher.png
cp icons/ic_launcher_192.png $B/res/mipmap-xxxhdpi/ic_launcher.png

# Ressourcen
$BT/aapt2 compile --dir $B/res -o $B/res.zip
$BT/aapt2 link -o $B/base.apk -I $JAR --manifest AndroidManifest.xml -A $B/assets --java $B/gen \
  --min-sdk-version 26 --target-sdk-version 34 --version-code $CODE --version-name $VERSION $B/res.zip

# Code
mkdir -p $B/gen/dk/wunschfabrik/gassirunde
printf 'package dk.wunschfabrik.gassirunde;\nfinal class BuildInfo { static final String VERSION = "%s"; }\n' "$VERSION" > $B/gen/dk/wunschfabrik/gassirunde/BuildInfo.java
javac -source 11 -target 11 -nowarn -Xlint:-options -encoding UTF-8 -classpath $JAR -d $B/classes $(find src $B/gen -name '*.java')
$BT/d8 --release --min-api 26 --lib $JAR --output $B $(find $B/classes -name '*.class')

# Packen, ausrichten, signieren
cp $B/base.apk $B/unsigned.apk
(cd $B && zip -q -j unsigned.apk classes.dex)
$BT/zipalign -f -p 4 $B/unsigned.apk $B/aligned.apk
KS=keystore/gassirunde.jks
if [ ! -f $KS ]; then
  mkdir -p keystore
  head -c 24 /dev/urandom | base64 | tr -d '/+=' > keystore/password.txt
  keytool -genkeypair -keystore $KS -alias gassirunde -keyalg RSA -keysize 3072 -validity 20000 \
    -storepass "$(cat keystore/password.txt)" -keypass "$(cat keystore/password.txt)" \
    -dname "CN=Gassirunde, O=Wunsch-Fabrik, C=DK" >/dev/null 2>&1
  echo "Neuer Signatur-Schlüssel in $KS – sicher aufbewahren, sonst sind keine Updates möglich."
fi
PW=$(cat keystore/password.txt)
$BT/apksigner sign --ks $KS --ks-key-alias gassirunde --ks-pass "pass:$PW" --key-pass "pass:$PW" --out $B/gassirunde.apk $B/aligned.apk
$BT/apksigner verify $B/gassirunde.apk

mkdir -p dist
cp $B/gassirunde.apk dist/gassirunde.apk
cp $B/gassirunde.apk "dist/gassirunde-$VERSION.apk"
printf '{"version":"%s","file":"gassirunde-%s.apk"}\n' "$VERSION" "$VERSION" > dist/version.json
ls -la dist/
