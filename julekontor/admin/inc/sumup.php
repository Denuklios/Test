<?php
/* SumUp Solo per Cloud API: Die Kasse schickt den Betrag an das Kartengerät und erfährt, ob bezahlt wurde.
   Doku: https://developer.sumup.com/terminal-payments/cloud-api/
   Der geheime API-Schlüssel bleibt auf dem Server – das Tablet sieht ihn nie. */
declare(strict_types=1);
require_once __DIR__ . '/shop.php';

/* Für Tests kann die Adresse per Umgebungsvariable auf einen Simulator zeigen. */
function sumup_base(): string { return rtrim(getenv('JK_SUMUP_BASE') ?: 'https://api.sumup.com', '/'); }

function sumup_ready(): bool {
    return setting('sumup_enabled') === '1' && setting('sumup_api_key') !== '' && setting('sumup_merchant') !== ''
        && setting('sumup_reader_id') !== '' && setting('sumup_affiliate_key') !== '' && setting('sumup_app_id') !== '';
}

/** @return array{0:int,1:array} [HTTP-Status, JSON] */
function sumup_call(string $method, string $path, ?array $body = null, ?string $key = null): array {
    $key ??= setting('sumup_api_key');
    if ($key === '') throw new ShopError('SumUp: Es ist kein API-Schlüssel eingetragen.');
    $ch = curl_init(sumup_base() . $path);
    $headers = ['Authorization: Bearer ' . $key, 'Accept: application/json'];
    if ($body !== null) $headers[] = 'Content-Type: application/json';
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => $headers,
        CURLOPT_CONNECTTIMEOUT => 8, CURLOPT_TIMEOUT => 20,
        CURLOPT_POSTFIELDS => $body !== null ? json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null,
    ]);
    $raw = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($raw === false) throw new ShopError('SumUp ist nicht erreichbar (' . $err . ').');
    return [$code, json_decode((string)$raw, true) ?: []];
}

function sumup_error_text(int $code, array $r): string {
    $e = $r['errors'] ?? $r;
    $type = is_array($e) ? (string)($e['type'] ?? $e['error_code'] ?? '') : '';
    $detail = is_array($e) ? (string)($e['detail'] ?? $e['message'] ?? $r['detail'] ?? '') : '';
    return match (true) {
        $type === 'READER_OFFLINE' => 'Das SumUp-Gerät ist offline. Ist es eingeschaltet und im WLAN?',
        $type === 'READER_BUSY' => 'Das SumUp-Gerät ist gerade beschäftigt. Bitte einen Moment warten und noch einmal versuchen.',
        $type === 'INVALID_AFFILIATE_KEY' => 'SumUp: Der Affiliate-Key oder die App-ID stimmt nicht.',
        $code === 401 => 'SumUp: Der API-Schlüssel ist ungültig.',
        $code === 404 => 'SumUp: Gerät oder Händlerkonto nicht gefunden. Bitte das Gerät neu koppeln.',
        default => 'SumUp-Fehler ' . $code . ($detail !== '' ? ': ' . $detail : ($type !== '' ? ': ' . $type : '')),
    };
}

/* Händlernummer (merchant_code) aus dem Konto lesen */
function sumup_merchant_code(string $key): string {
    [$code, $r] = sumup_call('GET', '/v0.1/me', null, $key);
    if ($code !== 200) throw new ShopError(sumup_error_text($code, $r));
    $mc = $r['merchant_profile']['merchant_code'] ?? $r['merchant_code'] ?? null;
    if (!$mc) {                                        // falls SumUp das Feld woanders liefert
        array_walk_recursive($r, function ($v, $k) use (&$mc) { if (!$mc && $k === 'merchant_code' && is_string($v)) $mc = $v; });
    }
    if (!$mc) throw new ShopError('SumUp: Die Händlernummer wurde nicht gefunden. Bitte von Hand eintragen.');
    return (string)$mc;
}

function sumup_pair(string $pairingCode, string $name): array {
    $mc = setting('sumup_merchant');
    [$code, $r] = sumup_call('POST', '/v0.1/merchants/' . rawurlencode($mc) . '/readers',
        ['pairing_code' => strtoupper(trim($pairingCode)), 'name' => $name ?: 'Kasse']);
    if ($code !== 201 && $code !== 200) throw new ShopError(sumup_error_text($code, $r) . ' (Ist der Kopplungs-Code noch gültig? Er läuft nach 5 Minuten ab.)');
    set_setting('sumup_reader_id', (string)$r['id']);
    set_setting('sumup_reader_name', (string)($r['name'] ?? $name));
    return $r;
}
function sumup_reader(): ?array {
    if (setting('sumup_reader_id') === '' || setting('sumup_merchant') === '') return null;
    [$code, $r] = sumup_call('GET', '/v0.1/merchants/' . rawurlencode(setting('sumup_merchant')) . '/readers/' . rawurlencode(setting('sumup_reader_id')));
    return $code === 200 ? $r : null;
}
function sumup_reader_status(): ?array {
    if (setting('sumup_reader_id') === '' || setting('sumup_merchant') === '') return null;
    [$code, $r] = sumup_call('GET', '/v0.1/merchants/' . rawurlencode(setting('sumup_merchant')) . '/readers/' . rawurlencode(setting('sumup_reader_id')) . '/status');
    return $code === 200 ? ($r['data'] ?? $r) : null;
}
function sumup_unpair(): void {
    if (setting('sumup_reader_id') !== '' && setting('sumup_merchant') !== '') {
        try { sumup_call('DELETE', '/v0.1/merchants/' . rawurlencode(setting('sumup_merchant')) . '/readers/' . rawurlencode(setting('sumup_reader_id'))); } catch (ShopError $e) {}
    }
    set_setting('sumup_reader_id', '');
    set_setting('sumup_reader_name', '');
}

