import json, subprocess, urllib.parse, sys, os, re
sys.path.insert(0,'kb')
from concurrent.futures import ThreadPoolExecutor
from drugs_src import DRUGS
exec(open('kb/brand_verify.py').read().split("cache_f=")[0].split("from drugs_src import DRUGS")[1])  # reuse known + NAMEMAP
cache=json.load(open('kb/brand_rx_cache.json'))
dm_f='kb/brand_dailymed_cache.json'
dm=json.load(open(dm_f)) if os.path.exists(dm_f) else {}
SUFFIX={'xr','er','cr','sr','la','xl','odt','cd','hfa','24hr','ac','otc','pm','sl','ds','ib','diskus','respimat','handihaler','ellipta','flexhaler','respiclick','sprinkle','solutab','extra','strength','8','hr','arthritis','pain','aq','dot','af','titradose','12','hour','original','all','day','less','drowsy','soltab','mycite','relprevv','trinza','hafyera','ec','allergy'}
def ing_ok(gen, ings):
    gen=gen.lower()
    for i in ings:
        if i==gen or i.startswith(gen) or gen.startswith(i) or gen in i: return True
    return False
def verified_rx(gen,b):
    if b in known and ing_ok(gen, known[b]): return 'research' if len(known[b])==1 else 'research-multi'
    if b in cache and ing_ok(gen, set(cache[b]['ings'])): return 'rxnorm'+('-obsolete' if 'Obsolete' in cache[b].get('status',[]) else '')
    return None
def get(url):
    for i in range(3):
        try:
            r = subprocess.run(['curl','-s','--max-time','30',url], capture_output=True, text=True)
            return json.loads(r.stdout)
        except Exception: pass
    return None
def dmq(b):
    if b in dm: return b, dm[b]
    d=get(f"https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json?drug_name={urllib.parse.quote(b)}&pagesize=5")
    return b, [x['title'] for x in (d or {}).get('data',[])]
pending=[]
for d in DRUGS:
    gen=NAMEMAP.get(d['id'],d['id'])
    for b in d['brands']:
        if not verified_rx(gen,b): pending.append(b)
with ThreadPoolExecutor(max_workers=6) as ex:
    for b,t in ex.map(dmq, sorted(set(pending))): dm[b]=t
json.dump(dm,open(dm_f,'w'),indent=0)
report={}; removed=[]
for d in DRUGS:
    gen=NAMEMAP.get(d['id'],d['id'])
    keep=[]
    for b in d['brands']:
        how=verified_rx(gen,b)
        if not how:
            titles=[t.lower() for t in dm.get(b,[])]
            g2=d['id'].split()[0]
            if any(t.startswith(b.replace("'","").split()[0]) and (g2 in t or gen.split(',')[0] in t) for t in titles):
                # ensure single-ingredient: title's parenthetical lists only this ingredient
                multi=all((' and ' in t.split('(')[1] if '(' in t else False) for t in titles if g2 in t)
                how='dailymed' + ('-combo?' if multi else '')
        if not how:
            toks=b.replace('-',' ').split()
            for n in range(len(toks)-1,0,-1):
                base=' '.join(toks[:n])
                if all(t in SUFFIX for t in toks[n:]) and (verified_rx(gen,base) or base in [x for x in d['brands'] if x!=b and verified_rx(gen,x)]):
                    how='variant-of:'+base; break
        if how and not how.endswith('combo?'): keep.append(b); report[(d['id'],b)]=how
        else: removed.append((d['id'],b,how,dm.get(b,[])[:2]))
for r in removed: print('REMOVE',r)
json.dump({f"{k[0]}|{k[1]}":v for k,v in report.items()}, open('kb/brand_report.json','w'), indent=0)
from collections import Counter
print(Counter(v.split(':')[0] for v in report.values()))
