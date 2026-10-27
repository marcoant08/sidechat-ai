import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { ChatPopup } from '../../components/ChatPopup';
import { SelectionButton } from '../../components/SelectionButton';

interface Anchor {
  x: number;
  y: number;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

function clampPopupPosition(
  x: number,
  y: number,
  width: number,
  height: number,
): Anchor {
  const margin = 8;
  const maxX = Math.max(margin, window.innerWidth - width - margin);
  const maxY = Math.max(margin, window.innerHeight - height - margin);
  return {
    x: Math.min(maxX, Math.max(margin, x)),
    y: Math.min(maxY, Math.max(margin, y)),
  };
}

export default function App() {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [open, setOpen] = useState(false);
  const [popupPos, setPopupPos] = useState<Anchor>({ x: 24, y: 24 });
  const popupWrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const draggingRef = useRef(false);

  const closePopup = useCallback(() => {
    setOpen(false);
    setSelectedText('');
    setAnchor(null);
    dragRef.current = null;
    draggingRef.current = false;
  }, []);

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
        closePopup();
      }
    };

    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [closePopup, open]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => hideButton();
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [hideButton, open]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      if (draggingRef.current) return;
      const wrap = popupWrapRef.current;
      if (!wrap) return;
      const path = e.composedPath();
      if (path.includes(wrap)) return;
      closePopup();
    };

    // Próximo tick: evita fechar no mesmo clique que abriu o popup.
    const timer = window.setTimeout(() => {
      document.addEventListener('pointerdown', onPointerDown, true);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [closePopup, open]);

  useEffect(() => {
    if (!open) return;

    const onPointerMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      const wrap = popupWrapRef.current;
      if (!drag || !wrap || e.pointerId !== drag.pointerId) return;

      const next = clampPopupPosition(
        drag.originX + (e.clientX - drag.startX),
        drag.originY + (e.clientY - drag.startY),
        wrap.offsetWidth,
        wrap.offsetHeight,
      );
      setPopupPos(next);
    };

    const endDrag = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      dragRef.current = null;
      window.setTimeout(() => {
        draggingRef.current = false;
      }, 0);
    };

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', endDrag);
    document.addEventListener('pointercancel', endDrag);
    return () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', endDrag);
      document.removeEventListener('pointercancel', endDrag);
    };
  }, [open]);

  /**
   * O popup muda de tamanho (cofre bloqueado → chat) e a janela pode ser
   * redimensionada. Reencuadra o popup para que nada fique fora da tela, sem
   * o usuário precisar arrastar.
   */
  useLayoutEffect(() => {
    if (!open) return;
    const wrap = popupWrapRef.current;
    if (!wrap) return;

    const fit = () => {
      setPopupPos((prev) => {
        const next = clampPopupPosition(
          prev.x,
          prev.y,
          wrap.offsetWidth,
          wrap.offsetHeight,
        );
        return next.x === prev.x && next.y === prev.y ? prev : next;
      });
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(wrap);
    window.addEventListener('resize', fit);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [open]);

  const handleHeaderPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      draggingRef.current = true;
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: popupPos.x,
        originY: popupPos.y,
      };
    },
    [popupPos.x, popupPos.y],
  );

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
          ref={popupWrapRef}
          style={{
            position: 'fixed',
            left: popupPos.x,
            top: popupPos.y,
            zIndex: 2147483647,
          }}
        >
          <ChatPopup
            selectedText={selectedText}
            onClose={closePopup}
            onHeaderPointerDown={handleHeaderPointerDown}
          />
        </div>
      )}
    </>
  );
}
