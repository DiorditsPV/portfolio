// Сборка статьи журнала из текста: markdown + схемы → одна самодостаточная html-страница
// по общему шаблону (tools/article.css, требования — docs/journal-article-requirements.md).
//
//   node tools/article-build.mjs <статья.md> [-o <статья.html>] [--palette <семейство>]
//
// Вход.
//   <статья.md>            текст. Первая строка «# …» — заголовок страницы, абзац под
//                          ним — вводный, разделы «## …» ложатся в оглавление.
//   <статья>.figures.html  схемы, необязательно. Блоки вида
//                          <!--fig:имя--> … <!--/fig-->; в тексте схема встаёт на место
//                          строки <!-- FIGURE id=имя: описание -->.
//   <!-- META: … -->       строка сразу под заголовком: тип записи, ссылка на предмет, версия.
//   <!-- NOTE -->          перед абзацем: абзац выводится плашкой-примечанием.
//
// Выход — рядом с текстом, <статья>.html. На сайт он попадает отдельной командой
// tools/publish-presentation.mjs; она же подставляет цвета подборки записи.
// --palette нужен только для просмотра до публикации.
//
// Статья длиннее 25 минут чтения не собирается: команда печатает объём и завершается
// с ошибкой.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i === -1 ? null : args.splice(i, 2)[1]; };
const OUT_ARG = opt('-o'), PALETTE = opt('--palette');
const MAX_MINUTES = 25;   // предел времени чтения, 160 слов в минуту
const IN = args[0];
if (!IN) { console.error('нужен путь к .md'); process.exit(1); }
const OUT = OUT_ARG || IN.replace(/\.md$/, '.html');

const md = fs.readFileSync(IN, 'utf8');
const css = fs.readFileSync(path.join(TOOLS, 'article.css'), 'utf8');
const figPath = IN.replace(/\.md$/, '.figures.html');
const figSrc = fs.existsSync(figPath) ? fs.readFileSync(figPath, 'utf8') : '';
const figures = {};
for (const m of figSrc.matchAll(/<!--fig:([\w-]+)-->([\s\S]*?)<!--\/fig-->/g)) figures[m[1]] = m[2].trim();

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = s => {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(`<code>${esc(c)}</code>`); return `\u0000${codes.length - 1}\u0000`; });
  s = esc(s)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1" loading="lazy">')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2">$2</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\w)/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[+i]);
};

const lines = md.split('\n');
const out = [], toc = [], used = new Set();
let title = '', lead = '', meta = '', i = 0, sec = 0, open = false, note = false;

const LIST = /^(\s*)([-*]|\d+[.)])\s+(.*)$/;
const listBlock = start => {
  const base = lines[start].match(LIST)[1].length;
  const ordered = /\d/.test(lines[start].match(LIST)[2]);
  let html = ordered ? '<ol>' : '<ul>', j = start;
  while (j < lines.length) {
    const m = lines[j].match(LIST);
    if (!m || m[1].length !== base) break;
    let text = m[3]; j++;
    while (j < lines.length && lines[j].trim() && !LIST.test(lines[j]) && /^\s+/.test(lines[j])) text += ' ' + lines[j++].trim();
    let sub = '';
    const n = j < lines.length && lines[j].match(LIST);
    if (n && n[1].length > base) { const [h, k] = listBlock(j); sub = h; j = k; }
    html += `<li>${inline(text)}${sub}</li>`;
  }
  return [html + (ordered ? '</ol>' : '</ul>'), j];
};

