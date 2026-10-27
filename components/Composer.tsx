import { PaperPlaneTilt } from '@phosphor-icons/react';
import type { RefObject } from 'react';

interface Props {
  value: string;
  /** Desabilita o campo (ex.: contexto da extensão morto). */
  disabled?: boolean;
  /** Envio em andamento: bloqueia o botão, mas mantém o campo editável. */
  busy?: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
  /** Exposto para o popup controlar o foco do campo de mensagem. */
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
}

export function Composer({
  value,
  disabled,
  busy,
  onChange,
  onSend,
  textareaRef,
}: Props) {
  const canSend = !disabled && !busy && value.trim().length > 0;

  return (
    <div className="sidechat-composer">
      <textarea
        ref={textareaRef}
        className="sidechat-textarea sidechat-composer-input"
        value={value}
        disabled={disabled}
        rows={1}
        placeholder="Mensagem"
        aria-label="Mensagem"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (canSend) onSend();
          }
        }}
      />
      <button
        type="button"
        className="sidechat-composer-send"
        disabled={!canSend}
        title="Enviar"
        aria-label="Enviar"
        onClick={onSend}
      >
        <PaperPlaneTilt size={18} weight="fill" />
      </button>
    </div>
  );
}
