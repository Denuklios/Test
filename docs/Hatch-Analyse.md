# Hatch-Analyse: Was Hatch kann – und was StickStudio noch fehlt

Stand: 20.10.2026. Grundlage sind öffentliche Quellen (Hatch-Blog, Hatch-Onlinehilfe, Händlerseiten) und der
Abgleich mit dem StickStudio-Code. Hatch selbst wurde **nicht** dekompiliert oder disassembliert.

## Rechtlicher Rahmen (kurz)

- **Erlaubt:** Funktionen beobachten, ausprobieren und nachbauen (§ 69d Abs. 3 UrhG). Ideen, Stichtechniken und
  Bedienkonzepte sind nicht geschützt. Dateiformate zur Austauschbarkeit analysieren (§ 69e UrhG).
- **Nicht erlaubt:** Hatch-Programmcode, Schriften, Motive, Symbole oder Hilfetexte übernehmen. Der Name „Hatch“
  bzw. „Wilcom“ darf nicht als Werbung für StickStudio dienen. Die Lizenzbedingungen von Hatch verbieten außerdem
  das Dekompilieren.

## Was StickStudio schon hat (Hatch-Gegenstück)

| Hatch | StickStudio |
|---|---|
| Satin, Tatami, Laufstich, Dreifachstich | ✔ |
| Säule A / Säule B, Satin mit fester Breite | ✔ (Säule A/B, Satin C) |
| Unterlage, Zugausgleich, Auto-Split, Auto-Abstand | ✔ |
| Auto Fabric (Stoff wählen → Werte anpassen, Vlies-Empfehlung) | ✔ Stoff-Automatik |
| Instant Embroidery / Auto-Digitize | ✔ Auto-Digitalisieren |
| Auto Start & End, Branching, Closest Join | ✔ Viterbi-Ein-/Ausstieg, versteckte Laufwege |
| Remove Overlaps | ✔ auch für Satin |
| Applikation (Platzierung, Heften, Abdeckung) | ✔ |
| Laydown Stitch | ✔ Knockdown-Stich |
| Monogramm, Text auf Linie, Hüllformen, Teamnamen | ✔ |
| Multi-Hooping | ✔ Mehrfach-Einspannung |
| Stitch Player, TrueView | ✔ Simulation, TrueView |
| Stichbearbeitung | ✔ In Einzelstiche umwandeln |
| Messer, Spiegeln, Kreis-/Rasterkopien | ✔ |
| Contour-, Gradient-, Muster-, Kreuzstich-Füllung | ✔ |
| Garnfarbkarten | ✔ 14 Karten |
| Druck-/Freigabeblatt | ✔ Arbeitsblatt, Angebot |

## Was fehlt (nach Nutzen sortiert)

### Hoch – fällt Kunden sofort auf

1. **Linien-Sticharten:** Rückstich, Stielstich, Langettenstich als Linie, Motivlauf (wiederholtes Muster an der
   Linie entlang), Candlewicking (Knötchen). Kleiner Aufwand, alles in `stitchgen.js`.
2. **Weitere Dateiformate:** VP3 (Husqvarna/Pfaff), HUS/VIP (Husqvarna), XXX (Singer), SEW (Janome alt), PEC.
   Alle in pyembroidery (MIT) vorhanden, Portierung wie bei PES/JEF.
3. **Erhöhter Satin (Raised Satin):** zusätzliche Polster-Unterlage aus Tatami/Satin unter der Säule.
4. **Löcher füllen / Umriss & Abstand:** Löcher einer Fläche mit einem Klick schließen. Mit Abstand eine
   Kontur bzw. Versatzlinie um ein oder mehrere Objekte legen (z. B. Rand um Schrift). Die Versatzrechnung gibt
   es intern schon in `geometry.js`.

### Mittel

5. **Handstich-Effekt:** Abstand, Winkel und Länge zufällig variieren, damit es wie von Hand gestickt aussieht.
   Abschaltbar pro Objekt.
6. **Motivfüllung:** Fläche mit wiederholtem kleinen Motiv füllen (Herzen, Sterne …).
7. **Trapunto:** Laufwege unter einer Fläche verstecken bzw. Fläche gepolstert wirken lassen (Kombination aus
   versteckten Laufwegen und erhöhter Unterlage).
8. **Kaleido / Spiegelverbund:** Objekt mehrfach gespiegelt um einen Mittelpunkt anordnen. Baut auf
   „Kopien im Kreis“ und Spiegeln auf.

### Niedrig (aufwendig, eher Hobby-Markt)

9. **PhotoStitch (Farbe) / Reef PhotoStitch:** Foto in Stiche umwandeln (Helligkeit → Stichdichte bzw.
   Laufstich-Linien).
10. **EMB lesen:** geschlossenes Wilcom-Format (OLE-Container mit verschlüsselten bzw. komprimierten Daten). Es gibt
    keine offene Beschreibung. Machbar wäre höchstens das Vorschaubild bzw. die Stiche. Dafür braucht es viele
    Beispieldateien mit der zugehörigen DST. Aufwand hoch, Erfolg unsicher. Empfehlung: Kunden exportieren aus
    Hatch DST/PES, die StickStudio bereits öffnet.

## Empfohlene Reihenfolge

1 → 2 → 4 → 3 → 5. Damit sind die Funktionen abgedeckt, nach denen Hatch-Umsteiger zuerst suchen. Alles nutzt
vorhandene Bausteine (Stichgenerator, Formatlogik aus pyembroidery, Versatzrechnung).
