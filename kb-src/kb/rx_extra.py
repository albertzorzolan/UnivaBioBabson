"""Fetch RxNorm data the earlier research caches do not have (run once; results cached for offline builds).

  python3 -I kb-src/kb/rx_extra.py            # from the repo root

1. Ingredient RxCUIs for KB drug ids missing from rx_cache_known.json / rx_missing.json
   (RxNav /rxcui?name=..&search=0, keeping only term type IN or PIN).
2. Brand -> ingredient checks for brands added after brand_report.json was produced
   (RxNav /rxcui?name=<brand> then /related?tty=IN+MIN; a brand passes when the generic is among the ingredients).

Writes kb-src/kb/rx_extra_cache.json. Never sends anything but public drug names to RxNav.
"""
import json
import os
import sys
import time
import urllib.parse
import subprocess
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
API = "https://rxnav.nlm.nih.gov/REST"
CACHE = os.path.join(HERE, "rx_extra_cache.json")


def get(path):
    # curl uses the system trust store (Python's bundled one may not include a local proxy's certificate).
    url = API + path
    for attempt in range(3):
        try:
            r = subprocess.run(["curl", "-s", "--max-time", "20", url], capture_output=True, text=True, check=False)
            return json.loads(r.stdout)
        except Exception:  # network hiccup or non-JSON reply: retry
            time.sleep(1 + attempt)
    return None


def ingredient_rxcui(name):
    d = get("/rxcui.json?" + urllib.parse.urlencode({"name": name, "search": 0})) or {}
    ids = (d.get("idGroup") or {}).get("rxnormId") or []
    for rx in ids:
        p = get(f"/rxcui/{rx}/properties.json") or {}
        tty = (p.get("properties") or {}).get("tty")
        if tty in ("IN", "PIN"):
            return {"rxcui": rx, "tty": tty, "name": (p.get("properties") or {}).get("name")}
    return None


def brand_ingredients(brand):
    d = get("/rxcui.json?" + urllib.parse.urlencode({"name": brand, "search": 2})) or {}
    ids = (d.get("idGroup") or {}).get("rxnormId") or []
    out = set()
    for rx in ids[:3]:
        rel = get(f"/rxcui/{rx}/related.json?tty=IN+MIN") or {}
        for g in (rel.get("relatedGroup") or {}).get("conceptGroup") or []:
            for c in g.get("conceptProperties") or []:
                out.add(c["name"].lower())
    return sorted(out)


def main(names, brands):
    cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {"ingredients": {}, "brands": {}}
    todo_n = [n for n in names if n not in cache["ingredients"]]
    todo_b = [b for b in brands if b not in cache["brands"]]
    with ThreadPoolExecutor(max_workers=6) as ex:
        for n, v in zip(todo_n, ex.map(ingredient_rxcui, todo_n)):
            cache["ingredients"][n] = v
            print("IN", n, v)
        for b, v in zip(todo_b, ex.map(brand_ingredients, todo_b)):
            cache["brands"][b] = v
            print("BN", b, v)
    json.dump(cache, open(CACHE, "w"), indent=1, sort_keys=True)


if __name__ == "__main__":
    spec = json.load(open(sys.argv[1])) if len(sys.argv) > 1 else {"names": [], "brands": []}
    main(spec.get("names", []), spec.get("brands", []))
