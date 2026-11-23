/*
 * Fyzika — vyhledávání témat na rozcestnících (index.html a rozcestniky/*.html).
 * Načte karty ze tří rozcestníků a text stránek, které jsou v nich odkázané;
 * pole vloží pod .hero a během hledání skryje oddíly s kartami.
 */
(function(){
  // Kořen webu z adresy tohoto skriptu (spolecne/hledani.js), ať funguje z index.html i z rozcestniky/.
  var self = document.currentScript;
  var ROOT = self && self.src ? self.src.replace(/spolecne\/hledani\.js(?:[?#].*)?$/, '') : '';
  var hero = document.querySelector('.hero');
  if(!ROOT || !hero) return;

  var box = document.createElement('div');
  box.className = 'search';
  box.setAttribute('role', 'search');
  box.innerHTML = '<input type="search" id="hledani" placeholder="Hledat téma (např. čočky, vektory, interference)…" aria-label="Hledat téma" autocomplete="off"><ul class="search-results" id="hledani-vysledky" hidden></ul>';
  hero.parentNode.insertBefore(box, hero.nextSibling);

  var input = document.getElementById('hledani');
  var list = document.getElementById('hledani-vysledky');
  var chapters = document.querySelectorAll('section.chapter');
  function setMain(hide){
    for(var i=0;i<chapters.length;i++) chapters[i].classList.toggle('fz-hidden-by-search', hide);
  }
  var index = null, loading = false, bodiesState = 0; // 0 = nenačteno, 1 = načítá se, 2 = hotovo
  var SOURCES = [
    {url:ROOT + 'rozcestniky/mereni.html', name:'Měření'},
    {url:ROOT + 'rozcestniky/kvinta.html', name:'Kvinta/1. ročník'},
    {url:ROOT + 'rozcestniky/sexta.html', name:'Sexta/2. ročník'},
    {url:ROOT + 'rozcestniky/oktava.html', name:'Oktáva/4. ročník'}
  ];

  function norm(t){
    return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  }
  function hiddenFiles(){
    var out = {}, cfg = null, isAdmin = false;
    try{
      cfg = window.FyzikaAuth && FyzikaAuth.cachedPageConfig();
      var u = FyzikaAuth.getUser(); isAdmin = !!(u && u.role === 'admin');
    }catch(e){}
    if(cfg && !isAdmin && cfg.pages){
      for(var i=0;i<cfg.pages.length;i++){ if(!cfg.pages[i].visible) out[cfg.pages[i].file] = true; }
    }
    return out;
  }
  function parse(html, src){
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var items = [];
    var chapters = doc.querySelectorAll('section.chapter');
    for(var c=0;c<chapters.length;c++){
      var h2 = chapters[c].querySelector('.chapter-head h2');
      var chap = h2 ? h2.textContent.trim() : '';
      var cards = chapters[c].querySelectorAll('.topic-card');
      for(var k=0;k<cards.length;k++){
        var a = cards[k].querySelector('a.btn');
        var h3 = cards[k].querySelector('h3');
        var p = cards[k].querySelector('.topic-body p');
        if(!a || !h3) continue;
        var href = a.getAttribute('href') || '';
        var rel = href.indexOf('../') === 0 ? href.slice(3) : 'rozcestniky/' + href;
        if(/^(https?:)?\/\//.test(href) || !/\.html$/.test(rel)) continue;
        var title = h3.textContent.trim(), desc = p ? p.textContent.trim() : '';
        items.push({
          title:title, desc:desc, href:rel, section:src.name, chapter:chap,
          file: rel.split('/').pop(),
          nt: norm(title), nb: norm(desc + ' ' + chap + ' ' + src.name)
        });
      }
    }
    return items;
  }
  function pageText(html){
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var rm = doc.querySelectorAll('script, style, svg, noscript, canvas, .top-tabs, .back-link, footer');
    for(var i=0;i<rm.length;i++) rm[i].parentNode.removeChild(rm[i]);
    var root = doc.querySelector('.wrap') || doc.body;
    return root ? root.textContent.replace(/\s+/g,' ').trim() : '';
  }
  function loadBodies(cb){
    if(bodiesState === 2){ cb(); return; }
    if(bodiesState === 1) return;
    bodiesState = 1;
    var left = index.length;
    if(!left){ bodiesState = 2; cb(); return; }
    index.forEach(function(it){
      fetch(ROOT + it.href).then(function(r){ return r.ok ? r.text() : ''; }).then(function(t){
        it.text = t ? pageText(t) : '';
      }).catch(function(){ it.text = ''; }).then(function(){
        it.nbody = norm(it.text || '');
        if(--left === 0){ bodiesState = 2; cb(); }
      });
    });
  }
  function snippet(it, words){
    var t = it.text || '', n = it.nbody || '', pos = -1, len = 0;
    for(var i=0;i<words.length;i++){
      var j = n.indexOf(words[i]);
      if(j >= 0 && (pos < 0 || j < pos)){ pos = j; len = words[i].length; }
    }
    if(pos < 0 || n.length !== t.length) return null;
    var a = Math.max(0, pos - 60), b = Math.min(t.length, pos + len + 90);
    var box = el('span','search-snip');
    box.appendChild(document.createTextNode((a > 0 ? '… ' : '') + t.slice(a, pos)));
    box.appendChild(el('mark', null, t.slice(pos, pos + len)));
    box.appendChild(document.createTextNode(t.slice(pos + len, b) + (b < t.length ? ' …' : '')));
    return box;
  }
  function load(cb){
    if(index){ cb(); return; }
    if(loading) return;
    loading = true;
    var left = SOURCES.length, all = [];
    SOURCES.forEach(function(src, i){
      fetch(src.url).then(function(r){ return r.ok ? r.text() : ''; }).then(function(t){
        all[i] = t ? parse(t, src) : [];
      }).catch(function(){ all[i] = []; }).then(function(){
        if(--left === 0){
          index = [].concat.apply([], all);
          loading = false;
          cb();
        }
      });
    });
  }
  function el(tag, cls, text){
    var n = document.createElement(tag);
    if(cls) n.className = cls;
    if(text !== undefined) n.textContent = text;
    return n;
  }
  function render(){
    var q = norm(input.value.trim());
    list.innerHTML = '';
    if(!q){ list.hidden = true; setMain(false); return; }
    setMain(true);
    list.hidden = false;
    var words = q.split(/\s+/), hid = hiddenFiles(), res = [];
    for(var i=0;i<index.length;i++){
      var it = index[i];
      if(hid[it.file]) continue;
      var score = 0, ok = true, inBody = false;
      for(var w=0;w<words.length;w++){
        if(it.nt.indexOf(words[w]) >= 0) score += 2;
        else if(it.nb.indexOf(words[w]) >= 0) score += 1;
        else if(it.nbody && it.nbody.indexOf(words[w]) >= 0){ score += 0.5; inBody = true; }
        else { ok = false; break; }
      }
      if(ok) res.push({it:it, score:score});
    }
    res.sort(function(a,b){ return b.score - a.score; });
    if(bodiesState !== 2) list.appendChild(el('li','search-note','Prohledávám i obsah stránek…'));
    if(!res.length){ if(bodiesState === 2) list.appendChild(el('li','search-empty','Nic nenalezeno.')); return; }
    res.forEach(function(r){
      var li = document.createElement('li');
      var a = el('a');
      a.href = ROOT + r.it.href;
      a.appendChild(el('span','sr-title',r.it.title));
      a.appendChild(el('span','sr-meta',r.it.section + ' · ' + r.it.chapter));
      if(r.it.desc) a.appendChild(el('span','sr-desc',r.it.desc));
      var sn = snippet(r.it, words);
      if(sn) a.appendChild(sn);
      li.appendChild(a);
      list.appendChild(li);
    });
  }
  input.addEventListener('input', function(){ load(function(){ render(); loadBodies(render); }); });
  input.addEventListener('keydown', function(e){
    if(e.key === 'Escape'){ input.value = ''; render(); }
    if(e.key === 'Enter'){ var a = list.querySelector('a'); if(a) location.href = a.href; }
  });
})();
