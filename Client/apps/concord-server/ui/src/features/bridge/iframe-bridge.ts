/**
 * iframe-side PostMessage bridge.
 *
 * Communicates with the Tauri shell (parent window) to:
 *  - Receive identity, keys, and theme
 *  - Request signatures (secret key never leaves parent)
 *  - Report realm status, unread counts, voice state
 *  - Request external link opens (Tauri shell.open)
 */

import type {
  BridgeInitMessage,
  BridgeSignResponseMessage,
  BridgeRealmKeyMessage,
  BridgeChannelKeyMessage,
  BridgeProfileUpdateMessage,
  ParentToIframeMessage,
} from "@concord/protocol";

// ─── Types ──────────────────────────────────────────────────────

export interface RealmIdentity {
  publicKey: string;
  name: string;
  bio: string;
}

export interface RealmKeys {
  realmKey: Uint8Array | null;
  channelKeys: Map<string, Uint8Array>;
}

type InitCallback = (data: BridgeInitMessage) => void;
type ProfileUpdateCallback = (name: string, bio: string) => void;

// ─── State ──────────────────────────────────────────────────────

let parentOrigin: string | null = null;
let identity: RealmIdentity | null = null;
let realmAddress: string = "";
let keys: RealmKeys = { realmKey: null, channelKeys: new Map() };
let theme: "light" | "dark" = "dark";

const pendingSignRequests = new Map<
  string,
  { resolve: (sig: string) => void; reject: (err: Error) => void }
>();

const initCallbacks = new Set<InitCallback>();
const profileUpdateCallbacks = new Set<ProfileUpdateCallback>();

// ─── Helpers ────────────────────────────────────────────────────

function toUint8Array(arr: number[]): Uint8Array {
  return new Uint8Array(arr);
}

function postToParent(message: Record<string, unknown>): void {
  if (!window.parent || window.parent === window) return;
  // When running standalone (dev mode, no parent), skip postMessage
  if (!parentOrigin) return;
  window.parent.postMessage(message, parentOrigin);
}

// ─── Incoming message handler ───────────────────────────────────

function handleMessage(event: MessageEvent): void {
  // In dev mode (standalone), accept messages from own origin
  // In production (iframe), validate against stored parent origin
  if (parentOrigin && event.origin !== parentOrigin) return;

  const msg = event.data as ParentToIframeMessage;
  if (!msg || typeof msg.type !== "string") return;

  switch (msg.type) {
    case "bridge:init": {
      parentOrigin = event.origin;
      identity = {
        publicKey: msg.publicKey,
        name: msg.name,
        bio: msg.bio,
      };
      realmAddress = msg.realmAddress;
      keys.realmKey = msg.realmKey ? toUint8Array(msg.realmKey) : null;
      keys.channelKeys.clear();
      for (const [id, keyArr] of Object.entries(msg.channelKeys)) {
        keys.channelKeys.set(id, toUint8Array(keyArr));
      }
      theme = msg.theme;
      document.documentElement.classList.toggle("dark", theme === "dark");

      for (const cb of initCallbacks) cb(msg);
      break;
    }

    case "bridge:keys:realm": {
      const m = msg as BridgeRealmKeyMessage;
      keys.realmKey = toUint8Array(m.realmKey);
      break;
    }

    case "bridge:keys:channel": {
      const m = msg as BridgeChannelKeyMessage;
      keys.channelKeys.set(m.channelId, toUint8Array(m.channelKey));
      break;
    }

    case "bridge:sign:response": {
      const m = msg as BridgeSignResponseMessage;
      const pending = pendingSignRequests.get(m.requestId);
      if (pending) {
        pending.resolve(m.signature);
        pendingSignRequests.delete(m.requestId);
      }
      break;
    }

    case "bridge:profile:update": {
      const m = msg as BridgeProfileUpdateMessage;
      if (identity) {
        identity.name = m.name;
        identity.bio = m.bio;
      }
      for (const cb of profileUpdateCallbacks) cb(m.name, m.bio);
      break;
    }
  }
}

// ─── Public API ─────────────────────────────────────────────────

/** Initialize the bridge. Call once on app mount. */
export function initBridge(): void {
  window.addEventListener("message", handleMessage);

  // Signal readiness to parent
  if (window.parent && window.parent !== window) {
    // Post to * initially since we don't know parent origin yet.
    // The parent will respond with bridge:init which locks the origin.
    window.parent.postMessage({ type: "bridge:ready" }, "*");
  }
}

/** Clean up the bridge listener. */
export function destroyBridge(): void {
  window.removeEventListener("message", handleMessage);
  pendingSignRequests.clear();
}

/** Register a callback for when bridge:init is received. */
export function onInit(cb: InitCallback): () => void {
  initCallbacks.add(cb);
  return () => { initCallbacks.delete(cb); };
}

/** Register a callback for profile updates from parent. */
export function onProfileUpdate(cb: ProfileUpdateCallback): () => void {
  profileUpdateCallbacks.add(cb);
  return () => { profileUpdateCallbacks.delete(cb); };
}

/** Request the parent to sign data (hex string). Returns hex signature. */
export function requestSign(dataHex: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    pendingSignRequests.set(requestId, { resolve, reject });

    postToParent({
      type: "bridge:sign:request",
      requestId,
      data: dataHex,
    });

    // Timeout after 30s
    setTimeout(() => {
      if (pendingSignRequests.has(requestId)) {
        pendingSignRequests.delete(requestId);
        reject(new Error("Sign request timed out"));
      }
    }, 30_000);
  });
}

/** Report realm connection status to parent for sidebar display. */
export function reportStatus(
  status: "connecting" | "connected" | "disconnected" | "error",
  error?: string
): void {
  postToParent({ type: "bridge:realm:status", status, error });
}

/** Report realm metadata to parent after realm:welcome. */
export function reportRealmInfo(info: {
  realmId: string;
  name: string;
  description?: string;
  encrypted: boolean;
  memberCount: number;
  channelCount: number;
}): void {
  postToParent({ type: "bridge:realm:info", ...info });
}

/** Report unread count to parent for sidebar badge. */
export function reportUnread(totalRealmUnread: number): void {
  postToParent({ type: "bridge:notification:unread", totalRealmUnread });
}

/** Report voice status to parent for voice indicator. */
export function reportVoiceStatus(
  channelId: string | null,
  isMuted: boolean,
  isDeafened: boolean
): void {
  postToParent({ type: "bridge:voice:status", channelId, isMuted, isDeafened });
}

/** Request parent to open a URL in the system browser. */
export function requestOpenExternal(url: string): void {
  postToParent({ type: "bridge:open:external", url });
}

/** Request parent to show channel password dialog. */
export function requestChannelPassword(
  channelId: string,
  channelName: string
): void {
  postToParent({
    type: "bridge:channel:password:request",
    channelId,
    channelName,
  });
}

/** Tell parent to show or hide the realm sidebar (mobile). */
export function reportSidebarState(open: boolean): void {
  postToParent({ type: "bridge:sidebar:state", open });
}

// ─── Accessors ──────────────────────────────────────────────────

export function getIdentity(): RealmIdentity | null {
  return identity;
}

export function getRealmAddress(): string {
  return realmAddress;
}

export function getKeys(): RealmKeys {
  return keys;
}

export function getTheme(): "light" | "dark" {
  return theme;
}

/** Check if we're running inside an iframe (vs standalone dev mode). */
export function isEmbedded(): boolean {
  return window.parent !== window;
}
