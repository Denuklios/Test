<?php
declare(strict_types=1);
require_once __DIR__ . '/../inc/barcode.php';
$db = db();
$who = user_name();
$cats = $db->query('SELECT * FROM categories ORDER BY sort, name COLLATE NOCASE')->fetchAll();

/* ---------- Aktionen ---------- */
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    csrf_check();
    $do = (string)($_POST['do'] ?? '');

    if ($do === 'save') {
        $id = (int)($_POST['id'] ?? 0);
        $name = mb_substr(trim((string)$_POST['name']), 0, 120);
        $barcode = preg_replace('/\s+/', '', (string)($_POST['barcode'] ?? ''));
        if (!empty($_POST['gen_barcode']) || ($barcode === '' && !empty($_POST['auto_barcode']))) $barcode = next_internal_ean();
        $price = parse_money((string)$_POST['price']);
        $cost = parse_money((string)($_POST['cost'] ?? '')) ?? 0;
        $vat = (int)($_POST['vat'] ?? 2500);
        $catId = (int)($_POST['category_id'] ?? 0) ?: null;
        if (trim((string)($_POST['new_category'] ?? '')) !== '') {
            $db->prepare('INSERT INTO categories (name, sort) VALUES (?, (SELECT COALESCE(MAX(sort),0)+1 FROM categories))')
               ->execute([mb_substr(trim((string)$_POST['new_category']), 0, 40)]);
            $catId = (int)$db->lastInsertId();
        }
        $err = [];
        if ($name === '') $err[] = 'Bitte einen Namen eingeben.';
        if ($price === null || $price < 0) $err[] = 'Bitte einen gültigen Verkaufspreis eingeben (z. B. 49,95).';
        if (!in_array($vat, vat_rates(), true)) $vat = vat_rates()[0];
        if ($barcode !== '') {
            $st = $db->prepare('SELECT id, name FROM products WHERE barcode = ? AND id != ?');
            $st->execute([$barcode, $id]);
            if ($dup = $st->fetch()) $err[] = 'Der Strichcode gehört schon zu „' . $dup['name'] . '“.';
        }
        if ($err) { flash(implode(' ', $err), 'err'); $_SESSION['form'] = $_POST; redirect('artikel&' . ($id ? 'id=' . $id : 'new=1')); }
        $vals = [$name, mb_substr(trim((string)($_POST['sku'] ?? '')), 0, 40), $barcode ?: null, $catId, $price, $cost, $vat,
                 parse_qty((string)($_POST['min_stock'] ?? '0')) ?? 0, mb_substr(trim((string)($_POST['unit'] ?? '')) ?: 'Stk.', 0, 10),
                 !empty($_POST['track_stock']) ? 1 : 0, !empty($_POST['open_price']) ? 1 : 0, !empty($_POST['favorite']) ? 1 : 0,
                 !empty($_POST['active']) ? 1 : 0, mb_substr(trim((string)($_POST['note'] ?? '')), 0, 500), now()];
        if ($id) {
            $db->prepare('UPDATE products SET name=?, sku=?, barcode=?, category_id=?, price=?, cost=?, vat=?, min_stock=?, unit=?, track_stock=?, open_price=?, favorite=?, active=?, note=?, updated=? WHERE id=?')
               ->execute([...$vals, $id]);
            flash('Artikel gespeichert.');
        } else {
            $db->prepare('INSERT INTO products (name, sku, barcode, category_id, price, cost, vat, min_stock, unit, track_stock, open_price, favorite, active, note, updated, created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
               ->execute([...$vals, now()]);
            $id = (int)$db->lastInsertId();
            $start = parse_qty((string)($_POST['stock'] ?? '0')) ?? 0;
            if ($start != 0) stock_move($id, $start, 'receipt', $who, '', 'Anfangsbestand');
            flash('Artikel angelegt.');
        }
        // Foto: neu hochgeladen oder entfernen
        $st = $db->prepare('SELECT image FROM products WHERE id = ?');
        $st->execute([$id]);
        $oldImg = (string)$st->fetchColumn();
        if (!empty($_FILES['image']['tmp_name']) && is_uploaded_file($_FILES['image']['tmp_name'])) {
            try {
                $img = save_product_image($id, $_FILES['image']['tmp_name']);
                $db->prepare('UPDATE products SET image = ? WHERE id = ?')->execute([$img, $id]);
                delete_product_image($oldImg);
            } catch (ShopError $e) { flash('Gespeichert, aber: ' . $e->getMessage(), 'err'); }
        } elseif (!empty($_POST['remove_image']) && $oldImg !== '') {
            $db->prepare("UPDATE products SET image = '' WHERE id = ?")->execute([$id]);
            delete_product_image($oldImg);
        } elseif (!empty($_FILES['image']['name']) && ($_FILES['image']['error'] ?? 0) !== UPLOAD_ERR_OK) {
            flash('Gespeichert, aber das Foto kam nicht an (zu groß? max. ' . ini_get('upload_max_filesize') . ').', 'err');
        }
        redirect(!empty($_POST['and_new']) ? 'artikel&new=1' : 'artikel&id=' . $id);
    }

    if ($do === 'gen_all') {
        $ids = $db->query("SELECT id FROM products WHERE barcode IS NULL OR barcode = ''")->fetchAll(PDO::FETCH_COLUMN);
        $up = $db->prepare('UPDATE products SET barcode = ?, updated = ? WHERE id = ?');
        foreach ($ids as $pid) $up->execute([next_internal_ean(), now(), $pid]);
        flash(count($ids) ? count($ids) . ' Artikel haben jetzt einen eigenen Strichcode. Etiketten druckst du unter „Etiketten“.' : 'Alle Artikel haben schon einen Strichcode.');
        redirect('artikel');
    }

    if ($do === 'delete') {
        $id = (int)$_POST['id'];
        $st = $db->prepare('SELECT image FROM products WHERE id = ?'); $st->execute([$id]); $delImg = (string)$st->fetchColumn();
        $st = $db->prepare('SELECT COUNT(*) FROM sale_items WHERE product_id = ?');
        $st->execute([$id]);
        if ($st->fetchColumn()) {
            $db->prepare('UPDATE products SET active = 0, updated = ? WHERE id = ?')->execute([now(), $id]);
            flash('Der Artikel wurde schon verkauft und bleibt für die Belege erhalten. Er ist jetzt ausgeblendet (inaktiv).');
        } else {
            $db->prepare('DELETE FROM products WHERE id = ?')->execute([$id]);
            delete_product_image($delImg);
            flash('Artikel gelöscht.');
        }
        redirect('artikel');
    }

    if ($do === 'cat_save') {
        foreach ((array)($_POST['cat'] ?? []) as $cid => $c) {
            $db->prepare('UPDATE categories SET name = ?, color = ?, sort = ? WHERE id = ?')
               ->execute([mb_substr(trim((string)$c['name']), 0, 40) ?: 'Ohne Namen', preg_match('/^#[0-9a-f]{6}$/i', (string)$c['color']) ? $c['color'] : '#a3201d', (int)$c['sort'], (int)$cid]);
        }
        if (trim((string)($_POST['cat_new'] ?? '')) !== '') {
            $db->prepare('INSERT INTO categories (name, color, sort) VALUES (?, ?, (SELECT COALESCE(MAX(sort),0)+1 FROM categories))')
               ->execute([mb_substr(trim((string)$_POST['cat_new']), 0, 40), preg_match('/^#[0-9a-f]{6}$/i', (string)($_POST['cat_new_color'] ?? '')) ? $_POST['cat_new_color'] : '#2e5a3c']);
        }
        flash('Kategorien gespeichert.');
        redirect('artikel&cats=1');
    }
    if ($do === 'cat_delete') {
        $db->prepare('DELETE FROM categories WHERE id = ?')->execute([(int)$_POST['cid']]);
        flash('Kategorie gelöscht. Ihre Artikel sind jetzt ohne Kategorie.');
        redirect('artikel&cats=1');
    }

    if ($do === 'import' && !empty($_FILES['csv']['tmp_name'])) {
        $rows = array_map(fn($l) => str_getcsv($l, ';'), file($_FILES['csv']['tmp_name'], FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES));
        $head = array_map(fn($h) => mb_strtolower(trim(preg_replace('/^\xEF\xBB\xBF/', '', $h))), array_shift($rows) ?? []);
        $col = fn(array $r, string ...$names) => (function () use ($r, $head, $names) {
            foreach ($names as $n) { $i = array_search($n, $head, true); if ($i !== false) return trim((string)($r[$i] ?? '')); }
            return '';
        })();
        $catIds = array_column($cats, 'id', 'name');
        $new = 0; $upd = 0; $skip = 0;
        $db->beginTransaction();
        foreach ($rows as $r) {
            $name = $col($r, 'name', 'artikel', 'bezeichnung', 'navn');
            $price = parse_money($col($r, 'preis', 'verkaufspreis', 'price', 'pris'));
            if ($name === '' || $price === null) { $skip++; continue; }
            $bc = preg_replace('/\s+/', '', $col($r, 'strichcode', 'barcode', 'ean', 'stregkode')) ?: null;
            $catName = $col($r, 'kategorie', 'category', 'kategori');
            $cid = null;
            if ($catName !== '') {
                if (!isset($catIds[$catName])) { $db->prepare('INSERT INTO categories (name) VALUES (?)')->execute([$catName]); $catIds[$catName] = (int)$db->lastInsertId(); }
                $cid = $catIds[$catName];
            }
            $vatIn = $col($r, 'moms', 'mwst', 'vat');
            $vat = $vatIn !== '' ? (int)round((float)str_replace(',', '.', $vatIn) * 100) : vat_rates()[0];
            if (!in_array($vat, vat_rates(), true)) $vat = vat_rates()[0];
            $cost = parse_money($col($r, 'einkaufspreis', 'ek', 'cost', 'indkøbspris')) ?? 0;
            $stock = parse_qty($col($r, 'bestand', 'lager', 'stock', 'antal'));
            $exist = null;
            if ($bc) { $st = $db->prepare('SELECT id FROM products WHERE barcode = ?'); $st->execute([$bc]); $exist = $st->fetchColumn(); }
            if ($exist) {
                $db->prepare('UPDATE products SET name=?, price=?, cost=?, vat=?, category_id=COALESCE(?, category_id), updated=? WHERE id=?')
                   ->execute([$name, $price, $cost, $vat, $cid, now(), $exist]);
                if ($stock !== null) stock_set((int)$exist, $stock, $who, 'CSV-Import');
                $upd++;
            } else {
                $db->prepare('INSERT INTO products (name, sku, barcode, category_id, price, cost, vat, created, updated) VALUES (?,?,?,?,?,?,?,?,?)')
                   ->execute([$name, $col($r, 'artikelnummer', 'sku', 'varenummer'), $bc, $cid, $price, $cost, $vat, now(), now()]);
                if ($stock) stock_move((int)$db->lastInsertId(), $stock, 'receipt', $who, '', 'CSV-Import');
                $new++;
            }
        }
        $db->commit();
        flash("Import fertig: $new neu, $upd aktualisiert" . ($skip ? ", $skip Zeilen übersprungen (Name oder Preis fehlte)" : '') . '.');
        redirect('artikel');
    }
}

