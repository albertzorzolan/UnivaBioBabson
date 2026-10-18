// Shown at the top of both shells, above the page:
//  - when the record in this browser could not be read and the demo record was loaded instead (loadStore status
//    "recovered"). The unreadable text is not lost: loadStore keeps a copy under "kinwise.v1.store.unreadable-<time>",
//    which this notice offers as a download.
//  - when the demo record was built for an earlier day and has been changed since (loadStore "staleDemo"), so its
//    "this week" and "5 days ago" no longer line up with today. An untouched one is rebuilt silently instead.
// Dismissing either one hides it for this visit.
import { CalendarClock, Download, RotateCcw, X } from "lucide-react";
import { useStore } from "../StoreProvider";
import { parseDate } from "../../model/dates";
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

/** "Saturday, October 17" */
function longDay(date: string): string {
  return parseDate(date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

/** "Demo dates are from …": offers the same rebuild as Settings › Restore the demo record. */
function StaleDemoNotice() {
  const { staleDemo, dismissStaleDemo, resetDemo } = useStore();
  if (!staleDemo) return null;
  return (
    <div className="shell-recovery">
      <Callout
        tone="info"
        icon={<CalendarClock size={20} aria-hidden="true" />}
        title={`Demo dates are from ${longDay(staleDemo.builtFor)}.`}
        action={<IconButton label="Dismiss this message" icon={<X size={20} aria-hidden="true" />} onClick={dismissStaleDemo} />}
      >
        <p>
          “This week” and “days ago” no longer match today. Refreshing rebuilds the demo for today and removes the
          check-ins, notes and decisions added since.
        </p>
        <Button
          size="sm"
          variant="secondary"
          className="shell-recovery__download"
          iconLeft={<RotateCcw size={16} aria-hidden="true" />}
          onClick={() => {
            resetDemo();
            // The button disappears with the notice: put focus at the top of the page rather than lose it.
            document.getElementById("main-content")?.focus();
          }}
        >
          Refresh demo dates
        </Button>
      </Callout>
    </div>
  );
}

export function RecoveryNotice() {
  return (
    <>
      <StaleDemoNotice />
      <UnreadableNotice />
    </>
  );
}

function UnreadableNotice() {
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
