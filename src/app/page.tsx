import Link from "next/link";
import { Spotlight } from "@/components/Spotlight";
import { GateAnimation } from "@/components/GateAnimation";
import { TrackView } from "@/components/TrackView";
import { GATE_CATEGORIES } from "@/components/gate-rows";
import type { DrawCategory } from "@/lib/crs/ruleset/types";
import { ruleset_2026_08 as ruleset } from "@/lib/crs/ruleset/ruleset-2026-08";
import { loadHistory } from "@/lib/eval/runs-store";
import { ms, pct, runDate } from "@/lib/eval/format";
import { SITE_DESCRIPTION, SITE_NAME, absoluteUrl } from "@/lib/site";

const structuredData = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE_NAME,
  url: absoluteUrl("/"),
  description: SITE_DESCRIPTION,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Any",
  browserRequirements: "Requires JavaScript",
  inLanguage: "en-CA",
  isAccessibleForFree: true,
  audience: {
    "@type": "Audience",
    audienceType: "Canadian permanent residence applicants",
  },
};

// The landing page sits outside the (app) route group on purpose, so it renders
// full-bleed instead of inside the sidebar Shell. Server component — nothing
// here is interactive, and the draw figures come straight off the ruleset so
// they can never drift from what the engine actually benchmarks against.

const PRINCIPLES = [
  {
    n: "01",
    title: "Code does the math, not AI",
    body: "Your score is worked out using IRCC's own point tables, written as code and checked by tests. AI never adds up a number. You need a score you can trust, not one that sounds about right.",
  },
  {
    n: "02",
    title: "Every answer shows where it came from",
    body: "Ask why a rule works the way it does and you get an answer built only from official rule pages, each with a link to canada.ca. If the rules don't cover your question, it tells you — it doesn't guess.",
  },
  {
    n: "03",
    title: "We show the exact gain, not a guess",
    body: "“+18 points if you reach CLB 9” comes from working out your score again with one thing changed, then taking the difference. It's the real number, not a rule of thumb.",
  },
];

// Landing-page eval figures, read off the newest committed run artifact — the
// same file /eval renders. They were hardcoded here until 2026-08-18 and went
// stale twice (a "top-5" note survived the move to k=3, and the tiles still
// quoted a 55-question set long after it reached 164). Deriving them means a
// figure on the marketing page cannot outlive the run that produced it.
//
// Phrasing is deliberately end-user: "sources" not "chunks", no p95s. Anyone who
// wants the engineering view follows the link to /eval, which has all of it.
function evalHighlights() {
  const { latest } = loadHistory();
  if (!latest) return null;

  const { summary, generation, meta } = latest;
  const endToEnd = generation?.latency.find((l) => l.stage === "End to end");
  const correctness = generation?.correctness;
  const refusals = generation?.refusals;

  const tiles: { v: string; label: string; note: string }[] = [
    {
      v: pct(summary.overall.recall, 0),
      label: "Of the sources a question needed, how many it found",
      note: `${summary.overall.total} in-scope questions, ${meta.questions.hard} of them worded to be deliberately awkward`,
    },
  ];

  if (refusals) {
    tiles.push({
      v: `${refusals.refused}/${refusals.total}`,
      label: "Off-topic questions it refused to answer",
      note: "Fees, medicals, appeals, processing times — none are in the rule library",
    });
  }

  if (correctness) {
    tiles.push({
      v: pct(correctness.score, 0),
      label: "Answers judged correct against canada.ca",
      note: `Graded on the ${correctness.gold} questions with an official answer written down, not against our own library`,
    });
  }

  if (endToEnd) {
    tiles.push({
      v: ms(endToEnd.p50),
      label: "Typical time to a full cited answer",
      note: "Measured end to end, one machine at a time",
    });
  }

  return {
    tiles,
    questions: meta.questions.total,
    corpus: meta.corpus.sources,
    gitSha: meta.gitSha,
    measuredOn: runDate(meta.startedAt),
  };
}

