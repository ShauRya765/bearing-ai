// The evaluation set for RAG retrieval.
//
// Questions are deliberately worded the way a user would ask them, NOT in the
// vocabulary of the card that answers them ("I work two part-time jobs" vs the
// card's "1,560 hours"). Retrieval that only works when the question echoes the
// source is keyword search wearing an embedding costume — this set is built to
// catch that.
//
// `expect` lists the source_title of every card that genuinely answers the
// question. Titles must match okf frontmatter `title` exactly, since that is
// what ingest.ts writes to rule_chunks.source_title.
//
// An empty `expect` means the corpus does not cover the question and the right
// behaviour is to say so. These are the cases a RAG system fails silently and
// expensively, so they are part of the eval, not an afterthought.
//
// The corpus holds both federal rules and a provincial stream, and they quote
// different numbers for the same-sounding things — CLB floors, work-experience
// months, TEER bands, test recency. A question phrased federally must not be
// answered with Ontario's figures, and vice versa. Several `hard` questions below
// exist only to catch that swap, so keep the federal/provincial wording in them
// explicit when editing.
//
// `hard: true` marks questions chosen to be adversarial rather than typical:
// ones that use none of the card's words, that span two cards, or that sit
// close to a neighbouring card and could plausibly retrieve the wrong one.
// Scoring them separately keeps an easy average from hiding a real weakness.

export interface EvalQuestion {
  q: string;
  expect: string[];
  hard?: boolean;
}

