import sys, json, os
sys.path.insert(0, '.')
import apis
from acb_data import ACB, REVIEWED_NOT_ADDED, BEERS2023_STRONG
from brandcheck import brand_check
# Paths are relative to this script (originally an absolute path into a session scratch folder);
# see kb-src/build/README.md. Helper modules and intermediate files are still read from the working
# directory, so run this from kb-src/build.
HERE = os.path.dirname(os.path.abspath(__file__))
RES = os.path.join(HERE, "..", "research")  # kb-src/research (committed)
# Writes the committed research file in place: review `git diff kb-src/research/acb-scale.json` after a rerun.
OUT = os.path.join(RES, "acb-scale.json")
RX_NAME = {"isosorbide": "isosorbide dinitrate", "belladonna": "belladonna alkaloids", "alimemazine": "trimeprazine", "methotrimeprazine": "methotrimeprazine"}
from concurrent.futures import ThreadPoolExecutor
pairs = [(g, b) for g, s, card, extra, *_ in ACB for b in card + extra if not b.startswith("(")]
with ThreadPoolExecutor(4) as ex:
    BC = dict(zip(pairs, ex.map(lambda p: brand_check(*p), pairs)))
with ThreadPoolExecutor(6) as ex:
    list(ex.map(lambda a: apis.rxcui(RX_NAME.get(a[0], a[0])), ACB))
print("prefetch done", file=sys.stderr)
entries = []
for generic, score, card, extra, cls, added, note in ACB:
    rx = apis.rxcui(RX_NAME.get(generic, generic))
    extra_rx = apis.rxcui("isosorbide mononitrate") if generic == "isosorbide" else None
    brands = []
    for b in card:
        if b.startswith("("):
            brands.append({"brand": b, "source": "ACB card", "status": "not-applicable"}); continue
        bc = dict(BC[(generic, b)]); bc["source"] = "ACB card"; brands.append(bc)
    for b in extra:
        bc = dict(BC[(generic, b)]); bc["source"] = "MedWatch addition"
        if not bc["status"].startswith("verified"):
            print("DROP extra brand (unverified):", generic, b, bc["status"], file=sys.stderr); continue
        brands.append(bc)
    mp = apis.medlineplus(rx["rxcui"]) if rx else None
    e = {
        "generic": generic,
        "acbScore": score,
        "acbCategory": "possible anticholinergic" if score == 1 else "definite anticholinergic",
        "therapeuticClass": cls,
        "addedIn2012Update": added,
        "beers2023StrongAnticholinergic": generic in BEERS2023_STRONG,
        "rxnorm": ([rx] if rx else []) + ([extra_rx] if extra_rx else []),
        "brands": brands,
        "medlineplus": mp,
        "matchTerms": sorted({generic} | ({"isosorbide dinitrate", "isosorbide mononitrate"} if generic == "isosorbide" else set()) | ({"trimeprazine"} if generic == "alimemazine" else set()) | ({"levomepromazine"} if generic == "methotrimeprazine" else set()) | {b["brand"].lower() for b in brands if b["status"].startswith("verified")}),
    }
    if note: e["note"] = note
    if generic == "ranitidine":
        e["matchTerms"] = [t for t in e["matchTerms"] if t != "zantac"]
        e["ambiguousTerms"] = ["zantac"]
    entries.append(e)
not_added = []
for g, b in REVIEWED_NOT_ADDED:
    rx = apis.rxcui(g)
    not_added.append({"generic": g, "brands": b, "acbScore": 0, "rxnorm": [rx] if rx else [], "note": "Reviewed in the 2012 update and NOT added (insufficient evidence of anticholinergic activity per the update). Treat as score 0 on ACB; do not flag as anticholinergic from ACB alone."})
beers_not_acb = []
for g in [x for x in BEERS2023_STRONG if x not in {a[0] for a in ACB}]:
    rx = apis.rxcui(g)
    beers_not_acb.append({"generic": g, "acbScore": None, "rxnorm": [rx] if rx else [], "beers2023StrongAnticholinergic": True,
        "note": "Listed as a drug with STRONG anticholinergic properties in AGS Beers 2023 Table 7 but absent from the ACB 2012 card. MedWatch should flag it as anticholinergic (Beers) without inventing an ACB score."})
