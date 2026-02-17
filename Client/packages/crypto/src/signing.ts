import nacl from "tweetnacl";
import { encode } from "./utils.js";

/**
 * Sign a message with an Ed25519 secret key.
 * Returns the detached signature as Uint8Array.
 */
export function sign(message: string | Uint8Array, secretKey: Uint8Array): Uint8Array {
  const data = typeof message === "string" ? encode(message) : message;
  return nacl.sign.detached(data, secretKey);
}

/**
 * Verify a detached Ed25519 signature.
 */
export function verify(
  message: string | Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array
): boolean {
  const data = typeof message === "string" ? encode(message) : message;
  return nacl.sign.detached.verify(data, signature, publicKey);
}
