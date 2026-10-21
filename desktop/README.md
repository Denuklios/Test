# Desktop-Programme mit Kauf-Lizenz

StickStudio, FräsStudio und LaserStudio gibt es zusätzlich zur Browser-Version als **installierbare Programme**: Windows (`.exe`-Installer), Mac (`.dmg`) und Linux (`.AppImage`).
Jedes Programm hat seinen eigenen Installer und seine eigene Lizenz.

## Preise und Lizenzmodell

**Kauf statt Abo:** einmal bezahlen, das Programm läuft dauerhaft. **Updates (neue Versionen) sind 1 Jahr inklusive.**
- Danach läuft die vorhandene Version einfach weiter.
- Wer neue Versionen möchte, kauft eine **Update-Verlängerung** um ein weiteres Jahr.
- Die Programme werden **nur einzeln** verkauft, es gibt kein Paket.

Preisvorschlag (Endpreis für Privatkunden, inkl. Moms):

| Programm | Kauf inkl. 1 Jahr Updates | Update-Verlängerung je Jahr |
|---|---|---|
| LaserStudio | 79 € (Einführungspreis 59 €) | 29 € |
| FräsStudio | 129 € | 39 € |
| StickStudio | 199 € | 49 € |

Die Preise legst du bei Lemon Squeezy fest. Im Programm steht kein Preis, nur die Kauf-Links.

## So funktioniert die Lizenz

1. **Testzeit:** Nach der Installation läuft das Programm 14 Tage ohne Schlüssel. In dieser Zeit fragt es beim Start einmal am Tag nach dem Lizenzschlüssel (Knopf „Weiter testen“). Eine Neuinstallation startet die Testzeit nicht neu.
2. **Kauf:** Der Kunde bekommt einen Schlüssel wie `LSR-7K2QX-M9D4T-HB3WN-R8P6C`. Das Kürzel zeigt das Programm an: `STK` = StickStudio, `FRS` = FräsStudio, `LSR` = LaserStudio. Das letzte Zeichen ist ein Prüfzeichen und erkennt Tippfehler.
3. **Freischalten:** Den Schlüssel eingeben und „Freischalten“ drücken. Das Programm meldet sich einmal bei deinem Server. Der prüft den Schlüssel, merkt sich das Gerät und schickt eine **signierte Freigabe** zurück.
4. **Zwischendurch prüfen:** Das Programm prüft die Lizenz beim Start und danach alle 3 Stunden, sobald sie fällig ist (alle 7 Tage), still im Hintergrund.
   - **Ohne Internet** läuft es bis zu 30 Tage weiter. Eine Woche vorher kommt ein Hinweis.
   - **Gesperrte Lizenz** (z. B. nach Erstattung oder Weitergabe): Das Programm sperrt sich bei der nächsten Prüfung. Vorher kann der Kunde noch speichern.
5. **Geräte:** Eine Lizenz gilt standardmäßig für **2 Geräte**, je Lizenz in der Verwaltung änderbar. Beim Rechnerwechsel meldet der Kunde das alte Gerät unter *Programm → Lizenz … → Dieses Gerät freigeben* ab. Du kannst Geräte auch in der Verwaltung freigeben.
6. **Ohne Internet:** Der Kunde schickt dir den **Gerätecode** aus dem Lizenzfenster. Du erzeugst in der Verwaltung einen Freischaltcode, Standard 365 Tage.
7. **Updates:** Jede Lizenz hat ein Datum „Updates inklusive bis“, beim Kauf 1 Jahr. Jede Programmversion trägt ihr Erscheinungsdatum.
   - Erscheint eine Version **nach** diesem Datum, öffnet sie sich nicht. Stattdessen sieht der Kunde: „Diese Version ist neuer als deine Updates – verlängern oder die bisherige Version weiter nutzen“, mit dem Knopf **„Updates verlängern“**.
   - Nach dem Kauf der Verlängerung genügt „Jetzt prüfen“.
   - Etwa **2 Wochen vor Ablauf** bekommt der Kunde eine E-Mail mit dem Verlängerungs-Link.
   - In der Verwaltung siehst und änderst du das Datum je Lizenz. Mit „+1 Jahr Updates“ verlängerst du von Hand, z. B. als Kulanz.
   - **Fehlerbehebungen** (z. B. 1.0.1) müssen laut Kaufbedingungen § 5 Abs. 4 auch Kunden mit abgelaufenen Updates bekommen. Bei reinen Fehlerbehebungen daher `released` in `settings.json` **nicht** ändern, nur `version`. Ein neues Erscheinungsdatum nur bei neuen Funktionen (1.1, 1.2 …) setzen.
   - **Wichtig:** Ältere Installer aufheben und für Kunden mit abgelaufenen Updates bereithalten, z. B. als GitHub-Release je Version. Dafür in `settings.json` bei jeder neuen Version `version` erhöhen und `released` auf das Erscheinungsdatum setzen.

