/* ===== GATE ===== */
// SHA-256 of "MTF2026" — změň kód pomocí: python3 -c "import hashlib; print(hashlib.sha256('NOVYKOD'.encode()).hexdigest())"
const GATE_HASH = '5b9b2870716de15d8a6174804647360b656a25c67b1be0703f1e695ff365384d';
const GATE_TTL = 30 * 24 * 60 * 60 * 1000;
const VAPID_PUBLIC = 'BCub7WYDQt5wX2Jj0HUUMhK-T8VATzn4rvfc108akt7VCh8qGd_rgw6lQRJGKPIAsBDrPHwt7pagUYia1WIyEYY';


async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function isAuthenticated() {
  try {
    const raw = localStorage.getItem('mtf_auth');
    if (!raw) return false;
    const { expires } = JSON.parse(raw);
    return Date.now() < expires;
  } catch { return false; }
}

function storeAuth() {
  localStorage.setItem('mtf_auth', JSON.stringify({ expires: Date.now() + GATE_TTL }));
}

function initGate() {
  if (isAuthenticated()) {
    document.getElementById('gate').classList.add('hidden');
    return;
  }

  const input = document.getElementById('gate-input');
  const btn = document.getElementById('gate-submit');
  const err = document.getElementById('gate-error');

  async function tryUnlock() {
    const code = input.value.trim().toUpperCase();
    if (!code) return;
    const hash = await sha256(code);
    if (hash === GATE_HASH) {
      storeAuth();
      document.getElementById('gate').classList.add('hidden');
    } else {
      err.textContent = 'Nesprávný kód. Zkus to znovu.';
      input.value = '';
      input.focus();
    }
  }

  btn.addEventListener('click', tryUnlock);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') tryUnlock(); });
  input.focus();
}

/* ===== THEME ===== */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const isLight = theme === 'light';
  document.getElementById('icon-sun').classList.toggle('hidden', !isLight);
  document.getElementById('icon-moon').classList.toggle('hidden', isLight);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem('theme', next);
  applyTheme(next);
}

/* ===== STATE ===== */
const state = {
  view: 'today',
  level: 'all',
  topic: 'all',
  today: null,
  archiveIndex: null,
  archiveCache: {},
  searchAll: [],
  searchIndex: null,
  activeCard: null,
  archiveDate: null,
  archiveMonth: null,
  transcriptDate: null,
};

/* ===== TOPIC COLORS ===== */
const TYPE_COLORS = {
  'INSIGHT': '#f06a15',
  'NÁSTROJE': '#3b82f6',
  'POSTAVIL JSEM': '#10b981',
  'OTEVŘENÁ OTÁZKA': '#8b5cf6',
  'TÉMA TÝDNE': '#f59e0b',
};

const LEVEL_CLASSES = {
  'Začátečník': 'level-zacatecnik',
  'Pokročilý': 'level-builder',
  'Builder': 'level-builder',
  'Expert': 'level-expert',
};

function normalizeLevel(level) {
  return level === 'Builder' ? 'Pokročilý' : (level || '');
}

/* ===== DATE FORMATTING ===== */
const MONTHS_CS = ['ledna', 'února', 'března', 'dubna', 'května', 'června',
  'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];

const MONTHS_CS_SHORT = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn',
  'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'];

function formatDateLong(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${d}. ${MONTHS_CS[m - 1]} ${y}`;
}

function formatDateShort(dateStr) {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${d}. ${MONTHS_CS_SHORT[m - 1]}`;
}

function isToday(dateStr) {
  return dateStr === new Date().toISOString().slice(0, 10);
}

/* ===== DOM HELPERS ===== */
function $(id) { return document.getElementById(id); }
function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }
function setHTML(id, html) { $(id).innerHTML = html; }

/* ===== TOAST ===== */
let toastTimer;
function showToast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2200);
}

