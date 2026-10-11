// Proof points for the Welcome page, read from the committed evaluation results (npm run eval:nlp / eval:meds)
// so the landing page can never drift from what the test suites actually measured. Named imports let the
// bundler keep only these fields of the (large) results files.
import { heldout } from "../../../eval/results/nlp-eval.json";
import { summary as medSummary } from "../../../eval/results/meds-eval.json";

export interface ProofPoint {
  key: string;
  figure: string;
  label: string;
  /** How it works section to open (?section=). */
  section: string;
}

export const HELDOUT_F1_PCT = Math.round(heldout.micro.f1 * 100);
export const HELDOUT_CASES = heldout.cases;
export const MED_CASES_PASSED = medSummary.casesPassed;
export const MED_CASES = medSummary.cases;

export const PROOF_POINTS: ProofPoint[] = [
  {
    key: "nlp",
    figure: `${HELDOUT_F1_PCT}% F1`,
    label: `on ${HELDOUT_CASES} held-out diary stories (fictional, written separately from the dev set)`,
    section: "how-evaluation",
  },
  {
    key: "meds",
    figure: `${MED_CASES_PASSED}/${MED_CASES}`,
    label: "medication-review test cases pass (Beers 2023, ACB, fall-risk)",
    section: "how-evaluation",
  },
  {
    key: "device",
    figure: "On-device",
    label: "Runs on this device; nothing is sent anywhere",
    section: "how-trust",
  },
];
