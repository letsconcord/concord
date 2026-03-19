/**
 * Single-realm connection handler for the server UI (iframe).
 *
 * Replaces connection-manager.ts from the Tauri client.
 * Instead of managing multiple realms, this handles exactly one realm
 * and delegates signing to the parent shell via the bridge.
 */

import { WebSocketClient } from "./websocket-client.js";
import {
  getIdentity,
  getRealmAddress,
  getKeys,
  requestSign,
  reportStatus,
  reportRealmInfo,
  reportUnread,
} from "../bridge/iframe-bridge.js";
import { decryptMessage, verifyMessage } from "../crypto/bridge.js";
import {
  initDevice,
  confirmVoiceJoined,
  createTransports,
  produceAudio,
  consumeProducer,
  closeConsumerForProducer,
  isRecvTransportReady,
} from "../media/voice.js";
import type {
  Envelope,
  AuthChallengeEvent,
  RealmWelcomeEvent,
  ChannelHistoryEvent,
  ChannelMessageEvent,
  ChannelTypingEvent,
  MemberJoinEvent,
  MemberLeaveEvent,
  RealmUpdateEvent,
  ChannelCreateEvent,
  ChannelDeleteEvent,
  DmOpenedEvent,
  InviteRegeneratedEvent,
  VoiceJoinedEvent,
  VoiceParticipantJoinedEvent,
  VoiceParticipantLeftEvent,
  VoiceNewProducerEvent,
  VoiceProducerClosedEvent,
  MemberKickedEvent,
  RoleCreateEvent,
  RoleUpdateEvent,
  RoleDeleteEvent,
  RoleAssignEvent,
  RolesReorderedEvent,
  ChatMessage,
} from "@concord/protocol";
import { useRealmStore } from "../../stores/realm.js";
import { useMessagesStore, type DisplayMessage } from "../../stores/messages.js";
import { useMembersStore } from "../../stores/members.js";
import { useIdentityStore } from "../../stores/identity.js";
import { useRolesStore } from "../../stores/roles.js";
import { useVoiceStore } from "../../stores/voice.js";

// ─── State ──────────────────────────────────────────────────────

let client: WebSocketClient | null = null;
let realmId: string | null = null;
const pendingFetchHistory = new Set<string>();

// ─── Helpers ────────────────────────────────────────────────────

async function tryDecrypt(msg: ChatMessage): Promise<string> {
  const { realmKey, channelKeys } = getKeys();
  const channelKey = channelKeys.get(msg.channelId) ?? null;

  if (!realmKey && !channelKey) {
    if (msg.nonce) return "[Encrypted — missing key]";
    return msg.content;
  }

  if (!msg.nonce) return msg.content;

  try {
    return await decryptMessage(msg.content, msg.nonce, realmKey, channelKey);
  } catch {
    return "[Encrypted — wrong key]";
  }
}

function lookupMemberName(publicKey: string): string {
  const members = useMembersStore.getState().members;
  const profile = members[publicKey];
  return profile?.name ?? publicKey.slice(0, 8);
}

// ─── Connection ─────────────────────────────────────────────────

