/*
 * Wunsch-Fabrik – gemeinsame Spielgrafik
 * ---------------------------------------
 * Alle Figuren der Spiele werden hier mit Canvas als Vektorgrafik gezeichnet
 * (statt Emojis, die auf jedem Gerät anders aussehen). Stil: Lila/Gold,
 * Stichnaht-Kanten, weiches Licht. Die Bilder werden je Größe einmal erzeugt
 * und dann zwischengespeichert.
 *
 *   WFG.sprite(name, px)   → Canvas (px = Kantenlänge in CSS-Pixeln, HiDPI-scharf)
 *   WFG.draw(ctx, name, x, y, px, opt)  → zentriert zeichnen (opt.rot, opt.alpha, opt.flip)
 *   WFG.img(name, px, cls) → '<img …>' für HTML
 *   WFG.url(name, px)      → Daten-URL
 *   WFG.spuli(ctx, x, y, r, t, opt) → Spielfigur „Spuli“ (Garnrolle mit Gesicht)
 *   WFG.nav(opt)           → Leiste „← Wunsch-Fabrik.dk · Alle Spiele“ oben einfügen
 */
(function () {
  'use strict';
  var DPR = Math.min(window.devicePixelRatio || 1, 3);
  var cache = {};

  var C = {
    purple: '#A855F7', deep: '#6D28D9', dark: '#3B1A66', lav: '#D8B4FE', ink: '#1a1224',
    gold: '#F5C542', goldD: '#B8860B', pink: '#EC4899', cyan: '#38BDF8', mint: '#34D399',
    orange: '#FB923C', red: '#EF4444', cream: '#F6EFE3', wood: '#C8763F', woodD: '#8A4A22',
    steel: '#CBD5E1', steelD: '#64748B', white: '#FFFFFF'
  };

  /* ── Hilfen ─────────────────────────────────────────────── */
  function lg(c, x0, y0, x1, y1, stops) {
    var g = c.createLinearGradient(x0, y0, x1, y1);
    stops.forEach(function (s, i) { g.addColorStop(i / (stops.length - 1), s); });
    return g;
  }
  function rg(c, x, y, r0, r1, stops) {
    var g = c.createRadialGradient(x, y, r0, x, y, r1);
    stops.forEach(function (s, i) { g.addColorStop(i / (stops.length - 1), s); });
    return g;
  }
  function rr(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }
  /* Stichnaht entlang des aktuellen Pfads */
  function stitch(c, color, w, dash) {
    c.save(); c.setLineDash(dash || [4, 3.2]); c.lineCap = 'round';
    c.strokeStyle = color || 'rgba(255,255,255,.75)'; c.lineWidth = w || 1.6; c.stroke(); c.restore();
  }
  /* Kleiner Glanzpunkt oben links */
  function shine(c, x, y, w, h) {
    c.save(); c.globalAlpha = .28; c.fillStyle = '#fff';
    c.beginPath(); c.ellipse(x, y, w, h, -0.5, 0, Math.PI * 2); c.fill(); c.restore();
  }
  /* Füllen mit weichem Schatten + dunkler Kante */
  function body(c, fill, edge) {
    c.save(); c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 6; c.shadowOffsetY = 3;
    c.fillStyle = fill; c.fill(); c.restore();
    c.lineWidth = 2; c.strokeStyle = edge || 'rgba(20,10,35,.65)'; c.stroke();
  }
  /* Kleines WF-Abzeichen (Logo-Andeutung) */
  function badge(c, x, y, s, col) {
    c.save(); c.translate(x, y); c.scale(s / 10, s / 10);
    c.fillStyle = col || C.gold;
    c.beginPath(); c.moveTo(-5, -3); c.lineTo(-3, -3); c.lineTo(-1.4, 2); c.lineTo(0, -1); c.lineTo(1.4, 2); c.lineTo(3, -3); c.lineTo(5, -3);
    c.lineTo(2.2, 4); c.lineTo(0, 1); c.lineTo(-2.2, 4); c.closePath(); c.fill(); c.restore();
  }

  /* Garment-Grundform (T-Shirt-artig) – Pfad in 0..100 */
  function shirtPath(c, sleeve, neck) {
    c.beginPath();
    c.moveTo(34, 16); c.quadraticCurveTo(50, neck || 26, 66, 16);
    c.lineTo(86, 24); c.lineTo(sleeve ? 96 : 88, sleeve ? 44 : 40); c.lineTo(78, 47);
    c.lineTo(76, 86); c.quadraticCurveTo(50, 91, 24, 86);
    c.lineTo(22, 47); c.lineTo(sleeve ? 4 : 12, sleeve ? 44 : 40); c.lineTo(14, 24); c.closePath();
  }

  /* ── Die Figuren (Zeichenfläche 100×100) ─────────────────── */
  var D = {};

  D.spool = function (c) {                       // Garnrolle
    c.fillStyle = lg(c, 0, 20, 0, 80, [C.wood, C.woodD]);
    rr(c, 22, 12, 56, 12, 5); body(c, c.fillStyle);
    rr(c, 22, 76, 56, 12, 5); body(c, lg(c, 0, 76, 0, 88, [C.wood, C.woodD]));
    c.fillStyle = lg(c, 30, 0, 70, 0, [C.deep, C.purple, C.lav, C.purple, C.deep]);
    c.fillRect(30, 23, 40, 54);
    c.strokeStyle = 'rgba(30,10,60,.35)'; c.lineWidth = 1.2;
    for (var y = 27; y < 76; y += 4.5) { c.beginPath(); c.moveTo(30, y); c.quadraticCurveTo(50, y + 2.4, 70, y); c.stroke(); }
    c.strokeStyle = C.lav; c.lineWidth = 2.4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(70, 60); c.bezierCurveTo(86, 62, 84, 80, 92, 90); c.stroke();
    shine(c, 40, 34, 4, 12);
  };

  D.needle = function (c) {                      // Nadel mit Faden
    c.save(); c.translate(50, 50); c.rotate(-0.78);
    c.fillStyle = lg(c, -4, 0, 4, 0, [C.steelD, C.white, C.steel]);
    c.beginPath(); c.moveTo(-3.5, -40); c.quadraticCurveTo(0, -44, 3.5, -40); c.lineTo(2.2, 34); c.lineTo(0, 44); c.lineTo(-2.2, 34); c.closePath();
    body(c, c.fillStyle, 'rgba(40,50,70,.7)');
    c.fillStyle = C.ink; c.beginPath(); c.ellipse(0, -33, 1.4, 5, 0, 0, Math.PI * 2); c.fill();
    c.restore();
    c.strokeStyle = C.purple; c.lineWidth = 3; c.lineCap = 'round';
    c.beginPath(); c.moveTo(29, 26); c.bezierCurveTo(10, 40, 30, 70, 18, 88); c.stroke();
    c.strokeStyle = C.lav; c.lineWidth = 1.2; c.stroke();
  };

  D.stick = function (c) {                        // Stickrahmen mit gesticktem Herz
    c.fillStyle = lg(c, 0, 10, 0, 90, [C.wood, C.woodD]);
    c.beginPath(); c.arc(50, 52, 38, 0, Math.PI * 2); body(c, c.fillStyle);
    c.fillStyle = lg(c, 0, 20, 0, 85, ['#2a1f3d', '#191225']);
    c.beginPath(); c.arc(50, 52, 31, 0, Math.PI * 2); c.fill();
    c.fillStyle = C.gold; rr(c, 44, 8, 12, 9, 2); c.fill();
    c.save(); c.translate(50, 54); c.beginPath();
    c.moveTo(0, 14); c.bezierCurveTo(-26, -2, -14, -22, 0, -10); c.bezierCurveTo(14, -22, 26, -2, 0, 14); c.closePath();
    c.fillStyle = lg(c, 0, -18, 0, 14, [C.pink, C.purple]); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1;
    for (var i = -16; i < 16; i += 3) { c.beginPath(); c.moveTo(i, -14); c.lineTo(i + 6, 14); c.stroke(); }
    c.beginPath(); c.moveTo(0, 14); c.bezierCurveTo(-26, -2, -14, -22, 0, -10); c.bezierCurveTo(14, -22, 26, -2, 0, 14); stitch(c, '#fff', 1.4, [2.5, 2.2]);
    c.restore();
    c.strokeStyle = C.steel; c.lineWidth = 2.4; c.beginPath(); c.moveTo(72, 18); c.lineTo(58, 44); c.stroke();
  };

  D.scissors = function (c) {                     // Schere (offen, X-Form)
    c.save(); c.translate(50, 46);
    // Klingen
    [[1, -0.62], [-1, 0.62]].forEach(function (s) {
      c.save(); c.rotate(s[1]);
      c.fillStyle = lg(c, -6, -44, 6, 0, [C.white, C.steel, C.steelD]);
      c.beginPath(); c.moveTo(-4, 4); c.quadraticCurveTo(-6 * s[0], -24, 0, -44); c.quadraticCurveTo(5, -20, 4, 4); c.closePath();
      body(c, c.fillStyle, 'rgba(40,50,70,.75)');
      c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-1, 0); c.lineTo(0, -38); c.stroke();
      c.restore();
    });
    // Griffe
    [[1, -0.62], [-1, 0.62]].forEach(function (s) {
      c.save(); c.rotate(s[1]); c.translate(0, 22);
      c.fillStyle = lg(c, 0, -6, 0, 6, [C.pink, C.purple]); rr(c, -3.5, -14, 7, 12, 3); c.fill();
      c.beginPath(); c.ellipse(0, 6, 10, 12, 0, 0, Math.PI * 2); c.lineWidth = 7;
      c.strokeStyle = lg(c, -10, -6, 10, 18, [C.pink, C.purple]); c.stroke();
      c.lineWidth = 1.2; c.strokeStyle = 'rgba(255,255,255,.6)'; c.setLineDash([2.5, 2]); c.stroke(); c.setLineDash([]);
      c.restore();
    });
    c.fillStyle = lg(c, -4, -4, 4, 4, ['#fde68a', C.goldD]); c.beginPath(); c.arc(0, 4, 4.5, 0, Math.PI * 2); c.fill();
    c.restore();
  };

  D.flex = function (c) {                         // Folienrolle (Flex & Flock)
    c.fillStyle = lg(c, 0, 40, 0, 92, ['#f472b6', '#be185d']);
    c.beginPath(); c.moveTo(30, 52); c.lineTo(88, 52); c.lineTo(80, 90); c.lineTo(22, 90); c.closePath(); body(c, c.fillStyle);
    c.save(); c.beginPath(); c.moveTo(34, 60); c.lineTo(80, 60); c.lineTo(74, 84); c.lineTo(28, 84); c.closePath(); stitch(c, 'rgba(255,255,255,.85)', 1.5, [4, 3]); c.restore();
    c.fillStyle = lg(c, 0, 14, 0, 58, [C.pink, '#9d174d']);
    rr(c, 14, 14, 62, 40, 20); body(c, c.fillStyle);
    c.fillStyle = '#831843'; c.beginPath(); c.ellipse(20, 34, 9, 20, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = C.cream; c.beginPath(); c.ellipse(20, 34, 4, 9, 0, 0, Math.PI * 2); c.fill();
    shine(c, 46, 22, 16, 4);
  };

  D.printer = function (c) {                      // DTF-Drucker
    c.fillStyle = lg(c, 0, 30, 0, 74, ['#4c3a6b', '#24193a']);
    rr(c, 8, 30, 84, 42, 9); body(c, c.fillStyle);
    c.fillStyle = '#120c1c'; rr(c, 18, 62, 64, 6, 3); c.fill();
    c.fillStyle = C.cream; c.beginPath(); c.moveTo(22, 66); c.lineTo(78, 66); c.lineTo(74, 94); c.lineTo(26, 94); c.closePath(); body(c, C.cream, 'rgba(60,40,80,.5)');
    [C.cyan, C.pink, C.gold, '#1f1630'].forEach(function (col, i) { c.fillStyle = col; c.fillRect(30 + i * 10.5, 74, 9, 14); });
    c.fillStyle = lg(c, 0, 14, 0, 32, ['#6b5394', '#3b2a5a']); rr(c, 22, 14, 56, 20, 6); body(c, c.fillStyle);
    c.fillStyle = C.mint; c.beginPath(); c.arc(80, 42, 3.2, 0, Math.PI * 2); c.fill();
    c.fillStyle = C.purple; rr(c, 16, 40, 30, 5, 2.5); c.fill();
    shine(c, 30, 34, 14, 3);
  };

  D.screen = function (c) {                       // Siebdruck-Rahmen mit Rakel
    c.fillStyle = lg(c, 0, 10, 0, 80, [C.wood, C.woodD]);
    rr(c, 10, 14, 80, 62, 6); body(c, c.fillStyle);
    c.fillStyle = '#e9e3f5'; c.fillRect(19, 23, 62, 44);
    c.strokeStyle = 'rgba(80,60,120,.18)'; c.lineWidth = .8;
    for (var i = 19; i < 81; i += 3) { c.beginPath(); c.moveTo(i, 23); c.lineTo(i, 67); c.stroke(); }
    for (var j = 23; j < 67; j += 3) { c.beginPath(); c.moveTo(19, j); c.lineTo(81, j); c.stroke(); }
    c.fillStyle = C.purple; c.font = '900 30px Arial,sans-serif'; c.textAlign = 'center'; c.fillText('WF', 50, 56);
    c.save(); c.translate(56, 80); c.rotate(-0.12);
    c.fillStyle = lg(c, 0, -8, 0, 8, [C.gold, C.goldD]); rr(c, -36, -6, 72, 11, 4); body(c, c.fillStyle);
    c.fillStyle = C.pink; c.fillRect(-34, 4, 68, 4); c.restore();
    c.fillStyle = C.pink; c.beginPath(); c.arc(28, 92, 4, 0, Math.PI * 2); c.fill();
  };

  D.laser = function (c) {                        // Laser graviert Holz
    c.fillStyle = lg(c, 0, 66, 0, 92, [C.wood, C.woodD]);
    rr(c, 10, 68, 80, 22, 5); body(c, c.fillStyle);
    c.strokeStyle = 'rgba(80,40,10,.35)'; c.lineWidth = 1;
    for (var i = 0; i < 4; i++) { c.beginPath(); c.moveTo(14, 73 + i * 4.5); c.bezierCurveTo(40, 70 + i * 4.5, 60, 77 + i * 4.5, 86, 73 + i * 4.5); c.stroke(); }
    c.strokeStyle = '#3a1d08'; c.lineWidth = 2.2; c.beginPath(); c.moveTo(26, 82); c.lineTo(50, 82); c.stroke();
    c.fillStyle = lg(c, 0, 6, 0, 34, ['#64748b', '#334155']); rr(c, 38, 6, 24, 26, 5); body(c, c.fillStyle);
    c.fillStyle = C.red; c.beginPath(); c.moveTo(45, 32); c.lineTo(55, 32); c.lineTo(52, 38); c.lineTo(48, 38); c.closePath(); c.fill();
    c.save(); c.shadowColor = C.cyan; c.shadowBlur = 12;
    c.strokeStyle = lg(c, 0, 38, 0, 82, ['#ffffff', C.cyan]); c.lineWidth = 3.4; c.beginPath(); c.moveTo(50, 38); c.lineTo(50, 81); c.stroke();
    c.restore();
    c.fillStyle = C.gold;
    [[44, 76], [57, 74], [53, 70], [43, 72], [59, 79]].forEach(function (p) { c.beginPath(); c.arc(p[0], p[1], 1.6, 0, Math.PI * 2); c.fill(); });
    c.fillStyle = rg(c, 50, 81, 0, 10, ['rgba(255,255,255,.95)', 'rgba(56,189,248,0)']); c.beginPath(); c.arc(50, 81, 10, 0, Math.PI * 2); c.fill();
  };

  D.press = function (c) {                        // Transfer-/Sublimationspresse
    c.fillStyle = lg(c, 0, 0, 0, 40, ['#71717a', '#3f3f46']); rr(c, 40, 6, 20, 26, 5); body(c, c.fillStyle);
    c.fillStyle = lg(c, 0, 26, 0, 46, ['#9ca3af', '#4b5563']); rr(c, 12, 28, 76, 16, 6); body(c, c.fillStyle);
    c.fillStyle = C.red; rr(c, 14, 40, 72, 4, 2); c.fill();
    c.strokeStyle = C.orange; c.lineWidth = 2.4; c.lineCap = 'round';
    [32, 50, 68].forEach(function (x) { c.beginPath(); c.moveTo(x, 50); c.bezierCurveTo(x - 4, 55, x + 4, 59, x, 64); c.stroke(); });
    c.fillStyle = lg(c, 0, 66, 0, 92, ['#3b2a5a', '#1f1630']); rr(c, 8, 68, 84, 22, 6); body(c, c.fillStyle);
    c.fillStyle = C.cream; rr(c, 26, 70, 48, 8, 3); c.fill();
    badge(c, 50, 74, 7, C.purple);
    c.fillStyle = C.gold; c.beginPath(); c.arc(50, 16, 3, 0, Math.PI * 2); c.fill();
  };

  D.star = function (c) {                         // Wunsch-Stein (Stern)
    c.save(); c.translate(50, 50);
    c.fillStyle = rg(c, 0, 0, 0, 46, ['rgba(216,180,254,.75)', 'rgba(168,85,247,0)']); c.beginPath(); c.arc(0, 0, 46, 0, Math.PI * 2); c.fill();
    c.beginPath();
    for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4 - Math.PI / 2, r = i % 2 ? 13 : 38; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    c.closePath(); c.fillStyle = lg(c, 0, -38, 0, 38, ['#fff', C.lav, C.purple]); body(c, c.fillStyle, 'rgba(80,30,140,.6)');
    stitch(c, 'rgba(255,255,255,.9)', 1.2, [3, 2.5]);
    c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, 5, 0, Math.PI * 2); c.fill();
    c.restore();
  };

  D.gem = function (c) {                          // Nadelstein / Edelstein
    c.save(); c.translate(50, 52);
    c.beginPath(); c.moveTo(0, -38); c.lineTo(34, -10); c.lineTo(0, 38); c.lineTo(-34, -10); c.closePath();
    c.fillStyle = lg(c, -30, -38, 30, 38, [C.lav, C.purple, C.deep]); body(c, c.fillStyle);
    c.fillStyle = 'rgba(255,255,255,.3)'; c.beginPath(); c.moveTo(0, -38); c.lineTo(34, -10); c.lineTo(0, -4); c.closePath(); c.fill();
    c.restore();
  };

  /* Textilien */
  D.tshirt = function (c) {
    shirtPath(c, false, 27); c.fillStyle = lg(c, 0, 16, 0, 90, [C.purple, C.deep]); body(c, c.fillStyle);
    shirtPath(c, false, 27); c.save(); c.clip(); c.beginPath(); c.moveTo(14, 40); c.lineTo(86, 40); c.restore();
    c.beginPath(); c.moveTo(25, 82); c.quadraticCurveTo(50, 86, 75, 82); stitch(c);
    badge(c, 50, 50, 16, C.gold); shine(c, 32, 30, 5, 10);
  };
  D.polo = function (c) {
    shirtPath(c, false, 20); c.fillStyle = lg(c, 0, 16, 0, 90, ['#2dd4bf', '#0f766e']); body(c, c.fillStyle);
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(36, 16); c.lineTo(50, 30); c.lineTo(42, 34); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(64, 16); c.lineTo(50, 30); c.lineTo(58, 34); c.closePath(); c.fill();
    c.fillStyle = C.ink; [38, 46].forEach(function (y) { c.beginPath(); c.arc(50, y, 1.8, 0, Math.PI * 2); c.fill(); });
    c.beginPath(); c.moveTo(25, 82); c.quadraticCurveTo(50, 86, 75, 82); stitch(c);
    badge(c, 64, 44, 10, C.gold);
  };
  D.jersey = function (c) {
    shirtPath(c, false, 30); c.fillStyle = lg(c, 0, 16, 0, 90, [C.orange, '#c2410c']); body(c, c.fillStyle);
    shirtPath(c, false, 30); c.save(); c.clip(); c.fillStyle = 'rgba(255,255,255,.85)'; c.fillRect(10, 40, 80, 8); c.restore();
    c.fillStyle = '#fff'; c.font = '900 26px Arial,sans-serif'; c.textAlign = 'center'; c.fillText('10', 50, 76);
  };
  D.jacket = function (c) {
    shirtPath(c, true, 22); c.fillStyle = lg(c, 0, 16, 0, 90, ['#475569', '#1e293b']); body(c, c.fillStyle);
    c.strokeStyle = C.gold; c.lineWidth = 2; c.beginPath(); c.moveTo(50, 24); c.lineTo(50, 88); c.stroke();
    c.beginPath(); c.moveTo(50, 24); c.lineTo(50, 88); stitch(c, 'rgba(255,255,255,.6)', 1, [2, 2]);
    c.fillStyle = 'rgba(255,255,255,.12)'; rr(c, 28, 60, 14, 10, 2); c.fill(); rr(c, 58, 60, 14, 10, 2); c.fill();
    badge(c, 64, 42, 10, C.purple);
  };
  D.vest = function (c) {
    c.beginPath(); c.moveTo(30, 14); c.lineTo(42, 14); c.quadraticCurveTo(50, 34, 58, 14); c.lineTo(70, 14); c.lineTo(80, 34); c.lineTo(78, 88); c.lineTo(22, 88); c.lineTo(20, 34); c.closePath();
    c.fillStyle = lg(c, 0, 14, 0, 88, ['#facc15', '#f59e0b']); body(c, c.fillStyle);
    c.fillStyle = '#e5e7eb'; c.fillRect(22, 56, 56, 7); c.fillRect(22, 72, 56, 7);
    c.save(); c.globalAlpha = .55; c.fillStyle = '#fff'; c.fillRect(22, 57, 56, 2); c.fillRect(22, 73, 56, 2); c.restore();
  };
  D.hoodie = function (c) {
    shirtPath(c, true, 30); c.fillStyle = lg(c, 0, 16, 0, 90, [C.pink, '#9d174d']); body(c, c.fillStyle);
    c.fillStyle = 'rgba(0,0,0,.2)'; c.beginPath(); c.arc(50, 20, 14, 0, Math.PI); c.fill();
    c.fillStyle = 'rgba(0,0,0,.18)'; rr(c, 34, 62, 32, 16, 6); c.fill();
    c.strokeStyle = '#fff'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(45, 30); c.lineTo(44, 44); c.moveTo(55, 30); c.lineTo(56, 44); c.stroke();
    badge(c, 50, 52, 12, C.gold);
  };
  D.cap = function (c) {
    c.fillStyle = lg(c, 0, 24, 0, 66, [C.purple, C.deep]);
    c.beginPath(); c.moveTo(16, 64); c.bezierCurveTo(14, 26, 70, 18, 78, 52); c.lineTo(80, 64); c.closePath(); body(c, c.fillStyle);
    c.fillStyle = lg(c, 0, 58, 0, 76, ['#5b21b6', '#2e1065']);
    c.beginPath(); c.moveTo(56, 60); c.quadraticCurveTo(80, 56, 96, 70); c.quadraticCurveTo(80, 76, 54, 70); c.closePath(); body(c, c.fillStyle);
    c.beginPath(); c.moveTo(20, 62); c.lineTo(76, 62); stitch(c, 'rgba(255,255,255,.7)', 1.3);
    c.fillStyle = C.gold; c.beginPath(); c.arc(46, 25, 3, 0, Math.PI * 2); c.fill();
    badge(c, 44, 46, 16, C.gold);
  };
  D.gloves = function (c) {
    c.fillStyle = lg(c, 0, 10, 0, 90, ['#a3a3a3', '#525252']);
    c.beginPath(); c.moveTo(30, 90); c.lineTo(28, 44); c.lineTo(22, 34); c.quadraticCurveTo(20, 26, 28, 28); c.lineTo(34, 36);
    c.lineTo(34, 14); c.quadraticCurveTo(39, 8, 43, 14); c.lineTo(44, 34); c.lineTo(46, 10); c.quadraticCurveTo(51, 4, 55, 10); c.lineTo(55, 34);
    c.lineTo(58, 14); c.quadraticCurveTo(63, 9, 66, 15); c.lineTo(65, 38); c.lineTo(70, 24); c.quadraticCurveTo(76, 21, 76, 28); c.lineTo(72, 60); c.lineTo(70, 90); c.closePath();
    body(c, c.fillStyle);
    c.fillStyle = C.orange; c.fillRect(30, 76, 40, 10); badge(c, 50, 60, 12, C.gold);
  };
  D.tote = function (c) {
    c.strokeStyle = '#d6c7a8'; c.lineWidth = 5; c.beginPath(); c.moveTo(34, 38); c.bezierCurveTo(34, 8, 66, 8, 66, 38); c.stroke();
    c.fillStyle = lg(c, 0, 34, 0, 92, ['#f3ead7', '#d6c7a8']);
    c.beginPath(); c.moveTo(20, 34); c.lineTo(80, 34); c.lineTo(84, 92); c.lineTo(16, 92); c.closePath(); body(c, c.fillStyle, 'rgba(90,70,40,.5)');
    c.beginPath(); c.moveTo(24, 40); c.lineTo(76, 40); stitch(c, 'rgba(120,90,50,.6)', 1.2);
    badge(c, 50, 64, 24, C.purple);
  };
  D.shorts = function (c) {
    c.beginPath(); c.moveTo(22, 20); c.lineTo(78, 20); c.lineTo(86, 82); c.lineTo(56, 84); c.lineTo(50, 44); c.lineTo(44, 84); c.lineTo(14, 82); c.closePath();
    c.fillStyle = lg(c, 0, 20, 0, 84, [C.cyan, '#0369a1']); body(c, c.fillStyle);
    c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(22, 20, 56, 8);
    c.beginPath(); c.moveTo(24, 30); c.lineTo(76, 30); stitch(c, 'rgba(255,255,255,.7)', 1.2);
    badge(c, 30, 66, 10, '#fff');
  };
  /* Hartware */
  D.woodsign = function (c) {
    c.fillStyle = lg(c, 0, 22, 0, 80, ['#d9915a', C.woodD]); rr(c, 8, 22, 84, 58, 8); body(c, c.fillStyle);
    c.strokeStyle = 'rgba(80,40,10,.3)'; c.lineWidth = 1.2;
    for (var i = 0; i < 6; i++) { c.beginPath(); c.moveTo(12, 30 + i * 9); c.bezierCurveTo(40, 26 + i * 9, 60, 34 + i * 9, 88, 30 + i * 9); c.stroke(); }
    c.fillStyle = '#3a1d08'; c.font = 'italic 700 22px Georgia,serif'; c.textAlign = 'center'; c.fillText('Hjem', 50, 58);
    c.strokeStyle = '#3a1d08'; c.lineWidth = 2; c.beginPath(); c.moveTo(30, 22); c.lineTo(50, 6); c.lineTo(70, 22); c.stroke();
  };
  D.keychain = function (c) {
    c.strokeStyle = lg(c, 0, 0, 0, 40, [C.white, C.steelD]); c.lineWidth = 5; c.beginPath(); c.arc(36, 28, 16, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = C.steel; c.lineWidth = 3; c.beginPath(); c.moveTo(46, 40); c.lineTo(52, 48); c.stroke();
    c.save(); c.translate(64, 66); c.rotate(-0.5);
    c.fillStyle = lg(c, -18, -18, 18, 18, [C.lav, C.purple, C.deep]); rr(c, -20, -24, 40, 48, 10); body(c, c.fillStyle);
    c.fillStyle = C.ink; c.beginPath(); c.arc(0, -16, 3.5, 0, Math.PI * 2); c.fill();
    badge(c, 0, 4, 18, C.gold); c.restore();
  };
  D.metaltag = function (c) {
    c.save(); c.translate(50, 54); c.rotate(-0.15);
    c.fillStyle = lg(c, -36, -24, 36, 24, ['#f1f5f9', '#94a3b8', '#e2e8f0', '#64748b']);
    c.beginPath(); c.moveTo(-40, -22); c.lineTo(30, -22); c.lineTo(42, 0); c.lineTo(30, 22); c.lineTo(-40, 22); c.closePath(); body(c, c.fillStyle, 'rgba(40,50,70,.6)');
    c.fillStyle = '#1f2937'; c.beginPath(); c.arc(28, 0, 4.5, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#334155'; c.font = '800 16px Arial,sans-serif'; c.textAlign = 'center'; c.fillText('N° 01', -8, 6);
    c.restore();
  };
  D.leather = function (c) {
    c.save(); c.translate(50, 50); c.rotate(-0.5);
    c.fillStyle = lg(c, 0, -10, 0, 10, ['#a16207', '#713f12']); rr(c, -46, -10, 92, 20, 8); body(c, c.fillStyle);
    c.beginPath(); c.moveTo(-40, -5); c.lineTo(40, -5); stitch(c, C.gold, 1.2, [3, 2.4]);
    c.beginPath(); c.moveTo(-40, 5); c.lineTo(40, 5); stitch(c, C.gold, 1.2, [3, 2.4]);
    c.fillStyle = C.gold; rr(c, 26, -12, 8, 24, 2); c.fill();
    c.restore();
  };
  D.mug = function (c) {
    c.strokeStyle = lg(c, 70, 0, 92, 0, ['#e5e7eb', '#9ca3af']); c.lineWidth = 7; c.beginPath(); c.arc(74, 54, 14, -1.3, 1.3); c.stroke();
    c.fillStyle = lg(c, 18, 0, 78, 0, ['#ffffff', '#e5e7eb', '#cbd5e1']); rr(c, 18, 24, 58, 64, 8); body(c, c.fillStyle, 'rgba(60,70,90,.45)');
    c.fillStyle = '#3b1a12'; c.beginPath(); c.ellipse(47, 26, 27, 5, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = lg(c, 0, 44, 0, 72, [C.purple, C.pink]); rr(c, 28, 44, 38, 28, 6); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(47, 66); c.bezierCurveTo(33, 58, 38, 46, 47, 53); c.bezierCurveTo(56, 46, 61, 58, 47, 66); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 2; c.lineCap = 'round';
    [38, 48, 58].forEach(function (x) { c.beginPath(); c.moveTo(x, 18); c.bezierCurveTo(x - 4, 12, x + 4, 8, x, 2); c.stroke(); });
  };
  D.stein = function (c) {
    c.strokeStyle = '#9ca3af'; c.lineWidth = 7; c.beginPath(); c.arc(76, 56, 13, -1.3, 1.3); c.stroke();
    c.fillStyle = lg(c, 0, 28, 0, 92, ['#fbbf24', '#b45309']); rr(c, 22, 28, 56, 62, 6); body(c, c.fillStyle);
    c.fillStyle = 'rgba(255,255,255,.85)'; rr(c, 20, 18, 60, 16, 8); c.fill();
    c.beginPath(); c.arc(30, 20, 8, 0, Math.PI * 2); c.arc(46, 16, 9, 0, Math.PI * 2); c.arc(62, 19, 8, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 3; [34, 50, 66].forEach(function (x) { c.beginPath(); c.moveTo(x, 40); c.lineTo(x, 84); c.stroke(); });
  };
  D.puzzle = function (c) {
    c.save(); c.translate(50, 52);
    c.beginPath(); c.moveTo(-32, -32); c.lineTo(-8, -32); c.arc(0, -32, 9, Math.PI, 0, false); c.lineTo(32, -32); c.lineTo(32, -8); c.arc(32, 0, 9, -Math.PI / 2, Math.PI / 2, false);
    c.lineTo(32, 32); c.lineTo(8, 32); c.arc(0, 32, 9, 0, Math.PI, true); c.lineTo(-32, 32); c.lineTo(-32, 8); c.arc(-32, 0, 9, Math.PI / 2, -Math.PI / 2, true); c.closePath();
    c.fillStyle = lg(c, -32, -32, 32, 32, [C.mint, '#059669']); body(c, c.fillStyle);
    c.fillStyle = C.gold; c.beginPath(); c.arc(-8, -6, 8, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#065f46'; c.beginPath(); c.moveTo(-28, 28); c.lineTo(-6, 4); c.lineTo(8, 18); c.lineTo(16, 8); c.lineTo(28, 28); c.closePath(); c.fill();
    c.restore();
  };
  D.photo = function (c) {
    c.fillStyle = lg(c, 0, 10, 0, 90, ['#e2e8f0', '#94a3b8']); rr(c, 10, 14, 80, 70, 6); body(c, c.fillStyle, 'rgba(40,50,70,.5)');
    c.fillStyle = lg(c, 0, 22, 0, 76, ['#7dd3fc', '#c4b5fd']); c.fillRect(18, 22, 64, 54);
    c.fillStyle = C.gold; c.beginPath(); c.arc(66, 36, 7, 0, Math.PI * 2); c.fill();
    c.fillStyle = C.deep; c.beginPath(); c.moveTo(18, 76); c.lineTo(40, 46); c.lineTo(56, 64); c.lineTo(66, 54); c.lineTo(82, 76); c.closePath(); c.fill();
    c.fillStyle = C.steelD; rr(c, 44, 84, 12, 8, 2); c.fill();
  };
  D.heart = function (c) {
    c.save(); c.translate(50, 52); c.beginPath();
    c.moveTo(0, 32); c.bezierCurveTo(-52, 2, -28, -42, 0, -18); c.bezierCurveTo(28, -42, 52, 2, 0, 32); c.closePath();
    c.fillStyle = lg(c, 0, -30, 0, 32, ['#f9a8d4', C.pink, '#be185d']); body(c, c.fillStyle);
    c.beginPath(); c.moveTo(0, 24); c.bezierCurveTo(-40, 0, -24, -32, 0, -12); c.bezierCurveTo(24, -32, 40, 0, 0, 24); stitch(c, 'rgba(255,255,255,.8)', 1.4, [3, 2.6]);
    c.restore(); shine(c, 34, 32, 6, 4);
  };
  D.station = function (c) {                      // Ziel: Veredelungsstation
    c.fillStyle = rg(c, 50, 54, 0, 46, ['rgba(216,180,254,.55)', 'rgba(168,85,247,0)']); c.beginPath(); c.arc(50, 54, 46, 0, Math.PI * 2); c.fill();
    c.fillStyle = lg(c, 0, 40, 0, 92, ['#4c3a6b', '#24193a']); rr(c, 18, 42, 64, 48, 8); body(c, c.fillStyle);
    c.fillStyle = C.gold; rr(c, 24, 50, 52, 6, 3); c.fill();
    badge(c, 50, 72, 22, C.lav);
    c.strokeStyle = C.lav; c.lineWidth = 3; c.beginPath(); c.moveTo(50, 42); c.lineTo(50, 12); c.stroke();
    c.fillStyle = lg(c, 50, 10, 78, 26, [C.purple, C.pink]); c.beginPath(); c.moveTo(50, 10); c.lineTo(78, 18); c.lineTo(50, 28); c.closePath(); c.fill();
  };
  D.crate = function (c) {                        // Kiste (z. B. Lager)
    c.fillStyle = lg(c, 0, 16, 0, 86, ['#d9915a', C.woodD]); rr(c, 14, 18, 72, 66, 6); body(c, c.fillStyle);
    c.strokeStyle = 'rgba(60,30,10,.5)'; c.lineWidth = 3; c.beginPath(); c.moveTo(18, 40); c.lineTo(82, 40); c.moveTo(18, 62); c.lineTo(82, 62); c.moveTo(20, 22); c.lineTo(80, 80); c.stroke();
    badge(c, 50, 52, 18, C.cream);
  };
  D.coin = function (c) {                         // Krone/Münze
    c.fillStyle = lg(c, 20, 20, 80, 80, ['#fde68a', C.gold, C.goldD]); c.beginPath(); c.arc(50, 50, 36, 0, Math.PI * 2); body(c, c.fillStyle, 'rgba(120,80,10,.6)');
    c.beginPath(); c.arc(50, 50, 28, 0, Math.PI * 2); stitch(c, 'rgba(120,80,10,.55)', 1.6, [3, 2.5]);
    c.fillStyle = '#92400e'; c.font = '900 26px Arial,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('kr', 50, 52);
    shine(c, 38, 34, 8, 5);
  };
  D.truck = function (c) {                        // Versand
    c.fillStyle = lg(c, 0, 26, 0, 72, [C.purple, C.deep]); rr(c, 6, 26, 56, 44, 6); body(c, c.fillStyle);
    c.fillStyle = lg(c, 0, 38, 0, 72, ['#64748b', '#334155']); c.beginPath(); c.moveTo(62, 38); c.lineTo(82, 38); c.lineTo(94, 54); c.lineTo(94, 70); c.lineTo(62, 70); c.closePath(); body(c, c.fillStyle);
    c.fillStyle = '#7dd3fc'; c.beginPath(); c.moveTo(66, 42); c.lineTo(80, 42); c.lineTo(88, 54); c.lineTo(66, 54); c.closePath(); c.fill();
    badge(c, 34, 48, 22, C.gold);
    [24, 78].forEach(function (x) { c.fillStyle = '#111'; c.beginPath(); c.arc(x, 72, 9, 0, Math.PI * 2); c.fill(); c.fillStyle = '#9ca3af'; c.beginPath(); c.arc(x, 72, 3.5, 0, Math.PI * 2); c.fill(); });
  };
  D.hand = function (c) {                         // Handarbeit: Hand mit Nadel und Faden
    c.strokeStyle = C.pink; c.lineWidth = 3; c.lineCap = 'round';
    c.beginPath(); c.moveTo(70, 14); c.bezierCurveTo(96, 24, 92, 52, 72, 54); c.bezierCurveTo(56, 56, 60, 76, 80, 84); c.stroke();
    c.save(); c.translate(64, 30); c.rotate(-0.75);
    c.fillStyle = lg(c, -4, 0, 4, 0, ['#f1f5f9', '#94a3b8']); rr(c, -2.5, -26, 5, 46, 2.5); c.fill();
    c.fillStyle = C.ink; rr(c, -1, -22, 2, 7, 1); c.fill(); c.restore();
    var skin = lg(c, 0, 30, 0, 92, ['#f6c9a8', '#d9966c']);
    c.beginPath();
    c.moveTo(22, 92); c.lineTo(20, 64);
    c.quadraticCurveTo(10, 54, 14, 46); c.quadraticCurveTo(20, 42, 28, 52);
    c.lineTo(30, 30); c.quadraticCurveTo(35, 24, 40, 30);
    c.lineTo(41, 46); c.lineTo(44, 24); c.quadraticCurveTo(49, 18, 54, 24);
    c.lineTo(53, 46); c.lineTo(58, 30); c.quadraticCurveTo(63, 26, 66, 32);
    c.lineTo(62, 56); c.quadraticCurveTo(60, 76, 50, 92); c.closePath();
    body(c, skin);
    c.strokeStyle = 'rgba(120,60,30,.35)'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(41, 46); c.lineTo(40, 56); c.moveTo(53, 46); c.lineTo(52, 56); c.stroke();
    c.fillStyle = lg(c, 0, 80, 0, 96, [C.purple, C.deep]); rr(c, 18, 82, 36, 14, 4); c.fill();
  };
  D.team = function (c) {                         // Mitarbeiter
    [[34, C.pink], [66, C.cyan], [50, C.purple]].forEach(function (p) {
      c.fillStyle = lg(c, 0, 50, 0, 92, [p[1], C.dark]);
      c.beginPath(); c.arc(p[0], p[0] === 50 ? 40 : 46, 12, 0, Math.PI * 2); body(c, c.fillStyle);
      c.beginPath(); c.moveTo(p[0] - 20, 92); c.quadraticCurveTo(p[0] - 20, 58, p[0], 58); c.quadraticCurveTo(p[0] + 20, 58, p[0] + 20, 92); c.closePath(); body(c, c.fillStyle);
    });
  };
  D.gear = function (c) {                         // Upgrade
    c.save(); c.translate(50, 50); c.beginPath();
    for (var i = 0; i < 16; i++) { var a = i * Math.PI / 8, r = i % 2 ? 30 : 40; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    c.closePath(); c.fillStyle = lg(c, -40, -40, 40, 40, [C.lav, C.purple, C.deep]); body(c, c.fillStyle);
    c.fillStyle = C.ink; c.beginPath(); c.arc(0, 0, 12, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(0, 0, 22, 0, Math.PI * 2); stitch(c, 'rgba(255,255,255,.7)', 1.4); c.restore();
  };
  D.factory = function (c) {
    c.fillStyle = lg(c, 0, 30, 0, 90, ['#4c3a6b', '#24193a']);
    c.beginPath(); c.moveTo(8, 90); c.lineTo(8, 46); c.lineTo(30, 32); c.lineTo(30, 46); c.lineTo(52, 32); c.lineTo(52, 46); c.lineTo(74, 32); c.lineTo(74, 18); c.lineTo(88, 18); c.lineTo(88, 90); c.closePath(); body(c, c.fillStyle);
    c.fillStyle = C.gold; [[16, 58], [34, 58], [52, 58], [70, 58], [16, 74], [34, 74], [52, 74], [70, 74]].forEach(function (p) { rr(c, p[0], p[1], 10, 9, 2); c.fill(); });
    c.fillStyle = 'rgba(216,180,254,.5)'; c.beginPath(); c.arc(82, 12, 6, 0, Math.PI * 2); c.arc(90, 6, 4, 0, Math.PI * 2); c.fill();
  };

  /* Namen aus den Spielen auf Figuren abbilden (alte Emojis bleiben als Schlüssel nutzbar) */
  var ALIAS = {
    '🧵': 'spool', '✂️': 'scissors', '✂': 'scissors', '🖨️': 'printer', '🖨': 'printer', '🎨': 'screen', '🔥': 'laser', '♨️': 'press', '♨': 'press',
    '✨': 'star', '🧢': 'cap', '👔': 'polo', '🧥': 'jacket', '🎽': 'jersey', '🧤': 'gloves', '👕': 'tshirt', '🦺': 'vest', '👝': 'tote', '🩳': 'shorts',
    '🪵': 'woodsign', '🔑': 'keychain', '🏷️': 'metaltag', '🏷': 'metaltag', '📿': 'leather', '☕': 'mug', '🍺': 'stein', '🧩': 'puzzle', '🖼️': 'photo', '🖼': 'photo',
    '🧶': 'spool', '🪡': 'needle', '💎': 'gem', '⭐': 'star', '🏭': 'factory', '⚙️': 'gear', '👥': 'team', '💰': 'coin', '❤️': 'heart', '♥': 'heart', '◈': 'station', '📦': 'crate', '🚚': 'truck'
  };
  function key(name) { return ALIAS[name] || name; }

  function sprite(name, px) {
    name = key(name); px = Math.max(8, Math.round(px || 48));
    var id = name + '@' + px;
    if (cache[id]) return cache[id];
    var cv = document.createElement('canvas');
    cv.width = cv.height = Math.round(px * DPR);
    var c = cv.getContext('2d');
    c.scale(cv.width / 100, cv.height / 100);
    (D[name] || D.star)(c);
    cache[id] = cv;
    return cv;
  }
  function draw(ctx, name, x, y, px, opt) {
    opt = opt || {};
    var s = sprite(name, px);
    ctx.save(); ctx.translate(x, y);
    if (opt.rot) ctx.rotate(opt.rot);
    if (opt.flip) ctx.scale(-1, 1);
    if (opt.alpha != null) ctx.globalAlpha *= opt.alpha;
    ctx.drawImage(s, -px / 2, -px / 2, px, px);
    ctx.restore();
  }
  var urls = {};
  function url(name, px) {
    var id = key(name) + '@' + (px || 64);
    return urls[id] || (urls[id] = sprite(name, px || 64).toDataURL('image/png'));
  }
  function img(name, px, cls) {
    return '<img src="' + url(name, (px || 48) * 2) + '" alt="" class="' + (cls || 'wfg') + '" draggable="false">';
  }

  /* ── Spielfigur „Spuli“: Garnrolle mit Gesicht, rollt und blinzelt ── */
  function spuli(c, x, y, r, t, opt) {
    opt = opt || {};
    c.save(); c.translate(x, y);
    var squash = opt.squash || 0;
    c.scale(1 + squash * 0.18, 1 - squash * 0.18);
    // Schatten
    c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(0, r * 1.02, r * .8, r * .18, 0, 0, Math.PI * 2); c.fill();
    // Körper (Garn) – Wicklung dreht sich beim Rollen
    var g = c.createLinearGradient(-r, 0, r, 0);
    g.addColorStop(0, C.deep); g.addColorStop(.35, C.purple); g.addColorStop(.55, C.lav); g.addColorStop(1, C.deep);
    c.fillStyle = g; rr(c, -r * .72, -r * .78, r * 1.44, r * 1.56, r * .2); c.fill();
    c.save(); c.beginPath(); c.rect(-r * .72, -r * .78, r * 1.44, r * 1.56); c.clip();
    c.strokeStyle = 'rgba(40,10,80,.35)'; c.lineWidth = Math.max(1, r * .06);
    var off = ((opt.roll || 0) * r * .5) % (r * .26);
    for (var yy = -r * .9 + off; yy < r; yy += r * .26) { c.beginPath(); c.moveTo(-r * .72, yy); c.quadraticCurveTo(0, yy + r * .12, r * .72, yy); c.stroke(); }
    c.restore();
    // Holzscheiben oben/unten
    var w = c.createLinearGradient(0, -r, 0, r);
    w.addColorStop(0, '#e2a06a'); w.addColorStop(1, C.woodD);
    c.fillStyle = w;
    rr(c, -r * .95, -r * 1.02, r * 1.9, r * .3, r * .12); c.fill();
    rr(c, -r * .95, r * .72, r * 1.9, r * .3, r * .12); c.fill();
    // Gesicht
    var blink = (Math.floor(t / 2600) % 3 === 0 && (t % 2600) < 140) ? .15 : 1;
    var look = opt.dir || 1;
    c.fillStyle = '#fff';
    [-.26, .26].forEach(function (ex) {
      c.beginPath(); c.ellipse(ex * r + look * r * .06, -r * .12, r * .16, r * .2 * blink, 0, 0, Math.PI * 2); c.fill();
    });
    c.fillStyle = C.ink;
    [-.26, .26].forEach(function (ex) {
      c.beginPath(); c.ellipse(ex * r + look * r * .11, -r * .1, r * .08, r * .11 * blink, 0, 0, Math.PI * 2); c.fill();
    });
    c.strokeStyle = C.ink; c.lineWidth = Math.max(1.2, r * .07); c.lineCap = 'round';
    c.beginPath(); c.arc(look * r * .06, r * .12, r * .18, .2 * Math.PI, .8 * Math.PI); c.stroke();
    c.fillStyle = 'rgba(236,72,153,.55)';
    [-.48, .48].forEach(function (ex) { c.beginPath(); c.ellipse(ex * r, r * .14, r * .1, r * .06, 0, 0, Math.PI * 2); c.fill(); });
    // Fadenende als Schweif
    c.strokeStyle = C.lav; c.lineWidth = Math.max(1.2, r * .08);
    c.beginPath(); c.moveTo(-look * r * .72, r * .3);
    c.bezierCurveTo(-look * r * 1.2, r * .2 + Math.sin(t / 160) * r * .2, -look * r * 1.4, r * .6, -look * r * 1.7, r * .45 + Math.sin(t / 200) * r * .25); c.stroke();
    c.restore();
  }

  /* ── Navigationsleiste oben: zurück zur Hauptseite und zu allen Spielen ── */
  function nav(opt) {
    opt = opt || {};
    if (document.getElementById('wfNav')) return;
    var css = document.createElement('style');
    css.textContent =
      '#wfNav{position:sticky;top:0;z-index:999;display:flex;align-items:center;gap:.5rem;justify-content:space-between;' +
      'padding:.45rem .8rem;background:rgba(9,9,9,.82);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);' +
      'border-bottom:1px solid rgba(139,43,226,.25);font-family:Outfit,system-ui,sans-serif;font-size:.8rem}' +
      '#wfNav a{color:#F0EEF5;text-decoration:none;display:inline-flex;align-items:center;gap:.35rem;padding:.35rem .7rem;' +
      'border-radius:999px;border:1px solid rgba(168,85,247,.35);background:rgba(168,85,247,.08);transition:background .2s,border-color .2s;white-space:nowrap}' +
      '#wfNav a:hover{background:rgba(168,85,247,.25);border-color:#A855F7}' +
      '#wfNav .wfn-home img{height:16px;width:auto}' +
      '.wfg-inline{width:1.7em;height:1.7em;vertical-align:middle;object-fit:contain}' +
      '@media(max-width:420px){#wfNav{font-size:.72rem}#wfNav a{padding:.3rem .55rem}}';
    document.head.appendChild(css);
    var bar = document.createElement('div');
    bar.id = 'wfNav';
    var home = opt.home || '../index.html';
    var all = opt.all || 'spiele.html';
    bar.innerHTML =
      '<a class="wfn-home" href="' + home + '"><span aria-hidden="true">←</span> Wunsch-Fabrik.dk</a>' +
      (opt.hideAll ? '' : '<a href="' + all + '"><span aria-hidden="true">🎮</span> Alle Spiele</a>');
    document.body.insertBefore(bar, document.body.firstChild);
    // Emojis in Anleitungen ebenfalls durch die Grafiken ersetzen
    swapEmojis('.guide .e', 30);
    document.body.classList.add('wfg-game');
    if (!opt.noBg) bg();
    hudIcons();
    watchWins();
  }


  /* ── Fröhliche Kulisse: Sonne, ziehende Wolken, grüne Hügel, schwebende Nähknöpfe ── */
  function bg() {
    if (document.getElementById('wfgBg')) return;
    var cv = document.createElement('canvas'); cv.id = 'wfgBg';
    document.body.insertBefore(cv, document.body.firstChild);
    var c = cv.getContext('2d'), W = 0, H = 0, dpr = Math.min(1.5, window.devicePixelRatio || 1);
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var clouds = [], buttons = [];
    var BCOL = ['#ff4fa3', '#ffd23f', '#2f9bff', '#4fd94a', '#9b4dff', '#ff9a1f'];
    function size() {
      W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; c.setTransform(dpr, 0, 0, dpr, 0, 0);
      clouds = []; var n = Math.max(4, Math.round(W / 260));
      for (var i = 0; i < n; i++) clouds.push({ x: Math.random() * W, y: 30 + Math.random() * H * .45, s: .6 + Math.random() * .8, v: .12 + Math.random() * .25 });
      buttons = []; var m = Math.round(Math.min(16, W / 90));
      for (var j = 0; j < m; j++) buttons.push({ x: Math.random() * W, y: Math.random() * H, r: 7 + Math.random() * 9, v: .2 + Math.random() * .4, p: Math.random() * 6.3, c: BCOL[j % BCOL.length] });
    }
    function cloud(x, y, s) {
      c.save(); c.translate(x, y); c.scale(s, s);
      c.fillStyle = 'rgba(120,180,230,.35)';
      blob(4, 8);
      c.fillStyle = '#fff'; blob(0, 0);
      c.restore();
      function blob(dx, dy) {
        c.beginPath();
        c.arc(-38 + dx, 10 + dy, 22, 0, 7); c.arc(-10 + dx, -4 + dy, 30, 0, 7); c.arc(24 + dx, 0 + dy, 26, 0, 7); c.arc(48 + dx, 14 + dy, 18, 0, 7);
        c.rect(-38 + dx, 10 + dy, 86, 22); c.fill();
      }
    }
    function hills(t) {
      var y0 = H * .78;
      // ferne Hügel
      c.fillStyle = '#9be37a';
      c.beginPath(); c.moveTo(0, H);
      for (var x = 0; x <= W + 40; x += 40) c.lineTo(x, y0 - 40 + Math.sin(x / 180 + 1) * 34);
      c.lineTo(W, H); c.fill();
      // nahe Hügel mit runden Kuppen
      var hw = Math.max(220, W / 4);
      for (var i = -1; i < W / hw + 1; i++) {
        var cx = i * hw + hw / 2 + ((i % 2) ? 30 : -20), r = hw * .62;
        var g = c.createLinearGradient(0, y0 - r * .5, 0, H);
        g.addColorStop(0, '#6fe05a'); g.addColorStop(1, '#2fae38');
        c.fillStyle = g; c.beginPath(); c.arc(cx, y0 + r * .55, r, Math.PI, 0); c.lineTo(cx + r, H); c.lineTo(cx - r, H); c.fill();
        c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 3; c.setLineDash([10, 8]);
        c.beginPath(); c.arc(cx, y0 + r * .55, r - 12, Math.PI * 1.15, Math.PI * 1.55); c.stroke(); c.setLineDash([]);
        // Blümchen
        for (var k = 0; k < 3; k++) {
          var fx = cx - r * .4 + k * r * .4, fy = y0 + r * .55 - Math.sqrt(Math.max(0, r * r - (fx - cx) * (fx - cx))) + 18;
          c.fillStyle = BCOL[(i + k + 6) % BCOL.length];
          for (var q = 0; q < 5; q++) { var aa = q * 1.2566 + t / 3000; c.beginPath(); c.arc(fx + Math.cos(aa) * 5, fy + Math.sin(aa) * 5, 3.6, 0, 7); c.fill(); }
          c.fillStyle = '#fff6a8'; c.beginPath(); c.arc(fx, fy, 3, 0, 7); c.fill();
        }
      }
    }
    function sun(t) {
      var x = W - Math.min(110, W * .16), y = Math.min(100, H * .14), r = Math.min(46, W * .07);
      c.save(); c.translate(x, y); c.rotate(t / 6000);
      c.fillStyle = 'rgba(255,230,120,.45)';
      for (var i = 0; i < 12; i++) { c.rotate(Math.PI / 6); c.beginPath(); c.moveTo(-8, r + 6); c.lineTo(8, r + 6); c.lineTo(0, r + 30); c.fill(); }
      c.restore();
      var g = c.createRadialGradient(x - r * .3, y - r * .3, 2, x, y, r);
      g.addColorStop(0, '#fffbe0'); g.addColorStop(.6, '#ffe14d'); g.addColorStop(1, '#ffc21a');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
      c.fillStyle = '#7a4a00'; c.beginPath(); c.arc(x - r * .3, y - r * .1, r * .08, 0, 7); c.arc(x + r * .3, y - r * .1, r * .08, 0, 7); c.fill();
      c.strokeStyle = '#7a4a00'; c.lineWidth = 2.5; c.lineCap = 'round'; c.beginPath(); c.arc(x, y + r * .08, r * .35, .3, Math.PI - .3); c.stroke();
      c.fillStyle = 'rgba(255,120,150,.5)'; c.beginPath(); c.arc(x - r * .5, y + r * .2, r * .12, 0, 7); c.arc(x + r * .5, y + r * .2, r * .12, 0, 7); c.fill();
    }
    function button(b, t) {
      var y = b.y, x = b.x + Math.sin(t / 1500 + b.p) * 10;
      c.save(); c.translate(x, y); c.rotate(t / 2500 + b.p);
      c.fillStyle = 'rgba(0,0,0,.08)'; c.beginPath(); c.arc(2, 3, b.r, 0, 7); c.fill();
      c.fillStyle = b.c; c.beginPath(); c.arc(0, 0, b.r, 0, 7); c.fill();
      c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, b.r * .72, 0, 7); c.stroke();
      c.fillStyle = 'rgba(0,0,0,.25)';
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (h) { c.beginPath(); c.arc(h[0] * b.r * .25, h[1] * b.r * .25, b.r * .12, 0, 7); c.fill(); });
      c.fillStyle = 'rgba(255,255,255,.5)'; c.beginPath(); c.arc(-b.r * .35, -b.r * .4, b.r * .2, 0, 7); c.fill();
      c.restore();
    }
    size(); addEventListener('resize', size);
    var last = 0;
    function frame(t) {
      if (!reduce) requestAnimationFrame(frame);
      if (!reduce && t - last < 33) return; last = t;
      if (document.hidden) return;
      c.clearRect(0, 0, W, H);
      sun(t);
      clouds.forEach(function (o) { o.x += o.v; if (o.x > W + 120 * o.s) o.x = -120 * o.s; cloud(o.x, o.y, o.s); });
      hills(t);
      buttons.forEach(function (b) { b.y -= b.v; if (b.y < -20) { b.y = H + 20; b.x = Math.random() * W; } button(b, t); });
    }
    requestAnimationFrame(frame);
  }
  function hexA(hex, a) {
    var h = hex.replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&');
    var n = parseInt(h, 16); return 'rgba(' + (n >> 16) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  /* ── Konfetti über der ganzen Seite ── */
  var fx = null;
  function confetti(n) {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!fx) {
      var cv = document.createElement('canvas'); cv.id = 'wfgFx'; document.body.appendChild(cv);
      fx = { cv: cv, c: cv.getContext('2d'), p: [], run: false };
    }
    var W = fx.cv.width = innerWidth, H = fx.cv.height = innerHeight;
    var cols = [C.purple, C.lav, C.pink, C.gold, C.cyan, '#fff'];
    for (var i = 0; i < (n || 140); i++) fx.p.push({ x: W / 2 + (Math.random() - .5) * W * .3, y: H * .35, vx: (Math.random() - .5) * 14, vy: -6 - Math.random() * 10,
      w: 5 + Math.random() * 6, h: 3 + Math.random() * 5, r: Math.random() * 6, vr: (Math.random() - .5) * .4, c: cols[i % cols.length], life: 1 });
    if (fx.run) return; fx.run = true;
    (function step() {
      var c = fx.c; c.clearRect(0, 0, W, H);
      for (var i = fx.p.length - 1; i >= 0; i--) {
        var q = fx.p[i]; q.vy += .32; q.vx *= .985; q.x += q.vx; q.y += q.vy; q.r += q.vr; q.life -= .006;
        if (q.y > H + 20 || q.life <= 0) { fx.p.splice(i, 1); continue; }
        c.save(); c.translate(q.x, q.y); c.rotate(q.r); c.scale(1, Math.cos(q.r * 2)); c.globalAlpha = Math.min(1, q.life * 2);
        c.fillStyle = q.c; c.fillRect(-q.w / 2, -q.h / 2, q.w, q.h); c.restore();
      }
      if (fx.p.length) requestAnimationFrame(step); else { fx.run = false; c.clearRect(0, 0, W, H); }
    })();
  }

  /* ── Sterne-Wertung als HTML ── */
  function stars(n) {
    var h = '<div class="wfg-stars">';
    for (var i = 0; i < 3; i++) h += '<img src="' + url('star', 120) + '" alt="" class="' + (i < n ? 'on' : '') + '">';
    return h + '</div>';
  }

  /* ── Symbole in die Zähler setzen (nach Beschriftung) ── */
  var HUD_ICON = { 'Punkte': 'star', 'Serie': 'gem', 'Level': 'stick', 'Schicht': 'factory', 'Halle': 'factory', 'Garn': 'spool',
    'Rollen': 'heart', 'Ausschuss': 'heart', 'Zeit': 'gear', 'Bestpunktzahl': 'star', 'Sterne gesamt': 'star', 'Höchstes Level': 'gem' };
  function hudIcons(sel) {
    document.querySelectorAll(sel || '.hud > div, .bar .stat').forEach(function (d) {
      var s = d.querySelector('span'); if (!s || d.querySelector('.hi')) return;
      var k = HUD_ICON[s.textContent.trim()]; if (!k) return;
      var i = document.createElement('i'); i.className = 'hi'; i.innerHTML = img(k, 22, '');
      d.insertBefore(i, d.firstChild);
    });
  }

  /* ── Bei Gewinn-Fenstern automatisch Konfetti ── */
  function watchWins() {
    if (!window.MutationObserver) return;
    document.querySelectorAll('.overlay').forEach(function (ov) {
      new MutationObserver(function () {
        if (!ov.classList.contains('on')) { ov._wfgOn = false; return; }
        if (ov._wfgOn) return; ov._wfgOn = true;
        setTimeout(function () { if (ov.querySelector('.vbox, .wfg-win')) confetti(160); }, 250);
      }).observe(ov, { attributes: true, attributeFilter: ['class'] });
    });
  }

  /* Funken-Explosion (für Canvas-Spiele): Partikel-Liste pflegen und zeichnen */
  function Sparks() { this.p = []; }
  Sparks.prototype.burst = function (x, y, n, cols, speed) {
    cols = cols || [C.lav, C.gold, C.pink, '#fff'];
    for (var i = 0; i < (n || 18); i++) {
      var a = Math.random() * Math.PI * 2, v = (speed || 3) * (0.4 + Math.random());
      this.p.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: 1, c: cols[i % cols.length], s: 1.5 + Math.random() * 2.5, star: Math.random() < .25 });
    }
  };
  Sparks.prototype.draw = function (c, dt) {
    var k = (dt || 16) / 16;
    for (var i = this.p.length - 1; i >= 0; i--) {
      var q = this.p[i];
      q.x += q.vx * k; q.y += q.vy * k; q.vy += .12 * k; q.vx *= .98; q.life -= .028 * k;
      if (q.life <= 0) { this.p.splice(i, 1); continue; }
      c.globalAlpha = Math.max(0, q.life); c.fillStyle = q.c;
      if (q.star) {
        c.save(); c.translate(q.x, q.y); c.rotate(q.life * 4); c.beginPath();
        for (var j = 0; j < 8; j++) { var a = j * Math.PI / 4, r = j % 2 ? q.s * .5 : q.s * 2; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        c.closePath(); c.fill(); c.restore();
      } else { c.beginPath(); c.arc(q.x, q.y, q.s * q.life + .4, 0, Math.PI * 2); c.fill(); }
    }
    c.globalAlpha = 1;
  };

  /* Emojis in vorhandenen HTML-Elementen (z. B. Anleitung) durch die Grafiken ersetzen */
  function swapEmojis(selector, px) {
    document.querySelectorAll(selector).forEach(function (el) {
      var k = el.textContent.trim();
      if (ALIAS[k] || D[k]) el.innerHTML = img(k, px || 32, 'wfg wfg-inline');
    });
  }

  window.WFG = { sprite: sprite, draw: draw, url: url, img: img, spuli: spuli, nav: nav, Sparks: Sparks, swapEmojis: swapEmojis, bg: bg, confetti: confetti, stars: stars, hudIcons: hudIcons, C: C, names: Object.keys(D) };
})();