function card_payment(string $uuid): ?array {
    $st = db()->prepare('SELECT * FROM card_payments WHERE uuid = ?');
    $st->execute([$uuid]);
    return $st->fetch() ?: null;
}

/* Betrag an das Gerät schicken. $returnUrl = öffentliche https-Adresse für die Rückmeldung (oder ''). */
function sumup_start(string $uuid, int $amount, string $user, string $returnUrl): array {
    if (!sumup_ready()) throw new ShopError('SumUp ist nicht eingerichtet.');
    if (!preg_match('/^[a-zA-Z0-9-]{8,64}$/', $uuid)) throw new ShopError('Ungültige Vorgangsnummer.');
    if ($amount <= 0) throw new ShopError('Der Betrag muss größer als 0 sein.');
    $cp = card_payment($uuid);
    if ($cp && $cp['status'] === 'successful') return $cp;               // schon bezahlt
    if ($cp && $cp['status'] === 'pending' && (int)$cp['amount'] === $amount && strtotime($cp['created']) > time() - 90) return $cp;
    $cur = setting('currency');
    $body = [
        'total_amount' => ['currency' => $cur, 'minor_unit' => 2, 'value' => $amount],
        'description' => setting('shop_name') . ' Kasse',
        'affiliate' => ['app_id' => setting('sumup_app_id'), 'key' => setting('sumup_affiliate_key'), 'foreign_transaction_id' => $uuid],
    ];
    if (str_starts_with($returnUrl, 'https://')) $body['return_url'] = $returnUrl;
    [$code, $r] = sumup_call('POST', '/v0.1/merchants/' . rawurlencode(setting('sumup_merchant')) . '/readers/' . rawurlencode(setting('sumup_reader_id')) . '/checkout', $body);
    if ($code !== 201 && $code !== 200) throw new ShopError(sumup_error_text($code, $r));
    $ctx = (string)($r['data']['client_transaction_id'] ?? '');
    db()->prepare("INSERT INTO card_payments (uuid, amount, currency, reader_id, client_tx_id, status, user, created, updated) VALUES (?,?,?,?,?,?,?,?,?)
                   ON CONFLICT(uuid) DO UPDATE SET amount = excluded.amount, reader_id = excluded.reader_id, client_tx_id = excluded.client_tx_id,
                   status = 'pending', tx_code = '', message = '', created = excluded.created, updated = excluded.updated")
        ->execute([$uuid, $amount, $cur, setting('sumup_reader_id'), $ctx, 'pending', $user, now(), now()]);
    return card_payment($uuid);
}

/* Ergebnis bei SumUp nachfragen (Transaktions-API) und speichern */
function sumup_refresh(string $uuid): ?array {
    $cp = card_payment($uuid);
    if (!$cp || $cp['status'] !== 'pending') return $cp;
    $q = $cp['client_tx_id'] !== '' ? 'client_transaction_id=' . rawurlencode($cp['client_tx_id']) : 'foreign_transaction_id=' . rawurlencode($uuid);
    [$code, $r] = sumup_call('GET', '/v2.1/merchants/' . rawurlencode(setting('sumup_merchant')) . '/transactions?' . $q);
    if ($code !== 200) return $cp;                                        // noch keine Transaktion – weiter warten
    $st = strtoupper((string)($r['status'] ?? ''));
    $new = match ($st) { 'SUCCESSFUL' => 'successful', 'FAILED' => 'failed', 'CANCELLED' => 'cancelled', default => 'pending' };
    if ($new === 'successful' && (int)round(((float)($r['amount'] ?? 0)) * 100) !== (int)$cp['amount']) {
        $new = 'failed'; $r['__msg'] = 'Betrag bei SumUp weicht ab';
    }
    if ($new !== 'pending') {
        $card = trim((string)($r['card']['type'] ?? '') . ' ' . (isset($r['card']['last_4_digits']) ? '••' . $r['card']['last_4_digits'] : ''));
        db()->prepare('UPDATE card_payments SET status = ?, tx_code = ?, card = ?, message = ?, updated = ? WHERE uuid = ?')
            ->execute([$new, (string)($r['transaction_code'] ?? ''), $card, (string)($r['__msg'] ?? ''), now(), $uuid]);
    }
    return card_payment($uuid);
}
function sumup_cancel(string $uuid): void {
    $cp = card_payment($uuid);
    if (!$cp || $cp['status'] !== 'pending') return;
    try { sumup_call('POST', '/v0.1/merchants/' . rawurlencode(setting('sumup_merchant')) . '/readers/' . rawurlencode($cp['reader_id']) . '/terminate'); } catch (ShopError $e) {}
    // Nicht sofort als abgebrochen markieren: Falls der Kunde in dieser Sekunde doch bezahlt hat, zeigt das die nächste Abfrage.
}
/* Kasse gibt auf (z. B. nach Abbruch): nur möglich, wenn SumUp nicht „bezahlt“ meldet */
function sumup_give_up(string $uuid): ?array {
    $cp = sumup_refresh($uuid);
    if ($cp && $cp['status'] === 'pending') {
        db()->prepare("UPDATE card_payments SET status = 'cancelled', message = 'an der Kasse abgebrochen', updated = ? WHERE uuid = ?")->execute([now(), $uuid]);
        $cp = card_payment($uuid);
    }
    return $cp;
}
