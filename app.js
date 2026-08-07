/* ===== GATE ===== */
const VAPID_PUBLIC = 'BEZFl-_nPGP_1u49UExtRaDl9kc6A9fKzrvUaA-mJTCKx-_LpoaxVw1bkh4Wtf1MeabUVa2vJCnUkv-uCaK4sEs';

// Starší verze ukládala globální gate kód kvůli magic odkazům. Nové sdílení
// používá krátkodobý ticket, takže legacy credential při prvním startu smažeme.
try { localStorage.removeItem('mtf_code'); } catch {}

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

function getAuthToken() {
  try { return JSON.parse(localStorage.getItem('mtf_auth') || '{}').token || ''; }
  catch { return ''; }
}

// Datové soubory chrání HttpOnly cookie, protože je načítá i service worker
// a ten by vlastní hlavičku do requestu nepřidal. Kdo se přihlásil dřív, než
// cookie existovala, má token jen v localStorage — tohle mu ji doplní, aby
// nemusel znovu opisovat kód z WhatsAppu. Cookie je HttpOnly, takže se na ni
// JS nemůže zeptat; místo toho si jednou za relaci poznamenáme, že je hotovo.
async function ensureGateCookie() {
  if (!isAuthenticated()) return;
  try {
    if (sessionStorage.getItem('mtf_cookie_ok')) return;
  } catch { /* sessionStorage může být zakázané, pak se zeptáme pokaždé */ }
  try {
    const token = JSON.parse(localStorage.getItem('mtf_auth') || '{}').token || '';
    if (!token) return;
    const r = await fetch('/api/session', {
      method: 'POST',
      headers: { 'x-mtf-token': token },
    });
    if (r.ok) {
      try { sessionStorage.setItem('mtf_cookie_ok', '1'); } catch { /* neškodí */ }
    }
  } catch { /* offline — cookie z minula v prohlížeči zůstává */ }
}

// Sdílený odkaz nese krátkodobý serverem podepsaný ticket, nikdy globální
// GATE_CODE. Parametr se odstraní hned po přečtení, aby dál necestoval historií
// ani referrerem.
function readShareTicket() {
  try {
    const params = new URLSearchParams(location.search);
    const ticket = params.get('s');
    if (!ticket) return null;
    params.delete('s');
    const qs = params.toString();
    history.replaceState(history.state, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
    return /^[0-9A-Za-z._-]{1,180}$/.test(ticket) ? ticket : null;
  } catch { return null; }
}

async function tryShareUnlock(ticket) {
  try {
    const res = await fetch('/api/share-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket }),
    });
    if (!res.ok) return false;
    const { token, expires } = await res.json();
    storeAuth(token, expires);
    document.documentElement.classList.add('auth-ok');
    trackEvent('gate_passed', { method: 'share' });
    trackSession();
    return true;
  } catch { return false; }
}

function initGate() {
  if (isAuthenticated()) return;

  const gate = document.getElementById('gate');
  gate.classList.remove('hidden');
  trackEvent('gate_shown', {});

  // Kdo přišel deep linkem na kartu, vidí nad formulářem, co ho za bránou
  // čeká — zeď s kódem bez kontextu byla hlavní ztrátové místo funnelu.
  (async () => {
    const m = location.hash.match(/^#card\/((\d{4}-\d{2}-\d{2})-\d{2})$/);
    if (!m) return;
    try {
      // Jen titulek a úryvek. Dřív se kvůli tomu stahoval celý archivní soubor
      // dne, tedy i těla karet a přepisy diskuzí, a to nepřihlášenému člověku.
      const card = await fetchJSON(`/api/card-meta?id=${encodeURIComponent(m[1])}`);
      if (card && card.title) {
        const teaser = document.getElementById('gate-card-teaser');
        teaser.textContent = 'Za bránou na vás čeká: „' + card.title + '“';
        teaser.classList.remove('hidden');
      }
    } catch {}
  })();

  const input = document.getElementById('gate-input');
  const btn = document.getElementById('gate-submit');
  const err = document.getElementById('gate-error');

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
        document.documentElement.classList.add('auth-ok');
        gate.classList.add('hidden');
        input.value = '';
        trackEvent('gate_passed', { method: 'code' });
        trackSession();
        // Data se do téhle chvíle nenačetla, protože bez přihlášení vrací 403.
        // Bez tohohle by po zadání kódu zůstal portál prázdný až do reloadu.
        handleHash();
        loadArchiveIndex();
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

  // Listenery jen jednou — initGate se může zavolat znovu při vypršení tokenu.
  if (!btn.dataset.bound) {
    btn.dataset.bound = '1';
    input.addEventListener('input', () => { err.textContent = ''; });
    btn.addEventListener('click', tryUnlock);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') tryUnlock(); });
  }
  input.focus();
}

// Server odmítl přístupový token (401) — vyprší jen na serveru (rotace kódu,
// expirace nonce v KV), zatímco klientská brána věří starému localStorage.
// Token zahodíme a vrátíme bránu, ať si uživatel obnoví přístup novým kódem.
function handleAuthExpired() {
  try { localStorage.removeItem('mtf_auth'); } catch {}
  // auth-ok na <html> drží bránu skrytou (load-time guard) — bez jeho odebrání
  // by se brána nezobrazila ani po odebrání třídy hidden.
  document.documentElement.classList.remove('auth-ok');
  if (!document.getElementById('card-overlay').classList.contains('hidden')) closeCard();
  initGate();
  showToast('Přístup vypršel, zadejte prosím kód znovu');
}

/* ===== THEME ===== */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const isLight = theme === 'light';
  document.getElementById('icon-sun').classList.toggle('hidden', !isLight);
  document.getElementById('icon-moon').classList.toggle('hidden', isLight);
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.setAttribute('content', isLight ? '#faf6f2' : '#0f0f0f');
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
  events: null,
  eventsLoaded: false,
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
  // Výběr „Co jste možná minuli“. Losuje se jednou na načtení dat, ne při
  // každém překreslení — jinak by karty skákaly po každém hlasu i po
  // návratu do panelu.
  quietPicks: null,
  statsMonth: null,
  statsMsgCountByDate: null,
  voteMap: {},
  cardStats: {},
  topCards: [],
  transcriptDate: null,
  searchQuery: '',
  glossary: null,
  glossaryLoaded: false,
  glossQuery: '',
  glossCat: 'all',
};

let _lastKnownDigestDate = null;
let _preCardHash = '';
let _preTranscriptHash = '';
let _preEventHash = '';
let _preTermHash = '';
let _preTermState = null;

// Dočasně skryté tlačítko „Přepis" v detailu karty. Obnovit = true.
const TRANSCRIPT_BTN_ENABLED = true;

/* ===== VOTES ===== */
async function loadVoteMap() {
  // Nezávisle — selhání jednoho endpointu nesmí shodit druhý
  const loadTop = fetch('/api/top')
    .then(r => r.ok ? r.json() : [])
    .then(top => { if (Array.isArray(top)) top.forEach(({ id, count }) => { state.voteMap[id] = count; }); })
    .catch(() => {});
  // Globální počet čtení pro všechny karty — stejný na každém zařízení
  const loadReads = fetch('/api/reads')
    .then(r => r.ok ? r.json() : {})
    .then(reads => {
      if (reads && typeof reads === 'object') {
        for (const [id, n] of Object.entries(reads)) {
          // Merge: drž vyšší z lokálu a serveru, ať optimistic +1 z čerstvého
          // přečtení nebliká dolů, než ho server agregát dožene.
          const cur = state.cardStats[id]?.reads || 0;
          state.cardStats[id] = { reads: Math.max(n, cur) };
        }
      }
    })
    .catch(() => {});
  await Promise.allSettled([loadTop, loadReads]);
}

/* ===== ANALYTICS ===== */
function trackEvent(event, data) {
  const now = new Date();
  const enriched = { ...data, hour_utc: now.getUTCHours(), date: now.toISOString().slice(0, 10) };
  const headers = { 'Content-Type': 'application/json' };
  const token = getAuthToken();
  if (token) headers['x-mtf-token'] = token;
  fetch('/api/track', {
    method: 'POST',
    headers,
    body: JSON.stringify({ event, data: enriched }),
    keepalive: true,
  }).catch(() => {});
}

let searchTrackTimer = null;
let _lastSearchResultCount = -1;
let _pendingSearch = null;
let _sentSearch = '';

// Hledání se hlásí až na konci epizody, ne během psaní. Dřív se posílalo
// dvě vteřiny po druhém znaku, takže kdo psal se zaváháním, uložil do
// statistik tři „dotazy" místo jednoho — reálně tam leželo „cla", „claud"
// i „claude" jako tři různá hledání a přebila veškerá skutečná data.
function trackSearch(query) {
  const q = query.trim();
  clearTimeout(searchTrackTimer);
  _pendingSearch = q.length >= 2 ? { query: q, count: _lastSearchResultCount } : null;
  // Pojistka pro toho, kdo dotaz napíše a zůstane na výsledcích koukat.
  if (_pendingSearch) searchTrackTimer = setTimeout(flushSearch, 8000);
}

function flushSearch() {
  clearTimeout(searchTrackTimer);
  const p = _pendingSearch;
  _pendingSearch = null;
  if (!p || p.query === _sentSearch) return;
  _sentSearch = p.query;
  trackEvent('search', { query: p.query, result_count: p.count });
}

