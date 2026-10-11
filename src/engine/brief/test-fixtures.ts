// Test fixtures for the brief engine: the seeded Margaret story (createSeed + the real timeline engine), a
// hand-built MedReview matching SPEC §2 (the review engine is written concurrently), and a fake KB.
// Fictional data only. Not imported by app code.

import type { Finding, MedReview, Medication, MetricKey, StoreData } from "../../model/types";
import { addDays } from "../../model/dates";
import { createSeed } from "../../model/seed";
import { analyzeTimeline } from "../timeline/signals";
import type { TimelineReport } from "../timeline/signals";
import type { BriefKb } from "./shared";

export const TODAY = "2026-10-10";
export const FROM = addDays(TODAY, -44); // 45-day brief period: Aug 27 – Oct 10

const EFFECTS: Record<string, MetricKey[]> = {
  lorazepam: ["dizziness", "drowsiness", "confusion", "fall", "nearFall", "energy"],
  diphenhydramine: ["drowsiness", "confusion", "dizziness"],
  oxybutynin: ["confusion", "drowsiness"],
  amlodipine: ["swelling", "dizziness"],
  furosemide: ["dizziness"],
};

export const isKnownEffect = (med: Medication, m: MetricKey): boolean =>
  med.ingredientIds.some((id) => (EFFECTS[id] ?? []).includes(m));

const RXCUI: Record<string, string> = {
  lorazepam: "6470",
  amlodipine: "17767",
  furosemide: "4603",
  metformin: "6809",
  atorvastatin: "83367",
  omeprazole: "7646",
  oxybutynin: "32675",
  diphenhydramine: "3498",
  acetaminophen: "161",
};

const SOURCES: Record<string, { short: string; url: string }> = {
  beers2023: { short: "AGS Beers Criteria® 2023", url: "https://doi.org/10.1111/jgs.18372" },
  acb2008: { short: "ACB scale (Boustani 2008)", url: "https://doi.org/10.2217/1745509X.4.3.311" },
  stoppfall2021: { short: "STOPPFall 2021", url: "https://doi.org/10.1093/ageing/afaa249" },
  cascade2017: { short: "Prescribing cascades (Savage 2020)", url: "https://doi.org/10.1111/jgs.16330" },
};

export const FAKE_KB: BriefKb = {
  version: "test-kb-1",
  rxcui: (id) => RXCUI[id] ?? null,
  drugDisplay: (id) => (id ? id.charAt(0).toUpperCase() + id.slice(1) : null),
  source: (id) => SOURCES[id] ?? null,
};

function finding(f: Partial<Finding> & Pick<Finding, "key" | "category" | "title" | "medIds">): Finding {
  return {
    ruleId: f.key.split("|")[0],
    plain: "",
    clinician: "",
    question: "",
    sourceIds: ["beers2023"],
    evidenceGrade: null,
    relatedSymptoms: [],
    signalIds: [],
    ...f,
  };
}

