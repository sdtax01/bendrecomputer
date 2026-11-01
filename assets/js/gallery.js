(async function () {
  const { sb, esc, pub, monthLabel, reveal } = window.BCTI;
  await window.BCTI.ready;
  const $ = (id) => document.getElementById(id);
  const listView = $('list-view'), batchView = $('batch-view'), grid = $('batches');
  const PAGE = 24;
  let batches = [], photos = [], shown = 0, idx = 0, current = null;

  if (!sb) { grid.innerHTML = '<div class="empty" style="grid-column:1/-1">Connect Supabase to load the gallery.</div>'; return; }

  try {
    const { data, error } = await sb.from('batches')
      .select('id,name,batch_month,description,cover_path,course_id,courses(name),gallery_photos(count)')
      .eq('is_published', true).order('batch_month', { ascending: false });
    if (error) throw error;
    batches = (data || []).map((b) => ({ ...b, count: b.gallery_photos?.[0]?.count || 0 }));
  } catch (e) {
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1">The gallery could not be loaded. Please try again shortly.</div>';
    return;
  }

  // filters
  const courseSel = $('course-filter'), batchSel = $('batch-filter'), q = $('q');
  const courseNames = [...new Map(batches.map((b) => [b.course_id, b.courses?.name]).filter((x) => x[1])).entries()];
  courseNames.forEach(([id, n]) => courseSel.insertAdjacentHTML('beforeend', `<option value="${esc(id)}">${esc(n)}</option>`));
  batches.forEach((b) => batchSel.insertAdjacentHTML('beforeend', `<option value="${esc(b.id)}">${esc(monthLabel(b.batch_month))} — ${esc(b.name)}</option>`));
  [courseSel, batchSel, q].forEach((el) => el.addEventListener('input', renderList));

  function renderTimeline(rows) {
    $('timeline').innerHTML = rows.map((b) => `<a class="t-dot" href="?batch=${esc(b.id)}" data-open="${esc(b.id)}">${esc(monthLabel(b.batch_month))}</a>`).join('');
  }

  function renderList() {
    const t = q.value.trim().toLowerCase();
    const rows = batches.filter((b) =>
      (!courseSel.value || b.course_id === courseSel.value) &&
      (!batchSel.value || b.id === batchSel.value) &&
      (!t || `${b.name} ${b.courses?.name || ''} ${monthLabel(b.batch_month)}`.toLowerCase().includes(t)));
    renderTimeline(rows);
    grid.innerHTML = rows.length ? rows.map((b) => `
      <a class="batch-card reveal" href="?batch=${esc(b.id)}" data-open="${esc(b.id)}">
        <div class="batch-cover">${b.cover_path ? `<img src="${esc(pub(b.cover_path))}" alt="${esc(b.name)} batch cover photo" loading="lazy">` : '🎓'}</div>
        <div class="batch-info">
          <div class="when">${esc(monthLabel(b.batch_month))}</div>
          <h3>${esc(b.name)}</h3>
          <p style="color:var(--muted);font-size:.9rem">${esc(b.courses?.name || '')} · ${b.count} photo${b.count === 1 ? '' : 's'}</p>
          <span class="btn btn-ghost btn-sm" style="margin-top:12px">View Gallery</span>
        </div>
      </a>`).join('') :
      `<div class="empty" style="grid-column:1/-1"><div class="big">📸</div><p>${batches.length ? 'No batches match your filters.' : 'No batch galleries have been published yet. Please check back soon.'}</p></div>`;
    reveal();
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-open]');
    if (a) { e.preventDefault(); openBatch(a.dataset.open, true); }
  });
  $('back').addEventListener('click', () => showList(true));
  window.addEventListener('popstate', route);

  function showList(push) {
    batchView.hidden = true; listView.hidden = false; current = null;
    $('g-title').textContent = 'Every batch has a story';
    $('g-lead').textContent = 'Browse photographs batch by batch.';
    if (push) history.pushState({}, '', location.pathname);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function openBatch(id, push) {
    const b = batches.find((x) => x.id === id);
    if (!b) return showList(false);
    current = b; listView.hidden = true; batchView.hidden = false;
    $('g-title').textContent = b.name;
    $('g-lead').textContent = `${monthLabel(b.batch_month)} · ${b.courses?.name || ''}${b.description ? ' — ' + b.description : ''}`;
    if (push) history.pushState({ id }, '', `?batch=${id}`);
    window.scrollTo({ top: 0 });
    $('photos').innerHTML = '<div class="skel"></div><div class="skel"></div>';
    $('more').hidden = true;
    try {
      const { data, error } = await sb.from('gallery_photos').select('id,image_path,thumb_path,caption')
        .eq('batch_id', id).order('sort_order').order('created_at');
      if (error) throw error;
      photos = data || [];
    } catch (e) { $('photos').innerHTML = '<div class="empty">Photos could not be loaded.</div>'; return; }
    shown = 0; $('photos').innerHTML = '';
    if (!photos.length) { $('photos').innerHTML = '<div class="empty"><div class="big">🖼️</div><p>Photos for this batch will be added soon.</p></div>'; return; }
    more();
  }

  function more() {
    const slice = photos.slice(shown, shown + PAGE);
    $('photos').insertAdjacentHTML('beforeend', slice.map((p, i) => `
      <button class="m-item" data-i="${shown + i}" aria-label="Open photo${p.caption ? ': ' + esc(p.caption) : ''}">
        <img src="${esc(pub(p.thumb_path))}" alt="${esc(p.caption || (current.name + ' photo'))}" loading="lazy">
        ${p.caption ? `<span class="cap">${esc(p.caption)}</span>` : ''}
      </button>`).join(''));
    shown += slice.length;
    $('more').hidden = shown >= photos.length;
  }
  $('more').addEventListener('click', more);
  $('photos').addEventListener('click', (e) => { const b = e.target.closest('.m-item'); if (b) lb(+b.dataset.i); });

  // Lightbox
  const box = $('lb'), img = $('lb-img');
  function lb(i) {
    idx = (i + photos.length) % photos.length;
    const p = photos[idx];
    img.src = pub(p.image_path); img.alt = p.caption || (current ? current.name + ' photo' : 'Student photo');
    $('lb-cap').textContent = p.caption || '';
    $('lb-count').textContent = `${idx + 1} / ${photos.length}`;
    box.classList.add('open'); document.body.style.overflow = 'hidden';
    // preload neighbours
    [1, -1].forEach((d) => { const n = photos[(idx + d + photos.length) % photos.length]; new Image().src = pub(n.image_path); });
  }
  function close() { box.classList.remove('open'); document.body.style.overflow = ''; }
  $('lb-close').addEventListener('click', close);
  $('lb-prev').addEventListener('click', () => lb(idx - 1));
  $('lb-next').addEventListener('click', () => lb(idx + 1));
  box.addEventListener('click', (e) => { if (e.target === box) close(); });
  document.addEventListener('keydown', (e) => {
    if (!box.classList.contains('open')) return;
    if (e.key === 'Escape') close(); if (e.key === 'ArrowLeft') lb(idx - 1); if (e.key === 'ArrowRight') lb(idx + 1);
  });
  let x0 = null;
  box.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  box.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 45) lb(idx + (dx < 0 ? 1 : -1));
  });

  function route() {
    const id = new URLSearchParams(location.search).get('batch');
    if (id) openBatch(id, false); else showList(false);
  }
  renderList();
  route();
})();
