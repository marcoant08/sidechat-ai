import { useCallback, useEffect, useMemo, useState } from 'react';
import { sendToBackground } from '../../lib/messaging';
import {
  effectiveModelId,
  MODEL_DIGITAR,
  resolveModelSelection,
} from '../../lib/models';
import { PROVIDERS, type ProviderId } from '../../lib/providers/types';

export default function App() {
  const [configured, setConfigured] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [providersWithKey, setProvidersWithKey] = useState<ProviderId[]>([]);
  const [passphrase, setPassphrase] = useState('');
  const [passphraseConfirm, setPassphraseConfirm] = useState('');
  const [defaultProvider, setDefaultProvider] = useState<ProviderId>('openai');
  const [defaultModel, setDefaultModel] = useState('gpt-4o-mini');
  const [customModel, setCustomModel] = useState('');
  const [keyDrafts, setKeyDrafts] = useState<Record<ProviderId, string>>({
    openai: '',
    groq: '',
    anthropic: '',
    openrouter: '',
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const models = useMemo(() => {
    return PROVIDERS.find((p) => p.id === defaultProvider)?.models ?? [];
  }, [defaultProvider]);

  const refresh = useCallback(async () => {
    const vault = await sendToBackground({ type: 'VAULT_STATUS' });
    if (vault.type === 'VAULT_STATUS_RESULT') {
      setConfigured(vault.configured);
      setUnlocked(vault.unlocked);
      setProvidersWithKey(vault.providersWithKey);
    }
    const settings = await sendToBackground({ type: 'GET_SETTINGS' });
    if (settings.type === 'SETTINGS_RESULT') {
      setDefaultProvider(settings.defaultProvider);
      const known =
        PROVIDERS.find((p) => p.id === settings.defaultProvider)?.models ?? [];
      const resolved = resolveModelSelection(settings.defaultModel, known);
      setDefaultModel(resolved.selectValue);
      setCustomModel(resolved.customModel);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const showOk = (text: string) => {
    setError(null);
    setMessage(text);
  };

  const showErr = (text: string) => {
    setMessage(null);
    setError(text);
  };

  const handleSetup = async () => {
    if (passphrase !== passphraseConfirm) {
      showErr('As senhas não coincidem.');
      return;
    }
    const res = await sendToBackground({
      type: 'VAULT_SETUP',
      passphrase,
    });
    if (res.type === 'ERROR') {
      showErr(res.error);
      return;
    }
    setPassphrase('');
    setPassphraseConfirm('');
    showOk('Cofre criado e desbloqueado.');
    await refresh();
  };

  const handleUnlock = async () => {
    const res = await sendToBackground({
      type: 'VAULT_UNLOCK',
      passphrase,
    });
    if (res.type === 'ERROR') {
      showErr(res.error);
      return;
    }
    setPassphrase('');
    showOk('Cofre desbloqueado.');
    await refresh();
  };

  const handleLock = async () => {
    await sendToBackground({ type: 'VAULT_LOCK' });
    showOk('Cofre bloqueado.');
    await refresh();
  };

  const handleSaveKey = async (provider: ProviderId) => {
    const res = await sendToBackground({
      type: 'VAULT_SET_KEY',
      provider,
      apiKey: keyDrafts[provider] ?? '',
    });
    if (res.type === 'ERROR') {
      showErr(res.error);
      return;
    }
    setKeyDrafts((prev) => ({ ...prev, [provider]: '' }));
    showOk(`Key de ${provider} salva no cofre.`);
    await refresh();
  };

  const handleSaveSettings = async () => {
    const model = effectiveModelId(defaultModel, customModel);
    if (!model) {
      showErr('Informe o model id.');
      return;
    }
    const res = await sendToBackground({
      type: 'SAVE_SETTINGS',
      defaultProvider,
      defaultModel: model,
    });
    if (res.type === 'ERROR') {
      showErr(res.error);
      return;
    }
    showOk('Preferências salvas.');
    await refresh();
  };

  const handleClearSessions = async () => {
    if (!confirm('Apagar todo o histórico de sessões?')) return;
    const res = await sendToBackground({ type: 'CLEAR_SESSIONS' });
    if (res.type === 'ERROR') {
      showErr(res.error);
      return;
    }
    showOk('Histórico apagado.');
  };

  return (
    <div className="sidechat-root opts-wrap">
      <h1>🤖 sidechat-ai — Configurações</h1>
      <p className="sidechat-muted">
        Defina a senha mestre, API keys/tokens, provider e modelo padrão.
      </p>

      <div className="opts-warn">
        <strong>Privacidade:</strong> o texto que você seleciona e as mensagens
        do chat são enviados ao provider escolhido (OpenAI, Groq, Anthropic ou
        OpenRouter). Não selecione senhas, tokens ou dados sensíveis. As API
        keys ficam cifradas no navegador com sua senha mestre; após desbloquear,
        ficam em memória no service worker até o bloqueio ou suspensão.
      </div>

      <div className="opts-status">
        <span className={`opts-pill ${configured ? 'opts-pill-ok' : ''}`}>
          Cofre: {configured ? 'configurado' : 'não configurado'}
        </span>
        <span className={`opts-pill ${unlocked ? 'opts-pill-ok' : ''}`}>
          Status: {unlocked ? 'desbloqueado' : 'bloqueado'}
        </span>
        {PROVIDERS.map((p) => (
          <span
            key={p.id}
            className={`opts-pill ${providersWithKey.includes(p.id) ? 'opts-pill-ok' : ''}`}
          >
            {p.label}: {providersWithKey.includes(p.id) ? 'key ok' : 'sem key'}
          </span>
        ))}
      </div>

      {message && <p className="sidechat-muted">{message}</p>}
      {error && <p className="sidechat-error">{error}</p>}

      <section className="opts-card">
        <h2>1. Cofre (senha mestre)</h2>
        {!configured ? (
          <>
            <div className="sidechat-field">
              <label className="sidechat-label">Nova senha (mín. 8)</label>
              <input
                className="sidechat-input"
                type="password"
                autoComplete="new-password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
              />
            </div>
            <div className="sidechat-field">
              <label className="sidechat-label">Confirmar senha</label>
              <input
                className="sidechat-input"
                type="password"
                autoComplete="new-password"
                value={passphraseConfirm}
                onChange={(e) => setPassphraseConfirm(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="sidechat-btn sidechat-btn-primary"
              onClick={() => void handleSetup()}
            >
              Criar cofre
            </button>
          </>
        ) : (
          <>
            {!unlocked && (
              <div className="sidechat-field">
                <label className="sidechat-label">Senha mestre</label>
                <input
                  className="sidechat-input"
                  type="password"
                  autoComplete="current-password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                />
              </div>
            )}
            <div className="opts-actions">
              {!unlocked ? (
                <button
                  type="button"
                  className="sidechat-btn sidechat-btn-primary"
                  onClick={() => void handleUnlock()}
                >
                  Desbloquear
                </button>
              ) : (
                <button
                  type="button"
                  className="sidechat-btn"
                  onClick={() => void handleLock()}
                >
                  Bloquear
                </button>
              )}
            </div>
          </>
        )}
      </section>

      <section className="opts-card">
        <h2>2. API keys / tokens</h2>
        <p className="sidechat-muted">
          Cofre precisa estar desbloqueado para salvar keys. Os valores nunca
          são exibidos depois de salvos.
        </p>
        {PROVIDERS.map((p) => (
          <div key={p.id} className="opts-provider">
            <strong>{p.label}</strong>
            <div className="sidechat-field" style={{ marginTop: '0.4rem' }}>
              <label className="sidechat-label">
                API key {providersWithKey.includes(p.id) ? '(já salva — cole para substituir)' : ''}
              </label>
              <input
                className="sidechat-input"
                type="password"
                autoComplete="off"
                disabled={!unlocked}
                placeholder={unlocked ? 'sk-…' : 'Desbloqueie o cofre'}
                value={keyDrafts[p.id]}
                onChange={(e) =>
                  setKeyDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))
                }
              />
            </div>
            <button
              type="button"
              className="sidechat-btn"
              disabled={!unlocked}
              onClick={() => void handleSaveKey(p.id)}
            >
              Salvar key {p.label}
            </button>
          </div>
        ))}
      </section>

      <section className="opts-card">
        <h2>3. Provider e modelo padrão</h2>
        <div className="sidechat-field">
          <label className="sidechat-label">Provider padrão</label>
          <select
            className="sidechat-select"
            value={defaultProvider}
            onChange={(e) => {
              const id = e.target.value as ProviderId;
              setDefaultProvider(id);
              const def = PROVIDERS.find((p) => p.id === id);
              if (def) {
                setDefaultModel(def.defaultModel);
                setCustomModel('');
              }
            }}
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="sidechat-field">
          <label className="sidechat-label">Modelo padrão</label>
          <select
            className="sidechat-select"
            value={defaultModel}
            onChange={(e) => {
              const value = e.target.value;
              setDefaultModel(value);
              if (value !== MODEL_DIGITAR) {
                setCustomModel('');
              }
            }}
          >
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
            <option value={MODEL_DIGITAR}>Digitar</option>
          </select>
        </div>
        {defaultModel === MODEL_DIGITAR && (
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
        <button
          type="button"
          className="sidechat-btn sidechat-btn-primary"
          onClick={() => void handleSaveSettings()}
        >
          Salvar preferências
        </button>
      </section>

      <section className="opts-card">
        <h2>4. Dados locais</h2>
        <button
          type="button"
          className="sidechat-btn"
          onClick={() => void handleClearSessions()}
        >
          Limpar histórico de sessões
        </button>
      </section>
    </div>
  );
}
