<?php
declare(strict_types=1);

/**
 * Vorgabe-Katalog für Textilveredelung, Sublimation, Lasergravur und CNC.
 * Wird nur auf Knopfdruck geladen; vorhandene Kategorien werden wiederverwendet, Produkte mit gleicher Artikelnummer übersprungen.
 * Preise stehen auf 0 – die trägst du selbst ein. Alles bleibt bearbeitbar.
 * Eigenschaften: name, values, split (true = Menge je Wert eingeben, z. B. Größen).
 */

function wf_catalog(): array
{
    $adult = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL'];
    $women = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];
    $kids = ['98/104', '110/116', '122/128', '134/146', '152/164'];
    $baby = ['50/56', '62/68', '74/80', '86/92'];
    $tex = ['Weiß', 'Schwarz', 'Grau meliert', 'Anthrazit', 'Navy', 'Royalblau', 'Hellblau', 'Rot', 'Bordeaux', 'Flaschengrün', 'Kelly-Grün', 'Oliv', 'Gelb', 'Orange', 'Pink', 'Lila', 'Sand/Beige', 'Braun'];
    $basic = ['Weiß', 'Schwarz', 'Grau meliert', 'Navy', 'Royalblau', 'Rot', 'Flaschengrün', 'Bordeaux'];
    $cap = ['Schwarz', 'Weiß', 'Navy', 'Grau', 'Rot', 'Royalblau', 'Oliv', 'Beige'];
    $bag = ['Natur', 'Weiß', 'Schwarz', 'Navy', 'Rot', 'Royalblau', 'Grün', 'Grau'];
    $towel = ['Weiß', 'Schwarz', 'Anthrazit', 'Navy', 'Rot', 'Bordeaux', 'Grün', 'Beige', 'Hellblau', 'Pink'];
    $inner = ['Weiß', 'Schwarz', 'Rot', 'Blau', 'Hellblau', 'Grün', 'Gelb', 'Orange', 'Pink'];
    $wood = ['Buche', 'Eiche', 'Akazie', 'Nussbaum', 'Bambus'];
    $metal = ['Silber', 'Schwarz', 'Gold', 'Blau', 'Rot', 'Grün'];

    $G = fn(array $v) => ['name' => 'Größe', 'values' => $v, 'split' => true];
    $F = fn(array $v) => ['name' => 'Farbe', 'values' => $v, 'split' => false];
    $ML = fn(array $v) => ['name' => 'Inhalt', 'values' => $v, 'split' => false];
    $CM = fn(array $v) => ['name' => 'Maße (L × B)', 'values' => $v, 'split' => false];
    $O = fn(string $n, array $v) => ['name' => $n, 'values' => $v, 'split' => false];

    // [Kategorie, Unterkategorie, Artikelnr., Name, Einheit, Art, Eigenschaften]
    return [
        // ---------- Textilien ----------
        ['Textilien', 'T-Shirts', 'WF-TS-001', 'T-Shirt Basic Unisex', 'stk', 'goods', [$G($adult), $F($tex)]],
        ['Textilien', 'T-Shirts', 'WF-TS-002', 'T-Shirt Premium (schwere Qualität)', 'stk', 'goods', [$G($adult), $F($tex)]],
        ['Textilien', 'T-Shirts', 'WF-TS-003', 'T-Shirt Bio-Baumwolle', 'stk', 'goods', [$G($adult), $F($basic)]],
        ['Textilien', 'T-Shirts', 'WF-TS-004', 'T-Shirt Damen tailliert', 'stk', 'goods', [$G($women), $F($tex)]],
        ['Textilien', 'T-Shirts', 'WF-TS-005', 'T-Shirt Kinder', 'stk', 'goods', [$G($kids), $F($tex)]],
        ['Textilien', 'T-Shirts', 'WF-TS-006', 'V-Neck T-Shirt', 'stk', 'goods', [$G($adult), $F($basic)]],
        ['Textilien', 'T-Shirts', 'WF-TS-007', 'Longsleeve', 'stk', 'goods', [$G($adult), $F($basic)]],
        ['Textilien', 'T-Shirts', 'WF-TS-008', 'Tanktop', 'stk', 'goods', [$G($adult), $F($basic)]],
        ['Textilien', 'T-Shirts', 'WF-TS-009', 'Funktionsshirt (Sport)', 'stk', 'goods', [$G($adult), $F($basic)]],
        ['Textilien', 'T-Shirts', 'WF-TS-010', 'Funktionsshirt Kinder', 'stk', 'goods', [$G($kids), $F($basic)]],
        ['Textilien', 'Poloshirts', 'WF-PO-001', 'Poloshirt Unisex', 'stk', 'goods', [$G($adult), $F($tex)]],
        ['Textilien', 'Poloshirts', 'WF-PO-002', 'Poloshirt Damen', 'stk', 'goods', [$G($women), $F($tex)]],
        ['Textilien', 'Poloshirts', 'WF-PO-003', 'Poloshirt Kinder', 'stk', 'goods', [$G($kids), $F($basic)]],
        ['Textilien', 'Poloshirts', 'WF-PO-004', 'Funktionspolo', 'stk', 'goods', [$G($adult), $F($basic)]],
        ['Textilien', 'Poloshirts', 'WF-PO-005', 'Poloshirt Langarm', 'stk', 'goods', [$G($adult), $F($basic)]],
        ['Textilien', 'Sweatshirts & Hoodies', 'WF-SW-001', 'Sweatshirt', 'stk', 'goods', [$G($adult), $F($tex)]],
        ['Textilien', 'Sweatshirts & Hoodies', 'WF-SW-002', 'Hoodie (Kapuzenpullover)', 'stk', 'goods', [$G($adult), $F($tex)]],
        ['Textilien', 'Sweatshirts & Hoodies', 'WF-SW-003', 'Zip-Hoodie (Kapuzenjacke)', 'stk', 'goods', [$G($adult), $F($tex)]],
        ['Textilien', 'Sweatshirts & Hoodies', 'WF-SW-004', 'Sweatjacke ohne Kapuze', 'stk', 'goods', [$G($adult), $F($basic)]],
        ['Textilien', 'Sweatshirts & Hoodies', 'WF-SW-005', 'Hoodie Bio-Baumwolle', 'stk', 'goods', [$G($adult), $F($basic)]],
        ['Textilien', 'Sweatshirts & Hoodies', 'WF-SW-006', 'Hoodie Kinder', 'stk', 'goods', [$G($kids), $F($tex)]],
        ['Textilien', 'Sweatshirts & Hoodies', 'WF-SW-007', 'Sweatshirt Kinder', 'stk', 'goods', [$G($kids), $F($basic)]],
        ['Textilien', 'Sweatshirts & Hoodies', 'WF-SW-008', 'Jogginghose', 'stk', 'goods', [$G($adult), $F($basic)]],
        ['Textilien', 'Jacken & Westen', 'WF-JA-001', 'Softshelljacke', 'stk', 'goods', [$G($adult), $F(['Schwarz', 'Navy', 'Anthrazit', 'Rot', 'Royalblau', 'Grün'])]],
        ['Textilien', 'Jacken & Westen', 'WF-JA-002', 'Softshellweste', 'stk', 'goods', [$G($adult), $F(['Schwarz', 'Navy', 'Anthrazit', 'Rot'])]],
        ['Textilien', 'Jacken & Westen', 'WF-JA-003', 'Fleecejacke', 'stk', 'goods', [$G($adult), $F(['Schwarz', 'Navy', 'Grau', 'Rot', 'Royalblau'])]],
        ['Textilien', 'Jacken & Westen', 'WF-JA-004', 'Steppweste (Bodywarmer)', 'stk', 'goods', [$G($adult), $F(['Schwarz', 'Navy', 'Anthrazit'])]],
        ['Textilien', 'Jacken & Westen', 'WF-JA-005', 'Regenjacke', 'stk', 'goods', [$G($adult), $F(['Schwarz', 'Navy', 'Gelb', 'Rot'])]],
        ['Textilien', 'Jacken & Westen', 'WF-JA-006', 'Trainingsjacke (Verein)', 'stk', 'goods', [$G(array_merge($kids, $adult)), $F($basic)]],
        ['Textilien', 'Jacken & Westen', 'WF-JA-007', 'Softshelljacke Damen', 'stk', 'goods', [$G($women), $F(['Schwarz', 'Navy', 'Anthrazit', 'Rot'])]],
        ['Textilien', 'Arbeitskleidung', 'WF-AK-001', 'Arbeits-T-Shirt (strapazierfähig)', 'stk', 'goods', [$G($adult), $F($basic)]],
        ['Textilien', 'Arbeitskleidung', 'WF-AK-002', 'Arbeitshose', 'stk', 'goods', [$G(['44', '46', '48', '50', '52', '54', '56', '58', '60', '62']), $F(['Schwarz', 'Grau', 'Navy', 'Khaki'])]],
        ['Textilien', 'Arbeitskleidung', 'WF-AK-003', 'Kochjacke', 'stk', 'goods', [$G($adult), $F(['Weiß', 'Schwarz'])]],
        ['Textilien', 'Arbeitskleidung', 'WF-AK-004', 'Bistroschürze', 'stk', 'goods', [$F(['Schwarz', 'Weiß', 'Navy', 'Bordeaux', 'Grau', 'Braun']), $CM(['70 × 50 cm', '90 × 70 cm'])]],
        ['Textilien', 'Arbeitskleidung', 'WF-AK-005', 'Latzschürze', 'stk', 'goods', [$F(['Schwarz', 'Weiß', 'Navy', 'Bordeaux', 'Grau', 'Rot', 'Grün']), $CM(['72 × 86 cm'])]],
        ['Textilien', 'Arbeitskleidung', 'WF-AK-006', 'Warnweste', 'stk', 'goods', [$G(['S/M', 'L/XL', 'XXL/3XL']), $F(['Gelb', 'Orange'])]],
        ['Textilien', 'Arbeitskleidung', 'WF-AK-007', 'Kasack / Pflegekittel', 'stk', 'goods', [$G($adult), $F(['Weiß', 'Navy', 'Hellblau', 'Grün'])]],
        ['Textilien', 'Kopfbedeckungen', 'WF-KO-001', 'Baseball-Cap', 'stk', 'goods', [$O('Größe', ['Einheitsgröße (verstellbar)']), $F($cap)]],
        ['Textilien', 'Kopfbedeckungen', 'WF-KO-002', 'Trucker-Cap (Mesh)', 'stk', 'goods', [$O('Größe', ['Einheitsgröße (verstellbar)']), $F($cap)]],
        ['Textilien', 'Kopfbedeckungen', 'WF-KO-003', 'Snapback-Cap', 'stk', 'goods', [$O('Größe', ['Einheitsgröße (verstellbar)']), $F($cap)]],
        ['Textilien', 'Kopfbedeckungen', 'WF-KO-004', 'Kinder-Cap', 'stk', 'goods', [$O('Größe', ['Kinder (verstellbar)']), $F($cap)]],
        ['Textilien', 'Kopfbedeckungen', 'WF-KO-005', 'Beanie / Strickmütze', 'stk', 'goods', [$O('Größe', ['Erwachsene', 'Kinder']), $F($cap)]],
        ['Textilien', 'Kopfbedeckungen', 'WF-KO-006', 'Bommelmütze', 'stk', 'goods', [$O('Größe', ['Erwachsene', 'Kinder']), $F($cap)]],
        ['Textilien', 'Kopfbedeckungen', 'WF-KO-007', 'Bucket Hat (Fischerhut)', 'stk', 'goods', [$G(['S/M', 'L/XL']), $F(['Schwarz', 'Weiß', 'Navy', 'Beige', 'Oliv'])]],
        ['Textilien', 'Kopfbedeckungen', 'WF-KO-008', 'Stirnband', 'stk', 'goods', [$F($cap)]],
        ['Textilien', 'Taschen', 'WF-TA-001', 'Baumwolltasche kurze Henkel', 'stk', 'goods', [$F($bag), $CM(['38 × 42 cm'])]],
        ['Textilien', 'Taschen', 'WF-TA-002', 'Baumwolltasche lange Henkel', 'stk', 'goods', [$F($bag), $CM(['38 × 42 cm'])]],
        ['Textilien', 'Taschen', 'WF-TA-003', 'Jutebeutel', 'stk', 'goods', [$F(['Natur']), $CM(['30 × 40 cm', '38 × 42 cm'])]],
        ['Textilien', 'Taschen', 'WF-TA-004', 'Turnbeutel (Gymsac)', 'stk', 'goods', [$F($bag), $CM(['37 × 46 cm'])]],
        ['Textilien', 'Taschen', 'WF-TA-005', 'Rucksack', 'stk', 'goods', [$F(['Schwarz', 'Navy', 'Grau', 'Rot'])]],
        ['Textilien', 'Taschen', 'WF-TA-006', 'Sporttasche', 'stk', 'goods', [$F(['Schwarz', 'Navy', 'Grau', 'Rot'])]],
        ['Textilien', 'Taschen', 'WF-TA-007', 'Kühltasche', 'stk', 'goods', [$F(['Schwarz', 'Navy', 'Grau'])]],
        ['Textilien', 'Frottee & Heimtextilien', 'WF-HT-001', 'Gästehandtuch', 'stk', 'goods', [$CM(['30 × 50 cm']), $F($towel)]],
        ['Textilien', 'Frottee & Heimtextilien', 'WF-HT-002', 'Handtuch', 'stk', 'goods', [$CM(['50 × 100 cm']), $F($towel)]],
        ['Textilien', 'Frottee & Heimtextilien', 'WF-HT-003', 'Duschtuch', 'stk', 'goods', [$CM(['70 × 140 cm']), $F($towel)]],
        ['Textilien', 'Frottee & Heimtextilien', 'WF-HT-004', 'Badetuch / Saunatuch', 'stk', 'goods', [$CM(['100 × 150 cm', '80 × 200 cm']), $F($towel)]],
        ['Textilien', 'Frottee & Heimtextilien', 'WF-HT-005', 'Bademantel', 'stk', 'goods', [$G(['S/M', 'L/XL', 'XXL']), $F(['Weiß', 'Anthrazit', 'Navy'])]],
        ['Textilien', 'Frottee & Heimtextilien', 'WF-HT-006', 'Kissenbezug', 'stk', 'goods', [$CM(['40 × 40 cm', '50 × 50 cm']), $F(['Weiß', 'Natur', 'Schwarz', 'Grau'])]],
        ['Textilien', 'Frottee & Heimtextilien', 'WF-HT-007', 'Kuscheldecke (Fleece)', 'stk', 'goods', [$CM(['130 × 170 cm', '150 × 200 cm']), $F(['Weiß', 'Grau', 'Anthrazit', 'Navy', 'Rot', 'Beige'])]],
        ['Textilien', 'Frottee & Heimtextilien', 'WF-HT-008', 'Geschirrtuch', 'stk', 'goods', [$CM(['50 × 70 cm']), $F(['Weiß', 'Natur', 'Grau'])]],
        ['Textilien', 'Baby & Kinder', 'WF-BK-001', 'Babybody Kurzarm', 'stk', 'goods', [$G($baby), $F(['Weiß', 'Grau meliert', 'Hellblau', 'Rosa', 'Schwarz'])]],
        ['Textilien', 'Baby & Kinder', 'WF-BK-002', 'Babybody Langarm', 'stk', 'goods', [$G($baby), $F(['Weiß', 'Grau meliert', 'Hellblau', 'Rosa'])]],
        ['Textilien', 'Baby & Kinder', 'WF-BK-003', 'Lätzchen', 'stk', 'goods', [$F(['Weiß', 'Hellblau', 'Rosa', 'Grau'])]],
        ['Textilien', 'Baby & Kinder', 'WF-BK-004', 'Babymütze', 'stk', 'goods', [$G(['0–6 Monate', '6–12 Monate']), $F(['Weiß', 'Hellblau', 'Rosa', 'Grau'])]],
        ['Textilien', 'Baby & Kinder', 'WF-BK-005', 'Kapuzenhandtuch Baby', 'stk', 'goods', [$CM(['75 × 75 cm', '100 × 100 cm']), $F(['Weiß', 'Hellblau', 'Rosa', 'Grau'])]],
        ['Textilien', 'Baby & Kinder', 'WF-BK-006', 'Kuscheltier mit Shirt', 'stk', 'goods', [$O('Tier', ['Teddy', 'Hase', 'Hund', 'Einhorn']), $O('Höhe', ['20 cm', '30 cm'])]],
        ['Textilien', 'Sport & Verein', 'WF-SP-001', 'Trikot', 'stk', 'goods', [$G(array_merge($kids, $adult)), $F($basic)]],
        ['Textilien', 'Sport & Verein', 'WF-SP-002', 'Sporthose / Shorts', 'stk', 'goods', [$G(array_merge($kids, $adult)), $F(['Schwarz', 'Weiß', 'Navy', 'Rot', 'Royalblau'])]],
        ['Textilien', 'Sport & Verein', 'WF-SP-003', 'Trainingsanzug', 'stk', 'goods', [$G(array_merge($kids, $adult)), $F(['Schwarz', 'Navy', 'Royalblau', 'Rot'])]],
        ['Textilien', 'Sport & Verein', 'WF-SP-004', 'Stutzen / Sportsocken (Paar)', 'stk', 'goods', [$G(['27–30', '31–34', '35–38', '39–42', '43–46']), $F(['Schwarz', 'Weiß', 'Navy', 'Rot', 'Royalblau'])]],
        ['Textilien', 'Sport & Verein', 'WF-SP-005', 'Aufwärmshirt / Pullover', 'stk', 'goods', [$G(array_merge($kids, $adult)), $F($basic)]],

        // ---------- Tassen, Flaschen, Gläser ----------
        ['Tassen & Gläser', 'Tassen', 'WF-MU-001', 'Keramiktasse weiß', 'stk', 'goods', [$ML(['330 ml'])]],
        ['Tassen & Gläser', 'Tassen', 'WF-MU-002', 'Tasse innen & Henkel farbig', 'stk', 'goods', [$ML(['330 ml']), $O('Farbe innen', $inner)]],
        ['Tassen & Gläser', 'Tassen', 'WF-MU-003', 'Tasse komplett farbig (Gravur)', 'stk', 'goods', [$ML(['330 ml']), $F(['Schwarz', 'Rot', 'Blau', 'Grün', 'Grau', 'Pink'])]],
        ['Tassen & Gläser', 'Tassen', 'WF-MU-004', 'Zaubertasse (Farbwechsel)', 'stk', 'goods', [$ML(['330 ml']), $F(['Schwarz', 'Rot', 'Blau'])]],
        ['Tassen & Gläser', 'Tassen', 'WF-MU-005', 'Jumbo-Tasse', 'stk', 'goods', [$ML(['450 ml'])]],
        ['Tassen & Gläser', 'Tassen', 'WF-MU-006', 'Latte-Macchiato-Glas / Tasse', 'stk', 'goods', [$ML(['300 ml', '350 ml'])]],
        ['Tassen & Gläser', 'Tassen', 'WF-MU-007', 'Emaille-Tasse', 'stk', 'goods', [$ML(['300 ml', '360 ml']), $O('Rand', ['Silber', 'Schwarz', 'Blau'])]],
        ['Tassen & Gläser', 'Tassen', 'WF-MU-008', 'Kindertasse Kunststoff (bruchfest)', 'stk', 'goods', [$ML(['250 ml', '300 ml'])]],
        ['Tassen & Gläser', 'Tassen', 'WF-MU-009', 'Espressotasse', 'stk', 'goods', [$ML(['90 ml'])]],
        ['Tassen & Gläser', 'Tassen', 'WF-MU-010', 'Glitzertasse', 'stk', 'goods', [$ML(['330 ml']), $F(['Silber', 'Gold', 'Rosé', 'Blau'])]],
        ['Tassen & Gläser', 'Flaschen & Becher', 'WF-FL-001', 'Edelstahl-Trinkflasche (isoliert)', 'stk', 'goods', [$ML(['350 ml', '500 ml', '750 ml', '1000 ml']), $F(['Weiß', 'Silber', 'Schwarz', 'Navy', 'Rot', 'Grün', 'Pink'])]],
        ['Tassen & Gläser', 'Flaschen & Becher', 'WF-FL-002', 'Alu-Trinkflasche', 'stk', 'goods', [$ML(['400 ml', '600 ml', '750 ml']), $F(['Weiß', 'Silber', 'Schwarz', 'Blau', 'Rot'])]],
        ['Tassen & Gläser', 'Flaschen & Becher', 'WF-FL-003', 'Kinder-Trinkflasche', 'stk', 'goods', [$ML(['350 ml', '500 ml']), $F(['Weiß', 'Blau', 'Pink', 'Grün'])]],
        ['Tassen & Gläser', 'Flaschen & Becher', 'WF-FL-004', 'Thermobecher To-go', 'stk', 'goods', [$ML(['350 ml', '400 ml', '500 ml']), $F(['Weiß', 'Silber', 'Schwarz', 'Navy'])]],
        ['Tassen & Gläser', 'Flaschen & Becher', 'WF-FL-005', 'Tumbler mit Strohhalm', 'stk', 'goods', [$ML(['600 ml', '900 ml']), $F(['Weiß', 'Schwarz', 'Rosé', 'Mint'])]],
        ['Tassen & Gläser', 'Flaschen & Becher', 'WF-FL-006', 'Glas-Trinkflasche', 'stk', 'goods', [$ML(['500 ml', '750 ml'])]],
        ['Tassen & Gläser', 'Flaschen & Becher', 'WF-FL-007', 'Flachmann', 'stk', 'goods', [$ML(['180 ml', '240 ml']), $F(['Silber', 'Schwarz'])]],
        ['Tassen & Gläser', 'Gläser', 'WF-GL-001', 'Weinglas', 'stk', 'goods', [$ML(['350 ml', '450 ml'])]],
        ['Tassen & Gläser', 'Gläser', 'WF-GL-002', 'Sektglas', 'stk', 'goods', [$ML(['200 ml'])]],
        ['Tassen & Gläser', 'Gläser', 'WF-GL-003', 'Bierglas / Willibecher', 'stk', 'goods', [$ML(['300 ml', '500 ml'])]],
        ['Tassen & Gläser', 'Gläser', 'WF-GL-004', 'Weizenbierglas', 'stk', 'goods', [$ML(['500 ml'])]],
        ['Tassen & Gläser', 'Gläser', 'WF-GL-005', 'Bierkrug', 'stk', 'goods', [$ML(['500 ml', '1000 ml'])]],
        ['Tassen & Gläser', 'Gläser', 'WF-GL-006', 'Whiskyglas (Tumbler)', 'stk', 'goods', [$ML(['300 ml', '330 ml'])]],
        ['Tassen & Gläser', 'Gläser', 'WF-GL-007', 'Schnapsglas', 'stk', 'goods', [$ML(['20 ml (2 cl)', '40 ml (4 cl)'])]],
        ['Tassen & Gläser', 'Gläser', 'WF-GL-008', 'Wasserglas / Longdrinkglas', 'stk', 'goods', [$ML(['250 ml', '300 ml', '400 ml'])]],
        ['Tassen & Gläser', 'Gläser', 'WF-GL-009', 'Ginglas (Ballon)', 'stk', 'goods', [$ML(['650 ml'])]],
        ['Tassen & Gläser', 'Gläser', 'WF-GL-010', 'Einmachglas / Bügelglas', 'stk', 'goods', [$ML(['250 ml', '500 ml', '1000 ml'])]],
        ['Tassen & Gläser', 'Gläser', 'WF-GL-011', 'Windlicht / Teelichtglas', 'stk', 'goods', [$O('Höhe', ['8 cm', '12 cm', '20 cm'])]],

        // ---------- Holz ----------
        ['Holz', 'Schneide- & Servierbretter', 'WF-HB-001', 'Schneidebrett', 'stk', 'goods', [$CM(['30 × 20 cm', '35 × 25 cm', '40 × 30 cm', '45 × 30 cm', '50 × 35 cm']), $O('Holz', $wood), $O('Stärke', ['1,5 cm', '2 cm', '3 cm'])]],
        ['Holz', 'Schneide- & Servierbretter', 'WF-HB-002', 'Frühstücksbrett', 'stk', 'goods', [$CM(['22 × 14 cm', '25 × 15 cm', '28 × 18 cm']), $O('Holz', $wood)]],
        ['Holz', 'Schneide- & Servierbretter', 'WF-HB-003', 'Servierbrett mit Griff', 'stk', 'goods', [$CM(['40 × 20 cm', '50 × 20 cm', '60 × 25 cm']), $O('Holz', $wood)]],
        ['Holz', 'Schneide- & Servierbretter', 'WF-HB-004', 'Käsebrett / Pizzabrett rund', 'stk', 'goods', [$O('Durchmesser', ['Ø 25 cm', 'Ø 30 cm', 'Ø 35 cm', 'Ø 40 cm']), $O('Holz', $wood)]],
        ['Holz', 'Schneide- & Servierbretter', 'WF-HB-005', 'Grillbrett / Steakbrett', 'stk', 'goods', [$CM(['40 × 30 cm', '50 × 30 cm', '60 × 40 cm']), $O('Holz', $wood)]],
        ['Holz', 'Schneide- & Servierbretter', 'WF-HB-006', 'Stirnholz-Schneidebrett', 'stk', 'goods', [$CM(['30 × 20 cm', '40 × 30 cm', '50 × 35 cm']), $O('Holz', ['Eiche', 'Akazie', 'Nussbaum']), $O('Stärke', ['3 cm', '4 cm'])]],
        ['Holz', 'Schneide- & Servierbretter', 'WF-HB-007', 'Tablett aus Holz', 'stk', 'goods', [$CM(['40 × 30 cm', '50 × 35 cm']), $O('Holz', $wood)]],
        ['Holz', 'Schilder & Deko', 'WF-HD-001', 'Holzschild', 'stk', 'goods', [$CM(['20 × 10 cm', '30 × 20 cm', '40 × 30 cm', '60 × 20 cm', '80 × 30 cm']), $O('Material', ['Pappel-Sperrholz 4 mm', 'Birke-Multiplex 6 mm', 'MDF 6 mm', 'Eiche massiv 2 cm'])]],
        ['Holz', 'Schilder & Deko', 'WF-HD-002', 'Türschild / Namensschild', 'stk', 'goods', [$CM(['15 × 8 cm', '20 × 10 cm', '30 × 15 cm']), $O('Material', ['Pappel-Sperrholz 4 mm', 'Birke-Multiplex 6 mm', 'Eiche massiv 2 cm'])]],
        ['Holz', 'Schilder & Deko', 'WF-HD-003', 'Hausnummer / Hausschild', 'stk', 'goods', [$CM(['20 × 20 cm', '30 × 15 cm', '40 × 20 cm']), $O('Material', ['Lärche', 'Eiche', 'Acryl'])]],
        ['Holz', 'Schilder & Deko', 'WF-HD-004', 'Untersetzer Holz', 'stk', 'goods', [$O('Form/Größe', ['rund Ø 10 cm', 'eckig 10 × 10 cm']), $O('Holz', $wood)]],
        ['Holz', 'Schilder & Deko', 'WF-HD-005', 'Schlüsselbrett', 'stk', 'goods', [$CM(['30 × 10 cm', '40 × 15 cm']), $O('Haken', ['3', '4', '5', '6'])]],
        ['Holz', 'Schilder & Deko', 'WF-HD-006', 'Anhänger / Weihnachtsdeko Holz', 'stk', 'goods', [$O('Größe', ['Ø 6 cm', 'Ø 8 cm', 'Ø 10 cm'])]],
        ['Holz', 'Schilder & Deko', 'WF-HD-007', 'Tischaufsteller / Platzkarte', 'stk', 'goods', [$CM(['10 × 5 cm', '15 × 10 cm', '21 × 15 cm (A5)'])]],
        ['Holz', 'Schilder & Deko', 'WF-HD-008', 'Holzbox / Weinkiste', 'stk', 'goods', [$O('Ausführung', ['1 Flasche', '2 Flaschen', '3 Flaschen', 'Box 30 × 20 × 10 cm'])]],
        ['Holz', 'Schilder & Deko', 'WF-HD-009', 'Bilderrahmen Holz', 'stk', 'goods', [$O('Format', ['10 × 15 cm', '13 × 18 cm', '20 × 30 cm', 'A4'])]],
        ['Holz', 'Schilder & Deko', 'WF-HD-010', 'Holz-Schriftzug / Namen', 'stk', 'goods', [$O('Breite', ['20 cm', '30 cm', '50 cm', '80 cm']), $O('Stärke', ['4 mm', '6 mm', '10 mm'])]],
        ['Holz', 'Schilder & Deko', 'WF-HD-011', 'Holz-Puzzle / Kinderpuzzle', 'stk', 'goods', [$CM(['20 × 20 cm', '30 × 20 cm'])]],
        ['Holz', 'Schilder & Deko', 'WF-HD-012', 'Holzlöffel / Kochlöffel graviert', 'stk', 'goods', [$O('Länge', ['30 cm', '35 cm']), $O('Holz', ['Buche', 'Olive'])]],
        ['Holz', 'CNC-Frästeile', 'WF-CN-001', 'Frästeil nach Zeichnung', 'stk', 'goods', [$CM(['bis 20 × 20 cm', 'bis 40 × 40 cm', 'bis 60 × 40 cm']), $O('Material', ['Multiplex', 'MDF', 'Massivholz', 'Acryl', 'Alu-Verbund (Dibond)', 'Kunststoff (PVC/HDPE)']), $O('Stärke', ['3 mm', '6 mm', '10 mm', '15 mm', '19 mm'])]],
        ['Holz', 'CNC-Frästeile', 'WF-CN-002', '3D-Schild / Relief gefräst', 'stk', 'goods', [$CM(['30 × 20 cm', '40 × 40 cm', '60 × 40 cm']), $O('Material', ['Eiche', 'Lärche', 'MDF lackiert'])]],
        ['Holz', 'CNC-Frästeile', 'WF-CN-003', 'Buchstaben / Logo freigefräst', 'stk', 'goods', [$O('Höhe', ['10 cm', '20 cm', '30 cm', '50 cm']), $O('Material', ['MDF', 'Multiplex', 'Acryl', 'Hartschaum'])]],

        // ---------- Acryl, Metall, Leder, Stein ----------
        ['Gravur & Laser', 'Acryl', 'WF-AC-001', 'Acrylschild', 'stk', 'goods', [$CM(['20 × 10 cm', '30 × 20 cm', '40 × 30 cm', '60 × 40 cm']), $O('Stärke', ['3 mm', '5 mm', '8 mm']), $F(['Transparent', 'Weiß', 'Schwarz', 'Satiniert', 'Spiegel Gold', 'Spiegel Silber'])]],
        ['Gravur & Laser', 'Acryl', 'WF-AC-002', 'Acryl-Aufsteller', 'stk', 'goods', [$CM(['10 × 15 cm', '15 × 21 cm (A5)', '21 × 30 cm (A4)'])]],
        ['Gravur & Laser', 'Acryl', 'WF-AC-003', 'Schlüsselanhänger Acryl', 'stk', 'goods', [$O('Größe', ['4 cm', '5 cm', '6 cm']), $F(['Transparent', 'Weiß', 'Schwarz', 'Farbig'])]],
        ['Gravur & Laser', 'Acryl', 'WF-AC-004', 'Caketopper / Tortenstecker', 'stk', 'goods', [$O('Breite', ['12 cm', '15 cm', '20 cm']), $F(['Spiegel Gold', 'Spiegel Silber', 'Spiegel Rosé', 'Schwarz', 'Weiß', 'Holz'])]],
        ['Gravur & Laser', 'Acryl', 'WF-AC-005', 'Namensschild / Button mit Magnet', 'stk', 'goods', [$CM(['7 × 2,5 cm', '7,6 × 3,8 cm']), $F(['Silber', 'Gold', 'Weiß', 'Schwarz', 'Holzoptik'])]],
        ['Gravur & Laser', 'Metall', 'WF-ME-001', 'Kugelschreiber Metall', 'stk', 'goods', [$F($metal)]],
        ['Gravur & Laser', 'Metall', 'WF-ME-002', 'Flaschenöffner', 'stk', 'goods', [$O('Ausführung', ['Edelstahl', 'Holzgriff', 'Schlüsselanhänger'])]],
        ['Gravur & Laser', 'Metall', 'WF-ME-003', 'Feuerzeug (Benzin)', 'stk', 'goods', [$F(['Chrom', 'Schwarz matt', 'Gold'])]],
        ['Gravur & Laser', 'Metall', 'WF-ME-004', 'Schlüsselanhänger Metall', 'stk', 'goods', [$O('Form', ['rund', 'eckig', 'Herz', 'Hundemarke'])]],
        ['Gravur & Laser', 'Metall', 'WF-ME-005', 'Taschenmesser', 'stk', 'goods', [$O('Griff', ['Holz', 'Edelstahl', 'Schwarz'])]],
        ['Gravur & Laser', 'Metall', 'WF-ME-006', 'Visitenkarte Metall', 'stk', 'goods', [$F(['Silber', 'Schwarz', 'Gold'])]],
        ['Gravur & Laser', 'Metall', 'WF-ME-007', 'Typenschild Edelstahl / Alu', 'stk', 'goods', [$CM(['5 × 2 cm', '8 × 4 cm', '10 × 5 cm']), $O('Material', ['Edelstahl', 'Alu eloxiert'])]],
        ['Gravur & Laser', 'Leder & Kork', 'WF-LE-001', 'Lederpatch (für Caps/Mützen)', 'stk', 'goods', [$CM(['5 × 5 cm', '7 × 5 cm', '8 × 4 cm']), $F(['Natur', 'Braun', 'Schwarz', 'Cognac'])]],
        ['Gravur & Laser', 'Leder & Kork', 'WF-LE-002', 'Schlüsselanhänger Leder', 'stk', 'goods', [$F(['Natur', 'Braun', 'Schwarz', 'Cognac'])]],
        ['Gravur & Laser', 'Leder & Kork', 'WF-LE-003', 'Kork-Untersetzer', 'stk', 'goods', [$O('Form/Größe', ['rund Ø 10 cm', 'eckig 10 × 10 cm'])]],
        ['Gravur & Laser', 'Leder & Kork', 'WF-LE-004', 'Hundehalsband / Leine Leder', 'stk', 'goods', [$G(['S', 'M', 'L', 'XL']), $F(['Braun', 'Schwarz', 'Cognac'])]],
        ['Gravur & Laser', 'Schiefer & Stein', 'WF-SC-001', 'Schiefer-Untersetzer', 'stk', 'goods', [$O('Form/Größe', ['rund Ø 10 cm', 'eckig 10 × 10 cm'])]],
        ['Gravur & Laser', 'Schiefer & Stein', 'WF-SC-002', 'Schieferplatte / Servierplatte', 'stk', 'goods', [$CM(['30 × 20 cm', '40 × 30 cm'])]],
        ['Gravur & Laser', 'Schiefer & Stein', 'WF-SC-003', 'Gedenkstein / Grabschmuck', 'stk', 'goods', [$CM(['15 × 10 cm', '20 × 15 cm', '30 × 20 cm'])]],

        // ---------- Foto & Werbeartikel (Sublimation, Druck) ----------
        ['Foto & Werbeartikel', 'Fotoprodukte', 'WF-FO-001', 'Fotokissen inkl. Füllung', 'stk', 'goods', [$CM(['40 × 40 cm', '30 × 50 cm'])]],
        ['Foto & Werbeartikel', 'Fotoprodukte', 'WF-FO-002', 'Alu-Fotoplatte (Sublimation)', 'stk', 'goods', [$CM(['20 × 30 cm', '30 × 40 cm', '40 × 60 cm', '60 × 90 cm']), $O('Oberfläche', ['Glanz', 'Matt'])]],
        ['Foto & Werbeartikel', 'Fotoprodukte', 'WF-FO-003', 'Fotopuzzle', 'stk', 'goods', [$O('Format', ['A5 · 80 Teile', 'A4 · 120 Teile', 'A3 · 252 Teile'])]],
        ['Foto & Werbeartikel', 'Fotoprodukte', 'WF-FO-004', 'Fotofliese', 'stk', 'goods', [$CM(['15 × 15 cm', '20 × 20 cm', '20 × 25 cm'])]],
        ['Foto & Werbeartikel', 'Fotoprodukte', 'WF-FO-005', 'Fotoleinwand auf Keilrahmen', 'stk', 'goods', [$CM(['20 × 30 cm', '30 × 40 cm', '40 × 60 cm', '60 × 90 cm'])]],
        ['Foto & Werbeartikel', 'Fotoprodukte', 'WF-FO-006', 'Fotokalender', 'stk', 'goods', [$O('Format', ['A4', 'A3', 'Tischkalender'])]],
        ['Foto & Werbeartikel', 'Werbeartikel', 'WF-WA-001', 'Mauspad', 'stk', 'goods', [$CM(['23 × 19 cm', '24 × 20 cm (rund Ø 20)'])]],
        ['Foto & Werbeartikel', 'Werbeartikel', 'WF-WA-002', 'Untersetzer Hartfaser (Sublimation)', 'stk', 'goods', [$O('Form/Größe', ['eckig 9,5 × 9,5 cm', 'rund Ø 9,5 cm'])]],
        ['Foto & Werbeartikel', 'Werbeartikel', 'WF-WA-003', 'Schlüsselanhänger Sublimation', 'stk', 'goods', [$O('Form', ['rund', 'eckig', 'Herz', 'Rechteck'])]],
        ['Foto & Werbeartikel', 'Werbeartikel', 'WF-WA-004', 'Kühlschrankmagnet', 'stk', 'goods', [$O('Form/Größe', ['5 × 5 cm', '7 × 5 cm', 'rund Ø 5,5 cm'])]],
        ['Foto & Werbeartikel', 'Werbeartikel', 'WF-WA-005', 'Button / Anstecker', 'stk', 'goods', [$O('Größe', ['Ø 25 mm', 'Ø 38 mm', 'Ø 56 mm'])]],
        ['Foto & Werbeartikel', 'Werbeartikel', 'WF-WA-006', 'Lanyard / Schlüsselband', 'stk', 'goods', [$O('Breite', ['15 mm', '20 mm']), $F($basic)]],
        ['Foto & Werbeartikel', 'Werbeartikel', 'WF-WA-007', 'Regenschirm', 'stk', 'goods', [$F(['Schwarz', 'Navy', 'Rot', 'Weiß'])]],
        ['Foto & Werbeartikel', 'Werbeartikel', 'WF-WA-008', 'Handyhülle (Sublimation)', 'stk', 'goods', [$O('Modell', ['nach Angabe'])]],
        ['Foto & Werbeartikel', 'Aufkleber & Folie', 'WF-AF-001', 'Aufkleber / Sticker (Konturschnitt)', 'stk', 'goods', [$O('Größe', ['5 × 5 cm', '7 × 7 cm', '10 × 10 cm', '15 × 15 cm']), $O('Folie', ['Glanz', 'Matt', 'Transparent', 'Outdoor'])]],
        ['Foto & Werbeartikel', 'Aufkleber & Folie', 'WF-AF-002', 'Folienbeschriftung (Plott)', 'm2', 'goods', [$F(['Weiß', 'Schwarz', 'Silber', 'Gold', 'Rot', 'Blau', 'Gelb', 'Grün'])]],
        ['Foto & Werbeartikel', 'Aufkleber & Folie', 'WF-AF-003', 'Fahrzeugbeschriftung', 'm2', 'goods', [$O('Folie', ['Standard (Plott)', 'Digitaldruck laminiert'])]],
        ['Foto & Werbeartikel', 'Aufkleber & Folie', 'WF-AF-004', 'Banner / Plane', 'm2', 'goods', [$O('Ausführung', ['mit Ösen', 'Hohlsaum', 'ohne'])]],

        // ---------- Aufnäher & Transfers ----------
        ['Aufnäher & Transfers', 'Aufnäher & Patches', 'WF-AN-001', 'Aufnäher gestickt', 'stk', 'goods', [$O('Größe', ['bis 5 cm', 'bis 8 cm', 'bis 10 cm', 'bis 12 cm']), $O('Rand', ['Merrow (umkettelt)', 'Laserschnitt']), $O('Rückseite', ['Aufbügeln', 'Klett', 'Aufnähen'])]],
        ['Aufnäher & Transfers', 'Aufnäher & Patches', 'WF-AN-002', 'Namensschild gestickt', 'stk', 'goods', [$CM(['10 × 2,5 cm', '12 × 4 cm']), $O('Rückseite', ['Aufbügeln', 'Klett', 'Aufnähen'])]],
        ['Aufnäher & Transfers', 'Aufnäher & Patches', 'WF-AN-003', 'Flex-/Flock-Patch', 'stk', 'goods', [$O('Größe', ['bis 5 cm', 'bis 8 cm', 'bis 10 cm'])]],
        ['Aufnäher & Transfers', 'Transfers', 'WF-TR-001', 'DTF-Transfer (zum Aufbügeln)', 'stk', 'goods', [$O('Größe', ['bis 10 × 10 cm', 'A6', 'A5', 'A4', 'A3'])]],
        ['Aufnäher & Transfers', 'Transfers', 'WF-TR-002', 'DTF-Meterware (Gangsheet)', 'm', 'goods', [$O('Breite', ['30 cm', '58 cm'])]],
        ['Aufnäher & Transfers', 'Transfers', 'WF-TR-003', 'Flexfolie-Transfer', 'stk', 'goods', [$O('Größe', ['bis 10 × 10 cm', 'A5', 'A4', 'A3']), $F(['Weiß', 'Schwarz', 'Rot', 'Gold', 'Silber', 'Neon', 'Glitzer', 'Reflex'])]],
        ['Aufnäher & Transfers', 'Transfers', 'WF-TR-004', 'Rückennummer / Name (Flex)', 'stk', 'goods', [$O('Höhe', ['Nummer 20 cm', 'Nummer 25 cm', 'Name 6 cm', 'Brustnummer 10 cm']), $F(['Weiß', 'Schwarz', 'Rot', 'Gold', 'Silber', 'Gelb'])]],

        // ---------- Leistungen ----------
        ['Leistungen', 'Vorbereitung', 'WF-LS-001', 'Logo digitalisieren (Stickprogramm)', 'stk', 'services', [$O('Umfang', ['bis 10.000 Stiche', 'bis 25.000 Stiche', 'über 25.000 Stiche'])]],
        ['Leistungen', 'Vorbereitung', 'WF-LS-002', 'Logo vektorisieren', 'stk', 'services', [$O('Umfang', ['einfach', 'mittel', 'aufwendig'])]],
        ['Leistungen', 'Vorbereitung', 'WF-LS-003', 'Grafik- / Designarbeit', 'timer', 'services', []],
        ['Leistungen', 'Vorbereitung', 'WF-LS-004', 'Siebdruck: Einrichtung je Farbe', 'stk', 'services', []],
        ['Leistungen', 'Vorbereitung', 'WF-LS-005', 'Muster / Probestück', 'stk', 'services', []],
        ['Leistungen', 'Veredelung', 'WF-LS-010', 'Stickerei je Position', 'stk', 'services', [$O('Position', ['Brust links', 'Brust rechts', 'Rücken', 'Ärmel', 'Nacken', 'Cap vorne', 'Cap Seite']), $O('Stiche', ['bis 5.000', 'bis 10.000', 'bis 15.000', 'bis 25.000'])]],
        ['Leistungen', 'Veredelung', 'WF-LS-011', 'Druck je Position (DTF/Flex/Flock)', 'stk', 'services', [$O('Position', ['Brust links', 'Brust rechts', 'Vorne groß', 'Rücken', 'Ärmel', 'Nacken']), $O('Größe', ['bis 10 × 10 cm', 'A5', 'A4', 'A3'])]],
        ['Leistungen', 'Veredelung', 'WF-LS-012', 'Siebdruck je Position', 'stk', 'services', [$O('Farben', ['1-farbig', '2-farbig', '3-farbig', '4-farbig']), $O('Position', ['Vorne', 'Rücken', 'Brust', 'Ärmel'])]],
        ['Leistungen', 'Veredelung', 'WF-LS-013', 'Lasergravur je Stück', 'stk', 'services', [$O('Fläche', ['bis 5 × 5 cm', 'bis 10 × 10 cm', 'bis 20 × 20 cm', 'größer'])]],
        ['Leistungen', 'Veredelung', 'WF-LS-014', 'Sublimation je Stück', 'stk', 'services', []],
        ['Leistungen', 'Veredelung', 'WF-LS-015', 'CNC-Fräsen (Maschinenzeit)', 'timer', 'services', []],
        ['Leistungen', 'Veredelung', 'WF-LS-016', 'Laserschnitt (Maschinenzeit)', 'timer', 'services', []],
        ['Leistungen', 'Veredelung', 'WF-LS-017', 'Mitgebrachte Textilien veredeln (Zuschlag)', 'stk', 'services', []],
        ['Leistungen', 'Zuschläge & Versand', 'WF-LS-020', 'Expresszuschlag', 'stk', 'services', [$O('Lieferzeit', ['48 Stunden', '24 Stunden'])]],
        ['Leistungen', 'Zuschläge & Versand', 'WF-LS-021', 'Kleinmengenzuschlag', 'stk', 'services', []],
        ['Leistungen', 'Zuschläge & Versand', 'WF-LS-022', 'Einzelverpackung / Geschenkverpackung', 'stk', 'services', []],
        ['Leistungen', 'Zuschläge & Versand', 'WF-LS-023', 'Versand Paket', 'stk', 'services', [$O('Ziel', ['Dänemark', 'Deutschland', 'EU'])]],
        ['Leistungen', 'Zuschläge & Versand', 'WF-LS-024', 'Montage / Folierung vor Ort', 'timer', 'services', []],
    ];
}

