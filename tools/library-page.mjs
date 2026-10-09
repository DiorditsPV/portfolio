// Страница «Библиотека» — все позиции каталога из выпусков Agents Weekly одним
// списком с поиском, фильтрами и сортировкой.
//
// Каждый выпуск дайджеста описывает свои находки и не повторяет прошлые, поэтому
// накопленное знание о скиллах и плагинах размазано по выпускам: чтобы найти
// «что было про память агентов», пришлось бы открыть все по очереди. Библиотека
// собирает позиции из всех выпусков в одно место.
//
// Данные не ведутся отдельно: при каждой сборке журнала их заново вынимает из
// опубликованных выпусков tools/catalog-extract.mjs. Вышел выпуск — его позиции
// появились здесь без единого ручного шага.
//
// Темы. В выпусках у позиции свободная метка темы, и за восемь выпусков их
// набралось 266, из них 188 встречаются один раз, — для фильтра это не годится.
// Поэтому метки сведены в полтора десятка групп правилами ниже; исходная метка
// остаётся на позиции и участвует в поиске. Правила проверяются по порядку,
// берётся первая подошедшая группа; метка, не подошедшая ни к одной, попадает в
// «Предметные области».

import { BASE_CSS, siteHeader, plural, THEME_BOOT, SHELL_JS } from './journal-page.mjs';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const GROUPS = [
  ['Скиллы о скиллах', /скилл|каталог|сборник|маркетплейс|инвентарь|шаблон|экосистем|инструмент/i],
  ['Видео и медиа', /видео|медиа|анимац|моушн|музык|3D|изображ|иллюстр|рисован|аватар|фото|скриншот|запись экрана|изометр|генеративн/i],
  ['Дизайн и интерфейс', /дизайн|UI|типограф|интерфейс|слайд|презентац|диаграм|визуал|график|бренд|фронтенд|веб|React|TUI|подача|объяснен|конспект/i],
  ['Память и контекст', /памят|знани|контекст|compaction|handoff|истори|заметки|Obsidian|данные сессий/i],
  ['Оркестрация и мульти-агентность', /оркестрац|мульти-агент|координац|взаимодействие агентов|фоновые агенты|воркфлоу|worktree|маршрутизац|платформа агентов|Claude \+ Codex|совместн/i],
  ['Расход и наблюдаемость', /расход|квот|лимит|токен|наблюдаем|мониторинг|метрик|дашборд|статус-строка|надзор|уведомлен|контроль агентов|контроль решений/i],
  ['Качество кода и проверка', /код-качество|качеств|ревью|тест|провер|рефактор|оценка|поиск по коду|навигация по коду|pull request|реверс|верификац/i],
  ['Безопасность и права', /безопасн|приватн|секрет|разрешен|права|песочниц|аудит|происхожден/i],
  ['Процесс и практики', /процесс|практик|планир|правила|брейн|эксплуатац|деплой|инфраструктур|публикац|продукт/i],
  ['Интеграции и платформы', /интеграц|MCP|браузерный|computer use|бот|AWS|SAP|SaaS|low-code|вендор|Laravel|Flutter|Android|iOS|macOS|мобильн|Rust|1С|модели решений|модель Jev/i],
  ['Моды и оболочка CLI', /мод|хук|эргономик|кастомиз|GUI|рабочее место|удалённый доступ|системный промпт|провайдер|прокси/i],
  ['Тексты и документация', /письмо|док|текст|редактур|стиль|чтение|язык|локализац|отчёт|промпт/i],
  ['Обучение', /обучен/i],
  ['Предметные области', /./],
];
const NO_TOPIC = GROUPS.length;       // у официальных обновлений и исследований темы нет
const groupOf = tag => tag ? GROUPS.findIndex(([, re]) => re.test(tag)) : NO_TOPIC;

const KINDS = { skill: 'Скилл', plugin: 'Плагин', official: 'Официальное', research: 'Исследование' };

// В страницу уходит только то, что нужно списку: короткие ключи экономят сотни
// килобайт на девятистах позициях.
const pack = it => {
  const last = it.issues.at(-1);
  return {
    n: it.name, u: it.url, k: it.kind, t: it.tag, g: groupOf(it.tag),
    s: it.stars, p: it.points, d: it.desc, h: it.short ? 1 : 0, f: it.flag || null,
    i: last.no, a: last.slug, e: last.date,
  };
};

