// ARIA tabs (APG pattern): roving tabindex, arrow keys move focus and select, Home/End jump.
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "../cx";

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
  /** Optional count/badge after the label, e.g. number of open findings. */
  badge?: ReactNode;
  disabled?: boolean;
}

export interface TabsProps<T extends string> {
  /** Unique prefix that links tabs to panels (use the same value in <TabPanel idBase>). */
  idBase: string;
  /** Accessible name of the tab list. */
  label: string;
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  /** "underline" (default, page sections) or "pill" (compact toggles inside cards). */
  variant?: "underline" | "pill";
  /** Set false when the tabs filter content in place instead of switching <TabPanel>s. */
  withPanels?: boolean;
  className?: string;
}

/** Tab list. Render one <TabPanel> per item with the same idBase. */
export function Tabs<T extends string>({
  idBase,
  label,
  items,
  value,
  onChange,
  variant = "underline",
  withPanels = true,
  className,
}: TabsProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = items.map((t, i) => (t.disabled ? -1 : i)).filter((i) => i >= 0);

  const focusAt = (index: number) => {
    refs.current[index]?.focus();
    onChange(items[index].id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const pos = enabled.indexOf(index);
    let next: number | null = null;
    if (e.key === "ArrowRight") next = enabled[(pos + 1) % enabled.length];
    else if (e.key === "ArrowLeft") next = enabled[(pos - 1 + enabled.length) % enabled.length];
    else if (e.key === "Home") next = enabled[0];
    else if (e.key === "End") next = enabled[enabled.length - 1];
    if (next != null) {
      e.preventDefault();
      focusAt(next);
    }
  };

  return (
    <div role="tablist" aria-label={label} className={cx("ui-tabs", `ui-tabs--${variant}`, className)}>
      {items.map((t, i) => {
        const selected = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${idBase}-tab-${t.id}`}
            aria-selected={selected}
            // Only the selected panel is rendered, so only the selected tab points at one.
            aria-controls={withPanels && selected ? `${idBase}-panel-${t.id}` : undefined}
            tabIndex={selected ? 0 : -1}
            disabled={t.disabled}
            className={cx("ui-tab", selected && "is-selected")}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            <span>{t.label}</span>
            {t.badge != null && <span className="ui-tab__badge ui-num">{t.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}

export interface TabPanelProps<T extends string> {
  idBase: string;
  id: T;
  value: T;
  children: ReactNode;
  className?: string;
}

/** Panel for one tab. Inactive panels are not rendered (keeps heavy charts out of the DOM). */
export function TabPanel<T extends string>({ idBase, id, value, children, className }: TabPanelProps<T>) {
  if (id !== value) return null;
  return (
    <div
      role="tabpanel"
      id={`${idBase}-panel-${id}`}
      aria-labelledby={`${idBase}-tab-${id}`}
      tabIndex={0}
      className={cx("ui-tabpanel", className)}
    >
      {children}
    </div>
  );
}
