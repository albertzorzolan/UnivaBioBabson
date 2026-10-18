// A fixed Poison Control line, shown next to a medicine note that says too much of a medicine, or the wrong one,
// was taken ("I took two of my sleeping pills last night by mistake").
//
// Static on purpose, like the Help dialog it borrows its numbers from: the words never change with what was
// written, it gives no advice, judges nothing and changes nothing about the medicines. The only thing that depends
// on the story is whether the line is shown at all. That check reads each note's own words in two ways:
//   1. the remark kind the medicine-note reading already assigns (engine/nlp/meds.ts medNoteKind) is "extra";
//   2. or the note's words match the local patterns below. These are needed because the reading checks "missed"
//      and "taken" before "extra", so "took my sleeping pill twice" comes back as "taken" and "I forgot I had
//      already taken my pills" as "missed". A "missed" note counts only for a double dose. A mix-up counts only
//      when the medicines are what got mixed up ("got my tablets mixed up", "confused with my tablets"); a bare
//      "confused" or "mixed up" is a symptom Kinwise tracks, and a poisoning notice beside it would hint at a cause.
// The patterns are kept narrow (a take verb plus a medicine word) because a poisoning notice beside a symptom
// would hint at a cause; the text of the line itself never changes.
//
// Coverage limit: the line can only appear when the reading produced a medicine note (a medicine named on her
// list, or a generic reference such as "my water pill" that describes an event). Some phrasings produce no note
// at all ("took my husband's pills", "the wrong tablets", a medicine not on her list), so they show no line here;
// the Help dialog's always-visible Poison Control row is the fallback.
//
// role="note", not "alert": it should not interrupt a screen reader mid-sentence.
import { PhoneCall, ShieldAlert } from "lucide-react";
import type { CheckIn } from "../../model/types";
import { medNoteKind } from "../../engine/nlp/meds";
import { EMERGENCY_NUMBER, POISON_CONTROL } from "../../app/Help";
import { cx } from "../../ui";
import "./MedSafetyLine.css";

/** A medicine word: what the take verb must act on, so a symptom ("had the dizzy spell again") never matches. */
const MED = "(?:pills?|tablets?|meds?|medicines?|doses?|capsules?|it|them|one|ones)";

/**
 * A double dose, in words that also fit a note the reading files as "missed" ("I forgot I had already taken my
 * pills", "forgot I'd taken it and took it again"): "already taken", or a take verb on a medicine word followed by
 * "twice" (or, here only, "again"). Outside a missed note "took my water pill again" is just restarting it, so the
 * general patterns below use "twice" only.
 */
const DOUBLE_IN_MISSED = new RegExp(
  `(?<![a-z])(?:already (?:taken|took|had)|(?:took|taken) (?:[a-z']+ ){0,4}${MED} (?:[a-z']+ ){0,3}(?:twice|again))(?![a-z])`,
);

/**
 * Too much, someone else's or the wrong medicine, in words the note reading files under another kind. Each pattern
 * needs a take verb or a medicine word next to the key word: "by accident" / "accidentally" only with took / taken /
 * had ("I accidentally skipped my water pill" is a missed dose), "twice" only after a take verb on a medicine word
 * (not "late again"), "double" and "extra" only with a dose word ("double vision" is a side effect), "wrong" only on
 * a medicine word or after "took the" ("the wrong one for me" is an opinion), and "today's pills" is a day, not
 * another person.
 */
const TOO_MUCH_OR_WRONG = new RegExp(
  "(?<![a-z])(?:" +
    [
      `(?:took|taken) (?:[a-z']+ ){0,4}${MED} (?:[a-z']+ ){0,3}twice`,
      "(?:accidentally|mistakenly) (?:took|taken|had)",
      "(?:took|taken|had) (?:[a-z']+ ){0,7}by (?:accident|mistake)",
      "already (?:taken|took|had)",
      "instead of (?:mine|my|hers|her|his)",
      "too many (?:[a-z']+ ){0,2}(?:pills?|tablets?|doses?|meds?|medicines?|capsules?)",
      "double(?:d)? (?:up|dose|dosed|dosing)",
      "(?:a|an) (?:double|extra) (?:[a-z']+ ){0,2}(?:doses?|pills?|tablets?|ones?|medicines?|meds?|capsules?)",
      "extra (?:doses?|pills?|tablets?|capsules?)",
      "wrong (?:pills?|tablets?|medicines?|meds?|doses?|bottles?|capsules?)",
      "(?:took|taken|had|gave|given) (?:me |her |him )?the wrong",
      "(?!(?:today|tonight|yesterday|tomorrow|morning|evening|night|week|day)'s)[a-z]+'s (?:pills?|tablets?|medicines?|meds)",
    ].join("|") +
    ")(?![a-z])",
);

/**
 * A mix-up of the medicines themselves: the pills are what got mixed up, or "confused with my tablets". Not a bare
 * "mixed up", "muddled" or "confused": patients use those words for their own confusion, a symptom Kinwise tracks,
 * and a poisoning notice beside it would hint at a cause.
 */
const MIX_UP_WORDS = new RegExp(
  "(?<![a-z])(?:" +
    [
      "(?:mixed|muddled) up (?:my|her|his|the) (?:[a-z]+ ){0,2}(?:pills?|tablets?|medicines?|meds|doses?|bottles?|capsules?)",
      "got (?:my|her|his|the) (?:[a-z]+ ){0,3}(?:mixed|muddled) up",
      "mix-up with (?:my|the)",
      "confused (?:about|with|over) (?:my|the|which|her|his)",
    ].join("|") +
    ")(?![a-z])",
);

/**
 * True when any note reads as an extra dose, someone else's or the wrong medicine, or a mix-up. The kind is not
 * stored on the note, so it is read again from the note's own words (the clause the reading quoted), which also
 * works for a check-in saved earlier. A note the reading files as "missed" shows the line only for a double dose
 * (DOUBLE_IN_MISSED): "I missed my water pill by mistake" is a skipped dose, not too much.
 */
export function needsPoisonLine(notes: readonly Pick<CheckIn["medNotes"][number], "text">[]): boolean {
  return notes.some((n) => {
    const t = n.text.toLowerCase().replace(/\u2019/g, "'");
    const kind = medNoteKind(n.text);
    if (kind === "missed") return DOUBLE_IN_MISSED.test(t);
    return kind === "extra" || TOO_MUCH_OR_WRONG.test(t) || MIX_UP_WORDS.test(t);
  });
}

export function MedSafetyLine({ className }: { className?: string }) {
  return (
    <div role="note" className={cx("pt-medsafety", className)}>
      <span className="pt-medsafety__icon" aria-hidden="true">
        <ShieldAlert size={24} />
      </span>
      <p className="pt-medsafety__text">
        If someone took too much of a medicine or the wrong one, call Poison Control at{" "}
        <span className="pt-medsafety__num">{POISON_CONTROL.text}</span> (US, free, 24/7). In an emergency call{" "}
        <span className="pt-medsafety__num">{EMERGENCY_NUMBER.text}</span>.
      </p>
      <div className="pt-medsafety__calls">
        <a className="ui-btn ui-btn--secondary ui-btn--lg" href={`tel:${POISON_CONTROL.tel}`}>
          <PhoneCall size={20} aria-hidden="true" />
          <span>Call Poison Control</span>
        </a>
        <a className="ui-btn ui-btn--ghost ui-btn--lg" href={`tel:${EMERGENCY_NUMBER.tel}`}>
          <PhoneCall size={20} aria-hidden="true" />
          <span>Call {EMERGENCY_NUMBER.text}</span>
        </a>
      </div>
    </div>
  );
}
