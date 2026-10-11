// Error boundary + Suspense wrapper for each routed view. A crash in one screen (or a failed lazy chunk
// after a redeploy) shows a calm recovery card inside the shell instead of a blank page.
import { Component, Suspense, type ErrorInfo, type ReactNode } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { Skeleton } from "../../ui";

interface State {
  error: Error | null;
}

class Boundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Local-only diagnostics; never includes user text in URLs or remote logs.
    console.error("Kinwise view error", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="ui-card ui-card--pad-lg view-error" role="alert">
        <span className="view-error__icon" aria-hidden="true">
          <TriangleAlert size={22} />
        </span>
        <div>
          <h1 className="view-error__title" tabIndex={-1} data-route-focus="">
            This screen couldn’t be shown
          </h1>
          <p className="view-error__text">
            Your records are still stored in this browser. Try again, or pick another page from the menu.
          </p>
          <button type="button" className="ui-btn ui-btn--secondary ui-btn--md" onClick={() => this.setState({ error: null })}>
            <RotateCcw size={16} aria-hidden="true" />
            <span>Try again</span>
          </button>
        </div>
      </div>
    );
  }
}

/** Loading state shown while a lazily loaded view arrives. */
export function ViewLoading() {
  return (
    <div className="view-loading">
      <Skeleton height="2.75rem" width="min(28rem, 80%)" label="Loading page…" />
      <Skeleton lines={2} label="" />
      <div className="view-loading__grid" aria-hidden="true">
        <span className="ui-skeleton__block" />
        <span className="ui-skeleton__block" />
        <span className="ui-skeleton__block" />
      </div>
    </div>
  );
}

/** Wrap a routed view: <ViewBoundary key={path}>…</ViewBoundary> resets the boundary on navigation. */
export function ViewBoundary({ children }: { children: ReactNode }) {
  return (
    <Boundary>
      <Suspense fallback={<ViewLoading />}>{children}</Suspense>
    </Boundary>
  );
}
