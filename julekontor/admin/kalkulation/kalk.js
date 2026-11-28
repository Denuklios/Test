/* Julekontor – Preiskalkulation. Rechnet alles im Browser; der Server (api.php) speichert nur.
   Rechenweg pro Stück: Material + Arbeitszeit + Verpackung + Sonstiges = Selbstkosten
   → + Gewinnaufschlag → + Moms → + Kartengebühr → auf volle 5/10 kr. runden = Verkaufspreis. */
(function () {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const CSRF = document.querySelector('meta[name="csrf"]').content;
  let D = null;                 // alle Daten vom Server
  let clockOffset = 0;

  /* ---------- Zahlen ---------- */
  function num(v) {
    if (typeof v === "number") return isFinite(v) ? v : 0;
    if (v === undefined || v === null) return 0;
    let s = String(v).trim().replace(/\s/g, "");
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  const isEmpty = v => v === null || v === undefined || String(v).trim() === "";
  const nf = (d) => new Intl.NumberFormat("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
  const kr = v => nf(2).format(v) + " kr.";
  const krFine = v => { const a = Math.abs(v); return new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: a >= 1 || a === 0 ? 2 : a >= 0.01 ? 3 : 4 }).format(v) + " kr."; };
  const krRound = v => (Math.abs(v - Math.round(v)) < 0.005 ? nf(0).format(Math.round(v)) + ",–" : nf(2).format(v)) + " kr.";
  const eur = v => D && D.eur_rate ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v / D.eur_rate) : "";
  const amt = v => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(v);
  const minText = m => { m = Math.round(m); return m >= 60 ? Math.floor(m / 60) + " Std. " + (m % 60 ? (m % 60) + " Min." : "") : m + " Min."; };
  const inputVal = v => isEmpty(v) ? "" : String(v).replace(".", ",");

  /* ---------- Server ---------- */
  async function api(a, body, form) {
    const opt = body === undefined ? {} : { method: "POST", headers: { "X-CSRF": CSRF }, body: form ? body : JSON.stringify(body) };
    if (body !== undefined && !form) opt.headers["Content-Type"] = "application/json";
    const r = await fetch("api.php?a=" + a, opt);
    const j = await r.json().catch(() => ({ error: "Keine Verbindung zum Server." }));
    if (j.login) { location.href = "../?p=kalkulation"; throw new Error("login"); }
    if (!r.ok || j.error) { toast(j.error || "Fehler"); throw new Error(j.error); }
    return j;
  }
  let toastT;
  function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("on"), 3000); }
  function savedNote(t) { $("#saved").textContent = t; }

  /* ---------- Material ---------- */
  const TYPES = {
    area: { label: "Fläche", hint: "Papier, Stoff, Filz …" }, length: { label: "Länge", hint: "Band, Draht, Schnur …" },
    piece: { label: "Stück", hint: "Perlen, Kugeln, Zapfen …" }, weight: { label: "Gewicht", hint: "Wachs, Moos, Glitter …" },
    cast: { label: "Gießpulver", hint: "Keramikpulver, Gips, Raysin …" }, wear: { label: "Form & Werkzeug", hint: "Silikonform, Stanzer, Klingen …" },
    volume: { label: "Flüssig", hint: "Farbe, Kleber, Lack …" }
  };
  const LEN = { mm: 0.1, cm: 1, m: 100 }, WEIGHT = { g: 1, kg: 1000 }, VOL = { ml: 1, l: 1000 };
  const matById = id => D.materials.find(m => m.id === id);
  const rate = m => m.currency === "EUR" ? D.eur_rate : 1;
  function packTotal(m) {
    const p = m.pack || {};
    switch (m.type) {
      case "area": return num(p.length) * (LEN[p.lengthUnit] || 1) * num(p.width) * (LEN[p.widthUnit] || 1) * Math.max(1, num(p.count) || 1);
      case "length": return num(p.length) * (LEN[p.lengthUnit] || 1) * Math.max(1, num(p.count) || 1);
      case "piece": case "wear": return num(p.count);
      case "weight": case "cast": return num(p.amount) * (WEIGHT[p.unit] || 1);
      case "volume": return num(p.amount) * (VOL[p.unit] || 1);
    }
    return 0;
  }
  const unitPrice = m => { const t = packTotal(m); return t > 0 ? num(m.price) * rate(m) / t : 0; };     // Kronen pro Grundeinheit
  function powderShare(m) { const P = num((m.pack || {}).ratioP), W = num((m.pack || {}).ratioW); return P > 0 && W >= 0 ? P / (P + W) : 1; }
  function usedAmount(m, u) {
    u = u || {};
    const qty = Math.max(0, isEmpty(u.qty) ? 1 : num(u.qty));
    switch (m.type) {
      case "area": return num(u.a) * (LEN[u.aUnit] || 1) * num(u.b) * (LEN[u.bUnit] || 1) * qty;
      case "length": return num(u.a) * (LEN[u.aUnit] || 1) * qty;
      case "piece": return num(u.a);
      case "weight": return num(u.a) * (WEIGHT[u.aUnit] || 1);
      case "cast": return num(u.a) * (WEIGHT[u.aUnit] || 1) * (u.mode === "pulver" ? 1 : powderShare(m));
      case "wear": return isEmpty(u.a) ? 1 : num(u.a);
      case "volume": return num(u.a) * (VOL[u.aUnit] || 1);
    }
    return 0;
  }
  const lineCost = l => { const m = matById(l.material_id); return m ? unitPrice(m) * usedAmount(m, l.use) : 0; };
  function unitPriceText(m) {
    const up = unitPrice(m);
    if (!up) return "Preis und Packungsgröße fehlen";
    switch (m.type) {
      case "area": return krFine(up * 100) + " pro 10 × 10 cm · " + krFine(up * 10000) + " pro m²";
      case "length": return krFine(up * 100) + " pro Meter";
      case "piece": return krFine(up) + " pro Stück";
      case "weight": return krFine(up * 100) + " pro 100 g";
      case "cast": return krFine(up * 100) + " pro 100 g Pulver" + (powderShare(m) < 1 ? " · " + krFine(up * 100 * powderShare(m)) + " pro 100 g fertige Masse" : "");
      case "wear": return krFine(up) + " pro Benutzung";
      case "volume": return krFine(up * 100) + " pro 100 ml";
    }
    return "";
  }
  function packText(m) {
    const p = m.pack || {}, c = Math.max(1, num(p.count) || 1), pre = c > 1 ? c + " × " : "";
    switch (m.type) {
      case "area": return pre + amt(num(p.length)) + " " + (p.lengthUnit || "cm") + " × " + amt(num(p.width)) + " " + (p.widthUnit || "cm");
      case "length": return pre + amt(num(p.length)) + " " + (p.lengthUnit || "m");
      case "piece": return amt(num(p.count)) + " Stück";
      case "weight": case "volume": return amt(num(p.amount)) + " " + (p.unit || "");
      case "cast": return amt(num(p.amount)) + " " + (p.unit || "") + (num(p.ratioP) > 0 ? " · Pulver : Wasser = " + p.ratioP + " : " + (p.ratioW || 0) : "");
      case "wear": return "hält ca. " + amt(num(p.count)) + " Mal";
    }
    return "";
  }
  const priceText = m => m.currency === "EUR" ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(num(m.price)) + " ≈ " + kr(num(m.price) * D.eur_rate) : kr(num(m.price));

  /* ---------- Stundensatz und Preis ---------- */
  const S = () => D.settings;
  /* Steuern auf den Gewinn: erst AM-bidrag (8 %), vom Rest die Einkommensteuer */
  const amRate = () => Math.min(0.5, num(S().am) / 100);
  const taxRate = () => Math.min(0.8, num(S().tax) / 100);
  const totalTax = () => 1 - (1 - amRate()) * (1 - taxRate());
  function needWage() {
    const need = num(S().need), fixed = num(S().fixed), hours = num(S().hours);
    if (need <= 0 || hours <= 0) return 0;
    return (need / (1 - totalTax()) + fixed) / hours;
  }
  function monthTarget() { return num(S().need) > 0 ? num(S().need) / (1 - totalTax()) + num(S().fixed) : 0; }
  const fixedPerMinute = () => num(S().hours) > 0 ? num(S().fixed) / (num(S().hours) * 60) : 0;
  const deductOff = () => String(S().deduct_off || "").split(",").filter(Boolean);
  function baseWage() { const w = needWage(); return S().wage_mode === "bedarf" && w > 0 ? w : num(S().wage); }
  function roundPrice(v) {
    const r = num(S().round);
    if (r <= 0) return Math.round(v * 100) / 100;
    return S().round_mode === "near" ? Math.max(r, Math.round(v / r) * r) : Math.ceil(v / r - 1e-9) * r;
  }
  function calc(p, markupOverride) {
    const n = Math.max(1, num(p.batch) || 1);
    const wage = isEmpty(p.wage) ? baseWage() : num(p.wage);
    const materialAll = p.lines.reduce((s, l) => s + lineCost(l), 0);
    const material = materialAll / n, labor = num(p.minutes) / 60 * wage / n, extra = num(p.extra) / n, pack = num(p.packaging);
    const self = material + labor + extra + pack;
    const markupPct = markupOverride !== undefined ? markupOverride : isEmpty(p.markup) ? num(S().markup) : num(p.markup);
    const profitPlan = self * markupPct / 100;
    const net = self + profitPlan;
    const vatF = S().vat === "1" ? 1 + D.vat : 1;
    const fee = Math.min(0.5, num(S().fee) / 100);
    const gross = net * vatF;
    const withFee = net / Math.max(0.05, 1 / vatF - fee);      // so bleibt nach Moms und Kartengebühr genau „net“
    const rounded = roundPrice(withFee);
    const own = markupOverride === undefined && !isEmpty(p.own_price) && num(p.own_price) > 0;
    const final = own ? num(p.own_price) : rounded;
    const revenue = final / vatF - final * fee;               // bleibt nach Moms und Kartengebühr
    const profit = revenue - self;
    const minutesPiece = num(p.minutes) / n;
    const hourly = minutesPiece > 0 ? (profit + labor) / (minutesPiece / 60) : null;
    const vat = withFee - withFee / vatF;
    return { n, wage, material, materialAll, labor, extra, pack, self, markupPct, profitPlan, net, vat, vatF, fee, feeAmt: withFee * fee, gross, withFee, rounded, own, final,
             revenue, profit, margin: revenue > 0 ? profit / revenue * 100 : 0, hourly, minutesPiece, cost: material + extra + pack };
  }

  /* ---------- Router ---------- */
  function route() {
    const h = location.hash.replace(/^#\/?/, "");
    const [a, b] = h.split("/");
    $$(".tabs a").forEach(x => x.classList.toggle("on", x.dataset.tab === (a === "material" || a === "lager" ? "material" : a === "einstellungen" ? "einstellungen" : "projekte")));
    if (!D) return;
    if (a === "projekt" && b) return renderProject(+b);
    if (a === "material" || a === "lager") return renderMaterials();
    if (a === "einstellungen") return renderSettings();
    renderOverview();
  }
  window.addEventListener("hashchange", route);
  const view = () => $("#view");

  /* ---------- Übersicht ---------- */
  let filter = "alle", search = "";
  function renderOverview() {
    const cats = D.categories;
    const ps = D.projects.filter(p => (filter === "alle" || p.status === filter) && (!search || p.name.toLowerCase().includes(search.toLowerCase())));
    const groups = [...cats.map(c => ({ c, list: ps.filter(p => p.category_id === c.id) })), { c: { id: 0, name: "Ohne Kategorie" }, list: ps.filter(p => !cats.some(c => c.id === p.category_id)) }];
    const card = p => {
      const c = calc(p);
      return `<button class="pcard" data-open="${p.id}"><div class="ph" style="${p.image ? `background-image:url('${esc(p.image)}')` : ""}">${p.image ? "" : "Noch kein Foto"}</div>
        <div class="body"><h3>${esc(p.name)}</h3>
          <div>${p.status === "fertig" ? '<span class="badge green">Fertig</span>' : '<span class="badge">In Arbeit</span>'} ${p.product ? '<span class="badge green">in der Kasse</span>' : ""} ${c.profit < 0 ? '<span class="badge red">Verlust</span>' : ""}</div>
          <div class="price">${krRound(c.final)}</div>
          <div class="meta">Selbstkosten ${kr(c.self)} · ${c.minutesPiece ? minText(c.minutesPiece) + " pro Stück" : "keine Zeit eingetragen"}</div>
          <div class="meta">Gewinn ${kr(c.profit)} pro Stück${c.hourly !== null ? " · " + kr(c.hourly) + " pro Stunde" : ""}</div></div></button>`;
    };
    view().innerHTML = `
      <div class="toolbar">
        <input class="in" id="q" type="search" placeholder="Projekt suchen …" value="${esc(search)}">
        <div class="chips">${[["alle", "Alle"], ["arbeit", "In Arbeit"], ["fertig", "Fertig"]].map(([k, l]) => `<button class="chip ${filter === k ? "on" : ""}" data-f="${k}">${l} (${D.projects.filter(p => k === "alle" || p.status === k).length})</button>`).join("")}</div>
        <div class="grow"><button class="btn ghost" id="newcat">+ Kategorie</button><button class="btn big" id="newp">+ Neues Projekt</button></div>
      </div>
      ${!D.projects.length ? `<div class="empty">Noch keine Projekte.<br><br>Lege zuerst unter <a href="#/lager">Einkauf &amp; Lager</a> deine Materialien an, dann hier ein Projekt.<br><br>
        Du hast schon Daten in der alten Bastelwerkstatt? Unter <a href="#/einstellungen">Einstellungen</a> kannst du die Sicherung übernehmen.</div>` : ""}
      ${groups.filter(g => g.list.length || (g.c.id && filter === "alle" && !search)).map(g => `
        <div class="cat-head"><h2>${esc(g.c.name)}</h2>${g.c.id ? `<button class="btn small ghost" data-newin="${g.c.id}">+ Projekt hier</button><button class="btn small ghost" data-rencat="${g.c.id}">Umbenennen</button><button class="btn small ghost" data-delcat="${g.c.id}">Löschen</button>` : ""}</div>
        ${g.list.length ? `<div class="cards">${g.list.map(card).join("")}</div>` : '<div class="empty">Noch keine Projekte in dieser Kategorie.</div>'}`).join("")}`;
    $("#q").addEventListener("input", e => { search = e.target.value; const pos = e.target.selectionStart; renderOverview(); const q = $("#q"); q.focus(); q.setSelectionRange(pos, pos); });
    view().onclick = async e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.f) { filter = b.dataset.f; renderOverview(); }
      if (b.dataset.open) location.hash = "#/projekt/" + b.dataset.open;
      if (b.id === "newp" || b.dataset.newin) newProject(b.dataset.newin ? +b.dataset.newin : null);
      if (b.id === "newcat") { const n = await ask("Neue Kategorie", "Name, z. B. „Türkränze“ oder „Gravierte Bretter“"); if (n) { const r = await api("category", { name: n }); D.categories.push(r.category); renderOverview(); } }
      if (b.dataset.rencat) { const c = D.categories.find(x => x.id === +b.dataset.rencat); const n = await ask("Kategorie umbenennen", "Neuer Name", c.name); if (n) { await api("category", { id: c.id, name: n }); c.name = n; renderOverview(); } }
      if (b.dataset.delcat) { const c = D.categories.find(x => x.id === +b.dataset.delcat); if (await confirmBox("Kategorie „" + c.name + "“ löschen?", "Die Projekte bleiben erhalten und stehen dann unter „Ohne Kategorie“.")) { await api("category", { id: c.id, delete: 1 }); D.categories = D.categories.filter(x => x !== c); D.projects.forEach(p => { if (p.category_id === c.id) p.category_id = null; }); renderOverview(); } }
    };
  }
  async function newProject(catId) {
    const n = await ask("Neues Projekt", "Wie heißt das Stück? Zum Beispiel „Adventskranz rustikal, 30 cm“");
    if (!n) return;
    const r = await api("project", { name: n, category_id: catId || (D.categories[0] ? D.categories[0].id : null), batch: 1, lines: [] });
    D.projects.unshift(r.project);
    location.hash = "#/projekt/" + r.project.id;
  }

  /* Vorlagen für typische Bastelmaterialien (aus der Bastelwerkstatt übernommen) */
  const PRESETS = [
    ['Papier & Karton', [
      ['Bastelpapier, Rolle', 'area', { lengthUnit: 'm', widthUnit: 'cm', count: 1 }],
      ['Tonkarton, Bogen 50 × 70 cm', 'area', { length: 70, lengthUnit: 'cm', width: 50, widthUnit: 'cm', count: 10 }],
      ['Fotokarton A4', 'area', { length: 29.7, lengthUnit: 'cm', width: 21, widthUnit: 'cm', count: 50 }],
      ['Transparentpapier, Bogen', 'area', { lengthUnit: 'cm', widthUnit: 'cm', count: 10 }],
      ['Seidenpapier, Bogen', 'area', { length: 75, lengthUnit: 'cm', width: 50, widthUnit: 'cm', count: 20 }],
      ['Krepppapier, Rolle', 'area', { length: 2.5, lengthUnit: 'm', width: 50, widthUnit: 'cm', count: 1 }],
      ['Wellpappe, Rolle', 'area', { lengthUnit: 'm', widthUnit: 'cm', count: 1 }],
      ['Geschenkpapier, Rolle', 'area', { lengthUnit: 'm', widthUnit: 'cm', count: 1 }],
    ]],
    ['Stoff, Filz & Wolle', [
      ['Bastelfilz, Platte 20 × 30 cm', 'area', { length: 30, lengthUnit: 'cm', width: 20, widthUnit: 'cm', count: 10 }],
      ['Filz, Meterware', 'area', { length: 1, lengthUnit: 'm', width: 90, widthUnit: 'cm', count: 1 }],
      ['Baumwollstoff, Meterware 140 cm breit', 'area', { length: 1, lengthUnit: 'm', width: 140, widthUnit: 'cm', count: 1 }],
      ['Jutestoff, Meterware', 'area', { length: 1, lengthUnit: 'm', width: 100, widthUnit: 'cm', count: 1 }],
      ['Wolle / Garn (Knäuel)', 'length', { lengthUnit: 'm', count: 1 }],
      ['Füllwatte', 'weight', { unit: 'g' }],
    ]],
    ['Bänder, Draht & Schnur', [
      ['Satinband, Rolle', 'length', { lengthUnit: 'm', count: 1 }],
      ['Juteband, Rolle', 'length', { lengthUnit: 'm', count: 1 }],
      ['Samtband, Rolle', 'length', { lengthUnit: 'm', count: 1 }],
      ['Kordel / Baumwollschnur', 'length', { lengthUnit: 'm', count: 1 }],
      ['Bindedraht, Spule', 'length', { lengthUnit: 'm', count: 1 }],
      ['Myrtendraht (Silber/Gold)', 'length', { lengthUnit: 'm', count: 1 }],
      ['Aludraht', 'length', { lengthUnit: 'm', count: 1 }],
      ['Basteldraht in Stäben', 'piece', {}],
    ]],
    ['Gießen & Modellieren', [
      ['Keramik-Gießpulver', 'cast', { unit: 'kg' }],
      ['Raysin', 'cast', { unit: 'kg' }],
      ['Modellgips', 'cast', { unit: 'kg' }],
      ['Kreativbeton', 'cast', { unit: 'kg' }],
      ['Gießharz (Epoxid) A + B', 'volume', { unit: 'ml' }],
      ['Silikonform', 'wear', {}],
      ['Silikon zum Formenbau', 'weight', { unit: 'g' }],
      ['Trennmittel', 'volume', { unit: 'ml' }],
      ['Modelliermasse / Ton', 'weight', { unit: 'g' }],
      ['Pigment / Farbpulver', 'weight', { unit: 'g' }],
    ]],
    ['Farben & Veredeln', [
      ['Acrylfarbe', 'volume', { unit: 'ml' }],
      ['Sprühlack / Sprühfarbe', 'volume', { unit: 'ml' }],
      ['Klarlack / Versiegelung', 'volume', { unit: 'ml' }],
      ['Kreidefarbe', 'volume', { unit: 'ml' }],
      ['Glitter', 'weight', { unit: 'g' }],
      ['Blattgold / Blattmetall', 'piece', {}],
      ['Serviettenkleber (Decoupage)', 'volume', { unit: 'ml' }],
    ]],
    ['Kleben', [
      ['Heißklebesticks', 'piece', {}],
      ['Bastelkleber / Holzleim', 'volume', { unit: 'ml' }],
      ['Doppelseitiges Klebeband', 'length', { lengthUnit: 'm', count: 1 }],
      ['Klebepunkte', 'piece', {}],
    ]],
    ['Kerzen & Seife', [
      ['Kerzenwachs / Paraffin', 'weight', { unit: 'kg' }],
      ['Sojawachs', 'weight', { unit: 'kg' }],
      ['Docht, Rolle', 'length', { lengthUnit: 'm', count: 1 }],
      ['Docht mit Plättchen', 'piece', {}],
      ['Duftöl', 'volume', { unit: 'ml' }],
      ['Wachsfarbe', 'weight', { unit: 'g' }],
      ['Seifengießmasse', 'weight', { unit: 'kg' }],
    ]],
    ['Floristik & Natur', [
      ['Kranzrohling (Stroh/Styropor)', 'piece', {}],
      ['Tannengrün, Bund', 'piece', {}],
      ['Moos', 'weight', { unit: 'g' }],
      ['Steckmasse / Steckschaum', 'piece', {}],
      ['Zapfen', 'piece', {}],
      ['Zimtstangen', 'piece', {}],
      ['Getrocknete Orangenscheiben', 'piece', {}],
      ['Holzscheiben', 'piece', {}],
      ['Drahtkranz / Steckdraht', 'piece', {}],
    ]],
    ['Deko-Teile', [
      ['Glaskugeln', 'piece', {}],
      ['Holzperlen', 'piece', {}],
      ['Glöckchen', 'piece', {}],
      ['Pompons', 'piece', {}],
      ['Holzsterne / Streuteile', 'piece', {}],
      ['LED-Lichterkette mit Batterie', 'piece', {}],
      ['Batterien', 'piece', {}],
      ['Aufhänger / Ösen', 'piece', {}],
    ]],
    ['Verpackung & Verkauf', [
      ['Geschenktüten / Cellophantüten', 'piece', {}],
      ['Etiketten / Preisschilder', 'piece', {}],
      ['Geschenkkarton', 'piece', {}],
      ['Packseide', 'area', { lengthUnit: 'cm', widthUnit: 'cm', count: 1 }],
    ]],
    ['Werkzeug (Verschleiß)', [
      ['Motivstanzer', 'wear', {}],
      ['Cutterklingen', 'wear', {}],
      ['Pinsel', 'wear', {}],
      ['Brennofen: Strom pro Brand', 'wear', { count: 1 }],
    ]],
  ];

  /* ---------- Projekt ---------- */
  let cur = null, saveT = null;
  function scheduleSave() { savedNote("Wird gespeichert …"); clearTimeout(saveT); saveT = setTimeout(saveNow, 700); }
  async function saveNow() {
    clearTimeout(saveT); saveT = null;
    if (!cur) return;
    const p = cur;
    try {
      const r = await api("project", { id: p.id, name: p.name, category_id: p.category_id, notes: p.notes, status: p.status, batch: p.batch, minutes: p.minutes,
        wage: isEmpty(p.wage) ? null : num(p.wage), markup: isEmpty(p.markup) ? null : num(p.markup), packaging: num(p.packaging), extra: num(p.extra),
        own_price: isEmpty(p.own_price) ? null : num(p.own_price), lines: p.lines.map(l => ({ material_id: l.material_id, use: l.use })) });
      p.product = r.project.product; p.updated = r.project.updated;
      savedNote("✓ Gespeichert");
    } catch (e) { savedNote("Nicht gespeichert"); }
  }
  window.addEventListener("beforeunload", e => { if (saveT) { saveNow(); e.preventDefault(); } });

  function useInputs(l, i) {
    const m = matById(l.material_id), u = l.use || (l.use = {});
    const n = (k, ph, w) => `<input inputmode="decimal" data-line="${i}" data-u="${k}" value="${esc(inputVal(u[k]))}" placeholder="${ph}"${w ? ` style="width:${w}px"` : ""}>`;
    const sel = (k, opts, def) => `<select data-line="${i}" data-u="${k}">${opts.map(o => `<option${(u[k] || def) === o ? " selected" : ""}>${o}</option>`).join("")}</select>`;
    switch (m.type) {
      case "area": return `Stück von ${n("a", "Länge")} ${sel("aUnit", ["cm", "mm", "m"], "cm")} × ${n("b", "Breite")} ${sel("bUnit", ["cm", "mm", "m"], "cm")}, davon ${n("qty", "1", 90)} Stück`;
      case "length": return `Länge ${n("a", "Länge")} ${sel("aUnit", ["cm", "m", "mm"], "cm")}, davon ${n("qty", "1", 90)} Stück`;
      case "piece": return `Verbraucht: ${n("a", "Anzahl")} Stück`;
      case "weight": return `Verbraucht: ${n("a", "Menge")} ${sel("aUnit", ["g", "kg"], "g")}`;
      case "cast": return `Verbraucht: ${n("a", "Menge")} ${sel("aUnit", ["g", "kg"], "g")} <select data-line="${i}" data-u="mode"><option value="fertig"${u.mode !== "pulver" ? " selected" : ""}>fertige Gießmasse</option><option value="pulver"${u.mode === "pulver" ? " selected" : ""}>nur Pulver</option></select>`;
      case "wear": return `Benutzt: ${n("a", "1")} mal`;
      case "volume": return `Verbraucht: ${n("a", "Menge")} ${sel("aUnit", ["ml", "l"], "ml")}`;
    }
    return "";
  }

  function renderProject(id) {
    const p = D.projects.find(x => x.id === id);
    if (!p) { location.hash = "#/"; return; }
    if (cur && cur !== p && saveT) saveNow();
    cur = p;
    const wagePh = nf(2).format(baseWage());
    view().innerHTML = `
      <div class="crumb"><a href="#/">← Alle Projekte</a>
        <div class="grow">
          <div class="seg" role="group" aria-label="Stand"><button data-status="arbeit" class="${p.status !== "fertig" ? "on" : ""}">In Arbeit</button><button data-status="fertig" class="${p.status === "fertig" ? "on" : ""}">Fertig</button></div>
          <button class="btn ghost" id="copy">Kopieren</button><button class="btn ghost" id="del">Löschen</button>
        </div></div>
      <div class="project">
        <div>
          <section class="card">
            <div class="project-head">
              <label class="photo" style="${p.image ? `background-image:url('${esc(p.image)}')` : ""}"><input type="file" id="photo" accept="image/*" hidden><span>${p.image ? "Foto ändern" : "📷 Foto hinzufügen"}</span></label>
              <div style="display:grid;gap:16px">
                <label class="field"><span>Name des Stücks</span><input class="name-in" data-k="name" value="${esc(p.name)}" maxlength="120"></label>
                <div class="grid2">
                  <label class="field"><span>Kategorie</span><select data-k="category_id"><option value="">– ohne –</option>${D.categories.map(c => `<option value="${c.id}"${c.id === p.category_id ? " selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
                  <label class="field"><span>Notiz (Maße, Farben, Besonderheiten)</span><input data-k="notes" value="${esc(p.notes)}" maxlength="4000"></label>
                </div>
              </div>
            </div>
          </section>

          <section class="card">
            <h2>Wie viele Stück auf einmal?</h2>
            <p class="lead">Wenn du mehrere gleichzeitig machst (z. B. 10 Sterne auf einmal), trag hier die Anzahl ein. Material und Arbeitszeit unten gelten dann für alle zusammen – der Preis wird pro Stück gerechnet.</p>
            <div class="batch">Material und Zeit unten gelten für <input class="in" inputmode="numeric" data-k="batch" value="${esc(p.batch)}"> Stück</div>
          </section>

          <section class="card">
            <h2>Material</h2>
            <p class="lead">Nur den Verbrauch eintragen – der Preis kommt aus dem Materiallager.</p>
            <div class="lines" id="lines"></div>
            <button class="btn ghost big" id="addmat">+ Material hinzufügen</button>
            <div class="lines-total"><span>Material gesamt <span class="muted" id="mat-per"></span></span><b id="mat-total"></b></div>
          </section>

          <section class="card">
            <h2>Arbeitszeit</h2>
            <p class="lead">Wie lange brauchst du für ${p.batch > 1 ? "alle " + esc(p.batch) + " Stück zusammen" : "ein Stück"}? Am besten mit der Stoppuhr messen.</p>
            <div class="grid2">
              <label class="field"><span>Arbeitszeit</span><div class="unit" data-u="Min."><input inputmode="decimal" data-k="minutes" value="${esc(inputVal(p.minutes))}"></div></label>
              <label class="field"><span>Stundensatz für dieses Stück (leer = ${wagePh} kr.)</span><div class="unit" data-u="kr./Std."><input inputmode="decimal" data-k="wage" value="${esc(inputVal(p.wage))}" placeholder="${wagePh}"></div></label>
            </div>
            <div class="watch" id="watch"></div>
          </section>

          <section class="card">
            <h2>Verpackung &amp; Sonstiges</h2>
            <div class="grid2">
              <label class="field"><span>Verpackung pro Stück (Tüte, Karton, Schleife, Etikett)</span><div class="unit" data-u="kr."><input inputmode="decimal" data-k="packaging" value="${esc(inputVal(p.packaging || ""))}" placeholder="0"></div></label>
              <label class="field"><span>Sonstiges für ${p.batch > 1 ? "alle " + esc(p.batch) + " Stück" : "das Stück"} (Strom, Versand des Materials …)</span><div class="unit" data-u="kr."><input inputmode="decimal" data-k="extra" value="${esc(inputVal(p.extra || ""))}" placeholder="0"></div></label>
            </div>
          </section>

          <section class="card">
            <h2>Nachbauen</h2>
            <p class="lead">Wie viele willst du (wieder) machen? Hier steht, was du bereitlegen musst. ${p.built ? `<strong>Schon ${p.built}× gebaut.</strong>` : ""}</p>
            <div class="batch"><input class="in" inputmode="numeric" id="rb-n" value="${esc(rebuildN[p.id] || 10)}"> Stück <button class="btn ghost" id="rb-done">Als gebaut eintragen</button></div>
            <div id="rebuild"></div>
          </section>
        </div>
        <aside class="ticket" id="ticket"></aside>
      </div>`;
    renderLines(); renderWatch(); renderTicket(); renderRebuild();

    const root = view();
    root.oninput = e => {
      const t = e.target;
      if (t.dataset.k) {
        const k = t.dataset.k;
        p[k] = k === "category_id" ? (t.value ? +t.value : null) : k === "batch" ? Math.max(1, Math.round(num(t.value)) || 1) : t.value;
        if (k === "name") savedNote("");
        scheduleSave(); live();
      }
      if (t.dataset.line !== undefined) {
        const l = p.lines[+t.dataset.line]; (l.use || (l.use = {}))[t.dataset.u] = t.value;
        scheduleSave(); live();
      }
      if (t.id === "rb-n") { rebuildN[p.id] = Math.max(1, Math.round(num(t.value)) || 1); renderRebuild(); }
      if (t.id === "mk-range") { p.markup = t.value; p.own_price = ""; scheduleSave(); live(true); }
      if (t.id === "own") { p.own_price = t.value; scheduleSave(); live(true); }
    };
    root.onchange = e => { if (e.target.tagName === "SELECT") root.oninput(e); if (e.target.id === "photo") uploadPhoto(e.target); };
    root.onclick = async e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.status) { p.status = b.dataset.status; $$("[data-status]").forEach(x => x.classList.toggle("on", x === b)); scheduleSave(); }
      if (b.id === "addmat") pickMaterial(m => { p.lines.push({ material_id: m.id, use: {} }); renderLines(); scheduleSave(); live(); const first = $("#lines .line:last-child input"); if (first) first.focus(); });
      if (b.dataset.delline !== undefined) { p.lines.splice(+b.dataset.delline, 1); renderLines(); scheduleSave(); live(); }
      if (b.id === "copy") { await saveNow(); const r = await api("copy", { id: p.id }); D.projects.unshift(r.project); toast("Kopie angelegt"); location.hash = "#/projekt/" + r.project.id; }
      if (b.id === "del") { if (await confirmBox("„" + p.name + "“ löschen?", "Das Projekt wird mit Foto gelöscht. Ein Artikel in der Kasse bleibt erhalten.")) { clearTimeout(saveT); saveT = null; await api("project", { id: p.id, delete: 1 }); D.projects = D.projects.filter(x => x !== p); cur = null; location.hash = "#/"; } }
      if (b.dataset.timer) timer(p, b.dataset.timer);
      if (b.id === "own-clear") { p.own_price = ""; scheduleSave(); renderTicket(true); }
      if (b.id === "toprod") toProduct(p);
      if (b.id === "rb-done") builtDialog(p, rebuildN[p.id] || 10);
    };
  }
  const rebuildN = {};
  /* „Als gebaut eintragen“: Zähler hoch, verbrauchtes Material vom Lager ab, fertige Stücke in die Kasse */
  function builtDialog(p, n) {
    const batch = Math.max(1, num(p.batch) || 1);
    const use = p.lines.map(l => { const m = matById(l.material_id); if (!m) return null; const t = packTotal(m); return t > 0 ? { m, packs: usedAmount(m, l.use) / batch * n / t } : null; }).filter(x => x && x.packs > 0);
    const s = openModal(`<h2>${n} × „${esc(p.name)}“ als gebaut eintragen?</h2>
      <p class="muted">Der Zähler „schon gebaut“ steigt um ${n}.</p>
      ${use.length ? `<label class="check big"><input type="checkbox" id="bd-mat" checked> <span><b>Verbrauchtes Material vom Lager abziehen</b></span></label>
        <ul class="bd-list">${use.map(x => `<li>${esc(x.m.name)}: <b>− ${esc(amt(Math.round(x.packs * 1000) / 1000))} ${esc(x.m.unit || "Packung")}</b> <small class="muted">(jetzt ${esc(stockText(x.m))}${x.m.stock - x.packs < 0 ? ' – <span style="color:var(--err)">reicht nicht!</span>' : ""})</small></li>`).join("")}</ul>` : '<p class="hint">Im Projekt ist kein Material mit Packungsgröße eingetragen – es wird nichts abgezogen.</p>'}
      ${p.product ? `<label class="check big"><input type="checkbox" id="bd-stock" checked> <span><b>${n} Stück in den Bestand von „${esc(p.product.name)}“</b><small>damit sie in Kasse und Shop verkaufbar sind</small></span></label>` : ""}
      <div class="row"><button class="btn ghost" data-x="no">Abbrechen</button><button class="btn big" data-x="ok">Eintragen</button></div>`);
    s.addEventListener("click", async e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.x === "no") return closeModal();
      if (b.dataset.x !== "ok") return;
      const withMat = !!($("#bd-mat", s) || {}).checked, toStock = !!($("#bd-stock", s) || {}).checked;
      b.disabled = true;
      const r = await api("built", { id: p.id, n, to_stock: toStock, use: withMat ? use.map(x => ({ id: x.m.id, packs: x.packs })) : [] });
      p.built = r.project.built;
      if (withMat) use.forEach(x => { x.m.stock = Math.round((x.m.stock - x.packs) * 10000) / 10000; });
      closeModal(); toast(n + " Stück eingetragen" + (withMat ? " – Material abgezogen" : "")); renderProject(p.id);
    });
  }
  function live(keepTicketInputs) {
    const p = cur; if (!p) return;
    $$("#lines .line").forEach((row, i) => { const c = row.querySelector(".cost"); if (c && p.lines[i]) c.textContent = krFine(lineCost(p.lines[i])); });
    const c = calc(p);
    $("#mat-total").textContent = kr(c.materialAll);
    $("#mat-per").textContent = c.n > 1 ? "(" + kr(c.material) + " pro Stück)" : "";
    renderTicket(keepTicketInputs); renderRebuild();
  }
  function renderLines() {
    const p = cur, box = $("#lines");
    box.innerHTML = p.lines.length ? p.lines.map((l, i) => {
      const m = matById(l.material_id);
      return m ? `<div class="line"><div><div class="mname">${esc(m.name)}</div><div class="msub">${esc(unitPriceText(m))}</div></div>
        <div class="use">${useInputs(l, i)}</div><div class="cost">${krFine(lineCost(l))}</div>
        <button class="x" data-delline="${i}" aria-label="${esc(m.name)} entfernen" title="Entfernen">×</button></div>` : "";
    }).join("") : '<div class="empty">Noch kein Material. Tippe auf „Material hinzufügen“.</div>';
    const c = calc(p);
    $("#mat-total").textContent = kr(c.materialAll);
    $("#mat-per").textContent = c.n > 1 ? "(" + kr(c.material) + " pro Stück)" : "";
  }

  /* Der große Preiszettel – in festen Blöcken, damit Schieberegler und Eingabefeld beim Tippen nicht neu gebaut werden */
  function renderTicket(keepInputs) {
    const p = cur, c = calc(p), el = $("#ticket"); if (!el) return;
    const markupVal = isEmpty(p.markup) ? num(S().markup) : num(p.markup);
    const scen = [...new Set([0, 15, 30, 50, 75, 100, Math.round(markupVal)])].sort((a, b) => a - b).map(m => ({ m, c: calc(p, m) }));
    const target = monthTarget(), perPiece = c.profit + c.labor;
    const pieces = target > 0 && perPiece > 0 ? Math.ceil(target / perPiece) : 0;
    const top = `<h2>Preiszettel <span class="muted" style="font-size:1rem">pro Stück</span></h2>
      <dl class="rows">
        <dt>Material</dt><dd>${kr(c.material)}</dd>
        <dt>Arbeitszeit <span class="sub">${c.minutesPiece ? minText(c.minutesPiece) + " × " + nf(0).format(c.wage) + " kr./Std." : "noch keine Zeit"}</span></dt><dd>${kr(c.labor)}</dd>
        ${c.pack ? `<dt>Verpackung</dt><dd>${kr(c.pack)}</dd>` : ""}${c.extra ? `<dt>Sonstiges</dt><dd>${kr(c.extra)}</dd>` : ""}
        <dt class="sum">Selbstkosten</dt><dd class="sum">${kr(c.self)}</dd>
      </dl>`;
    const mid = `<dl class="rows">
        <dt>+ Gewinn</dt><dd>${kr(c.profitPlan)}</dd>
        ${S().vat === "1" ? `<dt>+ Moms ${nf(0).format(D.vat * 100)} %</dt><dd>${kr(c.vat)}</dd>` : ""}
        ${c.fee > 0 ? `<dt>+ Kartengebühr ${nf(2).format(c.fee * 100)} %</dt><dd>${kr(c.feeAmt)}</dd>` : ""}
        <dt class="sum">Errechnet</dt><dd class="sum">${kr(c.withFee)}</dd>
      </dl>
      <div class="final">
        <small>${c.own ? "Dein eigener Verkaufspreis" : "Verkaufspreis" + (num(S().round) > 0 ? " · gerundet auf " + (S().round === "1" ? "volle Krone" : S().round + " kr.") : "")}</small>
        <div class="big">${krRound(c.final)}</div>
        <div class="eur">ca. ${eur(c.final)}</div>
      </div>`;
    const bot = `<div class="result">
        <div class="${c.profit < 0 ? "neg" : "pos"}"><b>${kr(c.profit)}</b><span>Gewinn pro Stück</span></div>
        <div class="${c.margin < 0 ? "neg" : "pos"}"><b>${nf(0).format(c.margin)} %</b><span>Marge</span></div>
        <div class="${c.hourly !== null && c.hourly < c.wage ? "neg" : "pos"}"><b>${c.hourly === null ? "–" : nf(0).format(c.hourly) + " kr."}</b><span>verdienst du pro Stunde</span></div>
      </div>
      ${c.profit < 0 ? `<p class="note bad">Bei diesem Preis machst du ${kr(-c.profit)} Verlust pro Stück.</p>` : c.hourly !== null && c.hourly < c.wage ? `<p class="note">Bei diesem Preis verdienst du weniger als deinen Stundensatz von ${nf(0).format(c.wage)} kr.</p>` : ""}
      ${keepBlock(p, c)}
      ${pieces ? `<div class="month">Für deinen Monatsbedarf müsstest du <b>${pieces} Stück</b> davon im Monat verkaufen${c.minutesPiece ? " – das sind " + minText(pieces * c.minutesPiece) + " Arbeit" : ""}.</div>` : ""}
      <h3 style="font-size:1.15rem;margin:8px 0 4px">Was wäre wenn … <span class="muted" style="font-size:.9rem;font-family:var(--f-body)">(Zeile antippen = übernehmen)</span></h3>
      <table class="scen"><thead><tr><th>Aufschlag</th><th>Preis</th><th>Gewinn</th><th>pro Std.</th></tr></thead><tbody>
        ${scen.map(s => `<tr class="${!c.own && Math.round(markupVal) === s.m ? "cur" : ""}" data-mkrow="${s.m}"><td>${s.m} %</td><td>${krRound(s.c.final)}</td><td>${kr(s.c.profit)}</td><td>${s.c.hourly === null ? "–" : nf(0).format(s.c.hourly) + " kr."}</td></tr>`).join("")}
      </tbody></table>
      <button class="btn green big" id="toprod" style="width:100%">${p.product ? "Preis in der Kasse aktualisieren" : "Als Artikel in Kasse &amp; Shop anlegen"}</button>
      <p class="linked">${p.product ? `Verknüpft mit „${esc(p.product.name)}“ – dort zurzeit ${krRound(p.product.price / 100)}${Math.round(p.product.price) !== Math.round(c.final * 100) ? " <strong>(weicht ab)</strong>" : ""}` : "Legt einen Artikel mit diesem Preis an. Ob er im Online-Shop erscheint, stellst du beim Artikel ein."}</p>`;
    if (!keepInputs || !$("#tk-top", el)) {
      el.innerHTML = `<div id="tk-top">${top}</div>
        <div class="markup"><div class="lbl"><span>Gewinnaufschlag</span><b id="mk-lbl"></b></div>
          <input type="range" id="mk-range" min="0" max="150" step="5" aria-label="Gewinnaufschlag in Prozent"></div>
        <div id="tk-mid">${mid}</div>
        <label class="field own"><span>Eigener Preis (optional) – z. B. was du im Laden verlangen willst</span>
          <div style="display:flex;gap:10px"><div class="unit" data-u="kr." style="flex:1"><input inputmode="decimal" id="own" value="${esc(inputVal(p.own_price))}"></div><button class="btn ghost small" id="own-clear" type="button">Zurück zum errechneten</button></div></label>
        <div id="tk-bot">${bot}</div>`;
    } else {
      $("#tk-top", el).innerHTML = top; $("#tk-mid", el).innerHTML = mid; $("#tk-bot", el).innerHTML = bot;
    }
    $("#mk-lbl", el).textContent = nf(0).format(markupVal) + " %";
    const rg = $("#mk-range", el); if (document.activeElement !== rg) rg.value = markupVal;
    const own = $("#own", el); own.placeholder = nf(0).format(c.rounded); if (document.activeElement !== own) own.value = inputVal(p.own_price);
    $("#own-clear", el).hidden = !c.own;
    el.onclick = e => { const tr = e.target.closest("tr[data-mkrow]"); if (tr) { cur.markup = tr.dataset.mkrow; cur.own_price = ""; scheduleSave(); renderTicket(); } };
    el.onchange = e => {
      const k = e.target.dataset && e.target.dataset.ded; if (!k) return;
      const off = new Set(deductOff()); if (e.target.checked) off.delete(k); else off.add(k);
      S().deduct_off = [...off].join(","); renderTicket(true);
      api("settings", S()).then(() => savedNote("✓ Gespeichert")).catch(() => {});
    };
  }

  /* Was bleibt nach allen Abzügen? Jeder Abzug hat einen Haken; die Auswahl gilt für alle Projekte. */
  function keepBlock(p, c) {
    const off = deductOff(), on = k => !off.includes(k);
    const P = c.final, fixedShare = fixedPerMinute() * c.minutesPiece;
    const items = [
      ["moms", "Moms an Skattestyrelsen", S().vat === "1" ? P - P / c.vatF : 0, S().vat === "1" ? nf(0).format(D.vat * 100) + " % im Preis enthalten" : "nicht eingerechnet (Einstellung „Moms“)"],
      ["fee", "Kartengebühr", P * c.fee, c.fee > 0 ? nf(2).format(c.fee * 100) + " % vom Preis" : "0 % eingetragen – unter Einstellungen änderbar"],
      ["material", "Material", c.material, ""],
      ["pack", "Verpackung", c.pack, ""],
      ["extra", "Sonstiges", c.extra, ""],
      ["fixed", "Anteil feste Kosten", fixedShare, num(S().fixed) > 0 ? "Miete, Strom … verteilt auf deine Bastelstunden" : "keine festen Kosten eingetragen"],
    ];
    let rest = P, rows = "";
    for (const [k, label, amt, sub] of items) {
      const use = on(k) && amt > 0;
      if (use) rest -= amt;
      rows += `<label class="ded${use ? "" : " off"}"><input type="checkbox" data-ded="${k}"${on(k) ? " checked" : ""}><span>${label}${sub ? `<small>${esc(sub)}</small>` : ""}</span><b>${amt > 0 ? "− " + kr(amt) : "–"}</b></label>`;
    }
    const beforeTax = rest;
    rows += `<div class="ded sum"><span>Vor Steuern <small>dein Arbeitslohn + Gewinn</small></span><b>${kr(beforeTax)}</b></div>`;
    const base = Math.max(0, beforeTax);
    const am = on("am") ? base * amRate() : 0;
    const tax = on("tax") ? (base - am) * taxRate() : 0;
    rows += `<label class="ded${on("am") && am > 0 ? "" : " off"}"><input type="checkbox" data-ded="am"${on("am") ? " checked" : ""}><span>AM-bidrag<small>${nf(0).format(amRate() * 100)} % Arbeitsmarktbeitrag</small></span><b>${am > 0 ? "− " + kr(am) : "–"}</b></label>`;
    rows += `<label class="ded${on("tax") && tax > 0 ? "" : " off"}"><input type="checkbox" data-ded="tax"${on("tax") ? " checked" : ""}><span>Einkommensteuer<small>geschätzt ${nf(0).format(taxRate() * 100)} % – unter Einstellungen änderbar</small></span><b>${tax > 0 ? "− " + kr(tax) : "–"}</b></label>`;
    const keep = beforeTax - am - tax;
    const perHour = c.minutesPiece > 0 ? keep / (c.minutesPiece / 60) : null;
    return `<div class="keep">
        <h3>Was bleibt dir wirklich? <span class="muted">pro Stück</span></h3>
        <p class="hint" style="margin:0 0 10px">Haken weg = wird nicht abgezogen. Gilt für alle Projekte.</p>
        <div class="ded top"><span>Verkaufspreis <small>was der Kunde bezahlt</small></span><b>${kr(P)}</b></div>
        ${rows}
        <div class="keep-final ${keep < 0 ? "neg" : ""}"><span>Bleibt dir auf die Hand</span><b>${kr(keep)}</b>
          <small>${P > 0 ? nf(0).format(keep / P * 100) + " % vom Verkaufspreis" : ""}${perHour !== null ? " · " + nf(0).format(perHour) + " kr. netto pro Stunde" : ""}</small></div>
        <p class="hint">Steuern sind eine Schätzung ohne Freibeträge (personfradrag) und ohne Abschreibungen. Für die genaue Rechnung frag deinen Revisor.</p>
      </div>`;
  }

  /* Nachbauen: was muss bereitliegen? */
  function renderRebuild() {
    const p = cur, box = $("#rebuild"); if (!box) return;
    const N = rebuildN[p.id] || 10, c = calc(p), f = N / c.n;
    if (!p.lines.length) { box.innerHTML = ""; return; }
    const rows = p.lines.map(l => {
      const m = matById(l.material_id); if (!m) return "";
      const used = usedAmount(m, l.use) * f, total = packTotal(m), packs = total > 0 ? Math.ceil(used / total - 1e-9) : 0;
      const base = { area: "cm²", length: "cm", piece: "Stk.", weight: "g", cast: "g Pulver", wear: "×", volume: "ml" }[m.type];
      const show = m.type === "area" ? amt(used / 10000) + " m²" : m.type === "length" ? amt(used / 100) + " m" : m.type === "weight" || m.type === "cast" ? (used >= 1000 ? amt(used / 1000) + " kg" : amt(used) + " " + base) : m.type === "volume" ? (used >= 1000 ? amt(used / 1000) + " l" : amt(used) + " ml") : amt(used) + " " + base;
      return `<tr><td>${esc(m.name)}</td><td class="n">${show}</td><td class="n">${m.type === "wear" ? "–" : packs + " Pack."}</td><td class="n">${kr(lineCost(l) * f)}</td></tr>`;
    }).join("");
    box.innerHTML = `<div class="tbl-wrap"><table class="rebuild"><thead><tr><th>Material</th><th style="text-align:right">Menge</th><th style="text-align:right">Packungen</th><th style="text-align:right">Kosten</th></tr></thead>
      <tbody>${rows}</tbody><tfoot><tr><td>Für ${N} Stück</td><td class="n" colspan="2">${c.minutesPiece ? minText(c.minutesPiece * N) + " Arbeit" : ""}</td><td class="n">${kr(c.material * N)}</td></tr>
      <tr><td colspan="3">Verkaufswert · Gewinn</td><td class="n">${krRound(c.final * N)} · ${kr(c.profit * N)}</td></tr></tfoot></table></div>`;
  }

  /* Stoppuhr */
  const nowS = () => Date.now() / 1000 + clockOffset;
  function renderWatch() {
    const p = cur, box = $("#watch"); if (!box) return;
    const run = p.timer_start !== null && p.timer_start !== undefined;
    const sec = run ? Math.max(0, nowS() - p.timer_start) : 0;
    box.className = "watch" + (run ? " running" : "");
    box.innerHTML = `<span style="font-weight:800">⏱ Stoppuhr</span><span class="time">${clock(sec)}</span>
      ${run ? '<button class="btn" data-timer="stop">Stopp</button>' : '<button class="btn green" data-timer="start">Start</button>'}
      <span class="muted">${run ? "Läuft weiter, auch wenn du die Seite schließt." : "Beim Basteln starten – danach in die Arbeitszeit übernehmen."}</span>`;
  }
  const clock = s => { s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0"); };
  async function timer(p, action) {
    if (action === "start") { const r = await api("timer", { id: p.id, action: "start" }); clockOffset = r.now - Date.now() / 1000; p.timer_start = r.project.timer_start; renderWatch(); renderTimerBar(); return; }
    const mins = Math.max(1, Math.round((nowS() - p.timer_start) / 60));
    const choice = await choose("Gemessen: " + minText(mins), "Was soll mit der gemessenen Zeit passieren?", [["set", "Als Arbeitszeit eintragen"], ["add", "Zur Arbeitszeit dazuzählen"], ["drop", "Verwerfen"], ["cancel", "Weiterlaufen lassen"]]);
    if (!choice || choice === "cancel") return;
    const r = await api("timer", { id: p.id, action: "stop" }); p.timer_start = r.project.timer_start;
    if (choice === "set") p.minutes = mins; if (choice === "add") p.minutes = num(p.minutes) + mins;
    if (choice !== "drop") { scheduleSave(); toast("Arbeitszeit: " + minText(num(p.minutes))); }
    if (cur === p) renderProject(p.id); renderTimerBar();
  }
  function renderTimerBar() {
    const bar = $("#timerbar"), run = D.projects.find(p => p.timer_start !== null && p.timer_start !== undefined);
    if (!run || (cur === run && location.hash.startsWith("#/projekt/"))) { bar.hidden = true; return; }
    bar.hidden = false; bar.innerHTML = `⏱ Stoppuhr läuft: ${esc(run.name)} · ${clock(nowS() - run.timer_start)} – antippen zum Öffnen`;
    bar.onclick = () => { location.hash = "#/projekt/" + run.id; };
  }
  setInterval(() => { if (!D) return; const t = $(".watch.running .time"); if (t && cur) t.textContent = clock(nowS() - cur.timer_start); renderTimerBar(); }, 1000);

  async function uploadPhoto(input) {
    const f = input.files[0]; if (!f) return;
    const fd = new FormData(); fd.append("id", cur.id); fd.append("photo", f); fd.append("csrf", CSRF);
    toast("Foto wird hochgeladen …");
    const r = await api("photo", fd, true); cur.image = r.project.image; renderProject(cur.id); toast("Foto gespeichert");
  }
  async function toProduct(p) {
    await saveNow();
    const c = calc(p);
    const ok = await confirmBox(p.product ? "Preis in der Kasse auf " + krRound(c.final) + " setzen?" : "Artikel „" + p.name + "“ für " + krRound(c.final) + " anlegen?",
      (p.product ? "Der Artikel „" + p.product.name + "“ bekommt den neuen Preis. " : "Der Artikel erscheint in der Kasse. ") + "Als Einkaufspreis wird " + kr(c.cost) + " eingetragen (Material, Verpackung und Sonstiges pro Stück) – so stimmt der Rohertrag in den Berichten.");
    if (!ok) return;
    const r = await api("to_product", { id: p.id, price: c.final, cost: c.cost });
    p.product = r.project.product;
    toast(r.created ? "Artikel in der Kasse angelegt" : "Preis in der Kasse aktualisiert");
    renderTicket();
  }

  /* ---------- Einkauf & Lager: eine Liste für alles, was eingekauft wird ---------- */
  let mSearch = "", mFilter = "alle";
  const stockText = m => amt(Math.round(m.stock * 100) / 100) + " " + (m.unit || "Packung");
  const isLow = m => m.min_stock > 0 && m.stock <= m.min_stock;
  const salePrice = m => m.sell_price !== null && m.sell_price > 0 ? m.sell_price : m.calc_price;
  const packKr = m => num(m.price) * rate(m);
  const MFILTERS = [["alle", "Alles"], ["craft", "Bastelmaterial"], ["sell", "Einzeln verkaufen"], ["low", "Nachkaufen"], ["shop", "Im Shop"]];
  const mPass = (m, f) => f === "alle" || (f === "craft" && m.craft) || (f === "sell" && m.sell) || (f === "low" && isLow(m)) || (f === "shop" && m.product);
  function renderMaterials() {
    cur = null;
    const list = D.materials.filter(m => mPass(m, mFilter) && (!mSearch || (m.name + " " + m.grp + " " + m.supplier + " " + m.sell_name).toLowerCase().includes(mSearch.toLowerCase())));
    const groups = [...new Set(list.map(m => m.grp || "Ohne Gruppe"))].sort((a, b) => a.localeCompare(b, "de"));
    const value = D.materials.reduce((s, m) => s + Math.max(0, m.stock) * packKr(m), 0);
    const saleValue = D.materials.filter(m => m.sell).reduce((s, m) => s + Math.max(0, m.stock) * Math.max(1, m.sell_units) * salePrice(m), 0);
    const low = D.materials.filter(isLow).length;
    const card = m => {
      const shopOld = m.product && Math.abs(m.product.price - salePrice(m)) > 0.004;
      return `<div class="lcard${isLow(m) ? " low" : ""}">
        <button class="lc-main" data-m="${m.id}">
          <div class="lc-img" style="${m.image ? `background-image:url('${esc(m.image)}')` : ""}">${m.image ? "" : "🧺"}</div>
          <div class="lc-txt"><h3>${esc(m.name)}</h3>
            <div class="lc-tags">${m.craft ? '<span class="badge">Bastelmaterial</span>' : ""}${m.sell ? '<span class="badge green">einzeln verkaufen</span>' : ""}${m.product ? '<span class="badge green">im Shop</span>' : ""}${isLow(m) ? '<span class="badge red">nachkaufen</span>' : ""}</div>
            <div class="u">${esc(priceText(m))} je ${esc(m.unit || "Packung")} · ${esc(packText(m))}${m.supplier ? " · " + esc(m.supplier) : ""}</div>
            ${m.sell ? `<div class="u">Einkauf ${krFine(m.unit_cost)} je Stück → <b class="sp">${krRound(salePrice(m))}</b> im Verkauf${m.sell_units > 1 ? " (" + m.sell_units + " Stück je " + esc(m.unit || "Packung") + ")" : ""}${shopOld ? ' <span class="badge red">Shop hat noch ' + krRound(m.product.price) + "</span>" : ""}</div>` : ""}
          </div>
          <div class="lc-stock"><b>${esc(stockText(m))}</b>${m.min_stock > 0 ? `<small>Mindestens ${esc(amt(m.min_stock))}</small>` : ""}${m.sell && m.sell_units > 1 ? `<small>= ${esc(amt(Math.floor(m.stock * m.sell_units)))} Stück</small>` : ""}</div>
        </button>
        <div class="lc-act">
          <button class="btn small" data-buy="${m.id}">+ Einkauf</button>
          <button class="btn small ghost" data-count="${m.id}">Zählen</button>
          <button class="btn small ghost" data-waste="${m.id}">Bruch</button>
          <button class="btn small ghost" data-hist="${m.id}">Verlauf</button>
          ${m.sell ? `<button class="btn small ${m.product && !shopOld ? "ghost" : "green"}" data-shop="${m.id}">${m.product ? (shopOld ? "Shop-Preis aktualisieren" : "Im Shop ✓ aktualisieren") : "In den Shop stellen"}</button>` : ""}
        </div></div>`;
    };
    view().innerHTML = `
      <div class="stats">
        <div class="stat"><b>${krRound(value)}</b><span>Lagerwert im Einkauf</span></div>
        <div class="stat"><b>${krRound(saleValue)}</b><span>Verkaufswert (einzeln verkaufbar)</span></div>
        <div class="stat"><b>${D.materials.length}</b><span>Einträge</span></div>
        <div class="stat${low ? " bad" : ""}"><b>${low}</b><span>nachkaufen</span></div>
      </div>
      <div class="toolbar"><input class="in" id="mq" type="search" placeholder="Suchen: Name, Gruppe, Lieferant …" value="${esc(mSearch)}">
        <div class="chips">${MFILTERS.map(([k, l]) => `<button class="chip ${mFilter === k ? "on" : ""}" data-mf="${k}">${l} (${D.materials.filter(m => mPass(m, k)).length})</button>`).join("")}</div>
        <div class="grow"><button class="btn ghost" id="lset">Aufschlag &amp; Runden</button><button class="btn big" id="newm">+ Neu eingekauft</button></div></div>
      <p class="muted" style="margin-top:-8px">Alles, was ihr einkauft, steht hier einmal: mit Preis, Lieferant und Bestand. <b>Bastelmaterial</b> könnt ihr in der Preiskalkulation verwenden – „Als gebaut eintragen“ zieht es vom Bestand ab.
        <b>Einzeln verkaufen</b> rechnet den Aufschlag drauf und stellt es mit einem Klick in Kasse und Online-Shop; verkauft ihr dort, sinkt der Bestand hier mit. Einkauf in Euro wird mit ${nf(2).format(D.eur_rate)} kr. umgerechnet.</p>
      ${!D.materials.length ? '<div class="empty">Noch nichts eingetragen.<br>Beim Anlegen gibt es Vorlagen für über 70 typische Bastelmaterialien.</div>' : !list.length ? '<div class="empty">Nichts gefunden.</div>' : ""}
      ${groups.map(g => `<div class="mgroup"><h2>${esc(g)}</h2><div class="lcards">${list.filter(m => (m.grp || "Ohne Gruppe") === g).map(card).join("")}</div></div>`).join("")}`;
    $("#mq").addEventListener("input", e => { mSearch = e.target.value; const pos = e.target.selectionStart; renderMaterials(); const q = $("#mq"); q.focus(); q.setSelectionRange(pos, pos); });
    view().onclick = async e => {
      const b = e.target.closest("button"); if (!b) return;
      const m = matById(+(b.dataset.m || b.dataset.buy || b.dataset.count || b.dataset.waste || b.dataset.hist || b.dataset.shop || 0));
      if (b.dataset.mf) { mFilter = b.dataset.mf; renderMaterials(); }
      if (b.id === "newm") editMaterial(null, () => renderMaterials());
      if (b.id === "lset") lagerSettings();
      if (b.dataset.m) editMaterial(m, () => renderMaterials());
      if (b.dataset.buy) bookMove(m, "purchase");
      if (b.dataset.count) bookMove(m, "inventory");
      if (b.dataset.waste) bookMove(m, "waste");
      if (b.dataset.hist) showHistory(m);
      if (b.dataset.shop) toShop(m);
    };
  }
  async function toShop(m) {
    const price = salePrice(m);
    if (!(price > 0)) { toast("Bitte zuerst den Einkaufspreis eintragen."); return; }
    if (!m.weight || !m.size_l) {
      const c = await choose("Gewicht und Maße fehlen", "Ohne Gewicht und Maße rechnet der Shop den Versand mit Standardwerten. Jetzt eintragen?", [["go", "Trotzdem in den Shop"], ["edit", "Jetzt eintragen"]]);
      if (c === "edit") { editMaterial(m, () => renderMaterials()); return; }
      if (c !== "go") return;
    }
    const r = await api("mat_shop", { id: m.id });
    Object.assign(m, r.material);
    toast(r.created ? "In Kasse und Shop angelegt: " + krRound(price) : "Shop aktualisiert: " + krRound(price));
    renderMaterials();
    if (r.created && !m.image) setTimeout(() => toast("Tipp: Mit einem Foto (Bearbeiten → Foto) sieht es im Shop viel besser aus."), 3200);
  }
  function bookMove(m, kind) {
    const T = { purchase: ["Einkauf buchen", "Wie viel ist dazugekommen?"], inventory: ["Bestand zählen", "Wie viel ist jetzt da?"], waste: ["Bruch / Schwund", "Wie viel ist kaputt oder weg?"] }[kind];
    const s = openModal(`<h2>${T[0]}: ${esc(m.name)}</h2>
      <p class="muted">Jetzt da: <b>${esc(stockText(m))}</b>${m.sell && m.sell_units > 1 ? " (= " + amt(Math.floor(m.stock * m.sell_units)) + " Stück)" : ""}</p>
      <div class="grid2"><label class="field"><span>${T[1]}</span><div class="unit" data-u="${esc(m.unit || "Packung")}"><input id="b-qty" inputmode="decimal" value="${kind === "inventory" ? esc(inputVal(Math.round(m.stock * 100) / 100)) : "1"}"></div></label>
      ${kind === "purchase" ? `<label class="field"><span>Preis je ${esc(m.unit || "Packung")} diesmal</span><div class="unit" data-u="${m.currency === "EUR" ? "€" : "kr."}"><input id="b-price" inputmode="decimal" value="${esc(inputVal(m.price))}"></div></label>` : ""}</div>
      ${kind === "purchase" ? `<div class="grid2" style="margin-top:16px"><label class="field"><span>Lieferant</span><input id="b-sup" value="${esc(m.supplier)}"></label><label class="field"><span>Notiz (Rechnungsnr. …)</span><input id="b-note"></label></div>
        <p class="hint">Ist der Preis anders als bisher, wird er übernommen – auch für die Preiskalkulation.</p>
        ${m.product ? '<label class="check big"><input type="checkbox" id="b-shop" checked> Verkaufspreis im Shop gleich mit anpassen</label>' : ""}` : `<label class="field" style="margin-top:16px"><span>Notiz (optional)</span><input id="b-note"></label>`}
      <div class="row"><button class="btn ghost" data-x="cancel">Abbrechen</button><button class="btn big" data-x="ok">Buchen</button></div>`);
    setTimeout(() => { const i = $("#b-qty", s); i.focus(); i.select(); }, 50);
    s.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.tagName === "INPUT") $('[data-x="ok"]', s).click(); });
    s.addEventListener("click", async e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.x === "cancel") return closeModal();
      if (b.dataset.x !== "ok") return;
      const body = { id: m.id, kind, qty: num($("#b-qty", s).value), note: ($("#b-note", s) || {}).value || "" };
      if (kind === "purchase") Object.assign(body, { price: $("#b-price", s).value, currency: m.currency, supplier: $("#b-sup", s).value, update_shop: !!($("#b-shop", s) || {}).checked });
      if (kind !== "inventory" && !(body.qty > 0)) { toast("Bitte eine Menge eingeben."); return; }
      b.disabled = true;
      try { const r = await api("mat_move", body); Object.assign(m, r.material); closeModal(); toast("Gebucht – jetzt " + stockText(m)); renderMaterials(); } catch (err) { b.disabled = false; }
    });
  }
  async function showHistory(m) {
    const s = openModal(`<h2>Verlauf: ${esc(m.name)}</h2><div id="h-list"><p class="loading">Lade …</p></div><div class="row"><button class="btn big" data-x="ok">Schließen</button></div>`);
    s.addEventListener("click", e => { if (e.target.closest("[data-x]")) closeModal(); });
    const r = await api("mat_moves", { id: m.id });
    const box = $("#h-list", s); if (!box) return;
    box.innerHTML = r.moves.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Wann</th><th>Was</th><th class="r">Menge</th><th class="r">danach</th><th>Notiz</th></tr></thead><tbody>${r.moves.map(x => `<tr>
      <td>${esc(new Date(x.created.replace(" ", "T")).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }))}</td><td>${esc(x.reason)}${x.price ? " · " + esc(amt(x.price)) + (x.currency === "EUR" ? " €" : " kr.") : ""}</td>
      <td class="r" style="color:${x.qty < 0 ? "var(--err)" : "var(--green)"}">${x.qty > 0 ? "+" : ""}${esc(amt(Math.round(x.qty * 1000) / 1000))}</td><td class="r">${esc(amt(Math.round(x.after * 100) / 100))}</td><td>${esc(x.note)}</td></tr>`).join("")}</tbody></table></div>`
      : '<p class="muted">Noch keine Buchungen.</p>';
  }
  function lagerSettings() {
    const L = D.lager;
    const s = openModal(`<h2>Aufschlag &amp; Runden</h2>
      <p class="muted">Gilt für alles, was einzeln verkauft wird und keinen eigenen Aufschlag oder Preis hat.</p>
      <label class="field"><span>Standard-Aufschlag auf den Einkaufspreis</span><div class="unit" data-u="%"><input id="l-m" inputmode="decimal" value="${esc(inputVal(L.margin))}"></div></label>
      <p class="hint">100 % heißt: doppelter Einkaufspreis, dann kommen 25 % Moms dazu. Für Bastelbedarf sind 60–150 % üblich.</p>
      <div class="field" style="margin-top:16px"><span>Verkaufspreis runden</span><div class="seg" id="l-r">${[["0", "genau"], ["1", "volle Krone"], ["5", "volle 5 kr."], ["10", "volle 10 kr."], ["95", "endet auf ,95"]].map(([k, l]) => `<button type="button" data-r="${k}" class="${L.round === k ? "on" : ""}">${l}</button>`).join("")}</div></div>
      <div class="row"><button class="btn ghost" data-x="cancel">Abbrechen</button><button class="btn big" data-x="ok">Speichern</button></div>`);
    let rnd = L.round;
    s.addEventListener("click", async e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.r) { rnd = b.dataset.r; $$("#l-r button", s).forEach(x => x.classList.toggle("on", x === b)); }
      if (b.dataset.x === "cancel") closeModal();
      if (b.dataset.x === "ok") { const r = await api("lager_settings", { margin: num($("#l-m", s).value), round: rnd }); D.lager = { margin: String(num($("#l-m", s).value)), round: rnd }; D.materials = r.materials; closeModal(); toast("Gespeichert – Preise neu gerechnet"); renderMaterials(); }
    });
  }

  function packFields(type, p) {
    const n = (k, label, ph) => `<label class="field"><span>${label}</span><input inputmode="decimal" data-p="${k}" value="${esc(inputVal(p[k]))}" placeholder="${ph || ""}"></label>`;
    const s = (k, label, opts, def) => `<label class="field"><span>${label}</span><select data-p="${k}">${opts.map(o => `<option${(p[k] || def) === o ? " selected" : ""}>${o}</option>`).join("")}</select></label>`;
    switch (type) {
      case "area": return `<div class="grid3">${n("length", "Länge", "z. B. 100")}${s("lengthUnit", "Einheit", ["m", "cm", "mm"], "m")}${n("count", "Anzahl Rollen/Bögen", "1")}${n("width", "Breite", "z. B. 70")}${s("widthUnit", "Einheit", ["cm", "m", "mm"], "cm")}</div>`;
      case "length": return `<div class="grid3">${n("length", "Länge", "z. B. 25")}${s("lengthUnit", "Einheit", ["m", "cm"], "m")}${n("count", "Anzahl Rollen", "1")}</div>`;
      case "piece": return `<div class="grid3">${n("count", "Stück in der Packung", "z. B. 150")}</div>`;
      case "weight": return `<div class="grid3">${n("amount", "Menge", "z. B. 500")}${s("unit", "Einheit", ["g", "kg"], "g")}</div>`;
      case "volume": return `<div class="grid3">${n("amount", "Menge", "z. B. 250")}${s("unit", "Einheit", ["ml", "l"], "ml")}</div>`;
      case "cast": return `<div class="grid3">${n("amount", "Pulver in der Packung", "z. B. 5")}${s("unit", "Einheit", ["kg", "g"], "kg")}<span></span>${n("ratioP", "Mischverhältnis: Pulver", "100")}${n("ratioW", ": Wasser", "30")}</div><p class="hint">Im Projekt gibst du dann die fertige Gießmasse ein; die App rechnet den Pulveranteil aus.</p>`;
      case "wear": return `<div class="grid3">${n("count", "Hält ungefähr so oft", "z. B. 50")}</div><p class="hint">Die Kosten werden auf jede Benutzung verteilt (z. B. Silikonform 150 kr., hält 50 Abgüsse = 3 kr. pro Guss).</p>`;
    }
    return "";
  }
  function editMaterial(m, done) {
    const isNew = !m;
    const d = m ? JSON.parse(JSON.stringify(m)) : { name: "", grp: "", type: "piece", price: "", currency: "DKK", pack: {}, supplier: "", note: "", stock: "", min_stock: 0, unit: "Packung", craft: true, sell: false, sell_units: 1, sell_name: "", margin: null, sell_price: null, weight: 0, size_l: 0, size_w: 0, size_h: 0 };
    const groups = [...new Set([...D.materials.map(x => x.grp).filter(Boolean), ...PRESETS.map(g => g[0])])];
    const v0 = x => x ? inputVal(x) : "";
    const s = openModal(`<h2>${isNew ? "Neu eingekauft" : "Bearbeiten"}</h2>
      ${isNew ? `<label class="field"><span>Vorlage (optional)</span><select id="preset"><option value="">– eigene Bezeichnung –</option>${PRESETS.map(([g, list], gi) => `<optgroup label="${esc(g)}">${list.map(([n], i) => `<option value="${gi}:${i}">${esc(n)}</option>`).join("")}</optgroup>`).join("")}</select></label><br>` : ""}
      <div class="grid2"><label class="field"><span>Bezeichnung</span><input id="m-name" value="${esc(d.name)}" placeholder="z. B. Samtband rot, 25 mm"></label>
        <label class="field"><span>Gruppe</span><input id="m-grp" list="grps" value="${esc(d.grp)}" placeholder="z. B. Bänder"><datalist id="grps">${groups.map(g => `<option value="${esc(g)}">`).join("")}</datalist></label></div>
      <div class="usechecks">
        <label class="check big"><input type="checkbox" id="m-craft" ${d.craft ? "checked" : ""}> <span><b>Bastelmaterial</b><small>in der Preiskalkulation wählbar, wird beim Bauen abgezogen</small></span></label>
        <label class="check big"><input type="checkbox" id="m-sell" ${d.sell ? "checked" : ""}> <span><b>Einzeln verkaufen</b><small>mit Aufschlag in Kasse und Online-Shop</small></span></label>
      </div>
      <p class="field" style="margin:18px 0 8px"><span>Wie wird es verbraucht bzw. gezählt?</span></p>
      <div class="chips" id="m-type">${Object.entries(TYPES).map(([k, t]) => `<button type="button" class="chip ${d.type === k ? "on" : ""}" data-t="${k}" title="${esc(t.hint)}">${t.label}</button>`).join("")}</div>
      <p class="hint" id="m-thint">${esc(TYPES[d.type].hint)}</p>
      <h3 class="sub">Packung, wie ihr sie einkauft</h3><div id="m-pack">${packFields(d.type, d.pack)}</div>
      <div class="grid3" style="margin-top:16px"><label class="field"><span>Preis der Packung</span><input id="m-price" inputmode="decimal" value="${esc(inputVal(d.price))}" placeholder="z. B. 49,95"></label>
        <div class="field"><span>Währung</span><div class="seg" id="m-cur"><button type="button" data-c="DKK" class="${d.currency !== "EUR" ? "on" : ""}">kr.</button><button type="button" data-c="EUR" class="${d.currency === "EUR" ? "on" : ""}">€</button></div></div>
        <label class="field"><span>Name der Packung</span><input id="m-unit" list="units" value="${esc(d.unit || "Packung")}"><datalist id="units">${["Packung", "Rolle", "Stück", "Beutel", "Flasche", "Dose", "Bogen", "Karton", "Bund", "kg", "Meter"].map(u => `<option value="${u}">`).join("")}</datalist></label></div>
      <p class="note good" id="m-up" style="margin-top:16px"></p>
      <h3 class="sub">Lager</h3>
      <div class="grid3">${isNew ? `<label class="field"><span>Jetzt da (Anzahl Packungen)</span><input id="m-stock" inputmode="decimal" value="${esc(v0(d.stock))}" placeholder="z. B. 3"></label>` : `<div class="field"><span>Bestand</span><p style="font-size:1.2rem;margin:6px 0">${esc(stockText(d))} <small class="muted">(ändern über „+ Einkauf“ oder „Zählen“)</small></p></div>`}
        <label class="field"><span>Nachkaufen ab (Packungen)</span><input id="m-min" inputmode="decimal" value="${esc(v0(d.min_stock))}" placeholder="z. B. 1"></label>
        <label class="field"><span>Lieferant / Bezugsquelle</span><input id="m-sup" value="${esc(d.supplier)}" placeholder="z. B. Bastelladen Flensburg"></label></div>
      <div id="m-sellbox" ${d.sell ? "" : "hidden"}>
        <h3 class="sub">Verkauf</h3>
        <div class="grid3"><label class="field"><span>Verkauft wird je Packung in</span><div class="unit" data-u="Stück"><input id="m-su" inputmode="numeric" value="${esc(d.sell_units || 1)}"></div></label>
          <label class="field"><span>Aufschlag (leer = Standard ${esc(D.lager.margin)} %)</span><div class="unit" data-u="%"><input id="m-margin" inputmode="decimal" value="${esc(d.margin === null ? "" : inputVal(d.margin))}"></div></label>
          <label class="field"><span>Eigener Preis je Stück (optional)</span><div class="unit" data-u="kr."><input id="m-sp" inputmode="decimal" value="${esc(d.sell_price ? inputVal(d.sell_price) : "")}"></div></label></div>
        <p class="note" id="m-calc" style="margin-top:14px"></p>
        <label class="field" style="margin-top:16px"><span>Name im Shop (leer = Bezeichnung oben)</span><input id="m-sname" value="${esc(d.sell_name)}" placeholder="z. B. Samtband rot, 1 Meter"></label>
        <h3 class="sub">Für den Versand – je Verkaufsstück</h3>
        <div class="grid4"><label class="field"><span>Gewicht</span><div class="unit" data-u="g"><input id="m-w" inputmode="decimal" value="${esc(v0(d.weight))}"></div></label>
          <label class="field"><span>Länge</span><div class="unit" data-u="cm"><input id="m-l" inputmode="decimal" value="${esc(v0(d.size_l))}"></div></label>
          <label class="field"><span>Breite</span><div class="unit" data-u="cm"><input id="m-b" inputmode="decimal" value="${esc(v0(d.size_w))}"></div></label>
          <label class="field"><span>Höhe</span><div class="unit" data-u="cm"><input id="m-h" inputmode="decimal" value="${esc(v0(d.size_h))}"></div></label></div>
        ${!isNew ? `<div class="photo-row"><div class="lc-img big" id="m-img" style="${d.image ? `background-image:url('${esc(d.image)}')` : ""}">${d.image ? "" : "Kein Foto"}</div>
          <label class="btn ghost">Foto wählen<input type="file" id="m-photo" accept="image/*" hidden></label>${d.image ? '<button type="button" class="btn ghost" data-x="nophoto">Foto entfernen</button>' : ""}</div>` : '<p class="hint">Ein Foto für den Shop kannst du nach dem Speichern hinzufügen.</p>'}
        ${d.product ? '<label class="check big"><input type="checkbox" id="m-upd" checked> Beim Speichern Preis, Gewicht und Maße im Shop mit aktualisieren</label>' : ""}
      </div>
      <label class="field" style="margin-top:16px"><span>Notiz (optional)</span><input id="m-note" value="${esc(d.note)}"></label>
      <div class="row">${isNew ? "" : '<button class="btn ghost" data-x="del" style="margin-right:auto">Löschen</button>'}<button class="btn ghost" data-x="cancel">Abbrechen</button><button class="btn big" data-x="save">Speichern</button></div>`);
    const readPack = () => { const p = {}; $$("[data-p]", s).forEach(i => { p[i.dataset.p] = i.value; }); return p; };
    const vatF = 1 + D.vat;
    const roundSale = kr => { const r = D.lager.round; if (r === "95") return Math.max(1, Math.ceil(kr + 0.05)) - 0.05; const st = +r; return st ? Math.ceil(kr / st - 1e-9) * st : Math.round(kr * 100) / 100; };
    const preview = () => {
      d.pack = readPack(); d.price = $("#m-price", s).value;
      $("#m-up", s).textContent = unitPrice(d) ? unitPriceText(d) : "Preis und Packungsgröße eintragen – dann steht hier, was ein Stück, ein Meter oder 100 g kosten.";
      $("#m-sellbox", s).hidden = !$("#m-sell", s).checked;
      if (!$("#m-sell", s).checked) return;
      const su = Math.max(1, Math.round(num($("#m-su", s).value)) || 1), cost = num(d.price) * rate(d) / su;
      const mg = isEmpty($("#m-margin", s).value) ? num(D.lager.margin) : num($("#m-margin", s).value);
      const calcP = roundSale(cost * (1 + mg / 100) * vatF), own = num($("#m-sp", s).value);
      const fin = own > 0 ? own : calcP, net = fin / vatF, profit = net - cost;
      $("#m-calc", s).innerHTML = cost > 0 ? `Einkauf je Stück <b>${krFine(cost)}</b> + ${amt(mg)} % Aufschlag + Moms = <b>${krRound(calcP)}</b>${own > 0 ? ` · dein Preis <b>${krRound(own)}</b>` : ""}<br>
        Davon bleiben dir nach Moms <b>${kr(profit)}</b> je Stück (${net > 0 ? amt(Math.round(profit / net * 100)) : 0} % vom Netto)${profit < 0 ? ' – <b style="color:var(--err)">Verlust!</b>' : ""}.` : "Preis der Packung eintragen, dann steht hier der Verkaufspreis.";
    };
    s.addEventListener("input", preview); s.addEventListener("change", async e => {
      if (e.target.id === "preset" && e.target.value) {
        const [gi, i] = e.target.value.split(":").map(Number), [n, type, pack] = PRESETS[gi][1][i];
        $("#m-name", s).value = n; $("#m-grp", s).value = PRESETS[gi][0]; d.type = type; d.pack = { ...pack };
        $$("#m-type .chip", s).forEach(c => c.classList.toggle("on", c.dataset.t === type)); $("#m-thint", s).textContent = TYPES[type].hint;
        $("#m-pack", s).innerHTML = packFields(type, d.pack);
      }
      if (e.target.id === "m-photo" && e.target.files[0]) {
        const f = new FormData(); f.append("id", m.id); f.append("photo", e.target.files[0]);
        toast("Foto wird hochgeladen …");
        const r = await api("mat_photo", f, true); Object.assign(m, r.material); d.image = m.image;
        const im = $("#m-img", s); im.style.backgroundImage = "url('" + m.image + "')"; im.textContent = ""; toast("Foto gespeichert");
      }
      preview();
    });
    preview();
    s.addEventListener("click", async e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.t) { d.pack = readPack(); d.type = b.dataset.t; $$("#m-type .chip", s).forEach(c => c.classList.toggle("on", c === b)); $("#m-thint", s).textContent = TYPES[d.type].hint; $("#m-pack", s).innerHTML = packFields(d.type, d.pack); preview(); }
      if (b.dataset.c) { d.currency = b.dataset.c; $$("#m-cur button", s).forEach(c => c.classList.toggle("on", c === b)); preview(); }
      if (b.dataset.x === "cancel") closeModal();
      if (b.dataset.x === "nophoto") { const f = new FormData(); f.append("id", m.id); f.append("remove", "1"); const r = await api("mat_photo", f, true); Object.assign(m, r.material); closeModal(); toast("Foto entfernt"); done && done(m); }
      if (b.dataset.x === "del") {
        const used = D.projects.filter(p => p.lines.some(l => l.material_id === m.id));
        closeModal();
        if (!(await confirmBox("„" + m.name + "“ löschen?", (used.length ? "Es wird in " + used.length + " Projekt(en) verwendet und dort entfernt: " + used.map(p => p.name).join(", ") + ". " : "") + (m.product ? "Der Artikel in Kasse und Shop bleibt bestehen." : "")))) return;
        await api("material", { id: m.id, delete: 1 });
        D.materials = D.materials.filter(x => x.id !== m.id); D.projects.forEach(p => { p.lines = p.lines.filter(l => l.material_id !== m.id); });
        done && done(null);
      }
      if (b.dataset.x === "save") {
        const g = id => { const el = $(id, s); return el ? el.value : ""; };
        const body = { id: m ? m.id : null, name: g("#m-name"), grp: g("#m-grp"), type: d.type, price: num(g("#m-price")), currency: d.currency, pack: readPack(), supplier: g("#m-sup"), note: g("#m-note"),
          unit: g("#m-unit"), min_stock: num(g("#m-min")), stock: num(g("#m-stock")), craft: $("#m-craft", s).checked, sell: $("#m-sell", s).checked,
          sell_units: Math.max(1, Math.round(num(g("#m-su"))) || 1), margin: isEmpty(g("#m-margin")) ? null : num(g("#m-margin")), sell_price: num(g("#m-sp")) > 0 ? num(g("#m-sp")) : null, sell_name: g("#m-sname"),
          weight: num(g("#m-w")), size_l: num(g("#m-l")), size_w: num(g("#m-b")), size_h: num(g("#m-h")), update_shop: !!($("#m-upd", s) || {}).checked };
        if (!body.name.trim()) { toast("Bitte eine Bezeichnung eingeben."); return; }
        if (!body.craft && !body.sell) { toast("Bitte mindestens einen Haken setzen: Bastelmaterial oder Einzeln verkaufen."); return; }
        const r = await api("material", body);
        if (m) Object.assign(m, r.material); else D.materials.push(r.material);
        closeModal(); toast("Gespeichert"); done && done(m || r.material);
      }
    });
    setTimeout(() => (isNew ? $("#preset", s) : $("#m-price", s)).focus(), 50);
  }
  function pickMaterial(cb) {
    const s = openModal(`<h2>Material hinzufügen</h2><input class="in" id="pq" type="search" placeholder="Suchen …">
      <div class="pick" id="plist"></div><div class="row"><button class="btn ghost" data-x="new" style="margin-right:auto">+ Neu eingekauft</button><button class="btn ghost" data-x="cancel">Abbrechen</button></div>`);
    const draw = () => {
      const q = $("#pq", s).value.toLowerCase();
      const list = D.materials.filter(m => m.craft && (!q || (m.name + " " + m.grp).toLowerCase().includes(q)));
      const groups = [...new Set(list.map(m => m.grp || "Ohne Gruppe"))].sort((a, b) => a.localeCompare(b, "de"));
      $("#plist", s).innerHTML = list.length ? groups.map(g => `<h3>${esc(g)}</h3>` + list.filter(m => (m.grp || "Ohne Gruppe") === g).map(m => `<button data-pm="${m.id}"><span>${esc(m.name)}</span><small>${esc(unitPriceText(m))} · Lager: ${esc(stockText(m))}</small></button>`).join("")).join("")
        : '<div class="empty">Nichts gefunden. Lege das Material neu an.</div>';
    };
    draw(); $("#pq", s).addEventListener("input", draw); setTimeout(() => $("#pq", s).focus(), 50);
    s.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.pm) { closeModal(); cb(matById(+b.dataset.pm)); }
      if (b.dataset.x === "cancel") closeModal();
      if (b.dataset.x === "new") { closeModal(); editMaterial(null, m => { if (m) cb(m); }); }
    });
  }

  /* ---------- Stundensatz & Einstellungen ---------- */
  let setT = null;
  function renderSettings() {
    cur = null;
    const st = S();
    const need = needWage(), std = num(st.wage);
    view().innerHTML = `
      <section class="card">
        <h2>Dein Stundensatz</h2>
        <p class="lead">Damit wird deine Arbeitszeit in jedem Preis bezahlt. Wähle, woran er sich richten soll.</p>
        <div class="seg" id="wmode"><button data-w="standard" class="${st.wage_mode !== "bedarf" ? "on" : ""}">Standard-Stundensatz</button><button data-w="bedarf" class="${st.wage_mode === "bedarf" ? "on" : ""}">Aus meinem Monatsbedarf</button></div>
        <div class="grid2" style="margin-top:24px">
          <label class="field"><span>Standard-Stundensatz</span><div class="unit" data-u="kr./Std."><input inputmode="decimal" data-s="wage" value="${esc(inputVal(st.wage))}"></div>
            <p class="hint">Vorschlag: 150 kr. – das liegt grob beim Stundenlohn im dänischen Einzelhandel (rund 140–160 kr.). So ist deine Zeit fair bezahlt und die Sachen bleiben gut verkäuflich.</p></label>
          <div></div>
        </div>
      </section>
      <section class="card">
        <h2>Was brauchst du im Monat?</h2>
        <p class="lead">Trag ein, wie viel Geld du im Monat netto (auf die Hand) brauchst. Daraus rechnet die App, welchen Stundensatz du dafür bräuchtest – und zeigt bei jedem Projekt, wie viele Stück du im Monat verkaufen müsstest.</p>
        <div class="grid2">
          <label class="field"><span>Netto im Monat</span><div class="unit" data-u="kr."><input inputmode="decimal" data-s="need" value="${esc(inputVal(num(st.need) || ""))}" placeholder="z. B. 15.000"></div></label>
          <label class="field"><span>AM-bidrag</span><div class="unit" data-u="%"><input inputmode="decimal" data-s="am" value="${esc(inputVal(st.am))}"></div><p class="hint">Arbeitsmarktbeitrag in Dänemark: 8 % vom Gewinn.</p></label>
          <label class="field"><span>Einkommensteuer (geschätzt)</span><div class="unit" data-u="%"><input inputmode="decimal" data-s="tax" value="${esc(inputVal(st.tax))}"></div><p class="hint">Gemeinde- und Staatssteuer nach dem AM-bidrag, meist 33–42 %. Zusammen ergibt das <b id="tax-total"></b>. Frag im Zweifel deinen Revisor.</p></label>
          <label class="field"><span>Feste Kosten im Monat (Miete, Strom, Versicherung …)</span><div class="unit" data-u="kr."><input inputmode="decimal" data-s="fixed" value="${esc(inputVal(num(st.fixed) || ""))}" placeholder="0"></div></label>
          <label class="field"><span>So viele Stunden im Monat wird gebastelt</span><div class="unit" data-u="Std."><input inputmode="decimal" data-s="hours" value="${esc(inputVal(st.hours))}"></div><p class="hint">Nur die Zeit, die wirklich in Stücke fließt – nicht Ladenzeit oder Einkauf.</p></label>
        </div>
        <div id="need-out" style="margin-top:22px"></div>
      </section>
      <section class="card">
        <h2>Preis</h2>
        <div class="grid2">
          <label class="field"><span>Gewinnaufschlag (Standard für neue Projekte)</span><div class="unit" data-u="%"><input inputmode="decimal" data-s="markup" value="${esc(inputVal(st.markup))}"></div><p class="hint">Der Gewinn kommt zusätzlich zum Stundensatz – als Reserve für Ausfälle, Ladenhüter und Neuanschaffungen. 20–40 % sind üblich.</p></label>
          <label class="field"><span>Kartengebühr</span><div class="unit" data-u="%"><input inputmode="decimal" data-s="fee" value="${esc(inputVal(st.fee))}"></div><p class="hint">Was SumUp oder dein Kartenterminal pro Zahlung nimmt (steht in deinem Vertrag). 0 = nicht einrechnen.</p></label>
          <div class="field"><span>Moms einrechnen</span><div class="seg" id="vat"><button data-v="1" class="${st.vat === "1" ? "on" : ""}">Ja, ${nf(0).format(D.vat * 100)} % Moms</button><button data-v="0" class="${st.vat !== "1" ? "on" : ""}">Nein</button></div><p class="hint">„Nein“ nur, wenn ihr nicht momsregistriert seid.</p></div>
          <div class="field"><span>Verkaufspreis runden auf</span><div class="seg" id="rnd">${[["1", "volle Krone"], ["5", "5 kr."], ["10", "10 kr."], ["0", "nicht runden"]].map(([v, l]) => `<button data-r="${v}" class="${st.round === v ? "on" : ""}">${l}</button>`).join("")}</div>
            <div class="seg" id="rmode" style="margin-top:10px"><button data-rm="up" class="${st.round_mode !== "near" ? "on" : ""}">immer aufrunden</button><button data-rm="near" class="${st.round_mode === "near" ? "on" : ""}">zum nächsten runden</button></div></div>
        </div>
      </section>
      <section class="card">
        <h2>Daten aus der alten Bastelwerkstatt übernehmen</h2>
        <p class="lead">In der alten App (<a href="../../bastelwerkstatt/" target="_blank" rel="noopener">Bastelwerkstatt öffnen</a>) unter „Einstellungen → Sicherung speichern“ eine Datei erzeugen und hier auswählen. Kategorien, Material, Projekte und das erste Foto jedes Projekts werden übernommen; Euro-Preise bleiben in Euro.</p>
        <label class="btn ghost big"><input type="file" id="imp" accept="application/json,.json" hidden>Sicherung auswählen …</label>
      </section>`;
    const out = () => {
      const tt = $("#tax-total"); if (tt) tt.textContent = nf(1).format(totalTax() * 100) + " % Abzüge";
      const w = needWage(), t = monthTarget(), stdW = num(S().wage);
      $("#need-out").innerHTML = w > 0 ? `<div class="note ${w > stdW * 1.6 ? "bad" : w < stdW * 0.8 ? "" : "good"}" style="font-size:1.1rem">
        Dafür bräuchtest du <strong style="font-size:1.4rem">${nf(0).format(w)} kr. pro Stunde</strong> (nötige Einnahmen vor Steuern: ${kr(t)} im Monat).<br>
        ${w > stdW * 1.6 ? "Das ist deutlich mehr als der Standard von " + nf(0).format(stdW) + " kr. – die Preise würden hoch. Plane mehr Bastelstunden ein oder bleib beim Standard-Stundensatz; jedes Projekt zeigt dir dann, wie viele Stück du für deinen Bedarf verkaufen musst."
          : w < stdW * 0.8 ? "Das liegt unter dem Standard von " + nf(0).format(stdW) + " kr. – mit dem Standard-Stundensatz bist du auf der sicheren Seite." : "Das passt gut zum Standard von " + nf(0).format(stdW) + " kr."}
        ${S().wage_mode === "bedarf" ? "<br><strong>Wird in allen Projekten verwendet.</strong>" : "<br>Zurzeit wird der Standard-Stundensatz verwendet – oben auf „Aus meinem Monatsbedarf“ umstellen, um diesen zu nutzen."}</div>`
        : '<p class="hint">Netto-Bedarf und Stunden eintragen, dann steht hier der nötige Stundensatz.</p>';
    };
    out();
    const save = () => { clearTimeout(setT); savedNote("Wird gespeichert …"); setT = setTimeout(async () => { await api("settings", S()); savedNote("✓ Gespeichert"); }, 600); };
    view().oninput = e => { const k = e.target.dataset.s; if (k) { S()[k] = String(num(e.target.value)); out(); save(); } };
    view().onclick = e => {
      const b = e.target.closest("button"); if (!b) return;
      const set = (k, v, grp) => { S()[k] = v; $$("#" + grp + " button").forEach(x => x.classList.toggle("on", x === b)); out(); save(); };
      if (b.dataset.w) set("wage_mode", b.dataset.w, "wmode");
      if (b.dataset.v) set("vat", b.dataset.v, "vat");
      if (b.dataset.r) set("round", b.dataset.r, "rnd");
      if (b.dataset.rm) set("round_mode", b.dataset.rm, "rmode");
    };
    $("#imp").addEventListener("change", async e => {
      const f = e.target.files[0]; e.target.value = ""; if (!f) return;
      let data; try { data = JSON.parse(await f.text()); } catch (x) { toast("Die Datei ist keine gültige Sicherung."); return; }
      if (!(await confirmBox("Sicherung übernehmen?", "Die Daten werden zusätzlich zu den vorhandenen angelegt – es wird nichts gelöscht."))) return;
      const r = await api("import", { data });
      toast(r.counts.projects + " Projekte, " + r.counts.materials + " Materialien übernommen");
      await load(); location.hash = "#/";
    });
  }

  /* ---------- Dialoge ---------- */
  /* Jeder Dialog bekommt ein frisches Blatt, damit keine Klick-Behandlung eines früheren Dialogs mitläuft */
  function openModal(html) { const m = $("#modal"); m.innerHTML = '<div class="sheet" role="dialog" aria-modal="true"></div>'; const s = m.firstChild; s.innerHTML = html; m.hidden = false; return s; }
  function closeModal() { const m = $("#modal"); m.hidden = true; m.innerHTML = ""; }
  $("#modal").addEventListener("mousedown", e => { if (e.target.id === "modal") closeModal(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#modal").hidden) closeModal(); });
  function ask(title, label, value) {
    return new Promise(res => {
      const s = openModal(`<h2>${esc(title)}</h2><label class="field"><span>${esc(label)}</span><input id="ask" value="${esc(value || "")}"></label><div class="row"><button class="btn ghost" data-x="no">Abbrechen</button><button class="btn big" data-x="ok">OK</button></div>`);
      const i = $("#ask", s); setTimeout(() => i.focus(), 50);
      const done = v => { closeModal(); res(v); };
      i.addEventListener("keydown", e => { if (e.key === "Enter") done(i.value.trim()); });
      s.addEventListener("click", e => { const b = e.target.closest("button"); if (b) done(b.dataset.x === "ok" ? i.value.trim() : null); });
    });
  }
  function confirmBox(title, text) { return choose(title, text, [["no", "Abbrechen"], ["yes", "Ja"]]).then(v => v === "yes"); }
  function choose(title, text, opts) {
    return new Promise(res => {
      const s = openModal(`<h2>${esc(title)}</h2><p style="font-size:1.1rem">${esc(text)}</p><div class="row">${opts.map(([k, l], i) => `<button class="btn ${i === opts.length - 1 || k === "set" ? "big" : "ghost"}" data-c="${k}">${esc(l)}</button>`).join("")}</div>`);
      s.addEventListener("click", e => { const b = e.target.closest("button"); if (b) { closeModal(); res(b.dataset.c); } });
    });
  }

  /* ---------- Start ---------- */
  async function load() { D = await api("all"); clockOffset = D.now - Date.now() / 1000; }
  load().then(() => { route(); renderTimerBar(); }).catch(() => { view().innerHTML = '<p class="loading">Die Daten konnten nicht geladen werden. Bitte Seite neu laden.</p>'; });
})();
