// Страница General — публичная библиотека разборов.
//
// Здесь только вёрстка: что публиковать, решает publish-presentation.mjs, а этот
// модуль получает готовый список и рисует страницу. Разделение по одной причине —
// шаблон вырос до размера, на котором в одном файле с логикой публикации оба
// перестают читаться.
//
// Оформление не своё, а сайтовое: токены (три набора света × светлая и тёмная
// тема) вынимаются из index.html при каждой сборке и вставляются сюда целиком,
// как это делает tools/build-assets.mjs с резюме. Поэтому General не может
// разъехаться с главной, а переключатели темы и набора работают на тех же
// ключах localStorage — выбор переносится между разделами.
//
// Материалы не свалены в один поток с рядом фильтров: полка разбита на группы
// (серия, а если её нет — направление), у каждой свой заголовок, счётчик и
// пояснение. Ищущему помогает поиск, а пришедшему посмотреть — деление на полки.

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const attr = o => esc(JSON.stringify(o));

// Русские месяцы в родительном падеже: «4 сентября 2026».
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const humanDate = iso => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
};

// ── карточки ─────────────────────────────────────────────────────────────────

const meta = (p, topic) => `<span class="topic" style="--topic:${topic.color}">${esc(topic.ru)}</span>`
  + `<span class="dot">·</span><span>${p.minutes}&nbsp;${plural(p.minutes, 'минута', 'минуты', 'минут')}</span>`
  + `<span class="dot">·</span><span>${esc(humanDate(p.date))}</span>`
  + (p.lang && p.lang !== 'ru' ? `<span class="lang">${esc(p.lang.toUpperCase())}</span>` : '');

const searchIndex = (p, topic) =>
  [p.title, p.desc, p.series, topic.ru, ...(p.tags || []), ...(p.keywords || [])].join(' ').toLowerCase();

