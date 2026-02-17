/** Every WebSocket message follows this envelope shape */
export interface Envelope<T = unknown> {
  type: string;
  id: string;
  timestamp: number;
  payload: T;
}

/** A stored/transmitted chat message */
export interface ChatMessage {
  id: string;
  channelId: string;
  senderPublicKey: string;
  content: string;
  signature: string;
  nonce: string;
  hasAttachment: boolean;
  createdAt: number;
}

/** File attachment metadata */
export interface Attachment {
  id: string;
  messageId: string;
  filename: string;
  mimeType: string;
  size: number;
}

/** Sender profile embedded in messages for display */
export interface MessageProfile {
  publicKey: string;
  name: string;
  bio?: string;
}
