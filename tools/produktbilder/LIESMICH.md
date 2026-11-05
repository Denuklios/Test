# 3D-Bilder der Produktgruppen

Quelle der Bilder in `auftraege/assets/cat/*.webp`. Jedes Motiv ist ein kleines three.js-Modell in `scene.js` (Funktion `M.<name>`).

Neu rendern:

    npm i three@0.160.0
    php -S 127.0.0.1:8093 -t .
    node run.js ./out            # alle Motive als PNG (640 px, freigestellt)

Danach die PNGs auf 360 px zuschneiden und als WebP nach `auftraege/assets/cat/` speichern.
Zuordnung Kategorie → Bild: `CAT_IMG` und `CAT_KW` in `auftraege/assets/app.js`.
