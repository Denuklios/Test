# Funkgerät – Walkie-Talkie-App für Android (mit Widget)

Zwei, drei oder mehr Handys (bis ca. 10) sprechen miteinander wie mit einem Funkgerät:
Taste drücken, sprechen – alle anderen im selben Kanal hören es sofort aus dem Lautsprecher.

## Installieren
1. `Funkgeraet-1.0.apk` aufs Handy laden und öffnen (einmalig „Installation aus unbekannten Quellen“ erlauben).
2. Auf **jedem** Handy installieren.

## Benutzen
1. App öffnen, **Namen** eingeben und auf allen Handys **genau denselben Kanal** (z. B. `falke-4271`, 🎲 erzeugt einen).
2. **Funk einschalten** → Mikrofon und Benachrichtigungen erlauben.
3. **Akku-Optimierung ausschalten** antippen (sonst kann Android den Funk bei ausgeschaltetem Bildschirm abwürgen).
4. **Widget auf den Startbildschirm legen** antippen (oder Startbildschirm lange drücken → Widgets → Funkgerät).

- **Widget:** einmal tippen = senden (rot „SENDET“), nochmal tippen = fertig. Nach spätestens 1 Minute hört es von selbst auf.
  Ist der Funk aus, schaltet ein Tipp aufs Widget ihn ein (öffnet kurz die App).
- **In der App:** großen runden Knopf **gedrückt halten** und sprechen, loslassen = fertig.
- **Benachrichtigung:** „Sprechen“ und „Ausschalten“ gehen auch von dort.
- Empfang läuft im Hintergrund weiter, auch bei ausgeschaltetem Bildschirm (Lautstärke = Medienlautstärke).
- Piep beim Start, „Roger“-Piep am Ende – wie beim echten Funkgerät.

## Wie es funktioniert
- Funktioniert über WLAN **und** mobiles Internet, egal wie weit die Handys auseinander sind.
- Die Sprache läuft über einen kostenlosen öffentlichen Vermittlungsserver (MQTT, `broker.hivemq.com`).
  Alles ist mit dem Kanalnamen verschlüsselt (AES-256) – ohne den Kanalnamen kann niemand mithören.
  Deshalb: Kanalnamen nicht zu einfach wählen.
- Klappt der Server mal nicht: in der App unter ⚙ z. B. `broker.emqx.io:8883` eintragen (auf allen Handys gleich).
- Sprachqualität wie beim Funk (8 kHz), ca. 4 KB pro Sekunde Sprechen.

## Selbst bauen
```
./gradlew testDebugUnitTest assembleRelease
# APK: app/build/outputs/apk/release/app-release.apk
```
