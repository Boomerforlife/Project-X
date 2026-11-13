import type { AiRepository, QuestionRecord, TaxonomyCandidates } from './types.js';
import { MemoryAiRepository } from './memory-repo.js';

/**
 * --dry-run repository: question/taxonomy reads come from `source` (read-only); every write lands in memory only,
 * so nothing is persisted (not even ai_runs, usage counters or jobs).
 */
export class DryRunAiRepository extends MemoryAiRepository {
  constructor(private readonly source: AiRepository) {
    super();
  }

  override async loadQuestion(id: string): Promise<QuestionRecord | null> {
    if (!this.questions.has(id)) {
      const q = await this.source.loadQuestion(id);
      if (!q) return null;
      this.addQuestion(q);
    }
    return super.loadQuestion(id);
  }

  override resolveQuestionId(idOrSlug: string): Promise<string | null> {
    return this.source.resolveQuestionId(idOrSlug);
  }

  override async loadTaxonomy(examId: string): Promise<TaxonomyCandidates> {
    return this.source.loadTaxonomy(examId);
  }
}
