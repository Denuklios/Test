<?php
/* Julekontor – öffentliche Website: Sprache, Freischaltung, Seitenrahmen.
   Die Seiten selbst liegen in site/pages, der Einstieg ist index.php. */
declare(strict_types=1);
define('JK_NO_SESSION', true);
require __DIR__ . '/../admin/inc/bootstrap.php';
require __DIR__ . '/../admin/inc/shop.php';
require __DIR__ . '/../admin/inc/web.php';

const SITE_LOCALE = ['da' => 'da-DK', 'de' => 'de-DE', 'en' => 'en-GB'];
const SITE_V = '3';   // Versionsnummer für CSS/JS (bei Änderungen erhöhen)

$SITE = web_site();
$PREVIEW = web_preview($SITE);
$OPEN = web_is_open($SITE) || $PREVIEW;

/* ---------- Sprache ---------- */
function site_pick_lang(): string {
    $q = (string)($_GET['l'] ?? '');
    if (isset(WEB_LANGS[$q])) {
        if (!headers_sent()) setcookie('jk_lang', $q, ['expires' => time() + 86400 * 365, 'path' => '/', 'samesite' => 'Lax']);
        return $q;
    }
    $c = (string)($_COOKIE['jk_lang'] ?? '');
    if (isset(WEB_LANGS[$c])) return $c;
    foreach (explode(',', strtolower((string)($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? ''))) as $part) {
        $code = substr(trim($part), 0, 2);
        if (in_array($code, ['nb', 'no', 'sv'], true)) return 'da';
        if (isset(WEB_LANGS[$code])) return $code;
    }
    return 'da';
}
$LANG = site_pick_lang();

/* Text in der Sprache des Besuchers – t() roh, e() für HTML */
function t(string $key, array $vars = []): string { return web_t($key, $GLOBALS['LANG'], $vars); }
function e(string $key, array $vars = []): string { return h(t($key, $vars)); }
function tl(array $row, string $field): string { return web_pick($row, $field, $GLOBALS['LANG']); }
/* Mehrzeiligen Text als Absätze ausgeben */
function paragraphs(string $text): string {
    $out = '';
    foreach (preg_split('/\n\s*\n/', trim(str_replace("\r", '', $text))) as $p) if (trim($p) !== '') $out .= '<p>' . nl2br(h(trim($p))) . '</p>';
    return $out;
}
function url(string $s = '', array $q = []): string {
    $q = ($s !== '' && $s !== 'home' ? ['s' => $s] : []) + $q;
    return './' . ($q ? '?' . http_build_query($q) : '');
}
function fmt_date(string $ymd, bool $weekday = false): string {
    $ts = strtotime($ymd);
    if (!$ts) return '';
    $L = $GLOBALS['LANG'];
    if (class_exists('IntlDateFormatter')) {
        $f = new IntlDateFormatter(SITE_LOCALE[$L], IntlDateFormatter::LONG, IntlDateFormatter::NONE, 'Europe/Copenhagen', null, $weekday ? 'EEEE d. MMMM y' : 'd. MMMM y');
        if ($L === 'en') $f->setPattern($weekday ? 'EEEE d MMMM y' : 'd MMMM y');
        return (string)$f->format($ts);
    }
    return date('d.m.Y', $ts);
}
function price_html(?int $ore): string {
    if ($ore === null) return '<span class="price"><small>' . e('shelf.priceAsk') . '</small></span>';
    $eur = web_eur($ore);
    return '<span class="price">' . h(money($ore)) . '</span>' . ($eur !== '' ? '<span class="eur">' . e('shop.approx', ['eur' => $eur]) . '</span>' : '');
}
function img_url(string $file): string { return $file !== '' && is_file(WEB_IMG_DIR . '/' . $file) ? 'data/bilder/' . rawurlencode($file) : ''; }
/* Eigenes Foto für einen Bereich, sonst das gemalte Bild */
function slot_img(string $slot): string {
    $f = (string)($GLOBALS['SITE']['images'][$slot] ?? '');
    return img_url($f) ?: 'assets/img/' . ($slot === 'werkstatt' ? 'vaerksted' : $slot) . '.webp';
}
function has_rows(string $table, string $where = '1'): bool {
    return (bool)db()->query("SELECT 1 FROM $table WHERE $where LIMIT 1")->fetchColumn();
}

