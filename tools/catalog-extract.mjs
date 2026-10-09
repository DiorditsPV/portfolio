// Каталог Agents Weekly одним плоским списком: скиллы, плагины, официальные
// обновления и исследования из всех опубликованных выпусков.
//
//   node tools/catalog-extract.mjs       записать .build/catalog.json и напечатать сводку
//
//   import { extractCatalog } from './catalog-extract.mjs';
//   const { raw, items, problems } = extractCatalog(root);
//
// Зачем. Каждый выпуск — отдельная страница, и позиция, найденная месяц назад,
// достаётся только листанием. Библиотеке с фильтрами нужен один список, где у
// позиции есть вид, тема, звёзды и выпуск. Выпуски уже свёрстаны и опубликованы,
// поэтому список собирается из их html, а не из исходных данных прогонов: что
// читатель видел на странице, то и попадает в библиотеку.
//
// Что возвращается.
//
//   raw       позиция на каждое появление в выпуске, с полем issue { slug, no, date };
//   items     то же, склеенное по адресу: один адрес — одна запись, у неё поле
//             issues [{ slug, no, date, stars }] от старых выпусков к новым, а
//             name, kind, tag, desc, stars, points, short — из самого свежего;
//   problems  всё, что стоит в разделах каталога, но позицией не стало, с куском
//             исходной строки, — чтобы потери были видны, а не молчали.
//
// Номер выпуска — порядок по дате внутри серии в presentations.json, самый
// старый — первый. Нумерация не хранится в реестре, поэтому считается здесь.
//
// Вид позиции задаётся разделом выпуска, в котором она стоит:
//
//   #skills    skill
//   #plugins   plugin
//   #official  official
//   #arts      research
//
// Разметка от выпуска к выпуску менялась, и разбор знает все встреченные формы.
//
//   Подробная позиция — <div class="item">. Звёзды и очки обсуждения лежат то в
//   <span class="stars">, то в <div class="stars">, число пишется и «★ 1185», и
//   «★3294». Блок вырезается счётом вложенных <div>, а не до первого </div></div>:
//   там, где звёзды свёрстаны блоком, вложенность на уровень глубже.
//
//   Короткая позиция — <li> в <ul class="tail">. В одних выпусках ссылка, тема и
//   описание идут подряд, в других ссылка и тема вложены в <span class="desc">, а
//   описание начинается с тире. В выпуске от 4 сентября обе формы стоят в одном
//   списке. Ссылка и тема берутся там, где нашлись, из описания вынимаются.
//
//   Официальные обновления свёрстаны прозой, без class="item". Позицией считается
//   абзац или пункт списка, который начинается со ссылки (перед ней допускается
//   <b> и предлог «В»), и только в блоках «anthropics/skills» и
//   «claude-plugins-official». Блоки «Anthropic за неделю», «Кого зовут в
//   маркетплейс» и «Claude Managed Agents» — новости компании, а не позиции
//   каталога, и пропускаются. Пункт, где ссылка стоит в середине фразы, попадает
//   в problems: угадывать, какая из ссылок фразы — её предмет, ненадёжно.
//
//   В исследованиях на месте темы иногда стоит дата («27.08»). Дата темой не
//   считается, tag у такой позиции — null.
//
//   У позиции бывает вторая плашка — предупреждение или сигнал поверх темы
//   («curl | sh», «известный автор»). Она уходит в поле flag.
//
//   Плашка исследования несёт то очки обсуждения, то дату, то одно название
//   источника. В points попадает только число очков, источник — в source.
//
// Склейка идёт по адресу без протокола и завершающего слеша, регистр хоста и
// пути не различается: GitHub отдаёт один репозиторий по любому регистру.
// Строка запроса сохраняется как есть — у ссылок вида item?id=… она и есть адрес.
// Если адрес встретился в одном выпуске дважды, в issues выпуск стоит один раз,
// а вид остаётся от первого появления. Позиция без адреса не склеивается.
//
// html разбирается регулярными выражениями и счётом тегов: выпуски собирает один
// генератор, разметка в них ровная, а зависимость ради восьми файлов не нужна.

import fs from 'node:fs';
import path from 'node:path';

const SERIES = 'Agents Weekly';

const KIND_BY_SECTION = { skills: 'skill', plugins: 'plugin', official: 'official', arts: 'research' };