// Atribuce zdroje: /?src=digest v odkazu z WhatsAppu řekne, odkud návštěva
// přišla. Parametr se po přečtení odstraní z adresy, ať se nešíří dál sdílením.
let _visitSrc = null;
function readVisitSource() {
  try {
    const params = new URLSearchParams(location.search);
    const src = params.get('src');
    if (src && /^[a-z0-9_-]{1,24}$/i.test(src)) {
      _visitSrc = src.toLowerCase();
      params.delete('src');
      const qs = params.toString();
      history.replaceState(history.state, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
    }
  } catch {}
}

// session_visit se posílá 1× denně na zařízení, takže „sessions" v insights
// odpovídá denním unikátním zařízením. Posíláme jen is_new, odstup od minulé
// návštěvy a zdroj — žádné ID, žádné PII.
function trackSession() {
  const today = new Date().toISOString().slice(0, 10);
  const prev = localStorage.getItem('mtf_last_visit');
  if (prev !== today) {
    localStorage.setItem('mtf_last_visit', today);
    // Čítač návštěvních dní řídí push primer (ukázat až od 2. dne).
    try {
      const days = parseInt(localStorage.getItem('mtf_visit_days') || '0', 10);
      localStorage.setItem('mtf_visit_days', String(days + 1));
    } catch {}
    let isNew = false;
    try {
      if (!localStorage.getItem('mtf_visitor')) {
        localStorage.setItem('mtf_visitor', crypto.randomUUID());
        isNew = !prev; // UUID chybělo a zároveň žádná dřívější návštěva
      }
    } catch {}
    let daysSince = null;
    if (prev) {
      const diff = Math.round((new Date(today) - new Date(prev)) / 86400000);
      if (diff > 0 && diff < 400) daysSince = diff;
    }
    trackEvent('session_visit', {
      is_new: isNew,
      days_since_last: daysSince,
      src: _visitSrc,
    });
  }
}

/* ===== TOPIC COLORS ===== */
// Brand: jen šedá + oranžová pro INSIGHT. Tailwind paleta (blue/emerald/
// violet/amber) působila jako generický AI web (audit 2026-07-17).
const TYPE_COLORS = {
  'INSIGHT': 'var(--accent)',
  'NÁSTROJE': 'var(--text-secondary)',
  'UKÁZKA': 'var(--text-secondary)',
  'TIP': 'var(--text-secondary)',
  'OTEVŘENÁ OTÁZKA': 'var(--text-secondary)',
  'TÉMA TÝDNE': 'var(--text-secondary)',
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

/* ===== OBRÁZKY (galerie + lightbox) ===== */
const MEDIA_BASE = '/data/media/';
function mediaUrl(file) { return MEDIA_BASE + encodeURIComponent(file); }

// Registr galerií pro aktuálně vykreslený pohled. Každá galerie dostane index;
// náhledy na něj odkazují přes data-gallery, delegovaný klik otevře lightbox.
let _galleries = [];
function resetGalleries() { _galleries = []; }
function _validImages(images) {
  return Array.isArray(images)
    ? images.filter(im => im && typeof im.file === 'string' && /^[\w.-]+\.(jpg|jpeg|png|webp)$/i.test(im.file))
    : [];
}
function renderImages(images) {
  const imgs = _validImages(images);
  if (!imgs.length) return '';
  const gid = _galleries.length;
  _galleries.push(imgs);
  const thumbs = imgs.map((im, i) =>
    `<button class="media-thumb" type="button" data-gallery="${gid}" data-index="${i}" aria-label="Zvětšit obrázek">
       <img src="${esc(mediaUrl(im.file))}" alt="${esc(im.desc || '')}" loading="lazy" decoding="async">
     </button>`).join('');
  return `<div class="media-gallery${imgs.length === 1 ? ' single' : ''}">${thumbs}</div>`;
}

// Lightbox
let _lb = { items: [], index: 0 };
function openLightbox(items, index) {
  if (!items || !items.length) return;
  _lb.items = items;
  _lb.index = Math.max(0, Math.min(index || 0, items.length - 1));
  renderLightbox();
  $('lightbox').classList.remove('hidden');
  document.body.classList.add('lightbox-open');
}
function closeLightbox() {
  $('lightbox').classList.add('hidden');
  document.body.classList.remove('lightbox-open');
  const img = $('lightbox-img');
  if (img) img.src = '';
}
function lbGo(delta) {
  const n = _lb.items.length;
  if (n < 2) return;
  _lb.index = (_lb.index + delta + n) % n;
  renderLightbox();
}
function renderLightbox() {
  const it = _lb.items[_lb.index];
  if (!it) return;
  const img = $('lightbox-img');
  img.src = mediaUrl(it.file);
  img.alt = it.desc || '';
  $('lightbox-caption').textContent = it.desc || '';
  const n = _lb.items.length;
  $('lightbox-counter').textContent = n > 1 ? `${_lb.index + 1} / ${n}` : '';
  $('lightbox-prev').style.display = n > 1 ? '' : 'none';
  $('lightbox-next').style.display = n > 1 ? '' : 'none';
}

function initLightbox() {
  // Delegovaný klik na náhledy kdekoli v dokumentu
  document.addEventListener('click', e => {
    const thumb = e.target.closest('.media-thumb');
    if (!thumb) return;
    const gid = Number(thumb.dataset.gallery);
    const idx = Number(thumb.dataset.index);
    const gallery = _galleries[gid];
    if (gallery) openLightbox(gallery, idx);
  });

  $('lightbox-close').addEventListener('click', closeLightbox);
  $('lightbox-prev').addEventListener('click', () => lbGo(-1));
  $('lightbox-next').addEventListener('click', () => lbGo(1));
  // Klik na pozadí (mimo obrázek a ovládací tlačítka) zavře
  $('lightbox').addEventListener('click', e => {
    if (e.target.tagName === 'IMG') return;
    if (e.target.closest('.lightbox-nav') || e.target.closest('.lightbox-close')) return;
    closeLightbox();
  });

  // Swipe mezi obrázky na dotyku
  const stage = $('lightbox').querySelector('.lightbox-stage');
  let sx = 0, sy = 0, tracking = false;
  stage.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) { tracking = false; return; }
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; tracking = true;
  }, { passive: true });
  stage.addEventListener('touchend', e => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      lbGo(dx < 0 ? 1 : -1);
    } else if (Math.abs(dy) > 80 && Math.abs(dy) > Math.abs(dx)) {
      closeLightbox();  // swipe nahoru/dolů zavře
    }
  }, { passive: true });
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
          <span class="card-readmore${isRead(card.id) ? ' is-read' : ''}">${isRead(card.id) ? 'Přečteno ✓' : 'Číst dál ↓'}</span>
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
// Karty se záměrně neřadí podle srdíček: hlasy se načítají asynchronně, takže
// řazení podle nich přeskládávalo karty pod rukama. Popularita má vlastní
// view „Top", tady drží pořadí z pipeline (kurátorské) / podle data.
function renderCards(cards, containerId, resurfaced = null) {
  const container = $(containerId);
  const filtered = filterCards(cards);

  let html = '';

  if (filtered.length === 0 && !resurfaced) {
    let msg;
    if (state.topic && state.topic !== 'all') {
      msg = 'Žádné poznatky pro toto téma. Zkuste filtr „Vše“.';
    } else if (containerId === 'cards-today') {
      msg = 'Ze včerejška nejsou žádné poznatky.';
    } else {
      msg = 'Žádné poznatky.';
    }
    container.innerHTML = `<div class="empty-state"><p>${msg}</p></div>`;
    return;
  }

  html += filtered.map(c => renderCardEl(c)).join('');

  if (resurfaced && (state.topic === 'all' || getTopics(resurfaced).includes(state.topic))) {
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
    // Nový výběr „Co jste možná minuli“ jen když dorazil jiný den. Obnovení
    // téhož digestu (auto-refresh, stažení dolů) nemá karty přeházet.
    if (state.today?.date !== data.date) state.quietPicks = null;
    state.today = data;
    _lastKnownDigestDate = data.date;
    state.archiveCache[data.date] = data;
    const actualToday = new Date().toISOString().slice(0, 10);
    const isYesterdayData = data.date !== actualToday;
    $('cards-today').innerHTML = '';
    updateHeader(data, isYesterdayData);
    renderDateline(data);
    buildTopicChips(data.cards || []);

    // Resurfacing karta se denně generuje v pipeline — zobrazit ji, i když
    // dřív obě render místa předávala null a sekce „Z archivu" byla mrtvá.
    if ((data.cards || []).length > 0) {
      renderCards(data.cards, 'cards-today', data.resurfacing || null);
    } else {
      // Klidný den (0 karet, ~12 % dní): místo mrtvého konce výběr z archivu.
      renderQuietDay(data);
    }
    updatePageTitle();
    renderEventTeaser();
    ensureSearchAll().catch(() => {});
  } catch {
    $('cards-today').innerHTML = '';
    _setNavLabel('Včera');
    // Odlišit výpadek připojení od „digest nevyšel" — jiná příčina, jiná rada.
    const emptyP = $('empty-today') && $('empty-today').querySelector('p');
    if (emptyP) {
      emptyP.innerHTML = navigator.onLine
        ? 'Včerejší digest zatím nevyšel. Generuje se v 5:15.'
        : 'Jste offline. Digest se načte, jakmile budete zase připojeni.';
    }
    show('empty-today');
  }
}

// Tři nepřečtené kousky z archivu staršího 14 dnů. Náhodně, ať se klidné dny
// neokoukají, ale jen jednou za digest — výsledek drží state.quietPicks.
async function pickQuietCards(data) {
  await ensureSearchAll();
  const cutoff = Date.now() - 14 * 86400000;
  const resId = data.resurfacing && data.resurfacing.id;
  const pool = state.searchAll.filter(c =>
    c.id !== resId &&
    !isRead(c.id) &&
    new Date(c.source_date || c.date || 0).getTime() < cutoff
  );
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3);
}

