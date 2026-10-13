# StickStudio – Stickprogramm im Stil von Wilcom Hatch

Ein Stickprogramm (Digitalisier-Software), das im Browser läuft – ohne Installation, auch offline.
Es erzeugt **DST-Dateien (Tajima)** für die **Texi 1501** und alle anderen Tajima-kompatiblen Maschinen.

## Starten

`index.html` doppelklicken (Chrome, Edge oder Firefox). Es wird nichts installiert, und es ist keine Internetverbindung nötig.
Am besten mit Maus am PC arbeiten: Wie bei Hatch werden linke und rechte Maustaste unterschiedlich verwendet.

## Bedienung wie bei Hatch

| Eingabe | Wirkung |
|---|---|
| **Linksklick** | Eckpunkt setzen (gerade Linie) |
| **Rechtsklick** | Kurvenpunkt setzen (gebogene Linie) |
| **Enter** | Objekt fertigstellen / nächster Schritt |
| **Rücktaste** | letzten Punkt entfernen |
| **Esc** | abbrechen / zurück zum Auswahlwerkzeug |
| **R** | Umformen (Punkte nachträglich bearbeiten) |
| **Leertaste** | (Umformen) Punkt zwischen Ecke und Kurve umschalten |
| **Doppelklick** | (Umformen) Punkt einfügen |
| **Entf** | Punkt bzw. Objekt löschen |
| Mausrad / mittlere Taste | Zoomen / Ansicht verschieben |
| **T** / **J** | TrueView (Fadenansicht) / Sprünge anzeigen |

### Werkzeuge

- **Laufstich / Dreifachstich**: offene Linie (auch Bohnenstich, geschlossen möglich)
- **Satin C**: Satinlinie mit fester Breite entlang einer Mittellinie
- **Säule A**: Satinsäule. Punkte abwechselnd auf der linken und rechten Kante setzen.
- **Säule B**: Satinsäule. Erst eine Kante digitalisieren, Enter, dann die andere Kante, Enter.
- **Fläche**: Umriss digitalisieren → Enter → Löcher digitalisieren (Enter überspringt) → Stichwinkel mit zwei Klicks festlegen (Enter = Vorgabewinkel)
- **Rechteck / Ellipse**: aufziehen
- **Text**: Klick auf die Arbeitsfläche. Die Schrift wird zu normalen, bearbeitbaren Objekten (schmale Striche = Satin, breite = Tatami).
- **Manuell**: Jeder Linksklick setzt einen Einstich, ein Rechtsklick einen Sprung.
- **Kurve (Touch)**: Auf Tablets setzen Tipper damit Kurvenpunkte statt Eckpunkten.

### Sticheigenschaften (rechts)

Für jedes Objekt (oder als Vorgabe für das gewählte Werkzeug):
Dichte, Stichlänge, Stichwinkel, Zugkompensation, Unterlage (Mittellauf, Kantenlauf, Zickzack, Tatami), Auto-Split für breite Satinstiche und eine Kontur (Lauf-, Dreifach- oder Satinstich).

### Jeden Stich selbst bearbeiten

*Bearbeiten → In Einzelstiche umwandeln* wandelt Objekte in einzelne Einstiche um. Mit **Umformen** lässt sich dann jeder Stich verschieben, löschen (Entf) oder einfügen (Doppelklick). Mit der Leertaste wird ein Stich zum Sprung und umgekehrt.

### Auto-Digitalisieren

1. *Bild → Bild einfügen…* (PNG/JPG, am besten ein Logo mit klaren Farben)
2. *Bild → Auto-Digitalisieren…*: Anzahl der Farben, Größe in mm und Detailstufe einstellen. Mit „Vorschau“ die Farbreduktion prüfen.
3. Es entstehen normale Objekte (Tatami- bzw. Satinflächen). Jedes Objekt lässt sich danach umformen, umfärben, umsortieren und mit anderen Sticheigenschaften versehen.

Das Bild kann auch nur als Vorlage zum manuellen Digitalisieren dienen (*Bild-Einstellungen*: Größe, Deckkraft, Position).

## DST für die Texi 1501

- *Datei → DST exportieren* (oder **Strg+E**). Die Datei per USB-Stick an die Maschine übertragen.
- Der Ursprung liegt in der Designmitte. Farbwechsel werden als Stopp kodiert. Die Nadel wird jeder Farbe an der Maschine zugeordnet.
- **Fadenschnitt** wird als Folge von Sprüngen kodiert (Standard: 3). An der Maschine muss eingestellt sein, ab wie vielen Sprüngen geschnitten wird. Der Wert lässt sich unter *Einstellungen → Maschine & Rahmen* anpassen.
- Ab welchem Verbindungsabstand geschnitten wird (Standard 2 mm) und ob am Anfang und Ende vernäht wird, lässt sich dort ebenfalls einstellen.
- Rahmen: Texi 540 × 350 mm (max. Feld), 290 × 290 mm sowie Ø 200/150/120/90 mm. Die Statusleiste warnt, wenn das Design über den Rahmen hinausragt.
- *Datei → Arbeitsblatt drucken* listet die Farbfolge mit den Nadelnummern (Nadeln 1–15 bei jeder Farbe einstellbar, Doppelklick auf die Farbe).

Vorhandene DST-Dateien lassen sich importieren (*Datei → DST importieren*). Sie werden dabei als Einzelstiche geöffnet.

## Projektdateien

*Datei → Projekt speichern* speichert eine `.stick.json` mit allen bearbeitbaren Objekten, Farben und dem Vorlagenbild.
Bitte das Projekt immer zusätzlich speichern: Eine DST-Datei enthält nur noch Stiche und keine bearbeitbaren Objekte mehr.

## Technik

| Datei | Inhalt |
|---|---|
| `js/geometry.js` | Kurven (Ecke/Kurve wie Hatch), Polygone, Hilfsfunktionen |
| `js/stitchgen.js` | Lauf-, Dreifach-, Satin- und Tatami-Stiche, Unterlagen, Zugkompensation, Auto-Split |
| `js/dst.js` | Design zusammensetzen (Vernähen, Schnitte, Farbwechsel), DST schreiben und lesen |
| `js/autodigitize.js` | Farbreduktion (k-Means), Regionen, Konturverfolgung, Objekterzeugung |
| `js/app.js` | Oberfläche, Werkzeuge, Umformen, Simulation, Dialoge |

Tests: `node tests/test_core.js` prüft die Stichgenerierung und den DST-Hin- und Rückweg.
Die erzeugten DST-Dateien wurden zusätzlich mit der unabhängigen Bibliothek *pyembroidery* gegengelesen.
