# Kinwise KB drug master list (hand-curated). Compiled into src/kb/data/drugs.json by build.py.
# Fields: id (lowercase generic), display, classes, brands (lowercase, single-ingredient products only),
# aliases (unambiguous lay names / alternate spellings), otc, fx (extra diary effects beyond class
# defaults), nofx (class-default effects to drop), use (one plain line).
# ACB scores, RxCUIs and the Beers Table 7 "strong_anticholinergic" class are added by build.py
# from the verified research files; effects get class defaults (see EFFECTS_BY_CLASS in build.py).

DRUGS = []


def D(id, display, classes, brands=(), aliases=(), otc=False, fx=(), nofx=(), use="", variant=None):
    DRUGS.append(dict(id=id, display=display, classes=list(classes), brands=list(brands), aliases=list(aliases),
                      otc=otc, fx=list(fx), nofx=list(nofx), usedFor=use, variant=variant))


# Route and dose variants (Beers 2023 scopes several criteria by route or dose: oral NSAIDs, systemic estrogen,
# atropine excluding ophthalmic, systemic corticosteroids, oral diphenhydramine, doxepin > 6 mg/day). A variant is
# its own KB entry with its own classes; `variant` tells the name matcher (src/kb/normalize.ts) when to pick it:
#   of        the base ingredient id typed names resolve to first ("diclofenac")
#   words     words in the typed name that select the variant ("gel", "eye drops"); multi-word phrases allowed
#   baseWords words that send a variant back to the base ("Voltaren 50 mg tablets" -> oral diclofenac);
#             "#mg" stands for any "<number> mg"
#   maxDoseMg a typed strength at or below this selects the variant ("doxepin 3 mg")
# A variant shares the base's RxNorm ingredient RxCUI; its ACB score is 0 unless set (the ACB card scores
# medicines taken by mouth or injection, at usual doses).
def V(of, words=(), base_words=(), max_dose_mg=None, acb=0):
    v = {"of": of, "acb": acb}
    if words:
        v["words"] = list(words)
    if base_words:
        v["baseWords"] = list(base_words)
    if max_dose_mg is not None:
        v["maxDoseMg"] = max_dose_mg
    return v


EYE_WORDS = ["eye", "eyes", "ophthalmic", "ophth", "eye drop", "eye drops", "eyedrop", "eyedrops", "drop", "drops", "gtt", "gtts"]
SKIN_WORDS = ["cream", "creme", "ointment", "lotion", "topical", "gel", "spray", "roll-on", "rollerball", "on the skin"]
ORAL_WORDS = ["tab", "tabs", "tablet", "tablets", "cap", "caps", "capsule", "capsules", "caplet", "caplets", "pill", "pills", "oral",
              "po", "by mouth", "er", "xr", "sr", "ec", "dr", "#mg"]


# ---------------------------------------------------------------- benzodiazepines, Z-drugs, other sedatives
D("alprazolam", "Alprazolam", ["benzodiazepine"], ["xanax", "xanax xr"], use="Anxiety and panic attacks")
D("chlordiazepoxide", "Chlordiazepoxide", ["benzodiazepine"], ["librium"], use="Anxiety; alcohol withdrawal")
D("clobazam", "Clobazam", ["benzodiazepine", "antiepileptic"], ["onfi", "sympazan"], use="Seizures")
D("clonazepam", "Clonazepam", ["benzodiazepine", "antiepileptic"], ["klonopin"], use="Panic disorder and seizures")
D("clorazepate", "Clorazepate", ["benzodiazepine"], ["tranxene", "tranxene t-tab"], use="Anxiety; alcohol withdrawal")
D("diazepam", "Diazepam", ["benzodiazepine"], ["valium", "valtoco"], use="Anxiety, muscle spasms and alcohol withdrawal")
D("estazolam", "Estazolam", ["benzodiazepine"], use="Short-term treatment of insomnia")
D("lorazepam", "Lorazepam", ["benzodiazepine"], ["ativan", "loreev xr"], use="Anxiety; sometimes prescribed for sleep")
D("midazolam", "Midazolam", ["benzodiazepine"], ["nayzilam"], use="Sedation for procedures; nasal spray for seizure clusters")
D("oxazepam", "Oxazepam", ["benzodiazepine"], use="Anxiety; alcohol withdrawal")
D("temazepam", "Temazepam", ["benzodiazepine"], ["restoril"], use="Short-term treatment of insomnia")
D("triazolam", "Triazolam", ["benzodiazepine"], ["halcion"], use="Short-term treatment of insomnia")
D("eszopiclone", "Eszopiclone", ["z_drug"], ["lunesta"], use="Insomnia")
D("zaleplon", "Zaleplon", ["z_drug"], ["sonata"], use="Insomnia (trouble falling asleep)")
D("zolpidem", "Zolpidem", ["z_drug"], ["ambien", "ambien cr", "edluar", "zolpimist"], use="Insomnia")
D("butalbital", "Butalbital", ["barbiturate"], use="Tension headaches (in combination products such as Fioricet)")
D("phenobarbital", "Phenobarbital", ["barbiturate", "antiepileptic"], use="Seizures")
D("primidone", "Primidone", ["barbiturate", "antiepileptic"], ["mysoline"], use="Essential tremor and seizures")
D("meprobamate", "Meprobamate", ["sedative_other"], use="Anxiety (an older medicine, now rarely used)")
D("melatonin", "Melatonin", ["sleep_supplement"], otc=True, fx=["drowsiness", "dizziness"], use="Sleep (dietary supplement)")

# ---------------------------------------------------------------- antipsychotics
D("aripiprazole", "Aripiprazole", ["antipsychotic"], ["abilify", "abilify maintena", "abilify mycite"], fx=["energy"], use="Schizophrenia and bipolar disorder; add-on treatment for depression")
D("asenapine", "Asenapine", ["antipsychotic"], ["saphris", "secuado"], use="Schizophrenia and bipolar disorder")
D("brexpiprazole", "Brexpiprazole", ["antipsychotic"], ["rexulti"], use="Add-on for depression; schizophrenia; agitation with Alzheimer dementia")
D("cariprazine", "Cariprazine", ["antipsychotic"], ["vraylar"], use="Schizophrenia and bipolar disorder; add-on for depression")
D("chlorpromazine", "Chlorpromazine", ["antipsychotic"], ["thorazine"], fx=["confusion"], use="Schizophrenia; severe nausea and hiccups")
D("clozapine", "Clozapine", ["antipsychotic"], ["clozaril", "versacloz"], fx=["confusion"], use="Schizophrenia that has not responded to other treatment; Parkinson disease psychosis")
D("fluphenazine", "Fluphenazine", ["antipsychotic"], use="Schizophrenia")
D("haloperidol", "Haloperidol", ["antipsychotic"], ["haldol"], use="Schizophrenia; Tourette syndrome; severe agitation")
D("iloperidone", "Iloperidone", ["antipsychotic"], ["fanapt"], use="Schizophrenia and bipolar disorder")
D("loxapine", "Loxapine", ["antipsychotic"], ["adasuve", "loxitane"], use="Schizophrenia; agitation")
D("lurasidone", "Lurasidone", ["antipsychotic"], ["latuda"], use="Schizophrenia and bipolar depression")
D("methotrimeprazine", "Methotrimeprazine (levomepromazine)", ["antipsychotic"], aliases=["levomepromazine"], use="Psychosis, pain and nausea in palliative care (not marketed in the US)")
D("molindone", "Molindone", ["antipsychotic"], ["moban"], use="Schizophrenia")
D("olanzapine", "Olanzapine", ["antipsychotic"], ["zyprexa", "zyprexa zydis", "zyprexa relprevv"], fx=["confusion"], use="Schizophrenia and bipolar disorder")
D("paliperidone", "Paliperidone", ["antipsychotic"], ["invega", "invega sustenna", "invega trinza", "invega hafyera"], use="Schizophrenia and schizoaffective disorder")
D("perphenazine", "Perphenazine", ["antipsychotic"], use="Schizophrenia; severe nausea")
D("pimavanserin", "Pimavanserin", ["antipsychotic"], ["nuplazid"], fx=["confusion", "swelling"], use="Hallucinations and delusions with Parkinson disease psychosis")
D("pimozide", "Pimozide", ["antipsychotic"], ["orap"], use="Tics in Tourette syndrome")
D("quetiapine", "Quetiapine", ["antipsychotic"], ["seroquel", "seroquel xr"], fx=["energy"], use="Schizophrenia and bipolar disorder; add-on for depression (sometimes used off-label for sleep)")
D("risperidone", "Risperidone", ["antipsychotic"], ["risperdal", "risperdal consta", "perseris", "uzedy"], use="Schizophrenia and bipolar disorder; irritability with autism")
D("thioridazine", "Thioridazine", ["antipsychotic"], ["mellaril"], use="Schizophrenia (rarely used now)")
D("trifluoperazine", "Trifluoperazine", ["antipsychotic"], ["stelazine"], use="Schizophrenia; anxiety (rarely used now)")
D("ziprasidone", "Ziprasidone", ["antipsychotic"], ["geodon"], use="Schizophrenia and bipolar disorder")

