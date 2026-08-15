"""Judged evaluation of the RAG pipeline, using RAGAS.

    uv run --project . python run_ragas.py --dataset <path.jsonl> [options]

Reads a dataset exported by scripts/export-eval-dataset.ts and writes a JSON
artifact the /eval dashboard renders alongside the deterministic metrics.

WHAT THIS ADDS, AND WHAT IT DOES NOT REPLACE
--------------------------------------------
The TypeScript eval already measures recall@k against hand-labelled expected
sources. That is deterministic, cheap, and grounded in real labels. Nothing here
replaces it — in particular RAGAS's own `context_recall` is deliberately NOT run,
because it infers recall from a reference answer via an LLM, which is strictly
weaker than comparing against labels a human wrote.

What RAGAS adds is the layer recall@k structurally cannot see: whether the answer
written from those chunks is grounded, relevant, and whether the chunks were
worth retrieving at all.

    faithfulness    Is every claim in the answer supported by the retrieved
                    chunks? This is the hallucination metric.
    answer_relevancy Does the answer actually address the question asked?
    context_precision Were the retrieved chunks relevant, or did the right one
                    arrive buried in noise? Fills the gap left by measuring
                    recall without precision.

All three are reference-free: they need no gold answers, which is why they are
the three that can run today.

THREE THINGS THAT MAKE THESE NUMBERS WEAKER THAN THE DETERMINISTIC ONES
-----------------------------------------------------------------------
1. They are produced by an LLM, so they are NOT reproducible. Two runs over
   identical inputs will disagree slightly. Never diff them the way recall is
   diffed, and never present them with the same authority.
2. The judge and the generator are both Gemini. A different family would have
   more independent blind spots; same-family judging shares them. The judge
   model is recorded in the artifact so this is always visible.
3. Out-of-corpus questions are EXCLUDED, not scored. A correct refusal makes no
   claims, so "how faithful is this to the context" has no meaningful answer, and
   scoring a refusal as 0 would punish exactly the behaviour we want. Refusal is
   measured separately and deterministically by bench-retrieve.
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

# Gemini's OpenAI-compatible endpoint. Used rather than a native Google client on
# ragas's own recommendation: its adapter auto-detection routes google clients
# through instructor, which has an upstream bug sending invalid safety settings
# (instructor#1658). This path avoids it and needs no extra provider SDK.
GEMINI_OPENAI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai/"

# A Pro model judges Flash's output. Not the same model as the generator: a judge
# grading its own output shares its blind spots exactly — a hallucination the
# generator found plausible when writing, it tends to find plausible when
# grading. Same family is still a weakness; it is recorded, not hidden.
DEFAULT_JUDGE = "gemini-pro-latest"

# Only used to compare generated questions against the original question, never
# against the corpus — so this needing to match the corpus's 768 dims is a
# false alarm. It doesn't touch the corpus.
DEFAULT_JUDGE_EMBEDDING = "gemini-embedding-001"

SCHEMA_VERSION = 1


def git_sha() -> str | None:
    try:
        return subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
    except Exception:
        return None


def load_dataset(path: Path) -> tuple[list[dict], dict]:
    """Returns (samples, sidecar metadata)."""
    rows = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    meta_path = path.with_suffix("").with_suffix(".meta.json")
    if not meta_path.exists():
        meta_path = Path(str(path).replace(".jsonl", ".meta.json"))
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    return rows, meta


def summarise(values: list[float]) -> dict:
    """Mean/median/min plus a count of how many samples actually scored.

    RAGAS returns NaN when a metric fails (a timeout, an unparseable judge
    response). Those are dropped rather than coerced to 0 — a failed measurement
    is not a score of zero, and averaging them in would understate the system for
    reasons that have nothing to do with the system. `scored` vs `total` makes
    the dropout visible instead of silent.
    """
    clean = [v for v in values if v == v]  # NaN != NaN
    if not clean:
        return {"mean": None, "median": None, "min": None, "scored": 0, "total": len(values)}
    return {
        "mean": round(statistics.fmean(clean), 4),
        "median": round(statistics.median(clean), 4),
        "min": round(min(clean), 4),
        "scored": len(clean),
        "total": len(values),
    }


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--dataset", required=True, type=Path, help="JSONL from export-eval-dataset.ts")
    p.add_argument("--out", type=Path, default=None, help="Output JSON (default: alongside dataset)")
    p.add_argument("--judge", default=os.environ.get("RAGAS_JUDGE_MODEL", DEFAULT_JUDGE))
    p.add_argument("--limit", type=int, default=None, help="Only the first N covered samples")
    p.add_argument("--workers", type=int, default=3, help="Concurrent judge calls")
    p.add_argument("--timeout", type=int, default=600, help="Per-call timeout, seconds")
    p.add_argument("--no-cache", action="store_true", help="Disable the on-disk judge cache")
    args = p.parse_args()

    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        print("GEMINI_API_KEY is not set. Source it from .env.local first.", file=sys.stderr)
        return 1

    from openai import AsyncOpenAI
    from langchain_openai import OpenAIEmbeddings
    from ragas import EvaluationDataset, RunConfig, SingleTurnSample, evaluate
    from ragas.cache import DiskCacheBackend
    from ragas.embeddings import LangchainEmbeddingsWrapper
    from ragas.llms import llm_factory
    from ragas.metrics import (
        Faithfulness,
        LLMContextPrecisionWithoutReference,
        ResponseRelevancy,
    )

    rows, ds_meta = load_dataset(args.dataset)

    # Judged metrics run on covered questions only — see the module docstring.
    covered = [r for r in rows if r.get("covered")]
    skipped = len(rows) - len(covered)
    if args.limit:
        covered = covered[: args.limit]
    if not covered:
        print("No covered samples in the dataset.", file=sys.stderr)
        return 1

    cache = None if args.no_cache else DiskCacheBackend()
    client = AsyncOpenAI(api_key=key, base_url=GEMINI_OPENAI_BASE)
    llm = llm_factory(args.judge, client=client, cache=cache)
    # The legacy embeddings interface, deliberately: the classic metrics call
    # embed_query(), which ragas's modern embedding classes do not implement.
    embeddings = LangchainEmbeddingsWrapper(
        OpenAIEmbeddings(
            model=DEFAULT_JUDGE_EMBEDDING,
            api_key=key,
            base_url=GEMINI_OPENAI_BASE,
            check_embedding_ctx_length=False,
        )
    )

    dataset = EvaluationDataset(samples=[
        SingleTurnSample(
            user_input=r["question"],
            retrieved_contexts=r["contexts"],
            response=r["answer"],
        )
        for r in covered
    ])

    print(f"Judging {len(covered)} covered samples with {args.judge}")
    print(f"  ({skipped} out-of-corpus samples excluded — refusal is measured deterministically)")
    print(f"  metrics: faithfulness, answer_relevancy, context_precision\n")

    started = datetime.now(timezone.utc)
    result = evaluate(
        dataset,
        metrics=[Faithfulness(), ResponseRelevancy(), LLMContextPrecisionWithoutReference()],
        llm=llm,
        embeddings=embeddings,
        run_config=RunConfig(timeout=args.timeout, max_workers=args.workers, max_retries=5),
        # A judge failure must not abort a run that costs this much; failures
        # surface as NaN and are counted in `scored` vs `total`.
        raise_exceptions=False,
        show_progress=True,
    )

    df = result.to_pandas()
    columns = {
        "faithfulness": "faithfulness",
        "answer_relevancy": "answerRelevancy",
        "llm_context_precision_without_reference": "contextPrecision",
    }

    per_question = []
    for i, row in df.iterrows():
        src = covered[i]
        per_question.append({
            "question": src["question"],
            "hard": src["hard"],
            "expect": src["expect"],
            "citations": src["citations"],
            **{
                out: (None if row[col] != row[col] else round(float(row[col]), 4))
                for col, out in columns.items()
            },
        })

    artifact = {
        "meta": {
            "schema": SCHEMA_VERSION,
            "startedAt": started.isoformat().replace("+00:00", "Z"),
            "gitSha": git_sha(),
            "judgeModel": args.judge,
            "judgeEmbeddingModel": DEFAULT_JUDGE_EMBEDDING,
            "ragasVersion": __import__("ragas").__version__,
            # Copied from the dataset so a judged score is always attributable to
            # the generator and corpus that produced the answers.
            "generationModel": ds_meta.get("generationModel"),
            "embeddingModel": ds_meta.get("embeddingModel"),
            "matchCount": ds_meta.get("matchCount"),
            "datasetStartedAt": ds_meta.get("startedAt"),
            "judged": len(covered),
            "excludedUncovered": skipped,
        },
        "summary": {
            out: summarise([float(v) for v in df[col].tolist()])
            for col, out in columns.items()
        },
        "questions": per_question,
    }

    out = args.out or Path(str(args.dataset).replace(".jsonl", ".ragas.json"))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(artifact, indent=2) + "\n")

    print("\n## Judged quality\n")
    for out_name in columns.values():
        s = artifact["summary"][out_name]
        mean = f"{s['mean']:.3f}" if s["mean"] is not None else "—"
        print(f"  {out_name:<18} mean {mean}   scored {s['scored']}/{s['total']}")

    worst = sorted(
        (q for q in per_question if q["faithfulness"] is not None),
        key=lambda q: q["faithfulness"],
    )[:5]
    if worst:
        print("\n  Least faithful answers:")
        for q in worst:
            print(f"    {q['faithfulness']:.2f}  \"{q['question'][:66]}\"")

    print(f"\nWrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
