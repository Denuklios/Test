# Video-Studio: aus einer Idee ein fertiges Kurzvideo

Du gibst Claude eine Idee oder Frage. Claude recherchiert, schreibt das Skript, zeichnet
die Illustrationen, vertont, animiert und liefert MP4 (1080×1920), Cover und Post-Text.
Danach wird das Video über Metricool auf Instagram (und TikTok, sobald verbunden) geplant.

## Ablauf für Claude

1. **Thema recherchieren** (WebSearch), Fakten prüfen. Nichts Erfundenes.
2. **Ordner anlegen:** `videos/NNN-kurzname/` mit `bauen.py` (Vorlage: `videos/001-kraken/bauen.py`).
   - 5 bis 8 Szenen, 30 bis 60 Sekunden gesamt.
   - Szene 1 = Hook (überraschende Aussage in den ersten 2 Sekunden), letzte Szene = Aufruf zum Folgen.
   - Je Szene: `kopf` (kurze Überschrift, `<b>` = Akzentfarbe), `text` (Sprechtext), `bild` (SVG 900×900).
   - SVG-Animationen über Attribute: `data-a` (pop, fade, hoch, runter, links, rechts, wachsen, breit,
     dreh, federn, schweben, puls, wackeln, kreisen, draw), `data-d` Start in s, `data-l` Dauer in s.
     Mehrere Arten mit Leerzeichen kombinierbar. Keine Emojis im SVG (fehlende Schrift).
   **Bilder aus Canva (Standard, sieht hochwertiger aus):**
   - Je Szene `Canva generate-image` mit `aspectRatio: PORTRAIT_9_16`. Prompt auf Englisch, gleicher Stil
     in allen Szenen („bold clean vector illustration style, thick dark outlines, flat colors with soft
     shading, no text, vertical composition with empty space at top and bottom“), gleiche Figur beschreiben.
   - Die Bild-Jobs liefern nur Vorschaubilder. Volle Auflösung: `create-design` (Format „Instagram Story“,
     `references` = die Media-IDs in Reihenfolge, Brief: „exactly N pages, each one image full bleed, no text“),
     dann `export-design` als PNG 1080×1920 und die URLs nach `bilder/` herunterladen.
   - In der Szene `"foto": "bilder/xyz.png"` setzen; `bild` (SVG) bleibt leer oder legt Extras darüber.
   - Ohne Canva: SVG-Illustrationen selbst zeichnen (siehe `videos/001-kraken`).
3. **Bauen und rendern:**
   ```bash
   cd videos/NNN-kurzname
   python3 bauen.py
   python3 ../../engine/stimme.py .     # Stimme + Wort-Zeitstempel
   node ../../engine/render.js .         # MP4 + Cover
   ```
   Optional `musik.mp3` in den Ordner legen; sie wird leise darunter gemischt.
4. **Prüfen:** Einzelbilder mit ffmpeg herausziehen und ansehen.
5. **`post.txt`** schreiben (Text + Hashtags), Video und Cover an den Nutzer schicken.
6. **Veröffentlichen** über Metricool (`createScheduledPost`, Instagram-Typ REEL,
   `isAiGenerated: true`; TikTok mit `isAigc: true`). Das Video braucht eine öffentliche URL.

## Stimme

- Standard: kostenlose Microsoft-Edge-Stimme `de-DE-ConradNeural` (Python-Paket `edge-tts`).
- Mit ElevenLabs: `ELEVENLABS_API_KEY` setzen oder `"anbieter": "elevenlabs"` im Projekt.

## Voraussetzungen

`ffmpeg`, Python 3 mit `edge-tts`, Node.js mit Playwright/Chromium.
