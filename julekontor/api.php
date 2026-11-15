<?php
/* Öffentliche Schnittstelle der Website (keine Anmeldung):
   ?a=site             Einstellungen, Kontakt, Öffnungszeiten, Kalender-Übersicht, Artikel für die Website
   ?a=door&day=5       Inhalt eines Türchens – nur wenn der Tag erreicht ist (oder mit Vorschau-Schlüssel)
   POST ?a=request     Anfrage / Reservierung speichern */
declare(strict_types=1);
define('JK_NO_SESSION', true);
require __DIR__ . '/admin/inc/bootstrap.php';
require __DIR__ . '/admin/inc/shop.php';
require __DIR__ . '/admin/inc/web.php';
header('Content-Type: application/json; charset=utf-8');
header('X-Robots-Tag: noindex');

function out(array $data, int $code = 200): never {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

try {
    $a = (string)($_GET['a'] ?? 'site');
    $site = web_site();
    $cal = $site['calendar'];
    $year = (int)$cal['year'];
    $pv = (string)($_GET['pv'] ?? '');
    $preview = $pv !== '' && preg_match('/^[0-9a-f]{24}$/', (string)$cal['preview']) && hash_equals((string)$cal['preview'], $pv);

    if ($a === 'site') {
        $doors = [];
        if ($cal['enabled']) {
            $rows = advent_doors();
            for ($d = 1; $d <= 24; $d++) $doors[] = ['day' => $d, 'open' => $preview || advent_open($d, $year), 'filled' => advent_door_filled($rows[$d] ?? null)];
        }
        $products = [];
        $q = db()->query("SELECT p.id, p.name, p.price, p.image, p.web_kit, p.web_text, p.open_price, p.track_stock, p.stock, c.name AS category
                          FROM products p LEFT JOIN categories c ON c.id = p.category_id
                          WHERE p.web = 1 AND p.active = 1 ORDER BY p.web_kit DESC, p.updated DESC LIMIT 60");
        foreach ($q as $r) {
            $products[] = [
                'id' => (int)$r['id'], 'name' => $r['name'], 'text' => $r['web_text'], 'category' => (string)$r['category'],
                'price' => $r['open_price'] ? null : (int)$r['price'], 'kit' => (bool)$r['web_kit'],
                'image' => $r['image'] !== '' ? 'data/produkte/' . rawurlencode($r['image']) : '',
                'soldOut' => $r['track_stock'] && (float)$r['stock'] <= 0,
            ];
        }
        $images = [];
        foreach ($site['images'] as $k => $f) if (is_string($f) && $f !== '' && is_file(WEB_IMG_DIR . '/' . $f)) $images[$k] = 'data/bilder/' . rawurlencode($f);
        $hours = $site['hours'];
        if (!$hours['published']) $hours['days'] = [];
        unset($hours['published']);
        out([
            'now' => date('c'),
            'countdown' => $site['countdownEnabled'] ? $site['countdownTarget'] : null,
            'snow' => (bool)$site['snow'], 'bell' => (bool)$site['bell'],
            'hero' => $site['hero'], 'notice' => $site['notice'],
            'contact' => $site['contact'], 'hours' => $hours,
            'calendar' => $cal['enabled'] ? ['year' => $year, 'doors' => $doors, 'preview' => $preview] : null,
            'currency' => setting('currency'),
            'requests' => (bool)$site['requests'],
            'products' => $products, 'images' => $images,
        ]);
    }

    if ($a === 'door') {
        $day = (int)($_GET['day'] ?? 0);
        if (!$cal['enabled'] || $day < 1 || $day > 24) out(['error' => 'unknown'], 404);
        if (!$preview && !advent_open($day, $year)) out(['error' => 'locked'], 403);
        $r = advent_doors()[$day] ?? null;
        $o = ['day' => $day, 'filled' => advent_door_filled($r), 'title' => [], 'text' => [], 'image' => '', 'link' => '', 'code' => ''];
        if ($r) {
            foreach (WEB_LANGS as $l => $_) { $o['title'][$l] = $r['title_' . $l]; $o['text'][$l] = $r['text_' . $l]; }
            $o['image'] = $r['image'] !== '' && is_file(WEB_IMG_DIR . '/' . $r['image']) ? 'data/bilder/' . rawurlencode($r['image']) : '';
            $o['link'] = $r['link']; $o['code'] = $r['code'];
        }
        out($o);
    }

    if ($a === 'request' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        if (!$site['requests']) out(['error' => 'off'], 403);
        $in = json_decode((string)file_get_contents('php://input'), true);
        if (!is_array($in)) out(['error' => 'bad'], 400);
        $s = fn(string $k, int $max) => mb_substr(trim((string)($in[$k] ?? '')), 0, $max);
        if ($s('website', 50) !== '') out(['ok' => true]);                       // Falle für Spam-Programme
        $name = $s('name', 80); $email = $s('email', 120); $phone = $s('phone', 40); $msg = $s('message', 2000);
        $kind = isset(WEB_REQUEST_KINDS[$s('kind', 20)]) ? $s('kind', 20) : 'frage';
        $lang = isset(WEB_LANGS[$s('lang', 2)]) ? $s('lang', 2) : 'da';
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
        if (!$pid && $msg === '') out(['error' => 'message'], 422);
        $ip = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '-') . '|jk-web');
        $st = db()->prepare("SELECT COUNT(*) FROM web_requests WHERE ip_hash = ? AND created > ?");
        $st->execute([$ip, date('Y-m-d H:i:s', time() - 3600)]);
        if ((int)$st->fetchColumn() >= 5) out(['error' => 'limit'], 429);
        db()->prepare('INSERT INTO web_requests (created, kind, product_id, product_name, name, email, phone, message, lang, ip_hash) VALUES (?,?,?,?,?,?,?,?,?,?)')
            ->execute([now(), $kind, $pid ?: null, $pname, $name, $email, $phone, $msg, $lang, $ip]);
        $to = (string)$site['contact']['email'];
        if (filter_var($to, FILTER_VALIDATE_EMAIL)) {
            $clean = fn(string $v) => trim(preg_replace('/[\r\n]+/', ' ', $v));
            $body = WEB_REQUEST_KINDS[$kind] . ($pname !== '' ? ': ' . $pname : '') . "\n\n"
                  . 'Name: ' . $name . "\nE-Mail: " . $email . "\nTelefon: " . $phone . "\nSprache: " . WEB_LANGS[$lang] . "\n\n" . $msg . "\n";
            $head = "Content-Type: text/plain; charset=utf-8\r\nFrom: Julekontor Website <" . $to . ">";
            if ($email !== '') $head .= "\r\nReply-To: " . $clean($email);
            @mail($to, '=?UTF-8?B?' . base64_encode('Julekontor: ' . WEB_REQUEST_KINDS[$kind] . ' von ' . $clean($name)) . '?=', $body, $head);
        }
        out(['ok' => true]);
    }

    out(['error' => 'unknown'], 404);
} catch (Throwable $e) {
    error_log('julekontor api: ' . $e->getMessage());
    out(['error' => 'server'], 500);
}