/* CSV-Export */
if (isset($_GET['export'])) {
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="artikel-' . date('Y-m-d') . '.csv"');
    $o = fopen('php://output', 'w');
    fwrite($o, "\xEF\xBB\xBF");
    fputcsv($o, ['Name', 'Strichcode', 'Artikelnummer', 'Kategorie', 'Preis', 'Einkaufspreis', 'Moms', 'Bestand', 'Mindestbestand', 'Einheit', 'Aktiv'], ';');
    foreach ($db->query('SELECT p.*, c.name cat FROM products p LEFT JOIN categories c ON c.id = p.category_id ORDER BY p.name') as $p)
        fputcsv($o, [$p['name'], $p['barcode'], $p['sku'], $p['cat'], money((int)$p['price'], false), money((int)$p['cost'], false),
                     str_replace('.', ',', (string)($p['vat'] / 100)), fmt_qty((float)$p['stock']), fmt_qty((float)$p['min_stock']), $p['unit'], $p['active'] ? 'ja' : 'nein'], ';');
    exit;
}

/* Scan in der Liste: vorhandenen Artikel öffnen, sonst neuen mit diesem Code anlegen */
if (isset($_GET['code']) && trim((string)$_GET['code']) !== '') {
    $code = trim((string)$_GET['code']);
    $st = $db->prepare('SELECT id FROM products WHERE barcode = ? OR sku = ? LIMIT 1');
    $st->execute([$code, $code]);
    if ($id = $st->fetchColumn()) redirect('artikel&id=' . $id);
    if (preg_match('/^[0-9A-Za-z-]{4,40}$/', $code)) { flash('Neuer Strichcode – lege den Artikel jetzt an.'); redirect('artikel&new=1&barcode=' . rawurlencode($code)); }
}

