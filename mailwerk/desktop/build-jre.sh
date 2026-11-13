#!/bin/bash
# Schlanke Java-Laufzeiten (jlink) für Windows x64 und Windows ARM64 bauen – auf Linux, aus den Windows-JDK-Modulen.
# jlink muss genau dieselbe Version haben wie die Ziel-Module, daher überall Temurin 21.0.12.1+1.
set -euo pipefail
cd "$(dirname "$0")"
V="jdk-21.0.12.1+1"
C=build/jre-cache
mkdir -p "$C"
dl() { # os arch datei
  [ -s "$C/$3" ] || curl -sSL --retry 3 -o "$C/$3" "https://api.adoptium.net/v3/binary/version/${V/+/%2B}/$1/$2/jdk/hotspot/normal/eclipse"
}
dl linux x64 linux-x64.tar.gz
dl windows x64 windows-x64.zip
dl windows aarch64 windows-aarch64.zip
[ -d "$C/linux-x64" ] || { mkdir -p "$C/linux-x64" && tar -xzf "$C/linux-x64.tar.gz" -C "$C/linux-x64" --strip-components=1; }
for a in x64 aarch64; do
  [ -d "$C/windows-$a" ] || { mkdir -p "$C/windows-$a.tmp" && unzip -q "$C/windows-$a.zip" -d "$C/windows-$a.tmp" && mv "$C/windows-$a.tmp"/* "$C/windows-$a" && rmdir "$C/windows-$a.tmp"; }
done
# Was Mailwerk braucht: Oberfläche, TLS, Mail (SASL), Datenbank, XML (Server-Erkennung), JNA, deutsche/englische Datumsformate
MODS=java.base,java.desktop,java.sql,java.naming,java.logging,java.xml,java.prefs,java.management,java.security.sasl,java.net.http,jdk.crypto.ec,jdk.crypto.cryptoki,jdk.unsupported,jdk.charsets,jdk.localedata,jdk.zipfs,jdk.accessibility
# nur unter Windows vorhanden: Zugriff auf den Windows-Zertifikatsspeicher (Virenscanner, Firmennetze)
WINMODS=$MODS,jdk.crypto.mscapi
JLINK="$C/linux-x64/bin/jlink"
build() { # module-pfad ziel module
  rm -rf "$2"
  "$JLINK" --module-path "$1" --add-modules "$3" --include-locales=de,en --strip-java-debug-attributes --no-header-files --no-man-pages \
    --compress=zip-6 --output "$2"
}
build "$C/windows-x64/jmods" build/jre-windows-x64 "$WINMODS"
build "$C/windows-aarch64/jmods" build/jre-windows-aarch64 "$WINMODS"
build "$C/linux-x64/jmods" build/jre-linux-x64 "$MODS"   # nur zum Prüfen auf dem Bau-Rechner
du -sh build/jre-windows-x64 build/jre-windows-aarch64 build/jre-linux-x64
