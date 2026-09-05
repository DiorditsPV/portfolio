// Страница «Журнал» — публичная лента разборов.
//
// Здесь только вёрстка: что публиковать, решает publish-presentation.mjs, а этот
// модуль получает готовый список и рисует страницу. Разделение по одной причине —
// шаблон вырос до размера, на котором в одном файле с логикой публикации оба
// перестают читаться.
//
// Оформление не своё, а сайтовое: токены (три набора света × светлая и тёмная
// тема) вынимаются из index.html при каждой сборке и вставляются сюда целиком,
// как это делает tools/build-assets.mjs с резюме. Поэтому Журнал не может
// разъехаться с главной, а переключатели темы и набора работают на тех же
// ключах localStorage — выбор переносится между разделами.
//
// Подача — полки по темам, внутри полки новые сверху. Один сплошной поток по
// датам journal уже пробовал: хронология отвечает на «что нового», но теряет
// «что тут вообще есть», а у журнала из четырёх непохожих серий второй вопрос
// важнее. Записи при этом не карточки в сетке, а строки: в строку помещается
// описание целиком, и полку видно одним взглядом, не листая колонки.

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

// ── записи ───────────────────────────────────────────────────────────────────

// Метки под заголовком: направление цветом, время просмотра, язык.
const marks = (p, topic) =>
  `<span class="topic" style="--topic:${topic.color}">${esc(topic.ru)}</span>`
  + `<span class="dot">·</span><span>${minutesOf(p)}</span>`
  + (p.lang && p.lang !== 'ru' ? `<span class="lang">${esc(p.lang.toUpperCase())}</span>` : '');

