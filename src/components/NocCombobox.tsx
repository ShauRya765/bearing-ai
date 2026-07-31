"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  searchOccupations,
  findOccupation,
  type Occupation,
} from "@/lib/crs/ruleset/noc-categories";

// A searchable NOC picker. There are 516 unit groups, so a plain <Select> is
// unusable — nobody scrolls to "72300 Plumbers". Type a code or a job title
// instead.
//
// Built here rather than pulled in as a combobox dependency because the needs
// are narrow: filter a static list, pick one, clear it. Keyboard handling is
// arrow keys / Enter / Escape, and the listbox follows the ARIA combobox
// pattern so it is reachable without a mouse.

export function NocCombobox({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (noc: string | undefined) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = findOccupation(value);
  const results = useMemo(() => searchOccupations(query), [query]);

  // Close when focus or a click leaves the widget entirely.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const choose = (o: Occupation) => {
    onChange(o.noc);
    setQuery("");
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setActive((i) => {
        const next = e.key === "ArrowDown" ? i + 1 : i - 1;
        if (next < 0) return results.length - 1;
        if (next >= results.length) return 0;
        return next;
      });
    } else if (e.key === "Enter") {
      if (open && results[active]) {
        e.preventDefault();
        choose(results[active]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2">
        <span className="text-sm">
          <span className="font-mono text-muted-foreground">{selected.noc}</span>
          <span className="mx-1.5 text-muted-foreground/50">—</span>
          {selected.title}
          <span className="ml-2 font-mono text-xs text-muted-foreground/70">
            TEER {selected.teer}
          </span>
        </span>
        <button
          type="button"
          onClick={() => {
            onChange(undefined);
            setQuery("");
          }}
          className="shrink-0 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        aria-autocomplete="list"
        autoComplete="off"
        className="input"
        placeholder="Search by job title or NOC code — e.g. plumber, 72300"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />

      {open && (
        <ul
          ref={listRef}
          id={`${id}-listbox`}
          role="listbox"
          className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-lg"
        >
          {results.length === 0 && (
            <li className="px-3 py-2 text-xs text-muted-foreground">
              No occupation matches “{query}”. Check the spelling, or look it up
              on IRCC&apos;s NOC tool.
            </li>
          )}
          {results.map((o, i) => (
            <li key={o.noc} data-index={i}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(o)}
                className={`flex w-full items-baseline gap-2 rounded-sm px-2.5 py-1.5 text-left text-sm ${
                  i === active ? "bg-accent text-accent-foreground" : ""
                }`}
              >
                <span className="font-mono text-xs text-muted-foreground">
                  {o.noc}
                </span>
                <span className="flex-1">{o.title}</span>
                {o.categories.length > 0 && (
                  <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary">
                    category draw
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
