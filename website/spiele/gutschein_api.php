<?php
/**
 * Wunsch-Fabrik.dk – Gutscheine aus den Spielen
 *
 * Der Code entsteht AUSSCHLIESSLICH hier auf dem Server. Das Spiel meldet nur,
 * was erreicht wurde – es kennt und erzeugt keine Codes. Damit bringt es
 * nichts, im Browser herumzumanipulieren.
 *
 * Öffentlich:  claim  (Gutschein anfordern), check (Code prüfen)
 * Admin:       list, redeem (einlösen), void (sperren)
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
// Sitzung nur fortsetzen, wenn schon eine besteht (Admin angemeldet) – Besucher bekommen kein Cookie
if (isset($_COOKIE[session_name()])) {
    session_start();
}
/* db.php finden – egal ob dieses Verzeichnis das Web-Root ist
   oder die Spiele in einem Unterordner wie /spiele/ liegen. */
$wf_db = null;
foreach ([__DIR__ . '/db.php', dirname(__DIR__) . '/db.php',
          dirname(__DIR__, 2) . '/db.php'] as $wf_try) {
    if (is_readable($wf_try)) { $wf_db = $wf_try; break; }
}
if (!$wf_db) {
    echo json_encode([
        'ok'    => false,
        'error' => 'db_php_not_found',
        'hint'  => 'db.php wurde weder in ' . __DIR__ . ' noch eine Ebene darüber gefunden.',
    ]);
    exit;
}
require_once $wf_db;

/* ═══════════════ EINSTELLUNGEN ═══════════════
   Hier legst du fest, was wofür vergeben wird.  */
$WF_REWARDS = [
    // Schlüssel => Prozent, Spiel, Bedingung, Mindest-Spielzeit (Sekunden) und Text für die Mail.
    // Die Schwellen sind so gewählt, dass nicht jeder sofort einen Gutschein bekommt
    // (per Simulation verschiedener Spielertypen geprüft, siehe LIESMICH.md).
    'nadel_5'      => ['pct' => 5,  'game' => 'nadel', 'need' => 30000, 'lvl' => 5, 'min_sec' => 90,
                       'text' => '30.000 Punkte bei Nadel & Faden'],
    'nadel_ziehung'=> ['pct' => 10, 'game' => 'nadel', 'need' => 60000, 'lvl' => 7, 'min_sec' => 150,
                       'text' => 'die Nadel-Ziehung bei Nadel & Faden'],
    'chaos_5'      => ['pct' => 5,  'game' => 'chaos', 'need' => 40000, 'lvl' => 8, 'min_sec' => 90,
                       'text' => '40.000 Punkte im Auftrags-Chaos'],
    'chaos_ziehung'=> ['pct' => 10, 'game' => 'chaos', 'need' => 80000, 'lvl' => 10, 'min_sec' => 120,
                       'text' => 'die Ziehung im Auftrags-Chaos'],
    'spuli_5'      => ['pct' => 5,  'game' => 'spuli', 'need' => 0, 'lvl' => 6, 'min_sec' => 30,
                       'text' => 'alle sechs Hallen bei Spuli auf Abwegen'],
    'spuli_ziehung'=> ['pct' => 10, 'game' => 'spuli', 'need' => 0, 'lvl' => 6, 'garn' => true, 'min_sec' => 30,
                       'text' => 'die Ziehung bei Spuli auf Abwegen (alles Garn gesammelt)'],
    'faden_5'      => ['pct' => 5,  'game' => 'faden', 'need' => 0, 'faden_best' => 16, 'min_sec' => 20,
                       'text' => 'alle 24 Fadenbilder bei Fadenlauf, davon 16 mit Bestlösung'],
    'faden_ziehung'=> ['pct' => 10, 'game' => 'faden', 'need' => 0, 'faden_best' => 24, 'min_sec' => 20, 'draws_per_day' => 1,
                       'text' => 'die Ziehung bei Fadenlauf (alle 24 mit Bestlösung)'],
    'tycoon_mrd'   => ['pct' => 5,  'game' => 'tycoon', 'need' => 1e9, 'min_sec' => 60,
                       'text' => '1 Mrd. kr Umsatz im Veredelungs-Tycoon'],
];


$WF_VOUCHER = [
    'gueltig_tage'   => 30,     // Laufzeit
    'min_bestellung' => 300,    // Mindestbestellwert in kr
    'pro_mail_tage'  => 30,     // Sperrfrist je E-Mail-Adresse
    'pro_ip_tag'     => 3,      // max. Anforderungen je IP und Tag
    'loeschen_tage'  => 7,      // eingelöste/abgelaufene Gutscheine nach x Tagen löschen
    'admin_mail'     => 'hej@wunsch-fabrik.dk',  // Benachrichtigung über neue Gutscheine
    'admin_info'     => true,   // auf false setzen, wenn du keine Info-Mail willst
];

$mysqli = wf_db_connect();
if (!$mysqli) { echo json_encode(['ok' => false, 'error' => 'db_connect_failed']); exit; }

