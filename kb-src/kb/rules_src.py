# Kinwise KB: hand-authored clinical rules, compiled into src/kb/data/*.json by kb-src/build_kb.py.
#
# Every rule names its source. Drug names, classes, thresholds and AGS ratings are recorded as published
# (ratings are cross-checked by build_kb.py against kb-src/research/beers-2023.json via `rid`); all wording
# below is Kinwise's own paraphrase, written to the SPEC §3 language rules: no causal claims about a person,
# no "safe"/"dangerous"/"urgent", no advice to start, stop or change a medicine, every question is addressed
# to the clinician or pharmacist. Placeholders: {med} {person} {condition} {crcl} {threshold} {med1} {med2}
# {count} {meds} {index} {marker} (filled by the review engine; unknown ones are removed).
#
# Encoding notes (what the review engine reads; see src/engine/meds/rules/*.ts):
#   appliesTo / with      {"drugs": [...], "classes": [...]} selectors over KB ingredient ids / class ids
#   minDurationDays       pim/caution: applies only after the medicine has been taken this many days
#   maxDaysSinceStart     "avoid starting": applies only when started within this many days
#   reasonKeywords        applies only when the medicine's recorded reason mentions one (blank = applies, with a note)
#   excludeReasonKeywords does not apply when the reason mentions one (indication exceptions)
#   excludeDrugs          ingredient ids a class-level selector must not match (AGS exceptions)
#   sex                   rule applies to one sex only (unknown sex never excludes)
#   conditions            condition / interaction rules: ConditionTag values that activate the rule
#   crclBelow             renal rules: threshold in mL/min; on pim/interaction rules: alternative trigger
#   minCount              interaction rules: ">= N distinct ingredients" of the selector

PIM = "pim"
COND = "condition"
CAUTION = "caution"
DDI = "interaction"
RENAL = "renal"

BEERS = []


def B(id, table, applies, title, plain, clinician, question, rec, quality=None, strength=None, rid=None, src="beers2023", qualifier=None, **extra):
    r = dict(id=id, table=table, appliesTo=applies, qualifier=qualifier, title=title, plain=plain, clinician=clinician,
             question=question, recommendation=rec, quality=quality, strength=strength, sourceId=src, rid=rid)
    r.update(extra)
    BEERS.append(r)


ANTICHOLINERGIC_ANTIDEPRESSANTS = ["amitriptyline", "amoxapine", "clomipramine", "desipramine", "doxepin", "imipramine", "nortriptyline", "paroxetine"]
BLADDER_ANTIMUSCARINICS = ["darifenacin", "fesoterodine", "flavoxate", "oxybutynin", "solifenacin", "tolterodine", "trospium"]
BP_REASONS = ["blood pressure", "hypertension", "htn", "pressure"]  # not "bp": it would match "BPH"

# ------------------------------------------------------------------------------------------------
# AGS Beers 2023 Table 2: potentially inappropriate medicines for most older adults

B("pim-first-gen-antihistamine", PIM,
  {"drugs": ["brompheniramine", "chlorpheniramine", "cyproheptadine", "dimenhydrinate", "diphenhydramine", "doxylamine", "hydroxyzine", "meclizine", "promethazine", "triprolidine"]},
  "{med}: sedating (first-generation) antihistamine",
  "This older antihistamine, the sleep ingredient in many “PM” and night-time products, can lead to next-day drowsiness, confusion, constipation and trouble passing urine, and its sleep effect fades with regular use.",
  "Highly anticholinergic; clearance falls with age and tolerance develops to the hypnotic effect. Cumulative anticholinergic exposure is associated with falls, delirium and dementia (acute use for a severe allergic reaction may be appropriate).",
  "Is the sedating antihistamine in {med} still needed, or is there a gentler option for sleep or allergies?",
  "Avoid", rid="t2-first-gen-antihistamines")

B("pim-nitrofurantoin", PIM, {"drugs": ["nitrofurantoin"]},
  "{med}: long-term use or low kidney function",
  "Taken for months to prevent bladder infections, this antibiotic has been linked to lung, liver and nerve problems.",
  "Avoid for long-term suppression and when CrCl is below 30 mL/min: pulmonary toxicity, hepatotoxicity and peripheral neuropathy, especially with prolonged use. Kinwise treats 30 days or more as long-term use.",
  "Is {med} still needed to prevent bladder infections, and are there other ways to prevent them?",
  "Avoid in people with CrCl < 30 mL/min or for long-term suppression", rid="t2-nitrofurantoin",
  qualifier="for long-term use or with low kidney function", crclBelow=30, minDurationDays=30)

B("pim-aspirin-primary-prevention", PIM, {"drugs": ["aspirin"]},
  "{med}: aspirin to prevent a first heart attack or stroke",
  "For people who have never had a heart attack or stroke, the chance of bleeding from daily aspirin rises with age while the benefit is small; people who have had one usually still need it.",
  "Avoid starting aspirin for primary prevention of cardiovascular disease and consider deprescribing in current users. Does not apply to secondary prevention in established cardiovascular disease.",
  "Is {med} taken to prevent a first heart attack or stroke, or because of an earlier heart attack, stroke or stent, and is it still recommended for {person}?",
  "Avoid starting for primary prevention; consider deprescribing", rid="t2-aspirin-primary-prevention",
  qualifier="for preventing a first heart attack or stroke",
  reasonKeywords=["primary prevention", "prevent", "preventive", "just in case", "heart health", "healthy heart", "precaution"],
  # Exclusions are history phrases, not "heart attack"/"stroke" themselves: "to prevent a heart attack" is the
  # commonest primary-prevention reason and must still match.
  excludeReasonKeywords=["had a", "had heart", "had stroke", "after", "history of", "hx of", "prior", "previous", "past", "another", "again",
                         "recurren", "stent", "bypass", "cabg", "secondary", "angina", "tia", "mini stroke", "mini-stroke",
                         "coronary", "cad", "pad", "peripheral artery", "valve", "carotid"])

B("pim-warfarin-initial", PIM, {"drugs": ["warfarin"]},
  "{med}: warfarin as the first blood thinner",
  "Compared with newer blood thinners such as apixaban, warfarin is linked to more serious bleeding, while people who have been stable on it for a long time can often reasonably stay on it.",
  "Avoid starting warfarin as initial therapy for nonvalvular atrial fibrillation or VTE unless DOACs are contraindicated or there are substantial barriers to their use. Long-term users with well-controlled INR (time in range > 70%) may reasonably continue; Kinwise applies this only to starts in the last 90 days.",
  "Was a newer blood thinner considered for {person}, and is {med} the best fit?",
  "Avoid starting as initial therapy for nonvalvular AF or VTE", rid="t2-warfarin",
  qualifier="as the first blood thinner for atrial fibrillation or a blood clot",
  maxDaysSinceStart=90, excludeReasonKeywords=["valve", "mechanical"])

B("pim-rivaroxaban", PIM, {"drugs": ["rivaroxaban"]},
  "{med}: rivaroxaban for long-term use",
  "Used long term, rivaroxaban has been linked to more major and stomach bleeding in older adults than some other blood thinners, such as apixaban.",
  "Avoid for long-term treatment of nonvalvular AF or VTE in favor of other anticoagulants (higher major and GI bleeding than other DOACs, particularly apixaban). May be reasonable when once-daily dosing is needed for adherence.",
  "Is {med} still the best blood thinner for {person}, or would another one fit better?",
  "Avoid for long-term treatment of AF or VTE", rid="t2-rivaroxaban",
  qualifier="for long-term treatment of atrial fibrillation or blood clots")

B("pim-alpha1-blocker-bp", PIM, {"classes": ["alpha1_blocker_nonselective"]},
  "{med}: alpha-blocker used for blood pressure",
  "Used for blood pressure, these medicines often make blood pressure drop on standing, which can lead to dizziness, fainting and falls.",
  "Avoid as an antihypertensive: high risk of orthostatic hypotension; other classes have a better risk-benefit balance. Use for prostate symptoms is not covered by this criterion.",
  "Is {med} still the best blood-pressure medicine for {person}, given its effect on blood pressure when standing up?",
  "Avoid use as an antihypertensive", rid="t2-alpha1-blockers-hypertension",
  qualifier="as a blood-pressure medicine", reasonKeywords=BP_REASONS)

B("pim-central-alpha-agonist-bp", PIM, {"drugs": ["clonidine", "guanfacine"]},  # methyldopa: removed in 2023 (Table 8)
  "{med}: central blood-pressure medicine",
  "These blood-pressure medicines often bring sleepiness, confusion, a slow pulse and dizziness on standing.",
  "Avoid clonidine as first-line antihypertensive therapy and other central alpha-agonists for hypertension: high risk of CNS effects, bradycardia and orthostatic hypotension.",
  "Is {med} still the best blood-pressure medicine for {person}?",
  "Avoid as first-line treatment for hypertension", rid="t2-central-alpha-agonists-hypertension",
  qualifier="as a routine blood-pressure medicine", reasonKeywords=BP_REASONS)

B("pim-amiodarone", PIM, {"drugs": ["amiodarone"]},
  "{med}: amiodarone as a first-choice rhythm medicine",
  "Amiodarone works well for heart rhythm but has more serious effects on the thyroid, lungs and liver than other rhythm medicines.",
  "Avoid as first-line therapy for atrial fibrillation unless the patient has heart failure or substantial left ventricular hypertrophy; it is more toxic than other antiarrhythmics.",
  "Is {med} still the best rhythm medicine for {person}, and are thyroid, liver and lung checks up to date?",
  "Avoid as first-line therapy for atrial fibrillation unless heart failure or substantial LVH", rid="t2-amiodarone",
  qualifier="as a first-choice medicine for atrial fibrillation",
  reasonKeywords=["atrial", "afib", "a fib", "a-fib", "irregular heart", "irregular pulse", "irregular rhythm"],
  excludeReasonKeywords=["heart failure", "chf", "hfref", "weak heart", "hypertroph", "lvh", "thick heart"])

B("pim-digoxin", PIM, {"drugs": ["digoxin"]},
  "{med}: digoxin as a first choice",
  "Other medicines are usually tried first for atrial fibrillation and heart failure, and doses above 0.125 mg a day add the chance of side effects without extra benefit, especially when the kidneys are slower.",
  "Avoid as first-line therapy for AF rate control or heart failure; if used, avoid doses above 0.125 mg/day. Reduced renal clearance raises the risk of toxicity; use caution withdrawing it in long-term users with HFrEF.",
  "Is {med} still needed, and is the dose right for {person}'s kidney function?",
  "Avoid as first-line therapy for AF or heart failure; avoid doses > 0.125 mg/day", quality="low", strength="strong", rid="t2-digoxin",
  qualifier="as a first choice for atrial fibrillation or heart failure")

B("pim-anticholinergic-antidepressant", PIM, {"drugs": ANTICHOLINERGIC_ANTIDEPRESSANTS},
  "{med}: antidepressant with strong anticholinergic effects",
  "These antidepressants (older tricyclics and paroxetine) have strong anticholinergic and sedating effects and can make blood pressure drop on standing.",
  "Highly anticholinergic, sedating, and associated with orthostatic hypotension in older adults; doxepin at 6 mg/day or less is excluded.",
  "Is {med} still the best choice, and is there an option with fewer anticholinergic effects?",
  "Avoid", rid="t2-antidepressants-strong-anticholinergic",
  qualifier="(low-dose doxepin for sleep is not included)")

