import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import config from "../config.js";

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    throw new Error("Database not initialized. Call initDb() first.");
  }
  return db;
}

export function initDb(): Database.Database {
  fs.mkdirSync(config.dataDir, { recursive: true });
  const dbPath = path.join(config.dataDir, "realm.sqlite");

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  runMigrations(db);
  return db;
}

function runMigrations(db: Database.Database): void {
  // Recreate attachments table if it has the old NOT NULL constraint on message_id
  const attachmentsInfo = db.pragma("table_info(attachments)") as { name: string; notnull: number }[];
  const messageIdCol = attachmentsInfo.find((c) => c.name === "message_id");
  if (messageIdCol && messageIdCol.notnull === 1) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS attachments_new (
        id TEXT PRIMARY KEY,
        message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        storage_path TEXT NOT NULL
      );
      INSERT OR IGNORE INTO attachments_new SELECT * FROM attachments;
      DROP TABLE attachments;
      ALTER TABLE attachments_new RENAME TO attachments;
    `);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS realm (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      encrypted INTEGER NOT NULL DEFAULT 0,
      retention_days INTEGER DEFAULT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('text', 'voice', 'dm')),
      encrypted INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0,
      participants TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      sender_public_key TEXT NOT NULL,
      content BLOB NOT NULL,
      signature TEXT NOT NULL,
      nonce TEXT NOT NULL,
      has_attachment INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_channel_time
      ON messages(channel_id, created_at);

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      storage_path TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_profiles (
      public_key TEXT PRIMARY KEY,
      name TEXT,
      bio TEXT,
      last_seen INTEGER NOT NULL
    );
  `);

  // Migration: add allow_dm column to realm table
  const realmInfo = db.pragma("table_info(realm)") as { name: string }[];
  if (!realmInfo.find((c) => c.name === "allow_dm")) {
    db.exec("ALTER TABLE realm ADD COLUMN allow_dm INTEGER NOT NULL DEFAULT 0");
  }

  // Migration: add password_verify columns to realm table
  if (!realmInfo.find((c) => c.name === "password_verify")) {
    db.exec("ALTER TABLE realm ADD COLUMN password_verify TEXT");
    db.exec("ALTER TABLE realm ADD COLUMN password_verify_nonce TEXT");
  }

  // Migration: add password_verify columns to channels table
  const channelsInfo2 = db.pragma("table_info(channels)") as { name: string }[];
  if (!channelsInfo2.find((c) => c.name === "password_verify")) {
    db.exec("ALTER TABLE channels ADD COLUMN password_verify TEXT");
    db.exec("ALTER TABLE channels ADD COLUMN password_verify_nonce TEXT");
  }

  // Migration: rebuild channels table if it lacks the 'dm' type or participants column
  const channelsInfo = db.pragma("table_info(channels)") as { name: string }[];
  if (!channelsInfo.find((c) => c.name === "participants")) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS channels_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('text', 'voice', 'dm')),
        encrypted INTEGER NOT NULL DEFAULT 0,
        position INTEGER NOT NULL DEFAULT 0,
        participants TEXT,
        created_at INTEGER NOT NULL
      );
      INSERT OR IGNORE INTO channels_new (id, name, type, encrypted, position, created_at)
        SELECT id, name, type, encrypted, position, created_at FROM channels;
      DROP TABLE channels;
      ALTER TABLE channels_new RENAME TO channels;
    `);
  }

  // Migration: add file_retention_days to realm table
  const realmInfo2 = db.pragma("table_info(realm)") as { name: string }[];
  if (!realmInfo2.find((c) => c.name === "file_retention_days")) {
    db.exec("ALTER TABLE realm ADD COLUMN file_retention_days INTEGER DEFAULT NULL");
  }

  // Migration: add created_at to attachments table
  const attachInfo2 = db.pragma("table_info(attachments)") as { name: string }[];
  if (!attachInfo2.find((c) => c.name === "created_at")) {
    db.exec("ALTER TABLE attachments ADD COLUMN created_at INTEGER");
    // Backfill from parent message timestamps
    db.exec(`
      UPDATE attachments SET created_at = (
        SELECT m.created_at FROM messages m WHERE m.id = attachments.message_id
      ) WHERE created_at IS NULL AND message_id IS NOT NULL
    `);
    db.exec(`UPDATE attachments SET created_at = ${Date.now()} WHERE created_at IS NULL`);
  }
}

export function closeDb(): void {
  if (db) {
    db.close();
  }
}