// Блоки раздела «Официальные», в которых перечислены позиции каталога.
const OFFICIAL_BLOCKS = /^(anthropics\/skills|claude-plugins-official)/;

// ── Текст из html ──────────────────────────────────────────────────────────

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '—', ndash: '–', hellip: '…', laquo: '«', raquo: '»', minus: '−',
  times: '×', rarr: '→', larr: '←', star: '☆', starf: '★', thinsp: ' ',
};

const decode = s => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&([a-z]+);/gi, (m, n) => NAMED[n] ?? NAMED[n.toLowerCase()] ?? m);

// Чистый текст: теги убраны, сущности раскодированы, пробелы схлопнуты.
const text = html => decode(String(html ?? '').replace(/<[^>]+>/g, ''))
  .replace(/[\s ]+/g, ' ')
  .trim();

// Первое целое в строке: «★ 1185» → 1185, «★3294» → 3294. Нет цифр — null.
const firstInt = s => {
  const m = /\d[\d\s ]*/.exec(String(s ?? ''));
  return m ? Number(m[0].replace(/\D/g, '')) : null;
};

// Кусок исходной строки для отчёта о неразобранном.
const sample = html => String(html).replace(/\s+/g, ' ').trim().slice(0, 240);

// Дата на месте темы: «27.08», «27.08.2026».
const isDate = s => /^\d{1,2}\.\d{2}(\.\d{2,4})?$/.test(s);

// ── Вырезание блоков ───────────────────────────────────────────────────────

// Содержимое парного тега, открытого в позиции start, со счётом вложенных
// одноимённых тегов. Возвращает { inner, end } или null, если пара не закрыта.
function balanced(html, start, tag) {
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  re.lastIndex = start;
  let depth = 0, innerFrom = -1, m;
  while ((m = re.exec(html))) {
    if (m[1]) {
      depth--;
      if (depth === 0) return { inner: html.slice(innerFrom, m.index), end: re.lastIndex };
    } else {
      if (depth === 0) innerFrom = re.lastIndex;
      depth++;
    }
  }
  return null;
}

// Все блоки, открывающий тег которых подходит под openRe (с флагом g).
function blocks(html, openRe, tag) {
  const out = [];
  let m;
  openRe.lastIndex = 0;
  while ((m = openRe.exec(html))) {
    const b = balanced(html, m.index, tag);
    if (!b) break;
    out.push(b.inner);
    openRe.lastIndex = b.end;
  }
  return out;
}

// Прямые пункты списка: <li> верхнего уровня, вложенные списки остаются внутри.
const listItems = ul => blocks(ul, /<li\b[^>]*>/gi, 'li');

// Разделы выпуска: { id: html }.
function sections(html) {
  const out = {};
  for (const m of html.matchAll(/<section\b[^>]*\bid="([^"]+)"[^>]*>/g)) {
    const b = balanced(html, m.index, 'section');
    if (b) out[m[1]] = b.inner;
  }
  return out;
}

// Первая ссылка куска: { url, name, full } или null.
function firstLink(html) {
  const m = /<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i.exec(html);
  return m ? { url: decode(m[1]).trim(), name: text(m[2]), full: m[0], index: m.index } : null;
}

// Плашки позиции: <span class="tag"> и <span class="tag warm">. Первая — тема.
// Вторая, когда она есть, — отметка поверх темы: «curl | sh», «токены OAuth»,
// «известный автор»; она уходит в поле flag и в фильтр по темам не попадает.
// Дата темой не считается. cut — html без плашек, чтобы их текст не оказался в
// названии или описании.
function readTags(html) {
  const re = /<span class="tag(?:\s[^"]*)?">([\s\S]*?)<\/span>/gi;
  const found = [...html.matchAll(re)].map(m => text(m[1])).filter(Boolean);
  const dated = found.length > 0 && isDate(found[0]);
  return {
    tag: found.length && !dated ? found[0] : null,
    flag: found[1] ?? null,
    dated,
    cut: html.replace(re, ' '),
  };
}

