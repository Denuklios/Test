/* Julekontor – Website: Schnee, Truck, Countdown, Adventskalender, Warenkorb, Formulare.
   Texte und Einstellungen kommen vom Server in window.JK. */
(function () {
  "use strict";
  var doc = document, root = doc.documentElement, JK = window.JK || { t: {} };
  var $ = function (s, el) { return (el || doc).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || doc).querySelectorAll(s)); };
  var calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var store = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
                set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  var offset = new Date(JK.now) - Date.now();
  if (isNaN(offset) || Math.abs(offset) < 5000) offset = 0;

  root.classList.add("js");
  function t(key, vars) {
    var s = JK.t[key] || key;
    if (vars && typeof s === "string") Object.keys(vars).forEach(function (k) { s = s.split("{" + k + "}").join(vars[k]); });
    return s;
  }
  function tr(obj) { if (!obj) return ""; if (obj[JK.lang]) return obj[JK.lang]; return obj.da || obj.de || obj.en || ""; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function money(ore) {
    try { return new Intl.NumberFormat(JK.locale, { style: "currency", currency: JK.currency || "DKK" }).format(ore / 100); }
    catch (e) { return (ore / 100).toFixed(2) + " " + (JK.currency || "DKK"); }
  }
  function eur(ore) {
    if (!JK.eur) return "";
    return t("shop.approx", { eur: new Intl.NumberFormat(JK.locale, { style: "currency", currency: "EUR" }).format(ore / 100 / JK.eur) });
  }
  function fmtDate(d, o) { try { return new Intl.DateTimeFormat(JK.locale, o).format(d); } catch (e) { return d.toDateString(); } }
  function post(action, data) {
    data.lang = JK.lang;
    return fetch("api.php?a=" + action, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
      .then(function (r) { return r.json().catch(function () { return { error: "server" }; }); });
  }

  /* Kopfbereich füllt genau das Fenster unter der Kopfzeile – auf jedem Bildschirm */
  var heroEl = $("#hero");
  function fitHero() {
    if (!heroEl) return;
    var top = heroEl.getBoundingClientRect().top + window.scrollY;
    root.style.setProperty("--hero-h", Math.max(0, window.innerHeight - top) + "px");
  }
  fitHero();
  window.addEventListener("resize", fitHero);
  window.addEventListener("orientationchange", fitHero);

  /* ---------- Menü ---------- */
  var burger = $(".burger"), nav = $("#nav");
  if (burger && nav) burger.addEventListener("click", function () {
    burger.setAttribute("aria-expanded", String(nav.classList.toggle("open")));
  });

  /* Wichtel im Menü: die Mützenspitze schwingt von rechts über oben nach links und zurück.
     Am Computer beim Darüberfahren, am Handy solange das Menü offen ist und beim Antippen. */
  var gnomes = $$(".nav-home").map(function (a) {
    var anims = $$("animate.wag", a), running = false;
    var ok = anims.length && !calm && anims[0].beginElement;
    return {
      el: a,
      on: function () { if (ok && !running) { running = true; anims.forEach(function (x) { x.beginElement(); }); } },
      off: function () { if (ok && running) { running = false; anims.forEach(function (x) { x.endElement(); }); } }
    };
  });
  gnomes.forEach(function (g) {
    g.el.addEventListener("mouseenter", g.on); g.el.addEventListener("focus", g.on);
    g.el.addEventListener("mouseleave", function () { if (!(nav && nav.classList.contains("open"))) g.off(); });
    g.el.addEventListener("blur", function () { if (!(nav && nav.classList.contains("open"))) g.off(); });
    g.el.addEventListener("touchstart", g.on, { passive: true });
  });
  if (burger && nav) burger.addEventListener("click", function () {
    var open = nav.classList.contains("open");
    gnomes.forEach(function (g) { if (open) g.on(); else g.off(); });
  });

  /* ---------- Laufband ---------- */
  var ribbon = $("#ribbon");
  if (ribbon && Array.isArray(JK.t.ribbon)) {
    var html = "";
    for (var r = 0; r < 6; r++) JK.t.ribbon.forEach(function (w) { html += "<span>" + esc(w) + "</span>"; });
    ribbon.innerHTML = html;
  }

  /* ---------- Schnee ---------- */
  function snowfall(canvas, opts) {
    if (!canvas || calm || !JK.snow) return;
    var ctx = canvas.getContext("2d"), flakes = [], w = 0, h = 0, raf = 0, running = false, visible = false, last = 0;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    function make(anywhere) {
      var z = Math.random();
      return { x: Math.random() * w, y: anywhere ? Math.random() * h : -10, z: z, r: 1 + z * 2.8, v: 14 + z * 38, ph: Math.random() * 6.28, sw: .4 + Math.random() * .9 };
    }
    function size() {
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = opts.color;
      var n = Math.round(Math.min(opts.max, w * h / opts.area));
      while (flakes.length < n) flakes.push(make(true));
      flakes.length = n;
    }
    function frame(now) {
      raf = 0;
      if (!running) return;
      var dt = Math.min(.05, (now - last) / 1000 || 0); last = now;
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < flakes.length; i++) {
        var f = flakes[i];
        f.ph += dt * f.sw; f.y += f.v * dt; f.x += (Math.sin(f.ph) * 14 + 8) * dt * (.4 + f.z);
        if (f.y > h + 8 || f.x > w + 8) { flakes[i] = f = make(false); if (Math.random() < .3) { f.x = -6; f.y = Math.random() * h; } }
        ctx.globalAlpha = (.35 + f.z * .6) * opts.alpha;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.2832); ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    }
    function sync() {
      var should = visible && !doc.hidden;
      if (should && !running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
      if (!should) { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
    }
    size();
    window.addEventListener("resize", size);
    doc.addEventListener("visibilitychange", sync);
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; sync(); }).observe(canvas);
  }
  snowfall($("#snow"), { max: 150, area: 9000, alpha: 1, color: "#ffffff" });
  snowfall($("#snow2"), { max: 90, area: 14000, alpha: .7, color: "#fff6dc" });

  /* ---------- Truck & Glocke ---------- */
  var truck = $("#truck");
  if (truck) truck.addEventListener("click", function () { truck.classList.remove("honk"); void truck.offsetWidth; truck.classList.add("honk"); });
  var bell = $("#bell"), bellAudio = null;
  if (bell) bell.addEventListener("click", function () {
    bell.classList.remove("ring"); void bell.offsetWidth; bell.classList.add("ring");
    if (!bellAudio) { bellAudio = new Audio("glocke.mp3"); bellAudio.volume = .6; }
    try { bellAudio.currentTime = 0; bellAudio.play().catch(function () {}); } catch (e) {}
  });
  requestAnimationFrame(function () { requestAnimationFrame(function () { root.classList.add("ready"); }); });

  /* ---------- Einblenden beim Scrollen ---------- */
  var revealer = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); revealer.unobserve(e.target); } });
  }, { threshold: .1, rootMargin: "0px 0px -5% 0px" });
  function watchReveal(scope) {
    $$(".reveal:not(.in)", scope).forEach(function (el) {
      var sibs = el.parentElement ? $$(":scope > .reveal", el.parentElement) : [el];
      el.style.setProperty("--rd", Math.min(sibs.indexOf(el), 6) * .08 + "s");
      revealer.observe(el);
    });
  }
  watchReveal(doc);

  /* 85 % hochzählen */
  var sealNum = $("#sealNum");
  if (sealNum && !calm) new IntersectionObserver(function (es, ob) {
    if (!es[0].isIntersecting) return;
    ob.disconnect();
    var t0 = performance.now();
    (function step(now) {
      var p = Math.min(1, (now - t0) / 1600);
      sealNum.textContent = Math.round(85 * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }, { threshold: .5 }).observe(sealNum);

  /* ---------- Countdown ---------- */
  var count = $("#count");
  if (count) {
    var target = new Date(count.getAttribute("data-target")), nums = {}, timer = 0;
    $$(".count-num", count).forEach(function (n) { nums[n.getAttribute("data-u")] = n; });
    var put = function (u, v) {
      var el = nums[u];
      if (el.textContent === v) return;
      el.textContent = v;
      if (!calm) { el.classList.remove("tick"); void el.offsetWidth; el.classList.add("tick"); }
    };
    var tick = function () {
      var ms = target - (Date.now() + offset);
      if (ms <= 0) { clearInterval(timer); setTimeout(function () { location.reload(); }, 1500); return; }
      var s = Math.floor(ms / 1000);
      put("d", String(Math.floor(s / 86400)));
      put("h", String(Math.floor(s % 86400 / 3600)).padStart(2, "0"));
      put("m", String(Math.floor(s % 3600 / 60)).padStart(2, "0"));
      put("s", String(s % 60).padStart(2, "0"));
    };
    if (!isNaN(target)) { tick(); timer = setInterval(tick, 1000); }
  }

  /* ---------- Dialoge ---------- */
  $$(".modal").forEach(function (m) {
    m.addEventListener("click", function (e) { if (e.target === m || e.target.closest("[data-close]")) m.close(); });
  });
  var tipEl = null, tipTimer = 0;
  function tip(text) {
    if (!tipEl) { tipEl = doc.createElement("div"); tipEl.className = "cal-tip"; tipEl.setAttribute("role", "status"); doc.body.appendChild(tipEl); }
    tipEl.textContent = text; tipEl.classList.add("on");
    clearTimeout(tipTimer); tipTimer = setTimeout(function () { tipEl.classList.remove("on"); }, 3200);
  }

  /* ---------- Formulare: Frage / Reservierung ---------- */
  function msg(form, text, cls) { var m = $(".form-msg", form); m.textContent = text; m.className = "form-msg" + (cls ? " " + cls : ""); }
  $$("form[data-request]").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var data = { kind: form.getAttribute("data-kind") || "frage", product: Number(form.getAttribute("data-product")) || 0 };
      new FormData(form).forEach(function (v, k) { data[k] = String(v).trim(); });
      if (!data.name) return msg(form, t("form.err.name"), "err");
      if (!data.email && !data.phone) return msg(form, t("form.err.contact"), "err");
      if (!data.message) return msg(form, t("form.err.message"), "err");
      var btn = $('button[type="submit"]', form);
      btn.disabled = true; msg(form, "", "");
      post("request", data).then(function (r) {
        btn.disabled = false;
        if (r.ok) { form.reset(); return msg(form, t("form.ok"), "ok"); }
        msg(form, JK.t["form.err." + r.error] || t("form.err.server"), "err");
      }).catch(function () { btn.disabled = false; msg(form, t("form.err.server"), "err"); });
    });
  });

  /* ---------- Galerie ---------- */
  var zoom = $("#zoomModal");
  if (zoom) doc.addEventListener("click", function (e) {
    var a = e.target.closest("[data-zoom]");
    if (!a) return;
    e.preventDefault();
    $("#zoomImg").src = a.getAttribute("href");
    $("#zoomCap").textContent = a.getAttribute("data-caption") || "";
    zoom.showModal();
  });

  /* ---------- Warenkorb (liegt im Browser des Besuchers) ---------- */
  var cart = {};
  try { cart = JSON.parse(store.get("jk-cart") || "{}") || {}; } catch (e) { cart = {}; }
  if (JK.clearCart) { cart = {}; store.set("jk-cart", "{}"); }
  function saveCart() { store.set("jk-cart", JSON.stringify(cart)); badge(); }
  function badge() {
    var n = 0, el = $("#cartCount");
    Object.keys(cart).forEach(function (k) { n += cart[k]; });
    if (el) { el.textContent = n; el.hidden = !n; }
  }
  badge();
  doc.addEventListener("click", function (e) {
    var b = e.target.closest("[data-add]");
    if (!b) return;
    var id = b.getAttribute("data-add"), q = 1, sel = b.getAttribute("data-qty");
    if (sel && $(sel)) q = Math.max(1, Math.min(99, parseInt($(sel).value, 10) || 1));
    cart[id] = Math.min(99, (cart[id] || 0) + q);
    saveCart();
    tip(t("shop.added"));
    var link = $(".cart-link");
    if (link) { link.classList.remove("bump"); void link.offsetWidth; link.classList.add("bump"); }
  });

  /* Warenkorb- und Bestellseite */
  var checkout = $("#checkout");
  if (checkout) {
    var form = $("#orderForm"), state = null, delivery = store.get("jk-delivery") || "pickup", payment = "";
    var load = function () {
      post("cart", { items: cart, delivery: delivery }).then(function (c) {
        if (c.error) return;
        state = c;
        var fresh = {};
        c.lines.forEach(function (l) { fresh[l.id] = l.qty; });
        var was = JSON.stringify(cart);
        cart = fresh; saveCart();
        delivery = c.delivery;
        $("#cartEmpty").hidden = c.lines.length > 0;
        checkout.hidden = !c.lines.length;
        if (!c.lines.length) return;
        $("#cartNote").textContent = (c.changed && was !== "{}" ? t("cart.changed") + " " : "") + (c.pickup_only ? t("cart.pickupOnly") : "");
        $("#cartLines").innerHTML = c.lines.map(function (l) {
          return '<div class="line"><img src="' + esc(l.image || "assets/img/mere.webp") + '" alt=""><div class="line-main"><a href="./?s=vare&amp;id=' + l.id + '">' + esc(l.name) + "</a><small>" + esc(money(l.price)) + "</small></div>" +
            '<input type="number" min="1" max="' + l.max + '" value="' + l.qty + '" data-line="' + l.id + '" aria-label="' + esc(t("shop.qty")) + '"><b>' + esc(money(l.total)) + "</b>" +
            '<button type="button" class="line-x" data-del="' + l.id + '" aria-label="' + esc(t("cart.remove")) + '">×</button></div>';
        }).join("");
        $("#cartSums").innerHTML = "<dt>" + esc(t("cart.subtotal")) + "</dt><dd>" + esc(money(c.subtotal)) + "</dd>" +
          "<dt>" + esc(t("cart.shipping")) + "</dt><dd>" + (c.delivery === "pickup" ? "–" : c.shipping ? esc(money(c.shipping)) : esc(t("cart.free"))) + "</dd>" +
          '<dt class="sum">' + esc(t("cart.total")) + '</dt><dd class="sum">' + esc(money(c.total)) + "<small>" + esc(eur(c.total)) + "</small></dd>";
        var opts = [["pickup", 0], ["dk", c.ship_dk], ["de", c.ship_de]];
        $("#deliveryChoices").innerHTML = opts.map(function (o) {
          var dis = c.pickup_only && o[0] !== "pickup";
          return '<label class="choice' + (dis ? " off" : "") + '"><input type="radio" name="delivery" value="' + o[0] + '"' + (o[0] === c.delivery ? " checked" : "") + (dis ? " disabled" : "") + "><span>" +
            esc(t("checkout.d." + o[0])) + "<b>" + (o[0] === "pickup" || !o[1] ? esc(t("cart.free")) : esc(money(o[1]))) + "</b></span></label>";
        }).join("");
        if (c.payments.indexOf(payment) < 0) payment = c.payments[0] || "";
        $("#paymentChoices").innerHTML = c.payments.map(function (p) {
          return '<label class="choice"><input type="radio" name="payment" value="' + p + '"' + (p === payment ? " checked" : "") + "><span>" + esc(t("checkout.p." + p)) + "</span></label>";
        }).join("");
        $("#addressFields").hidden = c.delivery === "pickup";
        $('button[type="submit"]', form).disabled = !c.shop_on || !c.payments.length;
        if (!c.shop_on) msg(form, t("checkout.err.off"), "err");
      });
    };
    checkout.addEventListener("change", function (e) {
      var el = e.target;
      if (el.name === "delivery") { delivery = el.value; store.set("jk-delivery", delivery); load(); }
      if (el.name === "payment") payment = el.value;
      if (el.hasAttribute("data-line")) { cart[el.getAttribute("data-line")] = Math.max(1, parseInt(el.value, 10) || 1); saveCart(); load(); }
    });
    checkout.addEventListener("click", function (e) {
      var b = e.target.closest("[data-del]");
      if (b) { delete cart[b.getAttribute("data-del")]; saveCart(); load(); }
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var data = { items: cart, delivery: delivery, payment: payment };
      new FormData(form).forEach(function (v, k) { if (k !== "delivery" && k !== "payment") data[k] = String(v).trim(); });
      data.terms = $('input[name="terms"]', form).checked;
      var err = !data.name ? "name" : !/^\S+@\S+\.\S+$/.test(data.email || "") ? "email" : (delivery !== "pickup" && (!data.street || !data.zip || !data.city)) ? "address" : !payment ? "payment" : !data.terms ? "terms" : "";
      if (err) return msg(form, t("checkout.err." + err), "err");
      var btn = $('button[type="submit"]', form);
      btn.disabled = true; msg(form, "", "");
      post("order", data).then(function (r) {
        if (r.ok) { location.href = r.url; return; }
        btn.disabled = false;
        msg(form, JK.t["checkout.err." + r.error] || t("checkout.err.server"), "err");
        if (r.error === "changed") load();
      }).catch(function () { btn.disabled = false; msg(form, t("checkout.err.server"), "err"); });
    });
    load();
  }

  /* ---------- Adventskalender ---------- */
  var calEl = $("#cal"), cal = JK.calendar;
  if (calEl && cal) {
    /* Reihenfolge und Aussehen der 24 Türchen (wie bei einem gedruckten Kalender bunt gemischt) */
    var DOORS = [
      [7, "p-red s-stripes", ""], [18, "p-cream s-dots", "w2"], [3, "p-pine s-frame", ""], [11, "p-gold", "h2"], [22, "p-dark s-zig", ""],
      [1, "p-cream s-frame", "h2"], [14, "p-red s-plaid", ""], [9, "p-dark s-dots", ""], [20, "p-pine s-stripes", "w2"],
      [5, "p-gold s-zig", ""], [24, "p-red s-frame", "w2 h2 big"], [16, "p-cream s-stripes", ""], [2, "p-pine s-dots", ""],
      [12, "p-dark s-frame", "w2"], [19, "p-red s-dots", "h2"], [8, "p-cream s-plaid", ""], [23, "p-gold s-stripes", ""],
      [4, "p-red s-zig", "w2"], [15, "p-pine s-plaid", ""], [10, "p-cream s-zig", "h2"], [21, "p-dark s-stripes", ""],
      [6, "p-pine s-frame", "w2"], [13, "p-red", ""], [17, "p-gold s-dots", ""]
    ];
    var DECO = [
      '<path d="M12 1l2.800 7.300L22 9.200l-5.600 4.900L18.200 22 12 17.700 5.800 22l1.800-7.900L2 9.200l7.200-.900z"/>',
      '<path d="M12 21C5 15.500 2 12 2 8a5 5 0 0 1 10-1.500A5 5 0 0 1 22 8c0 4-3 7.500-10 13z"/>',
      '<path d="M12 1l5 7h-3l5 6h-3.500l5 6h-7v3h-3v-3h-7l5-6H5l5-6H7z"/>',
      '<path d="M12 2a2 2 0 0 1 2 2v.600A6.500 6.500 0 0 1 18.500 11c0 4 1.500 5.500 2.500 6.500H3c1-1 2.500-2.500 2.500-6.500A6.500 6.500 0 0 1 10 4.600V4a2 2 0 0 1 2-2zm-2.500 17.500h5a2.500 2.500 0 0 1-5 0z"/>',
      '<path d="M11 2h2v6.300l5.500-3.200 1 1.800L14 10l5.500 3.100-1 1.800L13 11.700V18h-2v-6.300l-5.500 3.200-1-1.800L10 10 4.500 6.900l1-1.800L11 8.300zM11 18h2v4h-2z"/>'
    ];
    var opened = {};
    try { opened = JSON.parse(store.get("jk-doors") || "{}") || {}; } catch (e) { opened = {}; }
    var key = cal.year + (cal.preview ? "p" : ""), mine = opened[key] || {}, st = {};
    cal.doors.forEach(function (d) { st[d.day] = d; });
    calEl.innerHTML = DOORS.map(function (d, i) {
      var n = d[0], s = st[n] || {}, was = s.open && mine[n];
      return '<button type="button" class="door reveal ' + d[2] + (s.open ? " can" : "") + (was ? " opened" : "") + '" data-day="' + n + '" style="--kd:-' + (i * .41 % 3.4).toFixed(2) + 's" aria-label="' +
        esc(t(s.open ? "cal.doorOpen" : "cal.doorLocked", { n: n })) + '"><span class="door-in"><svg viewBox="0 0 24 24">' + DECO[n % DECO.length] + "</svg></span>" +
        '<span class="door-front ' + d[1] + '"><svg class="door-deco a" viewBox="0 0 24 24">' + DECO[i % DECO.length] + "</svg>" +
        (d[2] ? '<svg class="door-deco b" viewBox="0 0 24 24">' + DECO[(i + 2) % DECO.length] + "</svg>" : "") + '<span class="door-num">' + n + "</span></span></button>";
    }).join("");
    watchReveal(calEl);
    calEl.addEventListener("click", function (e) {
      var b = e.target.closest(".door");
      if (!b) return;
      var n = Number(b.getAttribute("data-day"));
      if (!(st[n] || {}).open) {
        b.classList.remove("nope"); void b.offsetWidth; b.classList.add("nope");
        return tip(t("cal.locked", { date: fmtDate(new Date(cal.year, 11, n), { day: "numeric", month: "long", year: "numeric" }) }));
      }
      var first = !b.classList.contains("opened");
      b.classList.add("opened");
      opened[key] = opened[key] || {}; opened[key][n] = 1; store.set("jk-doors", JSON.stringify(opened));
      var wait = new Promise(function (res) { setTimeout(res, first && !calm ? 750 : 0); });
      var get = fetch("api.php?a=door&day=" + n).then(function (r) { if (!r.ok) throw new Error(); return r.json(); });
      Promise.all([get, wait]).then(function (r) {
        var d = r[0], title = tr(d.title), text = tr(d.text);
        if (!d.filled) { title = t("cal.emptyTitle", { n: d.day }); text = t("cal.emptyText"); }
        $("#doorDay").textContent = d.day;
        $("#doorTitle").textContent = title; $("#doorTitle").hidden = !title;
        $("#doorText").textContent = text; $("#doorText").hidden = !text;
        var img = $("#doorImg"); img.hidden = !d.image; img.innerHTML = d.image ? '<img src="' + esc(d.image) + '" alt="">' : "";
        var code = $("#doorCode"); code.hidden = !d.code; $("b", code).textContent = d.code || "";
        var link = $("#doorLink"); link.hidden = !d.link; if (d.link) link.href = d.link;
        $("#doorModal").showModal();
      }).catch(function () { tip(t("cal.error")); });
    });
  }
})();
