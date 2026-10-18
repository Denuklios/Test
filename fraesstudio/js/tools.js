/* Werkzeuge, Materialien und Maschinenprofil (Voreinstellungen für die Twotrees TTC450).
   Schnittwerte sind bewusst vorsichtig gewählt (80-W-Spindel, Trapezgewindespindeln). */
(function (g) {
  const FS = (g.FS = g.FS || {});

  const TYPES = { flat: 'Schaftfräser', ball: 'Kugelfräser', vbit: 'V-Fräser / Gravierstichel', drill: 'Bohrer' };

  // feed/plunge in mm/min, stepdown in mm, stepover in % vom Durchmesser
  const DEFAULT_TOOLS = [
    { id: 't1', name: 'Schaftfräser 3,175 mm, 2 Schneiden', type: 'flat', d: 3.175, flutes: 2, len: 12, rpm: 8000, feed: 500, plunge: 150, stepdown: 1.0, stepover: 40 },
    { id: 't2', name: 'Schaftfräser 2 mm, 2 Schneiden', type: 'flat', d: 2, flutes: 2, len: 8, rpm: 8000, feed: 400, plunge: 120, stepdown: 0.6, stepover: 40 },
    { id: 't3', name: 'Schaftfräser 1 mm, 2 Schneiden', type: 'flat', d: 1, flutes: 2, len: 4, rpm: 8000, feed: 250, plunge: 80, stepdown: 0.3, stepover: 40 },
    { id: 't4', name: 'Schaftfräser 6 mm, 2 Schneiden (500-W-Spindel)', type: 'flat', d: 6, flutes: 2, len: 20, rpm: 12000, feed: 800, plunge: 200, stepdown: 1.5, stepover: 45 },
    { id: 't5', name: 'Gravierstichel 30°, Spitze 0,1 mm', type: 'vbit', d: 3.175, angle: 30, tip: 0.1, flutes: 1, len: 6, rpm: 8000, feed: 300, plunge: 100, stepdown: 0.5, stepover: 30 },
    { id: 't6', name: 'V-Fräser 60°, 6,35 mm', type: 'vbit', d: 6.35, angle: 60, tip: 0, flutes: 2, len: 6, rpm: 8000, feed: 500, plunge: 150, stepdown: 1.0, stepover: 30 },
    { id: 't7', name: 'V-Fräser 90°, 12,7 mm', type: 'vbit', d: 12.7, angle: 90, tip: 0, flutes: 2, len: 7, rpm: 8000, feed: 500, plunge: 150, stepdown: 1.0, stepover: 30 },
    { id: 't8', name: 'Kugelfräser 3,175 mm (R 1,59)', type: 'ball', d: 3.175, flutes: 2, len: 12, rpm: 8000, feed: 600, plunge: 150, stepdown: 1.0, stepover: 12 },
    { id: 't9', name: 'Kugelfräser 1,5 mm (R 0,75)', type: 'ball', d: 1.5, flutes: 2, len: 6, rpm: 8000, feed: 400, plunge: 100, stepdown: 0.5, stepover: 10 },
    { id: 't10', name: 'Bohrer 3 mm', type: 'drill', d: 3, flutes: 2, len: 20, rpm: 8000, feed: 300, plunge: 100, stepdown: 1.5, stepover: 0 },
  ];

  // Faktoren auf Vorschub (feed) und Zustellung (depth)
  const MATERIALS = [
    { id: 'weichholz', name: 'Weichholz (Kiefer, Fichte, Linde)', feed: 1.0, depth: 1.0, color: '#e8c99a' },
    { id: 'hartholz', name: 'Hartholz (Buche, Eiche, Ahorn)', feed: 0.75, depth: 0.7, color: '#c99a63' },
    { id: 'mdf', name: 'MDF', feed: 0.9, depth: 0.9, color: '#b89a74' },
    { id: 'sperrholz', name: 'Sperrholz / Multiplex', feed: 0.85, depth: 0.8, color: '#dcb985' },
    { id: 'acryl', name: 'Acryl (PMMA, gegossen)', feed: 0.7, depth: 0.6, color: '#bfe3ef' },
    { id: 'pvc', name: 'PVC-Hartschaum / Forex', feed: 1.2, depth: 1.2, color: '#f0f0f0' },
    { id: 'hdpe', name: 'HDPE / POM', feed: 0.8, depth: 0.7, color: '#eeeeea' },
    { id: 'pcb', name: 'Leiterplatte (FR4)', feed: 0.5, depth: 0.4, color: '#c9a34a' },
    { id: 'alu', name: 'Aluminium (nur 500-W-Spindel, sehr vorsichtig)', feed: 0.3, depth: 0.2, color: '#c8ccd2' },
    { id: 'messing', name: 'Messing (nur 500-W-Spindel, sehr vorsichtig)', feed: 0.25, depth: 0.15, color: '#d8b75c' },
  ];

  const MACHINES = {
    ttc450: { id: 'ttc450', name: 'Twotrees TTC450 (80-W-Spindel)', w: 460, h: 460, z: 80, maxRpm: 8000, sMax: 1000, maxFeed: 1000, maxZFeed: 400, rapid: 1000, baud: 115200, rxBuffer: 127 },
    ttc450_500: { id: 'ttc450_500', name: 'Twotrees TTC450 (500-W-Spindel)', w: 460, h: 460, z: 80, maxRpm: 12000, sMax: 1000, maxFeed: 1000, maxZFeed: 400, rapid: 1000, baud: 115200, rxBuffer: 127 },
    custom: { id: 'custom', name: 'Eigene GRBL-Maschine', w: 300, h: 180, z: 45, maxRpm: 10000, sMax: 1000, maxFeed: 1500, maxZFeed: 500, rapid: 1500, baud: 115200, rxBuffer: 127 },
  };

  // Schnittwerte für Werkzeug + Material
  function cutParams(tool, matId, machine) {
    const m = MATERIALS.find((x) => x.id === matId) || MATERIALS[0];
    const mach = machine || MACHINES.ttc450;
    return {
      feed: Math.min(mach.maxFeed, Math.round(tool.feed * m.feed)),
      plunge: Math.min(mach.maxZFeed, Math.round(tool.plunge * m.feed)),
      stepdown: Math.max(0.05, +(tool.stepdown * m.depth).toFixed(2)),
      rpm: Math.min(mach.maxRpm, tool.rpm),
    };
  }

  // Schnittprofil: Höhe der Werkzeugschneide über der Spitze im Abstand r von der Achse (Infinity = außerhalb)
  function profile(tool) {
    const R = tool.d / 2;
    if (tool.type === 'ball') return (r) => (r > R ? Infinity : R - Math.sqrt(Math.max(0, R * R - r * r)));
    if (tool.type === 'vbit') {
      const t = Math.tan(((tool.angle || 60) * Math.PI) / 360), tip = (tool.tip || 0) / 2;
      return (r) => (r > R ? Infinity : r <= tip ? 0 : (r - tip) / t);
    }
    return (r) => (r > R ? Infinity : 0);
  }

  const describe = (t) => `${t.name}`;

  FS.tools = { TYPES, DEFAULT_TOOLS, MATERIALS, MACHINES, cutParams, profile, describe };
})(typeof window !== 'undefined' ? window : globalThis);