# ---------------------------------------------------------------- antidepressants
D("amitriptyline", "Amitriptyline", ["tca"], ["elavil"], use="Depression; often used for nerve pain, headaches or sleep")
D("amoxapine", "Amoxapine", ["tca"], use="Depression")
D("clomipramine", "Clomipramine", ["tca"], ["anafranil"], use="Obsessive-compulsive disorder")
D("desipramine", "Desipramine", ["tca"], ["norpramin"], use="Depression")
D("doxepin", "Doxepin", ["tca"], ["sinequan"], use="Depression and anxiety; low doses (Silenor) for insomnia")
D("doxepin low dose", "Doxepin, low dose for sleep (3 to 6 mg)", ["tca"], ["silenor"], use="Insomnia (trouble staying asleep); low-dose tablets of 3 or 6 mg",
  variant=V("doxepin", max_dose_mg=6))
D("imipramine", "Imipramine", ["tca"], ["tofranil", "tofranil-pm"], use="Depression; bedwetting")
D("nortriptyline", "Nortriptyline", ["tca"], ["pamelor"], use="Depression; often used for nerve pain")
D("trimipramine", "Trimipramine", ["tca"], ["surmontil"], use="Depression")
D("citalopram", "Citalopram", ["ssri"], ["celexa"], use="Depression")
D("escitalopram", "Escitalopram", ["ssri"], ["lexapro"], fx=["energy"], use="Depression and anxiety")
D("fluoxetine", "Fluoxetine", ["ssri"], ["prozac"], fx=["appetiteWorse"], use="Depression, anxiety and obsessive-compulsive disorder")
D("fluvoxamine", "Fluvoxamine", ["ssri"], ["luvox"], use="Obsessive-compulsive disorder")
D("paroxetine", "Paroxetine", ["ssri"], ["paxil", "paxil cr", "pexeva", "brisdelle"], fx=["energy"], use="Depression, anxiety and panic disorder; hot flashes")
D("sertraline", "Sertraline", ["ssri"], ["zoloft"], fx=["energy"], use="Depression, anxiety, panic disorder and PTSD")
D("desvenlafaxine", "Desvenlafaxine", ["snri"], ["pristiq"], use="Depression")
D("duloxetine", "Duloxetine", ["snri"], ["cymbalta", "drizalma sprinkle"], fx=["appetiteWorse"], use="Depression and anxiety; nerve pain, fibromyalgia and chronic muscle or joint pain")
D("levomilnacipran", "Levomilnacipran", ["snri"], ["fetzima"], use="Depression")
D("milnacipran", "Milnacipran", ["snri"], ["savella"], use="Fibromyalgia")
D("venlafaxine", "Venlafaxine", ["snri"], ["effexor", "effexor xr"], fx=["appetiteWorse"], use="Depression and anxiety")
D("bupropion", "Bupropion", ["antidepressant_other"], ["wellbutrin", "wellbutrin sr", "wellbutrin xl", "zyban", "aplenzin", "forfivo xl"], fx=["sleep", "dizziness", "appetiteWorse"], use="Depression; quitting smoking")
D("mirtazapine", "Mirtazapine", ["antidepressant_other"], ["remeron", "remeronsoltab"], fx=["drowsiness", "dizziness", "energy"], use="Depression (also increases appetite and sleepiness)")
D("trazodone", "Trazodone", ["antidepressant_other"], ["desyrel"], fx=["drowsiness", "dizziness", "energy"], use="Depression; often used at low doses for sleep")
D("vilazodone", "Vilazodone", ["antidepressant_other"], ["viibryd"], fx=["sleep"], use="Depression")
D("vortioxetine", "Vortioxetine", ["antidepressant_other"], ["trintellix"], fx=["dizziness"], use="Depression")

# ---------------------------------------------------------------- antiepileptics, gabapentinoids
D("carbamazepine", "Carbamazepine", ["antiepileptic"], ["tegretol", "tegretol xr", "carbatrol", "equetro"], fx=["confusion"], use="Seizures; trigeminal nerve pain; bipolar disorder")
D("divalproex", "Divalproex (valproate)", ["antiepileptic"], ["depakote", "depakote er", "depakene"], aliases=["valproate", "valproic acid", "divalproex sodium"], use="Seizures, bipolar disorder and migraine prevention")
D("lacosamide", "Lacosamide", ["antiepileptic"], ["vimpat", "motpoly xr"], use="Seizures")
D("lamotrigine", "Lamotrigine", ["antiepileptic"], ["lamictal", "lamictal xr", "lamictal odt", "subvenite"], use="Seizures and bipolar disorder")
D("levetiracetam", "Levetiracetam", ["antiepileptic"], ["keppra", "keppra xr", "spritam", "elepsia xr"], fx=["energy"], use="Seizures")
D("oxcarbazepine", "Oxcarbazepine", ["antiepileptic"], ["trileptal", "oxtellar xr"], use="Seizures")
D("phenytoin", "Phenytoin", ["antiepileptic"], ["dilantin"], fx=["confusion"], use="Seizures")
D("topiramate", "Topiramate", ["antiepileptic"], ["topamax", "trokendi xr", "qudexy xr", "eprontia"], fx=["confusion", "energy", "appetiteWorse"], use="Seizures; migraine prevention")
D("zonisamide", "Zonisamide", ["antiepileptic"], ["zonegran", "zonisade"], fx=["appetiteWorse"], use="Seizures")
D("gabapentin", "Gabapentin", ["gabapentinoid"], ["neurontin", "gralise"], use="Nerve pain (for example after shingles) and seizures")
D("gabapentin enacarbil", "Gabapentin enacarbil", ["gabapentinoid"], ["horizant"], use="Restless legs syndrome; nerve pain after shingles")
D("pregabalin", "Pregabalin", ["gabapentinoid"], ["lyrica", "lyrica cr"], fx=["confusion"], use="Nerve pain, fibromyalgia and seizures")

# ---------------------------------------------------------------- opioids
D("buprenorphine", "Buprenorphine", ["opioid"], ["butrans", "belbuca", "sublocade", "subutex"], use="Chronic pain (patch or film); opioid use disorder")
D("codeine", "Codeine", ["opioid"], use="Pain and cough (mostly in combination products such as Tylenol with codeine)")
D("fentanyl", "Fentanyl", ["opioid"], ["duragesic", "actiq", "fentora", "subsys"], use="Severe, long-lasting pain (patch)")
D("hydrocodone", "Hydrocodone", ["opioid"], ["hysingla er", "zohydro er"], use="Pain (usually combined with acetaminophen, e.g. Norco)")
D("hydromorphone", "Hydromorphone", ["opioid"], ["dilaudid", "exalgo"], use="Severe pain")
D("meperidine", "Meperidine", ["opioid"], ["demerol"], use="Pain (rarely recommended now)")
D("methadone", "Methadone", ["opioid"], ["dolophine", "methadose"], use="Chronic pain; opioid use disorder")
D("morphine", "Morphine", ["opioid"], ["ms contin", "kadian", "avinza"], use="Severe pain")
D("oxycodone", "Oxycodone", ["opioid"], ["oxycontin", "roxicodone", "oxaydo", "xtampza er", "roxybond"], fx=["energy"], use="Moderate to severe pain")
D("oxymorphone", "Oxymorphone", ["opioid"], use="Severe pain")
D("tapentadol", "Tapentadol", ["opioid"], ["nucynta", "nucynta er"], use="Moderate to severe pain; diabetic nerve pain")
D("tramadol", "Tramadol", ["opioid"], ["ultram", "conzip", "qdolo"], fx=["energy"], use="Moderate pain")
D("naloxone", "Naloxone", ["opioid_antagonist"], ["narcan", "rivive", "zimhi"], otc=True, use="Emergency reversal of an opioid overdose")

