import {
  getProvider,
  isProviderId,
  PROVIDERS,
  type ProviderId,
} from '../providers/types';

const SETTINGS_KEY = 'sidechat_settings';

export type ThemeId = 'light' | 'dark';

export type ProviderModelLists = Record<ProviderId, string[]>;

export interface Settings {
  defaultProvider: ProviderId;
  defaultModel: string;
  theme: ThemeId;
  providerModels: ProviderModelLists;
}

interface StoredSettings extends Partial<Settings> {
  /** Versão das listas padrão já aplicada a este usuário. */
  modelsVersion?: number;
}

const MAX_MODELS_PER_PROVIDER = 40;
const MAX_MODEL_ID_LENGTH = 200;

/**
 * Versão das listas padrão. Incremente ao adicionar modelos novos em
 * `PROVIDERS`: listas já salvas recebem uma única vez os modelos que faltam,
 * para o item novo aparecer nos selects de quem já usava a extensão. Depois
 * disso, remoções feitas pelo usuário não são desfeitas.
 */
const MODELS_SCHEMA_VERSION = 2;

export function defaultProviderModels(): ProviderModelLists {
  return {
    openai: [...getProvider('openai').models],
    groq: [...getProvider('groq').models],
    anthropic: [...getProvider('anthropic').models],
    openrouter: [...getProvider('openrouter').models],
  };
}

const DEFAULT_SETTINGS: Settings = {
  defaultProvider: 'openai',
  defaultModel: 'gpt-4o-mini',
  theme: 'light',
  providerModels: defaultProviderModels(),
};

export function isThemeId(value: unknown): value is ThemeId {
  return value === 'light' || value === 'dark';
}

function normalizeModelList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const seen = new Set<string>();
  const models: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const model = item.trim();
    if (!model || model.length > MAX_MODEL_ID_LENGTH) continue;
    if (seen.has(model)) continue;
    seen.add(model);
    models.push(model);
    if (models.length >= MAX_MODELS_PER_PROVIDER) break;
  }
  return models;
}

export function sanitizeProviderModels(
  value: unknown,
): ProviderModelLists {
  const defaults = defaultProviderModels();
  if (!value || typeof value !== 'object') return defaults;

  const raw = value as Partial<Record<ProviderId, unknown>>;
  const next = { ...defaults };

  for (const provider of PROVIDERS) {
    const parsed = normalizeModelList(raw[provider.id]);
    if (parsed && parsed.length > 0) {
      next[provider.id] = parsed;
    }
  }

  return next;
}

/** Acrescenta os modelos padrão que ainda não estão em cada lista. */
function mergeDefaultModels(
  saved: ProviderModelLists,
): ProviderModelLists {
  const next = { ...saved };
  for (const provider of PROVIDERS) {
    const merged = normalizeModelList([
      ...saved[provider.id],
      ...provider.models,
    ]);
    if (merged) next[provider.id] = merged;
  }
  return next;
}

export function getModelsForProvider(
  provider: ProviderId,
  providerModels?: ProviderModelLists | Partial<ProviderModelLists> | null,
): string[] {
  const list = providerModels?.[provider];
  if (Array.isArray(list) && list.length > 0) {
    return list;
  }
  return [...getProvider(provider).models];
}

export async function getSettings(): Promise<Settings> {
  const result = await browser.storage.local.get(SETTINGS_KEY);
  const stored = result[SETTINGS_KEY] as StoredSettings | undefined;
  if (!stored) {
    return { ...DEFAULT_SETTINGS, providerModels: defaultProviderModels() };
  }

  const defaultProvider = isProviderId(stored.defaultProvider)
    ? stored.defaultProvider
    : DEFAULT_SETTINGS.defaultProvider;

  const defaultModel =
    typeof stored.defaultModel === 'string' && stored.defaultModel.trim()
      ? stored.defaultModel.trim()
      : getProvider(defaultProvider).defaultModel;

  const theme = isThemeId(stored.theme) ? stored.theme : DEFAULT_SETTINGS.theme;

  let providerModels = sanitizeProviderModels(stored.providerModels);
  const appliedVersion =
    typeof stored.modelsVersion === 'number' ? stored.modelsVersion : 0;
  if (appliedVersion < MODELS_SCHEMA_VERSION) {
    providerModels = mergeDefaultModels(providerModels);
    // Grava a versão para a mesclagem não se repetir (e não ressuscitar
    // modelos que o usuário remover de propósito daqui em diante).
    await browser.storage.local.set({
      [SETTINGS_KEY]: {
        defaultProvider,
        defaultModel,
        theme,
        providerModels,
        modelsVersion: MODELS_SCHEMA_VERSION,
      },
    });
  }

  return { defaultProvider, defaultModel, theme, providerModels };
}

export async function saveSettings(settings: Settings): Promise<void> {
  if (!isProviderId(settings.defaultProvider)) {
    throw new Error('Provider inválido.');
  }
  const model = settings.defaultModel.trim();
  if (!model) throw new Error('Modelo inválido.');
  if (!isThemeId(settings.theme)) {
    throw new Error('Tema inválido.');
  }
  const providerModels = sanitizeProviderModels(settings.providerModels);
  await browser.storage.local.set({
    [SETTINGS_KEY]: {
      defaultProvider: settings.defaultProvider,
      defaultModel: model,
      theme: settings.theme,
      providerModels,
      modelsVersion: MODELS_SCHEMA_VERSION,
    } satisfies StoredSettings,
  });
}

export async function saveTheme(theme: ThemeId): Promise<void> {
  const current = await getSettings();
  await saveSettings({ ...current, theme });
}
