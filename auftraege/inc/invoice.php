<?php
declare(strict_types=1);
require_once __DIR__ . '/doctext.php';

/*
 * Rechnungen und Kreditnotas (Gutschriften) nach dänischem Recht.
 * Alle Beträge in Øre/Cent (ganze Zahlen), Kurse als Text (DKK je 1 Einheit Fremdwährung).
 * Entwurf: frei änderbar. Festgeschrieben: lückenlose Nummer, Inhalt per Trigger gesperrt, Eintrag im Journal (Hash-Kette).
 */

const WF_EU = ['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK'];
const WF_SCHEMES = ['dk', 'eu_rc', 'eu_b2c', 'export', 'novat'];
const WF_UNITS = ['stk', 'timer', 'dage', 'm', 'm2', 'kg', 'pakke', 'md'];
const WF_DOC_LANGS = ['da', 'de', 'en'];

/** Länder: Code => [de, da, en]. EU zuerst (Nachbarn oben), dann häufige Drittländer. */
function wf_countries(): array
{
    return [
        'DK' => ['Dänemark', 'Danmark', 'Denmark'], 'DE' => ['Deutschland', 'Tyskland', 'Germany'],
        'SE' => ['Schweden', 'Sverige', 'Sweden'], 'NL' => ['Niederlande', 'Holland', 'Netherlands'],
        'AT' => ['Österreich', 'Østrig', 'Austria'], 'BE' => ['Belgien', 'Belgien', 'Belgium'],
        'BG' => ['Bulgarien', 'Bulgarien', 'Bulgaria'], 'CY' => ['Zypern', 'Cypern', 'Cyprus'],
        'CZ' => ['Tschechien', 'Tjekkiet', 'Czechia'], 'EE' => ['Estland', 'Estland', 'Estonia'],
        'ES' => ['Spanien', 'Spanien', 'Spain'], 'FI' => ['Finnland', 'Finland', 'Finland'],
        'FR' => ['Frankreich', 'Frankrig', 'France'], 'GR' => ['Griechenland', 'Grækenland', 'Greece'],
        'HR' => ['Kroatien', 'Kroatien', 'Croatia'], 'HU' => ['Ungarn', 'Ungarn', 'Hungary'],
        'IE' => ['Irland', 'Irland', 'Ireland'], 'IT' => ['Italien', 'Italien', 'Italy'],
        'LT' => ['Litauen', 'Litauen', 'Lithuania'], 'LU' => ['Luxemburg', 'Luxembourg', 'Luxembourg'],
        'LV' => ['Lettland', 'Letland', 'Latvia'], 'MT' => ['Malta', 'Malta', 'Malta'],
        'PL' => ['Polen', 'Polen', 'Poland'], 'PT' => ['Portugal', 'Portugal', 'Portugal'],
        'RO' => ['Rumänien', 'Rumænien', 'Romania'], 'SI' => ['Slowenien', 'Slovenien', 'Slovenia'],
        'SK' => ['Slowakei', 'Slovakiet', 'Slovakia'],
        'NO' => ['Norwegen', 'Norge', 'Norway'], 'CH' => ['Schweiz', 'Schweiz', 'Switzerland'],
        'GB' => ['Vereinigtes Königreich', 'Storbritannien', 'United Kingdom'], 'IS' => ['Island', 'Island', 'Iceland'],
        'FO' => ['Färöer', 'Færøerne', 'Faroe Islands'], 'GL' => ['Grönland', 'Grønland', 'Greenland'],
        'LI' => ['Liechtenstein', 'Liechtenstein', 'Liechtenstein'], 'US' => ['USA', 'USA', 'United States'],
        'XX' => ['Anderes Land', 'Andet land', 'Other country'],
    ];
}
function wf_country_name(string $code, string $lang): string
{
    $c = wf_countries()[$code] ?? null;
    return $c ? $c[['de' => 0, 'da' => 1, 'en' => 2][$lang] ?? 1] : $code;
}

// ---------- Firmendaten ----------
function wf_company_defaults(): array
{
    return [
        'name' => '', 'owner' => '', 'street' => '', 'zip' => '', 'city' => '', 'country' => 'DK',
        'cvr' => '', 'email' => '', 'phone' => '', 'web' => '',
        'bank' => '', 'reg_no' => '', 'account_no' => '', 'iban' => '', 'bic' => '',
        'moms_registered' => true, 'moms_period' => 'half', 'invoice_start' => 1, 'pay_days' => 14, 'phone_share' => 50, 'hour_rate' => 0,
    ];
}
function wf_company(): array
{
    $raw = wf_db()->query("SELECT value FROM meta WHERE key = 'company'")->fetchColumn();
    $c = $raw ? json_decode((string)$raw, true) : [];
    return array_replace(wf_company_defaults(), is_array($c) ? $c : []);
}
function wf_is_live(PDO $db): bool
{
    return (bool)$db->query("SELECT 1 FROM meta WHERE key = 'live_since'")->fetchColumn();
}