B("pim-antiparkinson-anticholinergic", PIM, {"drugs": ["benztropine", "trihexyphenidyl"]},
  "{med}: anticholinergic Parkinson medicine",
  "These medicines are not recommended for movement side effects of antipsychotics, better options exist for Parkinson disease, and they are strongly anticholinergic.",
  "Not recommended for prevention or treatment of antipsychotic-induced extrapyramidal symptoms; more effective agents are available for Parkinson disease.",
  "Is {med} still needed, and are there other options for the movement symptoms?",
  "Avoid", rid="t2-antiparkinsonian-anticholinergic")

B("pim-antipsychotic", PIM, {"classes": ["antipsychotic"]},
  "{med}: antipsychotic medicine",
  "Antipsychotic medicines are linked to a higher chance of stroke, faster memory decline and death in people with dementia, and are generally kept for specific mental-health conditions.",
  "Avoid except for FDA-approved indications (schizophrenia, bipolar disorder, Parkinson disease psychosis, adjunctive treatment of depression, short-term antiemetic use). For behavioral symptoms of dementia or delirium, use only after nonpharmacologic options have failed or with substantial threat of harm, with periodic deprescribing attempts.",
  "What is {med} being used for, and is it still needed at this dose?",
  "Avoid, except in FDA-approved indications", quality="moderate", strength="strong", rid="t2-antipsychotics",
  qualifier="unless used for a condition such as schizophrenia or bipolar disorder",
  excludeReasonKeywords=["schizophren", "schizoaffective", "bipolar", "psychosis", "psychotic", "parkinson", "depression", "nausea", "vomit", "tourette"],
  excludeDrugs=["pimavanserin"])  # its only indication is Parkinson disease psychosis (an AGS exception)

B("pim-barbiturate", PIM, {"drugs": ["butalbital", "phenobarbital", "primidone"]},
  "{med}: barbiturate",
  "Barbiturates, including the butalbital in some headache pills, easily lead to dependence and stop helping over time, and an overdose can happen at fairly low doses.",
  "High rate of physical dependence, tolerance to sleep benefit, and greater risk of overdose at low dosages.",
  "Is {med} still needed, and is there another option for {person}'s headaches or other symptoms?",
  "Avoid", rid="t2-barbiturates")

B("pim-benzodiazepine", PIM, {"classes": ["benzodiazepine"]},
  "{med}: benzodiazepine",
  "Older adults are more sensitive to benzodiazepines, which are linked to memory problems, confusion, falls, broken bones and car crashes; if it is ever changed after regular use, that is done gradually with the prescriber rather than stopped suddenly.",
  "Older adults have increased sensitivity and slower metabolism of long-acting agents; any benzodiazepine raises the risk of cognitive impairment, delirium, falls, fractures and motor vehicle crashes, plus abuse, misuse and dependence. Combined with opioids: profound sedation and respiratory depression.",
  "Is {med} still the best option for sleep or anxiety, and are there alternatives with less effect on balance and memory?",
  "Avoid", rid="t2-benzodiazepines",
  excludeReasonKeywords=["seizure", "epilep", "convuls", "alcohol withdrawal", "rem sleep", "procedure"])

B("pim-z-drug", PIM, {"classes": ["z_drug"]},
  "{med}: Z-drug sleeping pill",
  "These sleeping pills carry risks similar to benzodiazepines in older adults, including confusion, falls, broken bones and car crashes, while improving sleep only a little.",
  "Adverse events similar to benzodiazepines (delirium, falls, fractures, ED visits and hospitalizations, motor vehicle crashes) with minimal improvement in sleep latency and duration.",
  "Is {med} still needed for sleep, and could other approaches for insomnia (such as CBT for insomnia) help?",
  "Avoid", rid="t2-z-drugs")

B("pim-meprobamate", PIM, {"drugs": ["meprobamate"]},
  "{med}: meprobamate",
  "This older anxiety medicine is very sedating and easily leads to dependence.",
  "High rate of physical dependence; very sedating.",
  "Is {med} still needed, and is there another option for anxiety?",
  "Avoid", rid="t2-meprobamate")

B("pim-ergoloid", PIM, {"drugs": ["ergoloid mesylates"]},
  "{med}: ergoloid mesylates",
  "This medicine has not been shown to work.",
  "Lack of efficacy.",
  "Is {med} still needed?",
  "Avoid", rid="t2-ergoloid-mesylates")

B("pim-androgen", PIM, {"drugs": ["methyltestosterone", "testosterone"]},
  "{med}: testosterone",
  "Testosterone products may affect the heart and carry possible risks for men with prostate cancer.",
  "Avoid unless indicated for confirmed hypogonadism with clinical symptoms: potential cardiac problems and potential risks in men with prostate cancer.",
  "Was low testosterone confirmed with blood tests, and is {med} still needed?",
  "Avoid unless indicated for confirmed hypogonadism with clinical symptoms", rid="t2-androgens",
  qualifier="unless for confirmed low testosterone with symptoms", excludeReasonKeywords=["hypogonadism"])

B("pim-estrogen", PIM, {"classes": ["estrogen"]},
  "{med}: estrogen pills or patches",
  "Estrogen pills and patches raise the chance of breast and uterine cancer, do not protect the heart or memory, and starting them at 60 or older brings more risk than benefit.",
  "Do not initiate systemic estrogen; consider deprescribing in older women already using it. Low-dose vaginal estrogen is acceptable for vaginal symptoms and recurrent UTIs.",
  "Is {med} still needed, and would low-dose vaginal estrogen or another option work instead?",
  "Avoid starting systemic estrogen; consider deprescribing", quality="high", strength="strong", rid="t2-estrogens",
  qualifier="as pills or patches (low-dose vaginal estrogen is not included)", excludeReasonKeywords=["vaginal"])

# AGS 2023 avoids sulfonylureas as first- or second-line monotherapy or add-on therapy (unless there are substantial
# barriers to other agents) and, if one is used, prefers short-acting glipizide. The qualifier carries the first half
# so the plain lead does not read "generally avoid" and then "glipizide is preferred" (it must stay <= 90 chars, no
# '.'/';', to be inlined by src/engine/meds/rules/beers.ts).
B("pim-sulfonylurea", PIM, {"classes": ["sulfonylurea"]},
  "{med}: sulfonylurea diabetes medicine",
  "Compared with other diabetes medicines, sulfonylureas bring more episodes of low blood sugar and are linked to more heart problems; if a sulfonylurea is used, AGS prefers a short-acting one such as glipizide over glyburide or glimepiride.",
  "Avoid as first- or second-line monotherapy or add-on therapy unless there are substantial barriers to other agents: higher risk of hypoglycemia (high-quality evidence), cardiovascular events and overall mortality. Long-acting agents (glyburide, glimepiride) lead to more prolonged hypoglycemia than glipizide.",
  "Is {med} still the best diabetes medicine for {person}, and how often has blood sugar run low?",
  "Avoid as first- or second-line monotherapy or add-on therapy unless there are substantial barriers to other agents", quality="high", strength="strong", rid="t2-sulfonylureas",
  qualifier="as first- or second-line or add-on therapy unless other options face substantial barriers")

B("pim-desiccated-thyroid", PIM, {"drugs": ["desiccated thyroid"]},
  "{med}: desiccated (animal) thyroid",
  "Animal-derived thyroid tablets raise concerns about effects on the heart, and other thyroid replacement is available.",
  "Concerns about cardiac effects; lower-risk alternatives available.",
  "Is {med} still the best thyroid medicine for {person}?",
  "Avoid", rid="t2-desiccated-thyroid")

B("pim-megestrol", PIM, {"drugs": ["megestrol"]},
  "{med}: megestrol for appetite",
  "Often used to boost appetite, megestrol adds little weight but raises the chance of blood clots and possibly death in older adults.",
  "Minimal effect on weight; increases risk of thrombotic events and possibly death in older adults.",
  "Is {med} still needed, and are there other ways to support {person}'s appetite and weight?",
  "Avoid", rid="t2-megestrol")

B("pim-growth-hormone", PIM, {"drugs": ["somatropin"]},
  "{med}: growth hormone",
  "Growth hormone changes body composition only slightly and is linked to swelling, joint pain, carpal tunnel syndrome and higher blood sugar.",
  "Avoid except for rigorously confirmed growth hormone deficiency: small body-composition effect with edema, arthralgia, carpal tunnel syndrome, gynecomastia and impaired fasting glucose.",
  "Is {med} still needed for {person}?",
  "Avoid, except for confirmed growth hormone deficiency", rid="t2-growth-hormone",
  excludeReasonKeywords=["growth hormone deficiency"])

B("pim-ppi", PIM, {"classes": ["ppi"]},
  "{med}: acid reducer (PPI) for more than 8 weeks",
  "Taking an acid reducer like this every day for more than 8 weeks is linked to a serious gut infection (Clostridioides difficile), pneumonia, bone loss and fractures.",
  "Avoid scheduled use for more than 8 weeks unless high risk (oral corticosteroids, chronic NSAID use), erosive esophagitis, Barrett's esophagus, a pathologic hypersecretory condition, or demonstrated need for maintenance. Risk of Clostridioides difficile infection, pneumonia, GI malignancy, bone loss and fractures.",
  "Does {person} still need {med} every day, and could the plan for it be reviewed?",
  "Avoid scheduled use for more than 8 weeks unless high risk or a demonstrated need", quality="high", strength="strong", rid="t2-ppis",
  qualifier="when taken daily for more than 8 weeks", minDurationDays=56,
  excludeReasonKeywords=["barrett", "erosive", "zollinger"])

B("pim-metoclopramide", PIM, {"drugs": ["metoclopramide"]},
  "{med}: metoclopramide",
  "Metoclopramide can lead to movement problems, including involuntary movements (tardive dyskinesia), and the chance is higher in frail older adults and with longer use.",
  "Avoid unless for gastroparesis, for no more than 12 weeks except in rare cases: extrapyramidal effects including tardive dyskinesia, higher risk in frail older adults and with prolonged exposure.",
  "Is {med} still needed, and how long is it planned for?",
  "Avoid, unless for gastroparesis for no more than 12 weeks", rid="t2-metoclopramide",
  qualifier="unless for gastroparesis for no more than 12 weeks")

B("pim-gi-antispasmodic", PIM, {"drugs": ["atropine", "clidinium", "dicyclomine", "hyoscyamine", "scopolamine"]},
  "{med}: stomach-cramp medicine (antispasmodic)",
  "These stomach-cramp medicines are strongly anticholinergic, and it is unclear how well they work.",
  "Highly anticholinergic, uncertain effectiveness (atropine excludes ophthalmic use).",
  "Is {med} still needed, and is there another option for the cramps?",
  "Avoid", rid="t2-gi-antispasmodics")

B("pim-mineral-oil", PIM, {"drugs": ["mineral oil"]},
  "{med}: mineral oil taken by mouth",
  "Swallowed mineral oil can accidentally get into the lungs, and other laxatives are available.",
  "Potential for aspiration and adverse effects; lower-risk alternatives available.",
  "Is {med} still needed, and is another laxative a better fit for {person}?",
  "Avoid", rid="t2-mineral-oil-oral")

B("pim-desmopressin-nocturia", PIM, {"drugs": ["desmopressin"]},
  "{med}: desmopressin for night-time urination",
  "Used for getting up at night to pass urine, desmopressin carries a high chance of low blood sodium, which can lead to confusion and falls.",
  "Avoid for treatment of nocturia or nocturnal polyuria: high risk of hyponatremia; other approaches, including nondrug measures, are available.",
  "Has {person}'s sodium level been checked, and is {med} still the best option for night-time urination?",
  "Avoid for nocturia or nocturnal polyuria", rid="t2-desmopressin-nocturia",
  qualifier="for getting up at night to pass urine",
  reasonKeywords=["nocturia", "night", "urinat", "bathroom", "pee", "bladder", "bedwetting"])

