<?php
/**
 * Wunsch-Fabrik.dk – Stripe Checkout
 *
 * Erstellt eine Stripe Checkout Session für ein Produkt aus der Datenbank.
 *
 * ─── EINRICHTUNG ────────────────────────────────────────────────
 * 1. Stripe-Konto unter https://dashboard.stripe.com einrichten
 * 2. Geheimen API-Key (sk_live_... bzw. sk_test_...) unten eintragen
 * 3. Stripe PHP-Bibliothek hochladen, z.B. via Composer:
 *    composer require stripe/stripe-php
 *    -> Ordner "vendor/" mit hochladen, Pfad unten anpassen
 * 4. Erfolgs- und Abbruch-Seiten (success.html / cancel.html) nach
 *    Bedarf anpassen oder erstellen
 *
 * Solange STRIPE_SECRET_KEY leer ist, gibt dieses Script einen
 * "stripe_not_configured" Fehler zurück und der Shop zeigt dem
 * Kunden einen freundlichen Hinweis statt eines Checkouts.
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
require_once __DIR__ . '/db.php';

// ─── STRIPE-KONFIGURATION ────────────────────────────────────────
// Trage hier deinen geheimen Stripe-API-Key ein (sk_live_... oder sk_test_...)
define('STRIPE_SECRET_KEY', '');

// URLs, zu denen Stripe nach erfolgreicher/abgebrochener Zahlung leitet
define('STRIPE_SUCCESS_URL', 'https://www.wunsch-fabrik.dk/shop.html?success=1');
define('STRIPE_CANCEL_URL', 'https://www.wunsch-fabrik.dk/shop.html?cancelled=1');

// Pfad zur Stripe PHP-Bibliothek (nach Composer-Installation)
define('STRIPE_LIB_PATH', __DIR__ . '/vendor/autoload.php');

// ─── Produkt aus Datenbank laden ─────────────────────────────────
$productId = (int)($_POST['product_id'] ?? 0);
if (!$productId) {
    echo json_encode(['ok' => false, 'error' => 'invalid_product']);
    exit;
}

$mysqli = wf_db_connect();
if (!$mysqli) {
    echo json_encode(['ok' => false, 'error' => 'db_error']);
    exit;
}
wf_ensure_tables($mysqli);

$stmt = $mysqli->prepare("SELECT id, name, price, price_unit, image FROM products WHERE id = ? AND active = 1");
$stmt->bind_param('i', $productId);
$stmt->execute();
$product = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$product) {
    echo json_encode(['ok' => false, 'error' => 'product_not_found']);
    exit;
}

// ─── Prüfen ob Stripe eingerichtet ist ────────────────────────────
if (STRIPE_SECRET_KEY === '' || !is_file(STRIPE_LIB_PATH)) {
    echo json_encode(['ok' => false, 'error' => 'stripe_not_configured']);
    exit;
}

require_once STRIPE_LIB_PATH;

try {
    \Stripe\Stripe::setApiKey(STRIPE_SECRET_KEY);

    // Preis in Øre/Cent umrechnen (Stripe erwartet kleinste Währungseinheit)
    $unitAmount = (int)round($product['price'] * 100);

    $session = \Stripe\Checkout\Session::create([
        'payment_method_types' => ['card'],
        'mode' => 'payment',
        'line_items' => [[
            'price_data' => [
                'currency' => 'dkk',
                'product_data' => [
                    'name' => $product['name'],
                ],
                'unit_amount' => $unitAmount,
            ],
            'quantity' => 1,
        ]],
        'success_url' => STRIPE_SUCCESS_URL,
        'cancel_url' => STRIPE_CANCEL_URL,
    ]);

    echo json_encode(['ok' => true, 'checkout_url' => $session->url]);
} catch (Exception $e) {
    echo json_encode(['ok' => false, 'error' => 'stripe_error', 'message' => $e->getMessage()]);
}
