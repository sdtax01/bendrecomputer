(async function () {
  const { sb, esc, pub, monthLabel, reveal } = window.BCTI;
  const S = await window.BCTI.ready;

  // Admin-editable hero copy / photo
  if (S.home.hero_title) {
    const t = S.home.hero_title.trim();
    const i = t.lastIndexOf(' ');
    document.getElementById('hero-title').innerHTML = i > 0 ? `${esc(t.slice(0, i))} <em>${esc(t.slice(i + 1))}</em>` : esc(t);
  }
  if (S.home.hero_text) document.getElementById('hero-text').textContent = S.home.hero_text;
  if (S.home.hero_image_url) {
    const img = document.getElementById('hero-photo');
    img.src = S.home.hero_image_url; img.style.display = 'block';
    document.getElementById('kbd-card').classList.add('overlay');
  }
  if (S.seo.site_title) document.title = S.seo.site_title;
  if (S.seo.site_description) document.querySelector('meta[name=description]').setAttribute('content', S.seo.site_description);

  // Typing text effect
  const phrases = ['Learn.', 'Practice.', 'Improve.', 'Achieve.'];
  const el = document.getElementById('typer');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) el.textContent = phrases.join(' ');
  else {
    let p = 0, c = 0, del = false;
    (function tick() {
      const w = phrases[p];
      el.textContent = w.slice(0, c);
      if (!del && c < w.length) c++;
      else if (!del) { del = true; return setTimeout(tick, 1100); }
      else if (c > 0) c--;
      else { del = false; p = (p + 1) % phrases.length; }
      setTimeout(tick, del ? 45 : 95);
    })();
  }

  // Animated keyboard + speed gauge (decorative demo)
  const keysEl = document.getElementById('keys');
  const letters = 'QWERTYUIOPASDFGHJKL;ZXCVBNM,./'.slice(0, 30).split('');
  keysEl.innerHTML = letters.map((k) => `<div class="key">${esc(k)}</div>`).join('');
  const keys = [...keysEl.children];
  const gauge = document.getElementById('gauge'), gn = document.getElementById('gauge-n');
  if (!reduce) {
    let wpm = 0, dir = 1;
    setInterval(() => {
      keys.forEach((k) => k.classList.remove('on'));
      keys[Math.floor(Math.random() * keys.length)].classList.add('on');
      wpm += dir * (Math.random() * 3 + 1);
      if (wpm > 62) dir = -1; if (wpm < 28) dir = 1;
      gn.textContent = Math.round(wpm);
      gauge.style.setProperty('--p', Math.round(wpm / 80 * 100));
    }, 180);
  } else { gn.textContent = '45'; gauge.style.setProperty('--p', 56); }

  if (!sb) {
    document.getElementById('home-courses').innerHTML = '';
    document.getElementById('home-batches').innerHTML = '';
    return;
  }

  // Courses
  const cBox = document.getElementById('home-courses');
  try {
    const { data, error } = await sb.from('courses').select('*').eq('is_published', true).order('sort_order').limit(3);
    if (error) throw error;
    cBox.innerHTML = (data && data.length) ? data.map((c) => `
      <article class="card course-card reveal">
        <div class="course-img">${c.image_path ? `<img src="${esc(pub(c.image_path))}" alt="${esc(c.name)} course" loading="lazy">` : '⌨'}</div>
        <div class="course-body">
          ${c.category ? `<span class="tag">${esc(c.category)}</span>` : ''}
          <h3>${esc(c.name)}</h3>
          <p>${esc(c.short_description || '')}</p>
          ${c.duration ? `<div class="meta"><span>⏱ ${esc(c.duration)}</span></div>` : ''}
          <div class="course-actions">
            <a class="btn btn-ghost btn-sm" href="courses.html#${esc(c.slug)}">View Details</a>
            <a class="btn btn-accent btn-sm" href="admissions.html?course=${esc(c.id)}">Enquire Now</a>
          </div>
        </div>
      </article>`).join('') : `<div class="empty" style="grid-column:1/-1"><div class="big">📚</div><p>Courses will be listed here soon. Please <a href="contact.html"><u>contact us</u></a> for details.</p></div>`;
  } catch (e) { cBox.innerHTML = '<div class="empty" style="grid-column:1/-1">Courses could not be loaded right now.</div>'; }

  // Latest batches
  const bBox = document.getElementById('home-batches');
  try {
    const { data, error } = await sb.from('batches').select('id,name,batch_month,cover_path,courses(name),gallery_photos(count)')
      .eq('is_published', true).order('batch_month', { ascending: false }).limit(3);
    if (error) throw error;
    bBox.innerHTML = (data && data.length) ? data.map((b) => `
      <a class="batch-card reveal" href="gallery.html?batch=${esc(b.id)}">
        <div class="batch-cover">${b.cover_path ? `<img src="${esc(pub(b.cover_path))}" alt="${esc(b.name)} batch photo" loading="lazy">` : '🎓'}</div>
        <div class="batch-info"><div class="when">${esc(monthLabel(b.batch_month))}</div><h3>${esc(b.name)}</h3>
        <p style="color:var(--muted);font-size:.9rem">${esc(b.courses?.name || '')}</p></div>
      </a>`).join('') : `<div class="empty" style="grid-column:1/-1"><div class="big">📸</div><p>Batch photos will appear here once they are published.</p></div>`;
  } catch (e) { bBox.innerHTML = '<div class="empty" style="grid-column:1/-1">Gallery could not be loaded right now.</div>'; }
  reveal();
})();
