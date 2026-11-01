# Familienkalender – Anleitung

Gemeinsamer Kalender für die ganze Familie (Android-App + kleiner PHP-Server).

## 1. Server einrichten (einmalig, ca. 5 Minuten)

Die App speichert alle Termine auf **deinem eigenen Webspace**, nicht bei Google o. ä.

1. Den Ordner `server/` als `kalender/` auf deinen Webspace hochladen
   (z. B. per FTP nach `https://deine-seite.de/kalender/`).
2. Der Webspace braucht PHP 7.4 oder neuer mit SQLite (ist fast überall dabei).
3. Im Browser `https://deine-seite.de/kalender/api.php?a=ping` öffnen.
   Steht dort `"ok":true`, läuft alles. Die Datenbank legt sich selbst an (`kalender/data/`).
4. Der Ordner `data/` ist per `.htaccess` gegen Zugriff von außen gesperrt.

## 2. App installieren

1. `Familienkalender-x.y.apk` aufs Handy laden und öffnen (Installation aus unbekannten Quellen erlauben).
2. **Erste Person:** Server-Adresse eintragen (`https://deine-seite.de/kalender`), Name der Gruppe eingeben, **Anlegen** tippen.
   Danach Namen eingeben und Farbe wählen.
3. **Alle anderen:** Im Menü ☰ → **Jemanden einladen** → Einladung per WhatsApp/SMS schicken.
   Die anderen fügen die Nachricht beim ersten Start einfach ins Feld **Einladung einfügen** ein → **Beitreten**.

## 3. Funktionen

| Funktion | So geht's |
|---|---|
| Neuer Termin | `+` oben, oder lange auf einen Tag drücken |
| Tag ansehen | Tag antippen → Liste mit allen Terminen, Feiertagen, Ferien |
| Termin per Sprache | Mikrofon-Knopf unten rechts, z. B. „Morgen um 15 Uhr Zahnarzt mit Jeannine in Flensburg“ |
| Andere hinzufügen | Im Termin unter „Wer ist dabei?“ Personen antippen → der Balken zeigt alle Farben |
| Geburtstage | Art „Geburtstag“ → immer in der Geburtstagsfarbe, jedes Jahr, mit Alter, eigene Liste unten |
| Urlaub | Art „Urlaub“ → Personen wählen → hell hinterlegter Balken mit 🌴 und Namen |
| Ganztägig / von–bis | Schalter „Ganztägig“, mehrtägige Termine laufen als durchgehender Balken |
| Wiederholung | Täglich, wöchentlich, alle 2 Wochen, monatlich, jährlich – optional mit Enddatum |
| Erinnerungen | Beliebig viele pro Termin, Standard in den Einstellungen; erinnert werden alle Beteiligten |
| Orte | Adresse eintragen, mit 🔖 speichern („Oma“, „Hundeschule“), Karte und Route öffnen |
| Fotos | Im Termin Kamera oder Galerie → alle in der Gruppe sehen die Bilder |
| Feiertage | 🇩🇪 Deutschland (nach Bundesland) und 🇩🇰 Dänemark, dazu Gedenktage wie Advent, Muttertag |
| Schulferien | 🇩🇪 je Bundesland (automatisch aus dem Internet), 🇩🇰 übliche Ferienwochen; Tage sind farbig hinterlegt mit 🎒 |

### ✨ Intelligente Checkliste (ab Version 1.1)

Die App erkennt am Titel, Ort und an den Notizen, worum es geht, und schlägt eine passende Checkliste vor.
Jeder Punkt hat seinen eigenen Fälligkeitstermin.

- **Reisen/Urlaub:** Ein paar Fragen, schon passend vorausgefüllt (Wetter, Auto/Flug/Zug/Fähre, Ausland, Unterkunft,
  Strand/Ski/Wandern/Stadt, Kinder/Baby/Hund). Daraus entstehen 40–70 Punkte, zum Beispiel:
  Reisepass 6 Wochen vorher prüfen, Ölstand/Kühlwasser 3 Tage vorher, Online-Check-in am Vortag,
  Badesachen bei warmem Ziel, Schal und Mütze bei kaltem, Kühlschrank leeren, Fenster zu …
- **Viele weitere Situationen:** Arzt, Zahnarzt (Bonusheft), Blutabnahme (nüchtern), Krankenhaus (Kliniktasche),
  Tierarzt, Geburtstage (Geschenk, Karte, runde Geburtstage), Hochzeit/Taufe, Beerdigung, Vorstellungsgespräch,
  Behörde/Bank, Werkstatt/TÜV, Schwimmbad, Sport, Schule/Elternabend, Klassenfahrt, Konzert/Kino/Festival,
  Hundeschule, Müllabfuhr (Tonne am Vorabend raus), Umzug, Prüfung, Einkauf, Ausflug …
- **Erinnerung genau dann, wenn der Punkt fällig ist.** In der Benachrichtigung gibt es **„✓ Erledigt“**.
- **Beim Entsperren:** In den letzten Tagen vor dem Termin stehen die offenen Punkte auf dem Sperrbildschirm.
  Beim Entsperren des Handys erscheint „Nicht vergessen!“ (höchstens 1× pro Stunde, am Vortag alle 30 Min.).
  Dafür wird kein Bewegungssensor gebraucht, das schont den Akku.
- Alle Beteiligten sehen dieselbe Liste und wer was abgehakt hat.

### Extras

- **Schicht-Pinsel** 🖌 (oben in der Monatsansicht): Vorlage wählen („Früh“, „Spät“, „Nacht“, „Frei“) und einfach
  auf die Tage tippen – so ist der Dienstplan in Sekunden eingetragen. Nochmal tippen entfernt ihn wieder.
  Vorlagen lassen sich in den Einstellungen ändern und gelten für alle.
- **Tagesvorschau am Morgen**: Benachrichtigung „Heute: 3 Termine …“ zur gewünschten Uhrzeit.
- **Meldung bei Änderungen**: „Jeannine hat eingetragen: Elternabend …“ (auch wenn die App zu ist, ca. alle 15 Min.).
- **Checkliste / Mitbringliste** in jedem Termin, bei Geburtstagen als **Geschenkideen**.
- **Personen-Filter**: Menü ☰ → nur die Termine bestimmter Personen anzeigen.
- **Personen ohne Handy** (z. B. Kinder) in den Einstellungen anlegen und Terminen zuordnen.
- **Suche** 🔍 über Titel, Ort, Notizen und Namen.
- **Teilen**: Termin als Text per WhatsApp & Co. verschicken.
- **Offline**: Termine lassen sich auch ohne Netz eintragen, sie werden später hochgeladen (☁ mit Strich oben = wartet).

## 4. Updates

Neue Versionen einfach über die alte installieren – die Daten bleiben erhalten.
Dafür muss jede Version mit demselben Schlüssel signiert sein (`familienkalender.jks`, nicht im Repository,
weil das Repository öffentlich ist). Den Schlüssel gut aufheben und beim nächsten Update wieder mitgeben.

## Technik

- App: Flutter (`app/`), Bau: `flutter build apk --release`
- Signatur: `app/android/key.properties` + `app/android/familienkalender.jks` (beide nicht eingecheckt)
- Server: `server/api.php`, eine Datei, SQLite-Datenbank in `server/data/`