/* ===== CARD HTML ===== */
function renderCardEl(card, isResurfaced = false) {
  const level = normalizeLevel(card.level);
  const levelClass = LEVEL_CLASSES[level] || '';
  const typeColor = TYPE_COLORS[card.type] || '#808080';
  const sourceDate = card.resurfaced_from || card.source_date || card.date || '';
  const cardDate = card.source_date || card.date || '';
  const topics = getTopics(card).slice(0, 5);

  const resurfacedBadge = isResurfaced
    ? `<span class="resurfacing-badge">Z archivu · ${formatDateShort(sourceDate)}</span>`
    : '';

  return `
    <div class="card${isResurfaced ? ' resurfaced' : ''}"
         data-id="${esc(card.id)}"
         data-type="${esc(card.type)}"
         role="article"
         tabindex="0"
         aria-label="${esc(card.title)}">
      <div class="card-meta">
        ${resurfacedBadge}
        <span class="card-level ${levelClass}">${esc(level)}</span>
        <span class="card-type" style="color:${typeColor}">${esc(card.type)}</span>
      </div>
      <div class="card-title">${esc(card.title)}</div>
      <div class="card-excerpt">${esc(card.excerpt)}</div>
      ${topics.length ? `<div class="card-topics">${topics.map(t => `<span class="card-topic">${esc(t)}</span>`).join('')}</div>` : ''}
      <div class="card-footer">
        <span class="card-readmore">Číst dál ↓</span>
        ${cardDate ? `<span class="card-date">${formatDateShort(cardDate)}</span>` : ''}
      </div>
    </div>
  `;
}
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ===== TOPICS ===== */
function getTopics(card) {
  if (Array.isArray(card.topics)) return card.topics.filter(Boolean);
  if (card.topic) return card.topic.split(' / ').map(t => t.trim()).filter(Boolean);
  return [];
}

function buildTopicChips(cards, activeLevel) {
  const filtered = activeLevel && activeLevel !== 'all'
    ? cards.filter(c => (normalizeLevel(c.level)) === activeLevel)
    : cards;

  const counts = {};
  filtered.forEach(c => getTopics(c).forEach(t => { counts[t] = (counts[t] || 0) + 1; }));

  const topics = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([t]) => t);

  if (state.topic !== 'all' && !topics.includes(state.topic)) {
    state.topic = 'all';
  }

  const chips = $('topic-chips');
  let html = `<button class="chip${state.topic === 'all' ? ' active' : ''}" data-topic="all">Vše</button>`;
  topics.forEach(t => {
    html += `<button class="chip${state.topic === t ? ' active' : ''}" data-topic="${esc(t)}">${esc(t)}</button>`;
  });
  chips.innerHTML = html;
}

/* ===== FILTER ===== */
function filterCards(cards) {
  return cards.filter(c => {
    if (state.level !== 'all' && normalizeLevel(c.level) !== state.level) return false;
    if (state.topic !== 'all' && !getTopics(c).includes(state.topic)) return false;
    return true;
  });
}

/* ===== RENDER CARDS ===== */
function renderCards(cards, containerId, resurfaced = null) {
  const container = $(containerId);
  const filtered = filterCards(cards);

  let html = '';

  if (filtered.length === 0 && !resurfaced) {
    container.innerHTML = '';
    return;
  }

  html += filtered.map(c => renderCardEl(c)).join('');

  if (resurfaced && (state.level === 'all' || state.level === resurfaced.level)
      && (state.topic === 'all' || state.topic === resurfaced.topic)) {
    html += `<div class="section-header">Z archivu</div>`;
    html += renderCardEl(resurfaced, true);
  }

  container.innerHTML = html;
  attachCardListeners(container);
}

/* ===== TODAY VIEW ===== */
async function loadToday() {
  show('loading-today');
  hide('empty-today');
  $('cards-today').innerHTML = '';

  try {
    const data = await fetchJSON('/data/today.json');

    if ((data.cards || []).length > 0) {
      state.today = data;
      hide('loading-today');
      updateHeader(data, false);
      buildTopicChips(data.cards, state.level);
      renderCards(data.cards, 'cards-today', data.resurfacing || null);
      return;
    }

    // Dnesni digest jeste nevysel — nacteme vcerejsek
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toISOString().slice(0, 10);

    try {
      const yData = await fetchJSON(`/data/archive/${yStr}.json`);
      state.today = yData;
      state.archiveCache[yStr] = yData;
      hide('loading-today');
      updateHeader(yData, true);
      buildTopicChips(yData.cards || [], state.level);
      renderCards(yData.cards || [], 'cards-today', yData.resurfacing || null);
    } catch {
      hide('loading-today');
      _setNavLabel('Včera');
      show('empty-today');
    }
  } catch {
    hide('loading-today');
    _setNavLabel('Včera');
    show('empty-today');
  }
}

function _setNavLabel(label) {
  const btn = document.querySelector('.nav-btn[data-view="today"]');
  if (btn) btn.querySelector('span:last-child').textContent = label;
}