B("pim-nsaid-chronic", PIM, {"classes": ["nsaid_nonselective"]},
  "{med}: regular anti-inflammatory pain reliever (NSAID)",
  "Regular use of pain relievers such as ibuprofen and naproxen raises the chance of stomach bleeding and ulcers, and can raise blood pressure and strain the kidneys.",
  "Avoid chronic use unless other alternatives are not effective and the patient can take a gastroprotective agent (PPI or misoprostol): GI bleeding and peptic ulcer risk is higher with age over 75 or with corticosteroids, anticoagulants or antiplatelets. Kinwise treats 90 days or more as chronic use.",
  "Is {med} still needed every day, and are there other ways to manage the pain?",
  "Avoid chronic use unless alternatives are not effective and a gastroprotective agent is used", rid="t2-nsaids-oral-non-cox2",
  qualifier="when taken regularly for 3 months or more", minDurationDays=90, excludeDrugs=["indomethacin", "ketorolac"])

B("pim-indomethacin-ketorolac", PIM, {"drugs": ["indomethacin", "ketorolac"]},
  "{med}: indomethacin or ketorolac",
  "These two pain relievers carry an especially high chance of stomach bleeding, ulcers and sudden kidney injury, and indomethacin has more effects on the brain than other NSAIDs.",
  "Increased risk of GI bleeding, peptic ulcer disease and acute kidney injury in older adults; indomethacin has the most adverse effects of the NSAIDs, including CNS effects.",
  "Is {med} still needed, and is there another option for the pain?",
  "Avoid", rid="t2-indomethacin-ketorolac")

B("pim-meperidine", PIM, {"drugs": ["meperidine"]},
  "{med}: meperidine",
  "Taken by mouth, meperidine does not relieve pain well at usual doses and is more likely than other opioids to bring on confusion.",
  "Not effective orally at commonly used dosages; may have a higher risk of neurotoxicity, including delirium, than other opioids.",
  "Is {med} still needed, and is there another option for the pain?",
  "Avoid", rid="t2-meperidine")

B("pim-skeletal-muscle-relaxant", PIM, {"classes": ["skeletal_muscle_relaxant"]},
  "{med}: muscle relaxant",
  "Muscle relaxants for back or muscle pain are poorly tolerated by older adults, bringing sleepiness, anticholinergic effects and more fractures, and may not work at doses older adults can tolerate.",
  "Poorly tolerated because of anticholinergic effects, sedation and increased fracture risk; effectiveness at tolerated doses is questionable. Does not apply to baclofen or tizanidine for spasticity.",
  "Is {med} still needed, and are there other ways to manage the muscle pain?",
  "Avoid", rid="t2-skeletal-muscle-relaxants")

# Table 2 NSAID criterion, second part: short-term scheduled use with anticoagulants, antiplatelets or corticosteroids.
B("ddi-nsaid-antithrombotic-steroid", DDI,
  {"classes": ["nsaid_nonselective"]},
  "{med1} with {med2}: stomach bleeding",
  "Taking an anti-inflammatory pain reliever together with a blood thinner, an anti-clotting medicine or a steroid raises the chance of stomach bleeding, even for short periods.",
  "Avoid short-term scheduled NSAID use together with oral or parenteral corticosteroids, anticoagulants or antiplatelet agents unless alternatives are not effective and the patient can take a gastroprotective agent.",
  "Is it intended that {med1} and {med2} are taken together, and is stomach protection needed?",
  "Avoid short-term scheduled use with corticosteroids, anticoagulants or antiplatelets unless alternatives are not effective and a gastroprotective agent is used", rid="t2-nsaids-oral-non-cox2",
  **{"with": {"classes": ["anticoagulant", "antiplatelet", "corticosteroid_systemic"]}})

# ------------------------------------------------------------------------------------------------
# Table 3: drug-disease or drug-syndrome interactions

COND_Q = "For someone with {condition}, is {med} still the best choice, or is there an option that fits better?"

B("cond-hf-cilostazol", COND, {"drugs": ["cilostazol"]},
  "{med} with {condition}",
  "Cilostazol can worsen heart failure.",
  "Potential to promote fluid retention and/or exacerbate heart failure.",
  COND_Q, "Avoid", quality="low", strength="strong", rid="t3-heart-failure-avoid", conditions=["heart_failure"])

B("cond-hf-nondhp-ccb", COND, {"classes": ["ccb_nondihydropyridine"]},
  "{med} with {condition}",
  "Diltiazem and verapamil can weaken the heart's pumping and are generally avoided when the heart pumps weakly (reduced ejection fraction).",
  "Avoid in heart failure with reduced ejection fraction: potential to promote fluid retention and/or exacerbate heart failure.",
  COND_Q, "Avoid in heart failure with reduced ejection fraction", rid="t3-heart-failure-hfref-avoid", conditions=["heart_failure"])

B("cond-hf-nsaid", COND, {"classes": ["nsaid"]},
  "{med} with {condition}",
  "Anti-inflammatory pain relievers can make the body hold on to fluid, which can worsen heart failure.",
  "Use with caution in asymptomatic heart failure; avoid in symptomatic heart failure: potential to promote fluid retention and exacerbate heart failure (NSAIDs moderate-quality, COX-2 inhibitors low-quality evidence).",
  COND_Q, "Avoid in symptomatic heart failure; use with caution if asymptomatic", quality="moderate", strength="strong", rid="t3-heart-failure-caution",
  conditions=["heart_failure"])

B("cond-hf-tzd-dronedarone", COND, {"classes": ["thiazolidinedione"], "drugs": ["dronedarone"]},
  "{med} with {condition}",
  "Medicines like this can make the body hold on to fluid or put extra strain on the heart, which can worsen heart failure.",
  "Use with caution in asymptomatic heart failure; avoid in symptomatic heart failure (thiazolidinediones, dronedarone): potential to promote fluid retention and/or exacerbate heart failure.",
  COND_Q, "Avoid in symptomatic heart failure; use with caution if asymptomatic", quality="high", strength="strong", rid="t3-heart-failure-caution",
  conditions=["heart_failure"])

B("cond-delirium", COND, {"classes": ["strong_anticholinergic", "antipsychotic", "benzodiazepine", "z_drug", "corticosteroid_systemic", "opioid"]},
  "{med} with {condition}",
  "Medicines like this can bring on or worsen sudden confusion (delirium) in older adults.",
  "Avoid in older adults with or at high risk of delirium because of the potential to induce or worsen it (opioids added in 2023). Antipsychotics and corticosteroids may be required for specific indications at the lowest dose and shortest duration.",
  COND_Q, "Avoid", quality="moderate", strength="strong", rid="t3-delirium", conditions=["delirium_history"])

B("cond-delirium-h2ra", COND, {"classes": ["h2ra"]},
  "{med} with {condition}",
  "Heartburn medicines of this type (H2 blockers) can add to sudden confusion (delirium) in older adults.",
  "Avoid in older adults with or at high risk of delirium because of the potential to induce or worsen it (H2-receptor antagonists: low-quality evidence).",
  COND_Q, "Avoid", quality="low", strength="strong", rid="t3-delirium", conditions=["delirium_history"])

B("cond-dementia", COND, {"classes": ["strong_anticholinergic", "antipsychotic", "benzodiazepine", "z_drug"]},
  "{med} with {condition}",
  "Medicines like this can worsen memory and thinking.",
  "Avoid because of adverse CNS effects (anticholinergics, benzodiazepines, Z-drugs); antipsychotics increase stroke risk, cognitive decline and mortality in dementia.",
  COND_Q, "Avoid", rid="t3-dementia", conditions=["dementia_or_cognitive_impairment"])

B("cond-falls", COND, {"classes": ["strong_anticholinergic", "antipsychotic", "benzodiazepine", "z_drug"]},
  "{med} with {condition}",
  "Medicines like this can affect balance, alertness or blood pressure, which makes another fall more likely.",
  "Avoid unless lower-risk alternatives are not available: associated with ataxia, impaired psychomotor function, syncope and additional falls. Anticholinergics were added to this criterion in 2023.",
  COND_Q, "Avoid unless lower-risk alternatives are not available", quality="high", strength="strong", rid="t3-falls-fractures",
  conditions=["history_of_falls"])

B("cond-falls-antidepressant-opioid", COND, {"classes": ["ssri", "snri", "tca", "opioid"]},
  "{med} with {condition}",
  "Medicines like this can affect balance, alertness or blood pressure, which makes another fall more likely.",
  "Avoid unless lower-risk alternatives are not available (opioids: except for pain management in severe acute pain): associated with ataxia, impaired psychomotor function, syncope and additional falls.",
  COND_Q, "Avoid unless lower-risk alternatives are not available", quality="moderate", strength="strong", rid="t3-falls-fractures",
  conditions=["history_of_falls"], excludeDrugs=ANTICHOLINERGIC_ANTIDEPRESSANTS)

B("cond-falls-antiepileptic", COND, {"classes": ["antiepileptic"]},
  "{med} with {condition}",
  "Seizure and nerve-pain medicines in this group can affect balance and alertness, which makes another fall more likely.",
  "Antiepileptics: avoid in older adults with a history of falls or fractures except for seizure and mood disorders (gabapentinoids are counted here).",
  COND_Q, "Avoid except for seizure and mood disorders", quality="high", strength="strong", rid="t3-falls-fractures",
  conditions=["history_of_falls"], excludeDrugs=["clonazepam", "clobazam"],
  excludeReasonKeywords=["seizure", "epilep", "convuls", "bipolar", "mood"])

B("cond-parkinson", COND, {"classes": ["dopamine_antagonist_antiemetic", "antipsychotic"]},
  "{med} with {condition}",
  "Medicines like this block dopamine and can make Parkinson symptoms such as stiffness and slowness worse.",
  "Avoid dopamine-receptor-blocking antiemetics and antipsychotics (except clozapine, pimavanserin and quetiapine) because of the potential to worsen parkinsonian symptoms.",
  COND_Q, "Avoid", rid="t3-parkinson-disease", conditions=["parkinson_disease"],
  excludeDrugs=["clozapine", "pimavanserin", "quetiapine"])

B("cond-ulcer", COND, {"classes": ["nsaid_nonselective"], "drugs": ["aspirin"]},
  "{med} with {condition}",
  "Medicines like this can bring back or worsen stomach ulcers and bleeding.",
  "Avoid unless other alternatives are not effective and the patient can take a gastroprotective agent: may exacerbate existing ulcers or lead to new or additional ulcers.",
  "For someone with {condition}, is {med} still needed, and is stomach protection in place?",
  "Avoid unless alternatives are not effective and a gastroprotective agent is used", rid="t3-gastric-duodenal-ulcers",
  conditions=["gi_bleeding_or_ulcer_history"])

B("cond-urinary-incontinence-women-alpha", COND, {"classes": ["alpha1_blocker_nonselective"]},
  "{med} with {condition}",
  "Alpha-blockers relax the bladder outlet and can make bladder leakage worse in women.",
  "Avoid in women with urinary incontinence (all types): aggravation of incontinence (data limited for selective alpha-1 blockers).",
  COND_Q, "Avoid in women", quality="moderate", strength="strong", rid="t3-urinary-incontinence-women",
  conditions=["urinary_incontinence"], sex="female")

B("cond-urinary-incontinence-women-estrogen", COND, {"classes": ["estrogen"]},
  "{med} with {condition}",
  "Estrogen pills and patches do not help bladder leakage and are best avoided for it.",
  "Avoid oral and transdermal estrogen (intravaginal estrogen excluded) in women with urinary incontinence: lack of efficacy.",
  COND_Q, "Avoid in women", quality="high", strength="strong", rid="t3-urinary-incontinence-women",
  conditions=["urinary_incontinence"], sex="female", excludeReasonKeywords=["vaginal"])

