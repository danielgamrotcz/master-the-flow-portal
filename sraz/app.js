function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem('theme', theme);
  } catch (error) {
    // Soukromý režim nebo firemní politika může zápis do úložiště blokovat.
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#faf6f2' : '#0f0f0f');
  const button = document.getElementById('theme-toggle');
  if (button) button.setAttribute('aria-label', theme === 'light' ? 'Přepnout na tmavý režim' : 'Přepnout na světlý režim');
}

function initTheme() {
  const button = document.getElementById('theme-toggle');
  if (!button) return;
  const initialTheme = document.documentElement.getAttribute('data-theme') || 'light';
  button.setAttribute('aria-label', initialTheme === 'light' ? 'Přepnout na tmavý režim' : 'Přepnout na světlý režim');
  button.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(current === 'light' ? 'dark' : 'light');
  });
}

function initStickyRegistration() {
  const sticky = document.getElementById('sticky-register');
  const registration = document.getElementById('registrace');
  const heroActions = document.querySelector('.hero-actions');
  if (!sticky || !registration || !heroActions || !('IntersectionObserver' in window)) return;

  let heroActionsVisible = true;
  let registrationVisible = false;
  const updateSticky = () => {
    sticky.classList.toggle('is-visible', !heroActionsVisible && !registrationVisible);
  };

  const heroObserver = new IntersectionObserver(entries => {
    heroActionsVisible = entries.some(entry => entry.isIntersecting);
    updateSticky();
  }, { threshold: 0.05 });

  const registrationObserver = new IntersectionObserver(entries => {
    registrationVisible = entries.some(entry => entry.isIntersecting);
    updateSticky();
  }, { threshold: 0.08 });
  heroObserver.observe(heroActions);
  registrationObserver.observe(registration);
}

const attendanceLabels = {
  official: 'Oficiální část 13:00–18:00',
  official_and_picnic: 'Oficiální část + piknik',
  picnic_only: 'Jen piknik po 18:00',
  uncertain: 'Účast ještě upřesní'
};

const attendeeFilterMatches = {
  all: () => true,
  official: attendance => attendance === 'official' || attendance === 'official_and_picnic',
  picnic: attendance => attendance === 'official_and_picnic' || attendance === 'picnic_only',
  picnic_only: attendance => attendance === 'picnic_only',
  uncertain: attendance => attendance === 'uncertain'
};

function attendeeInitials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part.charAt(0)).join('').toLocaleUpperCase('cs');
}

function refreshAttendeeBioToggles() {
  document.querySelectorAll('.attendee-card').forEach(card => {
    if (!card.getClientRects().length) return;
    const bio = card.querySelector('.attendee-bio');
    const toggle = card.querySelector('.attendee-bio-toggle');
    if (!bio || !toggle) return;
    if (card.classList.contains('is-bio-expanded')) {
      toggle.hidden = false;
      return;
    }
    toggle.hidden = bio.scrollHeight <= bio.clientHeight + 1;
  });
}

function updateAttendeesControls() {
  const list = document.getElementById('attendees-list');
  const toggle = document.getElementById('attendees-toggle');
  if (!list || !toggle) return;
  const filter = Object.hasOwn(attendeeFilterMatches, list.dataset.filter) ? list.dataset.filter : 'all';
  const limit = window.matchMedia('(max-width: 720px)').matches ? 4 : 6;
  const expanded = list.classList.contains('is-expanded');
  let count = 0;
  list.querySelectorAll('.attendee-card').forEach(card => {
    const matches = attendeeFilterMatches[filter](card.dataset.attendance);
    card.classList.toggle('is-filter-hidden', !matches);
    if (!matches) {
      card.classList.remove('is-limit-hidden');
      return;
    }
    count++;
    card.classList.toggle('is-limit-hidden', !expanded && count > limit);
  });
  toggle.hidden = count <= limit;
  toggle.setAttribute('aria-expanded', String(expanded));
  toggle.textContent = expanded ? 'Zobrazit jen první' : `${filter === 'all' ? 'Zobrazit všechny účastníky' : 'Zobrazit všechny ve výběru'} (${count})`;
  requestAnimationFrame(refreshAttendeeBioToggles);
}

function updateAttendeeFilterCounts() {
  const filters = document.getElementById('attendee-filters');
  const cards = [...document.querySelectorAll('.attendee-card')];
  if (!filters) return;
  filters.querySelectorAll('[data-attendee-filter]').forEach(button => {
    const filter = button.dataset.attendeeFilter;
    const count = cards.filter(card => attendeeFilterMatches[filter](card.dataset.attendance)).length;
    const countLabel = button.querySelector('[data-attendee-count]');
    if (countLabel) countLabel.textContent = String(count);
    button.disabled = count === 0;
  });
  filters.hidden = cards.length === 0;
}

