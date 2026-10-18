// "How reliable is this?" — the one disclosure, shared by the caregiver Overview and Timeline, that holds the rigor
// behind a before/after comparison: the test and p-value for each row, the method, and the measured chance rates.
//
// The rates are NOT written here. MULTIPLE_COMPARISONS_NOTE and SIGNAL_CAVEAT are rendered verbatim from
// engine/timeline/rules.ts (measured by signals.null.test.ts), so a change to the simulation changes every screen.
// The visible card only says, without numbers, that a difference like this can appear by chance (CHANCE_NOTE).
// Those rules.ts notes speak of "strong" and "moderate" signals while the badges say "Large/Clear difference", so
// the panel opens with SIGNAL_WORDS_KEY, a number-free line mapping one vocabulary onto the other.
// Each test row also shows the runs check's p (when the comparison has one) beside the test's p. RUNS_CHECK_NOTE
// (rules.ts) then says the second p-value is a check that is reported, not a second verdict; it is shown only where a
// runs-check p is on screen (runsNote), never as a description of a number the page does not show.
// `notes` holds the view's own method lines that moved off the main screen (the Timeline's size-word order, the
// "maybe a bad stretch" key, the falls note), so the visible card keeps only counts, size words and one chance line.
import type { ReactNode } from "react";
import type { MetricKey, Signal } from "../../model/types";
import { formatPValue } from "../../engine/timeline/stats";
import { MULTIPLE_COMPARISONS_NOTE, RUNS_CHECK_NOTE, SIGNAL_CAVEAT } from "../../engine/timeline/rules";
import { formatRunsCheckP } from "../../engine/timeline/signals";
import { Disclosure, TimelineDot, cx } from "../../ui";
import { RELIABILITY_TITLE, SIGNAL_WORDS_KEY, TEST_NAME, usesEngineStrengthWords } from "./caregiver-insights";
import "./caregiver-reliability.css";

export interface ReliabilityTest {
  key: string;
  metric: MetricKey;
  label: string;
  test: Signal["test"];
  pValue: number;
  /** The runs check's p for the same comparison (signal.runsCheck.p); left out for older saved analyses. */
  runsP?: number;
}

export function ReliabilityDisclosure({
  tests = [],
  method,
  summary = RELIABILITY_TITLE,
  className,
  bodyClassName,
  runsNote = tests.some((t) => t.runsP !== undefined),
  notes,
}: {
  /** The test, p-value and runs-check p behind each compared row (Overview bars; every tested Timeline row except falls and near-falls that were not flagged). */
  tests?: ReliabilityTest[];
  /** How the comparison is made, before the chance rates (the Timeline passes TIMELINE_METHOD_SUMMARY). */
  method?: ReactNode;
  /** Trigger text; the default is RELIABILITY_TITLE. */
  summary?: string;
  className?: string;
  /** The panel's layout class, so each view keeps its own spacing (cg-ov-method, cg-tl-method). */
  bodyClassName?: string;
  /** Show RUNS_CHECK_NOTE. Defaults to "some listed row has a runs-check p". */
  runsNote?: boolean;
  /** Extra lines from the view (each its own block), shown after the test rows and before the method. */
  notes?: ReactNode;
}) {
  // The key goes before the first text that uses the engine's words (the Timeline's method summary does too), and
  // is left out if rules.ts is ever reworded in the page's own vocabulary.
  const needsKey =
    usesEngineStrengthWords(MULTIPLE_COMPARISONS_NOTE) || (typeof method === "string" && usesEngineStrengthWords(method));
  return (
    <Disclosure summary={summary} className={className}>
      <div className={cx("cg-rel", bodyClassName)}>
        {tests.length > 0 && (
          <ul className="cg-rel__tests" role="list" aria-label="Test behind each comparison">
            {tests.map((t) => (
              <li key={t.key}>
                <TimelineDot metric={t.metric} size={9} />
                <span>
                  {t.label}: {TEST_NAME[t.test]}, <span className="ui-num">{formatPValue(t.pValue)}</span>
                  {t.runsP !== undefined && (
                    <>
                      {" "}
                      · <span className="cg-rel__runs-p">runs check <span className="ui-num">{formatRunsCheckP(t.runsP)}</span></span>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {notes}
        {needsKey && <p className="cg-rel__key">{SIGNAL_WORDS_KEY}</p>}
        {method && <p>{method}</p>}
        {runsNote && <p>{RUNS_CHECK_NOTE}</p>}
        <p>{MULTIPLE_COMPARISONS_NOTE}</p>
        <p>{SIGNAL_CAVEAT}</p>
      </div>
    </Disclosure>
  );
}
