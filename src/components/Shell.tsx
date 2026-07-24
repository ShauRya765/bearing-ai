"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ruleset_2026_06 as ruleset } from "@/lib/crs/ruleset/ruleset-2026-06";
import { Spotlight } from "@/components/Spotlight";

const NAV = [
  { label: "Assessment", href: "/" },
  { label: "Rules", href: "/rules" },
  { label: "How it works", href: "/how-it-works" },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="w-60 shrink-0 bg-sidebar border-r flex flex-col">
        <div className="px-5 h-16 flex items-center border-b">
          <span className="font-heading text-lg font-bold tracking-tight text-foreground">
            Bearing
          </span>
          <span className="ml-1 text-primary font-heading font-bold">.</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                  active
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-5 h-14 flex items-center border-t text-xs text-muted-foreground">
          Ruleset {ruleset.version}
        </div>
      </aside>

      <div className="flex-1 flex flex-col relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-96 overflow-hidden">
          <Spotlight className="left-0 top-0" />
        </div>
        <div className="relative flex-1 flex flex-col">{children}</div>
      </div>
    </div>
  );
}
