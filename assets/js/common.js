/* Shared code for all public pages */
(function () {
  const cfg = window.BCTI_CONFIG || {};
  const configured = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
  const sb = configured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

  // Details supplied by the institute; used until the database settings load.
  const DEFAULTS = {
    contact: {
      institute_name: 'Bendre Computer Typing Institute',
      address: 'Near City Care Hospital, Kamalnagar Society, Wadgaonsheri, Pune 411014',
      phone: '9689418627',
      whatsapp: '919689418627',
      email: 'bendregajanan81@gmail.com',
      opening_hours: '',
      maps_query: 'Bendre Computer Typing Institute, Near City Care Hospital, Kamalnagar Society, Wadgaonsheri, Pune 411014'
    },
    home: {
      hero_title: 'Your Future Begins with the Right Skills.',
      hero_text: 'Build your typing speed, computer confidence, and practical skills with Bendre Computer Typing Institute.',
      hero_image_url: ''
    },
    about: { intro: 'Bendre Computer Typing Institute is a computer typing and education institute in Wadgaonsheri, Pune, helping students build practical typing and computer skills.', vision: '', mission: '', teaching_approach: '', learning_environment: '' },
    seo: { site_title: '', site_description: '' }
  };

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pub = (path) => (sb && path ? sb.storage.from('gallery').getPublicUrl(path).data.publicUrl : '');
  const monthLabel = (d) => {
    if (!d) return '';
    const [y, m] = String(d).split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  };

  /* ---------- icons (line icons, no emoji) ---------- */
  const P = {
    keyboard: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    trending: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
    heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    school: '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
    compass: '<circle cx="12" cy="12" r="10"/><path d="m16.2 7.8-2.1 6.3-6.3 2.1 2.1-6.3z"/>',
    flag: '<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>'
  };
  const icon = (n, extra) => `<svg class="i${extra ? ' ' + extra : ''}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || P.layers}</svg>`;

  // Placeholder tile used until a real photograph is uploaded
  const ph = (name) => {
    const words = String(name || '?').trim().split(/\s+/).filter(Boolean);
    const ini = (words[0] ? words[0][0] : '?') + (words[1] ? words[1][0] : '');
    const n = [...String(name || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % 4;
    return `<div class="ph ph-${n}" aria-hidden="true"><span>${esc(ini.toUpperCase())}</span></div>`;
  };

  function toast(msg, isErr) {
    const t = document.createElement('div');
    t.className = 'toast' + (isErr ? ' err' : '');
    t.setAttribute('role', 'status');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  async function loadSettings() {
    const out = JSON.parse(JSON.stringify(DEFAULTS));
    if (!sb) return out;
    try {
      const { data, error } = await sb.from('website_settings').select('key,value');
      if (error) throw error;
      (data || []).forEach((r) => { out[r.key] = Object.assign({}, out[r.key], r.value); });
    } catch (e) { console.warn('Settings not loaded', e.message); }
    return out;
  }

  const waLink = (c, text) => `https://wa.me/${String(c.whatsapp || '').replace(/\D/g, '')}?text=${encodeURIComponent(text || 'Hello, I would like to enquire about admission at Bendre Computer Typing Institute.')}`;

  const PAGES = [
    ['index.html', 'Home'], ['about.html', 'About Institute'], ['courses.html', 'Courses'],
    ['gallery.html', 'Student Gallery'], ['admissions.html', 'Admissions'], ['contact.html', 'Contact Us']
  ];

  function renderChrome(S) {
    const c = S.contact;
    const here = (location.pathname.split('/').pop() || 'index.html');
    const cur = here.includes('.') ? here : here + '.html';
    const links = PAGES.map(([h, l]) => `<li><a href="${h}"${(cur === h) ? ' class="active" aria-current="page"' : ''}>${l}</a></li>`).join('');

    const header = document.getElementById('site-header');
    if (header) header.outerHTML = `
      <a class="skip" href="#main">Skip to content</a>
      <header class="site-header"><div class="container nav">
        <a class="logo" href="index.html" aria-label="${esc(c.institute_name)} home">
          <span class="logo-mark logo-mark--img"><img src="assets/images/bendre-institute-mark.png" alt="" width="52" height="61" decoding="async"></span>
          <span>Bendre<small>Computer Typing Institute</small></span></a>
        <button class="burger" id="burger" aria-label="Open menu" aria-expanded="false" aria-controls="navlinks"><span></span><span></span><span></span></button>
        <ul class="nav-links" id="navlinks">${links}
          <li><a class="nav-student" href="student/">Student Login</a></li>
          <li><a class="btn btn-accent btn-sm nav-cta" href="admissions.html">Enquire Now</a></li></ul>
      </div></header>`;

    const footer = document.getElementById('site-footer');
    if (footer) footer.outerHTML = `
      <footer class="site-footer"><div class="container">
        <div class="foot-grid">
          <div><div class="brand">Learn. Practice.<br><em>Improve. Achieve.</em></div><p data-c="institute_name">${esc(c.institute_name)}</p></div>
          <div><h4>Explore</h4><ul>${PAGES.map(([h, l]) => `<li><a href="${h}">${l}</a></li>`).join('')}</ul></div>
          <div><h4>Visit &amp; contact</h4><ul>
            <li data-c="address">${esc(c.address)}</li>
            <li><a data-c="phone" href="tel:${esc(c.phone)}">${esc(c.phone)}</a></li>
            <li data-c-wrap="email" ${c.email ? '' : 'hidden'}><a data-c="email" href="mailto:${esc(c.email)}">${esc(c.email)}</a></li>
          </ul></div>
        </div>
        <div class="foot-bottom"><span>© ${new Date().getFullYear()} <span data-c="institute_name">${esc(c.institute_name)}</span>. All rights reserved.</span><span><a href="student/">Student login</a> · <a href="admin/">Staff login</a></span></div>
      </div></footer>`;

    // Floating WhatsApp + mobile sticky CTA
    const wa = document.createElement('a');
    wa.className = 'wa-float'; wa.id = 'wa-float'; wa.href = waLink(c); wa.target = '_blank'; wa.rel = 'noopener';
    wa.setAttribute('aria-label', 'Enquire on WhatsApp');
    wa.innerHTML = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3C9 3 3.3 8.6 3.3 15.5c0 2.4.7 4.7 1.9 6.6L3 29l7.100-2.100c1.800 1 3.800 1.500 5.900 1.500 7 0 12.700-5.600 12.700-12.500S23 3 16 3zm0 22.800c-1.900 0-3.700-.5-5.300-1.500l-.4-.2-4.200 1.200 1.300-4-.3-.4a10.200 10.200 0 0 1-1.600-5.400C5.500 9.900 10.200 5.300 16 5.300s10.500 4.600 10.500 10.200S21.800 25.800 16 25.800zm5.700-7.600c-.3-.2-1.900-.9-2.200-1-.3-.1-.5-.2-.7.200s-.8 1-1 1.200c-.2.200-.4.200-.7.100a8.500 8.500 0 0 1-4.200-3.600c-.3-.6.300-.5.900-1.700.1-.2.100-.4 0-.5s-.7-1.700-1-2.300c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.6.100-.9.400-.3.300-1.200 1.100-1.200 2.800s1.200 3.300 1.400 3.500c.2.200 2.400 3.700 5.800 5.100 2.100.9 2.900.9 3.900.8.600-.1 1.900-.8 2.100-1.500.3-.7.300-1.400.2-1.500-.1-.2-.3-.2-.6-.4z"/></svg>';
    document.body.appendChild(wa);
    if (!/admissions/.test(location.pathname)) {
      const m = document.createElement('a');
      m.className = 'btn btn-accent mobile-cta'; m.href = 'admissions.html'; m.textContent = 'Enquire for Admission';
      document.body.appendChild(m);
    }

    const burger = document.getElementById('burger'), nav = document.getElementById('navlinks');
    if (burger) {
      burger.addEventListener('click', () => {
        const o = nav.classList.toggle('open');
        burger.classList.toggle('open', o);
        burger.setAttribute('aria-expanded', o);
        burger.setAttribute('aria-label', o ? 'Close menu' : 'Open menu');
      });
      nav.addEventListener('click', (e) => { if (e.target.tagName === 'A') { nav.classList.remove('open'); burger.classList.remove('open'); } });
    }
  }

  // After the database settings arrive, refresh the few places that show them
  function updateChrome(S) {
    const c = S.contact;
    document.querySelectorAll('[data-c]').forEach((el) => {
      const k = el.dataset.c; if (!(k in c)) return;
      el.textContent = c[k];
      if (k === 'phone') el.href = 'tel:' + c.phone;
      if (k === 'email') el.href = 'mailto:' + c.email;
    });
    const w = document.querySelector('[data-c-wrap=email]'); if (w) w.hidden = !c.email;
    const wa = document.getElementById('wa-float'); if (wa) wa.href = waLink(c);
  }

  function setupNotice() {
    if (configured) return;
    const main = document.getElementById('main');
    if (!main) return;
    const d = document.createElement('div');
    d.className = 'container';
    d.innerHTML = '<div class="setup-banner"><b>Setup needed:</b> add your Supabase URL and anon key in <code>assets/js/config.js</code> so courses, gallery and enquiries can load. See README.md.</div>';
    main.prepend(d);
  }

  // Draw the header/footer straight away from the known details, then refresh from the database
  renderChrome(DEFAULTS);
  setupNotice();
  const ready = (async () => {
    const S = await loadSettings();
    window.BCTI.settings = S;
    updateChrome(S);
    return S;
  })();

  window.BCTI = Object.assign(window.BCTI || {}, {
    sb, configured, esc, pub, monthLabel, toast, waLink, icon, ph, ready, settings: DEFAULTS,
    reveal: () => { if (window.BCTI.motion) window.BCTI.motion.refresh(); }
  });
})();
