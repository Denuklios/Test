<?php
declare(strict_types=1);
require_once __DIR__ . '/invoice.php';

/*
 * Ausgaben (Bilag) mit Købsmoms und Kontoauszug-Abgleich.
 * Beträge in Øre/Cent. vat_mode: dk = dänische Moms auf dem Beleg, none = keine Moms, eu_goods = Wareneinkauf EU ohne Moms
 * (Erwerbsmoms, Rubrik A Waren), rc_services = Dienstleistung aus dem Ausland ohne Moms (Reverse Charge, Rubrik A Ydelser).
 */

const WF_VAT_MODES = ['dk', 'none', 'eu_goods', 'rc_services'];

/** Kategorien: key => [de, da, abziehbarer Moms-Anteil in % oder 'phone', steuerlich absetzbar in %, Hinweis de, Hinweis da]. */
function wf_exp_categories(): array
{
    return [
        'material' => ['Material/Waren', 'Materialer/varer', 100, 100, 'Textilien, Garn, Folien, Rohlinge – voll absetzbar.', 'Tekstiler, garn, folie, emner – fuldt fradrag.'],
        'tools' => ['Werkzeug/Maschinen', 'Værktøj/maskiner', 100, 100, 'Bis 36.000 kr. netto sofort absetzbar, darüber abschreiben.', 'Op til 36.000 kr. ekskl. moms straksafskrives, derover afskrivning.'],
        'it' => ['Computer/IT', 'Computer/IT', 100, 100, 'PC, Drucker, Bildschirm.', 'PC, printer, skærm.'],
        'software' => ['Software/Abos', 'Software/abonnementer', 100, 100, 'Programme, Webseite, Domain. Ausländische Anbieter ohne Moms: „Dienstleistung Ausland“.', 'Programmer, hjemmeside, domæne. Udenlandsk udbyder uden moms: „ydelse fra udlandet“.'],
        'office' => ['Büro', 'Kontor', 100, 100, 'Papier, Patronen, Büromöbel.', 'Papir, patroner, kontormøbler.'],
        'phone_biz' => ['Telefon (nur Firma)', 'Telefon (kun firma)', 100, 100, 'Eigener Vertrag nur für die Firma.', 'Eget abonnement kun til firmaet.'],
        'phone_mixed' => ['Telefon/Internet (auch privat)', 'Telefon/internet (også privat)', 'phone', 100, 'Gemischte Nutzung: nur Firmenanteil der Moms (Standard 50 %).', 'Blandet brug: kun firmaets andel af momsen (standard 50 %).'],
        'rent' => ['Miete Werkstatt', 'Husleje værksted', 100, 100, 'Moms nur, wenn der Vermieter Moms berechnet.', 'Moms kun hvis udlejer opkræver moms.'],
        'utilities' => ['Strom/Wasser/Heizung (Werkstatt)', 'El/vand/varme (værksted)', 100, 100, 'Mit eigenem Zähler für die Werkstatt.', 'Med egen måler til værkstedet.'],
        'van' => ['Transporter (gelbe Kennzeichen)', 'Varebil (gule plader)', 100, 100, 'Kauf, Reparatur, Diesel – Moms voll.', 'Køb, reparation, brændstof – fuld moms.'],
        'car' => ['Pkw (weiße Kennzeichen)', 'Personbil (hvide plader)', 0, 0, 'Nie Moms. Steuerlich nur über Fahrtenbuch/Kilometergeld.', 'Aldrig moms. Skattemæssigt kun via kørebog/kørselsgodtgørelse.'],
        'parking' => ['Parken/Brücke/Fähre', 'Parkering/bro/færge', 100, 100, 'Moms nur beim Transporter abziehen.', 'Moms kun ved varebil.'],
        'shipping' => ['Versand/Porto', 'Forsendelse/porto', 100, 100, 'Pakete, Porto, Verpackung.', 'Pakker, porto, emballage.'],
        'marketing' => ['Werbung', 'Reklame', 100, 100, 'Anzeigen, Flyer, Messe, Social Media.', 'Annoncer, flyers, messe, sociale medier.'],
        'gifts' => ['Geschenke an Kunden', 'Gaver til kunder', 0, 25, 'Repräsentation: keine Moms, 25 % absetzbar.', 'Repræsentation: ingen moms, 25 % fradrag.'],
        'meals' => ['Bewirtung (25 %)', 'Repræsentation/restaurant (25 %)', 25, 25, 'Essen mit Kunden: 25 % Moms und Kosten. Notieren: mit wem, warum.', 'Spisning med kunder: 25 % moms og fradrag. Notér hvem og hvorfor.'],
        'hotel' => ['Hotel (Geschäftsreise)', 'Hotel (forretningsrejse)', 100, 100, 'Nur Übernachtung.', 'Kun overnatning.'],
        'travel' => ['Reise (Zug, Bus, Flug)', 'Rejse (tog, bus, fly)', 100, 100, 'Fahrkarten meist ohne Moms.', 'Billetter er oftest uden moms.'],
        'training' => ['Kurse/Fachliteratur', 'Kurser/faglitteratur', 100, 100, 'Für das jetzige Geschäft.', 'Til den nuværende virksomhed.'],
        'workwear' => ['Arbeitskleidung (Logo/Schutz)', 'Arbejdstøj (logo/sikkerhed)', 100, 100, 'Nur mit Logo oder Schutzkleidung.', 'Kun med logo eller sikkerhedstøj.'],
        'insurance' => ['Versicherung (Firma)', 'Forsikring (firma)', 0, 100, 'Versicherungen haben keine Moms.', 'Forsikringer er uden moms.'],
        'advisor' => ['Revisor/Beratung', 'Revisor/rådgivning', 100, 100, '', ''],
        'bank' => ['Bankgebühren', 'Bankgebyrer', 0, 100, 'Keine Moms.', 'Ingen moms.'],
        'misc' => ['Diverse', 'Diverse', 100, 100, '', ''],
    ];
}

