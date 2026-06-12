/* ===== GATE ===== */
const VAPID_PUBLIC = 'BCub7WYDQt5wX2Jj0HUUMhK-T8VATzn4rvfc108akt7VCh8qGd_rgw6lQRJGKPIAsBDrPHwt7pagUYia1WIyEYY';

function isAuthenticated() {
  try {
    const raw = localStorage.getItem('mtf_auth');
    if (!raw) return false;
    const { token, expires } = JSON.parse(raw);
    return token && Date.now() < expires;
  } catch { return false; }
}

function storeAuth(token, expires) {
  localStorage.setItem('mtf_auth', JSON.stringify({ token, expires }));
}

function initGate() {
  if (isAuthenticated()) return;

  document.getElementById('gate').classList.remove('hidden');

  const input = document.getElementById('gate-input');
  const btn = document.getElementById('gate-submit');
  const err = document.getElementById('gate-error');

  input.addEventListener('input', () => { err.textContent = ''; });

  async function tryUnlock() {
    const code = input.value.trim();
    if (!code) {
      err.textContent = 'Zadejte prosím přístupový kód.';
      input.focus();
      return;
    }
    btn.disabled = true;
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (res.ok) {
        const { token, expires } = await res.json();
        storeAuth(token, expires);
        document.getElementById('gate').classList.add('hidden');
      } else {
        err.textContent = 'Nesprávný kód. Zkuste to znovu.';
        input.value = '';
        input.focus();
      }
    } catch {
      err.textContent = 'Chyba připojení. Zkuste to znovu.';
    } finally {
      btn.disabled = false;
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
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.setAttribute('content', isLight ? '#f4f4f4' : '#0f0f0f');
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
  topic: 'all',
  today: null,
  archiveIndex: null,
  archiveCache: {},
  searchAll: [],
  searchIndex: null,
  activeCard: null,
  archivePreset: 'all',
  archiveFrom: null,
  archiveTo: null,
  archiveCards: [],
  archiveDateQueue: [],
  archivePageLoading: false,
  _archiveObserver: null,
  _archiveGen: 0,
  cardOpenedAt: null,
  statsMonth: null,
  statsMsgCountByDate: null,
  voteMap: {},
  cardStats: {},
  topCards: [],
  transcriptDate: null,
  searchQuery: '',
};

let _lastKnownDigestDate = null;
let _preCardHash = '';
let _preTranscriptHash = '';

/* ===== VOTES ===== */
async function loadVoteMap() {
  try {
    const authToken = chatGetToken();
    const [top, topCards] = await Promise.all([
      fetch('/api/top').then(r => r.json()),
      fetch('/api/top-cards', { headers: { 'x-mtf-token': authToken } }).then(r => r.ok ? r.json() : { cards: [] }),
    ]);
    if (Array.isArray(top)) top.forEach(({ id, count }) => { state.voteMap[id] = count; });
    if (topCards?.cards) topCards.cards.forEach(c => { state.cardStats[c.id] = c; });
  } catch {}
}

/* ===== ANALYTICS ===== */
function trackEvent(event, data) {
  const now = new Date();
  const enriched = { ...data, hour_utc: now.getUTCHours(), date: now.toISOString().slice(0, 10) };
  fetch('/api/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, data: enriched }),
  }).catch(() => {});
}

let searchTrackTimer = null;
let _lastSearchResultCount = -1;
function trackSearch(query) {
  clearTimeout(searchTrackTimer);
  if (query.trim().length >= 2) {
    const capturedCount = _lastSearchResultCount;
    searchTrackTimer = setTimeout(() => trackEvent('search', { query: query.trim(), result_count: capturedCount }), 2000);
  }
}

function trackSession() {
  const today = new Date().toISOString().slice(0, 10);
  if (localStorage.getItem('mtf_last_visit') !== today) {
    localStorage.setItem('mtf_last_visit', today);
    trackEvent('session_visit', {});
  }
}

/* ===== TOPIC COLORS ===== */
const TYPE_COLORS = {
  'INSIGHT': '#f06a15',
  'NÁSTROJE': '#3b82f6',
  'UKÁZKA': '#10b981',
  'TIP': '#06b6d4',
  'OTEVŘENÁ OTÁZKA': '#8b5cf6',
  'TÉMA TÝDNE': '#f59e0b',
};

/* ===== DATE FORMATTING ===== */
const MONTHS_CS = ['ledna', 'února', 'března', 'dubna', 'května', 'června',
  'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];

const MONTHS_CS_NOM = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen',
  'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];

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

/* ===== SKELETON LOADING ===== */
function renderSkeleton(containerId, count = 4) {
  const widths = ['55px', '70px', '48px', '62px', '58px', '66px'];
  const skels = Array.from({ length: count }, (_, i) => {
    const w = widths[i % widths.length];
    return `<div class="card card-skeleton" aria-hidden="true">
      <div class="card-meta"><div class="sk" style="height:10px;width:${w}"></div></div>
      <div class="sk sk-title" style="margin-top:10px"></div>
      <div class="sk sk-line"></div>
      <div class="sk sk-line sk-short"></div>
    </div>`;
  });
  $(containerId).innerHTML = skels.join('');
}

/* ===== TOAST ===== */
let toastTimer;
function showToast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2200);
}

