/**
 * Core energy model for AI inference.
 *
 * Implements the four-component energy decomposition from PROMPT.md §2.1:
 *   E_inference = E_prefill + E_decode + E_kv_cache + E_cache_ops
 *
 * All intermediate calculations are in Joules (W * s); final results are
 * converted to Wh (÷ 3600) for the EnergyBreakdown return type.
 *
 * References:
 *   - Jegham et al. (2025), "How Hungry is AI?" arXiv 2505.09598v6
 *   - Patterson et al. (2021), "Carbon Emissions and Large Neural Networks"
 */

import type {
  TokenUsage,
  HardwareProfile,
  ModelBenchmarks,
  UtilizationBounds,
  EnergyBreakdown,
} from "../types.ts";

// ─── Constants ──────────────────────────────────────────────────────
const JOULES_PER_WH = 3600;

// ─── Helpers ────────────────────────────────────────────────────────

/** Convert Joules to Watt-hours. */
function joulesToWh(joules: number): number {
  return joules / JOULES_PER_WH;
}

// ─── Main Calculator ────────────────────────────────────────────────

/**
 * Calculate the energy breakdown for a single inference request.
 *
 * @param usage       Token counts for this request.
 * @param profile     Hardware profile (GPU count, power, HBM, embodied).
 * @param benchmarks  Model-specific performance benchmarks (TPS, prefill rate, KV size).
 * @param utilization Utilization bounds (GPU + non-GPU utilization fractions).
 * @param pue         Power Usage Effectiveness for the datacenter (>= 1.0).
 * @returns           Energy breakdown in Wh per component.
 */
export function calculateEnergy(
  usage: TokenUsage,
  profile: HardwareProfile,
  benchmarks: ModelBenchmarks,
  utilization: UtilizationBounds,
  pue: number,
): EnergyBreakdown {
  // ── Timing ──────────────────────────────────────────────────────
  // Prefill time: input_tokens / prefill_tokens_per_second
  const t_prefill =
    benchmarks.prefillTokensPerSecond > 0
      ? usage.inputTokens / benchmarks.prefillTokensPerSecond
      : 0; // seconds

  // Decode time: output_tokens / TPS
  const t_decode =
    benchmarks.tps > 0 ? usage.outputTokens / benchmarks.tps : 0; // seconds

  // ── Power (kW → W for energy in Joules) ─────────────────────────
  const gpuPower_W = profile.totalGpuPower_kW * 1000;
  const nonGpuPower_W = profile.nonGpuPower_kW * 1000;
  const hbmPower_W = profile.hbmPower_kW * 1000;

  const gpuUtil = utilization.gpuUtilizationMean;
  const nonGpuUtil = utilization.nonGpuUtilization;

  // ── E_prefill (Joules) ──────────────────────────────────────────
  // P_prefill = totalGpuPower * prefill_utilization + nonGpuPower * nonGpuUtil
  // Use a higher utilization during prefill: prefill is compute-bound and
  // typically drives GPU utilization higher than average decode.
  // We approximate prefill_utilization as the max utilization bound.
  const prefillUtilization = utilization.gpuUtilizationMax;
  const P_prefill_W =
    gpuPower_W * prefillUtilization + nonGpuPower_W * nonGpuUtil;
  const E_prefill_J = t_prefill * P_prefill_W * pue;

  // ── E_decode (Joules) ───────────────────────────────────────────
  // P_decode = totalGpuPower * decode_utilization + nonGpuPower * nonGpuUtil
  const P_decode_W = gpuPower_W * gpuUtil + nonGpuPower_W * nonGpuUtil;
  const E_decode_J = t_decode * P_decode_W * pue;

  // ── E_kv_cache (Joules) ─────────────────────────────────────────
  // Memory occupancy of the KV-cache, proportional to HBM power.
  // context_length = inputTokens + outputTokens (full context window).
  const contextLength = usage.inputTokens + usage.outputTokens;
  const mem_kv_bytes = contextLength * benchmarks.kvCacheBytesPerToken;
  const totalHbm_bytes = profile.totalHbm_GB * 1e9; // GB → bytes

  const P_kv_W =
    totalHbm_bytes > 0 ? (mem_kv_bytes / totalHbm_bytes) * hbmPower_W : 0;
  const E_kv_J = (t_prefill + t_decode) * P_kv_W * pue;

  // ── E_cache_ops (Joules) ────────────────────────────────────────
  // Cache creation = additional write I/O (costs energy).
  // Cache read = avoids prefill (saves energy → negative contribution).
  //
  // write_energy_per_token: approximate as the per-token prefill energy.
  // prefill_energy_per_token: E_prefill per input token.
  const prefillEnergyPerToken_J =
    usage.inputTokens > 0 ? E_prefill_J / usage.inputTokens : 0;

  // Write energy per token ≈ prefill energy per token (same compute path).
  const writeEnergyPerToken_J = prefillEnergyPerToken_J;

  const E_cache_J =
    usage.cacheCreationTokens * writeEnergyPerToken_J -
    usage.cacheReadTokens * prefillEnergyPerToken_J;

  // ── Convert to Wh ───────────────────────────────────────────────
  const prefill_Wh = joulesToWh(E_prefill_J);
  const decode_Wh = joulesToWh(E_decode_J);
  const kvCache_Wh = joulesToWh(E_kv_J);
  const cacheOps_Wh = joulesToWh(E_cache_J);

  // network_Wh and embodied_Wh are calculated by their own modules;
  // this function sets them to 0 so the caller can combine results.
  const network_Wh = 0;
  const embodied_Wh = 0;

  const total_Wh =
    prefill_Wh + decode_Wh + kvCache_Wh + cacheOps_Wh + network_Wh + embodied_Wh;

  return {
    prefill_Wh,
    decode_Wh,
    kvCache_Wh,
    cacheOps_Wh,
    network_Wh,
    embodied_Wh,
    total_Wh,
  };
}