function wf_exp_share(string $cat, array $co): int
{
    $c = wf_exp_categories()[$cat] ?? wf_exp_categories()['misc'];
    return $c[2] === 'phone' ? max(0, min(100, (int)($co['phone_share'] ?? 50))) : (int)$c[2];
}

/** Rechnet DKK-Beträge und abziehbare Moms. */
function wf_exp_calc(int $gross, int $vat, string $mode, int $share, string $rate): array
{
    $fx = $rate === '' ? 0.0 : (float)$rate;
    if ($mode === 'none') {
        $vat = 0;
    }
    if (in_array($mode, ['eu_goods', 'rc_services'], true)) {
        $vat = 0;   // auf dem Beleg steht keine Moms; wir berechnen sie selbst (Erwerbs-/Reverse-Charge-Moms)
    }
    $grossDkk = (int)round($gross * $fx);
    $vatDkk = (int)round($vat * $fx);
    $netDkk = $grossDkk - $vatDkk;
    $rc = in_array($mode, ['eu_goods', 'rc_services'], true) ? (int)round($netDkk * 0.25) : 0;
    $deduct = (int)round(($mode === 'dk' ? $vatDkk : $rc) * $share / 100);
    return ['vat' => $vat, 'gross_dkk' => $grossDkk, 'vat_dkk' => $vatDkk, 'net_dkk' => $netDkk, 'rc_vat_dkk' => $rc, 'deduct_dkk' => $deduct];
}

function wf_exp_load(PDO $db, int $id): ?array
{
    $st = $db->prepare('SELECT * FROM expenses WHERE id = ?');
    $st->execute([$id]);
    return $st->fetch() ?: null;
}

