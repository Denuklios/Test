// Wunsch-Fabrik – gemeinsames Skript für alle Sprachversionen (/, /en/, /da/)
//
// >>> HIER die Kauf- und Download-Links eintragen (gilt für alle drei Sprachen) <<<
//   buy:      Kauf-Links von Lemon Squeezy je Programm
//   download: Links zu den Installern (z. B. GitHub-Release oder eigene Download-Seite)
// Solange ein Link leer ist, springt der Knopf zu den Preisen.
const LINKS = {
  buy: { stick: '', fraes: '', laser: '' },
  download: { stick: '', fraes: '', laser: '' },
};

// ---- Ab hier nichts mehr ändern ----
(function () {
  // Kauf-/Download-Knöpfe verdrahten
  const prices = document.querySelector('[data-section="prices"]');
  const fallback = prices && prices.id ? '#' + prices.id : '#';
  document.querySelectorAll('[data-buy],[data-download]').forEach((a) => {
    const url = a.dataset.buy ? LINKS.buy[a.dataset.buy] : LINKS.download[a.dataset.download];
    if (url) { a.href = url; a.target = '_blank'; a.rel = 'noopener'; }
    else a.href = fallback;
  });

  // Jahreszahl im Fuß
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  // Sprachwahl merken, damit die Startseite nicht mehr automatisch umleitet
  document.querySelectorAll('.lang a[hreflang]').forEach((a) => {
    a.addEventListener('click', () => {
      try { localStorage.setItem('wf-lang', a.getAttribute('hreflang')); } catch (e) { /* Speicher gesperrt – egal */ }
    });
  });
})();
