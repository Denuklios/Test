<?php
/**
 * Wunsch-Fabrik.dk – Gemeinsame Datenbank-Konfiguration
 */

// Zugangsdaten liegen in db_config.php (Vorlage: db_config.example.php).
require_once __DIR__ . '/db_config.php';

function wf_db_connect() {
    $mysqli = @new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
    if ($mysqli->connect_errno) {
        return null;
    }
    $mysqli->set_charset('utf8mb4');
    return $mysqli;
}

function wf_ensure_tables($mysqli) {
    // Besucher-Tracking (bereits durch track.php genutzt)
    $mysqli->query("
        CREATE TABLE IF NOT EXISTS visits (
            id INT AUTO_INCREMENT PRIMARY KEY,
            session_id VARCHAR(64) NOT NULL,
            last_seen DATETIME NOT NULL,
            first_seen DATETIME NOT NULL,
            country VARCHAR(100) DEFAULT NULL,
            country_code VARCHAR(8) DEFAULT NULL,
            region VARCHAR(100) DEFAULT NULL,
            city VARCHAR(100) DEFAULT NULL,
            INDEX idx_session (session_id),
            INDEX idx_last_seen (last_seen)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    // Falls Tabelle bereits ohne Geo-Spalten existierte: nachrüsten
    $geoCols = ['country', 'country_code', 'region', 'city'];
    foreach ($geoCols as $col) {
        $colCheck = $mysqli->query("SHOW COLUMNS FROM visits LIKE '$col'");
        if ($colCheck && $colCheck->num_rows === 0) {
            $mysqli->query("ALTER TABLE visits ADD COLUMN $col VARCHAR(100) DEFAULT NULL");
        }
    }

    // Kontaktanfragen
    $mysqli->query("
        CREATE TABLE IF NOT EXISTS inquiries (
            id INT AUTO_INCREMENT PRIMARY KEY,
            created_at DATETIME NOT NULL,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL,
            phone VARCHAR(64),
            product VARCHAR(255),
            qty VARCHAR(64),
            wish_date VARCHAR(64),
            message TEXT,
            file_name VARCHAR(255),
            lang VARCHAR(8) NOT NULL DEFAULT 'de',
            status VARCHAR(32) NOT NULL DEFAULT 'new',
            INDEX idx_created (created_at),
            INDEX idx_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    // Falls Tabelle bereits ohne lang existierte: Spalte nachrüsten
    $colCheck = $mysqli->query("SHOW COLUMNS FROM inquiries LIKE 'lang'");
    if ($colCheck && $colCheck->num_rows === 0) {
        $mysqli->query("ALTER TABLE inquiries ADD COLUMN lang VARCHAR(8) NOT NULL DEFAULT 'de' AFTER file_name");
    }

    // Admin-Benutzer
    $mysqli->query("
        CREATE TABLE IF NOT EXISTS admin_users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(64) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            created_at DATETIME NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    // Shop-Produkte
    $mysqli->query("
        CREATE TABLE IF NOT EXISTS products (
            id INT AUTO_INCREMENT PRIMARY KEY,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            name VARCHAR(255) NOT NULL,
            category VARCHAR(64) NOT NULL,
            description TEXT,
            price DECIMAL(10,2) NOT NULL DEFAULT 0,
            price_unit VARCHAR(64) DEFAULT 'DKK/Stück',
            price_from TINYINT(1) NOT NULL DEFAULT 1,
            image VARCHAR(255),
            badge VARCHAR(64),
            info TEXT,
            active TINYINT(1) NOT NULL DEFAULT 1,
            sort_order INT NOT NULL DEFAULT 0,
            INDEX idx_category (category),
            INDEX idx_active (active)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    // Kundenbewertungen
    $mysqli->query("
        CREATE TABLE IF NOT EXISTS reviews (
            id INT AUTO_INCREMENT PRIMARY KEY,
            created_at DATETIME NOT NULL,
            name VARCHAR(255) NOT NULL,
            company VARCHAR(255) DEFAULT NULL,
            initials_only TINYINT(1) NOT NULL DEFAULT 0,
            text TEXT NOT NULL,
            status VARCHAR(32) NOT NULL DEFAULT 'pending',
            INDEX idx_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    // Falls Tabelle bereits ohne company existierte: Spalte nachrüsten
    $colCheck = $mysqli->query("SHOW COLUMNS FROM reviews LIKE 'company'");
    if ($colCheck && $colCheck->num_rows === 0) {
        $mysqli->query("ALTER TABLE reviews ADD COLUMN company VARCHAR(255) DEFAULT NULL AFTER name");
    }

    // Werkstatt-Fotos ("Frisch aus der Werkstatt")
    $mysqli->query("
        CREATE TABLE IF NOT EXISTS workshop_photos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            created_at DATETIME NOT NULL,
            image VARCHAR(255) NOT NULL,
            caption VARCHAR(255),
            sort_order INT NOT NULL DEFAULT 0,
            active TINYINT(1) NOT NULL DEFAULT 1,
            INDEX idx_active (active)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    // Video-Support für Werkstatt-Fotos nachrüsten
    $colCheck = $mysqli->query("SHOW COLUMNS FROM workshop_photos LIKE 'media_type'");
    if ($colCheck && $colCheck->num_rows === 0) {
        $mysqli->query("ALTER TABLE workshop_photos ADD COLUMN media_type VARCHAR(10) NOT NULL DEFAULT 'image' AFTER image");
    }
    $colCheck = $mysqli->query("SHOW COLUMNS FROM workshop_photos LIKE 'video_thumb'");
    if ($colCheck && $colCheck->num_rows === 0) {
        $mysqli->query("ALTER TABLE workshop_photos ADD COLUMN video_thumb VARCHAR(255) DEFAULT NULL AFTER media_type");
    }

    // Referenz-Logos (Firmenkunden-Laufleiste)
    $mysqli->query("
        CREATE TABLE IF NOT EXISTS ref_logos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            created_at DATETIME NOT NULL,
            name VARCHAR(255) NOT NULL,
            website VARCHAR(255) DEFAULT NULL,
            image_small VARCHAR(255) NOT NULL,
            image_full VARCHAR(255) NOT NULL,
            sort_order INT NOT NULL DEFAULT 0,
            active TINYINT(1) NOT NULL DEFAULT 1,
            INDEX idx_active (active)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    // website-Spalte nachrüsten falls Tabelle schon existierte
    $colCheck = $mysqli->query("SHOW COLUMNS FROM ref_logos LIKE 'website'");
    if ($colCheck && $colCheck->num_rows === 0) {
        $mysqli->query("ALTER TABLE ref_logos ADD COLUMN website VARCHAR(255) DEFAULT NULL AFTER name");
    }
    // Bestehende Logos eintragen falls DB noch leer
    $rlCheck = $mysqli->query("SELECT COUNT(*) AS c FROM ref_logos");
    if ((int)($rlCheck->fetch_assoc()['c'] ?? 0) === 0) {
        $now = date('Y-m-d H:i:s');
        $existingLogos = [
            ['Dallmayr Catering',        'logo_dallmayr_catering.png',        'logo_dallmayr_catering_full.png'],
            ['Stück vom Glück',          'logo_stueck_vom_glueck.png',        'logo_stueck_vom_glueck_full.png'],
            ['SiMontagen',               'logo_simontagen.png',               'logo_simontagen_full.png'],
            ['ESMT Berlin GmbH',         'logo_esmt_berlin_gmbh.png',        'logo_esmt_berlin_gmbh_full.png'],
            ['Chromhelden UG',           'logo_chromhelden_ug.png',          'logo_chromhelden_ug_full.png'],
            ['Motor Kommunikation GmbH', 'logo_motor_kommunikation_gmbh.png','logo_motor_kommunikation_gmbh_full.png'],
            ['Motoo eG',                 'logo_motoo_eg.png',                'logo_motoo_eg_full.png'],
            ['Defence Lab',              'logo_defence_lab.png',             'logo_defence_lab_full.png'],
            ['DETA MED',                 'logo_deta_med.png',                'logo_deta_med_full.png'],
            ['Gerdt Architektur',        'logo_gerdt_architektur.png',       'logo_gerdt_architektur_full.png'],
            ['DB Bahnbau',               'logo_db_bahnbau.png',              'logo_db_bahnbau_full.png'],
            ['MP Print + Webdesign',     'logo_mp_print_plus_webdesign.png', 'logo_mp_print_plus_webdesign_full.png'],
            ['MR GmbH',                  'logo_mr_gmbh.png',                 'logo_mr_gmbh_full.png'],
            ["Delo's Smash Burger",      'logo_delos_smash_burger.png',      'logo_delos_smash_burger_full.png'],
            ['Kral Elektrotechnik GmbH', 'logo_kral_elektrotechnik_gmbh.png','logo_kral_elektrotechnik_gmbh_full.png'],
            ['Printec-Direkt',           'logo_printec_direkt.png',          'logo_printec_direkt_full.png'],
        ];
        $stmt = $mysqli->prepare("INSERT INTO ref_logos (created_at, name, image_small, image_full, sort_order, active) VALUES (?,?,?,?,?,1)");
        foreach ($existingLogos as $i => $logo) {
            $stmt->bind_param('ssssi', $now, $logo[0], $logo[1], $logo[2], $i);
            $stmt->execute();
        }
        $stmt->close();
    }

    // Impressionen (Portfolio-Bilder)
    $mysqli->query("
        CREATE TABLE IF NOT EXISTS impressionen (
            id INT AUTO_INCREMENT PRIMARY KEY,
            created_at DATETIME NOT NULL,
            image VARCHAR(255) NOT NULL,
            caption VARCHAR(255) DEFAULT NULL,
            sort_order INT NOT NULL DEFAULT 0,
            active TINYINT(1) NOT NULL DEFAULT 1,
            INDEX idx_active (active)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    // Bestehende Bilder eintragen falls DB noch leer
    $impCheck = $mysqli->query("SELECT COUNT(*) AS c FROM impressionen");
    if ((int)($impCheck->fetch_assoc()['c'] ?? 0) === 0) {
        $now = date('Y-m-d H:i:s');
        $stmt = $mysqli->prepare("INSERT INTO impressionen (created_at, image, caption, sort_order, active) VALUES (?,?,?,?,1)");
        for ($i = 1; $i <= 12; $i++) {
            $img = "beispiel{$i}.jpg";
            $cap = "";
            $stmt->bind_param('sssi', $now, $img, $cap, $i);
            $stmt->execute();
        }
        $stmt->close();
    }

    // Video-Support für Impressionen nachrüsten
    $colCheck = $mysqli->query("SHOW COLUMNS FROM impressionen LIKE 'media_type'");
    if ($colCheck && $colCheck->num_rows === 0) {
        $mysqli->query("ALTER TABLE impressionen ADD COLUMN media_type VARCHAR(10) NOT NULL DEFAULT 'image' AFTER image");
    }
    $colCheck = $mysqli->query("SHOW COLUMNS FROM impressionen LIKE 'video_thumb'");
    if ($colCheck && $colCheck->num_rows === 0) {
        $mysqli->query("ALTER TABLE impressionen ADD COLUMN video_thumb VARCHAR(255) DEFAULT NULL AFTER media_type");
    }

    // Feste Referenzkunden-Bewertungen (die 3 großen im Slider)
    $mysqli->query("
        CREATE TABLE IF NOT EXISTS static_reviews (
            id INT AUTO_INCREMENT PRIMARY KEY,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            name VARCHAR(255) NOT NULL,
            company VARCHAR(255) DEFAULT NULL,
            text TEXT NOT NULL,
            sort_order INT NOT NULL DEFAULT 0,
            active TINYINT(1) NOT NULL DEFAULT 1,
            INDEX idx_active (active)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    // Rechtstexte: neues Impressum und neue Datenschutzerklärung (Stand Oktober 2026) einmalig übernehmen
    wf_legal_update_2026($mysqli);

    // Rechtstexte: Ortsteil Vilsbæk in der Adresse ergänzen (einmalig, danach findet die Abfrage nichts mehr)
    if ($mysqli->query("SHOW TABLES LIKE 'legal_texts'")->num_rows) {
        foreach (['content_de', 'content_da', 'content_en'] as $col) {
            $mysqli->query("UPDATE legal_texts SET $col = REPLACE($col, 'Teglgård 1, 6330 Padborg', 'Teglgård 1, Vilsbæk, 6330 Padborg') WHERE $col LIKE '%Teglgård 1, 6330 Padborg%'");
        }
    }

    // Früher automatisch eingetragene Beispiel-Bewertungen entfernen (keine echten Kunden)
    $mysqli->query("DELETE FROM static_reviews WHERE (name, company) IN (('Michael H.','H&H Montage'),('Lena K.','Event Solutions GmbH'),('Thomas B.','Royal Events'))");

    // Live-Monitor / Push-Benachrichtigungs-Einstellungen
    $mysqli->query("
        CREATE TABLE IF NOT EXISTS notify_settings (
            id INT PRIMARY KEY DEFAULT 1,
            push_enabled TINYINT(1) NOT NULL DEFAULT 0,
            ntfy_topic VARCHAR(128) DEFAULT NULL,
            threshold INT NOT NULL DEFAULT 3,
            cooldown_minutes INT NOT NULL DEFAULT 15,
            last_notified_at DATETIME DEFAULT NULL,
            updated_at DATETIME NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    $result = $mysqli->query("SELECT COUNT(*) AS cnt FROM notify_settings WHERE id = 1");
    if ((int)($result->fetch_assoc()['cnt'] ?? 0) === 0) {
        $now = date('Y-m-d H:i:s');
        $stmt = $mysqli->prepare("INSERT INTO notify_settings (id, push_enabled, ntfy_topic, threshold, cooldown_minutes, updated_at) VALUES (1, 0, NULL, 3, 15, ?)");
        $stmt->bind_param('s', $now);
        $stmt->execute();
        $stmt->close();
    }

    // Shop-Einstellungen (z.B. veröffentlicht ja/nein)
    $mysqli->query("
        CREATE TABLE IF NOT EXISTS shop_settings (
            id INT PRIMARY KEY DEFAULT 1,
            published TINYINT(1) NOT NULL DEFAULT 0,
            updated_at DATETIME NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    $result = $mysqli->query("SELECT COUNT(*) AS cnt FROM shop_settings WHERE id = 1");
    if ((int)($result->fetch_assoc()['cnt'] ?? 0) === 0) {
        $now = date('Y-m-d H:i:s');
        $stmt = $mysqli->prepare("INSERT INTO shop_settings (id, published, updated_at) VALUES (1, 0, ?)");
        $stmt->bind_param('s', $now);
        $stmt->execute();
        $stmt->close();
    }
    $result = $mysqli->query("SELECT COUNT(*) AS cnt FROM admin_users");
    $cnt = (int)($result->fetch_assoc()['cnt'] ?? 0);
    if ($cnt === 0) {
        $defaultUser = 'admin';
        $defaultPass = 'wunschfabrik2026'; // BITTE NACH ERSTEM LOGIN ÄNDERN!
        $hash = password_hash($defaultPass, PASSWORD_DEFAULT);
        $now = date('Y-m-d H:i:s');
        $stmt = $mysqli->prepare("INSERT INTO admin_users (username, password_hash, created_at) VALUES (?, ?, ?)");
        $stmt->bind_param('sss', $defaultUser, $hash, $now);
        $stmt->execute();
        $stmt->close();
    }

    wf_ensure_team_tables($mysqli);
    wf_ensure_legal_texts_table($mysqli);
    wf_ensure_site_texts_table($mysqli);
    wf_ensure_popup_settings_table($mysqli);
}

// ─── MITARBEITER / RECHTE ─────────────────────────────────────────

/**
 * Bereiche des Admin-Bereichs. Schlüssel = Reiter-Name in admin.html.
 * Der Inhaber (Rolle "admin") darf alles, Mitarbeiter nur die angehakten Bereiche.
 */
function wf_admin_areas() {
    return [
        'overview'     => 'Übersicht & Besucher',
        'inquiries'    => 'Anfragen',
        'auftraege'    => 'Aufträge & Rechnungen',
        'reviews'      => 'Bewertungen',
        'impressionen' => 'Impressionen',
        'logos'        => 'Kunden-Logos',
        'workshop'     => 'Werkstatt-Fotos',
        'shop'         => 'Shop',
        'sitetexts'    => 'Website-Texte',
        'legal'        => 'Rechtstexte',
        'popup'        => 'Popup',
        'spiele'       => 'Spiele & Gutscheine',
    ];
}

/** Standard-Rechte für neue Mitarbeiter. */
function wf_admin_default_perms() {
    return ['overview', 'inquiries', 'auftraege', 'workshop'];
}

function wf_ensure_team_tables($mysqli) {
    // admin_users um Mitarbeiter-Felder erweitern (einmalig)
    $have = [];
    $res = $mysqli->query("SHOW COLUMNS FROM admin_users");
    while ($res && ($c = $res->fetch_assoc())) $have[$c['Field']] = true;
    $add = [
        'display_name' => "VARCHAR(100) NOT NULL DEFAULT ''",
        'email'        => "VARCHAR(255) NOT NULL DEFAULT ''",
        'role'         => "VARCHAR(20) NOT NULL DEFAULT 'admin'",
        'perms'        => "TEXT NULL",
        'color'        => "VARCHAR(16) NOT NULL DEFAULT '#A855F7'",
        'active'       => "TINYINT(1) NOT NULL DEFAULT 1",
        'last_login'   => "DATETIME NULL",
        'created_by'   => "VARCHAR(100) NOT NULL DEFAULT ''",
    ];
    foreach ($add as $col => $def) {
        if (!isset($have[$col])) {
            $mysqli->query("ALTER TABLE admin_users ADD COLUMN $col $def");
        }
    }

    // Fehlversuche beim Login (Schutz gegen Passwort-Raten)
    $mysqli->query("
        CREATE TABLE IF NOT EXISTS admin_login_attempts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            ip VARCHAR(64) NOT NULL,
            username VARCHAR(64) NOT NULL DEFAULT '',
            at DATETIME NOT NULL,
            INDEX idx_ip_at (ip, at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    // Aktivitäten: wer hat wann was im Admin-Bereich gemacht
    $mysqli->query("
        CREATE TABLE IF NOT EXISTS admin_activity (
            id INT AUTO_INCREMENT PRIMARY KEY,
            at DATETIME NOT NULL,
            user_id INT NULL,
            user_name VARCHAR(100) NOT NULL DEFAULT '',
            area VARCHAR(32) NOT NULL DEFAULT '',
            what VARCHAR(255) NOT NULL,
            INDEX idx_at (at),
            INDEX idx_user (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
}

/** Angemeldeter Admin-Benutzer (aus der DB, damit Sperren sofort wirken) oder null. */
function wf_admin_current($mysqli) {
    static $cache = [];
    $id = (int)($_SESSION['wf_admin_id'] ?? 0);
    if ($id <= 0) return null;
    if (array_key_exists($id, $cache)) return $cache[$id];
    $stmt = $mysqli->prepare("SELECT id, username, display_name, role, perms, color, active FROM admin_users WHERE id = ?");
    if (!$stmt) return $cache[$id] = null;
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $u = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$u || !(int)$u['active']) {
        return $cache[$id] = null;
    }
    $u['perms'] = $u['role'] === 'admin' ? array_keys(wf_admin_areas()) : (json_decode((string)$u['perms'], true) ?: []);
    $u['name'] = $u['display_name'] !== '' ? $u['display_name'] : $u['username'];
    return $cache[$id] = $u;
}

/**
 * Darf der angemeldete Benutzer diesen Bereich bearbeiten?
 * Ohne $area: irgendein gültiger, aktiver Admin-Login.
 */
function wf_admin_can($area = null, $mysqli = null) {
    if (empty($_SESSION['wf_admin_id'])) return false;
    if (!$mysqli) $mysqli = wf_db_connect();
    if (!$mysqli) return false;
    $u = wf_admin_current($mysqli);
    if (!$u) return false;
    if ($area === null || $u['role'] === 'admin') return true;
    return in_array($area, $u['perms'], true);
}

/** Eintrag ins Aktivitäten-Protokoll. */
function wf_admin_log($mysqli, $area, $what) {
    $u = wf_admin_current($mysqli);
    $now = date('Y-m-d H:i:s');
    $uid = $u ? (int)$u['id'] : null;
    $name = $u ? $u['name'] : '';
    $what = mb_substr((string)$what, 0, 255);
    $stmt = $mysqli->prepare("INSERT INTO admin_activity (at, user_id, user_name, area, what) VALUES (?, ?, ?, ?, ?)");
    if ($stmt) {
        $stmt->bind_param('sisss', $now, $uid, $name, $area, $what);
        $stmt->execute();
        $stmt->close();
    }
}

/**
 * $name = Anzeigename aus dem Admin-Bereich (leer = Namen in der App nicht ändern).
 * Überträgt einen Mitarbeiter in die Auftrags-App (auftraege/), damit dort bei
 * jedem Auftrag, jeder Rechnung und jedem Beleg der richtige Name steht.
 * Gesperrte Mitarbeiter oder solche ohne Recht "Aufträge" werden dort deaktiviert
 * und ihre gemerkten Geräte abgemeldet.
 */
function wf_orders_app_sync($adminId, $name, $enabled) {
    $cfgFile = __DIR__ . '/auftraege/inc/config.php';
    if (!is_file($cfgFile) || !extension_loaded('pdo_sqlite')) return false;
    try {
        $cfg = require $cfgFile;
        $local = __DIR__ . '/auftraege/inc/config.local.php';
        if (is_file($local)) $cfg = array_replace($cfg, require $local);
        $dbFile = rtrim((string)$cfg['data_dir'], '/') . '/auftraege.sqlite';
        if (!is_file($dbFile)) return false;   // App wurde noch nie geöffnet – legt den Benutzer selbst an
        $pdo = new PDO('sqlite:' . $dbFile, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $pdo->exec('PRAGMA busy_timeout = 5000');
        $wid = (string)(int)$adminId;
        $name = mb_substr(trim((string)$name), 0, 60);
        $st = $pdo->prepare('SELECT id FROM users WHERE wf_admin_id = ?');
        $st->execute([$wid]);
        $uid = $st->fetchColumn();
        if ($uid && $name !== '') {
            $pdo->prepare('UPDATE users SET name = ?, active = ? WHERE id = ?')->execute([$name, $enabled ? 1 : 0, $uid]);
        } elseif ($uid) {
            // Noch kein Name im Admin-Bereich: den in der App eingetragenen Namen behalten
            $pdo->prepare('UPDATE users SET active = ? WHERE id = ?')->execute([$enabled ? 1 : 0, $uid]);
        } else {
            // Gesperrte bekommen einen inaktiven Eintrag, damit gemerkte Geräte nicht mehr reinkommen
            $pdo->prepare('INSERT INTO users (name, wf_admin_id, active) VALUES (?, ?, ?)')->execute([$name !== '' ? $name : 'Admin ' . $wid, $wid, $enabled ? 1 : 0]);
        }
        if (!$enabled) {
            $pdo->prepare('DELETE FROM app_devices WHERE admin_id = ?')->execute([$wid]);
        }
        return true;
    } catch (Throwable $e) {
        return false;
    }
}

/**
 * Sendet eine E-Mail an den Kunden, je nach Sprache und Anlass
 * (Eingangsbestätigung, in Bearbeitung, erledigt).
 */
function wf_send_customer_mail($toEmail, $toName, $lang, $type) {
    $lang = in_array($lang, ['de', 'da', 'en'], true) ? $lang : 'de';

    $texts = [
        'received' => [
            'de' => [
                'subject' => 'Wir haben deine Anfrage erhalten – Wunsch-Fabrik.dk',
                'body' => "Hallo {name},\n\nvielen Dank für deine Anfrage bei Wunsch-Fabrik.dk! Wir haben deine Nachricht erhalten und melden uns schnellstmöglich bei dir.\n\nLiebe Grüße\nDein Wunsch-Fabrik-Team",
            ],
            'da' => [
                'subject' => 'Vi har modtaget din forespørgsel – Wunsch-Fabrik.dk',
                'body' => "Hej {name},\n\ntak for din forespørgsel hos Wunsch-Fabrik.dk! Vi har modtaget din besked og vender tilbage til dig hurtigst muligt.\n\nMange hilsner\nDit Wunsch-Fabrik team",
            ],
            'en' => [
                'subject' => "We've received your enquiry – Wunsch-Fabrik.dk",
                'body' => "Hi {name},\n\nthank you for reaching out to Wunsch-Fabrik.dk! We've received your message and will get back to you as soon as possible.\n\nBest regards\nThe Wunsch-Fabrik Team",
            ],
        ],
        'in_progress' => [
            'de' => [
                'subject' => 'Dein Auftrag ist in Bearbeitung – Wunsch-Fabrik.dk',
                'body' => "Hallo {name},\n\ngute Nachrichten: Wir haben mit der Bearbeitung deines Auftrags begonnen! Sobald alles fertig ist, melden wir uns wieder bei dir.\n\nLiebe Grüße\nDein Wunsch-Fabrik-Team",
            ],
            'da' => [
                'subject' => 'Din bestilling er under behandling – Wunsch-Fabrik.dk',
                'body' => "Hej {name},\n\ngode nyheder: Vi er begyndt at behandle din bestilling! Så snart alt er færdigt, hører du fra os igen.\n\nMange hilsner\nDit Wunsch-Fabrik team",
            ],
            'en' => [
                'subject' => 'Your order is now in progress – Wunsch-Fabrik.dk',
                'body' => "Hi {name},\n\ngood news: we've started working on your order! We'll be in touch again as soon as it's ready.\n\nBest regards\nThe Wunsch-Fabrik Team",
            ],
        ],
        'done' => [
            'de' => [
                'subject' => 'Dein Auftrag ist fertig – Wunsch-Fabrik.dk',
                'body' => "Hallo {name},\n\ndein Auftrag ist fertiggestellt und wird zeitnah versendet bzw. zur Abholung bereitgestellt! Wir hoffen, du freust dich genauso wie wir über das Ergebnis.\n\nLiebe Grüße\nDein Wunsch-Fabrik-Team",
            ],
            'da' => [
                'subject' => 'Din bestilling er færdig – Wunsch-Fabrik.dk',
                'body' => "Hej {name},\n\ndin bestilling er nu færdig og bliver afsendt eller klargjort til afhentning meget snart! Vi håber, du bliver lige så glad for resultatet som os.\n\nMange hilsner\nDit Wunsch-Fabrik team",
            ],
            'en' => [
                'subject' => 'Your order is complete – Wunsch-Fabrik.dk',
                'body' => "Hi {name},\n\nyour order is now complete and will be shipped or ready for pickup shortly! We hope you're as happy with the result as we are.\n\nBest regards\nThe Wunsch-Fabrik Team",
            ],
        ],
    ];

    if (!isset($texts[$type][$lang])) return false;

    $subject = $texts[$type][$lang]['subject'];
    $body = str_replace('{name}', $toName, $texts[$type][$lang]['body']);

    $headers  = "From: Wunsch-Fabrik.dk <hej@wunsch-fabrik.dk>\r\n";
    $headers .= "Reply-To: hej@wunsch-fabrik.dk\r\n";
    $headers .= "Content-Type: text/plain; charset=UTF-8\r\n";

    return @mail($toEmail, $subject, $body, $headers);
}

/**
 * Ermittelt das Land eines Besuchers OHNE die IP-Adresse an Dritte zu schicken:
 * 1. Zeitzone des Browsers (Parameter tz, z. B. "Europe/Copenhagen") → Land
 * 2. sonst die Region aus der Browsersprache (Accept-Language, z. B. "de-AT" → AT)
 * Der Parameter $ip wird nicht mehr verwendet (früher: Abfrage bei ip-api.com).
 * Gibt ['country', 'country_code', 'region' => null, 'city' => null] zurück oder null.
 */
function wf_geolocate_ip($ip = null) {
    $code = null;
    $tz = (string)($_REQUEST['tz'] ?? '');
    if ($tz !== '' && preg_match('#^[A-Za-z_]+(/[A-Za-z0-9_+\-]+){1,2}$#', $tz)) {
        try {
            $loc = (new DateTimeZone($tz))->getLocation();
            if (!empty($loc['country_code']) && $loc['country_code'] !== '??') $code = strtoupper($loc['country_code']);
        } catch (Exception $e) {
            $code = null;
        }
    }
    if (!$code && preg_match('/^[a-z]{2,3}-([A-Z]{2})\b/i', (string)($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? ''), $m)) {
        $code = strtoupper($m[1]);
    }
    if (!$code) return null;
    return ['country' => wf_country_name($code), 'country_code' => $code, 'region' => null, 'city' => null];
}

/**
 * Löschfristen aus der Datenschutzerklärung umsetzen (läuft einmal pro Tag):
 * Besucherstatistik 14 Monate, Kontaktanfragen 12 Monate, IP-Adressen bei Spielen/Gutscheinen 30 Tage.
 */
function wf_privacy_cleanup($mysqli) {
    $mysqli->query("DELETE FROM visits WHERE last_seen < (NOW() - INTERVAL 14 MONTH)");
    $mysqli->query("DELETE FROM inquiries WHERE created_at < (NOW() - INTERVAL 12 MONTH)");
    foreach (['game_draws', 'game_vouchers'] as $t) {
        if ($mysqli->query("SHOW TABLES LIKE '$t'")->num_rows) {
            $mysqli->query("UPDATE $t SET ip = NULL WHERE ip IS NOT NULL AND created_at < (NOW() - INTERVAL 30 DAY)");
        }
    }
}

/** Ländername (Deutsch) zum ISO-Code. */
function wf_country_name($code) {
    if (class_exists('Locale')) {
        $n = Locale::getDisplayRegion('-' . $code, 'de');
        if ($n && $n !== $code) return $n;
    }
    $map = ['DK' => 'Dänemark', 'DE' => 'Deutschland', 'AT' => 'Österreich', 'CH' => 'Schweiz', 'SE' => 'Schweden', 'NO' => 'Norwegen',
            'NL' => 'Niederlande', 'BE' => 'Belgien', 'PL' => 'Polen', 'FR' => 'Frankreich', 'GB' => 'Vereinigtes Königreich', 'US' => 'Vereinigte Staaten'];
    return $map[$code] ?? $code;
}

/**
 * Tages-Kennung eines Besuchers für die Statistik – ohne Cookie und ohne die IP zu speichern.
 * Aus IP + Browser + einem täglich neuen Zufallswert wird ein Hash gebildet. Der Zufallswert
 * des Vortags wird gelöscht, danach lässt sich der Hash keinem Menschen mehr zuordnen.
 */
function wf_visitor_hash($mysqli) {
    $mysqli->query("CREATE TABLE IF NOT EXISTS visit_salt (day DATE PRIMARY KEY, salt CHAR(64) NOT NULL) ENGINE=InnoDB");
    $today = date('Y-m-d');
    $mysqli->query("DELETE FROM visit_salt WHERE day < '$today'");
    $res = $mysqli->query("SELECT salt FROM visit_salt WHERE day = '$today'");
    $row = $res ? $res->fetch_assoc() : null;
    if (!$row) {
        $salt = bin2hex(random_bytes(32));
        $mysqli->query("INSERT IGNORE INTO visit_salt (day, salt) VALUES ('$today', '$salt')");
        wf_privacy_cleanup($mysqli);   // einmal am Tag: alte Daten löschen, wie in der Datenschutzerklärung zugesagt
        $res = $mysqli->query("SELECT salt FROM visit_salt WHERE day = '$today'");
        $row = $res ? $res->fetch_assoc() : ['salt' => $salt];
    }
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? '');
    $ua = substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 300);
    return substr(hash('sha256', $row['salt'] . '|' . $ip . '|' . $ua), 0, 40);
}

/**
 * Sendet eine einfache Push-Benachrichtigung über ntfy.sh,
 * sofern Push aktiviert und ein Topic eingetragen ist.
 * Ignoriert Schwellenwert/Cooldown der Besucherzahl-Benachrichtigung
 * (wird z.B. für neue Bewertungen oder neue Anfragen genutzt).
 */
function wf_send_push($mysqli, $message, $title = 'Wunsch-Fabrik.dk', $tags = 'bell') {
    $result = $mysqli->query("SELECT push_enabled, ntfy_topic FROM notify_settings WHERE id = 1");
    $settings = $result ? $result->fetch_assoc() : null;
    if (!$settings) return;
    if (!(int)$settings['push_enabled']) return;
    if (empty($settings['ntfy_topic'])) return;

    $topic = $settings['ntfy_topic'];

    $ch = curl_init("https://ntfy.sh/" . rawurlencode($topic));
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $message);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Title: ' . $title,
        'Priority: default',
        'Tags: ' . $tags,
    ]);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 3);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 2);
    @curl_exec($ch);
    curl_close($ch);
}

/**
 * Prüft, ob die aktuelle "Online jetzt"-Zahl den eingestellten
 * Schwellenwert überschreitet, und sendet bei Bedarf eine
 * Push-Benachrichtigung über ntfy.sh (mit Cooldown, um Spam zu vermeiden).
 */
function wf_check_push_notification($mysqli, $onlineCount) {
    $result = $mysqli->query("SELECT * FROM notify_settings WHERE id = 1");
    $settings = $result ? $result->fetch_assoc() : null;
    if (!$settings) return;

    if (!(int)$settings['push_enabled']) return;
    if (empty($settings['ntfy_topic'])) return;
    if ($onlineCount < (int)$settings['threshold']) return;

    // Cooldown prüfen: nicht öfter als alle X Minuten benachrichtigen
    $cooldown = (int)$settings['cooldown_minutes'];
    if (!empty($settings['last_notified_at'])) {
        $lastNotified = strtotime($settings['last_notified_at']);
        $secondsSince = time() - $lastNotified;
        if ($secondsSince < ($cooldown * 60)) return;
    }

    // Push senden
    $topic = $settings['ntfy_topic'];
    $threshold = (int)$settings['threshold'];
    $title = 'Wunsch-Fabrik.dk';
    $message = "🔥 $onlineCount Besucher gleichzeitig online! (Schwelle: $threshold)";

    $ch = curl_init("https://ntfy.sh/" . rawurlencode($topic));
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $message);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Title: ' . $title,
        'Priority: high',
        'Tags: chart_with_upwards_trend',
    ]);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 3);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 2);
    @curl_exec($ch);
    curl_close($ch);

    // Cooldown-Zeitpunkt speichern
    $now = date('Y-m-d H:i:s');
    $stmt = $mysqli->prepare("UPDATE notify_settings SET last_notified_at = ? WHERE id = 1");
    $stmt->bind_param('s', $now);
    $stmt->execute();
    $stmt->close();
}

// ─── Rechtstexte (Impressum, AGB, Datenschutz) ──────────────────────
// DE ist der Master-Text (vom Kunden im Admin editiert), DA/EN werden
// per DeepL automatisch übersetzt und hier als Cache mitgespeichert.
/**
 * Übernimmt einmalig Impressum und Datenschutzerklärung aus legal_texts_2026.php
 * und ersetzt in allen Rechtstexten die Telefonnummer durch das Bild ([TELEFON])
 * sowie den Platzhalter der CVR-Nummer in den AGB. Danach nie wieder (Merker in wf_meta).
 */
function wf_legal_update_2026($mysqli) {
    $mysqli->query("CREATE TABLE IF NOT EXISTS wf_meta (k VARCHAR(64) PRIMARY KEY, v VARCHAR(255) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $done = $mysqli->query("SELECT v FROM wf_meta WHERE k = 'legal_2026'");
    if (($done && $done->num_rows) || !$mysqli->query("SHOW TABLES LIKE 'legal_texts'")->num_rows) return;
    $file = __DIR__ . '/legal_texts_2026.php';
    if (!is_file($file)) return;
    $texts = require $file;
    foreach ($texts as $type => $t) {
        $stmt = $mysqli->prepare("UPDATE legal_texts SET title_de = ?, content_de = ?, title_da = ?, content_da = ?, title_en = ?, content_en = ? WHERE type = ?");
        $stmt->bind_param('sssssss', $t['title_de'], $t['content_de'], $t['title_da'], $t['content_da'], $t['title_en'], $t['content_en'], $type);
        $stmt->execute();
        $stmt->close();
    }
    foreach (['content_de', 'content_da', 'content_en'] as $col) {
        foreach (['+45 939 00 939', '+45 93900939', '+4593900939'] as $num) {
            $mysqli->query("UPDATE legal_texts SET $col = REPLACE($col, '$num', '[TELEFON]')");
        }
        $mysqli->query("UPDATE legal_texts SET $col = REPLACE($col, '[CVR-NUMMER EINTRAGEN]', '46733428')");
    }
    $mysqli->query("INSERT INTO wf_meta (k, v) VALUES ('legal_2026', NOW())");
}

function wf_ensure_legal_texts_table($mysqli) {
    $mysqli->query("
        CREATE TABLE IF NOT EXISTS legal_texts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            type VARCHAR(20) NOT NULL UNIQUE,
            title_de VARCHAR(255) NOT NULL,
            content_de MEDIUMTEXT NOT NULL,
            title_da VARCHAR(255),
            content_da MEDIUMTEXT,
            title_en VARCHAR(255),
            content_en MEDIUMTEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    // Einmalig mit den bisherigen fest codierten Texten befüllen, falls leer
    $check = $mysqli->query("SELECT COUNT(*) AS c FROM legal_texts");
    if ((int)($check->fetch_assoc()['c'] ?? 0) === 0) {
        $seed = [
            [
                'type' => 'impressum',
                'title_de' => 'Impressum',
                'content_de' => "Angaben\nWunsch-Fabrik.dk / Ønske-Fabrik.dk\nTeglgård 1, Vilsbæk, 6330 Padborg, Dänemark\n\nKontakt\nTel: +45 939 00 939\nE-Mail: hej@wunsch-fabrik.dk\n\nCVR-Nr.\n[CVR-NUMMER EINTRAGEN]\n\nVerantwortlich\nJeannine Fuhlbrügge, Teglgård 1, Vilsbæk, 6330 Padborg\n\nHaftungsausschluss\nTrotz sorgfältiger Kontrolle übernehmen wir keine Haftung für externe Links. Für den Inhalt verlinkter Seiten sind ausschließlich deren Betreiber verantwortlich.",
                'title_da' => 'Impressum',
                'content_da' => "Oplysninger\nWunsch-Fabrik.dk / Ønske-Fabrik.dk\nTeglgård 1, Vilsbæk, 6330 Padborg, Danmark\n\nKontakt\nTlf: +45 939 00 939\nE-mail: hej@wunsch-fabrik.dk\n\nCVR-nr.\n[CVR-NUMMER INDSÆT]\n\nAnsvarlig\nJeannine Fuhlbrügge, Teglgård 1, Vilsbæk, 6330 Padborg\n\nAnsvarsfraskrivelse\nPå trods af omhyggelig kontrol påtager vi os intet ansvar for indholdet af eksterne links. Indholdet af linkede sider er udelukkende operatørernes ansvar.",
                'title_en' => 'Legal Notice',
                'content_en' => "Company Details\nWunsch-Fabrik.dk / Ønske-Fabrik.dk\nTeglgård 1, Vilsbæk, 6330 Padborg, Denmark\n\nContact\nPhone: +45 939 00 939\nEmail: hej@wunsch-fabrik.dk\n\nCVR No.\n[CVR NUMBER TO BE ADDED]\n\nResponsible for content\nJeannine Fuhlbrügge, Teglgård 1, Vilsbæk, 6330 Padborg\n\nDisclaimer\nDespite careful checks, we accept no liability for the content of external links. The operators of linked pages are solely responsible for their content.",
            ],
            [
                'type' => 'agb',
                'title_de' => 'Allgemeine Geschäftsbedingungen',
                'content_de' => "1. Anbieter\nWunsch-Fabrik.dk / Ønske-Fabrik.dk\nInhaber: Jeannine Fuhlbrügge (Einzelunternehmen)\nTeglgård 1, Vilsbæk, 6330 Padborg, Dänemark\nE-Mail: hej@wunsch-fabrik.dk · Tel: +45 939 00 939\nCVR: [CVR-NUMMER EINTRAGEN]\n\n2. Geltungsbereich\nDiese AGB gelten für alle Bestellungen und Verträge zwischen Wunsch-Fabrik.dk / Ønske-Fabrik.dk und Privatkunden sowie Unternehmen innerhalb der Europäischen Union.\n\n3. Leistungen und Produkte\nWir bieten insbesondere folgende Leistungen an: Stickerei · Plotten/Textilveredelung · DTF-Druck · Siebdruck · Lasergravuren · Sublimationsdruck · Personalisierte Produkte und Sonderanfertigungen. Alle Angebote sind freibleibend.\n\n4. Vertragsschluss\nDie Präsentation von Produkten oder Dienstleistungen stellt kein verbindliches Angebot dar. Ein Vertrag kommt erst zustande durch: schriftliche Auftragsbestätigung · Produktionsfreigabe · Versand der Ware · oder Beginn der Produktion.\n\n5. Preise und Zahlung\nAlle Preise verstehen sich in der jeweils angegebenen Währung. Akzeptierte Zahlungsarten: Überweisung · PayPal · MobilePay. Die Produktion kann erst nach Zahlungseingang oder gesonderter Vereinbarung beginnen.\n\n6. Gestaltung, Dateien und Freigaben\nDer Kunde ist verantwortlich für hochgeladene Dateien, Logos, Schriftarten, Bildrechte und Markenrechte. Der Kunde bestätigt, dass die Nutzung der übermittelten Daten zulässig ist. Produktionsfreigaben gelten als verbindlich. Nach Freigabe übernommene Fehler gehen nicht zu Lasten von Wunsch-Fabrik.dk.\n\n7. Personalisierte Produkte / Widerrufsausschluss\nPersonalisierte, individuell angefertigte oder kundenspezifisch produzierte Produkte sind vom Widerrufsrecht ausgeschlossen. Ein Umtausch oder eine Rückgabe ist ausgeschlossen, sofern kein Produktionsfehler oder nachweisbarer Fehler unsererseits vorliegt.\n\n8. Lieferzeiten und Versand\nWir liefern EU-weit. Lieferzeiten sind unverbindlich, sofern nicht ausdrücklich anders vereinbart. Verzögerungen durch Lieferanten, Versanddienstleister, höhere Gewalt oder fehlerhafte Kundendaten verlängern die Lieferzeit entsprechend.\n\n9. Reklamationen\nReklamationen müssen unverzüglich nach Erhalt gemeldet werden. Folgende Punkte stellen keinen Mangel dar: geringe Farbabweichungen · leichte Positionsabweichungen · materialbedingte Unterschiede · Abweichungen zwischen Bildschirm und Endprodukt.\n\n10. Haftung\nWir haften nur für Vorsatz und grobe Fahrlässigkeit. Für vom Kunden gelieferte Dateien, Logos oder Inhalte übernehmen wir keine Haftung.\n\n11. Eigentumsvorbehalt\nDie Ware bleibt bis zur vollständigen Bezahlung Eigentum von Wunsch-Fabrik.dk / Ønske-Fabrik.dk.\n\n12. Anwendbares Recht\nEs gilt dänisches Recht. Zwingende Verbraucherschutzrechte des Wohnsitzlandes des Kunden bleiben unberührt.",
                'title_da' => 'Handelsbetingelser',
                'content_da' => "1. Udbyder\nWunsch-Fabrik.dk / Ønske-Fabrik.dk\nIndehaver: Jeannine Fuhlbrügge (enkeltmandsvirksomhed)\nTeglgård 1, Vilsbæk, 6330 Padborg, Danmark\nE-mail: hej@wunsch-fabrik.dk · Tlf: +45 939 00 939\nCVR: [CVR-NUMMER INDSÆT]\n\n2. Anvendelsesområde\nDisse betingelser gælder for alle ordrer og kontrakter mellem Wunsch-Fabrik.dk / Ønske-Fabrik.dk og privatkunder samt virksomheder inden for Den Europæiske Union.\n\n3. Ydelser og produkter\nVi tilbyder bl.a.: Broderi · Plotning/tekstilforædling · DTF-tryk · Silketryk · Lasergravering · Sublimationstryk · Personaliserede produkter og specialfremstilling. Alle tilbud er uforpligtende.\n\n4. Aftaleindgåelse\nPræsentation af produkter eller ydelser udgør ikke et bindende tilbud. En aftale indgås først ved: skriftlig ordrebekræftelse · produktionsgodkendelse · afsendelse af varen · eller påbegyndelse af produktion.\n\n5. Priser og betaling\nAlle priser er i den angivne valuta. Accepterede betalingsmetoder: Bankoverførsel · PayPal · MobilePay. Produktionen kan først påbegyndes efter betaling eller særskilt aftale.\n\n6. Design, filer og godkendelser\nKunden er ansvarlig for uploadede filer, logoer, skrifttyper, billedrettigheder og varemærkerettigheder. Kunden bekræfter, at brugen af de indsendte data er lovlig. Produktionsgodkendelser er bindende. Fejl opstået efter godkendelse er ikke Wunsch-Fabrik.dk's ansvar.\n\n7. Personaliserede produkter / fortrydelsesret\nPersonaliserede, individuelt fremstillede eller kundespecifikke produkter er undtaget fra fortrydelsesretten. Ombytning eller returnering er udelukket, medmindre der foreligger en produktionsfejl eller dokumenteret fejl fra vores side.\n\n8. Leveringstider og forsendelse\nVi leverer i hele EU. Leveringstider er vejledende, medmindre andet er udtrykkeligt aftalt. Forsinkelser pga. leverandører, forsendelsestjenester, force majeure eller fejlagtige kundeoplysninger forlænger leveringstiden tilsvarende.\n\n9. Reklamationer\nReklamationer skal meldes straks efter modtagelse. Følgende betragtes ikke som mangler: mindre farveuoverensstemmelser · lettere positionsafvigelser · materialebestemte forskelle · afvigelser mellem skærmbillede og slutprodukt.\n\n10. Ansvar\nVi hæfter kun for forsæt og grov uagtsomhed. Vi påtager os intet ansvar for filer, logoer eller indhold leveret af kunden.\n\n11. Ejendomsforbehold\nVaren forbliver Wunsch-Fabrik.dk / Ønske-Fabrik.dk's ejendom, indtil fuld betaling er modtaget.\n\n12. Lovvalg\nDansk ret er gældende. Ufravigelige forbrugerrettigheder i kundens bopælsland forbliver uberørte.",
                'title_en' => 'Terms & Conditions',
                'content_en' => "1. Provider\nWunsch-Fabrik.dk / Ønske-Fabrik.dk\nOwner: Jeannine Fuhlbrügge (sole trader)\nTeglgård 1, Vilsbæk, 6330 Padborg, Denmark\nEmail: hej@wunsch-fabrik.dk · Phone: +45 939 00 939\nCVR: [CVR NUMBER TO BE ADDED]\n\n2. Scope\nThese terms apply to all orders and contracts between Wunsch-Fabrik.dk / Ønske-Fabrik.dk and private customers as well as businesses within the European Union.\n\n3. Services & Products\nWe offer in particular: Embroidery · Plotting/textile finishing · DTF printing · Screen printing · Laser engraving · Sublimation printing · Personalised products and custom orders. All offers are non-binding.\n\n4. Contract Formation\nThe presentation of products or services does not constitute a binding offer. A contract is only concluded upon: written order confirmation · production approval · dispatch of goods · or commencement of production.\n\n5. Prices & Payment\nAll prices are in the stated currency. Accepted payment methods: Bank transfer · PayPal · MobilePay. Production can only begin after receipt of payment or separate agreement.\n\n6. Design, Files & Approvals\nThe customer is responsible for uploaded files, logos, fonts, image rights and trademark rights. The customer confirms that the use of submitted data is lawful. Production approvals are binding. Errors accepted after approval are not the responsibility of Wunsch-Fabrik.dk.\n\n7. Personalised Products / Right of Withdrawal\nPersonalised, individually manufactured or customer-specific products are excluded from the right of withdrawal. Returns or exchanges are excluded unless a production error or verifiable fault on our part is present.\n\n8. Delivery Times & Shipping\nWe deliver throughout the EU. Delivery times are non-binding unless expressly agreed otherwise. Delays caused by suppliers, shipping services, force majeure or incorrect customer data will extend delivery times accordingly.\n\n9. Complaints\nComplaints must be reported immediately upon receipt. The following do not constitute defects: minor colour deviations · slight positional variations · material-related differences · deviations between screen display and final product.\n\n10. Liability\nWe are only liable for intent and gross negligence. We accept no liability for files, logos or content provided by the customer.\n\n11. Retention of Title\nGoods remain the property of Wunsch-Fabrik.dk / Ønske-Fabrik.dk until full payment has been received.\n\n12. Governing Law\nDanish law applies. Mandatory consumer protection rights of the customer's country of residence remain unaffected.",
            ],
            [
                'type' => 'datenschutz',
                'title_de' => 'Datenschutzerklärung',
                'content_de' => "1. Verantwortliche Stelle\nJeannine Fuhlbrügge, Wunsch-Fabrik.dk\nTeglgård 1, Vilsbæk, 6330 Padborg\nhej@wunsch-fabrik.dk · +45 939 00 939\n\n2. Datenerhebung\nWir erheben personenbezogene Daten nur bei freiwilliger Kontaktaufnahme (Name, E-Mail, Nachricht) zur Bearbeitung deiner Anfrage.\n\n3. Kontaktformular\nNachrichten werden über Formspree (formspree.io) verarbeitet und an unsere E-Mail weitergeleitet. Weitere Infos: formspree.io/legal/privacy-policy\n\n4. Cookies\nKeine Tracking-Cookies. Der localStorage speichert nur deine Spracheinstellung und Bilder – diese Daten verlassen nicht deinen Browser.\n\n5. Deine Rechte\nAuskunft, Berichtigung, Löschung: hej@wunsch-fabrik.dk\n\n6. Externe Dienste\nGoogle Fonts und flagcdn.com übertragen deine IP-Adresse. Mehr: policies.google.com/privacy\n\n7. Beschwerderecht\nDatatilsynet, Danmark – dt.dk",
                'title_da' => 'Privatlivspolitik',
                'content_da' => "1. Dataansvarlig\nJeannine Fuhlbrügge, Wunsch-Fabrik.dk\nTeglgård 1, Vilsbæk, 6330 Padborg\nhej@wunsch-fabrik.dk · +45 939 00 939\n\n2. Indsamling af data\nVi indsamler kun personoplysninger, når du frivilligt kontakter os (navn, e-mail, besked) med henblik på at behandle din henvendelse.\n\n3. Kontaktformular\nBeskeder behandles via Formspree (formspree.io) og videresendes til vores e-mailadresse. Mere info: formspree.io/legal/privacy-policy\n\n4. Cookies\nVi anvender ingen tracking-cookies. localStorage gemmer kun dine sprogindstillinger og billeder – disse data forlader ikke din browser.\n\n5. Dine rettigheder\nIndsigt, berigtigelse, sletning: hej@wunsch-fabrik.dk\n\n6. Eksterne tjenester\nGoogle Fonts og flagcdn.com modtager din IP-adresse. Mere: policies.google.com/privacy\n\n7. Klageadgang\nDatatilsynet, Danmark – dt.dk",
                'title_en' => 'Privacy Policy',
                'content_en' => "1. Data Controller\nJeannine Fuhlbrügge, Wunsch-Fabrik.dk\nTeglgård 1, Vilsbæk, 6330 Padborg\nhej@wunsch-fabrik.dk · +45 939 00 939\n\n2. Data Collection\nWe only collect personal data when you voluntarily contact us (name, email, message) to process your enquiry.\n\n3. Contact Form\nMessages are processed via Formspree (formspree.io) and forwarded to our email. More info: formspree.io/legal/privacy-policy\n\n4. Cookies\nNo tracking cookies are used. localStorage only stores your language preference and images – this data never leaves your browser.\n\n5. Your Rights\nAccess, correction, deletion: hej@wunsch-fabrik.dk\n\n6. External Services\nGoogle Fonts and flagcdn.com receive your IP address. More: policies.google.com/privacy\n\n7. Complaints\nDatatilsynet, Denmark – dt.dk",
            ],
        ];
        $stmt = $mysqli->prepare("INSERT INTO legal_texts (type, title_de, content_de, title_da, content_da, title_en, content_en) VALUES (?,?,?,?,?,?,?)");
        foreach ($seed as $row) {
            $stmt->bind_param('sssssss', $row['type'], $row['title_de'], $row['content_de'], $row['title_da'], $row['content_da'], $row['title_en'], $row['content_en']);
            $stmt->execute();
        }
        $stmt->close();
    }
}

// ─── Produktvorlagen für Preis-Kalkulator ───────────────────────────
function wf_ensure_templates_table($mysqli) {
    $mysqli->query("
        CREATE TABLE IF NOT EXISTS product_templates (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL UNIQUE,
            description TEXT,
            fixed_items JSON,           
            var_items JSON,              
            hour_rate DECIMAL(10,2),
            setup_min INT,
            prod_min INT,
            margin_mode VARCHAR(20),     
            margin_pct DECIMAL(10,2),
            min_margin_pct DECIMAL(10,2),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_name (name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
}

// ─── Website-Haupttexte (Startbereich, Willkommens-Text, Abschnitte, Kontakt) ──
// DE ist der Master-Text (vom Kunden im Admin editiert), DA/EN werden per DeepL
// automatisch übersetzt und hier als Cache mitgespeichert. text_key entspricht
// dem data-i18n-Attribut in index.html, group_key gruppiert die Admin-Tabs.
function wf_ensure_site_texts_table($mysqli) {
    $mysqli->query("
        CREATE TABLE IF NOT EXISTS site_texts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            group_key VARCHAR(30) NOT NULL,
            text_key VARCHAR(60) NOT NULL UNIQUE,
            content_de MEDIUMTEXT NOT NULL,
            content_da MEDIUMTEXT,
            content_en MEDIUMTEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_group (group_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    // Vollständige DE/DA/EN-Werte, identisch zu den ursprünglich fest im
    // JS-Code hinterlegten Standardtexten. Wird sowohl für den Erst-Seed
    // (leere Tabelle) als auch für die Migration bestehender Zeilen mit
    // leerem content_da/content_en genutzt.
    $seed = [
        ['group_key' => 'hero', 'text_key' => 'hero_copy_1',
            'de' => 'Damit', 'da' => 'Så', 'en' => 'So'],
        ['group_key' => 'hero', 'text_key' => 'hero_copy_3',
            'de' => 'kein Wunsch bleiben muss.', 'da' => 'ikke forbliver et ønske.', 'en' => 'doesn\'t stay just a wish.'],
        ['group_key' => 'hero', 'text_key' => 'hero_cta',
            'de' => 'Los geht\'s', 'da' => 'Kom i gang', 'en' => 'Let\'s go'],
        ['group_key' => 'welcome', 'text_key' => 'services_label',
            'de' => 'Was wir für dich tun', 'da' => 'Hvad vi gør for dig', 'en' => 'What we do for you'],
        ['group_key' => 'welcome', 'text_key' => 'services_title',
            'de' => 'Hallo! 👋<br>Schön, dass<br>du da bist.', 'da' => 'Hej! 👋<br>Godt at se dig!', 'en' => 'Hello! 👋<br>Great to<br>have you here.'],
        ['group_key' => 'welcome', 'text_key' => 'services_sub',
            'de' => 'Hinter jedem Stück, das unsere Werkstatt verlässt, steckt mehr als eine Maschine – da stecken wir drin. Mit Liebe zum Detail, echtem Herzblut und dem Anspruch, dass du am Ende sagst: <em style="color: var(--purple-bright); font-style: italic;">Genau so hab ich mir das vorgestellt.</em>',
            'da' => 'Bag hvert stykke, der forlader vores værksted, er der mere end en maskine – der er os. Med kærlighed til detaljen, ægte hjerteblod og kravet om, at du til sidst siger: <em style="color: var(--purple-bright); font-style: italic;">Præcis som jeg forestillede mig det.</em>',
            'en' => 'Behind every piece that leaves our workshop, there\'s more than just a machine – there\'s us. With love for the details, real passion, and the promise that you\'ll say: <em style="color: var(--purple-bright); font-style: italic;">That\'s exactly what I had in mind.</em>'],
        ['group_key' => 'welcome', 'text_key' => 'usp1_title',
            'de' => 'Mit Liebe gemacht', 'da' => 'Lavet med kærlighed', 'en' => 'Made with love'],
        ['group_key' => 'welcome', 'text_key' => 'usp1_text',
            'de' => 'Jedes Stück, das wir anfertigen, behandeln wir so, als wäre es unser eigenes. Kein Auftrag ist bei uns einfach nur ein Auftrag.',
            'da' => 'Hvert stykke vi laver, behandler vi som om det var vores eget. Ingen opgave er bare en opgave hos os.',
            'en' => 'Every piece we create, we treat as if it were our own. No order is ever just an order with us.'],
        ['group_key' => 'welcome', 'text_key' => 'usp2_title',
            'de' => 'Immer für dich da', 'da' => 'Altid her for dig', 'en' => 'Always here for you'],
        ['group_key' => 'welcome', 'text_key' => 'usp2_text',
            'de' => 'Du hast eine Idee, aber noch keinen Plan? Kein Problem. Wir denken mit dir zusammen – von der ersten Skizze bis zum fertigen Ergebnis.',
            'da' => 'Har du en idé, men ingen plan? Ingen problem. Vi tænker med dig – fra første skitse til færdigt resultat.',
            'en' => 'Got an idea but no plan yet? No problem. We think it through with you – from first sketch to finished result.'],
        ['group_key' => 'welcome', 'text_key' => 'usp3_title',
            'de' => 'Hoher Anspruch, ehrliche Arbeit', 'da' => 'Høje krav, ærligt arbejde', 'en' => 'High standards, honest work'],
        ['group_key' => 'welcome', 'text_key' => 'usp3_text',
            'de' => 'Wir geben erst Ruhe, wenn du rundum zufrieden bist. Das ist kein Versprechen – das ist einfach, wie wir arbeiten.',
            'da' => 'Vi giver ikke op, før du er helt tilfreds. Det er ikke et løfte – det er bare sådan, vi arbejder.',
            'en' => 'We don\'t rest until you\'re completely satisfied. That\'s not a promise – it\'s just how we work.'],
        ['group_key' => 'sections', 'text_key' => 'portfolio_label',
            'de' => 'Unsere Arbeit', 'da' => 'Vores arbejde', 'en' => 'Our work'],
        ['group_key' => 'sections', 'text_key' => 'portfolio_title',
            'de' => 'Impressionen', 'da' => 'Impressioner', 'en' => 'Impressions'],
        ['group_key' => 'sections', 'text_key' => 'ref_label',
            'de' => 'Was andere über uns sagen', 'da' => 'Hvad andre siger om os', 'en' => 'What others say about us'],
        ['group_key' => 'sections', 'text_key' => 'ref_title',
            'de' => 'Worte, die uns<br>mit Stolz erfüllen ❤️', 'da' => 'Ord, der<br>fylder os med stolthed ❤️', 'en' => 'Words that<br>fill us with pride ❤️'],
        ['group_key' => 'sections', 'text_key' => 'workshop_label',
            'de' => 'Aus der Werkstatt', 'da' => 'Fra værkstedet', 'en' => 'From the workshop'],
        ['group_key' => 'sections', 'text_key' => 'workshop_title',
            'de' => 'Frisch aus der Werkstatt', 'da' => 'Friskt fra værkstedet', 'en' => 'Fresh from the workshop'],
        ['group_key' => 'sections', 'text_key' => 'faq_label',
            'de' => 'Häufige Fragen', 'da' => 'Ofte stillede spørgsmål', 'en' => 'Frequently Asked Questions'],
        ['group_key' => 'sections', 'text_key' => 'faq_title',
            'de' => 'FAQ', 'da' => 'FAQ', 'en' => 'FAQ'],
        ['group_key' => 'contact', 'text_key' => 'contact_label',
            'de' => 'Lass uns reden', 'da' => 'Lad os tale', 'en' => 'Let\'s talk'],
        ['group_key' => 'contact', 'text_key' => 'contact_title',
            'de' => 'Schreib uns einfach.', 'da' => 'Skriv til os.', 'en' => 'Just write to us.'],
        ['group_key' => 'contact', 'text_key' => 'contact_sub',
            'de' => 'Keine Formulare, die ewig dauern – nur ein kurzes Hallo reicht. Wir melden uns schnell zurück und schauen gemeinsam, was wir für dich tun können.',
            'da' => 'Ingen lange formularer – bare et hurtigt hej. Vi vender hurtigt tilbage og finder ud af, hvad vi kan gøre for dig.',
            'en' => 'No long forms – just a quick hello is enough. We\'ll get back to you quickly and figure out what we can do together.'],
    ];

    $check = $mysqli->query("SELECT COUNT(*) AS c FROM site_texts");
    if ((int)($check->fetch_assoc()['c'] ?? 0) === 0) {
        // Erst-Seed: komplette Tabelle war leer
        $stmt = $mysqli->prepare("INSERT INTO site_texts (group_key, text_key, content_de, content_da, content_en) VALUES (?,?,?,?,?)");
        foreach ($seed as $row) {
            $stmt->bind_param('sssss', $row['group_key'], $row['text_key'], $row['de'], $row['da'], $row['en']);
            $stmt->execute();
        }
        $stmt->close();
    } else {
        // Migration: bestehende Zeilen, deren content_da/content_en noch leer sind
        // (z.B. weil sie vor diesem Fix angelegt wurden, bevor DA/EN mitgespeichert
        // wurden), werden mit den Standard-Übersetzungen nachträglich befüllt.
        // Vom Admin bereits selbst gepflegte Übersetzungen bleiben unangetastet.
        $stmt = $mysqli->prepare("
            UPDATE site_texts
            SET content_da = ?, content_en = ?
            WHERE text_key = ? AND (content_da IS NULL OR content_da = '' OR content_en IS NULL OR content_en = '')
        ");
        foreach ($seed as $row) {
            $stmt->bind_param('sss', $row['da'], $row['en'], $row['text_key']);
            $stmt->execute();
        }
        $stmt->close();
    }
}

// ─── Website-Popup (Sonderangebote, Urlaubshinweis etc.) ────────────
// Ein einzelner Datensatz (id=1), den der Kunde im Admin-Bereich pflegt.
// aktiv=0 -> Popup wird nirgends angezeigt, unabhängig von den anderen Feldern.
function wf_ensure_popup_settings_table($mysqli) {
    $mysqli->query("
        CREATE TABLE IF NOT EXISTS popup_settings (
            id INT PRIMARY KEY DEFAULT 1,
            aktiv TINYINT(1) NOT NULL DEFAULT 0,
            titel VARCHAR(255) DEFAULT '',
            text MEDIUMTEXT DEFAULT '',
            bild VARCHAR(255) DEFAULT NULL,
            button_aktiv TINYINT(1) NOT NULL DEFAULT 0,
            button_text VARCHAR(100) DEFAULT '',
            button_link VARCHAR(500) DEFAULT '',
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");
    $check = $mysqli->query("SELECT COUNT(*) AS c FROM popup_settings");
    if ((int)($check->fetch_assoc()['c'] ?? 0) === 0) {
        $mysqli->query("INSERT INTO popup_settings (id, aktiv) VALUES (1, 0)");
    }
}
