// Architecture diagram for How it works: an inline SVG on wide containers and a stacked list on narrow ones
// (CSS container query), both drawn from the same node data. Colours come from theme tokens via classes,
// so the diagram is legible in light and dark themes.
import { useId } from "react";
import { cx } from "../../ui";

type NodeKind = "input" | "code" | "person" | "ai" | "output";

interface ArchNode {
  id: string;
  kind: NodeKind;
  title: string;
  lines: string[];
  /** Column (0–4) and row ("a" | "b" capture/analysis, "c" language & review). */
  col: number;
  row: "a" | "b" | "c" | "ab";
}

const NODES: ArchNode[] = [
  { id: "story", kind: "input", title: "Her own words", lines: ["a free-text check-in,", "kept verbatim"], col: 0, row: "a" },
  { id: "nlp", kind: "code", title: "Clinical NLP", lines: ["lexicon + ConText:", "negation · timing · who"], col: 1, row: "a" },
  { id: "diary", kind: "person", title: "Confirmed diary", lines: ["she accepts each answer;", "skipped is never “no”"], col: 2, row: "a" },
  { id: "timeline", kind: "code", title: "Timeline statistics", lines: ["before vs after changes,", "Fisher · Mann–Whitney"], col: 3, row: "a" },
  { id: "meds", kind: "input", title: "Medication list", lines: ["brands, generics, OTC,", "start and stop dates"], col: 0, row: "b" },
  { id: "match", kind: "code", title: "Drug matching", lines: ["brand → generic, combos;", "guesses need a “yes”"], col: 1, row: "b" },
  { id: "review", kind: "code", title: "Medication review", lines: ["Beers 2023 · ACB · FRIDs,", "cascades · cited rules"], col: 3, row: "b" },
  { id: "evidence", kind: "code", title: "Evidence package", lines: ["every fact becomes one", "code-written sentence", "with a stable ID"], col: 4, row: "ab" },
  { id: "llm", kind: "ai", title: "On-device LLM", lines: ["optional · WebGPU;", "wording only, cites IDs"], col: 0, row: "c" },
  { id: "verify", kind: "code", title: "Claim verifier", lines: ["numbers, names and", "banned phrases checked"], col: 1, row: "c" },
  { id: "human", kind: "person", title: "Human review", lines: ["Alex edits and approves;", "nothing is sent for her"], col: 2, row: "c" },
  { id: "brief", kind: "output", title: "Visit brief", lines: ["one printable page", "with sources"], col: 3, row: "c" },
  { id: "fhir", kind: "output", title: "FHIR R4 bundle", lines: ["meds, observations,", "flagged issues"], col: 4, row: "c" },
];

// Geometry (viewBox units).
const W = 200;
const H = 100;
const COL_X = [20, 260, 500, 740, 980];
const ROW_Y = { a: 56, b: 204, c: 404 } as const;
const EVIDENCE_H = 152;
const EVIDENCE_Y = 104;

function box(n: ArchNode) {
  const x = COL_X[n.col];
  if (n.row === "ab") return { x, y: EVIDENCE_Y, w: W, h: EVIDENCE_H };
  return { x, y: ROW_Y[n.row], w: W, h: H };
}

/** Arrows: [path, label?, labelX, labelY, dashed?]. Coordinates follow the layout above. */
const EDGES: { d: string; dashed?: boolean; label?: { text: string; x: number; y: number; anchor?: "start" | "middle" } }[] = [
  { d: "M222 106 H256" },
  { d: "M462 106 H496" },
  { d: "M702 106 H736" },
  { d: "M942 130 H976" },
  { d: "M222 254 H256" },
  { d: "M462 278 H736", label: { text: "matched ingredients", x: 600, y: 268, anchor: "middle" } },
  { d: "M600 158 V230 H736", label: { text: "falls recorded", x: 612, y: 200 } },
  { d: "M942 230 H976" },
  { d: "M1080 258 V334 H120 V400" },
  { d: "M600 334 V400", dashed: true, label: { text: "template brief · no AI needed", x: 612, y: 382 } },
  { d: "M222 454 H256" },
  { d: "M462 454 H496" },
  { d: "M702 454 H736" },
  { d: "M942 454 H976" },
];

const KIND_LABEL: Record<NodeKind, string> = {
  input: "Input",
  code: "Decided by code",
  person: "A person confirms",
  ai: "Optional on-device AI",
  output: "Output",
};