/* ---------- Seitenrahmen ---------- */
function site_nav(): array {
    $S = $GLOBALS['SITE'];
    $n = ['butik' => 'nav.shop'];
    if ($S['calendar']['enabled']) $n['julekalender'] = 'nav.calendar';
    if (has_rows('web_posts', 'published = 1')) $n['nyheder'] = 'nav.news';
    if (has_rows('web_events', 'published = 1')) $n['arrangementer'] = 'nav.events';
    if (has_rows('web_gallery')) $n['galleri'] = 'nav.gallery';
    return $n + ['om' => 'nav.about', 'kontakt' => 'nav.visit'];
}
function site_js_config(array $extra = []): string {
    $S = $GLOBALS['SITE']; $L = $GLOBALS['LANG'];
    $keys = ['hero.opens', 'cal.locked', 'cal.emptyTitle', 'cal.emptyText', 'cal.month', 'cal.error', 'cal.doorOpen', 'cal.doorLocked', 'bell', 'close',
             'form.ok', 'form.err.name', 'form.err.email', 'form.err.contact', 'form.err.message', 'form.err.limit', 'form.err.server', 'req.reserve', 'req.kit',
             'shop.added', 'cart.empty', 'cart.remove', 'cart.subtotal', 'cart.shipping', 'cart.total', 'cart.free', 'cart.changed', 'cart.pickupOnly', 'shop.qty',
             'checkout.d.pickup', 'checkout.d.dk', 'checkout.d.de', 'checkout.p.pickup', 'checkout.p.mobilepay', 'checkout.p.bank', 'checkout.p.card',
             'checkout.err.empty', 'checkout.err.changed', 'checkout.err.delivery', 'checkout.err.payment', 'checkout.err.name', 'checkout.err.email',
             'checkout.err.address', 'checkout.err.terms', 'checkout.err.limit', 'checkout.err.card', 'checkout.err.off', 'checkout.err.server', 'shop.approx', 'ribbon'];
    $t = [];
    foreach ($keys as $k) $t[$k] = $k === 'ribbon' ? (web_lang_defaults()[$L]['ribbon'] ?? []) : t($k);
    $cfg = ['lang' => $L, 'locale' => SITE_LOCALE[$L], 'now' => date('c'), 'snow' => (bool)$S['snow'], 'currency' => setting('currency'),
            'eur' => (float)str_replace(',', '.', setting('web_eur_rate')), 't' => $t] + $extra;
    return '<script>window.JK=' . json_encode($cfg, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP) . ';</script>';
}
function site_lang_switch(): string {
    $q = $_GET; unset($q['l'], $q['vorschau']);
    $o = '<div class="lang" role="group" aria-label="Sprog / Sprache / Language">';
    foreach (WEB_LANGS as $l => $_) $o .= '<a href="./?' . h(http_build_query($q + ['l' => $l])) . '"' . ($l === $GLOBALS['LANG'] ? ' aria-current="true"' : '') . ' hreflang="' . $l . '">' . strtoupper($l) . '</a>';
    return $o . '</div>';
}
function site_head(string $title, string $active = '', string $desc = '', bool $bare = false): void {
    $S = $GLOBALS['SITE']; $L = $GLOBALS['LANG'];
    header('Content-Type: text/html; charset=utf-8');
    header_remove('X-Frame-Options'); header('X-Frame-Options: SAMEORIGIN');
    $full = ($title !== '' ? $title . ' – ' : '') . 'Julekontor';
    ?>
<!doctype html>
<html lang="<?= $L ?>">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= h($title !== '' ? $full : t('meta.title')) ?></title>
<meta name="description" content="<?= h($desc !== '' ? $desc : t('hero.line')) ?>">
<?php if ($bare || $GLOBALS['PREVIEW']): ?><meta name="robots" content="noindex"><?php endif; ?>
<meta property="og:title" content="<?= h($title !== '' ? $full : t('meta.title')) ?>">
<meta property="og:image" content="weihnachtsbild.jpeg">
<meta name="theme-color" content="#7c1511">
<link rel="icon" href="assets/img/favicon.svg" type="image/svg+xml">
<link rel="preload" href="assets/fonts/berkshire-swash-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="assets/fonts/alegreya-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="assets/css/site.css?v=<?= SITE_V ?>">
</head>
<body class="<?= $bare ? 'is-soon' : '' ?>">
<a class="skip" href="#indhold"><?= e('skip') ?></a>
<?php if ($GLOBALS['PREVIEW'] && !web_is_open($S)): ?><div class="notice notice-preview"><?= e('preview.bar') ?></div><?php endif; ?>
<?php $n = tl(['x_da' => $S['notice']['da'], 'x_de' => $S['notice']['de'], 'x_en' => $S['notice']['en']], 'x'); if ($n !== '' && !$bare): ?><div class="notice"><?= h($n) ?></div><?php endif; ?>
<header class="top" id="top">
  <a class="top-brand" href="<?= h(url()) ?>">Julekontor</a>
  <?php if (!$bare): ?>
  <nav class="top-nav" aria-label="<?= e('nav.menu') ?>" id="nav">
    <?php foreach (site_nav() as $s => $k): ?><a href="<?= h(url($s)) ?>"<?= $s === $active ? ' class="on" aria-current="page"' : '' ?>><?= e($k) ?></a><?php endforeach; ?>
  </nav>
  <a class="cart-link" href="<?= h(url('kurv')) ?>" aria-label="<?= e('nav.cart') ?>">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h18l-1.600 10a2 2 0 0 1-2 1.700H6.600a2 2 0 0 1-2-1.700zM8 9l3-6M16 9l-3-6"/></svg><span class="cart-count" id="cartCount" hidden>0</span>
  </a>
  <?php endif; ?>
  <?= site_lang_switch() ?>
  <?php if (!$bare): ?><button class="burger" type="button" aria-label="<?= e('nav.menu') ?>" aria-expanded="false" aria-controls="nav"><span></span><span></span><span></span></button><?php endif; ?>
</header>
<main id="indhold">
<?php }

