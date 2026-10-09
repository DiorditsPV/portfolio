// Обложка записи журнала: наборный текст слева, справа — рисунок или схема из данных.
//
//   node tools/cover-card.mjs <slug>           собрать presentations/covers/<slug>.webp
//   node tools/cover-card.mjs --all            собрать обложки всем записям реестра
//   node tools/cover-card.mjs <slug> --art     нарисовать рисунок записи генератором Codex
//   node tools/cover-card.mjs --palettes       показать, какая подборка у какой записи
//
// Обложка верстается кодом и снимается в картинку браузером (playwright), поэтому
// весь текст на ней набран шрифтом и опечаток в нём не бывает. Правая часть бывает
// двух видов.
//
//   Выпуск серии-периодики (Agents Weekly). Схема из цифр самого выпуска: сколько
//   позиций каталога разобрано подробно из всех найденных и сколько релизов вошло
//   в окно. Цифры берутся из заголовков разделов выпуска в реестре, поэтому
//   обложка нового выпуска собирается при публикации сама, без человека.
//
//   Отдельный разбор. Один предмет-метафора, нарисованный от руки, без единой
//   буквы: его рисует генератор картинок по описанию из tools/cover-briefs.json и
//   кладёт в presentations/covers/art/<slug>.png. Пока рисунка нет, на его месте
//   стоит главная цифра записи, выложенная метками: 17 стадий — семнадцать меток.
//
// Цвета. Подборок девять (tools/cover-palettes.json), у каждой записи своя: с одним
// набором цветов обложки сливаются в одно пятно. Подборка — три-пять цветов без
// ролей, роли раздаются по правилу:
//
//   фон      самый светлый цвет, наполовину разбавленный белым;
//   тушь     самый тёмный цвет; если он недостаточно тёмный для текста, тот же
//            тон затемняется до читаемого;
//   акцент   самый цветной из тех, чем можно писать, кроме цвета туши;
//   заливки  всё остальное.
//
// Выбор подборки. Записи идут от старых к новым; подборка берётся по хешу слага,
// а если она совпала с одной из двух предыдущих записей — следующая по кругу.
// Назначение записывается в tools/cover-assigned.json и больше не меняется:
// новая запись не перекрашивает старые.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COVERS = path.join(ROOT, 'presentations', 'covers');
const ART = path.join(COVERS, 'art');
const FONT = path.join(ROOT, 'presentations', 'fonts', 'golos-text.woff2');
const PALETTES = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'cover-palettes.json'), 'utf8'));
const BRIEFS = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'cover-briefs.json'), 'utf8'));
const ASSIGNED = path.join(ROOT, 'tools', 'cover-assigned.json');
// Образец руки для рисунков — чужая работа, в публичный репозиторий не кладётся.
const REFERENCE = process.env.COVER_REFERENCE
  || path.join(os.homedir(), 'dev/docs/lichnoe/journal-covers/reference-toucan.png');

const PERIODICAL_FROM = 5;     // с какого числа записей серия считается периодикой
const W = 1600, H = 900;

const die = m => { console.error(m); process.exit(1); };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ── цвет ─────────────────────────────────────────────────────────────────────
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const hex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
const lum = h => { const [r, g, b] = rgb(h).map(v => v / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const chroma = h => Math.max(...rgb(h)) - Math.min(...rgb(h));
const mix = (a, b, t) => hex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t));

const INK_MAX_LUM = 0.16;      // темнее этого — годится для текста как есть
const ACCENT_MAX_LUM = 0.6;    // светлее этого акцентом писать нельзя: не прочитается

