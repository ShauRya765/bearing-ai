// Starter corpus. Each chunk is a self-contained rule statement with a real
// source URL. Paraphrased into clean, retrievable units — expand later by
// ingesting full IRCC pages. Keep chunks focused: one rule per chunk retrieves
// far better than long mixed passages.

export interface RuleSource {
  content: string;
  sourceTitle: string;
  sourceUrl: string;
}

export const RULE_SOURCES: RuleSource[] = [
  {
    content:
      "The Canadian Experience Class (CEC) requires at least one year of skilled work experience in Canada (TEER 0, 1, 2, or 3) gained within the three years before applying, with authorization to work. The experience can be full-time or an equal amount in part-time.",
    sourceTitle: "Canadian Experience Class — eligibility",
    sourceUrl:
      "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/eligibility/canadian-experience-class.html",
  },
  {
    content:
      "Category-based Express Entry draws invite candidates who qualify for a specific category, such as healthcare, STEM occupations, trades, transport, agri-food, or strong French-language proficiency. A candidate must meet the category's eligibility, defined by IRCC for each round, to be considered in that draw regardless of their CRS score.",
    sourceTitle: "Express Entry — category-based selection",
    sourceUrl:
      "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/submit-profile/rounds-invitations/category-based-selection.html",
  },
  {
    content:
      "A provincial nomination through the Provincial Nominee Program adds 600 points to a candidate's Comprehensive Ranking System score, effectively guaranteeing an invitation to apply in a subsequent Express Entry round.",
    sourceTitle: "Provincial Nominee Program — Express Entry",
    sourceUrl:
      "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/eligibility/provincial-nominees.html",
  },
  {
    content:
      "To be eligible for Express Entry programs, candidates must meet minimum language requirements. Federal Skilled Worker and Canadian Experience Class (for TEER 0 or 1 jobs) require Canadian Language Benchmark 7 in all four abilities. Language ability is assessed per skill; the lowest ability determines program eligibility.",
    sourceTitle: "Express Entry — language requirements",
    sourceUrl:
      "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/documents/language-requirements.html",
  },
  {
    content:
      "The Comprehensive Ranking System awards points for skill transferability, combining education, foreign work experience, and Canadian work experience with strong language ability. Skill transferability points are capped at 100 total.",
    sourceTitle: "Comprehensive Ranking System — skill transferability",
    sourceUrl:
      "https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/eligibility/criteria-comprehensive-ranking-system/grid.html",
  },
];