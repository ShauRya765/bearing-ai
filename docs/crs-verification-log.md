# CRS ruleset verification log

Every audit of `src/lib/crs/ruleset` against IRCC's published charts, and every
defect it turned up. Append a new section per audit; never edit a closed one.

Rationale: the rulesets carry a `verified: false` flag, but a boolean says
nothing about *what* was checked, *against what*, or *what was wrong before*.
This file is that record. When a number in the engine is ever disputed, this is
where the answer lives.

---

## 2026-07-31 — full audit against the published CRS criteria page

**Source of truth:** IRCC, "Express Entry: Comprehensive Ranking System (CRS)
criteria" —
<https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/check-score/crs-criteria.html>
(PDF capture accessed 2026-07-31; text extracted from the PDF content streams,
not retyped).

**Ruleset audited:** `ruleset_2026_06` (which `ruleset_2026_07` inherits its
point tables from wholesale, so both were affected).

**Method:** every cell of every published table — both the "with a spouse or
common-law partner" and "without" columns — transcribed into
`src/lib/crs/ruleset/official-tables.test.ts` and asserted against the ruleset.
12 tests; 5 failed on the first run.

### Scope of coverage — no missing factors

Every factor IRCC scores is present in the engine, and every one is reachable
from the assessment form:

- **A. Core / human capital** — age, level of education, first official
  language, second official language, Canadian work experience.
- **B. Spouse or common-law partner factors** — education, official language
  proficiency, Canadian work experience.
- **C. Skill transferability** — all five combinations (education + language,
  education + Canadian work, foreign work + language, foreign work + Canadian
  work, certificate of qualification + language).
- **D. Additional points** — sibling in Canada, French-language skills,
  post-secondary education in Canada, provincial/territorial nomination.

Arranged employment / job offer is correctly **absent**. IRCC removed the
200-point (NOC Major Group 00) and 50-point (any other skilled occupation)
awards on 2025-03-25. `official-tables.test.ts` now asserts that nothing
reintroduces them.

### Defects found

#### D1 — age 18 and 19 wrong in **both** age tables

`ageSingle` held `18: 90, 19: 95`. Those are the *with-spouse* values, copied
into the single column. `ageWithSpouse` held `18: 82, 19: 91` — numbers that
appear nowhere in IRCC's chart.

| Age | single (was → is) | with spouse (was → is) |
| --- | --- | --- |
| 18 | 90 → **99** | 82 → **90** |
| 19 | 95 → **105** | 91 → **95** |

**Impact:** an 18-year-old single applicant was under-scored by 9 points, a
19-year-old by 10. Under-scoring is the dangerous direction here: it makes the
gate report a candidate as short of a cutoff they actually clear.

**Why it survived:** ages 20–44 were all correct, and every existing test used
an applicant aged 25 or 29. The two lowest rows were never exercised.

#### D2 — second-language cap ignored the with-spouse column

IRCC caps the *combined* second-language total at **22** with a spouse and
**24** without (per-ability values are identical at 6 either way). The ruleset
had a single `secondLanguageCap: 24`, applied unconditionally, and
`crs-core.ts` hardcoded `max: 24` in the factor breakdown.

**Impact:** up to 2 points over-scored for an accompanying-spouse applicant at
CLB 9+ across all four second-language abilities. It also made the with-spouse
ceiling compute to 502 against IRCC's published 500.

**Fix:** added `secondLanguageCapWithSpouse: 22`; `crs-core.ts` selects on
`spouseAccompanying` and the breakdown's `max` reads from the ruleset.

#### D3 — additional points had no ceiling

IRCC caps the whole additional-points group at **600**. Nothing enforced it.

**Impact:** a provincially-nominated applicant who also had a sibling in
Canada, Canadian post-secondary study and strong French scored
600 + 15 + 30 + 50 = **695**. A nomination alone exhausts the group, so those
other points should be absorbed, not added.

**Fix:** `additional.cap: 600`, applied in `scoreAdditional`.

**Note:** this one was not predicted by reading the tables — it was caught by
the ceiling assertion in the test. Worth remembering: assert the published
*totals*, not only the individual cells. The arithmetic check is what found it.

#### D4 — hardcoded maxima in the factor breakdown

