/**
 * Token counting utilities for deduplication.
 */

import type { TokenUsage } from "../types.ts";

/**
 * Remove exact duplicates that appear in sequence.
 *
 * Two consecutive entries are considered duplicates if they have the
 * same model string AND identical token counts across all four fields.
 * Only sequential duplicates are removed — identical entries separated
 * by a different entry are preserved.
 */
export function deduplicateUsage(usages: TokenUsage[]): TokenUsage[] {
  if (usages.length === 0) return [];

  const first = usages[0]!;
  const result: TokenUsage[] = [first];

  for (let i = 1; i < usages.length; i++) {
    const prev = usages[i - 1]!;
    const curr = usages[i]!;

    const isDuplicate =
      curr.model === prev.model &&
      curr.inputTokens === prev.inputTokens &&
      curr.outputTokens === prev.outputTokens &&
      curr.cacheCreationTokens === prev.cacheCreationTokens &&
      curr.cacheReadTokens === prev.cacheReadTokens;

    if (!isDuplicate) {
      result.push(curr);
    }
  }

  return result;
}
