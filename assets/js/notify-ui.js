/* Notification centre (bell) for the Admin and Student portals.
   BCTI_NOTIFY.mount({ sb, audience: 'admin' | 'student', onOpen(item|null, action) })  /  BCTI_NOTIFY.unmount()
   Reads public.notifications (RLS limits what each person sees). Polls every 45 s; no extra Supabase setup. */
(function () {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ICON = { photo: ['camera', 'c2'], contact: ['phone', 'c3'], email: ['mail', 'c1'], address: ['user', 'c6'], profile: ['user', 'c1'], password: ['key', 'c5'],
    assignment: ['clip', 'c4'], material: ['folder', 'c2'], payment: ['wallet', 'c3'], certificate: ['award', 'c4'], reminder: ['bell', 'c5'], documents: ['file', 'c6'], info: ['bell', 'c1'] };
  const ago = (t) => { const m = Math.max(0, Math.round((Date.now() - new Date(t)) / 60000)); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' hr ago' : m < 10080 ? Math.round(m / 1440) + ' day' + (m >= 2880 ? 's' : '') + ' ago' : new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); };
  const ico = (k) => (window.DASH ? window.DASH.ico(k) : '');
  let S = null;

  function unmount() {
    if (!S) return;
    clearInterval(S.timer); document.removeEventListener('click', S.onDoc); document.removeEventListener('keydown', S.onKey); document.removeEventListener('visibilitychange', S.onVis);
    S.host.remove(); S = null;
  }

  function mount(opts) {
    if (S) return;
    const { sb, audience } = opts; if (!sb) return;
    const host = document.createElement('div'); host.className = 'nc'; host.setAttribute('data-aud', audience);
    host.innerHTML = `<button class="nc-bell" type="button" aria-label="Notifications" aria-haspopup="true" aria-expanded="false">${ico('bell')}<span class="nc-badge" hidden>0</span></button>
      <div class="nc-panel" role="dialog" aria-label="Notifications" hidden>
        <div class="nc-head"><b>Notifications</b><button type="button" class="nc-link" data-a="readall">Mark all as read</button></div>
        <div class="nc-list" aria-live="polite"><p class="nc-empty">Loading…</p></div>
        <div class="nc-foot">${audience === 'admin' ? `<button type="button" class="nc-btn" data-a="send">${ico('send')}Send notification</button><button type="button" class="nc-link" data-a="all">View all</button>` : '<span class="nc-note">Updates from your institute appear here.</span>'}</div>
      </div>`;
    document.body.appendChild(host);
    const bell = host.querySelector('.nc-bell'), badge = host.querySelector('.nc-badge'), panel = host.querySelector('.nc-panel'), list = host.querySelector('.nc-list');
    S = { host, items: [], unread: 0, setup: false, open: false };

    const paint = () => {
      badge.hidden = !S.unread; badge.textContent = S.unread > 99 ? '99+' : S.unread;
      bell.classList.toggle('has', S.unread > 0);
      bell.setAttribute('aria-label', S.unread ? `Notifications, ${S.unread} unread` : 'Notifications');
      if (S.setup) { list.innerHTML = '<p class="nc-empty">The notification centre is being set up. Ask the administrator to run the v7 SQL update.</p>'; return; }
      list.innerHTML = S.items.length ? S.items.map((n) => { const [ic, c] = ICON[n.kind] || ICON.info;
        return `<button type="button" class="nc-item${n.read_at ? '' : ' un'}" data-id="${n.id}"><span class="d-ico ${c}">${ico(ic)}</span><span class="nc-t"><b>${esc(n.title)}</b>${n.body ? `<small>${esc(n.body)}</small>` : ''}<em>${ago(n.created_at)}</em></span></button>`; }).join('')
        : '<p class="nc-empty">You are all caught up. 🎉</p>';
    };
    const ring = () => { bell.classList.remove('ring'); void bell.offsetWidth; bell.classList.add('ring'); };

    async function refresh(quiet) {
      if (!S) return;
      try { await load(quiet); } catch (e) { /* the bell must never disturb the portal */ }
    }
    async function load(quiet) {
      const [a, c] = await Promise.all([
        sb.from('notifications').select('*').eq('audience', audience).order('created_at', { ascending: false }).limit(30),
        sb.from('notifications').select('id', { count: 'exact', head: true }).eq('audience', audience).is('read_at', null)]);
      if (!S) return;
      if (a.error) { S.setup = /42P01|PGRST205|does not exist|schema cache/i.test((a.error.code || '') + ' ' + a.error.message); if (!S.setup) return; paint(); return; }
      S.setup = false;
      const before = S.unread, newest = S.items[0] && S.items[0].id;
      S.items = a.data || []; S.unread = c.error ? S.items.filter((n) => !n.read_at).length : c.count || 0;
      paint();
      if (quiet !== true && S.unread > before && S.items[0] && S.items[0].id !== newest) ring();
    }
    async function markRead(ids) {
      const now = new Date().toISOString();
      S.items.forEach((n) => { if (!ids || ids.includes(n.id)) n.read_at = n.read_at || now; });
      S.unread = S.items.filter((n) => !n.read_at).length; paint();
      try { await sb.rpc('mark_notifications_read', { p_ids: ids || null }); } catch (e) { /* shown again on next refresh */ }
      refresh(true);
    }
    const setOpen = (v) => { S.open = v; panel.hidden = !v; bell.setAttribute('aria-expanded', String(v)); host.classList.toggle('open', v); if (v) { refresh(true); bell.classList.remove('ring'); } };

    bell.addEventListener('click', (e) => { e.stopPropagation(); setOpen(!S.open); });
    panel.addEventListener('click', (e) => {
      e.stopPropagation();
      const it = e.target.closest('.nc-item'), a = e.target.closest('[data-a]');
      if (it) { const n = S.items.find((x) => x.id === it.dataset.id); if (n) { if (!n.read_at) markRead([n.id]); setOpen(false); if (opts.onOpen) opts.onOpen(n, 'item'); } }
      else if (a) { const act = a.dataset.a; if (act === 'readall') markRead(null); else { setOpen(false); if (opts.onOpen) opts.onOpen(null, act); } }
    });
    S.onDoc = (e) => { if (S && S.open && !host.contains(e.target)) setOpen(false); };
    S.onKey = (e) => { if (S && S.open && e.key === 'Escape') { setOpen(false); bell.focus(); } };
    S.onVis = () => { if (!document.hidden) refresh(); };
    document.addEventListener('click', S.onDoc); document.addEventListener('keydown', S.onKey); document.addEventListener('visibilitychange', S.onVis);
    S.timer = setInterval(() => { if (!document.hidden) refresh(); }, 45000);
    S.refresh = refresh;
    refresh(true).then(() => { if (S && S.unread) ring(); });
  }
  window.BCTI_NOTIFY = { mount, unmount, refresh: () => S && S.refresh && S.refresh() };
})();
