/*
 * Veřejná konfigurace webu. NEPATŘÍ SEM ŽÁDNÉ TAJEMSTVÍ — tento soubor si může přečíst kdokoli.
 *
 * API_URL: adresa nasazené webové aplikace Google Apps Script (končí na /exec).
 * Dokud je prázdná, web funguje jako dřív (výsledky jen v tomto prohlížeči)
 * a prvek pro přihlášení se nezobrazuje.
 *
 * GOATCOUNTER_CODE: kód webu na goatcounter.com (z fyzika.goatcounter.com je to 'fyzika').
 * Dokud je prázdný, sledování návštěvnosti je vypnuté (viz statistika.js).
 */
window.FYZIKA_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbxyMBHYc127BaMt1oIxCsidyhrKtMNV8sNJBH-dmYyyZn1Wt1Z12cAwL-IWHAQmHfJJnQ/exec',
  GOATCOUNTER_CODE: ''
};
