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

**31 fertig digitalisierte Stickschriften** aus der Ink/Stitch-Sammlung sind eingebaut: Schreibschriften (z. B. Pacificlo, Chopin, Magnolia, Amitaclo), serifenlose Schriften (z. B. Excalibur, Medium, Geneva Rounded, Barstitch), Serifenschriften (z. B. Apex, Venezia, Violin Serif, DejaVu) und Zierschriften.
Profis haben sie Satinsäule für Satinsäule von Hand gesetzt, samt Stichrichtung, Unterlage und Reihenfolge. Deshalb sticken sie deutlich sauberer als automatisch umgewandelte Schriften.
Sie werden erst geladen, wenn man sie auswählt. Der Dialog zeigt die empfohlene Größe, die Lizenz und fehlende Zeichen an.
Herkunft und Lizenzen: `fonts/inkstitch/README.md`.

Zusätzlich gibt es zehn TrueType-Schriften und funktionieren auf jedem PC, auch ohne Internet:
(Anton, Bebas Neue, Archivo Black, Passion One, Righteous, Alfa Slab One, Graduate, Pacifico, Kaushan Script, Great Vibes; SIL Open Font License, siehe `fonts/LIZENZEN.txt`) sowie die Systemschriften des PCs. Diese werden beim Einfügen automatisch in Satinsäulen umgewandelt.

- Einstellbar sind Höhe, Zeichenabstand und **Bogen** (Radius in mm; negativ = Text unten am Kreis).
- **Stichart Satin**: Für jeden Buchstaben wird die Mittellinie der Striche berechnet. Daraus entstehen Satinsäulen, deren Stiche immer quer zur Strichrichtung liegen, auch in Kurven und Bögen. Es werden „Säule A“-Objekte, die sich mit *Umformen* nachbearbeiten lassen.
- **Doppelklick** auf einen Text (oder *Text bearbeiten…* rechts) ändert Text, Schrift oder Größe nachträglich.
- *Gruppierung lösen* macht die Buchstaben zu Einzelobjekten.

### Satin in Kurven

- Satinstiche drehen in Bögen mit. Säule B richtet die Stiche senkrecht zur Mittellinie zwischen beiden Kanten aus.
- **Kurzstiche**: An der Innenseite enger Bögen wird jeder zweite Einstich verkürzt, damit sich dort kein Fadenknäuel bildet (abschaltbar).
- Die Dichte wird wie bei Hatch/Wilcom angegeben: Abstand zweier Einstiche auf derselben Seite (Vorgabe 0,40 mm).

### Automatische Verbindungen (Ein-/Ausstieg, versteckte Laufwege)

- **Ein- und Ausstieg berechnen:** Für jedes Objekt wird festgelegt, an welchem Ende es beginnt und endet. Gerechnet wird über die ganze Kette (Viterbi-Verfahren), sodass die Summe aller Wege minimal ist. Beispiel: Ein „C“ vor einem „A“ beginnt oben und endet unten, nahe dem linken Fuß des A. Flächen beginnen an dem Randpunkt, der dem vorigen Objekt am nächsten liegt. Geschlossene Laufstiche beginnen am nächstgelegenen Punkt.
- **Versteckte Laufwege (Unterwege):** Statt den Faden zu schneiden, sucht das Programm einen Laufstich-Weg, der vollständig unter Flächen oder Satinsäulen derselben Farbe liegt, die *danach noch gestickt werden*. Der Weg hält mindestens 0,5 mm Abstand zum Rand. Mit *Ansicht → Sprünge anzeigen* (Taste J) erscheinen diese Wege orange, Sprünge mit Schnitt rot gestrichelt.
- **Fertige Ink/Stitch-Schriften** behalten die Stichreihenfolge der Digitalisierer. Zwischen den Buchstaben wird trotzdem nach versteckten Wegen gesucht.
- **Bearbeiten → Reihenfolge optimieren:** sortiert Objekte gleicher Farbe nach kürzesten Wegen. Überlappende Objekte behalten ihre Reihenfolge, damit sich die Überdeckung nicht ändert. Das Ergebnis wird nur übernommen, wenn es weniger Schnitte bzw. kürzere Wege ergibt.
- Ein-/Ausschalten unter *Einstellungen → Maschine & Rahmen*.

Beispiel: Ein Design mit drei Schriftzügen kam statt mit 62 mit 33 Fadenschnitten aus, ein Logo statt mit 25 mit 14.

### Stickprüfung (Pop-up bei Problemen)

Nach jedem Erstellen oder Ändern eines Objekts prüft das Programm, ob die Maschine es sauber sticken kann. Bei Problemen öffnet sich ein Fenster mit Erklärung und den Knöpfen **Korrigieren**, **Rückgängig** und **Trotzdem behalten**. Die Statusleiste zeigt den Prüfstatus dauerhaft an. Ein Klick darauf (oder *Bearbeiten → Stickprüfung…*) listet alle Hinweise, *Zeigen* springt zur markierten Stelle.

Geprüft wird:
- **Stichwinkel:** Satinstiche fast parallel zur Säule (unter 18°), verdrehte Säulen (Kanten vertauscht), Satin-Flächen, deren Winkel zu lange Stiche ergibt. Korrektur: Stiche quer zur Säule ausrichten.
- **Dichte:** Satin oder Fläche zu dicht (Fadenbruch, Nadelbruch, harte Stickerei) oder zu offen. Stellen, an denen sich drei oder mehr Objekte übereinander stapeln.
- **Stichlängen:** Stiche über der Maschinengrenze, sehr viele kurze Stiche, Satin zu breit ohne Teilung, Satin zu schmal (spitze Enden zählen nicht), Laufstich zu kurz oder zu lang.