export function roles(colors) {
  const byLum = [...colors].sort((a, b) => lum(a) - lum(b));
  const lightest = byLum.at(-1), darkest = byLum[0];
  const paper = mix(lightest, '#FFFFFF', 0.5);
  const ink = lum(darkest) <= INK_MAX_LUM ? darkest
    : hex(rgb(darkest).map(v => v * INK_MAX_LUM / lum(darkest)));
  // Акцент — не тот цвет, из которого сделана тушь: иначе цифра и текст вышли бы
  // одного тона. Если такого нет (в подборке один насыщенный цвет), остаётся он сам.
  const writable = colors.filter(c => c !== lightest && c !== darkest && lum(c) <= ACCENT_MAX_LUM);
  const accent = writable.sort((a, b) => chroma(b) - chroma(a))[0] || darkest;
  const fills = colors.filter(c => c !== accent && c !== ink && c !== lightest);
  return { paper, ink, accent, fills: fills.length ? fills : [accent] };
}

// ── реестр и выбор подборки ──────────────────────────────────────────────────
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d) >>> 0; h ^= h >>> 15;
  return h >>> 0;
}

const registry = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'presentations.json'), 'utf8')).presentations;
const oldestFirst = reg => [...reg].sort((a, b) => a.date.localeCompare(b.date) || a.slug.localeCompare(b.slug));

function assignments(reg) {
  const saved = fs.existsSync(ASSIGNED) ? JSON.parse(fs.readFileSync(ASSIGNED, 'utf8')) : {};
  const ids = PALETTES.map(p => p.id), recent = [];
  for (const p of oldestFirst(reg)) {
    if (!saved[p.slug]) {
      let i = hash(p.slug) % ids.length;
      while (recent.slice(-2).includes(ids[i])) i = (i + 1) % ids.length;
      saved[p.slug] = ids[i];
    }
    recent.push(saved[p.slug]);
  }
  fs.writeFileSync(ASSIGNED, JSON.stringify(saved, null, 2) + '\n');
  return saved;
}

// Номер выпуска — порядок по датам внутри серии; у серий короче PERIODICAL_FROM номеров нет.
function issueNo(p, reg) {
  if (!p.series) return 0;
  const series = oldestFirst(reg.filter(x => x.series === p.series));
  return series.length >= PERIODICAL_FROM ? series.indexOf(series.find(x => x.slug === p.slug)) + 1 : 0;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dateEn = iso => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };

// Цифры выпуска из заголовков его разделов: «Скиллы 10 из 30», «… — 8 релизов».
const WORD_NUM = { один: 1, два: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10 };
function issueStats(p) {
  const find = re => { for (const k of p.keywords || []) { const m = k.match(re); if (m) return m; } return null; };
  const of = (re, label) => { const m = find(re); return m ? { label, on: +m[1], all: +m[2] } : null; };
  const rel = find(/Claude Code .*—\s*(\S+)\s+релиз/);
  return {
    rows: [of(/^Скиллы (\d+) из (\d+)/, 'skills'), of(/^Плагины и проекты (\d+) из (\d+)/, 'plugins'),
      of(/^Исследования и наблюдения (\d+) из (\d+)/, 'research')].filter(Boolean),
    releases: rel ? (+rel[1] || WORD_NUM[rel[1]] || 0) : 0,
  };
}

// ── вёрстка обложки ──────────────────────────────────────────────────────────
// Строка схемы: доля «разобрано подробно» отрезками. Отрезки, а не точки: в
// маленьком превью точки сливаются в рябь, а полоса остаётся полосой.
const bar = (r) => `<div class="row"><span class="lab">${r.label}</span>`
  + `<span class="segs">${Array.from({ length: r.all }, (_, i) => `<i class="${i < r.on ? 'on' : ''}"></i>`).join('')}</span>`
  + `<span class="val">${r.on}<small> / ${r.all}</small></span></div>`;

function statsPanel(st) {
  return `<div class="panel stats">${st.rows.map(bar).join('')}`
    + (st.releases ? `<div class="row"><span class="lab">releases</span><span class="ticks">${'<i></i>'.repeat(st.releases)}</span><span class="val">${st.releases}</span></div>` : '')
    + `</div>`;
}

