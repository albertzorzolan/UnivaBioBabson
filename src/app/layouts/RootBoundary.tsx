// Last-resort recovery screen. If the stored record can't be loaded (corrupt data, a failed migration, a bug
// in a provider), show a calm page that lets the family save a copy of what is stored and start over —
// instead of a blank screen.
import { Component, type ErrorInfo, type ReactNode } from "react";
import { STORAGE_KEY } from "../../model/store";

interface State {
  error: Error | null;
}

function storedCopyUrl(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? URL.createObjectURL(new Blob([raw], { type: "application/json" })) : null;
  } catch {
    return null;
  }
}

export class RootBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Kinwise could not start", error, info.componentStack);
  }

  private startOver = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage blocked: a reload will use the in-memory demo */
    }
    window.location.hash = "#/";
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    const copy = storedCopyUrl();
    return (
      <main className="root-error" id="main-content">
        <div className="root-error__card">
          <p className="ui-eyebrow">Kinwise</p>
          <h1 className="root-error__title">Kinwise couldn’t open the records stored in this browser</h1>
          <p className="root-error__text">
            Nothing was sent anywhere. You can save a copy of what is stored, then start again with the fictional demo
            record.
          </p>
          <div className="root-error__actions">
            {copy && (
              <a className="ui-btn ui-btn--secondary ui-btn--md" href={copy} download="kinwise-stored-record.json">
                Save a copy of the stored data
              </a>
            )}
            <button type="button" className="ui-btn ui-btn--primary ui-btn--md" onClick={this.startOver}>
              Start over with the demo record
            </button>
          </div>
        </div>
      </main>
    );
  }
}
