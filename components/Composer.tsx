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
        className="sidechat-textarea"
        value={value}
        disabled={disabled}
        placeholder="Escreva sua mensagem… (só envia ao clicar em Enviar)"
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
        className="sidechat-btn sidechat-btn-primary"
        disabled={disabled || !value.trim()}
        onClick={onSend}
      >
        Enviar
      </button>
    </div>
  );
}
