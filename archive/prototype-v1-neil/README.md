# MedWatch

Medication safety, symptom monitoring and deprescribing-awareness for older adults and their caregivers.
Hackathon prototype for UnivaBio "AI for Human Health".

> MedWatch is a discussion aid, not medical advice. Flags come from a small illustrative rule set and are not a diagnosis.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build
```

## Demo accounts

| Role      | Username  | Password  |
|-----------|-----------|-----------|
| Patient   | `babson`  | `babson`  |
| Caregiver | `babson1` | `babson1` |

On first load, the app seeds a fictional patient (Margaret, 78). She has 4 medications and about 4 weeks of check-ins. Lorazepam was started 14 days ago, and dizziness, confusion and low energy rise after that date. To restore this dataset, use **Caregiver → Settings → Reset demo data**.

## How it works

All data stays in the browser's `localStorage` (`mw.*` keys). There is no backend.

| Piece | Where |
|---|---|
| Risk table (31 drug groups, loosely modeled on Beers Criteria themes) | `src/data/riskTable.ts` |
| Flag engine: single-drug flags, duplicates, combinations (opioid + sedative, anticholinergic burden, NSAID + blood thinner, "triple whammy", 3+ CNS-active, 3+ BP-lowering), polypharmacy | `src/lib/flags.ts` |
| Correlation engine: for each medication, compares the 14 days before its start date with the 14 days after. It needs at least 5 check-ins in each window and 7 days on the drug, and otherwise reports "not enough data" | `src/lib/correlation.ts` |
| Optional OpenFDA label lookup: sends only the drug name, and results are cached | `src/lib/openfda.ts` |
| Seed data | `src/lib/seed.ts` |
| Patient view (large type, 3 tabs) | `src/patient/` |
| Caregiver dashboard, charts, flags, printable summary | `src/caregiver/` |

Out of scope for this phase: wearable integration (the button is shown but disabled), real accounts, and cloud sync.
