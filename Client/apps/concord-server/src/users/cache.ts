import { getDb } from "../db/database.js";
import type { UserProfile } from "@concord/protocol";

export function upsertProfile(profile: UserProfile): void {
  getDb()
    .prepare(
      `INSERT INTO user_profiles (public_key, name, bio, last_seen) VALUES (?, ?, ?, ?)
       ON CONFLICT(public_key) DO UPDATE SET name = excluded.name, bio = excluded.bio, last_seen = excluded.last_seen`
    )
    .run(profile.publicKey, profile.name, profile.bio ?? null, Date.now());
}

export function getProfile(publicKey: string): UserProfile | undefined {
  const row = getDb()
    .prepare("SELECT * FROM user_profiles WHERE public_key = ?")
    .get(publicKey) as Record<string, unknown> | undefined;

  if (!row) return undefined;

  return {
    publicKey: row.public_key as string,
    name: row.name as string,
    bio: (row.bio as string) ?? undefined,
    lastSeen: row.last_seen as number,
  };
}

export function getAllProfiles(): UserProfile[] {
  const rows = getDb()
    .prepare("SELECT * FROM user_profiles ORDER BY last_seen DESC")
    .all() as Record<string, unknown>[];

  return rows.map((row) => ({
    publicKey: row.public_key as string,
    name: row.name as string,
    bio: (row.bio as string) ?? undefined,
    lastSeen: row.last_seen as number,
  }));
}
