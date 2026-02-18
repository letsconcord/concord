import { v4 as uuid } from "uuid";
import { getDb } from "../db/database.js";

export interface InviteLink {
  id: string;
  key: string;
  createdAt: number;
}

/** Create a default invite link if none exist. */
export function ensureDefaultInvite(): void {
  const db = getDb();
  const count = db.prepare("SELECT COUNT(*) as c FROM invite_links").get() as { c: number };
  if (count.c === 0) {
    db.prepare("INSERT INTO invite_links (id, key, created_at) VALUES (?, ?, ?)").run(
      uuid(),
      uuid(),
      Date.now()
    );
  }
}

/** Get all invite links. */
export function getInviteLinks(): InviteLink[] {
  return getDb()
    .prepare("SELECT id, key, created_at as createdAt FROM invite_links ORDER BY created_at")
    .all() as InviteLink[];
}

/** Get the encryption key for a specific invite link (public HTTP endpoint). */
export function getInviteKey(id: string): string | null {
  const row = getDb()
    .prepare("SELECT key FROM invite_links WHERE id = ?")
    .get(id) as { key: string } | undefined;
  return row?.key ?? null;
}

/** Regenerate an invite link: delete the old one, create a new one with a fresh id + key. */
export function regenerateInvite(id: string): InviteLink | null {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM invite_links WHERE id = ?").get(id);
  if (!existing) return null;

  const newId = uuid();
  const newKey = uuid();
  const now = Date.now();

  db.prepare("DELETE FROM invite_links WHERE id = ?").run(id);
  db.prepare("INSERT INTO invite_links (id, key, created_at) VALUES (?, ?, ?)").run(newId, newKey, now);

  return { id: newId, key: newKey, createdAt: now };
}
