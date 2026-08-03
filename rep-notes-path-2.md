# Path 2 — the query path, mechanism notes

Companion to `rep-worksheet.md`. This is the *why*, not the *what*. The worksheet
established you know the hops; this file is the layer underneath them.

Read it once now. Do **not** reread it tomorrow — reread the worksheet questions
and try to regenerate these answers from scratch. Rereading this file will feel
like learning and won't be.

---

## 1. What a "task type" is

This is the one you asked about twice, so start here.

An embedding model turns text into a point in 768-dimensional space, trained so
that *related* text lands close together. The trap is that "related" is
ambiguous, and the ambiguity is exactly what breaks retrieval:

**A question and its answer are lexically dissimilar.**

> Question: *"Do I qualify for the STEM draw?"*
>
> Answer passage: *"Category-based selection rounds invite candidates with
> eligible work experience in STEM occupations..."*

Almost no shared vocabulary. Meanwhile that question *is* highly similar — word
for word — to other questions, and to text that is merely *about* qualifying.

So if you embed both sides identically, you get **symmetric** similarity, and
your query vector drifts toward text that *looks like a question* rather than
text that *answers* one.

Task type is the fix. It's a hint to the model that shifts the projection
**asymmetrically** — two different mappings into one shared space:

| Task type | Used on | Effect |
|---|---|---|
| `RETRIEVAL_DOCUMENT` | passages, at ingest | places a passage where questions *about it* will land |
| `RETRIEVAL_QUERY` | the user's question, at query time | places a question where its *answering passage* sits |

**Where this lives in your code:**

- `scripts/ingest.ts:27` — `taskType: "RETRIEVAL_DOCUMENT"`
- `src/lib/rag/retrieve.ts:124` — `taskType: "RETRIEVAL_QUERY"`

Same model (`gemini-embedding-001`), same 768 dims, deliberately different task
type. Your own comment on `retrieve.ts:118` calls this non-negotiable.

### What breaks if you swap them

**Nothing visible.** No error, no exception, no 400, no log line. Retrieval
quality quietly degrades and the app keeps answering.

That's the interview-relevant part: it's a *silent* failure, so the only way you
learn about it is recall@k in the eval harness — or from users getting subtly
wrong immigration advice. Name the silence when you answer this; it's what
separates "I read the docs" from "I've run this."

---

## 2. Cosine distance — what `<=>` actually does

`<=>` is pgvector's **cosine distance** operator: the angle between two vectors,
ignoring their magnitude.

- `0` = identical direction
- `1` = orthogonal (unrelated)
- `2` = opposite

**Why angle and not straight-line distance:** magnitude in embedding space
correlates with things you don't care about — text length, mostly. A long policy
document and a seven-word question shouldn't be judged far apart merely for
being different sizes. Angle asks "do these point the same way", which is the
question you actually mean.

Your SQL converts distance to similarity so the number reads the intuitive
direction (higher = better):

```sql
1 - (embedding <=> query_embedding) as similarity
order by embedding <=> query_embedding
limit match_count
```

Note the `order by` uses raw **distance** ascending — nearest first.

---

## 3. The `similarity` value you compute and throw away

The SQL returns five columns: `id`, `content`, `source_url`, `source_title`,
`similarity`.

The TypeScript that consumes it (`retrieve.ts:83`) declares three:

```ts
interface RuleChunk {
  content: string;
  source_title: string;
  source_url: string;
}
```

So `similarity` crosses the wire and is discarded. Postgres computes the
relevance score for every row; nothing in the application ever looks at it.

This is not a style nit — it's *why* section 4 is true. You cannot filter on a
number you never read.

---

## 4. There is no threshold. This is the most important fact in the path.

`match_rule_chunks` does exactly this and nothing more:

```sql
order by embedding <=> query_embedding
limit match_count
```

No `where similarity > 0.7`. No filter of any kind. It is a pure ranking.

**Consequence:** ask this app about pizza toppings and you get **five chunks**
back — about provincial nomination, language testing, whatever happens to be
least-far in a corpus that contains nothing relevant. Returned confidently, at
full volume, with citations attached.

`MATCH_COUNT = 5` (`retrieve.ts:91`) is exported specifically so the eval harness
can assert this — that every out-of-corpus query still returns k chunks. The
comment on lines 89–90 says so.

### So where does refusal happen?

In the prompt string. `retrieve.ts:105`:

> "Answer the question using ONLY the numbered sources below. If the sources
> don't contain the answer, say so plainly — do not use outside knowledge."

That's the entire refusal mechanism: one English sentence talking a language
model out of using five irrelevant chunks it was just handed.

**The dead branch.** `retrieve.ts:248` checks `chunks.length === 0` and yields
`NO_MATCH_MESSAGE`. It looks like refusal logic. It isn't — it can only fire when
the **table is empty**, because a non-empty table always returns 5 rows. In
normal operation it is unreachable.

**Why this matters for this product specifically:** the differentiator is not
giving people wrong immigration answers. The gate (`gate.ts`) enforces that
deterministically for *scoring*. For *retrieval*, the equivalent guarantee is
currently one sentence of English. Knowing that — and being able to say it
without flinching — is worth more in an interview than claiming the system is
airtight.

---

## 5. No vector index, on purpose

There is no `ivfflat`, no `hnsw`. Every query is an exact sequential scan over
every row.

This was a decision, not an omission: `ivfflat` was tried and **silently dropped
rows from results** — an approximate index returning incomplete answers. At a few
hundred concepts an exact scan is single-digit milliseconds and, more
importantly, **complete**.

The tradeoff to name out loud: exact scan is O(n), so this stops being free in
the thousands. `hnsw` becomes worth revisiting then — followed by re-verifying
completeness, because that's the property that broke last time.

---

## 6. What one "chunk" physically is

Not the TypeScript interface — that's the shape of the row after it comes back.
Physically:

**One chunk = one entire OKF concept body.** The whole markdown file below the
frontmatter, embedded as a single vector.

`scripts/ingest.ts:56`:

```ts
embedding: await embed(concept.body)
```

One concept in, one row out, one vector. **There is no chunker.** The word
"chunk" in `rule_chunks` and `RuleChunk` is a name inherited from the general RAG
pattern; in this system the unit is a document.

That's a real design consequence, not trivia: retrieval granularity is fixed at
whatever size you wrote the OKF concept. A long concept dilutes its own
embedding — one vector averaging several topics — which is why
`src/lib/eval/questions.ts:120` notes concepts were deliberately split so each
embedding covers one topic.

---

## The compression

If you keep one thing:

> **Retrieval ranks, it never filters.** Five chunks come back for every
> question, relevant or not; the similarity score is computed in Postgres and
> discarded in TypeScript; refusal is a sentence in the prompt, not a property of
> the system. The task-type asymmetry is what makes the ranking any good, and
> swapping it fails silently.

Say that out loud until it's fluent. It's the highest-value sixty seconds you own
about this codebase.
