/* Hilfetexte für die Felder in den Dialogen (Mouse-Over-Infos). */
(function (g) {
  const HW = (g.HW = g.HW || {});
  HW.HELP = HW.HELP || {};
  Object.assign(HW.HELP, {
    /* ---------- Stickprüfung ---------- */
    'id:noPop': ['Hinweise nicht aufklappen', 'Ein Haken schaltet das automatische Fenster bei Problemen ab. Die Prüfung läuft trotzdem weiter und zeigt ihr Ergebnis unten in der Statusleiste.'],

    /* ---------- Stoff (Seitenleiste) ---------- */
    'id:fabDetails': ['Stoff-Details', 'Zeigt alle Empfehlungen für den gewählten Stoff: Vlies, Topper, Nadel, Geschwindigkeit und welche Stichwerte automatisch angepasst werden.'],
    'id:fabKnock': ['Knockdown-Stich hinzufügen', 'Bei Stoffen mit Flor (Frottee, Fleece, Strick, Piqué) drückt ein lockeres Gitter unter dem Motiv die Schlaufen flach, damit feine Details nicht versinken.'],

    /* ---------- Kopien anordnen ---------- */
    'id:arKind': ['Art der Anordnung', 'Kreis: Kopien gleichmäßig rundherum verteilt (z. B. Blütenblätter). Raster: Kopien in Reihen und Spalten (z. B. mehrere Abzeichen auf einem Stoffstück).'],
    'id:arN': ['Anzahl im Kreis', 'Wie viele Exemplare insgesamt entstehen – das Original zählt mit. Erlaubt sind 2 bis 72.'],
    'id:arR': ['Kreis-Radius', 'Abstand vom Mittelpunkt bis zu den Kopien in mm. Das Original wird dabei oben auf den Kreis gesetzt. Bei 0 bleibt es, wo es ist.'],
    'id:arM': ['Kreis-Mittelpunkt', 'Rahmenmitte: Kreis um die Mitte des Stickrahmens. „Unter der Auswahl“: Der Mittelpunkt liegt genau um den Radius unterhalb des Originals.'],
    'id:arRot': ['Kopien mitdrehen', 'Mit Haken zeigt jede Kopie zur Kreismitte (wie Speichen). Ohne Haken bleiben alle Kopien aufrecht, nur ihre Position wandert im Kreis.'],
    'id:arCols': ['Spalten', 'Anzahl der Exemplare nebeneinander (waagrecht), inklusive Original.'],
    'id:arRows': ['Reihen', 'Anzahl der Exemplare untereinander (senkrecht), inklusive Original.'],
    'id:arDx': ['Abstand waagrecht', 'Lücke in mm zwischen den Kopien nebeneinander – gemessen von Kante zu Kante, nicht von Mitte zu Mitte.'],
    'id:arDy': ['Abstand senkrecht', 'Lücke in mm zwischen den Reihen – gemessen von Kante zu Kante.'],

    /* ---------- Hilfslinien ---------- */
    'id:gdSnap': ['Einrasten', 'Punkte springen beim Zeichnen und Verschieben auf das Raster und an Hilfslinien. Praktisch für gerade, exakt ausgerichtete Formen.'],
    'id:gdStep': ['Rasterweite', 'Abstand der Rasterpunkte in mm, an denen eingerastet wird. Üblich: 1–5 mm; kleiner für feine Arbeiten.'],
    'id:gdAxis': ['Richtung der Hilfslinie', 'Senkrecht: Linie bei einem festen X-Wert. Waagrecht: Linie bei einem festen Y-Wert. Hilfslinien werden nicht gestickt.'],
    'id:gdPos': ['Position der Hilfslinie', 'Lage der neuen Linie in mm, gemessen von der Rahmenmitte (0). Feld leer lassen, wenn keine neue Linie angelegt werden soll.'],

    /* ---------- Farbe bearbeiten ---------- */
    'id:cHex': ['Farbe', 'Bildschirmfarbe dieses Garns. Wird sie von Hand geändert, wird die Zuordnung zur Garnnummer gelöscht.'],
    'id:cName': ['Name / Garnnummer', 'Freier Name der Farbe, z. B. „Madeira 1800 Rot“. Erscheint auf dem Arbeitsblatt, damit an der Maschine das richtige Garn eingefädelt wird.'],
    'id:cNeedle': ['Nadel', 'Auf welcher Nadel (1–15) dieses Garn an der Mehrnadelmaschine liegt. Bei Einnadel-Maschinen ohne Bedeutung.'],
    'id:cBrand': ['Garnmarke', 'Hersteller, aus dessen Farbkarte unten ein Garn gewählt wird (z. B. Madeira, Isacord). Ohne Suche erscheinen die 24 ähnlichsten Garne.'],
    'id:cFind': ['Garn suchen', 'Nach Garnnummer oder Farbname suchen, z. B. „1800“ oder „rot“. Deutsche Farbwörter werden ebenfalls erkannt.'],

    /* ---------- Teamnamen ---------- */
    'id:tmGrp': ['Platzhalter-Text', 'Das Textobjekt im Design, das gegen jeden Namen der Liste ausgetauscht wird. Schrift, Größe und Lage bleiben erhalten.'],
    'id:tmList': ['Namensliste', 'Ein Name pro Zeile, z. B. „MÜLLER 10“. Für jede Zeile entsteht eine eigene Stickdatei.'],
    'id:tmMax': ['Höchstbreite', 'Zu lange Namen werden auf diese Breite in mm verkleinert, damit sie z. B. zwischen die Schulterblätter passen. 0 = Größe nie ändern.'],
    'id:tmFmt': ['Dateiformat', 'Format der Stickdateien. DST für Tajima-kompatible Industriemaschinen, PES für Brother, JEF für Janome, EXP für Melco/Bernina.'],
    'id:tmBase': ['Dateiname', 'Anfang der Dateinamen. An ihn wird jeweils der Name angehängt, z. B. „Trikot_MÜLLER 10.dst“.'],

    /* ---------- Mehrfach-Einspannung ---------- */
    'id:mhHoop': ['Rahmen je Einspannung', 'Der Rahmen, mit dem jedes Teilstück gestickt wird. Nur eckige Rahmen sind möglich. Je größer der Rahmen, desto weniger Einspannungen.'],
    'id:mhOv': ['Überlappung', 'So viele mm überlappen sich benachbarte Teilstücke. Hier sitzen die Passmarken. Üblich: 15–25 mm.'],
    'id:mhReg': ['Passmarken', 'Kleine Kreuze im Überlappungsbereich: am Ende einer Einspannung und am Anfang der nächsten gestickt, um den Stoff exakt auszurichten. Danach entfernen.'],
    'id:mhFmt': ['Dateiformat', 'Format der Stickdateien je Einspannung. DST für Tajima-kompatible Maschinen, PES für Brother, JEF für Janome, EXP für Melco/Bernina.'],

    /* ---------- Produkt-Vorschau ---------- */
    'id:mkP': ['Produkt', 'Kleidungsstück oder Artikel, auf dem das Design in der Vorschau gezeigt wird.'],
    'id:mkS': ['Platzierung', 'Stelle auf dem Produkt, z. B. linke Brust oder Rücken. Die Auswahl hängt vom gewählten Produkt ab.'],
    'id:mkC': ['Stofffarbe', 'Farbe des Produkts in der Vorschau – zeigt, wie die Garnfarben auf dem Stoff wirken.'],

    /* ---------- Preiskalkulation ---------- */
    'id:pcM': ['Berechnungsart', 'Nach Stichzahl: Preis je 1000 Stiche plus Farbaufschlag. Nach Maschinenzeit: Stundensatz mal geschätzter Laufzeit inkl. Farbwechsel und Einspannen.'],
    'id:pcK': ['Preis je 1000 Stiche', 'Gilt bei Berechnung nach Stichzahl. Üblich sind etwa 0,50–1,50 € je 1000 Stiche, je nach Region und Menge.'],
    'id:pcH': ['Stundensatz Maschine', 'Kosten einer Maschinenstunde in €. Gilt nur bei Berechnung nach Maschinenzeit.'],
    'id:pcC': ['Aufschlag je Farbe', 'Zuschlag in € pro Garnfarbe im Design (für Farbwechsel). Gilt bei Berechnung nach Stichzahl.'],
    'id:pcMin': ['Mindestpreis je Stück', 'Untergrenze für den Stickpreis pro Stück – greift bei sehr kleinen Motiven. Textil kommt danach noch dazu.'],
    'id:pcHoop': ['Einspannzeit je Stück', 'Minuten für Einspannen und Ausspannen pro Stück. Fließt in die Maschinenzeit ein. Üblich: 1–2 min.'],
    'id:pcG': ['Textil je Stück', 'Preis des Kleidungsstücks in €, wenn Sie es liefern. 0, wenn der Kunde die Textilien selbst mitbringt (beistellt).'],
    'id:pcS': ['Einrichtung je Auftrag', 'Einmalige Kosten pro Auftrag für Einrichten der Maschine, Garn einfädeln und Probestick – unabhängig von der Stückzahl.'],
    'id:pcD': ['Digitalisierung', 'Einmaliger Preis für das Erstellen der Stickdatei. 0, wenn nicht berechnet.'],
    'id:pcT': ['Mengenrabatt', 'Staffel als „Stück:Prozent“, durch Komma getrennt, z. B. „1:0, 10:5, 50:15“. Jeder Eintrag ergibt eine Zeile in der Preistabelle.'],
    'id:pcV': ['Mehrwertsteuer', 'Steuersatz in % für die Brutto-Preise. In Deutschland üblich: 19 %.'],

    /* ---------- Bibliothek ---------- */
    'id:lbN': ['Name', 'Unter diesem Namen erscheint das Design in der Bibliothek. Er wird auch als Projektname übernommen.'],
    'id:lbT': ['Stichworte', 'Begriffe zum späteren Wiederfinden, durch Komma getrennt, z. B. „Logo, Verein, Kappe“.'],
    'id:lbK': ['Kunde', 'Für wen das Design ist. Danach lässt sich in der Bibliothek suchen.'],
    'id:lbQ': ['Bibliothek durchsuchen', 'Filtert die Designs nach Name, Stichwort oder Kunde.'],
    'id:lbSort': ['Sortierung', 'Reihenfolge der Designs: neueste zuerst, alphabetisch nach Name oder nach Stichzahl.'],
    'id:lbAdd': ['Aktuelles Design speichern', 'Legt das gerade geöffnete Design in der Bibliothek ab. Die Bibliothek liegt nur in diesem Browser – zusätzlich als Projektdatei sichern.'],

    /* ---------- Applikation ---------- */
    'id:apTack': ['Heftstich', 'Hält den aufgelegten Applikationsstoff fest, bevor er zugeschnitten wird. Zickzack hält gut, Doppel-Laufstich ist unauffällig, E-Stich liegt dazwischen.'],
    'id:apCover': ['Abdeckung', 'Stich, der die Schnittkante des Stoffes verdeckt. Satin: klassischer, glänzender Rand. E-Stich (Langette): leichter, dekorativer Rand.'],
    'id:apW': ['Breite der Abdeckung', 'Breite des Randstichs in mm. Breiter verdeckt unsauber geschnittene Kanten besser. Üblich: 3–4 mm.'],
    'id:apHoles': ['Löcher einfassen', 'Auch innere Aussparungen der Form (z. B. das Loch im „O“) bekommen Platzierung, Heftstich und Abdeckung.'],
    'id:apCol': ['Eigene Farbe für Abdeckung', 'Die Abdeckung wird in der aktuell gewählten Palettenfarbe gestickt statt in der Farbe der Form – z. B. ein dunkler Rand um hellen Stoff.'],

    /* ---------- Knockdown ---------- */
    'id:kdM': ['Rand um das Motiv', 'So weit in mm ragt das Knockdown-Gitter über das Motiv hinaus. Üblich: 1–2 mm.'],
    'id:kdS': ['Gitterabstand', 'Abstand der Gitterlinien in mm. Kleiner drückt den Flor stärker, braucht aber mehr Stiche. Üblich: 1,5–2 mm.'],
    'id:kdA': ['Gitterwinkel', 'Richtung der Gitterlinien in Grad. Meist 45°.'],
    'id:kdC': ['Farbe des Knockdowns', 'Am besten Stofffarbe – dann ist das Gitter unsichtbar. Dafür wird eine neue Palettenfarbe in Stofffarbe angelegt.'],

    /* ---------- Kappe ---------- */
    'id:cpCol': ['Farbreihenfolge behalten', 'Mit Haken bleiben die Farben in ihrer Reihenfolge und nur innerhalb jeder Farbe wird von der Mitte nach außen sortiert. Ohne Haken gibt es mehr Farbwechsel.'],
    'id:cpHoop': ['Kappenrahmen und Stoff wählen', 'Stellt zusätzlich einen Kappenrahmen und den Stoff „Kappe“ ein, damit Dichte und Zugausgleich passen.'],

    /* ---------- Garnmarke ---------- */
    'id:tbBrand': ['Garnmarke', 'Jede Palettenfarbe bekommt das ähnlichste Garn dieser Marke. Die Tabelle zeigt vorher, wie gut es passt (ΔE = Farbabstand).'],
    'id:tbAuto': ['Neue Farben automatisch zuordnen', 'Farben aus Import und Auto-Digitalisieren bekommen gleich das nächste Garn der gewählten Marke.'],

    /* ---------- Buchstaben einzeln ---------- */
    'id:gk': ['Abstand davor', 'Verschiebt diesen Buchstaben und alle folgenden waagrecht (Kerning) in mm. Negativ rückt näher zusammen.'],
    'id:gx': ['X verschieben', 'Verschiebt nur diesen Buchstaben waagrecht in mm. Positiv = nach rechts.'],
    'id:gy': ['Y verschieben', 'Verschiebt nur diesen Buchstaben senkrecht in mm. Positiv = nach oben.'],
    'id:gr': ['Buchstabe drehen', 'Dreht nur diesen Buchstaben um den angegebenen Winkel in Grad.'],
    'id:gs': ['Buchstabengröße', 'Größe dieses Buchstabens in Prozent. 100 = unverändert, z. B. 70 für kleinere Seitenbuchstaben im Monogramm.'],

    /* ---------- Text auf Linie ---------- */
    'id:opSide': ['Seite', 'Ob der Text oberhalb oder unterhalb der Linie steht – unterhalb z. B. für Schrift unten an einem Kreis.'],
    'id:opAl': ['Ausrichtung', 'Wo der Text auf der Linie sitzt: mittig, am Anfang oder am Ende der Linie.'],
    'id:opOff': ['Verschieben entlang der Linie', 'Schiebt den Text in mm an der Linie entlang, z. B. um ihn auf einem Kreis zu drehen.'],
    'id:opLine': ['Linie danach', 'Was mit der Führungslinie passiert: ausblenden (wird nicht gestickt), mitsticken (als Zierlinie) oder ganz löschen.'],

    /* ---------- Monogramm ---------- */
    'id:mnT': ['Initialen', '2 bis 3 Buchstaben für das Monogramm, z. B. „ABC“.'],
    'id:mnK': ['Vorlage', 'Klassisch: mittlerer Buchstabe groß (bei 3 Buchstaben). Kreis, Raute oder Linien fügen einen gestickten Rahmen aus Satin hinzu.'],
    'id:mnF': ['Schrift', 'Fertig digitalisierte Stickschrift. Monogramm- und Serifenschriften stehen oben in der Liste.'],
    'id:mnH': ['Höhe', 'Höhe der Buchstaben in mm. Üblich: 20–40 mm für Handtücher oder Hemden.'],
    'id:mnW': ['Breite der Umrandung', 'Breite der Satinlinie für Kreis, Raute oder Linien in mm. Üblich: 2–3 mm.'],

    /* ---------- Text ---------- */
    'id:tText': ['Text', 'Der zu stickende Text, z. B. ein Name oder Vereinsname.'],
    'id:tFont': ['Schriftart', 'Stickschriften sind fertig digitalisiert und sticken am saubersten. Andere Schriften werden automatisch in Satin umgewandelt.'],
    'id:tH': ['Höhe Großbuchstaben', 'Höhe der Großbuchstaben in mm. Satinschrift unter ca. 5 mm wird unleserlich. Bei Stickschriften wird die empfohlene Größe vorgeschlagen.'],
    'id:tSp': ['Zeichenabstand', 'Zusätzlicher Abstand zwischen den Buchstaben in %. Negativ rückt sie enger zusammen.'],
    'id:tArc': ['Bogen-Radius', 'Legt den Text auf einen Kreisbogen mit diesem Radius in mm. 0 = gerade, negativ = Bogen nach unten (Text unten am Kreis).'],
    'id:tEnv': ['Hüllform', 'Verzerrt den ganzen Schriftzug in eine Form, z. B. Brücke, Welle oder Wimpel – typisch für Vereinslogos.'],
    'id:tEnvA': ['Stärke der Hüllform', 'Wie stark die Hüllform den Text verbiegt, in mm. Üblich: 3–10 mm.'],
    'id:tPath': ['Text auf Linie', 'Der Text folgt einer Linie. „Von der Linie lösen“ setzt ihn wieder gerade.'],
    'id:tType': ['Stichart', 'Satin: glänzend, folgt Kurven – ideal für Schrift. Tatami: flächige Füllung für sehr große Buchstaben. Automatisch: breite Teile werden Tatami.'],
    'id:tBold': ['Fett', 'Macht die Buchstaben künstlich dicker. Nur bei automatisch umgewandelten Schriften.'],
    'id:tItalic': ['Kursiv', 'Neigt die Buchstaben künstlich schräg. Nur bei automatisch umgewandelten Schriften.'],

    /* ---------- Stickrahmen ---------- */
    'id:hSel': ['Aktiver Rahmen', 'Der Stickrahmen, in dem gestickt wird. Er bestimmt das nutzbare Stickfeld und den Prüfbereich.'],
    'id:hCenter': ['In Rahmenmitte setzen', 'Verschiebt das ganze Design so, dass seine Mitte genau in der Rahmenmitte liegt.'],
    'id:hFit': ['In Rahmen einpassen', 'Vergrößert oder verkleinert das Design so, dass es das Stickfeld des Rahmens ausfüllt, und setzt es in die Mitte.'],
    'id:hName': ['Rahmenname', 'Name für den eigenen Rahmen, z. B. „Rundrahmen 20 cm“. Bleibt leer, wird ein Name aus den Maßen gebildet.'],
    'id:hShape': ['Rahmenform', 'Form des Stickfelds: rund, eckig oder oval.'],
    'id:hW': ['Breite / Durchmesser', 'Nutzbare Breite des Stickfelds in mm, bei runden Rahmen der Durchmesser. Innenmaß messen, nicht die Außenkante.'],
    'id:hH': ['Höhe', 'Nutzbare Höhe des Stickfelds in mm. Nur bei eckigen und ovalen Rahmen.'],
    'id:hM': ['Sicherheitsabstand', 'Abstand zum Rahmenrand in mm, in dem nicht gestickt werden sollte, damit der Fuß nicht an den Rahmen stößt. Üblich: 5 mm.'],
    'id:hAdd': ['Rahmen anlegen', 'Speichert den eigenen Rahmen mit diesen Maßen und wählt ihn gleich aus.'],

    /* ---------- Vektorimport ---------- */
    'id:vW': ['Breite im Stickmotiv', 'Gewünschte Breite des Motivs in mm. Die Höhe passt sich an. Der Höchstwert für den Rahmen steht daneben.'],
    'id:vSat': ['Schmale Formen als Satin', 'Formen bis zu dieser Strichbreite in mm werden als Satin gestickt, breitere als Tatami-Fläche. Üblich: 7 mm; 0 = nie Satin.'],
    'id:vWhite': ['Weiße Flächen weglassen', 'Weiße Flächen sind meist Hintergrund und werden nicht gestickt. Haken entfernen, wenn Weiß wirklich gestickt werden soll.'],
    'id:vStroke': ['Konturen übernehmen', 'Linien der Grafik werden als Laufstich oder Satinlinie übernommen. Ohne Haken nur die Flächen.'],
    'id:vOver': ['Überlappungen entfernen', 'Verdeckte Teile unten liegender Flächen werden ausgeschnitten. So liegen keine Stiche doppelt übereinander und das Motiv wird nicht zu dick.'],

    /* ---------- Maschine & Rahmen ---------- */
    'id:mType': ['Maschinentyp', 'Legt die Grenzwerte für die Stickprüfung fest. Industriemaschinen vertragen etwas breitere Satins und dichtere Stiche als Haushaltsmaschinen.'],
    'id:mMax': ['Längster Stich', 'Längere Stiche meldet die Stickprüfung als Problem. Lange Stiche bleiben leicht hängen. Üblich: 12 mm.'],
    'id:mMin': ['Kürzester Stich', 'Kürzere Stiche meldet die Prüfung – sie führen zu Fadenrissen und Knoten. Üblich: 0,3–0,4 mm.'],
    'id:mSat': ['Satin ohne Teilung', 'Breitere Satinstiche ohne Teilung (Split) meldet die Prüfung, weil sie locker durchhängen. Üblich: 8–10 mm.'],
    'id:mSp': ['Satin-Abstand mindestens', 'Dichtere Satins meldet die Prüfung – sie werden zu hart und können Nadeln brechen lassen. Üblich: 0,3 mm.'],
    'id:mPop': ['Pop-up bei Problemen', 'Zeigt nach Änderungen automatisch ein Fenster, wenn die Stickprüfung Probleme findet. Ohne Haken nur der Hinweis in der Statusleiste.'],
    'id:mFabric': ['Stofffarbe', 'Hintergrundfarbe der Arbeitsfläche, damit die Garnfarben wie auf dem echten Stoff wirken. Wird auch für den Knockdown-Stich verwendet.'],
    'id:mRoute': ['Ein-/Ausstieg automatisch', 'Start- und Endpunkte der Objekte werden so gewählt, dass die Wege zum nächsten Objekt möglichst kurz sind – weniger Sprünge und Schnitte.'],
    'id:mTravel': ['Versteckte Laufwege', 'Statt Fadenschnitt läuft der Faden als Laufstich unter einer später gestickten Fläche gleicher Farbe zum nächsten Objekt. Spart Zeit und Schnitte.'],
    'id:mTrim': ['Direkt als Stich verbinden', 'Liegen zwei Objekte näher als dieser Abstand in mm, wird einfach weitergestickt – ohne Sprung oder Schnitt. Üblich: 2 mm.'],
    'id:mJumpMax': ['Springen ohne Schnitt bis', 'Bis zu diesem Abstand springt die Nadel ohne Fadenschnitt; der lose Faden (Sprungstich) muss später abgeschnitten werden. 0 = immer schneiden.'],
    'id:mLockJump': ['Vernähen bei Sprüngen', 'Auch vor und nach einem Sprung ohne Schnitt werden kleine Vernähstiche gesetzt, damit sich nichts aufzieht. Empfohlen: an.'],
    'id:mLock': ['Vernähen', 'Setzt am Anfang und Ende jedes Objekts winzige Sicherungsstiche, damit der Faden nach dem Schnitt nicht aufgeht. Empfohlen: an.'],
    'id:mJumps': ['Schnitt ab … Sprüngen', 'DST kennt keinen Schnittbefehl – die Maschine schneidet nach so vielen Sprüngen in Folge. Muss mit der Maschineneinstellung übereinstimmen. Üblich: 3.'],
    'id:mSpm': ['Geschwindigkeit', 'Stiche pro Minute. Dient zur Zeitschätzung und Preiskalkulation – die Maschine selbst wird damit nicht eingestellt. Üblich: 600–1000.'],

    /* ---------- Bild-Einstellungen ---------- */
    'id:iW': ['Bildbreite', 'Breite der Vorlage in mm. Die Höhe passt sich im gleichen Verhältnis an.'],
    'id:iO': ['Deckkraft', 'Wie stark das Bild durchscheint. Weniger Deckkraft macht die Stiche darüber besser sichtbar. Üblich: 30–50 %.'],
    'id:iX': ['Position X', 'Lage der linken Bildkante in mm, gemessen von der Rahmenmitte.'],
    'id:iY': ['Position Y', 'Lage der oberen Bildkante in mm, gemessen von der Rahmenmitte.'],

    /* ---------- Auto-Digitalisieren ---------- */
    'id:aK': ['Anzahl Farben', 'Auf so viele Farben wird das Bild reduziert. Jede Farbe wird ein Garnwechsel. Für Logos meist 2–6.'],
    'id:aW': ['Breite Stickmotiv', 'Breite des fertigen Motivs in mm. Das Bild wird auf diese Breite gebracht.'],
    'id:aR': ['Detailstufe', 'Wie fein das Bild abgetastet wird (Pixel pro mm). Höher erfasst feinere Details, dauert aber länger. Üblich: 6–10.'],
    'id:aMin': ['Kleinste Fläche', 'Kleinere Farbflecken in mm² werden weggelassen – das entfernt Bildrauschen und winzige, nicht stickbare Stellen.'],
    'id:aMode': ['Stichart', 'Automatisch: Schrift und schmale Formen werden Satin, breite Flächen Tatami (flächige Füllung). Oder alles als Tatami.'],
    'id:aSat': ['Satin bis Strichbreite', 'Formen bis zu dieser Breite in mm werden als Satin gestickt, breitere als Tatami. Üblich: 7 mm.'],
    'id:aAng': ['Tatami-Winkel', 'Stichrichtung der Tatami-Flächen in Grad. Üblich: 45°. Benachbarte Flächen mit unterschiedlichem Winkel wirken lebendiger.'],
    'id:aBg': ['Hintergrund weglassen', 'Die Hintergrundfarbe des Bildes wird nicht gestickt.'],
    'id:aOut': ['Konturen', 'Zusätzlich einen Laufstich um die Flächen legen – für sauberere Kanten.'],
    'id:aRep': ['Vorhandene Objekte ersetzen', 'Löscht vorher alle Objekte im Design. Ohne Haken werden die neuen Objekte hinzugefügt.'],

    /* ---------- Export ---------- */
    'id:eName': ['Dateiname', 'Name der Stickdatei und des Designs. Die Endung wird automatisch angehängt.'],
    'id:eFmt': ['Dateiformat', 'DST für die Texi 1501 und alle Tajima-kompatiblen Industriemaschinen. PES für Brother, JEF für Janome, EXP für Melco/Bernina.'],

    /* ---------- Drehen / Skalieren ---------- */
    'id:rA': ['Drehwinkel', 'Dreht die Auswahl um diesen Winkel in Grad im Uhrzeigersinn. Negativ dreht gegen den Uhrzeigersinn.'],
    'id:sX': ['Breite in %', 'Neue Breite in Prozent der bisherigen. Die Stiche werden neu berechnet, die Dichte bleibt gleich.'],
    'id:sY': ['Höhe in %', 'Neue Höhe in Prozent der bisherigen. Gleicher Wert wie bei der Breite hält die Proportionen.'],
  });
})(typeof window !== 'undefined' ? window : globalThis);
