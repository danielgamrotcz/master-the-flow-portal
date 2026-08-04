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

initTheme();
initStickyRegistration();
