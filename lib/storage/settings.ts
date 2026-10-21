import {
  getProvider,
  isProviderId,
  type ProviderId,
} from '../providers/types';

const SETTINGS_KEY = 'sidechat_settings';

export type ThemeId = 'light' | 'dark';

export interface Settings {
  defaultProvider: ProviderId;
  defaultModel: string;
  theme: ThemeId;
}

const DEFAULT_SETTINGS: Settings = {
  defaultProvider: 'openai',
  defaultModel: 'gpt-4o-mini',
  theme: 'light',
};

export function isThemeId(value: unknown): value is ThemeId {
  return value === 'light' || value === 'dark';
}

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

  const theme = isThemeId(stored.theme) ? stored.theme : DEFAULT_SETTINGS.theme;

  return { defaultProvider, defaultModel, theme };
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
  await browser.storage.local.set({
    [SETTINGS_KEY]: {
      defaultProvider: settings.defaultProvider,
      defaultModel: model,
      theme: settings.theme,
    } satisfies Settings,
  });
}

export async function saveTheme(theme: ThemeId): Promise<void> {
  const current = await getSettings();
  await saveSettings({ ...current, theme });
}
