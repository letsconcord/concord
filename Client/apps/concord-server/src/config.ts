import os from "node:os";

/** Detect the first non-internal IPv4 address for mediasoup ICE candidates */
function detectLocalIp(): string {
  const interfaces = os.networkInterfaces();
  for (const addrs of Object.values(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === "IPv4" && !addr.internal) {
        return addr.address;
      }
    }
  }
  return "127.0.0.1";
}

function buildIceServers(): IceServerConfig[] {
  const servers: IceServerConfig[] = [];

  const stunRaw = process.env.STUN_SERVERS;
  // Default to Google's public STUN server; set STUN_SERVERS="" to disable
  const stunUrls =
    stunRaw === undefined
      ? ["stun:stun.l.google.com:19302"]
      : stunRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

  if (stunUrls.length > 0) {
    servers.push({ urls: stunUrls });
  }

  const turnRaw = process.env.TURN_SERVERS;
  if (turnRaw) {
    const turnUrls = turnRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (turnUrls.length > 0) {
      servers.push({
        urls: turnUrls,
        username: process.env.TURN_USERNAME,
        credential: process.env.TURN_CREDENTIAL,
      });
    }
  }

  return servers;
}

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface S3Config {
  bucket: string;
  endpoint: string;
  region: string;
  accessKey: string;
  secretKey: string;
}

export interface ServerConfig {
  port: number;
  host: string;
  realmName: string;
  realmDescription: string;
  encrypted: boolean;
  retentionDays: number | null;
  fileRetentionDays: number | null;
  allowDirectMessages: boolean;
  dataDir: string;
  maxFileSize: number;
  admins: string[];
  /** Pre-computed password verification blob (hex ciphertext of encrypted sentinel) */
  passwordVerify: string | null;
  /** Nonce for the password verification blob */
  passwordVerifyNonce: string | null;
  mediasoupListenIp: string;
  mediasoupAnnouncedIp: string | undefined;
  iceServers: IceServerConfig[];
  maxMembers: number;
  maxStorageBytes: number;
  maxVoiceParticipants: number;
  s3: S3Config | null;
}

const config: ServerConfig = {
  port: parseInt(process.env.PORT ?? "9000", 10),
  host: process.env.HOST ?? "0.0.0.0",
  realmName: process.env.REALM_NAME ?? "My Realm",
  realmDescription: process.env.REALM_DESCRIPTION ?? "A Concord server",
  encrypted: !!process.env.REALM_PASSWORD_VERIFY,
  retentionDays: process.env.RETENTION_DAYS
    ? parseInt(process.env.RETENTION_DAYS, 10)
    : null,
  fileRetentionDays: process.env.FILE_RETENTION_DAYS
    ? parseInt(process.env.FILE_RETENTION_DAYS, 10)
    : null,
  allowDirectMessages: process.env.ALLOW_DM === "true",
  dataDir: process.env.DATA_DIR ?? "./data",
  maxFileSize: parseInt(
    process.env.MAX_FILE_SIZE ?? String(50 * 1024 * 1024),
    10
  ),
  admins: process.env.REALM_ADMINS
    ?.split(";")
    .map((s) => s.trim())
    .filter(Boolean) ?? [],
  passwordVerify: process.env.REALM_PASSWORD_VERIFY?.trim() || null,
  passwordVerifyNonce: process.env.REALM_PASSWORD_VERIFY_NONCE?.trim() || null,
  mediasoupListenIp: process.env.MEDIASOUP_LISTEN_IP ?? "0.0.0.0",
  mediasoupAnnouncedIp: process.env.MEDIASOUP_ANNOUNCED_IP || detectLocalIp(),
  iceServers: buildIceServers(),
  maxMembers: parseInt(process.env.MAX_MEMBERS ?? "0", 10),
  maxStorageBytes: parseInt(process.env.MAX_STORAGE_BYTES ?? "0", 10),
  maxVoiceParticipants: parseInt(process.env.MAX_VOICE_PARTICIPANTS ?? "0", 10),
  s3: process.env.S3_BUCKET
    ? {
        bucket: process.env.S3_BUCKET,
        endpoint: process.env.S3_ENDPOINT ?? "",
        region: process.env.S3_REGION ?? "auto",
        accessKey: process.env.S3_ACCESS_KEY ?? "",
        secretKey: process.env.S3_SECRET_KEY ?? "",
      }
    : null,
};

/** Check if an IP is a private/local address (unreachable from other networks) */
export function isPrivateIp(ip: string | undefined): boolean {
  if (!ip) return true;
  return (
    ip.startsWith("10.") ||
    ip.startsWith("172.16.") || ip.startsWith("172.17.") || ip.startsWith("172.18.") ||
    ip.startsWith("172.19.") || ip.startsWith("172.2") || ip.startsWith("172.3") ||
    ip.startsWith("192.168.") ||
    ip === "127.0.0.1" ||
    ip === "localhost"
  );
}

export function isAdmin(publicKey: string): boolean {
  return config.admins.includes(publicKey);
}

export default config;