/** Lädt den Katalog: legt fehlende Kategorien an und Produkte, deren Artikelnummer es noch nicht gibt. */
function wf_catalog_import(PDO $db): array
{
    $cats = 0;
    $prods = 0;
    $skipped = 0;
    $db->beginTransaction();
    try {
        $catId = function (string $name, ?int $parent) use ($db, &$cats): int {
            $st = $db->prepare('SELECT id FROM product_categories WHERE name = ? COLLATE NOCASE AND ' . ($parent ? 'parent_id = ?' : 'parent_id IS NULL'));
            $st->execute($parent ? [$name, $parent] : [$name]);
            $id = (int)$st->fetchColumn();
            if ($id) {
                return $id;
            }
            $sort = (int)$db->query('SELECT COALESCE(MAX(sort),0)+1 FROM product_categories')->fetchColumn();
            $db->prepare('INSERT INTO product_categories (parent_id, name, sort) VALUES (?,?,?)')->execute([$parent, $name, $sort]);
            $cats++;
            return (int)$db->lastInsertId();
        };
        $has = $db->prepare("SELECT 1 FROM products WHERE sku = ? AND sku <> ''");
        $ins = $db->prepare("INSERT INTO products (name, unit, price, kind, active, processes, category_id, sku, options, sort) VALUES (?,?,0,?,1,'[]',?,?,?,?)");
        $sort = (int)$db->query('SELECT COALESCE(MAX(sort),0) FROM products')->fetchColumn();
        foreach (wf_catalog() as [$main, $sub, $sku, $name, $unit, $kind, $opts]) {
            $has->execute([$sku]);
            if ($has->fetchColumn()) {
                $skipped++;
                continue;
            }
            $cid = $catId($sub, $catId($main, null));
            $ins->execute([$name, in_array($unit, WF_UNITS, true) ? $unit : 'stk', $kind, $cid, $sku, json_encode($opts, JSON_UNESCAPED_UNICODE), ++$sort]);
            $prods++;
        }
        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        throw $e;
    }
    return ['categories' => $cats, 'products' => $prods, 'skipped' => $skipped];
}