B("cond-bph-men", COND, {"classes": ["strong_anticholinergic"]},
  "{med} with {condition}",
  "Strongly anticholinergic medicines can make it harder to pass urine, especially with an enlarged prostate.",
  "Avoid strongly anticholinergic drugs (except antimuscarinics for urinary incontinence) in men with lower urinary tract symptoms or BPH: may decrease urinary flow and lead to urinary retention.",
  COND_Q, "Avoid in men", rid="t3-luts-bph", conditions=["benign_prostatic_hyperplasia"], sex="male",
  excludeDrugs=BLADDER_ANTIMUSCARINICS)

# ------------------------------------------------------------------------------------------------
# Table 4: use with caution

B("caution-dabigatran", CAUTION, {"drugs": ["dabigatran"]},
  "{med}: use with caution",
  "Dabigatran has been linked to more major and stomach bleeding in older adults than some other blood thinners, such as apixaban.",
  "Use caution in selecting dabigatran over other DOACs (e.g. apixaban) for long-term treatment of nonvalvular AF or VTE; increased risk of major and GI bleeding.",
  "Is {med} still the best blood thinner for {person}, and is kidney function checked regularly?",
  "Use with caution", rid="t4-dabigatran")

B("caution-prasugrel-ticagrelor", CAUTION, {"drugs": ["prasugrel", "ticagrelor"]},
  "{med}: use with caution",
  "These anti-clotting medicines raise the chance of bleeding, especially at age 75 or older.",
  "Use with caution, particularly in adults 75 or older (higher bleeding risk); if prasugrel is used, consider 5 mg at 75 or older.",
  "How long is {med} planned for, and what signs of bleeding should prompt a call?",
  "Use with caution, particularly in adults 75 and older", rid="t4-prasugrel-ticagrelor")

B("caution-sodium", CAUTION,
  {"classes": ["ssri", "snri", "tca", "antipsychotic", "diuretic"], "drugs": ["mirtazapine", "carbamazepine", "oxcarbazepine", "tramadol"]},
  "{med}: can lower sodium levels",  # title as shipped in 375e1e0 beers.json (descriptive, not an instruction)
  "This medicine can lower the sodium level in the blood, which can lead to confusion, unsteadiness and falls, especially when it is started or the dose changes.",
  "Use with caution: may exacerbate or contribute to SIADH or hyponatremia; monitor sodium closely when starting or changing dosages.",
  "Has {person}'s sodium level been checked since {med} was started or the dose last changed?",
  "Use with caution; monitor sodium when starting or changing dosages", rid="t4-siadh-hyponatremia")

B("caution-sglt2", CAUTION, {"classes": ["sglt2_inhibitor"]},
  "{med}: use with caution",
  "These diabetes medicines can lead to genital and urinary infections and, rarely, a serious acid build-up in the blood (ketoacidosis).",
  "Use with caution; monitor for urogenital infections (particularly women in the first month) and euglycemic diabetic ketoacidosis.",
  "Which signs of infection or ketoacidosis should we watch for with {med}?",
  "Use with caution; monitor for urogenital infections and ketoacidosis", rid="t4-sglt2-inhibitors")

B("caution-tmp-smx-ras", DDI, {"drugs": ["trimethoprim", "sulfamethoxazole"]},  # named as the combination; trimethoprim is the potassium-raising part
  "{med1} with {med2} and reduced kidney function",
  "With reduced kidney function, this antibiotic plus an ACE inhibitor or a similar blood-pressure medicine can push potassium up.",
  "Use trimethoprim-sulfamethoxazole with caution in patients on an ACEI, ARB or ARNI with decreased CrCl: increased risk of hyperkalemia (trimethoprim blocks renal potassium excretion). Kinwise applies this with chronic kidney disease or CrCl < 60 mL/min, and also to trimethoprim alone.",
  "Is a potassium check planned while {med1} is taken with {med2}?",
  "Use with caution with an ACEI, ARB or ARNI and decreased CrCl", rid="t4-tmp-smx",
  conditions=["chronic_kidney_disease"], crclBelow=60, **{"with": {"classes": ["acei", "arb", "arni"]}})

# ------------------------------------------------------------------------------------------------
# Table 5: drug-drug interactions

RAS_OR_KSPARING = {"classes": ["ras_inhibitor"], "drugs": ["amiloride", "triamterene"]}
B("ddi-ras-ksparing-ckd", DDI, RAS_OR_KSPARING,
  "{med1} with {med2} and kidney disease",
  "With reduced kidney function, two of these medicines together can push potassium up to harmful levels.",
  "Avoid routine use of two or more RAS inhibitors, or a RAS inhibitor with a potassium-sparing diuretic, in chronic kidney disease stage 3a or worse: increased risk of hyperkalemia. Kinwise applies this with chronic kidney disease or CrCl < 60 mL/min.",
  "With {person}'s kidney function, is it intended that {med1} and {med2} are taken together, and when is potassium next checked?",
  "Avoid routine use in chronic kidney disease stage 3a or worse", rid="t5-ras-ras-or-k-sparing",
  conditions=["chronic_kidney_disease"], crclBelow=60, **{"with": RAS_OR_KSPARING})

B("ddi-opioid-benzodiazepine", DDI, {"classes": ["opioid"]},
  "{med1} with {med2}",
  "An opioid pain medicine taken with a benzodiazepine raises the chance of heavy sedation, slowed breathing and overdose.",
  "Avoid: increased risk of overdose and serious sedation-related adverse events.",
  "Is it intended that {med1} and {med2} are taken together, and are there options that avoid combining them?",
  "Avoid", rid="t5-opioids-benzodiazepines", **{"with": {"classes": ["benzodiazepine"]}})

B("ddi-opioid-gabapentinoid", DDI, {"classes": ["opioid"]},
  "{med1} with {med2}",
  "An opioid taken with gabapentin or pregabalin raises the chance of severe sleepiness and slowed breathing.",
  "Avoid, except when transitioning from opioids to gabapentinoids or using gabapentinoids to reduce opioid dose (use caution in all cases): increased risk of severe sedation-related adverse events, including respiratory depression and death.",
  "Is it intended that {med1} and {med2} are taken together, and what signs of over-sedation should we watch for?",
  "Avoid, except when transitioning between them or reducing the opioid dose", rid="t5-opioids-gabapentinoids",
  **{"with": {"classes": ["gabapentinoid"]}})

B("ddi-anticholinergic-2", DDI, {"classes": ["strong_anticholinergic"]},
  "{count} medicines with strong anticholinergic effects together",
  "Each of these medicines blocks acetylcholine, and together the effects (confusion, constipation, dry mouth, falls) add up.",
  "Avoid; minimize the number of anticholinergic drugs: increased risk of cognitive decline, delirium, falls and fractures.",
  "Are all of these medicines with anticholinergic effects still needed together, and could any be replaced with one that has less anticholinergic effect?",
  "Avoid; minimize the number of anticholinergic drugs", rid="t5-anticholinergic-anticholinergic", minCount=2)

B("ddi-cns-3", DDI, {"classes": ["cns_active"]},
  "{count} brain-active (CNS-active) medicines together",
  "Taking several medicines that act on the brain together raises the chance of falls and broken bones.",
  "Avoid total of three or more CNS-active drugs (antiepileptics incl. gabapentinoids, antidepressants [TCAs, SSRIs, SNRIs], antipsychotics, benzodiazepines, Z-drugs, opioids, skeletal muscle relaxants); minimize the number of CNS-active drugs: increased risk of falls and fracture. Skeletal muscle relaxants added in 2023.",
  "Are all {count} of these brain-active medicines still needed together, and could any be reduced?",
  "Avoid a total of three or more CNS-active drugs; minimize the number", rid="t5-cns-3-or-more", minCount=3)

B("ddi-lithium-ras", DDI, {"drugs": ["lithium"]},
  "{med1} with {med2}",
  "These blood-pressure medicines can raise the lithium level in the blood to a toxic range.",
  "Avoid; monitor lithium concentrations: increased risk of lithium toxicity.",
  "Is it intended that {med1} is taken with {med2}, and when is the lithium level next checked?",
  "Avoid; monitor lithium concentrations", rid="t5-lithium-raas", **{"with": {"classes": ["acei", "arb", "arni"]}})

B("ddi-lithium-loop", DDI, {"drugs": ["lithium"]},
  "{med1} with {med2}",
  "Loop water pills can raise the lithium level in the blood to a toxic range.",
  "Avoid; monitor lithium concentrations: increased risk of lithium toxicity.",
  "Is it intended that {med1} is taken with {med2}, and when is the lithium level next checked?",
  "Avoid; monitor lithium concentrations", rid="t5-lithium-loop-diuretics", **{"with": {"classes": ["loop_diuretic"]}})

B("ddi-alpha1-loop-women", DDI, {"classes": ["alpha1_blocker_nonselective"]},
  "{med1} with {med2}",
  "In older women, this pair raises the chance of bladder leakage.",
  "Avoid in older women unless conditions warrant both drugs: increased risk of urinary incontinence.",
  "Is it intended that {med1} and {med2} are taken together, given the chance of bladder leakage?",
  "Avoid in older women, unless conditions warrant both drugs", rid="t5-alpha1-loop-diuretics",
  sex="female", **{"with": {"classes": ["loop_diuretic"]}})

B("ddi-phenytoin-tmp-smx", DDI, {"drugs": ["phenytoin"]},
  "{med1} with {med2}",
  "This antibiotic can push the phenytoin level up into a toxic range.",
  "Avoid: increased risk of phenytoin toxicity.",
  "Is there another antibiotic option, or should the phenytoin level be checked while {med2} is taken?",
  "Avoid", rid="t5-phenytoin-tmp-smx", **{"with": {"drugs": ["sulfamethoxazole"]}})

B("ddi-theophylline-cimetidine", DDI, {"drugs": ["theophylline"]},
  "{med1} with {med2}",
  "Cimetidine can push the theophylline level up into a toxic range.",
  "Avoid: increased risk of theophylline toxicity.",
  "Is there another heartburn option that does not affect {med1}?",
  "Avoid", rid="t5-theophylline-cimetidine", **{"with": {"drugs": ["cimetidine"]}})

B("ddi-theophylline-ciprofloxacin", DDI, {"drugs": ["theophylline"]},
  "{med1} with {med2}",
  "Ciprofloxacin can push the theophylline level up into a toxic range.",
  "Avoid: increased risk of theophylline toxicity.",
  "Is there another antibiotic option that does not affect {med1}?",
  "Avoid", rid="t5-theophylline-ciprofloxacin", **{"with": {"drugs": ["ciprofloxacin"]}})

B("ddi-warfarin", DDI, {"drugs": ["warfarin"]},
  "{med1} with {med2}: bleeding",
  "This medicine can make warfarin work more strongly and raise the chance of bleeding.",
  "Avoid when possible (amiodarone, ciprofloxacin, macrolides except azithromycin, trimethoprim-sulfamethoxazole, SSRIs); if used together, monitor INR closely: increased risk of bleeding.",
  "Is it intended that {med1} is taken with {med2}, and when should the INR be checked?",
  "Avoid when possible; if used together, monitor INR closely", rid="t5-warfarin-interactions",
  **{"with": {"drugs": ["amiodarone", "ciprofloxacin", "clarithromycin", "erythromycin", "sulfamethoxazole"], "classes": ["ssri"]}})

# ------------------------------------------------------------------------------------------------
# Table 6: kidney function (applied only when a CrCl value is recorded)

RENAL_Q = "With a creatinine clearance of {crcl} mL/min, is the dose of {med} right, or would another option fit better?"