/* Kopf einer Unterseite: Bild, Überschrift, Einleitung */
function page_banner(string $eyebrow, string $title, string $lead = '', string $img = 'assets/img/landskab.webp'): void { ?>
<section class="banner">
  <div class="banner-bg" style="background-image:url('<?= h($img) ?>')"></div>
  <div class="wrap">
    <?php if ($eyebrow !== ''): ?><p class="eyebrow"><?= h($eyebrow) ?></p><?php endif; ?>
    <h1><?= h($title) ?></h1>
    <?php if ($lead !== ''): ?><p class="lead"><?= h($lead) ?></p><?php endif; ?>
  </div>
</section>
<?php }

function site_foot(array $js = [], bool $bare = false): void {
    $S = $GLOBALS['SITE']; $c = $S['contact']; ?>
</main>
<footer class="foot">
  <div class="scallop scallop-top" aria-hidden="true"></div>
  <div class="wrap foot-grid">
    <div class="foot-brand">
      <img class="foot-logo" src="assets/img/logo.webp" alt="Julekontor" loading="lazy" width="906" height="658">
    </div>
    <?php if (!$bare): ?>
    <div class="foot-col">
      <h2><?= e('foot.shop') ?></h2>
      <a href="<?= h(url('butik')) ?>"><?= e('nav.shop') ?></a>
      <a href="<?= h(url('kurv')) ?>"><?= e('nav.cart') ?></a>
      <?php if ($S['calendar']['enabled']): ?><a href="<?= h(url('julekalender')) ?>"><?= e('nav.calendar') ?></a><?php endif; ?>
      <a href="<?= h(url('arrangementer')) ?>"><?= e('nav.events') ?></a>
    </div>
    <div class="foot-col">
      <h2><?= e('foot.info') ?></h2>
      <a href="<?= h(url('om')) ?>"><?= e('nav.about') ?></a>
      <a href="<?= h(url('kontakt')) ?>"><?= e('nav.visit') ?></a>
      <a href="<?= h(url('nyheder')) ?>"><?= e('nav.news') ?></a>
      <a href="<?= h(url('galleri')) ?>"><?= e('nav.gallery') ?></a>
      <a href="<?= h(url('faq')) ?>"><?= e('nav.faq') ?></a>
    </div>
    <div class="foot-col">
      <h2><?= e('foot.legal') ?></h2>
      <?php foreach (['terms', 'withdrawal', 'privacy', 'imprint'] as $d): ?><a href="<?= h(url('vilkaar', ['d' => $d])) ?>"><?= e('legal.' . $d) ?></a><?php endforeach; ?>
    </div>
    <?php endif; ?>
  </div>
  <div class="wrap foot-base">
    <p class="foot-greet"><?= e('foot.greet') ?></p>
    <p>© <?= date('Y') ?> Julekontor · <?= h(implode(', ', array_filter([$c['street'], $c['city']]))) ?><?= $c['cvr'] !== '' ? ' · CVR ' . h($c['cvr']) : '' ?></p>
    <p class="foot-small"><a href="admin/" rel="nofollow">Admin</a></p>
  </div>
</footer>
<?= site_js_config($js) ?>
<script src="assets/js/site.js?v=<?= SITE_V ?>"></script>
</body>
</html>
<?php }

