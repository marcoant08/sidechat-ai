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

/** Tamanho mínimo da senha mestre (permite senhas curtas, ex.: 4 dígitos). */
export const MIN_PASSPHRASE_LENGTH = 4;

export type ProviderKeyMap = Partial<Record<ProviderId, string>>;

interface VaultStorage {
  salt: string;
  /** Encrypted JSON of ProviderKeyMap */
  keysBlob: EncryptedBlob | null;
  /** Verifier: encrypt known string to validate passphrase */
  verifier: EncryptedBlob | null;
  /**
   * Cofre sem senha: as keys ficam em `openKeys` (sem cifragem) e não há
   * verifier. O usuário escolhe esse modo quando não quer digitar senha.
   */
  passwordDisabled?: boolean;
  /** Keys em claro; usadas apenas quando `passwordDisabled` é true. */
  openKeys?: ProviderKeyMap;
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
/** Cofre em modo aberto (sem senha). */
let memoryOpen = false;
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

/**
 * Restaura o estado do cofre após o service worker reiniciar: modo aberto
 * (sem senha) ou chave derivada guardada na session.
 */
export async function hydrateVaultFromSession(): Promise<void> {
  if (memoryKey || memoryOpen) return;
  if (hydratePromise) return hydratePromise;

  hydratePromise = (async () => {
    try {
      const vault = await readVault();
      if (vault.passwordDisabled) {
        memoryOpen = true;
        memoryKey = null;
        memoryKeys = { ...(vault.openKeys ?? {}) };
        return;
      }
      const session = await readSession();
      if (!session) return;
      memoryKey = await importRawKey(session.rawKeyBase64);
      memoryKeys = { ...session.keys };
    } catch {
      memoryKey = null;
      memoryOpen = false;
      memoryKeys = {};
      await clearSession();
    } finally {
      hydratePromise = null;
    }
  })();

  return hydratePromise;
}

export function isVaultUnlocked(): boolean {
  return memoryKey !== null || memoryOpen;
}

export async function lockVault(): Promise<void> {
  const vault = await readVault();
  if (vault.passwordDisabled) {
    throw new Error('O cofre está configurado sem senha.');
  }
  memoryKey = null;
  memoryOpen = false;
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

/** Cofre pronto para uso, com ou sem senha. */
async function isVaultConfigured(): Promise<boolean> {
  const vault = await readVault();
  return vault.passwordDisabled === true || vault.verifier !== null;
}

export async function setupVault(passphrase: string): Promise<void> {
  if (!passphrase || passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(
      `A senha mestre deve ter pelo menos ${MIN_PASSPHRASE_LENGTH} caracteres.`,
    );
  }
  await hydrateVaultFromSession();
  const vault = await readVault();
  // Ao reativar a senha depois de um período sem senha, reaproveita as keys
  // já salvas e troca o salt por um novo.
  const seededKeys: ProviderKeyMap = vault.passwordDisabled
    ? { ...(vault.openKeys ?? {}) }
    : {};
  if (vault.passwordDisabled) vault.salt = generateSalt();

  const key = await deriveVaultKey(passphrase, vault.salt);
  vault.verifier = await encryptString(key, VERIFIER_PLAINTEXT);
  vault.keysBlob = await encryptString(key, JSON.stringify(seededKeys));
  vault.passwordDisabled = false;
  delete vault.openKeys;
  await writeVault(vault);

  memoryKey = key;
  memoryOpen = false;
  memoryKeys = seededKeys;
  await writeSession(memoryKeys, key);
}

/**
 * Desativa a senha: passa a guardar as keys localmente em claro. Só é
 * permitido com o cofre desbloqueado (para poder mover as keys existentes)
 * ou quando ainda não há cofre configurado.
 */
export async function disableVaultPassword(): Promise<void> {
  await hydrateVaultFromSession();
  const vault = await readVault();
  if (vault.passwordDisabled) {
    memoryOpen = true;
    return;
  }
  if (vault.verifier && !memoryKey) {
    throw new Error('Desbloqueie o cofre para desativar a senha.');
  }

  const keys: ProviderKeyMap = memoryKey
    ? { ...memoryKeys }
    : { ...(vault.openKeys ?? {}) };
  vault.openKeys = keys;
  vault.passwordDisabled = true;
  vault.keysBlob = null;
  vault.verifier = null;
  await writeVault(vault);

  memoryKey = null;
  memoryOpen = true;
  memoryKeys = keys;
  await clearSession();
}

export async function unlockVault(passphrase: string): Promise<void> {
  const vault = await readVault();
  if (vault.passwordDisabled) {
    memoryOpen = true;
    memoryKeys = { ...(vault.openKeys ?? {}) };
    return;
  }
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
  memoryOpen = false;
  if (vault.keysBlob) {
    const json = await decryptString(key, vault.keysBlob);
    memoryKeys = JSON.parse(json) as ProviderKeyMap;
  } else {
    memoryKeys = {};
  }
  await writeSession(memoryKeys, key);
}

async function persistKeys(): Promise<void> {
  const vault = await readVault();
  if (vault.passwordDisabled) {
    vault.openKeys = { ...memoryKeys };
    await writeVault(vault);
    return;
  }
  if (!memoryKey) throw new Error('Cofre bloqueado.');
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
  if (!isVaultUnlocked()) {
    throw new Error('Cofre bloqueado. Desbloqueie primeiro.');
  }
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
  passwordDisabled: boolean;
  providersWithKey: ProviderId[];
}> {
  await hydrateVaultFromSession();
  const vault = await readVault();
  const passwordDisabled = vault.passwordDisabled === true;
  const providersWithKey = PROVIDERS.map((p) => p.id).filter(
    (id) => Boolean(memoryKeys[id]),
  );
  return {
    configured: await isVaultConfigured(),
    unlocked: isVaultUnlocked(),
    passwordDisabled,
    providersWithKey,
  };
}
