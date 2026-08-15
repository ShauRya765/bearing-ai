"use client";

import { useEffect, useRef, useState } from "react";
import { scoreCore, type CrsProfile } from "@/lib/crs/engine/crs-core";
import { ruleset_2026_08 as ruleset } from "@/lib/crs/ruleset/ruleset-2026-08";
import type { EducationLevel } from "@/lib/crs/ruleset/types";
import { runGate } from "@/lib/crs/engine/gate";
import { findOccupation, eligibleCategories } from "@/lib/crs/ruleset/noc-categories";
import { NocCombobox } from "@/components/NocCombobox";
import { TrackView, track } from "@/components/TrackView";
import { LanguageTestFields, defaultLanguageResult } from "@/components/LanguageTestFields";
import { ImprovementSuggestions } from "@/components/ImprovementSuggestions";
import { ScoreResult } from "@/components/ScoreResult";
import { ScoreBar } from "@/components/ScoreBar";
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
    return <p className="text-xs text-muted-foreground/70 leading-relaxed">{children}</p>;
}

// The form has three colour tiers, and they carry meaning:
//   amber   — structure. Section numbers and group headers, for navigating.
//   ink     — things you act on. Field labels and switch labels.
//   muted   — things you read only if unsure. Descriptions and hints.
// Every level used to be one grey, which put the label you must read at the
// same weight as the prose you can skip.
function SectionTitle({ n, children }: { n: string; children: React.ReactNode }) {
    return (
        <CardTitle className="flex items-baseline gap-2.5">
            <span className="font-mono text-xs text-primary">{n}</span>
            <span>{children}</span>
        </CardTitle>
    );
}

