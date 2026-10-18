# NLP failure analysis (held-out set)

Where the symptom extractor still goes wrong on the held-out corpus (`eval/nlp-corpus.heldout.json`, 70 stories,
116 labelled core fields), grouped by cause. Counts come from `eval/results/nlp-eval.json` (`heldout.errors`,
engine `kinwise-nlp 2.0.0`, run of 2026-10-18). Reproduce with `npm run eval:nlp`.

How this was written: the held-out set is never used for tuning. The engine changes of 2026-10-17/18 (caregiver
voice, possessive and object-pronoun scope, vertigo idioms, unsteadiness guesses, urinary-retention wording) were
made from the simulated judges' probe sentences (AI review agents run by the team) and the annotation guide, with held-out scoring switched off
(`NLP_EVAL_SKIP_HELDOUT=1`). The held-out results were then regenerated and are identical to the previous run
(same 18 errors, same scores). Only after that were the error stories read to classify them. None of the errors
below has been fixed, so this table describes the engine as submitted, not a tuned one.

## Core fields: 10 false negatives, 3 false positives

A wrong value counts once as a false positive and once as a false negative (scoring in `eval/ANNOTATION-GUIDE.md`).

| Error type | FN | FP | Cases | What happens |
|---|---|---|---|---|
| Dizziness severity word not attached to the mention | 4 | 0 | h031, h036, h040, h065 | The intensity word sits inside the matched phrase ("felt a little faint"), after other words ("head was spinning, really badly", "dizzy spells … really bad ones") or in "a bit of a dizzy turn … nothing too bad", so no severity is proposed. Dizziness itself is found in all four. |
| Negation scope too short | 1 | 1 | h070 | "Neither of us was dizzy": the negation stops before "was", so dizziness is proposed as yes instead of no (the one polarity flip). |
| Negation scope too long | 1 | 0 | h045 | "Wasn't a bit drowsy today, raring to go": the negation runs past the comma and suppresses the energy 5. |
| Hypothetical trigger misfires | 1 | 0 | h019 | "…so I didn't go down" is read like the purpose clause "so (that) I don't…", so "fall: no" is dropped. |
| Capitalised word read as a person | 1 | 0 | h008 | "Rest of the day was good, decent energy": "Rest" is taken as a name, so the energy rating goes to someone else. |
| Explicit rating phrasing not parsed | 1 | 0 | h051 | "Sleep was a solid four out of five" is not read as a rating. |
| Misspelling not corrected | 1 | 0 | h054 | "nearly fel over" ("fel" is not corrected to "fell"), so the near-fall is missed. |
| Word sense: "fall" the season | 0 | 1 | h020 | "Lovely crisp fall day" proposes a fall. |
| Two reporters disagree | 0 | 1 | h033 | Mom says she wasn't dizzy, the home aide wrote that she was: the guide expects no value (a conflict), the engine proposes "no" and treats the aide's report as someone else's. |
| **Total** | **10** | **3** | | Held-out core micro: P 0.972, R 0.914, F1 0.942 (95% CI 0.907–0.971) |

## Extra concepts: 5 false negatives, 1 false positive

| Error type | FN | FP | Cases | What happens |
|---|---|---|---|---|
| Caregiver voice not detected (a spouse typing) | 2 | 1 | h067 | "My wife felt nauseous … I've had a stinking cold … coughing": the story is read as the writer's own, so the wife's nausea and "no constipation" go to someone else and the writer's cough is added. |
| Future day read as the past | 2 | 0 | h043 | "Anxious about my scan on Friday, and my heart has been fluttering": "on Friday" is a historical trigger, so anxiety and palpitations are set aside as "an earlier time". |
| Misspelling not corrected | 1 | 0 | h035 | "out of breth" is not corrected, so shortness of breath is missed. |
| **Total** | **5** | **1** | | Held-out extra-concept micro: P 0.958, R 0.821, F1 0.885 (n = 28) |

## Simulated judges' probe sentences (separate file)

`eval/nlp-probe-judges.json` holds 34 probe sentences written by AI review agents that the team ran as simulated
judges (an "AI-scientist" persona and a "PM/founder" persona) during internal review on 2026-10-17. They were not
written by the NLP author, but they are not independent of the team and are not user or hackathon-judge testing.
They are relabelled from the guide
and checked by `eval/nlp-probe.test.ts`. It is a regression file, not part of the scores above. Two cases are marked
`knownMiss` and still fail:

| Case | Error type | What happens |
|---|---|---|
| jp08 "Slept right through, best night in ages." | Close scale wordings resolved to the lower level | "slept right through" = 4 and "best night" = 5; the engine keeps the lower one (4) as a please-check guess. |
| jp11 "I don't think I was dizzy, maybe a little light-headed when I stood." | Hedged negation not modelled | "I don't think I was" is read as a plain denial, so dizziness is proposed as "no" where the guide expects no value. |

The simulated AI-scientist judge's own script (`probe-nlp.mts`, 25 expected answers) moved from 18 of 25 to 21 of 25, still with 0
false positives: three of its seven misses were fixed. Four remain: the two `knownMiss` cases above, and two where the
judge expected more than the guide allows ("fall: no" for jp04, which never says she did not fall, and "dizziness: no"
for jp20 "Was not unsteady at all", where not being unsteady does not answer the dizziness question; the engine
proposes nothing, never a yes).
