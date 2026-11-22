<?php
declare(strict_types=1);
web_crud(['module' => 'neuigkeiten', 'table' => 'web_posts', 'title' => 'Neuigkeiten', 'one' => 'Beitrag', 'order' => 'date DESC, id DESC',
    'intro' => 'Kurze Beiträge für die Seite „Neuigkeiten“ und die Startseite. Ist eine Sprache leer, zeigt die Website den Text einer anderen Sprache.',
    'fields' => ['date' => ['date', 'Datum'], 'title' => ['langs', 'Überschrift'], 'text' => ['area', 'Text', 'Leerzeile = neuer Absatz.'],
                 'image' => ['image', 'Bild'], 'published' => ['check', 'Auf der Website zeigen']],
    'list' => fn($r) => h(date('d.m.Y', strtotime($r['date']))) . ($r['published'] ? '' : ' · <span class="pill">versteckt</span>')]);
