<?php
declare(strict_types=1);
require_once __DIR__ . '/expense.php';

/*
 * Moms-Cockpit: Momsangivelse (TastSelv Erhverv), EU-Salg uden moms, Fristen, Warnungen, Revisor-Paket.
 * Fakturierungsprinzip: Rechnungen zählen nach Rechnungsdatum, Ausgaben nach Momsdatum (vat_date).
 */

/** Frist auf den nächsten Werktag schieben (Wochenende; Feiertage nicht berücksichtigt). */
function wf_next_weekday(string $d): string
{
    $t = strtotime($d);
    while ((int)date('N', $t) >= 6) {
        $t = strtotime('+1 day', $t);
    }
    return date('Y-m-d', $t);
}

/** Momsperioden eines Jahres: half = Halbjahr, quarter = Quartal, month = Monat; mit Frist (Skattestyrelsen). */
function wf_vat_periods(int $year, string $kind): array
{
    $len = $kind === 'month' ? 1 : ($kind === 'quarter' ? 3 : 6);
    $out = [];
    for ($m = 1, $idx = 1; $m <= 12; $m += $len, $idx++) {
        $e = $m + $len - 1;
        if ($kind === 'month') {
            [$dm, $dd] = $e === 6 ? [8, 17] : [$e + 1, 25];
        } else {
            [$dm, $dd] = [$e + 3, 1];
        }
        $dy = $year;
        if ($dm > 12) {
            $dm -= 12;
            $dy++;
        }
        $to = sprintf('%d-%02d-%02d', $year, $e, (int)date('t', mktime(0, 0, 0, $e, 1, $year)));
        $out[] = ['kind' => $kind, 'idx' => $idx, 'year' => $year, 'from' => sprintf('%d-%02d-01', $year, $m), 'to' => $to,
            'deadline' => wf_next_weekday(sprintf('%d-%02d-%02d', $dy, $dm, $dd)),
            // EU-Salg uden moms: 25. des Folgemonats nach Quartal/Monat
            'eu_deadline' => wf_next_weekday(date('Y-m-25', strtotime($to . ' +1 day')))];
    }
    return $out;
}

