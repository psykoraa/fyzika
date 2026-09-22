/*
 * Fyzika — klientská část přihlašování a ukládání výsledků.
 *
 * Neobsahuje žádné tajemství ani oprávnění: vše podstatné kontroluje server (Apps Script).
 * Údaje o uživateli (jméno, role) jsou zde jen pro zobrazení — server roli vždy ověřuje sám.
 *
 * Vložení do stránky (do <head>, před skripty stránky):
 *   <script src="config.js"></script>
 *   <script src="auth.js"></script>
 *
 * Když backend nefunguje nebo není nastaven, web běží dál a výsledky zůstávají v localStorage.
 */
(function () {
  'use strict';

  var CFG = window.FYZIKA_CONFIG || {};
  var API_URL = String(CFG.API_URL || '').trim();
  var ENABLED = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(API_URL);
  var ATTEMPT_TIMEOUT_MS = 20000; // úspěšný dotaz trvá obvykle 1–8 s; "ztracený" visí 30–60 s
  var PUBLIC_ACTIONS = { login: 1, registerStart: 1, registerFinish: 1, resetStart: 1, resetFinish: 1, getPageConfig: 1 };
  var RE_LOCAL_PAGE = /^[a-z0-9-]+\.html$/;

  var K = {
    token: 'fyzika-auth-token',
    user: 'fyzika-auth-user',
    pages: 'fyzika-page-config',
    owner: 'fyzika-scores-owner',
    results: 'fyzika-my-results'
  };

  // Kde si jednotlivé aplety drží nejlepší výsledky v localStorage.
  // d = disciplína na serveru, key = klíč v localStorage, field = položka v uloženém JSON objektu.
  var SCORE_MAP = {
    'prevody-jednotek.html': [
      { d: 'serie', key: 'fyzika:prevody-jednotek:stats', field: 'bestStreak' },
      { d: 'hra-60s', key: 'fyzika:prevody-jednotek:game-bests', field: '60' },
      { d: 'hra-120s', key: 'fyzika:prevody-jednotek:game-bests', field: '120' },
      { d: 'hra-180s', key: 'fyzika:prevody-jednotek:game-bests', field: '180' },
      { d: 'hra-300s', key: 'fyzika:prevody-jednotek:game-bests', field: '300' }
    ],
    'skladani-vektoru.html': [
      { d: 'serie', key: 'fyzika:skladani-vektoru:stats', field: 'bestStreak' },
      { d: 'hra-60s', key: 'fyzika:skladani-vektoru:game-bests', field: '60' },
      { d: 'hra-120s', key: 'fyzika:skladani-vektoru:game-bests', field: '120' },
      { d: 'hra-180s', key: 'fyzika:skladani-vektoru:game-bests', field: '180' },
      { d: 'hra-300s', key: 'fyzika:skladani-vektoru:game-bests', field: '300' }
    ],
    'kalkulacka-fx82cex.html': [
      { d: 'serie', key: 'fyzika:kalkulacka-fx82cex:stats', field: 'bestStreak' },
      { d: 'hra-60s', key: 'fyzika:kalkulacka-fx82cex:game-bests', field: '60' },
      { d: 'hra-120s', key: 'fyzika:kalkulacka-fx82cex:game-bests', field: '120' },
      { d: 'hra-180s', key: 'fyzika:kalkulacka-fx82cex:game-bests', field: '180' },
      { d: 'hra-300s', key: 'fyzika:kalkulacka-fx82cex:game-bests', field: '300' }
    ],
    'zaokrouhlovani-vysledku.html': [
      { d: 'serie', key: 'fyzika:zaokrouhlovani-vysledku:stats', field: 'bestStreak' }
    ],
    'zpracovani-mereni.html': [
      { d: 'serie', key: 'fyzika:zpracovani-mereni:stats', field: 'bestStreak' }
    ]
  };

  // ---------- localStorage (vždy v try/catch — může být zakázaný) ----------

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function lsJson(k) {
    try { var raw = lsGet(k); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }

  // Jednorázová migrace starých názvů klíčů (před sjednocením na "fyzika:stránka:druh" —
  // "meritko" byl název prevody-jednotek.html předtím, než dostala dnešní jméno; ostatní
  // klíče neměly společnou předponu vůbec). Běží synchronně hned při načtení auth.js
  // (v <head>, dřív než skript stránky vůbec začne číst svoje výsledky), takže žádný
  // pozdější kód už starý název nikdy neuvidí. Bezpečné volat opakovaně: když nový klíč
  // už existuje nebo starý neexistuje, nic nedělá.
  var OLD_SCORE_KEYS = [
    ['meritko-stats', 'fyzika:prevody-jednotek:stats'],
    ['meritko-game-bests', 'fyzika:prevody-jednotek:game-bests'],
    ['vektory-stats', 'fyzika:skladani-vektoru:stats'],
    ['vektory-game-bests', 'fyzika:skladani-vektoru:game-bests'],
    ['kalkulacka-fx82cex-stats', 'fyzika:kalkulacka-fx82cex:stats'],
    ['kalkulacka-fx82cex-game-bests', 'fyzika:kalkulacka-fx82cex:game-bests'],
    ['zaokrouhlovani-stats', 'fyzika:zaokrouhlovani-vysledku:stats'],
    ['zpracovani-mereni-stats', 'fyzika:zpracovani-mereni:stats']
  ];
  (function migrateScoreKeys() {
    OLD_SCORE_KEYS.forEach(function (pair) {
      if (lsGet(pair[1]) !== null) return;
      var old = lsGet(pair[0]);
      if (old === null) return;
      lsSet(pair[1], old);
      lsDel(pair[0]);
    });
  })();

  function currentPage() {
    var p = location.pathname.split('/').pop() || '';
    try { p = decodeURIComponent(p); } catch (e) {}
    return p || 'index.html';
  }

  // ---------- stav přihlášení ----------

  var netStatus = 'unknown'; // 'ok' | 'offline'
  var listeners = [];

  // Token a údaje o uživateli: při "Zůstat přihlášen" v localStorage (přežije zavření prohlížeče),
  // jinak v sessionStorage (zmizí se zavřením prohlížeče/karty). Server má navíc vlastní expiraci.
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  function ssDel(k) { try { sessionStorage.removeItem(k); } catch (e) {} }
  function sessionIsTemporary() { return !!ssGet(K.token); }
  function authGet(k) { return sessionIsTemporary() ? ssGet(k) : lsGet(k); }

  function getToken() {
    var t = authGet(K.token);
    return t && /^[A-Za-z0-9_-]{43}$/.test(t) ? t : null;
  }
  function getUser() {
    if (!getToken()) return null;
    var u;
    try { u = JSON.parse(authGet(K.user) || 'null'); } catch (e) { u = null; }
    return u && typeof u === 'object' && u.id ? u : null;
  }
  function notify() {
    listeners.forEach(function (fn) { try { fn(getUser()); } catch (e) {} });
    renderBar();
  }
  function setSession(token, user, remember) {
    lsDel(K.token); lsDel(K.user); ssDel(K.token); ssDel(K.user);
    if (remember) { lsSet(K.token, token); lsSet(K.user, JSON.stringify(user)); }
    else { ssSet(K.token, token); ssSet(K.user, JSON.stringify(user)); }
    notify();
  }
  function setUser(user) {
    var before = authGet(K.user);
    var after = JSON.stringify(user);
    if (before === after) return;
    if (sessionIsTemporary()) ssSet(K.user, after); else lsSet(K.user, after);
    notify();
  }
  function clearSession() {
    var had = !!getToken();
    lsDel(K.token); lsDel(K.user); ssDel(K.token); ssDel(K.user);
    lsDel(K.results); ssDel(K.results);
    if (had) notify();
  }
  function setNetStatus(s) {
    if (netStatus !== s) { netStatus = s; renderBar(); }
  }

  // ---------- volání API ----------

  function apiError(code, message) {
    var e = new Error(message || code);
    e.code = code;
    return e;
  }

  // Apps Script občas dotaz "ztratí": po desítkách sekund vrátí chybovou stránku Googlu (404),
  // případně odpověď pro GET. Úspěšné dotazy přitom trvají pár sekund. Proto se každý pokus
  // vzdá po ATTEMPT_TIMEOUT_MS a dotaz se zopakuje. Každé volání nese náhodné "rid" — server si
  // odpověď k němu 2 minuty pamatuje, takže opakovaný dotaz se NEPROVEDE podruhé (ani zápis,
  // přihlášení nebo registrace), jen se vrátí stejná odpověď.
  var MAX_RETRIES = 3;

  function newRid() {
    var a = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(a);
    var s = '';
    for (var i = 0; i < a.length; i++) s += ('0' + a[i].toString(16)).slice(-2);
    return s; // 32 hex znaků
  }

  function api(action, data) {
    if (!ENABLED) return Promise.reject(apiError('disabled', 'Přihlašování zatím není nastavené.'));
    var body = {};
    if (data) for (var k in data) if (Object.prototype.hasOwnProperty.call(data, k)) body[k] = data[k];
    body.action = action;
    var token = getToken();
    if (token && !PUBLIC_ACTIONS[action] && body.token === undefined) body.token = token;
    body.rid = newRid();
    var payload = JSON.stringify(body);

    function attempt(n) {
      return callOnce(action, payload, ATTEMPT_TIMEOUT_MS).then(null, function (err) {
        if (n >= MAX_RETRIES) throw err;
        if (window.console) console.warn('[FyzikaAuth] ' + action + ': opakuji (' + (n + 1) + '/' + MAX_RETRIES + ')');
        return new Promise(function (resolve) { setTimeout(resolve, 1000 * (n + 1)); })
          .then(function () { return attempt(n + 1); });
      });
    }

    return attempt(0).then(function (res) {
      if (!res || typeof res !== 'object') throw apiError('network', 'Neplatná odpověď serveru.');
      if (res.ok) return res;
      if (body.token && (res.error === 'auth_required' || res.error === 'session_expired' || res.error === 'inactive')) {
        clearSession();
      }
      if (res.error === 'password_change_required') goToPasswordChange();
      throw apiError(res.error || 'error', res.message || 'Neznámá chyba.');
    });
  }

  // Jeden pokus o volání. Chyba má kind: 'timeout' | 'glitch' (Google vrátil nesmysl) | 'offline'.
  function callOnce(action, payload, timeoutMs) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timedOut = false;
    var timer = setTimeout(function () { timedOut = true; if (ctrl) ctrl.abort(); }, timeoutMs);
    var glitch = function (msg) { var e = new Error(msg); e.kind = 'glitch'; return e; };

    // text/plain = "jednoduchý" požadavek bez CORS preflightu, který Apps Script neumí.
    return fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: payload,
      redirect: 'follow',
      credentials: 'omit',
      cache: 'no-store',
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      if (!r.ok) throw glitch('HTTP ' + r.status);
      return r.text().then(function (text) {
        var res;
        try { res = JSON.parse(text); } catch (e) {
          // Typicky HTML stránka od Googlu (404, chybí autorizace, špatné nasazení…).
          throw glitch('Server nevrátil JSON: ' + text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 200));
        }
        if (!res || typeof res !== 'object') throw glitch('Neplatná odpověď serveru.');
        // Odpověď z doGet = Google požadavek cestou změnil na GET a akce se neprovedla.
        if (res.service === 'fyzika-api' && res.error === undefined) throw glitch('Server vrátil odpověď pro GET.');
        return res;
      });
    }).then(function (res) {
      clearTimeout(timer);
      setNetStatus('ok');
      return res;
    }, function (err) {
      clearTimeout(timer);
      var kind = timedOut ? 'timeout' : (err && err.kind === 'glitch' ? 'glitch' : 'offline');
      if (kind !== 'glitch') setNetStatus('offline');
      // Detail do konzole (F12) pro diagnostiku — neobsahuje heslo ani token.
      if (window.console) console.warn('[FyzikaAuth] ' + action + ': ' + (timedOut ? 'vypršel časový limit' : (err && err.message)));
      var e = kind === 'timeout'
        ? apiError('network', 'Server neodpověděl včas. Zkuste to prosím znovu.')
        : kind === 'glitch'
          ? apiError('network', 'Server Googlu teď neodpověděl správně. Zkuste to prosím znovu.')
          : apiError('network', 'Nepodařilo se spojit se serverem. Zkuste to prosím později.');
      e.kind = kind;
      throw e;
    });
  }

  function goToPasswordChange() {
    if (currentPage() !== 'prihlaseni.html') location.href = 'prihlaseni.html?zmena=1';
  }

  function withTimeout(promise, ms) {
    return Promise.race([promise, new Promise(function (resolve) { setTimeout(resolve, ms); })]);
  }

  // ---------- přihlášení / registrace / odhlášení ----------

  function afterLogin(user) {
    if (user.mustChangePassword) return Promise.resolve(user);
    return withTimeout(syncAll().catch(function () {}), 8000).then(function () { return user; });
  }

  function login(username, password, remember) {
    remember = remember === true;
    return api('login', { username: username, password: password, remember: remember }).then(function (res) {
      setSession(res.token, res.user, remember);
      return afterLogin(res.user);
    });
  }

  // Registrace krok 1: server ověří údaje a pošle na školní e-mail ověřovací kód.
  function registerStart(email, jmeno, trida) {
    return api('registerStart', { email: email, jmeno: jmeno, trida: trida });
  }

  // Registrace krok 2: ověření kódu z e-mailu a založení účtu (rovnou přihlásí).
  function registerFinish(email, kod, jmeno, trida, password, remember) {
    remember = remember === true;
    return api('registerFinish', { email: email, kod: kod, jmeno: jmeno, trida: trida, password: password, remember: remember }).then(function (res) {
      setSession(res.token, res.user, remember);
      return afterLogin(res.user);
    });
  }

  // Zapomenuté heslo, krok 1: server pošle na školní e-mail kód pro nastavení nového hesla.
  // Odpověď je záměrně stejná, ať už účet na dané adrese existuje, nebo ne (neprozrazuje,
  // kdo je registrovaný): { ok: true, email: '…@gym-kt.cz', validMinutes: 15 }.
  function resetStart(email) {
    return api('resetStart', { email: email });
  }

  // Zapomenuté heslo, krok 2: ověření kódu z e-mailu a nastavení nového hesla.
  // Server vrací { ok: true, token, user } stejně jako login — uživatel je rovnou přihlášen;
  // ostatní zařízení server odhlásí a případné "mustChangePassword" zruší.
  function resetFinish(email, kod, password, remember) {
    remember = remember === true;
    return api('resetFinish', { email: email, kod: kod, password: password, remember: remember }).then(function (res) {
      setSession(res.token, res.user, remember);
      return afterLogin(res.user);
    });
  }

  function forgetLocalData() {
    // Na sdíleném počítači nesmí výsledky zůstat dalšímu uživateli — jsou uložené v cloudu.
    wipeLocalScores();
    lsDel(K.owner);
    clearSession();
  }

  function logout() {
    var token = getToken();
    flush(false);
    var p = token ? withTimeout(api('logout', { token: token }).catch(function () {}), 5000) : Promise.resolve();
    return p.then(forgetLocalData);
  }

  // Trvalé smazání vlastního účtu (server vyžaduje heslo).
  function deleteMyAccount(password) {
    queue = [];
    return api('deleteMyAccount', { password: password }).then(function () {
      forgetLocalData();
    });
  }

  function changePassword(oldPassword, newPassword) {
    return api('changePassword', { oldPassword: oldPassword, newPassword: newPassword }).then(function (res) {
      setUser(res.user);
      return afterLogin(res.user);
    });
  }

  function refreshMe() {
    if (!getToken()) return Promise.resolve(null);
    return api('me').then(function (res) { setUser(res.user); return res.user; });
  }

  // ---------- výsledky ----------

  function readLocal(e) {
    var o = lsJson(e.key);
    if (!o || typeof o !== 'object') return null;
    var v = o[e.field];
    return typeof v === 'number' && isFinite(v) ? Math.trunc(v) : null;
  }
  function writeLocal(e, val) {
    var o = lsJson(e.key);
    if (!o || typeof o !== 'object' || Array.isArray(o)) o = {};
    o[e.field] = val;
    lsSet(e.key, JSON.stringify(o));
  }
  function wipeLocalScores() {
    Object.keys(SCORE_MAP).forEach(function (p) {
      SCORE_MAP[p].forEach(function (e) { lsDel(e.key); });
    });
  }
  function announceScores(page) {
    try {
      document.dispatchEvent(new CustomEvent('fyzika:scores-updated', { detail: { page: page } }));
    } catch (e) {}
  }

  var lastResults = null;

  // Sloučí lokální a serverové nejlepší výsledky (platí vyšší) pro zadané stránky.
  function sync(pages) {
    var user = getUser();
    if (!ENABLED || !user || user.mustChangePassword) return Promise.resolve(false);
    var here = currentPage();
    var owner = lsGet(K.owner);
    var wiped = false;
    if (owner && owner !== user.id) {
      // Lokální výsledky patří jinému účtu (sdílený počítač) — nenahrávat je.
      wipeLocalScores();
      wiped = true;
    }
    lsSet(K.owner, user.id);

    return loadMyAccount().then(function () {
      var server = {};
      lastResults.forEach(function (r) { server[r.page + '|' + r.discipline] = r; });
      var push = [];
      var touchedHere = wiped;
      pages.forEach(function (page) {
        (SCORE_MAP[page] || []).forEach(function (e) {
          var local = readLocal(e);
          var sr = server[page + '|' + e.d];
          var sb = sr && typeof sr.best === 'number' ? sr.best : null;
          if (sb !== null && sb > 0 && (local === null || sb > local)) {
            writeLocal(e, sb);
            if (page === here) touchedHere = true;
          } else if (local !== null && local > 0 && (sb === null || local > sb)) {
            push.push({ page: page, discipline: e.d, score: local, attempt: false });
          }
        });
      });
      if (touchedHere) announceScores(here);
      if (!push.length) return true;
      return sendResults(push.slice(0, 20)).then(function () { return true; }, function () { return true; });
    }, function (err) {
      if (wiped) announceScores(here);
      throw err;
    });
  }

  function syncAll() { return sync(Object.keys(SCORE_MAP)); }

  function sendResults(items) {
    return api('saveResult', { results: items }).then(function (res) {
      lastResults = res.results || lastResults;
      var u = getUser();
      if (u && res.results) cacheMyResults(u, res.results);
      return res;
    });
  }

  var queue = [];
  var flushTimer = null;

  // Volá aplet, když padne nový nejlepší výsledek (attempt=false) nebo skončí hra (attempt=true).
  // Lokální uložení řeší aplet sám; sem jde jen kopie do cloudu. Chyby se tiše ignorují —
  // při příští synchronizaci se nejlepší lokální výsledek dorovná.
  function report(discipline, score, attempt) {
    try {
      if (!ENABLED) return;
      var user = getUser();
      if (!user || user.mustChangePassword) return;
      var page = currentPage();
      if (!SCORE_MAP[page]) return;
      score = Math.trunc(Number(score));
      if (!isFinite(score)) return;
      lsSet(K.owner, user.id);
      attempt = attempt === true;
      var existing = null;
      if (!attempt) {
        for (var i = 0; i < queue.length; i++) {
          if (!queue[i].attempt && queue[i].page === page && queue[i].discipline === discipline) existing = queue[i];
        }
      }
      if (existing) existing.score = Math.max(existing.score, score);
      else queue.push({ page: page, discipline: String(discipline), score: score, attempt: attempt });
      clearTimeout(flushTimer);
      // Série se mění při každé správné odpovědi — posíláme až po chvíli klidu.
      flushTimer = setTimeout(function () { flush(false); }, attempt ? 300 : 4000);
    } catch (e) {}
  }

  function flush(useBeacon) {
    clearTimeout(flushTimer);
    if (!queue.length || !ENABLED) return;
    var token = getToken();
    if (!token) { queue = []; return; }
    var batch = queue.splice(0, 20);
    if (useBeacon && navigator.sendBeacon) {
      try {
        var blob = new Blob([JSON.stringify({ action: 'saveResult', token: token, results: batch })], { type: 'text/plain;charset=utf-8' });
        if (navigator.sendBeacon(API_URL, blob)) return;
      } catch (e) {}
    }
    sendResults(batch).catch(function () {});
  }

  window.addEventListener('pagehide', function () { flush(true); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flush(true);
  });

  // ---------- konfigurace stránek ("soft" skrývání) ----------

  function cachedPageConfig() {
    var c = lsJson(K.pages);
    return c && c.cfg && Array.isArray(c.cfg.pages) ? c.cfg : null;
  }

  // Uloží konfiguraci z odpovědi serveru (getPageConfig i getMyResults ji obsahují).
  function storePageConfig(res) {
    if (!res || !Array.isArray(res.pages)) return null;
    var cfg = { pages: res.pages, disciplines: res.disciplines || [] };
    lsSet(K.pages, JSON.stringify({ t: Date.now(), cfg: cfg }));
    return cfg;
  }

  function fetchPageConfig() {
    return api('getPageConfig').then(storePageConfig);
  }

  // Poslední známé výsledky přihlášeného uživatele — pro okamžité zobrazení na stránce účtu.
  // Ukládají se tam, kde je token (při "nezůstat přihlášen" jen do zavření prohlížeče).
  function cacheMyResults(user, results) {
    var v = JSON.stringify({ uid: user.id, t: Date.now(), results: results || [] });
    if (sessionIsTemporary()) ssSet(K.results, v); else lsSet(K.results, v);
  }
  function cachedMyResults() {
    var user = getUser();
    if (!user) return null;
    var c;
    try { c = JSON.parse(authGet(K.results) || 'null'); } catch (e) { c = null; }
    return c && c.uid === user.id && Array.isArray(c.results) ? c : null;
  }

  // Jeden dotaz: ověří přihlášení a vrátí uživatele, výsledky i konfiguraci stránek.
  function loadMyAccount() {
    return api('getMyResults').then(function (res) {
      if (res.user) setUser(res.user);
      var cfg = storePageConfig(res) || cachedPageConfig() || { pages: [], disciplines: [] };
      lastResults = res.results || [];
      if (res.user) cacheMyResults(res.user, lastResults);
      return { user: res.user, results: lastResults, cfg: cfg };
    });
  }

  function pageEntry(cfg, file) {
    if (!cfg) return null;
    for (var i = 0; i < cfg.pages.length; i++) if (cfg.pages[i].file === file) return cfg.pages[i];
    return null;
  }

  // Pozor: jde jen o pohodlí, ne o ochranu obsahu — HTML je veřejné.
  // Skrytá stránka se nenačte prázdná ani nepřesměruje: obsah se překryje oznámením
  // (setBlocked). Vrací true, když se stránka nemá dál zpracovávat.
  function gate(cfg) {
    var e = pageEntry(cfg, currentPage());
    var user = getUser();
    if (!e || (user && user.role === 'admin')) { setBlocked(false); return false; }
    if (!e.visible) { setBlocked(true); return true; }
    setBlocked(false);
    if (e.requiresLogin && !user) {
      // Tady přesměrování dává smysl — po přihlášení se student vrátí zpět.
      location.replace('prihlaseni.html?dalsi=' + encodeURIComponent(currentPage()));
      return true;
    }
    return false;
  }

  // Překryv přes celou stránku. Volá se i dřív, než existuje <body> (auth.js běží v <head>),
  // proto se obsah schová třídou na <html> hned a samotné oznámení se doplní, jakmile je kam.
  var blockScreen = null;

  function setBlocked(on) {
    var root = document.documentElement;
    if (!on) {
      if (!root.classList.contains('fz-blocked')) return;
      root.classList.remove('fz-blocked');
      if (blockScreen && blockScreen.parentNode) blockScreen.parentNode.removeChild(blockScreen);
      blockScreen = null;
      return;
    }
    if (root.classList.contains('fz-blocked')) return;
    root.classList.add('fz-blocked');
    if (document.body) renderBlocked();
    else document.addEventListener('DOMContentLoaded', renderBlocked);
  }

  function renderBlocked() {
    // Mezitím mohla dorazit čerstvá konfigurace a stránku zase odemknout.
    if (blockScreen || !document.body || !document.documentElement.classList.contains('fz-blocked')) return;
    blockScreen = el('div', { 'class': 'fz-block', role: 'alert' });
    var card = el('div', { 'class': 'fz-block-card' });
    card.appendChild(el('h1', null, 'Stránka není dostupná'));
    card.appendChild(el('p', null, 'Tuhle stránku vyučující dočasně skryl. Zkuste to prosím později.'));
    card.appendChild(el('a', { href: 'index.html' }, '← Zpět na rozcestník'));
    blockScreen.appendChild(card);
    document.body.appendChild(blockScreen);
  }

  function applyLinks(cfg) {
    if (!cfg || !document.body) return;
    var user = getUser();
    var isAdmin = !!(user && user.role === 'admin');
    var anchors = document.querySelectorAll('a[href]');
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      if (a.classList.contains('back-link') || a.closest('.fz-acct')) continue;
      var href = (a.getAttribute('href') || '').split('#')[0].split('?')[0];
      if (!RE_LOCAL_PAGE.test(href)) continue;
      var e = pageEntry(cfg, href);
      var hidden = !!(e && !e.visible);
      a.classList.toggle('fz-hidden', hidden && !isAdmin);
      a.classList.toggle('fz-admin-hidden', hidden && isAdmin);
      if (hidden && isAdmin) a.setAttribute('title', 'Skryto pro studenty (vidíte jako admin)');
      else if (a.getAttribute('title') === 'Skryto pro studenty (vidíte jako admin)') a.removeAttribute('title');
    }
    // Karta, ve které jsou skryté všechny odkazy, se skryje celá.
    var cards = document.querySelectorAll('.card');
    for (var j = 0; j < cards.length; j++) {
      var links = cards[j].querySelectorAll('a.btn');
      if (!links.length) continue;
      var allHidden = true;
      for (var k = 0; k < links.length; k++) if (!links[k].classList.contains('fz-hidden')) allHidden = false;
      cards[j].classList.toggle('fz-hidden', allHidden);
    }
  }

  // ---------- hlavička "přihlášen jako…" ----------

  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function sep() { return el('span', { 'class': 'fz-sep', 'aria-hidden': 'true' }, '·'); }

  function renderBar() {
    if (!ENABLED || !document.body || document.body.hasAttribute('data-fz-nobar')) return;
    var wrap = document.querySelector('.wrap');
    if (!wrap) return;
    var bar = document.getElementById('fz-acct');
    if (!bar) {
      bar = el('div', { id: 'fz-acct', 'class': 'fz-acct' });
      wrap.insertBefore(bar, wrap.firstChild);
    }
    bar.textContent = '';
    var user = getUser();
    var here = currentPage();
    if (!user) {
      var loginHref = 'prihlaseni.html' + (RE_LOCAL_PAGE.test(here) && here !== 'prihlaseni.html' ? '?dalsi=' + encodeURIComponent(here) : '');
      bar.appendChild(el('a', { href: loginHref }, 'Přihlásit se'));
      return;
    }
    var who = el('a', { href: 'prihlaseni.html', 'class': 'fz-user', title: 'Můj účet' });
    var dot = el('span', { 'class': 'fz-dot' + (netStatus === 'ok' ? ' ok' : netStatus === 'offline' ? ' offline' : '') });
    dot.title = netStatus === 'offline'
      ? 'Server je nedostupný — výsledky se zatím ukládají jen v tomto prohlížeči.'
      : 'Výsledky se ukládají do cloudu.';
    who.appendChild(dot);
    who.appendChild(document.createTextNode((user.name || user.username) + (user.className ? ' (' + user.className + ')' : '')));
    bar.appendChild(who);
    if (user.mustChangePassword) {
      bar.appendChild(sep());
      bar.appendChild(el('a', { href: 'prihlaseni.html?zmena=1', 'class': 'fz-warn' }, 'Změňte heslo'));
    }
    if (user.role === 'admin') {
      bar.appendChild(sep());
      bar.appendChild(el('a', { href: 'admin.html' }, 'Administrace'));
    }
    bar.appendChild(sep());
    var out = el('button', { type: 'button' }, 'Odhlásit');
    out.addEventListener('click', function () {
      out.disabled = true;
      logout().then(function () {
        if (here === 'admin.html') location.href = 'index.html';
        else location.reload();
      });
    });
    bar.appendChild(out);
  }

  // Na skrytou stránku se od této verze nepřesměrovává; zůstává kvůli starším odkazům
  // a otevřeným kartám, které na index.html?skryto=1 ještě míří.
  function showHiddenNotice() {
    if (!/[?&]skryto=1\b/.test(location.search)) return;
    var wrap = document.querySelector('.wrap');
    if (!wrap) return;
    var n = el('div', { 'class': 'fz-notice', role: 'status' }, 'Stránka, kterou jste chtěli otevřít, teď není dostupná.');
    var bar = document.getElementById('fz-acct');
    wrap.insertBefore(n, bar ? bar.nextSibling : wrap.firstChild);
  }

  function injectCss() {
    var css =
      '.fz-acct{float:right;display:flex;align-items:center;flex-wrap:wrap;justify-content:flex-end;gap:2px 8px;' +
      'margin:0 0 8px 16px;font-family:"Work Sans",system-ui,sans-serif;font-size:0.8rem;line-height:1.45;color:var(--ink-soft,#5b7080);}' +
      '.fz-acct a,.fz-acct button{font:inherit;font-weight:500;color:var(--ink-soft,#5b7080);background:none;border:0;padding:0;margin:0;cursor:pointer;text-decoration:none;}' +
      '.fz-acct a:hover,.fz-acct button:hover{color:var(--accent,#1e5fa8);}' +
      '.fz-acct a:focus-visible,.fz-acct button:focus-visible{outline:2px solid var(--focus,#c9581f);outline-offset:2px;border-radius:3px;}' +
      '.fz-acct .fz-user{color:var(--ink,#1c2b3a);font-weight:600;display:inline-flex;align-items:center;}' +
      '.fz-acct .fz-warn{color:var(--danger,#b3392b);font-weight:600;}' +
      '.fz-sep{opacity:.45;}' +
      '.fz-dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:7px;background:var(--ink-soft,#5b7080);opacity:.45;}' +
      '.fz-dot.ok{background:var(--success,#1f7a5c);opacity:1;}' +
      '.fz-dot.offline{background:var(--danger,#b3392b);opacity:1;}' +
      '.fz-hidden{display:none !important;}' +
      '.fz-admin-hidden{opacity:.55;outline:1px dashed var(--ink-soft,#5b7080);outline-offset:2px;}' +
      '.fz-blocked body > *:not(.fz-block){display:none !important;}' +
      '.fz-block{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
      'padding:24px 16px;background:var(--paper,#eef2f6);z-index:2147483647;overflow:auto;}' +
      '.fz-block-card{max-width:440px;width:100%;box-sizing:border-box;text-align:center;' +
      'background:var(--surface,#fff);border:1px solid var(--line,rgba(28,43,58,0.12));border-radius:14px;padding:32px 28px;' +
      'font-family:"Work Sans",system-ui,sans-serif;color:var(--ink,#1c2b3a);}' +
      '.fz-block-card h1{margin:0 0 10px;font-family:"Big Shoulders Display",sans-serif;font-weight:800;' +
      'font-size:1.9rem;letter-spacing:0.02em;line-height:1.1;}' +
      '.fz-block-card p{margin:0 0 20px;font-size:0.95rem;line-height:1.5;color:var(--ink-soft,#5b7080);}' +
      '.fz-block-card a{display:inline-block;font-size:0.9rem;font-weight:600;color:var(--accent,#1e5fa8);text-decoration:none;}' +
      '.fz-block-card a:hover{text-decoration:underline;}' +
      '.fz-block-card a:focus-visible{outline:2px solid var(--focus,#c9581f);outline-offset:3px;border-radius:4px;}' +
      '.fz-notice{clear:both;background:var(--surface-2,#dbe4ee);border-left:4px solid var(--focus,#c9581f);border-radius:8px;' +
      'padding:12px 14px;margin:0 0 14px;font-size:0.88rem;color:var(--ink,#1c2b3a);}' +
      '@media (max-width:560px){.fz-acct{float:none;margin:0 0 10px;}}';
    var s = document.createElement('style');
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }

  // ---------- veřejné rozhraní ----------

  window.FyzikaAuth = {
    enabled: ENABLED,
    api: api,
    getUser: getUser,
    isLoggedIn: function () { return !!getUser(); },
    login: login,
    registerStart: registerStart,
    registerFinish: registerFinish,
    resetStart: resetStart,
    resetFinish: resetFinish,
    logout: logout,
    changePassword: changePassword,
    refreshMe: refreshMe,
    deleteMyAccount: deleteMyAccount,
    fetchPageConfig: fetchPageConfig,
    cachedPageConfig: cachedPageConfig,
    getLastResults: function () { return lastResults; },
    loadMyAccount: loadMyAccount,
    cachedMyResults: cachedMyResults,
    onChange: function (fn) { listeners.push(fn); },
    currentPage: currentPage,
    isLocalPage: function (p) { return RE_LOCAL_PAGE.test(String(p || '')); }
  };

  window.FyzikaScores = {
    report: report,
    sync: sync,
    syncAll: syncAll,
    pages: Object.keys(SCORE_MAP)
  };

  // ---------- start ----------

  injectCss();
  if (!ENABLED) return;

  // Okamžitě podle uložené konfigurace (bez čekání na síť), pak znovu podle čerstvé.
  // Zablokovaná stránka se nesmí zastavit tady: uložená konfigurace může být stará
  // a čerstvá ji zase odemkne, jakmile vyučující stránku znovu zpřístupní.
  var blocked = gate(cachedPageConfig());

  function start() {
    renderBar();
    showHiddenNotice();

    var applyFresh = function () {
      var cfg = cachedPageConfig();
      if (!cfg) return;
      blocked = gate(cfg);
      if (!blocked) applyLinks(cfg);
    };

    if (blocked) {
      fetchPageConfig().then(applyFresh).catch(function () {});
      return;
    }
    applyLinks(cachedPageConfig());

    // Stránky s vlastním načítáním (účet, administrace) si dotazy řídí samy — zbytečně je nezdvojovat.
    if (document.body && document.body.hasAttribute('data-fz-manual')) return;
    var here = currentPage();
    var user = getUser();
    if (user && !user.mustChangePassword && SCORE_MAP[here]) {
      // Přihlášený na stránce apletu: jeden dotaz vrátí výsledky i konfiguraci stránek.
      sync([here]).then(applyFresh, function () {
        fetchPageConfig().then(applyFresh).catch(function () {});
      });
      return;
    }
    fetchPageConfig().then(applyFresh).catch(function () {});
    if (getToken()) refreshMe().then(applyFresh).catch(function () {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