export function connect(): void {
  const identity = getIdentity();
  const address = getRealmAddress();
  if (!identity || !address) {
    console.error("[realm-handler] Cannot connect: no identity or address");
    return;
  }

  if (client) {
    client.disconnect();
  }

  reportStatus("connecting");

  client = new WebSocketClient(
    address,
    // onOpen
    () => {
      client!.send("user:profile", {
        publicKey: identity.publicKey,
        name: identity.name,
        bio: identity.bio,
      });
    },
    // onClose
    () => {
      console.log("[realm-handler] Disconnected");
      if (realmId) {
        useRealmStore.getState().setStatus("connecting");
      }
      reportStatus("connecting");
    },
    // onReconnectFailed
    () => {
      useRealmStore.getState().setStatus("error", "Connection failed");
      reportStatus("error", "Connection failed");
    }
  );

  // ── Auth: challenge → bridge sign → response ──

  client.on("auth:challenge", async (envelope: Envelope) => {
    const payload = envelope.payload as AuthChallengeEvent;
    const id = getIdentity();
    if (!id) return;

    const challengeMessage = `concord:auth:${payload.nonce}:${id.publicKey}`;
    try {
      const signature = await requestSign(challengeMessage);
      client!.send("auth:response", { signature });
    } catch (err) {
      console.error("[realm-handler] Sign request failed:", err);
      reportStatus("error", "Auth failed");
    }
  });

  client.on("auth:verified", () => {
    client!.send("realm:join", {});
  });

  // ── Realm welcome ──

  client.on("realm:welcome", async (envelope: Envelope) => {
    const payload = envelope.payload as RealmWelcomeEvent;
    realmId = payload.realm.id;

    useRealmStore.getState().setRealm({
      info: payload.realm,
      channels: payload.channels,
      activeChannelId: null,
      isAdmin: payload.isAdmin,
      status: "connected",
      inviteLinks: payload.inviteLinks,
    });

    useMembersStore.getState().setMembers(payload.members);
    useMembersStore.getState().setOnlineKeys(payload.onlineKeys);
    useRolesStore.getState().setRoles(payload.roles ?? []);
    useRolesStore.getState().setMyPermissions(payload.myPermissions ?? 0);

    // Voice participants
    const voiceStore = useVoiceStore.getState();
    voiceStore.clearChannelParticipants();
    if (payload.voiceParticipants) {
      for (const [channelId, participants] of Object.entries(payload.voiceParticipants)) {
        voiceStore.setChannelParticipants(channelId, participants);
      }
    }
    if (payload.screenSharers) {
      voiceStore.setScreenSharers(payload.screenSharers);
    }

    // Report to parent
    reportStatus("connected");
    reportRealmInfo({
      realmId: payload.realm.id,
      name: payload.realm.name,
      description: payload.realm.description,
      encrypted: payload.realm.encrypted,
      memberCount: payload.members.length,
      channelCount: payload.channels.length,
    });

    // Auto-join first text channel
    const textChannel = payload.channels.find((c) => c.type === "text");
    if (textChannel) {
      useRealmStore.getState().setActiveChannel(textChannel.id);
      client!.send("channel:join", { channelId: textChannel.id });
    }
  });

  // ── Realm errors ──

  client.on("realm:error", (envelope: Envelope) => {
    const payload = envelope.payload as { code: string; message: string };
    console.error(`[realm:error] ${payload.code}: ${payload.message}`);
  });

  // ── Channel history ──

  client.on("channel:history", async (envelope: Envelope) => {
    const payload = envelope.payload as ChannelHistoryEvent;

    const messages: DisplayMessage[] = await Promise.all(
      payload.messages.map(async (m) => {
        const content = await tryDecrypt(m);
        return {
          ...m,
          content,
          profile: { publicKey: m.senderPublicKey, name: lookupMemberName(m.senderPublicKey) },
        };
      })
    );

    const store = useMessagesStore.getState();
    const isPrepend = pendingFetchHistory.delete(payload.channelId);

    if (isPrepend) {
      store.prependHistory(payload.channelId, messages);
    } else {
      store.setHistory(payload.channelId, messages);
    }

    store.setHasMore(payload.channelId, payload.hasMore ?? false);
    store.setLoading(payload.channelId, false);
  });

  // ── Incoming messages ──

  client.on("channel:message", async (envelope: Envelope) => {
    const payload = envelope.payload as ChannelMessageEvent;

    if (payload.message.signature) {
      const valid = verifyMessage(
        payload.message.content,
        payload.message.signature,
        payload.message.senderPublicKey
      );
      if (!valid) {
        console.warn("[crypto] Invalid signature from", payload.message.senderPublicKey);
      }
    }

    const content = await tryDecrypt(payload.message);

    useMessagesStore.getState().addMessage(payload.channelId, {
      ...payload.message,
      content,
      profile: payload.profile,
    });

    // Unread tracking
    const identity = getIdentity();
    if (identity && payload.message.senderPublicKey !== identity.publicKey) {
      const activeChannelId = useRealmStore.getState().activeChannelId;
      if (activeChannelId !== payload.channelId) {
        // Track unread and report to parent
        reportUnread(1); // TODO: accumulate total
      }
    }
  });

  // ── Typing ──

  client.on("channel:typing", (envelope: Envelope) => {
    const _payload = envelope.payload as ChannelTypingEvent;
    // Will be wired to typing store once components are moved
  });

  // ── Members ──

  client.on("member:join", (envelope: Envelope) => {
    const payload = envelope.payload as MemberJoinEvent;
    useMembersStore.getState().addMember(payload.member);
    useMembersStore.getState().setOnline(payload.member.publicKey);
  });

  client.on("member:leave", (envelope: Envelope) => {
    const payload = envelope.payload as MemberLeaveEvent;
    if (payload.removed) {
      useMembersStore.getState().removeMember(payload.publicKey);
    } else {
      useMembersStore.getState().setOffline(payload.publicKey);
    }
  });

  // ── Realm update ──

  client.on("realm:update", (envelope: Envelope) => {
    const payload = envelope.payload as RealmUpdateEvent;
    const realm = useRealmStore.getState();
    if (realm.info) {
      useRealmStore.getState().updateInfo({
        name: payload.name,
        description: payload.description,
        allowDirectMessages: payload.allowDirectMessages,
        retentionDays: payload.retentionDays ?? undefined,
        fileRetentionDays: payload.fileRetentionDays ?? undefined,
        thumbnailFileId: payload.thumbnailFileId ?? undefined,
      });
    }
  });

  // ── Channel events ──

  client.on("channel:create", (envelope: Envelope) => {
    const payload = envelope.payload as ChannelCreateEvent;
    useRealmStore.getState().addChannel(payload.channel);
  });

  client.on("channel:delete", (envelope: Envelope) => {
    const payload = envelope.payload as ChannelDeleteEvent;
    useRealmStore.getState().removeChannel(payload.channelId);
  });

  client.on("dm:opened", (envelope: Envelope) => {
    const payload = envelope.payload as DmOpenedEvent;
    const realm = useRealmStore.getState();
    const exists = realm.channels.some((c) => c.id === payload.channel.id);
    if (!exists) {
      realm.addChannel(payload.channel);
    }
    realm.setActiveChannel(payload.channel.id);
    client!.send("channel:join", { channelId: payload.channel.id });
  });

  client.on("invite:regenerated", (envelope: Envelope) => {
    const payload = envelope.payload as InviteRegeneratedEvent;
    useRealmStore.getState().setInviteLinks(payload.inviteLinks);
  });

  // ── Voice events ──

  client.on("voice:joined", async (envelope: Envelope) => {
    const payload = envelope.payload as VoiceJoinedEvent;
    try {
      confirmVoiceJoined(payload.channelId);

      const id = getIdentity();
      if (id) {
        const voiceStore = useVoiceStore.getState();
        voiceStore.addParticipant({
          publicKey: id.publicKey,
          name: id.name,
          isMuted: false,
          isSpeaking: false,
          hasWebcam: false,
          hasScreen: false,
        });
        voiceStore.addChannelParticipant(payload.channelId, {
          publicKey: id.publicKey,
          name: id.name,
        });
      }

      await initDevice(payload.rtpCapabilities);
      await createTransports(payload.channelId, client!, payload.iceServers as RTCIceServer[] | undefined);
      await produceAudio(payload.channelId, client!);

      // Consume any buffered remote producers
      const voiceState = useVoiceStore.getState();
      const selfKey = getIdentity()?.publicKey;
      const consumedProducerIds = new Set(
        Array.from(voiceState.remoteStreams.values()).map((s) => s.producerId)
      );
      for (const producer of voiceState.remoteProducers.values()) {
        if (producer.producerPublicKey === selfKey) continue;
        if (consumedProducerIds.has(producer.producerId)) continue;
        if (producer.producerKind === "mic" || producer.producerKind === "webcam") {
          try {
            await consumeProducer(payload.channelId, producer.producerId, client!);
          } catch (err) {
            console.error("[voice] Failed to consume buffered producer:", err);
          }
        }
      }
    } catch (err) {
      console.error("[voice] Failed to init voice pipeline:", err);
    }
  });

  client.on("voice:participant:joined", (envelope: Envelope) => {
    const payload = envelope.payload as VoiceParticipantJoinedEvent;
    useVoiceStore.getState().addParticipant({
      publicKey: payload.publicKey,
      name: payload.name,
      isMuted: false,
      isSpeaking: false,
      hasWebcam: false,
      hasScreen: false,
    });
    useVoiceStore.getState().addChannelParticipant(payload.channelId, {
      publicKey: payload.publicKey,
      name: payload.name,
    });
  });

  client.on("voice:participant:left", (envelope: Envelope) => {
    const payload = envelope.payload as VoiceParticipantLeftEvent;
    useVoiceStore.getState().removeParticipant(payload.publicKey);
    useVoiceStore.getState().removeChannelParticipant(payload.channelId, payload.publicKey);
  });

  client.on("voice:new-producer", async (envelope: Envelope) => {
    const payload = envelope.payload as VoiceNewProducerEvent;
    const selfKey = getIdentity()?.publicKey;

    if (payload.producerKind === "screen") {
      useVoiceStore.getState().addScreenSharer(payload.channelId, payload.producerPublicKey);
    }

    if (payload.producerPublicKey === selfKey) return;

    const voiceStore = useVoiceStore.getState();
    voiceStore.addRemoteProducer({
      producerId: payload.producerId,
      producerPublicKey: payload.producerPublicKey,
      kind: payload.kind,
      producerKind: payload.producerKind,
    });

    if (payload.producerKind === "webcam") {
      voiceStore.updateParticipantMedia(payload.producerPublicKey, { hasWebcam: true });
    } else if (payload.producerKind === "screen") {
      voiceStore.updateParticipantMedia(payload.producerPublicKey, { hasScreen: true });
    }

    if (voiceStore.activeChannelId === payload.channelId && isRecvTransportReady()) {
      if (payload.producerKind === "mic" || payload.producerKind === "webcam") {
        try {
          await consumeProducer(payload.channelId, payload.producerId, client!);
        } catch (err) {
          console.error("[voice] Failed to auto-consume producer:", err);
        }
      }
    }
  });

  client.on("voice:producer-closed", (envelope: Envelope) => {
    const payload = envelope.payload as VoiceProducerClosedEvent;

    if (payload.producerKind === "screen") {
      useVoiceStore.getState().removeScreenSharer(payload.channelId, payload.producerPublicKey);
    }

    const selfKey = getIdentity()?.publicKey;
    if (payload.producerPublicKey === selfKey) return;

    const voiceStore = useVoiceStore.getState();
    voiceStore.removeRemoteProducer(payload.producerId);

    if (payload.producerKind === "webcam") {
      voiceStore.updateParticipantMedia(payload.producerPublicKey, { hasWebcam: false });
    } else if (payload.producerKind === "screen") {
      voiceStore.updateParticipantMedia(payload.producerPublicKey, { hasScreen: false });
    }

    closeConsumerForProducer(payload.producerId);

    if (voiceStore.watchingScreenId === payload.producerId) {
      voiceStore.setWatchingScreen(null);
    }
  });

  // ── Moderation ──

  client.on("member:kicked", (_envelope: Envelope) => {
    useRealmStore.getState().setStatus("error", "Kicked from realm");
    reportStatus("error", "Kicked");
    client?.disconnect();
    client = null;
  });

  client.on("member:banned", (_envelope: Envelope) => {
    useRealmStore.getState().setStatus("error", "Banned from realm");
    reportStatus("error", "Banned");
    client?.disconnect();
    client = null;
  });

  // ── Roles ──

  client.on("role:create", (envelope: Envelope) => {
    const payload = envelope.payload as RoleCreateEvent;
    useRolesStore.getState().addRole(payload.role);
  });

  client.on("role:update", (envelope: Envelope) => {
    const payload = envelope.payload as RoleUpdateEvent;
    useRolesStore.getState().updateRole(payload.role);
  });

  client.on("role:delete", (envelope: Envelope) => {
    const payload = envelope.payload as RoleDeleteEvent;
    useRolesStore.getState().deleteRole(payload.roleId);
  });

  client.on("role:assign", (envelope: Envelope) => {
    const payload = envelope.payload as RoleAssignEvent;
    useMembersStore.getState().setMemberRole(payload.publicKey, payload.roleId ?? undefined);
  });

  client.on("roles:reordered", (envelope: Envelope) => {
    const payload = envelope.payload as RolesReorderedEvent;
    useRolesStore.getState().reorderRoles(payload.roles);
  });

  client.connect();
}

export function disconnect(): void {
  client?.disconnect();
  client = null;
  realmId = null;
  reportStatus("disconnected");
}

export function getWebSocketClient(): WebSocketClient | null {
  return client;
}

export function getRealmId(): string | null {
  return realmId;
}

export function fetchOlderMessages(channelId: string, before: number): void {
  if (!client?.isConnected) return;
  pendingFetchHistory.add(channelId);
  useMessagesStore.getState().setLoading(channelId, true);
  client.send("channel:fetch-history", { channelId, before });
}
