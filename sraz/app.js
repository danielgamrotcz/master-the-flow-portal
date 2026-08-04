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
  partial: 'Část programu',
  uncertain: 'Účast ještě upřesní'
};

function attendeeInitials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part.charAt(0)).join('').toLocaleUpperCase('cs');
}

function renderAttendees(attendees) {
  const list = document.getElementById('attendees-list');
  if (!list) return;
  list.replaceChildren();

  if (!attendees.length) {
    const status = document.createElement('p');
    status.className = 'attendees-status';
    status.textContent = 'První účastníci se tu objeví, jakmile potvrdí zveřejnění.';
    list.append(status);
    list.setAttribute('aria-busy', 'false');
    return;
  }

  attendees.forEach(attendee => {
    const card = document.createElement('article');
    card.className = 'attendee-card';

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
    bio.textContent = attendee.bio;
    card.append(header, attendance, bio);
    list.append(card);
  });
  list.setAttribute('aria-busy', 'false');
}

function renderAttendeesError() {
  const list = document.getElementById('attendees-list');
  if (!list) return;
  const status = document.createElement('p');
  status.className = 'attendees-status attendees-status-error';
  status.textContent = 'Seznam účastníků teď nejde načíst. Registrace funguje dál.';
  list.replaceChildren(status);
  list.setAttribute('aria-busy', 'false');
}

async function initAttendees() {
  if (!document.getElementById('attendees-list')) return;
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
