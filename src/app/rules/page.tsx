"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { HoverBorderGradient } from "@/components/HoverBorderGradient";

interface Citation {
    sourceTitle: string;
    sourceUrl: string;
}

interface RagAnswer {
    answer: string;
    citations: Citation[];
    chunksUsed: number;
}

export default function RulesPage() {
    const [question, setQuestion] = useState("");
    const [result, setResult] = useState<RagAnswer | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function ask() {
        if (!question.trim() || loading) return;
        setLoading(true);
        setError(null);
        setResult({ answer: "", citations: [], chunksUsed: 0 });
        try {
            const res = await fetch("/api/ask", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ question }),
            });
            if (!res.ok || !res.body) throw new Error("Request failed");

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let metaParsed = false;
            let answer = "";
            let citations: Citation[] = [];

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
                    buffer = buffer.slice(nl + 1);
                    metaParsed = true;
                }

                answer += buffer;
                buffer = "";
                setResult({ answer, citations, chunksUsed: citations.length });
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Something went wrong.");
        } finally {
            setLoading(false);
        }
    }
    return (
        <>
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
                        }}
                        placeholder="Ask about the immigration rules — e.g. how much Canadian work is needed for CEC?"
                        rows={3}
                        className="resize-none"
                    />
                    <div className="flex items-center justify-between mt-3">
                        <span className="text-xs text-muted-foreground">⌘↵ to ask</span>
                        <HoverBorderGradient
                            onClick={ask}
                            disabled={loading || !question.trim()}
                            containerClassName="disabled:cursor-not-allowed disabled:opacity-50 disabled:pointer-events-none"
                        >
                            {loading ? "Thinking…" : "Ask"}
                        </HoverBorderGradient>
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
                                <p className="text-sm leading-relaxed whitespace-pre-wrap">{result.answer}</p>
                            </CardContent>
                        </Card>

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
