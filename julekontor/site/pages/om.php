<?php
site_head(t('about.title'), 'om', t('visit.lead'));
page_banner(t('about.eyebrow'), t('about.title'), '', 'assets/img/butik.webp');
?>
<section class="sec sec-paper sec-tight">
  <div class="wrap about">
    <div class="prose big reveal"><?= paragraphs(t('about.body')) ?>
      <p style="margin-top:26px"><a class="btn" href="<?= h(url('butik')) ?>"><?= e('hero.cta1') ?></a> &nbsp; <a class="btn btn-line" href="<?= h(url('kontakt')) ?>"><?= e('nav.visit') ?></a></p>
    </div>
    <div class="about-art reveal">
      <div class="frame frame-tilt"><img src="<?= h(slot_img('werkstatt')) ?>" alt="" loading="lazy"></div>
      <div class="frame frame-tilt2"><img src="<?= h(slot_img('kranse')) ?>" alt="" loading="lazy"></div>
    </div>
  </div>
</section>
<?php site_foot(['page' => 'om']);
