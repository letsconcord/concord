import type { WebSocket, RawData } from "ws";
import { randomBytes } from "node:crypto";
import { v4 as uuid } from "uuid";
import type {
  Envelope,
  RealmJoinCommand,
  ChannelJoinCommand,
  ChannelMessageCommand,
  ChannelTypingCommand,
  ChannelCreateCommand,
  ChannelDeleteCommand,
  ChannelFetchHistoryCommand,
  RealmUpdateCommand,
  RealmSetPasswordVerifyCommand,
  ChannelSetPasswordVerifyCommand,
  DmOpenCommand,
  UserProfileCommand,
  AuthResponseCommand,
  InviteRegenerateCommand,
  VoiceJoinCommand,
  VoiceLeaveCommand,
  VoiceProduceCommand,
  VoiceConsumeCommand,
  VoiceCreateTransportCommand,
  VoiceConnectTransportCommand,
  VoiceCloseProducerCommand,
  ChatMessage,
} from "@concord/protocol";
import { verify, fromBase58, fromHex, toHex } from "@concord/crypto";
import {
  addConnection,
  removeConnection,
  getConnection,
  getConnectionByPublicKey,
  getAuthenticatedConnections,
  send,
  broadcastToChannel,
  broadcastToAll,
} from "./connections.js";
import config, { isAdmin } from "../config.js";
import { getRealmInfo, updateRealm, setRealmPasswordVerify } from "../realm/realm.js";
import { getChannels, getChannel, createChannel, deleteChannel, findOrCreateDmChannel, getDmChannelsForUser, setChannelPasswordVerify } from "../realm/channels.js";
import { saveMessage, getChannelMessages } from "../messages/store.js";
import { upsertProfile, getAllProfiles } from "../users/cache.js";
import {
  getOrCreateRoom,
  removeParticipant,
  getAllVoiceParticipants,
  getOtherProducers,
  createTransport,
  connectTransport,
  createProducer,
  createConsumer,
  closeProducer,
  getRoom,
  getScreenShareChannels,
} from "../media/rooms.js";
import { isSfuReady } from "../media/sfu.js";
import { getInviteLinks, regenerateInvite } from "../invites/invites.js";

export function handleConnection(ws: WebSocket): void {
  const conn = addConnection(ws);

  ws.on("message", (data: RawData) => {
    try {
      // Rate limiting
      if (!conn.rateLimiter.check()) {
        send(ws, {
          type: "realm:error",
          id: uuid(),
          timestamp: Date.now(),
          payload: { code: "RATE_LIMITED", message: "Too many messages, slow down" },
        });
        return;
      }

      const envelope = JSON.parse(data.toString()) as Envelope;
      handleMessage(ws, envelope);
    } catch {
      send(ws, {
        type: "realm:error",
        id: uuid(),
        timestamp: Date.now(),
        payload: { code: "INVALID_MESSAGE", message: "Failed to parse message" },
      });
    }
  });

  ws.on("close", () => {
    const removed = removeConnection(ws);
    if (removed?.authTimeout) {
      clearTimeout(removed.authTimeout);
    }
    if (removed?.publicKey) {
      // Clean up voice channel if they were in one
      if (removed.voiceChannelId) {
        // Collect producer info before removing participant (for close notifications)
        const room = getRoom(removed.voiceChannelId);
        const producerInfos: { producerId: string; kind: "audio" | "video"; producerKind: "mic" | "webcam" | "screen" }[] = [];
        if (room) {
          const participant = room.participants.get(removed.publicKey);
          if (participant) {
            for (const [producerId, info] of participant.producers) {
              producerInfos.push({ producerId, kind: info.kind, producerKind: info.producerKind });
            }
          }
        }

        removeParticipant(removed.voiceChannelId, removed.publicKey);

        // Broadcast producer closed events for each producer
        for (const pInfo of producerInfos) {
          broadcastToAll({
            type: "voice:producer-closed",
            id: uuid(),
            timestamp: Date.now(),
            payload: {
              channelId: removed.voiceChannelId,
              producerId: pInfo.producerId,
              producerPublicKey: removed.publicKey,
              producerKind: pInfo.producerKind,
            },
          });
        }

        broadcastToAll({
          type: "voice:participant:left",
          id: uuid(),
          timestamp: Date.now(),
          payload: { channelId: removed.voiceChannelId, publicKey: removed.publicKey },
        });
      }

      broadcastToAll(
        {
          type: "member:leave",
          id: uuid(),
          timestamp: Date.now(),
          payload: { publicKey: removed.publicKey },
        },
        ws
      );
    }
  });
}

