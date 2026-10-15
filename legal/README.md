# Rechtstexte (Entwürfe)

HTML-Fragmente (ohne `<html>/<head>`) für Impressum, AGB, Widerrufsbelehrung,
Datenschutzerklärung und Lizenzen – jeweils Deutsch (`*.de.html`) und Englisch (`*.en.html`, Übersetzung).
**Alle Texte sind Entwürfe und keine Rechtsberatung. Vor der Veröffentlichung anwaltlich prüfen lassen.**

| Datei | Inhalt |
|---|---|
| `impressum.*.html` | Impressum / Legal notice (§ 5 DDG, § 18 Abs. 2 MStV, VSBG-Hinweis) |
| `agb.*.html` | AGB / Terms and Conditions (SaaS-Lizenz, B2C und B2B) |
| `widerruf.*.html` | Widerrufsbelehrung inkl. Muster-Widerrufsformular und Checkout-Zustimmungstext |
| `datenschutz.*.html` | Datenschutzerklärung / Privacy policy (DSGVO) |
| `lizenzen.*.html` | Lizenzen der Stickschriften, TTF-Schriften, pdf.js, pyembroidery, Garnfarben |

## Platzhalter (werden aus den Admin-Einstellungen ersetzt)

| Platzhalter | Bedeutung | darf leer sein? |
|---|---|---|
| `{{company}}` | Name des Unternehmens (bei Einzelunternehmen mit vollem Vor- und Nachnamen) | nein |
| `{{owner}}` | Inhaber/in bzw. vertretungsberechtigte Person | nein |
| `{{street}}`, `{{zip_city}}`, `{{country}}` | ladungsfähige Anschrift (kein Postfach) | nein |
| `{{email}}`, `{{phone}}` | Kontakt (schnelle elektronische Kontaktaufnahme) | nein |
| `{{vat_id}}` | USt-IdNr. | ja – Element mit `data-optional="vat_id"` entfällt |
| `{{register}}` | Handelsregistereintrag (Gericht + Nummer) | ja – `data-optional="register"` |
| `{{hosting_provider}}` | Name + Anschrift des Hosters (auch SMTP-/E-Mail-Anbieter, falls derselbe) | nein |
| `{{payment_provider}}` | z. B. „Lemon Squeezy, LLC“ oder „Stripe Payments Europe, Ltd.“ | nein |
| `{{trial_days}}` | Testtage, z. B. `14` | nein |
| `{{license_term}}` | z. B. „12 Monate“ / „12 months“ (sprachabhängig!) | nein |
| `{{price_text}}` | Preisangabe, z. B. „49 € pro Jahr inkl. MwSt.“ (sprachabhängig) | nein |
| `{{supervisory_authority}}` | zuständige Datenschutz-Aufsichtsbehörde (Name + Anschrift) | nein |
| `{{date}}` | Stand der Texte | nein |

Elemente mit `data-optional="<name>"` soll der Server entfernen, wenn der Wert leer ist.
HTML-Kommentare (`<!-- ALTERNATIVE … -->`, `<!-- VARIANTE A … -->`) enthalten Alternativformulierungen –
bewusst auswählen und die nicht gewählte Variante löschen.

## Vor dem Livegang prüfen / entscheiden

