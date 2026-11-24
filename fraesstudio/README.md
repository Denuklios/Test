# FräsStudio – CAD + CAM + Fräsen in einem Programm

Zeichnen, Fräsbahnen berechnen, in 3D prüfen und direkt fräsen – im Browser, ohne Installation, auch offline.
Abgestimmt auf die **Twotrees TTC450** (GRBL, DLC32-Steuerung, 460 × 460 × 80 mm), funktioniert aber mit jeder GRBL-Fräse.

Vorbilder: die einfache Bedienung von **Easel**, der Funktionsumfang von **Carbide Create / VCarve** (2D, 2.5D, V-Carving, 3D-Relief).

## Starten

`index.html` doppelklicken – am besten in **Google Chrome** oder **Microsoft Edge** (nur diese können die Fräse per USB steuern).
Es wird nichts installiert, eine Internetverbindung ist nicht nötig. Das Projekt wird automatisch im Browser zwischengespeichert.

**Online mit Passwort:** Auf dem StickStudio-Server liegt FräsStudio unter `/fraesstudio/` und ist nur nach Anmeldung und Freischaltung durch den Admin erreichbar (siehe `server/README.md`, Abschnitt „FräsStudio“).
Bitte FräsStudio **nicht** auf einen normalen Webspace ohne diesen Server legen. Dort wäre es für jeden offen, und ein Passwort nur in der Seite selbst lässt sich umgehen.

## Die vier Arbeitsschritte

| Schritt | Was passiert |
|---|---|
| **1 Entwerfen** | Werkstück (Größe, Stärke, Material, Nullpunkt) einrichten, zeichnen, Text setzen, SVG/DXF/Bilder/STL importieren |
| **2 Fräsbahnen** | Objekte anklicken → Bearbeitung wählen: Kontur, Tasche, V-Carving, Gravieren, Bohren, Planfräsen, 3D schruppen/schlichten |
| **3 3D-Vorschau** | Materialabtrag simulieren, Laufzeit sehen, Warnungen (z. B. Eilgang im Material) |
| **4 Fräsen** | TTC450 per USB verbinden, verfahren, Nullpunkt setzen, Z antasten, Auftrag starten/pausieren, Vorschub/Drehzahl anpassen |

**Reihenfolge:** Kontur, Tasche, V-Carving, Gravieren und Bohren arbeiten Teil für Teil in Leserichtung (Zeilen oben nach unten, links nach rechts): Jeder Buchstabe wird in allen Tiefen fertig, bevor der nächste folgt; bei Konturen kommen Innenlöcher vor der Außenkontur. Innerhalb eines Werkzeugs gilt das ohne Hin-und-her; zwischen V-Fräser und Schaftfräser liegt ein Werkzeugwechsel.

## Funktionen

**Zeichnen:** Linie/Kurve (Linksklick Ecke, Rechtsklick Kurve – wie in StickStudio), Rechteck mit Eckenradius, Kreis/Ellipse, Vieleck, Stern, Text mit 9 Schriften, Messen.
Punkte bearbeiten, Raster- und Objektfang, Verschieben/Skalieren/Drehen mit Griffen oder Zahlen, Spiegeln, Ausrichten, Vereinen/Abziehen/Schnittmenge, Versatz, Mehrfach anordnen, Kopieren/Einfügen, Rückgängig.

**Import:** SVG, DXF (Linien, Bögen, Polylinien mit Bögen, Kreise, Ellipsen, Splines – lose Linien werden automatisch zu geschlossenen Formen verbunden), Bild nachzeichnen (PNG/JPG → Umriss), Höhenbild → 3D-Relief, STL → 3D-Relief.