export default function Home() {
    const [profile, setProfile] = useState<CrsProfile>({
        age: 0,
        education: "none",
        firstLanguage: { test: "IELTS", reading: 0, writing: 0, listening: 0, speaking: 0 },
        canadianWorkYears: 0,
    });

    // Occupation lives outside CrsProfile on purpose: it earns no CRS points, it
    // only decides which category draws may benchmark this candidate. The engine
    // scores; the gate decides who you can be compared to.
    const [nocCode, setNocCode] = useState<string | undefined>(undefined);
    const [hasTwelveMonths, setHasTwelveMonths] = useState(false);
    const [experienceInCanada, setExperienceInCanada] = useState(false);

    const score = scoreCore(profile, ruleset);

    const occupation = findOccupation(nocCode);
    const occupationCategories = eligibleCategories(
        nocCode,
        hasTwelveMonths,
        experienceInCanada,
    );

    const gate = runGate(profile, score.total, ruleset, occupationCategories);

    // Count ONE score per visit. The score recomputes on every keystroke, so
    // counting each recalculation would report typing speed, not usage. The
    // first total above zero means the visitor actually entered something real;
    // the ref makes it fire exactly once for the life of this page.
    const scoreCounted = useRef(false);
    useEffect(() => {
        if (scoreCounted.current || score.total <= 0) return;
        scoreCounted.current = true;
        track("score_calculated");
    }, [score.total]);

    const set = <K extends keyof CrsProfile>(key: K, value: CrsProfile[K]) =>
        setProfile((p) => ({ ...p, [key]: value }));

    return (
        <>
            <TrackView name="assessment_view" />
            <ScoreBar score={score} gate={gate} />

            <main className="flex-1 p-8">
                <div className="mx-auto max-w-2xl space-y-6">
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        Fill in your profile below — the score up top recalculates as you type.
                        Every point comes from IRCC&apos;s published CRS tables, never an AI estimate, and
                        you&apos;re only compared against Express Entry draws you&apos;d actually qualify for.
                    </p>

                    <Card>
                        <CardHeader>
                            <SectionTitle n="01">Personal &amp; education</SectionTitle>
                            <CardDescription>
                                Age and education are scored on their own, then again together with
                                language under skill transferability.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-foreground/90 font-normal">Age</Label>
                                    <NumberField value={profile.age} min={17} max={45}
                                        onChange={(v) => set("age", v)} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-foreground/90 font-normal">
                                        Canadian work (years)
                                    </Label>
                                    <NumberField value={profile.canadianWorkYears} min={0} max={5}
                                        onChange={(v) => set("canadianWorkYears", v)} />
                                </div>
                            </div>
                            <Hint>Age scores peak from 20–29 and drop to 0 past 45.</Hint>

                            <div className="space-y-1.5">
                                <Label className="text-xs text-foreground/90 font-normal">Education</Label>
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
                            <SectionTitle n="02">Spouse or common-law partner</SectionTitle>
                            <CardDescription>
                                Only if they&apos;re immigrating with you — this swaps in IRCC&apos;s reduced
                                core-factor scale and adds a separate points group for their profile.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between rounded-lg border p-3">
                                <div>
                                    <Label htmlFor="spouse" className="text-sm font-normal">Married / common-law, coming with you</Label>
                                    <p className="text-xs text-muted-foreground/70 mt-0.5">
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
                                        <Label className="text-xs text-foreground/90 font-normal">Spouse&apos;s education</Label>
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
                                        <Label className="text-xs text-foreground/90 font-normal">
                                            Spouse&apos;s Canadian work experience (years)
                                        </Label>
                                        <NumberField value={profile.spouseCanadianWorkYears ?? 0} min={0} max={5}
                                            onChange={(v) => set("spouseCanadianWorkYears", v)} />
                                    </div>

                                    <div>
                                        <p className="font-mono text-xs uppercase tracking-[0.14em] text-primary/90 mb-3">
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
                            <SectionTitle n="03">Language</SectionTitle>
                            <CardDescription>
                                Each skill converts to a CLB level on its own — IRCC never averages
                                reading, writing, listening, and speaking together.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            <div>
                                <p className="font-mono text-xs uppercase tracking-[0.14em] text-primary/90 mb-3">
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
                                    <p className="font-mono text-xs uppercase tracking-[0.14em] text-primary/90">
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
                            <SectionTitle n="04">Additional factors</SectionTitle>
                            <CardDescription>Situational bonuses — leave anything that doesn&apos;t apply at zero.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs text-foreground/90 font-normal">
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

                            <div className="rounded-lg border p-3 space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                    <Label htmlFor="trade-cert" className="text-sm font-normal">
                                        Do you have a certificate of qualification from a Canadian
                                        province, territory or federal body?
                                    </Label>
                                    <Switch id="trade-cert"
                                        checked={profile.hasTradeCertificate ?? false}
                                        onCheckedChange={(v) => set("hasTradeCertificate", v)}
                                    />
                                </div>
                                <Hint>
                                    A certificate of qualification lets you work in some skilled
                                    trades in Canada. Only a province, territory, or a federal body
                                    can issue one, and you have to have your training and experience
                                    assessed and pass a certification exam to get it. This
                                    isn&apos;t the same as a nomination from a province or
                                    territory. Worth up to 50 points under skill transferability.
                                </Hint>
                            </div>

                            <div className="flex items-center justify-between rounded-lg border p-3">
                                <div>
                                    <Label htmlFor="pnp" className="text-sm font-normal">Provincial nomination</Label>
                                    <p className="text-xs text-muted-foreground/70 mt-0.5">Worth 600 points on its own — effectively guarantees an invitation.</p>
                                </div>
                                <Switch id="pnp"
                                    checked={profile.provincialNomination ?? false}
                                    onCheckedChange={(v) => set("provincialNomination", v)} />
                            </div>
                            <div className="flex items-center justify-between rounded-lg border p-3">
                                <div>
                                    <Label htmlFor="sibling" className="text-sm font-normal">Sibling in Canada</Label>
                                    <p className="text-xs text-muted-foreground/70 mt-0.5">A citizen or PR, 18+, living in Canada.</p>
                                </div>
                                <Switch id="sibling"
                                    checked={profile.siblingInCanada ?? false}
                                    onCheckedChange={(v) => set("siblingInCanada", v)} />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <SectionTitle n="05">Your occupation</SectionTitle>
                            <CardDescription>
                                This earns no CRS points. It decides something separate — which
                                category draws are allowed to invite you at all.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs text-foreground/90 font-normal">
                                    Occupation (2021 NOC)
                                </Label>
                                <NocCombobox
                                    value={nocCode}
                                    onChange={(noc) => {
                                        setNocCode(noc);
                                        if (!noc) {
                                            setHasTwelveMonths(false);
                                            setExperienceInCanada(false);
                                        }
                                    }}
                                />
                                <Hint>
                                    All 516 NOC unit groups are here — search by job title or code.
                                    Most occupations aren&apos;t covered by any category draw, which
                                    is normal; you&apos;d be invited through a general or provincial
                                    draw instead.
                                </Hint>
                                <p className="text-xs leading-relaxed text-muted-foreground/80">
                                    <span className="text-foreground">Check before you apply.</span>{" "}
                                    Picking the wrong NOC is one of the most common reasons an
                                    application is refused. Confirm yours against the duties listed
                                    on IRCC&apos;s official tool —{" "}
                                    <a
                                        href="https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/find-national-occupation-code.html"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary hover:underline"
                                    >
                                        Find your NOC ↗
                                    </a>
                                    . Your job title matters less than what you actually did.
                                </p>
                            </div>

                            {occupation && (
                                <>
                                    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                                        <div>
                                            <Label htmlFor="occ-12m" className="text-sm font-normal">
                                                12+ months in this occupation in the past 3 years?
                                            </Label>
                                            <p className="text-xs text-muted-foreground/70 mt-0.5">
                                                Full-time, or the same total hours part-time. It
                                                doesn&apos;t have to be continuous. Without this, no
                                                category draw can invite you.
                                            </p>
                                        </div>
                                        <Switch id="occ-12m"
                                            checked={hasTwelveMonths}
                                            onCheckedChange={setHasTwelveMonths} />
                                    </div>

                                    {hasTwelveMonths && (
                                        <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                                            <div>
                                                <Label htmlFor="occ-canada" className="text-sm font-normal">
                                                    Was that experience in Canada?
                                                </Label>
                                                <p className="text-xs text-muted-foreground/70 mt-0.5">
                                                    Most categories accept work from anywhere. The
                                                    physician, senior manager, and researcher
                                                    categories only count Canadian experience.
                                                </p>
                                            </div>
                                            <Switch id="occ-canada"
                                                checked={experienceInCanada}
                                                onCheckedChange={setExperienceInCanada} />
                                        </div>
                                    )}

                                    <div className="rounded-lg border p-3 space-y-2">
                                        <p className="font-mono text-xs uppercase tracking-[0.14em] text-primary/90">
                                            Category draws this opens
                                        </p>
                                        {occupationCategories.length === 0 ? (
                                            <p className="text-xs text-muted-foreground/70 leading-relaxed">
                                                None yet. {occupation.title} is on IRCC&apos;s list
                                                for{" "}
                                                {occupation.categories.length === 1
                                                    ? "1 category"
                                                    : `${occupation.categories.length} categories`}
                                                , but the experience conditions above aren&apos;t met,
                                                so you can&apos;t be invited from{" "}
                                                {occupation.categories.length === 1 ? "it" : "them"} yet.
                                            </p>
                                        ) : (
                                            <div className="flex flex-wrap gap-1.5">
                                                {occupationCategories.map((c) => (
                                                    <Badge key={c} variant="outline"
                                                        className="font-mono border-clear/30 bg-clear/10 text-clear capitalize">
                                                        {c}
                                                    </Badge>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </Card>

                    {/* Result detail — full breakdown & honest draw standing */}
                    <ScoreResult score={score} gate={gate} />

                    <ImprovementSuggestions profile={profile} ruleset={ruleset} />

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
