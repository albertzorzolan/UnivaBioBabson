import type {
  Answers,
  Day,
  Evidence,
  Fact,
  Field,
  Source,
  Role,
  Provenance,
} from "./types";
import { validDay } from "./contracts/validators";
export const EMPTY: Answers = {
  energy: null,
  dizziness: null,
  dizzinessSeverity: null,
  confusion: null,
  appetite: null,
  sleep: null,
  fallsOrNearFalls: null,
};
export const LABELS: Record<Field, string> = {
  energy: "Energy",
  dizziness: "Dizziness",
  dizzinessSeverity: "Dizziness self-rating",
  confusion: "Memory fog",
  appetite: "Appetite",
  sleep: "Sleep quality",
  fallsOrNearFalls: "Falls or near-falls",
};
export const KEYS = {
  source: "medwatch.demo.source",
  session: "medwatch.demo.session",
  derived: "medwatch.demo.derived",
  drafts: "medwatch.demo.drafts",
  reports: "medwatch.demo.reports",
};
export function validSource(value: unknown): value is Source {
  if (!value || typeof value !== "object") return false;
  const s = value as Source;
  const date = (x: unknown) =>
    typeof x === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(x) &&
    localDate(new Date(`${x}T12:00:00`)) === x;
  const text = (x: unknown, max: number) =>
    typeof x === "string" && x.length <= max;
  if (
    s.schemaVersion !== "1.0" ||
    s.isDemoData !== true ||
    !text(s.datasetId, 128) ||
    !s.datasetId ||
    !Number.isSafeInteger(s.sourceRevision) ||
    s.sourceRevision < 1
  )
    return false;
  if (
    ![s.days, s.revisions, s.medications, s.medicationEvents, s.notes].every(
      Array.isArray,
    )
  )
    return false;
  if (
    ![...s.days, ...s.revisions].every(
      (d) =>
        validDay(d) &&
        d.datasetId === s.datasetId &&
        Object.entries(d.answers).every(([f, v]) => {
          const p = d.answerProvenance[f as Field];
          return (
            (p.origin !== "user_skipped" || v === null) &&
            p.sourceSpans.every(
              (span) => d.rawStory.slice(span.start, span.end) === span.quote,
            )
          );
        }),
    )
  )
    return false;
  if (
    new Set(s.days.map((d) => d.dateLocal)).size !== s.days.length ||
    new Set(s.days.map((d) => d.id)).size !== s.days.length
  )
    return false;
  if (
    !s.medications.every(
      (m) =>
        m &&
        text(m.id, 128) &&
        text(m.name, 120) &&
        !!m.name &&
        text(m.dose, 120) &&
        text(m.schedule, 120) &&
        text(m.prescriber, 120) &&
        text(m.reason, 160) &&
        date(m.startDate) &&
        (m.endDate === null || (date(m.endDate) && m.endDate >= m.startDate)),
    )
  )
    return false;
  if (
    !s.medicationEvents.every(
      (e) =>
        e &&
        text(e.id, 128) &&
        text(e.label, 300) &&
        date(e.dateLocal) &&
        ["started", "stopped", "record_corrected", "added_to_list"].includes(
          e.kind,
        ) &&
        s.medications.some((m) => m.id === e.medicationId),
    )
  )
    return false;
  if (
    !s.notes.every(
      (n) =>
        n &&
        text(n.id, 128) &&
        text(n.text, 1000) &&
        date(n.dateLocal) &&
        ["patient", "caregiver"].includes(n.role) &&
        typeof n.pinned === "boolean",
    )
  )
    return false;
  return true;
}
export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function shiftDate(date: string, by: number) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + by);
  return localDate(d);
}
export function dateLabel(date: string, long = false) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    month: long ? "long" : "short",
    day: "numeric",
    ...(long ? { year: "numeric" } : {}),
  });
}
export function displayValue(field: Field, v: Answers[Field]) {
  if (v === null) return "Not recorded";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (field === "dizzinessSeverity")
    return ["", "Mild", "Moderate", "Severe"][Number(v)];
  if (field === "energy" || field === "sleep") return `${v} / 5`;
  return v === "same"
    ? "About the same"
    : String(v).replace(/^./, (x) => x.toUpperCase());
}
export function provenance(
  answers: Answers,
  origin: Provenance["origin"] = "manual",
): Record<Field, Provenance> {
  return Object.fromEntries(
    Object.entries(answers).map(([k, v]) => [
      k,
      { origin: v === null ? "user_skipped" : origin, sourceSpans: [] },
    ]),
  ) as unknown as Record<Field, Provenance>;
}
export function newDay(
  source: Source,
  date: string,
  answers: Answers,
  rawStory: string,
  origin: Day["confirmationMethod"] = "manual_form",
  p = provenance(answers),
): Day {
  const old = source.days.find((x) => x.dateLocal === date);
  const now = new Date().toISOString();
  return {
    schemaVersion: "1.0",
    id: old?.id ?? `day-${crypto.randomUUID()}`,
    datasetId: source.datasetId,
    dateLocal: date,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    reporterRole: "patient",
    isDemoData: true,
    rawStory,
    answers: {
      ...answers,
      dizzinessSeverity:
        answers.dizziness === true ? answers.dizzinessSeverity : null,
    },
    answerProvenance: p,
    confirmationMethod: origin,
    confirmedAt: now,
    createdAt: old?.createdAt ?? now,
    updatedAt: now,
    recordRevision: (old?.recordRevision ?? 0) + 1,
  };
}
export function seedSource(today = localDate()): Source {
  const now = new Date().toISOString();
  const s: Source = {
    schemaVersion: "1.0",
    datasetId: crypto.randomUUID(),
    sourceRevision: 1,
    isDemoData: true,
    createdAt: now,
    updatedAt: now,
    days: [],
    revisions: [],
    medications: [],
    medicationEvents: [],
    notes: [],
  };
  for (let i = 28; i >= 1; i--) {
    if ([4, 12, 19].includes(i)) continue;
    const answers: Answers = {
      energy: [3, 4, 3, 2, 4, 3, 2][i % 7],
      dizziness: [2, 3, 7, 9, 15, 23].includes(i),
      dizzinessSeverity: [2, 3, 7, 9, 15, 23].includes(i) ? 1 : null,
      confusion: [5, 16].includes(i),
      appetite: i % 6 === 0 ? "worse" : "same",
      sleep: i % 5 === 0 ? null : [3, 4, 4, 2, 3][i % 5],
      fallsOrNearFalls: i === 9,
    };
    const date = shiftDate(today, -i);
    const d = newDay(
      s,
      date,
      answers,
      i === 2
        ? "I felt a little dizzy while gardening. My energy was 3 out of 5."
        : i === 7
          ? "Enjoyed a short walk after breakfast."
          : i === 9
            ? "I almost fell when getting up from the sofa. I did not fall."
            : "",
      "seed_fixture",
      provenance(answers, "seed_fixture"),
    );
    d.id = `day-demo-${date}`;
    s.days.push(d);
  }
  s.medications = [
    {
      id: "med-lisinopril",
      name: "Lisinopril",
      dose: "10 mg",
      schedule: "Once daily · morning",
      reason: "Recorded on fictional list",
      prescriber: "Dr. Jordan Lee (fictional)",
      startDate: shiftDate(today, -90),
      endDate: null,
    },
    {
      id: "med-metformin",
      name: "Metformin",
      dose: "500 mg",
      schedule: "Twice daily · with meals",
      reason: "Recorded on fictional list",
      prescriber: "Dr. Jordan Lee (fictional)",
      startDate: shiftDate(today, -60),
      endDate: null,
    },
    {
      id: "med-atorvastatin",
      name: "Atorvastatin",
      dose: "20 mg",
      schedule: "Once daily · evening",
      reason: "Recorded on fictional list",
      prescriber: "Dr. Jordan Lee (fictional)",
      startDate: shiftDate(today, -17),
      endDate: null,
    },
  ];
  s.medicationEvents = [
    {
      id: "event-atorvastatin",
      medicationId: "med-atorvastatin",
      dateLocal: shiftDate(today, -17),
      kind: "started",
      label: "Atorvastatin · recorded start date",
    },
  ];
  s.notes = [
    {
      id: "note-demo-1",
      dateLocal: shiftDate(today, -2),
      text: "Margaret mentioned feeling dizzy while gardening. I would like to bring her notes to our next visit.",
      role: "caregiver",
      pinned: true,
    },
    {
      id: "note-demo-2",
      dateLocal: shiftDate(today, -6),
      text: "We went through the medication list together and checked the names on the fictional labels.",
      role: "caregiver",
      pinned: false,
    },
  ];
  return s;
}
export function rangeDays(source: Source, from: string, to: string) {
  return source.days
    .filter((d) => d.dateLocal >= from && d.dateLocal <= to)
    .sort((a, b) => a.dateLocal.localeCompare(b.dateLocal));
}
export function countField(days: Day[], field: Field) {
  const answered = days.filter((d) => d.answers[field] !== null);
  return {
    answered: answered.length,
    positive: answered.filter((d) => d.answers[field] === true).length,
    ids: answered.map((d) => `entry:${d.id}`),
  };
}
export function factsFor(source: Source, from: string, to: string): Fact[] {
  const days = rangeDays(source, from, to);
  const total =
    Math.round(
      (new Date(`${to}T12:00:00`).getTime() -
        new Date(`${from}T12:00:00`).getTime()) /
        86400000,
    ) + 1;
  const dizzy = countField(days, "dizziness");
  const energy = days.filter((d) => d.answers.energy !== null);
  const falls = countField(days, "fallsOrNearFalls");
  return [
    {
      id: "fact:coverage",
      label: "Days recorded",
      value: `${days.length}`,
      detail: `of ${total} days in this period`,
      text: `${days.length} of ${total} calendar days have a confirmed patient entry. Missing days have no recorded answer.`,
      entryIds: days.map((d) => `entry:${d.id}`),
    },
    {
      id: "fact:dizziness",
      label: "Dizziness recorded",
      value: `${dizzy.positive}`,
      detail: `of ${dizzy.answered} answered days`,
      text: `Dizziness was recorded on ${dizzy.positive} of ${dizzy.answered} days with an answer.`,
      entryIds: dizzy.ids,
    },
    {
      id: "fact:energy",
      label: "Average energy",
      value: energy.length
        ? (
            energy.reduce((n, d) => n + (d.answers.energy ?? 0), 0) /
            energy.length
          ).toFixed(1)
        : "—",
      detail: `out of 5 · ${energy.length} answered days`,
      text: energy.length
        ? `Average self-reported energy was ${(energy.reduce((n, d) => n + (d.answers.energy ?? 0), 0) / energy.length).toFixed(1)} out of 5 across ${energy.length} answered days.`
        : "No energy ratings recorded.",
      entryIds: energy.map((d) => `entry:${d.id}`),
    },
    {
      id: "fact:falls",
      label: "Falls or near-falls",
      value: `${falls.positive}`,
      detail: `of ${falls.answered} answered days`,
      text: `Falls or near-falls were recorded on ${falls.positive} of ${falls.answered} days with an answer.`,
      entryIds: falls.ids,
    },
  ];
}
export function evidenceFor(s: Source, from: string, to: string): Evidence[] {
  return [
    ...factsFor(s, from, to).map((f) => ({ id: f.id, text: f.text })),
    ...rangeDays(s, from, to).map((d) => ({
      id: `entry:${d.id}`,
      text: `Patient record ${d.dateLocal}: ${Object.entries(d.answers)
        .map(
          ([f, v]) => `${LABELS[f as Field]}: ${displayValue(f as Field, v)}`,
        )
        .join("; ")}. Patient's words: ${d.rawStory || "No note."}`,
    })),
    ...s.notes
      .filter((n) => n.dateLocal >= from && n.dateLocal <= to)
      .map((n) => ({
        id: `${n.pinned ? "concern" : "note"}:${n.id}`,
        text: `${n.role} note ${n.dateLocal}: ${n.text}`,
      })),
  ];
}
export function compareWindows(
  before: Day[],
  after: Day[],
  field: Field = "dizziness",
) {
  const b = countField(before, field),
    a = countField(after, field);
  return {
    before: b,
    after: a,
    sufficient: b.answered >= 7 && a.answered >= 7,
    relativeChange:
      b.positive === 0 || a.answered === 0
        ? null
        : ((a.positive / a.answered - b.positive / b.answered) /
            (b.positive / b.answered)) *
          100,
  };
}
export function sourceCommit(
  current: Source,
  next: Source,
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
  role: Role,
) {
  if (!validSource(next))
    throw new Error(
      "This record is incomplete or invalid. Check your entries before saving.",
    );
  const latest = storage.getItem(KEYS.source);
  if (latest) {
    const parsed = JSON.parse(latest) as Source;
    if (
      parsed.datasetId !== current.datasetId ||
      parsed.sourceRevision !== current.sourceRevision
    )
      throw new Error(
        "The record changed in another tab. Reload before saving.",
      );
  }
  if (
    role === "caregiver" &&
    (JSON.stringify(next.days) !== JSON.stringify(current.days) ||
      JSON.stringify(next.revisions) !== JSON.stringify(current.revisions))
  )
    throw new Error("Only the patient can change daily answers.");
  if (
    role === "patient" &&
    (JSON.stringify(next.medications) !== JSON.stringify(current.medications) ||
      JSON.stringify(next.medicationEvents) !==
        JSON.stringify(current.medicationEvents))
  )
    throw new Error("Only the caregiver can edit the medication list.");
  if (
    JSON.stringify(next.notes.filter((n) => n.role !== role)) !==
    JSON.stringify(current.notes.filter((n) => n.role !== role))
  )
    throw new Error("You can only edit your own notes.");
  const updated = {
    ...next,
    sourceRevision: current.sourceRevision + 1,
    updatedAt: new Date().toISOString(),
  };
  storage.setItem(KEYS.source, JSON.stringify(updated));
  for (const k of [KEYS.derived, KEYS.drafts, KEYS.reports])
    storage.removeItem(k);
  return updated;
}
