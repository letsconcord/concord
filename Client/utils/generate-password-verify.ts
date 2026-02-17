/**
 * Generate REALM_PASSWORD_VERIFY and REALM_PASSWORD_VERIFY_NONCE
 * for initializing a password-protected realm server.
 *
 * Usage:
 *   npx tsx utils/generate-password-verify.ts <password>
 */

import { deriveKey } from "../packages/crypto/src/password.js";
import { createVerifyBlob } from "../packages/crypto/src/encryption.js";

const VERIFY_SALT = "concord:verify";

async function main() {
  const password = process.argv[2];
  if (!password) {
    console.error("Usage: npx tsx utils/generate-password-verify.ts <password>");
    process.exit(1);
  }

  const key = await deriveKey(password, VERIFY_SALT);
  const { ciphertext, nonce } = await createVerifyBlob(key);

  console.log(`REALM_PASSWORD_VERIFY=${ciphertext}`);
  console.log(`REALM_PASSWORD_VERIFY_NONCE=${nonce}`);
}

main();
