import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "destructive";
  disabled?: boolean;
  hidden?: boolean;
}

export interface ContextMenuSeparator {
  separator: true;
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator;

function isSeparator(entry: ContextMenuEntry): entry is ContextMenuSeparator {
  return "separator" in entry;
}

interface ContextMenuProps {
  items: ContextMenuEntry[];
  x: number;
  y: number;
  onClose: () => void;
}

function ContextMenuPopup({ items, x, y, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  const [pos, setPos] = useState({ x, y });
  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const nx = x + rect.width > window.innerWidth ? window.innerWidth - rect.width - 4 : x;
    const ny = y + rect.height > window.innerHeight ? window.innerHeight - rect.height - 4 : y;
    setPos({ x: nx, y: ny });
  }, [x, y]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const visible = items.filter((item) => !isSeparator(item) ? !item.hidden : true);

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[100] min-w-[180px] rounded-lg border border-border bg-popover/95 backdrop-blur-xl shadow-xl py-1 animate-in fade-in-0 zoom-in-95"
      style={{ left: pos.x, top: pos.y }}
    >
      {visible.map((entry, i) => {
        if (isSeparator(entry)) {
          return <div key={i} className="my-1 h-px bg-border" />;
        }
        return (
          <button
            key={i}
            onClick={() => { entry.onClick(); onClose(); }}
            disabled={entry.disabled}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-default ${
              entry.variant === "destructive"
                ? "text-destructive hover:bg-destructive/10"
                : "text-foreground hover:bg-accent"
            }`}
          >
            {entry.icon && <span className="w-4 h-4 shrink-0 flex items-center justify-center">{entry.icon}</span>}
            {entry.label}
          </button>
        );
      })}
    </div>,
    document.body
  );
}

export function useContextMenu() {
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuEntry[] } | null>(null);

  const show = useCallback((e: React.MouseEvent, items: ContextMenuEntry[]) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, items });
  }, []);

  const close = useCallback(() => setMenu(null), []);

  const element = menu ? (
    <ContextMenuPopup items={menu.items} x={menu.x} y={menu.y} onClose={close} />
  ) : null;

  return { show, close, element };
}