def R(id, drugs, threshold, title, plain, clinician, rec, rid, classes=None, **extra):
    applies = {"drugs": drugs} if drugs else {}
    if classes:
        applies["classes"] = classes
    B(id, RENAL, applies, title, plain, clinician, RENAL_Q, rec, rid=rid, crclBelow=threshold, **extra)


R("renal-ciprofloxacin", ["ciprofloxacin"], 30, "{med} and kidney function",
  "Slower kidneys clear this antibiotic more slowly, which raises the chance of nerve, tendon and brain side effects.",
  "CrCl < 30 mL/min: doses used for common infections typically need reduction (increased risk of CNS effects and tendon rupture).",
  "Doses typically need reduction when CrCl < 30 mL/min", "t6-ciprofloxacin")
R("renal-nitrofurantoin", ["nitrofurantoin"], 30, "{med} and kidney function",
  "With low kidney function this antibiotic works less well in the bladder and builds up in the body.",
  "Avoid if CrCl < 30 mL/min: potential for toxicity and lack of efficacy.", "Avoid if CrCl < 30 mL/min", "t6-nitrofurantoin")
R("renal-tmp-smx", ["trimethoprim", "sulfamethoxazole"], 30, "{med} and kidney function",
  "With low kidney function this antibiotic can build up and raise potassium.",
  "Reduce dosage if CrCl 15-29 mL/min; avoid if CrCl < 15 mL/min: increased risk of worsening renal function and hyperkalemia.",
  "Reduce dose if CrCl 15-29 mL/min; avoid if CrCl < 15 mL/min", "t6-tmp-smx")
R("renal-amiloride", ["amiloride"], 30, "{med} and kidney function",
  "With low kidney function this water pill can push potassium up to harmful levels.",
  "Avoid if CrCl < 30 mL/min: increased potassium, decreased sodium.", "Avoid if CrCl < 30 mL/min", "t6-amiloride")
R("renal-dabigatran", ["dabigatran"], 30, "{med} and kidney function",
  "Slower kidneys clear this blood thinner more slowly, which raises the chance of bleeding.",
  "Avoid if CrCl < 30 mL/min; adjust dose when CrCl > 30 mL/min with interacting drugs: increased risk of bleeding.",
  "Avoid if CrCl < 30 mL/min", "t6-dabigatran")
R("renal-dofetilide", ["dofetilide"], 60, "{med} and kidney function",
  "Slower kidneys clear this rhythm medicine more slowly, which can affect the heart's rhythm.",
  "Reduce dose if CrCl 20-59 mL/min; avoid if CrCl < 20 mL/min: QT prolongation and torsades de pointes.",
  "Reduce dose if CrCl 20-59 mL/min; avoid if < 20 mL/min", "t6-dofetilide")
R("renal-edoxaban", ["edoxaban"], 50, "{med} and kidney function",
  "Kidney function changes how much of this blood thinner stays in the body.",
  "Reduce dose if CrCl 15-50 mL/min; avoid if CrCl < 15 mL/min (and avoid if CrCl > 95 mL/min, lower effectiveness): increased bleeding risk.",
  "Reduce dose if CrCl 15-50 mL/min; avoid if < 15 mL/min", "t6-edoxaban")
R("renal-enoxaparin", ["enoxaparin"], 30, "{med} and kidney function",
  "Slower kidneys clear this blood-thinning injection more slowly, which raises the chance of bleeding.",
  "Reduce dose if CrCl < 30 mL/min: increased risk of bleeding.", "Reduce dose if CrCl < 30 mL/min", "t6-enoxaparin")
R("renal-fondaparinux", ["fondaparinux"], 30, "{med} and kidney function",
  "Slower kidneys clear this blood-thinning injection more slowly, which raises the chance of bleeding.",
  "Avoid if CrCl < 30 mL/min: increased risk of bleeding.", "Avoid if CrCl < 30 mL/min", "t6-fondaparinux")
R("renal-rivaroxaban", ["rivaroxaban"], 50, "{med} and kidney function",
  "Kidney function changes how much of this blood thinner stays in the body.",
  "CrCl 15-50 mL/min: reduce dose per the indication-specific label dosing; avoid if CrCl < 15 mL/min: increased risk of bleeding.",
  "Reduce dose if CrCl 15-50 mL/min per label; avoid if < 15 mL/min", "t6-rivaroxaban")
R("renal-spironolactone", ["spironolactone"], 30, "{med} and kidney function",
  "With low kidney function this water pill can push potassium up to harmful levels.",
  "Avoid if CrCl < 30 mL/min: increased potassium.", "Avoid if CrCl < 30 mL/min", "t6-spironolactone")
R("renal-triamterene", ["triamterene"], 30, "{med} and kidney function",
  "With low kidney function this water pill can push potassium up to harmful levels.",
  "Avoid if CrCl < 30 mL/min: increased potassium, decreased sodium.", "Avoid if CrCl < 30 mL/min", "t6-triamterene")
R("renal-baclofen", ["baclofen"], 60, "{med} and kidney function",
  "With reduced kidney function baclofen can build up and lead to confusion and severe sleepiness.",
  "Avoid if eGFR < 60 mL/min/1.73 m²; if unavoidable, use the lowest effective dose and monitor for CNS toxicity including altered mental status (the criterion uses eGFR; Kinwise compares it with the recorded CrCl).",
  "Avoid if eGFR < 60", "t6-baclofen")
R("renal-duloxetine", ["duloxetine"], 30, "{med} and kidney function",
  "With low kidney function this medicine can build up and upset the stomach more.",
  "Avoid if CrCl < 30 mL/min: increased GI adverse effects (nausea, diarrhea).", "Avoid if CrCl < 30 mL/min", "t6-duloxetine")
R("renal-gabapentin", ["gabapentin"], 60, "{med} and kidney function",
  "Slower kidneys clear gabapentin more slowly, so it can build up and add to sleepiness and unsteadiness.",
  "Reduce dose if CrCl < 60 mL/min: CNS adverse effects.", "Reduce dose if CrCl < 60 mL/min", "t6-gabapentin")
R("renal-levetiracetam", ["levetiracetam"], 80, "{med} and kidney function",
  "Slower kidneys clear this seizure medicine more slowly, so it can build up and add to sleepiness and mood changes.",
  "Reduce dose if CrCl ≤ 80 mL/min: CNS adverse effects.", "Reduce dose if CrCl ≤ 80 mL/min", "t6-levetiracetam")
R("renal-nsaid", None, 30, "{med} and kidney function",
  "With low kidney function, anti-inflammatory pain relievers can harm the kidneys further.",
  "Avoid if CrCl < 30 mL/min (non-selective, COX-2-selective and nonacetylated salicylates, oral and parenteral): may increase risk of acute kidney injury and further decline of renal function.",
  "Avoid if CrCl < 30 mL/min", "t6-nsaids", classes=["nsaid"])
R("renal-pregabalin", ["pregabalin"], 60, "{med} and kidney function",
  "Slower kidneys clear pregabalin more slowly, so it can build up and add to sleepiness and unsteadiness.",
  "Reduce dose if CrCl < 60 mL/min: CNS adverse effects.", "Reduce dose if CrCl < 60 mL/min", "t6-pregabalin")
R("renal-tramadol", ["tramadol"], 30, "{med} and kidney function",
  "Slower kidneys clear tramadol more slowly, so it can build up and add to sleepiness and confusion.",
  "CrCl < 30 mL/min: immediate release, reduce dose; extended release, avoid (CNS adverse effects).",
  "Immediate release: reduce dose; extended release: avoid (CrCl < 30 mL/min)", "t6-tramadol")
R("renal-cimetidine", ["cimetidine"], 50, "{med} and kidney function",
  "With reduced kidney function this heartburn medicine can build up and add to confusion.",
  "Reduce dose if CrCl < 50 mL/min: mental status changes.", "Reduce dose if CrCl < 50 mL/min", "t6-cimetidine")
R("renal-famotidine", ["famotidine"], 50, "{med} and kidney function",
  "With reduced kidney function this heartburn medicine can build up and add to confusion.",
  "Reduce dose if CrCl < 50 mL/min: mental status changes.", "Reduce dose if CrCl < 50 mL/min", "t6-famotidine")
R("renal-nizatidine", ["nizatidine"], 50, "{med} and kidney function",
  "With reduced kidney function this heartburn medicine can build up and add to confusion.",
  "Reduce dose if CrCl < 50 mL/min: mental status changes.", "Reduce dose if CrCl < 50 mL/min", "t6-nizatidine")
R("renal-colchicine", ["colchicine"], 30, "{med} and kidney function",
  "With low kidney function colchicine can build up and upset the stomach, muscles and nerves.",
  "Reduce dose and monitor for adverse effects if CrCl < 30 mL/min: GI, neuromuscular and bone marrow toxicity.",
  "Reduce dose; monitor for adverse effects (CrCl < 30 mL/min)", "t6-colchicine")
R("renal-probenecid", ["probenecid"], 30, "{med} and kidney function",
  "With low kidney function this gout medicine stops working well.",
  "Avoid if CrCl < 30 mL/min: loss of effectiveness.", "Avoid if CrCl < 30 mL/min", "t6-probenecid")

# Beers criteria deliberately NOT encoded (documented in docs/CLINICAL-SOURCES.md, reason in each line).
NOT_ENCODED = [
    ("Table 2: nifedipine, immediate release", "Formulation (immediate vs extended release) is not captured; matching the ingredient alone would flag the common long-acting forms."),
    ("Table 2: dipyridamole, oral short-acting", "Cannot be told apart from extended-release dipyridamole in Aggrenox by ingredient."),
    ("Table 2: dronedarone (permanent AF, severe or recently decompensated heart failure)", "Needs AF type and heart-failure severity; dronedarone in any heart failure is covered by the Table 3 heart-failure rule."),
    ("Table 2: insulin, sliding scale", "Regimen type is not captured by the medication list."),
    ("Table 2: dose thresholds (digoxin > 0.125 mg/day, aspirin > 325 mg/day)", "Dose is free text; thresholds are shown in the wording instead of being checked. (Doxepin > 6 mg/day is checked when a strength is typed, and Silenor is a separate low-dose entry.)"),
    ("Table 2: metoclopramide 12-week limit for gastroparesis", "Shown as a qualifier; the indication exception is not machine-checked."),
    ("Table 3: syncope", "No syncope condition tag in the Kinwise profile."),
    ("Table 3 and 4: dextromethorphan-quinidine", "Only the combination product is covered by AGS; its ingredients alone (OTC cough medicine, quinidine) must not match, which the selector format cannot express."),
    ("Table 3: chronic kidney disease (derived)", "AGS moved this criterion to Table 6; it is applied there when CrCl is recorded."),
    ("Table 5: spironolactone or eplerenone in the RAS + potassium-sparing row", "AGS names only amiloride and triamterene; the aldosterone antagonists are ambiguous and left out."),
    ("Table 6: edoxaban when CrCl > 95 mL/min", "Kinwise kidney rules trigger below a threshold only."),
    ("Table 8 (criteria removed in 2023 but still PIMs per 2019)", "Not encoded; the 2023 tables are the reference."),
]

# ------------------------------------------------------------------------------------------------
# Prescribing cascades (ThinkCascades, McCarthy 2022; PIPC list, Rochon 2025; primary studies)

CASCADES = []
EDEMA_WORDS = ["swell", "swollen", "edema", "oedema", "puffy", "fluid", "ankle"]
PARKINSONISM_WORDS = ["tremor", "shak", "stiff", "parkinson", "shuffl", "movement", "slow walking"]
HYPNOTICS = {"classes": ["z_drug"], "drugs": ["temazepam", "triazolam", "estazolam"]}


