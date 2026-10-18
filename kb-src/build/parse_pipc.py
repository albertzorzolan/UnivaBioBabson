import re, json, sys, os
import xml.etree.ElementTree as ET
# Input was a one-off download not committed; see kb-src/build/README.md. BASE named the session scratch folder
# holding pipc.xml (PMC XML of the PIPC paper, PMC12712104) and bmj_t3.md / bmj_t4.md (BMJ 2026;394:e100499
# Tables 3 and 4). Their parsed outputs ARE committed next to this script: pipc_rows.json, bmj_t3.json, bmj_t4.json.
# To rerun, place those three downloads in kb-src/build/cascwork/ (not committed).
BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cascwork", "")
t = ET.parse(BASE + "pipc.xml").getroot()
L = lambda e: e.tag.split('}')[-1]
txt = lambda e: re.sub(r'\s+', ' ', ''.join(e.itertext())).strip()
rows = []; system = None; level = None
for tw in t.iter():
    if L(tw) != 'table-wrap' or tw.get('id') != 'Tab1': continue
    for tr in tw.iter():
        if L(tr) != 'tr': continue
        cells = [txt(c) for c in tr if L(c) in ('td', 'th')]
        cells = [c for c in cells]
        if len(cells) >= 3 and cells[1] and cells[2] and cells[0] != 'Drug A':
            rows.append(dict(system=system, level=level, drugA=cells[0], adverseEvent=cells[1], drugB=cells[2]))
        elif len(cells) >= 1 and cells[0]:
            c = cells[0]
            if c in ('Drug Class', 'Individual Drug'): level = c
            elif c.endswith('system'): system = c
            elif len(cells) >= 2 and cells[1] and not cells[2:] :
                print("ODD", cells, file=sys.stderr)
            else:
                print("ODD2", cells, file=sys.stderr)
print(len(rows))
json.dump(rows, open("pipc_rows.json", "w"), indent=1)
# BMJ T3
t3 = open(BASE + "bmj_t3.md").read().splitlines()
bm = {}; sysn = None
for line in t3:
    if not line.startswith("|"): continue
    cells = [c.strip() for c in line.strip().strip("|").split("|")]
    if cells[0].startswith("**"): sysn = cells[0].strip("*"); continue
    if len(cells) >= 6 and " to " in cells[0]:
        asr = re.sub(r"\[.*?\]\(.*?\)", "", cells[5]).strip()
        bm[cells[0]] = dict(system=sysn, initialBeforeSubsequent=cells[1], initialAfterSubsequent=cells[2], crudeSR=re.sub(r"\[.*?\]\(.*?\)", "", cells[3]).strip(), nullEffectSR=re.sub(r"\[.*?\]\(.*?\)", "", cells[4]).strip(), adjustedSR=asr)
print(len(bm))
json.dump(bm, open("bmj_t3.json", "w"), indent=1)
t4 = open(BASE + "bmj_t4.md").read().splitlines()
pr = {}
for line in t4:
    if not line.startswith("|"): continue
    cells = [c.strip() for c in line.strip().strip("|").split("|")]
    if " to " in cells[0] and not cells[0].startswith("**"):
        # overall prevalence may be blank when shared with the row above (merged cell)
        if len(cells) >= 12: pr[cells[0]] = dict(prevalenceInitialPct=cells[1], incidencePct=cells[2], adjustedSR=cells[3])
        else: pr[cells[0]] = dict(prevalenceInitialPct="(same as previous row)", incidencePct=cells[1], adjustedSR=cells[2])
print(len(pr))
json.dump(pr, open("bmj_t4.json", "w"), indent=1)