/** Zahlen für die Momsangivelse eines Zeitraums (Øre). */
function wf_vat_report(PDO $db, string $from, string $to): array
{
    $r = ['salgsmoms' => 0, 'moms_varekoeb_udland' => 0, 'moms_ydelseskoeb_udland' => 0, 'koebsmoms' => 0,
        'rubrik_a_varer' => 0, 'rubrik_a_ydelser' => 0, 'rubrik_b_varer' => 0, 'rubrik_b_ydelser' => 0, 'rubrik_c' => 0,
        'momstilsvar' => 0, 'invoices' => 0, 'expenses' => 0, 'eu_sales' => [], 'drafts' => 0];
    $eu = [];
    $st = $db->prepare("SELECT * FROM invoices WHERE status = 'final' AND issue_date BETWEEN ? AND ? ORDER BY number");
    $st->execute([$from, $to]);
    foreach ($st->fetchAll() as $i) {
        $r['invoices']++;
        $s = $i['type'] === 'credit' ? -1 : 1;
        $r['salgsmoms'] += $s * (int)$i['vat_dkk'];
        if ($i['vat_scheme'] === 'eu_rc') {
            // Aufteilung Ware/Dienstleistung nach Zeilenbeträgen
            $l = $db->query("SELECT kind, SUM(amount) AS a FROM invoice_lines WHERE invoice_id = " . (int)$i['id'] . ' GROUP BY kind')->fetchAll(PDO::FETCH_KEY_PAIR);
            $sum = array_sum($l) ?: 1;
            $goods = (int)round((int)$i['net_dkk'] * (int)($l['goods'] ?? 0) / $sum);
            $serv = (int)$i['net_dkk'] - $goods;
            $r['rubrik_b_varer'] += $s * $goods;
            $r['rubrik_b_ydelser'] += $s * $serv;
            $snap = json_decode($i['customer_snap'], true) ?: [];
            $k = $snap['vat_id'] ?: ($snap['company'] ?: $snap['name']);
            $eu[$k] ??= ['vat_id' => $snap['vat_id'] ?? '', 'country' => $snap['country'] ?? '', 'name' => $snap['company'] ?: ($snap['name'] ?? ''), 'goods' => 0, 'services' => 0];
            $eu[$k]['goods'] += $s * $goods;
            $eu[$k]['services'] += $s * $serv;
        } elseif ($i['vat_scheme'] === 'export') {
            $r['rubrik_c'] += $s * (int)$i['net_dkk'];
        }
    }
    $st = $db->prepare("SELECT * FROM expenses WHERE status = 'final' AND COALESCE(vat_date, date) BETWEEN ? AND ?");
    $st->execute([$from, $to]);
    foreach ($st->fetchAll() as $e) {
        $r['expenses']++;
        $r['koebsmoms'] += (int)$e['deduct_dkk'];
        $isEu = in_array($e['supplier_country'], WF_EU, true) && $e['supplier_country'] !== 'DK';
        if ($e['vat_mode'] === 'eu_goods') {
            $r['moms_varekoeb_udland'] += (int)$e['rc_vat_dkk'];
            if ($isEu) {
                $r['rubrik_a_varer'] += (int)$e['net_dkk'];
            }
        } elseif ($e['vat_mode'] === 'rc_services') {
            $r['moms_ydelseskoeb_udland'] += (int)$e['rc_vat_dkk'];
            if ($isEu) {
                $r['rubrik_a_ydelser'] += (int)$e['net_dkk'];
            }
        }
    }
    $d = $db->prepare("SELECT (SELECT COUNT(*) FROM invoices WHERE status = 'draft' AND issue_date BETWEEN ?1 AND ?2) + (SELECT COUNT(*) FROM expenses WHERE status = 'draft' AND date BETWEEN ?1 AND ?2)");
    $d->execute([$from, $to]);
    $r['drafts'] = (int)$d->fetchColumn();
    $r['eu_sales'] = array_values(array_filter($eu, fn($x) => $x['goods'] || $x['services']));
    $r['momstilsvar'] = $r['salgsmoms'] + $r['moms_varekoeb_udland'] + $r['moms_ydelseskoeb_udland'] - $r['koebsmoms'];
    return $r;
}

/** Nettoumsatz (DKK-Øre) in einem Zeitraum; Kreditnotas abgezogen. */
function wf_revenue(PDO $db, string $from, string $to, ?string $scheme = null): int
{
    $st = $db->prepare("SELECT COALESCE(SUM(CASE WHEN type = 'credit' THEN -net_dkk ELSE net_dkk END),0) FROM invoices WHERE status = 'final' AND issue_date BETWEEN ? AND ?" . ($scheme ? ' AND vat_scheme = ?' : ''));
    $st->execute($scheme ? [$from, $to, $scheme] : [$from, $to]);
    return (int)$st->fetchColumn();
}

