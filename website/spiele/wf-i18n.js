/* ═══════════════════════════════════════════════════════════════
   Wunsch-Fabrik Spiele – Sprachen (Deutsch, Dänisch, Englisch)
   Die Spiele sind auf Deutsch geschrieben. Dieses Modul tauscht beim
   Laden und während des Spiels jeden bekannten deutschen Text gegen
   die gewählte Sprache aus – auch Text, den ein Spiel später einblendet
   oder auf die Spielfläche (Canvas) zeichnet.
   Wörterbücher: i18n/common.js (für alle) und i18n/<seite>.js.
   Eintrag:  "Deutscher Text": ["Dansk tekst", "English text"]
   Platzhalter {0}, {1} … für Zahlen und Namen, z. B. "Noch {0} Züge".
   Sprache: wie auf der Hauptseite (localStorage wf_lang), sonst Browser.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  function detect() {
    try { var s = localStorage.getItem('wf_lang'); if (s === 'de' || s === 'da' || s === 'en') return s; } catch (e) {}
    var b = (navigator.language || 'de').toLowerCase();
    if (b.indexOf('da') === 0) return 'da';
    if (b.indexOf('de') === 0) return 'de';
    if (b.indexOf('en') === 0) return 'en';
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      if (tz === 'Europe/Copenhagen' || tz === 'Atlantic/Faroe') return 'da';
      if (['Europe/Berlin', 'Europe/Vienna', 'Europe/Zurich', 'Europe/Luxembourg'].indexOf(tz) >= 0) return 'de';
    } catch (e) {}
    return 'en';
  }
  var lang = detect(), idx = lang === 'da' ? 0 : 1;
  var exact = Object.create(null), patterns = [], produced = Object.create(null), misses = {}, blockMiss = {};
  var blocks = Object.create(null), blockPat = [];
  var INLINE = { B: 1, I: 1, A: 1, SPAN: 1, BR: 1, STRONG: 1, EM: 1, SMALL: 1, IMG: 1 };
  /* Absatz vergleichbar machen: Attribute weg, Leerraum zusammenfassen */
  function canon(h) { return h.replace(/<(\/?)([a-zA-Z0-9]+)[^>]*>/g, function (m, sl, tg) { return '<' + sl + tg.toLowerCase() + '>'; }).replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').replace(/> </g, '><').trim(); }
  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1 };

  function norm(s) { return s.replace(/\s+/g, ' ').trim(); }
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function add(dict) {
    for (var k in dict) {
      var v = dict[k], key = norm(k);
      if (/<[a-z]/.test(key)) {                       // ganzer Absatz mit Tags
        var ck = canon(key);
        if (ck.indexOf('{0}') >= 0) {
          var nm = [], src2 = '^' + esc(ck).replace(/\\\{(\d)\\\}/g, function (m, d) { nm.push(+d); return '(.+?)'; }) + '$';
          blockPat.push({ re: new RegExp(src2), names: nm, tr: v });
        } else blocks[ck] = v;
        continue;
      }
      if (key.indexOf('{0}') >= 0) {
        var names = [], src = '^' + esc(key).replace(/\\\{(\d)\\\}/g, function (m, d) { names.push(+d); return '(.+?)'; }) + '$';
        patterns.push({ re: new RegExp(src), names: names, tr: v });
      } else exact[key] = v;
    }
    if (lang !== 'de' && document.body) translateTree(document.body);
  }
  function t(s) {
    if (lang === 'de' || s == null) return s;
    var raw = String(s), key = norm(raw);
    if (!key || produced[key]) return s;
    var hit = exact[key], out = null;
    if (hit) out = hit[idx];
    else {
      for (var i = 0; i < patterns.length; i++) {
        var m = patterns[i].re.exec(key);
        if (!m) continue;
        var p = patterns[i];
        out = p.tr[idx].replace(/\{(\d)\}/g, function (x, d) {
          var v = m[p.names.indexOf(+d) + 1];
          return v == null ? '' : t(v);
        });
        break;
      }
    }
    if (out == null) {
      if (window.WFI18N_DEBUG && /[a-zäöüß]{3,}/i.test(key) && !/^[\d\s.,:%×+\-–/]+$/.test(key)) misses[key] = (misses[key] || 0) + 1;
      return s;
    }
    produced[norm(out)] = 1;
    /* Leerzeichen am Rand erhalten */
    var lead = raw.match(/^\s*/)[0], trail = raw.match(/\s*$/)[0];
    return lead + out + trail;
  }
  function translateText(node) {
    var p = node.parentNode; if (!p || SKIP[p.nodeName]) return;
    var v = node.nodeValue; if (!v || !/\S/.test(v)) return;
    var n = t(v); if (n !== v) node.nodeValue = n;
  }
  var ATTR = ['title', 'placeholder', 'alt', 'aria-label'];
  function translateEl(el) {
    for (var i = 0; i < ATTR.length; i++) {
      var a = el.getAttribute && el.getAttribute(ATTR[i]);
      if (a) { var n = t(a); if (n !== a) el.setAttribute(ATTR[i], n); }
    }
  }
  /* Gibt es eine Übersetzung für den ganzen Absatz? Inline-Tags behalten ihre Attribute (Farben, Links). */
  function tryBlock(el) {
    var kids = el.children; if (!kids.length) return false;
    for (var i = 0; i < kids.length; i++) if (!INLINE[kids[i].nodeName]) return false;
    var h = el.innerHTML; if (h.length > 3000) return false;
    var ck = canon(h); if (produced[ck]) return false;
    var hit = blocks[ck], out = null;
    if (hit) out = hit[idx];
    else for (var j = 0; j < blockPat.length; j++) {
      var m = blockPat[j].re.exec(ck); if (!m) continue;
      var p = blockPat[j];
      out = p.tr[idx].replace(/\{(\d)\}/g, function (x, d) { var v = m[p.names.indexOf(+d) + 1]; return v == null ? '' : t(v); });
      break;
    }
    if (out == null) {
      if (window.WFI18N_DEBUG && /[a-zäöüß]{3,}/i.test(el.textContent)) blockMiss[ck] = 1;
      return false;
    }
    /* Attribute der Original-Tags der Reihe nach wieder einsetzen */
    var attrs = {};
    h.replace(/<([a-zA-Z0-9]+)(\s[^>]*)?>/g, function (m, tg, at) { tg = tg.toLowerCase(); (attrs[tg] = attrs[tg] || []).push(at || ''); return m; });
    var used = {};
    out = out.replace(/<([a-z0-9]+)>/g, function (m, tg) { var n = used[tg] = (used[tg] || 0) + 1; var a = attrs[tg] && attrs[tg][n - 1]; return '<' + tg + (a || '') + '>'; });
    produced[canon(out)] = 1;
    el.innerHTML = out;
    return true;
  }
  function walk(el) {
    if (SKIP[el.nodeName]) return;
    translateEl(el);
    if (tryBlock(el)) return;
    for (var c = el.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) translateText(c);
      else if (c.nodeType === 1) walk(c);
    }
  }
  function translateTree(root) {
    if (lang === 'de' || !root) return;
    if (root.nodeType === 3) {
      /* neuer Text in einem Absatz mit Fettdruck: lieber den ganzen Absatz übersetzen */
      if (root.parentNode && root.parentNode.nodeType === 1 && tryBlock(root.parentNode)) return;
      translateText(root); return;
    }
    if (root.nodeType !== 1) return;
    if (root.parentNode && root.parentNode.nodeType === 1 && root.parentNode !== document.body && tryBlock(root.parentNode)) return;
    walk(root);
  }

  if (lang !== 'de') {
    /* Alles, was die Seite oder ein Spiel später einfügt, sofort mit übersetzen */
    new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var m = list[i];
        if (m.type === 'characterData') translateText(m.target);
        else if (m.type === 'attributes') translateEl(m.target);
        else for (var j = 0; j < m.addedNodes.length; j++) translateTree(m.addedNodes[j]);
      }
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTR });
    /* Text auf Spielflächen */
    var C = window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype;
    if (C) {
      var f = C.fillText, s = C.strokeText;
      C.fillText = function (txt) { arguments[0] = t(txt); return f.apply(this, arguments); };
      C.strokeText = function (txt) { arguments[0] = t(txt); return s.apply(this, arguments); };
    }
    /* Rückfragen-Fenster der Spiele */
    var oc = window.confirm, op = window.prompt;
    window.confirm = function (m) { return oc.call(window, t(m)); };
    window.prompt = function (m, d) { return op.call(window, t(m), d); };
    document.addEventListener('DOMContentLoaded', function () {
      document.title = t(document.title);
      var md = document.querySelector('meta[name=description]');
      if (md) md.setAttribute('content', t(md.getAttribute('content')));
      translateTree(document.body);
    });
  }
  document.documentElement.setAttribute('lang', lang);

  function set(l) { try { localStorage.setItem('wf_lang', l); } catch (e) {} location.reload(); }
  /* Flaggen für die Spiele-Leiste */
  function switcher() {
    var L = [['de', 'de', 'Deutsch'], ['da', 'dk', 'Dansk'], ['en', 'gb', 'English']];
    return '<span class="wfn-lang">' + L.map(function (x) {
      return '<button type="button" data-l="' + x[0] + '" class="' + (x[0] === lang ? 'on' : '') + '" title="' + x[2] + '">' +
        '<img src="../flags/' + x[1] + '.svg" alt="' + x[2] + '" width="22" height="16"></button>';
    }).join('') + '</span>';
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.wfn-lang button');
    if (b) set(b.getAttribute('data-l'));
  });

  window.WFI18N = { lang: lang, add: add, t: t, set: set, switcher: switcher, misses: function () { return misses; }, blockMisses: function () { return blockMiss; } };
})();
