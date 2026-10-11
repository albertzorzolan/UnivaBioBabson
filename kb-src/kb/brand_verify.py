import json, subprocess, urllib.parse, sys, os
sys.path.insert(0,'kb')
from concurrent.futures import ThreadPoolExecutor
from drugs_src import DRUGS
R='research/'
beers=json.load(open(R+'beers-2023.json'))
acb=json.load(open(R+'acb-scale.json'))
frids=json.load(open(R+'frids.json'))
known={}  # brand lower -> set(ingredient names lower)
for k,v in beers['brandIndex'].items(): known[k.lower()]=set(i.lower() for i in v['ingredients'])
bi=json.load(open('rx/brand_ings.json'))
for k,v in bi.items(): known.setdefault(k.lower(),set()).update(i.lower() for i in v['ingredients'])
for x in acb['drugs']:
    for b in x.get('brands',[]):
        if b['status'].startswith('verified'): known.setdefault(b['brand'].lower(),set()).add(x['generic'])
for c in frids['classes']:
    for e in c.get('examples',[]):
        for b in e.get('brands',[]):
            if b.get('status','').startswith('verified'): known.setdefault(b['brand'].lower(),set()).add(e['generic'])
NAMEMAP={"divalproex":"valproate","omega-3 fatty acids":"omega-3 acid ethyl esters (usp)","insulin nph":"insulin isophane",
 "insulin regular":"insulin, regular, human","desiccated thyroid":"thyroid (usp)","conjugated estrogens":"estrogens, conjugated (usp)",
 "esterified estrogens":"estrogens, esterified (usp)","ergoloid mesylates":"ergoloid mesylates, usp","cyanocobalamin":"vitamin b12",
 "sennosides":"sennosides, usp","belladonna alkaloids":"belladonna alkaloids","alimemazine":"trimeprazine","methotrimeprazine":"methotrimeprazine"}
cache_f='kb/brand_rx_cache.json'
cache=json.load(open(cache_f)) if os.path.exists(cache_f) else {}
def get(url):
    for i in range(3):
        try:
            r = subprocess.run(['curl','-s','--max-time','30',url], capture_output=True, text=True)
            return json.loads(r.stdout)
        except Exception: pass
    return None
def q(brand):
    if brand in cache: return brand, cache[brand]
    d=get(f"https://rxnav.nlm.nih.gov/REST/rxcui.json?name={urllib.parse.quote(brand)}&search=2")
    ids=(d or {}).get('idGroup',{}).get('rxnormId',[]) if d else []
    res={'ids':ids,'ings':[], 'tty':[]}
    for cid in ids[:3]:
        p=get(f"https://rxnav.nlm.nih.gov/REST/rxcui/{cid}/properties.json")
        tty=((p or {}).get('properties') or {}).get('tty'); res['tty'].append(tty)
        r=get(f"https://rxnav.nlm.nih.gov/REST/rxcui/{cid}/related.json?tty=IN+PIN")
        for g in ((r or {}).get('relatedGroup',{}).get('conceptGroup') or []):
            for c in g.get('conceptProperties') or []: res['ings'].append(c['name'].lower())
    return brand,res
todo=[]
for d in DRUGS:
    for b in d['brands']:
        if b not in known: todo.append(b)
todo=sorted(set(todo))
with ThreadPoolExecutor(max_workers=8) as ex:
    for b,res in ex.map(q,todo): cache[b]=res
json.dump(cache,open(cache_f,'w'),indent=0)
bad=[]
for d in DRUGS:
    gen=NAMEMAP.get(d['id'],d['id']).lower()
    for b in d['brands']:
        if b in known:
            ings=known[b]
            src='research'
        else:
            ings=set(cache[b]['ings']); src='rxnav'
        if gen not in ings:
            bad.append((d['id'],b,src,sorted(ings)[:5]))
        elif len(ings)>1 and src=='research':
            bad.append((d['id'],b,'MULTI-'+src,sorted(ings)[:5]))
for x in bad: print(x)
print(len(bad),'issues of', sum(len(d['brands']) for d in DRUGS))
