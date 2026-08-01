"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { HoverBorderGradient } from "@/components/HoverBorderGradient";
import { AnswerMarkdown, type Citation } from "@/components/AnswerMarkdown";
import { AnswerFeedback } from "@/components/AnswerFeedback";
import { TrackView, track } from "@/components/TrackView";

interface RagAnswer {
    answer: string;
    citations: Citation[];
    chunksUsed: number;
    /** Server-minted id for this exchange — what a rating is attached to. */
    qaId: string | null;
}

// What one question cost. Retrieval is measured on the server and arrives with
// the metadata line; the rest is measured here, so it includes network and is
// what the person actually waited. Nulls mean "not reached yet" — the strip
// fills in as the answer streams rather than appearing all at once at the end.
interface Timing {
    retrievalMs: number | null;
    firstTokenMs: number | null;
    totalMs: number | null;
}

function ms(v: number | null): string {
    if (v === null) return "—";
    return v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${Math.round(v)}ms`;
}

export default function RulesPage() {
    const [question, setQuestion] = useState("");
    const [result, setResult] = useState<RagAnswer | null>(null);
    const [timing, setTiming] = useState<Timing | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Only offer Clear when there's actually something to clear, so the button
    // doesn't sit there dead on a fresh page.
    const hasSomethingToClear = Boolean(question || result || error);

    function clear() {
        if (loading) return; // a stream is still writing into these
        setQuestion("");
        setResult(null);
        setTiming(null);
        setError(null);
    }

    async function ask() {
        if (!question.trim() || loading) return;
        setLoading(true);
        setError(null);
        setResult({ answer: "", citations: [], chunksUsed: 0, qaId: null });
        setTiming({ retrievalMs: null, firstTokenMs: null, totalMs: null });

        track("question_asked");

        const started = performance.now();
        try {
            const res = await fetch("/api/ask", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ question, source: "rules" }),
            });
            if (!res.ok || !res.body) throw new Error("Request failed");

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let metaParsed = false;
            let answer = "";
            let citations: Citation[] = [];
            let qaId: string | null = null;
            let retrievalMs: number | null = null;
            let firstTokenMs: number | null = null;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                // First newline separates the metadata line from the answer stream.
                if (!metaParsed) {
                    const nl = buffer.indexOf("\n");
                    if (nl === -1) continue;
                    const meta = JSON.parse(buffer.slice(0, nl));
                    citations = meta.citations;
                    qaId = meta.qaId ?? null;
                    if (meta.retrieval) {
                        retrievalMs = meta.retrieval.embedMs + meta.retrieval.searchMs;
                    }
                    buffer = buffer.slice(nl + 1);
                    metaParsed = true;
                }

                if (buffer && firstTokenMs === null) {
                    firstTokenMs = performance.now() - started;
                }

                answer += buffer;
                buffer = "";
                setResult({ answer, citations, chunksUsed: citations.length, qaId });
                setTiming({ retrievalMs, firstTokenMs, totalMs: null });
            }

            setTiming({
                retrievalMs,
                firstTokenMs,
                totalMs: performance.now() - started,
            });
        } catch (e) {
            setError(e instanceof Error ? e.message : "Something went wrong.");
            setTiming(null);
        } finally {
            setLoading(false);
        }
    }
    return (
        <>
            <TrackView name="rules_view" />
            <header className="h-16 shrink-0 border-b flex items-center px-8">
                <div>
                    <h1 className="font-heading text-base font-semibold leading-none">Rules</h1>
                    <p className="text-xs text-muted-foreground mt-1">Ask the corpus — answers only from retrieved sources</p>
                </div>
            </header>

            <main className="flex-1 p-8 max-w-3xl">
                <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                    This answers strictly from the ingested IRCC knowledge base — if a question isn&apos;t
                    covered by the corpus, it says so instead of guessing. Every answer is followed by
                    the sources it drew from.
                </p>

                <div className="mb-6">
                    <Textarea
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ask();
                            if (e.key === "Escape") clear();
                        }}
                        placeholder="Ask about the immigration rules — e.g. how much Canadian work is needed for CEC?"
                        rows={3}
                        className="resize-none"
                    />
                    <div className="flex items-center justify-between mt-3">
                        <span className="text-xs text-muted-foreground">⌘↵ to ask · Esc to clear</span>
                        <div className="flex items-center gap-3">
                            {hasSomethingToClear && (
                                <button
                                    type="button"
                                    onClick={clear}
                                    disabled={loading}
                                    className="rounded-full px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    Clear
                                </button>
                            )}
                            <HoverBorderGradient
                                onClick={ask}
                                disabled={loading || !question.trim()}
                                containerClassName="disabled:cursor-not-allowed disabled:opacity-50 disabled:pointer-events-none"
                            >
                                {loading ? "Thinking…" : "Ask"}
                            </HoverBorderGradient>
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="border border-destructive bg-destructive/10 rounded-lg p-4 text-sm text-destructive">
                        {error}
                    </div>
                )}

                {result && (
                    <div className="space-y-6">
                        <Card>
                            <CardContent>
                                <AnswerMarkdown
                                    text={result.answer}
                                    citations={result.citations}
                                    streaming={loading}
                                />

                                {/* Only once the answer has finished — rating a
                                    half-written answer isn't a judgement of it. */}
                                {!loading && result.answer && (
                                    <div className="mt-5 border-t pt-4">
                                        <AnswerFeedback qaId={result.qaId} />
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {timing && (
                            <div className="-mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 px-1 font-mono text-xs text-muted-foreground/70">
                                <span className="flex items-center gap-1.5">
                                    <span className="h-1 w-1 rounded-full bg-primary/60" />
                                    retrieval
                                    <span className="tabular-nums text-foreground/70">
                                        {ms(timing.retrievalMs)}
                                    </span>
                                </span>
                                <span className="flex items-center gap-1.5">
                                    first words
                                    <span className="tabular-nums text-foreground/70">
                                        {ms(timing.firstTokenMs)}
                                    </span>
                                </span>
                                <span className="flex items-center gap-1.5">
                                    total
                                    <span className="tabular-nums text-foreground/70">
                                        {ms(timing.totalMs)}
                                    </span>
                                </span>
                                <span className="text-muted-foreground/50">
                                    {result.chunksUsed} sources searched
                                </span>
                            </div>
                        )}

                        {result.citations.length > 0 && (
                            <div>
                                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
                                    Sources
                                </p>
                                <div className="space-y-2">
                                    {result.citations.map((c, i) => (
                                        <a
                                            key={i}
                                            href={c.sourceUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors group"
                                        >
                                            <span className="font-mono text-xs text-primary mt-0.5">
                                                [{i + 1}]
                                            </span>
                                            <span className="text-sm text-muted-foreground group-hover:text-foreground">
                                                {c.sourceTitle}
                                            </span>
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </main>
        </>
    );
}
