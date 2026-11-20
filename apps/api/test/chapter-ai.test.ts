import { describe, expect, it } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { buildRequest, decide, outputSchema, parseAnswer, systemPrompt } from '../src/content/chapter-ai';
import type { ChapterGuess } from '../src/content/chapter-keywords';

const kw = (chapter: string | null, score: number): ChapterGuess => ({ chapter, score, runnerUp: null, runnerUpScore: 0, confident: false, matched: [] });
const msg = (text: string, stop: Anthropic.Message['stop_reason'] = 'end_turn') => ({ stop_reason: stop, content: [{ type: 'text', text }] }) as unknown as Anthropic.Message;
const known = new Set(['kinematics', 'electrostatics']);

describe('chapter classification cross-check', () => {
  it('assigns when Claude and the keyword rules agree, or when Claude is sure and the keywords are too weak', () => {
    expect(decide({ chapter: 'kinematics', confidence: 'medium' }, kw('kinematics', 2))).toMatchObject({ action: 'assign', chapter: 'kinematics' });
    expect(decide({ chapter: 'kinematics', confidence: 'high' }, kw('electrostatics', 2))).toMatchObject({ action: 'assign', chapter: 'kinematics' });
    expect(decide({ chapter: 'kinematics', confidence: 'high' }, kw(null, 0))).toMatchObject({ action: 'assign' });
  });

  it('leaves disagreements, low confidence and unusable answers for a person', () => {
    expect(decide({ chapter: 'kinematics', confidence: 'high' }, kw('electrostatics', 6)).action).toBe('review');
    expect(decide({ chapter: 'kinematics', confidence: 'medium' }, kw('electrostatics', 1)).action).toBe('review');
    expect(decide({ chapter: 'kinematics', confidence: 'low' }, kw('kinematics', 5)).action).toBe('review');
    expect(decide(null, kw('kinematics', 9)).action).toBe('review');
  });

  it('reads only a valid structured answer for a known chapter', () => {
    expect(parseAnswer(msg('{"chapter":"kinematics","confidence":"high"}'), known)).toEqual({ chapter: 'kinematics', confidence: 'high' });
    expect(parseAnswer(msg('{"chapter":"optics","confidence":"high"}'), known)).toBeNull();
    expect(parseAnswer(msg('not json'), known)).toBeNull();
    expect(parseAnswer(msg('{"chapter":"kinematics","confidence":"high"}', 'refusal'), known)).toBeNull();
  });

  it('builds a batch request restricted to the subject chapters, with the question image when public', () => {
    const chapters = [{ segment: 'kinematics', name: 'Kinematics' }, { segment: 'electrostatics', name: 'Electrostatics' }];
    const r = buildRequest({ id: 'q1', text: 'A ball is thrown', imageUrl: 'https://x/a.png' }, systemPrompt('JEE Main', 'Physics', chapters), outputSchema(chapters));
    expect(r.custom_id).toBe('q1');
    expect(r.params.model).toBe('claude-opus-5-5');
    expect((r.params.output_config?.format?.schema as { properties: { chapter: { enum: string[] } } }).properties.chapter.enum).toEqual(['kinematics', 'electrostatics']);
    const content = r.params.messages[0]!.content as Anthropic.ContentBlockParam[];
    expect(content[0]).toMatchObject({ type: 'image', source: { type: 'url', url: 'https://x/a.png' } });
  });
});