export function libraryPage({ catalog, base, author, ogImage }) {
  // Позиция без адреса — не репозиторий, а сюжет, записанный в каталог выпуска
  // («волна из 132 репозиториев»): открыть по ней нечего, в библиотеке ей не место.
  const rows = catalog.items.filter(it => it.url).map(pack);
  const issues = [...new Map(rows.map(r => [r.i, { no: r.i, slug: r.a, date: r.e }])).values()].sort((a, b) => b.no - a.no);
  const title = 'Библиотека — скиллы и плагины из Agents Weekly';
  const about = `${rows.length} ${plural(rows.length, 'позиция', 'позиции', 'позиций')} из ${issues.length} выпусков Agents Weekly: скиллы, плагины, официальные обновления и исследования.`;
  const groupNames = [...GROUPS.map(g => g[0]), 'Без темы'];

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
<link rel="canonical" href="${base}library.html">
<link rel="preload" href="fonts/golos-text.woff2" as="font" type="font/woff2" crossorigin>
<meta name="robots" content="index, follow">
<meta property="og:type" content="website">
<meta property="og:url" content="${base}library.html">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(about)}">
<meta property="og:image" content="${ogImage}">
<style>
/* ВНИМАНИЕ: страница собирается tools/publish-presentation.mjs из tools/library-page.mjs.
   Правки здесь затрутся — меняй шаблон и прогоняй --rebuild. */

${BASE_CSS}
.mast{padding-block:2.25rem 1.25rem}
.back{color:var(--muted);font-size:.9rem}
.back:hover{color:var(--link)}
.mast h1{margin-top:.5rem;font-size:2rem;line-height:1.1;letter-spacing:-.035em;font-weight:750}
.mast p{margin-top:.5rem;color:var(--muted)}

/* ── панель отбора: прилипает под шапкой, пока листается список ── */
/* Прилипает только строка поиска и сортировки: вся панель с темами занимала бы
   пятую часть экрана всё время, пока листается список. */
.panel{padding-bottom:.9rem}
.bar2{position:sticky;top:3.5rem;z-index:10;background:var(--bg);border-top:1px solid var(--rule);padding-block:.9rem .75rem}
.panel-end{border-bottom:1px solid var(--rule)}
.line{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem .6rem}
.line+.line{margin-top:.65rem}
.search{flex:1 1 18rem;min-width:0;font:inherit;color:inherit;background:var(--field);border:1px solid var(--rule);border-radius:.5rem;padding:.5rem .8rem}
.search::placeholder{color:var(--muted)}
.search:focus{outline:2px solid var(--link);outline-offset:1px;background:var(--bg)}
.seg{display:flex;gap:.35rem}
.chip{font:inherit;font-size:.85rem;color:var(--fg);background:var(--bg);border:1px solid var(--rule);border-radius:.5rem;padding:.3rem .65rem;cursor:pointer;white-space:nowrap}
.chip small{color:var(--muted);font-size:.9em;margin-left:.3em;font-variant-numeric:tabular-nums}
.chip:hover{border-color:var(--fg)}
.chip[aria-pressed="true"]{background:var(--fg);border-color:var(--fg);color:var(--bg)}
.chip[aria-pressed="true"] small{color:inherit;opacity:.7}
.found{color:var(--muted);font-size:.9rem;font-variant-numeric:tabular-nums;white-space:nowrap}
.reset{font:inherit;font-size:.9rem;color:var(--link);background:none;border:0;padding:0;cursor:pointer}
.reset:hover{text-decoration:underline;text-underline-offset:.25em}
.reset[hidden]{display:none}

