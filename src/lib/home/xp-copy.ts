export type XpRule = { correct: number; partial: number; incorrect: number; paperBonus: number; mistakeCleared: number };

/** Plain-language XP rule, generated from the real `XP` constant so the copy cannot drift from what is awarded. */
export function xpRuleCopy(xp: XpRule): string {
  const parts = [`+${xp.correct} for a correct answer`];
  if (xp.partial > 0) parts.push(`+${xp.partial} for a partly correct multi-answer`);
  parts.push(`+${xp.incorrect} for a wrong attempt`);
  if (xp.mistakeCleared > 0) parts.push(`+${xp.mistakeCleared} for clearing a mistake`);
  if (xp.paperBonus > 0) parts.push(`+${xp.paperBonus} for finishing a paper`);
  return `${parts.join(", ")}.`;
}