export function margaretReview(): MedReview {
  const findings: Finding[] = [
    finding({
      key: "beers-pim-benzodiazepine|med-lorazepam",
      category: "beers_avoid",
      title: "Lorazepam is a benzodiazepine",
      medIds: ["med-lorazepam"],
      plain:
        "The AGS Beers Criteria 2023 list benzodiazepines such as lorazepam as medicines older adults should generally avoid. They are linked with memory problems, delirium, falls and fractures in older adults.",
      clinician: "Benzodiazepines: avoid (strong recommendation, moderate-quality evidence); increased risk of cognitive impairment, delirium, falls, fractures.",
      question: "Is lorazepam still the best choice for her sleep and nerves, given the dizziness and near-falls recorded since it started?",
      evidenceGrade: "AGS Beers 2023 · strong recommendation · moderate-quality evidence",
      relatedSymptoms: ["dizziness", "drowsiness", "confusion", "nearFall", "fall"],
      signalIds: ["sig:med-lorazepam:dizziness:started", "sig:med-lorazepam:drowsiness:started"],
    }),
    finding({
      key: "beers-pim-first-gen-antihistamine|med-tylenolpm",
      category: "beers_avoid",
      title: "Tylenol PM contains diphenhydramine",
      medIds: ["med-tylenolpm"],
      plain:
        "Diphenhydramine, the sleep ingredient in Tylenol PM, is listed in the AGS Beers Criteria 2023 as a medicine older adults should generally avoid. It is strongly anticholinergic and sedating.",
      clinician: "First-generation antihistamine: avoid; highly anticholinergic, clearance reduced with advanced age.",
      question: "Is there another way to help with her sleep instead of Tylenol PM?",
      relatedSymptoms: ["drowsiness", "confusion"],
    }),
    finding({
      key: "beers-pim-antimuscarinic|med-oxybutynin",
      category: "beers_avoid",
      title: "Oxybutynin is strongly anticholinergic",
      medIds: ["med-oxybutynin"],
      plain: "Oxybutynin is listed in the AGS Beers Criteria 2023 as a strongly anticholinergic medicine that older adults should generally avoid.",
      clinician: "Strongly anticholinergic antimuscarinic for urinary incontinence: avoid.",
      question: "Could her bladder treatment be reviewed, given her anticholinergic burden?",
    }),
    finding({
      key: "beers-pim-ppi|med-omeprazole",
      category: "beers_avoid",
      title: "Omeprazole taken for more than 8 weeks",
      medIds: ["med-omeprazole"],
      plain:
        "The AGS Beers Criteria 2023 suggest avoiding scheduled proton-pump inhibitor use for more than 8 weeks unless there is a clear reason.",
      clinician: "PPI > 8 weeks: avoid unless high-risk or demonstrated need.",
      question: "Is omeprazole still needed every day?",
    }),
    finding({
      key: "beers-condition-falls|med-lorazepam+med-tylenolpm",
      category: "beers_condition",
      title: "Falls recorded while taking lorazepam and diphenhydramine",
      medIds: ["med-lorazepam", "med-tylenolpm"],
      plain:
        "Because a fall was recorded, the AGS Beers Criteria 2023 rules for people with a history of falls apply to lorazepam and to diphenhydramine in Tylenol PM.",
      clinician: "History of falls: avoid benzodiazepines and other CNS-active drugs unless other options are not suitable.",
      question: "With the fall on record, which of her medicines are worth reviewing for falls?",
      relatedSymptoms: ["fall", "nearFall"],
    }),
    finding({
      key: "acb|med-furosemide+med-oxybutynin+med-tylenolpm",
      category: "anticholinergic_burden",
      title: "Anticholinergic burden score (ACB) of 7",
      medIds: ["med-furosemide", "med-oxybutynin", "med-tylenolpm"],
      plain: "Three of her medicines add up to an anticholinergic burden score (ACB) of 7; the published review threshold is 3 or more.",
      clinician: "ACB total 7: diphenhydramine 3, oxybutynin 3, furosemide 1.",
      question: "Could the anticholinergic medicines on her list be reviewed together?",
      sourceIds: ["acb2008"],
      relatedSymptoms: ["confusion"],
    }),
    finding({
      key: "fall-risk|med-amlodipine+med-furosemide+med-lorazepam+med-tylenolpm",
      category: "fall_risk",
      title: "4 fall-risk-increasing medicines",
      medIds: ["med-amlodipine", "med-furosemide", "med-lorazepam", "med-tylenolpm"],
      plain: "Four medicines on the list are on published lists of fall-risk-increasing drugs.",
      clinician: "FRIDs: lorazepam, diphenhydramine, furosemide, amlodipine (STOPPFall).",
      question: "With the fall on record, which of her medicines are worth reviewing for falls?",
      sourceIds: ["stoppfall2021"],
      relatedSymptoms: ["fall", "nearFall", "dizziness"],
    }),
    finding({
      key: "cascade-ccb-edema-loop|med-amlodipine+med-furosemide",
      category: "prescribing_cascade",
      title: "Amlodipine then furosemide for ankle swelling",
      medIds: ["med-amlodipine", "med-furosemide"],
      plain:
        "Furosemide was started for ankle swelling 45 days after amlodipine. Ankle swelling is a recognized effect of amlodipine, a pattern known as a possible prescribing cascade.",
      clinician: "CCB-induced peripheral edema treated with a loop diuretic (prescribing cascade).",
      question: "Was the ankle swelling that led to furosemide related to amlodipine, and is furosemide still needed?",
      sourceIds: ["cascade2017"],
      relatedSymptoms: ["swelling"],
    }),
  ];
  return {
    findings,
    acb: {
      total: 7,
      band: "high",
      contributors: [
        { medId: "med-tylenolpm", ingredientId: "diphenhydramine", score: 3 },
        { medId: "med-oxybutynin", ingredientId: "oxybutynin", score: 3 },
        { medId: "med-furosemide", ingredientId: "furosemide", score: 1 },
      ],
    },
    fallRiskMedIds: ["med-amlodipine", "med-furosemide", "med-lorazepam", "med-tylenolpm"],
    unmatchedMedIds: [],
    effectiveConditions: [
      { tag: "hypertension", from: "profile" },
      { tag: "type2_diabetes", from: "profile" },
      { tag: "urinary_incontinence", from: "profile" },
      { tag: "insomnia", from: "profile" },
      { tag: "osteoarthritis", from: "profile" },
      { tag: "history_of_falls", from: "diary" },
    ],
    notices: [],
    kbVersion: "test-kb-1",
  };
}

export interface MargaretWorld {
  data: StoreData;
  review: MedReview;
  timeline: TimelineReport;
}

export function margaret(today = TODAY): MargaretWorld {
  const data = createSeed(today);
  const timeline = analyzeTimeline({ checkIns: data.checkIns, meds: data.medications, today, isKnownEffect, medEvents: data.medEvents });
  return { data, review: margaretReview(), timeline };
}

/** Phrases the brief must never contain (SPEC §3). "urgent care" is a prescriber name, not urgency. */
export const BANNED_IN_TEMPLATE: RegExp[] = [
  /\bcaused\b/i,
  /\bcausing\b/i,
  /\bsafe(?:ly|r|st)?\b/i,
  /\bshould stop\b/i,
  /\burgent(?:ly)?\b(?!\s+care)/i,
  /\bdiagnos\w*/i,
  /\bdangerous\b/i,
  /\brisk score\b/i,
  /\byou should\b/i,
];
