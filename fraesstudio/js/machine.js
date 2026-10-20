/* GRBL-Steuerung: USB (Web Serial, Chrome/Edge), WLAN über den Server (Telnet-Brücke) oder WLAN direkt (WebSocket).
   Für die TTC450 (MKS DLC32, GRBL-ESP32) und andere GRBL-Maschinen.
   Streaming nach dem Zeichenzähl-Verfahren (RX-Puffer). Werkzeugwechsel (M0/M6) hält im Programm an,
   damit die Maschine im Leerlauf bleibt und verfahren / neu genullt werden kann.
   Echtzeit-Befehle (? ! ~ Ctrl-X und die Bytes 0x80–0xFF) werden als einzelne ROH-Bytes gesendet (nicht als UTF-8). */
(function (g) {
  const FS = (g.FS = g.FS || {});

  const ERRORS = {
    1: 'Befehl ohne Buchstaben', 2: 'Zahl fehlt oder ungültig', 3: '$-Befehl unbekannt', 5: 'Referenzfahrt nicht aktiviert',
    8: 'Nur im Leerlauf erlaubt', 9: 'Gesperrt (Alarm oder Jog)', 15: 'Verfahrweg überschreitet Maschinengrenzen',
    20: 'Nicht unterstützter G-Code-Befehl', 22: 'Vorschub fehlt', 24: 'Zwei Befehle derselben Gruppe', 33: 'Bogen ungültig',
    120: 'Befehl abgelehnt (läuft gerade ein Auftrag von der SD-Karte?)',
  };
  const ALARMS = {
    1: 'Endschalter ausgelöst – Position verloren. Entsperren und Referenzfahrt ausführen.',
    2: 'Ziel liegt außerhalb des Arbeitsbereichs.', 3: 'Zurückgesetzt während der Bewegung – Position evtl. verloren.',
    4: 'Messtaster war schon ausgelöst.', 5: 'Messtaster nicht berührt – Messplatte und Klemme prüfen.',
    6: 'Referenzfahrt abgebrochen.', 8: 'Referenzfahrt: Endschalter nicht freigefahren.', 9: 'Referenzfahrt: Endschalter nicht gefunden.',
  };
  const USB_CHIPS = { '1a86:7523': 'CH340 (typisch für DLC32/MKS)', '1a86:55d3': 'CH343', '1a86:55d4': 'CH9102', '10c4:ea60': 'CP210x', '0403:6001': 'FTDI FT232', '303a:1001': 'ESP32 (USB direkt)', '2341:0043': 'Arduino Uno' };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const isRealtime = (b) => b === 0x3f || b === 0x21 || b === 0x7e || b === 0x18 || b >= 0x80;
  const toBytes = (s) => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; };
  const hex4 = (n) => (n == null ? '????' : n.toString(16).padStart(4, '0'));
  const printable = (s) => String(s).replace(/[^\x20-\x7e\r\n]/g, '·').replace(/\r/g, '').slice(-300);
  const fail = (msg, html) => Object.assign(new Error(msg), { html: html || '' });

  // ------------------------------------------------------------------ Übertragungswege
  /** USB: Web Serial */
  class SerialTransport {
    constructor(port, baud) { this.port = port; this.baud = baud; this.closed = false; }
    async open() {
      await this.port.open({ baudRate: this.baud, bufferSize: 4096 });
      // Viele ESP32-Platinen starten neu, wenn DTR/RTS beim Öffnen wackeln (Auto-Reset-Schaltung): beide sofort ruhig stellen
      try { await this.port.setSignals({ dataTerminalReady: false, requestToSend: false }); } catch (e) { /* nicht unterstützt */ }
      this.writer = this.port.writable.getWriter();
      this.loop = this.readLoop();
    }
    async readLoop() {
      const dec = new TextDecoder('latin1');
      let err = null;
      while (this.port.readable && !this.closed) {
        const reader = (this.reader = this.port.readable.getReader());
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            this.ondata(dec.decode(value, { stream: true }));
          }
        } catch (e) { err = e; } finally { try { reader.releaseLock(); } catch (e) { /* frei */ } }
        break;
      }
      if (!this.closed) { this.closed = true; this.onclose(err); }
    }
    write(bytes) { return this.writer.write(bytes); }
    async close() {
      this.closed = true;
      try { if (this.reader) await this.reader.cancel(); } catch (e) { /* zu */ }
      try { await this.loop; } catch (e) { /* zu */ }
      try { this.writer.releaseLock(); } catch (e) { /* frei */ }
      try { await this.port.close(); } catch (e) { /* zu */ }
    }
  }

  /** WLAN über den Server: Telnet-Brücke (/api/cnc/…), funktioniert auch hinter HTTPS */
  class BridgeTransport {
    constructor(host, port) { this.host = host; this.port = port || 23; this.closed = false; this.q = []; this.busy = false; this.pollBusy = false; }
    hdr(type) { return { 'X-Requested-With': 'StickStudio', 'Content-Type': type }; }
    async open() {
      let r;
      try { r = await fetch('/api/cnc/open', { method: 'POST', headers: this.hdr('application/json'), body: JSON.stringify({ host: this.host, port: this.port }) }); }
      catch (e) { throw fail('Der Server ist nicht erreichbar.', 'Die WLAN-Brücke braucht FräsStudio über den Server (Adresse mit https://…/fraesstudio/). Per Doppelklick geöffnet gibt es sie nicht.'); }
      const d = await r.json().catch(() => ({}));
      if (r.status === 401 || r.status === 403 || r.status === 404) throw fail(d.error || 'Keine Berechtigung für die WLAN-Brücke.', r.status === 404 ? 'Die WLAN-Brücke gibt es nur über den StickStudio-Server.' : '');
      if (!r.ok) throw fail(d.error || 'Die Brücke konnte keine Verbindung herstellen (' + r.status + ').');
      this.id = d.id;
      await new Promise((resolve, reject) => {
        const es = (this.es = new EventSource('/api/cnc/stream?id=' + this.id));
        let up = false;
        es.onopen = () => { up = true; resolve(); };
        es.onmessage = (e) => {
          let m; try { m = JSON.parse(e.data); } catch (x) { return; }
          if (m.d !== undefined) this.ondata(m.d);
          if (m.c) this.finish(m.m || 'Verbindung beendet');
        };
        es.onerror = () => { es.close(); if (!up) reject(fail('Der Datenstrom vom Server kam nicht zustande.')); else this.finish('Verbindung zum Server unterbrochen'); };
      });
    }
    finish(why) { if (!this.closed) { this.closed = true; try { this.es.close(); } catch (e) { /* zu */ } this.onclose(why ? new Error(why) : null); } }
    post(bytes) {
      return fetch('/api/cnc/send?id=' + this.id, { method: 'POST', headers: this.hdr('application/octet-stream'), body: bytes }).then((r) => { if (!r.ok) throw new Error('Senden fehlgeschlagen (' + r.status + ')'); });
    }
    write(bytes) {
      if (this.closed) return Promise.resolve();
      if (bytes.length === 1 && isRealtime(bytes[0])) {
        // Echtzeit-Befehle überholen die Warteschlange; Statusabfragen nicht stapeln
        if (bytes[0] === 0x3f) { if (this.pollBusy) return Promise.resolve(); this.pollBusy = true; return this.post(bytes).catch(() => {}).finally(() => { this.pollBusy = false; }); }
        return this.post(bytes).catch((e) => this.finish(e.message));
      }
      this.q.push(bytes);
      return this.flush();
    }
    async flush() {
      if (this.busy) return;
      this.busy = true;
      try {
        while (this.q.length && !this.closed) {
          const parts = this.q.splice(0), n = parts.reduce((s, p) => s + p.length, 0), all = new Uint8Array(n);
          let o = 0;
          for (const p of parts) { all.set(p, o); o += p.length; }
          await this.post(all);
        }
      } catch (e) { this.finish(e.message); } finally { this.busy = false; }
    }
    async close() {
      this.closed = true;
      try { this.es.close(); } catch (e) { /* zu */ }
      try { await fetch('/api/cnc/close?id=' + this.id, { method: 'POST', headers: this.hdr('application/json'), body: '{}' }); } catch (e) { /* weg */ }
    }
  }

  /** WLAN direkt aus dem Browser (nur Datei oder http-Seite): Ausgabe per WebSocket (Port 81), Befehle per HTTP (/command).
      Die DLC32-Firmware sendet die Ausgabe gebündelt (ca. alle 0,5 s) – für lange Aufträge ist die Server-Brücke (Telnet) besser. */
  class WsTransport {
    constructor(host) { this.host = host; this.closed = false; this.q = []; this.busy = false; this.pollBusy = false; }
    async open() {
      if (location.protocol === 'https:') throw fail('Direktes WLAN geht nicht von einer https-Seite aus.', 'Browser sperren unverschlüsselte Verbindungen (ws://) von https-Seiten. Nutze „WLAN über den Server“ oder öffne FräsStudio per Doppelklick auf index.html.');
      await new Promise((resolve, reject) => {
        let ws;
        try { ws = new WebSocket(`ws://${this.host}:81/`); } catch (e) { return reject(fail('Adresse ungültig.')); }
        this.ws = ws;
        ws.binaryType = 'arraybuffer';
        const t = setTimeout(() => { try { ws.close(); } catch (e) { /* zu */ } reject(fail('Die Maschine antwortet nicht (Zeitüberschreitung).', 'Stimmt die IP-Adresse? Maschine und Computer müssen im selben WLAN sein.')); }, 6000);
        ws.onopen = () => { clearTimeout(t); resolve(); };
        ws.onerror = () => { clearTimeout(t); reject(fail('WebSocket-Verbindung fehlgeschlagen.', 'IP-Adresse prüfen. Maschine und Computer müssen im selben WLAN sein.')); };
        ws.onmessage = (e) => {
          let s = typeof e.data === 'string' ? e.data : new TextDecoder('latin1').decode(e.data);
          s = s.replace(/(^|\n)(PING|currentID|activeID):[^\n]*(\n|$)/g, '$1'); // ESP3D-Hilfsmeldungen
          if (s) this.ondata(s);
        };
        ws.onclose = () => { if (!this.closed) { this.closed = true; this.onclose(null); } };
      });
    }
    http(text) { return fetch(`http://${this.host}/command?commandText=${encodeURIComponent(text)}`, { mode: 'no-cors' }); }
    write(bytes) {
      if (this.closed) return Promise.resolve();
      const s = String.fromCharCode(...bytes);
      if (bytes.length === 1 && isRealtime(bytes[0])) {
        if (bytes[0] === 0x3f) { if (this.pollBusy) return Promise.resolve(); this.pollBusy = true; return this.http(s).catch(() => {}).finally(() => { this.pollBusy = false; }); }
        return this.http(s).catch(() => {}); // Bytes ≥ 0x80 gehen als UTF-8 (%C2%85); die Firmware entfernt das C2
      }
      this.q.push(s.replace(/\r?\n$/, ''));
      return this.flush();
    }
    async flush() {
      if (this.busy) return;
      this.busy = true;
      try { while (this.q.length) await this.http(this.q.splice(0).join('\n')); } catch (e) { /* Verbindung weg: onclose meldet es */ } finally { this.busy = false; }
    }
    async close() { this.closed = true; try { this.ws.close(); } catch (e) { /* zu */ } }
  }

  // ------------------------------------------------------------------ GRBL
  class Grbl {
    constructor() {
      this.transport = null; this.connected = false; this.connecting = false; this.rxBuffer = 127; this.kind = '';
      this.status = { state: 'Getrennt', mpos: { x: 0, y: 0, z: 0 }, wpos: { x: 0, y: 0, z: 0 }, wco: { x: 0, y: 0, z: 0 }, feed: 0, speed: 0, ov: [100, 100, 100], pins: '' };
      this.inflight = []; this.queue = []; this.job = null; this.listeners = {}; this.poll = null; this.buf = ''; this.seen = false; this.rxPreview = '';
    }
    static supported() { return typeof navigator !== 'undefined' && 'serial' in navigator; }
    /** Welche Wege gibt es in diesem Browser / auf dieser Seite? */
    static env() {
      const secure = typeof isSecureContext !== 'undefined' ? isSecureContext : true;
      const proto = typeof location !== 'undefined' ? location.protocol : 'file:';
      return { serial: Grbl.supported(), secure, proto, direct: proto !== 'https:', server: proto === 'http:' || proto === 'https:' };
    }
    on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); }
    emit(ev, ...a) { (this.listeners[ev] || []).forEach((f) => f(...a)); }

    // ---- Verbinden
    /** o: {kind:'usb', baud:'auto'|Zahl} | {kind:'bridge', host, port} | {kind:'ws', host} */
    async connect(o) {
      if (this.connected || this.connecting) throw fail('Schon verbunden.');
      this.connecting = true;
      try {
        if (typeof o === 'number') o = { kind: 'usb', baud: o };
        if (o.kind === 'usb') await this.connectUsb(o);
        else await this.connectNet(o.kind === 'bridge' ? new BridgeTransport(o.host, o.port) : new WsTransport(o.host), o.kind);
      } finally { this.connecting = false; }
    }

    attach(t) {
      this.transport = t; this.buf = ''; this.rxPreview = ''; this.seen = false;
      t.ondata = (s) => this.onData(s);
      t.onclose = (err) => { if (this.transport === t) this.lost(err); };
    }
    onData(s) {
      this.rxPreview = (this.rxPreview + s).slice(-400);
      this.buf += s;
      let i;
      while ((i = this.buf.search(/\r?\n/)) >= 0) {
        const line = this.buf.slice(0, i).trim();
        this.buf = this.buf.slice(this.buf[i] === '\r' && this.buf[i + 1] === '\n' ? i + 2 : i + 1);
        if (line) this.handle(line);
      }
    }
    /** Wartet, bis die Maschine wie GRBL antwortet. Fragt dabei regelmäßig nach und stößt einmal einen Soft-Reset an. */
    async handshake(ms) {
      const t0 = Date.now();
      let reset = false;
      while (Date.now() - t0 < ms) {
        if (this.seen) return true;
        this.realtime('?');
        if (!reset && Date.now() - t0 > Math.min(1800, ms / 2)) { reset = true; this.realtime('\x18'); }
        await sleep(300);
      }
      return this.seen;
    }
    finishConnect(kind, extraMs) {
      this.kind = kind;
      this.connected = true;
      this.emit('connect');
      this.poll = setInterval(() => this.transport && this.realtime('?'), extraMs || 250);
    }

    async connectUsb(o) {
      if (!Grbl.supported()) {
        const e = Grbl.env();
        throw fail('USB ist in diesem Browser nicht möglich.', !e.secure
          ? 'Die Seite wird unverschlüsselt (http://) geöffnet – dann sperrt der Browser den USB-Zugriff. Öffne FräsStudio per Doppelklick auf <b>index.html</b> oder über <b>https://</b>, oder nimm WLAN.'
          : 'Dieser Browser kann nicht direkt mit der Fräse sprechen (Web Serial fehlt). Bitte <b>Google Chrome</b> oder <b>Microsoft Edge</b> am Computer verwenden (nicht Firefox/Safari, nicht am Handy).');
      }
      let port;
      try { port = await navigator.serial.requestPort(); }
      catch (e) {
        if (e.name === 'NotFoundError') throw Object.assign(fail('Kein Anschluss gewählt.', 'Wenn die Liste leer war oder die Maschine nicht dabei stand:<ul><li>USB-Kabel einstecken (ein <b>Datenkabel</b>, nicht nur Ladekabel) und die Maschine einschalten (24 V).</li><li>Windows: Geräte-Manager → „Anschlüsse (COM &amp; LPT)“ muss einen Eintrag wie <b>USB-SERIAL CH340</b> zeigen. Fehlt er: <b>CH340-Treiber</b> installieren.</li><li>Andere Programme schließen, die die Fräse benutzen (Candle, UGS, LaserGRBL).</li></ul>'), { silent: false, cancelled: true });
        throw e;
      }
      const info = port.getInfo ? port.getInfo() : {};
      let bauds = o.baud && o.baud !== 'auto' ? [+o.baud] : [115200, 250000, 921600, 57600, 9600];
      if (bauds.length > 1 && o.first) bauds = [+o.first, ...bauds.filter((x) => x !== +o.first)];
      const tried = [];
      for (let k = 0; k < bauds.length; k++) {
        const t = new SerialTransport(port, bauds[k]);
        try { await t.open(); } catch (e) { throw this.usbOpenError(e, info); }
        this.attach(t);
        if (await this.handshake(k === 0 ? 7000 : 2500)) {
          this.baud = bauds[k];
          if (k > 0) this.emit('log', `Baudrate ${bauds[k]} erkannt.`, 'info');
          this.finishConnect('usb');
          return;
        }
        tried.push({ baud: bauds[k], rx: printable(this.rxPreview) });
        this.transport = null;
        await t.close();
        await sleep(250);
      }
      throw this.noAnswer(tried, info);
    }
    usbOpenError(e, info) {
      const n = e && e.name;
      if (n === 'InvalidStateError') return fail('Der Anschluss ist schon geöffnet.', 'Seite neu laden (F5) und noch einmal versuchen.');
      if (n === 'NetworkError') return fail('Der Anschluss lässt sich nicht öffnen.', '<b>Meist belegt:</b> ein anderes Programm (Candle, UGS, LaserGRBL, Arduino-Monitor) oder ein anderer Browser-Tab nutzt die Fräse. Alles schließen, USB-Kabel kurz abziehen und wieder einstecken.<br>Unter Linux: Benutzer muss in der Gruppe <code>dialout</code> sein.');
      return fail('Anschluss konnte nicht geöffnet werden: ' + ((e && e.message) || e));
    }
    noAnswer(tried, info) {
      const id = hex4(info.usbVendorId) + ':' + hex4(info.usbProductId);
      const chip = USB_CHIPS[id];
      const rows = tried.map((t) => `<tr><td>${t.baud}</td><td>${t.rx ? '<code>' + t.rx.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</code>' : 'nichts empfangen'}</td></tr>`).join('');
      const garbage = tried.some((t) => t.rx && (t.rx.match(/·/g) || []).length > t.rx.length / 3);
      return fail('Der Anschluss ist offen, aber die Maschine antwortet nicht.',
        `<p>Gerät: <b>${chip || 'unbekannt'}</b> (USB ${id.toUpperCase()}). Geprüft wurden mehrere Baudraten:</p><table><tr><th>Baudrate</th><th>Empfangen</th></tr>${rows}</table>
        <p><b>Mögliche Ursachen:</b></p><ul>
        ${chip ? '' : '<li><b>Falscher Anschluss gewählt?</b> Bei mehreren COM-Ports den der Fräse wählen (Windows: Geräte-Manager → CH340).</li>'}
        ${garbage ? '<li>Es kommen Zeichen an, aber unlesbare: <b>falsche Baudrate</b> an der Maschine ($ in der Konsole prüfen).</li>' : ''}
        <li>Maschine ausgeschaltet oder nicht mit 24 V versorgt (USB allein reicht oft nicht).</li>
        <li>Die Platine hängt nach dem Öffnen im Neustart: Maschine <b>aus- und wieder einschalten</b>, 5 Sekunden warten, erneut verbinden.</li>
        <li>Das Touch-Display steht im SD-Karten- oder Auftragsmodus: dort zuerst beenden.</li>
        <li>Alternative: <b>WLAN</b> verwenden (Verbinden → WLAN).</li></ul>`);
    }
    async connectNet(t, kind) {
      await t.open();
      this.attach(t);
      if (await this.handshake(6000)) { this.finishConnect(kind, kind === 'ws' ? 600 : 250); return; }
      const rx = printable(this.rxPreview);
      this.transport = null;
      await t.close();
      throw fail('Verbunden, aber die Maschine antwortet nicht wie GRBL.', `<p>${rx ? 'Empfangen: <code>' + rx.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</code>' : 'Es kam nichts zurück.'}</p>
        <ul><li>Ist an der Maschine <b>Telnet</b> aktiv? (Konsole per USB: <code>$Telnet/Enable</code> → ON)</li><li>Läuft gerade ein Auftrag von der SD-Karte oder steuert das Touch-Display?</li><li>Maschine aus- und einschalten, 10 Sekunden warten.</li></ul>`);
    }

    lost(err) {
      clearInterval(this.poll);
      this.connected = false;
      this.transport = null;
      const j = this.job;
      this.job = null;
      this.flushQueues('Verbindung verloren');
      this.status.state = 'Getrennt';
      this.emit('log', 'Verbindung verloren' + (err && err.message ? ': ' + err.message : '') + '.', 'err');
      this.emit('status', this.status);
      this.emit('disconnect', true);
      if (j) this.emit('jobdone', { ...j, aborted: true, lost: true });
    }
    async disconnect() {
      clearInterval(this.poll);
      this.connected = false;
      const t = this.transport;
      this.transport = null;
      this.flushQueues('Verbindung getrennt');
      if (t) await t.close();
      this.status.state = 'Getrennt';
      this.emit('status', this.status);
      this.emit('disconnect');
    }

    // ---- Senden / Empfangen
    write(s) {
      const t = this.transport;
      if (!t) return;
      Promise.resolve(t.write(toBytes(s))).catch(() => {});
    }
    realtime(ch) { if (this.transport) this.write(ch); }

    handle(line) {
      if (/^(<|Grbl|ok\b|error|ALARM|\[)/i.test(line)) this.seen = true;
      if (line.startsWith('<')) { this.parseStatus(line); return; }
      if (line === 'ok' || line.startsWith('error')) {
        const it = this.inflight.shift();
        if (line.startsWith('error')) {
          const code = +line.split(':')[1];
          const msg = `Fehler ${code}: ${ERRORS[code] || 'siehe GRBL-Dokumentation'}`;
          this.emit('log', msg + (it && it.line ? ' – bei: ' + it.line : ''), 'err');
          if (it && it.reject) it.reject(new Error(msg));
          if (this.job && it && it.job) this.job.errors++;
        } else if (it && it.resolve) it.resolve('ok');
        if (this.job && it && it.job) { this.job.acked++; this.emit('progress', this.job); }
        this.pump();
        return;
      }
      if (line.startsWith('ALARM')) {
        const code = +line.split(':')[1];
        this.emit('log', `ALARM ${code}: ${ALARMS[code] || ''}`, 'err');
        this.emit('alarm', code, ALARMS[code] || '');
        if (this.job) this.stopJob(true);
        this.flushQueues('Alarm');
        return;
      }
      if (line.startsWith('Grbl')) {
        this.flushQueues('Zurückgesetzt');
        this.emit('log', line, 'info');
        this.emit('reset');
        return;
      }
      if (line.startsWith('[PRB:')) {
        const m = /\[PRB:([-\d.]+),([-\d.]+),([-\d.]+)[^:]*:(\d)\]/.exec(line);
        if (m) this.emit('probe', { x: +m[1], y: +m[2], z: +m[3], ok: m[4] === '1' });
      }
      this.emit('log', line, 'in');
    }

    parseStatus(line) {
      const parts = line.slice(1, -1).split('|');
      const st = this.status;
      st.state = parts[0].split(':')[0];
      st.sub = parts[0].split(':')[1];
      const xyz = (s) => { const a = s.split(',').map(Number); return { x: a[0], y: a[1], z: a[2] }; };
      let haveW = false, haveM = false;
      for (const p of parts.slice(1)) {
        const [k, v] = p.split(':');
        if (k === 'MPos') { st.mpos = xyz(v); haveM = true; }
        else if (k === 'WPos') { st.wpos = xyz(v); haveW = true; }
        else if (k === 'WCO') st.wco = xyz(v);
        else if (k === 'FS' || k === 'F') { const a = v.split(',').map(Number); st.feed = a[0]; st.speed = a[1] || 0; }
        else if (k === 'Ov') st.ov = v.split(',').map(Number);
        else if (k === 'Pn') st.pins = v;
        else if (k === 'Bf') { const a = v.split(',').map(Number); if (a[1] > 0 && this.rxBuffer === 127 && a[1] > 127) this.rxBuffer = Math.min(250, a[1]); }
      }
      if (!parts.some((p) => p.startsWith('Pn'))) st.pins = '';
      if (haveM) st.wpos = { x: st.mpos.x - st.wco.x, y: st.mpos.y - st.wco.y, z: st.mpos.z - st.wco.z };
      else if (haveW) st.mpos = { x: st.wpos.x + st.wco.x, y: st.wpos.y + st.wco.y, z: st.wpos.z + st.wco.z };
      this.emit('status', st);
      if (this.job && this.job.waitIdle && st.state === 'Idle' && !this.inflight.length) {
        this.job.waitIdle = false;
        this.emit('toolchange', this.job.pauseMsg || 'Werkzeug wechseln');
      }
      if (this.job && this.job.finishing && st.state === 'Idle' && !this.inflight.length) {
        const j = this.job;
        this.job = null;
        this.emit('jobdone', j);
      }
    }

    flushQueues(reason) {
      for (const it of this.inflight) if (it.reject) it.reject(new Error(reason));
      for (const it of this.queue) if (it.reject) it.reject(new Error(reason));
      this.inflight = [];
      this.queue = [];
    }

    /** Einzelbefehl (wartet auf ok) */
    command(line) {
      return new Promise((resolve, reject) => {
        if (!this.connected) return reject(new Error('Nicht verbunden'));
        this.queue.push({ line: line.trim(), resolve, reject });
        this.emit('log', line.trim().replace(/(password|pass|key)=.*/i, '$1=••••'), 'out'); // Passwörter nicht in der Konsole zeigen
        this.pump();
      });
    }

    pump() {
      if (!this.connected) return;
      for (;;) {
        let it = this.queue[0];
        let fromJob = false;
        if (!it && this.job && !this.job.paused && !this.job.waitIdle && !this.job.finishing) {
          const j = this.job;
          while (j.next < j.lines.length) {
            const raw = j.lines[j.next];
            const l = raw.replace(/\(.*?\)/g, '').replace(/;.*/, '').trim();
            if (!l) { j.next++; j.acked++; if (/WERKZEUGWECHSEL/.test(raw)) j.pauseMsg = raw.replace(/[()]/g, '').replace('WERKZEUGWECHSEL:', '').trim(); continue; }
            if (/^M0?[016]\b/i.test(l)) {
              // Werkzeugwechsel / Pause: im Programm anhalten, wenn Maschine im Leerlauf ist
              j.next++; j.acked++;
              j.waitIdle = true; j.paused = true;
              this.emit('progress', j);
              return;
            }
            it = { line: l, job: true };
            fromJob = true;
            break;
          }
          if (!it && j.next >= j.lines.length) { j.finishing = true; return; }
        }
        if (!it) return;
        const len = it.line.length + 1;
        const used = this.inflight.reduce((s, x) => s + x.len, 0);
        if (used + len > this.rxBuffer && this.inflight.length) return;
        if (fromJob) this.job.next++; else this.queue.shift();
        this.inflight.push({ len, resolve: it.resolve, reject: it.reject, job: it.job, line: it.line });
        this.write(it.line + '\n');
      }
    }

    startJob(text, name) {
      if (this.job) throw new Error('Es läuft bereits ein Auftrag');
      const lines = text.split(/\r?\n/);
      this.job = { name, lines, next: 0, acked: 0, errors: 0, total: lines.length, start: Date.now(), paused: false, waitIdle: false, finishing: false };
      this.emit('progress', this.job);
      this.pump();
    }
    pauseJob() { if (this.job) { this.job.paused = true; this.realtime('!'); this.emit('progress', this.job); } }
    resumeJob() {
      if (!this.job) { this.realtime('~'); return; }
      this.job.paused = false; this.job.waitIdle = false;
      this.realtime('~');
      this.emit('progress', this.job);
      this.pump();
    }
    stopJob(silent) {
      if (!this.job) return;
      const j = this.job;
      this.job = null;
      // Vorschubhalt, dann Soft-Reset leert den Planer; Spindel geht aus
      this.realtime('!');
      setTimeout(() => { this.realtime('\x18'); }, 150);
      this.flushQueues('Abgebrochen');
      if (!silent) this.emit('log', 'Auftrag abgebrochen', 'err');
      this.emit('jobdone', { ...j, aborted: true });
    }

    jog(dx, dy, dz, feed) {
      let s = '$J=G91 G21';
      if (dx) s += ' X' + dx.toFixed(3);
      if (dy) s += ' Y' + dy.toFixed(3);
      if (dz) s += ' Z' + dz.toFixed(3);
      return this.command(s + ' F' + Math.round(feed)).catch(() => {});
    }
    jogCancel() { this.realtime('\x85'); }

    async probeZ(plate = 0, maxTravel = 30, feed = 80) {
      const res = new Promise((resolve) => {
        const h = (p) => { this.listeners.probe = this.listeners.probe.filter((f) => f !== h); resolve(p); };
        this.on('probe', h);
      });
      await this.command('G91 G21');
      await this.command(`G38.2 Z-${maxTravel} F${feed}`);
      const p = await res;
      if (!p.ok) throw new Error('Messplatte nicht berührt');
      await this.command(`G10 L20 P1 Z${plate.toFixed(3)}`);
      await this.command('G0 Z5');
      await this.command('G90');
      return p;
    }

    /** Befehl senden und die Antwortzeilen (bis ok) einsammeln – z. B. für „$$“ oder „[ESP111]“ */
    ask(line, ms = 2500) {
      return new Promise((resolve) => {
        const out = [];
        const h = (l, cls) => { if (cls === 'in') out.push(l); };
        this.on('log', h);
        const done = () => { this.listeners.log = this.listeners.log.filter((f) => f !== h); resolve(out); };
        this.command(line).then(() => setTimeout(done, 150)).catch(done);
        setTimeout(done, ms);
      });
    }
  }

  FS.Grbl = Grbl;
  FS.grblText = { ERRORS, ALARMS };
})(typeof window !== 'undefined' ? window : globalThis);
