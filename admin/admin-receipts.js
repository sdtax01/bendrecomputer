/* Admin-only fee receipts: view / print / PDF, automatic PAID stamp, payment reversal.
   The receipt is drawn on a 300-dpi canvas so the preview, the print-out and the PDF are identical.
   All figures come from the database function receipt_data() — which refuses anyone who is not an administrator —
   and the PAID decision is made there (balance zero after all valid payments, payment not reversed), never in the browser.
   Needs schema-update-v10-receipts.sql. Plugs into admin.js via window.BCTI_ADMIN_EXT.receipts. */
(function () {
  const EXT = window.BCTI_ADMIN_EXT;
  if (!EXT || !EXT.api) return;
  const { sb, esc, toast, fail, modal } = EXT.api;

  /* ---------- layout constants (design units; scaled to the canvas) ---------- */
  const W = 1640, H = 1170, PX = 2400, K = PX / W;
  const RED = '#E20613', BLACK = '#111', INK = '#1c1c1c', GREEN = '#0B9B50';
  const SANS = 'Arial, "Liberation Sans", Helvetica, sans-serif';
  const HAND = '"BctiHand", "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';

  /* ---------- helpers ---------- */
  const dmy = (d) => { const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
  const money = (n) => { const v = Number(n || 0); return v.toLocaleString('en-IN', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 }) + '/-'; };
  const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (n) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : ''));
  function words(n) {                                    // Indian system: thousand, lakh, crore
    n = Math.floor(n); if (!n) return 'Zero';
    const parts = [[10000000, 'Crore'], [100000, 'Lakh'], [1000, 'Thousand'], [100, 'Hundred']]; const out = [];
    parts.forEach(([v, name]) => { if (n >= v) { const q = Math.floor(n / v); out.push((q >= 100 && v !== 100 ? words(q) : two(q)) + ' ' + name); n %= v; } });
    if (n) out.push(two(n)); return out.join(' ');
  }
  const rupeesInWords = (amt) => { const r = Math.floor(amt), p = Math.round((amt - r) * 100); return 'Rupees ' + words(r) + (p ? ' and ' + two(p) + ' Paise' : '') + ' Only'; };

  /* ---------- assets: handwriting font (self-hosted) and the stamp ---------- */
  const base = (p) => new URL(p, document.baseURI).href;
  let assetsP = null;
  function loadAssets() {
    if (assetsP) return assetsP;
    const face = (file, range, w) => new FontFace('BctiHand', `url(${base('../assets/fonts/' + file)})`, { weight: String(w), unicodeRange: range });
    const latin = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
    const deva = 'U+0900-097F,U+1CD0-1CF9,U+200C-200D,U+20A8,U+20B9,U+25CC,U+A830-A839,U+A8E0-A8FF';
    assetsP = (async () => {
      try {
        const fs = [face('kalam-latin-400-normal.woff2', latin, 400), face('kalam-devanagari-400-normal.woff2', deva, 400)];
        await Promise.all(fs.map((f) => f.load().then((x) => document.fonts.add(x))));
      } catch (e) { /* falls back to Segoe Print / cursive */ }
      const stamp = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = base('../assets/img/paid-stamp.png'); });
      return { stamp };
    })();
    return assetsP;
  }

  /* ---------- the receipt drawing ---------- */
  async function render(d) {
    const { stamp } = await loadAssets();
    const cv = document.createElement('canvas'); cv.width = PX; cv.height = Math.round(H * K);
    const c = cv.getContext('2d'); c.scale(K, K); c.fillStyle = '#fff'; c.fillRect(0, 0, W, H); c.textBaseline = 'alphabetic';
    const line = (x1, y1, x2, y2, col, w) => { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); };
    const rect = (x, y, w, h, col, lw) => { c.strokeStyle = col; c.lineWidth = lw; c.strokeRect(x, y, w, h); };
    const txt = (s, x, y, size, col, o = {}) => { c.font = `${o.hand ? '400' : 'bold'} ${size}px ${o.hand ? HAND : SANS}`; c.fillStyle = col; c.textAlign = o.align || 'left'; c.fillText(s, x, y); };
    const fit = (s, x, y, size, col, maxW, o = {}) => { c.font = `${o.hand ? '400' : 'bold'} ${size}px ${o.hand ? HAND : SANS}`; const w = c.measureText(s).width; txt(s, x, y, w > maxW ? size * maxW / w : size, col, o); };
    const hand = (s, x, y, size, maxW, align) => fit(String(s || ''), x, y, size, INK, maxW, { hand: true, align });
    const spaced = (s, cx, y, size, col, gap) => { c.font = `bold ${size}px ${SANS}`; c.fillStyle = col; c.textAlign = 'left'; const ws = [...s].map((ch) => c.measureText(ch).width); const tot = ws.reduce((a, b) => a + b, 0) + gap * (s.length - 1); let x = cx - tot / 2; [...s].forEach((ch, i) => { c.fillText(ch, x, y); x += ws[i] + gap; }); };

    /* frame + header */
    rect(18, 22, 1604, 1118, BLACK, 3);
    fit('BENDRE COMPUTER TYPING INSTITUTE', 820, 98, 70, RED, 1354, { align: 'center' });
    txt('Utkarsha, Plot No. 4, Gat No. 267, Vithoba Park, Maher Sanstha Road,', 820, 148, 33, BLACK, { align: 'center' });
    txt('Nr. Mankainagar, Manjari Khurd, Pune 412 307.', 820, 190, 33, BLACK, { align: 'center' });
    txt('Mob. 9763636548 / 9657037708', 820, 236, 36, BLACK, { align: 'center' });
    c.strokeStyle = BLACK; c.lineWidth = 3; c.beginPath(); c.roundRect(640, 268, 363, 62, 31); c.stroke();
    spaced('RECEIPT', 821, 314, 44, RED, 14);

    /* number, GR box, date */
    txt('No. :', 44, 352, 36, RED); hand(d.display_no, 135, 354, 46, 300);
    rect(1172, 306, 425, 108, BLACK, 3); line(1323, 306, 1323, 414, BLACK, 3); line(1172, 360, 1597, 360, BLACK, 3);
    txt('GR.No.', 1188, 345, 34, RED); txt('Date :', 1188, 399, 34, RED);
    hand(d.reg_no, 1335, 345, 30, 252); hand(dmy(d.paid_on), 1335, 399, 32, 252);

    /* a red label followed by a ruled line that starts right after the label, with the handwritten value sitting on it */
    const lab = (label, x, y) => { c.font = `bold 36px ${SANS}`; txt(label, x, y, 36, RED); return x + c.measureText(label).width + 14; };
    const ruled = (label, x, y, xEnd, value, size) => { const x0 = lab(label, x, y); line(x0, y + 8, xEnd, y + 8, RED, 2); hand(value, x0 + 12, y, size, xEnd - x0 - 24); return x0; };

    /* received from / amount */
    ruled('Received with thanks from', 44, 448, 1597, d.student_name, 42);
    c.font = `bold 36px ${SANS}`; const oa = c.measureText('on account of').width;
    ruled('Rs.', 44, 505, 1600 - oa - 18, money(d.amount), 42); txt('on account of', 1600, 505, 36, RED, { align: 'right' });
    txt('English / Marathi / Hindi Computer Typing / Tally / Adv. Excel / others.', 44, 562, 36, RED);

    /* course / words / mode */
    ruled('Course :', 44, 622, 1597, [d.course, d.duration ? '(' + d.duration + ')' : ''].filter(Boolean).join('  '), 40);
    ruled('Rupees (in words) :', 44, 682, 1597, rupeesInWords(d.amount), 38);
    ruled('Payment Mode :', 44, 742, 800, d.mode, 40);
    ruled('Ref. / Txn No. :', 830, 742, 1597, d.reference || '', 36);

    /* fee table (this receipt) */
    const tx = 30, ty = 785, rh = 45, c1 = 322, c2 = 218; c.fillStyle = '#fff';
    const head = d.fee_head, amt = money(d.amount);
    const rows = [['Particulars', 'Amount (₹)'], ['Admission Fee', head === 'Admission' ? amt : ''], ['Tuition Fee', head === 'Tuition' ? amt : ''], ['Other Fee', head === 'Other' ? amt : ''], ['Total Fee', amt]];
    rows.forEach((r, i) => { const y = ty + i * rh; rect(tx, y, c1, rh, BLACK, 3); rect(tx + c1, y, c2, rh, BLACK, 3); txt(r[0], tx + 12, y + 33, 30, RED); if (i === 0) txt(r[1], tx + c1 + 12, y + 33, 28, RED); else if (r[1]) hand(r[1], tx + c1 + c2 - 12, y + 33, 30, c2 - 24, 'right'); });
    /* payment summary */
    const sx = 605, s1 = 330, s2 = 205;
    const sum = [['Particulars', 'Amount (₹)'], ['Total Course Fee', money(d.total_fee)], ['Latest Fee Received', money(d.amount)], ['Total Fees Received', money(d.received_total)], ['Pending Balance', money(d.pending)]];
    sum.forEach((r, i) => { const y = ty + i * rh; rect(sx, y, s1, rh, BLACK, 3); rect(sx + s1, y, s2, rh, BLACK, 3); txt(r[0], sx + 12, y + 33, 28, RED); if (i === 0) txt(r[1], sx + s1 + 12, y + 33, 28, RED); else hand(r[1], sx + s1 + s2 - 12, y + 33, 30, s2 - 24, 'right'); });
    if (d.excess > 0) txt('Advance / excess received: ' + money(d.excess), sx, ty + 5 * rh + 36, 26, RED);

    /* principal */
    txt('Principal/Teacher', 1560, 985, 40, RED, { align: 'right' });
    txt('A.T.C. Code No. MAH 2011-088', 1590, 1033, 32, RED, { align: 'right' });
    fit("Note: Fees paid are non-refundable under any circumstances and cannot be transferred to another person's name.", 820, 1105, 28, RED, 1500, { align: 'center' });

    /* PAID stamp — only when the server says the enrolment is fully paid and this payment stands */
    if (d.paid_in_full && stamp) { c.save(); c.translate(1498, 178); c.rotate(-3 * Math.PI / 180); const sw = 232, sh = sw * stamp.height / stamp.width; c.drawImage(stamp, -sw / 2, -sh / 2, sw, sh); c.restore(); }
    /* reversed payments carry a diagonal mark instead */
    if (d.reversed) { c.save(); c.translate(W / 2, H / 2); c.rotate(-18 * Math.PI / 180); c.globalAlpha = 0.28; txt('REVERSED – NOT VALID', 0, 40, 150, RED, { align: 'center' }); c.restore(); }
    return cv;
  }

  /* ---------- output: print / PDF / PNG ---------- */
  const blobOf = (cv, type, q) => new Promise((r) => cv.toBlob(r, type, q));
  function pdfFromJpeg(jpeg, w, h) {                       // one page exactly the size of the receipt (200 mm wide)
    const pw = 566.93, ph = +(pw * h / w).toFixed(2), enc = new TextEncoder(), parts = [], offs = []; let len = 0;
    const push = (x) => { const u = typeof x === 'string' ? enc.encode(x) : x; parts.push(u); len += u.length; };
    const obj = (n, b) => { offs[n] = len; push(`${n} 0 obj\n${b}\nendobj\n`); };
    push('%PDF-1.4\n'); obj(1, '<< /Type /Catalog /Pages 2 0 R >>'); obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
    offs[4] = len; push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`); push(jpeg); push('\nendstream\nendobj\n');
    const ct = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`; obj(5, `<< /Length ${ct.length} >>\nstream\n${ct}\nendstream`);
    const xr = len; push(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map((n) => String(offs[n]).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xr}\n%%EOF`);
    const out = new Uint8Array(len); let p = 0; parts.forEach((u) => { out.set(u, p); p += u.length; }); return new Blob([out], { type: 'application/pdf' });
  }
  const fname = (d, ext) => `Receipt-${d.display_no}-${String(d.student_name || '').replace(/[^A-Za-z0-9]+/g, '_')}.${ext}`;
  const save = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); };
  async function savePdf(d) { const cv = await render(d); const jb = await blobOf(cv, 'image/jpeg', 0.95); save(pdfFromJpeg(new Uint8Array(await jb.arrayBuffer()), cv.width, cv.height), fname(d, 'pdf')); }
  async function printReceipt(d) {                         // hidden frame: no pop-up blocker, nothing else from the admin screen is printed
    const cv = await render(d), url = cv.toDataURL('image/png');
    const f = document.createElement('iframe'); f.setAttribute('aria-hidden', 'true'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(f); const w = f.contentWindow, doc = w.document;
    doc.open(); doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${esc(d.display_no)}</title><style>@page{size:A4 portrait;margin:10mm}html,body{margin:0;background:#fff}img{display:block;width:190mm;height:auto}</style></head><body><img id="r" alt="Receipt"></body></html>`); doc.close();
    const im = doc.getElementById('r'); await new Promise((res) => { im.onload = res; im.src = url; });
    w.focus(); w.print(); setTimeout(() => f.remove(), 60000);
  }

  /* ---------- screens ---------- */
  async function load(paymentId) { const { data, error } = await sb.rpc('receipt_data', { p_payment: paymentId }); if (error) throw error; return data; }
  async function open(paymentId) {
    const d = await load(paymentId), cv = await render(d);
    const m = modal(`<h2 style="margin-bottom:.3rem">Receipt ${esc(d.display_no)}</h2>
      <p class="sub" style="margin:0 0 .8rem">${esc(d.student_name)} · ${esc(d.course)} · ${dmy(d.paid_on)}${d.reversed ? ' · <b style="color:var(--err)">Reversed</b>' : d.paid_in_full ? ' · <b style="color:#0a8f4a">Fully paid</b>' : ''}</p>
      ${d.reversed ? `<div class="setup-banner" role="alert">This payment was reversed on ${dmy(d.reversed_on)} (${esc(d.reversal_reason || '')}). The receipt is shown for the record only.</div>` : ''}
      <div style="max-height:62vh;overflow:auto;border:1px solid var(--line);border-radius:.6rem;background:#fff"><img id="rpv" alt="Fee receipt preview" style="display:block;width:100%;height:auto"></div>
      ${d.live_pending > 0 && !d.reversed ? `<p class="hint" style="margin:.6rem 0 0">Balance still due on this course today: <b>₹${Number(d.live_pending).toLocaleString('en-IN')}</b></p>` : ''}
      <div class="modal-actions"><button class="btn btn-ghost" data-close>Close</button><button class="btn btn-ghost" id="rpng">Download PNG</button><button class="btn btn-ghost" id="rpdf">Download PDF</button><button class="btn btn-primary" id="rprt">Print receipt</button></div>`, true);
    m.el.querySelector('#rpv').src = cv.toDataURL('image/png');
    const run = (id, fn) => m.el.querySelector(id).addEventListener('click', async (e) => { const b = e.currentTarget, t = b.textContent; b.disabled = true; b.textContent = 'Please wait…'; try { await fn(); } catch (er) { fail(er); } finally { b.disabled = false; b.textContent = t; } });
    run('#rprt', () => printReceipt(d)); run('#rpdf', () => savePdf(d)); run('#rpng', async () => save(await blobOf(cv, 'image/png'), fname(d, 'png')));
  }
  const direct = async (paymentId, kind) => { const d = await load(paymentId); if (kind === 'print') await printReceipt(d); else await savePdf(d); };

  async function reverse(paymentId, done) {
    const reason = prompt('Reverse this payment?\nIt stays in the records as reversed and the balance is restored.\n\nReason (required):');
    if (reason === null) return;
    if (reason.trim().length < 3) return toast('Please give a reason', true);
    const { error } = await sb.rpc('reverse_payment', { p_id: paymentId, p_reason: reason.trim() }); if (error) return fail(error);
    toast('Payment reversed'); if (done) done();
  }

  EXT.receipts = { enabled: () => !!(EXT.api.me && EXT.api.me.role === 'admin'), open, direct, reverse, words: rupeesInWords, render };
})();
