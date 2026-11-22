<?php
declare(strict_types=1);
web_crud(['module' => 'termine', 'table' => 'web_events', 'title' => 'Termine', 'one' => 'Termin', 'order' => 'date DESC, time DESC',
    'intro' => 'Veranstaltungen und Workshops. Vergangene Termine rutschen auf der Website von selbst nach unten.',
    'fields' => ['date' => ['date', 'Datum'], 'time' => ['time', 'Uhrzeit (optional)'], 'title' => ['langs', 'Überschrift'], 'text' => ['area', 'Beschreibung'],
                 'price' => ['text', 'Preis / Hinweis (z. B. „75 kr. pro Person“ oder „Eintritt frei“)'], 'image' => ['image', 'Bild'], 'published' => ['check', 'Auf der Website zeigen']],
    'list' => fn($r) => h(date('d.m.Y', strtotime($r['date']))) . ($r['time'] !== '' ? ' · ' . h($r['time']) : '') . ($r['published'] ? '' : ' · <span class="pill">versteckt</span>')]);
