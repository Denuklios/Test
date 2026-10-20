# LaserStudio – Entwerfen, Vorschau und Lasern in einem Programm

Ein eigenständiges Laserprogramm im Browser, ohne Installation und auch offline nutzbar. Es ist für **GRBL-Laser** gedacht: Diodenlaser und CO2-Laser mit GRBL-Steuerung, z. B. MKS DLC32, GRBL-ESP32 oder die Twotrees TTC450 mit Lasermodul.
LaserStudio ist ein **eigenes Programm** und kein Teil von FräsStudio oder StickStudio. Zeichnungen aus FräsStudio lassen sich aber übernehmen (*Datei → Zeichnung aus FräsStudio-Projekt*).

## Starten

`index.html` doppelklicken, am besten in **Google Chrome** oder **Microsoft Edge**. Nur diese Browser können den Laser per USB steuern und die Kamera einbinden.
Das Projekt wird automatisch im Browser zwischengespeichert.

## Was aus welchem Programm übernommen ist

Für LaserStudio habe ich mir die bekannten Laserprogramme angesehen und ihre besten Funktionen zusammengeführt. Der Programmcode ist komplett neu geschrieben, es ist kein fremder Code enthalten.

| Vorbild | Übernommene Idee | In LaserStudio |
|---|---|---|
| **LightBurn** | Farbe = Ebene mit eigener Leistung/Geschwindigkeit, Modi Linie/Füllen/Versatzfüllung/Bild | Farbpalette oben, Ebenenliste rechts, Reihenfolge per ▲ |
| LightBurn | Materialtest-Generator (Raster Leistung × Geschwindigkeit) | *Werkzeuge → Materialtest* (beschriftet, mit Laufzeit) |
| LightBurn | Kamera-Ausrichtung mit gebrannten Marken, Linsenkorrektur | *Kamera einrichten* → „Marken brennen“, 4 Kreuze anklicken |
| LightBurn | Rahmen fahren, Startposition (absolut / aktuelle Position / Nullpunkt), Bezugspunkt | Schritt 3 „Lasern“ |
| LightBurn | Überfahrt (Overscan), Kreuzschraffur, Schraffurwinkel, Haltestege, Schnittspalt | Einstellungen der Ebene |
| LightBurn | Bildmodi Schwelle, Raster, Atkinson, Floyd-Steinberg, Jarvis, Stucki, Zeitungsdruck, Skizze, Graustufen | Doppelklick aufs Bild |
| **LaserGRBL** | Lasersteuerung, $$-Einstellungen, Überschreiben von Leistung und Geschwindigkeit während des Laufs | Schritt 3, „Prüfen“, Leistung/Geschwindigkeit ±10 % |
| LaserGRBL | Weiße Bildbereiche überspringen, Zeile für Zeile in beide Richtungen | automatisch bei Bildern |
| **xTool Creative Space** | Materialbibliothek mit Startwerten, Umriss aus dem Kamerabild erkennen | *Bearbeiten → Materialbibliothek*, *Werkzeuge → Umriss aus dem Kamerabild* |
| **Rayforge** | Schnittspalt-Ausgleich, Wegoptimierung, mehrere Durchgänge mit Z-Absenkung | Ebene: „Schnittspalt“, „Z tiefer je Durchgang“ |
| **FräsStudio** (eigenes Programm) | Zeichenwerkzeuge, Schriften, SVG/DXF-Import, Bild nachzeichnen, GRBL-Anbindung per USB/WLAN, Kamera-Entzerrung | gleiche Bedienung (Linksklick Ecke, Rechtsklick Kurve) |

## Was LaserStudio besser macht als LightBurn

