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
    const here = (location.pathname.split('/').pop() || 'index.html').replace(/\/$/, '') || 'index.html';
    const cur = here.includes('.') ? here : here + '.html';
    const links = PAGES.map(([h, l]) => `<li><a href="${h}"${(cur === h) ? ' class="active" aria-current="page"' : ''}>${l}</a></li>`).join('');

    const header = document.getElementById('site-header');
    if (header) header.outerHTML = `
      <a class="skip" href="#main">Skip to content</a>
      <header class="site-header"><div class="container nav">
        <a class="logo" href="index.html" aria-label="${esc(c.institute_name)} home">
          <span class="logo-mark" aria-hidden="true">⌨</span>
          <span>Bendre<small>Computer Typing Institute</small></span></a>
        <button class="burger" id="burger" aria-label="Open menu" aria-expanded="false" aria-controls="navlinks"><span></span><span></span><span></span></button>
        <ul class="nav-links" id="navlinks">${links}
          <li><a class="btn btn-accent btn-sm nav-cta" href="admissions.html">Enquire Now</a></li></ul>
      </div></header>`;

    const footer = document.getElementById('site-footer');
    if (footer) footer.outerHTML = `
      <footer class="site-footer"><div class="container">
        <div class="foot-grid">
          <div><h4>${esc(c.institute_name)}</h4><p>Learn. Practice. Improve. Achieve.</p></div>
          <div><h4>Explore</h4><ul>${PAGES.map(([h, l]) => `<li><a href="${h}">${l}</a></li>`).join('')}</ul></div>
          <div><h4>Contact</h4><ul>
            <li>${esc(c.address)}</li>
            <li><a href="tel:${esc(c.phone)}">${esc(c.phone)}</a></li>
            ${c.email ? `<li><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></li>` : ''}
          </ul></div>
        </div>
        <div class="foot-bottom"><span>© ${new Date().getFullYear()} ${esc(c.institute_name)}. All rights reserved.</span><a href="admin/">Staff login</a></div>
      </div></footer>`;

    // Floating WhatsApp + mobile sticky CTA
    const wa = document.createElement('a');
    wa.className = 'wa-float'; wa.href = waLink(c); wa.target = '_blank'; wa.rel = 'noopener';
    wa.setAttribute('aria-label', 'Enquire on WhatsApp');
    wa.innerHTML = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3C9 3 3.3 8.6 3.3 15.5c0 2.4.7 4.7 1.9 6.6L3 29l7.100-2.100c1.800 1 3.800 1.500 5.900 1.500 7 0 12.700-5.600 12.700-12.500S23 3 16 3zm0 22.800c-1.900 0-3.700-.5-5.300-1.500l-.4-.2-4.200 1.200 1.300-4-.3-.4a10.200 10.200 0 0 1-1.600-5.400C5.500 9.900 10.200 5.300 16 5.300s10.500 4.600 10.500 10.200S21.800 25.800 16 25.800zm5.700-7.600c-.3-.2-1.900-.9-2.200-1-.3-.1-.5-.2-.7.200s-.8 1-1 1.200c-.2.200-.4.200-.7.100a8.500 8.500 0 0 1-4.200-3.600c-.3-.6.300-.5.900-1.700.1-.2.100-.4 0-.5s-.7-1.700-1-2.300c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.6.100-.9.400-.3.300-1.200 1.100-1.200 2.800s1.200 3.300 1.400 3.500c.2.200 2.400 3.700 5.800 5.100 2.100.9 2.900.9 3.900.8.600-.1 1.900-.8 2.100-1.500.3-.7.300-1.400.2-1.500-.1-.2-.3-.2-.6-.4z"/></svg>';
    document.body.appendChild(wa);
    if (!/admissions\.html|\/admissions$/.test(location.pathname)) {
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
      });
      nav.addEventListener('click', (e) => { if (e.target.tagName === 'A') { nav.classList.remove('open'); burger.classList.remove('open'); } });
    }
  }

  function reveal() {
    const els = document.querySelectorAll('.reveal:not(.in)');
    if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
    const io = new IntersectionObserver((en) => en.forEach((x) => { if (x.isIntersecting) { x.target.classList.add('in'); io.unobserve(x.target); } }), { threshold: .12 });
    els.forEach((e) => io.observe(e));
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

  const ready = (async () => {
    const S = await loadSettings();
    window.BCTI.settings = S;
    renderChrome(S);
    setupNotice();
    reveal();
    return S;
  })();

  window.BCTI = { sb, configured, esc, pub, monthLabel, toast, waLink, reveal, ready, settings: DEFAULTS };
})();