// Klidný den: 0 nových karet. Místo prázdné stránky resurfacing karta
// + pár nepřečtených kousků z archivu, ať klik z notifikace nikdy nekončí
// ve zdi. Fallback: prostý empty state.
async function renderQuietDay(data) {
  const container = $('cards-today');
  const note = '<div class="quiet-day-note">Klidný den, žádné nové diskuze. Mezitím pár poznatků, které možná unikly.</div>';
  let html = '';

  if (data.resurfacing && (state.topic === 'all' || getTopics(data.resurfacing).includes(state.topic))) {
    html += '<div class="section-header">Z\u00A0archivu</div>';
    html += renderCardEl(data.resurfacing, true);
  }

  try {
    // Losuje se jen jednou na digest. Příslib se uloží ještě před prvním
    // awaitem, takže dvě souběžná překreslení si nevylosují každé svoje.
    if (!state.quietPicks) state.quietPicks = pickQuietCards(data);
    // Filtr témat platí i tady, jinak by přepnutí tématu nechalo dole viset
    // karty, které do vybraného tématu nepatří.
    const picks = filterCards(await state.quietPicks);
    if (picks.length) {
      html += '<div class="section-header">Co jste možná minuli</div>';
      html += picks.map(c => renderCardEl(c)).join('');
    }
  } catch { /* archiv nedostupný — zůstane resurfacing / empty */ }

  if (!html) {
    container.innerHTML = '<div class="empty-state"><p>Ze\u00A0včerejška nejsou žádné poznatky.</p></div>';
    return;
  }
  container.innerHTML = note + html;
  attachCardListeners(container);
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

// Dateline nad digestem — deníkový charakter („Souhrn diskuzí ze čtvrtka
// 17. července · 5 poznatků · čtení na 8 minut"). České vazby dnů potřebují
// pevnou mapu (z pondělí / ze středy), genitiv měsíců už v MONTHS_CS je.
const DAY_GENITIVE_CS = ['z\u00A0neděle', 'z\u00A0pondělí', 'z\u00A0úterý', 'ze\u00A0středy',
  'ze\u00A0čtvrtka', 'z\u00A0pátku', 'ze\u00A0soboty'];

function renderDateline(data) {
  const el = $('digest-dateline');
  if (!el) return;
  const cards = data.cards || [];
  if (!data.date || cards.length === 0) { el.classList.add('hidden'); return; }
  const d = new Date(data.date + 'T12:00:00');
  if (isNaN(d.getTime())) { el.classList.add('hidden'); return; }
  const parts = [
    `Souhrn diskuzí ${DAY_GENITIVE_CS[d.getDay()]} ${d.getDate()}.\u00A0${MONTHS_CS[d.getMonth()]}`,
    `${cards.length}\u00A0${poznatek(cards.length)}`,
  ];
  const mins = cards.reduce((s, c) => s + (c.read_minutes || 0), 0);
  if (mins > 0) {
    const minWord = mins === 1 ? 'minutu' : (mins >= 2 && mins <= 4 ? 'minuty' : 'minut');
    parts.push(`čtení na\u00A0${mins}\u00A0${minWord}`);
  }
  el.textContent = parts.join(' · ');
  el.classList.remove('hidden');
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
// Normalizace pro hledání: lowercase + odstranění diakritiky (NFD strip).
// „nastroje" tak najde „nástroje" a naopak.
function searchNorm(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Jeden request místo ~110: agregovaný cards-index.json z pipeline (vždy plná
// regenerace kvůli PII scrubu). Fallback na per-file archiv, kdyby index
// chyběl nebo byl prázdný.
async function fetchAllCards() {
  try {
    const idx = await fetchJSON('/data/cards-index.json');
    if (Array.isArray(idx.cards) && idx.cards.length > 0) return idx.cards;
  } catch { /* fallback níže */ }
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
  return allCards;
}

async function initSearch() {
  if (state.searchIndex) return;
  show('loading-search');
  hide('search-hint');

  try {
    const allCards = await fetchAllCards();

    const seen = new Set();
    const deduped = allCards.filter(c => {
      if (!c.id || seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
    state.searchAll = deduped;
    // Index nad normalizovanými stínovými poli — diakritika nerozhoduje.
    // Karty mají pole `topics` (pole stringů), dřívější klíč `topic` byl mrtvý.
    const indexed = deduped.map(c => ({
      card: c,
      ntitle: searchNorm(c.title),
      nexcerpt: searchNorm(c.excerpt),
      nbody: searchNorm(c.body),
      ntopics: searchNorm(getTopics(c).join(' ')),
    }));
    state.searchIndex = new Fuse(indexed, {
      keys: [
        { name: 'ntitle', weight: 3 },
        { name: 'ntopics', weight: 2 },
        { name: 'nexcerpt', weight: 2 },
        { name: 'nbody', weight: 1 },
      ],
      threshold: 0.35,
      ignoreLocation: true,
      includeScore: true,
      minMatchCharLength: 2,
    });

    hide('loading-search');
    show('search-hint');

    // Dotaz rozepsaný během načítání indexu se dřív tiše zahodil — spusť ho teď.
    const pending = ($('search-input') && $('search-input').value.trim()) || state.searchQuery;
    if (pending && pending.length >= 2 && state.view === 'search') runSearch(pending);
  } catch {
    hide('loading-search');
    show('search-hint');
  }
}

// Mapa základní znak → všechny české varianty. Highlight tak označí „nástroje"
// i při dotazu „nastroje".
const DIACRITIC_VARIANTS = {
  a: 'aá', c: 'cč', d: 'dď', e: 'eéě', i: 'ií', n: 'nň', o: 'oó',
  r: 'rř', s: 'sš', t: 'tť', u: 'uúů', y: 'yý', z: 'zž',
};

function diacriticInsensitivePattern(term) {
  return term.split('').map(ch => {
    const base = searchNorm(ch);
    const variants = DIACRITIC_VARIANTS[base];
    if (variants) return '[' + variants + ']';
    return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('');
}

function highlightInHTML(html, query) {
  if (!query) return html;
  const terms = query.trim().split(/\s+/)
    .filter(t => t.length >= 2)
    .map(diacriticInsensitivePattern);
  if (!terms.length) return html;
  const re = new RegExp(`(?![^<]*>)(${terms.join('|')})`, 'gi');
  return html.replace(re, '<mark class="search-highlight">$1</mark>');
}

function runSearch(query) {
  const q = query.trim();
  state.searchQuery = q;
  renderSearchGloss(q);
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

  const nq = searchNorm(q);
  const fuseResults = state.searchIndex.search(nq);

  // Tokenový AND filtr nad normalizovanými poli: každé slovo dotazu musí být
  // podřetězcem karty. Řeší falešné pozitivy fuzzy hledání, ale nevypíná
  // diakritickou toleranci jako dřívější tvrdý substring na surových polích.
  const tokens = nq.split(/\s+/).filter(t => t.length >= 2);
  const haystack = r => r.item.ntitle + ' ' + r.item.nexcerpt + ' ' + r.item.nbody + ' ' + r.item.ntopics;
  let results = tokens.length
    ? fuseResults.filter(r => { const h = haystack(r); return tokens.every(t => h.includes(t)); })
    : fuseResults;

  // Fuzzy fallback: při nule přesných shod ukaž nejbližší výsledky Fuse,
  // ať překlep na mobilu není slepá ulička.
  let isFallback = false;
  if (results.length === 0 && fuseResults.length > 0) {
    isFallback = true;
    results = fuseResults.slice(0, 10);
  }

  buildTopicChips(results.map(r => r.item.card));

  // Topic filter
  if (state.topic !== 'all') {
    results = results.filter(r => getTopics(r.item.card).includes(state.topic));
  }

  _lastSearchResultCount = results.length;

  // Oznámit počet výsledků čtečkám obrazovky (vizuálně skrytý live region).
  const live = $('search-live');
  if (live) {
    const n = results.length;
    const word = n === 1 ? 'výsledek' : (n >= 2 && n <= 4 ? 'výsledky' : 'výsledků');
    live.textContent = n === 0 ? 'Žádné výsledky' : `${n} ${word}`;
  }

  if (results.length === 0) {
    show('empty-search');
    return;
  }

  // Řadit podle relevance (Fuse score, nižší = lepší), remíza podle data.
  // Dřívější řazení podle srdíček pohřbívalo přesné shody pod populární karty.
  const sorted = results.slice()
    .sort((a, b) => {
      const sDiff = (a.score ?? 0) - (b.score ?? 0);
      if (Math.abs(sDiff) > 0.001) return sDiff;
      const ca = a.item.card, cb = b.item.card;
      return (cb.source_date || cb.date || '').localeCompare(ca.source_date || ca.date || '');
    })
    .slice(0, 30)
    .map(r => r.item.card);

  const fallbackNote = isFallback
    ? '<div class="search-fallback-note">Přesnou shodu jsme nenašli. Tohle je nejbližší výsledek.</div>'
    : '';
  $('cards-search').innerHTML = fallbackNote + sorted.map(c => renderCardEl(c, false, isFallback ? '' : q)).join('');
  show('cards-search');
  attachCardListeners($('cards-search'));

  // Sdílitelné URL dotazu — na opakované otázky v Diskuzi jde odpovědět odkazem.
  if (state.view === 'search') {
    history.replaceState({}, '', '#search/' + encodeURIComponent(q));
  }
}

/* ===== CARD OVERLAY ===== */
function openCard(cardId) {
  const card = findCard(cardId);
  if (!card) return;

  const wasRead = isRead(cardId);
  markRead(cardId);
  applyReadStateDOM(cardId, true);

  // pushState (ne replaceState): karta dostane vlastní history entry, takže
  // hardwarové zpět na Androidu kartu zavře místo opuštění webu / rozjetí
  // view s adresou. U deep linku (hash už je #card/) se entry nepřidává.
  if (!location.hash.startsWith('#card/')) {
    _preCardHash = location.hash || '#';
    state.activeCard = card;
    history.pushState({ card: cardId, pushed: true }, '', `#card/${cardId}`);
  } else {
    state.activeCard = card;
    const pushed = !!(history.state && history.state.pushed);
    history.replaceState({ card: cardId, pushed }, '', `#card/${cardId}`);
  }

  const typeColor = TYPE_COLORS[card.type] || 'var(--text-tertiary)';

  $('overlay-meta').innerHTML = `
    <span class="card-type" style="color:${typeColor}">${esc(card.type)}</span>
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
  resetGalleries();
  $('overlay-text').innerHTML = bodyHtml + renderImages(card.images) + renderCardLinks(card)
    + renderCardTerms(card);
  // Slovníček se načítá líně — když ještě není, doplň výrazy až dorazí.
  if (!state.glossaryLoaded) {
    loadGlossary().then(() => {
      if (state.activeCard?.id === cardId) {
        const box = $('overlay-text');
        if (box && !box.querySelector('.card-terms')) box.insertAdjacentHTML('beforeend', renderCardTerms(card));
      }
    });
  }
  $('btn-show-transcript').dataset.date = dateStr;
  $('btn-show-transcript').dataset.sourceGroup = card.source_group || '';
  $('btn-show-transcript').dataset.sourceMsgTimes = JSON.stringify(card.source_msg_times || []);
  $('btn-show-transcript').style.display = (TRANSCRIPT_BTN_ENABLED && dateStr) ? '' : 'none';

  // Vote
  const voted = hasVoted(card.id);
  const voteBtn = $('btn-vote');
  voteBtn.classList.toggle('voted', voted);
  fetchVoteCount(card.id).then(c => { $('vote-count').textContent = c || ''; });
  voteBtn.onclick = async () => {
    if (hasVoted(card.id)) {
      const count = await removeVote(card.id);
      if (count === null) { showToast('Nepodařilo se odvolat hodnocení'); return; }
      $('vote-count').textContent = count || '';
      voteBtn.classList.remove('voted');
      state.voteMap[card.id] = count;
      showToast('Hodnocení odvoláno');
      rerenderCurrentView();
    } else {
      const count = await castVote(card.id);
      if (count === null) { showToast('Nepodařilo se uložit hodnocení'); return; }
      $('vote-count').textContent = count || '';
      voteBtn.classList.add('voted');
      state.voteMap[card.id] = count;
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
  // Otevření karty z výsledků je konec hledání, a to ten úspěšný.
  if (state.view === 'search') flushSearch();
  trackEvent('card_open', { id: cardId, topic: getTopics(card)[0] || null, card_type: card.type || null });
}

// UI část zavření karty — bez zásahu do history. Volá se z popstate (zpět)
// i z closeCard (křížek/Esc), aby obě cesty vedly identickým úklidem.
let _closingCard = false;
function closeCardUI() {
  _closingCard = false;
  if (state.activeCard && state.cardOpenedAt) {
    const duration_ms = Date.now() - state.cardOpenedAt;
    if (duration_ms >= 3000) {
      const readId = state.activeCard.id;
      trackEvent('card_read', { id: readId, duration_ms, topic: getTopics(state.activeCard)[0] || null });
      // Okamžitá odezva: připočti lokálně nad spolehlivý serverový základ
      // (z /api/reads). Při příštím načtení se sjednotí s globálním agregátem.
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
}

function closeCard() {
  if (_closingCard) return;
  // Karta s vlastní history entry (pushState v openCard): zkonzumuj ji přes
  // history.back(), úklid UI proběhne v popstate. Křížek a hardwarové zpět
  // tak vedou stejnou cestou a scroll pod overlayem zůstane netknutý.
  if (location.hash.startsWith('#card/') && history.state && history.state.pushed) {
    _closingCard = true;
    history.back();
    return;
  }
  closeCardUI();
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
    state.notFoundCards || [],
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
    resetGalleries();
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
        const msgText = msg.text ? `<div class="msg-text">${esc(msg.text)}</div>` : '';
        html += `
          <div class="transcript-message${isSource ? ' is-source' : ''}">
            <div class="msg-time">${esc(msg.time || '')}</div>
            <div class="msg-body">
              <div class="msg-author${isHost ? ' is-host' : ''}">${esc(msg.author)}</div>
              ${msgText}
              ${renderImages(msg.images)}
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

/* ===== EVENTS ===== */
const EVENT_TYPE_COLORS = {
  'SETKÁNÍ': '#f06a15',
  'WEBINÁŘ': '#3b82f6',
  'ŠKOLENÍ': '#8b5cf6',
  'SHOW-AND-TELL': '#10b981',
};

async function loadEvents() {
  if (state.eventsLoaded) return state.events;
  try {
    const data = await fetchJSON('/data/events.json');
    state.events = Array.isArray(data.events) ? data.events : [];
  } catch {
    state.events = [];
  }
  state.eventsLoaded = true;
  return state.events;
}

// Konec akce v lokálním čase: datum + time_to (nebo konec dne). Akce s časem
// nesmí zhasnout hned po půlnoci.
function eventEndTs(ev) {
  const t = (ev.time_to && /^\d{1,2}:\d{2}$/.test(ev.time_to)) ? ev.time_to : '23:59';
  const ts = new Date(`${ev.date}T${t}:00`).getTime();
  return isNaN(ts) ? 0 : ts;
}

function splitEvents(events) {
  const now = Date.now();
  const upcoming = [], past = [];
  for (const ev of events) {
    if (!ev || !ev.date) continue;
    (eventEndTs(ev) >= now ? upcoming : past).push(ev);
  }
  upcoming.sort((a, b) => a.date.localeCompare(b.date) || (a.time_from || '').localeCompare(b.time_from || ''));
  past.sort((a, b) => b.date.localeCompare(a.date) || (b.time_from || '').localeCompare(a.time_from || ''));
  return { upcoming, past };
}

function eventDateLabel(ev) {
  let s = formatDateLong(ev.date);
  if (ev.time_from) s += ` · ${ev.time_from}${ev.time_to ? '–' + ev.time_to : ''}`;
  return s;
}

function eventBadge(ev) {
  if (ev.status) return `<span class="event-badge event-badge-status">${esc(ev.status)}</span>`;
  if (ev.is_paid) return `<span class="event-badge event-badge-paid">${esc(ev.price || 'Placené')}</span>`;
  return `<span class="event-badge event-badge-free">Zdarma</span>`;
}

function renderEventCardEl(ev) {
  const color = EVENT_TYPE_COLORS[ev.type] || 'var(--text-tertiary)';
  const isUpcoming = eventEndTs(ev) >= Date.now();
  const registrationTarget = ev.registration_page_url || ev.registration_url;
  const registrationCta = isUpcoming && registrationTarget
    ? `<a class="event-card-register" href="${esc(registrationTarget)}"${registrationTarget.startsWith('/') ? '' : ' target="_blank" rel="noopener noreferrer nofollow"'}>Registrovat se <span aria-hidden="true">→</span></a>`
    : '';
  return `
    <div class="card event-card${registrationCta ? ' event-card--registerable' : ''}" data-event-id="${esc(ev.id)}" role="article" tabindex="0" aria-label="${esc(ev.title)}">
      <div class="card-meta">
        <div class="card-meta-left"><span class="card-type" style="color:${color}">${esc(ev.type || 'AKCE')}</span></div>
        ${eventBadge(ev)}
      </div>
      <div class="card-title">${esc(ev.title)}</div>
      ${ev.short ? `<div class="card-excerpt">${esc(ev.short)}</div>` : ''}
      <div class="card-footer">
        <span class="card-date">${esc(eventDateLabel(ev))}</span>
        ${ev.location ? `<span class="card-footer-right"><span class="card-date">${esc(ev.location)}</span></span>` : ''}
      </div>
      ${registrationCta}
    </div>`;
}

function attachEventCardListeners(container) {
  container.querySelectorAll('.event-card').forEach(el => {
    const open = () => showEvent(el.dataset.eventId);
    el.addEventListener('click', open);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
  container.querySelectorAll('.event-card-register').forEach(link => {
    link.addEventListener('click', event => event.stopPropagation());
  });
}

async function showEvents() {
  show('loading-events');
  await loadEvents();
  hide('loading-events');
  renderEvents();
}

function renderEvents() {
  const { upcoming, past } = splitEvents(state.events || []);
  const up = $('events-upcoming');
  up.innerHTML = upcoming.map(renderEventCardEl).join('');
  $('empty-events-upcoming').classList.toggle('hidden', upcoming.length > 0);
  attachEventCardListeners(up);

  const pastWrap = $('events-past-section');
  if (past.length) {
    $('events-past').innerHTML = past.map(renderEventCardEl).join('');
    attachEventCardListeners($('events-past'));
    pastWrap.classList.remove('hidden');
  } else {
    pastWrap.classList.add('hidden');
  }
}

function renderProgram(program) {
  if (!program) return '';
  if (Array.isArray(program)) {
    const items = program.map(p => {
      if (typeof p === 'string') return `<li>${esc(p)}</li>`;
      const time = p.time ? `<span class="event-prog-time">${esc(p.time)}</span> ` : '';
      return `<li>${time}${esc(p.label || '')}</li>`;
    }).join('');
    return `<div class="event-section"><h3>Program</h3><ul class="event-program">${items}</ul></div>`;
  }
  return `<div class="event-section"><h3>Program</h3><p>${esc(String(program)).replace(/\n/g, '<br>')}</p></div>`;
}

function eventCtaHtml(ev) {
  const isPast = eventEndTs(ev) < Date.now();
  const safe = u => (typeof u === 'string' && (/^https?:\/\//i.test(u) || /^\/(?!\/)/.test(u))) ? u : null;
  const reg = safe(ev.registration_url);
  const rec = safe(ev.recording_url);
  const detail = safe(ev.detail_url);
  const btns = [];
  let buyShown = false;
  if (!ev.status) {
    if (!isPast && reg) {
      btns.push(`<a class="event-cta event-cta-primary" href="${esc(reg)}" target="_blank" rel="noopener noreferrer nofollow">${ev.is_paid ? 'Koupit / rezervovat' : 'Registrovat se'}</a>`);
      buyShown = true;
    } else if (isPast && ev.is_paid && reg && !rec) {
      btns.push(`<a class="event-cta event-cta-primary" href="${esc(reg)}" target="_blank" rel="noopener noreferrer nofollow">Koupit záznam</a>`);
      buyShown = true;
    }
  }
  if (rec) btns.push(`<a class="event-cta event-cta-secondary" href="${esc(rec)}" target="_blank" rel="noopener noreferrer nofollow">Záznam</a>`);
  if (detail) {
    const attrs = detail.startsWith('/') ? '' : ' target="_blank" rel="noopener noreferrer nofollow"';
    btns.push(`<a class="event-cta event-cta-secondary" href="${esc(detail)}"${attrs}>Detail akce</a>`);
  }

  let html = '';
  if (buyShown && ev.discount_code) {
    html += `<div class="event-note">Slevový kód: <strong>${esc(ev.discount_code)}</strong> (zadejte ve Stripe)</div>`;
  }
  if (btns.length) html += `<div class="event-cta-row">${btns.join('')}</div>`;
  if (rec && ev.recording_password) {
    html += `<div class="event-note">Heslo k záznamu: <strong>${esc(ev.recording_password)}</strong></div>`;
  }
  return html;
}

// Detail akce se otevírá ve stejném sheet overlayi jako karty poznatků.
function showEvent(id) {
  const ev = (state.events || []).find(e => e.id === id);
  if (!ev) {
    if (!state.eventsLoaded) { loadEvents().then(() => showEvent(id)); return; }
    showToast('Akce nenalezena');
    return;
  }
  if (!location.hash.startsWith('#event/')) _preEventHash = location.hash || '#';
  history.replaceState({ event: id }, '', '#event/' + id);
  trackEvent('event_view', { id });
  const color = EVENT_TYPE_COLORS[ev.type] || 'var(--text-tertiary)';
  const meta = [eventDateLabel(ev), ev.location].filter(Boolean).map(esc).join(' · ');
  $('event-ov-meta').innerHTML = `<span class="card-type" style="color:${color}">${esc(ev.type || 'AKCE')}</span>${eventBadge(ev)}`;
  $('event-ov-content').innerHTML = `
    <h2 id="event-ov-title" class="event-detail-title">${esc(ev.title)}</h2>
    <div class="event-detail-meta">${meta}</div>
    ${ev.description ? `<p class="event-detail-desc">${esc(ev.description).replace(/\n/g, '<br>')}</p>` : ''}
    ${renderProgram(ev.program)}
    ${renderCardLinks(ev)}
    ${eventCtaHtml(ev)}`;
  $('event-overlay-body').scrollTop = 0;
  show('event-overlay');
}

function closeEvent() {
  if ($('event-overlay').classList.contains('hidden')) return;
  hide('event-overlay');
  const target = _preEventHash || '#events';
  _preEventHash = '';
  history.replaceState({}, '', target);
}

const TEASER_MAX_EVENTS = 3;

// Krátké datum do proužku („14. 8."). Rok se přidá, jen když akce nespadá do
// letošního roku — jinak by jen zabíral místo, které potřebuje název.
function eventDateShort(ev) {
  const d = new Date(ev.date + 'T00:00:00');
  if (isNaN(d.getTime())) return ev.date;
  const s = `${d.getDate()}. ${d.getMonth() + 1}.`;
  return d.getFullYear() === new Date().getFullYear() ? s : `${s} ${d.getFullYear()}`;
}

function eventTeaserTitle(ev) {
  if (ev.id === 'evt-2026-08-29-sraz') return 'Sraz v Praze';
  if (ev.id === 'evt-2026-08-14-sraz-olomouc') return 'Sraz v Olomouci';
  return ev.title;
}

function renderEventTeaserInto(el, evs, storageKey, label) {
  const key = evs.map(e => e.id).join('|');
    let dismissed = '';
  try { dismissed = localStorage.getItem(storageKey) || ''; } catch {}
  if (!evs.length || dismissed === key) { el.classList.add('hidden'); el.innerHTML = ''; return; }

  const rows = evs.map(ev => `
      <div class="event-teaser-row">
        <button class="event-teaser-open" type="button" data-event-id="${esc(ev.id)}" aria-label="Detail akce: ${esc(ev.title)}">
        <span class="event-teaser-when">
          <span class="event-teaser-day">${esc(eventDateShort(ev))}</span>
          ${ev.time_from ? `<span class="event-teaser-time">${esc(ev.time_from)}</span>` : ''}
        </span>
        <span class="event-teaser-title">${esc(eventTeaserTitle(ev))}</span>
        </button>
        ${(ev.registration_page_url || ev.registration_url) ? `<a class="event-teaser-register" href="${esc(ev.registration_page_url || ev.registration_url)}"${(ev.registration_page_url || ev.registration_url).startsWith('/') ? '' : ' target="_blank" rel="noopener noreferrer nofollow"'}>Registrace <span aria-hidden="true">→</span></a>` : ''}
    </div>`).join('');

  el.innerHTML = `
      <div class="event-teaser-head">
        <span class="event-teaser-label">${esc(label)}</span>
        <button class="event-teaser-close" type="button" aria-label="Skrýt akce" title="Skrýt">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="event-teaser-list">${rows}</div>`;
  el.classList.remove('hidden');
  el.querySelectorAll('.event-teaser-open').forEach(row => {
    row.addEventListener('click', () => showEvent(row.dataset.eventId));
  });
  el.querySelector('.event-teaser-close').addEventListener('click', () => {
    try { localStorage.setItem(storageKey, key); } catch {}
    el.classList.add('hidden');
    el.innerHTML = '';
  });
}

// Proužek s nejbližšími akcemi na úvodní obrazovce. Ukazuje až tři, méně když
// jich tolik není.
function renderEventTeaser() {
  const el = $('event-teaser');
  if (!el) return;
  loadEvents().then(() => {
    const { upcoming } = splitEvents(state.events || []);
    const evs = upcoming.filter(e => !e.status).slice(0, TEASER_MAX_EVENTS);
    renderEventTeaserInto(el, evs, 'mtf_teaser_dismissed', 'Nejbližší akce');
  }).catch(() => {});
}

function renderGlossaryEventTeaser() {
  const el = $('glossary-event-teaser');
  if (!el) return;
  loadEvents().then(() => {
    const { upcoming } = splitEvents(state.events || []);
    const meetups = upcoming.filter(e => (e.id === 'evt-2026-08-29-sraz' || e.id === 'evt-2026-08-14-sraz-olomouc') && !e.status);
    renderEventTeaserInto(el, meetups, 'mtf_glossary_teaser_dismissed', 'Srazy v komunitě');
  }).catch(() => {});
}

/* ===== SLOVNÍČEK =====
   Termíny, které v komunitě reálně padají, vysvětlené pro lidi bez zázemí.
   Data z data/glossary.json (generuje tools/build_glossary.py). */

// Pod tímhle počtem výskytů se číslo neukazuje (netvrdíme nic, co nemá váhu).
const GLOSS_BADGE_MIN = 5;

async function loadGlossary() {
  if (state.glossaryLoaded) return state.glossary;
  show('loading-glossary');
  try {
    const data = await fetchJSON('/data/glossary.json');
    state.glossary = data && Array.isArray(data.terms) ? data : { terms: [], categories: [] };
  } catch {
    state.glossary = { terms: [], categories: [] };
  } finally {
    state.glossaryLoaded = true;
    hide('loading-glossary');
  }
  return state.glossary;
}

function glossCatLabel(id) {
  const c = (state.glossary?.categories || []).find(x => x.id === id);
  return c ? c.label : id;
}

function glossFiltered() {
  const terms = state.glossary?.terms || [];
  const q = searchNorm(state.glossQuery.trim());
  const hits = terms.filter(t => {
    if (state.glossCat !== 'all' && t.category !== state.glossCat) return false;
    if (!q) return true;
    // `search` je předpočítané pole bez diakritiky (termín + popis + aliasy)
    return (t.search || '').includes(q) || searchNorm(t.term).includes(q);
  });
  // Nejčastější výrazy nahoru — to je to, co člověk ve skupině potká nejdřív.
  return hits.sort((a, b) => (b.mentions - a.mentions) || a.term.localeCompare(b.term, 'cs'));
}

function glossTermCardHtml(t) {
  // Pod prahem odznak neukazujeme — „1×“ nic neříká a působí to slabě.
  const badge = t.mentions >= GLOSS_BADGE_MIN
    ? `<span class="gloss-count" title="Kolikrát výraz padl v denních přepisech">${t.mentions}×</span>`
    : '';
  return `
    <button class="gloss-item" data-term="${esc(t.slug)}" type="button">
      <span class="gloss-item-head">
        <span class="gloss-item-term">${esc(t.term)}</span>
        ${badge}
      </span>
      <span class="gloss-item-short">${esc(t.short)}</span>
    </button>`;
}

function renderGlossaryCats() {
  const el = $('gloss-cats');
  if (!el) return;
  const terms = state.glossary?.terms || [];
  const cats = state.glossary?.categories || [];
  const counts = {};
  terms.forEach(t => { counts[t.category] = (counts[t.category] || 0) + 1; });
  const chip = (id, label, n) => `
    <button class="chip ${state.glossCat === id ? 'active' : ''}" data-cat="${esc(id)}" type="button" role="tab"
            aria-selected="${state.glossCat === id}">${esc(label)}<span class="chip-count">${n}</span></button>`;
  el.innerHTML = chip('all', 'Vše', terms.length)
    + cats.filter(c => counts[c.id]).map(c => chip(c.id, c.label, counts[c.id])).join('');
}

// Pro nováčka je 73 hesel bez ladu a skladu. Tohle je pořadí, ve kterém
// na sebe pojmy navazují, aby se z toho dalo něco naučit, ne jen dohledat.
const GLOSS_START_DISMISSED = 'mtf_gloss_start_dismissed';

function renderGlossaryStart() {
  const el = $('gloss-start');
  if (!el) return;
  // Cesta má smysl jen na nefiltrovaném seznamu, jinak plete.
  // Zavření je natrvalo. Na rozdíl od akcí, které se vracejí s každou novou,
  // je tohle uvítání — kdo ho jednou odklikne, ten už ho nepotřebuje.
  let dismissed = false;
  try { dismissed = localStorage.getItem(GLOSS_START_DISMISSED) === '1'; } catch {}
  const show = !dismissed && state.glossCat === 'all' && !state.glossQuery.trim();
  el.classList.toggle('hidden', !show);
  if (!show) { el.innerHTML = ''; return; }

  const path = (state.glossary?.terms || [])
    .filter(t => t.starter)
    .sort((a, b) => a.starter - b.starter);
  if (!path.length) { el.classList.add('hidden'); el.innerHTML = ''; return; }

  el.innerHTML = `
    <div class="gloss-start-head">
      <div class="gloss-start-headline">
        <span class="gloss-start-label">Když jste tu poprvé</span>
        <button class="gloss-start-close" type="button" aria-label="Skrýt úvod" title="Skrýt">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <p class="gloss-start-lede">Šest výrazů v&nbsp;pořadí, ve&nbsp;kterém na&nbsp;sebe navazují. Zbytek dohledáte, až na&nbsp;něj narazíte.</p>
    </div>
    <ol class="gloss-start-list">
      ${path.map(t => `
        <li><button class="gloss-start-item" data-term="${esc(t.slug)}" type="button">
          <span class="gloss-start-num">${t.starter}</span>
          <span class="gloss-start-term">${esc(t.term)}</span>
          <span class="gloss-start-short">${esc(t.short)}</span>
        </button></li>`).join('')}
    </ol>`;

  el.querySelector('.gloss-start-close').addEventListener('click', () => {
    try { localStorage.setItem(GLOSS_START_DISMISSED, '1'); } catch {}
    el.classList.add('hidden');
    el.innerHTML = '';
  });
}

function renderGlossary() {
  const wrap = $('gloss-results');
  if (!wrap) return;
  renderGlossaryCats();

  renderGlossaryStart();

  const list = glossFiltered();
  $('gloss-empty').classList.toggle('hidden', list.length > 0);
  $('gloss-clear').classList.toggle('hidden', !state.glossQuery);

  // Kolik toho filtr našel — bez toho člověk neví, jestli vidí všechno.
  const countEl = $('gloss-count-line');
  if (countEl) {
    const filtered = state.glossQuery.trim() || state.glossCat !== 'all';
    const n = list.length;
    const word = n === 1 ? 'výraz' : (n >= 2 && n <= 4 ? 'výrazy' : 'výrazů');
    countEl.textContent = filtered ? `${n} ${word}` : '';
    countEl.classList.toggle('hidden', !filtered);
  }

  // Bez filtru seskupíme podle kategorií, ať je vidět struktura oboru.
  // S filtrem dává větší smysl jeden plochý seznam výsledků.
  const grouped = state.glossCat === 'all' && !state.glossQuery.trim();
  if (!grouped) {
    wrap.innerHTML = `<div class="gloss-grid">${list.map(glossTermCardHtml).join('')}</div>`;
  } else {
    const cats = state.glossary?.categories || [];
    wrap.innerHTML = cats.map(c => {
      const items = list.filter(t => t.category === c.id);
      if (!items.length) return '';
      return `
        <section class="gloss-section">
          <div class="section-header">${esc(c.label)}</div>
          ${c.hint ? `<p class="gloss-cat-hint">${esc(c.hint)}</p>` : ''}
          <div class="gloss-grid">${items.map(glossTermCardHtml).join('')}</div>
        </section>`;
    }).join('');
  }
}

function showGlossary() {
  renderGlossaryEventTeaser();
  loadGlossary().then(() => renderGlossary());
}

function glossTermBySlug(slug) {
  return (state.glossary?.terms || []).find(t => t.slug === slug);
}

function showTerm(slug) {
  const t = glossTermBySlug(slug);
  if (!t) {
    if (!state.glossaryLoaded) { loadGlossary().then(() => showTerm(slug)); return; }
    showToast('Výraz nenalezen');
    return;
  }
  if (!location.hash.startsWith('#term/')) {
    _preTermHash = location.hash || '#';
    // Ukládá se celý stav, ne jen adresa. Pod výrazem může ležet otevřená
    // karta a ta má v history příznak pushed — bez něj by ji zavření poslalo
    // jinudy, než kterou přišla, a v historii by zůstala viset její položka.
    _preTermState = history.state;
  }
  history.replaceState({ term: slug }, '', '#term/' + slug);
  trackEvent('term_view', { slug });

  const related = (t.related || []).map(glossTermBySlug).filter(Boolean);
  const stat = t.mentions >= GLOSS_BADGE_MIN
    ? `<div class="term-stat">Ve&nbsp;skupině padlo <strong>${t.mentions}×</strong>${t.days ? ` během ${t.days} dnů` : ''}${t.first_seen ? `, poprvé ${formatDateLong(t.first_seen)}` : ''}.</div>`
    : '';

  $('term-ov-meta').innerHTML = `<span class="card-type" style="color:var(--accent)">${esc(glossCatLabel(t.category))}</span>`;
  $('term-ov-content').innerHTML = `
    <h2 id="term-ov-title" class="term-title">${esc(t.term)}</h2>
    <p class="term-plain">${esc(t.plain)}</p>
    ${t.why ? `<div class="term-why"><span class="term-why-label">Proč to potkáte</span><p>${esc(t.why)}</p></div>` : ''}
    ${stat}
    ${related.length ? `
      <div class="term-related">
        <span class="term-related-label">Souvisí s</span>
        <div class="term-related-row">
          ${related.map(r => `<button class="term-rel" data-term="${esc(r.slug)}" type="button">${esc(r.term)}</button>`).join('')}
        </div>
      </div>` : ''}
    ${t.card_hits > 0 ? `
    <div class="term-cta-row">
      <button class="term-cta" data-find="${esc(t.term)}" type="button">Najít v&nbsp;poznatcích</button>
    </div>` : ''}`;
  $('term-overlay-body').scrollTop = 0;
  show('term-overlay');
}

function closeTerm() {
  if ($('term-overlay').classList.contains('hidden')) return;
  hide('term-overlay');
  const target = _preTermHash || '#';
  const prevState = _preTermState;
  _preTermHash = '';
  _preTermState = null;
  history.replaceState(prevState || {}, '', target);
}

// Zavření bez sahání do history. Používá se tam, kde adresu mění už samotná
// navigace (popstate, přepnutí pohledu) — replaceState by tam přepsal záznam,
// na který se právě přeskočilo.
function dismissTerm() {
  if ($('term-overlay').classList.contains('hidden')) return;
  hide('term-overlay');
  _preTermHash = '';
  _preTermState = null;
}

// Nejsilnější místo, kde slovníček pomůže: čtenář narazí na neznámé slovo
// přímo v poznatku. Text karty nesaháme, jen pod něj nabídneme dotčené výrazy.
function renderCardTerms(card) {
  if (!state.glossaryLoaded || !card) return '';
  const hay = searchNorm([card.title, card.excerpt, card.body].filter(Boolean).join(' '));
  const hits = [];
  for (const t of (state.glossary?.terms || [])) {
    const forms = [t.term, ...(t.aliases || [])];
    const found = forms.some(f => {
      const nf = searchNorm(f);
      if (nf.length < 3) return false;               // „AI", „UI" by chytaly všude
      const i = hay.indexOf(nf);
      if (i < 0) return false;
      // hrubá hranice slova, ať „git" nenajde „digital"
      const before = i > 0 ? hay[i - 1] : ' ';
      const after = hay[i + nf.length] || ' ';
      return !/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after);
    });
    if (found) hits.push(t);
    if (hits.length >= 4) break;
  }
  if (!hits.length) return '';
  return `
    <div class="card-terms">
      <span class="card-terms-label">Výrazy z tohoto poznatku</span>
      <div class="card-terms-row">
        ${hits.map(t => `<button class="term-rel" data-term="${esc(t.slug)}" type="button">${esc(t.term)}</button>`).join('')}
      </div>
    </div>`;
}

// Opačný směr než findTermInCards: kdo hledá neznámé slovo, má dostat
// vysvětlení i tehdy, když se na něj netrefí žádná karta. Tohle je hlavní
// místo, kde na slovníček narazí i lidi, co ho v menu nikdy nehledali.
function renderSearchGloss(q) {
  const el = $('search-gloss');
  if (!el) return;
  const query = (q || '').trim();
  if (query.length < 2) { el.classList.add('hidden'); el.innerHTML = ''; return; }

  if (!state.glossaryLoaded) {
    // Doplní se, jakmile se slovníček donačte — hledání kvůli tomu nečeká.
    loadGlossary().then(() => {
      if (state.view === 'search' && state.searchQuery === q) renderSearchGloss(q);
    });
    return;
  }

  const nq = searchNorm(query);
  const hits = (state.glossary?.terms || []).filter(t =>
    searchNorm(t.term).includes(nq) || (t.aliases || []).some(a => searchNorm(a) === nq)
  ).slice(0, 2);

  if (!hits.length) { el.classList.add('hidden'); el.innerHTML = ''; return; }
  el.innerHTML = hits.map(t => `
    <button class="search-gloss-hit" data-term="${esc(t.slug)}" type="button">
      <span class="search-gloss-label">Ve slovníčku</span>
      <span class="search-gloss-term">${esc(t.term)}</span>
      <span class="search-gloss-short">${esc(t.short)}</span>
    </button>`).join('');
  el.classList.remove('hidden');
}

// Ze slovníčku rovnou do obsahu portálu — tohle má lidi vtáhnout dál,
// ne je nechat u definice.
function findTermInCards(term) {
  closeTerm();
  // Výraz jde otevřít i z rozkliknutého poznatku. Bez zavření karty by
  // hledání naběhlo pod ní a tlačítko by navenek neudělalo nic.
  if (!$('card-overlay').classList.contains('hidden')) closeCard();
  state.searchQuery = term;
  const inp = $('search-input');
  if (inp) inp.value = term;
  switchView('search');
}

function openMoreSheet() { show('more-sheet'); }
function closeMoreSheet() { hide('more-sheet'); }

/* ===== NAVIGATION ===== */
function switchView(viewName) {
  const prevView = state.view;

  // Odchod z hledání epizodu uzavírá, dotaz se odešle v podobě, v jaké
  // ho člověk doopravdy dopsal.
  if (prevView === 'search' && viewName !== 'search') flushSearch();

  // Přepnutí pohledu zavře případný otevřený detail akce (sheet).
  $('event-overlay')?.classList.add('hidden');
  dismissTerm();

  document.getElementById('site-header').classList.toggle('stats-mode', viewName === 'stats');

  const noChipsViews = new Set(['chat', 'transcript', 'stats', 'events', 'glossary', 'notfound']);
  $('topic-chips').classList.toggle('hidden', noChipsViews.has(viewName));

  ['today', 'week', 'archive', 'search', 'stats', 'transcript', 'top', 'chat', 'events', 'glossary', 'notfound'].forEach(v => {
    const el = $(`view-${v}`);
    if (el) el.classList.toggle('hidden', v !== viewName);
  });

  // Na mobilu jsou tyhle pohledy schované pod „Více", takže se zvýrazní ono.
  // Na širokém displeji mají v liště vlastní tlačítko, a pak se zvýrazní to.
  // Rozhoduje se podle toho, co je zrovna vidět, ne podle šířky okna — jinak
  // by se to muselo držet v souladu s breakpointem v CSS na dvou místech.
  const moreViews = new Set(['stats', 'events', 'glossary', 'chat']);
  const own = document.querySelector(`.nav-btn[data-view="${viewName}"]`);
  const ownVisible = !!own && own.offsetParent !== null;
  const navTarget = (moreViews.has(viewName) && !ownVisible) ? 'more' : viewName;
  document.querySelectorAll('.nav-btn').forEach(btn => {
    const isActive = btn.dataset.view === navTarget;
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
  } else if (viewName === 'events') {
    showEvents();
  } else if (viewName === 'glossary') {
    showGlossary();
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
  const resp = await fetch('/api/subscribe', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sub.toJSON()),
  });
  if (!resp.ok) {
    await sub.unsubscribe();
    throw new Error('Subscription rejected by server: ' + resp.status);
  }
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

// Tichý re-POST subscription, throttlovaný 1× denně: server drží odběry
// s 60denním TTL a bez obnovy tiše vypršely. Obnova při každé návštěvě
// drží aktivní odběratele naživu, aniž spamuje rate limit (5/h na IP).
async function refreshPushSubscription() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem('mtf_sub_refreshed') === today) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const resp = await fetch('/api/subscribe', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub.toJSON()),
    });
    if (resp.ok) localStorage.setItem('mtf_sub_refreshed', today);
  } catch { /* offline nebo rate limit — zkusí se příště */ }
}

// iOS Safari mimo nainstalovanou PWA nemá PushManager — zvoneček se dřív
// skryl a členi na iPhonu se o notifikacích neměli jak dozvědět. Teď se
// zvoneček ukáže a otevře instruktáž „Přidat na plochu".
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function isStandalone() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
    || navigator.standalone === true;
}
function openIosPushSheet() { show('ios-push-sheet'); }
function closeIosPushSheet() { hide('ios-push-sheet'); }

async function enablePushFlow(btn) {
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  if (!reg) { showToast('Nepodařilo se změnit nastavení'); return false; }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { showToast('Přístup k notifikacím zamítnut'); return false; }
  await subscribePush();
  if (btn) setPushBtnState(btn, true);
  showToast('Notifikace zapnuty');
  return true;
}

async function initPushBtn() {
  const btn = $('btn-bell');
  if (!btn) return;

  // iOS bez instalace: zvoneček vede na instruktáž místo skrytí.
  if (!('PushManager' in window) || !('serviceWorker' in navigator)) {
    if (isIOS() && !isStandalone()) {
      btn.setAttribute('title', 'Zapnout notifikace');
      btn.addEventListener('click', openIosPushSheet);
      return;
    }
    btn.style.display = 'none';
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
        const ok = await enablePushFlow(btn);
        if (ok) hidePushPrimer(true);
      }
    } catch { showToast('Nepodařilo se změnit nastavení'); }
    finally { btn.disabled = false; }
  });
}

/* ===== PUSH PRIMER =====
   Kontextová nabídka notifikací po 2.+ návštěvním dni — studený zvoneček
   v rohu si nikdo nevšimne (audit: 2 odběratelé z 540). Zobrazí se jen do
   rozhodnutí, „Teď ne" ho zavře natrvalo. */
function hidePushPrimer(permanently) {
  hide('push-primer');
  if (permanently) { try { localStorage.setItem('mtf_push_primer_done', '1'); } catch {} }
}

async function initPushPrimer() {
  try {
    if (!isAuthenticated()) return;
    if (localStorage.getItem('mtf_push_primer_done') === '1') return;
    const visitDays = parseInt(localStorage.getItem('mtf_visit_days') || '0', 10);
    if (visitDays < 2) return;

    const iosNeedsInstall = isIOS() && !isStandalone() && !('PushManager' in window);
    if (!iosNeedsInstall) {
      if (!('PushManager' in window) || !('serviceWorker' in navigator)) return;
      if (Notification.permission === 'denied') return;
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      if (!reg) return;
      if (await reg.pushManager.getSubscription()) {
        hidePushPrimer(true);
        return;
      }
    }

    show('push-primer');
    $('push-primer-on').addEventListener('click', async () => {
      if (iosNeedsInstall) { openIosPushSheet(); hidePushPrimer(true); return; }
      const ok = await enablePushFlow($('btn-bell'));
      hidePushPrimer(ok);
    });
    $('push-primer-off').addEventListener('click', () => hidePushPrimer(true));
  } catch { /* primer je bonus, nikdy nesmí shodit init */ }
}
function setPushBtnState(btn, active) {
  btn.classList.toggle('bell-active', active);
  btn.setAttribute('title', active ? 'Notifikace zapnuty, klikněte pro vypnutí' : 'Zapnout notifikace o novém digestu');
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
    applyReadStateDOM(id, false);
    updatePageTitle();
  } catch {}
}

// Přepne stav „přečteno" na už vykreslených kartách bez nutnosti překreslit —
// třídu (ztlumení) i text v patičce („Číst dál ↓" ↔ „Přečteno ✓").
function applyReadStateDOM(id, read) {
  document.querySelectorAll(`.card[data-id="${CSS.escape(id)}"]`).forEach(el => {
    el.classList.toggle('read', read);
    const rm = el.querySelector('.card-readmore');
    if (rm) {
      rm.classList.toggle('is-read', read);
      rm.textContent = read ? 'Přečteno ✓' : 'Číst dál ↓';
    }
  });
}

/* ===== VOTING ===== */
// Jednorázový reset lokální paměti hlasů po vynulování srdíček na serveru —
// jinak by zařízení dál ukazovalo vyplněné srdíčko u karet, které už mají 0.
function resetStaleVotesOnce() {
  try {
    if (localStorage.getItem('mtf_votes_v') !== '2') {
      localStorage.removeItem('mtf_votes');
      localStorage.setItem('mtf_votes_v', '2');
    }
  } catch {}
}
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
    if (r.status === 401) { handleAuthExpired(); return null; }  // token vypršel → znovu přihlásit
    if (!r.ok) return null;  // server odmítl — nemarkovat lokálně jako odhlasováno
    const j = await r.json();
    markVoted(id);
    return j.count ?? 0;
  } catch { return null; }
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
    if (r.status === 401) { handleAuthExpired(); return null; }  // token vypršel → znovu přihlásit
    if (!r.ok) return null;  // 409 (nehlasováno) i 5xx — neměnit lokální stav
    const j = await r.json();
    markUnvoted(id);
    return j.count ?? 0;
  } catch { return null; }
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
  const allCards = await fetchAllCards();
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
  if (!cards.length) { document.title = 'Master the Flow portál'; return; }
  const readSet = getReadCards();
  const unread = cards.filter(c => !readSet.has(c.id)).length;
  document.title = unread > 0
    ? `(${unread}) Master the Flow portál`
    : 'Master the Flow portál';
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
  await loadVoteMap();  // čerstvé počty čtení a srdíček
  if (state.view === 'today') { state.today = null; loadToday(); }
  else if (state.view === 'week') { state.archiveIndex = null; showWeek(); }
  else if (state.view === 'archive') { state.archiveIndex = null; state.archiveCards = []; showArchive(); }
}

/* ===== AUTO REFRESH ===== */
function initAutoRefresh() {
  setInterval(async () => {
    try {
      const data = await fetch('/data/today.json', { cache: 'no-cache' }).then(r => r.json());
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
    const reads = await fetch('/api/reads').then(r => r.ok ? r.json() : {});
    if (reads && typeof reads === 'object') {
      for (const [id, n] of Object.entries(reads)) state.cardStats[id] = { reads: n };
    }

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
// Bez cache-busting query: čerstvost řeší network-first service worker + ETag
// revalidace (viz _headers). Unikátní ?v= dřív rozbíjelo SW cache match a
// Cache Storage rostla bez limitu.
async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) {
    // Nepřečtené tělo drží spojení otevřené, i když odpověď zahazujeme.
    try { res.body?.cancel(); } catch { /* některé prohlížeče body nemají */ }
    throw new Error(`HTTP ${res.status}`);
  }
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
    ${(TRANSCRIPT_BTN_ENABLED && hasTranscript) ? '<button data-action="transcript">Přepis konverzace</button>' : ''}
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
        removeVote(cardId).then(count => {
          if (count === null) { showToast('Nepodařilo se odvolat hodnocení'); return; }
          state.voteMap[cardId] = count; rerenderCurrentView(); showToast('Hodnocení odvoláno');
        });
      } else {
        castVote(cardId).then(count => {
          if (count === null) { showToast('Nepodařilo se uložit hodnocení'); return; }
          state.voteMap[cardId] = count; rerenderCurrentView(); showToast('Díky za hodnocení!');
        });
      }
    } else if (action === 'read') {
      if (isRead(cardId)) {
        markUnread(cardId); rerenderCurrentView(); showToast('Označeno jako nepřečtené');
      } else {
        markRead(cardId); rerenderCurrentView(); showToast('Označeno jako přečtené');
      }
    } else if (action === 'share') {
      await shareCardById(cardId, card);
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
        applyReadStateDOM(id, true);
        showToast('Označeno jako přečtené');
      }
      updatePageTitle();
    }
  }, { passive: true });
}

