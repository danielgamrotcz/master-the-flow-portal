const API_URL = '/api/groups';
const PARTICIPANT_TOKEN_KEY = 'mtf-groups-participant-token';
const POLL_INTERVAL_MS = 3000;
const view = document.documentElement.dataset.view;
let adminSecret = '';
let pollTimer = 0;

function createParticipantToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function participantHandle() {
  try {
    let participantHandle = localStorage.getItem(PARTICIPANT_TOKEN_KEY);
    if (!participantHandle) {
      participantHandle = createParticipantToken();
      localStorage.setItem(PARTICIPANT_TOKEN_KEY, participantHandle);
    }
    return participantHandle;
  } catch {
    if (!window.__groupsParticipantToken) window.__groupsParticipantToken = createParticipantToken();
    return window.__groupsParticipantToken;
  }
}

async function apiRequest(options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (view === 'participant') headers['x-groups-participant'] = participantHandle();
  if (options.admin && adminSecret) headers['x-groups-admin'] = adminSecret;
  if (options.body) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${API_URL}${options.admin ? '?admin=1' : ''}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  });
  let payload;
  try { payload = await response.json(); } catch { payload = {}; }
  if (!response.ok) {
    const error = new Error(payload.error || 'Něco se nepovedlo.');
    error.status = response.status;
    throw error;
  }
  return payload;
}

function setMessage(element, message = '') {
  if (!element) return;
  element.textContent = message;
  element.hidden = !message;
}

function schedulePoll(callback) {
  clearTimeout(pollTimer);
  if (document.visibilityState === 'visible') pollTimer = window.setTimeout(callback, POLL_INTERVAL_MS);
}

function renderGroups(groups, participantGroup = null) {
  const grid = document.getElementById('teams-grid');
  const results = document.getElementById('results');
  if (!grid || !results || !Array.isArray(groups)) return;
  grid.replaceChildren();
  groups.forEach(group => {
    const card = document.createElement('article');
    card.className = 'team-card';
    if (group.number === participantGroup) card.classList.add('is-mine');

    const label = document.createElement('p');
    label.className = 'team-number';
    label.textContent = group.number === participantGroup ? `Tým ${group.number} · tvůj tým` : `Tým ${group.number}`;
    const list = document.createElement('ol');
    group.members.forEach(member => {
      const item = document.createElement('li');
      item.textContent = member;
      list.append(item);
    });
    card.append(label, list);
    grid.append(card);
  });
  results.hidden = false;
}

function updateCount(count) {
  const participantCount = document.getElementById('participant-count');
  const adminCount = document.getElementById('admin-participant-count');
  if (participantCount) participantCount.textContent = String(count);
  if (adminCount) adminCount.textContent = String(count);
}

function initRange() {
  const range = document.getElementById('experience');
  const output = document.getElementById('experience-output');
  if (!range || !output) return;
  const update = () => { output.value = range.value; output.textContent = range.value; };
  range.addEventListener('input', update);
  update();
}

function hydrateParticipantForm(participant) {
  if (!participant) return;
  const nickname = document.getElementById('nickname');
  const experience = document.getElementById('experience');
  const laptop = document.getElementById('has-laptop');
  const output = document.getElementById('experience-output');
  if (nickname) nickname.value = participant.nickname;
  if (experience) experience.value = String(participant.experience);
  if (output) output.textContent = String(participant.experience);
  if (laptop) laptop.checked = Boolean(participant.hasLaptop);
  const submit = document.getElementById('submit-button');
  if (submit) submit.textContent = 'Upravit odpověď';
  const waiting = document.getElementById('waiting-card');
  if (waiting) waiting.hidden = false;
}

function renderParticipantState(state) {
  updateCount(state.count || 0);
  const status = document.getElementById('event-status');
  const formCard = document.getElementById('form-card');
  const waiting = document.getElementById('waiting-card');
  if (state.status === 'finalized') {
    if (status) status.textContent = 'Týmy jsou rozdělené';
    if (formCard) formCard.hidden = true;
    if (waiting) waiting.hidden = true;
    renderGroups(state.groups || [], state.participantGroup);
    clearTimeout(pollTimer);
    return;
  }
  if (state.status !== 'open') {
    if (status) status.textContent = 'Odpovědi jsou uzamčené';
    if (formCard) formCard.hidden = true;
  }
  hydrateParticipantForm(state.participant);
}

async function refreshParticipant() {
  try {
    const state = await apiRequest();
    renderParticipantState(state);
    if (state.status === 'open' || state.status === 'locking') schedulePoll(refreshParticipant);
  } catch {
    schedulePoll(refreshParticipant);
  }
}

