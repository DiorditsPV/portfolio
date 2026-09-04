// Публикует html-презентацию (скилл present-html) на сайт и пересобирает галерею.
//
// Скилл кладёт пару <name>.md + <name>.html в ~/dev/docs/<тема>/ — там источник
// правды содержания, и там же остаётся всё, что публиковать не нужно. На сайт
// файл попадает только этой командой: публикация — осознанный шаг, а не побочный
// эффект генерации. Иначе рабочие документы из ~/dev/docs/rabota/ однажды уехали бы
// на публичный адрес.
//
//   node tools/publish-presentation.mjs <файл.html> --slug <slug> --desc "…" \
//        [--desc-en "…"] [--title "…"] [--date YYYY-MM-DD] [--tag тег]…
//   node tools/publish-presentation.mjs --unpublish <slug>
//   node tools/publish-presentation.mjs --rebuild
//
// Что делает публикация:
//   1. копирует html в presentations/<slug>.html;
//   2. заносит запись в presentations.json — реестр в репозитории, который
//      браузер никогда не грузит: это исходник сборки, а не данные страницы;
//   3. пересобирает presentations/index.html со списком, вшитым в разметку;
//   4. переписывает в deploy.manifest блок под маркером, не трогая строки выше.
//
// Дальше — обычный git push: выкладку делает .github/workflows/deploy.yml.
//
// Зависимостей нет, сборки нет — как и у остального репозитория.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'presentations');       // сюда едут файлы
const REGISTRY = path.join(ROOT, 'presentations.json');
const MANIFEST = path.join(ROOT, 'deploy.manifest');
const INDEX = path.join(ROOT, 'index.html');

// Маркер в манифесте: всё ниже него принадлежит этому скрипту и переписывается
// целиком. Строки выше — руками, их не трогаем.
const MARK = '# ─── презентации: блок ниже переписывает tools/publish-presentation.mjs ───';

// Адрес галереи. Сегодня это подкаталог основного сайта; когда на сервере
// появится vhost presentations.paveldiordits.site с root на этот же каталог,
// достаточно поменять строку здесь и пересобрать (--rebuild).
const BASE = 'https://paveldiordits.site/presentations/';

// Блоки галереи. Порядок здесь — порядок на странице; внутри блока новые сверху.
// Новая рубрика заводится строкой сюда, а не правкой разметки.
const CATEGORIES = [
  {
    id: 'product-lab', ru: 'Product Lab', en: 'Product Lab',
    noteRu: 'Одна продуктовая лаборатория: исследование, из которого выросла её модель фич, и карта её процессов.',
    noteEn: 'One product lab: the research its feature model grew out of, and the map of its processes.',
  },
  {
    id: 'agents-weekly', ru: 'Agents Weekly', en: 'Agents Weekly',
    noteRu: 'Дайджест агент-экосистемы по расписанию. Каждый выпуск закрывает своё окно наблюдения; сюжеты прошлых прогонов в нём не повторяются, поэтому выпуски читаются подряд, а не выборочно.',
    noteEn: 'A scheduled digest of the agent ecosystem. Each issue closes its own observation window and does not repeat earlier runs, so the issues read in sequence rather than at random.',
  },
  {
    id: 'agent-research', ru: 'Агентная разработка', en: 'Agentic development',
    noteRu: 'Разовые разборы инструментов и трендов — не серия, а срез на дату.',
    noteEn: 'One-off writeups on tooling and trends — not a series, a snapshot at a date.',
  },
  {
    id: 'interactive', ru: 'Интерактивное', en: 'Interactive',
    noteRu: 'Не статья, а работающий тренажёр: открывается и используется прямо на странице.',
    noteEn: 'Not an article but a working trainer: open it and use it right on the page.',
  },
];

// Страховка для реестра, поправленного руками: страница без рубрики не должна
// молча пропасть из галереи, оставшись при этом в манифесте.
const OTHER = { id: null, ru: 'Прочее', en: 'Other', noteRu: '', noteEn: '' };

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
    else if (v === '--desc') a.desc = val();
    else if (v === '--desc-en') a.descEn = val();
    else if (v === '--date') a.date = val();
    else if (v === '--category') a.category = val();
    else if (v === '--tag') a.tags.push(val());
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
  // новые сверху — в этом же порядке страница их и показывает
  r.presentations.sort((x, y) => (y.date || '').localeCompare(x.date || '') || x.slug.localeCompare(y.slug));
  fs.writeFileSync(REGISTRY, JSON.stringify(r, null, 2) + '\n');
};