function updateHeader(data, isYesterday) {
  const dateStr = data.date || new Date().toISOString().slice(0, 10);
  const count = (data.cards || []).length;
  const hasResurfacing = !!data.resurfacing;
  const label = isYesterday ? 'Včera' : 'Dnes';

  const badge = $('live-badge');
  badge.classList.remove('hidden');
  $('live-count').textContent = `${label} ${count + (hasResurfacing ? 1 : 0)} poznatků`;

  _setNavLabel(label);
}

/* ===== ARCHIVE VIEW ===== */
async function loadArchiveIndex() {
  if (state.archiveIndex) return;
  try {
    state.archiveIndex = await fetchJSON('/data/archive.json');
  } catch {
    state.archiveIndex = { dates: [] };
  }
}

async function showArchive() {
  await loadArchiveIndex();
  renderArchiveDateGrid();

  if (state.archiveDate) {
    await loadArchiveDay(state.archiveDate);
  } else if (state.archiveIndex.dates && state.archiveIndex.dates.length > 0) {
    const latest = state.archiveIndex.dates[state.archiveIndex.dates.length - 1];
    await loadArchiveDay(typeof latest === 'string' ? latest : latest.date);
  }
}

function renderArchiveDateGrid() {
  const allDates = (state.archiveIndex?.dates || [])
    .map(d => typeof d === 'string' ? d : d.date)
    .sort().reverse();
  if (allDates.length === 0) { $('archive-date-grid').innerHTML = ''; return; }

  const isAllMode = state.archiveDate === 'all';

  const byMonth = {};
  const monthOrder = [];
  allDates.forEach(ds => {
    const ym = ds.slice(0, 7);
    if (!byMonth[ym]) { byMonth[ym] = []; monthOrder.push(ym); }
    byMonth[ym].push(ds);
  });

  let html = '<div class="archive-controls">';
  html += '<button class="cal-all-btn' + (isAllMode ? ' active' : '') + '" id="cal-all-btn">Vše</button>';
  html += '</div>';

  monthOrder.forEach(ym => {
    const [y, m] = ym.split('-').map(Number);
    html += '<div class="archive-month-row">';
    html += '<span class="archive-month-name">' + MONTHS_CS[m - 1] + ' ' + y + '</span>';
    html += '<div class="archive-date-pills">';
    byMonth[ym].forEach(ds => {
      const day = parseInt(ds.slice(8), 10);
      const active = ds === state.archiveDate && !isAllMode ? ' active' : '';
      html += '<button class="date-pill' + active + '" data-date="' + ds + '">' + day + '.</button>';
    });
    html += '</div></div>';
  });

  $('archive-date-grid').innerHTML = html;

  $('archive-date-grid').querySelectorAll('.date-pill').forEach(btn => {
    btn.addEventListener('click', () => loadArchiveDay(btn.dataset.date));
  });

  const allBtn = $('cal-all-btn');
  if (allBtn) allBtn.addEventListener('click', loadArchiveAll);
}
async function loadArchiveDay(dateStr) {
  state.archiveDate = dateStr;
  $('cards-archive').innerHTML = '';
  show('loading-archive');
  hide('empty-archive');
  renderArchiveDateGrid();

  try {
    let data = state.archiveCache[dateStr];
    if (!data) {
      data = await fetchJSON(`/data/archive/${dateStr}.json`);
      state.archiveCache[dateStr] = data;
    }

    hide('loading-archive');
    const cards = data.cards || [];
    if (cards.length === 0) {
      show('empty-archive');
      return;
    }
    buildTopicChips(cards);
    renderCards(cards, 'cards-archive');
  } catch {
    hide('loading-archive');
    show('empty-archive');
  }
}

async function loadArchiveAll() {
  state.archiveDate = 'all';
  $('cards-archive').innerHTML = '';
  show('loading-archive');
  hide('empty-archive');
  renderArchiveDateGrid();

  try {
    const allDates = (state.archiveIndex?.dates || []).map(d => typeof d === 'string' ? d : d.date).sort().reverse();
    const allCards = [];

    await Promise.all(allDates.map(async ds => {
      try {
        let data = state.archiveCache[ds];
        if (!data) {
          data = await fetchJSON('/data/archive/' + ds + '.json');
          state.archiveCache[ds] = data;
        }
        (data.cards || []).forEach(c => allCards.push({ ...c, date: c.date || ds, source_date: c.source_date || ds }));
      } catch { /* skip */ }
    }));

    hide('loading-archive');
    if (allCards.length === 0) { show('empty-archive'); return; }
    buildTopicChips(allCards, state.level);
    renderCards(allCards, 'cards-archive');
  } catch {
    hide('loading-archive');
    show('empty-archive');
  }
}

