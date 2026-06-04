/* ===== THEME ===== */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const isLight = theme === 'light';
  document.getElementById('icon-sun').classList.toggle('hidden', !isLight);
  document.getElementById('icon-moon').classList.toggle('hidden', isLight);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
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
  'Builder': 'level-builder',
  'Expert': 'level-expert',
};

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
  const levelClass = LEVEL_CLASSES[card.level] || '';
  const typeColor = TYPE_COLORS[card.type] || '#808080';
  const sourceDate = card.resurfaced_from || card.source_date || card.date || '';

  const resurfacedBadge = isResurfaced
    ? `<span class="resurfacing-badge">Z archivu · ${formatDateShort(sourceDate)}</span>`
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
        <span class="card-level ${levelClass}">${esc(card.level)}</span>
        <span class="card-type" style="color:${typeColor}">${esc(card.type)}</span>
        <span class="card-topic">${esc(card.topic)}</span>
      </div>
      <div class="card-title">${esc(card.title)}</div>
      <div class="card-excerpt">${esc(card.excerpt)}</div>
      <div class="card-footer">
        <span class="card-readmore">Číst dál ↓</span>
        <span class="card-time">${card.read_minutes || 2} min</span>
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
function buildTopicChips(cards, activeLevel) {
  // Zobraz jen témata dostupná v aktuálním levelu
  const filtered = activeLevel && activeLevel !== 'all'
    ? cards.filter(c => c.level === activeLevel)
    : cards;

  const topics = new Set();
  filtered.forEach(c => { if (c.topic) topics.add(c.topic); });

  // Reset topic filter pokud aktuální topic v novém levelu neexistuje
  if (state.topic !== 'all' && !topics.has(state.topic)) {
    state.topic = 'all';
  }

  const chips = $('topic-chips');
  chips.innerHTML = `<button class="chip${state.topic === 'all' ? ' active' : ''}" data-topic="all">Vše</button>`;
  topics.forEach(t => {
    chips.innerHTML += `<button class="chip${state.topic === t ? ' active' : ''}" data-topic="${esc(t)}">${esc(t)}</button>`;
  });
}

/* ===== FILTER ===== */
function filterCards(cards) {
  return cards.filter(c => {
    if (state.level !== 'all' && c.level !== state.level) return false;
    if (state.topic !== 'all' && c.topic !== state.topic) return false;
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
      show('empty-today');
    }
  } catch {
    hide('loading-today');
    show('empty-today');
  }
}

function updateHeader(data, isYesterday) {
  const dateStr = data.date || new Date().toISOString().slice(0, 10);
  const count = (data.cards || []).length;
  const hasResurfacing = !!data.resurfacing;
  const label = isYesterday ? 'Včera' : 'Dnes';

  $('header-date').textContent = (isYesterday ? 'Včera — ' : '') + formatDateLong(dateStr);

  const badge = $('live-badge');
  badge.classList.remove('hidden');
  $('live-count').textContent = `${label} ${count + (hasResurfacing ? 1 : 0)} poznatků`;

  const todayBtn = document.querySelector('.nav-btn[data-view="today"]');
  if (todayBtn) todayBtn.querySelector('span:last-child').textContent = label;
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
  const dates = (state.archiveIndex?.dates || []).slice().reverse();
  if (dates.length === 0) {
    $('archive-date-grid').innerHTML = '';
    return;
  }

  const byMonth = {};
  dates.forEach(entry => {
    const d = typeof entry === 'string' ? entry : entry.date;
    const [y, m] = d.split('-');
    const key = `${y}-${m}`;
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(d);
  });

  let html = '';
  Object.entries(byMonth).forEach(([key, days]) => {
    const [y, m] = key.split('-').map(Number);
    html += `<div class="archive-month-group">`;
    html += `<div class="archive-month-title">${MONTHS_CS[m - 1]} ${y}</div>`;
    html += `<div class="archive-days">`;
    days.forEach(d => {
      const [,, day] = d.split('-').map(Number);
      const active = d === state.archiveDate ? ' active' : '';
      html += `<button class="archive-day-btn${active}" data-date="${esc(d)}">${day}.</button>`;
    });
    html += `</div></div>`;
  });

  $('archive-date-grid').innerHTML = html;

  $('archive-date-grid').querySelectorAll('.archive-day-btn').forEach(btn => {
    btn.addEventListener('click', () => loadArchiveDay(btn.dataset.date));
  });
}

async function loadArchiveDay(dateStr) {
  state.archiveDate = dateStr;

  $('cards-archive').innerHTML = '';
  show('loading-archive');
  hide('empty-archive');

  document.querySelectorAll('.archive-day-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.date === dateStr);
  });

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

  const results = state.searchIndex.search(q);
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
    <span class="card-topic">${esc(card.topic)}</span>
  `;

  $('overlay-body').innerHTML = `
    <div class="overlay-title">${esc(card.title)}</div>
    <div class="overlay-text">${bodyToHTML(card.body || card.excerpt || '')}</div>
  `;

  const dateStr = card.source_date || card.resurfaced_from || card.date || '';
  $('btn-show-transcript').dataset.date = dateStr;
  $('btn-show-transcript').style.display = dateStr ? '' : 'none';

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
  ['today', 'archive', 'search', 'transcript'].forEach(v => {
    $(`view-${v}`).classList.toggle('hidden', v !== viewName);
  });

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  state.view = viewName;

  if (viewName === 'archive') {
    showArchive();
  } else if (viewName === 'search') {
    initSearch();
    setTimeout(() => $('search-input').focus(), 100);
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
  } else if (hash === 'search') {
    switchView('search');
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
  const currentCards = state.view === 'archive' && state.archiveDate
    ? (state.archiveCache[state.archiveDate]?.cards || [])
    : (state.today?.cards || []);
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
    const data = state.archiveCache[state.archiveDate];
    if (data) renderCards(data.cards || [], 'cards-archive');
  }
}

/* ===== INIT ===== */
function init() {
  applyTheme(document.documentElement.getAttribute('data-theme') || 'dark');
  document.getElementById('btn-theme').addEventListener('click', toggleTheme);

  $('header-date').textContent = formatDateLong(new Date().toISOString().slice(0, 10));

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
