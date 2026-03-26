/**
 * Parse Claude Code JSONL transcript files into token usage data.
 *
 * Claude Code transcripts are JSONL files where each line is a JSON object.
 * We look for assistant messages that contain usage fields with token counts.
 */

import type { TokenUsage, SessionTokens, TranscriptMessage } from "../types.ts";
import { resolveModelFamily } from "../types.ts";

/**
 * Parse a JSONL transcript string into an array of TokenUsage entries.
 *
 * Handles edge cases:
 * - Empty lines are skipped silently
 * - Malformed JSON lines are skipped with a console.warn
 * - Missing numeric fields default to 0
 * - Lines without type === "assistant" or without usage are skipped
 */
export function parseTranscript(jsonlContent: string): TokenUsage[] {
  const usages: TokenUsage[] = [];
  const lines = jsonlContent.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line === "") continue;

    let parsed: TranscriptMessage;
    try {
      parsed = JSON.parse(line) as TranscriptMessage;
    } catch {
      console.warn(
        `Skipping malformed JSON on line ${i + 1}: ${line.slice(0, 80)}...`
      );
      continue;
    }

    // Only extract usage from assistant messages that have a usage block
    if (parsed.type !== "assistant") continue;
    if (!parsed.usage) continue;
    if (!parsed.model) continue;

    const usage = parsed.usage;
    usages.push({
      model: parsed.model,
      modelFamily: resolveModelFamily(parsed.model),
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
      cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    });
  }

  return usages;
}

/**
 * Aggregate an array of TokenUsage entries into session totals.
 *
 * Determines the primary model by counting how many requests used each model
 * (by model string, not family), choosing the one with the most requests.
 */
export function aggregateTokens(usages: TokenUsage[]): SessionTokens {
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheCreationTokens = 0;
  let totalCacheReadTokens = 0;

  const modelCounts = new Map<string, number>();

  for (const u of usages) {
    totalInputTokens += u.inputTokens;
    totalOutputTokens += u.outputTokens;
    totalCacheCreationTokens += u.cacheCreationTokens;
    totalCacheReadTokens += u.cacheReadTokens;

    modelCounts.set(u.model, (modelCounts.get(u.model) ?? 0) + 1);
  }

  // Determine primary model: the one with the most requests
  let primaryModel = "unknown";
  let maxCount = 0;
  for (const [model, count] of modelCounts) {
    if (count > maxCount) {
      maxCount = count;
      primaryModel = model;
    }
  }

  return {
    requests: usages,
    totalInputTokens,
    totalOutputTokens,
    totalCacheCreationTokens,
    totalCacheReadTokens,
    numRequests: usages.length,
    primaryModel,
  };
}
