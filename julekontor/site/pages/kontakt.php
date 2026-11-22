<?php
site_head(t('contact.title'), 'kontakt', t('visit.lead'));
page_banner(t('visit.eyebrow'), t('visit.title'), t('visit.lead'), 'assets/img/butik.webp');
?>
<section class="sec sec-paper sec-tight sec-visit">
  <div class="wrap">
    <div class="visit" id="skriv">
      <?php visit_card(); ?>
      <?php if ($SITE['requests']) contact_form(); ?>
    </div>
  </div>
</section>
<?php site_foot(['page' => 'kontakt']);
