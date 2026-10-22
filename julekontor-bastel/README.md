# Julekontor Bastelwerkstatt

Preisrechner für Bastelprojekte im Julekontor-Design. Läuft im Browser, auch am Handy und offline.

## So funktioniert es

1. **Materiallager:** Jede Rolle, Packung oder Flasche einmal eintragen, z. B.
   - Bastelpapier: Rolle 100 m × 70 cm für 80 € (Fläche)
   - Draht: Rolle 200 m für 3,99 € (Länge)
   - Perlen: 150 Stück für 4,50 € (Stück)
   - Kleber: 250 ml für 5,95 € (Menge), oder Gewicht in g/kg
   - Keramik-Gießpulver: 5 kg für 20 €, Mischverhältnis Pulver : Wasser 100 : 30 (Gießpulver). Im Projekt die fertige Gießmasse eingeben, die App rechnet Pulver und Wasser aus.
   - Silikonform: 15 €, hält ca. 50 Abgüsse (Form/Werkzeug) → 0,30 € pro Benutzung
   - Beim Anlegen gibt es **Vorlagen** für über 70 typische Bastelmaterialien (Papier, Filz, Bänder, Gießen, Farben, Kerzen, Floristik, Verpackung …).
2. **Kategorien und Projekte** anlegen (z. B. „Weihnachtsschmuck“ → „Papierstern“).
3. Im Projekt Material hinzufügen und nur den **Verbrauch** eingeben: 20 × 20 cm Papier, 30 cm Draht, 6 Perlen. Der Preis steht sofort daneben.
4. **Arbeitszeit, Stundenlohn, Aufschlag %** und Sonstiges eingeben → Verkaufspreis.
   Rechenweg: (Material + Zeit × Lohn + Sonstiges) + Aufschlag, danach optional MwSt./Moms.
5. **Fotos:** „Foto aufnehmen“ öffnet am Handy die Kamera, „Bild hochladen“ die Galerie.

6. **Stoppuhr:** Oben im Projekt auf „Start“ tippen und nebenbei basteln. Die Uhr läuft weiter, auch wenn die App zu ist oder das Handy gesperrt. Läuft sie, zeigt eine rote Leiste unten die Zeit auf jeder Seite. „Als Arbeitszeit übernehmen“ trägt die Minuten ein; bei „Gemessen für 8 Stück“ wird die Zeit pro Stück eingetragen.
7. **Fertig & Nachbauen:** „Als fertig markieren“ legt das Projekt unter dem Filter **Fertig** ab. Dort gibst du an, wie viele Stück du nachbauen willst, und bekommst die Liste zum Bereitlegen: Menge je Material, wie viele Rollen/Packungen nötig sind, Kosten, Arbeitszeit und Verkaufswert. Mit „… als gebaut eintragen“ zählt die App mit, wie oft du es schon gemacht hast.

## Abgleich Handy ↔ PC

Wird die Werkstatt über den eigenen Server geöffnet, meldet man sich unter **Einstellungen** an. Danach sind Projekte, Material und Fotos auf allen Geräten gleich. Alle Zugänge teilen dieselben Daten (ein gemeinsames Julekontor).

- Änderungen gehen nach ca. 2 Sekunden an den Server, andere Geräte holen sie alle 30 Sekunden und beim Öffnen.
- Ohne Internet arbeitet die App weiter und gleicht später ab.
- Wurde derselbe Eintrag auf zwei Geräten geändert, gilt die neuere Änderung.

**Einrichten auf dem Server** (Ubuntu, auch neben StickStudio): Ordner auf den Server kopieren, dann `sudo bash deploy/install.sh`. Das Skript fragt nach Adresse (z. B. `bastel.julekontor.dk`), E-Mail und Passwort und richtet HTTPS, Dienst und tägliche Sicherung ein.

Lokal ausprobieren: `node --no-warnings server/server.js add-user du@julekontor.dk 'passwort'` und danach `node --no-warnings server/server.js` → http://localhost:8090

Ohne Server (Datei doppelklicken oder Claude-Link) bleiben Daten und Fotos nur auf dem jeweiligen Gerät. Unter **Einstellungen → Sicherung speichern** kann man sie trotzdem als Datei sichern.

## Dateien

- `app.html` – die App (Quelle). Nach Änderungen `python3 build.py` ausführen.
- `index.html` – daraus erzeugte, vollständige Seite zum Öffnen oder Hochladen auf den Server.
- `manifest.webmanifest`, `sw.js`, `icon-*.png` – damit man sie am Handy „Zum Startbildschirm hinzufügen“ und offline nutzen kann (nur über https).
- `logo.jpg` – Julekontor-Logo.

Zum Ausprobieren am PC: `index.html` doppelklicken. Für das Handy den Ordner auf einen Webserver mit https legen.
