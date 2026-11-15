<?php
declare(strict_types=1);
web_crud(['module' => 'galerie', 'table' => 'web_gallery', 'title' => 'Galerie', 'one' => 'Foto', 'order' => 'sort, id DESC', 'need_image' => true,
    'intro' => 'Fotos aus Laden und Werkstatt. Kleine Zahl bei „Reihenfolge“ = weiter vorn.',
    'fields' => ['image' => ['image', 'Foto'], 'title' => ['langs', 'Bildunterschrift (optional)'], 'sort' => ['number', 'Reihenfolge']],
    'list' => fn($r) => 'Platz ' . (int)$r['sort']]);
