import { matchRiskEntries, type DrugClass, type RiskEntry } from '../data/riskTable'
import type { Flag, Medication, Severity } from '../types'
import { daysBetween, todayISO } from './dates'

export const SEVERITY_ORDER: Severity[] = ['soon', 'next-visit', 'monitor']

export const SEVERITY_LABEL: Record<Severity, string> = {
  soon: 'Discuss soon',
  'next-visit': 'Discuss at next visit',
  monitor: 'Worth monitoring',
}

interface MatchedMed {
  med: Medication
  entries: RiskEntry[]
  classes: Set<DrugClass>
}

interface ComboRule {
  id: string
  severity: Severity
  title: string
  explanation: string
  question: string
  /** Returns the meds involved, or null if the rule doesn't fire */
  match: (meds: MatchedMed[]) => MatchedMed[] | null
}

const withClass = (meds: MatchedMed[], ...classes: DrugClass[]) =>
  meds.filter((m) => classes.some((c) => m.classes.has(c)))

/** Fires when every class group has at least one med; returns the union. */
function allOf(...groups: DrugClass[][]) {
  return (meds: MatchedMed[]) => {
    const hits = groups.map((g) => withClass(meds, ...g))
    if (hits.some((h) => h.length === 0)) return null
    return [...new Set(hits.flat())]
  }
}

function atLeast(n: number, ...classes: DrugClass[]) {
  return (meds: MatchedMed[]) => {
    const hits = withClass(meds, ...classes)
    return hits.length >= n ? hits : null
  }
}

const COMBO_RULES: ComboRule[] = [
  {
    id: 'opioid-sedative',
    severity: 'soon',
    title: 'Opioid taken with a sedative',
    explanation:
      'Opioid pain medicines combined with sedatives (like benzodiazepines or sleep medicines) can together slow breathing and cause heavy drowsiness. This combination is one of the most commonly flagged for older adults.',
    question: 'Is it safe to take the pain medicine and the sedative together, and can one of them be reduced?',
    match: allOf(['opioid'], ['benzo', 'z-drug', 'barbiturate']),
  },
  {
    id: 'opioid-gabapentinoid',
    severity: 'soon',
    title: 'Opioid taken with gabapentin/pregabalin',
    explanation:
      'Taking an opioid alongside gabapentin or pregabalin increases the risk of oversedation and breathing problems.',
    question: 'Should the dose of either pain medicine be lowered because they are taken together?',
    match: allOf(['opioid'], ['gabapentinoid']),
  },
  {
    id: 'cns-3plus',
    severity: 'soon',
    title: 'Three or more medicines that act on the brain',
    explanation:
      'Taking three or more medicines that affect the brain and nervous system (sedatives, antidepressants, opioids, antipsychotics and similar) is linked to a noticeably higher risk of falls and fractures.',
    question: 'Are all of these brain-acting medicines still needed, and could any be reduced one at a time?',
    match: atLeast(3, 'cns'),
  },
  {
    id: 'anticholinergic-burden',
    severity: 'next-visit',
    title: 'Several anticholinergic medicines',
    explanation:
      'Anticholinergic effects add up across medicines. Two or more together can raise the risk of confusion, memory problems, constipation and falls.',
    question: 'Could we lower the total "anticholinergic load" by swapping or stopping one of these?',
    match: atLeast(2, 'anticholinergic'),
  },
  {
    id: 'nsaid-bleeding',
    severity: 'soon',
    title: 'NSAID pain reliever with a blood thinner',
    explanation:
      'Combining an NSAID (like ibuprofen or naproxen) with a blood thinner or antiplatelet medicine significantly increases the risk of stomach or intestinal bleeding.',
    question: 'What should we use for pain instead of an NSAID while on a blood thinner?',
    match: allOf(['nsaid'], ['anticoagulant', 'antiplatelet']),
  },
  {
    id: 'triple-whammy',
    severity: 'soon',
    title: 'NSAID + blood-pressure medicine + water pill',
    explanation:
      'This three-way combination (sometimes called the "triple whammy") can strain the kidneys, particularly during illness or dehydration.',
    question: 'Should kidney function be checked, and is there an alternative to the NSAID?',
    match: allOf(['nsaid'], ['raas'], ['diuretic']),
  },
  {
    id: 'antidepressant-bleeding',
    severity: 'next-visit',
    title: 'Antidepressant with a blood thinner',
    explanation:
      'Some antidepressants slightly increase bleeding tendency, which adds to the effect of a blood thinner.',
    question: 'Is the bleeding risk from this combination being monitored?',
    match: allOf(['antidepressant'], ['anticoagulant']),
  },
  {
    id: 'bp-lowering-3plus',
    severity: 'next-visit',
    title: 'Several medicines that lower blood pressure',
    explanation:
      'Three or more medicines that lower blood pressure can together cause dizziness or light-headedness when standing up, which raises fall risk.',
    question: 'Is blood pressure ever too low, especially when standing? Should we check it sitting and standing?',
    match: atLeast(3, 'bp-lowering'),
  },
]

