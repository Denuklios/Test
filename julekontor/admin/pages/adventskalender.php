<?php
declare(strict_types=1);
$site = web_site();
$db = db();
$doors = advent_doors();
$day = (int)($_GET['tag'] ?? 0);
if ($day < 1 || $day > 24) $day = 0;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    if (isset($_POST['settings'])) {
        $y = (int)($_POST['year'] ?? 0);
        if ($y < 2024 || $y > 2100) { flash('Bitte ein gültiges Jahr eintragen.', 'err'); redirect('adventskalender'); }
        $site['calendar']['enabled'] = !empty($_POST['enabled']);
        $site['calendar']['year'] = $y;
        if (!empty($_POST['new_preview'])) $site['calendar']['preview'] = '';
        web_save($site);
        flash('Gespeichert.');
        redirect('adventskalender');
    }
    if ($day) {
        $old = (string)($doors[$day]['image'] ?? '');
        if (!empty($_POST['clear'])) {
            $db->prepare('DELETE FROM advent_doors WHERE day = ?')->execute([$day]);
            web_delete_image($old);
            flash('Türchen ' . $day . ' ist wieder leer.');
            redirect('adventskalender');
        }
        $t = web_post_langs('title', 80); $x = web_post_langs('text', 600);
        $img = $old;
        if ($tmp = web_upload('image')) $img = web_save_image('tuer' . $day, $tmp, 1000);
        elseif (!empty($_POST['remove_image'])) $img = '';
        $db->prepare('INSERT INTO advent_doors (day, title_da, title_de, title_en, text_da, text_de, text_en, image, link, code, updated) VALUES (?,?,?,?,?,?,?,?,?,?,?)
                      ON CONFLICT(day) DO UPDATE SET title_da=excluded.title_da, title_de=excluded.title_de, title_en=excluded.title_en,
                      text_da=excluded.text_da, text_de=excluded.text_de, text_en=excluded.text_en, image=excluded.image, link=excluded.link, code=excluded.code, updated=excluded.updated')
           ->execute([$day, $t['da'], $t['de'], $t['en'], $x['da'], $x['de'], $x['en'], $img,
                      web_url((string)($_POST['link'] ?? '')), mb_substr(trim((string)($_POST['code'] ?? '')), 0, 40), now()]);
        if ($img !== $old) web_delete_image($old);
        flash('Türchen ' . $day . ' gespeichert.');
        redirect('adventskalender' . (!empty($_POST['next']) && $day < 24 ? '&tag=' . ($day + 1) : ''));
    }
}

$year = (int)$site['calendar']['year'];

/* ---------- Ein Türchen bearbeiten ---------- */
if ($day) {
    $r = $doors[$day] ?? [];
    $val = fn(string $k) => ['da' => $r[$k . '_da'] ?? '', 'de' => $r[$k . '_de'] ?? '', 'en' => $r[$k . '_en'] ?? ''];
    page_start('adventskalender', 'Türchen ' . $day);
    ?>
    <p><a href="./?p=adventskalender">← Alle Türchen</a> <span class="muted">· öffnet sich am <?= $day ?>. Dezember <?= $year ?></span></p>
    <form method="post" enctype="multipart/form-data" class="card form">
      <?= csrf_field() ?>
      <fieldset>
        <legend>Was steckt dahinter?</legend>
        <?php web_lang_fields('title', 'Überschrift', $val('title'), false, 80); ?>
        <?php web_lang_fields('text', 'Text', $val('text'), true, 600, 'Ist eine Sprache leer, zeigt die Website den dänischen Text (oder den ersten, der ausgefüllt ist).'); ?>
      </fieldset>
      <fieldset>
        <legend>Bild</legend>
        <?php if (!empty($r['image'])): ?>
        <img src="../data/bilder/<?= h(rawurlencode($r['image'])) ?>" alt="" style="max-width:260px;border-radius:10px;border:1px solid var(--line)">
        <label class="check"><input type="checkbox" name="remove_image" value="1"> Bild entfernen</label>
        <?php endif; ?>
        <input type="file" name="image" accept="image/jpeg,image/png,image/webp">
      </fieldset>
      <fieldset>
        <legend>Extras (optional)</legend>
        <label>Gutschein- oder Aktionscode<input name="code" maxlength="40" value="<?= h($r['code'] ?? '') ?>"></label>
        <p class="hint">Wird groß im Türchen gezeigt, z. B. „NISSE10“ – zum Vorzeigen im Laden.</p>
        <label>Link (z. B. zu einem Rezept oder Video)<input name="link" maxlength="300" inputmode="url" value="<?= h($r['link'] ?? '') ?>"></label>
      </fieldset>
      <div class="actions">
        <button class="btn" type="submit">Speichern</button>
        <?php if ($day < 24): ?><button class="btn ghost" type="submit" name="next" value="1">Speichern &amp; weiter zu <?= $day + 1 ?></button><?php endif; ?>
        <?php if ($r): ?><button class="btn ghost" type="submit" name="clear" value="1" formnovalidate onclick="return confirm('Türchen <?= $day ?> wirklich leeren?')">Türchen leeren</button><?php endif; ?>
      </div>
    </form>
    <?php
    page_end();
    return;
}