# ---------------------------------------------------------------- muscle relaxants
D("carisoprodol", "Carisoprodol", ["skeletal_muscle_relaxant"], ["soma"], use="Short-term muscle pain")
D("chlorzoxazone", "Chlorzoxazone", ["skeletal_muscle_relaxant"], ["lorzone", "parafon forte dsc"], use="Muscle pain and spasms")
D("cyclobenzaprine", "Cyclobenzaprine", ["skeletal_muscle_relaxant"], ["flexeril", "amrix", "fexmid"], fx=["confusion", "energy"], use="Muscle spasms")
D("metaxalone", "Metaxalone", ["skeletal_muscle_relaxant"], ["skelaxin", "metaxall"], use="Muscle pain and spasms")
D("methocarbamol", "Methocarbamol", ["skeletal_muscle_relaxant"], ["robaxin"], use="Muscle pain and spasms")
D("orphenadrine", "Orphenadrine", ["skeletal_muscle_relaxant"], ["norflex"], use="Muscle pain and spasms")
D("baclofen", "Baclofen", ["antispasticity_agent"], ["lioresal", "ozobax", "fleqsuvy", "lyvispah"], fx=["confusion"], use="Muscle stiffness (spasticity), e.g. after stroke or with multiple sclerosis")
D("tizanidine", "Tizanidine", ["antispasticity_agent"], ["zanaflex"], use="Muscle stiffness (spasticity)")

# ---------------------------------------------------------------- other CNS
D("buspirone", "Buspirone", ["anxiolytic_other"], ["buspar"], fx=["dizziness", "drowsiness"], use="Anxiety")
D("lithium", "Lithium", ["mood_stabilizer"], ["lithobid"], fx=["confusion", "drowsiness"], use="Bipolar disorder")
D("donepezil", "Donepezil", ["cholinesterase_inhibitor"], ["aricept", "adlarity"], fx=["energy"], use="Memory and thinking symptoms of Alzheimer disease")
D("galantamine", "Galantamine", ["cholinesterase_inhibitor"], ["razadyne", "razadyne er"], use="Memory and thinking symptoms of Alzheimer disease")
D("rivastigmine", "Rivastigmine", ["cholinesterase_inhibitor"], ["exelon"], use="Memory and thinking symptoms of Alzheimer or Parkinson disease dementia")
D("memantine", "Memantine", ["nmda_antagonist"], ["namenda", "namenda xr"], fx=["dizziness", "confusion"], use="Moderate to severe Alzheimer disease")
D("carbidopa", "Carbidopa", ["dopaminergic_antiparkinson"], ["lodosyn"], use="Parkinson disease (taken with levodopa)")
D("levodopa", "Levodopa", ["dopaminergic_antiparkinson"], ["inbrija"], fx=["appetiteWorse"], use="Parkinson disease (usually combined with carbidopa, e.g. Sinemet)")
D("pramipexole", "Pramipexole", ["dopaminergic_antiparkinson"], ["mirapex", "mirapex er"], fx=["swelling", "fall", "nearFall"], use="Parkinson disease; restless legs syndrome")
D("ropinirole", "Ropinirole", ["dopaminergic_antiparkinson"], ["requip", "requip xl"], fx=["swelling", "fall", "nearFall"], use="Parkinson disease; restless legs syndrome")
D("rotigotine", "Rotigotine", ["dopaminergic_antiparkinson"], ["neupro"], use="Parkinson disease; restless legs syndrome (skin patch)")
D("rasagiline", "Rasagiline", ["dopaminergic_antiparkinson"], ["azilect"], use="Parkinson disease")
D("amantadine", "Amantadine", ["dopaminergic_antiparkinson"], ["gocovri", "osmolex er", "symmetrel"], fx=["swelling", "appetiteWorse"], use="Parkinson disease and its movement side effects")
D("benztropine", "Benztropine", ["antiparkinson_anticholinergic"], ["cogentin"], use="Parkinson disease tremor; movement side effects of antipsychotics")
D("trihexyphenidyl", "Trihexyphenidyl", ["antiparkinson_anticholinergic"], use="Parkinson disease tremor; movement side effects of antipsychotics")
D("ergoloid mesylates", "Ergoloid mesylates", ["ergot_derivative"], aliases=["hydergine", "dihydroergotoxine"], use="Age-related mental decline (an old medicine without proven benefit)")
D("caffeine", "Caffeine", ["stimulant"], otc=True, fx=["sleep"], use="Alertness; an ingredient in some headache products")

# ---------------------------------------------------------------- antihistamines (first generation)
D("brompheniramine", "Brompheniramine", ["first_gen_antihistamine"], otc=True, use="Allergy and cold symptoms (in many OTC combination products)")
D("carbinoxamine", "Carbinoxamine", ["first_gen_antihistamine"], ["karbinal er", "ryvent"], use="Allergy symptoms")
D("chlorpheniramine", "Chlorpheniramine", ["first_gen_antihistamine"], ["chlor-trimeton", "aller-chlor"], otc=True, use="Allergy and cold symptoms (in many OTC combination products)")
D("clemastine", "Clemastine", ["first_gen_antihistamine"], ["tavist", "dayhist"], otc=True, use="Allergy symptoms")
D("cyproheptadine", "Cyproheptadine", ["first_gen_antihistamine"], ["periactin"], use="Allergy symptoms; sometimes used to increase appetite")
D("dimenhydrinate", "Dimenhydrinate", ["first_gen_antihistamine"], ["dramamine", "dramamine original"], otc=True, use="Motion sickness")
D("diphenhydramine", "Diphenhydramine", ["first_gen_antihistamine"], ["benadryl", "zzzquil", "nytol", "sominex", "simply sleep", "unisom sleepgels", "banophen", "diphenhist", "sleep-eze", "compoz", "tylenol simply sleep", "unisom sleepmelts", "unisom sleepminis", "benadryl allergy", "benadryl allergy ultratabs", "benadryl ultratabs"], otc=True, use="Allergies, itching and sleep (the 'PM' ingredient in many night-time products)")
D("diphenhydramine topical", "Diphenhydramine cream, gel or spray (on the skin)", ["antihistamine_topical"],
  ["benadryl cream", "benadryl itch stopping cream", "benadryl itch stopping gel", "benadryl itch relief stick", "benadryl itch cooling spray",
   "benadryl extra strength itch stopping cream", "benadryl extra strength itch relief"], otc=True,
  use="Itching from bites, rashes and minor skin irritation (applied to the skin)",
  variant=V("diphenhydramine", words=["cream", "creme", "ointment", "lotion", "topical", "gel", "spray", "stick", "on the skin"], base_words=ORAL_WORDS))
D("doxylamine", "Doxylamine", ["first_gen_antihistamine"], ["unisom", "unisom sleeptabs", "zzzquil ultra"], otc=True, use="Sleep (OTC sleep aid); an ingredient in NyQuil")
D("hydroxyzine", "Hydroxyzine", ["first_gen_antihistamine"], ["vistaril", "atarax"], use="Itching and anxiety")
D("meclizine", "Meclizine", ["first_gen_antihistamine"], ["antivert", "bonine", "dramamine less drowsy", "dramamine all day less drowsy"], otc=True, fx=["energy"], nofx=["dizziness"], use="Dizziness (vertigo) and motion sickness")
D("promethazine", "Promethazine", ["first_gen_antihistamine", "dopamine_antagonist_antiemetic"], ["phenergan", "promethegan"], use="Nausea, allergies and cough (in some cough syrups)")
D("triprolidine", "Triprolidine", ["first_gen_antihistamine"], otc=True, use="Allergy and cold symptoms")
D("alimemazine", "Alimemazine (trimeprazine)", ["first_gen_antihistamine"], aliases=["trimeprazine"], use="Itching and allergy symptoms (not marketed in the US)")

# ---------------------------------------------------------------- antihistamines (second generation)
D("cetirizine", "Cetirizine", ["second_gen_antihistamine"], ["zyrtec"], otc=True, fx=["drowsiness"], use="Allergy symptoms")
D("levocetirizine", "Levocetirizine", ["second_gen_antihistamine"], ["xyzal"], otc=True, fx=["drowsiness"], use="Allergy symptoms")
D("loratadine", "Loratadine", ["second_gen_antihistamine"], ["claritin", "alavert"], otc=True, use="Allergy symptoms")
D("desloratadine", "Desloratadine", ["second_gen_antihistamine"], ["clarinex"], use="Allergy symptoms")
D("fexofenadine", "Fexofenadine", ["second_gen_antihistamine"], ["allegra", "allegra allergy"], otc=True, use="Allergy symptoms")

