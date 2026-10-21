import { Plus } from '@phosphor-icons/react';
import type { ChatSession } from '../lib/storage/sessions';

interface Props {
  sessions: ChatSession[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
}

export function SessionPicker({
  sessions,
  currentId,
  onSelect,
  onCreate,
}: Props) {
  const isNew = currentId === null;

  return (
    <div className="sidechat-session-row">
      <select
        className="sidechat-select"
        value={currentId ?? ''}
        onChange={(e) => {
          const value = e.target.value;
          if (!value) {
            onCreate();
            return;
          }
          onSelect(value);
        }}
      >
        <option value="">Nova sessão</option>
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.title}
          </option>
        ))}
      </select>
      {isNew && (
        <button
          type="button"
          className="sidechat-btn sidechat-btn-icon"
          title="Nova sessão"
          aria-label="Nova sessão"
          onClick={onCreate}
        >
          <Plus size={18} weight="bold" />
        </button>
      )}
    </div>
  );
}
