// Pieces shared by every shell: skip link and the persistent safety line (SPEC §3).
import { ShieldCheck } from "lucide-react";
import { cx } from "../../ui";

/**
 * "Skip to main content". Moves focus with script instead of an #anchor so it never changes the
 * hash route.
 */
export function SkipLink() {
  return (
    <a
      className="ui-skip-link"
      href="#main-content"
      onClick={(e) => {
        e.preventDefault();
        const main = document.getElementById("main-content");
        main?.focus();
        main?.scrollIntoView({ block: "start" });
      }}
    >
      Skip to main content
    </a>
  );
}

/** The one persistent safety statement, shown at the foot of every signed-in page. */
export function SafetyFooter({ className }: { className?: string }) {
  return (
    <footer className={cx("shell-safety", className)}>
      <p className="shell-safety__line">
        <ShieldCheck size={16} aria-hidden="true" />
        <span>
          Don’t stop or change any medicine without talking to the prescriber. If something feels like an emergency, call
          911.
        </span>
      </p>
      <p className="shell-safety__meta">Fictional demo data · Not medical advice · Runs entirely in your browser</p>
    </footer>
  );
}