function handleMessage(ws: WebSocket, envelope: Envelope): void {
  const conn = getConnection(ws);

  // Auth gate: only user:profile and auth:response are allowed before authentication
  if (conn && !conn.authenticated && envelope.type !== "user:profile" && envelope.type !== "auth:response") {
    send(ws, {
      type: "realm:error",
      id: uuid(),
      timestamp: Date.now(),
      payload: { code: "NOT_AUTHENTICATED", message: "Complete authentication first" },
    });
    return;
  }

  switch (envelope.type) {
    case "realm:join":
      handleRealmJoin(ws, envelope.payload as RealmJoinCommand);
      break;
    case "channel:join":
      handleChannelJoin(ws, envelope.payload as ChannelJoinCommand);
      break;
    case "channel:message":
      handleChannelMessage(ws, envelope);
      break;
    case "channel:typing":
      handleTyping(ws, envelope.payload as ChannelTypingCommand);
      break;
    case "user:profile":
      handleUserProfile(ws, envelope.payload as UserProfileCommand);
      break;
    case "auth:response":
      handleAuthResponse(ws, envelope.payload as AuthResponseCommand);
      break;
    case "voice:join":
      handleVoiceJoin(ws, envelope.payload as VoiceJoinCommand);
      break;
    case "voice:leave":
      handleVoiceLeave(ws, envelope.payload as VoiceLeaveCommand);
      break;
    case "voice:create-transport":
      handleVoiceCreateTransport(ws, envelope.payload as VoiceCreateTransportCommand);
      break;
    case "voice:connect-transport":
      handleVoiceConnectTransport(ws, envelope.payload as VoiceConnectTransportCommand);
      break;
    case "voice:produce":
      handleVoiceProduce(ws, envelope.payload as VoiceProduceCommand);
      break;
    case "voice:consume":
      handleVoiceConsume(ws, envelope.payload as VoiceConsumeCommand);
      break;
    case "voice:close-producer":
      handleVoiceCloseProducer(ws, envelope.payload as VoiceCloseProducerCommand);
      break;
    case "realm:update":
      handleRealmUpdate(ws, envelope.payload as RealmUpdateCommand);
      break;
    case "realm:set-password-verify":
      handleRealmSetPasswordVerify(ws, envelope.payload as RealmSetPasswordVerifyCommand);
      break;
    case "channel:create":
      handleChannelCreate(ws, envelope.payload as ChannelCreateCommand);
      break;
    case "channel:delete":
      handleChannelDelete(ws, envelope.payload as ChannelDeleteCommand);
      break;
    case "channel:set-password-verify":
      handleChannelSetPasswordVerify(ws, envelope.payload as ChannelSetPasswordVerifyCommand);
      break;
    case "channel:fetch-history":
      handleChannelFetchHistory(ws, envelope.payload as ChannelFetchHistoryCommand);
      break;
    case "dm:open":
      handleDmOpen(ws, envelope.payload as DmOpenCommand);
      break;
    case "invite:regenerate":
      handleInviteRegenerate(ws, envelope.payload as InviteRegenerateCommand);
      break;
    default:
      send(ws, {
        type: "realm:error",
        id: uuid(),
        timestamp: Date.now(),
        payload: {
          code: "UNKNOWN_TYPE",
          message: `Unknown message type: ${envelope.type}`,
        },
      });
  }
}

