import {
  getProvider,
  isProviderId,
  type ProviderId,
} from '../providers/types';

const SETTINGS_KEY = 'sidechat_settings';

export interface Settings {
  defaultProvider: ProviderId;
  defaultModel: string;
}

const DEFAULT_SETTINGS: Settings = {
  defaultProvider: 'openai',
  defaultModel: 'gpt-4o-mini',
};

export async function getSettings(): Promise<Settings> {
  const result = await browser.storage.local.get(SETTINGS_KEY);
  const stored = result[SETTINGS_KEY] as Partial<Settings> | undefined;
  if (!stored) return { ...DEFAULT_SETTINGS };

  const defaultProvider = isProviderId(stored.defaultProvider)
    ? stored.defaultProvider
    : DEFAULT_SETTINGS.defaultProvider;

  const defaultModel =
    typeof stored.defaultModel === 'string' && stored.defaultModel.trim()
      ? stored.defaultModel.trim()
      : getProvider(defaultProvider).defaultModel;

  return { defaultProvider, defaultModel };
}

export async function saveSettings(settings: Settings): Promise<void> {
  if (!isProviderId(settings.defaultProvider)) {
    throw new Error('Provider inválido.');
  }
  const model = settings.defaultModel.trim();
  if (!model) throw new Error('Modelo inválido.');
  await browser.storage.local.set({
    [SETTINGS_KEY]: {
      defaultProvider: settings.defaultProvider,
      defaultModel: model,
    } satisfies Settings,
  });
}