# ---------------------------------------------------------------- bladder, GI antispasmodics, antiemetics
D("darifenacin", "Darifenacin", ["bladder_antimuscarinic"], ["enablex"], use="Overactive bladder")
D("fesoterodine", "Fesoterodine", ["bladder_antimuscarinic"], ["toviaz"], use="Overactive bladder")
D("flavoxate", "Flavoxate", ["bladder_antimuscarinic"], ["urispas"], use="Bladder spasms and urinary discomfort")
D("oxybutynin", "Oxybutynin", ["bladder_antimuscarinic"], ["ditropan", "ditropan xl", "oxytrol", "gelnique"], fx=["energy"], use="Overactive bladder")
D("solifenacin", "Solifenacin", ["bladder_antimuscarinic"], ["vesicare", "vesicare ls"], fx=["energy"], use="Overactive bladder")
D("tolterodine", "Tolterodine", ["bladder_antimuscarinic"], ["detrol", "detrol la"], use="Overactive bladder")
D("trospium", "Trospium", ["bladder_antimuscarinic"], ["sanctura"], use="Overactive bladder")
D("propiverine", "Propiverine", ["bladder_antimuscarinic"], use="Overactive bladder (not marketed in the US)")
D("mirabegron", "Mirabegron", ["beta3_agonist"], ["myrbetriq"], use="Overactive bladder")
D("vibegron", "Vibegron", ["beta3_agonist"], ["gemtesa"], use="Overactive bladder")
D("atropine", "Atropine", ["gi_antispasmodic"], ["sal-tropine", "atropen"], use="Slow heart rate and other uses; eye drops (eye drops are not counted in Beers)")
D("atropine ophthalmic", "Atropine eye drops", ["ophthalmic_other"], ["isopto atropine", "atropine care"],
  use="Eye drops that widen the pupil (eye exams, eye inflammation, lazy eye)",
  variant=V("atropine", words=EYE_WORDS))
D("belladonna alkaloids", "Belladonna alkaloids", ["gi_antispasmodic"], aliases=["belladonna"], use="Stomach and bowel cramps (in combination products such as Donnatal)")
D("clidinium", "Clidinium", ["gi_antispasmodic"], use="Stomach cramps and irritable bowel (with chlordiazepoxide as Librax)")
D("dicyclomine", "Dicyclomine", ["gi_antispasmodic"], ["bentyl"], use="Irritable bowel syndrome cramps")
D("homatropine", "Homatropine", ["gi_antispasmodic"], use="Cough (with hydrocodone in some syrups); eye drops")
D("hyoscyamine", "Hyoscyamine", ["gi_antispasmodic"], ["levsin", "levbid", "anaspaz", "levsin sl", "symax", "oscimin"], use="Stomach and bladder cramps; irritable bowel")
D("propantheline", "Propantheline", ["gi_antispasmodic"], ["pro-banthine"], use="Stomach ulcers and cramps (rarely used now)")
D("scopolamine", "Scopolamine", ["gi_antispasmodic"], ["transderm scop"], use="Motion sickness and nausea (skin patch)")
D("alverine", "Alverine", ["gi_antispasmodic"], use="Irritable bowel cramps (not marketed in the US)")
D("metoclopramide", "Metoclopramide", ["dopamine_antagonist_antiemetic"], ["reglan", "gimoti"], fx=["drowsiness", "energy"], use="Slow stomach emptying (gastroparesis), reflux and nausea")
D("prochlorperazine", "Prochlorperazine", ["dopamine_antagonist_antiemetic"], ["compro", "compazine"], fx=["drowsiness", "dizziness"], use="Severe nausea and vomiting; dizziness")
D("ondansetron", "Ondansetron", ["serotonin_antagonist_antiemetic"], ["zofran", "zofran odt"], fx=["energy"], use="Nausea and vomiting")

# ---------------------------------------------------------------- RAS inhibitors
D("benazepril", "Benazepril", ["acei"], ["lotensin"], use="High blood pressure")
D("captopril", "Captopril", ["acei"], ["capoten"], use="High blood pressure and heart failure")
D("enalapril", "Enalapril", ["acei"], ["vasotec", "epaned"], use="High blood pressure and heart failure")
D("fosinopril", "Fosinopril", ["acei"], use="High blood pressure and heart failure")
D("lisinopril", "Lisinopril", ["acei"], ["zestril", "prinivil", "qbrelis"], use="High blood pressure, heart failure, and protection after a heart attack")
D("moexipril", "Moexipril", ["acei"], use="High blood pressure")
D("perindopril", "Perindopril", ["acei"], use="High blood pressure; heart disease")
D("quinapril", "Quinapril", ["acei"], ["accupril"], use="High blood pressure and heart failure")
D("ramipril", "Ramipril", ["acei"], ["altace"], use="High blood pressure; lowering heart attack and stroke risk")
D("trandolapril", "Trandolapril", ["acei"], ["mavik"], use="High blood pressure; after a heart attack")
D("azilsartan", "Azilsartan", ["arb"], ["edarbi"], use="High blood pressure")
D("candesartan", "Candesartan", ["arb"], ["atacand"], use="High blood pressure and heart failure")
D("irbesartan", "Irbesartan", ["arb"], ["avapro"], use="High blood pressure; kidney protection in diabetes")
D("losartan", "Losartan", ["arb"], ["cozaar"], use="High blood pressure; kidney protection in diabetes")
D("olmesartan", "Olmesartan", ["arb"], ["benicar"], use="High blood pressure")
D("telmisartan", "Telmisartan", ["arb"], ["micardis"], use="High blood pressure")
D("valsartan", "Valsartan", ["arb"], ["diovan"], use="High blood pressure and heart failure")
D("sacubitril", "Sacubitril", ["arni"], use="Heart failure (only available with valsartan, as Entresto)")
D("aliskiren", "Aliskiren", ["direct_renin_inhibitor"], ["tekturna"], use="High blood pressure")

# ---------------------------------------------------------------- calcium channel blockers, vasodilators, beta-blockers
D("amlodipine", "Amlodipine", ["ccb_dihydropyridine"], ["norvasc", "katerzia", "norliqva"], fx=["energy"], use="High blood pressure and chest pain (angina)")
D("felodipine", "Felodipine", ["ccb_dihydropyridine"], ["plendil"], use="High blood pressure")
D("nicardipine", "Nicardipine", ["ccb_dihydropyridine"], ["cardene"], use="High blood pressure and angina")
D("nifedipine", "Nifedipine", ["ccb_dihydropyridine"], ["procardia", "procardia xl", "adalat cc"], use="High blood pressure and angina")
D("diltiazem", "Diltiazem", ["ccb_nondihydropyridine"], ["cardizem", "cardizem cd", "cardizem la", "tiazac", "cartia xt", "taztia xt", "matzim la"], fx=["swelling", "energy"], use="High blood pressure, angina and fast heart rhythms (atrial fibrillation)")
D("verapamil", "Verapamil", ["ccb_nondihydropyridine"], ["calan", "calan sr", "verelan", "verelan pm"], fx=["swelling"], use="High blood pressure, angina and fast heart rhythms")
D("hydralazine", "Hydralazine", ["vasodilator"], ["apresoline"], fx=["swelling", "dizziness"], use="High blood pressure; heart failure (with isosorbide dinitrate)")
D("minoxidil", "Minoxidil (tablets)", ["vasodilator"], ["loniten"], fx=["swelling"], use="Severe high blood pressure (tablets; the hair-loss foam is a different product)")
D("atenolol", "Atenolol", ["beta_blocker"], ["tenormin"], use="High blood pressure and angina")
D("bisoprolol", "Bisoprolol", ["beta_blocker"], ["zebeta"], use="High blood pressure and heart failure")
D("carvedilol", "Carvedilol", ["beta_blocker"], ["coreg", "coreg cr"], use="Heart failure and high blood pressure")
D("labetalol", "Labetalol", ["beta_blocker"], ["trandate"], use="High blood pressure")
D("metoprolol", "Metoprolol", ["beta_blocker"], ["lopressor", "toprol xl", "toprol", "kapspargo sprinkle"], fx=["sleep"], use="High blood pressure, angina, heart failure and fast heart rhythms")
D("nadolol", "Nadolol", ["beta_blocker"], ["corgard"], use="High blood pressure and angina")
D("nebivolol", "Nebivolol", ["beta_blocker"], ["bystolic"], use="High blood pressure")
D("propranolol", "Propranolol", ["beta_blocker"], ["inderal la", "inderal xl", "innopran xl", "hemangeol"], fx=["sleep"], use="High blood pressure, tremor, migraine prevention and fast heart rhythms")
D("sotalol", "Sotalol", ["beta_blocker", "antiarrhythmic"], ["betapace", "betapace af", "sotylize"], use="Irregular heart rhythms")

