import type { ChatMessage, MessageProfile } from "./messages.js";
import type { Channel } from "./channel.js";
import type { RealmWelcome } from "./realm.js";
import type { UserProfile, Role } from "./user.js";

/** Server → Client events */

export interface RealmWelcomeEvent extends RealmWelcome {}

export interface RealmErrorEvent {
  code: string;
  message: string;
}

export interface ChannelHistoryEvent {
  channelId: string;
  messages: ChatMessage[];
  hasMore?: boolean;
}

export interface ChannelMessageEvent {
  channelId: string;
  message: ChatMessage;
  profile: MessageProfile;
}

export interface ChannelTypingEvent {
  channelId: string;
  publicKey: string;
  name: string;
}

export interface MemberJoinEvent {
  member: UserProfile;
}

export interface MemberLeaveEvent {
  publicKey: string;
  removed?: boolean;
}

export interface RealmUpdateEvent {
  name: string;
  description?: string;
  allowDirectMessages?: boolean;
  retentionDays?: number | null;
  fileRetentionDays?: number | null;
  thumbnailFileId?: string | null;
}

export interface DmOpenedEvent {
  channel: Channel;
}

export interface ChannelCreateEvent {
  channel: Channel;
}

export interface ChannelDeleteEvent {
  channelId: string;
}

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface VoiceJoinedEvent {
  channelId: string;
  rtpCapabilities: unknown;
  iceServers?: IceServer[];
}

export interface VoiceProducedEvent {
  producerId: string;
  producerKind: "mic" | "webcam" | "screen";
}

export interface VoiceConsumedEvent {
  consumerId: string;
  producerId: string;
  kind: "audio" | "video";
  rtpParameters: unknown;
  producerKind: "mic" | "webcam" | "screen";
  producerPublicKey: string;
}

export interface VoiceTransportCreatedEvent {
  channelId: string;
  direction: "send" | "recv";
  transportId: string;
  iceParameters: unknown;
  iceCandidates: unknown;
  dtlsParameters: unknown;
}

export interface VoiceNewProducerEvent {
  channelId: string;
  producerId: string;
  producerPublicKey: string;
  kind: "audio" | "video";
  producerKind: "mic" | "webcam" | "screen";
}

export interface VoiceProducerClosedEvent {
  channelId: string;
  producerId: string;
  producerPublicKey: string;
  producerKind: "mic" | "webcam" | "screen";
}

export interface VoiceParticipantJoinedEvent {
  channelId: string;
  publicKey: string;
  name: string;
}

export interface VoiceParticipantLeftEvent {
  channelId: string;
  publicKey: string;
}

export interface AuthChallengeEvent {
  nonce: string; // hex-encoded 32 random bytes
}

export interface AuthVerifiedEvent {}

export interface InviteRegeneratedEvent {
  inviteLinks: { id: string; key: string; createdAt: number }[];
}

// ── Member moderation events ──

export interface MemberKickedEvent {
  publicKey: string;
}

export interface MemberBannedEvent {
  publicKey: string;
}

// ── Role events ──

export interface RoleCreateEvent {
  role: Role;
}

export interface RoleUpdateEvent {
  role: Role;
}

export interface RoleDeleteEvent {
  roleId: string;
}

export interface RoleAssignEvent {
  publicKey: string;
  roleId: string | null;
}

export interface RolesReorderedEvent {
  roles: Role[];
}

/** Union of all event types for the type field */
export type EventType =
  | "realm:welcome"
  | "realm:error"
  | "realm:update"
  | "auth:challenge"
  | "auth:verified"
  | "channel:history"
  | "channel:message"
  | "channel:typing"
  | "member:join"
  | "member:leave"
  | "channel:create"
  | "channel:delete"
  | "dm:opened"
  | "voice:joined"
  | "voice:produced"
  | "voice:consumed"
  | "voice:participant:joined"
  | "voice:participant:left"
  | "voice:transport-created"
  | "voice:new-producer"
  | "voice:producer-closed"
  | "invite:regenerated"
  | "member:kicked"
  | "member:banned"
  | "role:create"
  | "role:update"
  | "role:delete"
  | "role:assign"
  | "roles:reordered";
