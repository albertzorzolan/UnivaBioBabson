import json, subprocess, urllib.parse, sys
from concurrent.futures import ThreadPoolExecutor
def get(url):
    for i in range(3):
        try:
            r = subprocess.run(['curl','-s','--max-time','30',url], capture_output=True, text=True)
            return json.loads(r.stdout)
        except Exception:
            pass
    return None
QUERY_NAME = {"divalproex":"valproate","omega-3 fatty acids":"omega-3 acid ethyl esters","insulin nph":"insulin isophane",
 "insulin regular":"insulin, regular, human","desiccated thyroid":"thyroid (USP)","conjugated estrogens":"estrogens, conjugated (USP)",
 "esterified estrogens":"estrogens, esterified (USP)","ergoloid mesylates":"ergoloid mesylates, USP"}
def lookup(n):
    q = QUERY_NAME.get(n, n)
    d = get(f"https://rxnav.nlm.nih.gov/REST/rxcui.json?name={urllib.parse.quote(q)}&search=0")
    ids = (d or {}).get('idGroup',{}).get('rxnormId',[]) if d else []
    out = {'query': q, 'rxcui': None, 'name': None, 'tty': None}
    for cid in ids:
        p = get(f"https://rxnav.nlm.nih.gov/REST/rxcui/{cid}/properties.json")
        props = (p or {}).get('properties') or {}
        if props.get('tty') in ('IN','PIN','MIN'):
            out.update(rxcui=cid, name=props.get('name'), tty=props.get('tty')); break
        out.setdefault('other', []).append((cid, props.get('tty'), props.get('name')))
    return n, out
names = [l.strip() for l in open(sys.argv[1]) if l.strip()]
with ThreadPoolExecutor(max_workers=8) as ex:
    res = dict(ex.map(lookup, names))
json.dump(res, open(sys.argv[2],'w'), indent=1)
for k,v in res.items(): print(k, v['rxcui'], v['name'], v['tty'], v.get('other',''))
