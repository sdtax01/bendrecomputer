/* Enquiry form handling shared by Admissions and Contact pages */
(function () {
  const MOBILE = /^[6-9]\d{9}$/;
  const EMAIL = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;
  const norm = (v) => {
    let s = String(v || '').replace(/[\s\-+]/g, '');
    if (/^91[6-9]\d{9}$/.test(s)) s = s.slice(2);
    if (/^0[6-9]\d{9}$/.test(s)) s = s.slice(1);
    return s;
  };

  function setErr(form, name, msg) {
    const f = form.querySelector(`[data-f="${name}"]`);
    if (!f) return;
    f.classList.toggle('invalid', !!msg);
    const e = f.querySelector('.err'); if (e) e.textContent = msg || '';
    const i = f.querySelector('input,select,textarea'); if (i) i.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }

  function validate(form, v, required) {
    const errs = {};
    if (required.includes('student_name') && v.student_name.trim().length < 2) errs.student_name = 'Please enter the full name.';
    if (required.includes('guardian_name') && v.guardian_name.trim().length < 2) errs.guardian_name = 'Please enter the parent / guardian name.';
    if (!MOBILE.test(norm(v.mobile))) errs.mobile = 'Enter a valid 10-digit Indian mobile number (starting with 6–9).';
    if (v.whatsapp.trim() && !MOBILE.test(norm(v.whatsapp))) errs.whatsapp = 'Enter a valid WhatsApp number or leave it blank.';
    if (v.email.trim() && !EMAIL.test(v.email.trim())) errs.email = 'Enter a valid email address or leave it blank.';
    if (required.includes('course_id') && !v.course_id) errs.course_id = 'Please choose a course.';
    if (required.includes('message') && v.message.trim().length < 5) errs.message = 'Please write a short message.';
    if (!v.consent) errs.consent = 'Please allow us to contact you about this enquiry.';
    ['student_name', 'guardian_name', 'mobile', 'whatsapp', 'email', 'course_id', 'message', 'consent'].forEach((n) => setErr(form, n, errs[n]));
    return errs;
  }

  window.BCTI.enquiryForm = function (form, opts) {
    const { kind, required, onSuccess } = opts;
    let busy = false;
    form.noValidate = true;
    form.addEventListener('input', (e) => { const f = e.target.closest('[data-f]'); if (f) setErr(form, f.dataset.f, ''); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (busy) return;                       // prevents duplicate submission
      const g = (n) => (form.elements[n] ? form.elements[n].value : '');
      const v = {
        student_name: g('student_name'), guardian_name: g('guardian_name'), mobile: g('mobile'), whatsapp: g('whatsapp'),
        email: g('email'), course_id: g('course_id'), preferred_timing: g('preferred_timing'),
        qualification: g('qualification'), message: g('message'), consent: form.elements.consent.checked
      };
      const errs = validate(form, v, required);
      const first = Object.keys(errs)[0];
      if (first) { const el = form.querySelector(`[data-f="${first}"] input,[data-f="${first}"] select,[data-f="${first}"] textarea`); if (el) el.focus(); return; }
      if (!window.BCTI.sb) { window.BCTI.toast('The website is not connected to its database yet.', true); return; }

      busy = true;
      const btn = form.querySelector('button[type=submit]'); const label = btn.textContent;
      btn.disabled = true; btn.textContent = 'Submitting…';
      try {
        const { data, error } = await window.BCTI.sb.rpc('submit_enquiry', {
          p_student_name: v.student_name, p_guardian_name: v.guardian_name || null, p_mobile: v.mobile,
          p_whatsapp: v.whatsapp || null, p_email: v.email || null, p_course_id: v.course_id || null,
          p_preferred_timing: v.preferred_timing || null, p_qualification: v.qualification || null,
          p_message: v.message || null, p_consent: v.consent, p_kind: kind
        });
        if (error) throw error;
        onSuccess(data, v);
      } catch (err) {
        busy = false; btn.disabled = false; btn.textContent = label;
        const m = String(err.message || '');
        window.BCTI.toast(/valid|required|short|long|Invalid/i.test(m) ? m : 'Sorry, we could not submit your enquiry. Please try again or call us.', true);
      }
    });
  };
})();
