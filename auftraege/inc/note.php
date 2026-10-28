<?php
declare(strict_types=1);
require_once __DIR__ . '/expense.php';

/*
 * Notiz -> Auftragsfelder. Mit Claude-Schlüssel liest Claude die Notiz; ohne (oder bei Fehler) greifen feste Regeln.
 * Ergebnis: title, qty, article, processes [{process_id, per_piece}], due_date, price, deposit, currency, description,
 * customer {id?, name, company, phone, email}. Der Originaltext wird immer als Notiz mitgegeben.
 */

const WF_NOTE_PROC = [
    'stick' => '/\b(be)?stick|broder|embroid/iu',
    'flex' => '/\bflex|\bflock|folie|vinyl|transfer(druck|folie)?\b/iu',
    'dtf' => '/\bdtf\b/iu',
    'siebdruck' => '/sieb|serigraf|screen ?print/iu',
    'sublimation' => '/subli/iu',
    'lasergravur' => '/gravur|gravi|graver|engrav/iu',
    'laserschnitt' => '/laser ?(schnitt|schneid|skær|cut)|ausschneiden|laser-?zuschnitt/iu',
    'digitalisieren' => '/digitali[sz]|stickdatei|stickprogramm|punch|broderifil/iu',
    'cnc' => '/\bcnc|fräs|fræs/iu',
];
const WF_NOTE_MONTHS = ['jan' => 1, 'feb' => 2, 'mär' => 3, 'mar' => 3, 'apr' => 4, 'mai' => 5, 'maj' => 5, 'may' => 5, 'jun' => 6, 'jul' => 7, 'aug' => 8,
    'sep' => 9, 'okt' => 10, 'oct' => 10, 'nov' => 11, 'dez' => 12, 'dec' => 12];

/** Nächster Werktag ab $d (Sa/So -> Montag). */
function wf_note_weekday(string $d): string
{
    $t = strtotime($d);
    while ((int)date('N', $t) >= 6) {
        $t = strtotime('+1 day', $t);
    }
    return date('Y-m-d', $t);
}

/** Termin aus freiem Text: 15.11.(2026), 15/11, "bis 15. November", "Ende November", "KW 47"/"uge 47", "morgen", "nächste Woche", Wochentag. */
function wf_note_date(string $txt, string $today): ?string
{
    $y = (int)substr($today, 0, 4);
    $future = function (int $d, int $m, ?int $yy) use ($y, $today): ?string {
        if (!checkdate($m, $d, $yy ?? $y)) {
            return null;
        }
        $s = sprintf('%04d-%02d-%02d', $yy ?? $y, $m, $d);
        if ($yy === null && $s < $today) {
            $s = sprintf('%04d-%02d-%02d', $y + 1, $m, $d);
        }
        return $s;
    };
    if (preg_match('/\b(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})\b/u', $txt, $m)) {
        $yy = (int)$m[3];
        return $future((int)$m[1], (int)$m[2], $yy < 100 ? 2000 + $yy : $yy);
    }
    if (preg_match('/\b(\d{1,2})\.\s?(\d{1,2})\.(?!\d)/u', $txt, $m) || preg_match('/\b(\d{1,2})\/(\d{1,2})\b(?!\/)/u', $txt, $m)) {
        return $future((int)$m[1], (int)$m[2], null);
    }
    $mon = implode('|', array_keys(WF_NOTE_MONTHS));
    if (preg_match('/\b(\d{1,2})\.?\s*(' . $mon . ')[a-zäæø]*\b/iu', $txt, $m)) {
        return $future((int)$m[1], WF_NOTE_MONTHS[mb_strtolower(mb_substr($m[2], 0, 3))], null);
    }
    if (preg_match('/\b(ende|ultimo|end of)\s+(' . $mon . ')[a-zäæø]*/iu', $txt, $m)) {
        $mm = WF_NOTE_MONTHS[mb_strtolower(mb_substr($m[2], 0, 3))];
        $yy = $mm < (int)substr($today, 5, 2) ? $y + 1 : $y;
        $t = strtotime(sprintf('%04d-%02d-01', $yy, $mm) . ' +1 month -1 day');
        while ((int)date('N', $t) >= 6) {
            $t = strtotime('-1 day', $t);
        }
        return date('Y-m-d', $t);
    }
    if (preg_match('/\b(kw|uge|week)\s*(\d{1,2})\b/iu', $txt, $m)) {
        $w = (int)$m[2];
        $yy = $w < (int)date('W', strtotime($today)) ? $y + 1 : $y;
        return (new DateTime())->setISODate($yy, $w, 5)->format('Y-m-d');   // Freitag der Woche
    }
    if (preg_match('/\bübermorgen|i overmorgen\b/iu', $txt)) {
        return wf_note_weekday(date('Y-m-d', strtotime($today . ' +2 days')));
    }
    if (preg_match('/\bmorgen\b|\bi morgen\b/iu', $txt)) {
        return wf_note_weekday(date('Y-m-d', strtotime($today . ' +1 day')));
    }
    if (preg_match('/n(ä|ae)chste woche|næste uge|next week/iu', $txt)) {
        return date('Y-m-d', strtotime($today . ' next monday +4 days'));
    }
    $days = ['montag' => 'monday', 'dienstag' => 'tuesday', 'mittwoch' => 'wednesday', 'donnerstag' => 'thursday', 'freitag' => 'friday',
        'mandag' => 'monday', 'tirsdag' => 'tuesday', 'onsdag' => 'wednesday', 'torsdag' => 'thursday', 'fredag' => 'friday'];
    if (preg_match('/\b(' . implode('|', array_keys($days)) . ')\b/iu', $txt, $m)) {
        return date('Y-m-d', strtotime($today . ' next ' . $days[mb_strtolower($m[1])]));
    }
    return null;
}

