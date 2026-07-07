"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ruleset_2026_06 as ruleset } from "@/lib/crs/ruleset/ruleset-2026-06";

const NAV = [
  { label: "Assessments", href: "/" },
  { label: "Knowledge Map", href: "/map" },
  { label: "Rules", href: "/rules" },
  { label: "Clients", href: "/clients" },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 bg-[--color-hull] border-r flex flex-col">
        <div className="px-5 h-16 flex items-center border-b">
          <span className="font-[family-name:--font-display] text-lg font-bold tracking-tight">
            Bearing
          </span>
          <span className="ml-1 text-[--color-signal] font-[family-name:--font-display] font-bold">
            .
          </span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block px-3 py-2 rounded-md text-sm transition-colors ${
                  active
                    ? "bg-[--color-deck] text-[--color-ink]"
                    : "text-[--color-ink-soft] hover:text-[--color-ink] hover:bg-[--color-deck]/50"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-5 h-14 flex items-center border-t text-xs text-[--color-ink-soft]">
          Ruleset {ruleset.version}
        </div>
      </aside>

      <div className="flex-1 flex flex-col">{children}</div>
    </div>
  );
}