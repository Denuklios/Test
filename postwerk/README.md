# Postwerk – eigener TikTok-Planer

Postwerk plant und veröffentlicht TikTok-Videos und Foto-Beiträge direkt über die offizielle
TikTok-Schnittstelle (Content Posting API). Es gibt kein Monatslimit wie bei Metricool. Claude kann über einen
eigenen Connector (MCP) selbst Videos hochladen, planen, ändern und Statistiken lesen.

- **Planer:** Wochenansicht, Liste „Braucht Aufmerksamkeit“, Verlauf je Beitrag
- **Beiträge:** Video oder Fotos (bis 35), Beschreibung mit Zeichenzähler, Titelbild aus dem Video,
  Sichtbarkeit, Kommentare/Duett/Stitch, KI-Kennzeichnung, Werbe-Offenlegung, „Sofort“ oder geplant,
  wahlweise direkt veröffentlichen oder als Entwurf ins TikTok-Postfach
- **Upload in Teilen:** große Videos gehen auch bei kleinem Upload-Limit des Webspace
- **Zeitplan:** Cronjob jede Minute, automatische Wiederholung bei vorübergehenden Fehlern,
  verständliche Fehlermeldungen auf Deutsch
- **Statistik:** Follower, Likes, Videos (mit Verlauf), Aufrufe/Likes/Kommentare/Geteilt je Video,
  Interaktionsrate, beste Uhrzeiten
- **Mehrere TikTok-Konten**, Freigabe-Modus für Beiträge von Claude, Passwortschutz

## Voraussetzungen

- Webspace mit **PHP 8.1+** und der Erweiterung `curl` (GD für PNG-Fotos ist optional), **HTTPS**
- Ein Cronjob (beim Webhoster oder kostenlos bei cron-job.org)
- Ein TikTok-Entwicklerkonto (kostenlos)

Keine Datenbank nötig, alles liegt in `data/` (vor Zugriff von außen geschützt).

## 1. Hochladen

Den Ordner `postwerk/` per FTP auf den Webspace laden, z. B. nach `https://julekontor.dk/postwerk/`.
`data/` und `media/` werden beim ersten Aufruf angelegt (der Ordner braucht Schreibrechte).
Dann die Adresse öffnen und ein Passwort festlegen.

## 2. TikTok-App anlegen

1. Auf <https://developers.tiktok.com> anmelden → **Manage apps** → **Connect an app**.
2. App-Name, Symbol, Kategorie, Beschreibung, Links zu **Nutzungsbedingungen** und **Datenschutz** eintragen
   (z. B. die Seiten deiner Website).
3. **Products** hinzufügen: **Login Kit** und **Content Posting API**. Bei Content Posting **Direct Post** einschalten.
4. **Scopes**: `user.info.basic`, `user.info.profile`, `user.info.stats`, `video.list`, `video.publish`, `video.upload`.
5. Bei Login Kit unter **Redirect URI** die Adresse aus Postwerk → Einstellungen eintragen
   (z. B. `https://julekontor.dk/postwerk/oauth.php`).
6. Für **Foto-Beiträge**: unter **URL properties** die Adresse `https://deine-domain/postwerk/media/` als
   URL-Präfix bestätigen (TikTok holt die Fotos dort ab).
7. **Client Key** und **Client Secret** in Postwerk → Einstellungen eintragen und speichern.
8. Postwerk → Konten → **TikTok-Konto verbinden**, bei TikTok anmelden, alles erlauben.

### Wichtig: App-Prüfung (Audit)

Solange TikTok die App nicht geprüft hat, erscheinen **direkt** veröffentlichte Beiträge nur **privat**
(„Nur ich“), und TikTok verlangt dafür ggf. ein privates Konto. Bis dahin:

- In den Einstellungen „App ist noch nicht von TikTok freigegeben“ anhaken, oder
- die Art **„Entwurf ins TikTok-Postfach“** wählen: Das Video landet in der TikTok-App (Benachrichtigung),
  du tippst nur noch auf „Posten“. Den Text kopierst du im Beitrag mit „Kopieren“.

Für öffentliche Direkt-Beiträge im Entwicklerportal **Submit for review** wählen. TikTok will ein kurzes
Bildschirmvideo sehen, das den Ablauf zeigt (Anmelden → Beitrag anlegen → veröffentlichen), und prüft die
„Content Sharing Guidelines“ (Anzeige des Kontos, Wahl der Sichtbarkeit, Schalter für Kommentare/Duett/Stitch,
Werbe-Offenlegung, Hinweis zur Musiknutzung). Die Postwerk-Maske enthält diese Elemente. Die Prüfung dauert
erfahrungsgemäß einige Tage bis Wochen.

