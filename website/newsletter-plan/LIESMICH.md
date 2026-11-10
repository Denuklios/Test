# Newsletter-Plan

Jede `*.json`-Datei hier wird automatisch als Newsletter in den Admin-Bereich übernommen
(einmal je `key`; danach gilt nur noch, was im Admin-Bereich steht).

```json
{
  "key": "2026-11-weihnachten",
  "status": "scheduled",          // oder "draft" = nur Entwurf, kein Versand
  "send_at": "2026-11-20 09:00",  // frühestens 48 h nach dem Hochladen
  "title": "Interner Name",
  "subject": { "de": "…", "da": "…", "en": "…" },
  "body":    { "de": "…", "da": "…", "en": "…" }
}
```

Gestaltung im Text: Leerzeile = Absatz, `## Überschrift`, `**fett**`, `- Liste`,
`[Text](https://…)`, Knopf `[[Text | https://…]]`, Bild `![](https://…)`, `{name}`.
Der Ordner ist von außen gesperrt (.htaccess).
