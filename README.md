# StickStudio – Stickprogramm (Digitalisier-Software)

Ein Stickprogramm (Digitalisier-Software), das im Browser läuft – ohne Installation, auch offline.
Es erzeugt **DST-Dateien (Tajima)** für die **Texi 1501** und alle anderen Tajima-kompatiblen Maschinen.

## Starten

**Wichtig:** Es gibt zwei Arten, StickStudio zu benutzen.

1. **Nur das Programm (ohne Anmeldung):** `index.html` doppelklicken. Dann gibt es **kein** Konto-Menü, keine Verwaltung und keine Testversion. Das ist die reine Zeichenansicht für dich zum Ausprobieren.
2. **Online-Version mit Anmeldung, Testversion und Verwaltung:** Sie läuft über einen kleinen Server. Zum Ausprobieren auf dem eigenen Computer genügt ein Doppelklick auf **`start-lokal.bat`** (Windows) bzw. **`start-lokal.command`** (Mac/Linux). Dafür muss einmalig [Node.js](https://nodejs.org) (LTS, mindestens 22.13) installiert sein. Das Skript fragt nach deiner E-Mail und einem Passwort (das wird dein Admin-Login) und öffnet den Browser. Die Verwaltung liegt dann unter `http://localhost:8080/admin` und im Programm unter **Konto → Verwaltung**.


`index.html` doppelklicken (Chrome, Edge oder Firefox). Es wird nichts installiert, und es ist keine Internetverbindung nötig.
Am besten mit Maus am PC arbeiten: Linke und rechte Maustaste haben beim Zeichnen unterschiedliche Bedeutung.

## Online-Version (mit Anmeldung, Testversion und Lizenz)

Für den Verkauf läuft StickStudio auf einem eigenen Server:

- Kunden registrieren sich und bekommen eine **Testversion** (Standard 14 Tage), danach ein **Abo** über Lemon Squeezy.
- Ohne aktives Abo können sie ihre Designs **nur noch ansehen**.
- Stickdateien erzeugt nur der Server. Der Browser bekommt nur eine verschleierte Programmdatei (`npm run build`).
- „Verträge hier kündigen“ und „Vertrag widerrufen“ sind eingebaut.
- Du verwaltest alles als **Admin** unter `/admin`.
- Die Oberfläche ist auf **Deutsch und Englisch** umschaltbar.
- Rechtstexte (Impressum, AGB, Widerruf, Datenschutz, Lizenzen) liegen als Entwürfe in `legal/`.

Einrichtung, Hosting, Bezahlung und Sicherung: siehe **[server/README.md](server/README.md)**.

```bash
npm install && npm run build
ADMIN_EMAIL=du@deine-firma.de ADMIN_PASSWORD='ein-langes-passwort' node --no-warnings server/server.js
# → http://localhost:8080
```

## Bedienung

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

**28 fertig digitalisierte Stickschriften** sind eingebaut: Schreibschriften (z. B. Pacificlo, Chopin, Magnolia, Amitaclo), serifenlose Schriften (z. B. Excalibur, Medium, Geneva Rounded, Barstitch), Serifenschriften (z. B. Apex, Venezia, Violin Serif, DejaVu) und Zierschriften.
Profis haben sie Satinsäule für Satinsäule von Hand gesetzt, samt Stichrichtung, Unterlage und Reihenfolge. Deshalb sticken sie deutlich sauberer als automatisch umgewandelte Schriften.
Sie werden erst geladen, wenn man sie auswählt. Der Dialog zeigt die empfohlene Größe, die Lizenz und fehlende Zeichen an.
Herkunft und Lizenzen: `fonts/stickfonts/README.md`.

Zusätzlich gibt es zehn TrueType-Schriften und funktionieren auf jedem PC, auch ohne Internet:
(Anton, Bebas Neue, Archivo Black, Passion One, Righteous, Alfa Slab One, Graduate, Pacifico, Great Vibes; SIL Open Font License, siehe `fonts/LIZENZEN.txt`) sowie die Systemschriften des PCs. Diese werden beim Einfügen automatisch in Satinsäulen umgewandelt.

- Einstellbar sind Höhe, Zeichenabstand und **Bogen** (Radius in mm; negativ = Text unten am Kreis).
- **Stichart Satin**: Für jeden Buchstaben wird die Mittellinie der Striche berechnet. Daraus entstehen Satinsäulen, deren Stiche immer quer zur Strichrichtung liegen, auch in Kurven und Bögen. Es werden „Säule A“-Objekte, die sich mit *Umformen* nachbearbeiten lassen.
- **Doppelklick** auf einen Text (oder *Text bearbeiten…* rechts) ändert Text, Schrift oder Größe nachträglich.
- *Gruppierung lösen* macht die Buchstaben zu Einzelobjekten.

### Satin A – Breite frei
Für Satin mit wechselnder Dicke: Werkzeug **Satin A**, dann die Außenkanten **immer abwechselnd** anklicken –
Seite 1 (blau), Seite 2 (orange), Seite 1, Seite 2 … Jedes Punktpaar legt Breite und Stichrichtung fest.
**Linksklick = Ecke (gerade), Rechtsklick = Kurve**; die Punkte eines Paars dürfen verschieden sein (eine Seite Ecke,
die andere Kurve). Rücktaste nimmt den letzten Punkt zurück, Esc bricht ab, Enter = fertig. Der Hinweis unten zeigt,
welche Kante als Nächstes dran ist; die Satin-Vorschau läuft live mit. Danach mit *Umformen* jeden Kantenpunkt einzeln
ziehen, Leertaste wechselt Ecke ↔ Kurve, Doppelklick fügt ein Punktpaar ein.
Eine **Satinlinie mit fester Breite (Satin C)** lässt sich mit „In Satin A umwandeln“ (Eigenschaften oder Menü
Bearbeiten) in eine solche Säule verwandeln und dann stellenweise breiter oder schmaler ziehen.

### Satin in Kurven

- Satinstiche drehen in Bögen mit. Säule B richtet die Stiche senkrecht zur Mittellinie zwischen beiden Kanten aus.
- **Kurzstiche**: An der Innenseite enger Bögen wird jeder zweite Einstich verkürzt, damit sich dort kein Fadenknäuel bildet (abschaltbar).
- Die Dichte wird so angegeben: Abstand zweier Einstiche auf derselben Seite (Vorgabe 0,40 mm).

- **Kurzstiche:** An der gestauchten Innenseite von Bögen und Ecken endet jeder zweite Stich früher,
  je enger die Kurve, desto kürzer. In sehr engen Ecken verteilen sich die Einstiche auf drei Reihen. So entsteht kein
  Fadenknubbel und kein Loch im Stoff, die Rundung läuft weich. Abschaltbar pro Objekt („Kurzstiche in Bögen“).
- Satinlinien drehen sich in Ecken fächerförmig mit; überschlagene Innenkanten werden abgeschnitten, und die Dichte
  richtet sich im Fächer nach der Außenkante (keine Lücken außen).
### Automatische Verbindungen (Ein-/Ausstieg, versteckte Laufwege)

- **Ein- und Ausstieg berechnen:** Für jedes Objekt wird festgelegt, an welchem Ende es beginnt und endet. Gerechnet wird über die ganze Kette (Viterbi-Verfahren), sodass die Summe aller Wege minimal ist. Beispiel: Ein „C“ vor einem „A“ beginnt oben und endet unten, nahe dem linken Fuß des A. Flächen beginnen an dem Randpunkt, der dem vorigen Objekt am nächsten liegt. Geschlossene Laufstiche beginnen am nächstgelegenen Punkt.
- **Versteckte Laufwege (Unterwege):** Statt den Faden zu schneiden, sucht das Programm einen Laufstich-Weg, der vollständig unter Flächen oder Satinsäulen derselben Farbe liegt, die *danach noch gestickt werden*. Der Weg hält mindestens 0,5 mm Abstand zum Rand. Mit *Ansicht → Sprünge anzeigen* (Taste J) erscheinen diese Wege orange, Sprünge mit Schnitt rot gestrichelt.
- **Fertige Stickschriften** behalten die Stichreihenfolge der Digitalisierer. Zwischen den Buchstaben wird trotzdem nach versteckten Wegen gesucht.
- **Bearbeiten → Reihenfolge optimieren:** sortiert Objekte gleicher Farbe nach kürzesten Wegen. Überlappende Objekte behalten ihre Reihenfolge, damit sich die Überdeckung nicht ändert. Das Ergebnis wird nur übernommen, wenn es weniger Schnitte bzw. kürzere Wege ergibt.
- Ein-/Ausschalten unter *Einstellungen → Maschine & Rahmen*.

Beispiel: Ein Design mit drei Schriftzügen kam statt mit 62 mit 33 Fadenschnitten aus, ein Logo statt mit 25 mit 14.

### Schnitt oder Sprung selbst festlegen

Unter *Einstellungen → Maschine, Schnitte & Sprünge*:
- **Bis X mm direkt als Stich verbinden** (Vorgabe 2 mm)
- **Bis Y mm springen ohne Schnitt** (Vorgabe 0 = immer schneiden). Darüber wird geschnitten, sofern kein versteckter Laufweg gefunden wird.
- **Vernähen auch bei Sprüngen ohne Schnitt** (empfohlen: der liegende Faden wird später von Hand gekürzt)
- **Schnitt ab wie vielen Sprüngen**: wie an der Maschine eingestellt (Texi/Tajima meist 3)

Ein DST-Sprungbefehl reicht höchstens 12,1 mm. Ab der eingestellten Zahl von Sprüngen in Folge schneidet die Maschine selbst. Deshalb kann ein Sprung ohne Schnitt höchstens *(Sprünge bis Schnitt − 1) × 12,1 mm* lang sein, bei 3 also 24,2 mm. Das Programm begrenzt den Wert entsprechend und weist darauf hin.

**Pro Objekt:** In den Eigenschaften unter *Verbindung davor* lässt sich für jedes Objekt (auch für mehrere ausgewählte) festlegen: *Automatisch*, *Immer schneiden*, *Springen ohne Schnitt* oder *Direkt als Stich*.
In der Ansicht *Sprünge anzeigen* (Taste J) erscheinen Sprünge nach Schnitt rot gestrichelt mit ✂, Sprünge ohne Schnitt violett und versteckte Laufwege orange.

### Stickrahmen

- **Schnellauswahl** oben in der Leiste, *Rahmen…* öffnet die Verwaltung.
- **Standardrahmen:**
  - Texi 1501: 540 × 350, 290 × 290, Ø 200/150/120/90 mm, Kappe 270°
  - übliche Industrie-Schlauchrahmen: rund 9 bis 21 cm, Vierkant 24/30/36 cm, Oval, Brusttasche
  - Haushaltsmaschinen: 10 × 10 bis 24 × 36 cm

  Die Maße gelten für das nutzbare Stickfeld und sind Richtwerte.
- **Eigene Rahmen:** Name, Form (eckig, rund, oval), Breite bzw. Durchmesser, Höhe und Sicherheitsabstand. Sie werden im Browser gespeichert und zusätzlich im Projekt, damit sie auf anderen PCs mitkommen.
- **Anzeige:** Rahmenkörper, Stickfeld, Sicherheitsabstand (rot gestrichelt), Mittelkreuz (= Startpunkt an der Maschine) und Beschriftung mit Maßen.
- **Prüfung:** Die Statusleiste warnt, wenn Stiche über das Stickfeld oder in den Sicherheitsabstand ragen. Ein Klick darauf öffnet den Rahmen-Dialog mit der **Liste aller passenden Rahmen** (kleinster zuerst), *Design in Rahmenmitte setzen* und *In Rahmen einpassen* (verkleinert das Design passend, die Dichte bleibt gleich).

### An Rahmen anpassen (ein Knopfdruck)

Der Knopf **⤢ An Rahmen anpassen** oben in der Leiste (auch unter *Bearbeiten* und *Bild*) skaliert das Design so, dass es das Stickfeld des gewählten Rahmens ausfüllt. Der Sicherheitsabstand bleibt frei, und das Design wird in die Mitte gesetzt.
- Ist etwas ausgewählt, wird nur die Auswahl angepasst, sonst das ganze Design (samt Vorlagenbild).
- Ist nur ein Vorlagenbild vorhanden, wird das Bild angepasst. Danach nachzeichnen oder auto-digitalisieren, die Größe stimmt dann schon.
- Die Stiche werden aus den Formen **neu berechnet**:
  - Dichte und Stichlängen bleiben gleich fein.
  - Satin-Abstand, Zugausgleich, Unterlage und Teilung richten sich nach der neuen Breite und dem gewählten Stoff.
  - Breite von Satinlinien und Satin-Konturen sowie die Schrifthöhe werden mitskaliert.
- Danach zeigt ein Fenster Faktor, alte und neue Größe, Stichzahl und Hinweise, z. B. „Schrift unter 5 mm“ oder „Einzelstiche nur skaliert“. Mit *Rückgängig* wird alles zurückgenommen.

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
Die Prüfung wurde an allen eingebauten Profi-Schriften abgestimmt, damit sie bei sauber digitalisierten Motiven nicht grundlos warnt.


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

### Teamnamen / Seriennamen
*Datei → Teamnamen…*: ein Textobjekt dient als Platzhalter, die Namensliste (ein Name pro Zeile) erzeugt je Name eine
Stickdatei – alles in einer ZIP-Datei mit Namensliste. Zu lange Namen werden auf eine Höchstbreite verkleinert; Namen,
die dadurch unter 5 mm Schrifthöhe fallen, werden gemeldet.

### Mehrfach-Einspannung (große Motive)
*Datei → Auf mehrere Einspannungen verteilen…*: Rahmen und Überlappung wählen, die Vorschau zeigt die Felder (der Rahmen
wird bei Bedarf quer gelegt). Jede Einspannung wird eine eigene Datei; Passkreuze im Überlappungsbereich werden am Ende
einer Einspannung und am Anfang der nächsten gestickt. Objekte, die größer als ein Feld sind, werden gemeldet
(vorher mit dem Messer teilen). Ergebnis: ZIP mit Dateien und Anleitung.

### Anordnen, Gruppen, Einrasten
Menü **Anordnen**: links/mittig/rechts, oben/mittig/unten ausrichten (ein Objekt → am Rahmen, mehrere → aneinander),
waagrecht/senkrecht verteilen, Gruppieren (Strg+G) und Gruppierung lösen (Strg+Shift+G).
**Kopien anordnen**: im Kreis (Anzahl, Radius, Mittelpunkt, mitdrehen) oder als Raster (Spalten × Reihen, Abstände).
**Einrasten** (Taste G) an Raster und Hilfslinien beim Digitalisieren, Verschieben und Umformen; Rasterweite und
Hilfslinien unter *Ansicht → Hilfslinien & Rasterweite…* (werden im Projekt gespeichert).

### Text-Effekte
- **Hüllform** im Textdialog: Bogen, Brücke, Tal, Welle, Wimpel, Raute, Wölbung, Taille – Stärke in mm.
- **Buchstaben anpassen…** (Eigenschaften einer Schrift): je Buchstabe Abstand davor (Kerning), Verschieben,
  Drehen und Größe. Gilt für Stickschriften und für automatisch umgewandelte Schriften.
- **Text auf Linie** (*Anordnen → Text auf Linie setzen*): Text und eine Linie (z. B. Bogen oder Kreis) zusammen
  auswählen; über/unter der Linie, Ausrichtung, Verschiebung. Der Text bleibt bearbeitbar.
- **Monogramm** (*Anordnen → Monogramm…*): Vorlagen klassisch (Mitte groß), im Kreis, in Raute, mit Linien.

### Dateiformate
Export: **DST** (Tajima/Texi), **PES** (Brother, Version 1 mit Vorschau-Icons), **JEF** (Janome, Rahmen wird automatisch
gewählt), **EXP** (Melco/Bernina). Import aller vier Formate inkl. Garnfarben (PES/JEF). Die Formatlogik ist aus
pyembroidery (MIT-Lizenz) portiert, siehe `js/vendor/PYEMBROIDERY-LICENSE.txt`; die geschriebenen Dateien sind
byte-identisch mit pyembroidery. Hinweis: PES und JEF kennen keinen „Sprung ohne Schnitt“ bzw. keinen Schnittbefehl –
dort entscheidet die Maschine. **EMB** (Arbeitsdatei eines anderen Herstellers) ist ein geschlossenes Format und kann nicht gelesen werden.

### Produkt-Vorschau, Preis, Bibliothek
- **Produkt-Vorschau** (*Datei → Produkt-Vorschau*): Design maßstabsgetreu auf T-Shirt, Polo, Hoodie, Kappe, Handtuch
  oder Tasche, Platzierung und Stofffarbe wählbar, als PNG speichern.
- **Preiskalkulation & Angebot**: nach Stichzahl (je 1000 Stiche) oder Maschinenzeit (Stundensatz), Farbaufschlag,
  Mindestpreis, Einspannzeit, Textil, Einrichtung, Digitalisierung, Mengenrabatte, MwSt.; Angebot mit Vorschaubild drucken.
- **Design-Bibliothek** (Strg+B): Designs mit Vorschaubild, Stichworten und Kunde im Browser speichern, suchen,
  sortieren, öffnen. Zur Sicherung zusätzlich als Projektdatei speichern.

### Hilfe-Infos (Mouse-Over)
Mit der Maus kurz über einem Knopf, Werkzeug, Menü, Eigenschaften-Feld oder Dialogfeld verweilen: ein Info-Kästchen
erklärt in einfachen Worten, was es tut und wofür man es braucht (mit üblichen Werten). Ausschalten mit dem Haken
*Einstellungen → Hilfe-Infos beim Überfahren* oder mit dem ⓘ-Knopf unten rechts; die Einstellung wird gemerkt.

### Ansicht verschieben und zoomen
- **Mausrad** = hoch/runter, **Shift + Mausrad** = links/rechts, **Strg + Mausrad** = Zoom (Touchpad: zwei Finger
  verschieben, Spreizen zoomt).
- **Leertaste gedrückt halten + Maus bewegen** (mit oder ohne Klick), Werkzeug **Verschieben ✋** (Taste H) oder
  mittlere Maustaste = Ansicht verschieben.
- **Bildlaufleisten** rechts und unten; **Pfeiltasten** verschieben die Ansicht, wenn nichts ausgewählt ist.
- Wer lieber mit dem Rad zoomt: *Ansicht → Mausrad zoomt (statt scrollen)*.

### Sticksimulation
▶ spielt die Stickreihenfolge ab. Ist etwas ausgewählt, läuft **nur die Auswahl** (der Rest des Designs bleibt blass
sichtbar); ohne Auswahl das ganze Design.

### Überlappungen entfernen
Kürzt Flächen **und Satinsäulen** (Satin A/B/C, Schriften), die von später gestickten Objekten verdeckt werden. Bei
Satin fallen verdeckte Stiche weg, teilweise verdeckte werden bis unter den Rand des oberen Objekts gekürzt; kreuzt ein
oberes Objekt eine breite Säule in der Mitte, wird sie der Länge nach in zwei Säulen geteilt. Findet das Programm nichts,
nennt es für jedes ausgewählte Objekt den Grund. Mit Auswahl werden nur
Überlappungen bearbeitet, an denen ein ausgewähltes Objekt beteiligt ist – egal ob es oben oder unten liegt.

### Füllarten
Unter *Eigenschaften → Füllart*: **Tatami**, **Satin** (fester Winkel), **Kontur** (Reihen parallel zum Rand),
**Spirale** (Ringe gehen fließend ineinander über), **Welle** (Wellenhöhe/-länge einstellbar), **Muster** (Rauten, Diagonal,
Ziegel, Wellen – über den Versatz der Einstiche), **Verlauf** (Reihenabstand wird von dicht nach offen größer),
**Kreuzstich** (Kästchengröße, einfach/doppelt) und **Knockdown** (lockeres Gitter).

### Applikation
Form auswählen → *Bearbeiten → Applikation aus Form…*. Es entstehen: Platzierungslinie → **Stopp** (Stoff auflegen) →
Heftstich (Zickzack, Doppel-Lauf oder E-Stich) → **Stopp** (Stoff abschneiden) → Abdeckung (Satin oder E-Stich).
Ein Stopp ist in der DST ein Farbwechsel auf dieselbe Nadel; das Arbeitsblatt zeigt, was beim Stopp zu tun ist.
Jedes Objekt kann unter *Eigenschaften* „Maschine stoppt davor“ bekommen.

### 3D-Puff
Bei Satin „3D-Puff (Schaum)“ anhaken: Dichte 0,25 mm, keine Unterlage, kein Split, Enden werden mehrfach überstochen
(damit der Schaum sauber abreißt) und davor stoppt die Maschine zum Auflegen des Schaums.

### Knockdown-Stich
Für Frottee, Fleece, Strick, Piqué (Knopf erscheint im Stoff-Feld oder *Bearbeiten → Knockdown-Stich…*): ein lockeres
Gitter in Stofffarbe unter dem ganzen Motiv (mit Rand) drückt den Flor flach.

### Kappen-Modus
*Bearbeiten → Für Kappe sortieren*: Objekte von der Mitte nach außen und von unten nach oben, Säulen/Linien werden
nach oben gedreht, Kappenrahmen und Stoff „Kappe“ werden gewählt. Farbreihenfolge kann erhalten bleiben.

### Echte Garnfarben (Farbkarten)
14 Farbkarten mit Nummern: Madeira Polyneon / Rayon / Burmilana, Isacord, Gunold, Robison-Anton (Poly/Rayon),
Sulky (Rayon/Poly), Mettler Poly Sheen, Marathon, Brother, Coats Alcazar, Gütermann Creativ Dekor.
- **Farbe bearbeiten**: Marke wählen, nach Nummer oder Name suchen (auch deutsch: „rot“, „blau“ …). Ohne Suche werden die 24 ähnlichsten Garne angezeigt.
- **Garnmarke…** (unter der Palette): ordnet allen Farben das nächstliegende Garn der Marke zu (Farbabstand ΔE in Lab, mit Vorschau).
- Neue Farben aus Vektor-Import und Auto-Digitalisieren werden automatisch dem nächsten Garn der gewählten Marke zugeordnet (abschaltbar).
- Garnnummern stehen in der Palette und auf dem Arbeitsblatt.
Die Farbwerte sind Bildschirm-Näherungen – maßgeblich ist die echte Farbkarte.

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
- Rahmen: siehe Abschnitt *Stickrahmen* (Texi-Rahmen, weitere Standardrahmen und eigene Rahmen).
- *Datei → Arbeitsblatt drucken* listet die Farbfolge mit den Nadelnummern (Nadeln 1–15 bei jeder Farbe einstellbar, Doppelklick auf die Farbe).

Vorhandene DST-Dateien lassen sich importieren (*Datei → DST importieren*). Sie werden dabei als Einzelstiche geöffnet.

## Projektdateien

*Datei → Projekt speichern* speichert eine `.stick.json` mit allen bearbeitbaren Objekten, Farben und dem Vorlagenbild.
Bitte das Projekt immer zusätzlich speichern: Eine DST-Datei enthält nur noch Stiche und keine bearbeitbaren Objekte mehr.

## Technik

| Datei | Inhalt |
|---|---|
| `js/geometry.js` | Kurven (Ecke/Kurve), Polygone, Hilfsfunktionen |
| `js/hoops.js` | Rahmenbibliothek, eigene Rahmen, Passt-Prüfung, Einpassen |
| `js/route.js` | Ein-/Ausstiege (Viterbi), versteckte Laufwege (Wegsuche unter später gestickten Flächen), Reihenfolge |
| `js/check.js` | Stickprüfung: Stichwinkel, Dichte, Stichlängen, Maschinenprofile |
| `js/fabric.js` | Stoffprofile, automatische Stichanpassung, Vlies-Empfehlung |
| `js/stitchgen.js` | Lauf-, Dreifach-, Satin- und Tatami-Stiche, Unterlagen, Zugkompensation, Auto-Split |
| `js/dst.js` | Design zusammensetzen (Vernähen, Schnitte, Farbwechsel), DST schreiben und lesen |
| `js/autodigitize.js` | Farbreduktion (k-Means), Regionen, Konturverfolgung, Objekterzeugung |
| `js/satinauto.js` | Drehende Satinsäulen aus Flächen: Abstandstransformation, Skelett, Mittellinien, Breitenmessung |
| `js/fonts.js` | Eingebettete TrueType-Schriften (erzeugt aus `fonts/*.ttf`) |
| `js/inkfont.js` | Laden und Setzen der fertig digitalisierten Stickschriften |
| `js/stickfonts/` | Die eingebauten Stickschriften im StickStudio-Format (je Schrift eine Datei) |
| `js/app.js` | Oberfläche, Werkzeuge, Umformen, Simulation, Dialoge |

Tests: `node tests/test_core.js` prüft die Stichgenerierung und den DST-Hin- und Rückweg, `node tests/test_satin.js` die Satin-Erkennung (Ring, Bogen, L, T), `node tests/test_fabric.js` die Stoff-Automatik, `node tests/test_check.js` die Stickprüfung, `node tests/test_route.js` die Verbindungsberechnung, `node tests/test_connect.js` Schnitt/Sprung und Rahmen.
Die erzeugten DST-Dateien wurden zusätzlich mit der unabhängigen Bibliothek *pyembroidery* gegengelesen.

## Kleidungsvorlagen

Unter *Datei → Kleidungsvorlage hinter dem Rahmen…* (oder Werkzeug „Kleidung“) liegt T‑Shirt, Polo, Sweatshirt, Hoodie oder Kappe (vorne, hinten, Ärmel, Seiten; Größen S–XXL, frei wählbare Farbe) hinter dem Stickrahmen. Die Kleidung lässt sich unter dem Rahmen verschieben; angezeigt werden die Abstände von Mittellinie und Kragen in mm. Mit „Eigenes Foto…“ kann echte Kleidung hinterlegt werden (Maßstab über zwei Punkte). Die Vorschau und das Arbeitsblatt zeigen die Position maßstabsgetreu. Quelltext: `js/garments.js`.
