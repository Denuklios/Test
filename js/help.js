/* Mouse-Over-Infos: erklärt jeden Knopf, jedes Werkzeug und jedes Feld in einfachen Worten.
   Abschaltbar (Einstellungen → Hilfe-Infos beim Überfahren, oder ⓘ unten rechts). */
(function (g) {
  const HW = (g.HW = g.HW || {});
  HW.HELP = HW.HELP || {};
  Object.assign(HW.HELP, {
    /* ---------- Menüs ---------- */
    'menu:Datei': ['Datei', 'Neues Design, Projekte öffnen und speichern, Grafiken und Stickdateien importieren, Stickdatei für die Maschine erzeugen, Arbeitsblatt, Mockup und Preis.'],
    'menu:Bearbeiten': ['Bearbeiten', 'Rückgängig, Kopieren, Drehen, Spiegeln, Größe ändern, Formen verrechnen, Applikation, Knockdown, Kappen-Sortierung und die Stickprüfung.'],
    'menu:Anordnen': ['Anordnen', 'Objekte ausrichten und verteilen, gruppieren, im Kreis oder Raster vervielfältigen, Text auf eine Linie setzen, Monogramme.'],
    'menu:Bild': ['Bild', 'Ein Foto oder Logo als Vorlage einfügen, zum Nachzeichnen oder für das automatische Digitalisieren.'],
    'menu:Ansicht': ['Ansicht', 'Wie das Design angezeigt wird: Fadenansicht, Sprünge, Raster, Einrasten, Zoom.'],
    'menu:Einstellungen': ['Einstellungen', 'Maschine, Schnitte und Sprünge, Stickrahmen, Hilfe und diese Info-Kästchen ein- und ausschalten.'],

    /* ---------- Befehle (Menüs und Knöpfe) ---------- */
    'cmd:new': ['Neu', 'Fängt ein leeres Design an. Das aktuelle Design wird verworfen – vorher speichern, wenn du es noch brauchst.'],
    'cmd:open': ['Projekt öffnen', 'Lädt ein gespeichertes StickStudio-Projekt (.stick.json) mit allen Objekten, Farben und Einstellungen – voll bearbeitbar.'],
    'cmd:save': ['Projekt speichern', 'Speichert das Design als bearbeitbare Projektdatei. Die Maschine braucht dagegen eine Stickdatei (siehe „Stickdatei exportieren“).'],
    'cmd:library': ['Design-Bibliothek', 'Alle in der Bibliothek abgelegten Designs mit Vorschaubild. Suchen nach Name, Kunde oder Stichwort und mit einem Klick öffnen.'],
    'cmd:librarySave': ['In Bibliothek speichern', 'Legt das aktuelle Design mit Vorschaubild, Stichworten und Kunde in der Bibliothek ab (im Browser dieses Computers).'],
    'cmd:importVector': ['Vektorgrafik importieren', 'Lädt ein Logo als SVG, PDF oder AI und wandelt die Formen automatisch in Stickobjekte um. Beste Qualität für Logos.'],
    'cmd:importDst': ['Stickdatei importieren', 'Öffnet eine fertige Stickdatei (DST, PES, JEF, EXP). Die Stiche lassen sich ansehen, verschieben und einzeln bearbeiten.'],
    'cmd:exportDst': ['Stickdatei exportieren', 'Erzeugt die Datei für die Stickmaschine. Für die Texi 1501 „DST“ wählen, auf einen USB-Stick kopieren und an der Maschine laden.'],
    'cmd:teamNames': ['Teamnamen', 'Ein Design, viele Namen: Text als Platzhalter, Namensliste eingeben – je Name entsteht eine eigene Stickdatei (alles in einer ZIP).'],
    'cmd:multiHoop': ['Mehrere Einspannungen', 'Für Motive, die größer als der Rahmen sind: teilt das Design in mehrere Dateien mit Passkreuzen zum genauen Ausrichten.'],
    'cmd:worksheet': ['Arbeitsblatt drucken', 'Druckt ein Blatt für die Maschine: Vorschau, Farbfolge mit Nadelnummern, Stichzahl, Größe, Vlies-Empfehlung und Stopps.'],
    'cmd:mockup': ['Produkt-Vorschau', 'Zeigt das Design maßstabsgetreu auf T-Shirt, Polo, Hoodie, Kappe, Handtuch oder Tasche – gut, um es dem Kunden zu zeigen.'],
    'cmd:price': ['Preiskalkulation', 'Berechnet den Stückpreis nach Stichzahl oder Maschinenzeit mit Mengenrabatten und druckt ein Angebot.'],
    'cmd:undo': ['Rückgängig (Strg+Z)', 'Macht den letzten Schritt rückgängig. Mehrfach drücken geht weiter zurück.'],
    'cmd:redo': ['Wiederholen (Strg+Y)', 'Stellt einen rückgängig gemachten Schritt wieder her.'],
    'cmd:duplicate': ['Duplizieren (Strg+D)', 'Kopiert die ausgewählten Objekte. Die Kopie liegt leicht versetzt daneben.'],
    'cmd:delete': ['Löschen (Entf)', 'Entfernt die ausgewählten Objekte aus dem Design.'],
    'cmd:selectAll': ['Alles auswählen (Strg+A)', 'Wählt alle Objekte aus, z. B. um das ganze Design zu verschieben oder zu skalieren.'],
    'cmd:mirrorH': ['Horizontal spiegeln', 'Spiegelt die Auswahl links ↔ rechts. Stichwinkel werden mitgespiegelt.'],
    'cmd:mirrorV': ['Vertikal spiegeln', 'Spiegelt die Auswahl oben ↔ unten.'],
    'cmd:rotate': ['Drehen', 'Dreht die Auswahl um einen frei wählbaren Winkel. Die Stiche werden neu berechnet.'],
    'cmd:scale': ['Skalieren', 'Ändert die Größe in Prozent. Die Stiche werden neu berechnet, die Dichte bleibt richtig (nicht einfach „aufgeblasen“).'],
    'cmd:center': ['In Rahmenmitte setzen', 'Schiebt die Auswahl (oder das ganze Design) genau in die Mitte des Stickrahmens.'],
    'cmd:fitHoop': ['An Rahmen anpassen', 'Vergrößert oder verkleinert das Design (oder die Auswahl) so, dass es genau ins Stickfeld passt. Stiche werden neu berechnet.'],
    'cmd:array': ['Kopien anordnen', 'Vervielfältigt die Auswahl im Kreis (z. B. Blütenblätter, Sterne rundherum) oder als Raster in Reihen und Spalten.'],
    'cmd:removeOverlaps': ['Überlappungen entfernen', 'Schneidet verdeckte Teile unter oberen Objekten heraus. Spart Stiche und verhindert harte, dicke Stellen.'],
    'cmd:union': ['Formen vereinen', 'Verschmilzt die ausgewählten Flächen zu einer einzigen Form.'],
    'cmd:difference': ['Untere Form ausschneiden', 'Zieht die oberen ausgewählten Formen von der untersten ab – wie mit einer Ausstechform.'],
    'cmd:intersect': ['Schnittmenge', 'Behält nur den Bereich, in dem sich alle ausgewählten Formen überlappen.'],
    'cmd:applique': ['Applikation aus Form', 'Macht aus einer Form eine Applikation: Platzierungslinie, Stopp, Heftstich, Stopp, Satin-Abdeckung. Spart viele Stiche bei großen Flächen.'],
    'cmd:knockdown': ['Knockdown-Stich', 'Legt ein lockeres Gitter unter das Motiv, das Flor oder Schlaufen (Frottee, Fleece, Strick) flachdrückt, damit Details nicht versinken.'],
    'cmd:capSort': ['Für Kappe sortieren', 'Sortiert für Kappen: von der Mitte nach außen und von unten nach oben. Verhindert Verzug und Falten auf der Kappe.'],
    'cmd:toStitches': ['In Einzelstiche umwandeln', 'Macht aus dem Objekt einzelne Stiche, die man frei verschieben kann. Danach lassen sich Dichte usw. nicht mehr automatisch ändern.'],
    'cmd:sortColor': ['Nach Farbe sortieren', 'Ordnet die Objekte nach Farben, damit die Maschine seltener die Farbe wechseln muss.'],
    'cmd:optimizeOrder': ['Reihenfolge optimieren', 'Sortiert die Objekte jeder Farbe so, dass die Wege dazwischen möglichst kurz sind – weniger Sprünge und Schnitte.'],
    'cmd:check': ['Stickprüfung', 'Prüft das Design auf Probleme wie zu dicht, zu schmal, zu lange Stiche oder schlechte Winkel und schlägt Korrekturen vor.'],
    'cmd:alignLeft': ['Links ausrichten', 'Ein Objekt: an den linken Rand des Stickfelds. Mehrere: alle an die linke Kante der Auswahl.'],
    'cmd:alignCenterH': ['Waagrecht mittig', 'Richtet die Objekte auf eine gemeinsame senkrechte Mittellinie aus (ein Objekt: Rahmenmitte).'],
    'cmd:alignRight': ['Rechts ausrichten', 'Ein Objekt: an den rechten Rand des Stickfelds. Mehrere: an die rechte Kante der Auswahl.'],
    'cmd:alignTop': ['Oben ausrichten', 'Richtet die Oberkanten aneinander aus (ein Objekt: oberer Rand des Stickfelds).'],
    'cmd:alignCenterV': ['Senkrecht mittig', 'Richtet die Objekte auf eine gemeinsame waagrechte Mittellinie aus.'],
    'cmd:alignBottom': ['Unten ausrichten', 'Richtet die Unterkanten aneinander aus (ein Objekt: unterer Rand des Stickfelds).'],
    'cmd:distH': ['Waagrecht verteilen', 'Verteilt mindestens drei Objekte so, dass die Abstände zwischen ihnen links-rechts gleich groß sind.'],
    'cmd:distV': ['Senkrecht verteilen', 'Verteilt mindestens drei Objekte mit gleichen Abständen oben-unten.'],
    'cmd:group': ['Gruppieren (Strg+G)', 'Fasst die Auswahl zusammen: ein Klick wählt danach alle Teile, sie bewegen sich gemeinsam.'],
    'cmd:ungroup': ['Gruppierung lösen', 'Teile einer Gruppe wieder einzeln bearbeiten. Bei Text ist er danach nicht mehr als Text änderbar.'],
    'cmd:textOnPath': ['Text auf Linie setzen', 'Legt einen Text entlang einer gezeichneten Linie, z. B. einen Bogen oder Kreis. Text und Linie zusammen auswählen.'],
    'cmd:monogram': ['Monogramm', 'Erstellt Initialen aus Vorlagen: Mitte groß, im Kreis, in einer Raute oder mit Linien.'],
    'cmd:insertImage': ['Bild einfügen', 'Lädt ein Foto oder Logo (JPG, PNG) als Vorlage in den Hintergrund – zum Nachzeichnen oder automatischen Digitalisieren.'],
    'cmd:imageSettings': ['Bild-Einstellungen', 'Größe, Position und Deckkraft des Vorlagenbildes ändern.'],
    'cmd:toggleImage': ['Bild ein/aus', 'Blendet das Vorlagenbild aus oder wieder ein. Es wird nie mitgestickt.'],
    'cmd:removeImage': ['Bild entfernen', 'Löscht das Vorlagenbild aus dem Hintergrund.'],
    'cmd:autoDigitize': ['Auto-Digitalisieren', 'Wandelt das Vorlagenbild automatisch in Stickobjekte um (Satin für schmale Teile, Tatami für Flächen). Danach alles nachbearbeitbar.'],
    'cmd:toggleTrue': ['TrueView / Fadenansicht (T)', 'Zeigt die Stiche wie echter Faden mit Glanz – oder als dünne Linien, um Einstiche genau zu sehen.'],
    'cmd:toggleJumps': ['Sprünge anzeigen (J)', 'Zeigt die Wege, auf denen die Maschine ohne zu sticken springt, als gestrichelte Linien.'],
    'cmd:toggleGrid': ['Raster', 'Blendet das Millimeter-Raster ein oder aus.'],
    'cmd:toggleSnap': ['Einrasten (G)', 'Punkte und verschobene Objekte springen an Raster und Hilfslinien – für exakt gerade und gleich große Formen.'],
    'cmd:guides': ['Hilfslinien & Rasterweite', 'Eigene waagrechte oder senkrechte Hilfslinien setzen und die Rasterweite für das Einrasten ändern.'],
    'cmd:togglePoints': ['Einstichpunkte', 'Zeigt jeden einzelnen Nadeleinstich als Punkt – hilfreich, um zu dichte Stellen zu erkennen.'],
    'cmd:toggleWheel': ['Mausrad zoomt', 'Aus (Standard): Mausrad = hoch/runter, Shift + Rad = links/rechts, Strg + Rad = Zoom. An: Mausrad zoomt wie früher. Verschieben geht immer auch mit Leertaste + Ziehen.'],
    'id:scrollbar': ['Bildlaufleiste', 'Zeigt, welcher Teil des Designs gerade sichtbar ist. Den Balken ziehen oder neben ihn klicken, um die Ansicht zu verschieben.'],
    'cmd:zoomFit': ['Alles zeigen (0)', 'Zoomt so, dass das ganze Design sichtbar ist. Verschieben: Mausrad (hoch/runter), Shift + Mausrad (links/rechts), Leertaste + Ziehen oder Pfeiltasten.'],
    'cmd:zoomHoop': ['Rahmen zeigen', 'Zoomt so, dass der ganze Stickrahmen sichtbar ist.'],
    'cmd:machineSettings': ['Maschine, Schnitte & Sprünge', 'Maschinentyp, Geschwindigkeit, ab wann geschnitten statt gesprungen wird, versteckte Laufwege und Prüf-Grenzwerte.'],
    'cmd:hoops': ['Stickrahmen', 'Rahmen auswählen oder eigene Rahmen (eckig, rund, oval) anlegen. Das Stickfeld wird auf der Arbeitsfläche angezeigt.'],
    'cmd:help': ['Hilfe / Tastatur', 'Übersicht über Maus- und Tastaturbefehle.'],
    'cmd:toggleTips': ['Hilfe-Infos beim Überfahren', 'Schaltet diese Info-Kästchen ein oder aus. Die Einstellung wird gemerkt.'],
    'cmd:addColor': ['+ Farbe', 'Fügt der Palette eine neue Garnfarbe hinzu.'],
    'cmd:editColor': ['Farbe bearbeiten', 'Ändert die aktive Farbe: Garn aus einer Farbkarte (Madeira, Isacord …) wählen, Name und Nadelnummer festlegen.'],
    'cmd:delColor': ['Farbe entfernen', 'Löscht die aktive Farbe aus der Palette (nur wenn kein Objekt sie benutzt).'],
    'cmd:threadBrand': ['Garnmarke zuordnen', 'Ordnet allen Farben das passendste echte Garn einer Marke zu (z. B. Madeira Polyneon) – mit Nummern für die Bestellung.'],
    'cmd:moveUp': ['Nach oben', 'Die Auswahl wird früher gestickt (eine Stelle nach oben in der Reihenfolge).'],
    'cmd:moveDown': ['Nach unten', 'Die Auswahl wird später gestickt (eine Stelle nach unten).'],
    'cmd:moveFirst': ['Ganz nach oben', 'Die Auswahl wird als Erstes gestickt (liegt dann ganz unten auf dem Stoff).'],
    'cmd:moveLast': ['Ganz nach unten', 'Die Auswahl wird zuletzt gestickt (liegt dann obenauf).'],

    /* ---------- Werkzeuge ---------- */
    'tool:select': ['Auswählen (Esc)', 'Objekte anklicken, verschieben, mit Shift mehrere wählen oder einen Rahmen um mehrere ziehen. Doppelklick auf Text = Text bearbeiten.'],
    'tool:pan': ['Verschieben (Hand, Taste H)', 'Ansicht mit gedrückter Maustaste in jede Richtung schieben. Geht auch jederzeit: Leertaste gedrückt halten und Maus bewegen, Mausrad (hoch/runter), Shift + Mausrad (links/rechts).'],
    'tool:reshape': ['Umformen (R)', 'Einzelne Punkte eines Objekts verschieben, einfügen (Doppelklick) oder löschen (Entf). Leertaste wechselt Ecke ↔ Kurve.'],
    'tool:run': ['Laufstich', 'Eine einfache Stichlinie, z. B. für Umrisse oder feine Details. Linksklick = Ecke, Rechtsklick = Kurve, Enter = fertig.'],
    'tool:triple': ['Dreifachstich', 'Wie Laufstich, aber jeder Stich wird dreimal gestickt – kräftigere, gut sichtbare Linie.'],
    'tool:colC': ['Satin C – Linie mit fester Breite', 'Eine Satinraupe mit fester Breite entlang einer Linie – ideal für Ränder und Schriftzüge. Mitte zeichnen, Breite rechts einstellen.'],
    'tool:colA': ['Satin A – Breite frei (wie Hatch „Column A“)', 'Für Satin mit wechselnder Dicke: Kanten immer abwechselnd anklicken – blaue Seite, orange Seite, blau, orange … Jedes Paar legt Breite und Stichrichtung fest. Linksklick = Ecke, Rechtsklick = Kurve, Enter = fertig.'],
    'tool:colB': ['Satin B – zwei Kanten nacheinander', 'Erst die eine Kante komplett zeichnen, Enter, dann die andere Kante. Die Stichrichtung dreht automatisch mit. Linksklick = Ecke, Rechtsklick = Kurve.'],
    'cmd:toColA': ['In Satin A umwandeln', 'Macht aus einer Satinlinie mit fester Breite (Satin C) eine Säule mit zwei einzelnen Kanten. Danach mit „Umformen“ die Kantenpunkte ziehen, um die Breite stellenweise zu ändern.'],
    'tool:fill': ['Fläche (Tatami)', 'Füllt eine geschlossene Form mit Reihen-Stichen. Umriss zeichnen, Enter, optional Löcher, dann den Stichwinkel.'],
    'tool:rect': ['Rechteck', 'Ein Rechteck als gefüllte Fläche aufziehen.'],
    'tool:ellipse': ['Kreis / Ellipse', 'Eine Ellipse als gefüllte Fläche aufziehen. Mit gedrückter Shift-Taste wird es ein Kreis.'],
    'tool:text': ['Text', 'Klick auf die Arbeitsfläche setzt einen Text. Fertige Stickschriften oder normale Schriften, die automatisch umgewandelt werden.'],
    'tool:knife': ['Messer', 'Teilt Flächen entlang einer Linie in zwei Teile – z. B. damit große Flächen in den Rahmen passen oder anders gestickt werden.'],
    'tool:manual': ['Manuelle Stiche', 'Jeder Klick setzt genau einen Stich, Rechtsklick einen Sprung. Für ganz feine Handarbeit.'],
    'id:curveMode': ['Kurve (für Touch)', 'Auf Tablets ohne rechte Maustaste: eingeschaltet setzt jedes Tippen einen Kurvenpunkt statt einer Ecke.'],

    /* ---------- Feste Elemente ---------- */
    'id:hoopSel': ['Stickrahmen wählen', 'Welcher Rahmen benutzt wird. Das Stickfeld wird angezeigt und das Programm warnt, wenn das Design nicht hineinpasst.'],
    'id:hoopBtn': ['Rahmen verwalten', 'Eigene Rahmen anlegen (eckig, rund, oval), passende Rahmen finden und das Design einpassen.'],
    'id:material': ['Stoff', 'Auf welchen Stoff gestickt wird. Dichte, Stichlänge, Zugausgleich und Unterlage passen sich automatisch an; dazu gibt es eine Vlies-Empfehlung.'],
    'id:fabDetails': ['Details & Tipps', 'Genaue Empfehlung für diesen Stoff: Vlies, Topper, Nadel, Geschwindigkeit und welche Werte automatisch angepasst werden.'],
    'id:fabKnock': ['Knockdown-Stich', 'Für flauschige Stoffe: ein lockeres Gitter drückt den Flor flach, damit feine Schrift nicht versinkt.'],
    'id:playBtn': ['Sticksimulation', 'Spielt ab, in welcher Reihenfolge die Maschine stickt. Ist etwas ausgewählt, läuft nur die Auswahl (der Rest blass) – sonst das ganze Design.'],
    'id:playSlider': ['Stickfortschritt', 'Ziehen zeigt das Design bis zu einem bestimmten Stich – praktisch, um die Reihenfolge Schritt für Schritt zu prüfen.'],
    'id:playSpeed': ['Geschwindigkeit der Simulation', 'Wie schnell die Simulation abläuft. Hat keinen Einfluss auf die Maschine.'],
    'id:checkInfo': ['Stickprüfung', 'Grün = alles in Ordnung. Gelb/Rot = Hinweise zu Dichte, Winkeln, Stichlängen. Klicken zeigt Details und Korrekturen.'],
    'id:tipToggle': ['Hilfe-Infos ein/aus', 'Schaltet diese Info-Kästchen ein oder aus. Die Einstellung wird gemerkt.'],
    'id:palette': ['Farbpalette', 'Klick auf eine Farbe = aktive Farbe für neue Objekte; ist etwas ausgewählt, bekommt es diese Farbe. Die Zahl ist die Nadelnummer.'],
    'id:objlist': ['Stickreihenfolge', 'Alle Objekte in der Reihenfolge, in der gestickt wird (oben zuerst). Klick wählt aus, das Auge blendet aus.'],
    'id:stats': ['Design-Daten', 'Stichzahl, Farben, Schnitte, Größe und ungefähre Stickzeit. Rot: Design ragt über das Stickfeld.'],

    /* ---------- Eigenschaften (rechts) ---------- */
    'p:run.style': ['Stichart', 'Laufstich = einfache Linie. Dreifachstich = jeder Stich dreimal (kräftiger). Bohnenstich = hin-zurück-hin, wirkt wie gezeichnet.'],
    'p:run.len': ['Stichlänge', 'Länge der einzelnen Stiche. Kürzer folgt Kurven genauer, länger wirkt ruhiger. Üblich: 2–3 mm, für feine Kurven 1,5 mm.'],
    'p:closed': ['Geschlossen', 'Verbindet das Ende wieder mit dem Anfang – für Umrisse um eine Form herum.'],
    'p:satin.style': ['Stichart', 'Satin = dicht nebeneinander, glänzend. E-Stich = Kante mit kurzen Querstichen, typisch zum Einfassen von Applikationen.'],
    'p:satin.spacing': ['Dichte (Abstand)', 'Abstand zwischen den Satin-Stichen. Kleiner = dichter und deckender, aber härter. Üblich: 0,35–0,45 mm.'],
    'p:satin.pull': ['Zugkompensation', 'Der Faden zieht den Stoff zusammen, Satin wird schmaler als gezeichnet. Dieser Wert macht die Säule etwas breiter. Üblich: 0,1–0,3 mm.'],
    'p:satin.underlay': ['Unterlage', 'Stiche unter dem Satin, die den Stoff festhalten und den Satin anheben. Schmal: Mittellauf. Breit: Kante + Zickzack.'],
    'p:satin.split': ['Auto-Split', 'Satinstiche länger als dieser Wert werden geteilt, damit sie nicht hängen bleiben. Üblich: 7 mm. 0 = nie teilen.'],
    'p:shortSt': ['Kurzstiche in Bögen', 'An der Innenseite von Kurven und Ecken endet jeder zweite Stich früher – sonst häufen sich dort die Einstiche zu einem Knubbel.'],
    'p:puff': ['3D-Puff (Schaum)', 'Für erhabene Stickerei mit Schaum: sehr dicht, ohne Unterlage, Enden verstärkt, Maschine stoppt zum Auflegen des Schaums.'],
    'p:width': ['Breite', 'Breite der Satinlinie in mm. Gut sticken lassen sich etwa 1,5–8 mm; breiter wird automatisch geteilt.'],
    'p:fill.fillType': ['Füllart', 'Tatami = Reihen (Standard). Satin = glänzend, nur kleine Flächen. Kontur/Spirale = folgt dem Rand. Welle, Muster, Verlauf, Kreuzstich = Effekte.'],
    'p:pattern': ['Muster', 'Welches Muster die versetzten Einstiche in der Fläche bilden: Rauten, Diagonalen, Ziegel oder Wellen.'],
    'p:waveAmp': ['Wellenhöhe', 'Wie stark die Reihen auf und ab schwingen. Üblich: 1–3 mm.'],
    'p:waveLen': ['Wellenlänge', 'Abstand von Wellenberg zu Wellenberg. Größer = ruhigere, flachere Wellen.'],
    'p:gradEnd': ['Verlauf bis Abstand', 'Die Fläche beginnt dicht und wird zur anderen Seite immer lockerer, bis zu diesem Reihenabstand. Spart Stiche, wirkt wie ein Farbverlauf.'],
    'p:crossSize': ['Kreuzgröße', 'Größe eines Kreuzstich-Kästchens. Üblich: 2–3 mm.'],
    'p:crossDouble': ['Kreuze doppelt', 'Jeder Kreuzschenkel wird zweimal gestickt – kräftiger und deckender.'],
    'p:fill.spacing': ['Dichte (Reihenabstand)', 'Abstand zwischen den Stichreihen. Kleiner = dichter. Üblich: 0,4 mm; dünne Stoffe eher 0,45, Frottee 0,35.'],
    'p:fill.len': ['Stichlänge', 'Länge der Stiche in jeder Reihe. Üblich: 3–4 mm. Länger als 7 mm kann hängen bleiben.'],
    'p:angle': ['Stichwinkel', 'Richtung der Stichreihen in Grad. Verschiedene Winkel bei benachbarten Flächen lassen sie sich optisch abheben. Mit „Umformen“ am orangen Griff ziehen.'],
    'p:fill.pull': ['Zugkompensation', 'Gleicht das Zusammenziehen des Stoffes aus, die Fläche wird quer zu den Stichen etwas verlängert. Üblich: 0,2 mm.'],
    'p:fill.underlay': ['Unterlage', 'Stiche unter der Fläche, die den Stoff stabilisieren. Kante + Tatami ist für die meisten Stoffe richtig.'],
    'p:fill.split': ['Satin-Split', 'Nur für Satin-Flächen: Stiche länger als dieser Wert werden geteilt.'],
    'p:border': ['Kontur', 'Optionaler Rand um die Fläche: Laufstich, Dreifachstich oder Satin. Deckt die Kante sauber ab.'],
    'p:borderWidth': ['Satin-Konturbreite', 'Breite des Satinrands um die Fläche.'],
    'p:connect': ['Verbindung davor', 'Wie die Maschine vom vorigen Objekt hierher kommt: automatisch, immer schneiden, springen ohne Schnitt oder direkt als Stich.'],
    'p:stopBefore': ['Maschine stoppt davor', 'Die Maschine hält vor diesem Objekt an, z. B. um Applikationsstoff oder Puff-Schaum aufzulegen.'],
    'p:autoFab': ['An Stoff anpassen', 'Ein: Dichte, Zugausgleich, Unterlage usw. werden automatisch aus Stoff und Breite berechnet („auto“). Von Hand geänderte Werte bleiben.'],
    'p:resetManual': ['Wieder automatisch', 'Setzt alle von Hand geänderten Werte zurück auf die automatische Berechnung für den gewählten Stoff.'],
    'p:textEdit': ['Text bearbeiten', 'Öffnet den Textdialog: Wortlaut, Schrift, Größe, Bogen und Hüllform ändern. Der Text wird neu gesetzt.'],
    'p:glyphs': ['Buchstaben anpassen', 'Einzelne Buchstaben verschieben, drehen oder vergrößern und den Abstand zwischen Buchstaben (Kerning) von Hand einstellen.'],
    'p:textBreak': ['Gruppierung lösen', 'Macht jeden Buchstaben zu einem eigenen Objekt. Danach ist der Text nicht mehr als Text änderbar.'],
  });

  /* ---------- Anzeige ---------- */
  const KEY = 'stickstudio.tips';
  let on = true;
  try { on = localStorage.getItem(KEY) !== '0'; } catch (e) { /* privat */ }
  let tip = null, timer = null, cur = null;

  // Hilfe-Schlüssel eines Elements suchen (data-help, Befehl, Werkzeug, Menü, Feld-ID)
  function keyOf(el) {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      if (e.dataset && e.dataset.help) return { el: e, key: e.dataset.help };
      if (e.dataset && e.dataset.cmd) return { el: e, key: 'cmd:' + e.dataset.cmd };
      if (e.dataset && e.dataset.tool) return { el: e, key: 'tool:' + e.dataset.tool };
      if (e.classList && e.classList.contains('menu') && e.firstElementChild) return { el: e.firstElementChild, key: 'menu:' + e.firstElementChild.textContent.trim() };
      if (e.classList && e.classList.contains('field')) {
        const inp = e.querySelector('[id]');
        if (inp) return { el: e, key: 'id:' + inp.id };
      }
      if (e.id && HW.HELP['id:' + e.id]) return { el: e, key: 'id:' + e.id };
      if (e.id && HW.HELP['id:' + e.id.replace(/\d+$/, '')]) return { el: e, key: 'id:' + e.id.replace(/\d+$/, '') };
    }
    return null;
  }
  function lookup(key) {
    if (HW.HELP[key]) return HW.HELP[key];
    const k2 = key.replace(/\d+$/, '');
    if (HW.HELP[k2]) return HW.HELP[k2];
    const m = /^p:\w+\.(\w+)$/.exec(key);
    return m ? HW.HELP['p:' + m[1]] : null;
  }

  function hide() { clearTimeout(timer); if (tip) tip.style.display = 'none'; cur = null; }
  function show(el, h) {
    if (!tip) { tip = document.createElement('div'); tip.id = 'helpTip'; document.body.appendChild(tip); }
    const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    tip.innerHTML = (h[2] ? `<div class="tipx">${esc(h[2])}</div>` : '') + `<b>${esc(h[0])}</b><div>${esc(h[1])}</div>`;
    tip.style.display = 'block';
    const r = el.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = r.left, y = r.bottom + 8;
    if (x + tw > innerWidth - 8) x = innerWidth - tw - 8;
    if (y + th > innerHeight - 8) y = r.top - th - 8;
    if (y < 4) { y = r.top; x = r.right + 8 > innerWidth - tw ? r.left - tw - 8 : r.right + 8; }
    tip.style.left = Math.max(4, x) + 'px'; tip.style.top = Math.max(4, y) + 'px';
  }

  document.addEventListener('mouseover', (ev) => {
    if (!on) return;
    const f = keyOf(ev.target);
    if (!f) { if (cur) hide(); return; }
    const h = lookup(f.key);
    if (!h) { hide(); return; }
    if (cur === f.el) return;
    hide();
    cur = f.el;
    // Browser-Tooltip unterdrücken, solange die Info angezeigt wird
    if (f.el.title) { f.el.dataset.ntitle = f.el.title; f.el.removeAttribute('title'); }
    // eigener Kurztext des Elements darunter (z. B. Garnname eines Farbfelds) als Zusatzzeile
    const inner = ev.target.closest('[title],[data-ntitle]');
    let extra = null;
    if (inner && f.el.contains(inner) && inner !== f.el) { if (inner.title) { inner.dataset.ntitle = inner.title; inner.removeAttribute('title'); } extra = inner.dataset.ntitle; }
    timer = setTimeout(() => show(f.el, extra ? [h[0], h[1], extra] : h), 450);
  });
  document.addEventListener('mouseout', (ev) => {
    if (cur && !cur.contains(ev.relatedTarget)) {
      hide();
    }
  });
  ['mousedown', 'keydown', 'wheel', 'scroll'].forEach((t) => document.addEventListener(t, hide, true));

  HW.tips = {
    get on() { return on; },
    set(v) {
      on = !!v;
      try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* privat */ }
      // ausgeschaltet: ursprüngliche kurze Browser-Tooltips wiederherstellen
      if (!on) document.querySelectorAll('[data-ntitle]').forEach((e) => { e.title = e.dataset.ntitle; });
      hide();
      document.querySelectorAll('[data-tipstate]').forEach((e) => { e.dataset.tipstate = on ? 'on' : 'off'; });
    },
  };
  if (typeof document !== 'undefined') document.querySelectorAll('[data-tipstate]').forEach((e) => { e.dataset.tipstate = on ? 'on' : 'off'; });
})(typeof window !== 'undefined' ? window : globalThis);
