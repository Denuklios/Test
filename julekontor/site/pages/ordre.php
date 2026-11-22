<?php
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');
$t = (string)($_GET['t'] ?? '');
$o = preg_match('/^[0-9a-f]{32}$/', $t) ? web_order_get('token', $t) : null;
site_head(t('order.title'), 'kurv');
?>
<section class="sec sec-paper sec-top">
  <div class="wrap narrow">
    <?php if (!$o): ?>
      <p class="empty-note"><?= e('order.notfound') ?></p>
    <?php else: $card = $o['payment'] === 'card' && !$o['paid'] && $o['status'] !== 'storniert'; ?>
    <div class="postcard receipt">
      <p class="eyebrow"><?= e('order.no', ['no' => web_order_no($o)]) ?></p>
      <h1 class="h2"><?= e('order.title') ?></h1>
      <p><?= e('order.mail', ['email' => $o['email']]) ?></p>
      <table class="hours">
        <?php foreach ($o['items'] as $it): ?><tr><td><?= (int)$it['qty'] ?> × <?= h($it['name']) ?></td><td><?= h(money((int)$it['total'])) ?></td></tr><?php endforeach; ?>
        <?php if ($o['shipping']): ?><tr><td><?= e('cart.shipping') ?></td><td><?= h(money((int)$o['shipping'])) ?></td></tr><?php endif; ?>
        <tr class="today"><td><?= e('cart.total') ?></td><td><?= h(money((int)$o['total'])) ?></td></tr>
      </table>
      <p><strong><?= e('order.status') ?>:</strong> <?= e('order.s.' . $o['status']) ?> · <?= e('checkout.d.' . $o['delivery']) ?></p>
      <p class="pay-note"><?= nl2br(h(web_pay_text($o, $LANG))) ?></p>
      <?php if ($card && web_card_ready()): ?><p><a class="btn" href="api.php?a=pay&amp;t=<?= h($o['token']) ?>"><?= e('order.pay.retry') ?></a></p><?php endif; ?>
    </div>
    <?php endif; ?>
    <p class="center" style="margin-top:28px"><a class="more" href="<?= h(url('butik')) ?>">← <?= e('shop.back') ?></a></p>
  </div>
</section>
<?php site_foot(['page' => 'ordre', 'clearCart' => (bool)$o && isset($_GET['ny'])]);
