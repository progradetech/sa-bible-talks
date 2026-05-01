import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const NONCE_LEN = 12;
const AUTH_TAG_LEN = 16;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const b64 = process.env.PII_MASTER_KEY;
  if (!b64) {
    throw new Error('PII_MASTER_KEY is not set');
  }
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) {
    throw new Error(
      'PII_MASTER_KEY must decode to 32 bytes — generate with `openssl rand -base64 32`',
    );
  }
  cachedKey = key;
  return key;
}

// AAD binds ciphertext to a specific row id, preventing row-confusion attacks
// where an attacker swaps ciphertexts between rows. Decryption with a
// different rowId fails authentication.
function aad(rowId: string): Buffer {
  return Buffer.from(rowId, 'utf8');
}

export async function encryptField(plaintext: string, rowId: string): Promise<Buffer> {
  const nonce = randomBytes(NONCE_LEN);
  const cipher = createCipheriv(ALGO, getKey(), nonce);
  cipher.setAAD(aad(rowId));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([nonce, authTag, ciphertext]);
}

export async function decryptField(packed: Buffer, rowId: string): Promise<string> {
  if (packed.length < NONCE_LEN + AUTH_TAG_LEN) {
    throw new Error('ciphertext too short');
  }
  const nonce = packed.subarray(0, NONCE_LEN);
  const authTag = packed.subarray(NONCE_LEN, NONCE_LEN + AUTH_TAG_LEN);
  const ciphertext = packed.subarray(NONCE_LEN + AUTH_TAG_LEN);

  const decipher = createDecipheriv(ALGO, getKey(), nonce);
  decipher.setAAD(aad(rowId));
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export function getKeyVersion(): string {
  return 'v1';
}