function entry(p, topic) {
  return `          <li class="entry">
            <a class="entry-cover" href="${esc(p.slug)}.html" tabindex="-1" aria-hidden="true">
              <img src="covers/${esc(p.slug)}.svg" alt="" loading="lazy" width="1200" height="675">
              ${p.pick ? '<span class="badge">★ Лучшее</span>' : ''}
            </a>
            <div class="entry-body">
              <time class="entry-date" datetime="${esc(p.date)}">${esc(humanDate(p.date))}</time>
              <h3><a href="${esc(p.slug)}.html">${esc(p.title)}</a></h3>
              <p>${esc(p.desc)}</p>
              ${(p.tags || []).length ? `<div class="tags">${p.tags.slice(0, 3).map(t => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
              <div class="marks">${marks(p, topic)}</div>
            </div>
          </li>`;
}

// Полка: заголовок, счётчик, пояснение и записи от новых к старым. Список
// нумерованный (<ol>) — внутри полки это хронология, а не набор.
function shelf(g, byId) {
  return `      <section class="shelf">
        <div class="shelf-head">
          <h2>${esc(g.ru)}</h2>
          <span class="count">${g.items.length}</span>
        </div>
        ${g.note ? `<p class="shelf-note">${esc(g.note)}</p>` : ''}
        <ol class="stream">
${g.items.map(p => entry(p, byId[p.topic])).join('\n')}
        </ol>
      </section>`;
}

function lead(p, topic) {
  return `      <article class="lead-entry">
        <a class="lead-cover" href="${esc(p.slug)}.html" tabindex="-1" aria-hidden="true">
          <img src="covers/${esc(p.slug)}.svg" alt="" width="1200" height="675">
        </a>
        <div class="lead-body">
          <time class="entry-date" datetime="${esc(p.date)}">${esc(humanDate(p.date))}</time>
          <h2><a href="${esc(p.slug)}.html">${esc(p.title)}</a></h2>
          <p>${esc(p.desc)}</p>
          <div class="marks">${marks(p, topic)}</div>
          <a class="btn" href="${esc(p.slug)}.html">Читать запись</a>
        </div>
      </article>`;
}

// ── страница ─────────────────────────────────────────────────────────────────

export function journalPage({ entries, groups, topics, tokens, base, author, ogImage, feature }) {
  const byId = Object.fromEntries(topics.map(t => [t.id, t]));
  // Счётчик в подвале считается по плоскому списку, а не по сумме полок: полка
  // может не показать запись, а посчитать её всё равно нужно.
  const total = entries.length;
  const title = JOURNAL_TITLE, about = JOURNAL_ABOUT;

  return `<!doctype html>
<html lang="ru" class="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(about)}">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>◆</text></svg>">
<meta name="theme-color" content="#f6f3f1" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0b0a0a" media="(prefers-color-scheme: dark)">
<link rel="canonical" href="${base}">
<link rel="alternate" type="application/rss+xml" title="Журнал — Павел Диордиц" href="${base}rss.xml">
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
   Правки здесь затрутся — меняй шаблон и прогоняй --rebuild.
   Блок токенов ниже вынут из index.html при сборке: он там источник правды. */

${tokens}

*,*::before,*::after{box-sizing:border-box}
html{color-scheme:light}
html.dark{color-scheme:dark}
body{
  margin:0;background:var(--bg);color:var(--fg);font-family:var(--font-sans);
  font-size:16px;line-height:1.55;letter-spacing:-.01em;-webkit-font-smoothing:antialiased;
  transition:background-color .4s ease,color .4s ease;
}
/* Световой слой набора — как на главной: живёт только на первом экране. */
#bg{
  position:absolute;top:0;left:0;right:0;height:100vh;z-index:0;pointer-events:none;
  background:var(--glow);
  -webkit-mask-image:linear-gradient(180deg,#000 58%,transparent 100%);
          mask-image:linear-gradient(180deg,#000 58%,transparent 100%);
}
header,main,footer{position:relative;z-index:1}
a{color:inherit;text-decoration:none}
button{font:inherit;color:inherit}
img{display:block;max-width:100%;height:auto}
::selection{background:var(--accent);color:var(--accent-fg)}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:6px}
.wrap{width:100%;max-width:var(--maxw);margin:0 auto;padding:0 1.25rem}
@media(min-width:900px){.wrap{padding:0 2rem}}

/* ── шапка: логотип, разделы сайта, инструменты ── */
header{
  position:sticky;top:0;z-index:50;padding:.75rem 0;
  background:color-mix(in srgb,var(--bg) 84%,transparent);
  backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
  border-bottom:1px solid transparent;transition:border-color .3s ease;
}
header.scrolled{border-bottom-color:var(--border)}
.bar{display:flex;align-items:center;gap:1rem}
.logo{font-weight:800;letter-spacing:-.04em;font-size:1.1rem;flex-shrink:0}
.site-nav{
  display:flex;align-items:center;gap:.25rem;margin:0 auto;
  overflow-x:auto;scrollbar-width:none;-ms-overflow-style:none;
}
.site-nav::-webkit-scrollbar{display:none}
.site-nav a{
  padding:.35rem .65rem;border-radius:8px;font-size:.875rem;color:var(--muted);
  white-space:nowrap;transition:color .2s;
}
.site-nav a:hover{color:var(--fg)}
.site-nav a[aria-current]{color:var(--fg);font-weight:600}
.tools{display:flex;align-items:center;gap:.4rem;flex-shrink:0}
.tool-btn{
  font-family:var(--font-mono);font-size:.6875rem;letter-spacing:.08em;
  color:var(--muted);border:1px solid var(--border);border-radius:999px;padding:.35rem .7rem;
  white-space:nowrap;cursor:pointer;background:none;transition:color .2s,border-color .2s;
}
.tool-btn:hover{color:var(--fg);border-color:var(--fg)}
.icon-btn{
  width:32px;height:32px;display:grid;place-items:center;border:1px solid var(--border);
  border-radius:999px;background:none;color:var(--muted);cursor:pointer;
  transition:color .2s,border-color .2s;
}
.icon-btn:hover{color:var(--fg);border-color:var(--fg)}

/* ── первый экран: о чём журнал слева, свежая рекомендация справа ── */
.top{display:grid;gap:2.25rem;padding-block:3rem 2.5rem;align-items:center}
@media(min-width:1000px){.top{grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);gap:3rem;padding-block:4rem 3rem}}
.top h1{font-size:clamp(2.75rem,7.5vw,4.5rem);line-height:1;letter-spacing:-.045em;margin:0 0 1rem;font-weight:800}
.lede{font-size:clamp(1.0625rem,2.2vw,1.3125rem);line-height:1.35;margin:0 0 .85rem;max-width:32ch;letter-spacing:-.02em}
.byline{margin:0;color:var(--muted);max-width:46ch}

.lead-entry{background:var(--card);border:1px solid var(--border);border-radius:18px;overflow:hidden;display:grid}
@media(min-width:760px){.lead-entry{grid-template-columns:1.1fr 1fr}}
.lead-cover{display:block;background:#0d0f14}
.lead-cover img{width:100%;height:100%;object-fit:cover;aspect-ratio:16/9}
@media(min-width:760px){.lead-cover img{aspect-ratio:auto;min-height:100%}}
.lead-body{padding:1.6rem;display:flex;flex-direction:column;gap:.6rem;justify-content:center}
.lead-body h2{font-size:clamp(1.3rem,2.4vw,1.65rem);line-height:1.18;letter-spacing:-.03em;margin:0;font-weight:700}
.lead-body p{margin:0;color:var(--muted)}
.btn{
  margin-top:.5rem;align-self:start;display:inline-flex;align-items:center;
  padding:.7rem 1.1rem;border-radius:11px;background:var(--accent);color:var(--accent-fg);
  font-weight:600;font-size:.9375rem;white-space:nowrap;transition:filter .2s;
}
.btn:hover{filter:brightness(1.08)}

/* ── полки: заголовок, счётчик, пояснение и записи строками ── */
.shelves{padding-top:1rem}
.shelf + .shelf{margin-top:3.5rem;padding-top:3rem;border-top:1px solid var(--border)}
.shelf-head{display:flex;align-items:baseline;gap:.65rem}
.shelf-head h2{font-size:1.4rem;letter-spacing:-.03em;margin:0;font-weight:700}
.count{font-family:var(--font-mono);font-size:.75rem;color:var(--muted)}
.shelf-note{margin:.4rem 0 0;max-width:72ch;color:var(--muted);font-size:.9375rem}

.stream{list-style:none;margin:1.5rem 0 0;padding:0}
.entry{display:grid;gap:.45rem 1.5rem;padding:1.35rem 0;border-top:1px solid var(--border)}
.stream .entry:first-child{border-top:none;padding-top:.25rem}
.entry-cover{
  display:none;position:relative;border-radius:12px;overflow:hidden;
  background:#0d0f14;border:1px solid var(--border);align-self:start;
}
.entry-cover img{width:100%;aspect-ratio:16/9;object-fit:cover}
.badge{
  position:absolute;left:.4rem;top:.4rem;padding:.1rem .45rem;border-radius:999px;
  background:rgba(10,12,18,.72);color:#fff;font-size:.625rem;font-weight:600;
  backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
}
.entry-body{display:flex;flex-direction:column;gap:.4rem;min-width:0}
.entry-body h3{font-size:1.125rem;line-height:1.3;letter-spacing:-.025em;margin:0;font-weight:650}
.entry-body h3 a{transition:color .2s}
.entry:hover h3 a{color:var(--accent)}
html.dark .entry:hover h3 a{color:var(--fg)}
.entry-body p{margin:0;color:var(--muted);font-size:.9375rem;max-width:74ch}
.entry-date{font-family:var(--font-mono);font-size:.75rem;color:var(--muted)}

/* Обложка появляется только там, где есть чем её оплатить по ширине: на телефоне
   строка сжимается до текста, и картинка съела бы весь экран под каждой записью. */
@media(min-width:720px){
  .entry{grid-template-columns:12rem minmax(0,1fr)}
  .entry-cover{display:block}
}
@media(prefers-reduced-motion:reduce){.entry-body h3 a,.btn{transition:none}}

.tags{display:flex;flex-wrap:wrap;gap:.35rem}
.tags span{
  font-family:var(--font-mono);font-size:.6875rem;color:var(--muted);
  border:1px solid var(--border);border-radius:999px;padding:.1rem .5rem;
}
.marks{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem;font-size:.8125rem;color:var(--muted)}
.topic{color:var(--topic);font-weight:600}
.dot{opacity:.45}
.lang{border:1px solid var(--border);border-radius:5px;padding:0 .3rem;font-size:.6875rem}

main{padding-bottom:4rem}
footer{border-top:1px solid var(--border);padding:1.75rem 0 3rem;color:var(--muted);font-size:.8125rem}
.foot-row{display:flex;flex-wrap:wrap;gap:1rem;justify-content:space-between}
</style>
</head>
<body>
<div id="bg" aria-hidden="true"></div>

<header id="site-header">
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
      <button class="tool-btn" id="design-toggle" type="button"></button>
      <button class="icon-btn" id="theme-toggle" type="button" aria-label="Переключить тему"></button>
    </div>
  </div>
</header>

<main>
  <section class="wrap top">
    <div>
      <h1>Журнал</h1>
      <p class="lede">${esc(about)}</p>
      <p class="byline">Каждая запись — одна самодостаточная html-страница: без трекеров и внешних запросов, открывается и читается как есть.</p>
    </div>
${feature ? lead(feature, byId[feature.topic]) : '<div></div>'}
  </section>

  <div class="wrap shelves">
${groups.map(g => shelf(g, byId)).join('\n')}
  </div>
</main>

<footer>
  <div class="wrap foot-row">
    <span id="copy"></span>
    <span>${total} ${plural(total, 'запись', 'записи', 'записей')} · <a href="rss.xml">RSS</a></span>
  </div>
</footer>

<script>
// Тема и набор света живут в тех же ключах localStorage, что и на главной, —
// переход между разделами не сбрасывает выбор.
const DESIGNS = [
  { id:'two-sources', ru:'Два света' },
  { id:'cold-leak',   ru:'Засветка' },
  { id:'dawn-fog',    ru:'Рассвет' },
];
const $ = s => document.querySelector(s);
const ls = {
  get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
};

function designIndex() {
  const i = DESIGNS.findIndex(d => d.id === ls.get('design'));
  return i === -1 ? 0 : i;
}
function applyDesign(i) {
  const d = DESIGNS[(i + DESIGNS.length) % DESIGNS.length];
  document.documentElement.dataset.design = d.id;
  ls.set('design', d.id);
  $('#design-toggle').textContent = (designIndex() + 1) + '/' + DESIGNS.length + ' · ' + d.ru;
}
function applyTheme(dark) {
  document.documentElement.classList.toggle('dark', dark);
  ls.set('theme', dark ? 'dark' : 'light');
  $('#theme-toggle').textContent = dark ? '☾' : '☀';
}
const savedTheme = ls.get('theme');
applyTheme(savedTheme ? savedTheme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
applyDesign(designIndex());
$('#theme-toggle').onclick = () => applyTheme(!document.documentElement.classList.contains('dark'));
$('#design-toggle').onclick = () => applyDesign(designIndex() + 1);
$('#copy').textContent = '© ' + new Date().getFullYear() + ' ${esc(author.name)}';

addEventListener('scroll', () => {
  $('#site-header').classList.toggle('scrolled', scrollY > 8);
}, { passive: true });
</script>
</body>
</html>
`;
}
