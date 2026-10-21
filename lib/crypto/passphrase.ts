const PBKDF2_ITERATIONS = 310_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function generateSalt(): string {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  return bufferToBase64(salt.buffer);
}

async function importPassphraseKey(passphrase: string): Promise<CryptoKey> {
  const encoded = new TextEncoder().encode(passphrase);
  return crypto.subtle.importKey('raw', encoded, 'PBKDF2', false, [
    'deriveKey',
  ]);
}

export async function deriveVaultKey(
  passphrase: string,
  saltBase64: string,
): Promise<CryptoKey> {
  const baseKey = await importPassphraseKey(passphrase);
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: base64ToBuffer(saltBase64),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    true, // extractable: needed to keep unlock across MV3 SW restarts (session)
    ['encrypt', 'decrypt'],
  );
}

export interface EncryptedBlob {
  iv: string;
  ciphertext: string;
}

export async function encryptString(
  key: CryptoKey,
  plaintext: string,
): Promise<EncryptedBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded,
  );
  return {
    iv: bufferToBase64(iv.buffer),
    ciphertext: bufferToBase64(ciphertext),
  };
}

export async function decryptString(
  key: CryptoKey,
  blob: EncryptedBlob,
): Promise<string> {
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBuffer(blob.iv) },
    key,
    base64ToBuffer(blob.ciphertext),
  );
  return new TextDecoder().decode(decrypted);
}