function handleRealmJoin(ws: WebSocket, _payload: RealmJoinCommand): void {
  const conn = getConnection(ws);

  // Enforce member capacity limit
  if (config.maxMembers > 0) {
    const currentMembers = getAuthenticatedConnections().length;
    if (currentMembers >= config.maxMembers) {
      send(ws, {
        type: "realm:error",
        id: uuid(),
        timestamp: Date.now(),
        payload: { code: "CAPACITY_REACHED", message: "This realm has reached its maximum member capacity" },
      });
      return;
    }
  }

  const realm = getRealmInfo();
  const publicChannels = getChannels();
  const members = getAllProfiles();
  const onlineKeys = getAuthenticatedConnections().map((c) => c.publicKey!);
  const adminFlag = conn?.publicKey ? isAdmin(conn.publicKey) : false;
  const voiceParticipants = getAllVoiceParticipants();
  const screenSharers = getScreenShareChannels();

  // Include this user's DM channels
  const dmChannels = conn?.publicKey ? getDmChannelsForUser(conn.publicKey) : [];
  const channels = [...publicChannels, ...dmChannels];

  // Auto-join DM channels so messages route immediately
  if (conn) {
    for (const dm of dmChannels) {
      conn.joinedChannels.add(dm.id);
    }
  }

  const inviteLinks = getInviteLinks();

  send(ws, {
    type: "realm:welcome",
    id: uuid(),
    timestamp: Date.now(),
    payload: { realm, channels, members, onlineKeys, isAdmin: adminFlag, voiceParticipants, screenSharers, inviteLinks },
  });
}

function handleChannelJoin(ws: WebSocket, payload: ChannelJoinCommand): void {
  const conn = getConnection(ws);
  if (!conn) return;

  // If channel is a DM, verify the user is a participant
  const channel = getChannel(payload.channelId);
  if (channel?.type === "dm") {
    if (!channel.participants?.includes(conn.publicKey!)) {
      send(ws, {
        type: "realm:error",
        id: uuid(),
        timestamp: Date.now(),
        payload: { code: "FORBIDDEN", message: "You are not a participant of this DM" },
      });
      return;
    }
  }

  conn.joinedChannels.add(payload.channelId);
  const limit = 100;
  const messages = getChannelMessages(payload.channelId, limit);

  send(ws, {
    type: "channel:history",
    id: uuid(),
    timestamp: Date.now(),
    payload: { channelId: payload.channelId, messages, hasMore: messages.length >= limit },
  });
}

function handleChannelFetchHistory(ws: WebSocket, payload: ChannelFetchHistoryCommand): void {
  const conn = getConnection(ws);
  if (!conn) return;

  if (!conn.joinedChannels.has(payload.channelId)) {
    send(ws, {
      type: "realm:error",
      id: uuid(),
      timestamp: Date.now(),
      payload: { code: "NOT_JOINED", message: "Join the channel first" },
    });
    return;
  }

  const limit = 100;
  const messages = getChannelMessages(payload.channelId, limit, payload.before);

  send(ws, {
    type: "channel:history",
    id: uuid(),
    timestamp: Date.now(),
    payload: { channelId: payload.channelId, messages, hasMore: messages.length >= limit },
  });
}

function handleChannelMessage(ws: WebSocket, envelope: Envelope): void {
  const payload = envelope.payload as ChannelMessageCommand;
  const conn = getConnection(ws);
  if (!conn) return;

  // Enforce authenticated identity
  if (payload.publicKey !== conn.publicKey) {
    send(ws, {
      type: "realm:error",
      id: uuid(),
      timestamp: Date.now(),
      payload: { code: "IDENTITY_MISMATCH", message: "Message publicKey does not match authenticated identity" },
    });
    return;
  }

  const message: ChatMessage = {
    id: uuid(),
    channelId: payload.channelId,
    senderPublicKey: payload.publicKey,
    content: payload.encrypted,
    signature: payload.signature,
    nonce: payload.nonce,
    hasAttachment: false,
    createdAt: Date.now(),
  };

  saveMessage(message);

  // Update user profile cache from message (keeps profile in sync on every message)
  upsertProfile({
    publicKey: payload.publicKey,
    name: payload.profile.name,
    bio: payload.profile.bio,
    lastSeen: Date.now(),
  });

  broadcastToChannel(payload.channelId, {
    type: "channel:message",
    id: uuid(),
    timestamp: Date.now(),
    payload: { channelId: payload.channelId, message, profile: payload.profile },
  });
}

