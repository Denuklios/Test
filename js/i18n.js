/* Sprachumschaltung Deutsch / Englisch.
   Die Oberfläche ist auf Deutsch geschrieben; für Englisch werden Texte über Wörterbücher ersetzt:
   - HW.I18N.en.exact: { 'deutscher Text': 'English text' }  (Leerraum wird vor dem Nachschlagen vereinheitlicht)
   - HW.I18N.en.rx:    [[/^Regex mit (\d+) Werten$/, 'English with $1 values'], …]  für Texte mit Zahlen/Namen
   Übersetzt werden Textknoten und die Attribute title, placeholder, aria-label – auch in später erzeugten
   Dialogen (MutationObserver). JS-Texte, die nicht im DOM landen (Canvas, confirm, Hilfe-Kästchen), über HW.i18n.t(). */
(function (g) {
  const HW = (g.HW = g.HW || {});
  HW.I18N = HW.I18N || { en: { exact: {}, rx: [] } };
  const KEY = 'stickstudio.lang';
  let lang = 'de';
  // online zählt die am Konto gespeicherte Sprache, sonst die zuletzt gewählte bzw. die des Browsers
  try { lang = (g.STICK_CONFIG && g.STICK_CONFIG.online && g.STICK_CONFIG.lang) || localStorage.getItem(KEY) || ((navigator.language || 'de').startsWith('de') ? 'de' : 'en'); } catch (e) { /* privat */ }
  if (lang !== 'de' && lang !== 'en') lang = 'de';

  const norm = (s) => s.replace(/\s+/g, ' ').trim();

  /** Text übersetzen (Deutsch → aktuelle Sprache). Unbekannte Texte bleiben unverändert. */
  function t(s) {
    if (lang === 'de' || s == null) return s;
    const str = String(s);
    const key = norm(str);
    if (!key || !/[A-Za-zÄÖÜäöüß]/.test(key)) return str;
    const d = HW.I18N[lang];
    if (!d) return str;
    let out = d.exact[key];
    if (out === undefined) {
      for (const [re, rep] of d.rx) {
        if (re.test(key)) { out = key.replace(re, rep); break; }
      }
    }
    if (out === undefined) return str;
    // führenden/folgenden Leerraum erhalten (Textstücke zwischen <b> … </b>)
    const lead = str.match(/^\s*/)[0], trail = str.match(/\s*$/)[0];
    return lead + out + trail;
  }

  // Zahlen im Format der Sprache (12,5 bzw. 12.5)
  const locale = () => (lang === 'de' ? 'de-DE' : 'en-GB');
  const num = (v, d = 1) => (lang === 'de' ? Number(v).toFixed(d).replace('.', ',') : Number(v).toFixed(d));

  /* ---------- DOM übersetzen ---------- */
  const orig = new WeakMap(); // Textknoten → deutscher Originaltext
  const done = new WeakMap(); // Textknoten → zuletzt gesetzte Übersetzung
  const ATTRS = ['title', 'placeholder', 'aria-label', 'label'];
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE']);

  function textNode(n) {
    const cur = n.data;
    if (done.get(n) === cur) return; // eigene Übersetzung – nichts tun
    orig.set(n, cur);
    const tr = t(cur);
    if (tr !== cur) { done.set(n, tr); n.data = tr; } else done.set(n, cur);
  }
  function attrs(el) {
    for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue;
      const v = el.getAttribute(a), k = 'i18n' + a;
      if (el.dataset[k + 'T'] === v) continue;
      el.dataset[k] = v;
      const tr = t(v);
      el.dataset[k + 'T'] = tr;
      if (tr !== v) el.setAttribute(a, tr);
    }
  }
  function apply(root) {
    if (!root || lang === 'de') return;
    if (root.nodeType === 3) { if (!skipNode(root)) textNode(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1) { if (SKIP.has(root.tagName) || root.closest('[data-noi18n]')) return; attrs(root); }
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: (n) => (n.nodeType === 1 && (SKIP.has(n.tagName) || n.hasAttribute('data-noi18n')) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (n.nodeType === 3) textNode(n); else attrs(n);
    }
  }
  const skipNode = (n) => { const p = n.parentElement; return !p || SKIP.has(p.tagName) || p.closest('[data-noi18n]'); };

  // zurück auf Deutsch: Originaltexte wiederherstellen
  function restore(root) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (n.nodeType === 3) { const o = orig.get(n); if (o !== undefined && done.get(n) === n.data) n.data = o; done.delete(n); }
      else for (const a of ATTRS) { const k = 'i18n' + a; if (n.dataset && n.dataset[k] !== undefined) { n.setAttribute(a, n.dataset[k]); delete n.dataset[k]; delete n.dataset[k + 'T']; } }
    }
  }

  let obs = null;
  function observe() {
    if (obs || typeof MutationObserver === 'undefined' || !document.body) return;
    obs = new MutationObserver((list) => {
      if (lang === 'de') return;
      for (const m of list) {
        if (m.type === 'characterData') { if (!skipNode(m.target)) textNode(m.target); }
        else if (m.type === 'attributes') attrs(m.target);
        else m.addedNodes.forEach((n) => apply(n));
      }
    });
    obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  function setLang(l) {
    if (l !== 'de' && l !== 'en') return;
    const old = lang;
    lang = l;
    try { localStorage.setItem(KEY, l); } catch (e) { /* privat */ }
    document.documentElement.lang = l;
    if (old !== 'de') restore(document.body);
    apply(document.body);
    document.querySelectorAll('[data-lang-btn]').forEach((b) => b.classList.toggle('on', b.dataset.langBtn === l));
    (HW.i18n.listeners || []).forEach((f) => { try { f(l); } catch (e) { /* weiter */ } });
  }

  HW.i18n = {
    t, apply, setLang, locale, num, listeners: [],
    get lang() { return lang; },
    start() { if (typeof document === 'undefined') return; document.documentElement.lang = lang; apply(document.body); observe(); document.querySelectorAll('[data-lang-btn]').forEach((b) => b.classList.toggle('on', b.dataset.langBtn === lang)); },
  };
})(typeof window !== 'undefined' ? window : globalThis);