// Плашка исследования. Форм четыре: «193<small>HN</small>» — очки обсуждения;
// «26.08<small>simonw</small>» и «arXiv<small>29.09</small>» — дата и источник в
// любом порядке; «блог» — один источник; «—<small>блог</small>» — прочерк.
// Очками считается только целое число на первом месте: дата «26.08» дала бы
// 26 очков материалу, у которого их нет. Источник — первое слово, не похожее ни
// на число, ни на дату; у очков это площадка обсуждения («HN»).
function parsePts(html) {
  const small = /<small[^>]*>([\s\S]*?)<\/small>/i.exec(html);
  const head = text(small ? html.replace(small[0], ' ') : html);
  const tail = small ? text(small[1]) : '';
  const points = /^\d+$/.test(head) ? Number(head) : null;
  const label = [head, tail].find(s => s && /\p{L}/u.test(s)) ?? null;
  // «ОЧКОВ HN», «ОЧКА HN» → «HN».
  const source = label ? label.replace(/^очк\S*\s+/i, '') : null;
  return { points, source };
}

// ── Три формы позиции ──────────────────────────────────────────────────────

// Подробная позиция: звёзды или очки, заголовок со ссылкой и темой, описание.
function parseItem(inner, kind, problems, where) {
  const meter = /<(span|div) class="(stars|pts)[^"]*">([\s\S]*?)<\/\1>/i.exec(inner);
  const h4 = /<h4\b[^>]*>([\s\S]*?)<\/h4>/i.exec(inner);
  if (!h4) {
    problems.push({ ...where, why: 'позиция без заголовка', html: sample(inner) });
    return null;
  }
  const link = firstLink(h4[1]);
  const { tag, flag, dated, cut } = readTags(h4[1]);
  let rest = inner.replace(h4[0], ' ');
  if (meter) rest = rest.replace(meter[0], ' ');

  let stars = null, points = null, source = null;
  if (meter && meter[2] === 'stars') stars = firstInt(meter[3]);
  if (meter && meter[2] === 'pts') ({ points, source } = parsePts(meter[3]));

  return {
    // Заголовок без ссылки — сюжет о группе репозиториев: адреса у него нет,
    // названием служит сам заголовок.
    name: link ? link.name : text(cut),
    url: link ? link.url : null,
    kind,
    tag,
    ...(flag ? { flag } : {}),
    stars,
    points,
    ...(kind === 'research' ? { source } : {}),
    desc: text(rest),
    short: false,
    ...(dated ? { tagWasDate: true } : {}),
  };
}

// Короткая позиция из списка «Коротко».
function parseTail(li, kind, problems, where) {
  const st = /<span class="st">([\s\S]*?)<\/span>/i.exec(li);
  const link = firstLink(li);
  if (!link) {
    problems.push({ ...where, why: 'короткая позиция без ссылки', html: sample(li) });
    return null;
  }
  const { tag, flag, cut } = readTags(li.replace(link.full, ' '));
  // Описание — всё, что осталось от пункта без звёзд, ссылки и плашек. Так обе
  // формы пункта сводятся к одной: неважно, снаружи <span class="desc"> стояли
  // ссылка и тема или внутри.
  const rest = st ? cut.replace(st[0], ' ') : cut;
  return {
    name: link.name,
    url: link.url,
    kind,
    tag,
    ...(flag ? { flag } : {}),
    stars: st ? firstInt(st[1]) : null,
    points: null,
    desc: text(rest).replace(/^[—–-]\s*/, ''),
    short: true,
  };
}

// Официальные обновления: абзацы и пункты, начинающиеся со ссылки.
function parseOfficial(section, problems, where) {
  const out = [];
  // Раздел режется по заголовкам <h3>: блок — от заголовка до следующего.
  const parts = section.split(/(?=<h3\b)/i).slice(1);
  for (const part of parts) {
    const h3 = /<h3\b[^>]*>([\s\S]*?)<\/h3>/i.exec(part);
    const title = text(h3 ? h3[1] : '');
    if (!OFFICIAL_BLOCKS.test(title)) continue;
    const body = part.slice(h3.index + h3[0].length);

    // Кандидаты — пункты списков верхнего уровня и абзацы вне списков.
    const cands = [];
    let outside = body;
    for (const ul of blocks(body, /<ul\b[^>]*>/gi, 'ul')) {
      outside = outside.replace(ul, ' ');
      cands.push(...listItems(ul));
    }
    for (const m of outside.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) cands.push(m[1]);

    for (const c of cands) {
      const link = firstLink(c);
      if (!link) continue;                       // фоновая строка без ссылок
      // Что стоит перед ссылкой: пусто, <b> или предлог «В».
      const lead = text(c.slice(0, link.index));
      if (lead && lead !== 'В') {
        problems.push({ ...where, block: title, why: 'официальное обновление: ссылка не в начале фразы', html: sample(c) });
        continue;
      }
      const rest = c.slice(link.index + link.full.length);
      const more = (rest.match(/<a\b/gi) || []).length;
      out.push({
        name: link.name,
        url: link.url,
        kind: 'official',
        tag: null,
        stars: null,
        points: null,
        desc: text(rest).replace(/^[—–-]\s*/, ''),
        short: false,
        block: title.split(/\s+—\s+/)[0],
        ...(more ? { moreLinks: more } : {}),
      });
    }
  }
  return out;
}