/* ===== CARD LINKS ===== */
// Klikatelné odkazy v rozbalené kartě. Jen http(s), escapované, otevírají nové okno.
function renderCardLinks(card) {
  const links = Array.isArray(card.links)
    ? [...new Set(card.links.filter(u => typeof u === 'string' && /^https?:\/\//i.test(u)))]
    : [];
  if (!links.length) return '';
  const items = links.map(u => {
    let label;
    try { label = new URL(u).hostname.replace(/^www\./, ''); } catch { label = u; }
    return `<a class="card-link" href="${esc(u)}" target="_blank" rel="noopener noreferrer nofollow">${esc(label)}</a>`;
  }).join('');
  return `<div class="card-links"><span class="card-links-label">Odkazy</span>${items}</div>`;
}

/* ===== CARD HTML ===== */
function renderCardEl(card, isResurfaced = false, query = '') {
  const typeColor = TYPE_COLORS[card.type] || 'var(--text-tertiary)';
  const sourceDate = card.resurfaced_from || card.source_date || card.date || '';
  const cardDate = card.source_date || card.date || '';
  const topics = getTopics(card).slice(0, 5);

  return `
    <div class="card-wrap">
      <div class="swipe-bg swipe-bg-vote" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
      </div>
      <div class="swipe-bg swipe-bg-read" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
      </div>
      <div class="card${isResurfaced ? ' resurfaced' : ''}${isRead(card.id) ? ' read' : ''}"
           data-id="${esc(card.id)}"
           data-type="${esc(card.type)}"
           role="article"
           tabindex="0"
           aria-label="${esc(card.title)}">
        <div class="card-meta">
          <div class="card-meta-left">
            <span class="card-type" style="color:${typeColor}">${esc(card.type)}</span>
          </div>
          ${topics.length ? `<div class="card-topics">${topics.map(t => `<span class="card-topic">${esc(t)}</span>`).join('')}</div>` : ''}
        </div>
        <div class="card-title">${query ? highlightInHTML(esc(card.title), query) : esc(card.title)}</div>
        <div class="card-excerpt">${query ? highlightInHTML(esc(card.excerpt), query) : esc(card.excerpt)}</div>
        <div class="card-footer">
          <span class="card-readmore">Číst dál ↓</span>
          <span class="card-footer-right">
            <span class="card-reads">${state.cardStats[card.id]?.reads ?? 0} čtení</span>
            <span class="card-hearts"><svg viewBox="0 0 24 24" fill="currentColor" width="11" height="11" style="vertical-align:-1px;margin-right:2px"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>${state.voteMap[card.id] || 0}</span>
            ${cardDate ? `<span class="card-date">${formatDateShort(cardDate)}</span>` : ''}
          </span>
        </div>
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

function buildTopicChips(cards) {
  const counts = {};
  cards.forEach(c => getTopics(c).forEach(t => { counts[t] = (counts[t] || 0) + 1; }));

  const topics = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([t]) => t);

  if (state.topic !== 'all' && !topics.includes(state.topic)) {
    if (counts[state.topic]) topics.push(state.topic); // fell below top-20 but still exists
    else state.topic = 'all';
  }

  const chips = $('topic-chips');
  let html = `<button class="chip${state.topic === 'all' ? ' active' : ''}" data-topic="all" aria-selected="${state.topic === 'all' ? 'true' : 'false'}">Vše</button>`;
  topics.forEach(t => {
    const sel = state.topic === t;
    html += `<button class="chip${sel ? ' active' : ''}" data-topic="${esc(t)}" aria-selected="${sel ? 'true' : 'false'}">${esc(t)}<span class="chip-count">${counts[t]}</span></button>`;
  });
  chips.innerHTML = html;
}

/* ===== FILTER ===== */
function filterCards(cards) {
  if (state.topic === 'all') return cards;
  return cards.filter(c => getTopics(c).includes(state.topic));
}

/* ===== UNREAD BAR ===== */

/* ===== RENDER CARDS ===== */
function sortByVotes(cards) {
  return [...cards].sort((a, b) => (state.voteMap[b.id] || 0) - (state.voteMap[a.id] || 0));
}

function renderCards(cards, containerId, resurfaced = null) {
  const container = $(containerId);
  const filtered = sortByVotes(filterCards(cards));

  let html = '';

  if (filtered.length === 0 && !resurfaced) {
    container.innerHTML = '<div class="empty-state"><p>Žádné poznatky pro toto téma. Zkuste filtr „Vše“.</p></div>';
    return;
  }

  html += filtered.map(c => renderCardEl(c)).join('');

  if (resurfaced && (state.topic === 'all' || state.topic === resurfaced.topic)) {
    html += `<div class="section-header">Z archivu</div>`;
    html += renderCardEl(resurfaced, true);
  }

  container.innerHTML = html;
  attachCardListeners(container);
}

/* ===== TODAY VIEW ===== */
async function loadToday() {
  hide('loading-today');
  hide('empty-today');
  renderSkeleton('cards-today');

  try {
    const data = await fetchJSON('/data/today.json');

    // today.json je vždy nejnovější digest — zobrazíme ho, i když má 0 karet
    // (klidný den). 0 karet je validní stav, ne „digest ještě nevyšel".
    state.today = data;
    _lastKnownDigestDate = data.date;
    state.archiveCache[data.date] = data;
    const actualToday = new Date().toISOString().slice(0, 10);
    const isYesterdayData = data.date !== actualToday;
    $('cards-today').innerHTML = '';
    updateHeader(data, isYesterdayData);
    buildTopicChips(data.cards || []);

    if ((data.cards || []).length > 0) {
      renderCards(data.cards, 'cards-today', null);
    } else {
      $('cards-today').innerHTML =
        '<div class="empty-state"><p>Za včerejšek nejsou žádné vygenerované poznatky.</p></div>';
    }
    updatePageTitle();
    ensureSearchAll().catch(() => {});
  } catch {
    $('cards-today').innerHTML = '';
    _setNavLabel('Včera');
    show('empty-today');
  }
}

function _setNavLabel(label) {
  const btn = document.querySelector('.nav-btn[data-view="today"]');
  if (btn) btn.querySelector('span:last-child').textContent = label;
}

function poznatek(n) {
  if (n === 1) return 'poznatek';
  if (n >= 2 && n <= 4) return 'poznatky';
  return 'poznatků';
}

function updateHeader(data, isYesterday) {
  const label = isYesterday ? 'Včera' : 'Dnes';
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
  if (!state.archivePreset) state.archivePreset = 'all';
  renderArchiveControls();
  if (state.archivePreset === 'custom' && state.archiveFrom && state.archiveTo) {
    await loadArchiveDateRange(state.archiveFrom, state.archiveTo);
  } else if (state.archiveCards.length > 0) {
    buildTopicChips(state._archiveCountsComplete ? state._archiveAllCards : state.archiveCards);
    renderCards(state.archiveCards, 'cards-archive');
  } else {
    await loadArchivePreset(state.archivePreset);
  }
}

function archiveTodayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function archiveDaysBack(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function archiveThisMonthFrom() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
}
function archiveLastMonth() {
  const d = new Date();
  const y = d.getFullYear(), m = d.getMonth(); // m is 0-based = last month in 1-based
  const ly = m === 0 ? y - 1 : y;
  const lm = m === 0 ? 12 : m;
  const lastDay = new Date(y, m, 0).getDate();
  return {
    from: ly + '-' + String(lm).padStart(2, '0') + '-01',
    to: ly + '-' + String(lm).padStart(2, '0') + '-' + String(lastDay).padStart(2, '0'),
  };
}

function renderArchiveControls() {
  const PRESETS = [
    { key: '7d', label: '7 dní' },
    { key: 'this-month', label: 'Tento měsíc' },
    { key: 'last-month', label: 'Minulý měsíc' },
    { key: 'all', label: 'Vše' },
  ];
  const active = state.archivePreset;
  const fromVal = state.archiveFrom || '';
  const toVal = state.archiveTo || '';
  const todayStr = archiveTodayStr();

  let html = '<div class="archive-presets">';
  PRESETS.forEach(p => {
    html += '<button class="archive-preset' + (active === p.key ? ' active' : '') + '" data-preset="' + p.key + '">' + p.label + '</button>';
  });
  html += '</div>';
  html += '<div class="archive-range">';
  html += '<input type="date" id="archive-from" class="archive-date-input" value="' + fromVal + '" max="' + todayStr + '">';
  html += '<span class="archive-range-sep">–</span>';
  html += '<input type="date" id="archive-to" class="archive-date-input" value="' + toVal + '" max="' + todayStr + '">';
  html += '<button class="archive-range-btn" id="archive-range-apply">Zobrazit</button>';
  html += '</div>';

  $('archive-date-grid').innerHTML = html;

  document.querySelectorAll('.archive-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      state.archivePreset = btn.dataset.preset;
      state.archiveFrom = null;
      state.archiveTo = null;
      renderArchiveControls();
      loadArchivePreset(btn.dataset.preset);
    });
  });

  const applyBtn = $('archive-range-apply');
  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      const from = $('archive-from').value;
      const to = $('archive-to').value;
      if (!from || !to || from > to) return;
      state.archivePreset = 'custom';
      state.archiveFrom = from;
      state.archiveTo = to;
      history.replaceState({}, '', '#archive/' + from + '/' + to);
      renderArchiveControls();
      loadArchiveDateRange(from, to);
    });
  }
}

async function loadArchivePreset(preset) {
  state.archivePreset = preset;
  history.replaceState({}, '', '#archive/' + preset);
  let from, to;
  if (preset === '7d') { from = archiveDaysBack(7); to = archiveTodayStr(); }
  else if (preset === 'this-month') { from = archiveThisMonthFrom(); to = archiveTodayStr(); }
  else if (preset === 'last-month') { const lm = archiveLastMonth(); from = lm.from; to = lm.to; }
  else if (preset === 'all') { from = '2000-01-01'; to = archiveTodayStr(); }
  else { from = archiveDaysBack(90); to = archiveTodayStr(); }
  await loadArchiveDateRange(from, to);
}

const ARCHIVE_PAGE = 12;

async function loadArchiveDateRange(from, to) {
  hide('loading-archive');
  hide('empty-archive');
  renderSkeleton('cards-archive');

  if (state._archiveObserver) { state._archiveObserver.disconnect(); state._archiveObserver = null; }

  state._archiveGen++;
  const myGen = state._archiveGen;
  state._archiveCountsComplete = false;
  state._archiveAllCards = [];

  state.archiveDateQueue = (state.archiveIndex?.dates || [])
    .map(d => typeof d === 'string' ? d : d.date)
    .filter(d => d >= from && d <= to)
    .sort().reverse();
  const allDatesInRange = [...state.archiveDateQueue];
  state.archiveCards = [];
  state.archivePageLoading = false;

  if (state.archiveDateQueue.length === 0) {
    $('cards-archive').innerHTML = '';
    show('empty-archive');
    return;
  }

  await loadArchiveNextPage(true, myGen);
  prefetchArchiveCounts(allDatesInRange, myGen);
}

async function prefetchArchiveCounts(allDates, gen) {
  await Promise.all(allDates.map(async ds => {
    if (gen !== state._archiveGen) return;
    if (!state.archiveCache[ds]) {
      try {
        const data = await fetchJSON('/data/archive/' + ds + '.json');
        if (gen === state._archiveGen) state.archiveCache[ds] = data;
      } catch {}
    }
  }));
  if (gen !== state._archiveGen) return;
  const allCards = [];
  allDates.forEach(ds => {
    const data = state.archiveCache[ds];
    if (data) (data.cards || []).forEach(c => allCards.push({ ...c, source_date: c.source_date || ds }));
  });
  state._archiveCountsComplete = true;
  state._archiveAllCards = allCards;
  buildTopicChips(allCards);
}

async function loadArchiveNextPage(isFirst = false, gen = null) {
  if (state.archivePageLoading || state.archiveDateQueue.length === 0) return;
  if (gen !== null && gen !== state._archiveGen) return; // stale — preset changed
  state.archivePageLoading = true;

  const batch = state.archiveDateQueue.splice(0, ARCHIVE_PAGE);
  const newCards = [];
  await Promise.all(batch.map(async ds => {
    try {
      let data = state.archiveCache[ds];
      if (!data) { data = await fetchJSON('/data/archive/' + ds + '.json'); state.archiveCache[ds] = data; }
      (data.cards || []).forEach(c => newCards.push({ ...c, source_date: c.source_date || ds }));
    } catch {}
  }));

  if (gen !== null && gen !== state._archiveGen) { state.archivePageLoading = false; return; } // stale after fetch

  state.archiveCards.push(...newCards);

  const container = $('cards-archive');
  if (isFirst) {
    container.innerHTML = '';
    if (!state.archiveCards.length && !state.archiveDateQueue.length) { show('empty-archive'); state.archivePageLoading = false; return; }
    if (!state._archiveCountsComplete) buildTopicChips(state.archiveCards);
  } else {
    if (!state._archiveCountsComplete) buildTopicChips(state.archiveCards);
  }

  const sentinel = document.getElementById('archive-sentinel');
  if (sentinel) sentinel.remove();

  const filtered = filterCards(newCards);
  if (filtered.length) {
    const tmp = document.createElement('div');
    filtered.forEach(c => { tmp.innerHTML = renderCardEl(c); container.appendChild(tmp.firstElementChild); });
    attachCardListeners(container);
  }

  state.archivePageLoading = false;

  if (state.archiveDateQueue.length > 0) {
    if (filtered.length === 0) {
      // No visible cards from this batch — load next immediately without waiting for scroll
      await loadArchiveNextPage(false, gen);
    } else {
      const s = document.createElement('div');
      s.id = 'archive-sentinel';
      s.style.cssText = 'height:1px;width:100%;';
      container.appendChild(s);
      if (state._archiveObserver) state._archiveObserver.disconnect();
      const obs = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) loadArchiveNextPage(false, gen);
      }, { rootMargin: '300px' });
      obs.observe(s);
      state._archiveObserver = obs;
    }
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

    const seen = new Set();
    const deduped = allCards.filter(c => {
      if (!c.id || seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
    state.searchAll = deduped;
    state.searchIndex = new Fuse(deduped, {
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

function highlightInHTML(html, query) {
  if (!query) return html;
  const terms = query.trim().split(/\s+/)
    .filter(t => t.length >= 2)
    .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!terms.length) return html;
  const re = new RegExp(`(?![^<]*>)(${terms.join('|')})`, 'gi');
  return html.replace(re, '<mark class="search-highlight">$1</mark>');
}

function runSearch(query) {
  const q = query.trim();
  state.searchQuery = q;
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

  // Fuse fuzzy matching returns false positives — require exact substring presence.
  const lower = q.toLowerCase();
  results = results.filter(r => {
    const c = r.item;
    return (c.title || '').toLowerCase().includes(lower) ||
           (c.excerpt || '').toLowerCase().includes(lower) ||
           (c.body || '').toLowerCase().includes(lower);
  });

  buildTopicChips(results.map(r => r.item));

  // Topic filter
  if (state.topic !== 'all') {
    results = results.filter(r => getTopics(r.item).includes(state.topic));
  }

  _lastSearchResultCount = results.length;

  if (results.length === 0) {
    show('empty-search');
    return;
  }

  const sorted = results.slice(0, 50)
    .map(r => r.item)
    .sort((a, b) => {
      const vDiff = (state.voteMap[b.id] || 0) - (state.voteMap[a.id] || 0);
      if (vDiff !== 0) return vDiff;
      return (b.source_date || b.date || '').localeCompare(a.source_date || a.date || '');
    })
    .slice(0, 30);

  $('cards-search').innerHTML = sorted.map(c => renderCardEl(c, false, q)).join('');
  show('cards-search');
  attachCardListeners($('cards-search'));
}

/* ===== CARD OVERLAY ===== */
function openCard(cardId) {
  const card = findCard(cardId);
  if (!card) return;

  const wasRead = isRead(cardId);
  markRead(cardId);
  document.querySelectorAll(`.card[data-id="${CSS.escape(cardId)}"]`).forEach(el => el.classList.add('read'));

  if (!location.hash.startsWith('#card/')) {
    _preCardHash = location.hash || '#';
  }
  state.activeCard = card;
  history.replaceState({ card: cardId }, '', `#card/${cardId}`);

  const typeColor = TYPE_COLORS[card.type] || 'var(--text-tertiary)';

  $('overlay-meta').innerHTML = `
    <span class="card-type" style="color:${typeColor}">${esc(card.type)}</span>
    ${getTopics(card).map(t => `<span class="card-topic">${esc(t)}</span>`).join('')}
  `;

  const dateStr = card.source_date || card.resurfaced_from || card.date || '';
  const titleEl = $('overlay-title');
  titleEl.classList.remove('expanded', 'clampable');
  titleEl.textContent = card.title;
  requestAnimationFrame(() => {
    if (titleEl.scrollHeight > titleEl.clientHeight + 2) titleEl.classList.add('clampable');
  });

  const dateLabel = $('overlay-date-label');
  if (dateLabel) {
    dateLabel.textContent = dateStr ? formatDateLong(dateStr) : '';
    dateLabel.dataset.date = dateStr || '';
    dateLabel.classList.toggle('has-link', !!dateStr);
  }

  const readBadge = $('overlay-read-badge');
  if (readBadge) readBadge.classList.toggle('hidden', !wasRead);

  const topicsEl = $('overlay-topics');
  const overlayTopics = getTopics(card);
  if (topicsEl && overlayTopics.length) {
    topicsEl.innerHTML = overlayTopics.map(t =>
      `<button class="overlay-chip${state.topic === t ? ' active' : ''}" data-topic="${esc(t)}">${esc(t)}</button>`
    ).join('');
    topicsEl.classList.remove('hidden');
    topicsEl.querySelectorAll('.overlay-chip').forEach(btn => {
      btn.addEventListener('click', () => { closeCard(); onTopicChange(btn.dataset.topic); });
    });
  } else if (topicsEl) {
    topicsEl.classList.add('hidden');
  }
  const rawHtml = bodyToHTML(card.body || card.excerpt || '');
  const bodyHtml = (state.view === 'search' && state.searchQuery)
    ? highlightInHTML(rawHtml, state.searchQuery)
    : rawHtml;
  $('overlay-text').innerHTML = bodyHtml + renderCardLinks(card);
  $('btn-show-transcript').dataset.date = dateStr;
  $('btn-show-transcript').dataset.sourceGroup = card.source_group || '';
  $('btn-show-transcript').dataset.sourceMsgTimes = JSON.stringify(card.source_msg_times || []);
  $('btn-show-transcript').style.display = dateStr ? '' : 'none';

  // Vote
  const voted = hasVoted(card.id);
  const voteBtn = $('btn-vote');
  voteBtn.classList.toggle('voted', voted);
  fetchVoteCount(card.id).then(c => { $('vote-count').textContent = c || ''; });
  voteBtn.onclick = async () => {
    if (hasVoted(card.id)) {
      const count = await removeVote(card.id);
      $('vote-count').textContent = count || '';
      voteBtn.classList.remove('voted');
      state.voteMap[card.id] = count;
      showToast('Hodnocení odvoláno');
      rerenderCurrentView();
    } else {
      const count = await castVote(card.id);
      $('vote-count').textContent = count || '';
      voteBtn.classList.add('voted');
      if (count) state.voteMap[card.id] = count;
      showToast('Díky za hodnocení!');
      rerenderCurrentView();
    }
  };

  // Similar cards
  const simEl = $('overlay-similar');
  const renderSimilar = () => {
    const sim = getSimilarCards(card, 3);
    if (sim.length) {
      $('overlay-similar-cards').innerHTML = sim.map(c => `
        <div class="similar-card" data-id="${esc(c.id)}" role="button" tabindex="0" aria-label="${esc(c.title)}">
          <span class="similar-date">${c.source_date ? formatDateShort(c.source_date) : ''}</span>
          <span class="similar-title">${esc(c.title)}</span>
          <span class="similar-arrow">›</span>
        </div>
      `).join('');
      simEl.classList.remove('hidden');
      simEl.querySelectorAll('.similar-card').forEach(el => {
        el.addEventListener('click', () => openCard(el.dataset.id));
      });
    } else {
      simEl.classList.add('hidden');
    }
  };
  if (state.searchAll.length) {
    renderSimilar();
  } else {
    simEl.classList.add('hidden');
    ensureSearchAll().then(() => { if (state.activeCard?.id === cardId) renderSimilar(); });
  }

  $('card-overlay').classList.remove('hidden');
  $('overlay-body').scrollTop = 0;
  updateOverlayNav(cardId);
  requestAnimationFrame(() => $('overlay-close')?.focus());
  const mc = document.getElementById('main-content');
  if (mc) { mc.dataset.scrollTop = mc.scrollTop; mc.style.overflow = 'hidden'; }
  const banner = document.getElementById('refresh-banner');
  if (banner) banner.style.visibility = 'hidden';
  state.cardOpenedAt = Date.now();
  trackEvent('card_open', { id: cardId, topic: getTopics(card)[0] || null, card_type: card.type || null });
}

function closeCard() {
  if (state.activeCard && state.cardOpenedAt) {
    const duration_ms = Date.now() - state.cardOpenedAt;
    if (duration_ms >= 3000) {
      const readId = state.activeCard.id;
      trackEvent('card_read', { id: readId, duration_ms, topic: getTopics(state.activeCard)[0] || null });
      const cur = state.cardStats[readId] || { reads: 0 };
      state.cardStats[readId] = { ...cur, reads: (cur.reads || 0) + 1 };
      rerenderCurrentView();
    }
    state.cardOpenedAt = null;
  }
  const mc = document.getElementById('main-content');
  if (mc) { mc.style.overflow = ''; mc.scrollTop = parseFloat(mc.dataset.scrollTop || '0'); }
  $('card-overlay').classList.add('hidden');
  const banner = document.getElementById('refresh-banner');
  if (banner) banner.style.visibility = '';
  state.activeCard = null;
  if (location.hash.startsWith('#card/')) {
    history.replaceState({}, '', _preCardHash || '#');
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
      if (inList) { out.push(inList === 'ol' ? '</ol>' : '</ul>'); inList = false; }
      out.push(`<h4>${inlineMarkdown(line.slice(4))}</h4>`);
      continue;
    }
    if (/^## /.test(line)) {
      if (inList) { out.push(inList === 'ol' ? '</ol>' : '</ul>'); inList = false; }
      out.push(`<h3>${inlineMarkdown(line.slice(3))}</h3>`);
      continue;
    }

    // Bullet list items
    if (/^[-*] /.test(line)) {
      if (inList === 'ol') { out.push('</ol>'); inList = false; }
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inlineMarkdown(line.slice(2))}</li>`);
      continue;
    }

    // Numbered list
    if (/^\d+\. /.test(line)) {
      if (inList === true) { out.push('</ul>'); inList = false; }
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
async function showTranscript(dateStr, sourceGroup, sourceMsgTimes) {
  if (!dateStr) return;

  trackEvent('transcript_view', { date: dateStr, filtered: !!(sourceGroup && sourceMsgTimes?.length) });
  _preTranscriptHash = location.hash || '#';
  state.transcriptDate = dateStr;
  switchView('transcript');

  $('transcript-date-label').textContent = formatDateLong(dateStr);
  $('transcript-content').innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';

  const filtering = !!(sourceGroup && sourceMsgTimes && sourceMsgTimes.length > 0);

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
      if (filtering && group.slug !== sourceGroup) return;

      let messages = group.messages || [];
      if (filtering && sourceMsgTimes.length > 0) {
        const matchSet = new Set();
        messages.forEach((msg, i) => {
          if (sourceMsgTimes.includes(msg.time)) {
            for (let k = Math.max(0, i - 2); k <= Math.min(messages.length - 1, i + 2); k++) {
              matchSet.add(k);
            }
          }
        });
        if (matchSet.size > 0) {
          messages = Array.from(matchSet).sort((a, b) => a - b).map(i => group.messages[i]);
        }
      }

      html += `<div class="transcript-group">`;
      html += `<div class="transcript-group-name">${esc(group.name)}</div>`;
      messages.forEach(msg => {
        const isHost = msg.author === 'Daniel' || msg.author === 'Daniel Gamrot';
        const isSource = filtering && sourceMsgTimes.includes(msg.time);
        html += `
          <div class="transcript-message${isSource ? ' is-source' : ''}">
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

    if (filtering) {
      html = `<div class="transcript-filter-notice">Relevantní část diskuze k&nbsp;této kartě</div>` + html
           + `<div class="transcript-expand"><button class="btn-secondary" id="btn-transcript-expand">Zobrazit celý přepis</button></div>`;
    }

    const contentEl = $('transcript-content');
    contentEl.classList.toggle('transcript-filtered', filtering);
    contentEl.innerHTML = html;

    if (filtering) {
      document.getElementById('btn-transcript-expand')?.addEventListener('click', () => {
        showTranscript(dateStr);
      });
    }
  } catch {
    $('transcript-content').innerHTML = '<div class="empty-state"><p>Přepis se nepodařilo načíst.</p></div>';
  }
}

/* ===== NAVIGATION ===== */
function switchView(viewName) {
  const prevView = state.view;

  document.getElementById('site-header').classList.toggle('stats-mode', viewName === 'stats');

  const noChipsViews = new Set(['chat', 'transcript', 'stats']);
  $('topic-chips').classList.toggle('hidden', noChipsViews.has(viewName));

  ['today', 'week', 'archive', 'search', 'stats', 'transcript', 'top', 'chat'].forEach(v => {
    const el = $(`view-${v}`);
    if (el) el.classList.toggle('hidden', v !== viewName);
  });

  document.querySelectorAll('.nav-btn').forEach(btn => {
    const isActive = btn.dataset.view === viewName;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-current', isActive ? 'page' : 'false');
  });

  if (viewName !== prevView) state.topic = 'all';
  state.view = viewName;
  trackEvent('view_switch', { view: viewName });

  if (viewName === 'today') {
    if (!state.today) {
      loadToday();
    } else {
      buildTopicChips(state.today.cards || []);
    }
  } else if (viewName === 'archive') {
    showArchive();
  } else if (viewName === 'week') {
    showWeek();
  } else if (viewName === 'search') {
    initSearch();
    if (state.searchQuery && state.searchIndex) {
      runSearch(state.searchQuery);
    } else {
      buildTopicChips([]);
    }
    setTimeout(() => $('search-input').focus(), 100);
  } else if (viewName === 'stats') {
    showStats();
  } else if (viewName === 'top') {
    loadTopView();
  } else if (viewName === 'chat') {
    initChat();
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

/* ===== READ TRACKING ===== */
function getReadCards() {
  try { return new Set(JSON.parse(localStorage.getItem('mtf_read') || '[]')); } catch { return new Set(); }
}
function isRead(id) { return getReadCards().has(id); }
function markRead(id) {
  try {
    const s = getReadCards();
    if (!s.has(id)) {
      s.add(id);
      localStorage.setItem('mtf_read', JSON.stringify([...s].slice(-1000)));
      updatePageTitle();
    }
  } catch {}
}
function markUnread(id) {
  try {
    const s = getReadCards();
    s.delete(id);
    localStorage.setItem('mtf_read', JSON.stringify([...s]));
    document.querySelectorAll(`.card[data-id="${CSS.escape(id)}"]`).forEach(el => el.classList.remove('read'));
    updatePageTitle();
  } catch {}
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
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-mtf-token': chatGetToken() },
      body: JSON.stringify({ id }),
    });
    const j = await r.json();
    markVoted(id);
    return j.count || 0;
  } catch { return 0; }
}

function markUnvoted(id) {
  try {
    const v = JSON.parse(localStorage.getItem('mtf_votes') || '[]');
    localStorage.setItem('mtf_votes', JSON.stringify(v.filter(i => i !== id)));
  } catch {}
}

async function removeVote(id) {
  try {
    const r = await fetch('/api/vote', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json', 'x-mtf-token': chatGetToken() },
      body: JSON.stringify({ id }),
    });
    const j = await r.json();
    markUnvoted(id);
    return j.count ?? 0;
  } catch { return 0; }
}