/** Nur Testphase: Buchhaltung leeren. Sperr-Trigger werden kurz entfernt und unverändert wieder angelegt. */
function wf_accounting_reset(PDO $db): array
{
    $dir = rtrim((string)wf_cfg('data_dir'), '/') . '/uploads/';
    $n = ['invoices' => (int)$db->query("SELECT COUNT(*) FROM invoices")->fetchColumn(), 'expenses' => (int)$db->query("SELECT COUNT(*) FROM expenses")->fetchColumn()];
    $files = $db->query("SELECT file_stored FROM expenses WHERE file_stored IS NOT NULL AND file_stored <> ''")->fetchAll(PDO::FETCH_COLUMN);
    $tables = ['invoices', 'invoice_lines', 'invoice_payments', 'journal', 'expenses', 'vat_returns'];
    $db->beginTransaction();
    $trg = $db->query("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name IN ('" . implode("','", $tables) . "')")->fetchAll();
    foreach ($trg as $t) {
        $db->exec('DROP TRIGGER "' . $t['name'] . '"');
    }
    foreach (['invoice_payments', 'invoice_lines', 'invoices', 'journal', 'expenses', 'vat_returns', 'bank_tx', 'archive_queue'] as $tb) {
        $db->exec("DELETE FROM $tb");
    }
    $db->exec("DELETE FROM sqlite_sequence WHERE name IN ('invoices', 'invoice_lines', 'invoice_payments', 'journal', 'expenses', 'bank_tx', 'archive_queue')");
    $db->exec("DELETE FROM meta WHERE key LIKE 'eu_reported:%' OR key = 'archive_last_backup'");
    foreach ($trg as $t) {
        $db->exec($t['sql']);
    }
    $db->commit();
    foreach ($files as $fn) {
        @unlink($dir . $fn);
        array_map('unlink', glob($dir . 'thumbs/' . $fn . '.*') ?: []);
    }
    wf_touch();
    return $n;
}

function wf_company_save(array $c): void
{
    wf_db()->prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('company', ?)")->execute([json_encode($c, JSON_UNESCAPED_UNICODE)]);
}
/** Was für eine rechtsgültige Rechnung fehlt (leer = vollständig). */
function wf_company_missing(array $c): array
{
    $m = [];
    foreach (['name', 'street', 'zip', 'city', 'cvr'] as $k) {
        if (trim((string)$c[$k]) === '') {
            $m[] = $k;
        }
    }
    if (trim((string)$c['iban']) === '' && (trim((string)$c['reg_no']) === '' || trim((string)$c['account_no']) === '')) {
        $m[] = 'bank';
    }
    return $m;
}

/** CVR: 8 Ziffern, Prüfziffer Modulo 11 (Gewichte 2,7,6,5,4,3,2,1). */
function wf_cvr_valid(string $cvr): bool
{
    if (!preg_match('/^\d{8}$/', $cvr)) {
        return false;
    }
    $w = [2, 7, 6, 5, 4, 3, 2, 1];
    $s = 0;
    for ($i = 0; $i < 8; $i++) {
        $s += (int)$cvr[$i] * $w[$i];
    }
    return $s % 11 === 0;
}

/** USt-ID normalisieren: Großbuchstaben, ohne Leer-/Trennzeichen, mit Länderpräfix (Griechenland = EL). */
function wf_vat_norm(string $vat, string $country): string
{
    $v = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $vat) ?? '');
    if ($v === '') {
        return '';
    }
    $pre = $country === 'GR' ? 'EL' : $country;
    if (preg_match('/^[A-Z]{2}/', $v) && !ctype_digit(substr($v, 0, 2))) {
        return $v;
    }
    return in_array($country, WF_EU, true) ? $pre . $v : $v;
}

// ---------- Moms ----------
function wf_scheme_rate(string $scheme): int
{
    return in_array($scheme, ['dk', 'eu_b2c'], true) ? 25 : 0;
}
/** Automatische Moms-Regel aus Firmen- und Kundendaten. */
function wf_scheme_auto(array $company, array $cust): string
{
    if (empty($company['moms_registered'])) {
        return 'novat';
    }
    $cc = (string)($cust['country'] ?? 'DK');
    if ($cc === 'DK') {
        return 'dk';
    }
    if (in_array($cc, WF_EU, true)) {
        return (!empty($cust['is_business']) && trim((string)($cust['vat_id'] ?? '')) !== '') ? 'eu_rc' : 'eu_b2c';
    }
    return 'export';
}

/** Beträge rechnen. $lines: [qty, unit_price (Øre), discount (%)]. Gibt Zeilenbeträge und Summen zurück. */
function wf_inv_calc(array $lines, string $scheme, bool $incl, string $rate): array
{
    $sum = 0;
    $out = [];
    foreach ($lines as $l) {
        $a = (int)round((float)$l['qty'] * (int)$l['unit_price'] * (1 - (float)$l['discount'] / 100));
        $out[] = $a;
        $sum += $a;
    }
    $r = wf_scheme_rate($scheme);
    if ($r === 0) {
        $net = $sum;
        $vat = 0;
    } elseif ($incl) {
        $vat = (int)round($sum * $r / (100 + $r));
        $net = $sum - $vat;
    } else {
        $net = $sum;
        $vat = (int)round($sum * $r / 100);
    }
    $fx = (float)$rate > 0 ? (float)$rate : 0.0;
    $netDkk = (int)round($net * $fx);
    $vatDkk = (int)round($vat * $fx);
    return ['amounts' => $out, 'net' => $net, 'vat' => $vat, 'total' => $net + $vat, 'rate_pct' => $r,
        'net_dkk' => $netDkk, 'vat_dkk' => $vatDkk, 'total_dkk' => $netDkk + $vatDkk];
}

