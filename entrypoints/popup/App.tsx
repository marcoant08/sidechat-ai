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
      <h1>Sidechat AI</h1>
      <p className="sidechat-muted">
        Selecione texto em qualquer página, clique no botão AI e envie no chat.
      </p>

      <div className="popup-status">
        <div>
          Cofre:{' '}
          <strong>
            {!configured
              ? 'não configurado'
              : unlocked
                ? 'desbloqueado'
                : 'bloqueado'}
          </strong>
        </div>
        <ul>
          {PROVIDERS.map((p) => (
            <li key={p.id}>
              {p.label}:{' '}
              {providersWithKey.includes(p.id) ? 'key ok' : 'sem key'}
            </li>
          ))}
        </ul>
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
