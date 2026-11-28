<?php
header('Cache-Control: no-store');
site_head(t('cart.title'), 'kurv');
?>
<section class="sec sec-paper sec-top">
  <div class="wrap">
    <header class="sec-head reveal"><h1 class="h2"><?= e('cart.title') ?></h1></header>
    <p class="empty-note" id="cartEmpty" hidden><?= e('cart.empty') ?><br><br><a class="btn" href="<?= h(url('butik')) ?>"><?= e('hero.cta1') ?></a></p>
    <div class="checkout" id="checkout" hidden>
      <div class="cart-box">
        <p class="form-msg err" id="cartNote" role="status"></p>
        <div id="cartLines"></div>
        <dl class="sums" id="cartSums"></dl>
      </div>
      <form class="letter" id="orderForm" novalidate>
        <h3><?= e('checkout.delivery') ?></h3>
        <div class="choices" id="deliveryChoices"></div>
        <div id="methodBox" hidden>
          <h3><?= e('checkout.method') ?></h3>
          <div class="choices" id="methodChoices"></div>
          <p class="hint-line" id="methodInfo"></p>
        </div>
        <h3><?= e('checkout.payment') ?></h3>
        <div class="choices" id="paymentChoices"></div>
        <h3><?= e('checkout.you') ?></h3>
        <label><span><?= e('form.name') ?></span><input name="name" autocomplete="name" required maxlength="80"></label>
        <div class="two">
          <label><span><?= e('form.email') ?></span><input name="email" type="email" autocomplete="email" required maxlength="120"></label>
          <label><span><?= e('form.phone') ?></span><input name="phone" type="tel" autocomplete="tel" maxlength="40"></label>
        </div>
        <div id="addressFields" hidden>
          <label><span><?= e('checkout.street') ?></span><input name="street" autocomplete="street-address" maxlength="120"></label>
          <div class="two">
            <label><span><?= e('checkout.zip') ?></span><input name="zip" autocomplete="postal-code" maxlength="12"></label>
            <label><span><?= e('checkout.city') ?></span><input name="city" autocomplete="address-level2" maxlength="80"></label>
          </div>
        </div>
        <label id="parcelShop" hidden><span><?= e('checkout.parcelshop') ?></span><input name="parcel_shop" maxlength="160" placeholder="<?= e('checkout.parcelshop.ph') ?>"></label>
        <label><span><?= e('checkout.note') ?></span><textarea name="note" rows="2" maxlength="1000"></textarea></label>
        <label class="hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
        <label class="agree"><input type="checkbox" name="terms" value="1"><span><?= e('checkout.terms') ?>
          (<a href="<?= h(url('vilkaar', ['d' => 'terms'])) ?>" target="_blank"><?= e('legal.terms') ?></a>, <a href="<?= h(url('vilkaar', ['d' => 'withdrawal'])) ?>" target="_blank"><?= e('legal.withdrawal') ?></a>)</span></label>
        <p class="form-msg" role="status" aria-live="polite"></p>
        <button class="btn" type="submit"><?= e('checkout.submit') ?></button>
      </form>
    </div>
  </div>
</section>
<?php site_foot(['page' => 'kurv']);
