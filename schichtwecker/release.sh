#!/bin/bash
# Baut die APK und legt sie mit version.json in server/ (GitHub lädt sie nach
# www.wunsch-fabrik.dk/kalender/schichtwecker/, wenn der Commit „[hochladen]“ enthält).
# Aufruf: ./release.sh "Was ist neu"
set -e
cd "$(dirname "$0")"
gradle assembleRelease --no-daemon -q
cp app/build/outputs/apk/release/app-release.apk server/schichtwecker.apk
CODE=$(grep -o 'versionCode = [0-9]*' app/build.gradle.kts | grep -o '[0-9]*')
NAME=$(grep -o 'versionName = "[^"]*"' app/build.gradle.kts | cut -d'"' -f2)
python3 - "$CODE" "$NAME" "${1:-}" <<'PY'
import json, sys
json.dump({"versionCode": int(sys.argv[1]), "version": sys.argv[2], "file": "schichtwecker.apk", "notes": sys.argv[3]},
          open("server/version.json", "w"), ensure_ascii=False)
PY
echo "Version $NAME ($CODE) bereit in server/"
