"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type Direction = "TOP" | "RIGHT" | "BOTTOM" | "LEFT";

const DIRECTIONS: Direction[] = ["TOP", "RIGHT", "BOTTOM", "LEFT"];

const GRADIENT_BY_DIRECTION: Record<Direction, string> = {
  TOP: "radial-gradient(20% 50% at 50% 0%, #d97706 0%, rgba(217,119,6,0) 100%)",
  RIGHT: "radial-gradient(16% 41% at 100% 50%, #d97706 0%, rgba(217,119,6,0) 100%)",
  BOTTOM: "radial-gradient(20% 50% at 50% 100%, #d97706 0%, rgba(217,119,6,0) 100%)",
  LEFT: "radial-gradient(16% 41% at 0% 50%, #d97706 0%, rgba(217,119,6,0) 100%)",
};

const HOVER_HIGHLIGHT =
  "radial-gradient(75% 180% at 50% 50%, #fbbf24 0%, rgba(251,191,36,0) 100%)";

// Adapted from Aceternity UI's Hover Border Gradient: a radial-gradient
// "chases" clockwise around the button border, revealed through a thin
// padding ring behind an opaque pill. Recolored to the app's amber signal
// accent for a light theme; used sparingly on the one primary CTA.
export function HoverBorderGradient({
  children,
  className,
  containerClassName,
  duration = 1,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  containerClassName?: string;
  duration?: number;
}) {
  const [hovered, setHovered] = React.useState(false);
  const [direction, setDirection] = React.useState<Direction>("TOP");

  React.useEffect(() => {
    if (hovered) return;
    const id = setInterval(() => {
      setDirection((prev) => DIRECTIONS[(DIRECTIONS.indexOf(prev) + 1) % DIRECTIONS.length]);
    }, duration * 1000);
    return () => clearInterval(id);
  }, [hovered, duration]);

  return (
    <button
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "relative isolate overflow-hidden rounded-full p-[1.5px] transition-shadow",
        containerClassName,
      )}
      {...props}
    >
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{ filter: "blur(6px)" }}
        initial={{ background: GRADIENT_BY_DIRECTION[direction] }}
        animate={{
          background: hovered
            ? [GRADIENT_BY_DIRECTION[direction], HOVER_HIGHLIGHT]
            : GRADIENT_BY_DIRECTION[direction],
        }}
        transition={{ ease: "linear", duration }}
      />
      <span
        className={cn(
          "relative z-10 flex items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground",
          className,
        )}
      >
        {children}
      </span>
    </button>
  );
}