/* ===== SHARE ===== */
async function createShareUrl(cardId) {
  const token = getAuthToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['x-mtf-token'] = token;
  const res = await fetch('/api/share', {
    method: 'POST',
    headers,
    body: JSON.stringify({ id: cardId }),
  });
  if (!res.ok) throw new Error('Share ticket rejected: ' + res.status);
  const { ticket } = await res.json();
  if (!ticket || !/^[0-9A-Za-z._-]{1,180}$/.test(ticket)) throw new Error('Invalid share ticket');
  return `${location.origin}/card/${cardId}?s=${encodeURIComponent(ticket)}`;
}

async function shareCardById(cardId, card) {
  trackEvent('share', { id: cardId });
  let url;
  try {
    url = await createShareUrl(cardId);
  } catch {
    // Bezpečný fallback: karta se sdílí bez credentialu a příjemce uvidí gate.
    url = `${location.origin}/card/${cardId}`;
  }
  const text = card ? `${card.title} — z komunity Master the Flow` : url;

  if (navigator.share) {
    try {
      await navigator.share({ title: card?.title || 'Master the Flow', text, url });
      return;
    } catch { /* fall through to clipboard */ }
  }

  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    showToast('Odkaz zkopírován');
  } catch {
    showToast('Nepodařilo se zkopírovat');
  }
}