// Главная цифра записи метками: до 60 — крупные плитки, дальше — мелкая сетка.
function unitsPanel(n, fills) {
  const count = Math.min(n, 600), big = count <= 60;
  return `<div class="panel units ${big ? 'big' : 'fine'}">`
    + Array.from({ length: count }, (_, i) => `<i style="background:${fills[i % fills.length]}"></i>`).join('') + `</div>`;
}

export function coverHtml(p, reg, paletteId) {
  const palette = PALETTES.find(x => x.id === paletteId), r = roles(palette.colors);
  const no = issueNo(p, reg), brief = BRIEFS[p.slug] || {};
  const art = path.join(ART, `${p.slug}.png`);
  const label = no ? p.series : (brief.label || p.series || '');
  const big = no ? `№${no}` : (brief.big || '');
  const sub = no ? (p.title.split('—')[1] || '').trim() : [brief.unit, dateEn(p.date)].filter(Boolean).join(' · ');
  const facts = no ? [] : (brief.facts || []);
  const right = no ? statsPanel(issueStats(p))
    : fs.existsSync(art) ? `<div class="panel art"><img src="${pathToFileURL(art)}" alt=""></div>`
    : unitsPanel(parseInt(big, 10) || 12, [r.accent, ...r.fills]);

  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:"Golos Text";src:url(${pathToFileURL(FONT)}) format("woff2");font-weight:400 900}
*{box-sizing:border-box;margin:0}
html,body{width:${W}px;height:${H}px}
body{background:${r.paper};color:${r.ink};font-family:"Golos Text",sans-serif;display:grid;grid-template-columns:${no ? 520 : 600}px 1fr;--a:${r.accent}}
.text{padding:84px 0 84px 92px;display:flex;flex-direction:column;min-width:0}
/* у выпуска под номером нет списка фактов: блок встаёт по центру высоты, напротив схемы */
.text.solo{justify-content:center}
.label{font-size:40px;font-weight:600;letter-spacing:-.01em}
.big{font-size:${big.length > 3 ? 190 : 236}px;font-weight:800;line-height:.92;letter-spacing:-.055em;color:${r.accent};margin:22px 0 0 -8px;white-space:nowrap}
.sub{font-size:38px;margin-top:22px;opacity:.72}
.facts{list-style:none;padding:0;margin-top:auto;font-size:36px;line-height:1.42}
.facts li{padding-left:1.1em;text-indent:-1.1em}
.facts li::before{content:"— "}
.panel{margin:84px 92px 84px 40px;min-width:0}
.art{position:relative}
/* Фон рисунка у генератора не чисто белый; контраст выбивает его в белое, и при
   умножении на фон обложки от прямоугольника картинки не остаётся следа. */
.art img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;mix-blend-mode:multiply;filter:brightness(1.08) contrast(1.18)}
.stats{display:flex;flex-direction:column;justify-content:space-between;padding:14px 0}
.row{display:grid;grid-template-columns:170px 1fr 170px;align-items:center;gap:28px;font-size:38px}
.segs{display:flex;gap:5px;height:96px}
.segs i{flex:1;background:${mix(r.ink, r.paper, 0.86)};border-radius:3px}
.segs i.on{background:var(--a)}
.ticks{display:flex;gap:14px;height:96px}
.ticks i{width:20px;background:${r.ink};border-radius:3px}
.val{text-align:right;font-weight:800;font-variant-numeric:tabular-nums;font-size:46px}
.val small{font-weight:500;font-size:34px;opacity:.6}
.units{display:flex;flex-wrap:wrap;align-content:center;justify-content:flex-start}
.units.big{gap:20px}.units.big i{width:108px;height:108px;border-radius:10px}
.units.fine{gap:8px}.units.fine i{width:30px;height:30px;border-radius:4px}
</style></head><body>
<div class="text${facts.length ? '' : ' solo'}"><div class="label">${esc(label)}</div><div class="big">${esc(big)}</div><div class="sub">${esc(sub)}</div>
${facts.length ? `<ul class="facts">${facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}</div>
${right}
</body></html>`;
}

