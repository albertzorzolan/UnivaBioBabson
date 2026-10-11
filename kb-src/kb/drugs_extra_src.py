# Kinwise KB: drugs added after the first master list (drugs_src.py), to cover the remaining ACB-card
# entries and common medicines in US older adults' lists. Same fields as drugs_src.py (D() is defined there;
# build_kb.py executes both files in one namespace). RxCUIs come from kb/rx_extra_cache.json (rx_extra.py).

# ---------------------------------------------------------------- eye drops (scored as not systemic)
D("latanoprost", "Latanoprost (eye drops)", ["ophthalmic_glaucoma"], ["xalatan", "xelpros"], use="Glaucoma (eye drops)")
D("timolol", "Timolol (eye drops)", ["ophthalmic_glaucoma"], ["timoptic", "timoptic-xe", "istalol"], use="Glaucoma (eye drops); tablets are rarely used now")
D("brimonidine", "Brimonidine (eye drops)", ["ophthalmic_glaucoma"], ["alphagan p", "lumify"], use="Glaucoma (eye drops); eye redness")
D("bimatoprost", "Bimatoprost (eye drops)", ["ophthalmic_glaucoma"], ["lumigan"], use="Glaucoma (eye drops)")
D("dorzolamide", "Dorzolamide (eye drops)", ["ophthalmic_glaucoma"], ["trusopt"], use="Glaucoma (eye drops)")

# ---------------------------------------------------------------- cardiovascular
D("ranolazine", "Ranolazine", ["antianginal_other"], ["ranexa", "aspruzyo sprinkle"], fx=["dizziness"], use="Long-term chest pain (angina)")
D("propafenone", "Propafenone", ["antiarrhythmic"], ["rythmol sr"], fx=["dizziness"], use="Irregular heart rhythms")
D("midodrine", "Midodrine", ["antihypotensive"], use="Low blood pressure on standing (orthostatic hypotension)")
D("fludrocortisone", "Fludrocortisone", ["mineralocorticoid"], fx=["swelling"], use="Low blood pressure on standing; adrenal insufficiency")
D("insulin", "Insulin (type not specified)", ["insulin"], use="Diabetes (check the label for the insulin type)")

# ---------------------------------------------------------------- bone, kidney, vitamins
D("denosumab", "Denosumab", ["bone_antiresorptive"], ["prolia", "xgeva"], use="Osteoporosis (injection every 6 months)")
D("zoledronic acid", "Zoledronic acid", ["bisphosphonate"], ["reclast", "zometa"], use="Osteoporosis (yearly infusion)")
D("sevelamer", "Sevelamer", ["phosphate_binder"], ["renvela", "renagel"], use="High phosphate with kidney disease")
D("calcitriol", "Calcitriol", ["vitamin_mineral"], ["rocaltrol"], use="Active vitamin D for kidney disease or low calcium")
D("folic acid", "Folic acid", ["vitamin_mineral"], aliases=["folate"], otc=True, use="Folate supplement")
D("ascorbic acid", "Vitamin C (ascorbic acid)", ["vitamin_mineral"], aliases=["vitamin c", "vit c"], otc=True, use="Vitamin C supplement")
D("multivitamin", "Multivitamin", ["vitamin_mineral"], ["centrum", "centrum silver", "one a day"], aliases=["multivitamins", "multi-vitamin", "multi vitamin", "mvi"], otc=True, use="Vitamin and mineral supplement")

# ---------------------------------------------------------------- other common medicines
D("sumatriptan", "Sumatriptan", ["triptan"], ["imitrex", "tosymra", "zembrace symtouch", "onzetra xsail"], fx=["dizziness", "drowsiness"], use="Migraine attacks")
D("valacyclovir", "Valacyclovir", ["antiviral"], ["valtrex"], use="Shingles, cold sores and herpes infections")
D("acyclovir", "Acyclovir", ["antiviral"], ["zovirax", "sitavig"], use="Shingles, cold sores and herpes infections")
D("oseltamivir", "Oseltamivir", ["antiviral"], ["tamiflu"], use="Flu (influenza) treatment or prevention")
D("cholestyramine", "Cholestyramine", ["bile_acid_sequestrant"], ["prevalite", "questran", "questran light"], use="High cholesterol; diarrhea from bile acids; itching")
D("methimazole", "Methimazole", ["antithyroid"], ["tapazole"], use="Overactive thyroid (hyperthyroidism)")
D("nystatin", "Nystatin", ["antifungal"], use="Thrush and other yeast infections (mouth rinse or cream)")
D("tamoxifen", "Tamoxifen", ["hormonal_cancer_therapy"], ["soltamox"], use="Breast cancer treatment and prevention")
D("anastrozole", "Anastrozole", ["hormonal_cancer_therapy"], ["arimidex"], use="Breast cancer treatment after menopause")
D("letrozole", "Letrozole", ["hormonal_cancer_therapy"], ["femara"], use="Breast cancer treatment after menopause")
D("lidocaine", "Lidocaine (skin patch)", ["local_anesthetic"], ["lidoderm", "ztlido"], use="Nerve pain after shingles; local pain relief (patch or cream)")
D("nefopam", "Nefopam", ["analgesic_other"], use="Pain (not marketed in the US)")

# ---------------------------------------------------------------- added in the 2026.10.2 build (independent clinical review)
D("pyrilamine", "Pyrilamine", ["first_gen_antihistamine"], otc=True, use="Sedating antihistamine in menstrual-symptom products (Midol Complete, Pamprin)")
D("pamabrom", "Pamabrom", ["other"], otc=True, use="Mild water pill in menstrual-symptom products (Pamprin)")
D("vilanterol", "Vilanterol", ["bronchodilator"], use="COPD and asthma (long-acting inhaled bronchodilator, in Breo, Anoro and Trelegy)")
D("suvorexant", "Suvorexant", ["orexin_antagonist"], ["belsomra"], fx=["drowsiness"], use="Insomnia")
D("lemborexant", "Lemborexant", ["orexin_antagonist"], ["dayvigo"], fx=["drowsiness"], use="Insomnia")
D("daridorexant", "Daridorexant", ["orexin_antagonist"], ["quviviq"], fx=["drowsiness"], use="Insomnia")
