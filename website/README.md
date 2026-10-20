# Produktseite (One-Page) für wunsch-fabrik.dk

Den ganzen Ordner `website/` auf den Webspace laden, fertig. Die Seite lädt nichts von fremden Servern: keine Google-Schriften, kein Tracking, also auch kein Cookie-Banner nötig.

## Aufbau

```
index.html      Deutsch (Startseite, https://wunsch-fabrik.dk/)
en/index.html   English (https://wunsch-fabrik.dk/en/)
da/index.html   Dansk   (https://wunsch-fabrik.dk/da/)
style.css       gemeinsames Design für alle drei Sprachen
links.js        Kauf-/Download-Links (für alle drei Sprachen) + kleine Seitenlogik
img/            Bilder, von allen Sprachen gemeinsam genutzt
```

Alle drei Sprachfassungen haben denselben Aufbau. Wer einen Text ändert (z. B. Preis oder Funktion), ändert ihn bitte in allen drei `index.html`.

## Kauf- und Download-Links eintragen

Nur an **einer** Stelle: oben in `links.js`, im Block `LINKS`:
- `buy`: die Kauf-Links von Lemon Squeezy je Programm
- `download`: die Links zu den Installern (z. B. GitHub-Release oder eigene Download-Seite)

Die Links gelten automatisch für Deutsch, Englisch und Dänisch. Solange ein Link leer ist, springt der Knopf zu den Preisen.

## Sprachen

- Oben im Kopf jeder Seite gibt es die Sprachwahl **DE | EN | DA**.
- Jede Seite meldet den Suchmaschinen ihre Sprachfassungen (`hreflang` für de, en, da und `x-default` = Deutsch), außerdem `<html lang>`, Titel, Beschreibung und Open-Graph-Angaben je Sprache. Die Adressen darin lauten auf `https://wunsch-fabrik.dk/` – bei anderer Domain in allen drei Dateien anpassen.
- Beim ersten Besuch der deutschen Startseite leitet ein kleines Skript je nach Browsersprache weiter: Dänisch/Norwegisch → `/da/`, Deutsch → bleibt, alles andere → `/en/`. Sobald jemand in der Sprachwahl klickt, wird die Wahl im Browser gespeichert (`localStorage`, Schlüssel `wf-lang`) und es wird nicht mehr umgeleitet. Suchmaschinen und Besucher ohne JavaScript werden nie umgeleitet.

## Rechtstexte

Die Rechtstexte (Impressum, AGB, Datenschutz, Widerruf) verlinkt die Seite auf den Server unter `studio.wunsch-fabrik.dk/legal/…`; die englische Seite hängt `?lang=en`, die dänische `?lang=da` an. Die Adresse im Fuß (`id="addr"`) mit deiner Firmenanschrift ergänzen (in allen drei Dateien).

## Bilder

`img/*.jpg` sind Bildschirmfotos der Programme, `img/*.png` die Programmsymbole. Sie lassen sich jederzeit durch eigene Fotos ersetzen (gleicher Dateiname).
