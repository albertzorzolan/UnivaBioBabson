import { useEffect } from "react";
import type { Role, Source } from "./types";
type ToolContext = {
  registerTool: (
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: object;
      annotations: object;
      execute: (input: unknown) => unknown;
    },
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};
/** Optional browser-agent integration; the health-writing model receives no tools. */
export function useWebMCP(source: Source, role: Role | null, page: string) {
  useEffect(() => {
    const context = (document as Document & { modelContext?: ToolContext })
      .modelContext;
    if (!context?.registerTool) return;
    const lifetime = new AbortController();
    try {
      void Promise.resolve(
        context.registerTool(
          {
            name: "medwatch_demo_status",
            title: "Read MedWatch demo status",
            description:
              "Read the visible prototype role, page and fictional record counts. Does not reveal stories, change records, generate advice or export data.",
            inputSchema: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
            annotations: { readOnlyHint: true, untrustedContentHint: false },
            execute(input) {
              if (
                !input ||
                typeof input !== "object" ||
                Array.isArray(input) ||
                Object.keys(input).length
              )
                throw new Error("This tool accepts an empty object only.");
              return {
                prototype: true,
                role,
                page,
                confirmedDays: source.days.length,
                listedMedicines: source.medications.filter((m) => !m.endDate)
                  .length,
                sourceRevision: source.sourceRevision,
              };
            },
          },
          { signal: lifetime.signal },
        ),
      ).catch(() => {});
    } catch {
      /* Experimental integration is optional; core UI remains available. */
    }
    return () => lifetime.abort();
  }, [source, role, page]);
}
