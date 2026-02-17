/** User identity derived from Ed25519 public key */
export interface UserProfile {
  publicKey: string;
  name: string;
  bio?: string;
  lastSeen?: number;
}
