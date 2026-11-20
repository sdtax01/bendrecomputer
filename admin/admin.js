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
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { auth: { storageKey: 'bcti-staff-auth', storage: window.sessionStorage } });
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
    if (window.BCTI_NOTIFY) window.BCTI_NOTIFY.unmount();
    app.innerHTML = `
    <div class="login-wrap"><form class="login-card" id="lf">
      <span class="logo-mark"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"/></svg></span>
      <h1>Staff sign in</h1><p class="sub" style="color:var(--muted);margin-bottom:1.2rem">Bendre Computer Typing Institute</p>
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
    if (error) { await sb.auth.signOut({ scope: 'local' }); return showLogin('Signed in, but the database could not be read: ' + error.message + ' — run schema.sql in the Supabase SQL Editor first.'); }
    if (!data) { await sb.auth.signOut({ scope: 'local' }); return showLogin('Signed in, but this user is not in the admin_users table yet. Run the "insert into public.admin_users" SQL in the Supabase SQL Editor, then try again.'); }
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
    const items = NAV.slice(0, 5).concat(EXT.nav || [], NAV.slice(5)).filter((n) => !n[2] || me.role === 'admin');
    app.innerHTML = `
    <div class="topbar"><b>Bendre Admin</b><button id="menu">Menu</button></div>
    <div class="adm">
      <aside class="side" id="side">
        <div class="logo"><span class="logo-mark" aria-hidden="true"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"/></svg></span><span>Bendre<small>Admin</small></span></div>
        <nav>${items.map(([k, l]) => `<button data-v="${k}">${l}</button>`).join('')}<button data-v="logout">Logout</button></nav>
        <div class="who">${esc(user.email)}<br>Role: ${esc(me.role)}</div>
      </aside>
      <main class="main" id="view"></main>
    </div>`;
    $('#menu').addEventListener('click', () => $('#side').classList.toggle('open'));
    $('#side').addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-v]'); if (!b) return;
      $('#side').classList.remove('open');
      if (b.dataset.v === 'logout') { if (window.BCTI_NOTIFY) window.BCTI_NOTIFY.unmount(); await sb.auth.signOut({ scope: 'local' }); me = null; return showLogin(); }
      go(b.dataset.v);
    });
    /* notification bell (cosmetic add-on; the portal works the same without it) */
    if (window.BCTI_NOTIFY) window.BCTI_NOTIFY.mount({ sb, audience: 'admin', onOpen: (n, act) => {
      if (!EXT.views || !EXT.views.notifications) return;
      if (act === 'item' && n && n.student_id && EXT.views.studentDetail) return go('studentDetail', n.student_id);
      go('notifications');
    } });
  }
  const V = () => $('#view');
  function go(v, arg) {
    currentView = v;
    document.querySelectorAll('#side nav button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    V().innerHTML = '<p>Loading…</p>';
    ({ overview, courses, batches, gallery, enquiries, contact: () => settings('contact'), content: contentView, seo: () => settings('seo'), profile, ...(EXT.views || {}) }[v])(arg).catch(fail);
    window.scrollTo({ top: 0 });
  }

  /* ---------- overview ---------- */
  const ago = (t) => { const m = Math.max(0, Math.round((Date.now() - new Date(t)) / 60000)); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' hr ago' : Math.round(m / 1440) + ' day' + (m >= 2880 ? 's' : '') + ' ago'; };
  const rupee = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  const shortRs = (n) => n >= 1e7 ? (n / 1e7).toFixed(n % 1e7 ? 1 : 0) + 'Cr' : n >= 1e5 ? (n / 1e5).toFixed(n % 1e5 ? 1 : 0) + 'L' : n >= 1e3 ? (n / 1e3).toFixed(n % 1e3 ? 1 : 0) + 'k' : String(Math.round(n));
  const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');   // local date (not UTC)
  /* multi-series line chart: series = [{ name, color, vals }] */
  function lineChart(labels, series) {
    const W = 760, H = 280, L = 52, R = 16, T = 22, B = 34, n = labels.length;
    const top = Math.max(...series.flatMap((s) => s.vals), 0), raw = (top || 1000) / 4, mag = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / mag,
      max = 4 * mag * (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10);
    const x = (i) => L + (W - L - R) * (n === 1 ? .5 : i / (n - 1)), y = (v) => T + (H - T - B) * (1 - v / max);
    const path = (vals) => { const P = vals.map((v, i) => [x(i), y(v)]); let d = `M${P[0][0]},${P[0][1]}`;
      for (let i = 0; i < P.length - 1; i++) { const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2;
        d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${Math.min(H - B, Math.max(T, p1[1] + (p2[1] - p0[1]) / 6))} ${p2[0] - (p3[0] - p1[0]) / 6},${Math.min(H - B, Math.max(T, p2[1] - (p3[1] - p1[1]) / 6))} ${p2[0]},${p2[1]}`; }
      return { d, P }; };
    const grid = [0, 1, 2, 3, 4].map((k) => { const v = max * k / 4, yy = y(v); return `<line class="gl" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}"/><text x="${L - 8}" y="${yy + 4}" text-anchor="end">₹${shortRs(v)}</text>`; }).join('');
    const every = Math.ceil(n / 9), xl = labels.map((l, i) => (i % every === 0 || i === n - 1) ? `<text x="${x(i)}" y="${H - 10}" text-anchor="${n > 1 && i === n - 1 ? 'end' : n > 1 && i === 0 ? 'start' : 'middle'}">${esc(l)}</text>` : '').join('');
    const lines = series.map((s, k) => { const { d, P } = path(s.vals);
      return `<defs><linearGradient id="bv${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity=".18"/><stop offset="1" stop-color="${s.color}" stop-opacity="0"/></linearGradient></defs>
        <path d="${d} L${P[n - 1][0]},${H - B} L${P[0][0]},${H - B} Z" fill="url(#bv${k})"/><path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
        ${P.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${n > 40 ? 0 : 3.6}" fill="#fff" stroke="${s.color}" stroke-width="2"/><circle cx="${p[0]}" cy="${p[1]}" r="9" fill="transparent"><title>${esc(labels[i])} — ${esc(s.name)}: ${rupee(s.vals[i])}</title></circle>`).join('')}`; }).join('');
    return `<svg class="d-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Billed versus collected">${grid}${xl}${lines}</svg>`;
  }

  async function overview() {
    const { data, error } = await sb.rpc('dashboard_counts'); if (error) throw error;
    /* extra figures for the dashboard look — all best-effort; a missing table never breaks the page */
    const now = new Date(), iso = ymd, mStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const ok = (p) => Promise.resolve(p).then((r) => (r && !r.error ? r : null), () => null);
    const [enqNew, studs, pays, asg] = await Promise.all([
      ok(sb.from('admission_enquiries').select('student_name,course_name,kind,created_at').order('created_at', { ascending: false }).limit(4)),
      ok(sb.from('students').select('full_name,reg_no,created_at', { count: 'exact' }).order('created_at', { ascending: false }).limit(4)),
      ok(sb.from('fee_payments').select('amount,created_at,students(full_name)').gte('paid_on', iso(mStart)).order('created_at', { ascending: false }).limit(500)),
      ok(sb.from('assignments').select('title,due_date,courses(name)').gte('due_date', iso(now)).order('due_date').limit(4))]);
    const I = (k) => (window.DASH ? window.DASH.ico(k) : '');
    const cards = [['book', 'Total Courses', data.courses], ['users', 'Active Batches', data.active_batches], ['image', 'Total Gallery Photos', data.photos], ['inbox', 'New Admission Enquiries', data.new_enquiries], ['award', 'Confirmed Admissions', data.confirmed]];
    if (studs && studs.count != null) cards.push(['cap', 'Total Students', studs.count]);
    if (pays) cards.push(['wallet', 'Fees This Month', '₹' + pays.data.reduce((a, p) => a + Number(p.amount || 0), 0).toLocaleString('en-IN')]);
    const act = [];
    if (enqNew) enqNew.data.forEach((r) => act.push({ t: r.created_at, c: 'c4', i: 'inbox', h: (r.kind === 'admission' ? 'Admission request: ' : 'New enquiry: ') + r.student_name, s: r.course_name || 'General enquiry' }));
    if (studs) studs.data.forEach((r) => act.push({ t: r.created_at, c: 'c1', i: 'cap', h: 'New student registered', s: r.full_name + ' · ' + r.reg_no }));
    if (pays) pays.data.slice(0, 4).forEach((r) => act.push({ t: r.created_at, c: 'c3', i: 'wallet', h: 'Fee payment received', s: '₹' + Number(r.amount).toLocaleString('en-IN') + (r.students ? ' · ' + r.students.full_name : '') }));
    act.sort((p, q) => new Date(q.t) - new Date(p.t));
    const name = (me.full_name || user.email.split('@')[0] || 'Admin').split(' ')[0];
    const goBtns = [['batches', 'Create a batch', 'users'], ['gallery', 'Upload photos', 'image'], ['enquiries', 'View enquiries', 'inbox']];
    if (EXT.views && EXT.views.students) goBtns.push(['students', 'Manage students', 'cap']);
    V().innerHTML = `<div class="d-hero"><div class="d-welcome"><h1>Welcome back, <em>${esc(name)}!</em></h1><p>Changes you make here appear on the live website immediately. ✨</p>
        <div class="d-cta"><a class="d-btn" href="../" target="_blank" rel="noopener">Open website ${I('up')}</a></div></div>
      <div class="d-side"><small>${I('clock')}<span id="dday"></span></small><div class="d-clock" id="dclock"></div><div class="d-sub">${esc(me.role === 'admin' ? 'Administrator' : 'Staff')} dashboard</div></div></div>
    <div class="d-stats">${cards.map(([ic, l, n], i) => `<div class="d-stat c${(i % 6) + 1}"><span class="d-ico">${I(ic)}</span><div><span class="d-n">${n}</span><span class="d-l">${l}</span></div></div>`).join('')}</div>
    <div class="d-grid">
      <div class="d-card"><div class="d-head" style="flex-wrap:wrap"><h3>Billed vs Collected</h3>
        <div class="bvc-ctl"><label>From <input type="date" id="bf" value="${ymd(new Date(now.getFullYear(), now.getMonth() - 5, 1))}"></label><label>To <input type="date" id="bt" value="${ymd(now)}"></label><button type="button" class="d-btn bvc-go" id="bgo">Apply</button></div></div>
        <div class="bvc-pre"><button type="button" data-p="m">This month</button><button type="button" data-p="3">Last 3 months</button><button type="button" data-p="6">Last 6 months</button><button type="button" data-p="fy">This financial year</button></div>
        <div class="bvc-sum" id="bsum"></div><div id="bvc"><p class="d-empty">Loading…</p></div>
        <div class="bvc-leg"><span><i style="background:#4f46e5"></i>Billed</span><span><i style="background:#12b76a"></i>Collected</span><span class="hint" id="bnote"></span></div></div>
      <div class="d-card"><div class="d-head"><h3>Recent activity</h3><button class="d-link" data-go="enquiries">View all →</button></div><div class="d-list">${act.slice(0, 5).map((r) => `<div class="d-row"><span class="d-ico">${I(r.i)}</span><div><b>${esc(r.h)}</b><small>${esc(r.s)} · ${ago(r.t)}</small></div></div>`).join('') || '<p class="d-empty">No recent activity yet.</p>'}</div></div></div>
    <div class="d-grid">
      <div class="d-card"><div class="d-head"><h3>Quick actions</h3></div><div class="d-quick">${goBtns.map(([k, l, ic]) => `<button data-go="${k}">${I(ic)}${l}</button>`).join('')}</div></div>
      <div class="d-card"><div class="d-head"><h3>Upcoming assignment deadlines</h3>${EXT.views && EXT.views.assignments ? '<button class="d-link" data-go="assignments">View all →</button>' : ''}</div><div class="d-list">${asg && asg.data.length ? asg.data.map((a) => { const d = new Date(a.due_date + 'T00:00:00'); return `<div class="d-row"><div class="d-date" style="flex:none"><b>${d.getDate()}</b><span>${d.toLocaleDateString('en-IN', { month: 'short' })}</span></div><div><b>${esc(a.title)}</b><small>${esc(a.courses ? a.courses.name : '')}</small></div></div>`; }).join('') : '<p class="d-empty">No upcoming deadlines.</p>'}</div></div></div>`;
    V().querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
    /* Billed vs Collected: billed = course fees by enrolment date, collected = payments by payment date */
    async function loadBvc() {
      const f = document.getElementById('bf'), t = document.getElementById('bt'), box = document.getElementById('bvc'); if (!f || !box) return;
      const note = document.getElementById('bnote'); note.textContent = '';
      if (!f.value || !t.value) { note.textContent = 'Please choose both dates.'; return; }
      if (f.value > t.value) { note.textContent = '“From” date must be before “To” date.'; return; }
      const d0 = new Date(f.value + 'T00:00:00'), d1 = new Date(t.value + 'T00:00:00'), days = Math.round((d1 - d0) / 864e5) + 1;
      if (days > 1830) { note.textContent = 'Please choose a range of 5 years or less.'; return; }
      box.innerHTML = '<p class="d-empty">Loading…</p>';
      const [en, py] = await Promise.all([ok(sb.from('student_courses').select('total_fee,start_date').gte('start_date', f.value).lte('start_date', t.value).limit(10000)),
                                          ok(sb.from('fee_payments').select('amount,paid_on').gte('paid_on', f.value).lte('paid_on', t.value).limit(20000))]);
      if (!document.getElementById('bvc')) return;
      if (!en || !py) { box.innerHTML = '<p class="d-empty">Fee data is not available yet.</p>'; return; }
      const daily = days <= 45, keys = [], labels = [];
      if (daily) for (let d = new Date(d0); d <= d1; d.setDate(d.getDate() + 1)) { keys.push(ymd(d)); labels.push(d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })); }
      else for (let d = new Date(d0.getFullYear(), d0.getMonth(), 1); d <= d1; d.setMonth(d.getMonth() + 1)) { keys.push(ymd(d).slice(0, 7)); labels.push(d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })); }
      const kOf = (ds) => (daily ? ds : ds.slice(0, 7)), idx = Object.fromEntries(keys.map((k, i) => [k, i]));
      const billed = keys.map(() => 0), coll = keys.map(() => 0);
      en.data.forEach((r) => { const i = idx[kOf(r.start_date)]; if (i != null) billed[i] += Number(r.total_fee || 0); });
      py.data.forEach((r) => { const i = idx[kOf(r.paid_on)]; if (i != null) coll[i] += Number(r.amount || 0); });
      const tb = billed.reduce((a, b) => a + b, 0), tc = coll.reduce((a, b) => a + b, 0);
      document.getElementById('bsum').innerHTML = `<div><b>${rupee(tb)}</b><span>Billed</span></div><div><b style="color:#0d7a47">${rupee(tc)}</b><span>Collected</span></div><div><b style="color:${tb - tc > 0 ? '#c21d45' : '#0d7a47'}">${rupee(tb - tc)}</b><span>${tb - tc >= 0 ? 'Outstanding' : 'Extra collected'}</span></div>`;
      box.innerHTML = (tb || tc) ? lineChart(labels, [{ name: 'Billed', color: '#4f46e5', vals: billed }, { name: 'Collected', color: '#12b76a', vals: coll }]) : '<p class="d-empty">No billing or payments in this date range.</p>';
      note.textContent = daily ? 'Daily view' : 'Monthly view';
    }
    const bgo = document.getElementById('bgo'); if (bgo) bgo.addEventListener('click', loadBvc);
    V().querySelectorAll('.bvc-pre [data-p]').forEach((b) => b.addEventListener('click', () => {
      const p = b.dataset.p, n2 = new Date(); let a = new Date(n2.getFullYear(), n2.getMonth(), 1);
      if (p === '3' || p === '6') a = new Date(n2.getFullYear(), n2.getMonth() - (+p - 1), 1);
      if (p === 'fy') a = new Date(n2.getMonth() >= 3 ? n2.getFullYear() : n2.getFullYear() - 1, 3, 1);
      document.getElementById('bf').value = ymd(a); document.getElementById('bt').value = ymd(n2); loadBvc(); }));
    loadBvc();
    const tick = () => { const c = document.getElementById('dclock'); if (!c) return clearInterval(tm); const n = new Date(); c.textContent = n.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }); document.getElementById('dday').textContent = n.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); };
    const tm = setInterval(tick, 15000); tick();
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
      <div class="pgrid" id="pgrid"></div></div>` : '<div class="empty"><span class="big"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg></span><p>Create a batch first, then add photos to it.</p><p style="margin-top:12px"><button class="btn btn-primary" id="mk">Create a batch</button></p></div>'}`;
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
    const [{ data, error }, { data: linked }] = await Promise.all([
      sb.from('admission_enquiries').select('*').order('created_at', { ascending: false }).limit(2000),
      sb.from('students').select('id,enquiry_id,reg_no').not('enquiry_id', 'is', null)]);
    if (error) throw error;
    const stuBy = {}; (linked || []).forEach((x) => { stuBy[x.enquiry_id] = x; });
    const picked = new Set();
    const courses = [...new Set(data.map((r) => r.course_name).filter(Boolean))];
    V().innerHTML = `<div class="bar"><div><h1>Admission Enquiries</h1><p class="sub" style="margin:0"><span id="cnt"></span></p></div><div class="row-actions" style="align-items:center">
      <label class="check" style="margin:0"><input type="checkbox" id="selall"> Select all</label>
      <button class="btn btn-primary" id="bulk" disabled>Bulk Finalize Admission</button>
      <button class="btn btn-primary" id="exp">Export CSV (opens in Excel)</button></div></div>
    <div class="panel"><div class="filters">
      <input class="input" id="s" type="search" placeholder="Search name or mobile…" aria-label="Search">
      <select class="input" id="fc"><option value="">All courses</option>${courses.map((c) => `<option>${esc(c)}</option>`).join('')}</select>
      <select class="input" id="fs"><option value="">All statuses</option>${STATUSES.map((s) => `<option>${s}</option>`).join('')}</select>
      <select class="input" id="fk"><option value="">Admission + contact</option><option value="admission">Admission enquiries</option><option value="contact">Contact messages</option></select>
      <input class="input" id="d1" type="date" aria-label="From date"><input class="input" id="d2" type="date" aria-label="To date"></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th style="width:2rem"></th><th>Ref / Date</th><th>Student</th><th>Mobile</th><th>Course</th><th>Details</th><th>Status</th><th>Follow-up notes</th><th></th></tr></thead><tbody id="tb"></tbody></table></div></div>`;
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
        <td>${r.kind === 'admission' ? `<input type="checkbox" data-pick="${r.id}" aria-label="Select ${esc(r.student_name)}" ${picked.has(r.id) ? 'checked' : ''}>` : ''}</td>
        <td><b>${esc(r.ref_no)}</b><div class="hint">${esc(fmt(r.created_at))}</div>${r.kind === 'contact' ? '<span class="pill draft">Contact</span>' : ''}</td>
        <td><b>${esc(r.student_name)}</b><div class="hint">${esc(r.guardian_name ? 'Guardian: ' + r.guardian_name : '')}</div></td>
        <td><a href="tel:${esc(r.mobile)}">${esc(r.mobile)}</a>${r.whatsapp ? `<div class="hint">WA: ${esc(r.whatsapp)}</div>` : ''}${r.email ? `<div class="hint">${esc(r.email)}</div>` : ''}</td>
        <td>${esc(r.course_name || '—')}</td>
        <td style="max-width:15rem"><div class="hint">${esc([r.qualification, r.preferred_timing].filter(Boolean).join(' · '))}</div>${esc(r.message || '')}</td>
        <td><select class="input" data-st="${r.id}" style="min-width:9.5rem;padding:.5rem">${STATUSES.map((s) => `<option ${s === r.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
        <td><textarea class="input" rows="2" data-nt="${r.id}" style="min-width:11rem;padding:.5rem" placeholder="Add a note…">${esc(r.follow_up_notes)}</textarea></td>
        <td><div class="row-actions" style="flex-direction:column;align-items:stretch">
          ${stuBy[r.id] && r.status === 'Admission Confirmed' ? `<span class="pill ok" title="Student created">✔ ${esc(stuBy[r.id].reg_no)}</span><button class="btn btn-ghost btn-sm" data-stu="${stuBy[r.id].id}">View student</button>`
            : `<button class="btn btn-primary btn-sm" data-fin="${r.id}">Finalize Admission</button>`}
          <a class="btn btn-sm" style="background:#25d366;color:#fff" href="${esc(wa(r))}" target="_blank" rel="noopener">WhatsApp</a>
          <button class="btn btn-danger btn-sm" data-del="${r.id}">Delete Enquiry</button></div></td></tr>`).join('') || '<tr><td colspan="9">No enquiries match.</td></tr>';
      syncPick();
    }
    const pickable = () => rows.filter((r) => r.kind === 'admission' && !(stuBy[r.id] && r.status === 'Admission Confirmed'));
    function syncPick() {
      const n = pickable().filter((r) => picked.has(r.id)).length, all = pickable().length;
      $('#bulk').disabled = !n; $('#bulk').textContent = n ? `Bulk Finalize Admission (${n})` : 'Bulk Finalize Admission';
      $('#selall').checked = all > 0 && n === all; $('#selall').indeterminate = n > 0 && n < all;
    }
    $('#selall').addEventListener('change', (e) => { pickable().forEach((r) => (e.target.checked ? picked.add(r.id) : picked.delete(r.id))); filter(); });
    async function finalizeOne(r) {
      const run = async (dob, email) => {
        const { data: res, error: er } = await sb.rpc('finalize_admission', { p_enquiry: r.id, p_dob: dob || null, p_email: email || null });
        if (er) throw er;
        toast(`Admission finalized · Reg. ${res.reg_no}${res.enrolled ? ' · enrolled in ' + res.course : ''}`); go('enquiries');
      };
      if (stuBy[r.id]) { if (!confirm(`Finalize admission for ${r.student_name}?\nStudent ${stuBy[r.id].reg_no} will be activated${r.course_name ? ' and enrolled in ' + r.course_name : ''}.`)) return; return run().catch(fail); }
      const m = modal(`<h2>Finalize admission</h2><p class="sub" style="margin:0 0 1rem"><b>${esc(r.student_name)}</b> · ${esc(r.course_name || 'no course selected')}<br>This enquiry has no date of birth${r.email ? '' : ' / email'} on file. They are needed to create the student and the registration number.</p>
        <form id="ff"><div class="fgrid"><div class="field"><label>Date of birth *</label><input class="input" type="date" name="dob" required max="${new Date().toISOString().slice(0, 10)}"></div>
        <div class="field"><label>Email * <small>(student login ID)</small></label><input class="input" type="email" name="email" ${r.email ? '' : 'required'} value="${esc(r.email)}"></div></div>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" type="submit">Finalize admission</button></div></form>`);
      $('#ff', m.el).addEventListener('submit', async (e) => { e.preventDefault(); const b = $('button[type=submit]', e.target); b.disabled = true;
        try { await run(e.target.dob.value, e.target.email.value.trim()); m.close(); } catch (er) { fail(er); b.disabled = false; } });
    }
    $('#tb').addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.stu) return go('studentDetail', b.dataset.stu);
      if (b.dataset.fin) return finalizeOne(data.find((x) => x.id === b.dataset.fin));
      if (b.dataset.del) {
        const r = data.find((x) => x.id === b.dataset.del);
        if (!confirm(`Delete the enquiry from ${r.student_name} (${r.ref_no}) permanently?\n\nIf this person has not been admitted yet, their student record is removed as well. Students who are already enrolled keep their record. This cannot be undone.`)) return;
        const { data: res, error: er } = await sb.rpc('delete_enquiry', { p_id: r.id }); if (er) return fail(er);
        picked.delete(r.id); toast(res && res.student_deleted ? 'Enquiry and its student record deleted' : 'Enquiry deleted'); go('enquiries');
      }
    });
    $('#tb').addEventListener('change', (e) => { const id = e.target.dataset.pick; if (!id) return; e.target.checked ? picked.add(id) : picked.delete(id); syncPick(); });
    $('#bulk').addEventListener('click', async (e) => {
      const ids = pickable().filter((r) => picked.has(r.id)).map((r) => r.id); if (!ids.length) return;
      if (!confirm(`Finalize admission for ${ids.length} selected enquir${ids.length === 1 ? 'y' : 'ies'}?\n\nA student record and registration number will be created for each, and each is enrolled in the course they enquired about. Enquiries without a date of birth will be skipped so you can finalize them one by one.`)) return;
      const btn = e.target; btn.disabled = true; btn.textContent = 'Finalizing…';
      try {
        const { data: res, error: er } = await sb.rpc('finalize_admissions', { p_ids: ids }); if (er) throw er;
        const ok = res.filter((x) => x.ok), bad = res.filter((x) => !x.ok), nm = (id) => data.find((x) => x.id === id)?.student_name || '';
        const m = modal(`<h2>Bulk finalize complete</h2><p class="sub" style="margin:0 0 .8rem"><b style="color:var(--ok,#1a7f45)">${ok.length} admitted</b>${bad.length ? ` · <b style="color:var(--err)">${bad.length} need attention</b>` : ''}</p>
          ${ok.length ? `<div class="panel" style="background:#f4faf6"><b>Registered</b><ul style="margin:.4rem 0 0 1.1rem">${ok.map((x) => `<li>${esc(nm(x.id))} — <b>${esc(x.reg_no)}</b></li>`).join('')}</ul></div>` : ''}
          ${bad.length ? `<div class="panel" style="background:#fdf3f3"><b>Not finalized</b><ul style="margin:.4rem 0 0 1.1rem">${bad.map((x) => `<li>${esc(nm(x.id))} — ${esc(x.error)}</li>`).join('')}</ul></div>` : ''}
          <div class="modal-actions"><button class="btn btn-primary" data-close>Done</button></div>`);
        m.el.parentElement.addEventListener('click', (ev) => { if (ev.target.closest('[data-close]') || ev.target === m.el.parentElement) go('enquiries'); });
        ok.forEach((x) => picked.delete(x.id));
      } catch (er) { fail(er); btn.disabled = false; syncPick(); }
    });
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
    <form class="panel" id="pf" style="max-width:30rem"><h3 style="margin-bottom:14px">Change password</h3>
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

  // extension point used by admin-students.js (students, fees, attendance, material, assignments, certificates)
  const EXT = (window.BCTI_ADMIN_EXT = window.BCTI_ADMIN_EXT || { nav: [], views: {} });
  EXT.api = { sb, esc, $, toast, fail, modal, uid, go, V, checkFile, resize, get me() { return me; }, get current() { return currentView; } };

  sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT' && me) { me = null; showLogin(); } });
  window.addEventListener('unhandledrejection', (e) => console.error(e.reason));
  // start after every script on the page has loaded, so extension modules can register their menu items first
  const start = () => boot().catch((e) => showLogin('Could not connect to Supabase: ' + (e && e.message ? e.message : e) + '. Check assets/js/config.js and your internet connection.'));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
