<?php
declare(strict_types=1);

function wf_migrate(PDO $db): void
{
    $db->exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    $v = (int)($db->query("SELECT value FROM meta WHERE key='schema_version'")->fetchColumn() ?: 0);
    if ($v >= 8) {
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
    if ($v < 4) {
        wf_migrate_v4($db);
    }
    if ($v < 5) {
        wf_migrate_v5($db);
    }
    if ($v < 6) {
        wf_migrate_v6($db);
    }
    if ($v < 7) {
        wf_migrate_v7($db);
    }
    wf_migrate_v8($db);
}

/**
 * Version 8: Auftrag <-> Rechnung.
 * - invoices.purpose: '' normal, 'deposit' Anzahlungsrechnung, 'final' Schlussrechnung (zieht Anzahlungen ab); in die Sperre aufgenommen
 * - products: Produkt-/Preisliste fuer Rechnungszeilen
 * - order_confirmations: Auftragsbestaetigung per geheimem Link mit Unterschrift; der bestaetigte Inhalt wird eingefroren
 */
function wf_migrate_v8(PDO $db): void
{
    $db->beginTransaction();
    $db->exec("
    ALTER TABLE invoices ADD COLUMN purpose TEXT NOT NULL DEFAULT '';
    CREATE INDEX idx_inv_order ON invoices(order_id);
    DROP TRIGGER inv_lock_update;
    CREATE TRIGGER inv_lock_update BEFORE UPDATE ON invoices
    WHEN OLD.status = 'final' AND (
      NEW.status IS NOT OLD.status OR NEW.type IS NOT OLD.type OR NEW.number IS NOT OLD.number OR NEW.customer_id IS NOT OLD.customer_id
      OR NEW.order_id IS NOT OLD.order_id OR NEW.credit_of IS NOT OLD.credit_of OR NEW.issue_date IS NOT OLD.issue_date
      OR NEW.delivery_date IS NOT OLD.delivery_date OR NEW.due_date IS NOT OLD.due_date OR NEW.currency IS NOT OLD.currency
      OR NEW.rate IS NOT OLD.rate OR NEW.rate_date IS NOT OLD.rate_date OR NEW.rate_source IS NOT OLD.rate_source
      OR NEW.vat_scheme IS NOT OLD.vat_scheme OR NEW.scheme_manual IS NOT OLD.scheme_manual OR NEW.prices_incl IS NOT OLD.prices_incl
      OR NEW.lang IS NOT OLD.lang OR NEW.customer_snap IS NOT OLD.customer_snap OR NEW.seller_snap IS NOT OLD.seller_snap
      OR NEW.note IS NOT OLD.note OR NEW.net IS NOT OLD.net OR NEW.vat IS NOT OLD.vat OR NEW.total IS NOT OLD.total
      OR NEW.net_dkk IS NOT OLD.net_dkk OR NEW.vat_dkk IS NOT OLD.vat_dkk OR NEW.total_dkk IS NOT OLD.total_dkk
      OR NEW.hash IS NOT OLD.hash OR NEW.created_at IS NOT OLD.created_at OR NEW.created_by IS NOT OLD.created_by
      OR NEW.approved_at IS NOT OLD.approved_at OR NEW.approved_by IS NOT OLD.approved_by OR NEW.purpose IS NOT OLD.purpose)
    BEGIN SELECT RAISE(ABORT, 'invoice_locked'); END;

    CREATE TABLE products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'stk',
      price INTEGER NOT NULL DEFAULT 0,
      kind TEXT NOT NULL DEFAULT 'goods',
      active INTEGER NOT NULL DEFAULT 1,
      sort INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE order_confirmations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      lang TEXT NOT NULL DEFAULT 'da',
      snapshot TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT NOT NULL DEFAULT '',
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      viewed_at TEXT,
      signed_at TEXT,
      signer_name TEXT,
      signature TEXT,
      sign_ip TEXT,
      sign_ua TEXT
    );
    CREATE INDEX idx_conf_order ON order_confirmations(order_id);
    -- Unterschriebene Bestaetigung bleibt unveraendert (Beweis)
    CREATE TRIGGER conf_lock BEFORE UPDATE ON order_confirmations WHEN OLD.signed_at IS NOT NULL
    BEGIN SELECT RAISE(ABORT, 'confirmation_locked'); END;
    INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '8');
    ");
    $db->commit();
}

