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
    if (required.includes('email') && !v.email.trim()) errs.email = 'Email is required — it will be your student login ID.';
    else if (v.email.trim() && !EMAIL.test(v.email.trim())) errs.email = 'Enter a valid email address or leave it blank.';
    if (required.includes('dob')) {
      const d = new Date(v.dob + 'T00:00:00'), now = new Date();
      if (!v.dob || isNaN(d) || d > new Date(now.getFullYear() - 3, now.getMonth(), now.getDate()) || d < new Date('1940-01-01T00:00:00')) errs.dob = 'Please enter a valid date of birth.';
    }
    if (required.includes('course_id') && !v.course_id) errs.course_id = 'Please choose a course.';
    if (required.includes('message') && v.message.trim().length < 5) errs.message = 'Please write a short message.';
    if (!v.consent) errs.consent = 'Please allow us to contact you about this enquiry.';
    ['student_name', 'guardian_name', 'mobile', 'whatsapp', 'email', 'dob', 'course_id', 'message', 'consent'].forEach((n) => setErr(form, n, errs[n]));
    return errs;
  }

  window.BCTI.enquiryForm = function (form, opts) {
    const { kind, required, onSuccess, admission } = opts;
    let busy = false;
    form.noValidate = true;
    // spam trap: a hidden field real visitors never see or fill; bots usually fill every field
    const trap = document.createElement('input');
    trap.type = 'text'; trap.name = 'website_url'; trap.tabIndex = -1; trap.autocomplete = 'off'; trap.setAttribute('aria-hidden', 'true');
    trap.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none';
    form.appendChild(trap);
    /* optional CAPTCHA (Cloudflare Turnstile) — active only when TURNSTILE_SITE_KEY is set in config.js */
    const siteKey = (window.BCTI_CONFIG || {}).TURNSTILE_SITE_KEY;
    let tsToken = '', tsWidget = null;
    if (siteKey) {
      const holder = document.createElement('div'); holder.className = 'ts-box'; holder.style.cssText = 'margin:1rem 0';
      const sbtn = form.querySelector('button[type=submit]'); (sbtn ? sbtn.parentNode : form).insertBefore(holder, sbtn || null);
      const draw = () => { tsWidget = window.turnstile.render(holder, { sitekey: siteKey, callback: (t) => { tsToken = t; }, 'expired-callback': () => { tsToken = ''; }, 'error-callback': () => { tsToken = ''; } }); };
      if (window.turnstile) draw();
      else { const sc = document.createElement('script'); sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; sc.async = true; sc.onload = draw; document.head.appendChild(sc); }
    }
    const callRpc = async (name, args) => {
      const sb = window.BCTI.sb;
      if (!siteKey) return sb.rpc(name, args);
      if (!tsToken) return { error: { message: 'Please complete the verification (tick the box) before submitting.' } };
      const token = tsToken; tsToken = ''; try { window.turnstile.reset(tsWidget); } catch (e) { /* ignore */ }
      const { data, error } = await sb.functions.invoke('form-gate', { body: { rpc: name, args, token } });
      if (error) return { error: { message: 'Could not submit right now. Please try again.' } };
      if (data && data.error) return { error: { message: data.error } };
      return { data: data ? data.data : null, error: null };
    };
    form.addEventListener('input', (e) => { const f = e.target.closest('[data-f]'); if (f) setErr(form, f.dataset.f, ''); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (busy) return;                       // prevents duplicate submission
      if (trap.value) { busy = true; return onSuccess('BCTI-' + Date.now().toString().slice(-8), {}, ''); }   // bot: pretend success, send nothing
      const g = (n) => (form.elements[n] ? form.elements[n].value : '');
      const v = {
        student_name: g('student_name'), guardian_name: g('guardian_name'), mobile: g('mobile'), whatsapp: g('whatsapp'),
        email: g('email'), dob: g('dob'), course_id: g('course_id'), preferred_timing: g('preferred_timing'),
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
        if (admission) {   // admission form: creates the enquiry AND the student record + registration number
          const { data, error } = await callRpc('submit_admission', {
            p_student_name: v.student_name, p_guardian_name: v.guardian_name || null, p_mobile: v.mobile, p_whatsapp: v.whatsapp || null,
            p_email: v.email, p_dob: v.dob, p_course_id: v.course_id || null, p_preferred_timing: v.preferred_timing || null,
            p_qualification: v.qualification || null, p_message: v.message || null, p_consent: v.consent
          });
          if (error) throw error;
          return onSuccess(data.ref_no, v, data.reg_no);
        }
        const { data, error } = await callRpc('submit_enquiry', {
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
        window.BCTI.toast(/valid|required|short|long|Invalid|already registered|could not complete|Too many|verification|Verification/i.test(m) ? m : 'Sorry, we could not submit your enquiry. Please try again or call us.', true);
      }
    });
  };
})();
