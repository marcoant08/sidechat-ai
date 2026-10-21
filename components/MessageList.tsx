import { Check } from '@phosphor-icons/react';
import { useMemo } from 'react';
import type { SessionMessage } from '../lib/storage/sessions';

interface Props {
  messages: SessionMessage[];
  streamingText?: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function formatMessageTime(timestamp: number, now = Date.now()): string {
  const ageMs = Math.max(0, now - timestamp);
  const days = Math.floor(ageMs / MS_PER_DAY);

  if (days >= 7) {
    return `${Math.floor(days / 7)}w`;
  }
  if (days >= 1) {
    return `${days}d`;
  }

  return new Date(timestamp).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function MessageList({ messages, streamingText }: Props) {
  const wallpaperUrl = useMemo(
    () => browser.runtime.getURL('/chat-wallpaper.png'),
    [],
  );

  return (
    <div
      className="sidechat-messages"
      style={{ backgroundImage: `url("${wallpaperUrl}")` }}
    >
      {messages.length === 0 && !streamingText && (
        <p className="sidechat-messages-empty">
          Nenhuma mensagem ainda. Edite o texto e clique em Enviar.
        </p>
      )}
      {messages.map((m, i) => (
        <div
          key={`${m.createdAt}-${i}`}
          className={`sidechat-msg-row sidechat-msg-row-${m.role}`}
        >
          <div className={`sidechat-bubble sidechat-bubble-${m.role}`}>
            {m.role === 'assistant' && (
              <div className="sidechat-bubble-name">Assistente</div>
            )}
            <p className="sidechat-msg">{m.content}</p>
            <div className="sidechat-bubble-meta">
              <span className="sidechat-bubble-time">
                {formatMessageTime(m.createdAt)}
              </span>
              {m.role === 'user' && (
                <Check
                  className="sidechat-bubble-check"
                  size="1em"
                  weight="bold"
                  aria-hidden
                />
              )}
            </div>
          </div>
        </div>
      ))}
      {streamingText ? (
        <div className="sidechat-msg-row sidechat-msg-row-assistant">
          <div className="sidechat-bubble sidechat-bubble-assistant">
            <div className="sidechat-bubble-name">Assistente</div>
            <p className="sidechat-msg">{streamingText}</p>
            <div className="sidechat-bubble-meta">
              <span className="sidechat-bubble-time">
                {formatMessageTime(Date.now())}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
