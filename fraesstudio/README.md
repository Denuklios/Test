# FräsStudio – CAD + CAM + Fräsen in einem Programm

Zeichnen, Fräsbahnen berechnen, in 3D prüfen und direkt fräsen – im Browser, ohne Installation, auch offline.
Abgestimmt auf die **Twotrees TTC450** (GRBL, DLC32-Steuerung, 460 × 460 × 80 mm), funktioniert aber mit jeder GRBL-Fräse.

Vorbilder: die einfache Bedienung von **Easel**, der Funktionsumfang von **Carbide Create / VCarve** (2D, 2.5D, V-Carving, 3D-Relief).

## Starten

`index.html` doppelklicken – am besten in **Google Chrome** oder **Microsoft Edge** (nur diese können die Fräse per USB steuern).
Es wird nichts installiert, eine Internetverbindung ist nicht nötig. Das Projekt wird automatisch im Browser zwischengespeichert.

**Online mit Passwort:** Auf dem StickStudio-Server liegt FräsStudio unter `/fraesstudio/` und ist nur nach Anmeldung und Freischaltung durch den Admin erreichbar (siehe `server/README.md`, Abschnitt „FräsStudio“).
Bitte FräsStudio **nicht** auf einen normalen Webspace ohne diesen Server legen. Dort wäre es für jeden offen, und ein Passwort nur in der Seite selbst lässt sich umgehen.

## Die vier Arbeitsschritte

| Schritt | Was passiert |
|---|---|
| **1 Entwerfen** | Werkstück (Größe, Stärke, Material, Nullpunkt) einrichten, zeichnen, Text setzen, SVG/DXF/Bilder/STL importieren |
| **2 Fräsbahnen** | Objekte anklicken → Bearbeitung wählen: Kontur, Tasche, V-Carving, Gravieren, Bohren, Planfräsen, 3D schruppen/schlichten |
| **3 3D-Vorschau** | Materialabtrag simulieren, Laufzeit sehen, Warnungen (z. B. Eilgang im Material) |
| **4 Fräsen** | TTC450 per USB verbinden, verfahren, Nullpunkt setzen, Z antasten, Auftrag starten/pausieren, Vorschub/Drehzahl anpassen |

## Funktionen

**Zeichnen:** Linie/Kurve (Linksklick Ecke, Rechtsklick Kurve – wie in StickStudio), Rechteck mit Eckenradius, Kreis/Ellipse, Vieleck, Stern, Text mit 9 Schriften, Messen.
Punkte bearbeiten, Raster- und Objektfang, Verschieben/Skalieren/Drehen mit Griffen oder Zahlen, Spiegeln, Ausrichten, Vereinen/Abziehen/Schnittmenge, Versatz, Mehrfach anordnen, Kopieren/Einfügen, Rückgängig.

**Import:** SVG, DXF (Linien, Bögen, Polylinien mit Bögen, Kreise, Ellipsen, Splines – lose Linien werden automatisch zu geschlossenen Formen verbunden), Bild nachzeichnen (PNG/JPG → Umriss), Höhenbild → 3D-Relief, STL → 3D-Relief.

**Fräsbahnen:**
- **Kontur** außen/innen/auf Linie, Gleich-/Gegenlauf, mehrere Zustellungen, **Haltestege**, **Rampe** statt senkrechtem Eintauchen, Aufmaß + Schlichtgang
- **Tasche** konturparallel oder in Zeilen, Inseln (z. B. das Innere eines „O“) bleiben stehen
- **V-Carving** mit echter Tiefenberechnung (scharfe Ecken bei Schrift), optional Maximaltiefe + Ausräumen flacher Böden mit Schaftfräser
- **Gravieren** genau auf der Linie (auch offene Linien)
- **Bohren** mit Bohrer (Entspänen) oder Helix-Fräsen mit Schaftfräser
- **Planfräsen** der ganzen Oberfläche (Opferplatte ebnen)
- **3D-Relief schruppen** (Ebenen mit Aufmaß) und **schlichten** (Kugelfräser, Zeilen in X, Y oder beiden)

**Werkzeugbibliothek** mit Schaft-, Kugel-, V-Fräsern und Bohrern; **Material** (Weich-/Hartholz, MDF, Sperrholz, Acryl, PVC, HDPE, Leiterplatte, Alu, Messing) passt Vorschub und Zustellung an.

**G-Code** (GRBL): eine Datei mit Werkzeugwechsel-Pause (M0) oder je Werkzeug eine Datei (für SD-Karte/Candle). Nullpunkt an 9 Stellen wählbar, Z auf Material- oder Tischoberfläche.

**Maschine:** Web Serial (115200 Baud), Statusanzeige, Positionsanzeige, Verfahren per Knopf und Tastatur (Pfeile, Bild↑/↓), Nullpunkt setzen, Z antasten mit Messplatte, Referenzfahrt, Entsperren, Spindel, Vorschub- und Drehzahl-Override, Konsole.
Beim Werkzeugwechsel hält FräsStudio an, die Maschine bleibt bedienbar (verfahren, neu antasten), dann geht es mit „Weiter fräsen“ weiter.