/* ===== SIMILAR CARDS ===== */
function getSimilarCards(card, n = 3) {
  if (!state.searchAll.length) return [];
  const topicSet = new Set(getTopics(card));
  return state.searchAll
    .filter(c => c.id !== card.id && c.title && getTopics(c).some(t => topicSet.has(t)))
    .map(c => ({ c, score: getTopics(c).filter(t => topicSet.has(t)).length + Math.random() * 0.4 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map(({ c }) => c);
}

/* ===== RANDOM CARD ===== */
async function ensureSearchAll() {
  if (state.searchAll.length > 0) return;
  await loadArchiveIndex();
  const allCards = [];
  await Promise.all(
    (state.archiveIndex?.dates || []).map(async entry => {
      const d = typeof entry === 'string' ? entry : entry.date;
      try {
        let data = state.archiveCache[d];
        if (!data) { data = await fetchJSON('/data/archive/' + d + '.json'); state.archiveCache[d] = data; }
        (data.cards || []).forEach(c => allCards.push({ ...c, date: c.date || d }));
        if (data.resurfacing) allCards.push({ ...data.resurfacing, date: d });
      } catch {}
    })
  );
  const seen = new Set();
  state.searchAll = allCards.filter(c => {
    if (!c.id || seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
}

async function openRandomCard() {
  if (!state.searchAll.length) {
    showToast('Načítám archiv…');
    await ensureSearchAll();
  }
  const pool = state.searchAll.length ? state.searchAll : (state.today?.cards || []);
  if (!pool.length) { showToast('Žádné poznatky k dispozici'); return; }
  const card = pool[Math.floor(Math.random() * pool.length)];
  trackEvent('random_card', {});
  openCard(card.id);
}

/* ===== PAGE TITLE UNREAD COUNT ===== */
function updatePageTitle() {
  const cards = state.today?.cards || [];
  if (!cards.length) { document.title = 'Master the Flow — komunita'; return; }
  const readSet = getReadCards();
  const unread = cards.filter(c => !readSet.has(c.id)).length;
  document.title = unread > 0
    ? `(${unread}) Master the Flow — komunita`
    : 'Master the Flow — komunita';
}

/* ===== OVERLAY PREV/NEXT NAVIGATION ===== */
function getViewCardIds() {
  const gridId = { today: 'cards-today', week: 'cards-week', archive: 'cards-archive', search: 'cards-search', top: 'cards-top' }[state.view];
  if (!gridId) return [];
  return [...(document.getElementById(gridId)?.querySelectorAll('.card[data-id]') || [])].map(el => el.dataset.id);
}

function navigateOverlay(dir) {
  if (!state.activeCard) return;
  const ids = getViewCardIds();
  const idx = ids.indexOf(state.activeCard.id);
  if (idx === -1) return;
  const next = idx + dir;
  if (next < 0 || next >= ids.length) return;
  trackEvent('overlay_nav', { dir: dir > 0 ? 'next' : 'prev' });
  openCard(ids[next]);
}

function updateOverlayNav(cardId) {
  const ids = getViewCardIds();
  const idx = ids.indexOf(cardId);
  const prevBtn = document.getElementById('overlay-prev');
  const nextBtn = document.getElementById('overlay-next');
  if (prevBtn) prevBtn.disabled = idx <= 0;
  if (nextBtn) nextBtn.disabled = idx < 0 || idx >= ids.length - 1;
}

/* ===== NEXT UNREAD JUMP ===== */

/* ===== KEYBOARD CARD NAVIGATION ===== */
function navigateCards(dir) {
  const gridId = state.view === 'today' ? 'cards-today'
    : state.view === 'week' ? 'cards-week'
    : state.view === 'archive' ? 'cards-archive'
    : state.view === 'search' ? 'cards-search'
    : null;
  if (!gridId) return;
  const cards = [...document.getElementById(gridId).querySelectorAll('.card')];
  if (!cards.length) return;
  const focused = document.activeElement?.closest('.card');
  let idx = focused ? cards.indexOf(focused) : -1;
  idx = Math.max(0, Math.min(cards.length - 1, idx + dir));
  cards[idx].focus();
  cards[idx].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ===== PULL TO REFRESH ===== */
function initViewSwipe() {
  const NAV_ORDER = ['today', 'week', 'archive', 'search', 'top', 'stats'];
  const VIEW_MIN = 150;
  const content = document.getElementById('main-content');
  if (!content) return;

  let startX = 0, startY = 0, tracking = false, swiping = false;

  content.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    if (!$('card-overlay').classList.contains('hidden')) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    tracking = true;
    swiping = false;
  }, { passive: true });

  content.addEventListener('touchmove', e => {
    if (!tracking || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (!swiping) {
      if (Math.abs(dy) > Math.abs(dx) + 6) { tracking = false; return; }
      if (Math.abs(dx) < 12) return;
      swiping = true;
    }
    e.preventDefault();
  }, { passive: false });

  content.addEventListener('touchend', e => {
    if (!tracking || !swiping) { tracking = false; return; }
    tracking = false;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) < VIEW_MIN || Math.abs(dy) > Math.abs(dx) * 0.75) return;
    const idx = NAV_ORDER.indexOf(state.view);
    if (idx === -1) return;
    const nextIdx = dx < 0 ? idx + 1 : idx - 1;
    if (nextIdx < 0 || nextIdx >= NAV_ORDER.length) return;
    const next = NAV_ORDER[nextIdx];
    switchView(next);
    history.pushState({}, '', `#${next === 'today' ? '' : next}`);
  }, { passive: true });
}

function initPullToRefresh() {
  const content = document.getElementById('main-content');
  const indicator = document.getElementById('pull-indicator');
  if (!content || !indicator) return;

  let startY = 0, pulling = false;

  content.addEventListener('touchstart', e => {
    if (content.scrollTop === 0) {
      startY = e.touches[0].clientY;
      pulling = true;
    }
  }, { passive: true });

  content.addEventListener('touchmove', e => {
    if (!pulling) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 0) {
      const clamped = Math.min(dy * 0.5, 52);
      indicator.style.transform = `translateY(${clamped}px)`;
      indicator.classList.toggle('pull-ready', dy > 80);
    }
  }, { passive: true });

  content.addEventListener('touchend', () => {
    if (!pulling) return;
    const wasReady = indicator.classList.contains('pull-ready');
    pulling = false;
    indicator.style.transform = '';
    indicator.classList.remove('pull-ready');
    if (wasReady) reloadCurrentView();
  });
}

async function reloadCurrentView() {
  if (state.view === 'today') { state.today = null; loadToday(); }
  else if (state.view === 'week') { state.archiveIndex = null; showWeek(); }
  else if (state.view === 'archive') { state.archiveIndex = null; state.archiveCards = []; showArchive(); }
}

/* ===== AUTO REFRESH ===== */
function initAutoRefresh() {
  setInterval(async () => {
    try {
      const data = await fetch('/data/today.json?v=' + Date.now()).then(r => r.json());
      if (_lastKnownDigestDate && data.date && data.date !== _lastKnownDigestDate) {
        showRefreshBanner();
      }
    } catch {}
  }, 5 * 60 * 1000);
}

function showRefreshBanner() {
  const banner = document.getElementById('refresh-banner');
  if (!banner || !banner.classList.contains('hidden')) return;
  banner.classList.remove('hidden');
  banner.addEventListener('click', () => {
    banner.classList.add('hidden');
    _lastKnownDigestDate = null;
    state.today = null;
    state.archiveIndex = null;
    state.archiveCards = [];
    state.archiveDateQueue = [];
    state.archivePageLoading = false;
    if (state._archiveObserver) { state._archiveObserver.disconnect(); state._archiveObserver = null; }
    state.searchAll = [];
    state.searchIndex = null;
    switchView('today');
    loadToday();
  }, { once: true });
}

/* ===== LAST 7 DAYS ===== */
async function showWeek() {
  hide('loading-week');
  hide('empty-week');
  renderSkeleton('cards-week');

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

    $('cards-week').innerHTML = '';
    if (!allCards.length) { show('empty-week'); return; }

    buildTopicChips(allCards);
    renderCards(allCards, 'cards-week');
  } catch {
    $('cards-week').innerHTML = '';
    show('empty-week');
  }
}

/* ===== TOP VIEW ===== */
async function loadTopView() {
  const container = $('cards-top');
  const empty = $('empty-top');
  if (!container) return;
  if (empty) empty.classList.add('hidden');
  renderSkeleton('cards-top');

  try {
    const tc = await fetch('/api/top-cards', { headers: { 'x-mtf-token': chatGetToken() } }).then(r => r.ok ? r.json() : { cards: [] });
    if (tc?.cards) tc.cards.forEach(c => { state.cardStats[c.id] = c; });

    await ensureSearchAll();

    const score = ([id, s]) => (s.reads || 0) + (state.voteMap[id] || 0) * 5;
    const topCards = Object.entries(state.cardStats)
      .filter(([, s]) => s.reads > 0)
      .sort((a, b) => score(b) - score(a))
      .slice(0, 30)
      .map(([id]) => findCard(id))
      .filter(Boolean);

    container.innerHTML = '';
    if (!topCards.length) {
      if (empty) empty.classList.remove('hidden');
      return;
    }

    state.topCards = topCards;
    buildTopicChips(topCards);
    const filtered = filterCards(topCards);
    container.innerHTML = filtered.map(c => renderCardEl(c)).join('');
    attachCardListeners(container);
  } catch {
    container.innerHTML = '';
    if (empty) empty.classList.remove('hidden');
  }
}

/* ===== COMMUNITY STATS ===== */
async function showStats() {
  try { state.archiveIndex = await fetchJSON('/data/archive.json'); } catch {}
  renderStats();
}

function buildActivityCal(monthStr, msgCountByDate) {
  const [y, m] = monthStr.split('-').map(Number);
  const firstDay = new Date(y, m - 1, 1);
  const lastDay = new Date(y, m, 0);
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  let startDow = firstDay.getDay();
  startDow = startDow === 0 ? 6 : startDow - 1;

  const DAY_LABELS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
  const nextMonthDate = new Date(y, m, 1);
  const canGoNext = nextMonthDate <= today;

  let html = '<div class="activity-cal">';
  html += '<div class="activity-cal-nav">'
    + '<button class="cal-nav-btn" id="cal-prev">&#x2039;</button>'
    + '<span class="cal-month-label">' + MONTHS_CS_NOM[m - 1] + ' ' + y + '</span>'
    + '<button class="cal-nav-btn' + (canGoNext ? '' : ' cal-nav-disabled') + '" id="cal-next">&#x203A;</button>'
    + '</div>';

  html += '<div class="activity-cal-grid">';
  DAY_LABELS.forEach(d => { html += '<div class="cal-day-label">' + d + '</div>'; });

  for (let i = 0; i < startDow; i++) {
    html += '<div class="cal-day cal-day-pad"></div>';
  }

  for (let d = 1; d <= lastDay.getDate(); d++) {
    const ds = y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const count = msgCountByDate[ds] || 0;
    const dayDate = new Date(y, m - 1, d);
    if (dayDate > today) {
      html += '<div class="cal-day cal-day-future">' + d + '</div>';
    } else if (count === 0) {
      html += '<div class="cal-day cal-day-empty" title="' + d + '.' + m + '.">' + d + '</div>';
    } else {
      const intensity = count <= 10 ? 1 : count <= 30 ? 2 : 3;
      const word = count === 1 ? 'zpráva' : count <= 4 ? 'zprávy' : 'zpráv';
      html += '<div class="cal-day cal-day-active cal-day-i' + intensity + '" data-date="' + ds + '" title="' + d + '.' + m + '. · ' + count + ' ' + word + '"><span class="cal-day-num">' + d + '</span><span class="cal-day-count">' + count + ' ' + word + '</span></div>';
    }
  }

  html += '</div></div>';
  return html;
}

async function renderStats() {
  const el = $('stats-section');
  if (!el) return;
  el.innerHTML = '<div class="stats-loading">Načítám statistiky…</div>';

  try {
    const allDates = (state.archiveIndex?.dates || []).map(d => typeof d === 'string' ? d : d.date);
    let totalCards = 0;
    const topicCounts = {};
    const msgCountByDate = {};

    await Promise.all(allDates.map(async ds => {
      try {
        let data = state.archiveCache[ds];
        if (!data) { data = await fetchJSON('/data/archive/' + ds + '.json'); state.archiveCache[ds] = data; }
        const cnt = (data.cards || []).length;
        totalCards += cnt;
        const msgCount = (data.transcript?.groups || []).reduce((s, g) => s + (g.messages || []).length, 0);
        msgCountByDate[ds] = msgCount;
        (data.cards || []).forEach(c => getTopics(c).forEach(t => { topicCounts[t] = (topicCounts[t] || 0) + 1; }));
      } catch {}
    }));

    state.statsMsgCountByDate = msgCountByDate;
    const calMonth = state.statsMonth || new Date().toISOString().slice(0, 7);
    const calHtml = buildActivityCal(calMonth, msgCountByDate);
    const topTopics = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const cardMap = {};
    allDates.forEach(ds => (state.archiveCache[ds]?.cards || []).forEach(c => { cardMap[c.id] = c; }));

    let topVotedHtml = '';
    try {
      const r = await fetch('/api/top');
      const raw = await r.json();
      const topVoted = raw.filter(({ id, count }) => cardMap[id] && count > 0).slice(0, 8)
        .map(({ id, count }) => ({ card: cardMap[id], count }));
      if (topVoted.length) {
        topVotedHtml = '<div class="stats-section-title">Nejoblíbenější poznatky</div>'
          + '<div class="stats-top-cards">'
          + topVoted.map(({ card, count }) => '<div class="stats-top-card" data-id="' + esc(card.id) + '"><span class="stats-top-heart">♥ ' + count + '</span><span class="stats-top-title">' + esc(card.title) + '</span></div>').join('')
          + '</div>';
      }
    } catch {}

    let memberCount = null;
    try {
      const cm = await fetch('/api/community').then(r => r.json());
      memberCount = cm.count;
    } catch {}

    const numbersRow = '<div class="stats-grid">'
      + '<div class="stat-card"><div class="stat-num">' + totalCards + '</div><div class="stat-label">poznatků v archivu</div></div>'
      + '<div class="stat-card"><div class="stat-num">' + allDates.length + '</div><div class="stat-label">dní s obsahem</div></div>'
      + '<div class="stat-card"><div class="stat-num">' + (memberCount !== null ? memberCount + '+' : '—') + '</div><div class="stat-label">členů komunity</div></div>'
      + '</div>';

    const rightCol = (topTopics.length ? '<div class="stats-section-title">Nejčastější témata</div><div class="stats-topics">'
        + topTopics.map(([t, n]) => '<div class="stats-topic-row stats-topic-clickable" data-topic="' + esc(t) + '"><span>' + esc(t) + '</span><span class="stats-topic-count">' + n + '×</span></div>').join('')
        + '</div>' : '')
      + topVotedHtml;

    el.innerHTML = numbersRow
      + '<div class="stats-desktop-layout"><div class="stats-col-left">' + calHtml + '</div><div class="stats-col-right">' + rightCol + '</div></div>';

    attachStatsListeners(el);
  } catch {
    el.innerHTML = '';
  }
}

function updateStatsCalendar(el) {
  if (!el || !state.statsMsgCountByDate) { renderStats(); return; }
  const existing = el.querySelector('.activity-cal');
  if (!existing) { renderStats(); return; }
  const calMonth = state.statsMonth || new Date().toISOString().slice(0, 7);
  const tmp = document.createElement('div');
  tmp.innerHTML = buildActivityCal(calMonth, state.statsMsgCountByDate);
  existing.replaceWith(tmp.firstChild);
  attachCalendarListeners(el); // only calendar — avoids duplicating card/topic listeners
}

function attachCalendarListeners(el) {
  const calMonth = state.statsMonth || new Date().toISOString().slice(0, 7);
  const now = new Date();
  const curStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

  el.querySelector('#cal-prev')?.addEventListener('click', () => {
    const [cy, cm] = calMonth.split('-').map(Number);
    let pm = cm - 1, py = cy;
    if (pm < 1) { pm = 12; py--; }
    state.statsMonth = py + '-' + String(pm).padStart(2, '0');
    updateStatsCalendar(el);
  });
  el.querySelector('#cal-next')?.addEventListener('click', () => {
    const [cy, cm] = calMonth.split('-').map(Number);
    let nm = cm + 1, ny = cy;
    if (nm > 12) { nm = 1; ny++; }
    const nextStr = ny + '-' + String(nm).padStart(2, '0');
    if (nextStr <= curStr) {
      state.statsMonth = nextStr;
      updateStatsCalendar(el);
    }
  });
  el.querySelectorAll('.cal-day-active[data-date]').forEach(day => {
    day.addEventListener('click', () => {
      const date = day.dataset.date;
      trackEvent('archive_date', { date });
      state.archiveCards = [];
      state.archivePreset = 'custom';
      state.archiveFrom = date;
      state.archiveTo = date;
      history.replaceState({}, '', '#archive/' + date + '/' + date);
      switchView('archive');
    });
  });
}

function attachStatsListeners(el) {
  attachCalendarListeners(el);
  el.querySelectorAll('.stats-top-card[data-id]').forEach(card => {
    card.addEventListener('click', () => openCard(card.dataset.id));
  });
  el.querySelectorAll('.stats-topic-clickable[data-topic]').forEach(row => {
    row.addEventListener('click', () => openTopicInArchive(row.dataset.topic));
  });
}

function openTopicInArchive(topic) {
  const dates = (state.archiveIndex?.dates || []).map(d => typeof d === 'string' ? d : d.date).sort();
  const from = dates[0] || archiveDaysBack(90);
  const to = archiveTodayStr();
  state.archivePreset = 'custom';
  state.archiveFrom = from;
  state.archiveTo = to;
  state.archiveCards = [];
  history.replaceState({}, '', '#archive/' + from + '/' + to);
  switchView('archive');
  state.topic = topic; // switchView resets topic to 'all' — override after
}

/* ===== FETCH ===== */
async function fetchJSON(url) {
  const res = await fetch(url + '?v=' + Date.now());
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* ===== ATTACH LISTENERS ===== */
function attachCardListeners(container) {
  container.querySelectorAll('.card-wrap').forEach(wrap => {
    if (wrap.dataset.listenersAttached) return;
    wrap.dataset.listenersAttached = '1';
    const el = wrap.querySelector('.card');
    if (!el) return;
    el.addEventListener('click', () => {
      if (el.dataset.swipePrevented) return;
      openCard(el.dataset.id);
    });
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openCard(el.dataset.id);
      }
    });
    el.addEventListener('contextmenu', e => {
      if (!window.matchMedia('(pointer: fine)').matches) return;
      e.preventDefault();
      showCardContextMenu(e.clientX, e.clientY, el.dataset.id);
    });
    attachSwipeToCard(wrap);
  });
}

