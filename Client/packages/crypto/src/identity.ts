import { generateMnemonic as genMnemonic, validateMnemonic as valMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import nacl from "tweetnacl";
import { toBase58 } from "./utils.js";

export interface Identity {
  mnemonic: string;
  publicKey: Uint8Array;
  secretKey: Uint8Array;
  publicKeyBase58: string;
}

/** Generate a new 24-word BIP39 mnemonic */
export function generateMnemonic(): string {
  return genMnemonic(wordlist, 256);
}

/** Validate a BIP39 mnemonic */
export function validateMnemonic(mnemonic: string): boolean {
  return valMnemonic(mnemonic, wordlist);
}

/**
 * Derive an Ed25519 keypair from a BIP39 mnemonic.
 * Uses the 64-byte seed from BIP39, takes the first 32 bytes for Ed25519.
 */
export function identityFromMnemonic(mnemonic: string): Identity {
  if (!validateMnemonic(mnemonic)) {
    throw new Error("Invalid mnemonic phrase");
  }

  const seed = mnemonicToSeedSync(mnemonic);
  // Ed25519 needs 32-byte seed — use first 32 bytes of the 64-byte BIP39 seed
  const ed25519Seed = seed.slice(0, 32);
  const keypair = nacl.sign.keyPair.fromSeed(new Uint8Array(ed25519Seed));

  return {
    mnemonic,
    publicKey: keypair.publicKey,
    secretKey: keypair.secretKey,
    publicKeyBase58: toBase58(keypair.publicKey),
  };
}

/** Reconstruct public key base58 from raw bytes */
export function publicKeyToBase58(publicKey: Uint8Array): string {
  return toBase58(publicKey);
}