function wf_ensure_voucher_table($mysqli) {
    $mysqli->query("
        CREATE TABLE IF NOT EXISTS game_vouchers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            created_at DATETIME NOT NULL,
            expires_at DATETIME NOT NULL,
            code VARCHAR(20) NOT NULL UNIQUE,
            percent TINYINT NOT NULL,
            min_order INT NOT NULL DEFAULT 0,
            name VARCHAR(60) NOT NULL,
            email VARCHAR(120) NOT NULL,
            lang VARCHAR(4) NOT NULL DEFAULT 'de',
            reward_key VARCHAR(40) NOT NULL,
            reason VARCHAR(120) NOT NULL,
            proof VARCHAR(60) DEFAULT NULL,
            ip VARCHAR(45) DEFAULT NULL,
            status ENUM('open','redeemed','void','expired') NOT NULL DEFAULT 'open',
            redeemed_at DATETIME DEFAULT NULL,
            redeemed_note VARCHAR(160) DEFAULT NULL,
            INDEX idx_email (email),
            INDEX idx_status (status),
            INDEX idx_code (code)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
}
wf_ensure_voucher_table($mysqli);

/* Ziehungen: Der Server legt VOR der Wahl fest, welche Karte gewinnt.
   Das Spiel erfährt es erst nach dem Aufdecken. */
function wf_ensure_draw_table($mysqli) {
    $mysqli->query("
        CREATE TABLE IF NOT EXISTS game_draws (
            id INT AUTO_INCREMENT PRIMARY KEY,
            created_at DATETIME NOT NULL,
            ticket VARCHAR(40) NOT NULL UNIQUE,
            reward_key VARCHAR(40) NOT NULL,
            win_card TINYINT NOT NULL,
            picked TINYINT DEFAULT NULL,
            won TINYINT(1) DEFAULT NULL,
            claimed TINYINT(1) NOT NULL DEFAULT 0,
            score INT NOT NULL DEFAULT 0,
            ip VARCHAR(45) DEFAULT NULL,
            INDEX idx_ticket (ticket)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
}
wf_ensure_draw_table($mysqli);

/* Spielmarken: Beim Start eines Spiels holt die Seite eine Marke. Ein Gutschein
   wird nur gegen eine Marke ausgegeben, die alt genug ist (Mindest-Spielzeit)
   und noch nicht benutzt wurde. So lässt sich kein Gutschein „einfach so“
   abrufen, ohne das Spiel überhaupt zu spielen. */
function wf_ensure_play_table($mysqli) {
    $mysqli->query("
        CREATE TABLE IF NOT EXISTS game_plays (
            id INT AUTO_INCREMENT PRIMARY KEY,
            created_at DATETIME NOT NULL,
            ticket VARCHAR(40) NOT NULL UNIQUE,
            game VARCHAR(20) NOT NULL,
            used TINYINT(1) NOT NULL DEFAULT 0,
            ip VARCHAR(45) DEFAULT NULL,
            INDEX idx_ip_time (ip, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
}
wf_ensure_play_table($mysqli);
$mysqli->query("DELETE FROM game_plays WHERE created_at < DATE_SUB(NOW(), INTERVAL 2 DAY)");

/* Prüft die Spielmarke. Gibt die Datensatz-ID zurück oder beendet mit Fehler. */
function wf_require_play($mysqli, $reward) {
    $t = preg_replace('/[^a-f0-9]/i', '', (string)($_POST['play'] ?? ''));
    $stmt = $mysqli->prepare("SELECT id, game, used, TIMESTAMPDIFF(SECOND, created_at, NOW()) AS age
        FROM game_plays WHERE ticket = ? LIMIT 1");
    $stmt->bind_param('s', $t);
    $stmt->execute();
    $p = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$p || $p['game'] !== $reward['game']) {
        echo json_encode(['ok'=>false,'error'=>'no_play',
            'message'=>'Bitte lade das Spiel neu und spiel die Runde noch einmal.']); exit;
    }
    if ((int)$p['used'] === 1) {
        echo json_encode(['ok'=>false,'error'=>'play_used',
            'message'=>'Für diese Spielrunde wurde schon ein Gutschein angefordert.']); exit;
    }
    if ((int)$p['age'] < (int)($reward['min_sec'] ?? 0) || (int)$p['age'] > 12 * 3600) {
        echo json_encode(['ok'=>false,'error'=>'play_time',
            'message'=>'Diese Runde lässt sich nicht bestätigen. Bitte spiel sie noch einmal.']); exit;
    }
    return (int)$p['id'];
}

/* Fadenlauf: Die eingereichten Lösungen werden hier Strecke für Strecke nachgerechnet –
   gleiche Regeln wie im Spiel. Gefälschte Lösungen fallen auf. */
function wf_faden_seg($a, $b, $p) {
    $dx = $b[0] - $a[0]; $dy = $b[1] - $a[1]; $l2 = $dx * $dx + $dy * $dy;
    $t = $l2 ? (($p[0] - $a[0]) * $dx + ($p[1] - $a[1]) * $dy) / $l2 : 0;
    $t = max(0, min(1, $t));
    return hypot($a[0] + $t * $dx - $p[0], $a[1] + $t * $dy - $p[1]);
}
function wf_faden_check($needBest) {
    $levels = json_decode((string)@file_get_contents(__DIR__ . '/faden_levels.json'), true);
    $paths  = json_decode((string)($_POST['paths'] ?? ''), true);
    $tips   = json_decode((string)($_POST['tips'] ?? '[]'), true);
    if (!is_array($levels) || !is_array($paths)) return [false, 0];
    $tips = is_array($tips) ? array_map('intval', $tips) : [];
    $best = 0;
    foreach ($levels as $i => $L) {
        $path = $paths[$i] ?? $paths[(string)$i] ?? null;
        if (!is_array($path) || count($path) < 2 || count($path) > 12) return [false, $best];
        $path = array_map('intval', $path);
        if ($path[0] !== (int)$L['start']) return [false, $best];
        $mask = 0; $n = count($L['nails']);
        for ($k = 1; $k < count($path); $k++) {
            $u = $path[$k - 1]; $v = $path[$k];
            if ($u === $v || $u < 0 || $v < 0 || $u >= $n || $v >= $n) return [false, $best];
            $a = $L['nails'][$u]; $b = $L['nails'][$v];
            foreach ($L['snags'] as $sn) if (wf_faden_seg($a, $b, $sn) < 0.03) return [false, $best];
            foreach ($L['beads'] as $j => $bd) if (wf_faden_seg($a, $b, $bd) < 0.03) $mask |= 1 << $j;
        }
        if ($mask !== (1 << count($L['beads'])) - 1) return [false, $best];
        if (count($path) - 1 <= (int)$L['par'] && !in_array($i, $tips, true)) $best++;
    }
    return [$best >= $needBest, $best];
}

$action  = $_REQUEST['action'] ?? '';
$isAdmin = function_exists('wf_admin_can') ? wf_admin_can('spiele', $mysqli) : !empty($_SESSION['wf_admin_id']);

/* ─── ÖFFENTLICH: Spielmarke holen (beim Start einer Runde) ─────────── */
if ($action === 'play_start') {
    $game = (string)($_POST['game'] ?? $_REQUEST['game'] ?? '');
    $games = array_unique(array_column($WF_REWARDS, 'game'));
    if (!in_array($game, $games, true)) { echo json_encode(['ok'=>false,'error'=>'unknown_game']); exit; }
    $ip = trim(explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '')[0]);
    $stmt = $mysqli->prepare("SELECT COUNT(*) AS c FROM game_plays WHERE ip = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 DAY)");
    $stmt->bind_param('s', $ip);
    $stmt->execute();
    $c = (int)$stmt->get_result()->fetch_assoc()['c'];
    $stmt->close();
    if ($c >= 300) { echo json_encode(['ok'=>false,'error'=>'rate_limit']); exit; }
    $ticket = bin2hex(random_bytes(12));
    $now = date('Y-m-d H:i:s');
    $stmt = $mysqli->prepare("INSERT INTO game_plays (created_at, ticket, game, ip) VALUES (?,?,?,?)");
    $stmt->bind_param('ssss', $now, $ticket, $game, $ip);
    $stmt->execute();
    $stmt->close();
    echo json_encode(['ok'=>true,'play'=>$ticket]);
    exit;
}

/* ─── ÖFFENTLICH: Ziehung eröffnen ──────────────────────────────── */
if ($action === 'draw_start') {
    $key   = (string)($_POST['reward'] ?? $_REQUEST['reward'] ?? '');
    $score = (int)($_POST['score'] ?? $_REQUEST['score'] ?? 0);
    $lvl   = (int)($_POST['level'] ?? $_REQUEST['level'] ?? 0);
    if (!isset($WF_REWARDS[$key])) { echo json_encode(['ok'=>false,'error'=>'unknown_reward']); exit; }
    if ($score < (int)$WF_REWARDS[$key]['need']) {
        echo json_encode(['ok'=>false,'error'=>'not_earned']); exit;
    }
    if ($lvl < (int)($WF_REWARDS[$key]['lvl'] ?? 0)) {
        echo json_encode(['ok'=>false,'error'=>'level_too_low',
            'message'=>'Dafür muss mindestens Level ' . (int)$WF_REWARDS[$key]['lvl'] . ' geschafft sein.']); exit;
    }

    if (!empty($WF_REWARDS[$key]['faden_best'])) {
        [$okF] = wf_faden_check((int)$WF_REWARDS[$key]['faden_best']);
        if (!$okF) { echo json_encode(['ok'=>false,'error'=>'not_earned',
            'message'=>'Die Lösungen ließen sich nicht bestätigen.']); exit; }
    }
    $playId = wf_require_play($mysqli, $WF_REWARDS[$key]);

    $ip = trim(explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '')[0]);

    /* Bremse: höchstens ein paar Ziehungen pro Tag und Leitung */
    $stmt = $mysqli->prepare("SELECT COUNT(*) AS c FROM game_draws
        WHERE ip = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 DAY)");
    $stmt->bind_param('s', $ip);
    $stmt->execute();
    $c = (int)$stmt->get_result()->fetch_assoc()['c'];
    $stmt->close();
    /* Manche Ziehungen lassen sich ohne neue Leistung wiederholen (Fadenlauf) – dort nur einmal am Tag */
    if (!empty($WF_REWARDS[$key]['draws_per_day'])) {
        $stmt = $mysqli->prepare("SELECT COUNT(*) AS c FROM game_draws
            WHERE ip = ? AND reward_key = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 DAY)");
        $stmt->bind_param('ss', $ip, $key);
        $stmt->execute();
        $cK = (int)$stmt->get_result()->fetch_assoc()['c'];
        $stmt->close();
        if ($cK >= (int)$WF_REWARDS[$key]['draws_per_day']) {
            echo json_encode(['ok'=>false,'error'=>'rate_limit',
                'message'=>'Die Ziehung gibt es einmal am Tag. Morgen gerne wieder!']); exit;
        }
    }
    if ($c >= 5) {
        echo json_encode(['ok'=>false,'error'=>'rate_limit',
            'message'=>'Heute wurde von hier schon mehrfach gezogen. Morgen gerne wieder.']); exit;
    }

    $ticket = bin2hex(random_bytes(12));
    $win    = random_int(0, 2);          /* HIER fällt die Entscheidung */
    $now    = date('Y-m-d H:i:s');

    $stmt = $mysqli->prepare("INSERT INTO game_draws
        (created_at, ticket, reward_key, win_card, score, ip) VALUES (?,?,?,?,?,?)");
    $stmt->bind_param('sssiis', $now, $ticket, $key, $win, $score, $ip);
    $stmt->execute();
    $stmt->close();
    $mysqli->query("UPDATE game_plays SET used = 1 WHERE id = $playId");

    echo json_encode(['ok'=>true,'ticket'=>$ticket]);
    exit;
}

/* ─── ÖFFENTLICH: Karte aufdecken ───────────────────────────────── */
if ($action === 'draw_pick') {
    $ticket = preg_replace('/[^a-f0-9]/i', '', (string)($_POST['ticket'] ?? $_REQUEST['ticket'] ?? ''));
    $pick   = (int)($_POST['pick'] ?? $_REQUEST['pick'] ?? -1);
    if ($pick < 0 || $pick > 2) { echo json_encode(['ok'=>false,'error'=>'bad_pick']); exit; }

    $stmt = $mysqli->prepare("SELECT id, reward_key, win_card, picked FROM game_draws
        WHERE ticket = ? LIMIT 1");
    $stmt->bind_param('s', $ticket);
    $stmt->execute();
    $d = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$d) { echo json_encode(['ok'=>false,'error'=>'unknown_ticket']); exit; }
    if ($d['picked'] !== null) { echo json_encode(['ok'=>false,'error'=>'already_picked']); exit; }

    $won = ((int)$d['win_card'] === $pick) ? 1 : 0;
    $stmt = $mysqli->prepare("UPDATE game_draws SET picked = ?, won = ? WHERE id = ?");
    $stmt->bind_param('iii', $pick, $won, $d['id']);
    $stmt->execute();
    $stmt->close();

    echo json_encode([
        'ok'       => true,
        'won'      => (bool)$won,
        'win_card' => (int)$d['win_card'],
        'percent'  => $won ? (int)$WF_REWARDS[$d['reward_key']]['pct'] : 0,
    ]);
    exit;
}

/* Lesbarer Code ohne verwechselbare Zeichen (kein 0/O, 1/I) */
function wf_make_code($mysqli) {
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for ($try = 0; $try < 40; $try++) {
        $a = ''; $b = '';
        for ($i = 0; $i < 4; $i++) $a .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        for ($i = 0; $i < 4; $i++) $b .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        $code = "WF-$a-$b";
        $stmt = $mysqli->prepare("SELECT id FROM game_vouchers WHERE code = ? LIMIT 1");
        $stmt->bind_param('s', $code);
        $stmt->execute();
        $exists = $stmt->get_result()->num_rows > 0;
        $stmt->close();
        if (!$exists) return $code;
    }
    return null;
}

/* ── Aufräumen bei jedem Aufruf: kein Cron-Job nötig ──────────────
   1. Abgelaufene Gutscheine markieren
   2. Eingelöste, abgelaufene und gesperrte nach der Aufbewahrungsfrist
      vollständig löschen – so bleiben Name und E-Mail nicht länger
      gespeichert als nötig.                                            */
$mysqli->query("UPDATE game_vouchers SET status = 'expired'
                WHERE status = 'open' AND expires_at < NOW()");

$loeschTage = (int)$WF_VOUCHER['loeschen_tage'];
if ($loeschTage > 0) {
    $mysqli->query("DELETE FROM game_vouchers
        WHERE status = 'redeemed' AND redeemed_at IS NOT NULL
          AND redeemed_at < DATE_SUB(NOW(), INTERVAL $loeschTage DAY)");
    $mysqli->query("DELETE FROM game_vouchers
        WHERE status IN ('expired','void')
          AND expires_at < DATE_SUB(NOW(), INTERVAL $loeschTage DAY)");
    $mysqli->query("DELETE FROM game_draws
        WHERE created_at < DATE_SUB(NOW(), INTERVAL $loeschTage DAY)");
}

/* ─── Selbsttest ────────────────────────────────────────────────── */
if ($action === 'ping') {
    $c = $mysqli->query("SELECT COUNT(*) AS c FROM game_vouchers");
    echo json_encode([
        'ok'        => true,
        'version'   => 'v4',
        'loeschfrist_tage' => (int)$WF_VOUCHER['loeschen_tage'],
        'php'       => PHP_VERSION,
        'vouchers'  => (int)($c ? $c->fetch_assoc()['c'] : -1),
        'draws'     => (int)($mysqli->query("SELECT COUNT(*) AS c FROM game_draws")->fetch_assoc()['c'] ?? -1),
        'belohnungen' => array_keys($WF_REWARDS),
    ]);
    exit;
}

/* ─── ÖFFENTLICH: Gutschein anfordern ───────────────────────────── */
if ($action === 'claim') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['ok' => false, 'error' => 'method_not_allowed']); exit;
    }

    $key   = (string)($_POST['reward'] ?? '');
    $name  = mb_substr(strip_tags(trim((string)($_POST['name']  ?? ''))), 0, 60);
    $email = mb_substr(strip_tags(trim((string)($_POST['email'] ?? ''))), 0, 120);
    $lang  = in_array($_POST['lang'] ?? 'de', ['de','da','en'], true) ? $_POST['lang'] : 'de';
    $proof = mb_substr(strip_tags(trim((string)($_POST['proof'] ?? ''))), 0, 60);
    $ok_dsgvo = !empty($_POST['consent']);

    if (!isset($WF_REWARDS[$key]))                    { echo json_encode(['ok'=>false,'error'=>'unknown_reward']); exit; }
    if (mb_strlen($name) < 2)                         { echo json_encode(['ok'=>false,'error'=>'name_missing']);   exit; }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL))   { echo json_encode(['ok'=>false,'error'=>'bad_email']);      exit; }
    if (!$ok_dsgvo)                                   { echo json_encode(['ok'=>false,'error'=>'no_consent']);     exit; }

    $reward = $WF_REWARDS[$key];
    $ip = trim(explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '')[0]);

    /* Belohnungen mit Ziehung brauchen ein gewonnenes, noch nicht benutztes Los */
    $drawId = null;
    if (strpos($key, 'ziehung') !== false) {
        $ticket = preg_replace('/[^a-f0-9]/i', '', (string)($_POST['ticket'] ?? ''));
        $stmt = $mysqli->prepare("SELECT id, won, claimed, reward_key FROM game_draws
            WHERE ticket = ? LIMIT 1");
        $stmt->bind_param('s', $ticket);
        $stmt->execute();
        $d = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if (!$d || (int)$d['won'] !== 1 || $d['reward_key'] !== $key) {
            echo json_encode(['ok'=>false,'error'=>'no_win']); exit;
        }
        if ((int)$d['claimed'] === 1) {
            echo json_encode(['ok'=>false,'error'=>'already_claimed']); exit;
        }
        $drawId = (int)$d['id'];
    } else {
        /* Direkte Gutscheine: Spielmarke und – wo möglich – Nachweis prüfen */
        $playId = wf_require_play($mysqli, $reward);
        if (!empty($reward['faden_best'])) {
            [$okF, $bestF] = wf_faden_check((int)$reward['faden_best']);
            if (!$okF) { echo json_encode(['ok'=>false,'error'=>'not_earned',
                'message'=>'Die Lösungen ließen sich nicht bestätigen ('.$bestF.' Bestlösungen).']); exit; }
        }
        if ((int)($_POST['level'] ?? 0) < (int)($reward['lvl'] ?? 0)) {
            echo json_encode(['ok'=>false,'error'=>'level_too_low']); exit;
        }
    }

    /* Sperrfrist je E-Mail-Adresse */
    $stmt = $mysqli->prepare("
        SELECT created_at FROM game_vouchers
        WHERE email = ? AND status <> 'void'
          AND created_at > DATE_SUB(NOW(), INTERVAL ? DAY)
        ORDER BY created_at DESC LIMIT 1
    ");
    $d = (int)$WF_VOUCHER['pro_mail_tage'];
    $stmt->bind_param('si', $email, $d);
    $stmt->execute();
    $recent = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if ($recent) {
        echo json_encode([
            'ok' => false, 'error' => 'too_soon',
            'message' => 'Pro E-Mail-Adresse gibt es alle ' . $d . ' Tage einen Gutschein. '
                       . 'Zuletzt am ' . date('d.m.Y', strtotime($recent['created_at'])) . '.',
        ]);
        exit;
    }

    /* Bremse gegen massenhaftes Anfordern von einer Leitung */
    $stmt = $mysqli->prepare("
        SELECT COUNT(*) AS c FROM game_vouchers
        WHERE ip = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 DAY)
    ");
    $stmt->bind_param('s', $ip);
    $stmt->execute();
    $ipCount = (int)$stmt->get_result()->fetch_assoc()['c'];
    $stmt->close();
    if ($ipCount >= (int)$WF_VOUCHER['pro_ip_tag']) {
        echo json_encode(['ok'=>false,'error'=>'rate_limit',
            'message'=>'Heute wurden von hier schon mehrere Gutscheine angefordert.']); exit;
    }

    /* Plausibilität: Bestenliste als Gegenprobe, sofern vorhanden */
    if ($reward['game'] === 'tycoon') {
        $tbl = $mysqli->query("SHOW TABLES LIKE 'game_scores'");
        if ($tbl && $tbl->num_rows > 0) {
            $tok = preg_replace('/[^a-zA-Z0-9]/', '', (string)($_POST['token'] ?? ''));
            $stmt = $mysqli->prepare("SELECT umsatz, playtime FROM game_scores WHERE token = ? LIMIT 1");
            $stmt->bind_param('s', $tok);
            $stmt->execute();
            $row = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            if (!$row || (float)$row['umsatz'] < (float)$reward['need'] || (int)$row['playtime'] < 600) {
                echo json_encode(['ok'=>false,'error'=>'not_earned',
                    'message'=>'Der Spielstand reicht dafür noch nicht. Melde dich in der Bestenliste an und spiel weiter.']);
                exit;
            }
        }
    }

    $code = wf_make_code($mysqli);
    if (!$code) { echo json_encode(['ok'=>false,'error'=>'code_failed']); exit; }

    $now     = date('Y-m-d H:i:s');
    $expires = date('Y-m-d H:i:s', strtotime('+' . (int)$WF_VOUCHER['gueltig_tage'] . ' days'));
    $pct     = (int)$reward['pct'];
    $minOrd  = (int)$WF_VOUCHER['min_bestellung'];
    $reason  = $reward['text'];

    $stmt = $mysqli->prepare("
        INSERT INTO game_vouchers
            (created_at, expires_at, code, percent, min_order, name, email, lang, reward_key, reason, proof, ip)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    ");
    $stmt->bind_param('sssiisssssss',
        $now, $expires, $code, $pct, $minOrd, $name, $email, $lang, $key, $reason, $proof, $ip);
    $stmt->execute();
    $stmt->close();

    if ($drawId) $mysqli->query("UPDATE game_draws SET claimed = 1 WHERE id = $drawId");
    if (!empty($playId)) $mysqli->query("UPDATE game_plays SET used = 1 WHERE id = $playId");

    /* Mail an den Gewinner */
    $sent = wf_send_voucher_mail($email, $name, $lang, $code, $pct, $expires, $minOrd, $reason);

    /* Kurze Info an dich – aber nicht doppelt, wenn der Gutschein
       ohnehin an dieselbe Adresse geht. */
    $adminAdresse = $WF_VOUCHER['admin_mail'];
    if (!empty($WF_VOUCHER['admin_info'])
        && strcasecmp(trim($adminAdresse), trim($email)) !== 0) {
        wf_send_admin_mail($adminAdresse, $code, $pct, $name, $email, $reason, $expires, $minOrd);
    }

    echo json_encode([
        'ok'      => true,
        'percent' => $pct,
        'expires' => date('d.m.Y', strtotime($expires)),
        'mail'    => $sent ? 'sent' : 'failed',
        'message' => $sent
            ? 'Der Gutschein ist unterwegs zu ' . $email
            : 'Gutschein erstellt, aber die E-Mail konnte nicht zugestellt werden. Melde dich bitte bei hej@wunsch-fabrik.dk.',
    ]);
    exit;
}

/* ─── Code prüfen (ohne einzulösen) ─────────────────────────────
   Öffentlich, damit Kunden ihren eigenen Code prüfen können – aber mit
   Bremse, damit niemand Codes durchprobieren kann. */
if ($action === 'check') {
    $code = strtoupper(preg_replace('/[^A-Z0-9\-]/i', '', (string)($_REQUEST['code'] ?? '')));
    if (!$code) { echo json_encode(['ok'=>false,'error'=>'no_code']); exit; }

    if (!$isAdmin) {
        $ip = trim(explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '')[0]);
        $mysqli->query("
            CREATE TABLE IF NOT EXISTS game_checks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                created_at DATETIME NOT NULL,
                ip VARCHAR(45) NOT NULL,
                INDEX idx_ip_time (ip, created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        ");
        $mysqli->query("DELETE FROM game_checks WHERE created_at < DATE_SUB(NOW(), INTERVAL 2 HOUR)");
        $stmt = $mysqli->prepare("SELECT COUNT(*) AS c FROM game_checks
            WHERE ip = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)");
        $stmt->bind_param('s', $ip);
        $stmt->execute();
        $versuche = (int)$stmt->get_result()->fetch_assoc()['c'];
        $stmt->close();
        if ($versuche >= 15) {
            echo json_encode(['ok'=>false,'error'=>'rate_limit',
                'message'=>'Zu viele Abfragen. Bitte später noch einmal versuchen.']);
            exit;
        }
        $now = date('Y-m-d H:i:s');
        $stmt = $mysqli->prepare("INSERT INTO game_checks (created_at, ip) VALUES (?,?)");
        $stmt->bind_param('ss', $now, $ip);
        $stmt->execute();
        $stmt->close();
    }

    $stmt = $mysqli->prepare("
        SELECT percent, min_order, status, expires_at, reason
        FROM game_vouchers WHERE code = ? LIMIT 1
    ");
    $stmt->bind_param('s', $code);
    $stmt->execute();
    $v = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$v) { echo json_encode(['ok'=>false,'error'=>'unknown_code','message'=>'Diesen Code kennen wir nicht.']); exit; }

    $valid = ($v['status'] === 'open');
    $msg = [
        'open'     => 'Gültig – ' . (int)$v['percent'] . ' % ab ' . (int)$v['min_order'] . ' kr Bestellwert.',
        'redeemed' => 'Dieser Gutschein wurde bereits eingelöst.',
        'void'     => 'Dieser Gutschein wurde gesperrt.',
        'expired'  => 'Dieser Gutschein ist abgelaufen.',
    ][$v['status']] ?? 'Unbekannter Status.';

    echo json_encode([
        'ok'        => true,
        'valid'     => $valid,
        'percent'   => (int)$v['percent'],
        'min_order' => (int)$v['min_order'],
        'status'    => $v['status'],
        'expires'   => date('d.m.Y', strtotime($v['expires_at'])),
        'reason'    => $v['reason'],
        'message'   => $msg,
    ]);
    exit;
}

/* ─── ADMIN: Übersicht ──────────────────────────────────────────── */
if ($action === 'list') {
    if (!$isAdmin) { echo json_encode(['ok'=>false,'error'=>'unauthorized']); exit; }
    $status = $_REQUEST['status'] ?? '';
    $sql = "SELECT * FROM game_vouchers";
    if (in_array($status, ['open','redeemed','void','expired'], true)) {
        $sql .= " WHERE status = '" . $mysqli->real_escape_string($status) . "'";
    }
    $sql .= " ORDER BY created_at DESC LIMIT 500";
    $res = $mysqli->query($sql);
    $rows = [];
    while ($r = $res->fetch_assoc()) {
        $basis = null;
        if ($r['status'] === 'redeemed' && $r['redeemed_at']) $basis = $r['redeemed_at'];
        elseif (in_array($r['status'], ['expired','void'], true)) $basis = $r['expires_at'];
        $r['delete_at'] = $basis
            ? date('Y-m-d H:i:s', strtotime($basis.' +'.(int)$WF_VOUCHER['loeschen_tage'].' days'))
            : null;
        $rows[] = $r;
    }

    $stats = $mysqli->query("
        SELECT status, COUNT(*) AS c, SUM(percent) AS pct FROM game_vouchers GROUP BY status
    ");
    $sum = [];
    while ($r = $stats->fetch_assoc()) $sum[$r['status']] = (int)$r['c'];

    echo json_encode(['ok' => true, 'vouchers' => $rows, 'summary' => $sum]);
    exit;
}

/* ─── ADMIN: einlösen ───────────────────────────────────────────── */
if ($action === 'redeem') {
    if (!$isAdmin) { echo json_encode(['ok'=>false,'error'=>'unauthorized']); exit; }
    $code = strtoupper(preg_replace('/[^A-Z0-9\-]/i', '', (string)($_REQUEST['code'] ?? '')));
    $note = mb_substr(strip_tags(trim((string)($_REQUEST['note'] ?? ''))), 0, 160);

    $stmt = $mysqli->prepare("SELECT id, status, percent FROM game_vouchers WHERE code = ? LIMIT 1");
    $stmt->bind_param('s', $code);
    $stmt->execute();
    $v = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$v)                        { echo json_encode(['ok'=>false,'error'=>'unknown_code']); exit; }
    if ($v['status'] !== 'open')    { echo json_encode(['ok'=>false,'error'=>'not_open','status'=>$v['status']]); exit; }

    $now = date('Y-m-d H:i:s');
    $stmt = $mysqli->prepare("
        UPDATE game_vouchers SET status = 'redeemed', redeemed_at = ?, redeemed_note = ? WHERE id = ?
    ");
    $stmt->bind_param('ssi', $now, $note, $v['id']);
    $stmt->execute();
    $stmt->close();

    echo json_encode(['ok' => true, 'percent' => (int)$v['percent']]);
    exit;
}

/* ─── ADMIN: sperren / freigeben ────────────────────────────────── */
if ($action === 'void') {
    if (!$isAdmin) { echo json_encode(['ok'=>false,'error'=>'unauthorized']); exit; }
    $id  = (int)($_REQUEST['id'] ?? 0);
    $new = !empty($_REQUEST['undo']) ? 'open' : 'void';
    $stmt = $mysqli->prepare("UPDATE game_vouchers SET status = ? WHERE id = ?");
    $stmt->bind_param('si', $new, $id);
    $stmt->execute();
    $stmt->close();
    echo json_encode(['ok' => true, 'status' => $new]);
    exit;
}

echo json_encode(['ok' => false, 'error' => 'unknown_action']);


/* ═══════════════ Mailversand ═══════════════ */

/* Kurze Info an den Betreiber, im gleichen Stil wie die Kundenmail */
function wf_send_admin_mail($an, $code, $pct, $name, $email, $reason, $expires, $minOrder) {
    $bis = date('d.m.Y', strtotime($expires));
    $html = '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0d0d0d;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0d;padding:24px 12px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:460px;background:#161616;
  border:1px solid rgba(139,43,226,0.3);border-radius:12px;
  font-family:Segoe UI,Helvetica,Arial,sans-serif;">
  <tr><td style="padding:20px 22px 6px;">
    <div style="font-size:10px;letter-spacing:3px;color:#A855F7;text-transform:uppercase;">
      Neuer Spiel-Gutschein</div>
    <div style="font-size:26px;font-weight:700;color:#F0EEF5;letter-spacing:2px;
      font-family:Consolas,Menlo,monospace;margin-top:8px;">' . $code . '</div>
    <div style="display:inline-block;background:#8B2BE2;color:#fff;font-size:13px;font-weight:700;
      padding:3px 12px;border-radius:20px;margin-top:8px;">' . $pct . ' % Rabatt</div>
  </td></tr>
  <tr><td style="padding:14px 22px 20px;">
    <table width="100%" cellpadding="0" cellspacing="0"
      style="font-size:13px;color:#C9C4D2;line-height:1.9;">
      <tr><td style="color:#7a7a7a;width:96px;">Name</td><td>' . htmlspecialchars($name) . '</td></tr>
      <tr><td style="color:#7a7a7a;">E-Mail</td><td>' . htmlspecialchars($email) . '</td></tr>
      <tr><td style="color:#7a7a7a;">Erspielt</td><td>' . htmlspecialchars($reason) . '</td></tr>
      <tr><td style="color:#7a7a7a;">Gültig bis</td><td>' . $bis . '</td></tr>
      <tr><td style="color:#7a7a7a;">Mindestwert</td><td>' . $minOrder . ' kr</td></tr>
    </table>
  </td></tr>
</table>
</td></tr></table></body></html>';

    $headers  = "From: Wunsch-Fabrik <hej@wunsch-fabrik.dk>\r\n";
    $headers .= "MIME-Version: 1.0\r\n";
    $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
    return @mail($an, "Spiel-Gutschein $code ($pct %)", $html, $headers);
}

function wf_send_voucher_mail($email, $name, $lang, $code, $pct, $expires, $minOrder, $reason) {
    $bis = date('d.m.Y', strtotime($expires));

    $t = [
        'de' => [
            'subject' => "🎁 Dein $pct %-Gutschein von Wunsch-Fabrik.dk",
            'hallo'   => "Hallo $name,",
            'intro'   => "gut gespielt! Für <b>$reason</b> bekommst du von uns einen Gutschein über <b>$pct %</b>.",
            'code'    => 'Dein Gutscheincode',
            'gueltig' => "Gültig bis <b>$bis</b> · ab $minOrder kr Bestellwert · einmalig einlösbar · nicht mit anderen Rabatten kombinierbar",
            'wie'     => 'Nenne den Code einfach bei deiner nächsten Anfrage oder Bestellung – per Mail, telefonisch oder direkt bei uns in Padborg.',
            'gruss'   => "Liebe Grüße<br>Dein Wunsch-Fabrik-Team",
            'dsgvo'   => "Wir speichern deinen Namen und deine E-Mail-Adresse nur so lange, "
                       . "bis dieser Gutschein eingelöst oder abgelaufen ist. Eine Woche danach "
                       . "werden alle Daten dazu automatisch und vollständig gelöscht.",
        ],
        'da' => [
            'subject' => "🎁 Din $pct %-rabatkode fra Wunsch-Fabrik.dk",
            'hallo'   => "Hej $name,",
            'intro'   => "flot spillet! For <b>$reason</b> giver vi dig en rabatkode på <b>$pct %</b>.",
            'code'    => 'Din rabatkode',
            'gueltig' => "Gyldig til <b>$bis</b> · ved køb over $minOrder kr · kan kun bruges én gang · kan ikke kombineres med andre rabatter",
            'wie'     => 'Nævn blot koden ved din næste forespørgsel eller bestilling – på mail, telefon eller direkte hos os i Padborg.',
            'gruss'   => "Mange hilsner<br>Dit Wunsch-Fabrik team",
            'dsgvo'   => "Vi gemmer kun dit navn og din e-mailadresse, indtil rabatkoden er "
                       . "brugt eller udløbet. En uge derefter slettes alle data automatisk.",
        ],
        'en' => [
            'subject' => "🎁 Your $pct% voucher from Wunsch-Fabrik.dk",
            'hallo'   => "Hi $name,",
            'intro'   => "well played! For <b>$reason</b> here's a voucher worth <b>$pct%</b>.",
            'code'    => 'Your voucher code',
            'gueltig' => "Valid until <b>$bis</b> · on orders from $minOrder kr · single use · cannot be combined with other discounts",
            'wie'     => 'Just mention the code with your next enquiry or order – by email, phone or in person in Padborg.',
            'gruss'   => "Best regards<br>The Wunsch-Fabrik Team",
            'dsgvo'   => "We only store your name and email address until this voucher has been "
                       . "redeemed or has expired. One week later all related data is deleted "
                       . "automatically and completely.",
        ],
    ];
    $x = $t[$lang] ?? $t['de'];

    $html = '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0d0d0d;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0d;padding:28px 12px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#161616;
  border:1px solid rgba(139,43,226,0.3);border-radius:14px;overflow:hidden;
  font-family:Segoe UI,Helvetica,Arial,sans-serif;">
  <tr><td style="padding:26px 26px 6px;text-align:center;">
    <div style="font-size:22px;font-weight:700;color:#F0EEF5;letter-spacing:2px;">WUNSCH-FABRIK</div>
    <div style="font-size:10px;letter-spacing:3px;color:#A855F7;text-transform:uppercase;margin-top:4px;">Padborg</div>
  </td></tr>
  <tr><td style="padding:18px 26px 0;color:#C9C4D2;font-size:15px;line-height:1.7;">
    <p style="margin:0 0 12px;color:#F0EEF5;font-size:16px;">' . $x['hallo'] . '</p>
    <p style="margin:0 0 20px;">' . $x['intro'] . '</p>
  </td></tr>
  <tr><td style="padding:0 26px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#1c1c1c;
      border:1px solid #8B2BE2;border-radius:12px;">
      <tr><td style="padding:20px;text-align:center;">
        <div style="font-size:10px;letter-spacing:3px;color:#A855F7;text-transform:uppercase;">' . $x['code'] . '</div>
        <div style="font-size:30px;font-weight:700;color:#F0EEF5;letter-spacing:3px;
          font-family:Consolas,Menlo,monospace;margin:10px 0 4px;">' . $code . '</div>
        <div style="display:inline-block;background:#8B2BE2;color:#fff;font-size:15px;font-weight:700;
          padding:5px 16px;border-radius:20px;margin-top:6px;">' . $pct . ' % Rabatt</div>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:16px 26px 0;color:#8a8a8a;font-size:12px;line-height:1.7;text-align:center;">
    ' . $x['gueltig'] . '
  </td></tr>
  <tr><td style="padding:18px 26px 4px;color:#C9C4D2;font-size:14px;line-height:1.7;">
    <p style="margin:0 0 18px;">' . $x['wie'] . '</p>
    <p style="margin:0;">' . $x['gruss'] . '</p>
  </td></tr>
  <tr><td style="padding:16px 26px 0;">
    <div style="border-left:2px solid #8B2BE2;padding:2px 0 2px 12px;color:#7a7a7a;
      font-size:11px;line-height:1.7;">' . $x['dsgvo'] . '</div>
  </td></tr>
  <tr><td style="padding:22px 26px 24px;border-top:1px solid rgba(139,43,226,0.2);margin-top:16px;
    color:#555;font-size:11px;line-height:1.7;text-align:center;">
    Wunsch-Fabrik · Teglgård 1 · Vilsbæk · 6330 Padborg · Danmark<br>
    <a href="https://www.wunsch-fabrik.dk" style="color:#A855F7;text-decoration:none;">wunsch-fabrik.dk</a>
    · <a href="mailto:hej@wunsch-fabrik.dk" style="color:#A855F7;text-decoration:none;">hej@wunsch-fabrik.dk</a>
  </td></tr>
</table>
</td></tr></table></body></html>';

    $headers  = "From: Wunsch-Fabrik <hej@wunsch-fabrik.dk>\r\n";
    $headers .= "Reply-To: hej@wunsch-fabrik.dk\r\n";
    $headers .= "MIME-Version: 1.0\r\n";
    $headers .= "Content-Type: text/html; charset=UTF-8\r\n";

    return @mail($email, $x['subject'], $html, $headers);
}
