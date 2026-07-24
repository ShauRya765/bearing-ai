@AGENTS.md

# Bearing AI

AI immigration assessment for Canadian PR applicants (end users first; RCICs later, using user traction as proof). Next.js 15 App Router, TypeScript strict, Tailwind v4, Supabase pgvector, Gemini.

## Architecture rules — non-negotiable
- Deterministic engine (src/lib/crs) computes ALL numbers. An LLM never computes a score.
- RAG (src/lib/rag) explains and cites. Answers ONLY from retrieved chunks; refuses when corpus doesn't cover it.
- All IRCC numeric values live in versioned rulesets (src/lib/crs/ruleset), flagged verified: false until a human checks every cell against canada.ca. Engine code never hardcodes a threshold.
- THE GATE: never benchmark a candidate against a draw cutoff unless they're eligible for that draw's category (src/lib/crs/engine/gate.ts). This is the core differentiator.
- Knowledge lives in the OKF bundle (okf/ — markdown + YAML frontmatter, typed edges: requires/feeds_into/boosts). It feeds RAG ingestion. sources.ts is deleted; never resurrect it.

## Stack facts
- Node 22 via nvm (.nvmrc). Embeddings: gemini-embedding-001, 768 dims, RETRIEVAL_DOCUMENT for ingest / RETRIEVAL_QUERY for queries — must match or vectors don't compare.
- Generation: gemini-flash-latest by default (override with GEMINI_GENERATION_MODEL — but a specific pinned id like gemini-2.5-flash 404s for newer API keys; only pin to an id your key can call), streaming, maxOutputTokens capped in src/lib/rag/retrieve.ts. Free tier = no commercial use (launch blocker).
- pgvector: NO index at current scale (ivfflat dropped rows — real bug we hit). Add hnsw only past ~thousands of chunks, then re-verify completeness.
- service_role key is server-only. Client goes through API routes.
- Keys in .env.local: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY.

## Commands
- Tests: npx tsx --tsconfig tsconfig.json <test file>  (node:test, no framework)
- Ingest: npx tsx scripts/ingest.ts (idempotent). Debug retrieval: scripts/debug-retrieve.ts
- Dev: npm run dev (Turbopack removed — it panicked; don't re-add)

## Style
- Light theme. Design tokens in globals.css: warm off-white surfaces, near-black ink, amber (`--primary`) signal accent used sparingly, `--color-clear` (green) as the one bespoke semantic beyond shadcn's tokens. Mono (Geist Mono, actually loaded via next/font) for scores. Space Grotesk display (`font-heading`), Inter body.
- UI components: shadcn/ui (`src/components/ui`, `base-nova` style on `@base-ui/react` primitives — components.json). Aceternity-derived effects live directly in `src/components` (`Spotlight.tsx`, `HoverBorderGradient.tsx`), recolored to the amber accent and used sparingly per design intent (this is a data-entry tool, not a marketing page).
- Numeric inputs go through `src/components/NumberField.tsx`, not raw `<input type="number">` — it fixes the "type 10, get 010" controlled-input bug and clamps to min/max while typing.
- Prove logic with tests before UI. Rule values are data, not code.

## In flight
- Just added: CELPIP/PTE/TEF/TCF tables (UNVERIFIED), second-official-language points, derived French bonus (frenchClb7Plus toggle removed), per-test language form UI (test picker + per-skill ranges), a full light-theme/shadcn/Aceternity redesign, and the spouse/common-law-partner factor (with-spouse core tables + separate capped "Spouse factors" group — engine + tests only, no form UI yet). Cross-checked several tables against IRCC's own "Check your score" worked example (canada.ca, accessed 2026-07-16) — this caught and fixed a real bug: education-transferability was missing the "two or more credentials / advanced degree" tier and was underscoring Master's/doctoral/two-or-more-credential holders (13/25 instead of the correct 25/50). See crs-core.test.ts's worked-example test for the source numbers.
- Next: spouse fields in the form UI; gap levers (counterfactual re-runs of the engine, one variable perturbed — exact deltas, never LLM-estimated).
- Later: OKF corpus expansion, persistence, rate limiting on /api/ask, paid Gemini before launch.
- Deferred (cost, only if /api/ask hits thousands/day): exact-match answer cache keyed on (normalized question + corpus version), TTL'd, busted on ingest — NOT semantic caching. At current scale ~$0.002/question, so not worth the staleness risk yet.