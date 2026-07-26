# RAISE FIS — V1 CLI

A standalone command-line implementation of RAISE FIS (Fundraising Intelligence System) V1, as specified in
`RAISE_FIS_Master_Strategy_Operator_Manual.docx` and `RAISE_FIS_V1_Operating_Guide.md`. No database, no server —
it operates on a CSV file and calls the Claude API directly, matching the manual's explicit V1 guidance
("the simplest working stack is the right one... CSV plus Google Sheets keeps the system understandable and fast").

It automates the three steps of the operating guide that were previously manual:

1. **Extraction** — turn a transcript/summary into one validated JSON call record (Step 2).
2. **Add to master CSV** — validate against the taxonomy and append the row (Step 4), rejecting duplicate `call_id`s.
3. **Insight engine** — run the pattern-detection rules from the manual's Appendix C over the CSV and render a
   markdown brief, the same shape as `SuperSharp_Intel_Brief_20260702.md`.

## Setup

```bash
pnpm install
export ANTHROPIC_API_KEY=sk-ant-...
# optional: export ANTHROPIC_MODEL=claude-sonnet-4-6 (default)
```

## Commands

Run via `pnpm --filter @raisely/raise-fis cli <command> ...` or `cd packages/raise-fis && pnpm cli <command> ...`.

### `extract` — transcript/summary → validated JSON

```bash
raise-fis extract \
  --company propelr --founder "Fin Bullough" --investor "Dhruv Gupta" --firm "Pi Labs" \
  --call-type investor_pitch --date 2026-04-01 \
  --transcript transcripts/2026-04-01_Propelr_PiLabs.txt \
  --out extractions/propelr_pilabs_20260401.json
```

Calls Claude with the reconstructed extraction prompt (`prompts/extraction-prompt.md`), validates the JSON it
returns against the schema, and prints the Step 3 review checklist (thin evidence, generic advice, low
confidence) for you to check before approving.

### `add` — append a reviewed JSON record to the master CSV

```bash
raise-fis add --json extractions/propelr_pilabs_20260401.json --csv data/RAISE_FIS_master_calls.csv
# after correcting fields by hand:
raise-fis add --json extractions/propelr_pilabs_20260401.json --csv data/RAISE_FIS_master_calls.csv --status corrected --overwrite
```

`call_id` is the dataset's natural key — a second `add` for the same `call_id` is rejected unless `--overwrite`
is passed.

### `insights` — run the pattern-detection rules

```bash
# One company (matches the SuperSharp Intel Brief format)
raise-fis insights --csv data/RAISE_FIS_master_calls.csv --company supersharp

# Every company at once, one file each
raise-fis insights --csv data/RAISE_FIS_master_calls.csv --per-company-dir briefs/

# Cross-company market-wide signal scan
raise-fis insights --csv data/RAISE_FIS_master_calls.csv
```

Implements the thresholds from the manual's Appendix C:

- **Same-company pattern:** an objection category appearing in 3+ calls for one company.
- **Tight-window pattern:** 3+ of those within a single 14-day window (the manual's literal "two weeks" case).
- **Cross-company market-wide signal:** an objection category in 5+ calls spanning 2+ companies.
- **High-confidence insight:** 2+ `approved` records in the cluster with real (non-`not_discussed`) evidence
  snippets.
- **Trust gap:** the dominant objection cluster is a pattern *and* mean `interest_level` on those calls is ≥3.5 —
  i.e. interest is high but this objection isn't resolving (per the operating guide's twice-weekly scan: "Is
  `interest_level` consistently 4–5 but no next step materialising? That's a trust gap.").

`company` is derived from the `call_id` prefix (`{company}_{investor_firm}_{date}` — see the extraction prompt),
not a separate column, matching V1's decision to keep everything inside the call record rather than standing up
separate entity tables (that's V2).

`company_slug` must therefore be a single lowercase token with no underscores when you construct `call_id`s by
hand.

## Data

`data/RAISE_FIS_master_calls.csv` is seeded with the real Propelr + SuperSharp rows from the uploaded dataset, so
`insights` reproduces the SuperSharp Intel Brief's headline finding (the Satlantis 58% ownership stake as the
dominant, pattern-level objection) out of the box. Point `--csv` at your own file to work with a different
dataset — the CLI never assumes this specific path.

`data/supersharp_extractions_example.json` is the raw pre-CSV extraction output for those 7 SuperSharp calls —
useful as a worked example of what `raise-fis extract` should produce, and as fixture data if you want to test
`raise-fis add` against real records.

## Reference docs

`docs/operating-guide.md` is the original V1 operating guide this CLI automates, and
`docs/example-intel-brief-supersharp.md` is the human-written brief that `raise-fis insights` is checked against
in `src/__tests__/insights.test.ts`.

## What this intentionally does not do

Per the manual's "What to ignore early" (section 19) and the roadmap (section 16), this is V1 only: no persistent
founder/investor/fund entity tables, no database, no dashboard, no prediction. Those are V2+.