let _ctxMenuEl = null;
let _ctxDismiss = null;

function showCardContextMenu(x, y, cardId) {
  hideCardContextMenu();

  const voted = hasVoted(cardId);
  const read = isRead(cardId);
  const card = findCard(cardId);
  const hasTranscript = !!(card?.source_date);

  const menu = document.createElement('div');
  menu.className = 'card-ctx-menu';
  menu.innerHTML = `
    <button data-action="vote">${voted ? 'Odebrat srdíčko' : 'Líbí se mi'}</button>
    <button data-action="read">${read ? 'Označit jako nepřečtené' : 'Označit jako přečtené'}</button>
    <div class="card-ctx-sep"></div>
    <button data-action="share">Sdílet kartu</button>
    ${hasTranscript ? '<button data-action="transcript">Přepis konverzace</button>' : ''}
  `;
  document.body.appendChild(menu);
  _ctxMenuEl = menu;

  const mw = menu.offsetWidth || 220;
  const mh = menu.offsetHeight || 120;
  const vw = window.innerWidth, vh = window.innerHeight;
  menu.style.left = (x + mw > vw ? vw - mw - 8 : x) + 'px';
  menu.style.top  = (y + mh > vh ? y - mh : y) + 'px';

  menu.addEventListener('click', async e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    hideCardContextMenu();
    const action = btn.dataset.action;
    if (action === 'vote') {
      if (hasVoted(cardId)) {
        removeVote(cardId).then(count => { state.voteMap[cardId] = count; rerenderCurrentView(); showToast('Hodnocení odvoláno'); });
      } else {
        castVote(cardId).then(count => { if (count) state.voteMap[cardId] = count; rerenderCurrentView(); showToast('Díky za hodnocení!'); });
      }
    } else if (action === 'read') {
      if (isRead(cardId)) {
        markUnread(cardId); rerenderCurrentView(); showToast('Označeno jako nepřečtené');
      } else {
        markRead(cardId); rerenderCurrentView(); showToast('Označeno jako přečtené');
      }
    } else if (action === 'share') {
      const url = `${location.origin}${location.pathname}#card/${cardId}`;
      try { await navigator.clipboard.writeText(url); showToast('Odkaz zkopírován'); }
      catch { showToast('Nepodařilo se zkopírovat'); }
    } else if (action === 'transcript' && card) {
      showTranscript(card.source_date, card.source_group, card.source_msg_times);
    }
  });

  const dismiss = e => { if (!menu.contains(e.target)) hideCardContextMenu(); };
  const dismissKey = e => { if (e.key === 'Escape') hideCardContextMenu(); };
  setTimeout(() => {
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', dismissKey);
    document.addEventListener('scroll', hideCardContextMenu, { once: true, capture: true });
    _ctxDismiss = () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', dismissKey);
    };
  }, 0);
}

