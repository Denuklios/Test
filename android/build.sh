#!/bin/sh
# Baut die Werkstatt-App (APK) ohne Gradle: aapt2 → javac → d8 → zipalign → apksigner.
# Ergebnis: ../auftraege/app/wunsch-fabrik-werkstatt.apk (+ version.json), wird mit der Auftrags-App hochgeladen.
# Version: hier und in www/mobile.js (APP_VERSION) gleich halten.
set -e
VERSION=1.0.0
CODE=1
cd "$(dirname "$0")"
SDK=${ANDROID_SDK:-/opt/android-sdk}
BT=$SDK/build-tools/35.0.0
JAR=$SDK/platforms/android-34/android.jar
B=build
grep -q "APP_VERSION = '$VERSION'" www/mobile.js || { echo "APP_VERSION in www/mobile.js passt nicht zu $VERSION"; exit 1; }

./prepare-www.sh
rm -rf $B/res $B/gen $B/classes $B/*.apk $B/*.zip $B/*.dex
mkdir -p $B/res/mipmap-xxhdpi $B/res/mipmap-xxxhdpi $B/gen $B/classes
cp -r res/values $B/res/
cp ../auftraege/icons/icon-192.png $B/res/mipmap-xxhdpi/ic_launcher.png
cp ../auftraege/icons/icon-512.png $B/res/mipmap-xxxhdpi/ic_launcher.png

# Ressourcen
$BT/aapt2 compile --dir $B/res -o $B/res.zip
$BT/aapt2 link -o $B/base.apk -I $JAR --manifest AndroidManifest.xml -A $B/assets --java $B/gen \
  --min-sdk-version 29 --target-sdk-version 34 --version-code $CODE --version-name $VERSION $B/res.zip

# Code
mkdir -p $B/gen/dk/wunschfabrik/werkstatt
printf 'package dk.wunschfabrik.werkstatt;\nfinal class BuildInfo { static final String VERSION = "%s"; }\n' "$VERSION" > $B/gen/dk/wunschfabrik/werkstatt/BuildInfo.java
javac -source 11 -target 11 -nowarn -Xlint:-options -classpath $JAR -d $B/classes $(find src $B/gen -name '*.java')
$BT/d8 --release --min-api 29 --lib $JAR --output $B $(find $B/classes -name '*.class')

# Packen, ausrichten, signieren
cp $B/base.apk $B/unsigned.apk
(cd $B && zip -q -j unsigned.apk classes.dex)
$BT/zipalign -f -p 4 $B/unsigned.apk $B/aligned.apk
KS=keystore/werkstatt.jks
if [ ! -f $KS ]; then
  mkdir -p keystore
  head -c 24 /dev/urandom | base64 | tr -d '/+=' > keystore/password.txt
  keytool -genkeypair -keystore $KS -alias werkstatt -keyalg RSA -keysize 3072 -validity 20000 \
    -storepass "$(cat keystore/password.txt)" -keypass "$(cat keystore/password.txt)" -dname "CN=Wunsch-Fabrik Werkstatt, O=Wunsch-Fabrik, C=DK" >/dev/null 2>&1
fi
PW=$(cat keystore/password.txt)
$BT/apksigner sign --ks $KS --ks-key-alias werkstatt --ks-pass "pass:$PW" --key-pass "pass:$PW" --out $B/werkstatt.apk $B/aligned.apk
$BT/apksigner verify $B/werkstatt.apk

mkdir -p ../auftraege/app
cp $B/werkstatt.apk ../auftraege/app/wunsch-fabrik-werkstatt.apk
printf '{"version":"%s","file":"wunsch-fabrik-werkstatt.apk"}\n' "$VERSION" > ../auftraege/app/version.json
ls -la ../auftraege/app/
