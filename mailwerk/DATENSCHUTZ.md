# Datenschutzerklärung – Mailwerk

*Stand: November 2026*

Mailwerk ist ein E-Mail-Programm für Android. Es ist so gebaut, dass **keine Daten beim App-Anbieter landen**.
Es gibt keinen Mailwerk-Server, kein Benutzerkonto bei uns, keine Werbenetzwerke und keine Analyse- oder Tracking-Dienste.

## Welche Daten verarbeitet die App – und wo?

| Daten | Wo gespeichert | Wohin übertragen |
|---|---|---|
| E-Mail-Adresse, Servereinstellungen | nur auf deinem Gerät | an deinen E-Mail-Anbieter (zum Anmelden) |
| Passwort bzw. Anmelde-Token (Google/Microsoft) | nur auf deinem Gerät, verschlüsselt mit dem Android-Keystore | nur an deinen E-Mail-Anbieter bzw. an Google/Microsoft zur Anmeldung |
| E-Mails, Anhänge, Kontakte aus Mails | nur auf deinem Gerät (Zwischenspeicher) | werden mit deinem E-Mail-Anbieter abgeglichen |
| Regeln, Sperrliste, Signatur, Einstellungen | nur auf deinem Gerät | – |

Die Verbindung zu deinem E-Mail-Anbieter ist verschlüsselt (TLS), sofern du nicht ausdrücklich „keine Verschlüsselung“ wählst.

## Verbindungen zu Dritten
Mailwerk verbindet sich nur in diesen Fällen mit anderen Servern als deinem E-Mail-Anbieter:

- **Automatische Servererkennung** beim Einrichten: Die *Domain* deiner Adresse (z. B. „beispiel.de“, nicht die ganze Adresse)
  wird bei der Mozilla-Datenbank (autoconfig.thunderbird.net) und per DNS-Abfrage (dns.google) nachgeschlagen,
  die vollständige Adresse ggf. beim autoconfig-Dienst deines eigenen Anbieters.
- **Anmeldung mit Google oder Microsoft**: Die Anmeldung läuft im Browser direkt bei Google bzw. Microsoft.
  Es gelten deren Datenschutzbestimmungen. Mailwerk erhält nur ein Zugangs-Token für dein Postfach.
- **Newsletter abbestellen**: Nur wenn du „Abmelden“ antippst, wird die vom Absender angegebene Abmelde-Adresse aufgerufen.
- **Startbildschirm „Powered by“**: Nur wenn du den Hinweis antippst, öffnet sich die Website des Partners im Browser.
- **Familienkalender (optional)**: Nur wenn du ihn unter Einstellungen → Familienkalender verbindest, werden Termine aus
  Kalender-Einladungen in deinen Mails (Titel, Zeit, Ort, Beschreibung, Absender und Betreff der Mail) an den Kalender-Server
  übertragen, den du dort angibst. Alle Mitglieder dieser Kalender-Gruppe sehen die Termine. Der Inhalt der Mails selbst wird nicht übertragen.
- **Externe Bilder** in Mails werden standardmäßig blockiert und nur geladen, wenn du es erlaubst.
- **Direkt-Version (nicht Play Store)**: Die App prüft auf GitHub, ob eine neue Version vorliegt. Dabei werden keine persönlichen Daten gesendet.

## Absturzberichte
Stürzt die App ab, wird ein technischer Bericht (Fehlerstelle, App- und Android-Version, Gerätemodell) **nur auf dem Gerät** gespeichert.
Er wird nur versendet, wenn du selbst „Bericht senden“ antippst. Er enthält keine E-Mails, Adressen oder Passwörter.

## Berechtigungen
- **Internet / Netzwerkstatus**: E-Mails abrufen und senden.
- **Benachrichtigungen**: neue Mails und Erinnerungen anzeigen.
- **Vordergrunddienst / Start nach Neustart / Wachhalten**: Sofort-Benachrichtigung (Push) per IMAP IDLE.
- **Fotos/Dateien**: nur die Dateien, die du selbst als Anhang oder Logo auswählst.

## Löschen
Ein Konto in der App entfernen löscht alle zugehörigen Daten vom Gerät. Die App deinstallieren löscht alles.
Deine Mails beim E-Mail-Anbieter bleiben davon unberührt.

## Kontakt
Fragen zum Datenschutz: siehe Kontaktadresse im Store-Eintrag.

---

# Privacy Policy – Mailwerk (English)

Mailwerk is an email client for Android. **No data is sent to the app developer.** There is no Mailwerk server, no account with us,
no ad networks, no analytics or tracking.

- Account settings, passwords/sign-in tokens (encrypted with the Android Keystore), emails, rules and settings are stored **only on your device**
  and are exchanged only with **your own email provider** over encrypted connections (TLS).
- Server auto-detection looks up the *domain* of your address at autoconfig.thunderbird.net and via DNS (dns.google).
- "Sign in with Google/Microsoft" happens in the browser directly with Google/Microsoft; Mailwerk only receives an access token for your mailbox.
- Family calendar (optional): only if you connect it under Settings → Family calendar, appointments from calendar invitations in your
  emails (title, time, place, description, sender and subject) are sent to the calendar server you enter there and are visible to that group.
- Unsubscribe links and the “Powered by” sponsor website are only opened when you tap them. Remote images are blocked by default.
- Crash reports are stored locally and only sent if you tap "Send report"; they contain no emails, addresses or passwords.
- Removing an account deletes its data from the device; uninstalling deletes everything.
