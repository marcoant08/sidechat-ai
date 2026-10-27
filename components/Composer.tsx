import { PaperPlaneTilt } from '@phosphor-icons/react';
import { useEffect, useRef, type RefObject } from 'react';

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
  const innerRef = useRef<HTMLTextAreaElement | null>(null);
  // Último valor vindo da digitação do usuário: permite distinguir texto
  // digitado de texto injetado (seleção da página, restauração após erro).
  const typedRef = useRef<string | null>(null);

  useEffect(() => {
    if (value === typedRef.current) return; // mudança veio da digitação
    const el = textareaRef?.current ?? innerRef.current;
    if (!el) return;
    // Texto definido externamente (seleção da página, restauração após erro):
    // cursor sempre ao final, para digitar sem precisar arrastar até o fim.
    typedRef.current = value;
    el.focus({ preventScroll: true });
    const end = el.value.length;
    el.setSelectionRange(end, end);
    el.scrollTop = el.scrollHeight;
  }, [value, textareaRef, innerRef]);

  return (
    <div className="sidechat-composer">
      <textarea
        ref={(el) => {
          innerRef.current = el;
          if (textareaRef) textareaRef.current = el;
        }}
        className="sidechat-textarea sidechat-composer-input"
        value={value}
        disabled={disabled}
        rows={1}
        placeholder="Mensagem"
        aria-label="Mensagem"
        onChange={(e) => {
          typedRef.current = e.target.value;
          onChange(e.target.value);
        }}
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