/**
 * Version 7: Rechnungen und Gutschriften (Kreditnotas), rechtssicher:
 * - customers: Land, USt-/CVR-Nummer, Firma/Privat, Belegsprache, VIES-Pruefung
 * - invoices + invoice_lines: Entwurf frei aenderbar; festgeschrieben (status 'final') ist alles gesperrt (Trigger)
 * - invoice_payments: nur anhaengen, Korrektur per Gegenbuchung
 * - journal: Protokoll mit Hash-Kette, weder aenderbar noch loeschbar (Trigger)
 */
function wf_migrate_v7(PDO $db): void
{
    $db->beginTransaction();
    $db->exec("
    ALTER TABLE customers ADD COLUMN country TEXT NOT NULL DEFAULT 'DK';
    ALTER TABLE customers ADD COLUMN vat_id TEXT NOT NULL DEFAULT '';
    ALTER TABLE customers ADD COLUMN is_business INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE customers ADD COLUMN doc_lang TEXT NOT NULL DEFAULT '';
    ALTER TABLE customers ADD COLUMN vat_checked_at TEXT;
    ALTER TABLE customers ADD COLUMN vat_checked_name TEXT NOT NULL DEFAULT '';
    ALTER TABLE customers ADD COLUMN vat_valid INTEGER;

    CREATE TABLE invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL DEFAULT 'invoice' CHECK (type IN ('invoice','credit')),
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','final')),
      number INTEGER UNIQUE,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      order_id INTEGER,
      credit_of INTEGER REFERENCES invoices(id),
      issue_date TEXT NOT NULL,
      delivery_date TEXT,
      due_date TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'DKK',
      rate TEXT NOT NULL DEFAULT '1',
      rate_date TEXT,
      rate_source TEXT NOT NULL DEFAULT '',
      vat_scheme TEXT NOT NULL DEFAULT 'dk',
      scheme_manual INTEGER NOT NULL DEFAULT 0,
      prices_incl INTEGER NOT NULL DEFAULT 0,
      lang TEXT NOT NULL DEFAULT 'da',
      customer_snap TEXT NOT NULL DEFAULT '{}',
      seller_snap TEXT NOT NULL DEFAULT '{}',
      note TEXT NOT NULL DEFAULT '',
      net INTEGER NOT NULL DEFAULT 0,
      vat INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      net_dkk INTEGER NOT NULL DEFAULT 0,
      vat_dkk INTEGER NOT NULL DEFAULT 0,
      total_dkk INTEGER NOT NULL DEFAULT 0,
      hash TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT NOT NULL DEFAULT '',
      approved_at TEXT,
      approved_by TEXT,
      sent_at TEXT
    );
    CREATE INDEX idx_inv_customer ON invoices(customer_id);
    CREATE INDEX idx_inv_status ON invoices(status, issue_date);
    CREATE TABLE invoice_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      pos INTEGER NOT NULL,
      description TEXT NOT NULL,
      qty REAL NOT NULL DEFAULT 1,
      unit TEXT NOT NULL DEFAULT 'stk',
      unit_price INTEGER NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      kind TEXT NOT NULL DEFAULT 'goods' CHECK (kind IN ('goods','services')),
      amount INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX idx_lines_inv ON invoice_lines(invoice_id, pos);
    CREATE TABLE invoice_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id),
      date TEXT NOT NULL,
      amount INTEGER NOT NULL,
      method TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      reverses INTEGER REFERENCES invoice_payments(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX idx_pay_inv ON invoice_payments(invoice_id);
    CREATE TABLE journal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at TEXT NOT NULL DEFAULT (datetime('now')),
      user_name TEXT NOT NULL,
      kind TEXT NOT NULL,
      ref_id INTEGER,
      data TEXT NOT NULL,
      prev_hash TEXT NOT NULL,
      hash TEXT NOT NULL
    );

    -- Festgeschriebene Rechnungen: nur 'sent_at' darf sich noch aendern, loeschen unmoeglich.
    CREATE TRIGGER inv_lock_update BEFORE UPDATE ON invoices
    WHEN OLD.status = 'final' AND (
      NEW.status IS NOT OLD.status OR NEW.type IS NOT OLD.type OR NEW.number IS NOT OLD.number OR NEW.customer_id IS NOT OLD.customer_id
      OR NEW.order_id IS NOT OLD.order_id OR NEW.credit_of IS NOT OLD.credit_of OR NEW.issue_date IS NOT OLD.issue_date
      OR NEW.delivery_date IS NOT OLD.delivery_date OR NEW.due_date IS NOT OLD.due_date OR NEW.currency IS NOT OLD.currency
      OR NEW.rate IS NOT OLD.rate OR NEW.rate_date IS NOT OLD.rate_date OR NEW.rate_source IS NOT OLD.rate_source
      OR NEW.vat_scheme IS NOT OLD.vat_scheme OR NEW.scheme_manual IS NOT OLD.scheme_manual OR NEW.prices_incl IS NOT OLD.prices_incl
      OR NEW.lang IS NOT OLD.lang OR NEW.customer_snap IS NOT OLD.customer_snap OR NEW.seller_snap IS NOT OLD.seller_snap
      OR NEW.note IS NOT OLD.note OR NEW.net IS NOT OLD.net OR NEW.vat IS NOT OLD.vat OR NEW.total IS NOT OLD.total
      OR NEW.net_dkk IS NOT OLD.net_dkk OR NEW.vat_dkk IS NOT OLD.vat_dkk OR NEW.total_dkk IS NOT OLD.total_dkk
      OR NEW.hash IS NOT OLD.hash OR NEW.created_at IS NOT OLD.created_at OR NEW.created_by IS NOT OLD.created_by
      OR NEW.approved_at IS NOT OLD.approved_at OR NEW.approved_by IS NOT OLD.approved_by)
    BEGIN SELECT RAISE(ABORT, 'invoice_locked'); END;
    CREATE TRIGGER inv_lock_delete BEFORE DELETE ON invoices WHEN OLD.status = 'final'
    BEGIN SELECT RAISE(ABORT, 'invoice_locked'); END;
    CREATE TRIGGER line_lock_ins BEFORE INSERT ON invoice_lines
    WHEN (SELECT status FROM invoices WHERE id = NEW.invoice_id) = 'final'
    BEGIN SELECT RAISE(ABORT, 'invoice_locked'); END;
    CREATE TRIGGER line_lock_upd BEFORE UPDATE ON invoice_lines
    WHEN (SELECT status FROM invoices WHERE id = OLD.invoice_id) = 'final'
    BEGIN SELECT RAISE(ABORT, 'invoice_locked'); END;
    CREATE TRIGGER line_lock_del BEFORE DELETE ON invoice_lines
    WHEN (SELECT status FROM invoices WHERE id = OLD.invoice_id) = 'final'
    BEGIN SELECT RAISE(ABORT, 'invoice_locked'); END;
    CREATE TRIGGER pay_lock_upd BEFORE UPDATE ON invoice_payments BEGIN SELECT RAISE(ABORT, 'payment_locked'); END;
    CREATE TRIGGER pay_lock_del BEFORE DELETE ON invoice_payments BEGIN SELECT RAISE(ABORT, 'payment_locked'); END;
    CREATE TRIGGER pay_only_final BEFORE INSERT ON invoice_payments
    WHEN (SELECT status FROM invoices WHERE id = NEW.invoice_id) IS NOT 'final'
    BEGIN SELECT RAISE(ABORT, 'invoice_not_final'); END;
    CREATE TRIGGER journal_lock_upd BEFORE UPDATE ON journal BEGIN SELECT RAISE(ABORT, 'journal_locked'); END;
    CREATE TRIGGER journal_lock_del BEFORE DELETE ON journal BEGIN SELECT RAISE(ABORT, 'journal_locked'); END;

    INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '7');
    ");
    $db->commit();
}