function hideCardContextMenu() {
  if (_ctxMenuEl) { _ctxMenuEl.remove(); _ctxMenuEl = null; }
  if (_ctxDismiss) { _ctxDismiss(); _ctxDismiss = null; }
}

function attachSwipeToCard(wrap) {
  if (wrap.dataset.swipeAttached) return;
  wrap.dataset.swipeAttached = '1';
  const THRESHOLD = 80;
  const el = wrap.querySelector('.card');
  if (!el) return;
  let startX = 0, startY = 0, tracking = false, swiping = false;
  let longPressTimer = null;

  const cancelLongPress = () => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } };

  wrap.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    tracking = true;
    swiping = false;
    el.style.transition = 'none';

    const touchX = e.touches[0].clientX;
    const touchY = e.touches[0].clientY;
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      if (swiping) return;
      // Swallow the click that fires after touchend — once, capture phase
      el.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); }, { once: true, capture: true });
      showCardContextMenu(touchX, touchY, el.dataset.id);
    }, 500);
  }, { passive: true });

  wrap.addEventListener('touchmove', e => {
    if (!tracking || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;

    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) cancelLongPress();

    if (!swiping) {
      if (Math.abs(dy) > Math.abs(dx) + 6) { tracking = false; el.style.transition = ''; return; }
      if (Math.abs(dx) < 8) return;
      swiping = true;
    }

    e.preventDefault();

    el.style.transform = `translateX(${dx * 0.45}px)`;
    const committed = Math.abs(dx) >= THRESHOLD;
    if (dx > 0) {
      wrap.classList.add('is-swiping-vote');
      wrap.classList.remove('is-swiping-read');
      wrap.classList.toggle('swipe-triggered-vote', committed);
      wrap.classList.remove('swipe-triggered-read');
    } else {
      wrap.classList.add('is-swiping-read');
      wrap.classList.remove('is-swiping-vote');
      wrap.classList.toggle('swipe-triggered-read', committed);
      wrap.classList.remove('swipe-triggered-vote');
    }
  }, { passive: false });

  wrap.addEventListener('touchend', e => {
    cancelLongPress();
    if (!tracking) return;
    tracking = false;
    const dx = e.changedTouches[0].clientX - startX;

    el.style.transition = 'transform 0.28s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    el.style.transform = 'translateX(0)';
    wrap.classList.remove('swipe-triggered-vote', 'swipe-triggered-read', 'is-swiping-vote', 'is-swiping-read');
    setTimeout(() => { el.style.transition = ''; }, 300);

    if (swiping) {
      el.dataset.swipePrevented = '1';
      setTimeout(() => delete el.dataset.swipePrevented, 350);
    }

    if (!swiping || Math.abs(dx) < THRESHOLD) return;

    if (navigator.vibrate) navigator.vibrate(10);

    const id = el.dataset.id;
    if (dx > 0) {
      if (hasVoted(id)) {
        removeVote(id).then(count => {
          state.voteMap[id] = count;
          showToast('Hodnocení odvoláno');
          rerenderCurrentView();
        });
      } else {
        castVote(id).then(count => {
          if (count) state.voteMap[id] = count;
          showToast('Díky za hodnocení!');
          rerenderCurrentView();
        });
      }
    } else {
      if (isRead(id)) {
        markUnread(id);
        showToast('Označeno jako nepřečtené');
      } else {
        markRead(id);
        el.classList.add('read');
        showToast('Označeno jako přečtené');
      }
      updatePageTitle();
    }
  }, { passive: true });
}

