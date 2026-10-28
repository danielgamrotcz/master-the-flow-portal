// Jen veřejná projekce. Nikdy nerozšiřovat pomocí spreadu celého event objektu.
const ORIGIN = 'https://mastertheflow.cz';
const ID_RE = /^evt-\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/;
const DESIGNS = {
  'evt-2026-10-21-vibe-coding-nezacina-promptem': { lines: ['Vibecoding', 's Alexem.'], label: 'ROZHOVORY · 1. DÍL', description: 'Záznam rozhovoru · Alexovy materiály · Časovaný přepis · Master the Flow' },
  'evt-2026-09-22-ai-ktera-mi-fakt-funguje': { lines: ['AI, která mi', 'fakt funguje.'] },
  'evt-2026-08-29-sraz': { lines: ['Sraz v Praze.'] },
  'evt-2026-08-14-sraz-olomouc': { lines: ['Sraz v Olomouci.'] },
  'evt-2026-07-15-second-brain': { lines: ['Second Brain.'] },
  'evt-2026-06-11-raycast': { lines: ['Raycast.'], subtitle: 'Jak to mám nastavené já' },
  'evt-2026-06-10-show-and-tell': { lines: ['Projekty skupiny', 'Vibe Coding.'] },
  'evt-2026-05-07-pod-kapotou': { lines: ['Pod kapotou.'] },
  'evt-2026-03-13-vibe-coding': { lines: ['Vibe coding.'], subtitle: 'Jak si postavit aplikaci bez programování' },
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function projectEvent(event) {
  if (!ID_RE.test(event.id)) throw new Error('Invalid event ID');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event.date)) throw new Error('Invalid event date');
  const design = DESIGNS[event.id];
  if (!design) throw new Error(`Missing reviewed card design: ${event.id}`);
  const localPage = typeof event.detail_url === 'string'
    && /^\/[a-z0-9/-]+\/$/.test(event.detail_url) && !event.detail_url.startsWith('//')
    ? event.detail_url : null;
  const [year, month, day] = event.date.split('-');
  const date = `${Number(day)}. ${Number(month)}. ${year}`;
  const time = /^\d{2}:\d{2}$/.test(event.time_from || '') ? event.time_from : '';
  const end = time && /^\d{2}:\d{2}$/.test(event.time_to || '') ? event.time_to : '';
  return {
    id: event.id, title: String(event.title), date,
    time: time ? `${time}${end ? '–' + end : ''}` : '',
    label: design.label || (event.type === 'SHOW-AND-TELL' ? 'SHOW & TELL' : String(event.type)),
    description: design.description || '',
    lines: design.lines, subtitle: design.subtitle || '',
    pagePath: localPage || `/akce/${event.id}/`, landing: Boolean(localPage),
    imagePath: `/event-cards/${event.id}.png`,
  };
}

module.exports = { ORIGIN, projectEvent, escapeHtml };
