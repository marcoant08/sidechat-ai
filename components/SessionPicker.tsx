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
  return (
    <div className="sidechat-session-row">
      <select
        className="sidechat-select"
        value={currentId ?? ''}
        onChange={(e) => onSelect(e.target.value)}
      >
        <option value="" disabled>
          Selecione uma sessão
        </option>
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.title}
          </option>
        ))}
      </select>
      <button type="button" className="sidechat-btn" onClick={onCreate}>
        Nova
      </button>
    </div>
  );
}
