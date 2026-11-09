/* Julekontor Kasse
   - Artikel per Kachel, Suche, Hand-Scanner oder Kamera in den Warenkorb
   - Zahlen: Bar (mit Rückgeld), Karte (beliebiges Kartenterminal), MobilePay, Sonstige
   - Verkäufe ohne Netz werden im Tablet zwischengespeichert und automatisch nachgesendet. */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const API = "../api.php?a=";
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  let csrf = document.querySelector('meta[name="csrf"]').content;
  let D = LS.get("jk-data", null);           // Stammdaten (Artikel, Einstellungen) – auch offline verfügbar
  let cart = LS.get("jk-cart", { lines: [], pct: 0 });
  let cat = LS.get("jk-cat", "fav");
  let query = "";
  let online = navigator.onLine;

  /* ---------- Hilfen ---------- */
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const cur = () => (D && D.settings.currency) || "DKK";
  const fmt = (c, withCur = true) => (c / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (withCur ? " " + cur() : "");
  const fmtQ = q => (Math.round(q * 1000) / 1000).toLocaleString("de-DE");
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "x" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12));
  const vatLabel = v => (v / 100).toLocaleString("de-DE") + " %";
  const roundCash = t => { const s = (D && D.settings.round_cash) || 0; return s > 0 ? Math.round(t / s) * s : t; };
  function toast(html, err = false, ms = 2600) {
    const t = $("toast");
    t.innerHTML = html; t.className = "toast show" + (err ? " err" : "");
    clearTimeout(toast.t); toast.t = setTimeout(() => t.className = "toast" + (err ? " err" : ""), ms);
  }
  function errSound() {
    try { const c = new (window.AudioContext || window.webkitAudioContext)(), o = c.createOscillator(), g = c.createGain();
      o.type = "square"; o.frequency.value = 220; g.gain.value = .06; o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + .25); } catch (e) {}
  }

  async function api(action, body, opts = {}) {
    const r = await fetch(API + action + (opts.qs || ""), {
      method: body ? "POST" : "GET", credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json", "X-CSRF": csrf } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await r.json(); } catch (e) {}
    if (r.status === 401 || data.login) { location.href = "../?p=kasse"; throw new Error("login"); }
    if (!r.ok) { const e = new Error(data.error || "Fehler " + r.status); e.status = r.status; e.server = true; throw e; }
    return data;
  }

  /* ---------- Stammdaten ---------- */
  async function load() {
    try {
      const d = await api("init");
      D = d; csrf = d.csrf; LS.set("jk-data", d); online = true;
    } catch (e) {
      if (e.message === "login") return;
      online = false;
      if (!D) { toast("Keine Verbindung zum Server.", true, 6000); }
    }
    renderAll();
    flushQueue();
    if (online) resumeCard();
  }
  const products = () => (D ? D.products : []);
  const byId = id => products().find(p => p.id === id);
  const byCode = code => { code = String(code).trim(); return products().find(p => p.barcode === code || (p.sku && p.sku === code)); };

  /* ---------- Katalog ---------- */
  function renderCats() {
    if (!D) return;
    const btn = (id, name, color) => `<button type="button" data-cat="${id}" class="${String(cat) === String(id) ? "on" : ""}" ${color ? `style="--c:${esc(color)}"` : ""}>${esc(name)}</button>`;
    $("cats").innerHTML = btn("fav", "★ Favoriten") + btn("all", "Alle") + D.categories.map(c => btn(c.id, c.name, c.color)).join("");
  }
  function renderTiles() {
    if (!D) { $("tiles").innerHTML = '<div class="empty">Lade Artikel …</div>'; return; }
    const q = query.toLowerCase();
    let list = products();
    if (q) list = list.filter(p => p.name.toLowerCase().includes(q) || p.barcode.includes(q) || (p.sku || "").toLowerCase().includes(q));
    else if (cat === "fav") list = list.filter(p => p.fav);
    else if (cat !== "all") list = list.filter(p => String(p.cat) === String(cat));
    const colors = Object.fromEntries(D.categories.map(c => [c.id, c.color]));
    $("tiles").innerHTML = list.length ? list.slice(0, 400).map(p => {
      const low = p.track && p.stock <= 0;
      return `<button type="button" class="tile${p.img ? " has-img" : ""}" data-id="${p.id}" style="--c:${esc(colors[p.cat] || "var(--gold-soft)")}">
        ${p.img ? `<img src="${esc(p.img)}" alt="" loading="lazy" draggable="false">` : ""}
        ${p.track ? `<span class="s ${low ? "" : "ok"}">${fmtQ(p.stock)}</span>` : ""}
        <span class="n">${esc(p.name)}</span><span class="p">${p.open ? "Preis eingeben" : fmt(p.price)}</span></button>`;
    }).join("") : `<div class="empty">${q ? "Nichts gefunden." : products().length ? "Keine Artikel in dieser Auswahl." : "Noch keine Artikel. Lege sie im Admin unter „Artikel“ an."}</div>`;
  }

  /* ---------- Warenkorb ---------- */
  const lineGross = l => Math.round(l.price * l.qty);
  const lineTotal = l => lineGross(l) - (l.disc || 0);
  function totals() {
    const sub = cart.lines.reduce((s, l) => s + lineTotal(l), 0);
    const cartDisc = Math.round(sub * (cart.pct || 0) / 100);
    const lineDisc = cart.lines.reduce((s, l) => s + (l.disc || 0), 0);
    const items = cart.lines.reduce((s, l) => s + l.qty, 0);
    return { sub, cartDisc, total: sub - cartDisc, disc: lineDisc + cartDisc, items };
  }
  function save() { LS.set("jk-cart", cart); }
  function renderCart(flashKey) {
    const t = totals();
    $("lines").innerHTML = cart.lines.length ? cart.lines.map(l => `
      <li data-key="${l.key}" class="${l.key === flashKey ? "flash" : ""}">
        <span class="q">${fmtQ(l.qty)}</span>
        <span><span class="nm">${esc(l.name)}</span><br><span class="sub">${fmt(l.price, false)}${l.disc ? ` · <span class="d">−${fmt(l.disc, false)}</span>` : ""}</span></span>
        <span class="t num">${fmt(lineTotal(l), false)}</span></li>`).join("")
      : '<li class="none">Artikel antippen oder scannen</li>';
    $("sums").innerHTML = (t.disc ? `<div><span>Zwischensumme</span><span class="num">${fmt(t.sub + cart.lines.reduce((s, l) => s + (l.disc || 0), 0))}</span></div>
      <div><span>Rabatt${cart.pct ? " (" + cart.pct + " %)" : ""}</span><span class="num">−${fmt(t.disc)}</span></div>` : "")
      + `<div class="total"><span>Summe</span><span class="num">${fmt(t.total)}</span></div>`;
    $("pay").disabled = !cart.lines.length;
    $("pay").textContent = cart.lines.length ? "Bezahlen  " + fmt(t.total) : "Bezahlen";
    $("cart-toggle").innerHTML = `<span>🛒 ${fmtQ(t.items)} Artikel</span><span>${fmt(t.total)} →</span>`;
    $("cart-toggle").hidden = !cart.lines.length;
    if (flashKey) { const li = document.querySelector(`[data-key="${flashKey}"]`); if (li) li.scrollIntoView({ block: "nearest" }); }
    save();
  }
  function addProduct(p, opts = {}) {
    if (p.open && opts.price == null) {
      return numpad({ title: p.name, hint: "Preis eingeben", money: true, ok: "Hinzufügen" }).then(v => { if (v != null && v > 0) addProduct(p, { price: v }); });
    }
    const price = opts.price != null ? opts.price : p.price;
    let l = !p.open && cart.lines.find(x => x.pid === p.id && x.price === price && !x.disc);
    if (l) l.qty = Math.round((l.qty + 1) * 1000) / 1000;
    else { l = { key: uuid(), pid: p.id, name: p.name, price, qty: 1, disc: 0, vat: p.vat }; cart.lines.push(l); }
    if (p.track && p.stock - l.qty < 0) toast(`„${esc(p.name)}“: laut Lager nicht mehr vorrätig`, true);
    renderCart(l.key);
  }
  function addByCode(code) {
    code = String(code).trim();
    if (!code) return;
    const p = byCode(code);
    if (p) { addProduct(p); return; }
    errSound();
    const admin = D && D.role === "admin";
    toast(`Unbekannter Code ${esc(code)}${admin ? ` · <a href="../?p=artikel&new=1&barcode=${encodeURIComponent(code)}">anlegen</a>` : ""}`, true, 5000);
  }

  /* ---------- Dialoge ---------- */
  /* Jeder Dialog bekommt ein frisches Element – so hängen keine Klick-Reaktionen alter Dialoge mehr dran
     (sonst würde z. B. „Abschließen“ zweimal buchen). */
  function openModal(html, cls = "") {
    const m = $("modal");
    const s = document.createElement("div");
    s.className = "sheet " + cls; s.setAttribute("role", "dialog"); s.setAttribute("aria-modal", "true");
    s.innerHTML = html;
    m.replaceChildren(s); m.hidden = false;
    return s;
  }
  function closeModal() { $("modal").hidden = true; $("modal").replaceChildren(); }
  $("modal").addEventListener("click", e => { if (e.target.id === "modal" && !$("modal").dataset.lock) closeModal(); });

  /* Zahlenfeld. money = Eingabe in Øre/Cent (Ziffern rutschen von rechts rein wie am Terminal). */
  function numpad({ title, hint = "", money = false, value = 0, ok = "OK", decimals = 3 }) {
    return new Promise(resolve => {
      let s = money ? String(value || "") : (value ? String(value).replace(".", ",") : "");
      const s0 = openModal(`<h2>${esc(title)}</h2><p class="muted">${esc(hint)}</p>
        <div class="field on"><span>${money ? cur() : "Menge"}</span><b id="np-v"></b></div>
        <div class="pad">${[1,2,3,4,5,6,7,8,9].map(n => `<button type="button" data-k="${n}">${n}</button>`).join("")}
          <button type="button" data-k="${money ? "00" : ","}" class="fn">${money ? "00" : ","}</button><button type="button" data-k="0">0</button><button type="button" data-k="del" class="fn">⌫</button></div>
        <div class="row"><button type="button" class="btn gray" data-x="cancel">Abbrechen</button><button type="button" class="btn green" data-x="ok">${esc(ok)}</button></div>`);
      const show = () => { s0.querySelector("#np-v").textContent = money ? fmt(parseInt(s || "0", 10), false) : (s || "0"); };
      const val = () => money ? parseInt(s || "0", 10) : parseFloat((s || "0").replace(",", "."));
      const key = k => {
        if (k === "del") s = s.slice(0, -1);
        else if (k === ",") { if (!s.includes(",")) s = (s || "0") + ","; }
        else if (money ? s.length < 9 : (s.split(",")[1] || "").length < decimals || !s.includes(",")) s = (s === "0" ? "" : s) + k;
        show();
      };
      s0.addEventListener("click", e => {
        const b = e.target.closest("button"); if (!b) return;
        if (b.dataset.k) key(b.dataset.k);
        if (b.dataset.x === "cancel") { closeModal(); document.removeEventListener("keydown", kd, true); resolve(null); }
        if (b.dataset.x === "ok") { closeModal(); document.removeEventListener("keydown", kd, true); resolve(val()); }
      });
      const kd = e => {
        if ($("modal").hidden) { document.removeEventListener("keydown", kd, true); return; }
        if (/^\d$/.test(e.key)) { key(e.key); e.preventDefault(); }
        else if (e.key === "," || e.key === ".") { if (!money) key(","); e.preventDefault(); }
        else if (e.key === "Backspace") { key("del"); e.preventDefault(); }
        else if (e.key === "Enter") { e.preventDefault(); s0.querySelector('[data-x="ok"]').click(); }
        else if (e.key === "Escape") { s0.querySelector('[data-x="cancel"]').click(); }
      };
      document.addEventListener("keydown", kd, true);
      show();
    });
  }

  function editLine(key) {
    const l = cart.lines.find(x => x.key === key); if (!l) return;
    const p = l.pid ? byId(l.pid) : null;
    const s = openModal(`<h2>${esc(l.name)}</h2><p class="muted">${fmt(l.price)} je ${esc((p && p.unit) || "Stk.")}${p && p.track ? " · Lager " + fmtQ(p.stock) : ""}</p>
      <div class="qty-row"><button type="button" data-x="minus">−</button><b id="el-q">${fmtQ(l.qty)}</b><button type="button" data-x="plus">＋</button></div>
      <div class="chips"><button type="button" data-x="qty">Menge eintippen</button><button type="button" data-x="price">Preis ändern</button></div>
      <p class="muted" style="margin-top:14px">Rabatt auf diese Position</p>
      <div class="chips">${[0, 10, 20, 25, 50].map(v => `<button type="button" data-pct="${v}">${v ? v + " %" : "kein"}</button>`).join("")}<button type="button" data-x="discamt">Betrag …</button></div>
      <div class="row"><button type="button" class="btn ghost" data-x="del">Entfernen</button><button type="button" class="btn green" data-x="close">Fertig</button></div>`);
    const refresh = () => { s.querySelector("#el-q").textContent = fmtQ(l.qty); renderCart(); };
    s.addEventListener("click", async e => {
      const b = e.target.closest("button"); if (!b) return;
      const x = b.dataset.x;
      if (x === "plus") { l.qty = Math.round((l.qty + 1) * 1000) / 1000; refresh(); }
      if (x === "minus") { if (l.qty > 1) { l.qty = Math.round((l.qty - 1) * 1000) / 1000; l.disc = Math.min(l.disc, lineGross(l)); refresh(); } }
      if (x === "del") { cart.lines = cart.lines.filter(y => y !== l); closeModal(); renderCart(); }
      if (x === "close") { closeModal(); renderCart(); }
      if (b.dataset.pct != null) { l.disc = Math.round(lineGross(l) * +b.dataset.pct / 100); closeModal(); renderCart(l.key); }
      if (x === "qty") { const v = await numpad({ title: l.name, hint: "Menge", value: l.qty }); if (v > 0) { l.qty = Math.round(v * 1000) / 1000; l.disc = Math.min(l.disc, lineGross(l)); } renderCart(l.key); }
      if (x === "price") { const v = await numpad({ title: l.name, hint: "Neuer Einzelpreis", money: true, value: l.price }); if (v != null) { l.price = v; l.disc = Math.min(l.disc, lineGross(l)); } renderCart(l.key); }
      if (x === "discamt") { const v = await numpad({ title: "Rabatt", hint: l.name + " – Betrag abziehen", money: true }); if (v != null) l.disc = Math.min(v, lineGross(l)); renderCart(l.key); }
    });
  }

  async function addMisc() {
    if (!D) return;
    const price = await numpad({ title: "Diverse", hint: "Betrag für einen Artikel ohne Strichcode", money: true, ok: "Weiter" });
    if (!price) return;
    const rates = D.settings.vat_rates;
    let vat = rates[0];
    if (rates.length > 1) {
      vat = await new Promise(res => {
        const s = openModal(`<h2>Steuersatz</h2><div class="chips">${rates.map(r => `<button type="button" data-v="${r}">${vatLabel(r)}</button>`).join("")}</div>`);
        s.addEventListener("click", e => { const b = e.target.closest("[data-v]"); if (b) { closeModal(); res(+b.dataset.v); } });
      });
    }
    const l = { key: uuid(), pid: null, name: "Diverse", price, qty: 1, disc: 0, vat };
    cart.lines.push(l); renderCart(l.key);
  }

  function cartDiscount() {
    const s = openModal(`<h2>Rabatt auf den ganzen Bon</h2><p class="muted">Wird anteilig auf alle Positionen verteilt.</p>
      <div class="chips">${[0, 5, 10, 15, 20, 25, 30, 50].map(v => `<button type="button" data-pct="${v}" class="${(cart.pct || 0) === v ? "on" : ""}">${v ? v + " %" : "kein Rabatt"}</button>`).join("")}</div>
      <div class="row"><button type="button" class="btn gray" data-x="other">Anderer Wert …</button><button type="button" class="btn green" data-x="close">Fertig</button></div>`);
    s.addEventListener("click", async e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.pct != null) { cart.pct = +b.dataset.pct; closeModal(); renderCart(); }
      if (b.dataset.x === "close") closeModal();
      if (b.dataset.x === "other") { const v = await numpad({ title: "Rabatt in %", decimals: 1 }); if (v != null) cart.pct = Math.max(0, Math.min(100, v)); renderCart(); }
    });
  }

  /* ---------- Kasse öffnen ---------- */
  async function ensureOpen() {
    if (D && D.closing) return true;
    if (!online) return true;                           // offline: Server prüft beim Nachsenden
    const v = await numpad({ title: "Kasse öffnen", hint: "Wie viel Wechselgeld liegt in der Kassenlade?", money: true, ok: "Kasse öffnen" });
    if (v == null) return false;
    try { const r = await api("open_day", { float: v }); D.closing = r.closing; LS.set("jk-data", D); renderStatus(); toast("Kasse geöffnet"); return true; }
    catch (e) { toast(esc(e.message), true); return false; }
  }

  /* ---------- Bezahlen ---------- */
  async function pay() {
    if (!cart.lines.length || !D) return;
    if (!(await ensureOpen())) return;
    const t = totals();
    const methods = D.settings.payments;
    const icons = { cash: "💵", card: "💳", mobilepay: "📱", other: "🧾" };
    let method = methods.cash ? "cash" : Object.keys(methods)[0];
    let typed = "";                                          // eingetippter Betrag „Gegeben“ in Øre
    let given = 0;
    let manualCard = false;                                  // Karte ohne SumUp-Gerät bestätigen
    const s = openModal(`<h2>Bezahlen</h2><div class="big num" id="p-total"></div>
      <div class="methods">${Object.entries(methods).map(([k, n]) => `<button type="button" data-m="${k}"><span>${icons[k] || ""}</span>${esc(n)}</button>`).join("")}</div>
      <div id="p-body"></div>
      <div class="row"><button type="button" class="btn gray" data-x="cancel">Zurück</button><button type="button" class="btn green" data-x="ok" id="p-ok">Abschließen</button></div>`, "wide");
    const due = () => method === "cash" ? roundCash(t.total) : t.total;
    function cashInfo() {
      const d = due();
      s.querySelector("#p-given b").textContent = given ? fmt(given, false) : "–";
      s.querySelector("#p-change").innerHTML = given >= d ? `Rückgeld<b class="num">${fmt(given - d)}</b>`
        : given ? `<span style="color:var(--err)">Es fehlen ${fmt(d - given)}</span>` : "Schein antippen oder Betrag eintippen";
      s.querySelector("#p-ok").disabled = given < d;
    }
    function body() {
      s.querySelectorAll("[data-m]").forEach(b => b.classList.toggle("on", b.dataset.m === method));
      s.querySelector("#p-total").textContent = fmt(due());
      const ok = s.querySelector("#p-ok"), b = s.querySelector("#p-body");
      ok.disabled = false; ok.hidden = false;
      if (method === "cash") {
        const d = due();
        const notes = [...new Set([d, Math.ceil(d / 5000) * 5000, Math.ceil(d / 10000) * 10000, Math.ceil(d / 20000) * 20000, Math.ceil(d / 50000) * 50000, Math.ceil(d / 100000) * 100000])].filter(v => v >= d).slice(0, 4);
        b.innerHTML = `<div class="quick">${notes.map((v, i) => `<button type="button" data-g="${v}">${i === 0 ? "Passend" : fmt(v, false)}</button>`).join("")}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start">
            <div><div class="field on" id="p-given"><span>Gegeben</span><b class="num"></b></div><div class="change" id="p-change"></div>
              ${d !== t.total ? `<p class="muted" style="text-align:center">Gerundet von ${fmt(t.total)}</p>` : ""}</div>
            <div class="pad" style="margin-top:12px">${[1,2,3,4,5,6,7,8,9].map(n => `<button type="button" data-k="${n}">${n}</button>`).join("")}
              <button type="button" data-k="00" class="fn">00</button><button type="button" data-k="0">0</button><button type="button" data-k="del" class="fn">⌫</button></div>
          </div>`;
        ok.textContent = "Abschließen";
        cashInfo();
      } else if (method === "card" && D.settings.sumup && online && !manualCard) {
        b.innerHTML = `<div class="row"><button type="button" class="btn green" data-x="sumup" style="min-height:76px;font-size:1.2rem">💳 ${fmt(due())} an ${esc(D.settings.sumup.reader)} senden</button></div>
          <p class="muted" style="text-align:center">Der Kunde zahlt am Gerät, die Kasse bucht dann von selbst.<br>
          <button type="button" class="link" data-x="manual" style="text-decoration:underline">Gerät geht nicht? Karte manuell bestätigen</button></p>`;
        ok.hidden = true;
      } else if (method === "card") {
        b.innerHTML = `<p style="text-align:center;margin-top:16px">Gib <b>${fmt(due())}</b> am Kartenterminal ein.<br><span class="muted">Wenn die Zahlung durch ist: „Karte bezahlt“.</span></p>
          <input type="text" id="p-ref" placeholder="Belegnummer vom Kartenterminal (optional)" maxlength="80" inputmode="numeric">`;
        ok.textContent = "Karte bezahlt";
      } else if (method === "mobilepay") {
        b.innerHTML = `<div class="mp">MobilePay${D.settings.mobilepay_number ? `<b>${esc(D.settings.mobilepay_number)}</b>` : ""}<div>${fmt(due())}</div></div>
          <p class="muted" style="text-align:center">Erst abschließen, wenn die Zahlung auf dem Handy des Kunden bestätigt ist.</p>`;
        ok.textContent = "Zahlung erhalten";
      } else {
        b.innerHTML = `<input type="text" id="p-note" placeholder="Wie bezahlt? (z. B. Gutschein Nr., Rechnung)" maxlength="200">`;
        ok.textContent = "Abschließen";
      }
    }
    const key = k => {
      if (method !== "cash") return;
      if (k === "del") typed = typed.slice(0, -1); else if (typed.length < 8) typed = (typed + k).replace(/^0+/, "");
      given = parseInt(typed || "0", 10); cashInfo();
    };
    s.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.m) { method = b.dataset.m; given = 0; typed = ""; body(); }
      if (b.dataset.g) { given = +b.dataset.g; typed = ""; cashInfo(); }
      if (b.dataset.k) key(b.dataset.k);
      if (b.dataset.x === "cancel") { document.removeEventListener("keydown", kd, true); closeModal(); }
      if (b.dataset.x === "manual") { manualCard = true; body(); }
      if (b.dataset.x === "sumup") { document.removeEventListener("keydown", kd, true); cardFlow(salePayload({ payment: "card" }), false); }
      if (b.dataset.x === "ok" && !b.disabled && !b.hidden) {
        b.disabled = true;
        document.removeEventListener("keydown", kd, true);
        const note = (s.querySelector("#p-note") || {}).value || "";
        const ref = ((s.querySelector("#p-ref") || {}).value || "").trim();
        finish({ payment: method, given: method === "cash" ? given : 0, note, card_ref: ref ? "Terminal " + ref : "" });
      }
    });
    const kd = e => {
      if ($("modal").hidden) { document.removeEventListener("keydown", kd, true); return; }
      if (e.target && (e.target.id === "p-note" || e.target.id === "p-ref")) return;
      if (/^\d$/.test(e.key)) { e.preventDefault(); key(e.key); }
      else if (e.key === "Backspace") { e.preventDefault(); key("del"); }
      else if (e.key === "Enter") { e.preventDefault(); s.querySelector("#p-ok").click(); }
    };
    document.addEventListener("keydown", kd, true);
    body();
  }

  /* ---------- Kartenzahlung über SumUp Solo ---------- */
  async function cardFlow(payload, resume) {
    const amount = payload._total;
    LS.set("jk-cardpending", { payload, at: Date.now() });
    $("modal").dataset.lock = "1";
    const s = openModal(`<div class="done"><div class="ok" id="cf-icon">💳</div><h2 id="cf-title">${resume ? "Kartenzahlung läuft noch …" : "Wird an das Gerät gesendet …"}</h2>
      <div class="big num">${fmt(amount)}</div><p class="muted" id="cf-msg"></p>
      <div class="row" id="cf-btns"><button type="button" class="btn gray" data-x="abort">Abbrechen</button></div></div>`);
    const title = s.querySelector("#cf-title"), msg = s.querySelector("#cf-msg"), btns = s.querySelector("#cf-btns");
    let stop = false, cancelAt = 0;
    const end = () => { stop = true; LS.del("jk-cardpending"); delete $("modal").dataset.lock; };
    const fail = (text) => {
      stop = true; delete $("modal").dataset.lock; errSound();
      s.querySelector("#cf-icon").textContent = "⚠️"; title.textContent = "Nicht bezahlt"; msg.textContent = text;
      btns.innerHTML = `<button type="button" class="btn gray" data-x="close">Zurück zum Warenkorb</button><button type="button" class="btn green" data-x="retry">Nochmal senden</button>`;
    };
    s.addEventListener("click", async e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.x === "abort") {
        b.disabled = true; b.textContent = "Wird abgebrochen …"; cancelAt = Date.now();
        try { await api("sumup_cancel", { uuid: payload.uuid }); } catch (err) {}
      }
      if (b.dataset.x === "close") { LS.del("jk-cardpending"); closeModal(); }
      if (b.dataset.x === "retry") cardFlow(payload, false);
    });
    if (!resume) {
      try { await api("sumup_start", { uuid: payload.uuid, amount }); }
      catch (e) { LS.del("jk-cardpending"); fail(e.server ? e.message : "Keine Verbindung zum Server."); return; }
    }
    title.textContent = "Bitte Karte an das Gerät halten";
    msg.textContent = "Warte auf die Zahlung am " + D.settings.sumup.reader + " …";
    while (!stop) {
      await new Promise(r => setTimeout(r, 2000));
      if (stop) return;
      let p = null;
      try { p = (await api("sumup_status", null, { qs: "&uuid=" + encodeURIComponent(payload.uuid) })).payment; }
      catch (e) { if (e.server && e.status === 422) { end(); closeModal(); return; } msg.textContent = "Verbindung wackelt – prüfe weiter …"; continue; }
      if (p.status === "successful") { stop = true; delete $("modal").dataset.lock; await bookPaid(payload); return; }
      if (p.status === "failed" || p.status === "cancelled") { LS.del("jk-cardpending"); fail(cancelAt ? "Die Zahlung wurde abgebrochen." : "Die Karte wurde abgelehnt oder die Zahlung abgebrochen." + (p.message ? " (" + p.message + ")" : "")); return; }
      // Abbruch angefordert, Gerät meldet nichts mehr: nach 15 s endgültig aufgeben (vorher noch einmal prüfen)
      if (cancelAt && Date.now() - cancelAt > 15000) {
        try {
          const g = (await api("sumup_giveup", { uuid: payload.uuid })).payment;
          if (g && g.status === "successful") { stop = true; delete $("modal").dataset.lock; await bookPaid(payload); return; }
        } catch (e) {}
        LS.del("jk-cardpending"); fail("Die Zahlung wurde abgebrochen."); return;
      }
    }
  }
  /* Bei SumUp bezahlt → Verkauf buchen. Klappt das nicht, bleibt der Vorgang gemerkt und kann
     mit derselben Nummer nachgebucht werden – es wird nie ein zweites Mal von der Karte abgebucht. */
  async function bookPaid(payload) {
    await finish(null, payload);
    if (!cart.lines.length) { LS.del("jk-cardpending"); return; }
    $("modal").dataset.lock = "1";
    const s = openModal(`<div class="done"><div class="ok">⚠️</div><h2>Bezahlt, aber noch nicht gebucht</h2>
      <p>Die Karte wurde bei SumUp belastet. Die Buchung in der Kasse hat noch nicht geklappt. <b>Nicht noch einmal kassieren!</b></p>
      <div class="row"><button type="button" class="btn green" data-x="again">Buchung wiederholen</button></div></div>`);
    s.querySelector('[data-x="again"]').onclick = () => { delete $("modal").dataset.lock; bookPaid(payload); };
  }
  /* Tablet neu geladen, während eine Kartenzahlung lief: Ergebnis abholen */
  function resumeCard() {
    const pend = LS.get("jk-cardpending", null);
    if (!pend || !D || !D.settings.sumup) return;
    if (Date.now() - pend.at > 30 * 60000) { LS.del("jk-cardpending"); return; }
    cardFlow(pend.payload, true);
  }

  function salePayload(extra) {
    const t = totals();
    return {
      uuid: uuid(),
      items: cart.lines.map(l => ({ product_id: l.pid, name: l.name, qty: l.qty, price: l.price, discount: l.disc || 0, vat: l.vat })),
      discount_pct: cart.pct || 0,
      _total: t.total,
      ...extra,
    };
  }

  let busy = false;
  async function finish(extra, payload) {
    if (busy) return;                                   // nie zwei Buchungen gleichzeitig
    busy = true;
    try { await finishInner(extra, payload); } finally { busy = false; }
  }
  async function finishInner(extra, payload) {
    payload = payload || salePayload(extra);
    $("modal").dataset.lock = "1";
    openModal(`<div class="done"><p class="muted">Wird gebucht …</p></div>`);
    try {
      const r = await api("sale", payload);
      delete $("modal").dataset.lock;
      cart = { lines: [], pct: 0 }; renderCart();
      applyStock(payload.items);
      done(r.receipt);
    } catch (e) {
      delete $("modal").dataset.lock;
      if (e.server) { closeModal(); errSound(); toast(esc(e.message), true, 6000); if (/nicht geöffnet/.test(e.message)) { D.closing = null; renderStatus(); } return; }
      // keine Verbindung: im Tablet merken und später senden
      const q = LS.get("jk-queue", []); q.push(payload); LS.set("jk-queue", q);
      cart = { lines: [], pct: 0 }; renderCart();
      applyStock(payload.items);
      online = false; renderStatus();
      const s = openModal(`<div class="done"><div class="ok">📶</div><h2>Offline gespeichert</h2>
        <p>Der Verkauf über <b>${fmt(payload.payment === "cash" ? roundCash(payload._total) : payload._total)}</b> ist im Tablet gespeichert und wird gebucht, sobald wieder Netz da ist.
        Den Bon kannst du danach unter „Letzte Bons“ drucken.</p>
        ${payload.payment === "cash" && payload.given ? `<p class="change">Rückgeld<b>${fmt(payload.given - roundCash(payload._total))}</b></p>` : ""}
        <div class="row"><button type="button" class="btn green" data-x="new">Neuer Verkauf</button></div></div>`);
      s.querySelector('[data-x="new"]').onclick = closeModal;
    }
  }
  function applyStock(items) {
    if (!D) return;
    items.forEach(i => { const p = i.product_id && byId(i.product_id); if (p && p.track) p.stock = Math.round((p.stock - i.qty) * 1000) / 1000; });
    LS.set("jk-data", D); renderTiles();
  }
  /* QR-Code als SVG (Bibliothek qrcode-generator, liegt lokal in ../assets) */
  function qrSvg(text) {
    if (!window.qrcode) return "";
    const q = qrcode(0, "M"); q.addData(text); q.make();
    return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  }
  function showQrBig(r) {
    const s = openModal(`<div class="done"><h2>Digitaler Beleg · Bon ${r.number}</h2>
      <div class="qr-big">${qrSvg(r.url)}</div>
      <p class="muted">Mit der Handy-Kamera scannen · Scan med kameraet · Scan with your camera</p>
      <div class="row"><button type="button" class="btn green" data-x="close">Fertig</button></div></div>`, "wide");
    s.querySelector('[data-x="close"]').onclick = closeModal;
  }
  function done(r) {
    const a4 = D.settings.print_default === "a4";
    const qr = D.settings.receipt_qr && r.url;
    const s = openModal(`<div class="done ${qr ? "with-qr" : ""}">
      ${qr ? `<div class="qr-box"><div class="qr">${qrSvg(r.url)}</div><p>Beleg aufs Handy:<br>QR-Code scannen</p><button type="button" class="link" data-x="qrbig">🔍 Groß zeigen</button></div>` : ""}
      <div><div class="ok">✅</div><h2>Bon ${r.number}</h2>
      <p class="muted">${esc(r.payment_label)} · ${fmt(r.total)}</p>
      ${r.payment === "cash" ? `<div class="change">Rückgeld<b class="num">${fmt(r.change)}</b></div>` : ""}
      <div class="row"><button type="button" class="btn ${a4 ? "gray" : "ghost"}" data-x="bon">🧾 Bon drucken</button><button type="button" class="btn ${a4 ? "ghost" : "gray"}" data-x="a4">📄 A4-Rechnung</button></div>
      <div class="row"><button type="button" class="btn green" data-x="new">Neuer Verkauf</button></div></div></div>`, qr ? "wide" : "");
    s.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.x === "bon" || b.dataset.x === "a4") printReceipt(r.id, b.dataset.x);
      if (b.dataset.x === "qrbig") { showQrBig(r); }
      if (b.dataset.x === "new") { closeModal(); $("search").focus(); }
    });
    if (window.matchMedia("(max-width: 860px)").matches) document.body.classList.remove("cart-open");
  }
  function printReceipt(id, fmt) { window.open("../bon.php?auto=1&id=" + encodeURIComponent(id) + (fmt ? "&fmt=" + fmt : ""), "_blank"); }

  /* ---------- Offline-Puffer nachsenden ---------- */
  async function flushQueue() {
    const q = LS.get("jk-queue", []);
    if (!q.length) { renderStatus(); return; }
    const rest = [];
    for (const p of q) {
      try { await api("sale", p); online = true; }
      catch (e) {
        if (e.server && e.status === 422) { toast("Ein gespeicherter Verkauf wurde abgelehnt: " + esc(e.message), true, 8000); rest.push(p); }
        else { rest.push(p); online = false; }
      }
    }
    LS.set("jk-queue", rest);
    if (rest.length < q.length && online) toast(`${q.length - rest.length} gespeicherte Verkäufe nachgebucht`);
    renderStatus();
  }

  /* ---------- Menü ---------- */
  function menu() {
    const admin = D && D.role === "admin";
    const s = openModal(`<h2>Menü</h2><p class="muted">${esc(D ? D.user : "")}${D && D.closing ? " · Kasse offen seit " + new Date(D.closing.opened_at.replace(" ", "T")).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : " · Kasse geschlossen"}</p>
      <div class="menu-list">
        <button type="button" data-x="recent">🧾 Letzte Bons / nachdrucken</button>
        <button type="button" data-x="report">📊 Zwischenstand (X-Bericht)</button>
        <button type="button" data-x="move">💶 Einlage / Entnahme</button>
        <a href="../?p=abschluss">🔒 Tag abschließen (Z-Bericht)</a>
        <a href="../?p=verkaeufe">↩️ Rückgabe / Storno</a>
        <button type="button" data-x="reload">🔄 Artikel neu laden</button>
        <button type="button" data-x="full">⛶ Vollbild</button>
        <a href="../">⚙️ ${admin ? "Admin" : "Übersicht"}</a>
      </div>`);
    s.addEventListener("click", async e => {
      const b = e.target.closest("button"); if (!b) return;
      const x = b.dataset.x;
      if (x === "reload") { closeModal(); await load(); toast("Artikel aktualisiert"); }
      if (x === "full") { closeModal(); const d = document.documentElement; (d.requestFullscreen || d.webkitRequestFullscreen || (() => {})).call(d); }
      if (x === "recent") recent();
      if (x === "report") report();
      if (x === "move") cashMove();
    });
  }
  async function recent() {
    const s = openModal(`<h2>Letzte Bons</h2><p class="muted">Lade …</p>`, "wide");
    try {
      const r = await api("recent");
      const q = LS.get("jk-queue", []);
      s.innerHTML = `<h2>Letzte Bons</h2>${q.length ? `<p style="color:var(--err)">${q.length} Verkauf/Verkäufe warten noch auf Übertragung.</p>` : ""}
        <table class="rep">${r.sales.map(x => `<tr><td><b>${x.number}</b> · ${new Date(x.created.replace(" ", "T")).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}${x.type === "refund" ? " · Rückgabe" : ""}</td>
          <td>${fmt(+x.total)}</td><td style="width:1%;white-space:nowrap"><button type="button" class="btn ghost" style="min-height:44px" data-qr="${x.id}" title="QR-Code für den digitalen Beleg">📱</button> <button type="button" class="btn ghost" style="min-height:44px" data-id="${x.id}">🖨</button></td></tr>`).join("") || "<tr><td>Noch keine Bons.</td></tr>"}</table>
        <div class="row"><button type="button" class="btn gray" data-x="close">Schließen</button></div>`;
      s.onclick = async e => {
        const b = e.target.closest("button"); if (!b) return;
        if (b.dataset.id) printReceipt(b.dataset.id);
        if (b.dataset.qr) { try { showQrBig((await api("receipt", null, { qs: "&id=" + encodeURIComponent(b.dataset.qr) })).receipt); } catch (err) { toast(esc(err.message), true); } }
        if (b.dataset.x === "close") closeModal();
      };
    } catch (e) { s.innerHTML = `<h2>Letzte Bons</h2><p>${esc(e.message)}</p>`; }
  }
  async function report() {
    const s = openModal(`<h2>Zwischenstand</h2><p class="muted">Lade …</p>`);
    try {
      const r = await api("report");
      if (!r.closing) { s.innerHTML = `<h2>Zwischenstand</h2><p>Die Kasse ist geschlossen.</p><div class="row"><button type="button" class="btn gray" onclick="">OK</button></div>`; s.querySelector("button").onclick = closeModal; return; }
      const t = r.totals, P = D.settings.payments;
      s.innerHTML = `<h2>Zwischenstand</h2><p class="muted">seit ${new Date(r.closing.opened_at.replace(" ", "T")).toLocaleString("de-DE")}</p>
        <table class="rep">
          <tr><td>Umsatz</td><td>${fmt(t.gross)}</td></tr><tr><td>Verkäufe</td><td>${t.count_sales}</td></tr>
          ${Object.entries(t.payments).map(([k, v]) => `<tr><td>davon ${esc((P[k]) || k)}</td><td>${fmt(v)}</td></tr>`).join("")}
          ${t.count_refunds ? `<tr><td>Rückgaben (${t.count_refunds})</td><td>${fmt(t.refunds)}</td></tr>` : ""}
          <tr><td>Wechselgeld</td><td>${fmt(r.closing.float)}</td></tr>
          ${t.cash_moves ? `<tr><td>Einlagen/Entnahmen</td><td>${fmt(t.cash_moves)}</td></tr>` : ""}
          <tr><td><b>Bar in der Kasse (Soll)</b></td><td>${fmt(t.expected_cash)}</td></tr></table>
        <div class="row"><a class="btn ghost" href="../?p=abschluss" style="display:grid;place-items:center;text-decoration:none">Tag abschließen</a><button type="button" class="btn gray" data-x="close">Schließen</button></div>`;
      s.querySelector('[data-x="close"]').onclick = closeModal;
    } catch (e) { s.innerHTML = `<h2>Zwischenstand</h2><p>${esc(e.message)}</p>`; }
  }
  async function cashMove() {
    const dir = await new Promise(res => {
      const s = openModal(`<h2>Einlage / Entnahme</h2><div class="row"><button type="button" class="btn" data-d="-1">Geld raus</button><button type="button" class="btn ghost" data-d="1">Geld rein</button></div>`);
      s.onclick = e => { const b = e.target.closest("[data-d]"); if (b) res(+b.dataset.d); };
    });
    const amt = await numpad({ title: dir < 0 ? "Entnahme" : "Einlage", money: true, ok: "Weiter" });
    if (!amt) return;
    const note = await new Promise(res => {
      const s = openModal(`<h2>Grund</h2><input type="text" id="cm-n" maxlength="200" placeholder="z. B. Briefmarken, Wechselgeld von der Bank">
        <div class="row"><button type="button" class="btn gray" data-x="c">Abbrechen</button><button type="button" class="btn green" data-x="ok">Buchen</button></div>`);
      const i = s.querySelector("#cm-n"); i.focus();
      s.onclick = e => { const b = e.target.closest("button"); if (!b) return; closeModal(); res(b.dataset.x === "ok" ? i.value.trim() : null); };
    });
    if (!note) return;
    try { await api("cash_move", { amount: dir * amt, note }); toast("Gebucht: " + fmt(dir * amt)); }
    catch (e) { toast(esc(e.message), true); }
  }

  /* ---------- Anzeige ---------- */
  function renderStatus() {
    const q = LS.get("jk-queue", []).length;
    $("status").innerHTML = (q ? `<span class="warn">${q} offline</span> ` : "")
      + (!online ? `<span class="warn">Offline</span>` : D && !D.closing ? `<span class="warn">Kasse zu</span>` : `<small>${esc(D ? D.user : "")}</small>`);
  }
  function renderAll() { renderCats(); renderTiles(); renderCart(); renderStatus(); }

  /* ---------- Ereignisse ---------- */
  $("cats").addEventListener("click", e => { const b = e.target.closest("[data-cat]"); if (!b) return; cat = b.dataset.cat; LS.set("jk-cat", cat); query = ""; $("search").value = ""; renderCats(); renderTiles(); });
  $("tiles").addEventListener("click", e => { const b = e.target.closest(".tile"); if (!b) return; const p = byId(+b.dataset.id); if (p) addProduct(p); });
  $("lines").addEventListener("click", e => { const li = e.target.closest("li[data-key]"); if (li) editLine(li.dataset.key); });
  $("search").addEventListener("input", e => { query = e.target.value.trim(); renderTiles(); });
  $("search").addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const v = e.target.value.trim(); if (!v) return;
    const p = byCode(v);
    const q = v.toLowerCase();
    const hits = products().filter(x => x.name.toLowerCase().includes(q));
    if (p) addProduct(p); else if (hits.length === 1) addProduct(hits[0]); else if (/^\d{6,14}$/.test(v)) addByCode(v); else return;
    e.target.value = ""; query = ""; renderTiles();
  });
  $("cam").addEventListener("click", () => JKScan.camera(addByCode, { continuous: true }));
  $("clear").addEventListener("click", () => { if (cart.lines.length && confirm("Warenkorb leeren?")) { cart = { lines: [], pct: 0 }; renderCart(); } });
  $("misc").addEventListener("click", addMisc);
  $("disc").addEventListener("click", () => cart.lines.length && cartDiscount());
  $("pay").addEventListener("click", pay);
  $("menu").addEventListener("click", menu);
  $("cart-toggle").addEventListener("click", () => document.body.classList.add("cart-open"));
  $("cart-close").addEventListener("click", () => document.body.classList.remove("cart-open"));
  $("cart").addEventListener("click", e => { if (e.target.closest(".cart-head h2")) document.body.classList.remove("cart-open"); });
  window.addEventListener("online", () => { online = true; flushQueue(); load(); });
  window.addEventListener("offline", () => { online = false; renderStatus(); });
  setInterval(() => { if (LS.get("jk-queue", []).length) flushQueue(); }, 20000);
  setInterval(() => { if ($("modal").hidden && !cart.lines.length) load(); }, 5 * 60000);   // Preise/Artikel regelmäßig auffrischen
  // Hand-Scanner: Scans landen immer im Warenkorb – außer ein Dialog ist offen
  document.addEventListener("DOMContentLoaded", () => JKScan.listen(code => { if ($("modal").hidden) addByCode(code); }, { always: true }));
  // Tastatur: F2 / Leertaste bei leerer Suche = bezahlen
  document.addEventListener("keydown", e => {
    if (!$("modal").hidden) { if (e.key === "Escape" && !$("modal").dataset.lock) closeModal(); return; }
    if (e.key === "F2" || (e.key === "+" && document.activeElement !== $("search"))) { e.preventDefault(); pay(); }
  });

  renderAll();
  load();
})();
