import type { Guide } from "./types";

export const guide: Guide = {
  slug: "how-to-practise-chapter-wise-jee-questions",
  title: "How to Practise Chapter-Wise JEE Questions Effectively",
  description:
    "A practical method for chapter-wise JEE practice: how big each set should be, how to build difficulty gradually, when to review, and how to track weak topics.",
  category: "Practice",
  published: "2026-11-21",
  updated: "2026-11-21",
  readingMinutes: 7,
  summary:
    "Practise one chapter at a time in small sets that increase in difficulty, check each set immediately, log errors by cause, and return to weak chapters after a gap. Chapter-wise practice finds gaps early, which is its main advantage over only taking full tests.",
  sections: [
    {
      heading: "Why practise chapter by chapter at all?",
      answer:
        "Chapter-wise practice gives fast, specific feedback. If a set on one topic goes badly, you know exactly what to revise, which a full-length test score cannot tell you.",
      blocks: [
        {
          type: "p",
          text: "A full mock tells you how you performed across everything at once. That is useful later, but it is a blunt instrument for learning. When a score drops, you cannot tell whether the cause was a weak chapter, a careless day or poor time handling.",
        },
        {
          type: "p",
          text: "Working one chapter at a time narrows the cause. You learn a topic, attempt a set, and see at once whether the learning held. Gaps are found while the chapter is fresh and cheap to fix, not weeks later when you have moved on.",
        },
      ],
    },
    {
      heading: "How big should each practice set be?",
      answer:
        "A set of roughly ten to twenty questions is a workable size for most students. It is long enough to reveal patterns and short enough to review the same day.",
      blocks: [
        {
          type: "p",
          text: "Sets that are too short give noisy results, because one lucky or unlucky question changes the picture. Sets that are too long delay review and tire you out. Adjust to your pace, but keep the principle: attempt and review in the same session while the reasoning is fresh.",
        },
        {
          type: "ul",
          items: [
            "Use a smaller set for a brand-new, difficult chapter.",
            "Use a larger set when revising a chapter you already know.",
            "Keep a mix of question types, including multiple-choice and numerical-answer questions, so that you practise both formats.",
            "Always finish and review a set before starting another.",
          ],
        },
      ],
    },
    {
      heading: "In what order should you attempt questions within a chapter?",
      answer:
        "Start with direct, concept-check questions, then multi-step problems, then mixed and tougher ones. Building difficulty gradually shows you where your understanding stops.",
      blocks: [
        {
          type: "ol",
          items: [
            "Level one: direct questions that test a single idea. Aim to get these right with reasoning, not luck.",
            "Level two: questions that need two steps or a small twist.",
            "Level three: mixed problems that combine ideas from earlier chapters or from different parts of the same chapter.",
            "Level four: previous year questions and the toughest problems, attempted under a time limit.",
          ],
        },
        {
          type: "p",
          text: "Do not leap to level four as soon as you finish level one. If level two shakes you, that is the information you needed. Return to the concept before climbing further. On TabbyPrep you can filter practice by subject, chapter and difficulty, which makes it easier to build this ladder deliberately.",
        },
      ],
    },
    {
      heading: "How do you review a set so that it actually helps?",
      answer:
        "Review every question, including the ones you got right, and record the reason for each error. The review is where most of the learning happens.",
      blocks: [
        {
          type: "p",
          text: "After a set, go through each question. For correct answers, confirm that your reasoning was sound and that you were not guessing. For wrong answers, find the exact step where things went off course and classify the cause.",
        },
        {
          type: "ul",
          items: [
            "Concept gap: you did not know or misunderstood the idea.",
            "Calculation error: the idea was right but arithmetic or algebra slipped.",
            "Misread question: you answered something different from what was asked.",
            "Formula recall: you knew the idea but could not recall or reconstruct the formula.",
            "Time pressure: you could have solved it with more time, or rushed.",
          ],
        },
        {
          type: "p",
          text: "The category tells you what to do next. A concept gap needs study. A calculation error needs slower, cleaner working. A misread needs a habit of underlining what is asked. Our guide to keeping a mistake notebook describes a simple way to record this so that patterns become visible.",
        },
      ],
    },
    {
      heading: "When should you return to a chapter?",
      answer:
        "Return to a chapter after a few days, again after a couple of weeks, and again as part of mixed revision. Spaced revisits keep knowledge from fading.",
      blocks: [
        {
          type: "p",
          text: "Solving a set well on the day you learn a topic proves little, because everything is fresh. The better test is how you do after a gap. Schedule a short second attempt a few days later, using the questions you got wrong as well as a few new ones. If you remember the method but struggle with a fresh problem, you have understood less than you thought.",
        },
        {
          type: "p",
          text: "Mixed revision, where you practise several chapters in one sitting, trains you to recognise which idea a problem needs without a chapter title to tell you. This matters because the real exam does not announce the chapter.",
        },
      ],
    },
    {
      heading: "How do you track weak chapters without overcomplicating it?",
      answer:
        "Keep a simple list of chapters with a status and the date of your last practice. Review it weekly and let it decide what you study next.",
      blocks: [
        {
          type: "p",
          text: "A spreadsheet or notebook page is enough. For each chapter, record how recent sets went, the main error categories and when you last touched it. Once a week, glance at the list and choose the chapters that are weakest or have gone longest without practice.",
        },
        {
          type: "p",
          text: "TabbyPrep keeps your attempts organised by chapter so you can see how you are doing without maintaining a separate record. Use that in whatever way suits you, but do not let tracking become a task in itself. Time spent on a dashboard is time not spent solving.",
        },
        {
          type: "note",
          text: "Keep your plan tied to the official syllabus. Chapters and topics included or excluded can change, so check the current information bulletin rather than relying on an old list.",
        },
        {
          type: "link",
          text: "Check the current syllabus on the official JEE Main site.",
          href: "https://jeemain.nta.nic.in/",
          label: "JEE Main official website",
        },
      ],
    },
    {
      heading: "What common mistakes make chapter-wise practice less effective?",
      answer:
        "Skipping review, moving on too fast after a good score, and practising only favourite chapters are the most common. Each leaves hidden gaps.",
      blocks: [
        {
          type: "ul",
          items: [
            "Reading the solution too early and calling it practice.",
            "Counting questions attempted instead of questions understood.",
            "Avoiding weak chapters because they feel uncomfortable.",
            "Never mixing chapters, so that you cannot identify the right method without a hint.",
            "Not reattempting wrong questions after a gap.",
          ],
        },
        {
          type: "p",
          text: "Chapter-wise practice is a means to an end. Once most chapters are solid, shift gradually toward mixed sets, previous year questions and full-length tests, so that your preparation matches how the exam is actually taken.",
        },
      ],
    },
  ],
  practiceLinks: [
    { label: "Practise by subject and chapter", href: "/jee/" },
    { label: "Physics chapters", href: "/jee/physics/" },
    { label: "Chemistry chapters", href: "/jee/chemistry/" },
    { label: "Mathematics chapters", href: "/jee/mathematics/" },
  ],
  related: [
    "how-to-keep-a-mistake-notebook-for-jee",
    "how-to-practise-jee-previous-year-questions",
    "how-to-analyse-a-mock-test",
  ],
};