/* ---------- Bearbeiten ---------- */
$id = (int)($_GET['id'] ?? 0);
if ($id || isset($_GET['new'])) {
    $p = ['id' => 0, 'name' => '', 'sku' => '', 'barcode' => (string)($_GET['barcode'] ?? ''), 'category_id' => null, 'price' => 0, 'cost' => 0,
          'vat' => vat_rates()[0], 'stock' => 0, 'min_stock' => 0, 'unit' => 'Stk.', 'track_stock' => 1, 'open_price' => 0, 'favorite' => 1, 'active' => 1, 'note' => ''];
    if ($id) {
        $st = $db->prepare('SELECT * FROM products WHERE id = ?');
        $st->execute([$id]);
        $p = $st->fetch() ?: redirect('artikel');
    }
    $f = $_SESSION['form'] ?? null; unset($_SESSION['form']);
    $v = fn(string $k, $def) => $f !== null ? ($f[$k] ?? '') : $def;
    $chk = fn(string $k) => $f !== null ? !empty($f[$k]) : (bool)$p[$k];
    page_start('artikel', $id ? 'Artikel bearbeiten' : 'Neuer Artikel');
    ?>
    <p class="no-print"><a href="./?p=artikel">← Alle Artikel</a></p>
    <div class="two-col">
    <form method="post" class="card form" id="pform" enctype="multipart/form-data">
      <?= csrf_field() ?><input type="hidden" name="do" value="save"><input type="hidden" name="id" value="<?= (int)$p['id'] ?>">
      <fieldset>
        <legend>Artikel</legend>
        <label>Name<input name="name" required maxlength="120" value="<?= h($v('name', $p['name'])) ?>" <?= $id ? '' : 'autofocus' ?>></label>
        <label>Strichcode (EAN)
          <input name="barcode" data-scan inputmode="numeric" maxlength="40" value="<?= h($v('barcode', (string)$p['barcode'])) ?>" placeholder="scannen oder eintippen">
          <span class="hint">Kein Code auf der Ware? Haken setzen, dann vergibt das System einen eigenen und du druckst ihn unter „Etiketten“.</span>
        </label>
        <label class="check"><input type="checkbox" name="<?= $p['barcode'] ? 'gen_barcode' : 'auto_barcode' ?>" value="1"> <?= $p['barcode'] ? 'Neuen eigenen Strichcode vergeben' : 'Eigenen Strichcode vergeben, falls leer' ?></label>
        <div class="row2">
          <label>Kategorie
            <select name="category_id"><option value="">– ohne –</option>
              <?php foreach ($cats as $c): ?><option value="<?= (int)$c['id'] ?>" <?= (int)$v('category_id', $p['category_id']) === (int)$c['id'] ? 'selected' : '' ?>><?= h($c['name']) ?></option><?php endforeach; ?>
            </select></label>
          <label>… oder neue Kategorie<input name="new_category" maxlength="40" placeholder="z. B. Weihnachtsbaumschmuck"></label>
        </div>
        <label>Artikelnummer (optional)<input name="sku" maxlength="40" value="<?= h($v('sku', (string)$p['sku'])) ?>"></label>
      </fieldset>
      <fieldset>
        <legend>Foto (für die Kachel in der Kasse)</legend>
        <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
          <img id="img-prev" src="<?= h(product_image_url((string)($p['image'] ?? ''), '')) ?>" alt="" style="width:96px;height:96px;object-fit:cover;border-radius:12px;border:1px solid var(--line);background:var(--paper)<?= empty($p['image']) ? ';display:none' : '' ?>">
          <div style="display:grid;gap:8px">
            <label class="btn ghost small" style="display:inline-flex;cursor:pointer">📷 Foto aufnehmen / wählen
              <input type="file" name="image" accept="image/*" capture="environment" style="display:none" onchange="if(this.files[0]){const i=document.getElementById('img-prev');i.src=window.URL.createObjectURL(this.files[0]);i.style.display='';}"></label>
            <?php if (!empty($p['image'])): ?><label class="check"><input type="checkbox" name="remove_image" value="1"> Foto entfernen</label><?php endif; ?>
          </div>
        </div>
        <span class="hint">Am Tablet öffnet sich direkt die Kamera. Das Bild wird quadratisch zugeschnitten und verkleinert.</span>
      </fieldset>
      <fieldset>
        <legend>Preis</legend>
        <div class="row3">
          <label>Verkaufspreis (inkl. Moms)<input name="price" inputmode="decimal" required value="<?= h($v('price', money((int)$p['price'], false))) ?>"></label>
          <label>Einkaufspreis (netto)<input name="cost" inputmode="decimal" value="<?= h($v('cost', money((int)$p['cost'], false))) ?>"></label>
          <label>Moms / MwSt.
            <select name="vat"><?php foreach (vat_rates() as $r): ?><option value="<?= $r ?>" <?= (int)$v('vat', $p['vat']) === $r ? 'selected' : '' ?>><?= vat_label($r) ?></option><?php endforeach; ?></select></label>
        </div>
        <p class="hint" id="margin"></p>
        <label class="check"><input type="checkbox" name="open_price" value="1" <?= $chk('open_price') ? 'checked' : '' ?>> Preis an der Kasse eingeben (z. B. Bastelware, Gutscheine)</label>
      </fieldset>
      <fieldset>
        <legend>Lager</legend>
        <label class="check"><input type="checkbox" name="track_stock" value="1" <?= $chk('track_stock') ? 'checked' : '' ?>> Bestand führen</label>
        <div class="row3">
          <?php if (!$id): ?><label>Anfangsbestand<input name="stock" inputmode="decimal" value="<?= h($v('stock', '0')) ?>"></label>
          <?php else: ?><label>Aktueller Bestand<input value="<?= h(fmt_qty((float)$p['stock'])) ?>" disabled></label><?php endif; ?>
          <label>Mindestbestand<input name="min_stock" inputmode="decimal" value="<?= h($v('min_stock', fmt_qty((float)$p['min_stock']))) ?>"></label>
          <label>Einheit<input name="unit" maxlength="10" value="<?= h($v('unit', $p['unit'])) ?>"></label>
        </div>
        <?php if ($id): ?><p class="hint">Bestand ändern: unter <a href="./?p=lager&id=<?= $id ?>">Lager</a> (Wareneingang, Inventur).</p><?php endif; ?>
      </fieldset>
      <fieldset>
        <legend>Kasse</legend>
        <label class="check"><input type="checkbox" name="favorite" value="1" <?= $chk('favorite') ? 'checked' : '' ?>> Als Kachel in der Kasse zeigen</label>
        <label class="check"><input type="checkbox" name="active" value="1" <?= $chk('active') ? 'checked' : '' ?>> Aktiv (verkaufbar)</label>
        <label>Notiz (intern)<textarea name="note" maxlength="500"><?= h($v('note', $p['note'])) ?></textarea></label>
      </fieldset>
      <div class="actions">
        <button class="btn" type="submit">Speichern</button>
        <button class="btn ghost" type="submit" name="and_new" value="1">Speichern &amp; nächsten anlegen</button>
      </div>
    </form>
    <?php if ($id): ?>
    <div>
      <div class="card">
        <h2>Etikett</h2>
        <?php if ($p['barcode']): ?>
          <div style="max-width:260px;background:#fff;padding:8px;border-radius:8px"><?= barcode_svg((string)$p['barcode'], 50) ?></div>
          <p class="mt"><a class="btn ghost small" href="./?p=etiketten&ids=<?= $id ?>">Etiketten drucken</a></p>
        <?php else: ?><p class="muted">Noch kein Strichcode.</p><?php endif; ?>
      </div>
      <div class="card mt">
        <h2>Letzte Lagerbewegungen</h2>
        <?php $st = $db->prepare('SELECT * FROM stock_moves WHERE product_id = ? ORDER BY id DESC LIMIT 8'); $st->execute([$id]); $moves = $st->fetchAll(); ?>
        <?php if (!$moves): ?><p class="muted">Keine.</p><?php else: ?>
        <table class="list"><?php foreach ($moves as $m): ?>
          <tr><td><?= h(fmt_dt($m['created'])) ?></td><td><?= h(STOCK_REASONS[$m['reason']] ?? $m['reason']) ?></td><td class="num"><?= $m['qty'] > 0 ? '+' : '' ?><?= h(fmt_qty((float)$m['qty'])) ?></td><td class="num"><?= h(fmt_qty((float)$m['stock_after'])) ?></td></tr>
        <?php endforeach; ?></table><?php endif; ?>
      </div>
      <form method="post" class="card mt" onsubmit="return confirm('Artikel wirklich löschen?')">
        <?= csrf_field() ?><input type="hidden" name="do" value="delete"><input type="hidden" name="id" value="<?= $id ?>">
        <button class="btn danger small" type="submit">Artikel löschen</button>
        <p class="hint">Schon verkaufte Artikel werden nur ausgeblendet, damit alte Belege vollständig bleiben.</p>
      </form>
    </div>
    <?php endif; ?>
    </div>
    <script>
    (function(){
      const f = document.getElementById('pform'), out = document.getElementById('margin');
      const num = s => { s = String(s).trim().replace(/\s/g,''); if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g,''); return parseFloat(s.replace(',', '.')); };
      function calc(){
        const p = num(f.price.value), c = num(f.cost.value), v = (+f.vat.value)/10000;
        if (!(p > 0) || !(c > 0)) { out.textContent = ''; return; }
        const net = p / (1 + v), m = net - c;
        out.textContent = 'Netto ' + net.toFixed(2).replace('.', ',') + ' · Rohertrag ' + m.toFixed(2).replace('.', ',') + ' (' + Math.round(m / net * 100) + ' %) · Aufschlag ×' + (net / c).toFixed(2).replace('.', ',');
      }
      f.addEventListener('input', calc); calc();
    })();
    </script>
    <?php
    page_end();
    return;
}