1. **Impressumsdaten** vollständig eintragen (voller Name, ladungsfähige Anschrift, Telefon/E-Mail, ggf. USt-IdNr., Register).
2. **VSBG-Erklärung** (Impressum + AGB § 17): Standard ist „nicht bereit und nicht verpflichtet“. Ggf. Teilnahme an der Universalschlichtungsstelle wählen. Kein Link mehr auf die EU-OS-Plattform (seit 20.07.2025 eingestellt).
3. **Hosting-Anbieter**: Namen/Anschrift eintragen, **AV-Vertrag (Art. 28 DSGVO)** abschließen, Serverstandort EU/EWR bestätigen (sonst Datenschutzerklärung Ziffer 11 anpassen). Gleiches für den SMTP-/E-Mail-Anbieter, falls abweichend.
4. **Zahlungsanbieter**: Merchant of Record (z. B. Lemon Squeezy – dann ist er Verkäufer, eigener Verantwortlicher, Widerruf/Erstattung auch über ihn) oder Direktverkauf über Stripe (dann sind Sie Verkäufer: Rechnungen, USt/OSS, ggf. AV-/Verantwortlichkeitsregelung). AGB § 3 Abs. 3, § 6 und Datenschutz Ziffer 7 entsprechend prüfen; dessen Bedingungen und Datenschutzhinweise verlinken.
5. **Verlängerungsmodell**: entschieden – **Abo** (AGB § 5). Laufzeit (`{{license_term}}`) muss zum Abo-Produkt bei Lemon Squeezy passen (z. B. monatlich oder jährlich). Die Variante „Einmalkauf“ wurde entfernt.
6. **Kündigungsbutton** (§ 312k BGB, `/kuendigen`) und **Widerrufsfunktion** (`/widerrufen`) sind umgesetzt: auf jeder Seite verlinkt, ohne Anmeldung nutzbar, mit Bestätigungsseite (Inhalt + Zeitpunkt) und Eingangsbestätigung per E-Mail. Offene Fälle erscheinen in der Verwaltung. Anwaltlich prüfen lassen, ob Gestaltung und Beschriftung den aktuellen Vorgaben entsprechen.
7. **Checkout**: Schaltfläche „Zahlungspflichtig bestellen“; nicht vorangekreuzte Checkbox mit dem Text aus `widerruf.*.html` („Zustimmung im Bestellvorgang“); Zeitpunkt der Zustimmung speichern; Bestätigung inkl. Zustimmung per E-Mail senden (§ 312f Abs. 3 BGB). Hinweis: SaaS ist eher eine *digitale Dienstleistung* (§ 356 Abs. 4 BGB) – das Widerrufsrecht erlischt dann erst bei vollständiger Erbringung; bei Widerruf innerhalb von 14 Tagen ist anteiliger Wertersatz geschuldet. Einordnung anwaltlich klären.
8. **Preis** (`{{price_text}}`), Umsatzsteuer (Kleinunternehmer § 19 UStG? Reverse Charge? – Kommentar in AGB § 6), Preisänderungsklausel.
9. **Verfügbarkeitsziel** (AGB § 7: „98 %“) und Löschfristen (inaktive Konten 24 Monate, Backups 30 Tage, Reset-Links 1 Stunde) an die tatsächliche Technik anpassen.
10. **Aufsichtsbehörde** = Landesdatenschutzbehörde des Bundeslandes Ihres Geschäftssitzes eintragen.
11. **Technik abgleichen**: Session-Cookie wirklich `HttpOnly; Secure; SameSite`, Passwort-Hashing (z. B. Argon2/bcrypt), Log-Löschung nach 14 Tagen, Login-Begrenzung, keine externen Ressourcen. Die App nutzt localStorage/IndexedDB für Einstellungen und eine lokale Design-Bibliothek – ist in der Datenschutzerklärung erwähnt.
12. **Lizenzen**: CC-BY-SA-Schriften (Chopin Script, gingo200, Geneva Simple Sans Rounded, Dejavu Serif) bleiben unter CC-BY-SA; die umgewandelten Schriftdaten müssen unter derselben Lizenz stehen. Die unsicheren Schriften DinoMouse72, Monicha, Aventurina und Kaushan Script (TTF) wurden entfernt. Prüfen lassen: Lizenz der Garnfarben-Paletten von Ink/Stitch (Projekt ist GPL-3.0) klären. Ggf. die LICENSE-Dateien selbst mit ausliefern (z. B. unter `/fonts/inkstitch/<ordner>/LICENSE`).
13. **Englische Fassungen** sind als Übersetzung gekennzeichnet; Platzhalter `{{license_term}}` und `{{price_text}}` sprachabhängig befüllen.
14. **Gesamtprüfung durch eine Rechtsanwältin / einen Rechtsanwalt** (insbesondere AGB-Klauseln zu Haftung, Preis- und AGB-Änderungen, Verlängerung, Widerruf).
