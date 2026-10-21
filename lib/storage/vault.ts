import {
  decryptString,
  deriveVaultKey,
  encryptString,
  generateSalt,
  type EncryptedBlob,
} from '../crypto/passphrase';
import { type ProviderId, PROVIDERS } from '../providers/types';

const VAULT_STORAGE_KEY = 'sidechat_vault';

export type ProviderKeyMap = Partial<Record<ProviderId, string>>;

interface VaultStorage {
  salt: string;
  /** Encrypted JSON of ProviderKeyMap */
  keysBlob: EncryptedBlob | null;
  /** Verifier: encrypt known string to validate passphrase */
  verifier: EncryptedBlob | null;
}

const VERIFIER_PLAINTEXT = 'sidechat-vault-ok';

const emptyVault = (): VaultStorage => ({
  salt: generateSalt(),
  keysBlob: null,
  verifier: null,
});

let memoryKey: CryptoKey | null = null;
let memoryKeys: ProviderKeyMap = {};

export function isVaultUnlocked(): boolean {
  return memoryKey !== null;
}

export function lockVault(): void {
  memoryKey = null;
  memoryKeys = {};
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
}

async function persistKeys(): Promise<void> {
  if (!memoryKey) throw new Error('Cofre bloqueado.');
  const vault = await readVault();
  vault.keysBlob = await encryptString(
    memoryKey,
    JSON.stringify(memoryKeys),
  );
  await writeVault(vault);
}

export async function setProviderApiKey(
  provider: ProviderId,
  apiKey: string,
): Promise<void> {
  if (!memoryKey) throw new Error('Cofre bloqueado. Desbloqueie primeiro.');
  const trimmed = apiKey.trim();
  if (trimmed) {
    memoryKeys[provider] = trimmed;
  } else {
    delete memoryKeys[provider];
  }
  await persistKeys();
}

export function getProviderApiKey(provider: ProviderId): string | undefined {
  return memoryKeys[provider];
}

export async function getVaultStatus(): Promise<{
  configured: boolean;
  unlocked: boolean;
  providersWithKey: ProviderId[];
}> {
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
