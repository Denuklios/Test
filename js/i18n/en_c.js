/* Englische Übersetzungen (Teil C: Hilfe-Infos, Stickprüfung, Stoffe, Rahmen) */
(function (g) {
  const HW = (g.HW = g.HW || {});
  HW.I18N = HW.I18N || { en: { exact: {}, rx: [] } };
  const E = HW.I18N.en;
  // Teiltexte rekursiv übersetzen (für zusammengesetzte Texte wie „⚠ Meldung“ oder „1 × Vlies (Gewicht)“)
  const T = (s) => (HW.i18n && HW.i18n.t ? HW.i18n.t(s) : s);

  /* =====================================================================
     Hilfe-Infos (help.js)
     ===================================================================== */
  Object.assign(E.exact, {
    /* ---------- Menüs ---------- */
    'Datei': "File",
    'Neues Design, Projekte öffnen und speichern, Grafiken und Stickdateien importieren, Stickdatei für die Maschine erzeugen, Arbeitsblatt, Mockup und Preis.':
      "New design, open and save projects, import graphics and embroidery files, create the file for the machine, worksheet, mockup and pricing.",
    'Bearbeiten': "Edit",
    'Rückgängig, Kopieren, Drehen, Spiegeln, Größe ändern, Formen verrechnen, Applikation, Knockdown, Kappen-Sortierung und die Stickprüfung.':
      "Undo, copy, rotate, mirror, resize, combine shapes, appliqué, knockdown, cap sequencing and the stitch check.",
    'Anordnen': "Arrange",
    'Objekte ausrichten und verteilen, gruppieren, im Kreis oder Raster vervielfältigen, Text auf eine Linie setzen, Monogramme.':
      "Align and distribute objects, group them, repeat them in a circle or grid, put text on a line, monograms.",
    'Bild': "Image",
    'Ein Foto oder Logo als Vorlage einfügen, zum Nachzeichnen oder für das automatische Digitalisieren.':
      "Insert a photo or logo as a backdrop, for tracing by hand or for auto-digitizing.",
    'Ansicht': "View",
    'Wie das Design angezeigt wird: Fadenansicht, Sprünge, Raster, Einrasten, Zoom.':
      "How the design is displayed: thread view, jumps, grid, snapping, zoom.",
    'Einstellungen': "Settings",
    'Maschine, Schnitte und Sprünge, Stickrahmen, Hilfe und diese Info-Kästchen ein- und ausschalten.':
      "Machine, trims and jumps, hoops, help, and turning these info boxes on or off.",

    /* ---------- Befehle ---------- */
    'Neu': "New",
    'Fängt ein leeres Design an. Das aktuelle Design wird verworfen – vorher speichern, wenn du es noch brauchst.':
      "Starts a blank design. The current design is discarded – save it first if you still need it.",
    'Projekt öffnen': "Open project",
    'Lädt ein gespeichertes StickStudio-Projekt (.stick.json) mit allen Objekten, Farben und Einstellungen – voll bearbeitbar.':
      "Loads a saved StickStudio project (.stick.json) with all objects, colors and settings – fully editable.",
    'Projekt speichern': "Save project",
    'Speichert das Design als bearbeitbare Projektdatei. Die Maschine braucht dagegen eine Stickdatei (siehe „Stickdatei exportieren“).':
      "Saves the design as an editable project file. The machine, however, needs an embroidery file (see “Export embroidery file”).",
    'Design-Bibliothek': "Design library",
    'Alle in der Bibliothek abgelegten Designs mit Vorschaubild. Suchen nach Name, Kunde oder Stichwort und mit einem Klick öffnen.':
      "All designs stored in the library, with thumbnails. Search by name, customer or keyword and open with one click.",
    'In Bibliothek speichern': "Save to library",
    'Legt das aktuelle Design mit Vorschaubild, Stichworten und Kunde in der Bibliothek ab (im Browser dieses Computers).':
      "Stores the current design in the library with thumbnail, keywords and customer (in this computer’s browser).",
    'Vektorgrafik importieren': "Import vector graphic",
    'Lädt ein Logo als SVG, PDF oder AI und wandelt die Formen automatisch in Stickobjekte um. Beste Qualität für Logos.':
      "Loads a logo as SVG, PDF or AI and automatically converts the shapes into embroidery objects. Best quality for logos.",
    'Stickdatei importieren': "Import embroidery file",
    'Öffnet eine fertige Stickdatei (DST, PES, JEF, EXP). Die Stiche lassen sich ansehen, verschieben und einzeln bearbeiten.':
      "Opens an existing embroidery file (DST, PES, JEF, EXP). You can view the stitches, move them and edit them one by one.",
    'Stickdatei exportieren': "Export embroidery file",
    'Erzeugt die Datei für die Stickmaschine. Für die Texi 1501 „DST“ wählen, auf einen USB-Stick kopieren und an der Maschine laden.':
      "Creates the file for the embroidery machine. For the Texi 1501 choose “DST”, copy it to a USB stick and load it on the machine.",
    'Teamnamen': "Team names",
    'Ein Design, viele Namen: Text als Platzhalter, Namensliste eingeben – je Name entsteht eine eigene Stickdatei (alles in einer ZIP).':
      "One design, many names: use a text as placeholder and enter a list of names – each name gets its own embroidery file (all in one ZIP).",
    'Mehrere Einspannungen': "Multi-hooping",
    'Für Motive, die größer als der Rahmen sind: teilt das Design in mehrere Dateien mit Passkreuzen zum genauen Ausrichten.':
      "For designs larger than the hoop: splits the design into several files with registration marks for exact alignment.",
    'Arbeitsblatt drucken': "Print worksheet",
    'Druckt ein Blatt für die Maschine: Vorschau, Farbfolge mit Nadelnummern, Stichzahl, Größe, Vlies-Empfehlung und Stopps.':
      "Prints a production worksheet: preview, color sequence with needle numbers, stitch count, size, stabilizer recommendation and stops.",
    'Produkt-Vorschau': "Product mockup",
    'Zeigt das Design maßstabsgetreu auf T-Shirt, Polo, Hoodie, Kappe, Handtuch oder Tasche – gut, um es dem Kunden zu zeigen.':
      "Shows the design true to scale on a T-shirt, polo, hoodie, cap, towel or bag – great for showing it to the customer.",
    'Preiskalkulation': "Price calculator",
    'Berechnet den Stückpreis nach Stichzahl oder Maschinenzeit mit Mengenrabatten und druckt ein Angebot.':
      "Calculates the price per piece by stitch count or machine time, with quantity discounts, and prints a quote.",
    'Rückgängig (Strg+Z)': "Undo (Ctrl+Z)",
    'Macht den letzten Schritt rückgängig. Mehrfach drücken geht weiter zurück.':
      "Undoes the last step. Press repeatedly to go further back.",
    'Wiederholen (Strg+Y)': "Redo (Ctrl+Y)",
    'Stellt einen rückgängig gemachten Schritt wieder her.': "Restores a step that was undone.",
    'Duplizieren (Strg+D)': "Duplicate (Ctrl+D)",
    'Kopiert die ausgewählten Objekte. Die Kopie liegt leicht versetzt daneben.':
      "Copies the selected objects. The copy is placed slightly offset next to them.",
    'Löschen (Entf)': "Delete (Del)",
    'Entfernt die ausgewählten Objekte aus dem Design.': "Removes the selected objects from the design.",
    'Alles auswählen (Strg+A)': "Select all (Ctrl+A)",
    'Wählt alle Objekte aus, z. B. um das ganze Design zu verschieben oder zu skalieren.':
      "Selects all objects, e.g. to move or scale the whole design.",
    'Horizontal spiegeln': "Mirror horizontally",
    'Spiegelt die Auswahl links ↔ rechts. Stichwinkel werden mitgespiegelt.':
      "Mirrors the selection left ↔ right. Stitch angles are mirrored too.",
    'Vertikal spiegeln': "Mirror vertically",
    'Spiegelt die Auswahl oben ↔ unten.': "Mirrors the selection top ↔ bottom.",
    'Drehen': "Rotate",
    'Dreht die Auswahl um einen frei wählbaren Winkel. Die Stiche werden neu berechnet.':
      "Rotates the selection by any angle you like. The stitches are recalculated.",
    'Skalieren': "Scale",
    'Ändert die Größe in Prozent. Die Stiche werden neu berechnet, die Dichte bleibt richtig (nicht einfach „aufgeblasen“).':
      "Changes the size in percent. The stitches are recalculated so the density stays right (not simply “blown up”).",
    'In Rahmenmitte setzen': "Center in hoop",
    'Schiebt die Auswahl (oder das ganze Design) genau in die Mitte des Stickrahmens.':
      "Moves the selection (or the whole design) to the exact center of the hoop.",
    'An Rahmen anpassen': "Fit to hoop",
    'Vergrößert oder verkleinert das Design (oder die Auswahl) so, dass es genau ins Stickfeld passt. Stiche werden neu berechnet.':
      "Enlarges or reduces the design (or the selection) so it fits exactly into the sewing field. Stitches are recalculated.",
    'Kopien anordnen': "Arrange copies",
    'Vervielfältigt die Auswahl im Kreis (z. B. Blütenblätter, Sterne rundherum) oder als Raster in Reihen und Spalten.':
      "Repeats the selection in a circle (e.g. petals, stars all around) or as a grid in rows and columns.",
    'Überlappungen entfernen': "Remove overlaps",
    'Schneidet verdeckte Teile unter oberen Objekten heraus. Spart Stiche und verhindert harte, dicke Stellen.':
      "Cuts out hidden parts underneath objects on top. Saves stitches and prevents hard, thick spots.",
    'Formen vereinen': "Merge shapes",
    'Verschmilzt die ausgewählten Flächen zu einer einzigen Form.': "Merges the selected fills into a single shape.",
    'Untere Form ausschneiden': "Cut from bottom shape",
    'Zieht die oberen ausgewählten Formen von der untersten ab – wie mit einer Ausstechform.':
      "Subtracts the upper selected shapes from the bottom one – like a cookie cutter.",
    'Schnittmenge': "Intersect",
    'Behält nur den Bereich, in dem sich alle ausgewählten Formen überlappen.':
      "Keeps only the area where all selected shapes overlap.",
    'Applikation aus Form': "Appliqué from shape",
    'Macht aus einer Form eine Applikation: Platzierungslinie, Stopp, Heftstich, Stopp, Satin-Abdeckung. Spart viele Stiche bei großen Flächen.':
      "Turns a shape into an appliqué: placement line, stop, tack-down, stop, satin cover. Saves lots of stitches on large areas.",
    'Knockdown-Stich': "Knockdown stitch",
    'Legt ein lockeres Gitter unter das Motiv, das Flor oder Schlaufen (Frottee, Fleece, Strick) flachdrückt, damit Details nicht versinken.':
      "Places a loose grid under the design that flattens pile or loops (terry, fleece, knits) so details don’t sink in.",
    'Für Kappe sortieren': "Sequence for cap",
    'Sortiert für Kappen: von der Mitte nach außen und von unten nach oben. Verhindert Verzug und Falten auf der Kappe.':
      "Sequences for caps: from the center outwards and from bottom to top. Prevents distortion and puckering on the cap.",
    'In Einzelstiche umwandeln': "Convert to stitches",
    'Macht aus dem Objekt einzelne Stiche, die man frei verschieben kann. Danach lassen sich Dichte usw. nicht mehr automatisch ändern.':
      "Turns the object into individual stitches you can move freely. After that, density etc. can no longer be changed automatically.",
    'Nach Farbe sortieren': "Sort by color",
    'Ordnet die Objekte nach Farben, damit die Maschine seltener die Farbe wechseln muss.':
      "Orders the objects by color so the machine needs fewer color changes.",
    'Reihenfolge optimieren': "Optimize sequence",
    'Sortiert die Objekte jeder Farbe so, dass die Wege dazwischen möglichst kurz sind – weniger Sprünge und Schnitte.':
      "Orders the objects within each color so the paths between them are as short as possible – fewer jumps and trims.",
    'Stickprüfung': "Stitch check",
    'Prüft das Design auf Probleme wie zu dicht, zu schmal, zu lange Stiche oder schlechte Winkel und schlägt Korrekturen vor.':
      "Checks the design for problems such as too dense, too narrow, stitches too long or bad angles, and suggests fixes.",
    'Links ausrichten': "Align left",
    'Ein Objekt: an den linken Rand des Stickfelds. Mehrere: alle an die linke Kante der Auswahl.':
      "One object: to the left edge of the sewing field. Several: all to the left edge of the selection.",
    'Waagrecht mittig': "Center horizontally",
    'Richtet die Objekte auf eine gemeinsame senkrechte Mittellinie aus (ein Objekt: Rahmenmitte).':
      "Aligns the objects on a common vertical center line (one object: hoop center).",
    'Rechts ausrichten': "Align right",
    'Ein Objekt: an den rechten Rand des Stickfelds. Mehrere: an die rechte Kante der Auswahl.':
      "One object: to the right edge of the sewing field. Several: to the right edge of the selection.",
    'Oben ausrichten': "Align top",
    'Richtet die Oberkanten aneinander aus (ein Objekt: oberer Rand des Stickfelds).':
      "Aligns the top edges with each other (one object: top edge of the sewing field).",
    'Senkrecht mittig': "Center vertically",
    'Richtet die Objekte auf eine gemeinsame waagrechte Mittellinie aus.':
      "Aligns the objects on a common horizontal center line.",
    'Unten ausrichten': "Align bottom",
    'Richtet die Unterkanten aneinander aus (ein Objekt: unterer Rand des Stickfelds).':
      "Aligns the bottom edges with each other (one object: bottom edge of the sewing field).",
    'Waagrecht verteilen': "Distribute horizontally",
    'Verteilt mindestens drei Objekte so, dass die Abstände zwischen ihnen links-rechts gleich groß sind.':
      "Spreads three or more objects so the gaps between them are equal from left to right.",
    'Senkrecht verteilen': "Distribute vertically",
    'Verteilt mindestens drei Objekte mit gleichen Abständen oben-unten.':
      "Spreads three or more objects with equal gaps from top to bottom.",
    'Gruppieren (Strg+G)': "Group (Ctrl+G)",
    'Fasst die Auswahl zusammen: ein Klick wählt danach alle Teile, sie bewegen sich gemeinsam.':
      "Combines the selection: afterwards one click selects all parts and they move together.",
    'Gruppierung lösen': "Ungroup",
    'Teile einer Gruppe wieder einzeln bearbeiten. Bei Text ist er danach nicht mehr als Text änderbar.':
      "Edit the parts of a group individually again. Text can no longer be edited as text afterwards.",
    'Text auf Linie setzen': "Put text on line",
    'Legt einen Text entlang einer gezeichneten Linie, z. B. einen Bogen oder Kreis. Text und Linie zusammen auswählen.':
      "Lays a text along a drawn line, e.g. an arc or circle. Select the text and the line together.",
    'Monogramm': "Monogram",
    'Erstellt Initialen aus Vorlagen: Mitte groß, im Kreis, in einer Raute oder mit Linien.':
      "Creates initials from templates: large center letter, in a circle, in a diamond or with lines.",
    'Bild einfügen': "Insert image",
    'Lädt ein Foto oder Logo (JPG, PNG) als Vorlage in den Hintergrund – zum Nachzeichnen oder automatischen Digitalisieren.':
      "Loads a photo or logo (JPG, PNG) as a backdrop – for tracing by hand or auto-digitizing.",
    'Bild-Einstellungen': "Image settings",
    'Größe, Position und Deckkraft des Vorlagenbildes ändern.': "Change the size, position and opacity of the backdrop image.",
    'Bild ein/aus': "Image on/off",
    'Blendet das Vorlagenbild aus oder wieder ein. Es wird nie mitgestickt.':
      "Hides or shows the backdrop image. It is never stitched.",
    'Bild entfernen': "Remove image",
    'Löscht das Vorlagenbild aus dem Hintergrund.': "Deletes the backdrop image.",
    'Auto-Digitalisieren': "Auto-digitize",
    'Wandelt das Vorlagenbild automatisch in Stickobjekte um (Satin für schmale Teile, Tatami für Flächen). Danach alles nachbearbeitbar.':
      "Automatically converts the backdrop image into embroidery objects (satin for narrow parts, tatami for areas). Everything can be edited afterwards.",
    'TrueView / Fadenansicht (T)': "TrueView / thread view (T)",
    'Zeigt die Stiche wie echter Faden mit Glanz – oder als dünne Linien, um Einstiche genau zu sehen.':
      "Shows the stitches like real thread with sheen – or as thin lines so you can see every needle point.",
    'Sprünge anzeigen (J)': "Show jumps (J)",
    'Zeigt die Wege, auf denen die Maschine ohne zu sticken springt, als gestrichelte Linien.':
      "Shows the paths where the machine jumps without stitching as dashed lines.",
    'Raster': "Grid",
    'Blendet das Millimeter-Raster ein oder aus.': "Shows or hides the millimeter grid.",
    'Einrasten (G)': "Snap (G)",
    'Punkte und verschobene Objekte springen an Raster und Hilfslinien – für exakt gerade und gleich große Formen.':
      "Points and moved objects snap to the grid and guides – for perfectly straight, equally sized shapes.",
    'Hilfslinien & Rasterweite': "Guides & grid spacing",
    'Eigene waagrechte oder senkrechte Hilfslinien setzen und die Rasterweite für das Einrasten ändern.':
      "Add your own horizontal or vertical guides and change the grid spacing used for snapping.",
    'Einstichpunkte': "Needle points",
    'Zeigt jeden einzelnen Nadeleinstich als Punkt – hilfreich, um zu dichte Stellen zu erkennen.':
      "Shows every single needle penetration as a dot – helpful for spotting areas that are too dense.",
    'Mausrad zoomt': "Mouse wheel zooms",
    'Aus (Standard): Mausrad = hoch/runter, Shift + Rad = links/rechts, Strg + Rad = Zoom. An: Mausrad zoomt wie früher. Verschieben geht immer auch mit Leertaste + Ziehen.':
      "Off (default): wheel = up/down, Shift + wheel = left/right, Ctrl + wheel = zoom. On: the wheel zooms as before. You can always pan with Space + drag too.",
    'Bildlaufleiste': "Scrollbar",
    'Zeigt, welcher Teil des Designs gerade sichtbar ist. Den Balken ziehen oder neben ihn klicken, um die Ansicht zu verschieben.':
      "Shows which part of the design is currently visible. Drag the bar or click next to it to move the view.",
    'Alles zeigen (0)': "Show all (0)",
    'Zoomt so, dass das ganze Design sichtbar ist. Verschieben: Mausrad (hoch/runter), Shift + Mausrad (links/rechts), Leertaste + Ziehen oder Pfeiltasten.':
      "Zooms so the whole design is visible. To pan: mouse wheel (up/down), Shift + wheel (left/right), Space + drag or the arrow keys.",
    'Rahmen zeigen': "Show hoop",
    'Zoomt so, dass der ganze Stickrahmen sichtbar ist.': "Zooms so the whole hoop is visible.",
    'Maschine, Schnitte & Sprünge': "Machine, trims & jumps",
    'Maschinentyp, Geschwindigkeit, ab wann geschnitten statt gesprungen wird, versteckte Laufwege und Prüf-Grenzwerte.':
      "Machine type, speed, when to trim instead of jump, hidden travel runs and stitch check limits.",
    'Stickrahmen': "Hoops",
    'Rahmen auswählen oder eigene Rahmen (eckig, rund, oval) anlegen. Das Stickfeld wird auf der Arbeitsfläche angezeigt.':
      "Choose a hoop or create your own (rectangular, round, oval). The sewing field is shown on the canvas.",
    'Hilfe / Tastatur': "Help / keyboard",
    'Übersicht über Maus- und Tastaturbefehle.': "Overview of mouse and keyboard commands.",
    'Hilfe-Infos beim Überfahren': "Help tips on hover",
    'Schaltet diese Info-Kästchen ein oder aus. Die Einstellung wird gemerkt.':
      "Turns these info boxes on or off. The setting is remembered.",
    '+ Farbe': "+ Color",
    'Fügt der Palette eine neue Garnfarbe hinzu.': "Adds a new thread color to the palette.",
    'Farbe bearbeiten': "Edit color",
    'Ändert die aktive Farbe: Garn aus einer Farbkarte (Madeira, Isacord …) wählen, Name und Nadelnummer festlegen.':
      "Changes the active color: pick a thread from a thread chart (Madeira, Isacord …), set name and needle number.",
    'Farbe entfernen': "Remove color",
    'Löscht die aktive Farbe aus der Palette (nur wenn kein Objekt sie benutzt).':
      "Deletes the active color from the palette (only if no object uses it).",
    'Garnmarke zuordnen': "Match thread brand",
    'Ordnet allen Farben das passendste echte Garn einer Marke zu (z. B. Madeira Polyneon) – mit Nummern für die Bestellung.':
      "Assigns every color the closest real thread of a brand (e.g. Madeira Polyneon) – with numbers for ordering.",
    'Nach oben': "Move up",
    'Die Auswahl wird früher gestickt (eine Stelle nach oben in der Reihenfolge).':
      "The selection is stitched earlier (one place up in the sequence).",
    'Nach unten': "Move down",
    'Die Auswahl wird später gestickt (eine Stelle nach unten).': "The selection is stitched later (one place down).",
    'Ganz nach oben': "Move to top",
    'Die Auswahl wird als Erstes gestickt (liegt dann ganz unten auf dem Stoff).':
      "The selection is stitched first (so it lies at the very bottom on the fabric).",
    'Ganz nach unten': "Move to bottom",
    'Die Auswahl wird zuletzt gestickt (liegt dann obenauf).': "The selection is stitched last (so it lies on top).",

    /* ---------- Werkzeuge ---------- */
    'Auswählen (Esc)': "Select (Esc)",
    'Objekte anklicken, verschieben, mit Shift mehrere wählen oder einen Rahmen um mehrere ziehen. Doppelklick auf Text = Text bearbeiten.':
      "Click objects, move them, Shift-click to select several or drag a box around them. Double-click a text to edit it.",
    'Verschieben (Hand, Taste H)': "Pan (hand, key H)",
    'Ansicht mit gedrückter Maustaste in jede Richtung schieben. Geht auch jederzeit: Leertaste gedrückt halten und Maus bewegen, Mausrad (hoch/runter), Shift + Mausrad (links/rechts).':
      "Drag the view in any direction with the mouse button held down. Works any time as well: hold Space and move the mouse, mouse wheel (up/down), Shift + wheel (left/right).",
    'Umformen (R)': "Reshape (R)",
    'Einzelne Punkte eines Objekts verschieben, einfügen (Doppelklick) oder löschen (Entf). Leertaste wechselt Ecke ↔ Kurve.':
      "Move individual points of an object, insert them (double-click) or delete them (Del). Space toggles corner ↔ curve.",
    'Laufstich': "Run stitch",
    'Eine einfache Stichlinie, z. B. für Umrisse oder feine Details. Linksklick = Ecke, Rechtsklick = Kurve, Enter = fertig.':
      "A simple line of stitches, e.g. for outlines or fine details. Left-click = corner, right-click = curve, Enter = done.",
    'Dreifachstich': "Triple stitch",
    'Wie Laufstich, aber jeder Stich wird dreimal gestickt – kräftigere, gut sichtbare Linie.':
      "Like a run stitch, but every stitch is sewn three times – a bolder, clearly visible line.",
    'Satin C – Linie mit fester Breite': "Satin C – line with fixed width",
    'Eine Satinraupe mit fester Breite entlang einer Linie – ideal für Ränder und Schriftzüge. Mitte zeichnen, Breite rechts einstellen.':
      "A satin column of fixed width along a line – ideal for borders and lettering. Draw the center line, set the width on the right.",
    'Satin A – Breite frei (wie Hatch „Column A“)': "Satin A – free width (like Hatch “Column A”)",
    'Für Satin mit wechselnder Dicke: Kanten immer abwechselnd anklicken – blaue Seite, orange Seite, blau, orange … Jedes Paar legt Breite und Stichrichtung fest. Linksklick = Ecke, Rechtsklick = Kurve, Enter = fertig.':
      "For satin with varying width: click the edges alternately – blue side, orange side, blue, orange … Each pair sets width and stitch direction. Left-click = corner, right-click = curve, Enter = done.",
    'Satin B – zwei Kanten nacheinander': "Satin B – two edges one after the other",
    'Erst die eine Kante komplett zeichnen, Enter, dann die andere Kante. Die Stichrichtung dreht automatisch mit. Linksklick = Ecke, Rechtsklick = Kurve.':
      "First draw one edge completely, press Enter, then the other edge. The stitch direction turns automatically. Left-click = corner, right-click = curve.",
    'In Satin A umwandeln': "Convert to Satin A",
    'Macht aus einer Satinlinie mit fester Breite (Satin C) eine Säule mit zwei einzelnen Kanten. Danach mit „Umformen“ die Kantenpunkte ziehen, um die Breite stellenweise zu ändern.':
      "Turns a fixed-width satin line (Satin C) into a column with two separate edges. Then use “Reshape” to drag the edge points and change the width in places.",
    'Fläche (Tatami)': "Fill (tatami)",
    'Füllt eine geschlossene Form mit Reihen-Stichen. Umriss zeichnen, Enter, optional Löcher, dann den Stichwinkel.':
      "Fills a closed shape with rows of stitches. Draw the outline, press Enter, add holes if needed, then the stitch angle.",
    'Rechteck': "Rectangle",
    'Ein Rechteck als gefüllte Fläche aufziehen.': "Drag out a rectangle as a fill.",
    'Kreis / Ellipse': "Circle / ellipse",
    'Eine Ellipse als gefüllte Fläche aufziehen. Mit gedrückter Shift-Taste wird es ein Kreis.':
      "Drag out an ellipse as a fill. Hold Shift to get a circle.",
    'Text': "Text",
    'Klick auf die Arbeitsfläche setzt einen Text. Fertige Stickschriften oder normale Schriften, die automatisch umgewandelt werden.':
      "Click on the canvas to place a text. Use ready-made embroidery fonts or regular fonts that are converted automatically.",
    'Messer': "Knife",
    'Teilt Flächen entlang einer Linie in zwei Teile – z. B. damit große Flächen in den Rahmen passen oder anders gestickt werden.':
      "Splits fills into two parts along a line – e.g. so large areas fit the hoop or can be stitched differently.",
    'Manuelle Stiche': "Manual stitches",
    'Jeder Klick setzt genau einen Stich, Rechtsklick einen Sprung. Für ganz feine Handarbeit.':
      "Each click places exactly one stitch, right-click a jump. For very fine manual work.",
    'Kurve (für Touch)': "Curve (for touch)",
    'Auf Tablets ohne rechte Maustaste: eingeschaltet setzt jedes Tippen einen Kurvenpunkt statt einer Ecke.':
      "On tablets without a right mouse button: when on, every tap sets a curve point instead of a corner.",

    /* ---------- Feste Elemente ---------- */
    'Stickrahmen wählen': "Choose hoop",
    'Welcher Rahmen benutzt wird. Das Stickfeld wird angezeigt und das Programm warnt, wenn das Design nicht hineinpasst.':
      "Which hoop is used. The sewing field is displayed and the program warns you if the design doesn’t fit.",
    'Rahmen verwalten': "Manage hoops",
    'Eigene Rahmen anlegen (eckig, rund, oval), passende Rahmen finden und das Design einpassen.':
      "Create your own hoops (rectangular, round, oval), find hoops that fit and fit the design to them.",
    'Stoff': "Fabric",
    'Auf welchen Stoff gestickt wird. Dichte, Stichlänge, Zugausgleich und Unterlage passen sich automatisch an; dazu gibt es eine Vlies-Empfehlung.':
      "The fabric you are embroidering on. Density, stitch length, pull compensation and underlay adjust automatically, and you get a stabilizer recommendation.",
    'Details & Tipps': "Details & tips",
    'Genaue Empfehlung für diesen Stoff: Vlies, Topper, Nadel, Geschwindigkeit und welche Werte automatisch angepasst werden.':
      "Detailed recommendation for this fabric: stabilizer, topping, needle, speed and which values are adjusted automatically.",
    'Für flauschige Stoffe: ein lockeres Gitter drückt den Flor flach, damit feine Schrift nicht versinkt.':
      "For fluffy fabrics: a loose grid flattens the pile so fine lettering doesn’t sink in.",
    'Sticksimulation': "Stitch simulation",
    'Spielt ab, in welcher Reihenfolge die Maschine stickt. Ist etwas ausgewählt, läuft nur die Auswahl (der Rest blass) – sonst das ganze Design.':
      "Plays back the order in which the machine stitches. If something is selected, only the selection plays (the rest is faded) – otherwise the whole design.",
    'Stickfortschritt': "Stitch progress",
    'Ziehen zeigt das Design bis zu einem bestimmten Stich – praktisch, um die Reihenfolge Schritt für Schritt zu prüfen.':
      "Drag to show the design up to a certain stitch – handy for checking the sequence step by step.",
    'Geschwindigkeit der Simulation': "Simulation speed",
    'Wie schnell die Simulation abläuft. Hat keinen Einfluss auf die Maschine.':
      "How fast the simulation runs. Has no effect on the machine.",
    'Grün = alles in Ordnung. Gelb/Rot = Hinweise zu Dichte, Winkeln, Stichlängen. Klicken zeigt Details und Korrekturen.':
      "Green = all fine. Yellow/red = notes on density, angles, stitch lengths. Click to see details and fixes.",
    'Hilfe-Infos ein/aus': "Help tips on/off",
    'Farbpalette': "Color palette",
    'Klick auf eine Farbe = aktive Farbe für neue Objekte; ist etwas ausgewählt, bekommt es diese Farbe. Die Zahl ist die Nadelnummer.':
      "Click a color = active color for new objects; if something is selected, it gets this color. The number is the needle number.",
    'Stickreihenfolge': "Stitch sequence",
    'Alle Objekte in der Reihenfolge, in der gestickt wird (oben zuerst). Klick wählt aus, das Auge blendet aus.':
      "All objects in the order they are stitched (top first). Click to select, the eye hides an object.",
    'Design-Daten': "Design info",
    'Konto': "Account",
    'Dein Konto: Lizenz und Laufzeit, Passwort ändern, Rechtstexte und Abmelden.': "Your account: license and term, change password, legal texts and sign out.",
    'Stichzahl, Farben, Schnitte, Größe und ungefähre Stickzeit. Rot: Design ragt über das Stickfeld.':
      "Stitch count, colors, trims, size and approximate run time. Red: the design extends beyond the sewing field.",

    /* ---------- Eigenschaften ---------- */
    'Stichart': "Stitch type",
    'Laufstich = einfache Linie. Dreifachstich = jeder Stich dreimal (kräftiger). Bohnenstich = hin-zurück-hin, wirkt wie gezeichnet.':
      "Run stitch = simple line. Triple stitch = every stitch three times (bolder). Bean stitch = forward-back-forward, looks hand-drawn.",
    'Stichlänge': "Stitch length",
    'Länge der einzelnen Stiche. Kürzer folgt Kurven genauer, länger wirkt ruhiger. Üblich: 2–3 mm, für feine Kurven 1,5 mm.':
      "Length of the individual stitches. Shorter follows curves more closely, longer looks smoother. Typical: 2–3 mm, 1.5 mm for tight curves.",
    'Geschlossen': "Closed",
    'Verbindet das Ende wieder mit dem Anfang – für Umrisse um eine Form herum.':
      "Connects the end back to the start – for outlines around a shape.",
    'Satin = dicht nebeneinander, glänzend. E-Stich = Kante mit kurzen Querstichen, typisch zum Einfassen von Applikationen.':
      "Satin = stitches close together, shiny. E-stitch = edge with short cross stitches, typical for finishing appliqués.",
    'Dichte (Abstand)': "Density (spacing)",
    'Abstand zwischen den Satin-Stichen. Kleiner = dichter und deckender, aber härter. Üblich: 0,35–0,45 mm.':
      "Spacing between the satin stitches. Smaller = denser and better coverage, but stiffer. Typical: 0.35–0.45 mm.",
    'Zugkompensation': "Pull compensation",
    'Der Faden zieht den Stoff zusammen, Satin wird schmaler als gezeichnet. Dieser Wert macht die Säule etwas breiter. Üblich: 0,1–0,3 mm.':
      "The thread pulls the fabric in, so satin comes out narrower than drawn. This value makes the column a little wider. Typical: 0.1–0.3 mm.",
    'Unterlage': "Underlay",
    'Stiche unter dem Satin, die den Stoff festhalten und den Satin anheben. Schmal: Mittellauf. Breit: Kante + Zickzack.':
      "Stitches under the satin that hold the fabric in place and lift the satin. Narrow: center run. Wide: edge run + zigzag.",
    'Auto-Split': "Auto split",
    'Satinstiche länger als dieser Wert werden geteilt, damit sie nicht hängen bleiben. Üblich: 7 mm. 0 = nie teilen.':
      "Satin stitches longer than this are split so they don’t snag. Typical: 7 mm. 0 = never split.",
    'Kurzstiche in Bögen': "Short stitches in curves",
    'An der Innenseite von Kurven und Ecken endet jeder zweite Stich früher – sonst häufen sich dort die Einstiche zu einem Knubbel.':
      "On the inside of curves and corners every other stitch ends earlier – otherwise the needle points pile up into a lump there.",
    '3D-Puff (Schaum)': "3D puff (foam)",
    'Für erhabene Stickerei mit Schaum: sehr dicht, ohne Unterlage, Enden verstärkt, Maschine stoppt zum Auflegen des Schaums.':
      "For raised embroidery with foam: very dense, no underlay, reinforced ends, the machine stops so you can place the foam.",
    'Breite': "Width",
    'Breite der Satinlinie in mm. Gut sticken lassen sich etwa 1,5–8 mm; breiter wird automatisch geteilt.':
      "Width of the satin line in mm. About 1.5–8 mm stitches well; wider columns are split automatically.",
    'Füllart': "Fill type",
    'Tatami = Reihen (Standard). Satin = glänzend, nur kleine Flächen. Kontur/Spirale = folgt dem Rand. Welle, Muster, Verlauf, Kreuzstich = Effekte.':
      "Tatami = rows (default). Satin = shiny, small areas only. Contour/spiral = follows the edge. Wave, pattern, gradient, cross stitch = effects.",
    'Muster': "Pattern",
    'Welches Muster die versetzten Einstiche in der Fläche bilden: Rauten, Diagonalen, Ziegel oder Wellen.':
      "The pattern formed by the offset needle points in the fill: diamonds, diagonals, bricks or waves.",
    'Wellenhöhe': "Wave height",
    'Wie stark die Reihen auf und ab schwingen. Üblich: 1–3 mm.': "How strongly the rows swing up and down. Typical: 1–3 mm.",
    'Wellenlänge': "Wavelength",
    'Abstand von Wellenberg zu Wellenberg. Größer = ruhigere, flachere Wellen.':
      "Distance from crest to crest. Larger = calmer, flatter waves.",
    'Verlauf bis Abstand': "Gradient to spacing",
    'Die Fläche beginnt dicht und wird zur anderen Seite immer lockerer, bis zu diesem Reihenabstand. Spart Stiche, wirkt wie ein Farbverlauf.':
      "The fill starts dense and gets more and more open towards the other side, up to this row spacing. Saves stitches and looks like a color gradient.",
    'Kreuzgröße': "Cross size",
    'Größe eines Kreuzstich-Kästchens. Üblich: 2–3 mm.': "Size of one cross-stitch cell. Typical: 2–3 mm.",
    'Kreuze doppelt': "Double crosses",
    'Jeder Kreuzschenkel wird zweimal gestickt – kräftiger und deckender.':
      "Each leg of the cross is stitched twice – bolder and better coverage.",
    'Dichte (Reihenabstand)': "Density (row spacing)",
    'Abstand zwischen den Stichreihen. Kleiner = dichter. Üblich: 0,4 mm; dünne Stoffe eher 0,45, Frottee 0,35.':
      "Spacing between the stitch rows. Smaller = denser. Typical: 0.4 mm; thin fabrics rather 0.45, terry 0.35.",
    'Länge der Stiche in jeder Reihe. Üblich: 3–4 mm. Länger als 7 mm kann hängen bleiben.':
      "Length of the stitches in each row. Typical: 3–4 mm. Longer than 7 mm may snag.",
    'Stichwinkel': "Stitch angle",
    'Richtung der Stichreihen in Grad. Verschiedene Winkel bei benachbarten Flächen lassen sie sich optisch abheben. Mit „Umformen“ am orangen Griff ziehen.':
      "Direction of the stitch rows in degrees. Different angles on neighboring fills make them stand apart. Drag the orange handle with “Reshape”.",
    'Gleicht das Zusammenziehen des Stoffes aus, die Fläche wird quer zu den Stichen etwas verlängert. Üblich: 0,2 mm.':
      "Compensates for the fabric pulling in; the fill is extended slightly across the stitches. Typical: 0.2 mm.",
    'Stiche unter der Fläche, die den Stoff stabilisieren. Kante + Tatami ist für die meisten Stoffe richtig.':
      "Stitches under the fill that stabilize the fabric. Edge run + tatami is right for most fabrics.",
    'Satin-Split': "Satin split",
    'Nur für Satin-Flächen: Stiche länger als dieser Wert werden geteilt.': "Only for satin fills: stitches longer than this are split.",
    'Kontur': "Border",
    'Optionaler Rand um die Fläche: Laufstich, Dreifachstich oder Satin. Deckt die Kante sauber ab.':
      "Optional border around the fill: run stitch, triple stitch or satin. Covers the edge cleanly.",
    'Satin-Konturbreite': "Satin border width",
    'Breite des Satinrands um die Fläche.': "Width of the satin border around the fill.",
    'Verbindung davor': "Connection before",
    'Wie die Maschine vom vorigen Objekt hierher kommt: automatisch, immer schneiden, springen ohne Schnitt oder direkt als Stich.':
      "How the machine gets here from the previous object: automatic, always trim, jump without trim, or directly as a stitch.",
    'Maschine stoppt davor': "Machine stops before",
    'Die Maschine hält vor diesem Objekt an, z. B. um Applikationsstoff oder Puff-Schaum aufzulegen.':
      "The machine stops before this object, e.g. so you can place appliqué fabric or puff foam.",
    'An Stoff anpassen': "Adapt to fabric",
    'Ein: Dichte, Zugausgleich, Unterlage usw. werden automatisch aus Stoff und Breite berechnet („auto“). Von Hand geänderte Werte bleiben.':
      "On: density, pull compensation, underlay etc. are calculated automatically from fabric and width (“auto”). Values you changed by hand are kept.",
    'Wieder automatisch': "Back to automatic",
    'Setzt alle von Hand geänderten Werte zurück auf die automatische Berechnung für den gewählten Stoff.':
      "Resets all values changed by hand to the automatic calculation for the selected fabric.",
    'Text bearbeiten': "Edit text",
    'Öffnet den Textdialog: Wortlaut, Schrift, Größe, Bogen und Hüllform ändern. Der Text wird neu gesetzt.':
      "Opens the text dialog: change wording, font, size, arc and envelope. The text is rebuilt.",
    'Buchstaben anpassen': "Adjust letters",
    'Einzelne Buchstaben verschieben, drehen oder vergrößern und den Abstand zwischen Buchstaben (Kerning) von Hand einstellen.':
      "Move, rotate or enlarge individual letters and set the spacing between letters (kerning) by hand.",
    'Macht jeden Buchstaben zu einem eigenen Objekt. Danach ist der Text nicht mehr als Text änderbar.':
      "Makes every letter a separate object. After that the text can no longer be edited as text.",
  });

  /* =====================================================================
     Hilfe-Infos in Dialogen (help_dialogs.js)
     ===================================================================== */
  Object.assign(E.exact, {
    'Hinweise nicht aufklappen': "Don’t pop up notices",
    'Ein Haken schaltet das automatische Fenster bei Problemen ab. Die Prüfung läuft trotzdem weiter und zeigt ihr Ergebnis unten in der Statusleiste.':
      "A check mark turns off the automatic window when problems are found. The check still runs and shows its result in the status bar at the bottom.",
    'Stoff-Details': "Fabric details",
    'Zeigt alle Empfehlungen für den gewählten Stoff: Vlies, Topper, Nadel, Geschwindigkeit und welche Stichwerte automatisch angepasst werden.':
      "Shows all recommendations for the selected fabric: stabilizer, topping, needle, speed and which stitch values are adjusted automatically.",
    'Knockdown-Stich hinzufügen': "Add knockdown stitch",
    'Bei Stoffen mit Flor (Frottee, Fleece, Strick, Piqué) drückt ein lockeres Gitter unter dem Motiv die Schlaufen flach, damit feine Details nicht versinken.':
      "On fabrics with pile (terry, fleece, knits, piqué) a loose grid under the design flattens the loops so fine details don’t sink in.",

    /* Kopien anordnen */
    'Art der Anordnung': "Arrangement type",
    'Kreis: Kopien gleichmäßig rundherum verteilt (z. B. Blütenblätter). Raster: Kopien in Reihen und Spalten (z. B. mehrere Abzeichen auf einem Stoffstück).':
      "Circle: copies evenly spread all around (e.g. petals). Grid: copies in rows and columns (e.g. several badges on one piece of fabric).",
    'Anzahl im Kreis': "Number in circle",
    'Wie viele Exemplare insgesamt entstehen – das Original zählt mit. Erlaubt sind 2 bis 72.':
      "How many copies are created in total – the original counts too. 2 to 72 are allowed.",
    'Kreis-Radius': "Circle radius",
    'Abstand vom Mittelpunkt bis zu den Kopien in mm. Das Original wird dabei oben auf den Kreis gesetzt. Bei 0 bleibt es, wo es ist.':
      "Distance from the center to the copies in mm. The original is placed at the top of the circle. At 0 it stays where it is.",
    'Kreis-Mittelpunkt': "Circle center",
    'Rahmenmitte: Kreis um die Mitte des Stickrahmens. „Unter der Auswahl“: Der Mittelpunkt liegt genau um den Radius unterhalb des Originals.':
      "Hoop center: circle around the center of the hoop. “Below the selection”: the center lies exactly one radius below the original.",
    'Kopien mitdrehen': "Rotate copies",
    'Mit Haken zeigt jede Kopie zur Kreismitte (wie Speichen). Ohne Haken bleiben alle Kopien aufrecht, nur ihre Position wandert im Kreis.':
      "When checked, every copy points to the center of the circle (like spokes). When unchecked, all copies stay upright and only their position moves around the circle.",
    'Spalten': "Columns",
    'Anzahl der Exemplare nebeneinander (waagrecht), inklusive Original.': "Number of copies side by side (horizontally), including the original.",
    'Reihen': "Rows",
    'Anzahl der Exemplare untereinander (senkrecht), inklusive Original.': "Number of copies stacked (vertically), including the original.",
    'Abstand waagrecht': "Horizontal gap",
    'Lücke in mm zwischen den Kopien nebeneinander – gemessen von Kante zu Kante, nicht von Mitte zu Mitte.':
      "Gap in mm between copies side by side – measured edge to edge, not center to center.",
    'Abstand senkrecht': "Vertical gap",
    'Lücke in mm zwischen den Reihen – gemessen von Kante zu Kante.': "Gap in mm between the rows – measured edge to edge.",

    /* Hilfslinien */
    'Einrasten': "Snap",
    'Punkte springen beim Zeichnen und Verschieben auf das Raster und an Hilfslinien. Praktisch für gerade, exakt ausgerichtete Formen.':
      "Points snap to the grid and guides while drawing and moving. Handy for straight, precisely aligned shapes.",
    'Rasterweite': "Grid spacing",
    'Abstand der Rasterpunkte in mm, an denen eingerastet wird. Üblich: 1–5 mm; kleiner für feine Arbeiten.':
      "Distance in mm between the grid points that things snap to. Typical: 1–5 mm; smaller for fine work.",
    'Richtung der Hilfslinie': "Guide direction",
    'Senkrecht: Linie bei einem festen X-Wert. Waagrecht: Linie bei einem festen Y-Wert. Hilfslinien werden nicht gestickt.':
      "Vertical: line at a fixed X value. Horizontal: line at a fixed Y value. Guides are not stitched.",
    'Position der Hilfslinie': "Guide position",
    'Lage der neuen Linie in mm, gemessen von der Rahmenmitte (0). Feld leer lassen, wenn keine neue Linie angelegt werden soll.':
      "Position of the new line in mm, measured from the hoop center (0). Leave the field empty if you don’t want to add a new line.",

    /* Farbe bearbeiten */
    'Farbe': "Color",
    'Bildschirmfarbe dieses Garns. Wird sie von Hand geändert, wird die Zuordnung zur Garnnummer gelöscht.':
      "Screen color of this thread. If you change it by hand, the link to the thread number is removed.",
    'Name / Garnnummer': "Name / thread number",
    'Freier Name der Farbe, z. B. „Madeira 1800 Rot“. Erscheint auf dem Arbeitsblatt, damit an der Maschine das richtige Garn eingefädelt wird.':
      "Any name for the color, e.g. “Madeira 1800 Red”. It appears on the worksheet so the right thread gets threaded on the machine.",
    'Nadel': "Needle",
    'Auf welcher Nadel (1–15) dieses Garn an der Mehrnadelmaschine liegt. Bei Einnadel-Maschinen ohne Bedeutung.':
      "Which needle (1–15) this thread is on in a multi-needle machine. Irrelevant for single-needle machines.",
    'Garnmarke': "Thread brand",
    'Hersteller, aus dessen Farbkarte unten ein Garn gewählt wird (z. B. Madeira, Isacord). Ohne Suche erscheinen die 24 ähnlichsten Garne.':
      "Manufacturer whose thread chart you pick from below (e.g. Madeira, Isacord). Without a search, the 24 closest threads are shown.",
    'Garn suchen': "Search thread",
    'Nach Garnnummer oder Farbname suchen, z. B. „1800“ oder „rot“. Deutsche Farbwörter werden ebenfalls erkannt.':
      "Search by thread number or color name, e.g. “1800” or “red”. German color words are recognized too.",

    /* Teamnamen */
    'Platzhalter-Text': "Placeholder text",
    'Das Textobjekt im Design, das gegen jeden Namen der Liste ausgetauscht wird. Schrift, Größe und Lage bleiben erhalten.':
      "The text object in the design that is replaced by each name in the list. Font, size and position are kept.",
    'Namensliste': "Name list",
    'Ein Name pro Zeile, z. B. „MÜLLER 10“. Für jede Zeile entsteht eine eigene Stickdatei.':
      "One name per line, e.g. “SMITH 10”. Each line gets its own embroidery file.",
    'Höchstbreite': "Maximum width",
    'Zu lange Namen werden auf diese Breite in mm verkleinert, damit sie z. B. zwischen die Schulterblätter passen. 0 = Größe nie ändern.':
      "Names that are too long are reduced to this width in mm, e.g. so they fit between the shoulder blades. 0 = never change the size.",
    'Dateiformat': "File format",
    'Format der Stickdateien. DST für Tajima-kompatible Industriemaschinen, PES für Brother, JEF für Janome, EXP für Melco/Bernina.':
      "Format of the embroidery files. DST for Tajima-compatible industrial machines, PES for Brother, JEF for Janome, EXP for Melco/Bernina.",
    'Dateiname': "File name",
    'Anfang der Dateinamen. An ihn wird jeweils der Name angehängt, z. B. „Trikot_MÜLLER 10.dst“.':
      "Start of the file names. Each name is appended to it, e.g. “Jersey_SMITH 10.dst”.",

    /* Mehrfach-Einspannung */
    'Rahmen je Einspannung': "Hoop per hooping",
    'Der Rahmen, mit dem jedes Teilstück gestickt wird. Nur eckige Rahmen sind möglich. Je größer der Rahmen, desto weniger Einspannungen.':
      "The hoop each section is stitched with. Only rectangular hoops are possible. The larger the hoop, the fewer hoopings.",
    'Überlappung': "Overlap",
    'So viele mm überlappen sich benachbarte Teilstücke. Hier sitzen die Passmarken. Üblich: 15–25 mm.':
      "How many mm neighboring sections overlap. The registration marks sit here. Typical: 15–25 mm.",
    'Passmarken': "Registration marks",
    'Kleine Kreuze im Überlappungsbereich: am Ende einer Einspannung und am Anfang der nächsten gestickt, um den Stoff exakt auszurichten. Danach entfernen.':
      "Small crosses in the overlap area: stitched at the end of one hooping and at the start of the next to align the fabric exactly. Remove them afterwards.",
    'Format der Stickdateien je Einspannung. DST für Tajima-kompatible Maschinen, PES für Brother, JEF für Janome, EXP für Melco/Bernina.':
      "Format of the embroidery file for each hooping. DST for Tajima-compatible machines, PES for Brother, JEF for Janome, EXP for Melco/Bernina.",

    /* Produkt-Vorschau */
    'Produkt': "Product",
    'Kleidungsstück oder Artikel, auf dem das Design in der Vorschau gezeigt wird.': "Garment or item the design is shown on in the mockup.",
    'Platzierung': "Placement",
    'Stelle auf dem Produkt, z. B. linke Brust oder Rücken. Die Auswahl hängt vom gewählten Produkt ab.':
      "Position on the product, e.g. left chest or back. The choices depend on the selected product.",
    'Stofffarbe': "Fabric color",
    'Farbe des Produkts in der Vorschau – zeigt, wie die Garnfarben auf dem Stoff wirken.':
      "Color of the product in the mockup – shows how the thread colors look on the fabric.",

    /* Preiskalkulation */
    'Berechnungsart': "Pricing method",
    'Nach Stichzahl: Preis je 1000 Stiche plus Farbaufschlag. Nach Maschinenzeit: Stundensatz mal geschätzter Laufzeit inkl. Farbwechsel und Einspannen.':
      "By stitch count: price per 1000 stitches plus a color surcharge. By machine time: hourly rate times estimated run time incl. color changes and hooping.",
    'Preis je 1000 Stiche': "Price per 1000 stitches",
    'Gilt bei Berechnung nach Stichzahl. Üblich sind etwa 0,50–1,50 € je 1000 Stiche, je nach Region und Menge.':
      "Applies when pricing by stitch count. About €0.50–1.50 per 1000 stitches is typical, depending on region and quantity.",
    'Stundensatz Maschine': "Machine hourly rate",
    'Kosten einer Maschinenstunde in €. Gilt nur bei Berechnung nach Maschinenzeit.':
      "Cost of one machine hour in €. Only applies when pricing by machine time.",
    'Aufschlag je Farbe': "Surcharge per color",
    'Zuschlag in € pro Garnfarbe im Design (für Farbwechsel). Gilt bei Berechnung nach Stichzahl.':
      "Surcharge in € per thread color in the design (for color changes). Applies when pricing by stitch count.",
    'Mindestpreis je Stück': "Minimum price per piece",
    'Untergrenze für den Stickpreis pro Stück – greift bei sehr kleinen Motiven. Textil kommt danach noch dazu.':
      "Lower limit for the embroidery price per piece – kicks in for very small designs. The garment is added on top.",
    'Einspannzeit je Stück': "Hooping time per piece",
    'Minuten für Einspannen und Ausspannen pro Stück. Fließt in die Maschinenzeit ein. Üblich: 1–2 min.':
      "Minutes for hooping and unhooping per piece. Included in the machine time. Typical: 1–2 min.",
    'Textil je Stück': "Garment per piece",
    'Preis des Kleidungsstücks in €, wenn Sie es liefern. 0, wenn der Kunde die Textilien selbst mitbringt (beistellt).':
      "Price of the garment in € if you supply it. 0 if the customer brings their own garments.",
    'Einrichtung je Auftrag': "Setup per order",
    'Einmalige Kosten pro Auftrag für Einrichten der Maschine, Garn einfädeln und Probestick – unabhängig von der Stückzahl.':
      "One-time cost per order for setting up the machine, threading and a test sew-out – regardless of quantity.",
    'Digitalisierung': "Digitizing",
    'Einmaliger Preis für das Erstellen der Stickdatei. 0, wenn nicht berechnet.':
      "One-time price for creating the embroidery file. 0 if not charged.",
    'Mengenrabatt': "Quantity discount",
    'Staffel als „Stück:Prozent“, durch Komma getrennt, z. B. „1:0, 10:5, 50:15“. Jeder Eintrag ergibt eine Zeile in der Preistabelle.':
      "Tiers as “pieces:percent”, separated by commas, e.g. “1:0, 10:5, 50:15”. Each entry becomes one row in the price table.",
    'Mehrwertsteuer': "VAT",
    'Steuersatz in % für die Brutto-Preise. In Deutschland üblich: 19 %.': "Tax rate in % for the gross prices. Standard in Germany: 19%.",

    /* Bibliothek */
    'Name': "Name",
    'Unter diesem Namen erscheint das Design in der Bibliothek. Er wird auch als Projektname übernommen.':
      "The design appears under this name in the library. It is also used as the project name.",
    'Stichworte': "Keywords",
    'Begriffe zum späteren Wiederfinden, durch Komma getrennt, z. B. „Logo, Verein, Kappe“.':
      "Terms to find it again later, separated by commas, e.g. “logo, club, cap”.",
    'Kunde': "Customer",
    'Für wen das Design ist. Danach lässt sich in der Bibliothek suchen.': "Who the design is for. You can search the library by it.",
    'Bibliothek durchsuchen': "Search library",
    'Filtert die Designs nach Name, Stichwort oder Kunde.': "Filters the designs by name, keyword or customer.",
    'Sortierung': "Sort order",
    'Reihenfolge der Designs: neueste zuerst, alphabetisch nach Name oder nach Stichzahl.':
      "Order of the designs: newest first, alphabetically by name, or by stitch count.",
    'Aktuelles Design speichern': "Save current design",
    'Legt das gerade geöffnete Design in der Bibliothek ab. Die Bibliothek liegt nur in diesem Browser – zusätzlich als Projektdatei sichern.':
      "Stores the currently open design in the library. The library lives only in this browser – also keep a backup as a project file.",

    /* Applikation */
    'Heftstich': "Tack-down",
    'Hält den aufgelegten Applikationsstoff fest, bevor er zugeschnitten wird. Zickzack hält gut, Doppel-Laufstich ist unauffällig, E-Stich liegt dazwischen.':
      "Holds the placed appliqué fabric in place before it is trimmed. Zigzag holds well, double run is inconspicuous, E-stitch is in between.",
    'Abdeckung': "Cover stitch",
    'Stich, der die Schnittkante des Stoffes verdeckt. Satin: klassischer, glänzender Rand. E-Stich (Langette): leichter, dekorativer Rand.':
      "Stitch that covers the cut edge of the fabric. Satin: classic, shiny border. E-stitch (blanket stitch): lighter, decorative border.",
    'Breite der Abdeckung': "Cover width",
    'Breite des Randstichs in mm. Breiter verdeckt unsauber geschnittene Kanten besser. Üblich: 3–4 mm.':
      "Width of the border stitch in mm. Wider hides roughly cut edges better. Typical: 3–4 mm.",
    'Löcher einfassen': "Finish holes",
    'Auch innere Aussparungen der Form (z. B. das Loch im „O“) bekommen Platzierung, Heftstich und Abdeckung.':
      "Inner cut-outs of the shape (e.g. the hole in an “O”) also get placement, tack-down and cover stitch.",
    'Eigene Farbe für Abdeckung': "Separate color for cover",
    'Die Abdeckung wird in der aktuell gewählten Palettenfarbe gestickt statt in der Farbe der Form – z. B. ein dunkler Rand um hellen Stoff.':
      "The cover stitch is sewn in the currently selected palette color instead of the shape’s color – e.g. a dark border around light fabric.",

    /* Knockdown */
    'Rand um das Motiv': "Margin around design",
    'So weit in mm ragt das Knockdown-Gitter über das Motiv hinaus. Üblich: 1–2 mm.':
      "How far in mm the knockdown grid extends beyond the design. Typical: 1–2 mm.",
    'Gitterabstand': "Grid spacing",
    'Abstand der Gitterlinien in mm. Kleiner drückt den Flor stärker, braucht aber mehr Stiche. Üblich: 1,5–2 mm.':
      "Spacing of the grid lines in mm. Smaller flattens the pile more but needs more stitches. Typical: 1.5–2 mm.",
    'Gitterwinkel': "Grid angle",
    'Richtung der Gitterlinien in Grad. Meist 45°.': "Direction of the grid lines in degrees. Usually 45°.",
    'Farbe des Knockdowns': "Knockdown color",
    'Am besten Stofffarbe – dann ist das Gitter unsichtbar. Dafür wird eine neue Palettenfarbe in Stofffarbe angelegt.':
      "Ideally the fabric color – then the grid is invisible. A new palette color in the fabric color is created for it.",

    /* Kappe */
    'Farbreihenfolge behalten': "Keep color order",
    'Mit Haken bleiben die Farben in ihrer Reihenfolge und nur innerhalb jeder Farbe wird von der Mitte nach außen sortiert. Ohne Haken gibt es mehr Farbwechsel.':
      "When checked, the colors stay in their order and only the objects within each color are sorted from the center outwards. When unchecked, there are more color changes.",
    'Kappenrahmen und Stoff wählen': "Select cap hoop and fabric",
    'Stellt zusätzlich einen Kappenrahmen und den Stoff „Kappe“ ein, damit Dichte und Zugausgleich passen.':
      "Also selects a cap hoop and the fabric “Cap” so density and pull compensation are right.",

    /* Garnmarke */
    'Jede Palettenfarbe bekommt das ähnlichste Garn dieser Marke. Die Tabelle zeigt vorher, wie gut es passt (ΔE = Farbabstand).':
      "Each palette color gets the closest thread of this brand. The table shows beforehand how well it matches (ΔE = color difference).",
    'Neue Farben automatisch zuordnen': "Match new colors automatically",
    'Farben aus Import und Auto-Digitalisieren bekommen gleich das nächste Garn der gewählten Marke.':
      "Colors from imports and auto-digitizing immediately get the closest thread of the selected brand.",

    /* Buchstaben einzeln */
    'Abstand davor': "Spacing before",
    'Verschiebt diesen Buchstaben und alle folgenden waagrecht (Kerning) in mm. Negativ rückt näher zusammen.':
      "Moves this letter and all following ones horizontally (kerning) in mm. Negative moves them closer together.",
    'X verschieben': "Move X",
    'Verschiebt nur diesen Buchstaben waagrecht in mm. Positiv = nach rechts.': "Moves only this letter horizontally in mm. Positive = to the right.",
    'Y verschieben': "Move Y",
    'Verschiebt nur diesen Buchstaben senkrecht in mm. Positiv = nach oben.': "Moves only this letter vertically in mm. Positive = up.",
    'Buchstabe drehen': "Rotate letter",
    'Dreht nur diesen Buchstaben um den angegebenen Winkel in Grad.': "Rotates only this letter by the given angle in degrees.",
    'Buchstabengröße': "Letter size",
    'Größe dieses Buchstabens in Prozent. 100 = unverändert, z. B. 70 für kleinere Seitenbuchstaben im Monogramm.':
      "Size of this letter in percent. 100 = unchanged, e.g. 70 for smaller side letters in a monogram.",

    /* Text auf Linie */
    'Seite': "Side",
    'Ob der Text oberhalb oder unterhalb der Linie steht – unterhalb z. B. für Schrift unten an einem Kreis.':
      "Whether the text sits above or below the line – below e.g. for lettering at the bottom of a circle.",
    'Ausrichtung': "Alignment",
    'Wo der Text auf der Linie sitzt: mittig, am Anfang oder am Ende der Linie.':
      "Where the text sits on the line: centered, at the start or at the end of the line.",
    'Verschieben entlang der Linie': "Offset along line",
    'Schiebt den Text in mm an der Linie entlang, z. B. um ihn auf einem Kreis zu drehen.':
      "Slides the text along the line in mm, e.g. to rotate it around a circle.",
    'Linie danach': "Line afterwards",
    'Was mit der Führungslinie passiert: ausblenden (wird nicht gestickt), mitsticken (als Zierlinie) oder ganz löschen.':
      "What happens to the guide line: hide it (not stitched), stitch it too (as a decorative line) or delete it.",

    /* Monogramm */
    'Initialen': "Initials",
    '2 bis 3 Buchstaben für das Monogramm, z. B. „ABC“.': "2 to 3 letters for the monogram, e.g. “ABC”.",
    'Vorlage': "Template",
    'Klassisch: mittlerer Buchstabe groß (bei 3 Buchstaben). Kreis, Raute oder Linien fügen einen gestickten Rahmen aus Satin hinzu.':
      "Classic: large middle letter (with 3 letters). Circle, diamond or lines add an embroidered satin frame.",
    'Schrift': "Font",
    'Fertig digitalisierte Stickschrift. Monogramm- und Serifenschriften stehen oben in der Liste.':
      "Ready-digitized embroidery font. Monogram and serif fonts are at the top of the list.",
    'Höhe': "Height",
    'Höhe der Buchstaben in mm. Üblich: 20–40 mm für Handtücher oder Hemden.': "Height of the letters in mm. Typical: 20–40 mm for towels or shirts.",
    'Breite der Umrandung': "Frame width",
    'Breite der Satinlinie für Kreis, Raute oder Linien in mm. Üblich: 2–3 mm.':
      "Width of the satin line for circle, diamond or lines in mm. Typical: 2–3 mm.",

    /* Text */
    'Der zu stickende Text, z. B. ein Name oder Vereinsname.': "The text to embroider, e.g. a name or club name.",
    'Schriftart': "Font",
    'Stickschriften sind fertig digitalisiert und sticken am saubersten. Andere Schriften werden automatisch in Satin umgewandelt.':
      "Embroidery fonts are ready-digitized and stitch the cleanest. Other fonts are converted to satin automatically.",
    'Höhe Großbuchstaben': "Capital height",
    'Höhe der Großbuchstaben in mm. Satinschrift unter ca. 5 mm wird unleserlich. Bei Stickschriften wird die empfohlene Größe vorgeschlagen.':
      "Height of the capital letters in mm. Satin lettering below about 5 mm becomes illegible. For embroidery fonts the recommended size is suggested.",
    'Zeichenabstand': "Letter spacing",
    'Zusätzlicher Abstand zwischen den Buchstaben in %. Negativ rückt sie enger zusammen.':
      "Extra spacing between the letters in %. Negative moves them closer together.",
    'Bogen-Radius': "Arc radius",
    'Legt den Text auf einen Kreisbogen mit diesem Radius in mm. 0 = gerade, negativ = Bogen nach unten (Text unten am Kreis).':
      "Puts the text on an arc with this radius in mm. 0 = straight, negative = arc downwards (text at the bottom of a circle).",
    'Hüllform': "Envelope",
    'Verzerrt den ganzen Schriftzug in eine Form, z. B. Brücke, Welle oder Wimpel – typisch für Vereinslogos.':
      "Warps the whole lettering into a shape, e.g. bridge, wave or pennant – typical for club logos.",
    'Stärke der Hüllform': "Envelope strength",
    'Wie stark die Hüllform den Text verbiegt, in mm. Üblich: 3–10 mm.': "How much the envelope bends the text, in mm. Typical: 3–10 mm.",
    'Text auf Linie': "Text on line",
    'Der Text folgt einer Linie. „Von der Linie lösen“ setzt ihn wieder gerade.':
      "The text follows a line. “Detach from line” makes it straight again.",
    'Satin: glänzend, folgt Kurven – ideal für Schrift. Tatami: flächige Füllung für sehr große Buchstaben. Automatisch: breite Teile werden Tatami.':
      "Satin: shiny, follows curves – ideal for lettering. Tatami: flat fill for very large letters. Automatic: wide parts become tatami.",
    'Fett': "Bold",
    'Macht die Buchstaben künstlich dicker. Nur bei automatisch umgewandelten Schriften.':
      "Makes the letters artificially thicker. Only for automatically converted fonts.",
    'Kursiv': "Italic",
    'Neigt die Buchstaben künstlich schräg. Nur bei automatisch umgewandelten Schriften.':
      "Slants the letters artificially. Only for automatically converted fonts.",

    /* Stickrahmen */
    'Aktiver Rahmen': "Active hoop",
    'Der Stickrahmen, in dem gestickt wird. Er bestimmt das nutzbare Stickfeld und den Prüfbereich.':
      "The hoop being used. It defines the usable sewing field and the area that is checked.",
    'Verschiebt das ganze Design so, dass seine Mitte genau in der Rahmenmitte liegt.':
      "Moves the whole design so its center sits exactly at the hoop center.",
    'In Rahmen einpassen': "Fit into hoop",
    'Vergrößert oder verkleinert das Design so, dass es das Stickfeld des Rahmens ausfüllt, und setzt es in die Mitte.':
      "Enlarges or reduces the design so it fills the hoop’s sewing field, and centers it.",
    'Rahmenname': "Hoop name",
    'Name für den eigenen Rahmen, z. B. „Rundrahmen 20 cm“. Bleibt leer, wird ein Name aus den Maßen gebildet.':
      "Name for your custom hoop, e.g. “Round hoop 20 cm”. If left empty, a name is made from the dimensions.",
    'Rahmenform': "Hoop shape",
    'Form des Stickfelds: rund, eckig oder oval.': "Shape of the sewing field: round, rectangular or oval.",
    'Breite / Durchmesser': "Width / diameter",
    'Nutzbare Breite des Stickfelds in mm, bei runden Rahmen der Durchmesser. Innenmaß messen, nicht die Außenkante.':
      "Usable width of the sewing field in mm; for round hoops the diameter. Measure the inside, not the outer edge.",
    'Nutzbare Höhe des Stickfelds in mm. Nur bei eckigen und ovalen Rahmen.':
      "Usable height of the sewing field in mm. Only for rectangular and oval hoops.",
    'Sicherheitsabstand': "Safety margin",
    'Abstand zum Rahmenrand in mm, in dem nicht gestickt werden sollte, damit der Fuß nicht an den Rahmen stößt. Üblich: 5 mm.':
      "Distance from the hoop edge in mm where you shouldn’t stitch, so the presser foot doesn’t hit the hoop. Typical: 5 mm.",
    'Rahmen anlegen': "Add hoop",
    'Speichert den eigenen Rahmen mit diesen Maßen und wählt ihn gleich aus.': "Saves the custom hoop with these dimensions and selects it right away.",

    /* Vektorimport */
    'Breite im Stickmotiv': "Width in design",
    'Gewünschte Breite des Motivs in mm. Die Höhe passt sich an. Der Höchstwert für den Rahmen steht daneben.':
      "Desired width of the design in mm. The height adjusts. The maximum for the hoop is shown next to it.",
    'Schmale Formen als Satin': "Narrow shapes as satin",
    'Formen bis zu dieser Strichbreite in mm werden als Satin gestickt, breitere als Tatami-Fläche. Üblich: 7 mm; 0 = nie Satin.':
      "Shapes up to this stroke width in mm are stitched as satin, wider ones as tatami fill. Typical: 7 mm; 0 = never satin.",
    'Weiße Flächen weglassen': "Skip white areas",
    'Weiße Flächen sind meist Hintergrund und werden nicht gestickt. Haken entfernen, wenn Weiß wirklich gestickt werden soll.':
      "White areas are usually background and are not stitched. Uncheck this if white really should be stitched.",
    'Konturen übernehmen': "Keep outlines",
    'Linien der Grafik werden als Laufstich oder Satinlinie übernommen. Ohne Haken nur die Flächen.':
      "Lines in the graphic are imported as run stitch or satin line. Unchecked: fills only.",
    'Verdeckte Teile unten liegender Flächen werden ausgeschnitten. So liegen keine Stiche doppelt übereinander und das Motiv wird nicht zu dick.':
      "Hidden parts of fills underneath are cut out. That way no stitches are doubled up and the design doesn’t get too thick.",

    /* Maschine & Rahmen */
    'Maschinentyp': "Machine type",
    'Legt die Grenzwerte für die Stickprüfung fest. Industriemaschinen vertragen etwas breitere Satins und dichtere Stiche als Haushaltsmaschinen.':
      "Sets the limits for the stitch check. Industrial machines handle slightly wider satins and denser stitching than home machines.",
    'Längster Stich': "Longest stitch",
    'Längere Stiche meldet die Stickprüfung als Problem. Lange Stiche bleiben leicht hängen. Üblich: 12 mm.':
      "The stitch check reports longer stitches as a problem. Long stitches snag easily. Typical: 12 mm.",
    'Kürzester Stich': "Shortest stitch",
    'Kürzere Stiche meldet die Prüfung – sie führen zu Fadenrissen und Knoten. Üblich: 0,3–0,4 mm.':
      "The check reports shorter stitches – they cause thread breaks and knots. Typical: 0.3–0.4 mm.",
    'Satin ohne Teilung': "Satin without split",
    'Breitere Satinstiche ohne Teilung (Split) meldet die Prüfung, weil sie locker durchhängen. Üblich: 8–10 mm.':
      "The check reports wider satin stitches without a split because they sag loosely. Typical: 8–10 mm.",
    'Satin-Abstand mindestens': "Minimum satin spacing",
    'Dichtere Satins meldet die Prüfung – sie werden zu hart und können Nadeln brechen lassen. Üblich: 0,3 mm.':
      "The check reports denser satins – they get too stiff and can break needles. Typical: 0.3 mm.",
    'Pop-up bei Problemen': "Pop-up on problems",
    'Zeigt nach Änderungen automatisch ein Fenster, wenn die Stickprüfung Probleme findet. Ohne Haken nur der Hinweis in der Statusleiste.':
      "Automatically shows a window after changes when the stitch check finds problems. Unchecked: only the notice in the status bar.",
    'Hintergrundfarbe der Arbeitsfläche, damit die Garnfarben wie auf dem echten Stoff wirken. Wird auch für den Knockdown-Stich verwendet.':
      "Background color of the canvas so the thread colors look like on the real fabric. Also used for the knockdown stitch.",
    'Ein-/Ausstieg automatisch': "Automatic entry/exit",
    'Start- und Endpunkte der Objekte werden so gewählt, dass die Wege zum nächsten Objekt möglichst kurz sind – weniger Sprünge und Schnitte.':
      "Start and end points of the objects are chosen so the paths to the next object are as short as possible – fewer jumps and trims.",
    'Versteckte Laufwege': "Hidden travel runs",
    'Statt Fadenschnitt läuft der Faden als Laufstich unter einer später gestickten Fläche gleicher Farbe zum nächsten Objekt. Spart Zeit und Schnitte.':
      "Instead of a trim, the thread travels to the next object as a run stitch hidden under a fill of the same color stitched later. Saves time and trims.",
    'Direkt als Stich verbinden': "Connect directly with a stitch",
    'Liegen zwei Objekte näher als dieser Abstand in mm, wird einfach weitergestickt – ohne Sprung oder Schnitt. Üblich: 2 mm.':
      "If two objects are closer than this distance in mm, the machine simply keeps stitching – no jump or trim. Typical: 2 mm.",
    'Springen ohne Schnitt bis': "Jump without trim up to",
    'Bis zu diesem Abstand springt die Nadel ohne Fadenschnitt; der lose Faden (Sprungstich) muss später abgeschnitten werden. 0 = immer schneiden.':
      "Up to this distance the needle jumps without trimming; the loose thread (jump stitch) has to be cut off later. 0 = always trim.",
    'Vernähen bei Sprüngen': "Tie-in/off at jumps",
    'Auch vor und nach einem Sprung ohne Schnitt werden kleine Vernähstiche gesetzt, damit sich nichts aufzieht. Empfohlen: an.':
      "Small tie stitches are also placed before and after a jump without trim so nothing unravels. Recommended: on.",
    'Vernähen': "Tie-in/off",
    'Setzt am Anfang und Ende jedes Objekts winzige Sicherungsstiche, damit der Faden nach dem Schnitt nicht aufgeht. Empfohlen: an.':
      "Places tiny lock stitches at the start and end of every object so the thread doesn’t come undone after a trim. Recommended: on.",
    'Schnitt ab … Sprüngen': "Trim after … jumps",
    'DST kennt keinen Schnittbefehl – die Maschine schneidet nach so vielen Sprüngen in Folge. Muss mit der Maschineneinstellung übereinstimmen. Üblich: 3.':
      "DST has no trim command – the machine trims after this many jumps in a row. Must match the machine setting. Typical: 3.",
    'Geschwindigkeit': "Speed",
    'Stiche pro Minute. Dient zur Zeitschätzung und Preiskalkulation – die Maschine selbst wird damit nicht eingestellt. Üblich: 600–1000.':
      "Stitches per minute. Used for time estimates and pricing – it does not set the machine itself. Typical: 600–1000.",

    /* Bild-Einstellungen */
    'Bildbreite': "Image width",
    'Breite der Vorlage in mm. Die Höhe passt sich im gleichen Verhältnis an.': "Width of the backdrop in mm. The height adjusts proportionally.",
    'Deckkraft': "Opacity",
    'Wie stark das Bild durchscheint. Weniger Deckkraft macht die Stiche darüber besser sichtbar. Üblich: 30–50 %.':
      "How strongly the image shows. Lower opacity makes the stitches on top easier to see. Typical: 30–50%.",
    'Position X': "Position X",
    'Lage der linken Bildkante in mm, gemessen von der Rahmenmitte.': "Position of the left image edge in mm, measured from the hoop center.",
    'Position Y': "Position Y",
    'Lage der oberen Bildkante in mm, gemessen von der Rahmenmitte.': "Position of the top image edge in mm, measured from the hoop center.",

    /* Auto-Digitalisieren */
    'Anzahl Farben': "Number of colors",
    'Auf so viele Farben wird das Bild reduziert. Jede Farbe wird ein Garnwechsel. Für Logos meist 2–6.':
      "The image is reduced to this many colors. Each color means a thread change. Usually 2–6 for logos.",
    'Breite Stickmotiv': "Design width",
    'Breite des fertigen Motivs in mm. Das Bild wird auf diese Breite gebracht.': "Width of the finished design in mm. The image is scaled to this width.",
    'Detailstufe': "Detail level",
    'Wie fein das Bild abgetastet wird (Pixel pro mm). Höher erfasst feinere Details, dauert aber länger. Üblich: 6–10.':
      "How finely the image is sampled (pixels per mm). Higher captures finer details but takes longer. Typical: 6–10.",
    'Kleinste Fläche': "Smallest area",
    'Kleinere Farbflecken in mm² werden weggelassen – das entfernt Bildrauschen und winzige, nicht stickbare Stellen.':
      "Smaller color spots in mm² are left out – this removes image noise and tiny areas that can’t be stitched.",
    'Automatisch: Schrift und schmale Formen werden Satin, breite Flächen Tatami (flächige Füllung). Oder alles als Tatami.':
      "Automatic: lettering and narrow shapes become satin, wide areas tatami (flat fill). Or everything as tatami.",
    'Satin bis Strichbreite': "Satin up to stroke width",
    'Formen bis zu dieser Breite in mm werden als Satin gestickt, breitere als Tatami. Üblich: 7 mm.':
      "Shapes up to this width in mm are stitched as satin, wider ones as tatami. Typical: 7 mm.",
    'Tatami-Winkel': "Tatami angle",
    'Stichrichtung der Tatami-Flächen in Grad. Üblich: 45°. Benachbarte Flächen mit unterschiedlichem Winkel wirken lebendiger.':
      "Stitch direction of the tatami fills in degrees. Typical: 45°. Neighboring fills with different angles look livelier.",
    'Hintergrund weglassen': "Skip background",
    'Die Hintergrundfarbe des Bildes wird nicht gestickt.': "The background color of the image is not stitched.",
    'Konturen': "Outlines",
    'Zusätzlich einen Laufstich um die Flächen legen – für sauberere Kanten.': "Also places a run stitch around the fills – for cleaner edges.",
    'Vorhandene Objekte ersetzen': "Replace existing objects",
    'Löscht vorher alle Objekte im Design. Ohne Haken werden die neuen Objekte hinzugefügt.':
      "Deletes all objects in the design first. Unchecked: the new objects are added.",

    /* Export */
    'Name der Stickdatei und des Designs. Die Endung wird automatisch angehängt.':
      "Name of the embroidery file and the design. The extension is added automatically.",
    'DST für die Texi 1501 und alle Tajima-kompatiblen Industriemaschinen. PES für Brother, JEF für Janome, EXP für Melco/Bernina.':
      "DST for the Texi 1501 and all Tajima-compatible industrial machines. PES for Brother, JEF for Janome, EXP for Melco/Bernina.",

    /* Drehen / Skalieren */
    'Drehwinkel': "Rotation angle",
    'Dreht die Auswahl um diesen Winkel in Grad im Uhrzeigersinn. Negativ dreht gegen den Uhrzeigersinn.':
      "Rotates the selection clockwise by this angle in degrees. Negative rotates counterclockwise.",
    'Breite in %': "Width in %",
    'Neue Breite in Prozent der bisherigen. Die Stiche werden neu berechnet, die Dichte bleibt gleich.':
      "New width as a percentage of the current one. The stitches are recalculated, the density stays the same.",
    'Höhe in %': "Height in %",
    'Neue Höhe in Prozent der bisherigen. Gleicher Wert wie bei der Breite hält die Proportionen.':
      "New height as a percentage of the current one. Using the same value as for the width keeps the proportions.",
  });

  /* =====================================================================
     Stickprüfung (check.js)
     ===================================================================== */
  Object.assign(E.exact, {
    // Maschinenprofile
    'Industriemaschine (Tajima-kompatibel: Texi, Ricoma, Tajima, Barudan, ZSK …)': "Industrial machine (Tajima-compatible: Texi, Ricoma, Tajima, Barudan, ZSK …)",
    'Haushaltsmaschine (Brother, Bernina, Janome, Pfaff, Husqvarna …)': "Home machine (Brother, Bernina, Janome, Pfaff, Husqvarna …)",
    // Objektnamen
    'Satinsäule': "Satin column",
    'Satinlinie': "Satin line",
    'Fläche': "Fill",
    'Einzelstiche': "Manual stitches",
    // Meldungen ohne Zahlen
    'Satinsäule viel zu breit': "Satin column far too wide",
    // Erklärungen
    'Satinstiche sollten quer zur Säule liegen. Fast parallele Stiche decken nicht, liegen lose auf und reißen leicht aus. Die Maschine sticht dabei viele Einstiche fast an dieselbe Stelle.':
      "Satin stitches should run across the column. Almost parallel stitches don’t cover, lie loosely on top and pull out easily. The machine also puts many needle points in almost the same spot.",
    'Die Punktpaare liegen über Kreuz (linke und rechte Seite vertauscht). Die Maschine stickt dort Knoten, der Faden kann reißen.':
      "The point pairs are crossed (left and right side swapped). The machine sews knots there and the thread can break.",
    'So breite Säulen lassen sich nicht sauber als Satin sticken – besser als Tatami-Fläche anlegen.':
      "Columns this wide can’t be stitched cleanly as satin – better to create them as a tatami fill.",
    'Der Stichwinkel ergibt sehr lange Satinstiche. Winkel quer zur schmalen Seite drehen, Teilung einschalten oder Tatami verwenden.':
      "The stitch angle results in very long satin stitches. Turn the angle across the narrow side, turn on splitting or use tatami.",
    'Zu viele Einstiche dicht nebeneinander.': "Too many needle points close together.",
    'Sehr kurze Stiche erzeugen Fadenbruch und Knötchen. 2–3 mm sind üblich, in engen Kurven 1,5 mm.':
      "Very short stitches cause thread breaks and little knots. 2–3 mm is typical, 1.5 mm in tight curves.",
    'Lange Laufstiche liegen lose und bleiben hängen.': "Long run stitches lie loose and snag.",
    'Die Maschine kann diese Stiche nicht in einem Schritt sticken; sie werden geteilt oder als Sprung ausgeführt. Satin teilen oder Objekt umbauen.':
      "The machine can’t sew these stitches in one step; they are split or executed as a jump. Split the satin or rework the object.",
    'Viele Einstiche an fast derselben Stelle: Fadenbruch, Vogelnester, Löcher im Stoff.':
      "Many needle points in almost the same spot: thread breaks, bird nests, holes in the fabric.",
    'Der Stoff scheint durch, Satin deckt nicht.': "The fabric shows through, the satin doesn’t cover.",
    'Hier überlappen mehrere Objekte. Die Nadel sticht immer wieder in dieselbe Stelle – Nadelbruch, Fadenbruch und harte Knubbel. Überlappung verkleinern oder unten liegende Bereiche aussparen.':
      "Several objects overlap here. The needle keeps hitting the same spot – broken needles, thread breaks and hard lumps. Reduce the overlap or cut out the areas underneath.",
    // Korrekturen
    'Stiche quer zur Säule ausrichten': "Turn stitches across the column",
    'Auto-Split ab 7 mm einschalten': "Turn on auto split from 7 mm",
    'Stichlänge 3,5 mm': "Stitch length 3.5 mm",
    'Auf Tatami umstellen': "Switch to tatami",
    'Abstand 0,4 mm': "Spacing 0.4 mm",
    'Stichlänge 2 mm': "Stitch length 2 mm",
    'Stichlänge 3 mm': "Stitch length 3 mm",
  });

  /* =====================================================================
     Stoffe (fabric.js)
     ===================================================================== */
  const NEEDLES = {
    '75/11 Spitze': "75/11 sharp",
    '75/11 Kugelspitze (Ballpoint)': "75/11 ballpoint",
    '75/11 Kugelspitze': "75/11 ballpoint",
    '90/14 Spitze (Jeans)': "90/14 sharp (denim)",
    '80/12 Ledernadel (Schneidspitze)': "80/12 leather needle (cutting point)",
    '80/12 Spitze': "80/12 sharp",
    '65/9 oder 70/10 Microtex': "65/9 or 70/10 Microtex",
  };
  const TIPS = {
    'Stoff glatt, aber nicht gedehnt einspannen.': "Hoop the fabric smooth, but not stretched.",
    'Kein Reißvlies verwenden – der Stoff dehnt sich, das Motiv verzieht sich.': "Don’t use tearaway – the fabric stretches and the design distorts.",
    'Vlies mit Sprühkleber oder Bügelvlies fixieren, Stoff nicht dehnen.': "Secure the stabilizer with spray adhesive or use fusible stabilizer; don’t stretch the fabric.",
    'Lieber offene, leichte Motive; große Tatamiflächen vermeiden.': "Prefer open, light designs; avoid large tatami areas.",
    'Wasserlöslichen Topper oben auflegen, damit die Stiche nicht im Flor versinken.': "Place water-soluble topping on top so the stitches don’t sink into the pile.",
    'Piqué-Struktur: Topper verhindert, dass dünne Stiche in den Waben verschwinden.': "Piqué texture: topping keeps thin stitches from disappearing into the honeycomb.",
    'Dicke Nähte nicht unter den Stickbereich legen.': "Don’t place thick seams under the embroidery area.",
    'Jeder Einstich bleibt als Loch sichtbar – weniger Dichte, keine Korrekturen nach dem Sticken.': "Every needle hole stays visible – use less density, no corrections after stitching.",
    'Leder nicht einspannen (Abdrücke!), sondern auf eingespanntes Klebevlies legen oder mit Klebeband fixieren.': "Don’t hoop leather (hoop burn!) – float it on hooped adhesive stabilizer or secure it with tape.",
    'Kein Sprühkleber auf Glattleder.': "No spray adhesive on smooth leather.",
    'Wasserlöslicher Topper ist Pflicht, sonst verschwindet die Stickerei in den Schlingen.': "Water-soluble topping is a must, otherwise the embroidery disappears into the loops.",
    'Sehr feine Linien und Schrift unter 6 mm vermeiden.': "Avoid very fine lines and lettering under 6 mm.",
    'Von der Mitte nach außen und von unten nach oben sticken (Reihenfolge prüfen).': "Stitch from the center outwards and from bottom to top (check the sequence).",
    'Kappenrahmen auf der Texi verwenden.': "Use the cap frame on the Texi.",
    'Leichte Motive wählen, dichte Flächen ziehen den Stoff zusammen.': "Choose light designs; dense fills pull the fabric together.",
    'Möglichst wenige Einstiche – Membran wird sonst undicht.': "As few needle points as possible – otherwise the membrane stops being waterproof.",
    'Topper auflegen, Mütze nicht dehnen.': "Use topping, don’t stretch the beanie.",
    'Für Aufnäher: Satinrand mindestens 3 mm breit.': "For patches: satin border at least 3 mm wide.",
  };
  const WARN = {
    'Für Leder sehr dicht – Gefahr, dass das Leder ausreißt.': "Very dense for leather – risk of the leather tearing.",
    'Große Füllflächen auf dehnbarem Stoff werden steif und können wellen.': "Large fill areas on stretchy fabric become stiff and may pucker.",
  };
  Object.assign(E.exact, NEEDLES, TIPS, WARN, {
    // Stoffnamen
    'Baumwolle gewebt (Hemd, Tasche, Schürze)': "Woven cotton (shirt, bag, apron)",
    'T-Shirt / Jersey (dünner Strick)': "T-shirt / jersey (light knit)",
    'Sweatshirt / Hoodie / Fleece': "Sweatshirt / hoodie / fleece",
    'Polo / Piqué': "Polo / piqué",
    'Jeans / Denim / Canvas': "Jeans / denim / canvas",
    'Leder / Kunstleder': "Leather / faux leather",
    'Frottee / Handtuch / Bademantel': "Terry cloth / towel / bathrobe",
    'Kappe / Basecap': "Cap / baseball cap",
    'Seide / Satin / feine Stoffe': "Silk / satin / fine fabrics",
    'Softshell / Nylon / Jacken': "Softshell / nylon / jackets",
    'Strick / Mütze (Beanie)': "Knit / beanie",
    'Filz / Aufnäher-Basis': "Felt / patch base",
    // Vlies-Arten
    'Reißvlies (Tearaway)': "Tearaway",
    'Schneidvlies (Cutaway) oder No-Show-Mesh': "Cutaway or no-show mesh",
    'Schneidvlies (Cutaway)': "Cutaway",
    'Schneidvlies / No-Show-Mesh': "Cutaway / no-show mesh",
    'Cap-Reißvlies (fest)': "Cap tearaway (firm)",
    'Leichtes Schneidvlies (No-Show-Mesh) oder wasserlösliches Gewebevlies': "Light cutaway (no-show mesh) or fibrous washaway",
    // Vlies-Gewicht
    'mittel, ca. 60–80 g/m²': "medium, approx. 60–80 g/m²",
    'ca. 2,5 oz / 75 g/m²': "approx. 2.5 oz / 75 g/m²",
    'ca. 2,5–3 oz': "approx. 2.5–3 oz",
    'ca. 2,5 oz': "approx. 2.5 oz",
    'mittel bis fest, 80–100 g/m²': "medium to heavy, 80–100 g/m²",
    'mittel': "medium",
    'fest, ca. 100 g/m²': "heavy, approx. 100 g/m²",
    'leicht': "light",
    // Topper
    'Ja – wasserlöslicher Topper (z. B. Solvy) oben auflegen': "Yes – place water-soluble topping (e.g. Solvy) on top",
    'nicht nötig': "not needed",
    // Begründung für mehr Lagen
    'dehnbarer Stoff mit Füllflächen': "stretchy fabric with fill areas",
  });
  // Nadel steht in der Seitenleiste als „75/11 Spitze · “ vor „max.“
  for (const k of Object.keys(NEEDLES)) E.exact[k + ' ·'] = NEEDLES[k] + ' ·';

  /* =====================================================================
     Stickrahmen (hoops.js)
     ===================================================================== */
  Object.assign(E.exact, {
    'Texi Großrahmen 540 × 350 mm (max. Feld)': "Texi large hoop 540 × 350 mm (max. field)",
    'Texi Rahmen 290 × 290 mm': "Texi hoop 290 × 290 mm",
    'Texi rund Ø 200 mm': "Texi round Ø 200 mm",
    'Texi rund Ø 150 mm': "Texi round Ø 150 mm",
    'Texi rund Ø 120 mm': "Texi round Ø 120 mm",
    'Texi rund Ø 90 mm': "Texi round Ø 90 mm",
    'Kappe 270° (ca. 360 × 75 mm)': "Cap 270° (approx. 360 × 75 mm)",
    'Schlauchrahmen rund 9 cm': "Tubular hoop round 9 cm",
    'Schlauchrahmen rund 12 cm': "Tubular hoop round 12 cm",
    'Schlauchrahmen rund 15 cm': "Tubular hoop round 15 cm",
    'Schlauchrahmen rund 18 cm': "Tubular hoop round 18 cm",
    'Schlauchrahmen rund 21 cm': "Tubular hoop round 21 cm",
    'Vierkant 24 × 24 cm': "Square 24 × 24 cm",
    'Vierkant 30 × 30 cm': "Square 30 × 30 cm",
    'Vierkant 36 × 36 cm': "Square 36 × 36 cm",
    'Brusttasche / Clip 10 × 7 cm': "Chest pocket / clip 10 × 7 cm",
    // Gruppen
    'Industrie (Tajima-kompatibel, Richtwerte)': "Industrial (Tajima-compatible, typical sizes)",
    'Haushaltsmaschinen (Richtwerte)': "Home machines (typical sizes)",
    'Sonstiges': "Other",
    'kein Rahmen': "no hoop",
    'Eigene Rahmen': "Custom hoops",
  });

  /* =====================================================================
     Hüllformen (textfx.js), Dateiformate und Fehlermeldungen
     ===================================================================== */
  Object.assign(E.exact, {
    'keine': "none",
    'Bogen (ganz)': "Arch (full)",
    'Brücke (oben gewölbt)': "Bridge (curved top)",
    'Tal (unten gewölbt)': "Valley (curved bottom)",
    'Welle': "Wave",
    'Wimpel': "Pennant",
    'Raute': "Diamond",
    'Wölbung': "Bulge",
    'Taille': "Pinch",
    // formats.js
    'PES Version 1 mit PEC-Block (Brother, Babylock, Bernette)': "PES version 1 with PEC block (Brother, Babylock, Bernette)",
    'Janome/Elna/Kenmore, Rahmen wird automatisch gewählt': "Janome/Elna/Kenmore, hoop is chosen automatically",
    'Melco/Bernina Expanded, ohne Farbinformation': "Melco/Bernina Expanded, without color information",
    'PES: zu viele Farbwechsel': "PES: too many color changes",
    'Keine PES-Datei': "Not a PES file",
    // vector.js
    'Keine gültige SVG-Datei': "Not a valid SVG file",
    // inkfont.js
    'kein Browser': "no browser",
  });

  /* =====================================================================
     Texte mit Zahlen (rx). Meldungen der Stickprüfung stehen im Dialog mit „⚠ “ bzw. „⛔ “ davor,
     Stoff-Hinweise mit „⚠ “ – das Präfix wird mitgenommen.
     ===================================================================== */
  // Zahlen der Stickprüfung kommen immer deutsch formatiert („0,35“) → englisch „0.35“
  const dec = (v) => (/^[\d.,]+$/.test(v) ? v.replace(/,/g, '.') : v);
  // Ersatztext mit $1…$n; Zahlengruppen werden dabei auf Dezimalpunkt umgestellt
  const fill = (rep, gs, conv) => rep.replace(/\$(\d)/g, (m, d) => { const v = gs[+d - 1]; return v === undefined ? '' : conv(v); });
  const R = (re, rep, conv = dec) => [re, (m, ...gs) => fill(rep, gs, conv)];
  // Wie R, aber mit optionalem „⚠ “/„⛔ “ davor (Meldungen im Prüfdialog); body ohne ^/$
  const P = (body, rep) => [new RegExp('^((?:⚠|⛔) )?' + body.source + '$'), (m, pre, ...gs) => (pre || '') + fill(rep, gs, dec)];
  // deutsche Tausenderpunkte („16.000“) → englisch „16,000“
  const thou = (v) => (/^[\d.]+$/.test(v) ? v.replace(/\./g, ',') : v);
  E.rx.push(
    /* --- Stickprüfung: Meldungen --- */
    P(/Stichwinkel fast parallel zur Säule \((\d+) % der Stiche\)/, 'Stitch angle almost parallel to the column ($1% of stitches)'),
    P(/Säule verdreht – (\d+) Stiche überkreuzen sich/, 'Column twisted – $1 stitches cross each other'),
    P(/Satin ([\d.,]+) mm breit, ohne Teilung/, 'Satin $1 mm wide, without split'),
    P(/Satin stellenweise nur ([\d.,]+) mm breit/, 'Satin only $1 mm wide in places'),
    P(/Fläche zu dicht \(Abstand ([\d.,]+) mm\)/, 'Fill too dense (spacing $1 mm)'),
    P(/Tatami-Stiche ([\d.,]+) mm lang/, 'Tatami stitches $1 mm long'),
    P(/Satin-Fläche mit bis zu ([\d.,]+) mm langen Stichen/, 'Satin fill with stitches up to $1 mm long'),
    P(/Satin-Fläche zu dicht \(([\d.,]+) mm\)/, 'Satin fill too dense ($1 mm)'),
    P(/Laufstich nur ([\d.,]+) mm lang/, 'Run stitch only $1 mm long'),
    P(/Laufstich ([\d.,]+) mm lang/, 'Run stitch $1 mm long'),
    P(/(\d+) Stich\(e\) länger als ([\d.,]+) mm/, '$1 stitch(es) longer than $2 mm'),
    P(/(\d+) sehr kurze Stiche \(< ([\d.,]+) mm\)/, '$1 very short stitches (< $2 mm)'),
    P(/Satin zu dicht \(Abstand ([\d.,]+) mm\)/, 'Satin too dense (spacing $1 mm)'),
    P(/Satin sehr offen \(Abstand ([\d.,]+) mm\)/, 'Satin very open (spacing $1 mm)'),
    P(/(\d+) Stelle\(n\) mit zu vielen Stichlagen übereinander \(bis (\d+) Einstiche auf 4 mm²\)/,
      '$1 spot(s) with too many stitch layers on top of each other (up to $2 needle points per 4 mm²)'),
    /* --- Stickprüfung: Erklärungen mit Grenzwerten --- */
    R(/^Satinstiche über ([\d.,]+) mm hängen lose durch, bleiben hängen und verziehen den Stoff\. Teilung \(Auto-Split\) einschalten oder als Fläche sticken\.$/,
      'Satin stitches over $1 mm sag loosely, snag and distort the fabric. Turn on splitting (auto split) or stitch it as a fill.'),
    R(/^Unter ([\d.,]+) mm stechen die Nadeln fast in dasselbe Loch: Fadenbruch und Löcher im Stoff\. Säule verbreitern oder als Laufstich sticken\.$/,
      'Below $1 mm the needle goes into almost the same hole: thread breaks and holes in the fabric. Widen the column or stitch it as a run stitch.'),
    R(/^Unter ([\d.,]+) mm Reihenabstand wird die Fläche hart wie ein Brett, Nadel und Faden brechen leichter, der Stoff zieht sich zusammen\.$/,
      'Below $1 mm row spacing the fill becomes stiff as a board, needles and thread break more easily and the fabric puckers.'),
    R(/^Lange Flächenstiche über ([\d.,]+) mm liegen lose und bleiben hängen\.$/, 'Long fill stitches over $1 mm lie loose and snag.'),
    R(/^Unter ([\d.,]+) mm stapeln sich die Fäden: harte Stickerei, Fadenbruch, Nadelbruch, gewellter Stoff\.$/,
      'Below $1 mm the threads pile up: stiff embroidery, thread breaks, broken needles, puckered fabric.'),
    /* --- Stickprüfung: Korrekturen --- */
    R(/^Abstand auf ([\d.,]+) mm setzen$/, 'Set spacing to $1 mm'),

    /* --- Stoff: Hinweise zum Motiv und Begründungen --- */
    P(/(\d+) Satinsäule\(n\) schmaler als ([\d.,]+) mm – auf diesem Stoff kaum sichtbar\./, '$1 satin column(s) narrower than $2 mm – barely visible on this fabric.'),
    P(/(\d+) Satinsäule\(n\) breiter als 10 mm – lieber als Fläche \(Tatami\) sticken\./, '$1 satin column(s) wider than 10 mm – better to stitch as a fill (tatami).'),
    R(/^viele Stiche \(([\d.,]+)\)$/, 'many stitches ($1)', thou),
    R(/^dichtes Motiv \((\d+) Stiche\/cm²\)$/, 'dense design ($1 stitches/cm²)'),
    R(/^große Füllflächen \((\d+) cm²\)$/, 'large fill areas ($1 cm²)'),

    /* --- Fehlermeldungen (vector.js, formats.js, inkfont.js) --- */
    [/^Laden fehlgeschlagen: (.+)$/, 'Loading failed: $1'],
    [/^Unbekanntes Format: (.+)$/, 'Unknown format: $1'],
    [/^Schrift nicht gefunden: (.+)$/, 'Font not found: $1'],

    /* --- Zusammengesetzte Texte: Teile einzeln übersetzen --- */
    // Vlies-Empfehlung „2 × Schneidvlies (Cutaway) (ca. 2,5 oz)“
    [/^(\d) × (.+) \(([^()]+)\)$/, (m, n, art, gew) => n + ' × ' + T(art) + ' (' + T(gew) + ')'],
    // „Mehr Lagen wegen: viele Stiche (16.000), dehnbarer Stoff mit Füllflächen“
    [/^Mehr Lagen wegen: (.+)$/, (m, s) => 'More layers because of: ' + s.split(', ').map(T).join(', ')],
    // Korrektur-Knopf „Korrigieren: Abstand 0,4 mm“
    [/^Korrigieren: (.+)$/, (m, s) => 'Fix: ' + T(s)],
    // Aufzählungen „⚠ …“, „⛔ …“, „• …“ (Stoff-Hinweise, Tipps)
    [/^(⚠|⛔|•) (.+)$/, (m, p, s) => p + ' ' + T(s)],
  );
})(typeof window !== 'undefined' ? window : globalThis);
