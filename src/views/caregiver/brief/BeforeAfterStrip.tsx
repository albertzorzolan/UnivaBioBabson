// The brief's mini chart: a print-friendly, day-by-day strip around the lead medication change. One row per diary
// item (filled square = recorded, hollow = answered "no", dot = no entry — unanswered days are never drawn as "no"),
// a marker on the change day, and before → after counts with answered-day denominators. Monochrome + shape-coded so it
// survives black-and-white printing; inline SVG (no chart library) so it renders identically on screen and paper.
import type { StripChart, StripCell } from "./compose";
import type { CSSProperties } from "react";
import { formatShort } from "../../../model/dates";
import { ScrollRegion } from "./ScrollRegion";

const LABEL_W = 92;
const COUNT_W = 92;
const CELL = 8;
const ROW_H = 19;
const TOP = 26;
const BOTTOM = 18;

function Cell({ x, y, kind }: { x: number; y: number; kind: StripCell }) {
  const s = CELL - 2;
  const cx = x + CELL / 2;
  const cy = y + ROW_H / 2;
  switch (kind) {
    case "yes":
      return <rect className="cg-vb-strip__yes" x={cx - s / 2} y={cy - s / 2} width={s} height={s} rx={1} />;
    case "no":
      return <rect className="cg-vb-strip__no" x={cx - s / 2 + 0.5} y={cy - s / 2 + 0.5} width={s - 1} height={s - 1} rx={1} />;
    case "fall":
      return <path className="cg-vb-strip__yes" d={`M${cx} ${cy - 4} L${cx + 4} ${cy + 3.5} L${cx - 4} ${cy + 3.5} Z`} />;
    case "near":
      return <path className="cg-vb-strip__no cg-vb-strip__near" d={`M${cx} ${cy - 3.5} L${cx + 3.5} ${cy + 3} L${cx - 3.5} ${cy + 3} Z`} />;
    default:
      return <circle className="cg-vb-strip__none" cx={cx} cy={cy} r={1} />;
  }
}

function describe(chart: StripChart): string {
  const verb = chart.event === "started" ? "start" : "stop";
  const rows = chart.rows
    .map((r) => `${r.label}: ${r.before.positive} of ${r.before.answered} answered days before, ${r.after.positive} of ${r.after.answered} after`)
    .join("; ");
  return `Day-by-day diary around the ${verb} of ${chart.medName} on ${formatShort(chart.eventDate)}. ${rows}.`;
}

export function BeforeAfterStrip({ chart, idPrefix }: { chart: StripChart; idPrefix: string }) {
  const n = chart.days.length;
  const width = LABEL_W + n * CELL + COUNT_W;
  const height = TOP + chart.rows.length * ROW_H + BOTTOM;
  const gridX = LABEL_W;
  const eventX = gridX + chart.eventIndex * CELL;
  const titleId = `${idPrefix}-strip-title`;
  const verb = chart.event === "started" ? "started" : "stopped";
  return (
    <figure className="cg-vb-strip">
      {/* On a phone the strip keeps a readable size and scrolls sideways instead of shrinking (brief.css). */}
      <ScrollRegion className="cg-vb-strip-scroll" label="Before and after chart (scrolls sideways)">
        <svg
          className="cg-vb-strip__svg"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-labelledby={titleId}
          preserveAspectRatio="xMinYMin meet"
          style={{ "--strip-w": `${width}px` } as CSSProperties}
        >
          <title id={titleId}>{describe(chart)}</title>
          {/* After-period wash */}
          <rect className="cg-vb-strip__after-bg" x={eventX} y={TOP - 4} width={(n - chart.eventIndex) * CELL} height={chart.rows.length * ROW_H + 8} rx={3} />
          {/* Period labels + change marker */}
          <text className="cg-vb-strip__period" x={gridX} y={TOP - 9}>
            Before
          </text>
          <text className="cg-vb-strip__period cg-vb-strip__period--after" x={eventX + 4} y={TOP - 9}>
            After · {verb} {formatShort(chart.eventDate)}
          </text>
          <line className="cg-vb-strip__marker" x1={eventX} x2={eventX} y1={TOP - 18} y2={TOP + chart.rows.length * ROW_H + 4} />
          <text className="cg-vb-strip__colhead" x={gridX + n * CELL + 10} y={TOP - 9}>
            Before
          </text>
          <text className="cg-vb-strip__colhead" x={gridX + n * CELL + 52} y={TOP - 9}>
            After
          </text>
          {chart.rows.map((r, ri) => {
            const y = TOP + ri * ROW_H;
            return (
              <g key={r.key}>
                <text className="cg-vb-strip__label" x={0} y={y + ROW_H / 2 + 3.5}>
                  {r.label}
                </text>
                {r.cells.map((c, i) => (
                  <Cell key={i} x={gridX + i * CELL} y={y} kind={c} />
                ))}
                <text className="cg-vb-strip__count" x={gridX + n * CELL + 10} y={y + ROW_H / 2 + 3.5}>
                  {r.before.positive}/{r.before.answered}
                </text>
                <text className="cg-vb-strip__count cg-vb-strip__count--after" x={gridX + n * CELL + 52} y={y + ROW_H / 2 + 3.5}>
                  {r.after.positive}/{r.after.answered}
                </text>
              </g>
            );
          })}
          {/* Axis dates */}
          <text className="cg-vb-strip__axis" x={gridX} y={height - 4}>
            {formatShort(chart.days[0])}
          </text>
          <text className="cg-vb-strip__axis" x={gridX + n * CELL} y={height - 4} textAnchor="end">
            {formatShort(chart.days[n - 1])}
          </text>
        </svg>
      </ScrollRegion>
      <figcaption className="cg-vb-strip__legend">
        <span>
          <svg width="9" height="9" aria-hidden="true">
            <rect className="cg-vb-strip__yes" x="1" y="1" width="7" height="7" rx="1" />
          </svg>
          recorded
        </span>
        <span>
          <svg width="9" height="9" aria-hidden="true">
            <rect className="cg-vb-strip__no" x="1.5" y="1.5" width="6" height="6" rx="1" />
          </svg>
          answered “no”
        </span>
        <span>
          <svg width="9" height="9" aria-hidden="true">
            <circle className="cg-vb-strip__none" cx="4.5" cy="4.5" r="1.2" />
          </svg>
          no entry
        </span>
        {chart.rows.some((r) => r.key === "falls") && (
          <span>
            <svg width="9" height="9" aria-hidden="true">
              <path className="cg-vb-strip__yes" d="M4.5 0.5 L8.5 8 L0.5 8 Z" />
            </svg>
            fall ·{" "}
            <svg width="9" height="9" aria-hidden="true">
              <path className="cg-vb-strip__no cg-vb-strip__near" d="M4.5 1 L8 7.8 L1 7.8 Z" />
            </svg>
            near-fall
          </span>
        )}
        <span className="cg-vb-strip__note">Counts are answered days.</span>
      </figcaption>
    </figure>
  );
}
