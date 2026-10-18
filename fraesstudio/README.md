# FräsStudio – CAD + CAM + Fräsen in einem Programm

Zeichnen, Fräsbahnen berechnen, in 3D prüfen und direkt fräsen – im Browser, ohne Installation, auch offline.
Abgestimmt auf die **Twotrees TTC450** (GRBL, DLC32-Steuerung, 460 × 460 × 80 mm), funktioniert aber mit jeder GRBL-Fräse.

Vorbilder: die einfache Bedienung von **Easel**, der Funktionsumfang von **Carbide Create / VCarve** (2D, 2.5D, V-Carving, 3D-Relief).

## Starten

`index.html` doppelklicken – am besten in **Google Chrome** oder **Microsoft Edge** (nur diese können die Fräse per USB steuern).
Es wird nichts installiert, eine Internetverbindung ist nicht nötig. Das Projekt wird automatisch im Browser zwischengespeichert.

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

## Tastatur

| Taste | Wirkung |
|---|---|
| V R L Q K P S T M | Auswahl, Umformen, Linie, Rechteck, Kreis, Vieleck, Stern, Text, Messen |
| Enter / Rücktaste / Esc | Linie fertig / letzten Punkt weg / abbrechen |
| Leertaste | (Umformen) Punkt Ecke ↔ Kurve; sonst gedrückt halten = Ansicht verschieben |
| Pfeiltasten | Objekte verschieben (Umschalt 10 mm, Alt 0,1 mm); im Schritt 4: Maschine verfahren |
| 1 2 3 4 | Arbeitsschritt wechseln |
| F, G | Alles zeigen, Raster fangen |
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
| `js/machine.js` | GRBL-Steuerung über USB |
| `js/app.js` | Bedienoberfläche |

Tests: `node fraesstudio/tests/test_cam.js` (prüft Fräsbahnen, G-Code, Importe und per Simulation, dass Reliefs nicht zu tief gefräst werden).

**Sicherheit:** Fräsen ist gefährlich. Jede Fräsbahn in der 3D-Vorschau prüfen, Schutzbrille tragen und während des Fräsens an der Maschine bleiben.