## 3. Cronjob

In Postwerk → Einstellungen steht die Cron-Adresse (`cron.php?key=…`). Diese jede Minute aufrufen lassen.
Ohne Cronjob werden fällige Beiträge nur gesendet, wenn jemand die Oberfläche oder die API benutzt.

## 4. Claude verbinden

1. Postwerk → Einstellungen → **Claude & API-Zugang** → „Schlüssel erzeugen“ (Name z. B. „Claude“).
2. Die angezeigte **Connector-Adresse** (`…/mcp.php?key=pw_…`) kopieren. Sie wird nur einmal angezeigt.
3. In claude.ai → Einstellungen → Connectors → **Eigenen Connector hinzufügen** → Adresse einfügen.
   Ein OAuth-Login ist nicht nötig.

Danach kann Claude in jedem Chat (auch am Handy):

| Werkzeug | Zweck |
|---|---|
| `list_accounts` | verbundene Konten, erlaubte Sichtbarkeiten, maximale Videolänge |
| `schedule_video` | Video planen oder sofort posten (per `video_url` oder `file_id`) |
| `schedule_photos` | Foto-Beitrag planen |
| `list_posts`, `get_post` | Planer ansehen |
| `update_post` | Text, Zeit, Einstellungen oder Video ändern |
| `post_action` | freigeben, abbrechen, sofort posten, erneut versuchen, löschen |
| `get_stats` | Follower, Entwicklung, Zahlen der letzten Videos, beste Uhrzeiten |
| `run_scheduler` | Zeitplan sofort ausführen |
| `upload_instructions` | wie eine lokale Datei per curl hochgeladen wird |

In Claude-Code-Sitzungen, die Videos selbst rendern, lädt Claude die Datei per REST hoch:

```bash
curl -H "Authorization: Bearer pw_…" -F "file=@video.mp4" -F "thumb=@cover.jpg" \
     "https://deine-domain/postwerk/api.php?action=upload"      # → {"file_id":"v…"}
```

Größere Dateien in Teilen: `upload_start` → `upload_chunk` (PUT, je bis 8 MB) → `upload_finish`.
Alle Aktionen stehen oben in `api.php`.

Wer die Connector-Adresse kennt, kann in deinem Namen posten: nicht weitergeben. Gesperrt wird ein Schlüssel
unter Einstellungen → „Sperren“. Mit „Beiträge von Claude/API erst nach meiner Freigabe veröffentlichen“
landet alles von Claude zuerst unter „Braucht Aufmerksamkeit“.

## Grenzen der TikTok-Schnittstelle

- Kein „erster Kommentar“ über die Schnittstelle.
- TikTok begrenzt die Zahl der Beiträge pro Tag und Konto über die Schnittstelle (Postwerk warnt ab 15, einstellbar);
  bei Überschreitung kommt „Tageslimit erreicht“.
- Videos: MP4/MOV/WebM, 23–60 fps, max. 4 GB; Länge je nach Konto (siehe Konten).
- Fotos: JPG/WebP (PNG wird automatisch umgewandelt), max. 35, Domain muss bestätigt sein.
- Entwürfe im Postfach: Beschreibung muss in der App eingefügt werden.

## Dateien

| Datei | Zweck |
|---|---|
| `index.php` | Oberfläche |
| `api.php` | REST-API (Schlüssel oder angemeldete Sitzung) |
| `mcp.php` | Connector für Claude |
| `cron.php` | Zeitplan |
| `oauth.php` | TikTok-Anmeldung |
| `media.php` | Video-Vorschau für angemeldete Nutzer |
| `lib/` | Programmlogik |
| `data/` | Einstellungen, Beiträge, Videos (geschützt) |
| `media/` | öffentliche Fotos für Foto-Beiträge |

## Tests

```bash
php tests/test_flow.php
```

Startet Postwerk und einen nachgebauten TikTok-Server und prüft den ganzen Ablauf (56 Prüfungen):
Einrichtung, Anmeldung bei TikTok, Upload in Teilen, Planen per REST und MCP, Direkt- und Entwurfsmodus,
Fotos, Fehler und Wiederholung, Erneuern abgelaufener Zugänge, Videos über 64 MB in mehreren Teilen,
Statistik und alle Seiten.