/** Stages for the narrow (stacked) version, in reading order. */
const STAGES: { label: string; ids: string[] }[] = [
  { label: "Capture", ids: ["story", "nlp", "diary", "meds", "match"] },
  { label: "Deterministic analysis", ids: ["timeline", "review", "evidence"] },
  { label: "Language & review", ids: ["llm", "verify", "human"] },
  { label: "For the visit", ids: ["brief", "fhir"] },
];

export function HowArchitecture() {
  const titleId = useId();
  const descId = useId();
  const markerId = `arrow-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const byId = new Map(NODES.map((n) => [n.id, n]));

  return (
    <div className="pub-how-arch">
      <svg
        className="pub-how-arch__svg"
        viewBox="0 0 1200 600"
        role="img"
        aria-labelledby={`${titleId} ${descId}`}
      >
        <title id={titleId}>Kinwise architecture</title>
        <desc id={descId}>
          Her story goes through clinical language processing into a diary she confirms. The diary and the matched
          medication list feed two deterministic engines, timeline statistics and the medication review. Their results
          become an evidence package. An optional on-device language model drafts wording from that package; a claim
          verifier checks every sentence; a person reviews the result, which becomes the visit brief and a FHIR R4
          bundle. A template writes the brief when no model is loaded.
        </desc>
        <defs>
          <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" className="pub-how-arch__arrowhead" />
          </marker>
        </defs>

        <rect x="4" y="4" width="1192" height="318" rx="22" className="pub-how-arch__band" />
        <text x="28" y="36" className="pub-how-arch__band-label">
          1 · DECIDED BY CODE — CAPTURE AND ANALYSIS
        </text>
        <rect x="4" y="346" width="1192" height="250" rx="22" className="pub-how-arch__band pub-how-arch__band--ai" />
        <text x="140" y="378" className="pub-how-arch__band-label">
          2 · OPTIONAL AI — ALWAYS VERIFIED, ALWAYS REVIEWED
        </text>

        {EDGES.map((e, i) => (
          <g key={i}>
            <path d={e.d} className={cx("pub-how-arch__edge", e.dashed && "is-dashed")} markerEnd={`url(#${markerId})`} />
            {e.label && (
              <text x={e.label.x} y={e.label.y} textAnchor={e.label.anchor ?? "start"} className="pub-how-arch__edge-label">
                {e.label.text}
              </text>
            )}
          </g>
        ))}

        {NODES.map((n) => {
          const b = box(n);
          const lineY = n.row === "ab" ? b.y + 66 : b.y + 60;
          return (
            <g key={n.id} className={cx("pub-how-arch__node", `pub-how-arch__node--${n.kind}`)}>
              <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="14" />
              <text x={b.x + 16} y={b.y + (n.row === "ab" ? 38 : 34)} className="pub-how-arch__title">
                {n.title}
              </text>
              {n.lines.map((l, i) => (
                <text key={i} x={b.x + 16} y={lineY + i * 20} className="pub-how-arch__line">
                  {l}
                </text>
              ))}
            </g>
          );
        })}

        <text x="28" y="560" className="pub-how-arch__note">
          A sentence that fails verification is dropped; if fewer than two survive, the template brief is used instead.
        </text>
      </svg>

      <ol className="pub-how-arch__stack" aria-label="Kinwise architecture, step by step">
        {STAGES.map((s) => (
          <li key={s.label} className="pub-how-arch__stage">
            <p className="pub-how-arch__stage-label">{s.label}</p>
            <ul role="list">
              {s.ids.map((id) => {
                const n = byId.get(id)!;
                return (
                  <li key={id} className={cx("pub-how-arch__chip", `pub-how-arch__chip--${n.kind}`)}>
                    <span className="pub-how-arch__chip-title">{n.title}</span>
                    <span className="pub-how-arch__chip-text">{n.lines.join(" ")}</span>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>

      <ul className="pub-how-arch__legend" role="list" aria-label="Legend">
        {(Object.keys(KIND_LABEL) as NodeKind[]).map((k) => (
          <li key={k}>
            <span className={cx("pub-how-arch__swatch", `pub-how-arch__swatch--${k}`)} aria-hidden="true" />
            {KIND_LABEL[k]}
          </li>
        ))}
      </ul>
    </div>
  );
}