function card(p, topic) {
  return `          <article class="card" data-q="${esc(searchIndex(p, topic))}">
            <a class="card-cover" href="${esc(p.slug)}.html" tabindex="-1" aria-hidden="true">
              <img src="covers/${esc(p.slug)}.svg" alt="" loading="lazy" width="1200" height="675">
              ${p.pick ? '<span class="badge">★ Лучшее</span>' : ''}
            </a>
            <div class="card-body">
              <h3><a href="${esc(p.slug)}.html">${esc(p.title)}</a></h3>
              <p class="card-desc">${esc(p.desc)}</p>
              ${(p.tags || []).length ? `<div class="tags">${p.tags.slice(0, 2).map(t => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
              <div class="card-meta">${meta(p, topic)}</div>
            </div>
          </article>`;
}

function featured(p, topic) {
  return `      <article class="featured">
        <a class="featured-cover" href="${esc(p.slug)}.html" tabindex="-1" aria-hidden="true">
          <img src="covers/${esc(p.slug)}.svg" alt="" width="1200" height="675">
          <span class="pick">★ Выбор автора</span>
        </a>
        <div class="featured-body">
          <h2><a href="${esc(p.slug)}.html">${esc(p.title)}</a></h2>
          <p>${esc(p.desc)}</p>
          <div class="card-meta">${meta(p, topic)}</div>
          <a class="btn" href="${esc(p.slug)}.html">Открыть презентацию
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/>
            </svg>
          </a>
        </div>
      </article>`;
}

function block(g, byId) {
  return `      <section class="block">
        <div class="block-head">
          <h2>${esc(g.ru)}</h2>
          <span class="count">${g.items.length}</span>
        </div>
        ${g.note ? `<p class="block-note">${esc(g.note)}</p>` : ''}
        <div class="grid">
${g.items.map(p => card(p, byId[p.topic])).join('\n')}
        </div>
      </section>`;
}

// ── страница ─────────────────────────────────────────────────────────────────

export function galleryPage({ groups, topics, tokens, base, author, ogImage, feature }) {
  const byId = Object.fromEntries(topics.map(t => [t.id, t]));
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  return `<!doctype html>
<html lang="ru" class="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>General — библиотека разборов Павла Диордица</title>
<meta name="description" content="Визуальная библиотека материалов о технологиях, работе и личных исследованиях: сложные темы коротко, структурированно и с визуальными объяснениями.">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>◆</text></svg>">
<meta name="theme-color" content="#f6f3f1" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0b0a0a" media="(prefers-color-scheme: dark)">
<link rel="canonical" href="${base}">
<meta name="robots" content="index, follow">
<meta property="og:type" content="website">
<meta property="og:url" content="${base}">
<meta property="og:site_name" content="paveldiordits.site">
<meta property="og:title" content="General — библиотека разборов">
<meta property="og:description" content="Визуальная библиотека материалов о технологиях, работе и личных исследованиях.">
<meta property="og:image" content="${ogImage}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="General — библиотека разборов">
<meta name="twitter:description" content="Визуальная библиотека материалов о технологиях, работе и личных исследованиях.">
<meta name="twitter:image" content="${ogImage}">
<style>
/* ВНИМАНИЕ: страница собирается tools/publish-presentation.mjs из tools/gallery-page.mjs.
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
button,select,input{font:inherit;color:inherit}
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
  white-space:nowrap;transition:color .2s,background-color .2s;
}
.site-nav a:hover{color:var(--fg)}
.site-nav a[aria-current]{color:var(--fg);font-weight:600}
.tools{display:flex;align-items:center;gap:.4rem;flex-shrink:0}
.tool-btn{
  font-family:var(--font-mono);font-size:.6875rem;letter-spacing:.08em;text-transform:uppercase;
  color:var(--muted);border:1px solid var(--border);border-radius:999px;padding:.35rem .7rem;
  white-space:nowrap;cursor:pointer;background:none;
  transition:color .2s,border-color .2s;
}
.tool-btn:hover{color:var(--fg);border-color:var(--fg)}
.icon-btn{
  width:32px;height:32px;display:grid;place-items:center;border:1px solid var(--border);
  border-radius:999px;background:none;color:var(--muted);cursor:pointer;
  transition:color .2s,border-color .2s;
}
.icon-btn:hover{color:var(--fg);border-color:var(--fg)}

/* ── первый экран: объяснение слева, точка входа справа ── */
.hero{display:grid;gap:2.25rem;padding:3rem 0 2.5rem;align-items:center}
@media(min-width:1000px){.hero{grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:3rem;padding:4rem 0 3rem}}
.hero h1{font-size:clamp(2.75rem,7.5vw,4.5rem);line-height:1;letter-spacing:-.045em;margin:0 0 1rem;font-weight:800}
.lede{font-size:clamp(1.0625rem,2.2vw,1.3125rem);line-height:1.35;margin:0 0 .85rem;max-width:30ch;letter-spacing:-.02em}
.byline{margin:0 0 1.6rem;color:var(--muted);max-width:46ch}
.search{position:relative}
.search svg{position:absolute;left:1rem;top:50%;transform:translateY(-50%);color:var(--muted);opacity:.7;pointer-events:none}
#q{
  width:100%;padding:.9rem 1rem .9rem 2.85rem;border:1px solid var(--border);border-radius:12px;
  background:var(--card);transition:border-color .2s;
}
#q:focus{outline:none;border-color:var(--accent)}

.featured{
  background:var(--card);border:1px solid var(--border);border-radius:18px;overflow:hidden;display:grid;
}
@media(min-width:760px){.featured{grid-template-columns:1.2fr 1fr}}
.featured-cover{position:relative;display:block;background:#0d0f14}
.featured-cover img{width:100%;height:100%;object-fit:cover;aspect-ratio:16/9}
@media(min-width:760px){.featured-cover img{aspect-ratio:auto;min-height:100%}}
.pick{
  position:absolute;top:1rem;left:1rem;padding:.35rem .7rem;border-radius:999px;
  background:rgba(10,12,18,.72);color:#fff;font-size:.75rem;font-weight:600;
  backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
}
.featured-body{padding:1.6rem;display:flex;flex-direction:column;gap:.7rem;justify-content:center}
.featured-body h2{font-size:clamp(1.3rem,2.4vw,1.6rem);line-height:1.18;letter-spacing:-.03em;margin:0;font-weight:700}
.featured-body p{margin:0;color:var(--muted)}
.btn{
  margin-top:.4rem;align-self:start;display:inline-flex;align-items:center;gap:.55rem;
  padding:.7rem 1.1rem;border-radius:11px;background:var(--accent);color:var(--accent-fg);
  font-weight:600;font-size:.9375rem;white-space:nowrap;transition:filter .2s,transform .2s;
}
.btn:hover{filter:brightness(1.08);transform:translateY(-1px)}

/* ── полки: заголовок, счётчик, пояснение, сетка ── */
.block + .block{margin-top:3.5rem;padding-top:3rem;border-top:1px solid var(--border)}
.block-head{display:flex;align-items:baseline;gap:.65rem}
.block-head h2{font-size:1.4rem;letter-spacing:-.03em;margin:0;font-weight:700}
.count{font-family:var(--font-mono);font-size:.75rem;color:var(--muted)}
.block-note{margin:.4rem 0 1.4rem;max-width:72ch;color:var(--muted);font-size:.9375rem}

.grid{display:grid;gap:1.35rem;grid-template-columns:1fr}
@media(min-width:680px){.grid{grid-template-columns:repeat(2,1fr)}}
@media(min-width:1080px){.grid{grid-template-columns:repeat(3,1fr)}}
.card{
  background:var(--card);border:1px solid var(--border);border-radius:16px;overflow:hidden;
  display:flex;flex-direction:column;transition:border-color .2s,transform .2s,background-color .2s;
}
.card:hover{background:var(--card-hover);border-color:var(--fg);transform:translateY(-3px)}
@media(prefers-reduced-motion:reduce){.card,.btn{transition:none}.card:hover{transform:none}}
.card-cover{display:block;position:relative;background:#0d0f14;border-bottom:1px solid var(--border)}
.card-cover img{width:100%;aspect-ratio:16/9;object-fit:cover;transition:transform .35s ease}
.card:hover .card-cover img{transform:scale(1.035)}
.badge{
  position:absolute;left:.7rem;top:.7rem;padding:.2rem .55rem;border-radius:999px;
  background:rgba(10,12,18,.72);color:#fff;font-size:.6875rem;font-weight:600;
  backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
}
.card-body{padding:1.1rem 1.2rem 1.2rem;display:flex;flex-direction:column;gap:.5rem;flex:1}
.card-body h3{font-size:1.0625rem;line-height:1.3;letter-spacing:-.025em;margin:0;font-weight:650}
.card-desc{
  margin:0;color:var(--muted);font-size:.9375rem;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
}
.tags{display:flex;flex-wrap:wrap;gap:.35rem}
.tags span{
  font-family:var(--font-mono);font-size:.625rem;letter-spacing:.06em;text-transform:uppercase;
  color:var(--muted);border:1px solid var(--border);border-radius:999px;padding:.12rem .5rem;
}
.card-meta{
  display:flex;flex-wrap:wrap;align-items:center;gap:.4rem;margin-top:auto;padding-top:.3rem;
  font-size:.8125rem;color:var(--muted);
}
.topic{color:var(--topic);font-weight:600}
.dot{opacity:.45}
.lang{border:1px solid var(--border);border-radius:5px;padding:0 .3rem;font-size:.6875rem;letter-spacing:.03em}

.empty{
  margin:2rem 0 0;padding:3rem 1rem;text-align:center;color:var(--muted);
  border:1px dashed var(--border);border-radius:16px;
}

/* ── автор ── */
.author{
  margin:3.5rem 0 0;padding:1.85rem;background:var(--card);border:1px solid var(--border);border-radius:18px;
  display:flex;flex-wrap:wrap;align-items:center;gap:1.5rem;justify-content:space-between;
}
.author p{margin:0;max-width:58ch;color:var(--muted)}
.author strong{color:var(--fg)}
.author-links{display:flex;flex-wrap:wrap;gap:.5rem}
.author-links a{
  padding:.55rem .95rem;border:1px solid var(--border);border-radius:10px;font-size:.875rem;
  transition:border-color .2s,color .2s;
}
.author-links a:hover{border-color:var(--fg)}

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
      <a href="./" aria-current="page">General</a>
      <a href="https://paveldiordits.site/#contact">Контакты</a>
    </nav>
    <div class="tools">
      <button class="icon-btn" id="to-search" type="button" aria-label="Найти материал">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
        </svg>
      </button>
      <button class="tool-btn" id="design-toggle" type="button"></button>
      <button class="icon-btn" id="theme-toggle" type="button" aria-label="Переключить тему"></button>
    </div>
  </div>
</header>

<main>
  <section class="wrap hero">
    <div>
      <h1>General</h1>
      <p class="lede">Визуальная библиотека о технологиях, работе и личных исследованиях</p>
      <p class="byline">Я собираю сложные темы в формате HTML-презентаций: коротко, структурированно и с визуальными объяснениями.</p>
      <div class="search">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
        </svg>
        <input id="q" type="search" placeholder="Найти презентацию или тему" aria-label="Поиск по библиотеке" autocomplete="off">
      </div>
    </div>
${feature ? featured(feature, byId[feature.topic]) : '<div></div>'}
  </section>

  <div class="wrap" id="shelf">
${groups.map(g => block(g, byId)).join('\n')}
    <p class="empty" id="empty" hidden>Ничего не нашлось. Попробуйте другое слово.</p>

    <div class="author">
      <p><strong>${esc(author.name)}</strong> — ${esc(author.about)}</p>
      <div class="author-links">
        <a href="https://paveldiordits.site/#projects">Проекты</a>
        <a href="https://paveldiordits.site/#experience">Опыт</a>
        <a href="mailto:${esc(author.email)}">Написать</a>
      </div>
    </div>
  </div>
</main>

<footer>
  <div class="wrap foot-row">
    <span id="copy"></span>
    <span>${total} ${plural(total, 'разбор', 'разбора', 'разборов')} · каждый — один самодостаточный файл, без трекеров</span>
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

// ── поиск ────────────────────────────────────────────────────────────────────
// Индекс вшит в разметку (data-q на каждой карточке): страница ничего не
// подгружает и работает из file://. Ищет по названию, описанию, серии,
// направлению, тегам и заголовкам разделов самой презентации — их собирает
// публикатор. Полка, где ничего не совпало, скрывается целиком вместе с
// заголовком: иначе остались бы висеть пустые рубрики.
const blocks = [...document.querySelectorAll('.block')];
const empty = $('#empty');
const q = $('#q');

function apply() {
  const needle = q.value.trim().toLowerCase();
  const words = needle ? needle.split(/\\s+/) : [];
  let shown = 0;
  for (const b of blocks) {
    let n = 0;
    for (const c of b.querySelectorAll('.card')) {
      const ok = !words.length || words.every(w => c.dataset.q.includes(w));
      c.hidden = !ok;
      if (ok) n++;
    }
    b.hidden = n === 0;
    b.querySelector('.count').textContent = n;
    shown += n;
  }
  empty.hidden = shown > 0;
}
q.addEventListener('input', apply);
$('#to-search').onclick = () => { q.scrollIntoView({ block: 'center', behavior: 'smooth' }); q.focus(); };
apply();
</script>
</body>
</html>
`;
}