function wf_note_money(string $s): ?float
{
    $c = wf_to_cents($s);
    return $c === null ? null : $c / 100;
}

/** Feste Regeln (ohne Internet). */
function wf_note_rules(PDO $db, string $text): array
{
    $today = date('Y-m-d');
    $r = ['title' => '', 'qty' => null, 'article' => '', 'processes' => [], 'due_date' => null, 'price' => null, 'deposit' => null, 'currency' => null,
        'customer' => ['name' => '', 'company' => '', 'phone' => '', 'email' => '']];
    $lines = array_values(array_filter(array_map('trim', preg_split('/\r?\n/', $text) ?: []), fn($l) => $l !== ''));
    $rest = [];
    $labels = [
        'customer' => '/^(kunde|kundin|kundenname|navn|name|kontakt|ansprechpartner)\s*[:=\-]\s*(.+)$/iu',
        'company' => '/^(firma|verein|forening|virksomhed|company|club|klub)\s*[:=\-]\s*(.+)$/iu',
        'phone' => '/^(tel\.?|telefon|tlf\.?|mobil|handy|phone)\s*[:=\-]?\s*(.+)$/iu',
        'email' => '/^(e-?mail|mail)\s*[:=\-]?\s*(.+)$/iu',
        'qty' => '/^(menge|anzahl|antal|stückzahl|stk\.?|qty)\s*[:=\-]\s*(.+)$/iu',
        'article' => '/^(artikel|ware|vare|produkt|textil)\s*[:=\-]\s*(.+)$/iu',
        'due' => '/^(termin|abgabe|abholung|fertig( bis)?|bis|frist|deadline|levering|afhentning|dato)\s*[:=\-]?\s*(.+)$/iu',
        'price' => '/^(preis|pris|price|gesamt|total|i alt)\s*[:=\-]\s*(.+)$/iu',
        'deposit' => '/^(anzahlung|depositum|forudbetaling|a conto)\s*[:=\-]?\s*(.+)$/iu',
    ];
    foreach ($lines as $i => $l) {
        $hit = false;
        foreach ($labels as $k => $re) {
            if (!preg_match($re, $l, $m)) {
                continue;
            }
            $v = trim((string)end($m));
            $hit = true;
            if ($k === 'customer') {
                $r['customer']['name'] = $v;
            } elseif ($k === 'company') {
                $r['customer']['company'] = $v;
            } elseif ($k === 'phone') {
                $r['customer']['phone'] = $v;
            } elseif ($k === 'email') {
                $r['customer']['email'] = $v;
            } elseif ($k === 'qty' && preg_match('/\d+/', $v, $n)) {
                $r['qty'] = (int)$n[0];
                $hit = !preg_match('/[a-zäöüæøå]{3,}/iu', $v);   // "25 Hoodies" weiter auswerten
            } elseif ($k === 'article') {
                $r['article'] = $v;
            } elseif ($k === 'due') {
                $r['due_date'] = wf_note_date($v, $today);
            } elseif ($k === 'price' && preg_match('/\d[\d.,]*/', $v, $n)) {
                $r['price'] = wf_note_money($n[0]);
                if (preg_match('/€|eur/iu', $v)) {
                    $r['currency'] = 'EUR';
                }
                if (preg_match('/pro|je|per|pr\.|\/\s*(stk|stück)|a stk/iu', $v)) {
                    $r['price_each'] = true;
                }
            } elseif ($k === 'deposit' && preg_match('/\d[\d.,]*/', $v, $n)) {
                $r['deposit'] = wf_note_money($n[0]);
            }
            break;
        }
        // "Verein SIF: 25 Hoodies ..." -> Kunde vor dem Doppelpunkt
        if (!$hit && $i === 0 && $r['customer']['name'] === '' && preg_match('/^([^:\d]{2,60}):\s*(.+)$/u', $l, $m)) {
            $r['customer']['name'] = trim($m[1]);
            $l = $m[2];
        }
        if (!$hit) {
            $rest[] = $l;
        }
    }
    $all = implode("\n", $lines);
    $body = implode("\n", $rest);
    if ($r['customer']['email'] === '' && preg_match('/[\w.+-]+@[\w-]+\.[\w.]+/u', $all, $m)) {
        $r['customer']['email'] = $m[0];
    }
    if ($r['customer']['phone'] === '' && preg_match('/(\+?\d[\d \-\/]{6,}\d)/', preg_replace('/\b\d{1,2}[.\/]\d{1,2}([.\/]\d{2,4})?\b/', '', $all) ?? '', $m)
        && strlen(preg_replace('/\D/', '', $m[1])) >= 8) {
        $r['customer']['phone'] = trim($m[1]);
    }
    // Menge + Artikel: "25 Hoodies", "40 Stk. T-Shirts", "10x Caps"
    if (preg_match('/\b(\d{1,5})\s*(?:x|×|stk\.?|stück|pcs|st\.)?\s+([A-Za-zÄÖÜäöüßÆØÅæøå][\wÄÖÜäöüßÆØÅæøå\-]{2,}(?:\s+(?:navy|schwarz|weiß|weiss|sort|hvid|rot|rød|blau|blå|grau|grå))?)/u', $body, $m)
        && !preg_match('/^(min|minuten|kr|dkk|euro|eur|uhr|cm|mm|tage|dage|stunden|timer|prozent|stiche|sting|farben|farver)/iu', $m[2])) {
        $r['qty'] ??= (int)$m[1];
        $word = mb_strtolower($m[2]);
        $bad = preg_match('/^(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|mandag|tirsdag|onsdag|torsdag|fredag|morgen|bis|til|ende|kw|uge|mit|med|und|og)/u', $word);
        foreach (WF_NOTE_PROC as $re) {
            $bad = $bad || preg_match($re, $word);
        }
        if ($r['article'] === '' && !$bad) {
            $r['article'] = $m[2];
        }
    }
    // Artikel vor der Menge: "Schneidbretter gravieren 6 stk" -> letztes passendes Hauptwort davor
    if ($r['article'] === '' && preg_match('/([^\n]{0,60}?)\b\d{1,5}\s*(?:x|stk\.?|stück|pcs)\b/u', $body, $m)
        && preg_match_all('/\b([A-ZÄÖÜÆØÅ][a-zäöüßæøå\-]{3,})\b/u', $m[1], $w)) {
        foreach (array_reverse($w[1]) as $cand) {
            $isProc = false;
            foreach (WF_NOTE_PROC as $re) {
                $isProc = $isProc || preg_match($re, $cand);
            }
            if (!$isProc && !preg_match('/^(hochzeit|bryllup|geburtstag|fødselsdag|kunde|verein|firma|bitte|hallo|hej)$/iu', $cand)) {
                $r['article'] = $cand;
                break;
            }
        }
    }
    // Kunde am Anfang vor der Menge: "Bauhaus Flensburg 30 Caps ..."
    if ($r['customer']['name'] === '' && $r['customer']['company'] === '' && preg_match('/^((?:[A-ZÄÖÜÆØÅ][\wÄÖÜäöüßÆØÅæøå&.\-]*\s+){1,4})\d{1,5}\s/u', $body, $m)) {
        $r['customer']['company'] = trim($m[1]);
    }
    if ($r['deposit'] === null && preg_match('/(anzahlung|depositum|forudbetaling|a conto)\s*:?\s*(\d[\d.,]*)/iu', $body, $m)) {
        $r['deposit'] = wf_note_money($m[2]);
    }
    // Verfahren und Minuten je Stück
    $pp = preg_match('/(\d{1,2})\s*min(?:uten|\.)?\s*(?:pro|je|\/|per|pr\.?|a)\s*(?:stück|stk|teil|shirt|stykke)/iu', $all, $m) ? max(1, min(60, (int)$m[1])) : null;
    $types = $db->query('SELECT id, key FROM process_types WHERE active = 1')->fetchAll(PDO::FETCH_KEY_PAIR);
    foreach (WF_NOTE_PROC as $key => $re) {
        $id = array_search($key, $types, true);
        if ($id !== false && preg_match($re, $all)) {
            if ($key === 'flex' && preg_match('/\bdtf\b/iu', $all) && !preg_match('/\bflex|\bflock/iu', $all)) {
                continue;   // "DTF-Transfer" ist kein Flex
            }
            $r['processes'][] = ['process_id' => (int)$id, 'per_piece' => $key === 'digitalisieren' ? null : $pp];   // Digitalisieren: einmalig, Standardzeit
        }
    }
    // Termin aus dem Text, Preis mit Währung
    $r['due_date'] ??= wf_note_date($body, $today);
    if ($r['price'] === null && preg_match('/(\d[\d.,]*)\s*(kr\.?|dkk|,-|€|eur(?:o)?)\b(?!\s*(anzahlung|depositum))/iu', $body, $m)) {
        $r['price'] = wf_note_money($m[1]);
        $r['currency'] ??= preg_match('/€|eur/iu', $m[2]) ? 'EUR' : 'DKK';
        $after = mb_substr($body, mb_strpos($body, $m[0]) + mb_strlen($m[0]), 20);
        if (preg_match('/^\s*(pro|je|per|pr\.?|\/)\s*(stk|stück|teil|stykke)/iu', $after)) {
            $r['price_each'] = true;
        }
    }
    if (!empty($r['price_each']) && $r['price'] !== null && $r['qty']) {
        $r['price'] = round($r['price'] * $r['qty'], 2);
    }
    unset($r['price_each']);
    $r['description'] = $body;
    return $r;
}

