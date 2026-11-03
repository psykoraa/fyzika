/*
 * Fyzika — posouvání karet témat v rozcestnících (viz karusel.css).
 * Šipky se ukážou jen tehdy, když se karty do řady nevejdou; na krajích
 * se šipka skryje. Posun o šířku viditelné části (zarovnáno na kartu).
 */
(function () {
  "use strict";

  function nastav(karusel) {
    var pas = karusel.querySelector('.karusel-pas');
    var vlevo = karusel.querySelector('.karusel-sipka.vlevo');
    var vpravo = karusel.querySelector('.karusel-sipka.vpravo');
    if (!pas || !vlevo || !vpravo) return;

    pas.setAttribute('tabindex', '0');
    pas.setAttribute('role', 'region');
    pas.setAttribute('aria-label', 'Témata, posouvání do stran');

    function aktualizuj() {
      var preteka = pas.scrollWidth > pas.clientWidth + 2;
      vlevo.hidden = !preteka;
      vpravo.hidden = !preteka;
      vlevo.disabled = pas.scrollLeft <= 8;
      vpravo.disabled = pas.scrollLeft + pas.clientWidth >= pas.scrollWidth - 8;
    }

    function posun(smer) {
      var krok = Math.max(pas.clientWidth * 0.8, 200);
      pas.scrollBy({ left: smer * krok, behavior: 'smooth' });
    }

    vlevo.addEventListener('click', function () { posun(-1); });
    vpravo.addEventListener('click', function () { posun(1); });
    pas.addEventListener('scroll', aktualizuj);
    pas.addEventListener('keydown', function (ev) {
      if (ev.target !== pas) return;
      if (ev.key === 'ArrowRight') { posun(1); ev.preventDefault(); }
      else if (ev.key === 'ArrowLeft') { posun(-1); ev.preventDefault(); }
    });
    window.addEventListener('resize', aktualizuj);
    /* auth.js může karty dodatečně skrýt, písma se načítají později */
    if (window.MutationObserver) {
      new MutationObserver(aktualizuj).observe(pas, { attributes: true, subtree: true, attributeFilter: ['class'] });
    }
    window.addEventListener('load', aktualizuj);
    aktualizuj();
  }

  function init() {
    var k = document.querySelectorAll('.karusel');
    for (var i = 0; i < k.length; i++) nastav(k[i]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