Die Grenzwerte gelten für jede Stickmaschine und lassen sich unter *Einstellungen → Maschine & Rahmen* anpassen:
- **Industriemaschine** (Tajima-kompatibel: Texi, Ricoma, Tajima, Barudan, ZSK …)
- **Haushaltsmaschine** (Brother, Bernina, Janome, Pfaff, Husqvarna …)

Dort lässt sich das Pop-up auch abschalten.
Die Prüfung wurde an allen 31 eingebauten Profi-Schriften abgestimmt, damit sie bei sauber digitalisierten Motiven nicht grundlos warnt.

### Ideen aus Ink/Stitch

- **E-Stich** (Applikations- oder Langettenstich) als Stichart für Satinsäulen
- Satin-Dichte als Abstand der Einstiche auf derselben Seite, Unterlagen Mittellauf, Kontur und Zickzack wie in Ink/Stitch
- Schriften mit Unterschneidung (Kerning) und Zeichenvorschub wie in der Ink/Stitch-Schriftverwaltung

### Stoff-Automatik (Stoff & Stickvlies)

Rechts oben unter **Stoff** das Textil wählen. Zur Auswahl stehen: Baumwolle, T-Shirt/Jersey, Sweat/Fleece, Polo/Piqué, Jeans/Canvas, Leder, Frottee/Handtuch, Kappe, Seide/feine Stoffe, Softshell, Strick/Mütze, Filz.
Das Programm passt dann alle Satin- und Flächenobjekte automatisch an:

- **Satin:** Der Abstand richtet sich nach dem Stoff *und* der Breite jeder Säule: schmale Säulen werden lockerer, breite dichter gestickt. Auch Zugausgleich (fester Wert plus Prozent der Breite), Unterlage (keine / Mitte / Kante / Kante + Zickzack je nach Breite und Stoff) und Auto-Split werden angepasst.
- **Tatami-Flächen:** Reihenabstand, Stichlänge, Zugausgleich und Unterlage hängen vom Stoff ab.
- Leder bekommt z. B. weniger Einstiche, Frottee dichtere Stiche mit kräftiger Unterlage, T-Shirt mehr Zugausgleich.

Rechts in den Eigenschaften sind diese Werte mit **„auto“** markiert. Ändert man einen Wert von Hand, wird er mit „von Hand“ markiert und bleibt fest. *An Stoff anpassen* schaltet die Automatik pro Objekt ab.

Das Programm empfiehlt außerdem:
- **Stickvlies:** Art, Gewicht und **Anzahl der Lagen**, abhängig vom Stoff und vom Motiv. Bei vielen Stichen, hoher Dichte, großen Füllflächen oder dehnbarem Stoff mit Flächen wird eine Lage mehr empfohlen.
- **Topper** (wasserlöslich) für Frottee, Fleece, Piqué und Strick
- **Nadel** und **maximale Geschwindigkeit**
- **Warnungen**, z. B. zu schmale Satinsäulen für den Stoff, zu breite Satinsäulen oder ein zu dichtes Motiv für Leder

*Details & Tipps…* zeigt alle Werte und Hinweise. Die Empfehlung steht auch auf dem gedruckten Arbeitsblatt.
Die Werte sind bewährte Richtwerte. Ein Probestick auf dem Originalstoff ersetzen sie nicht.

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
| `js/route.js` | Ein-/Ausstiege (Viterbi), versteckte Laufwege (Wegsuche unter später gestickten Flächen), Reihenfolge |
| `js/check.js` | Stickprüfung: Stichwinkel, Dichte, Stichlängen, Maschinenprofile |
| `js/fabric.js` | Stoffprofile, automatische Stichanpassung, Vlies-Empfehlung |
| `js/stitchgen.js` | Lauf-, Dreifach-, Satin- und Tatami-Stiche, Unterlagen, Zugkompensation, Auto-Split |
| `js/dst.js` | Design zusammensetzen (Vernähen, Schnitte, Farbwechsel), DST schreiben und lesen |
| `js/autodigitize.js` | Farbreduktion (k-Means), Regionen, Konturverfolgung, Objekterzeugung |
| `js/satinauto.js` | Drehende Satinsäulen aus Flächen: Abstandstransformation, Skelett, Mittellinien, Breitenmessung |
| `js/fonts.js` | Eingebettete TrueType-Schriften (erzeugt aus `fonts/*.ttf`) |
| `js/inkfont.js` | Laden und Setzen der fertig digitalisierten Stickschriften |
| `js/inkfonts/` | Die Ink/Stitch-Schriften im StickStudio-Format (je Schrift eine Datei) |
| `tools/inkstitch_fonts.py` | Konverter Ink/Stitch-Schrift (SVG + font.json) -> StickStudio |
| `js/app.js` | Oberfläche, Werkzeuge, Umformen, Simulation, Dialoge |

Tests: `node tests/test_core.js` prüft die Stichgenerierung und den DST-Hin- und Rückweg, `node tests/test_satin.js` die Satin-Erkennung (Ring, Bogen, L, T), `node tests/test_fabric.js` die Stoff-Automatik, `node tests/test_check.js` die Stickprüfung, `node tests/test_route.js` die Verbindungsberechnung.
Die erzeugten DST-Dateien wurden zusätzlich mit der unabhängigen Bibliothek *pyembroidery* gegengelesen.
