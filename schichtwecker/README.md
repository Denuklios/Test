# SchichtWecker (Android)

Wecker, der deine Schichten aus dem Familienkalender (und optional dem Handy-Kalender) liest (Früh / Spät / Nacht),
den Wecker passend stellt und das Handy während der Schicht lautlos schaltet –
nach Schichtende wird es automatisch wieder laut.

Download: https://www.wunsch-fabrik.dk/kalender/schichtwecker/ – danach aktualisiert sich die App selbst (`./release.sh "Was ist neu"`, Commit mit `[hochladen]`).

## Mit dem Familienkalender verbinden
Familienkalender → ☰ → „Jemanden einladen“ → „Einladung senden“ → **SchichtWecker** auswählen,
danach „Wer bist du?“ wählen. Es zählen deine eigenen Termine und die, bei denen du dabei bist.
Schichten aus dem Schicht-Pinsel (Früh/Spät/Nacht) werden automatisch erkannt; andere Titel lassen sich
auf der Startseite per Antippen zuordnen.

## Funktionen
- Liest alle Kalender des Handys (Google, Samsung, Outlook … – was im Handy-Kalender sichtbar ist), wählbar welche
- Schichtarten mit Stichwörtern (z. B. „Früh, F, Frühdienst“), auch ganztägige Einträge
- Weckzeit: X Minuten vor Schichtbeginn **oder** feste Uhrzeit
- Lautlos während der Schicht (Nicht stören / Lautlos / Vibration), danach automatisch zurück –
  hast du zwischendurch selbst umgestellt, wird nichts überschrieben
- Wecker klingelt immer, auch bei Lautlos / Nicht stören
- Sanft lauter werdender Weckton, Mindest-Lautstärke, Vibration, eigener Weckton
- Schlummern mit Limit, automatisch verstummen
- Rechenaufgaben zum Ausschalten, Wach-Kontrolle („Bist du wach?“)
- Schlafenszeit-Erinnerung und Abendübersicht für morgen, mit „Wecker überspringen“
- Einzelne Schicht überspringen, Urlaubsmodus bis Datum
- Einrichtungs-Check zeigt fehlende Berechtigungen mit „Beheben“-Knopf
- Liest den Kalender bei Änderungen, nach Neustart und alle 3 Stunden neu

## Bauen
`gradle assembleRelease` (Android-SDK in `local.properties`).
Der Signierschlüssel liegt in `keystore/`, damit Updates sich über die alte Version installieren lassen.
