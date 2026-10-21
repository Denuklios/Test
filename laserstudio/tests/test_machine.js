// Prüft die GRBL-Steuerung mit einer simulierten Maschine (ohne Browser). Aufruf: node tests/test_machine.js
require('../js/machine.js');
const FS = globalThis.FS;
let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FEHL ') + m); if (!c) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Übertragungsweg-Attrappe: merkt gesendete Bytes, antwortet wie GRBL
function fakeTransport({ silent = false, plan = 127 } = {}) {
  const t = { sent: [], closed: false, lines: [] };
  let buf = '';
  t.write = async (bytes) => {
    if (!(bytes instanceof Uint8Array)) throw new Error('Bytes erwartet');
    for (const b of bytes) {
      t.sent.push(b);
      if (silent) continue;
      if (b === 0x3f) t.ondata('<Idle|MPos:1.000,2.000,3.000|FS:0,0|WCO:0.000,0.000,0.000>\r\n');
      else if (b === 0x18) t.ondata("Grbl 1.1f ['$' for help]\r\n");
      else if (b === 10) { t.lines.push(buf); buf = ''; setTimeout(() => t.ondata('ok\r\n'), 2); }
      else if (b === 0x21 || b === 0x7e || b >= 0x80) { /* Echtzeit-Befehle gehören nicht in die Zeile */ }
      else if (b >= 32 && b < 127) buf += String.fromCharCode(b);
    }
  };
  t.close = async () => { t.closed = true; };
  return t;
}
const open = async (opts) => { const g = new FS.Grbl(); const t = fakeTransport(opts); g.attach(t); return { g, t }; };

(async () => {
  // Verbindungsprüfung
  let { g, t } = await open();
  ok(await g.handshake(2000) === true, 'Handshake: Maschine antwortet -> erkannt');
  ({ g, t } = await open({ silent: true }));
  const t0 = Date.now();
  ok(await g.handshake(1200) === false && Date.now() - t0 >= 1100, 'Handshake: keine Antwort -> nach Wartezeit „nicht erkannt“');
  ok(t.sent.includes(0x3f) && t.sent.includes(0x18), 'Handshake: fragt mit „?“ nach und stößt einen Soft-Reset an');
  g = new FS.Grbl(); t = fakeTransport(); g.attach(t);
  t.ondata('ets Jun  8 2016 00:22:57\r\nrst:0x1 (POWERON_RESET)\r\n');
  ok(g.seen === false, 'Boot-Meldung des ESP32 zählt noch nicht als GRBL');
  t.ondata("\r\nGrbl 1.1f ['$' for help]\r\n");
  ok(g.seen === true, 'Startmeldung „Grbl 1.1f“ wird erkannt');

  // Echtzeit-Bytes roh
  ({ g, t } = await open());
  g.finishConnect('usb', 100000);
  g.realtime('\x85'); g.realtime('\x91'); g.realtime('!'); g.write('G0 X1\n');
  await wait(20);
  ok(t.sent.slice(0, 3).join() === '133,145,33' && !t.sent.includes(0xc2) && t.sent.slice(3).join() === '71,48,32,88,49,10', 'Echtzeit-Bytes 0x85 0x91 ! gehen als einzelne Roh-Bytes raus (kein UTF-8)');
  g.listeners = {}; clearInterval(g.poll);

  // Befehle, Fehler, Passwort in der Konsole
  ({ g, t } = await open());
  g.finishConnect('usb', 100000);
  const logs = [];
  g.on('log', (l, c) => logs.push(c + ':' + l));
  await g.command('$Sta/Password=geheim');
  ok(logs.some((l) => l === 'out:$Sta/Password=••••') && !logs.some((l) => /geheim/.test(l)), 'Passwörter erscheinen nicht in der Konsole');
  ok(t.lines.includes('$Sta/Password=geheim'), '… werden aber richtig gesendet');
  const lines = await g.ask('[ESP111]', 500);
  ok(Array.isArray(lines), 'ask() liefert Antwortzeilen');
  clearInterval(g.poll);

  // Auftrag: Zeichenzähl-Streaming, Werkzeugwechsel-Pause
  ({ g, t } = await open());
  g.finishConnect('usb', 50); // wie im Programm: regelmäßige Statusabfrage
  let toolchange = false, done = null, maxFlight = 0;
  g.on('toolchange', () => { toolchange = true; });
  g.on('jobdone', (j) => { done = j; });
  const origWrite = g.write.bind(g);
  g.write = (s) => { origWrite(s); maxFlight = Math.max(maxFlight, g.inflight.reduce((a, x) => a + x.len, 0)); };
  const prog = Array.from({ length: 40 }, (_, i) => `G1 X${i}.000 Y${i}.000 F500`).join('\n') + '\n(WERKZEUGWECHSEL: Test)\nM0\nG1 X99\nM2\n';
  g.startJob(prog, 'Test');
  await wait(1200);
  ok(toolchange && !t.lines.includes('M0') && t.lines.includes('G1 X39.000 Y39.000 F500') && !t.lines.includes('G1 X99'), 'Auftrag hält bei M0 an (M0 geht nicht an die Maschine), alles davor gesendet');
  ok(maxFlight <= 127, `Puffer der Maschine nie überfüllt (max. ${maxFlight} von 127 Zeichen unterwegs)`);
  g.resumeJob();
  await wait(800);
  ok(t.lines.includes('G1 X99') && t.lines.includes('M2') && done && !done.aborted, 'Nach „Weiter“ läuft der Auftrag zu Ende und meldet „fertig“');
  clearInterval(g.poll);

  // Verbindungsverlust mitten im Auftrag
  ({ g, t } = await open());
  g.finishConnect('usb', 100000);
  let lost = null, disc = false;
  g.on('jobdone', (j) => { lost = j; });
  g.on('disconnect', () => { disc = true; });
  g.startJob('G1 X1 F100\nG1 X2\n', 'Verlust');
  t.onclose(new Error('Kabel gezogen'));
  await wait(20);
  ok(lost && lost.aborted && lost.lost && disc && g.connected === false && g.job === null, 'Verbindungsverlust: Auftrag als „verloren“ gemeldet, Zustand sauber zurückgesetzt');

  // Status
  ({ g, t } = await open());
  g.finishConnect('usb', 100000);
  g.realtime('?'); await wait(10);
  ok(g.status.state === 'Idle' && g.status.wpos.x === 1 && g.status.wpos.z === 3, 'Statusmeldung wird gelesen (Position, Zustand)');
  clearInterval(g.poll);

  // Umgebung
  const e = FS.Grbl.env();
  ok(e.serial === false && e.proto === 'file:', 'Umgebung ohne Browser: kein Web Serial');

  if (fails) { console.log(`\n${fails} Fehler`); process.exit(1); }
  console.log('\nAlle Prüfungen bestanden.');
  process.exit(0);
})();
