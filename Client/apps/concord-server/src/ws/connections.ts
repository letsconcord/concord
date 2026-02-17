import type { WebSocket } from "ws";
import type { Envelope } from "@concord/protocol";
import { RateLimiter } from "./rate-limit.js";

export interface Connection {
  ws: WebSocket;
  publicKey?: string;
  name?: string;
  bio?: string;
  authenticated: boolean;
  authNonce?: string;
  authTimeout?: ReturnType<typeof setTimeout>;
  joinedChannels: Set<string>;
  voiceChannelId?: string;
  rateLimiter: RateLimiter;
}

const connections = new Map<WebSocket, Connection>();

export function addConnection(ws: WebSocket): Connection {
  const conn: Connection = {
    ws,
    authenticated: false,
    joinedChannels: new Set(),
    rateLimiter: new RateLimiter(30, 10000), // 30 messages per 10 seconds
  };
  connections.set(ws, conn);
  return conn;
}

export function removeConnection(ws: WebSocket): Connection | undefined {
  const conn = connections.get(ws);
  connections.delete(ws);
  return conn;
}

export function getConnection(ws: WebSocket): Connection | undefined {
  return connections.get(ws);
}

export function getAllConnections(): Connection[] {
  return Array.from(connections.values());
}

export function getChannelConnections(channelId: string): Connection[] {
  return getAllConnections().filter((c) => c.joinedChannels.has(channelId));
}

export function getAuthenticatedConnections(): Connection[] {
  return getAllConnections().filter((c) => c.authenticated && c.publicKey);
}

/** Find an authenticated connection by public key */
export function getConnectionByPublicKey(publicKey: string): Connection | undefined {
  return getAllConnections().find((c) => c.authenticated && c.publicKey === publicKey);
}

/** Send an envelope to a single connection */
export function send(ws: WebSocket, envelope: Envelope): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(envelope));
  }
}

/** Broadcast an envelope to all connections in a channel */
export function broadcastToChannel(
  channelId: string,
  envelope: Envelope,
  exclude?: WebSocket
): void {
  for (const conn of getChannelConnections(channelId)) {
    if (conn.ws !== exclude) {
      send(conn.ws, envelope);
    }
  }
}

/** Broadcast to all authenticated connections */
export function broadcastToAll(
  envelope: Envelope,
  exclude?: WebSocket
): void {
  for (const conn of getAuthenticatedConnections()) {
    if (conn.ws !== exclude) {
      send(conn.ws, envelope);
    }
  }
}
