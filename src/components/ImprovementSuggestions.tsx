"use client";

import { useMemo, useState } from "react";
import type { CrsProfile } from "@/lib/crs/engine/crs-core";
import type { Ruleset } from "@/lib/crs/ruleset/types";
import { gapLevers, type Lever } from "@/lib/crs/engine/levers";
import { Card, CardContent } from "@/components/ui/card";
import { HoverBorderGradient } from "@/components/HoverBorderGradient";
import { renderMarkdown, type Citation } from "@/components/AnswerMarkdown";
import { AnswerFeedback } from "@/components/AnswerFeedback";
import {
    Dialog,
    DialogPopup,
    DialogTitle,
    DialogDescription,
    DialogClose,
} from "@/components/ui/dialog";

function hostname(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return url;
    }
}

// A green "gain" badge for big levers, amber for the smaller ones — a quick
// visual read of where the points are.
function deltaClass(delta: number): string {
    return delta >= 50
        ? "border-clear/30 bg-clear/10 text-clear"
        : "border-primary/30 bg-primary/10 text-primary";
}

// Seed the RAG explanation with the concrete levers the engine found, so the
// prose explains THESE rather than guessing. Numbers still come from the engine.
function buildQuestion(levers: Lever[]): string {
    const list = levers.map((l) => l.title).join("; ");
    return `An Express Entry candidate is weighing these ways to raise their CRS score: ${list}. \
Using only the sources, briefly explain how each one works and what it requires (French language \
points and the French-proficiency category, the certificate of qualification, provincial \
nomination, a Canadian credential, reaching CLB 9). Be concise; do not invent point values.`;
}

