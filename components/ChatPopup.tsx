import { CaretDown, GearSix, Moon, Sun, X } from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import type { ThemeId } from '../lib/storage/settings';
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
  const [configured, setConfigured] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [providersWithKey, setProvidersWithKey] = useState<ProviderId[]>([]);
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [contextDead, setContextDead] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [controlsHidden, setControlsHidden] = useState(false);
  const [controlsPinned, setControlsPinned] = useState(false);
  const [theme, setTheme] = useState<ThemeId>('light');
  const scrollRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);

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

  const refreshVault = useCallback(async () => {
    if (!isExtensionContextValid()) {
      handleContextDead();
      return;
    }
    try {
      const res = await sendToBackground({ type: 'VAULT_STATUS' });
      if (res.type === 'VAULT_STATUS_RESULT') {
        setConfigured(res.configured);
        setUnlocked(res.unlocked);
        setProvidersWithKey(res.providersWithKey);
      }
    } catch (err) {
      if (err instanceof ExtensionContextInvalidatedError) {
        handleContextDead();
      }
    }
  }, [handleContextDead]);

  const refreshSessions = useCallback(
    async (opts?: { selectLatest?: boolean }) => {
      if (!isExtensionContextValid()) {
        handleContextDead();
        return;
      }
      try {
        const res = await sendToBackground({ type: 'LIST_SESSIONS' });
        if (res.type === 'SESSIONS_RESULT') {
          const list = res.sessions as ChatSession[];
          setSessions(list);
          if (opts?.selectLatest && list[0]) {
            await loadSession(list[0].id);
          }
        }
      } catch (err) {
        if (err instanceof ExtensionContextInvalidatedError) {
          handleContextDead();
        }
      }
    },
    [handleContextDead, loadSession],
  );

  useEffect(() => {
    void (async () => {
      try {
        const settings = await sendToBackground({ type: 'GET_SETTINGS' });
        if (settings.type === 'SETTINGS_RESULT') {
          setProvider(settings.defaultProvider);
          setTheme(settings.theme);
          const known =
            PROVIDERS.find((p) => p.id === settings.defaultProvider)?.models ??
            [];
          applyModel(settings.defaultModel, known);
        }
        await refreshVault();
        await refreshSessions({ selectLatest: true });
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

  useEffect(() => {
    if (!unlocked || contextDead) {
      setControlsHidden(false);
      setControlsPinned(false);
      return;
    }
    const root = scrollRef.current;
    const target = controlsRef.current;
    if (!root || !target) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = Boolean(entry?.isIntersecting);
        setControlsHidden(!visible);
        if (visible) setControlsPinned(false);
      },
      { root, threshold: 0, rootMargin: '0px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [contextDead, unlocked, model]);

  useEffect(() => {
    if (!controlsPinned) return;
    const root = scrollRef.current;
    if (!root) return;
    const onScroll = () => setControlsPinned(false);
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => root.removeEventListener('scroll', onScroll);
  }, [controlsPinned]);

  // Mantém a conversa no fim enquanto a resposta aparece (streaming).
  useEffect(() => {
    if (!unlocked) return;
    const root = scrollRef.current;
    if (!root) return;
    root.scrollTop = root.scrollHeight;
  }, [unlocked, streamingText, session?.messages]);

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

  const handleUnlock = async () => {
    setError(null);
    if (contextDead || !isExtensionContextValid()) {
      handleContextDead();
      return;
    }
    if (!passphrase) {
      setError('Informe a senha mestre.');
      return;
    }
    setUnlocking(true);
    try {
      const res = await sendToBackground({
        type: 'VAULT_UNLOCK',
        passphrase,
      });
      if (res.type === 'ERROR') {
        setError(res.error);
        return;
      }
      setPassphrase('');
      await refreshVault();
      if (!sessionId) {
        await refreshSessions({ selectLatest: true });
      }
    } catch (err) {
      if (err instanceof ExtensionContextInvalidatedError) {
        handleContextDead();
        return;
      }
      setError(err instanceof Error ? err.message : 'Falha ao desbloquear.');
    } finally {
      setUnlocking(false);
    }
  };

  const handleSend = async () => {
    setError(null);
    if (contextDead || !isExtensionContextValid()) {
      handleContextDead();
      return;
    }
    if (!unlocked) {
      setError('Cofre bloqueado. Desbloqueie para continuar.');
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

  const openOptions = () => {
    void sendToBackground({ type: 'OPEN_OPTIONS' }).catch((err) => {
      if (err instanceof ExtensionContextInvalidatedError) {
        handleContextDead();
      }
    });
  };

  const toggleTheme = () => {
    const next: ThemeId = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    void sendToBackground({ type: 'SET_THEME', theme: next }).catch((err) => {
      if (err instanceof ExtensionContextInvalidatedError) {
        handleContextDead();
      }
    });
  };

  const renderControls = () => (
    <>
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
    </>
  );

  const compact = !contextDead && !unlocked;

  return (
    <div
      className={`sidechat-root sidechat-popup${compact ? ' sidechat-popup-compact' : ''}`}
      data-theme={theme}
    >
      <header className="sidechat-popup-header">
        <strong>🤖 sidechat-ai</strong>
        <div className="sidechat-popup-actions">
          <button
            type="button"
            className="sidechat-btn sidechat-btn-icon"
            title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
            aria-label={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
            disabled={contextDead}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? (
              <Sun size={18} weight="bold" />
            ) : (
              <Moon size={18} weight="bold" />
            )}
          </button>
          {(unlocked || !configured) && (
            <button
              type="button"
              className="sidechat-btn sidechat-btn-icon"
              title="Configurar"
              aria-label="Configurar"
              disabled={contextDead}
              onClick={openOptions}
            >
              <GearSix size={18} weight="bold" />
            </button>
          )}
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
        <div className="sidechat-unlock">
          {!configured ? (
            <>
              <p className="sidechat-muted">
                Cofre ainda não configurado. Abra as configurações para criar a
                senha mestre.
              </p>
              <button
                type="button"
                className="sidechat-btn sidechat-btn-primary"
                onClick={openOptions}
              >
                Configurar cofre
              </button>
            </>
          ) : (
            <>
              <div className="sidechat-field" style={{ marginBottom: 0 }}>
                <label className="sidechat-label" htmlFor="sidechat-unlock">
                  Senha mestre
                </label>
                <input
                  id="sidechat-unlock"
                  className="sidechat-input"
                  type="password"
                  autoComplete="current-password"
                  value={passphrase}
                  disabled={unlocking}
                  onChange={(e) => setPassphrase(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleUnlock();
                    }
                  }}
                />
              </div>
              <button
                type="button"
                className="sidechat-btn sidechat-btn-primary"
                disabled={unlocking || !passphrase}
                onClick={() => void handleUnlock()}
              >
                {unlocking ? 'Desbloqueando…' : 'Desbloquear cofre'}
              </button>
            </>
          )}
          {error && <p className="sidechat-error">{error}</p>}
        </div>
      )}

      {!contextDead && unlocked && (
        <>
          <div className="sidechat-body">
            {controlsHidden && !controlsPinned && (
              <button
                type="button"
                className="sidechat-btn sidechat-btn-icon sidechat-reveal-controls"
                title="Mostrar opções"
                aria-label="Mostrar opções"
                onClick={() => setControlsPinned(true)}
              >
                <CaretDown size={18} weight="bold" />
              </button>
            )}

            {controlsPinned && (
              <div className="sidechat-controls sidechat-controls-pinned">
                {renderControls()}
              </div>
            )}

            <div ref={scrollRef} className="sidechat-scroll">
              <div ref={controlsRef} className="sidechat-controls">
                {renderControls()}
              </div>

              <MessageList
                messages={session?.messages ?? []}
                streamingText={streamingText || undefined}
                model={session?.model || resolvedModel}
                theme={theme}
              />
            </div>
          </div>

          {error && <p className="sidechat-error">{error}</p>}

          <Composer
            value={composer}
            disabled={sending || contextDead}
            onChange={setComposer}
            onSend={() => void handleSend()}
          />
        </>
      )}
    </div>
  );
}