/* ── список ── */
.list{padding-block:.25rem 4rem}
.it{display:grid;grid-template-columns:5rem minmax(0,1fr);gap:.2rem 1.1rem;padding:.95rem 0;border-bottom:1px solid var(--rule)}
.num{grid-row:1/span 2;align-self:start;text-align:right;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.num small{display:block;font-weight:500;font-size:.75rem;color:var(--muted)}
.num.none{color:var(--muted);font-weight:500}
.head{display:flex;flex-wrap:wrap;align-items:baseline;gap:.15rem .7rem;min-width:0}
.head a.name{font-weight:650;font-size:1.05rem;letter-spacing:-.01em;overflow-wrap:anywhere}
.head a.name:hover{color:var(--link)}
/* тема позиции — одно-два слова сразу за названием: по ней видно, о чём позиция, без чтения описания */
.topic{font-size:.82rem;font-weight:600;color:var(--fg);background:var(--field);border:1px solid var(--rule);border-radius:.35rem;padding:.05rem .5rem;white-space:nowrap}
.tags{display:flex;flex-wrap:wrap;gap:.15rem .7rem;font-size:.82rem;color:var(--muted)}
.tags a:hover{color:var(--link)}
.flag{color:var(--warn);font-weight:600}
/* описание набрано основным цветом: серым на этом кегле оно читалось с усилием */
.desc{color:var(--fg);font-size:.95rem}
.desc.clamp{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.more{grid-column:2;font:inherit;font-size:.82rem;color:var(--link);background:none;border:0;padding:0;margin-top:.15rem;cursor:pointer;justify-self:start}
.empty{padding:3rem 0;color:var(--muted)}
.empty b{color:var(--fg)}
@media(max-width:560px){
  .it{grid-template-columns:minmax(0,1fr)}
  .num{grid-row:auto;text-align:left}
  .more{grid-column:1}
  .num small{display:inline;margin-left:.4em}
  .bar2{position:static}
}
footer{border-top:1px solid var(--rule);padding-block:1.5rem 2.5rem;color:var(--muted);font-size:.85rem}
footer a{color:var(--link)}
</style>
</head>
<body>
${siteHeader()}

<main>
  <div class="wrap mast">
    <a class="back" href="./">← Журнал</a>
    <h1>Библиотека</h1>
    <p>${esc(about)} Звёзды — на день выпуска, в котором позиция описана.</p>
  </div>

  <div class="bar2">
    <div class="wrap">
      <div class="line">
        <input class="search" id="q" type="search" placeholder="Поиск по названию, теме и описанию" autocomplete="off" aria-label="Поиск по библиотеке">
        <div class="seg" id="sort" role="group" aria-label="Сортировка"></div>
        <button class="chip" id="full" type="button" aria-pressed="false">С подробным разбором</button>
        <span class="found" id="found"></span>
        <button class="reset" id="reset" type="button" hidden>Сбросить</button>
      </div>
    </div>
  </div>
  <div class="panel panel-end">
    <div class="wrap">
      <div class="line" id="kinds" role="group" aria-label="Вид позиции"></div>
      <div class="line" id="groups" role="group" aria-label="Тема"></div>
    </div>
  </div>

  <div class="wrap">
    <ol class="list" id="list"></ol>
  </div>
</main>

<footer>
  <div class="wrap">Собрано из выпусков <a href="./">журнала</a> автоматически · © <span id="copy"></span> ${esc(author.name)}</div>
</footer>

<script type="application/json" id="data">${JSON.stringify(rows).replace(/</g, '\\u003c')}</script>
<script>
${SHELL_JS}
const ROWS = JSON.parse(document.getElementById('data').textContent);
const KINDS = ${JSON.stringify(KINDS)};
const GROUPS = ${JSON.stringify(groupNames)};
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
$('copy').textContent = new Date().getFullYear();

// Состояние отбора живёт в адресе страницы: ссылку на выборку можно сохранить,
// а кнопка «назад» возвращает прежний отбор.
const state = { q: '', sort: 'stars', full: false, kinds: new Set(), groups: new Set() };
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  state.q = p.get('q') || ''; state.sort = p.get('sort') || 'stars';
  state.full = p.get('full') === '1';
  state.kinds = new Set((p.get('kind') || '').split(',').filter(Boolean));
  state.groups = new Set((p.get('topic') || '').split(',').filter(Boolean).map(Number));
}
function writeHash() {
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  if (state.sort !== 'stars') p.set('sort', state.sort);
  if (state.full) p.set('full', '1');
  if (state.kinds.size) p.set('kind', [...state.kinds].join(','));
  if (state.groups.size) p.set('topic', [...state.groups].join(','));
  history.replaceState(null, '', p.size ? '#' + p : location.pathname);
}

for (const r of ROWS) r.x = (r.n + ' ' + (r.t || '') + ' ' + r.d).toLowerCase();

// Отбор без одного из измерений: счётчик на кнопке показывает, сколько позиций
// даст её нажатие при остальных выбранных условиях.
function match(r, skip) {
  if (state.q && !state.q.toLowerCase().split(/\\s+/).every(w => r.x.includes(w))) return false;
  if (state.full && r.h) return false;
  if (skip !== 'kind' && state.kinds.size && !state.kinds.has(r.k)) return false;
  if (skip !== 'group' && state.groups.size && !state.groups.has(r.g)) return false;
  return true;
}

const SORT_NAMES = { stars: 'По звёздам', new: 'Свежие выпуски', name: 'По названию' };
const SORTS = {
  stars: (a, b) => (b.s ?? b.p ?? -1) - (a.s ?? a.p ?? -1) || a.n.localeCompare(b.n),
  new: (a, b) => b.i - a.i || (b.s ?? -1) - (a.s ?? -1),
  name: (a, b) => a.n.localeCompare(b.n),
};

function chips(box, keys, label, counts, active, kind) {
  box.innerHTML = keys.filter(k => counts.get(k) || active.has(k)).map(k =>
    '<button class="chip" type="button" data-' + kind + '="' + k + '" aria-pressed="' + active.has(k) + '">'
    + esc(label(k)) + '<small>' + (counts.get(k) || 0) + '</small></button>').join('');
}

const numCell = r => r.s != null ? '<div class="num">★ ' + r.s.toLocaleString('ru-RU') + '</div>'
  : r.p != null ? '<div class="num">' + r.p + '<small>очков</small></div>'
  : '<div class="num none">—</div>';

function item(r) {
  const name = r.u ? '<a class="name" href="' + esc(r.u) + '" rel="noopener">' + esc(r.n) + '</a>' : '<span class="name">' + esc(r.n) + '</span>';
  return '<li class="it">' + numCell(r)
    + '<div class="head">' + name + (r.t ? '<span class="topic">' + esc(r.t) + '</span>' : '')
    + '<span class="tags"><span>' + KINDS[r.k] + '</span>'
    + (r.f ? '<span class="flag">' + esc(r.f) + '</span>' : '')
    + '<a href="' + esc(r.a) + '.html">выпуск №' + r.i + '</a></span></div>'
    + '<p class="desc' + (r.d.length > 260 ? ' clamp' : '') + '">' + esc(r.d) + '</p>'
    + (r.d.length > 260 ? '<button class="more" type="button" aria-expanded="false">развернуть</button>' : '')
    + '</li>';
}

function render() {
  const count = (skip, key) => { const m = new Map(); for (const r of ROWS) if (match(r, skip)) m.set(r[key], (m.get(r[key]) || 0) + 1); return m; };
  chips($('kinds'), Object.keys(KINDS), k => KINDS[k], count('kind', 'k'), state.kinds, 'kind');
  chips($('groups'), GROUPS.map((_, i) => i), i => GROUPS[i], count('group', 'g'), state.groups, 'group');
  const out = ROWS.filter(r => match(r)).sort(SORTS[state.sort]);
  $('found').textContent = out.length === ROWS.length ? ROWS.length + ' позиций' : out.length + ' из ' + ROWS.length;
  $('list').innerHTML = out.length ? out.map(item).join('')
    : '<li class="empty"><b>Ничего не нашлось.</b> Уберите часть условий или сбросьте отбор.</li>';
  $('reset').hidden = !(state.q || state.full || state.kinds.size || state.groups.size);
  $('q').value = state.q; $('full').setAttribute('aria-pressed', state.full);
  $('sort').innerHTML = Object.entries(SORT_NAMES).map(([k, n]) =>
    '<button class="chip" type="button" data-sort="' + k + '" aria-pressed="' + (state.sort === k) + '">' + n + '</button>').join('');
  writeHash();
}

let timer;
$('q').addEventListener('input', e => { state.q = e.target.value.trim(); clearTimeout(timer); timer = setTimeout(render, 120); });
$('full').addEventListener('click', () => { state.full = !state.full; render(); });
$('reset').addEventListener('click', () => { Object.assign(state, { q: '', full: false }); state.kinds.clear(); state.groups.clear(); render(); });
document.addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (chip && chip.id === 'full') return;
  if (chip && chip.dataset.sort) { state.sort = chip.dataset.sort; return render(); }
  if (chip) {
    const set = chip.dataset.kind ? state.kinds : state.groups, key = chip.dataset.kind || +chip.dataset.group;
    set.has(key) ? set.delete(key) : set.add(key);
    return render();
  }
  const more = e.target.closest('.more');
  if (more) {
    const open = more.previousElementSibling.classList.toggle('clamp') === false;
    more.textContent = open ? 'свернуть' : 'развернуть';
    more.setAttribute('aria-expanded', open);
  }
});
addEventListener('hashchange', () => { readHash(); render(); });
readHash(); render();
</script>
</body>
</html>
`;
}