function LeverRow({ lever }: { lever: Lever }) {
    return (
        <div className="flex gap-3 rounded-lg border bg-background/60 p-3">
            <span
                className={`mt-0.5 h-fit shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums ${deltaClass(lever.delta)}`}
            >
                +{lever.delta}
            </span>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{lever.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {lever.requirement}
                </p>
                {lever.cappedBy && (
                    <p className="mt-1 text-xs leading-relaxed text-primary/80">
                        {lever.cappedBy}
                    </p>
                )}
                <a
                    href={lever.source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 inline-flex items-center gap-1 font-mono text-[0.65rem] text-muted-foreground/70 hover:text-primary"
                >
                    {hostname(lever.source.url)} ↗
                </a>
            </div>
        </div>
    );
}

function Body({
    levers,
    answer,
    citations,
    loading,
    feedbackId = null,
}: {
    levers: Lever[];
    answer: string;
    citations: Citation[];
    loading: boolean;
    /**
     * Id to rate this explanation by. Only the side panel passes one — the
     * first-run dialog renders the same content, and two rating widgets over
     * one answer would disagree with each other.
     */
    feedbackId?: string | null;
}) {
    return (
        <div className="space-y-4">
            {/* Engine-verified levers — exact deltas, always shown, never LLM-guessed. */}
            <div className="space-y-2">
                {levers.map((l) => (
                    <LeverRow key={l.id} lever={l} />
                ))}
            </div>

            {/* Grounded explanation from the corpus. */}
            <div className="border-t border-primary/20 pt-3">
                <p className="mb-2 text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                    How these work — from IRCC sources
                </p>
                {loading && !answer ? (
                    <div className="space-y-2" aria-hidden>
                        <div className="h-3 w-full animate-pulse rounded bg-primary/10" />
                        <div className="h-3 w-[85%] animate-pulse rounded bg-primary/10" />
                        <div className="h-3 w-[60%] animate-pulse rounded bg-primary/10" />
                    </div>
                ) : (
                    <div className="space-y-1">
                        {renderMarkdown(answer, citations)}
                        {loading && (
                            <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse bg-primary/70" />
                        )}
                    </div>
                )}

                {citations.length > 0 && (
                    <div className="mt-3 space-y-1">
                        {citations.map((c, i) => (
                            <a
                                key={i}
                                href={c.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group -mx-2 flex items-center gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-primary/5 hover:text-foreground"
                            >
                                <span className="font-mono text-primary">[{i + 1}]</span>
                                <span className="flex-1 truncate">{c.sourceTitle}</span>
                                <span className="font-mono text-[0.65rem] text-muted-foreground/70 group-hover:text-primary">
                                    {hostname(c.sourceUrl)} ↗
                                </span>
                            </a>
                        ))}
                    </div>
                )}

                {!loading && answer && feedbackId && (
                    <div className="mt-4 border-t border-primary/20 pt-3">
                        <AnswerFeedback qaId={feedbackId} />
                    </div>
                )}
            </div>
        </div>
    );
}

export function ImprovementSuggestions({
    profile,
    ruleset,
}: {
    profile: CrsProfile;
    ruleset: Ruleset;
}) {
    const [answer, setAnswer] = useState("");
    const [citations, setCitations] = useState<Citation[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [seenPopup, setSeenPopup] = useState(false);
    const [started, setStarted] = useState(false);
    // Server-minted id for the current explanation; what a rating attaches to.
    const [qaId, setQaId] = useState<string | null>(null);

    // Recomputed from the live profile — instant, deterministic, always correct.
    const levers = useMemo(() => gapLevers(profile, ruleset), [profile, ruleset]);

    async function suggest(fromButton: boolean) {
        if (loading || levers.length === 0) return;
        setStarted(true);
        // Popup shows only on the very first run; after the user closes it, the
        // side panel is already populated and stays the permanent home.
        if (fromButton && !seenPopup) setDialogOpen(true);
        setLoading(true);
        setError(null);
        setAnswer("");
        setCitations([]);
        setQaId(null);
        try {
            const res = await fetch("/api/ask", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    question: buildQuestion(levers),
                    source: "suggestions",
                }),
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
                    setCitations(meta.citations);
                    setQaId(meta.qaId ?? null);
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

    const totalUpside = levers.reduce((s, l) => s + l.delta, 0);

    const heading = (
        <p className="flex items-center gap-2 font-heading text-sm font-semibold">
            <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60" />
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            Ways to raise your score
        </p>
    );

    return (
        <>
            <Card className="relative overflow-hidden border-primary/40 bg-primary/[0.04]">
                {/* Accent rail — signals this is the actionable, standout panel. */}
                <div className="absolute inset-y-0 left-0 w-0.5 bg-primary/70" />
                <CardContent className="space-y-4 py-5">
                    <div>
                        {heading}
                        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                            {levers.length === 0
                                ? "You're already maxing the actionable factors — nice."
                                : `${levers.length} engine-verified levers${totalUpside ? `, up to +${totalUpside} points` : ""}. Every delta is an exact re-run, every claim links to canada.ca.`}
                        </p>
                    </div>

                    {levers.length > 0 && !started && (
                        <HoverBorderGradient
                            onClick={() => suggest(true)}
                            containerClassName="w-full"
                        >
                            Suggest improvements
                        </HoverBorderGradient>
                    )}

                    {error && <p className="text-sm text-destructive">{error}</p>}

                    {started && (
                        <Body
                            levers={levers}
                            answer={answer}
                            citations={citations}
                            loading={loading}
                            feedbackId={qaId}
                        />
                    )}

                    {started && !loading && (
                        <button
                            type="button"
                            onClick={() => suggest(false)}
                            className="text-xs text-primary hover:underline"
                        >
                            ↻ Refresh for current score
                        </button>
                    )}
                </CardContent>
            </Card>

            {/* First-run popup. Content mirrors the side panel; closing it just
                dismisses the popup — the side panel keeps the suggestions. */}
            <Dialog
                open={dialogOpen}
                onOpenChange={(open) => {
                    setDialogOpen(open);
                    if (!open) setSeenPopup(true);
                }}
            >
                <DialogPopup className="max-h-[85vh] overflow-y-auto">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <DialogTitle>{heading}</DialogTitle>
                            <DialogDescription className="mt-1">
                                Exact point deltas from the engine, explained from the IRCC corpus —
                                each links to its canada.ca source.
                            </DialogDescription>
                        </div>
                        <DialogClose className="rounded-md px-2 py-1 text-lg leading-none text-muted-foreground hover:bg-muted hover:text-foreground">
                            ✕
                        </DialogClose>
                    </div>
                    <Body
                        levers={levers}
                        answer={answer}
                        citations={citations}
                        loading={loading}
                    />
                </DialogPopup>
            </Dialog>
        </>
    );
}
