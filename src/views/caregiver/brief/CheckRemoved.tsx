// "What the check removed": the AI sentences the claim checker kept out, each with the check's reason in plain words.
// Visit brief (VisitBrief.tsx): shown after an AI run that removed anything, including the run that fell back to the
// standard template, so a fallback is visible as the safety net working rather than a silent swap. Review card
// (FindingCard.tsx, variant "card"): shown under "Explain in simpler words" when the check removed any sentence.
import { ChevronDown, ShieldCheck, TriangleAlert } from "lucide-react";
import type { DroppedSentence } from "../../../ai";
import { plainIssue } from "../../../ai/tasks";
import "./check-removed.css";
import "./check-removed-card.css";

const SECTION_NAMES: Record<string, string> = { reason: "Why we’re coming in", noticed: "What we’ve noticed", questions: "Our questions" };

/**
 * "What the check removed": the AI sentences that were not shown, each with the check's reason in plain words. A
 * native <details>, collapsed by default, so it opens with the keyboard and is announced as a disclosure. The list
 * quotes blocked text word for word (it can read like advice, e.g. "pause the lorazepam"), so the caution that these
 * are not advice comes before the first quoted sentence.
 *
 * `variant` "brief" (default) checks against the person's records and names the brief section of each sentence;
 * "card" is the review card's explanation, checked against the finding and its reference text (tasks.ts
 * checkExplanation), so there is one section and no per-sentence "not in the brief" line.
 */
export function CheckRemoved({ items, name, variant = "brief" }: { items: DroppedSentence[]; name: string; variant?: "brief" | "card" }) {
  const card = variant === "card";
  // One removed sentence reads "this sentence … it", several "these sentences … them".
  const one = items.length === 1;
  return (
    <details className={card ? "cg-vb-removed cg-vb-removed--card" : "cg-vb-removed"}>
      <summary className="cg-vb-removed__summary">
        <ShieldCheck size={18} aria-hidden="true" className="cg-vb-removed__icon" />
        <span className="cg-vb-removed__title">
          What the check removed <span className="cg-vb-removed__count">({items.length})</span>
        </span>
        <ChevronDown size={18} aria-hidden="true" className="cg-vb-removed__chevron" />
      </summary>
      <div className="cg-vb-removed__body">
        {card ? (
          <p className="cg-vb-removed__lead">
            {one ? "The on-device AI wrote this sentence, but the code check kept it off this card. It" : "The on-device AI wrote these sentences, but the code check kept them off this card. Each one"}{" "}
            broke a wording rule (for example, it suggested changing a medicine) or said something that is not in the finding or its reference text.
          </p>
        ) : (
          <p className="cg-vb-removed__lead">
            {one ? "The on-device AI wrote this sentence, but it is not in the brief. It" : "The on-device AI wrote these sentences, but they are not in the brief. Each one"} broke a
            wording rule (for example, it suggested changing a medicine) or did not match {name ? `${name}’s` : "the"} records.
          </p>
        )}
        <p className="cg-vb-removed__caution">
          <TriangleAlert size={16} aria-hidden="true" />
          <span>
            <strong>{one ? "This sentence is not advice." : "These sentences are not advice."}</strong> Don’t start, stop or change any medicine because of{" "}
            {one ? "it" : "them"}; ask the prescriber or pharmacist.
          </span>
        </p>
        <ul className="cg-vb-removed__list" role="list">
          {items.map((d, i) => (
            <li key={i} className="cg-vb-removed__item">
              {!card && <span className="cg-vb-removed__where">{SECTION_NAMES[d.section] ?? d.section} · not in the brief</span>}
              <q className="cg-vb-removed__text">{d.text}</q>
              <span className="cg-vb-removed__why">{reasonLine(d.issues, variant)}</span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

/**
 * "Reason: has a number that is not in the records it cites", or, when the first reason is a blocked wording,
 * "Blocked: names a medicine …" (not "Reason: blocked: …", two colons in a row). `variant` "card" words each reason
 * for a review card (cardIssue); "brief" uses plainIssue unchanged.
 */
export function reasonLine(issues: string[], variant: "brief" | "card" = "brief"): string {
  const plain = variant === "card" ? cardIssue : plainIssue;
  const reasons = issues.length ? [...new Set(issues.map(plain))].join("; ") : "did not pass the check";
  return reasons.startsWith("blocked: ") ? `Blocked: ${reasons.slice("blocked: ".length)}` : `Reason: ${reasons}`;
}

/** What a review card's check compares each AI sentence with (tasks.ts checkExplanation's `support`). */
const CARD_SOURCE = "the finding or its reference text";

/**
 * One check reason in plain words for a review card. plainIssue words reasons for the brief, which is checked
 * against the person's records and full medication list; a card's check only sees the finding, its reference text
 * and the medicines this finding is about (checkExplanation's medNames). So on a card med_unknown means "a medicine
 * this finding is not about", never "not on the list" (the medicine may well be on the list), and "the records"
 * become the finding and its reference text. Every other reason (blocked wordings included) reads as in the brief.
 */
export function cardIssue(issue: string): string {
  const at = issue.indexOf(":");
  const code = at < 0 ? issue : issue.slice(0, at);
  if (code === "med_unknown") {
    // Same quoted name as plainIssue keeps.
    const quoted = /"([^"]+)"/.exec(issue.slice(at + 1))?.[1];
    return `names a medicine this finding is not about${quoted ? ` ("${quoted}")` : ""}`;
  }
  if (code === "unsafe_content") return "contains text that does not belong on this card";
  return plainIssue(issue)
    .replace(/\bthe records it cites\b/, CARD_SOURCE)
    .replace(/\bthe records it copies\b/, "the text it copies")
    .replace(/\bthe records$/, CARD_SOURCE);
}
