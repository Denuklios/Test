# Hjemme – Familien-Ortung

- `app/` – Android-App (Flutter). Bauen: `flutter build apk --release --target-platform android-arm64`
- `server/` – PHP-Server mit SQLite. Liegt unter https://www.wunsch-fabrik.dk/hjemme/
- `tests/server_test.py` – Server-Test (`python3 hjemme/tests/server_test.py`)
- `art/` – Grafiken aus Canva (Icon, Begrüßung, SOS)

Hochladen auf den Server: Commit mit „[hochladen]“ in der Beschreibung auf diesen Zweig schieben
(GitHub Action „Hjemme hochladen“). Die Daten in `hjemme/data/` bleiben dabei unangetastet.
