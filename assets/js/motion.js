/* Scroll motion for the public site.
   - Elements reveal when they enter the viewport and reverse when they leave,
     so the animation plays going down AND going back up.
   - Parallax, progress bar, scroll-driven ticker and the "draw" line are all
     computed from the scroll position, so they run backwards when scrolling up.
   - Only transform/opacity are animated. Nothing is hidden without JS, and
     everything is disabled for visitors who prefer reduced motion. */
(function () {
  const root = document.documentElement;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.__motion = true;
  const api = { split, refresh: scan };
  window.BCTI = window.BCTI || {};
  window.BCTI.motion = api;
  if (reduce) { api.refresh = function () {}; root.classList.remove('js'); return; }
  root.classList.add('js');

  /* ---------- split text into words (for headline reveal) ---------- */
  function split(el) {
    if (!el || el.classList.contains('split')) return;
    let i = 0;
    const wrap = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((p) => {
            if (!p) return;
            if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(' ')); return; }
            const w = document.createElement('span'); w.className = 'w';
            const s = document.createElement('span'); s.textContent = p; s.style.setProperty('--i', i++);
            w.appendChild(s); frag.appendChild(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) wrap(n);
      });
    };
    el.setAttribute('aria-label', el.textContent.trim());
    wrap(el);
    el.querySelectorAll('.w').forEach((w) => w.setAttribute('aria-hidden', 'true'));
    el.classList.add('split');
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
  }

  /* ---------- reveal in both directions ---------- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      const el = e.target;
      if (e.isIntersecting && e.intersectionRatio >= 0.1) {
        el.classList.add('in');
      } else if (!e.isIntersecting) {
        // remember which side it left from so it re-enters from that side
        el.dataset.side = e.boundingClientRect.top < 0 ? 'above' : 'below';
        el.classList.remove('in');
      }
    });
  }, { threshold: [0, 0.1], rootMargin: '0px 0px -5% 0px' });

  const seen = new WeakSet();
  function watch(el) { if (!seen.has(el)) { seen.add(el); io.observe(el); } }

  function stagger(p) {
    [...p.children].forEach((c, i) => {
      c.style.setProperty('--i', Math.min(i, 8));
      if (!c.hasAttribute('data-reveal') && !c.classList.contains('reveal')) c.setAttribute('data-reveal', p.dataset.stagger || 'up');
      watch(c);
    });
  }

  function scan(scope) {
    const r = scope && scope.querySelectorAll ? scope : document;
    const all = (sel) => { const l = [...r.querySelectorAll(sel)]; if (r.matches && r.matches(sel)) l.push(r); return l; };
    all('[data-stagger]').forEach(stagger);
    if (r.parentElement && r.parentElement.hasAttribute && r.parentElement.hasAttribute('data-stagger')) stagger(r.parentElement);
    all('[data-reveal],.reveal,.eyebrow').forEach(watch);
    all('[data-parallax]').forEach((el) => { if (!par.includes(el)) par.push(el); });
    all('[data-marquee]').forEach((el) => { if (!mq.includes(el)) mq.push(el); });
    all('[data-draw]').forEach((el) => { if (!draws.includes(el)) draws.push(el); });
    all('.split-auto').forEach(split);
    schedule();
  }

  /* ---------- scroll-linked effects ---------- */
  const par = [], mq = [], draws = [];
  const bar = document.createElement('div'); bar.className = 'progress'; bar.setAttribute('aria-hidden', 'true');
  document.body.appendChild(bar);
  let ticking = false, lastY = window.scrollY, hidden = false;

  function schedule() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

  function update() {
    ticking = false;
    const y = window.scrollY, vh = window.innerHeight;
    const max = Math.max(1, document.documentElement.scrollHeight - vh);
    bar.style.transform = `scaleX(${clamp(y / max)})`;

    const header = document.querySelector('.site-header');
    if (header) {
      header.classList.toggle('scrolled', y > 8);
      const menuOpen = document.getElementById('navlinks') && document.getElementById('navlinks').classList.contains('open');
      const down = y > lastY + 4, up = y < lastY - 4;
      if (!menuOpen && down && y > 360) hidden = true; else if (up || y < 120) hidden = false;
      header.classList.toggle('hide', hidden);
    }
    lastY = y;

    par.forEach((el) => {
      const box = (el.offsetParent || el.parentElement).getBoundingClientRect();
      if (box.bottom < -200 || box.top > vh + 200) return;
      const k = parseFloat(el.dataset.parallax) || 0.1;
      const off = (box.top + box.height / 2 - vh / 2) * k;
      el.style.transform = `translate3d(0,${(-off).toFixed(1)}px,0)`;
    });

    mq.forEach((el) => {
      const half = el.scrollWidth / 2 || 1;
      const k = parseFloat(el.dataset.marquee) || 0.4;
      el.style.transform = `translate3d(${(-((y * k) % half)).toFixed(1)}px,0,0)`;
    });

    draws.forEach((el) => {
      const r = el.getBoundingClientRect();
      const p = clamp((vh * 0.72 - r.top) / Math.max(1, r.height * 0.9));
      el.style.setProperty('--p', p.toFixed(3));
      el.querySelectorAll('.step').forEach((s, i, all) => s.classList.toggle('on', p >= (i + 0.35) / all.length));
    });
  }
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);

  /* ---------- dynamic content (courses / batches rendered later) ---------- */
  new MutationObserver((muts) => {
    muts.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) scan(n); }));
  }).observe(document.body, { childList: true, subtree: true });

  /* ---------- page transitions ---------- */
  document.body.classList.add('page-in');
  window.addEventListener('pageshow', (e) => { if (e.persisted) document.body.classList.remove('leaving'); });
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target && a.target !== '_self') return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || url.pathname === location.pathname && url.search === location.search) return;
    if (!/\.html$|\/$/.test(url.pathname) || url.pathname.includes('/admin/')) return;
    e.preventDefault();
    document.body.classList.add('leaving');
    setTimeout(() => { location.href = a.href; }, 180);
  });

  scan();
  window.addEventListener('load', schedule);
})();
