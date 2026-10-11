import type { Severity } from '../types'

/**
 * Illustrative subset of medications commonly discussed in deprescribing
 * guidance for older adults (loosely modeled on AGS Beers Criteria themes).
 * NOT clinically exhaustive and NOT a substitute for a clinician's judgment.
 */

export type DrugClass =
  | 'benzo'
  | 'z-drug'
  | 'barbiturate'
  | 'cns'
  | 'anticholinergic'
  | 'antipsychotic'
  | 'opioid'
  | 'gabapentinoid'
  | 'nsaid'
  | 'anticoagulant'
  | 'antiplatelet'
  | 'raas'
  | 'diuretic'
  | 'bp-lowering'
  | 'antidepressant'

export interface RiskEntry {
  id: string
  /** Plain-language group label, shown next to matching meds */
  label: string
  /** Generic and common brand names, lowercase */
  names: string[]
  classes: DrugClass[]
  /** Individual flag severity; omitted = only used by combination rules */
  severity?: Severity
  concern?: string
  question?: string
  /** Only flag once the patient has been taking it this many days */
  minDays?: number
}

export const RISK_TABLE: RiskEntry[] = [
  {
    id: 'benzodiazepine',
    label: 'Benzodiazepine (sedative)',
    names: ['lorazepam', 'ativan', 'alprazolam', 'xanax', 'diazepam', 'valium', 'clonazepam', 'klonopin', 'temazepam', 'restoril', 'chlordiazepoxide', 'librium'],
    classes: ['benzo', 'cns'],
    severity: 'soon',
    concern:
      'Sedatives in this group are commonly flagged for older adults because they can cause drowsiness, dizziness, unsteadiness and memory problems, and are linked to a higher risk of falls.',
    question: 'Is this sedative still the best option, and could we talk about a slow, supervised taper or a non-drug approach for sleep or anxiety?',
  },
  {
    id: 'z-drug',
    label: 'Sleep medicine ("Z-drug")',
    names: ['zolpidem', 'ambien', 'eszopiclone', 'lunesta', 'zaleplon', 'sonata'],
    classes: ['z-drug', 'cns'],
    severity: 'soon',
    concern:
      'These sleep medicines act much like benzodiazepines in older adults — they are associated with falls, confusion and next-day grogginess, often with only a small improvement in sleep.',
    question: 'Could we look at other ways to help with sleep, and is it safe to reduce this medicine over time?',
  },
  {
    id: 'barbiturate',
    label: 'Barbiturate (sedative)',
    names: ['phenobarbital', 'butalbital', 'fioricet', 'fiorinal'],
    classes: ['barbiturate', 'cns'],
    severity: 'soon',
    concern: 'Barbiturates are strongly sedating and are generally avoided in older adults because of fall risk and dependence.',
    question: 'Is there an alternative to this medicine that carries less sedation risk?',
  },
  {
    id: 'diphenhydramine',
    label: 'Sedating antihistamine',
    names: ['diphenhydramine', 'benadryl', 'tylenol pm', 'advil pm', 'aleve pm', 'zzzquil', 'doxylamine', 'unisom'],
    classes: ['anticholinergic'],
    severity: 'next-visit',
    concern:
      'Older "PM" sleep aids and allergy medicines have strong anticholinergic effects, which can cause confusion, constipation, dry mouth, blurry vision and trouble urinating.',
    question: 'Is there a non-sedating option for allergies or sleep that we could use instead?',
  },
  {
    id: 'hydroxyzine',
    label: 'Sedating antihistamine',
    names: ['hydroxyzine', 'atarax', 'vistaril'],
    classes: ['anticholinergic'],
    severity: 'next-visit',
    concern: 'Hydroxyzine is strongly anticholinergic and sedating, which can add to confusion and fall risk.',
    question: 'Could a less sedating medicine work for itching or anxiety?',
  },
  {
    id: 'chlorpheniramine',
    label: 'Sedating antihistamine',
    names: ['chlorpheniramine', 'chlor-trimeton', 'brompheniramine', 'dimenhydrinate', 'dramamine'],
    classes: ['anticholinergic'],
    severity: 'next-visit',
    concern: 'First-generation antihistamines can cause confusion, drowsiness and constipation in older adults.',
    question: 'Would a newer, non-drowsy antihistamine work instead?',
  },
  {
    id: 'meclizine',
    label: 'Anti-dizziness antihistamine',
    names: ['meclizine', 'antivert', 'bonine'],
    classes: ['anticholinergic'],
    severity: 'next-visit',
    concern: 'Meclizine is anticholinergic and can itself cause drowsiness and confusion — worth checking whether the dizziness it treats has another cause.',
    question: 'Could the dizziness be caused by another medicine, and do we still need meclizine?',
  },
  {
    id: 'promethazine',
    label: 'Anti-nausea antihistamine',
    names: ['promethazine', 'phenergan'],
    classes: ['anticholinergic', 'cns'],
    severity: 'next-visit',
    concern: 'Promethazine is strongly anticholinergic and sedating in older adults.',
    question: 'Is there a gentler option for nausea?',
  },
  {
    id: 'tca',
    label: 'Tricyclic antidepressant',
    names: ['amitriptyline', 'elavil', 'nortriptyline', 'pamelor', 'imipramine', 'tofranil', 'doxepin', 'sinequan', 'clomipramine'],
    classes: ['anticholinergic', 'cns', 'antidepressant'],
    severity: 'next-visit',
    concern:
      'Older tricyclic antidepressants are strongly anticholinergic and can cause dizziness on standing, confusion, constipation and heart-rhythm effects.',
    question: 'Is there a newer medicine for mood, nerve pain or sleep with fewer side effects?',
  },
  {
    id: 'paroxetine',
    label: 'Antidepressant (anticholinergic)',
    names: ['paroxetine', 'paxil'],
    classes: ['anticholinergic', 'cns', 'antidepressant'],
    severity: 'next-visit',
    concern: 'Paroxetine has more anticholinergic effects than other antidepressants in its class, which can contribute to confusion and constipation.',
    question: 'Would a different antidepressant be a better fit?',
  },
  {
    id: 'ssri-snri',
    label: 'Antidepressant (SSRI/SNRI)',
    names: ['sertraline', 'zoloft', 'citalopram', 'celexa', 'escitalopram', 'lexapro', 'fluoxetine', 'prozac', 'duloxetine', 'cymbalta', 'venlafaxine', 'effexor', 'mirtazapine', 'remeron'],
    classes: ['cns', 'antidepressant'],
    severity: 'monitor',
    concern:
      'Generally well tolerated, but in older adults these can contribute to falls and occasionally cause low sodium levels, which may show up as confusion or unsteadiness.',
    question: 'Should we check sodium levels, and is the current dose still right?',
  },
  {
    id: 'bladder-antimuscarinic',
    label: 'Bladder-control medicine',
    names: ['oxybutynin', 'ditropan', 'tolterodine', 'detrol', 'solifenacin', 'vesicare', 'trospium', 'darifenacin', 'fesoterodine', 'toviaz'],
    classes: ['anticholinergic'],
    severity: 'next-visit',
    concern: 'Many overactive-bladder medicines are anticholinergic and can affect memory and thinking, especially alongside other similar medicines.',
    question: 'Are there bladder options that are less likely to affect memory?',
  },
  {
    id: 'muscle-relaxant',
    label: 'Muscle relaxant',
    names: ['cyclobenzaprine', 'flexeril', 'methocarbamol', 'robaxin', 'carisoprodol', 'soma', 'metaxalone', 'skelaxin', 'orphenadrine'],
    classes: ['anticholinergic', 'cns'],
    severity: 'next-visit',
    concern: 'Muscle relaxants are often poorly tolerated by older adults — they can cause drowsiness, dizziness and confusion, and their benefit is often limited.',
    question: 'Is this muscle relaxant still helping, and can we try stopping it?',
  },
  {
    id: 'antipsychotic',
    label: 'Antipsychotic',
    names: ['quetiapine', 'seroquel', 'risperidone', 'risperdal', 'olanzapine', 'zyprexa', 'haloperidol', 'haldol', 'aripiprazole', 'abilify'],
    classes: ['antipsychotic', 'cns'],
    severity: 'soon',
    concern:
      'Antipsychotics are commonly flagged in older adults — especially when used for sleep or behavior changes — because of sedation, falls, and a higher risk of stroke in people with dementia.',
    question: 'What is this medicine treating, and is it still needed at this dose?',
  },
  {
    id: 'sulfonylurea',
    label: 'Diabetes medicine (sulfonylurea)',
    names: ['glyburide', 'glibenclamide', 'glipizide', 'glucotrol', 'glimepiride', 'amaryl'],
    classes: [],
    severity: 'next-visit',
    concern: 'These diabetes medicines can cause low blood sugar, which in older adults may look like confusion, shakiness, dizziness or a fall.',
    question: 'Is our blood sugar target right for this stage of life, and is there a diabetes medicine with less risk of lows?',
  },
  {
    id: 'nsaid',
    label: 'NSAID pain reliever',
    names: ['ibuprofen', 'advil', 'motrin', 'naproxen', 'aleve', 'naprosyn', 'meloxicam', 'mobic', 'diclofenac', 'indomethacin', 'ketorolac', 'celecoxib', 'celebrex', 'nabumetone'],
    classes: ['nsaid'],
    severity: 'next-visit',
    concern:
      'Regular use of NSAID pain relievers in older adults can raise the risk of stomach bleeding, kidney strain and higher blood pressure — especially combined with certain other medicines.',
    question: 'Is it safe to keep using this pain reliever regularly, or is there a gentler option?',
  },
  {
    id: 'ppi',
    label: 'Stomach-acid reducer (PPI)',
    names: ['omeprazole', 'prilosec', 'pantoprazole', 'protonix', 'esomeprazole', 'nexium', 'lansoprazole', 'prevacid', 'rabeprazole', 'aciphex', 'dexlansoprazole'],
    classes: [],
    severity: 'monitor',
    minDays: 56,
    concern:
      'Acid reducers are often started for a short course but continued long-term. Past about 8 weeks, it is worth checking whether they are still needed, as long use is linked to bone loss and low B12/magnesium.',
    question: 'Do we still need the acid reducer, or could we try stepping down the dose?',
  },
  {
    id: 'opioid',
    label: 'Opioid pain medicine',
    names: ['oxycodone', 'oxycontin', 'percocet', 'hydrocodone', 'vicodin', 'norco', 'tramadol', 'ultram', 'morphine', 'hydromorphone', 'dilaudid', 'codeine', 'fentanyl', 'tapentadol'],
    classes: ['opioid', 'cns'],
    severity: 'next-visit',
    concern: 'Opioids can cause drowsiness, dizziness, constipation and confusion in older adults, and increase fall risk.',
    question: 'How long should we continue this pain medicine, and what is the plan for stepping down?',
  },
  {
    id: 'gabapentinoid',
    label: 'Nerve-pain medicine',
    names: ['gabapentin', 'neurontin', 'pregabalin', 'lyrica'],
    classes: ['gabapentinoid', 'cns'],
    severity: 'monitor',
    concern: 'Gabapentin and pregabalin can cause dizziness and unsteadiness, and the dose may need adjusting if kidney function changes.',
    question: 'Is the dose right for current kidney function?',
  },
  {
    id: 'alpha-blocker',
    label: 'Alpha-blocker',
    names: ['doxazosin', 'cardura', 'terazosin', 'hytrin', 'prazosin', 'minipress'],
    classes: ['bp-lowering'],
    severity: 'next-visit',
    concern: 'These can cause a sudden drop in blood pressure when standing up, leading to dizziness or falls.',
    question: 'Is this still the right blood-pressure or prostate medicine, given any dizziness?',
  },
  {
    id: 'digoxin',
    label: 'Heart-rhythm medicine',
    names: ['digoxin', 'lanoxin'],
    classes: [],
    severity: 'monitor',
    concern: 'Digoxin builds up more easily in older adults; higher levels can cause nausea, poor appetite, confusion or vision changes.',
    question: 'When were digoxin levels and kidney function last checked?',
  },
  {
    id: 'warfarin',
    label: 'Blood thinner',
    names: ['warfarin', 'coumadin', 'jantoven'],
    classes: ['anticoagulant'],
    severity: 'monitor',
    concern: 'Warfarin needs regular blood tests and interacts with many medicines and foods. Falls are more serious on a blood thinner.',
    question: 'Are we on track with INR checks, and is warfarin still the best blood thinner for us?',
  },
  {
    id: 'doac',
    label: 'Blood thinner',
    names: ['apixaban', 'eliquis', 'rivaroxaban', 'xarelto', 'dabigatran', 'pradaxa', 'edoxaban'],
    classes: ['anticoagulant'],
  },
  {
    id: 'aspirin',
    label: 'Daily aspirin',
    names: ['aspirin', 'ecotrin', 'bayer'],
    classes: ['antiplatelet'],
    severity: 'monitor',
    concern: 'Guidance on daily aspirin for older adults has changed — for people without prior heart disease or stroke, the bleeding risk may outweigh the benefit.',
    question: 'Is daily aspirin still recommended for us specifically?',
  },
  {
    id: 'antiplatelet',
    label: 'Antiplatelet',
    names: ['clopidogrel', 'plavix', 'prasugrel', 'ticagrelor', 'brilinta'],
    classes: ['antiplatelet'],
  },
  {
    id: 'metoclopramide',
    label: 'Stomach-motility medicine',
    names: ['metoclopramide', 'reglan'],
    classes: ['cns'],
    severity: 'next-visit',
    concern: 'Metoclopramide can cause movement problems (tremor, stiffness) in older adults, especially with longer use.',
    question: 'Is there another option for the stomach symptoms?',
  },
  {
    id: 'megestrol',
    label: 'Appetite stimulant',
    names: ['megestrol', 'megace'],
    classes: [],
    severity: 'next-visit',
    concern: 'Megestrol has limited benefit for appetite in older adults and raises the risk of blood clots.',
    question: 'Are there other ways to support appetite and weight?',
  },
  {
    id: 'nitrofurantoin',
    label: 'Antibiotic (urinary)',
    names: ['nitrofurantoin', 'macrobid', 'macrodantin'],
    classes: [],
    severity: 'monitor',
    concern: 'Long-term use of nitrofurantoin can affect the lungs, liver and nerves, and it works less well when kidney function is reduced.',
    question: 'Is long-term use still needed, and how are the kidneys doing?',
  },
  {
    id: 'diuretic',
    label: 'Water pill (diuretic)',
    names: ['furosemide', 'lasix', 'hydrochlorothiazide', 'hctz', 'chlorthalidone', 'bumetanide', 'bumex', 'torsemide', 'spironolactone', 'aldactone'],
    classes: ['diuretic', 'bp-lowering'],
    severity: 'monitor',
    concern: 'Water pills can cause dehydration, low sodium or potassium, and dizziness when standing — especially in hot weather or with poor appetite.',
    question: 'Should we check electrolytes, and what should we do on days when eating or drinking is poor?',
  },
  {
    id: 'ace-arb',
    label: 'Blood-pressure medicine (ACE/ARB)',
    names: ['lisinopril', 'enalapril', 'ramipril', 'benazepril', 'captopril', 'losartan', 'valsartan', 'olmesartan', 'irbesartan', 'candesartan', 'telmisartan'],
    classes: ['raas', 'bp-lowering'],
  },
  {
    id: 'other-bp',
    label: 'Blood-pressure medicine',
    names: ['amlodipine', 'norvasc', 'metoprolol', 'lopressor', 'toprol', 'atenolol', 'carvedilol', 'coreg', 'diltiazem', 'cardizem', 'nifedipine', 'hydralazine', 'clonidine'],
    classes: ['bp-lowering'],
  },
]

function normalize(s: string): string {
  return ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `
}

/** Find all table entries whose names appear in a medication name. */
export function matchRiskEntries(medName: string): RiskEntry[] {
  const hay = normalize(medName)
  return RISK_TABLE.filter((entry) => entry.names.some((n) => hay.includes(normalize(n))))
}