**Fräsbahnen:**
- **Kontur** außen/innen/auf Linie, Gleich-/Gegenlauf, mehrere Zustellungen, **Haltestege**, **Rampe** statt senkrechtem Eintauchen, Aufmaß + Schlichtgang
- **Tasche** konturparallel oder in Zeilen, Inseln (z. B. das Innere eines „O“) bleiben stehen
- **V-Carving** mit echter Tiefenberechnung (scharfe Ecken bei Schrift), optional Maximaltiefe + Ausräumen flacher Böden mit Schaftfräser
- **Gravieren** genau auf der Linie (auch offene Linien)
- **Bohren** mit Bohrer (Entspänen) oder Helix-Fräsen mit Schaftfräser
- **Planfräsen** der ganzen Oberfläche (Opferplatte ebnen)
- **3D-Relief schruppen** (Ebenen mit Aufmaß) und **schlichten** (Kugelfräser, Zeilen in X, Y oder beiden)

**Werkzeugbibliothek** mit Schaft-, Kugel-, V-Fräsern und Bohrern; **Material** (Weich-/Hartholz, MDF, Sperrholz, Acryl, PVC, HDPE, Leiterplatte, Alu, Messing) passt Vorschub und Zustellung an.

**G-Code** (GRBL): eine Datei mit Werkzeugwechsel-Pause (M0) oder je Werkzeug eine Datei (für SD-Karte/Candle). Nullpunkt an 9 Stellen wählbar, Z auf Material- oder Tischoberfläche.

**Maschine:** Web Serial (115200 Baud), Statusanzeige, Positionsanzeige, Verfahren per Knopf und Tastatur (Pfeile, Bild↑/↓), Nullpunkt setzen, Z antasten mit Messplatte, Referenzfahrt, Entsperren, Spindel, Vorschub- und Drehzahl-Override, Konsole.
Beim Werkzeugwechsel hält FräsStudio an, die Maschine bleibt bedienbar (verfahren, neu antasten), dann geht es mit „Weiter fräsen“ weiter.

## Schwarz-Weiß-Bild → 3D (wie in LightBurn)

Knopf **„Bild → 3D“** links, *Datei → 3D-Relief aus Bild* oder einfach ein Bild auf das Fenster ziehen.
**Schwarz wird am tiefsten gefräst, Grautöne liegen dazwischen, Weiß bleibt flach auf der Oberfläche.** Durchsichtige Bereiche zählen als weiß.
Im Dialog: Breite/Höhe, Tiefe (für Schwarz), Regler für die Grautöne (höher/tiefer), Glätten, Umkehren – mit 3D-Vorschau.
Auf Wunsch werden die Fräsbahnen gleich angelegt (Schaftfräser schruppen, Kugelfräser schlichten).

## Foto oder Render → 3D (KI-Tiefenschätzung)

Bei normalen Fotos und gerenderten Bildern stimmt „hell = hoch“ nicht, denn Licht und Schatten würden mitgefräst.
Im Dialog „Bild → 3D“ deshalb die Bildart **„Foto oder Render – KI schätzt die Tiefe“** wählen. Die KI (Depth Anything V2 Small) erkennt, was vorne und hinten ist, und macht daraus eine Höhenkarte.

