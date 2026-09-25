import { useState } from "react";
import { Check, LoaderCircle, Sparkles, X } from "lucide-react";
import { cancelGeneration, loadModel, useAI } from "./ai";
import { Button, Badge } from "./ui";
import type { AIResult } from "./types";
export function AIStatus() {
  const ai = useAI();
  const [error, setError] = useState("");
  return (
    <div className="ai-status">
      <div className="row">
        <span className="round-icon">
          <Sparkles size={19} />
        </span>
        <div>
          <strong>On-device AI</strong>
          <small>
            {ai.status === "ready"
              ? "Model loaded · ready for your next draft"
              : ai.status === "generating"
                ? "Creating a draft on your device…"
                : ai.status === "loading"
                  ? "Loading local model…"
                  : "A private writing assistant for your records"}
          </small>
        </div>
        {(ai.status === "idle" || ai.status === "error") && (
          <Button
            variant="secondary"
            onClick={() => {
              setError("");
              void loadModel().catch((e) => setError(e.message));
            }}
          >
            Load local AI
          </Button>
        )}
        {ai.status === "ready" && (
          <Badge>
            <Check size={12} /> Ready
          </Badge>
        )}
        {(ai.status === "loading" || ai.status === "generating") && (
          <LoaderCircle className="spin" size={20} />
        )}
      </div>
      {ai.status === "loading" && (
        <>
          <progress value={ai.progress} max={1} />
          <small className="load-detail">{ai.message}</small>
        </>
      )}
      {ai.status === "generating" && (
        <button className="text-button" onClick={cancelGeneration}>
          <X size={14} /> Cancel generation
        </button>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
export function DraftMeta({ result }: { result: AIResult }) {
  return (
    <div className="draft-meta">
      <Badge>
        <Sparkles size={12} /> AI draft · review required
      </Badge>
      <small>
        Generated locally in {(result.durationMs / 1000).toFixed(1)}s
      </small>
    </div>
  );
}
