import { argon2id } from "hash-wasm";
import { encode } from "./utils.js";

/**
 * Derive a 256-bit encryption key from a password using Argon2id.
 * The salt should be unique per context (e.g. realmId or channelId).
 */
export async function deriveKey(
  password: string,
  salt: string
): Promise<Uint8Array> {
  const hash = await argon2id({
    password: encode(password),
    salt: encode(salt),
    parallelism: 1,
    iterations: 3,
    memorySize: 65536, // 64 MB
    hashLength: 32,
    outputType: "binary",
  });
  return hash;
}
