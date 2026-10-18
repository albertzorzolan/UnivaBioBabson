# kb-src/build: one-off extraction and provenance scripts

These scripts were run once, around 2026-10-10 (the date recorded in their outputs), to turn public sources (the ACB card, STEADI/STOPPFall, the PIPC and
ThinkCascades papers, FDA labels via openFDA/DailyMed, RxNorm, MedlinePlus) into the sourced research files in
`kb-src/research/`. They are kept so anyone can see how each research file was made.

**`build_kb.py` does not run or import anything in this folder.** Rebuilding the knowledge base never needs them
(see [../README.md](../README.md)).

## What build_kb.py actually reads

- `kb-src/kb/`: `classes_src.py`, `drugs_src.py`, `drugs_extra_src.py`, `combos_src.py`, `rules_src.py`,
  `brand_report.json`, `rx_cache_known.json`, `rx_missing.json` and, if present, `rx_extra_cache.json`
- `kb-src/research/`: `beers-2023.json`, `acb-scale.json`, `cascades.json`
- `kb-src/CLINICAL-SOURCES.template.md` and, if present, `eval/results/meds-eval.json` (only to write `docs/CLINICAL-SOURCES.md`)

Of these, only `research/acb-scale.json` (from `build_acb.py`) and `research/cascades.json` (from `build_casc.py`)
come from this folder. `research/frids.json` (fall-risk classes) and `research/symptom-adr-map.json` (FDA-label
evidence, cited by the `EFFECTS_BY_CLASS` comment in `build_kb.py`) are reference research that `build_kb.py` does
not parse; the FRID classes in `kb/rules_src.py` are written by hand from the same sources (CDC STEADI, STOPPFall).
`research/beers-2023.json` was extracted separately (see `research/beers-2023-notes.md`); no script here produces it.

## Files

| File | Status | Role |
|---|---|---|
| `apis.py` | Current helper | Cached RxNav, openFDA and MedlinePlus requests (via `curl`). The cache lives in `build/cache/`, which was not committed, so a rerun calls the APIs again. |
| `labels.py` | Current helper | Picks one FDA label per generic and searches its sections with a regex. |
| `brandcheck.py` | Current helper | Checks that a brand name maps to the expected ingredient (RxNorm, then DailyMed). |
| `acb_data.py` → `build_acb.py` | Current | ACB 2012 card transcription → `research/acb-scale.json`. |
| `parse_pipc.py` | Current (inputs not committed) | Parses the PIPC table (PMC XML) and two BMJ 2026 tables into `pipc_rows.json`, `bmj_t3.json`, `bmj_t4.json`, which are committed. The downloaded inputs were not; the script expects them in `build/cascwork/`. |
| `verify_claims.py` → `claim_checks.json` | Current | FDA-label checks for statements in the cascade notes. |
| `casc_data.py`, `casc_rows.py` → `build_casc.py` | Current | Cascade definitions + the files above → `research/cascades.json`. |
| `frid_data.py` → `build_frids.py` | Current | Fall-risk drug classes → `research/frids.json`. |
| `sym_data.py` → `build_sym2.py` → `sym_build_tmp2.json` → `finalize_sym2.py` | Current | Symptom → drug-class label evidence → `research/symptom-adr-map.json`. |
| `build_sym.py` | Superseded by `build_sym2.py` | First version: kept only the first regex match per label section. |
| `finalize_sym.py` | Superseded by `finalize_sym2.py` | First version of the finalize step. |
| `sym_build_tmp.json`, `sym_build_tmp2.json` | Intermediate artefacts, kept for provenance | Raw output of `build_sym.py` / `build_sym2.py` before the finalize step. |
| `sym2review.txt` | Intermediate artefact, kept for provenance | Plain-text listing of the `build_sym2.py` label hits, used for manual review. The command that printed it was not committed. |

## Rerunning (not needed for the hackathon build)

Run from this folder (`cd kb-src/build`): the scripts import their helpers and read intermediate files from the
working directory. Output paths are relative to each script, and the `build_*` / `finalize_sym2.py` scripts
overwrite the committed files in `kb-src/research/`, so review `git diff` afterwards. Rerunning needs network
access and the inputs that were never committed: the API cache (`build/cache/`), the SNOMED CT lookup cache
(`kb-src/snomed/`) for the symptom scripts, and the `parse_pipc.py` downloads. Live API answers may also have
changed since 2026-10-10.
