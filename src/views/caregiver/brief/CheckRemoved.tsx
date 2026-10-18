// Visit brief › "What the check removed" (VisitBrief.tsx): the AI sentences the claim checker kept out of the brief,
// each with the check's reason in plain words. Shown after an AI run that removed anything, including the run that
// fell back to the standard template, so a fallback is visible as the safety net working rather than a silent swap.
import { ChevronDown, ShieldCheck, TriangleAlert } from "lucide-react";
import type { DroppedSentence } from "../../../ai";
import { plainIssue } from "../../../ai/tasks";
import "./check-removed.css";

const SECTION_NAMES: Record<string, string> = { reason: "Why we’re coming in", noticed: "What we’ve noticed", questions: "Our questions" };

/**
 * "What the check removed": the AI sentences that were not put in the brief, each with the check's reason in plain
 * words. A native <details>, collapsed by default, so it opens with the keyboard and is announced as a disclosure.
 * The list quotes blocked text word for word (it can read like advice, e.g. "pause the lorazepam"), so the caution
 * that these are not advice comes before the first quoted sentence.
 */
export function CheckRemoved({ items, name }: { items: DroppedSentence[]; name: string }) {
  return (
    <details className="cg-vb-removed">
      <summary className="cg-vb-removed__summary">
        <ShieldCheck size={18} aria-hidden="true" className="cg-vb-removed__icon" />
        <span className="cg-vb-removed__title">
          What the check removed <span className="cg-vb-removed__count">({items.length})</span>
        </span>
        <ChevronDown size={18} aria-hidden="true" className="cg-vb-removed__chevron" />
      </summary>
      <div className="cg-vb-removed__body">
        <p className="cg-vb-removed__lead">
          The on-device AI wrote these sentences, but they are not in the brief. Each one broke a wording rule (for example, it suggested changing a medicine) or
          did not match {name ? `${name}’s` : "the"} records.
        </p>
        <p className="cg-vb-removed__caution">
          <TriangleAlert size={16} aria-hidden="true" />
          <span>
            <strong>These sentences are not advice.</strong> Don’t start, stop or change any medicine because of them; ask the prescriber or pharmacist.
          </span>
        </p>
        <ul className="cg-vb-removed__list" role="list">
          {items.map((d, i) => (
            <li key={i} className="cg-vb-removed__item">
              <span className="cg-vb-removed__where">{SECTION_NAMES[d.section] ?? d.section} · not in the brief</span>
              <q className="cg-vb-removed__text">{d.text}</q>
              <span className="cg-vb-removed__why">{reasonLine(d.issues)}</span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

/**
 * "Reason: has a number that is not in the records it cites", or, when the first reason is a blocked wording,
 * "Blocked: names a medicine …" (not "Reason: blocked: …", two colons in a row).
 */
export function reasonLine(issues: string[]): string {
  const reasons = issues.length ? [...new Set(issues.map(plainIssue))].join("; ") : "did not pass the check";
  return reasons.startsWith("blocked: ") ? `Blocked: ${reasons.slice("blocked: ".length)}` : `Reason: ${reasons}`;
}
