// Shown at the top of both shells when the record in this browser could not be read and the demo record was
// loaded instead (loadStore status "recovered"). The unreadable text is not lost: loadStore keeps a copy under
// "kinwise.v1.store.unreadable-<time>", which this notice offers as a download. Dismissing hides it for this visit.
import { Download, X } from "lucide-react";
import { useStore } from "../StoreProvider";
import { Button, Callout, IconButton } from "../../ui";
import "./shellExtras.css";

/** "kinwise.v1.store.unreadable-2026-10-17T22:40:00.000Z" → "kinwise-unreadable-2026-10-17T22-40-00.json" */
function fileNameFor(key: string): string {
  const stamp = key.split("unreadable-")[1]?.replace(/\.\d+Z$/, "").replace(/:/g, "-") ?? "copy";
  return `kinwise-unreadable-${stamp}.json`;
}

function download(name: string, text: string) {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    /* download blocked: the copy stays in this browser */
  }
}

export function RecoveryNotice() {
  const { recovery, dismissRecovery, readStored } = useStore();
  if (!recovery) return null;
  const copy = recovery.backupKey ? readStored(recovery.backupKey) : null;
  return (
    <div className="shell-recovery">
      <Callout
        tone="caution"
        title="Saved data couldn’t be read, so the demo record was loaded."
        action={<IconButton label="Dismiss this message" icon={<X size={20} aria-hidden="true" />} onClick={dismissRecovery} />}
      >
        {recovery.backupKey && copy !== null ? (
          <>
            <p>A copy of the unreadable data was kept in this browser.</p>
            <Button
              size="sm"
              variant="secondary"
              className="shell-recovery__download"
              iconLeft={<Download size={16} aria-hidden="true" />}
              onClick={() => download(fileNameFor(recovery.backupKey!), copy)}
            >
              Download the copy
            </Button>
          </>
        ) : (
          // No copy: the write failed (storage full or blocked) or it can no longer be read back.
          <p>A copy of it couldn’t be kept in this browser.</p>
        )}
      </Callout>
    </div>
  );
}
