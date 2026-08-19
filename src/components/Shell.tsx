"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ruleset_2026_08 as ruleset } from "@/lib/crs/ruleset/ruleset-2026-08";
import { Spotlight } from "@/components/Spotlight";

const NAV = [
  { label: "Assessment", href: "/assessment" },
  { label: "Rules", href: "/rules" },
  { label: "How it works", href: "/how-it-works" },
  { label: "Evaluation", href: "/eval" },
];

// The sidebar is desktop-only. It was `w-60 shrink-0` at every width, which left
// a 375px phone with ~135px for the page itself — the assessment form, the rules
// browser and the eval dashboard were all unusable, not merely cramped. Below md
// it is replaced by the top bar, which carries the same four destinations as a
// horizontally scrollable row: no drawer, no toggle state, no JS beyond the
// pathname this component already reads.
export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      {/* ---------- mobile top bar ---------- */}
      {/* Deliberately NOT sticky. The assessment pins its own ScoreBar at
          top-0, and a second sticky bar above it would either cover the live
          score or need a hardcoded offset that breaks the moment this header
          changes height. Scrolling it away also gives a phone back ~95px. */}
      <header className="border-b bg-background/90 md:hidden">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <Link href="/" className="flex items-baseline">
            <span className="font-heading text-base font-bold tracking-tight text-foreground">
              True Bearing
            </span>
            <span className="ml-0.5 font-heading font-bold text-primary">.</span>
          </Link>
          <span className="font-mono text-[0.7rem] text-muted-foreground/70">
            Ruleset {ruleset.version}
          </span>
        </div>
        {/* Wraps rather than scrolls. Four items overflow a 375px row by a few
            pixels, and in a scrolling row the clipped item is the last one —
            Evaluation — with no JS to scroll the active pill into view. A second
            row on the narrowest phones is the cheaper cost. */}
        <nav className="flex flex-wrap gap-1 px-3 pb-2">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      {/* ---------- desktop sidebar ---------- */}
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
        <Link
          href="/"
          className="flex h-16 items-center border-b px-5 transition-colors hover:bg-muted/40"
        >
          <span className="font-heading text-lg font-bold tracking-tight text-foreground">
            True Bearing
          </span>
          <span className="ml-1 font-heading font-bold text-primary">.</span>
        </Link>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex h-14 items-center border-t px-5 text-xs text-muted-foreground">
          Ruleset {ruleset.version}
        </div>
      </aside>

      {/* min-w-0 so a wide child (a scrollable table) shrinks the flex item
          instead of stretching the row and scrolling the whole page sideways. */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-96 overflow-hidden">
          <Spotlight className="left-0 top-0" />
        </div>
        <div className="relative flex flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}
