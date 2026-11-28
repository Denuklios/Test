<?php
/* Website: Inhalte (data/site.json), Bilder (data/bilder), Adventskalender und Anfragen.
   Wird vom Admin und von der öffentlichen Schnittstelle (api.php) benutzt. */
declare(strict_types=1);
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/versand.php';

const WEB_LANGS = ['da' => 'Dänisch', 'de' => 'Deutsch', 'en' => 'Englisch'];
const WEB_IMG_DIR = JK_DATA . '/bilder';
/* Bereiche im Sortiment: Schlüssel => Name im Admin. Die Texte dazu stehen in assets/js/i18n.js. */
const WEB_CATEGORIES = [
    'kranse'  => 'Adventskränze',
    'pynt'    => 'Dekoration',
    'traeer'  => 'Kleine Bäume',
    'braet'   => 'Gravierte Bretter',
    'mere'    => '… und vieles mehr',
];
const WEB_REQUEST_KINDS = ['frage' => 'Frage', 'reservierung' => 'Reservierung', 'bausatz' => 'Bausatz'];

/* Alle Website-Einstellungen mit Vorgaben. Fehlt etwas in site.json, gilt die Vorgabe. */
function web_site(): array {
    $s = read_json('site');
    $d = [
        'countdownEnabled' => true,
        'countdownTarget'  => '2027-11-14T10:00',            // Countdown auf der Startseite (Eröffnung des Ladens)
        'openAt'           => '2026-12-05T10:00',            // Website und Online-Shop öffnen
        'snow' => true, 'bell' => true,
        'hero' => ['da' => '', 'de' => '', 'en' => ''],        // eigener Satz unter dem Logo (leer = Standardtext)
        'notice' => ['da' => '', 'de' => '', 'en' => ''],      // Hinweisband ganz oben (leer = aus)
        'contact' => ['street' => '', 'city' => '6330 Padborg / Vilsbæk', 'phone' => '', 'email' => '',
                      'facebook' => '', 'instagram' => '', 'maps' => '', 'cvr' => '', 'owner' => ''],
        'hours' => ['published' => false, 'days' => [],
                    'note' => ['da' => '', 'de' => '', 'en' => '']],
        'calendar' => ['enabled' => true, 'year' => 2027],
        'launch' => 'auto',                                   // auto = mit Ablauf des Countdowns, open = sofort, closed = gesperrt
        'preview' => '',                                      // geheimer Schlüssel für die Vorschau
        'requests' => true,
        'images' => [],
    ];
    foreach ($d as $k => $v) {
        if (!array_key_exists($k, $s)) { $s[$k] = $v; continue; }
        if (is_array($v) && is_array($s[$k]) && !array_is_list($v)) $s[$k] += $v;
    }
    for ($i = 0; $i < 7; $i++) $s['hours']['days'][$i] = ($s['hours']['days'][$i] ?? []) + ['open' => '10:00', 'close' => '17:00', 'closed' => $i === 0];
    $s['hours']['days'] = array_slice($s['hours']['days'], 0, 7);
    return $s;
}
function web_save(array $site): void { write_json('site', $site); }

/* Drei Sprachfelder aus einem Formular lesen: name_da, name_de, name_en */
function web_post_langs(string $name, int $max): array {
    $o = [];
    foreach (WEB_LANGS as $l => $_) $o[$l] = mb_substr(trim((string)($_POST[$name . '_' . $l] ?? '')), 0, $max);
    return $o;
}
function web_url(string $u): string {
    $u = trim($u);
    if ($u === '') return '';
    if (!preg_match('~^https?://~i', $u)) $u = 'https://' . $u;
    return filter_var($u, FILTER_VALIDATE_URL) ? mb_substr($u, 0, 300) : '';
}