/* ===== SEARCH ===== */
async function initSearch() {
  if (state.searchIndex) return;
  show('loading-search');
  hide('search-hint');

  try {
    const index = await fetchJSON('/data/archive.json');
    const allCards = [];

    await Promise.all(
      (index.dates || []).map(async entry => {
        const d = typeof entry === 'string' ? entry : entry.date;
        try {
          let data = state.archiveCache[d];
          if (!data) {
            data = await fetchJSON(`/data/archive/${d}.json`);
            state.archiveCache[d] = data;
          }
          (data.cards || []).forEach(c => allCards.push({ ...c, date: c.date || d }));
          if (data.resurfacing) allCards.push({ ...data.resurfacing, date: d });
        } catch { /* skip bad days */ }
      })
    );

    state.searchAll = allCards;
    state.searchIndex = new Fuse(allCards, {
      keys: ['title', 'excerpt', 'body', 'topic'],
      threshold: 0.35,
      includeMatches: true,
      minMatchCharLength: 2,
    });

    hide('loading-search');
    show('search-hint');
  } catch {
    hide('loading-search');
    show('search-hint');
  }
}

function runSearch(query) {
  const q = query.trim();
  hide('empty-search');
  hide('cards-search');
  $('cards-search').innerHTML = '';

  if (q.length < 2) {
    show('search-hint');
    return;
  }

  hide('search-hint');

  if (!state.searchIndex) {
    show('loading-search');
    return;
  }

  let results = state.searchIndex.search(q);

  // Level filter
  if (state.level !== 'all') {
    results = results.filter(r => normalizeLevel(r.item.level) === state.level);
  }

  // Build chips from level-filtered results
  buildTopicChips(results.map(r => r.item), 'all');

  // Topic filter
  if (state.topic !== 'all') {
    results = results.filter(r => getTopics(r.item).includes(state.topic));
  }

  if (results.length === 0) {
    show('empty-search');
    return;
  }

  $('cards-search').innerHTML = results.slice(0, 30).map(r => renderCardEl(r.item)).join('');
  show('cards-search');
  attachCardListeners($('cards-search'));
}

/* ===== CARD OVERLAY ===== */
function openCard(cardId) {
  const card = findCard(cardId);
  if (!card) return;

  state.activeCard = card;
  history.pushState({ card: cardId }, '', `#card/${cardId}`);

  const levelClass = LEVEL_CLASSES[card.level] || '';
  const typeColor = TYPE_COLORS[card.type] || '#808080';

  $('overlay-meta').innerHTML = `
    <span class="card-level ${levelClass}">${esc(card.level)}</span>
    <span class="card-type" style="color:${typeColor}">${esc(card.type)}</span>
    ${getTopics(card).map(t => `<span class="card-topic">${esc(t)}</span>`).join('')}
  `;

  const dateStr = card.source_date || card.resurfaced_from || card.date || '';
  $('overlay-title').textContent = card.title;
  const dateLabel = $('overlay-date-label');
  if (dateLabel) dateLabel.textContent = dateStr ? formatDateLong(dateStr) : '';
  $('overlay-text').innerHTML = bodyToHTML(card.body || card.excerpt || '');
  $('btn-show-transcript').dataset.date = dateStr;
  $('btn-show-transcript').style.display = dateStr ? '' : 'none';

  // Vote
  const voted = hasVoted(card.id);
  const voteBtn = $('btn-vote');
  voteBtn.classList.toggle('voted', voted);
  fetchVoteCount(card.id).then(c => { $('vote-count').textContent = c || ''; });
  voteBtn.onclick = async () => {
    if (hasVoted(card.id)) return;
    const count = await castVote(card.id);
    $('vote-count').textContent = count || '';
    voteBtn.classList.add('voted');
    showToast('Díky za hodnocení!');
  };

  // Similar cards
  const sim = getSimilarCards(card, 3);
  const simEl = $('overlay-similar');
  if (sim.length) {
    $('overlay-similar-cards').innerHTML = sim.map(c => `
      <div class="similar-card" data-id="${esc(c.id)}">
        <span class="similar-date">${c.source_date ? formatDateShort(c.source_date) : ''}</span>
        <span class="similar-title">${esc(c.title)}</span>
      </div>
    `).join('');
    simEl.classList.remove('hidden');
    simEl.querySelectorAll('.similar-card').forEach(el => {
      el.addEventListener('click', () => openCard(el.dataset.id));
    });
  } else {
    simEl.classList.add('hidden');
  }

  $('card-overlay').classList.remove('hidden');
  $('overlay-body').scrollTop = 0;
  document.body.style.overflow = 'hidden';
}

