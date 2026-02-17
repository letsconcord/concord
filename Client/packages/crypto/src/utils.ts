import bs58 from "bs58";

/** Encode bytes to base58 string */
export function toBase58(bytes: Uint8Array): string {
  return bs58.encode(bytes);
}

/** Decode base58 string to bytes */
export function fromBase58(str: string): Uint8Array {
  return bs58.decode(str);
}

/** Encode bytes to hex string */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Decode hex string to bytes */
export function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/** Encode string to UTF-8 bytes */
export function encode(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/** Decode UTF-8 bytes to string */
export function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}
