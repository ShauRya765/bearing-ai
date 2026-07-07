"use client";

import { useState } from "react";
import { scoreCore, type CrsProfile } from "@/lib/crs/engine/crs-core";
import { ruleset_2026_06 as ruleset } from "@/lib/crs/ruleset/ruleset-2026-06";
import type { EducationLevel } from "@/lib/crs/ruleset/types";
import { runGate } from "@/lib/crs/engine/gate";

const EDUCATION_OPTIONS: { value: EducationLevel; label: string }[] = [
    { value: "secondary", label: "Secondary / high school" },
    { value: "oneYearPostSecondary", label: "1-year post-secondary" },
    { value: "twoYearPostSecondary", label: "2-year post-secondary" },
    { value: "bachelors", label: "Bachelor's / 3-year" },
    { value: "twoOrMoreCredentials", label: "Two or more credentials" },
    { value: "masters", label: "Master's" },
    { value: "doctoral", label: "Doctoral" },
];

export default function Home() {
    const [profile, setProfile] = useState<CrsProfile>({
        age: 29,
        education: "masters",
        firstLanguage: { test: "IELTS", reading: 8, writing: 7, listening: 8, speaking: 7 },
        canadianWorkYears: 3,
    });

    const score = scoreCore(profile, ruleset);

    const gate = runGate(profile, score.total, ruleset, []);

    const set = <K extends keyof CrsProfile>(key: K, value: CrsProfile[K]) =>
        setProfile((p) => ({ ...p, [key]: value }));

    const setLang = (skill: keyof CrsProfile["firstLanguage"], value: number) =>
        setProfile((p) => ({ ...p, firstLanguage: { ...p.firstLanguage, [skill]: value } }));

    function Toggle({ label, checked, onChange }: {
        label: string;
        checked: boolean;
        onChange: (v: boolean) => void;
    }) {
        return (
            <button
                type="button"
                onClick={() => onChange(!checked)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-sm text-left transition-colors ${checked
                        ? "border-[--color-signal] bg-[color-mix(in_srgb,var(--color-signal)_10%,transparent)]"
                        : "border-[--color-line] hover:bg-[--color-deck]/50"
                    }`}
            >
                <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${checked ? "bg-[--color-signal] text-[--color-abyss]" : "border border-[--color-line]"
                    }`}>
                    {checked && "✓"}
                </span>
                {label}
            </button>
        );
    }

    return (
        <>
            <header className="h-16 shrink-0 border-b flex items-center px-8"></header>

                <main className="flex-1 p-8 grid grid-cols-[1fr_360px] gap-8">
                    {/* Form */}
                    <div className="space-y-6 max-w-lg">
                        <Field label="Age">
                            <input type="number" value={profile.age} min={17} max={45}
                                onChange={(e) => set("age", Number(e.target.value))}
                                className="input" />
                        </Field>

                        <Field label="Education">
                            <select value={profile.education}
                                onChange={(e) => set("education", e.target.value as EducationLevel)}
                                className="input">
                                {EDUCATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </Field>

                        <Field label="Canadian work experience (years)">
                            <input type="number" value={profile.canadianWorkYears} min={0} max={5}
                                onChange={(e) => set("canadianWorkYears", Number(e.target.value))}
                                className="input" />
                        </Field>

                        <div>
                            <p className="text-xs uppercase tracking-wider text-[--color-ink-soft] mb-3">IELTS bands</p>
                            <div className="grid grid-cols-4 gap-3">
                                {(["reading", "writing", "listening", "speaking"] as const).map((skill) => (
                                    <Field key={skill} label={skill[0].toUpperCase() + skill.slice(1)}>
                                        <input type="number" step={0.5} min={0} max={9}
                                            value={profile.firstLanguage[skill]}
                                            onChange={(e) => setLang(skill, Number(e.target.value))}
                                            className="input" />
                                    </Field>
                                ))}
                            </div>
                        </div>
                        <div className="border-t pt-6 space-y-4">
                            <p className="text-xs uppercase tracking-wider text-[--color-ink-soft]">
                                Additional factors
                            </p>

                            <Field label="Foreign skilled work (years)">
                                <input type="number" min={0} max={10}
                                    value={profile.foreignWorkYears ?? 0}
                                    onChange={(e) => set("foreignWorkYears", Number(e.target.value))}
                                    className="input" />
                            </Field>

                            <Field label="Canadian study (years)">
                                <input type="number" min={0} max={5}
                                    value={profile.canadianStudyYears ?? 0}
                                    onChange={(e) => set("canadianStudyYears", Number(e.target.value))}
                                    className="input" />
                            </Field>

                            <div className="grid grid-cols-2 gap-3">
                                <Toggle label="Provincial nomination"
                                    checked={profile.provincialNomination ?? false}
                                    onChange={(v) => set("provincialNomination", v)} />
                                <Toggle label="Sibling in Canada"
                                    checked={profile.siblingInCanada ?? false}
                                    onChange={(v) => set("siblingInCanada", v)} />
                                <Toggle label="Strong French (CLB 7+)"
                                    checked={profile.frenchClb7Plus ?? false}
                                    onChange={(v) => set("frenchClb7Plus", v)} />
                            </div>
                        </div>
                    </div>

                    {/* Live score */}
                    <div className="bg-[--color-hull] border rounded-xl p-6 h-fit sticky top-8">
                        <p className="text-xs uppercase tracking-wider text-[--color-ink-soft]">CRS score</p>
                        <p className="font-[family-name:--font-mono] text-5xl font-bold mt-2 mb-6">{score.total}</p>
                        <div className="space-y-3 border-t pt-4">
                            {score.factors.map((f) => (
                                <div key={f.factor} className="flex justify-between text-sm">
                                    <span className="text-[--color-ink-soft]">{f.factor}</span>
                                    <span className="font-[family-name:--font-mono]">{f.points}<span className="text-[--color-ink-soft]"> / {f.max}</span></span>
                                </div>
                            ))}
                        </div>
                        {/* Draw standing — gated */}
                        <div className="border-t mt-5 pt-4">
                            <p className="text-xs uppercase tracking-wider text-[--color-ink-soft] mb-3">
                                Draw standing
                            </p>

                            {gate.benchmarks.length === 0 ? (
                                <p className="text-sm text-[--color-ink-soft] leading-relaxed">
                                    {gate.honestSummary}
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {gate.benchmarks.map((b) => (
                                        <div key={b.category} className="flex items-center justify-between text-sm">
                                            <span className="capitalize">{b.category}</span>
                                            <span className="flex items-center gap-2">
                                                <span className="font-[family-name:--font-mono] text-[--color-ink-soft]">
                                                    {b.cutoff}
                                                </span>
                                                <span
                                                    className={`font-[family-name:--font-mono] text-xs px-1.5 py-0.5 rounded ${b.standing === "above"
                                                        ? "text-[--color-clear] bg-[color-mix(in_srgb,var(--color-clear)_15%,transparent)]"
                                                        : "text-[--color-block] bg-[color-mix(in_srgb,var(--color-block)_15%,transparent)]"
                                                        }`}
                                                >
                                                    {b.gap >= 0 ? `+${b.gap}` : b.gap}
                                                </span>
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {gate.excluded.length > 0 && (
                                <details className="mt-4">
                                    <summary className="text-xs text-[--color-ink-soft] cursor-pointer hover:text-[--color-ink]">
                                        Not eligible for {gate.excluded.length} categories
                                    </summary>
                                    <div className="mt-2 space-y-1.5">
                                        {gate.excluded.map((e) => (
                                            <div key={e.category} className="text-xs text-[--color-ink-soft] flex justify-between gap-3">
                                                <span className="capitalize">{e.category}</span>
                                                <span className="text-right opacity-70">{e.reason}</span>
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            )}
                        </div>
                    </div>
               </main>
        </>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="block text-sm text-[--color-ink-soft] mb-1.5">{label}</span>
            {children}
        </label>
    );
}