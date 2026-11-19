/* Dashboard look & feel helpers (cosmetic only): icons for the sidebar menu + icon set for dashboard cards.
   Does not touch any data or click handlers. */
(function () {
  const P = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/><path d="M9 7h6"/>',
    bookopen: '<path d="M2 5h6a4 4 0 0 1 4 4v11a3 3 0 0 0-3-3H2z"/><path d="M22 5h-6a4 4 0 0 0-4 4v11a3 3 0 0 1 3-3h7z"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M18 14.4c2 .7 3.5 2.7 3.5 5.6"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>',
    inbox: '<path d="M3 13l2.5-8h13L21 13v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M3 13h5l1.5 2.5h5L16 13h5"/>',
    phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
    cap: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5"/><path d="M22 9v6"/>',
    wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z"/><circle cx="16.5" cy="14.5" r="1.2"/>',
    rupee: '<path d="M7 5h10M7 9h10M7 5c5 0 7 1.8 7 4s-2 4-7 4l7 6"/>',
    check: '<rect x="3" y="4" width="18" height="17" rx="2.5"/><path d="M3 9h18M8 2.5V6M16 2.5V6M9 15l2 2 4-4"/>',
    folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    clip: '<rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 4V3h6v1M9 11h6M9 15h4"/>',
    award: '<circle cx="12" cy="9" r="5.5"/><path d="M8.5 13.5L7 21l5-2.8 5 2.8-1.5-7.5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
    out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
    up: '<path d="M7 17L17 7M9 7h8v8"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    download: '<path d="M12 3v12M7 11l5 5 5-5M4 20h16"/>',
    upload: '<path d="M12 16V4M7 8l5-5 5 5M4 20h16"/>',
    dot: '<circle cx="12" cy="12" r="3"/>'
  };
  const MAP = {
    overview: 'grid', dashboard: 'grid', courses: 'book', batches: 'users', gallery: 'image', enquiries: 'inbox', contact: 'phone', content: 'file', seo: 'search',
    profile: 'user', students: 'cap', fees: 'wallet', attendance: 'check', materials: 'folder', material: 'bookopen', assignments: 'clip', certificates: 'award',
    settings: 'gear', logout: 'out'
  };
  const svg = (k, cls) => `<svg class="di ${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[k] || P.dot}</svg>`;
  window.DASH = { ico: svg };

  let queued = false;
  function deco() {
    queued = false;
    document.querySelectorAll('#side nav button[data-v]:not([data-di])').forEach((b) => {
      b.setAttribute('data-di', '1');
      const n = b.querySelector('.n'); if (n) n.remove();
      b.insertAdjacentHTML('afterbegin', svg(MAP[b.dataset.v]));
    });
  }
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(deco); } }).observe(document.documentElement, { childList: true, subtree: true });
  deco();
})();
