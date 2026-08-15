import Link from "next/link";
import { EVAL_QUESTIONS, COVERED, UNCOVERED, HARD } from "@/lib/eval/questions";

// Explains how this RAG is evaluated — the method, not a live run.
//
// Every count on this page is derived from the eval set itself, never typed in
// prose: add a question and the numbers here follow. A hand-written "55
// questions" would be wrong the first time someone edits the set, and a page
// about measurement that misreports its own measurements is worse than no page.
//
// No numbers from an actual run appear here, deliberately. A recall figure is
// true of one corpus at one moment; pasting one into the UI creates a claim
// nobody re-checks. The command is shown instead, and the measured results live
// on /eval, where each figure is rendered from a saved, committed run artifact.

const MATCH_COUNT = 5;

// Real entries, looked up rather than retyped, with a fallback so rewording a
// question in the set can never leave this component asserting something the
// set no longer contains.
const WORDING_EXAMPLE =
  COVERED.find((q) => q.q.startsWith("I have two part-time jobs")) ?? COVERED[0];

const TWO_SOURCE_EXAMPLE =
  HARD.find((q) => q.expect.length > 1) ?? HARD[0] ?? COVERED[0];

const REFUSAL_EXAMPLE =
  UNCOVERED.find((q) => q.q.includes("proof of funds")) ?? UNCOVERED[0];

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <p className="font-mono text-xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <span className="mt-0.5 font-mono text-xs tabular-nums text-primary">{n}</span>
      <div className="min-w-0 flex-1 border-b pb-4">
        <h4 className="text-sm font-semibold">{title}</h4>
        <div className="mt-1.5 space-y-2 text-sm leading-relaxed text-muted-foreground">
          {children}
        </div>
      </div>
    </div>
  );
}

export function EvalMethod() {
  return (
    <section className="space-y-6">
      <div>
        <p className="mb-3 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.14em] text-primary">
          <span className="inline-block h-px w-5 bg-primary" />
          How the assistant is evaluated
        </p>
        <h3 className="font-heading text-xl font-semibold tracking-tight text-balance">
          If the right passage isn&apos;t retrieved, nothing downstream can save the
          answer.
        </h3>
        <p className="mt-3 max-w-[62ch] text-sm leading-relaxed text-muted-foreground">
          So the thing measured is the finder, not the writer. A fixed set of questions
          runs through retrieval, and each one is checked against the sources that
          genuinely answer it. No model is asked to grade itself, and no score depends
          on anyone&apos;s impression of how good an answer sounded.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat value={EVAL_QUESTIONS.length} label="questions in the set" />
        <Stat value={COVERED.length} label="answerable from the corpus" />
        <Stat value={HARD.length} label="marked hard" />
        <Stat value={UNCOVERED.length} label="should be refused" />
      </div>

      <div className="space-y-4">
        <Step n="01" title="Questions are worded like people, not like the source">
          <p>
            Each question is written the way someone would actually ask it — never in
            the vocabulary of the card that answers it. Retrieval that only works when
            the question echoes the source is keyword search wearing an embedding
            costume, and this is what catches it.
          </p>
          <div className="rounded-lg border bg-card p-3">
            <p className="text-sm text-foreground">
              &ldquo;{WORDING_EXAMPLE.q}&rdquo;
            </p>
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              must retrieve → {WORDING_EXAMPLE.expect.join(" · ")}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground/80">
              Note how few words the two have in common. The card talks in hours; the
              person talks about their two jobs.
            </p>
          </div>
        </Step>

        <Step n="02" title={`The score is recall@${MATCH_COUNT}`}>
          <p>
            Of the sources that genuinely answer a question, how many came back in the
            top {MATCH_COUNT} retrieved? One question expecting two sources that gets
            only one scores 0.5. A question counts once regardless of how many sources
            it expects — otherwise the handful of two-source questions would quietly
            dominate the average.
          </p>
          <p>
            Separately: how many questions got <em>every</em> expected source. That is
            the number that decides whether an answer could have been complete.
          </p>
        </Step>

        <Step n="03" title="Hard questions are scored on their own">
          <p>
            {HARD.length} of the {COVERED.length} answerable questions are marked hard:
            they use none of the card&apos;s words, span two cards, or sit close enough
            to a neighbouring card to plausibly retrieve the wrong one. Averaging them
            in with the easy ones lets a comfortable overall number hide a real
            weakness, so easy and hard are always reported apart.
          </p>
          <div className="rounded-lg border bg-card p-3">
            <p className="text-sm text-foreground">
              &ldquo;{TWO_SOURCE_EXAMPLE.q}&rdquo;
              <span className="ml-2 rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 align-middle font-mono text-[0.6rem] uppercase tracking-wider text-primary">
                hard
              </span>
            </p>
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              must retrieve → {TWO_SOURCE_EXAMPLE.expect.join(" · ")}
            </p>
          </div>
        </Step>

        <Step n="04" title="Questions the corpus can't answer are part of the set">
          <p>
            {UNCOVERED.length} questions are deliberately outside the rules the corpus
            covers, where the correct behaviour is to say so. These are the cases a RAG
            system fails silently and expensively, so they are scored, not assumed.
          </p>
          <div className="rounded-lg border bg-card p-3">
            <p className="text-sm text-foreground">
              &ldquo;{REFUSAL_EXAMPLE.q}&rdquo;
            </p>
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              must retrieve → nothing that would let it answer
            </p>
          </div>
          <p>
            One catch, stated rather than smoothed over: the search applies no
            similarity floor, so it returns {MATCH_COUNT} chunks for these questions
            too — they are simply the least-bad matches. Refusing is therefore entirely
            the prompt&apos;s job, and the only way to see whether it does its job is to
            generate the answers and check.
          </p>
        </Step>

        <Step n="05" title="What this measurement cannot see">
          <p>
            Recall says the right passage was in front of the model. It says nothing
            about whether the explanation built from it was clear, complete, or fairly
            worded. That is a judgement, so it is collected as one: every answer carries
            a Great / Bad rating, and a Bad has to come with a reason.
          </p>
          <p>
            None of this touches the score itself. Points come from the deterministic
            engine and IRCC&apos;s own tables — the assistant only explains and cites, so
            a retrieval miss costs you an explanation, never a wrong number.
          </p>
        </Step>
      </div>

      <div className="rounded-xl border border-primary/25 bg-primary/[0.06] p-5">
        <p className="text-sm font-semibold">Running it</p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          The eval runs in the terminal — one embedding call per question — and writes its
          results next to the corpus they scored, as a file in the repository rather than
          a number typed into a page.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg border bg-background p-3 font-mono text-xs text-foreground">
          npx tsx --tsconfig tsconfig.json scripts/bench-retrieve.ts --full --save
        </pre>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Retrieval only by default: recall belongs to the retriever alone, so scoring it
          needs no generation and costs no tokens.{" "}
          <code className="font-mono text-foreground/80">--full</code> also measures
          per-stage latency and whether the {UNCOVERED.length} out-of-corpus questions
          actually get refused;{" "}
          <code className="font-mono text-foreground/80">--save</code> commits the run.
        </p>
        {/* This component is the method; the numbers live on /eval, where each one
            is attributable to a saved run rather than to prose nobody re-checks. */}
        <Link
          href="/eval"
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          See the latest measured results
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  );
}
