/* Logo intro: plays once per browser session on the home page.
   Add ?intro=1 to the URL to watch it again. Skippable (button, click or Esc).
   Not shown for visitors who prefer reduced motion. */
(function () {
  const root = document.documentElement;
  const script = document.currentScript;
  const A = script.src.replace(/js\/intro\.js.*$/, '');          // .../assets/
  const IMG = A + 'img/';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const force = /[?&]intro=1/.test(location.search);
  let seen = false; try { seen = sessionStorage.getItem('bcti-intro') === '1'; } catch (e) {}
  if (reduce || (seen && !force)) { root.classList.remove('intro-on'); return; }

  // pixel squares: the five from the logo, then extra ones drifting up from the screen
  const keep = [[1410, 82, 24, '#12326e', 2.55], [1436, 118, 22, '#1f6fe0', 2.7], [1470, 96, 30, '#e8801a', 2.85], [1432, 148, 30, '#2a7ee6', 3.0], [1440, 62, 18, '#0d2a66', 2.65]];
  const rise = [[412, 330, 12, '#5ec4ff'], [470, 300, 9, '#3aa0ff'], [520, 350, 10, '#ff9a2e'], [440, 262, 8, '#8fd8ff'], [500, 238, 13, '#2f86ff'],
                [392, 288, 8, '#ff7a18'], [540, 300, 8, '#5ec4ff'], [455, 215, 10, '#3aa0ff'], [505, 175, 8, '#ff9a2e'], [560, 200, 9, '#8fd8ff'],
                [1010, 150, 9, '#ff9a2e'], [1380, 250, 8, '#5ec4ff'], [1450, 210, 10, '#2f86ff'], [330, 180, 8, '#8fd8ff']];
  const pxs = keep.map((k) => `<rect class="px keep" x="${k[0]}" y="${k[1]}" width="${k[2]}" height="${k[2]}" fill="${k[3]}" style="--d:${k[4]}s"/>`).join('') +
    rise.map((r, i) => `<rect class="px" x="${r[0]}" y="${r[1]}" width="${r[2]}" height="${r[2]}" fill="${r[3]}" style="--d:${(2.2 + (i % 7) * .45).toFixed(2)}s;--t:${(4.2 + (i % 5) * .6).toFixed(1)}s;--o:${(.55 + (i % 3) * .2).toFixed(2)}"/>`).join('');

  const LEFT = 'M100,236 C28,290 8,400 50,480 C100,570 250,606 562,576';
  const TR = 'M1055,192 C1130,120 1280,80 1385,98 C1420,108 1405,170 1345,222';

  const html = `
  <div class="intro-bg"></div>
  <svg class="intro-svg" viewBox="0 0 1536 1024" role="img" aria-label="Bendre Computer Typing Institute. Learn, Practice, Excel. Your Skills, Our Commitment.">
    <defs>
      <filter id="iglow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <filter id="iblur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7"/></filter>
      <linearGradient id="ibadge" x1="0" x2="1"><stop offset="0" stop-color="#0f55d6"/><stop offset="1" stop-color="#0a2f9a"/></linearGradient>
      <linearGradient id="igold" x1="0" x2="1"><stop offset="0" stop-color="#ffd978"/><stop offset=".55" stop-color="#ffb02e"/><stop offset="1" stop-color="#ff8a1a"/></linearGradient>
      <mask id="imL" maskUnits="userSpaceOnUse" x="0" y="0" width="1536" height="1024"><path class="wrap-mask l" d="${LEFT}" pathLength="1" fill="none" stroke="#fff" stroke-width="130" stroke-linecap="round"/></mask>
      <mask id="imT" maskUnits="userSpaceOnUse" x="0" y="0" width="1536" height="1024"><path class="wrap-mask t" d="${TR}" pathLength="1" fill="none" stroke="#fff" stroke-width="80" stroke-linecap="round"/></mask>
      <mask id="imU" maskUnits="userSpaceOnUse" x="0" y="0" width="1536" height="1024"><rect class="wipe ul" x="560" y="590" width="976" height="60" fill="#fff"/></mask>
      <mask id="imB" maskUnits="userSpaceOnUse" x="0" y="0" width="1536" height="1024"><rect class="wipe bot" x="430" y="810" width="990" height="150" fill="#fff"/></mask>
    </defs>

    <g class="a g-base"><image href="${IMG}l-base.webp" x="0" y="70" width="610" height="730"/></g>
    <g class="a g-cap"><image href="${IMG}l-cap.webp" x="70" y="70" width="475" height="290"/></g>
    <g class="a g-swl" mask="url(#imL)" filter="url(#iglow)"><image href="${IMG}l-swoosh-left.webp" x="0" y="215" width="580" height="410"/></g>
    <path class="trail l" d="${LEFT}" pathLength="1" fill="none" stroke="#ffe3a0" stroke-width="16" stroke-linecap="round" filter="url(#iblur)"/>
    <g class="a g-swt" mask="url(#imT)" filter="url(#iglow)"><image href="${IMG}l-swoosh-tr.webp" x="1020" y="70" width="410" height="180"/></g>
    <path class="trail t" d="${TR}" pathLength="1" fill="none" stroke="#ffe3a0" stroke-width="12" stroke-linecap="round" filter="url(#iblur)"/>
    ${pxs}

    <text class="tx t1" x="590" y="345" font-size="238" textLength="885" lengthAdjust="spacingAndGlyphs">Bendre</text>
    <text class="tx t2" x="590" y="478" font-size="150" textLength="895" lengthAdjust="spacingAndGlyphs">Computer</text>
    <text class="tx t3" x="590" y="583" font-size="99" textLength="925" lengthAdjust="spacingAndGlyphs">Typing Institute</text>

    <g class="a g-ul" mask="url(#imU)" filter="url(#iglow)"><image href="${IMG}l-underline.webp" x="560" y="595" width="976" height="50"/></g>

    <g class="a g-badge">
      <rect x="565" y="645" width="945" height="86" rx="43" fill="url(#ibadge)" stroke="rgba(130,185,255,.55)" stroke-width="2"/>
      <text class="badge-t" x="652" y="710" font-size="62" textLength="172" lengthAdjust="spacingAndGlyphs">Learn</text>
      <circle cx="878" cy="693" r="11" fill="#ff7a10"/>
      <text class="badge-t" x="930" y="710" font-size="62" textLength="250" lengthAdjust="spacingAndGlyphs">Practice</text>
      <circle cx="1235" cy="693" r="11" fill="#ff7a10"/>
      <text class="badge-t" x="1285" y="710" font-size="62" textLength="160" lengthAdjust="spacingAndGlyphs">Excel</text>
    </g>

    <g class="a g-tag"><text class="tagline" x="330" y="822" font-size="84" textLength="940" lengthAdjust="spacing">Your Skills… Our Commitment…</text></g>
    <g class="a g-swb" mask="url(#imB)" filter="url(#iglow)"><image href="${IMG}l-swoosh-bot.webp" x="430" y="830" width="990" height="130"/></g>
  </svg>
  <button class="intro-skip" type="button">Skip intro</button>`;

  function mount() {
    const el = document.createElement('div');
    el.className = 'intro'; el.id = 'intro'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Intro animation');
    el.innerHTML = html;
    document.body.appendChild(el);
    root.classList.remove('intro-on');
    document.body.style.overflow = 'hidden';

    // fonts for the lettering (loaded here so inner pages never pay for them)
    if (!document.getElementById('intro-fonts')) {
      const l = document.createElement('link'); l.id = 'intro-fonts'; l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Figtree:wght@800&family=Dancing+Script:wght@600&display=swap';
      document.head.appendChild(l);
    }
    let ended = false;
    function end() {
      if (ended) return; ended = true;
      try { sessionStorage.setItem('bcti-intro', '1'); } catch (e) {}
      document.removeEventListener('keydown', onKey);
      el.classList.add('out');
      document.body.style.overflow = '';
      const lg = document.querySelector('.logo-img'); if (lg) { lg.classList.add('pop'); setTimeout(() => lg.classList.remove('pop'), 1300); }
      setTimeout(() => el.remove(), 950);
    }
    const onKey = (e) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') end(); };
    document.addEventListener('keydown', onKey);
    el.addEventListener('click', end);

    // start once the images and lettering fonts are ready (never wait more than 1.6 s)
    const imgs = [...el.querySelectorAll('image')].map((i) => new Promise((r) => { const p = new Image(); p.onload = p.onerror = r; p.src = i.getAttribute('href'); }));
    const fonts = document.fonts && document.fonts.load ? Promise.all([document.fonts.load('800 100px Figtree'), document.fonts.load('600 80px "Dancing Script"')]) : Promise.resolve();
    Promise.race([Promise.all([...imgs, fonts]), new Promise((r) => setTimeout(r, 1600))]).then(() => {
      requestAnimationFrame(() => { el.classList.add('run'); });
      setTimeout(end, 7000);
    });
  }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
