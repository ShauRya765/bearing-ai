import Link from "next/link";
import { Spotlight } from "@/components/Spotlight";
import { GateAnimation } from "@/components/GateAnimation";
import { TrackView } from "@/components/TrackView";
import { GATE_CATEGORIES } from "@/components/gate-rows";
import type { DrawCategory } from "@/lib/crs/ruleset/types";
import { ruleset_2026_07 as ruleset } from "@/lib/crs/ruleset/ruleset-2026-07";

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

// How an answer gets built, in the user's terms — no vectors, no embeddings.
const STEPS = [
  { n: "01", t: "You ask", d: "A question in plain English." },
  { n: "02", t: "We find the rule", d: "Matched against the official IRCC pages." },
  { n: "03", t: "We explain", d: "Only what those rules say, in plain words." },
  { n: "04", t: "We show the source", d: "Every claim links back to canada.ca." },
  { n: "05", t: "Or we refuse", d: "Not in the rules? We say so instead of guessing." },
];

// Measured 2026-07-28 by `scripts/bench-retrieve.ts --full --reps 1` (55 eval
// questions against the live APIs) plus the node:test suites. Re-run and update
// these together with the caveat below — a stale number here is worse than no
// number.
//
// Nearest-rank percentiles, every stage inclusive of its network round trip —
// which is why "vector search" reads as ~105ms rather than the microseconds
// pgvector actually spends scanning 12 rows. The HTTP hop dominates its own row.
const PIPELINE = [
  { stage: "Embed the question", p50: "170ms", p95: "271ms", note: "1 API call, 768-dim" },
  { stage: "Vector search", p50: "105ms", p95: "238ms", note: "pgvector, top-5" },
  { stage: "Prompt assembly", p50: "<1ms", p95: "<1ms", note: "In-process" },
  { stage: "First token", p50: "2.44s", p95: "4.65s", note: "Dominates", hot: true },
  { stage: "Full answer", p50: "2.55s", p95: "5.16s", note: "Length-dependent" },
  { stage: "End to end", p50: "2.91s", p95: "5.51s", note: "Retrieval + generation" },
];

const EVALS = [
  {
    v: "45/45",
    label: "Questions where it found every right source",
    note: "21 of them worded to be deliberately awkward",
  },
  {
    v: "10/10",
    label: "Off-topic questions it refused to answer",
    note: "Fees, medicals, appeals, processing times",
  },
  {
    v: "2.9s",
    label: "Typical time to a full cited answer",
    note: "First words appear in about 2.4s",
  },
  {
    v: "26/26",
    label: "Automated tests passing",
    note: "Including IRCC's own worked example",
  },
];

export default function Landing() {
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
      {/* ---------- top nav ---------- */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-6 px-6">
          <Link href="/" className="flex items-baseline">
            <span className="font-heading text-lg font-bold tracking-tight">
              Bearing West
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
            though the two share almost no words.
          </p>

          <ol className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map((s, i) => (
              <li
                key={s.n}
                className="relative flex flex-col gap-2 rounded-xl border border-border bg-card p-5"
              >
                <span className="font-mono text-xs text-primary">{s.n}</span>
                <span className="font-heading text-sm font-semibold leading-snug">
                  {s.t}
                </span>
                <span className="text-xs leading-relaxed text-muted-foreground">
                  {s.d}
                </span>
                {i < STEPS.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="absolute -right-2.5 top-1/2 hidden -translate-y-1/2 text-border lg:block"
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
                      stroke="currentColor" strokeWidth="2">
                      <path d="M4 12h15M13 6l6 6-6 6" />
                    </svg>
                  </span>
                )}
              </li>
            ))}
          </ol>

          <div className="mt-6 rounded-xl border border-primary/25 bg-primary/[0.06] p-5 text-sm leading-relaxed">
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
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-primary">
            Checked, not claimed
          </p>
          <h2 className="mt-4 max-w-3xl font-heading text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            We test it, and we&apos;ll show you the results.
          </h2>
          <p className="mt-5 max-w-2xl leading-relaxed text-muted-foreground">
            &ldquo;Trust us&rdquo; isn&apos;t good enough for something you make
            plans around. There&apos;s a fixed set of questions with the right
            answers written down, and it runs against them.
          </p>

          <dl className="mt-12 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {EVALS.map((e) => (
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

          <p className="mt-6 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            <span className="text-foreground">
              Being straight about what that proves.
            </span>{" "}
            Not as much as a perfect score suggests. The rule library is 12 pages,
            and each question pulls the 5 closest — so nearly half the library
            comes back every time, and the right page is almost always in that
            handful. We tripled the questions and added deliberately awkward ones;
            it still scored full marks, which tells us the test is too easy rather
            than that the problem is solved. We expect this to drop as the library
            grows, and we&apos;ll publish it when it does. Measured 28 July 2026
            over 55 questions.
          </p>

          {/* Engineering detail. Deliberately set apart — an applicant doesn't
              need p95s, but the people who ask how it's built do. */}
          <div className="mt-14 rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border px-6 py-4">
              <h3 className="font-heading text-sm font-semibold">
                For engineers — where the time actually goes
              </h3>
              <span className="font-mono text-xs text-muted-foreground/70">
                55 questions, live APIs
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-6 py-2.5 font-medium text-muted-foreground">Stage</th>
                    <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">p50</th>
                    <th className="px-3 py-2.5 text-right font-medium text-muted-foreground">p95</th>
                    <th className="px-6 py-2.5 font-medium text-muted-foreground">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {PIPELINE.map((r) => (
                    <tr key={r.stage}>
                      <td className={`px-6 py-2.5 ${r.hot ? "text-foreground" : "text-muted-foreground"}`}>
                        {r.stage}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-mono tabular-nums ${
                        r.hot ? "text-primary" : "text-foreground/80"
                      }`}>
                        {r.p50}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                        {r.p95}
                      </td>
                      <td className="px-6 py-2.5 text-xs text-muted-foreground/70">{r.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-5 border-t border-border px-6 py-5 text-xs leading-relaxed text-muted-foreground sm:grid-cols-2">
              <p>
                <span className="text-foreground">Retrieval isn&apos;t the bottleneck.</span>{" "}
                Embedding plus search is ~320ms of a 3.6s answer — about 9%. The model
                is nearly 90% of the wait before the first token. That&apos;s why a
                dedicated vector database was never worth it: it would optimise the
                cheapest stage, and at this corpus size the index scan isn&apos;t even
                the expensive part of its own row — the HTTP round trip is.
              </p>
              <p>
                <span className="text-foreground">Top-5, and refusal is the prompt&apos;s job.</span>{" "}
                Going to top-20 would barely move search time but would inflate the
                prompt, landing on the expensive stage — slower and less grounded at
                once. The search RPC applies no similarity floor, so every query
                returns 5 chunks; declining an out-of-corpus question is the system
                prompt holding, which is exactly what the 3/3 refusal count measures.
              </p>
            </div>
          </div>
        </div>
      </section>

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
            Bearing West<span className="text-primary">.</span>
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
          </nav>
        </div>
      </footer>
    </div>
  );
}