def C(id, index, effect, kw, marker, window, title, plain, clinician, question, src):
    CASCADES.append(dict(id=id, index=index, adverseEffect=effect, reasonKeywords=kw, marker=marker, windowDays=window,
                         title=title, plain=plain, clinician=clinician, question=question, sourceId=src))


C("ccb-edema-loop-diuretic", {"classes": ["ccb_dihydropyridine"]}, "ankle swelling (peripheral edema)", EDEMA_WORDS,
  {"classes": ["loop_diuretic"]}, 90,
  "Possible prescribing cascade: {index} → ankle swelling → {marker}",
  "Amlodipine-type blood-pressure medicines can lead to ankle swelling, and a water pill started for that swelling often helps little while adding its own effects.",
  "Dihydropyridine CCB edema is driven by arteriolar vasodilation and responds poorly to diuretics; new loop diuretic dispensing after CCB initiation is a documented cascade (Savage 2020).",
  "Could the ankle swelling be linked to {index}, and is {marker} still the best way to manage it?", "savage2020")
C("gabapentinoid-edema-loop-diuretic", {"classes": ["gabapentinoid"]}, "ankle swelling (peripheral edema)", EDEMA_WORDS,
  {"classes": ["loop_diuretic"]}, 90,
  "Possible prescribing cascade: {index} → ankle swelling → {marker}",
  "Gabapentin and pregabalin can lead to ankle swelling, which is sometimes treated with a water pill.",
  "Gabapentinoid-associated peripheral edema followed by new loop diuretic use is a documented cascade (Read 2021).",
  "Could the ankle swelling be linked to {index}, and is {marker} still the best way to manage it?", "read2021")
C("tzd-edema-loop-diuretic", {"classes": ["thiazolidinedione"]}, "fluid retention and swelling", EDEMA_WORDS,
  {"classes": ["loop_diuretic"]}, 180,
  "Possible prescribing cascade: {index} → fluid retention → {marker}",
  "Pioglitazone can make the body hold on to fluid, which is sometimes treated with a water pill.",
  "Thiazolidinedione fluid retention treated with a diuretic is on the international PIPC list (Rochon 2025).",
  "Could the swelling be linked to {index}, and is {marker} still the best way to manage it?", "pipc2025")
C("nsaid-bp-antihypertensive", {"classes": ["nsaid"]}, "raised blood pressure", [],
  {"classes": ["bp_lowering", "thiazide_diuretic"]}, 365,
  "Possible prescribing cascade: {index} → higher blood pressure → {marker}",
  "Anti-inflammatory pain relievers can raise blood pressure, and a blood-pressure medicine started afterwards may be treating that effect.",
  "NSAID-associated hypertension followed by antihypertensive initiation is a documented cascade (Gurwitz 1994) retained in ThinkCascades.",
  "Could {index} be raising {person}'s blood pressure, and is {marker} still needed if the pain plan changes?", "gurwitz1994")
C("acei-cough-cough-remedy", {"classes": ["acei"]}, "dry cough", ["cough"],
  {"classes": ["cough_cold"]}, 183,
  "Possible prescribing cascade: {index} → cough → {marker}",
  "Blood-pressure medicines ending in “-pril” (ACE inhibitors) can lead to a dry, tickly cough that cough medicines do not help.",
  "ACE-inhibitor cough is a labeled adverse reaction; antitussive starts after ACEI initiation exceed starts before (Vegter 2010).",
  "Could the cough be linked to {index}, and if so, is there another option instead of treating the cough with {marker}?", "vegter2010")
C("chei-incontinence-bladder-medicine", {"classes": ["cholinesterase_inhibitor"]}, "bladder leakage (urinary incontinence)",
  ["leak", "incontinen", "accident", "wetting", "urgen"],
  {"classes": ["bladder_antimuscarinic", "beta3_agonist"]}, 365,
  "Possible prescribing cascade: {index} → bladder leakage → {marker}",
  "Memory medicines such as donepezil can lead to bladder leakage, and bladder medicines started for it can work against the memory medicine.",
  "Cholinesterase inhibitor users are more likely to start a bladder antimuscarinic (Gill 2005); the combination has opposing mechanisms and adds anticholinergic burden.",
  "Could the bladder leakage be linked to {index}, and is {marker} still the best way to manage it?", "gill2005")
MEMORY_WORDS = ["memory", "forget", "confus", "dementia", "cognit", "thinking"]
C("anticholinergic-memory-dementia-medicine", {"classes": ["bladder_antimuscarinic", "benzodiazepine"]},
  "memory problems or confusion", MEMORY_WORDS,
  {"classes": ["cholinesterase_inhibitor", "nmda_antagonist"]}, 365,
  "Possible prescribing cascade: {index} → memory problems → {marker}",
  "Some bladder and sleep or anxiety medicines can affect memory, and a memory medicine started afterwards may be treating that effect.",
  "Cognitive impairment from a bladder antimuscarinic or a benzodiazepine followed by a cholinesterase inhibitor (or memantine) is a ThinkCascades cascade.",
  "Could the memory changes be linked to {index}, and was that considered before starting {marker}?", "thinkcascades")
C("tca-memory-dementia-medicine", {"classes": ["tca"]},
  "memory problems or confusion", MEMORY_WORDS,
  {"classes": ["cholinesterase_inhibitor", "nmda_antagonist"]}, 365,
  "Possible prescribing cascade: {index} → memory problems → {marker}",
  "Older (tricyclic) antidepressants can affect memory, and a memory medicine started afterwards may be treating that effect.",
  "Tricyclic-antidepressant-associated cognitive impairment treated with a cholinesterase inhibitor (or memantine) is on the PIPC list (Rochon 2025).",
  "Could the memory changes be linked to {index}, and was that considered before starting {marker}?", "pipc2025")
C("antiemetic-parkinsonism-antiparkinson", {"classes": ["dopamine_antagonist_antiemetic"]}, "tremor, stiffness or slowness (drug-induced parkinsonism)",
  PARKINSONISM_WORDS, {"classes": ["dopaminergic_antiparkinson", "antiparkinson_anticholinergic"]}, 365,
  "Possible prescribing cascade: {index} → tremor or stiffness → {marker}",
  "Anti-nausea medicines such as metoclopramide can lead to tremor and stiffness that look like Parkinson disease.",
  "Metoclopramide users were more likely to start levodopa (Avorn 1995); drug-induced parkinsonism should be considered before treating with antiparkinsonian drugs.",
  "Could the tremor or stiffness be linked to {index}, and was that considered before starting {marker}?", "avorn1995jama")
C("antipsychotic-parkinsonism-antiparkinson", {"classes": ["antipsychotic"]}, "tremor, stiffness or restlessness (extrapyramidal symptoms)",
  PARKINSONISM_WORDS + ["restless"], {"classes": ["antiparkinson_anticholinergic", "dopaminergic_antiparkinson"]}, 365,
  "Possible prescribing cascade: {index} → tremor or stiffness → {marker}",
  "Antipsychotic medicines can lead to tremor, stiffness or restlessness, which is sometimes treated with another medicine.",
  "Antipsychotic exposure followed by antiparkinsonian treatment is a documented cascade (Avorn 1995; Kalish 1995) and is retained in ThinkCascades.",
  "Could the movement symptoms be linked to {index}, and is {marker} still the best way to manage them?", "avorn1995ajm")
C("diuretic-gout-antigout", {"classes": ["thiazide_diuretic", "loop_diuretic"]}, "gout or high uric acid", ["gout", "uric"],
  {"classes": ["antigout"]}, 365,
  "Possible prescribing cascade: {index} → gout → {marker}",
  "Water pills can raise uric acid and bring on gout, which is then treated with a gout medicine.",
  "Thiazide users have a higher rate of starting anti-gout therapy (Gurwitz 1997).",
  "Could the gout be linked to {index}, and is {marker} still the best approach?", "gurwitz1997")
C("diuretic-incontinence-bladder-medicine", {"classes": ["diuretic"]}, "urgency or bladder leakage",
  ["leak", "incontinen", "urgen", "frequen", "accident", "wetting"],
  {"classes": ["bladder_antimuscarinic", "beta3_agonist"]}, 365,
  "Possible prescribing cascade: {index} → urgency or leakage → {marker}",
  "Water pills increase urine and can bring on urgency or leakage, which is sometimes treated with a bladder medicine.",
  "Diuretic-associated urinary incontinence treated with an overactive-bladder drug is a ThinkCascades cascade.",
  "Could the bladder symptoms be linked to {index} or its timing, and is {marker} still needed?", "thinkcascades")
C("ssri-insomnia-hypnotic", {"classes": ["ssri", "snri"]}, "trouble sleeping (insomnia)", [],
  HYPNOTICS, 180,
  "Possible prescribing cascade: {index} → trouble sleeping → {marker}",
  "Some antidepressants can make it harder to sleep, and a sleeping pill started afterwards may be treating that effect.",
  "SSRI/SNRI-associated insomnia treated with a sedative-hypnotic is a ThinkCascades cascade.",
  "Could the sleep problems be linked to {index} or the time of day it is taken, and is {marker} still needed?", "thinkcascades")
C("corticosteroid-insomnia-hypnotic", {"classes": ["corticosteroid_systemic"]}, "trouble sleeping (insomnia)", [],
  HYPNOTICS, 90,
  "Possible prescribing cascade: {index} → trouble sleeping → {marker}",
  "Steroid tablets can make it hard to sleep, and a sleeping pill started afterwards may be treating that effect.",
  "Corticosteroid-associated insomnia treated with a sleep agent is on the PIPC list (Rochon 2025).",
  "Could the sleep problems be linked to {index}, and is {marker} still needed?", "pipc2025")
C("chei-insomnia-hypnotic", {"classes": ["cholinesterase_inhibitor"]}, "trouble sleeping or vivid dreams", [],
  HYPNOTICS, 365,
  "Possible prescribing cascade: {index} → trouble sleeping → {marker}",
  "Memory medicines such as donepezil can disturb sleep or bring vivid dreams, especially when taken at night.",
  "Cholinesterase-inhibitor-associated insomnia treated with a sleep agent is on the PIPC list (Rochon 2025).",
  "Could the sleep problems be linked to {index} or the time it is taken, and is {marker} still needed?", "pipc2025")
C("benzodiazepine-agitation-antipsychotic", {"classes": ["benzodiazepine"]}, "agitation or restlessness", ["agitat", "restless", "aggress"],
  {"classes": ["antipsychotic"]}, 365,
  "Possible prescribing cascade: {index} → agitation → {marker}",
  "Benzodiazepines can sometimes lead to agitation (or withdrawal agitation between doses), which may then be treated with an antipsychotic.",
  "Paradoxical or withdrawal agitation from benzodiazepines treated with an antipsychotic is a ThinkCascades cascade.",
  "Could the agitation be linked to {index}, and is {marker} still needed?", "thinkcascades")
C("dopaminergic-hallucinations-antipsychotic", {"classes": ["dopaminergic_antiparkinson"]}, "hallucinations or confusion",
  ["hallucinat", "seeing things", "psychos", "paranoi", "delusion"], {"classes": ["antipsychotic"]}, 365,
  "Possible prescribing cascade: {index} → hallucinations → {marker}",
  "Parkinson medicines can lead to hallucinations, which are sometimes treated with an antipsychotic.",
  "Dopaminergic-antiparkinsonian-associated psychotic symptoms treated with an antipsychotic are on the PIPC list (Rochon 2025).",
  "Could the hallucinations be linked to {index}, and is {marker} still the best approach?", "pipc2025")