function wf_exp_fingerprint(array $e): string
{
    $k = ['number', 'date', 'supplier', 'supplier_country', 'supplier_vat', 'doc_no', 'description', 'category', 'currency', 'rate', 'gross', 'vat',
        'vat_mode', 'vat_share', 'gross_dkk', 'net_dkk', 'vat_dkk', 'rc_vat_dkk', 'deduct_dkk', 'file_stored', 'no_receipt', 'reverses'];
    $h = [];
    foreach ($k as $x) {
        $h[$x] = (string)($e[$x] ?? '');
    }
    if (!empty($e['vat_date']) && $e['vat_date'] !== $e['date']) {
        $h['vat_date'] = (string)$e['vat_date'];
    }
    if (!empty($e['file_stored'])) {
        $p = rtrim((string)wf_cfg('data_dir'), '/') . '/uploads/' . $e['file_stored'];
        $h['file_sha256'] = is_file($p) ? hash_file('sha256', $p) : '';
    }
    return hash('sha256', json_encode($h, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}

/** Bogføren: prüft, vergibt Bilagsnummer, sperrt, Journal. */
function wf_exp_approve(PDO $db, int $id, string $user): int
{
    $db->beginTransaction();
    try {
        $e = wf_exp_load($db, $id);
        if (!$e) {
            throw new RuntimeException('not_found');
        }
        if ($e['status'] !== 'draft') {
            throw new RuntimeException('expense_locked');
        }
        if ($e['date'] > date('Y-m-d')) {
            throw new RuntimeException('date_in_future');
        }
        if (trim($e['supplier']) === '') {
            throw new RuntimeException('supplier_missing');
        }
        if ((int)$e['gross'] === 0) {
            throw new RuntimeException('bad_amount');
        }
        if (!$e['file_stored'] && trim($e['no_receipt']) === '') {
            throw new RuntimeException('receipt_missing');
        }
        if ($e['currency'] !== 'DKK' && (float)$e['rate'] <= 0) {
            throw new RuntimeException('rate_missing');
        }
        if ($e['vat_mode'] === 'dk' && abs((int)$e['vat']) > abs((int)$e['gross']) * 0.2 + 1) {
            throw new RuntimeException('vat_too_high');   // 25 % Moms sind hoechstens 20 % vom Bruttobetrag
        }
        $c = wf_exp_calc((int)$e['gross'], (int)$e['vat'], $e['vat_mode'], (int)$e['vat_share'], $e['rate']);
        $number = (int)($db->query("SELECT COALESCE(MAX(number),0) FROM expenses WHERE status = 'final'")->fetchColumn()) + 1;
        // Momsdatum: Belegdatum; liegt es in einem schon gemeldeten Zeitraum, zaehlt die Ausgabe im naechsten offenen Zeitraum
        $lastRep = (string)($db->query('SELECT MAX(period_to) FROM vat_returns')->fetchColumn() ?: '');
        $vatDate = ($lastRep !== '' && $e['date'] <= $lastRep) ? date('Y-m-d', strtotime($lastRep . ' +1 day')) : $e['date'];
        $e = array_replace($e, $c, ['number' => $number, 'vat_date' => $vatDate]);
        $hash = wf_exp_fingerprint($e);
        $db->prepare("UPDATE expenses SET number=?, vat=?, gross_dkk=?, vat_dkk=?, net_dkk=?, rc_vat_dkk=?, deduct_dkk=?, vat_date=?, hash=?, status='final', approved_at=datetime('now'), approved_by=? WHERE id = ? AND status = 'draft'")
            ->execute([$number, $c['vat'], $c['gross_dkk'], $c['vat_dkk'], $c['net_dkk'], $c['rc_vat_dkk'], $c['deduct_dkk'], $vatDate, $hash, $user, $id]);
        wf_journal($db, $user, 'expense_final', $id, ['number' => $number, 'date' => $e['date'], 'supplier' => $e['supplier'], 'category' => $e['category'],
            'vat_mode' => $e['vat_mode'], 'gross_dkk' => $c['gross_dkk'], 'vat_dkk' => $c['vat_dkk'], 'rc_vat_dkk' => $c['rc_vat_dkk'], 'deduct_dkk' => $c['deduct_dkk'],
            'reverses' => $e['reverses'] ? (int)$e['reverses'] : null, 'vat_date' => $vatDate, 'hash' => $hash]);
        $db->commit();
        return $number;
    } catch (Throwable $ex) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $ex;
    }
}

/** Storno: neue gebuchte Ausgabe mit umgekehrtem Vorzeichen, verweist auf das Original. */
function wf_exp_reverse(PDO $db, int $id, string $user, string $reason): int
{
    $e = wf_exp_load($db, $id);
    if (!$e || $e['status'] !== 'final' || $e['reverses']) {
        throw new RuntimeException('not_found');
    }
    if ((int)$db->query('SELECT COUNT(*) FROM expenses WHERE reverses = ' . $id)->fetchColumn()) {
        throw new RuntimeException('already_reversed');
    }
    $db->prepare("INSERT INTO expenses (date, supplier, supplier_country, supplier_vat, doc_no, description, category, currency, rate, rate_date, gross, vat, vat_mode, vat_share,
                  file_stored, file_mime, file_name, no_receipt, note, reverses, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        ->execute([date('Y-m-d'), $e['supplier'], $e['supplier_country'], $e['supplier_vat'], $e['doc_no'], 'Storno: ' . $e['description'], $e['category'], $e['currency'],
            $e['rate'], $e['rate_date'], -(int)$e['gross'], -(int)$e['vat'], $e['vat_mode'], $e['vat_share'], $e['file_stored'], $e['file_mime'], $e['file_name'],
            $e['file_stored'] ? '' : 'Storno', mb_substr($reason, 0, 500), $id, $user]);
    $nid = (int)$db->lastInsertId();
    wf_exp_approve($db, $nid, $user);
    return $nid;
}

// ---------- Belegerkennung (Claude) ----------
function wf_ai_key(): string
{
    return (string)(wf_cfg('anthropic_key') ?: (wf_db()->query("SELECT value FROM meta WHERE key = 'anthropic_key'")->fetchColumn() ?: ''));
}

/**
 * Liest einen Beleg (Bild/PDF) mit Claude aus. Rueckgabe: Felder oder Fehlercode-Exception.
 * Direkter HTTPS-Aufruf der Messages-API (kein Composer/SDK auf dem Webhosting).
 */
function wf_ai_scan(string $path, string $mime, array $co): array
{
    $key = wf_ai_key();
    if ($key === '') {
        throw new RuntimeException('ai_no_key');
    }
    $cats = array_keys(wf_exp_categories());
    $schema = ['type' => 'object', 'additionalProperties' => false,
        'required' => ['is_receipt', 'supplier', 'supplier_country', 'supplier_vat', 'doc_no', 'date', 'currency', 'total', 'vat', 'vat_mode', 'is_paid', 'category', 'description', 'confident', 'notes'],
        'properties' => [
            'is_receipt' => ['type' => 'boolean', 'description' => 'false, wenn das Bild kein Kauf-/Ausgabenbeleg ist'],
            'supplier' => ['type' => 'string', 'description' => 'Name des Geschäfts/Lieferanten'],
            'supplier_country' => ['type' => 'string', 'description' => 'ISO-Ländercode des Lieferanten (DK, DE, ...), sonst DK'],
            'supplier_vat' => ['type' => 'string', 'description' => 'CVR-/USt-IdNr. des Lieferanten, sonst leer'],
            'doc_no' => ['type' => 'string', 'description' => 'Rechnungs-/Bon-Nummer, sonst leer'],
            'date' => ['type' => 'string', 'description' => 'Belegdatum YYYY-MM-DD'],
            'currency' => ['type' => 'string', 'enum' => ['DKK', 'EUR', 'OTHER']],
            'total' => ['type' => 'string', 'description' => 'Gesamtbetrag inkl. Moms, Dezimalpunkt, z. B. 1249.50'],
            'vat' => ['type' => 'string', 'description' => 'enthaltene Moms/MwSt., Dezimalpunkt, 0 wenn keine'],
            'vat_mode' => ['type' => 'string', 'enum' => WF_VAT_MODES, 'description' => 'dk = dänische Moms ausgewiesen; none = keine Moms (z. B. Versicherung, Fahrkarte, ausländischer Bon mit fremder MwSt.); eu_goods = Ware von Firma aus anderem EU-Land ohne MwSt. (Reverse Charge); rc_services = Dienstleistung/Software aus dem Ausland ohne MwSt.'],
            'is_paid' => ['type' => 'boolean', 'description' => 'true bei Kassenbon/Kartenzahlung/„Betalt“; false bei Rechnung mit Zahlungsfrist'],
            'category' => ['type' => 'string', 'enum' => $cats],
            'description' => ['type' => 'string', 'description' => 'kurz auf Deutsch, was gekauft wurde (max. 80 Zeichen)'],
            'confident' => ['type' => 'boolean', 'description' => 'true nur wenn Datum, Gesamtbetrag und Moms eindeutig lesbar sind'],
            'notes' => ['type' => 'string', 'description' => 'auf Deutsch: was unklar ist, sonst leer'],
        ]];
    $catList = implode(', ', array_map(fn($k, $v) => "$k = {$v[0]}", array_keys(wf_exp_categories()), wf_exp_categories()));
    $prompt = "Du liest einen Ausgabenbeleg für eine dänische Einzelfirma (Textilveredelung: Sticken, Druck, Laser) aus.\n"
        . 'Unsere Firma: ' . ($co['name'] ?: '(unbekannt)') . ($co['cvr'] ? ', CVR ' . $co['cvr'] : '') . '. Heute ist ' . date('Y-m-d') . ".\n"
        . "Beträge exakt vom Beleg. Dänisch: \"Moms udgør\", \"heraf moms\"; deutsch: \"MwSt\", \"USt\". Zahlenformat 1.234,50 = 1234.50.\n"
        . "Ausländische MwSt. (z. B. deutsche 19 %) ist in Dänemark nicht abziehbar: dann vat_mode none und vat 0.\n"
        . "Kategorien: $catList.\n"
        . 'Das Foto kann schief oder dunkel sein. Erfinde nichts: Unleserliches leer lassen, confident=false und in notes erklären.';
    $data = base64_encode((string)file_get_contents($path));
    $src = $mime === 'application/pdf'
        ? ['type' => 'document', 'source' => ['type' => 'base64', 'media_type' => 'application/pdf', 'data' => $data]]
        : ['type' => 'image', 'source' => ['type' => 'base64', 'media_type' => $mime, 'data' => $data]];
    return wf_ai_json([$src, ['type' => 'text', 'text' => $prompt]], $schema);
}

/** Ein Aufruf der Messages-API mit strukturierter JSON-Antwort (Schema). Direkter HTTPS-Aufruf, kein SDK auf dem Webhosting. */
function wf_ai_json(array $content, array $schema): array
{
    $key = wf_ai_key();
    if ($key === '') {
        throw new RuntimeException('ai_no_key');
    }
    $body = ['model' => 'claude-opus-5-5', 'max_tokens' => 16000, 'fallbacks' => 'default',
        'output_config' => ['effort' => 'low', 'format' => ['type' => 'json_schema', 'schema' => $schema]],
        'messages' => [['role' => 'user', 'content' => $content]]];
    $url = getenv('WF_AI_URL') ?: 'https://api.anthropic.com/v1/messages';   // nur Tests setzen WF_AI_URL
    if (getenv('WF_OFFLINE') && !getenv('WF_AI_URL')) {
        throw new RuntimeException('ai_unreachable');
    }
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 90, CURLOPT_CONNECTTIMEOUT => 8, CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'x-api-key: ' . $key, 'anthropic-version: 2026-10-21', 'anthropic-beta: server-side-fallback-2026-07-01']]);
    $raw = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    if ($raw === false || $code === 0) {
        throw new RuntimeException('ai_unreachable');
    }
    if ($code === 401 || $code === 403) {
        throw new RuntimeException('ai_bad_key');
    }
    if ($code === 429 || $code === 529) {
        throw new RuntimeException('ai_busy');
    }
    $j = json_decode((string)$raw, true);
    if ($code !== 200 || !is_array($j)) {
        error_log('auftraege ai: ' . $code . ' ' . substr((string)$raw, 0, 300));
        throw new RuntimeException('ai_failed');
    }
    if (($j['stop_reason'] ?? '') === 'refusal' || ($j['stop_reason'] ?? '') === 'max_tokens') {
        throw new RuntimeException('ai_failed');
    }
    $text = implode('', array_map(fn($b) => $b['text'] ?? '', array_filter($j['content'] ?? [], fn($b) => ($b['type'] ?? '') === 'text')));
    $r = json_decode($text, true);
    if (!is_array($r)) {
        throw new RuntimeException('ai_failed');
    }
    $r['model'] = (string)($j['model'] ?? 'claude-opus-5-5');
    return $r;
}

