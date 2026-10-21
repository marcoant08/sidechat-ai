import { PaperPlaneTilt } from '@phosphor-icons/react';

interface Props {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
}

export function Composer({ value, disabled, onChange, onSend }: Props) {
  return (
    <div className="sidechat-composer">
      <textarea
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
            if (!disabled && value.trim()) onSend();
          }
        }}
      />
      <button
        type="button"
        className="sidechat-composer-send"
        disabled={disabled || !value.trim()}
        title="Enviar"
        aria-label="Enviar"
        onClick={onSend}
      >
        <PaperPlaneTilt size={18} weight="fill" />
      </button>
    </div>
  );
}
