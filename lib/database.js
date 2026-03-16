const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data.sqlite');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const DEFAULT_ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || 'admin@utrgv.edu';
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const DEFAULT_ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      username     TEXT NOT NULL UNIQUE,
      email        TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      role         TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin','user')),
      createdAt    TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tvs (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      name                 TEXT NOT NULL,
      slug                 TEXT NOT NULL UNIQUE,
      location             TEXT,
      cycleIntervalSeconds INTEGER NOT NULL DEFAULT 10,
      isActive             INTEGER NOT NULL DEFAULT 1,
      displayToken         TEXT NOT NULL UNIQUE,
      lastSeenAt           TEXT,
      createdAt            TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt            TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tv_user_access (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      tvId       INTEGER NOT NULL,
      userId     INTEGER NOT NULL,
      assignedBy INTEGER,
      createdAt  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tvId, userId),
      FOREIGN KEY (tvId)       REFERENCES tvs(id)   ON DELETE CASCADE,
      FOREIGN KEY (userId)     REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (assignedBy) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS media_assets (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      uploaderId       INTEGER,
      originalFilename TEXT NOT NULL,
      storedFilename   TEXT NOT NULL,
      mimeType         TEXT NOT NULL,
      fileSize         INTEGER NOT NULL DEFAULT 0,
      url              TEXT NOT NULL,
      createdAt        TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt        TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (uploaderId) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS tv_playlist_items (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      tvId            INTEGER NOT NULL,
      mediaAssetId    INTEGER NOT NULL,
      uploadedBy      INTEGER,
      sortOrder       INTEGER NOT NULL DEFAULT 0,
      durationSeconds INTEGER CHECK(durationSeconds IS NULL OR (durationSeconds >= 1 AND durationSeconds <= 60)),
      startAt         TEXT,
      endAt           TEXT,
      isActive        INTEGER NOT NULL DEFAULT 1,
      createdAt       TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt       TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tvId)         REFERENCES tvs(id)          ON DELETE CASCADE,
      FOREIGN KEY (mediaAssetId) REFERENCES media_assets(id) ON DELETE CASCADE,
      FOREIGN KEY (uploadedBy)   REFERENCES users(id)        ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      userId     INTEGER,
      action     TEXT NOT NULL,
      entityType TEXT,
      entityId   INTEGER,
      details    TEXT,
      ipAddress  TEXT,
      createdAt  TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  // Additive migrations
  const migrations = [];
  migrations.forEach(sql => { try { db.exec(sql); } catch (_) {} });

  // Seed default admin
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(DEFAULT_ADMIN_EMAIL);
  if (!exists) {
    const hash = bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, 10);
    db.prepare('INSERT INTO users (username, email, passwordHash, role) VALUES (?, ?, ?, ?)')
      .run(DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_EMAIL, hash, 'admin');
    console.log(`Default admin: ${DEFAULT_ADMIN_EMAIL} / ${DEFAULT_ADMIN_PASSWORD}`);
  }
}

initSchema();
module.exports = db;
