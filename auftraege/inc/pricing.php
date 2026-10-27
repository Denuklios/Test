<?php
declare(strict_types=1);

/*
 * Marktpreise für Endkunden in Dänemark (1 Stück, DKK inkl. 25 % Moms), recherchiert Oktober 2026 bei dänischen Anbietern.
 * [Schlüsselwörter Artikel, Schlüsselwörter Verfahren (leer = egal), niedrig, typisch, hoch, Quelle; geschätzt = keine direkte Quelle]
 */
function wf_price_refs(): array
{
    return [
        ['tshirt', 'druck', 12500, 15000, 25000, 'mdesigns.dk 128 kr, Skejby Tekstil 175 kr, tekstil-tryk.dk 100–250 kr'],
        ['tshirt', 'stick', 15000, 19900, 27500, 'geschätzt: T-Shirt ca. 50–80 kr + Stick 60–120 kr'],
        ['hoodie', 'druck', 25000, 34900, 45000, 'tojtryk.dk Hoodie ab 199 kr ex. Moms + Druck'],
        ['hoodie', 'stick', 30000, 39900, 50000, 'tojtryk.dk Hoodie 199–327 kr ex. Moms + Stick'],
        ['polo', '', 19900, 24900, 32500, 'geschätzt nach tojtryk.dk/merchbart.dk Firmenkleidung'],
        ['cap', '', 15000, 19900, 25000, 'ditprint.dk 199 kr, merchbart.dk 119 kr ex. Moms'],
        ['tasche', '', 8900, 9900, 15000, 'mdesigns.dk 89 kr, merchbart.dk 99 kr ex. Moms'],
        ['zaubertasse', '', 15500, 16900, 22000, 'photobox.dk 155 kr'],
        ['tasse', '', 8000, 12900, 22000, 'picta.dk 80 kr, cewe.dk 99–179 kr, pixum.dk 99–219 kr'],
        ['kissen', '', 13000, 24900, 45000, 'Bilka Foto 194–229 kr, pixum.dk 299–449 kr'],
        ['body', '', 12500, 14900, 17500, 'minicreative.dk 149 kr, organiclullaby.com 149 kr, broderibixen.dk 125 kr'],
        ['schuerze', '', 14900, 19900, 25000, 'geschätzt (keine Preisangaben gefunden)'],
        ['brett', '', 15900, 29900, 44000, 'lasergaver.dk 289 kr, skovgaarden 299 kr, dahlsgravering.dk 159–399 kr'],
        ['glas', '', 15000, 18900, 22000, 'lasergaver.dk Champagnerglas 189 kr'],
        ['holz', '', 10000, 15000, 30000, 'lasergravering-gnist.dk ab 100 kr'],
        ['einrichtung', '', 20000, 30000, 50000, 'tojtryk.dk 199 kr ex. Moms je Logo, scansafe.dk 500 kr, Stickdatei 500 kr'],
        ['vektor', '', 30000, 37500, 50000, 'tojtryk.dk 300 kr, fisto.dk 399 kr ex. Moms'],
    ];
}

/** Wortgruppen DE/DA/EN -> Schlüssel. Reihenfolge zählt (Zaubertasse vor Tasse). */
function wf_price_words(): array
{
    return [
        'zaubertasse' => ['zaubertasse', 'magic', 'magisk', 'farbwechsel'],
        'tshirt' => ['t-shirt', 'tshirt', 't shirt', 'shirt', 'tee', 'trøje'],
        'hoodie' => ['hoodie', 'hættetrøje', 'kapuzen', 'sweat', 'pullover'],
        'polo' => ['polo'],
        'cap' => ['cap', 'kappe', 'kasket', 'mütze', 'basecap', 'hue'],
        'tasche' => ['tasche', 'beutel', 'mulepose', 'tote', 'jutebeutel', 'taske', 'turnbeutel'],
        'tasse' => ['tasse', 'becher', 'krus', 'kop', 'mug'],
        'kissen' => ['kissen', 'pude', 'pillow'],
        'body' => ['body', 'babybody', 'bodystocking', 'strampler'],
        'schuerze' => ['schürze', 'schuerze', 'forklæde', 'apron'],
        'brett' => ['brett', 'skærebræt', 'bræt', 'schneidebrett', 'frühstücksbrett'],
        'glas' => ['glas', 'sektglas', 'weinglas', 'champagne', 'flasche', 'flaske'],
        'holz' => ['holz', 'træ', 'wood'],
        'einrichtung' => ['einrichtung', 'stickdatei', 'opsætning', 'setup', 'broderifil', 'punch'],
        'vektor' => ['vektor', 'nachzeichnen', 'logo erstellen', 'vektorisering', 'omtegning'],
        'stick' => ['stick', 'bestickt', 'broderi', 'broderet', 'embroid'],
        'druck' => ['druck', 'bedruckt', 'print', 'tryk', 'dtf', 'flex', 'flock', 'sieb', 'transfer', 'plot'],
    ];
}

function wf_price_suggest(string $name): ?array
{
    $n = mb_strtolower($name);
    $hit = [];
    foreach (wf_price_words() as $k => $ws) {
        foreach ($ws as $w) {
            if (str_contains($n, $w)) {
                $hit[$k] = true;
                break;
            }
        }
    }
    if (isset($hit['zaubertasse'])) {
        unset($hit['tasse']);
    }
    if (isset($hit['hoodie']) || isset($hit['polo'])) {
        unset($hit['tshirt']); // Hættetrøje, Sweatshirt, Poloshirt
    }
    $best = null;
    foreach (wf_price_refs() as $r) {
        if (!isset($hit[$r[0]])) {
            continue;
        }
        $score = 2 + ($r[1] !== '' && isset($hit[$r[1]]) ? 1 : 0) - ($r[1] !== '' && !isset($hit[$r[1]]) ? 0.5 : 0);
        if (!$best || $score > $best[0]) {
            $best = [$score, $r];
        }
    }
    if (!$best) {
        return null;
    }
    [, $r] = $best;
    return ['key' => $r[0] . ($r[1] ? '_' . $r[1] : ''), 'low' => $r[2], 'typ' => $r[3], 'high' => $r[4], 'source' => $r[5],
        'estimated' => str_starts_with($r[5], 'geschätzt'), 'incl_vat' => true];
}