/* ===== SHARE ===== */
async function shareCard() {
  const card = state.activeCard;
  if (!card) return;

  trackEvent('share', { id: card.id });

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
    const cardId = hash.slice(5);
    const dateMatch = cardId.match(/^(\d{4}-\d{2}-\d{2})/);
    switchView('today');
    if (dateMatch) {
      const dateStr = dateMatch[1];
      (async () => {
        if (!state.archiveCache[dateStr]) {
          try {
            const data = await fetchJSON(`/data/archive/${dateStr}.json`);
            state.archiveCache[dateStr] = data;
          } catch {}
        }
        openCard(cardId);
      })();
    }
  } else if (hash.startsWith('archive')) {
    const parts = hash.split('/');
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (parts.length === 2 && ['7d', '30d', '90d', 'this-month', 'last-month', 'all'].includes(parts[1])) {
      state.archivePreset = parts[1];
      state.archiveFrom = null;
      state.archiveTo = null;
    } else if (parts.length === 3 && dateRe.test(parts[1]) && dateRe.test(parts[2])) {
      state.archivePreset = 'custom';
      state.archiveFrom = parts[1];
      state.archiveTo = parts[2];
    }
    switchView('archive');
  } else if (hash === 'week') {
    switchView('week');
  } else if (hash === 'search') {
    switchView('search');
  } else if (hash === 'stats') {
    switchView('stats');
  } else if (hash === 'top') {
    switchView('top');
  } else if (hash === 'chat') {
    switchView('chat');
  } else {
    switchView('today');
  }
}

