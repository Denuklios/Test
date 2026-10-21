<?php
declare(strict_types=1);
require __DIR__ . '/inc/bootstrap.php';
header('Cache-Control: no-store');
$user = wf_user();
$v = fn(string $f) => (string)@filemtime(__DIR__ . '/' . $f);
?><!doctype html>
<html lang="de" data-base="">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#090909">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Aufträge">
<title>Aufträge · Wunsch-Fabrik</title>
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/icon-192.png">
<link rel="stylesheet" href="assets/app.css?v=<?= $v('assets/app.css') ?>">
</head>
<body>
<?php if (!$user): ?>
<main>
  <div class="card">
    <div class="eyebrow">WUNSCH-FABRIK.DK</div>
    <h2>Bitte anmelden / Log ind</h2>
    <p class="muted">Melde dich zuerst als Admin auf der Hauptseite an und öffne diese Seite danach erneut.<br>Log først ind som admin på hovedsiden, og åbn derefter denne side igen.</p>
  </div>
</main>
<?php else: ?>
<header class="topbar">
  <a class="brand" href="#/">WUNSCH-<b>FABRIK</b></a>
  <span class="spacer"></span>
  <span class="who" id="who"></span>
  <div class="lang" id="lang"></div>
</header>
<nav class="nav" id="nav"></nav>
<main id="view"></main>
<script src="assets/i18n.js?v=<?= $v('assets/i18n.js') ?>"></script>
<script src="assets/app.js?v=<?= $v('assets/app.js') ?>"></script>
<?php endif; ?>
</body>
</html>
