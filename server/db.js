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
  return db;
}

module.exports = { open };
