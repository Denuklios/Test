/* Passwort eines Kontos direkt auf dem Server neu setzen (z. B. Admin-Passwort vergessen).
   Aufruf:  node server/reset-password.js du@deine-firma.de 'neues-langes-passwort'
   DATA_DIR wie beim Server (auf dem eigenen Server: /var/lib/stickstudio). */
'use strict';
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const [email, pw] = process.argv.slice(2);
if (!email || !pw || pw.length < 10) { console.error('Aufruf: node server/reset-password.js E-MAIL NEUES-PASSWORT (mindestens 10 Zeichen)'); process.exit(1); }
const dir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const db = new DatabaseSync(path.join(dir, 'stickstudio.db'));
const u = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim().toLowerCase());
if (!u) { console.error(`Kein Konto mit der E-Mail ${email} gefunden.`); process.exit(1); }
// gleiches Verfahren wie im Server (scrypt)
const salt = crypto.randomBytes(16);
const h = crypto.scryptSync(pw, salt, 32, { N: 16384, r: 8, p: 1 });
db.prepare('UPDATE users SET pass = ?, blocked = 0 WHERE id = ?').run(`scrypt$${salt.toString('hex')}$${h.toString('hex')}`, u.id);
db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
console.log(`Passwort für ${email} neu gesetzt. Alle Anmeldungen dieses Kontos wurden abgemeldet.`);
