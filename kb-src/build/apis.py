"""Small cached API helpers (curl-based because python.org SSL certs are missing)."""
import json, os, hashlib, subprocess, time, urllib.parse, re
CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache")
def _get(url, sleep=0.3):
    h = hashlib.sha1(url.encode()).hexdigest()
    p = os.path.join(CACHE, h + ".json")
    if os.path.exists(p):
        return json.load(open(p))
    for attempt in range(3):
        r = subprocess.run(["curl", "-s", "-m", "45", url], capture_output=True, text=True)
        try:
            d = json.loads(r.stdout)
            break
        except Exception:
            d = {"_error": r.stdout[:300]}
            time.sleep(2)
    json.dump(d, open(p, "w"))
    time.sleep(sleep)
    return d

def rxcui(name):
    d = _get("https://rxnav.nlm.nih.gov/REST/rxcui.json?" + urllib.parse.urlencode({"name": name, "search": 0}), 0.06)
    ids = (d.get("idGroup") or {}).get("rxnormId") or []
    if not ids:
        d = _get("https://rxnav.nlm.nih.gov/REST/rxcui.json?" + urllib.parse.urlencode({"name": name, "search": 2}), 0.06)
        ids = (d.get("idGroup") or {}).get("rxnormId") or []
    if not ids:
        return None
    props = _get(f"https://rxnav.nlm.nih.gov/REST/rxcui/{ids[0]}/properties.json", 0.06).get("properties") or {}
    return {"rxcui": ids[0], "rxnormName": props.get("name"), "tty": props.get("tty")}

def medlineplus(rxcui_):
    if not rxcui_:
        return None
    d = _get("https://connect.medlineplus.gov/service?" + urllib.parse.urlencode({
        "mainSearchCriteria.v.cs": "2.16.840.1.113883.6.88", "mainSearchCriteria.v.c": rxcui_,
        "knowledgeResponseType": "application/json", "informationRecipient.languageCode.c": "en"}), 0.7)
    try:
        for e in d["feed"]["entry"]:
            for l in e["link"]:
                href = l["href"].split("?")[0]
                if "medlineplus.gov/druginfo" in href:
                    return {"title": e["title"]["_value"], "url": href}
    except Exception:
        pass
    return None

def fda_labels(query, limit=25, prefer_cached_limit=None):
    if prefer_cached_limit:
        u2 = "https://api.fda.gov/drug/label.json?" + urllib.parse.urlencode({"search": query, "limit": prefer_cached_limit})
        if os.path.exists(os.path.join(CACHE, hashlib.sha1(u2.encode()).hexdigest() + ".json")):
            d = _get(u2)
            return d.get("results", []), d
    url = "https://api.fda.gov/drug/label.json?" + urllib.parse.urlencode({"search": query, "limit": limit})
    d = _get(url, 0.3)
    return d.get("results", []), d

def dailymed_url(set_id):
    return f"https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid={set_id}"
