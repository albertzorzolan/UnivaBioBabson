// Vitest config for measuring the claim checks as they were submitted (commit 375e1e0), so the "before" numbers
// of the red-team benchmark can be reproduced instead of trusted (eval/VERIFIER-REDTEAM.md, "How to run").
//
//   mkdir -p tmp/verifier-head && git archive 375e1e0 src | tar -x -C tmp/verifier-head
//   KINWISE_REDTEAM_RECORD_BEFORE=1 npx vitest run --config eval/verifier-baseline.config.ts eval/verifier.eval.test.ts
//   npx vitest run eval/verifier.eval.test.ts        (then re-run on today's code; it copies the "before" block forward)
//
// Every import of src/engine/brief/verify (from the template and Ask engines and the eval) and the eval's import of
// src/ai/tasks are redirected to the submitted copies; the submitted tasks.ts then resolves its own imports inside
// that copy. With KINWISE_VERIFIER=current the aliases are off and the same files run on today's code, which is how
// eval/verifier-engine-diff.check.ts compares the two.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const SUBMITTED = fileURLToPath(new URL("../tmp/verifier-head/src/engine/brief/verify.ts", import.meta.url));
const SUBMITTED_TASKS = fileURLToPath(new URL("../tmp/verifier-head/src/ai/tasks.ts", import.meta.url));
const useSubmitted = process.env.KINWISE_VERIFIER !== "current";

export default defineConfig({
  resolve: {
    alias: useSubmitted
      ? [
          { find: /^(?:\.\.\/)+(?:src\/)?engine\/brief\/verify$/, replacement: SUBMITTED },
          { find: /^\.\/verify$/, replacement: SUBMITTED },
          { find: /^\.\.\/src\/ai\/tasks$/, replacement: SUBMITTED_TASKS },
        ]
      : [],
  },
  test: { environment: "node", include: ["eval/verifier.eval.test.ts", "eval/verifier-engine-diff.check.ts"] },
});
