<?php
/**
 * Wunsch-Fabrik.dk – Weiterleitung zu WhatsApp.
 * Die Telefonnummer steht nur hier auf dem Server und nicht im HTML der Webseite,
 * damit Sammelprogramme sie nicht einfach auslesen können.
 */
header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: no-store');
header('Location: https://wa.me/4593900939', true, 302);
exit;
