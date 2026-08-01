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

  // ---- Canadian study ----
  { q: "I did a two-year diploma at a college in Toronto. Does that add anything?", expect: ["Canadian study additional points"] },
  { q: "Does a degree from a Canadian university's overseas campus count?", expect: ["Canadian study additional points"], hard: true },
  { q: "I was on a scholarship that required me to go home after. Does my Canadian diploma still count?", expect: ["Canadian study additional points"], hard: true },
  { q: "Most of my program was English language classes. Is that a problem?", expect: ["Canadian study additional points"], hard: true },
  { q: "How many extra points for a master's I earned in Canada?", expect: ["Canadian study additional points"] },

  // ---- Work experience hours ----
  { q: "I have two part-time jobs. Do they count as full-time experience?", expect: ["Work experience hours — full-time vs part-time"] },
  { q: "I work 45 hours a week. Does the extra time get me there faster?", expect: ["Work experience hours — full-time vs part-time"], hard: true },
  { q: "Does my unpaid internship count toward my experience?", expect: ["Work experience hours — full-time vs part-time"], hard: true },
  { q: "How many hours is a year of experience?", expect: ["Work experience hours — full-time vs part-time"] },
  { q: "I took three months off in the middle. Does my experience have to be continuous?", expect: ["Work experience hours — full-time vs part-time"], hard: true },

  // ---- CLB 7 / eligibility floor ----
  { q: "What's the minimum English level to even be eligible?", expect: ["CLB 7 in all abilities"] },
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

  // ---- Express Entry ----
  { q: "What is Express Entry, in plain terms?", expect: ["Express Entry"] },
  { q: "Which programs does the system actually cover?", expect: ["Express Entry"] },
  { q: "How does anyone get picked out of the pool?", expect: ["Express Entry"], hard: true },

  // ---- NOT covered — the correct answer is a refusal ----
  { q: "How much money do I need to show for proof of funds?", expect: [] },
  { q: "Can I include my brother as a dependant on my application?", expect: [] },
  { q: "How long does it take to get a work permit extension approved?", expect: [] },
  { q: "What's the application fee for permanent residence?", expect: [] },
  { q: "Do I need a police certificate from every country I've lived in?", expect: [] },
  { q: "How long is my IELTS result valid for?", expect: [] },
  { q: "Can I appeal if my application gets refused?", expect: [] },
  { q: "What's the processing time for a PR card renewal?", expect: [] },
  { q: "Do I need a medical exam, and who can do it?", expect: [] },
  { q: "Can I travel outside Canada while my PR application is in progress?", expect: [] },
];

export const COVERED = EVAL_QUESTIONS.filter((q) => q.expect.length > 0);
export const UNCOVERED = EVAL_QUESTIONS.filter((q) => q.expect.length === 0);
export const HARD = COVERED.filter((q) => q.hard);