/**
 * Version 6: Dauer je Stueck (order_processes.per_piece; die Gesamtminuten = je Stueck x Menge) und Uebergabe-Bloecke
 * (order_days.kind = 'handover': eine Stunde am Abgabetag, an der die Person nicht arbeiten kann).
 */
function wf_migrate_v6(PDO $db): void
{
    $db->beginTransaction();
    $db->exec("
    ALTER TABLE order_processes ADD COLUMN per_piece INTEGER;
    ALTER TABLE order_days ADD COLUMN kind TEXT NOT NULL DEFAULT 'work';
    INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '6');
    ");
    $db->commit();
}

/** Version 4: Startzeit je Verfahren (ab v5 nicht mehr genutzt) + Arbeitsbeginn. */
function wf_migrate_v4(PDO $db): void
{
    $db->beginTransaction();
    $db->exec("
    ALTER TABLE order_processes ADD COLUMN start_time TEXT;
    INSERT OR IGNORE INTO meta (key, value) VALUES ('day_start', '08:00');
    INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '4');
    ");
    $db->commit();
}

/**
 * Version 5: Planung nach Person statt nach Maschine.
 * - workers: Ich + 3 Mitarbeiter (aktiv, sobald ein Name eingetragen ist), je mit Farbe und Tagesstunden
 * - orders: worker_id, start_time, total_min (Summe der Verfahrens-Dauer), finish_date
 * - order_days: die tatsaechlich eingeplanten Bloecke (Tag, Start, Minuten); Quelle fuer alle Kapazitaeten
 * Bestehende Auftraege werden dem Inhaber zugeordnet und mit einem Block am bisherigen Produktions-/Abgabetag uebernommen.
 */
