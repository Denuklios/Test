/* LaserStudio – Maschinenprofile und Materialbibliothek (Startwerte, immer mit einem Materialtest prüfen). */
(function (g) {
  const FS = (g.FS = g.FS || {});

  // origin: Ecke des Maschinen-Nullpunkts (ll = links unten, ul = links oben …)
  const MACHINES = {
    // Mecpow X5 Pro: 33 W (optisch), 600 × 600 mm, Steuerung MKS DLC32 (GRBL-ESP32, auch WLAN), Hersteller nennt bis 28.000 mm/min
    mecpowx5pro: { id: 'mecpowx5pro', name: 'Mecpow X5 Pro 33 W (600 × 600 mm)', type: 'diode', w: 600, h: 600, sMax: 1000, rapid: 20000, maxSpeed: 28000, accel: 2500, origin: 'll', baud: 115200, watt: 33 },
    diode400: { id: 'diode400', name: 'Diodenlaser 400 × 400 mm (GRBL)', type: 'diode', w: 400, h: 400, sMax: 1000, rapid: 6000, maxSpeed: 6000, accel: 1500, origin: 'll', baud: 115200, watt: 10 },
    diode300: { id: 'diode300', name: 'Diodenlaser 300 × 300 mm (GRBL)', type: 'diode', w: 300, h: 300, sMax: 1000, rapid: 5000, maxSpeed: 5000, accel: 1200, origin: 'll', baud: 115200, watt: 5 },
    diode800: { id: 'diode800', name: 'Diodenlaser groß 800 × 400 mm (GRBL)', type: 'diode', w: 800, h: 400, sMax: 1000, rapid: 6000, maxSpeed: 6000, accel: 1500, origin: 'll', baud: 115200, watt: 20 },
    ttc450: { id: 'ttc450', name: 'Twotrees TTC450 mit Lasermodul (460 × 460 mm)', type: 'diode', w: 460, h: 460, sMax: 1000, rapid: 1500, maxSpeed: 1000, accel: 300, origin: 'll', baud: 115200, watt: 10 },
    co2: { id: 'co2', name: 'CO2-Laser mit GRBL-Steuerung (600 × 400 mm)', type: 'co2', w: 600, h: 400, sMax: 1000, rapid: 12000, maxSpeed: 24000, accel: 3000, origin: 'ul', baud: 115200, watt: 50 },
    custom: { id: 'custom', name: 'Eigene Maschine', type: 'diode', w: 400, h: 400, sMax: 1000, rapid: 6000, maxSpeed: 6000, accel: 1500, origin: 'll', baud: 115200, watt: 10 },
  };

  // Werte für einen 10-W-Diodenlaser (optische Leistung). Andere Leistungen: Geschwindigkeit wird umgerechnet.
  // mode: line = schneiden/ritzen, fill = Fläche gravieren, image = Foto
  const MATERIALS = [
    { id: 'sperrholz3-cut', mat: 'Sperrholz 3 mm (Pappel)', job: 'Schneiden', mode: 'line', speed: 300, power: 100, passes: 2, air: true },
    { id: 'sperrholz3-fill', mat: 'Sperrholz 3 mm (Pappel)', job: 'Gravieren', mode: 'fill', speed: 3000, power: 40, interval: 0.1, air: false },
    { id: 'sperrholz3-photo', mat: 'Sperrholz 3 mm (Pappel)', job: 'Foto', mode: 'image', speed: 3000, power: 35, interval: 0.1, air: false },
    { id: 'mdf3-cut', mat: 'MDF 3 mm', job: 'Schneiden', mode: 'line', speed: 250, power: 100, passes: 3, air: true },
    { id: 'mdf-fill', mat: 'MDF', job: 'Gravieren', mode: 'fill', speed: 3000, power: 35, interval: 0.1, air: false },
    { id: 'holz-hart-fill', mat: 'Hartholz (Eiche, Buche)', job: 'Gravieren', mode: 'fill', speed: 2500, power: 50, interval: 0.1, air: false },
    { id: 'karton-cut', mat: 'Karton / Graupappe 1,5 mm', job: 'Schneiden', mode: 'line', speed: 600, power: 80, passes: 1, air: true },
    { id: 'papier-cut', mat: 'Papier 160 g', job: 'Schneiden', mode: 'line', speed: 2000, power: 50, passes: 1, air: true },
    { id: 'leder-fill', mat: 'Leder (pflanzlich gegerbt)', job: 'Gravieren', mode: 'fill', speed: 3000, power: 25, interval: 0.1, air: false },
    { id: 'leder-cut', mat: 'Leder 2 mm', job: 'Schneiden', mode: 'line', speed: 400, power: 100, passes: 2, air: true },
    { id: 'acryl-schwarz-cut', mat: 'Acryl schwarz/undurchsichtig 3 mm', job: 'Schneiden', mode: 'line', speed: 150, power: 100, passes: 4, air: true, note: 'Durchsichtiges und blaues Acryl schneidet ein Diodenlaser nicht.' },
    { id: 'schiefer-fill', mat: 'Schiefer', job: 'Gravieren', mode: 'fill', speed: 2500, power: 60, interval: 0.1, air: false },
    { id: 'alu-elox-fill', mat: 'Aluminium eloxiert', job: 'Gravieren', mode: 'fill', speed: 2000, power: 70, interval: 0.08, air: false },
    { id: 'edelstahl-fill', mat: 'Edelstahl (mit Markierspray)', job: 'Markieren', mode: 'fill', speed: 1000, power: 100, interval: 0.08, air: false },
    { id: 'glas-fill', mat: 'Glas (mit Abdeckung/Spray)', job: 'Gravieren', mode: 'fill', speed: 1500, power: 80, interval: 0.1, air: false },
    { id: 'kork-fill', mat: 'Kork', job: 'Gravieren', mode: 'fill', speed: 4000, power: 25, interval: 0.12, air: false },
    { id: 'stoff-cut', mat: 'Stoff / Filz (Naturfaser)', job: 'Schneiden', mode: 'line', speed: 800, power: 70, passes: 1, air: true },
  ];

  /** Materialwerte auf die Laserleistung umrechnen (Startwerte für 10 W). */
  function scaled(m, mach) {
    const k = Math.max(0.2, Math.min(4, (mach.watt || 10) / 10));
    const v = { ...m };
    if (mach.type === 'co2') { v.speed = Math.round(m.speed * (m.mode === 'line' ? 6 : 4)); v.passes = 1; v.power = Math.min(100, Math.round(m.power * 0.7)); }
    else {
      if (m.mode === 'line') {
        // Schneiden: Energie je mm = Leistung × Durchgänge / Geschwindigkeit; mehr Leistung = weniger Durchgänge, dann schneller
        const tot = (m.passes || 1) / k;
        v.passes = Math.max(1, Math.round(tot));
        v.speed = Math.round(Math.min(mach.maxSpeed || 6000, (m.speed * v.passes) / tot) / 10) * 10;
      } else {
        // Gravieren: bis 3× schneller, darüber die Leistung senken (sonst brennt es zu dunkel)
        const ks = Math.min(k, 3);
        v.speed = Math.round(Math.min(mach.maxSpeed || 6000, m.speed * ks) / 10) * 10;
        if (k > ks) v.power = Math.max(5, Math.round((m.power * ks) / k));
      }
    }
    return v;
  }

  FS.lib = { MACHINES, MATERIALS, scaled };
})(typeof window !== 'undefined' ? window : globalThis);
