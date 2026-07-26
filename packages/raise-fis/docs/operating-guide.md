# RAISE FIS — V1 Operating Guide
*How to run the system, step by step*

---

## After every investor call

**Step 1 — Choose your input: summary or full transcript**

Use the **Granola summary** by default — it's fast, already structured, and sufficient for most calls.

Pull the **full transcript** when:
- The call is high-stakes (second or third meeting, term sheet conversation, a fund you really want)
- The confidence score comes back below 3
- You want to verify an exact quote for an evidence snippet

Note: for calls where the investor spoke very little (e.g. a second call that was mostly a pitch), the full transcript adds little extra value — the summary captures what matters.

Save a copy in your raw transcripts folder, named:
`YYYY-MM-DD_CompanyName_InvestorName.txt`

**Step 2 — Run the extraction**
Open Cowork (or a Claude conversation). Paste the full extraction prompt from `RAISE_FIS_V1_Extraction_Prompt.md`, then paste the transcript below it. Claude returns one JSON object.

**Step 3 — Review the JSON**
Before adding it to the CSV, check:
- Do the evidence snippets actually support the extracted conclusions?
- Is the `top_objection` the real objection, or just the first one mentioned?
- Does `suggested_improvement` feel specific and actionable, or generic?
- If anything is wrong, correct it directly in the JSON.

**Step 4 — Add the row to the master CSV**
Open `RAISE_FIS_master_calls.csv` in Google Sheets. Add one new row by copying the JSON fields into the matching columns. Change `status` from `pending` to `approved` (or `corrected` if you changed anything).

---

## Twice a week (5 minutes)

Scan the last 3–5 rows of the CSV. Ask:
- Is the same `objection_category` appearing more than twice for the same company?
- Is `interest_level` consistently 4–5 but no next step materialising? That's a trust gap.
- Are `triggers_that_worked` clustering around the same proof point? Lean into it.

---

## Weekly (20–30 minutes)

Review all rows added that week. For each company being actively fundraised:
- What is the most common objection category?
- Which pillar scores are consistently low?
- What does `suggested_improvement` say across multiple calls — is there a pattern?

Write 2–3 sentences of notes. These become the brief for the founder before the next batch of calls.

---

## Score reference

| Score | Meaning |
|-------|---------|
| 1 | Very weak |
| 2 | Below average |
| 3 | Average |
| 4 | Strong |
| 5 | Exceptional |

---

## Objection category taxonomy

`team` · `product` · `market` · `traction` · `valuation` · `timing` · `GTM` · `defensibility` · `business_model` · `other`

---

## Status values

| Status | Meaning |
|--------|---------|
| pending | Just extracted, not yet reviewed |
| approved | Reviewed and confirmed accurate |
| corrected | Reviewed and manually edited |

---

## Pattern thresholds (from the master strategy)

- **Same company:** if the same objection category appears 3+ times in 2 weeks → treat as a pattern, not noise.
- **Across companies:** 5+ similar objections from related investor types → potential market-wide signal.
- **High-confidence insight:** at least 2 approved records with clear evidence snippets.

---

## Folder structure (recommended)

```
RAISE FIS/
├── RAISE_FIS_master_calls.csv        ← the master dataset (open in Google Sheets)
├── RAISE_FIS_V1_Extraction_Prompt.md ← the extraction prompt
├── RAISE_FIS_V1_Operating_Guide.md   ← this file
└── transcripts/
    ├── 2026-04-07_Propelr_PiLabs.txt
    ├── 2026-04-08_CompanyName_InvestorName.txt
    └── ...
```

---

## What you are building toward

Each approved row is a unit of proprietary intelligence. After 10–15 calls per company you will have enough data to answer: *what is consistently blocking this raise, and what should change?* After 30–50 calls across multiple companies, cross-founder patterns emerge. That is when the system becomes genuinely predictive.

---
*RAISE FIS V1 — Operating Guide — April 2026*