function closeCard() {
  $('card-overlay').classList.add('hidden');
  document.body.style.overflow = '';
  state.activeCard = null;
  if (location.hash.startsWith('#card/')) {
    history.back();
  }
}

function findCard(id) {
  const allPools = [
    state.today?.cards || [],
    state.today?.resurfacing ? [state.today.resurfacing] : [],
    ...Object.values(state.archiveCache).map(d => [...(d.cards || []), ...(d.resurfacing ? [d.resurfacing] : [])]),
    state.searchAll,
  ];
  for (const pool of allPools) {
    const found = pool.find(c => c.id === id);
    if (found) return found;
  }
  return null;
}

function bodyToHTML(text) {
  if (!text) return '';

  const lines = text.split('\n');
  const out = [];
  let inList = false;

  for (const raw of lines) {
    const line = raw.trimEnd();

    // Headings
    if (/^### /.test(line)) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h4>${inlineMarkdown(line.slice(4))}</h4>`);
      continue;
    }
    if (/^## /.test(line)) {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<h3>${inlineMarkdown(line.slice(3))}</h3>`);
      continue;
    }

    // List items
    if (/^[-*] /.test(line)) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inlineMarkdown(line.slice(2))}</li>`);
      continue;
    }

    // Numbered list
    if (/^\d+\. /.test(line)) {
      if (inList) { out.push('</ul>'); inList = false; }
      if (!inList) { out.push('<ol>'); inList = 'ol'; }
      out.push(`<li>${inlineMarkdown(line.replace(/^\d+\. /, ''))}</li>`);
      continue;
    }

    // Empty line — paragraph break
    if (line.trim() === '') {
      if (inList) { out.push(inList === 'ol' ? '</ol>' : '</ul>'); inList = false; }
      continue;
    }

    // Regular paragraph line
    if (inList) { out.push(inList === 'ol' ? '</ol>' : '</ul>'); inList = false; }
    out.push(`<p>${inlineMarkdown(line)}</p>`);
  }

  if (inList) out.push(inList === 'ol' ? '</ol>' : '</ul>');
  return out.join('');
}

function inlineMarkdown(text) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

/* ===== TRANSCRIPT VIEW ===== */
async function showTranscript(dateStr) {
  if (!dateStr) return;

  state.transcriptDate = dateStr;
  switchView('transcript');

  $('transcript-date-label').textContent = formatDateLong(dateStr);
  $('transcript-content').innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';

  try {
    let data = state.archiveCache[dateStr];
    if (!data) {
      data = await fetchJSON(`/data/archive/${dateStr}.json`);
      state.archiveCache[dateStr] = data;
    }

    const transcript = data.transcript;
    if (!transcript || !transcript.groups || transcript.groups.length === 0) {
      $('transcript-content').innerHTML = '<div class="empty-state"><p>Přepis není k dispozici.</p></div>';
      return;
    }

    let html = '';
    transcript.groups.forEach(group => {
      html += `<div class="transcript-group">`;
      html += `<div class="transcript-group-name">${esc(group.name)}</div>`;
      (group.messages || []).forEach(msg => {
        const isHost = msg.author === 'Daniel' || msg.author === 'Daniel Gamrot';
        html += `
          <div class="transcript-message">
            <div class="msg-time">${esc(msg.time || '')}</div>
            <div class="msg-body">
              <div class="msg-author${isHost ? ' is-host' : ''}">${esc(msg.author)}</div>
              <div class="msg-text">${esc(msg.text)}</div>
            </div>
          </div>
        `;
      });
      html += `</div>`;
    });

    $('transcript-content').innerHTML = html;
  } catch {
    $('transcript-content').innerHTML = '<div class="empty-state"><p>Přepis se nepodařilo načíst.</p></div>';
  }
}

/* ===== NAVIGATION ===== */
function switchView(viewName) {
  const prevView = state.view;

  document.getElementById('site-header').classList.toggle('stats-mode', viewName === 'stats');

  ['today', 'week', 'archive', 'search', 'stats', 'transcript'].forEach(v => {
    const el = $(`view-${v}`);
    if (el) el.classList.toggle('hidden', v !== viewName);
  });

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  if (viewName !== prevView) state.topic = 'all';
  state.view = viewName;

  if (viewName === 'today') {
    if (!state.today) {
      loadToday();
    } else {
      buildTopicChips(state.today.cards || [], state.level);
    }
  } else if (viewName === 'archive') {
    showArchive();
  } else if (viewName === 'week') {
    showWeek();
  } else if (viewName === 'search') {
    buildTopicChips([], state.level);
    initSearch();
    setTimeout(() => $('search-input').focus(), 100);
  } else if (viewName === 'stats') {
    showStats();
  }
}


/* ===== SERVICE WORKER ===== */
async function registerSW() {
  if (!('serviceWorker' in navigator)) return null;
  try { return await navigator.serviceWorker.register('/sw.js'); } catch { return null; }
}

function urlBase64ToUint8Array(b64) {
  const p = '='.repeat((4 - b64.length % 4) % 4);
  const raw = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/'));
  return new Uint8Array([...raw].map(c => c.charCodeAt(0)));
}

async function subscribePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
  });
  await fetch('/api/subscribe', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub.toJSON()),
  });
  return sub;
}

async function unsubscribePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await fetch('/api/subscribe', {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub.toJSON()),
  });
  await sub.unsubscribe();
}

async function initPushBtn() {
  const btn = $('btn-bell');
  if (!btn || !('PushManager' in window) || !('serviceWorker' in navigator)) {
    if (btn) btn.style.display = 'none';
    return;
  }
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  if (!reg) { btn.style.display = 'none'; return; }
  const sub = await reg.pushManager.getSubscription();
  setPushBtnState(btn, !!sub);
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const current = await reg.pushManager.getSubscription();
      if (current) {
        await unsubscribePush(); setPushBtnState(btn, false); showToast('Notifikace vypnuty');
      } else {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') { showToast('Přístup k notifikacím zamítnut'); return; }
        await subscribePush(); setPushBtnState(btn, true); showToast('Notifikace zapnuty');
      }
    } catch { showToast('Nepodařilo se změnit nastavení'); }
    finally { btn.disabled = false; }
  });
}
function setPushBtnState(btn, active) {
  btn.classList.toggle('bell-active', active);
  btn.setAttribute('title', active ? 'Notifikace zapnuty — klikni pro vypnutí' : 'Zapnout notifikace o novém digestu');
  btn.setAttribute('aria-label', active ? 'Vypnout notifikace' : 'Zapnout notifikace');
}

/* ===== BOOKMARKS ===== */
function getBookmarks() {
  try { return JSON.parse(localStorage.getItem('mtf_bookmarks') || '[]'); } catch { return []; }
}
function isBookmarked(id) { return getBookmarks().includes(id); }
function toggleBookmark(id) {
  let bm = getBookmarks();
  const has = bm.includes(id);
  bm = has ? bm.filter(b => b !== id) : [id, ...bm].slice(0, 300);
  localStorage.setItem('mtf_bookmarks', JSON.stringify(bm));
  return !has;
}

/* ===== VOTING ===== */
function hasVoted(id) {
  try { return JSON.parse(localStorage.getItem('mtf_votes') || '[]').includes(id); } catch { return false; }
}
function markVoted(id) {
  try {
    const v = JSON.parse(localStorage.getItem('mtf_votes') || '[]');
    if (!v.includes(id)) localStorage.setItem('mtf_votes', JSON.stringify([id, ...v].slice(0, 500)));
  } catch {}
}
async function fetchVoteCount(id) {
  try { const r = await fetch('/api/vote?id=' + encodeURIComponent(id)); return (await r.json()).count || 0; }
  catch { return 0; }
}
async function castVote(id) {
  try {
    const r = await fetch('/api/vote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const j = await r.json();
    markVoted(id);
    return j.count || 0;
  } catch { return 0; }
}

/* ===== SIMILAR CARDS ===== */
function getSimilarCards(card, n = 3) {
  if (!state.searchAll.length) return [];
  const topics = new Set(getTopics(card));
  return state.searchAll
    .filter(c => c.id !== card.id && getTopics(c).some(t => topics.has(t)))
    .sort((a, b) => (b.source_date || b.date || '').localeCompare(a.source_date || a.date || ''))
    .slice(0, n);
}

/* ===== LAST 7 DAYS ===== */
async function showWeek() {
  $('cards-week').innerHTML = '';
  show('loading-week');
  hide('empty-week');

  await loadArchiveIndex();
  try {
    const allDates = (state.archiveIndex?.dates || [])
      .map(d => typeof d === 'string' ? d : d.date)
      .sort().reverse().slice(0, 7);

    const allCards = [];
    await Promise.all(allDates.map(async ds => {
      try {
        let data = state.archiveCache[ds];
        if (!data) { data = await fetchJSON('/data/archive/' + ds + '.json'); state.archiveCache[ds] = data; }
        (data.cards || []).forEach(c => allCards.push({ ...c, source_date: c.source_date || ds }));
      } catch {}
    }));

    // Populate searchAll for similar cards (additive)
    allCards.forEach(c => { if (!state.searchAll.find(s => s.id === c.id)) state.searchAll.push(c); });

    hide('loading-week');
    if (!allCards.length) { show('empty-week'); return; }

    buildTopicChips(allCards, state.level);
    renderCards(allCards, 'cards-week');
  } catch {
    hide('loading-week');
    show('empty-week');
  }
}

/* ===== COMMUNITY STATS ===== */
async function showStats() {
  try { state.archiveIndex = await fetchJSON('/data/archive.json'); } catch {}
  renderStats();
}

async function renderStats() {
  const el = $('stats-section');
  if (!el) return;
  el.innerHTML = '<div class="stats-loading">Načítám statistiky…</div>';

  try {
    const allDates = (state.archiveIndex?.dates || []).map(d => typeof d === 'string' ? d : d.date);
    let totalCards = 0;
    const topicCounts = {};

    await Promise.all(allDates.map(async ds => {
      try {
        let data = state.archiveCache[ds];
        if (!data) { data = await fetchJSON('/data/archive/' + ds + '.json'); state.archiveCache[ds] = data; }
        totalCards += (data.cards || []).length;
        (data.cards || []).forEach(c => getTopics(c).forEach(t => { topicCounts[t] = (topicCounts[t] || 0) + 1; }));
      } catch {}
    }));

    const topTopics = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

    let topVotedHtml = '';
    try {
      const r = await fetch('/api/top');
      const raw = await r.json();
      const cardMap = {};
      allDates.forEach(ds => (state.archiveCache[ds]?.cards || []).forEach(c => { cardMap[c.id] = c; }));
      const topVoted = raw.filter(({ id, count }) => cardMap[id] && count > 0).slice(0, 10)
        .map(({ id, count }) => ({ card: cardMap[id], count }));
      if (topVoted.length) {
        topVotedHtml = '<div class="stats-section-title">Nejoblíbenější poznatky</div>'
          + '<div class="stats-top-cards">'
          + topVoted.map(({ card, count }) => `<div class="stats-top-card" data-id="${esc(card.id)}"><span class="stats-top-heart">♥ ${count}</span><span class="stats-top-title">${esc(card.title)}</span></div>`).join('')
          + '</div>';
      }
    } catch {}

    el.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-num">${totalCards}</div><div class="stat-label">poznatků v archivu</div></div>
        <div class="stat-card"><div class="stat-num">${allDates.length}</div><div class="stat-label">dní s obsahem</div></div>
        <div class="stat-card"><div class="stat-num">400+</div><div class="stat-label">členů komunity</div></div>
      </div>
      ${topTopics.length ? '<div class="stats-section-title">Nejčastější témata</div><div class="stats-topics">'
        + topTopics.map(([t, n]) => `<div class="stats-topic-row"><span>${esc(t)}</span><span class="stats-topic-count">${n}×</span></div>`).join('')
        + '</div>' : ''}
      ${topVotedHtml}
    `;

    el.querySelectorAll('.stats-top-card[data-id]').forEach(el => {
      el.addEventListener('click', () => openCard(el.dataset.id));
    });
  } catch {
    el.innerHTML = '';
  }
}