/** Eigenschaften eines Produkts säubern: [{name, values[], split}] */
function wf_clean_options($raw): array
{
    $out = [];
    foreach (array_slice(is_array($raw) ? $raw : [], 0, 8) as $g) {
        if (!is_array($g)) {
            continue;
        }
        $name = mb_substr(trim((string)($g['name'] ?? '')), 0, 40);
        $vals = is_array($g['values'] ?? null) ? $g['values'] : preg_split('/\s*[,;\n]\s*/u', (string)($g['values'] ?? ''));
        $vals = array_values(array_unique(array_filter(array_map(fn($v) => mb_substr(trim((string)$v), 0, 60), array_slice($vals, 0, 60)), fn($v) => $v !== '')));
        if ($name === '' || !$vals) {
            continue;
        }
        $out[] = ['name' => $name, 'values' => $vals, 'split' => !empty($g['split'])];
    }
    return $out;
}

/** Text einer Auftragsposition für Angebot und Rechnung: Name, gewählte Eigenschaften, Größenverteilung, Artikelnummer. */
function wf_item_desc(array $it, string $lang): string
{
    $L = ['sizes' => ['de' => 'Größen', 'da' => 'Størrelser', 'en' => 'Sizes'], 'sku' => ['de' => 'Art.-Nr.', 'da' => 'Varenr.', 'en' => 'Item no.']];
    $l = in_array($lang, ['de', 'da', 'en'], true) ? $lang : 'da';
    $lines = [(string)$it['name']];
    $opts = array_values(array_filter(array_map('strval', (array)($it['opts'] ?? [])), fn($v) => $v !== ''));
    if ($opts) {
        $lines[0] .= ' · ' . implode(' · ', $opts);
    }
    $sz = array_filter((array)($it['sizes'] ?? []), fn($q) => (int)$q > 0);
    if ($sz) {
        $lines[] = $L['sizes'][$l] . ': ' . implode(', ', array_map(fn($k, $q) => $k . ' × ' . (int)$q, array_keys($sz), $sz));
    }
    if (!empty($it['sku'])) {
        $lines[] = $L['sku'][$l] . ' ' . $it['sku'];
    }
    return implode("\n", $lines);
}