/* ---------- Bilder (data/bilder, öffentlich lesbar) ---------- */
/* Foto verkleinern (längste Seite höchstens $max) und als JPEG speichern. Gibt den Dateinamen zurück. */
function web_save_image(string $prefix, string $tmp, int $max = 1400): string {
    $info = @getimagesize($tmp);
    if (!$info || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP], true)) throw new ShopError('Bitte ein Foto als JPG, PNG oder WebP hochladen.');
    if ($info[0] * $info[1] > 50_000_000) throw new ShopError('Das Foto ist zu groß.');
    $src = match ($info[2]) {
        IMAGETYPE_JPEG => @imagecreatefromjpeg($tmp), IMAGETYPE_PNG => @imagecreatefrompng($tmp), default => @imagecreatefromwebp($tmp),
    };
    if (!$src) throw new ShopError('Das Foto konnte nicht gelesen werden.');
    if ($info[2] === IMAGETYPE_JPEG && function_exists('exif_read_data')) {
        $o = (int)(@exif_read_data($tmp)['Orientation'] ?? 1);
        $rot = [3 => 180, 6 => -90, 8 => 90][$o] ?? 0;
        if ($rot) $src = imagerotate($src, $rot, 0);
    }
    $w = imagesx($src); $h = imagesy($src);
    $f = min(1, $max / max($w, $h));
    $nw = max(1, (int)round($w * $f)); $nh = max(1, (int)round($h * $f));
    $dst = imagecreatetruecolor($nw, $nh);
    imagefill($dst, 0, 0, imagecolorallocate($dst, 255, 255, 255));
    imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
    if (!is_dir(WEB_IMG_DIR)) mkdir(WEB_IMG_DIR, 0755, true);
    $name = preg_replace('/[^a-z0-9]/', '', $prefix) . '-' . bin2hex(random_bytes(4)) . '.jpg';
    if (!imagejpeg($dst, WEB_IMG_DIR . '/' . $name, 84)) throw new ShopError('Das Foto konnte nicht gespeichert werden.');
    return $name;
}
function web_delete_image(string $file): void {
    if ($file !== '' && preg_match('/^[a-z0-9]+-[0-9a-f]{8}\.jpg$/', $file)) @unlink(WEB_IMG_DIR . '/' . $file);
}
/* Hochgeladene Datei aus $_FILES – null, wenn nichts gewählt wurde */
function web_upload(string $field): ?string {
    $f = $_FILES[$field] ?? null;
    if (!$f || ($f['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) return null;
    if ($f['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) throw new ShopError('Das Foto konnte nicht hochgeladen werden (zu groß?).');
    return $f['tmp_name'];
}

/* ---------- Adventskalender ---------- */
function advent_doors(): array {
    $rows = [];
    foreach (db()->query('SELECT * FROM advent_doors') as $r) $rows[(int)$r['day']] = $r;
    return $rows;
}
function advent_door_filled(?array $r): bool {
    if (!$r) return false;
    foreach (['title_da', 'title_de', 'title_en', 'text_da', 'text_de', 'text_en', 'image', 'code'] as $k) if (trim((string)$r[$k]) !== '') return true;
    return false;
}
/* Ein Türchen geht am jeweiligen Dezembertag um 0 Uhr (dänische Zeit) auf und bleibt bis zum 6. Januar offen. */
function advent_open(int $day, int $year, ?int $now = null): bool {
    $now ??= time();
    $from = mktime(0, 0, 0, 12, $day, $year);
    $until = mktime(0, 0, 0, 1, 7, $year + 1);
    return $now >= $from && $now < $until;
}
function web_preview_token(array &$site): string {
    if (!preg_match('/^[0-9a-f]{24}$/', (string)$site['preview'])) {
        $site['preview'] = bin2hex(random_bytes(12));
        web_save($site);
    }
    return $site['preview'];
}

/* ---------- Freischaltung: Vor dem Eröffnungstag ist nur die Countdown-Seite zu sehen ---------- */
function web_is_open(array $site): bool {
    if ($site['launch'] === 'open') return true;
    if ($site['launch'] === 'closed') return false;
    $t = strtotime((string)($site['openAt'] ?: $site['countdownTarget']));
    return !$t || time() >= $t;
}
/* Vorschau für den Admin: ?vorschau=<Schlüssel> setzt ein Cookie, danach ist alles sichtbar */
function web_preview(array $site): bool {
    $tok = (string)$site['preview'];
    if (!preg_match('/^[0-9a-f]{24}$/', $tok)) return false;
    $given = (string)($_GET['vorschau'] ?? '');
    if ($given !== '' && hash_equals($tok, $given)) {
        if (!headers_sent()) setcookie('jk_pv', $tok, ['expires' => time() + 86400 * 30, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax']);
        return true;
    }
    return hash_equals($tok, (string)($_COOKIE['jk_pv'] ?? ''));
}

/* ---------- Texte: Vorgaben aus site/lang.php, im Admin überschreibbar ---------- */
function web_lang_defaults(): array {
    static $d = null;
    return $d ??= require JK_ROOT . '/site/lang.php';
}
function web_text_overrides(): array {
    static $o = null;
    if ($o === null) { $o = []; foreach (db()->query('SELECT * FROM web_texts') as $r) $o[$r['key']] = $r; }
    return $o;
}
function web_t(string $key, string $lang, array $vars = []): string {
    $o = web_text_overrides()[$key][$lang] ?? '';
    $d = web_lang_defaults();
    $s = $o !== '' ? $o : ($d[$lang][$key] ?? $d['da'][$key] ?? $key);
    foreach ($vars as $k => $v) $s = str_replace('{' . $k . '}', (string)$v, $s);
    return $s;
}
/* Feld in der Sprache des Besuchers, sonst die erste ausgefüllte Sprache */
function web_pick(array $row, string $field, string $lang): string {
    if (trim((string)($row[$field . '_' . $lang] ?? '')) !== '') return (string)$row[$field . '_' . $lang];
    foreach (WEB_LANGS as $l => $_) if (trim((string)($row[$field . '_' . $l] ?? '')) !== '') return (string)$row[$field . '_' . $l];
    return '';
}

/* ---------- Online-Shop ---------- */
const WEB_DELIVERY = ['pickup' => 'Abholung im Laden', 'dk' => 'Versand Dänemark', 'de' => 'Versand Deutschland'];
const WEB_PAYMENTS = ['pickup' => 'Bezahlung bei Abholung', 'mobilepay' => 'MobilePay', 'bank' => 'Überweisung', 'card' => 'Karte (SumUp)'];
const WEB_ORDER_STATUS = ['neu' => 'Neu', 'bestaetigt' => 'Bestätigt', 'versendet' => 'Versendet', 'abgeholt' => 'Abgeholt', 'storniert' => 'Storniert'];

function web_card_ready(): bool { return setting('web_pay_card') === '1' && setting('sumup_api_key') !== '' && setting('sumup_merchant') !== ''; }
/* Welche Zahlungsarten gibt es für diese Lieferart? */
function web_payments(string $delivery): array {
    $p = [];
    if ($delivery === 'pickup' && setting('web_pay_pickup') === '1') $p[] = 'pickup';
    if (web_card_ready()) $p[] = 'card';
    if (setting('web_pay_mobilepay') === '1' && setting('mobilepay_number') !== '') $p[] = 'mobilepay';
    if (setting('web_pay_bank') === '1' && trim(setting('web_bank_text')) !== '') $p[] = 'bank';
    return $p;
}
function web_product_rows(string $where = '', array $args = []): array {
    $st = db()->prepare("SELECT p.*, c.name AS category FROM products p LEFT JOIN categories c ON c.id = p.category_id
                         WHERE p.web = 1 AND p.active = 1 $where ORDER BY p.web_kit DESC, p.updated DESC");
    $st->execute($args);
    return $st->fetchAll();
}
/* Artikel so aufbereiten, wie ihn die Website braucht */
function web_product(array $r, string $lang): array {
    $max = $r['track_stock'] ? max(0, (int)floor((float)$r['stock'])) : 99;
    return [
        'id' => (int)$r['id'], 'name' => web_pick($r, 'web_name', $lang) ?: $r['name'],
        'desc' => web_pick($r, 'web_desc', $lang) ?: (string)$r['web_text'],
        'category' => (string)$r['category'], 'category_id' => (int)$r['category_id'],
        'price' => $r['open_price'] ? null : (int)$r['price'], 'kit' => (bool)$r['web_kit'], 'ship' => (bool)$r['web_ship'],
        'image' => $r['image'] !== '' ? 'data/produkte/' . rawurlencode($r['image']) : '',
        'max' => min(99, $max), 'buyable' => !$r['open_price'] && $max > 0 && setting('web_shop_on') === '1',
    ];
}
function web_eur(int $ore): string {
    $rate = (float)str_replace(',', '.', setting('web_eur_rate'));
    return $rate > 0 ? number_format($ore / 100 / $rate, 2, ',', '.') . ' €' : '';
}
/* Warenkorb prüfen und ausrechnen. $items = [artikel-id => menge], $method = gewählte Versandart (z. B. "gls-shop") */
function web_cart(array $items, string $delivery, string $lang, string $method = ''): array {
    $lines = []; $subtotal = 0; $vat = 0; $pickupOnly = false; $changed = false;
    foreach (array_slice($items, 0, 60, true) as $id => $qty) {
        $rows = web_product_rows('AND p.id = ?', [(int)$id]);
        if (!$rows) { $changed = true; continue; }
        $r = $rows[0];
        $p = web_product($r, $lang);
        if (!$p['buyable']) { $changed = true; continue; }
        $q = max(1, min((int)$qty, $p['max']));
        if ($q !== (int)$qty) $changed = true;
        $total = $p['price'] * $q;
        if (!$p['ship']) $pickupOnly = true;
        $lines[] = ['id' => $p['id'], 'name' => $p['name'], 'raw_name' => $r['name'], 'image' => $p['image'], 'qty' => $q, 'max' => $p['max'],
                    'price' => $p['price'], 'total' => $total, 'ship' => $p['ship'], 'vat' => (int)$r['vat'],
                    'weight' => (float)$r['weight'], 'l' => (float)$r['size_l'], 'w' => (float)$r['size_w'], 'h' => (float)$r['size_h']];
        $subtotal += $total; $vat += vat_of($total, (int)$r['vat']);
    }
    $parcels = $lines && !$pickupOnly ? ship_pack(ship_units($lines)) : [];
    $byCountry = [];
    foreach (['dk', 'de'] as $c) $byCountry[$c] = $parcels ? ship_methods($c, $parcels, $subtotal) : [];
    if (!isset(WEB_DELIVERY[$delivery]) || ($pickupOnly && $delivery !== 'pickup') || ($delivery !== 'pickup' && !$byCountry[$delivery])) $delivery = 'pickup';
    $methods = $delivery === 'pickup' ? [] : $byCountry[$delivery];
    $sel = null;
    foreach ($methods as $m) if ($m['id'] === $method) $sel = $m;
    if (!$sel && $methods) $sel = $methods[0];
    $ship = $sel ? (int)$sel['price'] : 0;
    $vat += vat_of($ship, vat_rates()[0]);
    $cheap = fn(string $c) => $byCountry[$c] ? min(array_column($byCountry[$c], 'price')) : null;
    return ['lines' => $lines, 'subtotal' => $subtotal, 'shipping' => $ship, 'total' => $subtotal + $ship, 'vat' => $vat,
            'delivery' => $delivery, 'pickup_only' => $pickupOnly, 'changed' => $changed, 'payments' => web_payments($delivery),
            'methods' => $methods, 'method' => $sel ? $sel['id'] : '', 'parcels' => $parcels,
            'weight' => array_sum(array_column($parcels, 'g')),
            'ship_dk' => $cheap('dk'), 'ship_de' => $cheap('de'), 'free_from' => (int)setting('web_ship_free')];
}
/* Versandart als Text, z. B. "GLS – Paketshop" */
function web_method_label(array $cart): string {
    foreach ($cart['methods'] as $m) if ($m['id'] === $cart['method']) return $m['label'] !== '' ? $m['label'] . ' – ' . (SHIP_SERVICES[$m['service']] ?? $m['service']) : 'Standardversand';
    return '';
}
function web_order_no(array $o): string { return 'W-' . $o['number']; }
function web_order_get(string $by, $val): ?array {
    if (!in_array($by, ['id', 'token'], true)) return null;
    $st = db()->prepare("SELECT * FROM web_orders WHERE $by = ?");
    $st->execute([$val]);
    $o = $st->fetch();
    if (!$o) return null;
    $st = db()->prepare('SELECT * FROM web_order_items WHERE order_id = ? ORDER BY id');
    $st->execute([$o['id']]);
    $o['items'] = $st->fetchAll();
    return $o;
}
/* Bestellung anlegen. Wirft ShopError mit einem Schlüssel (z. B. "name"), den die Website übersetzt. */
function web_order_create(array $in, string $lang): array {
    if (setting('web_shop_on') !== '1') throw new ShopError('off');
    $s = fn(string $k, int $max) => mb_substr(trim((string)($in[$k] ?? '')), 0, $max);
    $items = is_array($in['items'] ?? null) ? $in['items'] : [];
    $cart = web_cart($items, $s('delivery', 10), $lang, $s('method', 30));
    if (!$cart['lines']) throw new ShopError('empty');
    if ($cart['changed']) throw new ShopError('changed');
    if ($cart['delivery'] !== $s('delivery', 10)) throw new ShopError('delivery');
    if ($cart['delivery'] !== 'pickup' && $cart['method'] !== $s('method', 30)) throw new ShopError('changed');
    $pay = $s('payment', 12);
    if (!in_array($pay, $cart['payments'], true)) throw new ShopError('payment');
    $name = $s('name', 80); $email = strtolower($s('email', 120));
    if ($name === '') throw new ShopError('name');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) throw new ShopError('email');
    $street = $s('street', 120); $zip = $s('zip', 12); $city = $s('city', 80);
    if ($cart['delivery'] !== 'pickup' && ($street === '' || $zip === '' || $city === '')) throw new ShopError('address');
    if (empty($in['terms'])) throw new ShopError('terms');
    $ip = hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '-') . '|jk-web');
    $st = db()->prepare('SELECT COUNT(*) FROM web_orders WHERE ip_hash = ? AND created > ?');
    $st->execute([$ip, date('Y-m-d H:i:s', time() - 3600)]);
    if ((int)$st->fetchColumn() >= 6) throw new ShopError('limit');

    $db = db();
    $db->beginTransaction();
    try {
        $no = max(1000, (int)$db->query('SELECT COALESCE(MAX(number), 1000) FROM web_orders')->fetchColumn()) + 1;
        $token = bin2hex(random_bytes(16));
        $db->prepare('INSERT INTO web_orders (number, token, created, delivery, payment, name, email, phone, street, zip, city, country, note, lang, subtotal, shipping, total, vat_total, ip_hash, ship_method, ship_info, parcel_shop)
                      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
           ->execute([$no, $token, now(), $cart['delivery'], $pay, $name, $email, $s('phone', 40), $street, $zip, $city,
                      $cart['delivery'] === 'de' ? 'Deutschland' : ($cart['delivery'] === 'dk' ? 'Danmark' : ''), $s('note', 1000), $lang,
                      $cart['subtotal'], $cart['shipping'], $cart['total'], $cart['vat'], $ip,
                      web_method_label($cart), $cart['delivery'] === 'pickup' ? '' : json_encode($cart['parcels'], JSON_UNESCAPED_UNICODE), $cart['delivery'] === 'pickup' ? '' : $s('parcel_shop', 160)]);
        $oid = (int)$db->lastInsertId();
        $ins = $db->prepare('INSERT INTO web_order_items (order_id, product_id, name, qty, unit_price, total, vat) VALUES (?,?,?,?,?,?,?)');
        $chk = $db->prepare('SELECT stock, track_stock FROM products WHERE id = ?');
        foreach ($cart['lines'] as $l) {
            $chk->execute([$l['id']]);
            $p = $chk->fetch();
            if ($p['track_stock'] && (float)$p['stock'] < $l['qty']) throw new ShopError('changed');
            $ins->execute([$oid, $l['id'], $l['raw_name'], $l['qty'], $l['price'], $l['total'], $l['vat']]);
            if ($p['track_stock']) stock_move($l['id'], -$l['qty'], 'web', 'Website', 'W-' . $no);     // Ware ist damit reserviert
        }
        $db->commit();
    } catch (Throwable $e) { $db->rollBack(); throw $e; }
    $o = web_order_get('id', $oid);
    web_order_mail($o, true);
    return $o;
}
/* Stornieren bucht die reservierte Ware zurück ins Lager */
function web_order_cancel(array $o, string $user): void {
    if ($o['status'] === 'storniert') return;
    $db = db();
    $chk = $db->prepare('SELECT track_stock FROM products WHERE id = ?');
    foreach ($o['items'] as $it) {
        if (!$it['product_id']) continue;
        $chk->execute([$it['product_id']]);
        if ($chk->fetchColumn()) stock_move((int)$it['product_id'], (float)$it['qty'], 'web_cancel', $user, web_order_no($o));
    }
    $db->prepare("UPDATE web_orders SET status = 'storniert' WHERE id = ?")->execute([$o['id']]);
}
function web_order_paid(array $o, string $ref = ''): void {
    if ($o['paid']) return;
    db()->prepare('UPDATE web_orders SET paid = 1, paid_at = ?, pay_ref = ? WHERE id = ?')->execute([now(), mb_substr($ref, 0, 80), $o['id']]);
}
function web_base_url(): string {
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $dir = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME']));
    if (basename($dir) === 'admin') $dir = dirname($dir);
    return $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost') . rtrim($dir, '/') . '/';
}
function web_order_url(array $o): string { return web_base_url() . '?s=ordre&t=' . $o['token']; }
function web_mail(string $to, string $subject, string $body, string $replyTo = ''): void {
    $from = (string)web_site()['contact']['email'];
    if (!filter_var($to, FILTER_VALIDATE_EMAIL) || !filter_var($from, FILTER_VALIDATE_EMAIL)) return;
    $head = "Content-Type: text/plain; charset=utf-8\r\nFrom: Julekontor <" . $from . ">";
    if (filter_var($replyTo, FILTER_VALIDATE_EMAIL)) $head .= "\r\nReply-To: " . $replyTo;
    @mail($to, '=?UTF-8?B?' . base64_encode(trim(preg_replace('/[\r\n]+/', ' ', $subject))) . '?=', $body, $head);
}
/* Wie bezahlt wird – als Text für Bestellseite und E-Mail */
function web_pay_text(array $o, string $lang): string {
    if ($o['paid']) return web_t('order.paid', $lang);
    return match ($o['payment']) {
        'mobilepay' => web_t('order.pay.mobilepay', $lang, ['number' => setting('mobilepay_number'), 'no' => web_order_no($o), 'total' => money((int)$o['total'])]),
        'bank' => web_t('order.pay.bank', $lang, ['no' => web_order_no($o), 'total' => money((int)$o['total'])]) . "\n" . setting('web_bank_text'),
        'card' => web_t('order.pay.card', $lang),
        default => web_t('order.pay.pickup', $lang),
    };
}
/* Packliste: welche Kartons, wie schwer */
function web_parcels_text(array $o): string {
    $p = json_decode((string)($o['ship_info'] ?? ''), true);
    if (!is_array($p) || !$p) return '';
    $t = ''; foreach ($p as $i => $x) $t .= 'Paket ' . ($i + 1) . ': ' . $x['box'] . ', ' . number_format($x['g'] / 1000, 2, ',', '.') . ' kg, ' . $x['n'] . ' Stück' . "\n";
    return $t . ($o['parcel_shop'] !== '' ? 'Wunsch-Paketshop: ' . $o['parcel_shop'] . "\n" : '');
}
function web_order_mail(array $o, bool $toShop): void {
    $l = isset(WEB_LANGS[$o['lang']]) ? $o['lang'] : 'da';
    $lines = '';
    foreach ($o['items'] as $it) $lines .= $it['qty'] . ' x ' . $it['name'] . '  ' . money((int)$it['total']) . "\n";
    $sum = $lines . ($o['shipping'] ? web_t('cart.shipping', $l) . '  ' . money((int)$o['shipping']) . "\n" : '') . web_t('cart.total', $l) . '  ' . money((int)$o['total']) . "\n";
    $body = web_t('mail.hello', $l, ['name' => $o['name']]) . "\n\n" . web_t('mail.thanks', $l, ['no' => web_order_no($o)]) . "\n\n" . $sum . "\n"
          . web_t('checkout.d.' . $o['delivery'], $l) . ($o['ship_method'] !== '' ? ' (' . $o['ship_method'] . ')' : '') . ($o['parcel_shop'] !== '' ? "\n" . web_t('checkout.parcelshop', $l) . ': ' . $o['parcel_shop'] : '') . "\n" . web_pay_text($o, $l) . "\n\n" . web_t('mail.link', $l) . "\n" . web_order_url($o) . "\n\n" . web_t('mail.bye', $l) . "\nJulekontor\n";
    web_mail($o['email'], web_t('mail.subject', $l, ['no' => web_order_no($o)]), $body);
    if ($toShop) {
        $adr = $o['delivery'] === 'pickup' ? '' : $o['street'] . "\n" . $o['zip'] . ' ' . $o['city'] . "\n" . $o['country'] . "\n";
        web_mail((string)web_site()['contact']['email'], 'Neue Bestellung ' . web_order_no($o) . ' – ' . $o['name'],
            'Neue Bestellung ' . web_order_no($o) . "\n\n" . $sum . "\n" . WEB_DELIVERY[$o['delivery']] . ($o['ship_method'] !== '' ? ' (' . $o['ship_method'] . ')' : '') . ' · ' . WEB_PAYMENTS[$o['payment']] . "\n" . web_parcels_text($o) . "\n"
            . $o['name'] . "\n" . $o['email'] . "\n" . $o['phone'] . "\n" . $adr . ($o['note'] !== '' ? "\nHinweis: " . $o['note'] . "\n" : '') . "\n" . web_base_url() . 'admin/?p=bestellungen&id=' . $o['id'] . "\n", $o['email']);
    }
}
/* Kartenzahlung: SumUp-Bezahlseite anlegen. Gibt die Adresse zurück, zu der der Kunde geschickt wird. */
function web_card_start(array $o): string {
    require_once __DIR__ . '/sumup.php';
    [$code, $r] = sumup_call('POST', '/v0.1/checkouts', [
        'checkout_reference' => web_order_no($o) . '-' . substr($o['token'], 0, 8), 'amount' => round($o['total'] / 100, 2), 'currency' => setting('currency'),
        'merchant_code' => setting('sumup_merchant'), 'description' => 'Julekontor ' . web_order_no($o),
        'redirect_url' => web_base_url() . 'api.php?a=paid&t=' . $o['token'], 'hosted_checkout' => ['enabled' => true],
    ]);
    $url = (string)($r['hosted_checkout_url'] ?? '');
    if ($code >= 300 || $url === '' || empty($r['id'])) throw new ShopError('card');
    db()->prepare('UPDATE web_orders SET pay_ref = ? WHERE id = ?')->execute(['sumup:' . $r['id'], $o['id']]);
    return $url;
}
/* Nach der Rückkehr von SumUp nachfragen, ob wirklich bezahlt wurde */
function web_card_check(array $o): bool {
    if ($o['paid']) return true;
    if (!str_starts_with((string)$o['pay_ref'], 'sumup:')) return false;
    require_once __DIR__ . '/sumup.php';
    [$code, $r] = sumup_call('GET', '/v0.1/checkouts/' . rawurlencode(substr($o['pay_ref'], 6)));
    if ($code < 300 && ($r['status'] ?? '') === 'PAID' && abs((float)($r['amount'] ?? 0) * 100 - (int)$o['total']) < 1) {
        web_order_paid($o, (string)$o['pay_ref']);
        return true;
    }
    return false;
}

/* ---------- Formular-Helfer für den Admin ---------- */
/* Drei Eingabefelder nebeneinander: Dänisch, Deutsch, Englisch */
function web_lang_fields(string $name, string $label, array $values, bool $area = false, int $max = 200, string $hint = ''): void {
    echo '<div class="langs"><div class="langs-label">' . h($label) . '</div><div class="langs-row">';
    foreach (WEB_LANGS as $l => $ln) {
        $v = h((string)($values[$l] ?? ''));
        $id = h($name . '_' . $l);
        echo '<label><span class="lang-tag">' . h($ln) . '</span>';
        echo $area ? '<textarea name="' . $id . '" maxlength="' . $max . '" rows="4">' . $v . '</textarea>'
                   : '<input name="' . $id . '" maxlength="' . $max . '" value="' . $v . '">';
        echo '</label>';
    }
    echo '</div>' . ($hint !== '' ? '<p class="hint">' . h($hint) . '</p>' : '') . '</div>';
}

/* ---------- Allgemeine Verwaltungsseite für Neuigkeiten, Termine, Galerie, Fragen ----------
   $c = ['module', 'table', 'title', 'one' (Einzahl), 'fields' => [name => [typ, beschriftung, …]], 'order', 'list' => fn($row) Text für die Liste]
   Feldtypen: langs (Zeile in 3 Sprachen), area (Text in 3 Sprachen), date, time, text, number, check, image */
function web_crud(array $c): void {
    $db = db(); $mod = $c['module']; $tbl = $c['table'];
    $id = (int)($_GET['id'] ?? 0); $new = isset($_GET['new']);
    $row = null;
    if ($id) { $st = $db->prepare("SELECT * FROM $tbl WHERE id = ?"); $st->execute([$id]); $row = $st->fetch() ?: null; if (!$row) redirect($mod); }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        csrf_check();
        if ($row && !empty($_POST['delete'])) {
            $db->prepare("DELETE FROM $tbl WHERE id = ?")->execute([$id]);
            if (isset($row['image'])) web_delete_image((string)$row['image']);
            flash($c['one'] . ' gelöscht.');
            redirect($mod);
        }
        $vals = []; $oldImg = (string)($row['image'] ?? ''); $img = $oldImg;
        foreach ($c['fields'] as $name => $f) {
            switch ($f[0]) {
                case 'langs': case 'area':
                    foreach (web_post_langs($name, $f[0] === 'area' ? 6000 : 160) as $l => $v) $vals[$name . '_' . $l] = $v;
                    break;
                case 'date':
                    $d = (string)($_POST[$name] ?? '');
                    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) { flash('Bitte ein Datum wählen.', 'err'); redirect($mod . ($id ? '&id=' . $id : '&new=1')); }
                    $vals[$name] = $d; break;
                case 'time': $t = (string)($_POST[$name] ?? ''); $vals[$name] = preg_match('/^\d{2}:\d{2}$/', $t) ? $t : ''; break;
                case 'number': $vals[$name] = (int)($_POST[$name] ?? 0); break;
                case 'check': $vals[$name] = empty($_POST[$name]) ? 0 : 1; break;
                case 'image':
                    if ($tmp = web_upload($name)) $img = web_save_image(substr($mod, 0, 4) . 'b', $tmp);
                    elseif (!empty($_POST['remove_' . $name])) $img = '';
                    $vals[$name] = $img; break;
                default: $vals[$name] = mb_substr(trim((string)($_POST[$name] ?? '')), 0, 200);
            }
        }
        if (!empty($c['need_image']) && $img === '') { flash('Bitte ein Foto auswählen.', 'err'); redirect($mod . '&new=1'); }
        if ($row) {
            $db->prepare("UPDATE $tbl SET " . implode(', ', array_map(fn($k) => "$k = ?", array_keys($vals))) . ' WHERE id = ?')->execute([...array_values($vals), $id]);
        } else {
            $db->prepare("INSERT INTO $tbl (" . implode(', ', array_keys($vals)) . ') VALUES (' . implode(',', array_fill(0, count($vals), '?')) . ')')->execute(array_values($vals));
        }
        if ($img !== $oldImg) web_delete_image($oldImg);
        flash($c['one'] . ' gespeichert.');
        redirect($mod);
    }

    if ($row || $new) {
        page_start($mod, $row ? $c['one'] . ' bearbeiten' : $c['one'] . ' anlegen');
        echo '<p><a href="./?p=' . h($mod) . '">← Zurück zur Liste</a></p>';
        echo '<form method="post" enctype="multipart/form-data" class="card form">' . csrf_field() . '<fieldset>';
        foreach ($c['fields'] as $name => $f) {
            $label = $f[1]; $v = $row[$name] ?? ($f[2] ?? '');
            switch ($f[0]) {
                case 'langs': case 'area':
                    web_lang_fields($name, $label, ['da' => $row[$name . '_da'] ?? '', 'de' => $row[$name . '_de'] ?? '', 'en' => $row[$name . '_en'] ?? ''], $f[0] === 'area', $f[0] === 'area' ? 6000 : 160, $f[2] ?? '');
                    break;
                case 'date': echo '<label>' . h($label) . '<input type="date" name="' . h($name) . '" required value="' . h((string)($v ?: date('Y-m-d'))) . '" style="max-width:220px"></label>'; break;
                case 'time': echo '<label>' . h($label) . '<input type="time" name="' . h($name) . '" value="' . h((string)$v) . '" style="max-width:160px"></label>'; break;
                case 'number': echo '<label>' . h($label) . '<input type="number" name="' . h($name) . '" value="' . (int)$v . '" style="max-width:160px"></label>'; break;
                case 'check': echo '<label class="check"><input type="checkbox" name="' . h($name) . '" value="1" ' . (($row ? $v : 1) ? 'checked' : '') . '> ' . h($label) . '</label>'; break;
                case 'image':
                    echo '<div class="langs"><div class="langs-label">' . h($label) . '</div>';
                    if ($row && $v !== '') echo '<img src="../data/bilder/' . h(rawurlencode((string)$v)) . '" alt="" style="max-width:260px;border-radius:10px;border:1px solid var(--line)">'
                        . (empty($c['need_image']) ? '<label class="check"><input type="checkbox" name="remove_' . h($name) . '" value="1"> Bild entfernen</label>' : '');
                    echo '<input type="file" name="' . h($name) . '" accept="image/jpeg,image/png,image/webp"></div>'; break;
                default: echo '<label>' . h($label) . '<input name="' . h($name) . '" maxlength="200" value="' . h((string)$v) . '"></label>';
            }
        }
        echo '</fieldset><div class="actions"><button class="btn" type="submit">Speichern</button>';
        if ($row) echo '<button class="btn ghost" type="submit" name="delete" value="1" formnovalidate onclick="return confirm(\'Wirklich löschen?\')">Löschen</button>';
        echo '</div></form>';
        page_end();
        return;
    }

    page_start($mod, $c['title']);
    if (!empty($c['intro'])) echo '<p class="muted">' . h($c['intro']) . '</p>';
    echo '<p><a class="btn" href="./?p=' . h($mod) . '&new=1">+ ' . h($c['one']) . ' anlegen</a></p>';
    $rows = $db->query("SELECT * FROM $tbl ORDER BY " . $c['order'] . ' LIMIT 500')->fetchAll();
    if (!$rows) { echo '<div class="card empty"><p class="muted">Noch nichts angelegt.</p></div>'; page_end(); return; }
    echo '<div class="table-wrap"><table class="list"><tbody>';
    foreach ($rows as $r) {
        $img = !empty($r['image']) ? '<img src="../data/bilder/' . h(rawurlencode($r['image'])) . '" alt="" loading="lazy" style="width:56px;height:42px;object-fit:cover;border-radius:6px;vertical-align:middle;margin-right:10px">' : '';
        echo '<tr class="click" onclick="location.href=\'./?p=' . h($mod) . '&id=' . (int)$r['id'] . '\'"><td>' . $img . '<a href="./?p=' . h($mod) . '&id=' . (int)$r['id'] . '" style="font-weight:600;text-decoration:none">'
           . h(web_pick($r, 'title', 'de') ?: '(ohne Titel)') . '</a></td><td class="muted">' . ($c['list'])($r) . '</td></tr>';
    }
    echo '</tbody></table></div>';
    page_end();
}