// ── публикация ───────────────────────────────────────────────────────────────
function publish(a) {
  if (!a.file) die('не указан файл презентации');
  const src = path.resolve(a.file.replace(/^file:\/\//, ''));
  if (!fs.existsSync(src)) die(`файл не найден: ${src}`);
  if (!a.slug) die('нужен --slug: имя файла в ~/dev/docs не годится в URL (там есть review.html и fix_report.html)');
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(a.slug)) die(`slug «${a.slug}»: только строчная латиница, цифры и дефис`);

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

  // Не отказ, а предупреждение: страница работает, но перестаёт быть самодостаточной.
  const ext = [...html.matchAll(/<link[^>]+href=["'](https?:\/\/[^"']+)/gi),
               ...html.matchAll(/<script[^>]+src=["'](https?:\/\/[^"']+)/gi)]
    .map(m => new URL(m[1]).host);
  if (ext.length)
    console.warn(`ВНИМАНИЕ: страница тянет стили или скрипты со стороны — ${[...new Set(ext)].join(', ')}.\n`
      + '  Сайт заявлен как «без внешних запросов»; посетитель уйдёт на этот хост. Лучше вшить в файл.');

  const title = a.title || (html.match(/<title>([^<]*)<\/title>/i)?.[1] || '').trim();
  if (!title) die('в файле нет <title>, а --title не задан');
  if (!a.desc) die('нужен --desc: одна фраза о чём разбор, она попадёт в карточку');
  if (!a.category) die(`нужен --category — блок галереи. Есть: ${CATEGORIES.map(c => c.id).join(', ')}`);
  if (!CATEGORIES.some(c => c.id === a.category))
    die(`нет рубрики «${a.category}». Есть: ${CATEGORIES.map(c => c.id).join(', ')}\n`
      + 'Новая заводится строкой в CATEGORIES внутри этого скрипта.');

  // Дата: явная, иначе из имени файла (скилл его так и называет), иначе сегодня.
  const date = a.date || src.match(/(\d{4}-\d{2}-\d{2})/)?.[1] || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) die(`дата «${date}» не в формате YYYY-MM-DD`);

  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(path.join(DIR, `${a.slug}.html`), html);

  const reg = loadRegistry();
  const entry = {
    slug: a.slug,
    title,
    category: a.category,
    date,
    desc: a.desc,
    descEn: a.descEn || null,
    tags: a.tags,
    // откуда взято — чтобы через полгода было видно, что обновлять
    source: src.replace(process.env.HOME, '~'),
    bytes: Buffer.byteLength(html),
  };
  const i = reg.presentations.findIndex(p => p.slug === a.slug);
  if (i === -1) reg.presentations.push(entry); else reg.presentations[i] = entry;
  saveRegistry(reg);

  console.log(`${i === -1 ? 'опубликовано' : 'обновлено'}: ${a.slug} — «${title}» (${Math.round(entry.bytes / 1024)} КБ)`);
}

function unpublish(slug) {
  const reg = loadRegistry();
  const i = reg.presentations.findIndex(p => p.slug === slug);
  if (i === -1) die(`в реестре нет ${slug}`);
  reg.presentations.splice(i, 1);
  saveRegistry(reg);
  fs.rmSync(path.join(DIR, `${slug}.html`), { force: true });
  // Строка уходит из манифеста при пересборке ниже, а файл, убранный из
  // манифеста, сервер удаляет на следующей выкладке.
  console.log(`снято с публикации: ${slug} (файл исчезнет с сервера после пуша)`);
}

// ── манифест ─────────────────────────────────────────────────────────────────
function rewriteManifest(reg) {
  const text = fs.readFileSync(MANIFEST, 'utf8');
  const at = text.indexOf(MARK);

  // Маркера нет, а пути презентаций есть — значит строку маркера кто-то стёр или
  // покорёжил (в ней рамочные символы U+2500, их легко испортить форматтером или
  // перекодировкой). Дописывать второй блок нельзя: пути задвоятся, и каждый
  // следующий --rebuild будет наращивать файл. Останавливаемся и говорим, что чинить.
  if (at === -1 && /^presentations\//m.test(text))
    die(`в deploy.manifest есть строки presentations/, но нет строки-маркера:\n  ${MARK}\n`
      + 'Верни её перед этими путями — без неё блок не переписать, а второй блок дал бы дубли.');

  const head = (at === -1 ? text : text.slice(0, at)).replace(/\s+$/, '');
  const lines = reg.presentations.length
    ? ['presentations/index.html', ...reg.presentations.map(p => `presentations/${p.slug}.html`)]
    : [];
  fs.writeFileSync(MANIFEST, `${head}\n\n${MARK}\n${lines.join('\n')}${lines.length ? '\n' : ''}`);
}

// ── галерея ──────────────────────────────────────────────────────────────────
// Токены оформления не копируются, а вынимаются из index.html при каждой сборке:
// три набора × две темы живут в одном месте, и галерея не может разъехаться
// с сайтом — тот же приём, что у tools/build-assets.mjs с резюме.
function designTokens() {
  const site = fs.readFileSync(INDEX, 'utf8');
  const from = site.indexOf('/* ─────────────────────────── tokens');
  const to = site.indexOf('*,*::before,*::after{box-sizing:border-box}');
  if (from === -1 || to === -1 || to < from)
    die('в index.html не нашлись границы блока токенов — раскладка страницы изменилась, поправь якоря в publish-presentation.mjs');
  return site.slice(from, to).trim();
}

const card = p => {
  const kb = Math.round(p.bytes / 1024);
  return `      <a class="card" href="${esc(p.slug)}.html">
        <div class="card-top">
          <time class="mono" datetime="${esc(p.date)}">${esc(p.date)}</time>
          <span class="mono size">${kb}&nbsp;КБ</span>
        </div>
        <h3>${esc(p.title)}</h3>
        <p class="desc" data-ru="${esc(p.desc)}" data-en="${esc(p.descEn || p.desc)}">${esc(p.desc)}</p>
        ${p.tags.length ? `<div class="tags">${p.tags.map(t => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
      </a>`;
};

// Каждая рубрика — свой блок с заголовком и пояснением; пустые не выводятся.
function block(cat, items) {
  return `    <section class="block">
      <div class="block-head">
        <h2 class="block-title" data-ru="${esc(cat.ru)}" data-en="${esc(cat.en)}">${esc(cat.ru)}</h2>
        <span class="block-count mono">${items.length}</span>
      </div>
      ${cat.noteRu ? `<p class="block-note" data-ru="${esc(cat.noteRu)}" data-en="${esc(cat.noteEn)}">${esc(cat.noteRu)}</p>` : ''}
      <div class="grid">
${items.map(card).join('\n')}
      </div>
    </section>`;
}

function buildGallery(reg) {
  const list = reg.presentations;
  const groups = [...CATEGORIES, OTHER]
    .map(cat => [cat, list.filter(p => (p.category ?? null) === cat.id)])
    .filter(([, items]) => items.length);

  const body = list.length
    ? groups.map(([cat, items]) => block(cat, items)).join('\n')
    : `    <p class="empty" data-ru="Пока пусто." data-en="Nothing here yet.">Пока пусто.</p>`;

  const html = `<!doctype html>
<html lang="ru" class="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Разборы — Pavel Diordits</title>
<meta name="description" content="Разборы и исследования: самодостаточные html-страницы, каждая про одну тему.">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>◆</text></svg>">
<meta name="theme-color" content="#f6f3f1" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0b0a0a" media="(prefers-color-scheme: dark)">
<link rel="canonical" href="${BASE}">
<meta property="og:type" content="website">
<meta property="og:url" content="${BASE}">
<meta property="og:title" content="Разборы — Pavel Diordits">
<meta property="og:description" content="Разборы и исследования: самодостаточные html-страницы, каждая про одну тему.">
<meta property="og:image" content="https://paveldiordits.site/og.png">
<style>
/* ВНИМАНИЕ: страница собирается tools/publish-presentation.mjs — правки здесь
   затрутся. Меняй шаблон в скрипте и пересобирай: node tools/publish-presentation.mjs --rebuild */

${designTokens()}

*,*::before,*::after{box-sizing:border-box}
html{color-scheme:light}
html.dark{color-scheme:dark}
body{
  margin:0;min-height:100vh;background:var(--bg);color:var(--fg);
  font-family:var(--font-sans);font-size:16px;letter-spacing:-.01em;line-height:1.6;
  -webkit-font-smoothing:antialiased;
  transition:background-color .4s ease,color .4s ease;
}
#bg{
  position:absolute;top:0;left:0;right:0;height:100vh;z-index:0;
  pointer-events:none;background:var(--glow);
  -webkit-mask-image:linear-gradient(180deg,#000 58%,transparent 100%);
          mask-image:linear-gradient(180deg,#000 58%,transparent 100%);
}
header,main,footer{position:relative;z-index:1}
a{color:inherit;text-decoration:none}
button{font:inherit;color:inherit;background:none;border:none;cursor:pointer}
::selection{background:var(--accent);color:var(--accent-fg)}
.wrap{width:100%;max-width:var(--maxw);margin:0 auto;padding:0 1rem}
@media(min-width:640px){.wrap{padding:0 1.5rem}}
@media(min-width:1024px){.wrap{padding:0 2rem}}
.mono{font-family:var(--font-mono)}
.eyebrow{
  font-family:var(--font-mono);font-size:.6875rem;letter-spacing:.14em;
  text-transform:uppercase;color:var(--muted);
}

header{
  position:sticky;top:0;z-index:100;padding:1.25rem 0;
  background:color-mix(in srgb,var(--bg) 82%,transparent);
  backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
  border-bottom:1px solid transparent;transition:border-color .3s ease;
}
header.scrolled{border-bottom-color:var(--border)}
.nav-row{display:flex;align-items:center;justify-content:space-between;gap:1rem}
.home{
  font-size:.75rem;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);
  white-space:nowrap;transition:color .2s ease;
}
.home:hover{color:var(--fg)}
.tools{display:flex;align-items:center;gap:.5rem;flex-shrink:0}
.tool-btn{
  font-family:var(--font-mono);font-size:.6875rem;letter-spacing:.08em;
  text-transform:uppercase;color:var(--muted);border:1px solid var(--border);
  border-radius:999px;padding:.35rem .7rem;white-space:nowrap;
  display:inline-flex;align-items:center;gap:.4rem;
  transition:color .2s ease,border-color .2s ease,background-color .2s ease;
}
.tool-btn:hover{color:var(--fg);border-color:var(--fg)}

/* только longhand: шорткат padding затёр бы горизонтальные отступы .wrap
   (та же специфичность, правило ниже) — и на узком экране текст лёг бы на края */
.hero{padding-top:4rem;padding-bottom:2.5rem}
.hero h1{font-size:clamp(2rem,6vw,3.25rem);line-height:1.05;letter-spacing:-.03em;margin:.6rem 0 1rem;font-weight:700}
.hero p{margin:0;max-width:52ch;color:var(--muted)}

main{padding-bottom:5rem}

/* Рубрики. Разделяет не только заголовок, но и линия с воздухом: блоки должны
   читаться как разные полки, а не как один поток карточек с подписями. */
.block + .block{margin-top:3.5rem;padding-top:3rem;border-top:1px solid var(--border)}
.block-head{display:flex;align-items:baseline;gap:.6rem}
.block-title{font-size:1.375rem;letter-spacing:-.02em;margin:0;font-weight:650}
.block-count{font-size:.6875rem;color:var(--muted)}
.block-note{margin:.4rem 0 1.4rem;max-width:70ch;color:var(--muted);font-size:.9375rem}

.grid{display:grid;gap:1rem;grid-template-columns:1fr}
@media(min-width:700px){.grid{grid-template-columns:repeat(2,1fr)}}
@media(min-width:1100px){.grid{grid-template-columns:repeat(3,1fr)}}

.card{
  display:flex;flex-direction:column;gap:.55rem;
  background:var(--card);border:1px solid var(--border);border-radius:14px;
  padding:1.25rem;transition:background-color .2s ease,border-color .2s ease,transform .2s ease;
}
.card:hover{background:var(--card-hover);border-color:var(--fg);transform:translateY(-2px)}
@media(prefers-reduced-motion:reduce){.card{transition:none}.card:hover{transform:none}}
.card-top{display:flex;justify-content:space-between;align-items:baseline;gap:.75rem;
  font-size:.6875rem;letter-spacing:.08em;color:var(--muted)}
.card h3{font-size:1.0625rem;line-height:1.3;letter-spacing:-.02em;margin:0;font-weight:650}
.card .desc{margin:0;font-size:.9375rem;color:var(--muted)}
.tags{display:flex;flex-wrap:wrap;gap:.35rem;margin-top:.35rem}
.tags span{
  font-family:var(--font-mono);font-size:.625rem;letter-spacing:.06em;text-transform:uppercase;
  color:var(--muted);border:1px solid var(--border);border-radius:999px;padding:.15rem .5rem;
}
.empty{color:var(--muted)}

footer{border-top:1px solid var(--border);padding:2rem 0;color:var(--muted);font-size:.8125rem}
.foot-row{display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap}
</style>
</head>
<body>
<div id="bg" aria-hidden="true"></div>

<header id="site-header">
  <div class="wrap nav-row">
    <a class="home" href="https://paveldiordits.site/" data-ru="← Pavel Diordits" data-en="← Pavel Diordits">← Pavel Diordits</a>
    <div class="tools">
      <button class="tool-btn" id="design-toggle" type="button"></button>
      <button class="tool-btn" id="lang-toggle" type="button"></button>
      <button class="tool-btn" id="theme-toggle" type="button"></button>
    </div>
  </div>
</header>

<main>
  <section class="wrap hero">
    <span class="eyebrow" data-ru="Разборы" data-en="Writeups">Разборы</span>
    <h1 data-ru="Разборы и исследования" data-en="Writeups &amp; research">Разборы и исследования</h1>
    <p data-ru="Каждая страница — самодостаточный разбор одной темы: собственная вёрстка, свои темы оформления, список источников в конце. Ничего не подгружается со стороны."
       data-en="Each page is a self-contained writeup on a single topic: its own layout, its own theming, sources listed at the end. Nothing is loaded from anywhere else.">Каждая страница — самодостаточный разбор одной темы: собственная вёрстка, свои темы оформления, список источников в конце. Ничего не подгружается со стороны.</p>
  </section>

  <section class="wrap">
${body}
  </section>
</main>

<footer>
  <div class="wrap foot-row">
    <span id="foot-left"></span>
    <span data-ru="Каждый разбор — один файл · без трекеров"
          data-en="Every writeup is a single file · no trackers">Каждый разбор — один файл · без трекеров</span>
  </div>
</footer>

<script>
// Тема, язык и набор оформления берутся из тех же ключей localStorage, что и на
// основном сайте, — переход между страницами не сбрасывает выбор. У самих
// презентаций ключи свои, с префиксом (fg-theme, pl-theme), так что не спорят.
const DESIGNS = [
  { id:'two-sources', ru:'Два света', en:'Two sources' },
  { id:'cold-leak',   ru:'Засветка',  en:'Cold leak' },
  { id:'dawn-fog',    ru:'Рассвет',   en:'Dawn fog' },
];
const $ = s => document.querySelector(s);
const ls = {
  get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
};

// Умолчание — как на основном сайте: английский. Заголовки разборов остаются
// на языке оригинала, переводится только хром страницы.
let lang = ls.get('lang') || 'en';

function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-ru]').forEach(el => {
    const v = el.dataset[lang];
    if (v != null) el.textContent = v;
  });
  $('#lang-toggle').textContent = lang === 'ru' ? 'EN' : 'RU';
  syncDesignLabel();
}

function designIndex() {
  const i = DESIGNS.findIndex(d => d.id === ls.get('design'));
  return i === -1 ? 0 : i;
}
function applyDesign(i) {
  const d = DESIGNS[(i + DESIGNS.length) % DESIGNS.length];
  document.documentElement.dataset.design = d.id;
  ls.set('design', d.id);
  syncDesignLabel();
}
function syncDesignLabel() {
  const i = designIndex(), d = DESIGNS[i];
  $('#design-toggle').textContent = (i + 1) + '/' + DESIGNS.length + ' · ' + (d[lang] ?? d.en);
}

function applyTheme(dark) {
  document.documentElement.classList.toggle('dark', dark);
  ls.set('theme', dark ? 'dark' : 'light');
  $('#theme-toggle').textContent = dark ? '☾' : '☀';
}

// Стартовое состояние: сохранённый выбор, иначе системная тема.
const savedTheme = ls.get('theme');
applyTheme(savedTheme ? savedTheme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
applyDesign(designIndex());
applyLang();

$('#theme-toggle').onclick = () => applyTheme(!document.documentElement.classList.contains('dark'));
$('#design-toggle').onclick = () => applyDesign(designIndex() + 1);
$('#lang-toggle').onclick = () => { lang = lang === 'ru' ? 'en' : 'ru'; ls.set('lang', lang); applyLang(); };

$('#foot-left').textContent = '© ' + new Date().getFullYear() + ' Pavel Diordits';

addEventListener('scroll', () => {
  $('#site-header').classList.toggle('scrolled', scrollY > 8);
}, { passive: true });
</script>
</body>
</html>
`;
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(path.join(DIR, 'index.html'), html);
}

// ── ход ──────────────────────────────────────────────────────────────────────
const a = parseArgs(process.argv.slice(2));
if (a.unpublish) unpublish(a.unpublish);
else if (!a.rebuild) publish(a);

const reg = loadRegistry();
buildGallery(reg);
rewriteManifest(reg);
console.log(`галерея пересобрана: ${reg.presentations.length} шт. → presentations/index.html, deploy.manifest обновлён`);
