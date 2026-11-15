/* Julekontor – Website: Sprache, Schnee, Lichterkette, Countdown, Adventskalender, Anfragen. */
(function () {
  "use strict";
  var doc = document, root = doc.documentElement;
  var $ = function (s, el) { return (el || doc).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || doc).querySelectorAll(s)); };
  var I18N = window.JK_I18N || {};
  var LANGS = ["da", "de", "en"];
  var LOCALE = { da: "da-DK", de: "de-DE", en: "en-GB" };
  var calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var store = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
                set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  var params = new URLSearchParams(location.search);
  var preview = params.get("vorschau") || "";
  var site = null, lang = "da";

  root.classList.add("js");

  /* ---------- Sprache ---------- */
  function pickLang() {
    var q = params.get("lang"), s = store.get("jk-lang");
    if (LANGS.indexOf(q) >= 0) return q;
    if (LANGS.indexOf(s) >= 0) return s;
    var nav = (navigator.languages || [navigator.language || "da"]);
    for (var i = 0; i < nav.length; i++) {
      var c = String(nav[i]).slice(0, 2).toLowerCase();
      if (c === "nb" || c === "no" || c === "sv") return "da";
      if (LANGS.indexOf(c) >= 0) return c;
    }
    return "da";
  }
  function t(key, vars) {
    var s = (I18N[lang] && I18N[lang][key]) || (I18N.da && I18N.da[key]) || key;
    if (vars && typeof s === "string") Object.keys(vars).forEach(function (k) { s = s.split("{" + k + "}").join(vars[k]); });
    return s;
  }
  /* Text in der gewählten Sprache; fehlt er, den ersten ausgefüllten nehmen */
  function tr(obj) {
    if (!obj) return "";
    if (obj[lang]) return obj[lang];
    for (var i = 0; i < LANGS.length; i++) if (obj[LANGS[i]]) return obj[LANGS[i]];
    return "";
  }
  function setLang(l, save) {
    lang = l;
    root.lang = l;
    if (save) store.set("jk-lang", l);
    doc.title = t("meta.title");
    $$("[data-i18n]").forEach(function (el) { el.textContent = t(el.getAttribute("data-i18n")); });
    $$(".lang button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-lang") === l)); });
    $$("[data-close]").forEach(function (b) { b.setAttribute("aria-label", t("close")); });
    $("#bell").setAttribute("aria-label", t("bell"));
    buildRibbon();
    if (site) renderSite();
  }
  $$(".lang button").forEach(function (b) { b.addEventListener("click", function () { setLang(b.getAttribute("data-lang"), true); }); });

  /* ---------- Menü ---------- */
  var burger = $(".burger"), nav = $("#nav");
  burger.addEventListener("click", function () {
    var o = nav.classList.toggle("open");
    burger.setAttribute("aria-expanded", String(o));
  });
  nav.addEventListener("click", function (e) { if (e.target.tagName === "A") { nav.classList.remove("open"); burger.setAttribute("aria-expanded", "false"); } });

  /* ---------- Laufband ---------- */
  function buildRibbon() {
    var words = t("ribbon"), el = $("#ribbon");
    if (!Array.isArray(words)) return;
    var html = "";
    for (var r = 0; r < 6; r++) words.forEach(function (w) { html += "<span>" + esc(w) + "</span>"; });
    el.innerHTML = html;
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  /* ---------- Lichterkette ---------- */
  var BULBS = ["#f2b632", "#d9362b", "#2f8a52", "#fff1c2", "#e0762a"];
  function buildGarland() {
    var box = $("#garland"), w = Math.max(320, box.clientWidth), h = 120;
    var swag = w < 700 ? 150 : 210, n = Math.max(2, Math.round(w / swag)), step = w / n;
    var d = "M0 10", bulbs = "", twigs = "", k = 0;
    for (var i = 0; i < n; i++) {
      var x0 = i * step, x1 = x0 + step, dip = 44 + (i % 2) * 12;
      d += " Q" + (x0 + step / 2).toFixed(1) + " " + (10 + dip * 2) + " " + x1.toFixed(1) + " 10";
      var count = Math.max(4, Math.round(step / 36));
      for (var q = 0; q <= step; q += 5) {
        var uu = q / step, tx = x0 + q, ty = 10 + 2 * dip * 2 * uu * (1 - uu), sl = 4 * dip * (1 - 2 * uu) / step;
        var ang = Math.atan(sl) * 57.3, r1 = ((q * 37 + i * 91) % 50) - 25, len = 9 + ((q * 13 + i * 7) % 8);
        twigs += '<path class="twig' + ((q / 5) % 3 === 0 ? " t2" : "") + '" transform="translate(' + tx.toFixed(1) + " " + ty.toFixed(1) + ") rotate(" + (ang + 62 + r1).toFixed(0) + ')" d="M0 0h' + len + '"/>' +
                 '<path class="twig' + ((q / 5) % 3 === 1 ? " t2" : "") + '" transform="translate(' + tx.toFixed(1) + " " + ty.toFixed(1) + ") rotate(" + (ang - 62 + r1).toFixed(0) + ')" d="M0 0h' + (len - 2) + '"/>' +
                 '<path class="twig" transform="translate(' + tx.toFixed(1) + " " + ty.toFixed(1) + ") rotate(" + (ang + 118 - r1).toFixed(0) + ')" d="M0 0h' + (len - 3) + '"/>';
      }
      for (var j = 1; j < count; j++) {
        var u = j / count, x = x0 + step * u, y = 10 + 2 * dip * 2 * u * (1 - u);
        var c = BULBS[k % BULBS.length], delay = ((k * 0.37) % 2.6).toFixed(2);
        bulbs += '<g transform="translate(' + x.toFixed(1) + " " + (y + 5).toFixed(1) + ')"><g class="bulb" style="--sd:-' + (k * 0.6 % 4.5).toFixed(2) + 's">' +
          '<circle class="halo" style="--d:-' + delay + 's" cy="15" r="17" fill="' + c + '" filter="url(#gb)"/>' +
          '<rect class="cap" x="-3.500" y="0" width="7" height="6" rx="1.500"/>' +
          '<path class="glow" style="--d:-' + delay + 's" d="M0 5c5 0 7.500 5 7.500 10.500S4 25 0 25s-7.500-4-7.500-9.500S-5 5 0 5z" fill="' + c + '"/>' +
          '<path d="M-3 10c-1.500 2-2 4-1.800 6.500" stroke="#fff" stroke-opacity=".7" stroke-width="1.600" fill="none" stroke-linecap="round"/></g></g>';
        k++;
      }
    }
    box.innerHTML = '<svg viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none"><defs><filter id="gb" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="6"/></filter></defs>' +
      '<path class="bough" d="' + d + '"/>' + twigs + bulbs + "</svg>";
  }

  /* ---------- Tannen in der Szene ---------- */
  function buildTrees() {
    var el = $("#trees"), html = "";
    var spots = [[1, 52, 5.5, .5], [8, 58, 7.4, .7], [17, 49, 4.6, .45], [25, 46, 6, .6], [34, 50, 4, .45], [41, 54, 5, .5], [90, 50, 5.6, .5], [96, 44, 7.6, .7]];
    spots.forEach(function (s, i) {
      html += '<svg viewBox="0 0 100 150" style="--x:' + s[0] + "%;--b:" + s[1] + "%;--w:" + s[2] + "%;--o:" + s[3] + ";--sd:-" + (i * 0.7) + 's"><g class="sw">' +
        '<rect x="45" y="126" width="10" height="24" fill="#6b4a3c"/>' +
        '<path d="M50 4l26 44H62l24 38H68l26 42H6l26-42H14l24-38H24z" fill="#2c5a3f"/>' +
        '<path d="M50 4l10 17c-6 3-13 4-20 1zM38 48l24 0 12 19c-14 6-34 6-46-1zM32 86h36l14 22c-20 8-44 8-62 0z" fill="#fffaf0" opacity=".92"/></g></svg>';
    });
    el.innerHTML = html;
  }

  /* ---------- Schnee ---------- */
  function snowfall(canvas, opts) {
    if (!canvas || calm) return { stop: function () {} };
    var ctx = canvas.getContext("2d"), flakes = [], w = 0, h = 0, raf = 0, running = false, visible = false, last = 0;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    function size() {
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = Math.round(Math.min(opts.max, w * h / opts.area));
      while (flakes.length < n) flakes.push(make(true));
      flakes.length = n;
    }
    function make(anywhere) {
      var z = Math.random();
      return { x: Math.random() * w, y: anywhere ? Math.random() * h : -10, z: z, r: 1 + z * 2.8, v: 14 + z * 38, ph: Math.random() * 6.28, sw: .4 + Math.random() * .9 };
    }
    function frame(now) {
      raf = 0;
      if (!running) return;
      var dt = Math.min(.05, (now - last) / 1000 || 0); last = now;
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < flakes.length; i++) {
        var f = flakes[i];
        f.ph += dt * f.sw;
        f.y += f.v * dt; f.x += (Math.sin(f.ph) * 14 + 8) * dt * (.4 + f.z);
        if (f.y > h + 8 || f.x > w + 8) { flakes[i] = f = make(false); if (Math.random() < .3) { f.x = -6; f.y = Math.random() * h; } }
        ctx.globalAlpha = (.35 + f.z * .6) * opts.alpha;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.2832); ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    }
    function sync() {
      var should = visible && !doc.hidden;
      if (should && !running) { running = true; last = performance.now(); ctx.fillStyle = opts.color; raf = requestAnimationFrame(frame); }
      if (!should) { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
    }
    size();
    ctx.fillStyle = opts.color;
    window.addEventListener("resize", function () { size(); ctx.fillStyle = opts.color; });
    doc.addEventListener("visibilitychange", sync);
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; sync(); }).observe(canvas);
    return { stop: function () { visible = false; sync(); ctx.clearRect(0, 0, w, h); } };
  }

  /* ---------- Truck & Glocke ---------- */
  var truck = $("#truck");
  truck.addEventListener("click", function () {
    truck.classList.remove("honk"); void truck.offsetWidth; truck.classList.add("honk");
  });
  var bell = $("#bell"), bellAudio = null;
  bell.addEventListener("click", function () {
    bell.classList.remove("ring"); void bell.offsetWidth; bell.classList.add("ring");
    if (!bellAudio) { bellAudio = new Audio("glocke.mp3"); bellAudio.volume = .6; }
    try { bellAudio.currentTime = 0; bellAudio.play().catch(function () {}); } catch (e) {}
  });

  /* Leichte Tiefenwirkung beim Scrollen */
  var hills = $$(".hills-back, .trees, .hills-mid"), ticking = false;
  if (!calm) window.addEventListener("scroll", function () {
    if (ticking) return; ticking = true;
    requestAnimationFrame(function () {
      var y = Math.min(window.scrollY, 900);
      hills[0].style.transform = "translateY(" + y * .12 + "px)";
      hills[1].style.transform = "translateY(" + y * .1 + "px)";
      hills[2].style.transform = "translateY(" + y * .05 + "px)";
      ticking = false;
    });
  }, { passive: true });

  /* ---------- Einblenden beim Scrollen ---------- */
  var revealer = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); revealer.unobserve(e.target); } });
  }, { threshold: .12, rootMargin: "0px 0px -6% 0px" });
  function watchReveal(scope) {
    $$(".reveal:not(.in)", scope).forEach(function (el, i) {
      var sibs = el.parentElement ? $$(":scope > .reveal", el.parentElement) : [el];
      el.style.setProperty("--rd", Math.min(sibs.indexOf(el), 6) * .09 + "s");
      revealer.observe(el);
    });
  }

  /* 85 % hochzählen */
  var sealNum = $("#sealNum");
  new IntersectionObserver(function (es, ob) {
    if (!es[0].isIntersecting) return;
    ob.disconnect();
    if (calm) return;
    var t0 = performance.now();
    (function step(now) {
      var p = Math.min(1, (now - t0) / 1600), e = 1 - Math.pow(1 - p, 3);
      sealNum.textContent = Math.round(85 * e);
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }, { threshold: .5 }).observe(sealNum);

  /* Aktiven Menüpunkt markieren */
  var links = $$(".top-nav a");
  var spy = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      links.forEach(function (a) { a.classList.toggle("on", a.getAttribute("href") === "#" + e.target.id); });
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  $$("main section[id]").forEach(function (s) { spy.observe(s); });

  /* ---------- Countdown ---------- */
  var timer = 0, offset = 0;
  function fmtDate(d, opts) { try { return new Intl.DateTimeFormat(LOCALE[lang], opts).format(d); } catch (e) { return d.toDateString(); } }
  function renderCountdown() {
    clearInterval(timer);
    var box = $("#count"), open = $("#openNow");
    if (!site.countdown) { box.hidden = true; open.hidden = true; return; }
    var target = new Date(site.countdown);
    if (isNaN(target)) { box.hidden = true; return; }
    $("#countLabel").textContent = t("hero.opens", { date: fmtDate(target, { day: "numeric", month: "long", year: "numeric" }) });
    var nums = {}; $$(".count-num").forEach(function (n) { nums[n.getAttribute("data-u")] = n; });
    function put(u, v) {
      var el = nums[u];
      if (el.textContent === v) return;
      el.textContent = v;
      if (!calm) { el.classList.remove("tick"); void el.offsetWidth; el.classList.add("tick"); }
    }
    function tick() {
      var ms = target - (Date.now() + offset);
      if (ms <= 0) { clearInterval(timer); box.hidden = true; open.hidden = false; return; }
      var s = Math.floor(ms / 1000);
      put("d", String(Math.floor(s / 86400)));
      put("h", String(Math.floor(s % 86400 / 3600)).padStart(2, "0"));
      put("m", String(Math.floor(s % 3600 / 60)).padStart(2, "0"));
      put("s", String(s % 60).padStart(2, "0"));
      box.hidden = false; open.hidden = true;
    }
    tick(); timer = setInterval(tick, 1000);
  }

  /* ---------- Besuch: Adresse, Zeiten ---------- */
  var ICON = {
    pin: '<svg viewBox="0 0 24 24"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.500C5 14.800 12 21 12 21z"/><circle cx="12" cy="9.500" r="2.500"/></svg>',
    tel: '<svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.500 1.500a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>',
    mail: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 7l9 6 9-6"/></svg>',
    ext: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>'
  };
  function renderVisit() {
    var c = site.contact || {};
    $("#address").innerHTML = "<strong>Julekontor</strong>" + (c.street ? esc(c.street) + "<br>" : "") + esc(c.city || "");
    var maps = c.maps || "https://www.openstreetmap.org/search?query=" + encodeURIComponent([c.street, c.city, "Danmark"].filter(Boolean).join(", "));
    var l = '<a href="' + esc(maps) + '" target="_blank" rel="noopener">' + ICON.pin + esc(t("visit.route")) + "</a>";
    if (c.phone) l += '<a href="tel:' + esc(c.phone.replace(/[^0-9+]/g, "")) + '">' + ICON.tel + esc(c.phone) + "</a>";
    if (c.email) l += '<a href="mailto:' + esc(c.email) + '">' + ICON.mail + esc(c.email) + "</a>";
    if (c.facebook) l += '<a href="' + esc(c.facebook) + '" target="_blank" rel="noopener">' + ICON.ext + "Facebook</a>";
    if (c.instagram) l += '<a href="' + esc(c.instagram) + '" target="_blank" rel="noopener">' + ICON.ext + "Instagram</a>";
    $("#visitLinks").innerHTML = l;

    var h = site.hours || {}, days = h.days || [], box = $("#hours"), html = "";
    if (days.length === 7) {
      var names = t("visit.daysLong"), today = (new Date(Date.now() + offset).getDay() + 6) % 7;
      html = '<table class="hours">';
      days.forEach(function (d, i) {
        html += "<tr" + (i === today ? ' class="today"' : "") + "><td>" + esc(names[i]) + "</td><td>" + (d.closed ? esc(t("visit.closed")) : esc(d.open) + " – " + esc(d.close)) + "</td></tr>";
      });
      html += "</table>";
    } else html = '<p class="soon">' + esc(t("visit.hoursSoon")) + "</p>";
    var note = tr(h.note);
    if (note) html += '<p class="hours-note">' + esc(note) + "</p>";
    box.innerHTML = html;

    $("#footLine").innerHTML = "© " + new Date().getFullYear() + " Julekontor · " + esc([c.street, c.city].filter(Boolean).join(", ")) + (c.cvr ? " · CVR " + esc(c.cvr) : "");
    $("#contactForm").hidden = !site.requests;
  }

  /* ---------- Aus den Regalen ---------- */
  var GIFT = '<svg viewBox="0 0 24 24"><path d="M3 9h18v4H3zM5 13h14v8H5zM11 9h2v12h-2zM12 9C9 9 7 7.500 7 5.800 7 4.500 8 4 9 4c1.800 0 3 2.500 3 5zm0 0c3 0 5-1.500 5-3.200C17 4.500 16 4 15 4c-1.800 0-3 2.500-3 5z"/></svg>';
  function money(cents) {
    try { return new Intl.NumberFormat(LOCALE[lang], { style: "currency", currency: site.currency || "DKK" }).format(cents / 100); }
    catch (e) { return (cents / 100).toFixed(2) + " " + (site.currency || "DKK"); }
  }
  function renderShelf() {
    var sec = $("#hylder"), list = site.products || [];
    sec.hidden = !list.length;
    if (!list.length) return;
    $("#shelf").innerHTML = list.map(function (p) {
      return '<article class="item reveal">' +
        (p.kit ? '<span class="tag">' + esc(t("shelf.kit")) + "</span>" : "") +
        (p.soldOut ? '<span class="tag out">' + esc(t("shelf.soldout")) + "</span>" : "") +
        '<div class="item-img">' + (p.image ? '<img src="' + esc(p.image) + '" alt="" loading="lazy" width="480" height="480">' : GIFT) + "</div>" +
        "<h3>" + esc(p.name) + "</h3>" + (p.text ? "<p>" + esc(p.text) + "</p>" : "") +
        '<div class="item-foot"><span class="price">' + (p.price === null ? "<small>" + esc(t("shelf.priceAsk")) + "</small>" : esc(money(p.price))) + "</span>" +
        (site.requests ? '<button class="btn" type="button" data-req="' + p.id + '">' + esc(t("shelf.ask")) + "</button>" : "") + "</div></article>";
    }).join("");
    watchReveal(sec);
  }
  doc.addEventListener("click", function (e) {
    var b = e.target.closest("[data-req]");
    if (!b) return;
    var p = (site.products || []).filter(function (x) { return String(x.id) === b.getAttribute("data-req"); })[0];
    if (!p) return;
    var f = $("#reqForm");
    f.dataset.product = p.id;
    $("#reqTitle").textContent = p.name;
    var first = $('input[value="reservierung"]', f);
    first.nextElementSibling.textContent = p.kit ? t("req.kit") : t("req.reserve");
    first.value = p.kit ? "bausatz" : "reservierung";
    first.checked = true;
    msg(f, "", "");
    $("#reqModal").showModal();
  });

  /* ---------- Formulare ---------- */
  function msg(form, text, cls) { var m = $(".form-msg", form); m.textContent = text; m.className = "form-msg" + (cls ? " " + cls : ""); }
  function wireForm(form, extra) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(form), data = { lang: lang };
      fd.forEach(function (v, k) { data[k] = String(v).trim(); });
      Object.assign(data, extra ? extra() : {});
      if (!data.name) return msg(form, t("form.err.name"), "err");
      if (!data.email && !data.phone) return msg(form, t("form.err.contact"), "err");
      if (!data.product && !data.message) return msg(form, t("form.err.message"), "err");
      var btn = $('button[type="submit"]', form);
      btn.disabled = true; msg(form, "", "");
      fetch("api.php?a=request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
        .then(function (r) { return r.json().catch(function () { return { error: "server" }; }); })
        .then(function (r) {
          btn.disabled = false;
          if (r.ok) { form.reset(); msg(form, t("form.ok"), "ok"); return; }
          var key = "form.err." + r.error;
          msg(form, I18N.da[key] ? t(key) : t("form.err.server"), "err");
        })
        .catch(function () { btn.disabled = false; msg(form, t("form.err.server"), "err"); });
    });
  }
  wireForm($("#contactForm"), function () { return { kind: "frage" }; });
  wireForm($("#reqForm"), function () { return { product: Number($("#reqForm").dataset.product) || 0 }; });

  $$(".modal").forEach(function (m) {
    m.addEventListener("click", function (e) { if (e.target === m || e.target.closest("[data-close]")) m.close(); });
  });

  /* ---------- Adventskalender ---------- */
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
    '<path d="M12 1l2.800 7.300L22 9.200l-5.600 4.900L18.200 22 12 17.700 5.800 22l1.800-7.900L2 9.200l7.200-.9z"/>',
    '<path d="M12 21C5 15.500 2 12 2 8a5 5 0 0 1 10-1.500A5 5 0 0 1 22 8c0 4-3 7.500-10 13z"/>',
    '<path d="M12 1l5 7h-3l5 6h-3.500l5 6h-7v3h-3v-3h-7l5-6H5l5-6H7z"/>',
    '<path d="M12 2a2 2 0 0 1 2 2v.600A6.500 6.500 0 0 1 18.500 11c0 4 1.500 5.500 2.500 6.500H3c1-1 2.500-2.500 2.500-6.500A6.500 6.500 0 0 1 10 4.600V4a2 2 0 0 1 2-2zm-2.500 17.500h5a2.500 2.500 0 0 1-5 0z"/>',
    '<path d="M11 2h2v6.300l5.500-3.200 1 1.800L14 10l5.500 3.100-1 1.800L13 11.700V18h-2v-6.300l-5.500 3.200-1-1.800L10 10 4.500 6.900l1-1.800L11 8.300zM11 18h2v4h-2z"/>'
  ];
  var opened = {};
  try { opened = JSON.parse(store.get("jk-doors") || "{}") || {}; } catch (e) { opened = {}; }

  function renderCalendar() {
    var sec = $("#kalender"), cal = site.calendar;
    sec.hidden = !cal;
    $$('a[href="#kalender"]').forEach(function (a) { a.hidden = !cal; });
    if (!cal) return;
    var state = {}; cal.doors.forEach(function (d) { state[d.day] = d; });
    var anyOpen = cal.doors.some(function (d) { return d.open; }), allOpen = cal.doors.every(function (d) { return d.open; });
    $("#calLead").textContent = t(allOpen ? "cal.leadAfter" : anyOpen ? "cal.leadDuring" : "cal.leadBefore", { year: cal.year });
    $("#calPreview").hidden = !cal.preview;
    var key = cal.year + (cal.preview ? "p" : "");
    var mine = opened[key] || {};
    $("#cal").innerHTML = DOORS.map(function (d, i) {
      var n = d[0], st = state[n] || {}, was = st.open && mine[n];
      return '<button type="button" class="door reveal ' + d[2] + (st.open ? " can" : "") + (was ? " opened" : "") + '" data-day="' + n + '" style="--kd:-' + (i * .41 % 3.4).toFixed(2) + 's" aria-label="' +
        esc(t(st.open ? "cal.doorOpen" : "cal.doorLocked", { n: n })) + '">' +
        '<span class="door-in"><svg viewBox="0 0 24 24">' + DECO[n % DECO.length] + "</svg></span>" +
        '<span class="door-front ' + d[1] + '"><svg class="door-deco a" viewBox="0 0 24 24">' + DECO[i % DECO.length] + "</svg>" +
        (d[2] ? '<svg class="door-deco b" viewBox="0 0 24 24">' + DECO[(i + 2) % DECO.length] + "</svg>" : "") +
        '<span class="door-num">' + n + "</span></span></button>";
    }).join("");
    watchReveal(sec);
  }
  var tipEl = null, tipTimer = 0;
  function tip(text) {
    if (!tipEl) { tipEl = doc.createElement("div"); tipEl.className = "cal-tip"; tipEl.setAttribute("role", "status"); doc.body.appendChild(tipEl); }
    tipEl.textContent = text; tipEl.classList.add("on");
    clearTimeout(tipTimer); tipTimer = setTimeout(function () { tipEl.classList.remove("on"); }, 3200);
  }
  $("#cal").addEventListener("click", function (e) {
    var b = e.target.closest(".door");
    if (!b || !site.calendar) return;
    var n = Number(b.getAttribute("data-day")), cal = site.calendar;
    var st = cal.doors.filter(function (d) { return d.day === n; })[0] || {};
    if (!st.open) {
      b.classList.remove("nope"); void b.offsetWidth; b.classList.add("nope");
      tip(t("cal.locked", { date: fmtDate(new Date(cal.year, 11, n), { day: "numeric", month: "long", year: "numeric" }) }));
      return;
    }
    var first = !b.classList.contains("opened");
    b.classList.add("opened");
    var key = cal.year + (cal.preview ? "p" : "");
    opened[key] = opened[key] || {}; opened[key][n] = 1; store.set("jk-doors", JSON.stringify(opened));
    var wait = new Promise(function (res) { setTimeout(res, first && !calm ? 750 : 0); });
    var load = fetch("api.php?a=door&day=" + n + (preview ? "&pv=" + encodeURIComponent(preview) : "")).then(function (r) { if (!r.ok) throw new Error(); return r.json(); });
    Promise.all([load, wait]).then(function (r) { showDoor(r[0]); }).catch(function () { tip(t("cal.error")); });
  });
  function showDoor(d) {
    $("#doorDay").textContent = d.day;
    $("#doorMonth").textContent = t("cal.month");
    var title = tr(d.title), text = tr(d.text);
    if (!d.filled) { title = t("cal.emptyTitle", { n: d.day }); text = t("cal.emptyText"); }
    $("#doorTitle").textContent = title; $("#doorTitle").hidden = !title;
    $("#doorText").textContent = text; $("#doorText").hidden = !text;
    var img = $("#doorImg");
    img.hidden = !d.image; img.innerHTML = d.image ? '<img src="' + esc(d.image) + '" alt="">' : "";
    var code = $("#doorCode"); code.hidden = !d.code; $("b", code).textContent = d.code || "";
    var link = $("#doorLink"); link.hidden = !d.link; if (d.link) link.href = d.link;
    $("#doorModal").showModal();
  }

  /* ---------- Eigene Fotos statt Zeichnungen ---------- */
  function renderImages() {
    var im = site.images || {};
    $$("[data-cat]").forEach(function (el) {
      var src = im[el.getAttribute("data-cat")], img = $("img", el);
      if (src && img && img.getAttribute("src") !== src) img.src = src;
    });
  }

  function renderSite() {
    var hero = tr(site.hero);
    if (hero) $("#heroLine").textContent = hero;
    var n = tr(site.notice), nb = $("#notice");
    nb.hidden = !n; nb.textContent = n;
    renderCountdown(); renderVisit(); renderShelf(); renderCalendar(); renderImages();
  }

  /* ---------- Start ---------- */
  buildGarland(); buildTrees();
  var rz = 0;
  window.addEventListener("resize", function () { clearTimeout(rz); rz = setTimeout(buildGarland, 200); });
  setLang(pickLang(), false);
  watchReveal(doc);
  var snowA = snowfall($("#snow"), { max: 150, area: 9000, alpha: 1, color: "#ffffff" });
  var snowB = null;
  requestAnimationFrame(function () { requestAnimationFrame(function () { root.classList.add("ready"); }); });

  fetch("api.php?a=site" + (preview ? "&pv=" + encodeURIComponent(preview) : ""))
    .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
    .catch(function () {
      /* Ohne Server (z. B. Datei direkt geöffnet): Grundangaben zeigen */
      return { now: new Date().toISOString(), countdown: "2027-11-14T10:00", snow: true, bell: true, hero: {}, notice: {},
               contact: { city: "6330 Padborg / Vilsbæk" }, hours: { days: [], note: {} }, calendar: null, currency: "DKK", requests: false, products: [], images: {} };
    })
    .then(function (s) {
      site = s;
      offset = new Date(s.now) - Date.now();
      if (isNaN(offset) || Math.abs(offset) < 5000) offset = 0;
      $("#bell").hidden = !s.bell;
      if (!s.snow) snowA.stop();
      renderSite();
      if (s.snow && s.calendar) snowB = snowfall($("#snow2"), { max: 90, area: 14000, alpha: .7, color: "#fff6dc" });
      if (location.hash && $(location.hash)) setTimeout(function () { $(location.hash).scrollIntoView(); }, 60);
    });
})();
