// Writes an evaluation results file only when the results themselves changed. Timestamp fields are ignored in the
// comparison (see below), so re-running the test suite does not rewrite committed results (and the dates cited in the docs stay true).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// Wall-clock timings vary run to run too, so they are also left out of the comparison.
const TIMESTAMP_KEYS = new Set(["generatedAt", "ranAt", "latency"]);

function withoutTimestamps(value: unknown): string {
  return JSON.stringify(value, (key, v) => (TIMESTAMP_KEYS.has(key) ? undefined : v));
}

/** Returns true when the file was (re)written. */
export function writeResultsIfChanged(path: string, report: unknown): boolean {
  if (existsSync(path)) {
    try {
      if (withoutTimestamps(JSON.parse(readFileSync(path, "utf8"))) === withoutTimestamps(report)) return false;
    } catch {
      // unreadable or corrupt: rewrite below
    }
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(report, null, 2) + "\n");
  return true;
}
