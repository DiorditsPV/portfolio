// Страница «Журнал» — указатель разборов.
//
// Здесь только вёрстка: что публиковать, решает publish-presentation.mjs, а этот
// модуль получает готовый список и рисует страницу.
//
// Читатель страницы — сам автор: он открывает её, чтобы окинуть взглядом весь
// архив и сразу увидеть самое свежее. Отсюда подача.
//
//   Свежая запись стоит первой и крупно — всегда самая новая по дате, без ручной
//   отметки: отметка устаревала, и на первом экране месяцами висела старая запись.
//
//   Периодика (полка, где больше четырёх записей) идёт одной строкой, уходящей
//   вправо, и листается слева направо. Серия с выпуском в неделю иначе за полгода
//   заняла бы всю страницу, а в строке она остаётся одной полосой любой длины.
//
//   Остальные полки стоят под ней на отдельном сером поле, по две в ряд: запись —
//   строка с обложкой слева и описанием справа.
//
// Страница целиком вбок не прокручивается: прокрутка есть только внутри строки
// периодики.
//
// Оформление у журнала своё и с главной не связано: белый лист, один цвет для
// ссылок и отметки свежести, одна гарнитура. Цвет на странице дают обложки.

import { STATS_SNIPPET } from './stats-snippet.mjs';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Русские месяцы в родительном падеже: «4 сентября 2026».
const MONTHS_OF = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const humanDate = iso => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS_OF[m - 1]} ${y}`;
};

// Как журнал называется и о чём он. Отсюда же их берёт лента RSS — иначе
// заголовок разъехался бы между страницей и подпиской.
export const JOURNAL_TITLE = 'Журнал — разборы Павла Диордица';
export const JOURNAL_ABOUT =
  'Разборы инструментов, агентных практик и продуктовых заходов: что внутри, чего это стоит и что забрать себе.';

export const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
};

const minutesOf = p => `${p.minutes}&nbsp;${plural(p.minutes, 'минута', 'минуты', 'минут')}`;

// ── общее для страниц журнала ────────────────────────────────────────────────
// Шрифт, цвета, сетка и шапка одни на указатель и на библиотеку: страницы одного
// раздела не должны расходиться в мелочах.
export const BASE_CSS = `@font-face{
  font-family:"Golos Text";src:url(fonts/golos-text.woff2) format("woff2");
  font-weight:400 900;font-display:swap;
}
:root{
  color-scheme:light;
  --bg:#ffffff; --field:#f4f5f6; --fg:#14171c; --muted:#5a616c; --rule:#e3e5e8;
  --link:#1d4ed8;
  --gutter:clamp(1.25rem,4vw,5.6rem);
  --maxw:126rem;
  --warn:#b54708;
}
/* Тёмная тема: выбор читателя из шапки, а до первого выбора — настройка системы. */
html[data-theme="dark"]{
  color-scheme:dark;
  --bg:#121316; --field:#1b1d21; --fg:#eceef1; --muted:#a3a9b3; --rule:#2c2f36;
  --link:#8fb0ff; --warn:#f5a15f;
}
/* Кегль растёт вместе с экраном, всё остальное задано в rem. Масштаб тот же, что
   у выпусков дайджеста (tools/digest-theme.css): страницы одного раздела не должны
   различаться размером текста. */
html{font-size:calc(clamp(14.7px,calc(9.9px + .315vw),17px)*var(--ts,1))}
/* --ts — множитель кегля, который читатель задаёт кнопками в шапке; хранится в
   localStorage и общий для журнала, библиотеки и выпусков. */