## Schwarz-Weiß-Bild → 3D (wie in LightBurn)

Knopf **„Bild → 3D“** links, *Datei → 3D-Relief aus Bild* oder einfach ein Bild auf das Fenster ziehen.
**Schwarz wird am tiefsten gefräst, Grautöne liegen dazwischen, Weiß bleibt flach auf der Oberfläche.** Durchsichtige Bereiche zählen als weiß.
Im Dialog: Breite/Höhe, Tiefe (für Schwarz), Regler für die Grautöne (höher/tiefer), Glätten, Umkehren – mit 3D-Vorschau.
Auf Wunsch werden die Fräsbahnen gleich angelegt (Schaftfräser schruppen, Kugelfräser schlichten).

## Foto oder Render → 3D (KI-Tiefenschätzung)

Bei normalen Fotos und gerenderten Bildern stimmt „hell = hoch“ nicht, denn Licht und Schatten würden mitgefräst.
Im Dialog „Bild → 3D“ deshalb die Bildart **„Foto oder Render – KI schätzt die Tiefe“** wählen. Die KI (Depth Anything V2 Small) erkennt, was vorne und hinten ist, und macht daraus eine Höhenkarte.

- **„Feine Details aus dem Bild“** legt Strukturen wie Haare, Fell oder Holzschnitzerei aus der Helligkeit obendrauf.
- **Modell:** Das KI-Modell (ca. 27 MB) wird einmal geladen und im Browser gespeichert, danach geht es auch ohne Internet. Auf dem eigenen Server lädt es `deploy/install.sh` gleich mit herunter.
- **Ohne Internet:** `model_quantized.onnx` von [HuggingFace](https://huggingface.co/onnx-community/depth-anything-v2-small/tree/main/onnx) laden und im Dialog mit „Modelldatei wählen…“ öffnen.
- **Grenzen:** Die KI schätzt nur. Gekaufte STL-Dateien bzw. Höhenkarten sind genauer. Bei fremden Motiven (Wasserzeichen!) das Urheberrecht beachten: das Motiv bzw. die Datei beim Anbieter kaufen.

## Feine Reliefs: konische Kugelfräser und Restmaterial

- In der Werkzeugbibliothek gibt es **konische Kugelfräser** (R0,25 / R0,5 / R0,75 mit 3,175-mm-Schaft): Sie sind vorne sehr fein und hinten trotzdem stabil.
- **„3D Rest“** (Restmaterial) arbeitet nach dem Schlichten nur die Stellen nach, an die der dicke Fräser nicht kam, zum Beispiel enge Rillen, Haare oder Augen. Als „Vorheriges Werkzeug“ das Schlicht-Werkzeug angeben. Das spart gegenüber komplettem Feinschlichten oft Stunden.
- **Typische Reihenfolge:** 3D schruppen (Schaftfräser 3,175) → 3D schlichten (Kugelfräser 3,175) → 3D Rest (konischer Kugelfräser R0,25).

## Kamera von oben

Eine USB-Webcam fest über der Fräse montieren. Knopf **„Kamera“** → im Livebild die 4 Ecken des eingespannten Werkstücks anklicken
(links unten, rechts unten, rechts oben, links oben). Das Bild wird entzerrt und liegt danach unter der Zeichnung – so lassen sich Motive genau auf das echte Material
(Maserung, vorhandene Bohrungen, ein schon bearbeitetes Teil) setzen. Live-Bild oder Standbild, Deckkraft und Linsenkorrektur einstellbar, Taste **C** blendet ein/aus.
Die Einstellung bleibt gespeichert; nach dem Wechsel des Werkstücks die Ecken neu anklicken.

## Größere Spindel (500 W / 800 W)

Unter **Bearbeiten → Maschine…** das passende Profil wählen:

| Profil | Drehzahl | Wirkung in FräsStudio |
|---|---|---|
| TTC450 80 W (Standard) | 8.000 U/min, per Programm | Werkzeugwerte wie in der Bibliothek |
| TTC450 500 W | bis 12.000 U/min, per Programm | Zustellung ca. ×2, Vorschub ×1,4 |
| TTC450 800 W (Twotrees-Fräsmotor-Satz) | 10.000–30.000 U/min am **Drehregler** (6 Stufen) | Zustellung ca. ×2,5 (höchstens 1× Fräserdurchmesser), Vorschub ×1,5, Drehzahl je nach Fräser |

Beim 800-W-Motor schaltet FräsStudio den Motor nur ein und aus. Die passende **Reglerstufe** steht bei jeder Fräsbahn, in der Start-Checkliste, im G-Code und beim Werkzeugwechsel.
Der Vorschub bleibt auf den Höchstwert der Achsen (1000 mm/min) begrenzt. Der Gewinn kommt vor allem von den tieferen Zustellungen, im Beispielschild etwa 11 statt 32 Minuten.
Leistung, Drehzahlbereich und Stufen lassen sich auch für eigene Spindeln eintragen.

## Ziehen und Ablegen

Bilder, SVG, DXF, STL, G-Code und Projekte können direkt auf die Zeichenfläche gezogen werden.

## Tastatur

| Taste | Wirkung |
|---|---|
| V R L Q K P S T M | Auswahl, Umformen, Linie, Rechteck, Kreis, Vieleck, Stern, Text, Messen |
| Enter / Rücktaste / Esc | Linie fertig / letzten Punkt weg / abbrechen |
| Leertaste halten | Ansicht verschieben (Maus bewegen oder ziehen); beim Umformen mit gewähltem Punkt: Ecke ↔ Kurve |
| Zwei Finger / Mausrad | Ansicht verschieben; Finger spreizen oder Strg + Rad = Zoom (im Menü Ansicht auf „Rad = Zoom“ umstellbar) |
| Pfeiltasten | Objekte verschieben (Umschalt 10 mm, Alt 0,1 mm); im Schritt 4: Maschine verfahren |
| 1 2 3 4 | Arbeitsschritt wechseln |
| ↶ ↷ (oben in der Leiste) | Rückgängig / Wiederholen, auch Strg+Z / Strg+Y |
| 3D-Vorschau | Links ziehen = drehen · Leertaste halten, zwei Finger, rechte Maustaste oder Pfeiltasten = verschieben · Spreizen / Strg + Rad = zoomen · Knöpfe unten rechts |
| F, G, C | Alles zeigen, Raster fangen, Kamerabild ein/aus |
| Strg+Z / Y / C / V / D / A / S / O / E / I | Rückgängig, Wiederholen, Kopieren, Einfügen, Duplizieren, Alles, Speichern, Öffnen, G-Code, Import |

## Erste Schritte mit der TTC450

1. **Neues Projekt** → Werkstückgröße und Material eingeben, Nullpunkt „links unten“, Z „Materialoberfläche“.
2. Zeichnen oder importieren, Objekte auswählen → **Fräsbahnen** → z. B. „Kontur“ (Ausschneiden, Haltestege an) oder „V-Carving“ (Schrift).
3. **3D-Vorschau** prüfen.
4. **Fräsen** → „Verbinden (USB)“ → Fräser mit den Pfeilen über die linke untere Ecke des Werkstücks fahren → „X0“, „Y0“ → Z antasten (oder mit Papier, dann „Z0“) → „Aktuelles Projekt laden“ → **Start**.

Ohne USB: **Datei → G-Code speichern**, „je Werkzeug eine Datei“, auf die SD-Karte kopieren und am Display der TTC450 starten.

Wenn die Maschine beim Verbinden nicht in der Liste erscheint: CH340-USB-Treiber installieren und Candle/LaserGRBL schließen (nur ein Programm darf den Anschluss nutzen).

## Dateien

| Endung | Inhalt |
|---|---|
| `.fsp` | FräsStudio-Projekt (Zeichnung, Fräsbahnen, Werkzeuge, Werkstück) |
| `.nc` / `.gcode` / `.tap` | G-Code für GRBL |
| `.svg` | Zeichnung exportieren (für andere Programme) |

## Technik

Reines HTML/JavaScript ohne Build-Schritt. Polygon-Versatz und Boolesche Operationen: [Clipper](http://www.angusj.com) (Boost Software License, `js/lib/clipper.js`).
Schriften: SIL Open Font License (`js/lib/LIZENZEN.txt`). 3D-Darstellung mit WebGL2.

| Datei | Aufgabe |
|---|---|
| `js/core.js` | Geometrie, Kurven, Matrizen, Polygon-Verrechnung |
| `js/shapes.js` | Zeichenobjekte |
| `js/ttf.js` | TrueType-Schriften → Umrisse |
| `js/importers.js` | SVG, DXF, STL, Bilder |
| `js/tools.js` | Werkzeuge, Materialien, Maschinenprofile |
| `js/cam.js` | Fräsbahnen |
| `js/gcode.js` | G-Code schreiben und lesen |
| `js/sim.js`, `js/view3d.js` | Abtrag-Simulation und 3D-Ansicht |
| `js/camera.js` | Kamerabild entzerren |
| `js/depthai.js`, `js/lib/ort/` | KI-Tiefenschätzung (ONNX Runtime Web, MIT) |
| `js/machine.js` | GRBL-Steuerung über USB |
| `js/app.js` | Bedienoberfläche |

Tests: `node fraesstudio/tests/test_cam.js` (prüft Fräsbahnen, G-Code, Importe und per Simulation, dass Reliefs nicht zu tief gefräst werden).

**Sicherheit:** Fräsen ist gefährlich. Jede Fräsbahn in der 3D-Vorschau prüfen, Schutzbrille tragen und während des Fräsens an der Maschine bleiben.