/** Claude liest die Notiz (strukturierte Antwort). */
function wf_note_ai(PDO $db, string $text): array
{
    $procs = $db->query('SELECT id, name_de, name_da FROM process_types WHERE active = 1 ORDER BY sort')->fetchAll();
    $schema = ['type' => 'object', 'additionalProperties' => false,
        'required' => ['customer_name', 'customer_company', 'phone', 'email', 'title', 'qty', 'article', 'process_ids', 'minutes_per_piece', 'due_date', 'price_total', 'deposit', 'currency', 'description'],
        'properties' => [
            'customer_name' => ['type' => 'string', 'description' => 'Name der Kontaktperson, sonst leer'],
            'customer_company' => ['type' => 'string', 'description' => 'Firma/Verein des Kunden, sonst leer'],
            'phone' => ['type' => 'string'], 'email' => ['type' => 'string'],
            'title' => ['type' => 'string', 'description' => 'kurzer Auftragstitel, z. B. „25 Hoodies mit Logo-Stick“ (max. 80 Zeichen, Sprache der Notiz)'],
            'qty' => ['type' => 'integer', 'description' => 'Stückzahl, 0 wenn unbekannt'],
            'article' => ['type' => 'string', 'description' => 'Textil/Artikel inkl. Farbe/Größen, z. B. „Hoodie schwarz, S–XL“'],
            'process_ids' => ['type' => 'array', 'items' => ['type' => 'integer', 'enum' => array_map(fn($p) => (int)$p['id'], $procs)]],
            'minutes_per_piece' => ['type' => 'integer', 'description' => 'nur wenn in der Notiz genannt (Minuten pro Stück), sonst 0'],
            'due_date' => ['type' => 'string', 'description' => 'Abgabe-/Abholtermin YYYY-MM-DD, leer wenn keiner genannt'],
            'price_total' => ['type' => 'number', 'description' => 'Gesamtpreis (bei Stückpreis × Menge), 0 wenn keiner genannt'],
            'deposit' => ['type' => 'number', 'description' => 'Anzahlung, 0 wenn keine'],
            'currency' => ['type' => 'string', 'enum' => ['DKK', 'EUR']],
            'description' => ['type' => 'string', 'description' => 'alle Details zur Ausführung (Motiv, Position, Farben, Größen, Namen, Besonderheiten), ohne Kontaktdaten'],
        ]];
    $plist = implode(', ', array_map(fn($p) => "{$p['id']} = {$p['name_de']} / {$p['name_da']}", $procs));
    $prompt = "Eine Notiz für einen Auftrag einer Textilveredelung (Wunsch-Fabrik, Padborg). Verteile die Angaben auf die Felder.\n"
        . 'Heute ist ' . date('Y-m-d') . ' (' . date('l') . "). Relative Termine (morgen, Freitag, Ende November, KW 47) in ein Datum umrechnen; Termin nie am Wochenende.\n"
        . "Verfahren (process_ids): $plist. Nur nennen, was die Notiz verlangt.\n"
        . "Erfinde nichts: Unbekanntes leer bzw. 0 lassen.\n\nNotiz:\n" . $text;
    $a = wf_ai_json([['type' => 'text', 'text' => $prompt]], $schema);
    $pp = (int)($a['minutes_per_piece'] ?? 0);
    $due = wf_csv_date((string)($a['due_date'] ?? ''));
    return ['title' => (string)$a['title'], 'qty' => (int)$a['qty'] ?: null, 'article' => (string)$a['article'],
        'processes' => array_map(fn($id) => ['process_id' => (int)$id, 'per_piece' => $pp > 0 ? min(60, $pp) : null], array_unique($a['process_ids'] ?? [])),
        'due_date' => $due ? wf_note_weekday($due) : null, 'price' => (float)$a['price_total'] ?: null, 'deposit' => (float)$a['deposit'] ?: null, 'currency' => $a['currency'] ?? null,
        'customer' => ['name' => (string)$a['customer_name'], 'company' => (string)$a['customer_company'], 'phone' => (string)$a['phone'], 'email' => (string)$a['email']],
        'description' => (string)$a['description'], 'source' => 'ai'];
}