function resetAttendeesControls() {
  const list = document.getElementById('attendees-list');
  const toggle = document.getElementById('attendees-toggle');
  const filters = document.getElementById('attendee-filters');
  if (list) {
    list.classList.remove('is-expanded');
    list.dataset.filter = 'all';
  }
  if (toggle) {
    toggle.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  }
  if (filters) {
    filters.hidden = true;
    filters.querySelectorAll('[data-attendee-filter]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.attendeeFilter === 'all'));
    });
  }
}

function renderAttendees(attendees) {
  const list = document.getElementById('attendees-list');
  if (!list) return;
  list.replaceChildren();
  resetAttendeesControls();

  if (!attendees.length) {
    const status = document.createElement('p');
    status.className = 'attendees-status';
    status.textContent = 'První účastníci se tu objeví, jakmile potvrdí zveřejnění.';
    list.append(status);
    list.setAttribute('aria-busy', 'false');
    return;
  }

  attendees.sort((first, second) => first.name.localeCompare(second.name, 'cs', { sensitivity: 'base' })).forEach((attendee, index) => {
    const card = document.createElement('article');
    card.className = 'attendee-card';
    card.dataset.attendance = attendee.attendance;

    const header = document.createElement('div');
    header.className = 'attendee-card-header';
    const initials = document.createElement('span');
    initials.className = 'attendee-initials';
    initials.setAttribute('aria-hidden', 'true');
    initials.textContent = attendeeInitials(attendee.name);
    const name = document.createElement('h3');
    name.textContent = attendee.name;
    header.append(initials, name);

    const attendance = document.createElement('p');
    attendance.className = 'attendee-attendance';
    attendance.textContent = attendanceLabels[attendee.attendance];
    const bio = document.createElement('p');
    bio.className = 'attendee-bio';
    bio.id = `attendee-bio-${index + 1}`;
    bio.textContent = attendee.bio;
    const bioToggle = document.createElement('button');
    bioToggle.className = 'attendee-bio-toggle';
    bioToggle.type = 'button';
    bioToggle.hidden = true;
    bioToggle.setAttribute('aria-controls', bio.id);
    bioToggle.setAttribute('aria-expanded', 'false');
    bioToggle.textContent = 'Celé představení';
    bioToggle.addEventListener('click', () => {
      const expanded = card.classList.toggle('is-bio-expanded');
      bioToggle.setAttribute('aria-expanded', String(expanded));
      bioToggle.textContent = expanded ? 'Zkrátit představení' : 'Celé představení';
    });
    card.append(header, attendance, bio, bioToggle);
    list.append(card);
  });
  list.setAttribute('aria-busy', 'false');
  updateAttendeeFilterCounts();
  updateAttendeesControls();
}

function renderAttendeesError() {
  const list = document.getElementById('attendees-list');
  if (!list) return;
  const status = document.createElement('p');
  status.className = 'attendees-status attendees-status-error';
  status.textContent = 'Seznam účastníků teď nejde načíst. Registrace funguje dál.';
  list.replaceChildren(status);
  resetAttendeesControls();
  list.setAttribute('aria-busy', 'false');
}

async function initAttendees() {
  const list = document.getElementById('attendees-list');
  const toggle = document.getElementById('attendees-toggle');
  const filters = document.getElementById('attendee-filters');
  if (!list || !toggle || !filters) return;
  filters.addEventListener('click', event => {
    const button = event.target.closest('[data-attendee-filter]');
    if (!button || button.disabled) return;
    list.dataset.filter = button.dataset.attendeeFilter;
    list.classList.remove('is-expanded');
    filters.querySelectorAll('[data-attendee-filter]').forEach(filterButton => {
      filterButton.setAttribute('aria-pressed', String(filterButton === button));
    });
    updateAttendeesControls();
  });
  toggle.addEventListener('click', () => {
    list.classList.toggle('is-expanded');
    updateAttendeesControls();
  });
  window.matchMedia('(max-width: 720px)').addEventListener('change', updateAttendeesControls);
  window.addEventListener('resize', () => requestAnimationFrame(refreshAttendeeBioToggles));
  try {
    const response = await fetch('/api/meetup-attendees', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const attendees = Array.isArray(payload.attendees) ? payload.attendees.slice(0, 200).filter(attendee => (
      attendee &&
      typeof attendee.name === 'string' && attendee.name.trim() &&
      typeof attendee.bio === 'string' && attendee.bio.trim() &&
      Object.hasOwn(attendanceLabels, attendee.attendance)
    )) : [];
    renderAttendees(attendees);
  } catch (error) {
    renderAttendeesError();
  }
}

initTheme();
initStickyRegistration();
initAttendees();