**Schutz:**
- **Freigaben fälschen:** Freigaben lassen sich nicht selbst bauen. Sie sind mit dem privaten Schlüssel signiert, und den hat nur dein Server.
- **Kopierte Lizenzdatei:** Sie gilt auf einem anderen Rechner nicht, weil die Freigabe an die Gerätekennung gebunden ist.
- **Uhr zurückstellen:** Wird bemerkt und erzwingt eine Online-Prüfung.
- **Programmcode:** Er ist wie in der Online-Version zu einer verschleierten Datei gebündelt.
- **Grenze:** Einen vollständigen Kopierschutz gibt es bei keinem Programm. Wer viel Aufwand treibt, kann jede Prüfung umgehen. Für ehrliche Kunden ist das Verfahren aber bequem, und für Weitergeber ist es lästig.

## Einmal einrichten

### 1. Lizenzserver

Das ist dein vorhandener StickStudio-Server (`server/`). Er hat dafür neue Teile bekommen:
- **Verwaltung**, Reiter **„Kauf-Lizenzen (Desktop)“:** Schlüssel anlegen (einzeln oder mehrere, mit E-Mail an den Kunden), Geräte sehen und freigeben, sperren, Offline-Freischaltcodes erzeugen.
- **Lemon Squeezy:** Je Programm zwei Einmalkauf-Produkte anlegen (kein Abo): den **Kauf** und die **Update-Verlängerung (1 Jahr)**. Ihre Varianten-IDs und die Kauf-Links der Verlängerung in `/etc/stickstudio.env` eintragen:
  ```
  LICENSE_VARIANTS=123456:laser,234567:fraes,345678:stick
  LICENSE_RENEW_VARIANTS=111111:laser,222222:fraes,333333:stick
  LICENSE_RENEW_URLS="laser=https://wunsch-fabrik.lemonsqueezy.com/buy/… fraes=https://… stick=https://…"
  ```
  Was dann automatisch passiert:
  - Jeder **Kauf** legt einen Schlüssel an und schickt ihn per E-Mail. Eine Erstattung (`order_refunded`) sperrt ihn.
  - Eine **Verlängerung** verschiebt „Updates bis“ um ein Jahr. Die Lizenz wird dabei über den Schlüssel im Kauf-Link gefunden (den hängt das Programm selbst an), sonst über die E-Mail-Adresse.
- **Signaturschlüssel:** Die Datei `license-signing.pem` bekommst du separat. **Geheim halten, nicht ins Git legen.** Vor `bash deploy/install.sh` nach `deploy/license-signing.pem` kopieren, das Skript übernimmt sie nach `/var/lib/stickstudio/`.
  - Der passende öffentliche Schlüssel liegt in `desktop/license-public.pem` und steckt in jedem Installer.
  - Geht die private Datei verloren: neues Schlüsselpaar erzeugen, `license-public.pem` ersetzen, Installer neu bauen. Kunden mit alten Installern müssen dann das Update installieren.

### 2. Einstellungen für die Installer (`desktop/settings.json`)

| Eintrag | Bedeutung |
|---|---|
| `licenseServer` | Adresse deines Servers, z. B. `https://stick.deine-domain.de` (muss HTTPS sein) |
| `buyUrl` | Kauf-Link je Programm, erscheint im Lizenzfenster als „Lizenz kaufen“ |
| `renewUrl` | Kauf-Link der Update-Verlängerung je Programm, im Lizenzfenster als „Updates verlängern“ (der Schlüssel wird angehängt) |
| `released` | Erscheinungsdatum dieser Version (`2026-11-01`). Leer = Tag des Bauens |
| `trialDays` | Testzeit in Tagen (Standard 14) |
| `version` | Versionsnummer der Installer |
| `publisher` | Dein Firmenname (erscheint unter Windows als Herausgeber) |

