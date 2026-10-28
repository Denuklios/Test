# Wunsch-Fabrik – Spielepaket

Drei Browserspiele im Corporate Design von wunsch-fabrik.dk, mit Online-Bestenliste
und Gutscheinsystem.

---

## Was ist drin

| Datei | Was es ist |
|---|---|
| `spiele.html` | Übersichtsseite, verlinkt alle drei Spiele |
| `nadel.html` | **Nadel & Faden** – Geschicklichkeitsspiel, vergibt die Gutscheine |
| `rausch.html` | **Veredelungs-Rausch** – Match-3 mit Auftragsleveln |
| `spiel.html` | **Veredelungs-Tycoon** – Aufbauspiel mit Bestenliste |
| `highscore_api.php` | Bestenliste für den Tycoon |
| `gutschein_api.php` | Gutscheincodes, Ziehung, Mailversand |
| `wf-logo.png` | Logo freigestellt, 1067 px |
| `bg-pattern.jpg` | Hintergrundmuster (Kopie, damit der Ordner eigenständig ist) |

Die Logos sind in allen Spielen zusätzlich fest eingebettet – sie funktionieren
also auch, wenn `wf-logo.png` fehlt.

---

## Installation

Lege den Ordner `spiele` komplett ins Web-Root deiner Seite – also dorthin, wo
auch `index.html` und `db.php` liegen. Danach sieht es so aus:

```
/                       ← Web-Root
├── index.html
├── db.php
├── bg-pattern.jpg
├── impressionen_api.php
└── spiele/             ← der neue Ordner
    ├── spiele.html         Übersicht
    ├── nadel.html
    ├── rausch.html
    ├── spiel.html
    ├── highscore_api.php
    ├── gutschein_api.php
    ├── wf-logo.png
    └── bg-pattern.jpg
```

Die Spiele sind darauf ausgelegt: Die APIs suchen `db.php` zuerst im eigenen
Ordner und dann eine Ebene höher im Web-Root – du musst also nichts umtragen.
Logo und Hintergrundbild liegen zur Sicherheit im Ordner mit dabei, damit alles
in sich geschlossen funktioniert.

Zum Prüfen im Browser aufrufen:

```
https://www.wunsch-fabrik.dk/spiele/gutschein_api.php?action=ping
https://www.wunsch-fabrik.dk/spiele/highscore_api.php?action=ping
```

Beide müssen `{"ok":true, ...}` liefern. Kommt `db_php_not_found`, steht in der
Antwort, wo gesucht wurde.

### Falls du einen anderen Ordnernamen willst

Der Name spielt keine Rolle – benenne den Ordner um, wie du magst. Solange alle
Dateien beisammen bleiben, funktioniert alles weiter, weil intern nur relative
Pfade verwendet werden.

## Verlinkung auf der Website

Auf `index.html` reicht ein Link auf die Übersichtsseite, zum Beispiel im Menü:

```html
<a href="spiele/spiele.html">Spiele</a>
```

Wer die Adresse kürzer mag, legt im Ordner zusätzlich eine `index.html` an, die
auf `spiele.html` weiterleitet – dann genügt `wunsch-fabrik.dk/spiele/`.

---

## Gutscheine einstellen

Alles Wichtige steht oben in `gutschein_api.php`:

```php
$WF_REWARDS = [
    'nadel_5000'    => ['pct' => 5,  'need' => 5000,  'lvl' => 2, ...],
    'nadel_ziehung' => ['pct' => 10, 'need' => 15000, 'lvl' => 4, ...],
];

$WF_VOUCHER = [
    'gueltig_tage'   => 30,    // Laufzeit des Codes
    'min_bestellung' => 300,   // Mindestbestellwert in kr
    'pro_mail_tage'  => 30,    // Sperrfrist je E-Mail-Adresse
    'pro_ip_tag'     => 3,     // Anforderungen je Anschluss und Tag
];
```

`need` sind die Punkte, `lvl` das Mindestlevel – beides muss erfüllt sein.
Ein Level gilt erst als geschafft, wenn das Motiv komplett gestickt wurde.

Änderst du diese Werte, trag dieselben auch oben in `nadel.html` ein
(`schwelle5`, `levelFuer5`, `schwelleZiehung`, `levelFuerZiehung`) – sonst zeigt
das Spiel andere Zahlen an, als der Server akzeptiert.

