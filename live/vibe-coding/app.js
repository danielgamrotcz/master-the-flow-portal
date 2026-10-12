(() => {
  const root = document.documentElement;
  const toggle = document.getElementById('theme-toggle');
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  const stickyRegister = document.querySelector('.sticky-register');
  const heroRegister = document.querySelector('.hero-actions [data-registration-link]');
  const finalRegister = document.querySelector('.registration-actions [data-registration-link]');

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
    const updateStickyRegister = () => {
      const finalButtonTop = finalRegister ? finalRegister.getBoundingClientRect().top : Infinity;
      // U závěrečné registrace už stačí tlačítko přímo v obsahu.
      stickyRegister.classList.toggle('is-visible', heroRegister.getBoundingClientRect().bottom < 0 && finalButtonTop >= window.innerHeight);
    };
    window.addEventListener('scroll', updateStickyRegister, { passive: true });
    window.addEventListener('resize', updateStickyRegister);
    updateStickyRegister();
  }
})();
