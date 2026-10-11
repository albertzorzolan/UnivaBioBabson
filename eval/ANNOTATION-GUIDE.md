# Kinwise symptom-extraction annotation guide (v1)

Used by both corpora: `eval/nlp-corpus.dev.json` (development; may be used to tune the extractor) and
`eval/nlp-corpus.heldout.json` (held-out; written independently and **never** read while building or tuning the extractor).
All stories are fictional, written in the voice of an older adult (or occasionally their caregiver typing for them)
describing *today's* check-in.

## File format

```json
{
  "version": 1,
  "author": "who/what wrote this corpus",
  "cases": [
    {
      "id": "h001",
      "story": "Felt woozy getting out of bed this morning but no falls. Slept terribly.",
      "expect": { "dizziness": true, "fall": false, "sleep": 1 },
      "expectOther": {},
      "tags": ["colloquial", "negation"]
    }
  ]
}
```

- `expect` lists every core diary field the story supports, with the value the extractor should propose.
  Fields **not listed must not be proposed** (a proposal for an unlisted field is a false positive).
- Core fields and value types: `energy` 1–5, `sleep` 1–5, `appetite` "better" | "same" | "worse",
  `dizziness` boolean, `dizzinessSeverity` 1 | 2 | 3 (only when dizziness is true and severity is described),
  `drowsiness` boolean, `confusion` boolean, `fall` boolean, `nearFall` boolean, `swelling` boolean.
- `expectOther` lists additional symptom concepts with true (present) / false (explicitly denied):
  nausea, constipation, dry_mouth, headache, cough, blurred_vision, urinary_problem, low_mood, anxiety, pain,
  shortness_of_breath, tremor, rash, diarrhea, palpitations.
- `tags` (any of): `explicit_rating`, `qualitative`, `colloquial`, `negation`, `double_negation`, `pseudo_negation`,
  `experiencer_other`, `historical`, `hypothetical`, `fall_vs_near_fall`, `multi_symptom`, `med_mention`, `typo`,
  `long`, `no_symptoms`, `conflict`, `caregiver_voice`.

## Concept definitions

- **dizziness**: dizzy, lightheaded, woozy, room spinning, giddy, felt faint, head swimming, unsteady *because of dizziness*.
- **drowsiness**: drowsy, sleepy during the day, groggy, nodding off, dozing in the chair, couldn't keep my eyes open, "hungover" feeling from a pill.
- **confusion**: confused, foggy/brain fog/memory fog, muddled, mixed up, forgetful (e.g. forgot what I was doing), disoriented.
- **fall**: an actual fall to the ground/floor — fell, took a tumble, went down, ended up on the floor, fell over.
- **nearFall**: almost/nearly fell, lost my balance, stumbled and caught myself, grabbed the counter to stop myself falling.
  - "I didn't fall" alone ⇒ `fall: false` only (NOT `nearFall: false`).
  - "No falls or near falls" / "didn't fall or even trip" ⇒ `fall: false, nearFall: false`.
  - "Nearly fell" ⇒ `nearFall: true` (and NOT `fall: true`; do not set `fall: false` unless also stated).
- **swelling**: swollen/puffy ankles, feet, legs.
- **energy** (1–5): explicit "energy 2 out of 5", "a 3 for energy", "energy was 4/5" ⇒ that number.
  Qualitative mapping: exhausted / no energy at all / wiped out / drained ⇒ 1; tired / low energy / sluggish / run down ⇒ 2;
  okay / so-so / alright / average energy ⇒ 3; good / decent energy / pretty energetic ⇒ 4; great / full of energy / full of beans / raring to go ⇒ 5.
- **sleep** (1–5): explicit ratings as above. Qualitative: terrible / awful / barely slept / up all night ⇒ 1;
  badly / poorly / restless / kept waking ⇒ 2; okay / so-so / not bad ⇒ 3; well / good night ⇒ 4;
  great / like a log / like a baby / wonderful ⇒ 5. Sleep *duration* alone ("slept 6 hours") ⇒ no sleep value.
- **appetite**: not hungry / didn't feel like eating / barely ate / off my food / skipped meals because not hungry ⇒ "worse";
  ate well / good appetite / hungrier than usual ⇒ "better"; usual / normal / same as always ⇒ "same".
- **dizzinessSeverity**: slightly / a little / a bit / mild ⇒ 1; moderately / quite / fairly ⇒ 2; very / really bad / badly / severe / terribly ⇒ 3.
  "Dizzy" with no intensity word ⇒ no severity.

## Context rules

- **Negation**: "no dizziness", "didn't feel dizzy", "wasn't confused", "never lost my balance" ⇒ the field is `false`.
  Pseudo-negations do not negate: "no better", "not only dizzy but…", "nothing but dizzy spells", "no doubt I was dizzy".
  Double negation "I can't say I wasn't dizzy" ⇒ treat as affirmed (true) — rare; tag `double_negation`.
- **Experiencer**: symptoms of someone else ("my sister fell", "Bob was dizzy", "the dog was sick") are NOT the patient's ⇒ not listed.
- **Temporality**: the check-in covers roughly the last 24 hours. Current = today, this morning/afternoon/evening, tonight,
  last night, earlier, just now, or no time expression. Historical = yesterday, the other day, a few days ago, last week/month,
  on Tuesday (a named day), used to, years ago, in the past ⇒ not listed. Sleep quality naturally refers to last night (current).
- **Hypothetical / worry**: "I'm afraid I'll fall", "in case I get dizzy", "if I feel confused I'll call" ⇒ not listed.
- **Conflict**: if the story both affirms and denies the same current symptom, list the value of the *later* statement only if it
  clearly corrects the earlier one ("I thought I was dizzy, but actually no, it was fine" ⇒ false); otherwise omit the field and tag `conflict`.
- Medication mentions ("took my water pill", "forgot my evening tablets") are not symptoms; tag `med_mention`.

## Scoring (implemented in eval/nlp.eval.test.ts)

Per field: TP = proposed value equals gold; FP = proposed but field not in gold, or value differs; FN = gold field not proposed or value differs.
Report precision, recall, F1 per field and micro-averaged; scale fields also report "within ±1" accuracy;
negation/experiencer/historical/hypothetical subsets report error counts. Held-out results are reported, never tuned on.