### 3. Installer bauen

**Am einfachsten über GitHub:** Unter *Settings → Secrets and variables → Actions → Variables* die Variable `LICENSE_SERVER` anlegen. Dann unter *Actions → „Desktop-Installer bauen“ → Run workflow* starten. Nach etwa 15 Minuten liegen alle Installer (Windows, Mac, Linux) für alle drei Programme als Download bei dem Lauf.

**Selbst bauen** (Node.js 22):
```bash
cd desktop
npm ci
node build.js laser          # Installer für das eigene Betriebssystem
node build.js laser --win    # Windows-Installer (unter Linux mit Wine)
node build.js stick --mac    # nur auf einem Mac
```
Die Installer landen in `desktop/dist/`.

## Hinweise

- **Code-Signatur:** Ohne Signatur zeigt Windows beim ersten Start „Der Computer wurde durch Windows geschützt“ (→ „Weitere Informationen“ → „Trotzdem ausführen“). Der Mac verlangt Rechtsklick → „Öffnen“. Für eine Auslieferung ohne Warnung braucht es ein Code-Signing-Zertifikat (Windows) bzw. einen Apple-Entwickler-Account (99 €/Jahr). Beides lässt sich später in `build.js` ergänzen.
- **USB und Kamera** funktionieren in den Desktop-Programmen ohne Chrome. Die Anschlussauswahl erscheint als eigenes Fenster.
- **Updates:** Neue Version bauen und den Installer verteilen. Beim Installieren über die alte Version bleiben Lizenz und Einstellungen erhalten.
- **Sprachen (Deutsch, Englisch, Dänisch):** Lizenzfenster, Menü, Dialoge, Hinweise und die Anschlussauswahl folgen der im Programm gewählten Sprache (gespeichert unter `stickstudio.lang` / `fraesstudio.lang` / `laserstudio.lang`). Beim ersten Start gilt die Systemsprache (`de*` → Deutsch, `da`/`nb`/`nn`/`no` → Dänisch, sonst Englisch). Umschalten geht im Programm, im Lizenzfenster (DE | EN | DA) oder über *Ansicht → Sprache*; der Hauptprozess merkt sich die Wahl in `sprache.json` im Benutzerordner. Das Programm schickt die Sprache bei der Lizenzprüfung mit (Meldungen des Servers kommen dann in dieser Sprache) und hängt sie an Lemon-Squeezy-Kauf-Links an (`checkout[custom][lang]`), damit die Lizenz-E-Mail und spätere Erinnerungen in der richtigen Sprache kommen. Ohne diese Angabe nimmt der Server das Land aus der Bestellung (DK → Dänisch, DE/AT/CH → Deutsch, sonst Englisch), dann die Währung DKK, sonst Deutsch.
- **Rechtstexte:** Für die Desktop-Programme gibt es eigene Kauf- und Lizenzbedingungen (`/legal/kaufbedingungen`) und eine eigene Widerrufsbelehrung (`/legal/widerruf-kauf`), siehe `legal/README.md`. Bitte vor dem Verkauf rechtlich prüfen lassen.

## Dateien

| Datei | Aufgabe |
|---|---|
| `main.js` | Hauptprogramm der Hülle: Fenster, Lizenzprüfung, USB- und Kamera-Freigabe, Menü |
| `license.js` | Testzeit, Freischalten, regelmäßige Prüfung, Gerätekennung, Offline-Freischaltung |
| `license.html`, `license-ui.js`, `license.css` | Lizenzfenster |
| `preload.js` | Brücke zum Programmfenster: Anschlussauswahl, Lizenzhinweise |
| `build.js` | Programm zusammenstellen, Code verschleiern, Installer bauen |
| `products.json` | Welche Dateien zu welchem Programm gehören |
| `license-public.pem` | Öffentlicher Schlüssel zum Prüfen der Freigaben |
| `test_license.js` | Tests (`node test_license.js`) |
| `../server/licenses.js` | Lizenzteil des Servers (Schlüssel, Aktivierungen, Signatur) |
