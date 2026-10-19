# 🛒 Preisfinder

Sucht in den Prospekten der Supermärkte und Drogerien nach günstigen Preisen – für Milch, Kaffee, Butter und alles andere – und zeigt, ob etwas **jetzt im Angebot** ist oder **bald in die Werbung kommt**.

## Was er kann

| Bereich | Was passiert |
|---|---|
| **🔍 Suchen** | Alle Angebote in deiner Gegend (nach Postleitzahl), sortiert nach **Grundpreis** (€/kg, €/l, €/Stück), damit verschiedene Packungsgrößen fair verglichen werden. Filter: *Jetzt im Angebot* / *Kommt bald* / nach Markt. Sortieren auch nach Preis, Ersparnis oder „endet bald“. |
| **Status** | „Im Angebot bis Fr., 23.10.“, „endet heute!“, „Kommt ab Do., 22.10. (in 3 Tagen)“. Die kommenden Angebote stammen aus den Prospekten der nächsten Woche, die die Märkte meist ein paar Tage früher veröffentlichen. |
| **⭐ Top-Preis** | Der Preisfinder merkt sich jeden Tag den besten Preis je Suchbegriff. Ein Angebot, das so günstig ist wie das beste der letzten 90 Tage, wird markiert. Dazu eine kleine Preiskurve und der Durchschnitt. |
| **🔔 Preisalarm** | Merkliste mit optionalem Höchstpreis (pro Packung oder pro kg/l). Der Server prüft sie automatisch (Standard alle 6 Stunden) und meldet neue Treffer – auch kommende Angebote. |
| **📱 Push aufs Handy** | Über die kostenlose App **ntfy** (Android/iPhone, kein Konto nötig): In der App ein Thema abonnieren, denselben Namen unter ⚙️ eintragen, „Test-Nachricht senden“. |
| **📝 Einkaufsliste** | Angebote mit einem Tipp übernehmen, nach Markt gruppiert, mit Summe, abhaken, teilen (WhatsApp usw.), drucken. Liegt auf dem Server, also auf Handy und PC gleich. |
| **Länder** | Deutschland (Prospekte über marktguru.de: Aldi, Lidl, Rewe, Edeka, Kaufland, Penny, Netto, dm, Rossmann …) und Dänemark (Tilbudsaviser über eTilbudsavis: Netto, Føtex, Bilka, Rema 1000, Lidl, Coop …). Umschalten unter ⚙️. |
| **Sonstiges** | Nur-mit-Kundenkarte-Angebote ausblendbar, Lieblingsmärkte festlegen, als App auf den Startbildschirm legen, dunkles Design, Passwortschutz. |

## Auf deine Domain bringen

Wie bei StickStudio: eine **Subdomain** zeigt auf deinen Server, das Skript erledigt den Rest.

1. **Subdomain anlegen:** Beim Domain-Anbieter einen **A-Eintrag** `preise` → IP-Adresse deines Servers anlegen (z. B. `preise.deine-domain.de`). Läuft StickStudio schon auf dem Server, ist es dieselbe IP.
2. **Hochladen:** Den Ordner `preisfinder` auf den Server kopieren, z. B. `scp -r preisfinder root@SERVER-IP:/root/`
3. **Einrichten:** `ssh root@SERVER-IP` und dann `bash /root/preisfinder/deploy/install.sh`. Das Skript fragt nach der Adresse und einem Passwort und richtet Node.js, HTTPS-Zertifikat, Start beim Hochfahren und eine tägliche Sicherung ein.
4. **Öffnen:** `https://preise.deine-domain.de`, Passwort eingeben, unter ⚙️ Postleitzahl eintragen. Auf dem Handy: Menü → „Zum Startbildschirm hinzufügen“.

**Update:** neuen Ordner hochladen und das Skript erneut ausführen. Merkliste, Einkaufsliste und Preisverlauf bleiben erhalten.
StickStudio wird dabei nicht angefasst (eigene Datei `/etc/caddy/conf.d/preisfinder.caddy`, eigener Port 8090).

## Auf dem eigenen Computer ausprobieren

[Node.js](https://nodejs.org) 22 oder neuer installieren, dann `start-lokal.bat` (Windows) bzw. `start-lokal.command` (Mac/Linux) doppelklicken. Der Browser öffnet `http://localhost:8090` (lokal ohne Passwort).

```bash
PASSWORD='ein-passwort' node preisfinder/server.js     # mit Passwort
```

| Variable | Bedeutung | Standard |
|---|---|---|
| `PASSWORD` | Passwort für die Seite (leer = kein Schutz) | leer |
| `PORT` | Port | `8090` |
| `DATA_DIR` | Ordner für `preisfinder.json` | `preisfinder/data` |

## Gut zu wissen

- Die Daten kommen von den Prospekt-Portalen marktguru.de bzw. eTilbudsavis.dk. Das sind keine offiziellen Schnittstellen; wenn ein Portal seine Seite umbaut, kann die Suche ausfallen – dann erscheint eine klare Fehlermeldung.
- Online-Shops (Amazon usw.) und Preise außerhalb von Prospekten werden nicht erfasst.
- Alle Angaben ohne Gewähr, maßgeblich ist der Preis im Markt.
- Tests: `node tests/test_preisfinder.js` (im Hauptordner).
