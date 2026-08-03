# Rep worksheet — Path 2: the query path

Rules: no source files open. No search. No asking anyone. If you don't know,
write "DON'T KNOW" and keep going — a blank is data, a guess is a bug.
Timebox: 12 minutes writing, 8 minutes diffing. Stop at 20.

---

## Part A — narrate the path (write prose, not bullets)

A user types a question into the app. Trace it end to end until text appears on
their screen. Name every hop. Where you know a function or file name, use it.

> (write here)
as the user types a question function ask() is called in /app/(app)/rules/page.tsx.  inside the function the /ask/api is called with question. Inside the api route after all the checks askRulesStream() function is called which is located in retrieve.ts . which next calls retrieve() function. inside this function the question is embeded using gemini-embedding-001 model, after this the question embeding is searched in suparbase using match_rule_chunks and the matching rules embeddings are retrieved. After this, the prompt is build using buildPrompt function using the chunks as the input. with the buildprompt generateContentStream is called to generate the response. and the response is streamed with other performance metrics.

## Part B — the specific facts

Answer each in one line. No hedging, no "I think".

1. Which embedding model, and how many dimensions?
gemini-embedding-001 model and 768 dimensions.
2. What task type is the QUESTION embedded with?
TaskType is RETRIEVAL_QUERY (But can explain what this is?)
3. What task type were the DOCUMENTS embedded with, at ingest?
RETRIEVAL_DOCUMENT (Can you explain task type?)
4. Why are those two different? What breaks if you swap them?
I don't know
5. What is the name of the Postgres function that does the search?
match_rule_chunks
6. What two arguments does it take?
 query_embedding: queryEmbedding,
    match_count: MATCH_COUNT,
7. What distance operator does it use, and what metric is that?
<=>, i don;t know
8. What does it return that TypeScript never reads?
i don;t now
9. How many chunks come back?
5
10. Is there a minimum similarity threshold? If a user asks about pizza toppings,
    how many chunks come back?
    0
11. So where does refusal actually happen? Name the mechanism.
i don't know
12. Is there a vector index on this table? Why or why not?

13. What is one "chunk", physically? What produced it?
chunk looks like this: {
  content: string;
  source_title: string;
  source_url: string;
} 

## Part C — the question you'll be asked

Say this out loud, to a wall, in under 60 seconds:

"Walk me through what happens when a user asks your app a question."

Did you stall? Where?

> (write here)

when user input a question, that question at first is embeded using gemini-embedding-001 model same as the embedding of documents which in this case are the rules stored using OKF format. Then the retrievel is processed using a similarity search in the database and the operator used is <=>. After the retrieval, using the question and the rules the prompt is build and the response is generated using the gemini-3.6-flash model. and the response is streamed to the user along with the perfromance metrics. 

I listed every point in let's say HLD. but i don't know the working or why its used and how it does the tasks. 
---

## Diff (only now open the code)

Open, in this order:
- `src/lib/rag/retrieve.ts`
- `scripts/ingest.ts`
- the `match_rule_chunks` SQL (paste it into `supabase/` first — it isn't tracked)

For every miss, tag it:

| # | what I missed | DIDN'T KNOW / COULDN'T RETRIEVE / GUESSED WRONG |
|---|---|---|
|   |  |  |

**GUESSED WRONG rows get written out in full** — the wrong belief next to the
right one. Those are the ones that bite in an interview.

Then: schedule the COULDN'T RETRIEVE items for a rewrite in 3 days. Don't reread
them today; rereading right after a miss feels productive and teaches nothing.