function handleTyping(ws: WebSocket, payload: ChannelTypingCommand): void {
  const conn = getConnection(ws);
  if (!conn) return;

  // Silent drop if publicKey doesn't match authenticated identity
  if (payload.publicKey !== conn.publicKey) return;

  broadcastToChannel(
    payload.channelId,
    {
      type: "channel:typing",
      id: uuid(),
      timestamp: Date.now(),
      payload: {
        channelId: payload.channelId,
        publicKey: payload.publicKey,
        name: conn.name ?? "Unknown",
      },
    },
    ws
  );
}

function handleUserProfile(ws: WebSocket, payload: UserProfileCommand): void {
  const conn = getConnection(ws);
  if (!conn) return;

  // Already authenticated — allow name/bio updates but reject publicKey changes
  if (conn.authenticated) {
    if (payload.publicKey !== conn.publicKey) {
      send(ws, {
        type: "realm:error",
        id: uuid(),
        timestamp: Date.now(),
        payload: { code: "IDENTITY_MISMATCH", message: "Cannot change identity after authentication" },
      });
      return;
    }

    conn.name = payload.name;
    const profile = {
      publicKey: payload.publicKey,
      name: payload.name,
      bio: payload.bio,
      lastSeen: Date.now(),
    };
    upsertProfile(profile);
    broadcastToAll(
      {
        type: "member:join",
        id: uuid(),
        timestamp: Date.now(),
        payload: { member: profile },
      },
      ws
    );
    return;
  }

  // Not yet authenticated — store claimed identity and issue challenge
  conn.publicKey = payload.publicKey;
  conn.name = payload.name;
  conn.bio = payload.bio;

  const nonce = toHex(randomBytes(32));
  conn.authNonce = nonce;

  send(ws, {
    type: "auth:challenge",
    id: uuid(),
    timestamp: Date.now(),
    payload: { nonce },
  });

  // Auth timeout: close connection if no valid response within 10 seconds
  conn.authTimeout = setTimeout(() => {
    if (!conn.authenticated) {
      send(ws, {
        type: "realm:error",
        id: uuid(),
        timestamp: Date.now(),
        payload: { code: "AUTH_TIMEOUT", message: "Authentication timed out" },
      });
      ws.close();
    }
  }, 10000);
}

function handleAuthResponse(ws: WebSocket, payload: AuthResponseCommand): void {
  const conn = getConnection(ws);
  if (!conn) return;

  if (!conn.publicKey || !conn.authNonce) {
    send(ws, {
      type: "realm:error",
      id: uuid(),
      timestamp: Date.now(),
      payload: { code: "AUTH_FAILED", message: "Send user:profile before auth:response" },
    });
    return;
  }

  // Reconstruct the challenge message and verify the signature
  const challengeMessage = `concord:auth:${conn.authNonce}:${conn.publicKey}`;

  let valid = false;
  try {
    valid = verify(challengeMessage, fromHex(payload.signature), fromBase58(conn.publicKey));
  } catch {
    valid = false;
  }

  if (!valid) {
    send(ws, {
      type: "realm:error",
      id: uuid(),
      timestamp: Date.now(),
      payload: { code: "AUTH_FAILED", message: "Invalid signature" },
    });
    // Clear identity state — client must reconnect
    conn.publicKey = undefined;
    conn.name = undefined;
    conn.authNonce = undefined;
    if (conn.authTimeout) {
      clearTimeout(conn.authTimeout);
      conn.authTimeout = undefined;
    }
    return;
  }

  // Authentication successful
  conn.authenticated = true;
  conn.authNonce = undefined;
  if (conn.authTimeout) {
    clearTimeout(conn.authTimeout);
    conn.authTimeout = undefined;
  }

  const profile = {
    publicKey: conn.publicKey,
    name: conn.name ?? "Unknown",
    bio: conn.bio,
    lastSeen: Date.now(),
  };
  upsertProfile(profile);

  send(ws, {
    type: "auth:verified",
    id: uuid(),
    timestamp: Date.now(),
    payload: {},
  });

  broadcastToAll(
    {
      type: "member:join",
      id: uuid(),
      timestamp: Date.now(),
      payload: { member: profile },
    },
    ws
  );
}

