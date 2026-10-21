<?php
declare(strict_types=1);
header('Referrer-Policy: no-referrer');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');
$v = (string)filemtime(__DIR__ . '/display.js');
?><!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="referrer" content="no-referrer">
<meta name="theme-color" content="#090909">
<title>Werkstatt</title>
<link rel="icon" href="../icons/icon-192.png">
<link rel="stylesheet" href="../assets/app.css">
<link rel="stylesheet" href="display.css?v=<?= htmlspecialchars($v) ?>">
</head>
<body class="display">
<div id="app">
  <header>
    <img class="logo" src="../assets/logo.png" alt="">
    <div class="brand">WUNSCH-<b>FABRIK</b>.DK</div>
    <div id="clock"></div>
    <div id="conn" class="conn" title=""></div>
  </header>
  <section id="main"><div class="loading">…</div></section>
  <aside id="side"></aside>
</div>
<div id="hint">⛶</div>
<script src="display.js?v=<?= htmlspecialchars($v) ?>"></script>
</body>
</html>
