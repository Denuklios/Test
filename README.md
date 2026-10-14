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
- **Text**: Klick auf die Arbeitsfläche, siehe Abschnitt *Schriften*.
- **Manuell**: Jeder Linksklick setzt einen Einstich, ein Rechtsklick einen Sprung.
- **Kurve (Touch)**: Auf Tablets setzen Tipper damit Kurvenpunkte statt Eckpunkten.

### Schriften

Zehn Stickschriften sind eingebaut und funktionieren auf jedem PC, auch ohne Internet:
Anton, Bebas Neue, Archivo Black, Passion One, Righteous, Alfa Slab One, Graduate (College), Pacifico, Kaushan Script und Great Vibes.
Alle stehen unter der freien SIL Open Font License (siehe `fonts/LIZENZEN.txt`). Zusätzlich lassen sich die Systemschriften des PCs verwenden.

- Einstellbar sind Höhe, Zeichenabstand und **Bogen** (Radius in mm; negativ = Text unten am Kreis).
- **Stichart Satin**: Für jeden Buchstaben wird die Mittellinie der Striche berechnet. Daraus entstehen Satinsäulen, deren Stiche immer quer zur Strichrichtung liegen, auch in Kurven und Bögen. Es werden „Säule A“-Objekte, die sich mit *Umformen* nachbearbeiten lassen.
- **Doppelklick** auf einen Text (oder *Text bearbeiten…* rechts) ändert Text, Schrift oder Größe nachträglich.
- *Gruppierung lösen* macht die Buchstaben zu Einzelobjekten.

### Satin in Kurven

- Satinstiche drehen in Bögen mit. Säule B richtet die Stiche senkrecht zur Mittellinie zwischen beiden Kanten aus.
- **Kurzstiche**: An der Innenseite enger Bögen wird jeder zweite Einstich verkürzt, damit sich dort kein Fadenknäuel bildet (abschaltbar).
- Die Dichte wird wie bei Hatch/Wilcom angegeben: Abstand zweier Einstiche auf derselben Seite (Vorgabe 0,40 mm).

### Sticheigenschaften (rechts)

Für jedes Objekt (oder als Vorgabe für das gewählte Werkzeug):
Dichte, Stichlänge, Stichwinkel, Zugkompensation, Unterlage (Mittellauf, Kantenlauf, Zickzack, Tatami), Auto-Split für breite Satinstiche und eine Kontur (Lauf-, Dreifach- oder Satinstich).

### Jeden Stich selbst bearbeiten

*Bearbeiten → In Einzelstiche umwandeln* wandelt Objekte in einzelne Einstiche um. Mit **Umformen** lässt sich dann jeder Stich verschieben, löschen (Entf) oder einfügen (Doppelklick). Mit der Leertaste wird ein Stich zum Sprung und umgekehrt.

### Auto-Digitalisieren

1. *Bild → Bild einfügen…* (PNG/JPG, am besten ein Logo mit klaren Farben)
2. *Bild → Auto-Digitalisieren…*: Anzahl der Farben, Größe in mm und Detailstufe einstellen. Mit „Vorschau“ die Farbreduktion prüfen.
3. Schmale Formen (Schrift, Linien, Ringe, Bögen bis 7 mm Strichbreite) werden zu **drehenden Satinsäulen**, breite Flächen zu Tatami. Jedes Objekt lässt sich danach umformen, umfärben, umsortieren und mit anderen Sticheigenschaften versehen.

Tipp: Für Schrift in Bildern die Detailstufe auf 8–12 Pixel/mm stellen. Die Schrift sollte im Stickmotiv mindestens 5 mm hoch sein.

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
| `js/satinauto.js` | Drehende Satinsäulen aus Flächen: Abstandstransformation, Skelett, Mittellinien, Breitenmessung |
| `js/fonts.js` | Eingebettete Schriften (erzeugt aus `fonts/*.ttf`) |
| `js/app.js` | Oberfläche, Werkzeuge, Umformen, Simulation, Dialoge |

Tests: `node tests/test_core.js` prüft die Stichgenerierung und den DST-Hin- und Rückweg, `node tests/test_satin.js` die Satin-Erkennung (Ring, Bogen, L, T).
Die erzeugten DST-Dateien wurden zusätzlich mit der unabhängigen Bibliothek *pyembroidery* gegengelesen.
