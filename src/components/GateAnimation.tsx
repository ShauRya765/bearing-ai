"use client";

import { useEffect, useState } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "framer-motion";
import type { DrawCategory } from "@/lib/crs/ruleset/types";
import { GATE_ROWS, GATE_SCORE } from "@/components/gate-rows";

// The gate, animated. Two stages on a loop:
//
//   "open"  — every category listed with its cutoff, the way an ordinary CRS
//             calculator shows them. Four of the six read as comfortable wins.
//   "gated" — the four the candidate can't be invited from lose their number
//             entirely, leaving the single honest comparison behind.
//
// The point of the loop is the subtraction. Every other calculator adds
// encouraging numbers; this one takes them away, and what's left is worse and
// true. Cutoffs come from the ruleset, so this can never quote a number the
// assessment would contradict.

const SCORE = GATE_SCORE;
const ROWS = GATE_ROWS;

const OPEN_MS = 2600;
const GATED_MS = 5200;

export function GateAnimation({
  cutoffs,
}: {
  cutoffs: Partial<Record<DrawCategory, number>>;
}) {
  const reduced = useReducedMotion();
  // Reduced motion gets the conclusion with no theatre — the withheld state is
  // the honest one, so that's what it holds on. Derived rather than set in an
  // effect, so there's no cascading render on first paint.
  const [cycleStage, setCycleStage] = useState<"open" | "gated">("open");
  const stage = reduced ? "gated" : cycleStage;

  const count = useMotionValue(reduced ? SCORE : 0);
  const shown = useTransform(count, (v) => Math.round(v));

  useEffect(() => {
    if (reduced) {
      count.set(SCORE);
      return;
    }
    const controls = animate(count, SCORE, { duration: 1.1, ease: "easeOut" });
    return () => controls.stop();
  }, [count, reduced]);

  useEffect(() => {
    if (reduced) return;
    let timer: ReturnType<typeof setTimeout>;
    const toGated = () => {
      setCycleStage("gated");
      timer = setTimeout(toOpen, GATED_MS);
    };
    const toOpen = () => {
      setCycleStage("open");
      timer = setTimeout(toGated, OPEN_MS);
    };
    timer = setTimeout(toGated, OPEN_MS);
    return () => clearTimeout(timer);
  }, [reduced]);

  const gated = stage === "gated";

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {/* header — the score */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-baseline gap-2.5">
          <motion.span className="font-mono text-3xl font-semibold tabular-nums">
            {shown}
          </motion.span>
          <span className="text-xs text-muted-foreground">your score</span>
        </div>
        <motion.span
          animate={{ opacity: gated ? 1 : 0.35 }}
          transition={{ duration: 0.4 }}
          className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-xs text-primary"
        >
          {gated ? "gate applied" : "no gate"}
        </motion.span>
      </div>

      {/* rows */}
      <div className="divide-y divide-border">
        {ROWS.map((row, i) => {
          const cutoff = cutoffs[row.category];
          if (cutoff === undefined) return null;
          const gap = SCORE - cutoff;
          const hidden = gated && !row.eligible;

          return (
            <motion.div
              key={row.category}
              animate={{ opacity: hidden ? 0.4 : 1 }}
              transition={{
                duration: 0.45,
                delay: gated && !row.eligible ? i * 0.09 : 0,
              }}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3"
            >
              <span className="text-sm">{row.label}</span>
              <span className="font-mono text-xs text-muted-foreground/60">
                cutoff {cutoff}
              </span>

              <span className="ml-auto flex items-center gap-3">
                <motion.span
                  animate={{ opacity: hidden ? 1 : 0 }}
                  transition={{ duration: 0.35, delay: hidden ? i * 0.09 : 0 }}
                  className="font-mono text-xs text-muted-foreground"
                >
                  {row.requirement}
                </motion.span>

                {/* The number and the refusal occupy the same slot, so one
                    visibly replaces the other rather than the row reflowing. */}
                <span className="relative flex h-6 w-[104px] items-center justify-end">
                  <motion.span
                    animate={{ opacity: hidden ? 0 : 1, scale: hidden ? 0.9 : 1 }}
                    transition={{ duration: 0.35, delay: hidden ? i * 0.09 : 0 }}
                    className={`absolute rounded-md px-2 py-0.5 font-mono text-xs ${
                      gap >= 0
                        ? "bg-clear/10 text-clear"
                        : "bg-destructive/10 text-destructive"
                    }`}
                  >
                    {gap >= 0 ? `+${gap}` : gap}
                  </motion.span>

                  <motion.span
                    animate={{ opacity: hidden ? 1 : 0 }}
                    transition={{ duration: 0.35, delay: hidden ? i * 0.09 + 0.1 : 0 }}
                    className="absolute rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground"
                  >
                    can&apos;t enter
                  </motion.span>
                </span>
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* footer — the payoff line */}
      <div className="border-t border-border bg-background/40 px-5 py-4">
        <motion.p
          key={stage}
          initial={reduced ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: gated ? 0.5 : 0 }}
          className="text-xs leading-relaxed text-muted-foreground"
        >
          {gated ? (
            <>
              Four of those were never available to this person. The one draw
              they can actually be picked from, they are{" "}
              <span className="text-foreground">36 points short</span> — which is
              the only number here worth acting on.
            </>
          ) : (
            <>Every recent draw, scored against 480. Four of them look like wins.</>
          )}
        </motion.p>
      </div>
    </div>
  );
}