function flagId(ruleId: string, meds: Medication[]): string {
  return `${ruleId}:${meds.map((m) => m.id).sort().join(',')}`
}

/**
 * Run the medication list against the local risk table.
 * Deterministic and explainable — every flag names the rule and meds behind it.
 */
export function computeFlags(meds: Medication[], today = todayISO()): Flag[] {
  const matched: MatchedMed[] = meds.map((med) => {
    const entries = matchRiskEntries(med.name)
    return { med, entries, classes: new Set(entries.flatMap((e) => e.classes)) }
  })

  const flags: Flag[] = []

  // 1. Individual medication flags
  for (const { med, entries } of matched) {
    for (const entry of entries) {
      if (!entry.severity || !entry.concern || !entry.question) continue
      if (entry.minDays && daysBetween(med.startDate, today) < entry.minDays) continue
      flags.push({
        id: flagId(entry.id, [med]),
        ruleId: entry.id,
        medIds: [med.id],
        medNames: [med.name],
        title: `${med.name}: ${entry.label.toLowerCase()}`,
        explanation: entry.concern,
        severity: entry.severity,
        question: entry.question.replace(/this medicine/g, med.name),
      })
    }
  }

  // 2. Duplicates within the same group (e.g. two NSAIDs)
  const byEntry = new Map<string, { entry: RiskEntry; meds: Medication[] }>()
  for (const { med, entries } of matched) {
    for (const entry of entries) {
      const slot = byEntry.get(entry.id) ?? { entry, meds: [] }
      slot.meds.push(med)
      byEntry.set(entry.id, slot)
    }
  }
  for (const { entry, meds: group } of byEntry.values()) {
    if (group.length < 2) continue
    flags.push({
      id: flagId(`duplicate-${entry.id}`, group),
      ruleId: `duplicate-${entry.id}`,
      medIds: group.map((m) => m.id),
      medNames: group.map((m) => m.name),
      title: `Two or more medicines from the same group (${entry.label.toLowerCase()})`,
      explanation:
        'More than one medicine from the same group can mean a double dose of the same effect — sometimes this happens by accident when a brand-name and generic version, or prescriptions from different doctors, overlap.',
      severity: 'next-visit',
      question: `Do we need both ${group.map((m) => m.name).join(' and ')}, or is this an overlap?`,
    })
  }

  // 3. Combination rules
  for (const rule of COMBO_RULES) {
    const hits = rule.match(matched)
    if (!hits) continue
    const involved = hits.map((h) => h.med)
    flags.push({
      id: flagId(rule.id, involved),
      ruleId: rule.id,
      medIds: involved.map((m) => m.id),
      medNames: involved.map((m) => m.name),
      title: rule.title,
      explanation: rule.explanation,
      severity: rule.severity,
      question: rule.question,
    })
  }

  // 4. Overall polypharmacy
  if (meds.length >= 5) {
    flags.push({
      id: flagId('polypharmacy', meds),
      ruleId: 'polypharmacy',
      medIds: meds.map((m) => m.id),
      medNames: meds.map((m) => m.name),
      title: `Taking ${meds.length} regular medicines`,
      explanation:
        'Taking five or more medicines ("polypharmacy") raises the chance of side effects and interactions. A periodic full medication review with a doctor or pharmacist is a good habit.',
      severity: 'monitor',
      question: 'Could we do a full "brown bag" review of every medicine, including over-the-counter products and supplements?',
    })
  }

  return flags.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity))
}

/** Plain-language group labels for a medication, for display next to it. */
export function medGroupLabels(medName: string): string[] {
  return [...new Set(matchRiskEntries(medName).map((e) => e.label))]
}
