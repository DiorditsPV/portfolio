// Публикует html-разбор в Журнал и пересобирает его ленту.
//
// Скилл present-html кладёт пару <name>.md + <name>.html в ~/dev/docs/<тема>/ —
// там источник правды содержания и всё, что публиковать не нужно. На сайт файл
// попадает только этой командой: публикация — осознанный шаг, а не побочный
// эффект генерации. Иначе рабочие документы из ~/dev/docs/rabota/ однажды уехали
// бы на публичный адрес.
//
//   node tools/publish-presentation.mjs <файл.html> --slug <slug> --topic <тема> \
//        --desc "…" [--series "…"] [--tag тег]… [--date YYYY-MM-DD] [--lang en]
//        [--feature] [--pick] [--unlisted]
//   node tools/publish-presentation.mjs --unpublish <slug>
//   node tools/publish-presentation.mjs --rebuild
//
// Что делает публикация:
//   1. проверяет файл (см. предполётный контроль ниже) и копирует в presentations/;
//   2. считает время просмотра и вытаскивает заголовки разделов — они лежат в
//      реестре как ключевые слова записи;
//   3. рисует обложку-заглушку presentations/covers/<slug>.svg;
//   4. дописывает в копию og-теги, кнопку возврата, снятие повышенного контраста
//      и подвал «ещё по теме» между маркерами — исходник в ~/dev/docs не трогается;
//   5. заносит запись в presentations.json — реестр в репозитории, который браузер
//      никогда не грузит: это исходник сборки, а не данные страницы;
//   6. пересобирает ленту presentations/index.html и presentations/rss.xml,
//      обновляет блок последних записей на главной и переписывает в deploy.manifest
//      блок под маркером, не трогая строки выше.
//
// Дальше — обычный git push: выкладку делает .github/workflows/deploy.yml.
//
// Статусы из замысла раскладываются так: «черновик» и «приватная» — это файл,
// который просто не публиковали, он остаётся в ~/dev/docs; «по ссылке» — флаг
// --unlisted: страница уезжает на сервер и открывается по прямому адресу, но в
// журнале не показывается. Счётчика просмотров и режима владельца в браузере
// нет и быть не может: сайт — статические файлы на nginx, без бэкенда и авторизации.
//
// Зависимостей нет, сборки нет — как и у остального репозитория.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { coverSvg } from './cover.mjs';
import { journalPage, humanDate, plural, JOURNAL_TITLE, JOURNAL_ABOUT } from './journal-page.mjs';
import { rssFeed } from './rss.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'presentations');
const COVERS = path.join(DIR, 'covers');
const REGISTRY = path.join(ROOT, 'presentations.json');
const MANIFEST = path.join(ROOT, 'deploy.manifest');
const SITE_PAGE = path.join(ROOT, 'index.html');

// Всё ниже этой строки в манифесте принадлежит скрипту и переписывается целиком.
const MARK = '# ─── презентации: блок ниже переписывает tools/publish-presentation.mjs ───';

// Адрес журнала. Сегодня это подкаталог основного сайта; когда на сервере
// появится vhost presentations.paveldiordits.site с root на этот же каталог,
// достаточно поменять строку здесь и прогнать --rebuild.
const BASE = 'https://paveldiordits.site/presentations/';
const SITE = 'https://paveldiordits.site/';

const AUTHOR = {
  name: 'Павел Диордиц',
  email: 'diordic@gmail.com',
};

// Сколько записей показывает блок журнала на главной. Три ложатся в ряд на
// широком экране и не превращают главную в ленту — за лентой посетитель идёт сюда.
const ON_HOME = 3;

// Направления журнала. Цвет работает маркером темы в строке записи и на обложке.
// Пустые направления на странице не показываются, поэтому список может опережать
// содержание — заводить тему заранее не вредно.
const TOPICS = [
  { id: 'data-engineering', ru: 'Data Engineering', color: '#0e9f8f' },
  { id: 'ai',               ru: 'AI и агенты',      color: '#7c5cff' },
  { id: 'dev',              ru: 'Разработка',       color: '#4c5cff' },
  { id: 'product',          ru: 'Личные проекты',   color: '#2f6bff' },
  { id: 'career',           ru: 'Карьера',          color: '#b87a12' },
  { id: 'health',           ru: 'Здоровье',         color: '#1e9450' },
  { id: 'travel',           ru: 'Путешествия',      color: '#c93f70' },
];

