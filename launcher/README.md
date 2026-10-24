# WF Launcher (Android)

Startbildschirm-App im Stil der Wunsch-Fabrik: fast schwarzer Hintergrund mit violettem Schimmer,
Farben `#8B2BE2 / #A855F7 / #C9A0FF`, Schriften Cormorant Garamond (Uhr, Überschriften) und Outfit (Text),
WF-Logo als App-Symbol, unten eine Leiste mit dem runden violetten Knopf wie in der Auftrags-App.

Fertige APKs – Android 6.0 oder neuer:
- [`dist/WF-Launcher-2.2.apk`](dist/WF-Launcher-2.2.apk) – **normale Version**, direkt aufs Handy laden und installieren.
- [`dist/WF-Launcher-2.2-voll.apk`](dist/WF-Launcher-2.2-voll.apk) – **Vollversion** mit Benachrichtigungen im
  WF-Schnellbereich. Google Play Protect blockiert Apps mit Benachrichtigungs-Zugriff, wenn man sie aus dem Browser
  oder Dateimanager installiert; daher per PC installieren (siehe unten).

## Bedienung

| Was | Wie |
|---|---|
| Alle Apps | Violetten Knopf unten antippen oder nach oben wischen |
| Suchen | „Apps durchsuchen“ antippen; Enter startet den ersten Treffer, sonst Websuche. Findet auch Anfangsbuchstaben („gm“ → Google Maps) und Umlaute ohne Umlaut |
| Favoriten | Lange auf eine App tippen → „Zum Startbildschirm“. Die ersten 4 liegen in der Leiste unten, die übrigen darüber |
| Reihenfolge | Lange auf einen Favoriten → „Nach vorne“ / „Nach hinten“ |
| App-Menü | Umbenennen, in der App-Liste ausblenden, App-Info, Deinstallieren |
| WF-Schnellbereich | Auf dem Startbildschirm nach unten wischen (siehe unten) |
| Uhr / Datum | Antippen öffnet Wecker bzw. Kalender |
| Einstellungen | Lange auf eine freie Stelle tippen oder ⋮ in der App-Liste: Hintergrund (Wunsch-Fabrik oder eigenes Bild), Spalten, Symbolgröße, Uhr, App-Namen, ausgeblendete Apps |

Apps aus dem Arbeitsprofil werden mit Aktentaschen-Symbol angezeigt. Neu installierte oder gelöschte Apps
erscheinen bzw. verschwinden sofort.

## Extras (ab 2.0)

Alles unter Launcher-Einstellungen (lange auf eine freie Stelle tippen):

| Extra | Was es macht |
|---|---|
| **Heute in der Werkstatt** | Karte unter der Suche mit den heute geplanten, heute abzugebenden und überfälligen Aufträgen: Uhrzeit, Menge, Titel, Kunde, Verfahren, Status, Foto. Einrichtung: in der Auftrags-App unter Einstellungen → Werkstatt-Anzeige einen neuen Link erzeugen (z. B. „Handy“) und im Launcher einfügen. Der Link am Werkstatt-PC bleibt gültig. Aktualisiert sich alle 5 Minuten, Antippen öffnet die Auftrags-App. |
| **Termine** | Nächster Termin (heute/morgen) unter der Uhr; fragt einmal nach Kalender-Zugriff. Antippen öffnet den Termin. |
| **Wetter** | Ort eintragen → aktuelle Temperatur, Wetter, Höchst-/Tiefstwert (Open-Meteo, ohne Konto). |
| **Arbeit & Feierabend** | Arbeitszeit und -tage festlegen, Arbeits-Apps auswählen (oder lange auf eine App → „Als Arbeits-App markieren“). Zur Arbeitszeit stehen sie als eigene Reihe auf dem Startbildschirm, nach Feierabend sind sie ausgeblendet (Suche findet sie trotzdem). Optional schaltet sich nach Feierabend „Nicht stören“ ein und morgens wieder aus – auch wenn der Launcher nicht offen ist. Der Knopf unter der Uhr schaltet von Hand um, bis zum nächsten planmäßigen Wechsel. |
| **Ordner** | Lange auf eine App → „In Ordner legen …“ → bestehender oder neuer Ordner. Ordner antippen öffnet ihn; lange auf den Ordner: umbenennen, verschieben, auflösen. Lange auf eine App im Ordner: herausnehmen. |
| **Schnellnotiz** | Auf dem Startbildschirm nach links wischen. Notiz schreiben, speichern; antippen zum Bearbeiten, „Teilen“, „Löschen“. „→ Auftrag“ kopiert die Notiz und öffnet „Neuer Auftrag“ – dort lange tippen → Einfügen. Nach rechts wischen schließt. |

## Alles andere im WF-Look

Den echten Android-Bereich zum Herunterziehen darf eine App ohne Root nicht ersetzen. Stattdessen gibt es drei Bausteine
(Einstellungen des Launchers: lange auf eine freie Stelle tippen → „Launcher-Einstellungen“):

