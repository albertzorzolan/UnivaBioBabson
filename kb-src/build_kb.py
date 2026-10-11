#!/usr/bin/env python3
"""Compile the Kinwise clinical knowledge base (src/kb/data/*.json) from the verified research in kb-src/.

    python3 -I kb-src/build_kb.py            # from the repo root: writes src/kb/data/*.json + kb-src/build-report.json
    python3 -I kb-src/build_kb.py --check    # build in memory and validate only (exit 1 on any problem)
    python3 -I kb-src/build_kb.py --needs    # print the RxNorm lookups still missing (input for kb/rx_extra.py)

Inputs (all in kb-src/):
  kb/classes_src.py, kb/drugs_src.py, kb/drugs_extra_src.py, kb/combos_src.py   hand-curated taxonomy, drugs, combos
  kb/rules_src.py                     Beers rules, cascades, FRIDs, monitoring, sources (Kinwise wording)
  kb/brand_report.json                brand -> ingredient verification (RxNorm / DailyMed) from the earlier KB run
  kb/rx_cache_known.json, kb/rx_missing.json, kb/rx_extra_cache.json   RxNorm ingredient RxCUIs
  research/beers-2023.json            AGS Beers 2023 (ratings, Table 7 list) - cross-check source
  research/acb-scale.json             ACB 2012 card scores
  research/symptom-adr-map.json       label evidence behind EFFECTS_BY_CLASS (documented, not parsed)
The build is deterministic: same inputs, byte-identical output.
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
KBS = os.path.join(HERE, "kb")
RES = os.path.join(HERE, "research")
OUT = os.path.join(ROOT, "src", "kb", "data")
VERSION = "2026.10.2"

METRICS = {"dizziness", "drowsiness", "confusion", "fall", "nearFall", "swelling", "energy", "sleep", "appetiteWorse"}
CONCEPTS = {"nausea", "constipation", "dry_mouth", "headache", "cough", "blurred_vision", "urinary_problem", "low_mood", "anxiety",
            "pain", "shortness_of_breath", "tremor", "rash", "diarrhea", "palpitations", "bleeding_or_bruising", "black_stools",
            "shakiness_or_sweating"}
CONDITIONS = {"history_of_falls", "dementia_or_cognitive_impairment", "delirium_history", "heart_failure", "chronic_kidney_disease",
              "parkinson_disease", "gi_bleeding_or_ulcer_history", "hypertension", "type2_diabetes", "atrial_fibrillation",
              "urinary_incontinence", "benign_prostatic_hyperplasia", "insomnia", "depression", "anxiety", "osteoarthritis",
              "osteoporosis", "seizure_disorder"}
PLACEHOLDERS = {"med", "person", "name", "condition", "crcl", "threshold", "med1", "med2", "other", "with", "count", "meds", "list",
                "index", "marker", "date", "startDate", "days", "effect", "indexDate", "markerDate"}

# SPEC §3 language rules, applied to every user-facing string the KB ships (citations and URLs excluded).
BANNED = [(re.compile(p, re.I), label) for p, label in [
    (r"\bcaus(e|es|ed|ing)\b", "cause/caused (causal wording)"),
    (r"\bsafe(ly|ty|r|st)?\b", "safe"),
    (r"\bdanger(ous|ously)?\b", "dangerous"),
    (r"\burgent(ly)?\b", "urgent"),
    (r"\bdiagnos(is|e|ed|tic)\b", "diagnosis"),
    (r"\bstop taking\b", "stop taking"),
    (r"\bshould stop\b", "should stop"),
    (r"\brisk score\b", "risk score"),
]]

# Classes added in this build (the earlier taxonomy lives in kb/classes_src.py).
CLASS_ADDITIONS = [
    ("ophthalmic_glaucoma", "Glaucoma eye drops", []),
    ("antianginal_other", "Other chest-pain (angina) medicine", []),
    ("antihypotensive", "Medicine for low blood pressure", []),
    ("mineralocorticoid", "Mineralocorticoid (fludrocortisone)", []),
    ("bone_antiresorptive", "Bone-strengthening injection (denosumab)", []),
    ("phosphate_binder", "Phosphate binder", []),
    ("triptan", "Triptan (migraine medicine)", []),
    ("antiviral", "Antiviral", []),
    ("bile_acid_sequestrant", "Bile acid sequestrant", []),
    ("antithyroid", "Antithyroid medicine", []),
    ("hormonal_cancer_therapy", "Hormonal breast-cancer medicine", []),
    ("local_anesthetic", "Local anesthetic", []),
    ("analgesic_other", "Other pain reliever", []),
    # route-specific entries (Beers 2023 criteria are scoped to oral or systemic use; see V() in kb/drugs_src.py)
    ("nsaid_topical", "NSAID gel, solution or patch used on the skin (not an oral NSAID)", []),
    ("estrogen_vaginal", "Low-dose vaginal estrogen (not systemic estrogen)", []),
    ("ophthalmic_other", "Other eye drops", []),
    ("corticosteroid_topical", "Corticosteroid used on the skin (not a systemic corticosteroid)", []),
    ("antihistamine_topical", "Antihistamine used on the skin (not taken by mouth)", []),
    ("orexin_antagonist", "Orexin receptor antagonist (sleep medicine)", []),
]

# Diary effects by class (transitive), from the label evidence in research/symptom-adr-map.json (FDA SPL via
# openFDA/DailyMed: adverse reactions, warnings, geriatric use). Drug-level additions/removals live in the
# drug sources (fx / nofx). Fall-risk classes (FRIDS) add fall + nearFall.
EFFECTS_BY_CLASS = {
    "benzodiazepine": ["dizziness", "drowsiness", "confusion"],
    "z_drug": ["dizziness", "drowsiness", "confusion"],
    "barbiturate": ["dizziness", "drowsiness", "confusion"],
    "sedative_other": ["dizziness", "drowsiness"],
    "opioid": ["dizziness", "drowsiness", "confusion"],
    "gabapentinoid": ["dizziness", "drowsiness", "swelling", "energy"],
    "antiepileptic": ["dizziness", "drowsiness"],
    "antipsychotic": ["dizziness", "drowsiness"],
    "tca": ["dizziness", "drowsiness", "confusion"],
    "ssri": ["dizziness", "sleep"],
    "snri": ["dizziness", "sleep"],
    "skeletal_muscle_relaxant": ["dizziness", "drowsiness", "energy"],
    "antispasticity_agent": ["dizziness", "drowsiness", "energy"],
    "first_gen_antihistamine": ["dizziness", "drowsiness", "confusion"],
    "strong_anticholinergic": ["confusion"],
    "bladder_antimuscarinic": ["dizziness", "drowsiness", "confusion"],
    "antiparkinson_anticholinergic": ["confusion"],
    "gi_antispasmodic": ["dizziness", "drowsiness", "confusion"],
    "dopaminergic_antiparkinson": ["dizziness", "confusion"],
    "cholinesterase_inhibitor": ["dizziness", "sleep", "appetiteWorse"],
    "bp_lowering": ["dizziness"],
    "ccb_dihydropyridine": ["swelling"],
    "beta_blocker": ["dizziness", "energy"],
    "diuretic": ["dizziness"],
    "alpha1_blocker": ["dizziness"],
    "central_alpha_agonist": ["dizziness", "drowsiness", "energy"],
    "nitrate": ["dizziness"],
    "pde5_inhibitor": ["dizziness"],
    "sulfonylurea": ["dizziness"],
    "glp1_agonist": ["appetiteWorse"],
    "thiazolidinedione": ["swelling"],
    "nsaid": ["swelling"],
    "corticosteroid_systemic": ["sleep", "swelling"],
}

# Ingredient names used by the research files when they differ from KB ids.
RESEARCH_NAME = {
    "divalproex": "valproate",
    "desiccated thyroid": "thyroid (USP)",
    "conjugated estrogens": "estrogens, conjugated (USP)",
    "esterified estrogens": "estrogens, esterified (USP)",
    "insulin regular": "insulin, regular, human",
    "ergoloid mesylates": "ergoloid mesylates, USP",
    "belladonna alkaloids": "belladonna",
    "omega-3 fatty acids": "omega-3 acid ethyl esters",
    "polyethylene glycol 3350": "polyethylene glycol 3350",
    "insulin nph": "insulin isophane",
}
# RxCUIs that must not come from a name lookup: "insulin (type not specified)" is not regular human insulin.
RXCUI_OVERRIDE = {"insulin": None}
# Drugs a Beers rule deliberately names beyond its research row, with the reason (none at present).
BEERS_DRUG_EXTENSIONS: dict = {}
# KB cascade id -> research/cascades.json id (for the list-membership check on ThinkCascades / PIPC citations).
CASCADE_RESEARCH_ID = {
    "tzd-edema-loop-diuretic": "tzd-edema-diuretic",
    "anticholinergic-memory-dementia-medicine": "urinary-anticholinergic-cognition-chei",
    "tca-memory-dementia-medicine": "tca-cognition-chei",
    "diuretic-incontinence-bladder-medicine": "diuretic-incontinence-oab",
    "ssri-insomnia-hypnotic": "ssri-snri-insomnia-sleep-agent",
    "corticosteroid-insomnia-hypnotic": "corticosteroid-insomnia-sleep-agent",
    "chei-insomnia-hypnotic": "chei-insomnia-sleep-agent",
    "benzodiazepine-agitation-antipsychotic": "benzodiazepine-agitation-antipsychotic",
    "dopaminergic-hallucinations-antipsychotic": "dopaminergic-psychosis-antipsychotic",
    "ccb-constipation-laxative": "ccb-constipation-laxative",
    "digoxin-nausea-antiemetic": "digoxin-nausea-antiemetic",
    "alpha-blocker-dizziness-vestibular": "alpha-blocker-dizziness-vestibular-suppressant",
    "bp-dizziness-vestibular": "antihypertensive-dizziness-antiemetic",
    "statin-muscle-pain-analgesic": "statin-myalgia-pain-reliever",
    "dpp4-joint-pain-nsaid": "dpp4-arthralgia-nsaid",
    "sglt2-yeast-antifungal": "sglt2-genital-infection-antifungal",
    "metformin-diarrhea-antidiarrheal": "metformin-diarrhea-antidiarrheal",
    "antipsychotic-high-sugar-antidiabetic": "antipsychotic-hyperglycemia-antihyperglycemic",
}


def research_names(node):
    """Every generic / member / combination-member name in a research row (recursively)."""
    if isinstance(node, dict):
        for k, v in node.items():
            if k in ("generic",) and isinstance(v, str):
                yield v
            elif k in ("members", "combinationMembers"):
                for m in v:
                    if isinstance(m, str):
                        yield m
                    elif isinstance(m, list):
                        yield from (x for x in m if isinstance(x, str))
            else:
                yield from research_names(v)
    elif isinstance(node, list):
        for x in node:
            yield from research_names(x)
ACB_NAME = {"belladonna": ["belladonna alkaloids"], "isosorbide": ["isosorbide mononitrate", "isosorbide dinitrate"]}


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def exec_sources(*names):
    ns = {}
    for n in names:
        p = os.path.join(KBS, n)
        with open(p, encoding="utf-8") as f:
            exec(compile(f.read(), p, "exec"), ns)  # trusted, repo-owned source files
    return ns


class Problems(list):
    def add(self, msg):
        self.append(msg)


def build():
    problems = Problems()
    warnings = []
    src = exec_sources("classes_src.py", "drugs_src.py", "drugs_extra_src.py", "combos_src.py", "rules_src.py")
    beers_res = load(os.path.join(RES, "beers-2023.json"))
    acb_res = load(os.path.join(RES, "acb-scale.json"))
    brand_report = load(os.path.join(KBS, "brand_report.json"))
    rx_known = load(os.path.join(KBS, "rx_cache_known.json"))
    rx_missing = load(os.path.join(KBS, "rx_missing.json"))
    rx_extra_path = os.path.join(KBS, "rx_extra_cache.json")
    rx_extra = load(rx_extra_path) if os.path.exists(rx_extra_path) else {"ingredients": {}, "brands": {}}

    # ---------------------------------------------------------------- classes
    classes = [{"id": c, "display": d, "parents": list(p)} for c, d, p in src["CLASSES"] + CLASS_ADDITIONS]
    class_ids = [c["id"] for c in classes]
    if len(set(class_ids)) != len(class_ids):
        problems.add("duplicate class ids")
    cmap = {c["id"]: c for c in classes}
    for c in classes:
        for p in c["parents"]:
            if p not in cmap:
                problems.add(f"class {c['id']}: unknown parent {p}")

    def ancestors(cid, seen=None):
        seen = seen or set()
        if cid in seen:
            return set()
        seen.add(cid)
        out = {cid}
        for p in cmap.get(cid, {}).get("parents", []):
            out |= ancestors(p, seen)
        return out

    # ---------------------------------------------------------------- drugs
    table7 = sorted({d["generic"] for d in beers_res["strongAnticholinergics"]})
    acb = {}
    for d in acb_res["drugs"]:
        for kid in ACB_NAME.get(d["generic"], [d["generic"]]):
            acb[kid] = d["acbScore"]
    frid_classes = {f[0] for f in src["FRIDS"]}
    drop_brands = set()
    drugs = []
    seen_ids = set()
    unverified_brands = []
    for d in src["DRUGS"]:
        did = d["id"]
        if did in seen_ids:
            problems.add(f"duplicate drug id {did}")
        seen_ids.add(did)
        cls = list(d["classes"])
        if did in table7 and "strong_anticholinergic" not in cls:
            cls.append("strong_anticholinergic")
        for c in cls:
            if c not in cmap:
                problems.add(f"drug {did}: unknown class {c}")
        trans = set()
        for c in cls:
            trans |= ancestors(c)
        eff = set()
        for c in trans:
            eff |= set(EFFECTS_BY_CLASS.get(c, []))
        if trans & frid_classes:
            eff |= {"fall", "nearFall"}
        eff |= set(d["fx"])
        eff -= set(d["nofx"])
        bad = eff - METRICS
        if bad:
            problems.add(f"drug {did}: unknown effects {sorted(bad)}")
        rname = RESEARCH_NAME.get(did, did)
        rx = None
        if rname in rx_known:
            rx = sorted(rx_known[rname], key=int)[0] if len(rx_known[rname]) == 1 else None
        if rx is None and did in rx_known and len(rx_known[did]) == 1:
            rx = rx_known[did][0]
        if rx is None and did in rx_missing and rx_missing[did]:
            rx = rx_missing[did].get("rxcui")
        if rx is None and (rx_extra["ingredients"].get(did) or {}).get("rxcui"):
            rx = rx_extra["ingredients"][did]["rxcui"]
        if did in RXCUI_OVERRIDE:
            rx = RXCUI_OVERRIDE[did]
        if rx is not None and not re.fullmatch(r"[0-9]{1,8}", str(rx)):
            problems.add(f"drug {did}: bad rxcui {rx}")
        brands = []
        for b in d["brands"]:
            b = b.lower().strip()
            if b in drop_brands or b in brands:
                continue
            verified = f"{did}|{b}" in brand_report
            if not verified:
                ings = rx_extra["brands"].get(b)
                verified = bool(ings) and any(did in i or i in did for i in ings)
            if not verified:
                unverified_brands.append(f"{did}|{b}")
            brands.append(b)
        v = d.get("variant")
        entry = {
            "id": did,
            "display": d["display"],
            "brands": brands,
            "aliases": sorted({a.lower().strip() for a in d["aliases"]}),
            "classes": cls,
            "rxcui": str(rx) if rx is not None else None,
            "otc": bool(d["otc"]),
            "acb": int(v["acb"]) if v else int(acb.get(did, 0)),
            "effects": [m for m in ["dizziness", "drowsiness", "confusion", "fall", "nearFall", "swelling", "energy", "sleep", "appetiteWorse"] if m in eff],
            "usedFor": d["usedFor"],
        }
        if v:
            entry["variant"] = {k: v[k] for k in ("of", "words", "baseWords", "maxDoseMg") if k in v}
        drugs.append(entry)
    dmap = {d["id"]: d for d in drugs}
    # Route / dose variants: the base must exist and be a plain entry; the variant shares its ingredient RxCUI.
    for d in drugs:
        v = d.get("variant")
        if not v:
            continue
        base = dmap.get(v["of"])
        if not base:
            problems.add(f"drug {d['id']}: variant of unknown drug {v['of']}")
            continue
        if base.get("variant"):
            problems.add(f"drug {d['id']}: variant of a variant ({v['of']})")
        if not v.get("words") and v.get("maxDoseMg") is None and not d["brands"]:
            problems.add(f"drug {d['id']}: variant with no way to select it")
        for w in v.get("words", []) + v.get("baseWords", []):
            if w != w.lower().strip() or not w:
                problems.add(f"drug {d['id']}: variant word '{w}' must be lowercase and trimmed")
        if d["rxcui"] is None:
            d["rxcui"] = base["rxcui"]
        if d["id"] in table7 or set(d["classes"]) & set(base["classes"]) & {"strong_anticholinergic"}:
            problems.add(f"drug {d['id']}: a route/dose variant must not carry the base's Table 7 class")
    for g in table7:
        if g not in dmap:
            problems.add(f"Beers Table 7 drug missing from KB: {g}")
    for g in acb:
        if g not in dmap:
            problems.add(f"ACB card drug missing from KB: {g}")

    # ---------------------------------------------------------------- combos
    combos = []
    for cid, display, names, ings, otc in src["COMBOS"]:
        for i in ings:
            if i not in dmap:
                problems.add(f"combo {cid}: unknown ingredient {i}")
        combos.append({"id": cid, "display": display, "names": sorted({n.lower().strip() for n in names}), "ingredientIds": list(ings), "otc": bool(otc)})

    # ---------------------------------------------------------------- name collisions (one name -> one meaning)
    owner = {}

    def claim(name, who):
        prev = owner.get(name)
        if prev and prev != who:
            problems.add(f"name '{name}' maps to both {prev} and {who}")
        owner.setdefault(name, who)

    for d in drugs:
        claim(d["id"], f"drug:{d['id']}")
        for b in d["brands"]:
            claim(b, f"drug:{d['id']}")
        for a in d["aliases"]:
            claim(a, f"drug:{d['id']}")
    for c in combos:
        for n in c["names"]:
            claim(n, f"combo:{c['id']}")

    # ---------------------------------------------------------------- sources
    sources = [dict(s) for s in src["SOURCES"]]
    smap = {s["id"]: s for s in sources}

    def check_selector(where, sel, allow_empty=False):
        if not isinstance(sel, dict) or (not sel.get("drugs") and not sel.get("classes") and not allow_empty):
            problems.add(f"{where}: empty selector")
            return
        for k in sel:
            if k not in ("drugs", "classes"):
                problems.add(f"{where}: unknown selector key {k}")
        for x in sel.get("drugs", []):
            if x not in dmap:
                problems.add(f"{where}: unknown drug {x}")
        for x in sel.get("classes", []):
            if x not in cmap:
                problems.add(f"{where}: unknown class {x}")

    def check_text(where, field, text, sentences_max=None, question=False):
        if not isinstance(text, str):
            return
        for rx, label in BANNED:
            if rx.search(text):
                problems.add(f"{where}.{field}: banned wording '{label}': {text}")
        for ph in re.findall(r"\{\s*([A-Za-z_]\w*)\s*\}", text):
            if ph not in PLACEHOLDERS:
                problems.add(f"{where}.{field}: unknown placeholder {{{ph}}}")
        if re.search(r"(?<![A-Za-z])[A-Za-z]\.\s", text.replace("e.g. ", "").replace("i.e. ", "")):
            problems.add(f"{where}.{field}: single-letter abbreviation would split the sentence: {text}")
        if question and not text.strip().endswith("?"):
            problems.add(f"{where}.{field}: question must end with '?'")
        if sentences_max is not None:
            n = len([s for s in re.split(r"(?<=[.!?])\s+(?=[A-Z])", text.strip()) if s])
            if n > sentences_max:
                problems.add(f"{where}.{field}: {n} sentences (max {sentences_max})")

    # ---------------------------------------------------------------- Beers rules
    res_by_id = {}
    for key in ("pims", "drugDiseaseInteractions", "useWithCaution", "drugDrugInteractions", "renalDoseAdjust"):
        for r in beers_res[key]:
            res_by_id[r["id"]] = r
    beers = []
    rule_ids = set()
    for r in src["BEERS"]:
        r = dict(r)
        where = f"beers {r['id']}"
        if r["id"] in rule_ids:
            problems.add(f"{where}: duplicate id")
        rule_ids.add(r["id"])
        rid = r.pop("rid", None)
        res = res_by_id.get(rid)
        if rid and not res:
            problems.add(f"{where}: unknown research id {rid}")
        if res:
            q = (res.get("qualityOfEvidence") or res.get("quality") or "").lower()
            s = (res.get("strengthOfRecommendation") or res.get("strength") or "").lower()
            if r["quality"] is None:
                if q in ("high", "moderate", "low"):
                    r["quality"] = q
                else:
                    problems.add(f"{where}: research quality is '{q}', set it explicitly")
            elif q in ("high", "moderate", "low") and r["quality"] != q:
                problems.add(f"{where}: quality {r['quality']} != research {q}")
            if r["strength"] is None:
                if s in ("strong", "weak"):
                    r["strength"] = s
                else:
                    problems.add(f"{where}: research strength is '{s}', set it explicitly")
            elif s in ("strong", "weak") and r["strength"] != s:
                problems.add(f"{where}: strength {r['strength']} != research {s}")
            r["sourceRef"] = f"AGS Beers 2023 {rid.split('-')[0].upper().replace('T', 'Table ')}: {rid}"
        if res:
            # Every drug a rule names must be named by its research row (catches drugs AGS removed, e.g. methyldopa
            # in 2023 Table 8). Class selectors are checked through the Table 7 / class lists instead.
            row_names = set(research_names(res))
            for x in r["appliesTo"].get("drugs", []):
                if RESEARCH_NAME.get(x, x) not in row_names and x not in row_names and x not in BEERS_DRUG_EXTENSIONS.get(r["id"], ()):
                    problems.add(f"{where}: drug {x} is not named in research row {rid}")
        if r["table"] not in ("pim", "condition", "caution", "interaction", "renal", "anticholinergic"):
            problems.add(f"{where}: bad table")
        check_selector(where + ".appliesTo", r["appliesTo"])
        if "with" in r:
            check_selector(where + ".with", r["with"])
        for c in r.get("conditions", []) or []:
            if c not in CONDITIONS:
                problems.add(f"{where}: unknown condition {c}")
        if r["table"] == "condition" and not r.get("conditions"):
            problems.add(f"{where}: condition rule without conditions")
        if r["table"] == "renal" and not isinstance(r.get("crclBelow"), (int, float)):
            problems.add(f"{where}: renal rule without crclBelow")
        if r["table"] == "interaction" and not r.get("with") and not r.get("minCount"):
            problems.add(f"{where}: interaction needs 'with' or 'minCount'")
        for k in ("excludeDrugs",):
            for x in r.get(k, []) or []:
                if x not in dmap:
                    problems.add(f"{where}: {k} unknown drug {x}")
        if r["sourceId"] not in smap:
            problems.add(f"{where}: unknown source {r['sourceId']}")
        q = r.get("qualifier")
        if q is not None and (len(q) > 90 or re.search(r"[.;]", q) or re.match(r"[A-Z]", q)):
            warnings.append(f"{where}: qualifier will not be inlined by the engine: {q}")
        check_text(where, "title", r["title"])
        check_text(where, "plain", r["plain"], sentences_max=1)
        check_text(where, "clinician", r["clinician"], sentences_max=3)
        check_text(where, "question", r["question"], question=True)
        check_text(where, "qualifier", q or "")
        out = {k: r[k] for k in ("id", "table", "appliesTo") if k in r}
        for k in ("with", "conditions", "crclBelow", "minDurationDays", "minCount", "maxDaysSinceStart", "reasonKeywords",
                  "excludeReasonKeywords", "excludeDrugs", "sex"):
            if r.get(k) not in (None, [], ""):
                out[k] = r[k]
        for k in ("qualifier", "title", "plain", "clinician", "question", "recommendation", "quality", "strength", "sourceId", "sourceRef"):
            out[k] = r.get(k)
        beers.append(out)

    # ---------------------------------------------------------------- cascades, FRIDs, monitoring
    cascades = []
    casc_res = {x["id"]: x for x in load(os.path.join(RES, "cascades.json"))["cascades"]}
    for c in src["CASCADES"]:
        where = f"cascade {c['id']}"
        # A cascade may cite ThinkCascades only when it is one of the tool's retained cascades, and PIPC only when it
        # is on the PIPC list (research/cascades.json records both lists for each cascade).
        lst = {"thinkcascades": "thinkCascades2022", "pipc2025": "pipc2025"}.get(c["sourceId"])
        if lst:
            rid = CASCADE_RESEARCH_ID.get(c["id"])
            if not rid or rid not in casc_res:
                problems.add(f"{where}: cites {c['sourceId']} but has no research cascade id (CASCADE_RESEARCH_ID)")
            elif not casc_res[rid]["lists"].get(lst):
                problems.add(f"{where}: cites {c['sourceId']} but research cascade {rid} is not on that list")
        check_selector(where + ".index", c["index"])
        check_selector(where + ".marker", c["marker"])
        if c["sourceId"] not in smap:
            problems.add(f"{where}: unknown source {c['sourceId']}")
        for f in ("title", "plain", "clinician"):
            check_text(where, f, c[f])
        check_text(where, "question", c["question"], question=True)
        cascades.append(dict(c))
    frids = []
    for cid, display, plain, sid in src["FRIDS"]:
        if cid not in cmap and cid not in dmap:
            problems.add(f"frid {cid}: unknown class")
        if sid not in smap:
            problems.add(f"frid {cid}: unknown source {sid}")
        check_text(f"frid {cid}", "plain", plain)
        frids.append({"classId": cid, "display": display, "plain": plain, "sourceId": sid})
    monitoring = []
    for m in src["MONITORING"]:
        where = f"monitoring {m['id']}"
        check_selector(where, m["appliesTo"])
        for rc in m["relatedConcepts"]:
            if rc not in METRICS and rc not in CONCEPTS:
                problems.add(f"{where}: unknown concept {rc}")
        if m["sourceId"] not in smap:
            problems.add(f"{where}: unknown source {m['sourceId']}")
        for f in ("title", "plain", "clinician"):
            check_text(where, f, m[f])
        for w in m["watchFor"]:
            check_text(where, "watchFor", w)
        check_text(where, "question", m["question"], question=True)
        monitoring.append(dict(m))

    # ---------------------------------------------------------------- drug text + source text
    for d in drugs:
        check_text(f"drug {d['id']}", "usedFor", d["usedFor"])
        check_text(f"drug {d['id']}", "display", d["display"])
    for s in sources:
        check_text(f"source {s['id']}", "usedFor", s["usedFor"])
        check_text(f"source {s['id']}", "short", s["short"])

    # ---------------------------------------------------------------- unused-source check (every source is cited somewhere)
    cited = {r["sourceId"] for r in beers} | {c["sourceId"] for c in cascades} | {f["sourceId"] for f in frids} | {m["sourceId"] for m in monitoring}
    cited |= {"acb2012", "stopp_start_v3", "devries2018", "fda_labels", "medlineplus", "rxnorm", "shehab2016"}
    for s in sources:
        if s["id"] not in cited:
            warnings.append(f"source {s['id']} is not referenced by any rule")

    counts = {
        "drugs": len(drugs), "combos": len(combos), "classes": len(classes), "brands": sum(len(d["brands"]) for d in drugs),
        "aliases": sum(len(d["aliases"]) for d in drugs), "rxcui": sum(1 for d in drugs if d["rxcui"]),
        "acbListed": sum(1 for d in drugs if d["acb"] > 0), "beers": len(beers),
        "beersByTable": {t: sum(1 for r in beers if r["table"] == t) for t in ("pim", "condition", "caution", "interaction", "renal")},
        "strongAnticholinergics": sum(1 for d in drugs if "strong_anticholinergic" in d["classes"]),
        "cascades": len(cascades), "fridClasses": len(frids), "monitoring": len(monitoring), "sources": len(sources),
    }
    meta = {
        "version": VERSION,
        "acbThresholds": {"elevated": 3, "high": 5, "sourceId": "acb2012"},
        "coverageNote": (
            f"Kinwise reference set {VERSION}: {counts['drugs']} medicines ({counts['brands']} brand names, {counts['combos']} combination products), "
            f"{counts['beers']} AGS Beers 2023 rules (Table 2: {counts['beersByTable']['pim']}, Table 3: {counts['beersByTable']['condition']}, "
            f"Table 4: {counts['beersByTable']['caution']}, Table 5 and combinations: {counts['beersByTable']['interaction']}, Table 6: {counts['beersByTable']['renal']}), "
            f"{counts['acbListed']} medicines scored on the ACB scale, {counts['fridClasses']} fall-risk classes, {counts['cascades']} prescribing cascades and "
            f"{counts['monitoring']} what-to-watch-for rules. Compiled from published criteria and cross-checked by automated research and an adversarial fact-check; "
            "not reviewed by a licensed clinician. It does not check doses, allergies or every interaction, and a medicine that is not flagged is not thereby shown to be free of risk."
        ),
        "acbHighNote": "ACB totals of 3 or more are the published review threshold (elevated); Kinwise labels totals of 5 or more as 'high' for display only.",
        "counts": counts,
        "notEncoded": [{"criterion": a, "reason": b} for a, b in src["NOT_ENCODED"]],
    }
    check_text("meta", "coverageNote", meta["coverageNote"])
    data = {"sources": sources, "classes": classes, "drugs": drugs, "combos": combos, "beers": beers, "cascades": cascades,
            "frids": frids, "monitoring": monitoring, "meta": meta}
    report = {"version": VERSION, "counts": counts, "unverifiedBrands": sorted(unverified_brands),
              "drugsWithoutRxcui": sorted(d["id"] for d in drugs if not d["rxcui"]), "warnings": warnings}
    return data, report, problems


# ---------------------------------------------------------------------------------------------------------
# docs/CLINICAL-SOURCES.md, generated from the same data (template: kb-src/CLINICAL-SOURCES.template.md)

TABLE_LABEL = {
    "pim": "Table 2: potentially inappropriate in most older adults (generally avoid)",
    "condition": "Table 3: drug-disease (best avoided with a condition)",
    "caution": "Table 4: use with caution",
    "interaction": "Table 5: drug-drug (plus the Table 2 NSAID combination and the Table 4 TMP-SMX row)",
    "renal": "Table 6: kidney function (CrCl thresholds)",
}
SHORT_TABLE = {"pim": "2", "condition": "3", "caution": "4", "interaction": "5", "renal": "6"}


def cell(x):
    return str(x).replace("|", "\\|").replace("\n", " ")


def describe_selector(sel, cmap):
    parts = [cmap[c]["display"].split(" (")[0] for c in sel.get("classes", [])] + sel.get("drugs", [])
    text = ", ".join(parts)
    return text if len(text) <= 160 else text[:157] + "..."


def write_docs(data, report):
    tpl_path = os.path.join(HERE, "CLINICAL-SOURCES.template.md")
    with open(tpl_path, encoding="utf-8") as f:
        doc = f.read()
    cmap = {c["id"]: c for c in data["classes"]}
    drugs, combos, beers = data["drugs"], data["combos"], data["beers"]
    c = report["counts"]
    rows = [
        ("sources.json", "Source register (citation, DOI, what each source is used for)", c["sources"]),
        ("classes.json", "Class taxonomy with parents (e.g. benzodiazepine -> CNS-active, sedative)", c["classes"]),
        ("drugs.json", f"Medicines: {c['brands']} brand names, {c['aliases']} lay names, {c['rxcui']} RxCUIs, {c['acbListed']} ACB scores, diary effects", c["drugs"]),
        ("combos.json", "Combination products (OTC 'PM' products, opioid combinations, blood-pressure and diabetes combinations)", c["combos"]),
        ("beers.json", "AGS Beers 2023 rules (Tables 2-6; Table 7 is a class on 40 medicines)", c["beers"]),
        ("cascades.json", "Prescribing cascades with time windows and reason words", c["cascades"]),
        ("frids.json", "Fall-risk-increasing drug classes", c["fridClasses"]),
        ("monitoring.json", "What to watch for (anticoagulants, antiplatelets, insulin and sulfonylureas, opioids, digoxin)", c["monitoring"]),
        ("meta.json", "Version, ACB thresholds, coverage note, criteria not encoded", 1),
    ]
    rep = {
        "VERSION": data["meta"]["version"],
        "COUNTS_TABLE": "\n".join(f"| `{a}` | {cell(b)} | {n} |" for a, b, n in rows),
        "BEERS_BY_TABLE": "\n".join(f"| {SHORT_TABLE[t]} | {cell(TABLE_LABEL[t])} | {c['beersByTable'][t]} |" for t in ("pim", "condition", "caution", "interaction", "renal"))
        + f"\n| 7 | Strong anticholinergics (used by Tables 2, 3 and 5) | class on {c['strongAnticholinergics']} medicines |",
        "SOURCES_TABLE": "\n".join(
            f"| `{s['id']}` | {cell(s['short'])} | {cell(s['citation'])} | {('doi:' + s['doi']) if s['doi'] else s['url']} | {cell(s['usedFor'])} |" for s in data["sources"]),
        "RXCUI_LINE": f"{c['rxcui']} of {c['drugs']} medicines carry an RxNorm ingredient RxCUI; the rest have none on purpose ({', '.join(report['drugsWithoutRxcui']) or 'none'}).",
        "NOT_ENCODED": "\n".join(f"| {cell(x['criterion'])} | {cell(x['reason'])} |" for x in data["meta"]["notEncoded"]),
        "UNVERIFIED_BRANDS": ", ".join(b.replace("|", " → ") for b in report["unverifiedBrands"]) or "none.",
    }
    brows = []
    for r in beers:
        q = []
        if r.get("with"):
            q.append("with: " + describe_selector(r["with"], cmap))
        for k, label in (("minDurationDays", "taken >= {} days"), ("maxDaysSinceStart", "started within {} days"), ("minCount", ">= {} distinct medicines"),
                         ("crclBelow", "CrCl < {} mL/min"), ("sex", "{} only")):
            if r.get(k) is not None:
                q.append(label.format(r[k]))
        if r.get("conditions"):
            q.append("condition: " + ", ".join(r["conditions"]))
        if r.get("reasonKeywords"):
            q.append("reason mentions: " + ", ".join(r["reasonKeywords"][:4]) + ("..." if len(r["reasonKeywords"]) > 4 else ""))
        if r.get("excludeReasonKeywords"):
            q.append("not when reason mentions: " + ", ".join(r["excludeReasonKeywords"][:4]) + ("..." if len(r["excludeReasonKeywords"]) > 4 else ""))
        if r.get("excludeDrugs"):
            q.append("except: " + ", ".join(r["excludeDrugs"]))
        brows.append(f"| `{r['id']}` | {SHORT_TABLE[r['table']]} | {cell(describe_selector(r['appliesTo'], cmap))} | {cell('; '.join(q) or '-')} | {r['quality'] or '-'} / {r['strength'] or '-'} |")
    rep["BEERS_TABLE"] = "\n".join(brows)
    rep["FRID_TABLE"] = "\n".join(f"| {cell(cmap[f['classId']]['display'])} | {cell(f['display'])} | {cell(f['plain'])} | `{f['sourceId']}` |" for f in data["frids"])
    rep["CASCADES_TABLE"] = "\n".join(
        f"| `{x['id']}` | {cell(describe_selector(x['index'], cmap))} → {cell(x['adverseEffect'])} → {cell(describe_selector(x['marker'], cmap))} | {x['windowDays'] if x['windowDays'] is not None else 'any'} | {cell(', '.join(x['reasonKeywords']) or '-')} | `{x['sourceId']}` |"
        for x in data["cascades"])
    rep["MONITORING_TABLE"] = "\n".join(
        f"| {cell(m['title'])} | {cell(describe_selector(m['appliesTo'], cmap))} | {cell('; '.join(m['watchFor']))} | {cell(', '.join(m['relatedConcepts']))} | `{m['sourceId']}` |" for m in data["monitoring"])
    by = {s: sum(1 for d in drugs if d["acb"] == s) for s in (1, 2, 3)}
    rep["ACB_LINE"] = f"{c['acbListed']} medicines carry an ACB score (score 3: {by[3]}, score 2: {by[2]}, score 1: {by[1]}), transcribed from the 2012 card; the card's 'reviewed but not added' drugs (e.g. gabapentin) score 0."
    rep["NAMES_LINE"] = (
        f"{c['drugs']} medicines with {c['brands']} brand names and {c['aliases']} unambiguous lay names (e.g. 'baby aspirin', 'HCTZ', 'fish oil'), "
        f"plus {c['combos']} combination products ({sum(1 for x in combos if x['otc'])} over the counter, e.g. Tylenol PM, Advil PM, NyQuil). "
        "`matchDrug` strips dose and schedule text ('Lorazepam 0.5mg tab at bedtime'), reads brands in parentheses ('Furosemide (Lasix)'), "
        "recognises combinations typed as ingredients ('lisinopril/hctz') and never maps one name to two medicines (checked at build time). "
        "Ambiguous lay names such as 'water pill' are deliberately not mapped.")
    ev_path = os.path.join(ROOT, "eval", "results", "meds-eval.json")
    if os.path.exists(ev_path):
        ev = load(ev_path)
        sm = ev.get("summary", {})
        rep["EVAL_RESULT"] = (
            f"Last run ({ev.get('ranAt', '?')[:10]}, KB {ev.get('kbVersion', '?')}): **{sm.get('casesPassed')}/{sm.get('cases')} cases and "
            f"{sm.get('expectationsPassed')}/{sm.get('expectations')} expectations passed** "
            f"({sm.get('preconditionFailures', 0)} precondition failures). Run it with `npx vitest run eval/meds.eval.test.ts`; "
            "results are written to `eval/results/meds-eval.json`.")
    else:
        rep["EVAL_RESULT"] = "Not run yet: `npx vitest run eval/meds.eval.test.ts`."
    for k, v in rep.items():
        doc = doc.replace("{{" + k + "}}", v)
    left = re.findall(r"\{\{[A-Z_]+\}\}", doc)
    if left:
        raise SystemExit(f"unfilled template markers: {left}")
    out = os.path.join(ROOT, "docs", "CLINICAL-SOURCES.md")
    with open(out, "w", encoding="utf-8") as f:
        f.write(doc)
    return out


def needs():
    src = exec_sources("drugs_src.py", "drugs_extra_src.py", "combos_src.py")
    data, report, _ = build()
    names = [d for d in report["drugsWithoutRxcui"]]
    brands = [b.split("|", 1)[1] for b in report["unverifiedBrands"]]
    brands += [c[2][0] for c in src["COMBOS"]]
    print(json.dumps({"names": names, "brands": sorted(set(brands))}, indent=1))


def main(argv):
    if "--needs" in argv:
        needs()
        return 0
    data, report, problems = build()
    for w in report["warnings"]:
        print("warning:", w)
    if problems:
        for p in problems:
            print("PROBLEM:", p)
        print(f"{len(problems)} problem(s); nothing written.")
        return 1
    if "--check" in argv:
        print("ok:", json.dumps(report["counts"]))
        return 0
    os.makedirs(OUT, exist_ok=True)
    for name, value in data.items():
        with open(os.path.join(OUT, f"{name}.json"), "w", encoding="utf-8") as f:
            json.dump(value, f, indent=1, ensure_ascii=False)
            f.write("\n")
    with open(os.path.join(HERE, "build-report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, indent=1, ensure_ascii=False)
        f.write("\n")
    print("wrote", ", ".join(f"{k}.json" for k in data), "->", os.path.relpath(OUT, ROOT))
    print("wrote", os.path.relpath(write_docs(data, report), ROOT))
    print(json.dumps(report["counts"]))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
