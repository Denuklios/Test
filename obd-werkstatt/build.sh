#!/bin/sh
# Baut die APK ohne Gradle mit den Android-Werkzeugen aus Ubuntu/Debian:
#   apt install android-sdk-build-tools android-sdk-platform-23 apksigner zipalign
# Signiert wird mit keystore/obd-werkstatt.jks (für Updates immer denselben Schlüssel verwenden).
set -e
cd "$(dirname "$0")"
SDK=${ANDROID_SDK:-/usr/lib/android-sdk}
BT=$(ls -d "$SDK"/build-tools/* | sort -V | tail -1)
JAR="$SDK/platforms/android-23/android.jar"
OUT=build/apk
VERSION_CODE=7
VERSION_NAME=1.6
KS=keystore/obd-werkstatt.jks
KS_PASS=${KS_PASS:-obdwerkstatt}

rm -rf "$OUT" && mkdir -p "$OUT/gen" "$OUT/classes"

echo "== Ressourcen"
"$BT/aapt2" compile --dir res -o "$OUT/res.zip"
"$BT/aapt2" link -I "$JAR" --manifest AndroidManifest.xml \
    --min-sdk-version 23 --target-sdk-version 34 \
    --version-code $VERSION_CODE --version-name $VERSION_NAME \
    --java "$OUT/gen" -o "$OUT/app.unsigned.apk" "$OUT/res.zip"

echo "== Java"
javac -nowarn -encoding UTF-8 -source 8 -target 8 -bootclasspath "$JAR" -Xlint:-options \
    -d "$OUT/classes" $(find src "$OUT/gen" -name '*.java')

echo "== Dex"
"$BT/dx" --dex --min-sdk-version=23 --output="$OUT/classes.dex" "$OUT/classes"
(cd "$OUT" && zip -q -j app.unsigned.apk classes.dex)

echo "== Signieren"
if [ ! -f "$KS" ]; then
    mkdir -p keystore
    keytool -genkeypair -keystore "$KS" -storepass "$KS_PASS" -keypass "$KS_PASS" -alias obd \
        -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=OBD Werkstatt, O=Privat, C=DE" >/dev/null 2>&1
fi
"$BT/zipalign" -f 4 "$OUT/app.unsigned.apk" "$OUT/app.aligned.apk"
"$BT/apksigner" sign --ks "$KS" --ks-pass "pass:$KS_PASS" --key-pass "pass:$KS_PASS" \
    --min-sdk-version 23 --out "dist/OBD-Werkstatt-$VERSION_NAME.apk" "$OUT/app.aligned.apk"
rm -f dist/*.idsig
"$BT/apksigner" verify "dist/OBD-Werkstatt-$VERSION_NAME.apk"
ls -la "dist/OBD-Werkstatt-$VERSION_NAME.apk"
