"use client";

import { useState } from "react";
import { scoreCore, type CrsProfile } from "@/lib/crs/engine/crs-core";
import { ruleset_2026_06 as ruleset } from "@/lib/crs/ruleset/ruleset-2026-06";
import type { EducationLevel } from "@/lib/crs/ruleset/types";
import { runGate } from "@/lib/crs/engine/gate";
import { LanguageTestFields, defaultLanguageResult } from "@/components/LanguageTestFields";
import { NumberField } from "@/components/NumberField";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

const EDUCATION_OPTIONS: { value: EducationLevel; label: string }[] = [
    { value: "none", label: "No formal education" },
    { value: "secondary", label: "Secondary / high school" },
    { value: "oneYearPostSecondary", label: "1-year post-secondary" },
    { value: "twoYearPostSecondary", label: "2-year post-secondary" },
    { value: "bachelors", label: "Bachelor's / 3-year" },
    { value: "twoOrMoreCredentials", label: "Two or more credentials" },
    { value: "masters", label: "Master's" },
    { value: "doctoral", label: "Doctoral" },
];

function Hint({ children }: { children: React.ReactNode }) {
    return <p className="text-xs text-muted-foreground/80 leading-relaxed">{children}</p>;
}

export default function Home() {
    const [profile, setProfile] = useState<CrsProfile>({
        age: 0,
        education: "none",
        firstLanguage: { test: "IELTS", reading: 0, writing: 0, listening: 0, speaking: 0 },
        canadianWorkYears: 0,
    });

    const score = scoreCore(profile, ruleset);

    const gate = runGate(profile, score.total, ruleset, []);

    const set = <K extends keyof CrsProfile>(key: K, value: CrsProfile[K]) =>
        setProfile((p) => ({ ...p, [key]: value }));

    return (
        <>
            <header className="h-16 shrink-0 border-b flex items-center px-8">
                <div>
                    <h1 className="font-heading text-base font-semibold leading-none">Assessment</h1>
                    <p className="text-xs text-muted-foreground mt-1">Live Comprehensive Ranking System score</p>
                </div>
            </header>

            <main className="flex-1 p-8 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
                {/* Form */}
                <div className="space-y-6 max-w-lg">
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        Fill in your profile below — the score on the right recalculates as you type.
                        Every point comes from IRCC&apos;s published CRS tables, never an AI estimate, and
                        you&apos;re only compared against Express Entry draws you&apos;d actually qualify for.
                    </p>

                    <Card>
                        <CardHeader>
                            <CardTitle>1. Personal & education</CardTitle>
                            <CardDescription>
                                Age and education are scored on their own, then again together with
                                language under skill transferability.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-muted-foreground font-normal">Age</Label>
                                    <NumberField value={profile.age} min={17} max={45}
                                        onChange={(v) => set("age", v)} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-muted-foreground font-normal">
                                        Canadian work (years)
                                    </Label>
                                    <NumberField value={profile.canadianWorkYears} min={0} max={5}
                                        onChange={(v) => set("canadianWorkYears", v)} />
                                </div>
                            </div>
                            <Hint>Age scores peak from 20–29 and drop to 0 past 45.</Hint>

                            <div className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground font-normal">Education</Label>
                                <Select value={profile.education}
                                    onValueChange={(v) => set("education", v as EducationLevel)}>
                                    <SelectTrigger className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {EDUCATION_OPTIONS.map((o) => (
                                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>2. Spouse or common-law partner</CardTitle>
                            <CardDescription>
                                Only if they&apos;re immigrating with you — this swaps in IRCC&apos;s reduced
                                core-factor scale and adds a separate points group for their profile.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between rounded-lg border p-3">
                                <div>
                                    <Label htmlFor="spouse" className="text-sm font-normal">Married / common-law, coming with you</Label>
                                    <p className="text-xs text-muted-foreground/80 mt-0.5">
                                        Leave off if you&apos;re single, or if your spouse isn&apos;t immigrating with you.
                                    </p>
                                </div>
                                <Switch id="spouse"
                                    checked={profile.spouseAccompanying ?? false}
                                    onCheckedChange={(checked) =>
                                        setProfile((p) => ({
                                            ...p,
                                            spouseAccompanying: checked,
                                            spouseEducation: checked ? (p.spouseEducation ?? "none") : undefined,
                                            spouseLanguage: checked
                                                ? (p.spouseLanguage ?? defaultLanguageResult("IELTS", ruleset))
                                                : undefined,
                                            spouseCanadianWorkYears: checked ? (p.spouseCanadianWorkYears ?? 0) : undefined,
                                        }))
                                    }
                                />
                            </div>

                            {profile.spouseAccompanying && (
                                <div className="space-y-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs text-muted-foreground font-normal">Spouse&apos;s education</Label>
                                        <Select value={profile.spouseEducation ?? "none"}
                                            onValueChange={(v) => set("spouseEducation", v as EducationLevel)}>
                                            <SelectTrigger className="w-full">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {EDUCATION_OPTIONS.map((o) => (
                                                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs text-muted-foreground font-normal">
                                            Spouse&apos;s Canadian work experience (years)
                                        </Label>
                                        <NumberField value={profile.spouseCanadianWorkYears ?? 0} min={0} max={5}
                                            onChange={(v) => set("spouseCanadianWorkYears", v)} />
                                    </div>

                                    <div>
                                        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
                                            Spouse&apos;s language test
                                        </p>
                                        {profile.spouseLanguage && (
                                            <LanguageTestFields
                                                value={profile.spouseLanguage}
                                                onChange={(v) => set("spouseLanguage", v)}
                                                ruleset={ruleset}
                                            />
                                        )}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>3. Language</CardTitle>
                            <CardDescription>
                                Each skill converts to a CLB level on its own — IRCC never averages
                                reading, writing, listening, and speaking together.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            <div>
                                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
                                    First official language
                                </p>
                                <LanguageTestFields
                                    value={profile.firstLanguage}
                                    onChange={(v) => set("firstLanguage", v)}
                                    ruleset={ruleset}
                                />
                            </div>

                            <Separator />

                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                                        Second official language
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            set(
                                                "secondLanguage",
                                                profile.secondLanguage ? undefined : defaultLanguageResult("CELPIP", ruleset),
                                            )
                                        }
                                        className="text-xs text-primary hover:underline"
                                    >
                                        {profile.secondLanguage ? "Remove" : "+ Add"}
                                    </button>
                                </div>
                                <Hint>
                                    Optional — most applicants don&apos;t have a second test. Worth up to 24
                                    points, plus a bonus (25–50 points) if you test strong in French (NCLC 7+).
                                </Hint>
                                {profile.secondLanguage && (
                                    <LanguageTestFields
                                        value={profile.secondLanguage}
                                        onChange={(v) => set("secondLanguage", v)}
                                        ruleset={ruleset}
                                    />
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>4. Additional factors</CardTitle>
                            <CardDescription>Situational bonuses — leave anything that doesn&apos;t apply at zero.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground font-normal">
                                    Foreign skilled work (years)
                                </Label>
                                <NumberField value={profile.foreignWorkYears ?? 0} min={0} max={10}
                                    onChange={(v) => set("foreignWorkYears", v)} />
                            </div>

                            <div className="rounded-lg border p-3 space-y-3">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="cdn-credential" className="text-sm font-normal">
                                        Earned a Canadian degree, diploma, or certificate?
                                    </Label>
                                    <Switch id="cdn-credential"
                                        checked={Boolean(profile.canadianCredential)}
                                        onCheckedChange={(checked) =>
                                            set("canadianCredential", checked ? "oneOrTwoYears" : undefined)
                                        }
                                    />
                                </div>
                                <Hint>
                                    To answer yes: ESL/FSL wasn&apos;t more than half your study, no
                                    obligation to return home to apply your skills, studied at a school
                                    within Canada (foreign campuses don&apos;t count), and you were enrolled
                                    full-time and physically in Canada for at least 8 months (unless the
                                    program fell between March 2020 and August 2022).
                                </Hint>
                                {profile.canadianCredential && (
                                    <Select value={profile.canadianCredential}
                                        onValueChange={(v) => set("canadianCredential", v as "oneOrTwoYears" | "threeYearsPlus")}>
                                        <SelectTrigger className="w-full">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="oneOrTwoYears">1 or 2 year credential</SelectItem>
                                            <SelectItem value="threeYearsPlus">3+ years, or Master&apos;s/professional/doctoral</SelectItem>
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>

                            <div className="flex items-center justify-between rounded-lg border p-3">
                                <div>
                                    <Label htmlFor="pnp" className="text-sm font-normal">Provincial nomination</Label>
                                    <p className="text-xs text-muted-foreground/80 mt-0.5">Worth 600 points on its own — effectively guarantees an invitation.</p>
                                </div>
                                <Switch id="pnp"
                                    checked={profile.provincialNomination ?? false}
                                    onCheckedChange={(v) => set("provincialNomination", v)} />
                            </div>
                            <div className="flex items-center justify-between rounded-lg border p-3">
                                <div>
                                    <Label htmlFor="sibling" className="text-sm font-normal">Sibling in Canada</Label>
                                    <p className="text-xs text-muted-foreground/80 mt-0.5">A citizen or PR, 18+, living in Canada.</p>
                                </div>
                                <Switch id="sibling"
                                    checked={profile.siblingInCanada ?? false}
                                    onCheckedChange={(v) => set("siblingInCanada", v)} />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Live score */}
                <div className="space-y-6 h-fit sticky top-8">
                    <Card>
                        <CardHeader>
                            <CardTitle>Your CRS score</CardTitle>
                            <CardDescription>Recalculates live as you edit the form.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="font-mono text-5xl font-bold text-foreground">{score.total}</p>
                            <div className="space-y-3 border-t mt-5 pt-4">
                                {score.factors.map((f) => (
                                    <div key={f.factor} className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">{f.factor}</span>
                                        <span className="font-mono text-foreground">{f.points}<span className="text-muted-foreground"> / {f.max}</span></span>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Draw standing</CardTitle>
                            <CardDescription>
                                Only benchmarked against categories you&apos;re actually eligible for —
                                never a bogus comparison against a draw you couldn&apos;t stand in.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {gate.benchmarks.length === 0 ? (
                                <p className="text-sm text-muted-foreground leading-relaxed">
                                    {gate.honestSummary}
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {gate.benchmarks.map((b) => (
                                        <div key={b.category} className="flex items-center justify-between text-sm">
                                            <span className="capitalize">{b.category}</span>
                                            <span className="flex items-center gap-2">
                                                <span className="font-mono text-muted-foreground">
                                                    {b.cutoff}
                                                </span>
                                                <Badge
                                                    variant={b.standing === "above" ? "outline" : "destructive"}
                                                    className={
                                                        b.standing === "above"
                                                            ? "font-mono border-clear/30 bg-clear/10 text-clear"
                                                            : "font-mono"
                                                    }
                                                >
                                                    {b.gap >= 0 ? `+${b.gap}` : b.gap}
                                                </Badge>
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {gate.excluded.length > 0 && (
                                <details className="mt-4">
                                    <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                                        Not eligible for {gate.excluded.length} categories
                                    </summary>
                                    <div className="mt-2 space-y-1.5">
                                        {gate.excluded.map((e) => (
                                            <div key={e.category} className="text-xs text-muted-foreground flex justify-between gap-3">
                                                <span className="capitalize">{e.category}</span>
                                                <span className="text-right opacity-70">{e.reason}</span>
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            )}
                        </CardContent>
                    </Card>
                </div>
           </main>
        </>
    );
}
