import { useCallback, useEffect, useState } from 'react';
import { ChatPopup } from '../../components/ChatPopup';
import { SelectionButton } from '../../components/SelectionButton';

interface Anchor {
  x: number;
  y: number;
}

export default function App() {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [open, setOpen] = useState(false);
  const [popupPos, setPopupPos] = useState<Anchor>({ x: 24, y: 24 });

  const hideButton = useCallback(() => {
    if (!open) setAnchor(null);
  }, [open]);

  useEffect(() => {
    const onMouseUp = () => {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? '';
      if (!text || open) {
        if (!open) setAnchor(null);
        return;
      }
      const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
      const rect = range?.getBoundingClientRect();
      if (!rect) return;
      setSelectedText(text);
      setAnchor({
        x: rect.left + rect.width / 2,
        y: rect.top,
      });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setAnchor(null);
      }
    };

    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => hideButton();
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [hideButton, open]);

  return (
    <>
      {anchor && !open && (
        <SelectionButton
          x={anchor.x}
          y={anchor.y}
          onClick={() => {
            setPopupPos({
              x: Math.min(anchor.x, window.innerWidth - 400),
              y: Math.min(anchor.y + 12, window.innerHeight - 540),
            });
            setOpen(true);
            setAnchor(null);
          }}
        />
      )}
      {open && (
        <div
          style={{
            position: 'fixed',
            left: Math.max(12, popupPos.x),
            top: Math.max(12, popupPos.y),
            zIndex: 2147483647,
          }}
        >
          <ChatPopup
            selectedText={selectedText}
            onClose={() => {
              setOpen(false);
              setSelectedText('');
            }}
          />
        </div>
      )}
    </>
  );
}
