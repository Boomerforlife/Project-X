import type { Guide } from "./types";

export const guide: Guide = {
  slug: "how-to-analyse-a-mock-test",
  title: "How to Analyse a JEE Mock Test: A Step-by-Step Review Method",
  description:
    "Turn every mock test into improvement: review the paper in stages, classify each error by cause, study your time use, and convert findings into a concrete plan.",
  category: "Practice",
  published: "2026-11-21",
  updated: "2026-11-21",
  readingMinutes: 7,
  summary:
    "Analyse a mock test by reviewing every question, classifying each lost mark by cause (concept gap, calculation, misread, time pressure, formula recall), checking how you spent time, and then writing down one or two specific actions. The score is the least useful part of the result.",
  sections: [
    {
      heading: "Why does the analysis matter more than the score?",
      answer:
        "A score tells you where you stand, but only analysis tells you what to change. Two students with the same score can need very different work.",
      blocks: [
        {
          type: "p",
          text: "Students often take test after test and watch the number rise and fall without changing how they study. A mock test is a measurement, and measurement only helps if you act on it. The real value is in discovering why marks were lost, because the reasons point directly at what to practise.",
        },
        {
          type: "p",
          text: "A sensible rule is to spend at least as much time reviewing a test as you spent taking it, ideally more. If that feels excessive, take fewer tests and review them properly.",
        },
        {
          type: "note",
          text: "A mock score is not a prediction of your result. Papers differ in difficulty, and exam rules can change from year to year. Check the current official information for the real exam's format and marking.",
        },
        {
          type: "link",
          text: "Check the current exam format and marking scheme before interpreting mock scores.",
          href: "https://jeemain.nta.nic.in/",
          label: "JEE Main official website",
        },
      ],
    },
    {
      heading: "What should you do right after the test?",
      answer:
        "Before looking at answers, write down how you felt about each section and which questions you guessed. This snapshot is lost quickly and is useful for later analysis.",
      blocks: [
        {
          type: "p",
          text: "Within a few minutes of finishing, note where you felt rushed, which questions you skipped, which you guessed and which you were unsure of. Do this before you see the results, because once you know the answers your memory of your own thinking changes.",
        },
        {
          type: "ul",
          items: [
            "Mark questions as confident, unsure or guessed.",
            "Note any section where you ran out of time.",
            "Write down your energy and focus level. Fatigue is a real factor in a long paper.",
          ],
        },
      ],
    },
    {
      heading: "How do you review each question?",
      answer:
        "Go through every question, not just the wrong ones. Check correct answers for sound reasoning, wrong ones for the cause, and skipped ones for why you did not attempt them.",
      blocks: [
        {
          type: "ol",
          items: [
            "Start with wrong answers. Find the exact step where your reasoning diverged.",
            "Next, look at correct answers you marked as guessed or unsure. A lucky guess is a hidden weakness.",
            "Then review skipped questions. Were they too hard, too long or simply not reached?",
            "Finally, scan the confident correct answers and see whether a shorter method exists.",
          ],
        },
        {
          type: "p",
          text: "Redo each wrong question yourself before reading the solution, if you have time. Then read the solution and compare methods. If the solution uses a shortcut or insight you missed, write it down.",
        },
      ],
    },
    {
      heading: "How do you classify mistakes by cause?",
      answer:
        "Assign each lost mark to one of five causes: concept gap, calculation error, misread question, time pressure or formula recall. The cause decides the fix.",
      blocks: [
        {
          type: "ul",
          items: [
            "Concept gap: you did not understand the underlying idea. Fix: return to theory, relearn it and attempt basic questions before harder ones.",
            "Calculation error: the idea was right but arithmetic, algebra or a sign slipped. Fix: write steps more cleanly, double-check key steps and practise calculation speed separately.",
            "Misread question: you answered a different question from the one asked or missed a condition. Fix: underline what is asked and the key conditions before solving.",
            "Time pressure: you rushed, guessed or did not reach the question. Fix: practise timed sets and decide in advance when to skip.",
            "Formula recall: you knew the idea but could not recall or rebuild the formula. Fix: revise a concise formula sheet regularly and practise deriving the key ones.",
          ],
        },
        {
          type: "p",
          text: "Be honest in classifying. It is tempting to label everything a careless mistake, but a genuine concept gap disguised as carelessness will come back. If you could not solve the question even after unlimited time, it is a concept gap.",
        },
      ],
    },
    {
      heading: "How should you study your time management?",
      answer:
        "Look at how long you spent per section and which questions took the longest relative to the marks they earned. Time analysis shows whether you are losing marks to speed or to knowledge.",
      blocks: [
        {
          type: "p",
          text: "Ask where your time went. Did one hard question swallow several minutes that could have solved easier ones? Did you leave a section for last and run out of time? Did you spend a long time double-checking questions that were already right?",
        },
        {
          type: "ul",
          items: [
            "Note your order of attempts and whether it suited you.",
            "Identify questions where you spent far more time than most and decide whether to have skipped them.",
            "Compare your first-pass accuracy with your accuracy on questions you came back to.",
          ],
        },
        {
          type: "p",
          text: "Practising in a screen-based, timed setup helps build realistic habits. TabbyPrep offers full previous-year papers in a CBT-style interface, and your attempts can be reviewed question by question afterwards.",
        },
      ],
    },
    {
      heading: "How do you turn the analysis into action?",
      answer:
        "Choose one or two specific actions from the analysis, put them in your plan with dates, and check on them in the next test. A long list of resolutions will not be followed.",
      blocks: [
        {
          type: "p",
          text: "After sorting the errors, count them by cause and by chapter. The biggest category is usually your best target. For instance, if most losses were misreads, a reading habit will help more than extra theory. If they cluster in one chapter, schedule revision and a fresh practice set there.",
        },
        {
          type: "ol",
          items: [
            "Pick the top one or two causes or chapters behind lost marks.",
            "Write a concrete action for each, such as revise this chapter and attempt a fresh set by Sunday.",
            "Add the wrong questions to your mistake notebook so that they are revisited after a gap.",
            "At the next test, check whether those specific errors reduced.",
          ],
        },
        {
          type: "p",
          text: "Our guide to keeping a mistake notebook describes a simple format. Mistakes you answer incorrectly on TabbyPrep are captured automatically so that you can reattempt them later without copying them out by hand.",
        },
      ],
    },
    {
      heading: "How often should you take mock tests?",
      answer:
        "Take tests at a pace that lets you review each one fully. Frequency matters less than whether each test changes how you prepare.",
      blocks: [
        {
          type: "p",
          text: "Early in preparation, occasional tests are enough, since much of the syllabus is still being learnt. Closer to the exam, you can increase frequency, as long as you keep the review. Taking a new test every day without analysis is usually less useful than taking fewer and learning from each.",
        },
        {
          type: "p",
          text: "Do not let one bad result shake your confidence. Look for trends across several tests, and remember that a poor score with good analysis often improves your next attempt more than a good score with none.",
        },
      ],
    },
  ],
  practiceLinks: [
    { label: "JEE practice hub", href: "/jee/" },
    { label: "Previous year papers", href: "/jee/pyq/" },
    { label: "Mathematics practice", href: "/jee/mathematics/" },
  ],
  related: [
    "how-to-keep-a-mistake-notebook-for-jee",
    "how-to-practise-jee-previous-year-questions",
    "how-to-prepare-for-jee-main-online",
  ],
};
