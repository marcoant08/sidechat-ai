interface Props {
  x: number;
  y: number;
  onClick: () => void;
}

export function SelectionButton({ x, y, onClick }: Props) {
  return (
    <button
      type="button"
      className="sidechat-fab"
      style={{ left: x, top: y }}
      title="sidechat-ai"
      aria-label="Abrir sidechat-ai"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      🤖
    </button>
  );
}
