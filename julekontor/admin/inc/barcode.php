<?php
/* Strichcodes als SVG für Etiketten: EAN-13 (Handel) und Code 128 (alles andere). */
declare(strict_types=1);

function barcode_svg(string $code, float $height = 40, bool $text = true): string {
    if (preg_match('/^\d{13}$/', $code) && ean_valid($code)) return ean13_svg($code, $height, $text);
    if (preg_match('/^\d{12}$/', $code)) return ean13_svg($code . ean_check($code), $height, $text);
    return code128_svg($code, $height, $text);
}

function ean13_svg(string $code, float $h, bool $text): string {
    static $L = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
    static $G = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
    static $R = ['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100'];
    static $P = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];
    $first = (int)$code[0];
    $bits = '101';
    for ($i = 1; $i <= 6; $i++) $bits .= $P[$first][$i - 1] === 'L' ? $L[(int)$code[$i]] : $G[(int)$code[$i]];
    $bits .= '01010';
    for ($i = 7; $i <= 12; $i++) $bits .= $R[(int)$code[$i]];
    $bits .= '101';
    // Randzeichen (Start, Mitte, Ende) sind länger
    $guard = array_merge(range(0, 2), range(45, 49), range(92, 94));
    $quiet = 9; $w = $quiet + 95 + 7; $th = $text ? 9 : 0;
    $bars = '';
    for ($i = 0; $i < 95; $i++) {
        if ($bits[$i] !== '1') continue;
        $len = in_array($i, $guard, true) ? $h + $th * 0.55 : $h;
        $bars .= sprintf('<rect x="%d" y="0" width="1" height="%.1f"/>', $quiet + $i, $len);
    }
    $t = '';
    if ($text) {
        $y = $h + $th - 1;
        $t = sprintf('<text x="%d" y="%.1f" text-anchor="end">%s</text>', $quiet - 1, $y, $code[0])
           . sprintf('<text x="%d" y="%.1f" text-anchor="middle" textLength="40">%s</text>', $quiet + 24, $y, substr($code, 1, 6))
           . sprintf('<text x="%d" y="%.1f" text-anchor="middle" textLength="40">%s</text>', $quiet + 70, $y, substr($code, 7, 6));
    }
    return sprintf('<svg xmlns="http://www.w3.org/2000/svg" class="barcode" viewBox="0 0 %d %.1f" preserveAspectRatio="none"><g fill="#000" font-family="Arial,Helvetica,sans-serif" font-size="9">%s%s</g></svg>',
        $w, $h + $th, $bars, $t);
}

function code128_svg(string $code, float $h, bool $text): string {
    static $P = ['212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212','112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131','311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321','112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121','313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111','314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114','122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212','124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113','114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112'];
    $code = preg_replace('/[^\x20-\x7e]/', '', $code);
    $vals = [104];                                         // Start B
    foreach (str_split($code) as $ch) $vals[] = ord($ch) - 32;
    $sum = 104;
    foreach (array_slice($vals, 1) as $i => $v) $sum += $v * ($i + 1);
    $vals[] = $sum % 103;
    $vals[] = 106;                                         // Stopp
    $x = 10; $bars = '';
    foreach ($vals as $v) {
        $pat = $P[$v];
        for ($i = 0; $i < strlen($pat); $i++) {
            $wd = (int)$pat[$i];
            if ($i % 2 === 0) $bars .= sprintf('<rect x="%d" y="0" width="%d" height="%.1f"/>', $x, $wd, $h);
            $x += $wd;
        }
    }
    $w = $x + 10; $th = $text ? 10 : 0;
    $t = $text ? sprintf('<text x="%.1f" y="%.1f" text-anchor="middle">%s</text>', $w / 2, $h + $th - 1, htmlspecialchars($code, ENT_XML1)) : '';
    return sprintf('<svg xmlns="http://www.w3.org/2000/svg" class="barcode" viewBox="0 0 %d %.1f" preserveAspectRatio="none"><g fill="#000" font-family="Arial,Helvetica,sans-serif" font-size="9">%s%s</g></svg>',
        $w, $h + $th, $bars, $t);
}
