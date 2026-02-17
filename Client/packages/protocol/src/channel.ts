export type ChannelType = "text" | "voice" | "dm";

export interface Channel {
  id: string;
  name: string;
  type: ChannelType;
  encrypted: boolean;
  position: number;
  passwordVerify?: string;
  passwordVerifyNonce?: string;
  createdAt: number;
  participants?: string[]; // [publicKeyA, publicKeyB] sorted — DM only
}
