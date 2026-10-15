/* Englische Übersetzungen (Teil A: index.html, app.js Zeilen 1–1700) */
(function (g) {
  const HW = (g.HW = g.HW || {});
  HW.I18N = HW.I18N || { en: { exact: {}, rx: [] } };
  const E = HW.I18N.en;
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /* ---------- index.html: Menüs ---------- */
  Object.assign(E.exact, {
    // Datei
    'Datei': 'File',
    'Neu': 'New',
    'Projekt öffnen…': 'Open project…',
    'Projekt speichern': 'Save project',
    'Design-Bibliothek…': 'Design library…',
    'In Bibliothek speichern': 'Save to library',
    'Vektorgrafik importieren (SVG, PDF, AI)…': 'Import vector graphic (SVG, PDF, AI)…',
    'Stickdatei importieren (DST, PES, JEF, EXP)…': 'Import embroidery file (DST, PES, JEF, EXP)…',
    'Stickdatei exportieren (DST, PES, JEF, EXP)': 'Export embroidery file (DST, PES, JEF, EXP)',
    'Teamnamen / Seriennamen…': 'Team names / serial names…',
    'Auf mehrere Einspannungen verteilen…': 'Split across multiple hoopings…',
    'Arbeitsblatt drucken': 'Print worksheet',
    'Produkt-Vorschau (Mockup)…': 'Product preview (mockup)…',
    'Preiskalkulation & Angebot…': 'Pricing & quote…',
    // Bearbeiten
    'Bearbeiten': 'Edit',
    'Rückgängig': 'Undo',
    'Wiederholen': 'Redo',
    'Duplizieren': 'Duplicate',
    'Löschen': 'Delete',
    'Alles auswählen': 'Select all',
    'Horizontal spiegeln': 'Mirror horizontally',
    'Vertikal spiegeln': 'Mirror vertically',
    'Drehen…': 'Rotate…',
    'Skalieren…': 'Scale…',
    'In Rahmenmitte setzen': 'Center in hoop',
    'Kopien anordnen (Kreis / Raster)…': 'Arrange copies (circle / grid)…',
    'An Rahmen anpassen (Größe)': 'Fit to hoop (size)',
    'Überlappungen entfernen': 'Remove overlaps',
    'Formen vereinen': 'Merge shapes',
    'Untere Form ausschneiden (Rest abziehen)': 'Cut out lower shape (subtract)',
    'Schnittmenge': 'Intersection',
    'Applikation aus Form…': 'Appliqué from shape…',
    'Knockdown-Stich (Frottee, Fleece)…': 'Knockdown stitch (terry, fleece)…',
    'Für Kappe sortieren (Mitte → außen, unten → oben)…': 'Sort for cap (center → out, bottom → top)…',
    'Satinlinie (C) in Satin A umwandeln (Breite frei formen)': 'Convert satin line (C) to Satin A (free-form width)',
    'In Einzelstiche umwandeln': 'Convert to single stitches',
    'Nach Farbe sortieren': 'Sort by color',
    'Reihenfolge optimieren (kürzeste Wege)': 'Optimize order (shortest paths)',
    'Stickprüfung…': 'Stitch check…',
    // Anordnen
    'Anordnen': 'Arrange',
    'Links ausrichten': 'Align left',
    'Waagrecht mittig': 'Center horizontally',
    'Rechts ausrichten': 'Align right',
    'Oben ausrichten': 'Align top',
    'Senkrecht mittig': 'Center vertically',
    'Unten ausrichten': 'Align bottom',
    'Waagrecht verteilen': 'Distribute horizontally',
    'Senkrecht verteilen': 'Distribute vertically',
    'Gruppieren': 'Group',
    'Gruppierung lösen': 'Ungroup',
    'Text auf Linie setzen…': 'Text on path…',
    'Monogramm…': 'Monogram…',
    'Ein Objekt: Ausrichten am Rahmen. Mehrere: aneinander.': 'One object: aligns to the hoop. Several: to each other.',
    // Bild
    'Bild': 'Image',
    'Bild einfügen…': 'Insert image…',
    'Bild-Einstellungen…': 'Image settings…',
    'Bild ein/aus': 'Image on/off',
    'Bild entfernen': 'Remove image',
    'Bild/Design an Rahmen anpassen': 'Fit image/design to hoop',
    'Auto-Digitalisieren…': 'Auto-digitize…',
    // Ansicht
    'Ansicht': 'View',
    'TrueView (Fadenansicht)': 'TrueView (thread view)',
    'Sprünge anzeigen': 'Show jumps',
    'Raster': 'Grid',
    'Einrasten an Raster/Hilfslinien': 'Snap to grid/guides',
    'Hilfslinien & Rasterweite…': 'Guides & grid spacing…',
    'Einstichpunkte': 'Needle points',
    'Mausrad zoomt (statt scrollen)': 'Mouse wheel zooms (instead of scrolling)',
    'Alles zeigen': 'Show all',
    'Rahmen zeigen': 'Show hoop',
    // Einstellungen
    'Einstellungen': 'Settings',
    'Maschine, Schnitte & Sprünge…': 'Machine, trims & jumps…',
    'Stickrahmen…': 'Hoops…',
    'Hilfe-Infos beim Überfahren': 'Help tips on hover',
    'Hilfe / Tastatur': 'Help / keyboard',
    // Tastenkürzel
    'Strg+O': 'Ctrl+O', 'Strg+S': 'Ctrl+S', 'Strg+B': 'Ctrl+B', 'Strg+E': 'Ctrl+E',
    'Strg+Z': 'Ctrl+Z', 'Strg+Y': 'Ctrl+Y', 'Strg+D': 'Ctrl+D', 'Strg+A': 'Ctrl+A',
    'Strg+G': 'Ctrl+G', 'Strg+Shift+G': 'Ctrl+Shift+G', 'Entf': 'Del',
    // Kopfleiste rechts
    'Stickrahmen': 'Hoop',
    'Rahmen': 'Hoop',
    'Rahmen verwalten, eigene Rahmen anlegen, Design einpassen': 'Manage hoops, create custom hoops, fit design',
    '⬚ Rahmen…': '⬚ Hoop…',
    'Design bzw. Auswahl an den Rahmen anpassen (Größe + Stiche neu berechnen)': 'Fit design or selection to the hoop (size + recalculate stitches)',
    '⤢ An Rahmen anpassen': '⤢ Fit to hoop',
    'DST exportieren': 'Export DST',
  });

  /* ---------- index.html: Werkzeuge, Seitenleiste, Statusleiste ---------- */
  Object.assign(E.exact, {
    'Auswahl': 'Selection',
    'Auswählen (Esc)': 'Select (Esc)',
    'Auswählen': 'Select',
    'Umformen (R)': 'Reshape (R)',
    'Umformen': 'Reshape',
    'Ansicht verschieben (H)': 'Pan view (H)',
    'Verschieben': 'Pan',
    'Linien': 'Lines',
    'Laufstich (offene Form)': 'Run stitch (open shape)',
    'Dreifachstich': 'Triple run',
    'Dreifach': 'Triple',
    'Satinlinie mit fester Breite (Säule C)': 'Satin line with fixed width (column C)',
    'Satin frei': 'Free satin',
    'Satin A – Kanten abwechselnd anklicken, Breite frei': 'Satin A – click edges alternately, free width',
    'Satin B – erst eine Kante, Enter, dann die andere': 'Satin B – first one edge, Enter, then the other',
    'Flächen': 'Fills',
    'Geschlossene Form (Tatami-Füllung)': 'Closed shape (tatami fill)',
    'Fläche': 'Fill',
    'Rechteck': 'Rectangle',
    'Kreis / Ellipse': 'Circle / ellipse',
    'Schrift': 'Lettering',
    'Messer: Flächen entlang einer Linie teilen': 'Knife: split fills along a line',
    'Messer': 'Knife',
    'Stiche': 'Stitches',
    'Manuell: jeder Klick ein Stich, Rechtsklick = Sprung': 'Manual: each click is one stitch, right-click = jump',
    'Manuell': 'Manual',
    'Für Touch: Tippen setzt Kurvenpunkte': 'For touch: tapping sets curve points',
    'Kurve': 'Curve',
    'Stoff': 'Fabric',
    '(passt Stiche automatisch an)': '(adjusts stitches automatically)',
    'Eigenschaften': 'Properties',
    'Farben': 'Colors',
    '(Klick = aktiv / zuweisen)': '(click = make active / assign)',
    '+ Farbe': '+ Color',
    '− Entfernen': '− Remove',
    'Allen Farben echte Garne einer Marke zuordnen': 'Match all colors to real threads of one brand',
    'Garnmarke…': 'Thread brand…',
    'Reihenfolge': 'Sequence',
    '(oben = zuerst gestickt)': '(top = sewn first)',
    'Sticksimulation': 'Stitch simulation',
    'langsam': 'slow',
    'schnell': 'fast',
    'sehr schnell': 'very fast',
    'Stickprüfung': 'Stitch check',
  });

  /* ---------- app.js: Farbnamen, Objektarten ---------- */
  const COLORS = [['Schwarz', 'Black'], ['Weiß', 'White'], ['Rot', 'Red'], ['Königsblau', 'Royal blue'], ['Gelb', 'Yellow'], ['Grün', 'Green'],
    ['Orange', 'Orange'], ['Grau', 'Gray'], ['Braun', 'Brown'], ['Pink', 'Pink'], ['Hellblau', 'Light blue'], ['Gold', 'Gold']];
  Object.assign(E.exact, {
    'Schwarz': 'Black', 'Weiß': 'White', 'Rot': 'Red', 'Königsblau': 'Royal blue',
    'Gelb': 'Yellow', 'Grün': 'Green', 'Orange': 'Orange', 'Grau': 'Gray',
    'Braun': 'Brown', 'Pink': 'Pink', 'Hellblau': 'Light blue', 'Gold': 'Gold',
  });
  const NAMES = {
    'Laufstich': 'Run stitch',
    'Dreifachstich': 'Triple run',
    'Bohnenstich': 'Bean stitch',
    'Satinsäule A': 'Satin column A',
    'Satinsäule B': 'Satin column B',
    'Satinlinie C': 'Satin line C',
    'Fläche': 'Fill',
    'Einzelstiche': 'Single stitches',
    'Applikation: Platzierung': 'Appliqué: placement',
    'Applikation: Heften': 'Appliqué: tack-down',
    'Applikation: Abdeckung': 'Appliqué: cover',
    'Satin-Fläche': 'Satin fill',
    'Kontur-Fläche': 'Contour fill',
    'Spiral-Fläche': 'Spiral fill',
    'Wellen-Fläche': 'Wave fill',
    'Muster-Fläche': 'Pattern fill',
    'Verlaufs-Fläche': 'Gradient fill',
    'Kreuzstich': 'Cross stitch',
    'Knockdown': 'Knockdown',
    'Tatami-Fläche': 'Tatami fill',
    'Satinsäule A (3D-Puff)': 'Satin column A (3D puff)',
    'Satinsäule B (3D-Puff)': 'Satin column B (3D puff)',
    'Satinlinie C (3D-Puff)': 'Satin line C (3D puff)',
  };
  const nameRx = [];
  for (const [de, en] of Object.entries(NAMES)) {
    const k = esc(de);
    E.exact[de] = en;
    E.exact['– ' + de] = '– ' + en; // Eigenschaften-Titel / Stickprüfung
    nameRx.push(
      [new RegExp('^(\\d+)\\. ' + k + '$'), '$1. ' + en], // Objektliste
      [new RegExp('^– (\\d+)\\. ' + k + '$'), '– $1. ' + en], // Stickprüfung
      [new RegExp('^– (\\d+) × ' + k + '$'), '– $1 × ' + en], // Eigenschaften-Titel (Mehrfachauswahl)
    );
  }

  /* ---------- app.js: Stickprüfung ---------- */
  Object.assign(E.exact, {
    '✓ Prüfung ok': '✓ Check OK',
    'Zeigen': 'Show',
    '✓ Keine Probleme gefunden. Stichwinkel, Dichte und Stichlängen sind für die Maschine in Ordnung.': '✓ No problems found. Stitch angles, density and stitch lengths are fine for the machine.',
    'Alle korrigieren': 'Fix all',
    'Trotzdem behalten': 'Keep anyway',
    'OK': 'OK',
    'Stickprüfung – das stickt die Maschine nicht sauber': 'Stitch check – the machine won’t sew this cleanly',
    'Hinweise nicht mehr automatisch anzeigen (Prüfung bleibt unten in der Statusleiste)': 'Don’t show warnings automatically any more (the check stays in the status bar below)',
  });

  /* ---------- app.js: Stoff ---------- */
  Object.assign(E.exact, {
    'Vlies:': 'Stabilizer:',
    'Topper:': 'Topping:',
    'Nadel:': 'Needle:',
    'max.': 'max.',
    'Details & Tipps…': 'Details & tips…',
    '+ Knockdown-Stich': '+ Knockdown stitch',
    'Flor/Schlaufen flachdrücken, damit feine Details nicht versinken': 'Flatten pile/loops so fine details don’t sink in',
    'Stickvlies:': 'Stabilizer:',
    'Geschwindigkeit:': 'Speed:',
    'Dichte des Motivs:': 'Design density:',
    'Automatische Anpassung für diesen Stoff:': 'Automatic adjustment for this fabric:',
    'Tipps:': 'Tips:',
    'Hinweise zum Motiv:': 'Notes on the design:',
    'Die Werte sind bewährte Richtwerte. Vor großen Aufträgen immer einen Probestick auf dem Originalstoff machen. Jeder Wert lässt sich pro Objekt von Hand überschreiben.': 'These values are proven guidelines. Always sew a test on the original fabric before large orders. Every value can be overridden manually per object.',
    'Geschwindigkeit übernehmen': 'Apply speed',
  });

  /* ---------- app.js: Statusleiste ---------- */
  Object.assign(E.exact, {
    'Stiche:': 'Stitches:',
    'Klicken für Rahmen-Optionen': 'Click for hoop options',
    '⚠ ragt über das Stickfeld': '⚠ extends beyond the sewing field',
    '⚠ im Sicherheitsabstand': '⚠ within the safety margin',
    'Ein-/Ausblenden': 'Show/hide',
  });

  /* ---------- app.js: Eigenschaften (PARAM_DEFS u. a.) ---------- */
  Object.assign(E.exact, {
    'Stichart': 'Stitch type',
    'Stichlänge (mm)': 'Stitch length (mm)',
    'Geschlossen': 'Closed',
    'Satin': 'Satin',
    'E-Stich (Applikation)': 'E-stitch (appliqué)',
    'Dichte / Abstand (mm)': 'Density / spacing (mm)',
    'Zugkompensation (mm)': 'Pull compensation (mm)',
    'Unterlage': 'Underlay',
    'keine': 'none',
    'Mittellauf': 'Center run',
    'Kantenlauf': 'Edge run',
    'Zickzack': 'Zigzag',
    'Kante + Zickzack': 'Edge + zigzag',
    'Mitte + Zickzack': 'Center + zigzag',
    'Auto-Split ab (mm, 0=aus)': 'Auto split from (mm, 0 = off)',
    'Kurzstiche in Bögen': 'Short stitches in curves',
    '3D-Puff (Schaum)': '3D puff (foam)',
    'Füllart': 'Fill type',
    'Tatami': 'Tatami',
    'Satin (fester Winkel)': 'Satin (fixed angle)',
    'Kontur (parallel zum Rand)': 'Contour (parallel to edge)',
    'Spirale': 'Spiral',
    'Welle': 'Wave',
    'Muster (Tatami)': 'Pattern (tatami)',
    'Verlauf (dicht → offen)': 'Gradient (dense → open)',
    'Knockdown (Gitter)': 'Knockdown (grid)',
    'Muster': 'Pattern',
    'Rauten': 'Diamonds',
    'Diagonal': 'Diagonal',
    'Ziegel': 'Brick',
    'Wellen': 'Waves',
    'Wellenhöhe (mm)': 'Wave height (mm)',
    'Wellenlänge (mm)': 'Wavelength (mm)',
    'Verlauf bis Abstand (mm)': 'Gradient to spacing (mm)',
    'Kreuzgröße (mm)': 'Cross size (mm)',
    'Kreuze doppelt': 'Double crosses',
    'Stichwinkel (°)': 'Stitch angle (°)',
    'Kante + Tatami': 'Edge + tatami',
    'Satin-Split ab (mm)': 'Satin split from (mm)',
    'Kontur': 'Outline',
    'Satin-Konturbreite (mm)': 'Satin outline width (mm)',
    'Breite (mm)': 'Width (mm)',
    // Verbindung / Stopp
    'Verbindung davor': 'Connection before',
    'Wie die Maschine vom vorigen Objekt zu diesem kommt': 'How the machine gets from the previous object to this one',
    'Automatisch': 'Automatic',
    'Immer schneiden': 'Always trim',
    'Springen ohne Schnitt': 'Jump without trim',
    'Direkt als Stich': 'Directly as a stitch',
    'Maschine stoppt davor': 'Machine stops before',
    'Stopp (z. B. Applikationsstoff oder Puff-Schaum auflegen). In der DST ein Farbwechsel auf dieselbe Nadel.': 'Stop (e.g. to place appliqué fabric or puff foam). In the DST this is a color change to the same needle.',
    // Text-Gruppe
    'Text bearbeiten…': 'Edit text…',
    'Buchstaben einzeln bearbeiten (Text ist danach nicht mehr änderbar)': 'Edit letters individually (the text can no longer be changed afterwards)',
    'Buchstaben anpassen…': 'Adjust letters…',
    'Einzelne Buchstaben verschieben, drehen, vergrößern; Abstände (Kerning)': 'Move, rotate, enlarge individual letters; spacing (kerning)',
    '– Schrift': '– Lettering',
    'Sticheigenschaften aller Buchstaben:': 'Stitch properties of all letters:',
    'Objekt auswählen oder Werkzeug wählen, um die Stich-Eigenschaften einzustellen.': 'Select an object or choose a tool to set the stitch properties.',
    'Vorgabe für neue Objekte': 'Default for new objects',
    '– Vorgabe für neue Objekte': '– Default for new objects',
    'In Satin A umwandeln (Breite frei formen)': 'Convert to Satin A (free-form width)',
    'jeden Stich verschieben (Entf = löschen, Doppelklick = einfügen).': 'to move each stitch (Del = delete, double-click = insert).',
    'An Stoff anpassen (automatisch)': 'Adapt to fabric (automatic)',
    'Dichte, Zugausgleich, Unterlage und Stichlänge werden aus Stoff und Säulenbreite berechnet.': 'Density, pull compensation, underlay and stitch length are calculated from the fabric and column width.',
    'Von Hand geänderte Werte wieder automatisch': 'Reset manually changed values to automatic',
    '· von Hand': '· manual',
  });

  /* ---------- app.js: Hinweiszeile ---------- */
  const HINTS = {
    'Verschieben: mit gedrückter Maustaste ziehen, um die Ansicht zu verschieben. Esc = zurück zum Auswählen.': 'Pan: drag with the mouse button held to move the view. Esc = back to Select.',
    'Klicken = auswählen, ziehen = verschieben, Rahmen ziehen = mehrere wählen. Ansicht verschieben: Mausrad (Shift = seitlich), Leertaste + Ziehen oder mittlere Maustaste. Strg + Mausrad = Zoom.': 'Click = select, drag = move, drag a box = select several. Pan the view: mouse wheel (Shift = sideways), Space + drag or middle mouse button. Ctrl + mouse wheel = zoom.',
    'Punkte ziehen. Leertaste = Ecke ↔ Kurve, Entf = Punkt löschen, Doppelklick auf Linie = Punkt einfügen. Oranger Griff = Stichwinkel.': 'Drag points. Space = corner ↔ curve, Del = delete point, double-click on line = insert point. Orange handle = stitch angle.',
    'Linksklick = Eckpunkt, Rechtsklick = Kurvenpunkt. Enter = fertig, Rücktaste = letzten Punkt löschen, Esc = abbrechen.': 'Left-click = corner point, right-click = curve point. Enter = done, Backspace = delete last point, Esc = cancel.',
    'Linksklick = Eckpunkt, Rechtsklick = Kurvenpunkt. Enter = fertig.': 'Left-click = corner point, right-click = curve point. Enter = done.',
    'Mittellinie digitalisieren: Links = Ecke, Rechts = Kurve. Enter = fertig. Breite rechts bei Eigenschaften.': 'Digitize the center line: left = corner, right = curve. Enter = done. Set the width on the right under Properties.',
    'Abwechselnd linke und rechte Seite der Säule anklicken (Paare). Links = Ecke, Rechts = Kurve. Enter = fertig.': 'Click the left and right side of the column alternately (pairs). Left = corner, right = curve. Enter = done.',
    'Erste Seite digitalisieren → Enter → zweite Seite → Enter. Links = Ecke, Rechts = Kurve.': 'Digitize the first side → Enter → second side → Enter. Left = corner, right = curve.',
    'Umriss: Links = Ecke, Rechts = Kurve, Enter schließt. Dann Löcher (Enter überspringt), dann Stichwinkel mit 2 Klicks (Enter = Vorgabe).': 'Outline: left = corner, right = curve, Enter closes. Then holes (Enter skips), then stitch angle with 2 clicks (Enter = default).',
    'Ziehen, um ein Rechteck zu erstellen.': 'Drag to create a rectangle.',
    'Ziehen, um einen Kreis/eine Ellipse zu erstellen (Shift = Kreis).': 'Drag to create a circle/ellipse (Shift = circle).',
    'Auf die Arbeitsfläche klicken, um Text einzufügen.': 'Click on the canvas to insert text.',
    'Messer: zwei Punkte klicken – die Linie teilt die ausgewählten Flächen (oder alle Flächen, die sie kreuzt).': 'Knife: click two points – the line splits the selected fills (or all fills it crosses).',
    'Jeder Linksklick = ein Stich, Rechtsklick = Sprung. Enter = fertig.': 'Each left-click = one stitch, right-click = jump. Enter = done.',
    'Jetzt die ZWEITE Seite digitalisieren, Enter = fertig.': 'Now digitize the SECOND side, Enter = done.',
    'Loch digitalisieren (Enter schließt das Loch) – oder sofort Enter: keine (weiteren) Löcher.': 'Digitize a hole (Enter closes the hole) – or press Enter right away: no (more) holes.',
    'Stichwinkel: zwei Punkte klicken – oder Enter für Vorgabewinkel.': 'Stitch angle: click two points – or Enter for the default angle.',
  };
  const TOUCH_DE = ' [Touch: Kurvenpunkt-Modus aktiv]', TOUCH_EN = ' [Touch: curve point mode on]';
  for (const [de, en] of Object.entries(HINTS)) { E.exact[de] = en; E.exact[de + TOUCH_DE] = en + TOUCH_EN; }
  // Satin A: dynamischer Hinweis (Punkt n, Seite, Paar, „Enter = fertig“, Touch)
  const colArx = [];
  for (const [sDe, sEn] of [['ORANGE Kante (Seite 2)', 'ORANGE edge (side 2)'], ['BLAUE Kante (Seite 1)', 'BLUE edge (side 1)']]) {
    for (const pair of [false, true]) for (const enter of [false, true]) for (const touch of [false, true]) {
      const re = '^Satin A – Punkt (\\d+): jetzt auf die ' + esc(sDe) + ' klicken' + (pair ? ' · Paar (\\d+)' : '') +
        '\\. Immer abwechselnd Seite 1 / Seite 2, jedes Paar gibt Breite und Stichrichtung vor\\. Linksklick = Ecke, Rechtsklick = Kurve\\. ' +
        (enter ? 'Enter = fertig, ' : '') + 'Rücktaste = letzten Punkt zurück, Esc = abbrechen\\.' + (touch ? esc(TOUCH_DE) : '') + '$';
      const rep = 'Satin A – point $1: now click the ' + sEn + (pair ? ' · pair $2' : '') +
        '. Always alternate side 1 / side 2; each pair sets width and stitch direction. Left-click = corner, right-click = curve. ' +
        (enter ? 'Enter = done, ' : '') + 'Backspace = undo last point, Esc = cancel.' + (touch ? TOUCH_EN : '');
      colArx.push([new RegExp(re), rep]);
    }
  }

  /* ---------- app.js: Dialoge (Satin A, Anordnen, Hilfslinien, Farbe) ---------- */
  Object.assign(E.exact, {
    'In Satin A umwandeln': 'Convert to Satin A',
    'Bitte zuerst eine oder mehrere': 'Please first select one or more',
    'Satinlinien (Satin C)': 'satin lines (Satin C)',
    'auswählen.': '.',
    'Umgewandelt: Jetzt mit Umformen die blauen und orangen Kantenpunkte einzeln ziehen, um die Breite zu verändern. Doppelklick fügt ein Punktpaar ein.': 'Converted: now use Reshape to drag the blue and orange edge points individually to change the width. Double-click inserts a point pair.',
    'Bitte zuerst Objekte auswählen.': 'Please select objects first.',
    'Kopien anordnen (Kreis / Raster)': 'Arrange copies (circle / grid)',
    'Art': 'Type',
    'Kreis': 'Circle',
    'Raster (Reihen × Spalten)': 'Grid (rows × columns)',
    'Anzahl insgesamt': 'Total count',
    'Radius (mm)': 'Radius (mm)',
    'Mittelpunkt': 'Center',
    'Rahmenmitte': 'Hoop center',
    'unter der Auswahl (Radius)': 'below the selection (radius)',
    'Kopien mitdrehen': 'Rotate copies',
    'Spalten': 'Columns',
    'Reihen': 'Rows',
    'Abstand waagrecht (mm)': 'Horizontal gap (mm)',
    'Abstand senkrecht (mm)': 'Vertical gap (mm)',
    'Abbrechen': 'Cancel',
    'Hilfslinien & Einrasten': 'Guides & snapping',
    'Rasterweite (mm)': 'Grid spacing (mm)',
    'Neue Hilfslinie': 'New guide',
    'senkrecht bei X': 'vertical at X',
    'waagrecht bei Y': 'horizontal at Y',
    'Position (mm, 0 = Rahmenmitte)': 'Position (mm, 0 = hoop center)',
    'Noch keine Hilfslinien.': 'No guides yet.',
    'Alle Hilfslinien löschen': 'Delete all guides',
    'Übernehmen': 'Apply',
    'Farbe': 'Color',
    'Name / Garnnummer': 'Name / thread number',
    'Nadel (1–15)': 'Needle (1–15)',
    'Garn aus Farbkarte wählen': 'Choose thread from thread chart',
    'Garnmarke': 'Thread brand',
    'Suchen (Nummer oder Name)': 'Search (number or name)',
    'z. B. 1800 oder rot': 'e.g. 1800 or red',
    'Bildschirmfarben sind Näherungen – maßgeblich ist die echte Farbkarte des Herstellers.': 'Screen colors are approximations – the manufacturer’s real thread chart is what counts.',
    'Kein Garn gefunden.': 'No thread found.',
  });

  /* ---------- dynamische Texte ---------- */
  // Statuszeile: „ · Farben: 3 · Schnitte: 2[ · versteckte Wege: 1] · Größe: 12,5 × 3,0 mm · ca. 5 min[ · Sprünge ohne Schnitt: 2][ ·]“
  const statsRx = [];
  for (const trav of [false, true]) for (const flo of [false, true]) {
    const re = '^· Farben: (\\d+) · Schnitte: (\\d+)' + (trav ? ' · versteckte Wege: (\\d+)' : '') +
      ' · Größe: (.+?) × (.+?) mm · ca\\. (.+?) min' + (flo ? ' · Sprünge ohne Schnitt: (\\d+)' : '') + '( ·)?$';
    let n = 3;
    const tr = trav ? ' · hidden travel: $' + n++ : '';
    const w = '$' + n++, h = '$' + n++, m = '$' + n++;
    const fl = flo ? ' · jumps without trim: $' + n++ : '';
    const rep = '· Colors: $1 · Trims: $2' + tr + ' · Size: ' + w + ' × ' + h + ' mm · approx. ' + m + ' min' + fl + '$' + n;
    statsRx.push([new RegExp(re), rep]);
  }

  E.rx.push(
    // Prüf-Knopf in der Statusleiste
    [/^⚠ Prüfung: 1 Fehler, 1 Hinweis$/, '⚠ Check: 1 error, 1 warning'],
    [/^⚠ Prüfung: 1 Fehler, (\d+) Hinweise$/, '⚠ Check: 1 error, $1 warnings'],
    [/^⚠ Prüfung: (\d+) Fehler, 1 Hinweis$/, '⚠ Check: $1 errors, 1 warning'],
    [/^⚠ Prüfung: (\d+) Fehler, (\d+) Hinweise$/, '⚠ Check: $1 errors, $2 warnings'],
    [/^⚠ Prüfung: 1 Hinweis$/, '⚠ Check: 1 warning'],
    [/^⚠ Prüfung: (\d+) Hinweise$/, '⚠ Check: $1 warnings'],
    // Stickprüfung-Dialog
    [/^Maschine: (.+?)\. Grenzwerte unter Einstellungen → Maschine & Rahmen\.$/, 'Machine: $1. Limits under Settings → Machine & hoop.'],
    // Rahmenbeschriftung (Canvas, falls über HW.i18n.t)
    [/^(.+) – Stickfeld (.+) mm$/, '$1 – sewing field $2 mm'],
    // Stoff
    [/^([\d.,]+) Stiche\/min$/, '$1 stitches/min'],
    [/^höchstens ([\d.,]+) Stiche\/min$/, 'at most $1 stitches/min'],
    [/^([\d.,]+) Stiche\/cm²$/, '$1 stitches/cm²'],
    [/^Mehr Lagen wegen: (.+)$/, 'More layers because of: $1'],
    [/^Stoff: (.+)$/, 'Fabric: $1'],
    ...statsRx,
    // Farbfeld-Tooltip „1: Schwarz – Nadel 1“ (Standardfarben übersetzt, sonst Name behalten)
    ...COLORS.map(([de, en]) => [new RegExp('^(\\d+): ' + de + ' – Nadel (\\d+)$'), '$1: ' + en + ' – needle $2']),
    [/^(\d+): (.+) – Nadel (\d+)$/, '$1: $2 – needle $3'],
    // Eigenschaften
    [/^Text „([\s\S]*)“ \((.*), (\d+) Objekte\)$/, 'Text “$1” ($2, $3 objects)'],
    [/^(\d+) Objekte ausgewählt \(verschiedene Arten\)\. Farbe per Klick in der Palette zuweisen\.$/, '$1 objects selected (different kinds). Click a palette color to assign it.'],
    [/^(\d+) Einzelstiche\. Mit$/, '$1 single stitches. Use'],
    // Dialoge
    [/^Vorhandene: (.+)$/, 'Existing: $1'],
    [/^Farbe (\d+) bearbeiten$/, 'Edit color $1'],
    ...colArx,
    ...nameRx,
    [/^– (\d+) × (.+)$/, '– $1 × $2'],
  );
  // Stoff-Dialog: automatische Anpassung (Satin- und Tatami-Zeile)
  for (const [ulDe, ulEn] of [['leicht', 'light'], ['normal', 'normal'], ['kräftig', 'heavy']]) {
    E.rx.push([new RegExp('^Satin-Abstand × ([\\d.,]+) \\(zusätzlich nach Säulenbreite: schmal lockerer, breit dichter\\) · Zugausgleich ([\\d.,-]+) mm \\+ ([\\d.,-]+) % der Breite · Satin-Split ab ([\\d.,]+) mm · Unterlage ' + ulDe + '$'),
      'Satin spacing × $1 (also by column width: narrow looser, wide denser) · pull compensation $2 mm + $3 % of width · satin split from $4 mm · underlay ' + ulEn]);
  }
  for (const [ulDe, ulEn] of [['Kante\\+Tatami', 'edge+tatami'], ['Tatami', 'tatami'], ['Kante', 'edge'], ['none', 'none'], ['(.+)', '$4']]) {
    E.rx.push([new RegExp('^Tatami: Abstand ([\\d.,]+) mm, Stichlänge ([\\d.,]+) mm, Zugausgleich ([\\d.,-]+) mm, Unterlage ' + ulDe + '$'),
      'Tatami: spacing $1 mm, stitch length $2 mm, pull compensation $3 mm, underlay ' + ulEn]);
  }
})(typeof window !== 'undefined' ? window : globalThis);
