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
      title="Sidechat AI"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      AI
    </button>
  );
}
