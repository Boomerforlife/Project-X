import type { Guide } from "./types";

export const guide: Guide = {
  slug: "how-to-keep-a-mistake-notebook-for-jee",
  title: "How to Keep a Mistake Notebook for JEE That You Will Actually Use",
  description:
    "A simple system for recording, categorising and revisiting your JEE errors, with a format for each entry, a revision schedule and ways to keep the habit light.",
  category: "Practice",
  published: "2026-11-21",
  updated: "2026-11-21",
  readingMinutes: 6,
  summary:
    "A mistake notebook records each error with the question, your wrong approach, the correct approach, the cause and a revisit date. Keep entries short, categorise by cause, and revisit them after a gap until you can solve them cleanly.",
  sections: [
    {
      heading: "What is a mistake notebook and why keep one?",
      answer:
        "A mistake notebook is a running record of the questions you got wrong and why. It turns scattered errors into patterns you can fix.",
      blocks: [
        {
          type: "p",
          text: "Most students forget a mistake soon after reading its solution, then repeat it weeks later. A notebook interrupts that cycle. It makes you slow down, name the cause of each error, and return to the question after enough time has passed to test whether you truly learnt it.",
        },
        {
          type: "p",
          text: "It also reveals your personal pattern. You may find that your errors are mostly sign slips in Physics, or one particular organic reaction type, or misreading conditions in Mathematics. That sort of insight is hard to see without a record.",
        },
      ],
    },
    {
      heading: "What should you write in each entry?",
      answer:
        "Keep each entry short: the question or a reference to it, where your reasoning went wrong, the correct approach, the cause category and the date to revisit. Brevity is what keeps the habit alive.",
      blocks: [
        {
          type: "ol",
          items: [
            "Question: write it briefly or note its source and number so you can find it again.",
            "What I did: one line on your approach and where it broke.",
            "What was right: the correct method, in a few lines or steps.",
            "Cause: one category from the list below.",
            "Lesson: a single sentence you can recall, such as check the sign of work done by friction.",
            "Revisit date: when you will reattempt it.",
          ],
        },
        {
          type: "p",
          text: "Do not copy full solutions. That takes time and does not teach you anything. The goal is to capture the point of failure and the fix, which usually fits in a few lines.",
        },
      ],
    },
    {
      heading: "How should you categorise mistakes?",
      answer:
        "Use a small fixed set of causes, such as concept gap, calculation error, misread question, formula recall and time pressure. A short list is easier to apply consistently and easier to analyse later.",
      blocks: [
        {
          type: "ul",
          items: [
            "Concept gap: the underlying idea was missing or wrong.",
            "Calculation error: right method, slip in arithmetic, algebra or signs.",
            "Misread question: wrong quantity, missed condition or misunderstood the options.",
            "Formula recall: could not remember or reconstruct a needed formula or fact.",
            "Time pressure: rushed, guessed or ran out of time on something you could normally solve.",
          ],
        },
        {
          type: "p",
          text: "Be strict about the label. If you are unsure whether it is carelessness or a gap, try the question again without any time limit. If you still cannot solve it, it is a concept gap and needs study, not just attention.",
        },
        {
          type: "p",
          text: "Once you have a few weeks of entries, count them by cause and by chapter. The largest groups tell you what to work on next.",
        },
      ],
    },
    {
      heading: "How and when should you revisit the entries?",
      answer:
        "Reattempt each mistake after a few days, then after a couple of weeks, without looking at the notes first. An entry is closed only when you can solve it cleanly from scratch.",
      blocks: [
        {
          type: "p",
          text: "Rereading your notes is not the same as retrying the question. Cover the solution and attempt the problem again. If you solve it, mark the next revisit further out. If you fail, relearn the concept and shorten the interval.",
        },
        {
          type: "ul",
          items: [
            "First revisit: a few days after the mistake.",
            "Second revisit: after a couple of weeks.",
            "Later revisits: before major tests, only for entries that went wrong again.",
            "Retire an entry once you have solved it correctly and cleanly on more than one occasion.",
          ],
        },
        {
          type: "p",
          text: "These intervals are a starting point, not a rule. Adjust them to how fast things fade for you.",
        },
      ],
    },
    {
      heading: "Should the notebook be on paper or digital?",
      answer:
        "Use whichever you will keep up. Paper is quick and good for diagrams, while digital makes searching and sorting by cause easier.",
      blocks: [
        {
          type: "p",
          text: "A paper notebook works well if you add a few lines right after each practice session. A digital sheet is easier to filter by chapter and cause, and to count patterns. Neither is superior; what matters is that entries are made soon after the error, while you still remember your thinking.",
        },
        {
          type: "p",
          text: "TabbyPrep includes a mistake notebook that captures questions you answered incorrectly automatically, so you can reattempt them later; keep your cause labels alongside it. If you prefer your own system, the same format described above works in any tool.",
        },
        {
          type: "note",
          text: "Keep the mistake notebook separate from your bookmarks and your review list. Bookmarks are questions you want to save, the review list is for questions you intend to look at again, and the mistake notebook is for errors. Mixing them makes each less useful.",
        },
      ],
    },
    {
      heading: "How do you keep the habit from becoming a burden?",
      answer:
        "Limit entries to meaningful errors, keep each one to a few lines, and make a weekly review slot. If it takes too long, you will stop.",
      blocks: [
        {
          type: "ul",
          items: [
            "Log the mistakes that teach something. A trivial slip repeated ten times can be one entry with a tally.",
            "Spend no more than a few minutes per entry.",
            "Do a short weekly review: count by cause, choose the top target, and schedule revisits.",
            "Celebrate retired entries. A shrinking list is a sign of progress.",
          ],
        },
        {
          type: "p",
          text: "Pair the notebook with test analysis. Our guide on analysing a mock test shows how to find the errors worth recording, and our guide to chapter-wise practice shows how to revisit weak chapters after a gap.",
        },
        {
          type: "link",
          text: "Check the current exam information on the official site so your practice stays aligned.",
          href: "https://jeemain.nta.nic.in/",
          label: "JEE Main official website",
        },
      ],
    },
  ],
  practiceLinks: [
    { label: "Practise by chapter", href: "/jee/" },
    { label: "Physics practice", href: "/jee/physics/" },
    { label: "Chemistry practice", href: "/jee/chemistry/" },
    { label: "Mathematics practice", href: "/jee/mathematics/" },
  ],
  related: [
    "how-to-analyse-a-mock-test",
    "how-to-practise-chapter-wise-jee-questions",
    "how-to-practise-jee-previous-year-questions",
  ],
};
