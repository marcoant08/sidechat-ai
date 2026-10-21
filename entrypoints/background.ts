import {
  assertExtensionSender,
  parseClientMessage,
  type ClientMessage,
  type ServerMessage,
} from '../lib/messaging';
import { streamChat } from '../lib/providers/registry';
import { resolveModelId, type ChatMessage } from '../lib/providers/types';
import {
  appendMessages,
  clearSessions,
  createSession,
  getSession,
  listSessions,
  updateSession,
} from '../lib/storage/sessions';
import {
  getSettings,
  saveSettings,
  saveTheme,
} from '../lib/storage/settings';
import {
  getProviderApiKey,
  getVaultStatus,
  lockVault,
  setProviderApiKey,
  setupVault,
  unlockVault,
} from '../lib/storage/vault';

const SYSTEM_PROMPT =
  'You are a helpful assistant. Respond clearly and concisely. The user may include selected page text for context.';

async function notifyTab(
  tabId: number | undefined,
  message: ServerMessage,
): Promise<void> {
  if (tabId == null) return;
  try {
    await browser.tabs.sendMessage(tabId, message);
  } catch {
    // tab may have closed
  }
}

async function handleChatSend(
  msg: Extract<ClientMessage, { type: 'CHAT_SEND' }>,
  tabId: number | undefined,
): Promise<ServerMessage> {
  const status = await getVaultStatus();
  if (!status.unlocked) {
    return {
      type: 'ERROR',
      error: 'Cofre bloqueado. Desbloqueie nas Options.',
    };
  }

  const apiKey = await getProviderApiKey(msg.provider);
  if (!apiKey) {
    return {
      type: 'ERROR',
      error: `API key não configurada para ${msg.provider}.`,
    };
  }

  let session = await getSession(msg.sessionId);
  if (!session) {
    return {
      type: 'ERROR',
      error: 'Sessão não encontrada.',
    };
  }

  const model = resolveModelId(msg.provider, msg.model);

  session = await updateSession(msg.sessionId, {
    provider: msg.provider,
    model,
  });

  const userMessage = {
    role: 'user' as const,
    content: msg.content,
    createdAt: Date.now(),
  };
  session = await appendMessages(msg.sessionId, [userMessage]);

  const history: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...session.messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  ];

  // Acknowledge start; stream continues asynchronously
  void (async () => {
    let fullText = '';
    try {
      for await (const delta of streamChat({
        provider: msg.provider,
        model,
        apiKey,
        messages: history,
      })) {
        fullText += delta;
        await notifyTab(tabId, {
          type: 'CHAT_CHUNK',
          sessionId: msg.sessionId,
          delta,
        });
      }
      await appendMessages(msg.sessionId, [
        {
          role: 'assistant',
          content: fullText,
          createdAt: Date.now(),
          model,
        },
      ]);
      await notifyTab(tabId, {
        type: 'CHAT_DONE',
        sessionId: msg.sessionId,
        fullText,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Erro no chat.';
      await notifyTab(tabId, {
        type: 'CHAT_ERROR',
        sessionId: msg.sessionId,
        error,
      });
    }
  })();

  return { type: 'OK' };
}

async function dispatch(
  message: ClientMessage,
  tabId: number | undefined,
): Promise<ServerMessage> {
  switch (message.type) {
    case 'VAULT_STATUS': {
      const status = await getVaultStatus();
      return { type: 'VAULT_STATUS_RESULT', ...status };
    }
    case 'VAULT_SETUP': {
      await setupVault(message.passphrase);
      return { type: 'OK' };
    }
    case 'VAULT_UNLOCK': {
      await unlockVault(message.passphrase);
      return { type: 'OK' };
    }
    case 'VAULT_LOCK': {
      await lockVault();
      return { type: 'OK' };
    }
    case 'VAULT_SET_KEY': {
      await setProviderApiKey(message.provider, message.apiKey);
      return { type: 'OK' };
    }
    case 'GET_SETTINGS': {
      const settings = await getSettings();
      return { type: 'SETTINGS_RESULT', ...settings };
    }
    case 'SAVE_SETTINGS': {
      const current = await getSettings();
      await saveSettings({
        defaultProvider: message.defaultProvider,
        defaultModel: message.defaultModel,
        theme: current.theme,
      });
      return { type: 'OK' };
    }
    case 'SET_THEME': {
      await saveTheme(message.theme);
      return { type: 'OK' };
    }
    case 'LIST_SESSIONS': {
      const sessions = await listSessions();
      return { type: 'SESSIONS_RESULT', sessions };
    }
    case 'GET_SESSION': {
      const session = await getSession(message.sessionId);
      return { type: 'SESSION_RESULT', session };
    }
    case 'CREATE_SESSION': {
      const session = await createSession({
        title: message.title,
        provider: message.provider,
        model: message.model,
        pageUrl: message.pageUrl,
      });
      return { type: 'SESSION_RESULT', session };
    }
    case 'UPDATE_SESSION': {
      const session = await updateSession(message.sessionId, {
        provider: message.provider,
        model: message.model,
        title: message.title,
      });
      return { type: 'SESSION_RESULT', session };
    }
    case 'CLEAR_SESSIONS': {
      await clearSessions();
      return { type: 'OK' };
    }
    case 'OPEN_OPTIONS': {
      await browser.runtime.openOptionsPage();
      return { type: 'OK' };
    }
    case 'CHAT_SEND':
      return handleChatSend(message, tabId);
    default:
      return { type: 'ERROR', error: 'Mensagem não suportada.' };
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((raw, sender) => {
    try {
      assertExtensionSender(sender);
      const message = parseClientMessage(raw);
      return dispatch(message, sender.tab?.id).catch((err: unknown) => {
        const error = err instanceof Error ? err.message : 'Erro desconhecido.';
        return { type: 'ERROR', error } satisfies ServerMessage;
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Mensagem rejeitada.';
      return Promise.resolve({
        type: 'ERROR',
        error,
      } satisfies ServerMessage);
    }
  });
});