// ── Выпуск целиком ─────────────────────────────────────────────────────────

function extractIssue(html, issue, problems) {
  const out = [];
  const secs = sections(html);
  for (const [id, kind] of Object.entries(KIND_BY_SECTION)) {
    const sec = secs[id];
    const where = { slug: issue.slug, section: id };
    if (sec == null) {
      problems.push({ ...where, why: 'в выпуске нет раздела', html: '' });
      continue;
    }
    let found;
    if (kind === 'official') {
      found = parseOfficial(sec, problems, where);
    } else {
      found = [];
      for (const inner of blocks(sec, /<div class="item"[^>]*>/gi, 'div')) {
        const it = parseItem(inner, kind, problems, where);
        if (it) found.push(it);
      }
      for (const ul of blocks(sec, /<ul class="tail"[^>]*>/gi, 'ul')) {
        for (const li of listItems(ul)) {
          const it = parseTail(li, kind, problems, where);
          if (it) found.push(it);
        }
      }
    }
    for (const it of found) out.push({ ...it, issue });
  }
  return out;
}

// Ключ склейки: хост и путь в нижнем регистре, без протокола и завершающего
// слеша; строка запроса — как есть.
export function urlKey(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.host.toLowerCase() + u.pathname.toLowerCase().replace(/\/+$/, '') + u.search;
  } catch {
    return String(url).trim().toLowerCase().replace(/\/+$/, '');
  }
}

// Выпуски серии из реестра, от старых к новым, с номерами.
export function listIssues(root) {
  const reg = JSON.parse(fs.readFileSync(path.join(root, 'presentations.json'), 'utf8'));
  return reg.presentations
    .filter(p => p.series === SERIES)
    .sort((a, b) => a.date.localeCompare(b.date) || a.slug.localeCompare(b.slug))
    .map((p, i) => ({ slug: p.slug, no: i + 1, date: p.date }));
}

export function extractCatalog(root) {
  const problems = [];
  const raw = [];
  for (const issue of listIssues(root)) {
    const file = path.join(root, 'presentations', `${issue.slug}.html`);
    if (!fs.existsSync(file)) {
      problems.push({ slug: issue.slug, section: null, why: 'нет файла выпуска', html: file });
      continue;
    }
    raw.push(...extractIssue(fs.readFileSync(file, 'utf8'), issue, problems));
  }

  // raw идёт от старых выпусков к новым, поэтому последнее появление адреса —
  // самое свежее, и его значения перекрывают прежние.
  const byKey = new Map();
  for (const r of raw) {
    const key = urlKey(r.url);
    const { issue, ...fields } = r;
    const seen = { ...issue, stars: r.stars };
    // Позиция без адреса ни с чем не склеивается.
    const prev = key == null ? null : byKey.get(key);
    if (!prev) {
      byKey.set(key ?? Symbol('без адреса'), { ...fields, issues: [seen] });
      continue;
    }
    const last = prev.issues[prev.issues.length - 1];
    if (last.slug === issue.slug) {
      // Тот же адрес второй раз в одном выпуске: репозиторий стоит и в скиллах,
      // и в плагинах, или разобран ещё и в исследованиях. Запись выпуска одна,
      // вид и описание остаются от первого появления — разделы идут в порядке
      // skills, plugins, official, arts, и раздел каталога важнее пересказа.
      // Недостающие звёзды добираются из второго.
      last.stars ??= r.stars;
      prev.stars ??= r.stars;
      continue;
    }
    byKey.set(key, { ...fields, issues: [...prev.issues, seen] });
  }
  const items = [...byKey.values()];

  return { raw, items, problems };
}

