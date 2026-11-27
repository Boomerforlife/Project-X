/**
 * Product glossary (UX audit 2026-11-28, section E): one word per concept, used by nav, buttons and page titles.
 *
 * - Previous-year questions are "PYQs". Retired: Papers, Mock tests, Full papers in CBT, Papers & mocks.
 * - One sitting of an exam is a "paper". Retired: test or mock for a paper (until real mocks exist).
 * - A timed attempt is a "timed test", or "CBT" when it runs in the exam shell. Retired: test mode, exam mode.
 * - The daily schedule is the "Study plan". Retired: Plan, Plans.
 * - Finishing: "Submit" when timed, "Finish" when untimed. Retired: Finish session, Submit test, Save & submit.
 * - Verb "Practise", noun "Practice" (Indian/British English, as in the rest of the site).
 * - The signed-in landing page is "Home". Retired: Dashboard.
 */
export const COPY = {
  home: "Home",
  practice: "Practice",
  practise: "Practise",
  pyqs: "PYQs",
  pyqsLong: "Previous-year questions",
  paper: "paper",
  papers: "papers",
  notebook: "Notebook",
  mistakes: "Mistakes",
  bookmarks: "Bookmarks",
  review: "Review list",
  progress: "Progress",
  studyPlan: "Study plan",
  studyPlans: "Study plans",
  pricing: "Pricing",
  account: "Account & billing",
  timedTest: "Timed test",
  cbt: "CBT",
  submit: "Submit",
  finish: "Finish",
  allQuestions: "All questions",
  learn: "Learn",
} as const;