export const EVAL_QUESTIONS: EvalQuestion[] = [
  // ---- Provincial nomination ----
  { q: "Ontario picked me from the pool. How much is that actually worth?", expect: ["Provincial nomination"] },
  { q: "What's the difference between a base and an enhanced nomination?", expect: ["Provincial nomination"] },
  { q: "Is 600 points basically a guaranteed invite?", expect: ["Provincial nomination"] },
  { q: "A province wants me but it's not through Express Entry. Do I still get the points?", expect: ["Provincial nomination"], hard: true },
  { q: "How do I actually claim a nomination once I have the certificate?", expect: ["Provincial nomination"] },
  { q: "Does every province nominate people the same way Ontario does?", expect: ["Provincial nomination"], hard: true },

  // ---- Canadian study ----
  { q: "I did a two-year diploma at a college in Toronto. Does that add anything?", expect: ["Canadian study additional points"] },
  { q: "Does a degree from a Canadian university's overseas campus count?", expect: ["Canadian study additional points"], hard: true },
  { q: "I was on a scholarship that required me to go home after. Does my Canadian diploma still count?", expect: ["Canadian study additional points"], hard: true },
  { q: "Most of my program was English language classes. Is that a problem?", expect: ["Canadian study additional points"], hard: true },
  { q: "How many extra points for a master's I earned in Canada?", expect: ["Canadian study additional points"] },
  { q: "I graduated from an Ontario college last year. What does that add to my CRS score?", expect: ["Canadian study additional points"], hard: true },

  // ---- Work experience hours ----
  { q: "I have two part-time jobs. Do they count as full-time experience?", expect: ["Work experience hours — full-time vs part-time"] },
  { q: "I work 45 hours a week. Does the extra time get me there faster?", expect: ["Work experience hours — full-time vs part-time"], hard: true },
  { q: "Does my unpaid internship count toward my experience?", expect: ["Work experience hours — full-time vs part-time"], hard: true },
  { q: "How many hours is a year of experience?", expect: ["Work experience hours — full-time vs part-time"] },
  { q: "I took three months off in the middle. Does my experience have to be continuous?", expect: ["Work experience hours — full-time vs part-time"], hard: true },

  // ---- CLB 7 / eligibility floor ----
  { q: "What's the minimum English level to even be eligible?", expect: ["CLB 7 in all abilities"] },
  { q: "I've seen CLB 5, 6 and 7 quoted as the minimum. Which one applies to me federally?", expect: ["CLB 7 in all abilities"], hard: true },
  { q: "My English is CLB 6 across the board. Does that get me into the pool?", expect: ["CLB 7 in all abilities"], hard: true },
  { q: "My reading is weak but the other three are strong. Is that a problem?", expect: ["CLB 7 in all abilities", "First official language points"], hard: true },
  { q: "Can I average my four test scores together?", expect: ["CLB 7 in all abilities", "First official language points"], hard: true },

  // ---- First official language ----
  { q: "Is it worth pushing my speaking from an 8 to a 9?", expect: ["First official language points", "Skill transferability"], hard: true },
  { q: "How many points per skill at CLB 9?", expect: ["First official language points"] },
  { q: "What's the single most effective way to raise my score?", expect: ["First official language points"], hard: true },
  { q: "Does having a spouse change my language points?", expect: ["First official language points"], hard: true },

  // ---- Second language ----
  { q: "How many points can a weaker second language get me?", expect: ["Second official language points"] },
  { q: "I tested in both English and French. What does the weaker one earn?", expect: ["Second official language points"] },
  { q: "Is there a cap on second language points?", expect: ["Second official language points"] },

  // ---- French bonus ----
  { q: "My English is already strong. Any reason to learn French?", expect: ["French-language bonus points", "Second official language points"], hard: true },
  { q: "I took the TEF and scored NCLC 8 everywhere. What do I get?", expect: ["French-language bonus points"] },
  { q: "I speak French but never took an English test. Do I still get the bonus?", expect: ["French-language bonus points"], hard: true },
  { q: "Why do French speakers seem to get in with lower scores?", expect: ["French-language bonus points", "Category-based selection"], hard: true },

  // ---- Certificate of qualification ----
  { q: "I'm a plumber certified in Alberta. Does the trade ticket help my score?", expect: ["Certificate of qualification (skilled trades)"] },
  { q: "Is a trade certificate the same as a provincial nomination?", expect: ["Certificate of qualification (skilled trades)"], hard: true },
  { q: "Who issues a certificate of qualification?", expect: ["Certificate of qualification (skilled trades)"] },
  { q: "My English is CLB 6 and I have a trade ticket. What's it worth?", expect: ["Certificate of qualification (skilled trades)"], hard: true },
  { q: "I'm in the trades with only a high school diploma. Does that limit my CRS points?", expect: ["Certificate of qualification (skilled trades)"], hard: true },

  // ---- Skill transferability ----
  { q: "Can my degree and my work history combine into extra points?", expect: ["Skill transferability"] },
  { q: "Is there a ceiling on the combination points?", expect: ["Skill transferability"] },
  { q: "Do my foreign work years pair with anything?", expect: ["Skill transferability"] },

  // ---- Category-based selection ----
  { q: "Why do nurses seem to get invited with lower scores than me?", expect: ["Category-based selection"] },
  { q: "My score is high but my job isn't on any list. Can I still be picked in a targeted round?", expect: ["Category-based selection"], hard: true },
  { q: "Which job fields get their own rounds?", expect: ["Category-based selection"] },

  // ---- CEC ----
  { q: "I've been working in Canada on a permit for a year. Which program fits me?", expect: ["Canadian Experience Class"] },
  { q: "My Canadian job was TEER 3. Does that qualify me?", expect: ["Canadian Experience Class"], hard: true },
  { q: "I worked in Canada five years ago. Is that still usable?", expect: ["Canadian Experience Class"], hard: true },
  { q: "I've got nine months of Canadian experience. Is that enough for the federal program?", expect: ["Canadian Experience Class"], hard: true },
  { q: "My Canadian job is TEER 4. Which federal program can I use?", expect: ["Canadian Experience Class"], hard: true },

  // ---- Express Entry ----
  { q: "What is Express Entry, in plain terms?", expect: ["Express Entry"] },
  { q: "Which programs does the system actually cover?", expect: ["Express Entry"] },
  { q: "How does anyone get picked out of the pool?", expect: ["Express Entry"], hard: true },

  // ---- OINP Ontario Workforce Priority ----
  { q: "My employer in Toronto offered me a permanent job. Is there an Ontario stream for that?", expect: ["OINP Ontario Workforce Priority stream"] },
  { q: "My job is TEER 5. Can Ontario still nominate me, and do I get the 600 points?", expect: ["OINP Ontario Workforce Priority stream", "Provincial nomination"], hard: true },
  { q: "I let my Express Entry profile expire after Ontario nominated me. Does that matter?", expect: ["OINP Ontario Workforce Priority stream"], hard: true },
  { q: "I'm a doctor billing OHIP with no employer. Can I still apply through Ontario?", expect: ["OINP Ontario Workforce Priority stream"], hard: true },
  { q: "Does the Ontario job offer have to be permanent, or will a contract do?", expect: ["OINP Ontario Workforce Priority stream"] },

  // ---- OINP eligibility thresholds ----
  // Split from the stream card so each embedding covers one topic. These are the
  // provincial numbers; the federal-sounding twins are in the CLB 7 and CEC blocks.
  { q: "Does Ontario care how old my language test is when I apply to that stream?", expect: ["OINP Workforce Priority eligibility requirements"] },
  { q: "What CLB does Ontario want if my job offer is TEER 4?", expect: ["OINP Workforce Priority eligibility requirements"] },
  { q: "How much experience does Ontario need if I've been in the job six months?", expect: ["OINP Workforce Priority eligibility requirements"] },
  { q: "I only finished high school but I'm a welder. Can Ontario still take me?", expect: ["OINP Workforce Priority eligibility requirements"], hard: true },
  { q: "I just graduated from a college in Ottawa. Does Ontario waive anything for me?", expect: ["OINP Workforce Priority eligibility requirements"], hard: true },

  // ---- OINP application process ----
  { q: "How long do I have to submit my Ontario application once I'm invited?", expect: ["OINP Workforce Priority application process"] },
  { q: "Does Ontario run a draw, or do I need an employer to start it?", expect: ["OINP Workforce Priority application process"], hard: true },
  { q: "Ontario nominated me. How long before I have to file with IRCC?", expect: ["OINP Workforce Priority application process"] },
  { q: "My employer submitted something in a portal. What am I supposed to do next?", expect: ["OINP Workforce Priority application process"], hard: true },

  // ---- OINP closed streams ----
  // Most advice online still names these. The right answer is that they are gone,
  // not a refusal and not a description of how they used to work.
  { q: "What happened to the Masters Graduate stream in Ontario?", expect: ["OINP closed streams (replaced June 2026)"] },
  { q: "Is Human Capital Priorities still sending notifications of interest?", expect: ["OINP closed streams (replaced June 2026)"], hard: true },
  { q: "My consultant said to apply through Employer Job Offer: In-Demand Skills. Is that still open?", expect: ["OINP closed streams (replaced June 2026)"], hard: true },
  { q: "I'm a French speaker counting on Ontario's French-speaking skilled worker stream. Is it still there?", expect: ["OINP closed streams (replaced June 2026)"], hard: true },
  { q: "Why did my Ontario expression of interest disappear?", expect: ["OINP closed streams (replaced June 2026)"], hard: true },

  // =========================================================================
  // Corpus expansion, 2026-08-15 (16 → 62 sources).
  //
  // Everything above this line is the original question set and is deliberately
  // UNCHANGED. That is what makes the run-to-run diff mean something: the same
  // questions, re-asked against a corpus roughly four times the size, is the
  // only clean read on whether recall was ever measuring the retriever or just
  // measuring an easy denominator.
  //
  // The questions below cover the new cards. diff.ts files them as "untracked"
  // on the first run rather than as regressions, which is the correct treatment
  // for a question the previous run never asked.
  // =========================================================================

  // ---- Federal Skilled Worker ----
  { q: "I have ten years of experience overseas and none in Canada. Which program is mine?", expect: ["Federal Skilled Worker Program"], hard: true },
  { q: "What's the 67 points thing I keep reading about?", expect: ["FSW selection factors: the 67-point grid"] },
  { q: "Is the 67-point score the same as the score that ranks me in the pool?", expect: ["FSW selection factors: the 67-point grid"], hard: true },
  { q: "Do I get anything for my wife having studied in Canada?", expect: ["FSW adaptability points"], hard: true },
  { q: "My consultant says my job offer is worth 10 points, but I read that job offer points were scrapped. Who's right?", expect: ["Arranged employment in the FSW grid", "Job offer points removed (March 25, 2025)"], hard: true },
  { q: "How much is an LMIA job offer worth on my CRS now?", expect: ["Job offer points removed (March 25, 2025)"] },
  { q: "I was counting on 200 points for a senior management offer. Is that gone?", expect: ["Job offer points removed (March 25, 2025)"], hard: true },

  // ---- Federal Skilled Trades ----
  { q: "I'm a welder with no degree. Can I still immigrate federally?", expect: ["Federal Skilled Trades Program"], hard: true },
  { q: "How many hours of trade experience do I need?", expect: ["Federal Skilled Trades work experience (3,120 hours)"] },
  { q: "My trade experience is from a country where I wasn't licensed to do it. Does it count?", expect: ["Federal Skilled Trades work experience (3,120 hours)"], hard: true },
  { q: "Do I need both a job offer and a trade certificate for the trades program?", expect: ["Federal Skilled Trades: job offer or certificate of qualification"] },
  { q: "My province doesn't certify my trade at all. What are my options?", expect: ["Federal Skilled Trades: job offer or certificate of qualification"], hard: true },
  { q: "What English level do tradespeople need?", expect: ["Federal Skilled Trades language minimums"] },
  { q: "My reading is much weaker than my speaking. Is that fatal for the trades program?", expect: ["Federal Skilled Trades language minimums"], hard: true },

  // ---- Choosing a program ----
  { q: "There are three programs. How do I tell which one I fit?", expect: ["Which Express Entry program fits"] },
  { q: "Why does my friend's experience from six years ago count when mine doesn't?", expect: ["Continuous work and the look-back windows", "Which Express Entry program fits"], hard: true },

  // ---- Work experience, NOC and TEER ----
  { q: "What actually counts as skilled experience?", expect: ["Skilled work experience (TEER 0–3)"] },
  { q: "My job title matches the code but the duties don't. Does that matter?", expect: ["Primary occupation and choosing your NOC"], hard: true },
  { q: "Which job do I put down if I've had several different ones?", expect: ["Primary occupation and choosing your NOC"] },
  { q: "What is a TEER category?", expect: ["NOC 2021 and the TEER categories"] },
  { q: "Can I tell my skill level from the code itself?", expect: ["NOC 2021 and the TEER categories"], hard: true },
  { q: "I've been a retail salesperson for six years. Why doesn't that qualify me?", expect: ["TEER 4 and TEER 5 work and Express Entry"], hard: true },
  { q: "Is there any route at all for someone in a job the federal programs won't take?", expect: ["TEER 4 and TEER 5 work and Express Entry"], hard: true },
  { q: "How far back can I go for my work experience?", expect: ["Continuous work and the look-back windows"] },
  { q: "My year of Canadian work was four years ago. Can I still use it to qualify?", expect: ["Continuous work and the look-back windows"], hard: true },

  // ---- Self-employment, study, remote work ----
  { q: "I was self-employed in Canada. Does that count?", expect: ["Self-employment and work while studying"] },
  { q: "I worked during my co-op term. Does that count?", expect: ["Self-employment and work while studying"], hard: true },
  { q: "I'm a physician paid fee-for-service and I've been told self-employment doesn't count. Is there an exception?", expect: ["Physician exemption for self-employed Canadian experience"], hard: true },
  { q: "I work remotely from Manila for a Toronto company. Is that Canadian experience?", expect: ["Remote work and Canadian work experience"], hard: true },
  { q: "Does working from home in Canada still count as Canadian experience?", expect: ["Remote work and Canadian work experience"] },

  // ---- Credential assessment ----
  { q: "Do I need to get my foreign degree assessed?", expect: ["Educational credential assessment (ECA)"] },
  { q: "How old can my credential assessment be when I apply?", expect: ["Educational credential assessment (ECA)"] },
  { q: "Do I need an assessment for my Canadian college diploma?", expect: ["Educational credential assessment (ECA)"], hard: true },
  { q: "I have a diploma and a degree. Do I have to get both assessed?", expect: ["Getting two or more credentials assessed"], hard: true },
  { q: "My degree came back as not equal to a Canadian one. Is there anything I can still do?", expect: ["Getting two or more credentials assessed"], hard: true },

  // ---- Language tests ----
  { q: "Which English tests does IRCC accept?", expect: ["Approved language tests"] },
  { q: "I took the academic version of IELTS. Is that OK?", expect: ["Approved language tests"], hard: true },
  { q: "I retook just my speaking section. Will they take that result?", expect: ["Approved language tests"], hard: true },
  { q: "My Canadian job is TEER 2. What language score do I actually need?", expect: ["CEC language minimums by TEER"], hard: true },
  { q: "Is CLB 7 really the minimum for everyone?", expect: ["CEC language minimums by TEER", "CLB 7 in all abilities"], hard: true },

  // ---- CRS tables ----
  { q: "How is the 1,200 total made up?", expect: ["How the CRS score is built"] },
  { q: "What's the most I can score without a partner?", expect: ["How the CRS score is built"], hard: true },
  { q: "How many points do I lose turning 31?", expect: ["CRS age points"], hard: true },
  { q: "At what age do I stop getting points for being young?", expect: ["CRS age points"] },
  { q: "What's a master's degree worth?", expect: ["CRS education points"] },
  { q: "I have two diplomas. Is that worth more than one bachelor's?", expect: ["CRS education points"], hard: true },
  { q: "How much is my second year of Canadian work worth over the first?", expect: ["CRS Canadian work experience points"], hard: true },
  { q: "What do I get for five years of work in Canada?", expect: ["CRS Canadian work experience points"] },
  { q: "How much can my husband's education add to my score?", expect: ["Spouse or common-law partner factors"] },
  { q: "My wife is already a permanent resident. Does that lower my score?", expect: ["When you are scored as if you have no spouse"], hard: true },
  { q: "My partner isn't coming with me. Which set of numbers applies?", expect: ["When you are scored as if you have no spouse"] },
  { q: "Should I be the main applicant, or should my spouse?", expect: ["Spouse or common-law partner factors", "When you are scored as if you have no spouse"], hard: true },
  { q: "What's in the other 600 points?", expect: ["Additional points (the 600-point group)"] },
  { q: "I have a nomination and strong French. Do they stack on top of each other?", expect: ["Additional points (the 600-point group)"], hard: true },
  { q: "My sister is a citizen living in Vancouver. Is that worth anything?", expect: ["Sibling in Canada (15 points)"] },
  { q: "Does my cousin in Calgary get me points?", expect: ["Sibling in Canada (15 points)"], hard: true },
  { q: "My brother is in Canada on a work permit. Does he count?", expect: ["Sibling in Canada (15 points)"], hard: true },

  // ---- Rounds and the pool ----
  { q: "Who decides the cut-off score for a draw?", expect: ["How rounds of invitations work"], hard: true },
  { q: "How long do I have to apply once I'm invited?", expect: ["How rounds of invitations work"] },
  { q: "What are the different kinds of draws?", expect: ["General, program-specific and category-based rounds"] },
  { q: "Why are the provincial draw scores so much higher than the others?", expect: ["General, program-specific and category-based rounds", "Provincial nomination"], hard: true },
  { q: "Two people have exactly the same score. Who gets picked?", expect: ["The tie-breaking rule"] },
  { q: "Is there any point submitting early if my score is too low anyway?", expect: ["The tie-breaking rule"], hard: true },
  { q: "How do I get into the pool in the first place?", expect: ["Creating an Express Entry profile"] },
  { q: "Do I have to apply separately to be considered for a category?", expect: ["Creating an Express Entry profile", "The 12-months-in-3-years category rule"], hard: true },
  { q: "I want to settle in Montreal. Does this system work for that?", expect: ["Express Entry and Quebec"], hard: true },
  { q: "Can Quebec nominate me for the 600 points?", expect: ["Express Entry and Quebec", "Provincial nomination"], hard: true },

  // ---- Categories ----
  { q: "How much experience do I need for a category draw?", expect: ["The 12-months-in-3-years category rule"] },
  { q: "My twelve months in that occupation weren't back to back. Is that a problem?", expect: ["The 12-months-in-3-years category rule"], hard: true },
  { q: "The category occupation isn't the job I'm applying under. Does it still count?", expect: ["The 12-months-in-3-years category rule"], hard: true },
  { q: "I'm a nurse. Which category am I in?", expect: ["Healthcare and social services occupations category"] },
  { q: "Does my nursing experience from back home count for that category?", expect: ["Healthcare and social services occupations category"], hard: true },
  { q: "I'm a software engineer. Is there a draw for me?", expect: ["Science, technology, engineering and math (STEM) category"] },
  { q: "I'm a developer but my code isn't on the STEM list. Am I out?", expect: ["Science, technology, engineering and math (STEM) category"], hard: true },
  { q: "Is the trades category the same thing as the trades program?", expect: ["Trade occupations category", "Federal Skilled Trades Program"], hard: true },
  { q: "I'm an early childhood educator. Is there a category for me?", expect: ["Education occupations category"] },
  { q: "I'm an aircraft mechanic. Which category covers me?", expect: ["Transport occupations category"] },
  { q: "Do I need a particular job to qualify for the French draws?", expect: ["French-language proficiency category"], hard: true },
  { q: "What French level gets me into the French rounds?", expect: ["French-language proficiency category"] },
  { q: "I'm a surgeon who's only ever practised abroad. Can I be invited in a physicians round?", expect: ["Physicians with Canadian work experience category"], hard: true },
  { q: "I'm a senior manager at a Toronto firm. Is there a round for that?", expect: ["Senior managers with Canadian work experience category"] },
  { q: "I'm a postdoc at a Canadian university. Is there a category?", expect: ["Researchers with Canadian work experience category"] },
  { q: "I served fifteen years in my country's army. Is there anything for military people?", expect: ["Skilled military recruits category"], hard: true },

  // ---- NOT covered — the correct answer is a refusal ----
  { q: "How much money do I need to show for proof of funds?", expect: [] },
  { q: "Can I include my brother as a dependant on my application?", expect: [] },
  { q: "How long does it take to get a work permit extension approved?", expect: [] },
  { q: "What's the application fee for permanent residence?", expect: [] },
  { q: "Do I need a police certificate from every country I've lived in?", expect: [] },
  // Bait, deliberately kept: the OINP card says language tests must be taken within
  // two years of THAT stream's application date, so a two-year number is sitting in
  // the corpus waiting to be misapplied. IRCC's own validity rule for an Express
  // Entry profile is not in the corpus, so the only correct answers are a refusal or
  // one that scopes the two-year figure to OINP — a bare "two years" is wrong.
  { q: "How long does IRCC consider my IELTS result valid for my Express Entry profile?", expect: [] },
  { q: "Can I appeal if my application gets refused?", expect: [] },
  { q: "What's the processing time for a PR card renewal?", expect: [] },
  { q: "Do I need a medical exam, and who can do it?", expect: [] },
  { q: "Can I travel outside Canada while my PR application is in progress?", expect: [] },
];

export const COVERED = EVAL_QUESTIONS.filter((q) => q.expect.length > 0);
export const UNCOVERED = EVAL_QUESTIONS.filter((q) => q.expect.length === 0);
export const HARD = COVERED.filter((q) => q.hard);
