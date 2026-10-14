/* Stoffprofile: automatische Anpassung der Sticheigenschaften an das Textil
   und Empfehlungen für Stickvlies, Topper, Nadel und Geschwindigkeit. */
(function (g) {
  const HW = (g.HW = g.HW || {});
  const G = HW.geo;

  /*
   * density:   Faktor auf den Satin-Abstand (>1 = lockerer, weniger Einstiche)
   * fillSp:    Tatami-Reihenabstand (mm)
   * len:       Tatami-Stichlänge (mm)
   * pull/pullPct: Zugkompensation = pull + Breite * pullPct (je Seite, mm)
   * fillPull:  Zugkompensation Flächen (mm)
   * ul:        Unterlagen-Stärke für Satin: 'light' | 'normal' | 'heavy'
   * fillUl:    Unterlage Flächen
   * satinMax:  ab dieser Säulenbreite wird geteilt (Auto-Split, mm)
   * minSatin:  schmalere Säulen werden auf diesem Stoff kaum sichtbar (mm)
   * stab:      Vlies-Vorschlag {art, gewicht, lagen}; topper: wasserlöslicher Topper nötig
   */
  const FABRICS = [
    { id: 'baumwolle', name: 'Baumwolle gewebt (Hemd, Tasche, Schürze)', density: 1.0, fillSp: 0.40, len: 3.5, pull: 0.15, pullPct: 0.03, fillPull: 0.2, ul: 'normal', fillUl: 'edge+tatami', satinMax: 7, minSatin: 0.8,
      stab: { art: 'Reißvlies (Tearaway)', gewicht: 'mittel, ca. 60–80 g/m²', lagen: 1, stretch: false }, topper: false, needle: '75/11 Spitze', spm: 850,
      tips: ['Stoff glatt, aber nicht gedehnt einspannen.'] },
    { id: 'tshirt', name: 'T-Shirt / Jersey (dünner Strick)', density: 1.15, fillSp: 0.45, len: 3.0, pull: 0.25, pullPct: 0.06, fillPull: 0.35, ul: 'heavy', fillUl: 'edge+tatami', satinMax: 6, minSatin: 1.0,
      stab: { art: 'Schneidvlies (Cutaway) oder No-Show-Mesh', gewicht: 'ca. 2,5 oz / 75 g/m²', lagen: 1, stretch: true }, topper: false, needle: '75/11 Kugelspitze (Ballpoint)', spm: 700,
      tips: ['Kein Reißvlies verwenden – der Stoff dehnt sich, das Motiv verzieht sich.', 'Vlies mit Sprühkleber oder Bügelvlies fixieren, Stoff nicht dehnen.', 'Lieber offene, leichte Motive; große Tatamiflächen vermeiden.'] },
    { id: 'sweat', name: 'Sweatshirt / Hoodie / Fleece', density: 1.1, fillSp: 0.42, len: 3.2, pull: 0.25, pullPct: 0.05, fillPull: 0.3, ul: 'heavy', fillUl: 'edge+tatami', satinMax: 6.5, minSatin: 1.2,
      stab: { art: 'Schneidvlies (Cutaway)', gewicht: 'ca. 2,5–3 oz', lagen: 1, stretch: true }, topper: true, needle: '75/11 Kugelspitze', spm: 750,
      tips: ['Wasserlöslichen Topper oben auflegen, damit die Stiche nicht im Flor versinken.'] },
    { id: 'polo', name: 'Polo / Piqué', density: 1.1, fillSp: 0.42, len: 3.2, pull: 0.25, pullPct: 0.05, fillPull: 0.3, ul: 'heavy', fillUl: 'edge+tatami', satinMax: 6, minSatin: 1.0,
      stab: { art: 'Schneidvlies / No-Show-Mesh', gewicht: 'ca. 2,5 oz', lagen: 1, stretch: true }, topper: true, needle: '75/11 Kugelspitze', spm: 750,
      tips: ['Piqué-Struktur: Topper verhindert, dass dünne Stiche in den Waben verschwinden.'] },
    { id: 'jeans', name: 'Jeans / Denim / Canvas', density: 0.95, fillSp: 0.40, len: 3.8, pull: 0.12, pullPct: 0.02, fillPull: 0.15, ul: 'normal', fillUl: 'edge+tatami', satinMax: 7.5, minSatin: 0.8,
      stab: { art: 'Reißvlies (Tearaway)', gewicht: 'mittel bis fest, 80–100 g/m²', lagen: 1, stretch: false }, topper: false, needle: '90/14 Spitze (Jeans)', spm: 750,
      tips: ['Dicke Nähte nicht unter den Stickbereich legen.'] },
    { id: 'leder', name: 'Leder / Kunstleder', density: 1.3, fillSp: 0.50, len: 4.0, pull: 0.08, pullPct: 0.01, fillPull: 0.1, ul: 'light', fillUl: 'edge', satinMax: 6, minSatin: 1.0,
      stab: { art: 'Reißvlies (Tearaway)', gewicht: 'mittel', lagen: 1, stretch: false }, topper: false, needle: '80/12 Ledernadel (Schneidspitze)', spm: 500,
      tips: ['Jeder Einstich bleibt als Loch sichtbar – weniger Dichte, keine Korrekturen nach dem Sticken.', 'Leder nicht einspannen (Abdrücke!), sondern auf eingespanntes Klebevlies legen oder mit Klebeband fixieren.', 'Kein Sprühkleber auf Glattleder.'] },
    { id: 'frottee', name: 'Frottee / Handtuch / Bademantel', density: 0.9, fillSp: 0.38, len: 3.0, pull: 0.2, pullPct: 0.04, fillPull: 0.25, ul: 'heavy', fillUl: 'edge+tatami', satinMax: 6, minSatin: 1.5,
      stab: { art: 'Reißvlies (Tearaway)', gewicht: 'mittel', lagen: 1, stretch: false }, topper: true, needle: '80/12 Spitze', spm: 750,
      tips: ['Wasserlöslicher Topper ist Pflicht, sonst verschwindet die Stickerei in den Schlingen.', 'Sehr feine Linien und Schrift unter 6 mm vermeiden.'] },
    { id: 'kappe', name: 'Kappe / Basecap', density: 1.0, fillSp: 0.40, len: 3.2, pull: 0.2, pullPct: 0.04, fillPull: 0.25, ul: 'normal', fillUl: 'edge+tatami', satinMax: 6.5, minSatin: 0.9,
      stab: { art: 'Cap-Reißvlies (fest)', gewicht: 'fest, ca. 100 g/m²', lagen: 1, stretch: false }, topper: false, needle: '80/12 Spitze', spm: 650,
      tips: ['Von der Mitte nach außen und von unten nach oben sticken (Reihenfolge prüfen).', 'Kappenrahmen auf der Texi verwenden.'] },
    { id: 'seide', name: 'Seide / Satin / feine Stoffe', density: 1.2, fillSp: 0.45, len: 3.0, pull: 0.12, pullPct: 0.02, fillPull: 0.15, ul: 'light', fillUl: 'edge', satinMax: 5.5, minSatin: 0.7,
      stab: { art: 'Leichtes Schneidvlies (No-Show-Mesh) oder wasserlösliches Gewebevlies', gewicht: 'leicht', lagen: 1, stretch: false }, topper: false, needle: '65/9 oder 70/10 Microtex', spm: 600,
      tips: ['Leichte Motive wählen, dichte Flächen ziehen den Stoff zusammen.'] },
    { id: 'softshell', name: 'Softshell / Nylon / Jacken', density: 1.15, fillSp: 0.45, len: 3.2, pull: 0.2, pullPct: 0.04, fillPull: 0.25, ul: 'normal', fillUl: 'edge+tatami', satinMax: 6, minSatin: 0.9,
      stab: { art: 'Schneidvlies (Cutaway)', gewicht: 'mittel', lagen: 1, stretch: true }, topper: false, needle: '70/10 Microtex', spm: 650,
      tips: ['Möglichst wenige Einstiche – Membran wird sonst undicht.'] },
    { id: 'strick', name: 'Strick / Mütze (Beanie)', density: 1.1, fillSp: 0.42, len: 3.0, pull: 0.3, pullPct: 0.06, fillPull: 0.35, ul: 'heavy', fillUl: 'edge+tatami', satinMax: 6, minSatin: 1.3,
      stab: { art: 'Schneidvlies (Cutaway)', gewicht: 'ca. 2,5 oz', lagen: 1, stretch: true }, topper: true, needle: '75/11 Kugelspitze', spm: 650,
      tips: ['Topper auflegen, Mütze nicht dehnen.'] },
    { id: 'filz', name: 'Filz / Aufnäher-Basis', density: 1.0, fillSp: 0.40, len: 3.5, pull: 0.1, pullPct: 0.02, fillPull: 0.15, ul: 'normal', fillUl: 'edge+tatami', satinMax: 7, minSatin: 0.8,
      stab: { art: 'Reißvlies (Tearaway)', gewicht: 'mittel', lagen: 1, stretch: false }, topper: false, needle: '75/11 Spitze', spm: 800,
      tips: ['Für Aufnäher: Satinrand mindestens 3 mm breit.'] },
  ];
  const byId = (id) => FABRICS.find((f) => f.id === id) || FABRICS[0];

  // Satin: Abstand abhängig von der Säulenbreite (schmal = offener, breit = dichter)
  function widthFactor(w) {
    if (w < 1.2) return 1.3;
    if (w < 2) return 1.15;
    if (w < 4) return 1.0;
    if (w < 6) return 0.95;
    return 0.9;
  }
  function satinUnderlay(w, strength) {
    if (strength === 'light') return w < 2.5 ? 'none' : w < 5 ? 'center' : 'edge';
    if (strength === 'heavy') return w < 1.2 ? 'center' : w < 2.5 ? 'edge' : 'edge+zigzag';
    return w < 1.2 ? 'none' : w < 2.5 ? 'center' : w < 4 ? 'edge' : 'edge+zigzag';
  }

  // Mittlere Säulenbreite aus den Schienen
  function columnWidth(obj) {
    if (obj.type === 'colC') return obj.params.width || 3;
    const segs = HW.stitch.railsFor(obj);
    if (!segs) return 3;
    const ws = [];
    for (const s of segs) {
      const la = G.polyLength(s.L), lb = G.polyLength(s.R);
      for (let i = 0; i <= 4; i++) ws.push(G.dist(G.pointAt(s.L, (la * i) / 4), G.pointAt(s.R, (lb * i) / 4)));
    }
    ws.sort((a, b) => a - b);
    return ws[Math.floor(ws.length / 2)] || 3;
  }

  const MANAGED = {
    satin: ['spacing', 'pull', 'underlay', 'split'],
    fill: ['spacing', 'len', 'pull', 'underlay'],
  };

  /** Wirksame Parameter eines Objekts für einen Stoff. Von Hand gesetzte Werte (obj.manual) bleiben erhalten. */
  function effective(obj, fabId) {
    const p = obj.params || {};
    if (!fabId || obj.autoFab === false || obj.type === 'manual' || obj.type === 'run') return { params: p, auto: {} };
    const f = byId(fabId);
    const man = obj.manual || {};
    const auto = {};
    if (obj.type === 'fill') {
      const sat = p.fillType === 'satin';
      auto.spacing = sat ? +(0.4 * f.density).toFixed(2) : f.fillSp;
      auto.len = f.len;
      auto.pull = f.fillPull;
      auto.underlay = sat ? (f.ul === 'light' ? 'none' : 'edge') : f.fillUl;
    } else {
      const w = columnWidth(obj);
      auto.spacing = Math.max(0.25, Math.min(0.8, +(0.4 * f.density * widthFactor(w)).toFixed(2)));
      auto.pull = +(f.pull + w * f.pullPct).toFixed(2);
      auto.underlay = p.style === 'e' ? 'none' : satinUnderlay(w, f.ul);
      auto.split = f.satinMax;
      auto._width = w;
    }
    const out = { ...p };
    for (const k of Object.keys(auto)) if (!k.startsWith('_') && !man[k]) out[k] = auto[k];
    return { params: out, auto };
  }

  /** Empfehlung für Vlies & Co. abhängig von Stoff und Motiv */
  function recommend(fabId, objects, stats) {
    const f = byId(fabId);
    const area = Math.max(1, (stats.w * stats.h) / 100); // cm²
    const dens = stats.stitches / area; // Stiche pro cm² der Motivfläche
    let fillArea = 0, narrow = 0, wide = 0;
    for (const o of objects) {
      if (o.hidden) continue;
      if (o.type === 'fill' && o.points && o.points.length > 2) fillArea += Math.abs(G.signedArea(o.points)) / 100;
      if ((o.type === 'colA' || o.type === 'colB' || o.type === 'colC') && o._eff && o._eff.auto && o._eff.auto._width !== undefined) {
        if (o._eff.auto._width < f.minSatin) narrow++;
        if (o._eff.auto._width > 10) wide++;
      }
    }
    let lagen = f.stab.lagen;
    const why = [];
    if (stats.stitches > 15000) { lagen++; why.push(`viele Stiche (${stats.stitches.toLocaleString('de-DE')})`); }
    else if (dens > 110 || fillArea > 40) { lagen++; why.push(dens > 110 ? `dichtes Motiv (${Math.round(dens)} Stiche/cm²)` : `große Füllflächen (${Math.round(fillArea)} cm²)`); }
    if (f.stab.stretch && fillArea > 20 && lagen < 2) { lagen = 2; why.push('dehnbarer Stoff mit Füllflächen'); }
    lagen = Math.min(3, lagen);
    const warn = [];
    if (narrow) warn.push(`${narrow} Satinsäule(n) schmaler als ${f.minSatin} mm – auf diesem Stoff kaum sichtbar.`);
    if (wide) warn.push(`${wide} Satinsäule(n) breiter als 10 mm – lieber als Fläche (Tatami) sticken.`);
    if (f.id === 'leder' && dens > 80) warn.push('Für Leder sehr dicht – Gefahr, dass das Leder ausreißt.');
    if (f.stab.stretch && fillArea > 60) warn.push('Große Füllflächen auf dehnbarem Stoff werden steif und können wellen.');
    return {
      fabric: f,
      vlies: `${lagen} × ${f.stab.art} (${f.stab.gewicht})`,
      lagen, why,
      topper: f.topper ? 'Ja – wasserlöslicher Topper (z. B. Solvy) oben auflegen' : 'nicht nötig',
      needle: f.needle,
      spm: f.spm,
      density: Math.round(dens),
      tips: f.tips,
      warn,
    };
  }

  HW.fabric = { FABRICS, byId, effective, recommend, MANAGED, columnWidth };
})(typeof window !== 'undefined' ? window : globalThis);
