/* Admin: About Page editor (administrators only). Saves one JSON document in website_settings (key "about_page");
   the public About page reads it. Plugs into admin.js through window.BCTI_ADMIN_EXT. */
(function () {
  const EXT = window.BCTI_ADMIN_EXT;
  if (!EXT || !EXT.api) return;
  const { sb, esc, $, toast, fail, V, uid, checkFile, resize } = EXT.api;
  const D = window.BCTI_ABOUT_DEFAULTS || {};
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const pub = (p) => sb.storage.from('gallery').getPublicUrl(p).data.publicUrl;

  const fld = (n, l, v, t, ph) => `<div class="field ${t === 'area' ? 'full' : ''}"><label>${esc(l)}</label>${t === 'area' ? `<textarea class="input" data-f="${n}" rows="3" ${ph ? `placeholder="${esc(ph)}"` : ''}>${esc(v)}</textarea>` : `<input class="input" data-f="${n}" value="${esc(v)}" ${ph ? `placeholder="${esc(ph)}"` : ''}>`}</div>`;
  const photo = (v) => `<div class="field full"><label>Photo (JPG / PNG / WebP — square works best)</label><input type="file" accept="image/jpeg,image/png,image/webp" data-file>
    <input type="hidden" data-f="photo" value="${esc(v)}">${v ? `<img class="prev-img" src="${esc(v)}" alt=""><label class="check" style="margin-top:6px"><input type="checkbox" data-clear> Remove current photo</label>` : ''}</div>`;

  /* row templates for the repeatable lists */
  const ROWS = {
    timeline: (r) => fld('year', 'Year', r.year) + fld('title', 'Title', r.title) + fld('text', 'Description', r.text, 'area'),
    programs: (r) => fld('title', 'Course name', r.title) + `<div class="field"><label class="check"><input type="checkbox" data-f="featured" ${r.featured ? 'checked' : ''}> Featured (large flagship card)</label></div>`
      + fld('summary', 'Short description / focus', r.summary, 'area') + fld('tag', 'Badge (featured only)', r.tag) + fld('chips', 'Highlight chips, separated by ; (featured only)', r.chips)
      + fld('details', 'Detail lines — one per line, “Label | text” (featured only)', r.details, 'area') + fld('outcomes', 'Career outcomes (featured only)', r.outcomes),
    metrics: (r) => fld('value', 'Number (e.g. 35+, 5,000+, 95%) — leave empty to hide', r.value) + fld('label', 'Label', r.label),
    leaders: (r) => fld('name', 'Name', r.name) + fld('role', 'Designation / qualification', r.role) + fld('quote', 'Short quote (optional)', r.quote, 'area') + photo(r.photo || ''),
    staff: (r) => fld('name', 'Name', r.name) + fld('role', 'Designation', r.role) + fld('tag', 'Specialization tag (optional)', r.tag) + photo(r.photo || '')
  };
  const LABEL = { timeline: 'milestone', programs: 'course', metrics: 'counter', leaders: 'leader', staff: 'instructor' };
  const rowHtml = (kind, r) => `<div class="ap-row" data-kind="${kind}" style="border:1px solid var(--line);border-radius:.8rem;padding:.9rem;margin-bottom:.8rem;background:#fcfbf8">
    <div class="fgrid">${ROWS[kind](r)}</div>
    <div class="row-actions" style="margin-top:.6rem;display:flex;gap:.4rem;flex-wrap:wrap"><button type="button" class="btn btn-ghost btn-sm" data-mv="-1">↑ Up</button><button type="button" class="btn btn-ghost btn-sm" data-mv="1">↓ Down</button><button type="button" class="btn btn-ghost btn-sm" data-rm>Remove</button></div></div>`;
  const list = (kind, title, rows, hint) => `<div class="panel"><h3 style="margin-bottom:6px">${title}</h3>${hint ? `<p class="hint" style="margin:0 0 12px">${hint}</p>` : ''}
    <div data-list="${kind}">${rows.map((r) => rowHtml(kind, r)).join('')}</div><button type="button" class="btn btn-ghost btn-sm" data-add="${kind}">+ Add ${LABEL[kind]}</button></div>`;

  async function aboutPage() {
    const { data, error } = await sb.from('website_settings').select('value').eq('key', 'about_page').maybeSingle(); if (error) throw error;
    const saved = (data && data.value) || {}, A = {};
    Object.keys(D).forEach((k) => { A[k] = clone(k in saved ? saved[k] : D[k]); });
    ['hero', 'story', 'cta'].forEach((k) => { A[k] = Object.assign({}, clone(D[k] || {}), saved[k] || {}); });
    const h = A.hero, st = A.story, ct = A.cta;
    const hi = (key, label) => `<div class="field"><label>${label}</label><input type="file" accept="image/jpeg,image/png,image/webp" data-himg="${key}"><input type="hidden" data-h="${key}" value="${esc(h[key] || '')}">${h[key] ? `<img class="prev-img" src="${esc(h[key])}" alt=""><label class="check" style="margin-top:6px"><input type="checkbox" data-hclr="${key}"> Remove photo</label>` : ''}</div>`;
    V().innerHTML = `<h1>About Page</h1><p class="sub">Everything on the public “About Institute” page is edited here. Empty sections are hidden automatically. Changes appear on the live website as soon as you save.</p>
    <form id="apf">
      <div class="panel"><h3 style="margin-bottom:12px">1 · Top section</h3><div class="fgrid">
        <div class="field full"><label>Badge</label><input class="input" data-h="badge" value="${esc(h.badge)}"></div>
        <div class="field full"><label>Headline</label><input class="input" data-h="title" value="${esc(h.title)}"></div>
        <div class="field full"><label>Sub-headline</label><textarea class="input" data-h="text" rows="3">${esc(h.text)}</textarea></div>
        <div class="field"><label>Primary button text (opens Courses)</label><input class="input" data-h="cta1" value="${esc(h.cta1)}"></div>
        <div class="field"><label>Second button text (opens Admissions)</label><input class="input" data-h="cta2" value="${esc(h.cta2)}"></div>
        <div class="field"><label>Left caption (old classroom)</label><input class="input" data-h="cap_old" value="${esc(h.cap_old)}"></div>
        <div class="field"><label>Right caption (modern lab)</label><input class="input" data-h="cap_new" value="${esc(h.cap_new)}"></div>
        ${hi('img_old', 'Left photo — 1991 classroom (optional)')}${hi('img_new', 'Right photo — 2026 lab (optional)')}</div>
        <p class="hint">Without photos the page shows a simple illustration. Use real photographs when you have them.</p></div>
      <div class="panel"><h3 style="margin-bottom:12px">2 · Our story</h3><div class="fgrid">
        <div class="field full"><label>Heading</label><input class="input" data-s="heading" value="${esc(st.heading)}"></div>
        <div class="field full"><label>Story text</label><textarea class="input" data-s="text" rows="5">${esc(st.text)}</textarea></div></div></div>
      <div class="panel"><h3 style="margin-bottom:12px">3 · Timeline heading</h3><div class="field"><input class="input" data-top="timeline_heading" value="${esc(A.timeline_heading)}"></div></div>
      ${list('timeline', 'Timeline milestones', A.timeline, 'Shown in this order. Remove all rows to hide the timeline.')}
      <div class="panel"><h3 style="margin-bottom:12px">4 · Courses heading</h3><div class="field"><input class="input" data-top="programs_heading" value="${esc(A.programs_heading)}"></div></div>
      ${list('programs', 'Courses grid', A.programs, 'Tick “Featured” on one course to show it as the large flagship card.')}
      ${list('metrics', 'Numbers banner', A.metrics, 'A counter with an empty number is not shown. Add the real numbers (e.g. certified students, pass rate) only when you can stand behind them.')}
      <div class="panel"><h3 style="margin-bottom:12px">5 · People heading</h3><div class="fgrid"><div class="field full"><label>Heading</label><input class="input" data-top="team_heading" value="${esc(A.team_heading)}"></div>
        <div class="field full"><label>Sub-text</label><input class="input" data-top="team_text" value="${esc(A.team_text)}"></div></div></div>
      ${list('leaders', 'Leadership (large cards)', A.leaders, 'Founder, principal, academic head. The people section is hidden until you add at least one person.')}
      ${list('staff', 'Instructors & lab staff', A.staff)}
      <div class="panel"><h3 style="margin-bottom:12px">6 · Recognitions strip</h3><div class="field"><label>One line per item</label><textarea class="input" data-acc rows="3">${esc((A.accred || []).join('\n'))}</textarea></div>
        <p class="hint">Only list recognitions the institute actually holds.</p></div>
      <div class="panel"><h3 style="margin-bottom:12px">7 · Bottom banner</h3><div class="fgrid">
        <div class="field full"><label>Heading</label><input class="input" data-c="title" value="${esc(ct.title)}"></div>
        <div class="field full"><label>Text</label><input class="input" data-c="text" value="${esc(ct.text)}"></div>
        <div class="field"><label>Button 1 (opens Admissions)</label><input class="input" data-c="btn1" value="${esc(ct.btn1)}"></div>
        <div class="field"><label>Button 2 (opens WhatsApp)</label><input class="input" data-c="btn2" value="${esc(ct.btn2)}"></div></div></div>
      <div class="modal-actions" style="justify-content:flex-start;gap:.8rem"><button class="btn btn-primary" type="submit">Save About Page</button><a class="btn btn-ghost" href="../about.html" target="_blank" rel="noopener">View page</a></div>
    </form>`;
    const form = $('#apf');
    form.addEventListener('click', (e) => {
      const t = e.target, row = t.closest('.ap-row');
      if (t.matches('[data-add]')) { const k = t.dataset.add, box = form.querySelector(`[data-list="${k}"]`); box.insertAdjacentHTML('beforeend', rowHtml(k, k === 'programs' ? {} : {})); box.lastElementChild.scrollIntoView({ block: 'center' }); }
      else if (t.matches('[data-rm]') && row && confirm('Remove this entry?')) row.remove();
      else if (t.matches('[data-mv]') && row) { const d = +t.dataset.mv, sib = d < 0 ? row.previousElementSibling : row.nextElementSibling; if (sib) { d < 0 ? row.parentNode.insertBefore(row, sib) : row.parentNode.insertBefore(sib, row); } }
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
      try {
        const up = async (file) => { const er = checkFile(file); if (er) throw new Error(er); const b = await resize(file, 900, 0.84); const path = `about/${uid()}.${b.type === 'image/webp' ? 'webp' : 'jpg'}`; const { error: ue } = await sb.storage.from('gallery').upload(path, b, { contentType: b.type, cacheControl: '31536000', upsert: false }); if (ue) throw ue; return pub(path); };
        const out = {};
        out.hero = {}; for (const el of form.querySelectorAll('[data-h]')) out.hero[el.dataset.h] = el.value.trim();
        for (const inp of form.querySelectorAll('[data-himg]')) { const k = inp.dataset.himg, f = inp.files[0], clr = form.querySelector(`[data-hclr="${k}"]`); if (f) out.hero[k] = await up(f); else if (clr && clr.checked) out.hero[k] = ''; }
        out.story = {}; form.querySelectorAll('[data-s]').forEach((el) => { out.story[el.dataset.s] = el.value.trim(); });
        out.cta = {}; form.querySelectorAll('[data-c]').forEach((el) => { out.cta[el.dataset.c] = el.value.trim(); });
        form.querySelectorAll('[data-top]').forEach((el) => { out[el.dataset.top] = el.value.trim(); });
        out.accred = form.querySelector('[data-acc]').value.split('\n').map((x) => x.trim()).filter(Boolean);
        for (const kind of Object.keys(ROWS)) {
          out[kind] = [];
          for (const row of form.querySelectorAll(`[data-list="${kind}"] .ap-row`)) {
            const o = {}; row.querySelectorAll('[data-f]').forEach((el) => { o[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value.trim(); });
            const f = row.querySelector('[data-file]') && row.querySelector('[data-file]').files[0], clr = row.querySelector('[data-clear]');
            if (f) o.photo = await up(f); else if (clr && clr.checked) o.photo = '';
            if (Object.entries(o).some(([k, v]) => k !== 'featured' && k !== 'photo' && String(v).trim())) out[kind].push(o);
          }
        }
        const { error } = await sb.from('website_settings').upsert({ key: 'about_page', value: out }); if (error) throw error;
        toast('About page saved'); aboutPage().catch(fail);
      } catch (er) { fail(er); btn.disabled = false; }
    });
  }

  EXT.nav.push(['aboutpage', 'About Page', true]);   // true = administrators only
  EXT.views.aboutpage = aboutPage;
})();
