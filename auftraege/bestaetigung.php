<?php
declare(strict_types=1);
// Oeffentliche Auftragsbestaetigung: Kunde oeffnet den geheimen Link, prueft und unterschreibt. Kein Login.
require __DIR__ . '/inc/bootstrap.php';
require_once __DIR__ . '/inc/invoice.php';
require __DIR__ . '/inc/confirm.php';
require_once __DIR__ . '/inc/custmail.php';
session_write_close();
$nonce = base64_encode(random_bytes(16));
header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');
header('X-Robots-Tag: noindex, nofollow');
header("Content-Security-Policy: default-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'nonce-$nonce'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'");

$db = wf_db();
$ip = $_SERVER['REMOTE_ADDR'] ?? '0';
// Ratenbegrenzung gegen Raten von Links: max. 30 Fehlversuche je 10 Minuten und IP
$db->prepare('DELETE FROM rate_limit WHERE at < ?')->execute([time() - 600]);
$cnt = $db->prepare('SELECT COUNT(*) FROM rate_limit WHERE ip = ? AND at >= ?');
$cnt->execute([$ip, time() - 600]);
$limited = (int)$cnt->fetchColumn() >= 30;

$token = (string)($_GET['t'] ?? '');
$c = false;
$admin = false;
if (isset($_GET['id']) && wf_user()) {
    // Ansicht für den Inhaber (angemeldet): jede Bestätigung per ID, auch unterschriebene zum Drucken
    $st = $db->prepare('SELECT * FROM order_confirmations WHERE id = ?');
    $st->execute([(int)$_GET['id']]);
    $c = $st->fetch();
    $admin = (bool)$c;
} elseif (!$limited && preg_match('/^[0-9a-f]{48}$/', $token)) {
    $st = $db->prepare("SELECT * FROM order_confirmations WHERE token_hash = ? AND revoked_at IS NULL AND (signed_at IS NOT NULL OR expires_at > datetime('now'))");
    $st->execute([hash('sha256', $token)]);
    $c = $st->fetch();
}
if (!$c && !$limited && !isset($_GET['id'])) {
    $db->prepare('INSERT INTO rate_limit (ip, at) VALUES (?, ?)')->execute([$ip, time()]);
}
$snap = $c ? json_decode($c['snapshot'], true) : null;
$lang = $c ? $c['lang'] : 'da';
$T = wf_confirm_text($lang);

// Vorschaubild eines Motivs dieses Auftrags
if ($c && isset($_GET['file'])) {
    require __DIR__ . '/inc/thumb.php';
    $fid = (int)$_GET['file'];
    $fs = $db->prepare("SELECT * FROM order_files WHERE id = ? AND order_id = ? AND mime LIKE 'image/%'");
    $fs->execute([$fid, $c['order_id']]);
    $f = in_array($fid, $snap['files'] ?? [], true) ? $fs->fetch() : false;
    $dir = rtrim((string)wf_cfg('data_dir'), '/') . '/uploads';
    $th = $f ? wf_thumb($dir, $f, $dir . '/' . $f['stored_name']) : null;
    if (!$th) {
        http_response_code(404);
        exit;
    }
    header('Content-Type: ' . $th[1]);
    header('X-Content-Type-Options: nosniff');
    readfile($th[0]);
    exit;
}