- **Kamera mit Höhenausgleich:** Laut LightBurn-Forum stimmt die Kamera-Ausrichtung dort nur bei der Materialhöhe, bei der ausgerichtet wurde. In LaserStudio wird nur die Materialstärke unten rechts eingetragen, das Kamerabild passt sich an. Dafür muss einmal die Kamerahöhe eingetragen werden.
- **Leistung je Objekt:** Einzelne Objekte können eigene Werte haben, ohne dass für jede Einstellung eine Ebene nötig ist. Der Materialtest nutzt das.
- **Seriennummern:** *Mehrfach anordnen* zählt die letzte Zahl im Text hoch („Nr. 001“, „Nr. 002“ …).
- **Text im Bogen** direkt im Textdialog, z. B. für runde Untersetzer.
- **Zwei Rahmen:** Rechteck oder enger Umriss, wahlweise mit schwachem Laser, damit man ihn sieht.
- **Bild-Vorschau** zeigt schon beim Entwerfen, wie das gerasterte Bild gebrannt wird (Häkchen „gerastert anzeigen“).
- **Vorschau mit Abspielen** und Laufzeit je Ebene, mit Warnungen, wenn der Auftrag über den Arbeitsbereich hinausragt.
- **Prüfen-Knopf:** Er liest `$$` und schaltet bei Bedarf den Lasermodus ein (`$32=1`). Außerdem übernimmt er S-Max, Arbeitsbereich und Höchstgeschwindigkeit aus der Steuerung.
- Kostenlos, ohne Installation, ohne Konto.

## Die drei Arbeitsschritte

| Schritt | Was passiert |
|---|---|
| **1 Entwerfen** | Zeichnen, Text, SVG/DXF (Farben werden Ebenen), Fotos und Logos. Farbe oben anklicken = Ebene zuweisen. Rechts die Einstellungen der Ebene. |
| **2 Vorschau** | Zeigt, was gebrannt wird (Dunkelheit = Leistung), mit Leerfahrten, Abspielen, Laufzeit und Warnungen. |
| **3 Lasern** | Per USB oder WLAN verbinden, verfahren, Nullpunkt, Zielpunkt/Testpuls, Rahmen, Start/Pause/Stopp, Leistung und Geschwindigkeit live anpassen, Konsole. Ohne Verbindung: *Datei → G-Code speichern*. |

## Ebenen

| Modus | Wofür |
|---|---|
| **Linie** | Schneiden oder Ritzen genau auf der Linie. Innere Formen werden vor äußeren geschnitten, damit nichts verrutscht. Dazu Haltestege, Schnittspalt und Durchgänge mit Z-Absenkung. |
| **Füllen** | Flächen Zeile für Zeile gravieren, mit Zeilenabstand, Winkel, Kreuzschraffur, Überfahrt und Hin-und-Her-Fahrt. Weit auseinanderliegende Teile werden getrennt gefüllt, ohne lange Leerfahrten. |
| **Versatzfüllung** | Umrisslinien von außen nach innen, gut für schmale Formen. |
| **Bild** | Fotos und Logos Pixel für Pixel. Rastermodus, Helligkeit, Kontrast, Gamma, Schärfen und Umkehren stellst du per Doppelklick aufs Bild ein. Bei Graustufen liegt die Leistung zwischen Min. und Max. |

Ebenen oben in der Liste werden zuerst gelasert, also z. B. erst gravieren, dann ausschneiden. ◉/○ schließt eine Ebene vom Lasern aus, ●/◌ blendet sie aus.
„Feste Leistung (M3)“ ist für Spezialfälle gedacht. Normal ist M4: Dabei passt GRBL die Leistung an die Geschwindigkeit an, und die Ecken brennen nicht stärker.

## Kamera

1. Eine USB-Kamera fest über dem Laser montieren.
2. *Werkzeuge → Kamera einrichten*: Pappe auf die Auflage legen und „Marken brennen“ drücken (der Laser muss verbunden sein). Er brennt 4 Kreuze an bekannten Stellen.
3. Im Kamerabild die 4 Kreuzmitten in der Reihenfolge 1–4 anklicken. Das blaue Raster muss auf dem Arbeitsbereich liegen. Sind die Linien gebogen, die Linsenkorrektur verstellen.
4. Die Kamerahöhe über der Auflage eintragen.
5. Danach zeigt Taste **C** das entzerrte Livebild unter der Zeichnung. Motive lassen sich so genau aufs echte Werkstück setzen.

Weitere Funktionen:
- **Umriss aus dem Kamerabild erkennen**: Ein Teil auf die Auflage legen, Umriss nachzeichnen, wahlweise mit Rand. Die Linie liegt danach an der richtigen Stelle, z. B. zum Ausschneiden passender Einlagen oder für eine Gravur genau auf einem vorhandenen Teil.
- **Kamerabild als Bild übernehmen**: Das Bild landet als Vorlage in einer ausgeschalteten Ebene.