/* ===== FETCH ===== */
async function fetchJSON(url) {
  const res = await fetch(url + '?v=' + Date.now());
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* ===== ATTACH LISTENERS ===== */
function attachCardListeners(container) {
  container.querySelectorAll('.card').forEach(el => {
    el.addEventListener('click', () => openCard(el.dataset.id));
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openCard(el.dataset.id);
      }
    });
  });
}

/* ===== SHARE ===== */
async function shareCard() {
  const card = state.activeCard;
  if (!card) return;

  const url = `${location.origin}${location.pathname}#card/${card.id}`;

  if (navigator.share) {
    try {
      await navigator.share({ title: card.title, url });
      return;
    } catch { /* fall through to clipboard */ }
  }

  try {
    await navigator.clipboard.writeText(url);
    showToast('Odkaz zkopírován');
  } catch {
    showToast('Nepodařilo se zkopírovat');
  }
}

/* ===== HASH ROUTING ===== */
function handleHash() {
  const hash = location.hash.slice(1);
  if (hash.startsWith('card/')) {
    const id = hash.slice(5);
    if (id) {
      loadToday().then(() => {
        setTimeout(() => openCard(id), 200);
      });
    }
  } else if (hash === 'archive') {
    switchView('archive');
  } else if (hash === 'week') {
    switchView('week');
  } else if (hash === 'search') {
    switchView('search');
  } else if (hash === 'stats') {
    switchView('stats');
  } else {
    switchView('today');
  }
}