doc = {
  "id": "acb-scale",
  "title": "Anticholinergic Cognitive Burden (ACB) scale - 2012 update, machine-readable",
  "version": "ACB 2012 update (Aging Brain Care, Regenstrief Institute / Indiana University); compiled 2026-10-10",
  "compiledBy": "MedWatch research (UnivaBio hackathon). Drug names, brands-as-printed and scores transcribed from the official card; RxNorm, brand verification and MedlinePlus links added programmatically.",
  "license": {
    "statement": "ACB scale: Copyright (c) 2008, 2012 Regenstrief Institute, Inc. All rights reserved. The card states use may only be in accordance with its Terms of Use (formerly http://www.agingbraincare.org/tools/abc-anticholinergic-cognitive-burden-scale; the agingbraincare.org domain did not respond on 2026-10-10) and permission requests go to acb@agingbraincare.org.",
    "medwatchUse": "Non-commercial hackathon prototype; attribute the scale on every screen/printout that shows ACB scores. Seek permission before any commercial use. (Our interpretation, not legal advice.)"
  },
  "sources": [
    {"id": "acb2012card", "citation": "Aging Brain Care. Anticholinergic Cognitive Burden Scale, 2012 Update. Indiana University Center for Aging Research / Regenstrief Institute.", "url": "https://www.hii.iu.edu/resources/anticholinergic-cognitive-burden-scale.pdf", "accessed": "2026-10-10"},
    {"id": "boustani2008", "citation": "Boustani M, Campbell N, Munger S, Maidment I, Fox C. Impact of anticholinergics on the aging brain: a review and practical application. Aging Health. 2008;4(3):311-320.", "doi": "10.2217/1745509X.4.3.311", "note": "Original ACB publication (cited on the card). Title, journal, volume, pages and DOI verified via the Crossref API on 2026-10-10 (not indexed in PubMed)."},
    {"id": "campbell2013", "citation": "Campbell NL, Maidment I, Fox C, Khan B, Boustani M. The 2012 update to the anticholinergic cognitive burden scale. J Am Geriatr Soc. 2013;61(S1):S142-S143 (abstract C46).", "url": "https://research.aston.ac.uk/en/publications/the-2012-update-to-the-anticholinergic-cognitive-burden-scale/", "summary": "23 medications reviewed; 7 excluded; 10 added with score 1, 1 with score 2, 5 with score 3."},
    {"id": "campbell2010", "citation": "Campbell NL, Boustani MA, Lane KA, et al. Use of anticholinergics and the risk of cognitive impairment in an African American population. Neurology. 2010;75(2):152-159.", "pmid": "20625168", "doi": "10.1212/WNL.0b013e3181e7f2ab", "url": "https://pubmed.ncbi.nlm.nih.gov/20625168/"},
    {"id": "fox2011", "citation": "Fox C, Richardson K, Maidment ID, et al. Anticholinergic medication use and cognitive impairment in the older population: the Medical Research Council Cognitive Function and Ageing Study. J Am Geriatr Soc. 2011;59(8):1477-1483.", "pmid": "21707557", "doi": "10.1111/j.1532-5415.2011.03491.x", "url": "https://pubmed.ncbi.nlm.nih.gov/21707557/"},
    {"id": "myint2015", "citation": "Myint PK, Fox C, Kwok CS, et al. Total anticholinergic burden and risk of mortality and cardiovascular disease over 10 years in 21,636 middle-aged and older men and women of EPIC-Norfolk prospective population study. Age Ageing. 2015;44(2):219-225.", "pmid": "25430550", "doi": "10.1093/ageing/afu185", "url": "https://pubmed.ncbi.nlm.nih.gov/25430550/"},
    {"id": "pasina2013", "citation": "Pasina L, Djade CD, Lucca U, et al. Association of anticholinergic burden with cognitive and functional status in a cohort of hospitalized elderly: comparison of the ACB scale and ARS (REPOSI). Drugs Aging. 2013;30(2):103-112.", "pmid": "23239364", "doi": "10.1007/s40266-012-0044-x", "url": "https://pubmed.ncbi.nlm.nih.gov/23239364/"},
    {"id": "coupland2019", "citation": "Coupland CAC, Hill T, Dening T, et al. Anticholinergic drug exposure and the risk of dementia: a nested case-control study. JAMA Intern Med. 2019;179(8):1084-1093.", "pmid": "31233095", "doi": "10.1001/jamainternmed.2019.0677", "url": "https://pubmed.ncbi.nlm.nih.gov/31233095/"},
    {"id": "acbcalc", "citation": "ACB Calculator (acbcalc.com).", "url": "https://www.acbcalc.com/", "accessed": "2026-10-10"},
    {"id": "beers2023", "citation": "2023 American Geriatrics Society Beers Criteria Update Expert Panel. American Geriatrics Society 2023 updated AGS Beers Criteria for potentially inappropriate medication use in older adults. J Am Geriatr Soc. 2023;71(7):2052-2081.", "pmid": "37139824", "doi": "10.1111/jgs.18372", "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC12478568/"},
    {"id": "fdaRanitidine2020", "citation": "FDA. FDA Requests Removal of All Ranitidine Products (Zantac) from the Market. Press release, April 1, 2020.", "url": "https://www.fda.gov/news-events/press-announcements/fda-requests-removal-all-ranitidine-products-zantac-market"},
    {"id": "openfda", "citation": "openFDA drug label API (FDA Structured Product Labeling), queried 2026-10-10; used as fallback evidence that a brand appears in an SPL with the ingredient (splEvidence gives the SPL set id and its latest effective date, which may be old for discontinued products).", "url": "https://open.fda.gov/apis/drug/label/"},
    {"id": "rxnav", "citation": "NLM RxNav REST API (RxNorm), queried 2026-10-10. Brand verification = RxNorm brand-name (BN) concept whose related ingredient (IN/MIN) includes the generic.", "url": "https://lhncbc.nlm.nih.gov/RxNav/APIs/RxNormAPIs.html"},
    {"id": "medlineplusConnect", "citation": "NLM MedlinePlus Connect web service, queried 2026-10-10 for consumer drug-information links.", "url": "https://medlineplus.gov/medlineplus-connect/web-service/"}
  ],
  "scoringRules": {
    "categoryCriteria": {
      "1": "Possible anticholinergic: in-vitro evidence that the chemical entity has antagonist activity at muscarinic receptors.",
      "2": "Definite anticholinergic: evidence from literature, prescribing information or expert opinion of a clinical anticholinergic effect.",
      "3": "Definite anticholinergic: evidence from literature, expert opinion or prescribing information that the medication may cause delirium."
    },
    "categoricalScoring": "Score 1 = 'possible' anticholinergic; score 2 or 3 = 'definite' anticholinergic.",
    "numericScoring": "Total ACB = sum of the scores of every medication the person takes; also count the number of possible and definite anticholinergic medications.",
    "doseAndRoute": "The scale is dose-independent and the card does not specify route; MedWatch scores systemic (oral/patch/injected) products only and lists topical/ophthalmic products as 'not scored' (MedWatch assumption).",
    "combinationProducts": "Score each anticholinergic ingredient of a combination product separately (e.g. Tylenol PM -> diphenhydramine 3).",
    "duplicateIngredient": "Count an ingredient once even if it appears in two products (MedWatch rule to avoid double counting; UNVERIFIED as an official ACB rule).",
    "medwatchDisplayThreshold": 3,
    "interpretation": [
      {"claim": "A total ACB score of 3 or more is associated with increased cognitive impairment and mortality; review risks, benefits and alternatives.", "source": "acbcalc"},
      {"claim": "Compared with ACB = 0, people with total ACB >= 3 had adjusted hazard ratios of 1.83 (95% CI 1.53-2.20) for all-cause mortality and 2.17 (1.87-2.52) for incident cardiovascular disease over ~10+ years (EPIC-Norfolk, n=21,636).", "source": "myint2015"},
      {"claim": "Each additional definite anticholinergic (ACB 2-3) was associated with higher odds of incident cognitive impairment over 6 years (OR 1.46, 95% CI 1.07-1.99); possible anticholinergics (ACB 1) were not (OR 0.96).", "source": "campbell2010"},
      {"claim": "Use of definite anticholinergics was associated with a 0.33-point greater 2-year MMSE decline (95% CI 0.03-0.64); 2-year mortality was higher with definite (OR 1.68) and possible (OR 1.56) anticholinergics.", "source": "fox2011"},
      {"claim": "The ACB card additionally states that each 1-point increase in total ACB has been correlated with a 26% increase in risk of death (citing Fox 2011); this figure is not in the Fox 2011 abstract and is UNVERIFIED against the full text in this session.", "source": "acb2012card"},
      {"claim": "In hospitalised older adults, a dose-response relationship was seen between total ACB and cognitive impairment (Short Blessed Test).", "source": "pasina2013"},
      {"claim": "Cumulative exposure to strong anticholinergics (antidepressant, antiparkinson, antipsychotic, bladder antimuscarinic, antiepileptic classes) was associated with increased dementia risk (highest exposure AOR about 1.49).", "source": "coupland2019", "caveat": "Observational; confounding by indication possible."}
    ],
    "caveats": [
      "Associations are observational; a high ACB score is a prompt for medication review, not proof of harm in an individual.",
      "The scale is dose-independent and does not capture newer drugs approved after 2012.",
      "Different anticholinergic scales disagree on which drugs score and by how much (see alternativeScales)."
    ]
  },
  "alternativeScales": [
    {"name": "Anticholinergic Risk Scale (ARS)", "citation": "Rudolph JL, Salow MJ, Angelini MC, McGlinchey RE. The anticholinergic risk scale and anticholinergic adverse effects in older persons. Arch Intern Med. 2008;168(5):508-513.", "pmid": "18332297", "doi": "10.1001/archinternmed.2007.106", "summary": "Ranked 0-3 categorical list; higher ARS scores were associated with more anticholinergic adverse effects in geriatric and primary-care cohorts."},
    {"name": "Anticholinergic Drug Scale (ADS)", "citation": "Carnahan RM, Lund BC, Perry PJ, Pollock BG, Culp KR. The Anticholinergic Drug Scale as a measure of drug-related anticholinergic burden: associations with serum anticholinergic activity. J Clin Pharmacol. 2006;46(12):1481-1486.", "pmid": "17101747", "doi": "10.1177/0091270006292126", "summary": "0-3 scale; scores associated with serum anticholinergic activity in long-term-care residents."},
    {"name": "CRIDECO Anticholinergic Load Scale (CALS)", "citation": "Ramos H, Moreno L, Perez-Tur J, et al. CRIDECO Anticholinergic Load Scale: an updated anticholinergic burden scale. Comparison with the ACB scale in Spanish individuals with subjective memory complaints. J Pers Med. 2022;12(2):207.", "pmid": "35207695", "doi": "10.3390/jpm12020207", "summary": "217 drugs (129 more than ACB); associated with cognitive impairment in a Spanish cohort where ACB was not."},
    {"name": "German Anticholinergic Burden Scale (GABS)", "citation": "Kiesel EK, Hopf YM, Drey M. An anticholinergic burden score for German prescribers: score development. BMC Geriatr. 2018;18(1):239.", "pmid": "30305048", "doi": "10.1186/s12877-018-0929-6"},
    {"name": "Systematic review of 19 scales", "citation": "Lisibach A, Benelli V, Ceppi MG, et al. Quality of anticholinergic burden scales and their impact on clinical outcomes: a systematic review. Eur J Clin Pharmacol. 2021;77(2):147-162.", "pmid": "33011824", "doi": "10.1007/s00228-020-02994-x", "summary": "19 scales identified; ACB and GABS rated highest quality; findings for delirium, cognition, mortality and falls were contradictory across studies."},
    {"name": "AGS Beers Criteria 2023 Table 7", "citation": "see source beers2023", "summary": "Not a score: a list of drugs with strong anticholinergic properties; Beers recommends avoiding combinations of >=2 anticholinergic drugs (risk of cognitive decline, delirium, falls/fractures)."}
  ],
  "counts": {"score1": sum(1 for e in entries if e["acbScore"] == 1), "score2": sum(1 for e in entries if e["acbScore"] == 2), "score3": sum(1 for e in entries if e["acbScore"] == 3), "total": len(entries)},
  "drugs": entries,
  "reviewedNotAdded2012": not_added,
  "beers2023StrongAnticholinergicsNotOnACB": beers_not_acb,
  "brandStatusLegend": {"verified-RxNorm": "RxNorm brand concept maps to this ingredient (RxNorm keeps many discontinued brands, so this does not prove current US marketing)", "verified-FDA-SPL-only": "not resolved as an RxNorm brand but an FDA SPL with this brand and ingredient exists (see splEvidence)", "brand-maps-to-different-ingredient": "the brand name resolves to a different ingredient in RxNorm - do NOT use it to match this drug", "not-found (not a current RxNorm brand or FDA SPL; likely discontinued or non-US)": "kept only because it is printed on the ACB card"},
  "brandSafetyNotes": [
    "'Zantac' brand is now used for famotidine ('Zantac 360'), which is NOT on the ACB scale; ranitidine was withdrawn from the US market on 2020-04-01. Do not map the word 'Zantac' to ranitidine without confirmation.",
    "'Unisom SleepTabs' contain doxylamine, 'Unisom SleepGels' contain diphenhydramine; both score 3.",
    "'Dramamine' original = dimenhydrinate; 'Dramamine Less Drowsy' = meclizine; both score 3.",
    "'Diuril' is chlorothiazide (not on ACB) even though the ACB card prints it next to chlorthalidone."
  ]
}
json.dump(doc, open(OUT, "w"), indent=1, ensure_ascii=False)
print("wrote", OUT, doc["counts"])
