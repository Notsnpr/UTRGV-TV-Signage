const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const db = new Database(path.join(__dirname, '..', 'data.sqlite'));
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
      isAdmin      INTEGER NOT NULL DEFAULT 0,
      createdAt    TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      userId          INTEGER,
      name            TEXT NOT NULL,
      description     TEXT,
      loop            INTEGER NOT NULL DEFAULT 1,
      shuffle         INTEGER NOT NULL DEFAULT 0,
      transition      TEXT NOT NULL DEFAULT 'fade',
      transitionMs    INTEGER NOT NULL DEFAULT 500,
      bgColor         TEXT NOT NULL DEFAULT '#000000',
      bgImage         TEXT,
      showInfo        INTEGER NOT NULL DEFAULT 0,
      progressColor1  TEXT NOT NULL DEFAULT '#3b82f6',
      progressColor2  TEXT NOT NULL DEFAULT '#60a5fa',
      shareToken      TEXT UNIQUE,
      aspectRatio     TEXT NOT NULL DEFAULT '16:9',
      createdAt       TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt       TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS playlist_items (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      playlistId  INTEGER NOT NULL,
      type        TEXT NOT NULL CHECK(type IN ('image','video','youtube')),
      url         TEXT NOT NULL,
      title       TEXT,
      duration    INTEGER NOT NULL DEFAULT 10,
      sortOrder   INTEGER NOT NULL DEFAULT 0,
      enabled     INTEGER NOT NULL DEFAULT 1,
      startsAt    TEXT,
      expiresAt   TEXT,
      createdAt   TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt   TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (playlistId) REFERENCES playlists(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS playlist_editors (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      playlistId INTEGER NOT NULL,
      userId     INTEGER NOT NULL,
      createdAt  TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (playlistId) REFERENCES playlists(id) ON DELETE CASCADE,
      FOREIGN KEY (userId)     REFERENCES users(id)     ON DELETE CASCADE,
      UNIQUE(playlistId, userId)
    );

    CREATE TABLE IF NOT EXISTS devices (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT NOT NULL,
      identifier   TEXT NOT NULL UNIQUE,
      playlistId   INTEGER,
      lastSeenAt   TEXT,
      ipAddress    TEXT,
      screenWidth  INTEGER,
      screenHeight INTEGER,
      pairCode     TEXT UNIQUE,
      createdAt    TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt    TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (playlistId) REFERENCES playlists(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      playlistId  INTEGER NOT NULL,
      deviceId    INTEGER,
      name        TEXT,
      startTime   TEXT NOT NULL,
      endTime     TEXT NOT NULL,
      daysOfWeek  TEXT NOT NULL DEFAULT '["0","1","2","3","4","5","6"]',
      startDate   TEXT,
      endDate     TEXT,
      recurrence  TEXT NOT NULL DEFAULT 'daily',
      priority    INTEGER NOT NULL DEFAULT 0,
      enabled     INTEGER NOT NULL DEFAULT 1,
      createdAt   TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt   TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (playlistId) REFERENCES playlists(id) ON DELETE CASCADE,
      FOREIGN KEY (deviceId)   REFERENCES devices(id)   ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS emergency_alerts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      userId      INTEGER,
      title       TEXT NOT NULL,
      message     TEXT NOT NULL,
      bgColor     TEXT NOT NULL DEFAULT '#dc2626',
      textColor   TEXT NOT NULL DEFAULT '#ffffff',
      active      INTEGER NOT NULL DEFAULT 1,
      expiresAt   TEXT,
      createdAt   TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt   TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS media_files (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      userId      INTEGER,
      folderId    INTEGER,
      filename    TEXT NOT NULL,
      originalName TEXT NOT NULL,
      mimeType    TEXT NOT NULL,
      size        INTEGER NOT NULL,
      url         TEXT NOT NULL,
      createdAt   TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt   TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (userId)   REFERENCES users(id)          ON DELETE SET NULL,
      FOREIGN KEY (folderId) REFERENCES media_folders(id)  ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS media_folders (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      userId    INTEGER,
      parentId  INTEGER,
      name      TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (userId)   REFERENCES users(id)         ON DELETE SET NULL,
      FOREIGN KEY (parentId) REFERENCES media_folders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS media_tags (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS media_file_tags (
      fileId INTEGER NOT NULL,
      tagId  INTEGER NOT NULL,
      PRIMARY KEY (fileId, tagId),
      FOREIGN KEY (fileId) REFERENCES media_files(id) ON DELETE CASCADE,
      FOREIGN KEY (tagId)  REFERENCES media_tags(id)  ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS text_overlays (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      playlistId INTEGER NOT NULL,
      text       TEXT NOT NULL,
      position   TEXT NOT NULL DEFAULT 'bottom',
      type       TEXT NOT NULL DEFAULT 'ticker',
      speed      INTEGER NOT NULL DEFAULT 50,
      bgColor    TEXT NOT NULL DEFAULT 'rgba(0,0,0,0.7)',
      textColor  TEXT NOT NULL DEFAULT '#ffffff',
      fontSize   INTEGER NOT NULL DEFAULT 16,
      enabled    INTEGER NOT NULL DEFAULT 1,
      createdAt  TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt  TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (playlistId) REFERENCES playlists(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS widgets (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      playlistId INTEGER NOT NULL,
      type       TEXT NOT NULL CHECK(type IN ('clock','weather','rss','date')),
      position   TEXT NOT NULL DEFAULT 'top-right',
      config     TEXT NOT NULL DEFAULT '{}',
      enabled    INTEGER NOT NULL DEFAULT 1,
      createdAt  TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt  TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (playlistId) REFERENCES playlists(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS playback_logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      deviceId   INTEGER,
      itemId     INTEGER,
      playlistId INTEGER,
      duration   INTEGER,
      playedAt   TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (deviceId)   REFERENCES devices(id)        ON DELETE SET NULL,
      FOREIGN KEY (itemId)     REFERENCES playlist_items(id)  ON DELETE SET NULL,
      FOREIGN KEY (playlistId) REFERENCES playlists(id)       ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      userId      INTEGER NOT NULL,
      name        TEXT NOT NULL,
      keyHash     TEXT NOT NULL UNIQUE,
      lastUsedAt  TEXT,
      expiresAt   TEXT,
      createdAt   TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS webhooks (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      userId          INTEGER,
      url             TEXT NOT NULL,
      events          TEXT NOT NULL DEFAULT '["*"]',
      enabled         INTEGER NOT NULL DEFAULT 1,
      lastTriggeredAt TEXT,
      createdAt       TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt       TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE SET NULL
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
    db.prepare('INSERT INTO users (username, email, passwordHash, isAdmin) VALUES (?, ?, ?, 1)')
      .run(DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_EMAIL, hash);
    console.log(`Default admin: ${DEFAULT_ADMIN_EMAIL} / ${DEFAULT_ADMIN_PASSWORD}`);
  }
}

initSchema();
module.exports = db;
