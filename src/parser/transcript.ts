/**
 * Parse Claude Code JSONL transcript files into token usage data.
 *
 * Claude Code transcripts are JSONL files where each line is a JSON object.
 * Assistant messages have this structure:
 *   {
 *     "type": "assistant",
 *     "message": {
 *       "type": "message",
 *       "role": "assistant",
 *       "model": "claude-opus-4-6",
 *       "usage": {
 *         "input_tokens": 1234,
 *         "output_tokens": 567,
 *         "cache_creation_input_tokens": 100,
 *         "cache_read_input_tokens": 200
 *       }
 *     }
 *   }
 */

import type { TokenUsage, SessionTokens } from "../types.ts";
import { resolveModelFamily } from "../types.ts";

interface TranscriptLine {
  type?: string;
  model?: string;
  message?: {
    type?: string;
    role?: string;
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  // Legacy flat format (for testing and compatibility)
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

/**
 * Parse a JSONL transcript string into an array of TokenUsage entries.
 *
 * Handles both formats:
 *   - Real Claude Code: usage nested under message.usage, model under message.model
 *   - Flat format: usage and model at top level (for testing)
 */
export function parseTranscript(jsonlContent: string): TokenUsage[] {
  const usages: TokenUsage[] = [];
  const lines = jsonlContent.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line === "") continue;

    let parsed: TranscriptLine;
    try {
      parsed = JSON.parse(line) as TranscriptLine;
    } catch {
      // Skip malformed lines silently in production
      continue;
    }

    if (parsed.type !== "assistant") continue;

    // Try nested format first (real Claude Code transcripts)
    const msg = parsed.message;
    const usage = msg?.usage ?? parsed.usage;
    const model = msg?.model ?? parsed.model;

    if (!usage) continue;
    if (!model) continue;

    usages.push({
      model,
      modelFamily: resolveModelFamily(model),
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
