// What a review card says when "Explain in simpler words" does not produce a checked wording (explainFailure).
import { describe, expect, it } from "vitest";
import { AIValidationError, LLMError } from "../../../ai";
import { BLOCKED_NOTE, explainFailure } from "./FindingCard";

describe("explainFailure", () => {
  const dropped = [{ section: "explanation", text: "Pausing the lorazepam would stop the dizziness.", issues: ['banned: advice: names a medicine together with an action word ("pausing")'] }];

  it("keeps the sentences the check removed, for the 'What the check removed' list", () => {
    const r = explainFailure(new AIValidationError("did not pass", dropped, "{}"));
    expect(r.message).toBe(BLOCKED_NOTE);
    expect(BLOCKED_NOTE).toBe("The code check rejected the AI wording, so only the records-based text is shown.");
    expect(r.dropped).toEqual(dropped);
  });

  it("says the model couldn't finish for any other failure, with nothing to list", () => {
    const r = explainFailure(new LLMError("timeout", "took too long"));
    expect(r.message).toBe("The on-device model couldn’t finish this time. The original text above stays.");
    expect(r.dropped).toEqual([]);
  });
});
