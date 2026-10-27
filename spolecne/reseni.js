/*
 * Fyzika — zobrazení řešení příkladů „jako v LaTeXu“ (sdílené pro všechny tréninky).
 *
 * Postupy v šablonách příkladů jsou zapsané jako HTML text se zlomky „a / b“
 * (<i>v</i>, <sub>…</sub>, ², ⁻¹, √(…)). FyzikaReseni.texify() je při zobrazení převede
 * do TeXu a vykreslí přes KaTeX (skutečné zlomky, odmocniny, mocniny, jednotky v přímém
 * písmu); české věty zůstanou textem. Kdyby cokoli selhalo (KaTeX se nenačetl, neznámý
 * zápis), vrátí se původní HTML, takže se nikdy nic neztratí.
 *
 * FyzikaReseni.html({ given, find, steps, final, note, plain }) složí celé řešení
 * (sloupce Dáno | Řešení); styl je ve spolecne/reseni.css. plain:true = řádky vložit jako
 * prostý text (bez převodu do TeXu).
 */
(function(){
  var TX_UNIT = /^(?:km|kg|m|s|h|g|N|J|W)(?:⁻?[¹²³])?(?:·(?:km|kg|m|s|h|g|N|J|W)(?:⁻?[¹²³])?)*(?![A-Za-zÀ-ž])/;
  var TX_SUP = { '⁻':'-', '¹':'1', '²':'2', '³':'3' };
  var TX_STOP = { '=':1, '≈':1, '+':1, '−':1, '→':1, ';':1, ':':1, '/':1 };

  function txTokens(src){
    var t = [], pos = 0, m, sp;
    src = src.replace(/\u00A0/g, ' ');
    while(pos < src.length){
      sp = false;
      while(src.charAt(pos) === ' '){ sp = true; pos++; }
      if(pos >= src.length) break;
      var rest = src.slice(pos), prev = t[t.length - 1];
      if((m = /^<i>(.*?)<\/i>/.exec(rest))){
        t.push({ k:'var', tex:m[1], raw:m[0], sp:sp });
      } else if((m = /^<sub>(.*?)<\/sub>/.exec(rest))){
        if(!prev || prev.k === 'op') throw new Error('sub');
        prev.sub = /^\d+$/.test(m[1]) ? m[1] : /^<i>[^<]*<\/i>$/.test(m[1]) ? m[1].replace(/<\/?i>/g, '') : '\\mathrm{' + m[1].replace(/<\/?i>/g, '') + '}';
        prev.raw += m[0];
        pos += m[0].length;
        continue;
      } else if((m = /^(?:\d{1,3}(?: \d{3})+|\d+)(?:,\d+)?/.exec(rest))){
        t.push({ k:'num', tex:m[0].replace(',', '{,}').replace(/ /g, '\\,'), raw:m[0], sp:sp });
      } else if(prev && (prev.k === 'num' || prev.k === ')') && (m = TX_UNIT.exec(rest))){
        var u = m[0].replace(/[⁻¹²³]+/g, function(x){ return '^{' + x.split('').map(function(c){ return TX_SUP[c]; }).join('') + '}'; }).replace(/·/g, '\\cdot ');
        t.push({ k:'unit', tex:'\\mathrm{' + u + '}', raw:m[0], sp:sp });
      } else if((m = /^[⁻¹²³]+/.exec(rest))){
        if(!prev) throw new Error('pow');
        prev.pow = (prev.pow || '') + m[0].split('').map(function(c){ return TX_SUP[c]; }).join('');
        prev.raw += m[0];
      } else if((m = /^[A-Za-zÀ-ž]+/.exec(rest))){
        t.push({ k:'text', raw:m[0], sp:sp });
      } else {
        var c = rest.charAt(0), tk = { raw:c, sp:sp };
        m = [c];
        if(c === '(' || c === ')') tk.k = c;
        else if(c === '√') tk.k = 'sqrt';
        else if(c === 'Δ') { tk.k = 'var'; tk.tex = '\\Delta'; }
        else if(c === '½') { tk.k = 'num'; tk.tex = '\\tfrac{1}{2}'; }
        else if(c === '?') { tk.k = 'num'; tk.tex = '\\;?'; }
        else if('=≈+−·/→;:,.'.indexOf(c) >= 0) tk.k = 'op';
        else tk.k = 'text';
        t.push(tk);
      }
      pos += m[0].length;
    }
    return t;
  }

  // Závorky -> vnořené skupiny.
  function txNest(t, i, close){
    var out = [];
    while(i.n < t.length){
      var x = t[i.n++];
      if(x.k === '('){
        var g = { k:'group', items:txNest(t, i, true), sp:x.sp };
        g.pow = t[i.n - 1].pow;
        out.push(g);
      } else if(x.k === ')'){
        if(!close) throw new Error('paren');
        return out;
      } else out.push(x);
    }
    if(close) throw new Error('paren');
    return out;
  }
  function txHasText(items){
    return items.some(function(x){ return x.k === 'text' || (x.k === 'group' && txHasText(x.items)); });
  }
  function txRaw(items){
    return items.map(function(x){
      var r = x.k === 'group' ? '(' + txRaw(x.items) + ')' + (x.pow ? x.pow.replace(/-/g, '⁻').replace(/1/g, '¹').replace(/2/g, '²').replace(/3/g, '³') : '') : x.raw;
      return (x.sp ? ' ' : '') + r;
    }).join('');
  }

  // Odmocniny a zlomky (zleva doprava; „/“ váže celé okolní součiny, ne +, −, =, ≈, →).
  function txReduce(items){
    var its = items.map(function(g){
      return g.k === 'group' ? { k:'group', items:txReduce(g.items), pow:g.pow, sp:g.sp } : g;
    }), i;
    for(i = 0; i < its.length; i++){
      if(its[i].k === 'sqrt'){
        if(!its[i + 1]) throw new Error('sqrt');
        its.splice(i, 2, { k:'sqrtof', arg:its[i + 1], sp:its[i].sp });
      }
    }
    var isStop = function(x){ return x.k === 'op' && TX_STOP[x.raw]; };
    for(i = 0; i < its.length; i++){
      if(!(its[i].k === 'op' && its[i].raw === '/')) continue;
      var L = i, R = i;
      while(L > 0 && !isStop(its[L - 1])) L--;
      while(R < its.length - 1 && !isStop(its[R + 1])) R++;
      if(L === i || R === i) throw new Error('frac');
      its.splice(L, R - L + 1, { k:'frac', num:its.slice(L, i), den:its.slice(i + 1, R + 1) });
      i = L;
    }
    return its;
  }
  function txMath(items){
    var its = txReduce(items);
    return { tex:txEmit(its), frac:its.some(txDeep) };
  }
  function txDeep(x){ return x.k === 'frac' || x.k === 'sqrtof' || (x.k === 'group' && x.items.some(txDeep)); }
  function txEmit(its, strip){
    if(strip && its.length === 1 && its[0].k === 'group' && !its[0].pow) its = its[0].items;
    var prevNum = false;
    return its.map(function(x){
      var s;
      switch(x.k){
        case 'frac': s = '\\frac{' + txEmit(x.num, true) + '}{' + txEmit(x.den, true) + '}'; break;
        case 'sqrtof': s = '\\sqrt{' + txEmit([x.arg], true) + '}'; break;
        case 'group': s = (x.items.some(txDeep) ? '\\left(' + txEmit(x.items) + '\\right)' : '(' + txEmit(x.items) + ')'); break;
        case 'num': s = (prevNum ? '' : '') + x.tex; break;
        case 'unit': s = '\\,' + x.tex; break;
        case 'var': s = x.tex; break;
        case 'op':
          s = { '≈':'\\approx ', '·':'\\cdot ', '−':'-', '→':'\\to ', ',':',\\,', ';':';\\,', ':':':\\,' }[x.raw] || x.raw;
          break;
        default: throw new Error('emit ' + x.k);
      }
      if(x.k === 'var' || x.k === 'num'){
        if(x.sub) s += '_{' + x.sub + '}';
        if(x.pow) s += '^{' + x.pow + '}';
      } else if(x.k === 'group' && x.pow) s += '^{' + x.pow + '}';
      return s;
    }).join(' ');
  }

  function texify(html){
    var items = txNest(txTokens(html), { n:0 }, false), out = '', run = [];
    function flush(){
      if(!run.length) return;
      var m = txMath(run);
      out += (run[0].sp && out ? ' ' : '') + katex.renderToString((m.frac ? '\\displaystyle ' : '') + m.tex, { throwOnError:true, strict:'ignore' });
      run = [];
    }
    items.forEach(function(x){
      var isText = x.k === 'text' || (x.k === 'group' && txHasText(x.items)) ||
        (x.k === 'op' && (x.raw === '.' || x.raw === ',' || x.raw === ';' || x.raw === ':'));
      if(x.k === 'op' && x.raw === ',' && run.length) { /* čárka za výrazem je text */ }
      if(isText){
        flush();
        out += (x.sp ? ' ' : '') + (x.k === 'group' ? '(' + txRaw(x.items) + ')' + (x.pow || '') : x.raw);
      } else run.push(x);
    });
    flush();
    return out;
  }
  function texifySafe(html){
    try{ if(window.katex) return texify(html); }catch(e){ if(window.console) console.warn('texify', html, e); }
    return html;
  }


  function escapeHtml(t){ return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // Složí řešení: vlevo Dáno/Hledáme (jen když je co ukázat), vpravo řádky postupu a orámovaná odpověď.
  function html(o){
    var steps = [], fmt = o.plain ? escapeHtml : texifySafe;
    (o.steps || []).forEach(function(l){ String(l).split('\n').forEach(function(x){ if(x.trim() !== '') steps.push(x); }); });
    var hasLeft = (o.given && o.given.length) || (o.find && o.find.length);
    var out = '<div class="sol-grid' + (hasLeft ? '' : ' sol-single') + '">';
    if(hasLeft){
      out += '<div class="sol-given">';
      if(o.given && o.given.length) out += '<h4>Dáno</h4>' + o.given.map(function(g){ return '<div>' + fmt(g) + '</div>'; }).join('');
      if(o.find && o.find.length) out += '<h4' + (o.given && o.given.length ? ' class="sol-find-title"' : '') + '>Hledáme</h4>' + o.find.map(function(g){ return '<div>' + fmt(g) + '</div>'; }).join('');
      out += '</div>';
    }
    out += '<div class="sol-work"><h4>Řešení</h4><div class="sol-steps">' +
      steps.map(function(l){ return '<div class="eq">' + fmt(l) + '</div>'; }).join('') + '</div>';
    if(o.final) out += '<div class="sol-final">' + o.final + '</div>';
    if(o.note) out += '<div class="sol-note">' + o.note + '</div>';
    return out + '</div></div>';
  }

  // Označí odpověď jako „řešení“ (spustí styl .feedback.sol) a vloží do ní složené řešení.
  function show(feedbackEl, stepsEl, o){
    feedbackEl.classList.add('sol');
    stepsEl.innerHTML = html(o);
  }

  window.FyzikaReseni = { texify:texifySafe, html:html, show:show };
})();
