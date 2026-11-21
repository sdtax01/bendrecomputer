/* Admin: Monthly Attendance Register (Muster).
   Loaded after admin-students.js. It REPLACES only the opening screen of the Attendance menu; the original
   day-by-day screen is kept untouched and reachable through the "Daily entry" tab.
   Data: existing public.attendance (one row per student + course + date, unique). Optional new tables
   attendance_remarks / attendance_holidays (schema-update-v9-muster.sql) — everything works without them. */
(function () {
  const EXT = window.BCTI_ADMIN_EXT;
  if (!EXT || !EXT.api || !EXT.views || !EXT.views.attendance) return;
  const { sb, esc, $, toast, fail, modal, V } = EXT.api;
  const daily = EXT.views.attendance;
  const INSTITUTE = 'Bendre Computer Typing Institute';
  const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const p2 = (n) => String(n).padStart(2, '0');
  const ymd = (y, m, d) => `${y}-${p2(m)}-${p2(d)}`;
  const todayStr = () => { const d = new Date(); return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate()); };
  const CYCLE = ['', 'Present', 'Absent', 'Leave'];
  const MARK = { Present: '✓', Absent: '✕', Leave: 'L', '': '·' };
  const LET = { Present: 'P', Absent: 'A', Leave: 'L', '': '' };
  const pct = (p, a, l) => { const n = p + a + l; return n ? Math.round(p * 100 / n) : null; };   // same formula as the student portal: Present ÷ all marked days
  const dlg = (n, fn) => { const out = []; for (let i = 0; i < n; i += 400) out.push(fn(i, Math.min(n, i + 400))); return out; };

  function showTabs(mode) {
    return `<div class="mu-tabs" role="tablist"><button role="tab" class="${mode === 'm' ? 'on' : ''}" data-tab="m">Monthly muster</button><button role="tab" class="${mode === 'd' ? 'on' : ''}" data-tab="d">Daily entry</button></div>`;
  }

  async function dailyEntry() {
    await daily();
    const v = V(); if (!v || EXT.api.current !== 'attendance') return;
    const w = document.createElement('div'); w.className = 'mu'; w.innerHTML = showTabs('d'); v.prepend(w);
    w.querySelector('[data-tab="m"]').addEventListener('click', () => { muster(); });
  }

  /* ================= MONTHLY MUSTER ================= */
  let st = null;             // current register state
  let leaveGuard = null;

  async function muster() {
    if (leaveGuard) { window.removeEventListener('beforeunload', leaveGuard); leaveGuard = null; }
    const { data: cs, error } = await sb.from('courses').select('id,name').order('sort_order'); if (error) throw error;
    const now = new Date(), cy = now.getFullYear();
    const keep = st && st.keep ? st.keep : {};
    const yrs = []; for (let y = cy; y >= cy - 4; y--) yrs.push(y);
    V().innerHTML = `<div class="mu">${showTabs('m')}
      <div class="mu-head"><div class="mu-title"><span class="ic" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="16" rx="3"/><path d="M8 2.5v4M16 2.5v4M3 9.5h18M8.5 14.5l2.5 2.5 4.5-4.5"/></svg></span>
        <div><h1>Attendance Register – Monthly Muster</h1><p>Select month and mark attendance for the entire month at once.</p></div></div>
        <div class="mu-card mu-course"><label for="mc" class="sub" style="margin:0 0 .2rem;display:block;font-weight:700">Batch / Course</label><select class="input" id="mc">${cs.map((c) => `<option value="${c.id}"${keep.c === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div></div>
      <div class="mu-card mu-sel"><div class="grp"><label for="mm">Select month:</label>
        <select class="input" id="mm" aria-label="Month">${MON.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('')}</select>
        <select class="input" id="my" aria-label="Year">${yrs.map((y) => `<option value="${y}">${y}</option>`).join('')}</select></div>
        <div class="period"><b>Class period</b><span id="mp"></span></div><div class="mu-cards" id="mcards"></div></div>
      <div id="marea"></div></div>`;
    $('#mm').value = String(keep.m || now.getMonth() + 1); $('#my').value = String(keep.y || cy);
    V().querySelector('[data-tab="d"]').addEventListener('click', async () => { if (!(await leave())) return; dailyEntry(); });
    const reload = async () => { if (!(await leave())) { restoreSel(); return; } load(); };
    const restoreSel = () => { if (!st) return; $('#mc').value = st.c; $('#mm').value = String(st.m); $('#my').value = String(st.y); };
    $('#mc').addEventListener('change', reload); $('#mm').addEventListener('change', reload); $('#my').addEventListener('change', reload);
    const course = () => cs.find((x) => x.id === $('#mc').value);

    async function leave() { return !st || !st.dirty() || confirm('You have unsaved attendance changes. Leave without saving?'); }

    async function load() {
      const c = $('#mc').value, m = +$('#mm').value, y = +$('#my').value;
      if (!c) { $('#marea').innerHTML = '<div class="mu-card mu-empty">No courses found.</div>'; return; }
      const nd = new Date(y, m, 0).getDate(), first = ymd(y, m, 1), last = ymd(y, m, nd);
      $('#mp').textContent = `${p2(1)} ${MON[m - 1].slice(0, 3)} ${y} – ${p2(nd)} ${MON[m - 1].slice(0, 3)} ${y}`;
      $('#marea').innerHTML = '<div class="mu-card mu-empty">Loading…</div>';
      const [en, at, rm, hl] = await Promise.all([
        sb.from('student_courses').select('student_id,students(full_name,reg_no)').eq('course_id', c).eq('status', 'Active'),
        sb.from('attendance').select('student_id,att_date,status').eq('course_id', c).gte('att_date', first).lte('att_date', last),
        sb.from('attendance_remarks').select('student_id,remark').eq('course_id', c).eq('month_start', first),
        sb.from('attendance_holidays').select('hday,label').gte('hday', first).lte('hday', last)]);
      if (EXT.api.current !== 'attendance' || !$('#mc') || $('#mc').value !== c || +$('#mm').value !== m || +$('#my').value !== y) return;   // user moved on
      if (en.error) throw en.error; if (at.error) throw at.error;
      const remOk = !rm.error, holOk = !hl.error;
      const list = (en.data || []).filter((r) => r.students).sort((a, b) => String(a.students.full_name).localeCompare(String(b.students.full_name)));
      const hol = {}; (holOk ? hl.data || [] : []).forEach((h) => { hol[+h.hday.slice(8, 10)] = h.label || 'Holiday'; });
      const cells = {}, orig = {}, remarks = {}, remOrig = {};
      list.forEach((r) => { cells[r.student_id] = {}; orig[r.student_id] = {}; });
      (at.data || []).forEach((a) => { if (cells[a.student_id]) { cells[a.student_id][+a.att_date.slice(8, 10)] = a.status; orig[a.student_id][+a.att_date.slice(8, 10)] = a.status; } });
      (remOk ? rm.data || [] : []).forEach((r) => { remarks[r.student_id] = r.remark; remOrig[r.student_id] = r.remark; });
      st = { c, m, y, nd, list, cells, orig, remarks, remOrig, hol, remOk, holOk, today: todayStr(), course: course().name, keep: { c, m, y },
        dirtyCells() { const out = []; list.forEach((r) => { for (let d = 1; d <= nd; d++) if ((cells[r.student_id][d] || '') !== (orig[r.student_id][d] || '')) out.push([r.student_id, d]); }); return out; },
        dirtyRem() { return list.filter((r) => (remarks[r.student_id] || '') !== (remOrig[r.student_id] || '')); },
        dirty() { return this.dirtyCells().length > 0 || this.dirtyRem().length > 0; } };
      draw();
    }

    function isOff(d) { const wd = new Date(st.y, st.m - 1, d).getDay(); return wd === 0 ? 'sun' : st.hol[d] ? 'hol' : ''; }
    const future = (d) => ymd(st.y, st.m, d) > st.today;

    function draw() {
      const { list, nd, y, m } = st;
      if (!list.length) { $('#mcards').innerHTML = ''; $('#marea').innerHTML = '<div class="mu-card mu-empty" style="margin-top:1rem">No active students are enrolled in this course.</div>'; return; }
      const days = []; for (let d = 1; d <= nd; d++) days.push(d);
      const defDay = (() => { for (let d = Math.min(nd, +st.today.slice(0, 4) === y && +st.today.slice(5, 7) === m ? +st.today.slice(8) : nd); d >= 1; d--) if (!isOff(d) && !future(d)) return d; return 1; })();
      $('#marea').innerHTML = `
      <div class="mu-bar"><h3>${list.length} Active Student${list.length > 1 ? 's' : ''} • ${MON[m - 1]} ${y}</h3>
        <div class="mu-acts"><span class="mu-dirty" id="mdirty" hidden></span>
          <button class="mu-b" id="mcopy" title="Copy the register (tab-separated) to paste into Excel or WhatsApp">Copy List</button>
          <span class="mu-scope"><label for="msc">Apply to</label><select id="msc" aria-label="Bulk action scope"><option value="day">One date…</option><option value="month">Unmarked cells, whole month</option></select>
            <select id="mday" aria-label="Date for bulk action">${days.filter((d) => !future(d)).map((d) => `<option value="${d}"${d === defDay ? ' selected' : ''}>${p2(d)} ${WD[new Date(y, m - 1, d).getDay()]}</option>`).join('')}</select></span>
          <button class="mu-b g" id="mallp">✓ Mark All Present</button><button class="mu-b r" id="malla">✕ Mark All Absent</button>
          <button class="mu-b" id="msave">Save Attendance</button><button class="mu-b o" id="mnext">Save &amp; Next Course →</button></div></div>
      <div class="mu-wrap" id="mwrap"><table class="mu-t" aria-label="Monthly attendance register"><thead><tr><th class="sr">Sr.</th><th class="rg">Reg. No.</th><th class="nm">Student Name</th>
        ${days.map((d) => `<th class="dc ${isOff(d)}" title="${st.hol[d] ? esc(st.hol[d]) : ''}">${p2(d)}<small>${WD[new Date(y, m - 1, d).getDay()]}</small></th>`).join('')}
        <th class="tot">P</th><th class="tot">A</th><th class="tot">L</th><th class="pc">%</th><th class="rm">Remarks</th></tr></thead>
        <tbody>${list.map((r, i) => `<tr data-s="${r.student_id}"><td class="sr">${i + 1}</td><td class="rg">${esc(r.students.reg_no)}</td><td class="nm">${esc(r.students.full_name)}</td>
          ${days.map((d) => { const s = st.cells[r.student_id][d] || ''; return `<td class="dc ${isOff(d)}"><button type="button" class="mc" data-d="${d}" data-s="${s}" ${future(d) ? 'disabled' : ''} aria-label="${esc(r.students.full_name)}, ${p2(d)} ${MON[m - 1]}: ${s || 'Not marked'}">${MARK[s]}</button></td>`; }).join('')}
          <td class="tot" data-t="Present"></td><td class="tot" data-t="Absent"></td><td class="tot" data-t="Leave"></td><td class="pc" data-t="pc"></td>
          <td class="rm"><input type="text" maxlength="200" placeholder="${st.remOk ? 'Add remarks…' : 'Run schema-update-v9-muster.sql'}" value="${esc(st.remarks[r.student_id] || '')}" ${st.remOk ? '' : 'disabled'} aria-label="Remarks for ${esc(r.students.full_name)}"></td></tr>`).join('')}</tbody></table></div>
      <div class="mu-foot"><span class="lg"><span class="mc" data-s="Present">✓</span> Present</span><span class="lg"><span class="mc" data-s="Absent">✕</span> Absent</span><span class="lg"><span class="mc" data-s="Leave">L</span> Leave</span><span class="lg"><span class="mc" data-s="">·</span> Not marked</span>
        <span class="lg" style="color:#b45309">▮ Sunday / holiday (never marked automatically)</span>
        <button class="mu-b w" id="mhol"${st.holOk ? '' : ' disabled title="Run schema-update-v9-muster.sql to enable holidays"'}>Set holidays</button>
        <span class="mu-info">Click a cell to cycle Present → Absent → Leave → Not marked. The whole month is saved in one step.</span></div>
      <div class="mu-bottom"><div class="mu-card mu-sum"><div style="width:100%"><h3>Attendance Summary – ${MON[m - 1]} ${y}</h3></div><div><small>Present</small><span class="n" style="color:#16a34a" id="sp"></span></div><div><small>Absent</small><span class="n" style="color:#dc2626" id="sa"></span></div><div><small>Leave</small><span class="n" style="color:#2563eb" id="sl"></span></div>
          <div class="mu-ring" id="sring"><b id="spc"></b></div><small style="width:100%;text-align:center;color:#64748b">Attendance % = Present ÷ (Present + Absent + Leave) of marked days. Unmarked days are not counted.</small></div>
        <div class="mu-card mu-rep"><h3>Quick Reports</h3><div class="row"><button class="mu-b w" id="mxls">Export to Excel</button><button class="mu-b w" id="mpdf">Export to PDF</button><button class="mu-b w" id="mprt">Print Register</button></div></div>
        <div class="mu-card mu-done" id="mdone"><b id="mdt">Register ready</b><p id="mdp">Mark the month, then press Save Attendance once.</p></div></div>`;
      bind(); st.list.forEach((r) => { for (let d = 1; d <= nd; d++) if ((st.cells[r.student_id][d] || '') !== (st.orig[r.student_id][d] || '')) { const b = document.querySelector(`#marea tr[data-s="${r.student_id}"] .mc[data-d="${d}"]`); if (b) b.classList.add('chg'); } }); recalc();
    }

    function recalc() {
      const { list, nd } = st; let P = 0, A = 0, L = 0;
      list.forEach((r) => {
        let p = 0, a = 0, l = 0; for (let d = 1; d <= nd; d++) { const s = st.cells[r.student_id][d]; if (s === 'Present') p++; else if (s === 'Absent') a++; else if (s === 'Leave') l++; }
        P += p; A += a; L += l;
        const tr = document.querySelector(`#marea tr[data-s="${r.student_id}"]`); if (!tr) return;
        tr.querySelector('[data-t="Present"]').textContent = p; tr.querySelector('[data-t="Absent"]').textContent = a; tr.querySelector('[data-t="Leave"]').textContent = l;
        const q = pct(p, a, l); tr.querySelector('[data-t="pc"]').textContent = q === null ? '—' : q + '%';
      });
      st.tot = { P, A, L }; const q = pct(P, A, L);
      $('#mcards').innerHTML = `<div class="mu-sc t"><i>👥</i><div><b>${list.length}</b><span>Total Students</span></div></div><div class="mu-sc p"><i>✓</i><div><b>${P}</b><span>Present</span></div></div><div class="mu-sc a"><i>✕</i><div><b>${A}</b><span>Absent</span></div></div><div class="mu-sc l"><i>L</i><div><b>${L}</b><span>Leave</span></div></div>`;
      $('#sp').textContent = P; $('#sa').textContent = A; $('#sl').textContent = L; $('#spc').textContent = q === null ? '—' : q + '%'; $('#sring').style.setProperty('--p', q || 0);
      const nc = st.dirtyCells().length + st.dirtyRem().length, dirty = nc > 0;
      const dd = $('#mdirty'); dd.hidden = !dirty; dd.textContent = `Unsaved changes (${nc})`;
      ['msave', 'mnext'].forEach((id) => { const b = $('#' + id); if (b) b.classList.toggle('dirty', dirty && id === 'msave'); });
      if (dirty && !leaveGuard) { leaveGuard = (e) => { e.preventDefault(); e.returnValue = ''; }; window.addEventListener('beforeunload', leaveGuard); }
      if (!dirty && leaveGuard) { window.removeEventListener('beforeunload', leaveGuard); leaveGuard = null; }
    }

    function setCell(sid, d, s) {
      st.cells[sid][d] = s;
      const b = document.querySelector(`#marea tr[data-s="${sid}"] .mc[data-d="${d}"]`); if (!b) return;
      b.dataset.s = s; b.textContent = MARK[s];
      b.classList.toggle('chg', (s || '') !== (st.orig[sid][d] || ''));
      b.setAttribute('aria-label', b.getAttribute('aria-label').replace(/: [^:]*$/, ': ' + (s || 'Not marked')));
    }

    function bind() {
      $('#marea tbody').addEventListener('click', (e) => {
        const b = e.target.closest('.mc'); if (!b || b.disabled) return;
        const sid = b.closest('tr').dataset.s, d = +b.dataset.d, cur = st.cells[sid][d] || '';
        setCell(sid, d, CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length]); recalc();
      });
      $('#marea tbody').addEventListener('input', (e) => { if (e.target.matches('.rm input')) { st.remarks[e.target.closest('tr').dataset.s] = e.target.value.trim(); recalc(); } });
      $('#msc').addEventListener('change', () => { $('#mday').hidden = $('#msc').value === 'month'; });
      const bulk = (status) => {
        const scope = $('#msc').value, dd = +$('#mday').value; let n = 0;
        st.list.forEach((r) => {
          if (scope === 'day') { if (!dd || future(dd)) return; if (st.cells[r.student_id][dd] !== status) { setCell(r.student_id, dd, status); n++; } }
          else for (let d = 1; d <= st.nd; d++) { if (isOff(d) || future(d) || st.cells[r.student_id][d]) continue; setCell(r.student_id, d, status); n++; }
        });
        recalc(); toast(n ? `${n} cell${n > 1 ? 's' : ''} updated — press Save Attendance to keep them` : 'Nothing to change');
      };
      $('#mallp').addEventListener('click', () => bulk('Present'));
      $('#malla').addEventListener('click', () => { if (confirm($('#msc').value === 'month' ? 'Mark every UNMARKED weekday of this month as Absent?' : 'Mark all students Absent for the selected date?')) bulk('Absent'); });
      $('#mcopy').addEventListener('click', async () => {
        const tsv = [['Sr', 'Reg No', 'Student'].concat(Array.from({ length: st.nd }, (_, i) => p2(i + 1)), ['P', 'A', 'L', '%', 'Remarks']).join('\t')].concat(rowsData().map((r) => [r.i, r.reg, r.name].concat(r.days.map((s) => LET[s]), [r.p, r.a, r.l, r.pc === null ? '' : r.pc + '%', r.remark]).join('\t'))).join('\n');
        try { await navigator.clipboard.writeText(tsv); toast('Register copied — paste it into Excel or a message'); } catch (e) { toast('Copy is blocked by the browser', true); }
      });
      const save = (next) => async () => {
        const btn = $(next ? '#mnext' : '#msave'), old = btn.textContent; if (btn.disabled) return;
        const all = ['#msave', '#mnext'].map((s) => $(s)); all.forEach((b) => { b.disabled = true; }); btn.textContent = 'Saving…';
        try {
          const dc = st.dirtyCells(), dr = st.dirtyRem(); if (!dc.length && !dr.length) { toast('No changes to save'); if (next) nextCourse(); return; }
          const up = [], del = [];
          dc.forEach(([sid, d]) => { const s = st.cells[sid][d]; if (s) up.push({ student_id: sid, course_id: st.c, att_date: ymd(st.y, st.m, d), status: s }); else del.push({ sid, d }); });
          let ok = 0, bad = 0, msg = '';
          for (let i = 0; i < up.length; i += 200) {
            const part = up.slice(i, i + 200), { error: er } = await sb.from('attendance').upsert(part, { onConflict: 'student_id,course_id,att_date' });
            if (er) { bad += part.length; msg = er.message; } else { ok += part.length; part.forEach((r) => { st.orig[r.student_id][+r.att_date.slice(8)] = r.status; }); }
          }
          for (const x of del) {   // a cell the administrator deliberately set back to "Not marked"
            const { error: er } = await sb.from('attendance').delete().eq('student_id', x.sid).eq('course_id', st.c).eq('att_date', ymd(st.y, st.m, x.d));
            if (er) { bad++; msg = er.message; } else { ok++; delete st.orig[x.sid][x.d]; }
          }
          const first = ymd(st.y, st.m, 1);
          for (const r of dr) {
            const t = st.remarks[r.student_id] || '';
            const { error: er } = t ? await sb.from('attendance_remarks').upsert({ student_id: r.student_id, course_id: st.c, month_start: first, remark: t, updated_at: new Date().toISOString() }, { onConflict: 'student_id,course_id,month_start' })
              : await sb.from('attendance_remarks').delete().eq('student_id', r.student_id).eq('course_id', st.c).eq('month_start', first);
            if (er) { bad++; msg = er.message; } else { if (t) st.remOrig[r.student_id] = t; else delete st.remOrig[r.student_id]; }
          }
          document.querySelectorAll('#marea .mc.chg').forEach((b) => { const sid = b.closest('tr').dataset.s; if ((st.cells[sid][+b.dataset.d] || '') === (st.orig[sid][+b.dataset.d] || '')) b.classList.remove('chg'); });
          recalc();
          if (bad) { $('#mdt').textContent = 'Saved with problems'; $('#mdp').textContent = `${ok} saved, ${bad} NOT saved (${msg}). Press Save Attendance again to retry the rest.`; toast(`${bad} change(s) could not be saved: ${msg}`, true); }
          else { $('#mdt').textContent = 'All Done!'; $('#mdp').textContent = 'Monthly attendance marked successfully.'; toast(`Attendance saved (${ok} change${ok === 1 ? '' : 's'})`); if (next) nextCourse(); }
        } catch (er) { fail(er); }
        finally { all.forEach((b) => { if (b.isConnected) b.disabled = false; }); btn.textContent = old; }
      };
      const nextCourse = () => { const s = $('#mc'), i = s.selectedIndex; if (i < s.options.length - 1) { s.selectedIndex = i + 1; load(); } else toast('That was the last course'); };
      $('#msave').addEventListener('click', save(false)); $('#mnext').addEventListener('click', save(true));
      $('#mhol').addEventListener('click', holidays);
      $('#mxls').addEventListener('click', exportXls); $('#mpdf').addEventListener('click', () => printReg(true)); $('#mprt').addEventListener('click', () => printReg(false));
    }

    /* ---------- holidays ---------- */
    function holidays() {
      const { nd, y, m } = st, def = Object.values(st.hol)[0] || 'Holiday';
      const mdl = modal(`<h2>Holidays – ${MON[m - 1]} ${y}</h2><p class="sub" style="margin:0">Tick the days the institute is closed. They are shaded in the register and never marked automatically. Sundays are always shaded.</p>
        <div class="mu mu-hg">${Array.from({ length: nd }, (_, i) => i + 1).map((d) => { const sun = new Date(y, m - 1, d).getDay() === 0; return `<label class="${sun ? 'sun' : ''}"><b>${p2(d)}</b><small>${WD[new Date(y, m - 1, d).getDay()]}</small><input type="checkbox" value="${d}" ${st.hol[d] ? 'checked' : ''} ${sun ? 'disabled' : ''}></label>`; }).join('')}</div>
        <div class="field" style="margin-bottom:14px"><label>Name (shown on hover)</label><input class="input" id="hn" maxlength="60" value="${esc(def)}"></div>
        <button class="btn btn-primary" id="hsave">Save holidays</button>`);
      const root = mdl.el;
      root.querySelector('#hsave').addEventListener('click', async () => {
        const q = (s) => root.querySelector(s), want = new Set([...root.querySelectorAll('.mu-hg input:checked')].map((i) => +i.value)), label = (q('#hn').value || 'Holiday').trim().slice(0, 60);
        try {
          const add = [...want].map((d) => ({ hday: ymd(y, m, d), label })), gone = Object.keys(st.hol).map(Number).filter((d) => !want.has(d));
          if (add.length) { const { error: er } = await sb.from('attendance_holidays').upsert(add, { onConflict: 'hday' }); if (er) throw er; }
          for (const d of gone) { const { error: er } = await sb.from('attendance_holidays').delete().eq('hday', ymd(y, m, d)); if (er) throw er; }
          st.hol = {}; want.forEach((d) => { st.hol[d] = label; });
          draw(); toast('Holidays saved'); mdl.close();
        } catch (er) { fail(er); }
      });
    }

    /* ---------- exports ---------- */
    function rowsData() {
      return st.list.map((r, i) => {
        const days = Array.from({ length: st.nd }, (_, k) => st.cells[r.student_id][k + 1] || ''); const p = days.filter((s) => s === 'Present').length, a = days.filter((s) => s === 'Absent').length, l = days.filter((s) => s === 'Leave').length;
        return { i: i + 1, reg: r.students.reg_no, name: r.students.full_name, days, p, a, l, pc: pct(p, a, l), remark: st.remarks[r.student_id] || '' };
      });
    }
    const fileBase = () => `Attendance-${st.course}-${MON[st.m - 1]}-${st.y}`.replace(/[^A-Za-z0-9._-]+/g, '_');
    function tableHtml() {
      const rs = rowsData(), nd = st.nd, T = st.tot || { P: 0, A: 0, L: 0 }, q = pct(T.P, T.A, T.L);
      const head = `<tr><th>Sr</th><th>Reg. No.</th><th>Student Name</th>${Array.from({ length: nd }, (_, i) => { const d = i + 1, off = isOff(d); return `<th class="${off}">${p2(d)}<br><small>${WD[new Date(st.y, st.m - 1, d).getDay()]}</small></th>`; }).join('')}<th>P</th><th>A</th><th>L</th><th>%</th><th>Remarks</th></tr>`;
      const body = rs.map((r) => `<tr><td>${r.i}</td><td>${esc(r.reg)}</td><td class="l">${esc(r.name)}</td>${r.days.map((s, k) => `<td class="${isOff(k + 1)} ${s}">${LET[s]}</td>`).join('')}<td>${r.p}</td><td>${r.a}</td><td>${r.l}</td><td>${r.pc === null ? '—' : r.pc + '%'}</td><td class="l">${esc(r.remark)}</td></tr>`).join('');
      return { head, body, sum: `Total Present: <b>${T.P}</b> &nbsp; Total Absent: <b>${T.A}</b> &nbsp; Total Leave: <b>${T.L}</b> &nbsp; Overall Attendance: <b>${q === null ? '—' : q + '%'}</b>` };
    }
    const CSS = `body{font-family:Arial,Helvetica,sans-serif;color:#0f2a5c;margin:0}h1{font-size:18px;margin:0}h2{font-size:13px;font-weight:600;margin:3px 0 10px;color:#334155}
      table{border-collapse:collapse;width:100%;font-size:9px}th,td{border:1px solid #9fb3d8;padding:3px 2px;text-align:center}th{background:#eaf1ff}td.l{text-align:left;padding-left:4px}
      thead{display:table-header-group}tr{page-break-inside:avoid}.sun{background:#fff4e5}.hol{background:#ffe9ee}.Present{color:#15803d;font-weight:700}.Absent{color:#dc2626;font-weight:700}.Leave{color:#2563eb;font-weight:700}
      .sum{margin-top:10px;font-size:11px}@page{size:A4 landscape;margin:12mm 10mm 14mm;@bottom-right{content:"Page " counter(page) " of " counter(pages);font-size:9px;color:#475569}}
      *{-webkit-print-color-adjust:exact;print-color-adjust:exact}`;
    function printReg(pdf) {
      const t = tableHtml(), w = window.open('', '_blank'); if (!w) return toast('Please allow pop-ups to print or export', true);
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(fileBase())}</title><style>${CSS}</style></head><body>
        <h1>${INSTITUTE}</h1><h2>Attendance Register – ${esc(st.course)} · ${MON[st.m - 1]} ${st.y}</h2>
        <table><thead>${t.head}</thead><tbody>${t.body}</tbody></table><p class="sum">${t.sum}</p>
        <p class="sum" style="color:#475569">P = Present, A = Absent, L = Leave. Attendance % = Present ÷ (Present + Absent + Leave). Shaded columns: Sunday / holiday.${pdf ? ' To save as PDF choose “Save as PDF” as the printer.' : ''}</p></body></html>`);
      w.document.close(); setTimeout(() => { w.focus(); w.print(); }, 400);
    }
    function exportXls() {
      const t = tableHtml();
      const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><style>${CSS.replace(/@page\{[^}]*\{[^}]*\}\}/, '')}table{font-size:11px}</style></head><body>
        <table><tr><td colspan="6"><b>${INSTITUTE}</b></td></tr><tr><td colspan="6">Attendance Register – ${esc(st.course)} · ${MON[st.m - 1]} ${st.y}</td></tr></table><br>
        <table border="1"><thead>${t.head.replace(/<br>/g, ' ')}</thead><tbody>${t.body}</tbody></table><br><table><tr><td colspan="8">${t.sum.replace(/&nbsp;/g, ' ')}</td></tr></table></body></html>`;
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + html], { type: 'application/vnd.ms-excel;charset=utf-8' })); a.download = fileBase() + '.xls'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    await load();   // last: every helper above must exist first
  }

  EXT.views.attendance = muster;
})();
