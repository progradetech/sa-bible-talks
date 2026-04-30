import { createServiceRoleClient } from './supabase/server';

const KEY_ID = process.env.PGSODIUM_KEY_ID;

if (!KEY_ID && process.env.NODE_ENV === 'production') {
  throw new Error('PGSODIUM_KEY_ID is required in production');
}

// AAD (additional authenticated data) binds the ciphertext to a specific row.
// Decryption with a different talkId fails authentication, preventing
// row-confusion attacks where an attacker swaps ciphertexts between rows.
function aad(talkId: string): string {
  return talkId;
}

export async function encryptField(plaintext: string, talkId: string): Promise<Buffer> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc('encrypt_pii', {
    plaintext,
    aad: aad(talkId),
    key_id: KEY_ID,
  });

  if (error) throw new Error(`encryption failed: ${error.message}`);
  return Buffer.from(data as string, 'base64');
}

export async function decryptField(ciphertext: Buffer, talkId: string): Promise<string> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc('decrypt_pii', {
    ciphertext: ciphertext.toString('base64'),
    aad: aad(talkId),
    key_id: KEY_ID,
  });

  if (error) throw new Error(`decryption failed: ${error.message}`);
  return data as string;
}

export function getKeyId(): string {
  if (!KEY_ID) throw new Error('PGSODIUM_KEY_ID is not set');
  return KEY_ID;
}
