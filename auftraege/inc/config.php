<?php
// Einstellungen der Auftrags-App. Nur hier anpassen.
return [
    // Speicherort der SQLite-Datei und der Uploads.
    // Besser AUSSERHALB des Webroots (z. B. '/customers/.../wf_daten'); sonst Ordner data/ mit Sperre.
    'data_dir'    => __DIR__ . '/../data',

    // Name des Session-Schluessels des bestehenden Admin-Logins.
    'session_key' => 'wf_admin_id',
    // Optional: Session-Name der Hauptseite, falls abweichend (leer = PHP-Standard).
    'session_name' => '',

    // NUR zum lokalen Testen: Login ohne Hauptseite (nie auf dem Server aktivieren!).
    'dev_login'   => false,

    // Ablaufzeit des Datenschutz-Papierkorbs in Tagen.
    'trash_days'  => 30,

    // Upload-Grenzen
    'max_upload_bytes' => 10 * 1024 * 1024,
    'allowed_ext' => ['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf'],

    // Wechselkurs-Hinweis wird nicht verrechnet; Preise werden je Auftrag in DKK oder EUR gefuehrt.
    'currencies'  => ['DKK', 'EUR'],
];
