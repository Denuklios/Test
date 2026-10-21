<?php
declare(strict_types=1);

function wf_migrate(PDO $db): void
{
    $db->exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    $v = (int)($db->query("SELECT value FROM meta WHERE key='schema_version'")->fetchColumn() ?: 0);
    if ($v >= 4) {
        return;
    }
    if ($v < 1) {
        wf_migrate_v1($db);
    }
    if ($v < 2) {
        wf_migrate_v2($db);
    }
    if ($v < 3) {
        wf_migrate_v3($db);
    }
    // Version 4: Startzeit je Verfahren eines Auftrags + Arbeitsbeginn. NULL = ohne Uhrzeit.
    $db->beginTransaction();
    $db->exec("
    ALTER TABLE order_processes ADD COLUMN start_time TEXT;
    INSERT OR IGNORE INTO meta (key, value) VALUES ('day_start', '08:00');
    INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '4');
    ");
    $db->commit();
}

/** Version 3: Sperrtage mit Uhrzeit (Teilsperre). NULL = ganzer Tag. */
function wf_migrate_v3(PDO $db): void
{
    $db->beginTransaction();
    $db->exec("
    ALTER TABLE blocked_days ADD COLUMN time_from TEXT;
    ALTER TABLE blocked_days ADD COLUMN time_to TEXT;
    INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '3');
    ");
    $db->commit();
}

/** Version 2: Sperrtage und Wochenend-Kapazitaet. */
function wf_migrate_v2(PDO $db): void
{
    $db->beginTransaction();
    $db->exec("
    CREATE TABLE IF NOT EXISTS blocked_days (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date_from TEXT NOT NULL,
      date_to TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_blocked ON blocked_days(date_from, date_to);
    INSERT OR IGNORE INTO meta (key, value) VALUES ('weekend_min', '300');
    INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '2');
    ");
    $db->commit();
}

function wf_migrate_v1(PDO $db): void
{
    $db->beginTransaction();
    $db->exec("
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      wf_admin_id TEXT UNIQUE,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      company TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      currency TEXT NOT NULL DEFAULT 'DKK',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      anonymized_at TEXT
    );
    CREATE INDEX idx_customers_name ON customers(name);
    CREATE TABLE process_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      name_de TEXT NOT NULL,
      name_da TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#A855F7',
      capacity_min INTEGER NOT NULL DEFAULT 480,
      sort INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nr TEXT NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      article TEXT NOT NULL DEFAULT '',
      qty INTEGER NOT NULL DEFAULT 1,
      price REAL NOT NULL DEFAULT 0,
      deposit REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'DKK',
      pay_status TEXT NOT NULL DEFAULT 'open',
      status TEXT NOT NULL DEFAULT 'inquiry',
      due_date TEXT,
      plan_date TEXT,
      notes TEXT NOT NULL DEFAULT '',
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT
    );
    CREATE INDEX idx_orders_due ON orders(due_date);
    CREATE INDEX idx_orders_status ON orders(status);
    CREATE INDEX idx_orders_customer ON orders(customer_id);
    CREATE TABLE order_processes (
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      process_id INTEGER NOT NULL REFERENCES process_types(id),
      minutes INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (order_id, process_id)
    );
    CREATE TABLE order_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL UNIQUE,
      mime TEXT NOT NULL,
      size INTEGER NOT NULL,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE status_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      user_name TEXT NOT NULL,
      what TEXT NOT NULL,
      at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE display_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      revoked_at TEXT,
      last_used_at TEXT
    );
    CREATE TABLE rate_limit (
      ip TEXT NOT NULL,
      at INTEGER NOT NULL
    );
    CREATE INDEX idx_rate ON rate_limit(ip, at);
    ");

    $proc = [
        ['stick',   'Sticken',          'Broderi',          '#A855F7', 480],
        ['flex',    'Flex & Flock',     'Flex & Flock',     '#E879F9', 480],
        ['dtf',     'DTF-Druck',        'DTF-tryk',         '#38BDF8', 480],
        ['siebdruck', 'Siebdruck',      'Serigrafi',        '#F59E0B', 480],
        ['sublimation', 'Sublimation',  'Sublimering',      '#34D399', 480],
        ['lasergravur', 'Lasergravur',  'Lasergravering',   '#F87171', 480],
        ['laserschnitt', 'Laserschnitt', 'Laserskæring',     '#FB923C', 480],
    ];
    $st = $db->prepare('INSERT INTO process_types (key,name_de,name_da,color,capacity_min,sort) VALUES (?,?,?,?,?,?)');
    foreach ($proc as $i => $p) {
        $st->execute([$p[0], $p[1], $p[2], $p[3], $p[4], $i]);
    }
    $st = $db->prepare('INSERT INTO users (name) VALUES (?)');
    for ($i = 1; $i <= 5; $i++) {
        $st->execute(['Benutzer ' . $i]);
    }
    $db->exec("INSERT INTO meta (key,value) VALUES ('change_counter','1'),('schema_version','1')");
    $db->commit();
}