export default function Landing() {
  const evals = evalHighlights();

  // Resolve the animation's cutoffs here, on the server, so the client gets six
  // integers instead of the whole ruleset. recentDraws is newest-first, so the
  // first hit per category is the latest round — the same rule runGate applies.
  const cutoffs: Partial<Record<DrawCategory, number>> = {};
  for (const draw of ruleset.recentDraws) {
    if (!GATE_CATEGORIES.includes(draw.category)) continue;
    if (cutoffs[draw.category] === undefined) cutoffs[draw.category] = draw.cutoff;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TrackView name="home_view" />
      {/* Structured data. Deliberately limited to claims that are true today —
          no ratings, no review counts, no price. Fabricated rich-result fields
          are the fastest way to earn a manual action. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      {/* ---------- top nav ---------- */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-6 px-6">
          <Link href="/" className="flex items-baseline">
            <span className="font-heading text-lg font-bold tracking-tight">
              True Bearing
            </span>
            <span className="ml-0.5 font-heading font-bold text-primary">.</span>
          </Link>
          <nav className="ml-auto flex items-center gap-6 text-sm">
            <Link
              href="/how-it-works"
              className="hidden text-muted-foreground transition-colors hover:text-foreground sm:block"
            >
              How it works
            </Link>
            <Link
              href="/rules"
              className="hidden text-muted-foreground transition-colors hover:text-foreground sm:block"
            >
              Rules
            </Link>
            <Link
              href="/eval"
              className="hidden text-muted-foreground transition-colors hover:text-foreground sm:block"
            >
              Evaluation
            </Link>
            <Link
              href="/assessment"
              className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Open assessment
            </Link>
          </nav>
        </div>
      </header>

      {/* ---------- hero ---------- */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[36rem] overflow-hidden">
          <Spotlight className="-top-20 left-0" />
        </div>

        <div className="relative mx-auto max-w-5xl px-6 py-24 sm:py-32">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 font-mono text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Express Entry · Ruleset {ruleset.version}
            </span>

            <h1 className="mt-7 font-heading text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl">
              Know exactly where you
              <br />
              stand in the pool.
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              We work out your CRS score using IRCC&apos;s own tables, show you
              where every point came from, and{" "}
              <span className="text-foreground">
                never compare you to a draw you can&apos;t be picked from.
              </span>
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link
                href="/assessment"
                className="group inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                Calculate my CRS score
                <span className="transition-transform group-hover:translate-x-0.5">
                  &rarr;
                </span>
              </Link>
              <Link
                href="/how-it-works"
                className="inline-flex items-center gap-2 rounded-full border border-border px-6 py-3 text-sm text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground"
              >
                See how it works
              </Link>
            </div>

            <p className="mt-6 font-mono text-xs text-muted-foreground/70">
              No account. No email. Your answers never leave your browser — we
              only count how many people use each page.
            </p>
          </div>
        </div>
      </section>

      {/* ---------- the gate ---------- */}
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-primary">
            The gate
          </p>
          <h2 className="mt-4 max-w-3xl font-heading text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            Most calculators compare you to draws you can&apos;t even enter.
          </h2>
          <p className="mt-5 max-w-2xl leading-relaxed text-muted-foreground">
            Since 2024, nearly every Express Entry draw has been for a specific
            group — healthcare, trades, French speakers, people with Canadian work
            experience. You can only be picked from a group you belong to. So if a
            tool shows you beating the healthcare cutoff when you don&apos;t work
            in healthcare, it isn&apos;t being hopeful. It&apos;s wrong, and
            it&apos;s why people wait for an invitation that was never coming.
          </p>

          <div className="mt-10">
            <GateAnimation cutoffs={cutoffs} />
          </div>

        </div>
      </section>

      {/* ---------- how it works ---------- */}
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-primary">
            How it works
          </p>
          <h2 className="mt-4 max-w-3xl font-heading text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            Ask in your own words. Get the rule, and where it came from.
          </h2>
          <p className="mt-5 max-w-2xl leading-relaxed text-muted-foreground">
            You don&apos;t have to know the official terms. Ask &ldquo;do I need to
            redo my IELTS?&rdquo; and it finds the rule about test validity, even
            though the two share almost no words. If the rules don&apos;t cover
            your question, it says so instead of guessing.
          </p>

          <div className="mt-8 rounded-xl border border-primary/25 bg-primary/[0.06] p-5 text-sm leading-relaxed">
            <span className="font-semibold text-primary">
              The AI never decides anything.
            </span>{" "}
            Your score comes from a fixed calculator built on IRCC&apos;s tables.
            The assistant only explains and points at sources — it never does the
            math.
          </div>

          <Link
            href="/how-it-works"
            className="mt-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Try it yourself — ask the rules a question
            <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>
      </section>

      {/* ---------- evals ---------- */}
      {/* Rendered only when a run has been committed. A fresh clone that has
          never benchmarked shows no section rather than empty tiles. */}
      {evals && (
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-primary">
            Checked, not claimed
          </p>
          <h2 className="mt-4 max-w-3xl font-heading text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            We test it, and we publish the results — including the failures.
          </h2>
          <p className="mt-5 max-w-2xl leading-relaxed text-muted-foreground">
            &ldquo;Trust us&rdquo; isn&apos;t good enough for something you make
            plans around. A fixed set of {evals.questions} questions runs against
            the system, and every figure below comes from that run — the same one
            the dashboard shows, down to the questions it got wrong.
          </p>

          <dl className="mt-12 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {evals.tiles.map((e) => (
              <div key={e.label} className="bg-card p-6">
                <dd className="font-mono text-3xl font-semibold text-foreground">
                  {e.v}
                </dd>
                <dt className="mt-2 text-sm font-medium leading-snug">
                  {e.label}
                </dt>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  {e.note}
                </p>
              </div>
            ))}
          </dl>

          <p className="mt-4 font-mono text-xs text-muted-foreground/70">
            Measured {evals.measuredOn} · {evals.corpus} rule pages
            {evals.gitSha ? ` · commit ${evals.gitSha}` : ""}
          </p>

          <p className="mt-6 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            <span className="text-foreground">
              Being straight about what that proves.
            </span>{" "}
            Less than the numbers suggest. The questions were written by the same
            person as the rule library, so they can&apos;t find a topic nobody
            thought of, and three of the four figures are one AI model grading
            another. The dashboard lists every one of those limits, every question
            that missed, and how each number moved since the last run.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link
              href="/eval"
              className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm transition-colors hover:border-muted-foreground/50 hover:text-foreground"
            >
              See the full evaluation
              <span aria-hidden="true">&rarr;</span>
            </Link>
            <a
              href="https://www.shauryasharma.dev/blog/how-rag-works-in-truebearing-ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Read the write-up on how retrieval works
              <span aria-hidden="true">&#8599;</span>
            </a>
          </div>
        </div>
      </section>
      )}

      {/* ---------- principles ---------- */}
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="font-heading text-3xl font-bold tracking-tight">
            Three rules we build on
          </h2>
          <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
            People make big life decisions based on this number. So it&apos;s
            built so the two things that usually go wrong — a made-up rule and a
            wrong score — can&apos;t happen in the first place.
          </p>

          <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
            {PRINCIPLES.map((p) => (
              <div key={p.n} className="bg-card p-6">
                <span className="font-mono text-xs text-primary">{p.n}</span>
                <h3 className="mt-3 font-heading text-base font-semibold leading-snug">
                  {p.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {p.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- honest status ---------- */}
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
            <h2 className="font-heading text-lg font-semibold">
              What this is and isn&apos;t
            </h2>
            <div className="mt-4 grid gap-5 text-sm leading-relaxed text-muted-foreground sm:grid-cols-2">
              <p>
                It shows what the official rules add up to for the details you
                enter, and where each point came from, so you can check it
                yourself. It is{" "}
                <span className="text-foreground">not legal advice </span> and
                doesn&apos;t replace a licensed immigration consultant or lawyer.
              </p>
              <p>
                Cutoffs change every round. Beating one today doesn&apos;t mean
                you&apos;ll beat the next one. And your score is only half the
                story — the other half is which group you can be picked from.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- closing CTA ---------- */}
      <section>
        <div className="mx-auto max-w-5xl px-6 py-20 text-center">
          <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
            It takes about two minutes.
          </h2>
          <p className="mx-auto mt-4 max-w-xl leading-relaxed text-muted-foreground">
            Age, education, language scores, work history. Your score updates as
            you type, and you can see the exact table row behind every point.
          </p>
          <Link
            href="/assessment"
            className="group mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Start the assessment
            <span className="transition-transform group-hover:translate-x-0.5">
              &rarr;
            </span>
          </Link>
        </div>
      </section>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-8 text-xs text-muted-foreground">
          <span className="font-heading font-bold text-foreground">
            True Bearing<span className="text-primary">.</span>
          </span>
          <span className="font-mono text-muted-foreground/60">
            Ruleset {ruleset.version}
          </span>
          <nav className="ml-auto flex gap-5">
            <Link href="/assessment" className="transition-colors hover:text-foreground">
              Assessment
            </Link>
            <Link href="/rules" className="transition-colors hover:text-foreground">
              Rules
            </Link>
            <Link href="/how-it-works" className="transition-colors hover:text-foreground">
              How it works
            </Link>
            <Link href="/eval" className="transition-colors hover:text-foreground">
              Evaluation
            </Link>
            <a
              href="https://www.shauryasharma.dev/blog/how-rag-works-in-truebearing-ai"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
            >
              Blog
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
