// Собирает из данных самой страницы три артефакта:
//   resume-ru.pdf, resume-en.pdf — резюме на печать (A4)
//   og.png                        — обложка 1200×630 для превью ссылки
//
// Источник контента — объекты T и ME внутри index.html, поэтому резюме
// не может разъехаться с сайтом: правишь страницу — пересобираешь артефакты.
//
// Нужен поднятый Chrome с CDP-портом (скилл cdp-browser):
//   bash ~/.claude/skills/cdp-browser/scripts/ensure.sh --persist
//   node tools/build-assets.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(ROOT, '.build');
const CDP = process.env.CDP_HELPER
  || '/Users/user/.claude/skills/cdp-browser/scripts/cdp.mjs';

const { connect } = await import(CDP);
const { ev, send, close } = await connect(9222);
const wait = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(BUILD, { recursive: true });

const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// ── 1. забираем контент из страницы ───────────────────────────────────────────
await send('Page.navigate', { url: `file://${path.join(ROOT, 'index.html')}` });
await wait(2500);
const { T, ME } = JSON.parse(await ev('JSON.stringify({T:T, ME:ME})'));
const L = (o, lang) => (o && typeof o === 'object' && 'en' in o) ? (o[lang] ?? o.en) : o;
const tg = (T.socials.find(s => /telegram/i.test(s.label)) || {}).url || '';
console.log(`контент прочитан: ${T.experience.length} мест работы, ${T.projects.length} проектов`);

// ── 2. резюме ─────────────────────────────────────────────────────────────────
const RES_CSS = `
  @page { size: A4; margin: 14mm 14mm 12mm; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:"Inter",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
         font-size:9.6pt; line-height:1.45; color:#16150f; -webkit-print-color-adjust:exact; }
  h1 { font-size:22pt; letter-spacing:-.02em; margin:0 0 2pt; font-weight:700; }
  .role { font-size:11pt; color:#0d8f63; font-weight:600; margin:0 0 6pt; }
  .contacts { font-size:8.6pt; color:#4d4a44; margin:0 0 12pt; }
  .contacts a { color:#4d4a44; text-decoration:none; }
  .contacts span + span::before { content:"·"; margin:0 6px; color:#a8a49c; }
  h2 { font-size:8.4pt; letter-spacing:.13em; text-transform:uppercase; color:#6b6761;
       margin:13pt 0 6pt; padding-bottom:3pt; border-bottom:.6pt solid #ddd9d1; font-weight:600;
       /* заголовок не должен оставаться внизу страницы без своего содержимого */
       break-after:avoid; page-break-after:avoid; }
  .row { margin:0 0 9pt; break-inside:avoid; }
  .row-top { display:flex; justify-content:space-between; align-items:baseline; gap:10pt; }
  .row-top b { font-size:10.4pt; }
  .date { font-size:8.4pt; color:#6b6761; white-space:nowrap; }
  .org { color:#0d8f63; font-size:9.2pt; margin:1pt 0 3pt; font-weight:500; }
  .desc { margin:0; color:#3a3830; }
  .tags { margin-top:3pt; font-size:8.2pt; color:#6b6761; }
  .focus { display:grid; grid-template-columns:1fr 1fr; gap:4pt 16pt; margin:0; padding:0; list-style:none; }
  .focus li { padding-left:9pt; position:relative; }
  .focus li::before { content:""; position:absolute; left:0; top:.5em; width:3pt; height:3pt;
                      border-radius:50%; background:#0d8f63; }
  .focus b { font-weight:600; }
  .proj { margin:0 0 5pt; break-inside:avoid; }
  .proj b { font-size:9.6pt; }
  .proj i { font-style:normal; color:#0d8f63; }
  .proj p { margin:1pt 0 0; color:#3a3830; }
`;

