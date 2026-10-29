# FräsStudio Desktop

Installierbare Version von FräsStudio (Electron). Enthält alles aus der Web-Version, dazu:
- **USB** mit Auswahldialog für den Anschluss (kein Browser-Popup, keine Chrome-Pflicht)
- **WLAN** über die eingebaute Telnet-Brücke (Port 23) – ohne eigenen Server
- läuft komplett offline (nur die KI-Tiefenschätzung lädt beim ersten Mal ihr Modell)
- beim Schließen während eines Auftrags: Rückfrage, danach Not-Aus

## Installieren
| System | Datei | Hinweis |
|---|---|---|
| Windows | `FraesStudio-…-win-x64.exe` (Installer) oder `…portable.exe` | Windows meldet ggf. „unbekannter Herausgeber" → *Weitere Informationen → Trotzdem ausführen*. CH340-Treiber für USB ggf. nötig. |
| macOS | `FraesStudio-…-mac-….dmg` | Erster Start: Rechtsklick → Öffnen (nicht signiert). |
| Linux | `…AppImage` (ausführbar machen) oder `.deb` | Für USB: `sudo usermod -aG dialout $USER`, neu anmelden. |

## Selbst bauen
```
cd fraesstudio-desktop
npm install
npm start            # ausprobieren
npm run dist:linux   # bzw. dist:win / dist:mac (je auf dem jeweiligen System)
```
Alle drei Systeme baut GitHub Actions: Workflow „FräsStudio Desktop" (Actions → Run workflow), Ergebnisse unter *Artifacts*.
