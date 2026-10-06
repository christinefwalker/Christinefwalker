(() => {
  const storage = {
    get(key, persistent = false) { try { return (persistent ? localStorage : sessionStorage).getItem(key); } catch { return null; } },
    set(key, value, persistent = false) { try { (persistent ? localStorage : sessionStorage).setItem(key, value); } catch {} },
  };
  const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  const clean = value => typeof value === 'string' && /^[a-zA-Z0-9_ .:/-]{1,80}$/.test(value) && !value.includes('@') ? value : null;
  const attribution = (() => {
    try { return JSON.parse(storage.get('cfw-attribution') || 'null'); } catch { return null; }
  })() || (() => {
    const parameters = new URLSearchParams(location.search);
    const record = { session_id: crypto.randomUUID(), landing_page: location.pathname.replace(/\/$/, '') || '/', source: 'direct' };
    try { if (document.referrer) record.source = new URL(document.referrer).origin === location.origin ? 'website' : new URL(document.referrer).hostname; } catch {}
    for (const key of keys) { const value = clean(parameters.get(key)); if (value) record[key] = value; }
    storage.set('cfw-attribution', JSON.stringify(record));
    return record;
  })();

  for (const link of document.querySelectorAll('a[data-referral]')) {
    const target = new URL(link.getAttribute('href'), location.origin);
    for (const [key, value] of Object.entries(attribution)) target.searchParams.set(key, value);
    target.searchParams.set('placement', link.dataset.placement || 'cash-flow-cta');
    link.href = target.pathname + target.search;
  }

  function recordPage() {
    if (storage.get('cfw-analytics', true) !== 'allow') return;
    const page = location.pathname.replace(/\/$/, '') || '/';
    const send = eventType => fetch('/api/events', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
      body: JSON.stringify({ ...attribution, page, event_type: eventType, consent: true }),
    }).catch(() => {});
    send('page_view');
    const solution = document.querySelector('.connector-referral');
    if (page === '/cash-flow' && solution) {
      const observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting) && storage.get('cfw-analytics', true) === 'allow') {
          send('solution_view');
          observer.disconnect();
        }
      });
      observer.observe(solution);
    }
  }

  function privacyChoices(force = false) {
    if (!force && storage.get('cfw-analytics', true)) return;
    const existing = document.querySelector('.connector-consent-panel');
    if (existing) { existing.querySelector('button').focus(); return; }
    const panel = document.createElement('section');
    panel.className = 'connector-consent-panel';
    panel.setAttribute('aria-label', 'Optional analytics preferences');
    panel.innerHTML = '<p>A little context, not a dossier. Optional first-party analytics help me understand which pages are useful. Referral clicks are recorded separately. <a href="/privacy">Privacy details</a></p><div class="consent-actions"><button type="button" data-choice="deny">No thanks</button><button type="button" data-choice="allow">Allow analytics</button></div>';
    document.body.appendChild(panel);
    panel.addEventListener('click', event => {
      const button = event.target.closest('button[data-choice]');
      if (!button) return;
      storage.set('cfw-analytics', button.dataset.choice, true);
      panel.remove();
      if (button.dataset.choice === 'allow') recordPage();
    });
    if (force) panel.querySelector('button').focus();
  }
  document.querySelector('[data-privacy-choices]')?.addEventListener('click', () => privacyChoices(true));
  privacyChoices();
  recordPage();

  const heroPains = document.getElementById('hero-pains');
  if (heroPains) {
    document.addEventListener('click', event => {
      if (!heroPains.contains(event.target)) heroPains.open = false;
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && heroPains.open) {
        heroPains.open = false;
        heroPains.querySelector('summary').focus();
      }
    });
  }

  const contactForm = document.getElementById('tell-christine-form');
  if (contactForm) {
    const status = document.getElementById('form-status');
    const submitButton = contactForm.querySelector('button[type="submit"]');
    let pending = false;
    contactForm.addEventListener('submit', async event => {
      event.preventDefault();
      if (pending || !contactForm.reportValidity()) return;
      pending = true;
      submitButton.disabled = true;
      submitButton.textContent = 'Sending…';
      status.textContent = 'Sending your message…';
      status.dataset.error = 'false';
      try {
        contactForm.elements.message.value = contactForm.elements.problem.value;
        const response = await fetch('/contact', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(new FormData(contactForm)).toString(),
        });
        if (!response.ok) throw new Error('Submission failed');
        contactForm.hidden = true;
        const success = document.getElementById('contact-success');
        success.hidden = false;
        success.focus();
      } catch {
        status.textContent = 'That didn’t send. Your message is still here—please try again.';
        status.dataset.error = 'true';
        status.focus();
      } finally {
        pending = false;
        submitButton.disabled = false;
        submitButton.innerHTML = 'Tell Christine <span aria-hidden="true">↗</span>';
      }
    });
  }

  const situations = document.querySelectorAll('input[name="situation"]');
  for (const situation of situations) situation.addEventListener('change', () => {
    const message = document.getElementById('situation-status');
    message.textContent = 'Got it. You’re getting clear—not applying for anything.';
  });
})();
