import { getDb } from "../db/database.js";
import type { ChatMessage } from "@concord/protocol";

export function saveMessage(msg: ChatMessage): void {
  getDb()
    .prepare(
      `INSERT INTO messages (id, channel_id, sender_public_key, content, signature, nonce, has_attachment, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      msg.id,
      msg.channelId,
      msg.senderPublicKey,
      msg.content,
      msg.signature,
      msg.nonce,
      msg.hasAttachment ? 1 : 0,
      msg.createdAt
    );
}

export function getChannelMessages(
  channelId: string,
  limit = 50,
  before?: number
): ChatMessage[] {
  const query = before
    ? `SELECT * FROM messages WHERE channel_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?`
    : `SELECT * FROM messages WHERE channel_id = ? ORDER BY created_at DESC LIMIT ?`;

  const params = before
    ? [channelId, before, limit]
    : [channelId, limit];

  const rows = getDb().prepare(query).all(...params) as Record<string, unknown>[];

  return rows.map(rowToMessage).reverse();
}

function rowToMessage(row: Record<string, unknown>): ChatMessage {
  return {
    id: row.id as string,
    channelId: row.channel_id as string,
    senderPublicKey: row.sender_public_key as string,
    content: row.content as string,
    signature: row.signature as string,
    nonce: row.nonce as string,
    hasAttachment: (row.has_attachment as number) === 1,
    createdAt: row.created_at as number,
  };
}