# ---------------------------------------------------------------- diuretics
D("bumetanide", "Bumetanide", ["loop_diuretic"], ["bumex"], use="Fluid build-up (edema) from heart, kidney or liver disease")
D("ethacrynic acid", "Ethacrynic acid", ["loop_diuretic"], ["edecrin"], use="Fluid build-up (edema)")
D("furosemide", "Furosemide", ["loop_diuretic"], ["lasix", "furoscix"], use="Fluid build-up (edema) and swelling; high blood pressure")
D("torsemide", "Torsemide", ["loop_diuretic"], ["soaanz", "demadex"], use="Fluid build-up (edema) and high blood pressure")
D("chlorothiazide", "Chlorothiazide", ["thiazide_diuretic"], ["diuril"], use="High blood pressure and fluid build-up")
D("chlorthalidone", "Chlorthalidone", ["thiazide_diuretic"], ["thalitone", "hygroton"], use="High blood pressure and fluid build-up")
D("hydrochlorothiazide", "Hydrochlorothiazide", ["thiazide_diuretic"], ["microzide"], aliases=["hctz"], use="High blood pressure and fluid build-up")
D("indapamide", "Indapamide", ["thiazide_diuretic"], use="High blood pressure and fluid build-up")
D("metolazone", "Metolazone", ["thiazide_diuretic"], ["zaroxolyn"], use="Fluid build-up in heart failure or kidney disease")
D("amiloride", "Amiloride", ["potassium_sparing_diuretic"], use="High blood pressure or heart failure, usually with another diuretic to keep potassium up")
D("triamterene", "Triamterene", ["potassium_sparing_diuretic"], ["dyrenium"], use="Fluid build-up; often combined with hydrochlorothiazide (Maxzide, Dyazide)")
D("eplerenone", "Eplerenone", ["mineralocorticoid_antagonist"], ["inspra"], use="Heart failure and high blood pressure")
D("spironolactone", "Spironolactone", ["mineralocorticoid_antagonist"], ["aldactone", "carospir"], use="Heart failure, high blood pressure and fluid build-up")

# ---------------------------------------------------------------- alpha blockers, central agents, nitrates, antiarrhythmics
D("doxazosin", "Doxazosin", ["alpha1_blocker_nonselective"], ["cardura", "cardura xl"], use="Enlarged prostate symptoms; high blood pressure")
D("prazosin", "Prazosin", ["alpha1_blocker_nonselective"], ["minipress"], use="High blood pressure; sometimes nightmares with PTSD")
D("terazosin", "Terazosin", ["alpha1_blocker_nonselective"], ["hytrin", "tezruly"], use="Enlarged prostate symptoms; high blood pressure")
D("alfuzosin", "Alfuzosin", ["alpha1_blocker_selective"], ["uroxatral"], use="Enlarged prostate symptoms")
D("silodosin", "Silodosin", ["alpha1_blocker_selective"], ["rapaflo"], use="Enlarged prostate symptoms")
D("tamsulosin", "Tamsulosin", ["alpha1_blocker_selective"], ["flomax"], use="Enlarged prostate symptoms")
D("clonidine", "Clonidine", ["central_alpha_agonist"], ["catapres", "catapres-tts", "kapvay", "onyda xr"], use="High blood pressure; also hot flashes, ADHD and withdrawal symptoms")
D("guanfacine", "Guanfacine", ["central_alpha_agonist"], ["intuniv", "tenex"], use="High blood pressure; ADHD")
D("methyldopa", "Methyldopa", ["central_alpha_agonist"], use="High blood pressure")
D("isosorbide mononitrate", "Isosorbide mononitrate", ["nitrate"], ["monoket", "imdur"], aliases=["ismn"], use="Preventing chest pain (angina)")
D("isosorbide dinitrate", "Isosorbide dinitrate", ["nitrate"], ["isordil", "isordil titradose"], use="Preventing chest pain (angina); heart failure (with hydralazine)")
D("nitroglycerin", "Nitroglycerin", ["nitrate"], ["nitrostat", "nitrolingual", "nitromist", "nitro-dur", "minitran"], use="Chest pain (angina): treating or preventing attacks")
D("amiodarone", "Amiodarone", ["antiarrhythmic"], ["pacerone", "nexterone", "cordarone"], fx=["energy", "dizziness"], use="Irregular heart rhythms (atrial fibrillation, ventricular arrhythmias)")
D("dronedarone", "Dronedarone", ["antiarrhythmic"], ["multaq"], fx=["energy"], use="Atrial fibrillation")
D("dofetilide", "Dofetilide", ["antiarrhythmic"], ["tikosyn"], use="Atrial fibrillation")
D("flecainide", "Flecainide", ["antiarrhythmic"], use="Irregular heart rhythms")
D("disopyramide", "Disopyramide", ["antiarrhythmic"], ["norpace", "norpace cr"], use="Irregular heart rhythms")
D("quinidine", "Quinidine", ["antiarrhythmic"], use="Irregular heart rhythms; with dextromethorphan (Nuedexta) for sudden laughing or crying")
D("digoxin", "Digoxin", ["cardiac_glycoside"], ["lanoxin", "digitek", "digox"], fx=["dizziness", "confusion", "appetiteWorse"], use="Heart failure and atrial fibrillation (heart-rate control)")

# ---------------------------------------------------------------- lipids
D("atorvastatin", "Atorvastatin", ["statin"], ["lipitor"], use="High cholesterol; lowering heart attack and stroke risk")
D("lovastatin", "Lovastatin", ["statin"], ["altoprev"], use="High cholesterol")
D("pitavastatin", "Pitavastatin", ["statin"], ["livalo", "zypitamag"], use="High cholesterol")
D("pravastatin", "Pravastatin", ["statin"], ["pravachol"], use="High cholesterol")
D("rosuvastatin", "Rosuvastatin", ["statin"], ["crestor", "ezallor"], use="High cholesterol")
D("simvastatin", "Simvastatin", ["statin"], ["zocor", "flolipid"], use="High cholesterol")
D("ezetimibe", "Ezetimibe", ["lipid_lowering_other"], ["zetia"], use="High cholesterol")
D("fenofibrate", "Fenofibrate", ["lipid_lowering_other"], ["tricor", "fenoglide", "triglide", "lipofen"], use="High triglycerides and cholesterol")
D("omega-3 fatty acids", "Omega-3 fatty acids (fish oil)", ["lipid_lowering_other"], ["lovaza"], aliases=["fish oil", "omega 3", "omega-3"], otc=True, use="High triglycerides; dietary supplement")

# ---------------------------------------------------------------- anticoagulants, antiplatelets
D("apixaban", "Apixaban", ["doac"], ["eliquis"], use="Preventing stroke in atrial fibrillation; treating or preventing blood clots")
D("dabigatran", "Dabigatran", ["doac"], ["pradaxa"], use="Preventing stroke in atrial fibrillation; treating or preventing blood clots")
D("edoxaban", "Edoxaban", ["doac"], ["savaysa"], use="Preventing stroke in atrial fibrillation; treating blood clots")
D("rivaroxaban", "Rivaroxaban", ["doac"], ["xarelto"], use="Preventing stroke in atrial fibrillation; treating or preventing blood clots")
D("warfarin", "Warfarin", ["vitamin_k_antagonist"], ["coumadin", "jantoven"], use="Preventing and treating blood clots; stroke prevention in atrial fibrillation")
D("enoxaparin", "Enoxaparin", ["injectable_anticoagulant"], ["lovenox"], use="Preventing and treating blood clots (injection)")
D("fondaparinux", "Fondaparinux", ["injectable_anticoagulant"], ["arixtra"], use="Preventing and treating blood clots (injection)")
D("aspirin", "Aspirin", ["antiplatelet", "salicylate"], ["bayer aspirin", "bayer", "bayer low dose", "ecotrin", "bufferin", "st. joseph aspirin", "durlaza", "vazalore"], aliases=["baby aspirin", "low dose aspirin", "low-dose aspirin", "asa", "acetylsalicylic acid"], otc=True, use="Preventing heart attack and stroke (low dose); pain and fever (higher doses)")
D("clopidogrel", "Clopidogrel", ["p2y12_inhibitor"], ["plavix"], use="Preventing heart attack and stroke, e.g. after a stent")
D("prasugrel", "Prasugrel", ["p2y12_inhibitor"], ["effient"], use="Preventing heart attack and stroke after a stent")
D("ticagrelor", "Ticagrelor", ["p2y12_inhibitor"], ["brilinta"], use="Preventing heart attack and stroke after a heart attack or stent")
D("dipyridamole", "Dipyridamole", ["antiplatelet"], ["persantine"], use="Preventing clots (with aspirin as Aggrenox after a stroke)")
D("cilostazol", "Cilostazol", ["antiplatelet"], ["pletal"], use="Leg pain when walking (intermittent claudication)")

