import {
  FloppyDisk,
  Key,
  LockKey,
  LockKeyOpen,
  Plus,
  Trash,
  ArrowCounterClockwise,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { sendToBackground } from '../../lib/messaging';
import {
  effectiveModelId,
  MODEL_DIGITAR,
  resolveModelSelection,
} from '../../lib/models';
import { PROVIDERS, type ProviderId } from '../../lib/providers/types';
import {
  defaultProviderModels,
  getModelsForProvider,
  type ProviderModelLists,
} from '../../lib/storage/settings';

function emptyKeyDrafts(): Record<ProviderId, string> {
  return {
    openai: '',
    groq: '',
    anthropic: '',
    openrouter: '',
  };
}

export default function App() {
  const [configured, setConfigured] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [providersWithKey, setProvidersWithKey] = useState<ProviderId[]>([]);
  const [passphrase, setPassphrase] = useState('');
  const [passphraseConfirm, setPassphraseConfirm] = useState('');
  const [defaultProvider, setDefaultProvider] = useState<ProviderId>('openai');
  const [defaultModel, setDefaultModel] = useState('gpt-4o-mini');
  const [customModel, setCustomModel] = useState('');
  const [providerModels, setProviderModels] = useState<ProviderModelLists>(
    () => defaultProviderModels(),
  );
  const [modelsTab, setModelsTab] = useState<ProviderId>('openai');
  const [newModelDraft, setNewModelDraft] = useState('');
  const [keyDrafts, setKeyDrafts] = useState(emptyKeyDrafts);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const models = useMemo(
    () => getModelsForProvider(defaultProvider, providerModels),
    [defaultProvider, providerModels],
  );

  const tabModels = useMemo(
    () => getModelsForProvider(modelsTab, providerModels),
    [modelsTab, providerModels],
  );

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
      setProviderModels(settings.providerModels);
      const known = getModelsForProvider(
        settings.defaultProvider,
        settings.providerModels,
      );
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
      providerModels,
    });
    if (res.type === 'ERROR') {
      showErr(res.error);
      return;
    }
    showOk('Preferências e listas de modelos salvas.');
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

  const addModelToTab = () => {
    const model = newModelDraft.trim();
    if (!model) {
      showErr('Digite o id do modelo para adicionar.');
      return;
    }
    const current = getModelsForProvider(modelsTab, providerModels);
    if (current.includes(model)) {
      showErr('Esse modelo já está na lista.');
      return;
    }
    setProviderModels({
      ...providerModels,
      [modelsTab]: [...current, model],
    });
    setNewModelDraft('');
    showOk(`Modelo adicionado em ${modelsTab}. Lembre de salvar.`);
  };

  const removeModelFromTab = (model: string) => {
    const next = getModelsForProvider(modelsTab, providerModels).filter(
      (item) => item !== model,
    );
    if (next.length === 0) {
      showErr('Mantenha ao menos um modelo na lista.');
      return;
    }
    setProviderModels({ ...providerModels, [modelsTab]: next });
  };

  const resetTabModels = () => {
    const defaults = defaultProviderModels();
    setProviderModels((prev) => ({
      ...prev,
      [modelsTab]: [...defaults[modelsTab]],
    }));
    showOk(`Lista de ${modelsTab} restaurada ao padrão. Lembre de salvar.`);
  };

  const resetAllModels = () => {
    setProviderModels(defaultProviderModels());
    showOk('Todas as listas foram restauradas ao padrão. Lembre de salvar.');
  };

  return (
    <div className="opts-page">
      <header className="opts-hero">
        <div className="opts-brand">
          <span className="opts-brand-mark" aria-hidden>
            🤖
          </span>
          <div>
            <p className="opts-eyebrow">sidechat-ai</p>
            <h1>Configurações</h1>
          </div>
        </div>
        <p className="opts-lead">
          Desbloqueie o cofre, salve as API keys e escolha o provider/modelo
          padrão. Ajuste também as opções que aparecem nos selects de cada
          provider.
        </p>
      </header>

      <div className="opts-status" aria-label="Status do cofre">
        <span className={`opts-pill ${configured ? 'opts-pill-ok' : ''}`}>
          Cofre {configured ? 'configurado' : 'não configurado'}
        </span>
        <span className={`opts-pill ${unlocked ? 'opts-pill-ok' : ''}`}>
          {unlocked ? 'Desbloqueado' : 'Bloqueado'}
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

      {(message || error) && (
        <div
          className={error ? 'opts-banner opts-banner-error' : 'opts-banner'}
          role="status"
        >
          {error ?? message}
        </div>
      )}

      <aside className="opts-privacy">
        <strong>Privacidade</strong>
        <p>
          Texto selecionado e mensagens vão para o provider escolhido. Não
          selecione senhas ou dados sensíveis. As API keys ficam cifradas no
          navegador com a senha mestre.
        </p>
      </aside>

      <div className="opts-layout">
        <div className="opts-col">
          <section className="opts-card opts-card-compact">
            <div className="opts-card-head">
              <LockKey size={20} weight="duotone" />
              <div>
                <h2>Cofre</h2>
                <p>Senha mestre para cifrar e liberar as API keys.</p>
              </div>
            </div>

            {!configured ? (
              <>
                <div className="opts-field">
                  <label htmlFor="opts-pass-new">Nova senha (mín. 8)</label>
                  <div className="opts-control">
                    <input
                      id="opts-pass-new"
                      className="opts-input"
                      type="password"
                      size={1}
                      autoComplete="new-password"
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                    />
                  </div>
                </div>
                <div className="opts-field">
                  <label htmlFor="opts-pass-confirm">Confirmar senha</label>
                  <div className="opts-control">
                    <input
                      id="opts-pass-confirm"
                      className="opts-input"
                      type="password"
                      size={1}
                      autoComplete="new-password"
                      value={passphraseConfirm}
                      onChange={(e) => setPassphraseConfirm(e.target.value)}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="opts-btn opts-btn-primary"
                  onClick={() => void handleSetup()}
                >
                  Criar cofre
                </button>
              </>
            ) : (
              <>
                {!unlocked && (
                  <div className="opts-field">
                    <label htmlFor="opts-pass">Senha mestre</label>
                    <div className="opts-control">
                      <input
                        id="opts-pass"
                        className="opts-input"
                        type="password"
                        size={1}
                        autoComplete="current-password"
                        value={passphrase}
                        onChange={(e) => setPassphrase(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void handleUnlock();
                        }}
                      />
                    </div>
                  </div>
                )}
                <div className="opts-actions">
                  {!unlocked ? (
                    <button
                      type="button"
                      className="opts-btn opts-btn-primary"
                      onClick={() => void handleUnlock()}
                    >
                      <LockKeyOpen size={16} weight="bold" />
                      Desbloquear
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="opts-btn"
                      onClick={() => void handleLock()}
                    >
                      <LockKey size={16} weight="bold" />
                      Bloquear
                    </button>
                  )}
                </div>
              </>
            )}
          </section>

          <section className="opts-card">
            <div className="opts-card-head">
              <FloppyDisk size={20} weight="duotone" />
              <div>
                <h2>Padrões do chat</h2>
                <p>Provider e modelo usados ao abrir uma nova conversa.</p>
              </div>
            </div>

            <div className="opts-defaults">
              <div className="opts-field">
                <label htmlFor="opts-provider">Provider padrão</label>
                <div className="opts-control">
                  <select
                    id="opts-provider"
                    className="opts-input"
                    value={defaultProvider}
                    onChange={(e) => {
                      const id = e.target.value as ProviderId;
                      setDefaultProvider(id);
                      const known = getModelsForProvider(id, providerModels);
                      const preferred =
                        PROVIDERS.find((p) => p.id === id)?.defaultModel ??
                        known[0];
                      if (preferred && known.includes(preferred)) {
                        setDefaultModel(preferred);
                        setCustomModel('');
                      } else if (known[0]) {
                        setDefaultModel(known[0]);
                        setCustomModel('');
                      } else {
                        setDefaultModel(MODEL_DIGITAR);
                        setCustomModel(preferred ?? '');
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
              </div>
              <div className="opts-field">
                <label htmlFor="opts-model">Modelo padrão</label>
                <div className="opts-control">
                  <select
                    id="opts-model"
                    className="opts-input"
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
              </div>
              {defaultModel === MODEL_DIGITAR && (
                <div className="opts-field opts-field-span">
                  <label htmlFor="opts-custom-model">Model id</label>
                  <div className="opts-control">
                    <input
                      id="opts-custom-model"
                      className="opts-input"
                      size={1}
                      value={customModel}
                      placeholder="ex: gpt-4.1"
                      onChange={(e) => setCustomModel(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        <section className="opts-card">
          <div className="opts-card-head">
            <Key size={20} weight="duotone" />
            <div>
              <h2>API keys</h2>
              <p>
                Desbloqueie o cofre para salvar. Os valores não são mostrados
                depois.
              </p>
            </div>
          </div>

          <div className="opts-key-grid">
            {PROVIDERS.map((p) => {
              const hasKey = providersWithKey.includes(p.id);
              return (
                <div
                  key={p.id}
                  className={
                    hasKey
                      ? 'opts-key-card opts-key-card-ok'
                      : 'opts-key-card'
                  }
                >
                  <div className="opts-key-title">
                    <strong>{p.label}</strong>
                    <span
                      className={hasKey ? 'opts-dot opts-dot-ok' : 'opts-dot'}
                    >
                      {hasKey ? 'salva' : 'ausente'}
                    </span>
                  </div>
                  <label className="opts-sr" htmlFor={`key-${p.id}`}>
                    API key {p.label}
                  </label>
                  <div className="opts-control">
                    <input
                      id={`key-${p.id}`}
                      className="opts-input"
                      type="password"
                      size={1}
                      autoComplete="off"
                      disabled={!unlocked}
                      placeholder={
                        unlocked
                          ? hasKey
                            ? 'Cole para substituir'
                            : 'sk-…'
                          : 'Desbloqueie o cofre'
                      }
                      value={keyDrafts[p.id]}
                      onChange={(e) =>
                        setKeyDrafts((prev) => ({
                          ...prev,
                          [p.id]: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <button
                    type="button"
                    className="opts-btn"
                    disabled={!unlocked}
                    onClick={() => void handleSaveKey(p.id)}
                  >
                    Salvar key
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        <section className="opts-card opts-card-wide">
          <div className="opts-card-head">
            <div>
              <h2>Listas de modelos por provider</h2>
              <p>
                Edite os valores que aparecem no select de modelo do chat e
                desta página. Um id por linha na prática: adicione ou remova
                items e salve.
              </p>
            </div>
          </div>

          <div className="opts-tabs" role="tablist" aria-label="Providers">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={modelsTab === p.id}
                className={
                  modelsTab === p.id ? 'opts-tab opts-tab-active' : 'opts-tab'
                }
                onClick={() => {
                  setModelsTab(p.id);
                  setNewModelDraft('');
                }}
              >
                {p.label}
                <span className="opts-tab-count">
                  {getModelsForProvider(p.id, providerModels).length}
                </span>
              </button>
            ))}
          </div>

          <ul className="opts-model-list">
            {tabModels.map((model) => (
              <li key={model}>
                <code>{model}</code>
                <button
                  type="button"
                  className="opts-icon-btn"
                  aria-label={`Remover ${model}`}
                  onClick={() => removeModelFromTab(model)}
                >
                  <Trash size={16} />
                </button>
              </li>
            ))}
          </ul>

          <div className="opts-add-row">
            <div className="opts-control">
              <input
                className="opts-input"
                size={1}
                value={newModelDraft}
                placeholder={`Novo model id para ${PROVIDERS.find((p) => p.id === modelsTab)?.label}`}
                onChange={(e) => setNewModelDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addModelToTab();
                }}
              />
            </div>
            <button
              type="button"
              className="opts-btn"
              onClick={addModelToTab}
            >
              <Plus size={16} weight="bold" />
              Adicionar
            </button>
          </div>

          <div className="opts-actions">
            <button type="button" className="opts-btn" onClick={resetTabModels}>
              <ArrowCounterClockwise size={16} />
              Restaurar este provider
            </button>
            <button type="button" className="opts-btn" onClick={resetAllModels}>
              Restaurar todos
            </button>
          </div>
        </section>

        <section className="opts-card opts-card-wide opts-save-bar">
          <div>
            <h2>Salvar alterações</h2>
            <p>Grava provider/modelo padrão e as listas de modelos.</p>
          </div>
          <button
            type="button"
            className="opts-btn opts-btn-primary"
            onClick={() => void handleSaveSettings()}
          >
            <FloppyDisk size={16} weight="bold" />
            Salvar preferências
          </button>
        </section>

        <section className="opts-card">
          <div className="opts-card-head">
            <Trash size={20} weight="duotone" />
            <div>
              <h2>Dados locais</h2>
              <p>Apaga o histórico de sessões guardado neste navegador.</p>
            </div>
          </div>
          <button
            type="button"
            className="opts-btn opts-btn-danger"
            onClick={() => void handleClearSessions()}
          >
            Limpar histórico de sessões
          </button>
        </section>
      </div>
    </div>
  );
}
