<?php
declare(strict_types=1);
/* Texte der Website bearbeiten. Vorgaben stehen in site/lang.php; hier gespeicherte Änderungen haben Vorrang. */
$groups = [
    'start'   => ['Startseite & Sortiment', ['hero.line', 'hero.open', 'range.eyebrow', 'range.title', 'range.lead', 'cat.kranse.t', 'cat.kranse.d', 'cat.pynt.t', 'cat.pynt.d',
                  'cat.traeer.t', 'cat.traeer.d', 'cat.braet.t', 'cat.braet.d', 'cat.mere.t', 'cat.mere.d']],
    'craft'   => ['Handgemacht', ['craft.eyebrow', 'craft.title', 'craft.lead', 'craft.p1t', 'craft.p1d', 'craft.p2t', 'craft.p2d', 'craft.p3t', 'craft.p3d']],
    'soon'    => ['Countdown-Seite', ['soon.title', 'soon.text']],
    'about'   => ['Über uns', ['about.eyebrow', 'about.title', 'about.body']],
    'shop'    => ['Shop & Bestellung', ['shop.eyebrow', 'shop.title', 'shop.lead', 'shop.empty', 'order.title', 'order.pay.pickup', 'order.pay.mobilepay', 'order.pay.bank', 'mail.thanks', 'mail.bye']],
    'visit'   => ['Kontakt & Besuch', ['visit.eyebrow', 'visit.title', 'visit.lead', 'form.title', 'form.lead', 'form.privacy']],
    'legal'   => ['Rechtstexte', ['legal.imprint.body', 'legal.terms.body', 'legal.withdrawal.body', 'legal.privacy.body']],
];
$g = (string)($_GET['g'] ?? 'start');
if (!isset($groups[$g])) $g = 'start';
$def = web_lang_defaults();
$db = db();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    foreach ($groups[$g][1] as $key) {
        $f = 't_' . str_replace('.', '_', $key);
        $v = [];
        foreach (WEB_LANGS as $l => $_) {
            $x = trim(str_replace("\r", '', (string)($_POST[$f . '_' . $l] ?? '')));
            $v[$l] = ($x === trim((string)($def[$l][$key] ?? ''))) ? '' : mb_substr($x, 0, 12000);
        }
        if (implode('', $v) === '') $db->prepare('DELETE FROM web_texts WHERE key = ?')->execute([$key]);
        else $db->prepare('INSERT INTO web_texts (key, da, de, en) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET da = excluded.da, de = excluded.de, en = excluded.en')
                ->execute([$key, $v['da'], $v['de'], $v['en']]);
    }
    flash('Texte gespeichert.');
    redirect('texte&g=' . $g);
}

$ov = web_text_overrides();
page_start('texte', 'Texte & Seiten');
?>
<p class="muted">Hier änderst du die Texte der Website in allen drei Sprachen. Ein leeres Feld setzt den ursprünglichen Text wieder ein.</p>
<p class="actions" style="margin-bottom:16px">
  <?php foreach ($groups as $k => $gr): ?><a class="btn small <?= $k === $g ? '' : 'ghost' ?>" href="./?p=texte&g=<?= h($k) ?>"><?= h($gr[0]) ?></a><?php endforeach; ?>
</p>
<?php if ($g === 'legal'): ?>
<div class="flash" style="background:var(--paper)">Reihenfolge: Impressum, AGB, Widerrufsrecht, Datenschutz. Die Platzhalter <code>{shop} {owner} {street} {city} {cvr} {email} {phone}</code> werden automatisch mit den Angaben aus <a href="./?p=kontakt">Kontakt &amp; Adresse</a> gefüllt. Eine Zeile, die mit <code>## </code> beginnt, wird eine Überschrift.<br>
Die Texte sind nach dänischem Verbraucherrecht für einen Shop mit Versand nach Dänemark und Deutschland geschrieben. Eine Rechtsberatung ersetzen sie nicht – bitte einmal vom Revisor oder Anwalt gegenlesen lassen.</div>
<?php endif; ?>
<form method="post" class="card form">
  <?= csrf_field() ?>
  <fieldset>
    <legend><?= h($groups[$g][0]) ?></legend>
    <?php foreach ($groups[$g][1] as $key):
        $vals = []; $long = false;
        foreach (WEB_LANGS as $l => $_) { $vals[$l] = ($ov[$key][$l] ?? '') !== '' ? $ov[$key][$l] : (string)($def[$l][$key] ?? ''); $long = $long || mb_strlen($vals[$l]) > 70; }
        $big = str_ends_with($key, '.body'); ?>
      <div class="langs">
        <div class="langs-row"<?= $big ? ' style="grid-template-columns:1fr"' : '' ?>>
        <?php foreach (WEB_LANGS as $l => $ln): $n = 't_' . str_replace('.', '_', $key) . '_' . $l; ?>
          <label><span class="lang-tag"><?= h($ln) ?></span>
          <?php if ($long): ?><textarea name="<?= h($n) ?>" rows="<?= $big ? 14 : 3 ?>"><?= h($vals[$l]) ?></textarea>
          <?php else: ?><input name="<?= h($n) ?>" value="<?= h($vals[$l]) ?>"><?php endif; ?></label>
        <?php endforeach; ?>
        </div>
      </div>
    <?php endforeach; ?>
  </fieldset>
  <div class="actions"><button class="btn" type="submit">Speichern</button></div>
</form>
<?php page_end();