async function handleVoiceJoin(ws: WebSocket, payload: VoiceJoinCommand): Promise<void> {
  const conn = getConnection(ws);
  if (!conn?.publicKey) return;

  if (!isSfuReady()) {
    send(ws, {
      type: "realm:error",
      id: uuid(),
      timestamp: Date.now(),
      payload: { code: "VOICE_ERROR", message: "Voice is not available on this server (mediasoup not initialized)" },
    });
    return;
  }

  // Enforce voice participant limit
  if (config.maxVoiceParticipants > 0) {
    const room = getRoom(payload.channelId);
    const currentCount = room ? room.participants.size : 0;
    if (currentCount >= config.maxVoiceParticipants) {
      send(ws, {
        type: "realm:error",
        id: uuid(),
        timestamp: Date.now(),
        payload: { code: "VOICE_FULL", message: "This voice channel has reached its maximum participant capacity" },
      });
      return;
    }
  }

  try {
    const room = await getOrCreateRoom(payload.channelId);

    room.participants.set(conn.publicKey, {
      publicKey: conn.publicKey,
      name: conn.name ?? "Unknown",
      ws,
      producers: new Map(),
      consumers: new Map(),
    });

    conn.voiceChannelId = payload.channelId;

    send(ws, {
      type: "voice:joined",
      id: uuid(),
      timestamp: Date.now(),
      payload: {
        channelId: payload.channelId,
        rtpCapabilities: room.router.rtpCapabilities,
        iceServers: config.iceServers,
      },
    });

    // Send existing participants to the new joiner (late-joiner catch-up)
    for (const [pubKey, participant] of room.participants) {
      if (pubKey === conn.publicKey) continue;
      send(ws, {
        type: "voice:participant:joined",
        id: uuid(),
        timestamp: Date.now(),
        payload: {
          channelId: payload.channelId,
          publicKey: participant.publicKey,
          name: participant.name,
        },
      });
    }

    // Send existing producers to the new joiner
    const existingProducers = getOtherProducers(payload.channelId, conn.publicKey);
    for (const p of existingProducers) {
      send(ws, {
        type: "voice:new-producer",
        id: uuid(),
        timestamp: Date.now(),
        payload: {
          channelId: payload.channelId,
          producerId: p.producerId,
          producerPublicKey: p.producerPublicKey,
          kind: p.kind,
          producerKind: p.producerKind,
        },
      });
    }

    // Broadcast to ALL authenticated connections so sidebar can show who's in voice
    broadcastToAll(
      {
        type: "voice:participant:joined",
        id: uuid(),
        timestamp: Date.now(),
        payload: { channelId: payload.channelId, publicKey: conn.publicKey, name: conn.name ?? "Unknown" },
      },
      ws
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[voice] Failed to join voice channel:", msg);
    send(ws, {
      type: "realm:error",
      id: uuid(),
      timestamp: Date.now(),
      payload: { code: "VOICE_ERROR", message: `Failed to join voice channel: ${msg}` },
    });
  }
}

function handleVoiceLeave(ws: WebSocket, payload: VoiceLeaveCommand): void {
  const conn = getConnection(ws);
  if (!conn?.publicKey) return;

  // Collect producer info before removing participant
  const room = getRoom(payload.channelId);
  const producerInfos: { producerId: string; producerKind: "mic" | "webcam" | "screen" }[] = [];
  if (room) {
    const participant = room.participants.get(conn.publicKey);
    if (participant) {
      for (const [producerId, info] of participant.producers) {
        producerInfos.push({ producerId, producerKind: info.producerKind });
      }
    }
  }

  removeParticipant(payload.channelId, conn.publicKey);
  conn.voiceChannelId = undefined;

  // Broadcast producer closed events
  for (const pInfo of producerInfos) {
    broadcastToAll({
      type: "voice:producer-closed",
      id: uuid(),
      timestamp: Date.now(),
      payload: {
        channelId: payload.channelId,
        producerId: pInfo.producerId,
        producerPublicKey: conn.publicKey,
        producerKind: pInfo.producerKind,
      },
    });
  }

  broadcastToAll({
    type: "voice:participant:left",
    id: uuid(),
    timestamp: Date.now(),
    payload: { channelId: payload.channelId, publicKey: conn.publicKey },
  });
}

async function handleVoiceCreateTransport(
  ws: WebSocket,
  payload: VoiceCreateTransportCommand
): Promise<void> {
  const conn = getConnection(ws);
  if (!conn?.publicKey) return;

  try {
    const result = await createTransport(payload.channelId, conn.publicKey, payload.direction);
    send(ws, {
      type: "voice:transport-created",
      id: uuid(),
      timestamp: Date.now(),
      payload: {
        channelId: payload.channelId,
        direction: payload.direction,
        transportId: result.id,
        iceParameters: result.iceParameters,
        iceCandidates: result.iceCandidates,
        dtlsParameters: result.dtlsParameters,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    send(ws, {
      type: "realm:error",
      id: uuid(),
      timestamp: Date.now(),
      payload: { code: "VOICE_ERROR", message: `Failed to create transport: ${msg}` },
    });
  }
}

async function handleVoiceConnectTransport(
  ws: WebSocket,
  payload: VoiceConnectTransportCommand
): Promise<void> {
  const conn = getConnection(ws);
  if (!conn?.publicKey) return;

  try {
    await connectTransport(
      payload.channelId,
      conn.publicKey,
      payload.transportId,
      payload.dtlsParameters as any
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    send(ws, {
      type: "realm:error",
      id: uuid(),
      timestamp: Date.now(),
      payload: { code: "VOICE_ERROR", message: `Failed to connect transport: ${msg}` },
    });
  }
}

async function handleVoiceProduce(ws: WebSocket, payload: VoiceProduceCommand): Promise<void> {
  const conn = getConnection(ws);
  if (!conn?.publicKey) return;

  try {
    const producerId = await createProducer(
      payload.channelId,
      conn.publicKey,
      payload.kind,
      payload.rtpParameters as any,
      payload.producerKind
    );

    console.log(`[voice] Producer created: ${producerId} (${payload.producerKind}) by ${conn.publicKey?.slice(0, 8)}`);

    // Send confirmation to the producer
    send(ws, {
      type: "voice:produced",
      id: uuid(),
      timestamp: Date.now(),
      payload: { producerId, producerKind: payload.producerKind },
    });

    // Broadcast new producer to all other connections
    broadcastToAll(
      {
        type: "voice:new-producer",
        id: uuid(),
        timestamp: Date.now(),
        payload: {
          channelId: payload.channelId,
          producerId,
          producerPublicKey: conn.publicKey,
          kind: payload.kind,
          producerKind: payload.producerKind,
        },
      },
      ws
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    send(ws, {
      type: "realm:error",
      id: uuid(),
      timestamp: Date.now(),
      payload: { code: "VOICE_ERROR", message: `Failed to produce: ${msg}` },
    });
  }
}

async function handleVoiceConsume(ws: WebSocket, payload: VoiceConsumeCommand): Promise<void> {
  const conn = getConnection(ws);
  if (!conn?.publicKey) return;

  console.log(`[voice] Consume request from ${conn.publicKey.slice(0, 8)} for producer ${payload.producerId}`);

  try {
    const result = await createConsumer(payload.channelId, conn.publicKey, payload.producerId);
    if (!result) {
      send(ws, {
        type: "realm:error",
        id: uuid(),
        timestamp: Date.now(),
        payload: { code: "VOICE_ERROR", message: "Cannot consume producer" },
      });
      return;
    }

    send(ws, {
      type: "voice:consumed",
      id: uuid(),
      timestamp: Date.now(),
      payload: {
        consumerId: result.consumerId,
        producerId: result.producerId,
        kind: result.kind,
        rtpParameters: result.rtpParameters,
        producerKind: result.producerKind,
        producerPublicKey: result.producerPublicKey,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    send(ws, {
      type: "realm:error",
      id: uuid(),
      timestamp: Date.now(),
      payload: { code: "VOICE_ERROR", message: `Failed to consume: ${msg}` },
    });
  }
}

function handleVoiceCloseProducer(ws: WebSocket, payload: VoiceCloseProducerCommand): void {
  const conn = getConnection(ws);
  if (!conn?.publicKey) return;

  const info = closeProducer(payload.channelId, conn.publicKey, payload.producerId);
  if (!info) return;

  broadcastToAll({
    type: "voice:producer-closed",
    id: uuid(),
    timestamp: Date.now(),
    payload: {
      channelId: payload.channelId,
      producerId: payload.producerId,
      producerPublicKey: conn.publicKey,
      producerKind: info.producerKind,
    },
  });
}

function handleDmOpen(ws: WebSocket, payload: DmOpenCommand): void {
  const conn = getConnection(ws);
  if (!conn?.publicKey) return;

  // Check if DMs are enabled
  const realm = getRealmInfo();
  if (!realm.allowDirectMessages) {
    send(ws, {
      type: "realm:error",
      id: uuid(),
      timestamp: Date.now(),
      payload: { code: "DM_DISABLED", message: "Direct messages are not enabled on this realm" },
    });
    return;
  }

  // Cannot DM yourself
  if (payload.targetPublicKey === conn.publicKey) {
    send(ws, {
      type: "realm:error",
      id: uuid(),
      timestamp: Date.now(),
      payload: { code: "INVALID_TARGET", message: "Cannot open a DM with yourself" },
    });
    return;
  }

  const channel = findOrCreateDmChannel(conn.publicKey, payload.targetPublicKey);

  // Auto-join both participants
  conn.joinedChannels.add(channel.id);

  // Send dm:opened to the requester
  send(ws, {
    type: "dm:opened",
    id: uuid(),
    timestamp: Date.now(),
    payload: { channel },
  });

  // Send dm:opened to the target if they're online
  const targetConn = getConnectionByPublicKey(payload.targetPublicKey);
  if (targetConn) {
    targetConn.joinedChannels.add(channel.id);
    send(targetConn.ws, {
      type: "dm:opened",
      id: uuid(),
      timestamp: Date.now(),
      payload: { channel },
    });
  }
}

function handleRealmUpdate(ws: WebSocket, payload: RealmUpdateCommand): void {
  const conn = getConnection(ws);
  if (!conn?.publicKey || !isAdmin(conn.publicKey)) {
    send(ws, {
      type: "realm:error",
      id: uuid(),
      timestamp: Date.now(),
      payload: { code: "FORBIDDEN", message: "Only admins can update realm settings" },
    });
    return;
  }

  const updated = updateRealm({
    name: payload.name?.trim() || undefined,
    description: payload.description?.trim(),
    allowDirectMessages: payload.allowDirectMessages,
    retentionDays: payload.retentionDays,
    fileRetentionDays: payload.fileRetentionDays,
  });

  broadcastToAll({
    type: "realm:update",
    id: uuid(),
    timestamp: Date.now(),
    payload: {
      name: updated.name,
      description: updated.description,
      allowDirectMessages: updated.allowDirectMessages,
      retentionDays: updated.retentionDays ?? null,
      fileRetentionDays: updated.fileRetentionDays ?? null,
    },
  });
}

function handleChannelCreate(ws: WebSocket, payload: ChannelCreateCommand): void {
  const conn = getConnection(ws);
  if (!conn?.publicKey || !isAdmin(conn.publicKey)) {
    send(ws, {
      type: "realm:error",
      id: uuid(),
      timestamp: Date.now(),
      payload: { code: "FORBIDDEN", message: "Only admins can create channels" },
    });
    return;
  }

  const channel = createChannel(
    payload.name,
    payload.type,
    payload.encrypted,
    payload.passwordVerify,
    payload.passwordVerifyNonce
  );

  broadcastToAll({
    type: "channel:create",
    id: uuid(),
    timestamp: Date.now(),
    payload: { channel },
  });
}

function handleChannelDelete(ws: WebSocket, payload: ChannelDeleteCommand): void {
  const conn = getConnection(ws);
  if (!conn?.publicKey || !isAdmin(conn.publicKey)) {
    send(ws, {
      type: "realm:error",
      id: uuid(),
      timestamp: Date.now(),
      payload: { code: "FORBIDDEN", message: "Only admins can delete channels" },
    });
    return;
  }

  const deleted = deleteChannel(payload.channelId);
  if (!deleted) {
    send(ws, {
      type: "realm:error",
      id: uuid(),
      timestamp: Date.now(),
      payload: { code: "NOT_FOUND", message: "Channel not found" },
    });
    return;
  }

  broadcastToAll({
    type: "channel:delete",
    id: uuid(),
    timestamp: Date.now(),
    payload: { channelId: payload.channelId },
  });
}

function handleRealmSetPasswordVerify(ws: WebSocket, payload: RealmSetPasswordVerifyCommand): void {
  const conn = getConnection(ws);
  if (!conn?.publicKey || !isAdmin(conn.publicKey)) {
    send(ws, {
      type: "realm:error",
      id: uuid(),
      timestamp: Date.now(),
      payload: { code: "FORBIDDEN", message: "Only admins can set realm password" },
    });
    return;
  }

  setRealmPasswordVerify(payload.passwordVerify, payload.passwordVerifyNonce);

  // Broadcast updated realm info so all clients receive the new verify blob
  const realm = getRealmInfo();
  broadcastToAll({
    type: "realm:update",
    id: uuid(),
    timestamp: Date.now(),
    payload: {
      name: realm.name,
      description: realm.description,
      allowDirectMessages: realm.allowDirectMessages,
      passwordVerify: realm.passwordVerify,
      passwordVerifyNonce: realm.passwordVerifyNonce,
    },
  });
}

function handleChannelSetPasswordVerify(ws: WebSocket, payload: ChannelSetPasswordVerifyCommand): void {
  const conn = getConnection(ws);
  if (!conn?.publicKey || !isAdmin(conn.publicKey)) {
    send(ws, {
      type: "realm:error",
      id: uuid(),
      timestamp: Date.now(),
      payload: { code: "FORBIDDEN", message: "Only admins can set channel password" },
    });
    return;
  }

  const channel = getChannel(payload.channelId);
  if (!channel) {
    send(ws, {
      type: "realm:error",
      id: uuid(),
      timestamp: Date.now(),
      payload: { code: "NOT_FOUND", message: "Channel not found" },
    });
    return;
  }

  setChannelPasswordVerify(payload.channelId, payload.passwordVerify, payload.passwordVerifyNonce);
}

function handleInviteRegenerate(ws: WebSocket, payload: InviteRegenerateCommand): void {
  const conn = getConnection(ws);
  if (!conn?.publicKey || !isAdmin(conn.publicKey)) {
    send(ws, {
      type: "realm:error",
      id: uuid(),
      timestamp: Date.now(),
      payload: { code: "FORBIDDEN", message: "Only admins can regenerate invite links" },
    });
    return;
  }

  const newInvite = regenerateInvite(payload.inviteId);
  if (!newInvite) {
    send(ws, {
      type: "realm:error",
      id: uuid(),
      timestamp: Date.now(),
      payload: { code: "NOT_FOUND", message: "Invite link not found" },
    });
    return;
  }

  const inviteLinks = getInviteLinks();
  broadcastToAll({
    type: "invite:regenerated",
    id: uuid(),
    timestamp: Date.now(),
    payload: { inviteLinks },
  });
}
