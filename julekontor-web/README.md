# Julekontor – One-Page mit Weihnachtsmann-Chat

One-Page für **Julekontor – Danmarks gammeldags julebutik**, aufgebaut wie die Startseiten großer Weihnachtsläden.

- Sprachen der Seite: Dänisch, Deutsch, Englisch (Umschalter oben, sonst nach Browsersprache).
- Aufbau: grüne Hinweisleiste („Julemanden svarer på alle sprog“) → Kopfzeile mit dem vollständigen Logo als Plakette in der Mitte → roter Startbereich mit Tannengirlande, Kugeln, Schneefall und Tagen bis Heiligabend → drei Kurzversprechen → Sortiment in sechs Kacheln (gezeichnete Ornamente) → Julemandens brevkasse → Über uns mit dem großen Logo → Besuch (Daten aus `shop.json`) → Fußzeile.
- Das Logo wird nirgends beschnitten oder freigestellt, sondern immer vollständig gezeigt.
- Kleine Überraschungen, die nirgends erklärt sind:
  - Die Kugeln an der Girlande schwingen und klingen wie Glöckchen, wenn man sie antippt.
  - Ein Klick in den roten Himmel lässt Sterne aufsteigen.
  - Dreimal schnell aufs Logo oben tippen: Der Julekontor-Lieferwagen fährt mit Schellengeläut durchs Bild.
  - Die Sortiment-Kacheln: Der Nisse duckt sich und sagt etwas, die Glaskugel klingt, das Herz dreht sich, die Kerze lässt sich auspusten und wieder anzünden, der Stern dreht sich, das Geschenk hüpft und sprüht Sterne.
  - Dem Weihnachtsmann auf die Nase tippen: Er lacht und sagt einen Satz.
  - Ein kleiner Nisse versteckt sich auf der Seite (z. B. hinter dem Logo-Bild bei „Om os“). Wer ihn findet, bekommt einen Spruch, und er zieht an ein neues Versteck. Wer ihn an allen vier Stellen gefunden hat, bekommt einen Sternenregen.
  - „Glædelig jul“ unten antippen: Sternenregen mit Glockenspiel.
- Spieluhr (Notensymbol oben): spielt „Glade jul“ (Stille Nacht, Gruber 1818, gemeinfrei), im Browser erzeugt, nur auf Knopfdruck.
- **Weihnachtsmann-Chat** unten rechts: antwortet in der Sprache, in der man ihm schreibt (Dänisch, Deutsch, Polnisch, Schwedisch, Arabisch …). Die Antworten kommen live von Claude (Anthropic) und werden Wort für Wort eingeblendet. Während er schreibt, zeigt der Chat eine schreibende Feder.
- Kinderschutz ist im Weihnachtsmann fest eingebaut: Er fragt nie nach Name, Adresse, Schule oder Telefonnummer, verspricht keine bestimmten Geschenke und verweist bei Sorgen an eine Vertrauensperson bzw. BørneTelefonen 116 111.
- Ohne Server bzw. ohne API-Schlüssel antwortet der Weihnachtsmann mit vorgeschriebenen Antworten in 10 Sprachen (mit Hinweis „Vorschau“).

## Dateien

| Datei | Zweck |
|---|---|
| `src/page.html` | Die Seite (Quelle). Nach Änderungen `npm run build`. |
| `public/index.html` | Daraus erzeugte fertige Seite. |
| `public/shop.json` | **Adresse, Öffnungszeiten, E-Mail, Telefon, Links.** Leere Felder werden ausgeblendet. Der Weihnachtsmann kennt nur, was hier steht. |
| `public/img/logo.webp` | Logo |
| `server.js` | Liefert die Seite aus und stellt `POST /api/santa` für den Chat bereit. |

## Starten

Node.js 20 oder neuer und ein API-Schlüssel von <https://console.anthropic.com> werden gebraucht.

```bash
cd julekontor-web
npm install
npm run build
ANTHROPIC_API_KEY=sk-ant-... npm start
# → http://localhost:8095
```

Einstellungen über Umgebungsvariablen:

| Variable | Standard | Bedeutung |
|---|---|---|
| `PORT` | `8095` | Port |
| `SANTA_MODEL` | `claude-opus-5-5` | Modell. Günstiger: `claude-sonnet-5-5` oder `claude-haiku-5-5`. |
| `SANTA_RATE` | `30` | Nachrichten pro Besucher (IP) in 10 Minuten |
| `SANTA_DAILY` | `3000` | Antworten pro Tag insgesamt (Kostenbremse) |

Der Schlüssel bleibt auf dem Server, der Browser sieht ihn nie.

## Auf den Server

Hinter einen vorhandenen Reverse Proxy (nginx/Caddy) hängen und `server.js` als Dienst laufen lassen, z. B. mit systemd:

```ini
[Service]
WorkingDirectory=/opt/julekontor-web
Environment=ANTHROPIC_API_KEY=sk-ant-...
Environment=PORT=8095
ExecStart=/usr/bin/node server.js
Restart=always
```

Bei nginx für den Chat das Puffern abschalten, damit die Antwort Wort für Wort ankommt (`proxy_buffering off;` für `/api/santa`). Der Server sendet zusätzlich `X-Accel-Buffering: no`.

**Nur den Chat in eine bestehende Website einbauen:** Seite und `/api/santa` müssen auf derselben Domain liegen. Den Block „Santa chat“ (Button, `<section class="chat">`, das `santa-face`-Symbol, die Chat-CSS und das Skript) aus `src/page.html` übernehmen.

## Vor dem Livegang

- `public/shop.json` mit den echten Daten füllen.
- Datenschutzerklärung ergänzen: Chat-Nachrichten werden zur Beantwortung an Anthropic übermittelt. Der Server speichert keine Chats; im Browser liegt der Verlauf nur für die laufende Sitzung (sessionStorage).
