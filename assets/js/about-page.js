/* About Institute page. Content = suggested defaults (about-defaults.js) overridden by what the administrator saved in
   Admin → About Page (website_settings key "about_page"). The older Vision / Mission / Teaching / Environment texts
   (key "about") keep working and are still shown. */
(async function () {
  const { esc, icon, waLink } = window.BCTI;
  const S = await window.BCTI.ready;
  const D = window.BCTI_ABOUT_DEFAULTS || {};
  const saved = S.about_page || {};
  const A = {}; Object.keys(D).forEach((k) => { A[k] = k in saved ? saved[k] : D[k]; });
  Object.keys(D).forEach((k) => { if (D[k] && !Array.isArray(D[k]) && typeof D[k] === 'object') A[k] = Object.assign({}, D[k], saved[k] || {}); });
  const $ = (s) => document.querySelector(s), arr = (v) => (Array.isArray(v) ? v : []);
  const url = (u) => (/^https:\/\//.test(u || '') ? esc(u) : '');
  const lines = (t) => String(t || '').split('\n').map((x) => x.trim()).filter(Boolean);
  const show = (id, html) => { const el = $(id); if (!el) return; el.innerHTML = html; const sec = el.closest('[data-sec]'); if (sec) sec.hidden = !html.trim(); };
  const c = S.contact || {};

  /* 1. hero */
  const h = A.hero;
  $('#ab-hero-text').innerHTML = `${h.badge ? `<span class="ab-badge"><i></i>${esc(h.badge)}</span><br>` : ''}<h1 class="split-auto">${esc(h.title)}</h1>${h.text ? `<p class="lead">${esc(h.text)}</p>` : ''}
    <div class="ab-cta">${h.cta1 ? `<a class="btn btn-primary" href="courses.html">${esc(h.cta1)}</a>` : ''}${h.cta2 ? `<a class="btn btn-ghost" href="admissions.html">${esc(h.cta2)}</a>` : ''}</div>`;
  const keys = `<svg viewBox="0 0 120 80" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">`;
  const oldArt = keys + `<rect x="18" y="38" width="84" height="30" rx="5" stroke="#5b4a2a"/><path d="M30 38V24h60v14M38 24l4-10h36l4 10" stroke="#5b4a2a"/><path d="M30 50h4m8 0h4m8 0h4m8 0h4m8 0h4m8 0h4M38 58h44" stroke="#5b4a2a"/></svg>`;
  const newArt = keys + `<rect x="22" y="10" width="76" height="46" rx="4"/><path d="M46 66h28M60 56v10M12 72h96"/><path d="M34 24h30M34 32h46M34 40h22" stroke="#ffb98a"/></svg>`;
  $('#ab-split').innerHTML = `<figure class="ab-pane old" style="margin:0">${url(h.img_old) ? `<img src="${url(h.img_old)}" alt="${esc(h.cap_old)}" loading="eager">` : oldArt}<figcaption>${esc(h.cap_old)}</figcaption></figure>
    <figure class="ab-pane new" style="margin:0">${url(h.img_new) ? `<img src="${url(h.img_new)}" alt="${esc(h.cap_new)}" loading="eager">` : newArt}<figcaption>${esc(h.cap_new)}</figcaption></figure><span class="vs" aria-hidden="true">VS</span>`;

  /* 2. story */
  const st = A.story || {};
  show('#ab-story', st.heading || st.text ? `<div data-reveal><span class="eyebrow">Our Story & Legacy</span><h2>${esc(st.heading)}</h2></div><div data-reveal><p>${esc(st.text)}</p></div>` : '');

  /* 3. timeline */
  const tl = arr(A.timeline).filter((t) => t && (t.year || t.title));
  show('#ab-tl-wrap', tl.length ? `<div class="section-head center" data-reveal><span class="eyebrow">Milestones</span><h2>${esc(A.timeline_heading)}</h2></div>
    <div class="ab-years" role="tablist" aria-label="Jump to a year">${tl.map((t, i) => `<button type="button" data-i="${i}">${esc(t.year)}</button>`).join('')}</div>
    <div class="ab-tl" id="ab-tl" data-stagger>${tl.map((t, i) => `<div class="ab-ti" data-i="${i}"><div class="ab-tc" id="ab-t${i}"><b class="y">${esc(t.year)}</b><h3>${esc(t.title)}</h3><p>${esc(t.text)}</p></div></div>`).join('')}</div>` : '');

  /* 4. programs */
  const pr = arr(A.programs).filter((p) => p && p.title), icons = ['check', 'trending', 'monitor', 'book'];
  const flag = (p) => `<article class="ab-flag" data-reveal><div><span class="ab-tag">${esc(p.tag || 'Flagship')}</span><h3>${esc(p.title)}</h3>${p.summary ? `<p>${esc(p.summary)}</p>` : ''}
      ${String(p.chips || '').trim() ? `<div class="ab-chips">${String(p.chips).split(/;|\n/).map((x) => x.trim()).filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join('')}</div>` : ''}</div>
    <dl>${lines(p.details).map((l) => { const [a, ...b] = l.split('|'); return b.length ? `<div><dt>${esc(a.trim())}</dt><dd>${esc(b.join('|').trim())}</dd></div>` : `<div><dd>${esc(l)}</dd></div>`; }).join('')}
      ${p.outcomes ? `<div><dt>Career outcomes</dt><dd>${esc(p.outcomes)}</dd></div>` : ''}</dl></article>`;
  let k = 0;
  show('#ab-prog-wrap', pr.length ? `<div class="section-head center" data-reveal><span class="eyebrow">Programs</span><h2>${esc(A.programs_heading)}</h2></div><div class="ab-prog" data-stagger>${pr.map((p) => p.featured ? flag(p) : `<div class="card"><div class="icon">${icon(icons[k++ % icons.length])}</div><h3>${esc(p.title)}</h3><p>${esc(p.summary)}</p></div>`).join('')}</div>` : '');

  /* 5. metrics (a counter with an empty value is not shown) */
  const mt = arr(A.metrics).filter((m) => m && String(m.value).trim() && m.label);
  show('#ab-metrics', mt.length ? `<div class="ab-metrics" data-reveal="scale">${mt.map((m) => `<div><b data-v="${esc(m.value)}">${esc(m.value)}</b><span>${esc(m.label)}</span></div>`).join('')}</div>` : '');

  /* 6. team (shown only once the administrator adds people) */
  const ph = (p, big) => `<div class="ab-ph">${url(p.photo) ? `<img src="${url(p.photo)}" alt="${esc(p.name)}" loading="lazy" width="320" height="320">` : esc((p.name || '?').trim().charAt(0).toUpperCase())}</div>`;
  const ld = arr(A.leaders).filter((p) => p && p.name), sf = arr(A.staff).filter((p) => p && p.name);
  show('#ab-team', ld.length || sf.length ? `<div class="section-head center" data-reveal><span class="eyebrow">Our People</span><h2>${esc(A.team_heading)}</h2>${A.team_text ? `<p class="lead">${esc(A.team_text)}</p>` : ''}</div>
    ${ld.length ? `<div class="ab-lead" data-stagger>${ld.map((p) => `<article class="ab-lc">${ph(p)}<div><h3>${esc(p.name)}</h3><p class="ab-role">${esc(p.role)}</p>${p.quote ? `<q>${esc(p.quote)}</q>` : ''}</div></article>`).join('')}</div>` : ''}
    ${sf.length ? `<div class="ab-staff" data-stagger>${sf.map((p) => `<article class="ab-sc">${ph(p)}<h3>${esc(p.name)}</h3><p class="ab-role">${esc(p.role)}</p>${p.tag ? `<span class="ab-st">${esc(p.tag)}</span>` : ''}</article>`).join('')}</div>` : ''}` : '');

  /* 7. accreditations + CTA */
  const ac = arr(A.accred).map((x) => String(x).trim()).filter(Boolean);
  show('#ab-acc', ac.length ? `<div class="ab-acc" data-reveal>${ac.map((x) => `<span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>${esc(x)}</span>`).join('')}</div>` : '');
  const ct = A.cta || {};
  $('#ab-cta').innerHTML = `<span class="ring a" aria-hidden="true"></span><span class="ring b" aria-hidden="true"></span><div><h2>${esc(ct.title)}</h2>${ct.text ? `<p>${esc(ct.text)}</p>` : ''}</div><div class="cta-row">${ct.btn1 ? `<a class="btn btn-accent" href="admissions.html">${esc(ct.btn1)}</a>` : ''}${ct.btn2 ? `<a class="btn btn-light" href="${c.whatsapp ? esc(waLink(c, 'Hello, I would like to know about admissions and batch timings.')) : 'contact.html'}" ${c.whatsapp ? 'target="_blank" rel="noopener"' : ''}>${esc(ct.btn2)}</a>` : ''}</div>`;

  /* existing admin-managed texts (Vision, Mission, …) — unchanged behaviour */
  const a = S.about || {};
  $('#about-intro').innerHTML = a.intro ? `<p style="font-size:1.2rem;color:var(--ink);line-height:1.7">${esc(a.intro)}</p>` : '';
  const items = [['compass', 'Our Vision', a.vision], ['flag', 'Our Mission', a.mission], ['book', 'Teaching Approach', a.teaching_approach], ['school', 'Learning Environment', a.learning_environment]].filter((x) => x[2] && x[2].trim());
  $('#about-cards').innerHTML = items.map(([i, t, d]) => `<div class="card"><div class="icon">${icon(i)}</div><h3>${t}</h3><p>${esc(d)}</p></div>`).join('');
  $('#about-extra').hidden = !(a.intro || items.length);

  /* motion: re-scan new nodes, count-up metrics, timeline year chips */
  const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
  const count = (el) => {
    const m = String(el.dataset.v).match(/^(\D*)([\d,.]+)(.*)$/); if (!m || reduce) return;
    const end = parseFloat(m[2].replace(/,/g, '')), dec = (m[2].split('.')[1] || '').length, t0 = performance.now();
    const step = (t) => { const p = Math.min(1, (t - t0) / 1400), e = 1 - Math.pow(1 - p, 3); el.textContent = m[1] + (end * e).toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + m[3]; if (p < 1) requestAnimationFrame(step); else el.textContent = m[1] + m[2] + m[3]; };
    requestAnimationFrame(step);
  };
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { count(e.target); io.unobserve(e.target); } }), { threshold: 0.4 }) : null;
  document.querySelectorAll('#ab-metrics b[data-v]').forEach((b) => { if (io) io.observe(b); });
  const chips = [...document.querySelectorAll('.ab-years button')], items2 = [...document.querySelectorAll('.ab-ti')];
  const mark = (i) => { chips.forEach((b, j) => b.classList.toggle('on', j === i)); items2.forEach((x, j) => x.classList.toggle('on', j === i)); };
  chips.forEach((b) => b.addEventListener('click', () => { const i = +b.dataset.i; mark(i); const t = document.getElementById('ab-t' + i); if (t) t.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' }); }));
  if ('IntersectionObserver' in window && items2.length) { const io2 = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) mark(+e.target.dataset.i); }), { rootMargin: '-45% 0px -45% 0px' }); items2.forEach((x) => io2.observe(x)); }
})();
