<?php
declare(strict_types=1);

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
        'moms_registered' => true, 'moms_period' => 'half', 'invoice_start' => 1, 'pay_days' => 14,
    ];
}
function wf_company(): array
{
    $raw = wf_db()->query("SELECT value FROM meta WHERE key = 'company'")->fetchColumn();
    $c = $raw ? json_decode((string)$raw, true) : [];
    return array_replace(wf_company_defaults(), is_array($c) ? $c : []);
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
    // Lücken in der Nummernfolge
    $nums = $db->query("SELECT number FROM invoices WHERE status = 'final' ORDER BY number")->fetchAll(PDO::FETCH_COLUMN);
    for ($k = 1; $k < count($nums); $k++) {
        if ((int)$nums[$k] !== (int)$nums[$k - 1] + 1) {
            $bad[] = 'gap ' . $nums[$k - 1] . '-' . $nums[$k];
        }
    }
    return ['ok' => !$bad, 'entries' => $n, 'invoices' => $inv, 'problems' => $bad];
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
