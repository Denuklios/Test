/* Datenbank (SQLite, in Node.js eingebaut): Benutzer, Sitzungen, Projekte, Einstellungen, Tokens. */
'use strict';
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

function open(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'stickstudio.db'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL DEFAULT '',
      pass TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',          -- 'user' | 'admin'
      lang TEXT NOT NULL DEFAULT 'de',
      verified INTEGER NOT NULL DEFAULT 0,
      blocked INTEGER NOT NULL DEFAULT 0,
      trial_until INTEGER NOT NULL DEFAULT 0,     -- ms seit 1970
      license_until INTEGER NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT '',
      accepted_terms INTEGER NOT NULL DEFAULT 0,  -- Zeitpunkt der Zustimmung zu AGB/Datenschutz
      created INTEGER NOT NULL,
      last_login INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS sessions (
      hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires INTEGER NOT NULL,
      created INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tokens (
      hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,                          -- 'reset' | 'verify'
      expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      customer TEXT NOT NULL DEFAULT '',
      stitches INTEGER NOT NULL DEFAULT 0,
      w REAL NOT NULL DEFAULT 0,
      h REAL NOT NULL DEFAULT 0,
      colors INTEGER NOT NULL DEFAULT 0,
      thumb TEXT NOT NULL DEFAULT '',
      data TEXT NOT NULL,
      created INTEGER NOT NULL,
      updated INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS projects_user ON projects(user_id, updated);
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      kind TEXT NOT NULL,
      info TEXT NOT NULL DEFAULT '',
      at INTEGER NOT NULL
    );
  `);
  // Abo (Lemon Squeezy) – Spalten bei bestehenden Datenbanken nachrüsten
  const cols = new Set(db.prepare('PRAGMA table_info(users)').all().map((c) => c.name));
  const add = { sub_id: "TEXT NOT NULL DEFAULT ''", sub_status: "TEXT NOT NULL DEFAULT ''", sub_portal: "TEXT NOT NULL DEFAULT ''",
    sub_renews: 'INTEGER NOT NULL DEFAULT 0', sub_ends: 'INTEGER NOT NULL DEFAULT 0', sub_reminded: 'INTEGER NOT NULL DEFAULT 0',
    last_ip: "TEXT NOT NULL DEFAULT ''", last_country: "TEXT NOT NULL DEFAULT ''", reg_country: "TEXT NOT NULL DEFAULT ''", last_seen: 'INTEGER NOT NULL DEFAULT 0',
    fraes: 'INTEGER NOT NULL DEFAULT 0' }; // Zugang zu FräsStudio (nur vom Admin freizuschalten)
  for (const [k, def] of Object.entries(add)) if (!cols.has(k)) db.exec(`ALTER TABLE users ADD COLUMN ${k} ${def}`);
  db.exec('CREATE INDEX IF NOT EXISTS events_at ON events(at)');
  db.exec(`CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,                          -- 'cancel' | 'withdraw'
      user_id INTEGER,
      name TEXT NOT NULL, email TEXT NOT NULL, info TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',         -- 'open' | 'done' (automatisch erledigt oder vom Admin abgehakt)
      result TEXT NOT NULL DEFAULT '',
      at INTEGER NOT NULL
    );`);
  return db;
}

module.exports = { open };
