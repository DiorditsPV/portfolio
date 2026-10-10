// Цвета статьи.
//
//   node tools/article-palette.mjs            показать, какой статье какой цвет достался
//
// Цвет берётся из готовой базы палитр скилла ui-ux-pro-max (data/colors.csv): у каждого
// семейства оттуда взяты четыре тона как есть, без подмешивания —
//
//   primary  основной тон: ссылки и акцент на белом;
//   tint     самый светлый: заливка выделенных блоков схем в светлой теме;
//   soft     светлый: шапка в светлой теме, ссылки и акцент в тёмной;
//   deep     тёмный: текст шапки в светлой теме, шапка в тёмной.
//
// В базе это строки с таким Primary; тона — её поля Background, Border и Foreground.
// Семейства только холодные: розовую шапку в светлой теме и красно-коричневую в тёмной
// автор отверг. Текст и фон страницы от цвета статьи не зависят.
//
// Статьи получают семейства по очереди, в порядке дат: соседние записи журнала не
// совпадают по цвету, а новая запись не перекрашивает прежние.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = path.join(ROOT, 'presentations.json');
const DIGESTS = 'Agents Weekly';   // у выпусков серии своя тема, в очередь они не входят

export const FAMILIES = [
  { id: 'emerald', primary: '#059669', tint: '#ECFDF5', soft: '#A7F3D0', deep: '#064E3B' },
  { id: 'blue',    primary: '#2563EB', tint: '#EFF6FF', soft: '#BFDBFE', deep: '#1E40AF' },
  { id: 'violet',  primary: '#7C3AED', tint: '#FAF5FF', soft: '#DDD6FE', deep: '#4C1D95' },
  { id: 'cyan',    primary: '#0891B2', tint: '#ECFEFF', soft: '#A5F3FC', deep: '#164E63' },
  { id: 'indigo',  primary: '#4F46E5', tint: '#EEF2FF', soft: '#C7D2FE', deep: '#312E81' },
  { id: 'green',   primary: '#15803D', tint: '#F0FDF4', soft: '#BBF7D0', deep: '#14532D' },
  { id: 'sky',     primary: '#0369A1', tint: '#F0F9FF', soft: '#BAE6FD', deep: '#0C4A6E' },
  { id: 'teal',    primary: '#0D9488', tint: '#F0FDFA', soft: '#99F6E4', deep: '#134E4A' },
];

const MIN_CONTRAST = 4.5;
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const relLum = h => {
  const [r, g, b] = rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a, b) => {
  const [x, y] = [relLum(a), relLum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

export function articleColors(f) {
  // Ссылка на белом обязана читаться; основной тон светлых семейств (cyan, teal,
  // emerald) контраста 4,5:1 не даёт — тогда ссылки набираются тёмным тоном.
  const link = contrast(f.primary, '#FFFFFF') >= MIN_CONTRAST ? f.primary : f.deep;
  return {
    light: { 'hero-bg': f.soft, 'hero-fg': f.deep, 'hero-muted': f.deep, accent: link, 'accent-soft': f.tint, 'on-accent': '#FFFFFF' },
    dark: { 'hero-bg': f.deep, 'hero-fg': '#FFFFFF', 'hero-muted': f.soft, accent: f.soft, 'accent-soft': f.deep, 'on-accent': f.deep },
  };
}

export function familyOf(slug) {
  if (!fs.existsSync(REGISTRY)) return null;
  const list = JSON.parse(fs.readFileSync(REGISTRY, 'utf8')).presentations
    .filter(p => p.series !== DIGESTS)
    .sort((a, b) => a.date.localeCompare(b.date) || a.slug.localeCompare(b.slug));
  const i = list.findIndex(p => p.slug === slug);
  return i < 0 ? null : FAMILIES[i % FAMILIES.length];
}

const vars = o => Object.entries(o).map(([k, v]) => `--${k}:${v}`).join(';');
export const paletteCss = f => {
  const c = articleColors(f);
  return `:root{${vars(c.light)}}\nhtml[data-theme="dark"]{${vars(c.dark)}}`;
};

// Блок для <head> статьи; у записи вне реестра остаются цвета шаблона.
export function paletteStyle(slug) {
  const f = familyOf(slug);
  return f ? `<style id="article-palette" data-palette="${f.id}">\n${paletteCss(f)}\n</style>` : '';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const list = JSON.parse(fs.readFileSync(REGISTRY, 'utf8')).presentations.filter(p => p.series !== DIGESTS)
    .sort((a, b) => a.date.localeCompare(b.date) || a.slug.localeCompare(b.slug));
  for (const p of list) {
    const f = familyOf(p.slug), c = articleColors(f);
    console.log(`${p.slug.padEnd(30)} ${f.id.padEnd(8)} светлая: шапка ${c.light['hero-bg']} / текст ${c.light['hero-fg']} (${contrast(c.light['hero-fg'], c.light['hero-bg']).toFixed(1)}), ссылка ${c.light.accent} (${contrast(c.light.accent, '#FFFFFF').toFixed(1)})  тёмная: шапка ${c.dark['hero-bg']} (${contrast('#FFFFFF', c.dark['hero-bg']).toFixed(1)}), ссылка ${c.dark.accent} (${contrast(c.dark.accent, '#121316').toFixed(1)})`);
  }
}
