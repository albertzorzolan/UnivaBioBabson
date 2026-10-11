// Toasts: short confirmations ("Check-in saved"). Announced politely, never cover the main action:
// they sit bottom-right on desktop and above the bottom navigation on phones, pause on hover/focus,
// and auto-dismiss after 4.5 s (errors stay until dismissed).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { cx } from "../cx";
import { toneIcon, type Tone } from "./Badge";

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: Extract<Tone, "neutral" | "success" | "info" | "caution" | "attention">;
  action?: { label: string; onClick: () => void };
  /** Milliseconds before auto-dismiss; 0 = stay until closed. Default 4500 (attention: 0). */
  durationMs?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

interface ToastApi {
  show: (opts: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Provides useToast(). Mount once near the root (App does). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((t) => t.id !== id)), []);
  const show = useCallback((opts: ToastOptions) => {
    const id = nextId.current++;
    // Keep at most 3 on screen; the oldest goes first.
    setItems((xs) => [...xs.slice(-2), { ...opts, id }]);
    return id;
  }, []);

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <section className="ui-toasts" aria-label="Notifications">
        <div aria-live="polite" aria-relevant="additions" className="ui-toasts__list">
          {items.map((t) => (
            <ToastView key={t.id} item={t} dismiss={dismiss} />
          ))}
        </div>
      </section>
    </ToastContext.Provider>
  );
}

function ToastView({ item, dismiss }: { item: ToastItem; dismiss: (id: number) => void }) {
  const tone = item.tone ?? "neutral";
  const { id } = item;
  const onDismiss = useCallback(() => dismiss(id), [dismiss, id]);
  const duration = item.durationMs ?? (tone === "attention" ? 0 : 4500);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!duration || paused) return;
    const t = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(t);
  }, [duration, paused, onDismiss]);

  return (
    <div
      className={cx("ui-toast", `ui-toast--${tone}`)}
      role={tone === "attention" ? "alert" : undefined}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className="ui-toast__icon" aria-hidden="true">
        {toneIcon(tone === "neutral" ? "success" : tone, 18)}
      </span>
      <div className="ui-toast__text">
        <p className="ui-toast__title">{item.title}</p>
        {item.description && <p className="ui-toast__description">{item.description}</p>}
      </div>
      {item.action && (
        <button
          type="button"
          className="ui-toast__action"
          onClick={() => {
            item.action?.onClick();
            onDismiss();
          }}
        >
          {item.action.label}
        </button>
      )}
      <button type="button" className="ui-toast__close" aria-label="Dismiss notification" onClick={onDismiss}>
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

/** Show a toast: const toast = useToast(); toast.show({ title: "Check-in saved", tone: "success" }). */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
