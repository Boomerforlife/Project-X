import type { Guide } from "./types";
import { guide as howToPrepareForJeeMainOnline } from "./how-to-prepare-for-jee-main-online";
import { guide as howToPractiseJeePreviousYearQuestions } from "./how-to-practise-jee-previous-year-questions";
import { guide as howToPrepareForJeePhysics } from "./how-to-prepare-for-jee-physics";
import { guide as jeeMainVsJeeAdvancedDifferences } from "./jee-main-vs-jee-advanced-differences";
import { guide as howToPractiseChapterWiseJeeQuestions } from "./how-to-practise-chapter-wise-jee-questions";
import { guide as howToPrepareForJeeWithoutCoaching } from "./how-to-prepare-for-jee-without-coaching";
import { guide as howToAnalyseAMockTest } from "./how-to-analyse-a-mock-test";
import { guide as howToKeepAMistakeNotebookForJee } from "./how-to-keep-a-mistake-notebook-for-jee";
import { guide as commonMistakesInJeeChemistryPreparation } from "./common-mistakes-in-jee-chemistry-preparation";
import { guide as howToStudyJeeMathematicsCalculusAndAlgebra } from "./how-to-study-jee-mathematics-calculus-and-algebra";

export type { Guide, GuideBlock, GuideSection } from "./types";

export const GUIDES: Guide[] = [
  howToPrepareForJeeMainOnline,
  howToPractiseJeePreviousYearQuestions,
  howToPrepareForJeePhysics,
  jeeMainVsJeeAdvancedDifferences,
  howToPractiseChapterWiseJeeQuestions,
  howToPrepareForJeeWithoutCoaching,
  howToAnalyseAMockTest,
  howToKeepAMistakeNotebookForJee,
  commonMistakesInJeeChemistryPreparation,
  howToStudyJeeMathematicsCalculusAndAlgebra,
];

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}
