import sys, re, json
sys.path.insert(0, '.')
import apis
SECTIONS = ["adverse_reactions", "warnings_and_cautions", "warnings", "precautions", "boxed_warning", "geriatric_use",
            "use_in_specific_populations", "when_using", "stop_use", "ask_doctor", "do_not_use", "information_for_patients"]
_label_cache = {}
EXACT = {"chlorpheniramine": ["CHLORPHENIRAMINE MALEATE"], "pseudoephedrine": ["PSEUDOEPHEDRINE HYDROCHLORIDE", "PSEUDOEPHEDRINE SULFATE"],
         "hydrocodone": ["HYDROCODONE BITARTRATE"], "ferrous sulfate": ["FERROUS SULFATE"], "doxylamine": ["DOXYLAMINE SUCCINATE"],
         "hydrochlorothiazide": ["HYDROCHLOROTHIAZIDE"], "phenylephrine": ["PHENYLEPHRINE HYDROCHLORIDE"]}
def _n_ing(gn, generic):
    gn = re.sub(r"\(.*?\)", "", gn.lower())
    for tok in [generic.lower()]:
        gn = gn.replace(tok, "X")
    return gn.count(" and ") + gn.count(",") + gn.count("/") + gn.count("-")
def best_label(generic):
    if generic in _label_cache: return _label_cache[generic]
    for ex in EXACT.get(generic, []):
        res, raw = apis.fda_labels('openfda.generic_name.exact:"%s"' % ex, 5)
        res = [r for r in res if r.get("adverse_reactions") or r.get("warnings") or r.get("stop_use")]
        if res:
            res.sort(key=lambda r: (0 if "HUMAN PRESCRIPTION DRUG" in r.get("openfda", {}).get("product_type", []) else 1, -int(r.get("effective_time", "0") or 0)))
            _label_cache[generic] = res[0]; return res[0]
    cands = []
    for q in ['openfda.generic_name:"%s" AND _exists_:adverse_reactions' % generic, 'openfda.generic_name:"%s"' % generic]:
        res, raw = apis.fda_labels(q, 5)
        for r in res:
            gn = " ".join(r.get("openfda", {}).get("generic_name", [])).lower()
            if generic.split()[0] not in gn: continue
            n_ing = _n_ing(gn, generic)
            rx = 1 if "HUMAN PRESCRIPTION DRUG" in r.get("openfda", {}).get("product_type", []) else 0
            cands.append((n_ing, -rx, -int(r.get("effective_time", "0") or 0), r))
        if cands: break
    if not cands:
        _label_cache[generic] = None; return None
    cands.sort(key=lambda x: x[:3])
    _label_cache[generic] = cands[0][3]
    return cands[0][3]
def label_meta(r):
    o = r.get("openfda", {})
    return {"splSetId": r["set_id"], "dailymed": apis.dailymed_url(r["set_id"]), "splEffective": r.get("effective_time"),
            "genericName": (o.get("generic_name") or [None])[0], "brandName": (o.get("brand_name") or [None])[0],
            "manufacturer": (o.get("manufacturer_name") or [None])[0], "productType": (o.get("product_type") or [None])[0]}
def find(r, pattern, sections=SECTIONS):
    rx = re.compile(pattern, re.I)
    hits = []
    for s in sections:
        for txt in r.get(s, []) or []:
            m = rx.search(txt)
            if m:
                a = max(0, m.start() - 90); b = min(len(txt), m.end() + 90)
                hits.append({"section": s, "term": m.group(0), "snippet": re.sub(r"\s+", " ", txt[a:b]).strip()})
                break
    return hits
