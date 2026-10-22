# Julekontor Bastelwerkstatt

Preisrechner für Bastelprojekte im Julekontor-Design. Läuft im Browser, auch am Handy und offline.

## So funktioniert es

1. **Materiallager:** Jede Rolle, Packung oder Flasche einmal eintragen, z. B.
   - Bastelpapier: Rolle 100 m × 70 cm für 80 € (Fläche)
   - Draht: Rolle 200 m für 3,99 € (Länge)
   - Perlen: 150 Stück für 4,50 € (Stück)
   - Kleber: 250 ml für 5,95 € (Menge), oder Gewicht in g/kg
2. **Kategorien und Projekte** anlegen (z. B. „Weihnachtsschmuck“ → „Papierstern“).
3. Im Projekt Material hinzufügen und nur den **Verbrauch** eingeben: 20 × 20 cm Papier, 30 cm Draht, 6 Perlen. Der Preis steht sofort daneben.
4. **Arbeitszeit, Stundenlohn, Aufschlag %** und Sonstiges eingeben → Verkaufspreis.
   Rechenweg: (Material + Zeit × Lohn + Sonstiges) + Aufschlag, danach optional MwSt./Moms.
5. **Fotos:** „Foto aufnehmen“ öffnet am Handy die Kamera, „Bild hochladen“ die Galerie.

Daten und Fotos bleiben nur auf dem jeweiligen Gerät (IndexedDB). Unter **Einstellungen → Sicherung speichern** eine Datei sichern und auf einem anderen Gerät mit „Sicherung laden“ einspielen.

## Dateien

- `app.html` – die App (Quelle). Nach Änderungen `python3 build.py` ausführen.
- `index.html` – daraus erzeugte, vollständige Seite zum Öffnen oder Hochladen auf den Server.
- `manifest.webmanifest`, `sw.js`, `icon-*.png` – damit man sie am Handy „Zum Startbildschirm hinzufügen“ und offline nutzen kann (nur über https).
- `logo.jpg` – Julekontor-Logo.

Zum Ausprobieren am PC: `index.html` doppelklicken. Für das Handy den Ordner auf einen Webserver mit https legen.