/* ---------- Kategorien ---------- */
if (isset($_GET['cats'])) {
    page_start('artikel', 'Kategorien');
    ?>
    <p><a href="./?p=artikel">← Alle Artikel</a></p>
    <form method="post" class="card form">
      <?= csrf_field() ?><input type="hidden" name="do" value="cat_save">
      <p class="hint">Die Kategorien erscheinen in der Kasse als Reiter. Reihenfolge: kleinere Zahl zuerst.</p>
      <?php foreach ($cats as $c): ?>
        <div class="row3" style="grid-template-columns:2fr 80px 90px auto;align-items:end">
          <label>Name<input name="cat[<?= (int)$c['id'] ?>][name]" value="<?= h($c['name']) ?>" maxlength="40"></label>
          <label>Farbe<input type="color" name="cat[<?= (int)$c['id'] ?>][color]" value="<?= h($c['color']) ?>" style="padding:2px"></label>
          <label>Reihenfolge<input name="cat[<?= (int)$c['id'] ?>][sort]" inputmode="numeric" value="<?= (int)$c['sort'] ?>"></label>
          <button class="btn ghost small" type="submit" form="del-<?= (int)$c['id'] ?>">Löschen</button>
        </div>
      <?php endforeach; ?>
      <div class="row3" style="grid-template-columns:2fr 80px 90px auto;align-items:end">
        <label>Neue Kategorie<input name="cat_new" maxlength="40" placeholder="z. B. Lichterketten"></label>
        <label>Farbe<input type="color" name="cat_new_color" value="#2e5a3c" style="padding:2px"></label>
      </div>
      <div class="actions"><button class="btn" type="submit">Speichern</button></div>
    </form>
    <?php foreach ($cats as $c): ?>
      <form method="post" id="del-<?= (int)$c['id'] ?>" onsubmit="return confirm('Kategorie löschen?')"><?= csrf_field() ?><input type="hidden" name="do" value="cat_delete"><input type="hidden" name="cid" value="<?= (int)$c['id'] ?>"></form>
    <?php endforeach;
    page_end();
    return;
}

