#!/usr/bin/env bash
# Baut die signierte Release-APK und legt sie nach build-output/dienstplan.apk
# Aufruf: ./build-apk.sh [https://deine-domain.de/dienstplan/]
set -euo pipefail
cd "$(dirname "$0")/app"

if [ ! -f android/key.properties ]; then
  echo "Fehlt: android/key.properties (Signier-Schlüssel, siehe README Abschnitt 4)" >&2
  exit 1
fi

ARGS=()
if [ -n "${1:-}" ]; then ARGS+=("--dart-define=DEFAULT_SERVER=$1"); fi

flutter pub get
flutter analyze
flutter test
flutter build apk --release "${ARGS[@]}"

mkdir -p ../build-output
cp build/app/outputs/flutter-apk/app-release.apk ../build-output/dienstplan.apk
echo "Fertig: $(cd .. && pwd)/build-output/dienstplan.apk"
