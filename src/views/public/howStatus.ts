// How it works › "Finished vs planned": the canonical Working / Partial / Planned split, worded for the page.
// It mirrors the Status table in README.md and submission/DEVPOST.md; change all three together.
//
// The scripted demo video reads the Partial row off the screen (scripts/submission/record-demo.mjs,
// CHOOSE.honesty), so its narration always names what this table marks Partial.

export type Status = "working" | "partial" | "planned";

export interface StatusItem {
  item: string;
  detail?: string;
}

export interface StatusGroup {
  status: Status;
  items: StatusItem[];
}

/** Knowledge-base counts come from kbCoverage() so the "Partial" line can never drift from the bundled data. */
export function statusGroups(coverage: { drugs?: number; beersRules?: number }): StatusGroup[] {
  return [
    {
      status: "working",
      items: [
        { item: "Public live demo" },
        { item: "Check-in in her own words", detail: "on-device language processing" },
        { item: "Medicine matching", detail: "brands, misspellings" },
        { item: "Cited medication review" },
        { item: "Before/after timeline" },
        { item: "Ask Kinwise" },
        { item: "Visit brief with review gate" },
        { item: "Medication list and FHIR R4 export" },
        { item: "Backup and delete-all" },
      ],
    },
    {
      status: "partial",
      items: [
        {
          item: "On-device language model",
          detail:
            "desktop Chrome or Edge with WebGPU, tested on one Apple M1 Pro; the code check is not airtight; the default Qwen2.5-3B has a research-only licence (Apache-2.0 models in Settings)",
        },
        { item: "Patient-to-caregiver hand-off", detail: "one shared browser today, or a backup file" },
        { item: "FHIR", detail: "no receiving system yet" },
        {
          item: "Knowledge-base coverage",
          detail: `${coverage.drugs ?? 0} medicines and ${coverage.beersRules ?? 0} Beers rules; not reviewed by a clinician; no dose or allergy checks`,
        },
        { item: "English only" },
      ],
    },
    {
      status: "planned",
      items: [
        { item: "Encrypted family sharing" },
        { item: "Encryption of the local record" },
        { item: "Pharmacist review of the knowledge base" },
        { item: "A validation pilot" },
        { item: "Pharmacy and patient-portal import" },
        { item: "Voice check-ins and Spanish" },
      ],
    },
  ];
}

/** The verifier gap seen in eval/results/ai-live.json (verdict), stated where judges read the limits. */
export const VERIFIER_GAP_LIMITATION =
  "In our recorded live run the code check let at least 3 flawed AI outputs through; AI text is always labelled, the template stays the default, and nothing reaches the brief without the caregiver’s review.";

/** Most important first: How it works shows the first two (LIMITS_SHOWN in HowItWorks.tsx) and folds the rest. */
export const LIMITATIONS: string[] = [
  "All people and records in this demo are fictional. Kinwise has not been tested with real patients, caregivers or clinicians.",
  VERIFIER_GAP_LIMITATION,
  "Before/after comparisons describe a change in what was recorded. They do not show that a medicine was responsible and are not adjusted for other changes (those are listed instead); short windows have little statistical power.",
  "The benchmarks are small and written by the team (the held-out set by a separate author); they show the software follows its rules, not that it improves care.",
  "The diary is self-reported. Unanswered days are left out of every rate, never counted as “no”.",
  "The language engine is rule-based and English-only; unusual phrasing can be missed, which is why every answer is confirmed.",
  "A medicine outside the knowledge base is “not reviewed”. That says nothing about the medicine; ask the pharmacist.",
  "Records live in this browser only. Clearing site data deletes them; export a copy first.",
];
