import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { StoreData, VisitBrief } from "../../model/types";
import { addDays } from "../../model/dates";
import { buildEvidence } from "./evidence";
import {
  APPETITE_CODES,
  CONCEPT_CODES,
  DEMO_TAG,
  DIARY_CODES,
  ISSUE_CODES,
  TEST_DATA_LABEL,
  bundleSummary,
  bundleToJson,
  collectReferences,
  deterministicUuid,
  fhirFileName,
  toFhirBundle,
  validateBundle,
} from "./fhir";
import type { FhirBundle, FhirResource } from "./fhir";
import { templateBrief, templateGenerationInfo, toVisitBrief } from "./template";
import { FAKE_KB, FROM, TODAY, margaret } from "./test-fixtures";
import type { BriefKb } from "./shared";

function world(mutate?: (d: StoreData) => void) {
  const w = margaret();
  mutate?.(w.data);
  const pkg = buildEvidence({ data: w.data, from: FROM, to: TODAY, review: w.review, timeline: w.timeline, kb: FAKE_KB });
  const content = templateBrief(pkg, { data: w.data, review: w.review, timeline: w.timeline, kb: FAKE_KB });
  const brief = toVisitBrief({ id: "brief-test", pkg, content, generation: templateGenerationInfo(pkg, w.review), data: w.data });
  return { ...w, pkg, brief };
}

function bundleFor(opts: { brief?: VisitBrief | null; kb?: BriefKb; mutate?: (d: StoreData) => void } = {}) {
  const w = world(opts.mutate);
  const brief = opts.brief === undefined ? w.brief : opts.brief;
  return { w, bundle: toFhirBundle({ data: w.data, review: w.review, brief, today: TODAY, kb: opts.kb ?? FAKE_KB }) };
}

const of = (b: FhirBundle, type: string): FhirResource[] => b.entry.map((e) => e.resource).filter((r) => r.resourceType === type);