/* ===== FILTER EVENTS ===== */
function onTopicChange(topic) {
  state.topic = topic;
  trackEvent('topic_filter', { topic });
  document.querySelectorAll('.chip').forEach(btn => {
    const isActive = btn.dataset.topic === topic;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
  const chips = $('topic-chips');
  if (chips) chips.scrollLeft = 0;
  rerenderCurrentView();
}

function rerenderCurrentView() {
  if (state.view === 'search' && state.searchQuery) {
    runSearch(state.searchQuery);
    return;
  }
  if (state.view === 'today' && state.today) {
    renderCards(state.today.cards || [], 'cards-today', null);
  } else if (state.view === 'archive' && state.archiveCards.length > 0) {
    const container = $('cards-archive');
    container.innerHTML = '';
    const filtered = filterCards(state.archiveCards);
    const tmp = document.createElement('div');
    filtered.forEach(c => { tmp.innerHTML = renderCardEl(c); container.appendChild(tmp.firstElementChild); });
    attachCardListeners(container);
    if (state.archiveDateQueue.length > 0) {
      const s = document.createElement('div');
      s.id = 'archive-sentinel';
      s.style.cssText = 'height:1px;width:100%;';
      container.appendChild(s);
      if (state._archiveObserver) state._archiveObserver.disconnect();
      const gen = state._archiveGen;
      const obs = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) loadArchiveNextPage(false, gen);
      }, { rootMargin: '300px' });
      obs.observe(s);
      state._archiveObserver = obs;
    }
  } else if (state.view === 'week') {
    showWeek();
  } else if (state.view === 'top' && state.topCards.length > 0) {
    const topContainer = $('cards-top');
    topContainer.innerHTML = '';
    const topFiltered = filterCards(state.topCards);
    topContainer.innerHTML = topFiltered.map(c => renderCardEl(c)).join('');
    attachCardListeners(topContainer);
  } else if (state.view === 'search') {
    const q = $('search-input').value;
    if (q.length >= 2) runSearch(q);
    else buildTopicChips([]);
  }
}

/* ===== SWIPE TO CLOSE ===== */
function initSwipeToClose() {
  const sheet = document.querySelector('.overlay-sheet');
  const overlay = $('card-overlay');
  if (!sheet) return;

  let startY = 0, dragging = false;

  sheet.addEventListener('touchstart', e => {
    const body = $('overlay-body');
    if (body && body.scrollTop > 0) return;
    startY = e.touches[0].clientY;
    dragging = true;
    sheet.style.transition = 'none';
  }, { passive: true });

  sheet.addEventListener('touchmove', e => {
    if (!dragging) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 0) sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: true });

  sheet.addEventListener('touchend', e => {
    if (!dragging) return;
    dragging = false;
    const dy = e.changedTouches[0].clientY - startY;
    sheet.style.transition = 'transform 240ms ease';
    if (dy > 100) {
      sheet.style.transform = 'translateY(100%)';
      setTimeout(() => {
        sheet.style.transition = '';
        sheet.style.transform = '';
        closeCard();
      }, 240);
    } else {
      sheet.style.transform = '';
    }
  });
}

/* ===== SHORTCUTS PANEL ===== */
function toggleShortcutsPanel() {
  let panel = document.getElementById('shortcuts-panel');
  if (panel) {
    panel.classList.toggle('hidden');
    return;
  }
  panel = document.createElement('div');
  panel.id = 'shortcuts-panel';
  panel.className = 'shortcuts-panel';
  panel.innerHTML = `
    <div class="shortcuts-header">Klávesové zkratky
      <button class="shortcuts-close" id="shortcuts-close-btn">&times;</button>
    </div>
    <div class="shortcuts-grid">
      <kbd>J / K</kbd><span>Navigace v kartách</span>
      <kbd>Enter</kbd><span>Otevřít kartu</span>
      <kbd>R</kbd><span>Náhodná karta</span>
      <kbd>/</kbd><span>Vyhledávání</span>
      <kbd>Esc</kbd><span>Zavřít overlay</span>
      <kbd>H</kbd><span>Hodnotit (v overlay)</span>
      <kbd>?</kbd><span>Tato nápověda</span>
    </div>`;
  document.body.appendChild(panel);
  panel.querySelector('#shortcuts-close-btn').addEventListener('click', () => panel.classList.add('hidden'));
  document.addEventListener('click', function onOutside(e) {
    if (!panel.contains(e.target) && e.target.id !== 'btn-shortcuts') {
      panel.classList.add('hidden');
      document.removeEventListener('click', onOutside);
    }
  });
}

/* ===== CHAT ===== */
const chatState = {
  messages: [],    // {role, content} for API
  streaming: false,
  initialized: false,
};

function chatGetToken() {
  try { return JSON.parse(localStorage.getItem('mtf_auth') || '{}').token || ''; } catch { return ''; }
}

function chatSaveHistory() {
  try {
    const trimmed = chatState.messages.slice(-20);
    localStorage.setItem('mtf_chat', JSON.stringify(trimmed));
  } catch {}
}

function chatLoadHistory() {
  try {
    const raw = localStorage.getItem('mtf_chat');
    if (raw) chatState.messages = JSON.parse(raw).filter(m => m.role && m.content) || [];
  } catch { chatState.messages = []; }
}

function chatClearHistory() {
  chatState.messages = [];
  localStorage.removeItem('mtf_chat');
  const container = $('chat-messages');
  if (container) container.innerHTML = '';
}

