/* GRBL-Steuerung über USB (Web Serial, Chrome/Edge). Für die TTC450 (DLC32, GRBL-ESP32) und andere GRBL-Maschinen.
   Streaming nach dem Zeichenzähl-Verfahren (RX-Puffer), Werkzeugwechsel (M0/M6) hält im Programm an,
   damit die Maschine im Leerlauf bleibt und verfahren / neu genullt werden kann. */
(function (g) {
  const FS = (g.FS = g.FS || {});

  const ERRORS = {
    1: 'Befehl ohne Buchstaben', 2: 'Zahl fehlt oder ungültig', 3: '$-Befehl unbekannt', 5: 'Referenzfahrt nicht aktiviert',
    8: 'Nur im Leerlauf erlaubt', 9: 'Gesperrt (Alarm oder Jog)', 15: 'Verfahrweg überschreitet Maschinengrenzen',
    20: 'Nicht unterstützter G-Code-Befehl', 22: 'Vorschub fehlt', 24: 'Zwei Befehle derselben Gruppe', 33: 'Bogen ungültig',
  };
  const ALARMS = {
    1: 'Endschalter ausgelöst – Position verloren. Entsperren und Referenzfahrt ausführen.',
    2: 'Ziel liegt außerhalb des Arbeitsbereichs.', 3: 'Zurückgesetzt während der Bewegung – Position evtl. verloren.',
    4: 'Messtaster war schon ausgelöst.', 5: 'Messtaster nicht berührt – Messplatte und Klemme prüfen.',
    6: 'Referenzfahrt abgebrochen.', 8: 'Referenzfahrt: Endschalter nicht freigefahren.', 9: 'Referenzfahrt: Endschalter nicht gefunden.',
  };

  class Grbl {
    constructor() {
      this.port = null; this.reader = null; this.writer = null;
      this.connected = false; this.rxBuffer = 127;
      this.status = { state: 'Getrennt', mpos: { x: 0, y: 0, z: 0 }, wpos: { x: 0, y: 0, z: 0 }, wco: { x: 0, y: 0, z: 0 }, feed: 0, speed: 0, ov: [100, 100, 100], pins: '' };
      this.inflight = []; // {len, resolve, reject}
      this.queue = [];    // {line, resolve, reject}
      this.job = null;
      this.listeners = {};
      this.poll = null;
      this.buf = '';
    }
    static supported() { return typeof navigator !== 'undefined' && 'serial' in navigator; }
    on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); }
    emit(ev, ...a) { (this.listeners[ev] || []).forEach((f) => f(...a)); }

    async connect(baud = 115200) {
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate: baud });
      this.writer = this.port.writable.getWriter();
      this.connected = true;
      this.emit('connect');
      this.readLoop();
      // Manche Platinen (ESP32) starten beim Öffnen neu – kurz warten, dann Status abfragen
      setTimeout(() => this.realtime('\x18'), 300);
      this.poll = setInterval(() => this.connected && this.realtime('?'), 250);
    }

    async disconnect() {
      clearInterval(this.poll);
      this.connected = false;
      try { if (this.reader) await this.reader.cancel(); } catch (e) { /* bereits zu */ }
      try { if (this.writer) this.writer.releaseLock(); } catch (e) { /* bereits frei */ }
      try { if (this.port) await this.port.close(); } catch (e) { /* bereits zu */ }
      this.port = null;
      this.flushQueues('Verbindung getrennt');
      this.status.state = 'Getrennt';
      this.emit('status', this.status);
      this.emit('disconnect');
    }

    async readLoop() {
      const dec = new TextDecoder();
      while (this.port && this.port.readable && this.connected) {
        this.reader = this.port.readable.getReader();
        try {
          for (;;) {
            const { value, done } = await this.reader.read();
            if (done) break;
            this.buf += dec.decode(value, { stream: true });
            let i;
            while ((i = this.buf.search(/\r?\n/)) >= 0) {
              const line = this.buf.slice(0, i).trim();
              this.buf = this.buf.slice(this.buf[i] === '\r' ? i + 2 : i + 1);
              if (line) this.handle(line);
            }
          }
        } catch (e) {
          this.emit('log', 'Lesefehler: ' + e.message, 'err');
        } finally {
          try { this.reader.releaseLock(); } catch (e) { /* frei */ }
        }
        if (!this.connected) break;
        // Gerät entfernt
        this.disconnect();
        break;
      }
    }

    async write(s) {
      if (!this.writer) return;
      await this.writer.write(new TextEncoder().encode(s));
    }
    realtime(ch) { if (this.connected) this.write(ch); }

    handle(line) {
      if (line.startsWith('<')) { this.parseStatus(line); return; }
      if (line === 'ok' || line.startsWith('error')) {
        const it = this.inflight.shift();
        if (line.startsWith('error')) {
          const code = +line.split(':')[1];
          const msg = `Fehler ${code}: ${ERRORS[code] || 'siehe GRBL-Dokumentation'}`;
          this.emit('log', msg + (it && it.line ? ' – bei: ' + it.line : ''), 'err');
          if (it && it.reject) it.reject(new Error(msg));
          if (this.job && it && it.job) { this.job.errors++; }
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
        this.emit('log', line.trim(), 'out');
        this.pump();
      });
    }

    pump() {
      if (!this.connected) return;
      // Befehle zuerst, dann Auftrag
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
  }

  FS.Grbl = Grbl;
  FS.grblText = { ERRORS, ALARMS };
})(typeof window !== 'undefined' ? window : globalThis);