# amiodarone -> hypothyroidism -> levothyroxine: not encoded (on neither ThinkCascades nor PIPC; levothyroxine for
# amiodarone-associated hypothyroidism is usually the intended treatment, not a cascade to question).
C("ccb-constipation-laxative", {"classes": ["ccb"]}, "constipation", ["constipat"],
  {"classes": ["laxative"]}, 180,
  "Possible prescribing cascade: {index} → constipation → {marker}",
  "Calcium channel blockers, especially verapamil, can lead to constipation that is then treated with a laxative.",
  "Calcium-channel-blocker-associated constipation treated with a laxative is on the PIPC list (Rochon 2025).",
  "Could the constipation be linked to {index}, and is {marker} still the best way to manage it?", "pipc2025")
C("digoxin-nausea-antiemetic", {"drugs": ["digoxin"]}, "nausea or poor appetite", ["nause", "vomit", "appetite"],
  {"drugs": ["ondansetron", "metoclopramide", "prochlorperazine", "promethazine", "meclizine"]}, 365,
  "Possible prescribing cascade: {index} → nausea → {marker}",
  "Nausea and poor appetite can be early signs of too much digoxin, and an anti-nausea medicine may hide them.",
  "Digoxin-associated nausea treated with an antiemetic is on the PIPC list (Rochon 2025); consider a digoxin level and renal function.",
  "Could the nausea be linked to {index}, and should the digoxin level be checked?", "pipc2025")
C("alpha-blocker-dizziness-vestibular", {"classes": ["alpha1_blocker"]},
  "dizziness", ["dizz", "vertigo", "lighthead", "spin", "balance"],
  {"drugs": ["meclizine", "dimenhydrinate"]}, 365,
  "Possible prescribing cascade: {index} → dizziness → {marker}",
  "Alpha-blockers such as tamsulosin or doxazosin can make blood pressure drop on standing, and the dizziness is sometimes treated with a medicine such as meclizine that adds its own drowsiness.",
  "Alpha-1-blocker-associated orthostatic hypotension or dizziness treated with a vestibular suppressant is a ThinkCascades cascade; check orthostatic blood pressure.",
  "Could the dizziness be linked to {index}, and could standing blood pressure be checked before continuing {marker}?", "thinkcascades")
C("bp-dizziness-vestibular", {"classes": ["bp_lowering", "central_alpha_agonist", "diuretic"]},
  "dizziness", ["dizz", "vertigo", "lighthead", "spin", "balance"],
  {"drugs": ["meclizine", "dimenhydrinate"]}, 365,
  "Possible prescribing cascade: {index} → dizziness → {marker}",
  "Blood-pressure medicines can lead to dizziness on standing, which is sometimes treated with a dizziness medicine such as meclizine that adds its own drowsiness.",
  "Antihypertensive-associated orthostatic hypotension or dizziness treated with an antiemetic or vestibular suppressant is on the PIPC list (Rochon 2025); check orthostatic blood pressure.",
  "Could the dizziness be linked to {index}, and could standing blood pressure be checked before continuing {marker}?", "pipc2025")
C("statin-muscle-pain-analgesic", {"classes": ["statin"]}, "muscle aches", ["muscle", "myalg", "cramp", "ache"],
  {"classes": ["analgesic_nonopioid", "nsaid"]}, 180,
  "Possible prescribing cascade: {index} → muscle aches → {marker}",
  "Statins can lead to muscle aches, which are sometimes treated with a pain reliever.",
  "Statin-associated myalgia treated with a pain reliever is on the PIPC list (Rochon 2025).",
  "Could the muscle aches be linked to {index}, and is {marker} still the best way to manage them?", "pipc2025")
C("dpp4-joint-pain-nsaid", {"classes": ["dpp4_inhibitor"]}, "joint pain", ["joint"],
  {"classes": ["nsaid"]}, 365,
  "Possible prescribing cascade: {index} → joint pain → {marker}",
  "Some diabetes medicines (DPP-4 inhibitors such as sitagliptin) can lead to joint pain, which may be treated with an anti-inflammatory.",
  "DPP-4 inhibitor arthralgia (labeled warning) treated with an NSAID is on the PIPC list (Rochon 2025).",
  "Could the joint pain be linked to {index}, and is {marker} still needed?", "pipc2025")
C("sglt2-yeast-antifungal", {"classes": ["sglt2_inhibitor"]}, "genital yeast infection", ["yeast", "fungal", "thrush"],
  {"drugs": ["fluconazole", "nystatin"]}, 180,
  "Possible prescribing cascade: {index} → yeast infection → {marker}",
  "Some diabetes medicines (SGLT2 inhibitors) raise the chance of genital yeast infections, which are then treated with an antifungal.",
  "SGLT2 inhibitor genital mycotic infection treated with an antifungal is on the PIPC list (Rochon 2025).",
  "Could the infection be linked to {index}, and how can it be prevented?", "pipc2025")
C("metformin-diarrhea-antidiarrheal", {"drugs": ["metformin"]}, "diarrhea", ["diarrh", "loose"],
  {"classes": ["antidiarrheal"]}, 365,
  "Possible prescribing cascade: {index} → diarrhea → {marker}",
  "Metformin can lead to diarrhea, which is sometimes treated with an anti-diarrhea medicine.",
  "Metformin-associated diarrhea treated with an antidiarrheal is on the PIPC list (Rochon 2025); formulation or dose timing may be relevant.",
  "Could the diarrhea be linked to {index}, and is {marker} still the best way to manage it?", "pipc2025")
C("antipsychotic-high-sugar-antidiabetic", {"classes": ["antipsychotic"]}, "high blood sugar", [],
  {"classes": ["antidiabetic"]}, 365,
  "Possible prescribing cascade: {index} → high blood sugar → {marker}",
  "Some antipsychotic medicines can raise blood sugar, and a diabetes medicine started afterwards may be treating that effect.",
  "Antipsychotic-associated hyperglycemia treated with an antihyperglycemic is on the PIPC list (Rochon 2025).",
  "Could the higher blood sugar be linked to {index}, and was that considered before starting {marker}?", "pipc2025")

# ------------------------------------------------------------------------------------------------
# Fall-risk-increasing drug classes (CDC STEADI / STEADI-Rx, EuGMS STOPPFall). Beta-blockers are not
# included: de Vries 2018 found no association for beta-blockers overall (non-selective ones were
# associated with fewer falls), and STOPPFall reached no consensus on them. Beta-3 agonists (mirabegron) are not
# included either: STOPPFall lists overactive-bladder medicines for their anticholinergic activity.

FRIDS = [
    ("benzodiazepine", "Benzodiazepines", "Sedation and slower reactions affect balance.", "steadi"),
    ("z_drug", "Z-drug sleeping pills", "Next-day drowsiness and unsteadiness, especially at night.", "steadi"),
    ("antipsychotic", "Antipsychotics", "Sedation, stiffness and low blood pressure on standing.", "steadi"),
    ("opioid", "Opioids", "Drowsiness, dizziness and slower reactions.", "steadi"),
    ("antidepressant", "Antidepressants", "Drowsiness, low sodium or low blood pressure on standing.", "steadi"),
    ("antiepileptic", "Antiepileptics (seizure and nerve-pain medicines)", "Dizziness, drowsiness and unsteadiness.", "steadi"),
    ("bp_lowering", "Blood-pressure medicines", "Blood pressure can drop on standing, especially after a dose change.", "steadi"),
    ("muscle_relaxant", "Muscle relaxants", "Drowsiness and muscle weakness.", "steadi"),
    ("diuretic", "Diuretics (water pills)", "Low blood pressure on standing, dehydration and night-time trips to the bathroom.", "stoppfall"),
    ("alpha1_blocker", "Alpha-blockers", "Blood pressure can drop on standing.", "stoppfall"),
    ("central_alpha_agonist", "Centrally acting blood-pressure medicines", "Drowsiness and low blood pressure on standing.", "stoppfall"),
    ("nitrate", "Nitrates (heart vasodilators)", "Blood pressure can drop, especially on standing.", "stoppfall"),
    ("first_gen_antihistamine", "Sedating antihistamines", "Drowsiness, confusion and blurred vision.", "stoppfall"),
    ("strong_anticholinergic", "Strongly anticholinergic medicines", "Drowsiness, confusion and blurred vision.", "stoppfall"),
    ("bladder_antimuscarinic", "Overactive-bladder medicines", "Drowsiness, blurred vision and dizziness; urgency at night.", "stoppfall"),
]

# ------------------------------------------------------------------------------------------------
# "What to watch for" (SPEC §12): classes behind most emergency visits for medication harm in older adults.

MONITORING = [
    dict(id="mon-anticoagulant", appliesTo={"classes": ["anticoagulant"]},
         title="Blood thinner: what to watch for",
         watchFor=["unusual bruising", "bleeding gums or nosebleeds that are hard to stop", "black or tarry stools", "pink, red or brown urine", "a fall or a bump to the head"],
         relatedConcepts=["bleeding_or_bruising", "black_stools", "fall"],
         plain="{med} is a blood thinner; blood thinners are the medicines most often involved in emergency visits for medication harm in older adults.",
         clinician="Anticoagulants are the leading drug class in ED visits for adverse drug events in adults 65 and older (Budnitz 2021). Bleeding signs, falls with head strike and new interacting medicines warrant review.",
         question="Which signs of bleeding should prompt a call, and what should we do after a fall while taking {med}?",
         sourceId="budnitz2021"),
    dict(id="mon-antiplatelet", appliesTo={"classes": ["antiplatelet"]},
         title="Anti-clotting medicine: what to watch for",
         watchFor=["unusual bruising", "bleeding that is hard to stop", "black or tarry stools", "vomit that looks like coffee grounds"],
         relatedConcepts=["bleeding_or_bruising", "black_stools"],
         plain="{med} makes blood less likely to clot, so bleeding can happen more easily.",
         clinician="Oral antiplatelet agents were implicated in about 13% of emergency hospitalizations for adverse drug events in adults 65 and older (Budnitz 2011). Combined antithrombotics and NSAIDs add bleeding risk.",
         question="How long is {med} planned for, and which signs of bleeding should prompt a call?",
         sourceId="budnitz2011"),
    dict(id="mon-hypoglycemia", appliesTo={"classes": ["sulfonylurea", "insulin"]},
         title="Low blood sugar: what to watch for",
         watchFor=["shakiness or trembling", "sweating", "sudden confusion or unusual behavior", "dizziness", "a fast heartbeat"],
         relatedConcepts=["shakiness_or_sweating", "tremor", "confusion", "dizziness"],  # "tremor": as shipped in 375e1e0 monitoring.json
         plain="{med} can lower blood sugar, and in older adults low blood sugar can show up as confusion, dizziness or a fall.",
         clinician="Insulins and oral hypoglycemics together were implicated in about a quarter of emergency hospitalizations for adverse drug events in adults 65 and older (Budnitz 2011). Hypoglycemia may present atypically (confusion, falls).",
         question="What blood sugar level should prompt a call, and what should we do if {person} feels shaky, sweaty or confused?",
         sourceId="budnitz2011"),
    dict(id="mon-opioid", appliesTo={"classes": ["opioid"]},
         title="Opioid pain medicine: what to watch for",
         watchFor=["unusual sleepiness or trouble staying awake", "slow or shallow breathing", "new confusion", "constipation", "unsteadiness"],
         relatedConcepts=["drowsiness", "confusion", "constipation", "dizziness", "fall"],
         plain="{med} is an opioid pain medicine; sleepiness, confusion and constipation are common, and older adults are more sensitive to them.",
         clinician="Opioid analgesics are among the drug classes most often implicated in ED visits for adverse drug events in older adults (Shehab 2016; Budnitz 2021). Sedation, respiratory depression, constipation and falls warrant monitoring, especially with other CNS-active drugs.",
         question="Which side effects of {med} should prompt a call, and is a plan for constipation or naloxone at home recommended?",
         sourceId="budnitz2021"),
    dict(id="mon-digoxin", appliesTo={"drugs": ["digoxin"]},
         title="Digoxin: what to watch for",
         watchFor=["nausea or loss of appetite", "blurred or yellow-tinted vision", "new confusion", "a very slow or irregular pulse"],
         relatedConcepts=["nausea", "appetiteWorse", "blurred_vision", "confusion"],
         plain="{med} has a narrow range between the right amount and too much, and early signs of too much can be easy to miss.",
         clinician="Narrow therapeutic index; the label lists nausea, anorexia, visual disturbance and confusion among signs of toxicity, and risk rises with reduced renal function and interacting drugs (e.g. amiodarone).",
         question="When should the digoxin level and kidney function next be checked, and which symptoms should prompt a call?",
         sourceId="fda_labels"),
]