function chatRenderBubble(role, text, citations) {
  const container = $('chat-messages');
  if (!container) return null;
  const wrap = document.createElement('div');
  wrap.className = `chat-bubble chat-bubble-${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble-text';
  if (role === 'assistant') {
    bubble.innerHTML = bodyToHTML(text);
  } else {
    bubble.innerHTML = `<p>${esc(text)}</p>`;
  }
  wrap.appendChild(bubble);
  if (citations && citations.length) {
    const chips = document.createElement('div');
    chips.className = 'chat-citations';
    citations.forEach(id => {
      const btn = document.createElement('button');
      btn.className = 'chat-citation-chip';
      btn.dataset.cardId = id;
      btn.textContent = id;
      btn.addEventListener('click', () => openCitedCard(id));
      chips.appendChild(btn);
      // Try to resolve title after cache is populated
      (async () => {
        const date = id.slice(0, 10);
        if (!state.archiveCache[date]) {
          try { state.archiveCache[date] = await fetchJSON(`/data/archive/${date}.json`); } catch {}
        }
        const card = findCard(id);
        if (card && btn.isConnected) btn.textContent = card.title || id;
      })();
    });
    wrap.appendChild(chips);
  }
  container.appendChild(wrap);
  container.scrollTop = container.scrollHeight;
  return bubble;
}

async function openCitedCard(id) {
  const date = id.slice(0, 10);
  if (!state.archiveCache[date]) {
    try { state.archiveCache[date] = await fetchJSON(`/data/archive/${date}.json`); } catch {}
  }
  openCard(id);
}

async function chatSend(text) {
  if (chatState.streaming || !text.trim()) return;
  chatState.streaming = true;
  const sendBtn = $('chat-send');
  const input = $('chat-input');
  if (sendBtn) sendBtn.disabled = true;
  if (input) { input.value = ''; input.style.height = ''; }

  chatRenderBubble('user', text);
  chatState.messages.push({ role: 'user', content: text });

  // Render assistant bubble (streaming)
  const container = $('chat-messages');
  const wrap = document.createElement('div');
  wrap.className = 'chat-bubble chat-bubble-assistant';
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble-text chat-bubble-streaming';
  bubble.innerHTML = '<span class="chat-cursor"></span>';
  wrap.appendChild(bubble);
  if (container) container.appendChild(wrap);

  let rawBuffer = '';
  const HOLD_BACK = 40;

  try {
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mtf-token': chatGetToken(),
      },
      body: JSON.stringify({ messages: chatState.messages }),
    });

    if (!resp.ok) {
      if (resp.status === 401) {
        localStorage.removeItem('mtf_auth');
        location.reload();
        return;
      }
      bubble.innerHTML = `<p class="chat-error">Nepodařilo se odpovědět. Zkuste to znovu.</p>`;
      chatState.streaming = false;
      if (sendBtn) sendBtn.disabled = false;
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      sseBuffer += decoder.decode(value, { stream: true });
      const parts = sseBuffer.split('\n\n');
      sseBuffer = parts.pop() ?? '';

      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith('data: ')) continue;
        let ev;
        try { ev = JSON.parse(line.slice(6)); } catch { continue; }

        if (ev.type === 'text') {
          rawBuffer += ev.delta;
          // flush all but the last HOLD_BACK chars to avoid half-rendered citation marker
          const safeLen = Math.max(0, rawBuffer.length - HOLD_BACK);
          const safeText = rawBuffer.slice(0, safeLen);
          bubble.innerHTML = bodyToHTML(safeText) + '<span class="chat-cursor"></span>';
          if (container) container.scrollTop = container.scrollHeight;

        } else if (ev.type === 'done') {
          // Parse and strip citation marker from tail
          const citationRe = /\[\[CARDS:\s*([^\]]*)\]\]\s*$/;
          const match = rawBuffer.match(citationRe);
          let citations = [];
          let visibleText = rawBuffer;
          if (match) {
            visibleText = rawBuffer.slice(0, match.index).trimEnd();
            citations = match[1].split(',').map(s => s.trim()).filter(s => /^\d{4}-\d{2}-\d{2}-\d{2,3}$/.test(s));
            // Dedupe
            citations = [...new Set(citations)];
          }
          bubble.classList.remove('chat-bubble-streaming');
          bubble.innerHTML = bodyToHTML(visibleText);

          chatState.messages.push({ role: 'assistant', content: visibleText });
          chatSaveHistory();

          if (citations.length) {
            const chips = document.createElement('div');
            chips.className = 'chat-citations';
            citations.forEach(id => {
              const btn = document.createElement('button');
              btn.className = 'chat-citation-chip';
              btn.dataset.cardId = id;
              btn.textContent = id;
              btn.addEventListener('click', () => openCitedCard(id));
              chips.appendChild(btn);
              (async () => {
                const date = id.slice(0, 10);
                if (!state.archiveCache[date]) {
                  try { state.archiveCache[date] = await fetchJSON(`/data/archive/${date}.json`); } catch {}
                }
                const card = findCard(id);
                if (card && btn.isConnected) btn.textContent = card.title || id;
              })();
            });
            wrap.appendChild(chips);
          }
          if (container) container.scrollTop = container.scrollHeight;

        } else if (ev.type === 'error') {
          bubble.classList.remove('chat-bubble-streaming');
          bubble.innerHTML = '<p class="chat-error">Nastala chyba. Zkuste to znovu.</p>';
        }
      }
    }

  } catch {
    bubble.classList.remove('chat-bubble-streaming');
    bubble.innerHTML = '<p class="chat-error">Nepodařilo se připojit. Zkuste to znovu.</p>';
  }

  chatState.streaming = false;
  if (sendBtn) sendBtn.disabled = false;
}

function initChat() {
  const container = $('chat-messages');
  const input = $('chat-input');
  const sendBtn = $('chat-send');
  if (!container || !input || !sendBtn) return;

  // Load history and wire events only once
  if (!chatState.initialized) {
    chatLoadHistory();
    chatState.initialized = true;

    // Render saved history
    chatState.messages.forEach(m => chatRenderBubble(m.role, m.content));

    // Show clear button if history exists
    if (chatState.messages.length) {
      const clearBtn = document.createElement('button');
      clearBtn.className = 'chat-clear-btn';
      clearBtn.textContent = 'Smazat konverzaci';
      clearBtn.addEventListener('click', () => { chatClearHistory(); clearBtn.remove(); });
      container.insertBefore(clearBtn, container.firstChild);
    }

    // Auto-resize textarea
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });

    // Enter = send, Shift+Enter = newline
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const text = input.value.trim();
        if (text) chatSend(text);
      }
    });

    sendBtn.addEventListener('click', () => {
      const text = input.value.trim();
      if (text) chatSend(text);
    });
  }

  input.focus();
}

/* ===== INIT ===== */
function init() {
  // Defensive: ensure overlay is hidden on every page load (handles bfcache and edge cases)
  $('card-overlay')?.classList.add('hidden');
  state.activeCard = null;

  initGate();
  trackSession();
  applyTheme(document.documentElement.getAttribute('data-theme') || localStorage.getItem('theme') || 'light');
  document.getElementById('btn-theme').addEventListener('click', toggleTheme);
  $('btn-random')?.addEventListener('click', openRandomCard);
  document.querySelector('.site-title')?.addEventListener('click', () => {
    switchView('today');
    history.pushState({}, '', '#');
  });

  registerSW().then(() => initPushBtn());
  loadVoteMap().then(() => rerenderCurrentView());
  initAutoRefresh();
  initPullToRefresh();
  initSwipeToClose();

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
  $('overlay-prev').addEventListener('click', () => navigateOverlay(-1));
  $('overlay-next').addEventListener('click', () => navigateOverlay(1));
  $('btn-share').addEventListener('click', shareCard);

  $('overlay-title').addEventListener('click', () => {
    const el = $('overlay-title');
    if (el.classList.contains('clampable') || el.classList.contains('expanded')) {
      el.classList.toggle('expanded');
    }
  });

  $('overlay-date-label').addEventListener('click', () => {
    const dateStr = $('overlay-date-label').dataset.date;
    if (!dateStr) return;
    closeCard();
    state.archiveCards = [];
    state.archivePreset = 'custom';
    state.archiveFrom = dateStr;
    state.archiveTo = dateStr;
    history.replaceState({}, '', '#archive/' + dateStr + '/' + dateStr);
    switchView('archive');
  });

  // Swipe left/right v overlay pro navigaci mezi kartami
  const overlayBody = $('overlay-body');
  let _swipeStartX = 0, _swipeStartY = 0, _swipeTracking = false;
  overlayBody.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    _swipeStartX = e.touches[0].clientX;
    _swipeStartY = e.touches[0].clientY;
    _swipeTracking = true;
  }, { passive: true });
  overlayBody.addEventListener('touchmove', e => {
    if (!_swipeTracking || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - _swipeStartX;
    const dy = e.touches[0].clientY - _swipeStartY;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
      e.preventDefault(); // potlač vertikální scroll jen při jasně horizontálním pohybu
    }
  }, { passive: false });
  overlayBody.addEventListener('touchend', e => {
    if (!_swipeTracking) return;
    _swipeTracking = false;
    const dx = e.changedTouches[0].clientX - _swipeStartX;
    const dy = e.changedTouches[0].clientY - _swipeStartY;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    navigateOverlay(dx < 0 ? 1 : -1);
  }, { passive: true });

  document.getElementById('btn-mark-unread')?.addEventListener('click', () => {
    if (state.activeCard) {
      markUnread(state.activeCard.id);
      showToast('Označeno jako nepřečtené');
      closeCard();
    }
  });

  $('btn-show-transcript').addEventListener('click', () => {
    const btn = $('btn-show-transcript');
    const dateStr = btn.dataset.date;
    const sourceGroup = btn.dataset.sourceGroup || '';
    const sourceMsgTimes = JSON.parse(btn.dataset.sourceMsgTimes || '[]');
    closeCard();
    showTranscript(dateStr, sourceGroup, sourceMsgTimes);
  });

  $('btn-transcript-back').addEventListener('click', () => {
    const target = _preTranscriptHash || '#';
    _preTranscriptHash = '';
    history.replaceState({}, '', target);
    handleHash();
  });

  $('search-input').addEventListener('input', e => {
    const val = e.target.value;
    $('search-clear').classList.toggle('hidden', val.length === 0);
    runSearch(val);
    trackSearch(val);
  });

  $('search-clear').addEventListener('click', () => {
    const inp = $('search-input');
    inp.value = '';
    inp.focus();
    $('search-clear').classList.add('hidden');
    runSearch('');
  });

  document.addEventListener('keydown', e => {
    const inInput = e.target.matches('input, textarea, [contenteditable]');
    const overlayOpen = !$('card-overlay').classList.contains('hidden');

    if (e.key === 'Escape') {
      if (overlayOpen) { closeCard(); return; }
      if (state.view === 'transcript') { $('btn-transcript-back').click(); return; }
      const shortcutsPanel = document.getElementById('shortcuts-panel');
      if (shortcutsPanel && !shortcutsPanel.classList.contains('hidden')) { shortcutsPanel.classList.add('hidden'); return; }
      return;
    }
    if (overlayOpen) {
      if (e.key === 'Tab') {
        const sheet = document.querySelector('.overlay-sheet');
        const focusable = [...sheet.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
          if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
        return;
      }
      if (!inInput && (e.key === 'h' || e.key === 'H')) $('btn-vote')?.click();
      if (!inInput && e.key === 'j') { navigateOverlay(1); return; }
      if (!inInput && e.key === 'k') { navigateOverlay(-1); return; }
      return;
    }
    if (inInput) return;

    if (e.key === '/') { e.preventDefault(); document.querySelector('.nav-btn[data-view="search"]')?.click(); return; }
    if ((e.key === 'r' || e.key === 'R') && !e.metaKey && !e.ctrlKey) { openRandomCard(); return; }
    if (e.key === 'j') { navigateCards(1); return; }
    if (e.key === 'k') { navigateCards(-1); return; }
    if (e.key === '?') { e.preventDefault(); toggleShortcutsPanel(); return; }
  });

  window.addEventListener('popstate', () => {
    if (!$('card-overlay').classList.contains('hidden')) {
      closeCard();
    }
  });

  if (window.visualViewport) {
    const nav = document.querySelector('.bottom-nav');
    const onViewportResize = () => {
      if (!nav) return;
      const gap = window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop;
      nav.style.transform = gap > 50 ? `translateY(-${gap}px)` : '';
    };
    window.visualViewport.addEventListener('resize', onViewportResize);
    window.visualViewport.addEventListener('scroll', onViewportResize);
  }

  // bfcache: Safari restores page from memory on back/forward — close any open overlay
  window.addEventListener('pageshow', e => {
    if (e.persisted) {
      $('card-overlay')?.classList.add('hidden');
      state.activeCard = null;
      if (location.hash.startsWith('#card/')) history.replaceState({}, '', '#');
    }
  });

  handleHash();
  loadArchiveIndex();
}

document.addEventListener('DOMContentLoaded', init);
