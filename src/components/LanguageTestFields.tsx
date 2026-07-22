"use client";

import type { LanguageTest, Ruleset, Skill } from "@/lib/crs/ruleset/types";
import type { RawLanguageResult } from "@/lib/crs/engine/clb";
import { Label } from "@/components/ui/label";
import { NumberField } from "@/components/NumberField";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const LANGUAGE_TEST_OPTIONS: { value: LanguageTest; label: string }[] = [
  { value: "IELTS", label: "IELTS General" },
  { value: "CELPIP", label: "CELPIP-G" },
  { value: "PTE", label: "PTE Core" },
  { value: "TEF", label: "TEF Canada" },
  { value: "TCF", label: "TCF Canada" },
];

const SKILLS: Skill[] = ["reading", "writing", "listening", "speaking"];

// Native score ranges per test, for input bounds only — NOT CRS thresholds.
// Those live in the ruleset and are only ever reached through toCLB().
const SCORE_RANGE: Record<LanguageTest, Record<Skill, { min: number; max: number }>> = {
  IELTS: {
    reading: { min: 0, max: 9 },
    writing: { min: 0, max: 9 },
    listening: { min: 0, max: 9 },
    speaking: { min: 0, max: 9 },
  },
  CELPIP: {
    reading: { min: 1, max: 12 },
    writing: { min: 1, max: 12 },
    listening: { min: 1, max: 12 },
    speaking: { min: 1, max: 12 },
  },
  PTE: {
    reading: { min: 10, max: 90 },
    writing: { min: 10, max: 90 },
    listening: { min: 10, max: 90 },
    speaking: { min: 10, max: 90 },
  },
  TEF: {
    reading: { min: 0, max: 300 },
    listening: { min: 0, max: 360 },
    writing: { min: 0, max: 450 },
    speaking: { min: 0, max: 450 },
  },
  TCF: {
    reading: { min: 0, max: 699 },
    listening: { min: 0, max: 699 },
    writing: { min: 0, max: 20 },
    speaking: { min: 0, max: 20 },
  },
};

// A sane starting score when switching tests: the ruleset's own CLB 7
// threshold row, so the picker never lands on a value the engine can't
// place. Falls back to the range floor if a table is ever incomplete.
export function defaultLanguageResult(test: LanguageTest, ruleset: Ruleset): RawLanguageResult {
  const table = ruleset.language[test] ?? [];
  const clb7 = table.find((row) => row.clb === 7);
  const ranges = SCORE_RANGE[test];
  return {
    test,
    reading: clb7?.reading ?? ranges.reading.min,
    writing: clb7?.writing ?? ranges.writing.min,
    listening: clb7?.listening ?? ranges.listening.min,
    speaking: clb7?.speaking ?? ranges.speaking.min,
  };
}

export function LanguageTestFields({
  value,
  onChange,
  ruleset,
}: {
  value: RawLanguageResult;
  onChange: (value: RawLanguageResult) => void;
  ruleset: Ruleset;
}) {
  const ranges = SCORE_RANGE[value.test];

  return (
    <div className="grid grid-cols-[150px_1fr] gap-3 items-start">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground font-normal">Test</Label>
        <Select
          value={value.test}
          onValueChange={(test) => onChange(defaultLanguageResult(test as LanguageTest, ruleset))}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGE_TEST_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {SKILLS.map((skill) => {
          const range = ranges[skill];
          return (
            <div key={skill} className="space-y-1.5">
              <Label className="text-xs text-muted-foreground font-normal">
                {skill[0].toUpperCase() + skill.slice(1)}
              </Label>
              <NumberField
                min={range.min}
                max={range.max}
                value={value[skill]}
                onChange={(n) => onChange({ ...value, [skill]: n })}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
