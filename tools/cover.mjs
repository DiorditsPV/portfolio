// Обложки-заглушки для карточек библиотеки.
//
// Настоящих обложек у разборов нет — скилл present-html их не делает. Пока их не
// сняли вручную, каждая карточка получает сгенерированную: детерминированную по
// слагу, в цвете своей темы. Это не «серый прямоугольник на месте картинки»:
// узоры собраны из мотивов, которыми в самих разборах и рисуют схемы — слои,
// граф, сетка, поток, кольца. Полка из таких обложек читается как оформление,
// а не как дырка в вёрстке.
//
// SVG, а не растр: сотня байт вместо сотни килобайт, чёткая на любом экране,
// и у неё свой фон — поэтому одинаково лежит и на светлой, и на тёмной теме.
//
// Заменить настоящей: положить файл в presentations/covers/<slug>.svg (или .webp
// и поправить расширение в реестре) — генератор чужие файлы не перезаписывает.

const W = 1200, H = 675;

// FNV-1a: нужен не крипто-хеш, а устойчивый выбор узора и оттенка по слагу —
// чтобы обложка не менялась от пересборки к пересборке.
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}

// Младшие биты FNV у похожих строк почти совпадают, а слаги здесь именно похожи
// (agents-weekly-2026-08-…), поэтому «hash % 5» выдавал пяти обложкам из восьми
// один узор. Финальное перемешивание разносит близкие входы по всему диапазону.
function mix(h) {
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

// Детерминированный поток чисел из одного зерна.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

// Палитра темы: тёмное дно, светлые чернила, акцент. Все обложки тёмные —
// на молочном фоне библиотеки они держат сетку и не спорят с текстом карточки.
const PALETTES = {
  ai:                { bg: '#141024', ink: '#b9aee8', accent: '#8b6dff', glow: '#6d4cff' },
  product:           { bg: '#0e1626', ink: '#a8c0e8', accent: '#4d8dff', glow: '#2f6bff' },
  'data-engineering':{ bg: '#0a1a1c', ink: '#9ad4cc', accent: '#22b8a6', glow: '#0e9f8f' },
  dev:               { bg: '#111426', ink: '#aeb6e8', accent: '#6f7dff', glow: '#4c5cff' },
  career:            { bg: '#1c1408', ink: '#e0c48f', accent: '#d99a2b', glow: '#b87a12' },
  travel:            { bg: '#1e1018', ink: '#e8b3c4', accent: '#e0628c', glow: '#c93f70' },
  health:            { bg: '#0c1a12', ink: '#9fd6b0', accent: '#35b46a', glow: '#1e9450' },
};
const FALLBACK = { bg: '#14161c', ink: '#b6bcc9', accent: '#8a93a6', glow: '#6b7386' };

const px = n => Math.round(n * 100) / 100;

// ── узоры ────────────────────────────────────────────────────────────────────
// Каждый рисует поверх общего фона и получает свой поток случайных чисел.

function layers(r, p) {           // слои: снапшоты, уровни хранения, стопка таблиц
  const n = 3 + Math.floor(r() * 2);
  let s = '';
  for (let i = 0; i < n; i++) {
    const y = 190 + i * 105, w = 300 - i * 18, cx = 380;
    s += `<g opacity="${px(0.95 - i * 0.16)}">`
      + `<path d="M${cx - w} ${y} L${cx} ${y - 58} L${cx + w} ${y} L${cx} ${y + 58} Z" `
      + `fill="${p.glow}" fill-opacity="${px(0.16 + i * 0.06)}" stroke="${p.accent}" stroke-width="2"/>`;
    for (let k = 0; k < 3; k++) {
      const bx = cx - 150 + k * 110 + r() * 26;
      s += `<rect x="${px(bx)}" y="${px(y - 16)}" width="46" height="26" rx="4" `
        + `fill="${p.accent}" fill-opacity="${px(0.35 + r() * 0.4)}"/>`;
    }
    s += `</g>`;
  }
  // связь со «версиями» справа — как в схемах эволюции таблиц
  for (let i = 0; i < n; i++) {
    const y = 190 + i * 105;
    s += `<circle cx="880" cy="${y}" r="13" fill="none" stroke="${p.accent}" stroke-width="2.5"/>`
      + `<circle cx="880" cy="${y}" r="5" fill="${p.accent}"/>`;
    if (i) s += `<line x1="880" y1="${y - 105 + 13}" x2="880" y2="${y - 13}" stroke="${p.ink}" stroke-opacity=".45" stroke-width="2"/>`;
  }
  return s;
}

function graph(r, p) {            // граф: агенты, связи, поток управления
  const pts = [];
  for (let i = 0; i < 9; i++) pts.push([160 + r() * 880, 150 + r() * 380]);
  let s = '';
  pts.forEach((a, i) => pts.slice(i + 1).forEach(b => {
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (d < 330) s += `<line x1="${px(a[0])}" y1="${px(a[1])}" x2="${px(b[0])}" y2="${px(b[1])}" `
      + `stroke="${p.ink}" stroke-opacity="${px(0.5 - d / 900)}" stroke-width="1.8"/>`;
  }));
  pts.forEach((a, i) => {
    const rad = i % 3 === 0 ? 26 : 15;
    s += `<circle cx="${px(a[0])}" cy="${px(a[1])}" r="${rad}" fill="${p.bg}" stroke="${p.accent}" stroke-width="2.5"/>`;
    if (i % 3 === 0) s += `<circle cx="${px(a[0])}" cy="${px(a[1])}" r="${rad - 9}" fill="${p.accent}" fill-opacity=".75"/>`;
  });
  return s;
}

function grid(r, p) {             // сетка: каталог, партиции, набор карточек
  let s = '';
  for (let y = 0; y < 4; y++) for (let x = 0; x < 7; x++) {
    const on = r() > 0.62;
    s += `<rect x="${150 + x * 130}" y="${170 + y * 95}" width="104" height="70" rx="9" `
      + `fill="${on ? p.accent : p.glow}" fill-opacity="${on ? px(0.55 + r() * 0.35) : 0.13}" `
      + `stroke="${p.accent}" stroke-opacity="${on ? 0.9 : 0.3}" stroke-width="1.8"/>`;
  }
  return s;
}

function flow(r, p) {             // поток: воронка, пайплайн, стадии
  let s = '';
  const stages = 4;
  for (let i = 0; i < stages; i++) {
    const x = 190 + i * 250, w = 140 - i * 12, h = 220 - i * 34;
    s += `<rect x="${px(x)}" y="${px(337 - h / 2)}" width="${px(w)}" height="${px(h)}" rx="14" `
      + `fill="${p.glow}" fill-opacity="${px(0.18 + i * 0.14)}" stroke="${p.accent}" stroke-width="2.2"/>`;
    if (i < stages - 1)
      s += `<path d="M${px(x + w + 10)} 337 L${px(x + 240)} 337" stroke="${p.ink}" stroke-width="2.4" `
        + `stroke-opacity=".6" marker-end="url(#a)"/>`;
    for (let k = 0; k < 3 - Math.floor(i / 2); k++)
      s += `<circle cx="${px(x + w / 2)}" cy="${px(300 + k * 38)}" r="7" fill="${p.accent}" fill-opacity="${px(0.5 + r() * 0.5)}"/>`;
  }
  return s;
}

function rings(r, p) {            // кольца: интервалы, циклы, повторение
  let s = '';
  const cx = 600, cy = 337;
  for (let i = 6; i >= 1; i--) {
    s += `<circle cx="${cx}" cy="${cy}" r="${i * 48}" fill="none" stroke="${p.accent}" `
      + `stroke-opacity="${px(0.15 + (7 - i) * 0.09)}" stroke-width="${px(1.5 + (7 - i) * 0.5)}" `
      + `stroke-dasharray="${i % 2 ? 'none' : '10 14'}"/>`;
  }
  for (let i = 0; i < 7; i++) {
    const ang = r() * Math.PI * 2, rad = 60 + r() * 230;
    s += `<circle cx="${px(cx + Math.cos(ang) * rad)}" cy="${px(cy + Math.sin(ang) * rad)}" r="${px(6 + r() * 9)}" fill="${p.accent}"/>`;
  }
  return s;
}

const PATTERNS = [layers, graph, grid, flow, rings];

export function coverSvg(slug, topic) {
  const p = PALETTES[topic] || FALLBACK;
  const h = mix(hash(slug));
  const draw = PATTERNS[h % PATTERNS.length];
  const r = rng(h);

  // Одна тема — одна палитра, а материалов в ней бывает шесть подряд. Небольшой
  // поворот тона и своя точка засветки разводят такие обложки между собой,
  // не выводя их из цвета направления.
  const hue = ((h >>> 7) % 37) - 18;
  const gx = 10 + (h >>> 11) % 70, gy = (h >>> 17) % 20;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">
<defs>
  <radialGradient id="g" cx="${gx}%" cy="${gy}%" r="105%">
    <stop offset="0%" stop-color="${p.glow}" stop-opacity=".42"/>
    <stop offset="55%" stop-color="${p.glow}" stop-opacity=".08"/>
    <stop offset="100%" stop-color="${p.bg}" stop-opacity="0"/>
  </radialGradient>
  <filter id="h" color-interpolation-filters="sRGB">
    <feColorMatrix type="hueRotate" values="${hue}"/>
  </filter>
  <marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
    <path d="M0 0 L10 5 L0 10 z" fill="${p.ink}" fill-opacity=".6"/>
  </marker>
</defs>
<rect width="${W}" height="${H}" fill="${p.bg}"/>
<rect width="${W}" height="${H}" fill="url(#g)"/>
<g filter="url(#h)">
${draw(r, p)}
</g>
</svg>
`;
}
