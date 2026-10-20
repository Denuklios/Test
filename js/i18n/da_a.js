/* Dänische Übersetzungen (Teil A: index.html, app.js Zeilen 1–1700) */
(function (g) {
  const HW = (g.HW = g.HW || {});
  HW.I18N = HW.I18N || {}; HW.I18N.da = HW.I18N.da || { exact: {}, rx: [] };
  const E = HW.I18N.da;
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /* ---------- index.html: Menüs ---------- */
  Object.assign(E.exact, {
    // Datei
    'Datei': 'Filer',
    'Neu': 'Ny',
    'Projekt öffnen…': 'Åbn projekt…',
    'Projekt speichern': 'Gem projekt',
    'Design-Bibliothek…': 'Designbibliotek…',
    'In Bibliothek speichern': 'Gem i bibliotek',
    'Vektorgrafik importieren (SVG, PDF, AI)…': 'Importér vektorgrafik (SVG, PDF, AI)…',
    'Stickdatei importieren (DST, PES, JEF, EXP)…': 'Importér broderifil (DST, PES, JEF, EXP)…',
    'Stickdatei exportieren (DST, PES, JEF, EXP)': 'Eksportér broderifil (DST, PES, JEF, EXP)',
    'Teamnamen / Seriennamen…': 'Holdnavne / serienavne…',
    'Auf mehrere Einspannungen verteilen…': 'Fordel på flere opspændinger…',
    'Arbeitsblatt drucken': 'Udskriv arbejdsark',
    'Produkt-Vorschau (Mockup)…': 'Produktvisning (mockup)…',
    'Preiskalkulation & Angebot…': 'Priskalkulation & tilbud…',
    // Bearbeiten
    'Bearbeiten': 'Rediger',
    'Rückgängig': 'Fortryd',
    'Wiederholen': 'Gentag',
    'Duplizieren': 'Duplikér',
    'Löschen': 'Slet',
    'Alles auswählen': 'Markér alt',
    'Horizontal spiegeln': 'Spejlvend vandret',
    'Vertikal spiegeln': 'Spejlvend lodret',
    'Drehen…': 'Rotér…',
    'Skalieren…': 'Skalér…',
    'In Rahmenmitte setzen': 'Placér midt i rammen',
    'Kopien anordnen (Kreis / Raster)…': 'Arrangér kopier (cirkel / gitter)…',
    'An Rahmen anpassen (Größe)': 'Tilpas til rammen (størrelse)',
    'Überlappungen entfernen': 'Fjern overlap',
    'Formen vereinen': 'Forén former',
    'Untere Form ausschneiden (Rest abziehen)': 'Skær nederste form ud (træk fra)',
    'Schnittmenge': 'Fællesmængde',
    'Applikation aus Form…': 'Applikation fra form…',
    'Knockdown-Stich (Frottee, Fleece)…': 'Knockdown-sting (frotté, fleece)…',
    'Für Kappe sortieren (Mitte → außen, unten → oben)…': 'Sortér til kasket (midte → ud, nederst → øverst)…',
    'Satinlinie (C) in Satin A umwandeln (Breite frei formen)': 'Konvertér satinlinje (C) til Satin A (fri bredde)',
    'In Einzelstiche umwandeln': 'Konvertér til enkeltsting',
    'Nach Farbe sortieren': 'Sortér efter farve',
    'Reihenfolge optimieren (kürzeste Wege)': 'Optimér rækkefølge (korteste veje)',
    'Stickprüfung…': 'Broderikontrol…',
    // Anordnen
    'Anordnen': 'Arrangér',
    'Links ausrichten': 'Justér til venstre',
    'Waagrecht mittig': 'Centrér vandret',
    'Rechts ausrichten': 'Justér til højre',
    'Oben ausrichten': 'Justér til top',
    'Senkrecht mittig': 'Centrér lodret',
    'Unten ausrichten': 'Justér til bund',
    'Waagrecht verteilen': 'Fordel vandret',
    'Senkrecht verteilen': 'Fordel lodret',
    'Gruppieren': 'Gruppér',
    'Gruppierung lösen': 'Opløs gruppe',
    'Text auf Linie setzen…': 'Tekst på linje…',
    'Monogramm…': 'Monogram…',
    'Ein Objekt: Ausrichten am Rahmen. Mehrere: aneinander.': 'Ét objekt: justeres efter rammen. Flere: efter hinanden.',
    // Bild
    'Bild': 'Billede',
    'Bild einfügen…': 'Indsæt billede…',
    'Bild-Einstellungen…': 'Billedindstillinger…',
    'Bild ein/aus': 'Billede til/fra',
    'Bild entfernen': 'Fjern billede',
    'Bild/Design an Rahmen anpassen': 'Tilpas billede/design til rammen',
    'Auto-Digitalisieren…': 'Auto-digitalisér…',
    // Ansicht
    'Ansicht': 'Vis',
    'TrueView (Fadenansicht)': 'TrueView (trådvisning)',
    'Sprünge anzeigen': 'Vis spring',
    'Raster': 'Gitter',
    'Einrasten an Raster/Hilfslinien': 'Fastgør til gitter/hjælpelinjer',
    'Hilfslinien & Rasterweite…': 'Hjælpelinjer & gitterafstand…',
    'Einstichpunkte': 'Nålestik',
    'Mausrad zoomt (statt scrollen)': 'Musehjulet zoomer (i stedet for at rulle)',
    'Alles zeigen': 'Vis alt',
    'Rahmen zeigen': 'Vis ramme',
    // Einstellungen
    'Einstellungen': 'Indstillinger',
    'Maschine, Schnitte & Sprünge…': 'Maskine, klip & spring…',
    'Stickrahmen…': 'Broderirammer…',
    'Hilfe-Infos beim Überfahren': 'Hjælpetips ved mouseover',
    'Hilfe / Tastatur': 'Hjælp / tastatur',
    // Tastenkürzel
    'Strg+O': 'Ctrl+O', 'Strg+S': 'Ctrl+S', 'Strg+B': 'Ctrl+B', 'Strg+E': 'Ctrl+E',
    'Strg+Z': 'Ctrl+Z', 'Strg+Y': 'Ctrl+Y', 'Strg+D': 'Ctrl+D', 'Strg+A': 'Ctrl+A',
    'Strg+G': 'Ctrl+G', 'Strg+Shift+G': 'Ctrl+Shift+G', 'Entf': 'Del',
    // Kopfleiste rechts
    'Stickrahmen': 'Broderiramme',
    'Rahmen': 'Ramme',
    'Rahmen verwalten, eigene Rahmen anlegen, Design einpassen': 'Administrér rammer, opret egne rammer, tilpas design',
    '⬚ Rahmen…': '⬚ Ramme…',
    'Design bzw. Auswahl an den Rahmen anpassen (Größe + Stiche neu berechnen)': 'Tilpas design eller markering til rammen (størrelse + genberegn sting)',
    '⤢ An Rahmen anpassen': '⤢ Tilpas til rammen',
    'DST exportieren': 'Eksportér DST',
  });

  /* ---------- index.html: Werkzeuge, Seitenleiste, Statusleiste ---------- */
  Object.assign(E.exact, {
    'Auswahl': 'Markering',
    'Auswählen (Esc)': 'Markér (Esc)',
    'Auswählen': 'Markér',
    'Umformen (R)': 'Omform (R)',
    'Umformen': 'Omform',
    'Ansicht verschieben (H)': 'Panorér visning (H)',
    'Verschieben': 'Panorér',
    'Linien': 'Linjer',
    'Laufstich (offene Form)': 'Løbesting (åben form)',
    'Dreifachstich': 'Tredobbelt løbesting',
    'Dreifach': 'Tredobbelt',
    'Satinlinie mit fester Breite (Säule C)': 'Satinlinje med fast bredde (søjle C)',
    'Satin frei': 'Fri satin',
    'Satin A – Kanten abwechselnd anklicken, Breite frei': 'Satin A – klik skiftevis på kanterne, fri bredde',
    'Satin B – erst eine Kante, Enter, dann die andere': 'Satin B – først den ene kant, Enter, så den anden',
    'Flächen': 'Fyld',
    'Geschlossene Form (Tatami-Füllung)': 'Lukket form (tatamifyld)',
    'Fläche': 'Fyld',
    'Rechteck': 'Rektangel',
    'Kreis / Ellipse': 'Cirkel / ellipse',
    'Schrift': 'Skrift',
    'Messer: Flächen entlang einer Linie teilen': 'Kniv: del fyld langs en linje',
    'Messer': 'Kniv',
    'Stiche': 'Sting',
    'Manuell: jeder Klick ein Stich, Rechtsklick = Sprung': 'Manuel: hvert klik er ét sting, højreklik = spring',
    'Manuell': 'Manuel',
    'Für Touch: Tippen setzt Kurvenpunkte': 'Til touch: tryk sætter kurvepunkter',
    'Kurve': 'Kurve',
    'Stoff': 'Stof',
    '(passt Stiche automatisch an)': '(tilpasser sting automatisk)',
    'Eigenschaften': 'Egenskaber',
    'Farben': 'Farver',
    '(Klick = aktiv / zuweisen)': '(klik = gør aktiv / tildel)',
    '+ Farbe': '+ Farve',
    '− Entfernen': '− Fjern',
    'Allen Farben echte Garne einer Marke zuordnen': 'Tildel alle farver rigtige tråde fra ét mærke',
    'Garnmarke…': 'Trådmærke…',
    'Reihenfolge': 'Rækkefølge',
    '(oben = zuerst gestickt)': '(øverst = broderes først)',
    'Sticksimulation': 'Broderisimulering',
    'langsam': 'langsom',
    'schnell': 'hurtig',
    'sehr schnell': 'meget hurtig',
    'Stickprüfung': 'Broderikontrol',
  });

  /* ---------- app.js: Farbnamen, Objektarten ---------- */
  const COLORS = [['Schwarz', 'Sort'], ['Weiß', 'Hvid'], ['Rot', 'Rød'], ['Königsblau', 'Kongeblå'], ['Gelb', 'Gul'], ['Grün', 'Grøn'],
    ['Orange', 'Orange'], ['Grau', 'Grå'], ['Braun', 'Brun'], ['Pink', 'Pink'], ['Hellblau', 'Lyseblå'], ['Gold', 'Guld']];
  Object.assign(E.exact, {
    'Schwarz': 'Sort', 'Weiß': 'Hvid', 'Rot': 'Rød', 'Königsblau': 'Kongeblå',
    'Gelb': 'Gul', 'Grün': 'Grøn', 'Orange': 'Orange', 'Grau': 'Grå',
    'Braun': 'Brun', 'Pink': 'Pink', 'Hellblau': 'Lyseblå', 'Gold': 'Guld',
  });
  const NAMES = {
    'Laufstich': 'Løbesting',
    'Dreifachstich': 'Tredobbelt løbesting',
    'Bohnenstich': 'Bønnesting',
    'Satinsäule A': 'Satinsøjle A',
    'Satinsäule B': 'Satinsøjle B',
    'Satinlinie C': 'Satinlinje C',
    'Fläche': 'Fyld',
    'Einzelstiche': 'Enkeltsting',
    'Applikation: Platzierung': 'Applikation: placering',
    'Applikation: Heften': 'Applikation: hæftning',
    'Applikation: Abdeckung': 'Applikation: afdækning',
    'Satin-Fläche': 'Satinfyld',
    'Kontur-Fläche': 'Konturfyld',
    'Spiral-Fläche': 'Spiralfyld',
    'Wellen-Fläche': 'Bølgefyld',
    'Muster-Fläche': 'Mønsterfyld',
    'Verlaufs-Fläche': 'Gradientfyld',
    'Kreuzstich': 'Korssting',
    'Knockdown': 'Knockdown',
    'Tatami-Fläche': 'Tatamifyld',
    'Satinsäule A (3D-Puff)': 'Satinsøjle A (3D-puff)',
    'Satinsäule B (3D-Puff)': 'Satinsøjle B (3D-puff)',
    'Satinlinie C (3D-Puff)': 'Satinlinje C (3D-puff)',
  };
  const nameRx = [];
  for (const [de, da] of Object.entries(NAMES)) {
    const k = esc(de);
    E.exact[de] = da;
    E.exact['– ' + de] = '– ' + da; // Eigenschaften-Titel / Stickprüfung
    nameRx.push(
      [new RegExp('^(\\d+)\\. ' + k + '$'), '$1. ' + da], // Objektliste
      [new RegExp('^– (\\d+)\\. ' + k + '$'), '– $1. ' + da], // Stickprüfung
      [new RegExp('^– (\\d+) × ' + k + '$'), '– $1 × ' + da], // Eigenschaften-Titel (Mehrfachauswahl)
    );
  }

  /* ---------- app.js: Stickprüfung ---------- */
  Object.assign(E.exact, {
    '✓ Prüfung ok': '✓ Kontrol OK',
    'Zeigen': 'Vis',
    '✓ Keine Probleme gefunden. Stichwinkel, Dichte und Stichlängen sind für die Maschine in Ordnung.': '✓ Ingen problemer fundet. Stingvinkler, tæthed og stinglængder er i orden for maskinen.',
    'Alle korrigieren': 'Ret alle',
    'Trotzdem behalten': 'Behold alligevel',
    'OK': 'OK',
    'Stickprüfung – das stickt die Maschine nicht sauber': 'Broderikontrol – det broderer maskinen ikke pænt',
    'Hinweise nicht mehr automatisch anzeigen (Prüfung bleibt unten in der Statusleiste)': 'Vis ikke længere advarsler automatisk (kontrollen bliver i statuslinjen nederst)',
  });

  /* ---------- app.js: Stoff ---------- */
  Object.assign(E.exact, {
    'Vlies:': 'Stabilisator:',
    'Topper:': 'Topping:',
    'Nadel:': 'Nål:',
    'max.': 'maks.',
    'Details & Tipps…': 'Detaljer & tips…',
    '+ Knockdown-Stich': '+ Knockdown-sting',
    'Flor/Schlaufen flachdrücken, damit feine Details nicht versinken': 'Tryk luv/løkker flade, så fine detaljer ikke synker ned',
    'Stickvlies:': 'Stabilisator:',
    'Geschwindigkeit:': 'Hastighed:',
    'Dichte des Motivs:': 'Motivets tæthed:',
    'Automatische Anpassung für diesen Stoff:': 'Automatisk tilpasning til dette stof:',
    'Tipps:': 'Tips:',
    'Hinweise zum Motiv:': 'Bemærkninger til motivet:',
    'Die Werte sind bewährte Richtwerte. Vor großen Aufträgen immer einen Probestick auf dem Originalstoff machen. Jeder Wert lässt sich pro Objekt von Hand überschreiben.': 'Værdierne er gennemprøvede vejledende værdier. Lav altid en prøvebrodering på det originale stof før store ordrer. Hver værdi kan overskrives manuelt pr. objekt.',
    'Geschwindigkeit übernehmen': 'Anvend hastighed',
  });

  /* ---------- app.js: Statusleiste ---------- */
  Object.assign(E.exact, {
    'Stiche:': 'Sting:',
    'Klicken für Rahmen-Optionen': 'Klik for rammeindstillinger',
    '⚠ ragt über das Stickfeld': '⚠ rager ud over broderifeltet',
    '⚠ im Sicherheitsabstand': '⚠ inden for sikkerhedsafstanden',
    'Ein-/Ausblenden': 'Vis/skjul',
  });

  /* ---------- app.js: Eigenschaften (PARAM_DEFS u. a.) ---------- */
  Object.assign(E.exact, {
    'Stichart': 'Stingtype',
    'Stichlänge (mm)': 'Stinglængde (mm)',
    'Geschlossen': 'Lukket',
    'Satin': 'Satin',
    'E-Stich (Applikation)': 'E-sting (applikation)',
    'Dichte / Abstand (mm)': 'Tæthed / afstand (mm)',
    'Zugkompensation (mm)': 'Trækkompensation (mm)',
    'Unterlage': 'Underlag',
    'keine': 'ingen',
    'Mittellauf': 'Midterløb',
    'Kantenlauf': 'Kantløb',
    'Zickzack': 'Zigzag',
    'Kante + Zickzack': 'Kant + zigzag',
    'Mitte + Zickzack': 'Midte + zigzag',
    'Auto-Split ab (mm, 0=aus)': 'Auto-opdeling fra (mm, 0 = fra)',
    'Kurzstiche in Bögen': 'Korte sting i buer',
    '3D-Puff (Schaum)': '3D-puff (skum)',
    'Füllart': 'Fyldtype',
    'Tatami': 'Tatami',
    'Satin (fester Winkel)': 'Satin (fast vinkel)',
    'Kontur (parallel zum Rand)': 'Kontur (parallelt med kanten)',
    'Spirale': 'Spiral',
    'Welle': 'Bølge',
    'Muster (Tatami)': 'Mønster (tatami)',
    'Verlauf (dicht → offen)': 'Gradient (tæt → åben)',
    'Knockdown (Gitter)': 'Knockdown (gitter)',
    'Muster': 'Mønster',
    'Rauten': 'Ruder',
    'Diagonal': 'Diagonal',
    'Ziegel': 'Mursten',
    'Wellen': 'Bølger',
    'Wellenhöhe (mm)': 'Bølgehøjde (mm)',
    'Wellenlänge (mm)': 'Bølgelængde (mm)',
    'Verlauf bis Abstand (mm)': 'Gradient til afstand (mm)',
    'Kreuzgröße (mm)': 'Korsstørrelse (mm)',
    'Kreuze doppelt': 'Dobbelte kors',
    'Stichwinkel (°)': 'Stingvinkel (°)',
    'Kante + Tatami': 'Kant + tatami',
    'Satin-Split ab (mm)': 'Satinopdeling fra (mm)',
    'Kontur': 'Kontur',
    'Satin-Konturbreite (mm)': 'Satinkonturens bredde (mm)',
    'Breite (mm)': 'Bredde (mm)',
    // Verbindung / Stopp
    'Verbindung davor': 'Forbindelse før',
    'Wie die Maschine vom vorigen Objekt zu diesem kommt': 'Hvordan maskinen kommer fra det forrige objekt til dette',
    'Automatisch': 'Automatisk',
    'Immer schneiden': 'Klip altid',
    'Springen ohne Schnitt': 'Spring uden klip',
    'Direkt als Stich': 'Direkte som sting',
    'Maschine stoppt davor': 'Maskinen stopper før',
    'Stopp (z. B. Applikationsstoff oder Puff-Schaum auflegen). In der DST ein Farbwechsel auf dieselbe Nadel.': 'Stop (f.eks. for at lægge applikationsstof eller puff-skum på). I DST-filen er det et farveskift til samme nål.',
    // Text-Gruppe
    'Text bearbeiten…': 'Rediger tekst…',
    'Buchstaben einzeln bearbeiten (Text ist danach nicht mehr änderbar)': 'Rediger bogstaverne enkeltvis (teksten kan derefter ikke længere ændres)',
    'Buchstaben anpassen…': 'Tilpas bogstaver…',
    'Einzelne Buchstaben verschieben, drehen, vergrößern; Abstände (Kerning)': 'Flyt, rotér, forstør enkelte bogstaver; afstande (kerning)',
    '– Schrift': '– Skrift',
    'Sticheigenschaften aller Buchstaben:': 'Stingegenskaber for alle bogstaver:',
    'Objekt auswählen oder Werkzeug wählen, um die Stich-Eigenschaften einzustellen.': 'Markér et objekt eller vælg et værktøj for at indstille stingegenskaberne.',
    'Vorgabe für neue Objekte': 'Standard for nye objekter',
    '– Vorgabe für neue Objekte': '– Standard for nye objekter',
    'In Satin A umwandeln (Breite frei formen)': 'Konvertér til Satin A (fri bredde)',
    'jeden Stich verschieben (Entf = löschen, Doppelklick = einfügen).': 'til at flytte hvert sting (Del = slet, dobbeltklik = indsæt).',
    'An Stoff anpassen (automatisch)': 'Tilpas til stoffet (automatisk)',
    'Dichte, Zugausgleich, Unterlage und Stichlänge werden aus Stoff und Säulenbreite berechnet.': 'Tæthed, trækkompensation, underlag og stinglængde beregnes ud fra stoffet og søjlebredden.',
    'Von Hand geänderte Werte wieder automatisch': 'Sæt manuelt ændrede værdier tilbage til automatisk',
    '· von Hand': '· manuel',
  });

  /* ---------- app.js: Hinweiszeile ---------- */
  const HINTS = {
    'Verschieben: mit gedrückter Maustaste ziehen, um die Ansicht zu verschieben. Esc = zurück zum Auswählen.': 'Panorér: træk med museknappen holdt nede for at flytte visningen. Esc = tilbage til Markér.',
    'Klicken = auswählen, ziehen = verschieben, Rahmen ziehen = mehrere wählen. Ansicht verschieben: Mausrad (Shift = seitlich), Leertaste + Ziehen oder mittlere Maustaste. Strg + Mausrad = Zoom.': 'Klik = markér, træk = flyt, træk en boks = markér flere. Panorér visningen: musehjul (Shift = sidelæns), mellemrum + træk eller midterste museknap. Ctrl + musehjul = zoom.',
    'Punkte ziehen. Leertaste = Ecke ↔ Kurve, Entf = Punkt löschen, Doppelklick auf Linie = Punkt einfügen. Oranger Griff = Stichwinkel.': 'Træk punkter. Mellemrum = hjørne ↔ kurve, Del = slet punkt, dobbeltklik på linjen = indsæt punkt. Orange håndtag = stingvinkel.',
    'Linksklick = Eckpunkt, Rechtsklick = Kurvenpunkt. Enter = fertig, Rücktaste = letzten Punkt löschen, Esc = abbrechen.': 'Venstreklik = hjørnepunkt, højreklik = kurvepunkt. Enter = færdig, Tilbage = slet sidste punkt, Esc = annuller.',
    'Linksklick = Eckpunkt, Rechtsklick = Kurvenpunkt. Enter = fertig.': 'Venstreklik = hjørnepunkt, højreklik = kurvepunkt. Enter = færdig.',
    'Mittellinie digitalisieren: Links = Ecke, Rechts = Kurve. Enter = fertig. Breite rechts bei Eigenschaften.': 'Digitalisér midterlinjen: venstre = hjørne, højre = kurve. Enter = færdig. Bredden indstilles til højre under Egenskaber.',
    'Abwechselnd linke und rechte Seite der Säule anklicken (Paare). Links = Ecke, Rechts = Kurve. Enter = fertig.': 'Klik skiftevis på søjlens venstre og højre side (par). Venstre = hjørne, højre = kurve. Enter = færdig.',
    'Erste Seite digitalisieren → Enter → zweite Seite → Enter. Links = Ecke, Rechts = Kurve.': 'Digitalisér første side → Enter → anden side → Enter. Venstre = hjørne, højre = kurve.',
    'Umriss: Links = Ecke, Rechts = Kurve, Enter schließt. Dann Löcher (Enter überspringt), dann Stichwinkel mit 2 Klicks (Enter = Vorgabe).': 'Omrids: venstre = hjørne, højre = kurve, Enter lukker. Derefter huller (Enter springer over), derefter stingvinkel med 2 klik (Enter = standard).',
    'Ziehen, um ein Rechteck zu erstellen.': 'Træk for at oprette et rektangel.',
    'Ziehen, um einen Kreis/eine Ellipse zu erstellen (Shift = Kreis).': 'Træk for at oprette en cirkel/ellipse (Shift = cirkel).',
    'Auf die Arbeitsfläche klicken, um Text einzufügen.': 'Klik på arbejdsfladen for at indsætte tekst.',
    'Messer: zwei Punkte klicken – die Linie teilt die ausgewählten Flächen (oder alle Flächen, die sie kreuzt).': 'Kniv: klik på to punkter – linjen deler de markerede fyld (eller alle fyld, den krydser).',
    'Jeder Linksklick = ein Stich, Rechtsklick = Sprung. Enter = fertig.': 'Hvert venstreklik = ét sting, højreklik = spring. Enter = færdig.',
    'Jetzt die ZWEITE Seite digitalisieren, Enter = fertig.': 'Digitalisér nu den ANDEN side, Enter = færdig.',
    'Loch digitalisieren (Enter schließt das Loch) – oder sofort Enter: keine (weiteren) Löcher.': 'Digitalisér et hul (Enter lukker hullet) – eller tryk straks Enter: ingen (flere) huller.',
    'Stichwinkel: zwei Punkte klicken – oder Enter für Vorgabewinkel.': 'Stingvinkel: klik på to punkter – eller Enter for standardvinklen.',
  };
  const TOUCH_DE = ' [Touch: Kurvenpunkt-Modus aktiv]', TOUCH_DA = ' [Touch: kurvepunkt-tilstand aktiv]';
  for (const [de, da] of Object.entries(HINTS)) { E.exact[de] = da; E.exact[de + TOUCH_DE] = da + TOUCH_DA; }
  // Satin A: dynamischer Hinweis (Punkt n, Seite, Paar, „Enter = fertig“, Touch)
  const colArx = [];
  for (const [sDe, sDa] of [['ORANGE Kante (Seite 2)', 'ORANGE kant (side 2)'], ['BLAUE Kante (Seite 1)', 'BLÅ kant (side 1)']]) {
    for (const pair of [false, true]) for (const enter of [false, true]) for (const touch of [false, true]) {
      const re = '^Satin A – Punkt (\\d+): jetzt auf die ' + esc(sDe) + ' klicken' + (pair ? ' · Paar (\\d+)' : '') +
        '\\. Immer abwechselnd Seite 1 / Seite 2, jedes Paar gibt Breite und Stichrichtung vor\\. Linksklick = Ecke, Rechtsklick = Kurve\\. ' +
        (enter ? 'Enter = fertig, ' : '') + 'Rücktaste = letzten Punkt zurück, Esc = abbrechen\\.' + (touch ? esc(TOUCH_DE) : '') + '$';
      const rep = 'Satin A – punkt $1: klik nu på den ' + sDa + (pair ? ' · par $2' : '') +
        '. Skift altid mellem side 1 / side 2; hvert par bestemmer bredde og stingretning. Venstreklik = hjørne, højreklik = kurve. ' +
        (enter ? 'Enter = færdig, ' : '') + 'Tilbage = fortryd sidste punkt, Esc = annuller.' + (touch ? TOUCH_DA : '');
      colArx.push([new RegExp(re), rep]);
    }
  }

  /* ---------- app.js: Dialoge (Satin A, Anordnen, Hilfslinien, Farbe) ---------- */
  Object.assign(E.exact, {
    'In Satin A umwandeln': 'Konvertér til Satin A',
    'Bitte zuerst eine oder mehrere': 'Markér først en eller flere',
    'Satinlinien (Satin C)': 'satinlinjer (Satin C)',
    'auswählen.': '.',
    'Umgewandelt: Jetzt mit Umformen die blauen und orangen Kantenpunkte einzeln ziehen, um die Breite zu verändern. Doppelklick fügt ein Punktpaar ein.': 'Konverteret: Brug nu Omform til at trække de blå og orange kantpunkter enkeltvis for at ændre bredden. Dobbeltklik indsætter et punktpar.',
    'Bitte zuerst Objekte auswählen.': 'Markér først objekter.',
    'Kopien anordnen (Kreis / Raster)': 'Arrangér kopier (cirkel / gitter)',
    'Art': 'Type',
    'Kreis': 'Cirkel',
    'Raster (Reihen × Spalten)': 'Gitter (rækker × kolonner)',
    'Anzahl insgesamt': 'Antal i alt',
    'Radius (mm)': 'Radius (mm)',
    'Mittelpunkt': 'Midtpunkt',
    'Rahmenmitte': 'Rammens midte',
    'unter der Auswahl (Radius)': 'under markeringen (radius)',
    'Kopien mitdrehen': 'Rotér kopierne med',
    'Spalten': 'Kolonner',
    'Reihen': 'Rækker',
    'Abstand waagrecht (mm)': 'Vandret afstand (mm)',
    'Abstand senkrecht (mm)': 'Lodret afstand (mm)',
    'Abbrechen': 'Annuller',
    'Hilfslinien & Einrasten': 'Hjælpelinjer & fastgørelse',
    'Rasterweite (mm)': 'Gitterafstand (mm)',
    'Neue Hilfslinie': 'Ny hjælpelinje',
    'senkrecht bei X': 'lodret ved X',
    'waagrecht bei Y': 'vandret ved Y',
    'Position (mm, 0 = Rahmenmitte)': 'Position (mm, 0 = rammens midte)',
    'Noch keine Hilfslinien.': 'Ingen hjælpelinjer endnu.',
    'Alle Hilfslinien löschen': 'Slet alle hjælpelinjer',
    'Übernehmen': 'Anvend',
    'Farbe': 'Farve',
    'Name / Garnnummer': 'Navn / trådnummer',
    'Nadel (1–15)': 'Nål (1–15)',
    'Garn aus Farbkarte wählen': 'Vælg tråd fra farvekort',
    'Garnmarke': 'Trådmærke',
    'Suchen (Nummer oder Name)': 'Søg (nummer eller navn)',
    'z. B. 1800 oder rot': 'f.eks. 1800 eller rød',
    'Bildschirmfarben sind Näherungen – maßgeblich ist die echte Farbkarte des Herstellers.': 'Skærmfarver er tilnærmelser – det er producentens rigtige farvekort, der gælder.',
    'Kein Garn gefunden.': 'Ingen tråd fundet.',
  });

  /* ---------- dynamische Texte ---------- */
  // Statuszeile: „ · Farben: 3 · Schnitte: 2[ · versteckte Wege: 1] · Größe: 12,5 × 3,0 mm · ca. 5 min[ · Sprünge ohne Schnitt: 2][ ·]“
  const statsRx = [];
  for (const trav of [false, true]) for (const flo of [false, true]) {
    const re = '^· Farben: (\\d+) · Schnitte: (\\d+)' + (trav ? ' · versteckte Wege: (\\d+)' : '') +
      ' · Größe: (.+?) × (.+?) mm · ca\\. (.+?) min' + (flo ? ' · Sprünge ohne Schnitt: (\\d+)' : '') + '( ·)?$';
    let n = 3;
    const tr = trav ? ' · skjulte forbindelser: $' + n++ : '';
    const w = '$' + n++, h = '$' + n++, m = '$' + n++;
    const fl = flo ? ' · spring uden klip: $' + n++ : '';
    const rep = '· Farver: $1 · Klip: $2' + tr + ' · Størrelse: ' + w + ' × ' + h + ' mm · ca. ' + m + ' min' + fl + '$' + n;
    statsRx.push([new RegExp(re), rep]);
  }

  E.rx.push(
    // Prüf-Knopf in der Statusleiste
    [/^⚠ Prüfung: 1 Fehler, 1 Hinweis$/, '⚠ Kontrol: 1 fejl, 1 advarsel'],
    [/^⚠ Prüfung: 1 Fehler, (\d+) Hinweise$/, '⚠ Kontrol: 1 fejl, $1 advarsler'],
    [/^⚠ Prüfung: (\d+) Fehler, 1 Hinweis$/, '⚠ Kontrol: $1 fejl, 1 advarsel'],
    [/^⚠ Prüfung: (\d+) Fehler, (\d+) Hinweise$/, '⚠ Kontrol: $1 fejl, $2 advarsler'],
    [/^⚠ Prüfung: 1 Hinweis$/, '⚠ Kontrol: 1 advarsel'],
    [/^⚠ Prüfung: (\d+) Hinweise$/, '⚠ Kontrol: $1 advarsler'],
    // Stickprüfung-Dialog
    [/^Maschine: (.+?)\. Grenzwerte unter Einstellungen → Maschine & Rahmen\.$/, 'Maskine: $1. Grænseværdier under Indstillinger → Maskine & ramme.'],
    // Rahmenbeschriftung (Canvas, falls über HW.i18n.t)
    [/^(.+) – Stickfeld (.+) mm$/, '$1 – broderifelt $2 mm'],
    // Stoff
    [/^([\d.,]+) Stiche\/min$/, '$1 sting/min'],
    [/^höchstens ([\d.,]+) Stiche\/min$/, 'højst $1 sting/min'],
    [/^([\d.,]+) Stiche\/cm²$/, '$1 sting/cm²'],
    [/^Mehr Lagen wegen: (.+)$/, 'Flere lag på grund af: $1'],
    [/^Stoff: (.+)$/, 'Stof: $1'],
    ...statsRx,
    // Farbfeld-Tooltip „1: Schwarz – Nadel 1“ (Standardfarben übersetzt, sonst Name behalten)
    ...COLORS.map(([de, da]) => [new RegExp('^(\\d+): ' + de + ' – Nadel (\\d+)$'), '$1: ' + da + ' – nål $2']),
    [/^(\d+): (.+) – Nadel (\d+)$/, '$1: $2 – nål $3'],
    // Eigenschaften
    [/^Text „([\s\S]*)“ \((.*), (\d+) Objekte\)$/, 'Tekst “$1” ($2, $3 objekter)'],
    [/^(\d+) Objekte ausgewählt \(verschiedene Arten\)\. Farbe per Klick in der Palette zuweisen\.$/, '$1 objekter markeret (forskellige typer). Klik på en farve i paletten for at tildele den.'],
    [/^(\d+) Einzelstiche\. Mit$/, '$1 enkeltsting. Brug'],
    // Dialoge
    [/^Vorhandene: (.+)$/, 'Eksisterende: $1'],
    [/^Farbe (\d+) bearbeiten$/, 'Rediger farve $1'],
    ...colArx,
    ...nameRx,
    [/^– (\d+) × (.+)$/, '– $1 × $2'],
  );
  // Stoff-Dialog: automatische Anpassung (Satin- und Tatami-Zeile)
  for (const [ulDe, ulDa] of [['leicht', 'let'], ['normal', 'normal'], ['kräftig', 'kraftig']]) {
    E.rx.push([new RegExp('^Satin-Abstand × ([\\d.,]+) \\(zusätzlich nach Säulenbreite: schmal lockerer, breit dichter\\) · Zugausgleich ([\\d.,-]+) mm \\+ ([\\d.,-]+) % der Breite · Satin-Split ab ([\\d.,]+) mm · Unterlage ' + ulDe + '$'),
      'Satinafstand × $1 (desuden efter søjlebredde: smal løsere, bred tættere) · trækkompensation $2 mm + $3 % af bredden · satinopdeling fra $4 mm · underlag ' + ulDa]);
  }
  for (const [ulDe, ulDa] of [['Kante\\+Tatami', 'kant+tatami'], ['Tatami', 'tatami'], ['Kante', 'kant'], ['none', 'ingen'], ['(.+)', '$4']]) {
    E.rx.push([new RegExp('^Tatami: Abstand ([\\d.,]+) mm, Stichlänge ([\\d.,]+) mm, Zugausgleich ([\\d.,-]+) mm, Unterlage ' + ulDe + '$'),
      'Tatami: afstand $1 mm, stinglængde $2 mm, trækkompensation $3 mm, underlag ' + ulDa]);
  }
})(typeof window !== 'undefined' ? window : globalThis);
