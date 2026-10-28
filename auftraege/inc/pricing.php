<?php
declare(strict_types=1);

/*
 * Marktpreise für Endkunden, 1 Stück, recherchiert Oktober 2026.
 * DK: DKK in Øre inkl. 25 % Moms; DE: Euro-Cent inkl. 19 % MwSt. Quelle mit „geschätzt“ = keine direkte Preisangabe gefunden.
 * [Artikel, Verfahren (leer = egal), DK niedrig, typisch, hoch, DK-Quelle, DE niedrig, typisch, hoch, DE-Quelle]
 */
function wf_price_refs(): array
{
    return [
        ['tshirt', 'druck', 12500, 15000, 25000, 'mdesigns.dk 128 kr, Skejby Tekstil 175 kr, tekstil-tryk.dk 100–250 kr', 1500, 2000, 3000, 'druckdeintextil.de 20–30 €, eBay-Druckdienst 18 €, Einzelstück-Shops ab 14,95 €'],
        ['tshirt', 'stick', 15000, 19900, 27500, 'geschätzt: T-Shirt ca. 50–80 kr + Stick 60–120 kr', 2000, 2500, 3500, 'geschätzt: Druckpreis + ca. 8 € Stickaufpreis (druckdeintextil.de)'],
        ['hoodie', 'druck', 25000, 34900, 45000, 'tojtryk.dk Hoodie ab 199 kr ex. Moms + Druck', 3000, 3700, 5000, 'Textildrucker 30,86 €, wlw.de 34,77–59,99 €'],
        ['hoodie', 'stick', 30000, 39900, 50000, 'tojtryk.dk Hoodie 199–327 kr ex. Moms + Stick', 3500, 4800, 6000, 'stitchyourmind.de 47,90 €, stickerei.com 49 €'],
        ['polo', '', 19900, 24900, 32500, 'geschätzt nach tojtryk.dk/merchbart.dk Firmenkleidung', 2500, 3200, 4500, 'geschätzt nach T-Shirt-/Hoodie-Preisen'],
        ['cap', '', 15000, 19900, 25000, 'ditprint.dk 199 kr, merchbart.dk 119 kr ex. Moms', 1500, 2000, 3000, 'cap-selbst-gestalten.de 19,90 €'],
        ['tasche', '', 8900, 9900, 15000, 'mdesigns.dk 89 kr, merchbart.dk 99 kr ex. Moms', 900, 1300, 1700, 'eBay 9,18–16,99 €'],
        ['zaubertasse', '', 15500, 16900, 22000, 'photobox.dk 155 kr', 1500, 1800, 2500, 'geschätzt (Glitzertasse mit Namen 16 €)'],
        ['tasse', '', 8000, 12900, 22000, 'picta.dk 80 kr, cewe.dk 99–179 kr, pixum.dk 99–219 kr', 700, 1500, 2000, 'meinfoto.de ab 6,95 €, dm 14,95 €, tassendruck.de 15,95 €'],
        ['kissen', '', 13000, 24900, 45000, 'Bilka Foto 194–229 kr, pixum.dk 299–449 kr', 1500, 2200, 4000, 'personello.de 12,95 € + 2 € Füllung, printplanet.de 18,90–39,90 €, tassendruck.de 18,95 €'],
        ['body', '', 12500, 14900, 17500, 'minicreative.dk 149 kr, organiclullaby.com 149 kr, broderibixen.dk 125 kr', 900, 1900, 2500, 'sabber-latz.de 8,99 €, druckdichdrauf.de ab 18,90 € + Druck'],
        ['schuerze', '', 14900, 19900, 25000, 'geschätzt (keine Preisangaben gefunden)', 2000, 2500, 3500, 'geschätzt (keine Preisangaben gefunden)'],
        ['brett', '', 15900, 29900, 44000, 'lasergaver.dk 289 kr, skovgaarden 299 kr, dahlsgravering.dk 159–399 kr', 2000, 3200, 4500, 'personello.de 19,95–29,95 €, gravado.de 34,95 €, hofmeister.shop 34,90–44,90 €'],
        ['glas', '', 15000, 18900, 22000, 'lasergaver.dk Champagnerglas 189 kr', 1500, 2000, 3000, 'geschätzt (keine Preisangaben gefunden)'],
        ['holz', '', 10000, 15000, 30000, 'lasergravering-gnist.dk ab 100 kr', 1000, 2000, 3500, 'geschätzt (laserliebe.de ab 9,90 €)'],
        ['einrichtung', '', 20000, 30000, 50000, 'tojtryk.dk 199 kr ex. Moms je Logo, scansafe.dk 500 kr, Stickdatei 500 kr', 2500, 4000, 6000, 'geschätzt (Stickprogramm einmalig)'],
        ['vektor', '', 30000, 37500, 50000, 'tojtryk.dk 300 kr, fisto.dk 399 kr ex. Moms', 3000, 4500, 6000, 'geschätzt'],
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

/** $eur = DKK je 1 € (Tageskurs, sonst Leitkurs). Mittelweg: Nettopreise DK und DE mitteln, dann 25 % dänische Moms. */
function wf_price_suggest(string $name, float $eur = 7.46038): ?array
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
    $deDkk = fn(int $c) => (int)round($c * $eur); // Euro-Cent -> Øre, weiter inkl. 19 %
    $mixNet = (int)round(($r[3] / 1.25 + $deDkk($r[7]) / 1.19) / 2);
    $mixIncl = (int)round($mixNet * 1.25 / 100) * 100; // auf volle Kronen
    return ['key' => $r[0] . ($r[1] ? '_' . $r[1] : ''), 'eur_rate' => $eur,
        'dk' => ['low' => $r[2], 'typ' => $r[3], 'high' => $r[4], 'net' => (int)round($r[3] / 1.25), 'source' => $r[5], 'estimated' => str_starts_with($r[5], 'geschätzt')],
        'de' => ['low' => $r[6], 'typ' => $r[7], 'high' => $r[8], 'typ_dkk' => $deDkk($r[7]), 'net_dkk' => (int)round($deDkk($r[7]) / 1.19), 'source' => $r[9], 'estimated' => str_starts_with($r[9], 'geschätzt')],
        'mix' => ['incl' => $mixIncl, 'net' => (int)round($mixIncl / 1.25)]];
}
