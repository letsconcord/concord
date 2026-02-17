import type { Channel } from "./channel.js";
import type { UserProfile } from "./user.js";

export interface RealmInfo {
  id: string;
  name: string;
  description?: string;
  encrypted: boolean;
  retentionDays?: number;
  fileRetentionDays?: number;
  allowDirectMessages?: boolean;
  passwordVerify?: string;
  passwordVerifyNonce?: string;
  createdAt: number;
}

export interface RealmWelcome {
  realm: RealmInfo;
  channels: Channel[];
  members: UserProfile[];
  onlineKeys: string[];
  isAdmin: boolean;
  voiceParticipants?: Record<string, { publicKey: string; name: string }[]>;
  screenSharers?: Record<string, string[]>;
}
