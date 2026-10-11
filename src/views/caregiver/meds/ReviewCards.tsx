// Summary cards at the top of the Medication review: anticholinergic burden (ACB meter + contributors),
// fall-risk medicines with the diary's falls, and the AGS Beers summary.
import { Brain, Footprints, ListChecks } from "lucide-react";
import type { Finding, Medication, MedReview } from "../../../model/types";
import { KB, getDrug, getSource } from "../../../kb";
import { BEERS_CATEGORIES } from "../../../engine/meds";
import type { DiaryFacts } from "../../../engine/meds/diary";
import { formatShort } from "../../../model/dates";
import { Card, CardHeader, EvidenceLink, Meter, SourceCitation, cx, type MeterBand } from "../../../ui";
import { CATEGORY_CHIP, acbThresholds, fridClassesFor, metricCount } from "./reviewRecords";

function acbBands(): MeterBand[] {
  const t = acbThresholds();
  return [
    // Labelled by range only: the ACB scale publishes one review threshold, not named severity bands.
    { upTo: 0, label: "0", tone: "success" },
    { upTo: t.elevated - 1, label: t.elevated - 1 > 1 ? `1–${t.elevated - 1}` : "1", tone: "info" },
    { upTo: t.high - 1, label: t.high - 1 > t.elevated ? `${t.elevated}–${t.high - 1}` : `${t.elevated}`, tone: "caution" },
    { upTo: Infinity, label: `${t.high}+`, tone: "attention" },
  ];
}

function Pips({ score }: { score: number }) {
  return (
    <span className="cg-pips" aria-hidden="true">
      {[1, 2, 3].map((n) => (
        <span key={n} className={cx("cg-pips__pip", n <= score && "is-on")} />
      ))}
    </span>
  );
}

