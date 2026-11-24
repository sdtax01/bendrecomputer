/* Public site: shows both branch addresses, lets visitors choose a preferred branch on the enquiry / admission forms.
   Purely additive and fail-safe: if the branches table is not installed or unreachable, nothing on the page changes.
   The preference is only a hint for staff; an administrator assigns the real branch. */
(function () {
  const B = window.BCTI; if (!B || !B.ready) return;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const short = (n) => String(n || '').replace(/^.*?–\s*/, '');
  B.ready.then(async () => {
    const sb = B.sb; if (!sb) return;
    let list = [];
    try { const r = await sb.from('branches').select('code,name,address,phone').eq('is_active', true).order('code'); list = r.data || []; } catch (e) { return; }
    if (list.length < 2) return;

    // 1. addresses: contact page card + footer
    const info = document.getElementById('info');
    if (info) {
      const d = document.createElement('div'); d.className = 'branch-list'; d.style.cssText = 'margin-top:1.2rem;display:grid;gap:.8rem';
      d.innerHTML = '<h3 style="font-size:1.1rem;margin:0">Our branches</h3>' + list.map((b) => `<div style="border:1px solid #e3e3ea;border-radius:.7rem;padding:.8rem 1rem;background:#fff"><b>${esc(short(b.name))}</b><br>${esc(b.address || '')}${b.phone ? `<br>Phone: ${esc(b.phone)}` : ''}</div>`).join('');
      info.insertAdjacentElement('afterend', d);
    }
    document.querySelectorAll('[data-c="address"]').forEach((li) => { li.innerHTML = list.map((b) => `<b>${esc(short(b.name))}:</b> ${esc(b.address || '')}`).join('<br>'); });

    // 2. preferred branch on enquiry / admission forms
    const forms = [...document.querySelectorAll('form')].filter((f) => f.elements && f.elements.consent);
    if (!forms.length) return;
    const sel = [];
    forms.forEach((f) => {
      const anchor = f.querySelector('[data-f="consent"]'); if (!anchor) return;
      const w = document.createElement('div'); w.className = 'field full';
      w.innerHTML = '<label for="branch_pref">Preferred Branch <small>(optional)</small></label><select class="input" id="branch_pref" name="branch_pref"><option value="">No preference</option>' + list.map((b) => `<option value="${esc(b.code)}">${esc(short(b.name))}</option>`).join('') + '</select>';
      anchor.parentNode.insertBefore(w, anchor); sel.push(w.querySelector('select'));
    });
    const pref = () => (sel.map((s) => s.value).find(Boolean) || '').trim();
    const send = (res) => {
      try { const p = pref(); const d = res && res.data; const ref = d && (typeof d === 'string' ? d : d.ref_no);
        if (p && ref && !res.error) Promise.resolve(oRpc('set_enquiry_preferred_branch', { p_ref: ref, p_code: p })).catch(() => {}); } catch (e) { /* ignore */ }
      return res;
    };
    const oRpc = sb.rpc.bind(sb);
    sb.rpc = (n, a, ...r) => { const p = oRpc(n, a, ...r); return (n === 'submit_enquiry' || n === 'submit_admission') ? Promise.resolve(p).then(send) : p; };
    if (sb.functions && sb.functions.invoke) {
      const oInv = sb.functions.invoke.bind(sb.functions);
      sb.functions.invoke = (n, o) => { const p = oInv(n, o); const k = o && o.body && o.body.rpc; return (k === 'submit_enquiry' || k === 'submit_admission') ? Promise.resolve(p).then((res) => { send({ error: res.error || (res.data && res.data.error), data: res.data && res.data.data }); return res; }) : p; };
    }
  });
})();
