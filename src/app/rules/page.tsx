"use client";

import { useState } from "react";

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
        setResult(null);
        try {
            const res = await fetch("/api/ask", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ question }),
            });
            if (!res.ok) throw new Error((await res.json()).error ?? "Request failed");
            setResult(await res.json());
        } catch (e) {
            setError(e instanceof Error ? e.message : "Something went wrong.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <main className="flex-1 p-8 max-w-3xl">
            <div className="mb-6">
                <textarea
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) ask();
                    }}
                    placeholder="Ask about the immigration rules — e.g. how much Canadian work is needed for CEC?"
                    rows={3}
                    className="input resize-none"
                />
                <div className="flex items-center justify-between mt-3">
                    <span className="text-xs text-[--color-ink-soft]">⌘↵ to ask</span>
                    <button
                        onClick={ask}
                        disabled={loading || !question.trim()}
                        className="text-sm bg-[--color-signal] text-[--color-abyss] font-medium px-4 py-2 rounded-md hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {loading ? "Thinking…" : "Ask"}
                    </button>
                </div>
            </div>

            {error && (
                <div className="border border-[--color-block] bg-[color-mix(in_srgb,var(--color-block)_10%,transparent)] rounded-lg p-4 text-sm text-[--color-block]">
                    {error}
                </div>
            )}

            {result && (
                <div className="space-y-6">
                    <div className="bg-[--color-hull] border rounded-xl p-6">
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{result.answer}</p>
                    </div>

                    {result.citations.length > 0 && (
                        <div>
                            <p className="text-xs uppercase tracking-wider text-[--color-ink-soft] mb-3">
                                Sources
                            </p>
                            <div className="space-y-2">
                                {result.citations.map((c, i) => (
                                    <a
                                        key={i}
                                        href={c.sourceUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-start gap-3 p-3 rounded-lg border hover:bg-[--color-deck]/50 transition-colors group"
                                    >
                                        <span className="font-[family-name:--font-mono] text-xs text-[--color-signal] mt-0.5">
                                            [{i + 1}]
                                        </span>
                                        <span className="text-sm text-[--color-ink-soft] group-hover:text-[--color-ink]">
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
    );
}