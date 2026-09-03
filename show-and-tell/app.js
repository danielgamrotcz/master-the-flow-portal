(() => {
  const root = document.documentElement;
  const toggle = document.getElementById('theme-toggle');
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  const stickyRegister = document.querySelector('.sticky-register');
  const heroRegister = document.querySelector('.hero-actions [data-registration-link]');

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    if (metaTheme) metaTheme.setAttribute('content', theme === 'light' ? '#faf6f2' : '#0f0f0f');
    if (toggle) toggle.setAttribute('aria-label', theme === 'light' ? 'Přepnout na tmavý režim' : 'Přepnout na světlý režim');
  }

  const savedTheme = localStorage.getItem('theme');
  const preferredTheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  applyTheme(savedTheme || preferredTheme);

  if (toggle) {
    toggle.addEventListener('click', () => {
      applyTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });
  }

  if (stickyRegister && heroRegister) {
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        stickyRegister.classList.toggle('is-visible', !entries[0].isIntersecting);
      });
      observer.observe(heroRegister);
    } else {
      stickyRegister.classList.add('is-visible');
    }
  }

  function registeredCountLabel(count) {
    if (count === 1) return 'účastník';
    if (count >= 2 && count <= 4) return 'účastníci';
    return 'účastníků';
  }

  async function loadRegisteredCount() {
    const value = document.getElementById('registered-count');
    const note = document.getElementById('registered-count-note');
    if (!value || !note) return;
    try {
      const response = await fetch('/api/show-and-tell-registrations', { cache: 'no-store' });
      if (!response.ok) return;
      const payload = await response.json();
      if (!Number.isSafeInteger(payload.registeredCount) || payload.registeredCount < 0) return;
      value.textContent = String(payload.registeredCount);
      note.textContent = registeredCountLabel(payload.registeredCount);
    } catch {
      // Pomlčka je záměrný fallback: při chybě netvrdíme, že je registrováno nula lidí.
    }
  }

  loadRegisteredCount();
})();
