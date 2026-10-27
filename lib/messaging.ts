import { MAX_MESSAGE_CHARS } from './limits';
import {
  isThemeId,
  sanitizeProviderModels,
  type ProviderModelLists,
  type ThemeId,
} from './storage/settings';
import { isProviderId, type ProviderId } from './providers/types';

export type ClientMessage =
  | { type: 'VAULT_STATUS' }
  | { type: 'VAULT_SETUP'; passphrase: string }
  | { type: 'VAULT_UNLOCK'; passphrase: string }
  | { type: 'VAULT_LOCK' }
  | { type: 'VAULT_DISABLE_PASSWORD' }
  | { type: 'VAULT_SET_KEY'; provider: ProviderId; apiKey: string }
  | { type: 'GET_SETTINGS' }
  | {
      type: 'SAVE_SETTINGS';
      defaultProvider: ProviderId;
      defaultModel: string;
      providerModels?: ProviderModelLists;
    }
  | { type: 'SET_THEME'; theme: ThemeId }
  | { type: 'LIST_SESSIONS' }
  | { type: 'GET_SESSION'; sessionId: string }
  | {
      type: 'CREATE_SESSION';
      title?: string;
      provider: ProviderId;
      model: string;
      pageUrl?: string;
    }
  | {
      type: 'UPDATE_SESSION';
      sessionId: string;
      provider?: ProviderId;
      model?: string;
      title?: string;
    }
  | { type: 'CLEAR_SESSIONS' }
  | {
      type: 'CHAT_SEND';
      sessionId: string;
      content: string;
      provider: ProviderId;
      model: string;
    }
  | { type: 'OPEN_OPTIONS' };

export type ServerMessage =
  | { type: 'OK' }
  | { type: 'ERROR'; error: string }
  | {
      type: 'VAULT_STATUS_RESULT';
      configured: boolean;
      unlocked: boolean;
      passwordDisabled: boolean;
      providersWithKey: ProviderId[];
    }
  | {
      type: 'SETTINGS_RESULT';
      defaultProvider: ProviderId;
      defaultModel: string;
      theme: ThemeId;
      providerModels: ProviderModelLists;
    }
  | { type: 'SESSIONS_RESULT'; sessions: unknown }
  | { type: 'SESSION_RESULT'; session: unknown }
  | { type: 'CHAT_CHUNK'; sessionId: string; delta: string }
  | { type: 'CHAT_DONE'; sessionId: string; fullText: string }
  | { type: 'CHAT_ERROR'; sessionId: string; error: string };

export function assertExtensionSender(sender: {
  id?: string;
}): void {
  if (sender.id !== browser.runtime.id) {
    throw new Error('Sender não autorizado.');
  }
}

function isNonEmptyString(value: unknown, max = MAX_MESSAGE_CHARS): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