/* Kopfbereich mit Girlande, Schnee, Logo und Truck – auf der Startseite und der Countdown-Seite */
function hero(bool $soon): void {
    $S = $GLOBALS['SITE'];
    $line = tl(['x_da' => $S['hero']['da'], 'x_de' => $S['hero']['de'], 'x_en' => $S['hero']['en']], 'x') ?: t('hero.line');
    $target = strtotime((string)$S['countdownTarget']);
    $count = $S['countdownEnabled'] && $target && $target > time(); ?>
<section class="hero<?= $soon ? ' hero-soon' : '' ?>" id="hero">
  <picture class="hero-bg" aria-hidden="true">
    <source media="(max-width: 700px)" srcset="assets/img/landskab-m.webp">
    <img src="assets/img/landskab.webp" alt="" width="2400" height="1200" fetchpriority="high">
  </picture>
  <div class="garland" aria-hidden="true"></div>
  <?php if ($S['bell']): ?>
  <button class="bell" id="bell" type="button" aria-label="<?= e('bell') ?>">
    <svg viewBox="0 0 60 92" aria-hidden="true"><path class="bell-string" d="M30 0v26"/><g class="bell-body"><path d="M30 24c-11 0-17 9-17 22 0 9-3 14-8 19h50c-5-5-8-10-8-19 0-13-6-22-17-22z" fill="url(#bellG)" stroke="#8a5a14" stroke-width="1.5"/><path d="M5 65h50v5H5z" fill="#b07a22" stroke="#8a5a14" stroke-width="1.2"/><circle class="bell-clap" cx="30" cy="76" r="6" fill="#8a5a14"/><path d="M21 34c-3 4-4 9-4 14" stroke="#fff3c9" stroke-width="2.5" stroke-linecap="round" fill="none" opacity=".7"/><path d="M18 24c4-7 20-7 24 0-5 3-19 3-24 0z" fill="#a8231c"/><path d="M30 22l-12-9 2 12zM30 22l12-9-2 12z" fill="#c5322a"/></g><defs><linearGradient id="bellG" x1="0" x2="1"><stop offset="0" stop-color="#e9c46a"/><stop offset=".55" stop-color="#c9973f"/><stop offset="1" stop-color="#9b6a1c"/></linearGradient></defs></svg>
  </button>
  <?php endif; ?>
  <canvas class="snow" id="snow" aria-hidden="true"></canvas>
  <div class="hero-grid">
    <div class="hero-brand">
      <h1 class="logo"><img src="assets/img/logo.webp" width="906" height="658" alt="Julekontor – Danmarks Gammeldags Julebutik"><span class="logo-shine" aria-hidden="true"></span></h1>
      <p class="hero-line"><?= h($line) ?></p>
      <?php if ($count): ?>
      <div class="count" id="count" data-target="<?= h(date('c', $target)) ?>">
        <p class="count-label"><?= e('hero.opens', ['date' => fmt_date(date('Y-m-d', $target))]) ?></p>
        <div class="count-row" role="timer" aria-live="off">
          <?php foreach (['d' => 'days', 'h' => 'hours', 'm' => 'minutes', 's' => 'seconds'] as $u => $k): ?>
          <div class="count-unit"><span class="count-num" data-u="<?= $u ?>">0</span><span class="count-name"><?= e('count.' . $k) ?></span></div>
          <?php endforeach; ?>
        </div>
      </div>
      <?php endif; ?>
      <?php if ($soon): ?>
        <p class="soon-text"><?= e('soon.text') ?></p>
      <?php else: ?>
        <?php if (!$count): ?><p class="open-now"><?= e('hero.open') ?></p><?php endif; ?>
        <div class="hero-cta">
          <a class="btn" href="<?= h(url('butik')) ?>"><?= e('hero.cta1') ?></a>
          <?php if ($S['calendar']['enabled']): ?><a class="btn btn-line" href="<?= h(url('julekalender')) ?>"><?= e('hero.cta2') ?></a><?php endif; ?>
        </div>
      <?php endif; ?>
    </div>
  </div>
  <div class="scene" aria-hidden="true">
    <div class="truck-wrap" id="truck">
      <div class="truck-beam"></div>
      <img class="truck" src="assets/img/truck.webp" width="778" height="584" alt="">
      <span class="truck-light l1"></span><span class="truck-light l2"></span>
      <span class="truck-shadow"></span>
      <span class="puff p1"></span><span class="puff p2"></span><span class="puff p3"></span>
    </div>
  </div>
</section>
<?php }