/** Benutzereingabe "1.234,50" / "1234.5" -> Øre; null bei Unsinn. */
function wf_to_cents($v, bool $allowNeg = false): ?int
{
    if (is_int($v) || is_float($v)) {
        $s = (string)$v;
    } elseif (is_string($v)) {
        $s = trim(str_replace(' ', '', $v));
        if (preg_match('/^-?\d{1,3}(\.\d{3})+(,\d+)?$/', $s)) {
            $s = str_replace('.', '', $s);
        }
        $s = str_replace(',', '.', $s);
    } else {
        return null;
    }
    if ($s === '' || !is_numeric($s)) {
        return null;
    }
    $c = (int)round((float)$s * 100);
    if ((!$allowNeg && $c < 0) || abs($c) > 100000000000) {
        return null;
    }
    return $c;
}

// ---------- Netzwerk (Kurs, VIES) ----------
function wf_http(string $url, ?string $json = null, int $timeout = 6): ?string
{
    if (getenv('WF_OFFLINE')) {
        return null;
    }
    $headers = ['Accept: application/json, text/xml, */*', 'User-Agent: WunschFabrik-Auftraege/1.0'];
    if ($json !== null) {
        $headers[] = 'Content-Type: application/json';
    }
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => $timeout, CURLOPT_CONNECTTIMEOUT => 4,
            CURLOPT_HTTPHEADER => $headers, CURLOPT_FOLLOWLOCATION => true, CURLOPT_MAXREDIRS => 3]);
        if ($json !== null) {
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $json);
        }
        $r = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        return ($r !== false && $code >= 200 && $code < 300) ? (string)$r : null;
    }
    $ctx = stream_context_create(['http' => ['method' => $json !== null ? 'POST' : 'GET', 'header' => implode("\r\n", $headers),
        'content' => $json ?? '', 'timeout' => $timeout, 'ignore_errors' => false]]);
    $r = @file_get_contents($url, false, $ctx);
    return $r === false ? null : $r;
}

/** Tageskurs DKK je 1 Einheit: Danmarks Nationalbank, sonst EZB (frankfurter.app). Tagescache in meta. */
function wf_rate(string $cur): ?array
{
    if ($cur === 'DKK') {
        return ['rate' => '1', 'date' => date('Y-m-d'), 'source' => ''];
    }
    $db = wf_db();
    $key = 'rate_' . $cur;
    $cached = $db->prepare('SELECT value FROM meta WHERE key = ?');
    $cached->execute([$key]);
    $c = json_decode((string)($cached->fetchColumn() ?: ''), true);
    if (is_array($c) && ($c['fetched'] ?? '') === date('Y-m-d')) {
        return $c;
    }
    $res = null;
    $xml = wf_http('https://www.nationalbanken.dk/api/currencyratesxml?lang=da');
    if ($xml && preg_match('/<dailyrates id="(\d{4}-\d{2}-\d{2})"/', $xml, $d)
        && preg_match('/<currency code="' . preg_quote($cur, '/') . '"[^>]*rate="([\d.,]+)"/', $xml, $m)) {
        $res = ['rate' => rtrim(rtrim(sprintf('%.6F', (float)str_replace(',', '.', $m[1]) / 100), '0'), '.'), 'date' => $d[1], 'source' => 'Danmarks Nationalbank'];
    }
    if (!$res) {
        $j = json_decode((string)wf_http('https://api.frankfurter.app/latest?from=' . urlencode($cur) . '&to=DKK'), true);
        if (is_array($j) && !empty($j['rates']['DKK'])) {
            $res = ['rate' => rtrim(rtrim(sprintf('%.6F', (float)$j['rates']['DKK']), '0'), '.'), 'date' => (string)$j['date'], 'source' => 'EZB/ECB'];
        }
    }
    if ($res) {
        $res['fetched'] = date('Y-m-d');
        $db->prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')->execute([$key, json_encode($res)]);
    }
    return $res ?: (is_array($c) ? $c + ['stale' => true] : null);
}

/** EU-Prüfung der USt-ID (VIES). null = Dienst nicht erreichbar. */
function wf_vies(string $vat): ?array
{
    if (!preg_match('/^([A-Z]{2})([A-Z0-9]{2,14})$/', $vat, $m)) {
        return ['valid' => false, 'name' => ''];
    }
    $r = wf_http('https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number', json_encode(['countryCode' => $m[1], 'vatNumber' => $m[2]]), 10);
    $j = $r ? json_decode($r, true) : null;
    if (!is_array($j) || !array_key_exists('valid', $j)) {
        return null;
    }
    $name = trim((string)($j['name'] ?? ''));
    return ['valid' => (bool)$j['valid'], 'name' => $name === '---' ? '' : $name];
}