export function parseClientMessage(raw: unknown): ClientMessage {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Mensagem inválida.');
  }
  const msg = raw as Record<string, unknown>;
  const type = msg.type;
  if (typeof type !== 'string') throw new Error('Tipo ausente.');

  switch (type) {
    case 'VAULT_STATUS':
    case 'VAULT_LOCK':
    case 'VAULT_DISABLE_PASSWORD':
    case 'GET_SETTINGS':
    case 'LIST_SESSIONS':
    case 'CLEAR_SESSIONS':
    case 'OPEN_OPTIONS':
      return { type };

    case 'VAULT_SETUP':
    case 'VAULT_UNLOCK': {
      if (!isNonEmptyString(msg.passphrase, 256)) {
        throw new Error('Senha inválida.');
      }
      return { type, passphrase: msg.passphrase };
    }

    case 'VAULT_SET_KEY': {
      if (!isProviderId(msg.provider)) throw new Error('Provider inválido.');
      if (typeof msg.apiKey !== 'string' || msg.apiKey.length > 512) {
        throw new Error('API key inválida.');
      }
      return { type, provider: msg.provider, apiKey: msg.apiKey };
    }

    case 'SAVE_SETTINGS': {
      if (!isProviderId(msg.defaultProvider)) {
        throw new Error('Provider inválido.');
      }
      if (!isNonEmptyString(msg.defaultModel, 200)) {
        throw new Error('Modelo inválido.');
      }
      const providerModels =
        msg.providerModels === undefined
          ? undefined
          : sanitizeProviderModels(msg.providerModels);
      return {
        type,
        defaultProvider: msg.defaultProvider,
        defaultModel: msg.defaultModel,
        providerModels,
      };
    }

    case 'SET_THEME': {
      if (!isThemeId(msg.theme)) throw new Error('Tema inválido.');
      return { type, theme: msg.theme };
    }

    case 'GET_SESSION': {
      if (!isNonEmptyString(msg.sessionId, 80)) {
        throw new Error('sessionId inválido.');
      }
      return { type, sessionId: msg.sessionId };
    }

    case 'CREATE_SESSION': {
      if (!isProviderId(msg.provider)) throw new Error('Provider inválido.');
      if (!isNonEmptyString(msg.model, 200)) throw new Error('Modelo inválido.');
      const title =
        typeof msg.title === 'string' ? msg.title.slice(0, 80) : undefined;
      const pageUrl =
        typeof msg.pageUrl === 'string'
          ? msg.pageUrl.slice(0, 2048)
          : undefined;
      return {
        type,
        provider: msg.provider,
        model: msg.model,
        title,
        pageUrl,
      };
    }

    case 'UPDATE_SESSION': {
      if (!isNonEmptyString(msg.sessionId, 80)) {
        throw new Error('sessionId inválido.');
      }
      if (msg.provider !== undefined && !isProviderId(msg.provider)) {
        throw new Error('Provider inválido.');
      }
      if (msg.model !== undefined && !isNonEmptyString(msg.model, 200)) {
        throw new Error('Modelo inválido.');
      }
      const title =
        typeof msg.title === 'string' ? msg.title.slice(0, 80) : undefined;
      return {
        type,
        sessionId: msg.sessionId,
        provider: msg.provider as ProviderId | undefined,
        model: msg.model as string | undefined,
        title,
      };
    }

    case 'CHAT_SEND': {
      if (!isNonEmptyString(msg.sessionId, 80)) {
        throw new Error('sessionId inválido.');
      }
      if (!isNonEmptyString(msg.content, MAX_MESSAGE_CHARS)) {
        throw new Error('Mensagem inválida ou muito longa.');
      }
      if (!isProviderId(msg.provider)) throw new Error('Provider inválido.');
      if (!isNonEmptyString(msg.model, 200)) throw new Error('Modelo inválido.');
      return {
        type,
        sessionId: msg.sessionId,
        content: msg.content,
        provider: msg.provider,
        model: msg.model,
      };
    }

    default:
      throw new Error(`Tipo de mensagem desconhecido: ${type}`);
  }
}

export class ExtensionContextInvalidatedError extends Error {
  constructor() {
    super('Extension context invalidated');
    this.name = 'ExtensionContextInvalidatedError';
  }
}

export function isExtensionContextValid(): boolean {
  try {
    return Boolean(browser.runtime?.id);
  } catch {
    return false;
  }
}

function isContextInvalidatedError(err: unknown): boolean {
  if (err instanceof ExtensionContextInvalidatedError) return true;
  const message = err instanceof Error ? err.message : String(err);
  return message.includes('Extension context invalidated');
}

export async function sendToBackground<T extends ServerMessage = ServerMessage>(
  message: ClientMessage,
): Promise<T> {
  if (!isExtensionContextValid()) {
    throw new ExtensionContextInvalidatedError();
  }
  try {
    return (await browser.runtime.sendMessage(message)) as T;
  } catch (err) {
    if (isContextInvalidatedError(err)) {
      throw new ExtensionContextInvalidatedError();
    }
    throw err;
  }
}
