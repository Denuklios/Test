/* Dänische Übersetzungen (Teil C: Hilfe-Infos, Stickprüfung, Stoffe, Rahmen) */
(function (g) {
  const HW = (g.HW = g.HW || {});
  HW.I18N = HW.I18N || {}; HW.I18N.da = HW.I18N.da || { exact: {}, rx: [] };
  const E = HW.I18N.da;
  // Teiltexte rekursiv übersetzen (für zusammengesetzte Texte wie „⚠ Meldung“ oder „1 × Vlies (Gewicht)“)
  const T = (s) => (HW.i18n && HW.i18n.t ? HW.i18n.t(s) : s);

  /* =====================================================================
     Hilfe-Infos (help.js)
     ===================================================================== */
  Object.assign(E.exact, {
    /* ---------- Menüs ---------- */
    'Datei': "Filer",
    'Neues Design, Projekte öffnen und speichern, Grafiken und Stickdateien importieren, Stickdatei für die Maschine erzeugen, Arbeitsblatt, Mockup und Preis.':
      "Nyt design, åbn og gem projekter, importér grafik og broderifiler, opret broderifilen til maskinen, arbejdsark, mockup og pris.",
    'Bearbeiten': "Rediger",
    'Rückgängig, Kopieren, Drehen, Spiegeln, Größe ändern, Formen verrechnen, Applikation, Knockdown, Kappen-Sortierung und die Stickprüfung.':
      "Fortryd, kopiér, rotér, spejlvend, ændr størrelse, kombinér former, applikation, knockdown, kasketsortering og stingkontrollen.",
    'Anordnen': "Arrangér",
    'Objekte ausrichten und verteilen, gruppieren, im Kreis oder Raster vervielfältigen, Text auf eine Linie setzen, Monogramme.':
      "Justér og fordel objekter, gruppér, gentag dem i en cirkel eller et gitter, sæt tekst på en linje, monogrammer.",
    'Bild': "Billede",
    'Ein Foto oder Logo als Vorlage einfügen, zum Nachzeichnen oder für das automatische Digitalisieren.':
      "Indsæt et foto eller logo som skabelon – til optegning i hånden eller til automatisk digitalisering.",
    'Ansicht': "Vis",
    'Wie das Design angezeigt wird: Fadenansicht, Sprünge, Raster, Einrasten, Zoom.':
      "Hvordan designet vises: trådvisning, spring, gitter, fastgøring, zoom.",
    'Einstellungen': "Indstillinger",
    'Maschine, Schnitte und Sprünge, Stickrahmen, Hilfe und diese Info-Kästchen ein- und ausschalten.':
      "Maskine, klip og spring, broderirammer, hjælp og slå disse infobokse til og fra.",

    /* ---------- Befehle ---------- */
    'Neu': "Ny",
    'Fängt ein leeres Design an. Das aktuelle Design wird verworfen – vorher speichern, wenn du es noch brauchst.':
      "Starter et tomt design. Det aktuelle design kasseres – gem det først, hvis du stadig skal bruge det.",
    'Projekt öffnen': "Åbn projekt",
    'Lädt ein gespeichertes StickStudio-Projekt (.stick.json) mit allen Objekten, Farben und Einstellungen – voll bearbeitbar.':
      "Indlæser et gemt StickStudio-projekt (.stick.json) med alle objekter, farver og indstillinger – fuldt redigerbart.",
    'Projekt speichern': "Gem projekt",
    'Speichert das Design als bearbeitbare Projektdatei. Die Maschine braucht dagegen eine Stickdatei (siehe „Stickdatei exportieren“).':
      "Gemmer designet som en redigerbar projektfil. Maskinen har derimod brug for en broderifil (se »Eksportér broderifil«).",
    'Design-Bibliothek': "Designbibliotek",
    'Alle in der Bibliothek abgelegten Designs mit Vorschaubild. Suchen nach Name, Kunde oder Stichwort und mit einem Klick öffnen.':
      "Alle designs i biblioteket med miniaturebillede. Søg efter navn, kunde eller nøgleord, og åbn med ét klik.",
    'In Bibliothek speichern': "Gem i bibliotek",
    'Legt das aktuelle Design mit Vorschaubild, Stichworten und Kunde in der Bibliothek ab (im Browser dieses Computers).':
      "Gemmer det aktuelle design i biblioteket med miniaturebillede, nøgleord og kunde (i denne computers browser).",
    'Vektorgrafik importieren': "Importér vektorgrafik",
    'Lädt ein Logo als SVG, PDF oder AI und wandelt die Formen automatisch in Stickobjekte um. Beste Qualität für Logos.':
      "Indlæser et logo som SVG, PDF eller AI og omdanner automatisk formerne til broderiobjekter. Bedste kvalitet til logoer.",
    'Stickdatei importieren': "Importér broderifil",
    'Öffnet eine fertige Stickdatei (DST, PES, JEF, EXP). Die Stiche lassen sich ansehen, verschieben und einzeln bearbeiten.':
      "Åbner en færdig broderifil (DST, PES, JEF, EXP). Du kan se stingene, flytte dem og redigere dem enkeltvis.",
    'Stickdatei exportieren': "Eksportér broderifil",
    'Erzeugt die Datei für die Stickmaschine. Für die Texi 1501 „DST“ wählen, auf einen USB-Stick kopieren und an der Maschine laden.':
      "Opretter filen til broderimaskinen. Til Texi 1501 vælger du »DST«, kopierer filen til et USB-stik og indlæser den på maskinen.",
    'Teamnamen': "Holdnavne",
    'Ein Design, viele Namen: Text als Platzhalter, Namensliste eingeben – je Name entsteht eine eigene Stickdatei (alles in einer ZIP).':
      "Ét design, mange navne: brug en tekst som pladsholder og indtast en navneliste – hvert navn får sin egen broderifil (alle samlet i én ZIP).",
    'Mehrere Einspannungen': "Flere opspændinger",
    'Für Motive, die größer als der Rahmen sind: teilt das Design in mehrere Dateien mit Passkreuzen zum genauen Ausrichten.':
      "Til motiver, der er større end rammen: deler designet op i flere filer med pasmærker til præcis justering.",
    'Arbeitsblatt drucken': "Udskriv arbejdsark",
    'Druckt ein Blatt für die Maschine: Vorschau, Farbfolge mit Nadelnummern, Stichzahl, Größe, Vlies-Empfehlung und Stopps.':
      "Udskriver et ark til maskinen: forhåndsvisning, farverækkefølge med nålenumre, stingantal, størrelse, anbefalet vlies og stop.",
    'Produkt-Vorschau': "Produktvisning",
    'Zeigt das Design maßstabsgetreu auf T-Shirt, Polo, Hoodie, Kappe, Handtuch oder Tasche – gut, um es dem Kunden zu zeigen.':
      "Viser designet i korrekt målestok på T-shirt, polo, hættetrøje, kasket, håndklæde eller taske – godt til at vise kunden.",
    'Preiskalkulation': "Prisberegning",
    'Berechnet den Stückpreis nach Stichzahl oder Maschinenzeit mit Mengenrabatten und druckt ein Angebot.':
      "Beregner stykprisen ud fra stingantal eller maskintid med mængderabatter og udskriver et tilbud.",
    'Rückgängig (Strg+Z)': "Fortryd (Ctrl+Z)",
    'Macht den letzten Schritt rückgängig. Mehrfach drücken geht weiter zurück.':
      "Fortryder det seneste trin. Tryk flere gange for at gå længere tilbage.",
    'Wiederholen (Strg+Y)': "Gentag (Ctrl+Y)",
    'Stellt einen rückgängig gemachten Schritt wieder her.': "Gendanner et trin, der er blevet fortrudt.",
    'Duplizieren (Strg+D)': "Duplikér (Ctrl+D)",
    'Kopiert die ausgewählten Objekte. Die Kopie liegt leicht versetzt daneben.':
      "Kopierer de markerede objekter. Kopien placeres en smule forskudt ved siden af.",
    'Löschen (Entf)': "Slet (Del)",
    'Entfernt die ausgewählten Objekte aus dem Design.': "Fjerner de markerede objekter fra designet.",
    'Alles auswählen (Strg+A)': "Markér alt (Ctrl+A)",
    'Wählt alle Objekte aus, z. B. um das ganze Design zu verschieben oder zu skalieren.':
      "Markerer alle objekter, f.eks. for at flytte eller skalere hele designet.",
    'Horizontal spiegeln': "Spejlvend vandret",
    'Spiegelt die Auswahl links ↔ rechts. Stichwinkel werden mitgespiegelt.':
      "Spejlvender markeringen venstre ↔ højre. Stingvinklerne spejlvendes med.",
    'Vertikal spiegeln': "Spejlvend lodret",
    'Spiegelt die Auswahl oben ↔ unten.': "Spejlvender markeringen top ↔ bund.",
    'Drehen': "Rotér",
    'Dreht die Auswahl um einen frei wählbaren Winkel. Die Stiche werden neu berechnet.':
      "Roterer markeringen med en valgfri vinkel. Stingene beregnes igen.",
    'Skalieren': "Skalér",
    'Ändert die Größe in Prozent. Die Stiche werden neu berechnet, die Dichte bleibt richtig (nicht einfach „aufgeblasen“).':
      "Ændrer størrelsen i procent. Stingene beregnes igen, så tætheden forbliver korrekt (ikke bare »pustet op«).",
    'In Rahmenmitte setzen': "Centrér i rammen",
    'Schiebt die Auswahl (oder das ganze Design) genau in die Mitte des Stickrahmens.':
      "Flytter markeringen (eller hele designet) præcis ind midt i broderirammen.",
    'An Rahmen anpassen': "Tilpas til rammen",
    'Vergrößert oder verkleinert das Design (oder die Auswahl) so, dass es genau ins Stickfeld passt. Stiche werden neu berechnet.':
      "Forstørrer eller formindsker designet (eller markeringen), så det passer præcis ind i broderifeltet. Stingene beregnes igen.",
    'Kopien anordnen': "Arrangér kopier",
    'Vervielfältigt die Auswahl im Kreis (z. B. Blütenblätter, Sterne rundherum) oder als Raster in Reihen und Spalten.':
      "Gentager markeringen i en cirkel (f.eks. kronblade, stjerner hele vejen rundt) eller som gitter i rækker og kolonner.",
    'Überlappungen entfernen': "Fjern overlap",
    'Schneidet verdeckte Teile unter oberen Objekten heraus. Spart Stiche und verhindert harte, dicke Stellen.':
      "Skærer skjulte dele under de øverste objekter væk. Sparer sting og forhindrer hårde, tykke steder.",
    'Formen vereinen': "Forén former",
    'Verschmilzt die ausgewählten Flächen zu einer einzigen Form.': "Smelter de markerede flader sammen til én form.",
    'Untere Form ausschneiden': "Skær ud af nederste form",
    'Zieht die oberen ausgewählten Formen von der untersten ab – wie mit einer Ausstechform.':
      "Trækker de øverste markerede former fra den nederste – som med en udstikker.",
    'Schnittmenge': "Fællesmængde",
    'Behält nur den Bereich, in dem sich alle ausgewählten Formen überlappen.':
      "Beholder kun det område, hvor alle markerede former overlapper.",
    'Applikation aus Form': "Applikation fra form",
    'Macht aus einer Form eine Applikation: Platzierungslinie, Stopp, Heftstich, Stopp, Satin-Abdeckung. Spart viele Stiche bei großen Flächen.':
      "Gør en form til en applikation: placeringslinje, stop, fastgøringssting, stop, satindækning. Sparer mange sting på store flader.",
    'Knockdown-Stich': "Knockdown-sting",
    'Legt ein lockeres Gitter unter das Motiv, das Flor oder Schlaufen (Frottee, Fleece, Strick) flachdrückt, damit Details nicht versinken.':
      "Lægger et løst gitter under motivet, som trykker luv eller løkker (frotté, fleece, strik) flade, så detaljerne ikke synker ned.",
    'Für Kappe sortieren': "Sortér til kasket",
    'Sortiert für Kappen: von der Mitte nach außen und von unten nach oben. Verhindert Verzug und Falten auf der Kappe.':
      "Sorterer til kasketter: fra midten og udad og nedefra og op. Forhindrer forskydning og rynker på kasketten.",
    'In Einzelstiche umwandeln': "Konvertér til enkeltsting",
    'Macht aus dem Objekt einzelne Stiche, die man frei verschieben kann. Danach lassen sich Dichte usw. nicht mehr automatisch ändern.':
      "Gør objektet til enkelte sting, som du kan flytte frit. Derefter kan tæthed osv. ikke længere ændres automatisk.",
    'Nach Farbe sortieren': "Sortér efter farve",
    'Ordnet die Objekte nach Farben, damit die Maschine seltener die Farbe wechseln muss.':
      "Ordner objekterne efter farve, så maskinen skal skifte farve sjældnere.",
    'Reihenfolge optimieren': "Optimér rækkefølge",
    'Sortiert die Objekte jeder Farbe so, dass die Wege dazwischen möglichst kurz sind – weniger Sprünge und Schnitte.':
      "Sorterer objekterne inden for hver farve, så vejene imellem dem bliver så korte som muligt – færre spring og klip.",
    'Stickprüfung': "Stingkontrol",
    'Prüft das Design auf Probleme wie zu dicht, zu schmal, zu lange Stiche oder schlechte Winkel und schlägt Korrekturen vor.':
      "Kontrollerer designet for problemer som for tæt, for smalt, for lange sting eller dårlige vinkler og foreslår rettelser.",
    'Links ausrichten': "Venstrejustér",
    'Ein Objekt: an den linken Rand des Stickfelds. Mehrere: alle an die linke Kante der Auswahl.':
      "Ét objekt: til venstre kant af broderifeltet. Flere: alle til venstre kant af markeringen.",
    'Waagrecht mittig': "Centrér vandret",
    'Richtet die Objekte auf eine gemeinsame senkrechte Mittellinie aus (ein Objekt: Rahmenmitte).':
      "Justerer objekterne efter en fælles lodret midterlinje (ét objekt: rammens midte).",
    'Rechts ausrichten': "Højrejustér",
    'Ein Objekt: an den rechten Rand des Stickfelds. Mehrere: an die rechte Kante der Auswahl.':
      "Ét objekt: til højre kant af broderifeltet. Flere: til højre kant af markeringen.",
    'Oben ausrichten': "Justér øverst",
    'Richtet die Oberkanten aneinander aus (ein Objekt: oberer Rand des Stickfelds).':
      "Justerer overkanterne efter hinanden (ét objekt: broderifeltets øverste kant).",
    'Senkrecht mittig': "Centrér lodret",
    'Richtet die Objekte auf eine gemeinsame waagrechte Mittellinie aus.':
      "Justerer objekterne efter en fælles vandret midterlinje.",
    'Unten ausrichten': "Justér nederst",
    'Richtet die Unterkanten aneinander aus (ein Objekt: unterer Rand des Stickfelds).':
      "Justerer underkanterne efter hinanden (ét objekt: broderifeltets nederste kant).",
    'Waagrecht verteilen': "Fordel vandret",
    'Verteilt mindestens drei Objekte so, dass die Abstände zwischen ihnen links-rechts gleich groß sind.':
      "Fordeler mindst tre objekter, så afstandene mellem dem fra venstre mod højre er lige store.",
    'Senkrecht verteilen': "Fordel lodret",
    'Verteilt mindestens drei Objekte mit gleichen Abständen oben-unten.':
      "Fordeler mindst tre objekter med lige store afstande fra top til bund.",
    'Gruppieren (Strg+G)': "Gruppér (Ctrl+G)",
    'Fasst die Auswahl zusammen: ein Klick wählt danach alle Teile, sie bewegen sich gemeinsam.':
      "Samler markeringen: derefter markerer ét klik alle dele, og de flytter sig sammen.",
    'Gruppierung lösen': "Opløs gruppe",
    'Teile einer Gruppe wieder einzeln bearbeiten. Bei Text ist er danach nicht mehr als Text änderbar.':
      "Redigér delene i en gruppe enkeltvis igen. En tekst kan derefter ikke længere redigeres som tekst.",
    'Text auf Linie setzen': "Sæt tekst på linje",
    'Legt einen Text entlang einer gezeichneten Linie, z. B. einen Bogen oder Kreis. Text und Linie zusammen auswählen.':
      "Lægger en tekst langs en tegnet linje, f.eks. en bue eller cirkel. Markér tekst og linje sammen.",
    'Monogramm': "Monogram",
    'Erstellt Initialen aus Vorlagen: Mitte groß, im Kreis, in einer Raute oder mit Linien.':
      "Opretter initialer ud fra skabeloner: stort midterbogstav, i en cirkel, i en rombe eller med linjer.",
    'Bild einfügen': "Indsæt billede",
    'Lädt ein Foto oder Logo (JPG, PNG) als Vorlage in den Hintergrund – zum Nachzeichnen oder automatischen Digitalisieren.':
      "Indlæser et foto eller logo (JPG, PNG) som skabelon i baggrunden – til optegning i hånden eller automatisk digitalisering.",
    'Bild-Einstellungen': "Billedindstillinger",
    'Größe, Position und Deckkraft des Vorlagenbildes ändern.': "Ændr skabelonbilledets størrelse, position og dækkevne.",
    'Bild ein/aus': "Billede til/fra",
    'Blendet das Vorlagenbild aus oder wieder ein. Es wird nie mitgestickt.':
      "Skjuler eller viser skabelonbilledet igen. Det broderes aldrig med.",
    'Bild entfernen': "Fjern billede",
    'Löscht das Vorlagenbild aus dem Hintergrund.': "Sletter skabelonbilledet fra baggrunden.",
    'Auto-Digitalisieren': "Autodigitalisér",
    'Wandelt das Vorlagenbild automatisch in Stickobjekte um (Satin für schmale Teile, Tatami für Flächen). Danach alles nachbearbeitbar.':
      "Omdanner automatisk skabelonbilledet til broderiobjekter (satin til smalle dele, tatami til flader). Alt kan redigeres bagefter.",
    'TrueView / Fadenansicht (T)': "TrueView / trådvisning (T)",
    'Zeigt die Stiche wie echter Faden mit Glanz – oder als dünne Linien, um Einstiche genau zu sehen.':
      "Viser stingene som ægte tråd med glans – eller som tynde linjer, så du kan se hvert nålestik præcist.",
    'Sprünge anzeigen (J)': "Vis spring (J)",
    'Zeigt die Wege, auf denen die Maschine ohne zu sticken springt, als gestrichelte Linien.':
      "Viser de veje, hvor maskinen springer uden at brodere, som stiplede linjer.",
    'Raster': "Gitter",
    'Blendet das Millimeter-Raster ein oder aus.': "Viser eller skjuler millimetergitteret.",
    'Einrasten (G)': "Fastgør (G)",
    'Punkte und verschobene Objekte springen an Raster und Hilfslinien – für exakt gerade und gleich große Formen.':
      "Punkter og flyttede objekter fastgøres til gitter og hjælpelinjer – til helt lige og lige store former.",
    'Hilfslinien & Rasterweite': "Hjælpelinjer og gitterafstand",
    'Eigene waagrechte oder senkrechte Hilfslinien setzen und die Rasterweite für das Einrasten ändern.':
      "Sæt dine egne vandrette eller lodrette hjælpelinjer, og ændr gitterafstanden for fastgøring.",
    'Einstichpunkte': "Nålestik",
    'Zeigt jeden einzelnen Nadeleinstich als Punkt – hilfreich, um zu dichte Stellen zu erkennen.':
      "Viser hvert enkelt nålestik som et punkt – nyttigt til at finde steder, der er for tætte.",
    'Mausrad zoomt': "Musehjulet zoomer",
    'Aus (Standard): Mausrad = hoch/runter, Shift + Rad = links/rechts, Strg + Rad = Zoom. An: Mausrad zoomt wie früher. Verschieben geht immer auch mit Leertaste + Ziehen.':
      "Fra (standard): musehjul = op/ned, Shift + hjul = venstre/højre, Ctrl + hjul = zoom. Til: musehjulet zoomer som tidligere. Du kan altid også panorere med mellemrumstasten + træk.",
    'Bildlaufleiste': "Rullepanel",
    'Zeigt, welcher Teil des Designs gerade sichtbar ist. Den Balken ziehen oder neben ihn klicken, um die Ansicht zu verschieben.':
      "Viser, hvilken del af designet der er synlig lige nu. Træk i bjælken eller klik ved siden af den for at flytte visningen.",
    'Alles zeigen (0)': "Vis alt (0)",
    'Zoomt so, dass das ganze Design sichtbar ist. Verschieben: Mausrad (hoch/runter), Shift + Mausrad (links/rechts), Leertaste + Ziehen oder Pfeiltasten.':
      "Zoomer, så hele designet er synligt. Panorér: musehjul (op/ned), Shift + musehjul (venstre/højre), mellemrumstasten + træk eller piletasterne.",
    'Rahmen zeigen': "Vis ramme",
    'Zoomt so, dass der ganze Stickrahmen sichtbar ist.': "Zoomer, så hele broderirammen er synlig.",
    'Maschine, Schnitte & Sprünge': "Maskine, klip og spring",
    'Maschinentyp, Geschwindigkeit, ab wann geschnitten statt gesprungen wird, versteckte Laufwege und Prüf-Grenzwerte.':
      "Maskintype, hastighed, hvornår der klippes i stedet for at springe, skjulte løbeveje og grænseværdier for kontrollen.",
    'Stickrahmen': "Broderirammer",
    'Rahmen auswählen oder eigene Rahmen (eckig, rund, oval) anlegen. Das Stickfeld wird auf der Arbeitsfläche angezeigt.':
      "Vælg en ramme, eller opret dine egne rammer (firkantede, runde, ovale). Broderifeltet vises på arbejdsfladen.",
    'Hilfe / Tastatur': "Hjælp / tastatur",
    'Übersicht über Maus- und Tastaturbefehle.': "Oversigt over mus- og tastaturkommandoer.",
    'Hilfe-Infos beim Überfahren': "Hjælpetekster ved mouseover",
    'Schaltet diese Info-Kästchen ein oder aus. Die Einstellung wird gemerkt.':
      "Slår disse infobokse til eller fra. Indstillingen huskes.",
    '+ Farbe': "+ Farve",
    'Fügt der Palette eine neue Garnfarbe hinzu.': "Tilføjer en ny trådfarve til paletten.",
    'Farbe bearbeiten': "Rediger farve",
    'Ändert die aktive Farbe: Garn aus einer Farbkarte (Madeira, Isacord …) wählen, Name und Nadelnummer festlegen.':
      "Ændrer den aktive farve: vælg en tråd fra et farvekort (Madeira, Isacord …), angiv navn og nålenummer.",
    'Farbe entfernen': "Fjern farve",
    'Löscht die aktive Farbe aus der Palette (nur wenn kein Objekt sie benutzt).':
      "Sletter den aktive farve fra paletten (kun hvis intet objekt bruger den).",
    'Garnmarke zuordnen': "Tildel trådmærke",
    'Ordnet allen Farben das passendste echte Garn einer Marke zu (z. B. Madeira Polyneon) – mit Nummern für die Bestellung.':
      "Tildeler alle farver den mest lignende ægte tråd fra et mærke (f.eks. Madeira Polyneon) – med numre til bestilling.",
    'Nach oben': "Flyt op",
    'Die Auswahl wird früher gestickt (eine Stelle nach oben in der Reihenfolge).':
      "Markeringen broderes tidligere (én plads op i rækkefølgen).",
    'Nach unten': "Flyt ned",
    'Die Auswahl wird später gestickt (eine Stelle nach unten).': "Markeringen broderes senere (én plads ned).",
    'Ganz nach oben': "Flyt øverst",
    'Die Auswahl wird als Erstes gestickt (liegt dann ganz unten auf dem Stoff).':
      "Markeringen broderes først (og ligger så nederst på stoffet).",
    'Ganz nach unten': "Flyt nederst",
    'Die Auswahl wird zuletzt gestickt (liegt dann obenauf).': "Markeringen broderes sidst (og ligger så øverst).",

    /* ---------- Werkzeuge ---------- */
    'Auswählen (Esc)': "Markér (Esc)",
    'Objekte anklicken, verschieben, mit Shift mehrere wählen oder einen Rahmen um mehrere ziehen. Doppelklick auf Text = Text bearbeiten.':
      "Klik på objekter, flyt dem, markér flere med Shift, eller træk en ramme rundt om flere. Dobbeltklik på tekst = rediger tekst.",
    'Verschieben (Hand, Taste H)': "Panorér (hånd, tast H)",
    'Ansicht mit gedrückter Maustaste in jede Richtung schieben. Geht auch jederzeit: Leertaste gedrückt halten und Maus bewegen, Mausrad (hoch/runter), Shift + Mausrad (links/rechts).':
      "Træk visningen i alle retninger med museknappen holdt nede. Virker også når som helst: hold mellemrumstasten nede og bevæg musen, musehjul (op/ned), Shift + musehjul (venstre/højre).",
    'Umformen (R)': "Omform (R)",
    'Einzelne Punkte eines Objekts verschieben, einfügen (Doppelklick) oder löschen (Entf). Leertaste wechselt Ecke ↔ Kurve.':
      "Flyt enkelte punkter i et objekt, indsæt dem (dobbeltklik) eller slet dem (Del). Mellemrumstasten skifter hjørne ↔ kurve.",
    'Laufstich': "Løbesting",
    'Eine einfache Stichlinie, z. B. für Umrisse oder feine Details. Linksklick = Ecke, Rechtsklick = Kurve, Enter = fertig.':
      "En enkel stinglinje, f.eks. til konturer eller fine detaljer. Venstreklik = hjørne, højreklik = kurve, Enter = færdig.",
    'Dreifachstich': "Tredobbelt sting",
    'Wie Laufstich, aber jeder Stich wird dreimal gestickt – kräftigere, gut sichtbare Linie.':
      "Som løbesting, men hvert sting broderes tre gange – en kraftigere, tydeligt synlig linje.",
    'Satin C – Linie mit fester Breite': "Satin C – linje med fast bredde",
    'Eine Satinraupe mit fester Breite entlang einer Linie – ideal für Ränder und Schriftzüge. Mitte zeichnen, Breite rechts einstellen.':
      "En satinsøjle med fast bredde langs en linje – ideel til kanter og skrift. Tegn midterlinjen, og indstil bredden til højre.",
    'Satin A – Breite frei': "Satin A – fri bredde",
    'Für Satin mit wechselnder Dicke: Kanten immer abwechselnd anklicken – blaue Seite, orange Seite, blau, orange … Jedes Paar legt Breite und Stichrichtung fest. Linksklick = Ecke, Rechtsklick = Kurve, Enter = fertig.':
      "Til satin med skiftende tykkelse: klik skiftevis på kanterne – blå side, orange side, blå, orange … Hvert par bestemmer bredde og stingretning. Venstreklik = hjørne, højreklik = kurve, Enter = færdig.",
    'Satin B – zwei Kanten nacheinander': "Satin B – to kanter efter hinanden",
    'Erst die eine Kante komplett zeichnen, Enter, dann die andere Kante. Die Stichrichtung dreht automatisch mit. Linksklick = Ecke, Rechtsklick = Kurve.':
      "Tegn først den ene kant helt, tryk Enter, og tegn så den anden kant. Stingretningen drejer automatisk med. Venstreklik = hjørne, højreklik = kurve.",
    'In Satin A umwandeln': "Konvertér til Satin A",
    'Macht aus einer Satinlinie mit fester Breite (Satin C) eine Säule mit zwei einzelnen Kanten. Danach mit „Umformen“ die Kantenpunkte ziehen, um die Breite stellenweise zu ändern.':
      "Gør en satinlinje med fast bredde (Satin C) til en søjle med to separate kanter. Brug derefter »Omform« til at trække i kantpunkterne og ændre bredden enkelte steder.",
    'Fläche (Tatami)': "Flade (tatami)",
    'Füllt eine geschlossene Form mit Reihen-Stichen. Umriss zeichnen, Enter, optional Löcher, dann den Stichwinkel.':
      "Fylder en lukket form med rækker af sting. Tegn omridset, tryk Enter, tilføj eventuelt huller og derefter stingvinklen.",
    'Rechteck': "Rektangel",
    'Ein Rechteck als gefüllte Fläche aufziehen.': "Træk et rektangel op som udfyldt flade.",
    'Kreis / Ellipse': "Cirkel / ellipse",
    'Eine Ellipse als gefüllte Fläche aufziehen. Mit gedrückter Shift-Taste wird es ein Kreis.':
      "Træk en ellipse op som udfyldt flade. Hold Shift nede for at få en cirkel.",
    'Text': "Tekst",
    'Klick auf die Arbeitsfläche setzt einen Text. Fertige Stickschriften oder normale Schriften, die automatisch umgewandelt werden.':
      "Klik på arbejdsfladen for at placere en tekst. Brug færdige broderiskrifttyper eller almindelige skrifttyper, der omdannes automatisk.",
    'Messer': "Kniv",
    'Teilt Flächen entlang einer Linie in zwei Teile – z. B. damit große Flächen in den Rahmen passen oder anders gestickt werden.':
      "Deler flader i to dele langs en linje – f.eks. så store flader passer i rammen eller kan broderes anderledes.",
    'Manuelle Stiche': "Manuelle sting",
    'Jeder Klick setzt genau einen Stich, Rechtsklick einen Sprung. Für ganz feine Handarbeit.':
      "Hvert klik sætter præcis ét sting, højreklik et spring. Til helt fint håndarbejde.",
    'Kurve (für Touch)': "Kurve (til touch)",
    'Auf Tablets ohne rechte Maustaste: eingeschaltet setzt jedes Tippen einen Kurvenpunkt statt einer Ecke.':
      "På tablets uden højre museknap: når den er slået til, sætter hvert tryk et kurvepunkt i stedet for et hjørne.",

    /* ---------- Feste Elemente ---------- */
    'Stickrahmen wählen': "Vælg broderiramme",
    'Welcher Rahmen benutzt wird. Das Stickfeld wird angezeigt und das Programm warnt, wenn das Design nicht hineinpasst.':
      "Hvilken ramme der bruges. Broderifeltet vises, og programmet advarer, hvis designet ikke kan være i det.",
    'Rahmen verwalten': "Administrer rammer",
    'Eigene Rahmen anlegen (eckig, rund, oval), passende Rahmen finden und das Design einpassen.':
      "Opret dine egne rammer (firkantede, runde, ovale), find passende rammer, og tilpas designet til dem.",
    'Stoff': "Stof",
    'Auf welchen Stoff gestickt wird. Dichte, Stichlänge, Zugausgleich und Unterlage passen sich automatisch an; dazu gibt es eine Vlies-Empfehlung.':
      "Det stof, der broderes på. Tæthed, stinglængde, trækkompensation og understing tilpasses automatisk, og du får en anbefaling af vlies.",
    'Details & Tipps': "Detaljer og tips",
    'Genaue Empfehlung für diesen Stoff: Vlies, Topper, Nadel, Geschwindigkeit und welche Werte automatisch angepasst werden.':
      "Præcis anbefaling til dette stof: vlies, topper, nål, hastighed og hvilke værdier der tilpasses automatisk.",
    'Für flauschige Stoffe: ein lockeres Gitter drückt den Flor flach, damit feine Schrift nicht versinkt.':
      "Til luvede stoffer: et løst gitter trykker luven flad, så fin skrift ikke synker ned.",
    'Sticksimulation': "Broderisimulering",
    'Spielt ab, in welcher Reihenfolge die Maschine stickt. Ist etwas ausgewählt, läuft nur die Auswahl (der Rest blass) – sonst das ganze Design.':
      "Afspiller den rækkefølge, maskinen broderer i. Er noget markeret, afspilles kun markeringen (resten er nedtonet) – ellers hele designet.",
    'Stickfortschritt': "Broderiforløb",
    'Ziehen zeigt das Design bis zu einem bestimmten Stich – praktisch, um die Reihenfolge Schritt für Schritt zu prüfen.':
      "Træk for at vise designet op til et bestemt sting – praktisk til at kontrollere rækkefølgen trin for trin.",
    'Geschwindigkeit der Simulation': "Simuleringens hastighed",
    'Wie schnell die Simulation abläuft. Hat keinen Einfluss auf die Maschine.':
      "Hvor hurtigt simuleringen afspilles. Har ingen indflydelse på maskinen.",
    'Grün = alles in Ordnung. Gelb/Rot = Hinweise zu Dichte, Winkeln, Stichlängen. Klicken zeigt Details und Korrekturen.':
      "Grøn = alt i orden. Gul/rød = bemærkninger om tæthed, vinkler, stinglængder. Klik for at se detaljer og rettelser.",
    'Hilfe-Infos ein/aus': "Hjælpetekster til/fra",
    'Farbpalette': "Farvepalet",
    'Klick auf eine Farbe = aktive Farbe für neue Objekte; ist etwas ausgewählt, bekommt es diese Farbe. Die Zahl ist die Nadelnummer.':
      "Klik på en farve = aktiv farve til nye objekter; er noget markeret, får det denne farve. Tallet er nålenummeret.",
    'Stickreihenfolge': "Broderirækkefølge",
    'Alle Objekte in der Reihenfolge, in der gestickt wird (oben zuerst). Klick wählt aus, das Auge blendet aus.':
      "Alle objekter i den rækkefølge, de broderes i (øverst først). Klik for at markere, øjet skjuler objektet.",
    'Design-Daten': "Designdata",
    'Konto': "Konto",
    'Dein Konto: Lizenz und Laufzeit, Passwort ändern, Rechtstexte und Abmelden.': "Din konto: licens og løbetid, skift adgangskode, juridiske tekster og log ud.",
    'Stichzahl, Farben, Schnitte, Größe und ungefähre Stickzeit. Rot: Design ragt über das Stickfeld.':
      "Stingantal, farver, klip, størrelse og omtrentlig broderitid. Rød: designet rager ud over broderifeltet.",

    /* ---------- Eigenschaften ---------- */
    'Stichart': "Stingtype",
    'Laufstich = einfache Linie. Dreifachstich = jeder Stich dreimal (kräftiger). Bohnenstich = hin-zurück-hin, wirkt wie gezeichnet.':
      "Løbesting = enkel linje. Tredobbelt sting = hvert sting tre gange (kraftigere). Bønnesting = frem-tilbage-frem, ser håndtegnet ud.",
    'Stichlänge': "Stinglængde",
    'Länge der einzelnen Stiche. Kürzer folgt Kurven genauer, länger wirkt ruhiger. Üblich: 2–3 mm, für feine Kurven 1,5 mm.':
      "Længden af de enkelte sting. Kortere følger kurver mere præcist, længere virker roligere. Typisk: 2–3 mm, til fine kurver 1,5 mm.",
    'Geschlossen': "Lukket",
    'Verbindet das Ende wieder mit dem Anfang – für Umrisse um eine Form herum.':
      "Forbinder slutningen med starten igen – til konturer rundt om en form.",
    'Satin = dicht nebeneinander, glänzend. E-Stich = Kante mit kurzen Querstichen, typisch zum Einfassen von Applikationen.':
      "Satin = tæt side om side, skinnende. E-sting = kant med korte tværsting, typisk til at kante applikationer.",
    'Dichte (Abstand)': "Tæthed (afstand)",
    'Abstand zwischen den Satin-Stichen. Kleiner = dichter und deckender, aber härter. Üblich: 0,35–0,45 mm.':
      "Afstand mellem satinstingene. Mindre = tættere og bedre dækning, men stivere. Typisk: 0,35–0,45 mm.",
    'Zugkompensation': "Trækkompensation",
    'Der Faden zieht den Stoff zusammen, Satin wird schmaler als gezeichnet. Dieser Wert macht die Säule etwas breiter. Üblich: 0,1–0,3 mm.':
      "Tråden trækker stoffet sammen, så satin bliver smallere end tegnet. Denne værdi gør søjlen lidt bredere. Typisk: 0,1–0,3 mm.",
    'Unterlage': "Understing",
    'Stiche unter dem Satin, die den Stoff festhalten und den Satin anheben. Schmal: Mittellauf. Breit: Kante + Zickzack.':
      "Sting under satinen, der holder stoffet fast og løfter satinen. Smal: midterløb. Bred: kant + zigzag.",
    'Auto-Split': "Auto-split",
    'Satinstiche länger als dieser Wert werden geteilt, damit sie nicht hängen bleiben. Üblich: 7 mm. 0 = nie teilen.':
      "Satinsting, der er længere end denne værdi, deles, så de ikke hænger fast. Typisk: 7 mm. 0 = del aldrig.",
    'Kurzstiche in Bögen': "Korte sting i buer",
    'An der Innenseite von Kurven und Ecken endet jeder zweite Stich früher – sonst häufen sich dort die Einstiche zu einem Knubbel.':
      "På indersiden af kurver og hjørner slutter hvert andet sting tidligere – ellers hober nålestikkene sig op til en klump der.",
    '3D-Puff (Schaum)': "3D-puff (skum)",
    'Für erhabene Stickerei mit Schaum: sehr dicht, ohne Unterlage, Enden verstärkt, Maschine stoppt zum Auflegen des Schaums.':
      "Til ophøjet broderi med skum: meget tæt, uden understing, forstærkede ender, maskinen stopper, så du kan lægge skummet på.",
    'Breite': "Bredde",
    'Breite der Satinlinie in mm. Gut sticken lassen sich etwa 1,5–8 mm; breiter wird automatisch geteilt.':
      "Satinlinjens bredde i mm. Ca. 1,5–8 mm broderes godt; bredere deles automatisk.",
    'Füllart': "Fyldtype",
    'Tatami = Reihen (Standard). Satin = glänzend, nur kleine Flächen. Kontur/Spirale = folgt dem Rand. Welle, Muster, Verlauf, Kreuzstich = Effekte.':
      "Tatami = rækker (standard). Satin = skinnende, kun små flader. Kontur/spiral = følger kanten. Bølge, mønster, forløb, korssting = effekter.",
    'Muster': "Mønster",
    'Welches Muster die versetzten Einstiche in der Fläche bilden: Rauten, Diagonalen, Ziegel oder Wellen.':
      "Hvilket mønster de forskudte nålestik danner i fladen: romber, diagonaler, mursten eller bølger.",
    'Wellenhöhe': "Bølgehøjde",
    'Wie stark die Reihen auf und ab schwingen. Üblich: 1–3 mm.': "Hvor kraftigt rækkerne svinger op og ned. Typisk: 1–3 mm.",
    'Wellenlänge': "Bølgelængde",
    'Abstand von Wellenberg zu Wellenberg. Größer = ruhigere, flachere Wellen.':
      "Afstand fra bølgetop til bølgetop. Større = roligere, fladere bølger.",
    'Verlauf bis Abstand': "Forløb til afstand",
    'Die Fläche beginnt dicht und wird zur anderen Seite immer lockerer, bis zu diesem Reihenabstand. Spart Stiche, wirkt wie ein Farbverlauf.':
      "Fladen starter tæt og bliver mere og mere åben mod den anden side, op til denne rækkeafstand. Sparer sting og virker som en farveovergang.",
    'Kreuzgröße': "Korsstørrelse",
    'Größe eines Kreuzstich-Kästchens. Üblich: 2–3 mm.': "Størrelsen på et korssting-felt. Typisk: 2–3 mm.",
    'Kreuze doppelt': "Dobbelte kors",
    'Jeder Kreuzschenkel wird zweimal gestickt – kräftiger und deckender.':
      "Hvert korsben broderes to gange – kraftigere og bedre dækning.",
    'Dichte (Reihenabstand)': "Tæthed (rækkeafstand)",
    'Abstand zwischen den Stichreihen. Kleiner = dichter. Üblich: 0,4 mm; dünne Stoffe eher 0,45, Frottee 0,35.':
      "Afstand mellem stingrækkerne. Mindre = tættere. Typisk: 0,4 mm; tynde stoffer snarere 0,45, frotté 0,35.",
    'Länge der Stiche in jeder Reihe. Üblich: 3–4 mm. Länger als 7 mm kann hängen bleiben.':
      "Længden af stingene i hver række. Typisk: 3–4 mm. Længere end 7 mm kan hænge fast.",
    'Stichwinkel': "Stingvinkel",
    'Richtung der Stichreihen in Grad. Verschiedene Winkel bei benachbarten Flächen lassen sie sich optisch abheben. Mit „Umformen“ am orangen Griff ziehen.':
      "Stingrækkernes retning i grader. Forskellige vinkler på nabo-flader får dem til at skille sig ud fra hinanden. Træk i det orange håndtag med »Omform«.",
    'Gleicht das Zusammenziehen des Stoffes aus, die Fläche wird quer zu den Stichen etwas verlängert. Üblich: 0,2 mm.':
      "Udligner, at stoffet trækker sig sammen; fladen forlænges en smule på tværs af stingene. Typisk: 0,2 mm.",
    'Stiche unter der Fläche, die den Stoff stabilisieren. Kante + Tatami ist für die meisten Stoffe richtig.':
      "Sting under fladen, der stabiliserer stoffet. Kant + tatami er det rigtige til de fleste stoffer.",
    'Satin-Split': "Satin-split",
    'Nur für Satin-Flächen: Stiche länger als dieser Wert werden geteilt.': "Kun til satinflader: sting, der er længere end denne værdi, deles.",
    'Kontur': "Kontur",
    'Optionaler Rand um die Fläche: Laufstich, Dreifachstich oder Satin. Deckt die Kante sauber ab.':
      "Valgfri kant rundt om fladen: løbesting, tredobbelt sting eller satin. Dækker kanten pænt.",
    'Satin-Konturbreite': "Satinkonturens bredde",
    'Breite des Satinrands um die Fläche.': "Bredden af satinkanten rundt om fladen.",
    'Verbindung davor': "Forbindelse før",
    'Wie die Maschine vom vorigen Objekt hierher kommt: automatisch, immer schneiden, springen ohne Schnitt oder direkt als Stich.':
      "Hvordan maskinen kommer hertil fra det forrige objekt: automatisk, klip altid, spring uden klip eller direkte som sting.",
    'Maschine stoppt davor': "Maskinen stopper før",
    'Die Maschine hält vor diesem Objekt an, z. B. um Applikationsstoff oder Puff-Schaum aufzulegen.':
      "Maskinen stopper før dette objekt, f.eks. så du kan lægge applikationsstof eller puff-skum på.",
    'An Stoff anpassen': "Tilpas til stof",
    'Ein: Dichte, Zugausgleich, Unterlage usw. werden automatisch aus Stoff und Breite berechnet („auto“). Von Hand geänderte Werte bleiben.':
      "Til: tæthed, trækkompensation, understing osv. beregnes automatisk ud fra stof og bredde (»auto«). Værdier, du har ændret i hånden, bevares.",
    'Wieder automatisch': "Automatisk igen",
    'Setzt alle von Hand geänderten Werte zurück auf die automatische Berechnung für den gewählten Stoff.':
      "Nulstiller alle værdier, der er ændret i hånden, til den automatiske beregning for det valgte stof.",
    'Text bearbeiten': "Rediger tekst",
    'Öffnet den Textdialog: Wortlaut, Schrift, Größe, Bogen und Hüllform ändern. Der Text wird neu gesetzt.':
      "Åbner tekstdialogen: ændr ordlyd, skrifttype, størrelse, bue og konvolutform. Teksten opbygges igen.",
    'Buchstaben anpassen': "Tilpas bogstaver",
    'Einzelne Buchstaben verschieben, drehen oder vergrößern und den Abstand zwischen Buchstaben (Kerning) von Hand einstellen.':
      "Flyt, rotér eller forstør enkelte bogstaver, og indstil afstanden mellem bogstaverne (knibning) i hånden.",
    'Macht jeden Buchstaben zu einem eigenen Objekt. Danach ist der Text nicht mehr als Text änderbar.':
      "Gør hvert bogstav til et separat objekt. Derefter kan teksten ikke længere redigeres som tekst.",
  });

  /* =====================================================================
     Hilfe-Infos in Dialogen (help_dialogs.js)
     ===================================================================== */
  Object.assign(E.exact, {
    'Hinweise nicht aufklappen': "Vis ikke meddelelser automatisk",
    'Ein Haken schaltet das automatische Fenster bei Problemen ab. Die Prüfung läuft trotzdem weiter und zeigt ihr Ergebnis unten in der Statusleiste.':
      "Et flueben slår det automatiske vindue ved problemer fra. Kontrollen kører stadig og viser sit resultat nederst i statuslinjen.",
    'Stoff-Details': "Stofdetaljer",
    'Zeigt alle Empfehlungen für den gewählten Stoff: Vlies, Topper, Nadel, Geschwindigkeit und welche Stichwerte automatisch angepasst werden.':
      "Viser alle anbefalinger til det valgte stof: vlies, topper, nål, hastighed og hvilke stingværdier der tilpasses automatisk.",
    'Knockdown-Stich hinzufügen': "Tilføj knockdown-sting",
    'Bei Stoffen mit Flor (Frottee, Fleece, Strick, Piqué) drückt ein lockeres Gitter unter dem Motiv die Schlaufen flach, damit feine Details nicht versinken.':
      "På stoffer med luv (frotté, fleece, strik, piqué) trykker et løst gitter under motivet løkkerne flade, så fine detaljer ikke synker ned.",

    /* Kopien anordnen */
    'Art der Anordnung': "Type af arrangement",
    'Kreis: Kopien gleichmäßig rundherum verteilt (z. B. Blütenblätter). Raster: Kopien in Reihen und Spalten (z. B. mehrere Abzeichen auf einem Stoffstück).':
      "Cirkel: kopier fordelt jævnt hele vejen rundt (f.eks. kronblade). Gitter: kopier i rækker og kolonner (f.eks. flere mærker på ét stykke stof).",
    'Anzahl im Kreis': "Antal i cirklen",
    'Wie viele Exemplare insgesamt entstehen – das Original zählt mit. Erlaubt sind 2 bis 72.':
      "Hvor mange eksemplarer der laves i alt – originalen tæller med. Tilladt er 2 til 72.",
    'Kreis-Radius': "Cirkelradius",
    'Abstand vom Mittelpunkt bis zu den Kopien in mm. Das Original wird dabei oben auf den Kreis gesetzt. Bei 0 bleibt es, wo es ist.':
      "Afstand fra midtpunktet til kopierne i mm. Originalen placeres øverst på cirklen. Ved 0 bliver den, hvor den er.",
    'Kreis-Mittelpunkt': "Cirklens midtpunkt",
    'Rahmenmitte: Kreis um die Mitte des Stickrahmens. „Unter der Auswahl“: Der Mittelpunkt liegt genau um den Radius unterhalb des Originals.':
      "Rammens midte: cirkel rundt om broderirammens midte. »Under markeringen«: midtpunktet ligger præcis én radius under originalen.",
    'Kopien mitdrehen': "Rotér kopierne med",
    'Mit Haken zeigt jede Kopie zur Kreismitte (wie Speichen). Ohne Haken bleiben alle Kopien aufrecht, nur ihre Position wandert im Kreis.':
      "Med flueben peger hver kopi mod cirklens midte (som eger). Uden flueben forbliver alle kopier oprejste, kun deres position flytter sig rundt i cirklen.",
    'Spalten': "Kolonner",
    'Anzahl der Exemplare nebeneinander (waagrecht), inklusive Original.': "Antal eksemplarer ved siden af hinanden (vandret), inklusive originalen.",
    'Reihen': "Rækker",
    'Anzahl der Exemplare untereinander (senkrecht), inklusive Original.': "Antal eksemplarer under hinanden (lodret), inklusive originalen.",
    'Abstand waagrecht': "Vandret afstand",
    'Lücke in mm zwischen den Kopien nebeneinander – gemessen von Kante zu Kante, nicht von Mitte zu Mitte.':
      "Mellemrum i mm mellem kopierne ved siden af hinanden – målt fra kant til kant, ikke fra midte til midte.",
    'Abstand senkrecht': "Lodret afstand",
    'Lücke in mm zwischen den Reihen – gemessen von Kante zu Kante.': "Mellemrum i mm mellem rækkerne – målt fra kant til kant.",

    /* Hilfslinien */
    'Einrasten': "Fastgør",
    'Punkte springen beim Zeichnen und Verschieben auf das Raster und an Hilfslinien. Praktisch für gerade, exakt ausgerichtete Formen.':
      "Punkter fastgøres til gitteret og hjælpelinjerne, når du tegner og flytter. Praktisk til lige, præcist justerede former.",
    'Rasterweite': "Gitterafstand",
    'Abstand der Rasterpunkte in mm, an denen eingerastet wird. Üblich: 1–5 mm; kleiner für feine Arbeiten.':
      "Afstand i mm mellem de gitterpunkter, der fastgøres til. Typisk: 1–5 mm; mindre til fint arbejde.",
    'Richtung der Hilfslinie': "Hjælpelinjens retning",
    'Senkrecht: Linie bei einem festen X-Wert. Waagrecht: Linie bei einem festen Y-Wert. Hilfslinien werden nicht gestickt.':
      "Lodret: linje ved en fast X-værdi. Vandret: linje ved en fast Y-værdi. Hjælpelinjer broderes ikke.",
    'Position der Hilfslinie': "Hjælpelinjens position",
    'Lage der neuen Linie in mm, gemessen von der Rahmenmitte (0). Feld leer lassen, wenn keine neue Linie angelegt werden soll.':
      "Den nye linjes placering i mm, målt fra rammens midte (0). Lad feltet være tomt, hvis der ikke skal oprettes en ny linje.",

    /* Farbe bearbeiten */
    'Farbe': "Farve",
    'Bildschirmfarbe dieses Garns. Wird sie von Hand geändert, wird die Zuordnung zur Garnnummer gelöscht.':
      "Skærmfarven for denne tråd. Ændrer du den i hånden, fjernes tilknytningen til trådnummeret.",
    'Name / Garnnummer': "Navn / trådnummer",
    'Freier Name der Farbe, z. B. „Madeira 1800 Rot“. Erscheint auf dem Arbeitsblatt, damit an der Maschine das richtige Garn eingefädelt wird.':
      "Frit navn til farven, f.eks. »Madeira 1800 Rød«. Vises på arbejdsarket, så den rigtige tråd bliver trådet i maskinen.",
    'Nadel': "Nål",
    'Auf welcher Nadel (1–15) dieses Garn an der Mehrnadelmaschine liegt. Bei Einnadel-Maschinen ohne Bedeutung.':
      "Hvilken nål (1–15) tråden sidder på i flernålsmaskinen. Uden betydning for enkeltnålsmaskiner.",
    'Garnmarke': "Trådmærke",
    'Hersteller, aus dessen Farbkarte unten ein Garn gewählt wird (z. B. Madeira, Isacord). Ohne Suche erscheinen die 24 ähnlichsten Garne.':
      "Producent, hvis farvekort du vælger en tråd fra nedenfor (f.eks. Madeira, Isacord). Uden søgning vises de 24 mest lignende tråde.",
    'Garn suchen': "Søg tråd",
    'Nach Garnnummer oder Farbname suchen, z. B. „1800“ oder „rot“. Deutsche Farbwörter werden ebenfalls erkannt.':
      "Søg efter trådnummer eller farvenavn, f.eks. »1800« eller »rød«. Tyske farveord genkendes også.",

    /* Teamnamen */
    'Platzhalter-Text': "Pladsholdertekst",
    'Das Textobjekt im Design, das gegen jeden Namen der Liste ausgetauscht wird. Schrift, Größe und Lage bleiben erhalten.':
      "Det tekstobjekt i designet, der udskiftes med hvert navn på listen. Skrifttype, størrelse og placering bevares.",
    'Namensliste': "Navneliste",
    'Ein Name pro Zeile, z. B. „MÜLLER 10“. Für jede Zeile entsteht eine eigene Stickdatei.':
      "Ét navn pr. linje, f.eks. »JENSEN 10«. Hver linje får sin egen broderifil.",
    'Höchstbreite': "Maksimal bredde",
    'Zu lange Namen werden auf diese Breite in mm verkleinert, damit sie z. B. zwischen die Schulterblätter passen. 0 = Größe nie ändern.':
      "For lange navne formindskes til denne bredde i mm, så de f.eks. passer mellem skulderbladene. 0 = ændr aldrig størrelsen.",
    'Dateiformat': "Filformat",
    'Format der Stickdateien. DST für Tajima-kompatible Industriemaschinen, PES für Brother, JEF für Janome, EXP für Melco/Bernina.':
      "Broderifilernes format. DST til Tajima-kompatible industrimaskiner, PES til Brother, JEF til Janome, EXP til Melco/Bernina.",
    'Dateiname': "Filnavn",
    'Anfang der Dateinamen. An ihn wird jeweils der Name angehängt, z. B. „Trikot_MÜLLER 10.dst“.':
      "Begyndelsen af filnavnene. Navnet tilføjes hver gang, f.eks. »Trøje_JENSEN 10.dst«.",

    /* Mehrfach-Einspannung */
    'Rahmen je Einspannung': "Ramme pr. opspænding",
    'Der Rahmen, mit dem jedes Teilstück gestickt wird. Nur eckige Rahmen sind möglich. Je größer der Rahmen, desto weniger Einspannungen.':
      "Den ramme, hver del broderes med. Kun firkantede rammer er mulige. Jo større ramme, desto færre opspændinger.",
    'Überlappung': "Overlapning",
    'So viele mm überlappen sich benachbarte Teilstücke. Hier sitzen die Passmarken. Üblich: 15–25 mm.':
      "Så mange mm overlapper nabodelene hinanden. Her sidder pasmærkerne. Typisk: 15–25 mm.",
    'Passmarken': "Pasmærker",
    'Kleine Kreuze im Überlappungsbereich: am Ende einer Einspannung und am Anfang der nächsten gestickt, um den Stoff exakt auszurichten. Danach entfernen.':
      "Små kryds i overlapsområdet: broderes i slutningen af én opspænding og i starten af den næste, så stoffet kan justeres præcist. Fjern dem bagefter.",
    'Format der Stickdateien je Einspannung. DST für Tajima-kompatible Maschinen, PES für Brother, JEF für Janome, EXP für Melco/Bernina.':
      "Broderifilernes format pr. opspænding. DST til Tajima-kompatible maskiner, PES til Brother, JEF til Janome, EXP til Melco/Bernina.",

    /* Produkt-Vorschau */
    'Produkt': "Produkt",
    'Kleidungsstück oder Artikel, auf dem das Design in der Vorschau gezeigt wird.': "Beklædningsgenstand eller vare, som designet vises på i produktvisningen.",
    'Platzierung': "Placering",
    'Stelle auf dem Produkt, z. B. linke Brust oder Rücken. Die Auswahl hängt vom gewählten Produkt ab.':
      "Sted på produktet, f.eks. venstre bryst eller ryg. Valgmulighederne afhænger af det valgte produkt.",
    'Stofffarbe': "Stoffarve",
    'Farbe des Produkts in der Vorschau – zeigt, wie die Garnfarben auf dem Stoff wirken.':
      "Produktets farve i produktvisningen – viser, hvordan trådfarverne virker på stoffet.",

    /* Preiskalkulation */
    'Berechnungsart': "Beregningsmetode",
    'Nach Stichzahl: Preis je 1000 Stiche plus Farbaufschlag. Nach Maschinenzeit: Stundensatz mal geschätzter Laufzeit inkl. Farbwechsel und Einspannen.':
      "Efter stingantal: pris pr. 1000 sting plus farvetillæg. Efter maskintid: timepris gange anslået køretid inkl. farveskift og opspænding.",
    'Preis je 1000 Stiche': "Pris pr. 1000 sting",
    'Gilt bei Berechnung nach Stichzahl. Üblich sind etwa 0,50–1,50 € je 1000 Stiche, je nach Region und Menge.':
      "Gælder ved beregning efter stingantal. Ca. 0,50–1,50 € pr. 1000 sting er typisk, afhængigt af region og mængde.",
    'Stundensatz Maschine': "Timepris maskine",
    'Kosten einer Maschinenstunde in €. Gilt nur bei Berechnung nach Maschinenzeit.':
      "Prisen for én maskintime i €. Gælder kun ved beregning efter maskintid.",
    'Aufschlag je Farbe': "Tillæg pr. farve",
    'Zuschlag in € pro Garnfarbe im Design (für Farbwechsel). Gilt bei Berechnung nach Stichzahl.':
      "Tillæg i € pr. trådfarve i designet (for farveskift). Gælder ved beregning efter stingantal.",
    'Mindestpreis je Stück': "Minimumspris pr. stk.",
    'Untergrenze für den Stickpreis pro Stück – greift bei sehr kleinen Motiven. Textil kommt danach noch dazu.':
      "Nedre grænse for broderiprisen pr. stk. – træder i kraft ved meget små motiver. Tekstilet lægges oveni.",
    'Einspannzeit je Stück': "Opspændingstid pr. stk.",
    'Minuten für Einspannen und Ausspannen pro Stück. Fließt in die Maschinenzeit ein. Üblich: 1–2 min.':
      "Minutter til at spænde op og spænde af pr. stk. Indgår i maskintiden. Typisk: 1–2 min.",
    'Textil je Stück': "Tekstil pr. stk.",
    'Preis des Kleidungsstücks in €, wenn Sie es liefern. 0, wenn der Kunde die Textilien selbst mitbringt (beistellt).':
      "Prisen på beklædningsgenstanden i €, hvis du leverer den. 0, hvis kunden selv leverer tekstilerne.",
    'Einrichtung je Auftrag': "Opsætning pr. ordre",
    'Einmalige Kosten pro Auftrag für Einrichten der Maschine, Garn einfädeln und Probestick – unabhängig von der Stückzahl.':
      "Engangsomkostning pr. ordre til opsætning af maskinen, trådning og prøvebroderi – uanset antal.",
    'Digitalisierung': "Digitalisering",
    'Einmaliger Preis für das Erstellen der Stickdatei. 0, wenn nicht berechnet.':
      "Engangspris for at oprette broderifilen. 0, hvis den ikke faktureres.",
    'Mengenrabatt': "Mængderabat",
    'Staffel als „Stück:Prozent“, durch Komma getrennt, z. B. „1:0, 10:5, 50:15“. Jeder Eintrag ergibt eine Zeile in der Preistabelle.':
      "Trin som »stk.:procent«, adskilt med komma, f.eks. »1:0, 10:5, 50:15«. Hver post giver én række i pristabellen.",
    'Mehrwertsteuer': "Moms",
    'Steuersatz in % für die Brutto-Preise. In Deutschland üblich: 19 %.': "Momssats i % for bruttopriserne. I Danmark er satsen 25 %, i Tyskland 19 %.",

    /* Bibliothek */
    'Name': "Navn",
    'Unter diesem Namen erscheint das Design in der Bibliothek. Er wird auch als Projektname übernommen.':
      "Under dette navn vises designet i biblioteket. Det bruges også som projektnavn.",
    'Stichworte': "Nøgleord",
    'Begriffe zum späteren Wiederfinden, durch Komma getrennt, z. B. „Logo, Verein, Kappe“.':
      "Ord, der gør det nemt at finde designet igen senere, adskilt med komma, f.eks. »logo, forening, kasket«.",
    'Kunde': "Kunde",
    'Für wen das Design ist. Danach lässt sich in der Bibliothek suchen.': "Hvem designet er til. Du kan søge efter det i biblioteket.",
    'Bibliothek durchsuchen': "Søg i biblioteket",
    'Filtert die Designs nach Name, Stichwort oder Kunde.': "Filtrerer designs efter navn, nøgleord eller kunde.",
    'Sortierung': "Sortering",
    'Reihenfolge der Designs: neueste zuerst, alphabetisch nach Name oder nach Stichzahl.':
      "Designernes rækkefølge: nyeste først, alfabetisk efter navn eller efter stingantal.",
    'Aktuelles Design speichern': "Gem aktuelt design",
    'Legt das gerade geöffnete Design in der Bibliothek ab. Die Bibliothek liegt nur in diesem Browser – zusätzlich als Projektdatei sichern.':
      "Gemmer det åbne design i biblioteket. Biblioteket findes kun i denne browser – gem det også som projektfil.",

    /* Applikation */
    'Heftstich': "Fastgøringssting",
    'Hält den aufgelegten Applikationsstoff fest, bevor er zugeschnitten wird. Zickzack hält gut, Doppel-Laufstich ist unauffällig, E-Stich liegt dazwischen.':
      "Holder det pålagte applikationsstof fast, før det klippes til. Zigzag holder godt, dobbelt løbesting er diskret, E-sting ligger midt imellem.",
    'Abdeckung': "Dækning",
    'Stich, der die Schnittkante des Stoffes verdeckt. Satin: klassischer, glänzender Rand. E-Stich (Langette): leichter, dekorativer Rand.':
      "Sting, der dækker stoffets klippekant. Satin: klassisk, skinnende kant. E-sting (langettesting): lettere, dekorativ kant.",
    'Breite der Abdeckung': "Dækningens bredde",
    'Breite des Randstichs in mm. Breiter verdeckt unsauber geschnittene Kanten besser. Üblich: 3–4 mm.':
      "Kantstingets bredde i mm. Bredere skjuler ujævnt klippede kanter bedre. Typisk: 3–4 mm.",
    'Löcher einfassen': "Kant huller",
    'Auch innere Aussparungen der Form (z. B. das Loch im „O“) bekommen Platzierung, Heftstich und Abdeckung.':
      "Også indvendige udsparinger i formen (f.eks. hullet i et »O«) får placering, fastgøringssting og dækning.",
    'Eigene Farbe für Abdeckung': "Egen farve til dækning",
    'Die Abdeckung wird in der aktuell gewählten Palettenfarbe gestickt statt in der Farbe der Form – z. B. ein dunkler Rand um hellen Stoff.':
      "Dækningen broderes i den aktuelt valgte paletfarve i stedet for formens farve – f.eks. en mørk kant om lyst stof.",

    /* Knockdown */
    'Rand um das Motiv': "Kant rundt om motivet",
    'So weit in mm ragt das Knockdown-Gitter über das Motiv hinaus. Üblich: 1–2 mm.':
      "Så mange mm rager knockdown-gitteret ud over motivet. Typisk: 1–2 mm.",
    'Gitterabstand': "Gitterafstand",
    'Abstand der Gitterlinien in mm. Kleiner drückt den Flor stärker, braucht aber mehr Stiche. Üblich: 1,5–2 mm.':
      "Afstand mellem gitterlinjerne i mm. Mindre trykker luven mere ned, men kræver flere sting. Typisk: 1,5–2 mm.",
    'Gitterwinkel': "Gittervinkel",
    'Richtung der Gitterlinien in Grad. Meist 45°.': "Gitterlinjernes retning i grader. Oftest 45°.",
    'Farbe des Knockdowns': "Knockdown-farve",
    'Am besten Stofffarbe – dann ist das Gitter unsichtbar. Dafür wird eine neue Palettenfarbe in Stofffarbe angelegt.':
      "Helst stoffets farve – så er gitteret usynligt. Der oprettes en ny paletfarve i stoffarven til det.",

    /* Kappe */
    'Farbreihenfolge behalten': "Bevar farverækkefølge",
    'Mit Haken bleiben die Farben in ihrer Reihenfolge und nur innerhalb jeder Farbe wird von der Mitte nach außen sortiert. Ohne Haken gibt es mehr Farbwechsel.':
      "Med flueben bevares farvernes rækkefølge, og der sorteres kun fra midten og udad inden for hver farve. Uden flueben bliver der flere farveskift.",
    'Kappenrahmen und Stoff wählen': "Vælg kasketramme og stof",
    'Stellt zusätzlich einen Kappenrahmen und den Stoff „Kappe“ ein, damit Dichte und Zugausgleich passen.':
      "Indstiller desuden en kasketramme og stoffet »Kasket«, så tæthed og trækkompensation passer.",

    /* Garnmarke */
    'Jede Palettenfarbe bekommt das ähnlichste Garn dieser Marke. Die Tabelle zeigt vorher, wie gut es passt (ΔE = Farbabstand).':
      "Hver paletfarve får den mest lignende tråd fra dette mærke. Tabellen viser på forhånd, hvor godt den passer (ΔE = farveafstand).",
    'Neue Farben automatisch zuordnen': "Tildel nye farver automatisk",
    'Farben aus Import und Auto-Digitalisieren bekommen gleich das nächste Garn der gewählten Marke.':
      "Farver fra import og autodigitalisering får straks den nærmeste tråd fra det valgte mærke.",

    /* Buchstaben einzeln */
    'Abstand davor': "Afstand før",
    'Verschiebt diesen Buchstaben und alle folgenden waagrecht (Kerning) in mm. Negativ rückt näher zusammen.':
      "Flytter dette bogstav og alle følgende vandret (knibning) i mm. Negativ rykker dem tættere sammen.",
    'X verschieben': "Flyt X",
    'Verschiebt nur diesen Buchstaben waagrecht in mm. Positiv = nach rechts.': "Flytter kun dette bogstav vandret i mm. Positiv = mod højre.",
    'Y verschieben': "Flyt Y",
    'Verschiebt nur diesen Buchstaben senkrecht in mm. Positiv = nach oben.': "Flytter kun dette bogstav lodret i mm. Positiv = opad.",
    'Buchstabe drehen': "Rotér bogstav",
    'Dreht nur diesen Buchstaben um den angegebenen Winkel in Grad.': "Roterer kun dette bogstav med den angivne vinkel i grader.",
    'Buchstabengröße': "Bogstavstørrelse",
    'Größe dieses Buchstabens in Prozent. 100 = unverändert, z. B. 70 für kleinere Seitenbuchstaben im Monogramm.':
      "Dette bogstavs størrelse i procent. 100 = uændret, f.eks. 70 til mindre sidebogstaver i et monogram.",

    /* Text auf Linie */
    'Seite': "Side",
    'Ob der Text oberhalb oder unterhalb der Linie steht – unterhalb z. B. für Schrift unten an einem Kreis.':
      "Om teksten står over eller under linjen – under f.eks. til skrift nederst på en cirkel.",
    'Ausrichtung': "Justering",
    'Wo der Text auf der Linie sitzt: mittig, am Anfang oder am Ende der Linie.':
      "Hvor teksten sidder på linjen: centreret, ved starten eller ved slutningen af linjen.",
    'Verschieben entlang der Linie': "Forskyd langs linjen",
    'Schiebt den Text in mm an der Linie entlang, z. B. um ihn auf einem Kreis zu drehen.':
      "Skubber teksten langs linjen i mm, f.eks. for at dreje den rundt på en cirkel.",
    'Linie danach': "Linjen bagefter",
    'Was mit der Führungslinie passiert: ausblenden (wird nicht gestickt), mitsticken (als Zierlinie) oder ganz löschen.':
      "Hvad der sker med føringslinjen: skjul den (broderes ikke), brodér den med (som pyntelinje) eller slet den helt.",

    /* Monogramm */
    'Initialen': "Initialer",
    '2 bis 3 Buchstaben für das Monogramm, z. B. „ABC“.': "2 til 3 bogstaver til monogrammet, f.eks. »ABC«.",
    'Vorlage': "Skabelon",
    'Klassisch: mittlerer Buchstabe groß (bei 3 Buchstaben). Kreis, Raute oder Linien fügen einen gestickten Rahmen aus Satin hinzu.':
      "Klassisk: stort midterbogstav (ved 3 bogstaver). Cirkel, rombe eller linjer tilføjer en broderet ramme i satin.",
    'Schrift': "Skrifttype",
    'Fertig digitalisierte Stickschrift. Monogramm- und Serifenschriften stehen oben in der Liste.':
      "Færdigdigitaliseret broderiskrifttype. Monogram- og serifskrifttyper står øverst på listen.",
    'Höhe': "Højde",
    'Höhe der Buchstaben in mm. Üblich: 20–40 mm für Handtücher oder Hemden.': "Bogstavernes højde i mm. Typisk: 20–40 mm til håndklæder eller skjorter.",
    'Breite der Umrandung': "Kantens bredde",
    'Breite der Satinlinie für Kreis, Raute oder Linien in mm. Üblich: 2–3 mm.':
      "Bredden af satinlinjen til cirkel, rombe eller linjer i mm. Typisk: 2–3 mm.",

    /* Text */
    'Der zu stickende Text, z. B. ein Name oder Vereinsname.': "Den tekst, der skal broderes, f.eks. et navn eller et foreningsnavn.",
    'Schriftart': "Skrifttype",
    'Stickschriften sind fertig digitalisiert und sticken am saubersten. Andere Schriften werden automatisch in Satin umgewandelt.':
      "Broderiskrifttyper er færdigdigitaliserede og broderer pænest. Andre skrifttyper omdannes automatisk til satin.",
    'Höhe Großbuchstaben': "Højde på store bogstaver",
    'Höhe der Großbuchstaben in mm. Satinschrift unter ca. 5 mm wird unleserlich. Bei Stickschriften wird die empfohlene Größe vorgeschlagen.':
      "De store bogstavers højde i mm. Satinskrift under ca. 5 mm bliver ulæselig. For broderiskrifttyper foreslås den anbefalede størrelse.",
    'Zeichenabstand': "Tegnafstand",
    'Zusätzlicher Abstand zwischen den Buchstaben in %. Negativ rückt sie enger zusammen.':
      "Ekstra afstand mellem bogstaverne i %. Negativ rykker dem tættere sammen.",
    'Bogen-Radius': "Bueradius",
    'Legt den Text auf einen Kreisbogen mit diesem Radius in mm. 0 = gerade, negativ = Bogen nach unten (Text unten am Kreis).':
      "Lægger teksten på en cirkelbue med denne radius i mm. 0 = lige, negativ = bue nedad (tekst nederst på cirklen).",
    'Hüllform': "Konvolutform",
    'Verzerrt den ganzen Schriftzug in eine Form, z. B. Brücke, Welle oder Wimpel – typisch für Vereinslogos.':
      "Forvrænger hele teksten til en form, f.eks. bro, bølge eller vimpel – typisk til foreningslogoer.",
    'Stärke der Hüllform': "Konvolutformens styrke",
    'Wie stark die Hüllform den Text verbiegt, in mm. Üblich: 3–10 mm.': "Hvor meget konvolutformen bøjer teksten, i mm. Typisk: 3–10 mm.",
    'Text auf Linie': "Tekst på linje",
    'Der Text folgt einer Linie. „Von der Linie lösen“ setzt ihn wieder gerade.':
      "Teksten følger en linje. »Løsn fra linjen« gør den lige igen.",
    'Satin: glänzend, folgt Kurven – ideal für Schrift. Tatami: flächige Füllung für sehr große Buchstaben. Automatisch: breite Teile werden Tatami.':
      "Satin: skinnende, følger kurver – ideel til skrift. Tatami: fladeudfyldning til meget store bogstaver. Automatisk: brede dele bliver tatami.",
    'Fett': "Fed",
    'Macht die Buchstaben künstlich dicker. Nur bei automatisch umgewandelten Schriften.':
      "Gør bogstaverne kunstigt tykkere. Kun ved automatisk omdannede skrifttyper.",
    'Kursiv': "Kursiv",
    'Neigt die Buchstaben künstlich schräg. Nur bei automatisch umgewandelten Schriften.':
      "Hælder bogstaverne kunstigt. Kun ved automatisk omdannede skrifttyper.",

    /* Stickrahmen */
    'Aktiver Rahmen': "Aktiv ramme",
    'Der Stickrahmen, in dem gestickt wird. Er bestimmt das nutzbare Stickfeld und den Prüfbereich.':
      "Den broderiramme, der broderes i. Den bestemmer det brugbare broderifelt og det område, der kontrolleres.",
    'Verschiebt das ganze Design so, dass seine Mitte genau in der Rahmenmitte liegt.':
      "Flytter hele designet, så dets midte ligger præcis i rammens midte.",
    'In Rahmen einpassen': "Indpas i rammen",
    'Vergrößert oder verkleinert das Design so, dass es das Stickfeld des Rahmens ausfüllt, und setzt es in die Mitte.':
      "Forstørrer eller formindsker designet, så det udfylder rammens broderifelt, og centrerer det.",
    'Rahmenname': "Rammenavn",
    'Name für den eigenen Rahmen, z. B. „Rundrahmen 20 cm“. Bleibt leer, wird ein Name aus den Maßen gebildet.':
      "Navn på din egen ramme, f.eks. »Rund ramme 20 cm«. Lades det stå tomt, dannes et navn ud fra målene.",
    'Rahmenform': "Rammeform",
    'Form des Stickfelds: rund, eckig oder oval.': "Broderifeltets form: rund, firkantet eller oval.",
    'Breite / Durchmesser': "Bredde / diameter",
    'Nutzbare Breite des Stickfelds in mm, bei runden Rahmen der Durchmesser. Innenmaß messen, nicht die Außenkante.':
      "Broderifeltets brugbare bredde i mm, ved runde rammer diameteren. Mål indvendigt, ikke yderkanten.",
    'Nutzbare Höhe des Stickfelds in mm. Nur bei eckigen und ovalen Rahmen.':
      "Broderifeltets brugbare højde i mm. Kun ved firkantede og ovale rammer.",
    'Sicherheitsabstand': "Sikkerhedsafstand",
    'Abstand zum Rahmenrand in mm, in dem nicht gestickt werden sollte, damit der Fuß nicht an den Rahmen stößt. Üblich: 5 mm.':
      "Afstand til rammekanten i mm, hvor der ikke bør broderes, så trykfoden ikke støder mod rammen. Typisk: 5 mm.",
    'Rahmen anlegen': "Opret ramme",
    'Speichert den eigenen Rahmen mit diesen Maßen und wählt ihn gleich aus.': "Gemmer din egen ramme med disse mål og vælger den med det samme.",

    /* Vektorimport */
    'Breite im Stickmotiv': "Bredde i motivet",
    'Gewünschte Breite des Motivs in mm. Die Höhe passt sich an. Der Höchstwert für den Rahmen steht daneben.':
      "Ønsket bredde på motivet i mm. Højden tilpasses. Maksimumværdien for rammen står ved siden af.",
    'Schmale Formen als Satin': "Smalle former som satin",
    'Formen bis zu dieser Strichbreite in mm werden als Satin gestickt, breitere als Tatami-Fläche. Üblich: 7 mm; 0 = nie Satin.':
      "Former op til denne stregbredde i mm broderes som satin, bredere som tatamiflade. Typisk: 7 mm; 0 = aldrig satin.",
    'Weiße Flächen weglassen': "Udelad hvide flader",
    'Weiße Flächen sind meist Hintergrund und werden nicht gestickt. Haken entfernen, wenn Weiß wirklich gestickt werden soll.':
      "Hvide flader er som regel baggrund og broderes ikke. Fjern fluebenet, hvis hvidt virkelig skal broderes.",
    'Konturen übernehmen': "Overtag konturer",
    'Linien der Grafik werden als Laufstich oder Satinlinie übernommen. Ohne Haken nur die Flächen.':
      "Grafikkens linjer overtages som løbesting eller satinlinje. Uden flueben kun fladerne.",
    'Verdeckte Teile unten liegender Flächen werden ausgeschnitten. So liegen keine Stiche doppelt übereinander und das Motiv wird nicht zu dick.':
      "Skjulte dele af underliggende flader skæres væk. Så ligger der ingen sting dobbelt oven på hinanden, og motivet bliver ikke for tykt.",

    /* Maschine & Rahmen */
    'Maschinentyp': "Maskintype",
    'Legt die Grenzwerte für die Stickprüfung fest. Industriemaschinen vertragen etwas breitere Satins und dichtere Stiche als Haushaltsmaschinen.':
      "Fastlægger grænseværdierne for stingkontrollen. Industrimaskiner kan klare lidt bredere satin og tættere sting end hjemmemaskiner.",
    'Längster Stich': "Længste sting",
    'Längere Stiche meldet die Stickprüfung als Problem. Lange Stiche bleiben leicht hängen. Üblich: 12 mm.':
      "Stingkontrollen melder længere sting som et problem. Lange sting hænger let fast. Typisk: 12 mm.",
    'Kürzester Stich': "Korteste sting",
    'Kürzere Stiche meldet die Prüfung – sie führen zu Fadenrissen und Knoten. Üblich: 0,3–0,4 mm.':
      "Kontrollen melder kortere sting – de giver trådbrud og knuder. Typisk: 0,3–0,4 mm.",
    'Satin ohne Teilung': "Satin uden deling",
    'Breitere Satinstiche ohne Teilung (Split) meldet die Prüfung, weil sie locker durchhängen. Üblich: 8–10 mm.':
      "Kontrollen melder bredere satinsting uden deling (split), fordi de hænger løst. Typisk: 8–10 mm.",
    'Satin-Abstand mindestens': "Mindste satinafstand",
    'Dichtere Satins meldet die Prüfung – sie werden zu hart und können Nadeln brechen lassen. Üblich: 0,3 mm.':
      "Kontrollen melder tættere satin – den bliver for hård og kan få nåle til at knække. Typisk: 0,3 mm.",
    'Pop-up bei Problemen': "Pop op ved problemer",
    'Zeigt nach Änderungen automatisch ein Fenster, wenn die Stickprüfung Probleme findet. Ohne Haken nur der Hinweis in der Statusleiste.':
      "Viser automatisk et vindue efter ændringer, når stingkontrollen finder problemer. Uden flueben kun meddelelsen i statuslinjen.",
    'Hintergrundfarbe der Arbeitsfläche, damit die Garnfarben wie auf dem echten Stoff wirken. Wird auch für den Knockdown-Stich verwendet.':
      "Arbejdsfladens baggrundsfarve, så trådfarverne virker som på det rigtige stof. Bruges også til knockdown-stinget.",
    'Ein-/Ausstieg automatisch': "Automatisk start/slut",
    'Start- und Endpunkte der Objekte werden so gewählt, dass die Wege zum nächsten Objekt möglichst kurz sind – weniger Sprünge und Schnitte.':
      "Objekternes start- og slutpunkter vælges, så vejene til det næste objekt bliver så korte som muligt – færre spring og klip.",
    'Versteckte Laufwege': "Skjulte løbeveje",
    'Statt Fadenschnitt läuft der Faden als Laufstich unter einer später gestickten Fläche gleicher Farbe zum nächsten Objekt. Spart Zeit und Schnitte.':
      "I stedet for et trådklip løber tråden som løbesting under en senere broderet flade i samme farve hen til det næste objekt. Sparer tid og klip.",
    'Direkt als Stich verbinden': "Forbind direkte med sting",
    'Liegen zwei Objekte näher als dieser Abstand in mm, wird einfach weitergestickt – ohne Sprung oder Schnitt. Üblich: 2 mm.':
      "Ligger to objekter tættere end denne afstand i mm, broderes der bare videre – uden spring eller klip. Typisk: 2 mm.",
    'Springen ohne Schnitt bis': "Spring uden klip op til",
    'Bis zu diesem Abstand springt die Nadel ohne Fadenschnitt; der lose Faden (Sprungstich) muss später abgeschnitten werden. 0 = immer schneiden.':
      "Op til denne afstand springer nålen uden trådklip; den løse tråd (springsting) skal klippes af bagefter. 0 = klip altid.",
    'Vernähen bei Sprüngen': "Hæftning ved spring",
    'Auch vor und nach einem Sprung ohne Schnitt werden kleine Vernähstiche gesetzt, damit sich nichts aufzieht. Empfohlen: an.':
      "Der sættes også små hæftesting før og efter et spring uden klip, så intet trævler op. Anbefalet: til.",
    'Vernähen': "Hæftning",
    'Setzt am Anfang und Ende jedes Objekts winzige Sicherungsstiche, damit der Faden nach dem Schnitt nicht aufgeht. Empfohlen: an.':
      "Sætter bittesmå hæftesting i starten og slutningen af hvert objekt, så tråden ikke går op efter klippet. Anbefalet: til.",
    'Schnitt ab … Sprüngen': "Klip efter … spring",
    'DST kennt keinen Schnittbefehl – die Maschine schneidet nach so vielen Sprüngen in Folge. Muss mit der Maschineneinstellung übereinstimmen. Üblich: 3.':
      "DST har ingen klippekommando – maskinen klipper efter så mange spring i træk. Skal stemme overens med maskinens indstilling. Typisk: 3.",
    'Geschwindigkeit': "Hastighed",
    'Stiche pro Minute. Dient zur Zeitschätzung und Preiskalkulation – die Maschine selbst wird damit nicht eingestellt. Üblich: 600–1000.':
      "Sting pr. minut. Bruges til tidsoverslag og prisberegning – selve maskinen indstilles ikke med den. Typisk: 600–1000.",

    /* Bild-Einstellungen */
    'Bildbreite': "Billedbredde",
    'Breite der Vorlage in mm. Die Höhe passt sich im gleichen Verhältnis an.': "Skabelonens bredde i mm. Højden tilpasses i samme forhold.",
    'Deckkraft': "Dækkevne",
    'Wie stark das Bild durchscheint. Weniger Deckkraft macht die Stiche darüber besser sichtbar. Üblich: 30–50 %.':
      "Hvor kraftigt billedet ses. Mindre dækkevne gør stingene ovenpå lettere at se. Typisk: 30–50 %.",
    'Position X': "Position X",
    'Lage der linken Bildkante in mm, gemessen von der Rahmenmitte.': "Placeringen af billedets venstre kant i mm, målt fra rammens midte.",
    'Position Y': "Position Y",
    'Lage der oberen Bildkante in mm, gemessen von der Rahmenmitte.': "Placeringen af billedets øverste kant i mm, målt fra rammens midte.",

    /* Auto-Digitalisieren */
    'Anzahl Farben': "Antal farver",
    'Auf so viele Farben wird das Bild reduziert. Jede Farbe wird ein Garnwechsel. Für Logos meist 2–6.':
      "Billedet reduceres til så mange farver. Hver farve betyder et trådskift. Til logoer oftest 2–6.",
    'Breite Stickmotiv': "Motivets bredde",
    'Breite des fertigen Motivs in mm. Das Bild wird auf diese Breite gebracht.': "Det færdige motivs bredde i mm. Billedet skaleres til denne bredde.",
    'Detailstufe': "Detaljeniveau",
    'Wie fein das Bild abgetastet wird (Pixel pro mm). Höher erfasst feinere Details, dauert aber länger. Üblich: 6–10.':
      "Hvor fint billedet aflæses (pixels pr. mm). Højere fanger finere detaljer, men tager længere tid. Typisk: 6–10.",
    'Kleinste Fläche': "Mindste flade",
    'Kleinere Farbflecken in mm² werden weggelassen – das entfernt Bildrauschen und winzige, nicht stickbare Stellen.':
      "Mindre farvepletter i mm² udelades – det fjerner billedstøj og bittesmå steder, der ikke kan broderes.",
    'Automatisch: Schrift und schmale Formen werden Satin, breite Flächen Tatami (flächige Füllung). Oder alles als Tatami.':
      "Automatisk: skrift og smalle former bliver satin, brede flader tatami (fladeudfyldning). Eller alt som tatami.",
    'Satin bis Strichbreite': "Satin op til stregbredde",
    'Formen bis zu dieser Breite in mm werden als Satin gestickt, breitere als Tatami. Üblich: 7 mm.':
      "Former op til denne bredde i mm broderes som satin, bredere som tatami. Typisk: 7 mm.",
    'Tatami-Winkel': "Tatamivinkel",
    'Stichrichtung der Tatami-Flächen in Grad. Üblich: 45°. Benachbarte Flächen mit unterschiedlichem Winkel wirken lebendiger.':
      "Tatamifladernes stingretning i grader. Typisk: 45°. Nabo-flader med forskellig vinkel virker mere levende.",
    'Hintergrund weglassen': "Udelad baggrund",
    'Die Hintergrundfarbe des Bildes wird nicht gestickt.': "Billedets baggrundsfarve broderes ikke.",
    'Konturen': "Konturer",
    'Zusätzlich einen Laufstich um die Flächen legen – für sauberere Kanten.': "Lægger desuden et løbesting rundt om fladerne – for pænere kanter.",
    'Vorhandene Objekte ersetzen': "Erstat eksisterende objekter",
    'Löscht vorher alle Objekte im Design. Ohne Haken werden die neuen Objekte hinzugefügt.':
      "Sletter først alle objekter i designet. Uden flueben tilføjes de nye objekter.",

    /* Export */
    'Name der Stickdatei und des Designs. Die Endung wird automatisch angehängt.':
      "Navnet på broderifilen og designet. Filtypenavnet tilføjes automatisk.",
    'DST für die Texi 1501 und alle Tajima-kompatiblen Industriemaschinen. PES für Brother, JEF für Janome, EXP für Melco/Bernina.':
      "DST til Texi 1501 og alle Tajima-kompatible industrimaskiner. PES til Brother, JEF til Janome, EXP til Melco/Bernina.",

    /* Drehen / Skalieren */
    'Drehwinkel': "Rotationsvinkel",
    'Dreht die Auswahl um diesen Winkel in Grad im Uhrzeigersinn. Negativ dreht gegen den Uhrzeigersinn.':
      "Roterer markeringen med denne vinkel i grader med uret. Negativ roterer mod uret.",
    'Breite in %': "Bredde i %",
    'Neue Breite in Prozent der bisherigen. Die Stiche werden neu berechnet, die Dichte bleibt gleich.':
      "Ny bredde i procent af den hidtidige. Stingene beregnes igen, tætheden forbliver den samme.",
    'Höhe in %': "Højde i %",
    'Neue Höhe in Prozent der bisherigen. Gleicher Wert wie bei der Breite hält die Proportionen.':
      "Ny højde i procent af den hidtidige. Samme værdi som for bredden bevarer proportionerne.",
  });

  /* =====================================================================
     Stickprüfung (check.js)
     ===================================================================== */
  Object.assign(E.exact, {
    // Maschinenprofile
    'Industriemaschine (Tajima-kompatibel: Texi, Ricoma, Tajima, Barudan, ZSK …)': "Industrimaskine (Tajima-kompatibel: Texi, Ricoma, Tajima, Barudan, ZSK …)",
    'Haushaltsmaschine (Brother, Bernina, Janome, Pfaff, Husqvarna …)': "Hjemmemaskine (Brother, Bernina, Janome, Pfaff, Husqvarna …)",
    // Objektnamen
    'Satinsäule': "Satinsøjle",
    'Satinlinie': "Satinlinje",
    'Fläche': "Flade",
    'Einzelstiche': "Enkeltsting",
    // Meldungen ohne Zahlen
    'Satinsäule viel zu breit': "Satinsøjle alt for bred",
    // Erklärungen
    'Satinstiche sollten quer zur Säule liegen. Fast parallele Stiche decken nicht, liegen lose auf und reißen leicht aus. Die Maschine sticht dabei viele Einstiche fast an dieselbe Stelle.':
      "Satinsting bør ligge på tværs af søjlen. Næsten parallelle sting dækker ikke, ligger løst ovenpå og rives let ud. Maskinen sætter samtidig mange nålestik næsten samme sted.",
    'Die Punktpaare liegen über Kreuz (linke und rechte Seite vertauscht). Die Maschine stickt dort Knoten, der Faden kann reißen.':
      "Punktparrene ligger over kors (venstre og højre side byttet om). Maskinen syr knuder der, og tråden kan knække.",
    'So breite Säulen lassen sich nicht sauber als Satin sticken – besser als Tatami-Fläche anlegen.':
      "Så brede søjler kan ikke broderes pænt som satin – opret dem hellere som tatamiflade.",
    'Der Stichwinkel ergibt sehr lange Satinstiche. Winkel quer zur schmalen Seite drehen, Teilung einschalten oder Tatami verwenden.':
      "Stingvinklen giver meget lange satinsting. Drej vinklen på tværs af den smalle side, slå deling til, eller brug tatami.",
    'Zu viele Einstiche dicht nebeneinander.': "For mange nålestik tæt ved siden af hinanden.",
    'Sehr kurze Stiche erzeugen Fadenbruch und Knötchen. 2–3 mm sind üblich, in engen Kurven 1,5 mm.':
      "Meget korte sting giver trådbrud og små knuder. 2–3 mm er typisk, i snævre kurver 1,5 mm.",
    'Lange Laufstiche liegen lose und bleiben hängen.': "Lange løbesting ligger løst og hænger fast.",
    'Die Maschine kann diese Stiche nicht in einem Schritt sticken; sie werden geteilt oder als Sprung ausgeführt. Satin teilen oder Objekt umbauen.':
      "Maskinen kan ikke brodere disse sting i ét trin; de deles eller udføres som spring. Del satinen, eller byg objektet om.",
    'Viele Einstiche an fast derselben Stelle: Fadenbruch, Vogelnester, Löcher im Stoff.':
      "Mange nålestik næsten samme sted: trådbrud, fuglereder, huller i stoffet.",
    'Der Stoff scheint durch, Satin deckt nicht.': "Stoffet skinner igennem, satinen dækker ikke.",
    'Hier überlappen mehrere Objekte. Die Nadel sticht immer wieder in dieselbe Stelle – Nadelbruch, Fadenbruch und harte Knubbel. Überlappung verkleinern oder unten liegende Bereiche aussparen.':
      "Her overlapper flere objekter. Nålen stikker igen og igen samme sted – nålebrud, trådbrud og hårde klumper. Gør overlappet mindre, eller udspar de underliggende områder.",
    // Korrekturen
    'Stiche quer zur Säule ausrichten': "Ret stingene ind på tværs af søjlen",
    'Auto-Split ab 7 mm einschalten': "Slå auto-split til fra 7 mm",
    'Stichlänge 3,5 mm': "Stinglængde 3,5 mm",
    'Auf Tatami umstellen': "Skift til tatami",
    'Abstand 0,4 mm': "Afstand 0,4 mm",
    'Stichlänge 2 mm': "Stinglængde 2 mm",
    'Stichlänge 3 mm': "Stinglængde 3 mm",
  });

  /* =====================================================================
     Stoffe (fabric.js)
     ===================================================================== */
  const NEEDLES = {
    '75/11 Spitze': "75/11 spids",
    '75/11 Kugelspitze (Ballpoint)': "75/11 kuglespids (ballpoint)",
    '75/11 Kugelspitze': "75/11 kuglespids",
    '90/14 Spitze (Jeans)': "90/14 spids (jeans)",
    '80/12 Ledernadel (Schneidspitze)': "80/12 lædernål (skærespids)",
    '80/12 Spitze': "80/12 spids",
    '65/9 oder 70/10 Microtex': "65/9 eller 70/10 Microtex",
  };
  const TIPS = {
    'Stoff glatt, aber nicht gedehnt einspannen.': "Spænd stoffet glat op, men uden at strække det.",
    'Kein Reißvlies verwenden – der Stoff dehnt sich, das Motiv verzieht sich.': "Brug ikke rivevlies – stoffet strækker sig, og motivet forvrides.",
    'Vlies mit Sprühkleber oder Bügelvlies fixieren, Stoff nicht dehnen.': "Fastgør vliesen med spraylim eller brug strygevlies; stræk ikke stoffet.",
    'Lieber offene, leichte Motive; große Tatamiflächen vermeiden.': "Vælg hellere åbne, lette motiver; undgå store tatamiflader.",
    'Wasserlöslichen Topper oben auflegen, damit die Stiche nicht im Flor versinken.': "Læg vandopløselig topper ovenpå, så stingene ikke synker ned i luven.",
    'Piqué-Struktur: Topper verhindert, dass dünne Stiche in den Waben verschwinden.': "Piqué-struktur: topper forhindrer, at tynde sting forsvinder i vaflerne.",
    'Dicke Nähte nicht unter den Stickbereich legen.': "Læg ikke tykke sømme under broderiområdet.",
    'Jeder Einstich bleibt als Loch sichtbar – weniger Dichte, keine Korrekturen nach dem Sticken.': "Hvert nålestik forbliver synligt som et hul – brug mindre tæthed, ingen rettelser efter broderingen.",
    'Leder nicht einspannen (Abdrücke!), sondern auf eingespanntes Klebevlies legen oder mit Klebeband fixieren.': "Spænd ikke læder op (rammemærker!), men læg det på opspændt klæbevlies, eller fastgør det med tape.",
    'Kein Sprühkleber auf Glattleder.': "Ingen spraylim på glat læder.",
    'Wasserlöslicher Topper ist Pflicht, sonst verschwindet die Stickerei in den Schlingen.': "Vandopløselig topper er et must, ellers forsvinder broderiet i løkkerne.",
    'Sehr feine Linien und Schrift unter 6 mm vermeiden.': "Undgå meget fine linjer og skrift under 6 mm.",
    'Von der Mitte nach außen und von unten nach oben sticken (Reihenfolge prüfen).': "Brodér fra midten og udad og nedefra og op (kontrollér rækkefølgen).",
    'Kappenrahmen auf der Texi verwenden.': "Brug kasketrammen på Texi.",
    'Leichte Motive wählen, dichte Flächen ziehen den Stoff zusammen.': "Vælg lette motiver; tætte flader trækker stoffet sammen.",
    'Möglichst wenige Einstiche – Membran wird sonst undicht.': "Så få nålestik som muligt – ellers bliver membranen utæt.",
    'Topper auflegen, Mütze nicht dehnen.': "Læg topper på, og stræk ikke huen.",
    'Für Aufnäher: Satinrand mindestens 3 mm breit.': "Til mærker: satinkant mindst 3 mm bred.",
  };
  const WARN = {
    'Für Leder sehr dicht – Gefahr, dass das Leder ausreißt.': "Meget tæt til læder – risiko for, at læderet rives i stykker.",
    'Große Füllflächen auf dehnbarem Stoff werden steif und können wellen.': "Store fyldflader på elastisk stof bliver stive og kan slå bølger.",
  };
  Object.assign(E.exact, NEEDLES, TIPS, WARN, {
    // Stoffnamen
    'Baumwolle gewebt (Hemd, Tasche, Schürze)': "Vævet bomuld (skjorte, taske, forklæde)",
    'T-Shirt / Jersey (dünner Strick)': "T-shirt / jersey (tynd strik)",
    'Sweatshirt / Hoodie / Fleece': "Sweatshirt / hættetrøje / fleece",
    'Polo / Piqué': "Polo / piqué",
    'Jeans / Denim / Canvas': "Jeans / denim / canvas",
    'Leder / Kunstleder': "Læder / kunstlæder",
    'Frottee / Handtuch / Bademantel': "Frotté / håndklæde / badekåbe",
    'Kappe / Basecap': "Kasket / baseballkasket",
    'Seide / Satin / feine Stoffe': "Silke / satin / fine stoffer",
    'Softshell / Nylon / Jacken': "Softshell / nylon / jakker",
    'Strick / Mütze (Beanie)': "Strik / hue (beanie)",
    'Filz / Aufnäher-Basis': "Filt / basis til mærker",
    // Vlies-Arten
    'Reißvlies (Tearaway)': "Rivevlies (tearaway)",
    'Schneidvlies (Cutaway) oder No-Show-Mesh': "Klippevlies (cutaway) eller no-show-mesh",
    'Schneidvlies (Cutaway)': "Klippevlies (cutaway)",
    'Schneidvlies / No-Show-Mesh': "Klippevlies / no-show-mesh",
    'Cap-Reißvlies (fest)': "Rivevlies til kasketter (fast)",
    'Leichtes Schneidvlies (No-Show-Mesh) oder wasserlösliches Gewebevlies': "Let klippevlies (no-show-mesh) eller vandopløseligt fibervlies",
    // Vlies-Gewicht
    'mittel, ca. 60–80 g/m²': "middel, ca. 60–80 g/m²",
    'ca. 2,5 oz / 75 g/m²': "ca. 2,5 oz / 75 g/m²",
    'ca. 2,5–3 oz': "ca. 2,5–3 oz",
    'ca. 2,5 oz': "ca. 2,5 oz",
    'mittel bis fest, 80–100 g/m²': "middel til kraftig, 80–100 g/m²",
    'mittel': "middel",
    'fest, ca. 100 g/m²': "kraftig, ca. 100 g/m²",
    'leicht': "let",
    // Topper
    'Ja – wasserlöslicher Topper (z. B. Solvy) oben auflegen': "Ja – læg vandopløselig topper (f.eks. Solvy) ovenpå",
    'nicht nötig': "ikke nødvendig",
    // Begründung für mehr Lagen
    'dehnbarer Stoff mit Füllflächen': "elastisk stof med fyldflader",
  });
  // Nadel steht in der Seitenleiste als „75/11 Spitze · “ vor „max.“
  for (const k of Object.keys(NEEDLES)) E.exact[k + ' ·'] = NEEDLES[k] + ' ·';

  /* =====================================================================
     Stickrahmen (hoops.js)
     ===================================================================== */
  Object.assign(E.exact, {
    'Texi Großrahmen 540 × 350 mm (max. Feld)': "Texi stor ramme 540 × 350 mm (maks. felt)",
    'Texi Rahmen 290 × 290 mm': "Texi ramme 290 × 290 mm",
    'Texi rund Ø 200 mm': "Texi rund Ø 200 mm",
    'Texi rund Ø 150 mm': "Texi rund Ø 150 mm",
    'Texi rund Ø 120 mm': "Texi rund Ø 120 mm",
    'Texi rund Ø 90 mm': "Texi rund Ø 90 mm",
    'Kappe 270° (ca. 360 × 75 mm)': "Kasket 270° (ca. 360 × 75 mm)",
    'Schlauchrahmen rund 9 cm': "Rørramme rund 9 cm",
    'Schlauchrahmen rund 12 cm': "Rørramme rund 12 cm",
    'Schlauchrahmen rund 15 cm': "Rørramme rund 15 cm",
    'Schlauchrahmen rund 18 cm': "Rørramme rund 18 cm",
    'Schlauchrahmen rund 21 cm': "Rørramme rund 21 cm",
    'Vierkant 24 × 24 cm': "Firkantet 24 × 24 cm",
    'Vierkant 30 × 30 cm': "Firkantet 30 × 30 cm",
    'Vierkant 36 × 36 cm': "Firkantet 36 × 36 cm",
    'Brusttasche / Clip 10 × 7 cm': "Brystlomme / clip 10 × 7 cm",
    // Gruppen
    'Industrie (Tajima-kompatibel, Richtwerte)': "Industri (Tajima-kompatibel, vejledende mål)",
    'Haushaltsmaschinen (Richtwerte)': "Hjemmemaskiner (vejledende mål)",
    'Sonstiges': "Andet",
    'kein Rahmen': "ingen ramme",
    'Eigene Rahmen': "Egne rammer",
  });

  /* =====================================================================
     Hüllformen (textfx.js), Dateiformate und Fehlermeldungen
     ===================================================================== */
  Object.assign(E.exact, {
    'keine': "ingen",
    'Bogen (ganz)': "Bue (hel)",
    'Brücke (oben gewölbt)': "Bro (hvælvet foroven)",
    'Tal (unten gewölbt)': "Dal (hvælvet forneden)",
    'Welle': "Bølge",
    'Wimpel': "Vimpel",
    'Raute': "Rombe",
    'Wölbung': "Hvælving",
    'Taille': "Talje",
    // formats.js
    'PES Version 1 mit PEC-Block (Brother, Babylock, Bernette)': "PES version 1 med PEC-blok (Brother, Babylock, Bernette)",
    'Janome/Elna/Kenmore, Rahmen wird automatisch gewählt': "Janome/Elna/Kenmore, rammen vælges automatisk",
    'Melco/Bernina Expanded, ohne Farbinformation': "Melco/Bernina Expanded, uden farveinformation",
    'PES: zu viele Farbwechsel': "PES: for mange farveskift",
    'Keine PES-Datei': "Ikke en PES-fil",
    // vector.js
    'Keine gültige SVG-Datei': "Ikke en gyldig SVG-fil",
    // inkfont.js
    'kein Browser': "ingen browser",
  });

  /* =====================================================================
     Texte mit Zahlen (rx). Meldungen der Stickprüfung stehen im Dialog mit „⚠ “ bzw. „⛔ “ davor,
     Stoff-Hinweise mit „⚠ “ – das Präfix wird mitgenommen.
     ===================================================================== */
  // Zahlen der Stickprüfung kommen deutsch formatiert („0,35“) – im Dänischen gilt dasselbe Format, also unverändert
  const dec = (v) => v;
  // Ersatztext mit $1…$n; Zahlengruppen werden dabei auf Dezimalpunkt umgestellt
  const fill = (rep, gs, conv) => rep.replace(/\$(\d)/g, (m, d) => { const v = gs[+d - 1]; return v === undefined ? '' : conv(v); });
  const R = (re, rep, conv = dec) => [re, (m, ...gs) => fill(rep, gs, conv)];
  // Wie R, aber mit optionalem „⚠ “/„⛔ “ davor (Meldungen im Prüfdialog); body ohne ^/$
  const P = (body, rep) => [new RegExp('^((?:⚠|⛔) )?' + body.source + '$'), (m, pre, ...gs) => (pre || '') + fill(rep, gs, dec)];
  // deutsche Tausenderpunkte („16.000“) gelten auch im Dänischen – unverändert
  const thou = (v) => v;
  E.rx.push(
    /* --- Stickprüfung: Meldungen --- */
    P(/Stichwinkel fast parallel zur Säule \((\d+) % der Stiche\)/, 'Stingvinkel næsten parallel med søjlen ($1 % af stingene)'),
    P(/Säule verdreht – (\d+) Stiche überkreuzen sich/, 'Søjle snoet – $1 sting krydser hinanden'),
    P(/Satin ([\d.,]+) mm breit, ohne Teilung/, 'Satin $1 mm bred, uden deling'),
    P(/Satin stellenweise nur ([\d.,]+) mm breit/, 'Satin visse steder kun $1 mm bred'),
    P(/Fläche zu dicht \(Abstand ([\d.,]+) mm\)/, 'Flade for tæt (afstand $1 mm)'),
    P(/Tatami-Stiche ([\d.,]+) mm lang/, 'Tatamisting $1 mm lange'),
    P(/Satin-Fläche mit bis zu ([\d.,]+) mm langen Stichen/, 'Satinflade med op til $1 mm lange sting'),
    P(/Satin-Fläche zu dicht \(([\d.,]+) mm\)/, 'Satinflade for tæt ($1 mm)'),
    P(/Laufstich nur ([\d.,]+) mm lang/, 'Løbesting kun $1 mm langt'),
    P(/Laufstich ([\d.,]+) mm lang/, 'Løbesting $1 mm langt'),
    P(/(\d+) Stich\(e\) länger als ([\d.,]+) mm/, '$1 sting længere end $2 mm'),
    P(/(\d+) sehr kurze Stiche \(< ([\d.,]+) mm\)/, '$1 meget korte sting (< $2 mm)'),
    P(/Satin zu dicht \(Abstand ([\d.,]+) mm\)/, 'Satin for tæt (afstand $1 mm)'),
    P(/Satin sehr offen \(Abstand ([\d.,]+) mm\)/, 'Satin meget åben (afstand $1 mm)'),
    P(/(\d+) Stelle\(n\) mit zu vielen Stichlagen übereinander \(bis (\d+) Einstiche auf 4 mm²\)/,
      '$1 sted(er) med for mange stinglag oven på hinanden (op til $2 nålestik pr. 4 mm²)'),
    /* --- Stickprüfung: Erklärungen mit Grenzwerten --- */
    R(/^Satinstiche über ([\d.,]+) mm hängen lose durch, bleiben hängen und verziehen den Stoff\. Teilung \(Auto-Split\) einschalten oder als Fläche sticken\.$/,
      'Satinsting over $1 mm hænger løst, sætter sig fast og forvrider stoffet. Slå deling (auto-split) til, eller brodér som flade.'),
    R(/^Unter ([\d.,]+) mm stechen die Nadeln fast in dasselbe Loch: Fadenbruch und Löcher im Stoff\. Säule verbreitern oder als Laufstich sticken\.$/,
      'Under $1 mm stikker nålen næsten i samme hul: trådbrud og huller i stoffet. Gør søjlen bredere, eller brodér den som løbesting.'),
    R(/^Unter ([\d.,]+) mm Reihenabstand wird die Fläche hart wie ein Brett, Nadel und Faden brechen leichter, der Stoff zieht sich zusammen\.$/,
      'Under $1 mm rækkeafstand bliver fladen hård som et bræt, nål og tråd knækker lettere, og stoffet trækker sig sammen.'),
    R(/^Lange Flächenstiche über ([\d.,]+) mm liegen lose und bleiben hängen\.$/, 'Lange fladesting over $1 mm ligger løst og hænger fast.'),
    R(/^Unter ([\d.,]+) mm stapeln sich die Fäden: harte Stickerei, Fadenbruch, Nadelbruch, gewellter Stoff\.$/,
      'Under $1 mm hober trådene sig op: hårdt broderi, trådbrud, nålebrud, bølget stof.'),
    /* --- Stickprüfung: Korrekturen --- */
    R(/^Abstand auf ([\d.,]+) mm setzen$/, 'Sæt afstanden til $1 mm'),

    /* --- Stoff: Hinweise zum Motiv und Begründungen --- */
    P(/(\d+) Satinsäule\(n\) schmaler als ([\d.,]+) mm – auf diesem Stoff kaum sichtbar\./, '$1 satinsøjle(r) smallere end $2 mm – næsten usynlig på dette stof.'),
    P(/(\d+) Satinsäule\(n\) breiter als 10 mm – lieber als Fläche \(Tatami\) sticken\./, '$1 satinsøjle(r) bredere end 10 mm – brodér hellere som flade (tatami).'),
    R(/^viele Stiche \(([\d.,]+)\)$/, 'mange sting ($1)', thou),
    R(/^dichtes Motiv \((\d+) Stiche\/cm²\)$/, 'tæt motiv ($1 sting/cm²)'),
    R(/^große Füllflächen \((\d+) cm²\)$/, 'store fyldflader ($1 cm²)'),

    /* --- Fehlermeldungen (vector.js, formats.js, inkfont.js) --- */
    [/^Laden fehlgeschlagen: (.+)$/, 'Indlæsning mislykkedes: $1'],
    [/^Unbekanntes Format: (.+)$/, 'Ukendt format: $1'],
    [/^Schrift nicht gefunden: (.+)$/, 'Skrifttype ikke fundet: $1'],

    /* --- Zusammengesetzte Texte: Teile einzeln übersetzen --- */
    // Vlies-Empfehlung „2 × Schneidvlies (Cutaway) (ca. 2,5 oz)“
    [/^(\d) × (.+) \(([^()]+)\)$/, (m, n, art, gew) => n + ' × ' + T(art) + ' (' + T(gew) + ')'],
    // „Mehr Lagen wegen: viele Stiche (16.000), dehnbarer Stoff mit Füllflächen“
    [/^Mehr Lagen wegen: (.+)$/, (m, s) => 'Flere lag på grund af: ' + s.split(', ').map(T).join(', ')],
    // Korrektur-Knopf „Korrigieren: Abstand 0,4 mm“
    [/^Korrigieren: (.+)$/, (m, s) => 'Ret: ' + T(s)],
    // Aufzählungen „⚠ …“, „⛔ …“, „• …“ (Stoff-Hinweise, Tipps)
    [/^(⚠|⛔|•) (.+)$/, (m, p, s) => p + ' ' + T(s)],
  );
})(typeof window !== 'undefined' ? window : globalThis);
