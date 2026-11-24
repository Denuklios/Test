// Prüft die GRBL-Steuerung mit einer simulierten Maschine (ohne Browser). Aufruf: node tests/test_machine.js
require('../js/machine.js');
const FS = globalThis.FS;
let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FEHL ') + m); if (!c) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Übertragungsweg-Attrappe: merkt gesendete Bytes, antwortet wie GRBL
function fakeTransport({ silent = false, plan = 127, errorOn = null } = {}) {
  const t = { sent: [], closed: false, lines: [] };
  let buf = '';
  t.write = async (bytes) => {
    if (!(bytes instanceof Uint8Array)) throw new Error('Bytes erwartet');
    for (const b of bytes) {
      t.sent.push(b);
      if (silent) continue;
      if (b === 0x3f) t.ondata('<Idle|MPos:1.000,2.000,3.000|FS:0,0|WCO:0.000,0.000,0.000>\r\n');
      else if (b === 0x18) t.ondata("Grbl 1.1f ['$' for help]\r\n");
      else if (b === 10) { const l = buf; t.lines.push(l); buf = ''; setTimeout(() => t.ondata(errorOn && errorOn.test(l) ? 'error:33\r\n' : 'ok\r\n'), 2); }
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

  // Trennen während des Auftrags: Auftrag ist beendet und läuft nach erneutem Verbinden nicht weiter
  ({ g, t } = await open());
  g.finishConnect('usb', 100000);
  let ended = null;
  g.on('jobdone', (j) => { ended = j; });
  g.startJob(Array.from({ length: 60 }, (_, i) => `G1 X${i} F100`).join('\n'), 'Trennen');
  await wait(5);
  await g.disconnect();
  ok(ended && ended.aborted && g.job === null, 'Trennen beendet den Auftrag (kein Weiterlaufen nach erneutem Verbinden)');

  // Steuerung startet neu (Reset/Stromeinbruch): Auftrag wird abgebrochen
  ({ g, t } = await open());
  g.finishConnect('usb', 100000);
  ended = null; g.on('jobdone', (j) => { ended = j; });
  g.startJob(Array.from({ length: 60 }, (_, i) => `G1 X${i} F100`).join('\n'), 'Reset');
  await wait(5);
  t.ondata("Grbl 1.1f ['$' for help]\r\n");
  const sentBefore = t.lines.length;
  await g.command('$X').catch(() => {});
  await wait(30);
  ok(ended && ended.reset && g.job === null && t.lines.length === sentBefore + 1, 'Neustart der Steuerung bricht den Auftrag ab, danach keine Auftragszeilen mehr');
  clearInterval(g.poll);

  // Werkzeugwechsel: „Weiter“ wirkt erst, wenn die Maschine steht und der Dialog kam; T2 M6 mitten in der Zeile wird erkannt
  ({ g, t } = await open());
  g.finishConnect('usb', 100000);
  let tc = 0;
  g.on('toolchange', () => { tc++; });
  g.startJob('G1 X1 F100\nG0 Z20 T2 M6\nG1 X50\n', 'Wechsel');
  await wait(30);
  g.resumeJob();
  await wait(30);
  ok(t.lines.includes('G0 Z20') && !t.lines.some((l) => /M6|T2/.test(l)) && !t.lines.includes('G1 X50'), '„T2 M6“ wird erkannt: Rest der Zeile gesendet, dann Halt; vorzeitiges „Weiter“ wirkt nicht');
  ok(g.command('G0 X5').catch((e) => e) instanceof Promise, 'Befehle während des Werkzeugwechsels erlaubt (z. B. Antasten)');
  await wait(20); g.realtime('?'); await wait(20);
  ok(tc === 1, 'Werkzeugwechsel-Dialog kommt, sobald die Maschine steht');
  t.ondata('ALARM:4\r\n');
  await wait(10);
  ok(g.job !== null && g.job.toolWait, 'Fehlgeschlagenes Antasten beim Werkzeugwechsel bricht den Auftrag nicht ab');
  g.resumeJob(); await wait(30);
  ok(t.lines.includes('G1 X50'), 'Nach bestätigtem Wechsel geht es weiter');
  clearInterval(g.poll);

  // Fehler mitten im Auftrag: anhalten statt weiterfräsen; manuelle Befehle während des Laufs gesperrt
  ({ g, t } = await open({ errorOn: /G2/ }));
  g.finishConnect('usb', 100000);
  let jerr = null;
  g.on('joberror', (e) => { jerr = e; });
  g.startJob('G1 X1 F100\nG2 X5 Y5 I1\n' + Array.from({ length: 30 }, (_, i) => `G1 X${i} Y1`).join('\n'), 'Fehler');
  let rejected = null;
  await g.command('G0 X0 Y0').catch((e) => { rejected = e; });
  ok(rejected && /Auftrags/.test(rejected.message), 'Manuelle Befehle während eines laufenden Auftrags werden abgelehnt');
  await wait(60);
  const n1 = t.lines.length;
  await wait(60);
  ok(jerr && jerr.code === 33 && g.job.paused && t.lines.length === n1 && t.sent.includes(0x21), 'Fehler im Auftrag: Vorschubhalt, keine weiteren Zeilen');
  clearInterval(g.poll);

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
