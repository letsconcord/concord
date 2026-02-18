import { v4 as uuid } from "uuid";
import { getDb } from "../db/database.js";
import config from "../config.js";
import type { RealmInfo } from "@concord/protocol";
import { ensureDefaultInvite } from "../invites/invites.js";

/** Ensure the realm row exists (creates on first boot) */
export function ensureRealm(): RealmInfo {
  const db = getDb();
  let row = db
    .prepare("SELECT * FROM realm LIMIT 1")
    .get() as Record<string, unknown> | undefined;

  if (!row) {
    const id = uuid();
    const now = Date.now();
    db.prepare(
      "INSERT INTO realm (id, name, description, encrypted, retention_days, file_retention_days, allow_dm, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      id,
      config.realmName,
      config.realmDescription,
      config.encrypted ? 1 : 0,
      config.retentionDays,
      config.fileRetentionDays,
      config.allowDirectMessages ? 1 : 0,
      now
    );
    row = db.prepare("SELECT * FROM realm LIMIT 1").get() as Record<string, unknown>;
  }

  ensureDefaultInvite();

  return rowToRealmInfo(row);
}

/** Sync the realm's config with environment variables */
export function syncRealmConfig(): void {
  const db = getDb();
  const row = db.prepare("SELECT encrypted, password_verify FROM realm LIMIT 1").get() as {
    encrypted: number;
    password_verify: string | null;
  } | undefined;
  if (!row) return;

  const dbEncrypted = row.encrypted === 1;
  if (dbEncrypted !== config.encrypted) {
    db.prepare("UPDATE realm SET encrypted = ?").run(config.encrypted ? 1 : 0);
  }

  // Sync password verification blob from env vars on every startup
  if (config.passwordVerify && config.passwordVerifyNonce) {
    if (row.password_verify !== config.passwordVerify) {
      db.prepare("UPDATE realm SET password_verify = ?, password_verify_nonce = ?")
        .run(config.passwordVerify, config.passwordVerifyNonce);
    }
  }
}

export function getRealmInfo(): RealmInfo {
  return ensureRealm();
}

/** Update realm settings. Returns the updated RealmInfo. */
export function updateRealm(update: {
  name?: string;
  description?: string;
  allowDirectMessages?: boolean;
  retentionDays?: number | null;
  fileRetentionDays?: number | null;
}): RealmInfo {
  const db = getDb();
  if (update.name !== undefined) {
    db.prepare("UPDATE realm SET name = ?").run(update.name);
  }
  if (update.description !== undefined) {
    db.prepare("UPDATE realm SET description = ?").run(update.description);
  }
  if (update.allowDirectMessages !== undefined) {
    db.prepare("UPDATE realm SET allow_dm = ?").run(update.allowDirectMessages ? 1 : 0);
  }
  if (update.retentionDays !== undefined) {
    db.prepare("UPDATE realm SET retention_days = ?").run(update.retentionDays);
  }
  if (update.fileRetentionDays !== undefined) {
    db.prepare("UPDATE realm SET file_retention_days = ?").run(update.fileRetentionDays);
  }
  return ensureRealm();
}

/** Store a zero-knowledge password verification blob on the realm */
export function setRealmPasswordVerify(ciphertext: string, nonce: string): void {
  getDb()
    .prepare("UPDATE realm SET password_verify = ?, password_verify_nonce = ?")
    .run(ciphertext, nonce);
}

function rowToRealmInfo(row: Record<string, unknown>): RealmInfo {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) ?? undefined,
    encrypted: (row.encrypted as number) === 1,
    retentionDays: (row.retention_days as number) ?? undefined,
    fileRetentionDays: (row.file_retention_days as number) ?? undefined,
    allowDirectMessages: (row.allow_dm as number) === 1,
    passwordVerify: (row.password_verify as string) ?? undefined,
    passwordVerifyNonce: (row.password_verify_nonce as string) ?? undefined,
    createdAt: row.created_at as number,
  };
}
