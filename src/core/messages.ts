import type { Pack, PackLine } from '../shared/types.js';

export const RECENT_LIMIT = 8;

const FALLBACK_LINE = 'Time to drink water.';

export interface PickContext {
  glasses: number;
  streak: number;
  goalPct: number;
}

export function renderTemplate(text: string, ctx: PickContext): string {
  return text
    .replaceAll('{{glasses}}', String(ctx.glasses))
    .replaceAll('{{streak}}', String(ctx.streak))
    .replaceAll('{{goalPct}}', String(ctx.goalPct));
}

/**
 * Stage tags are indices into the user's ladder. A tag beyond the ladder's
 * length folds onto the final stage, so tone still escalates on short ladders.
 */
export function effectiveStage(tag: number, ladderLength: number): number {
  const last = Math.max(0, ladderLength - 1);
  return Math.min(tag, last);
}

export function eligibleLines(
  packs: Pack[],
  stageIndex: number,
  ladderLength: number,
): PackLine[] {
  const out: PackLine[] = [];
  for (const pack of packs) {
    for (const line of pack.lines) {
      if (line.stage === undefined) {
        out.push(line);
        continue;
      }
      if (line.stage.some((tag) => effectiveStage(tag, ladderLength) === stageIndex)) {
        out.push(line);
      }
    }
  }
  return out;
}

export function pickLine(
  packs: Pack[],
  stageIndex: number,
  ladderLength: number,
  recent: string[],
  ctx: PickContext,
  rand: () => number = Math.random,
): string {
  const eligible = eligibleLines(packs, stageIndex, ladderLength);
  if (eligible.length === 0) return FALLBACK_LINE;

  const fresh = eligible.filter((line) => !recent.includes(line.text));
  const pool = fresh.length > 0 ? fresh : eligible;
  const chosen = pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
  return renderTemplate(chosen.text, ctx);
}

export function pushRecent(recent: string[], text: string, max = RECENT_LIMIT): string[] {
  return [...recent, text].slice(-max);
}