*,*::before,*::after{box-sizing:border-box}
body{
  margin:0;background:var(--bg);color:var(--fg);overflow-x:clip;
  font-family:"Golos Text",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  font-size:1rem;line-height:1.5;-webkit-font-smoothing:antialiased;
}
a{color:inherit;text-decoration:none}
img{display:block;max-width:100%;height:auto}
p,h1,h2,h3,ol{margin:0}
ol{list-style:none;padding:0}
::selection{background:var(--link);color:#fff}
:focus-visible{outline:2px solid var(--link);outline-offset:3px;border-radius:4px}
.wrap{width:100%;max-width:var(--maxw);margin:0 auto;padding-inline:var(--gutter)}

/* ── шапка ── */
.top{position:sticky;top:0;z-index:20;background:var(--bg);border-bottom:1px solid var(--rule)}
.bar{display:flex;align-items:center;gap:2rem;height:3.5rem}
.logo{font-weight:800;letter-spacing:-.03em;font-size:1.15rem}
.site-nav{display:flex;gap:1.5rem;margin-left:auto;min-width:0;overflow-x:auto;scrollbar-width:none}
.site-nav::-webkit-scrollbar{display:none}
.site-nav a{font-size:.9rem;color:var(--muted);white-space:nowrap;padding-block:.3rem}
.site-nav a:hover{color:var(--fg)}
.site-nav a[aria-current]{color:var(--fg);box-shadow:0 2px 0 var(--fg)}
.tools{display:flex;gap:.35rem;flex:none}
.tbtn{font:inherit;font-size:.85rem;font-weight:600;color:var(--muted);background:var(--bg);border:1px solid var(--rule);border-radius:.5rem;height:2.1rem;min-width:2.1rem;padding:0 .5rem;cursor:pointer;display:grid;place-items:center}
.tbtn:hover{color:var(--fg);border-color:var(--fg)}
.tbtn svg{width:1rem;height:1rem;display:block}
`;

export const siteHeader = () => `<header class="top">
  <div class="wrap bar">
    <a class="logo" href="https://paveldiordits.site/">PD</a>
    <nav class="site-nav">
      <a href="https://paveldiordits.site/">Главная</a>
      <a href="https://paveldiordits.site/#experience">Обо мне</a>
      <a href="https://paveldiordits.site/#projects">Проекты</a>
      <a href="./" aria-current="page">Журнал</a>
      <a href="https://paveldiordits.site/#contact">Контакты</a>
    </nav>
    <div class="tools">
      <button class="tbtn" id="ts-down" type="button" aria-label="Уменьшить текст">A−</button>
      <button class="tbtn" id="ts-up" type="button" aria-label="Увеличить текст">A+</button>
      <button class="tbtn" id="theme" type="button" aria-label="Светлая или тёмная тема"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 1.75a6.25 6.25 0 0 1 0 12.5z" fill="currentColor"/></svg></button>
    </div>
  </div>
</header>`;

// Тема и масштаб применяются до первой отрисовки, иначе страница мигнула бы светлой.
export const THEME_BOOT = `<script>(function(){try{var d=document.documentElement,t=localStorage.getItem('theme');if(t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches)d.dataset.theme='dark';var s=+localStorage.getItem('text-scale');if(s)d.style.setProperty('--ts',s)}catch(e){}})()</script>`;

// Кнопки шапки. Тема пишется и под ключом выпусков дайджеста (ad-theme): выбор,
// сделанный в журнале, действует и в них.
export const SHELL_JS = `(function(){
  const d = document.documentElement, STEPS = [.9, 1, 1.1, 1.2, 1.35];
  const save = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  document.getElementById('theme').addEventListener('click', () => {
    const dark = d.dataset.theme !== 'dark';
    if (dark) d.dataset.theme = 'dark'; else delete d.dataset.theme;
    save('theme', dark ? 'dark' : 'light'); save('ad-theme', dark ? 'dark' : 'light');
  });
  const step = n => {
    const cur = +d.style.getPropertyValue('--ts') || 1;
    const at = STEPS.reduce((b, v, i) => Math.abs(v - cur) < Math.abs(STEPS[b] - cur) ? i : b, 0);
    const v = STEPS[Math.max(0, Math.min(STEPS.length - 1, at + n))];
    d.style.setProperty('--ts', v); save('text-scale', v);
  };
  document.getElementById('ts-down').addEventListener('click', () => step(-1));
  document.getElementById('ts-up').addEventListener('click', () => step(1));
})();`;

// ── записи ───────────────────────────────────────────────────────────────────

const PERIODICAL_FROM = 5;   // с какого числа записей полка становится периодикой

const cover = (p, coverOf, eager) =>
  `<a class="cover" href="${esc(p.slug)}.html" tabindex="-1" aria-hidden="true">`
  + `<img src="${esc(coverOf(p.slug))}" alt="" ${eager ? '' : 'loading="lazy" '}width="1600" height="900"></a>`;

// Строка под обложкой: номер выпуска, дата, время чтения, отметка автора. Класс
// fresh ставит скрипт внизу страницы по возрасту записи на день просмотра.
const meta = (p, no) =>
  `<p class="meta" data-date="${esc(p.date)}">${no ? `<b>№${no}</b>` : ''}`
  + `<time datetime="${esc(p.date)}">${esc(humanDate(p.date))}</time>`
  + `<span>${minutesOf(p)}</span>`
  + (p.lang && p.lang !== 'ru' ? `<span>${esc(p.lang.toUpperCase())}</span>` : '')
  + (p.pick ? '<span>выбор автора</span>' : '') + `</p>`;

function leadEntry(p, no, coverOf) {
  return `    <article class="lead">
      ${cover(p, coverOf, true)}
      <div class="lead-body">
        ${meta(p, no)}
        <h2><a href="${esc(p.slug)}.html">${esc(p.title)}</a></h2>
        <p>${esc(p.desc)}</p>
        <a class="read" href="${esc(p.slug)}.html">Читать</a>
      </div>
    </article>`;
}

function issue(p, no, coverOf) {
  return `          <li class="issue">
            ${cover(p, coverOf)}
            ${meta(p, no)}
            <h3><a href="${esc(p.slug)}.html">${esc(p.title)}</a></h3>
            <p>${esc(p.desc)}</p>
          </li>`;
}

function row(p, coverOf) {
  return `          <li class="row">
            ${cover(p, coverOf)}
            <div>
              ${meta(p, 0)}
              <h3><a href="${esc(p.slug)}.html">${esc(p.title)}</a></h3>
              <p>${esc(p.desc)}</p>
            </div>
          </li>`;
}

const shelfHead = g => `<header class="shelf-head">
          <h2>${esc(g.ru)} <span class="count">${g.items.length}</span></h2>
          ${g.note ? `<p>${esc(g.note)}</p>` : ''}
        </header>`;

// Периодика: строка выпусков от свежих к старым. Запись с первого экрана в строке
// не повторяется; номер считается по всей серии, включая её.
function periodical(g, lead, coverOf) {
  const shown = g.items.map((p, i) => ({ p, no: g.items.length - i })).filter(x => x.p !== lead);
  if (!shown.length) return '';
  return `    <section class="shelf periodical">
      <div class="wrap">
        ${shelfHead(g)}
      </div>
      <div class="rail" tabindex="0" role="region" aria-label="${esc(g.ru)}: выпуски от свежих к старым">
        <ol class="issues">
${shown.map(x => issue(x.p, x.no, coverOf)).join('\n')}
        </ol>
      </div>
    </section>`;
}

function shelf(g, lead, coverOf) {
  const shown = g.items.filter(p => p !== lead);
  if (!shown.length) return '';
  return `        <section class="shelf">
        ${shelfHead(g)}
        <ol class="rows">
${shown.map(p => row(p, coverOf)).join('\n')}
        </ol>
        </section>`;
}

// ── страница ─────────────────────────────────────────────────────────────────

export function journalPage({ entries, groups, base, author, ogImage, coverOf, library }) {
  // Счётчик в подвале считается по плоскому списку, а не по сумме полок: полка
  // может не показать запись, а посчитать её всё равно нужно.
  const total = entries.length;
  const title = JOURNAL_TITLE, about = JOURNAL_ABOUT;
  const lead = entries[0];
  const isPeriodical = g => g.items.length >= PERIODICAL_FROM;
  const leadShelf = groups.find(g => g.items.includes(lead));
  const leadNo = leadShelf && isPeriodical(leadShelf) ? leadShelf.items.length - leadShelf.items.indexOf(lead) : 0;
  const rails = groups.filter(isPeriodical), shelves = groups.filter(g => !isPeriodical(g));

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(about)}">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>◆</text></svg>">
<meta name="theme-color" content="#ffffff">
${THEME_BOOT}
<link rel="canonical" href="${base}">
<link rel="alternate" type="application/rss+xml" title="Журнал — Павел Диордиц" href="${base}rss.xml">
<link rel="preload" href="fonts/golos-text.woff2" as="font" type="font/woff2" crossorigin>
<meta name="robots" content="index, follow">
<meta property="og:type" content="website">
<meta property="og:url" content="${base}">
<meta property="og:site_name" content="paveldiordits.site">
<meta property="og:title" content="Журнал — разборы">
<meta property="og:description" content="${esc(about)}">
<meta property="og:image" content="${ogImage}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Журнал — разборы">
<meta name="twitter:description" content="${esc(about)}">
<meta name="twitter:image" content="${ogImage}">
<style>
/* ВНИМАНИЕ: страница собирается tools/publish-presentation.mjs из tools/journal-page.mjs.
   Правки здесь затрутся — меняй шаблон и прогоняй --rebuild. */

${BASE_CSS}
/* ── строка о журнале ── */
/* Заголовок и описание стоят столбиком, ссылка на библиотеку — справа на строке
   заголовка: в одну строку описание переносилось и висело рядом с заголовком уступом. */
.mast{padding-block:2.25rem 1.5rem;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:baseline;gap:.35rem 2rem}
.mast h1{font-size:2rem;line-height:1.1;letter-spacing:-.035em;font-weight:750}
.mast p{grid-column:1/-1;color:var(--muted)}
.lib{grid-row:1;grid-column:2;color:var(--link);font-weight:600;white-space:nowrap}
.lib::after{content:" →"}
.lib:hover{text-decoration:underline;text-underline-offset:.25em}

/* ── общее для записей ── */
.cover{display:block;border-radius:.6rem;overflow:hidden;border:1px solid var(--rule);background:var(--field)}
.cover img{width:100%;aspect-ratio:16/9;object-fit:cover;transition:transform .5s cubic-bezier(.16,1,.3,1)}
@media(hover:hover){.cover:hover img{transform:scale(1.025)}}
@media(prefers-reduced-motion:reduce){.cover img{transition:none}}
.meta{display:flex;flex-wrap:wrap;align-items:center;gap:.2rem .85rem;font-size:.82rem;color:var(--muted);font-variant-numeric:tabular-nums}
.meta b{color:var(--fg);font-weight:700}
/* отметка свежести: точка перед датой у записей моложе двух недель */
.meta.fresh time{color:var(--link);font-weight:600}
.meta.fresh time::before{content:"";display:inline-block;width:.5em;height:.5em;border-radius:50%;background:var(--link);margin-right:.45em;vertical-align:.08em}
h3{font-size:1.08rem;line-height:1.28;letter-spacing:-.015em;font-weight:650;text-wrap:balance}
h2 a:hover,h3 a:hover{color:var(--link)}

/* ── свежая запись ── */
.lead{display:grid;gap:1.25rem 3rem;align-items:center;padding-bottom:3rem}
.lead-body{display:flex;flex-direction:column;gap:.85rem;min-width:0}
.lead-body h2{font-size:clamp(1.6rem,2.6vw,2.6rem);line-height:1.1;letter-spacing:-.035em;font-weight:750;text-wrap:balance}
.lead-body>p:not(.meta){color:var(--muted);font-size:1.08rem}
.read{align-self:start;margin-top:.3rem;color:var(--link);font-weight:600}
.read::after{content:" →"}
.read:hover{text-decoration:underline;text-underline-offset:.25em}
@media(min-width:900px){.lead{grid-template-columns:repeat(2,minmax(0,1fr))}}

/* ── полки ── */
.shelf-head{margin-bottom:1.1rem}
.shelf-head h2{font-size:1.35rem;line-height:1.2;letter-spacing:-.025em;font-weight:750}
.count{color:var(--muted);font-weight:500;font-size:.75em;font-variant-numeric:tabular-nums;margin-left:.15em}
.shelf-head p{margin-top:.25rem;color:var(--muted);font-size:.9rem}

/* периодика: строка выпусков, уходящая за правый край; листается только она */
.periodical{padding-block:2.25rem 2.5rem;border-top:1px solid var(--rule)}
.rail{
  overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x proximity;
  scroll-padding-inline:max(var(--gutter),calc((100vw - var(--maxw))/2 + var(--gutter)));
  scrollbar-width:thin;scrollbar-color:#c3c7cd transparent;
}
.issues{
  display:grid;grid-auto-flow:column;grid-auto-columns:clamp(15rem,23vw,24rem);gap:1.5rem;
  width:max-content;padding-bottom:1rem;
  padding-inline:max(var(--gutter),calc((100vw - var(--maxw))/2 + var(--gutter)));
}
.issue{display:flex;flex-direction:column;gap:.5rem;min-width:0;scroll-snap-align:start}
.issue .cover{margin-bottom:.25rem}
.issue>p:not(.meta){color:var(--muted);font-size:.9rem}

/* остальные полки: отдельное серое поле, по две полки в ряд */
.rest{background:var(--field);padding-block:2.75rem 3.5rem}
.shelves{display:grid;gap:3rem 4rem}
.rows{display:grid;gap:1.5rem}
.row{display:grid;gap:.75rem 1.5rem;align-items:start}
.row>div{display:flex;flex-direction:column;gap:.4rem;min-width:0}
.row>div>p:not(.meta){color:var(--muted);font-size:.92rem}
.rest .cover{background:var(--bg)}
@media(min-width:560px){.row{grid-template-columns:minmax(0,15rem) minmax(0,1fr)}}
@media(min-width:1200px){.shelves{grid-template-columns:repeat(2,minmax(0,1fr))}}

footer{border-top:1px solid var(--rule);padding-block:1.5rem 2.5rem;color:var(--muted);font-size:.85rem}
.foot{display:flex;flex-wrap:wrap;gap:.5rem 2rem;justify-content:space-between}
.foot p{max-width:64ch}
footer a{color:var(--link)}
footer a:hover{text-decoration:underline;text-underline-offset:.25em}
</style>
${STATS_SNIPPET}
</head>
<body>
${siteHeader()}

<main>
  <div class="wrap">
    <div class="mast">
      <h1>Журнал</h1>
      <p>${esc(about)}</p>
      ${library ? `<a class="lib" href="library.html">Библиотека: ${library} ${plural(library, 'позиция', 'позиции', 'позиций')} из выпусков Agents Weekly</a>` : ''}
    </div>
${lead ? leadEntry(lead, leadNo, coverOf) : ''}
  </div>

${rails.map(g => periodical(g, lead, coverOf)).join('\n')}

  <div class="rest">
    <div class="wrap shelves">
${shelves.map(g => shelf(g, lead, coverOf)).join('\n')}
    </div>
  </div>
</main>

<footer>
  <div class="wrap foot">
    <p>Каждая запись — одна самодостаточная html-страница: без трекеров и внешних запросов, открывается и читается как есть.</p>
    <span>${total} ${plural(total, 'запись', 'записи', 'записей')} · <a href="rss.xml">RSS</a> · <span id="copy"></span></span>
  </div>
</footer>

<script>
${SHELL_JS}
document.getElementById('copy').textContent = '© ' + new Date().getFullYear() + ' ${esc(author.name)}';
// Свежей считается запись моложе двух недель на день просмотра: страница
// статическая, и отметка, расставленная при сборке, со временем начала бы врать.
const FRESH_DAYS = 14;
for (const m of document.querySelectorAll('.meta[data-date]')) {
  if ((Date.now() - new Date(m.dataset.date)) / 864e5 <= FRESH_DAYS) m.classList.add('fresh');
}
</script>
</body>
</html>
`;
}
