// Modal and Drawer, both built on the native <dialog> element (top layer + inert page for free).
// We add: controlled `open`, Esc → onClose (parent state stays the source of truth), Tab wrapping,
// initial focus, and returning focus to the element that opened the dialog.
import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";
import { cx } from "../cx";
import { focusableIn, useFocusTrap, useReturnFocus } from "../hooks";

interface DialogBaseProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** One line under the title; also used as the dialog's accessible description. */
  description?: ReactNode;
  children: ReactNode;
  /** Sticky action row at the bottom. */
  footer?: ReactNode;
  /** Element to focus on open (defaults to the first focusable control, else the dialog itself). */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Accessible label of the close button. */
  closeLabel?: string;
  /** Hide the × button (use only when the footer offers a clear way out). */
  hideClose?: boolean;
  className?: string;
}

interface DialogShellProps extends DialogBaseProps {
  kind: "modal" | "drawer";
  size: string;
  role?: "dialog" | "alertdialog";
  eyebrow?: ReactNode;
}

function DialogShell({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  initialFocusRef,
  closeLabel = "Close",
  hideClose,
  className,
  kind,
  size,
  role,
  eyebrow,
}: DialogShellProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();
  useReturnFocus(open);
  useFocusTrap(ref, open);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      dlg.showModal();
      // Modals (forms, confirmations) focus their first control; drawers (long evidence lists) focus the
      // panel itself so the title is read first and nothing scrolls. initialFocusRef overrides both.
      const body = dlg.querySelector<HTMLElement>(".ui-dialog__body");
      const firstControl = kind === "modal" && body ? focusableIn(body)[0] : undefined;
      (initialFocusRef?.current ?? firstControl ?? dlg).focus({ preventScroll: true });
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open, initialFocusRef, kind]);

  // Close on unmount so a dialog never leaves the page inert.
  useEffect(() => {
    const dlg = ref.current;
    return () => {
      if (dlg?.open) dlg.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={cx("ui-dialog", `ui-dialog--${kind}`, `ui-dialog--${size}`, className)}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      role={role === "alertdialog" ? "alertdialog" : undefined}
      tabIndex={-1}
      onCancel={(e) => {
        // Esc: keep React in charge of the open state.
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // Click on the backdrop (the dialog element itself, outside the panel) closes.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open && (
        <div className="ui-dialog__panel">
          <header className="ui-dialog__header">
            <div className="ui-dialog__titles">
              {eyebrow && <p className="ui-eyebrow">{eyebrow}</p>}
              <h2 id={titleId} className="ui-dialog__title">
                {title}
              </h2>
              {description && (
                <p id={descId} className="ui-dialog__description">
                  {description}
                </p>
              )}
            </div>
            {!hideClose && (
              <button type="button" className="ui-icon-btn ui-icon-btn--ghost ui-icon-btn--md ui-dialog__close" aria-label={closeLabel} onClick={onClose}>
                <X size={20} aria-hidden="true" />
              </button>
            )}
          </header>
          {/* Focusable so keyboard users can scroll a long body (axe scrollable-region-focusable). */}
          <div className="ui-dialog__body" tabIndex={0} role="region" aria-labelledby={titleId}>
            {children}
          </div>
          {footer && <footer className="ui-dialog__footer">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

export interface ModalProps extends DialogBaseProps {
  size?: "sm" | "md" | "lg";
  /** Use "alertdialog" for confirmations of destructive actions. */
  role?: "dialog" | "alertdialog";
}

/** Centered modal dialog: focus trap, Esc to close, focus returns to the trigger. */
export function Modal({ size = "md", role, ...rest }: ModalProps) {
  return <DialogShell kind="modal" size={size} role={role} {...rest} />;
}

export interface DrawerProps extends DialogBaseProps {
  /** Width on desktop; on phones the drawer becomes a bottom sheet. */
  size?: "md" | "lg";
  /** Small label above the title, e.g. "Evidence". */
  eyebrow?: ReactNode;
}

/** Side panel (bottom sheet on phones) for evidence and record lists; same focus rules as Modal. */
export function Drawer({ size = "md", ...rest }: DrawerProps) {
  return <DialogShell kind="drawer" size={size} {...rest} />;
}