export function AcbCard({ review, meds, person }: { review: MedReview; meds: Map<string, Medication>; person: string }) {
  const acb = review.acb;
  const t = acbThresholds();
  const source = getSource(KB.acbThresholds?.sourceId ?? "");
  const rows = [...acb.contributors].sort((a, b) => b.score - a.score || (meds.get(a.medId)?.name ?? "").localeCompare(meds.get(b.medId)?.name ?? ""));
  return (
    <Card as="section" className="cg-rv-card cg-rv-card--acb" aria-labelledby="cg-rv-acb" data-tour="review-acb">
      <CardHeader id="cg-rv-acb" icon={<Brain size={20} />} eyebrow="ACB scale" title="Anticholinergic burden" level={2} />
      <Meter
        label="Total score"
        value={acb.total}
        max={Math.max(9, acb.total)}
        bands={acbBands()}
        valueText={`${acb.total}; the published review threshold is ${t.elevated} or more`}
        description="Each medicine on the ACB list scores 1 to 3; Kinwise adds them up."
      />
      <p className="cg-acb-threshold">Published review threshold: a total of {t.elevated} or more (ACB scale).</p>
      {rows.length > 0 ? (
        <ul className="cg-acb-list" role="list" aria-label="Medicines that add to the score">
          {rows.map((c) => {
            const med = meds.get(c.medId);
            const ingredient = getDrug(c.ingredientId)?.display.toLowerCase() ?? c.ingredientId;
            const showIngredient = med && !med.name.toLowerCase().startsWith(ingredient);
            return (
              <li key={`${c.medId}-${c.ingredientId}`} className="cg-acb-list__row">
                <span className="cg-acb-list__name">
                  {med?.name ?? ingredient}
                  {showIngredient && <span className="cg-acb-list__ing"> · {ingredient}</span>}
                </span>
                <Pips score={c.score} />
                <span className="cg-acb-list__score ui-num">
                  {c.score}
                  <span className="ui-visually-hidden"> of 3</span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="cg-rv-card__empty">None of {person}’s current medicines are on the ACB list.</p>
      )}
      {source && (
        <p className="cg-rv-card__source">
          <SourceCitation source={source} />
        </p>
      )}
    </Card>
  );
}

export function FallsCard({
  review,
  meds,
  facts,
  person,
  onShowRecords,
}: {
  review: MedReview;
  meds: Map<string, Medication>;
  facts: DiaryFacts;
  person: string;
  onShowRecords: () => void;
}) {
  const fallMeds = review.fallRiskMedIds.map((id) => meds.get(id)).filter((m): m is Medication => Boolean(m));
  const activeCount = [...meds.values()].length;
  const falls = metricCount(facts, "fall");
  const nearFalls = metricCount(facts, "nearFall");
  const dizzy = metricCount(facts, "dizziness");
  const recentFalls = facts.fallDates.filter((d) => d >= facts.recentFrom);
  const recentNear = facts.nearFallDates.filter((d) => d >= facts.recentFrom);
  const sourceIds = [...new Set(fallMeds.flatMap((m) => fridClassesFor(m.ingredientIds).map((f) => f.sourceId)))];
  const sources = sourceIds.map((id) => getSource(id)).filter((s): s is NonNullable<typeof s> => Boolean(s));
  const answered = Math.max(falls.answered, nearFalls.answered, dizzy.answered);
  return (
    <Card as="section" className="cg-rv-card" aria-labelledby="cg-rv-falls">
      <CardHeader id="cg-rv-falls" icon={<Footprints size={20} />} eyebrow="Fall-risk medicines" title="Medicines linked to falls" level={2} />
      <p className="cg-rv-figure">
        <span className="cg-rv-figure__n ui-num">{fallMeds.length}</span>
        <span className="cg-rv-figure__of">
          of {activeCount} {activeCount === 1 ? "medicine is" : "medicines are"} on published fall-risk lists
        </span>
      </p>
      {fallMeds.length > 0 ? (
        <ul className="cg-frid-list" role="list">
          {fallMeds.map((m) => {
            const cls = fridClassesFor(m.ingredientIds)[0];
            return (
              <li key={m.id}>
                <span className="cg-frid-list__name">{m.name}</span>
                {cls && <span className="cg-frid-list__class">{cls.display}</span>}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="cg-rv-card__empty">None of {person}’s current medicines are on the fall-risk lists Kinwise checks.</p>
      )}
      <div className="cg-rv-diary">
        <p className="cg-rv-diary__title">In the diary, last 30 days</p>
        {answered === 0 ? (
          <p className="cg-rv-diary__text">No check-ins answered these questions in the last 30 days.</p>
        ) : (
          <p className="cg-rv-diary__text">
            <strong className="ui-num">{falls.positive}</strong> {falls.positive === 1 ? "fall" : "falls"}
            {recentFalls.length > 0 && ` (${recentFalls.map(formatShort).join(", ")})`} ·{" "}
            <strong className="ui-num">{nearFalls.positive}</strong> {nearFalls.positive === 1 ? "near-fall" : "near-falls"}
            {recentNear.length > 0 && ` (${recentNear.map(formatShort).join(", ")})`} · dizziness on{" "}
            <strong className="ui-num">{dizzy.positive}</strong> of {dizzy.answered} answered days
          </p>
        )}
        {answered > 0 && <EvidenceLink onClick={onShowRecords} />}
      </div>
      {sources.length > 0 && (
        <p className="cg-rv-card__source">
          {sources.map((s) => (
            <SourceCitation key={s.id} source={s} />
          ))}
        </p>
      )}
    </Card>
  );
}

export function BeersCard({ review, meds, person }: { review: MedReview; meds: Map<string, Medication>; person: string }) {
  const beers = review.findings.filter((f) => BEERS_CATEGORIES.includes(f.category));
  const byMed = new Map<string, Finding[]>();
  for (const f of beers) for (const id of f.medIds) byMed.set(id, [...(byMed.get(id) ?? []), f]);
  const rows = [...byMed.entries()]
    .map(([id, fs]) => ({ med: meds.get(id), cats: [...new Set(fs.map((f) => CATEGORY_CHIP[f.category]))] }))
    .filter((r): r is { med: Medication; cats: string[] } => Boolean(r.med))
    .sort((a, b) => b.cats.length - a.cats.length || a.med.name.localeCompare(b.med.name));
  const source = getSource("beers2023") ?? beers.flatMap((f) => f.sourceIds).map((id) => getSource(id)).find(Boolean);
  const notApplied = review.notices.some((n) => /Beers Criteria® apply to adults aged 65/.test(n));
  return (
    <Card as="section" className="cg-rv-card" aria-labelledby="cg-rv-beers">
      <CardHeader id="cg-rv-beers" icon={<ListChecks size={20} />} eyebrow="AGS Beers Criteria® 2023" title="Beers Criteria prompts" level={2} />
      {notApplied ? (
        <p className="cg-rv-card__empty">Not applied: the Beers Criteria are for adults aged 65 and older.</p>
      ) : (
        <>
          <p className="cg-rv-figure">
            <span className="cg-rv-figure__n ui-num">{rows.length}</span>
            <span className="cg-rv-figure__of">
              {rows.length === 1 ? "medicine appears" : "medicines appear"} in {beers.length} Beers {beers.length === 1 ? "prompt" : "prompts"}
            </span>
          </p>
          {rows.length > 0 ? (
            <ul className="cg-beers-list" role="list">
              {rows.map((r) => (
                <li key={r.med.id}>
                  <span className="cg-beers-list__name">{r.med.name}</span>
                  <span className="cg-beers-list__cats">{r.cats.join(" · ")}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="cg-rv-card__empty">None of {person}’s current medicines match the Beers criteria Kinwise checks.</p>
          )}
        </>
      )}
      {source && (
        <p className="cg-rv-card__source">
          <SourceCitation source={source} />
        </p>
      )}
    </Card>
  );
}