/** Alles für das Cockpit: Zeiträume mit Status, Schwellen, Warnungen. */
function wf_tax_overview(PDO $db, int $year): array
{
    $co = wf_company();
    $today = date('Y-m-d');
    $rep = [];
    foreach ($db->query('SELECT * FROM vat_returns') as $v) {
        $rep[$v['period_from'] . '|' . $v['period_to']] = $v;
    }
    // Erste Buchung in der App: frühere Zeiträume wurden außerhalb gemeldet und lösen keine Warnungen aus
    $start = (string)($db->query("SELECT MIN(d) FROM (SELECT MIN(issue_date) AS d FROM invoices WHERE status = 'final' UNION ALL SELECT MIN(COALESCE(vat_date, date)) FROM expenses WHERE status = 'final')")->fetchColumn() ?: '9999-12-31');
    $periods = [];
    foreach ([$year - 1, $year] as $y) {
        foreach (wf_vat_periods($y, $co['moms_period']) as $p) {
            $v = $rep[$p['from'] . '|' . $p['to']] ?? null;
            $p['reported_at'] = $v['reported_at'] ?? null;
            $p['reported_by'] = $v['reported_by'] ?? null;
            $p['reported_tilsvar'] = $v ? (int)$v['momstilsvar'] : null;
            $p['state'] = $v ? 'reported' : ($p['to'] >= $today ? ($p['from'] <= $today ? 'running' : 'future') : ($p['to'] < $start ? 'none' : ($p['deadline'] < $today ? 'overdue' : 'due')));
            $periods[] = $p;
        }
    }
    $w = [];
    if ($miss = wf_company_missing($co)) {
        $w[] = ['level' => 'bad', 'code' => 'company_missing', 'n' => count($miss)];
    }
    foreach ($periods as $p) {
        if ($p['state'] === 'overdue') {
            $w[] = ['level' => 'bad', 'code' => 'vat_overdue', 'from' => $p['from'], 'to' => $p['to'], 'date' => $p['deadline']];
        } elseif ($p['state'] === 'due') {
            $days = (int)((strtotime($p['deadline']) - strtotime($today)) / 86400);
            $w[] = ['level' => $days <= 14 ? 'warn' : 'info', 'code' => 'vat_due', 'from' => $p['from'], 'to' => $p['to'], 'date' => $p['deadline'], 'days' => $days];
        }
        if (in_array($p['state'], ['due', 'overdue'], true)) {
            $r = wf_vat_report($db, $p['from'], $p['to']);
            if ($r['drafts']) {
                $w[] = ['level' => 'warn', 'code' => 'period_drafts', 'from' => $p['from'], 'to' => $p['to'], 'n' => $r['drafts']];
            }
        }
    }
    // EU-Salg uden moms: quartalsweise, unabhängig von der Momsperiode
    $eu = [];
    foreach ([$year - 1, $year] as $y) {
        foreach (wf_vat_periods($y, 'quarter') as $q) {
            if ($q['to'] >= $today) {
                continue;
            }
            $sales = wf_vat_report($db, $q['from'], $q['to'])['eu_sales'];
            if (!$sales) {
                continue;
            }
            $done = (string)($db->query("SELECT value FROM meta WHERE key = " . $db->quote('eu_reported:' . $q['from']))->fetchColumn() ?: '');
            $q['reported_at'] = $done ?: null;
            $q['sales'] = $sales;
            $eu[] = $q;
            if (!$done) {
                $w[] = ['level' => $q['eu_deadline'] < $today ? 'bad' : 'warn', 'code' => 'eu_sales_due', 'from' => $q['from'], 'to' => $q['to'], 'date' => $q['eu_deadline'], 'quarter' => $q['idx'] . '/' . $q['year']];
            }
        }
    }
    $bankOld = (int)$db->query("SELECT COUNT(*) FROM bank_tx WHERE match_type IS NULL AND date < date('now', '-14 days')")->fetchColumn();
    if ($bankOld) {
        $w[] = ['level' => 'warn', 'code' => 'bank_open', 'n' => $bankOld];
    }
    $draftsOld = (int)$db->query("SELECT COUNT(*) FROM expenses WHERE status = 'draft' AND created_at < datetime('now', '-7 days')")->fetchColumn();
    if ($draftsOld) {
        $w[] = ['level' => 'warn', 'code' => 'expense_drafts', 'n' => $draftsOld];
    }
    $noRec = (int)$db->query("SELECT COUNT(*) FROM expenses WHERE status = 'final' AND file_stored IS NULL AND reverses IS NULL AND substr(date,1,4) = '$year'")->fetchColumn();
    if ($noRec) {
        $w[] = ['level' => 'info', 'code' => 'no_receipt', 'n' => $noRec];
    }
    $od = 0;
    $odSum = 0;
    foreach ($db->query("SELECT * FROM invoices WHERE status = 'final' AND type = 'invoice' AND due_date < date('now')")->fetchAll() as $i) {
        $o = wf_inv_open($db, $i)['open'];
        if ($o > 0) {
            $od++;
            $odSum += (int)round($o * (float)$i['rate']);
        }
    }
    if ($od) {
        $w[] = ['level' => 'warn', 'code' => 'invoices_overdue', 'n' => $od, 'amount' => $odSum];
    }
    // Schwellen
    $revThis = wf_revenue($db, "$year-01-01", "$year-12-31");
    $revLast = wf_revenue($db, ($year - 1) . '-01-01', ($year - 1) . '-12-31');
    $rev12 = wf_revenue($db, date('Y-m-d', strtotime('-12 months')), $today);
    if ($revThis > 30000000 && $revLast > 30000000) {
        $w[] = ['level' => 'bad', 'code' => 'digital_duty'];
    } elseif ($revThis > 24000000 || $revLast > 30000000) {
        $w[] = ['level' => 'warn', 'code' => 'digital_near', 'amount' => $revThis];
    }
    if (empty($co['moms_registered']) && $rev12 > 5000000) {
        $w[] = ['level' => 'bad', 'code' => 'moms_register'];
    }
    $eur = (float)(wf_rate('EUR')['rate'] ?? 7.46) ?: 7.46;
    $ossThis = (int)round(wf_revenue($db, "$year-01-01", "$year-12-31", 'eu_b2c') / $eur);
    $ossLast = (int)round(wf_revenue($db, ($year - 1) . '-01-01', ($year - 1) . '-12-31', 'eu_b2c') / $eur);
    $oss = max($ossThis, $ossLast);
    if ($oss > 1000000) {
        $w[] = ['level' => 'bad', 'code' => 'oss_over', 'amount' => $oss];
    } elseif ($oss > 800000) {
        $w[] = ['level' => 'warn', 'code' => 'oss_near', 'amount' => $oss];
    }
    $lastBackup = (string)($db->query("SELECT value FROM meta WHERE key = 'last_backup'")->fetchColumn() ?: '');
    if ($lastBackup === '' || $lastBackup < date('Y-m-d', strtotime('-7 days'))) {
        $w[] = ['level' => 'warn', 'code' => 'backup', 'date' => $lastBackup ?: null];
    }
    $chk = wf_journal_verify($db);
    if (!$chk['ok']) {
        $w[] = ['level' => 'bad', 'code' => 'journal', 'problems' => implode(', ', array_slice($chk['problems'], 0, 5))];
    }
    $order = ['bad' => 0, 'warn' => 1, 'info' => 2];
    usort($w, fn($a, $b) => $order[$a['level']] <=> $order[$b['level']]);
    return ['periods' => $periods, 'warnings' => $w, 'moms_period' => $co['moms_period'], 'eu_quarters' => $eu,
        'thresholds' => ['revenue_this' => $revThis, 'revenue_last' => $revLast, 'revenue_12m' => $rev12, 'oss_eur' => $oss, 'eur_rate' => $eur]];
}

