// Derived, deterministic views of the record (medication review + timeline signals), memoised on the
// record revision so every screen shows the same numbers.
import { useMemo } from "react";
import type { Medication, MedReview, TimelineAnalysis, WeeklyTrend } from "../model/types";
import { useStore } from "./StoreProvider";
import { recordTimeline } from "./recordTimeline";
import { activeMeds, reviewMedications } from "../engine/meds/review";
import { weeklyTrends } from "../engine/timeline/signals";

export interface Derived {
  review: MedReview;
  timeline: TimelineAnalysis;
  weekly: WeeklyTrend[];
  active: Medication[];
}

export function useDerived(): Derived {
  const { data, today } = useStore();
  return useMemo(() => {
    const timeline = recordTimeline(data, today);
    const review = reviewMedications({
      meds: data.medications,
      profile: data.profile,
      checkIns: data.checkIns,
      today,
      signals: timeline.signals,
    });
    return {
      review,
      timeline,
      weekly: weeklyTrends(data.checkIns, today),
      active: activeMeds(data.medications, today),
    };
    // The store bumps `revision` on every edit to the profile, medicines or check-ins (src/model/store.ts), so
    // revision, dataset and today are the only dependencies needed. Listing `data` itself would also recompute
    // after edits that cannot change these numbers (settings, saved briefs).
  }, [data.revision, data.datasetId, today]);
}