# ------------------------------------------------------------------------------------------------
# Source register

SOURCES = [
    dict(id="beers2023", short="AGS Beers Criteria® 2023",
         citation="By the 2023 American Geriatrics Society Beers Criteria® Update Expert Panel. American Geriatrics Society 2023 updated AGS Beers Criteria® for potentially inappropriate medication use in older adults. J Am Geriatr Soc. 2023;71(7):2052-2081.",
         url="https://doi.org/10.1111/jgs.18372", doi="10.1111/jgs.18372", year=2023,
         usedFor="Medicines to avoid or use with caution in older adults: Tables 2-7 (most older adults, drug-disease, caution, drug-drug, kidney function, strong anticholinergics)."),
    dict(id="acb2012", short="ACB scale, 2012 update",
         citation="Aging Brain Care, Regenstrief Institute / Indiana University. Anticholinergic Cognitive Burden Scale, 2012 update. Boustani M, Campbell N, Munger S, Maidment I, Fox C. Impact of anticholinergics on the aging brain. Aging Health. 2008;4(3):311-320.",
         url="https://www.hii.iu.edu/resources/anticholinergic-cognitive-burden-scale.pdf", doi="10.2217/1745509X.4.3.311", year=2012,
         usedFor="Anticholinergic burden score (ACB) of each medicine and the review threshold of 3."),
    dict(id="steadi", short="CDC STEADI-Rx",
         citation="Centers for Disease Control and Prevention. STEADI: Medications Linked to Falls (fact sheet), 2017; STEADI-Rx Community Pharmacy Fall Risk Checklist, 2019.",
         url="https://www.cdc.gov/steadi/media/pdfs/STEADI-FactSheet-MedsLinkedtoFalls-508.pdf", doi=None, year=2019,
         usedFor="Fall-risk-increasing medicine classes."),
    dict(id="stoppfall", short="STOPPFall 2021",
         citation="Seppala LJ, Petrovic M, Ryg J, et al. STOPPFall (Screening Tool of Older Persons Prescriptions in older adults with high fall risk): a Delphi study by the EuGMS Task and Finish Group on Fall-Risk-Increasing Drugs. Age Ageing. 2021;50(4):1189-1199.",
         url="https://pmc.ncbi.nlm.nih.gov/articles/PMC8244563/", doi="10.1093/ageing/afaa249", year=2021,
         usedFor="Fall-risk-increasing medicine classes (European expert consensus)."),
    dict(id="devries2018", short="de Vries 2018",
         citation="de Vries M, Seppala LJ, Daams JG, et al. Fall-risk-increasing drugs: a systematic review and meta-analysis: I. Cardiovascular drugs. J Am Med Dir Assoc. 2018;19(4):371.e1-371.e9.",
         url="https://doi.org/10.1016/j.jamda.2017.12.013", doi="10.1016/j.jamda.2017.12.013", year=2018,
         usedFor="Why beta-blockers are not counted as fall-risk medicines."),
    dict(id="stopp_start_v3", short="STOPP/START v3",
         citation="O'Mahony D, Cherubini A, Guiteras AR, et al. STOPP/START criteria for potentially inappropriate prescribing in older people: version 3. Eur Geriatr Med. 2023;14(4):625-632.",
         url="https://pmc.ncbi.nlm.nih.gov/articles/PMC10447584/", doi="10.1007/s41999-023-00777-y", year=2023,
         usedFor="Two medicines of the same kind (duplicate drug class)."),
    dict(id="thinkcascades", short="ThinkCascades 2022",
         citation="McCarthy LM, Savage R, Dalton K, et al. ThinkCascades: a tool for identifying clinically important prescribing cascades affecting older people. Drugs Aging. 2022;39(10):829-840.",
         url="https://pmc.ncbi.nlm.nih.gov/articles/PMC9477172/", doi="10.1007/s40266-022-00964-9", year=2022,
         usedFor="Clinically important prescribing cascades in older adults."),
    dict(id="pipc2025", short="PIPC list 2025",
         citation="Rochon PA, O'Mahony D, Cherubini A, et al. International expert panel's potentially inappropriate prescribing cascades (PIPC) list. Eur Geriatr Med. 2025;16(5):1573-1584.",
         url="https://pmc.ncbi.nlm.nih.gov/articles/PMC12712104/", doi="10.1007/s41999-025-01215-x", year=2025,
         usedFor="Potentially inappropriate prescribing cascades (international Delphi list)."),
    dict(id="savage2020", short="Savage 2020",
         citation="Savage RD, Visentin JD, Bronskill SE, et al. Evaluation of a common prescribing cascade of calcium channel blockers and diuretics in older adults with hypertension. JAMA Intern Med. 2020;180(5):643-651.",
         url="https://pubmed.ncbi.nlm.nih.gov/32091538/", doi="10.1001/jamainternmed.2019.7087", year=2020,
         usedFor="Calcium channel blocker → ankle swelling → loop diuretic cascade."),
    dict(id="read2021", short="Read 2021",
         citation="Read SH, Giannakeas V, Pop P, et al. Evidence of a gabapentinoid and diuretic prescribing cascade among older adults with lower back pain. J Am Geriatr Soc. 2021;69(10):2842-2850.",
         url="https://pubmed.ncbi.nlm.nih.gov/34118076/", doi="10.1111/jgs.17312", year=2021,
         usedFor="Gabapentinoid → swelling → diuretic cascade."),
    dict(id="gill2005", short="Gill 2005",
         citation="Gill SS, Mamdani M, Naglie G, et al. A prescribing cascade involving cholinesterase inhibitors and anticholinergic drugs. Arch Intern Med. 2005;165(7):808-813.",
         url="https://pubmed.ncbi.nlm.nih.gov/15824303/", doi="10.1001/archinte.165.7.808", year=2005,
         usedFor="Cholinesterase inhibitor → bladder leakage → bladder antimuscarinic cascade."),
    dict(id="avorn1995jama", short="Avorn 1995, JAMA",
         citation="Avorn J, Gurwitz JH, Bohn RL, et al. Increased incidence of levodopa therapy following metoclopramide use. JAMA. 1995;274(22):1780-1782.",
         url="https://pubmed.ncbi.nlm.nih.gov/7500509/", doi="10.1001/jama.1995.03530220046031", year=1995,
         usedFor="Metoclopramide → parkinsonism → levodopa cascade."),
    dict(id="avorn1995ajm", short="Avorn 1995, Am J Med",
         citation="Avorn J, Bohn RL, Mogun H, et al. Neuroleptic drug exposure and treatment of parkinsonism in the elderly: a case-control study. Am J Med. 1995;99(1):48-54.",
         url="https://pubmed.ncbi.nlm.nih.gov/7598142/", doi="10.1016/s0002-9343(99)80104-1", year=1995,
         usedFor="Antipsychotic → movement symptoms → antiparkinsonian medicine cascade."),
    dict(id="gurwitz1997", short="Gurwitz 1997",
         citation="Gurwitz JH, Kalish SC, Bohn RL, et al. Thiazide diuretics and the initiation of anti-gout therapy. J Clin Epidemiol. 1997;50(8):953-959.",
         url="https://pubmed.ncbi.nlm.nih.gov/9291881/", doi="10.1016/s0895-4356(97)00101-7", year=1997,
         usedFor="Diuretic → gout → anti-gout medicine cascade."),
    dict(id="gurwitz1994", short="Gurwitz 1994",
         citation="Gurwitz JH, Avorn J, Bohn RL, et al. Initiation of antihypertensive treatment during nonsteroidal anti-inflammatory drug therapy. JAMA. 1994;272(10):781-786.",
         url="https://pubmed.ncbi.nlm.nih.gov/8078142/", doi="10.1001/jama.1994.03520100043031", year=1994,
         usedFor="NSAID → raised blood pressure → antihypertensive cascade."),
    dict(id="vegter2010", short="Vegter 2010",
         citation="Vegter S, de Jong-van den Berg LT. Misdiagnosis and mistreatment of a common side-effect: angiotensin-converting enzyme inhibitor-induced cough. Br J Clin Pharmacol. 2010;69(2):200-203.",
         url="https://pubmed.ncbi.nlm.nih.gov/20233184/", doi="10.1111/j.1365-2125.2009.03571.x", year=2010,
         usedFor="ACE inhibitor → cough → cough medicine cascade."),
    dict(id="budnitz2011", short="Budnitz 2011",
         citation="Budnitz DS, Lovegrove MC, Shehab N, Richards CL. Emergency hospitalizations for adverse drug events in older Americans. N Engl J Med. 2011;365(21):2002-2012.",
         url="https://pubmed.ncbi.nlm.nih.gov/22111719/", doi="10.1056/NEJMsa1103053", year=2011,
         usedFor="Which medicines are most often behind emergency hospitalizations for medication harm (what to watch for)."),
    dict(id="budnitz2021", short="Budnitz 2021",
         citation="Budnitz DS, Shehab N, Lovegrove MC, et al. US emergency department visits attributed to medication harms, 2017-2019. JAMA. 2021;326(13):1299-1309.",
         url="https://pubmed.ncbi.nlm.nih.gov/34609453/", doi="10.1001/jama.2021.13844", year=2021,
         usedFor="Which medicines are most often behind emergency visits for medication harm (what to watch for)."),
    dict(id="shehab2016", short="Shehab 2016",
         citation="Shehab N, Lovegrove MC, Geller AI, et al. US emergency department visits for outpatient adverse drug events, 2013-2014. JAMA. 2016;316(20):2115-2125.",
         url="https://pubmed.ncbi.nlm.nih.gov/27893129/", doi="10.1001/jama.2016.16201", year=2016,
         usedFor="Drug classes behind emergency visits for adverse drug events (context for monitoring prompts)."),
    dict(id="fda_labels", short="FDA drug labels (DailyMed)",
         citation="U.S. Food and Drug Administration Structured Product Labeling, retrieved through the openFDA drug label API and NLM DailyMed (adverse reactions, warnings and precautions, geriatric use), 2026-10-10.",
         url="https://dailymed.nlm.nih.gov/dailymed/", doi=None, year=2026,
         usedFor="Diary-related known effects of medicines (dizziness, drowsiness, confusion, swelling, sleep, energy, appetite)."),
    dict(id="medlineplus", short="MedlinePlus",
         citation="National Library of Medicine. MedlinePlus drug information, via MedlinePlus Connect, 2026-10-10.",
         url="https://medlineplus.gov/druginformation.html", doi=None, year=2026,
         usedFor="Plain-language uses and effects for supplements and OTC products without an FDA prescription label."),
    dict(id="rxnorm", short="RxNorm",
         citation="National Library of Medicine. RxNorm and the RxNav REST API (ingredient RxCUIs and brand-to-ingredient relations), queried 2026-10-10.",
         url="https://lhncbc.nlm.nih.gov/RxNav/APIs/RxNormAPIs.html", doi=None, year=2026,
         usedFor="Ingredient codes (RxCUI) and checks that each brand name maps to its ingredient."),
]
