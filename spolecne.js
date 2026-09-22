/*
 * Fyzika — sdílené pomocné funkce pro cvičné/herní stránky
 * (kalkulacka-fx82cex.html, prevody-jednotek.html, skladani-vektoru.html,
 *  zaokrouhlovani-vysledku.html, zpracovani-mereni.html).
 *
 * Čistě pomocné funkce beze stavu — každá stránka si dál drží vlastní
 * `state`/`gameState` objekt a volá je jako dřív, jen definice je tu
 * jedna společná místo pěti kopií.
 */

// Školní pravidlo zaokrouhluje "od nuly" podle absolutní hodnoty (|-22,5| → 23,
// tedy -22,5 → -23). Math.round ale u záporných čísel zaokrouhluje směrem k nule
// (Math.round(-22.5) === -22), takže by u záporných výsledků (např. teplota pod
// bodem mrazu) dával špatnou odpověď — proto se všude místo něj používá tohle.
function roundHalfAwayFromZero(x){
  return x < 0 ? -Math.round(-x) : Math.round(x);
}

function roundTo(n, decimals){
  var f = Math.pow(10, decimals);
  // n*f občas dopadne těsně pod „,5" (61,5/60*60 = 1,0249999999999999 místo 1,025) —
  // toPrecision(15) setře plovoucí šum dřív, než se zaokrouhlí, takže se ,5 zaokrouhlí správně nahoru.
  var cleaned = Number((n*f).toPrecision(15));
  var v = roundHalfAwayFromZero(cleaned)/f;
  if(Object.is(v,-0)) v = 0;
  return v;
}

// Zaokrouhlení na daný počet platných cifer — funguje stejně dobře
// pro velmi malá (10⁻⁸) i velmi velká (10⁸) čísla.
function roundSig(val, sig){
  if(val===0) return 0;
  var mag = Math.floor(Math.log10(Math.abs(val)));
  var f = Math.pow(10, sig-1-mag);
  var cleaned = Number((val*f).toPrecision(15));
  var v = roundHalfAwayFromZero(cleaned)/f;
  if(Object.is(v,-0)) v = 0;
  return v;
}

// Kolik desetinných míst potřebuje zápis hodnoty `value`, aby ukázal `sig` platných cifer.
function decimalsForSig(value, sig){
  if(value===0) return Math.max(0, sig-1);
  var mag = Math.floor(Math.log10(Math.abs(value)));
  return Math.max(0, sig-1-mag);
}

// Průběžně (při psaní i vkládání) odstraní z pole vše kromě číslic, jednoho
// desetinného oddělovače (čárka/tečka), znaménka mínus na začátku a mezer
// (ty parseAnswer stejně ignoruje — umožní to vložit i číslo s mezerami jako
// oddělovači tisíců). U exponentu (allowDecimal=false) desetinný oddělovač nejde zadat vůbec.
function sanitizeNumericInput(el, allowDecimal){
  el.addEventListener('input', function(){
    var v = el.value.replace(/[−–]/g, '-');
    v = v.replace(allowDecimal ? /[^0-9,.\-\s ]/g : /[^0-9\-\s ]/g, '');
    var neg = v.charAt(0)==='-';
    v = v.replace(/-/g, '');
    if(allowDecimal){
      var sepIdx = v.search(/[,.]/);
      if(sepIdx!==-1){ v = v.slice(0,sepIdx+1) + v.slice(sepIdx+1).replace(/[,.]/g,''); }
    }
    v = (neg?'-':'') + v;
    if(v!==el.value) el.value = v;
  });
}

// Formát zbývajícího/celkového času hry na čas jako m:ss.
function formatGameTime(sec){
  var m = Math.floor(sec/60), s = sec%60;
  return m + ':' + (s<10 ? '0'+s : s);
}

// Společná brána pro přepínání obtížnosti, veličiny i formátu za běhu příkladu.
// Rozepsaný příklad se vždy napřed vyhodnotí stejně, jako by uživatel klikl na
// "Zkontrolovat" (případně "Nevím" u prázdné odpovědi po potvrzení) — zpětná
// vazba zůstane viditelná a teprve její potvrzení ("Další příklad →") vygeneruje
// nový příklad s novým nastavením. Nejde tak nastavením obejít vyhodnocení, ani
// naopak "vylepšovat" úspěšnost tím, že se příklad při přepnutí tiše smaže.
// Vrací 'cancelled' (uživatel zrušil dialog u prázdné odpovědi — volající nemá
// nastavení měnit), 'locked' (příklad byl už vyhodnocený — lze rovnou vygenerovat
// další), 'untouched' (pole bylo prázdné, ale žák do příkladu vůbec nezasáhl —
// nic se nepenalizuje, lze rovnou vygenerovat další) nebo 'settled' (příklad
// byl právě vyhodnocen — počkat na potvrzení).
//
// Vyžaduje, aby stránka měla globální `state` s `.locked`/`.touched` a funkce
// `isAnswerEmpty()`, `checkAnswer()`, `skip()` — přesně jak je má
// kalkulacka-fx82cex.html a prevody-jednotek.html. Na skladani-vektoru.html,
// zaokrouhlovani-vysledku.html a zpracovani-mereni.html mají tenhle přepínač
// (settleCurrentQuestion) jinou logiku/jiná jména pomocných funkcí, takže tam
// zůstává vlastní definice na stránce.
function settleCurrentQuestion(){
  if(state.locked) return 'locked';
  if(isAnswerEmpty()){
    if(!state.touched) return 'untouched';
    if(!confirm('Odpověď není vyplněná. Opravdu chcete pokračovat? Bude to počítáno jako špatná odpověď.')) return 'cancelled';
    skip();
  } else {
    checkAnswer();
  }
  return 'settled';
}
