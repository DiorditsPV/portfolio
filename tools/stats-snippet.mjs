// Счётчик посещений: самостоятельный GoatCounter v2.7.0 отвечает на этом же домене под /stats/.
// Путь относительный, чтобы запрос шёл на тот же домен: сайт не делает внешних запросов.
// Перед загрузкой count.js отсекаем то, чего он сам не отсекает до запроса:
//   — file:// и локальные адреса: скрипта там нет, получился бы 404 в консоли превью;
//   — автоматические браузеры: count.js лишь помечает их (b=153) и всё равно шлёт запрос на сервер.
// Отключение на своём устройстве (#toggle-goatcounter, ключ skipgc) делает сам count.js.
// Скрипт вставляется динамически и ничего не меняет в вёрстке.
export const STATS_SNIPPET = `<script>(function(){var l=location;if(!/^https?:$/.test(l.protocol)||/^(localhost|127\\.|0\\.0\\.0\\.0$|10\\.|192\\.168\\.)/.test(l.hostname)||navigator.webdriver||/Headless/.test(navigator.userAgent))return;var s=document.createElement('script');s.async=true;s.dataset.goatcounter='/stats/count';s.src='/stats/count.js';document.head.appendChild(s)})()</script>`;
