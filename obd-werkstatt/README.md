# OBD Werkstatt (Android)

Diagnose-App für ELM327-kompatible OBD-II-Adapter (Bluetooth klassisch, Bluetooth LE, WLAN).
Fertige APK: [`dist/OBD-Werkstatt-1.5.apk`](dist/OBD-Werkstatt-1.5.apk) – Android 6.0 oder neuer.

## Funktionen

| Bereich | Was geht |
|---|---|
| Fehlerspeicher | Gespeicherte (03), ausstehende (07) und permanente (0A) Fehler aller OBD-Steuergeräte, deutsche Klartexte, Löschen (04) |
| Steuergeräte | Scan per UDS/KWP2000 auf CAN (Motor, Getriebe, ABS/ESP, Airbag, Kombi …), Fehler lesen/löschen je Steuergerät, Identifikation (Teile-/SW-Nummer) |
| Live-Daten | Über 80 Messwerte (Modus 01), Kacheln mit Verlaufsgraph, CSV-Aufzeichnung |
| Freeze Frame | Umgebungsdaten zum Zeitpunkt des Fehlers (Modus 02) |
| Readiness | Prüfbereitschaft für AU/HU (Otto und Diesel) |
| Prüfergebnisse | Modus 06 mit Grenzwerten, z. B. Zündaussetzer je Zylinder, Lambdasonden, Kat |
| Fahrzeugdaten | FIN mit Hersteller/Modelljahr, Kalibrier-ID, CVN, km-Stand (falls unterstützt), Batteriespannung |
| Terminal | Beliebige AT- und OBD/UDS-Befehle senden |
| Werkzeuge | Fehlercode-Suche offline, Diagnosebericht teilen, Demo-Modus ohne Auto |

Grenzen: Funktionen, die nur Herstellertester können (Codierung, Anlernen, Service-Rückstellung,
Zugriff hinter gesicherten Gateways), sind mit einem ELM327 nicht allgemein umsetzbar.
Der Steuergeräte-Scan funktioniert nur bei CAN-Fahrzeugen (ca. ab 2008).

## Installation

1. APK aufs Handy laden und öffnen, „Installation aus unbekannten Quellen“ für den Browser/Dateimanager erlauben.
2. Klassischen Bluetooth-Adapter in den Android-Einstellungen koppeln (PIN meist `1234` oder `0000`).
   BLE-Adapter werden in der App über „Bluetooth LE“ gesucht.
3. Zündung an, App öffnen → Verbinden.

## Selbst bauen

Ohne Gradle und ohne Google-SDK, nur mit Paketen aus Ubuntu/Debian:

```sh
sudo apt install openjdk-17-jdk android-sdk-build-tools android-sdk-platform-23 apksigner zipalign
./build.sh            # Ergebnis: dist/OBD-Werkstatt-1.5.apk
```

`keystore/obd-werkstatt.jks` ist der Signierschlüssel (Passwort `obdwerkstatt`). Für Updates immer
denselben Schlüssel verwenden, sonst muss die App vorher deinstalliert werden.

Kernlogik testen (ohne Android, gegen den simulierten Adapter):

```sh
mkdir -p build/test && javac -d build/test $(find src/de/obdwerkstatt/core test -name '*.java')
java -cp build/test de.obdwerkstatt.CoreTest
```