async function submitParticipant(event) {
  event.preventDefault();
  const button = document.getElementById('submit-button');
  const message = document.getElementById('form-message');
  const nickname = document.getElementById('nickname')?.value || '';
  const experience = Number(document.getElementById('experience')?.value);
  const hasLaptop = Boolean(document.getElementById('has-laptop')?.checked);
  setMessage(message);
  button.disabled = true;
  button.textContent = 'Ukládám…';
  try {
    const state = await apiRequest({
      method: 'POST',
      body: { action: 'register', nickname, experience, hasLaptop },
    });
    updateCount(state.count);
    hydrateParticipantForm(state.participant);
    document.getElementById('waiting-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (error) {
    setMessage(message, error.message);
    button.textContent = 'Uložit odpověď';
  } finally {
    button.disabled = false;
  }
}

function renderRoster(participants) {
  const list = document.getElementById('roster-list');
  if (!list) return;
  list.replaceChildren();
  participants.forEach(participant => {
    const row = document.createElement('div');
    row.className = 'roster-row';
    const name = document.createElement('strong');
    name.textContent = participant.nickname;
    const level = document.createElement('span');
    level.className = 'roster-meta';
    level.textContent = `${participant.experience}/10`;
    row.append(name, level);
    const laptop = document.createElement('span');
    laptop.className = participant.hasLaptop ? 'laptop-badge' : 'roster-meta';
    laptop.textContent = participant.hasLaptop ? 'Notebook' : '—';
    row.append(laptop);
    list.append(row);
  });
  list.hidden = false;
}

function renderAdminState(state) {
  updateCount(state.count || 0);
  renderRoster(state.participants || []);
  const finalize = document.getElementById('finalize-card');
  if (state.status === 'finalized') {
    if (finalize) finalize.hidden = true;
    renderGroups(state.groups || []);
    clearTimeout(pollTimer);
    return;
  }
  if (finalize) finalize.hidden = false;
  const button = document.getElementById('finalize-button');
  if (button) {
    const supported = state.count >= 3 && state.count <= 32 && state.count !== 5;
    button.disabled = !supported;
    button.textContent = state.count < 3 ? 'Čekám alespoň na 3 lidi' : state.count === 5 ? 'S 5 lidmi to nejde po 3–4' : 'Rozdělit do týmů';
  }
}

async function refreshAdmin() {
  if (!adminSecret) return;
  try {
    const state = await apiRequest({ admin: true });
    setMessage(document.getElementById('admin-message'));
    renderAdminState(state);
    if (state.status === 'open' || state.status === 'locking') schedulePoll(refreshAdmin);
  } catch (error) {
    setMessage(document.getElementById('admin-message'), error.message);
    if (error.status === 401 || error.status === 429) adminSecret = '';
  }
}

async function connectAdmin() {
  const code = document.getElementById('admin-code');
  const button = document.getElementById('admin-connect');
  adminSecret = code?.value || '';
  button.disabled = true;
  try {
    await refreshAdmin();
    if (adminSecret) {
      document.getElementById('admin-login').hidden = true;
      code.value = '';
    }
  } finally {
    button.disabled = false;
  }
}

async function finalizeTeams() {
  const button = document.getElementById('finalize-button');
  const message = document.getElementById('admin-message');
  button.disabled = true;
  button.textContent = 'Rozděluju…';
  try {
    const state = await apiRequest({ admin: true, method: 'POST', body: { action: 'finalize' } });
    renderGroups(state.groups || []);
    document.getElementById('finalize-card').hidden = true;
    clearTimeout(pollTimer);
  } catch (error) {
    setMessage(message, error.message);
    button.disabled = false;
    button.textContent = 'Rozdělit do týmů';
  }
}

function initParticipant() {
  initRange();
  document.getElementById('participant-form')?.addEventListener('submit', submitParticipant);
  refreshParticipant();
}

function initAdmin() {
  document.getElementById('admin-connect')?.addEventListener('click', connectAdmin);
  document.getElementById('admin-code')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') connectAdmin();
  });
  const dialog = document.getElementById('confirm-dialog');
  document.getElementById('finalize-button')?.addEventListener('click', () => dialog.showModal());
  dialog?.addEventListener('close', () => {
    if (dialog.returnValue === 'confirm') finalizeTeams();
  });
  apiRequest().then(state => {
    updateCount(state.count || 0);
    if (state.status === 'finalized') renderGroups(state.groups || []);
  }).catch(() => {});
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (view === 'participant') refreshParticipant();
    else if (adminSecret) refreshAdmin();
  }
});

if (view === 'admin') initAdmin(); else initParticipant();
