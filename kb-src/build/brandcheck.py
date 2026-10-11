import sys, re, json, urllib.parse
sys.path.insert(0, '.')
import apis
SYN = {"isosorbide": ["isosorbide dinitrate", "isosorbide mononitrate", "isosorbide"], "belladonna": ["belladonna", "atropine", "hyoscyamine", "scopolamine"],
       "valproate": ["valproate", "valproic acid", "divalproex"], "carbidopa": ["carbidopa"], "insulin glargine": ["insulin glargine"]}
def rx_brand(brand):
    d = apis._get("https://rxnav.nlm.nih.gov/REST/rxcui.json?" + urllib.parse.urlencode({"name": brand, "search": 0}), 0.06)
    ids = (d.get("idGroup") or {}).get("rxnormId") or []
    out = []
    for i in ids[:3]:
        props = apis._get(f"https://rxnav.nlm.nih.gov/REST/rxcui/{i}/properties.json", 0.06).get("properties") or {}
        rel = apis._get(f"https://rxnav.nlm.nih.gov/REST/rxcui/{i}/related.json?tty=IN+MIN", 0.06)
        ings = []
        for g in ((rel.get("relatedGroup") or {}).get("conceptGroup") or []):
            ings += [c["name"].lower() for c in g.get("conceptProperties", [])]
        out.append({"rxcui": i, "name": props.get("name"), "tty": props.get("tty"), "ingredients": sorted(set(ings))})
    return out
def spl_brand(brand, generic_keys):
    q = 'spl_product_data_elements:"%s"' % brand.replace('"', '')
    res, _ = apis.fda_labels(q, 3)
    for r in res:
        el = " ".join(r.get("spl_product_data_elements", [])).lower()
        if brand.lower().split()[0].replace("-", "") in el.replace("-", "") and any(k in el for k in generic_keys):
            return {"splSetId": r["set_id"], "splEffective": r.get("effective_time"), "dailymed": apis.dailymed_url(r["set_id"])}
    return None
def brand_check(generic, brand):
    keys = SYN.get(generic, [generic])
    rx = rx_brand(brand)
    hit = next((c for c in rx if any(any(k in ing for k in keys) for ing in c["ingredients"])), None)
    res = {"brand": brand}
    if hit:
        res.update(status="verified-RxNorm", rxnormBrand={"rxcui": hit["rxcui"], "name": hit["name"], "tty": hit["tty"], "ingredients": hit["ingredients"]})
    elif rx and any(c["ingredients"] for c in rx):
        res.update(status="brand-maps-to-different-ingredient", rxnormBrand={"rxcui": rx[0]["rxcui"], "name": rx[0]["name"], "ingredients": rx[0]["ingredients"]})
        return res
    spl = spl_brand(brand, keys)
    if spl:
        res["splEvidence"] = spl
        if not hit: res["status"] = "verified-FDA-SPL-only"
    if not hit and not spl:
        res["status"] = "not-found (not a current RxNorm brand or FDA SPL; likely discontinued or non-US)"
    return res
if __name__ == "__main__":
    for g, b in [("paroxetine","Paxil"),("ranitidine","Zantac"),("famotidine","Zantac 360"),("chlorthalidone","Diuril"),("amitriptyline","Elavil"),("trospium","Sanctura"),("diphenhydramine","Tylenol PM"),("doxylamine","NyQuil")]:
        print(json.dumps(brand_check(g, b)))
