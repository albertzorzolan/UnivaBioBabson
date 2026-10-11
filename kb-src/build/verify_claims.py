import sys, json
sys.path.insert(0, '.')
import labels
checks = [("sitagliptin", r"arthralgia", "DPP-4 arthralgia warning"), ("pioglitazone", r"heart failure", "pioglitazone HF boxed warning", ["boxed_warning"]),
          ("digoxin", r"nausea|anorexia|vomiting", "digoxin GI symptoms"), ("tramadol", r"serotonin syndrome", "tramadol serotonin syndrome"),
          ("amlodipine", r"dose[- ]related|dose related", "amlodipine edema dose-related"), ("clonidine", r"rebound|withdrawal", "clonidine withdrawal"),
          ("prednisone", r"insomnia", "prednisone insomnia"), ("donepezil", r"insomnia|abnormal dreams", "donepezil insomnia"), ("lisinopril", r"cough", "lisinopril cough"),
          ("verapamil", r"constipation", "verapamil constipation"), ("metoclopramide", r"parkinson|extrapyramidal|tardive", "metoclopramide EPS")]
out = {}
for c in checks:
    g, pat, label = c[0], c[1], c[2]
    secs = c[3] if len(c) > 3 else labels.SECTIONS
    r = labels.best_label(g)
    hits = labels.find(r, pat, secs) if r else []
    out[label] = {"generic": g, **(labels.label_meta(r) if r else {}), "matched": bool(hits), "hits": hits[:2]}
    print(label, bool(hits), hits[0]["section"] if hits else None, (hits[0]["snippet"][:160] if hits else ""))
json.dump(out, open("claim_checks.json", "w"), indent=1)