describe("toFhirBundle — document shape", () => {
  const { bundle } = bundleFor();

  it("is a document bundle with a Composition first, an identifier and an instant timestamp", () => {
    expect(bundle.resourceType).toBe("Bundle");
    expect(bundle.type).toBe("document");
    expect(bundle.entry[0].resource.resourceType).toBe("Composition");
    expect(bundle.identifier.system).toBe("urn:ietf:rfc:3986");
    expect(bundle.identifier.value).toMatch(/^urn:uuid:/);
    expect(bundle.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
  });

  it("passes structural validation", () => {
    expect(validateBundle(bundle)).toEqual([]);
    expect(bundleSummary(bundle).valid).toBe(true);
  });

  it("resolves every reference inside the bundle and makes every entry reachable from the Composition", () => {
    const urls = new Set(bundle.entry.map((e) => e.fullUrl));
    for (const e of bundle.entry) for (const r of collectReferences(e.resource)) expect(urls.has(r), r).toBe(true);
    // Reachability: walk references from the Composition.
    const byUrl = new Map(bundle.entry.map((e) => [e.fullUrl, e.resource]));
    const seen = new Set<string>([bundle.entry[0].fullUrl]);
    const queue = [bundle.entry[0].resource];
    while (queue.length) {
      for (const r of collectReferences(queue.pop())) {
        if (!seen.has(r)) {
          seen.add(r);
          queue.push(byUrl.get(r)!);
        }
      }
    }
    expect(seen.size).toBe(bundle.entry.length);
  });

  it("uses urn:uuid fullUrls that match RFC 4122-shaped, unique resource ids", () => {
    const ids = bundle.entry.map((e) => e.resource.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of bundle.entry) {
      expect(e.fullUrl).toBe(`urn:uuid:${e.resource.id}`);
      expect(e.resource.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });

  it("is deterministic: the same record exports byte-identical JSON", () => {
    expect(bundleToJson(bundleFor().bundle)).toBe(bundleToJson(bundle));
  });

  it("gives a different dataset different ids", () => {
    const other = bundleFor({ mutate: (d) => (d.datasetId = "another-dataset") }).bundle;
    expect(other.entry[1].resource.id).not.toBe(bundle.entry[1].resource.id);
  });

  it("labels the bundle and every resource as fictional demo data (custom tag + HL7 HTEST)", () => {
    expect(bundle.meta?.tag).toContainEqual(DEMO_TAG);
    expect(bundle.meta?.tag?.[0].code).toBe("fictional-demo-data");
    for (const e of bundle.entry) {
      expect(e.resource.meta?.tag).toContainEqual(DEMO_TAG);
      expect(e.resource.meta?.security).toContainEqual(TEST_DATA_LABEL);
    }
  });

  it("drops the demo labels for a family's own record", () => {
    const own = bundleFor({ mutate: (d) => (d.isDemoData = false) }).bundle;
    expect(own.meta).toBeUndefined();
    expect(own.entry.every((e) => e.resource.meta === undefined)).toBe(true);
    expect(validateBundle(own)).toEqual([]);
  });

  it("gives every resource a generated XHTML narrative", () => {
    for (const e of bundle.entry) {
      expect(e.resource.text?.status).toBe("generated");
      expect(e.resource.text?.div.startsWith('<div xmlns="http://www.w3.org/1999/xhtml">')).toBe(true);
    }
  });
});

describe("toFhirBundle — people", () => {
  const { bundle } = bundleFor();

  it("exports a fictional Patient with a name and no identifiers or birth date", () => {
    const [patient] = of(bundle, "Patient");
    expect(patient.identifier).toBeUndefined();
    expect(patient.birthDate).toBeUndefined();
    expect(patient.gender).toBe("female");
    expect(patient.name).toEqual([{ use: "usual", text: "Margaret Rivera", family: "Rivera", given: ["Margaret"] }]);
    expect(patient.text?.div).toContain("Fictional demo patient");
  });

  it("exports the caregiver as a RelatedPerson coded as daughter", () => {
    const [rp] = of(bundle, "RelatedPerson");
    const patientUrl = bundle.entry.find((e) => e.resource.resourceType === "Patient")!.fullUrl;
    expect((rp.patient as { reference: string }).reference).toBe(patientUrl);
    expect(JSON.stringify(rp.relationship)).toContain('"code":"DAUC"');
  });
});

describe("toFhirBundle — medicines", () => {
  it("has one MedicationStatement per listed medicine, sourced from the caregiver", () => {
    const { w, bundle } = bundleFor();
    const ms = of(bundle, "MedicationStatement");
    expect(ms).toHaveLength(w.data.medications.length);
    const rpUrl = bundle.entry.find((e) => e.resource.resourceType === "RelatedPerson")!.fullUrl;
    for (const m of ms) {
      expect((m.informationSource as { reference: string }).reference).toBe(rpUrl);
      expect(m.status).toBe("active");
      expect((m.category as { coding: { code: string }[] }).coding[0].code).toBe("patientspecified");
    }
  });

  it("codes single-ingredient medicines with RxNorm when the KB has a verified RxCUI", () => {
    const { bundle } = bundleFor();
    const lorazepam = of(bundle, "MedicationStatement").find((m) => JSON.stringify(m).includes("Lorazepam (Ativan)"))!;
    expect(lorazepam.medicationCodeableConcept).toEqual({
      coding: [{ system: "http://www.nlm.nih.gov/research/umls/rxnorm", code: "6470", display: "lorazepam" }],
      text: "Lorazepam (Ativan)",
    });
    expect((lorazepam.dosage as { text: string }[])[0].text).toBe("0.5 mg at bedtime");
    expect((lorazepam.reasonCode as { text: string }[])[0].text).toMatch(/anxiety/i);
    expect(JSON.stringify(lorazepam.note)).toContain("Urgent care");
  });

  it("falls back to text only when no RxCUI is known", () => {
    const noRx: BriefKb = { ...FAKE_KB, rxcui: () => null };
    const { bundle } = bundleFor({ kb: noRx });
    for (const m of of(bundle, "MedicationStatement")) {
      if (m.medicationCodeableConcept) expect((m.medicationCodeableConcept as { coding?: unknown }).coding).toBeUndefined();
    }
    expect(validateBundle(bundle)).toEqual([]);
  });

  it("exports a combination product as a Medication with one coded ingredient each", () => {
    const { bundle } = bundleFor();
    const [med] = of(bundle, "Medication");
    expect((med.code as { text: string }).text).toBe("Tylenol PM (OTC)");
    const codes = (med.ingredient as { itemCodeableConcept: { coding: { code: string }[] } }[]).map((i) => i.itemCodeableConcept.coding[0].code);
    expect(codes.sort()).toEqual(["161", "3498"]);
    const ms = of(bundle, "MedicationStatement").find((m) => m.medicationReference)!;
    expect((ms.medicationReference as { reference: string }).reference).toBe(`urn:uuid:${med.id}`);
    expect(JSON.stringify(ms.dosage)).toContain('"asNeededBoolean":true');
    expect(JSON.stringify(ms.note)).toContain("over the counter");
  });

  it("marks a medicine stopped before today as completed with an end date", () => {
    const end = addDays(TODAY, -3);
    const { bundle } = bundleFor({ mutate: (d) => (d.medications.find((m) => m.id === "med-amlodipine")!.endDate = end) });
    const ms = of(bundle, "MedicationStatement").find((m) => JSON.stringify(m.medicationCodeableConcept ?? "").includes("Amlodipine"))!;
    expect(ms.status).toBe("completed");
    expect((ms.effectivePeriod as { end: string }).end).toBe(end);
    expect(validateBundle(bundle)).toEqual([]);
  });
});

describe("toFhirBundle — diary observations", () => {
  const { w, bundle } = bundleFor();
  const obs = of(bundle, "Observation");
  const inPeriod = w.data.checkIns.filter((c) => c.date >= FROM && c.date <= TODAY);

  it("exports one Observation per answered item per day, never an unanswered one", () => {
    const latest = new Map<string, (typeof inPeriod)[number]>();
    for (const c of inPeriod) if (!latest.has(c.date) || c.revision > latest.get(c.date)!.revision) latest.set(c.date, c);
    let expected = 0;
    for (const c of latest.values()) {
      const a = c.answers;
      expected += ["energy", "sleep", "appetite", "dizziness", "drowsiness", "confusion", "fall", "nearFall", "swelling"].filter(
        (k) => a[k as keyof typeof a] !== null,
      ).length;
      if (c.story.trim()) expected += 1;
      expected += new Set(c.otherSymptoms.map((o) => o.conceptId)).size;
    }
    expect(obs).toHaveLength(expected);
  });

  it("codes dizziness with SNOMED CT, a boolean value, and severity as a component", () => {
    const dizzy = obs.find((o) => JSON.stringify(o.code).includes("404640003") && o.valueBoolean === true && o.component)!;
    expect(dizzy.category).toEqual([{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "survey", display: "Survey" }] }]);
    expect(JSON.stringify(dizzy.component)).toContain("246112005");
    expect(dizzy.effectiveDateTime).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const patientUrl = bundle.entry.find((e) => e.resource.resourceType === "Patient")!.fullUrl;
    expect(dizzy.performer).toEqual([{ reference: patientUrl }]);
  });

  it("uses valueInteger for the 1–5 scales and a coded value for appetite", () => {
    const energy = obs.find((o) => JSON.stringify(o.code).includes("359755007"))!;
    expect(Number.isInteger(energy.valueInteger)).toBe(true);
    const appetite = obs.find((o) => JSON.stringify(o.code).includes("364663004"))!;
    expect(Object.values(APPETITE_CODES)).toContainEqual(appetite.valueCodeableConcept);
  });

  it("exports near-falls as text only (no SNOMED CT concept exists) rather than mis-coding them", () => {
    const near = obs.filter((o) => JSON.stringify(o.code).includes("Near-fall"));
    expect(near.length).toBeGreaterThan(0);
    for (const n of near) expect((n.code as { coding?: unknown }).coding).toBeUndefined();
    expect(DIARY_CODES.nearFall?.coding).toBeNull();
  });

  it("keeps her own words as a LOINC 61150-9 narrative that coded answers derive from", () => {
    const story = obs.find((o) => JSON.stringify(o.code).includes("61150-9") && String(o.valueString).includes("tumble"))!;
    expect(story).toBeDefined();
    const derived = obs.filter((o) => JSON.stringify(o.derivedFrom ?? "").includes(`urn:uuid:${story.id}`));
    expect(derived.length).toBeGreaterThan(0);
  });

  it("marks a corrected check-in's observations as amended", () => {
    const corrected = w.data.checkIns.find((c) => c.revision > 1 && c.date >= FROM)!;
    const amended = obs.filter((o) => o.effectiveDateTime === corrected.date);
    expect(amended.length).toBeGreaterThan(0);
    expect(amended.every((o) => o.status === "amended")).toBe(true);
  });

  it("uses only codes from the verified tables", () => {
    const verified = new Set([
      ...Object.values(DIARY_CODES).flatMap((d) => (d?.coding ? [d.coding.code] : [])),
      ...Object.values(CONCEPT_CODES).flatMap((c) => (c ? [c.code] : [])),
      ...Object.values(APPETITE_CODES).flatMap((c) => c.coding!.map((x) => x.code)),
      "61150-9", "246112005", "255604002", "6736007", "24484000",
    ]);
    for (const o of obs) {
      for (const c of (o.code as { coding?: { code: string }[] }).coding ?? []) expect(verified.has(c.code), c.code).toBe(true);
    }
  });
});

describe("toFhirBundle — bladder trouble is exported as text only", () => {
  it("never codes difficulty passing urine as 165232002 'Urinary incontinence'", () => {
    const { bundle } = bundleFor({
      mutate: (d) => {
        const c = d.checkIns.filter((x) => x.date >= FROM).at(-1)!;
        c.story = "I couldn't pee properly today.";
        c.otherSymptoms = [{ conceptId: "urinary_problem", present: true, span: null }];
      },
    });
    const urinary = of(bundle, "Observation").filter((o) => /bladder or urinary/i.test(JSON.stringify((o as { code?: unknown }).code ?? "")));
    expect(urinary.length).toBeGreaterThan(0);
    for (const o of urinary) {
      const code = (o as unknown as { code: { coding?: unknown[]; text: string } }).code;
      expect(code.coding).toBeUndefined();
      expect(code.text).toMatch(/bladder or urinary trouble \(from the patient's own words\)/i);
    }
    expect(JSON.stringify(bundle)).not.toContain("165232002");
    expect(validateBundle(bundle)).toEqual([]);
  });
});

describe("toFhirBundle — review findings", () => {
  it("has one preliminary DetectedIssue per finding, without severity, implicating MedicationStatements", () => {
    const { w, bundle } = bundleFor();
    const issues = of(bundle, "DetectedIssue");
    expect(issues).toHaveLength(w.review.findings.length);
    const msUrls = new Set(bundle.entry.filter((e) => e.resource.resourceType === "MedicationStatement").map((e) => e.fullUrl));
    for (const i of issues) {
      expect(i.status).toBe("preliminary");
      expect(i.severity).toBeUndefined();
      for (const r of i.implicated as { reference: string }[]) expect(msUrls.has(r.reference)).toBe(true);
      expect(String(i.detail)).toContain("not a clinical judgment");
    }
  });

  it("codes Beers 'avoid' findings with the HL7 Age Alert and links positive diary observations as evidence", () => {
    const { bundle } = bundleFor();
    const benzo = of(bundle, "DetectedIssue").find((i) => JSON.stringify(i.code).includes("benzodiazepine"))!;
    expect((benzo.code as { coding: unknown[] }).coding).toEqual([ISSUE_CODES.beers_avoid]);
    const refs = (benzo.evidence as { detail: { reference: string }[] }[])[0].detail.map((d) => d.reference);
    expect(refs.length).toBeGreaterThan(0);
    const byUrl = new Map(bundle.entry.map((e) => [e.fullUrl, e.resource]));
    for (const r of refs) expect(byUrl.get(r)!.valueBoolean).toBe(true);
    expect(String(benzo.detail)).toContain("Question for the visit:");
  });

  it("leaves out dismissed findings and records discussed ones as a family-recorded mitigation", () => {
    const { bundle } = bundleFor({
      mutate: (d) => {
        d.reviewDecisions = [
          { findingKey: "beers-pim-ppi|med-omeprazole", status: "dismissed", note: "", updatedAt: "2026-10-09T10:00:00.000Z" },
          { findingKey: "ddi-anticholinergic-2:med-oxybutynin+med-tylenolpm", status: "discussed", note: "", updatedAt: "2026-10-09T10:00:00.000Z" },
        ];
      },
    });
    const issues = of(bundle, "DetectedIssue");
    expect(issues.some((i) => JSON.stringify(i.code).includes("Omeprazole"))).toBe(false);
    const pair = issues.find((i) => JSON.stringify(i.code).includes("2 medicines with strong anticholinergic effects together"))!;
    expect(JSON.stringify(pair.mitigation)).toContain("Discussed with the clinician");
    // A Beers combination is coded as a drug-interaction alert, not as an age alert for one medicine.
    expect((pair.code as { coding: unknown[] }).coding).toEqual([ISSUE_CODES.beers_interaction]);
  });
});

describe("toFhirBundle — Composition", () => {
  it("has the brief's numbered sections with narrative and entries", () => {
    const { bundle } = bundleFor();
    const comp = bundle.entry[0].resource;
    const titles = (comp.section as { title: string }[]).map((s) => s.title);
    expect(titles).toEqual([
      "1. Why we're coming in",
      "2. What we've noticed",
      "3. Medication review prompts",
      "4. Our questions",
      "5. Current medication list",
      "6. Diary observations",
      "7. Diary coverage and limitations",
    ]);
    expect(comp.status).toBe("preliminary");
    expect(JSON.stringify(comp.type)).toContain("51855-5");
    expect(JSON.stringify(comp.section)).toContain("call 911");
  });

  it("becomes final with a personal attester once the family has reviewed the brief", () => {
    const w = world();
    const brief = { ...w.brief, reviewedAt: "2026-10-10T15:00:00.000Z", reviewedBy: "caregiver" as const };
    const b = toFhirBundle({ data: w.data, review: w.review, brief, today: TODAY, kb: FAKE_KB });
    expect(b.entry[0].resource.status).toBe("final");
    expect(b.entry[0].resource.attester).toEqual([{ mode: "personal", time: "2026-10-10T15:00:00.000Z", party: { reference: b.entry[2].fullUrl } }]);
    expect(validateBundle(b)).toEqual([]);
  });

  it("makes every changed version a new document: draft, reviewed and edited exports differ in id and identifier", () => {
    const w = world();
    const draft = toFhirBundle({ data: w.data, review: w.review, brief: w.brief, today: TODAY, kb: FAKE_KB });
    const reviewedBrief = { ...w.brief, reviewedAt: "2026-10-12T15:00:00.000Z", reviewedBy: "caregiver" as const };
    const reviewed = toFhirBundle({ data: w.data, review: w.review, brief: reviewedBrief, today: TODAY, kb: FAKE_KB });
    const edited = toFhirBundle({
      data: w.data,
      review: w.review,
      brief: { ...reviewedBrief, content: { ...reviewedBrief.content, questions: [...reviewedBrief.content.questions, { text: "Does Dr. Lee know about the lorazepam?", evidenceIds: [] }] } },
      today: TODAY,
      kb: FAKE_KB,
    });
    const all = [draft, reviewed, edited];
    expect(new Set(all.map((b) => b.id)).size).toBe(3);
    expect(new Set(all.map((b) => b.identifier.value)).size).toBe(3);
    // The brief keeps one version-independent Composition identifier.
    expect(new Set(all.map((b) => JSON.stringify(b.entry[0].resource.identifier))).size).toBe(1);
    // The reviewed document is dated when it was reviewed, never before its own attestation.
    expect(reviewed.timestamp).toBe("2026-10-12T15:00:00.000Z");
    expect(reviewed.entry[0].resource.date).toBe(reviewed.timestamp);
    expect(Date.parse(draft.timestamp)).toBeLessThanOrEqual(Date.parse(reviewed.timestamp));
    for (const b of all) expect(validateBundle(b)).toEqual([]);
    // Same content, same document.
    expect(toFhirBundle({ data: w.data, review: w.review, brief: reviewedBrief, today: TODAY, kb: FAKE_KB }).identifier).toEqual(reviewed.identifier);
  });

  it("exports a valid record document without a brief (sections built from the review)", () => {
    const { bundle } = bundleFor({ brief: null });
    expect(validateBundle(bundle)).toEqual([]);
    const comp = bundle.entry[0].resource;
    expect(comp.title).toMatch(/^Kinwise record export: /);
    const sections = comp.section as { title: string; text: { div: string } }[];
    expect(sections[0].text.div).toContain("foggier in the mornings");
    // "What we've noticed" restates the period's counts with denominators.
    expect(sections[1].text.div).toMatch(/recorded on \d+ of \d+ answered days/);
    // Prompts use the same breadth-first pick as the brief (not only Beers prompts).
    expect(sections[2].text.div).toMatch(/anticholinergic|ACB/i);
    expect(sections[3].text.div).toContain("<ol>");
  });

  it("escapes family-entered text in the XHTML narrative", () => {
    const { bundle } = bundleFor({ mutate: (d) => (d.medications[0].name = "Amlodipine <script>alert(1)</script> & co") });
    const json = JSON.stringify(bundle.entry[0].resource.section);
    expect(json).not.toContain("<script>");
    expect(json).toContain("&lt;script&gt;");
    expect(validateBundle(bundle)).toEqual([]);
  });
});

describe("validateBundle — catches structural problems", () => {
  const fresh = () => JSON.parse(JSON.stringify(bundleFor().bundle)) as FhirBundle;

  it("rejects non-bundles", () => {
    expect(validateBundle(null)).toEqual(["bundle: not an object"]);
    expect(validateBundle({ resourceType: "Patient" })[0]).toMatch(/resourceType/);
  });

  it("finds a dangling reference", () => {
    const b = fresh();
    (b.entry[5].resource as Record<string, unknown>).subject = { reference: "urn:uuid:00000000-0000-5000-8000-000000000000" };
    expect(validateBundle(b).some((e) => e.includes("does not resolve"))).toBe(true);
  });

  it("finds missing required elements, bad statuses and empty values", () => {
    const b = fresh();
    const obs = b.entry.find((e) => e.resource.resourceType === "Observation")!.resource;
    delete obs.status;
    const ms = b.entry.find((e) => e.resource.resourceType === "MedicationStatement")!.resource;
    ms.status = "taking";
    ms.reasonCode = [];
    (b.entry[1].resource as Record<string, unknown>).gender = "";
    const errors = validateBundle(b);
    expect(errors.some((e) => e.includes("missing status"))).toBe(true);
    expect(errors.some((e) => e.includes("invalid status taking"))).toBe(true);
    expect(errors.some((e) => e.includes("empty array"))).toBe(true);
    expect(errors.some((e) => e.includes("empty string"))).toBe(true);
  });

  it("enforces document rules, unique fullUrls, no triage severity and valid dates", () => {
    const b = fresh();
    b.entry.reverse();
    b.entry[1] = { ...b.entry[1], fullUrl: b.entry[0].fullUrl };
    const issue = b.entry.find((e) => e.resource.resourceType === "DetectedIssue")!.resource;
    issue.severity = "high";
    issue.identifiedDateTime = "10/10/2026";
    const errors = validateBundle(b);
    expect(errors.some((e) => e.includes("first entry of a document"))).toBe(true);
    expect(errors.some((e) => e.includes("duplicate fullUrl"))).toBe(true);
    expect(errors.some((e) => e.includes("severity must be omitted"))).toBe(true);
    expect(errors.some((e) => e.includes("invalid dateTime"))).toBe(true);
  });
});

describe("helpers", () => {
  it("derives version-5-shaped UUIDs deterministically", () => {
    expect(deterministicUuid("a")).toBe(deterministicUuid("a"));
    expect(deterministicUuid("a")).not.toBe(deterministicUuid("b"));
    expect(deterministicUuid("x")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("summarises and names the export", () => {
    const { w, bundle } = bundleFor();
    const s = bundleSummary(bundle);
    expect(s.label).toBe(`Valid FHIR R4 document bundle · ${bundle.entry.length} resources`);
    expect(s.byType.Composition).toBe(1);
    expect(fhirFileName(w.data, TODAY)).toBe("kinwise-margaret-rivera-2026-10-10.fhir.json");
    const broken = { ...bundle, entry: [] };
    expect(bundleSummary(broken as FhirBundle).label).toMatch(/problem/);
  });

  it("the published sample bundle in docs/samples still passes structural validation", () => {
    const sample = JSON.parse(readFileSync(new URL("../../../docs/samples/kinwise-fhir-bundle.json", import.meta.url), "utf8"));
    expect(validateBundle(sample)).toEqual([]);
    const outcome = JSON.parse(readFileSync(new URL("../../../docs/samples/kinwise-fhir-validation.json", import.meta.url), "utf8"));
    expect(outcome.resourceType).toBe("OperationOutcome");
    expect(outcome.issue.filter((i: { severity: string }) => i.severity === "error" || i.severity === "fatal")).toEqual([]);
  });
});

describe("empty record", () => {
  it("still exports a valid document with explained empty sections", () => {
    const w = margaret();
    const data: StoreData = { ...w.data, checkIns: [], medications: [], notes: [], medEvents: [] };
    const review = { ...w.review, findings: [] };
    const b = toFhirBundle({ data, review, brief: null, today: TODAY, kb: FAKE_KB });
    expect(validateBundle(b)).toEqual([]);
    expect(b.entry.map((e) => e.resource.resourceType)).toEqual(["Composition", "Patient", "RelatedPerson", "Device"]);
    const sections = b.entry[0].resource.section as { title: string; emptyReason?: { text: string } }[];
    expect(sections.find((s) => s.title === "6. Diary observations")!.emptyReason).toEqual({ text: "No check-ins in this period" });
  });
});
