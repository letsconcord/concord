/**
 * PostMessage Bridge Protocol
 *
 * Typed message contract between the Tauri shell (parent) and
 * realm server UI (iframe). Keys are serialized as number[] because
 * postMessage structured clone can't reliably transfer typed arrays
 * cross-origin.
 */

// ─── Parent → iframe ────────────────────────────────────────────

/** Sent after iframe dispatches `bridge:ready`. Bootstraps the realm UI. */
export interface BridgeInitMessage {
  type: "bridge:init";
  publicKey: string;
  name: string;
  bio: string;
  realmAddress: string;
  realmKey: number[] | null;
  channelKeys: Record<string, number[]>;
  theme: "light" | "dark";
}

/** Realm key updated (e.g. user entered password after init). */
export interface BridgeRealmKeyMessage {
  type: "bridge:keys:realm";
  realmKey: number[];
}

/** Channel key provided after parent password dialog. */
export interface BridgeChannelKeyMessage {
  type: "bridge:keys:channel";
  channelId: string;
  channelKey: number[];
}

/** Signing response from parent. */
export interface BridgeSignResponseMessage {
  type: "bridge:sign:response";
  requestId: string;
  signature: string;
}

/** User updated their profile in the shell. */
export interface BridgeProfileUpdateMessage {
  type: "bridge:profile:update";
  name: string;
  bio: string;
}

export type ParentToIframeMessage =
  | BridgeInitMessage
  | BridgeRealmKeyMessage
  | BridgeChannelKeyMessage
  | BridgeSignResponseMessage
  | BridgeProfileUpdateMessage;

// ─── iframe → Parent ────────────────────────────────────────────

/** iframe listener is ready — parent should send `bridge:init`. */
export interface BridgeReadyMessage {
  type: "bridge:ready";
}

/** Request parent to sign data with the user's secret key. */
export interface BridgeSignRequestMessage {
  type: "bridge:sign:request";
  requestId: string;
  /** Hex-encoded data to sign (auth challenge or ciphertext). */
  data: string;
}

/** Realm connection status update for sidebar display. */
export interface BridgeRealmStatusMessage {
  type: "bridge:realm:status";
  status: "connecting" | "connected" | "disconnected" | "error";
  error?: string;
}

/** Realm metadata after `realm:welcome`, for sidebar display. */
export interface BridgeRealmInfoMessage {
  type: "bridge:realm:info";
  realmId: string;
  name: string;
  description?: string;
  encrypted: boolean;
  memberCount: number;
  channelCount: number;
}

/** Unread count for sidebar badge. */
export interface BridgeNotificationUnreadMessage {
  type: "bridge:notification:unread";
  totalRealmUnread: number;
}

/** Voice status for shell voice indicator. */
export interface BridgeVoiceStatusMessage {
  type: "bridge:voice:status";
  channelId: string | null;
  isMuted: boolean;
  isDeafened: boolean;
}

/** Request parent to open URL in system browser via Tauri shell. */
export interface BridgeOpenExternalMessage {
  type: "bridge:open:external";
  url: string;
}

/** Request parent to show channel password dialog. */
export interface BridgeChannelPasswordRequestMessage {
  type: "bridge:channel:password:request";
  channelId: string;
  channelName: string;
}

/** Iframe requests parent to show/hide the realm sidebar (mobile). */
export interface BridgeSidebarStateMessage {
  type: "bridge:sidebar:state";
  open: boolean;
}

export type IframeToParentMessage =
  | BridgeReadyMessage
  | BridgeSignRequestMessage
  | BridgeRealmStatusMessage
  | BridgeRealmInfoMessage
  | BridgeNotificationUnreadMessage
  | BridgeVoiceStatusMessage
  | BridgeOpenExternalMessage
  | BridgeChannelPasswordRequestMessage
  | BridgeSidebarStateMessage;

// ─── Union ──────────────────────────────────────────────────────

export type BridgeMessage = ParentToIframeMessage | IframeToParentMessage;
