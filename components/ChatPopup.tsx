import { GearSix, X } from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Composer } from './Composer';
import { MessageList } from './MessageList';
import { SessionPicker } from './SessionPicker';
import { truncateSelection } from '../lib/limits';
import {
  ExtensionContextInvalidatedError,
  isExtensionContextValid,
  sendToBackground,
  type ServerMessage,
} from '../lib/messaging';
import {
  effectiveModelId,
  MODEL_DIGITAR,
  resolveModelSelection,
} from '../lib/models';
import { PROVIDERS, type ProviderId } from '../lib/providers/types';
import type { ChatSession } from '../lib/storage/sessions';

interface Props {
  selectedText: string;
  onClose: () => void;
}

export function ChatPopup({ selectedText, onClose }: Props) {
  const truncated = useMemo(
    () => truncateSelection(selectedText.trim()),
    [selectedText],
  );

  const [composer, setComposer] = useState(truncated.text);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [provider, setProvider] = useState<ProviderId>('openai');
  const [model, setModel] = useState('gpt-4o-mini');
  const [customModel, setCustomModel] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [providersWithKey, setProvidersWithKey] = useState<ProviderId[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [contextDead, setContextDead] = useState(false);

  const modelOptions = useMemo(() => {
    const def = PROVIDERS.find((p) => p.id === provider);
    return def?.models ?? [];
  }, [provider]);

  const handleContextDead = useCallback(() => {
    setContextDead(true);
    setError(
      'Extensão foi recarregada. Atualize esta página (F5) para continuar.',
    );
  }, []);

  const refreshVault = useCallback(async () => {
    if (!isExtensionContextValid()) {
      handleContextDead();
      return;
    }
    try {
      const res = await sendToBackground({ type: 'VAULT_STATUS' });
      if (res.type === 'VAULT_STATUS_RESULT') {
        setUnlocked(res.unlocked);
        setProvidersWithKey(res.providersWithKey);
      }
    } catch (err) {
      if (err instanceof ExtensionContextInvalidatedError) {
        handleContextDead();
      }
    }
  }, [handleContextDead]);

  const refreshSessions = useCallback(async () => {
    if (!isExtensionContextValid()) {
      handleContextDead();
      return;
    }
    try {
      const res = await sendToBackground({ type: 'LIST_SESSIONS' });
      if (res.type === 'SESSIONS_RESULT') {
        setSessions(res.sessions as ChatSession[]);
      }
    } catch (err) {
      if (err instanceof ExtensionContextInvalidatedError) {
        handleContextDead();
      }
    }
  }, [handleContextDead]);

  const applyModel = useCallback((modelId: string, known: string[]) => {
    const resolved = resolveModelSelection(modelId, known);
    setModel(resolved.selectValue);
    setCustomModel(resolved.customModel);
  }, []);

  const loadSession = useCallback(
    async (id: string) => {
      if (!isExtensionContextValid()) {
        handleContextDead();
        return;
      }
      try {
        const res = await sendToBackground({
          type: 'GET_SESSION',
          sessionId: id,
        });
        if (res.type === 'SESSION_RESULT' && res.session) {
          const s = res.session as ChatSession;
          setSession(s);
          setSessionId(s.id);
          setProvider(s.provider);
          const known =
            PROVIDERS.find((p) => p.id === s.provider)?.models ?? [];
          applyModel(s.model, known);
        }
      } catch (err) {
        if (err instanceof ExtensionContextInvalidatedError) {
          handleContextDead();
        }
      }
    },
    [applyModel, handleContextDead],
  );

  useEffect(() => {
    void (async () => {
      try {
        const settings = await sendToBackground({ type: 'GET_SETTINGS' });
        if (settings.type === 'SETTINGS_RESULT') {
          setProvider(settings.defaultProvider);
          const known =
            PROVIDERS.find((p) => p.id === settings.defaultProvider)?.models ??
            [];
          applyModel(settings.defaultModel, known);
        }
        await refreshVault();
        await refreshSessions();
      } catch (err) {
        if (err instanceof ExtensionContextInvalidatedError) {
          handleContextDead();
        }
      }
    })();
  }, [applyModel, handleContextDead, refreshSessions, refreshVault]);

  // Reconsulta o cofre ao focar / periodicamente até desbloquear.
  useEffect(() => {
    if (contextDead || unlocked) return;

    const onFocus = () => {
      void refreshVault();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    const timer = window.setInterval(() => {
      void refreshVault();
    }, 2000);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      window.clearInterval(timer);
    };
  }, [contextDead, refreshVault, unlocked]);

  useEffect(() => {
    const listener = (raw: unknown) => {
      const msg = raw as ServerMessage;
      if (!msg || typeof msg !== 'object' || !('type' in msg)) return;
      if (msg.type === 'CHAT_CHUNK' && msg.sessionId === sessionId) {
        setStreamingText((prev) => prev + msg.delta);
      }
      if (msg.type === 'CHAT_DONE' && msg.sessionId === sessionId) {
        setStreamingText('');
        setSending(false);
        void loadSession(msg.sessionId);
        void refreshSessions();
      }
      if (msg.type === 'CHAT_ERROR' && msg.sessionId === sessionId) {
        setStreamingText('');
        setSending(false);
        setError(msg.error);
      }
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, [loadSession, refreshSessions, sessionId]);

  const resolvedModel = effectiveModelId(model, customModel);

  const ensureSession = async (): Promise<string> => {
    if (sessionId) return sessionId;
    const res = await sendToBackground({
      type: 'CREATE_SESSION',
      provider,
      model: resolvedModel,
      title: truncated.text.slice(0, 60) || 'Nova sessão',
    });
    if (res.type !== 'SESSION_RESULT' || !res.session) {
      throw new Error(
        res.type === 'ERROR' ? res.error : 'Falha ao criar sessão.',
      );
    }
    const s = res.session as ChatSession;
    setSession(s);
    setSessionId(s.id);
    await refreshSessions();
    return s.id;
  };

  const handleSend = async () => {
    setError(null);
    if (contextDead || !isExtensionContextValid()) {
      handleContextDead();
      return;
    }
    if (!unlocked) {
      setError('Cofre bloqueado. Abra Configurar e desbloqueie.');
      return;
    }
    if (!providersWithKey.includes(provider)) {
      setError(`Configure a API key de ${provider} nas Options.`);
      return;
    }
    if (!resolvedModel) {
      setError('Informe o model id.');
      return;
    }
    const content = composer.trim();
    if (!content) return;

    setSending(true);
    setStreamingText('');
    try {
      const id = await ensureSession();
      const res = await sendToBackground({
        type: 'CHAT_SEND',
        sessionId: id,
        content,
        provider,
        model: resolvedModel,
      });
      if (res.type === 'ERROR') {
        setSending(false);
        setError(res.error);
        return;
      }
      setComposer('');
    } catch (err) {
      setSending(false);
      if (err instanceof ExtensionContextInvalidatedError) {
        handleContextDead();
        return;
      }
      setError(err instanceof Error ? err.message : 'Falha ao enviar.');
    }
  };

  return (
    <div className="sidechat-root sidechat-popup">
      <header className="sidechat-popup-header">
        <strong>🤖 sidechat-ai</strong>
        <div className="sidechat-popup-actions">
          <button
            type="button"
            className="sidechat-btn sidechat-btn-icon"
            title="Configurar"
            aria-label="Configurar"
            disabled={contextDead}
            onClick={() => {
              void sendToBackground({ type: 'OPEN_OPTIONS' }).catch((err) => {
                if (err instanceof ExtensionContextInvalidatedError) {
                  handleContextDead();
                }
              });
            }}
          >
            <GearSix size={18} weight="bold" />
          </button>
          <button
            type="button"
            className="sidechat-btn sidechat-btn-icon"
            title="Fechar"
            aria-label="Fechar"
            onClick={onClose}
          >
            <X size={18} weight="bold" />
          </button>
        </div>
      </header>

      {contextDead && (
        <p className="sidechat-error">
          Extensão foi recarregada. Atualize esta página (F5) para continuar.
        </p>
      )}

      {!contextDead && !unlocked && (
        <p className="sidechat-error">
          Cofre bloqueado. Use Configurar para desbloquear e definir tokens.
        </p>
      )}

      {truncated.truncated && (
        <p className="sidechat-muted">
          Texto selecionado truncado para {truncated.text.length} caracteres.
        </p>
      )}

      <SessionPicker
        sessions={sessions}
        currentId={sessionId}
        onSelect={(id) => void loadSession(id)}
        onCreate={() => {
          setSessionId(null);
          setSession(null);
          setStreamingText('');
        }}
      />

      <div className="sidechat-row">
        <div className="sidechat-field" style={{ flex: 1, marginBottom: 0 }}>
          <label className="sidechat-label">Provider</label>
          <select
            className="sidechat-select"
            value={provider}
            onChange={(e) => {
              const id = e.target.value as ProviderId;
              setProvider(id);
              const def = PROVIDERS.find((p) => p.id === id);
              if (def) {
                setModel(def.defaultModel);
                setCustomModel('');
              }
            }}
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
                {providersWithKey.includes(p.id) ? '' : ' (sem key)'}
              </option>
            ))}
          </select>
        </div>
        <div className="sidechat-field" style={{ flex: 1, marginBottom: 0 }}>
          <label className="sidechat-label">Modelo</label>
          <select
            className="sidechat-select"
            value={model}
            onChange={(e) => {
              const value = e.target.value;
              setModel(value);
              if (value !== MODEL_DIGITAR) {
                setCustomModel('');
              }
            }}
          >
            {modelOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
            <option value={MODEL_DIGITAR}>Digitar</option>
          </select>
        </div>
      </div>

      {model === MODEL_DIGITAR && (
        <div className="sidechat-field">
          <label className="sidechat-label">Model id</label>
          <input
            className="sidechat-input"
            value={customModel}
            placeholder="ex: gpt-4.1"
            onChange={(e) => setCustomModel(e.target.value)}
          />
        </div>
      )}

      <MessageList
        messages={session?.messages ?? []}
        streamingText={streamingText || undefined}
      />

      {error && <p className="sidechat-error">{error}</p>}

      <Composer
        value={composer}
        disabled={sending || !unlocked || contextDead}
        onChange={setComposer}
        onSend={() => void handleSend()}
      />
    </div>
  );
}
