<?php
declare(strict_types=1);
web_crud(['module' => 'fragen', 'table' => 'web_faq', 'title' => 'Häufige Fragen', 'one' => 'Frage', 'order' => 'sort, id',
    'intro' => 'Fragen und Antworten für die Seite „Häufige Fragen“. Kleine Zahl bei „Reihenfolge“ = weiter oben.',
    'fields' => ['title' => ['langs', 'Frage'], 'text' => ['area', 'Antwort'], 'sort' => ['number', 'Reihenfolge']],
    'list' => fn($r) => 'Platz ' . (int)$r['sort']]);