// ---------- Revisor-Paket ----------
function wf_csv(array $head, array $rows): string
{
    $q = fn($v) => '"' . str_replace('"', '""', (string)$v) . '"';
    $out = "\xEF\xBB\xBF" . implode(';', array_map($q, $head)) . "\r\n";
    foreach ($rows as $r) {
        $out .= implode(';', array_map($q, $r)) . "\r\n";
    }
    return $out;
}
function wf_kr(int $cents): string
{
    return number_format($cents / 100, 2, ',', '');
}

/** ZIP mit allen Zahlen und Belegen eines Jahres für den Revisor. Gibt den Pfad der Temp-Datei zurück. */
function wf_revisor_zip(PDO $db, int $year): string
{
    require_once __DIR__ . '/docrender.php';
    if (!class_exists('ZipArchive')) {
        throw new RuntimeException('zip_missing');
    }
    $from = "$year-01-01";
    $to = "$year-12-31";
    $tmp = tempnam(sys_get_temp_dir(), 'wfrev');
    $z = new ZipArchive();
    $z->open($tmp, ZipArchive::OVERWRITE);
    $co = wf_company();
    $cats = wf_exp_categories();
    $dir = rtrim((string)wf_cfg('data_dir'), '/') . '/uploads/';

    $inv = $db->prepare("SELECT * FROM invoices WHERE status = 'final' AND issue_date BETWEEN ? AND ? ORDER BY number");
    $inv->execute([$from, $to]);
    $rows = [];
    $lines = [];
    foreach ($inv->fetchAll() as $i) {
        $snap = json_decode($i['customer_snap'], true) ?: [];
        $b = wf_inv_open($db, $i);
        $orig = $i['credit_of'] ? $db->query('SELECT number FROM invoices WHERE id = ' . (int)$i['credit_of'])->fetchColumn() : '';
        $rows[] = [$i['number'], $i['type'] === 'credit' ? 'Kreditnota' : 'Faktura', $orig, $i['issue_date'], $i['due_date'], $snap['company'] ?: ($snap['name'] ?? ''), $snap['vat_id'] ?? '', $snap['country'] ?? '',
            $i['vat_scheme'], $i['currency'], $i['rate'], wf_kr((int)$i['net']), wf_kr((int)$i['vat']), wf_kr((int)$i['total']), wf_kr((int)$i['net_dkk']), wf_kr((int)$i['vat_dkk']), wf_kr((int)$i['total_dkk']),
            wf_kr($b['paid']), wf_kr($b['open']), $i['hash']];
        $l = $db->prepare('SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY pos');
        $l->execute([$i['id']]);
        foreach ($l->fetchAll() as $x) {
            $lines[] = [$i['number'], $x['pos'], $x['description'], str_replace('.', ',', (string)(float)$x['qty']), $x['unit'], wf_kr((int)$x['unit_price']), str_replace('.', ',', (string)(float)$x['discount']), $x['kind'], wf_kr((int)$x['amount'])];
        }
        $full = wf_inv_load($db, (int)$i['id']);
        $z->addFromString(sprintf('fakturaer/%s-%d.html', $i['type'] === 'credit' ? 'Kreditnota' : 'Faktura', $i['number']), wf_doc_html($db, $full, null, true));
    }
    $z->addFromString('fakturaer.csv', wf_csv(['Nr', 'Type', 'Krediterer nr', 'Dato', 'Forfald', 'Kunde', 'Momsnr', 'Land', 'Momsregel', 'Valuta', 'Kurs', 'Netto', 'Moms', 'I alt', 'Netto DKK', 'Moms DKK', 'I alt DKK', 'Betalt', 'Åbent', 'Kontrolsum'], $rows));
    $z->addFromString('fakturalinjer.csv', wf_csv(['Faktura', 'Pos', 'Tekst', 'Antal', 'Enhed', 'Stk-pris', 'Rabat %', 'Art', 'Beløb'], $lines));

    $p = $db->prepare("SELECT p.*, i.number, i.currency FROM invoice_payments p JOIN invoices i ON i.id = p.invoice_id WHERE p.date BETWEEN ? AND ? ORDER BY p.date, p.id");
    $p->execute([$from, $to]);
    $z->addFromString('betalinger.csv', wf_csv(['Dato', 'Faktura', 'Beløb', 'Valuta', 'Betalingsform', 'Note', 'Tilbagefører'], array_map(fn($x) => [$x['date'], $x['number'], wf_kr((int)$x['amount']), $x['currency'], $x['method'], $x['note'], $x['reverses'] ?? ''], $p->fetchAll())));

    $e = $db->prepare("SELECT * FROM expenses WHERE status = 'final' AND date BETWEEN ? AND ? ORDER BY number");
    $e->execute([$from, $to]);
    $rows = [];
    foreach ($e->fetchAll() as $x) {
        $file = '';
        if ($x['file_stored'] && is_file($dir . $x['file_stored'])) {
            $ext = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif', 'application/pdf' => 'pdf'][$x['file_mime']] ?? 'dat';
            $file = sprintf('bilag/Bilag-%04d-%s.%s', $x['number'], preg_replace('/[^A-Za-z0-9]+/', '-', iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $x['supplier']) ?: 'x'), $ext);
            $z->addFile($dir . $x['file_stored'], $file);
        }
        $rows[] = [$x['number'], $x['date'], $x['vat_date'], $x['supplier'], $x['supplier_country'], $x['supplier_vat'], $x['doc_no'], $x['description'], $cats[$x['category']][1] ?? $x['category'],
            $x['vat_mode'], $x['currency'], $x['rate'], wf_kr((int)$x['gross']), wf_kr((int)$x['vat']), wf_kr((int)$x['gross_dkk']), wf_kr((int)$x['net_dkk']), wf_kr((int)$x['vat_dkk']),
            wf_kr((int)$x['rc_vat_dkk']), $x['vat_share'], wf_kr((int)$x['deduct_dkk']), $x['paid_date'], $x['reverses'] ? 'tilbagefører ' . $x['reverses'] : '', $file ?: 'Intet bilag: ' . $x['no_receipt'], $x['hash']];
    }
    $z->addFromString('udgifter.csv', wf_csv(['Bilag', 'Dato', 'Momsdato', 'Leverandør', 'Land', 'Momsnr', 'Bilagsnr', 'Tekst', 'Kategori', 'Momsart', 'Valuta', 'Kurs', 'Beløb', 'Moms', 'Beløb DKK', 'Netto DKK', 'Moms DKK',
        'Erhvervelsesmoms DKK', 'Fradrag %', 'Fradrag DKK', 'Betalt', 'Tilbageførsel', 'Bilagsfil', 'Kontrolsum'], $rows));

    $b = $db->prepare('SELECT * FROM bank_tx WHERE date BETWEEN ? AND ? ORDER BY date, id');
    $b->execute([$from, $to]);
    $z->addFromString('bank.csv', wf_csv(['Dato', 'Tekst', 'Beløb DKK', 'Afstemt med', 'Id', 'Note'], array_map(fn($x) => [$x['date'], $x['text'], wf_kr((int)$x['amount']), $x['match_type'] ?? 'ÅBEN', $x['match_id'] ?? '', $x['match_note']], $b->fetchAll())));

    $rows = [];
    foreach (wf_vat_periods($year, $co['moms_period']) as $per) {
        $r = wf_vat_report($db, $per['from'], $per['to']);
        $rows[] = [$per['from'], $per['to'], $per['deadline'], wf_kr($r['salgsmoms']), wf_kr($r['moms_varekoeb_udland']), wf_kr($r['moms_ydelseskoeb_udland']), wf_kr($r['koebsmoms']),
            wf_kr($r['rubrik_a_varer']), wf_kr($r['rubrik_a_ydelser']), wf_kr($r['rubrik_b_varer']), wf_kr($r['rubrik_b_ydelser']), wf_kr($r['rubrik_c']), wf_kr($r['momstilsvar'])];
    }
    $z->addFromString('momsangivelser.csv', wf_csv(['Fra', 'Til', 'Frist', 'Salgsmoms', 'Moms af varekøb i udlandet', 'Moms af ydelseskøb i udlandet', 'Købsmoms', 'Rubrik A varer', 'Rubrik A ydelser',
        'Rubrik B varer', 'Rubrik B ydelser', 'Rubrik C', 'Momstilsvar'], $rows));

    $j = $db->prepare("SELECT * FROM journal WHERE substr(at,1,4) = ? ORDER BY id");
    $j->execute([(string)$year]);
    $z->addFromString('journal.csv', wf_csv(['Id', 'Tid (UTC)', 'Bruger', 'Type', 'Ref', 'Data', 'Forrige hash', 'Hash'], array_map(fn($x) => [$x['id'], $x['at'], $x['user_name'], $x['kind'], $x['ref_id'], $x['data'], $x['prev_hash'], $x['hash']], $j->fetchAll())));

    $chk = wf_journal_verify($db);
    $z->addFromString('LÆS MIG.txt', "Regnskabsmateriale $year – " . $co['name'] . ' (CVR ' . $co['cvr'] . ")\r\nUdtrukket " . date('Y-m-d H:i') . "\r\n\r\n"
        . "fakturaer.csv / fakturalinjer.csv – udstedte fakturaer og kreditnotaer (beløb med komma som decimaltegn)\r\nfakturaer/ – hver faktura som HTML (åbn i browser, udskriv som PDF)\r\n"
        . "betalinger.csv – indbetalinger på fakturaer\r\nudgifter.csv – bogførte udgifter med moms og fradrag; bilag/ – bilagsfiler\r\nbank.csv – kontoudtog og afstemning\r\n"
        . "momsangivelser.csv – beløb pr. momsperiode\r\njournal.csv – uforanderlig journal med hash-kæde\r\n\r\n"
        . 'Kontrol af kæde: ' . ($chk['ok'] ? 'OK' : 'AFVIGELSE: ' . implode(', ', $chk['problems'])) . "\r\n");
    $z->close();
    return $tmp;
}