// ---------- Journal mit Hash-Kette ----------
function wf_journal(PDO $db, string $user, string $kind, ?int $ref, array $data): string
{
    $prev = (string)($db->query('SELECT hash FROM journal ORDER BY id DESC LIMIT 1')->fetchColumn() ?: str_repeat('0', 64));
    $at = gmdate('Y-m-d H:i:s');
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $hash = hash('sha256', implode('|', [$prev, $at, $user, $kind, (string)$ref, $json]));
    $db->prepare('INSERT INTO journal (at, user_name, kind, ref_id, data, prev_hash, hash) VALUES (?,?,?,?,?,?,?)')
        ->execute([$at, $user, $kind, $ref, $json, $prev, $hash]);
    return $hash;
}

/** Kanonischer Inhalt einer Rechnung (für den Prüf-Hash). */
function wf_inv_fingerprint(array $inv, array $lines): string
{
    $keys = ['type', 'number', 'customer_id', 'credit_of', 'issue_date', 'delivery_date', 'due_date', 'currency', 'rate', 'rate_date',
        'vat_scheme', 'prices_incl', 'lang', 'customer_snap', 'seller_snap', 'note', 'net', 'vat', 'total', 'net_dkk', 'vat_dkk', 'total_dkk'];
    $h = [];
    foreach ($keys as $k) {
        $h[$k] = (string)($inv[$k] ?? '');
    }
    $h['lines'] = array_map(fn($l) => [(string)$l['pos'], (string)$l['description'], (string)(float)$l['qty'], (string)$l['unit'],
        (string)$l['unit_price'], (string)(float)$l['discount'], (string)$l['kind'], (string)$l['amount']], $lines);
    return hash('sha256', json_encode($h, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}

/** Prüft die ganze Kette und alle festgeschriebenen Rechnungen. */
function wf_journal_verify(PDO $db): array
{
    $prev = str_repeat('0', 64);
    $n = 0;
    $bad = [];
    foreach ($db->query('SELECT * FROM journal ORDER BY id') as $j) {
        $h = hash('sha256', implode('|', [$prev, $j['at'], $j['user_name'], $j['kind'], (string)($j['ref_id'] ?? ''), $j['data']]));
        if ($j['prev_hash'] !== $prev || $j['hash'] !== $h) {
            $bad[] = 'journal#' . $j['id'];
        }
        $prev = $j['hash'];
        $n++;
    }
    $inv = 0;
    foreach ($db->query("SELECT * FROM invoices WHERE status = 'final' ORDER BY number")->fetchAll() as $i) {
        $l = $db->prepare('SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY pos');
        $l->execute([$i['id']]);
        if (wf_inv_fingerprint($i, $l->fetchAll()) !== $i['hash']) {
            $bad[] = 'nr ' . $i['number'];
        }
        $inv++;
    }
    // gebuchte Ausgaben inkl. Prüfsumme der Belegdatei
    $exp = 0;
    if (function_exists('wf_exp_fingerprint')) {
        foreach ($db->query("SELECT * FROM expenses WHERE status = 'final' ORDER BY number")->fetchAll() as $x) {
            if (wf_exp_fingerprint($x) !== $x['hash']) {
                $bad[] = 'bilag ' . $x['number'];
            }
            $exp++;
        }
    }
    // Lücken in der Nummernfolge
    $nums = $db->query("SELECT number FROM invoices WHERE status = 'final' ORDER BY number")->fetchAll(PDO::FETCH_COLUMN);
    for ($k = 1; $k < count($nums); $k++) {
        if ((int)$nums[$k] !== (int)$nums[$k - 1] + 1) {
            $bad[] = 'gap ' . $nums[$k - 1] . '-' . $nums[$k];
        }
    }
    return ['ok' => !$bad, 'entries' => $n, 'invoices' => $inv, 'expenses' => $exp, 'problems' => $bad];
}

// ---------- Laden, Offene Beträge ----------
function wf_inv_load(PDO $db, int $id): ?array
{
    $st = $db->prepare('SELECT * FROM invoices WHERE id = ?');
    $st->execute([$id]);
    $i = $st->fetch();
    if (!$i) {
        return null;
    }
    $l = $db->prepare('SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY pos');
    $l->execute([$id]);
    $i['lines'] = $l->fetchAll();
    $p = $db->prepare('SELECT * FROM invoice_payments WHERE invoice_id = ? ORDER BY date, id');
    $p->execute([$id]);
    $i['payments'] = $p->fetchAll();
    $i['customer_snap'] = json_decode($i['customer_snap'], true) ?: [];
    $i['seller_snap'] = json_decode($i['seller_snap'], true) ?: [];
    return $i;
}

/** Offener Betrag einer Rechnung: Summe - Zahlungen - festgeschriebene Kreditnotas + Rückzahlungen auf diese. */
function wf_inv_open(PDO $db, array $inv): array
{
    $paid = (int)$db->query('SELECT COALESCE(SUM(amount),0) FROM invoice_payments WHERE invoice_id = ' . (int)$inv['id'])->fetchColumn();
    if ($inv['type'] === 'credit' || $inv['status'] !== 'final') {
        return ['paid' => $paid, 'credited' => 0, 'refunded' => 0, 'open' => 0];
    }
    $cr = $db->query("SELECT COALESCE(SUM(total),0) AS t, COALESCE(SUM((SELECT COALESCE(SUM(amount),0) FROM invoice_payments p WHERE p.invoice_id = c.id)),0) AS r
                      FROM invoices c WHERE c.credit_of = " . (int)$inv['id'] . " AND c.status = 'final'")->fetch();
    return ['paid' => $paid, 'credited' => (int)$cr['t'], 'refunded' => (int)$cr['r'], 'open' => (int)$inv['total'] - $paid - (int)$cr['t'] + (int)$cr['r']];
}

/** Kundendaten, wie sie auf der Rechnung stehen. */
function wf_customer_snap(array $c): array
{
    return ['name' => $c['name'], 'company' => $c['company'], 'address' => $c['address'], 'country' => $c['country'],
        'vat_id' => $c['vat_id'], 'is_business' => (int)$c['is_business'], 'email' => $c['email'],
        'vat_valid' => $c['vat_valid'] === null ? null : (int)$c['vat_valid'], 'vat_checked_at' => $c['vat_checked_at']];
}
function wf_doc_lang_for(array $c): string
{
    if (in_array($c['doc_lang'] ?? '', WF_DOC_LANGS, true)) {
        return $c['doc_lang'];
    }
    $cc = $c['country'] ?? 'DK';
    return $cc === 'DK' ? 'da' : (in_array($cc, ['DE', 'AT', 'CH', 'LI', 'LU'], true) ? 'de' : 'en');
}

/** Rechnet einen Entwurf neu und speichert Zeilenbeträge + Summen. */
function wf_inv_recalc(PDO $db, int $id): array
{
    $i = wf_inv_load($db, $id);
    $c = wf_inv_calc($i['lines'], $i['vat_scheme'], (bool)$i['prices_incl'], $i['rate']);
    $u = $db->prepare('UPDATE invoice_lines SET amount = ? WHERE id = ?');
    foreach ($i['lines'] as $k => $l) {
        $u->execute([$c['amounts'][$k], $l['id']]);
    }
    $db->prepare('UPDATE invoices SET net=?, vat=?, total=?, net_dkk=?, vat_dkk=?, total_dkk=? WHERE id = ? AND status = \'draft\'')
        ->execute([$c['net'], $c['vat'], $c['total'], $c['net_dkk'], $c['vat_dkk'], $c['total_dkk'], $id]);
    return $c;
}

/**
 * Festschreiben: prüft alles, vergibt die nächste Nummer, friert Kunden-/Firmendaten ein, sperrt den Inhalt
 * und schreibt einen Journaleintrag. Wirft RuntimeException mit Fehlercode.
 */
function wf_inv_approve(PDO $db, int $id, string $user): array
{
    $db->beginTransaction();
    try {
        $i = wf_inv_load($db, $id);
        if (!$i) {
            throw new RuntimeException('not_found');
        }
        if ($i['status'] !== 'draft') {
            throw new RuntimeException('invoice_locked');
        }
        $co = wf_company();
        $miss = wf_company_missing($co);
        if ($miss) {
            throw new RuntimeException('company_incomplete:' . implode(',', $miss));
        }
        $cs = $db->prepare('SELECT * FROM customers WHERE id = ?');
        $cs->execute([$i['customer_id']]);
        $cust = $cs->fetch();
        if (!$cust || $cust['anonymized_at']) {
            throw new RuntimeException('bad_customer');
        }
        $today = date('Y-m-d');
        if ($i['issue_date'] > $today) {
            throw new RuntimeException('issue_in_future');
        }
        $rep = (string)($db->query('SELECT MAX(period_to) FROM vat_returns')->fetchColumn() ?: '');
        if ($rep !== '' && $i['issue_date'] <= $rep) {
            throw new RuntimeException('period_reported:' . $rep);
        }
        $last = (string)($db->query("SELECT MAX(issue_date) FROM invoices WHERE status = 'final'")->fetchColumn() ?: '');
        if ($last !== '' && $i['issue_date'] < $last) {
            throw new RuntimeException('issue_before_last:' . $last);
        }
        if (!$i['lines']) {
            throw new RuntimeException('no_lines');
        }
        foreach ($i['lines'] as $l) {
            if (trim($l['description']) === '') {
                throw new RuntimeException('line_text_missing');
            }
        }
        if ($i['purpose'] === 'final' && $i['order_id'] && (int)$db->query("SELECT COUNT(*) FROM invoices WHERE order_id = " . (int)$i['order_id'] . " AND purpose = 'deposit' AND status = 'draft'")->fetchColumn()) {
            throw new RuntimeException('deposit_draft_open');
        }
        if ($i['currency'] !== 'DKK' && (float)$i['rate'] <= 0) {
            throw new RuntimeException('rate_missing');
        }
        // Moms-Regel: Kreditnota übernimmt die der Rechnung; sonst automatisch, außer bewusst gewählt
        if ($i['type'] === 'invoice' && !$i['scheme_manual']) {
            $i['vat_scheme'] = wf_scheme_auto($co, $cust);
        }
        if ($i['vat_scheme'] === 'eu_rc' && trim($cust['vat_id']) === '' && $i['type'] === 'invoice') {
            throw new RuntimeException('vat_id_required');
        }
        $calc = wf_inv_calc($i['lines'], $i['vat_scheme'], (bool)$i['prices_incl'], $i['rate']);
        if ($calc['total'] <= 0) {
            throw new RuntimeException('total_zero');
        }
        $needAddr = $cust['is_business'] || $i['vat_scheme'] !== 'dk' || $calc['total_dkk'] > 300000;
        if ($needAddr && trim($cust['address']) === '') {
            throw new RuntimeException('customer_address_missing');
        }
        $snap = wf_customer_snap($cust);
        if ($i['type'] === 'credit') {
            $orig = wf_inv_load($db, (int)$i['credit_of']);
            if (!$orig || $orig['status'] !== 'final' || $orig['type'] !== 'invoice') {
                throw new RuntimeException('bad_credit_ref');
            }
            $done = (int)$db->query("SELECT COALESCE(SUM(total),0) FROM invoices WHERE credit_of = " . (int)$orig['id'] . " AND status = 'final'")->fetchColumn();
            if ($calc['total'] > (int)$orig['total'] - $done) {
                throw new RuntimeException('credit_too_high');
            }
            $snap = $orig['customer_snap'];   // Kreditnota spiegelt exakt die Rechnung
        }
        $start = max(1, (int)$co['invoice_start']);
        $max = (int)($db->query("SELECT MAX(number) FROM invoices WHERE status = 'final'")->fetchColumn() ?: 0);
        $number = max($max + 1, $max === 0 ? $start : 0);
        $seller = array_intersect_key($co, array_flip(['name', 'owner', 'street', 'zip', 'city', 'country', 'cvr', 'email', 'phone', 'web', 'bank', 'reg_no', 'account_no', 'iban', 'bic', 'moms_registered']));

        $u = $db->prepare('UPDATE invoice_lines SET amount = ? WHERE id = ?');
        foreach ($i['lines'] as $k => $l) {
            $u->execute([$calc['amounts'][$k], $l['id']]);
            $i['lines'][$k]['amount'] = $calc['amounts'][$k];
        }
        $row = ['type' => $i['type'], 'number' => $number, 'customer_id' => $i['customer_id'], 'credit_of' => $i['credit_of'],
            'issue_date' => $i['issue_date'], 'delivery_date' => $i['delivery_date'], 'due_date' => $i['due_date'],
            'currency' => $i['currency'], 'rate' => $i['rate'], 'rate_date' => $i['rate_date'], 'vat_scheme' => $i['vat_scheme'],
            'prices_incl' => $i['prices_incl'], 'lang' => $i['lang'],
            'customer_snap' => json_encode($snap, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'seller_snap' => json_encode($seller, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'note' => $i['note'], 'net' => $calc['net'], 'vat' => $calc['vat'], 'total' => $calc['total'],
            'net_dkk' => $calc['net_dkk'], 'vat_dkk' => $calc['vat_dkk'], 'total_dkk' => $calc['total_dkk']];
        $hash = wf_inv_fingerprint($row, $i['lines']);
        $db->prepare("UPDATE invoices SET number=?, vat_scheme=?, customer_snap=?, seller_snap=?, net=?, vat=?, total=?, net_dkk=?, vat_dkk=?, total_dkk=?,
                      hash=?, status='final', approved_at=datetime('now'), approved_by=? WHERE id = ? AND status = 'draft'")
            ->execute([$number, $row['vat_scheme'], $row['customer_snap'], $row['seller_snap'], $calc['net'], $calc['vat'], $calc['total'],
                $calc['net_dkk'], $calc['vat_dkk'], $calc['total_dkk'], $hash, $user, $id]);
        wf_journal($db, $user, $i['type'] === 'credit' ? 'credit_final' : 'invoice_final', $id, [
            'number' => $number, 'date' => $i['issue_date'], 'customer' => $snap['name'], 'scheme' => $row['vat_scheme'],
            'currency' => $i['currency'], 'rate' => $i['rate'], 'net' => $calc['net'], 'vat' => $calc['vat'], 'total' => $calc['total'],
            'net_dkk' => $calc['net_dkk'], 'vat_dkk' => $calc['vat_dkk'], 'credit_of' => $i['credit_of'] ? (int)$i['credit_of'] : null, 'hash' => $hash]);
        $db->commit();
        return ['number' => $number];
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $e;
    }
}

// ---------- Auftrag <-> Rechnung ----------
/** Zeilentexte fuer automatisch erzeugte Rechnungen in der Belegsprache. */
function wf_order_line_text(string $key, string $lang, array $r): string
{
    $T = [
        'deposit' => ['da' => 'Forudbetaling (a conto) – ordre {nr}: {title}', 'de' => 'Anzahlung – Auftrag {nr}: {title}', 'en' => 'Deposit – order {nr}: {title}'],
        'deduct' => ['da' => 'Fradrag forudbetaling, faktura nr. {n} af {d}', 'de' => 'Abzüglich Anzahlung, Rechnung Nr. {n} vom {d}', 'en' => 'Less deposit, invoice no. {n} dated {d}'],
        'pcs' => ['da' => 'stk.', 'de' => 'Stk.', 'en' => 'pcs'],
    ];
    return strtr($T[$key][$lang] ?? $T[$key]['da'], $r);
}

/** Anzahlungs-/Hauptrechnungen eines Auftrags (ohne Kreditnotas), mit offenem Betrag und Gutschriften. */
function wf_order_invoices(PDO $db, int $orderId): array
{
    $st = $db->prepare("SELECT * FROM invoices WHERE order_id = ? AND type = 'invoice' ORDER BY id");
    $st->execute([$orderId]);
    $out = [];
    foreach ($st->fetchAll() as $i) {
        $b = wf_inv_open($db, $i);
        $cr = $db->query("SELECT COALESCE(SUM(net),0) AS n, COALESCE(SUM(total),0) AS t FROM invoices WHERE credit_of = " . (int)$i['id'] . " AND status = 'final'")->fetch();
        $i['balance'] = $b;
        $i['credited_net'] = (int)$cr['n'];
        $i['fully_credited'] = $i['status'] === 'final' && (int)$cr['t'] >= (int)$i['total'];
        $out[] = $i;
    }
    return $out;
}

/** Preise inkl. Moms bei Privatkunden mit Moms, sonst netto (B2B-Ueblichkeit). */
function wf_default_incl(string $scheme, array $cust): int
{
    return in_array($scheme, ['dk', 'eu_b2c'], true) && empty($cust['is_business']) ? 1 : 0;
}

/**
 * Entwurf aus Auftrag: 'deposit' = Anzahlungsrechnung ueber $amount (Standard 50 % des Preises), 'final' = Schlussrechnung ueber den Auftragspreis
 * abzueglich festgeschriebener Anzahlungsrechnungen. Gibt die Rechnungs-ID zurueck (bestehender Entwurf wird wiederverwendet).
 */
function wf_order_invoice(PDO $db, int $orderId, string $purpose, string $user, ?int $amount = null): int
{
    $st = $db->prepare('SELECT * FROM orders WHERE id = ? AND deleted_at IS NULL');
    $st->execute([$orderId]);
    $o = $st->fetch();
    if (!$o) {
        throw new RuntimeException('not_found');
    }
    $cs = $db->prepare('SELECT * FROM customers WHERE id = ? AND anonymized_at IS NULL');
    $cs->execute([$o['customer_id']]);
    $cust = $cs->fetch();
    if (!$cust) {
        throw new RuntimeException('bad_customer');
    }
    $all = wf_order_invoices($db, $orderId);
    $deposits = array_values(array_filter($all, fn($i) => $i['purpose'] === 'deposit' && !$i['fully_credited']));
    $mains = array_values(array_filter($all, fn($i) => $i['purpose'] !== 'deposit' && !$i['fully_credited']));
    $co = wf_company();
    $lang = wf_doc_lang_for($cust);
    $scheme = wf_scheme_auto($co, $cust);
    $manual = 0;
    $incl = wf_default_incl($scheme, $cust);
    $price = (int)round((float)$o['price'] * 100);
    $lines = [];

    if ($purpose === 'deposit') {
        if ($mains) {
            throw new RuntimeException('main_invoice_exists');
        }
        foreach ($deposits as $d) {
            if ($d['status'] === 'draft') {
                return (int)$d['id'];
            }
        }
        $dep = $amount ?? (int)round($price / 2);
        if ($dep <= 0) {
            throw new RuntimeException('no_deposit');
        }
        $already = array_sum(array_map(fn($d) => (int)$d['total'], $deposits));
        if ($already + $dep > $price && $price > 0) {
            throw new RuntimeException('deposit_too_high');
        }
        $incl = in_array($scheme, ['dk', 'eu_b2c'], true) ? 1 : 0;   // Anzahlung = Betrag, den der Kunde zahlt
        $lines[] = ['description' => wf_order_line_text('deposit', $lang, ['{nr}' => $o['nr'], '{title}' => $o['title']]), 'qty' => 1, 'unit' => 'stk', 'unit_price' => $dep, 'discount' => 0, 'kind' => 'goods'];
    } else {
        foreach ($mains as $m) {
            return (int)$m['id'];   // gibt es schon (Entwurf oder festgeschrieben): nicht doppelt anlegen
        }
        foreach ($deposits as $d) {
            if ($d['status'] === 'draft') {
                throw new RuntimeException('deposit_draft_open');
            }
        }
        if ($deposits) {
            // Gleiche Moms-Regel und Preisart wie die Anzahlung, sonst stimmt der Abzug nicht
            $scheme = $deposits[0]['vat_scheme'];
            $manual = 1;
            $incl = (int)$deposits[0]['prices_incl'];
        }
        $qty = max(1, (int)$o['qty']);
        $even = $price % $qty === 0;
        $desc = trim($o['title'] . ($o['article'] !== '' ? ' · ' . $o['article'] : '')) . ($even || $qty === 1 ? '' : ' (' . $qty . ' ' . wf_order_line_text('pcs', $lang, []) . ')');
        $lines[] = ['description' => $desc, 'qty' => $even ? $qty : 1, 'unit' => 'stk', 'unit_price' => $even ? intdiv($price, $qty) : $price, 'discount' => 0, 'kind' => 'goods'];
        foreach ($deposits as $d) {
            $credNet = (int)$d['credited_net'];
            $credTot = (int)$d['balance']['credited'];
            $amount = $incl ? (int)$d['total'] - $credTot : (int)$d['net'] - $credNet;
            if ($amount > 0) {
                $lines[] = ['description' => wf_order_line_text('deduct', $lang, ['{n}' => $d['number'], '{d}' => wf_doc_date($d['issue_date'], $lang)]), 'qty' => 1, 'unit' => 'stk', 'unit_price' => -$amount, 'discount' => 0, 'kind' => 'goods'];
            }
        }
    }
    $issue = date('Y-m-d');
    $cur = in_array($o['currency'], ['DKK', 'EUR'], true) ? $o['currency'] : 'DKK';
    $rate = '1';
    $rd = null;
    $rs = '';
    if ($cur !== 'DKK') {
        $r = wf_rate($cur);
        [$rate, $rd, $rs] = $r ? [$r['rate'], $r['date'], $r['source']] : ['0', null, ''];
    }
    $db->beginTransaction();
    $db->prepare('INSERT INTO invoices (purpose, customer_id, order_id, issue_date, delivery_date, due_date, currency, rate, rate_date, rate_source, vat_scheme, scheme_manual, prices_incl, lang, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        ->execute([$purpose, $o['customer_id'], $orderId, $issue, $purpose === 'final' && $o['due_date'] && $o['due_date'] < $issue ? $o['due_date'] : null,
            date('Y-m-d', strtotime("+{$co['pay_days']} days")), $cur, $rate, $rd, $rs, $scheme, $manual, $incl, $lang, $user]);
    $id = (int)$db->lastInsertId();
    $ins = $db->prepare('INSERT INTO invoice_lines (invoice_id, pos, description, qty, unit, unit_price, discount, kind) VALUES (?,?,?,?,?,?,?,?)');
    foreach ($lines as $k => $l) {
        $ins->execute([$id, $k + 1, $l['description'], $l['qty'], $l['unit'], $l['unit_price'], $l['discount'], $l['kind']]);
    }
    wf_inv_recalc($db, $id);
    $db->commit();
    return $id;
}

/**
 * Zahlstatus des Auftrags aus seinen Rechnungen ableiten (nur wenn es festgeschriebene Rechnungen gibt):
 * Hauptrechnung voll bezahlt = bezahlt; sonst bezahlte Anzahlung = Anzahlung; sonst offen.
 */
function wf_order_sync_pay(PDO $db, ?int $orderId): void
{
    if (!$orderId) {
        return;
    }
    $inv = array_values(array_filter(wf_order_invoices($db, $orderId), fn($i) => $i['status'] === 'final' && !$i['fully_credited']));
    if (!$inv) {
        return;
    }
    $mains = array_filter($inv, fn($i) => $i['purpose'] !== 'deposit');
    $deps = array_filter($inv, fn($i) => $i['purpose'] === 'deposit');
    $paidCents = array_sum(array_map(fn($i) => $i['balance']['paid'] - $i['balance']['refunded'], $inv));
    if ($mains && !array_filter($mains, fn($i) => $i['balance']['open'] > 0)) {
        $st = 'paid';
    } elseif ($deps && !array_filter($deps, fn($i) => $i['balance']['open'] > 0) || $paidCents > 0) {
        $st = 'deposit';
    } else {
        $st = 'open';
    }
    $cur = $db->query('SELECT pay_status FROM orders WHERE id = ' . $orderId)->fetchColumn();
    $db->prepare("UPDATE orders SET pay_status = ?, deposit = ?, updated_at = datetime('now') WHERE id = ?")
        ->execute([$st, $st === 'paid' ? (float)$db->query('SELECT price FROM orders WHERE id = ' . $orderId)->fetchColumn() : round(max(0, $paidCents) / 100, 2), $orderId]);
    if ($cur !== $st) {
        $db->prepare('INSERT INTO status_log (order_id, user_name, what) VALUES (?,?,?)')->execute([$orderId, 'Rechnung', 'pay:' . $st]);
    }
    wf_touch();
}

/** Firmendaten aus CVR (DK) bzw. VIES (EU) holen. null = nicht erreichbar. */
function wf_company_lookup(string $country, string $number): ?array
{
    $num = preg_replace('/[^A-Za-z0-9]/', '', $number) ?? '';
    if ($country === 'DK') {
        $num = preg_replace('/^DK/i', '', $num);
        $j = json_decode((string)wf_http('https://cvrapi.dk/api?search=' . urlencode($num) . '&country=dk'), true);
        if (is_array($j) && !empty($j['name'])) {
            return ['name' => (string)$j['name'], 'street' => (string)($j['address'] ?? ''), 'zip' => (string)($j['zipcode'] ?? ''), 'city' => (string)($j['city'] ?? ''), 'source' => 'CVR'];
        }
    }
    $vat = wf_vat_norm($num, $country);
    if (!preg_match('/^([A-Z]{2})([A-Z0-9]{2,14})$/', $vat, $m)) {
        return null;
    }
    $r = wf_http('https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number', json_encode(['countryCode' => $m[1], 'vatNumber' => $m[2]]), 10);
    $j = $r ? json_decode($r, true) : null;
    if (!is_array($j) || empty($j['valid'])) {
        return is_array($j) ? ['name' => '', 'valid' => false] : null;
    }
    $addr = trim(preg_replace('/\s*\n\s*/', ', ', (string)($j['address'] ?? '')) ?? '');
    return ['name' => trim((string)($j['name'] ?? '')) === '---' ? '' : trim((string)($j['name'] ?? '')), 'address' => $addr === '---' ? '' : $addr, 'valid' => true, 'source' => 'VIES'];
}
