(async function () {
  const { sb, esc, pub, reveal } = window.BCTI;
  await window.BCTI.ready;
  const list = document.getElementById('list'), chips = document.getElementById('chips'), q = document.getElementById('q');
  let courses = [], cat = 'All';

  if (!sb) { list.innerHTML = '<div class="empty" style="grid-column:1/-1">Connect Supabase to load courses.</div>'; return; }

  try {
    const { data, error } = await sb.from('courses').select('*').eq('is_published', true).order('sort_order');
    if (error) throw error;
    courses = data || [];
  } catch (e) {
    list.innerHTML = '<div class="empty" style="grid-column:1/-1">Courses could not be loaded. Please try again shortly.</div>';
    return;
  }

  const cats = ['All', ...new Set(courses.map((c) => c.category).filter(Boolean))];
  chips.innerHTML = cats.length > 2 ? cats.map((c) => `<button class="chip${c === cat ? ' on' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('') : '';
  chips.addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    cat = b.dataset.c;
    chips.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === b));
    render();
  });
  q.addEventListener('input', render);

  function card(c) {
    const skills = (c.skills || []).filter(Boolean);
    return `
    <article class="card course-card" id="${esc(c.slug)}">
      <div class="course-img">${c.image_path ? `<img src="${esc(pub(c.image_path))}" alt="${esc(c.name)} course at Bendre Computer Typing Institute" loading="lazy">` : '⌨'}</div>
      <div class="course-body">
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${c.category ? `<span class="tag">${esc(c.category)}</span>` : ''}
          ${c.admission_open ? '' : '<span class="tag closed">Admission closed</span>'}
        </div>
        <h3>${esc(c.name)}</h3>
        <p style="color:var(--muted)">${esc(c.short_description || '')}</p>
        <div class="meta">${c.duration ? `<span>⏱ ${esc(c.duration)}</span>` : ''}${c.fee ? `<span>₹ ${esc(c.fee)}</span>` : ''}</div>
        <div class="details" id="d-${esc(c.id)}">
          ${c.full_description ? `<p>${esc(c.full_description)}</p>` : ''}
          ${skills.length ? `<p style="margin-top:8px"><b>Skills covered</b></p><ul>${skills.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
          ${c.eligibility ? `<p style="margin-top:8px"><b>Eligibility:</b> ${esc(c.eligibility)}</p>` : ''}
          ${c.duration ? `<p><b>Duration:</b> ${esc(c.duration)}</p>` : ''}
          ${c.fee ? `<p><b>Fee:</b> ₹ ${esc(c.fee)}</p>` : ''}
        </div>
        <div class="course-actions">
          <button class="btn btn-ghost btn-sm" data-toggle="${esc(c.id)}" aria-expanded="false">View Details</button>
          <a class="btn btn-accent btn-sm" href="admissions.html?course=${esc(c.id)}">Enquire Now</a>
        </div>
      </div>
    </article>`;
  }

  function render() {
    const t = q.value.trim().toLowerCase();
    const rows = courses.filter((c) =>
      (cat === 'All' || c.category === cat) &&
      (!t || [c.name, c.short_description, c.category, ...(c.skills || [])].join(' ').toLowerCase().includes(t)));
    list.innerHTML = rows.length ? rows.map(card).join('') :
      `<div class="empty" style="grid-column:1/-1"><div class="big">🔎</div><p>${courses.length ? 'No courses match your search.' : 'Courses will be listed here soon. Please <a href="contact.html"><u>contact us</u></a> for details.'}</p></div>`;
    reveal();
  }

  list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-toggle]'); if (!b) return;
    const d = document.getElementById('d-' + b.dataset.toggle);
    const open = d.classList.toggle('open');
    b.textContent = open ? 'Hide Details' : 'View Details';
    b.setAttribute('aria-expanded', open);
  });

  render();
  // open a course directly from a link like courses.html#english-typing
  if (location.hash) {
    const el = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (el) { el.scrollIntoView({ block: 'center' }); const b = el.querySelector('[data-toggle]'); if (b) b.click(); }
  }
})();
