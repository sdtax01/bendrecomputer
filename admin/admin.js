/* Bendre Computer Typing Institute — admin dashboard */
(function () {
  const cfg = window.BCTI_CONFIG || {};
  const app = document.getElementById('app');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (s, r = document) => r.querySelector(s);

  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !window.supabase) {
    app.innerHTML = '<div class="login-wrap"><div class="login-card"><h1>Setup needed</h1><p class="lead" style="font-size:1rem">Add your Supabase URL and anon key in <code>assets/js/config.js</code>, then reload this page.</p></div></div>';
    return;
  }
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const BUCKET = 'gallery';
  const pub = (p) => (p ? sb.storage.from(BUCKET).getPublicUrl(p).data.publicUrl : '');
  const monthLabel = (d) => { if (!d) return ''; const [y, m] = String(d).split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }); };
  const slug = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2));

  let me = null, user = null, currentView = 'overview';

  function toast(msg, err) {
    const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 3800);
  }
  const fail = (e) => { console.error(e); toast(e.message || 'Something went wrong', true); };

  /* ---------- modal ---------- */
  function modal(html, wide) {
    const bg = document.createElement('div'); bg.className = 'overlay-bg';
    bg.innerHTML = `<div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
    const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    bg.addEventListener('mousedown', (e) => { if (e.target === bg) close(); });
    bg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    document.body.appendChild(bg);
    return { el: bg.firstChild, close };
  }

  /* ---------- images ---------- */
  const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const MAX_IN = 15 * 1024 * 1024;
  function checkFile(f) {
    if (!OK_TYPES.includes(f.type)) return `${f.name}: only JPG, PNG or WebP files are allowed`;
    if (f.size > MAX_IN) return `${f.name}: file is larger than 15 MB`;
    return null;
  }
  async function resize(file, max, q) {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();
    let blob = await new Promise((r) => c.toBlob(r, 'image/webp', q));
    if (!blob || blob.type !== 'image/webp') blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', q));
    return blob;
  }
  const ext = (b) => (b.type === 'image/webp' ? 'webp' : 'jpg');
  async function put(path, blob) {
    const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
    if (error) throw error;
    return path;
  }
  async function removeFiles(paths) {
    const p = paths.filter(Boolean);
    if (p.length) await sb.storage.from(BUCKET).remove(p);
  }
  // upload one optimised image (no thumbnail) under a folder
  async function uploadSingle(file, folder, max = 1600) {
    const err = checkFile(file); if (err) throw new Error(err);
    const blob = await resize(file, max, 0.84);
    return put(`${folder}/${uid()}.${ext(blob)}`, blob);
  }
  // upload full image + thumbnail for gallery
  async function uploadPhoto(file, batchId) {
    const err = checkFile(file); if (err) throw new Error(err);
    const id = uid();
    const full = await resize(file, 1800, 0.82), thumb = await resize(file, 520, 0.78);
    const image_path = await put(`batches/${batchId}/${id}.${ext(full)}`, full);
    const thumb_path = await put(`batches/${batchId}/thumbs/${id}.${ext(thumb)}`, thumb);
    return { image_path, thumb_path };
  }
  function bindPreview(input, holder) {
    input.addEventListener('change', () => {
      const f = input.files[0]; holder.innerHTML = '';
      if (!f) return;
      const e = checkFile(f); if (e) { toast(e, true); input.value = ''; return; }
      const img = document.createElement('img'); img.className = 'prev-img'; img.alt = 'Selected image preview';
      img.src = URL.createObjectURL(f); holder.appendChild(img);
    });
  }

  /* ---------- auth ---------- */
  function showLogin(msg) {
    app.innerHTML = `
    <div class="login-wrap"><form class="login-card" id="lf">
      <span class="logo-mark" style="display:grid;width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,var(--blue),var(--cyan));place-items:center;color:#fff;font-size:1.4rem">⌨</span>
      <h1>Staff sign in</h1><p class="sub" style="color:var(--muted);margin-bottom:18px">Bendre Computer Typing Institute</p>
      ${msg ? `<div class="setup-banner" role="alert">${esc(msg)}</div>` : ''}
      <div class="field" style="margin-bottom:14px"><label for="em">Email</label><input class="input" id="em" type="email" required autocomplete="username"></div>
      <div class="field" style="margin-bottom:20px"><label for="pw">Password</label><input class="input" id="pw" type="password" required autocomplete="current-password"></div>
      <button class="btn btn-primary" style="width:100%" type="submit">Sign in</button>
      <p style="margin-top:16px;text-align:center"><a href="../" style="color:var(--blue)">← Back to website</a></p>
    </form></div>`;
    $('#lf').addEventListener('submit', async (e) => {
      e.preventDefault();
      const b = $('button', e.target); b.disabled = true; b.textContent = 'Signing in…';
      const { error } = await sb.auth.signInWithPassword({ email: $('#em').value.trim(), password: $('#pw').value });
      if (error) {
        const m = String(error.message || '');
        showLogin(/confirm/i.test(m) ? 'This email is not confirmed yet. In Supabase → Authentication → Users, confirm the user (or delete and re-add it with "Auto Confirm User" ticked).'
          : /invalid login/i.test(m) ? 'Email or password is incorrect. If you are sure they are right, reset the password in Supabase → Authentication → Users.'
          : 'Sign-in failed: ' + m);
        return;
      }
      boot();
    });
  }

  async function boot() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return showLogin();
    user = session.user;
    const { data, error } = await sb.from('admin_users').select('*').eq('user_id', user.id).maybeSingle();
    if (error) { await sb.auth.signOut(); return showLogin('Signed in, but the database could not be read: ' + error.message + ' — run schema.sql in the Supabase SQL Editor first.'); }
    if (!data) { await sb.auth.signOut(); return showLogin('Signed in, but this user is not in the admin_users table yet. Run the "insert into public.admin_users" SQL in the Supabase SQL Editor, then try again.'); }
    me = data;
    shell();
    go('overview');
  }

  /* ---------- shell ---------- */
  const NAV = [
    ['overview', 'Dashboard Overview'], ['courses', 'Courses Management'], ['batches', 'Batch Management'],
    ['gallery', 'Student Gallery'], ['enquiries', 'Admission Enquiries'],
    ['contact', 'Contact Information', true], ['content', 'Website Content', true], ['seo', 'SEO Settings', true],
    ['profile', 'Admin Profile']
  ];
  function shell() {
    const items = NAV.filter((n) => !n[2] || me.role === 'admin');
    app.innerHTML = `
    <div class="topbar"><b>Bendre Admin</b><button id="menu">Menu</button></div>
    <div class="adm">
      <aside class="side" id="side">
        <div class="logo"><span class="logo-mark" aria-hidden="true">⌨</span><span>Bendre<small>Admin</small></span></div>
        <nav>${items.map(([k, l]) => `<button data-v="${k}">${l}</button>`).join('')}<button data-v="logout">Logout</button></nav>
        <div class="who">${esc(user.email)}<br>Role: ${esc(me.role)}</div>
      </aside>
      <main class="main" id="view"></main>
    </div>`;
    $('#menu').addEventListener('click', () => $('#side').classList.toggle('open'));
    $('#side').addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-v]'); if (!b) return;
      $('#side').classList.remove('open');
      if (b.dataset.v === 'logout') { await sb.auth.signOut(); me = null; return showLogin(); }
      go(b.dataset.v);
    });
  }
  const V = () => $('#view');
  function go(v, arg) {
    currentView = v;
    document.querySelectorAll('#side nav button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    V().innerHTML = '<p>Loading…</p>';
    ({ overview, courses, batches, gallery, enquiries, contact: () => settings('contact'), content: contentView, seo: () => settings('seo'), profile }[v])(arg).catch(fail);
    window.scrollTo({ top: 0 });
  }

  /* ---------- overview ---------- */
  async function overview() {
    const { data, error } = await sb.rpc('dashboard_counts'); if (error) throw error;
    const cards = [['Total Courses', data.courses], ['Active Batches', data.active_batches], ['Total Gallery Photos', data.photos], ['New Admission Enquiries', data.new_enquiries], ['Confirmed Admissions', data.confirmed]];
    V().innerHTML = `<h1>Dashboard</h1><p class="sub">Welcome back. Changes you make here appear on the live website immediately.</p>
    <div class="stats">${cards.map(([l, n]) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`).join('')}</div>
    <div class="panel"><h3>Quick actions</h3><div class="row-actions" style="margin-top:12px">
      <button class="btn btn-primary btn-sm" data-go="batches">Create a batch</button>
      <button class="btn btn-ghost btn-sm" data-go="gallery">Upload photos</button>
      <button class="btn btn-ghost btn-sm" data-go="enquiries">View enquiries</button>
      <a class="btn btn-ghost btn-sm" href="../" target="_blank" rel="noopener">Open website</a></div></div>`;
    V().querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
  }

  /* ---------- courses ---------- */
  async function courses() {
    const { data, error } = await sb.from('courses').select('*').order('sort_order'); if (error) throw error;
    V().innerHTML = `<div class="bar"><div><h1>Courses</h1><p class="sub" style="margin:0">Only published courses are visible to visitors. Edit the sample entries to match what you really offer, then publish.</p></div>
      <button class="btn btn-primary" id="add">+ Add course</button></div>
    <div class="panel tbl-wrap"><table class="tbl"><thead><tr><th></th><th>Course</th><th>Category</th><th>Duration</th><th>Status</th><th></th></tr></thead><tbody>
    ${data.map((c) => `<tr><td>${c.image_path ? `<img class="thumb" src="${esc(pub(c.image_path))}" alt="">` : '<div class="thumb"></div>'}</td>
      <td><b>${esc(c.name)}</b><div class="hint">${esc(c.short_description || '')}</div></td><td>${esc(c.category || '—')}</td><td>${esc(c.duration || '—')}</td>
      <td><span class="pill ${c.is_published ? 'ok' : 'draft'}">${c.is_published ? 'Published' : 'Draft'}</span></td>
      <td><div class="row-actions"><button class="btn btn-ghost btn-sm" data-e="${c.id}">Edit</button>
      <button class="btn btn-ghost btn-sm" data-p="${c.id}">${c.is_published ? 'Unpublish' : 'Publish'}</button>
      <button class="btn btn-danger btn-sm" data-d="${c.id}">Delete</button></div></td></tr>`).join('') || '<tr><td colspan="6">No courses yet.</td></tr>'}
    </tbody></table></div>`;
    $('#add').addEventListener('click', () => courseForm(null));
    $('.tbl-wrap', V()).addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b || currentView !== 'courses') return;
      const c = data.find((x) => x.id === (b.dataset.e || b.dataset.p || b.dataset.d)); if (!c) return;
      if (b.dataset.e) courseForm(c);
      if (b.dataset.p) { const { error: er } = await sb.from('courses').update({ is_published: !c.is_published }).eq('id', c.id); if (er) return fail(er); go('courses'); }
      if (b.dataset.d && confirm(`Delete the course "${c.name}"? This cannot be undone.`)) {
        const { error: er } = await sb.from('courses').delete().eq('id', c.id);
        if (er) return fail(/foreign key|batches/i.test(er.message) ? new Error('This course still has batches. Delete or move those batches first.') : er);
        await removeFiles([c.image_path]); toast('Course deleted'); go('courses');
      }
    });
  }

  function courseForm(c) {
    const m = modal(`<h2>${c ? 'Edit' : 'Add'} course</h2><form id="cf"><div class="fgrid">
      <div class="field"><label>Course name *</label><input class="input" name="name" required maxlength="120" value="${esc(c?.name)}"></div>
      <div class="field"><label>Category</label><input class="input" name="category" maxlength="60" value="${esc(c?.category)}" placeholder="e.g. Typing"></div>
      <div class="field full"><label>Short description</label><textarea class="input" name="short_description" rows="2" maxlength="300">${esc(c?.short_description)}</textarea></div>
      <div class="field full"><label>Full description</label><textarea class="input" name="full_description" rows="4">${esc(c?.full_description)}</textarea></div>
      <div class="field full"><label>Skills covered (one per line)</label><textarea class="input" name="skills" rows="3">${esc((c?.skills || []).join('\n'))}</textarea></div>
      <div class="field"><label>Duration</label><input class="input" name="duration" maxlength="60" value="${esc(c?.duration)}" placeholder="Fill in the real duration"></div>
      <div class="field"><label>Eligibility</label><input class="input" name="eligibility" maxlength="120" value="${esc(c?.eligibility)}"></div>
      <div class="field"><label>Course fee (optional)</label><input class="input" name="fee" maxlength="60" value="${esc(c?.fee)}" placeholder="Leave blank to hide"></div>
      <div class="field"><label>Display order</label><input class="input" name="sort_order" type="number" value="${c?.sort_order ?? 0}"></div>
      <div class="field full"><label>Course image (JPG, PNG or WebP)</label><input type="file" name="image" accept="image/jpeg,image/png,image/webp">
        <div id="pv">${c?.image_path ? `<img class="prev-img" src="${esc(pub(c.image_path))}" alt="Current course image">` : ''}</div></div>
      <label class="check"><input type="checkbox" name="admission_open" ${c?.admission_open !== false ? 'checked' : ''}> Admission open</label>
      <label class="check"><input type="checkbox" name="is_published" ${c?.is_published ? 'checked' : ''}> Published (visible on website)</label>
    </div><div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" type="submit">Save course</button></div></form>`);
    const f = $('#cf', m.el); bindPreview(f.elements.image, $('#pv', m.el));
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); const btn = $('button[type=submit]', f); btn.disabled = true; btn.textContent = 'Saving…';
      try {
        const g = (n) => f.elements[n].value.trim();
        const row = {
          name: g('name'), category: g('category') || null, short_description: g('short_description') || null,
          full_description: g('full_description') || null, skills: g('skills').split('\n').map((s) => s.trim()).filter(Boolean),
          duration: g('duration') || null, eligibility: g('eligibility') || null, fee: g('fee') || null,
          sort_order: parseInt(g('sort_order'), 10) || 0, admission_open: f.elements.admission_open.checked, is_published: f.elements.is_published.checked
        };
        if (!row.name) throw new Error('Course name is required');
        let oldImg = null;
        const file = f.elements.image.files[0];
        if (file) { row.image_path = await uploadSingle(file, 'courses', 1400); oldImg = c?.image_path; }
        if (c) { const { error } = await sb.from('courses').update(row).eq('id', c.id); if (error) throw error; }
        else {
          row.slug = slug(row.name) || uid();
          let { error } = await sb.from('courses').insert(row);
          if (error && /duplicate|unique/i.test(error.message)) { row.slug += '-' + Math.random().toString(36).slice(2, 6); ({ error } = await sb.from('courses').insert(row)); }
          if (error) throw error;
        }
        if (oldImg) await removeFiles([oldImg]);
        toast('Course saved'); m.close(); go('courses');
      } catch (er) { fail(er); btn.disabled = false; btn.textContent = 'Save course'; }
    });
  }

  /* ---------- batches ---------- */
  async function batches() {
    const [{ data: bs, error }, { data: cs }] = await Promise.all([
      sb.from('batches').select('*,courses(name),gallery_photos(count)').order('batch_month', { ascending: false }),
      sb.from('courses').select('id,name').order('sort_order')]);
    if (error) throw error;
    V().innerHTML = `<div class="bar"><div><h1>Batches</h1><p class="sub" style="margin:0">Each batch belongs to a course and holds its own photo gallery.</p></div>
      <button class="btn btn-primary" id="add">+ New batch</button></div>
    <div class="panel tbl-wrap"><table class="tbl"><thead><tr><th></th><th>Batch</th><th>Course</th><th>Month</th><th>Photos</th><th>Status</th><th></th></tr></thead><tbody>
    ${bs.map((b) => `<tr><td>${b.cover_path ? `<img class="thumb" src="${esc(pub(b.cover_path))}" alt="">` : '<div class="thumb"></div>'}</td>
      <td><b>${esc(b.name)}</b></td><td>${esc(b.courses?.name || '')}</td><td>${esc(monthLabel(b.batch_month))}</td><td>${b.gallery_photos?.[0]?.count || 0}</td>
      <td><span class="pill ${b.is_published ? 'ok' : 'draft'}">${b.is_published ? 'Published' : 'Draft'}</span></td>
      <td><div class="row-actions"><button class="btn btn-ghost btn-sm" data-ph="${b.id}">Photos</button>
      <button class="btn btn-ghost btn-sm" data-e="${b.id}">Edit</button>
      <button class="btn btn-ghost btn-sm" data-p="${b.id}">${b.is_published ? 'Unpublish' : 'Publish'}</button>
      <button class="btn btn-danger btn-sm" data-d="${b.id}">Delete</button></div></td></tr>`).join('') || '<tr><td colspan="7">No batches yet — create your first one.</td></tr>'}
    </tbody></table></div>`;
    $('#add').addEventListener('click', () => { if (!cs.length) return toast('Add a course first.', true); batchForm(null, cs); });
    $('.tbl-wrap', V()).addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b || currentView !== 'batches') return;
      const id = b.dataset.ph || b.dataset.e || b.dataset.p || b.dataset.d; const bt = bs.find((x) => x.id === id); if (!bt) return;
      if (b.dataset.ph) { go('gallery', bt.id); }
      if (b.dataset.e) batchForm(bt, cs);
      if (b.dataset.p) { const { error: er } = await sb.from('batches').update({ is_published: !bt.is_published }).eq('id', bt.id); if (er) return fail(er); go('batches'); }
      if (b.dataset.d && confirm(`Delete batch "${bt.name}" and ALL its photos? This cannot be undone.`)) {
        try {
          const { data: ph } = await sb.from('gallery_photos').select('image_path,thumb_path').eq('batch_id', bt.id);
          const { error: er } = await sb.from('batches').delete().eq('id', bt.id); if (er) throw er;
          await removeFiles([bt.cover_path, ...(ph || []).flatMap((p) => [p.image_path, p.thumb_path])]);
          toast('Batch deleted'); go('batches');
        } catch (er) { fail(er); }
      }
    });
  }

  function batchForm(b, cs) {
    const month = b?.batch_month ? b.batch_month.slice(0, 7) : '';
    const m = modal(`<h2>${b ? 'Edit' : 'New'} batch</h2><form id="bf"><div class="fgrid">
      <div class="field"><label>Course *</label><select class="input" name="course_id" required>${cs.map((c) => `<option value="${c.id}" ${b?.course_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Month and year *</label><input class="input" type="month" name="month" required value="${month}"></div>
      <div class="field full"><label>Batch name *</label><input class="input" name="name" required maxlength="120" value="${esc(b?.name)}" placeholder="e.g. July 2026 — GCC-TBC Batch"></div>
      <div class="field full"><label>Description / achievements</label><textarea class="input" name="description" rows="3">${esc(b?.description)}</textarea></div>
      <div class="field full"><label>Cover photo</label><input type="file" name="cover" accept="image/jpeg,image/png,image/webp"><div id="pv">${b?.cover_path ? `<img class="prev-img" src="${esc(pub(b.cover_path))}" alt="Current cover">` : ''}</div></div>
      <label class="check full"><input type="checkbox" name="is_published" ${b?.is_published ? 'checked' : ''}> Published (visible on website)</label>
    </div><div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" type="submit">Save batch</button></div></form>`);
    const f = $('#bf', m.el); bindPreview(f.elements.cover, $('#pv', m.el));
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); const btn = $('button[type=submit]', f); btn.disabled = true; btn.textContent = 'Saving…';
      try {
        const row = { course_id: f.elements.course_id.value, name: f.elements.name.value.trim(), batch_month: f.elements.month.value + '-01',
          description: f.elements.description.value.trim() || null, is_published: f.elements.is_published.checked };
        if (!row.name) throw new Error('Batch name is required');
        let old = null; const file = f.elements.cover.files[0];
        if (file) {
          const folder = `batches/${b?.id || 'new'}`;
          row.cover_path = await uploadSingle(file, folder, 1400); old = b?.cover_path;
        }
        if (b) { const { error } = await sb.from('batches').update(row).eq('id', b.id); if (error) throw error; }
        else { const { error } = await sb.from('batches').insert(row); if (error) throw error; }
        if (old) await removeFiles([old]);
        toast('Batch saved'); m.close(); go('batches');
      } catch (er) { fail(er); btn.disabled = false; btn.textContent = 'Save batch'; }
    });
  }

  /* ---------- gallery manager ---------- */
  async function gallery(batchId) {
    const { data: bs, error } = await sb.from('batches').select('id,name,batch_month,is_published,courses(name)').order('batch_month', { ascending: false });
    if (error) throw error;
    const sel = batchId || (bs[0] && bs[0].id);
    V().innerHTML = `<h1>Student Gallery</h1><p class="sub">Upload, caption, reorder and publish photos batch by batch.</p>
    ${bs.length ? `<div class="panel"><div class="filters"><select class="input" id="bsel">${bs.map((b) => `<option value="${b.id}" ${b.id === sel ? 'selected' : ''}>${esc(monthLabel(b.batch_month))} — ${esc(b.name)}${b.is_published ? '' : ' (draft)'}</option>`).join('')}</select>
      <button class="btn btn-ghost btn-sm" id="prev">Preview gallery</button><button class="btn btn-primary btn-sm" id="pubtog"></button></div>
      <div class="drop" id="drop"><p><b>Drag photos here</b> or</p><p style="margin-top:8px"><label class="btn btn-primary btn-sm" style="cursor:pointer">Choose photos<input type="file" id="files" multiple accept="image/jpeg,image/png,image/webp" hidden></label></p>
      <p class="hint">JPG, PNG or WebP, up to 15 MB each. Photos are optimised and thumbnails are created automatically.</p>
      <div class="prog" hidden id="pbar"><i></i></div><div class="upl-list" id="ulist"></div></div>
      <div class="pgrid" id="pgrid"></div></div>` : '<div class="empty"><div class="big">📸</div><p>Create a batch first, then add photos to it.</p><p style="margin-top:12px"><button class="btn btn-primary" id="mk">Create a batch</button></p></div>'}`;
    if (!bs.length) { $('#mk').addEventListener('click', () => go('batches')); return; }
    $('#bsel').addEventListener('change', (e) => go('gallery', e.target.value));
    const batch = bs.find((b) => b.id === sel);
    const pt = $('#pubtog'); pt.textContent = batch.is_published ? 'Unpublish batch' : 'Publish batch';
    pt.addEventListener('click', async () => { const { error: er } = await sb.from('batches').update({ is_published: !batch.is_published }).eq('id', sel); if (er) return fail(er); toast(batch.is_published ? 'Batch unpublished' : 'Batch published'); go('gallery', sel); });

    let photos = [];
    const load = async () => {
      const { data, error: er } = await sb.from('gallery_photos').select('*').eq('batch_id', sel).order('sort_order').order('created_at');
      if (er) throw er; photos = data || []; draw();
    };
    function draw() {
      const g = $('#pgrid');
      g.innerHTML = photos.length ? photos.map((p) => `<div class="pitem" draggable="true" data-id="${p.id}">
        <img src="${esc(pub(p.thumb_path))}" alt="${esc(p.caption || 'Photo')}" loading="lazy">
        <div class="pb"><input class="input" data-cap="${p.id}" value="${esc(p.caption)}" maxlength="200" placeholder="Add a caption…" aria-label="Caption">
        <div class="row-actions"><button class="btn btn-ghost" data-up="${p.id}" aria-label="Move earlier">←</button><button class="btn btn-ghost" data-dn="${p.id}" aria-label="Move later">→</button>
        <label class="btn btn-ghost" style="cursor:pointer">Replace<input type="file" data-rep="${p.id}" accept="image/jpeg,image/png,image/webp" hidden></label>
        <button class="btn btn-danger" data-del="${p.id}">Delete</button></div></div></div>`).join('') : '<div class="empty" style="grid-column:1/-1">No photos in this batch yet.</div>';
    }
    async function saveOrder() {
      await Promise.all(photos.map((p, i) => { p.sort_order = i; return sb.from('gallery_photos').update({ sort_order: i }).eq('id', p.id); }));
    }
    const grid = $('#pgrid');
    grid.addEventListener('change', async (e) => {
      const cap = e.target.dataset.cap, rep = e.target.dataset.rep;
      if (cap) { const { error: er } = await sb.from('gallery_photos').update({ caption: e.target.value.trim() || null }).eq('id', cap); if (er) fail(er); else toast('Caption saved'); }
      if (rep && e.target.files[0]) {
        const p = photos.find((x) => x.id === rep);
        try {
          toast('Replacing photo…'); const np = await uploadPhoto(e.target.files[0], sel);
          const { error: er } = await sb.from('gallery_photos').update(np).eq('id', rep); if (er) throw er;
          await removeFiles([p.image_path, p.thumb_path]); toast('Photo replaced'); load();
        } catch (er) { fail(er); }
      }
    });
    grid.addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const i = photos.findIndex((p) => p.id === (b.dataset.up || b.dataset.dn || b.dataset.del));
      if (i < 0) return;
      if (b.dataset.up || b.dataset.dn) {
        const j = b.dataset.up ? i - 1 : i + 1; if (j < 0 || j >= photos.length) return;
        [photos[i], photos[j]] = [photos[j], photos[i]]; draw(); try { await saveOrder(); } catch (er) { fail(er); }
      }
      if (b.dataset.del && confirm('Delete this photo permanently?')) {
        const p = photos[i]; const { error: er } = await sb.from('gallery_photos').delete().eq('id', p.id); if (er) return fail(er);
        await removeFiles([p.image_path, p.thumb_path]); toast('Photo deleted'); load();
      }
    });
    // drag to reorder
    let dragId = null;
    grid.addEventListener('dragstart', (e) => { const it = e.target.closest('.pitem'); if (!it) return; dragId = it.dataset.id; it.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; });
    grid.addEventListener('dragend', () => { dragId = null; grid.querySelectorAll('.pitem').forEach((x) => x.classList.remove('drag', 'over')); });
    grid.addEventListener('dragover', (e) => { if (dragId && e.target.closest('.pitem')) { e.preventDefault(); } });
    grid.addEventListener('drop', async (e) => {
      const it = e.target.closest('.pitem'); if (!it || !dragId || it.dataset.id === dragId) return; e.preventDefault();
      const from = photos.findIndex((p) => p.id === dragId), to = photos.findIndex((p) => p.id === it.dataset.id);
      const [m] = photos.splice(from, 1); photos.splice(to, 0, m); draw(); try { await saveOrder(); toast('Order saved'); } catch (er) { fail(er); }
    });

    // upload
    async function upload(fileList) {
      const files = [...fileList]; if (!files.length) return;
      const bar = $('#pbar'), fill = $('i', bar), list = $('#ulist'); bar.hidden = false; fill.style.width = '0'; list.innerHTML = '';
      let done = 0, base = photos.length ? Math.max(...photos.map((p) => p.sort_order)) + 1 : 0, ok = 0;
      for (const f of files) {
        const line = document.createElement('div'); line.textContent = `Uploading ${f.name}…`; list.appendChild(line);
        try {
          const pth = await uploadPhoto(f, sel);
          const { error: er } = await sb.from('gallery_photos').insert({ batch_id: sel, ...pth, sort_order: base++ });
          if (er) { await removeFiles([pth.image_path, pth.thumb_path]); throw er; }
          line.textContent = `✓ ${f.name}`; ok++;
        } catch (er) { line.className = 'bad'; line.textContent = `✗ ${er.message || f.name}`; }
        done++; fill.style.width = Math.round(done / files.length * 100) + '%';
      }
      toast(`${ok} of ${files.length} photo${files.length === 1 ? '' : 's'} uploaded`, ok === 0); load();
    }
    $('#files').addEventListener('change', (e) => { upload(e.target.files); e.target.value = ''; });
    const drop = $('#drop');
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => { if (e.dataTransfer.files.length) upload(e.dataTransfer.files); });

    $('#prev').addEventListener('click', () => {
      modal(`<h2>Preview — ${esc(batch.name)}</h2><p class="hint" style="margin-bottom:14px">${batch.is_published ? 'This batch is live.' : 'This batch is a draft and is not yet visible to visitors.'}</p>
        <div class="masonry">${photos.map((p) => `<div class="m-item" style="cursor:default"><img src="${esc(pub(p.thumb_path))}" alt="${esc(p.caption || '')}">${p.caption ? `<span class="cap" style="opacity:1">${esc(p.caption)}</span>` : ''}</div>`).join('') || '<div class="empty">No photos yet.</div>'}</div>
        <div class="modal-actions"><button class="btn btn-ghost" data-close>Close</button></div>`, true);
    });
    await load();
  }

  /* ---------- enquiries ---------- */
  const STATUSES = ['New', 'Contacted', 'Follow-up Required', 'Admission Confirmed', 'Closed'];
  async function enquiries() {
    const { data, error } = await sb.from('admission_enquiries').select('*').order('created_at', { ascending: false }).limit(2000);
    if (error) throw error;
    const courses = [...new Set(data.map((r) => r.course_name).filter(Boolean))];
    V().innerHTML = `<div class="bar"><div><h1>Admission Enquiries</h1><p class="sub" style="margin:0"><span id="cnt"></span></p></div><button class="btn btn-primary" id="exp">Export CSV (opens in Excel)</button></div>
    <div class="panel"><div class="filters">
      <input class="input" id="s" type="search" placeholder="Search name or mobile…" aria-label="Search">
      <select class="input" id="fc"><option value="">All courses</option>${courses.map((c) => `<option>${esc(c)}</option>`).join('')}</select>
      <select class="input" id="fs"><option value="">All statuses</option>${STATUSES.map((s) => `<option>${s}</option>`).join('')}</select>
      <select class="input" id="fk"><option value="">Admission + contact</option><option value="admission">Admission enquiries</option><option value="contact">Contact messages</option></select>
      <input class="input" id="d1" type="date" aria-label="From date"><input class="input" id="d2" type="date" aria-label="To date"></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Ref / Date</th><th>Student</th><th>Mobile</th><th>Course</th><th>Details</th><th>Status</th><th>Follow-up notes</th><th></th></tr></thead><tbody id="tb"></tbody></table></div></div>`;
    let rows = data;
    const fmt = (d) => new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
    const wa = (r) => { const n = (r.whatsapp || r.mobile).replace(/\D/g, ''); return `https://wa.me/91${n}?text=${encodeURIComponent(`Hello ${r.student_name}, this is Bendre Computer Typing Institute regarding your enquiry (${r.ref_no}).`)}`; };
    function filter() {
      const t = $('#s').value.trim().toLowerCase(), c = $('#fc').value, s = $('#fs').value, k = $('#fk').value, d1 = $('#d1').value, d2 = $('#d2').value;
      rows = data.filter((r) => (!t || r.student_name.toLowerCase().includes(t) || r.mobile.includes(t.replace(/\D/g, '') || '\u0000'))
        && (!c || r.course_name === c) && (!s || r.status === s) && (!k || r.kind === k)
        && (!d1 || new Date(r.created_at) >= new Date(d1 + 'T00:00:00')) && (!d2 || new Date(r.created_at) <= new Date(d2 + 'T23:59:59')));
      $('#cnt').textContent = `${rows.length} of ${data.length} shown`;
      $('#tb').innerHTML = rows.map((r) => `<tr>
        <td><b>${esc(r.ref_no)}</b><div class="hint">${esc(fmt(r.created_at))}</div>${r.kind === 'contact' ? '<span class="pill draft">Contact</span>' : ''}</td>
        <td><b>${esc(r.student_name)}</b><div class="hint">${esc(r.guardian_name ? 'Guardian: ' + r.guardian_name : '')}</div></td>
        <td><a href="tel:${esc(r.mobile)}">${esc(r.mobile)}</a>${r.whatsapp ? `<div class="hint">WA: ${esc(r.whatsapp)}</div>` : ''}${r.email ? `<div class="hint">${esc(r.email)}</div>` : ''}</td>
        <td>${esc(r.course_name || '—')}</td>
        <td style="max-width:240px"><div class="hint">${esc([r.qualification, r.preferred_timing].filter(Boolean).join(' · '))}</div>${esc(r.message || '')}</td>
        <td><select class="input" data-st="${r.id}" style="min-width:150px;padding:8px">${STATUSES.map((s) => `<option ${s === r.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
        <td><textarea class="input" rows="2" data-nt="${r.id}" style="min-width:180px;padding:8px" placeholder="Add a note…">${esc(r.follow_up_notes)}</textarea></td>
        <td><a class="btn btn-sm" style="background:#25d366;color:#fff" href="${esc(wa(r))}" target="_blank" rel="noopener">WhatsApp</a></td></tr>`).join('') || '<tr><td colspan="8">No enquiries match.</td></tr>';
    }
    ['s', 'fc', 'fs', 'fk', 'd1', 'd2'].forEach((id) => $('#' + id).addEventListener('input', filter));
    $('#tb').addEventListener('change', async (e) => {
      const id = e.target.dataset.st || e.target.dataset.nt; if (!id) return;
      const patch = e.target.dataset.st ? { status: e.target.value } : { follow_up_notes: e.target.value.trim() || null };
      const { error: er } = await sb.from('admission_enquiries').update(patch).eq('id', id); if (er) return fail(er);
      Object.assign(data.find((r) => r.id === id), patch); toast('Saved');
    });
    $('#exp').addEventListener('click', () => {
      const cols = [['ref_no', 'Reference'], ['created_at', 'Date'], ['kind', 'Type'], ['student_name', 'Student'], ['guardian_name', 'Guardian'], ['mobile', 'Mobile'], ['whatsapp', 'WhatsApp'], ['email', 'Email'], ['course_name', 'Course'], ['preferred_timing', 'Preferred timing'], ['qualification', 'Qualification'], ['message', 'Message'], ['status', 'Status'], ['follow_up_notes', 'Follow-up notes']];
      const q = (v) => { let s = String(v ?? ''); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
      const csv = '﻿' + [cols.map((c) => q(c[1])).join(',')].concat(rows.map((r) => cols.map(([k]) => q(k === 'created_at' ? fmt(r[k]) : r[k])).join(','))).join('\r\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      a.download = `enquiries-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
    filter();
  }

  /* ---------- settings ---------- */
  const FIELDS = {
    contact: { title: 'Contact Information', fields: [['institute_name', 'Institute name'], ['address', 'Address', 'area'], ['phone', 'Phone number'], ['whatsapp', 'WhatsApp number with country code (e.g. 919689418627)'], ['email', 'Email address'], ['opening_hours', 'Opening hours (one line per day/range)', 'area'], ['maps_query', 'Google Maps search text', 'area']] },
    home: { title: 'Homepage', fields: [['hero_title', 'Hero headline'], ['hero_text', 'Hero supporting text', 'area']] },
    about: { title: 'About Institute', fields: [['intro', 'Introduction', 'area'], ['vision', 'Vision', 'area'], ['mission', 'Mission', 'area'], ['teaching_approach', 'Teaching approach', 'area'], ['learning_environment', 'Learning environment', 'area']] },
    seo: { title: 'SEO Settings', fields: [['site_title', 'Homepage title (shown in Google results)'], ['site_description', 'Homepage description', 'area']] }
  };
  async function loadSetting(key) {
    const { data, error } = await sb.from('website_settings').select('value').eq('key', key).maybeSingle();
    if (error) throw error; return data?.value || {};
  }
  function settingsForm(key, val, extra = '') {
    const d = FIELDS[key];
    return `<form class="panel" data-key="${key}"><h3 style="margin-bottom:14px">${d.title}</h3><div class="fgrid">
      ${d.fields.map(([n, l, t]) => `<div class="field ${t === 'area' ? 'full' : ''}"><label>${esc(l)}</label>${t === 'area' ? `<textarea class="input" name="${n}" rows="3">${esc(val[n])}</textarea>` : `<input class="input" name="${n}" value="${esc(val[n])}">`}</div>`).join('')}
      ${extra}</div><div class="modal-actions"><button class="btn btn-primary" type="submit">Save changes</button></div></form>`;
  }
  async function saveSetting(form, key, merge) {
    const base = await loadSetting(key); const v = { ...base, ...(merge || {}) };
    FIELDS[key].fields.forEach(([n]) => { v[n] = form.elements[n].value.trim(); });
    const { error } = await sb.from('website_settings').upsert({ key, value: v }); if (error) throw error;
  }
  async function settings(key) {
    const val = await loadSetting(key);
    V().innerHTML = `<h1>${FIELDS[key].title}</h1><p class="sub">Changes appear on the live website straight away.</p>${settingsForm(key, val)}`;
    $('form', V()).addEventListener('submit', async (e) => { e.preventDefault(); try { await saveSetting(e.target, key); toast('Saved'); } catch (er) { fail(er); } });
  }
  async function contentView() {
    const [home, about] = await Promise.all([loadSetting('home'), loadSetting('about')]);
    const heroExtra = `<div class="field full"><label>Homepage banner photo (optional)</label><input type="file" id="hero" accept="image/jpeg,image/png,image/webp">
      <div id="hpv">${home.hero_image_url ? `<img class="prev-img" src="${esc(home.hero_image_url)}" alt="Current banner">` : ''}</div>
      ${home.hero_image_url ? '<label class="check" style="margin-top:8px"><input type="checkbox" id="hclear"> Remove current banner photo</label>' : ''}
      <p class="hint">Use a real photograph of your classroom or students. Without one, the homepage shows the animated keyboard.</p></div>`;
    V().innerHTML = `<h1>Website Content</h1><p class="sub">Edit the homepage banner and About page text.</p>${settingsForm('home', home, heroExtra)}${settingsForm('about', about)}`;
    const [fh, fa] = V().querySelectorAll('form');
    bindPreview($('#hero'), $('#hpv'));
    fh.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const merge = {}; const f = $('#hero').files[0];
        if (f) { const p = await uploadSingle(f, 'site', 1800); merge.hero_image_url = pub(p); }
        else if ($('#hclear') && $('#hclear').checked) merge.hero_image_url = '';
        await saveSetting(fh, 'home', merge); toast('Saved'); go('content');
      } catch (er) { fail(er); }
    });
    fa.addEventListener('submit', async (e) => { e.preventDefault(); try { await saveSetting(fa, 'about'); toast('Saved'); } catch (er) { fail(er); } });
  }

  /* ---------- profile ---------- */
  async function profile() {
    V().innerHTML = `<h1>Admin Profile</h1><p class="sub">Signed in as <b>${esc(user.email)}</b> · role <b>${esc(me.role)}</b></p>
    <form class="panel" id="pf" style="max-width:480px"><h3 style="margin-bottom:14px">Change password</h3>
      <div class="field" style="margin-bottom:12px"><label>New password (min. 8 characters)</label><input class="input" type="password" name="p1" minlength="8" required autocomplete="new-password"></div>
      <div class="field" style="margin-bottom:16px"><label>Confirm new password</label><input class="input" type="password" name="p2" minlength="8" required autocomplete="new-password"></div>
      <button class="btn btn-primary" type="submit">Update password</button></form>`;
    $('#pf').addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.target;
      if (f.p1.value !== f.p2.value) return toast('Passwords do not match', true);
      const { error } = await sb.auth.updateUser({ password: f.p1.value }); if (error) return fail(error);
      f.reset(); toast('Password updated');
    });
  }

  sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT' && me) { me = null; showLogin(); } });
  window.addEventListener('unhandledrejection', (e) => console.error(e.reason));
  boot().catch((e) => showLogin('Could not connect to Supabase: ' + (e && e.message ? e.message : e) + '. Check assets/js/config.js and your internet connection.'));
})();
