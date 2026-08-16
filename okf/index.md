---
type: bundle
title: True Bearing rules bundle
description: Canadian immigration rules for Express Entry, structured as OKF concepts.
timestamp: 2026-08-15T00:00:00Z
---

Concepts are grouped by kind: [programs](/programs), [requirements](/requirements),
and [concepts](/concepts) for cross-cutting rules. Every concept carries its
canonical IRCC source in `resource`.

## Scope

The bundle covers what decides a candidate's **score and eligibility**: the three
Express Entry programs, what counts as skilled work experience, the language and
education requirements, the CRS tables, how rounds of invitations work, the
selection categories, and Ontario's Workforce Priority stream.

It deliberately does **not** cover the documents-and-process half of an
application: fees, proof of funds, medical exams, police certificates, dependants
and family composition, appeals, processing times, PR card renewal, travel during
processing, or how long a language test result stays valid. Those are real
questions with real answers on canada.ca — they are simply outside what this
product computes, and the correct behaviour when asked is to say so rather than
improvise.

That boundary is load-bearing for the evaluation. `src/lib/eval/questions.ts`
holds out-of-corpus questions drawn from exactly those topics and scores the
system on whether it refuses them. Adding a card on any of them would make those
questions answerable and silently retire the refusal metric, so the exclusion is
a scope decision to make on purpose, in this file, rather than by accident in a
commit that adds a helpful-looking card.

## Growth log

- 2026-07 — 16 concepts. Federal CRS factors plus one provincial stream (OINP).
- 2026-08-15 — 62 concepts. Added the FSW and FST programs, the eligibility
  requirements behind all three programs (TEER, NOC, ECA, per-program language
  floors and look-back windows), the CRS tables as individual cards (age,
  education, Canadian work experience, spouse factors, additional points), the
  FSW 67-point selection grid, how rounds work, and one card per selection
  category. The point was to make recall@k mean something: with 16 sources and
  k=5, a third of the corpus comes back for every query.
