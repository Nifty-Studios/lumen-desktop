// Small UI pieces. No borders or focus rings anywhere: depth comes from glass, shadow and
// soft fills.

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { IconName } from "@lumen/shared/icons";
import { Icon } from "./Icon";

// ---- popover ----------------------------------------------------------------------------

interface PopoverProps {
  anchor: HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
  align?: "start" | "end";
  width?: number;
}

/** A floating surface under its anchor; closes on outside click or Escape. */
export function Popover({ anchor, onClose, children, align = "start", width }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const a = anchor.getBoundingClientRect();
    const box = ref.current.getBoundingClientRect();
    let left = align === "end" ? a.right - box.width : a.left;
    left = Math.max(8, Math.min(left, window.innerWidth - box.width - 8));
    let top = a.bottom + 6;
    if (top + box.height > window.innerHeight - 8) top = Math.max(8, a.top - box.height - 6);
    setPos({ top, left });
  }, [anchor, align]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node) || anchor?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={ref}
      className="surface animate-pop fixed z-50 rounded-2xl p-1.5"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width }}
    >
      {children}
    </div>,
    document.body,
  );
}

export function MenuItem({ icon, label, hint, danger, onClick }: { icon: IconName; label: string; hint?: string; danger?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13.5px] transition-colors hover:bg-hover ${danger ? "text-danger" : ""}`}
    >
      <Icon name={icon} size={16} className={danger ? "" : "text-muted"} />
      <span className="flex-1">{label}</span>
      {hint && <span className="text-xs text-faint">{hint}</span>}
    </button>
  );
}

// ---- controls ---------------------------------------------------------------------------

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; icon?: IconName }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl bg-hover p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] transition-all ${
            o.value === value ? "bg-surface text-fg shadow-[0_2px_8px_-2px_var(--shadow)]" : "text-muted hover:text-fg"
          }`}
        >
          {o.icon && <Icon name={o.icon} size={15} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-10 flex-none rounded-full transition-colors ${checked ? "bg-accent" : "bg-active"}`}
    >
      <span
        className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.25)] transition-transform"
        style={{ transform: checked ? "translateX(16px)" : undefined }}
      />
    </button>
  );
}

export function Button({
  children,
  onClick,
  icon,
  tone = "soft",
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  icon?: IconName;
  tone?: "primary" | "soft" | "danger";
  disabled?: boolean;
}) {
  const tones = {
    primary: "bg-accent text-accent-fg hover:brightness-110",
    soft: "bg-hover text-fg hover:bg-active",
    danger: "bg-hover text-danger hover:bg-active",
  };
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-[13.5px] font-medium transition-all disabled:opacity-50 ${tones[tone]}`}
    >
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  );
}

/** A text field: a soft fill that deepens on focus, never an outline. */
export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl bg-hover px-3.5 py-2.5 text-[14px] transition-colors placeholder:text-faint focus:bg-active ${props.className ?? ""}`}
    />
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md bg-hover px-1.5 py-0.5 font-sans text-[11px] text-muted">{children}</kbd>;
}

// ---- toasts -----------------------------------------------------------------------------

interface Toast {
  id: number;
  text: string;
  icon: IconName;
  tone: "info" | "error";
}

const ToastContext = createContext<(text: string, opts?: { icon?: IconName; tone?: Toast["tone"] }) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback((text: string, opts: { icon?: IconName; tone?: Toast["tone"] } = {}) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, icon: opts.icon ?? (opts.tone === "error" ? "triangle-alert" : "circle-check"), tone: opts.tone ?? "info" }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), opts.tone === "error" ? 7000 : 4200);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex flex-col items-center gap-2">
        {toasts.map((t) => (
          <div key={t.id} className="surface animate-pop flex max-w-[520px] items-center gap-2.5 rounded-2xl px-4 py-2.5 text-[13.5px]">
            <Icon name={t.icon} size={16} className={t.tone === "error" ? "text-danger" : "text-accent"} />
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
