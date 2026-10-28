<?php
declare(strict_types=1);
// Öffentliche Auftragsverfolgung: Kunde sieht über den geheimen Link den Stand seines Auftrags und ggf. die Sendungsnummer. Kein Login.
require __DIR__ . '/inc/bootstrap.php';
require_once __DIR__ . '/inc/invoice.php';
require_once __DIR__ . '/inc/custmail.php';
session_write_close();
header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');
header('X-Robots-Tag: noindex, nofollow');
header("Content-Security-Policy: default-src 'none'; img-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; form-action 'self'; frame-ancestors 'none'");

$db = wf_db();
$ip = $_SERVER['REMOTE_ADDR'] ?? '0';
// Ratenbegrenzung gegen Raten von Links: max. 30 Fehlversuche je 10 Minuten und IP
$db->prepare('DELETE FROM rate_limit WHERE at < ?')->execute([time() - 600]);
$cnt = $db->prepare('SELECT COUNT(*) FROM rate_limit WHERE ip = ? AND at >= ?');
$cnt->execute([$ip, time() - 600]);
$limited = (int)$cnt->fetchColumn() >= 30;

$token = (string)($_GET['t'] ?? $_POST['t'] ?? '');
$o = false;
if (!$limited && preg_match('/^[0-9a-f]{48}$/', $token)) {
    $st = $db->prepare('SELECT o.*, c.country, c.doc_lang, c.no_followup, c.anonymized_at FROM orders o JOIN customers c ON c.id = o.customer_id
        WHERE o.track_token = ? AND o.deleted_at IS NULL');
    $st->execute([$token]);
    $o = $st->fetch();
    if ($o && $o['anonymized_at']) {
        $o = false;
    }
}
if (!$o && !$limited) {
    $db->prepare('INSERT INTO rate_limit (ip, at) VALUES (?, ?)')->execute([$ip, time()]);
}
$lang = $o ? wf_doc_lang_for(['doc_lang' => $o['doc_lang'], 'country' => $o['country']]) : 'da';
if (in_array($_GET['lang'] ?? '', ['de', 'da', 'en'], true)) {
    $lang = $_GET['lang'];
}
$T = [
    'de' => ['title' => 'Auftragsverfolgung', 'order' => 'Auftrag', 'invalid' => 'Dieser Link ist ungültig.', 'due' => 'Geplante Fertigstellung', 'items' => 'Deine Bestellung',
        'steps' => ['Angefragt', 'Freigegeben', 'Material bestellt', 'In Produktion', 'Fertig', 'Abgeholt / Versendet'], 'picked' => 'Abgeholt', 'shipped' => 'Versendet',
        'tracking' => 'Sendungsnummer', 'carrier' => 'Versand mit', 'follow' => 'Sendung verfolgen', 'ready' => 'Deine Bestellung ist fertig und wartet auf Abholung bzw. Versand.',
        'unsub_q' => 'Keine Nachfrage-E-Mail nach der Lieferung bekommen?', 'unsub_btn' => 'Ja, keine solchen E-Mails mehr', 'unsub_ok' => 'Erledigt – du bekommst keine Nachfrage-E-Mails mehr von uns.',
        'questions' => 'Fragen? Antworte einfach auf unsere E-Mail oder schreib an', 'pcs' => 'Stk.'],
    'da' => ['title' => 'Ordresporing', 'order' => 'Ordre', 'invalid' => 'Dette link er ugyldigt.', 'due' => 'Forventet færdig', 'items' => 'Din bestilling',
        'steps' => ['Forespurgt', 'Godkendt', 'Materiale bestilt', 'I produktion', 'Færdig', 'Afhentet / sendt'], 'picked' => 'Afhentet', 'shipped' => 'Sendt',
        'tracking' => 'Forsendelsesnummer', 'carrier' => 'Sendt med', 'follow' => 'Følg forsendelsen', 'ready' => 'Din ordre er færdig og venter på afhentning eller forsendelse.',
        'unsub_q' => 'Vil du ikke have en opfølgnings-e-mail efter leveringen?', 'unsub_btn' => 'Ja, ingen flere af den slags e-mails', 'unsub_ok' => 'Klaret – du får ikke flere opfølgnings-e-mails fra os.',
        'questions' => 'Spørgsmål? Svar blot på vores e-mail eller skriv til', 'pcs' => 'stk.'],
    'en' => ['title' => 'Order tracking', 'order' => 'Order', 'invalid' => 'This link is not valid.', 'due' => 'Planned completion', 'items' => 'Your order',
        'steps' => ['Requested', 'Approved', 'Material ordered', 'In production', 'Ready', 'Collected / shipped'], 'picked' => 'Collected', 'shipped' => 'Shipped',
        'tracking' => 'Tracking number', 'carrier' => 'Shipped with', 'follow' => 'Track shipment', 'ready' => 'Your order is ready and waiting to be collected or shipped.',
        'unsub_q' => 'Prefer not to receive a follow-up e-mail after delivery?', 'unsub_btn' => 'Yes, no more e-mails like this', 'unsub_ok' => 'Done – you will not receive follow-up e-mails from us any more.',
        'questions' => 'Questions? Simply reply to our e-mail or write to', 'pcs' => 'pcs'],
][$lang];

// Abmeldung von der Nachfrage-Mail (Knopf, damit Link-Scanner in Postfächern nichts auslösen)
$unsubDone = false;
if ($o && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST' && ($_POST['a'] ?? '') === 'unsub') {
    $db->prepare('UPDATE customers SET no_followup = 1 WHERE id = ?')->execute([(int)$o['customer_id']]);
    $db->prepare("INSERT INTO status_log (order_id, user_name, what) VALUES (?, 'Kunde', 'unsubscribed')")->execute([(int)$o['id']]);
    $o['no_followup'] = 1;
    $unsubDone = true;
}

$e = fn($v) => htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8');
$unsubView = isset($_GET['abmelden']) || $unsubDone;
$co = wf_company();
$statuses = ['inquiry', 'approval', 'material', 'production', 'done', 'delivered'];
$cur = $o ? max(0, (int)array_search($o['status'], $statuses, true)) : 0;
$items = $o ? (json_decode((string)$o['items'], true) ?: []) : [];
$carrierUrl = $o ? wf_carrier_url((string)$o['carrier'], (string)$o['tracking_no']) : '';
?><!doctype html>
<html lang="<?= $e($lang) ?>" translate="no">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<meta name="google" content="notranslate">
<meta name="theme-color" content="#f8f7fb">
<title><?= $e($T['title'] . ($o ? ' ' . $o['nr'] : '')) ?></title>
<link rel="icon" href="icons/icon-192.png">
<link rel="stylesheet" href="assets/app.css">
<style>
body{padding:0}main{max-width:640px;margin:0 auto;padding:20px 16px 40px}
.head{display:flex;align-items:center;gap:14px;margin-bottom:18px}.head img{height:44px;border-radius:8px}
.head .b{font-family:var(--head);letter-spacing:.24em;font-weight:600}.head .b b{color:var(--p2);font-weight:600}
.tl{list-style:none;margin:0;padding:0;display:grid;gap:0}
.tl li{position:relative;padding:0 0 18px 34px;color:var(--faint)}
.tl li::before{content:"";position:absolute;left:8px;top:4px;width:14px;height:14px;border-radius:50%;border:2px solid var(--line-strong);background:var(--field)}
.tl li::after{content:"";position:absolute;left:15px;top:22px;bottom:2px;width:2px;background:var(--line)}
.tl li:last-child::after{display:none}
.tl li.done{color:var(--text)}.tl li.done::before{background:var(--p2);border-color:var(--p2)}.tl li.done::after{background:var(--p2)}
.tl li.cur{color:var(--text);font-weight:600}.tl li.cur::before{background:#fff;border:4px solid var(--p2);box-shadow:0 0 0 4px rgba(147,51,234,.18)}
.ship{border-color:var(--p2);background:linear-gradient(180deg,rgba(147,51,234,.08),var(--surface))}
.trk{font-size:1.25rem;font-weight:600;letter-spacing:.04em;word-break:break-all}
.items td{padding:4px 8px 4px 0}
.small{font-size:.8rem;color:var(--muted);margin-top:18px;text-align:center}
.langs{margin-left:auto;display:flex;gap:4px}.langs a{padding:4px 8px;border-radius:8px;text-decoration:none;font-size:1.1rem;opacity:.5}.langs a.on{opacity:1;background:var(--surface3)}
</style>
</head>
<body>
<main>
  <div class="head"><img src="assets/logo-bg.png" alt=""><div class="b">WUNSCH-<b>FABRIK</b>.DK</div>
    <?php if ($o): ?><div class="langs"><?php foreach (['de' => '🇩🇪', 'da' => '🇩🇰', 'en' => '🇬🇧'] as $lc => $fl): ?><a class="<?= $lc === $lang ? 'on' : '' ?>" href="?t=<?= $e($token) ?>&amp;lang=<?= $lc ?>" aria-label="<?= $lc ?>"><?= $fl ?></a><?php endforeach; ?></div><?php endif; ?></div>
<?php if (!$o): ?>
  <div class="card"><h2><?= $e($T['title']) ?></h2><p class="muted"><?= $e($T['invalid']) ?></p></div>
<?php else: ?>
  <div class="eyebrow"><?= $e($T['order']) ?> <?= $e($o['nr']) ?></div>
  <h1><?= $e($o['title']) ?></h1>
  <?php if (!$unsubView): // Abmeldeseite zeigt nur die Abmeldung, keinen Auftragsstand ?>
  <?php if ($o['status'] === 'delivered' && $o['ship_mode'] === 'ship'): ?>
  <div class="card ship">
    <label><?= $e($T['shipped']) ?><?= $o['shipped_at'] ? ' · ' . $e(wf_doc_date(substr($o['shipped_at'], 0, 10), $lang)) : '' ?></label>
    <?php if ($o['tracking_no'] !== ''): ?>
      <div class="muted"><?= $e($T['tracking']) ?><?= $o['carrier'] !== '' && (WF_CARRIERS[$o['carrier']][0] ?? '') !== '' ? ' · ' . $e($T['carrier'] . ' ' . WF_CARRIERS[$o['carrier']][0]) : '' ?></div>
      <div class="trk"><?= $e($o['tracking_no']) ?></div>
      <?php if ($carrierUrl !== ''): ?><p style="margin:10px 0 0"><a class="btn primary" href="<?= $e($carrierUrl) ?>" target="_blank" rel="noopener noreferrer"><?= $e($T['follow']) ?> →</a></p><?php endif; ?>
    <?php endif; ?>
  </div>
  <?php elseif ($o['status'] === 'done'): ?>
  <div class="card ship"><?= $e($T['ready']) ?></div>
  <?php endif; ?>
  <div class="card">
    <ol class="tl">
    <?php foreach ($T['steps'] as $i => $label):
        $lbl = $i === 5 && $o['status'] === 'delivered' && $o['ship_mode'] !== '' ? $T[$o['ship_mode'] === 'ship' ? 'shipped' : 'picked'] : $label; ?>
      <li class="<?= $i < $cur ? 'done' : ($i === $cur ? 'cur' : '') ?>"><?= $e($lbl) ?></li>
    <?php endforeach; ?>
    </ol>
    <?php if ($o['due_date'] && $cur < 4): ?><p class="muted" style="margin:4px 0 0"><?= $e($T['due']) ?>: <b style="color:var(--text)"><?= $e(wf_doc_date($o['due_date'], $lang)) ?></b></p><?php endif; ?>
  </div>
  <?php if ($items): ?>
  <div class="card"><label><?= $e($T['items']) ?></label>
    <table class="items"><?php foreach ($items as $it): ?><tr><td><?= (int)$it['qty'] ?> ×</td><td><?= $e($it['name']) ?></td></tr><?php endforeach; ?></table>
  </div>
  <?php endif; ?>
  <?php endif; ?>
  <?php if ($unsubDone): ?>
  <div class="card"><?= $e($T['unsub_ok']) ?></div>
  <?php elseif (isset($_GET['abmelden']) && !$o['no_followup']): ?>
  <form class="card" method="post" action="verfolgen.php?t=<?= $e($token) ?>">
    <p style="margin-top:0"><?= $e($T['unsub_q']) ?></p>
    <input type="hidden" name="t" value="<?= $e($token) ?>"><input type="hidden" name="a" value="unsub">
    <button class="btn" type="submit"><?= $e($T['unsub_btn']) ?></button>
  </form>
  <?php elseif (isset($_GET['abmelden'])): ?>
  <div class="card"><?= $e($T['unsub_ok']) ?></div>
  <?php endif; ?>
  <p class="small"><?= $e($T['questions']) ?> <?= $e($co['email']) ?><?= $co['phone'] ? ' · ' . $e($co['phone']) : '' ?></p>
<?php endif; ?>
</main>
</body>
</html>
