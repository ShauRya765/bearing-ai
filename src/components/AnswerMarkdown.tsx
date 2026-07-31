"use client";

import type { ReactNode } from "react";

export interface Citation {
    sourceTitle: string;
    sourceUrl: string;
}

// Bold spans are highlighted, not left as plain **text**. Default highlight is
// the amber accent; a few semantic labels get their own colour.
function labelClass(inner: string): string {
    if (/^(impact|points|gain)/i.test(inner)) return "text-clear font-semibold";
    if (/^(missing|note|caveat)/i.test(inner)) return "text-muted-foreground font-semibold";
    return "text-primary font-semibold";
}

// Turn inline [n] markers into real links to the matching source. Anything
// without a matching citation (or not yet streamed in) stays plain text.
//
// `scope` namespaces the generated keys. renderInline calls this once per
// segment between bold spans and spreads every result into ONE array, so a
// counter local to this function would restart at 0 for each segment and
// collide the moment two segments both contain a citation.
function renderPlain(
    text: string,
    citations: Citation[],
    scope: string,
): ReactNode[] {
    const parts: ReactNode[] = [];
    const re = /\[(\d+)\]/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let key = 0;
    while ((m = re.exec(text))) {
        const n = Number(m[1]);
        const cite = citations[n - 1];
        if (last < m.index) parts.push(text.slice(last, m.index));
        if (cite) {
            parts.push(
                <a
                    key={`${scope}c${key++}`}
                    href={cite.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={cite.sourceTitle}
                    className="mx-0.5 inline-flex items-center rounded bg-primary/15 px-1 align-super font-mono text-[0.7em] font-medium leading-none text-primary hover:bg-primary/25"
                >
                    {n}
                </a>,
            );
        } else {
            parts.push(m[0]);
        }
        last = re.lastIndex;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
}

// Handle **bold** (colour-coded) plus inline citations.
function renderInline(text: string, citations: Citation[]): ReactNode[] {
    const nodes: ReactNode[] = [];
    const boldRe = /\*\*([^*]+?)\*\*/g;
    let last = 0;
    let m: RegExpExecArray | null;
    // One counter for every child pushed into `nodes`, bold or plain, so each
    // segment gets a distinct key namespace.
    let seg = 0;
    while ((m = boldRe.exec(text))) {
        if (last < m.index) {
            nodes.push(...renderPlain(text.slice(last, m.index), citations, `s${seg++}-`));
        }
        const boldScope = `s${seg++}-`;
        nodes.push(
            <strong key={`${boldScope}b`} className={labelClass(m[1])}>
                {renderPlain(m[1], citations, `${boldScope}i`)}
            </strong>,
        );
        last = boldRe.lastIndex;
    }
    if (last < text.length) {
        nodes.push(...renderPlain(text.slice(last), citations, `s${seg++}-`));
    }
    return nodes;
}

// Lightweight, line-based markdown: numbered items, bullets, paragraphs.
// Nested bullets are flattened to one level (fine for RAG output).
export function renderMarkdown(text: string, citations: Citation[]): ReactNode {
    return text.split("\n").map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return null;

        const numbered = trimmed.match(/^(\d+)\.\s+(.*)$/);
        if (numbered) {
            return (
                <div key={i} className="mt-2 flex gap-2 first:mt-0">
                    <span className="mt-px font-mono text-xs text-primary">{numbered[1]}.</span>
                    <span className="flex-1 text-sm">{renderInline(numbered[2], citations)}</span>
                </div>
            );
        }

        const bullet = trimmed.match(/^[*-]\s+(.*)$/);
        if (bullet) {
            const indented = /^\s{2,}/.test(line);
            return (
                <div key={i} className={`flex gap-2 text-sm ${indented ? "pl-8" : "pl-4"}`}>
                    <span className="select-none text-primary/50">›</span>
                    <span className="flex-1">{renderInline(bullet[1], citations)}</span>
                </div>
            );
        }

        return (
            <p key={i} className="text-sm leading-relaxed">
                {renderInline(trimmed, citations)}
            </p>
        );
    });
}

// Renders a grounded RAG answer: markdown with highlighted bold spans and
// clickable inline citations, plus an optional streaming caret.
export function AnswerMarkdown({
    text,
    citations,
    streaming = false,
}: {
    text: string;
    citations: Citation[];
    streaming?: boolean;
}) {
    return (
        <div className="space-y-1">
            {renderMarkdown(text, citations)}
            {streaming && (
                <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse bg-primary/70" />
            )}
        </div>
    );
}
