# Kamera Pro – Android-App (APK)

Kamera-App mit Zeitlupe, Zeitraffer, Video mit Auto-Einstellungen, Profi-Modus, Panorama, 360°, kompletter 360°-Kugel,
QR-Leser, Live-Effekten, Live-Retusche, „Punkt fixieren“ beim Filmen und nachträglicher Bearbeitung (Gegenstände entfernen).
Alles läuft auf dem Handy, ohne Internet.

## Installieren

`KameraPro-1.0.apk` aufs Handy laden → antippen → „Installieren“ (beim ersten Mal Installation aus dieser Quelle erlauben).
Beim Start Kamera erlauben; beim ersten Video auch das Mikrofon. Aufnahmen landen in der Handy-Galerie unter **DCIM/Kamera Pro**.

## Modi (unten wischen oder antippen)

| Modus | Was passiert |
|---|---|
| **Zeitraffer** | Intervall ½ / 1 / 2 / 5 / 10 s wählen. Fertige MP4 mit 30 Bildern/s. Pausieren möglich. |
| **Zeitlupe** | 2× / 4× / 8× langsamer. Nutzt die höchste Bildrate, die das Handy der App gibt; fehlende Zwischenbilder werden überblendet. |
| **Video** | Ton, Pause, Auto-Fokus/Belichtung/Weißabgleich laufend; „Auto-Look“ optimiert Licht & Farbe live. |
| **🎯 Punkt fixieren** | In Video/Zeitlupe/Zeitraffer: „Punkt fixieren“ → Punkt antippen. Der Punkt wird verfolgt und bleibt in der Bildmitte, auch wenn die Kamera leicht bewegt wird. „Zoom 1,4×“ antippen für mehr Spielraum (1,2 – 2,5×). |
| **Foto** | Blitz (aus/auto/an/Dauerlicht), Selbstauslöser 3/10 s, Format 4:3 / 1:1 / 16:9. |
| **Profi** | ISO, Verschlusszeit, Belichtung ±, Weißabgleich (Kelvin), manueller Fokus – soweit das Handy sie freigibt – plus Bildregler (Kontrast, Lichter, Schatten, Klarheit …), Fokus-Peaking, Zebra, Histogramm. |
| **Panorama** | Auslöser, langsam zur Seite schwenken, erneut drücken (oder automatisch am Ende). |
| **360°** | Einmal im Kreis drehen → Rundum-Panorama, wird als 360°-Foto gekennzeichnet. |
| **Kugel 360°** | Komplette Kugel in Reihen **von oben nach unten**: Zenit → oben → Horizont → unten → Boden. Punkt in den Kreis bringen, ruhig halten – die App löst selbst aus. „Zurück“ löscht das letzte Bild, „Fertig“ setzt zusammen. Genauigkeit: Schnell / Normal / Fein. Ergebnis ist ein echtes 360°-Foto (Google Fotos & Co. erkennen es). |
| **QR-Code** | QR- und Barcodes (auch WLAN, Kontakte, Links, GiroCode). Öffnen, kopieren, teilen. |

Oben: **😊 Live-Retusche** (Haut glätten/aufhellen, Details schärfen – Bild ist sofort fertig), **🎨 Effekte** (26 live-Effekte, jeder mit eigenen Reglern),
**Zauberstab** = Auto-Look. Zwei Finger = Zoom, Tippen = Fokus, lange drücken = Fokus/Belichtung sperren, Lautstärketasten = Auslöser.
Hält man das Handy quer, werden Fotos und Videos automatisch richtig gedreht.

## Nachträglich bearbeiten

Galerie (Vorschaubild links unten) → Foto → **Bearbeiten**:
**Entfernen** (über Gegenstände malen → „Entfernen“, die Stelle wird mit passender Umgebung gefüllt), **Retusche**, **Anpassen**,
**Effekte**, **Auto**, **Drehen/Begradigen**, Vorher/Nachher, Rückgängig. Gespeichert wird als neues Foto, das Original bleibt.

## Grenzen (ehrlich)

- Die App läuft über das Android-System-WebView. Echte 120/240-Bilder/s-Zeitlupe des Herstellers ist Apps dort meist nicht zugänglich – die App nimmt die höchste freigegebene Rate (oft 30 oder 60) und rechnet Zwischenbilder.
- Welche Profi-Regler erscheinen, hängt vom Handy ab.
- Die Kugel wird über den Lagesensor ausgerichtet; der Blickwinkel der Kamera wird beim Schwenken automatisch gemessen. Kleine Kanten an Übergängen sind möglich.

## Selbst bauen

```bash
cd kamera/android-app
npm ci
npm run sync
cd android && ./gradlew assembleRelease   # → app/build/outputs/apk/release/app-release.apk
```
Signiert mit `android/debug-kamera.keystore`, damit spätere Versionen als Update installiert werden können.
Am PC ausprobieren: Ordner `kamera/` über einen lokalen Webserver öffnen (Kamera braucht localhost oder https).
