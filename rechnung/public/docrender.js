/* Rechnung, Gutschrift, Zahlungserinnerung und Auftragsbestätigung als A4-Dokument in der Sprache des Kunden.
   Wird im Programm und auf der Unterschriftsseite für Kunden benutzt. */
(function (root) {
  'use strict';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => new Date().toISOString().slice(0, 10);
  const safeImg = (src) => (/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(String(src || '')) ? src : '');

  // opts: { seller, logo, reminder }
  function render(inv, opts = {}) {
    const L = DocLang.get(inv.language), lang = inv.language;
    const s = opts.seller || inv.seller || {};
    const reminder = !!opts.reminder;
    const t = Calc.totals(inv);
    const m = (c) => DocLang.money(c, inv.currency, lang);
    const F = (k, v) => DocLang.fill(L[k], v);
    const credit = inv.type === 'credit';
    const order = inv.type === 'order';
    const docName = reminder ? L.reminder : order ? L.order : credit ? L.credit : L.invoice;
    const numStr = inv.number ?? '—';
    const legal = [];
    if (inv.vatScheme === 'eu_rc') { if (t.services) legal.push(L.rcServices); if (t.goods) legal.push(L.rcGoods); }
    if (inv.vatScheme === 'export') legal.push(L.export);
    const lines = inv.lines.filter((l) => l.text || Number(l.price));
    const hasDisc = lines.some((l) => Number(l.discount));
    const foreign = inv.currency !== 'DKK';
    const fik = !credit && !order && s.fikCreditor && inv.number ? Calc.fikLine(inv.number, s.fikCreditor) : '';
    const sellerLines = [s.company, s.owner && s.owner !== s.company ? s.owner : '', s.street, [s.zip, s.city].filter(Boolean).join(' '), s.country && s.country !== inv.customerCountry ? DocLang.country(s.country, lang) : ''].filter(Boolean);
    const vals = { total: m(Calc.sign(inv) * t.gross), due: DocLang.date(inv.dueDate, lang), number: numStr, company: s.company, doc: docName };
    const logo = safeImg(opts.logo);
    const nf = new Intl.NumberFormat(L.locale);

    const meta = order
      ? `<tr><td>${esc(L.orderNumber)}</td><td><b>${esc(numStr)}</b></td></tr>
         <tr><td>${esc(L.orderDate)}</td><td>${DocLang.date(inv.date, lang)}</td></tr>
         ${inv.deliveryDate ? `<tr><td>${esc(L.delivery)}</td><td>${DocLang.date(inv.deliveryDate, lang)}</td></tr>` : ''}
         ${inv.validUntil && !inv.signedAt ? `<tr><td>${esc(L.validUntil)}</td><td>${DocLang.date(inv.validUntil, lang)}</td></tr>` : ''}`
      : `<tr><td>${esc(credit ? L.creditNumber : L.number)}</td><td><b>${esc(numStr)}</b></td></tr>
         <tr><td>${esc(L.date)}</td><td>${DocLang.date(reminder ? today() : inv.date, lang)}</td></tr>
         ${!credit ? `<tr><td>${esc(L.due)}</td><td>${DocLang.date(inv.dueDate, lang)}</td></tr>` : ''}`;

    // Auftragsbestätigung: Zahlungsbedingungen und Unterschrift statt Bankdaten
    const orderBottom = order ? `
      <div class="pay">${esc(F('orderTerms', { days: inv.dueDays ?? 14 }))}</div>
      ${inv.customerComment ? `<div class="legal"><b>${esc(L.customerComment)}:</b> ${esc(inv.customerComment)}</div>` : ''}
      <div class="sig">${inv.signedAt
        ? `<img src="${safeImg(inv.signature)}" alt=""><div>${esc(F('signedBy', { name: inv.signerName, date: `${DocLang.date(inv.signedAt.slice(0, 10), lang)} ${inv.signedAt.slice(11, 16)} UTC` }))}</div>`
        : `<div class="sig-line"></div><div>${esc(L.sigLine)}</div>`}</div>` : '';

    const payBlock = order ? '' : `<div class="pay"><b>${esc(L.payment)}</b><br>${esc(credit ? L.creditText : F('payText', vals))}
      ${!credit ? `<table style="margin-top:2mm">${s.bankName ? `<tr><td>${esc(L.bank)}</td><td>${esc(s.bankName)}</td></tr>` : ''}
        ${s.regNo && (inv.customerCountry === 'DK' || !s.iban) ? `<tr><td>${esc(L.regKonto)}</td><td>${esc(s.regNo)} ${esc(s.accountNo)}</td></tr>` : ''}
        ${s.iban ? `<tr><td>${esc(L.iban)}</td><td>${esc(s.iban)}</td></tr>` : ''}${s.bic && s.iban ? `<tr><td>${esc(L.bic)}</td><td>${esc(s.bic)}</td></tr>` : ''}</table>
        ${fik && inv.currency === 'DKK' && inv.customerCountry === 'DK' ? `<div class="fik">${esc(L.fik)}: ${esc(fik)}</div>` : ''}` : ''}</div>`;

    return `<div class="doc">
    <div class="top"><div>${logo ? `<img class="logo" src="${logo}" alt="">` : `<div style="font-size:16pt;font-weight:700">${esc(s.company)}</div>`}</div>
      <div class="seller">${sellerLines.map(esc).join('<br>')}<br>${esc(L.ourVat)} ${esc(s.cvr)}${s.email ? '<br>' + esc(s.email) : ''}${s.phone ? '<br>' + esc(s.phone) : ''}${s.web ? '<br>' + esc(s.web) : ''}</div></div>
    <div class="addr"><div class="sender">${esc([s.company, s.street, [s.zip, s.city].join(' ')].filter(Boolean).join(' · '))}</div><br>
      <b>${esc(inv.customerName)}</b><br>${esc(inv.customerAddress || '').replace(/\n/g, '<br>')}${inv.customerCountry !== s.country ? '<br>' + esc(DocLang.country(inv.customerCountry, lang)) : ''}
      ${inv.customerVatId ? `<br><span style="font-size:9pt">${esc(L.yourVat)}: ${esc(inv.customerVatId)}</span>` : ''}</div>
    <div class="meta"><h1>${esc(docName)}</h1><table>${meta}
      ${inv.customerNo ? `<tr><td>${esc(L.customerNo)}</td><td>${esc(inv.customerNo)}</td></tr>` : ''}</table></div>
    ${order ? `<p>${esc(L.orderIntro)}</p>` : ''}
    ${credit && inv.refNumber ? `<p>${esc(F('refersTo', { number: inv.refNumber }))}</p>` : ''}
    ${reminder ? `<p style="margin-top:8mm">${esc(F('reminderText', vals))}</p>` : ''}
    <table class="items"><thead><tr><th>${esc(L.desc)}</th><th class="r">${esc(L.qty)}</th><th>${esc(L.unit)}</th><th class="r">${esc(L.price)}</th>${hasDisc ? `<th class="r">${esc(L.discount)}</th>` : ''}<th class="r">${esc(L.amount)}</th></tr></thead><tbody>
      ${lines.map((l) => `<tr><td>${order && safeImg(l.image) ? `<img class="item-img" src="${safeImg(l.image)}" alt="">` : ''}${esc(l.text)}${l.vatFree && inv.vatScheme !== 'eu_rc' && inv.vatScheme !== 'export' ? ` <span style="font-size:8pt;color:#666">(${esc(L.vatFree)})</span>` : ''}</td>
        <td class="r">${nf.format(Number(l.qty) || 0)}</td><td>${esc(L.units[l.unit] ?? l.unit)}</td>
        <td class="r">${m(Calc.toCents(l.price))}</td>${hasDisc ? `<td class="r">${Number(l.discount) ? esc(String(l.discount).replace('.', ',')) + ' %' : ''}</td>` : ''}
        <td class="r">${m(Calc.sign(inv) * Calc.lineNet(l))}</td></tr>`).join('')}
    </tbody></table>
    <div class="sum"><div><span>${esc(L.net)}</span><span>${m(Calc.sign(inv) * t.net)}</span></div>
      ${t.vatLines.length ? t.vatLines.map((v) => `<div><span>${esc(L.vat)} ${v.rate} %</span><span>${m(Calc.sign(inv) * v.vat)}</span></div>`).join('') : `<div><span>${esc(L.vat)} 0 %</span><span>${m(0)}</span></div>`}
      <div class="grand"><span>${esc(L.total)} ${esc(inv.currency)}</span><span>${m(Calc.sign(inv) * t.gross)}</span></div>
      ${foreign && t.vat && inv.exchangeRate > 0 ? `<div style="font-size:8.5pt;color:#444"><span>${esc(F('vatInDKK', { rate: new Intl.NumberFormat(L.locale, { maximumFractionDigits: 4 }).format(inv.exchangeRate) }))}</span><span>${DocLang.money(Calc.sign(inv) * Calc.toDKK(t.vat, inv), 'DKK', lang)}</span></div>` : ''}</div>
    ${legal.length ? `<div class="legal">${legal.map((x) => `<div>${esc(x)}</div>`).join('')}</div>` : ''}
    ${inv.note ? `<div class="legal" style="white-space:pre-line">${esc(inv.note)}</div>` : ''}
    ${payBlock}${orderBottom}
    ${!credit && !reminder && !order ? `<p style="margin-top:6mm">${esc(L.thanks)}</p>` : ''}
    <div class="foot">${esc([s.company, [s.street, [s.zip, s.city].join(' ')].filter(Boolean).join(', '), `${L.ourVat} ${s.cvr}`, s.iban && !order ? `IBAN ${s.iban}` : ''].filter(Boolean).join(' · '))}${s.footer ? '<br>' + esc(s.footer) : ''}</div>
  </div>`;
  }

  // A4-Blatt auf schmalen Bildschirmen (Handy) auf die verfügbare Breite verkleinern; Drucken bleibt A4
  function fit(container) {
    for (const d of (container || document).querySelectorAll('.doc')) {
      d.style.zoom = '';
      const cs = getComputedStyle(d.parentElement);
      const avail = d.parentElement.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const k = avail / d.offsetWidth;
      if (k < 1) d.style.zoom = String(Math.max(0.3, k));
    }
  }
  if (typeof window !== 'undefined') window.addEventListener('resize', () => fit());

  root.DocRender = { render, safeImg, esc, fit };
})(typeof self !== 'undefined' ? self : this);