- **„Feine Details aus dem Bild“** legt Strukturen wie Haare, Fell oder Holzschnitzerei aus der Helligkeit obendrauf.
- **Modell:** Das KI-Modell (ca. 27 MB) wird einmal geladen und im Browser gespeichert, danach geht es auch ohne Internet. Auf dem eigenen Server lädt es `deploy/install.sh` gleich mit herunter.
- **Ohne Internet:** `model_quantized.onnx` von [HuggingFace](https://huggingface.co/onnx-community/depth-anything-v2-small/tree/main/onnx) laden und im Dialog mit „Modelldatei wählen…“ öffnen.
- **Grenzen:** Die KI schätzt nur. Gekaufte STL-Dateien bzw. Höhenkarten sind genauer. Bei fremden Motiven (Wasserzeichen!) das Urheberrecht beachten: das Motiv bzw. die Datei beim Anbieter kaufen.

## Feine Reliefs: konische Kugelfräser und Restmaterial

- In der Werkzeugbibliothek gibt es **konische Kugelfräser** (R0,25 / R0,5 / R0,75 mit 3,175-mm-Schaft): Sie sind vorne sehr fein und hinten trotzdem stabil.
- **„3D Rest“** (Restmaterial) arbeitet nach dem Schlichten nur die Stellen nach, an die der dicke Fräser nicht kam, zum Beispiel enge Rillen, Haare oder Augen. Als „Vorheriges Werkzeug“ das Schlicht-Werkzeug angeben. Das spart gegenüber komplettem Feinschlichten oft Stunden.
- **Typische Reihenfolge:** 3D schruppen (Schaftfräser 3,175) → 3D schlichten (Kugelfräser 3,175) → 3D Rest (konischer Kugelfräser R0,25).

## Kamera von oben

Eine USB-Webcam fest über der Fräse montieren. Knopf **„Kamera“** → im Livebild die 4 Ecken des eingespannten Werkstücks anklicken
(links unten, rechts unten, rechts oben, links oben). Das Bild wird entzerrt und liegt danach unter der Zeichnung – so lassen sich Motive genau auf das echte Material
(Maserung, vorhandene Bohrungen, ein schon bearbeitetes Teil) setzen. Live-Bild oder Standbild, Deckkraft und Linsenkorrektur einstellbar, Taste **C** blendet ein/aus.
Die Einstellung bleibt gespeichert; nach dem Wechsel des Werkstücks die Ecken neu anklicken.

## Verbinden: USB oder WLAN

**„Verbinden …“** (Schritt 4) bietet drei Wege:

| Weg | Wann | So geht es |
|---|---|---|
| **USB-Kabel** | am sichersten, immer wenn möglich | Chrome oder Edge. Anschluss in der Liste wählen (meist „USB-SERIAL CH340“). Die Baudrate wird automatisch erkannt. |
| **WLAN über den Server** (empfohlen für WLAN) | FräsStudio läuft auf deinem Pi / Server (`https://…/fraesstudio/`) | Der Server verbindet sich per **Telnet (Port 23)** mit der Maschine. Nur die **IP-Adresse** eintragen. Geht auch am Tablet. |
| **WLAN direkt** (experimentell) | FräsStudio per Doppelklick geöffnet (`file://`) oder `http://`-Seite | Ausgabe per WebSocket (Port 81), Befehle per HTTP. Die Firmware bündelt die Antworten (ca. alle 0,5 s) – gut zum Verfahren, für lange Aufträge besser Telnet/Brücke. |

**WLAN an der TTC450 einrichten:** Per USB verbinden → Knopf **„WLAN“** → Name und Passwort deines WLANs eingeben → „Einrichten“. FräsStudio sendet die üblichen GRBL-ESP32-Einstellungen (`$Radio/Mode=STA`, `$Sta/SSID`, `$Sta/Password`, `$Telnet/Enable=ON`, `$System/Control=RESTART`).
Die **IP-Adresse** zeigt „WLAN“ → „IP-Adresse anzeigen“ (nach dem Neustart wieder per USB verbinden) oder die Geräteliste deines Routers. Im Router am besten eine feste IP für die Maschine vergeben.
Ohne Einrichtung öffnet die Maschine ein eigenes WLAN **MKS_DLC** (Adresse 192.168.4.1).
*Die Befehle sind GRBL-ESP32-Standard; die Twotrees-Firmware kann abweichen. Meldet die Konsole „$-Befehl unbekannt“, WLAN am Touch-Display oder im Webbrowser (`http://IP-der-Maschine`) einrichten.*

**Sicherheit der WLAN-Brücke:** Sie erlaubt nur angemeldeten Konten mit FräsStudio-Zugang und nur Ziele im eigenen Netz (oder die Maschine aus `CNC_HOST`). Wer Zugang hat, kann **aus der Ferne fräsen** – nur freischalten, wem du das zutraust, und nie unbeaufsichtigt starten. Bricht die Browser-Verbindung ab (Tab zu, Netz weg), löst der Server einen **Not-Aus (Soft-Reset)** an der Maschine aus. Ganz abschalten: `CNC_BRIDGE=off` in `/etc/stickstudio.env`.

**Wenn die Verbindung nicht klappt:** FräsStudio zeigt, welches Gerät es gefunden hat und was empfangen wurde. Typische Ursachen: Maschine aus (24 V!), Kabel nur zum Laden, CH340-Treiber fehlt, ein anderes Programm (Candle, UGS, LaserGRBL) hält den Anschluss, Platine hängt im Neustart (Maschine aus- und einschalten).

## Werkstück per Kamera erkennen (Nullpunkt automatisch)

Die Webcam findet das Werkstück auf dem Tisch, setzt **X/Y-Null auf die linke untere Ecke** und stellt Größe und Schräglage ein – ohne Anklicken und ohne Verschieben des Werkstücks.

1. **Einmalig einmessen** (Menü Kamera → „Kamera mit Maschine einmessen“): Fräserspitze knapp über die Werkstückoberfläche an 4 Stellen fahren (möglichst weit auseinander), jeweils im Bild auf die Spitze klicken und „Punkt übernehmen“. Die Kamera muss fest montiert sein.
2. **Werkstück auflegen**, Maschine verbinden, „Werkstück erkennen“ (Kamera-Leiste oder Fräsen-Schritt). Du siehst Umriss und Nullpunkt; mit „Setzen und zur Ecke fahren“ wird X/Y-Null per `G10 L2 P1` auf die Ecke gelegt (Z bleibt, Werkzeug wie gewohnt antasten).
3. Liegt das Werkstück **schief**, werden alle Bahnen um den Winkel gedreht (G-Code-Kopf vermerkt ihn). Vor dem Start prüft FräsStudio, ob die Bahnen auf dem erkannten Werkstück liegen.

Hinweise: Ohne Endschalter ändert sich der Maschinen-Nullpunkt bei jedem Einschalten – dann „Versatz nachmessen (1 Punkt)“. Bei wenig Kontrast (hell auf hell) hilft „Leerbild aufnehmen“ (Tisch leer). Gleichmäßiges Licht ohne harte Schatten verbessert die Erkennung. Erste Fahrt immer mit „Zum Nullpunkt“ prüfen.

## Erste Inbetriebnahme: Prüfliste (ohne Werkstück, ca. 15 Minuten)

Alles in FräsStudio ist mit einer simulierten Maschine getestet – an der echten Maschine bitte einmal so prüfen:

1. **Start & Verbindung:** Programm starten, per USB verbinden → Konsole zeigt „Grbl …“, Zustand „Bereit“ bzw. „Alarm“ → „Entsperren“.
2. **Richtungen:** Mit 10-mm-Schritten X+, Y+, Z+ fahren – Fräser muss nach rechts, nach hinten, nach oben. Sonst `$3` in den Maschineneinstellungen anpassen.
3. **Z antasten:** Messplatte drunter, „Z antasten“ – die Spindel stoppt beim Kontakt und fährt 5 mm hoch, Anzeige Z = Plattenhöhe + 5.
4. **Probeprojekt:** Beispielprojekt laden → Fräsen → „Aktuelles Projekt laden“ → **„G-Code prüfen (Trockenlauf)“** muss „ohne Fehler“ melden.
5. **Luftlauf:** Z-Nullpunkt 20 mm **über** dem Tisch setzen, Spindel aus, Start. Prüfen: fährt erst hoch, dann zur ersten Bahn, Bewegungen flüssig (Bögen), Werkzeugwechsel-Pause erscheint und lässt sich nicht überspringen, „Pause“/„Weiter“ und „Stopp“ halten sofort an.
6. **Umriss abfahren:** zeigt das Rechteck um alle Bahnen in sicherer Höhe.
7. **Fortsetzen:** Luftlauf mittendrin stoppen → „Fortsetzen ab Zeile…“ → fährt hoch, zur Stelle, taucht ein und läuft weiter.
8. **Erstes echtes Werkstück:** Reststück, Gravur 0,5 mm tief – danach Tiefe mit dem Messschieber prüfen.

Bei Abweichungen: Bildschirmfoto der Konsole und die ersten 20 G-Code-Zeilen schicken.

## Inlay (Einlegearbeit)

Zwei Hölzer ineinander: z. B. dunkle Nuss-Schrift in heller Ahorn-Platte.
1. Form/Text auswählen → Fräsbahnen → **Inlay**. Es entstehen zwei Bahnen: **Tasche (Grundbrett)** und **Einleger (zweites Brett)** – der Einleger ist automatisch gespiegelt und zunächst ausgeschaltet.
2. Grundbrett einspannen, nur die Tasche fräsen (V-Fräser, flache Böden mit Schaftfräser).
3. Zweites Brett einspannen, Häkchen umsetzen, Einleger fräsen (gleicher V-Fräser!). Einleger mit ca. 5 mm Rand aussägen.
4. Einleger umdrehen, mit Leim in die Tasche pressen, nach dem Trocknen den Überstand abhobeln/planfräsen.

Taschentiefe (Standard 3 mm) und Leimspalt (0,5 mm) gelten für beide Teile. Die Passung ist in den Tests simuliert (Einleger umgedreht eingesetzt): Fuge an den Wänden unter 0,6 mm.

## Antasten X/Y/Z, Höhenkarte, Prüflauf, Makros

- **XYZ an Ecke antasten…** (Fräsen-Schritt): mit einer Eck-Antastplatte (zwei Lippen an linker und vorderer Kante) setzt FräsStudio X0/Y0 auf die Werkstückecke und Z0 auf die Oberfläche. Plattendicke, Lippenstärke und Fräser-Ø einstellen.
- **Höhenkarte…**: tastet die Oberfläche im Raster ab (nur leitfähig: Leiterplatte, Alu, Kontaktfolie) und passt den Auftrag an – für gleichmäßig tiefe Gravuren auf welligem Material.
- **G-Code prüfen (Trockenlauf)**: GRBL liest das ganze Programm im Prüfmodus ($C), ohne zu fahren, und meldet Fehler.
- **Maschineneinstellungen ($$)**: GRBL-Werte mit deutscher Erklärung ansehen und ändern.
- **Makros**: eigene Knöpfe mit G-Code (z. B. Parkposition, Z hoch). **Eilgang-Override** 25/50/100 %.

## Schriften

57 Schriften sind eingebaut (Block, Serifen, Schreib- und Handschrift, Schablone, Fraktur, Western, Comic, Technik, Weihnachten …), nach Art sortiert. Im Text-Dialog zeigt „Alle Schriften mit deinem Text ansehen“ eine Vorschau-Galerie. Mit **„Eigene Schrift laden (.ttf)…“** kommen eigene TrueType-Schriften dazu; sie bleiben im Browser bzw. im Desktop-Programm gespeichert. Fehlt einer Schrift ein Zeichen (z. B. Ø), wird es sinnvoll ersetzt (O). Für feine Gravuren eignen sich kräftige Schriften besser als sehr dünne Schreibschriften.

## Sicher fräsen: Auftrag, Unterbrechung, Fortsetzen

- **Umriss abfahren:** fährt das Rechteck um alle Schnitte in sicherer Höhe ab – so siehst du vorher, ob alles auf dem Werkstück liegt.
- **Fortsetzen ab Zeile…:** nach Abbruch, Verbindungsverlust oder Neustart der Steuerung ab einer Zeile weiterfräsen. Spindel, Vorschub und Position werden davor wiederhergestellt; die vorgeschlagene Zeile liegt etwas vor der Abbruchstelle.
- Bei einem **G-Code-Fehler** hält der Auftrag an (statt von falscher Position weiterzufräsen). **Trennen** oder ein **Neustart der Steuerung** beenden den Auftrag sicher.
- **Werkzeugwechsel** (auch `T2 M6`) lässt sich nicht versehentlich überspringen; schlägt das Antasten fehl, bleibt der Auftrag stehen und es kann neu angetastet werden.
- Während der Auftrag läuft, sind Nullpunkt-, Verfahr- und Konsolenbefehle gesperrt (Pause drücken, dann geht es).
- Kreisbögen werden als **G2/G3** ausgegeben: deutlich kleinere Dateien, flüssigere Bewegung.

## Ausgefranste Kanten vermeiden

1. **Spanlast prüfen:** FräsStudio zeigt bei Kontur, Tasche und Planfräsen die Spanlast (mm je Zahn). Zu klein = der Fräser reibt statt zu schneiden (Fransen, Brandspuren) – „Empfehlung übernehmen“ setzt Vorschub bzw. Drehzahl. Gerade mit dem 800-W-Motor (Drehregler) ist die Drehzahl für 3-mm-Fräser oft zu hoch.
2. **Vorritzen** (Kontur, standardmäßig an): flacher Schnitt auf der Endkontur, dann tief – die Oberkante reißt nicht aus. **Gleichlauf** ist der Standard (außen gegen, in Löchern und Taschen mit dem Uhrzeigersinn – bei Spindel M3).
3. **Aufmaß + Schlichtgang** (Kontur): erst mit 0,2–0,3 mm Aufmaß schruppen, dann ein Gleichlauf-Durchgang auf Endmaß.
4. **Fräser:** scharf, bei Sperrholz/Multiplex ein Kompressionsfräser (Up-/Down-Cut), bei MDF/Weichholz ein 2-Schneider-Spiralfräser. Stumpfe Fräser fransen immer.
5. Werkstück fest einspannen (Vibration), Gleichlauf wählen, Z-Null stimmig setzen.
6. **Dogbones** (Kontur und Tasche): Innenecken werden freigefräst, damit eckige Zapfen und Bretter in Taschen passen.
7. **Schlichtgang** gibt es jetzt auch bei Taschen (Aufmaß Rand > 0).

## Größere Spindel (500 W / 800 W)

Unter **Bearbeiten → Maschine…** das passende Profil wählen:

| Profil | Drehzahl | Wirkung in FräsStudio |
|---|---|---|
| TTC450 80 W (Standard) | 8.000 U/min, per Programm | Werkzeugwerte wie in der Bibliothek |
| TTC450 500 W | bis 12.000 U/min, per Programm | Zustellung ca. ×2, Vorschub ×1,4 |
| TTC450 800 W (Twotrees-Fräsmotor-Satz) | 10.000–30.000 U/min am **Drehregler** (6 Stufen) | Zustellung ca. ×2,5 (höchstens 1× Fräserdurchmesser), Vorschub ×1,5, Drehzahl je nach Fräser |

Beim 800-W-Motor schaltet FräsStudio den Motor nur ein und aus. Die passende **Reglerstufe** steht bei jeder Fräsbahn, in der Start-Checkliste, im G-Code und beim Werkzeugwechsel.
Der Vorschub bleibt auf den Höchstwert der Achsen (1000 mm/min) begrenzt. Der Gewinn kommt vor allem von den tieferen Zustellungen, im Beispielschild etwa 11 statt 32 Minuten.
Leistung, Drehzahlbereich und Stufen lassen sich auch für eigene Spindeln eintragen.

## Ziehen und Ablegen

Bilder, SVG, DXF, STL, G-Code und Projekte können direkt auf die Zeichenfläche gezogen werden.

## Tastatur

| Taste | Wirkung |
|---|---|
| V R L Q K P S T M | Auswahl, Umformen, Linie, Rechteck, Kreis, Vieleck, Stern, Text, Messen |
| Enter / Rücktaste / Esc | Linie fertig / letzten Punkt weg / abbrechen |
| Leertaste halten | Ansicht verschieben (Maus bewegen oder ziehen); beim Umformen mit gewähltem Punkt: Ecke ↔ Kurve |
| Zwei Finger / Mausrad | Ansicht verschieben; Finger spreizen oder Strg + Rad = Zoom (im Menü Ansicht auf „Rad = Zoom“ umstellbar) |
| Pfeiltasten | Objekte verschieben (Umschalt 10 mm, Alt 0,1 mm); im Schritt 4: Maschine verfahren |
| 1 2 3 4 | Arbeitsschritt wechseln |
| ↶ ↷ (oben in der Leiste) | Rückgängig / Wiederholen, auch Strg+Z / Strg+Y |
| 3D-Vorschau | Links ziehen = drehen · Leertaste halten, zwei Finger, rechte Maustaste oder Pfeiltasten = verschieben · Spreizen / Strg + Rad = zoomen · Knöpfe unten rechts |
| F, G, C | Alles zeigen, Raster fangen, Kamerabild ein/aus |
| Strg+Z / Y / C / V / D / A / S / O / E / I | Rückgängig, Wiederholen, Kopieren, Einfügen, Duplizieren, Alles, Speichern, Öffnen, G-Code, Import |

## Erste Schritte mit der TTC450

1. **Neues Projekt** → Werkstückgröße und Material eingeben, Nullpunkt „links unten“, Z „Materialoberfläche“.
2. Zeichnen oder importieren, Objekte auswählen → **Fräsbahnen** → z. B. „Kontur“ (Ausschneiden, Haltestege an) oder „V-Carving“ (Schrift).
3. **3D-Vorschau** prüfen.
4. **Fräsen** → „Verbinden (USB)“ → Fräser mit den Pfeilen über die linke untere Ecke des Werkstücks fahren → „X0“, „Y0“ → Z antasten (oder mit Papier, dann „Z0“) → „Aktuelles Projekt laden“ → **Start**.

Ohne USB: **Datei → G-Code speichern**, „je Werkzeug eine Datei“, auf die SD-Karte kopieren und am Display der TTC450 starten.

Wenn die Maschine beim Verbinden nicht in der Liste erscheint: CH340-USB-Treiber installieren und Candle/LaserGRBL schließen (nur ein Programm darf den Anschluss nutzen).

## Dateien

| Endung | Inhalt |
|---|---|
| `.fsp` | FräsStudio-Projekt (Zeichnung, Fräsbahnen, Werkzeuge, Werkstück) |
| `.nc` / `.gcode` / `.tap` | G-Code für GRBL |
| `.svg` | Zeichnung exportieren (für andere Programme) |

## Technik

Reines HTML/JavaScript ohne Build-Schritt. Polygon-Versatz und Boolesche Operationen: [Clipper](http://www.angusj.com) (Boost Software License, `js/lib/clipper.js`).
Schriften: SIL Open Font License (`js/lib/LIZENZEN.txt`). 3D-Darstellung mit WebGL2.

| Datei | Aufgabe |
|---|---|
| `js/core.js` | Geometrie, Kurven, Matrizen, Polygon-Verrechnung |
| `js/shapes.js` | Zeichenobjekte |
| `js/ttf.js` | TrueType-Schriften → Umrisse |
| `js/importers.js` | SVG, DXF, STL, Bilder |
| `js/tools.js` | Werkzeuge, Materialien, Maschinenprofile |
| `js/cam.js` | Fräsbahnen |
| `js/gcode.js` | G-Code schreiben und lesen |
| `js/sim.js`, `js/view3d.js` | Abtrag-Simulation und 3D-Ansicht |
| `js/camera.js` | Kamerabild entzerren |
| `js/depthai.js`, `js/lib/ort/` | KI-Tiefenschätzung (ONNX Runtime Web, MIT) |
| `js/machine.js` | GRBL-Steuerung über USB, WLAN-Brücke oder WLAN direkt |
| `js/app.js` | Bedienoberfläche |

Tests: `node fraesstudio/tests/test_cam.js` (Fräsbahnen, G-Code, Importe, Simulation) und `node fraesstudio/tests/test_machine.js` (Maschinensteuerung: Verbindungsprüfung, Roh-Bytes, Streaming, Werkzeugwechsel).

**Sicherheit:** Fräsen ist gefährlich. Jede Fräsbahn in der 3D-Vorschau prüfen, Schutzbrille tragen und während des Fräsens an der Maschine bleiben.