// Unterschreiben
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!$c || $admin) {
        wf_fail('invalid', 403);
    }
    if ($c['signed_at']) {
        wf_fail('already_signed', 409);
    }
    $in = json_decode((string)file_get_contents('php://input'), true);
    $name = is_array($in) ? trim(mb_substr((string)($in['name'] ?? ''), 0, 120)) : '';
    $sig = is_array($in) ? (string)($in['signature'] ?? '') : '';
    if ($name === '' || empty($in['accept']) || !str_starts_with($sig, 'data:image/png;base64,') || strlen($sig) > 400000) {
        wf_fail('bad_input');
    }
    $png = base64_decode(substr($sig, 22), true);
    $info = $png ? @getimagesizefromstring($png) : false;
    if (!$info || $info[2] !== IMAGETYPE_PNG || $info[0] > 2000 || $info[1] > 1000) {
        wf_fail('bad_signature');
    }
    $db->beginTransaction();
    $db->prepare("UPDATE order_confirmations SET signed_at = datetime('now'), signer_name = ?, signature = ?, sign_ip = ?, sign_ua = ? WHERE id = ? AND signed_at IS NULL")
        ->execute([$name, base64_encode($png), $ip, mb_substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 300), $c['id']]);
    $db->prepare('INSERT INTO status_log (order_id, user_name, what) VALUES (?,?,?)')->execute([$c['order_id'], $name, 'confirmed:' . substr(hash('sha256', $c['snapshot']), 0, 12)]);
    // Unterschrift = Freigabe: Auftrag rueckt von "Angefragt" auf "Freigabe" (spaetere Status bleiben unberuehrt)
    $up = $db->prepare("UPDATE orders SET status = 'approval', updated_at = datetime('now') WHERE id = ? AND status = 'inquiry' AND deleted_at IS NULL");
    $up->execute([$c['order_id']]);
    if ($up->rowCount()) {
        $db->prepare('INSERT INTO status_log (order_id, user_name, what) VALUES (?,?,?)')->execute([$c['order_id'], $name, 'status:approval']);
    }
    $db->commit();
    wf_touch();
    // Danke-Mail mit Verfolgungslink (Fehler beim Mailen ändern nichts an der gültigen Unterschrift)
    try {
        wf_cm_approved($db, (int)$c['order_id'], wf_public_base($db) . 'bestaetigung.php?t=' . $token);
    } catch (Throwable $e) {
        error_log('auftraege approved mail: ' . $e->getMessage());
    }
    wf_json(['ok' => true]);
}
if ($c && !$admin && !$c['viewed_at']) {
    $db->prepare("UPDATE order_confirmations SET viewed_at = datetime('now') WHERE id = ? AND signed_at IS NULL")->execute([$c['id']]);
}