/* ---------- Liste ---------- */
$q = trim((string)($_GET['q'] ?? ''));
if ($q !== '' && preg_match('/^\d{8,14}$/', $q)) {           // gescannter Code im Suchfeld → direkt zum Artikel
    $st = $db->prepare('SELECT id FROM products WHERE barcode = ? LIMIT 1');
    $st->execute([$q]);
    if ($hit = $st->fetchColumn()) redirect('artikel&id=' . $hit);
    flash('Neuer Strichcode – lege den Artikel jetzt an.');
    redirect('artikel&new=1&barcode=' . rawurlencode($q));
}
$cat = (int)($_GET['cat'] ?? 0);
$show = (string)($_GET['show'] ?? 'active');
$where = []; $args = [];
if ($q !== '') { $where[] = '(p.name LIKE ? OR p.barcode LIKE ? OR p.sku LIKE ?)'; array_push($args, "%$q%", "%$q%", "%$q%"); }
if ($cat) { $where[] = 'p.category_id = ?'; $args[] = $cat; }
if ($show === 'active') $where[] = 'p.active = 1';
if ($show === 'inactive') $where[] = 'p.active = 0';
if ($show === 'low') $where[] = 'p.active = 1 AND p.track_stock = 1 AND p.stock <= p.min_stock';
$st = $db->prepare('SELECT p.*, c.name cat, c.color FROM products p LEFT JOIN categories c ON c.id = p.category_id'
    . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY p.name COLLATE NOCASE LIMIT 500');
$st->execute($args);
$rows = $st->fetchAll();
$GLOBALS['wide'] = true;
page_start('artikel', 'Artikel');
?>
<form class="toolbar no-print" method="get">
  <input type="hidden" name="p" value="artikel">
  <label class="grow">Suchen oder scannen<input name="q" value="<?= h($q) ?>" placeholder="Name, Strichcode, Artikelnummer" data-scan data-scan-submit autofocus></label>
  <label>Kategorie<select name="cat" onchange="this.form.submit()"><option value="0">alle</option>
    <?php foreach ($cats as $c): ?><option value="<?= (int)$c['id'] ?>" <?= $cat === (int)$c['id'] ? 'selected' : '' ?>><?= h($c['name']) ?></option><?php endforeach; ?></select></label>
  <label>Zeigen<select name="show" onchange="this.form.submit()">
    <?php foreach (['active' => 'aktive', 'low' => 'Bestand niedrig', 'inactive' => 'inaktive', 'all' => 'alle'] as $k => $t): ?><option value="<?= $k ?>" <?= $show === $k ? 'selected' : '' ?>><?= $t ?></option><?php endforeach; ?></select></label>
  <button class="btn ghost" type="submit">Suchen</button>
  <a class="btn" href="./?p=artikel&new=1">+ Neuer Artikel</a>
</form>
<div class="table-wrap">
<table class="list">
  <thead><tr><th>Name</th><th>Strichcode</th><th>Kategorie</th><th class="num">Preis</th><th class="num">Bestand</th></tr></thead>
  <tbody>
  <?php if (!$rows): ?><tr class="empty-row"><td colspan="5"><?= $q !== '' ? 'Nichts gefunden.' : 'Noch keine Artikel. Lege den ersten an oder importiere eine Liste.' ?></td></tr><?php endif; ?>
  <?php foreach ($rows as $r): $low = $r['track_stock'] && $r['stock'] <= $r['min_stock']; ?>
    <tr class="click" onclick="location='./?p=artikel&id=<?= (int)$r['id'] ?>'">
      <td><?php if ($r['image']): ?><img src="<?= h(product_image_url($r['image'], '')) ?>" alt="" loading="lazy" style="width:36px;height:36px;object-fit:cover;border-radius:8px;vertical-align:middle;margin-right:8px"><?php endif; ?><a href="./?p=artikel&id=<?= (int)$r['id'] ?>" style="text-decoration:none;font-weight:600"><?= h($r['name']) ?></a>
        <?php if (!$r['active']): ?> <span class="pill">inaktiv</span><?php endif; ?>
        <?php if ($r['open_price']): ?> <span class="pill gold">freier Preis</span><?php endif; ?></td>
      <td class="muted"><?= h((string)$r['barcode']) ?></td>
      <td><?php if ($r['cat']): ?><span class="swatch" style="background:<?= h($r['color']) ?>"></span><?= h($r['cat']) ?><?php endif; ?></td>
      <td class="num"><?= money((int)$r['price']) ?></td>
      <td class="num"><?php if ($r['track_stock']): ?><span class="<?= $low ? 'pill red' : '' ?>"><?= h(fmt_qty((float)$r['stock'])) ?> <?= h($r['unit']) ?></span><?php else: ?><span class="muted">–</span><?php endif; ?></td>
    </tr>
  <?php endforeach; ?>
  </tbody>
</table>
</div>
<p class="muted small"><?= count($rows) ?> Artikel<?= count($rows) >= 500 ? ' (nur die ersten 500 – bitte Suche nutzen)' : '' ?></p>

<div class="two-col mt no-print">
  <div class="card">
    <h2>Kategorien</h2>
    <p class="muted"><?= count($cats) ?> Kategorien – erscheinen als Reiter in der Kasse.</p>
    <p class="mt"><a class="btn ghost small" href="./?p=artikel&cats=1">Kategorien bearbeiten</a></p>
    <?php $noCode = (int)$db->query("SELECT COUNT(*) FROM products WHERE barcode IS NULL OR barcode = ''")->fetchColumn(); ?>
    <h2 class="mt">Strichcodes</h2>
    <p class="muted"><?= $noCode ? $noCode . ' Artikel ohne Strichcode.' : 'Alle Artikel haben einen Strichcode.' ?> Das Programm erzeugt eigene EAN-13-Codes (beginnen mit 20), die jeder Scanner liest.</p>
    <form method="post" class="actions mt"><?= csrf_field() ?><input type="hidden" name="do" value="gen_all">
      <button class="btn ghost small" type="submit" <?= $noCode ? '' : 'disabled' ?>>Für alle ohne Code erzeugen</button>
      <a class="btn ghost small" href="./?p=etiketten">Etiketten drucken</a></form>
  </div>
  <form class="card" method="post" enctype="multipart/form-data">
    <?= csrf_field() ?><input type="hidden" name="do" value="import">
    <h2>Import / Export (Excel, CSV)</h2>
    <p class="hint">CSV mit Semikolon. Spalten: <b>Name; Strichcode; Kategorie; Preis; Einkaufspreis; Moms; Bestand</b>. Vorhandene Strichcodes werden aktualisiert.</p>
    <div class="actions mt"><input type="file" name="csv" accept=".csv,text/csv" required style="max-width:240px"><button class="btn small" type="submit">Importieren</button>
    <a class="btn ghost small" href="./?p=artikel&export=1">Alle exportieren</a></div>
  </form>
</div>
<script>
// Hand-Scanner auf der Liste: Code öffnet den Artikel oder legt ihn an
document.addEventListener('DOMContentLoaded', () => JKScan.listen(code => location = './?p=artikel&code=' + encodeURIComponent(code)));
</script>
<?php page_end();