# ---------------------------------------------------------------- other cardiovascular
D("sildenafil", "Sildenafil", ["pde5_inhibitor"], ["viagra", "revatio", "liqrev"], use="Erectile dysfunction; pulmonary hypertension")
D("tadalafil", "Tadalafil", ["pde5_inhibitor"], ["cialis", "adcirca", "alyq", "tadliq"], use="Erectile dysfunction, enlarged prostate symptoms; pulmonary hypertension")
D("potassium chloride", "Potassium chloride", ["electrolyte"], ["klor-con", "k-tab", "micro-k", "k-dur"], aliases=["kcl", "potassium"], use="Low potassium (often with water pills)")

# ---------------------------------------------------------------- diabetes
D("metformin", "Metformin", ["biguanide"], ["glucophage", "glumetza", "fortamet", "riomet"], use="Type 2 diabetes")
D("gliclazide", "Gliclazide", ["sulfonylurea"], use="Type 2 diabetes (not marketed in the US)")
D("glimepiride", "Glimepiride", ["sulfonylurea"], ["amaryl"], use="Type 2 diabetes")
D("glipizide", "Glipizide", ["sulfonylurea"], ["glucotrol", "glucotrol xl"], use="Type 2 diabetes")
D("glyburide", "Glyburide", ["sulfonylurea"], ["diabeta", "glynase", "micronase"], aliases=["glibenclamide"], use="Type 2 diabetes")
D("alogliptin", "Alogliptin", ["dpp4_inhibitor"], ["nesina"], use="Type 2 diabetes")
D("linagliptin", "Linagliptin", ["dpp4_inhibitor"], ["tradjenta"], use="Type 2 diabetes")
D("saxagliptin", "Saxagliptin", ["dpp4_inhibitor"], ["onglyza"], use="Type 2 diabetes")
D("sitagliptin", "Sitagliptin", ["dpp4_inhibitor"], ["januvia", "zituvio"], use="Type 2 diabetes")
D("canagliflozin", "Canagliflozin", ["sglt2_inhibitor"], ["invokana"], use="Type 2 diabetes; heart and kidney protection")
D("dapagliflozin", "Dapagliflozin", ["sglt2_inhibitor"], ["farxiga"], use="Type 2 diabetes, heart failure and chronic kidney disease")
D("empagliflozin", "Empagliflozin", ["sglt2_inhibitor"], ["jardiance"], use="Type 2 diabetes, heart failure and chronic kidney disease")
D("ertugliflozin", "Ertugliflozin", ["sglt2_inhibitor"], ["steglatro"], use="Type 2 diabetes")
D("dulaglutide", "Dulaglutide", ["glp1_agonist"], ["trulicity"], use="Type 2 diabetes (weekly injection)")
D("liraglutide", "Liraglutide", ["glp1_agonist"], ["victoza", "saxenda"], use="Type 2 diabetes; weight management")
D("semaglutide", "Semaglutide", ["glp1_agonist"], ["ozempic", "rybelsus", "wegovy"], fx=["energy"], use="Type 2 diabetes; weight management")
D("tirzepatide", "Tirzepatide", ["glp1_agonist"], ["mounjaro", "zepbound"], use="Type 2 diabetes; weight management")
D("pioglitazone", "Pioglitazone", ["thiazolidinedione"], ["actos"], use="Type 2 diabetes")
D("insulin glargine", "Insulin glargine", ["insulin_basal"], ["lantus", "basaglar", "toujeo", "semglee", "rezvoglar"], use="Diabetes (long-acting, once-daily insulin)")
D("insulin detemir", "Insulin detemir", ["insulin_basal"], ["levemir"], use="Diabetes (long-acting insulin)")
D("insulin degludec", "Insulin degludec", ["insulin_basal"], ["tresiba"], use="Diabetes (long-acting insulin)")
D("insulin nph", "Insulin NPH (isophane)", ["insulin_basal"], ["humulin n", "novolin n"], aliases=["nph insulin", "insulin isophane", "nph"], otc=True, use="Diabetes (intermediate-acting insulin)")
D("insulin lispro", "Insulin lispro", ["insulin_rapid"], ["humalog", "admelog", "lyumjev"], use="Diabetes (rapid-acting, mealtime insulin)")
D("insulin aspart", "Insulin aspart", ["insulin_rapid"], ["novolog", "fiasp"], use="Diabetes (rapid-acting, mealtime insulin)")
D("insulin glulisine", "Insulin glulisine", ["insulin_rapid"], ["apidra"], use="Diabetes (rapid-acting, mealtime insulin)")
D("insulin regular", "Insulin regular (human)", ["insulin_rapid"], ["humulin r", "novolin r"], aliases=["regular insulin"], otc=True, use="Diabetes (short-acting insulin)")

# ---------------------------------------------------------------- GI
D("dexlansoprazole", "Dexlansoprazole", ["ppi"], ["dexilant"], use="Heartburn, acid reflux (GERD) and esophagus healing")
D("esomeprazole", "Esomeprazole", ["ppi"], ["nexium", "nexium 24hr"], otc=True, use="Heartburn, acid reflux (GERD) and stomach ulcers")
D("lansoprazole", "Lansoprazole", ["ppi"], ["prevacid", "prevacid 24hr", "prevacid solutab"], otc=True, use="Heartburn, acid reflux (GERD) and stomach ulcers")
D("omeprazole", "Omeprazole", ["ppi"], ["prilosec", "prilosec otc"], otc=True, use="Heartburn, acid reflux (GERD) and stomach ulcers")
D("pantoprazole", "Pantoprazole", ["ppi"], ["protonix"], use="Acid reflux (GERD) and esophagus healing")
D("rabeprazole", "Rabeprazole", ["ppi"], ["aciphex"], use="Acid reflux (GERD) and stomach ulcers")
D("cimetidine", "Cimetidine", ["h2ra"], ["tagamet", "tagamet hb"], otc=True, fx=["confusion"], use="Heartburn and stomach ulcers")
D("famotidine", "Famotidine", ["h2ra"], ["pepcid", "pepcid ac", "zantac 360"], otc=True, fx=["confusion"], use="Heartburn, acid reflux and stomach ulcers")
D("nizatidine", "Nizatidine", ["h2ra"], ["axid"], use="Heartburn and stomach ulcers")
D("ranitidine", "Ranitidine", ["h2ra"], ["zantac"], fx=["confusion"], use="Heartburn and stomach ulcers (withdrawn from the US market in 2020; 'Zantac 360' is now famotidine)")
D("sucralfate", "Sucralfate", ["gi_protectant"], ["carafate"], use="Stomach and duodenal ulcers")
D("misoprostol", "Misoprostol", ["gi_protectant"], ["cytotec"], use="Protecting the stomach from NSAID ulcers")
D("bisacodyl", "Bisacodyl", ["laxative"], ["dulcolax"], otc=True, use="Constipation")
D("docusate", "Docusate", ["laxative"], ["colace", "surfak"], aliases=["stool softener"], otc=True, use="Constipation (stool softener)")
D("lactulose", "Lactulose", ["laxative"], ["kristalose", "enulose"], use="Constipation; liver disease")
D("magnesium hydroxide", "Magnesium hydroxide", ["laxative"], ["phillips milk of magnesia"], aliases=["milk of magnesia"], otc=True, use="Constipation; heartburn")
D("mineral oil", "Mineral oil", ["laxative"], aliases=["liquid paraffin"], otc=True, use="Constipation (taken by mouth or as an enema)")
D("polyethylene glycol 3350", "Polyethylene glycol 3350", ["laxative"], ["miralax", "glycolax", "gavilax"], aliases=["peg 3350", "polyethylene glycol"], otc=True, use="Constipation")
D("psyllium", "Psyllium", ["laxative"], ["metamucil", "konsyl"], aliases=["fiber supplement"], otc=True, use="Constipation; fiber supplement")
D("sennosides", "Senna (sennosides)", ["laxative"], ["senokot", "ex-lax"], aliases=["senna"], otc=True, use="Constipation")
D("loperamide", "Loperamide", ["antidiarrheal"], ["imodium", "imodium a-d"], otc=True, fx=["drowsiness"], use="Diarrhea")
D("diphenoxylate", "Diphenoxylate", ["antidiarrheal"], use="Diarrhea (with atropine as Lomotil)")
D("bismuth subsalicylate", "Bismuth subsalicylate", ["antidiarrheal", "salicylate"], ["pepto-bismol", "kaopectate"], otc=True, use="Upset stomach, heartburn and diarrhea")

