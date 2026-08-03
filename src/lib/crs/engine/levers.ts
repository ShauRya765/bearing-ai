import type { Ruleset, LanguageTest } from "@/lib/crs/ruleset/types";
import { scoreCore, type CrsProfile } from "@/lib/crs/engine/crs-core";
import { toCLB, type RawLanguageResult } from "@/lib/crs/engine/clb";

// A concrete way to raise the score. The `delta` is NEVER estimated — it's the
// exact difference between the live score and a re-run of the deterministic
// engine with this one variable perturbed. RAG explains; the engine counts.
export interface Lever {
    id: string;
    title: string;
    requirement: string;
    delta: number;
    /**
     * Set when `delta` is smaller than the factor is nominally worth because a
     * group cap swallowed the rest. Without this, a profile already near the
     * 100-point skill-transferability ceiling sees "+12" next to copy saying
     * "worth up to 50" and reasonably concludes the number is broken. The
     * delta is right; the shortfall needs saying out loud.
     */
    cappedBy?: string;
    source: { title: string; url: string };
}

const SRC = {
    grid: {
        title: "IRCC — Comprehensive Ranking System grid",
        url: "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/eligibility/criteria-comprehensive-ranking-system/grid.html",
    },
    pnp: {
        title: "IRCC — Provincial nominees (Express Entry)",
        url: "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/provincial-nominees/express-entry/eligibility.html",
    },
    language: {
        title: "IRCC — Language requirements (CLB / NCLC)",
        url: "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/documents/language-requirements.html",
    },
    frenchCategory: {
        title: "IRCC — Category-based selection (French proficiency)",
        url: "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/submit-profile/rounds-invitations/category-based-selection.html",
    },
    study: {
        title: "IRCC — Study in Canada (Express Entry points)",
        url: "https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada.html",
    },
} as const;

// A raw result that lands exactly on CLB `target` in every skill, so a
// counterfactual retest is scored the same way a real one would be.
function resultAtClb(
    test: LanguageTest,
    target: number,
    ruleset: Ruleset,
): RawLanguageResult | null {
    const row = (ruleset.language[test] ?? []).find((r) => r.clb === target);
    if (!row) return null;
    return {
        test,
        reading: row.reading,
        writing: row.writing,
        listening: row.listening,
        speaking: row.speaking,
    };
}

function hasFrenchTest(profile: CrsProfile): boolean {
    return [profile.firstLanguage, profile.secondLanguage].some(
        (r) => r && (r.test === "TEF" || r.test === "TCF"),
    );
}

/**
 * Concrete, engine-verified ways to raise the score — surfaced whether or not
 * the factor has a form field yet (French and the certificate of qualification
 * don't). Each delta is a real counterfactual re-run, ranked by impact.
 */
export function gapLevers(profile: CrsProfile, ruleset: Ruleset): Lever[] {
    const base = scoreCore(profile, ruleset).total;
    const levers: Lever[] = [];

    const baseScore = scoreCore(profile, ruleset);

    const consider = (
        lever: Omit<Lever, "delta" | "cappedBy">,
        mutate: (p: CrsProfile) => void,
    ) => {
        const next = structuredClone(profile);
        mutate(next);
        const nextScore = scoreCore(next, ruleset);
        const delta = nextScore.total - base;
        if (delta <= 0) return;

        // If a factor this lever moved ended up pinned to its own maximum, the
        // lever was worth more than the score could absorb. Name the factor and
        // where it already stood, so the delta reads as a ceiling rather than a
        // miscalculation.
        const saturatedIndex = nextScore.factors.findIndex((f, i) => {
            const before = baseScore.factors[i];
            return f.points > before.points && f.points === f.max && before.points < before.max;
        });
        let cappedBy: string | undefined;
        if (saturatedIndex >= 0) {
            const after = nextScore.factors[saturatedIndex];
            const before = baseScore.factors[saturatedIndex];
            // The factor's own gain, not the total delta — a lever can move
            // more than one factor.
            const fits = after.points - before.points;
            cappedBy = `Your ${after.factor.toLowerCase()} is already at ${before.points}/${after.max}, so only ${fits} of these points fit before the cap.`;
        }

        levers.push({ ...lever, delta, ...(cappedBy ? { cappedBy } : {}) });
    };

    // Provincial nomination — the single biggest lever when absent.
    if (!profile.provincialNomination) {
        consider(
            {
                id: "pnp",
                title: "Secure a provincial nomination",
                requirement:
                    "An enhanced nomination from any Provincial Nominee Program stream.",
                source: SRC.pnp,
            },
            (p) => (p.provincialNomination = true),
        );
    }

    // Strong French — always worth flagging when there's no French test at all.
    // Pays second-language points plus the French bonus (25–50), and opens the
    // French-proficiency category draws.
    if (!hasFrenchTest(profile)) {
        const french = resultAtClb("TEF", 7, ruleset);
        if (french) {
            consider(
                {
                    id: "french",
                    title: "Add a strong French test",
                    requirement:
                        "A TEF/TCF result at NCLC 7 (CLB 7) or higher in all four abilities — adds second-language points plus the French bonus.",
                    source: SRC.frenchCategory,
                },
                (p) => {
                    // Use whichever slot is free so we never overwrite an
                    // existing (English) test.
                    if (
                        !p.secondLanguage ||
                        p.secondLanguage.test === "TEF" ||
                        p.secondLanguage.test === "TCF"
                    ) {
                        p.secondLanguage = french;
                    } else {
                        p.firstLanguage = french;
                    }
                },
            );
        }
    }

    // Certificate of qualification — a straight transferability lever (up to 50
    // points at CLB 7+), and there's no form field for it yet.
    if (!profile.hasTradeCertificate) {
        consider(
            {
                id: "trade",
                title: "Earn a certificate of qualification",
                requirement:
                    "A provincial/territorial certificate of qualification in a skilled trade. Pays 50 skill-transferability points at CLB 7+ on all four abilities, 25 at CLB 5+.",
                source: SRC.grid,
            },
            (p) => (p.hasTradeCertificate = true),
        );
    }

    // Canadian post-secondary credential — additional points.
    if (!profile.canadianCredential) {
        consider(
            {
                id: "cdn-study",
                title: "Complete a Canadian credential",
                requirement:
                    "A completed one- or two-year Canadian post-secondary credential (more for 3+ years / graduate degrees).",
                source: SRC.study,
            },
            (p) => (p.canadianCredential = "oneOrTwoYears"),
        );
    }

    // Raise the first official language to CLB 9 — moves language points AND
    // unlocks the top skill-transferability tier.
    const floor = toCLB(profile.firstLanguage, ruleset).floor;
    if (floor < 9) {
        const clb9 = resultAtClb(profile.firstLanguage.test, 9, ruleset);
        if (clb9) {
            consider(
                {
                    id: "lang9",
                    title: "Raise first language to CLB 9",
                    requirement:
                        "Retest to CLB 9 in reading, writing, listening and speaking — the transferability tables jump at CLB 9.",
                    source: SRC.language,
                },
                (p) => (p.firstLanguage = clb9),
            );
        }
    }

    return levers.sort((a, b) => b.delta - a.delta);
}
