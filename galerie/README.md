# Fotogalerie – Android-App (APK)

Galerie-App für Android mit Gesichtserkennung, smarter Suche und vielen lustigen Extras.
**Alles läuft auf dem Handy:** Die KI-Modelle stecken in der App. Es wird nichts hochgeladen, und die App braucht kein Internet.

## Installieren

1. `Fotogalerie.apk` aufs Handy laden (siehe unten, woher).
2. Antippen → „Installieren“. Beim ersten Mal fragt Android, ob Apps aus dieser Quelle installiert werden dürfen → erlauben.
3. App öffnen → **„Fotos vom Handy anzeigen“** → Zugriff auf Fotos erlauben.

Die Fotos werden nicht kopiert, die App zeigt sie direkt an. Neue Fotos erscheinen automatisch, sobald du die App öffnest.
Die erste Analyse (Gesichter + Motive) läuft im Hintergrund und dauert bei vielen Fotos eine Weile – oben steht der Fortschritt.

**Woher kommt die APK?** Bei jeder Änderung im Ordner `galerie/` baut GitHub die App automatisch:
GitHub → **Actions** → „Fotogalerie APK“ → letzter Lauf → unten bei *Artifacts* **Fotogalerie-APK** herunterladen (ZIP, darin die APK).

## Was die App kann

| Bereich | Funktionen |
|---|---|
| **Fotos** | Zeitleiste nach Monaten, „Erinnerungen“ (heute vor X Jahren, Favoriten, mit Person …), Zoom der Rasteransicht, Mehrfachauswahl (lange drücken) |
| **Betrachter** | Wischen, Doppeltipp/Zwei-Finger-Zoom, Favorit ♥, Infos, erkannte Personen & Motive, **ähnliche Fotos**, Teilen |
| **Personen** | Gesichter werden automatisch zu Personen gruppiert. Name geben, zusammenführen, falsche Gesichter entfernen, Diashow pro Person |
| **Suche** | Motive: *Auto, Haus, Pflanzen, Hund, Strand, Berge, Essen, Sonnenuntergang …* (auch frei: „rotes Auto“, „Hund am Strand“). Dazu Personen („Anna Strand“), Jahre („2023“), Monate/Jahreszeiten („Sommer“), Gefühle („lachen“), Farben, „Favoriten“ |
| **✂️ Ausschneiden** | Im Foto **lange auf ein Ding drücken** → die KI markiert es → *Größer/Kleiner*, Stellen dazunehmen/wegnehmen → **als Sticker speichern** (mit weißem Rand, transparent) → teilen (z. B. WhatsApp) oder auf andere Fotos kleben |
| **Spaß** | Foto-Mosaik aus deinen Fotos · 3D-Karussell (Ring, Spirale, Kugel) · Sticker-Studio (Wackelaugen, Partyhut, Krone, Schnurrbart, Sonnenbrille, Hasenohren, eigene Sticker + Filter wie Comic, Glitch, Kaleidoskop) · Kino-Diashow · Polaroid-Wand · Regenbogen-Sortierung · „Wer ist das?“-Quiz · Doppelgänger-Finder · Lach-Parade · Schiebepuzzle · Zeitmaschine (Handy schütteln!) |

„Löschen“ in der App blendet ein Foto nur aus – auf dem Handy bleibt es erhalten (Einstellungen → „Handy-Fotos neu einlesen“ holt ausgeblendete zurück).
Gespeicherte Mosaike/Sticker-Bilder landen in der Handy-Galerie unter *Bilder/Fotogalerie*.

## Technik (für Entwickler)

- Oberfläche: HTML/CSS/JavaScript ohne Framework (`index.html`, `css/`, `js/`), verpackt mit [Capacitor](https://capacitorjs.com) in `android-app/`.
- Gesichter: face-api (SSD MobileNet, 68 Landmarken, 128-D-Merkmale, Mimik); Gruppierung über Abstand < 0,45, nie zwei Gesichter desselben Fotos zur selben Person.
- Motive & freie Suche: MobileCLIP-S0 (Bild fp16, Text 8-Bit – das 8-Bit-Bildmodell liefert unbrauchbare Ergebnisse). Deutsche Suchwörter werden über ein Wörterbuch ins Englische übertragen (`js/search.js`).
- Ausschneiden: SlimSAM (Segment Anything, 8-Bit) im Web-Worker.
- Handy-Fotos: eigenes Android-Modul `DeviceGalleryPlugin.java` (MediaStore-Liste, Speichern in die Galerie, Teilen).
- Daten (Vorschaubilder, Gesichter, Namen, Sticker) liegen in IndexedDB der App.

### APK selbst bauen

Voraussetzungen: Node.js 22, JDK 21, Android SDK (Plattform 36).

```bash
cd galerie/android-app
npm ci
npm run sync              # kopiert die App nach www/ und lädt die KI-Modelle (~118 MB, einmalig in .cache/)
cd android && ./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
```

Die APK ist mit dem Schlüssel `android-app/android/debug-fotogalerie.keystore` signiert, damit neue Versionen als Update installiert werden können (gespeicherte Namen bleiben erhalten). Für eine Veröffentlichung im Play Store einen eigenen, geheimen Schlüssel verwenden.

Zum schnellen Ausprobieren am PC: `node galerie/serve.js` → http://localhost:8090 (lädt die Modelle dann aus dem Internet).