async function shareCard() {
  const card = state.activeCard;
  if (!card) return;
  await shareCardById(card.id, card);
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
  } else if (hash === 'search' || hash.startsWith('search/')) {
    switchView('search');
    // Sdílitelný dotaz: #search/nastroje otevře hledání s předvyplněným dotazem.
    if (hash.startsWith('search/')) {
      let q = '';
      try { q = decodeURIComponent(hash.slice(7)); } catch {}
      if (q) {
        const inp = $('search-input');
        if (inp) { inp.value = q; $('search-clear').classList.remove('hidden'); }
        runSearch(q);
      }
    }
  } else if (hash === 'stats') {
    switchView('stats');
  } else if (hash === 'top') {
    switchView('top');
  } else if (hash === 'chat') {
    switchView('chat');
  } else if (hash === 'events') {
    switchView('events');
  } else if (hash.startsWith('event/')) {
    const id = hash.slice(6);
    switchView('events');
    showEvent(id);
  } else if (hash === 'glossary') {
    switchView('glossary');
  } else if (hash.startsWith('term/')) {
    // Sdílitelný odkaz na jeden výraz: #term/harness
    const slug = hash.slice(5);
    switchView('glossary');
    showTerm(slug);
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
  rerenderCurrentView();
}

function rerenderCurrentView() {
  if (state.view === 'search' && state.searchQuery) {
    runSearch(state.searchQuery);
    return;
  }
  if (state.view === 'today' && state.today) {
    // Klidný den se musí překreslit tou svojí cestou. renderCards() dostane
    // prázdné pole a vykreslí jen resurfacing, čímž smaže úvodní větu
    // i sekci „Co jste možná minuli“ — a protože tohle běží hned po načtení
    // (loadVoteMap), stihlo to jen probliknout.
    if ((state.today.cards || []).length === 0) {
      renderQuietDay(state.today);
    } else {
      renderCards(state.today.cards, 'cards-today', state.today.resurfacing || null);
    }
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
  // Swipe dolů zavře sheet. Musí sedět na KAŽDÉM overlayi, který má nahoře
  // úchyt — ten swipe vizuálně slibuje, takže když nefunguje, působí to jako
  // rozbitá appka. Slovníček se sem přidával později a zapomněl se.
  initSheetSwipe('card-overlay', 'overlay-body', closeCard);
  initSheetSwipe('event-overlay', 'event-overlay-body', closeEvent);
  initSheetSwipe('term-overlay', 'term-overlay-body', closeTerm);
  // Menu a iOS návod nemají rolovatelné tělo, proto bez bodyId.
  initSheetSwipe('more-sheet', null, closeMoreSheet);
  initSheetSwipe('ios-push-sheet', null, closeIosPushSheet);
}

function initSheetSwipe(overlayId, bodyId, closeFn) {
  const overlay = $(overlayId);
  if (!overlay) return;
  const sheet = overlay.querySelector('.overlay-sheet');
  if (!sheet) return;

  let startY = 0, dragging = false;

  sheet.addEventListener('touchstart', e => {
    const body = bodyId && $(bodyId);
    if (body && body.scrollTop > 0) return;  // jen když je obsah nahoře
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
        closeFn();
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
  return getAuthToken();
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
/* ===== 404 ===== */
// Neexistující cesta = cokoliv jiného než kořen appky. Hash routy běží pod „/",
// /card/:id obsluhuje samostatná funkce, takže jiná pathname = překlep/mrtvý odkaz.
function isUnknownPath() {
  const p = location.pathname.replace(/\/+$/, '') || '/';
  return p !== '/' && p !== '/index.html';
}

async function showNotFound() {
  switchView('notfound');
  const container = $('cards-notfound');
  container.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
  try {
    const pool = await fetchJSON('/data/chat-corpus.json');
    // Náhodný výběr 6 ze VŠECH kategorií (insight, nástroje, ukázka, tip…).
    const arr = [...(pool || [])];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    const six = arr.slice(0, 6);
    state.notFoundCards = six;
    container.innerHTML = six.map(c => renderCardEl(c)).join('');
    attachCardListeners(container);
  } catch {
    container.innerHTML = '<div class="empty-state"><p>Zkuste to prosím za&nbsp;chvíli znovu.</p></div>';
  }
}

async function init() {
  // Cookie musí být na místě dřív, než se sáhne pro data — bez ní vrátí
  // chráněné soubory 403 a portál by se načetl prázdný.
  await ensureGateCookie();

  // Defensive: ensure overlay is hidden on every page load (handles bfcache and edge cases)
  $('card-overlay')?.classList.add('hidden');
  state.activeCard = null;

  resetStaleVotesOnce();
  readVisitSource();
  // Podepsaný share ticket se zkouší před gate. Při neúspěchu nebo expiraci se
  // gate ukáže normálně; globální přístupový kód nikdy nebyl v URL.
  const shareTicket = readShareTicket();
  if (shareTicket && !isAuthenticated()) {
    // Čeká se schválně. Data jsou za bránou, takže kdyby se načítala souběžně
    // s odemykáním, stihla by dostat 403 a portál by zůstal prázdný.
    try { await tryShareUnlock(shareTicket); } finally { initGate(); }
  } else {
    initGate();
  }
  if (isAuthenticated()) trackSession();
  applyTheme(document.documentElement.getAttribute('data-theme') || localStorage.getItem('theme') || 'light');
  document.getElementById('btn-theme').addEventListener('click', toggleTheme);
  $('btn-random')?.addEventListener('click', openRandomCard);
  document.querySelector('.site-title')?.addEventListener('click', () => {
    switchView('today');
    history.pushState({}, '', '#');
  });

  registerSW().then(() => { initPushBtn(); refreshPushSubscription(); initPushPrimer(); });
  $('ios-push-close')?.addEventListener('click', closeIosPushSheet);
  $('ios-push-backdrop')?.addEventListener('click', closeIosPushSheet);
  loadVoteMap().then(() => rerenderCurrentView());
  initAutoRefresh();
  initPullToRefresh();
  initSwipeToClose();
  initLightbox();

  // Po návratu do appky (PWA z pozadí, přepnutí tabu) obnov počty čtení a srdíček.
  // Throttle 20 s, ať rychlé přepínání negeneruje zbytečné requesty.
  let _lastStatsRefresh = Date.now();
  document.addEventListener('visibilitychange', () => {
    // Odchod ze stránky epizodu hledání taky uzavírá. trackEvent posílá
    // s keepalive, takže se to stihne i při zavírání panelu.
    if (document.visibilityState === 'hidden') flushSearch();
    if (document.visibilityState === 'visible' && Date.now() - _lastStatsRefresh > 20000) {
      _lastStatsRefresh = Date.now();
      loadVoteMap().then(() => rerenderCurrentView());
    }
  });

  $('topic-chips').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (chip) onTopicChange(chip.dataset.topic);
  });

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.view;
      if (v === 'more') { openMoreSheet(); return; }
      switchView(v);
      history.pushState({}, '', `#${v === 'today' ? '' : v}`);
    });
  });

  // Menu „Více" — položky a zavření.
  document.querySelectorAll('#more-sheet .more-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.view;
      closeMoreSheet();
      switchView(v);
      history.pushState({}, '', `#${v}`);
    });
  });
  $('more-backdrop').addEventListener('click', closeMoreSheet);

  $('event-overlay-close').addEventListener('click', closeEvent);
  $('event-overlay-backdrop').addEventListener('click', closeEvent);

  // Slovníček: hledání, kategorie, otevření výrazu.
  $('gloss-input').addEventListener('input', e => {
    state.glossQuery = e.target.value;
    renderGlossary();
  });
  $('gloss-clear').addEventListener('click', () => {
    state.glossQuery = '';
    $('gloss-input').value = '';
    renderGlossary();
    $('gloss-input').focus();
  });
  $('gloss-cats').addEventListener('click', e => {
    const btn = e.target.closest('[data-cat]');
    if (!btn) return;
    state.glossCat = btn.dataset.cat;
    renderGlossary();
  });
  $('gloss-results').addEventListener('click', e => {
    const btn = e.target.closest('[data-term]');
    if (btn) showTerm(btn.dataset.term);
  });
  $('gloss-start').addEventListener('click', e => {
    const btn = e.target.closest('[data-term]');
    if (btn) showTerm(btn.dataset.term);
  });
  $('overlay-text').addEventListener('click', e => {
    const btn = e.target.closest('.card-terms [data-term]');
    if (btn) showTerm(btn.dataset.term);
  });
  $('search-gloss').addEventListener('click', e => {
    const btn = e.target.closest('[data-term]');
    if (btn) showTerm(btn.dataset.term);
  });
  $('term-overlay-close').addEventListener('click', closeTerm);
  $('term-overlay-backdrop').addEventListener('click', closeTerm);
  $('term-ov-content').addEventListener('click', e => {
    const rel = e.target.closest('[data-term]');
    if (rel) { showTerm(rel.dataset.term); return; }
    const find = e.target.closest('[data-find]');
    if (find) findTermInCards(find.dataset.find);
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

    // Lightbox má přednost před vším — je to nejvyšší modal.
    if (!$('lightbox').classList.contains('hidden')) {
      if (e.key === 'Escape') { closeLightbox(); return; }
      if (e.key === 'ArrowLeft') { lbGo(-1); return; }
      if (e.key === 'ArrowRight') { lbGo(1); return; }
      return;
    }

    if (e.key === 'Escape') {
      if (!$('more-sheet').classList.contains('hidden')) { closeMoreSheet(); return; }
      if (!$('event-overlay').classList.contains('hidden')) { closeEvent(); return; }
      if (!$('term-overlay').classList.contains('hidden')) { closeTerm(); return; }
      if (overlayOpen) { closeCard(); return; }
      if (state.view === 'transcript') { $('btn-transcript-back').click(); return; }
      const shortcutsPanel = document.getElementById('shortcuts-panel');
      if (shortcutsPanel && !shortcutsPanel.classList.contains('hidden')) { shortcutsPanel.classList.add('hidden'); return; }
      return;
    }
    if (overlayOpen) {
      if (e.key === 'Tab') {
        // Trap musí mířit na sheet OTEVŘENÉ karty — querySelector('.overlay-sheet')
        // vracel první match v DOM, což je skryté „Více" menu, a trap nefungoval.
        // Nad kartou může ještě ležet výraz ze slovníčku, a ten má přednost.
        const termOpen = !$('term-overlay').classList.contains('hidden');
        const sheet = document.querySelector(
          (termOpen ? '#term-overlay' : '#card-overlay') + ' .overlay-sheet');
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
      // Když nad kartou leží výraz ze slovníčku, klávesy patří jemu. Jinak by
      // se hlasovalo a listovalo v kartě, kterou zrovna není vidět.
      if (!$('term-overlay').classList.contains('hidden')) return;
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
    const cardOverlayOpen = !$('card-overlay').classList.contains('hidden');

    // Zpět z otevřené karty: jen uklidit overlay, view pod ním se nemění,
    // takže se nesmí re-renderovat (rozbilo by obnovený scroll).
    if (cardOverlayOpen && !location.hash.startsWith('#card/')) {
      closeCardUI();
      if (!$('event-overlay').classList.contains('hidden')) hide('event-overlay');
      // Výraz leží nad kartou. Kdyby zůstal, visel by po zavření karty
      // sám nad pohledem, ke kterému nepatří.
      dismissTerm();
      return;
    }

    if (!$('event-overlay').classList.contains('hidden')) {
      hide('event-overlay');
    }
    dismissTerm();

    // Zpět/vpřed mezi views: srovnat view s adresou. Dřív se URL změnila,
    // ale view zůstalo — hardwarové zpět na Androidu tak rozjelo stav.
    handleHash();
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
      $('event-overlay')?.classList.add('hidden');
      dismissTerm();
      state.activeCard = null;
      if (location.hash.startsWith('#card/') || location.hash.startsWith('#event/')
          || location.hash.startsWith('#term/')) history.replaceState({}, '', '#');
    }
  });

  if (isUnknownPath()) {
    showNotFound();
  } else {
    handleHash();
  }
  loadArchiveIndex();
}

document.addEventListener('DOMContentLoaded', init);