function wf_migrate_v5(PDO $db): void
{
    $db->beginTransaction();
    $db->exec("
    CREATE TABLE workers (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL,
      day_min INTEGER NOT NULL DEFAULT 480
    );
    INSERT INTO workers (id, name, color, day_min) VALUES
      (1, 'Ich', '#A855F7', 480), (2, '', '#38BDF8', 480), (3, '', '#34D399', 480), (4, '', '#F59E0B', 480);
    ALTER TABLE orders ADD COLUMN worker_id INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE orders ADD COLUMN start_time TEXT;
    ALTER TABLE orders ADD COLUMN total_min INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE orders ADD COLUMN finish_date TEXT;
    CREATE TABLE order_days (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      minutes INTEGER NOT NULL
    );
    CREATE INDEX idx_order_days_date ON order_days(date);
    CREATE INDEX idx_order_days_order ON order_days(order_id);
    ");
    // Bestehende Aufträge übernehmen
    $dayStart = (int)substr((string)($db->query("SELECT value FROM meta WHERE key='day_start'")->fetchColumn() ?: '08:00'), 0, 2) * 60;
    $next = [];
    $ins = $db->prepare('INSERT INTO order_days (order_id, date, start_time, minutes) VALUES (?,?,?,?)');
    foreach ($db->query("SELECT id, COALESCE(plan_date, due_date) AS d FROM orders ORDER BY id")->fetchAll() as $o) {
        $total = (int)$db->query('SELECT COALESCE(SUM(minutes),0) FROM order_processes WHERE order_id = ' . (int)$o['id'])->fetchColumn();
        $first = $db->query('SELECT MIN(start_time) FROM order_processes WHERE order_id = ' . (int)$o['id'])->fetchColumn();
        $upd = $db->prepare('UPDATE orders SET total_min = ?, plan_date = ?, finish_date = ?, start_time = ? WHERE id = ?');
        if (!$o['d'] || $total <= 0) {
            $upd->execute([$total, null, null, null, $o['id']]);
            continue;
        }
        $a = $first ? (int)substr($first, 0, 2) * 60 + (int)substr($first, 3, 2) : ($next[$o['d']] ?? $dayStart);
        $next[$o['d']] = $a + $total;
        $hhmm = sprintf('%02d:%02d', intdiv($a, 60), $a % 60);
        $ins->execute([$o['id'], $o['d'], $hhmm, $total]);
        $upd->execute([$total, $o['d'], $o['d'], $hhmm, $o['id']]);
    }
    $db->exec("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '5')");
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