/* Karte für einen Artikel im Shop */
function product_card(array $p): void { ?>
<article class="item reveal">
  <?php if ($p['kit']): ?><span class="tag"><?= e('shelf.kit') ?></span><?php endif; ?>
  <?php if ($p['max'] < 1): ?><span class="tag out"><?= e('shelf.soldout') ?></span><?php endif; ?>
  <a class="item-img" href="<?= h(url('vare', ['id' => $p['id']])) ?>" tabindex="-1" aria-hidden="true">
    <?php if ($p['image']): ?><img src="<?= h($p['image']) ?>" alt="" loading="lazy" width="480" height="480">
    <?php else: ?><img src="assets/img/mere.webp" alt="" loading="lazy" class="ph"><?php endif; ?>
  </a>
  <h3><a href="<?= h(url('vare', ['id' => $p['id']])) ?>"><?= h($p['name']) ?></a></h3>
  <div class="item-foot">
    <div><?= price_html($p['price']) ?></div>
    <?php if ($p['buyable']): ?><button class="btn btn-small" type="button" data-add="<?= $p['id'] ?>"><?= e('shop.add') ?></button>
    <?php else: ?><a class="btn btn-small btn-line" href="<?= h(url('vare', ['id' => $p['id']])) ?>"><?= e('shop.view') ?></a><?php endif; ?>
  </div>
</article>
<?php }

