#!/bin/sh
# Baut die APK ohne Gradle mit den Android-Werkzeugen aus Ubuntu/Debian:
#   apt install openjdk-17-jdk android-sdk-build-tools android-sdk-platform-23 dalvik-exchange apksigner zipalign
# Signiert wird mit keystore/wf-launcher.jks (für Updates immer denselben Schlüssel verwenden).
set -e
cd "$(dirname "$0")"
SDK=${ANDROID_SDK:-/usr/lib/android-sdk}
tool() { ls "$SDK"/build-tools/*/"$1" 2>/dev/null | sort -V | tail -1; }
AAPT2=$(tool aapt2)
DX=$(tool dx)
ZIPALIGN=$(tool zipalign)
APKSIGNER=$(tool apksigner)
JAR="$SDK/platforms/android-23/android.jar"
OUT=build/apk
VERSION_CODE=5
VERSION_NAME=2.0
KS=keystore/wf-launcher.jks
KS_PASS=${KS_PASS:-wflauncher}

rm -rf "$OUT" && mkdir -p "$OUT/gen" "$OUT/classes" dist
rm -f dist/*.apk

echo "== Tests"
mkdir -p build/test
javac -nowarn -encoding UTF-8 -d build/test src/de/wunschfabrik/launcher/Search.java src/de/wunschfabrik/launcher/Logic.java \
    test/de/wunschfabrik/launcher/SearchTest.java test/de/wunschfabrik/launcher/LogicTest.java
java -cp build/test de.wunschfabrik.launcher.SearchTest
java -cp build/test de.wunschfabrik.launcher.LogicTest

echo "== Ressourcen"
"$AAPT2" compile --dir res -o "$OUT/res.zip"
# Zwei Varianten: normal (ohne Benachrichtigungs-Zugriff, lässt sich trotz Play Protect installieren)
# und voll (mit Benachrichtigungen im WF-Schnellbereich, Installation per ADB).
sed '/NOTIF-START/,/NOTIF-END/d' AndroidManifest.xml > "$OUT/AndroidManifest-normal.xml"
for V in normal voll; do
    M=AndroidManifest.xml; [ $V = normal ] && M="$OUT/AndroidManifest-normal.xml"
    "$AAPT2" link -I "$JAR" -A assets --manifest "$M" \
        --min-sdk-version 23 --target-sdk-version 34 \
        --version-code $VERSION_CODE --version-name $VERSION_NAME \
        --java "$OUT/gen" -o "$OUT/$V.unsigned.apk" "$OUT/res.zip"
done

echo "== Java"
# Stubs für neuere APIs (TileService) nur zum Kompilieren, kommen nicht in die APK.
mkdir -p "$OUT/stubs"
javac -nowarn -encoding UTF-8 -source 8 -target 8 -bootclasspath "$JAR" -Xlint:-options \
    -d "$OUT/stubs" $(find stubs -name '*.java')
javac -classpath "$OUT/stubs" -nowarn -encoding UTF-8 -source 8 -target 8 -bootclasspath "$JAR" -Xlint:-options \
    -d "$OUT/classes" $(find src "$OUT/gen" -name '*.java')

echo "== Dex"
"$DX" --dex --min-sdk-version=23 --output="$OUT/classes.dex" "$OUT/classes"
(cd "$OUT" && zip -q -j normal.unsigned.apk classes.dex && zip -q -j voll.unsigned.apk classes.dex)

echo "== Signieren"
if [ ! -f "$KS" ]; then
    mkdir -p keystore
    keytool -genkeypair -keystore "$KS" -storepass "$KS_PASS" -keypass "$KS_PASS" -alias wf \
        -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=WF Launcher, O=Privat, C=DE" >/dev/null 2>&1
fi
for V in normal voll; do
    NAME="dist/WF-Launcher-$VERSION_NAME.apk"; [ $V = voll ] && NAME="dist/WF-Launcher-$VERSION_NAME-voll.apk"
    "$ZIPALIGN" -f 4 "$OUT/$V.unsigned.apk" "$OUT/$V.aligned.apk"
    "$APKSIGNER" sign --ks "$KS" --ks-pass "pass:$KS_PASS" --key-pass "pass:$KS_PASS" \
        --min-sdk-version 23 --out "$NAME" "$OUT/$V.aligned.apk"
    "$APKSIGNER" verify "$NAME"
done
rm -f dist/*.idsig
ls -la dist/*.apk
