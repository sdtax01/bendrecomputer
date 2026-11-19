/* Admin: Students, Fees, Attendance, Study Material, Assignments, Certificates.
   Plugs into admin.js through window.BCTI_ADMIN_EXT. */
(function () {
  const EXT = window.BCTI_ADMIN_EXT;
  if (!EXT || !EXT.api) return;                         // admin.js stopped early (setup needed)
  const { sb, esc, $, toast, fail, modal, uid, go, V } = EXT.api;

  const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const fmt = (d) => (d ? window.BCTI_CERT.fmt(d) : '—');
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const size = (n) => (!n ? '' : n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  const safeName = (n) => String(n).replace(/[^A-Za-z0-9._-]+/g, '_');
  const csvQ = (v) => { let s = String(v ?? ''); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  const downloadCsv = (name, head, rows) => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + [head.map(csvQ).join(',')].concat(rows.map((r) => r.map(csvQ).join(','))).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const guard = (view) => EXT.api.current === view;      // ignore async results if the admin has navigated away

  /* ================= shared helpers ================= */
  async function signed(bucket, path, name) {
    const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 120, name ? { download: name } : undefined);
    if (error) throw error; return data.signedUrl;
  }
  async function contactInfo() {
    const { data } = await sb.from('website_settings').select('value').eq('key', 'contact').maybeSingle();
    return (data && data.value) || {};
  }
  async function makeCertificate(enr, st, kind) {
    let photo = null;
    if (st.photo_path) { const { data } = await sb.storage.from('student-files').download(st.photo_path); photo = data || null; }
    const c = await contactInfo();
    const cv = await window.BCTI_CERT.render({
      name: st.full_name, regNo: st.reg_no, course: enr.courses?.name, duration: enr.courses?.duration, startDate: enr.start_date, completedOn: enr.completed_on,
      issuedOn: enr.certificate_issued_on, grade: enr.grade, certNo: enr.certificate_no, photo,
      institute: { name: c.institute_name, address: c.address, phone: c.phone }
    });
    return window.BCTI_CERT.save(cv, `Certificate-${enr.courses?.name}-${st.full_name}`, kind);
  }
  async function withBusy(btn, label, fn) {
    const old = btn.textContent; btn.disabled = true; btn.textContent = label;
    try { await fn(); } catch (e) { fail(e); }
    btn.disabled = false; btn.textContent = old;
  }
  async function callAuth(student_id, password) {
    const { data, error } = await sb.functions.invoke('student-auth', { body: { student_id, password: password || undefined } });
    if (error) {
      let m = error.message || 'Request failed';
      try { const j = await error.context.json(); if (j && j.error) m = j.error; } catch (e) { /* keep */ }
      if (/failed to send|fetch|not found|404/i.test(m)) m = 'The "student-auth" function is not deployed yet. See README → "Deploy the student-auth function".';
      throw new Error(m);
    }
    if (data && data.error) throw new Error(data.error);
    return data;
  }
  function credentialsModal(st, res) {
    const url = location.origin + location.pathname.replace(/admin\/.*$/, '') + 'student/';
    const text = `Hello ${st.full_name}, your Bendre Computer Typing Institute student login is ready.\nLogin: ${url}\nLogin ID (email): ${res.email}\nPassword: ${res.password}\nPlease change your password after signing in (Settings).`;
    const m = modal(`<h2>${res.created ? 'Login created' : 'Password reset'}</h2>
      <p class="sub" style="margin:0 0 1rem">Share these details with <b>${esc(st.full_name)}</b>. The password is shown only now — it cannot be viewed again, only reset.</p>
      <div class="panel" style="background:#faf8f2"><p><b>Login ID:</b> ${esc(res.email)}</p><p><b>Password:</b> <code style="font-size:1.1rem;user-select:all">${esc(res.password)}</code></p><p class="hint">Student login page: ${esc(url)}</p></div>
      <div class="modal-actions"><button class="btn btn-ghost" id="cp">Copy details</button>
      <a class="btn" style="background:#25d366;color:#fff" target="_blank" rel="noopener" href="https://wa.me/91${esc(st.whatsapp || st.mobile)}?text=${encodeURIComponent(text)}">Send on WhatsApp</a>
      <button class="btn btn-primary" data-close>Done</button></div>`);
    $('#cp', m.el).addEventListener('click', async () => { try { await navigator.clipboard.writeText(text); toast('Copied'); } catch (e) { toast('Copy failed — select the text manually', true); } });
  }
  function printReceipt(pay, st, enr, fees, c) {
    const w = window.open('', '_blank'); if (!w) return toast('Allow pop-ups to print the receipt', true);
    w.document.write(`<!doctype html><title>${esc(pay.receipt_no)}</title><meta charset="utf-8"><style>
      body{font-family:Segoe UI,Arial,sans-serif;color:#0b2454;margin:0;padding:24px}.r{max-width:720px;margin:auto;border:2px solid #0b2454;border-radius:10px;padding:28px}
      h1{margin:0;font-size:22px}.row{display:flex;justify-content:space-between;gap:16px;margin:6px 0}.big{font-size:28px;font-weight:800;color:#0866d8}
      table{width:100%;border-collapse:collapse;margin-top:14px}td{padding:7px 4px;border-bottom:1px solid #dde3f0}.s{display:flex;justify-content:space-between;margin-top:46px;font-size:13px}
      .m{color:#5a6784;font-size:13px}@media print{button{display:none}}</style><div class="r">
      <h1>${esc(c.institute_name || 'Bendre Computer Typing Institute')}</h1><div class="m">${esc(c.address || '')}${c.phone ? ' · Phone: ' + esc(c.phone) : ''}</div><hr>
      <div class="row"><b>FEE RECEIPT</b><span>Receipt No: <b>${esc(pay.receipt_no)}</b></span></div><div class="row"><span>Date: ${fmt(pay.paid_on)}</span><span>Mode: ${esc(pay.mode)}${pay.reference ? ' (' + esc(pay.reference) + ')' : ''}</span></div>
      <table><tr><td>Student</td><td><b>${esc(st.full_name)}</b></td></tr><tr><td>Registration No.</td><td>${esc(st.reg_no)}</td></tr><tr><td>Course</td><td>${esc(enr.courses?.name || '')}</td></tr>
      <tr><td>Total course fee</td><td>${inr(fees.total)}</td></tr><tr><td>Total paid till date</td><td>${inr(fees.paid)}</td></tr><tr><td>Balance due</td><td>${inr(fees.balance)}</td></tr></table>
      <p class="m" style="margin-top:18px">Amount received</p><div class="big">${inr(pay.amount)}</div>${pay.note ? `<p class="m">${esc(pay.note)}</p>` : ''}
      <div class="s"><span>Student signature</span><span>Authorised signatory</span></div></div><p style="text-align:center"><button onclick="print()">Print</button></p>`);
    w.document.close(); setTimeout(() => w.print(), 400);
  }
  const feeOf = (enr, pays) => { const paid = pays.filter((p) => p.enrollment_id === enr.id).reduce((a, p) => a + Number(p.amount), 0); return { total: Number(enr.total_fee || 0), paid, balance: Number(enr.total_fee || 0) - paid }; };

  /* payment form shared by Student page and Fees page */
  function paymentForm(enr, st, fees, done) {
    const m = modal(`<h2>Record payment</h2><p class="sub" style="margin:0 0 1rem"><b>${esc(st.full_name)}</b> · ${esc(enr.courses?.name)} · Balance ${inr(fees.balance)}</p>
      <form id="pf"><div class="fgrid">
      <div class="field"><label>Amount (₹) *</label><input class="input" name="amount" type="number" min="1" step="0.01" required value="${fees.balance > 0 ? fees.balance : ''}"></div>
      <div class="field"><label>Date *</label><input class="input" name="paid_on" type="date" required value="${today()}"></div>
      <div class="field"><label>Mode</label><select class="input" name="mode">${['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Card', 'Other'].map((x) => `<option>${x}</option>`).join('')}</select></div>
      <div class="field"><label>Reference / UPI txn / cheque no.</label><input class="input" name="reference" maxlength="80"></div>
      <div class="field full"><label>Note</label><input class="input" name="note" maxlength="200"></div></div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" type="submit">Save payment</button></div></form>`);
    $('#pf', m.el).addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.target, b = $('button[type=submit]', f); b.disabled = true;
      try {
        const amt = parseFloat(f.amount.value);
        if (!(amt > 0)) throw new Error('Enter a valid amount');
        if (amt > fees.balance + 0.001 && !confirm(`This is more than the balance (${inr(fees.balance)}). Record it anyway?`)) { b.disabled = false; return; }
        const { data, error } = await sb.from('fee_payments').insert({ student_id: st.id, enrollment_id: enr.id, amount: amt, paid_on: f.paid_on.value, mode: f.mode.value, reference: f.reference.value.trim() || null, note: f.note.value.trim() || null }).select().single();
        if (error) throw error;
        toast('Payment recorded · ' + data.receipt_no); m.close();
        if (confirm('Print receipt now?')) printReceipt(data, st, enr, { total: fees.total, paid: fees.paid + amt, balance: fees.balance - amt }, await contactInfo());
        done();
      } catch (er) { fail(er); b.disabled = false; }
    });
  }

  /* ================= STUDENTS (list) ================= */
  async function students() {
    const [{ data: ss, error }, { data: enr }, { data: pays }] = await Promise.all([
      sb.from('students').select('*').order('serial', { ascending: false }),
      sb.from('student_courses').select('id,student_id,status,total_fee,courses(name)'),
      sb.from('fee_payments').select('student_id,amount')]);
    if (error) throw error;
    const paid = {}; (pays || []).forEach((p) => { paid[p.student_id] = (paid[p.student_id] || 0) + Number(p.amount); });
    const info = {}; (enr || []).forEach((e) => { const i = info[e.student_id] = info[e.student_id] || { names: [], fee: 0 }; if (e.status !== 'Dropped') { i.names.push(e.courses?.name); i.fee += Number(e.total_fee); } });
    V().innerHTML = `<div class="bar"><div><h1>Students</h1><p class="sub" style="margin:0">Student master. A registration number is generated automatically from the admission form.</p></div>
      <button class="btn btn-primary" id="add">+ Add student</button></div>
      <div class="filters"><input class="input" id="s" placeholder="Search name, reg. no, mobile, email…" aria-label="Search"><select class="input" id="fl" aria-label="Login"><option value="">All</option><option value="no">No login yet</option><option value="yes">Login created</option><option value="due">Fee balance due</option></select></div>
      <p class="hint" id="cnt"></p><div class="panel tbl-wrap"><table class="tbl"><thead><tr><th>Reg. no</th><th>Student</th><th>Contact</th><th>Courses</th><th>Fee balance</th><th>Login</th><th></th></tr></thead><tbody id="tb"></tbody></table></div>`;
    const draw = () => {
      const t = $('#s').value.trim().toLowerCase(), f = $('#fl').value;
      const rows = ss.filter((s) => (!t || [s.full_name, s.reg_no, s.mobile, s.email].some((x) => String(x || '').toLowerCase().includes(t)))
        && (!f || (f === 'no' ? !s.user_id : f === 'yes' ? !!s.user_id : ((info[s.id]?.fee || 0) - (paid[s.id] || 0)) > 0)));
      $('#cnt').textContent = `${rows.length} of ${ss.length} students`;
      $('#tb').innerHTML = rows.map((s) => { const bal = (info[s.id]?.fee || 0) - (paid[s.id] || 0);
        return `<tr><td><b>${esc(s.reg_no)}</b></td><td><b>${esc(s.full_name)}</b><div class="hint">${esc(s.guardian_name ? 'Guardian: ' + s.guardian_name : '')}</div></td>
        <td>${esc(s.mobile)}<div class="hint">${esc(s.email)}</div></td><td>${esc((info[s.id]?.names || []).join(', ') || '—')}</td>
        <td>${bal > 0 ? `<b style="color:var(--err)">${inr(bal)}</b>` : (info[s.id]?.fee ? '<span class="pill ok">Paid</span>' : '—')}</td>
        <td><span class="pill ${s.user_id ? 'ok' : 'draft'}">${s.user_id ? 'Created' : 'Not yet'}</span></td>
        <td><button class="btn btn-ghost btn-sm" data-o="${s.id}">Open</button></td></tr>`; }).join('') || '<tr><td colspan="7">No students found.</td></tr>';
    };
    $('#s').addEventListener('input', draw); $('#fl').addEventListener('change', draw); draw();
    $('#tb').addEventListener('click', (e) => { const b = e.target.closest('[data-o]'); if (b) go('studentDetail', b.dataset.o); });
    $('#add').addEventListener('click', addStudentForm);
  }

  function addStudentForm() {
    const m = modal(`<h2>Add student</h2><form id="af"><div class="fgrid">
      <div class="field"><label>Full name *</label><input class="input" name="name" required maxlength="100"></div>
      <div class="field"><label>Guardian name</label><input class="input" name="guardian" maxlength="100"></div>
      <div class="field"><label>Mobile *</label><input class="input" name="mobile" type="tel" required maxlength="16"></div>
      <div class="field"><label>WhatsApp</label><input class="input" name="wa" type="tel" maxlength="16"></div>
      <div class="field"><label>Email * (student login ID)</label><input class="input" name="email" type="email" required maxlength="120"></div>
      <div class="field"><label>Date of birth *</label><input class="input" name="dob" type="date" required max="${today()}"></div>
      <div class="field"><label>Gender</label><select class="input" name="gender"><option value="">Select</option><option>Male</option><option>Female</option><option>Other</option></select></div>
      <div class="field"><label>Qualification</label><input class="input" name="qual" maxlength="60"></div>
      <div class="field full"><label>Address</label><textarea class="input" name="addr" rows="2" maxlength="400"></textarea></div></div>
      <p class="hint">Registration no. = serial – last 4 digits of mobile – birth year (YY), e.g. 001-7708-98.</p>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" type="submit">Create student</button></div></form>`);
    $('#af', m.el).addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.target, b = $('button[type=submit]', f); b.disabled = true;
      try {
        const { data, error } = await sb.rpc('admin_add_student', { p_name: f.name.value, p_guardian: f.guardian.value, p_mobile: f.mobile.value, p_whatsapp: f.wa.value, p_email: f.email.value, p_dob: f.dob.value, p_gender: f.gender.value, p_qualification: f.qual.value, p_address: f.addr.value });
        if (error) throw error;
        toast('Student created · ' + data); m.close();
        const { data: s } = await sb.from('students').select('id').eq('reg_no', data).maybeSingle(); go('studentDetail', s ? s.id : undefined);
      } catch (er) { fail(er); b.disabled = false; }
    });
  }

  /* ================= STUDENT DETAIL ================= */
  async function studentDetail(id) {
    if (!id) return go('students');
    const [{ data: s, error }, { data: enr }, { data: pays }, { data: cs }] = await Promise.all([
      sb.from('students').select('*').eq('id', id).maybeSingle(),
      sb.from('student_courses').select('*,courses(name,duration)').eq('student_id', id).order('created_at'),
      sb.from('fee_payments').select('*').eq('student_id', id).order('paid_on', { ascending: false }),
      sb.from('courses').select('id,name,fee').order('sort_order')]);
    if (error || !s) throw error || new Error('Student not found');
    let photo = ''; if (s.photo_path) { try { photo = await signed('student-files', s.photo_path); } catch (e) { /* no photo */ } }
    const enrolled = new Set((enr || []).map((e) => e.course_id));
    const totals = (enr || []).filter((e) => e.status !== 'Dropped').reduce((a, e) => { const f = feeOf(e, pays || []); a.t += f.total; a.p += f.paid; return a; }, { t: 0, p: 0 });
    V().innerHTML = `<div id="sd"><p><button class="btn btn-ghost btn-sm" id="back">← All students</button></p>
    <div class="panel" style="display:flex;gap:1.2rem;flex-wrap:wrap;align-items:flex-start">
      <div style="width:6rem;height:7.5rem;border-radius:.7rem;background:var(--soft);overflow:hidden;flex:none">${photo ? `<img src="${esc(photo)}" alt="Student photo" style="width:100%;height:100%;object-fit:cover">` : '<div style="height:100%;display:grid;place-items:center;color:var(--muted);font-size:.8rem">No photo</div>'}</div>
      <div style="flex:1;min-width:14rem"><h1 style="margin-bottom:.2rem">${esc(s.full_name)}</h1><p class="sub" style="margin:0 0 .6rem">Reg. no <b>${esc(s.reg_no)}</b> · <span class="pill ${s.user_id ? 'ok' : 'draft'}">${s.user_id ? 'Login created' : 'No login yet'}</span></p>
        <p class="hint" style="font-size:.88rem">Mobile ${esc(s.mobile)}${s.whatsapp ? ' · WA ' + esc(s.whatsapp) : ''} · ${esc(s.email)}<br>DOB ${fmt(s.dob)}${s.gender ? ' · ' + esc(s.gender) : ''}${s.qualification ? ' · ' + esc(s.qualification) : ''}${s.guardian_name ? ' · Guardian: ' + esc(s.guardian_name) : ''}<br>${esc(s.address || '')}</p>
        ${s.about ? `<p class="hint">“${esc(s.about)}”</p>` : ''}</div>
      <div class="row-actions" style="flex-direction:column;align-items:stretch"><button class="btn btn-primary btn-sm" id="login">${s.user_id ? 'Reset password' : 'Create login'}</button><button class="btn btn-ghost btn-sm" id="edit">Edit details</button><button class="btn btn-danger btn-sm" id="del">Delete student</button></div></div>

    <div class="panel"><div class="bar"><h3>Courses &amp; fees <span class="hint">· billed ${inr(totals.t)} · paid ${inr(totals.p)} · balance <b>${inr(totals.t - totals.p)}</b></span></h3><button class="btn btn-primary btn-sm" id="enrol">+ Enrol in course</button></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Course</th><th>Status</th><th>Fee</th><th>Paid</th><th>Balance</th><th></th></tr></thead><tbody>
      ${(enr || []).map((e) => { const f = feeOf(e, pays || []); return `<tr><td><b>${esc(e.courses?.name)}</b><div class="hint">Started ${fmt(e.start_date)}${e.completed_on ? ' · Completed ' + fmt(e.completed_on) : ''}${e.grade ? ' · Grade ' + esc(e.grade) : ''}${e.certificate_no ? '<br>Cert ' + esc(e.certificate_no) : ''}</div></td>
        <td><span class="pill ${e.status === 'Completed' ? 'ok' : 'draft'}">${e.status}</span></td><td>${inr(f.total)}</td><td>${inr(f.paid)}</td><td>${f.balance > 0 ? `<b style="color:var(--err)">${inr(f.balance)}</b>` : inr(0)}</td>
        <td><div class="row-actions"><button class="btn btn-ghost btn-sm" data-pay="${e.id}">Payment</button><button class="btn btn-ghost btn-sm" data-fee="${e.id}">Edit fee</button>
        ${e.certificate_no ? `<button class="btn btn-primary btn-sm" data-cert="${e.id}">Certificate</button>` : (e.status !== 'Dropped' ? `<button class="btn btn-primary btn-sm" data-done="${e.id}">Complete &amp; certify</button>` : '')}
        ${e.status === 'Active' ? `<button class="btn btn-danger btn-sm" data-drop="${e.id}">Drop</button>` : e.status === 'Dropped' ? `<button class="btn btn-ghost btn-sm" data-react="${e.id}">Re-activate</button>` : ''}</div></td></tr>`; }).join('') || '<tr><td colspan="6">Not enrolled in any course yet.</td></tr>'}</tbody></table></div></div>

    <div class="panel"><h3>Payment history</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Receipt</th><th>Date</th><th>Course</th><th>Amount</th><th>Mode</th><th></th></tr></thead><tbody>
      ${(pays || []).map((p) => { const e = enr.find((x) => x.id === p.enrollment_id); return `<tr><td><b>${esc(p.receipt_no)}</b></td><td>${fmt(p.paid_on)}</td><td>${esc(e?.courses?.name || '')}</td><td>${inr(p.amount)}</td><td>${esc(p.mode)}${p.reference ? `<div class="hint">${esc(p.reference)}</div>` : ''}</td>
        <td><div class="row-actions"><button class="btn btn-ghost btn-sm" data-rc="${p.id}">Receipt</button><button class="btn btn-danger btn-sm" data-dp="${p.id}">Delete</button></div></td></tr>`; }).join('') || '<tr><td colspan="6">No payments recorded.</td></tr>'}</tbody></table></div></div></div>`;

    const reload = () => go('studentDetail', id);
    $('#back').addEventListener('click', () => go('students'));
    $('#login').addEventListener('click', (ev) => {
      const m = modal(`<h2>${s.user_id ? 'Reset password' : 'Create student login'}</h2><p class="sub" style="margin:0 0 1rem">Login ID will be <b>${esc(s.email)}</b>. Leave the password blank to auto-generate a strong one.</p>
        <div class="field"><label>Password (optional, min. 8 characters)</label><input class="input" id="npw" minlength="8" autocomplete="off"></div>
        <div class="modal-actions"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="go">${s.user_id ? 'Reset password' : 'Create login'}</button></div>`);
      $('#go', m.el).addEventListener('click', (e) => withBusy(e.target, 'Working…', async () => {
        const pw = $('#npw', m.el).value.trim(); if (pw && pw.length < 8) throw new Error('Password must be at least 8 characters');
        const res = await callAuth(s.id, pw); m.close(); credentialsModal(s, res); reload();
      }));
    });
    $('#edit').addEventListener('click', () => editStudent(s, reload));
    $('#del').addEventListener('click', async () => {
      if (!confirm(`Delete ${s.full_name} and ALL their enrolments, fees, attendance and submissions? This cannot be undone.`)) return;
      if (!confirm('Really delete? (Login account, if any, must be removed separately in Supabase → Authentication.)')) return;
      const { error: er } = await sb.from('students').delete().eq('id', s.id); if (er) return fail(er);
      if (s.photo_path) await sb.storage.from('student-files').remove([s.photo_path]);
      toast('Student deleted'); go('students');
    });
    $('#enrol').addEventListener('click', () => {
      const avail = cs.filter((c) => !enrolled.has(c.id)); if (!avail.length) return toast('Already enrolled in every course.', true);
      const m = modal(`<h2>Enrol in course</h2><form id="ef"><div class="fgrid">
        <div class="field full"><label>Course *</label><select class="input" name="c" id="ec">${avail.map((c) => `<option value="${c.id}" data-f="${esc(String(c.fee || '').replace(/[^0-9.]/g, ''))}">${esc(c.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Start date *</label><input class="input" type="date" name="d" required value="${today()}"></div>
        <div class="field"><label>Total fee (₹)</label><input class="input" type="number" min="0" step="0.01" name="fee" value="${esc(String(avail[0].fee || '').replace(/[^0-9.]/g, ''))}"></div></div>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" type="submit">Enrol</button></div></form>`);
      const f = $('#ef', m.el); f.c.addEventListener('change', () => { f.fee.value = f.c.selectedOptions[0].dataset.f || ''; });
      f.addEventListener('submit', async (e) => { e.preventDefault();
        const { error: er } = await sb.from('student_courses').insert({ student_id: s.id, course_id: f.c.value, start_date: f.d.value, total_fee: parseFloat(f.fee.value) || 0 });
        if (er) return fail(er);
        if (s.status === 'Registered') await sb.from('students').update({ status: 'Active' }).eq('id', s.id);
        toast('Enrolled'); m.close(); reload(); });
    });
    $('#sd').addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const d = b.dataset, en = (x) => enr.find((r) => r.id === x);
      if (d.pay) { const x = en(d.pay); paymentForm(x, s, feeOf(x, pays), reload); }
      if (d.fee) { const x = en(d.fee), v = prompt('Total fee for this course (₹):', x.total_fee); if (v === null) return; const n = parseFloat(v); if (!(n >= 0)) return toast('Enter a valid amount', true);
        const { error: er } = await sb.from('student_courses').update({ total_fee: n }).eq('id', x.id); if (er) return fail(er); toast('Fee updated'); reload(); }
      if (d.done) certifyForm(en(d.done), s, reload);
      if (d.cert) withBusy(b, 'Preparing…', () => makeCertificate(en(d.cert), s, 'pdf'));
      if (d.drop && confirm('Mark this enrolment as dropped?')) { const { error: er } = await sb.from('student_courses').update({ status: 'Dropped' }).eq('id', d.drop); if (er) return fail(er); reload(); }
      if (d.react) { const { error: er } = await sb.from('student_courses').update({ status: 'Active' }).eq('id', d.react); if (er) return fail(er); reload(); }
      if (d.rc) { const p = pays.find((x) => x.id === d.rc), x = en(p.enrollment_id); printReceipt(p, s, x, feeOf(x, pays), await contactInfo()); }
      if (d.dp && confirm('Delete this payment record?')) { const { error: er } = await sb.from('fee_payments').delete().eq('id', d.dp); if (er) return fail(er); toast('Payment deleted'); reload(); }
    });
  }

  function editStudent(s, done) {
    const m = modal(`<h2>Edit student</h2><form id="ef"><div class="fgrid">
      <div class="field"><label>Full name * <small>(printed on certificate)</small></label><input class="input" name="name" required maxlength="100" value="${esc(s.full_name)}"></div>
      <div class="field"><label>Guardian name</label><input class="input" name="guardian" maxlength="100" value="${esc(s.guardian_name)}"></div>
      <div class="field"><label>WhatsApp</label><input class="input" name="wa" maxlength="16" value="${esc(s.whatsapp)}"></div>
      <div class="field"><label>Email (login ID)</label><input class="input" name="email" type="email" required maxlength="120" value="${esc(s.email)}"></div>
      <div class="field"><label>Gender</label><select class="input" name="gender">${['', 'Male', 'Female', 'Other'].map((o) => `<option ${s.gender === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
      <div class="field"><label>Qualification</label><input class="input" name="qual" maxlength="60" value="${esc(s.qualification)}"></div>
      <div class="field full"><label>Address</label><textarea class="input" name="addr" rows="2" maxlength="400">${esc(s.address)}</textarea></div>
      <div class="field"><label>Status</label><select class="input" name="status">${['Registered', 'Active', 'Inactive'].map((o) => `<option ${s.status === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div></div>
      <p class="hint">Mobile, date of birth and registration number are fixed because the registration number is built from them. ${s.user_id ? 'If you change the email, use “Reset password” afterwards so the login ID is updated too.' : ''}</p>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" type="submit">Save</button></div></form>`);
    $('#ef', m.el).addEventListener('submit', async (e) => { e.preventDefault(); const f = e.target;
      const { error } = await sb.from('students').update({ full_name: f.name.value.trim(), guardian_name: f.guardian.value.trim() || null, whatsapp: f.wa.value.trim() || null, email: f.email.value.trim().toLowerCase(), gender: f.gender.value || null, qualification: f.qual.value.trim() || null, address: f.addr.value.trim() || null, status: f.status.value }).eq('id', s.id);
      if (error) return fail(/duplicate|unique/i.test(error.message) ? new Error('That email is already used by another student') : error);
      toast('Saved'); m.close(); done(); });
  }

  function certifyForm(enr, st, done) {
    const m = modal(`<h2>Complete course &amp; generate certificate</h2><p class="sub" style="margin:0 0 1rem"><b>${esc(st.full_name)}</b> · ${esc(enr.courses?.name)}</p>
      <form id="cf"><div class="fgrid"><div class="field"><label>Completion date *</label><input class="input" type="date" name="d" required value="${enr.completed_on || today()}" min="${enr.start_date}"></div>
      <div class="field"><label>Grade / result (optional)</label><input class="input" name="g" maxlength="20" placeholder="e.g. A, 85%, Distinction" value="${esc(enr.grade)}"></div></div>
      <p class="hint">${st.photo_path ? 'The student’s uploaded photo will be placed on the certificate.' : '⚠ This student has not uploaded a photo yet — the certificate will show an empty photo box. They can upload it in Settings, then you can download the certificate again.'}</p>
      <div id="fw"></div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" type="submit">Generate certificate</button></div></form>`);
    let balance = 0;
    if (!enr.certificate_no) sb.from('enrollment_fees').select('balance').eq('enrollment_id', enr.id).maybeSingle().then(({ data }) => {
      balance = Number(data && data.balance) || 0;
      if (balance > 0) $('#fw', m.el).innerHTML = `<div class="setup-banner" role="alert" style="margin:.8rem 0"><b>Fee balance pending: ${inr(balance)}</b><br><label style="display:flex;gap:.5rem;align-items:center;margin-top:.4rem;font-weight:500"><input type="checkbox" name="due"> Issue the certificate anyway</label></div>`;
    });
    $('#cf', m.el).addEventListener('submit', (e) => { e.preventDefault(); const f = e.target;
      withBusy($('button[type=submit]', f), 'Generating…', async () => {
        const allow = !!(f.due && f.due.checked);
        if (balance > 0 && !allow) throw new Error('A fee balance of ' + inr(balance) + ' is pending. Collect it, or tick “Issue the certificate anyway”.');
        const args = { p_enrollment: enr.id, p_completed_on: f.d.value, p_grade: f.g.value || null };
        let { data, error } = await sb.rpc('issue_certificate', { ...args, p_allow_due: allow });
        if (error && /PGRST202|schema cache|Could not find the function/i.test((error.code || '') + ' ' + error.message)) ({ data, error } = await sb.rpc('issue_certificate', args));   // older database (v5 SQL not run yet)
        if (error) throw error;
        await makeCertificate({ ...enr, ...data }, st, 'pdf'); toast('Certificate ' + data.certificate_no + ' generated'); m.close(); done();
      }); });
  }

  /* ================= FEES ================= */
  async function fees() {
    const [{ data: enr, error }, { data: pays }] = await Promise.all([
      sb.from('student_courses').select('*,students(id,full_name,reg_no,mobile,whatsapp,photo_path),courses(name,duration)').neq('status', 'Dropped').order('created_at', { ascending: false }),
      sb.from('fee_payments').select('*').order('paid_on', { ascending: false })]);
    if (error) throw error;
    const month = today().slice(0, 7);
    const billed = enr.reduce((a, e) => a + Number(e.total_fee), 0), collected = (pays || []).reduce((a, p) => a + Number(p.amount), 0);
    const thisMonth = (pays || []).filter((p) => p.paid_on.startsWith(month)).reduce((a, p) => a + Number(p.amount), 0);
    V().innerHTML = `<div class="bar"><div><h1>Fees</h1><p class="sub" style="margin:0">Fee status for every enrolment. Record payments and print receipts.</p></div><button class="btn btn-ghost" id="exp">Export CSV</button></div>
      <div class="stats"><div class="stat"><b>${inr(billed)}</b><span>Total billed</span></div><div class="stat"><b>${inr(collected)}</b><span>Collected</span></div><div class="stat"><b style="color:var(--err)">${inr(billed - collected)}</b><span>Outstanding</span></div><div class="stat"><b>${inr(thisMonth)}</b><span>Collected this month</span></div></div>
      <div class="filters"><input class="input" id="s" placeholder="Search student / reg. no / course…" aria-label="Search"><select class="input" id="fl" aria-label="Filter"><option value="">All</option><option value="due">Balance due</option><option value="paid">Fully paid</option></select></div>
      <div class="panel tbl-wrap"><table class="tbl"><thead><tr><th>Student</th><th>Course</th><th>Fee</th><th>Paid</th><th>Balance</th><th></th></tr></thead><tbody id="tb"></tbody></table></div>`;
    let rows = [];
    const draw = () => {
      const t = $('#s').value.trim().toLowerCase(), f = $('#fl').value;
      rows = enr.map((e) => ({ e, f: feeOf(e, pays || []) })).filter(({ e, f: x }) => (!t || [e.students?.full_name, e.students?.reg_no, e.courses?.name].some((v) => String(v || '').toLowerCase().includes(t))) && (!f || (f === 'due' ? x.balance > 0 : x.balance <= 0)));
      $('#tb').innerHTML = rows.map(({ e, f: x }, i) => `<tr><td><b>${esc(e.students?.full_name)}</b><div class="hint">${esc(e.students?.reg_no)} · ${esc(e.students?.mobile)}</div></td><td>${esc(e.courses?.name)}</td><td>${inr(x.total)}</td><td>${inr(x.paid)}</td>
        <td>${x.balance > 0 ? `<b style="color:var(--err)">${inr(x.balance)}</b>` : '<span class="pill ok">Paid</span>'}</td>
        <td><div class="row-actions"><button class="btn btn-primary btn-sm" data-p="${i}">Record payment</button><button class="btn btn-ghost btn-sm" data-s="${e.students?.id}">Student</button></div></td></tr>`).join('') || '<tr><td colspan="6">Nothing to show.</td></tr>';
    };
    $('#s').addEventListener('input', draw); $('#fl').addEventListener('change', draw); draw();
    $('#tb').addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.s) go('studentDetail', b.dataset.s);
      if (b.dataset.p !== undefined) { const { e, f } = rows[+b.dataset.p]; paymentForm(e, e.students, f, () => go('fees')); } });
    $('#exp').addEventListener('click', () => downloadCsv(`fees-${today()}.csv`, ['Reg no', 'Student', 'Mobile', 'Course', 'Total fee', 'Paid', 'Balance'], rows.map(({ e, f }) => [e.students?.reg_no, e.students?.full_name, e.students?.mobile, e.courses?.name, f.total, f.paid, f.balance])));
  }

  /* ================= ATTENDANCE ================= */
  async function attendance() {
    const { data: cs, error } = await sb.from('courses').select('id,name').order('sort_order'); if (error) throw error;
    V().innerHTML = `<h1>Attendance</h1><p class="sub">Mark daily attendance for a course. Students see it (view-only) in their portal.</p>
      <div class="panel"><div class="filters" style="margin:0"><select class="input" id="c" aria-label="Course">${cs.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select><input class="input" type="date" id="d" value="${today()}" max="${today()}" aria-label="Date"></div></div>
      <div id="area"></div>`;
    const load = async () => {
      const c = $('#c').value, d = $('#d').value; if (!c || !d) return;
      $('#area').innerHTML = '<p>Loading…</p>';
      const [{ data: en }, { data: at }] = await Promise.all([
        sb.from('student_courses').select('student_id,students(full_name,reg_no)').eq('course_id', c).eq('status', 'Active'),
        sb.from('attendance').select('*').eq('course_id', c).eq('att_date', d)]);
      if (!guard('attendance')) return;
      const cur = {}; (at || []).forEach((a) => { cur[a.student_id] = a.status; });
      const fresh = !(at || []).length;   // nothing saved for this date yet: start everyone as Present, teacher only changes the absentees
      const list = (en || []).sort((a, b) => String(a.students?.full_name).localeCompare(String(b.students?.full_name)));
      $('#area').innerHTML = list.length ? `<div class="panel"><div class="bar"><h3>${list.length} active students · ${fmt(d)}</h3><div class="row-actions"><button class="btn btn-ghost btn-sm" id="allp">All present</button><button class="btn btn-ghost btn-sm" id="alla">All absent</button><button class="btn btn-primary btn-sm" id="save">Save attendance</button></div></div>
        <p class="hint" id="acount" aria-live="polite"></p>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Reg. no</th><th>Student</th><th>Present</th><th>Absent</th><th>Leave</th></tr></thead><tbody>
        ${list.map((r) => `<tr><td>${esc(r.students?.reg_no)}</td><td><b>${esc(r.students?.full_name)}</b></td>${['Present', 'Absent', 'Leave'].map((s) => `<td><input type="radio" name="r_${r.student_id}" value="${s}" aria-label="${s}" ${(cur[r.student_id] || (fresh ? 'Present' : '')) === s ? 'checked' : ''}></td>`).join('')}</tr>`).join('')}</tbody></table></div>
        <p class="hint">${fresh ? 'Everyone starts as Present — change only the absent / leave students, then save. ' : 'Showing the saved attendance for this date. '}Saving again for the same date updates the earlier entry.</p></div>` : '<div class="panel"><p>No active students are enrolled in this course.</p></div>';
      const count = () => { const n = (s) => document.querySelectorAll(`#area input[value="${s}"]:checked`).length, p = n('Present'), a = n('Absent'), l = n('Leave'); const c = $('#acount'); if (c) c.textContent = `Present ${p} · Absent ${a} · Leave ${l} · Not marked ${list.length - p - a - l}`; };
      const setAll = (s) => { document.querySelectorAll(`#area input[value="${s}"]`).forEach((i) => { i.checked = true; }); count(); };
      const all = $('#allp'); if (all) all.addEventListener('click', () => setAll('Present'));
      const alla = $('#alla'); if (alla) alla.addEventListener('click', () => setAll('Absent'));
      const tb = document.querySelector('#area tbody'); if (tb) tb.addEventListener('change', count); count();
      const sv = $('#save'); if (sv) sv.addEventListener('click', () => withBusy(sv, 'Saving…', async () => {
        const rows = list.map((r) => { const x = document.querySelector(`input[name="r_${r.student_id}"]:checked`); return x ? { student_id: r.student_id, course_id: c, att_date: d, status: x.value } : null; }).filter(Boolean);
        if (!rows.length) throw new Error('Mark at least one student');
        const left = list.length - rows.length; if (left > 0 && !confirm(left + ' student(s) are not marked and will not be saved. Save anyway?')) return;
        const { error: er } = await sb.from('attendance').upsert(rows, { onConflict: 'student_id,course_id,att_date' }); if (er) throw er;
        toast(`Attendance saved for ${rows.length} students`);
      }));
    };
    $('#c').addEventListener('change', load); $('#d').addEventListener('change', load); load();
  }

  /* ================= STUDY MATERIAL ================= */
  async function materials() {
    const [{ data: cs }, { data: ms, error }] = await Promise.all([sb.from('courses').select('id,name').order('sort_order'), sb.from('study_materials').select('*,courses(name)').order('created_at', { ascending: false })]);
    if (error) throw error;
    V().innerHTML = `<div class="bar"><div><h1>Study Material</h1><p class="sub" style="margin:0">Upload PDFs per course. Only students enrolled in that course can download them.</p></div><button class="btn btn-primary" id="add">+ Upload material</button></div>
      <div class="filters"><select class="input" id="fc" aria-label="Course"><option value="">All courses</option>${cs.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
      <div class="panel tbl-wrap"><table class="tbl"><thead><tr><th>Title</th><th>Course</th><th>File</th><th>Updated</th><th>Visible</th><th></th></tr></thead><tbody id="tb"></tbody></table></div>`;
    const draw = () => { const c = $('#fc').value; const rows = ms.filter((m) => !c || m.course_id === c);
      $('#tb').innerHTML = rows.map((m) => `<tr><td><b>${esc(m.title)}</b><div class="hint">${esc(m.description || '')}</div></td><td>${esc(m.courses?.name)}</td><td>${esc(m.file_name || '')}<div class="hint">${size(m.file_size)}</div></td><td>${fmt(m.updated_at.slice(0, 10))}</td>
        <td><span class="pill ${m.is_published ? 'ok' : 'draft'}">${m.is_published ? 'Visible' : 'Hidden'}</span></td>
        <td><div class="row-actions"><button class="btn btn-ghost btn-sm" data-v="${m.id}">View</button><button class="btn btn-ghost btn-sm" data-e="${m.id}">Edit / replace</button><button class="btn btn-ghost btn-sm" data-t="${m.id}">${m.is_published ? 'Hide' : 'Show'}</button><button class="btn btn-danger btn-sm" data-d="${m.id}">Delete</button></div></td></tr>`).join('') || '<tr><td colspan="6">No material uploaded yet.</td></tr>'; };
    $('#fc').addEventListener('change', draw); draw();
    $('#add').addEventListener('click', () => { if (!cs.length) return toast('Add a course first.', true); materialForm(null, cs); });
    $('#tb').addEventListener('click', async (e) => { const b = e.target.closest('button'); if (!b) return; const d = b.dataset, m = ms.find((x) => x.id === (d.v || d.e || d.t || d.d)); if (!m) return;
      if (d.v) { try { window.open(await signed('materials', m.file_path), '_blank', 'noopener'); } catch (er) { fail(er); } }
      if (d.e) materialForm(m, cs);
      if (d.t) { const { error: er } = await sb.from('study_materials').update({ is_published: !m.is_published }).eq('id', m.id); if (er) return fail(er); go('materials'); }
      if (d.d && confirm(`Delete "${m.title}"? Students will no longer be able to download it.`)) { const { error: er } = await sb.from('study_materials').delete().eq('id', m.id); if (er) return fail(er); await sb.storage.from('materials').remove([m.file_path]); toast('Deleted'); go('materials'); } });
  }
  function materialForm(m, cs) {
    const dlg = modal(`<h2>${m ? 'Edit' : 'Upload'} study material</h2><form id="mf"><div class="fgrid">
      <div class="field"><label>Course *</label><select class="input" name="c" ${m ? 'disabled' : ''}>${cs.map((c) => `<option value="${c.id}" ${m?.course_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Title *</label><input class="input" name="t" required maxlength="140" value="${esc(m?.title)}"></div>
      <div class="field full"><label>Description</label><input class="input" name="ds" maxlength="300" value="${esc(m?.description)}"></div>
      <div class="field full"><label>${m ? 'Replace file (optional)' : 'File *'} — PDF (also Word / Excel / PowerPoint / ZIP / image), up to 25 MB</label><input type="file" name="f" ${m ? '' : 'required'} accept=".pdf,.docx,.xlsx,.pptx,.zip,.txt,.jpg,.jpeg,.png,.webp"></div>
      <label class="check full"><input type="checkbox" name="p" ${!m || m.is_published ? 'checked' : ''}> Visible to students</label></div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" type="submit">Save</button></div></form>`);
    $('#mf', dlg.el).addEventListener('submit', (e) => { e.preventDefault(); const f = e.target;
      withBusy($('button[type=submit]', f), 'Uploading…', async () => {
        const file = f.f.files[0]; const row = { title: f.t.value.trim(), description: f.ds.value.trim() || null, is_published: f.p.checked };
        if (file) {
          if (file.size > 25 * 1024 * 1024) throw new Error('File is larger than 25 MB');
          const course = m ? m.course_id : f.c.value, path = `${course}/${uid()}-${safeName(file.name)}`;
          const { error } = await sb.storage.from('materials').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false }); if (error) throw error;
          Object.assign(row, { file_path: path, file_name: file.name, file_size: file.size });
        }
        if (m) { const { error } = await sb.from('study_materials').update(row).eq('id', m.id); if (error) throw error; if (file) await sb.storage.from('materials').remove([m.file_path]); }
        else { const { error } = await sb.from('study_materials').insert({ ...row, course_id: f.c.value }); if (error) throw error; }
        toast('Saved'); dlg.close(); go('materials');
      }); });
  }

  /* ================= ASSIGNMENTS ================= */
  async function assignments() {
    const [{ data: cs }, { data: as, error }, { data: subs }] = await Promise.all([sb.from('courses').select('id,name').order('sort_order'),
      sb.from('assignments').select('*,courses(name)').order('due_date', { ascending: false }), sb.from('assignment_submissions').select('assignment_id,status')]);
    if (error) throw error;
    const cnt = (id, s) => (subs || []).filter((x) => x.assignment_id === id && (!s || x.status === s)).length;
    V().innerHTML = `<div class="bar"><div><h1>Assignments</h1><p class="sub" style="margin:0">Give tasks with a due date. Students see Pending / Submitted / Overdue status on their dashboard.</p></div><button class="btn btn-primary" id="add">+ New assignment</button></div>
      <div class="panel tbl-wrap"><table class="tbl"><thead><tr><th>Assignment</th><th>Course</th><th>Due</th><th>Submitted</th><th>Reviewed</th><th>Visible</th><th></th></tr></thead><tbody>
      ${as.map((a) => `<tr><td><b>${esc(a.title)}</b><div class="hint">${esc((a.description || '').slice(0, 90))}</div></td><td>${esc(a.courses?.name)}</td><td>${fmt(a.due_date)}${a.due_date < today() ? ' <span class="pill draft">Past</span>' : ''}</td><td>${cnt(a.id)}</td><td>${cnt(a.id, 'Reviewed')}</td>
        <td><span class="pill ${a.is_published ? 'ok' : 'draft'}">${a.is_published ? 'Visible' : 'Hidden'}</span></td>
        <td><div class="row-actions"><button class="btn btn-primary btn-sm" data-s="${a.id}">Submissions</button><button class="btn btn-ghost btn-sm" data-e="${a.id}">Edit</button><button class="btn btn-danger btn-sm" data-d="${a.id}">Delete</button></div></td></tr>`).join('') || '<tr><td colspan="7">No assignments yet.</td></tr>'}</tbody></table></div>`;
    $('#add').addEventListener('click', () => { if (!cs.length) return toast('Add a course first.', true); assignmentForm(null, cs); });
    $('.tbl-wrap', V()).addEventListener('click', async (e) => { const b = e.target.closest('button'); if (!b) return; const d = b.dataset, a = as.find((x) => x.id === (d.s || d.e || d.d)); if (!a) return;
      if (d.s) submissionsModal(a); if (d.e) assignmentForm(a, cs);
      if (d.d && confirm(`Delete "${a.title}" and all submissions?`)) { const { data: files } = await sb.from('assignment_submissions').select('file_path').eq('assignment_id', a.id);
        const { error: er } = await sb.from('assignments').delete().eq('id', a.id); if (er) return fail(er); await sb.storage.from('student-files').remove((files || []).map((x) => x.file_path).filter(Boolean)); toast('Deleted'); go('assignments'); } });
  }
  function assignmentForm(a, cs) {
    const m = modal(`<h2>${a ? 'Edit' : 'New'} assignment</h2><form id="af"><div class="fgrid">
      <div class="field"><label>Course *</label><select class="input" name="c">${cs.map((c) => `<option value="${c.id}" ${a?.course_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Due date *</label><input class="input" type="date" name="d" required value="${a?.due_date || ''}"></div>
      <div class="field full"><label>Title *</label><input class="input" name="t" required maxlength="140" value="${esc(a?.title)}"></div>
      <div class="field full"><label>Instructions</label><textarea class="input" name="ds" rows="4" maxlength="2000">${esc(a?.description)}</textarea></div>
      <label class="check full"><input type="checkbox" name="p" ${!a || a.is_published ? 'checked' : ''}> Visible to students</label></div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" type="submit">Save</button></div></form>`);
    $('#af', m.el).addEventListener('submit', async (e) => { e.preventDefault(); const f = e.target;
      const row = { course_id: f.c.value, title: f.t.value.trim(), description: f.ds.value.trim() || null, due_date: f.d.value, is_published: f.p.checked };
      const { error } = a ? await sb.from('assignments').update(row).eq('id', a.id) : await sb.from('assignments').insert(row);
      if (error) return fail(error); toast('Saved'); m.close(); go('assignments'); });
  }
  async function submissionsModal(a) {
    const [{ data: en }, { data: sb2 }] = await Promise.all([sb.from('student_courses').select('student_id,students(full_name,reg_no)').eq('course_id', a.course_id).in('status', ['Active', 'Completed']),
      sb.from('assignment_submissions').select('*').eq('assignment_id', a.id)]);
    const by = {}; (sb2 || []).forEach((s) => { by[s.student_id] = s; });
    const m = modal(`<h2>${esc(a.title)}</h2><p class="sub" style="margin:0 0 1rem">${esc(a.courses?.name)} · Due ${fmt(a.due_date)}</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Student</th><th>Status</th><th>Submission</th><th>Marks</th><th>Feedback</th><th></th></tr></thead><tbody>
      ${(en || []).map((r) => { const s = by[r.student_id]; return `<tr><td><b>${esc(r.students?.full_name)}</b><div class="hint">${esc(r.students?.reg_no)}</div></td>
        <td>${s ? `<span class="pill ${s.status === 'Reviewed' ? 'ok' : 'draft'}">${s.status}</span>${s.is_late ? '<div class="hint" style="color:var(--err)">Late</div>' : ''}<div class="hint">${new Date(s.submitted_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</div>` : `<span class="pill ${a.due_date < today() ? '' : 'draft'}" style="${a.due_date < today() ? 'background:#fde8e8;color:var(--err)' : ''}">${a.due_date < today() ? 'Overdue' : 'Pending'}</span>`}</td>
        <td style="max-width:14rem">${s ? `${esc(s.note || '')}${s.file_path ? `<div><button class="btn btn-ghost btn-sm" data-f="${esc(s.file_path)}" data-n="${esc(s.file_name || 'file')}">Open file</button></div>` : ''}` : '—'}</td>
        <td>${s ? `<input class="input" data-m="${s.id}" style="width:5.5rem;padding:.4rem" maxlength="20" value="${esc(s.marks)}">` : ''}</td><td>${s ? `<input class="input" data-fb="${s.id}" style="min-width:9rem;padding:.4rem" maxlength="300" value="${esc(s.feedback)}">` : ''}</td>
        <td>${s ? `<button class="btn btn-primary btn-sm" data-r="${s.id}">${s.status === 'Reviewed' ? 'Update' : 'Mark reviewed'}</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="6">No students are enrolled in this course.</td></tr>'}</tbody></table></div>
      <div class="modal-actions"><button class="btn btn-ghost" data-close>Close</button></div>`);
    m.el.parentElement.querySelector('.modal').style.width = 'min(70rem,100%)';
    m.el.addEventListener('click', async (e) => { const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.f) return withBusy(b, 'Opening…', async () => window.open(await signed('student-files', b.dataset.f, b.dataset.n), '_blank', 'noopener'));
      if (b.dataset.r) { const id = b.dataset.r; await withBusy(b, 'Saving…', async () => {
        const { error } = await sb.from('assignment_submissions').update({ status: 'Reviewed', marks: $(`[data-m="${id}"]`, m.el).value.trim() || null, feedback: $(`[data-fb="${id}"]`, m.el).value.trim() || null, reviewed_at: new Date().toISOString() }).eq('id', id);
        if (error) throw error; toast('Saved'); }); } });
  }

  /* ================= CERTIFICATES ================= */
  async function certificates() {
    const { data: enr, error } = await sb.from('student_courses').select('*,students(*),courses(name,duration)').neq('status', 'Dropped').order('created_at', { ascending: false }); if (error) throw error;
    V().innerHTML = `<h1>Certificates</h1><p class="sub">When a student finishes a course, click <b>Complete &amp; certify</b>. A landscape A4 certificate (with the student’s photo, name and course) is generated and can be downloaded any time — students can also download it from their portal.</p>
      <div class="filters"><input class="input" id="s" placeholder="Search student / reg. no / course…" aria-label="Search"><select class="input" id="fl" aria-label="Filter"><option value="">All</option><option value="Active">Not yet completed</option><option value="Completed">Certificates issued</option></select></div>
      <div class="panel tbl-wrap"><table class="tbl"><thead><tr><th>Student</th><th>Course</th><th>Status</th><th>Certificate</th><th></th></tr></thead><tbody id="tb"></tbody></table></div>`;
    let rows = [];
    const draw = () => { const t = $('#s').value.trim().toLowerCase(), f = $('#fl').value;
      rows = enr.filter((e) => (!t || [e.students?.full_name, e.students?.reg_no, e.courses?.name].some((v) => String(v || '').toLowerCase().includes(t))) && (!f || (f === 'Completed' ? !!e.certificate_no : !e.certificate_no)));
      $('#tb').innerHTML = rows.map((e, i) => `<tr><td><b>${esc(e.students?.full_name)}</b><div class="hint">${esc(e.students?.reg_no)}${e.students?.photo_path ? '' : ' · <span style="color:var(--err)">no photo</span>'}</div></td><td>${esc(e.courses?.name)}</td>
        <td><span class="pill ${e.status === 'Completed' ? 'ok' : 'draft'}">${e.status}</span>${e.completed_on ? `<div class="hint">${fmt(e.completed_on)}</div>` : ''}</td><td>${e.certificate_no ? `<b>${esc(e.certificate_no)}</b><div class="hint">Issued ${fmt(e.certificate_issued_on)}${e.grade ? ' · ' + esc(e.grade) : ''}</div>` : '—'}</td>
        <td><div class="row-actions">${e.certificate_no ? `<button class="btn btn-primary btn-sm" data-pdf="${i}">Download PDF</button><button class="btn btn-ghost btn-sm" data-png="${i}">PNG</button><button class="btn btn-ghost btn-sm" data-re="${i}">Edit date / grade</button>` : `<button class="btn btn-primary btn-sm" data-done="${i}">Complete &amp; certify</button>`}</div></td></tr>`).join('') || '<tr><td colspan="5">Nothing to show.</td></tr>'; };
    $('#s').addEventListener('input', draw); $('#fl').addEventListener('change', draw); draw();
    $('#tb').addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (!b) return; const d = b.dataset; const i = d.pdf ?? d.png ?? d.re ?? d.done; const e = rows[+i]; if (!e) return;
      if (d.pdf !== undefined) withBusy(b, 'Preparing…', () => makeCertificate(e, e.students, 'pdf'));
      if (d.png !== undefined) withBusy(b, 'Preparing…', () => makeCertificate(e, e.students, 'png'));
      if (d.re !== undefined || d.done !== undefined) certifyForm(e, e.students, () => go('certificates')); });
  }

  /* ---------- register ---------- */
  EXT.nav.push(['students', 'Students'], ['fees', 'Fees'], ['attendance', 'Attendance'], ['materials', 'Study Material'], ['assignments', 'Assignments'], ['certificates', 'Certificates']);
  Object.assign(EXT.views, { students, studentDetail, fees, attendance, materials, assignments, certificates });
})();