/* Kontaktformular (Frage) – $product optional für Reservierung */
function contact_form(string $kind = 'frage', int $product = 0, string $title = ''): void { ?>
<form class="letter reveal" data-request data-kind="<?= h($kind) ?>" data-product="<?= $product ?>" novalidate>
  <h3><?= h($title !== '' ? $title : t('form.title')) ?></h3>
  <p class="letter-lead"><?= e('form.lead') ?></p>
  <label><span><?= e('form.name') ?></span><input name="name" autocomplete="name" required maxlength="80"></label>
  <div class="two">
    <label><span><?= e('form.email') ?></span><input name="email" type="email" autocomplete="email" maxlength="120"></label>
    <label><span><?= e('form.phone') ?></span><input name="phone" type="tel" autocomplete="tel" maxlength="40"></label>
  </div>
  <label><span><?= e('form.message') ?></span><textarea name="message" rows="4" maxlength="2000"></textarea></label>
  <label class="hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
  <p class="form-msg" role="status" aria-live="polite"></p>
  <button class="btn" type="submit"><?= e('form.send') ?></button>
  <p class="fine"><?= e('form.privacy') ?> <a href="<?= h(url('vilkaar', ['d' => 'privacy'])) ?>"><?= e('legal.privacy') ?></a></p>
</form>
<?php }

/* Adresse, Links und Öffnungszeiten als Postkarte */
function visit_card(): void {
    $S = $GLOBALS['SITE']; $c = $S['contact']; $hr = $S['hours'];
    $maps = $c['maps'] ?: 'https://www.openstreetmap.org/search?query=' . rawurlencode(implode(', ', array_filter([$c['street'], $c['city'], 'Danmark'])));
    $days = web_lang_defaults()[$GLOBALS['LANG']]['visit.daysLong'];
    $today = ((int)date('N')) - 1;
    $note = tl(['x_da' => $hr['note']['da'], 'x_de' => $hr['note']['de'], 'x_en' => $hr['note']['en']], 'x'); ?>
<div class="postcard reveal">
  <div class="postcard-stamp" aria-hidden="true"><img src="assets/img/truck.webp" alt="" loading="lazy" width="778" height="584"><span>JUL</span></div>
  <h3><?= e('visit.find') ?></h3>
  <address><strong>Julekontor</strong><?= $c['street'] !== '' ? h($c['street']) . '<br>' : '' ?><?= h($c['city']) ?></address>
  <div class="visit-links">
    <a href="<?= h($maps) ?>" target="_blank" rel="noopener"><?= e('visit.route') ?> ↗</a>
    <?php if ($c['phone'] !== ''): ?><a href="tel:<?= h(preg_replace('/[^0-9+]/', '', $c['phone'])) ?>"><?= h($c['phone']) ?></a><?php endif; ?>
    <?php if ($c['email'] !== ''): ?><a href="mailto:<?= h($c['email']) ?>"><?= h($c['email']) ?></a><?php endif; ?>
    <?php if ($c['facebook'] !== ''): ?><a href="<?= h($c['facebook']) ?>" target="_blank" rel="noopener">Facebook ↗</a><?php endif; ?>
    <?php if ($c['instagram'] !== ''): ?><a href="<?= h($c['instagram']) ?>" target="_blank" rel="noopener">Instagram ↗</a><?php endif; ?>
  </div>
  <h3><?= e('visit.hours') ?></h3>
  <?php if ($hr['published']): ?>
  <table class="hours">
    <?php foreach ($hr['days'] as $i => $d): ?><tr<?= $i === $today ? ' class="today"' : '' ?>><td><?= h($days[$i]) ?></td><td><?= $d['closed'] ? e('visit.closed') : h($d['open']) . ' – ' . h($d['close']) ?></td></tr><?php endforeach; ?>
  </table>
  <?php else: ?><p class="soon"><?= e('visit.hoursSoon') ?></p><?php endif; ?>
  <?php if ($note !== ''): ?><p class="hours-note"><?= nl2br(h($note)) ?></p><?php endif; ?>
</div>
<?php }