Die Gewinnchance der Ziehung steht in `gutschein_api.php` bei `random_int(0, 2)`
– das ist eine von drei Karten. Für eine von vier Karten müsstest du auch im
Spiel eine vierte Karte ergänzen.

### Wichtig zur Sicherheit

Der Gutscheincode entsteht **ausschließlich auf dem Server**. Das Spiel meldet nur,
was erreicht wurde, und bekommt den fertigen Code zurück. Auch bei der Ziehung
entscheidet der Server, welche Karte gewinnt, bevor gewählt wird – im Browser
steht die Antwort nirgends. Manipulation im Browser bringt daher nichts.

---

## Codes einlösen

**Prüfen** (geht auch vom Handy, ohne Anmeldung):

```
spiele/gutschein_api.php?action=check&code=WF-XXXX-XXXX
```

Zeigt Rabatt, Status, Gültigkeit und Mindestbestellwert.

**Als verbraucht markieren** (nur als Admin angemeldet):

```
spiele/gutschein_api.php?action=redeem&code=WF-XXXX-XXXX&note=Rechnung%202026-114
```

**Übersicht aller Gutscheine** (als Admin):

```
spiele/gutschein_api.php?action=list
spiele/gutschein_api.php?action=list&status=open
```

**Sperren**, falls doch etwas faul ist:

```
spiele/gutschein_api.php?action=void&id=17
spiele/gutschein_api.php?action=void&id=17&undo=1
```

Bei jedem vergebenen Gutschein bekommst du zusätzlich eine kurze Mail an
`hej@wunsch-fabrik.dk`.

---

## Bestenliste verwalten

```
spiele/highscore_api.php?action=admin_list
spiele/highscore_api.php?action=admin_delete&id=5
spiele/highscore_api.php?action=admin_block&id=5&blocked=1
```

Gewertet wird der Gesamtumsatz im Tycoon. Jeder Browser bekommt einen Token,
darüber läuft die Zuordnung – pro Gerät also eine Zeile.

---

## Datenbanktabellen

Werden automatisch angelegt:

- `game_scores` – Bestenliste
- `game_vouchers` – vergebene Gutscheine
- `game_draws` – Lose der Nadel-Ziehung

---

## Zwei Hinweise

**Punktestände sind nicht fälschungssicher.** Die Spiele laufen im Browser, jemand
mit Entwicklerkonsole kann sich eine hohe Punktzahl eintragen. Begrenzt wird der
Schaden durch die Sperrfrist pro E-Mail-Adresse – höchstens ein Gutschein pro
Person und Monat. Beim Tycoon wird zusätzlich gegen die Bestenliste geprüft.
Willst du ganz sicher gehen, könnten Gutscheine auch erst nach deiner Freigabe
verschickt werden.

**Datenschutz.** Für den Gutscheinversand werden Name und E-Mail gespeichert. Das
Häkchen im Spiel bezieht sich nur auf den Versand des Codes, nicht auf Werbung –
das sollte auch so bleiben, sonst wäre die Einwilligung unwirksam. Ein Satz dazu
in deiner Datenschutzerklärung wäre sinnvoll, etwa: *„Bei Teilnahme an unseren
Onlinespielen speichern wir Name und E-Mail-Adresse, um den erspielten Gutschein
zu versenden. Die Daten werden nach Ablauf des Gutscheins gelöscht."*

## Grafik (Oktober 2026)
- `wf-game.css` – gemeinsamer, fröhlicher Spiel-Look für alle Spiele (Himmel, Bonbon-Knöpfe, helle Karten). Farben stehen oben in `:root`.
- `wf-gfx.js` – alle Spielgrafiken als Vektorzeichnungen (keine Bilddateien nötig), die Kulisse mit Sonne, Wolken und Hügeln, Konfetti bei Gewinnen und die Leiste „← Wunsch-Fabrik.dk / Alle Spiele“ oben auf jeder Spielseite.

## Fadenlauf (faden.html)
Knobelspiel: Ein Faden wird von Nagel zu Nagel gespannt und muss alle Perlen auffädeln, ohne an Dornen hängenzubleiben.
24 Level, jedes per Computer auf Lösbarkeit geprüft; „par“ ist die kürzeste Lösung (3 Sterne). Fortschritt bleibt nur im Browser
(localStorage), es werden keine Daten an den Server geschickt. Keine Gutscheine – lässt sich bei Bedarf ergänzen.
