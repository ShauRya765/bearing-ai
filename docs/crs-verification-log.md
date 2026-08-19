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

---

## 2026-08-15 — gold answers for the eval correctness metric

**Not a ruleset audit.** This section records a different verification pass, but
it belongs in the same file for the same reason: numbers taken from IRCC, with
what was read and when, so a disputed figure has an answer that isn't someone's
recollection.

**What it is for.** `/eval` gained a correctness metric. Every other figure on
that page grades the system against `okf/`, so all of them read 100% on an
answer that is faithfully derived from a corpus card that is wrong — `judge.ts`
has said so in a comment since the faithfulness work. Correctness grades against
IRCC instead, which is the only way to catch that failure. The ground truth is
`GOLD` in `src/lib/eval/questions.ts`.

**Sources of truth,** all read 2026-08-15 (each page's own "Page details" date
noted where it was shown):

- Federal Skilled Worker Program —
  <https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/who-can-apply/federal-skilled-workers.html>
- Canadian Experience Class —
  <https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/who-can-apply/canadian-experience-class.html>
- Federal Skilled Trades Program —
  <https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/who-can-apply/federal-skilled-trades.html>
- Language requirements —
  <https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/documents/language-requirements.html>
- CRS criteria (page details 2026-06-22) —
  <https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/check-score/crs-criteria.html>
- Provincial nominees via Express Entry (page details 2026-05-21) —
  <https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/provincial-nominees/express-entry/eligibility.html>

**Coverage:** 48 of the 154 covered eval questions, 28 of them marked hard, 83
individual facts. Weighted toward numeric thresholds, where a wrong answer is
unambiguous rather than a matter of framing. No new questions were written — the
labels went onto questions that already existed, so the run-to-run diff of
recall and faithfulness stays honest.

**Facts recorded** (the ones worth restating here, because they are the ones a
plausible-sounding wrong answer gets wrong):

- Skilled work experience is **1 year continuous OR 1,560 hours total at 30
  hours/week** — the two are alternatives, not a single requirement. Hours above
  30/week are not counted. Volunteer work and unpaid internships do not count.
  FSW looks back **10 years**; CEC requires the experience in the **3 years
  before you apply** and it must have been performed **physically in Canada**.
- CEC excludes **self-employment** and work done while a **full-time student**,
  including co-op terms. FSW has no such exclusion for student work provided it
  was paid and continuous.
- **FST is 3,120 hours / 2 years**, not 1,560 — and requires either a job offer
  of at least 1 year **or** a certificate of qualification, not both.
- Per-program language floors differ and the corpus is a natural place to
  conflate them: FSW **CLB 7** in all four; CEC **CLB 7** for TEER 0/1 and
  **CLB 5** for TEER 2/3; FST **CLB 5** speaking/listening and **CLB 4**
  reading/writing.
- FSW selection grid is scored **out of 100 with a 67-point pass**, and the page
  states outright that these are *not* the CRS points.
- Additional points confirmed: nomination **600**, French **25** (NCLC 7+ with
  CLB 4 or lower, or no English test) or **50** (NCLC 7+ with CLB 5+ English),
  Canadian post-secondary **15** (one or two years) or **30** (three years or
  longer), sibling **15**, group maximum **600**. Job-offer points remain
  removed as of **2025-03-25**.
- Core maxima confirmed: **500** without a spouse, **460** with. Selected cells
  re-read for the gold set: age 30 = 105 and age 31 = 99 (without spouse), 45+ =
  0; master's 135/126; two-or-more-credentials 128/120 vs bachelor's 120/112;
  Canadian work 1 year 40 and 2 years 53, 5+ years 80/70; first-language CLB 9 =
  31/29 and CLB 8 = 23/22; second-language group cap 24/22.
- **Quebec does not have a provincial nominee program**, so the 600 points are
  not reachable that way.

**No defects found in the rulesets by this pass.** Every figure above that also
appears in `src/lib/crs/ruleset` matched it. That is a weaker statement than the
2026-07-31 audit — this pass read the cells the gold questions needed, not every
cell — so it does not move the `verified` flag.

**Deliberate omission:** `mustNotState` is kept sparse. The deterministic half of
the correctness check is a substring match whose hits force a score of zero, so
a forbidden string that a *correct* answer might use in passing ("it used to be
50 points", "CLB 6 isn't a threshold") would manufacture a failure. Only
distinctive wrong values that no correct answer would utter are listed;
everything subtler is left to the judge, which is instructed to count a
forbidden claim only when the answer asserts it as true.

**Shelf life.** These are facts as the pages stood on 2026-08-15. IRCC edits
them — job-offer points vanished outright in March 2025 — so a stale gold record
marks a *correct* answer wrong, which is the more dangerous direction for this
metric to fail. Re-read the pages before trusting a correctness delta that
crosses a long gap, and update `READ` in questions.ts when you do.
