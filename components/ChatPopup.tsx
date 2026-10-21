import { useCallback, useEffect, useMemo, useState } from 'react';
import { Composer } from './Composer';
import { MessageList } from './MessageList';
import { SessionPicker } from './SessionPicker';
import { truncateSelection } from '../lib/limits';
import { sendToBackground, type ServerMessage } from '../lib/messaging';
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

  const modelOptions = useMemo(() => {
    const def = PROVIDERS.find((p) => p.id === provider);
    return def?.models ?? [];
  }, [provider]);

  const refreshVault = useCallback(async () => {
    const res = await sendToBackground({ type: 'VAULT_STATUS' });
    if (res.type === 'VAULT_STATUS_RESULT') {
      setUnlocked(res.unlocked);
      setProvidersWithKey(res.providersWithKey);
    }
  }, []);

  const refreshSessions = useCallback(async () => {
    const res = await sendToBackground({ type: 'LIST_SESSIONS' });
    if (res.type === 'SESSIONS_RESULT') {
      setSessions(res.sessions as ChatSession[]);
    }
  }, []);

  const loadSession = useCallback(async (id: string) => {
    const res = await sendToBackground({ type: 'GET_SESSION', sessionId: id });
    if (res.type === 'SESSION_RESULT' && res.session) {
      const s = res.session as ChatSession;
      setSession(s);
      setSessionId(s.id);
      setProvider(s.provider);
      setModel(s.model);
      setCustomModel('');
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const settings = await sendToBackground({ type: 'GET_SETTINGS' });
      if (settings.type === 'SETTINGS_RESULT') {
        setProvider(settings.defaultProvider);
        setModel(settings.defaultModel);
      }
      await refreshVault();
      await refreshSessions();
    })();
  }, [refreshSessions, refreshVault]);

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

  const effectiveModel = customModel.trim() || model;

  const ensureSession = async (): Promise<string> => {
    if (sessionId) return sessionId;
    const res = await sendToBackground({
      type: 'CREATE_SESSION',
      provider,
      model: effectiveModel,
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
    if (!unlocked) {
      setError('Cofre bloqueado. Abra Configurar e desbloqueie.');
      return;
    }
    if (!providersWithKey.includes(provider)) {
      setError(`Configure a API key de ${provider} nas Options.`);
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
        model: effectiveModel,
      });
      if (res.type === 'ERROR') {
        setSending(false);
        setError(res.error);
        return;
      }
      setComposer('');
    } catch (err) {
      setSending(false);
      setError(err instanceof Error ? err.message : 'Falha ao enviar.');
    }
  };

  return (
    <div className="sidechat-root sidechat-popup">
      <header className="sidechat-popup-header">
        <strong>Sidechat AI</strong>
        <div className="sidechat-popup-actions">
          <button
            type="button"
            className="sidechat-btn"
            onClick={() => void sendToBackground({ type: 'OPEN_OPTIONS' })}
          >
            Configurar…
          </button>
          <button type="button" className="sidechat-btn" onClick={onClose}>
            Fechar
          </button>
        </div>
      </header>

      {!unlocked && (
        <p className="sidechat-error">
          Cofre bloqueado. Use Configurar… para desbloquear e definir tokens.
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
              if (def) setModel(def.defaultModel);
              setCustomModel('');
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
            value={modelOptions.includes(model) ? model : modelOptions[0]}
            onChange={(e) => {
              setModel(e.target.value);
              setCustomModel('');
            }}
          >
            {modelOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="sidechat-field">
        <label className="sidechat-label">Model id customizado (opcional)</label>
        <input
          className="sidechat-input"
          value={customModel}
          placeholder="ex: gpt-4.1"
          onChange={(e) => setCustomModel(e.target.value)}
        />
      </div>

      <MessageList
        messages={session?.messages ?? []}
        streamingText={streamingText || undefined}
      />

      {error && <p className="sidechat-error">{error}</p>}

      <Composer
        value={composer}
        disabled={sending || !unlocked}
        onChange={setComposer}
        onSend={() => void handleSend()}
      />
    </div>
  );
}