/** Notiz auswerten und Kunden suchen. */
function wf_note_parse(PDO $db, string $text): array
{
    $text = trim(mb_substr($text, 0, 5000));
    $rules = wf_note_rules($db, $text);
    $r = $rules + ['source' => 'rules'];
    $aiError = null;
    if (wf_ai_key() !== '') {
        try {
            $ai = wf_note_ai($db, $text);
            // Claude zuerst, Lücken aus den Regeln füllen
            foreach ($ai as $k => $v) {
                if ($k === 'customer') {
                    foreach ($v as $ck => $cv) {
                        $r['customer'][$ck] = $cv !== '' ? $cv : $rules['customer'][$ck];
                    }
                } elseif ($v !== null && $v !== '' && $v !== []) {
                    $r[$k] = $v;
                }
            }
        } catch (RuntimeException $e) {
            $aiError = $e->getMessage();
        }
    }
    if ($r['title'] === '') {
        $names = [];
        foreach ($r['processes'] as $p) {
            $names[] = (string)$db->query('SELECT name_de FROM process_types WHERE id = ' . (int)$p['process_id'])->fetchColumn();
        }
        $r['title'] = trim(implode(' ', array_filter([$r['qty'] ? (string)$r['qty'] : '', $r['article']])) . ($names ? ' – ' . implode(', ', $names) : ''), ' –');
        if ($r['title'] === '' || $r['title'] === (string)$r['qty']) {
            $first = (string)(preg_split('/\r?\n/', $r['description'] ?: $text)[0] ?? '');
            $r['title'] = mb_substr($first, 0, 120);
        }
    }
    if ($r['due_date']) {
        $r['due_date'] = $r['due_date'] < date('Y-m-d') ? null : wf_note_weekday($r['due_date']);   // nie am Wochenende
    }
    // Kunde finden: Telefon (letzte 8 Ziffern), E-Mail, dann Name/Firma
    $c = $r['customer'];
    $found = null;
    $digits = substr(preg_replace('/\D/', '', $c['phone']) ?? '', -8);
    if (strlen($digits) === 8) {
        foreach ($db->query("SELECT id, name, company, phone, currency FROM customers WHERE anonymized_at IS NULL AND phone <> ''") as $row) {
            if (substr(preg_replace('/\D/', '', $row['phone']) ?? '', -8) === $digits) {
                $found = $row;
                break;
            }
        }
    }
    if (!$found && $c['email'] !== '') {
        $st = $db->prepare("SELECT id, name, company, phone, currency FROM customers WHERE anonymized_at IS NULL AND lower(email) = lower(?)");
        $st->execute([$c['email']]);
        $found = $st->fetch() ?: null;
    }
    foreach ([$c['company'], $c['name']] as $n) {
        if (!$found && $n !== '') {
            $st = $db->prepare("SELECT id, name, company, phone, currency FROM customers WHERE anonymized_at IS NULL AND (lower(name) = lower(?) OR lower(company) = lower(?)) LIMIT 2");
            $st->execute([$n, $n]);
            $rows = $st->fetchAll();
            $found = count($rows) === 1 ? $rows[0] : null;
        }
    }
    $r['customer']['id'] = $found ? (int)$found['id'] : null;
    $r['customer']['match'] = $found;
    $r['ai_error'] = $aiError;
    return $r;
}
