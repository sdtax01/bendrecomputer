/* Bendre Computer Typing Institute — student portal */
(function () {
  const cfg = window.BCTI_CONFIG || {};
  const app = document.getElementById('app');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (s, r = document) => r.querySelector(s);

  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !window.supabase) {
    app.innerHTML = '<div class="login-wrap"><div class="login-card"><h1>Setup needed</h1><p class="lead" style="font-size:1rem">The website is not connected to its database yet. Please contact the institute.</p></div></div>';
    return;
  }
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { auth: { storageKey: 'bcti-student-auth', storage: window.sessionStorage } });
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2));
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const fmt = (d) => (d ? (window.BCTI_CERT ? window.BCTI_CERT.fmt(d) : d) : '—');
  const fmtDT = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
  const size = (n) => (!n ? '' : n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

  let ST = null;           // student row
  let D = {};              // cached data
  let view = 'dashboard', photoUrl = '', institute = null;

  function toast(msg, err) {
    const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 3800);
  }
  const fail = (e) => { console.error(e); toast((e && e.message) || 'Something went wrong', true); };
  function modal(html) {
    const bg = document.createElement('div'); bg.className = 'overlay-bg';
    bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
    const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    bg.addEventListener('mousedown', (e) => { if (e.target === bg) close(); });
    bg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    document.body.appendChild(bg); return { el: bg.firstChild, close };
  }

  /* ---------- login ---------- */
  function showLogin(msg) {
    if (window.BCTI_NOTIFY) window.BCTI_NOTIFY.unmount();
    app.innerHTML = `<div class="login-wrap"><form class="login-card" id="lf">
      <span class="logo-mark logo-mark--img"><img src="../assets/images/bendre-institute-mark.png" alt="" width="52" height="61"></span>
      <h1>Student sign in</h1><p style="color:var(--muted);margin-bottom:1.2rem">Bendre Computer Typing Institute</p>
      ${msg ? `<div class="setup-banner" role="alert">${esc(msg)}</div>` : ''}
      <div class="field" style="margin-bottom:14px"><label for="em">Email (your login ID)</label><input class="input" id="em" type="email" required autocomplete="username"></div>
      <div class="field" style="margin-bottom:20px"><label for="pw">Password</label><input class="input" id="pw" type="password" required autocomplete="current-password"></div>
      <button class="btn btn-primary" style="width:100%" type="submit">Sign in</button>
      <p class="hint" style="margin-top:14px">Forgot your password? Ask the institute to reset it for you.</p>
      <p style="margin-top:12px;text-align:center"><a href="../" style="color:var(--blue)">← Back to website</a></p></form></div>`;
    $('#lf').addEventListener('submit', async (e) => {
      e.preventDefault();
      const b = $('button', e.target); b.disabled = true; b.textContent = 'Signing in…';
      const { error } = await sb.auth.signInWithPassword({ email: $('#em').value.trim(), password: $('#pw').value });
      if (error) return showLogin(/invalid login/i.test(error.message || '') ? 'Email or password is incorrect.' : 'Sign-in failed: ' + error.message);
      boot();
    });
  }

  /* first login with a password set by the institute: the student must choose their own */
  function forcePasswordChange() {
    app.innerHTML = `<div class="login-wrap"><form class="login-card" id="fp">
      <span class="logo-mark logo-mark--img"><img src="../assets/images/bendre-institute-mark.png" alt="" width="52" height="61"></span>
      <h1>Create your own password</h1><p style="color:var(--muted);margin-bottom:1.2rem">The institute gave you a temporary password. Please choose a new one to continue.</p>
      <div class="field" style="margin-bottom:14px"><label for="n1">New password (min. 8 characters)</label><input class="input" id="n1" type="password" minlength="8" required autocomplete="new-password"></div>
      <div class="field" style="margin-bottom:20px"><label for="n2">Confirm new password</label><input class="input" id="n2" type="password" minlength="8" required autocomplete="new-password"></div>
      <button class="btn btn-primary" style="width:100%" type="submit">Save and continue</button>
      <p style="margin-top:14px;text-align:center"><button type="button" class="btn btn-ghost btn-sm" id="fpout">Sign out</button></p></form></div>`;
    $('#fpout').addEventListener('click', async () => { await sb.auth.signOut({ scope: 'local' }); showLogin(); });
    $('#fp').addEventListener('submit', async (e) => {
      e.preventDefault(); const b = $('button[type=submit]', e.target), n = $('#n1').value;
      if (n.length < 8) return toast('Password must be at least 8 characters', true);
      if (n !== $('#n2').value) return toast('The two passwords do not match', true);
      b.disabled = true;
      try {
        const { error } = await sb.auth.updateUser({ password: n, data: { must_change_password: false } }); if (error) throw error;
        try { await sb.rpc('student_notify', { p_kind: 'password' }); } catch (x) { /* optional */ }
        toast('Password saved'); boot();
      } catch (er) { fail(er); b.disabled = false; }
    });
  }

  async function boot() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return showLogin();
    const { data, error } = await sb.from('students').select('*').eq('user_id', session.user.id).maybeSingle();
    if (error || !data) { await sb.auth.signOut({ scope: 'local' }); return showLogin(error ? 'Could not load your account: ' + error.message : 'This account is not a student account.'); }
    if (data.status === 'Inactive') { await sb.auth.signOut({ scope: 'local' }); return showLogin('Your account is inactive. Please contact the institute.'); }
    ST = data;
    if (session.user.user_metadata && session.user.user_metadata.must_change_password) return forcePasswordChange();
    try { await loadAll(); } catch (e) { fail(e); }
    shell(); go(location.hash.slice(1) || 'dashboard');
  }

  async function loadAll() {
    const [enr, att, mat, asg, sub, set, fee, pay] = await Promise.all([
      sb.from('student_courses').select('*,courses(name,duration)').eq('student_id', ST.id).order('created_at'),
      sb.from('attendance').select('*').eq('student_id', ST.id).order('att_date', { ascending: false }),
      sb.from('study_materials').select('*,courses(name)').order('created_at', { ascending: false }),
      sb.from('assignments').select('*,courses(name)').order('due_date'),
      sb.from('assignment_submissions').select('*').eq('student_id', ST.id),
      sb.from('website_settings').select('value').eq('key', 'contact').maybeSingle(),
      sb.from('enrollment_fees').select('*').eq('student_id', ST.id),
      sb.from('fee_payments').select('*').eq('student_id', ST.id).order('paid_on', { ascending: false })]);
    [enr, att, mat, asg, sub].forEach((r) => { if (r.error) throw r.error; });
    D = { enr: enr.data || [], att: att.data || [], mat: mat.data || [], asg: asg.data || [], sub: sub.data || [], fee: fee.data || [], pay: pay.data || [], feeErr: !!(fee.error || pay.error) };
    institute = (set.data && set.data.value) || {};
    await loadPhoto();
  }
  async function loadPhoto() {
    photoUrl = '';
    if (ST.photo_path) { const { data } = await sb.storage.from('student-files').createSignedUrl(ST.photo_path, 3600); photoUrl = (data && data.signedUrl) || ''; }
  }

  /* ---------- shell ---------- */
  const NAV = [['dashboard', 'Dashboard'], ['attendance', 'Attendance'], ['material', 'Study Material'], ['assignments', 'Assignments'], ['fees', 'My Fees'], ['settings', 'Settings']];
  const initials = () => ST.full_name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const avatar = () => (photoUrl ? `<img src="${esc(photoUrl)}" alt="Your photo">` : esc(initials()));
  function shell() {
    app.innerHTML = `<div class="topbar"><b>Student Portal</b><button id="menu" aria-expanded="false" aria-controls="side">Menu</button></div>
    <div class="backdrop" id="bd"></div>
    <div class="st"><aside class="side" id="side" aria-label="Student navigation">
      <div class="me"><div class="avatar" id="sav">${avatar()}</div><div><b>${esc(ST.full_name)}</b><span>Reg. ${esc(ST.reg_no)}</span></div></div>
      <nav>${NAV.map(([k, l], i) => `<button data-v="${k}"><span class="n">${i + 1}</span>${l}</button>`).join('')}<button class="out" data-v="logout"><span class="n">${NAV.length + 1}</span>Log out</button></nav>
      <div class="site"><a href="../">← Back to website</a></div></aside>
      <main class="main" id="view" tabindex="-1"></main></div>`;
    const side = $('#side'), bd = $('#bd');
    const toggle = (o) => { side.classList.toggle('open', o); bd.classList.toggle('on', o); $('#menu').setAttribute('aria-expanded', o); };
    $('#menu').addEventListener('click', () => toggle(!side.classList.contains('open')));
    bd.addEventListener('click', () => toggle(false));
    side.addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-v]'); if (!b) return; toggle(false);
      if (b.dataset.v === 'logout') { if (window.BCTI_NOTIFY) window.BCTI_NOTIFY.unmount(); await sb.auth.signOut({ scope: 'local' }); ST = null; location.hash = ''; return showLogin(); }
      go(b.dataset.v);
    });
    /* notification bell (cosmetic add-on; the portal works the same without it) */
    if (window.BCTI_NOTIFY) window.BCTI_NOTIFY.mount({ sb, audience: 'student', onOpen: (n) => {
      const to = { assignment: 'assignments', material: 'material', payment: 'fees', certificate: 'dashboard', documents: 'settings' }[n && n.kind] || 'dashboard';
      go(to);
    } });
  }
  const V = () => $('#view');
  const VIEWS = { dashboard, attendance, material, assignments, fees, settings };
  function go(v) {
    if (!VIEWS[v]) v = 'dashboard';
    view = v; if (location.hash.slice(1) !== v) history.replaceState(null, '', '#' + v);
    document.querySelectorAll('#side nav button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    try { VIEWS[v](); } catch (e) { fail(e); }
    window.scrollTo({ top: 0 });
  }

  /* ---------- helpers ---------- */
  const attPct = (rows) => { const n = rows.length; return n ? Math.round(rows.filter((r) => r.status === 'Present').length * 100 / n) : null; };
  function asgStatus(a) {
    const s = D.sub.find((x) => x.assignment_id === a.id);
    if (s) return s.status === 'Reviewed' ? { k: 'Reviewed', cls: 'ok', s } : { k: s.is_late ? 'Submitted late' : 'Submitted', cls: s.is_late ? 'pend' : 'info', s };
    return today() > a.due_date ? { k: 'Overdue', cls: 'bad' } : { k: 'Pending', cls: 'pend' };
  }

  /* ---------- dashboard ---------- */
  function dashboard() {
    const active = D.enr.filter((e) => e.status === 'Active'), done = D.enr.filter((e) => e.status === 'Completed');
    const certs = done.filter((e) => e.certificate_no);
    const tasks = D.asg.map((a) => ({ a, st: asgStatus(a) }));
    const pending = tasks.filter((t) => t.st.k === 'Pending' || t.st.k === 'Overdue');
    const I = (k) => (window.DASH ? window.DASH.ico(k) : '');
    const overall = attPct(D.att), hour = new Date().getHours(), hi = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const nextDue = pending.filter((t) => t.a.due_date).sort((x, y) => String(x.a.due_date).localeCompare(String(y.a.due_date)))[0];
    const stats = [['bookopen', 'Active courses', active.length, ''], ['check', 'Overall attendance', overall === null ? '—' : overall + '%', ''], ['clip', 'Pending tasks', pending.length, pending.some((t) => t.st.k === 'Overdue') ? 'warn' : ''], ['award', 'Certificates', certs.length, '']];
    V().innerHTML = `<div class="d-hero"><div class="d-welcome"><h1>${hi}, <em>${esc(ST.full_name.split(' ')[0])}!</em></h1><p>Keep learning, keep growing. Your courses, certificates and tasks at a glance.</p>
        <div class="d-cta"><button class="d-btn" data-go="assignments">${I('clip')} My assignments</button><button class="d-btn" data-go="material">${I('bookopen')} Study material</button></div></div>
      <div class="d-side"><small>${I('clock')}Reg. No.</small><b>${esc(ST.reg_no)}</b><div class="d-sub">${nextDue ? 'Next due: ' + esc(nextDue.a.title) + ' · ' + fmt(nextDue.a.due_date) : 'No pending deadlines 🎉'}</div></div></div>
    <div class="d-stats">${stats.map(([ic, l, n, w], i) => `<div class="d-stat c${i + 1} ${w}"><span class="d-ico">${I(ic)}</span><div><span class="d-n">${n}</span><span class="d-l">${l}</span></div></div>`).join('')}</div>
    <div class="d-grid">
      <div class="d-card"><div class="d-head"><h3>Active courses</h3><button class="d-link" data-go="attendance">Attendance →</button></div><div class="list">${active.map((e) => {
        const p = attPct(D.att.filter((r) => r.course_id === e.course_id));
        return `<div class="item"><div><b>${esc(e.courses?.name)}</b><small>Started ${fmt(e.start_date)}${e.courses?.duration ? ' · ' + esc(e.courses.duration) : ''}</small></div>
        <div style="min-width:9rem"><small>Attendance ${p === null ? '—' : p + '%'}</small><div class="bar"><i style="width:${p || 0}%"></i></div></div></div>`;
      }).join('') || '<p class="d-empty">No active courses right now.</p>'}</div></div>
      <div class="d-card"><div class="d-head"><h3>Overall attendance</h3></div><div class="d-ringbox"><div class="d-ring" style="--p:${overall || 0}"><b>${overall === null ? '—' : overall + '%'}</b></div>
        <p><strong>${D.att.length} day${D.att.length === 1 ? '' : 's'} recorded</strong>Present ${D.att.filter((r) => r.status === 'Present').length} · Absent ${D.att.filter((r) => r.status === 'Absent').length} · Leave ${D.att.filter((r) => r.status === 'Leave').length}</p></div></div></div>
    <div class="d-grid three">
      <div class="d-card"><div class="d-head"><h3>My tasks</h3><button class="d-link" data-go="assignments">View all →</button></div>
        <div class="d-list">${pending.slice(0, 5).map((t) => `<div class="d-row"><span class="d-ico">${I('clip')}</span><div><b>${esc(t.a.title)}</b><small>${esc(t.a.courses?.name)} · Due ${fmt(t.a.due_date)}</small></div><span class="d-tag ${t.st.k === 'Overdue' ? 'bad' : 'warn'}">${t.st.k}</span></div>`).join('') || '<p class="d-empty">You are all caught up. 🎉</p>'}</div>
        <div class="d-mini"><div><b>${pending.length}</b><span>Pending</span></div><div><b>${tasks.filter((t) => /Submitted/.test(t.st.k)).length}</b><span>Submitted</span></div><div><b>${tasks.filter((t) => t.st.k === 'Reviewed').length}</b><span>Reviewed</span></div></div></div>
      <div class="d-card"><div class="d-head"><h3>My learning</h3></div>${active.length ? `<div class="d-bars">${active.map((e) => { const p = attPct(D.att.filter((r) => r.course_id === e.course_id)); return `<div class="d-bar"><span>${p === null ? '—' : p + '%'}</span><i style="height:${Math.max(p || 0, 3)}%"></i><small>${esc(e.courses?.name)}</small></div>`; }).join('')}</div>` : '<p class="d-empty">Your course progress will appear here.</p>'}</div>
      <div class="d-card"><div class="d-head"><h3>Quick actions</h3></div><div class="d-quick">
        <button data-go="material">${I('download')}Download study material</button><button data-go="assignments">${I('upload')}Submit assignment</button><button data-go="attendance">${I('check')}Check attendance</button><button data-go="fees">${I('wallet')}View my fees</button></div></div></div>
    <div class="d-card" style="margin-bottom:1.2rem"><div class="d-head"><h3>Completed courses &amp; certificates</h3></div><div class="list">${done.map((e) => `<div class="item"><div><b>${esc(e.courses?.name)}</b>
        <small>Completed ${fmt(e.completed_on)}${e.grade ? ' · Grade ' + esc(e.grade) : ''}${e.certificate_no ? ' · ' + esc(e.certificate_no) : ''}</small></div>
        ${e.certificate_no ? `<div class="row-actions" style="display:flex;gap:.4rem;flex-wrap:wrap"><button class="btn btn-primary btn-sm" data-cert="${e.id}" data-k="pdf">Download Certificate</button><button class="btn btn-ghost btn-sm" data-cert="${e.id}" data-k="png">PNG</button></div>`
          : '<span class="chip pend">Certificate being prepared</span>'}</div>`).join('') || '<p class="d-empty">Completed courses and certificates will appear here.</p>'}</div></div>`;
    V().querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
    V().querySelectorAll('[data-cert]').forEach((b) => b.addEventListener('click', () => downloadCert(b, b.dataset.cert, b.dataset.k)));
  }

  async function downloadCert(btn, enrId, kind) {
    const e = D.enr.find((x) => x.id === enrId); if (!e) return;
    const label = btn.textContent; btn.disabled = true; btn.textContent = 'Preparing…';
    try {
      let photo = null;
      if (ST.photo_path) { const { data } = await sb.storage.from('student-files').download(ST.photo_path); photo = data || null; }
      const cv = await window.BCTI_CERT.render({
        name: ST.full_name, regNo: ST.reg_no, course: e.courses?.name, duration: e.courses?.duration, startDate: e.start_date, completedOn: e.completed_on,
        issuedOn: e.certificate_issued_on, grade: e.grade, certNo: e.certificate_no, photo,
        institute: { name: institute?.institute_name, address: institute?.address, phone: institute?.phone }
      });
      await window.BCTI_CERT.save(cv, `Certificate-${e.courses?.name}-${ST.full_name}`, kind);
    } catch (er) { fail(er); }
    btn.disabled = false; btn.textContent = label;
  }

  /* ---------- attendance ---------- */
  function attendance() {
    const months = [...new Set(D.att.map((r) => r.att_date.slice(0, 7)))];
    V().innerHTML = `<h1>Attendance</h1><p class="sub">Updated daily by your teacher. This page is view-only.</p>
    <div class="filters"><select class="input" id="fc" aria-label="Course"><option value="">All courses</option>${D.enr.map((e) => `<option value="${e.course_id}">${esc(e.courses?.name)}</option>`).join('')}</select>
      <select class="input" id="fm" aria-label="Month"><option value="">All months</option>${months.map((m) => `<option value="${m}">${new Date(m + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</option>`).join('')}</select></div>
    <div id="asum"></div><div class="panel tbl-wrap" id="atbl"></div>`;
    const draw = () => {
      const c = $('#fc').value, m = $('#fm').value;
      const rows = D.att.filter((r) => (!c || r.course_id === c) && (!m || r.att_date.startsWith(m)));
      const n = (s) => rows.filter((r) => r.status === s).length, p = attPct(rows);
      $('#asum').innerHTML = `<div class="stats"><div class="stat"><b>${n('Present')}</b><span>Present</span></div><div class="stat"><b>${n('Absent')}</b><span>Absent</span></div><div class="stat"><b>${n('Leave')}</b><span>Leave</span></div><div class="stat"><b>${p === null ? '—' : p + '%'}</b><span>Attendance</span></div></div>`;
      const cname = (id) => D.enr.find((e) => e.course_id === id)?.courses?.name || '';
      $('#atbl').innerHTML = rows.length ? `<table class="tbl"><thead><tr><th>Date</th><th>Course</th><th>Status</th></tr></thead><tbody>${rows.map((r) =>
        `<tr><td>${fmt(r.att_date)}</td><td>${esc(cname(r.course_id))}</td><td><span class="chip ${r.status === 'Present' ? 'ok' : r.status === 'Absent' ? 'bad' : 'pend'}">${r.status}</span></td></tr>`).join('')}</tbody></table>` : '<p class="empty">No attendance has been recorded yet.</p>';
    };
    $('#fc').addEventListener('change', draw); $('#fm').addEventListener('change', draw); draw();
  }

  /* ---------- my fees (read-only) ---------- */
  const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  function fees() {
    if (D.feeErr) { V().innerHTML = '<h1>My Fees</h1><p class="sub">Fee details are not available right now. Please ask the institute office.</p>'; return; }
    const total = D.fee.reduce((a, f) => a + Number(f.total_fee), 0), paid = D.fee.reduce((a, f) => a + Number(f.paid), 0), due = total - paid;
    const cname = (id) => D.enr.find((e) => e.id === id)?.courses?.name || '';
    V().innerHTML = `<h1>My Fees</h1><p class="sub">Your course fees and payments recorded by the institute. This page is view-only.</p>
    <div class="stats"><div class="stat"><b>${inr(total)}</b><span>Total fees</span></div><div class="stat"><b>${inr(paid)}</b><span>Paid</span></div><div class="stat"><b style="color:${due > 0 ? 'var(--err,#b42318)' : 'inherit'}">${inr(due)}</b><span>Balance due</span></div></div>
    <div class="panel tbl-wrap"><h3 style="margin:0 0 .6rem">Course-wise</h3>${D.fee.length ? `<table class="tbl"><thead><tr><th>Course</th><th>Fee</th><th>Paid</th><th>Balance</th></tr></thead><tbody>${D.fee.map((f) =>
      `<tr><td>${esc(cname(f.enrollment_id))}</td><td>${inr(f.total_fee)}</td><td>${inr(f.paid)}</td><td>${Number(f.balance) > 0 ? `<span class="chip bad">${inr(f.balance)}</span>` : '<span class="chip ok">Paid</span>'}</td></tr>`).join('')}</tbody></table>` : '<p class="empty">No fee details have been added yet.</p>'}</div>
    <div class="panel tbl-wrap"><h3 style="margin:0 0 .6rem">Payment history</h3>${D.pay.length ? `<table class="tbl"><thead><tr><th>Date</th><th>Receipt</th><th>Course</th><th>Mode</th><th>Amount</th></tr></thead><tbody>${D.pay.map((p) =>
      `<tr><td>${fmt(p.paid_on)}</td><td>${esc(p.receipt_no)}</td><td>${esc(cname(p.enrollment_id))}</td><td>${esc(p.mode)}</td><td><b>${inr(p.amount)}</b></td></tr>`).join('')}</tbody></table>` : '<p class="empty">No payments recorded yet.</p>'}</div>`;
  }

  /* ---------- study material ---------- */
  function material() {
    const groups = {};
    D.mat.forEach((m) => { (groups[m.course_id] = groups[m.course_id] || { name: m.courses?.name, items: [] }).items.push(m); });
    V().innerHTML = `<h1>Study Material</h1><p class="sub">Notes and files shared by your teacher for the courses you are enrolled in.</p>` +
      (Object.values(groups).map((g) => `<div class="panel"><h3>${esc(g.name)}</h3><div class="list">${g.items.map((m) => `<div class="item"><div><b>${esc(m.title)}</b>
        <small>${esc(m.description || '')}${m.description ? ' · ' : ''}${[size(m.file_size), 'Updated ' + fmt(m.updated_at.slice(0, 10))].filter(Boolean).join(' · ')}</small></div>
        <button class="btn btn-primary btn-sm" data-dl="${m.id}">Download</button></div>`).join('')}</div></div>`).join('') || '<div class="panel"><p class="empty">No study material has been shared for your courses yet.</p></div>');
    V().querySelectorAll('[data-dl]').forEach((b) => b.addEventListener('click', async () => {
      const m = D.mat.find((x) => x.id === b.dataset.dl); b.disabled = true;
      try {
        const { data, error } = await sb.storage.from('materials').createSignedUrl(m.file_path, 120, { download: m.file_name || m.title });
        if (error) throw error; window.open(data.signedUrl, '_blank', 'noopener');
      } catch (e) { fail(e); }
      b.disabled = false;
    }));
  }

  /* ---------- assignments ---------- */
  function assignments() {
    const rows = D.asg.map((a) => ({ a, st: asgStatus(a) }));
    const order = { Overdue: 0, Pending: 1, 'Submitted late': 2, Submitted: 2, Reviewed: 3 };
    rows.sort((x, y) => order[x.st.k] - order[y.st.k] || x.a.due_date.localeCompare(y.a.due_date));
    V().innerHTML = `<h1>Assignments</h1><p class="sub">Tasks given by your teacher, with due dates and your submission status.</p>
    <div class="panel"><div class="list">${rows.map(({ a, st }) => `<div class="item" style="align-items:flex-start"><div style="min-width:0;flex:1 1 16rem"><b>${esc(a.title)}</b>
      <small>${esc(a.courses?.name)} · Due ${fmt(a.due_date)}</small>${a.description ? `<div class="quote">${esc(a.description)}</div>` : ''}
      ${st.s ? `<small>Submitted ${fmtDT(st.s.submitted_at)}${st.s.file_name ? ' · ' + esc(st.s.file_name) : ''}</small>` : ''}
      ${st.s && st.s.status === 'Reviewed' ? `<div class="quote"><b>Marks:</b> ${esc(st.s.marks || '—')}\n<b>Feedback:</b> ${esc(st.s.feedback || '—')}</div>` : ''}</div>
      <div style="display:grid;gap:.5rem;justify-items:end"><span class="chip ${st.cls}">${st.k}</span>
      ${st.k !== 'Reviewed' ? `<button class="btn ${st.s ? 'btn-ghost' : 'btn-primary'} btn-sm" data-sub="${a.id}">${st.s ? 'Re-submit' : 'Submit'}</button>` : ''}</div></div>`).join('') || '<p class="empty">No assignments have been given yet.</p>'}</div></div>`;
    V().querySelectorAll('[data-sub]').forEach((b) => b.addEventListener('click', () => submitForm(D.asg.find((x) => x.id === b.dataset.sub))));
  }
  function submitForm(a) {
    const prev = D.sub.find((s) => s.assignment_id === a.id);
    const m = modal(`<h2>${esc(a.title)}</h2><p class="hint">Due ${fmt(a.due_date)}${today() > a.due_date ? ' — this will be marked as late' : ''}</p>
      <form id="sf"><div class="field" style="margin:.8rem 0"><label for="sn">Your answer / note</label><textarea class="input" id="sn" rows="5" maxlength="4000">${esc(prev?.note)}</textarea></div>
      <div class="field"><label for="sfile">Attach a file (PDF, JPG, PNG or WebP, up to 5 MB) — optional</label><input type="file" id="sfile" accept="application/pdf,image/jpeg,image/png,image/webp"></div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" type="submit">Submit assignment</button></div></form>`);
    $('#sf', m.el).addEventListener('submit', async (e) => {
      e.preventDefault(); const btn = $('button[type=submit]', m.el); btn.disabled = true; btn.textContent = 'Submitting…';
      try {
        const f = $('#sfile', m.el).files[0]; let path = null;
        if (f) {
          if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(f.type)) throw new Error('Only PDF, JPG, PNG or WebP files are allowed');
          if (f.size > 5 * 1024 * 1024) throw new Error('File is larger than 5 MB');
          path = `submissions/${ST.id}/${a.id}/${uid()}-${f.name.replace(/[^A-Za-z0-9._-]+/g, '_')}`;
          const { error } = await sb.storage.from('student-files').upload(path, f, { contentType: f.type, upsert: false }); if (error) throw error;
        }
        const { error } = await sb.rpc('submit_assignment', { p_assignment: a.id, p_note: $('#sn', m.el).value, p_file_path: path, p_file_name: f ? f.name : null });
        if (error) throw error;
        const { data } = await sb.from('assignment_submissions').select('*').eq('student_id', ST.id); D.sub = data || [];
        toast('Assignment submitted'); m.close(); assignments();
      } catch (er) { fail(er); btn.disabled = false; btn.textContent = 'Submit assignment'; }
    });
  }

  /* ---------- settings ---------- */
  async function resizeImg(file, max) {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return new Promise((r) => c.toBlob(r, 'image/jpeg', 0.88));
  }
  function settings() {
    const lock = (l, v) => `<div class="field"><label>${l}</label><input class="input locked" value="${esc(v)}" readonly></div>`;
    V().innerHTML = `<h1>Settings</h1><p class="sub">Your profile and password. Your photo is printed on your certificates.</p>
    <div class="panel"><h3>Profile photo</h3><div class="photo-edit"><div class="avatar" id="pav">${photoUrl ? `<img src="${esc(photoUrl)}" alt="Your photo">` : 'No photo'}</div>
      <div><input type="file" id="pf" accept="image/jpeg,image/png,image/webp" aria-label="Choose photo"><p class="hint">Use a clear passport-style photo (JPG, PNG or WebP, up to 5 MB).</p><p><button class="btn btn-primary btn-sm" id="pup" disabled>Upload photo</button></p></div></div></div>
    <form class="panel" id="pform"><h3>About me &amp; KYC details</h3><div class="fgrid">
      ${lock('Full name', ST.full_name)}${lock('Registration no.', ST.reg_no)}${lock('Email (login ID)', ST.email)}${lock('Date of birth', fmt(ST.dob))}${lock('Mobile', ST.mobile)}
      <div class="field"><label for="g">Guardian name</label><input class="input" id="g" maxlength="100" value="${esc(ST.guardian_name)}"></div>
      <div class="field"><label for="wa">WhatsApp number</label><input class="input" id="wa" inputmode="numeric" maxlength="16" value="${esc(ST.whatsapp)}"></div>
      <div class="field"><label for="gen">Gender</label><select class="input" id="gen">${['', 'Male', 'Female', 'Other'].map((o) => `<option ${ST.gender === o ? 'selected' : ''} value="${o}">${o || 'Select'}</option>`).join('')}</select></div>
      <div class="field"><label for="q">Qualification</label><select class="input" id="q">${['', 'Below 10th', '10th pass', '12th pass', 'Diploma', 'Graduate', 'Post-graduate', 'Other'].map((o) => `<option ${ST.qualification === o ? 'selected' : ''} value="${o}">${o || 'Select'}</option>`).join('')}</select></div>
      <div class="field full"><label for="ad">Address</label><textarea class="input" id="ad" rows="2" maxlength="400">${esc(ST.address)}</textarea></div>
      <div class="field full"><label for="ab">About me / introduction</label><textarea class="input" id="ab" rows="4" maxlength="1000">${esc(ST.about)}</textarea></div>
      <p class="hint full">Name, date of birth, mobile and email are locked because they appear on your certificate. Contact the institute to correct them.</p></div>
      <p style="margin-top:1rem"><button class="btn btn-primary" type="submit">Save details</button></p></form>
    <form class="panel" id="pwform"><h3>Change password</h3><div class="fgrid">
      <div class="field"><label for="np">New password</label><input class="input" id="np" type="password" minlength="8" autocomplete="new-password" required></div>
      <div class="field"><label for="cp">Confirm new password</label><input class="input" id="cp" type="password" minlength="8" autocomplete="new-password" required></div></div>
      <p class="hint">At least 8 characters.</p><p style="margin-top:.8rem"><button class="btn btn-primary" type="submit">Update password</button></p></form>`;

    const pf = $('#pf'), pup = $('#pup'); let pending = null;
    pf.addEventListener('change', () => {
      const f = pf.files[0]; pending = null; pup.disabled = true; if (!f) return;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) { toast('Only JPG, PNG or WebP photos are allowed', true); pf.value = ''; return; }
      if (f.size > 5 * 1024 * 1024) { toast('Photo is larger than 5 MB', true); pf.value = ''; return; }
      pending = f; pup.disabled = false; $('#pav').innerHTML = `<img src="${URL.createObjectURL(f)}" alt="Selected photo preview">`;
    });
    pup.addEventListener('click', async () => {
      if (!pending) return; pup.disabled = true; pup.textContent = 'Uploading…';
      try {
        const blob = await resizeImg(pending, 600), old = ST.photo_path, path = `photos/${ST.id}/${uid()}.jpg`;
        const up = await sb.storage.from('student-files').upload(path, blob, { contentType: 'image/jpeg', upsert: false }); if (up.error) throw up.error;
        await saveProfile(path);
        if (old) await sb.storage.from('student-files').remove([old]);
        await loadPhoto(); $('#sav').innerHTML = avatar(); toast('Photo updated'); settings();
      } catch (e) { fail(e); pup.disabled = false; pup.textContent = 'Upload photo'; }
    });
    async function saveProfile(photo) {
      const { error } = await sb.rpc('update_my_profile', { p_about: $('#ab').value, p_address: $('#ad').value, p_whatsapp: $('#wa').value, p_qualification: $('#q').value, p_gender: $('#gen').value, p_guardian: $('#g').value, p_photo_path: photo || null });
      if (error) throw error;
      const { data } = await sb.from('students').select('*').eq('id', ST.id).maybeSingle(); if (data) ST = data;
    }
    $('#pform').addEventListener('submit', async (e) => {
      e.preventDefault(); const b = $('button', e.target); b.disabled = true;
      try { await saveProfile(null); toast('Details saved'); } catch (er) { fail(er); }
      b.disabled = false;
    });
    $('#pwform').addEventListener('submit', async (e) => {
      e.preventDefault(); const b = $('button', e.target), n = $('#np').value;
      if (n.length < 8) return toast('Password must be at least 8 characters', true);
      if (n !== $('#cp').value) return toast('The two passwords do not match', true);
      b.disabled = true;
      try { const { error } = await sb.auth.updateUser({ password: n }); if (error) throw error; toast('Password updated'); e.target.reset(); try { await sb.rpc('student_notify', { p_kind: 'password' }); } catch (x) { /* optional */ } } catch (er) { fail(er); }
      b.disabled = false;
    });
  }

  boot();
})();