// Полки журнала. Порядок здесь — порядок разделов на странице. Полка задаётся
// либо серией (несколько выпусков одного замысла), либо направлением — тогда в
// неё попадает всё из этого направления, что не входит ни в одну серию.
// Пустые полки не выводятся, поэтому список может опережать содержание.
const GROUPS = [
  {
    series: 'Product Lab', ru: 'Product Lab',
    note: 'Одна продуктовая лаборатория: исследование, из которого выросла её модель фич, и карта её процессов.',
  },
  {
    series: 'Agents Weekly', ru: 'Agents Weekly',
    note: 'Дайджест агент-экосистемы по расписанию. Каждый выпуск закрывает своё окно наблюдения и не повторяет сюжеты прошлых прогонов, поэтому выпуски читаются подряд, а не выборочно.',
  },
  {
    series: 'Разборы репозиториев', ru: 'Разборы репозиториев и скилл-паков',
    note: 'Чужие репозитории, плагины и паки скиллов под микроскопом: что внутри на самом деле, чего это стоит и что забрать себе. Каждый разбор — слепок на дату.',
  },
  {
    topic: 'ai', ru: 'Агентная разработка',
    note: 'Разовые разборы инструментов и трендов — не серия, а срез на дату.',
  },
];

// Скорость чтения плотного технического текста по-русски. Не выдуманная точность:
// показываем округлённо и называем «минуты», а не «время чтения ±10 секунд».
const WPM = 160;

const die = m => { console.error(`ОШИБКА: ${m}`); process.exit(1); };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ── аргументы ────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const a = { tags: [] };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    const val = () => argv[++i] ?? die(`у ${v} нет значения`);
    if (v === '--slug') a.slug = val();
    else if (v === '--title') a.title = val();
    else if (v === '--topic') a.topic = val();
    else if (v === '--series') a.series = val();
    else if (v === '--desc') a.desc = val();
    else if (v === '--desc-en') a.descEn = val();
    else if (v === '--date') a.date = val();
    else if (v === '--lang') a.lang = val();
    else if (v === '--tag') a.tags.push(val());
    else if (v === '--feature') a.feature = true;
    else if (v === '--pick') a.pick = true;
    else if (v === '--unlisted') a.unlisted = true;
    else if (v === '--unpublish') a.unpublish = val();
    else if (v === '--rebuild') a.rebuild = true;
    else if (v.startsWith('--')) die(`неизвестный ключ ${v}`);
    else rest.push(v);
  }
  a.file = rest[0];
  return a;
}

// ── реестр ───────────────────────────────────────────────────────────────────
const loadRegistry = () =>
  fs.existsSync(REGISTRY) ? JSON.parse(fs.readFileSync(REGISTRY, 'utf8')) : { presentations: [] };

const saveRegistry = r => {
  // новые сверху — в этом же порядке страница показывает их по умолчанию
  r.presentations.sort((x, y) => (y.date || '').localeCompare(x.date || '') || x.slug.localeCompare(y.slug));
  fs.writeFileSync(REGISTRY, JSON.stringify(r, null, 2) + '\n');
};

// ── разбор исходной страницы ─────────────────────────────────────────────────
const stripped = html => html
  .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&[a-z]+;|&#\d+;/gi, ' ');

const readMinutes = html => Math.max(1, Math.round(stripped(html).split(/\s+/).filter(Boolean).length / WPM));

