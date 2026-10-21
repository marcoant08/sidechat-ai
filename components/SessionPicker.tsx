import { Plus } from '@phosphor-icons/react';
import { useId } from 'react';
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
  const selectId = useId();

  return (
    <div className="sidechat-field" style={{ marginBottom: 0 }}>
      <label className="sidechat-label" htmlFor={selectId}>
        Sessão
      </label>
      <div className="sidechat-session-row">
        <select
          id={selectId}
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
    </div>
  );
}