## Verbinden

| Weg | Wann |
|---|---|
| **USB** | Am sichersten (Chrome/Edge). Den Anschluss wählen, meist „USB-SERIAL CH340“ oder „CP210x“. |
| **WLAN direkt** | Für ESP32-Steuerungen (GRBL-ESP32, FluidNC), wenn LaserStudio per Doppelklick geöffnet ist |
| **WLAN über den Server** | Nur, wenn LaserStudio über einen eigenen Server mit Telnet-Brücke läuft |

Nur ein Programm kann den Laser gleichzeitig nutzen, also LightBurn, LaserGRBL usw. vorher schließen.
Laser mit eigener Steuerung (Ruida, Trocen, xTool-Protokoll) sprechen kein GRBL. Für sie die Zeichnung als SVG speichern und im Herstellerprogramm laden.

## Tastatur

| Taste | Wirkung |
|---|---|
| V R L Q K P S T M | Auswahl, Umformen, Linie, Rechteck, Kreis, Vieleck, Stern, Text, Messen |
| 1 2 3 | Arbeitsschritt wechseln |
| F · G · C | Alles zeigen · Raster fangen · Kamerabild ein/aus |
| Pfeiltasten | Objekte verschieben (Umschalt 10 mm, Alt 0,1 mm); in „Lasern“: Laser verfahren |
| Alt + Klick (Lasern) | Laser an diese Stelle fahren |
| Leertaste halten / zwei Finger | Ansicht verschieben; Strg + Rad oder Spreizen = Zoom |
| Strg+Z/Y/C/V/D/A/S/O/E/I | Rückgängig, Wiederholen, Kopieren, Einfügen, Duplizieren, Alles, Speichern, Öffnen, G-Code, Importieren |

## Dateien

| Endung | Inhalt |
|---|---|
| `.lsp` | LaserStudio-Projekt (Zeichnung, Ebenen, Bilder) |
| `.gcode` / `.nc` | G-Code für GRBL (M4-Lasermodus, S0–S-Max) |
| `.svg` | Zeichnung mit Ebenenfarben, z. B. für LightBurn oder andere Programme |
| `.fsp` | FräsStudio-Projekt (nur Import der Zeichnung) |

## Technik

Reines HTML/JavaScript ohne Build-Schritt.

| Datei | Aufgabe |
|---|---|
| `js/laser.js` | Ebenen → Laserbahnen (Linie, Füllen, Versatz, Bild), Reihenfolge, G-Code, Laufzeit, Materialtest, Rahmen |
| `js/dither.js` | Bildbearbeitung und Rastermodi |
| `js/library.js` | Maschinenprofile und Materialbibliothek |
| `js/camera.js` | Kamerabild entzerren, Linsen- und Höhenausgleich |
| `js/machine.js` | GRBL-Steuerung über USB oder WLAN |
| `js/core.js`, `js/shapes.js`, `js/ttf.js`, `js/importers.js` | Geometrie, Formen, Schriften, SVG/DXF-Import, Nachzeichnen |
| `js/app.js` | Bedienoberfläche |

Tests: `node laserstudio/tests/test_laser.js` (Laserbahnen, G-Code, Bilder, Materialtest, Kamera-Mathematik, Streamen) und `node laserstudio/tests/test_machine.js` (GRBL-Steuerung).
Polygonberechnung: [Clipper](http://www.angusj.com) (Boost Software License). Schriften: SIL Open Font License (`js/lib/LIZENZEN.txt`).

## Sicherheit

Lasern ist gefährlich: Es drohen Augenschäden, Brand und giftige Dämpfe.
- Schutzbrille für die Wellenlänge deines Lasers tragen.
- Nie unbeaufsichtigt lasern.
- Absaugung bzw. Lüftung einschalten.
- Feuerlöscher griffbereit haben.
- **Kein PVC/Vinyl** lasern (dabei entsteht Chlorgas).

Die Werte der Materialbibliothek sind Startwerte. Vorher immer einen Materialtest machen.
