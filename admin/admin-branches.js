/* Admin: multi-branch layer (branch selector, branch dashboard, reports, branches & staff, legacy mapping, audit log).
   Loaded after admin-students.js. It adds NEW menu items and a branch selector; the existing screens are not rewritten:
   the shared Supabase client is lightly wrapped so that (a) list queries follow the selected branch and (b) new admissions / payments
   carry the selected branch. The DATABASE is the real gatekeeper (schema-update-v11-branches.sql): even if this file is bypassed,
   a branch user can never read or write another branch's records. */
(function () {
  const EXT = window.BCTI_ADMIN_EXT;
  if (!EXT || !EXT.api) return;
  const { sb, esc, $, toast, fail, modal, V } = EXT.api;
  const KEY = 'bcti-branch';
  const S = { list: [], mine: null, cur: '', cross: [], ready: false, failed: false };
  try { S.cur = sessionStorage.getItem(KEY) || ''; } catch (e) { /* storage unavailable */ }
  const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const me = () => EXT.api.me || {};
  const isOwner = () => me().role === 'admin' && (me().branch_scope || 'all') === 'all';
  const allScope = () => (me().branch_scope || 'all') === 'all';
  const title = () => me().staff_title || '';
  const moneyOk = () => !['reception', 'teacher'].includes(title());
  const code = (id) => { const b = S.list.find((x) => x.id === id); return b ? b.code : ''; };
  const curBranch = () => S.list.find((x) => x.id === S.cur) || null;
  const ready = () => S.ready;
  const needBranch = () => !S.cur && (S.list.length > 1);
  const REJ = (msg) => { const r = new Proxy(function () { return r; }, { get: (_, k) => (k === 'then' ? (res) => res({ data: null, error: { message: msg } }) : () => r), apply: () => r }); return r; };
  const NEED = 'Select a branch first (top of the menu). "All branches" is view-only for admissions and payments.';

  /* ---------- Supabase client wrapper (UX only; the database enforces everything) ---------- */
  const oFrom = sb.from.bind(sb), oRpc = sb.rpc.bind(sb);
  sb.from = function (t) {
    const q = oFrom(t);
    if (!['students', 'student_courses', 'fee_payments', 'attendance', 'admission_enquiries', 'batches'].includes(t)) return q;
    const sel = q.select.bind(q), ins = q.insert.bind(q);
    q.select = (...a) => {
      const r = sel(...a); const b = S.cur; if (!b) return r;
      if (t === 'students') return S.cross.length ? r.or(`branch_id.eq.${b},id.in.(${S.cross.join(',')})`) : r.eq('branch_id', b);
      if (t === 'admission_enquiries') return r.or(`branch_id.eq.${b},and(branch_id.is.null,preferred_branch_id.eq.${b})`);
      if (t === 'batches') return r.or(`branch_id.eq.${b},branch_id.is.null`);
      return r.eq('branch_id', b);
    };
    q.insert = (rows, ...a) => {
      if ((t === 'fee_payments' || t === 'student_courses') && needBranch()) return REJ(NEED);
      if (S.cur && (t === 'student_courses' || t === 'batches')) {
        const add = (x) => (x && x.branch_id === undefined ? Object.assign({ branch_id: S.cur }, x) : x);
        rows = Array.isArray(rows) ? rows.map(add) : add(rows);
      }
      return ins(rows, ...a);
    };
    return q;
  };
  const withEnqBranch = async (ids) => {
    if (!S.cur || !ids || !ids.length) return;
    const { data } = await oFrom('admission_enquiries').select('id,branch_id').in('id', ids);
    for (const e of (data || [])) if (!e.branch_id) await oRpc('assign_enquiry_branch', { p_enquiry: e.id, p_branch: S.cur });
  };
  sb.rpc = function (name, args, opts) {
    if (name === 'admin_add_student') {
      if (needBranch()) return Promise.resolve({ data: null, error: { message: NEED } });
      if (S.cur) return oRpc('add_student_in_branch', Object.assign({ p_branch: S.cur }, args)).then((r) => (r.error ? r : { data: r.data && r.data.reg_no, error: null }));
    }
    if (name === 'finalize_admission' && args) return withEnqBranch([args.p_enquiry]).then(() => oRpc(name, args, opts));
    if (name === 'finalize_admissions' && args) return withEnqBranch(args.p_ids).then(() => oRpc(name, args, opts));
    return oRpc(name, args, opts);
  };

  /* ---------- state: branches, access, cross-branch students ---------- */
  async function refreshCross() {
    S.cross = [];
    if (!S.cur) return;
    const { data } = await oFrom('student_courses').select('student_id,students(branch_id)').eq('branch_id', S.cur).limit(2000);
    S.cross = [...new Set((data || []).filter((r) => r.students && r.students.branch_id !== S.cur).map((r) => r.student_id))].slice(0, 150);
  }
  async function init() {
    try {
      const { data: bs, error } = await oFrom('branches').select('*').order('code');
      if (error) throw error;
      S.list = bs || [];
      if (!allScope()) {
        const { data: mine } = await oFrom('staff_branches').select('branch_id').eq('user_id', me().user_id);
        S.mine = (mine || []).map((x) => x.branch_id);
        S.list = S.list.filter((b) => S.mine.includes(b.id));
        if (!S.mine.includes(S.cur)) S.cur = S.mine[0] || '';
      } else if (S.cur && !S.list.some((b) => b.id === S.cur)) S.cur = '';
      S.ready = true; await refreshCross(); persist(); paint();
      const cv = EXT.api.current; if (cv && cv !== 'overview') EXT.api.go(cv); else if (S.cur) EXT.api.go('overview');
    } catch (e) { S.failed = true; console.warn('Branch layer not active (run schema-update-v11-branches.sql):', e.message || e); }
  }
  const persist = () => { try { sessionStorage.setItem(KEY, S.cur); } catch (e) { /* ignore */ } };

  /* ---------- selector + banner ---------- */
  const style = document.createElement('style');
  style.textContent = `
  .br-sel{margin:.2rem .9rem 1rem;padding:.7rem .8rem;border-radius:.8rem;background:rgba(255,255,255,.09);color:#fff}
  .br-sel label{display:block;font-size:.66rem;letter-spacing:.12em;text-transform:uppercase;opacity:.75;margin-bottom:.35rem}
  .br-sel select{width:100%;padding:.45rem .5rem;border-radius:.5rem;border:0;font:inherit;font-size:.85rem;background:#fff;color:#101b3d}
  .br-sel b{display:block;font-size:.85rem;line-height:1.3}
  .br-bar{display:flex;gap:.6rem;align-items:center;flex-wrap:wrap;margin-bottom:1rem;padding:.55rem .9rem;border-radius:.8rem;background:#eef0ff;border:1px solid #d9ddf8;font-size:.85rem;color:#2b2f6b}
  .br-bar.all{background:#fff7e6;border-color:#f4dfb0;color:#7a5200}
  .br-bar .pill{background:#4f46e5;color:#fff;border-radius:99px;padding:.15rem .7rem;font-weight:700;font-size:.78rem}
  .br-bar.all .pill{background:#b7791f}
  .br-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr));gap:1rem;margin-bottom:1.2rem}
  .br-row{display:flex;gap:.7rem;flex-wrap:wrap;align-items:end;margin-bottom:1rem}
  .br-row .field{margin:0;min-width:9rem}
  .br-bars{display:grid;gap:.5rem}
  .br-bars div{display:grid;grid-template-columns:minmax(6rem,12rem) 1fr auto;gap:.6rem;align-items:center;font-size:.85rem}
  .br-bars i{display:block;height:.7rem;border-radius:99px;background:linear-gradient(90deg,#4f46e5,#7c8cff)}
  .br-tag{display:inline-block;padding:.1rem .5rem;border-radius:99px;background:#eef0ff;color:#3730a3;font-size:.72rem;font-weight:700}
  .br-tag.warn{background:#fff1d6;color:#8a5a00}
  .br-note{color:#6b7494;font-size:.8rem;margin:.3rem 0 0}
  @media(max-width:600px){.br-bars div{grid-template-columns:1fr auto}.br-bars i{grid-column:1/3}}`;
  document.head.appendChild(style);

  function selectorHtml() {
    if (!S.ready) return '';
    const fixed = !allScope() && S.list.length <= 1;
    const opts = (allScope() ? '<option value="">All branches (view only)</option>' : '') + S.list.map((b) => `<option value="${esc(b.id)}"${b.id === S.cur ? ' selected' : ''}>${esc(b.name.replace(/^.*?–\s*/, ''))}${b.is_active ? '' : ' (inactive)'}</option>`).join('');
    return `<div class="br-sel" id="brsel"><label for="brs">Branch</label>${fixed ? `<b>${esc(S.list[0] ? S.list[0].name.replace(/^.*?–\s*/, '') : 'No branch assigned')}</b>` : `<select id="brs" aria-label="Select branch">${opts}</select>`}</div>`;
  }
  function paint() {
    const side = $('#side'); if (!side) return;
    const old = $('#brsel'); if (old) old.remove();
    const html = selectorHtml(); if (!html) return;
    const nav = side.querySelector('nav'); if (!nav) return;
    nav.insertAdjacentHTML('beforebegin', html);
    const s = $('#brs');
    if (s) s.addEventListener('change', async () => { S.cur = s.value; persist(); await refreshCross(); EXT.api.go(EXT.api.current || 'overview'); });
    bar();
  }
  function bar() {
    const v = V(); if (!v || !S.ready || $('#brbar')) return;
    const b = curBranch();
    const d = document.createElement('div'); d.id = 'brbar'; d.className = 'br-bar' + (b ? '' : ' all');
    d.innerHTML = b ? `<span class="pill">${esc(b.code)}</span> Working in <b>${esc(b.name)}</b>` : `<span class="pill">ALL</span> Viewing <b>all branches</b> — admissions and payments can only be posted after you choose one branch.`;
    v.prepend(d);
  }
  new MutationObserver(() => {
    const u = EXT.api.me && EXT.api.me.user_id;
    if (S.ready && S.uid && u !== S.uid) { S.ready = false; S.started = false; S.failed = false; S.list = []; S.cross = []; }   // another person signed in
    if (!S.ready) { if (u && !S.failed && !S.started) { S.started = true; S.uid = u; init(); } return; }
    if ($('#side') && !$('#brsel')) paint();
    const v = V(); if (v && !$('#brbar')) bar();
  }).observe(document.body, { childList: true, subtree: true });

  /* ---------- helpers ---------- */
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  function period(kind) {
    const t = new Date(); t.setHours(12, 0, 0, 0); let a = new Date(t);
    if (kind === 'week') { a.setDate(t.getDate() - ((t.getDay() + 6) % 7)); }
    else if (kind === 'month') a = new Date(t.getFullYear(), t.getMonth(), 1, 12);
    else if (kind === 'fy') a = new Date(t.getMonth() >= 3 ? t.getFullYear() : t.getFullYear() - 1, 3, 1, 12);
    return [iso(a), iso(t)];
  }
  function csv(rows, name) {
    if (!rows.length) return toast('Nothing to export', true);
    const cols = Object.keys(rows[0]);
    const q = (v) => { v = v == null ? '' : String(v); if (/^[=+\-@]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; };
    const txt = [cols.map(q).join(',')].concat(rows.map((r) => cols.map((c) => q(r[c])).join(','))).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + txt], { type: 'text/csv;charset=utf-8' }));
    a.download = name + '.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  const tbl = (cols, rows) => rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="hint">No records for this selection.</p>';
  const notReady = () => { V().innerHTML = '<div class="panel"><h2>Branch features not active</h2><p>Run <code>schema-update-v11-branches.sql</code> in the Supabase SQL Editor (after the earlier updates), then reload this page.</p></div>'; };
  const ctx = () => `${S.cur ? esc(code(S.cur)) : 'ALL'}`;

  /* ---------- Branch dashboard ---------- */
  async function bdash() {
    if (!S.ready) return S.failed ? notReady() : (V().innerHTML = '<p class="hint">Loading…</p>');
    let kind = 'month', [from, to] = period('month');
    V().innerHTML = `<div class="bar"><h1>Branch Dashboard</h1></div>
      <div class="panel"><div class="br-row">
        <div class="field"><label for="bp">Period</label><select class="input" id="bp"><option value="today">Today</option><option value="week">This week</option><option value="month" selected>This month</option><option value="fy">Financial year</option><option value="custom">Custom range</option></select></div>
        <div class="field"><label for="bf">From</label><input class="input" type="date" id="bf" value="${from}"></div>
        <div class="field"><label for="bt">To</label><input class="input" type="date" id="bt" value="${to}"></div>
        <button class="btn btn-primary btn-sm" id="bgo">Show</button></div></div>
      <div id="bout"><p class="hint">Loading…</p></div>
      <div class="panel"><h3>Find a student across branches</h3><p class="br-note">Search by name, registration number or mobile to see where a person is registered and enrolled, and to avoid duplicate profiles.</p>
        <div class="br-row"><div class="field" style="flex:1"><input class="input" id="lq" placeholder="Name, registration no. or mobile"></div><button class="btn btn-outline btn-sm" id="lgo">Search</button></div><div id="lout"></div></div>`;
    const pick = () => { const k = $('#bp').value; if (k !== 'custom') { [from, to] = period(k === 'today' ? 'today' : k); $('#bf').value = from; $('#bt').value = to; } };
    $('#bp').addEventListener('change', () => { pick(); load(); });
    $('#bgo').addEventListener('click', () => { from = $('#bf').value; to = $('#bt').value; if (!from || !to || from > to) return toast('Choose a valid date range', true); load(); });
    async function load() {
      const out = $('#bout'); out.innerHTML = '<p class="hint">Loading…</p>';
      const { data: d, error } = await sb.rpc('branch_dashboard', { p_branch: S.cur || null, p_from: $('#bf').value, p_to: $('#bt').value });
      if (error) { out.innerHTML = ''; return fail(error); }
      const m = d.money;
      const st = (b, l) => `<div class="stat"><b>${b}</b><span>${l}</span></div>`;
      const bars = (arr, k, v, fmt) => { const mx = Math.max(1, ...arr.map((x) => Math.abs(Number(x[v])))); return arr.length ? `<div class="br-bars">${arr.map((x) => `<div><span>${esc(x[k])}</span><i style="width:${Math.max(3, Math.abs(Number(x[v])) * 100 / mx)}%"></i><b>${fmt(x[v])}</b></div>`).join('')}</div>` : '<p class="hint">No data in this period.</p>'; };
      out.innerHTML = `<div class="stats">${st(d.admissions_today, 'Admissions today')}${st(d.admissions_month, 'Admissions this month')}${st(d.admissions_period, 'Admissions in period')}${st(d.active_students, 'Active students')}${st(d.total_students, 'Total students')}
        ${m ? st(inr(d.collection_today), 'Collected today') + st(inr(d.collection_month), 'Collected this month') + st(inr(d.collection_period), 'Collected in period') + st(inr(d.outstanding), 'Total outstanding') : ''}</div>
        ${m && Number(d.reversed_period) ? `<p class="br-note">Collections are net of reversals (${inr(d.reversed_period)} reversed in this period).</p>` : ''}
        ${d.compare ? `<div class="panel"><h3>Branch comparison <span class="hint">· ${esc(d.from)} to ${esc(d.to)}</span></h3>${tbl(['Branch', 'Admissions', 'Active students'].concat(m ? ['Collected', 'Outstanding'] : []), d.compare.map((c) => [`<b>${esc(c.branch)}</b><div class="hint">${esc(c.name)}</div>`, c.admissions, c.active_students].concat(m ? [inr(c.collection), inr(c.outstanding)] : [])))}</div>` : ''}
        <div class="br-grid"><div class="panel"><h3>Course-wise admissions</h3>${bars(d.courses, 'course', 'count', (x) => x)}</div>
        ${m ? `<div class="panel"><h3>Payment modes</h3>${bars(d.modes, 'mode', 'amount', inr)}</div>` : ''}</div>
        <div class="panel"><h3>Recent admissions</h3>${tbl(['Date', 'Student', 'Reg. no', 'Course', 'Branch'], d.recent_admissions.map((r) => [esc(r.date), esc(r.student), esc(r.reg_no), esc(r.course), `<span class="br-tag">${esc(r.branch || 'Unmapped')}</span>`]))}</div>
        ${m ? `<div class="panel"><h3>Recent payments</h3>${tbl(['Date', 'Receipt', 'Student', 'Mode', 'Amount', 'Branch'], d.recent_payments.map((r) => [esc(r.date), esc(r.receipt_no), esc(r.student), esc(r.mode), inr(r.amount), `<span class="br-tag">${esc(r.branch || 'Unmapped')}</span>`]))}</div>` : '<p class="br-note">Financial figures are hidden for your role.</p>'}`;
    }
    $('#lgo').addEventListener('click', lookup); $('#lq').addEventListener('keydown', (e) => { if (e.key === 'Enter') lookup(); });
    async function lookup() {
      const q = $('#lq').value.trim(); const out = $('#lout'); if (q.length < 3) return toast('Type at least 3 characters', true);
      const { data, error } = await sb.rpc('lookup_student', { p_q: q }); if (error) return fail(error);
      out.innerHTML = tbl(['Reg. no', 'Name', 'Mobile', 'Home branch', 'Enrolled in', 'Action'], data.map((s) => [esc(s.reg_no), esc(s.name), '••••' + esc(s.mobile_last4), esc((s.home_branch || 'Not assigned').replace(/^.*?–\s*/, '')), (s.enrolled_in || []).map((x) => `<span class="br-tag">${esc(String(x).replace(/^.*?–\s*/, ''))}</span>`).join(' ') || '—',
        S.cur ? `<button class="btn btn-outline btn-sm" data-en="${esc(s.id)}">Enrol in ${esc(code(S.cur))}</button>` : '<span class="hint">choose a branch</span>']));
      out.querySelectorAll('[data-en]').forEach((b) => b.addEventListener('click', () => enrol(b.dataset.en)));
    }
    async function enrol(sid) {
      const { data: cs } = await sb.from('courses').select('id,name,fee').order('name');
      const m = modal(`<h2>Enrol in ${esc(curBranch().name)}</h2><form id="ef" class="form-grid">
        <div class="field full"><label>Course</label><select class="input" name="c" required>${(cs || []).map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Fee agreed (₹)</label><input class="input" type="number" name="fee" min="0" step="1" value="0"></div>
        <div class="field"><label>Admission source</label><select class="input" name="src"><option>Walk-in</option><option>Website</option><option>Referral</option><option>Phone</option><option>Other</option></select></div>
        <div class="field full"><button class="btn btn-primary" type="submit">Enrol</button> <button class="btn btn-outline" type="button" data-close>Cancel</button></div></form>`);
      m.el.querySelector('#ef').addEventListener('submit', async (e) => {
        e.preventDefault(); const f = e.target.elements;
        const { error } = await sb.rpc('enroll_student', { p_student: sid, p_course: f.c.value, p_branch: S.cur, p_fee: parseFloat(f.fee.value) || 0, p_source: f.src.value, p_start: null });
        if (error) return fail(error); m.close(); toast('Student enrolled in this branch'); lookup();
      });
    }
    load();
  }

  /* ---------- Reports ---------- */
  const KINDS = [['admissions', 'Admissions (by date)', 0], ['enrolments', 'Course enrolments (all)', 0], ['students', 'Student list', 0], ['enquiries', 'Enquiries', 0], ['attendance', 'Attendance summary', 0],
    ['collection', 'Fee collection (payments)', 1], ['receipts', 'Receipts register', 1], ['modes', 'Payment-mode summary', 1], ['outstanding', 'Outstanding balances', 1]];
  async function reports() {
    if (!S.ready) return S.failed ? notReady() : (V().innerHTML = '<p class="hint">Loading…</p>');
    const { data: cs } = await sb.from('courses').select('id,name').order('name');
    const kinds = KINDS.filter((k) => !k[2] || moneyOk());
    const [f0, t0] = period('month');
    V().innerHTML = `<div class="bar"><h1>Reports &amp; Export</h1></div>
      <div class="panel"><div class="br-row">
        <div class="field"><label for="rk">Report</label><select class="input" id="rk">${kinds.map((k) => `<option value="${k[0]}">${k[1]}</option>`).join('')}</select></div>
        <div class="field"><label for="rf">From</label><input class="input" type="date" id="rf" value="${f0}"></div>
        <div class="field"><label for="rt">To</label><input class="input" type="date" id="rt" value="${t0}"></div>
        <div class="field"><label for="rc">Course</label><select class="input" id="rc"><option value="">All courses</option>${(cs || []).map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
        <div class="field"><label for="rs">Status</label><select class="input" id="rs"><option value="">Any</option><option>Active</option><option>Completed</option><option>Dropped</option><option>Registered</option><option>Inactive</option><option>New</option><option>Contacted</option><option>Follow-up Required</option><option>Admission Confirmed</option><option>Closed</option></select></div>
        <button class="btn btn-primary btn-sm" id="rgo">Run</button><button class="btn btn-outline btn-sm" id="rcsv" disabled>Export CSV</button></div>
        <p class="br-note">Branch: <b>${S.cur ? esc(curBranch().name) : 'All branches'}</b> — change it from the menu. Branch-wise reports never mix other branches' money. Status filter applies to enrolment, student or enquiry status as relevant.</p></div>
      <div class="panel" id="rout"><p class="hint">Choose a report and press Run.</p></div>`;
    let rows = [];
    $('#rgo').addEventListener('click', async () => {
      const k = $('#rk').value, out = $('#rout'); out.innerHTML = '<p class="hint">Loading…</p>';
      const { data, error } = await sb.rpc('branch_report', { p_kind: k, p_branch: S.cur || null, p_from: $('#rf').value || null, p_to: $('#rt').value || null, p_course: $('#rc').value || null, p_status: $('#rs').value || null });
      if (error) { out.innerHTML = ''; return fail(error); }
      rows = data || []; $('#rcsv').disabled = !rows.length;
      const cols = rows.length ? Object.keys(rows[0]) : [];
      const note = rows.length >= 5000 ? '<p class="br-note">Showing the first 5,000 rows. Narrow the dates to see the rest.</p>' : '';
      out.innerHTML = `<p class="hint">${rows.length} row(s)</p>${tbl(cols, rows.slice(0, 500).map((r) => cols.map((c) => esc(r[c] == null ? '' : r[c]))))}${rows.length > 500 ? '<p class="br-note">Preview shows the first 500 rows — the CSV contains all of them.</p>' : ''}${note}`;
    });
    $('#rcsv').addEventListener('click', () => csv(rows, `${$('#rk').value}-${ctx()}-${$('#rf').value}_${$('#rt').value}`));
  }

  /* ---------- Branches & staff (owner) ---------- */
  const TITLES = [['', 'Administrator / owner (no limit)'], ['branch_admin', 'Branch admin'], ['accountant', 'Accountant'], ['reception', 'Reception'], ['teacher', 'Teacher (no fees)']];
  async function branchmgr() {
    if (!S.ready) return S.failed ? notReady() : (V().innerHTML = '<p class="hint">Loading…</p>');
    if (!isOwner()) { V().innerHTML = '<div class="panel"><h2>Owner only</h2><p>Only the owner can manage branches and staff access.</p></div>'; return; }
    const [{ data: st, error: e1 }, { data: lg, error: e2 }, { data: un }, { data: au }] = await Promise.all([
      sb.rpc('staff_directory'), sb.rpc('legacy_summary'),
      oFrom('admission_enquiries').select('id,ref_no,student_name,course_name,created_at,preferred_branch_id').is('branch_id', null).order('created_at', { ascending: false }).limit(50),
      oFrom('audit_log').select('*').order('at', { ascending: false }).limit(100)]);
    if (e1 || e2) return fail(e1 || e2);
    const bn = (id) => { const b = S.list.find((x) => x.id === id); return b ? b.name.replace(/^.*?–\s*/, '') : '—'; };
    const bsel = (id, empty) => `<select class="input" id="${id}">${empty ? `<option value="">${empty}</option>` : ''}${S.list.filter((b) => b.is_active).map((b) => `<option value="${b.id}">${esc(b.name.replace(/^.*?–\s*/, ''))}</option>`).join('')}</select>`;
    V().innerHTML = `<div class="bar"><h1>Branches &amp; Staff</h1></div>
      <div class="panel"><div class="bar"><h3>Branches</h3><button class="btn btn-primary btn-sm" id="nb">Add branch</button></div>
        ${tbl(['Code', 'Name', 'Address', 'Phone', 'Status', ''], S.list.map((b) => [`<b>${esc(b.code)}</b>`, esc(b.name), esc(b.address || ''), esc(b.phone || ''), b.is_active ? '<span class="br-tag">Active</span>' : '<span class="br-tag warn">Inactive</span>', `<button class="btn btn-outline btn-sm" data-eb="${b.id}">Edit</button>`]))}</div>
      <div class="panel"><h3>Staff access</h3><p class="br-note">Create the login first in Supabase → Authentication and add the person to <code>admin_users</code> (same as before). Then set the branch access here. Existing staff keep full access until you restrict them.</p>
        ${tbl(['Name', 'Email', 'Role', 'Access', 'Branches', ''], (st || []).map((u) => [esc(u.name || ''), esc(u.email || ''), esc(u.role), u.scope === 'all' ? '<span class="br-tag">All branches</span>' : `<span class="br-tag warn">${esc((TITLES.find((t) => t[0] === (u.title || '')) || [0, 'Limited'])[1])}</span>`, u.scope === 'all' ? 'All' : esc((u.branches || []).map(bn).join(', ')), `<button class="btn btn-outline btn-sm" data-es="${u.user_id}">Edit access</button>`]))}</div>
      <div class="panel"><h3>Legacy records (created before branches)</h3>
        <p class="br-note">Nothing is assigned automatically. Records stay "Unmapped" and visible only to all-branch users until you map them. Receipt numbers of old payments never change.</p>
        <div class="stats">${['students', 'enrolments', 'payments', 'attendance', 'enquiries'].map((k) => `<div class="stat"><b>${lg[k]}</b><span>Unmapped ${k}</span></div>`).join('')}</div>
        <div class="br-row"><div class="field"><label>Map to branch</label>${bsel('mb')}</div><div class="field" style="flex:1;min-width:14rem"><label>Students (leave empty = ALL unmapped students)</label>
          <select class="input" id="ms" multiple size="5">${(lg.students_list || []).map((s) => `<option value="${s.id}">${esc(s.reg_no)} · ${esc(s.name)}</option>`).join('')}</select></div></div>
        <label style="display:block;margin:.4rem 0 .8rem"><input type="checkbox" id="mq"> also map all unassigned enquiries to this branch</label>
        <button class="btn btn-primary btn-sm" id="mgo">Map selected legacy records</button></div>
      <div class="panel"><h3>Unassigned enquiries</h3><p class="br-note">Website enquiries do not know their branch. The visitor's preferred branch is shown, but you decide.</p>
        ${tbl(['Ref', 'Name', 'Course', 'Preferred', 'Assign'], (un || []).map((e) => [esc(e.ref_no), esc(e.student_name), esc(e.course_name || ''), e.preferred_branch_id ? `<span class="br-tag">${esc(code(e.preferred_branch_id))}</span>` : '—', `<span style="display:flex;gap:.4rem">${S.list.filter((b) => b.is_active).map((b) => `<button class="btn btn-outline btn-sm" data-aq="${e.id}" data-ab="${b.id}">${esc(b.code)}</button>`).join('')}</span>`]))}</div>
      <div class="panel"><h3>Audit log <span class="hint">· last 100 critical actions</span></h3>
        ${tbl(['When', 'Who', 'Action', 'Branch', 'Details'], (au || []).map((a) => [esc(new Date(a.at).toLocaleString('en-IN')), esc(a.actor_name || 'system'), `<b>${esc(a.action.replace(/_/g, ' '))}</b>`, esc(code(a.branch_id) || '—'), `<span class="hint">${esc(JSON.stringify(a.details || {}).slice(0, 140))}</span>`]))}</div>`;

    const branchForm = (b) => {
      const m = modal(`<h2>${b ? 'Edit' : 'Add'} branch</h2><form id="bf" class="form-grid">
        <div class="field"><label>Code (2–6 letters/digits)</label><input class="input" name="code" required maxlength="6" pattern="[A-Za-z0-9]{2,6}" value="${esc(b ? b.code : '')}" ${b ? 'readonly' : ''}></div>
        <div class="field"><label>Name</label><input class="input" name="name" required maxlength="120" value="${esc(b ? b.name : '')}"></div>
        <div class="field full"><label>Address</label><textarea class="input" name="address" rows="2" maxlength="300">${esc(b ? b.address || '' : '')}</textarea></div>
        <div class="field"><label>Phone</label><input class="input" name="phone" maxlength="60" value="${esc(b ? b.phone || '' : '')}"></div>
        <div class="field"><label>Status</label><select class="input" name="active"><option value="1"${!b || b.is_active ? ' selected' : ''}>Active</option><option value="0"${b && !b.is_active ? ' selected' : ''}>Inactive</option></select></div>
        <div class="field full"><button class="btn btn-primary" type="submit">Save</button> <button class="btn btn-outline" type="button" data-close>Cancel</button></div></form>`);
      m.el.querySelector('#bf').addEventListener('submit', async (e) => {
        e.preventDefault(); const f = e.target.elements;
        const { error } = await sb.rpc('upsert_branch', { p_id: b ? b.id : null, p_code: f.code.value, p_name: f.name.value, p_address: f.address.value, p_phone: f.phone.value, p_active: f.active.value === '1' });
        if (error) return fail(error); m.close(); toast('Branch saved'); S.started = false; S.ready = false; await init(); branchmgr();
      });
    };
    $('#nb').addEventListener('click', () => branchForm(null));
    V().querySelectorAll('[data-eb]').forEach((x) => x.addEventListener('click', () => branchForm(S.list.find((b) => b.id === x.dataset.eb))));
    V().querySelectorAll('[data-es]').forEach((x) => x.addEventListener('click', () => {
      const u = st.find((y) => y.user_id === x.dataset.es);
      const m = modal(`<h2>Access: ${esc(u.name || u.email || '')}</h2><form id="sf" class="form-grid">
        <div class="field full"><label>Scope</label><select class="input" name="scope"><option value="all"${u.scope === 'all' ? ' selected' : ''}>All branches</option><option value="assigned"${u.scope === 'assigned' ? ' selected' : ''}>Only the branches ticked below</option></select></div>
        <div class="field full"><label>Role in branch</label><select class="input" name="title">${TITLES.map((t) => `<option value="${t[0]}"${(u.title || '') === t[0] ? ' selected' : ''}>${t[1]}</option>`).join('')}</select></div>
        <div class="field full"><label>Branches</label>${S.list.map((b) => `<label style="display:block"><input type="checkbox" name="b" value="${b.id}"${(u.branches || []).includes(b.id) ? ' checked' : ''}> ${esc(b.name)}</label>`).join('')}</div>
        <p class="br-note full">Branch admin: everything in the branch incl. reversals and reports. Accountant: fees, receipts, reversals, reports. Reception: admissions, attendance, take payments and print receipts; no reversals or financial reports. Teacher: attendance and students, no fees.</p>
        <div class="field full"><button class="btn btn-primary" type="submit">Save</button> <button class="btn btn-outline" type="button" data-close>Cancel</button></div></form>`);
      m.el.querySelector('#sf').addEventListener('submit', async (e) => {
        e.preventDefault(); const f = e.target.elements;
        const bs = [...e.target.querySelectorAll('input[name=b]:checked')].map((c) => c.value);
        const { error } = await sb.rpc('set_staff_access', { p_user: u.user_id, p_scope: f.scope.value, p_title: f.title.value || null, p_branches: bs });
        if (error) return fail(error); m.close(); toast('Access updated'); branchmgr();
      });
    }));
    $('#mgo').addEventListener('click', async () => {
      const ids = [...$('#ms').selectedOptions].map((o) => o.value);
      if (!confirm(`Map ${ids.length ? ids.length + ' selected student(s)' : 'ALL unmapped students'} (with their enrolments, payments and attendance) to ${bn($('#mb').value)}?\nThis can only be changed later by the owner.`)) return;
      const { data, error } = await sb.rpc('map_legacy_records', { p_branch: $('#mb').value, p_student_ids: ids.length ? ids : null, p_include_enquiries: $('#mq').checked });
      if (error) return fail(error); toast(`Mapped: ${data.students} students, ${data.enrolments} enrolments, ${data.payments} payments, ${data.attendance} attendance rows`); branchmgr();
    });
    V().querySelectorAll('[data-aq]').forEach((x) => x.addEventListener('click', async () => {
      const { error } = await sb.rpc('assign_enquiry_branch', { p_enquiry: x.dataset.aq, p_branch: x.dataset.ab }); if (error) return fail(error); toast('Enquiry assigned'); branchmgr();
    }));
  }

  EXT.nav.push(['bdash', 'Branch Dashboard'], ['reports', 'Reports & Export'], ['branchmgr', 'Branches & Staff', true]);
  EXT.views.bdash = bdash; EXT.views.reports = reports; EXT.views.branchmgr = branchmgr;
  EXT.branches = { state: S, current: () => S.cur, canReverse: () => me().role === 'admin' || ['branch_admin', 'accountant'].includes(title()) };
})();
