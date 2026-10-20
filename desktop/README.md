# Desktop-Programme mit Kauf-Lizenz

StickStudio, FräsStudio und LaserStudio gibt es zusätzlich zur Browser-Version als **installierbare Programme**: Windows (`.exe`-Installer), Mac (`.dmg`) und Linux (`.AppImage`).
Jedes Programm hat seinen eigenen Installer und seine eigene Lizenz.

## So funktioniert die Lizenz (Kauf statt Abo)

1. **Testzeit:** Nach der Installation läuft das Programm 14 Tage ohne Schlüssel. In dieser Zeit fragt es beim Start einmal am Tag nach dem Lizenzschlüssel (Knopf „Weiter testen“). Eine Neuinstallation startet die Testzeit nicht neu.
2. **Kauf:** Der Kunde bekommt einen Schlüssel wie `LSR-7K2QX-M9D4T-HB3WN-R8P6C`. Das Kürzel zeigt das Programm an: `STK` = StickStudio, `FRS` = FräsStudio, `LSR` = LaserStudio. Das letzte Zeichen ist ein Prüfzeichen und erkennt Tippfehler.
3. **Freischalten:** Den Schlüssel eingeben und „Freischalten“ drücken. Das Programm meldet sich einmal bei deinem Server. Der prüft den Schlüssel, merkt sich das Gerät und schickt eine **signierte Freigabe** zurück.
4. **Zwischendurch prüfen:** Das Programm prüft die Lizenz beim Start und danach alle 3 Stunden, sobald sie fällig ist (alle 7 Tage), still im Hintergrund.
   - **Ohne Internet** läuft es bis zu 30 Tage weiter. Eine Woche vorher kommt ein Hinweis.
   - **Gesperrte Lizenz** (z. B. nach Erstattung oder Weitergabe): Das Programm sperrt sich bei der nächsten Prüfung. Vorher kann der Kunde noch speichern.
5. **Geräte:** Eine Lizenz gilt standardmäßig für **2 Geräte**, je Lizenz in der Verwaltung änderbar. Beim Rechnerwechsel meldet der Kunde das alte Gerät unter *Programm → Lizenz … → Dieses Gerät freigeben* ab. Du kannst Geräte auch in der Verwaltung freigeben.
6. **Ohne Internet:** Der Kunde schickt dir den **Gerätecode** aus dem Lizenzfenster. Du erzeugst in der Verwaltung einen Freischaltcode, Standard 365 Tage.

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
- **Lemon Squeezy:** Einen Einmalkauf (kein Abo) je Programm anlegen und die Varianten-IDs in `/etc/stickstudio.env` eintragen:
  ```
  LICENSE_VARIANTS=123456:laser,234567:fraes,345678:stick
  ```
  Danach legt jeder Kauf automatisch einen Schlüssel an und schickt ihn per E-Mail. Eine Erstattung (`order_refunded`) sperrt ihn.
- **Signaturschlüssel:** Die Datei `license-signing.pem` bekommst du separat. **Geheim halten, nicht ins Git legen.** Vor `bash deploy/install.sh` nach `deploy/license-signing.pem` kopieren, das Skript übernimmt sie nach `/var/lib/stickstudio/`.
  - Der passende öffentliche Schlüssel liegt in `desktop/license-public.pem` und steckt in jedem Installer.
  - Geht die private Datei verloren: neues Schlüsselpaar erzeugen, `license-public.pem` ersetzen, Installer neu bauen. Kunden mit alten Installern müssen dann das Update installieren.

### 2. Einstellungen für die Installer (`desktop/settings.json`)

| Eintrag | Bedeutung |
|---|---|
| `licenseServer` | Adresse deines Servers, z. B. `https://stick.deine-domain.de` (muss HTTPS sein) |
| `buyUrl` | Kauf-Link je Programm, erscheint im Lizenzfenster als „Lizenz kaufen“ |
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
- **Rechtstexte:** AGB und Widerrufsbelehrung beschreiben bisher das Abo der Online-Version. Für den Verkauf der Desktop-Programme braucht es passende Texte, z. B. eine Lizenzvereinbarung (EULA) und die Regeln zum Widerruf bei digitalen Inhalten. Das bitte rechtlich prüfen lassen.

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
