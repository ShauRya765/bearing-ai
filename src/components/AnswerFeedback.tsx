"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { MAX_REASON_LENGTH, type Rating } from "@/lib/qa";

/**
 * Great / Bad on one answer, plus the reason.
 *
 * The asymmetry is the point:
 *  - Great sends immediately, then offers an optional note. Praise you have to
 *    justify doesn't get given, and a rating held hostage to a text box is a
 *    rating you never receive.
 *  - Bad sends nothing until a reason is typed. "This was bad" with no reason
 *    tells you a number; "it quoted the wrong CLB table" tells you what to fix.
 *
 * The cost of that choice: someone who clicks Bad and walks away is never
 * counted. That's deliberate — an unexplained Bad wasn't going to be actionable
 * anyway — but it does mean the bad count is a floor, not a total.
 */
export function AnswerFeedback({
  qaId,
  className = "",
}: {
  /** The id from the answer's metadata line. Null while streaming or on error. */
  qaId: string | null;
  className?: string;
}) {
  const [rating, setRating] = useState<Rating | null>(null);
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set once a reason has actually been stored, so the box can collapse into a
  // thank-you instead of inviting the same note twice.
  const [reasonSaved, setReasonSaved] = useState(false);

  // A new answer is a new question — never carry the previous verdict over.
  // Done during render rather than in an effect (React's "adjusting state when a
  // prop changes" pattern): an effect would paint the old rating over the new
  // answer for one frame first.
  const [ratedId, setRatedId] = useState(qaId);
  if (qaId !== ratedId) {
    setRatedId(qaId);
    setRating(null);
    setReason("");
    setSending(false);
    setError(null);
    setReasonSaved(false);
  }

  if (!qaId) return null;

  async function send(next: Rating, withReason: string | null) {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: qaId, rating: next, reason: withReason }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Couldn't save that. Please try again.");
      }
      if (withReason) setReasonSaved(true);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that.");
      return false;
    } finally {
      setSending(false);
    }
  }

  async function choose(next: Rating) {
    setRating(next);
    setError(null);
    setReason("");
    setReasonSaved(false);
    // Bad waits for the reason; great is banked now and can be annotated after.
    if (next === "great") await send("great", null);
  }

  async function submitReason() {
    if (!rating || sending) return;
    const trimmed = reason.trim();
    if (rating === "bad" && !trimmed) return; // the button is disabled anyway
    if (!trimmed) return;
    await send(rating, trimmed);
  }

  const askingWhy = rating !== null && !reasonSaved;
  const required = rating === "bad";

  return (
    <div className={`flex flex-col gap-2.5 ${className}`}>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Was this answer useful?</span>
        <Button
          size="xs"
          variant={rating === "great" ? "default" : "outline"}
          onClick={() => choose("great")}
          disabled={sending}
          aria-pressed={rating === "great"}
        >
          Great
        </Button>
        <Button
          size="xs"
          variant={rating === "bad" ? "destructive" : "outline"}
          onClick={() => choose("bad")}
          disabled={sending}
          aria-pressed={rating === "bad"}
        >
          Bad
        </Button>
        {rating === "great" && !error && (
          <span className="text-xs text-clear">Thanks — noted.</span>
        )}
      </div>

      {askingWhy && (
        <div className="space-y-2">
          <label
            htmlFor={`feedback-reason-${qaId}`}
            className="block text-xs text-muted-foreground"
          >
            {required
              ? "What was wrong with it? (required)"
              : "Anything worth adding? (optional)"}
          </label>
          <Textarea
            id={`feedback-reason-${qaId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, MAX_REASON_LENGTH))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitReason();
            }}
            rows={2}
            autoFocus={required}
            placeholder={
              required
                ? "e.g. it quoted the wrong table, or didn't answer what I asked"
                : "e.g. the citation made it easy to check"
            }
            className="resize-none text-sm"
          />
          <div className="flex items-center gap-3">
            <Button
              size="xs"
              onClick={submitReason}
              disabled={sending || (required && !reason.trim()) || !reason.trim()}
            >
              {sending ? "Sending…" : "Send"}
            </Button>
            {required && !reason.trim() && (
              <span className="text-xs text-muted-foreground">
                A reason is required for Bad.
              </span>
            )}
            <span className="ml-auto font-mono text-[0.65rem] text-muted-foreground/60 tabular-nums">
              {reason.length}/{MAX_REASON_LENGTH}
            </span>
          </div>
        </div>
      )}

      {reasonSaved && (
        <p className="text-xs text-clear">Thanks — that&apos;s been recorded.</p>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
