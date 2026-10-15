/* Minimaler E-Mail-Versand über SMTP (ohne Zusatzpakete).
   Konfiguration über Umgebungsvariablen:
     SMTP_HOST, SMTP_PORT (465 = TLS direkt, 587 = STARTTLS), SMTP_USER, SMTP_PASS, MAIL_FROM ("StickStudio <noreply@example.com>")
   Ohne SMTP_HOST werden E-Mails nur im Server-Protokoll ausgegeben (zum Testen). */
'use strict';
const net = require('net');
const tls = require('tls');
const os = require('os');

const cfg = () => ({
  host: process.env.SMTP_HOST || '',
  port: +(process.env.SMTP_PORT || 465),
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  from: process.env.MAIL_FROM || process.env.SMTP_USER || 'noreply@localhost',
});
const enabled = () => !!cfg().host;

function b64(s) { return Buffer.from(s, 'utf8').toString('base64'); }
const addr = (s) => { const m = /<([^>]+)>/.exec(s); return m ? m[1] : s.trim(); };
const encHeader = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);

// Ein SMTP-Dialog: Befehl senden, auf Antwortcode warten
function client(sock) {
  let buf = '', waiters = [];
  const feed = () => {
    // vollständige Antwort: letzte Zeile "123 text" (ohne Bindestrich)
    const lines = buf.split('\r\n');
    for (let i = 0; i < lines.length - 1; i++) {
      if (/^\d{3} /.test(lines[i])) {
        const resp = lines.slice(0, i + 1).join('\n');
        buf = lines.slice(i + 1).join('\r\n');
        const w = waiters.shift();
        if (w) w(resp);
        return feed();
      }
    }
  };
  sock.on('data', (d) => { buf += d.toString('utf8'); feed(); });
  const read = () => new Promise((res) => waiters.push(res));
  const cmd = async (line, expect) => {
    if (line !== null) sock.write(line + '\r\n');
    const r = await read();
    if (expect && !expect.some((c) => r.startsWith(String(c)))) throw new Error('SMTP: ' + r.slice(0, 200));
    return r;
  };
  return { cmd, setSock: (s) => { sock = s; s.on('data', (d) => { buf += d.toString('utf8'); feed(); }); } };
}

async function send(to, subject, text) {
  const c = cfg();
  if (!c.host) {
    console.log(`[E-Mail, SMTP nicht eingerichtet] an ${to}: ${subject}\n${text}\n`);
    return false;
  }
  const host = os.hostname() || 'localhost';
  let sock = c.port === 465
    ? tls.connect({ host: c.host, port: c.port, servername: c.host })
    : net.connect({ host: c.host, port: c.port });
  sock.setTimeout(20000, () => sock.destroy(new Error('SMTP Zeitüberschreitung')));
  const done = new Promise((res, rej) => { sock.on('error', rej); sock.on('close', res); });
  done.catch(() => {});
  try {
    let s = client(sock);
    await s.cmd(null, [220]);
    let ehlo = await s.cmd('EHLO ' + host, [250]);
    if (c.port !== 465 && /STARTTLS/i.test(ehlo)) {
      await s.cmd('STARTTLS', [220]);
      sock.removeAllListeners('data');
      sock = tls.connect({ socket: sock, servername: c.host });
      await new Promise((res, rej) => { sock.once('secureConnect', res); sock.once('error', rej); });
      s = client(sock);
      ehlo = await s.cmd('EHLO ' + host, [250]);
    }
    if (c.user) {
      await s.cmd('AUTH LOGIN', [334]);
      await s.cmd(b64(c.user), [334]);
      await s.cmd(b64(c.pass), [235]);
    }
    await s.cmd(`MAIL FROM:<${addr(c.from)}>`, [250]);
    await s.cmd(`RCPT TO:<${addr(to)}>`, [250, 251]);
    await s.cmd('DATA', [354]);
    const msg = [
      `From: ${c.from}`, `To: ${to}`, `Subject: ${encHeader(subject)}`,
      `Date: ${new Date().toUTCString()}`, `Message-ID: <${Date.now()}.${Math.random().toString(36).slice(2)}@${host}>`,
      'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '',
      b64(text).replace(/.{76}/g, '$&\r\n'),
    ].join('\r\n');
    await s.cmd(msg.replace(/\r\n\./g, '\r\n..') + '\r\n.', [250]);
    await s.cmd('QUIT', [221]).catch(() => {});
    sock.end();
    return true;
  } catch (e) {
    sock.destroy();
    console.error('E-Mail-Versand fehlgeschlagen:', e.message);
    return false;
  }
}

module.exports = { send, enabled };
