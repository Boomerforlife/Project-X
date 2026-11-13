import { createMockGeminiClient, type MockClientOptions } from '../src/gemini/mock.js';
import type { HandlerDeps } from '../src/pipeline/handlers/common.js';
import { MemoryAiRepository } from '../src/repo/memory-repo.js';
import type { QuestionRecord, TaxonomyCandidates } from '../src/repo/types.js';
import { createMockSympyChecker, type SympyChecker } from '../src/verify/sympy.js';

export const Q_ID = '11111111-1111-4111-8111-111111111111';
export const OPT = { A: 'a0000000-0000-4000-8000-00000000000a', B: 'b0000000-0000-4000-8000-00000000000b', C: 'c0000000-0000-4000-8000-00000000000c', D: 'd0000000-0000-4000-8000-00000000000d' };

export const TAXONOMY: TaxonomyCandidates = {
  subjects: [{ id: 'subj-phy', code: 'PHYSICS' }],
  chapters: [
    { id: 'ch-kin', subjectId: 'subj-phy', subjectCode: 'PHYSICS', slug: 'jee-main-physics-kinematics', name: 'Kinematics' },
    { id: 'ch-lom', subjectId: 'subj-phy', subjectCode: 'PHYSICS', slug: 'jee-main-physics-laws-of-motion', name: 'Laws of Motion' },
  ],
  topics: [{ id: 'tp-pm', chapterId: 'ch-kin', chapterSlug: 'jee-main-physics-kinematics', slug: 'jee-main-physics-kinematics-projectile-motion', name: 'Projectile Motion' }],
};

export function makeQuestion(over: Partial<QuestionRecord> = {}): QuestionRecord {
  return {
    id: Q_ID,
    slug: 'demo-synthetic-kinematics',
    examId: 'exam-1',
    examName: 'JEE Main',
    subjectId: null,
    subjectName: null,
    chapterId: null,
    chapterName: null,
    topicId: null,
    difficulty: null,
    questionType: 'SINGLE_MCQ',
    questionText: '[SYNTHETIC] A body in kinematics moves with constant acceleration. Which option is correct?',
    structuredContent: [{ type: 'paragraph', text: 'synthetic' }],
    options: [
      { id: OPT.A, label: 'A', text: 'first' },
      { id: OPT.B, label: 'B', text: 'second' },
      { id: OPT.C, label: 'C', text: 'third' },
      { id: OPT.D, label: 'D', text: 'fourth' },
    ],
    referencedAssetIds: [],
    assets: [],
    year: null,
    answerKey: null,
    answerKeySource: null,
    officialKeyDropped: false,
    contentHash: 'hash-1',
    ingestionStatus: 'IMPORTED',
    verificationStatus: 'PENDING',
    publicationStatus: 'DRAFT',
    seoTitle: null,
    seoDescription: null,
    ...over,
  };
}

export function makeDeps(opts: {
  question?: QuestionRecord;
  mock?: MockClientOptions;
  sympy?: SympyChecker;
  repo?: MemoryAiRepository;
} = {}): HandlerDeps & { repo: MemoryAiRepository } {
  const repo = opts.repo ?? new MemoryAiRepository();
  repo.taxonomy = TAXONOMY;
  repo.addQuestion(opts.question ?? makeQuestion());
  return {
    repo,
    client: createMockGeminiClient(opts.mock),
    sympy: opts.sympy ?? createMockSympyChecker(),
  };
}
