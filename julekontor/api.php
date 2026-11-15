<?php
/* Öffentliche Schnittstelle der Website (keine Anmeldung). Vor dem Eröffnungstag gibt sie nichts heraus.
   ?a=door&day=5       Inhalt eines Türchens – nur wenn der Tag erreicht ist
   POST ?a=request     Frage / Reservierung speichern
   POST ?a=cart        Warenkorb prüfen und ausrechnen
   POST ?a=order       Bestellung anlegen
   ?a=pay&t=…          Kartenzahlung starten (leitet zu SumUp weiter)
   ?a=paid&t=…         Rückkehr von SumUp: Zahlung prüfen, weiter zur Bestellseite */
declare(strict_types=1);
define('JK_NO_SESSION', true);
require __DIR__ . '/admin/inc/bootstrap.php';
require __DIR__ . '/admin/inc/shop.php';
require __DIR__ . '/admin/inc/web.php';
header('X-Robots-Tag: noindex');

function out(array $data, int $code = 200): never {
    header('Content-Type: application/json; charset=utf-8');
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function body(): array {
    $in = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($in)) out(['error' => 'bad'], 400);
    return $in;
}

try {
    $a = (string)($_GET['a'] ?? '');
    $site = web_site();
    $preview = web_preview($site);
    if (!web_is_open($site) && !$preview) out(['error' => 'closed'], 403);
    $post = $_SERVER['REQUEST_METHOD'] === 'POST';
    $lang = fn(array $in) => isset(WEB_LANGS[(string)($in['lang'] ?? '')]) ? (string)$in['lang'] : 'da';

    if ($a === 'door') {
        $cal = $site['calendar'];
        $day = (int)($_GET['day'] ?? 0);
        if (!$cal['enabled'] || $day < 1 || $day > 24) out(['error' => 'unknown'], 404);
        if (!$preview && !advent_open($day, (int)$cal['year'])) out(['error' => 'locked'], 403);
        $r = advent_doors()[$day] ?? null;
        $o = ['day' => $day, 'filled' => advent_door_filled($r), 'title' => [], 'text' => [], 'image' => '', 'link' => '', 'code' => ''];
        if ($r) {
            foreach (WEB_LANGS as $l => $_) { $o['title'][$l] = $r['title_' . $l]; $o['text'][$l] = $r['text_' . $l]; }
            $o['image'] = $r['image'] !== '' && is_file(WEB_IMG_DIR . '/' . $r['image']) ? 'data/bilder/' . rawurlencode($r['image']) : '';
            $o['link'] = $r['link']; $o['code'] = $r['code'];
        }
        out($o);
    }

    if ($a === 'request' && $post) {
        if (!$site['requests']) out(['error' => 'off'], 403);
        $in = body();
        $s = fn(string $k, int $max) => mb_substr(trim((string)($in[$k] ?? '')), 0, $max);
        if ($s('website', 50) !== '') out(['ok' => true]);                       // Falle für Spam-Programme
        $name = $s('name', 80); $email = $s('email', 120); $phone = $s('phone', 40); $msg = $s('message', 2000);
        $kind = isset(WEB_REQUEST_KINDS[$s('kind', 20)]) ? $s('kind', 20) : 'frage';
        if ($name === '') out(['error' => 'name'], 422);
        if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) out(['error' => 'email'], 422);
        if ($email === '' && $phone === '') out(['error' => 'contact'], 422);
        $pid = (int)($in['product'] ?? 0); $pname = '';
        if ($pid) {
            $st = db()->prepare('SELECT name FROM products WHERE id = ? AND web = 1 AND active = 1');
            $st->execute([$pid]);
            $pname = (string)$st->fetchColumn();
            if ($pname === '') $pid = 0;
        }
        if ($msg === '') out(['error' => 'message'], 422);
        $ip = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '-') . '|jk-web');
        $st = db()->prepare('SELECT COUNT(*) FROM web_requests WHERE ip_hash = ? AND created > ?');
        $st->execute([$ip, date('Y-m-d H:i:s', time() - 3600)]);
        if ((int)$st->fetchColumn() >= 5) out(['error' => 'limit'], 429);
        db()->prepare('INSERT INTO web_requests (created, kind, product_id, product_name, name, email, phone, message, lang, ip_hash) VALUES (?,?,?,?,?,?,?,?,?,?)')
            ->execute([now(), $kind, $pid ?: null, $pname, $name, $email, $phone, $msg, $lang($in), $ip]);
        web_mail((string)$site['contact']['email'], 'Julekontor: ' . WEB_REQUEST_KINDS[$kind] . ' von ' . $name,
            WEB_REQUEST_KINDS[$kind] . ($pname !== '' ? ': ' . $pname : '') . "\n\nName: $name\nE-Mail: $email\nTelefon: $phone\nSprache: " . WEB_LANGS[$lang($in)] . "\n\n$msg\n", $email);
        out(['ok' => true]);
    }

    if ($a === 'cart' && $post) {
        $in = body();
        $c = web_cart(is_array($in['items'] ?? null) ? $in['items'] : [], (string)($in['delivery'] ?? 'pickup'), $lang($in));
        foreach ($c['lines'] as &$l) unset($l['raw_name'], $l['vat']);
        out($c + ['shop_on' => setting('web_shop_on') === '1']);
    }

    if ($a === 'order' && $post) {
        $in = body();
        if (trim((string)($in['website'] ?? '')) !== '') out(['error' => 'server'], 400);
        try {
            $o = web_order_create($in, $lang($in));
            $url = './?s=ordre&ny=1&t=' . $o['token'];
            if ($o['payment'] === 'card') {
                try { $url = web_card_start($o); } catch (Throwable $e) { error_log('julekontor sumup: ' . $e->getMessage()); }
            }
            out(['ok' => true, 'url' => $url]);
        } catch (ShopError $e) {
            out(['error' => $e->getMessage()], 422);
        }
    }

    if ($a === 'pay' || $a === 'paid') {
        $t = (string)($_GET['t'] ?? '');
        $o = preg_match('/^[0-9a-f]{32}$/', $t) ? web_order_get('token', $t) : null;
        if (!$o) { header('Location: ./?s=ordre'); exit; }
        $to = './?s=ordre&t=' . $o['token'] . ($a === 'paid' ? '&ny=1' : '');
        try {
            if ($a === 'paid') web_card_check($o);
            elseif (!$o['paid'] && $o['payment'] === 'card' && $o['status'] !== 'storniert' && web_card_ready()) $to = web_card_start($o);
        } catch (Throwable $e) { error_log('julekontor sumup: ' . $e->getMessage()); }
        header('Location: ' . $to);
        exit;
    }

    out(['error' => 'unknown'], 404);
} catch (Throwable $e) {
    error_log('julekontor api: ' . $e->getMessage());
    out(['error' => 'server'], 500);
}