// Заголовки разделов — то, по чему имеет смысл искать: они называют содержание
// страницы, а тащить в индекс её текст целиком значило бы вшить в галерею мегабайты.
const headings = html => [...html.matchAll(/<h[23][^>]*>([\s\S]{0,200}?)<\/h[23]>/gi)]
  .map(m => m[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())
  .filter(t => t && t.length < 120)
  .slice(0, 40);

// ── дописки в копию ──────────────────────────────────────────────────────────
// Копия в репозитории — не буквальный дубль исходника: в неё добавляются og-теги
// (иначе ссылка в телеграме выглядит голой) и подвал с возвратом в библиотеку.
// Всё между маркерами; перед каждой сборкой старая вставка вырезается, поэтому
// пересборка не наслаивает блоки и не требует исходного файла.
const HEAD_A = '<!--general:head-->', HEAD_B = '<!--/general:head-->';
const TOP_A = '<!--general:top-->', TOP_B = '<!--/general:top-->';
const FOOT_A = '<!--general:foot-->', FOOT_B = '<!--/general:foot-->';

const cut = (html, a, b) => {
  const i = html.indexOf(a), j = html.indexOf(b);
  if (i === -1 || j === -1 || j < i) return html;
  // Вместе с блоком забираем перевод строки, который дописала сама вставка, —
  // иначе каждая пересборка оставляла бы по одному лишнему \n, и файл потихоньку
  // рос бы на пустых строках, а --rebuild перестал быть идемпотентным.
  return html.slice(0, i) + html.slice(j + b.length).replace(/^\n/, '');
};

function headBlock(p, ogImage) {
  return `${HEAD_A}
<meta property="og:type" content="article">
<meta property="og:url" content="${BASE}${p.slug}.html">
<meta property="og:site_name" content="Журнал · paveldiordits.site">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.desc)}">
<meta property="og:image" content="${ogImage}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(p.title)}">
<meta name="twitter:description" content="${esc(p.desc)}">
<meta name="twitter:image" content="${ogImage}">
<link rel="canonical" href="${BASE}${p.slug}.html">
<link rel="alternate" type="application/rss+xml" title="${esc(JOURNAL_TITLE)}" href="${BASE}rss.xml">
${CONTRAST_OFF}
${HEAD_B}`;
}

// Режим повышенного контраста снят со всех разборов. Каждый генератор делал его
// по-своему — кнопки #contrastBtn, #btn-contrast, #ct, #hc, #hcBtn, состояние то
// в data-contrast="on", то ="high", то классом .hc на <html>, — и вырезать это из
// девяти разных файлов значило бы девять разных правок, которые вернутся с первой
// же переопубликацией из ~/dev/docs. Поэтому режим не вырезается, а глушится
// одним слоем: кнопка прячется, состояние снимается и не возвращается из
// localStorage. Разметку и скрипты разбора не трогаем — семь из девяти держат
// ссылку на кнопку и упадут на null, уронив вместе с собой переключатель темы.
const CONTRAST_OFF = `<style>
#contrastBtn,#btn-contrast,#ct,#hc,#hcBtn,
button[title*="онтраст"],button[aria-label*="онтраст"]{display:none!important}
</style>
<script>
(function(){
  var r=document.documentElement;
  function off(){
    if(r.hasAttribute('data-contrast')) r.removeAttribute('data-contrast');
    if(r.classList.contains('hc')) r.classList.remove('hc');
  }
  off();
  // Наблюдатель, а не разовый вызов: собственный скрипт страницы поднимает режим
  // из localStorage позже, уже после этой вставки, — снимаем сразу же, до отрисовки.
  new MutationObserver(off).observe(r,{attributes:true,attributeFilter:['data-contrast','class']});
  // Кнопки будущих разборов с неизвестным id: прячем по подписи, не удаляя узел.
  addEventListener('DOMContentLoaded',function(){
    [].forEach.call(document.querySelectorAll('button'),function(b){
      if(/контраст/i.test(b.textContent||'')) b.style.display='none';
    });
  });
})();
</script>`;

// «Похожие материалы» после разбора: сначала своя серия, потом своя тема.
const relatedFor = (p, all) => {
  const pool = all.filter(x => x.slug !== p.slug && x.status !== 'unlisted');
  const rank = x => (p.series && x.series === p.series ? 0 : x.topic === p.topic ? 1 : 2);
  return pool.sort((a, b) => rank(a) - rank(b) || b.date.localeCompare(a.date)).slice(0, 3);
};

function footBlock(p, all) {
  const rel = relatedFor(p, all);
  // Собственные стили с префиксом и явными значениями: блок садится на чужую
  // вёрстку, у которой свои переменные и свой сброс, — наследоваться нельзя.
  return `${FOOT_A}
<style>
.gnrl{margin:4rem auto 0;padding:2rem 1.25rem 2.5rem;max-width:1100px;border-top:1px solid rgba(128,128,128,.28);
  font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:15px;line-height:1.5}
.gnrl a{text-decoration:none;color:inherit}
.gnrl-top{display:flex;flex-wrap:wrap;gap:.75rem;justify-content:space-between;align-items:baseline;margin-bottom:1.25rem}
.gnrl-back{font-weight:600;opacity:.9}
.gnrl-back:hover{text-decoration:underline}
.gnrl-h{font-size:.75rem;letter-spacing:.12em;text-transform:uppercase;opacity:.55}
.gnrl-grid{display:grid;gap:1rem;grid-template-columns:1fr}
@media(min-width:720px){.gnrl-grid{grid-template-columns:repeat(3,1fr)}}
.gnrl-card{border:1px solid rgba(128,128,128,.28);border-radius:12px;overflow:hidden;transition:border-color .2s}
.gnrl-card:hover{border-color:rgba(128,128,128,.6)}
.gnrl-card img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover}
.gnrl-card b{display:block;padding:.8rem .9rem .2rem;font-size:.9375rem;font-weight:600}
.gnrl-card span{display:block;padding:0 .9rem .9rem;font-size:.8125rem;opacity:.6}
/* Стили кнопки возврата. Сама кнопка стоит не здесь, а в начале <body>: она в
   потоке, поэтому резервирует своё место и не накрывает то, что разбор нарисовал
   у себя вверху (у четырёх выпусков там собственный переключатель темы). Sticky
   держит её на виду при прокрутке — до подвала на длинном разборе крутить долго. */
.gnrl-upwrap{
  position:sticky;top:0;z-index:70;padding:.7rem 0 .1rem .75rem;
  /* Полоса тянется во всю ширину, но кликам не мешает — ловит их только кнопка. */
  pointer-events:none;
}
.gnrl-up{
  pointer-events:auto;display:inline-flex;align-items:center;
  padding:.4rem .8rem;border-radius:999px;font-size:.8125rem;font-weight:600;
  font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  color:inherit;text-decoration:none;border:1px solid rgba(128,128,128,.35);
  /* Серый в полупрозрачности и цвет текста по наследству: подложка одинаково
     ложится и на светлую, и на тёмную страницу, а системный Canvas — нет, он не
     знает про тему разбора и на тёмной странице стал бы белым пятном. */
  background:rgba(127,127,127,.2);
  backdrop-filter:blur(10px) saturate(1.4);-webkit-backdrop-filter:blur(10px) saturate(1.4);
}
.gnrl-up:hover{border-color:rgba(128,128,128,.75)}
@media print{.gnrl-upwrap{display:none}}
</style>
<nav class="gnrl">
  <div class="gnrl-top">
    <a class="gnrl-back" href="${BASE}">← Журнал</a>
    <span class="gnrl-h">Ещё по теме</span>
  </div>
  ${rel.length ? `<div class="gnrl-grid">
${rel.map(x => `    <a class="gnrl-card" href="${esc(x.slug)}.html">
      <img src="covers/${esc(x.slug)}.svg" alt="" loading="lazy">
      <b>${esc(x.title)}</b><span>${x.minutes} мин · ${esc(x.date)}</span>
    </a>`).join('\n')}
  </div>` : ''}
</nav>
<script>
// Кнопка вверху — настоящая ссылка на журнал: без скриптов и на прямом заходе
// она ведёт хотя бы туда. Если посетитель пришёл по ссылке с сайта, она вместо
// этого возвращает на ту же страницу и в ту же точку прокрутки, откуда он ушёл, —
// это и есть «назад», а не «в начало журнала».
(function(){
  var a=document.getElementById('gnrl-up');
  if(!a||history.length<2) return;
  var from=document.referrer||'';
  if(from.indexOf(location.origin+'/')!==0||from===location.href) return;
  a.addEventListener('click',function(e){ e.preventDefault(); history.back(); });
})();
</script>
${FOOT_B}`;
}

// Кнопка возврата. Стоит первой в <body>, чтобы занимать своё место в потоке, а
// не висеть поверх чужой вёрстки: у четырёх выпусков ровно там их собственный
// переключатель темы, и фиксированная кнопка его накрывала.
const topBlock = () => `${TOP_A}
<div class="gnrl-upwrap"><a class="gnrl-up" id="gnrl-up" href="${BASE}">← Назад</a></div>
${TOP_B}`;

function writeCopy(p, all, srcHtml) {
  let html = cut(cut(cut(srcHtml, HEAD_A, HEAD_B), TOP_A, TOP_B), FOOT_A, FOOT_B);
  const ogImage = fs.existsSync(path.join(COVERS, `${p.slug}.png`))
    ? `${BASE}covers/${p.slug}.png`
    : `${SITE}og.png`;

  const head = headBlock(p, ogImage);
  html = /<\/head>/i.test(html)
    ? html.replace(/<\/head>/i, `${head}\n</head>`)
    : html.replace(/<body[^>]*>/i, m => `${m}\n${head}`);

  // Кнопка — сразу за <body>. Тега может не быть (браузер его дорисует, а
  // предполётный контроль требует только <html>), тогда кладём в начало файла.
  const top = topBlock();
  html = /<body[^>]*>/i.test(html)
    ? html.replace(/<body[^>]*>/i, m => `${m}\n${top}`)
    : `${top}\n${html}`;

  const foot = footBlock(p, all);
  html = /<\/body>/i.test(html)
    ? html.replace(/<\/body>/i, `${foot}\n</body>`)
    : html + `\n${foot}\n`;

  fs.writeFileSync(path.join(DIR, `${p.slug}.html`), html);
}

// ── публикация ───────────────────────────────────────────────────────────────
function publish(a) {
  if (!a.file) die('не указан файл презентации');
  const src = path.resolve(a.file.replace(/^file:\/\//, ''));
  if (!fs.existsSync(src)) die(`файл не найден: ${src}`);
  if (!a.slug) die('нужен --slug: имя файла в ~/dev/docs не годится в URL (там есть review.html и fix_report.html)');
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(a.slug)) die(`slug «${a.slug}»: только строчная латиница, цифры и дефис`);
  if (!a.topic) die(`нужен --topic. Есть: ${TOPICS.map(t => t.id).join(', ')}`);
  if (!TOPICS.some(t => t.id === a.topic))
    die(`нет направления «${a.topic}». Есть: ${TOPICS.map(t => t.id).join(', ')}\n`
      + 'Новое заводится строкой в TOPICS внутри этого скрипта.');

  const html = fs.readFileSync(src, 'utf8');

  // Предполётный контроль. Сервер выкладки сам проверяет, что файл — HTML, и
  // валит весь деплой целиком, если нет; остальное он пропустит, а на публичном
  // адресе это уже видно посетителю. Дешевле поймать здесь.
  if (!/<html[\s>]/i.test(html))
    die(`в ${path.basename(src)} нет элемента <html> — это фрагмент, а не страница.\n`
      + 'Браузер такое дорисует, но сервер выкладки проверяет файл на HTML и отвергнет его,\n'
      + 'уронив весь деплой. Оберни страницу целиком: <!DOCTYPE html><html lang="ru">…');
  if (!/<meta[^>]+charset/i.test(html))
    die(`в ${path.basename(src)} нет <meta charset> — nginx отдаёт text/html без charset,\n`
      + 'и кириллица на боевом адресе останется на усмотрение браузера. Добавь <meta charset="utf-8">.');
  if (!/<meta[^>]+name=["']viewport/i.test(html))
    die(`в ${path.basename(src)} нет <meta name="viewport"> — на телефоне страница откроется\n`
      + 'свёрстанной под десктоп и уменьшенной. Добавь viewport width=device-width.');

  const ext = [...html.matchAll(/<link[^>]+href=["'](https?:\/\/[^"']+)/gi),
               ...html.matchAll(/<script[^>]+src=["'](https?:\/\/[^"']+)/gi)].map(m => new URL(m[1]).host);
  if (ext.length)
    console.warn(`ВНИМАНИЕ: страница тянет стили или скрипты со стороны — ${[...new Set(ext)].join(', ')}.\n`
      + '  Сайт заявлен как «без внешних запросов»; посетитель уйдёт на этот хост. Лучше вшить в файл.');

  const title = a.title || (html.match(/<title>([^<]*)<\/title>/i)?.[1] || '').trim();
  if (!title) die('в файле нет <title>, а --title не задан');
  if (!a.desc) die('нужен --desc: одна-две строки о чём разбор, они попадут в карточку');

  const date = a.date || src.match(/(\d{4}-\d{2}-\d{2})/)?.[1] || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) die(`дата «${date}» не в формате YYYY-MM-DD`);

  const reg = loadRegistry();
  const prev = reg.presentations.find(p => p.slug === a.slug);
  // Переопубликация того же слага без --series/--pick/--feature не меняет полку и метки:
  // иначе правка одного факта в тексте молча сбрасывает разбор с его полки в общую.
  const series = a.series ?? prev?.series ?? null;
  const feature = a.feature ?? prev?.feature ?? false;
  const pick = a.pick ?? prev?.pick ?? false;
  // Рекомендуемая на первом экране ровно одна: новая снимает флаг с прежней.
  if (feature) reg.presentations.forEach(p => { p.feature = false; });

  const entry = {
    slug: a.slug,
    title,
    topic: a.topic,
    series,
    date,
    lang: a.lang || 'ru',
    desc: a.desc,
    descEn: a.descEn || null,
    tags: a.tags,
    minutes: readMinutes(html),
    keywords: headings(html),
    feature: !!feature,
    pick: !!(pick || feature),              // рекомендуемая всегда и в «Лучшем»
    status: a.unlisted ? 'unlisted' : 'public',
    source: src.replace(process.env.HOME, '~'),
    bytes: Buffer.byteLength(html),
  };
  const i = reg.presentations.findIndex(p => p.slug === a.slug);
  if (i === -1) reg.presentations.push(entry); else reg.presentations[i] = entry;
  saveRegistry(reg);

  fs.mkdirSync(COVERS, { recursive: true });
  // Свою обложку не перетираем: положил файл руками — он и остаётся.
  const cover = path.join(COVERS, `${a.slug}.svg`);
  if (!fs.existsSync(cover)) fs.writeFileSync(cover, coverSvg(a.slug, a.topic));

  // Кладём исходник как есть; og-теги и подвал допишет сборка ниже — ей всё равно
  // переписывать их всем разборам, потому что «ещё по теме» зависит от соседей.
  fs.writeFileSync(path.join(DIR, `${a.slug}.html`), html);
  console.log(`${i === -1 ? 'опубликовано' : 'обновлено'}: ${a.slug} — «${title}»`
    + ` · ${entry.minutes} мин · ${Math.round(entry.bytes / 1024)} КБ`
    + (entry.status === 'unlisted' ? ' · по ссылке, в библиотеке не показывается' : ''));
}

function unpublish(slug) {
  const reg = loadRegistry();
  const i = reg.presentations.findIndex(p => p.slug === slug);
  if (i === -1) die(`в реестре нет ${slug}`);
  reg.presentations.splice(i, 1);
  saveRegistry(reg);
  fs.rmSync(path.join(DIR, `${slug}.html`), { force: true });
  fs.rmSync(path.join(COVERS, `${slug}.svg`), { force: true });
  fs.rmSync(path.join(COVERS, `${slug}.png`), { force: true });
  // Строка уходит из манифеста при пересборке, а файл, убранный из манифеста,
  // сервер удаляет на следующей выкладке.
  console.log(`снято с публикации: ${slug} (файл исчезнет с сервера после пуша)`);
}

// ── манифест ─────────────────────────────────────────────────────────────────
function rewriteManifest(reg) {
  const text = fs.readFileSync(MANIFEST, 'utf8');
  const at = text.indexOf(MARK);

  // Маркера нет, а пути презентаций есть — значит строку кто-то стёр или покорёжил
  // (в ней рамочные символы U+2500). Дописывать второй блок нельзя: пути задвоятся,
  // и каждый следующий --rebuild будет наращивать файл.
  if (at === -1 && /^presentations\//m.test(text))
    die(`в deploy.manifest есть строки presentations/, но нет строки-маркера:\n  ${MARK}\n`
      + 'Верни её перед этими путями — без неё блок не переписать, а второй блок дал бы дубли.');

  const head = (at === -1 ? text : text.slice(0, at)).replace(/\s+$/, '');
  const lines = reg.presentations.length ? ['presentations/index.html', 'presentations/rss.xml'] : [];
  for (const p of reg.presentations) {
    lines.push(`presentations/${p.slug}.html`);
    for (const e of ['svg', 'png'])
      if (fs.existsSync(path.join(COVERS, `${p.slug}.${e}`))) lines.push(`presentations/covers/${p.slug}.${e}`);
  }
  fs.writeFileSync(MANIFEST, `${head}\n\n${MARK}\n${lines.join('\n')}${lines.length ? '\n' : ''}`);
}

// ── блок журнала на главной ──────────────────────────────────────────────────
// Главная — единственный файл без сборки, и портить это ради трёх карточек
// нельзя. Поэтому данные вшиваются в неё тем же приёмом, что и пути в манифест:
// строки между маркерами принадлежат скрипту, всё остальное — человеку.
// Даты и время просмотра кладём уже готовыми парами {en, ru}: на главной есть
// переключатель языка, но нет ни календаря, ни склонений — и заводить их там
// ради одного блока значило бы дублировать то, что уже есть здесь.
const HOME_A = '/* ── journal:latest — блок ниже переписывает tools/publish-presentation.mjs ── */';
const HOME_B = '/* ── /journal:latest ── */';

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dateEn = iso => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS_EN[m - 1]} ${y}`;
};

function writeHomeBlock(entries) {
  const text = fs.readFileSync(SITE_PAGE, 'utf8');
  const i = text.indexOf(HOME_A), j = text.indexOf(HOME_B);
  if (i === -1 || j === -1 || j < i)
    die(`в index.html нет маркеров блока журнала:\n  ${HOME_A}\n  ${HOME_B}\n`
      + 'Верни их вокруг массива JOURNAL — без них последние записи на главной не обновить.');

  const js = s => JSON.stringify(s);
  const rows = entries.slice(0, ON_HOME).map(p =>
    `  { slug: ${js(p.slug)},\n`
    + `    title: ${js(p.title)},\n`
    + `    desc: { en: ${js(p.descEn || p.desc)}, ru: ${js(p.desc)} },\n`
    + `    date: { en: ${js(dateEn(p.date))}, ru: ${js(humanDate(p.date))} },\n`
    + `    read: { en: ${js(`${p.minutes} min`)}, `
    + `ru: ${js(`${p.minutes} ${plural(p.minutes, 'минута', 'минуты', 'минут')}`)} } },`).join('\n');

  fs.writeFileSync(SITE_PAGE,
    `${text.slice(0, i)}${HOME_A}\nconst JOURNAL = [\n${rows}\n];\n${HOME_B}${text.slice(j + HOME_B.length)}`);
}

// ── сборка ───────────────────────────────────────────────────────────────────
// Токены оформления не копируются, а вынимаются из index.html при каждой сборке:
// три набора света × две темы живут в одном месте, и журнал не может разъехаться
// с главной — тот же приём, что у tools/build-assets.mjs с резюме.
function designTokens() {
  const site = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const from = site.indexOf('/* ─────────────────────────── tokens');
  const to = site.indexOf('*,*::before,*::after{box-sizing:border-box}');
  if (from === -1 || to === -1 || to < from)
    die('в index.html не нашлись границы блока токенов — раскладка страницы изменилась,\n'
      + 'поправь якоря в designTokens() внутри publish-presentation.mjs');
  return site.slice(from, to).trim();
}

function rebuild(reg) {
  const all = reg.presentations;
  for (const p of all) {
    if (!p.topic) die(`у записи ${p.slug} нет поля topic — реестр от прежней схемы.\n`
      + 'Опубликуй её заново с --topic либо удали presentations.json и опубликуй всё.');
    const f = path.join(DIR, `${p.slug}.html`);
    if (!fs.existsSync(f)) die(`нет файла ${f}, хотя запись в реестре есть — публикуй заново или сними --unpublish`);
    // Подвал «ещё по теме» зависит от соседей, поэтому его переписывают всем при
    // каждой сборке. Вставка вырезается по маркерам, исходник не нужен.
    writeCopy(p, all, fs.readFileSync(f, 'utf8'));
    const cover = path.join(COVERS, `${p.slug}.svg`);
    if (!fs.existsSync(cover)) { fs.mkdirSync(COVERS, { recursive: true }); fs.writeFileSync(cover, coverSvg(p.slug, p.topic)); }
  }

  const listed = all.filter(p => p.status !== 'unlisted');
  const feature = listed.find(p => p.feature) || listed[0];

  // Лента: всё подряд от новых к старым. Реестр и так хранится в этом порядке,
  // но сортируем ещё раз — запись могли поправить руками, а хронология здесь
  // не оформление, а сама подача.
  const entries = [...listed].sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));

  // Серии в колонке сбоку считаются по тем же правилам, по которым раньше
  // строились полки: серия, а если её нет — направление. Поток они не режут,
  // но подпись у записи берётся отсюда, поэтому раскладка нужна целиком.
  // Всё, что не подошло ни к одной, собирается в хвостовую — иначе материал
  // молча остался бы без подписи, лёжа при этом в манифесте и на сервере.
  const taken = new Set();
  const groups = GROUPS.map(g => ({
    ru: g.ru, note: g.note,
    items: listed.filter(p => {
      const hit = g.series ? p.series === g.series : (!p.series && p.topic === g.topic);
      if (hit) taken.add(p.slug);
      return hit;
    }),
  })).filter(g => g.items.length);

  const rest = listed.filter(p => !taken.has(p.slug));
  if (rest.length) groups.push({ ru: 'Прочее', note: '', items: rest });

  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(path.join(DIR, 'index.html'), journalPage({
    entries,
    groups,
    feature,
    topics: TOPICS,
    tokens: designTokens(),
    base: BASE,
    author: AUTHOR,
    ogImage: feature && fs.existsSync(path.join(COVERS, `${feature.slug}.png`))
      ? `${BASE}covers/${feature.slug}.png` : `${SITE}og.png`,
  }));

  fs.writeFileSync(path.join(DIR, 'rss.xml'), rssFeed({
    entries, base: BASE, author: AUTHOR, title: JOURNAL_TITLE, about: JOURNAL_ABOUT,
  }));

  writeHomeBlock(entries);
}

// ── ход ──────────────────────────────────────────────────────────────────────
const a = parseArgs(process.argv.slice(2));
if (a.unpublish) unpublish(a.unpublish);
else if (!a.rebuild) publish(a);

const reg = loadRegistry();
rebuild(reg);
rewriteManifest(reg);

const listed = reg.presentations.filter(p => p.status !== 'unlisted').length;
const hidden = reg.presentations.length - listed;
console.log(`журнал пересобран: ${listed} на полках${hidden ? `, ${hidden} по ссылке` : ''}`
  + ` → presentations/index.html, presentations/rss.xml, блок на главной, deploy.manifest`);
