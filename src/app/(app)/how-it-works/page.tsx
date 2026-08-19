"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { HoverBorderGradient } from "@/components/HoverBorderGradient";
import { AnswerMarkdown, type Citation } from "@/components/AnswerMarkdown";
import { AnswerFeedback } from "@/components/AnswerFeedback";
import { EvalMethod } from "@/components/EvalMethod";
import { TrackView, track } from "@/components/TrackView";

function hostname(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return url;
    }
}

// End-user framing of the query pipeline — no vectors, no pgvector.
const STEPS = [
    { n: "01", t: "You ask", d: "A question in plain English." },
    { n: "02", t: "Find the rule", d: "We match it to the official IRCC passages." },
    { n: "03", t: "Explain", d: "The assistant puts only those rules into plain words." },
    { n: "04", t: "Cite", d: "Every claim links back to canada.ca." },
    { n: "05", t: "Or refuse", d: "Not in the rules? It says so — no guessing." },
];

const SAMPLES = [
    "How much Canadian work do I need for the Canadian Experience Class?",
    "What is CLB 7 and where do I need it?",
    "Does a provincial nomination guarantee an invitation?",
];

export default function HowItWorksPage() {
    const [question, setQuestion] = useState("");
    const [answer, setAnswer] = useState("");
    const [citations, setCitations] = useState<Citation[]>([]);
    const [refused, setRefused] = useState(false);
    // Server-minted id for the current exchange; what a rating attaches to.
    const [qaId, setQaId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [asked, setAsked] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function ask(q: string = question) {
        if (!q.trim() || loading) return;
        setLoading(true);
        setAsked(true);
        setError(null);
        setAnswer("");
        setCitations([]);
        setRefused(false);
        setQaId(null);
        track("question_asked");
        try {
            const res = await fetch("/api/ask", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ question: q, source: "how_it_works" }),
            });
            if (!res.ok || !res.body) throw new Error("Request failed");

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let metaParsed = false;
            let text = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                if (!metaParsed) {
                    const nl = buffer.indexOf("\n");
                    if (nl === -1) continue;
                    const meta = JSON.parse(buffer.slice(0, nl));
                    const cites: Citation[] = meta.citations;
                    setCitations(cites);
                    setQaId(meta.qaId ?? null);
                    // No sources retrieved = the question falls outside the
                    // rule corpus. That's the honest refusal, not an error.
                    setRefused(cites.length === 0);
                    buffer = buffer.slice(nl + 1);
                    metaParsed = true;
                }
                text += buffer;
                buffer = "";
                setAnswer(text);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Something went wrong.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <>
            <TrackView name="how_it_works_view" />
            <header className="h-16 shrink-0 border-b flex items-center px-4 sm:px-8">
                <div>
                    <h1 className="font-heading text-base font-semibold leading-none">How it works</h1>
                    <p className="text-xs text-muted-foreground mt-1">
                        Why you can trust the numbers — and the explanations
                    </p>
                </div>
            </header>

            <main className="flex-1 p-4 sm:p-8 max-w-3xl space-y-10 sm:space-y-14">
                {/* Hero */}
                <section>
                    <p className="font-mono text-xs uppercase tracking-[0.14em] text-primary mb-3 flex items-center gap-2">
                        <span className="inline-block w-5 h-px bg-primary" />
                        Plain-English answers, from the rules
                    </p>
                    <h2 className="font-heading text-2xl sm:text-3xl font-semibold leading-tight tracking-tight text-balance">
                        The assistant never invents immigration rules.
                    </h2>
                    <p className="mt-4 text-muted-foreground leading-relaxed max-w-[60ch]">
                        It finds the official IRCC passage, explains it in plain English, and shows you
                        the exact canada.ca page it came from. When a question isn&apos;t covered by the
                        rules, it tells you — instead of guessing.
                    </p>

                    <div className="mt-6 rounded-xl border border-primary/25 bg-primary/[0.06] p-5 text-sm leading-relaxed">
                        <b className="text-primary font-semibold">The AI doesn&apos;t decide anything.</b>{" "}
                        Your score and every point come from a fixed calculator built on IRCC&apos;s own
                        tables. The assistant only <b className="font-semibold">explains and cites</b> —
                        it never does the math.
                    </div>
                </section>

                {/* Two lanes — the core trust point */}
                <section>
                    <p className="font-mono text-[0.7rem] uppercase tracking-wider text-muted-foreground/70 mb-3">
                        Who does what
                    </p>
                    <div className="grid sm:grid-cols-2 gap-4">
                        <div className="rounded-xl border p-5 bg-card">
                            <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
                                <span className="font-mono text-[0.6rem] uppercase tracking-wider px-1.5 py-0.5 rounded bg-clear/12 text-clear">
                                    Calculator
                                </span>
                                The numbers
                            </h3>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                Your CRS score and every points breakdown are computed by fixed rules from
                                IRCC&apos;s published tables. <b className="text-foreground font-medium">Exact and
                                repeatable</b> — an AI never calculates a score.
                            </p>
                        </div>
                        <div className="rounded-xl border p-5 bg-card">
                            <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
                                <span className="font-mono text-[0.6rem] uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/12 text-primary">
                                    Assistant
                                </span>
                                The explanation
                            </h3>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                It only <b className="text-foreground font-medium">explains and cites</b> — what a
                                rule means, what it asks for. It answers strictly from official sources, and
                                refuses when they don&apos;t cover your question.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Pipeline */}
                <section>
                    <p className="font-mono text-[0.7rem] uppercase tracking-wider text-muted-foreground/70 mb-3">
                        How an answer is built
                    </p>
                    <div className="rounded-2xl border bg-card p-5 shadow-sm">
                        <div className="flex flex-col md:flex-row md:items-stretch gap-2">
                            {STEPS.map((s, i) => (
                                <div key={s.n} className="flex flex-col md:flex-row md:items-stretch gap-2 md:flex-1">
                                    <div className="flex-1 rounded-xl border bg-background p-3.5 flex flex-col gap-1.5">
                                        <span className="font-mono text-[0.7rem] text-primary font-semibold">{s.n}</span>
                                        <span className="text-sm font-semibold tracking-tight">{s.t}</span>
                                        <span className="text-xs text-muted-foreground leading-snug">{s.d}</span>
                                    </div>
                                    {i < STEPS.length - 1 && (
                                        <div className="flex-none self-center text-muted-foreground/50 rotate-90 md:rotate-0">
                                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8">
                                                <path d="M4 12h15M13 6l6 6-6 6" />
                                            </svg>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Ask box */}
                <section>
                    <p className="font-mono text-[0.7rem] uppercase tracking-wider text-muted-foreground/70 mb-3">
                        See it yourself
                    </p>
                    <h3 className="font-heading text-lg font-semibold mb-1">Ask the rules</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-4 max-w-[60ch]">
                        Every answer below is drawn only from the official corpus and followed by its
                        sources. Ask something off-topic and watch it refuse rather than make something up.
                    </p>

                    <Textarea
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ask();
                        }}
                        placeholder="e.g. How much Canadian work experience does the Canadian Experience Class need?"
                        rows={3}
                        className="resize-none"
                    />
                    <div className="flex items-center justify-between mt-3">
                        <span className="text-xs text-muted-foreground">⌘↵ to ask</span>
                        <HoverBorderGradient
                            onClick={() => ask()}
                            disabled={loading || !question.trim()}
                            containerClassName="disabled:cursor-not-allowed disabled:opacity-50 disabled:pointer-events-none"
                        >
                            {loading ? "Thinking…" : "Ask"}
                        </HoverBorderGradient>
                    </div>

                    {!asked && (
                        <div className="mt-4 flex flex-wrap gap-2">
                            {SAMPLES.map((s) => (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => {
                                        setQuestion(s);
                                        ask(s);
                                    }}
                                    className="text-xs text-left rounded-full border px-3 py-1.5 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    )}

                    {error && (
                        <div className="mt-5 border border-destructive bg-destructive/10 rounded-lg p-4 text-sm text-destructive">
                            {error}
                        </div>
                    )}

                    {asked && !error && (
                        <div className="mt-6">
                            {refused ? (
                                // Distinct slate treatment — an honest "out of scope",
                                // visibly different from a normal answer.
                                <div className="rounded-xl border border-refuse/40 bg-refuse/[0.08] p-5">
                                    <p className="flex items-center gap-2 text-sm font-semibold text-refuse">
                                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                                            <circle cx="12" cy="12" r="9" />
                                            <path d="M9 9l6 6M15 9l-6 6" />
                                        </svg>
                                        Outside the rules I can answer from
                                    </p>
                                    <p className="mt-2 text-sm text-refuse/90 leading-relaxed">
                                        {answer || "The indexed rules don't cover that, so I won't guess."}
                                    </p>
                                    <p className="mt-3 text-xs text-refuse/70">
                                        Try an Express Entry / CRS question — eligibility, language benchmarks,
                                        work experience, or provincial nomination.
                                    </p>
                                </div>
                            ) : (
                                <div className="rounded-xl border bg-card p-5">
                                    <AnswerMarkdown text={answer} citations={citations} streaming={loading} />

                                    {citations.length > 0 && (
                                        <div className="mt-4 border-t pt-3">
                                            <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground mb-2">
                                                Sources
                                            </p>
                                            <div className="space-y-1">
                                                {citations.map((c, i) => (
                                                    <a
                                                        key={i}
                                                        href={c.sourceUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="group -mx-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-primary/5 hover:text-foreground"
                                                    >
                                                        <span className="font-mono text-primary">[{i + 1}]</span>
                                                        <span className="flex-1 truncate">{c.sourceTitle}</span>
                                                        <span className="font-mono text-[0.65rem] text-muted-foreground/70 group-hover:text-primary">
                                                            {hostname(c.sourceUrl)} ↗
                                                        </span>
                                                    </a>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Rate it only once the answer is complete. */}
                                    {!loading && answer && (
                                        <div className="mt-4 border-t pt-3">
                                            <AnswerFeedback qaId={qaId} />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </section>

                {/* How we know retrieval is actually working — method, not a
                    live run. Static content; it just happens to sit on a client
                    page, so its question set rides along in the bundle. */}
                <EvalMethod />
            </main>
        </>
    );
}