function resumeHtml(lang) {
  const t = o => esc(L(o, lang));
  const H = {
    focus:  { ru: 'Ключевое',    en: 'Highlights' },
    exp:    { ru: 'Опыт работы', en: 'Experience' },
    edu:    { ru: 'Образование', en: 'Education' },
    proj:   { ru: 'Проекты',     en: 'Projects' },
    stack:  { ru: 'Стек',        en: 'Stack' },
  };
  const h = k => esc(H[k][lang]);

  const stack = [...new Set(T.experience.flatMap(e => e.tags))].join(' · ');

  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<title>${t(ME.name)} — CV</title><style>${RES_CSS}</style></head><body>
<h1>${t(ME.name)}</h1>
<p class="role">${t(T.experience[0].role)}</p>
<p class="contacts">
  <span><a href="mailto:${esc(ME.email)}">${esc(ME.email)}</a></span>
  ${tg ? `<span><a href="${esc(tg)}">${esc(tg.replace('https://', ''))}</a></span>` : ''}
  <span><a href="${esc(ME.github)}">${esc(ME.github.replace('https://', ''))}</a></span>
  <span><a href="https://paveldiordits.site">paveldiordits.site</a></span>
</p>

<h2>${h('focus')}</h2>
<ul class="focus">${T.focus.map(f => `<li><b>${t(f.t)}.</b> ${t(f.d)}</li>`).join('')}</ul>

<h2>${h('exp')}</h2>
${T.experience.map(e => `<div class="row">
  <div class="row-top"><b>${t(e.role)}</b><span class="date">${t(e.date)}</span></div>
  <div class="org">${t(e.org)}</div>
  <p class="desc">${t(e.desc)}</p>
  <div class="tags">${esc(e.tags.join(' · '))}</div>
</div>`).join('')}

<h2>${h('edu')}</h2>
${T.education.map(e => `<div class="row">
  <div class="row-top"><b>${t(e.role)}</b><span class="date">${t(e.date)}</span></div>
  <div class="org">${t(e.org)}</div>
</div>`).join('')}

<h2>${h('proj')}</h2>
${T.projects.map(p => `<div class="proj">
  <b>${esc(p.name)}</b> — <i>${t(p.sub)}</i>
  <p>${t(p.desc)}</p>
</div>`).join('')}

<h2>${h('stack')}</h2>
<p style="margin:0;color:#3a3830">${esc(stack)}</p>
</body></html>`;
}

for (const lang of ['ru', 'en']) {
  const file = path.join(BUILD, `resume-${lang}.html`);
  fs.writeFileSync(file, resumeHtml(lang));
  await send('Page.navigate', { url: `file://${file}` });
  await wait(1200);
  const { data } = await send('Page.printToPDF', {
    printBackground: true, preferCSSPageSize: true, scale: 1,
  });
  const out = path.join(ROOT, `resume-${lang}.pdf`);
  fs.writeFileSync(out, Buffer.from(data, 'base64'));
  console.log(`resume-${lang}.pdf: ${fs.statSync(out).size} байт`);
}

// ── 3. обложка для превью ссылки ──────────────────────────────────────────────
const ogHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}
  body{margin:0;width:1200px;height:630px;background:#0b0a0a;color:#e4e0dd;
       font-family:"Inter",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
       display:flex;flex-direction:column;justify-content:center;padding:0 84px;position:relative}
  .eyebrow{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:19px;
           letter-spacing:.18em;text-transform:uppercase;color:#938c85;margin-bottom:26px}
  h1{font-size:104px;font-weight:700;letter-spacing:-.035em;line-height:.94;margin:0 0 24px}
  .role{font-size:34px;color:#938c85;font-weight:500;letter-spacing:-.02em;margin:0 0 40px}
  .badges{display:flex;gap:14px;flex-wrap:wrap}
  .badge{border:1px solid #2b2826;border-radius:999px;padding:11px 22px;font-size:20px;
         color:#938c85;background:#141312;display:flex;align-items:center;gap:11px}
  .dot{width:8px;height:8px;border-radius:999px;background:#10b981}
  .site{position:absolute;right:84px;bottom:56px;font-family:ui-monospace,monospace;
        font-size:21px;color:#10b981;letter-spacing:.02em}
  .edge{position:absolute;left:0;top:0;bottom:0;width:10px;background:#10b981}
</style></head><body>
  <div class="edge"></div>
  <div class="eyebrow">${esc(L(T['hero.eyebrow'], 'en'))}</div>
  <h1>${esc(L(ME.name, 'en'))}</h1>
  <div class="role">${esc(L(T.experience[0].role, 'en'))} · ${esc(L(T.experience[0].org, 'en'))}</div>
  <div class="badges">${T.badges.map(b =>
    `<div class="badge"><span class="dot"></span>${esc(L(b, 'en'))}</div>`).join('')}</div>
  <div class="site">paveldiordits.site</div>
</body></html>`;

const ogFile = path.join(BUILD, 'og.html');
fs.writeFileSync(ogFile, ogHtml);
await send('Emulation.setDeviceMetricsOverride',
  { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `file://${ogFile}` });
await wait(1200);
const shot = await send('Page.captureScreenshot', { format: 'png' });
const ogOut = path.join(ROOT, 'og.png');
fs.writeFileSync(ogOut, Buffer.from(shot.data, 'base64'));
console.log(`og.png: ${fs.statSync(ogOut).size} байт`);

await send('Emulation.clearDeviceMetricsOverride');
close();
