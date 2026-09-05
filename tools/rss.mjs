// Лента RSS журнала.
//
// Собирается из того же реестра, что и страница: подписчик получает ровно то,
// что видит посетитель, и ни одной записи «по ссылке» — unlisted отсеиваются
// вызывающей стороной вместе с остальными скрытыми.
//
// Даты сборки в файле нет намеренно. lastBuildDate менялся бы при каждом
// --rebuild, и лента давала бы дифф на пустом месте: перестало бы работать
// главное свойство сборки — прогнать дважды и увидеть, что ничего не поехало.

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// RFC-822 из даты реестра. Времени в реестре нет — берём полночь UTC: для ленты
// разборов важен день, а не час.
const rfc822 = iso => {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return `${DAYS[t.getUTCDay()]}, ${String(d).padStart(2, '0')} ${MONS[m - 1]} ${y} 00:00:00 GMT`;
};

export function rssFeed({ entries, base, author, title, about }) {
  const items = entries.map(p => `  <item>
    <title>${esc(p.title)}</title>
    <link>${base}${esc(p.slug)}.html</link>
    <guid isPermaLink="true">${base}${esc(p.slug)}.html</guid>
    <pubDate>${rfc822(p.date)}</pubDate>
    <description>${esc(p.desc)}</description>
  </item>`).join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${esc(title)}</title>
  <link>${base}</link>
  <atom:link href="${base}rss.xml" rel="self" type="application/rss+xml"/>
  <description>${esc(about)}</description>
  <language>ru</language>
  <managingEditor>${esc(author.email)} (${esc(author.name)})</managingEditor>
${items}
</channel>
</rss>
`;
}
