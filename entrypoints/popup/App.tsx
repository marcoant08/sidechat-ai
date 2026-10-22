import { useEffect, useState } from 'react';
import { sendToBackground } from '../../lib/messaging';
import { PROVIDERS, type ProviderId } from '../../lib/providers/types';
import './App.css';

export default function App() {
  const [configured, setConfigured] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [providersWithKey, setProvidersWithKey] = useState<ProviderId[]>([]);

  useEffect(() => {
    void (async () => {
      const res = await sendToBackground({ type: 'VAULT_STATUS' });
      if (res.type === 'VAULT_STATUS_RESULT') {
        setConfigured(res.configured);
        setUnlocked(res.unlocked);
        setProvidersWithKey(res.providersWithKey);
      }
    })();
  }, []);

  return (
    <div className="popup-root sidechat-root">
      <h1>🤖 sidechat-ai</h1>
      <p className="sidechat-muted">
        Selecione texto em qualquer página, clique no 🤖 e envie no chat.
      </p>

      <div className="popup-status">
        <div className="popup-status-row">
          <span className="popup-status-label">Cofre</span>
          <strong>
            {!configured
              ? 'não configurado'
              : unlocked
                ? 'desbloqueado'
                : 'bloqueado'}
          </strong>
        </div>
        {unlocked && (
          <ul className="popup-status-list">
            {PROVIDERS.map((p) => {
              const ready = providersWithKey.includes(p.id);
              return (
                <li key={p.id} className="popup-status-row">
                  <span className="popup-status-label">{p.label}</span>
                  <span
                    className={
                      ready
                        ? 'popup-tag popup-tag-ok'
                        : 'popup-tag popup-tag-missing'
                    }
                  >
                    {ready ? 'Configurado' : 'Não configurado'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <button
        type="button"
        className="sidechat-btn sidechat-btn-primary"
        onClick={() => void sendToBackground({ type: 'OPEN_OPTIONS' })}
      >
        Configurar
      </button>
    </div>
  );
}
