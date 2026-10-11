// Numbers shown in the Welcome page's "How it fits together" illustration. They are written out (not computed
// at render time) so the landing page stays light, and journeyFigures.test.ts checks them against the timeline
// engine on the demo seed — the same counts Overview, Timeline, the tour, the Brief and Ask show.

/** Dizziness on answered days, before and after lorazepam started (demo seed). */
export const JOURNEY_DIZZINESS = {
  before: { positive: 2, answered: 19 },
  after: { positive: 9, answered: 14 },
} as const;

const { before, after } = JOURNEY_DIZZINESS;

export const JOURNEY_BEFORE_LABEL = `${before.positive} of ${before.answered} days`;
export const JOURNEY_AFTER_LABEL = `${after.positive} of ${after.answered} days`;
/** Bar widths (percent of the track), rounded to one decimal. */
export const JOURNEY_BEFORE_PCT = Math.round((before.positive / before.answered) * 1000) / 10;
export const JOURNEY_AFTER_PCT = Math.round((after.positive / after.answered) * 1000) / 10;
export const JOURNEY_QUESTION = `Dizziness was recorded on ${after.positive} of ${after.answered} answered days after lorazepam started, compared with ${before.positive} of ${before.answered} before. Is this medicine worth reviewing?`;
