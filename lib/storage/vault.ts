import {
  decryptString,
  deriveVaultKey,
  encryptString,
  generateSalt,
  type EncryptedBlob,
} from '../crypto/passphrase';
import { type ProviderId, PROVIDERS } from '../providers/types';

const VAULT_STORAGE_KEY = 'sidechat_vault';
/** Sobrevive ao restart do service worker; limpa ao fechar o navegador. */
const VAULT_SESSION_KEY = 'sidechat_vault_session';

export type ProviderKeyMap = Partial<Record<ProviderId, string>>;

interface VaultStorage {
  salt: string;
  /** Encrypted JSON of ProviderKeyMap */
  keysBlob: EncryptedBlob | null;
  /** Verifier: encrypt known string to validate passphrase */
  verifier: EncryptedBlob | null;
}

interface VaultSession {
  rawKeyBase64: string;
  keys: ProviderKeyMap;
}

const VERIFIER_PLAINTEXT = 'sidechat-vault-ok';

const emptyVault = (): VaultStorage => ({
  salt: generateSalt(),
  keysBlob: null,
  verifier: null,
});

let memoryKey: CryptoKey | null = null;
let memoryKeys: ProviderKeyMap = {};
let hydratePromise: Promise<void> | null = null;

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

async function exportRawKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return bufferToBase64(raw);
}

async function importRawKey(rawBase64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    base64ToBuffer(rawBase64),
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

async function writeSession(keys: ProviderKeyMap, key: CryptoKey): Promise<void> {
  const session: VaultSession = {
    rawKeyBase64: await exportRawKey(key),
    keys,
  };
  await browser.storage.session.set({ [VAULT_SESSION_KEY]: session });
}

async function clearSession(): Promise<void> {
  await browser.storage.session.remove(VAULT_SESSION_KEY);
}

async function readSession(): Promise<VaultSession | null> {
  const result = await browser.storage.session.get(VAULT_SESSION_KEY);
  const stored = result[VAULT_SESSION_KEY] as VaultSession | undefined;
  if (!stored?.rawKeyBase64 || typeof stored.keys !== 'object') return null;
  return stored;
}

/** Restaura unlock após o service worker reiniciar. */
export async function hydrateVaultFromSession(): Promise<void> {
  if (memoryKey) return;
  if (hydratePromise) return hydratePromise;

  hydratePromise = (async () => {
    try {
      const session = await readSession();
      if (!session) return;
      memoryKey = await importRawKey(session.rawKeyBase64);
      memoryKeys = { ...session.keys };
    } catch {
      memoryKey = null;
      memoryKeys = {};
      await clearSession();
    } finally {
      hydratePromise = null;
    }
  })();

  return hydratePromise;
}

export function isVaultUnlocked(): boolean {
  return memoryKey !== null;
}

export async function lockVault(): Promise<void> {
  memoryKey = null;
  memoryKeys = {};
  await clearSession();
}

async function readVault(): Promise<VaultStorage> {
  const result = await browser.storage.local.get(VAULT_STORAGE_KEY);
  const stored = result[VAULT_STORAGE_KEY] as VaultStorage | undefined;
  if (!stored?.salt) return emptyVault();
  return stored;
}

async function writeVault(vault: VaultStorage): Promise<void> {
  await browser.storage.local.set({ [VAULT_STORAGE_KEY]: vault });
}

export async function vaultExists(): Promise<boolean> {
  const vault = await readVault();
  return vault.verifier !== null;
}

export async function setupVault(passphrase: string): Promise<void> {
  if (!passphrase || passphrase.length < 8) {
    throw new Error('A senha mestre deve ter pelo menos 8 caracteres.');
  }
  const vault = emptyVault();
  const key = await deriveVaultKey(passphrase, vault.salt);
  vault.verifier = await encryptString(key, VERIFIER_PLAINTEXT);
  vault.keysBlob = await encryptString(key, JSON.stringify({}));
  await writeVault(vault);
  memoryKey = key;
  memoryKeys = {};
  await writeSession(memoryKeys, key);
}

export async function unlockVault(passphrase: string): Promise<void> {
  const vault = await readVault();
  if (!vault.verifier) {
    throw new Error('Cofre ainda não configurado.');
  }
  const key = await deriveVaultKey(passphrase, vault.salt);
  try {
    const plain = await decryptString(key, vault.verifier);
    if (plain !== VERIFIER_PLAINTEXT) {
      throw new Error('Senha incorreta.');
    }
  } catch {
    throw new Error('Senha incorreta.');
  }
  memoryKey = key;
  if (vault.keysBlob) {
    const json = await decryptString(key, vault.keysBlob);
    memoryKeys = JSON.parse(json) as ProviderKeyMap;
  } else {
    memoryKeys = {};
  }
  await writeSession(memoryKeys, key);
}

async function persistKeys(): Promise<void> {
  if (!memoryKey) throw new Error('Cofre bloqueado.');
  const vault = await readVault();
  vault.keysBlob = await encryptString(
    memoryKey,
    JSON.stringify(memoryKeys),
  );
  await writeVault(vault);
  await writeSession(memoryKeys, memoryKey);
}

export async function setProviderApiKey(
  provider: ProviderId,
  apiKey: string,
): Promise<void> {
  await hydrateVaultFromSession();
  if (!memoryKey) throw new Error('Cofre bloqueado. Desbloqueie primeiro.');
  const trimmed = apiKey.trim();
  if (trimmed) {
    memoryKeys[provider] = trimmed;
  } else {
    delete memoryKeys[provider];
  }
  await persistKeys();
}

export async function getProviderApiKey(
  provider: ProviderId,
): Promise<string | undefined> {
  await hydrateVaultFromSession();
  return memoryKeys[provider];
}

export async function getVaultStatus(): Promise<{
  configured: boolean;
  unlocked: boolean;
  providersWithKey: ProviderId[];
}> {
  await hydrateVaultFromSession();
  const configured = await vaultExists();
  const providersWithKey = PROVIDERS.map((p) => p.id).filter(
    (id) => Boolean(memoryKeys[id]),
  );
  return {
    configured,
    unlocked: isVaultUnlocked(),
    providersWithKey,
  };
}
