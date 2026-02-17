import type { MessageProfile } from "./messages.js";

/** Client → Server commands */

export interface RealmJoinCommand {}

export interface ChannelJoinCommand {
  channelId: string;
}

export interface ChannelMessageCommand {
  channelId: string;
  encrypted: string;
  signature: string;
  nonce: string;
  publicKey: string;
  profile: MessageProfile;
}

export interface ChannelTypingCommand {
  channelId: string;
  publicKey: string;
}

export interface ChannelFileCommand {
  channelId: string;
  fileId: string;
  metadata: {
    filename: string;
    mimeType: string;
    size: number;
  };
}

export interface UserProfileCommand {
  publicKey: string;
  name: string;
  bio?: string;
}

export interface VoiceJoinCommand {
  channelId: string;
}

export interface VoiceLeaveCommand {
  channelId: string;
}

export interface VoiceProduceCommand {
  channelId: string;
  kind: "audio" | "video";
  rtpParameters: unknown;
  producerKind: "mic" | "webcam" | "screen";
}

export interface VoiceConsumeCommand {
  channelId: string;
  producerId: string;
}

export interface VoiceCreateTransportCommand {
  channelId: string;
  direction: "send" | "recv";
}

export interface VoiceConnectTransportCommand {
  channelId: string;
  transportId: string;
  dtlsParameters: unknown;
}

export interface VoiceCloseProducerCommand {
  channelId: string;
  producerId: string;
}

export interface ChannelCreateCommand {
  name: string;
  type: "text" | "voice";
  encrypted?: boolean;
  passwordVerify?: string;
  passwordVerifyNonce?: string;
}

export interface ChannelDeleteCommand {
  channelId: string;
}

export interface RealmUpdateCommand {
  name?: string;
  description?: string;
  allowDirectMessages?: boolean;
  retentionDays?: number | null;
  fileRetentionDays?: number | null;
}

export interface DmOpenCommand {
  targetPublicKey: string;
}

export interface AuthResponseCommand {
  signature: string; // hex-encoded Ed25519 detached signature
}

export interface ChannelFetchHistoryCommand {
  channelId: string;
  before: number; // Unix ms timestamp — fetch messages older than this
}

export interface RealmSetPasswordVerifyCommand {
  passwordVerify: string;
  passwordVerifyNonce: string;
}

export interface ChannelSetPasswordVerifyCommand {
  channelId: string;
  passwordVerify: string;
  passwordVerifyNonce: string;
}

/** Union of all command types for the type field */
export type CommandType =
  | "realm:join"
  | "realm:leave"
  | "realm:update"
  | "realm:set-password-verify"
  | "channel:join"
  | "channel:message"
  | "channel:typing"
  | "channel:file"
  | "channel:create"
  | "channel:delete"
  | "channel:fetch-history"
  | "channel:set-password-verify"
  | "dm:open"
  | "user:profile"
  | "auth:response"
  | "voice:join"
  | "voice:leave"
  | "voice:produce"
  | "voice:consume"
  | "voice:create-transport"
  | "voice:connect-transport"
  | "voice:close-producer";