**1. Lila Systemfarben** – „WF-Hintergrundbild fürs ganze Handy“ setzt ein schwarz-violettes Bild mit WF-Logo
(Vorschau: [`dist/Vorschau-Hintergrundbild.png`](dist/Vorschau-Hintergrundbild.png)) für Start- und Sperrbildschirm.
Nothing OS leitet daraus die Farben für Schnellzugriff, Einstellungen und Tastatur ab. Falls die Farben nicht
umspringen: Android-Einstellungen → Personalisierung → Farben → die Variante „aus dem Hintergrundbild“ wählen.

**2. WF-Kacheln im echten Schnellzugriff** – „Aufträge“, „Neuer Auftrag“, „WF-Kalender“ (öffnen
wunsch-fabrik.dk/auftraege, bzw. die installierte Auftrags-App) und „Alle Apps“. Über „WF-Kacheln hinzufügen“
fragt Android je Kachel nach; sonst von oben zweimal herunterziehen → Stift → Kacheln nach oben ziehen.

**3. WF-Schnellbereich** – auf dem Startbildschirm nach unten wischen:
- Uhr, Datum, Akku, Zahnrad zu den Einstellungen
- Schalter: WLAN, Internet, Bluetooth, Taschenlampe, Nicht stören, Flugmodus, Standort, Drehen
- Regler für Helligkeit und Medienlautstärke
- Benachrichtigungen (nur Vollversion; die normale Version hat dort einen Knopf zum Android-Bereich): antippen öffnet, zur Seite wischen löscht, „Alle löschen“, direkt **antworten**
  (WhatsApp, SMS, Signal …) und weitere Knöpfe wie „Als gelesen markieren“
- Nach oben wischen, Zurück oder „Schließen“ macht ihn wieder zu

Was Android nicht erlaubt: WLAN, Bluetooth, Flugmodus und Standort direkt umschalten. Ein Tipp öffnet dort das kleine
System-Fenster bzw. die Einstellungsseite. Taschenlampe, Nicht stören, Drehen, Helligkeit und Lautstärke schalten direkt.
In anderen Apps kommt beim Herunterziehen weiter der normale Android-Bereich (in den Launcher-Einstellungen lässt sich
das Wischen auch auf den Android-Bereich umstellen).

**Einmalige Freigaben** (der Schnellbereich führt jeweils dorthin):
- *Benachrichtigungen:* „Zugriff auf Benachrichtigungen“ → WF-Schnellbereich einschalten. Ist der Schalter ausgegraut
  („Eingeschränkte Einstellung“, weil die APK nicht aus dem Play Store kommt): Einstellungen → Apps → WF Launcher →
  ⋮ oben rechts → „Eingeschränkte Einstellungen zulassen“, danach erneut einschalten.
- *Helligkeit und Drehen:* „Systemeinstellungen ändern“ für WF Launcher erlauben.

## Installation

Normale Version:

1. APK aufs Handy laden und öffnen, „Installation aus unbekannten Quellen“ erlauben.
2. „WF Launcher“ einmal öffnen: Android fragt „Als Standard-Startbildschirm festlegen?“ → WF Launcher wählen.
   Kommt keine Frage: violetten Hinweis oben antippen, oder Einstellungen → Apps → Standard-Apps →
   Startbildschirm-App → WF Launcher.
3. Zurück zum alten Launcher: Android-Einstellungen → Apps → Standard-Apps → Startbildschirm-App.

Vollversion per PC (ADB) – Play Protect blockiert diesen Weg nicht:
1. Am Handy: Einstellungen → Über das Telefon → 7× auf „Build-Nummer“ tippen → Entwickleroptionen →
   „USB-Debugging“ einschalten.
2. Am PC die „SDK Platform-Tools“ von Google entpacken, Handy per USB anschließen, am Handy „Zulassen“ tippen.
3. `adb install -r WF-Launcher-2.2-voll.apk` – ersetzt die normale Version, Einstellungen bleiben (gleicher Schlüssel).
4. USB-Debugging danach wieder ausschalten.

## Selbst bauen

Ohne Gradle und ohne Google-SDK, nur mit Paketen aus Ubuntu/Debian:

```sh
sudo apt install openjdk-17-jdk android-sdk-build-tools android-sdk-platform-23 dalvik-exchange apksigner zipalign
./build.sh            # führt die Tests aus, Ergebnis: dist/WF-Launcher-2.2.apk und -voll.apk
```

`keystore/wf-launcher.jks` ist der Signierschlüssel (Passwort `wflauncher`). Für Updates immer denselben
Schlüssel verwenden, sonst muss die App vorher deinstalliert werden.

`stubs/` enthält nur Platzhalter für neuere Android-Klassen (Schnellzugriff-Kacheln), damit gegen
android-23.jar kompiliert werden kann; sie landen nicht in der APK.

Farben und Schriften stehen zentral in `src/de/wunschfabrik/launcher/WfStyle.java`.
Die Schriften stehen unter der SIL Open Font License (`assets/fonts/*-OFL.txt`).
