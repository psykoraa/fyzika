/*
 * Fyzika — přepínání vzhledu (motivu) celého webu.
 *
 * Motivy: "instituce" (výchozí, odborný vzhled s tyrkysovým zvýrazněním)
 *         "denik"     (laboratorní deník: čtverečkovaný papír, ručně psané nadpisy)
 *
 * Skript se načítá v <head> každé stránky (za stylem stránky, spolu
 * se spolecne/motivy.css). Hned při načtení nastaví <html data-motiv="…"
 * data-sekce="…">, takže stránka se vykreslí rovnou ve správném vzhledu
 * bez probliknutí. Po načtení DOM přidá do rohu obrazovky malý přepínač
 * vzhledu; obsah stránky nemění. Volba se pamatuje v localStorage
 * (klíč fyzika:motiv) a platí pro všechny stránky.
 *
 * Barvy jednotlivých motivů jsou v motivy.css; tady je jen logika.
 */
(function () {
  "use strict";

  var KLIC = 'fyzika:motiv';
  var VYCHOZI = 'instituce';
  var MOTIVY = {
    instituce: { nazev: 'Odborný', fonty: 'family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&family=Public+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400' },
    denik:     { nazev: 'Deník',   fonty: 'family=Caveat:wght@500;600;700&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400' }
  };
  var PORADI = ['instituce', 'denik'];

  var root = document.documentElement;

  function nactiMotiv() {
    var m = null;
    try { m = window.localStorage.getItem(KLIC); } catch (e) { m = null; }
    return MOTIVY.hasOwnProperty(m) ? m : VYCHOZI;
  }

  function ulozMotiv(m) {
    try { window.localStorage.setItem(KLIC, m); } catch (e) { /* soukromé okno apod. */ }
  }

  /* Sekce podle cesty stránky: určuje fotku v úvodu a barvu zvýrazňovače v deníku. */
  function zjistiSekci() {
    var p = window.location.pathname;
    if (/\/(rozcestniky\/)?mereni(\/|\.html)/.test(p)) return 'mereni';
    if (/\/(rozcestniky\/)?kvinta(\/|\.html)/.test(p)) return 'kvinta';
    if (/\/(rozcestniky\/)?oktava(\/|\.html)/.test(p)) return 'oktava';
    if (/\/ucet\//.test(p)) return 'ucet';
    return 'uvod';
  }

  function pridejFonty(m) {
    var id = 'fz-fonty-' + m;
    if (document.getElementById(id)) return;
    var l = document.createElement('link');
    l.id = id;
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?' + MOTIVY[m].fonty + '&display=swap';
    (document.head || root).appendChild(l);
  }

  var sekce = zjistiSekci();
  var motiv = nactiMotiv();
  root.setAttribute('data-motiv', motiv);
  root.setAttribute('data-sekce', sekce);
  pridejFonty(motiv);

  function aktualizujTlacitka() {
    var t = document.querySelectorAll('.fz-motiv button');
    for (var i = 0; i < t.length; i++) {
      t[i].setAttribute('aria-pressed', t[i].getAttribute('data-motiv') === motiv ? 'true' : 'false');
    }
  }

  function nastavMotiv(m) {
    if (!MOTIVY.hasOwnProperty(m)) return;
    motiv = m;
    pridejFonty(m);
    root.setAttribute('data-motiv', m);
    ulozMotiv(m);
    aktualizujTlacitka();
  }

  /* Změna motivu v jiné záložce prohlížeče se projeví i tady. */
  window.addEventListener('storage', function (ev) {
    if (ev.key === KLIC && ev.newValue && MOTIVY.hasOwnProperty(ev.newValue)) nastavMotiv(ev.newValue);
  });

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) if (attrs.hasOwnProperty(k)) e.setAttribute(k, attrs[k]);
    if (text) e.appendChild(document.createTextNode(text));
    return e;
  }

  /* Malý přepínač vzhledu v rohu obrazovky. Obsah stránky se nemění. */
  function vlozPrepinac() {
    if (!document.body || document.getElementById('fz-motiv')) return;
    var prepinac = el('div', { id: 'fz-motiv', 'class': 'fz-motiv', role: 'group', 'aria-label': 'Vzhled webu' });
    prepinac.appendChild(el('span', { 'class': 'fz-motiv-popis' }, 'Vzhled'));
    for (var i = 0; i < PORADI.length; i++) {
      var m = PORADI[i];
      var b = el('button', { type: 'button', 'data-motiv': m, 'aria-pressed': 'false' }, MOTIVY[m].nazev);
      b.addEventListener('click', function () { nastavMotiv(this.getAttribute('data-motiv')); });
      prepinac.appendChild(b);
    }
    document.body.appendChild(prepinac);
    aktualizujTlacitka();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', vlozPrepinac);
  } else {
    vlozPrepinac();
  }

  /* Pro případné použití z konzole nebo jiných skriptů. */
  window.fyzikaMotiv = { nastav: nastavMotiv, aktualni: function () { return motiv; } };
})();
