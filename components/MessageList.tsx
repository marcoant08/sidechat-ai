import type { SessionMessage } from '../lib/storage/sessions';

interface Props {
  messages: SessionMessage[];
  streamingText?: string;
}

export function MessageList({ messages, streamingText }: Props) {
  return (
    <div className="sidechat-messages">
      {messages.length === 0 && !streamingText && (
        <p className="sidechat-muted">
          Nenhuma mensagem ainda. Edite o texto e clique em Enviar.
        </p>
      )}
      {messages.map((m, i) => (
        <div
          key={`${m.createdAt}-${i}`}
          className={`sidechat-bubble sidechat-bubble-${m.role}`}
        >
          <div className="sidechat-bubble-role">
            {m.role === 'user' ? 'Você' : 'Assistente'}
          </div>
          <p className="sidechat-msg">{m.content}</p>
        </div>
      ))}
      {streamingText ? (
        <div className="sidechat-bubble sidechat-bubble-assistant">
          <div className="sidechat-bubble-role">Assistente</div>
          <p className="sidechat-msg">{streamingText}</p>
        </div>
      ) : null}
    </div>
  );
}
