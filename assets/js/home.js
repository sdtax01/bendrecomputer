(async function () {
  // hero entrance: start once the page (incl. the logo image) has loaded; CSS failsafe covers a JS failure
  (function () {
    const hero = document.getElementById('hero');
    if (!hero) return;
    const go = () => hero.classList.add('hero-ready');
    if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
  })();
  const { sb, esc, pub, monthLabel, icon, ph } = window.BCTI;
  const $ = (id) => document.getElementById(id);
  const motion = window.BCTI.motion;

  // icons referenced as <span data-i="name">
  document.querySelectorAll('[data-i]').forEach((s) => { s.outerHTML = icon(s.dataset.i); });

  // headline word reveal
  if (motion) motion.split($('hero-title'));

  // ticker
  const words = ['Learn', 'Practice', 'Improve', 'Achieve'];
  const unit = words.map((w) => `<span>${w}</span>`).join('');
  $('mq').innerHTML = unit.repeat(4);

  // why-choose-us list
  const FEATS = [
    ['monitor', 'Practical Computer Learning', 'Hands-on time on the computer, not just theory.'],
    ['zap', 'Typing Speed Development', 'Structured practice to grow speed and accuracy together.'],
    ['target', 'Student-Focused Training', "Learning that keeps each student's goals in view."],
    ['users', 'Batch-Wise Learning', 'Learn alongside your batch and move forward together.'],
    ['trending', 'Skill Development', 'Build abilities that are useful in study and work.'],
    ['heart', 'Supportive Learning Environment', 'A friendly place to ask questions and keep improving.']
  ];
  $('feats').innerHTML = FEATS.map(([i, t, d], n) => `
    <article class="feat"><div class="feat-top"><span class="feat-num">0${n + 1}</span><span class="icon">${icon(i)}</span></div>
    <h3>${t}</h3><p>${d}</p></article>`).join('');

  /* ---------------- typing test (real, measured in the browser) ---------------- */
  const SENTENCES = [
    'Practice every day and your fingers will learn the keyboard.',
    'Accuracy comes first, speed follows with steady practice.',
    'A good typist keeps eyes on the screen and fingers on the home row.',
    'Small daily practice builds confident typing skills over time.',
    'Sit straight, relax your wrists and type one word at a time.'
  ];
  const LIMIT = 30;
  const tt = $('tt'), box = $('tt-text'), input = $('tt-input');
  let text = '', idx = -1, started = 0, timer = null, state = 'idle';

  function newText() {
    let n; do { n = Math.floor(Math.random() * SENTENCES.length); } while (n === idx && SENTENCES.length > 1);
    idx = n; text = SENTENCES[n];
    box.innerHTML = [...text].map((c) => `<span class="c">${esc(c)}</span>`).join('');
    input.maxLength = text.length; input.value = '';
    state = 'idle'; started = 0; clearInterval(timer);
    tt.classList.remove('running', 'done');
    $('tt-time').textContent = `0:${String(LIMIT).padStart(2, '0')}`;
    tt.style.setProperty('--t', 1); $('tt-bar').style.transform = '';
    $('tt-wpm').textContent = '0'; $('tt-acc').textContent = '100'; $('tt-chars').textContent = '0';
    $('tt-hint').hidden = false; $('tt-result').textContent = '';
    paint();
  }
  function stats() {
    const v = input.value, ok = [...v].filter((c, i) => c === text[i]).length;
    const mins = Math.max((Date.now() - started) / 60000, 1 / 600);
    return { wpm: Math.round(ok / 5 / mins), acc: v.length ? Math.round(ok / v.length * 100) : 100, chars: v.length, ok };
  }
  function paint() {
    const v = input.value, spans = box.children;
    for (let i = 0; i < spans.length; i++) {
      const s = spans[i];
      s.className = 'c' + (i < v.length ? (v[i] === text[i] ? ' ok' : ' bad') : '') + (i === v.length && state !== 'done' ? ' cur' : '');
    }
  }
  function tick() {
    const left = Math.max(0, LIMIT - (Date.now() - started) / 1000);
    $('tt-time').textContent = `0:${String(Math.ceil(left)).padStart(2, '0')}`;
    $('tt-bar').style.transform = `scaleX(${left / LIMIT})`;
    const s = stats(); $('tt-wpm').textContent = s.wpm; $('tt-acc').textContent = s.acc; $('tt-chars').textContent = s.chars;
    if (left <= 0) finish();
  }
  function finish() {
    if (state === 'done') return;
    state = 'done'; clearInterval(timer); tt.classList.remove('running'); tt.classList.add('done');
    const s = stats();
    $('tt-wpm').textContent = s.wpm; $('tt-acc').textContent = s.acc; $('tt-chars').textContent = s.chars;
    $('tt-hint').hidden = true;
    $('tt-result').textContent = `You typed at ${s.wpm} words per minute with ${s.acc}% accuracy. Enquire about a course to improve both.`;
    input.blur(); paint();
  }
  input.addEventListener('input', () => {
    if (state === 'done') return;
    if (state === 'idle') { state = 'running'; started = Date.now(); tt.classList.add('running'); $('tt-hint').hidden = true; timer = setInterval(tick, 200); }
    paint(); tick();
    if (input.value.length >= text.length) finish();
  });
  input.addEventListener('paste', (e) => e.preventDefault());
  input.addEventListener('keydown', (e) => { if (e.key === 'Tab') return; if (state === 'done' && e.key === 'Enter') newText(); });
  $('tt-restart').addEventListener('click', () => { newText(); input.focus(); });
  newText();

  /* ---------------- institute details / content from the database ---------------- */
  const S = await window.BCTI.ready;
  if (S.home.hero_title) {
    const t = S.home.hero_title.trim(), el = $('hero-title'), i = t.lastIndexOf(' ');
    const plain = el.getAttribute('aria-label') || el.textContent.trim();
    if (t !== plain) {
      el.classList.remove('split', 'in');
      el.innerHTML = i > 0 ? `${esc(t.slice(0, i))} <em>${esc(t.slice(i + 1))}</em>` : esc(t);
      if (motion) motion.split(el);
    }
  }
  if (S.home.hero_text) $('hero-text').textContent = S.home.hero_text;
  if (S.home.hero_image_url) {
    const img = $('hero-photo'); img.src = S.home.hero_image_url; img.hidden = false;
    $('hero-visual').classList.add('has-photo');
  }
  const area = /Wadgaonsheri,?\s*Pune/i.test(S.contact.address) ? 'Wadgaonsheri, Pune' : S.contact.address;
  $('hm-addr').textContent = area; $('hm-phone').textContent = S.contact.phone; $('hm-phone').href = 'tel:' + S.contact.phone;
  if (S.seo.site_title) document.title = S.seo.site_title;
  if (S.seo.site_description) document.querySelector('meta[name=description]').setAttribute('content', S.seo.site_description);

  const cBox = $('home-courses'), bBox = $('home-batches');
  if (!sb) { cBox.innerHTML = ''; bBox.innerHTML = ''; return; }

  const empty = (ic, msg) => `<div class="empty" style="grid-column:1/-1"><span class="big">${icon(ic)}</span><p>${msg}</p></div>`;

  try {
    const { data, error } = await sb.from('courses').select('*').eq('is_published', true).order('sort_order').limit(3);
    if (error) throw error;
    cBox.innerHTML = (data && data.length) ? data.map((c) => `
      <article class="card course-card">
        <div class="course-img">${c.image_path ? `<img src="${esc(pub(c.image_path))}" alt="${esc(c.name)} course" loading="lazy">` : ph(c.name)}</div>
        <div class="course-body">
          ${c.category ? `<span class="tag">${esc(c.category)}</span>` : ''}
          <h3>${esc(c.name)}</h3>
          <p>${esc(c.short_description || '')}</p>
          ${c.duration ? `<div class="meta"><span>${icon('clock')}${esc(c.duration)}</span></div>` : ''}
          <div class="course-actions">
            <a class="btn btn-ghost btn-sm" href="courses.html#${esc(c.slug)}">View Details</a>
            <a class="btn btn-accent btn-sm" href="admissions.html?course=${esc(c.id)}">Enquire Now</a>
          </div>
        </div>
      </article>`).join('') : empty('book', 'Courses will be listed here soon. Please <a href="contact.html"><u>contact us</u></a> for details.');
  } catch (e) { cBox.innerHTML = empty('book', 'Courses could not be loaded right now.'); }
  if (motion) motion.refresh(cBox.parentElement);

  try {
    const { data, error } = await sb.from('batches').select('id,name,batch_month,cover_path,courses(name)')
      .eq('is_published', true).order('batch_month', { ascending: false }).limit(3);
    if (error) throw error;
    bBox.innerHTML = (data && data.length) ? data.map((b) => `
      <a class="batch-card" href="gallery.html?batch=${esc(b.id)}">
        <div class="batch-cover">${b.cover_path ? `<img src="${esc(pub(b.cover_path))}" alt="${esc(b.name)} batch photo" loading="lazy">` : ph(b.name)}</div>
        <div class="batch-info"><div class="when">${esc(monthLabel(b.batch_month))}</div><h3>${esc(b.name)}</h3>
        <p style="color:var(--muted);font-size:.9rem;margin-top:.3rem">${esc(b.courses?.name || '')}</p></div>
      </a>`).join('') : empty('image', 'Batch photos will appear here once they are published.');
  } catch (e) { bBox.innerHTML = empty('image', 'Gallery could not be loaded right now.'); }
  if (motion) motion.refresh(bBox.parentElement);
})();
