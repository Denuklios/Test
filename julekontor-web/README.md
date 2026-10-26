# Julekontor – One-Page mit Weihnachtsmann-Chat

One-Page für **Julekontor – Danmarks gammeldags julebutik** rund um das Julekontor-Logo.

- Sprachen der Seite: Dänisch, Deutsch, Englisch (Umschalter oben, sonst nach Browsersprache).
- Stimmung: ein Winterabend in einer alten dänischen Stadt. Alles ist selbst gezeichnet und animiert:
  - Startbild: Nachthimmel mit Mond und Sternen, drei Ebenen Häuser mit Treppengiebeln und warmem Licht in den Fenstern, Straßenlaternen, Schneefall mit unscharfen Flocken im Vordergrund, der Julekontor-Lieferwagen fährt durch. Bewegt sich leicht mit der Maus (Parallaxe).
  - Logo als Briefmarke (Julemærke) im Startbild; fallende Schneeflocken bleiben oben auf der Marke liegen.
  - Beschlagenes Schaufenster direkt unter den Häusern, ohne Erklärtext: Wer die Scheibe freiwischt, findet dahinter im goldgerahmten Oval, wie viele Tage es noch bis Heiligabend sind – mit Juletræ und echten Kerzen. Die Scheibe friert langsam wieder zu.
  - Kalenderkerze 1–24, die beim Scrollen durch „Weihnachten bei uns“ herunterbrennt.
  - Vitrine mit sechs hängenden Ornamenten (Glaskugel, geflochtenes Herz, Nisse, Holzstern, Kalenderkerze, Geschenk in braunem Papier), die bei Mausbewegung schwingen.
  - Erleuchtetes Fenster mit dem Weihnachtsmann als Silhouette, der mit der Feder schreibt; daneben „Lieber Weihnachtsmann“ in wechselnden Sprachen in Handschrift.
  - Spieluhr: spielt „Glade jul“ (Stille Nacht, Gruber 1818, gemeinfrei) direkt im Browser erzeugt, nur auf Knopfdruck.
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
