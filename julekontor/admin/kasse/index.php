<?php
/* Tablet-Kasse. Nur die Hülle – die Kasse selbst läuft in kasse.js und spricht mit ../api.php. */
declare(strict_types=1);
require __DIR__ . '/../inc/bootstrap.php';
if (!current_user()) { header('Location: ../?p=kasse'); exit; }
if (!can('kasse')) { http_response_code(403); exit('Keine Berechtigung.'); }
header("Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'");
?><!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#a3201d">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Kasse">
<meta name="csrf" content="<?= h(csrf_token()) ?>">
<title>Kasse · Julekontor</title>
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icon-192.png">
<link rel="stylesheet" href="kasse.css?v=3">
<script src="../assets/scanner.js?v=2" defer></script>
<script src="kasse.js?v=2" defer></script>
</head>
<body>
<header class="bar">
  <div class="brand">Julekontor <span>Kasse</span></div>
  <div class="search">
    <input id="search" type="search" placeholder="Suchen oder scannen …" autocomplete="off" enterkeyhint="search" aria-label="Artikel suchen">
    <button id="cam" class="icon-btn" type="button" aria-label="Mit Kamera scannen" title="Mit Kamera scannen">📷</button>
  </div>
  <div id="status" class="status" aria-live="polite"></div>
  <button id="menu" class="icon-btn" type="button" aria-label="Menü">☰</button>
</header>
<main class="pos">
  <section class="catalog" aria-label="Artikel">
    <nav id="cats" class="cats" aria-label="Kategorien"></nav>
    <div id="tiles" class="tiles"></div>
  </section>
  <aside class="cart" id="cart" aria-label="Warenkorb">
    <div class="cart-head"><h2>Warenkorb</h2><span><button id="clear" class="link" type="button">Leeren</button><button id="cart-close" class="link cart-close" type="button" aria-label="Warenkorb zuklappen">▼ Zu</button></span></div>
    <ul id="lines" class="lines"></ul>
    <div class="cart-tools">
      <button id="misc" class="tool" type="button">＋ Diverse</button>
      <button id="disc" class="tool" type="button">％ Rabatt</button>
    </div>
    <div class="sums" id="sums"></div>
    <button id="pay" class="pay" type="button" disabled>Bezahlen</button>
  </aside>
</main>
<button id="cart-toggle" class="cart-toggle" type="button"></button>
<div id="toast" class="toast" role="status" aria-live="polite"></div>
<div id="modal" class="modal" hidden><div class="sheet" role="dialog" aria-modal="true"></div></div>
</body>
</html>
