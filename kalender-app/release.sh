#!/bin/bash
# Baut die APK und legt sie mit version.json in server/app/ (wird per GitHub auf den Webspace geladen).
# Aufruf: ./release.sh "Was ist neu"
set -e
cd "$(dirname "$0")"
VERSION=$(grep '^version:' app/pubspec.yaml | sed 's/version: *//; s/+.*//')
(cd app && flutter build apk --release --target-platform android-arm64)
cp app/build/app/outputs/flutter-apk/app-release.apk server/app/familienkalender.apk
python3 - "$VERSION" "${1:-}" <<'PY'
import json, sys
json.dump({"version": sys.argv[1], "file": "familienkalender.apk", "notes": sys.argv[2]},
          open("server/app/version.json", "w"), ensure_ascii=False)
PY
echo "Version $VERSION bereit in server/app/"