$e = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
$money = fn(float $v, string $cur) => number_format($v, 2, $lang === 'en' ? '.' : ',', $lang === 'en' ? ',' : '.') . ' ' . $cur;
$S = $snap['seller'] ?? [];
$signed = $c && $c['signed_at'];
$pageTitle = $signed || !isset($T['offer']) ? $T['title'] : $T['offer'];
$C = $snap['customer'] ?? [];
$thumbSrc = fn(int $fid) => $admin ? 'file.php?id=' . $fid . '&thumb=1' : '?t=' . rawurlencode($token) . '&file=' . $fid;
?><!doctype html>
<html lang="<?= $e($lang) ?>">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<meta name="google" content="notranslate">
<meta name="theme-color" content="#f8f7fb">
<title><?= $e($pageTitle . ($snap ? ' ' . $snap['nr'] : '')) ?></title>
<link rel="icon" href="icons/icon-192.png">
<link rel="stylesheet" href="assets/app.css">
<style>
body{padding:0}main{max-width:640px;margin:0 auto;padding:20px 16px 40px}
.head{display:flex;align-items:center;gap:14px;margin-bottom:18px}.head img{height:44px;border-radius:8px}
.head .b{font-family:var(--head);letter-spacing:.24em;font-weight:600}.head .b b{color:var(--p2);font-weight:600}
.kv{margin-top:6px}.thumbs{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.thumbs img{width:110px;height:110px;object-fit:cover;border-radius:12px;border:1px solid var(--line-strong);background:#fff}
#pad{width:100%;height:180px;background:#fff;border-radius:12px;touch-action:none;display:block;cursor:crosshair}
.acc{display:flex;gap:10px;align-items:flex-start;text-transform:none;letter-spacing:0;font-size:.95rem;color:var(--text);margin:14px 0}
.acc input{width:22px;height:22px;min-height:0;flex:none;margin-top:2px}
.done{border-color:rgba(52,211,153,.6);background:linear-gradient(180deg,rgba(52,211,153,.12),var(--surface))}
.sigimg{background:#fff;border-radius:10px;max-width:100%;height:90px;margin-top:8px}
.small{font-size:.8rem;color:var(--muted);margin-top:18px;text-align:center}
.terms ol{margin:0;padding-left:20px}.terms li{margin:0 0 6px;font-size:.9rem}
.wdr{margin-top:10px;padding:10px 12px;border-radius:12px;border:1px solid rgba(245,158,11,.5);background:rgba(245,158,11,.08);font-size:.9rem}
.valid{font-size:.9rem;color:var(--p3);margin:-4px 0 12px}
.cust{white-space:pre-line}
@media print{
  body,html{background:#fff!important;color:#000}main{max-width:none;padding:0}
  .card{background:#fff!important;border:1px solid #bbb!important;box-shadow:none!important;color:#000;break-inside:avoid}
  .muted,.small,.kv dt{color:#444!important}h1,h2,.eyebrow,.valid{color:#000!important}.noprint{display:none!important}
  .head .b{color:#000}.head .b b{color:#6d1fc0}.wdr{background:#fff;border-color:#999}
}
</style>
</head>
<body>
<main>
  <div class="head"><img src="assets/logo-bg.png" alt=""><div class="b">WUNSCH-<b>FABRIK</b>.DK</div></div>
<?php if (!$snap): ?>
  <div class="card"><h2><?= $e($T['title']) ?></h2><p class="muted"><?= $e($T['invalid']) ?></p></div>
<?php else: ?>
  <div class="eyebrow"><?= $e($signed ? $T['order'] : ($T['offer_nr'] ?? $T['order'])) ?> <?= $e($snap['nr']) ?> · <?= $e(wf_doc_date($snap['created'] ?? null, $lang)) ?></div>
  <h1><?= $e($pageTitle) ?></h1>
  <p class="muted"><?= $e($signed ? ($T['intro_done'] ?? '') : ($T['intro_offer'] ?? $T['intro'])) ?></p>
  <?php if (!$signed && !empty($snap['valid_until']) && isset($T['valid'])): ?><p class="valid"><?= $e(strtr($T['valid'], ['{d}' => wf_doc_date($snap['valid_until'], $lang)])) ?></p><?php endif; ?>
  <?php if (!empty($C['name']) || !empty($C['company'])): ?>
  <div class="card"><label><?= $e($T['customer'] ?? 'Kunde') ?></label>
    <div class="cust"><?= $e(implode("\n", array_filter([$C['company'] ?? '', $C['name'] ?? '', str_replace(', ', "\n", (string)($C['address'] ?? '')), $C['phone'] ?? '', $C['email'] ?? '']))) ?></div></div>
  <?php endif; ?>
  <div class="card">
    <h2 style="margin-bottom:8px"><?= $e($snap['title']) ?></h2>
    <?php if ($snap['description']): ?><p style="white-space:pre-wrap;margin:0 0 10px"><?= $e($snap['description']) ?></p><?php endif; ?>
    <dl class="kv">
      <dt><?= $e($T['qty']) ?></dt><dd><?= (int)$snap['qty'] ?> <?= $e($T['pcs']) ?><?= $snap['article'] ? ' · ' . $e($snap['article']) : '' ?></dd>
      <?php if ($snap['processes']): ?><dt><?= $e($T['process']) ?></dt><dd><?= $e(implode(', ', array_map(fn($p) => $lang === 'da' ? $p['da'] : $p['de'], $snap['processes']))) ?></dd><?php endif; ?>
      <?php if ($snap['due_date']): ?><dt><?= $e($T['due']) ?></dt><dd><?= $e(wf_doc_date($snap['due_date'], $lang)) ?></dd><?php endif; ?>
      <?php if ($snap['price'] > 0): ?><dt><?= $e($T['price']) ?></dt><dd><b><?= $e($money($snap['price'], $snap['currency'])) ?></b> <?= $e($T['vat_' . $snap['vat']]) ?></dd><?php endif; ?>
      <?php if ($snap['deposit'] > 0): ?><dt><?= $e($T['deposit']) ?></dt><dd><?= $e($money($snap['deposit'], $snap['currency'])) ?></dd><?php endif; ?>
    </dl>
    <?php if ($snap['files']): ?><div style="margin-top:12px"><label><?= $e($T['files']) ?></label><div class="thumbs"><?php foreach ($snap['files'] as $fid): ?><img src="<?= $e($thumbSrc((int)$fid)) ?>" alt=""><?php endforeach; ?></div></div><?php endif; ?>
  </div>
  <?php if (!empty($snap['terms'])): ?>
  <div class="card terms"><label><?= $e($T['terms'] ?? '') ?></label><ol><?php foreach ($snap['terms'] as $tl): ?><li><?= $e($tl) ?></li><?php endforeach; ?></ol>
    <?php if (!empty($snap['consumer']) && isset($T['withdrawal'])): ?><div class="wdr"><?= $e($T['withdrawal']) ?></div><?php endif; ?>
  </div>
  <?php endif; ?>
  <?php if ($signed): ?>
  <div class="card done"><b><?= $e(strtr($T['done'], ['{d}' => wf_doc_date(substr($c['signed_at'], 0, 10), $lang), '{n}' => $c['signer_name']])) ?></b><br><img class="sigimg" src="data:image/png;base64,<?= $e($c['signature']) ?>" alt="">
    <div class="muted" style="font-size:.8rem;margin-top:6px"><?= $e(($T['signed_by'] ?? '') . ': ' . $c['signed_at'] . ' UTC') ?><?= $admin ? $e(' · IP ' . $c['sign_ip']) : '' ?></div></div>
  <div class="row noprint" style="justify-content:center"><button type="button" class="btn primary" id="prt"><?= $e($T['print'] ?? 'Print') ?></button></div>
  <?php elseif ($admin): ?>
  <div class="card noprint"><p class="muted" style="margin:0">⏳ <?= $e($c['revoked_at'] ? 'Link gesperrt' : 'Noch nicht unterschrieben' . ($c['viewed_at'] ? ' · vom Kunden geöffnet ' . $c['viewed_at'] . ' UTC' : '')) ?></p></div>
  <?php else: ?>
  <div class="card" id="form">
    <label for="nm"><?= $e($T['name']) ?></label>
    <input id="nm" type="text" maxlength="120" autocomplete="name" value="<?= $e($snap['customer']['name'] ?? '') ?>">
    <label style="margin-top:14px"><?= $e($T['sign']) ?></label>
    <canvas id="pad"></canvas>
    <div class="row end" style="margin-top:6px"><button type="button" class="btn small" id="clr"><?= $e($T['clear']) ?></button></div>
    <label class="acc"><input type="checkbox" id="acc"><span><?= $e($T['accept']) ?></span></label>
    <div class="err" id="err"></div>
    <button type="button" class="btn primary" id="go" style="width:100%"><?= $e($T['submit']) ?></button>
  </div>
  <?php endif; ?>
  <p class="small"><?= $e(implode(' · ', array_filter([$S['name'] ?? '', trim(($S['street'] ?? '') . ', ' . ($S['zip'] ?? '') . ' ' . ($S['city'] ?? ''), ', '), ($S['cvr'] ?? '') ? 'CVR ' . $S['cvr'] : '', $S['email'] ?? '', $S['phone'] ?? '']))) ?></p>
<?php endif; ?>
</main>
<?php if ($signed): ?>
<script nonce="<?= $e($nonce) ?>">document.getElementById('prt').onclick = () => print();</script>
<?php endif; ?>
<?php if ($snap && !$signed && !$admin): ?>
<script nonce="<?= $e($nonce) ?>">
(() => {
  const T = <?= json_encode(['need_name' => $T['need_name'], 'need_sig' => $T['need_sig'], 'need_accept' => $T['need_accept'], 'error' => $T['error']], JSON_UNESCAPED_UNICODE | JSON_HEX_TAG) ?>;
  const pad = document.getElementById('pad'), ctx = pad.getContext('2d'), err = document.getElementById('err');
  let drawn = false, down = false;
  const size = () => { const r = pad.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); pad.width = r.width * d; pad.height = r.height * d; ctx.scale(d, d); ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1b1622'; drawn = false; };
  size();
  const pos = (e) => { const r = pad.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  pad.addEventListener('pointerdown', (e) => { down = true; pad.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.moveTo(...pos(e)); });
  pad.addEventListener('pointermove', (e) => { if (!down) return; ctx.lineTo(...pos(e)); ctx.stroke(); drawn = true; });
  pad.addEventListener('pointerup', () => { down = false; });
  document.getElementById('clr').onclick = () => { ctx.clearRect(0, 0, pad.width, pad.height); drawn = false; };
  document.getElementById('go').onclick = async (ev) => {
    const name = document.getElementById('nm').value.trim();
    err.textContent = !name ? T.need_name : !drawn ? T.need_sig : !document.getElementById('acc').checked ? T.need_accept : '';
    if (err.textContent) return;
    ev.target.disabled = true;
    try {
      const r = await fetch(location.href, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, accept: true, signature: pad.toDataURL('image/png') }) });
      if (!r.ok) throw new Error();
      location.reload();
    } catch (e) { err.textContent = T.error; ev.target.disabled = false; }
  };
})();
</script>
<?php endif; ?>
</body>
</html>