/* ===== FILTER EVENTS ===== */
function onLevelChange(level) {
  state.level = level;
  document.querySelectorAll('.level-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.level === level);
    btn.setAttribute('aria-selected', btn.dataset.level === level ? 'true' : 'false');
  });

  // Přestavíme topic chips na témata dostupná v novém levelu
  let currentCards = [];
  if (state.view === 'archive' && state.archiveDate && state.archiveDate !== 'all') {
    currentCards = state.archiveCache[state.archiveDate]?.cards || [];
  } else if (state.view === 'week') {
    currentCards = Object.values(state.archiveCache).flatMap(d => d.cards || []);
  } else {
    currentCards = state.today?.cards || [];
  }
  buildTopicChips(currentCards, level);

  rerenderCurrentView();
}

function onTopicChange(topic) {
  state.topic = topic;
  document.querySelectorAll('.chip').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.topic === topic);
  });
  rerenderCurrentView();
}

function rerenderCurrentView() {
  if (state.view === 'today' && state.today) {
    renderCards(state.today.cards || [], 'cards-today', state.today.resurfacing || null);
  } else if (state.view === 'archive' && state.archiveDate) {
    if (state.archiveDate === 'all') { loadArchiveAll(); return; }
    const data = state.archiveCache[state.archiveDate];
    if (data) renderCards(data.cards || [], 'cards-archive');
  } else if (state.view === 'week') {
    showWeek();
  } else if (state.view === 'search') {
    const q = $('search-input').value;
    if (q.length >= 2) runSearch(q);
    else buildTopicChips([], 'all');
  }
}