// ── Запуск напрямую: файл и сводка ─────────────────────────────────────────

// Счёт позиций прямо по html, в обход разбора: class="item" и пункты ul.tail.
// С ним сверяется число разобранных позиций.
function baseline(html) {
  const items = (html.match(/<div class="item"/g) || []).length;
  let tail = 0;
  for (const m of html.matchAll(/<ul class="tail"[^>]*>([\s\S]*?)<\/ul>/g)) {
    tail += (m[1].match(/<li\b/g) || []).length;
  }
  return { items, tail };
}

const countBy = (list, fn) => {
  const m = new Map();
  for (const x of list) { const k = fn(x); m.set(k, (m.get(k) || 0) + 1); }
  return m;
};

function main() {
  const root = path.resolve(path.dirname(import.meta.filename), '..');
  const { raw, items, problems } = extractCatalog(root);

  const outFile = path.join(root, '.build', 'catalog.json');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify({ raw, items, problems }, null, 2) + '\n');

  const pad = (s, n) => String(s).padEnd(n);
  const num = (s, n) => String(s).padStart(n);

  console.log(`Позиций: ${raw.length} до склейки, ${items.length} после.\n`);

  console.log('Сверка с html (подробные = class="item", короткие = <li> в ul.tail):');
  console.log(`${pad('№  выпуск', 30)}${num('item', 6)}${num('разобр', 8)}${num('tail', 6)}${num('разобр', 8)}${num('офиц', 6)}${num('всего', 7)}  итог`);
  for (const issue of listIssues(root)) {
    const html = fs.readFileSync(path.join(root, 'presentations', `${issue.slug}.html`), 'utf8');
    const base = baseline(html);
    const mine = raw.filter(r => r.issue.slug === issue.slug);
    const full = mine.filter(r => !r.short && r.kind !== 'official').length;
    const short = mine.filter(r => r.short).length;
    const off = mine.filter(r => r.kind === 'official').length;
    const ok = full === base.items && short === base.tail ? 'сходится' : 'РАСХОЖДЕНИЕ';
    console.log(`${pad(`${issue.no}  ${issue.slug}`, 30)}${num(base.items, 6)}${num(full, 8)}${num(base.tail, 6)}${num(short, 8)}${num(off, 6)}${num(mine.length, 7)}  ${ok}`);
  }
  console.log('У официальных обновлений счётчика в html нет: они свёрстаны прозой.\n');

  console.log('По видам (до склейки / после):');
  const kr = countBy(raw, r => r.kind), ki = countBy(items, r => r.kind);
  for (const k of Object.values(KIND_BY_SECTION)) console.log(`  ${pad(k, 10)}${num(kr.get(k) || 0, 5)} / ${ki.get(k) || 0}`);

  const miss = (list, f) => list.filter(f).length;
  console.log('\nПустые поля (до склейки / после):');
  console.log(`  без tag    ${miss(raw, r => !r.tag)} / ${miss(items, r => !r.tag)}`);
  console.log(`  без stars  ${miss(raw, r => r.stars == null)} / ${miss(items, r => r.stars == null)}`);
  console.log(`  без url    ${miss(raw, r => !r.url)} / ${miss(items, r => !r.url)}`);

  const tags = [...countBy(items.filter(r => r.tag), r => r.tag)].sort((a, b) => b[1] - a[1]);
  console.log(`\nТем после склейки: ${tags.length}. Первые 30:`);
  console.log('  ' + tags.slice(0, 30).map(([t, n]) => `${t} ${n}`).join(' · '));

  const multi = items.filter(r => r.issues.length > 1);
  console.log(`\nАдресов больше чем в одном выпуске: ${multi.length}`);
  for (const r of multi.slice(0, 5)) {
    console.log(`  ${r.name} — ${r.issues.map(i => `№${i.no}${i.stars != null ? ` ★${i.stars}` : ''}`).join(', ')}`);
  }

  console.log(`\nНе разобрано: ${problems.length}`);
  for (const p of problems) console.log(`  [${p.slug} #${p.section}] ${p.why}: ${p.html.slice(0, 140)}`);

  console.log(`\nЗаписано: ${path.relative(root, outFile)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) main();