# ---------------------------------------------------------------- pain, NSAIDs, gout
D("acetaminophen", "Acetaminophen", ["analgesic_nonopioid"], ["tylenol", "tylenol extra strength", "tylenol 8 hr arthritis pain", "mapap", "ofirmev"], aliases=["paracetamol", "apap"], otc=True, use="Pain and fever")
D("celecoxib", "Celecoxib", ["cox2_inhibitor"], ["celebrex", "elyxyb"], use="Arthritis pain and other pain")
D("diclofenac", "Diclofenac", ["nsaid_nonselective"], ["cataflam", "zipsor", "zorvolex", "cambia", "lofena", "voltaren-xr"], use="Arthritis and other pain (tablets and capsules; the skin gel is a separate entry)")
D("diclofenac topical", "Diclofenac gel, solution or patch (on the skin)", ["nsaid_topical"],
  ["voltaren", "voltaren gel", "voltaren arthritis pain", "voltaren arthritis pain gel", "pennsaid", "flector", "flector patch", "solaraze"], otc=True,
  use="Joint pain from arthritis and sprains (applied to the skin)",
  variant=V("diclofenac", words=["gel", "cream", "topical", "patch", "lotion", "on the skin", "1%", "1.3%", "1.5%", "2%", "3%"], base_words=ORAL_WORDS))
D("diflunisal", "Diflunisal", ["nsaid_nonselective", "nonacetylated_salicylate"], use="Arthritis and other pain")
D("etodolac", "Etodolac", ["nsaid_nonselective"], ["lodine"], use="Arthritis pain")
D("flurbiprofen", "Flurbiprofen", ["nsaid_nonselective"], use="Arthritis pain")
D("ibuprofen", "Ibuprofen", ["nsaid_nonselective"], ["advil", "motrin", "motrin ib"], otc=True, use="Pain, fever and inflammation")
D("indomethacin", "Indomethacin", ["nsaid_nonselective"], ["indocin", "tivorbex"], use="Gout flares and arthritis pain")
D("ketorolac", "Ketorolac", ["nsaid_nonselective"], ["toradol", "sprix"], use="Short-term moderate to severe pain")
D("ketorolac ophthalmic", "Ketorolac eye drops", ["ophthalmic_other"], ["acular", "acular ls", "acuvail"],
  use="Eye pain and inflammation after eye surgery; itchy eyes from allergies",
  variant=V("ketorolac", words=EYE_WORDS, base_words=["tab", "tabs", "tablet", "tablets", "injection", "nasal", "#mg"]))
D("meloxicam", "Meloxicam", ["nsaid_nonselective"], ["mobic", "vivlodex", "qmiiz odt", "anjeso"], use="Arthritis pain")
D("nabumetone", "Nabumetone", ["nsaid_nonselective"], ["relafen"], use="Arthritis pain")
D("naproxen", "Naproxen", ["nsaid_nonselective"], ["aleve", "naprosyn", "anaprox ds", "naprelan", "ec-naprosyn"], otc=True, fx=["drowsiness"], use="Pain, arthritis and inflammation")
D("oxaprozin", "Oxaprozin", ["nsaid_nonselective"], ["daypro"], use="Arthritis pain")
D("piroxicam", "Piroxicam", ["nsaid_nonselective"], ["feldene"], use="Arthritis pain")
D("sulindac", "Sulindac", ["nsaid_nonselective"], ["clinoril"], use="Arthritis pain")
D("magnesium salicylate", "Magnesium salicylate", ["nonacetylated_salicylate"], ["doan's"], otc=True, use="Back pain (OTC)")
D("salsalate", "Salsalate", ["nonacetylated_salicylate"], use="Arthritis pain")
D("allopurinol", "Allopurinol", ["antigout"], ["zyloprim", "aloprim"], use="Gout prevention (lowers uric acid)")
D("colchicine", "Colchicine", ["antigout"], ["colcrys", "mitigare", "gloperba", "lodoco"], use="Gout flares and prevention")
D("febuxostat", "Febuxostat", ["antigout"], ["uloric"], use="Gout prevention (lowers uric acid)")
D("probenecid", "Probenecid", ["antigout"], use="Gout prevention (helps the kidneys remove uric acid)")
D("methotrexate", "Methotrexate", ["dmard"], ["trexall", "otrexup", "rasuvo", "xatmep", "jylamvo"], use="Rheumatoid arthritis and psoriasis (weekly dose)")
D("hydroxychloroquine", "Hydroxychloroquine", ["dmard"], ["plaquenil", "sovuna"], use="Rheumatoid arthritis and lupus")

# ---------------------------------------------------------------- respiratory, allergy, cold
D("albuterol", "Albuterol", ["bronchodilator"], ["proair hfa", "proair respiclick", "ventolin hfa", "proventil hfa", "proair", "ventolin", "proventil", "proair digihaler"], aliases=["salbutamol"], use="Asthma and COPD (rescue inhaler)")
D("formoterol", "Formoterol", ["bronchodilator"], ["perforomist"], use="COPD (long-acting inhaled bronchodilator)")
D("salmeterol", "Salmeterol", ["bronchodilator"], ["serevent"], use="Asthma and COPD (long-acting inhaled bronchodilator)")
D("ipratropium", "Ipratropium", ["inhaled_antimuscarinic"], ["atrovent", "atrovent hfa"], use="COPD (inhaled); runny nose (nasal spray)")
D("tiotropium", "Tiotropium", ["inhaled_antimuscarinic"], ["spiriva", "spiriva respimat", "spiriva handihaler"], use="COPD and asthma (long-acting inhaler)")
D("umeclidinium", "Umeclidinium", ["inhaled_antimuscarinic"], ["incruse ellipta"], use="COPD (long-acting inhaler)")
D("budesonide", "Budesonide", ["inhaled_or_nasal_corticosteroid"], ["pulmicort", "pulmicort flexhaler", "rhinocort"], use="Asthma (inhaled); nasal allergies (spray)")
D("fluticasone", "Fluticasone", ["inhaled_or_nasal_corticosteroid"], ["flonase", "flovent hfa", "flovent diskus", "arnuity ellipta", "armonair"], otc=True, use="Nasal allergies (spray); asthma (inhaler)")
D("montelukast", "Montelukast", ["leukotriene_antagonist"], ["singulair"], fx=["sleep"], use="Asthma and allergies")
D("theophylline", "Theophylline", ["methylxanthine"], ["theo-24", "elixophyllin", "uniphyl", "theochron"], fx=["sleep"], use="Asthma and COPD (older medicine)")
D("benzonatate", "Benzonatate", ["cough_cold"], ["tessalon", "tessalon perles"], fx=["drowsiness", "dizziness"], use="Cough")
D("dextromethorphan", "Dextromethorphan", ["cough_cold"], ["delsym", "robafen cough"], otc=True, use="Cough (in many OTC cough and cold products)")
D("guaifenesin", "Guaifenesin", ["cough_cold"], ["mucinex", "robitussin chest congestion"], otc=True, use="Chest congestion (loosens mucus)")
D("phenylephrine", "Phenylephrine", ["decongestant"], ["sudafed pe"], otc=True, fx=["sleep", "dizziness"], use="Nasal congestion (in many cold products)")
D("pseudoephedrine", "Pseudoephedrine", ["decongestant"], ["sudafed", "sudafed 12 hour"], otc=True, fx=["sleep", "dizziness"], use="Nasal congestion")

# ---------------------------------------------------------------- anti-infectives
D("amoxicillin", "Amoxicillin", ["antibiotic"], ["amoxil"], use="Bacterial infections")
D("clavulanate", "Clavulanate", ["antibiotic"], aliases=["clavulanic acid"], use="Added to amoxicillin (Augmentin) so it works against more bacteria")
D("azithromycin", "Azithromycin", ["macrolide"], ["zithromax", "z-pak", "zmax"], use="Bacterial infections")
D("clarithromycin", "Clarithromycin", ["macrolide"], ["biaxin"], use="Bacterial infections; stomach ulcer (Helicobacter pylori) treatment")
D("erythromycin", "Erythromycin", ["macrolide"], ["ery-tab", "erythrocin", "eryped"], use="Bacterial infections")
D("cephalexin", "Cephalexin", ["antibiotic"], ["keflex"], use="Bacterial infections")
D("ciprofloxacin", "Ciprofloxacin", ["fluoroquinolone"], ["cipro"], use="Bacterial infections (including urinary infections)")
D("levofloxacin", "Levofloxacin", ["fluoroquinolone"], ["levaquin"], use="Bacterial infections (including pneumonia)")
D("doxycycline", "Doxycycline", ["antibiotic"], ["vibramycin", "doryx", "acticlate", "oracea"], use="Bacterial infections; rosacea")
D("metronidazole", "Metronidazole", ["antibiotic"], ["flagyl"], use="Bacterial and parasite infections")
D("nitrofurantoin", "Nitrofurantoin", ["antibiotic"], ["macrobid", "macrodantin", "furadantin"], fx=["appetiteWorse", "dizziness", "drowsiness"], use="Urinary tract infections (treatment or prevention)")
D("sulfamethoxazole", "Sulfamethoxazole", ["antibiotic"], fx=["appetiteWorse"], use="Bacterial infections (with trimethoprim as Bactrim)")
D("trimethoprim", "Trimethoprim", ["antibiotic"], ["primsol"], use="Urinary tract infections; with sulfamethoxazole as Bactrim")
D("fluconazole", "Fluconazole", ["antifungal"], ["diflucan"], use="Yeast and fungal infections")

