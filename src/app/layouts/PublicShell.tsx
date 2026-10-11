// Minimal frame for public pages other than Welcome (How it works, design-system gallery).
import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { href, homeFor } from "../router";
import { useSession } from "../session";
import { useShellAttribute } from "./useDocumentSettings";
import { SkipLink } from "./ShellParts";
import { DemoDataChip, Logo, cx } from "../../ui";

export function PublicShell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  useShellAttribute("public");
  const role = useSession();
  return (
    <div className="pub-shell">
      <SkipLink />
      <header className="pub-header">
        <div className={cx("pub-header__inner", wide && "is-wide")}>
          <a href={href("/")} className="pub-header__brand" aria-label="Kinwise — Welcome">
            <Logo size={32} />
          </a>
          <div className="pub-header__end">
            <DemoDataChip />
            <a className="ui-btn ui-btn--secondary ui-btn--sm" href={href(role ? homeFor(role) : "/")}>
              {role && <ArrowLeft size={16} aria-hidden="true" />}
              <span>{role ? "Back to the app" : "Try the demo"}</span>
              {!role && <ArrowRight size={16} aria-hidden="true" />}
            </a>
          </div>
        </div>
      </header>
      <main id="main-content" className={cx("pub-main", wide && "is-wide")} tabIndex={-1}>
        {children}
      </main>
      <footer className="pub-footer">
        <p>Fictional data · Student prototype for UnivaBio 2026 · Not medical advice</p>
      </footer>
    </div>
  );
}
