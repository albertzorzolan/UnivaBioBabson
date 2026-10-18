# kb-src: where the knowledge base comes from

Kinwise's medication-review engine reads only the compiled JSON in `src/kb/data/`. This folder holds what that JSON is built from.

| Path | What it is |
|---|---|
| `research/*.json`, `research/*.md` | Sourced extractions from public sources (AGS Beers 2023, the ACB scale, STEADI/STOPPFall fall-risk drugs, prescribing-cascade papers, FDA labels via openFDA/DailyMed), with citations, plus research notes. `research/regsrc/` keeps copies of the regulatory pages that `research/regulatory.md` quotes. |
| `kb/*_src.py`, `kb/*.json` | Hand-curated classes, drugs, combinations and rules in Kinwise wording, plus cached RxNorm/DailyMed lookups. |
| `build_kb.py` | The compiler. It reads `kb/` and `research/beers-2023.json`, `acb-scale.json` and `cascades.json`, cross-checks them, and writes `src/kb/data/*.json`. |
| `build-report.json` | Written by each full build: KB version, counts (drugs, brands, Beers rules, cascades...), unverified brand names, drugs without an RxCUI, and warnings. |
| `CLINICAL-SOURCES.template.md` | Template that the build fills in to produce `docs/CLINICAL-SOURCES.md`. |
| `build/` | One-off extraction scripts that produced the `research/` inputs. `build_kb.py` does not run them; see [build/README.md](build/README.md). |

Commands (from the repo root, Python 3, standard library only, no network):

```sh
python3 -I kb-src/build_kb.py           # rebuild src/kb/data/*.json, kb-src/build-report.json and docs/CLINICAL-SOURCES.md
python3 -I kb-src/build_kb.py --check   # build in memory and validate only; writes nothing, exits 1 on any problem
python3 -I kb-src/build_kb.py --needs   # list RxNorm lookups still missing (input for kb/rx_extra.py)
```

The build is deterministic: the same inputs give byte-identical output. It also checks that every Beers rule matches its research row and that no user-facing string uses banned wording such as "cause", "safe" or "stop taking" (docs/SPEC.md §3).

**Licensing.** The AGS Beers Criteria® content belongs to the American Geriatrics Society. The shipped KB (`src/kb/data`) stores drug names, classes, thresholds and recommendation categories with citations (doi:10.1111/jgs.18372) and Kinwise's own paraphrased rationale; it does not copy the AGS tables. The research extraction `research/beers-2023.json` keeps `recommendationText` close to the AGS wording for precision (see `research/beers-2023-notes.md`, Copyright). This is for educational, non-commercial use; any other use would need an AGS licence (see `research/regulatory.md`). The ACB scale is © Regenstrief Institute (see `research/acb-scale.json` → `license`). The knowledge base has not been reviewed by a licensed clinician or pharmacist.
