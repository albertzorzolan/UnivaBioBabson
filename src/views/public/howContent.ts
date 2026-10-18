// How it works: static copy that quotes research (each item with its source), kept out of the component so
// howContent.test.ts can check the wording against the sources and the app's actual behaviour.

export interface Ref {
  short: string;
  citation: string;
  url: string;
}

export const REFS = {
  gandhi: { short: "Gandhi, NEJM 2003", citation: "Gandhi TK et al. Adverse drug events in ambulatory care. N Engl J Med 2003;348:1556–64.", url: "https://pubmed.ncbi.nlm.nih.gov/12700376/" },
  cdcFalls: { short: "CDC, Older Adult Falls", citation: "CDC. Facts About Older Adult Falls (updated 2026).", url: "https://www.cdc.gov/falls/data-research/facts-stats/index.html" },
  nchs: { short: "NCHS, Health, United States", citation: "NCHS. Health, United States — Prescription drug use (2017–March 2020).", url: "https://www.cdc.gov/nchs/hus/topics/rx-drug-use.htm" },
  budnitz2011: { short: "Budnitz, NEJM 2011", citation: "Budnitz DS et al. Emergency hospitalizations for adverse drug events in older Americans. N Engl J Med 2011;365:2002–12.", url: "https://pubmed.ncbi.nlm.nih.gov/22111719/" },
  shehab: { short: "Shehab, JAMA 2016", citation: "Shehab N et al. US emergency department visits for outpatient adverse drug events, 2013–2014. JAMA 2016;316:2115–25.", url: "https://pubmed.ncbi.nlm.nih.gov/27893129/" },
  gallifant: { short: "Gallifant, JCO CCI 2025", citation: "Gallifant J et al. Reliability of large language model knowledge across brand and generic cancer drug names. JCO Clin Cancer Inform 2025;9:e2400257.", url: "https://pubmed.ncbi.nlm.nih.gov/40523223/" },
  blotske: { short: "Blotske, JMCP 2026", citation: "Blotske K et al. Drug-drug interaction identification using large language models. J Manag Care Spec Pharm 2026;32(9):1076–89.", url: "https://pubmed.ncbi.nlm.nih.gov/41503479/" },
  socrates: { short: "Socrates, JMIR Aging 2025", citation: "Socrates V, Wright DS et al. Identifying deprescribing opportunities with large language models in older adults. JMIR Aging 2025;8:e69504.", url: "https://pubmed.ncbi.nlm.nih.gov/40215480/" },
  ong: { short: "Ong, Cell Rep Med 2025", citation: "Ong JCL et al. Large language model as clinical decision support system augments medication safety in 16 clinical specialties. Cell Rep Med 2025;6(10):102323.", url: "https://pubmed.ncbi.nlm.nih.gov/40997804/" },
  harkema: { short: "Harkema, JBI 2009", citation: "Harkema H et al. ConText: an algorithm for determining negation, experiencer, and temporal status from clinical reports. J Biomed Inform 2009;42:839–51.", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC2757457/" },
  grundy: { short: "Grundy, BMJ 2019", citation: "Grundy Q et al. Data sharing practices of medicines related apps and the mobile ecosystem. BMJ 2019;364:l920.", url: "https://pubmed.ncbi.nlm.nih.gov/30894349/" },
  fdaMma: { short: "FDA, Device Software Functions (2022)", citation: "FDA. Policy for Device Software Functions and Mobile Medical Applications (Sept 2022), Appendices A and B.", url: "https://www.fda.gov/regulatory-information/search-fda-guidance-documents/policy-device-software-functions-and-mobile-medical-applications" },
  fdaCds: { short: "FDA, CDS guidance (Jan 2026)", citation: "FDA. Clinical Decision Support Software — final guidance (Jan 29, 2026).", url: "https://www.fda.gov/regulatory-information/search-fda-guidance-documents/clinical-decision-support-software" },
  empower: { short: "Tannenbaum, JAMA Intern Med 2014", citation: "Tannenbaum C et al. The EMPOWER cluster randomized trial. JAMA Intern Med 2014. doi:10.1001/jamainternmed.2014.949", url: "https://pubmed.ncbi.nlm.nih.gov/24733354/" },
} satisfies Record<string, Ref>;

/**
 * The problem in four figures: polypharmacy (NCHS), the two Gandhi 2003 attributions for ameliorable adverse
 * drug events in primary care (percentages only: the event counts behind them were never checked against the
 * abstract, kb-src/research/market-evidence.md §1.9), and unreported falls (CDC). Same trio as README.md.
 */
export const PROBLEM_STATS: { value: string; text: string; source: Ref }[] = [
  { value: "43%", text: "of US adults 65 and older used five or more prescription medicines in the past 30 days (2017–March 2020).", source: REFS.nchs },
  {
    value: "37%",
    text: "of medication side effects whose harm could have been reduced, in a primary-care study, were attributed to the patient not telling the doctor about the symptom.",
    source: REFS.gandhi,
  },
  { value: "63%", text: "to medication-related symptoms not being acted on.", source: REFS.gandhi },
  { value: "< 1 in 2", text: "older adults who fall tell their doctor, though more than 1 in 4 fall each year.", source: REFS.cdcFalls },
];

/** The product in three steps (a real sequence, so the steps are numbered). */
export const FLOW_STEPS: { title: string; text: string }[] = [
  {
    title: "She says it in her own words",
    text: "Margaret’s daily check-in is read on her device. Kinwise proposes diary answers and she confirms each one.",
  },
  {
    title: "Code lines it up and checks it",
    text: "Symptoms on answered days before and after each medicine change, next to published criteria (AGS Beers 2023, anticholinergic burden, fall-risk medicines).",
  },
  {
    title: "Alex brings one clear question",
    text: "A one-page visit brief with counts, sources and questions. The doctor or pharmacist decides.",
  },
];

/**
 * "Who it's for and where it fits": one line each, sourced (EMPOWER figures: kb-src/research/regulatory.md §5.5;
 * the taper plan in its brochure: docs/REGULATORY.md, as in the Devpost text).
 */
export const WHO_FOR: { label: string; text: string; source?: Ref }[] = [
  { label: "For", text: "A family caregiver, often an adult child, and the older adult on several medicines whom they help." },
  { label: "When", text: "Before a Medicare Annual Wellness Visit, or a pharmacist’s medication review that the caregiver joins." },
  {
    label: "Devices today",
    text: "One shared browser, or a backup exported on one device and imported on the other, which replaces the record there. Encrypted family sharing is planned.",
  },
  {
    label: "Why it could help",
    text: "EMPOWER (cluster RCT, n=303, long-term benzodiazepine users aged 65–95): a direct-to-patient educational brochure led to 27% vs 5% benzodiazepine discontinuation at 6 months; its brochure included a taper plan, which Kinwise leaves to the clinician. That is a reason to test Kinwise, not proof that it works.",
    source: REFS.empower,
  },
];
