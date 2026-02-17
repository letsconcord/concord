import { v4 as uuid } from "uuid";
import { getDb } from "../db/database.js";
import type { Channel, ChannelType } from "@concord/protocol";

/** Get all public channels (excludes DMs) */
export function getChannels(): Channel[] {
  const rows = getDb()
    .prepare("SELECT * FROM channels WHERE type != 'dm' ORDER BY position ASC")
    .all() as Record<string, unknown>[];

  return rows.map(rowToChannel);
}

export function getChannel(id: string): Channel | undefined {
  const row = getDb()
    .prepare("SELECT * FROM channels WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;

  return row ? rowToChannel(row) : undefined;
}

export function createChannel(
  name: string,
  type: ChannelType,
  encrypted = false,
  passwordVerify?: string,
  passwordVerifyNonce?: string
): Channel {
  const id = uuid();
  const now = Date.now();
  const maxPos = getDb()
    .prepare("SELECT COALESCE(MAX(position), -1) as max FROM channels")
    .get() as { max: number };

  getDb()
    .prepare(
      "INSERT INTO channels (id, name, type, encrypted, position, password_verify, password_verify_nonce, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(id, name, type, encrypted ? 1 : 0, maxPos.max + 1, passwordVerify ?? null, passwordVerifyNonce ?? null, now);

  const channel: Channel = { id, name, type, encrypted, position: maxPos.max + 1, createdAt: now };
  if (passwordVerify) channel.passwordVerify = passwordVerify;
  if (passwordVerifyNonce) channel.passwordVerifyNonce = passwordVerifyNonce;
  return channel;
}

export function deleteChannel(id: string): boolean {
  const result = getDb()
    .prepare("DELETE FROM channels WHERE id = ?")
    .run(id);
  return result.changes > 0;
}

/** Ensure default channels exist on first boot */
export function ensureDefaultChannels(): void {
  const channels = getChannels();
  if (channels.length === 0) {
    createChannel("general", "text");
    createChannel("voice", "voice");
  }
}

/**
 * Find or create a DM channel between two users.
 * Participants are sorted to ensure deterministic lookup.
 */
export function findOrCreateDmChannel(keyA: string, keyB: string): Channel {
  const participants = [keyA, keyB].sort();
  const participantsStr = participants.join(":");

  const existing = getDb()
    .prepare("SELECT * FROM channels WHERE type = 'dm' AND participants = ?")
    .get(participantsStr) as Record<string, unknown> | undefined;

  if (existing) return rowToChannel(existing);

  const id = uuid();
  const now = Date.now();
  getDb()
    .prepare(
      "INSERT INTO channels (id, name, type, encrypted, position, participants, created_at) VALUES (?, ?, 'dm', 0, 0, ?, ?)"
    )
    .run(id, `dm:${participantsStr}`, participantsStr, now);

  return {
    id,
    name: `dm:${participantsStr}`,
    type: "dm",
    encrypted: false,
    position: 0,
    participants,
    createdAt: now,
  };
}

/** Get all DM channels where the given user is a participant */
export function getDmChannelsForUser(publicKey: string): Channel[] {
  const rows = getDb()
    .prepare("SELECT * FROM channels WHERE type = 'dm' AND participants LIKE ?")
    .all(`%${publicKey}%`) as Record<string, unknown>[];

  // Double-check participant membership (LIKE can over-match)
  return rows.map(rowToChannel).filter(
    (ch) => ch.participants?.includes(publicKey)
  );
}

/** Store a zero-knowledge password verification blob on a channel */
export function setChannelPasswordVerify(channelId: string, ciphertext: string, nonce: string): void {
  getDb()
    .prepare("UPDATE channels SET password_verify = ?, password_verify_nonce = ? WHERE id = ?")
    .run(ciphertext, nonce, channelId);
}

function rowToChannel(row: Record<string, unknown>): Channel {
  const channel: Channel = {
    id: row.id as string,
    name: row.name as string,
    type: row.type as ChannelType,
    encrypted: (row.encrypted as number) === 1,
    position: row.position as number,
    createdAt: row.created_at as number,
  };
  if (row.password_verify) {
    channel.passwordVerify = row.password_verify as string;
  }
  if (row.password_verify_nonce) {
    channel.passwordVerifyNonce = row.password_verify_nonce as string;
  }
  if (row.participants) {
    channel.participants = (row.participants as string).split(":");
  }
  return channel;
}