// ---------- Kontoauszug ----------
function wf_csv_split(string $line, string $sep): array
{
    $out = [];
    $cur = '';
    $q = false;
    $n = strlen($line);
    for ($i = 0; $i < $n; $i++) {
        $ch = $line[$i];
        if ($q) {
            if ($ch === '"' && ($line[$i + 1] ?? '') === '"') {
                $cur .= '"';
                $i++;
            } elseif ($ch === '"') {
                $q = false;
            } else {
                $cur .= $ch;
            }
        } elseif ($ch === '"') {
            $q = true;
        } elseif ($ch === $sep) {
            $out[] = trim($cur);
            $cur = '';
        } else {
            $cur .= $ch;
        }
    }
    $out[] = trim($cur);
    return $out;
}
function wf_csv_amount(string $s): ?int
{
    $t = preg_replace('/[^\d,.\-]/u', '', str_replace(['−', ' '], ['-', ''], $s)) ?? '';
    if ($t === '' || $t === '-') {
        return null;
    }
    $lc = strrpos($t, ',');
    $ld = strrpos($t, '.');
    $t = ($lc !== false && ($ld === false || $lc > $ld)) ? str_replace(['.', ','], ['', '.'], $t) : str_replace(',', '', $t);
    return is_numeric($t) ? (int)round((float)$t * 100) : null;
}
function wf_csv_date(string $s): ?string
{
    $s = trim($s);
    if (preg_match('/^(\d{4})-(\d{2})-(\d{2})/', $s, $m)) {
        return "$m[1]-$m[2]-$m[3]";
    }
    if (preg_match('/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})/', $s, $m)) {
        $y = strlen($m[3]) === 2 ? '20' . $m[3] : $m[3];
        return sprintf('%s-%02d-%02d', $y, $m[2], $m[1]);
    }
    return null;
}
/** Lunar und andere dänische/deutsche Bank-CSV: Spalten Datum, Text, Betrag (oder Ein/Aus). */
function wf_csv_parse(string $text): array
{
    $text = preg_replace('/^\xEF\xBB\xBF/', '', $text) ?? '';
    if (!mb_check_encoding($text, 'UTF-8')) {
        $text = mb_convert_encoding($text, 'UTF-8', 'ISO-8859-1');
    }
    $lines = array_values(array_filter(preg_split('/\r?\n/', $text) ?: [], fn($l) => trim($l) !== ''));
    if (count($lines) < 2) {
        throw new RuntimeException('csv_empty');
    }
    $head = $lines[0];
    $seps = [';', ',', "\t"];
    usort($seps, fn($a, $b) => substr_count($head, $b) <=> substr_count($head, $a));
    $sep = $seps[0];
    $cols = array_map(fn($h) => mb_strtolower($h), wf_csv_split($head, $sep));
    $find = function (string $re) use ($cols) {
        foreach ($cols as $i => $h) {
            if (preg_match($re, $h)) {
                return $i;
            }
        }
        return -1;
    };
    $iDate = $find('/dato|date|bogf|buchung/u');
    $iText = $find('/tekst|text|beskriv|descr|modtager|afsender|navn|name|verwendung/u');
    $iAmt = $find('/beløb|belob|amount|betrag/u');
    $iIn = $find('/indbetal|^ind$|credit|haben/u');
    $iOut = $find('/udbetal|^ud$|debit|soll/u');
    if ($iDate < 0 || ($iAmt < 0 && $iIn < 0)) {
        throw new RuntimeException('csv_columns');
    }
    $rows = [];
    foreach (array_slice($lines, 1) as $line) {
        $c = wf_csv_split($line, $sep);
        $date = wf_csv_date($c[$iDate] ?? '');
        $amount = $iAmt >= 0 ? wf_csv_amount($c[$iAmt] ?? '') : null;
        if ($amount === null && $iIn >= 0) {
            $amount = (wf_csv_amount($c[$iIn] ?? '') ?? 0) - abs(wf_csv_amount($c[$iOut] ?? '') ?? 0);
        }
        if (!$date || $amount === null) {
            continue;
        }
        $txt = $iText >= 0 ? ($c[$iText] ?? '') : implode(' ', array_diff_key($c, [$iDate => 1, $iAmt => 1]));
        $rows[] = ['date' => $date, 'text' => mb_substr(trim($txt), 0, 300), 'amount' => $amount];
    }
    return $rows;
}

