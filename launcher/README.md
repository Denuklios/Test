# WF Launcher (Android)

Startbildschirm-App im Stil der Wunsch-Fabrik: fast schwarzer Hintergrund mit violettem Schimmer,
Farben `#8B2BE2 / #A855F7 / #C9A0FF`, Schriften Cormorant Garamond (Uhr, Überschriften) und Outfit (Text),
WF-Logo als App-Symbol, unten eine Leiste mit dem runden violetten Knopf wie in der Auftrags-App.

Fertige APK: [`dist/WF-Launcher-1.0.apk`](dist/WF-Launcher-1.0.apk) – Android 6.0 oder neuer.

## Bedienung

| Was | Wie |
|---|---|
| Alle Apps | Violetten Knopf unten antippen oder nach oben wischen |
| Suchen | „Apps durchsuchen“ antippen; Enter startet den ersten Treffer, sonst Websuche. Findet auch Anfangsbuchstaben („gm“ → Google Maps) und Umlaute ohne Umlaut |
| Favoriten | Lange auf eine App tippen → „Zum Startbildschirm“. Die ersten 4 liegen in der Leiste unten, die übrigen darüber |
| Reihenfolge | Lange auf einen Favoriten → „Nach vorne“ / „Nach hinten“ |
| App-Menü | Umbenennen, in der App-Liste ausblenden, App-Info, Deinstallieren |
| Benachrichtigungen | Auf dem Startbildschirm nach unten wischen |
| Uhr / Datum | Antippen öffnet Wecker bzw. Kalender |
| Einstellungen | Lange auf eine freie Stelle tippen oder ⋮ in der App-Liste: Hintergrund (Wunsch-Fabrik oder eigenes Bild), Spalten, Symbolgröße, Uhr, App-Namen, ausgeblendete Apps |

Apps aus dem Arbeitsprofil werden mit Aktentaschen-Symbol angezeigt. Neu installierte oder gelöschte Apps
erscheinen bzw. verschwinden sofort.

## Installation

1. APK aufs Handy laden und öffnen, „Installation aus unbekannten Quellen“ erlauben.
2. Home-Taste drücken und „WF Launcher“ als Standard wählen – oder in der App unter
   Einstellungen → „Als Standard-Startbildschirm festlegen“.
3. Zurück zum alten Launcher: Android-Einstellungen → Apps → Standard-Apps → Startbildschirm-App.

## Selbst bauen

Ohne Gradle und ohne Google-SDK, nur mit Paketen aus Ubuntu/Debian:

```sh
sudo apt install openjdk-17-jdk android-sdk-build-tools android-sdk-platform-23 dalvik-exchange apksigner zipalign
./build.sh            # führt die Tests aus, Ergebnis: dist/WF-Launcher-1.0.apk
```

`keystore/wf-launcher.jks` ist der Signierschlüssel (Passwort `wflauncher`). Für Updates immer denselben
Schlüssel verwenden, sonst muss die App vorher deinstalliert werden.

Farben und Schriften stehen zentral in `src/de/wunschfabrik/launcher/WfStyle.java`.
Die Schriften stehen unter der SIL Open Font License (`assets/fonts/*-OFL.txt`).
