/* Produkt-Konfigurator der Wunsch-Fabrik.
 * Wird vom Kontaktformular der Webseite (Modus „kunde“) und von der Auftrags-App (Modus „werkstatt“) benutzt.
 *
 *   const k = await WFKonfig.mount(element, { mode: 'kunde', lang: 'de', base: 'konfigurator/', onChange });
 *   k.config()          → Auswahl als Objekt (für die Anfrage)
 *   k.summary()         → Auswahl als lesbarer Text
 *   k.previewBlob()     → Vorschaubild (alle vier Ansichten) als JPEG-Blob
 *   k.validate()        → null oder Fehlertext (z. B. Rechte am Logo nicht bestätigt)
 *
 * Einfärben: Der weiße Hintergrund der Produktfotos wird freigestellt, danach wird jeder Pixel über sein
 * Helligkeitsverhältnis zur mittleren Stoffhelligkeit neu eingefärbt. So bleiben Falten und Schatten erhalten.
 *
 * Farben und Höchstgrößen sind Standardwerte. Später können sie über window.WF_KONFIG_OVERRIDES ersetzt werden:
 *   { tshirt: { colors: ['weiss', 'schwarz'], max: { brust_l: 12 } } }
 */
(function () {
  'use strict';

  /* ---------- Texte ---------- */
  const TX = {
    de: {
      product: 'Produkt', color: 'Farbe', own_color: 'Eigene Farbe', logo: 'Logo', logo_up: 'Logo hochladen', logo_change: 'Anderes Logo', logo_remove: 'Entfernen',
      logo_hint: 'PNG, JPG oder SVG. Ein weißer Hintergrund wird automatisch entfernt.', logo_bad: 'Diese Datei konnte nicht als Bild gelesen werden. Bitte PNG, JPG oder SVG verwenden.',
      no_logo: 'Lade dein Logo hoch, dann siehst du es direkt auf dem Produkt.',
      pos: 'Position', pos_hint: 'Das sind unsere Standard-Positionen. Für eine individuelle Lösung haben wir immer ein offenes Ohr, schreib uns einfach.',
      pos_none: 'Bitte mindestens eine Position wählen.',
      size: 'Größe', size_side: 'längste Seite', tech: 'Veredelung',
      t_stick: 'Stick', t_stick_d: 'edel und langlebig', t_dtf: 'DTF-Druck', t_dtf_d: 'farbig, auch Fotos', t_plott: 'Plott', t_plott_d: 'Flex/Flock, klare Formen', t_sieb: 'Siebdruck', t_sieb_d: 'ab größeren Mengen',
      approx: 'Die Vorschau ist eine Annäherung. Farben und Größen können leicht abweichen.',
      rights: 'Ich habe die Rechte an diesem Logo.', rights_err: 'Bitte bestätige, dass du die Rechte an dem Logo hast.',
      loading: 'Bild wird vorbereitet …', views: ['Vorne', 'Rechte Seite', 'Linke Seite', 'Hinten'], vmug: ['Seite 1', 'Vorne', 'Seite 2'], t_subli: 'Sublimation', t_subli_d: 'farbig, auch Fotos',
      drag: 'Logo im Bild mit der Maus oder dem Finger verschieben.', reset: 'Mittig setzen', download: 'Bild herunterladen',
      s_product: 'Produkt', s_color: 'Farbe', s_tech: 'Veredelung', s_pos: 'Position', s_logo: 'Logo', s_none: 'kein Logo hochgeladen', s_moved: 'verschoben',
    },
    da: {
      product: 'Produkt', color: 'Farve', own_color: 'Egen farve', logo: 'Logo', logo_up: 'Upload logo', logo_change: 'Andet logo', logo_remove: 'Fjern',
      logo_hint: 'PNG, JPG eller SVG. En hvid baggrund fjernes automatisk.', logo_bad: 'Filen kunne ikke læses som billede. Brug venligst PNG, JPG eller SVG.',
      no_logo: 'Upload dit logo, så ser du det direkte på produktet.',
      pos: 'Placering', pos_hint: 'Det er vores standardplaceringer. Til en individuel løsning har vi altid et åbent øre – skriv bare til os.',
      pos_none: 'Vælg mindst én placering.',
      size: 'Størrelse', size_side: 'længste side', tech: 'Forædling',
      t_stick: 'Broderi', t_stick_d: 'eksklusivt og holdbart', t_dtf: 'DTF-tryk', t_dtf_d: 'farverigt, også fotos', t_plott: 'Plot', t_plott_d: 'flex/flock, klare former', t_sieb: 'Serigrafi', t_sieb_d: 'ved større antal',
      approx: 'Forhåndsvisningen er en tilnærmelse. Farver og størrelser kan afvige en smule.',
      rights: 'Jeg har rettighederne til dette logo.', rights_err: 'Bekræft venligst, at du har rettighederne til logoet.',
      loading: 'Billedet forberedes …', views: ['Forfra', 'Højre side', 'Venstre side', 'Bagfra'], vmug: ['Side 1', 'Foran', 'Side 2'], t_subli: 'Sublimation', t_subli_d: 'farverigt, også fotos',
      drag: 'Flyt logoet i billedet med musen eller fingeren.', reset: 'Centrér', download: 'Download billede',
      s_product: 'Produkt', s_color: 'Farve', s_tech: 'Forædling', s_pos: 'Placering', s_logo: 'Logo', s_none: 'intet logo uploadet', s_moved: 'flyttet',
    },
    en: {
      product: 'Product', color: 'Colour', own_color: 'Custom colour', logo: 'Logo', logo_up: 'Upload logo', logo_change: 'Other logo', logo_remove: 'Remove',
      logo_hint: 'PNG, JPG or SVG. A white background is removed automatically.', logo_bad: 'This file could not be read as an image. Please use PNG, JPG or SVG.',
      no_logo: 'Upload your logo to see it right on the product.',
      pos: 'Position', pos_hint: 'These are our standard positions. We are always open to an individual solution – just write to us.',
      pos_none: 'Please choose at least one position.',
      size: 'Size', size_side: 'longest side', tech: 'Finishing',
      t_stick: 'Embroidery', t_stick_d: 'classy and durable', t_dtf: 'DTF print', t_dtf_d: 'full colour, even photos', t_plott: 'Vinyl', t_plott_d: 'flex/flock, clean shapes', t_sieb: 'Screen print', t_sieb_d: 'for larger quantities',
      approx: 'The preview is an approximation. Colours and sizes may differ slightly.',
      rights: 'I hold the rights to this logo.', rights_err: 'Please confirm that you hold the rights to the logo.',
      loading: 'Preparing image …', views: ['Front', 'Right side', 'Left side', 'Back'], vmug: ['Side 1', 'Front', 'Side 2'], t_subli: 'Sublimation', t_subli_d: 'full colour, even photos',
      drag: 'Drag the logo in the picture with mouse or finger.', reset: 'Centre', download: 'Download image',
      s_product: 'Product', s_color: 'Colour', s_tech: 'Finishing', s_pos: 'Position', s_logo: 'Logo', s_none: 'no logo uploaded', s_moved: 'moved',
    },
  };

  /* ---------- Farben ---------- */
  const COLORS = {
    weiss: ['Weiß', 'Hvid', 'White', '#ffffff'], natur: ['Natur', 'Natur', 'Natural', '#efe6d2'], sand: ['Sand', 'Sand', 'Sand', '#d6c4a1'],
    grau: ['Grau meliert', 'Gråmeleret', 'Heather grey', '#a3a5a8'], anthrazit: ['Anthrazit', 'Antracit', 'Charcoal', '#3c3e42'], schwarz: ['Schwarz', 'Sort', 'Black', '#151515'],
    navy: ['Navy', 'Navy', 'Navy', '#1b2a4a'], royal: ['Royalblau', 'Royalblå', 'Royal blue', '#1f4bb4'], hellblau: ['Hellblau', 'Lyseblå', 'Light blue', '#9cc3e6'],
    tuerkis: ['Türkis', 'Turkis', 'Turquoise', '#1aa3a8'], gruen: ['Flaschengrün', 'Flaskegrøn', 'Bottle green', '#14533a'], oliv: ['Oliv', 'Oliven', 'Olive', '#6b6a3a'],
    lind: ['Lindgrün', 'Limegrøn', 'Lime', '#8cc63f'], gelb: ['Gelb', 'Gul', 'Yellow', '#f2c418'], orange: ['Orange', 'Orange', 'Orange', '#ee6b1c'],
    rot: ['Rot', 'Rød', 'Red', '#c8102e'], bordeaux: ['Bordeaux', 'Bordeaux', 'Burgundy', '#6e1a2b'], pink: ['Pink', 'Pink', 'Pink', '#e2508f'],
    rosa: ['Rosa', 'Lyserød', 'Light pink', '#f2bccb'], lila: ['Lila', 'Lilla', 'Purple', '#5b2c83'], mint: ['Mint', 'Mint', 'Mint', '#a9dcc5'],
  };
  const C_SHIRT = ['weiss', 'natur', 'grau', 'anthrazit', 'schwarz', 'navy', 'royal', 'hellblau', 'gruen', 'oliv', 'gelb', 'orange', 'rot', 'bordeaux', 'pink', 'lila'];
  const C_SPORT = ['weiss', 'schwarz', 'navy', 'royal', 'hellblau', 'tuerkis', 'gruen', 'lind', 'gelb', 'orange', 'rot', 'bordeaux', 'pink', 'lila'];
  const C_POLO = ['weiss', 'grau', 'anthrazit', 'schwarz', 'navy', 'royal', 'hellblau', 'gruen', 'rot', 'bordeaux'];
  const C_HOOD = ['weiss', 'sand', 'grau', 'anthrazit', 'schwarz', 'navy', 'royal', 'gruen', 'oliv', 'rot', 'bordeaux', 'rosa'];
  const C_JACKET = ['schwarz', 'anthrazit', 'grau', 'navy', 'royal', 'oliv', 'rot'];
  const C_WORK = ['schwarz', 'anthrazit', 'grau', 'navy', 'oliv'];
  const C_BABY = ['weiss', 'natur', 'grau', 'hellblau', 'rosa', 'mint', 'gelb', 'navy'];
  const C_CAP = ['schwarz', 'weiss', 'sand', 'grau', 'navy', 'royal', 'gruen', 'oliv', 'rot', 'bordeaux'];

  /* ---------- Positionen ----------
     view: 0 vorne, 1 rechte Seite (Träger), 2 linke Seite, 3 hinten.
     fx/fy: Mitte des Logos als Anteil der Ansicht (Begrenzungsrahmen des Produkts); top: fy ist die Oberkante. */
  const PN = {
    brust_l: ['Brust links', 'Bryst venstre', 'Left chest'], brust_r: ['Brust rechts', 'Bryst højre', 'Right chest'], brust_m: ['Brust Mitte', 'Bryst midt', 'Centre chest'],
    ruecken: ['Rücken', 'Ryg', 'Back'], aermel_r: ['Ärmel rechts', 'Ærme højre', 'Right sleeve'], aermel_l: ['Ärmel links', 'Ærme venstre', 'Left sleeve'],
    kragen_l: ['Kragen links', 'Krave venstre', 'Left collar'], kragen_r: ['Kragen rechts', 'Krave højre', 'Right collar'], cap_v: ['Vorne', 'Foran', 'Front'], cap_r: ['Seite rechts', 'Side højre', 'Right side'],
    cap_l: ['Seite links', 'Side venstre', 'Left side'], cap_h: ['Hinten', 'Bag', 'Back'],
    tasse_v: ['Vorne', 'Foran', 'Front'], tasse_1: ['Seite 1', 'Side 1', 'Side 1'], tasse_2: ['Seite 2', 'Side 2', 'Side 2'],
  };
  const P = (id, view, fx, fy, def, max, top) => ({ id, view, fx, fy, def, max, top: !!top });
  const SHIRT = [P('brust_l', 0, 0.655, 0.255, 9, 12), P('brust_r', 0, 0.345, 0.255, 9, 12), P('ruecken', 3, 0.5, 0.17, 25, 30, 1), P('aermel_r', 1, 0.69, 0.29, 7, 9), P('aermel_l', 2, 0.31, 0.29, 7, 9)];
  const PRODUCTS = [
    { id: 'tshirt', name: ['T-Shirt', 'T-shirt', 'T-shirt'], cm: 75, colors: C_SHIRT, color: 'weiss', pos: SHIRT },
    { id: 'sport', name: ['Sport-Shirt', 'Sportstrøje', 'Sports shirt'], cm: 75, colors: C_SPORT, color: 'royal', pos: SHIRT },
    { id: 'polo', name: ['Poloshirt', 'Poloshirt', 'Polo shirt'], cm: 75, colors: C_POLO, color: 'navy',
      // Kragen vorne, direkt auf der Kragenspitze (links/rechts aus Sicht des Trägers)
      pos: [...SHIRT, P('kragen_l', 0, 0.624, 0.104, 3, 4), P('kragen_r', 0, 0.376, 0.104, 3, 4)] },
    { id: 'hoodie', name: ['Hoodie', 'Hættetrøje', 'Hoodie'], cm: 80, colors: C_HOOD, color: 'grau',
      pos: [P('brust_l', 0, 0.64, 0.33, 9, 12), P('brust_r', 0, 0.36, 0.33, 9, 12), P('ruecken', 3, 0.5, 0.30, 25, 30, 1), P('aermel_r', 1, 0.6, 0.42, 7, 9), P('aermel_l', 2, 0.4, 0.42, 7, 9)] },
    { id: 'softshell', name: ['Softshelljacke', 'Softshell-jakke', 'Softshell jacket'], cm: 80, colors: C_JACKET, color: 'schwarz',
      pos: [P('brust_l', 0, 0.64, 0.27, 9, 11), P('brust_r', 0, 0.36, 0.27, 9, 11), P('ruecken', 3, 0.5, 0.2, 25, 30, 1), P('aermel_r', 1, 0.58, 0.32, 7, 9), P('aermel_l', 2, 0.42, 0.32, 7, 9)] },
    { id: 'arbeitsjacke', name: ['Arbeitsjacke', 'Arbejdsjakke', 'Work jacket'], cm: 80, colors: C_WORK, color: 'anthrazit',
      pos: [P('brust_l', 0, 0.64, 0.27, 9, 11), P('brust_r', 0, 0.36, 0.27, 9, 11), P('ruecken', 3, 0.5, 0.2, 25, 30, 1), P('aermel_r', 1, 0.58, 0.32, 7, 9), P('aermel_l', 2, 0.42, 0.32, 7, 9)] },
    { id: 'baby', name: ['Babybody', 'Babybody', 'Baby bodysuit'], cm: 34, colors: C_BABY, color: 'weiss',
      pos: [P('brust_m', 0, 0.5, 0.33, 8, 10), P('ruecken', 3, 0.5, 0.2, 10, 14, 1)] },
    { id: 'kappe', name: ['Kappe', 'Kasket', 'Cap'], cm: 21, colors: C_CAP, color: 'schwarz',
      pos: [P('cap_v', 0, 0.5, 0.42, 8, 10), P('cap_r', 1, 0.62, 0.45, 5, 6), P('cap_l', 2, 0.38, 0.45, 5, 6), P('cap_h', 3, 0.5, 0.36, 5, 7)] },
    // Tasse: drei Ansichten (Griff links, vorne, Griff rechts), nur weiß; Maßstab über den Tassenkörper der mittleren Ansicht
    { id: 'tasse', name: ['Tasse', 'Krus', 'Mug'], cm: 8.2, ref: 1, views: 'mug', colors: ['weiss'], color: 'weiss', tech: ['subli'],
      pos: [P('tasse_v', 1, 0.5, 0.52, 7, 8), P('tasse_1', 0, 0.63, 0.52, 5, 6), P('tasse_2', 2, 0.37, 0.52, 5, 6)] },
  ];
  const TECH = ['stick', 'dtf', 'plott', 'sieb'];

  const L = (arr, lang) => arr[{ de: 0, da: 1, en: 2 }[lang] ?? 0];
  const hexRgb = (hx) => { const v = parseInt(hx.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
  const el = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'style') e.style.cssText = v; else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
    return e;
  };
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const ctx2 = (c) => c.getContext('2d', { willReadFrequently: true });
  const loadImg = (src) => new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = src; });

  /* ---------- Produktfoto vorbereiten: Hintergrund freistellen, Ansichten finden, Helligkeit messen ---------- */
  function prepare(img, mask, hasAccent, nviews) {
    const w = img.naturalWidth, h = img.naturalHeight, n = w * h;
    const c = canvas(w, h), x = ctx2(c); x.drawImage(img, 0, 0);
    const src = x.getImageData(0, 0, w, h).data;
    // Freistellung kommt fertig als Maske (weiß = Produkt), erstellt mit tools/konfigurator/freistellen.py
    x.clearRect(0, 0, w, h); x.drawImage(mask, 0, 0, w, h);
    const md = x.getImageData(0, 0, w, h).data, alpha = new Uint8ClampedArray(n);
    for (let i = 0; i < n; i++) alpha[i] = md[i * 4];
    // Ansichten: Spalten mit Produktpixeln zu Blöcken zusammenfassen
    const colHas = new Uint8Array(w);
    for (let X = 0; X < w; X++) { let k = 0; for (let Y = 0; Y < h; Y += 2) if (alpha[Y * w + X] > 128 && ++k > 3) { colHas[X] = 1; break; } }
    let runs = [], st = -1, gap = 0;
    for (let X = 0; X <= w; X++) {
      const on = X < w && colHas[X];
      if (on) { if (st < 0) st = X; gap = 0; } else if (st >= 0 && (++gap > 12 || X === w)) { runs.push([st, X - gap]); st = -1; gap = 0; }
    }
    runs = runs.filter((r) => r[1] - r[0] > 30);
    if (runs.length !== nviews) { const q = w / nviews; runs = Array.from({ length: nviews }, (_, k) => [Math.round(k * q), Math.round((k + 1) * q) - 1]); }
    const views = runs.map(([x0, x1]) => {
      let y0 = h, y1 = 0;
      for (let Y = 0; Y < h; Y++) for (let X = x0; X <= x1; X += 2) if (alpha[Y * w + X] > 128) { if (Y < y0) y0 = Y; if (Y > y1) y1 = Y; break; }
      return { x: x0, y: y0, w: x1 - x0 + 1, h: Math.max(1, y1 - y0 + 1) };
    });
    // Helligkeit (und Akzentflächen wie die orangen Paspeln der Arbeitsjacke)
    const lum = new Float32Array(n), acc = new Float32Array(n), mainL = [];
    for (let i = 0; i < n; i++) {
      if (!alpha[i]) continue;
      const r = src[i * 4], g = src[i * 4 + 1], b = src[i * 4 + 2];
      const Lm = 0.2126 * r + 0.7152 * g + 0.0722 * b; lum[i] = Lm;
      if (hasAccent) {
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = mx ? (mx - mn) / mx : 0;
        let hue = 0; if (mx > mn) { if (mx === r) hue = 60 * (((g - b) / (mx - mn)) % 6); else if (mx === g) hue = 60 * ((b - r) / (mx - mn) + 2); else hue = 60 * ((r - g) / (mx - mn) + 4); if (hue < 0) hue += 360; }
        acc[i] = hue >= 5 && hue <= 50 && mx > 70 ? Math.min(1, Math.max(0, (sat - 0.25) / 0.3)) : 0;
      }
      if (alpha[i] === 255 && i % 3 === 0 && acc[i] <= 0.5) mainL.push(Lm);
    }
    mainL.sort((a, b) => a - b);
    // Bildrauschen glätten: bei dunklen Fotos würde es beim Aufhellen sonst grob und körnig wirken
    const r0 = mainL.length ? mainL[Math.floor(mainL.length / 2)] : 128;
    const rad = r0 < 50 ? 2 : r0 < 110 ? 1 : 0;
    if (rad) {
      const tmp = new Float32Array(n);
      for (let Y = 0; Y < h; Y++) for (let X = 0; X < w; X++) {
        let s = 0, k = 0;
        for (let d = -rad; d <= rad; d++) { const xx = X + d; if (xx >= 0 && xx < w && alpha[Y * w + xx]) { s += lum[Y * w + xx]; k++; } }
        tmp[Y * w + X] = k ? s / k : lum[Y * w + X];
      }
      for (let Y = 0; Y < h; Y++) for (let X = 0; X < w; X++) {
        const i = Y * w + X; if (!alpha[i]) continue;
        let s = 0, k = 0;
        for (let d = -rad; d <= rad; d++) { const yy = Y + d; if (yy >= 0 && yy < h && alpha[yy * w + X]) { s += tmp[yy * w + X]; k++; } }
        lum[i] = k ? s / k : tmp[i];
      }
    }
    const q = (p) => mainL.length ? mainL[Math.min(mainL.length - 1, Math.floor(p * mainL.length))] : 128;
    const ref = Math.max(4, q(0.5));
    const spread = Math.max(Math.log(Math.max(1.0001, q(0.97) / ref)), Math.log(Math.max(0.0001, ref / Math.max(1, q(0.03)))) * 0.8, 1e-3);
    const gain = Math.min(1, Math.log(1.45) / spread);
    // Schattierung für die Logos (Falten dunkeln das Logo leicht ab)
    const shade = canvas(w, h), sd = new ImageData(w, h);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const f = alpha[i] ? Math.exp(Math.log((lum[i] + 0.5) / ref) * gain) : 1;
      const v = 255 * (0.72 + 0.28 * Math.min(1, f));
      sd.data[p] = sd.data[p + 1] = sd.data[p + 2] = v; sd.data[p + 3] = 255;
    }
    shade.getContext('2d').putImageData(sd, 0, 0);
    // Originalfoto (mit grauem Hintergrund und natürlichem Schatten) und Produkt-Umriss für das Zuschneiden der Logos
    const orig = canvas(w, h); orig.getContext('2d').drawImage(img, 0, 0);
    const cut = canvas(w, h), cd = new ImageData(w, h);
    for (let i = 0, p = 0; i < n; i++, p += 4) { cd.data[p] = cd.data[p + 1] = cd.data[p + 2] = 255; cd.data[p + 3] = alpha[i]; }
    cut.getContext('2d').putImageData(cd, 0, 0);
    // Hintergrundfarbe (Mittel der Ecken) zum Auffüllen
    const corner = (X, Y) => { const p = (Y * w + X) * 4; return [src[p], src[p + 1], src[p + 2]]; };
    const cs = [corner(4, 4), corner(w - 5, 4), corner(4, h - 5), corner(w - 5, h - 5)];
    const bgc = 'rgb(' + [0, 1, 2].map((k) => Math.round(cs.reduce((a, c) => a + c[k], 0) / 4)).join(',') + ')';
    return { w, h, n, src, alpha, lum, acc, hasAccent, ref, gain, views, shade, orig, cut, bgc, cache: new Map() };
  }

  function tint(Pp, hx) {
    if (Pp.cache.has(hx)) return Pp.cache.get(hx);
    const out = new ImageData(Pp.w, Pp.h), d = out.data, src = Pp.src, A = Pp.alpha;
    const room = (c) => { const Y = (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255, s = 1 - 0.1 * Y * Y; return c.map((v) => v * s); };
    const [tr, tg, tb] = room(hexRgb(hx));
    const sh = (t, f) => (f <= 1 ? t * f : t + (255 - t) * Math.min(1, f - 1));
    // helle Farbe auf dunklem Foto: Kontrast etwas zurücknehmen, sonst treten Bildfehler hervor
    const ty = (0.2126 * tr + 0.7152 * tg + 0.0722 * tb) / 255;
    const gain = Pp.gain * (Pp.ref < 50 ? 1 - 0.35 * Math.max(0, ty - 0.4) / 0.6 : 1);
    for (let i = 0, p = 0; i < Pp.n; i++, p += 4) {
      const a = A[i];
      if (!a) continue;
      const f = Math.exp(Math.log((Pp.lum[i] + 0.5) / Pp.ref) * gain);
      let r = sh(tr, f), g = sh(tg, f), b = sh(tb, f);
      const wa = Pp.hasAccent ? Pp.acc[i] : 0;
      if (wa > 0) { r += (src[p] - r) * wa; g += (src[p + 1] - g) * wa; b += (src[p + 2] - b) * wa; }
      d[p] = r; d[p + 1] = g; d[p + 2] = b; d[p + 3] = a;
    }
    const c = canvas(Pp.w, Pp.h); c.getContext('2d').putImageData(out, 0, 0);
    if (Pp.cache.size > 12) Pp.cache.delete(Pp.cache.keys().next().value);
    Pp.cache.set(hx, c);
    return c;
  }

  /* ---------- Logo laden: weißen Hintergrund vom Rand her entfernen, zuschneiden ---------- */
  async function loadLogo(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImg(url);
      let iw = img.naturalWidth || 0, ih = img.naturalHeight || 0;
      const isSvg = /svg/i.test(file.type) || /\.svg$/i.test(file.name);
      if (isSvg && (!iw || !ih)) { iw = 1000; ih = 1000; }
      if (!iw || !ih) throw new Error('size');
      const s = Math.min(1, 1400 / Math.max(iw, ih)) * (isSvg ? Math.max(1, 1000 / Math.max(iw, ih)) : 1);
      const w = Math.max(1, Math.round(iw * s)), h = Math.max(1, Math.round(ih * s)), n = w * h;
      const c = canvas(w, h), x = ctx2(c); x.drawImage(img, 0, 0, w, h);
      const id = x.getImageData(0, 0, w, h), d = id.data;
      // hat das Bild schon Transparenz am Rand? Dann nichts freistellen.
      let transpEdge = 0, edge = 0;
      const ed = (i) => { edge++; if (d[i * 4 + 3] < 200) transpEdge++; };
      for (let X = 0; X < w; X++) { ed(X); ed((h - 1) * w + X); }
      for (let Y = 0; Y < h; Y++) { ed(Y * w); ed(Y * w + w - 1); }
      if (transpEdge / edge < 0.5) {
        const wt = (i) => { const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2]; return Math.min(r, g, b) >= 228 && Math.max(r, g, b) - Math.min(r, g, b) <= 22; };
        const bg = new Uint8Array(n), stack = new Int32Array(n); let sp = 0;
        const seed = (i) => { if (!bg[i] && wt(i)) { bg[i] = 1; stack[sp++] = i; } };
        for (let X = 0; X < w; X++) { seed(X); seed((h - 1) * w + X); }
        for (let Y = 0; Y < h; Y++) { seed(Y * w); seed(Y * w + w - 1); }
        while (sp) {
          const i = stack[--sp], X = i % w;
          for (const q of [X > 0 ? i - 1 : -1, X < w - 1 ? i + 1 : -1, i - w, i + w]) if (q >= 0 && q < n && !bg[q] && wt(q)) { bg[q] = 1; stack[sp++] = q; }
        }
        for (let i = 0; i < n; i++) {
          if (bg[i]) { d[i * 4 + 3] = 0; continue; }
          // weiche Kante: helle Randpixel neben dem Hintergrund teilweise durchsichtig
          const X = i % w;
          const nb = (X > 0 && bg[i - 1]) || (X < w - 1 && bg[i + 1]) || (i >= w && bg[i - w]) || (i < n - w && bg[i + w]);
          if (nb) { const m = Math.min(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]); d[i * 4 + 3] = Math.min(d[i * 4 + 3], Math.max(60, 255 - Math.max(0, m - 150) * 2)); }
        }
        x.putImageData(id, 0, 0);
      }
      // auf den sichtbaren Inhalt zuschneiden
      let x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let Y = 0; Y < h; Y++) for (let X = 0; X < w; X++) if (d[(Y * w + X) * 4 + 3] > 24) { if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y; }
      if (x1 < 0) throw new Error('empty');
      const cw = x1 - x0 + 1, ch = y1 - y0 + 1, out = canvas(cw, ch);
      out.getContext('2d').drawImage(c, x0, y0, cw, ch, 0, 0, cw, ch);
      return { canvas: out, name: file.name, file, thumb: out.toDataURL('image/png') };
    } finally { URL.revokeObjectURL(url); }
  }

  /* ---------- Oberfläche ---------- */
  async function mount(root, opts) {
    opts = opts || {};
    const mode = opts.mode === 'werkstatt' ? 'werkstatt' : 'kunde';
    const base = opts.base || '';
    let lang = TX[opts.lang] ? opts.lang : 'de';
    const T = () => TX[lang];
    const OV = window.WF_KONFIG_OVERRIDES || {};
    const prodDef = (p) => {
      const o = OV[p.id] || {};
      return { ...p, colors: (o.colors || p.colors).filter((c) => COLORS[c]), pos: p.pos.map((x) => ({ ...x, max: (o.max && o.max[x.id]) || x.max, def: Math.min((o.max && o.max[x.id]) || x.max, x.def) })) };
    };
    const S = { prod: null, color: null, hex: null, logo: null, places: [], tech: 'stick', rights: false, view: 0 };
    const prepared = new Map();
    let cur = null, composed = null;

    root.classList.add('wfk');
    root.replaceChildren();
    const cv = canvas(800, 800), stage = el('div', { class: 'wfk-stage loading' + (mode === 'werkstatt' ? ' drag' : '') }, cv, el('div', { class: 'wfk-vlabel' }), el('div', { class: 'wfk-busy' }));
    const thumbs = el('div', { class: 'wfk-thumbs' });
    const noteApprox = el('p', { class: 'wfk-note' });
    const noteDrag = mode === 'werkstatt' ? el('p', { class: 'wfk-note' }) : null;
    const dlBtn = mode === 'werkstatt' ? el('button', { type: 'button', class: 'wfk-btn small', onclick: () => download() }) : null;
    const view = el('div', { class: 'wfk-view' }, stage, thumbs, noteApprox, noteDrag, dlBtn ? el('div', { class: 'wfk-row' }, dlBtn) : null);
    const side = el('div', { class: 'wfk-side' });
    root.append(view, side);

    const secProd = el('div', { class: 'wfk-sec' }), secColor = el('div', { class: 'wfk-sec' }), secLogo = el('div', { class: 'wfk-sec' });
    const secPos = el('div', { class: 'wfk-sec' }), secTech = el('div', { class: 'wfk-sec' }), secRights = el('div', { class: 'wfk-sec' });
    side.append(secProd, secColor, secLogo, secPos, secTech);
    if (mode === 'kunde') side.append(secRights);
    const fileIn = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/svg+xml,.svg,.png,.jpg,.jpeg', class: 'wfk-hidden' });
    root.append(fileIn);
    let logoErr = '';

    const changed = () => { if (opts.onChange) try { opts.onChange(api); } catch (e) { /* egal */ } };

    function drawSide() {
      const t = T(), p = S.prod;
      secProd.replaceChildren(el('h4', {}, t.product, el('b', {}, L(p.name, lang))), el('div', { class: 'wfk-prods' },
        PRODUCTS.map((q) => el('button', { type: 'button', class: q.id === p.id ? 'on' : '', title: L(q.name, lang), onclick: () => choose(q.id) },
          el('img', { alt: '', src: base + 'img/' + q.id + '-t.jpg', loading: 'lazy' }), L(q.name, lang)))));
      const cname = COLORS[S.color] ? L(COLORS[S.color], lang) : S.hex.toUpperCase();
      secColor.replaceChildren(el('h4', {}, t.color, el('b', {}, cname)), el('div', { class: 'wfk-sw' },
        p.colors.map((c) => el('button', { type: 'button', title: L(COLORS[c], lang), 'aria-label': L(COLORS[c], lang), class: c === S.color ? 'on' : '', style: 'background:' + COLORS[c][3], onclick: () => setColor(c) }))),
        ...(mode !== 'werkstatt' ? [] : [el('label', { class: 'wfk-own' }, el('input', { type: 'color', value: S.hex, oninput: (e) => { S.color = 'eigen'; S.hex = e.target.value; render(); secColor.querySelector('h4 b').textContent = S.hex.toUpperCase(); for (const b of secColor.querySelectorAll('.wfk-sw button')) b.classList.remove('on'); changed(); } }), t.own_color)]));
      secColor.classList.toggle('wfk-hidden', mode === 'kunde' && p.colors.length < 2);
      secLogo.replaceChildren(el('h4', {}, t.logo),
        S.logo ? el('div', { class: 'wfk-logo' }, el('span', { class: 'prev' }, el('img', { alt: '', src: S.logo.thumb })), el('span', { class: 'nm' }, S.logo.name),
          el('div', { class: 'wfk-row' }, el('button', { type: 'button', class: 'wfk-btn small', onclick: () => fileIn.click() }, t.logo_change),
            el('button', { type: 'button', class: 'wfk-btn small', onclick: () => { S.logo = null; S.rights = false; drawSide(); render(); changed(); } }, t.logo_remove)))
          : el('button', { type: 'button', class: 'wfk-btn primary', onclick: () => fileIn.click() }, '⬆ ' + t.logo_up),
        el('p', { class: 'wfk-note', style: 'margin-top:8px' + (logoErr ? ';color:#dc2626' : '') }, logoErr || t.logo_hint));
      const pos = el('div', {});
      for (const pl of S.places) {
        const d = p.pos.find((x) => x.id === pl.id); if (!d) continue;
        const max = mode === 'werkstatt' ? Math.max(d.max, 40) : d.max;
        const val = el('b', {}, pl.cm + ' cm');
        pos.append(el('label', { class: 'wfk-size' }, el('span', { class: 'lbl' }, el('span', {}, t.size + ' ' + L(PN[pl.id], lang), ' ', el('small', { style: 'color:var(--_muted)' }, '(' + t.size_side + ')')), val),
          el('input', { type: 'range', min: 2, max, step: 0.5, value: pl.cm, oninput: (e) => { pl.cm = +e.target.value; val.textContent = pl.cm + ' cm'; render(); changed(); } })));
        if (mode === 'werkstatt' && (pl.dx || pl.dy)) pos.append(el('div', { class: 'wfk-row', style: 'margin-top:4px' }, el('button', { type: 'button', class: 'wfk-btn small', onclick: () => { pl.dx = pl.dy = 0; drawSide(); render(); changed(); } }, '⟲ ' + t.reset + ' (' + L(PN[pl.id], lang) + ')')));
      }
      secPos.replaceChildren(el('h4', {}, t.pos), el('div', { class: 'wfk-chips' },
        p.pos.map((d) => el('button', { type: 'button', class: S.places.some((x) => x.id === d.id) ? 'on' : '', onclick: () => togglePlace(d) }, L(PN[d.id], lang)))),
        pos, el('p', { class: 'wfk-note', style: 'margin-top:10px' }, t.pos_hint));
      secTech.replaceChildren(el('h4', {}, t.tech), el('div', { class: 'wfk-tech' },
        (p.tech || TECH).map((k) => el('button', { type: 'button', class: S.tech === k ? 'on' : '', onclick: () => { S.tech = k; drawSide(); changed(); } }, t['t_' + k], el('small', {}, t['t_' + k + '_d'])))));
      const cb = el('input', { type: 'checkbox', onchange: (e) => { S.rights = e.target.checked; changed(); } });
      cb.checked = S.rights;
      secRights.replaceChildren(el('label', { class: 'wfk-check' }, cb, el('span', {}, t.rights)));
      secRights.classList.toggle('wfk-hidden', !S.logo);
      noteApprox.textContent = t.approx;
      if (noteDrag) noteDrag.textContent = t.drag;
      if (dlBtn) dlBtn.textContent = '⬇ ' + t.download;
      stage.querySelector('.wfk-busy').textContent = t.loading;
      drawThumbsLabels();
    }

    function togglePlace(d) {
      const i = S.places.findIndex((x) => x.id === d.id);
      if (i >= 0) S.places.splice(i, 1); else { S.places.push({ id: d.id, cm: d.def, dx: 0, dy: 0 }); S.view = d.view; }
      drawSide(); render(); changed();
    }
    function setColor(c) { S.color = c; S.hex = COLORS[c][3]; drawSide(); render(); changed(); }

    async function choose(id) {
      const raw = PRODUCTS.find((x) => x.id === id) || PRODUCTS[0];
      const p = prodDef(raw);
      const keep = S.prod ? S.places.map((x) => x.id) : null;
      S.prod = p;
      if (!p.colors.includes(S.color) && S.color !== 'eigen') S.color = p.colors.includes(p.color) ? p.color : p.colors[0];
      if (S.color !== 'eigen') S.hex = COLORS[S.color][3];
      if (!(p.tech || TECH).includes(S.tech)) S.tech = (p.tech || TECH)[0];
      // Positionen übernehmen, soweit es sie beim neuen Produkt gibt; sonst die erste Standardposition
      S.places = (keep || []).map((pid) => p.pos.find((d) => d.id === pid)).filter(Boolean).map((d) => ({ id: d.id, cm: d.def, dx: 0, dy: 0 }));
      if (!S.places.length) S.places = [{ id: p.pos[0].id, cm: p.pos[0].def, dx: 0, dy: 0 }];
      S.view = (p.pos.find((d) => d.id === S.places[0].id) || p.pos[0]).view;
      drawSide();
      stage.classList.add('loading');
      try {
        if (!prepared.has(p.id)) {
          const [img, mask] = await Promise.all([loadImg(base + 'img/' + p.id + '.jpg'), loadImg(base + 'img/' + p.id + '-m.png')]);
          await new Promise((r) => setTimeout(r, 16));
          prepared.set(p.id, prepare(img, mask, false, p.views === 'mug' ? 3 : 4));
        }
        if (S.prod !== p) return;
        cur = prepared.get(p.id);
        render();
      } finally { if (S.prod === p) stage.classList.remove('loading'); }
      changed();
    }

    /* Logo-Platzierung in Bildpixeln */
    function placeRect(pl) {
      const d = S.prod.pos.find((x) => x.id === pl.id), v = cur.views[d.view];
      const pxcm = cur.views[S.prod.ref || 0].w / S.prod.cm;
      const lw = S.logo ? S.logo.canvas.width : 1, lh = S.logo ? S.logo.canvas.height : 1;
      const side = pl.cm * pxcm, sc = side / Math.max(lw, lh);
      const w = lw * sc, h = lh * sc;
      const cx = v.x + v.w * d.fx + (pl.dx || 0) * pxcm;
      let cy = v.y + v.h * d.fy + (pl.dy || 0) * pxcm;
      if (d.top) cy += h / 2;
      return { x: cx - w / 2, y: cy - h / 2, w, h, view: d.view, pxcm };
    }

    function compose() {
      if (!cur) return null;
      // Weiß = Originalfoto, sonst das eingefärbte Produkt über das Foto legen (Hintergrund und Schatten bleiben echt)
      const g = S.hex.toLowerCase() === '#ffffff' ? null : tint(cur, S.hex);
      const out = canvas(cur.w, cur.h), o = out.getContext('2d');
      o.drawImage(cur.orig, 0, 0);
      if (g) o.drawImage(g, 0, 0);
      if (S.logo && S.places.length) {
        const lay = canvas(cur.w, cur.h), l = lay.getContext('2d');
        for (const pl of S.places) { const r = placeRect(pl); l.drawImage(S.logo.canvas, r.x, r.y, r.w, r.h); }
        l.globalCompositeOperation = 'destination-in'; l.drawImage(cur.cut, 0, 0);   // nur auf dem Produkt
        const sh = canvas(cur.w, cur.h), s = sh.getContext('2d');
        s.drawImage(cur.shade, 0, 0); s.globalCompositeOperation = 'destination-in'; s.drawImage(lay, 0, 0);
        o.drawImage(lay, 0, 0);
        o.globalCompositeOperation = 'multiply'; o.drawImage(sh, 0, 0); o.globalCompositeOperation = 'source-over';
      }
      return out;
    }

    function viewBox(k) {
      const v = cur.views[k], side = Math.max(v.w, v.h) * 1.08;
      return { x: v.x + v.w / 2 - side / 2, y: v.y + v.h / 2 - side / 2, s: side };
    }
    /* eine Ansicht quadratisch zeichnen, ohne Teile der Nachbaransichten */
    function drawView(x, k, size) {
      const b = viewBox(k), v = cur.views[k], f = size / b.s;
      const sx0 = Math.max(b.x, v.x - 6, 0), sx1 = Math.min(b.x + b.s, v.x + v.w + 6, cur.w);
      const sy0 = Math.max(b.y, 0), sy1 = Math.min(b.y + b.s, cur.h);
      x.fillStyle = cur.bgc; x.fillRect(0, 0, size, size);
      if (sx1 > sx0 && sy1 > sy0) x.drawImage(composed, sx0, sy0, sx1 - sx0, sy1 - sy0, (sx0 - b.x) * f, (sy0 - b.y) * f, (sx1 - sx0) * f, (sy1 - sy0) * f);
    }
    function drawThumbsLabels() {
      const t = T();
      const vn = S.prod && S.prod.views === 'mug' ? t.vmug : t.views;
      stage.querySelector('.wfk-vlabel').textContent = vn[S.view] || '';
      [...thumbs.children].forEach((b, k) => { b.title = vn[k]; b.setAttribute('aria-label', vn[k]); });
    }
    function render() {
      if (!cur) return;
      composed = compose();
      const x = cv.getContext('2d');
      drawView(x, S.view, cv.width);
      if (thumbs.children.length !== cur.views.length) {
        thumbs.replaceChildren();
        thumbs.style.gridTemplateColumns = `repeat(${cur.views.length}, minmax(0, 1fr))`;
        for (let k = 0; k < cur.views.length; k++) thumbs.append(el('button', { type: 'button', onclick: () => { S.view = k; render(); } }, canvas(160, 160)));
      }
      const used = new Set(S.logo ? S.places.map((pl) => S.prod.pos.find((d) => d.id === pl.id).view) : []);
      [...thumbs.children].forEach((btn, k) => {
        const c = btn.querySelector('canvas');
        drawView(c.getContext('2d'), k, c.width);
        btn.classList.toggle('on', k === S.view);
        const dot = btn.querySelector('.dot'); if (used.has(k) && !dot) btn.append(el('span', { class: 'dot' })); else if (!used.has(k) && dot) dot.remove();
      });
      drawThumbsLabels();
    }

    /* Werkstatt: Logo im Bild verschieben */
    if (mode === 'werkstatt') {
      let drag = null;
      const toImg = (e) => { const r = cv.getBoundingClientRect(), b = viewBox(S.view); return { x: b.x + (e.clientX - r.left) / r.width * b.s, y: b.y + (e.clientY - r.top) / r.height * b.s }; };
      cv.addEventListener('pointerdown', (e) => {
        if (!cur || !S.logo) return;
        const p = toImg(e);
        const pl = S.places.find((q) => { const r = placeRect(q); return r.view === S.view && p.x >= r.x - 10 && p.x <= r.x + r.w + 10 && p.y >= r.y - 10 && p.y <= r.y + r.h + 10; });
        if (!pl) return;
        drag = { pl, x: p.x, y: p.y, dx: pl.dx || 0, dy: pl.dy || 0, pxcm: placeRect(pl).pxcm };
        stage.classList.add('dragging'); cv.setPointerCapture(e.pointerId); e.preventDefault();
      });
      cv.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const p = toImg(e);
        drag.pl.dx = Math.round((drag.dx + (p.x - drag.x) / drag.pxcm) * 10) / 10;
        drag.pl.dy = Math.round((drag.dy + (p.y - drag.y) / drag.pxcm) * 10) / 10;
        render();
      });
      const end = () => { if (!drag) return; drag = null; stage.classList.remove('dragging'); drawSide(); changed(); };
      cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    }

    fileIn.addEventListener('change', async () => {
      const f = fileIn.files && fileIn.files[0]; fileIn.value = '';
      if (!f) return;
      try { S.logo = await loadLogo(f); logoErr = ''; S.rights = false; if (S.places.length) S.view = S.prod.pos.find((d) => d.id === S.places[0].id).view; }
      catch (e) { logoErr = T().logo_bad; }
      drawSide(); render(); changed();
    });

    function config() {
      const p = S.prod;
      return {
        product: p.id, product_name: L(p.name, 'de'), color: S.color, color_name: COLORS[S.color] ? L(COLORS[S.color], 'de') : S.hex.toUpperCase(), color_hex: S.hex,
        tech: S.tech, tech_name: TX.de['t_' + S.tech],
        places: S.places.map((pl) => ({ pos: pl.id, name: L(PN[pl.id], 'de'), cm: pl.cm, dx: pl.dx || 0, dy: pl.dy || 0 })),
        logo: S.logo ? S.logo.name : '', rights: !!S.rights,
      };
    }
    function summary(lg) {
      const t = TX[lg || lang] || TX.de, l2 = lg || lang, p = S.prod;
      const cn = COLORS[S.color] ? L(COLORS[S.color], l2) : S.hex.toUpperCase();
      const pos = S.places.map((pl) => L(PN[pl.id], l2) + ' (' + String(pl.cm).replace('.', ',') + ' cm' + (pl.dx || pl.dy ? ', ' + t.s_moved : '') + ')').join(', ');
      return [t.s_product + ': ' + L(p.name, l2), t.s_color + ': ' + cn + (COLORS[S.color] ? '' : ''), t.s_tech + ': ' + t['t_' + S.tech],
        t.s_pos + ': ' + (pos || '–'), t.s_logo + ': ' + (S.logo ? S.logo.name : t.s_none)].join('\n');
    }
    function full(bg) {
      if (!cur) return null;
      const c = compose(), out = canvas(c.width, c.height), o = out.getContext('2d');
      o.drawImage(c, 0, 0);
      return out;
    }
    const previewBlob = (type, q) => new Promise((ok) => { const c = full(true); if (!c) return ok(null); c.toBlob((b) => ok(b), type || 'image/jpeg', q || 0.88); });
    function download() {
      const c = full(true); if (!c) return;
      c.toBlob((b) => {
        const a = el('a', { href: URL.createObjectURL(b), download: 'vorschau-' + S.prod.id + '-' + (S.color === 'eigen' ? S.hex.slice(1) : S.color) + '.png' });
        document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }, 'image/png');
    }
    function validate() {
      if (!S.places.length) return T().pos_none;
      if (mode === 'kunde' && S.logo && !S.rights) return T().rights_err;
      return null;
    }

    const api = {
      config, summary, previewBlob, download, validate, logoFile: () => (S.logo ? S.logo.file : null), hasLogo: () => !!S.logo,
      setLang: (l) => { if (TX[l]) { lang = l; drawSide(); } },
      techLabel: () => TX.de['t_' + S.tech],
      tech: () => S.tech,
    };
    // Voreinstellung (z. B. aus einer Kundenanfrage): Produkt, Farbe, Veredelung, Positionen, Logo
    const pre = opts.preset || {};
    await choose(pre.product || opts.product || PRODUCTS[0].id);
    if (pre.color && (COLORS[pre.color] || /^#[0-9a-f]{6}$/i.test(pre.color_hex || ''))) {
      if (COLORS[pre.color] && (S.prod.colors.includes(pre.color) || mode === 'werkstatt')) { S.color = pre.color; S.hex = COLORS[pre.color][3]; }
      else if (mode === 'werkstatt' && pre.color_hex) { S.color = 'eigen'; S.hex = pre.color_hex.toLowerCase(); }
    }
    if ((S.prod.tech || TECH).includes(pre.tech)) S.tech = pre.tech;
    if (Array.isArray(pre.places) && pre.places.length) {
      const pl = pre.places.map((x) => { const d = S.prod.pos.find((q) => q.id === x.pos); return d ? { id: d.id, cm: Math.max(2, Math.min(40, +x.cm || d.def)), dx: +x.dx || 0, dy: +x.dy || 0 } : null; }).filter(Boolean);
      if (pl.length) { S.places = pl; S.view = S.prod.pos.find((d) => d.id === pl[0].id).view; }
    }
    if (pre.logoFile) { try { S.logo = await loadLogo(pre.logoFile); S.rights = true; } catch (e) { /* Logo nicht lesbar */ } }
    drawSide(); render(); changed();
    return api;
  }

  window.WFKonfig = { mount, PRODUCTS, COLORS };
})();