/** Neue Bewegungen speichern (gleiche Bewegung nie doppelt). Gibt Anzahl neuer zurück. */
function wf_bank_import(PDO $db, array $rows): int
{
    $seen = [];
    $added = 0;
    $ins = $db->prepare('INSERT OR IGNORE INTO bank_tx (uid, date, text, amount) VALUES (?,?,?,?)');
    foreach ($rows as $r) {
        $k = $r['date'] . '|' . $r['text'] . '|' . $r['amount'];
        $seen[$k] = ($seen[$k] ?? 0) + 1;
        $ins->execute([substr(sha1($k . '|' . $seen[$k]), 0, 20), $r['date'], $r['text'], $r['amount']]);
        $added += $ins->rowCount();
    }
    return $added;
}

/** Vorschläge für eine Bewegung: Eingang → offene DKK-Rechnungen, Ausgang → unbezahlte gebuchte Ausgaben. */
function wf_bank_candidates(PDO $db, array $tx): array
{
    $out = [];
    if ($tx['amount'] > 0) {
        foreach ($db->query("SELECT i.*, c.name AS cname, c.company AS ccompany FROM invoices i JOIN customers c ON c.id = i.customer_id WHERE i.status = 'final' AND i.type = 'invoice'") as $i) {
            $open = wf_inv_open($db, $i)['open'];
            if ($open <= 0) {
                continue;
            }
            $openDkk = (int)round($open * (float)$i['rate']);
            $score = 0;
            if ($i['currency'] === 'DKK' && abs($open - $tx['amount']) <= 100) {
                $score += 2;
            } elseif ($i['currency'] !== 'DKK' && abs($openDkk - $tx['amount']) <= max(500, (int)($openDkk * 0.01))) {
                $score += 1;
            }
            if (preg_match('/(^|\D)' . (int)$i['number'] . '(\D|$)/', $tx['text'])) {
                $score += 3;
            }
            $who = mb_strtolower(trim(explode(' ', (string)($i['ccompany'] ?: $i['cname']))[0]));
            if (mb_strlen($who) > 2 && str_contains(mb_strtolower($tx['text']), $who)) {
                $score += 1;
            }
            if ($score >= 2) {
                $out[] = ['type' => 'invoice', 'id' => (int)$i['id'], 'label' => ($i['ccompany'] ?: $i['cname']) . ' · Nr. ' . $i['number'], 'open' => $open, 'currency' => $i['currency'], 'score' => $score, 'exact' => $i['currency'] === 'DKK' && abs($open - $tx['amount']) <= 100];
            }
        }
    } elseif ($tx['amount'] < 0) {
        // auch schon als bezahlt markierte Belege (Kartenzahlung), solange sie noch keiner Kontobewegung zugeordnet sind
        $st = $db->prepare("SELECT * FROM expenses e WHERE status = 'final' AND reverses IS NULL AND gross_dkk > 0 AND ABS(gross_dkk + ?) <= 100 AND date BETWEEN date(?, '-60 days') AND date(?, '+10 days')
                            AND NOT EXISTS (SELECT 1 FROM bank_tx b WHERE b.match_type = 'expense' AND b.match_id = e.id) AND NOT EXISTS (SELECT 1 FROM expenses r WHERE r.reverses = e.id)");
        $st->execute([$tx['amount'], $tx['date'], $tx['date']]);
        foreach ($st->fetchAll() as $e) {
            $out[] = ['type' => 'expense', 'id' => (int)$e['id'], 'label' => $e['supplier'] . ' · Bilag ' . $e['number'], 'score' => 2 + (str_contains(mb_strtolower($tx['text']), mb_strtolower(explode(' ', $e['supplier'])[0])) ? 1 : 0), 'exact' => true];
        }
    }
    usort($out, fn($a, $b) => $b['score'] <=> $a['score']);
    return $out;
}

/** Ordnet zu. Bei Rechnung wird eine Zahlung gebucht (Journal), bei Ausgabe das Zahlungsdatum gesetzt. */
function wf_bank_match(PDO $db, int $txId, string $type, int $id, string $user, string $note = ''): void
{
    $st = $db->prepare('SELECT * FROM bank_tx WHERE id = ?');
    $st->execute([$txId]);
    $tx = $st->fetch();
    if (!$tx || $tx['match_type']) {
        throw new RuntimeException('not_found');
    }
    $db->beginTransaction();
    try {
        if ($type === 'invoice') {
            $i = wf_inv_load($db, $id);
            if (!$i || $i['status'] !== 'final' || $tx['amount'] <= 0) {
                throw new RuntimeException('bad_match');
            }
            // Zahlung in Rechnungswährung: DKK direkt, Fremdwährung zum Rechnungskurs, höchstens der offene Betrag
            $open = wf_inv_open($db, $i)['open'];
            $amt = $i['currency'] === 'DKK' ? (int)$tx['amount'] : (int)round($tx['amount'] / max(0.0001, (float)$i['rate']));
            if ($i['currency'] !== 'DKK' && abs($amt - $open) <= max(100, (int)($open * 0.01))) {
                $amt = $open;   // Kursdifferenz bei Fremdwährung: offenen Betrag als bezahlt werten
            }
            $db->prepare('INSERT INTO invoice_payments (invoice_id, date, amount, method, note, created_by) VALUES (?,?,?,?,?,?)')->execute([$id, $tx['date'], $amt, 'bank', 'Bank: ' . mb_substr($tx['text'], 0, 80), $user]);
            wf_journal($db, $user, 'payment', $id, ['number' => $i['number'], 'payment' => (int)$db->lastInsertId(), 'date' => $tx['date'], 'amount' => $amt, 'currency' => $i['currency'], 'method' => 'bank', 'bank_tx' => $txId]);
        } elseif ($type === 'expense') {
            $u = $db->prepare("UPDATE expenses SET paid_date = COALESCE(paid_date, ?), pay_method = CASE WHEN paid_date IS NULL THEN 'bank' ELSE pay_method END WHERE id = ? AND status = 'final'");
            $u->execute([$tx['date'], $id]);
            if (!$u->rowCount()) {
                throw new RuntimeException('bad_match');
            }
        } elseif (!in_array($type, ['private', 'transfer', 'other'], true)) {
            throw new RuntimeException('bad_match');
        }
        $db->prepare("UPDATE bank_tx SET match_type = ?, match_id = ?, match_note = ?, matched_at = datetime('now'), matched_by = ? WHERE id = ?")
            ->execute([$type, in_array($type, ['invoice', 'expense'], true) ? $id : null, mb_substr($note, 0, 200), $user, $txId]);
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $e;
    }
    if ($type === 'invoice') {
        wf_order_sync_pay($db, (int)$db->query('SELECT order_id FROM invoices WHERE id = ' . $id)->fetchColumn() ?: null);
    }
}

/** Nach dem Import: eindeutige Treffer automatisch zuordnen. */
function wf_bank_automatch(PDO $db, string $user): int
{
    $n = 0;
    foreach ($db->query('SELECT * FROM bank_tx WHERE match_type IS NULL ORDER BY date')->fetchAll() as $tx) {
        $c = wf_bank_candidates($db, $tx);
        $exact = array_values(array_filter($c, fn($x) => $x['exact']));
        $pick = null;
        if ($c && $c[0]['score'] >= 5 && (!isset($c[1]) || $c[1]['score'] < 5)) {
            $pick = $c[0];   // Nummer im Text und Betrag passt
        } elseif (count($exact) === 1 && $exact[0]['score'] >= 2) {
            $pick = $exact[0];   // genau ein Beleg mit genau diesem Betrag
        }
        if ($pick) {
            try {
                wf_bank_match($db, (int)$tx['id'], $pick['type'], $pick['id'], $user . ' (auto)');
                $n++;
            } catch (RuntimeException $e) {
                // bleibt offen
            }
        }
    }
    return $n;
}
