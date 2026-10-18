// Derived, deterministic views of the record (medication review + timeline signals), memoised on the
// record revision so every screen shows the same numbers.
import { useMemo } from "react";
import type { Medication, MedReview, MetricKey, TimelineAnalysis, WeeklyTrend } from "../model/types";
import { useStore } from "./StoreProvider";
import { activeMeds, reviewMedications } from "../engine/meds/review";
import { analyzeTimeline, weeklyTrends } from "../engine/timeline/signals";
import { knownEffect } from "../kb";

export interface Derived {
  review: MedReview;
  timeline: TimelineAnalysis;
  weekly: WeeklyTrend[];
  active: Medication[];
}

export function useDerived(): Derived {
  const { data, today } = useStore();
  return useMemo(() => {
    const isKnownEffect = (med: Medication, m: MetricKey) => knownEffect(med.ingredientIds, m);
    const timeline = analyzeTimeline({ checkIns: data.checkIns, meds: data.medications, today, isKnownEffect });
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