/* ---------- Übersicht ---------- */
$token = advent_preview_token($site);
$filled = count(array_filter($doors, 'advent_door_filled'));
$scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$base = $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost') . rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'], 2)), '/') . '/';
$previewUrl = $base . '?vorschau=' . $token . '#kalender';
page_start('adventskalender', 'Adventskalender');
?>
<p class="muted"><?= $filled ?> von 24 Türchen sind gefüllt. Jedes Türchen öffnet sich an seinem Tag um 0 Uhr und bleibt bis zum 6. Januar offen. Vorher kann niemand hineinschauen – auch nicht über Umwege.</p>
<div class="doors" style="margin-bottom:20px">
<?php for ($d = 1; $d <= 24; $d++): $r = $doors[$d] ?? null; $f = advent_door_filled($r);
  $label = $f ? (trim((string)($r['title_da'] ?: $r['title_de'] ?: $r['title_en'])) ?: ($r['code'] !== '' ? 'Code: ' . $r['code'] : 'Bild/Text')) : 'noch leer'; ?>
  <a class="door-tile <?= $f ? '' : 'empty-door' ?>" href="./?p=adventskalender&tag=<?= $d ?>"><b><?= $d ?></b><span><?= h($label) ?></span></a>
<?php endfor; ?>
</div>

<form method="post" class="card form">
  <?= csrf_field() ?>
  <input type="hidden" name="settings" value="1">
  <fieldset>
    <legend>Einstellungen</legend>
    <label class="check"><input type="checkbox" name="enabled" value="1" <?= $site['calendar']['enabled'] ? 'checked' : '' ?>> Adventskalender auf der Website zeigen</label>
    <label>Jahr<input type="number" name="year" min="2024" max="2100" required value="<?= $year ?>" style="max-width:140px"></label>
    <p class="hint">Der Kalender läuft vom 1. bis 24. Dezember dieses Jahres. Leere Türchen zeigen einen kleinen Weihnachtsgruß.</p>
  </fieldset>
  <fieldset>
    <legend>Vorschau</legend>
    <p class="hint">Mit diesem geheimen Link sind schon jetzt alle Türchen offen – zum Ausprobieren. Nicht weitergeben.</p>
    <div class="copy-row">
      <input readonly value="<?= h($previewUrl) ?>" onclick="this.select()">
      <a class="btn small" href="<?= h($previewUrl) ?>" target="_blank" rel="noopener">Vorschau öffnen ↗</a>
    </div>
    <label class="check"><input type="checkbox" name="new_preview" value="1"> Neuen Vorschau-Link erzeugen (der alte gilt dann nicht mehr)</label>
  </fieldset>
  <div class="actions"><button class="btn" type="submit">Speichern</button></div>
</form>
<?php page_end();
