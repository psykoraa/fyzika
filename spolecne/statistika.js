/*
 * Fyzika — anonymní sledování návštěvnosti (GoatCounter, https://www.goatcounter.com).
 *
 * Bez cookies, bez ukládání dat do prohlížeče, bez osobních údajů (neukládá ani celou IP adresu),
 * proto není potřeba cookie lišta. Počítá zobrazení stránek, odkud lidé přišli, typ zařízení apod.
 *
 * Zapnutí: do config.js doplnit GOATCOUNTER_CODE (např. 'fyzika' pro fyzika.goatcounter.com).
 * Dokud je prázdný, nic se nenačítá a nic se neodesílá.
 * Vložení do stránky: <script src="…/spolecne/statistika.js"></script> hned za config.js.
 */
(function () {
  'use strict';

  var CODE = String((window.FYZIKA_CONFIG || {}).GOATCOUNTER_CODE || '').trim();
  if (!/^[a-z0-9-]+$/.test(CODE)) return;

  // Lokální vývoj, otevření ze souboru a administrace se do statistik nepočítají.
  var host = location.hostname;
  if (!host || host === 'localhost' || host === '127.0.0.1') return;
  if (/\/ucet\/admin\.html$/.test(location.pathname)) return;

  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://gc.zgo.at/count.js';
  s.setAttribute('data-goatcounter', 'https://' + CODE + '.goatcounter.com/count');
  document.head.appendChild(s);
})();
