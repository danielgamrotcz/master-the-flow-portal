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

  const availability = [...document.querySelectorAll('[data-registration-availability]')];
  if (availability.length) {
    const capacity = 98;
    const maxAge = 15 * 60 * 1000;
    let pending = false;
    let timer;
    function renderCount(data) {
      const count = data && data.registeredCount;
      const age = data ? Date.now() - Date.parse(data.updatedAt) : NaN;
      const valid = Number.isSafeInteger(count) && count >= 0 && count <= 10000
        && data.capacity === capacity && Number.isFinite(age) && age >= -60000 && age <= maxAge;
      for (const element of availability) {
        element.replaceChildren();
        if (!valid) {
          element.textContent = 'Kapacita 98 lidí. Aktuální obsazenost teď není dostupná.';
          continue;
        }
        const remaining = Math.max(0, capacity - count);
        const strong = document.createElement('strong');
        strong.textContent = remaining === 0 ? 'Živá kapacita je naplněná' : remaining === 1
          ? 'Zbývá 1 místo' : remaining <= 4 ? `Zbývají ${remaining} místa` : `Zbývá ${remaining} míst`;
        element.append(strong, document.createTextNode(` · Přihlášeno ${count} z ${capacity}`));
      }
    }
    async function refreshCount() {
      clearTimeout(timer);
      if (pending || document.hidden) return;
      pending = true;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch('/api/vibe-coding-registrations', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Count unavailable');
        renderCount(await response.json());
      } catch { renderCount(null); }
      finally {
        clearTimeout(timeout);
        pending = false;
        if (!document.hidden) timer = setTimeout(refreshCount, 30000);
      }
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clearTimeout(timer);
      else refreshCount();
    });
    window.addEventListener('pageshow', refreshCount);
    refreshCount();
  }
})();