`crs-core.ts` hardcoded `max: 24` (second language) and `max: 600` (additional
points), so the with-spouse breakdown displayed the wrong denominators even
where the points themselves were right. Both now read from the ruleset.

### Verified correct — no change needed

- Level of education, all 8 levels, both columns.
- First official language, per-ability, both columns (incl. the `< CLB 4` → 0 case).
- Canadian work experience, 0–5+ years, both columns.
- All spouse-factor tables and their section maxima (education 10, language 20,
  Canadian work 10; 40 total).
- All five skill-transferability tables, the 50-point per-category caps, and the
  100-point total cap.
- All additional-point values: sibling 15, French 25/50, Canadian study 15/30,
  provincial nomination 600.
- Section totals now reconcile exactly: 500 core without a spouse; 460 core +
  40 spouse factors with one.

### Coverage gap closed (same day, follow-up)

The certificate-of-qualification row was verified as *data* — 25 / 50 and the
50-point category cap all matched — but no test ran a tradesperson through
`scoreCore` to confirm the engine selects the right tier. The values being
right in the ruleset says nothing about the branch that reads them.

Closed by "certificate of qualification: 50 at CLB 7+ ..." in
`crs-core.test.ts`, which pins all five cases: CLB 7+ on all four → 50; CLB 5+
with one ability under 7 → 25; a single ability under CLB 5 → 0; and no
certificate → 0. No defect found — the engine was already correct.

The general lesson, and the reason this is written down: **a passing data
assertion is not coverage.** Two of the four defects above (D2, D4) were in
engine code, not in the tables. Audit both.

### Still unverified after this audit

`verified` stays **`false`** on both rulesets. This audit covered the CRS
*points* tables only. The test-score → CLB conversion tables (IELTS, CELPIP,
PTE, TEF, TCF) come from a different IRCC page —
<https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/documents/language-test.html>
— and have not been checked cell by cell. Those tables sit *upstream* of every
language-derived number in the engine, so an error there propagates further
than anything fixed above. That is the next audit.

Open question flagged in `ruleset-2026-06.ts` and still open: whether IELTS
listening 7.0 is CLB 7 or CLB 8. Sources disagree; IRCC's own chart decides it.

---

## 2026-07-31 — gap levers: correct delta, misleading copy

Not a ruleset defect. Recorded here because it is the same failure mode from
the other side: the number was right and the presentation made it look wrong.

**Reported:** the "Earn a certificate of qualification" lever showed **+12**
beside copy reading "worth up to 50 skill-transferability points with CLB 7+".

**Diagnosis — the +12 was correct.** On the profile in question, skill
transferability already stood at **88 of 100** (education 50 + foreign work
38). The certificate is genuinely worth 50, but only 12 fit under the
100-point group cap. `gapLevers` computes deltas as real counterfactual
re-runs of the engine, so it reported the true marginal gain.

**The defect was the sentence next to it.** `requirement` was static copy
describing the factor in the abstract, with no knowledge of the profile it was
shown against. A user reading "+12" and "up to 50" together reasonably
concludes the calculator is broken — and exact deltas are the entire
differentiator, so this erodes trust in the one thing that should earn it.

**Fixes:**

1. `Lever.cappedBy` — set when a lever moves a factor to its own maximum.
   Derived, not hardcoded: `consider()` diffs the base and counterfactual
   factor lists, finds a factor that ended pinned at `max` having started
   below it, and names it — "Your skill transferability is already at 88/100,
   so only 12 of these points fit before the cap." It quotes the *factor's*
   gain, not the total delta, because a lever can move several factors at once
   (the French lever moves both second language and additional points).
2. The trade-certificate `requirement` now states both tiers (50 at CLB 7+, 25
   at CLB 5+) rather than a vague "up to 50".
3. `ImprovementSuggestions.tsx` renders `cappedBy` under the requirement.

Covered by "a lever whose points don't fit under a cap says so" in
`levers.test.ts`, which pins both directions: the capped profile gets +12 with
the note, and a profile with headroom gets the full +50 and no note.

**Worth noting:** this surfaced *because* the audit above added the missing
600-point additional-points cap and got the section totals reconciling. Caps
that actually bind are what make marginal deltas smaller than headline factor
values — so expect more of these as ceilings are enforced correctly. Any lever
whose delta is smaller than its headline value now has to explain itself.