while (i < lines.length) {
  const l = lines[i];
  if (!l.trim()) { i++; continue; }
  let m;
  if ((m = l.match(/^# (.+)/)) && !title) { title = m[1].trim(); i++; continue; }
  if ((m = l.match(/^<!--\s*META:\s*(.*?)\s*-->/))) { meta = m[1]; i++; continue; }
  if (/^<!--\s*NOTE\s*-->/.test(l)) { note = true; i++; continue; }
  if ((m = l.match(/^## (.+)/))) {
    if (open) out.push('</section>');
    const id = `s${++sec}`;
    toc.push({ id, text: m[1].trim() });
    out.push(`<section id="${id}"><h2>${inline(m[1].trim())}</h2>`);
    open = true; i++; continue;
  }
  if ((m = l.match(/^### (.+)/))) { out.push(`<h3>${inline(m[1].trim())}</h3>`); i++; continue; }
  if ((m = l.match(/^<!--\s*FIGURE id=([\w-]+)\s*:/))) {
    while (!lines[i].includes('-->')) i++;
    i++;
    if (figures[m[1]]) { out.push(figures[m[1]]); used.add(m[1]); }
    else console.warn(`нет схемы «${m[1]}» в ${path.basename(figPath)}`);
    continue;
  }
  if (l.startsWith('```')) {
    const buf = []; i++;
    while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
    i++;
    out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`); continue;
  }
  if (l.startsWith('|') && lines[i + 1] && /^\|[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
    const row = s => s.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
    const head = row(l); i += 2;
    let h = '<div class="tbl"><table><thead><tr>' + head.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>';
    while (i < lines.length && lines[i].startsWith('|')) {
      h += '<tr>' + row(lines[i]).map((c, k) => `<td data-h="${esc(head[k] || '')}">${inline(c)}</td>`).join('') + '</tr>'; i++;
    }
    out.push(h + '</tbody></table></div>'); continue;
  }
  if (l.startsWith('>')) {
    const buf = [];
    while (i < lines.length && lines[i].startsWith('>')) buf.push(lines[i++].replace(/^>\s?/, ''));
    out.push(`<blockquote><p>${inline(buf.join(' '))}</p></blockquote>`); continue;
  }
  if (LIST.test(l)) { const [h, k] = listBlock(i); out.push(h); i = k; continue; }
  const buf = [];
  while (i < lines.length && lines[i].trim() && !/^(#{1,3} |```|\||>|<!--|\s*([-*]|\d+[.)])\s+)/.test(lines[i])) buf.push(lines[i++].trim());
  if (!buf.length) buf.push(lines[i++].trim());
  const p = inline(buf.join(' '));
  if (!open && !lead) lead = p;
  else { out.push(note ? `<p class="note">${p}</p>` : `<p>${p}</p>`); note = false; }
}
if (open) out.push('</section>');
for (const id of Object.keys(figures)) if (!used.has(id)) console.warn(`схема «${id}» не использована`);

let palette = '';
if (PALETTE) {
  const { paletteCss, FAMILIES } = await import('./article-palette.mjs');
  const f = FAMILIES.find(x => x.id === PALETTE);
  if (!f) { console.error(`нет семейства «${PALETTE}». Есть: ${FAMILIES.map(x => x.id).join(', ')}`); process.exit(1); }
  palette = `<style id="article-palette" data-palette="${f.id}">\n${paletteCss(f)}\n</style>\n`;
}

const nav = toc.map(t => `    <a href="#${t.id}">${inline(t.text)}</a>`).join('\n');
const ARROW = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.5 8h-11M7 3.5 2.5 8 7 12.5"/></svg>';

const html = `<!DOCTYPE html>
<html lang="ru" data-article-template="1">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<script>(function(){try{var d=document.documentElement,t=localStorage.getItem('theme');if(t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches)d.dataset.theme='dark';var s=+localStorage.getItem('text-scale');if(s)d.style.setProperty('--ts',s)}catch(e){}})()</script>
<style>
${css}</style>
${palette}</head>
<body>
<div class="progress" id="progress"></div>
<div class="bar">
  <div class="bar-in">
    <a href="./" id="back">${ARROW}Журнал</a>
    <div class="controls">
      <button type="button" id="ts-down" aria-label="Уменьшить текст">A−</button>
      <button type="button" id="ts-up" aria-label="Увеличить текст">A+</button>
      <button type="button" id="theme" aria-label="Переключить тему">Тема</button>
    </div>
  </div>
</div>
<header class="hero">
  <div class="hero-in">
    <div class="hero-text">
      <h1>${inline(title)}</h1>
      <p class="lead">${lead}</p>
    </div>
    <!--article:cover-->
  </div>
</header>
${meta ? `<div class="under"><p class="meta">${inline(meta)}</p></div>\n` : ''}<div class="page">
  <main class="col">
${out.join('\n')}
  </main>
  <nav class="toc" aria-label="Содержание">
    <p class="toc-h">Содержание</p>
${nav}
  </nav>
</div>
<script>
(function(){
  var d=document.documentElement, STEPS=[.9,1,1.1,1.2,1.35];
  function save(k,v){try{localStorage.setItem(k,v)}catch(e){}}
  document.getElementById('theme').addEventListener('click',function(){
    var dark=d.dataset.theme!=='dark';
    if(dark)d.dataset.theme='dark';else delete d.dataset.theme;
    save('theme',dark?'dark':'light');save('ad-theme',dark?'dark':'light');
  });
  function step(n){
    var cur=+d.style.getPropertyValue('--ts')||1,at=0;
    STEPS.forEach(function(v,i){if(Math.abs(v-cur)<Math.abs(STEPS[at]-cur))at=i});
    var v=STEPS[Math.max(0,Math.min(STEPS.length-1,at+n))];
    d.style.setProperty('--ts',v);save('text-scale',v);
  }
  document.getElementById('ts-down').addEventListener('click',function(){step(-1)});
  document.getElementById('ts-up').addEventListener('click',function(){step(1)});
  // «Журнал» — настоящая ссылка; если читатель пришёл со страницы сайта, она
  // возвращает его в ту же точку прокрутки, откуда он ушёл.
  var back=document.getElementById('back'),from=document.referrer||'';
  if(history.length>1&&from.indexOf(location.origin+'/')===0&&from!==location.href)
    back.addEventListener('click',function(e){e.preventDefault();history.back()});
  var bar=document.getElementById('progress'),links=[].slice.call(document.querySelectorAll('.toc a')),
      secs=links.map(function(a){return document.getElementById(a.getAttribute('href').slice(1))});
  function onScroll(){
    var h=d.scrollHeight-innerHeight;
    bar.style.transform='scaleX('+(h>0?Math.min(1,scrollY/h):0)+')';
    var act=0;for(var i=0;i<secs.length;i++){if(secs[i].getBoundingClientRect().top<innerHeight*.3)act=i}
    links.forEach(function(a,i){a.classList.toggle('on',i===act)});
  }
  addEventListener('scroll',onScroll,{passive:true});onScroll();
})();
</script>
</body>
</html>
`;
fs.writeFileSync(OUT, html);
const words = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;|&#\d+;/gi, ' ').split(/\s+/).filter(Boolean).length;
const minutes = Math.max(1, Math.round(words / 160));
console.log(`${OUT}: ${words} слов → ${minutes} мин, разделов ${sec}, схем ${used.size}`);
// Статья журнала читается за 20–25 минут. Длиннее читатель её не осилит за один присест,
// поэтому лишний объём не публикуется, а ужимается: текст отдают техническому писателю
// на сокращение без потери фактов и собирают заново.
if (minutes > MAX_MINUTES) {
  console.error(`Статья длиннее ${MAX_MINUTES} минут (${minutes} мин, ${words} слов; предел — около ${MAX_MINUTES * 160} слов).\n`
    + 'Отдай текст техническому писателю на сокращение без потери фактов и собери заново.');
  process.exit(1);
}
