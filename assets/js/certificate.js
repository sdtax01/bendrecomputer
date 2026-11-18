/* Certificate generator — A4 landscape, drawn on a 300-dpi canvas, saved as PDF (or PNG).
   No libraries. Used by both the admin dashboard and the student portal.

   const canvas = await BCTI_CERT.render({
     name, regNo, course, duration, startDate, completedOn, issuedOn, grade, certNo,
     photo: Blob|null, institute: { name, address, phone }
   });
   BCTI_CERT.save(canvas, 'Certificate-Rahul', 'pdf' | 'png');
*/
(function () {
  const SCRIPT_SRC = (document.currentScript && document.currentScript.src) || location.href;
  const LOGO_URL = new URL('../images/bendre-institute-logo.png', SCRIPT_SRC).href;
  const W = 3508, H = 2480;                       // A4 landscape @ 300 dpi
  const C = { navy: '#07152F', deep: '#0B2454', blue: '#0866D8', sky: '#168BFF', gold: '#E9A21A', orange: '#FF791F', ink: '#1b2a4d', muted: '#5a6784', paper: '#FFFEFA' };
  const SERIF = '"Fraunces", Georgia, "Times New Roman", serif';
  const SANS = '"Figtree", "Segoe UI", system-ui, sans-serif';
  const SCRIPT = '"Dancing Script", "Segoe Script", "Brush Script MT", cursive';

  const fmt = (d) => {
    if (!d) return '';
    const x = new Date(String(d).length === 10 ? d + 'T00:00:00' : d);
    return isNaN(x) ? '' : x.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  async function fonts() {
    if (!document.fonts || !document.fonts.load) return;
    try {
      await Promise.all(['700 100px "Fraunces"', 'italic 400 60px "Fraunces"', '500 60px "Figtree"', '800 60px "Figtree"', '700 100px "Dancing Script"'].map((f) => document.fonts.load(f, 'Aa')));
    } catch (e) { /* fall back to system fonts */ }
  }
  const loadImg = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  async function blobImg(blob) {
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    const i = await loadImg(url); setTimeout(() => URL.revokeObjectURL(url), 5000); return i;
  }

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function spaced(ctx, text, x, y, gap) {          // centred, letter-spaced text
    const chars = [...text]; const widths = chars.map((c) => ctx.measureText(c).width);
    const total = widths.reduce((a, b) => a + b, 0) + gap * (chars.length - 1);
    let cx = x - total / 2; const align = ctx.textAlign; ctx.textAlign = 'left';
    chars.forEach((c, i) => { ctx.fillText(c, cx, y); cx += widths[i] + gap; });
    ctx.textAlign = align;
  }
  function fit(ctx, text, font, size, maxW) {      // shrink font until the text fits
    let s = size; do { ctx.font = font(s); s -= 4; } while (ctx.measureText(text).width > maxW && s > 40);
    return s + 4;
  }
  function corner(ctx, x, y, sx, sy) {             // decorative corner fan
    ctx.save(); ctx.translate(x, y); ctx.scale(sx, sy);
    [[C.navy, 300], [C.blue, 230], [C.orange, 160], [C.gold, 100]].forEach(([col, s]) => {
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s, 0); ctx.lineTo(0, s); ctx.closePath(); ctx.fill();
    });
    ctx.restore();
  }
  function seal(ctx, cx, cy, r) {
    ctx.save(); ctx.translate(cx, cy);
    // ribbons
    ctx.fillStyle = C.orange; ctx.beginPath(); ctx.moveTo(-r * .55, r * .5); ctx.lineTo(-r * .85, r * 1.55); ctx.lineTo(-r * .45, r * 1.3); ctx.lineTo(-r * .2, r * 1.6); ctx.lineTo(-r * .1, r * .7); ctx.fill();
    ctx.fillStyle = C.blue; ctx.beginPath(); ctx.moveTo(r * .55, r * .5); ctx.lineTo(r * .85, r * 1.55); ctx.lineTo(r * .45, r * 1.3); ctx.lineTo(r * .2, r * 1.6); ctx.lineTo(r * .1, r * .7); ctx.fill();
    // scalloped medal
    const g = ctx.createRadialGradient(0, -r * .3, r * .1, 0, 0, r * 1.1); g.addColorStop(0, '#FFE08A'); g.addColorStop(.55, '#F0B23A'); g.addColorStop(1, '#B9780C');
    ctx.fillStyle = g; ctx.beginPath();
    for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2, rad = r * (i % 2 ? .93 : 1.02); ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, r * .8, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = C.navy; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, r * .72, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = C.navy; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `800 ${r * .5}px ${SANS}`; ctx.fillText('BCTI', 0, -r * .08);
    ctx.font = `700 ${r * .15}px ${SANS}`; ctx.fillText('CERTIFIED', 0, r * .3);
    ctx.font = `${r * .22}px ${SERIF}`; ctx.fillStyle = C.blue; ctx.fillText('★ ★ ★', 0, -r * .45);
    ctx.restore();
  }

  async function render(o) {
    await fonts();
    const [logo, photo] = await Promise.all([loadImg(LOGO_URL), blobImg(o.photo)]);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d'); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center';

    // paper
    ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H);
    // faint watermark logo
    if (logo) { ctx.save(); ctx.globalAlpha = .045; const ww = 1900, hh = ww * logo.height / logo.width; ctx.drawImage(logo, (W - ww) / 2, (H - hh) / 2 + 60, ww, hh); ctx.restore(); }
    // fine diagonal texture
    ctx.save(); ctx.strokeStyle = 'rgba(11,36,84,.035)'; ctx.lineWidth = 2;
    for (let i = -H; i < W; i += 36) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + H, H); ctx.stroke(); }
    ctx.restore();

    // frame: navy band, gold line, hairline
    ctx.fillStyle = C.navy; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = C.paper; ctx.fillRect(46, 46, W - 92, H - 92);
    ctx.strokeStyle = C.gold; ctx.lineWidth = 10; ctx.strokeRect(78, 78, W - 156, H - 156);
    ctx.strokeStyle = C.deep; ctx.lineWidth = 3; ctx.strokeRect(104, 104, W - 208, H - 208);
    // redraw watermark/texture inside frame was already under; add corner fans
    corner(ctx, 46, 46, 1, 1); corner(ctx, W - 46, 46, -1, 1); corner(ctx, 46, H - 46, 1, -1); corner(ctx, W - 46, H - 46, -1, -1);

    // top-left meta
    ctx.textAlign = 'left'; ctx.fillStyle = C.muted; ctx.font = `600 38px ${SANS}`;
    ctx.fillText('CERTIFICATE NO.', 330, 330); ctx.fillStyle = C.navy; ctx.font = `800 52px ${SANS}`; ctx.fillText(o.certNo || '—', 330, 392);
    ctx.fillStyle = C.muted; ctx.font = `600 38px ${SANS}`; ctx.fillText('REGISTRATION NO.', 330, 480); ctx.fillStyle = C.navy; ctx.font = `800 52px ${SANS}`; ctx.fillText(o.regNo || '—', 330, 542);

    // logo (centre top)
    if (logo) { const lh = 400, lw = lh * logo.width / logo.height; ctx.drawImage(logo, (W - lw) / 2, 190, lw, lh); }

    // photo frame (top-right)
    const px = W - 330 - 440, py = 250, pw = 440, ph = 560;
    ctx.save(); ctx.shadowColor = 'rgba(7,21,47,.25)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10; ctx.fillStyle = '#fff'; rr(ctx, px - 22, py - 22, pw + 44, ph + 44, 14); ctx.fill(); ctx.restore();
    ctx.strokeStyle = C.gold; ctx.lineWidth = 8; rr(ctx, px - 22, py - 22, pw + 44, ph + 44, 14); ctx.stroke();
    if (photo) {
      ctx.save(); rr(ctx, px, py, pw, ph, 6); ctx.clip();
      const s = Math.max(pw / photo.width, ph / photo.height), dw = photo.width * s, dh = photo.height * s;
      ctx.drawImage(photo, px + (pw - dw) / 2, py + (ph - dh) * .35, dw, dh); ctx.restore();
    } else {
      ctx.fillStyle = '#eef3fb'; ctx.fillRect(px, py, pw, ph); ctx.fillStyle = C.muted; ctx.textAlign = 'center'; ctx.font = `600 40px ${SANS}`;
      ctx.fillText('Student', px + pw / 2, py + ph / 2 - 10); ctx.fillText('Photo', px + pw / 2, py + ph / 2 + 44);
    }

    // title
    ctx.textAlign = 'center'; ctx.fillStyle = C.navy; ctx.font = `700 190px ${SERIF}`; spaced(ctx, 'CERTIFICATE', W / 2, 860, 26);
    ctx.fillStyle = C.orange; ctx.font = `700 66px ${SANS}`; spaced(ctx, 'OF  COMPLETION', W / 2, 960, 24);
    // ornamental rule
    ctx.strokeStyle = C.gold; ctx.lineWidth = 6; [[W / 2 - 560, W / 2 - 80], [W / 2 + 80, W / 2 + 560]].forEach(([a, b]) => { ctx.beginPath(); ctx.moveTo(a, 1010); ctx.lineTo(b, 1010); ctx.stroke(); });
    ctx.fillStyle = C.orange; ctx.save(); ctx.translate(W / 2, 1010); ctx.rotate(Math.PI / 4); ctx.fillRect(-16, -16, 32, 32); ctx.restore();

    ctx.fillStyle = C.muted; ctx.font = `italic 400 64px ${SERIF}`; ctx.fillText('This is to certify that', W / 2, 1140);

    // student name
    const name = (o.name || '').trim();
    const ns = fit(ctx, name, (s) => `700 ${s}px ${SCRIPT}`, 240, 2500);
    ctx.fillStyle = C.deep; ctx.font = `700 ${ns}px ${SCRIPT}`; ctx.fillText(name, W / 2, 1330);
    const nw = Math.min(ctx.measureText(name).width + 200, 2700);
    const lg = ctx.createLinearGradient(W / 2 - nw / 2, 0, W / 2 + nw / 2, 0); lg.addColorStop(0, 'rgba(233,162,26,0)'); lg.addColorStop(.2, C.gold); lg.addColorStop(.8, C.gold); lg.addColorStop(1, 'rgba(233,162,26,0)');
    ctx.fillStyle = lg; ctx.fillRect(W / 2 - nw / 2, 1368, nw, 6);

    ctx.fillStyle = C.muted; ctx.font = `italic 400 64px ${SERIF}`;
    ctx.fillText('has successfully completed the course of', W / 2, 1490);

    // course
    const course = (o.course || '').trim();
    const cs = fit(ctx, course, (s) => `800 ${s}px ${SANS}`, 150, 2600);
    ctx.fillStyle = C.blue; ctx.font = `800 ${cs}px ${SANS}`; ctx.fillText(course, W / 2, 1490 + 40 + cs * .85);

    // details row
    const bits = [];
    if (o.duration) bits.push(['DURATION', o.duration]);
    if (o.startDate) bits.push(['STARTED', fmt(o.startDate)]);
    if (o.completedOn) bits.push(['COMPLETED', fmt(o.completedOn)]);
    if (o.grade) bits.push(['GRADE', o.grade]);
    if (bits.length) {
      const cell = 640, total = cell * bits.length, x0 = W / 2 - total / 2 + cell / 2, y0 = 1490 + 40 + cs * .85 + 130;
      bits.forEach(([k, v], i) => {
        const x = x0 + i * cell;
        ctx.fillStyle = C.muted; ctx.font = `700 34px ${SANS}`; spaced(ctx, k, x, y0, 6);
        ctx.fillStyle = C.navy; ctx.font = `700 56px ${SANS}`; ctx.fillText(v, x, y0 + 72);
        if (i) { ctx.strokeStyle = 'rgba(11,36,84,.2)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - cell / 2, y0 - 40); ctx.lineTo(x - cell / 2, y0 + 90); ctx.stroke(); }
      });
    }

    // bottom: date | seal | signature
    const by = 2090;
    ctx.fillStyle = C.navy; ctx.font = `700 56px ${SANS}`; ctx.fillText(fmt(o.issuedOn) || fmt(new Date().toISOString().slice(0, 10)), 700, by);
    ctx.fillStyle = C.navy; ctx.fillRect(420, by + 24, 560, 4);
    ctx.fillStyle = C.muted; ctx.font = `600 38px ${SANS}`; ctx.fillText('DATE OF ISSUE', 700, by + 80);

    seal(ctx, W / 2, by - 85, 150);

    ctx.fillStyle = C.navy; ctx.fillRect(W - 980, by + 24, 560, 4);
    ctx.fillStyle = C.navy; ctx.font = `700 46px ${SANS}`; ctx.fillText('Authorised Signatory', W - 700, by + 84);
    ctx.fillStyle = C.muted; ctx.font = `500 36px ${SANS}`; ctx.fillText((o.institute && o.institute.name) || 'Bendre Computer Typing Institute', W - 700, by + 132);

    // footer
    ctx.fillStyle = C.muted; ctx.font = `500 34px ${SANS}`;
    const addr = [o.institute && o.institute.address, o.institute && o.institute.phone && ('Phone: ' + o.institute.phone)].filter(Boolean).join('   |   ');
    if (addr) ctx.fillText(addr, W / 2, H - 138);
    return cv;
  }

  /* ---- minimal PDF writer: one A4-landscape page holding a JPEG ---- */
  function pdfFromJpeg(jpeg, w, h) {
    const enc = new TextEncoder(), parts = [], offs = []; let len = 0;
    const push = (d) => { const u = typeof d === 'string' ? enc.encode(d) : d; parts.push(u); len += u.length; };
    const obj = (n, body) => { offs[n] = len; push(`${n} 0 obj\n${body}\nendobj\n`); };
    push('%PDF-1.4\n');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    obj(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 841.89 595.28] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
    offs[4] = len; push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
    push(jpeg); push('\nendstream\nendobj\n');
    const content = 'q 841.89 0 0 595.28 0 0 cm /Im0 Do Q';
    obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    const xref = len;
    push(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map((n) => String(offs[n]).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    const out = new Uint8Array(len); let p = 0; parts.forEach((u) => { out.set(u, p); p += u.length; });
    return new Blob([out], { type: 'application/pdf' });
  }
  const toBlob = (cv, type, q) => new Promise((res) => cv.toBlob(res, type, q));
  const safe = (s) => String(s || 'certificate').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'certificate';

  async function save(cv, base, kind) {
    let blob, name;
    if (kind === 'png') { blob = await toBlob(cv, 'image/png'); name = safe(base) + '.png'; }
    else {
      const jb = await toBlob(cv, 'image/jpeg', 0.93);
      blob = pdfFromJpeg(new Uint8Array(await jb.arrayBuffer()), cv.width, cv.height); name = safe(base) + '.pdf';
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 8000);
    return blob;
  }

  window.BCTI_CERT = { render, save, fmt };
})();