# ---------------------------------------------------------------- urology
D("finasteride", "Finasteride", ["five_alpha_reductase_inhibitor"], ["proscar", "propecia"], use="Enlarged prostate; hair loss")
D("dutasteride", "Dutasteride", ["five_alpha_reductase_inhibitor"], ["avodart"], use="Enlarged prostate")
D("desmopressin", "Desmopressin", ["vasopressin_analog"], ["ddavp", "nocdurna", "noctiva"], use="Night-time urination (nocturia); diabetes insipidus; bedwetting")

# ---------------------------------------------------------------- bone, vitamins, minerals
D("alendronate", "Alendronate", ["bisphosphonate"], ["fosamax", "binosto"], use="Osteoporosis")
D("ibandronate", "Ibandronate", ["bisphosphonate"], ["boniva"], use="Osteoporosis")
D("risedronate", "Risedronate", ["bisphosphonate"], ["actonel", "atelvia"], use="Osteoporosis")
D("raloxifene", "Raloxifene", ["serm"], ["evista"], use="Osteoporosis; lowering breast cancer risk")
D("calcium carbonate", "Calcium carbonate", ["vitamin_mineral"], ["tums", "os-cal", "caltrate", "viactiv"], aliases=["calcium", "calcium supplement"], otc=True, use="Calcium supplement; heartburn (antacid)")
D("calcium citrate", "Calcium citrate", ["vitamin_mineral"], ["citracal"], otc=True, use="Calcium supplement")
D("cholecalciferol", "Vitamin D3 (cholecalciferol)", ["vitamin_mineral"], aliases=["vitamin d", "vitamin d3", "vit d", "vit d3"], otc=True, use="Vitamin D supplement (bone health)")
D("ergocalciferol", "Vitamin D2 (ergocalciferol)", ["vitamin_mineral"], ["drisdol"], aliases=["vitamin d2"], use="Vitamin D deficiency")
D("cyanocobalamin", "Vitamin B12 (cyanocobalamin)", ["vitamin_mineral"], ["nascobal"], aliases=["vitamin b12", "b12", "vit b12", "vitamin b-12", "b-12", "vit b-12", "vitamin b 12"], otc=True, use="Vitamin B12 deficiency")
D("ferrous sulfate", "Ferrous sulfate (iron)", ["vitamin_mineral"], ["feosol", "slow fe", "fer-in-sol"], aliases=["iron", "iron supplement", "iron pill"], otc=True, use="Iron-deficiency anemia")
D("magnesium oxide", "Magnesium oxide", ["vitamin_mineral"], ["mag-ox"], otc=True, use="Low magnesium; heartburn; constipation")

# ---------------------------------------------------------------- hormones
D("levothyroxine", "Levothyroxine", ["thyroid_hormone"], ["synthroid", "levoxyl", "unithroid", "euthyrox", "tirosint", "levo-t"], fx=["sleep"], use="Underactive thyroid (hypothyroidism)")
D("desiccated thyroid", "Desiccated thyroid", ["thyroid_hormone"], ["armour thyroid", "np thyroid", "nature-throid", "adthyza"], aliases=["thyroid tablets", "porcine thyroid"], fx=["sleep"], use="Underactive thyroid (made from animal thyroid glands)")
D("conjugated estrogens", "Conjugated estrogens", ["estrogen"], ["premarin"], use="Menopause symptoms")
D("conjugated estrogens vaginal", "Conjugated estrogens vaginal cream", ["estrogen_vaginal"], ["premarin vaginal cream", "premarin vaginal", "premarin cream"],
  use="Vaginal dryness and irritation after menopause (low-dose cream used in the vagina)",
  variant=V("conjugated estrogens", words=["vaginal", "vaginally", "vag", "intravaginal", "cream", "pv"]))
D("esterified estrogens", "Esterified estrogens", ["estrogen"], ["menest"], use="Menopause symptoms")
D("estradiol", "Estradiol", ["estrogen"], ["estrace", "vivelle-dot", "climara", "minivelle", "divigel", "evamist", "dotti", "lyllana"], use="Menopause symptoms (pills, patches, gels and sprays; low-dose vaginal forms are a separate entry)")
D("estradiol vaginal", "Estradiol, low-dose vaginal (cream, tablet, insert or ring)", ["estrogen_vaginal"],
  ["vagifem", "yuvafem", "estring", "imvexxy", "estrace cream", "estrace vaginal cream"],
  use="Vaginal dryness, painful intercourse and repeat bladder infections after menopause (used in the vagina)",
  variant=V("estradiol", words=["vaginal", "vaginally", "vag", "intravaginal", "cream", "insert", "inserts", "ring", "pv"]))
D("estropipate", "Estropipate", ["estrogen"], use="Menopause symptoms")
D("methyltestosterone", "Methyltestosterone", ["androgen"], ["methitest", "android"], use="Low testosterone")
D("testosterone", "Testosterone", ["androgen"], ["androgel", "testim", "depo-testosterone", "xyosted", "jatenzo", "tlando", "kyzatrex", "aveed", "natesto", "vogelxo"], fx=["swelling"], use="Low testosterone (hypogonadism)")
D("megestrol", "Megestrol", ["progestin"], ["megace", "megace es"], fx=["swelling"], use="Poor appetite and weight loss; some cancers")
D("somatropin", "Somatropin (growth hormone)", ["growth_hormone"], ["genotropin", "humatrope", "norditropin", "omnitrope", "nutropin aq", "saizen", "zomacton"], aliases=["growth hormone"], fx=["swelling"], use="Growth hormone deficiency")
D("prednisone", "Prednisone", ["corticosteroid_systemic"], ["rayos", "deltasone"], use="Inflammation: flares of arthritis, asthma, COPD and many other conditions")
D("prednisolone", "Prednisolone", ["corticosteroid_systemic"], ["orapred", "millipred", "pediapred"], use="Inflammation: asthma, arthritis and other conditions")
D("prednisolone ophthalmic", "Prednisolone eye drops", ["ophthalmic_other"], ["pred forte", "pred mild", "omnipred"],
  use="Eye inflammation, including after eye surgery",
  variant=V("prednisolone", words=EYE_WORDS))
D("methylprednisolone", "Methylprednisolone", ["corticosteroid_systemic"], ["medrol", "solu-medrol", "depo-medrol"], use="Inflammation (including short 'dose packs')")
D("dexamethasone", "Dexamethasone", ["corticosteroid_systemic"], ["decadron", "hemady", "dexpak"], use="Inflammation, swelling and some cancers")
D("dexamethasone ophthalmic", "Dexamethasone eye drops", ["ophthalmic_other"], ["maxidex"],
  use="Eye inflammation, including after eye surgery",
  variant=V("dexamethasone", words=EYE_WORDS))
D("hydrocortisone", "Hydrocortisone (tablets)", ["corticosteroid_systemic"], ["cortef", "alkindi sprinkle"], use="Adrenal insufficiency (tablets); creams are a different product")
D("hydrocortisone topical", "Hydrocortisone cream or ointment (on the skin)", ["corticosteroid_topical"],
  ["cortaid", "cortizone-10", "cortizone 10", "cortizone", "preparation h hydrocortisone"], otc=True,
  use="Itching, rashes and eczema (applied to the skin)",
  variant=V("hydrocortisone", words=SKIN_WORDS + ["1%", "2.5%", "0.5%", "itch"], base_words=ORAL_WORDS))
D("norethindrone", "Norethindrone", ["progestin"], ["aygestin"], use="Hormone therapy (with estrogen) and other gynecologic uses")
D("medroxyprogesterone", "Medroxyprogesterone", ["progestin"], ["provera", "depo-provera", "depo-subq provera 104"], use="Hormone therapy (with estrogen) and other gynecologic uses")