/* ===== INIT ===== */
function init() {
  initGate();
  applyTheme(document.documentElement.getAttribute('data-theme') || 'light');
  document.getElementById('btn-theme').addEventListener('click', toggleTheme);

  registerSW().then(() => initPushBtn());

  document.querySelectorAll('.level-tab').forEach(btn => {
    btn.addEventListener('click', () => onLevelChange(btn.dataset.level));
  });

  $('topic-chips').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (chip) onTopicChange(chip.dataset.topic);
  });

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchView(btn.dataset.view);
      history.pushState({}, '', `#${btn.dataset.view === 'today' ? '' : btn.dataset.view}`);
    });
  });

  $('overlay-close').addEventListener('click', closeCard);
  $('overlay-backdrop').addEventListener('click', closeCard);
  $('btn-share').addEventListener('click', shareCard);

  $('btn-show-transcript').addEventListener('click', () => {
    const dateStr = $('btn-show-transcript').dataset.date;
    closeCard();
    showTranscript(dateStr);
  });

  $('btn-transcript-back').addEventListener('click', () => {
    switchView(state.view === 'transcript' ? 'today' : state.view);
  });

  $('search-input').addEventListener('input', e => runSearch(e.target.value));

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('card-overlay').classList.contains('hidden')) {
      closeCard();
    }
  });

  window.addEventListener('popstate', () => {
    if ($('card-overlay').classList.contains('hidden') === false) {
      closeCard();
    }
  });

  handleHash();
  if (!location.hash || location.hash === '#') {
    loadToday();
    loadArchiveIndex();
  }
}

document.addEventListener('DOMContentLoaded', init);
