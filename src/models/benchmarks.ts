/**
 * Performance benchmarks for Claude model families.
 *
 * These benchmarks translate token counts into wall-clock time,
 * which is then multiplied by hardware power draw to get energy.
 *
 * All values represent median observed performance under typical
 * API serving conditions (not peak or synthetic benchmarks).
 */

import type { ModelBenchmarks, ModelFamily } from "../types.ts";

// ─── Last Updated ───────────────────────────────────────────────

/**
 * Date these benchmarks were last verified/updated.
 * Benchmarks should be refreshed quarterly as model serving evolves.
 */
// Source: Artificial Analysis LLM performance tracker (https://artificialanalysis.ai), confidence: medium
export const BENCHMARKS_UPDATED = "2026-03-25";

// ─── Benchmark Definitions ──────────────────────────────────────

const HAIKU_BENCHMARKS: ModelBenchmarks = {
  modelFamily: "haiku",
  // Source: Artificial Analysis median output TPS for Claude 3.5 Haiku, ~185 tok/s, confidence: medium
  tps: 185,
  // Source: Artificial Analysis prefill throughput for small models, ~12000 tok/s, confidence: medium
  // Prefill is compute-bound and parallelizes well on even 1 GPU for small models
  prefillTokensPerSecond: 12_000,
  // Source: Artificial Analysis median TTFT for Claude 3.5 Haiku, ~0.3s, confidence: medium
  // Includes network latency + queue time + first forward pass
  ttftBase_s: 0.3,
  // Source: Estimated from model architecture — small models use less KV cache per token
  // ~0.5 KB/token assumes GQA with fewer KV heads, confidence: low
  kvCacheBytesPerToken: 512, // 0.5 KB
  benchmarksUpdated: BENCHMARKS_UPDATED,
  source: "Artificial Analysis (2025-2026 median values)",
};

const SONNET_BENCHMARKS: ModelBenchmarks = {
  modelFamily: "sonnet",
  // Source: Artificial Analysis median output TPS for Claude 3.5/3.6 Sonnet, ~90 tok/s, confidence: medium
  tps: 90,
  // Source: Artificial Analysis prefill throughput for medium models, ~8000 tok/s, confidence: medium
  // 2-GPU tensor parallelism gives good prefill throughput but decode is memory-bound
  prefillTokensPerSecond: 8_000,
  // Source: Artificial Analysis median TTFT for Claude 3.5 Sonnet, ~0.5s, confidence: medium
  ttftBase_s: 0.5,
  // Source: Estimated from model architecture — medium model with standard MHA/GQA
  // ~1.0 KB/token, confidence: low
  kvCacheBytesPerToken: 1_024, // 1.0 KB
  benchmarksUpdated: BENCHMARKS_UPDATED,
  source: "Artificial Analysis (2025-2026 median values)",
};

const OPUS_BENCHMARKS: ModelBenchmarks = {
  modelFamily: "opus",
  // Source: Artificial Analysis median output TPS for Claude 3/3.5 Opus, ~35 tok/s, confidence: medium
  // Large model decode is heavily memory-bandwidth-bound even with 8 GPUs
  tps: 35,
  // Source: Artificial Analysis prefill throughput for large models, ~4000 tok/s, confidence: medium
  // 8-GPU parallelism helps but inter-GPU communication adds overhead
  prefillTokensPerSecond: 4_000,
  // Source: Artificial Analysis median TTFT for Claude 3 Opus, ~1.2s, confidence: medium
  // Higher TTFT due to larger first forward pass and potential queue priority
  ttftBase_s: 1.2,
  // Source: Estimated from model architecture — large model with more layers and wider KV
  // ~2.0 KB/token, confidence: low
  kvCacheBytesPerToken: 2_048, // 2.0 KB
  benchmarksUpdated: BENCHMARKS_UPDATED,
  source: "Artificial Analysis (2025-2026 median values)",
};

// ─── Benchmark Lookup ───────────────────────────────────────────

const BENCHMARKS: Record<ModelFamily, ModelBenchmarks> = {
  haiku: HAIKU_BENCHMARKS,
  sonnet: SONNET_BENCHMARKS,
  opus: OPUS_BENCHMARKS,
};

/**
 * Get performance benchmarks for a model family.
 * Returns throughput, latency, and memory characteristics used
 * to convert token counts into time-on-hardware.
 */
export function getBenchmarks(family: ModelFamily): ModelBenchmarks {
  return BENCHMARKS[family];
}
