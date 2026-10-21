import { useMemo } from 'react';
import type { SessionMessage } from '../lib/storage/sessions';

interface Props {
  messages: SessionMessage[];
  streamingText?: string;
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
            <p className="sidechat-msg">{m.content}</p>
          </div>
        </div>
      ))}
      {streamingText ? (
        <div className="sidechat-msg-row sidechat-msg-row-assistant">
          <div className="sidechat-bubble sidechat-bubble-assistant">
            <p className="sidechat-msg">{streamingText}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
