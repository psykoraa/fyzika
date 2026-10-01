/*
 * Fyzika — zapamatování otevřené záložky (Teorie / Trénink / …) při obnovení stránky.
 *
 * Funguje na všech stránkách s horními záložkami (tlačítka .toptab s atributem data-tab):
 *  - po obnovení stránky (F5, refresh) zůstane otevřená záložka, na které byl uživatel;
 *  - když se na stránku přijde odjinud (odkaz, zpět/vpřed, nová karta), otevře se
 *    výchozí záložka (Teorie) — tu si stránka nastaví sama.
 * Záložka se otevře „kliknutím“ na její tlačítko, takže se použije běžná obsluha stránky.
 */
(function(){
  var KEY = 'fyzika:zalozka:' + location.pathname;
  function ssGet(){ try{ return sessionStorage.getItem(KEY); }catch(e){ return null; } }
  function ssSet(v){ try{ sessionStorage.setItem(KEY, v); }catch(e){} }
  function ssDel(){ try{ sessionStorage.removeItem(KEY); }catch(e){} }

  function isReload(){
    try{
      var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
      if(nav) return nav.type === 'reload';
      return !!performance.navigation && performance.navigation.type === 1;
    }catch(e){ return false; }
  }

  var saved = isReload() ? ssGet() : null;
  if(!saved) ssDel();

  // Při obnovení se stránka do otevření uložené záložky skryje, aby na okamžik
  // nepřeskočila na Teorii (skript je v <head>, takže to stihne před vykreslením).
  var hideStyle = null;
  if(saved){
    try{
      hideStyle = document.createElement('style');
      hideStyle.textContent = 'body{visibility:hidden !important}';
      document.head.appendChild(hideStyle);
    }catch(e){ hideStyle = null; }
  }
  function reveal(){
    if(hideStyle && hideStyle.parentNode) hideStyle.parentNode.removeChild(hideStyle);
    hideStyle = null;
  }
  if(hideStyle) setTimeout(reveal, 2000);   // pojistka, kdyby se cokoli pokazilo

  // Uloží se až záložka, která se po kliknutí opravdu otevřela (např. potvrzení
  // „opustit běžící hru?“ jde odmítnout a záložka se pak nepřepne). Posluchač na
  // dokumentu běží až po obsluze tlačítka, takže třída .on už je nastavená.
  document.addEventListener('click', function(e){
    var b = e.target && e.target.closest ? e.target.closest('.toptab[data-tab]') : null;
    if(b && b.classList.contains('on')) ssSet(b.getAttribute('data-tab'));
  });

  // Obnovení až po skriptech stránky, které obsluhu záložek teprve zapojují.
  function restore(){
    if(!saved) return;
    try{
      var btns = document.querySelectorAll('.toptab[data-tab]');
      for(var i = 0; i < btns.length; i++){
        var b = btns[i];
        if(b.getAttribute('data-tab') !== saved) continue;
        if(!b.classList.contains('on') && !b.disabled && !b.hidden) b.click();
        break;
      }
    }finally{ reveal(); }
  }
  function later(){ setTimeout(restore, 0); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', later);
  else later();
})();
