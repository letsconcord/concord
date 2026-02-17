import { encode, decode, toHex, fromHex } from "./utils.js";

/** Sentinel string used for zero-knowledge password verification */
const VERIFY_SENTINEL = "CONCORD_VERIFY";

/** Cast to ArrayBuffer for Web Crypto API compatibility with strict TS */
function asBuffer(bytes: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  return ab;
}

/**
 * Encrypt plaintext using AES-256-GCM with the Web Crypto API.
 * Returns { ciphertext, nonce } both as hex strings.
 */
export async function encrypt(
  plaintext: string,
  keyBytes: Uint8Array
): Promise<{ ciphertext: string; nonce: string }> {
  const key = await crypto.subtle.importKey(
    "raw",
    asBuffer(keyBytes),
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: asBuffer(nonce) },
    key,
    asBuffer(encode(plaintext))
  );

  return {
    ciphertext: toHex(new Uint8Array(encrypted)),
    nonce: toHex(nonce),
  };
}

/**
 * Decrypt ciphertext using AES-256-GCM with the Web Crypto API.
 * Takes hex-encoded ciphertext and nonce, returns plaintext string.
 */
export async function decrypt(
  ciphertextHex: string,
  nonceHex: string,
  keyBytes: Uint8Array
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    asBuffer(keyBytes),
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: asBuffer(fromHex(nonceHex)) },
    key,
    asBuffer(fromHex(ciphertextHex))
  );

  return decode(new Uint8Array(decrypted));
}

/**
 * Encrypt raw bytes with AES-256-GCM.
 * Returns packed [12-byte nonce][ciphertext + auth tag].
 */
export async function encryptBytes(
  data: Uint8Array,
  keyBytes: Uint8Array
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    asBuffer(keyBytes),
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: asBuffer(nonce) },
    key,
    asBuffer(data)
  );

  const result = new Uint8Array(12 + encrypted.byteLength);
  result.set(nonce, 0);
  result.set(new Uint8Array(encrypted), 12);
  return result;
}

/**
 * Decrypt packed [12-byte nonce][ciphertext + auth tag] with AES-256-GCM.
 * Returns plaintext bytes.
 */
export async function decryptBytes(
  packed: Uint8Array,
  keyBytes: Uint8Array
): Promise<Uint8Array> {
  const nonce = packed.slice(0, 12);
  const ciphertext = packed.slice(12);
  const key = await crypto.subtle.importKey(
    "raw",
    asBuffer(keyBytes),
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: asBuffer(nonce) },
    key,
    asBuffer(ciphertext)
  );

  return new Uint8Array(decrypted);
}

/**
 * Create an encrypted verification blob from a password-derived key.
 * Encrypts the sentinel string — the result can be stored on the server
 * and used by clients to verify they have the correct password without
 * revealing it.
 */
export async function createVerifyBlob(
  keyBytes: Uint8Array
): Promise<{ ciphertext: string; nonce: string }> {
  return encrypt(VERIFY_SENTINEL, keyBytes);
}

/**
 * Check if a password-derived key can decrypt the verification blob.
 * Returns true if the key is correct, false otherwise.
 */
export async function checkVerifyBlob(
  ciphertext: string,
  nonce: string,
  keyBytes: Uint8Array
): Promise<boolean> {
  try {
    const result = await decrypt(ciphertext, nonce, keyBytes);
    return result === VERIFY_SENTINEL;
  } catch {
    return false;
  }
}