// ── рисунок генератором ──────────────────────────────────────────────────────
function drawArt(p, paletteId) {
  const brief = BRIEFS[p.slug];
  if (!brief?.art) die(`в tools/cover-briefs.json нет описания рисунка для «${p.slug}»`);
  if (!fs.existsSync(REFERENCE)) die(`нет образца руки: ${REFERENCE} (или задай COVER_REFERENCE)`);
  const r = roles(PALETTES.find(x => x.id === paletteId).colors);
  const prompt = `The attached image is a STYLE REFERENCE for the drawing hand only (thick uneven marker fills, scratchy ballpoint outline, overshooting lines). Use your image generation tool (pass the reference to it) to create ONE illustration. Do not write code to draw it. Landscape, about 4:3.
SUBJECT: ${brief.art}.
It is a single object drawn by hand with felt-tip markers and ballpoint pen, centred, large, filling most of the frame. Background: pure flat WHITE (#FFFFFF), no paper texture, no grid, no shadow, no frame.
COLOUR: only these inks: outline ${r.ink}, marker fills ${[r.accent, ...r.fills].join(', ')}.
ABSOLUTELY NO text, letters, numbers, labels or signatures anywhere.
Save the image in the current directory as ${p.slug}.png and print the path.
`;
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'cover-art-'));
  execFileSync('codex', ['exec', '--skip-git-repo-check', '-s', 'workspace-write',
    '-c', 'model_reasoning_effort="low"', '-i', REFERENCE, '-'],
    { cwd: work, input: prompt, stdio: ['pipe', 'ignore', 'ignore'], timeout: 9 * 60 * 1000 });
  const png = path.join(work, `${p.slug}.png`);
  if (!fs.existsSync(png)) die(`генератор не сохранил ${png}`);
  fs.mkdirSync(ART, { recursive: true });
  // Рисунок уменьшается до ширины, которую он занимает на обложке: исходник весит 1–2 МБ.
  execFileSync('sips', ['-Z', '1100', png, '--out', path.join(ART, `${p.slug}.png`)], { stdio: 'ignore' });
  console.log(`рисунок готов: presentations/covers/art/${p.slug}.png`);
}

// ── съёмка ───────────────────────────────────────────────────────────────────
async function render(list, reg, given) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'cover-card-'));
  for (const p of list) {
    const html = path.join(work, `${p.slug}.html`), png = path.join(work, `${p.slug}.png`);
    fs.writeFileSync(html, coverHtml(p, reg, given[p.slug]));
    await page.goto(pathToFileURL(html).href, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: png });
    execFileSync('cwebp', ['-quiet', '-q', '86', png, '-o', path.join(COVERS, `${p.slug}.webp`)]);
    console.log(`обложка: presentations/covers/${p.slug}.webp`);
  }
  await browser.close();
}

// ── ход ──────────────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const reg = registry(), given = assignments(reg);

  if (args.includes('--palettes')) {
    for (const p of oldestFirst(reg)) {
      const r = roles(PALETTES.find(x => x.id === given[p.slug]).colors);
      console.log(`${p.slug.padEnd(30)} ${given[p.slug].padEnd(16)} фон ${r.paper}  тушь ${r.ink}  акцент ${r.accent}  заливки ${r.fills.join(' ')}`);
    }
    process.exit(0);
  }

  const slug = args.find(a => !a.startsWith('--'));
  const list = args.includes('--all') ? reg : reg.filter(p => p.slug === slug);
  if (!list.length) die(slug ? `в реестре нет записи «${slug}»` : 'нужен слаг записи или --all');
  if (args.includes('--art')) for (const p of list) drawArt(p, given[p.slug]);
  await render(list, reg, given);
}
