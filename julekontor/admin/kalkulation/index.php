<?php
/* Preiskalkulation – große Arbeitsfläche für Material, Arbeitszeit und Verkaufspreis. Die Oberfläche läuft in kalk.js. */
declare(strict_types=1);
require __DIR__ . '/../inc/bootstrap.php';
if (!current_user()) { header('Location: ../?p=kalkulation'); exit; }
if (role() !== 'admin') { http_response_code(403); exit('Keine Berechtigung.'); }
header("Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'");
?><!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#7c1511">
<meta name="csrf" content="<?= h(csrf_token()) ?>">
<title>Preiskalkulation · Julekontor</title>
<link rel="icon" href="../kasse/icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="kalk.css?v=2">
<script src="kalk.js?v=2" defer></script>
</head>
<body>
<header class="bar">
  <a class="back" href="../">← Admin</a>
  <div class="title">Preiskalkulation</div>
  <nav class="tabs" aria-label="Bereiche">
    <a href="#/" data-tab="projekte">Projekte</a>
    <a href="#/material" data-tab="material">Materiallager</a>
    <a href="#/einstellungen" data-tab="einstellungen">Stundensatz &amp; Einstellungen</a>
  </nav>
  <div id="saved" class="saved" aria-live="polite"></div>
</header>
<main id="view" class="view"><p class="loading">Lade …</p></main>
<div id="timerbar" class="timerbar" hidden></div>
<div id="modal" class="modal" hidden><div class="sheet" role="dialog" aria-modal="true"></div></div>
<div id="toast" class="toast" role="status" aria-live="polite"></div>
</body>
</html>
